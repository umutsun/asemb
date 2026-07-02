"""
LSEMB MCP server — infrastructure helpers (self-contained).

Owns its own Postgres pool, Redis client, a thin Celery control client, and an
httpx-based proxy to the Node/Python services. Nothing here imports the main
python-services package, so this can run in its own lightweight virtualenv.
"""

import asyncio
import json
import logging
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

import asyncpg
import httpx
import redis.asyncio as aioredis
from celery import Celery

from . import config

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | mcp.%(name)s | %(message)s",
)
log = logging.getLogger("infra")


# --------------------------------------------------------------------------- #
# JSON-safe serialization (asyncpg Records carry datetime/Decimal/UUID/etc.)
# --------------------------------------------------------------------------- #
def clean(obj: Any) -> Any:
    """Recursively convert DB/driver values into JSON-serializable primitives."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, bytes):
        try:
            return obj.decode("utf-8")
        except Exception:
            return obj.hex()
    if isinstance(obj, asyncpg.Record):
        return {k: clean(v) for k, v in dict(obj).items()}
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [clean(v) for v in obj]
    return str(obj)


def rows(records) -> list[dict]:
    return [clean(r) for r in records]


# --------------------------------------------------------------------------- #
# Postgres
# --------------------------------------------------------------------------- #
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        if not config.DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not configured")
        _pool = await asyncpg.create_pool(
            config.DATABASE_URL,
            min_size=1,
            max_size=5,
            command_timeout=30,
        )
        log.info("Postgres pool ready")
    return _pool


async def fetch(query: str, *args) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return rows(await conn.fetch(query, *args))


async def fetchrow(query: str, *args) -> Optional[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rec = await conn.fetchrow(query, *args)
        return clean(rec) if rec is not None else None


async def fetchval(query: str, *args):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return clean(await conn.fetchval(query, *args))


async def table_exists(name: str) -> bool:
    return bool(await fetchval("SELECT to_regclass($1) IS NOT NULL", name))


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


# --------------------------------------------------------------------------- #
# DB-driven settings (settings table) — small TTL cache; empty -> None.
# --------------------------------------------------------------------------- #
_settings_cache: dict[str, tuple[Optional[str], float]] = {}


async def get_setting(key: str, ttl: float = 30.0) -> Optional[str]:
    now = time.monotonic()
    cached = _settings_cache.get(key)
    if cached and cached[1] > now:
        return cached[0]
    val: Optional[str] = None
    try:
        if await table_exists("settings"):
            val = await fetchval("SELECT value FROM settings WHERE key = $1 LIMIT 1", key)
    except Exception as e:
        log.warning("settings lookup %s failed: %s", key, e)
        if cached:  # serve stale on transient DB error
            return cached[0]
    val = val if (val is not None and str(val).strip() != "") else None
    _settings_cache[key] = (val, now + ttl)
    return val


# --------------------------------------------------------------------------- #
# Redis (app/cache DB — same one Node + python-services use for job state)
# --------------------------------------------------------------------------- #
_redis: Optional[aioredis.Redis] = None


async def get_redis() -> Optional[aioredis.Redis]:
    global _redis
    if _redis is None:
        try:
            _redis = aioredis.Redis(
                host=config.REDIS_HOST,
                port=config.REDIS_PORT,
                db=config.REDIS_DB,
                password=config.REDIS_PASSWORD,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            await _redis.ping()
            log.info("Redis connected (db %s)", config.REDIS_DB)
        except Exception as e:  # Redis is optional — degrade gracefully
            log.warning("Redis unavailable: %s", e)
            _redis = None
    return _redis


async def redis_get_json(key: str) -> Any:
    """Return a JSON-decoded value if it parses, else the raw string, else None."""
    client = await get_redis()
    if not client:
        return None
    try:
        val = await client.get(key)
        if val is None:
            return None
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    except Exception as e:
        log.warning("redis get %s failed: %s", key, e)
        return None


# --------------------------------------------------------------------------- #
# Celery — thin control client (inspect / revoke / send_task by name).
# We deliberately do NOT import workers.* — send_task addresses tasks by name,
# and inspect/revoke only need the broker URL.
# --------------------------------------------------------------------------- #
celery_app = Celery(
    "lsemb_mcp",
    broker=config.CELERY_BROKER_URL,
    backend=config.CELERY_RESULT_BACKEND,
)


async def celery_inspect(method: str, timeout: float = 2.0) -> Optional[dict]:
    """Run a (blocking) Celery inspect call off the event loop."""
    def _call():
        insp = celery_app.control.inspect(timeout=timeout)
        fn = getattr(insp, method, None)
        return fn() if fn else None
    try:
        return await asyncio.to_thread(_call)
    except Exception as e:
        log.warning("celery inspect.%s failed: %s", method, e)
        return None


async def celery_revoke(task_id: str, terminate: bool = False) -> dict:
    def _call():
        celery_app.control.revoke(task_id, terminate=terminate, signal="SIGTERM")
        return True
    try:
        await asyncio.to_thread(_call)
        return {"ok": True, "task_id": task_id, "terminated": terminate}
    except Exception as e:
        return {"ok": False, "task_id": task_id, "error": str(e)}


async def celery_send_task(name: str, args: list) -> dict:
    def _call():
        return celery_app.send_task(name, args=args).id
    try:
        task_id = await asyncio.to_thread(_call)
        return {"ok": True, "task": name, "task_id": task_id}
    except Exception as e:
        return {"ok": False, "task": name, "error": str(e)}


# --------------------------------------------------------------------------- #
# HTTP proxy to upstream control endpoints
# --------------------------------------------------------------------------- #
async def _request(method: str, url: str, **kw) -> dict:
    headers = kw.pop("headers", {}) or {}
    if config.INTERNAL_API_KEY:
        headers.setdefault("X-API-Key", config.INTERNAL_API_KEY)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, url, headers=headers, **kw)
        body: Any
        try:
            body = resp.json()
        except Exception:
            body = (resp.text or "")[:2000]
        return {"ok": resp.is_success, "status": resp.status_code, "url": url, "body": body}
    except Exception as e:
        return {"ok": False, "status": None, "url": url, "error": str(e)}


async def python_post(path: str, *, json_body: dict | None = None, form: dict | None = None) -> dict:
    return await _request("POST", config.PYTHON_SERVICE_URL + path, json=json_body, data=form)


async def python_get(path: str) -> dict:
    return await _request("GET", config.PYTHON_SERVICE_URL + path)


async def backend_post(path: str, *, json_body: dict | None = None) -> dict:
    return await _request("POST", config.BACKEND_URL + path, json=json_body or {})
