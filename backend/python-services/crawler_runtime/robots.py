"""
crawler_runtime.robots — robots.txt fetch/parse + Crawl-Delay, cached in Redis per host.

Fail-open by design: if robots.txt can't be fetched or parsed, requests are ALLOWED. That
matches the prior behavior (robots was ignored entirely), so turning the feature on can only
make the crawler more polite, never accidentally block everything because of a transient error.
Enforcement is gated by the crawler.robots.enabled flag (see the package's polite_fetch).
"""

import os
import time
from typing import Optional
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

from loguru import logger

from . import engine as _engine
from .ratelimit import _get_redis as _get_redis

# host -> (monotonic_ts, parser)
_parsers: "dict[str, tuple[float, RobotFileParser]]" = {}
_TTL = int(os.getenv("CRAWLER_ROBOTS_TTL", "3600"))


def _host_root(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


async def _load_parser(url: str, user_agent: str) -> RobotFileParser:
    host = urlparse(url).netloc.lower()
    now = time.monotonic()
    cached = _parsers.get(host)
    if cached and (now - cached[0]) < _TTL:
        return cached[1]

    robots_url = urljoin(_host_root(url), "/robots.txt")
    text: Optional[str] = None

    # Redis-cached robots.txt body (shared across processes)
    r = await _get_redis()
    rkey = f"crawl4ai:robots:{host}"
    if r is not None:
        try:
            text = await r.get(rkey)
        except Exception:
            text = None

    if text is None:
        try:
            res = await _engine._fetch_httpx(robots_url, 10, user_agent)
            text = res.html if (res.success and res.html) else ""
        except Exception as e:
            logger.debug(f"[robots] fetch failed for {robots_url}: {e}")
            text = ""
        if r is not None:
            try:
                await r.set(rkey, text, ex=_TTL)
            except Exception:
                pass

    rp = RobotFileParser()
    try:
        rp.parse(text.splitlines())
    except Exception:
        rp = RobotFileParser()
        rp.parse([])
    _parsers[host] = (now, rp)
    return rp


async def can_fetch(url: str, user_agent: str = _engine.DEFAULT_UA) -> bool:
    try:
        rp = await _load_parser(url, user_agent)
        return rp.can_fetch(user_agent, url)
    except Exception:
        return True  # fail-open


async def crawl_delay(url: str, user_agent: str = _engine.DEFAULT_UA) -> Optional[float]:
    try:
        rp = await _load_parser(url, user_agent)
        d = rp.crawl_delay(user_agent)
        return float(d) if d is not None else None
    except Exception:
        return None
