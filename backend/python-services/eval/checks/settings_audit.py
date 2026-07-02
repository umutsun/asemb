"""Settings-vs-corpus audit.

The `settings` table carries RAG configuration that must actually fit the
corpus in `unified_embeddings`. This check catches legacy configuration drift
(e.g. Turkish citation fields configured against an English/Arabic UAE corpus):

1. Field coverage — every metadata field named in
   ragSettings.citationPriorityFields (JSON list) and ragSettings.fieldLabels
   (JSON object keys) must exist on at least 1% of unified_embeddings rows.
   A field below 1% coverage is a HARD FAIL naming the settings key and field.
2. FTS language — ragSettings.ftsLanguage is compared against the corpus
   metadata->>'lang' distribution. A configured language that covers <1% of the
   corpus is a HARD FAIL; corpus languages the configured language does not
   cover (>10% share) are WARNs (the additive search_vector_ar/_en columns may
   cover them — see RAGSettings.fts_language_ar/_en).

Read-only. Exit codes: 0 pass, 1 warnings only, 2 hard fail.

Usage (from backend/python-services, PYTHONUTF8=1):
    python -m eval.checks.settings_audit
"""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Dict, List, Tuple

import asyncpg

from eval.config import get_database_url

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

COVERAGE_FLOOR = 0.01          # a configured field must cover >= 1% of rows
UNCOVERED_LANG_WARN_SHARE = 0.10  # warn when an uncovered corpus language exceeds 10%

FIELD_SETTINGS_KEYS = (
    "ragSettings.citationPriorityFields",  # JSON list of metadata field names
    "ragSettings.fieldLabels",             # JSON object: field name -> label
)
FTS_SETTING_KEY = "ragSettings.ftsLanguage"

# Postgres regconfig name -> corpus metadata->>'lang' code
FTS_TO_LANG_CODE = {
    "english": "en",
    "arabic": "ar",
    "turkish": "tr",
    "german": "de",
    "french": "fr",
    "simple": None,  # language-neutral; cannot mismatch
}


def _parse_fields(key: str, raw: str) -> List[str]:
    data = json.loads(raw)
    if isinstance(data, list):
        return [str(f) for f in data]
    if isinstance(data, dict):
        return [str(f) for f in data.keys()]
    raise ValueError(f"settings row '{key}' is neither a JSON list nor object")


async def audit(conn: asyncpg.Connection) -> Tuple[List[str], List[str], List[str]]:
    """Returns (fail_lines, warn_lines, pass_lines)."""
    fails: List[str] = []
    warns: List[str] = []
    passes: List[str] = []

    total = await conn.fetchval("SELECT count(*) FROM unified_embeddings")
    if not total:
        return (["FAIL unified_embeddings is empty — nothing to audit against"], [], [])

    # 1) metadata field coverage for configured citation/label fields
    for key in FIELD_SETTINGS_KEYS:
        raw = await conn.fetchval("SELECT value FROM settings WHERE key = $1", key)
        if raw is None:
            warns.append(f"WARN settings row '{key}' not found — skipping field coverage check")
            continue
        try:
            fields = _parse_fields(key, raw)
        except (json.JSONDecodeError, ValueError) as exc:
            fails.append(f"FAIL settings row '{key}' is not valid JSON: {exc}")
            continue
        for field in fields:
            count = await conn.fetchval(
                "SELECT count(*) FROM unified_embeddings WHERE metadata ? $1", field
            )
            coverage = count / total
            line = (f"{key} field '{field}': {count}/{total} rows ({coverage:.2%})")
            if coverage < COVERAGE_FLOOR:
                fails.append(f"FAIL {line} — below {COVERAGE_FLOOR:.0%} coverage; this field does "
                             "not exist in the current corpus metadata")
            else:
                passes.append(f"PASS {line}")

    # 2) FTS language vs corpus language distribution
    fts_raw = await conn.fetchval("SELECT value FROM settings WHERE key = $1", FTS_SETTING_KEY)
    if fts_raw is None:
        warns.append(f"WARN settings row '{FTS_SETTING_KEY}' not found — skipping FTS language check")
    else:
        fts_lang = fts_raw.strip().strip('"').lower()
        rows = await conn.fetch(
            "SELECT COALESCE(metadata->>'lang', 'unknown') AS lang, count(*) AS n "
            "FROM unified_embeddings GROUP BY 1 ORDER BY 2 DESC"
        )
        dist: Dict[str, float] = {r["lang"]: r["n"] / total for r in rows}
        dist_str = ", ".join(f"{lg}={share:.1%}" for lg, share in dist.items())
        code = FTS_TO_LANG_CODE.get(fts_lang, fts_lang)
        if code is None:
            passes.append(f"PASS {FTS_SETTING_KEY}='{fts_lang}' is language-neutral (corpus: {dist_str})")
        else:
            own_share = dist.get(code, 0.0)
            if own_share < COVERAGE_FLOOR:
                fails.append(
                    f"FAIL {FTS_SETTING_KEY}='{fts_lang}' targets lang '{code}' which covers "
                    f"{own_share:.2%} of the corpus (corpus: {dist_str}) — BM25 tsquery language "
                    "does not match the indexed content"
                )
            else:
                passes.append(f"PASS {FTS_SETTING_KEY}='{fts_lang}' covers {own_share:.1%} of the corpus")
            for lg, share in dist.items():
                if lg != code and lg != "unknown" and share > UNCOVERED_LANG_WARN_SHARE:
                    warns.append(
                        f"WARN corpus lang '{lg}' ({share:.1%} of rows) is not covered by "
                        f"{FTS_SETTING_KEY}='{fts_lang}' — verify the additive search_vector "
                        "column/config for that language (RAGSettings.fts_language_ar/_en)"
                    )

    return fails, warns, passes


async def _run() -> int:
    conn = await asyncpg.connect(get_database_url())
    try:
        db = await conn.fetchval("SELECT current_database()")
        print(f"settings audit against DB: {db}\n")
        fails, warns, passes = await audit(conn)
    finally:
        await conn.close()

    for line in passes + warns + fails:
        print(line)
    print(f"\nResult: {len(passes)} pass, {len(warns)} warn, {len(fails)} fail")
    if fails:
        return 2
    if warns:
        return 1
    return 0


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
