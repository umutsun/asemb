"""
PoC UAE-law ingest pipeline -> bookie_lsemb.unified_embeddings.

PDF (official) -> PyMuPDF text -> article-aware chunk -> OpenAI text-embedding-3-small
-> insert into unified_embeddings (source_table='uae_legislation').

Idempotent per source_name (deletes its own prior rows first). Safety: aborts unless the
connected DB is bookie_lsemb. Ends with a semantic test query to prove retrieval.

Usage:
  OPENAI_API_KEY=sk-... python ingest_uae_law.py "<pdf_url>" "<source_name>"
"""
import os, re, sys, json, asyncio
import httpx
import fitz  # PyMuPDF
import asyncpg
from openai import OpenAI
from pathlib import Path
from dotenv import load_dotenv

# .env.lsemb lives at the repo root (scripts/ -> python-services -> backend -> repo root)
load_dotenv(Path(__file__).resolve().parents[3] / ".env.lsemb")

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
EMBED_MODEL = "text-embedding-3-small"
SOURCE_TABLE = "uae_legislation"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

PDF_URL = sys.argv[1]
SOURCE_NAME = sys.argv[2]
SLUG = re.sub(r"[^a-z0-9]+", "-", SOURCE_NAME.lower()).strip("-")


def download(url):
    with httpx.Client(follow_redirects=True, timeout=90, headers={"User-Agent": UA}) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.content


def extract_text(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(p.get_text() for p in doc)


def clean(t):
    t = t.replace("\r", "\n")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _size_split(text, size=1600, overlap=200):
    out, i = [], 0
    while i < len(text):
        end = min(i + size, len(text))
        seg = text[i:end]
        if end < len(text):
            m = max(seg.rfind(". "), seg.rfind(".\n"), seg.rfind("\n\n"))
            if m > size * 0.5:
                seg = seg[: m + 1]
                end = i + len(seg)
        seg = seg.strip()
        if len(seg) > 40:
            out.append(seg)
        i = end - overlap if end - overlap > i else end
    return out


def chunk_by_article(text):
    # UAE laws number articles "Article (N)"; keep each article whole, split only if huge.
    parts = re.split(r"(?=Article\s*\(?\d+\)?)", text)
    chunks = []
    for p in parts:
        p = p.strip()
        if len(p) < 40:
            continue
        chunks.extend(_size_split(p) if len(p) > 2200 else [p])
    return chunks or _size_split(text)


def embed(client, texts):
    out = []
    for i in range(0, len(texts), 64):
        resp = client.embeddings.create(model=EMBED_MODEL, input=texts[i:i + 64])
        out.extend(d.embedding for d in resp.data)
    return out


def vec(e):
    return "[" + ",".join(f"{x:.6f}" for x in e) + "]"


async def main():
    client = OpenAI(api_key=OPENAI_API_KEY)
    print(f"downloading: {PDF_URL}")
    text = clean(extract_text(download(PDF_URL)))
    print(f"extracted chars: {len(text)}")
    chunks = chunk_by_article(text)
    print(f"chunks: {len(chunks)} | sample: {chunks[0][:90]!r}")
    if len(text) < 3000 or len(chunks) < 3:
        print("ABORT: extracted text too small — likely not a clean PDF/text source")
        return
    embs = embed(client, chunks)
    print(f"embedded: {len(embs)} vectors, dim={len(embs[0])}")

    conn = await asyncpg.connect(DATABASE_URL)
    db = await conn.fetchval("SELECT current_database()")
    print(f"connected DB: {db}")
    if db != "bookie_lsemb":
        print("ABORT: not bookie_lsemb — refusing to write")
        await conn.close()
        return

    deleted = await conn.execute(
        "DELETE FROM unified_embeddings WHERE source_table=$1 AND source_name=$2", SOURCE_TABLE, SOURCE_NAME)
    print(f"cleared prior rows for this law: {deleted}")

    # (source_table, source_id) is UNIQUE, so give each law a non-overlapping source_id range.
    base = await conn.fetchval(
        "SELECT COALESCE(MAX(source_id), -1) + 1 FROM unified_embeddings WHERE source_table=$1", SOURCE_TABLE)
    print(f"source_id base for this law: {base}")

    n = 0
    for idx, (ch, e) in enumerate(zip(chunks, embs)):
        meta = json.dumps({"source": "uae_ingest_poc", "law": SOURCE_NAME,
                           "article_index": idx, "url": PDF_URL, "lang": "en"})
        await conn.execute(
            """INSERT INTO unified_embeddings
               (source_table, source_type, source_id, source_name, content, embedding,
                model_used, metadata, created_at, updated_at)
               VALUES ($1,'document',$2,$3,$4,$5::vector, $6, $7::jsonb, now(), now())""",
            SOURCE_TABLE, base + idx, SOURCE_NAME, ch, vec(e), EMBED_MODEL, meta)
        n += 1
    print(f"inserted {n} rows into unified_embeddings (source_table={SOURCE_TABLE})")

    # --- prove retrieval ---
    q = "What is the maximum probation period and the notice required to terminate during probation?"
    qe = vec(client.embeddings.create(model=EMBED_MODEL, input=[q]).data[0].embedding)
    rows = await conn.fetch(
        """SELECT source_name, 1-(embedding<=>$1::vector) AS sim, left(content,160) AS c
           FROM unified_embeddings WHERE source_table=$2
           ORDER BY embedding<=>$1::vector LIMIT 3""", qe, SOURCE_TABLE)
    print(f"\nTEST QUERY: {q}")
    for r in rows:
        print(f"  sim={r['sim']:.3f} | {r['c'].strip()!r}")
    await conn.close()


asyncio.run(main())
