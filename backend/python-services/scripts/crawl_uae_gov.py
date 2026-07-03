"""
Crawl u.ae (UAE official government portal, English) — service/procedure pages — and ingest
into bookie_lsemb.unified_embeddings (source_table='uae_gov_services').

Uses the shared crawler_runtime (engine httpx+BS fallback, robots.txt, per-domain rate-limit),
so it's polite. BFS over same-domain /en/ links from topic seeds, extracts MAIN content (drops
nav/header/footer/script), keeps content-rich pages, chunks + embeds (text-embedding-3-small),
inserts with a per-page source_id range. Idempotent: clears its own source_table first.
Safety: aborts unless connected DB is bookie_lsemb.

Usage:  CRAWL_MAX_PAGES=60 python scripts/crawl_uae_gov.py
"""
import os, re, sys, json, asyncio, unicodedata
from collections import deque
from urllib.parse import urljoin, urldefrag
import asyncpg
from openai import OpenAI
from pathlib import Path
from dotenv import load_dotenv
from bs4 import BeautifulSoup

# scripts/ -> python-services on sys.path so `crawler_runtime` imports under direct invocation
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import crawler_runtime.engine as engine
import crawler_runtime.robots as robots
import crawler_runtime.ratelimit as ratelimit

load_dotenv(Path(__file__).resolve().parents[3] / ".env.lsemb")
DATABASE_URL = os.environ["DATABASE_URL"]
EMBED_MODEL = "text-embedding-3-small"
SOURCE_TABLE = "uae_gov_services"
MAX_PAGES = int(os.getenv("CRAWL_MAX_PAGES", "160"))
DELAY_S = float(os.getenv("CRAWL_DELAY_S", "1.0"))
# Bilingual: crawl u.ae English (/en/) and its Arabic mirror (/ar/). Lang is inferred
# from the path so Arabic gov-service pages land with metadata.lang='ar' (→ search_vector_ar).
# Restrict to these langs via env CRAWL_LANGS (default both).
LANGS = [l.strip() for l in os.getenv("CRAWL_LANGS", "en,ar").split(",") if l.strip() in ("en", "ar")]
PREFIXES = tuple(f"https://u.ae/{l}/" for l in LANGS)

_TOPICS = [
    "information-and-services/business",
    "information-and-services/visa-and-emirates-id",
    "information-and-services/jobs",
    "information-and-services/housing",
    "information-and-services/finance-and-investment",
    "information-and-services/justice-safety-and-the-law",
    "information-and-services/social-affairs",
    "information-and-services/moving-to-the-uae",
    "information-and-services/education",
    "information-and-services/health-and-fitness",
    "information-and-services/transport",
]
SEEDS = [f"https://u.ae/{l}/{t}" for l in LANGS for t in _TOPICS]
SKIP = re.compile(r"/(search|help|sitemap|contact|feedback|login|register|Services-Directory|media-hub|rss|share)", re.I)


def in_scope(url):
    return url.startswith(PREFIXES)


def lang_of(url):
    return "ar" if url.startswith("https://u.ae/ar/") else "en"


async def resolve_key():
    k = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if k:
        return k
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        v = await conn.fetchval("SELECT value FROM settings WHERE key='openai.apiKey'")
    finally:
        await conn.close()
    return (v or "").strip()


def extract_main(html, url):
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "noscript", "button"]):
        tag.decompose()
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    main = soup.find("main") or soup.find(attrs={"role": "main"}) or soup.body or soup
    text = unicodedata.normalize("NFC", main.get_text(separator=" ", strip=True)) if main else ""
    text = re.sub(r"\s+", " ", text).strip()
    links = []
    for a in soup.find_all("a", href=True):
        links.append(urldefrag(urljoin(url, a["href"]))[0])
    return title, text, links


def chunks_of(text, size=1200, overlap=150):
    out, i = [], 0
    while i < len(text):
        end = min(i + size, len(text))
        seg = text[i:end]
        if end < len(text):
            m = max(seg.rfind(". "), seg.rfind("? "), seg.rfind("\n"))
            if m > size * 0.5:
                seg = seg[:m + 1]; end = i + len(seg)
        seg = seg.strip()
        if len(seg) > 60:
            out.append(seg)
        i = end - overlap if end - overlap > i else end
    return out


def vec(e):
    return "[" + ",".join(f"{x:.6f}" for x in e) + "]"


async def main():
    client = OpenAI(api_key=await resolve_key())
    conn = await asyncpg.connect(DATABASE_URL)
    db = await conn.fetchval("SELECT current_database()")
    print(f"connected DB: {db}")
    if db != "bookie_lsemb":
        print("ABORT: not bookie_lsemb"); await conn.close(); return

    visited, queued = set(), set(SEEDS)
    q = deque(SEEDS)
    pages = []
    while q and len(pages) < MAX_PAGES:
        url = q.popleft()
        if url in visited:
            continue
        visited.add(url)
        if SKIP.search(url) or not in_scope(url):
            continue
        try:
            if not await robots.can_fetch(url):
                continue
            await ratelimit.wait(url, DELAY_S)
            r = await engine.fetch(url, timeout=25)
        except Exception as e:
            print(f"  skip {url}: {e}"); continue
        if not r.success or not r.html:
            continue
        title, text, links = extract_main(r.html, url)
        if len(text) >= 400:
            pages.append((url, title, text))
            print(f"[{len(pages):>3}] {len(text):>6}c  {title[:60]}")
        for l in links:
            if in_scope(l) and l not in visited and l not in queued and not SKIP.search(l):
                queued.add(l); q.append(l)
    print(f"\ncrawled {len(pages)} content pages (visited {len(visited)} urls)")
    if not pages:
        await conn.close(); return

    # clear prior crawl (only the langs we're (re)crawling, so a single-lang top-up
    # pass doesn't wipe the other language) + compute id base
    deleted = await conn.execute(
        "DELETE FROM unified_embeddings WHERE source_table=$1 AND COALESCE(metadata->>'lang','en') = ANY($2::text[])",
        SOURCE_TABLE, LANGS)
    print(f"cleared prior {SOURCE_TABLE} rows for langs={LANGS}: {deleted}")
    sid = await conn.fetchval(
        "SELECT COALESCE(MAX(source_id),-1)+1 FROM unified_embeddings WHERE source_table=$1", SOURCE_TABLE) or 0

    total = 0
    for url, title, text in pages:
        cks = chunks_of(text)
        if not cks:
            continue
        # embed in batches
        embs = []
        for i in range(0, len(cks), 64):
            resp = client.embeddings.create(model=EMBED_MODEL, input=cks[i:i + 64])
            embs.extend(d.embedding for d in resp.data)
        name = (title or url).strip()[:250]
        lang = lang_of(url)
        for ci, (ch, e) in enumerate(zip(cks, embs)):
            meta = json.dumps({"source": "uae_gov_crawl", "url": url, "lang": lang, "chunk": ci})
            await conn.execute(
                """INSERT INTO unified_embeddings
                   (source_table, source_type, source_id, source_name, content, embedding, model_used, metadata, created_at, updated_at)
                   VALUES ($1,'webpage',$2,$3,$4,$5::vector,$6,$7::jsonb, now(), now())""",
                SOURCE_TABLE, sid, name, ch, vec(e), EMBED_MODEL, meta)
            sid += 1; total += 1
    print(f"inserted {total} chunks into unified_embeddings (source_table={SOURCE_TABLE})")
    await conn.close()


asyncio.run(main())
