"""
UAE Government portal (u.ae) crawler for the Crawler Data Manager.
Invoked by the backend as: python uae_gov_crawler.py <seed_url> <crawler_name>
BFS-crawls same-domain u.ae pages (EN + AR mirror), extracts main content, and writes
each page to Redis as crawl4ai:{crawler_name}:{slug} JSON {title, content, url, metadata}
— the format the Crawler Data Manager reads (preview / export-to-db / embeddings).

Deps: requests, beautifulsoup4, redis (same as the other built-in crawlers).
Redis DB from REDIS_DB env (set by the backend that spawns this).
"""
import os, sys, re, json, time, hashlib, unicodedata
from collections import deque
from urllib.parse import urljoin, urldefrag

import requests
from bs4 import BeautifulSoup
import redis

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "2"))  # match backend crawl4aiRedis default (REDIS_DB||2)
MAX_PAGES = int(os.getenv("CRAWL_MAX_PAGES", "25"))
DELAY_S = float(os.getenv("CRAWL_DELAY_S", "0.8"))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

PREFIXES = ("https://u.ae/en/", "https://u.ae/ar/")
SKIP = re.compile(r"/(search|help|sitemap|contact|feedback|login|register|rss|share|media-hub)", re.I)


def slugify(url):
    h = hashlib.md5(url.encode("utf-8")).hexdigest()[:8]
    tail = re.sub(r"[^a-z0-9]+", "-", url.rstrip("/").split("/")[-1].lower())[:40] or "page"
    return f"{tail}-{h}"


def extract(html, url):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "nav", "header", "footer", "aside", "form", "noscript", "button"]):
        t.decompose()
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else url
    main = soup.find("main") or soup.find(attrs={"role": "main"}) or soup.body or soup
    text = unicodedata.normalize("NFC", main.get_text(separator=" ", strip=True)) if main else ""
    text = re.sub(r"\s+", " ", text).strip()
    links = [urldefrag(urljoin(url, a["href"]))[0] for a in soup.find_all("a", href=True)]
    return title.strip(), text, links


def main():
    if len(sys.argv) < 3:
        print("usage: uae_gov_crawler.py <seed_url> <crawler_name>"); sys.exit(1)
    seed = sys.argv[1]
    crawler_name = sys.argv[2]
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)
    print(f"[uae_gov] start seed={seed} crawler={crawler_name} redis_db={REDIS_DB} max={MAX_PAGES}", flush=True)

    sess = requests.Session(); sess.headers.update({"User-Agent": UA})
    seeds = [seed] if seed.startswith(PREFIXES) else [
        "https://u.ae/en/information-and-services",
        "https://u.ae/ar/information-and-services",
    ]
    visited, queued, saved = set(), set(seeds), 0
    q = deque(seeds)
    r.set(f"crawl4ai:{crawler_name}:_state", json.dumps({"status": "running", "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")}))
    while q and saved < MAX_PAGES:
        url = q.popleft()
        if url in visited or SKIP.search(url) or not url.startswith(PREFIXES):
            continue
        visited.add(url)
        try:
            resp = sess.get(url, timeout=25)
            if resp.status_code != 200 or "html" not in resp.headers.get("content-type", ""):
                continue
            title, text, links = extract(resp.text, url)
        except Exception as e:
            print(f"  skip {url}: {type(e).__name__}", flush=True); continue
        if len(text) >= 350:
            lang = "ar" if url.startswith("https://u.ae/ar/") else "en"
            item = {"title": title[:200], "content": text, "url": url,
                    "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "metadata": {"lang": lang, "source": "u.ae", "length": len(text)}}
            r.set(f"crawl4ai:{crawler_name}:{slugify(url)}", json.dumps(item, ensure_ascii=False))
            saved += 1
            print(f"[{saved}] {len(text)}c {title[:60]}", flush=True)
        for l in links:
            if l.startswith(PREFIXES) and l not in visited and l not in queued and not SKIP.search(l):
                queued.add(l); q.append(l)
        time.sleep(DELAY_S)
    r.set(f"crawl4ai:{crawler_name}:_state", json.dumps({"status": "completed", "items": saved, "finishedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")}))
    print(f"[uae_gov] done: {saved} pages saved to crawl4ai:{crawler_name}:*", flush=True)


if __name__ == "__main__":
    main()
