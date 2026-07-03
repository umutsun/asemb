"""
Crawl a legislation LISTING page, harvest document PDF links (handling ASP.NET
__doPostBack pagination), and ingest each via ingest_uae_law.ingest_law — which is
quality-gated (rejects scanned/corrupt/wrong-language PDFs) and idempotent per name.

Discovery only finds links; the quality gate decides what actually lands in the index,
so it is safe to point this at large listings and let corrupt items be skipped.

Usage:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/crawl_legislation.py <listing_url> [max_pages] [default_lang] [--dry]
    --dry  : only harvest + print URLs (no download/ingest)

Examples:
  scripts/crawl_legislation.py https://tax.gov.ae/en/Legislation.aspx 20 en
  scripts/crawl_legislation.py https://dlp.dubai.gov.ae/en/Pages/LegislationSearch.aspx 1 en --dry
"""
import asyncio, re, sys
from pathlib import Path
from urllib.parse import urljoin, unquote
import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest_uae_law import ingest_law  # noqa: E402

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def normalize_url(url):
    """Collapse duplicate slashes in the path (some hosts emit tax.gov.ae//Datafolder)
    so the same file isn't harvested twice under different strings."""
    m = re.match(r"^(https?://[^/]+)(/.*)?$", url)
    if not m:
        return url
    host, path = m.group(1), (m.group(2) or "")
    path = re.sub(r"/{2,}", "/", path)
    return host + path


def infer_lang(url):
    """Infer document language from its URL/path (Arabic markers vs default)."""
    u = unquote(url).lower()
    if (re.search(r"[؀-ۿ]", u) or "/ar/" in u or "/arabic/" in u or "ar reference" in u
            or u.endswith("-ar.pdf") or "_ar.pdf" in u or "-ar-" in u):
        return "ar"
    return "en"


def infer_name(url):
    """Human-ish name from the filename (URL-decoded, extension stripped)."""
    base = unquote(url.split("?")[0].split("/")[-1])
    base = re.sub(r"\.(pdf|aspx)$", "", base, flags=re.I)
    base = re.sub(r"[_]+", " ", base).strip()
    return base[:240] or url[:240]


def extract_pdf_links(html, base_url):
    """All href/src links that point at a PDF (direct .pdf, or .aspx asset handlers
    whose path clearly contains a legislation PDF)."""
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for tag in soup.find_all(["a"], href=True):
        href = tag["href"].strip()
        if not href or href.lower().startswith("javascript:"):
            continue
        low = unquote(href).lower()
        if low.endswith(".pdf") or ".pdf?" in low or "legislation reference" in low or "legislation ar reference" in low:
            out.append(normalize_url(urljoin(base_url, href.replace("\\", "/"))))
    return out


def _hidden(soup, name):
    el = soup.find("input", {"name": name})
    return el.get("value", "") if el else ""


def find_pager_targets(html):
    """ASP.NET pager postbacks: __doPostBack('TARGET','Page$N'). Returns ordered unique
    (target, arg) pairs for pages 2..N (page 1 is the initial GET)."""
    pairs = re.findall(r"__doPostBack\('([^']+)','(Page\$\d+)'\)", html)
    seen, out = set(), []
    for t, a in pairs:
        if a == "Page$1":
            continue
        key = (t, a)
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def crawl(listing_url, max_pages=20):
    """Return a de-duplicated list of PDF URLs from the listing across paged postbacks."""
    found = {}
    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True, timeout=60, verify=False) as c:
        r = c.get(listing_url)
        r.raise_for_status()
        html = r.text
        for u in extract_pdf_links(html, listing_url):
            found[u] = True
        targets = find_pager_targets(html)[: max_pages - 1]
        soup = BeautifulSoup(html, "html.parser")
        form = soup.find("form")
        action = urljoin(listing_url, form.get("action") or "") if form else listing_url
        for target, arg in targets:
            data = {
                "__EVENTTARGET": target,
                "__EVENTARGUMENT": arg,
                "__VIEWSTATE": _hidden(soup, "__VIEWSTATE"),
                "__VIEWSTATEGENERATOR": _hidden(soup, "__VIEWSTATEGENERATOR"),
                "__EVENTVALIDATION": _hidden(soup, "__EVENTVALIDATION"),
            }
            try:
                pr = c.post(action, data=data)
                if pr.status_code != 200:
                    continue
                phtml = pr.text
                before = len(found)
                for u in extract_pdf_links(phtml, listing_url):
                    found[u] = True
                # refresh viewstate for the next postback
                soup = BeautifulSoup(phtml, "html.parser")
                print(f"  page {arg}: +{len(found)-before} (total {len(found)})")
            except Exception as e:
                print(f"  page {arg} ERROR: {type(e).__name__}: {e}")
    return list(found.keys())


async def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry" in sys.argv
    listing = args[0]
    max_pages = int(args[1]) if len(args) > 1 else 20
    default_lang = args[2] if len(args) > 2 else None

    print(f"crawling: {listing} (max_pages={max_pages}, dry={dry})")
    urls = crawl(listing, max_pages)
    print(f"harvested {len(urls)} candidate PDF urls")

    laws, seen_names = [], set()
    for u in urls:
        lang = infer_lang(u) if default_lang is None else (infer_lang(u) or default_lang)
        name = infer_name(u)
        # Skip same-name duplicates (e.g. the same file via two href variants) — they'd
        # collide on source_name and churn the idempotent delete/re-insert.
        key = name.lower()
        if key in seen_names:
            continue
        seen_names.add(key)
        laws.append({"url": u, "name": name, "lang": lang})

    if dry:
        for law in laws:
            print(f"  [{law['lang']}] {law['name'][:80]} | {law['url'][:110]}")
        print(f"\n(dry run) {len(laws)} urls, ar={sum(1 for l in laws if l['lang']=='ar')}, en={sum(1 for l in laws if l['lang']=='en')}")
        return

    ok = rows = 0
    for i, law in enumerate(laws, 1):
        print(f"\n[{i}/{len(laws)}] === {law['name'][:70]} ({law['lang']}) ===")
        try:
            n = await ingest_law(law["url"], law["name"], law["lang"], prove=False)
            if n:
                ok += 1
                rows += n
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}")
    print(f"\n{'='*60}\nCRAWL+INGEST: {ok}/{len(laws)} ingested, {rows} chunks")


if __name__ == "__main__":
    asyncio.run(main())
