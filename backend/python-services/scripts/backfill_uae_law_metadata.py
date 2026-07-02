"""Backfill structured law metadata onto existing uae_legislation chunks.

Adds (additively, via ``metadata = metadata || $patch``) the structured fields
the citation UI, dedup, graph grouping and reference resolver need:

    law_key, law_type, law_number, law_year, law_title, parent_law_key,
    article_number, article_number_source ('header' | 'inherited'),
    issue_date, meta_backfill_version

Existing metadata keys (law, lang, url, article_index, ...) are never touched.

Resolution strategy (never guess):
  Pass 1 (law level)  : parse the stored law NAME; if that yields no law_key,
                        parse the first chunks' CONTENT (bidi-tolerant Arabic).
                        Laws that still resolve nothing get no law_key and are
                        listed in the review CSV as gaps.
  Pass 2 (chunk level): article_number from the chunk head; continuation
                        chunks (split articles) inherit the previous chunk's
                        article number within the same (law, lang).

Safety: read-only by default (--dry-run implicit). Writing requires --apply
and the connected database being bookie_lsemb. Batched 500 rows/transaction
(each UPDATE recomputes 3 generated tsvector columns — keep lock windows
small on the shared live DB). Idempotent: rows already stamped with the
current meta_backfill_version are skipped unless --force.

Usage (from backend/python-services):
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/backfill_uae_law_metadata.py \
      [--apply] [--limit N] [--force] [--report path/to/review.csv]
"""
import argparse
import asyncio
import csv
import json
import os
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env.lsemb")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.law_metadata_parser import (  # noqa: E402
    extract_article_number,
    load_patterns_from_settings,
    parse_issue_date,
    parse_law_from_content,
    parse_law_name,
)

DATABASE_URL = os.environ["DATABASE_URL"]
SOURCE_TABLE = "uae_legislation"
BACKFILL_VERSION = 1
BATCH_SIZE = 500

LAW_LEVEL_KEYS = (
    "law_key", "law_type", "law_number", "law_year", "law_title",
    "parent_law_key", "issue_date", "confidence",
)


async def resolve_laws(conn, patterns):
    """Pass 1: one resolution per (law name, lang)."""
    rows = await conn.fetch(
        """SELECT metadata->>'law' AS law, metadata->>'lang' AS lang,
                  count(*) AS chunks
           FROM unified_embeddings
           WHERE source_table = $1 AND metadata ? 'law'
           GROUP BY 1, 2 ORDER BY 1, 2""",
        SOURCE_TABLE,
    )
    resolutions = {}
    for r in rows:
        law, lang = r["law"], (r["lang"] or "en")
        parsed = parse_law_name(law, patterns)
        if not parsed.get("law_key"):
            head = await conn.fetchval(
                """SELECT string_agg(left(content, 800), E'\n' ORDER BY (metadata->>'article_index')::int)
                   FROM unified_embeddings
                   WHERE source_table = $1 AND metadata->>'law' = $2
                     AND metadata->>'lang' = $3
                     AND (metadata->>'article_index')::int <= 1""",
                SOURCE_TABLE, law, lang,
            )
            fallback = parse_law_from_content(head or "", lang, patterns)
            # Content may supply the missing number/year while the name still
            # provides the better type/title — merge, content fills gaps only.
            # The fallback's own key/confidence must never be copied wholesale:
            # the merged fields may differ, and a content number contradicting
            # the name's number means the header text is citing ANOTHER law.
            fallback.pop("law_key", None)
            fallback.pop("confidence", None)
            name_num = parsed.get("law_number")
            if name_num and fallback.get("law_number") not in (None, name_num):
                fallback = {}
            for k, v in fallback.items():
                parsed.setdefault(k, v)
            lt, num, yr = parsed.get("law_type"), parsed.get("law_number"), parsed.get("law_year")
            if lt and num and yr and not parsed.get("law_key"):
                parsed["law_key"] = f"{lt}:{num}:{yr}"
                parsed["confidence"] = "content"
        # Best-effort issue date from the law's opening text (never guessed).
        if parsed.get("law_key"):
            head0 = await conn.fetchval(
                """SELECT left(content, 1500) FROM unified_embeddings
                   WHERE source_table = $1 AND metadata->>'law' = $2
                     AND metadata->>'lang' = $3
                   ORDER BY (metadata->>'article_index')::int LIMIT 1""",
                SOURCE_TABLE, law, lang,
            )
            date = parse_issue_date(head0 or "", lang)
            if date:
                parsed["issue_date"] = date
        resolutions[(law, lang)] = {"chunks": r["chunks"], **parsed}

    _reconcile_generic_decisions(resolutions)
    return resolutions


