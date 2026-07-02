"""Drive a knowledge-graph relationship-extraction batch from the CLI.

Wraps RelationshipExtractionService.extract_batch (the same code path the
/api/v2/relationships/extract-batch endpoint uses) so a long corpus run can
execute from the dev machine without the FastAPI process. Polls the
extraction_jobs row until the job finishes and prints a summary.

Safety: refuses to run unless the connected database is bookie_lsemb (the
extraction writes chunk_entities/chunk_relationships).

Usage (from backend/python-services):
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/run_relationship_extraction.py \
      --source-table uae_legislation [--limit 50] [--force] [--resolve]
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env.lsemb")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.database import init_db, close_db, get_db  # noqa: E402
from services.relationship_extraction_service import get_relationship_extraction_service  # noqa: E402


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source-table", default="uae_legislation")
    ap.add_argument("--limit", type=int, default=0, help="cap chunks (pilot runs)")
    ap.add_argument("--force", action="store_true",
                    help="force_reprocess: re-extract chunks that already have entities")
    ap.add_argument("--resolve", action="store_true",
                    help="run the reference-resolution pass after extraction")
    ap.add_argument("--poll-seconds", type=int, default=15)
    args = ap.parse_args()

    await init_db()
    pool = await get_db()
    try:
        db = await pool.fetchval("SELECT current_database()")
        print(f"connected DB: {db}")
        if db != "bookie_lsemb":
            print("ABORT: not bookie_lsemb — refusing to write")
            return 2

        service = get_relationship_extraction_service()
        result = await service.extract_batch(
            source_table=args.source_table,
            limit=args.limit or None,
            force_reprocess=args.force,
        )
        job_id = result["job_id"]
        print(f"job {job_id}: {result['total_chunks']} chunks queued")

        while True:
            await asyncio.sleep(args.poll_seconds)
            row = await pool.fetchrow(
                """SELECT status, processed_chunks, failed_chunks, total_chunks,
                          relationships_found, entities_found
                   FROM extraction_jobs WHERE job_id = $1""", job_id)
            if not row:
                print("job row missing — aborting")
                return 2
            print(f"  {row['status']}: {row['processed_chunks']}/{row['total_chunks']} "
                  f"(failed {row['failed_chunks']}, rels {row['relationships_found']}, "
                  f"entities {row['entities_found']})")
            if row["status"] in ("completed", "failed", "cancelled"):
                break

        if args.resolve:
            print("resolution pass (dry-run first)...")
            dry = await service.resolve_references(dry_run=True)
            print(f"  resolvable: {dry}")
            wet = await service.resolve_references(dry_run=False)
            print(f"  resolved: {wet}")

        return 0 if row["status"] == "completed" else 1
    finally:
        await close_db()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
