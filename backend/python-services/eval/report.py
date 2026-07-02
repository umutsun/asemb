"""Eval run persistence + artifact writer.

Shared by run_retrieval.py / run_all.py:
- write_artifact()  writes the JSON artifact under eval/artifacts/
- persist_run()     inserts one eval_runs row plus per-item eval_results rows,
                    skipping the DB gracefully (warning, no raise) when the
                    tables from 20260702_eval_runs.sql are not applied yet —
                    the artifact + exit code stay the source of truth
- exit_code()       maps hard/soft failures onto the eval exit-code convention
                    (0 pass / 1 soft fail / 2 hard fail)
- git_sha()         current commit for run provenance

No mocks: when the DB is unavailable the caller sees an explicit warning and a
None run id, never a fake success.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import asyncpg

from eval.config import ARTIFACTS_DIR, REPO_ROOT, get_database_url


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def write_artifact(prefix: str, artifact: Dict[str, Any]) -> Path:
    """Write the artifact JSON to eval/artifacts/<prefix>_<utc ts>.json."""
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = utc_now().strftime("%Y%m%dT%H%M%SZ")
    out = ARTIFACTS_DIR / f"{prefix}_{ts}.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump(artifact, f, ensure_ascii=False, indent=2, default=str)
    return out


def exit_code(hard_fails: List[str], soft_fails: List[str]) -> int:
    """0 pass, 1 soft fail, 2 hard fail (existing eval convention)."""
    if hard_fails:
        return 2
    if soft_fails:
        return 1
    return 0


def git_sha() -> Optional[str]:
    """Current repo HEAD sha, or None outside a git checkout / without git."""
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=str(REPO_ROOT),
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return sha or None
    except Exception:
        return None


def _warn(msg: str) -> None:
    sys.stderr.write(f"WARN: {msg}\n")


async def persist_run(
    *,
    kind: str,
    golden_set: str,
    config: Dict[str, Any],
    summary: Dict[str, Any],
    results: List[Dict[str, Any]],
    started_at: datetime,
    finished_at: Optional[datetime] = None,
    total_cost_usd: Optional[float] = None,
    conn: Optional[asyncpg.Connection] = None,
) -> Optional[str]:
    """Insert one eval_runs row and its eval_results rows.

    Each item of `results` may carry: question_id, lang, passed (bool|None),
    metrics (dict), answer (str), sources (list), error (str).

    Returns the run id, or None when the eval tables are absent or the DB is
    unreachable — with a loud warning, so runs never fail just because the
    20260702_eval_runs.sql migration has not been applied.
    """
    own = conn is None
    try:
        if own:
            conn = await asyncpg.connect(get_database_url())
        has_tables = await conn.fetchval("SELECT to_regclass('eval_runs') IS NOT NULL")
        if not has_tables:
            _warn(
                "eval_runs table not found - skipping DB persistence "
                "(apply backend/database/migrations/20260702_eval_runs.sql)"
            )
            return None
        run_id = await conn.fetchval(
            "INSERT INTO eval_runs "
            "(started_at, finished_at, kind, golden_set, git_sha, config, summary, total_cost_usd) "
            "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8) RETURNING id",
            started_at,
            finished_at or utc_now(),
            kind,
            golden_set,
            git_sha(),
            json.dumps(config, ensure_ascii=False, default=str),
            json.dumps(summary, ensure_ascii=False, default=str),
            total_cost_usd,
        )
        for r in results:
            sources = r.get("sources")
            await conn.execute(
                "INSERT INTO eval_results "
                "(run_id, question_id, lang, passed, metrics, answer, sources, error) "
                "VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8)",
                run_id,
                r.get("question_id"),
                r.get("lang"),
                r.get("passed"),
                json.dumps(r.get("metrics") or {}, ensure_ascii=False, default=str),
                r.get("answer"),
                json.dumps(sources, ensure_ascii=False, default=str) if sources is not None else None,
                r.get("error"),
            )
        return str(run_id)
    except Exception as e:
        _warn(f"eval run persistence failed ({type(e).__name__}: {e}) - continuing without DB row")
        return None
    finally:
        if own and conn is not None:
            await conn.close()
