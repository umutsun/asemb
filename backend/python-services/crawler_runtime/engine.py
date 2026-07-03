"""
crawler_runtime.engine — resilient fetch with automatic engine fallback.

Chain (availability detected at import time, mirroring crawl4ai_service.py's import guard):
    crawl4ai  ->  Playwright  ->  httpx + BeautifulSoup

This lets crawlers (and crawl4ai_service) keep working when the heavy engines are absent:
the air-gapped GX10 appliance has neither crawl4ai nor (often) Playwright browsers, but a
static httpx+BS4 fetch still pulls most government/legal pages. For static pages httpx is
also simply cheaper, so it is tried first unless JS rendering is requested.
"""

from dataclasses import dataclass, field
from typing import List, Optional
from urllib.parse import urljoin, urlparse

from loguru import logger

# --- engine availability (import-guarded) ---
try:
    from crawl4ai import AsyncWebCrawler  # type: ignore
    _CRAWL4AI_AVAILABLE = True
except Exception:
    AsyncWebCrawler = None  # type: ignore
    _CRAWL4AI_AVAILABLE = False

try:
    from playwright.async_api import async_playwright  # type: ignore
    _PLAYWRIGHT_AVAILABLE = True
except Exception:
    async_playwright = None  # type: ignore
    _PLAYWRIGHT_AVAILABLE = False

try:
    import httpx  # type: ignore
    _HTTPX_AVAILABLE = True
except Exception:
    httpx = None  # type: ignore
    _HTTPX_AVAILABLE = False

try:
    from bs4 import BeautifulSoup  # type: ignore
    _BS4_AVAILABLE = True
except Exception:
    BeautifulSoup = None  # type: ignore
    _BS4_AVAILABLE = False

DEFAULT_UA = "Mozilla/5.0 (compatible; LSEMBCrawler/1.0; +https://luwi.dev)"


@dataclass
class FetchResult:
    url: str
    status: int = 0
    html: str = ""
    text: str = ""
    title: str = ""
    links: List[str] = field(default_factory=list)
    engine: str = ""
    success: bool = False
    error: Optional[str] = None


def available_engines() -> List[str]:
    out: List[str] = []
    if _CRAWL4AI_AVAILABLE:
        out.append("crawl4ai")
    if _PLAYWRIGHT_AVAILABLE:
        out.append("playwright")
    if _HTTPX_AVAILABLE:
        out.append("httpx")
    return out


def _parse_html(url: str, html: str):
    """Extract (title, text, links) from raw HTML using BeautifulSoup when available."""
    title, text, links = "", "", []
    if _BS4_AVAILABLE and html:
        try:
            soup = BeautifulSoup(html, "lxml")
            if soup.title and soup.title.string:
                title = soup.title.string.strip()
            text = soup.get_text(separator=" ", strip=True)
            for a in soup.find_all("a", href=True):
                links.append(urljoin(url, a["href"]))
        except Exception as e:  # pragma: no cover
            logger.debug(f"[engine] HTML parse failed for {url}: {e}")
    elif html:
        text = html
    return title, text, links


async def _fetch_httpx(url: str, timeout: int, user_agent: str) -> FetchResult:
    async with httpx.AsyncClient(
        follow_redirects=True, timeout=timeout, headers={"User-Agent": user_agent}
    ) as client:
        resp = await client.get(url)
        html = resp.text or ""
        title, text, links = _parse_html(url, html)
        return FetchResult(
            url=url, status=resp.status_code, html=html, text=text, title=title,
            links=links, engine="httpx", success=resp.status_code < 400,
            error=None if resp.status_code < 400 else f"HTTP {resp.status_code}",
        )


async def _fetch_playwright(url: str, timeout: int, user_agent: str, wait_for: Optional[str]) -> FetchResult:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page(user_agent=user_agent)
            resp = await page.goto(url, timeout=timeout * 1000, wait_until="domcontentloaded")
            if wait_for:
                try:
                    await page.wait_for_selector(wait_for, timeout=timeout * 1000)
                except Exception:
                    pass  # best-effort; return whatever rendered
            html = await page.content()
            status = resp.status if resp else 0
            title, text, links = _parse_html(url, html)
            try:
                page_title = await page.title()
            except Exception:
                page_title = ""
            return FetchResult(
                url=url, status=status, html=html, text=text, title=page_title or title,
                links=links, engine="playwright",
                success=(status < 400 if status else True),
            )
        finally:
            await browser.close()


async def _fetch_crawl4ai(url: str, timeout: int) -> FetchResult:
    async with AsyncWebCrawler(verbose=False) as crawler:
        result = await crawler.arun(url=url, bypass_cache=True, timeout=timeout)
        html = getattr(result, "html", "") or ""
        text = getattr(result, "cleaned_text", "") or getattr(result, "markdown", "") or ""
        raw_links = getattr(result, "links", []) or []
        links: List[str] = []
        for l in raw_links[:300]:
            if isinstance(l, dict):
                href = l.get("href") or l.get("url")
                if href:
                    links.append(urljoin(url, href))
            elif isinstance(l, str):
                links.append(urljoin(url, l))
        if not text and html:
            _, text, page_links = _parse_html(url, html)
            if not links:
                links = page_links
        return FetchResult(
            url=url, status=getattr(result, "status_code", 200) or 200, html=html, text=text,
            title=getattr(result, "title", "") or "", links=links, engine="crawl4ai",
            success=bool(getattr(result, "success", True)),
        )


def _candidate_order(render: bool, wait_for: Optional[str], prefer: Optional[str]) -> List[str]:
    avail = available_engines()
    order: List[str] = []
    if prefer and prefer in avail:
        order.append(prefer)
    # JS needed -> rendered engines first; otherwise cheap static httpx first
    base = ("crawl4ai", "playwright", "httpx") if (render or wait_for) else ("httpx", "crawl4ai", "playwright")
    for e in base:
        if e in avail and e not in order:
            order.append(e)
    return order


async def fetch(
    url: str,
    *,
    render: bool = False,
    wait_for: Optional[str] = None,
    timeout: int = 30,
    user_agent: Optional[str] = None,
    prefer: Optional[str] = None,
) -> FetchResult:
    """
    Fetch a URL, automatically falling back through available engines.

    render/wait_for force a JS-capable engine first. If an engine returns an empty body
    (typical for JS-only pages fetched statically), the next engine is tried automatically.
    """
    ua = user_agent or DEFAULT_UA
    candidates = _candidate_order(render, wait_for, prefer)
    if not candidates:
        return FetchResult(url=url, success=False, error="no fetch engine available")

    last_err: Optional[str] = None
    for eng in candidates:
        try:
            if eng == "httpx":
                res = await _fetch_httpx(url, timeout, ua)
            elif eng == "playwright":
                res = await _fetch_playwright(url, timeout, ua, wait_for)
            elif eng == "crawl4ai":
                res = await _fetch_crawl4ai(url, timeout)
            else:
                continue
        except Exception as e:
            last_err = f"{eng}: {e}"
            logger.warning(f"[engine] {eng} failed for {url}: {e}")
            continue

        if res.success and (res.text.strip() or res.html.strip()):
            if eng != candidates[0]:
                logger.info(f"[engine] fell back to {eng} for {url}")
            return res
        last_err = res.error or f"{eng}: empty body (status {res.status})"

    return FetchResult(url=url, success=False, error=last_err or "all engines failed")
