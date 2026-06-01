"""
Agent Memory endpoints (Redis Iris "Agent Memory" — OSS/native equivalent, WS4-A).

Mounted under /api/python/agent-memory. Called by the Node orchestrator
(PythonIntegrationService.agentMemoryStore/Recall/Stats). The Node side runs LLM extraction
on the configured provider and posts the memories here; this layer only embeds, dedups, and
dual-writes (Postgres durable + Redis hot). All handlers are fail-safe — they swallow errors
and return an empty/no-op result so the chat path is never blocked.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel, Field

from services.agent_memory_service import agent_memory_service

router = APIRouter()


class MemoryItem(BaseModel):
    content: str = Field(..., description="The memory text (a fact, preference, summary, episode)")
    memory_type: str = Field("episodic", description="discrete|summary|preference|episodic")
    topics: List[str] = Field(default_factory=list, description="Extracted topics/entities")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    importance: float = Field(0.5, description="Promotion/eviction signal 0..1")


class StoreRequest(BaseModel):
    items: List[MemoryItem] = Field(default_factory=list)
    namespace: str = Field("default", description="Tenant/instance scope")
    user_id: Optional[str] = Field(None, description="Memory owner (set for dedup + recall)")
    session_id: Optional[str] = Field(None, description="Current session, if live-extracted")
    source_session_id: Optional[str] = Field(None, description="Session this was promoted from")


class StoreResponse(BaseModel):
    stored: int = 0
    deduped: int = 0
    ids: List[str] = Field(default_factory=list)


class RecallRequest(BaseModel):
    query: str = Field(..., description="Text to recall relevant memories for")
    namespace: str = Field("default")
    user_id: Optional[str] = Field(None)
    limit: int = Field(5, description="Max memories to return")
    memory_types: Optional[List[str]] = Field(None, description="Filter to these types")


class RecallResponse(BaseModel):
    memories: List[Dict[str, Any]] = Field(default_factory=list)


class RehydrateRequest(BaseModel):
    namespace: Optional[str] = Field(None, description="Limit to one namespace (default: all)")
    drop_first: bool = Field(False, description="Purge stale gx10mem: keys before rebuild (use after PG deletes)")


class RehydrateResponse(BaseModel):
    rehydrated: int = 0
    skipped: int = 0
    purged: int = 0
    scanned: int = 0
    error: Optional[str] = None


@router.post("/store", response_model=StoreResponse)
async def store(request: StoreRequest) -> StoreResponse:
    """Embed + dedup + dual-write extracted memories. Returns zeros on any error."""
    try:
        result = await agent_memory_service.store(
            [i.dict() for i in request.items],
            namespace=request.namespace,
            user_id=request.user_id,
            session_id=request.session_id,
            source_session_id=request.source_session_id,
        )
        return StoreResponse(**result)
    except Exception as e:  # defense in depth — service already swallows
        logger.warning(f"[agent-memory] store handler error: {e}")
        return StoreResponse()


@router.post("/recall", response_model=RecallResponse)
async def recall(request: RecallRequest) -> RecallResponse:
    """Namespace/user-scoped semantic recall. Returns [] on any error (graceful)."""
    try:
        memories = await agent_memory_service.recall(
            query=request.query,
            namespace=request.namespace,
            user_id=request.user_id,
            limit=request.limit,
            memory_types=request.memory_types,
        )
        return RecallResponse(memories=memories)
    except Exception as e:
        logger.warning(f"[agent-memory] recall handler error: {e}")
        return RecallResponse()


@router.post("/rehydrate", response_model=RehydrateResponse)
async def rehydrate(request: RehydrateRequest) -> RehydrateResponse:
    """Rebuild the Redis hot index from the Postgres source-of-truth after a Redis
    flush/restart (repairs dual-write drift). Reuses stored embeddings — no re-embedding,
    no writes to Postgres. Fail-safe: returns counts with an `error` field, never raises."""
    try:
        result = await agent_memory_service.rehydrate(
            namespace=request.namespace,
            drop_first=request.drop_first,
        )
        return RehydrateResponse(**result)
    except Exception as e:
        logger.warning(f"[agent-memory] rehydrate handler error: {e}")
        return RehydrateResponse(error="handler_error")


@router.get("/stats")
async def stats(namespace: Optional[str] = None) -> dict:
    """Memory counts by type/backend for the Settings UI + health (incl. redis_total + drift)."""
    return await agent_memory_service.stats(namespace)