def _reconcile_generic_decisions(resolutions):
    """Upgrade generic 'decision:N:Y' keys to a specific decision type when
    exactly one specific type with the same number/year exists in the corpus
    (the EN name says "Ministerial Decision No. 116 of 2023", the AR name is
    an opaque filename resolved from content as plain 'decision') — otherwise
    EN<->AR pairing reports false gaps."""
    specific_by_ny = defaultdict(set)
    for res in resolutions.values():
        lt = res.get("law_type")
        if lt and lt != "decision" and lt.endswith("_decision"):
            specific_by_ny[(res.get("law_number"), res.get("law_year"))].add(lt)
    for res in resolutions.values():
        if res.get("law_type") == "decision" and res.get("law_key"):
            types = specific_by_ny.get((res["law_number"], res["law_year"]), set())
            if len(types) == 1:
                lt = next(iter(types))
                res["law_type"] = lt
                res["law_key"] = f"{lt}:{res['law_number']}:{res['law_year']}"
                res["law_meta_reconciled"] = True


def build_law_patch(res):
    patch = {}
    for key in LAW_LEVEL_KEYS:
        if key == "confidence":
            continue
        if res.get(key):
            patch[key] = res[key]
    if res.get("confidence"):
        patch["law_meta_source"] = res["confidence"]
    return patch


async def backfill_chunks(conn, resolutions, patterns, apply, limit, force=False):
    """Pass 2: per-chunk article numbers + combined patch write."""
    rows = await conn.fetch(
        """SELECT id, metadata->>'law' AS law, metadata->>'lang' AS lang,
                  (metadata->>'article_index')::int AS article_index,
                  left(content, 200) AS head,
                  COALESCE((metadata->>'meta_backfill_version')::int, 0) AS ver
           FROM unified_embeddings
           WHERE source_table = $1 AND metadata ? 'law'
           ORDER BY metadata->>'law', metadata->>'lang',
                    (metadata->>'article_index')::int""",
        SOURCE_TABLE,
    )
    updates = []  # (id, patch_json)
    stats = defaultdict(int)
    law_chunks = defaultdict(int)      # (law, lang) -> chunk count
    law_articled = defaultdict(int)    # (law, lang) -> chunks with article_number
    current = None  # (law, lang)
    last_article = None
    for r in rows:
        key = (r["law"], (r["lang"] or "en"))
        if key != current:
            current, last_article = key, None
        res = resolutions.get(key, {})
        patch = build_law_patch(res)
        law_chunks[key] += 1

        article = extract_article_number(r["head"] or "", key[1], patterns)
        if article:
            patch["article_number"] = article
            patch["article_number_source"] = "header"
            last_article = article
            stats["article_header"] += 1
            law_articled[key] += 1
        elif last_article:
            patch["article_number"] = last_article
            patch["article_number_source"] = "inherited"
            stats["article_inherited"] += 1
            law_articled[key] += 1
        else:
            stats["article_none"] += 1  # front matter, or a law with no article structure

        if res.get("law_key"):
            stats["chunks_with_key"] += 1
        else:
            stats["chunks_without_key"] += 1

        if not force and r["ver"] >= BACKFILL_VERSION:
            stats["skipped_already_done"] += 1
            continue
        patch["meta_backfill_version"] = BACKFILL_VERSION
        updates.append((r["id"], json.dumps(patch, ensure_ascii=False)))
        if limit and len(updates) >= limit:
            break

    stats["total_rows"] = len(rows)
    stats["to_update"] = len(updates)

    # Distinguish "extraction misses" from "document has no article structure":
    # coverage within laws where at least one header was found.
    structured = [k for k, n in law_articled.items() if n > 0]
    st_total = sum(law_chunks[k] for k in structured)
    st_hit = sum(law_articled[k] for k in structured)
    stats["laws_article_structured"] = len(structured)
    stats["laws_without_articles"] = len(law_chunks) - len(structured)
    if st_total:
        stats["article_cov_structured_pct"] = round(st_hit / st_total * 100, 1)

    if apply and updates:
        written = 0
        for i in range(0, len(updates), BATCH_SIZE):
            batch = updates[i:i + BATCH_SIZE]
            async with conn.transaction():
                await conn.executemany(
                    """UPDATE unified_embeddings
                       SET metadata = metadata || $2::jsonb, updated_at = now()
                       WHERE id = $1 AND source_table = '""" + SOURCE_TABLE + "'",
                    batch,
                )
            written += len(batch)
            print(f"  applied {written}/{len(updates)}")
        stats["written"] = written
    return stats


