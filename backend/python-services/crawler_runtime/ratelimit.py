"""
crawler_runtime.ratelimit — centralized per-domain throttle, shared across processes via Redis.

Each host gets one Redis key holding the "next allowed" timestamp. An atomic Lua script
reserves the next slot, so multiple crawler child-processes hitting the same domain cooperate
on a single global delay instead of each sleeping independently. When Redis is unavailable it
degrades to a per-process local sleep (still correct, just not shared).
"""

import asyncio
import os
import random
import time
from typing import Optional
from urllib.parse import urlparse

from loguru import logger

try:
    import redis.asyncio as aioredis
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore

_redis = None
_redis_lock = asyncio.Lock()

# KEYS[1]=host key ; ARGV[1]=now_ms ; ARGV[2]=delay_ms  ->  returns ms the caller must wait
_RESERVE_LUA = """
local nxt = tonumber(redis.call('GET', KEYS[1]) or '0')
local now = tonumber(ARGV[1])
local delay = tonumber(ARGV[2])
local start = now
if nxt > now then start = nxt end
redis.call('SET', KEYS[1], start + delay, 'PX', delay * 2 + 2000)
return start - now
"""


async def _get_redis():
    global _redis
    if aioredis is None:
        return None
    if _redis is not None:
        return _redis
    async with _redis_lock:
        if _redis is not None:
            return _redis
        try:
            _redis = aioredis.Redis(
                host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", 6379)),
                db=int(os.getenv("REDIS_DB", 2)),
                password=os.getenv("REDIS_PASSWORD") or None,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3,
            )
            await _redis.ping()
        except Exception as e:
            logger.debug(f"[ratelimit] Redis unavailable, local throttle only: {e}")
            _redis = None
        return _redis


def host_of(url: str) -> str:
    try:
        return (urlparse(url).netloc or "unknown").lower()
    except Exception:
        return "unknown"


async def wait(url: str, delay_s: float, jitter_s: float = 0.0) -> None:
    """Block until it is safe to hit url's host, honoring delay_s shared across processes."""
    if delay_s <= 0 and jitter_s <= 0:
        return
    extra = random.uniform(0, jitter_s) if jitter_s > 0 else 0.0
    delay_ms = int(max(0.0, delay_s + extra) * 1000)
    if delay_ms <= 0:
        return

    r = await _get_redis()
    if r is None:
        await asyncio.sleep(delay_ms / 1000.0)
        return

    key = f"crawl4ai:ratelimit:{host_of(url)}"
    now_ms = int(time.time() * 1000)
    try:
        wait_ms = int(await r.eval(_RESERVE_LUA, 1, key, now_ms, delay_ms))
        if wait_ms > 0:
            await asyncio.sleep(wait_ms / 1000.0)
    except Exception as e:
        logger.debug(f"[ratelimit] eval failed, local sleep: {e}")
        await asyncio.sleep(delay_ms / 1000.0)
