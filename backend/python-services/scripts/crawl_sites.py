"""
Generalized, config-driven site crawler -> bookie_lsemb.unified_embeddings.

Why this exists: the per-site crawlers were capped/single-site, and some gov portals
are JS-rendered so a pure static fetch captures only nav/menus. This crawler:
  - BFS-crawls each configured site (same-domain, robots + per-domain rate-limit via
    crawler_runtime),
  - extracts MAIN content statically; if that's thin it FALLS BACK to a headless
    (Playwright) render and re-extracts -> real content even on SPA pages,
  - quality-gates (drops nav-only/thin pages),
  - chunks + embeds (text-embedding-3-small) + upserts per source_table.

Usage:
  # cheap verification, NO embeddings / NO DB writes:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/crawl_sites.py --site uae --max-pages 15 --dry-run
  # real run for one site:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/crawl_sites.py --site uae --max-pages 400
  # all configured sites:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/crawl_sites.py --all --max-pages 400

Safety: aborts unless the connected DB is bookie_lsemb. Idempotent per (source_table, lang).
"""
import os, re, sys, json, argparse, asyncio, unicodedata
from collections import deque
from urllib.parse import urljoin, urldefrag
import asyncpg
from openai import OpenAI
from pathlib import Path
from dotenv import load_dotenv
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import crawler_runtime.engine as engine
import crawler_runtime.robots as robots
import crawler_runtime.ratelimit as ratelimit
from services.text_chunker import split_text

load_dotenv(Path(__file__).resolve().parents[3] / ".env.lsemb")
DATABASE_URL = os.environ["DATABASE_URL"]
EMBED_MODEL = "text-embedding-3-small"
MIN_RICH_STATIC = 800   # below this, try a JS render fallback (unless --no-js)
KEEP_MIN = 800          # quality gate: drop thin hub/nav pages, keep real content
SKIP = re.compile(r"/(search|help|sitemap|contact|feedback|login|register|signin|"
                  r"Services-Directory|media-hub|rss|share|download|\.pdf$|\.jpg$|\.png$)", re.I)

# ── Site configs. Each: seeds, url prefixes (scope), langs, per-page source_table. ──
SITES = {
    "uae": {
        "source_table": "uae_gov_services",
        "langs": ["en", "ar"],
        "prefixes": ["https://u.ae/{lang}/"],
        "seeds": ["https://u.ae/{lang}/information-and-services/" + t for t in [
            "business", "visa-and-emirates-id", "jobs", "housing",
            "finance-and-investment", "justice-safety-and-the-law", "social-affairs",
            "moving-to-the-uae", "education", "health-and-fitness", "transport",
            "passports-and-traveling", "environment-and-energy", "charity-and-humanitarian-work",
        ]],
    },
    # NOTE: no crawlable general Dubai gov portal (dubai.gov.ae = DNS fail; dubai.ae = 403).
    # Dubai LEGAL content is PDF-based at dlp.dubai.gov.ae -> use the law-ingest pipeline, not this HTML crawler.
    "federal": {
        "source_table": "uae_federal_gov",
        "langs": ["en", "ar"],
        # working ministry domains (probed 200). moj.gov.ae 403s -> excluded.
        "prefixes": ["https://mohre.gov.ae/", "https://www.mohre.gov.ae/",
                     "https://tax.gov.ae/", "https://www.moec.gov.ae/",
                     "https://mohap.gov.ae/"],
        "seeds": ["https://mohre.gov.ae/{lang}/", "https://tax.gov.ae/{lang}/",
                  "https://www.moec.gov.ae/{lang}/", "https://mohap.gov.ae/{lang}/"],
    },
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

_pw = None  # lazy async playwright browser


def expand(items, langs):
    out = []
    for it in items:
        out.extend(it.format(lang=l) if "{lang}" in it else it for l in ([None] if "{lang}" not in it else langs))
    return out


def scope_of(site):
    return tuple(p.format(lang=l) for p in site["prefixes"] for l in (site["langs"] or ["en"])) \
        if any("{lang}" in p for p in site["prefixes"]) else tuple(site["prefixes"])


def lang_of(url, langs):
    for l in langs:
        if f"/{l}/" in url:
            return l
    return langs[0] if langs else "en"


def extract_main(html, url):
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "noscript", "button"]):
        tag.decompose()
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    main = (soup.find("main") or soup.find(attrs={"role": "main"})
            or soup.find("article") or soup.find(id=re.compile("content|main", re.I))
            or soup.body or soup)
    text = unicodedata.normalize("NFC", main.get_text(separator=" ", strip=True)) if main else ""
    text = re.sub(r"\s+", " ", text).strip()
    links = [urldefrag(urljoin(url, a["href"]))[0] for a in soup.find_all("a", href=True)]
    return title, text, links


async def render_fetch(url):
    """JS-render fallback for SPA pages. Returns HTML or None."""
    global _pw
    from playwright.async_api import async_playwright
    if _pw is None:
        p = await async_playwright().start()
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        ctx = await browser.new_context(user_agent=UA, locale="en-US")
        _pw = (p, browser, ctx)
    _, _, ctx = _pw
    pg = await ctx.new_page()
    try:
        await pg.goto(url, wait_until="domcontentloaded", timeout=35000)
        try:
            await pg.wait_for_load_state("networkidle", timeout=12000)
        except Exception:
            pass
        await pg.wait_for_timeout(2500)
        return await pg.content()
    except Exception:
        return None
    finally:
        await pg.close()


