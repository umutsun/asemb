"""
VectorStore abstraction (WS3-A) — the seam that decouples retrieval from pgvector and
opens the door to Redis 8 Vector Sets ("Redis as a vector/context store", the Redis Iris
Search pillar).

This package is ADDITIVE: it provides the interface + a faithful pgvector implementation,
but the live engine (semantic_search_service.py) is NOT yet wired to it. Wiring is a
behaviour-preserving refactor gated by the parity test (tests/test_pgvector_store_parity.py),
which must run against a real Postgres — deferred to the runtime/appliance phase.

Canonical hit dict (returned by similarity/bm25 searches) — identical to what the engine
already builds via `dict(row)`, so wiring is byte-compatible:
    {id, content, source_table, source_type, source_id, metadata, similarity_score, search_source}
"""

from .base import VectorStore, COLLECTIONS
from .pgvector_store import PgvectorStore
from .redis_store import RedisVectorStore
from .factory import get_vector_store

__all__ = ["VectorStore", "PgvectorStore", "RedisVectorStore", "get_vector_store", "COLLECTIONS"]
