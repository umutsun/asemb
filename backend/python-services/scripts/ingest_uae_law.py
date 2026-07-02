"""
PoC UAE-law ingest pipeline -> bookie_lsemb.unified_embeddings.

PDF (official) -> PyMuPDF text -> article-aware chunk -> OpenAI text-embedding-3-small
-> insert into unified_embeddings (source_table='uae_legislation').

Idempotent per source_name (deletes its own prior rows first). Safety: aborts unless the
connected DB is bookie_lsemb. Ends with a semantic test query to prove retrieval.

Language: pass an optional 3rd arg (en|ar, default en). It selects the article-marker
regex (English "Article (N)" vs Arabic "المادة (N)"), tags metadata.lang, and picks the
proof-query language. Embeddings (text-embedding-3-small) are multilingual either way.

Usage:
  OPENAI_API_KEY=sk-... python ingest_uae_law.py "<pdf_url>" "<source_name>" [en|ar]
"""
import os, re, sys, json, asyncio, unicodedata
import httpx
import fitz  # PyMuPDF
import asyncpg
from openai import OpenAI
from pathlib import Path
from dotenv import load_dotenv

# .env.lsemb lives at the repo root (scripts/ -> python-services -> backend -> repo root)
load_dotenv(Path(__file__).resolve().parents[3] / ".env.lsemb")

# Shared word/sentence-aware chunker (never splits mid-word). python-services must be on
# sys.path because this file is imported from scripts/ as a top-level module.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.text_chunker import split_text  # noqa: E402

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")  # may be empty; real key lives in settings (Hard Rule #1)
EMBED_MODEL = "text-embedding-3-small"
SOURCE_TABLE = "uae_legislation"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


async def resolve_openai_key():
    """Hard Rule #1: provider keys live in the settings table. Use the env var only if
    it's actually set; otherwise read 'openai.apiKey' from the DB."""
    key = (OPENAI_API_KEY or "").strip()
    if key:
        return key
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        val = await conn.fetchval("SELECT value FROM settings WHERE key = 'openai.apiKey'")
    finally:
        await conn.close()
    val = (val or "").strip()
    if not val:
        raise RuntimeError("OpenAI API key not found in env OPENAI_API_KEY or settings 'openai.apiKey'")
    return val


def download(url):
    with httpx.Client(follow_redirects=True, timeout=90, headers={"User-Agent": UA}) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.content


