"""
Agent Memory — long-term memory store + recall (WS4-A, Redis Iris alignment, ADR-0002).

Dual store: the Postgres `memories` table is the SOURCE-OF-TRUTH; a Redis FT.SEARCH KNN index
is a rebuildable HOT-RECALL projection on top of it. Working memory (live session messages)
stays in Redis via the Node message-storage service — it is NOT handled here.

This service does NO LLM calls. The Node `agent-memory.service.ts` runs extraction on the
configured provider (Hard Rule #1 — config-driven) and POSTs the resulting memories to /store
here, which embeds, dedups by content_hash, and dual-writes. Recall is namespace/user-scoped
semantic search (Redis hot first, Postgres fallback).

Fail-safe: every public method swallows errors and returns an empty/no-op result so the chat
path is never blocked. Boot-safe: Redis search symbols are imported lazily; with no Redis 8 /
RediSearch the service degrades to Postgres-only. Inert until the Node `agentMemory.enabled`
flag is on — nothing calls /store or /recall otherwise.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore

import redis.asyncio as aredis

from services.database import get_db
from services.semantic_search_service import semantic_search_service

# Valid long-term memory types (mirrors the OSS Agent Memory Server strategies).
MEMORY_TYPES = ("discrete", "summary", "preference", "episodic")
_DEFAULT_TYPE = "episodic"

# Redis hot index — separate namespace from the WS3 corpus vectors (gx10vec:) and the WS2
# cache, so a flush of one never touches the others.
_REDIS_PREFIX = "gx10mem:"


def _content_hash(content: str) -> str:
    """sha256 of normalized content — the dedup key (matches the unique index scope)."""
    return hashlib.sha256(" ".join((content or "").split()).strip().lower().encode("utf-8")).hexdigest()


def _vec_literal(embedding: List[float]) -> str:
    # pgvector string literal — identical format to the rest of the engine.
    return "[" + ",".join(map(str, embedding)) + "]"


# RediSearch TAG values must escape punctuation (-, ., @, etc.) or the query parser treats it as
# an operator — e.g. user_id "umut-test" parses as `umut AND NOT test` → syntax error.
_TAG_ESCAPE = re.compile(r"([,.<>{}\[\]\"':;!@#$%^&*()\-+=~|/ ])")


def _escape_tag(value: str) -> str:
    return _TAG_ESCAPE.sub(r"\\\1", value or "")


class AgentMemoryService:
    def __init__(self) -> None:
        self._client: Optional[aredis.Redis] = None
        self._syms: Any = "unset"
        self._ensured: set[str] = set()

    # ── embedding ──────────────────────────────────────────────────────────────
    async def _embed(self, text: str) -> Optional[List[float]]:
        try:
            return await semantic_search_service.generate_embedding(text=text, use_cache=True)
        except Exception as e:
            logger.warning(f"[agent-memory] embed failed: {e}")
            return None

    # ── Redis hot mirror (mirrors RedisVectorStore for boot safety) ──────────────
    def _get_client(self) -> Optional[aredis.Redis]:
        if self._client is not None:
            return self._client
        try:
            self._client = aredis.Redis(
                host=os.getenv("REDIS_VECTOR_HOST", os.getenv("REDIS_HOST", "localhost")),
                port=int(os.getenv("REDIS_VECTOR_PORT", os.getenv("REDIS_PORT", "6379"))),
                db=int(os.getenv("REDIS_VECTOR_DB", "0")),
                password=(os.getenv("REDIS_VECTOR_PASSWORD", os.getenv("REDIS_PASSWORD", "")) or None),
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            return self._client
        except Exception as e:  # pragma: no cover
            logger.warning(f"[agent-memory] redis init failed: {e}")
            return None

    def _search_symbols(self):
        if self._syms != "unset":
            return self._syms
        syms = None
        try:
            from redis.commands.search.field import TagField, TextField, VectorField
            from redis.commands.search.query import Query
            try:
                from redis.commands.search.index_definition import IndexDefinition, IndexType
            except Exception:
                from redis.commands.search.indexDefinition import IndexDefinition, IndexType
            syms = {
                "TagField": TagField, "TextField": TextField, "VectorField": VectorField,
                "Query": Query, "IndexDefinition": IndexDefinition, "IndexType": IndexType,
            }
        except Exception as e:
            logger.warning(f"[agent-memory] redis-py search unavailable (needs Redis 8): {e}")
        self._syms = syms
        return syms

    def _index_name(self, dim: int) -> str:
        return f"idx:{_REDIS_PREFIX}d{dim}"

    async def _ensure_index(self, client: aredis.Redis, dim: int) -> bool:
        name = self._index_name(dim)
        if name in self._ensured:
            return True
        syms = self._search_symbols()
        if syms is None:
            return False
        try:
            await client.ft(name).info()
            self._ensured.add(name)
            return True
        except Exception:
            pass
        try:
            await client.ft(name).create_index(
                fields=[
                    syms["TagField"]("namespace"),
                    syms["TagField"]("user_id"),
                    syms["TagField"]("memory_type"),
                    syms["TextField"]("content"),
                    syms["VectorField"](
                        "embedding", "HNSW",
                        {"TYPE": "FLOAT32", "DIM": dim, "DISTANCE_METRIC": "COSINE"},
                    ),
                ],
                definition=syms["IndexDefinition"](
                    prefix=[f"{_REDIS_PREFIX}d{dim}:"], index_type=syms["IndexType"].HASH
                ),
            )
            self._ensured.add(name)
            logger.info(f"[agent-memory] created redis index {name} (dim={dim})")
            return True
        except Exception as e:
            logger.warning(f"[agent-memory] redis index create failed {name}: {e}")
            return False

    async def _mirror_to_redis(
        self, mem_id: str, namespace: str, user_id: Optional[str], memory_type: str,
        content: str, embedding: List[float],
    ) -> None:
        if np is None:
            return
        client = self._get_client()
        if client is None:
            return
        dim = len(embedding)
        if not await self._ensure_index(client, dim):
            return
        try:
            key = f"{_REDIS_PREFIX}d{dim}:{mem_id}"
            await client.hset(key, mapping={
                "namespace": namespace,
                "user_id": user_id or "_anon",
                "memory_type": memory_type,
                "content": (content or "")[:4000],
                "embedding": np.asarray(embedding, dtype=np.float32).tobytes(),
            })
        except Exception as e:
            logger.warning(f"[agent-memory] redis mirror failed: {e}")

    # ── write: store extracted memories ──────────────────────────────────────────
    async def store(
        self,
        items: List[Dict[str, Any]],
        *,
        namespace: str = "default",
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        source_session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Embed + dedup + dual-write a batch of extracted memories.

        Each item: {content, memory_type?, topics?, metadata?, importance?}.
        Dedup is by (namespace, user_id, content_hash) via the table's unique index —
        a duplicate is skipped (not re-embedded, not mirrored).
        """
        stored, deduped, ids = 0, 0, []
        if not items:
            return {"stored": 0, "deduped": 0, "ids": []}
        try:
            pool = await get_db()
        except Exception as e:
            logger.warning(f"[agent-memory] db unavailable: {e}")
            return {"stored": 0, "deduped": 0, "ids": [], "error": "db_unavailable"}

        for item in items:
            content = (item.get("content") or "").strip()
            if not content:
                continue
            mtype = item.get("memory_type") or _DEFAULT_TYPE
            if mtype not in MEMORY_TYPES:
                mtype = _DEFAULT_TYPE
            chash = _content_hash(content)
            embedding = await self._embed(content)
            if embedding is None:
                continue
            topics = item.get("topics") or []
            metadata = item.get("metadata") or {}
            importance = float(item.get("importance", 0.5) or 0.5)
            try:
                row = await pool.fetchrow(
                    """
                    INSERT INTO memories
                        (namespace, user_id, session_id, source_session_id, memory_type,
                         content, content_hash, topics, embedding, metadata, importance)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10::jsonb,$11)
                    ON CONFLICT (namespace, user_id, content_hash) DO NOTHING
                    RETURNING id
                    """,
                    namespace, user_id, session_id, source_session_id, mtype,
                    content, chash, list(topics), _vec_literal(embedding),
                    json.dumps(metadata, ensure_ascii=False), importance,
                )
            except Exception as e:
                logger.warning(f"[agent-memory] insert failed: {e}")
                continue
            if row is None:
                deduped += 1
                continue
            mem_id = str(row["id"])
            ids.append(mem_id)
            stored += 1
            await self._mirror_to_redis(mem_id, namespace, user_id, mtype, content, embedding)

        return {"stored": stored, "deduped": deduped, "ids": ids}

    # ── read: recall ─────────────────────────────────────────────────────────────
    async def recall(
        self,
        query: str,
        *,
        namespace: str = "default",
        user_id: Optional[str] = None,
        limit: int = 5,
        memory_types: Optional[Sequence[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Namespace/user-scoped semantic recall. Redis hot path first, Postgres fallback.
        Returns [] on any error (caller injects nothing → chat unaffected)."""
        if not (query or "").strip():
            return []
        embedding = await self._embed(query)
        if embedding is None:
            return []

        hits = await self._recall_redis(embedding, namespace, user_id, limit, memory_types)
        if hits is None:  # Redis unavailable → fall back to the source-of-truth.
            hits = await self._recall_pg(embedding, namespace, user_id, limit, memory_types)
        await self._touch(hits)
        return hits

    async def _recall_redis(
        self, embedding, namespace, user_id, limit, memory_types
    ) -> Optional[List[Dict[str, Any]]]:
        if np is None:
            return None
        client = self._get_client()
        if client is None:
            return None
        dim = len(embedding)
        if not await self._ensure_index(client, dim):
            return None
        syms = self._search_symbols()
        if syms is None:
            return None
        try:
            filt = f"@namespace:{{{_escape_tag(namespace)}}} @user_id:{{{_escape_tag(user_id or '_anon')}}}"
            if memory_types:
                filt += " @memory_type:{" + "|".join(_escape_tag(t) for t in memory_types) + "}"
            q = (
                syms["Query"](f"({filt})=>[KNN {int(limit)} @embedding $vec AS dist]")
                .sort_by("dist", asc=True)
                .return_fields("content", "memory_type", "dist")
                .paging(0, int(limit))
                .dialect(2)
            )
            res = await client.ft(self._index_name(dim)).search(
                q, query_params={"vec": np.asarray(embedding, dtype=np.float32).tobytes()}
            )
            out: List[Dict[str, Any]] = []
            for doc in getattr(res, "docs", []) or []:
                rid = getattr(doc, "id", "") or ""
                out.append({
                    "id": rid.split(":")[-1],
                    "content": getattr(doc, "content", ""),
                    "memory_type": getattr(doc, "memory_type", None),
                    "similarity_score": 1.0 - float(getattr(doc, "dist", 1.0)),
                    "recall_source": "redis",
                })
            return out
        except Exception as e:
            logger.warning(f"[agent-memory] redis recall failed: {e}")
            return None

    async def _recall_pg(
        self, embedding, namespace, user_id, limit, memory_types
    ) -> List[Dict[str, Any]]:
        try:
            pool = await get_db()
            types = list(memory_types) if memory_types else None
            rows = await pool.fetch(
                """
                SELECT id, content, memory_type, topics, metadata, importance,
                       1 - (embedding <=> $1::vector) AS similarity_score
                FROM memories
                WHERE embedding IS NOT NULL AND namespace = $2
                  AND ($3::text IS NULL OR user_id = $3)
                  AND ($4::text[] IS NULL OR memory_type = ANY($4))
                ORDER BY embedding <=> $1::vector
                LIMIT $5
                """,
                _vec_literal(embedding), namespace, user_id, types, limit,
            )
            out = []
            for r in rows:
                d = dict(r)
                d["id"] = str(d["id"])
                d["recall_source"] = "postgres"
                out.append(d)
            return out
        except Exception as e:
            logger.warning(f"[agent-memory] pg recall failed: {e}")
            return []

    async def _touch(self, hits: List[Dict[str, Any]]) -> None:
        """Best-effort access-stat update for recalled memories (eviction/importance signal)."""
        ids = [h["id"] for h in hits if h.get("id")]
        if not ids:
            return
        try:
            pool = await get_db()
            await pool.execute(
                """
                UPDATE memories
                SET access_count = access_count + 1, last_accessed_at = now()
                WHERE id = ANY($1::uuid[])
                """,
                ids,
            )
        except Exception:
            pass  # non-critical

    # ── maintenance: rebuild the Redis hot index from Postgres ───────────────────
    @staticmethod
    def _parse_embedding(raw: Any) -> Optional[List[float]]:
        """pgvector comes back from asyncpg as a '[...]' text literal (no codec registered)."""
        if raw is None:
            return None
        if isinstance(raw, str):
            try:
                return [float(x) for x in raw.strip().lstrip("[").rstrip("]").split(",") if x.strip()]
            except Exception:
                return None
        try:
            return [float(x) for x in raw]  # already a sequence
        except Exception:
            return None

    async def _purge_hot_keys(self, client: aredis.Redis) -> int:
        """UNLINK every gx10mem: key (an isolated prefix — never touches corpus/cache vectors)
        so a rebuild starts clean. The HASH index auto-empties as its keys disappear."""
        purged = 0
        try:
            batch: List[str] = []
            async for key in client.scan_iter(match=f"{_REDIS_PREFIX}*", count=500):
                batch.append(key)
                if len(batch) >= 500:
                    purged += int(await client.unlink(*batch) or 0)
                    batch = []
            if batch:
                purged += int(await client.unlink(*batch) or 0)
        except Exception as e:
            logger.warning(f"[agent-memory] purge hot keys failed: {e}")
        return purged

    async def rehydrate(
        self,
        *,
        namespace: Optional[str] = None,
        drop_first: bool = False,
    ) -> Dict[str, Any]:
        """Rebuild the Redis hot-recall index from the Postgres source-of-truth.

        Repairs dual-write drift after a Redis flush / restart / eviction: Postgres keeps every
        memory durably, but the Redis mirror is volatile and `store()` only mirrors on write — so
        a lost Redis stays cold (recall silently falls back to slow Postgres) until new writes.
        This reuses each row's stored embedding (NO re-embedding, NO LLM, NO writes to Postgres)
        and is idempotent (re-hset by mem_id overwrites). With drop_first=True, stale gx10mem: keys
        are purged first — use after memories were deleted from Postgres. Fail-safe: returns counts
        with an `error` field rather than raising.
        """
        result: Dict[str, Any] = {"rehydrated": 0, "skipped": 0, "purged": 0, "scanned": 0}
        if np is None:
            return {**result, "error": "numpy_unavailable"}
        client = self._get_client()
        if client is None or self._search_symbols() is None:
            return {**result, "error": "redis_unavailable"}
        try:
            pool = await get_db()
        except Exception as e:
            logger.warning(f"[agent-memory] rehydrate: db unavailable: {e}")
            return {**result, "error": "db_unavailable"}

        if drop_first:
            result["purged"] = await self._purge_hot_keys(client)
            self._ensured.clear()

        try:
            if namespace:
                rows = await pool.fetch(
                    "SELECT id, namespace, user_id, memory_type, content, embedding "
                    "FROM memories WHERE embedding IS NOT NULL AND namespace = $1",
                    namespace,
                )
            else:
                rows = await pool.fetch(
                    "SELECT id, namespace, user_id, memory_type, content, embedding "
                    "FROM memories WHERE embedding IS NOT NULL"
                )
        except Exception as e:
            logger.warning(f"[agent-memory] rehydrate: pg read failed: {e}")
            return {**result, "error": "pg_read_failed"}

        result["scanned"] = len(rows)
        for r in rows:
            embedding = self._parse_embedding(r["embedding"])
            if embedding is None:
                result["skipped"] += 1
                continue
            await self._mirror_to_redis(
                str(r["id"]), r["namespace"], r["user_id"],
                r["memory_type"] or _DEFAULT_TYPE, r["content"] or "", embedding,
            )
            result["rehydrated"] += 1

        logger.info(f"[agent-memory] rehydrate complete: {result}")
        return result

    # ── introspection ────────────────────────────────────────────────────────────
    async def stats(self, namespace: Optional[str] = None) -> Dict[str, Any]:
        out: Dict[str, Any] = {"enabled_backends": [], "total": 0, "by_type": {}}
        try:
            pool = await get_db()
            if namespace:
                total = await pool.fetchval("SELECT COUNT(*) FROM memories WHERE namespace = $1", namespace)
                rows = await pool.fetch(
                    "SELECT memory_type, COUNT(*) c FROM memories WHERE namespace = $1 GROUP BY memory_type",
                    namespace,
                )
            else:
                total = await pool.fetchval("SELECT COUNT(*) FROM memories")
                rows = await pool.fetch("SELECT memory_type, COUNT(*) c FROM memories GROUP BY memory_type")
            out["total"] = int(total or 0)
            out["by_type"] = {r["memory_type"]: int(r["c"]) for r in rows}
            out["enabled_backends"].append("postgres")
        except Exception as e:
            logger.warning(f"[agent-memory] stats (pg) failed: {e}")
        client = self._get_client()
        if client is not None and self._search_symbols() is not None:
            out["enabled_backends"].append("redis")
            # Hot-index doc count, so callers can SEE dual-write drift (redis < postgres ⇒
            # rehydrate needed after a Redis flush/restart). Best-effort; omitted on error.
            try:
                names = await client.execute_command("FT._LIST")
                redis_total = 0
                for n in names or []:
                    n = n.decode() if isinstance(n, (bytes, bytearray)) else n
                    if isinstance(n, str) and n.startswith(f"idx:{_REDIS_PREFIX}"):
                        info = await client.ft(n).info()
                        nd = info.get("num_docs") if isinstance(info, dict) else None
                        redis_total += int(nd or 0)
                out["redis_total"] = redis_total  # total hot docs (index spans all namespaces)
                if namespace is None:  # drift only comparable on the global count
                    out["drift"] = max(0, int(out.get("total", 0)) - redis_total)
            except Exception as e:
                logger.debug(f"[agent-memory] redis stats probe failed: {e}")
        return out


# Module-level singleton (mirrors semantic_response_cache / semantic_search_service).
agent_memory_service = AgentMemoryService()
