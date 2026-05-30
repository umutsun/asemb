"""
Semantic LLM-Response Cache (Redis Iris "LangCache" — OSS / air-gapped equivalent).

WS2 of the Redis Iris alignment. Caches final LLM answers keyed by the *semantic*
similarity of the user query, so repeat / near-duplicate questions skip the (expensive,
on-box) LLM. Built directly on Redis 8's native Query Engine (FT.CREATE / FT.SEARCH KNN)
via redis-py — NOT RedisVL's SemanticCache abstraction — for a stable, verifiable API
surface and full control over scoping, TTL and invalidation. The query embedding is reused
from the retrieval step (services.semantic_search_service.generate_embedding), so no second
model is loaded and nothing leaves the box.

Design guarantees (see plan WS2):
  * Fail-safe: ANY error in lookup/store degrades to "no cache" — it never breaks chat.
  * Config-driven (Hard Rule #1): all behaviour from ragSettings.* (enabled/threshold/ttl/...).
  * Correct: entries are scoped by a composite scope_key (prompt hash + language +
    embed model + dim + corpusVersion); a vector hit only counts when the scope matches,
    so a prompt/corpus/model change instantly orphans stale answers.
  * Precision-biased: conservative cosine threshold; callers must gate on response type
    (only cache FOUND answers with evidence) — see the Node bracket in rag-chat.service.ts.

Requires Redis 8 (Query Engine in core). On Redis < 8 the FT.* commands are unavailable and
the cache simply stays disabled (logged once).
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from loguru import logger

try:
    import numpy as np
except Exception:  # pragma: no cover - numpy is a hard dep on the appliance
    np = None  # type: ignore

import redis.asyncio as aredis

# NOTE: redis.commands.search.* symbols (field / query / index_definition) are imported
# LAZILY inside _search_symbols() — their module paths vary across redis-py versions, and a
# lazy import means a missing/renamed module can never crash service boot (the cache just
# disables itself gracefully).

from services.database import get_db
from services.semantic_search_service import semantic_search_service

try:  # the embedding model name is part of the cache scope (model swap => orphan)
    from services.semantic_search_service import EMBEDDING_MODEL as EMBED_MODEL_NAME
except Exception:  # pragma: no cover
    EMBED_MODEL_NAME = "unknown"


@dataclass
class SemanticCacheConfig:
    """Snapshot of ragSettings.* relevant to the response cache."""
    enabled: bool = False               # opt-in until validated (plan WS2)
    threshold: float = 0.95             # cosine SIMILARITY hit gate (precision-biased)
    ttl: int = 21600                    # 6h — shorter than the 24h embedding cache
    min_best_score: float = 0.0         # don't cache low-confidence answers
    max_answer_chars: int = 8000        # guard giant payloads
    corpus_version: str = "1"           # bumped on re-embed / active-prompt change


class SemanticResponseCache:
    """Redis 8 vector-search backed semantic cache for LLM responses."""

    # Dedicated keyspace, isolated by prefix (FT indexes are prefix-scoped, NOT DB-scoped).
    # Uses its own logical DB (REDIS_VECTOR_DB, default 0) so it never collides with the
    # operational DB-2 keys/queues. See plan WS1 "keyspace problem".
    _BASE_PREFIX = "gx10:llmcache:"
    _STATS_PREFIX = "gx10:llmcache:stats:"

    def __init__(self) -> None:
        self._client: Optional[aredis.Redis] = None
        self._unavailable_reason: Optional[str] = None
        self._ensured_indexes: set[str] = set()
        self._config_cache: Optional[SemanticCacheConfig] = None
        self._config_cache_time: float = 0.0
        self._config_cache_ttl = 30.0  # seconds

    # ── connection ──────────────────────────────────────────────────────────
    def _get_client(self) -> Optional[aredis.Redis]:
        if self._client is not None:
            return self._client
        try:
            self._client = aredis.Redis(
                # Dedicated vector/cache Redis (e.g. a separate Redis 8 / redis-stack on :6380)
                # via REDIS_VECTOR_* envs; falls back to the shared REDIS_* if unset.
                host=os.getenv("REDIS_VECTOR_HOST", os.getenv("REDIS_HOST", "localhost")),
                port=int(os.getenv("REDIS_VECTOR_PORT", os.getenv("REDIS_PORT", "6379"))),
                db=int(os.getenv("REDIS_VECTOR_DB", "0")),  # NOT REDIS_DB (=2); see WS1
                password=(os.getenv("REDIS_VECTOR_PASSWORD", os.getenv("REDIS_PASSWORD", "")) or None),
                decode_responses=True,  # we send vectors as raw bytes args; only text is decoded back
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            return self._client
        except Exception as e:  # pragma: no cover
            self._unavailable_reason = f"connect: {e}"
            logger.warning(f"[llmcache] Redis client init failed: {e}")
            return None

    async def warmup(self) -> None:
        """Best-effort: ping Redis + assert the Query Engine is present. Never raises."""
        client = self._get_client()
        if client is None:
            return
        try:
            await client.ping()
            modules = await client.execute_command("MODULE", "LIST")
            has_search = any(b"search" in (m if isinstance(m, bytes) else str(m).encode()).lower()
                             for m in (modules or []))
            cfg = await self.get_config()
            logger.info(
                f"[llmcache] warm: redis ok, search_module={has_search}, "
                f"enabled={cfg.enabled}, threshold={cfg.threshold}, ttl={cfg.ttl}"
            )
            if not has_search:
                logger.warning("[llmcache] Redis Query Engine (search) not detected — "
                               "needs Redis 8. Cache will stay disabled until then.")
        except Exception as e:
            self._unavailable_reason = f"warmup: {e}"
            logger.warning(f"[llmcache] warmup failed (cache disabled): {e}")

    # ── config ──────────────────────────────────────────────────────────────
    async def get_config(self) -> SemanticCacheConfig:
        now = time.time()
        if self._config_cache is not None and now - self._config_cache_time < self._config_cache_ttl:
            return self._config_cache
        cfg = SemanticCacheConfig()
        try:
            pool = await get_db()
            rows = await pool.fetch(
                "SELECT key, value FROM settings WHERE key LIKE 'ragSettings.%'"
            )
            d = {r["key"]: r["value"] for r in rows}
            cfg = SemanticCacheConfig(
                enabled=str(d.get("ragSettings.semanticCacheEnabled", "false")).lower() == "true",
                threshold=float(d.get("ragSettings.semanticCacheThreshold", 0.95)),
                ttl=int(float(d.get("ragSettings.semanticCacheTTL", 21600))),
                min_best_score=float(d.get("ragSettings.semanticCacheMinBestScore", 0.0)),
                max_answer_chars=int(float(d.get("ragSettings.semanticCacheMaxAnswerChars", 8000))),
                corpus_version=str(d.get("ragSettings.corpusVersion", "1")),
            )
        except Exception as e:
            logger.warning(f"[llmcache] config load failed, using defaults: {e}")
        self._config_cache = cfg
        self._config_cache_time = now
        return cfg

    # ── scope + index helpers ────────────────────────────────────────────────
    def _scope_key(self, system_prompt: str, language: str, dim: int, corpus_version: str) -> str:
        """A vector hit only counts when this composite scope matches. Any prompt/model/
        corpus change yields a new scope_key, instantly orphaning stale answers."""
        prompt_hash = hashlib.md5((system_prompt or "").encode("utf-8")).hexdigest()
        raw = f"{prompt_hash}:{(language or 'xx').lower()}:{EMBED_MODEL_NAME}:{dim}:{corpus_version}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def _index_name(self, dim: int) -> str:
        # Dim is baked into the index/prefix so an embedding-model dimension change
        # (e.g. 1536 -> 1024 when moving to a local model) uses a fresh index automatically.
        return f"idx:gx10llmcache:d{dim}"

    def _prefix(self, dim: int) -> str:
        return f"{self._BASE_PREFIX}d{dim}:"

    def _search_symbols(self):
        """Lazily import redis-py search symbols (module paths vary across versions).
        Returns a dict of classes or None. Lazy + guarded so a missing/renamed module can
        never crash service boot — it only disables the cache."""
        cached = getattr(self, "_syms", "unset")
        if cached != "unset":
            return cached
        syms = None
        try:
            from redis.commands.search.field import (
                NumericField, TagField, TextField, VectorField,
            )
            from redis.commands.search.query import Query
            try:
                from redis.commands.search.index_definition import IndexDefinition, IndexType
            except Exception:  # older redis-py used a camelCase module name
                from redis.commands.search.indexDefinition import IndexDefinition, IndexType
            syms = {
                "NumericField": NumericField, "TagField": TagField, "TextField": TextField,
                "VectorField": VectorField, "Query": Query,
                "IndexDefinition": IndexDefinition, "IndexType": IndexType,
            }
        except Exception as e:
            logger.warning(f"[llmcache] redis-py search module unavailable (cache disabled): {e}")
        self._syms = syms
        return syms

    async def _ensure_index(self, client: aredis.Redis, dim: int) -> bool:
        name = self._index_name(dim)
        if name in self._ensured_indexes:
            return True
        syms = self._search_symbols()
        if syms is None:
            return False
        try:
            await client.ft(name).info()
            self._ensured_indexes.add(name)
            return True
        except Exception:
            pass  # not created yet
        try:
            await client.ft(name).create_index(
                fields=[
                    syms["TagField"]("scope_key"),
                    syms["TextField"]("prompt"),
                    syms["TextField"]("response"),
                    syms["TextField"]("sources"),       # JSON string (frozen citations)
                    syms["NumericField"]("created_at"),
                    syms["VectorField"](
                        "embedding", "HNSW",
                        {"TYPE": "FLOAT32", "DIM": dim, "DISTANCE_METRIC": "COSINE"},
                    ),
                ],
                definition=syms["IndexDefinition"](
                    prefix=[self._prefix(dim)], index_type=syms["IndexType"].HASH
                ),
            )
            self._ensured_indexes.add(name)
            logger.info(f"[llmcache] created index {name} (dim={dim})")
            return True
        except Exception as e:
            logger.warning(f"[llmcache] could not create index {name}: {e}")
            return False

    def _to_bytes(self, vec: List[float]):
        if np is None:
            raise RuntimeError("numpy unavailable")
        return np.asarray(vec, dtype=np.float32).tobytes()

    async def _incr(self, client: aredis.Redis, stat: str, by: int = 1) -> None:
        try:
            await client.incrby(f"{self._STATS_PREFIX}{stat}", by)
        except Exception:
            pass  # stats are best-effort

    # ── public API (called by the FastAPI router) ────────────────────────────
    async def lookup(self, query: str, system_prompt: str = "", language: str = "xx") -> Dict[str, Any]:
        """Return {hit, answer?, sources?, similarity?, distance?}. Never raises."""
        miss = {"hit": False}
        if not query or not query.strip():
            return miss
        cfg = await self.get_config()
        if not cfg.enabled:
            return miss
        client = self._get_client()
        if client is None:
            return miss
        try:
            vec = await semantic_search_service.generate_embedding(query, use_cache=True)
            dim = len(vec)
            if not await self._ensure_index(client, dim):
                return miss
            syms = self._search_symbols()
            if syms is None:
                return miss
            scope = self._scope_key(system_prompt, language, dim, cfg.corpus_version)
            q = (
                syms["Query"](f"(@scope_key:{{{scope}}})=>[KNN 1 @embedding $vec AS dist]")
                .sort_by("dist", asc=True)
                .return_fields("response", "sources", "dist")
                .dialect(2)
            )
            res = await client.ft(self._index_name(dim)).search(
                q, query_params={"vec": self._to_bytes(vec)}
            )
            docs = getattr(res, "docs", []) or []
            if docs:
                doc = docs[0]
                distance = float(getattr(doc, "dist", 1.0))
                similarity = 1.0 - distance
                if similarity >= cfg.threshold:
                    await self._incr(client, "hits")
                    try:
                        sources = json.loads(getattr(doc, "sources", "[]") or "[]")
                    except Exception:
                        sources = []
                    return {
                        "hit": True,
                        "answer": getattr(doc, "response", "") or "",
                        "sources": sources,
                        "similarity": round(similarity, 4),
                        "distance": round(distance, 4),
                    }
            await self._incr(client, "misses")
            return miss
        except Exception as e:
            logger.warning(f"[llmcache] lookup error (treated as miss): {e}")
            return miss

    async def store(
        self,
        query: str,
        answer: str,
        sources: Optional[List[Any]] = None,
        system_prompt: str = "",
        language: str = "xx",
        llm_ms: int = 0,
    ) -> Dict[str, Any]:
        """Persist a (query -> answer+sources) entry. Never raises. Returns {stored: bool}."""
        skipped = {"stored": False}
        cfg = await self.get_config()
        if not cfg.enabled:
            return skipped
        if not query or not query.strip() or not answer or not answer.strip():
            return skipped
        if len(answer) > cfg.max_answer_chars:
            await self._incr_safe("skipped")
            return skipped
        client = self._get_client()
        if client is None:
            return skipped
        try:
            vec = await semantic_search_service.generate_embedding(query, use_cache=True)
            dim = len(vec)
            if not await self._ensure_index(client, dim):
                return skipped
            scope = self._scope_key(system_prompt, language, dim, cfg.corpus_version)
            # Key is unique per (scope, query) so paraphrases create distinct rows but an
            # identical re-ask overwrites rather than duplicates.
            qhash = hashlib.md5(f"{scope}:{query.strip().lower()}".encode("utf-8")).hexdigest()
            key = f"{self._prefix(dim)}{qhash}"
            mapping = {
                "scope_key": scope,
                "prompt": query[: cfg.max_answer_chars],
                "response": answer,
                "sources": json.dumps(sources or [], ensure_ascii=False)[: cfg.max_answer_chars * 4],
                "created_at": int(time.time()),
                "embedding": self._to_bytes(vec),
            }
            await client.hset(key, mapping=mapping)
            if cfg.ttl and cfg.ttl > 0:
                await client.expire(key, cfg.ttl)
            await self._incr(client, "writes")
            if llm_ms and llm_ms > 0:
                await self._incr(client, "saved_ms_basis", int(llm_ms))  # credited on hits in stats()
            return {"stored": True, "key": key}
        except Exception as e:
            logger.warning(f"[llmcache] store error (skipped): {e}")
            return skipped

    async def _incr_safe(self, stat: str, by: int = 1) -> None:
        client = self._get_client()
        if client is not None:
            await self._incr(client, stat, by)

    async def stats(self) -> Dict[str, Any]:
        """Hit/miss/savings stats — mirrors the OCR cache stats shape. Never raises."""
        out = {
            "enabled": False, "available": False, "hits": 0, "misses": 0, "writes": 0,
            "skipped": 0, "hitRate": 0.0, "savedMs": 0, "avgSavedMsPerHit": 0,
            "totalEntries": 0,
        }
        try:
            cfg = await self.get_config()
            out["enabled"] = cfg.enabled
            client = self._get_client()
            if client is None:
                return out
            await client.ping()
            out["available"] = True

            async def _num(stat: str) -> int:
                try:
                    v = await client.get(f"{self._STATS_PREFIX}{stat}")
                    return int(v) if v is not None else 0
                except Exception:
                    return 0

            hits = await _num("hits")
            misses = await _num("misses")
            writes = await _num("writes")
            skipped = await _num("skipped")
            saved_basis = await _num("saved_ms_basis")
            total = hits + misses
            # Approximate compute saved: average miss-time LLM cost credited per hit.
            avg_basis = (saved_basis / writes) if writes else 0
            saved_ms = int(avg_basis * hits)
            out.update({
                "hits": hits, "misses": misses, "writes": writes, "skipped": skipped,
                "hitRate": round(hits / total, 4) if total else 0.0,
                "savedMs": saved_ms,
                "avgSavedMsPerHit": int(avg_basis),
            })
            return out
        except Exception as e:
            logger.warning(f"[llmcache] stats error: {e}")
            return out


# Global singleton (matches services.semantic_search_service.semantic_search_service pattern)
semantic_response_cache = SemanticResponseCache()
