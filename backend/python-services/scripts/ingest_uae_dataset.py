"""
Batch UAE-law ingest driver -> bookie_lsemb.unified_embeddings.

Reads a JSON manifest (a list of laws) and ingests each via ingest_uae_law.ingest_law
(download PDF -> article-aware chunk -> embed -> insert, idempotent per source_name).
Per-law failures are logged and skipped; the run continues. Prints a summary and a
final per-language row count.

Manifest format (JSON array):
  [
    {"url": "https://.../labour-law-ar.pdf", "name": "UAE Labour Law (Federal Decree-Law 33/2021) — AR", "lang": "ar"},
    {"url": "https://.../labour-law-en.pdf", "name": "UAE Labour Law (Federal Decree-Law 33/2021) — EN", "lang": "en"}
  ]

Usage:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/ingest_uae_dataset.py scripts/uae_laws_manifest.json
"""
import os, sys, json, asyncio
from pathlib import Path

# Make sibling module importable whether run from scripts/ or python-services/.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest_uae_law import ingest_law, DATABASE_URL  # noqa: E402
import asyncpg  # noqa: E402


async def run(manifest_path):
    laws = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if not isinstance(laws, list) or not laws:
        print(f"ABORT: manifest {manifest_path} is empty or not a JSON array")
        return

    print(f"manifest: {manifest_path} | {len(laws)} laws")
    results = []
    for i, law in enumerate(laws, 1):
        url, name = law.get("url"), law.get("name")
        lang = (law.get("lang") or "en").lower()
        if not url or not name or lang not in ("en", "ar"):
            print(f"[{i}/{len(laws)}] SKIP invalid entry: {law!r}")
            results.append((name or url or "?", lang, 0, "invalid entry"))
            continue
        print(f"\n[{i}/{len(laws)}] === {name} ({lang}) ===")
        try:
            n = await ingest_law(url, name, lang, prove=False)
            results.append((name, lang, n, "ok" if n else "aborted (too small / not bookie)"))
        except Exception as e:  # keep going on per-law failures (bad URL, scanned PDF, etc.)
            print(f"  ERROR: {type(e).__name__}: {e}")
            results.append((name, lang, 0, f"error: {type(e).__name__}"))

    # --- summary ---
    total_rows = sum(r[2] for r in results)
    ok = sum(1 for r in results if r[3] == "ok")
    print(f"\n{'='*60}\nSUMMARY: {ok}/{len(laws)} laws ingested, {total_rows} chunks total")
    for name, lang, n, status in results:
        print(f"  [{lang}] {n:>4} rows | {status:<28} | {name}")

    # --- per-language totals in the table ---
    conn = await asyncpg.connect(DATABASE_URL)
    rows = await conn.fetch(
        "SELECT metadata->>'lang' AS lang, count(*) AS n "
        "FROM unified_embeddings WHERE source_table='uae_legislation' GROUP BY 1 ORDER BY 1")
    print("\nunified_embeddings (uae_legislation) by lang:")
    for r in rows:
        print(f"  {r['lang']}: {r['n']}")
    await conn.close()


if __name__ == "__main__":
    manifest = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent / "uae_laws_manifest.json")
    asyncio.run(run(manifest))
