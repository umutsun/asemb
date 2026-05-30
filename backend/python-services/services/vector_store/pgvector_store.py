"""
PgvectorStore — faithful pgvector implementation of VectorStore (WS3-A).

Every primitive wraps the EXACT SQL currently inlined in semantic_search_service.py
(vector_search per-collection queries, bm25_search) and embedding_service.py (unified upsert),
so wiring the engine to `self.store.*` is behaviour-preserving (to be confirmed by the parity
test against a real Postgres). The engine keeps its general-first + backfill + dedup +
threshold + scoring orchestration; this store only returns ranked hit dicts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

from services.database import get_db
from .base import VectorStore

# Per-collection projection (column list before the similarity expr) + table + search_source
# literal. 'unified' selects the REAL source_table/source_type columns; the single-table
# collections use literals — byte-identical to semantic_search_service.vector_search.
_COLLECTION_SELECT = {
    "unified": (
        "id, content, source_table, source_type, source_id, metadata",
        "unified_embeddings",
        "unified",
    ),
    "documents": (
        "id, chunk_text as content, 'document_embeddings' as source_table, "
        "'document' as source_type, document_id as source_id, metadata",
        "document_embeddings",
        "documents",
    ),
    "scrapes": (
        "id, content, 'scrape_embeddings' as source_table, 'web' as source_type, "
        "id::text as source_id, metadata",
        "scrape_embeddings",
        "scrapes",
    ),
    "messages": (
        "id, content, 'message_embeddings' as source_table, 'chat' as source_type, "
        "message_id::text as source_id, metadata",
        "message_embeddings",
        "messages",
    ),
}


class PgvectorStore(VectorStore):
    _CAPS = {"source_table_filter", "bm25", "multi_collection"}
    _bm25_available: Optional[bool] = None  # class-cached column probe (mirrors the engine)

    def supports(self, capability: str) -> bool:
        return capability in self._CAPS

    @staticmethod
    def _vec(embedding: List[float]) -> str:
        # pgvector string literal — identical to embedding_service / semantic_search_service.
        return "[" + ",".join(str(x) for x in embedding) + "]"

    # ── read: vector ──────────────────────────────────────────────────────────
    async def similarity_search(
        self,
        collection: str,
        query_embedding: List[float],
        limit: int,
        *,
        source_table: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if collection not in _COLLECTION_SELECT:
            raise ValueError(f"unknown collection: {collection}")
        cols, table, search_source = _COLLECTION_SELECT[collection]
        vec = self._vec(query_embedding)
        pool = await get_db()
        # The source_table filter only applies to the multi-table 'unified' collection
        # (mirrors the engine's high-priority backfill query).
        if source_table and collection == "unified":
            sql = f"""
                SELECT {cols},
                       1 - (embedding <=> $1::vector) as similarity_score,
                       '{search_source}' as search_source
                FROM {table}
                WHERE embedding IS NOT NULL AND source_table = $2
                ORDER BY embedding <=> $1::vector
                LIMIT $3
            """
            rows = await pool.fetch(sql, vec, source_table, limit)
        else:
            sql = f"""
                SELECT {cols},
                       1 - (embedding <=> $1::vector) as similarity_score,
                       '{search_source}' as search_source
                FROM {table}
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> $1::vector
                LIMIT $2
            """
            rows = await pool.fetch(sql, vec, limit)
        return [dict(r) for r in rows]

    async def fetch_by_ids(self, collection: str, ids: Sequence[int]) -> List[Dict[str, Any]]:
        if not ids:
            return []
        cols, table, search_source = _COLLECTION_SELECT.get(collection, _COLLECTION_SELECT["unified"])
        pool = await get_db()
        sql = f"""
            SELECT {cols}, 1.0 as similarity_score, '{search_source}' as search_source
            FROM {table}
            WHERE id = ANY($1::int[])
        """
        rows = await pool.fetch(sql, list(ids))
        return [dict(r) for r in rows]

    # ── read: lexical ─────────────────────────────────────────────────────────
    async def bm25_search(
        self,
        query: str,
        limit: int,
        *,
        max_excerpt: int = 1500,
        fts_language: str = "turkish",
    ) -> List[Dict[str, Any]]:
        pool = await get_db()
        if PgvectorStore._bm25_available is None:
            try:
                exists = await pool.fetchval(
                    """
                    SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_name = 'unified_embeddings' AND column_name = 'search_vector'
                    """
                )
                PgvectorStore._bm25_available = (exists or 0) > 0
            except Exception:
                PgvectorStore._bm25_available = False
        if not PgvectorStore._bm25_available:
            return []
        try:
            rows = await pool.fetch(
                """
                SELECT id, LEFT(content, $3) as content, source_table, source_type,
                       source_id, metadata,
                       ts_rank_cd(search_vector, plainto_tsquery($4::regconfig, $1), 32) as similarity_score,
                       'bm25' as search_source
                FROM unified_embeddings
                WHERE search_vector @@ plainto_tsquery($4::regconfig, $1)
                ORDER BY similarity_score DESC
                LIMIT $2
                """,
                query, limit, max_excerpt, fts_language,
            )
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"[PgvectorStore] bm25 error: {e}")
            return []

    # ── write / lifecycle ─────────────────────────────────────────────────────
    async def upsert(self, collection: str, rows: List[Dict[str, Any]]) -> int:
        if collection != "unified":
            # documents/scrapes/messages writers live in their own services for now;
            # extracted during the wiring step.
            raise NotImplementedError(f"upsert not yet implemented for collection={collection}")
        if not rows:
            return 0
        pool = await get_db()
        n = 0
        for r in rows:
            vec = self._vec(r["embedding"])
            await pool.execute(
                """
                INSERT INTO unified_embeddings
                (source_type, source_table, source_id, content, embedding, model_used, tokens_used, created_at)
                VALUES ($1, $2, $3, $4, $5::vector, $6, $7, NOW())
                ON CONFLICT (source_table, source_id) DO UPDATE
                SET content = EXCLUDED.content,
                    embedding = EXCLUDED.embedding,
                    tokens_used = EXCLUDED.tokens_used,
                    updated_at = NOW()
                """,
                r.get("source_type", "document"),
                r["source_table"],
                int(r["source_id"]),
                (r.get("content") or "")[:10000],
                vec,
                r.get("model_used"),
                int(r.get("tokens_used", 0)),
            )
            n += 1
        return n

    async def exists_by_hash(self, hashes: Sequence[str]) -> set:
        if not hashes:
            return set()
        pool = await get_db()
        try:
            rows = await pool.fetch(
                "SELECT content_hash FROM unified_embeddings WHERE content_hash = ANY($1::text[])",
                list(hashes),
            )
            return {r["content_hash"] for r in rows}
        except Exception:
            return set()

    # ── introspection ─────────────────────────────────────────────────────────
    async def list_source_tables(self) -> set:
        pool = await get_db()
        try:
            rows = await pool.fetch(
                "SELECT DISTINCT source_table FROM unified_embeddings WHERE source_table IS NOT NULL"
            )
            return {r["source_table"] for r in rows}
        except Exception:
            return set()

    async def stats(self) -> Dict[str, Any]:
        pool = await get_db()
        out: Dict[str, Any] = {"total": 0, "by_source_table": {}}
        try:
            total = await pool.fetchval("SELECT COUNT(*) FROM unified_embeddings")
            out["total"] = int(total or 0)
            rows = await pool.fetch(
                "SELECT source_table, COUNT(*) as c FROM unified_embeddings GROUP BY source_table"
            )
            out["by_source_table"] = {r["source_table"]: int(r["c"]) for r in rows}
        except Exception as e:
            logger.warning(f"[PgvectorStore] stats error: {e}")
        return out

    async def index_health(self) -> Dict[str, Any]:
        pool = await get_db()
        try:
            rows = await pool.fetch(
                """
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'unified_embeddings' AND indexdef ILIKE '%hnsw%'
                """
            )
            names = [r["indexname"] for r in rows]
            return {"hnsw_indexes": names, "has_hnsw": len(names) > 0}
        except Exception as e:
            return {"error": str(e), "has_hnsw": False}
