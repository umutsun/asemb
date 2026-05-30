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
            filt = f"@namespace:{{{namespace}}} @user_id:{{{user_id or '_anon'}}}"
            if memory_types:
                filt += " @memory_type:{" + "|".join(memory_types) + "}"
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
        if self._get_client() is not None and self._search_symbols() is not None:
            out["enabled_backends"].append("redis")
        return out


# Module-level singleton (mirrors semantic_response_cache / semantic_search_service).
agent_memory_service = AgentMemoryService()