async def close_pw():
    if _pw:
        _, browser, _ = _pw
        try:
            await browser.close()
        except Exception:
            pass


def chunks_of(text, size=1200, overlap=150):
    # Delegates to the shared chunker so chunks never start/end mid-word and overlap is
    # aligned to word starts (was raw text[i:i+size] slicing).
    return split_text(text, size=size, overlap=overlap, min_len=60)


def vec(e):
    return "[" + ",".join(f"{x:.6f}" for x in e) + "]"


async def crawl_site(key, site, max_pages, delay, dry, use_js=True):
    scope = scope_of(site)
    seeds = expand(site["seeds"], site["langs"])
    visited, queued = set(), set(seeds)
    q = deque(seeds)
    pages, rendered = [], 0
    while q and len(pages) < max_pages:
        url = q.popleft()
        if url in visited:
            continue
        visited.add(url)
        if SKIP.search(url) or not url.startswith(scope):
            continue
        try:
            if not await robots.can_fetch(url):
                continue
            await ratelimit.wait(url, delay)
            r = await engine.fetch(url, timeout=25)
        except Exception as e:
            print(f"  skip {url}: {e}"); continue
        if not r.success or not r.html:
            continue
        title, text, links = extract_main(r.html, url)
        if use_js and len(text) < MIN_RICH_STATIC:  # thin -> try JS render
            html2 = await render_fetch(url)
            if html2:
                rendered += 1
                t2, x2, l2 = extract_main(html2, url)
                if len(x2) > len(text):
                    title, text, links = t2, x2, l2
        if len(text) >= KEEP_MIN:
            pages.append((url, title, text))
            print(f"[{key}][{len(pages):>3}] {len(text):>6}c  {title[:58]}", flush=True)
        for l in links:
            if l.startswith(scope) and l not in visited and l not in queued and not SKIP.search(l):
                queued.add(l); q.append(l)
    print(f"[{key}] crawled {len(pages)} rich pages (visited {len(visited)}, js-rendered {rendered})", flush=True)
    return pages


async def ingest(conn, client, source_table, langs, pages):
    deleted = await conn.execute(
        "DELETE FROM unified_embeddings WHERE source_table=$1 AND COALESCE(metadata->>'lang','en') = ANY($2::text[])",
        source_table, langs)
    print(f"[{source_table}] cleared prior rows langs={langs}: {deleted}", flush=True)
    sid = await conn.fetchval(
        "SELECT COALESCE(MAX(source_id),-1)+1 FROM unified_embeddings WHERE source_table=$1", source_table) or 0
    total = 0
    for url, title, text in pages:
        cks = chunks_of(text)
        if not cks:
            continue
        embs = []
        for i in range(0, len(cks), 64):
            resp = client.embeddings.create(model=EMBED_MODEL, input=cks[i:i + 64])
            embs.extend(d.embedding for d in resp.data)
        name = (title or url).strip()[:250]
        lang = lang_of(url, langs)
        for ci, (ch, e) in enumerate(zip(cks, embs)):
            meta = json.dumps({"source": "crawl_sites", "url": url, "lang": lang, "chunk": ci})
            await conn.execute(
                """INSERT INTO unified_embeddings
                   (source_table, source_type, source_id, source_name, content, embedding, model_used, metadata, created_at, updated_at)
                   VALUES ($1,'webpage',$2,$3,$4,$5::vector,$6,$7::jsonb, now(), now())""",
                source_table, sid, name, ch, vec(e), EMBED_MODEL, meta)
            sid += 1; total += 1
    print(f"[{source_table}] inserted {total} chunks", flush=True)
    return total


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", help="site key: " + ", ".join(SITES))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--max-pages", type=int, default=int(os.getenv("CRAWL_MAX_PAGES", "400")))
    ap.add_argument("--delay", type=float, default=float(os.getenv("CRAWL_DELAY_S", "1.0")))
    ap.add_argument("--dry-run", action="store_true", help="crawl+extract only; no embed, no DB writes")
    ap.add_argument("--no-js", action="store_true", help="disable JS-render fallback (static only)")
    a = ap.parse_args()
    keys = list(SITES) if a.all else ([a.site] if a.site in SITES else [])
    if not keys:
        print("specify --site <key> or --all. keys:", ", ".join(SITES)); return

    conn = await asyncpg.connect(DATABASE_URL)
    db = await conn.fetchval("SELECT current_database()")
    print(f"connected DB: {db} | dry_run={a.dry_run}")
    if db != "bookie_lsemb":
        print("ABORT: not bookie_lsemb"); await conn.close(); return
    client = None
    if not a.dry_run:
        k = (os.environ.get("OPENAI_API_KEY") or "").strip() or \
            (await conn.fetchval("SELECT value FROM settings WHERE key='openai.apiKey'") or "").strip()
        client = OpenAI(api_key=k)

    grand = 0
    for key in keys:
        site = SITES[key]
        pages = await crawl_site(key, site, a.max_pages, a.delay, a.dry_run, use_js=not a.no_js)
        if a.dry_run:
            thin = sum(1 for _, _, t in pages if len(t) < 800)
            print(f"[{key}] DRY: {len(pages)} pages kept, {thin} still <800c\n", flush=True)
            continue
        if pages:
            grand += await ingest(conn, client, site["source_table"], site["langs"], pages)
    await conn.close()
    await close_pw()
    print(f"\nDONE. total chunks inserted: {grand}")


asyncio.run(main())
