"""
Semantic LLM-response cache endpoints (Redis Iris "LangCache" — OSS equivalent, WS2).

Mounted under /api/python/llm-cache. Called by the Node orchestrator
(PythonIntegrationService.llmCacheLookup/Store/Stats) which brackets the LLM
generation call in rag-chat.service.ts. All handlers are fail-safe — the cache
service swallows errors and returns a miss/no-op so chat is never blocked.
"""

from typing import Any, List, Optional

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel, Field

from services.semantic_response_cache import semantic_response_cache

router = APIRouter()


class LookupRequest(BaseModel):
    query: str = Field(..., description="User query text")
    system_prompt: str = Field("", description="Resolved system prompt (scopes the cache)")
    language: str = Field("xx", description="Response language code (scopes the cache)")


class LookupResponse(BaseModel):
    hit: bool = False
    answer: Optional[str] = None
    sources: Optional[List[Any]] = None
    similarity: Optional[float] = None
    distance: Optional[float] = None


class StoreRequest(BaseModel):
    query: str = Field(..., description="User query text")
    answer: str = Field(..., description="Final LLM answer to cache")
    sources: List[Any] = Field(default_factory=list, description="Frozen citation sources")
    system_prompt: str = Field("", description="Resolved system prompt (scopes the cache)")
    language: str = Field("xx", description="Response language code (scopes the cache)")
    llm_ms: int = Field(0, description="LLM latency of this (miss) generation, for savings stats")


class StoreResponse(BaseModel):
    stored: bool = False
    key: Optional[str] = None


@router.post("/lookup", response_model=LookupResponse)
async def lookup(request: LookupRequest) -> LookupResponse:
    """Semantic lookup. Returns hit=False on any error (graceful)."""
    try:
        result = await semantic_response_cache.lookup(
            query=request.query,
            system_prompt=request.system_prompt,
            language=request.language,
        )
        return LookupResponse(**result)
    except Exception as e:  # defense in depth — service already swallows
        logger.warning(f"[llm-cache] lookup handler error: {e}")
        return LookupResponse(hit=False)


@router.post("/store", response_model=StoreResponse)
async def store(request: StoreRequest) -> StoreResponse:
    """Store a (query -> answer+sources) entry. Returns stored=False on any error."""
    try:
        result = await semantic_response_cache.store(
            query=request.query,
            answer=request.answer,
            sources=request.sources,
            system_prompt=request.system_prompt,
            language=request.language,
            llm_ms=request.llm_ms,
        )
        return StoreResponse(**result)
    except Exception as e:
        logger.warning(f"[llm-cache] store handler error: {e}")
        return StoreResponse(stored=False)


@router.get("/stats")
async def stats() -> dict:
    """Cache hit/miss/savings stats for the Settings UI + /gx10-health."""
    return await semantic_response_cache.stats()