def write_review_csv(path, resolutions):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["law_name", "lang", "chunks", "law_key", "law_type",
                    "law_number", "law_year", "law_title", "parent_law_key",
                    "issue_date", "resolved_from"])
        for (law, lang), res in sorted(resolutions.items()):
            w.writerow([law, lang, res.get("chunks"), res.get("law_key", ""),
                        res.get("law_type", ""), res.get("law_number", ""),
                        res.get("law_year", ""), res.get("law_title", ""),
                        res.get("parent_law_key", ""), res.get("issue_date", ""),
                        res.get("confidence", "UNRESOLVED")])


def pairing_report(resolutions):
    """law_keys present in only one language = ingest gaps."""
    langs_by_key = defaultdict(set)
    for (_, lang), res in resolutions.items():
        if res.get("law_key"):
            langs_by_key[res["law_key"]].add(lang)
    return {k: sorted(v) for k, v in langs_by_key.items() if len(v) < 2}


async def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="write changes (default is dry-run)")
    ap.add_argument("--limit", type=int, default=0,
                    help="cap the number of rows to update (pilot runs)")
    ap.add_argument("--force", action="store_true",
                    help="re-stamp rows already at the current backfill version")
    ap.add_argument("--report", default=os.path.join(
        tempfile.gettempdir(), "backfill_uae_law_metadata_review.csv"))
    args = ap.parse_args()

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        db = await conn.fetchval("SELECT current_database()")
        print(f"connected DB: {db} | mode: {'APPLY' if args.apply else 'DRY-RUN'}")
        if args.apply and db != "bookie_lsemb":
            print("ABORT: not bookie_lsemb — refusing to write")
            return 2

        patterns = await load_patterns_from_settings(conn)

        print("pass 1: resolving laws...")
        resolutions = await resolve_laws(conn, patterns)
        resolved = sum(1 for r in resolutions.values() if r.get("law_key"))
        by_name = sum(1 for r in resolutions.values() if r.get("confidence") == "name")
        by_content = sum(1 for r in resolutions.values() if r.get("confidence") == "content")
        print(f"  laws (name,lang): {len(resolutions)} | resolved: {resolved} "
              f"(name: {by_name}, content: {by_content}) | "
              f"unresolved: {len(resolutions) - resolved}")

        write_review_csv(args.report, resolutions)
        print(f"  review CSV: {args.report}")

        gaps = pairing_report(resolutions)
        print(f"  EN<->AR pairing gaps (law_key in one lang only): {len(gaps)}")
        for k, langs in sorted(gaps.items())[:15]:
            print(f"    {k} -> only {','.join(langs)}")
        if len(gaps) > 15:
            print(f"    ... and {len(gaps) - 15} more (see review CSV)")

        print("pass 2: chunk-level article numbers"
              + (" + writing patches..." if args.apply else " (dry-run, no writes)..."))
        stats = await backfill_chunks(conn, resolutions, patterns, args.apply,
                                      args.limit, force=args.force)
        for k in ("total_rows", "chunks_with_key", "chunks_without_key",
                  "article_header", "article_inherited", "article_none",
                  "laws_article_structured", "laws_without_articles",
                  "article_cov_structured_pct",
                  "skipped_already_done", "to_update", "written"):
            if k in stats:
                print(f"  {k}: {stats[k]}")

        total = max(stats["total_rows"], 1)
        key_cov = stats["chunks_with_key"] / total * 100
        art_cov = (stats["article_header"] + stats["article_inherited"]) / total * 100
        print(f"  coverage: law_key {key_cov:.1f}% | article_number {art_cov:.1f}%")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
