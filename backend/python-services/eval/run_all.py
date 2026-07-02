"""Full eval orchestrator: retrieval -> answers (+ checks + judge) -> report.

Stages:
1. retrieval — always runs, in-process (eval.run_retrieval.run_scored).
2. answers   — only when EVAL_CHAT_TOKEN is set AND the backend chat endpoint
   is reachable. Per golden item: run.py's chat helper (with
   debugSanitizer=true so _debug.sanitizerReport comes back), the deterministic
   expectation checks, then eval.checks citations / markdown_lint / language,
   and — when an OpenAI key resolves — the groundedness judge
   (eval.checks.judge, batched).
3. report    — one combined artifact (eval/artifacts/full_<ts>.json) plus an
   eval_runs row with per-item eval_results (skipped gracefully when the
   20260702_eval_runs.sql tables are absent).

Skipped stages are logged loudly with the reason. A skipped answer stage does
NOT fail the run by itself — its thresholds simply cannot be evaluated and are
reported as skipped; the exit code then comes from the retrieval stage alone.
When the answer stage runs, threshold severities are:
- hard (exit 2): deterministic expectation failures, citationValidity,
  groundednessMean (only when the judge ran)
- soft (exit 1): markdownLintErrors, languageMatch

Exit code: max(retrieval, answers) using the 0/1/2 convention.

Usage (from backend/python-services, PYTHONUTF8=1):
    EVAL_CHAT_TOKEN=<jwt> python -m eval.run_all [--golden PATH] [--only ID]
        [--lang en|ar] [--k N] [--skip-answers] [--skip-judge]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from eval import report
from eval import run as answer_runner
from eval import run_retrieval
from eval.checks.citations import check_citations
from eval.checks.judge import judge_many
from eval.checks.language import check_language
from eval.checks.markdown_lint import lint_markdown
from eval.config import GOLDEN_DIR, load_eval_config, resolve_openai_key

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


async def _backend_reachable(chat_url: str) -> bool:
    """Any HTTP response (even 401/404) counts as reachable; only transport
    errors (connection refused, DNS, timeout) mean the backend is down."""
    parsed = urlparse(chat_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.get(base + "/health")
        return True
    except httpx.TransportError:
        return False
    except httpx.HTTPError:
        return True


def _load_items(golden_path: Path, only: Optional[str], lang: Optional[str]) -> List[Dict[str, Any]]:
    import json

    with golden_path.open("r", encoding="utf-8") as f:
        items = json.load(f)["items"]
    if only:
        items = [i for i in items if i["id"] == only]
    if lang:
        items = [i for i in items if i.get("lang") == lang]
    return items


async def _run_answer_stage(
    items: List[Dict[str, Any]],
    cfg,
    token: str,
    skip_judge: bool,
) -> Dict[str, Any]:
    """Answer stage: chat calls + deterministic checks + checks 3-6."""
    url = cfg.chat_url
    per_item: List[Dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        for item in items:
            out = await answer_runner._call_chat(
                client, url, token, item, extra_payload={"debugSanitizer": True}
            )
            entry: Dict[str, Any] = {
                "id": item["id"],
                "lang": item.get("lang"),
                "output": out,
                "deterministic_failures": answer_runner._check_item(item, out),
            }
            if out.get("ok"):
                answer = out.get("answer", "")
                sources = out.get("sources", [])
                entry["checks"] = {
                    "citations": check_citations(answer, sources, item.get("expected")),
                    "markdown": lint_markdown(answer),
                    "language": check_language(answer, item.get("lang")),
                }
                # Sanitizer outcome from the backend, when debugSanitizer was honored
                entry["sanitizer_report"] = (out.get("debug") or {}).get("sanitizerReport")
            per_item.append(entry)
            status = "OK" if not entry["deterministic_failures"] else "FAIL"
            print(f"  [{status}] {item['id']} ({out.get('latency_ms')}ms)"
                  + (f" -> {'; '.join(entry['deterministic_failures'])}"
                     if entry["deterministic_failures"] else ""))

    # Judge stage (batched); skipped honestly when no key resolves.
    judge_skipped_reason: Optional[str] = None
    if skip_judge:
        judge_skipped_reason = "--skip-judge flag"
    else:
        api_key = await resolve_openai_key()
        if not api_key:
            judge_skipped_reason = ("no OpenAI key (settings 'openai.apiKey' or env "
                                    "OPENAI_API_KEY) - groundedness not scored")
        else:
            judged_entries = [e for e in per_item if e["output"].get("ok")]
            if judged_entries:
                items_by_id = {i["id"]: i for i in items}
                verdicts = await judge_many(
                    [
                        {
                            "question": items_by_id[e["id"]]["question"],
                            "answer": e["output"].get("answer", ""),
                            "sources": e["output"].get("sources", []),
                        }
                        for e in judged_entries
                    ],
                    api_key=api_key,
                    model=cfg.judge_model,
                    prompt=cfg.judge_prompt,
                )
                for entry, verdict in zip(judged_entries, verdicts):
                    entry["judge"] = verdict
    if judge_skipped_reason:
        print(f"SKIP judge stage: {judge_skipped_reason}")

    # ---- aggregate metrics ----
    answered = [e for e in per_item if e["output"].get("ok")]
    n_det_fail = sum(1 for e in per_item if e["deterministic_failures"])
    citation_ok = [e for e in answered if e["checks"]["citations"]["valid"]]
    lint_errors = sum(e["checks"]["markdown"]["error_count"] for e in answered)
    lang_ok = [e for e in answered if e["checks"]["language"]["matches"]]
    judged = [e for e in per_item if isinstance(e.get("judge"), dict) and e["judge"].get("ok")]
    grounded_scores = [e["judge"]["verdict"]["grounded"] / 2.0 for e in judged]

    summary: Dict[str, Any] = {
        "items": len(per_item),
        "answered": len(answered),
        "call_failures": len(per_item) - len(answered),
        "deterministic_failures": n_det_fail,
        "citation_validity": round(len(citation_ok) / len(answered), 4) if answered else None,
        "markdown_lint_errors": lint_errors,
        "language_match": round(len(lang_ok) / len(answered), 4) if answered else None,
        "judged": len(judged),
        "groundedness_mean": (round(sum(grounded_scores) / len(grounded_scores), 4)
                              if grounded_scores else None),
        "judge_skipped_reason": judge_skipped_reason,
        "sanitizer_reports_present": sum(1 for e in per_item if e.get("sanitizer_report")),
    }

    # ---- threshold verdicts ----
    thresholds = cfg.thresholds
    hard_fails: List[str] = []
    soft_fails: List[str] = []
    if n_det_fail:
        hard_fails.append(f"{n_det_fail} item(s) failed deterministic answer checks")
    if answered and summary["citation_validity"] is not None \
            and summary["citation_validity"] < thresholds["citationValidity"]:
        hard_fails.append(f"citation validity {summary['citation_validity']:.2f} "
                          f"< {thresholds['citationValidity']}")
    if grounded_scores and summary["groundedness_mean"] < thresholds["groundednessMean"]:
        hard_fails.append(f"groundedness mean {summary['groundedness_mean']:.2f} "
                          f"< {thresholds['groundednessMean']}")
    if lint_errors > thresholds["markdownLintErrors"]:
        soft_fails.append(f"markdown lint errors {lint_errors} "
                          f"> {thresholds['markdownLintErrors']}")
    if answered and summary["language_match"] is not None \
            and summary["language_match"] < thresholds["languageMatch"]:
        soft_fails.append(f"language match {summary['language_match']:.2f} "
                          f"< {thresholds['languageMatch']}")

    summary["hard_fails"] = hard_fails
    summary["soft_fails"] = soft_fails
    return {"summary": summary, "per_item": per_item,
            "exit_code": report.exit_code(hard_fails, soft_fails)}


async def run_all(golden_path: Path, only: Optional[str], lang: Optional[str],
                  k_override: Optional[int], skip_answers: bool, skip_judge: bool) -> int:
    started_at = report.utc_now()
    cfg = await load_eval_config()

    # ---- stage 1: retrieval (persist=False; the combined run is persisted below) ----
    print("=== Stage 1/3: retrieval ===")
    retrieval_code, retrieval_artifact = await run_retrieval.run_scored(
        golden_path, only, lang, k_override, persist=False
    )

    # ---- stage 2: answers ----
    answers_block: Optional[Dict[str, Any]] = None
    answers_code = 0
    skipped_stages: List[str] = []
    token = os.environ.get("EVAL_CHAT_TOKEN", "").strip()
    if skip_answers:
        skipped_stages.append("answers: --skip-answers flag")
    elif not token:
        skipped_stages.append("answers: EVAL_CHAT_TOKEN not set (the chat endpoint requires a JWT)")
    elif not await _backend_reachable(cfg.chat_url):
        skipped_stages.append(f"answers: backend not reachable at {cfg.chat_url}")
    if skipped_stages:
        for s in skipped_stages:
            print(f"SKIP {s}")
        print("NOTE: answer-level thresholds (citationValidity, markdownLintErrors, "
              "languageMatch, groundednessMean) were NOT evaluated in this run.")
    else:
        print(f"\n=== Stage 2/3: answers via {cfg.chat_url} ===")
        items = _load_items(golden_path, only, lang)
        answers_block = await _run_answer_stage(items, cfg, token, skip_judge)
        answers_code = answers_block["exit_code"]

    # ---- stage 3: report ----
    print("\n=== Stage 3/3: report ===")
    hard_fails = list(retrieval_artifact.get("hard_fails") or [])
    soft_fails = list(retrieval_artifact.get("soft_fails") or [])
    if answers_block:
        hard_fails += answers_block["summary"]["hard_fails"]
        soft_fails += answers_block["summary"]["soft_fails"]

    artifact = {
        "version": 1,
        "captured_at": report.utc_now().isoformat(),
        "golden_path": str(golden_path),
        "filters": {"only": only, "lang": lang},
        "skipped_stages": skipped_stages,
        "retrieval": retrieval_artifact,
        "answers": answers_block,
        "hard_fails": hard_fails,
        "soft_fails": soft_fails,
    }
    out = report.write_artifact("full", artifact)
    print(f"artifact: {out}")

    results_rows: List[Dict[str, Any]] = []
    if answers_block:
        for e in answers_block["per_item"]:
            output = e["output"]
            results_rows.append({
                "question_id": e["id"],
                "lang": e.get("lang"),
                "passed": output.get("ok", False) and not e["deterministic_failures"]
                          and (not e.get("checks") or e["checks"]["citations"]["valid"]),
                "metrics": {
                    "deterministic_failures": e["deterministic_failures"],
                    "checks": e.get("checks"),
                    "judge": (e.get("judge") or {}).get("verdict"),
                    "sanitizer_report": e.get("sanitizer_report"),
                    "latency_ms": output.get("latency_ms"),
                },
                "answer": output.get("answer"),
                "sources": output.get("sources"),
                "error": output.get("error"),
            })
    else:
        for r in retrieval_artifact.get("rows", []):
            results_rows.append({
                "question_id": r["id"],
                "lang": r.get("lang"),
                "passed": r["rank"] is not None and r["rank"] <= 5,
                "metrics": {"rank": r["rank"], "n_results": r["n_results"]},
            })

    run_id = await report.persist_run(
        kind="full" if answers_block else "retrieval",
        golden_set=golden_path.stem,
        config={"k": retrieval_artifact.get("k"),
                "matcher_mode": retrieval_artifact.get("matcher_mode"),
                "thresholds": cfg.thresholds,
                "chat_url": cfg.chat_url,
                "judge_model": cfg.judge_model,
                "filters": {"only": only, "lang": lang},
                "skipped_stages": skipped_stages},
        summary={"retrieval": {"overall": retrieval_artifact.get("overall"),
                               "by_lang": retrieval_artifact.get("by_lang"),
                               "metadata_coverage": retrieval_artifact.get("metadata_coverage")},
                 "answers": answers_block["summary"] if answers_block else None,
                 "hard_fails": hard_fails,
                 "soft_fails": soft_fails},
        results=results_rows,
        started_at=started_at,
    )
    if run_id:
        print(f"eval_runs id: {run_id}")

    code = max(retrieval_code, answers_code)
    verdict = {0: "PASS", 1: "SOFT FAIL", 2: "HARD FAIL"}[code]
    print(f"\n=== run_all verdict: {verdict} (retrieval={retrieval_code}, "
          f"answers={answers_code if answers_block else 'skipped'}) ===")
    if hard_fails:
        print("hard fails: " + "; ".join(hard_fails))
    if soft_fails:
        print("soft fails: " + "; ".join(soft_fails))
    return code


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--golden", help="Golden set path (default eval/golden/<goldenSet>.json "
                                    "or its .draft.json)")
    p.add_argument("--only", help="Run a single item by id")
    p.add_argument("--lang", choices=("en", "ar"), help="Filter to one language")
    p.add_argument("--k", type=int, help="Override evalSettings.retrievalK")
    p.add_argument("--skip-answers", action="store_true",
                   help="Run only the retrieval stage")
    p.add_argument("--skip-judge", action="store_true",
                   help="Run the answer stage without the LLM judge")
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
            sys.stderr.write(f"Golden set not found: {golden_path} — "
                             "run `python -m eval.seed_golden` first.\n")
            return 2
        return await run_all(golden_path, args.only, args.lang, args.k,
                             args.skip_answers, args.skip_judge)

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
