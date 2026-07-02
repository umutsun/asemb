"""Retrieval eval runner — in-process, against the live search pipeline.

For each golden question it calls
services.semantic_search_service.SemanticSearchService.semantic_search(query,
limit=K, use_cache=False) IN-PROCESS (no HTTP hop, no result cache) and records
the rank of the first result that matches the expected law and — in fallback
matcher mode — the expected article via a content regex (Arabic-Indic digit
aware; see eval/matchers.py). In metadata mode (post Workstream A backfill) it
matches metadata.law_key / metadata.article_number instead.

Metrics: recall@1/3/5/10, MRR, per-language, per-domain, and metadata_coverage
(the fraction of retrieved top-K results whose metadata carries `law_key` — the
Workstream A backfill progress gauge; expected ~0 until the backfill lands).

Items with expected.expect_refusal=true are answer-level checks (evidence gate)
and are skipped here.

Output: console summary + JSON artifact at eval/artifacts/retrieval_<ts>.json.
Exit codes: 0 pass, 1 soft fail (per-language thresholds), 2 hard fail
(overall recall@5 / MRR below evalSettings.thresholds).

Usage (from backend/python-services, PYTHONUTF8=1):
    python -m eval.run_retrieval [--golden PATH] [--only ID] [--lang en|ar] [--k N]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from eval.config import ARTIFACTS_DIR, GOLDEN_DIR, load_eval_config
from eval.matchers import find_match_rank

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RECALL_KS = (1, 3, 5, 10)


def _load_golden(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        doc = json.load(f)
    return doc["items"]


def _recall(ranks: List[Optional[int]], k: int) -> float:
    if not ranks:
        return 0.0
    return sum(1 for r in ranks if r is not None and r <= k) / len(ranks)


def _mrr(ranks: List[Optional[int]]) -> float:
    if not ranks:
        return 0.0
    return sum((1.0 / r) for r in ranks if r is not None) / len(ranks)


def _metrics_block(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    ranks = [r["rank"] for r in rows]
    return {
        "count": len(rows),
        **{f"recall_at_{k}": round(_recall(ranks, k), 4) for k in RECALL_KS},
        "mrr": round(_mrr(ranks), 4),
    }


async def _attach_source_names(pool, results: List[Dict[str, Any]]) -> None:
    """Read-only enrichment: scored results carry a formatted title but not the
    raw source_name, which fallback-mode law matching needs (gov-services titles
    are content-derived). Batch-fetch source_name by row id from
    unified_embeddings for results that originate there."""
    ids = []
    for r in results:
        if r.get("source_name") or r.get("source_table") == "document_embeddings":
            continue
        try:
            ids.append(int(r["id"]))
        except (KeyError, TypeError, ValueError):
            continue
    if not ids:
        return
    rows = await pool.fetch(
        "SELECT id, source_name FROM unified_embeddings WHERE id = ANY($1::int[])", ids
    )
    names = {str(row["id"]): row["source_name"] for row in rows}
    for r in results:
        if not r.get("source_name") and str(r.get("id")) in names:
            r["source_name"] = names[str(r.get("id"))]


async def run(golden_path: Path, only: Optional[str], lang: Optional[str], k_override: Optional[int]) -> int:
    # services.* import deferred to runtime so `--help` works without the venv deps.
    from services.database import get_db, init_db
    from services.semantic_search_service import SemanticSearchService

    cfg = await load_eval_config()
    k = k_override or cfg.retrieval_k
    mode = cfg.matcher_mode
    thresholds = cfg.thresholds

    items = _load_golden(golden_path)
    if only:
        items = [i for i in items if i["id"] == only]
    if lang:
        items = [i for i in items if i.get("lang") == lang]
    if not items:
        sys.stderr.write("No golden items matched the filters.\n")
        return 2

    runnable = [i for i in items if not i.get("expected", {}).get("expect_refusal")]
    skipped = [i["id"] for i in items if i.get("expected", {}).get("expect_refusal")]

    await init_db()
    pool = await get_db()
    service = SemanticSearchService()

    rows: List[Dict[str, Any]] = []
    meta_cov_hits = 0
    meta_cov_total = 0

    print(f"Golden: {golden_path.name} | items: {len(runnable)} (skipped {len(skipped)} refusal items) "
          f"| K={k} | matcherMode={mode}\n")

    for item in runnable:
        expected = item["expected"]
        res = await service.semantic_search(item["question"], limit=k, use_cache=False)
        results = res.get("results", []) if res.get("success", True) else []
        await _attach_source_names(pool, results)
        rank = find_match_rank(expected, results, mode)

        for r in results:
            meta_cov_total += 1
            if isinstance(r.get("metadata"), dict) and "law_key" in r["metadata"]:
                meta_cov_hits += 1

        top = results[0] if results else None
        rows.append({
            "id": item["id"],
            "lang": item.get("lang"),
            "domain": item.get("domain"),
            "rank": rank,
            "n_results": len(results),
            "top1_title": (top.get("title") or top.get("source_name") or "")[:100] if top else None,
            "top1_score": top.get("final_score") if top else None,
            "expected_law": expected.get("law_name_contains"),
            "expected_article": expected.get("article_no"),
        })
        mark = f"rank={rank}" if rank else "MISS"
        print(f"  [{item.get('lang')}] {item['id']}: {mark}"
              + (f" (top1: {rows[-1]['top1_title'][:60]!r})" if rank != 1 and top else ""))

    overall = _metrics_block(rows)
    by_lang = {lg: _metrics_block(grp) for lg, grp in _group(rows, "lang").items()}
    by_domain = {d: _metrics_block(grp) for d, grp in _group(rows, "domain").items()}
    metadata_coverage = round(meta_cov_hits / meta_cov_total, 4) if meta_cov_total else 0.0

    print("\n=== Retrieval metrics ===")
    print(f"overall ({overall['count']} items): "
          + " ".join(f"R@{k_}={overall[f'recall_at_{k_}']:.2f}" for k_ in RECALL_KS)
          + f" MRR={overall['mrr']:.3f}")
    for lg, m in sorted(by_lang.items()):
        print(f"  lang={lg} ({m['count']}): "
              + " ".join(f"R@{k_}={m[f'recall_at_{k_}']:.2f}" for k_ in RECALL_KS)
              + f" MRR={m['mrr']:.3f}")
    for d, m in sorted(by_domain.items()):
        print(f"  domain={d} ({m['count']}): R@5={m['recall_at_5']:.2f} MRR={m['mrr']:.3f}")
    print(f"metadata_coverage (law_key in top-{k}): {metadata_coverage:.2%} "
          "(Workstream A backfill gauge — ~0 is expected pre-backfill)")

    # --- verdict from thresholds ---
    hard_fails: List[str] = []
    soft_fails: List[str] = []
    if overall["recall_at_5"] < thresholds["recallAt5"]:
        hard_fails.append(f"recall@5 {overall['recall_at_5']:.2f} < {thresholds['recallAt5']}")
    if overall["mrr"] < thresholds["mrr"]:
        hard_fails.append(f"MRR {overall['mrr']:.3f} < {thresholds['mrr']}")
    lang_r5 = {lg: m["recall_at_5"] for lg, m in by_lang.items() if m["count"] > 0}
    if lang_r5:
        if min(lang_r5.values()) < thresholds["recallAt5PerLangMin"]:
            soft_fails.append(f"per-lang recall@5 min {min(lang_r5.values()):.2f} "
                              f"< {thresholds['recallAt5PerLangMin']} ({lang_r5})")
        if len(lang_r5) > 1 and (max(lang_r5.values()) - min(lang_r5.values())) > thresholds["maxLangDelta"]:
            soft_fails.append(f"language recall@5 delta {max(lang_r5.values()) - min(lang_r5.values()):.2f} "
                              f"> {thresholds['maxLangDelta']} ({lang_r5})")

    artifact = {
        "version": 1,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "golden_path": str(golden_path),
        "matcher_mode": mode,
        "k": k,
        "filters": {"only": only, "lang": lang},
        "thresholds": thresholds,
        "overall": overall,
        "by_lang": by_lang,
        "by_domain": by_domain,
        "metadata_coverage": metadata_coverage,
        "skipped_refusal_items": skipped,
        "hard_fails": hard_fails,
        "soft_fails": soft_fails,
        "rows": rows,
    }
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = ARTIFACTS_DIR / f"retrieval_{ts}.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump(artifact, f, ensure_ascii=False, indent=2)
    print(f"\nartifact: {out}")

    if hard_fails:
        print("HARD FAIL: " + "; ".join(hard_fails))
        return 2
    if soft_fails:
        print("SOFT FAIL: " + "; ".join(soft_fails))
        return 1
    print("PASS")
    return 0


def _group(rows: List[Dict[str, Any]], key: str) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows:
        grouped[r.get(key) or "unknown"].append(r)
    return dict(grouped)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--golden", help="Golden set path (default eval/golden/<goldenSet>.json, "
                                    "falling back to the .draft.json)")
    p.add_argument("--only", help="Run a single item by id")
    p.add_argument("--lang", choices=("en", "ar"), help="Filter to one language")
    p.add_argument("--k", type=int, help="Override evalSettings.retrievalK")
    args = p.parse_args()

    async def _run() -> int:
        if args.golden:
            golden_path = Path(args.golden)
        else:
            cfg = await load_eval_config()
            final = GOLDEN_DIR / f"{cfg.golden_set}.json"
            draft = GOLDEN_DIR / f"{cfg.golden_set}.draft.json"
            golden_path = final if final.exists() else draft
        if not golden_path.exists():
            sys.stderr.write(f"Golden set not found: {golden_path} — run `python -m eval.seed_golden` first.\n")
            return 2
        return await run(golden_path, args.only, args.lang, args.k)

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
