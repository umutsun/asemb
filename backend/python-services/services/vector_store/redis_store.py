"""
RedisVectorStore — Redis 8 Vector Sets / Query Engine implementation of VectorStore (WS3-B).

The "Redis as a vector/context store" half of the Redis Iris Search pillar. Generalises the
proven FT.SEARCH KNN pattern already shipping in `semantic_response_cache.py` into a reusable
backend. Intended for the BOUNDED subset where Redis genuinely wins (the semantic cache index,
and small/hot `messages`/agent-memory vectors) — NOT the cold corpus, which stays on pgvector
(RAM + Turkish-BM25 parity + single-source-of-truth, per the WS3 ADR).

Honesty (`supports()`): Redis cannot faithfully replicate our Turkish-config Postgres BM25, so
`bm25_search` returns [] and `supports('bm25')` is False — the engine keeps pgvector for that.

Boot-safe: redis.commands.search.* symbols are imported lazily; on Redis < 8 (no Query Engine)
every method degrades to empty/no-op. Requires numpy for float32 vector encoding.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore

import redis.asyncio as aredis

from .base import VectorStore

# Maps the logical collections to short index/prefix tags.
_COLLECTION_TAG = {
    "unified": "unified",
    "documents": "documents",
    "scrapes": "scrapes",
    "messages": "messages",
}


class RedisVectorStore(VectorStore):
    _BASE_PREFIX = "gx10vec:"
    _CAPS = {"source_table_filter", "multi_collection"}

    def __init__(self) -> None:
        self._client: Optional[aredis.Redis] = None
        self._ensured: set[str] = set()
        self._syms: Any = "unset"

    def supports(self, capability: str) -> bool:
        return capability in self._CAPS

    # ── connection / lazy symbols (mirrors semantic_response_cache for boot safety) ──
    def _get_client(self) -> Optional[aredis.Redis]:
        if self._client is not None:
            return self._client
        try:
            self._client = aredis.Redis(
                # Dedicated vector Redis (separate Redis 8 / redis-stack) via REDIS_VECTOR_*,
                # falling back to the shared REDIS_* if unset.
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
            logger.warning(f"[RedisVectorStore] client init failed: {e}")
            return None

    def _search_symbols(self):
        if self._syms != "unset":
            return self._syms
        syms = None
        try:
            from redis.commands.search.field import NumericField, TagField, TextField, VectorField
            from redis.commands.search.query import Query
            try:
                from redis.commands.search.index_definition import IndexDefinition, IndexType
            except Exception:
                from redis.commands.search.indexDefinition import IndexDefinition, IndexType
            syms = {
                "NumericField": NumericField, "TagField": TagField, "TextField": TextField,
                "VectorField": VectorField, "Query": Query,
                "IndexDefinition": IndexDefinition, "IndexType": IndexType,
            }
        except Exception as e:
            logger.warning(f"[RedisVectorStore] redis-py search unavailable (needs Redis 8): {e}")
        self._syms = syms
        return syms

    def _index(self, collection: str, dim: int) -> str:
        return f"idx:{self._BASE_PREFIX}{_COLLECTION_TAG.get(collection, collection)}:d{dim}"

    def _prefix(self, collection: str, dim: int) -> str:
        return f"{self._BASE_PREFIX}{_COLLECTION_TAG.get(collection, collection)}:d{dim}:"

    def _to_bytes(self, embedding: List[float]):
        if np is None:
            raise RuntimeError("numpy unavailable")
        return np.asarray(embedding, dtype=np.float32).tobytes()

    async def _ensure_index(self, client: aredis.Redis, collection: str, dim: int) -> bool:
        name = self._index(collection, dim)
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
                    syms["TagField"]("source_table"),
                    syms["TagField"]("source_type"),
                    syms["TagField"]("source_id"),
                    syms["TextField"]("content"),
                    syms["TextField"]("metadata"),
                    syms["VectorField"](
                        "embedding", "HNSW",
                        {"TYPE": "FLOAT32", "DIM": dim, "DISTANCE_METRIC": "COSINE"},
                    ),
                ],
                definition=syms["IndexDefinition"](
                    prefix=[self._prefix(collection, dim)], index_type=syms["IndexType"].HASH
                ),
            )
            self._ensured.add(name)
            logger.info(f"[RedisVectorStore] created index {name} (dim={dim})")
            return True
        except Exception as e:
            logger.warning(f"[RedisVectorStore] index create failed {name}: {e}")
            return False

    # ── read: vector ──────────────────────────────────────────────────────────
    async def similarity_search(
        self, collection, query_embedding, limit, *, source_table=None
    ) -> List[Dict[str, Any]]:
        client = self._get_client()
        if client is None:
            return []
        dim = len(query_embedding)
        if not await self._ensure_index(client, collection, dim):
            return []
        syms = self._search_symbols()
        if syms is None:
            return []
        try:
            prefilter = f"@source_table:{{{source_table}}}" if source_table else "*"
            q = (
                syms["Query"](f"({prefilter})=>[KNN {int(limit)} @embedding $vec AS dist]")
                .sort_by("dist", asc=True)
                .return_fields("content", "source_table", "source_type", "source_id", "metadata", "dist")
                .paging(0, int(limit))
                .dialect(2)
            )
            res = await client.ft(self._index(collection, dim)).search(
                q, query_params={"vec": self._to_bytes(query_embedding)}
            )
            out: List[Dict[str, Any]] = []
            for doc in getattr(res, "docs", []) or []:
                meta_raw = getattr(doc, "metadata", "") or ""
                try:
                    metadata = json.loads(meta_raw) if meta_raw else {}
                except Exception:
                    metadata = {}
                out.append({
                    "id": getattr(doc, "id", None),
                    "content": getattr(doc, "content", ""),
                    "source_table": getattr(doc, "source_table", None),
                    "source_type": getattr(doc, "source_type", None),
                    "source_id": getattr(doc, "source_id", None),
                    "metadata": metadata,
                    "similarity_score": 1.0 - float(getattr(doc, "dist", 1.0)),
                    "search_source": _COLLECTION_TAG.get(collection, collection),
                })
            return out
        except Exception as e:
            logger.warning(f"[RedisVectorStore] similarity_search error: {e}")
            return []

    async def fetch_by_ids(self, collection: str, ids: Sequence[int]) -> List[Dict[str, Any]]:
        # Redis keys are content-addressed by source_id under the collection prefix; without a
        # fixed dim we cannot reconstruct the key, so this is a no-op until wiring fixes the dim.
        return []

    # ── read: lexical (not faithfully replicable in Redis — keep pgvector) ──────
    async def bm25_search(self, query, limit, *, max_excerpt=1500, fts_language="turkish"):
        return []

    # ── write / lifecycle ─────────────────────────────────────────────────────
    async def upsert(self, collection: str, rows: List[Dict[str, Any]]) -> int:
        if not rows:
            return 0
        client = self._get_client()
        if client is None:
            return 0
        n = 0
        for r in rows:
            emb = r.get("embedding")
            if not emb:
                continue
            dim = len(emb)
            if not await self._ensure_index(client, collection, dim):
                return n
            try:
                sid = str(r.get("source_id", ""))
                key = f"{self._prefix(collection, dim)}{sid}"
                await client.hset(key, mapping={
                    "source_table": str(r.get("source_table", "")),
                    "source_type": str(r.get("source_type", "")),
                    "source_id": sid,
                    "content": (r.get("content") or "")[:10000],
                    "metadata": json.dumps(r.get("metadata") or {}, ensure_ascii=False),
                    "embedding": self._to_bytes(emb),
                })
                n += 1
            except Exception as e:
                logger.warning(f"[RedisVectorStore] upsert error: {e}")
        return n

    async def exists_by_hash(self, hashes: Sequence[str]) -> set:
        return set()  # dedup tracked upstream; not indexed in Redis here

    # ── introspection ─────────────────────────────────────────────────────────
    async def list_source_tables(self) -> set:
        return set()  # not aggregated in Redis; engine uses pgvector for this

    async def stats(self) -> Dict[str, Any]:
        client = self._get_client()
        out: Dict[str, Any] = {"total": 0, "by_index": {}}
        if client is None:
            return out
        try:
            total = 0
            for name in list(self._ensured):
                try:
                    info = await client.ft(name).info()
                    num = int(info.get("num_docs", 0)) if isinstance(info, dict) else 0
                    out["by_index"][name] = num
                    total += num
                except Exception:
                    pass
            out["total"] = total
        except Exception as e:
            logger.warning(f"[RedisVectorStore] stats error: {e}")
        return out

    async def index_health(self) -> Dict[str, Any]:
        return {"backend": "redis", "indexes": list(self._ensured), "has_hnsw": bool(self._ensured)}
