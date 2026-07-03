"""
Headless harvester for JS-paginated legislation listings (Playwright/Chromium).
Clicks through the pager, accumulates all PDF links, and writes a manifest JSON that
ingest_uae_dataset.py can consume (each item {url, name, lang}). Discovery only — the
ingest quality gate decides what actually lands.

Usage:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/harvest_headless.py <listing_url> <out_manifest.json> [lang] [max_pages]

Examples:
  scripts/harvest_headless.py https://tax.gov.ae/en/Legislation.aspx scripts/tax_en.json en 25
  scripts/harvest_headless.py https://tax.gov.ae/ar/legislation.aspx scripts/tax_ar.json ar 25
"""
import json, sys, re
from pathlib import Path
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crawl_legislation import normalize_url, infer_lang, infer_name  # noqa: E402

NEXT_SELECTORS = [
    "a[id*=LinkButtonNext]",
    "a.aegov-pagination-previous",
    "a:has-text('Next')",
    "a[aria-label*='Next']",
    "a[rel=next]",
]


def _collect(pg, base):
    hrefs = pg.eval_on_selector_all(
        "a[href]",
        "els => els.map(e => e.getAttribute('href')).filter(Boolean)",
    )
    out = set()
    for h in hrefs:
        low = h.lower()
        if low.endswith(".pdf") or ".pdf?" in low or "legislation reference" in low:
            out.add(normalize_url(urljoin(base, h.replace("\\", "/"))))
    return out


def harvest(url, max_pages=25):
    links = set()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"))
        pg.goto(url, wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(4500)
        stagnant = 0
        for i in range(max_pages):
            before = len(links)
            links |= _collect(pg, url)
            grew = len(links) - before
            print(f"  page {i+1}: +{grew} (total {len(links)})")
            # find a usable Next control
            nxt = None
            for sel in NEXT_SELECTORS:
                loc = pg.locator(sel)
                if loc.count() > 0:
                    nxt = loc.first
                    break
            if nxt is None:
                break
            cls = (nxt.get_attribute("class") or "").lower()
            if "disabled" in cls or nxt.get_attribute("aria-disabled") == "true":
                break
            try:
                nxt.scroll_into_view_if_needed(timeout=4000)
                nxt.click(timeout=6000)
                pg.wait_for_timeout(2600)
            except Exception as e:
                print(f"  (next click stopped: {type(e).__name__})")
                break
            stagnant = stagnant + 1 if grew == 0 else 0
            if stagnant >= 2:
                break
        b.close()
    return sorted(links)


def main():
    url = sys.argv[1]
    out = sys.argv[2]
    lang_default = sys.argv[3] if len(sys.argv) > 3 else None
    max_pages = int(sys.argv[4]) if len(sys.argv) > 4 else 25
    print(f"harvesting (headless): {url}")
    urls = harvest(url, max_pages)
    laws, seen = [], set()
    for u in urls:
        name = infer_name(u)
        if name.lower() in seen:
            continue
        seen.add(name.lower())
        laws.append({"url": u, "name": name, "lang": infer_lang(u) if lang_default is None else (infer_lang(u) or lang_default)})
    Path(out).write_text(json.dumps(laws, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(laws)} laws to {out} (ar={sum(1 for l in laws if l['lang']=='ar')}, en={sum(1 for l in laws if l['lang']=='en')})")


if __name__ == "__main__":
    main()
