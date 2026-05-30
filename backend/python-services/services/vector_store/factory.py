"""
VectorStore factory (WS3-A).

Selects the backend via the VECTOR_BACKEND env var (default 'pgvector'). 'redis' and 'dual'
are reserved for WS3-B (RedisVectorStore + DualVectorStore shadow-run) — the engine is not
yet wired to the store, so these intentionally raise until that work lands.
"""

from __future__ import annotations

import os
from typing import Dict, Optional

from .base import VectorStore
from .pgvector_store import PgvectorStore

_singletons: Dict[str, VectorStore] = {}


def get_vector_store(backend: Optional[str] = None) -> VectorStore:
    name = (backend or os.getenv("VECTOR_BACKEND", "pgvector")).lower()
    if name in _singletons:
        return _singletons[name]
    if name == "pgvector":
        store: VectorStore = PgvectorStore()
    elif name == "redis":
        from .redis_store import RedisVectorStore
        store = RedisVectorStore()
    elif name == "dual":
        raise NotImplementedError(
            "VECTOR_BACKEND='dual' (DualVectorStore shadow-run) reserved for the migration phase"
        )
    else:
        raise ValueError(f"unknown VECTOR_BACKEND: {name}")
    _singletons[name] = store
    return store
