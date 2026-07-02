"""
Fill small embedding gaps in bookie_lsemb.unified_embeddings (idempotent, safe to re-run):

  1. Re-embed rows whose `embedding` is NULL (content present but the vector failed to
     write on the original ingest).
  2. Index legal documents that have extracted `content` in the `documents` table but are
     not represented in `unified_embeddings` at all (searchable-gap). Chunked with the shared
     word/sentence-aware chunker (via ingest_uae_law.chunk_by_article) and inserted under
     source_table='uae_legislation'.

Reuses the proven ingest_uae_law pipeline (settings-based OpenAI key per Hard Rule #1, the
shared chunker, source_id allocation under an advisory lock). Aborts unless connected to
bookie_lsemb. Writes to the live shared DB — run only with explicit approval.

Usage:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/fill_embedding_gaps.py [--dry]
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # scripts/ -> import ingest_uae_law
import asyncpg
from openai import OpenAI
from ingest_uae_law import (
    chunk_by_article, embed, vec, resolve_openai_key,
    EMBED_MODEL, SOURCE_TABLE, DATABASE_URL,
)

DRY = "--dry" in sys.argv


def detect_lang(text: str) -> str:
    """Arabic if a majority of letters are in the Arabic block, else English."""
    ar = sum(1 for ch in text if "؀" <= ch <= "ۿ")
    letters = sum(1 for ch in text if ch.isalpha())
    return "ar" if letters and ar / letters > 0.5 else "en"


async def main():
    client = OpenAI(api_key=await resolve_openai_key())
    conn = await asyncpg.connect(DATABASE_URL)
    db = await conn.fetchval("SELECT current_database()")
    print(f"connected DB: {db}")
    if db != "bookie_lsemb":
        print("ABORT: not bookie_lsemb — refusing to write")
        await conn.close()
        return

    # ---- 1. Re-embed NULL-embedding rows ----------------------------------------
    null_rows = await conn.fetch(
        "SELECT id, content FROM unified_embeddings "
        "WHERE embedding IS NULL AND content IS NOT NULL AND length(content) > 0 ORDER BY id"
    )
    print(f"\n[1] rows with NULL embedding: {len(null_rows)}")
    if null_rows and not DRY:
        embs = embed(client, [r["content"] for r in null_rows])
        async with conn.transaction():
            for r, e in zip(null_rows, embs):
                await conn.execute(
                    "UPDATE unified_embeddings SET embedding=$1::vector, model_used=$2, updated_at=now() WHERE id=$3",
                    vec(e), EMBED_MODEL, r["id"])
        print(f"    re-embedded {len(null_rows)} rows")
    elif null_rows:
        print(f"    [dry] would re-embed {len(null_rows)} rows")

    # ---- 2. Index documents that are not searchable yet -------------------------
    docs = await conn.fetch(
        """SELECT id, title, content FROM documents d
           WHERE content IS NOT NULL AND length(content) > 200
             AND NOT EXISTS (SELECT 1 FROM unified_embeddings u
                             WHERE u.source_name = d.title OR u.metadata->>'law' = d.title)
           ORDER BY id""")
    print(f"\n[2] documents with content but not in unified_embeddings: {len(docs)}")
    for d in docs:
        title = d["title"]
        lang = detect_lang(d["content"])
        chunks = chunk_by_article(d["content"], lang)
        print(f"  - '{title[:70]}' | lang={lang} | chunks={len(chunks)}")
        if len(chunks) < 1 or DRY:
            if DRY:
                print("    [dry] would index")
            continue
        embs = embed(client, chunks)
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtext('uae_legislation_ingest'))")
            base = await conn.fetchval(
                "SELECT COALESCE(MAX(source_id), -1) + 1 FROM unified_embeddings WHERE source_table=$1", SOURCE_TABLE)
            for idx, (ch, e) in enumerate(zip(chunks, embs)):
                meta = json.dumps({"source": "documents_backfill", "law": title,
                                   "article_index": idx, "lang": lang, "document_id": d["id"]})
                await conn.execute(
                    """INSERT INTO unified_embeddings
                       (source_table, source_type, source_id, source_name, content, embedding,
                        model_used, metadata, created_at, updated_at)
                       VALUES ($1,'document',$2,$3,$4,$5::vector,$6,$7::jsonb, now(), now())""",
                    SOURCE_TABLE, base + idx, title, ch, vec(e), EMBED_MODEL, meta)
        print(f"    indexed {len(chunks)} chunks (source_id {base}..{base + len(chunks) - 1})")

    # ---- summary ----------------------------------------------------------------
    remaining = await conn.fetchval("SELECT count(*) FROM unified_embeddings WHERE embedding IS NULL")
    print(f"\nDONE. NULL-embedding rows remaining: {remaining}")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
