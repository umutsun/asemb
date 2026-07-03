"""
crawler_runtime.settings — settings-driven config accessor for the crawler subsystem.

Precedence per key:  env override  >  DB `settings` table  >  hardcoded default.

Self-contained on purpose: works both inside the FastAPI service (async) and inside
standalone crawler scripts spawned as child processes (different cwd, sync redis). It
NEVER raises — any DB/connection failure falls back to the supplied default, so the
air-gapped GX10 appliance (no DB reachable) keeps working with code defaults.

Env override form: the dotted key is upper-cased with '.'/'-' → '_'. e.g.
    crawler.rateLimit.enabled   ->   CRAWLER_RATELIMIT_ENABLED
"""

import asyncio
import os
import time
from typing import Optional

from loguru import logger

try:  # asyncpg is already a hard dep of the service; guarded only for paranoia
    import asyncpg
except Exception:  # pragma: no cover
    asyncpg = None  # type: ignore

# key -> (monotonic_ts, value)
_CACHE: "dict[str, tuple[float, Optional[str]]]" = {}
_CACHE_TTL = float(os.getenv("CRAWLER_SETTINGS_TTL", "60"))

_conn = None
_conn_lock = asyncio.Lock()


def _env_key(key: str) -> str:
    return key.upper().replace(".", "_").replace("-", "_")


async def _get_conn():
    """Lazily open a single short-lived asyncpg connection (cheap vs a pool for a script)."""
    global _conn
    if asyncpg is None:
        return None
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        return None
    if _conn is not None and not _conn.is_closed():
        return _conn
    async with _conn_lock:
        if _conn is not None and not _conn.is_closed():
            return _conn
        try:
            _conn = await asyncpg.connect(dsn, timeout=5)
        except Exception as e:
            logger.debug(f"[crawler.settings] DB connect failed, using defaults: {e}")
            _conn = None
        return _conn


async def _db_get(key: str) -> Optional[str]:
    global _conn
    conn = await _get_conn()
    if conn is None:
        return None
    try:
        row = await conn.fetchrow("SELECT value FROM settings WHERE key = $1", key)
        return row["value"] if row else None
    except Exception as e:
        logger.debug(f"[crawler.settings] DB read failed for {key}: {e}")
        _conn = None  # force reconnect next time
        return None


async def get_raw(key: str, default: Optional[str] = None) -> Optional[str]:
    # 1. env override (always wins, useful for air-gapped / per-run overrides)
    env_val = os.getenv(_env_key(key))
    if env_val is not None:
        return env_val
    # 2. in-process cache
    now = time.monotonic()
    cached = _CACHE.get(key)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1] if cached[1] is not None else default
    # 3. DB settings table
    val = await _db_get(key)
    _CACHE[key] = (now, val)
    return val if val is not None else default


def _to_bool(v: str) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "on", "enabled")


async def get_bool(key: str, default: bool = False) -> bool:
    raw = await get_raw(key)
    return _to_bool(raw) if raw is not None else default


async def get_int(key: str, default: int) -> int:
    raw = await get_raw(key)
    try:
        return int(raw) if raw not in (None, "") else default
    except (ValueError, TypeError):
        return default


async def get_float(key: str, default: float) -> float:
    raw = await get_raw(key)
    try:
        return float(raw) if raw not in (None, "") else default
    except (ValueError, TypeError):
        return default


async def get_str(key: str, default: str = "") -> str:
    raw = await get_raw(key)
    return raw if raw is not None else default


def clear_cache() -> None:
    _CACHE.clear()
