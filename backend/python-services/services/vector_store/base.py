"""
VectorStore interface (WS3-A).

The store exposes low-level PRIMITIVES (one vector/keyword query, one upsert, introspection).
All higher-level RAG orchestration — multi-table general-first + high-priority backfill,
seen_ids/seen_source_ids dedup, similarity thresholds, source-type hierarchy weighting, BM25
RRF fusion, reranking, penalties — stays in the engine (semantic_search_service.py) and
operates on the dicts the store returns. This keeps the store backend-swappable without
moving domain logic into it.

`supports(capability)` is the honesty hook: a non-pgvector backend returns False for
primitives it can't faithfully replicate (e.g. Turkish-config BM25), letting the engine keep
pgvector for those paths. Recognised capabilities:
    'source_table_filter' | 'bm25' | 'keyword_ilike' | 'multi_collection'
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Sequence

# Logical collections, mapped by each backend to a concrete table/index.
COLLECTIONS = ("unified", "documents", "scrapes", "messages")

# Canonical keys present in every hit dict returned by similarity_search / bm25_search.
HIT_KEYS = (
    "id", "content", "source_table", "source_type",
    "source_id", "metadata", "similarity_score", "search_source",
)


class VectorStore(ABC):
    """Backend-agnostic vector + lexical primitive store."""

    # ── read: vector ──────────────────────────────────────────────────────────
    @abstractmethod
    async def similarity_search(
        self,
        collection: str,
        query_embedding: List[float],
        limit: int,
        *,
        source_table: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Top-`limit` cosine-nearest rows of `collection`. If `source_table` is given
        (only meaningful for the multi-table 'unified' collection), restrict to it.
        Returns dicts with HIT_KEYS, ordered by ascending cosine distance."""

    @abstractmethod
    async def fetch_by_ids(self, collection: str, ids: Sequence[int]) -> List[Dict[str, Any]]:
        """Hydrate specific rows by primary id (used for graph-related chunk injection)."""

    # ── read: lexical ─────────────────────────────────────────────────────────
    @abstractmethod
    async def bm25_search(
        self,
        query: str,
        limit: int,
        *,
        max_excerpt: int = 1500,
        fts_language: str = "turkish",
    ) -> List[Dict[str, Any]]:
        """Postgres full-text BM25 over unified_embeddings.search_vector. Returns [] if the
        column/feature is unavailable (graceful). `fts_language` is a regconfig (WS4)."""

    # ── write / lifecycle ─────────────────────────────────────────────────────
    @abstractmethod
    async def upsert(self, collection: str, rows: List[Dict[str, Any]]) -> int:
        """Insert/update embedding rows. Each row: {source_type, source_table, source_id,
        content, embedding(list[float]), model_used, tokens_used}. Returns count written."""

    @abstractmethod
    async def exists_by_hash(self, hashes: Sequence[str]) -> set:
        """Subset of `hashes` already present (content_hash dedup). Empty set if unsupported."""

    # ── introspection ─────────────────────────────────────────────────────────
    @abstractmethod
    async def list_source_tables(self) -> set:
        """Distinct source_table values present in the unified collection."""

    @abstractmethod
    async def stats(self) -> Dict[str, Any]:
        """Row counts (total + per source_table) for dashboards/health."""

    @abstractmethod
    async def index_health(self) -> Dict[str, Any]:
        """Vector-index presence/type info (e.g. HNSW) for diagnostics."""

    # ── capability negotiation ────────────────────────────────────────────────
    def supports(self, capability: str) -> bool:  # noqa: D401 - default deny
        return False
