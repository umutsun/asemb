"""
crawler_runtime — shared, opt-in runtime for the LSEMB Python crawler subsystem.

Additive and feature-flagged: importing this package changes nothing on its own. Crawlers
opt in to engine fallback / central per-domain rate-limiting / robots.txt / settings-driven
config behind the `crawler.*` settings flags (all default OFF → legacy behavior preserved).

Kept as a TOP-LEVEL package (sibling of `services/`) on purpose: importing it must stay cheap
and air-gapped-safe, so it deliberately avoids `services/__init__.py` (which eagerly imports the
heavy semantic_analyzer_service). It has no dependency on the `services` package.

Standalone crawler scripts (spawned as `python crawlers/foo.py`) only have `crawlers/` on
sys.path, so they must add python-services first. Use the snippet:

    import sys; from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # python-services
    from crawler_runtime import polite_fetch, settings as crawler_settings
"""

from . import engine, ratelimit, robots, settings  # noqa: F401

__all__ = ["engine", "ratelimit", "robots", "settings", "polite_fetch"]


async def polite_fetch(
    url: str,
    *,
    crawler: str = None,
    render: bool = False,
    wait_for: str = None,
    timeout: int = 30,
):
    """
    One-call polite fetch: honors robots.txt and the central per-domain throttle (both
    flag-gated, default OFF), then fetches via the engine fallback chain.

    Flags (settings table / env, see settings._env_key for env form):
      crawler.robots.enabled            (default false)
      crawler.rateLimit.enabled         (default false)
      crawler.rateLimit.defaultDelayMs  (default 1000)
      crawler.rateLimit.jitterMs        (default 0)
      crawler.rateLimit.<crawler>.delayMs   per-crawler override (optional)
      crawler.userAgent                 (default engine.DEFAULT_UA)
    """
    ua = await settings.get_str("crawler.userAgent", engine.DEFAULT_UA)

    robots_on = await settings.get_bool("crawler.robots.enabled", False)
    if robots_on and not await robots.can_fetch(url, ua):
        return engine.FetchResult(url=url, success=False, error="blocked by robots.txt")

    if await settings.get_bool("crawler.rateLimit.enabled", False):
        default_ms = await settings.get_float("crawler.rateLimit.defaultDelayMs", 1000.0)
        if crawler:
            default_ms = await settings.get_float(
                f"crawler.rateLimit.{crawler}.delayMs", default_ms
            )
        delay_s = default_ms / 1000.0
        if robots_on:
            cd = await robots.crawl_delay(url, ua)
            if cd:
                delay_s = max(delay_s, cd)
        jitter_s = await settings.get_float("crawler.rateLimit.jitterMs", 0.0) / 1000.0
        await ratelimit.wait(url, delay_s, jitter_s)

    return await engine.fetch(url, render=render, wait_for=wait_for, timeout=timeout, user_agent=ua)