def extract_text(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(p.get_text() for p in doc)


def clean(t):
    # NFC so Arabic presentation forms don't fragment tokens (keeps Arabic-Indic digits
    # and the Arabic block intact — we only collapse whitespace).
    t = unicodedata.normalize("NFC", t)
    t = t.replace("\r", "\n")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _size_split(text, size=1600, overlap=200):
    # Delegates to the shared chunker so chunks never start/end mid-word and overlap is
    # aligned to word starts (was raw text[i:i+size] slicing).
    return split_text(text, size=size, overlap=overlap, min_len=40)


def chunk_by_article(text, lang="en"):
    # UAE laws number articles "Article (N)"; Arabic versions use "المادة (N)" / "مادة"
    # (article numbers may be ASCII or Arabic-Indic digits ٠-٩). Keep each article whole,
    # split only if huge.
    if lang == "ar":
        pat = r"(?=(?:Article\s*\(?\d+\)?)|(?:ال?مادة\s*\(?[\d٠-٩]+\)?))"
    else:
        pat = r"(?=Article\s*\(?\d+\)?)"
    parts = re.split(pat, text)
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


async def ingest_law(pdf_url, source_name, lang="en", prove=True, pdf_bytes=None):
    """Ingest one law PDF into unified_embeddings (idempotent per source_name).
    Returns the number of rows inserted (0 if aborted).

    pdf_bytes: pre-fetched PDF bytes. When given, used instead of downloading
    pdf_url here — for sources the plain httpx download() can't reach (expired
    TLS certs, Cloudflare, headless-browser fetches). pdf_url is still recorded
    in metadata for provenance."""
    client = OpenAI(api_key=await resolve_openai_key())
    if pdf_bytes is not None:
        print(f"using pre-fetched bytes ({len(pdf_bytes)}) for: {pdf_url}")
        raw = pdf_bytes
    else:
        print(f"downloading: {pdf_url}")
        raw = download(pdf_url)
    text = clean(extract_text(raw))
    print(f"extracted chars: {len(text)} | lang={lang}")

    # Quality gate 1: too little text → scanned/image PDF (needs OCR) or a bad fetch.
    if len(text) < 3000:
        print("ABORT: extracted text too small — likely scanned/image PDF (needs OCR) or bad source")
        return 0

    # Quality gate 2: broken font ToUnicode → U+FFFD replacement chars (seen on some
    # MoJ Arabic PDFs at ~9%). Reject above 2% so corrupt text never reaches the index.
    repl = text.count("�")
    repl_ratio = repl / max(len(text), 1)
    if repl_ratio > 0.02:
        print(f"ABORT: corrupt extraction — {repl} U+FFFD chars ({repl_ratio*100:.1f}%); needs OCR / a clean source")
        return 0

    # Quality gate 3 (Arabic only): the body must actually be Arabic script. Catches
    # wrong-language fetches and heavily garbled extractions (low Arabic-letter share).
    if lang == "ar":
        ar_letters = sum(1 for ch in text if "؀" <= ch <= "ۿ")
        letters = sum(1 for ch in text if ch.isalpha())
        ar_ratio = ar_letters / max(letters, 1)
        if ar_ratio < 0.5:
            print(f"ABORT: lang=ar but only {ar_ratio*100:.0f}% Arabic-script letters — wrong source or garbled")
            return 0

    chunks = chunk_by_article(text, lang)
    print(f"chunks: {len(chunks)} | sample: {chunks[0][:90]!r}")
    if len(chunks) < 3:
        print("ABORT: too few chunks — not a usable legislation text")
        return 0
    embs = embed(client, chunks)
    print(f"embedded: {len(embs)} vectors, dim={len(embs[0])}")

    conn = await asyncpg.connect(DATABASE_URL)
    db = await conn.fetchval("SELECT current_database()")
    print(f"connected DB: {db}")
    if db != "bookie_lsemb":
        print("ABORT: not bookie_lsemb — refusing to write")
        await conn.close()
        return 0

    # Atomic critical section: an advisory lock serializes the (delete + MAX + insert)
    # so the source_id allocation can't race/collide across concurrent or rapid sequential
    # ingests (the (source_table, source_id) unique constraint is otherwise easy to violate).
    n = 0
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext('uae_legislation_ingest'))")
        deleted = await conn.execute(
            "DELETE FROM unified_embeddings WHERE source_table=$1 AND source_name=$2", SOURCE_TABLE, source_name)
        print(f"cleared prior rows for this law: {deleted}")

        # (source_table, source_id) is UNIQUE, so give each law a non-overlapping source_id range.
        base = await conn.fetchval(
            "SELECT COALESCE(MAX(source_id), -1) + 1 FROM unified_embeddings WHERE source_table=$1", SOURCE_TABLE)
        print(f"source_id base for this law: {base}")

        for idx, (ch, e) in enumerate(zip(chunks, embs)):
            meta = json.dumps({"source": "uae_ingest", "law": source_name,
                               "article_index": idx, "url": pdf_url, "lang": lang})
            await conn.execute(
                """INSERT INTO unified_embeddings
                   (source_table, source_type, source_id, source_name, content, embedding,
                    model_used, metadata, created_at, updated_at)
                   VALUES ($1,'document',$2,$3,$4,$5::vector, $6, $7::jsonb, now(), now())""",
                SOURCE_TABLE, base + idx, source_name, ch, vec(e), EMBED_MODEL, meta)
            n += 1
    print(f"inserted {n} rows into unified_embeddings (source_table={SOURCE_TABLE})")

    # --- prove retrieval ---
    if prove:
        q = ("ما هي مدة فترة الاختبار القصوى ومدة الإشعار المطلوبة لإنهاء العقد خلالها؟"
             if lang == "ar" else
             "What is the maximum probation period and the notice required to terminate during probation?")
        qe = vec(client.embeddings.create(model=EMBED_MODEL, input=[q]).data[0].embedding)
        rows = await conn.fetch(
            """SELECT source_name, 1-(embedding<=>$1::vector) AS sim, left(content,160) AS c
               FROM unified_embeddings WHERE source_table=$2
               ORDER BY embedding<=>$1::vector LIMIT 3""", qe, SOURCE_TABLE)
        print(f"\nTEST QUERY: {q}")
        for r in rows:
            print(f"  sim={r['sim']:.3f} | {r['c'].strip()!r}")
    await conn.close()
    return n


if __name__ == "__main__":
    pdf_url = sys.argv[1]
    source_name = sys.argv[2]
    lang = (sys.argv[3] if len(sys.argv) > 3 else "en").lower()
    if lang not in ("en", "ar"):
        print(f"ABORT: unsupported lang '{lang}' (use 'en' or 'ar')")
        sys.exit(1)
    asyncio.run(ingest_law(pdf_url, source_name, lang))
