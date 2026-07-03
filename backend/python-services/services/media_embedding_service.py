"""
Media Embedding Service — Cross-Modal (CLIP) provider abstraction
=================================================================

Produces image AND text embeddings that land in the SAME vector space, so a text
query can retrieve images (text->image) and vice-versa. This is the "true CLIP"
path that lives ALONGSIDE the existing 1536-d text space (see embedding_service.py
and semantic_search_service._get_embedding_config). It does NOT touch that path.

Design mirrors semantic_search_service._get_embedding_config:
  - config is read from the `settings` table under the canonical `mediaEmbedding.*`
    prefix (NOT the inconsistent embedding.* keys),
  - config is cached with a short TTL,
  - the master flag `mediaEmbedding.enabled` defaults to 'false' so nothing changes
    until an admin turns it on.

Hybrid hosting requirement:
  - Online VPS  -> API providers (Jina CLIP v2 [default], Cohere embed-v4, Voyage
    multimodal-3). All multilingual, all support a 1024-d output.
  - Air-gapped GX10 -> OpenClipOnnxProvider (onnxruntime + Pillow ONLY, never torch).
    Model files are baked into the appliance image; see _OpenClipOnnxProvider.

All providers normalize output to MEDIA_DIM (default 1024) so it matches the
media_embeddings.embedding column width (see 20260625_media_embeddings.sql).
"""

import os
import time
import base64
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional

import aiohttp
import numpy as np
from loguru import logger

from services.database import get_db

# Column width of media_embeddings.embedding. Keep in sync with the migration.
MEDIA_DIM = 1024
_CONFIG_TTL = 60.0  # seconds


@dataclass
class MediaEmbeddingConfig:
    enabled: bool
    provider: str          # jina | cohere | voyage | openclip-onnx
    model: str
    dimension: int
    api_key: Optional[str]


# ---------------------------------------------------------------------------
# Config loading (settings table, cached) — mirrors _get_embedding_config
# ---------------------------------------------------------------------------
_cached_config: Optional[MediaEmbeddingConfig] = None
_cached_config_time: float = 0.0


async def get_media_embedding_config() -> MediaEmbeddingConfig:
    """Load mediaEmbedding.* configuration from the settings table (cached)."""
    global _cached_config, _cached_config_time
    now = time.time()
    if _cached_config is not None and (now - _cached_config_time) < _CONFIG_TTL:
        return _cached_config

    provider, model, api_key = "jina", "jina-clip-v2", None
    enabled, dimension = False, MEDIA_DIM
    try:
        pool = await get_db()
        rows = await pool.fetch("""
            SELECT key, value FROM settings WHERE key LIKE 'mediaEmbedding.%'
        """)
        s = {r["key"].split(".", 1)[1]: r["value"] for r in rows}

        enabled = str(s.get("enabled", "false")).lower() == "true"
        provider = (s.get("provider") or "jina").lower()
        model = s.get("model") or _default_model_for(provider)
        try:
            dimension = int(s.get("dimension") or MEDIA_DIM)
        except (TypeError, ValueError):
            dimension = MEDIA_DIM
        api_key = s.get("apiKey") or _env_key_for(provider)
    except Exception as e:
        logger.warning(f"[MediaEmbedding] settings load failed, using defaults: {e}")
        api_key = _env_key_for(provider)

    cfg = MediaEmbeddingConfig(
        enabled=enabled, provider=provider, model=model,
        dimension=dimension, api_key=api_key,
    )
    _cached_config, _cached_config_time = cfg, now
    logger.info(
        f"[MediaEmbedding] config: enabled={enabled} provider={provider} "
        f"model={model} dim={dimension} has_key={bool(api_key)}"
    )
    return cfg


def _default_model_for(provider: str) -> str:
    return {
        "jina": "jina-clip-v2",
        "cohere": "embed-v4.0",
        "voyage": "voyage-multimodal-3",
        "openclip-onnx": "ViT-B-16-SigLIP",
    }.get(provider, "jina-clip-v2")


def _env_key_for(provider: str) -> Optional[str]:
    return {
        "jina": os.getenv("JINA_API_KEY"),
        "cohere": os.getenv("COHERE_API_KEY"),
        "voyage": os.getenv("VOYAGE_API_KEY"),
    }.get(provider)


def _fit_to_dim(vec: List[float], target: int = MEDIA_DIM) -> List[float]:
    """Truncate (Matryoshka-safe) or zero-pad to the column width, then L2-normalize."""
    arr = np.asarray(vec, dtype=np.float32)
    if arr.shape[0] > target:
        arr = arr[:target]
    elif arr.shape[0] < target:
        arr = np.pad(arr, (0, target - arr.shape[0]))
    norm = np.linalg.norm(arr)
    if norm > 0:
        arr = arr / norm
    return arr.tolist()


# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------
class CrossModalProvider(ABC):
    """Image and text embeddings that land in the SAME space."""

    def __init__(self, cfg: MediaEmbeddingConfig):
        self.cfg = cfg

    @abstractmethod
    async def embed_text(self, text: str) -> List[float]:
        ...

    @abstractmethod
    async def embed_image(self, image_bytes: bytes, mime: str = "image/jpeg") -> List[float]:
        ...

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return [await self.embed_text(t) for t in texts]


# ---------------------------------------------------------------------------
# Jina CLIP v2 (default, multilingual, has an ONNX twin for air-gap)
# https://api.jina.ai/v1/embeddings  model=jina-clip-v2
# ---------------------------------------------------------------------------
class _JinaProvider(CrossModalProvider):
    URL = "https://api.jina.ai/v1/embeddings"

    async def _post(self, payload: dict) -> List[float]:
        if not self.cfg.api_key:
            raise ValueError("JINA_API_KEY / mediaEmbedding.apiKey not configured")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.cfg.api_key}",
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.URL, headers=headers, json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if not resp.ok:
                    raise ValueError(f"Jina API error {resp.status}: {await resp.text()}")
                data = await resp.json()
                return data["data"][0]["embedding"]

    async def embed_text(self, text: str) -> List[float]:
        vec = await self._post({
            "model": self.cfg.model,
            "dimensions": self.cfg.dimension,
            "input": [{"text": text}],
        })
        return _fit_to_dim(vec, self.cfg.dimension)

    async def embed_image(self, image_bytes: bytes, mime: str = "image/jpeg") -> List[float]:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        vec = await self._post({
            "model": self.cfg.model,
            "dimensions": self.cfg.dimension,
            "input": [{"image": b64}],
        })
        return _fit_to_dim(vec, self.cfg.dimension)


# ---------------------------------------------------------------------------
# Cohere embed-v4 (text + image in one space, output_dimension selectable)
# https://api.cohere.com/v2/embed
# ---------------------------------------------------------------------------
class _CohereProvider(CrossModalProvider):
    URL = "https://api.cohere.com/v2/embed"

    async def _post(self, payload: dict) -> List[float]:
        if not self.cfg.api_key:
            raise ValueError("COHERE_API_KEY / mediaEmbedding.apiKey not configured")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.cfg.api_key}",
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.URL, headers=headers, json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if not resp.ok:
                    raise ValueError(f"Cohere API error {resp.status}: {await resp.text()}")
                data = await resp.json()
                return data["embeddings"]["float"][0]

    async def embed_text(self, text: str) -> List[float]:
        vec = await self._post({
            "model": self.cfg.model,
            "input_type": "search_document",
            "output_dimension": self.cfg.dimension,
            "embedding_types": ["float"],
            "texts": [text],
        })
        return _fit_to_dim(vec, self.cfg.dimension)

    async def embed_image(self, image_bytes: bytes, mime: str = "image/jpeg") -> List[float]:
        data_uri = f"data:{mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"
        vec = await self._post({
            "model": self.cfg.model,
            "input_type": "image",
            "output_dimension": self.cfg.dimension,
            "embedding_types": ["float"],
            "images": [data_uri],
        })
        return _fit_to_dim(vec, self.cfg.dimension)


# ---------------------------------------------------------------------------
# Voyage multimodal-3 (interleaved text/image, 1024-d)
# https://api.voyageai.com/v1/multimodalembeddings
# ---------------------------------------------------------------------------
class _VoyageProvider(CrossModalProvider):
    URL = "https://api.voyageai.com/v1/multimodalembeddings"

    async def _post(self, content: list) -> List[float]:
        if not self.cfg.api_key:
            raise ValueError("VOYAGE_API_KEY / mediaEmbedding.apiKey not configured")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.cfg.api_key}",
        }
        payload = {"model": self.cfg.model, "inputs": [{"content": content}]}
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.URL, headers=headers, json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if not resp.ok:
                    raise ValueError(f"Voyage API error {resp.status}: {await resp.text()}")
                data = await resp.json()
                return data["data"][0]["embedding"]

    async def embed_text(self, text: str) -> List[float]:
        vec = await self._post([{"type": "text", "text": text}])
        return _fit_to_dim(vec, self.cfg.dimension)

    async def embed_image(self, image_bytes: bytes, mime: str = "image/jpeg") -> List[float]:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        vec = await self._post([{"type": "image_base64", "image_base64": f"data:{mime};base64,{b64}"}])
        return _fit_to_dim(vec, self.cfg.dimension)


# ---------------------------------------------------------------------------
# Air-gapped local provider — OpenCLIP via ONNX Runtime (NO torch, ever).
# Model + tokenizer files are baked into the GX10 appliance image and pointed at
# by env vars. Imports are guarded so the service starts fine when ONNX isn't
# present on the online VPS build.
# ---------------------------------------------------------------------------
class _OpenClipOnnxProvider(CrossModalProvider):
    def __init__(self, cfg: MediaEmbeddingConfig):
        super().__init__(cfg)
        self._sess_img = None
        self._sess_txt = None
        self._tokenizer = None

    def _lazy_load(self):
        if self._sess_img is not None:
            return
        try:
            import onnxruntime as ort  # noqa: F401
        except ImportError as e:
            raise ValueError(
                "openclip-onnx selected but onnxruntime is not installed. "
                "Install onnxruntime (NOT torch) on the air-gapped image."
            ) from e
        img_path = os.getenv("OPENCLIP_ONNX_IMAGE")
        txt_path = os.getenv("OPENCLIP_ONNX_TEXT")
        if not img_path or not txt_path:
            raise ValueError("OPENCLIP_ONNX_IMAGE / OPENCLIP_ONNX_TEXT env vars not set")
        import onnxruntime as ort
        providers = ["CPUExecutionProvider"]
        self._sess_img = ort.InferenceSession(img_path, providers=providers)
        self._sess_txt = ort.InferenceSession(txt_path, providers=providers)
        # Tokenizer: open_clip's simple tokenizer ships as a small vocab file (no torch).
        from open_clip.tokenizer import SimpleTokenizer  # type: ignore
        self._tokenizer = SimpleTokenizer()

    async def embed_text(self, text: str) -> List[float]:
        self._lazy_load()
        tokens = np.asarray([self._tokenizer.encode(text)], dtype=np.int64)
        out = self._sess_txt.run(None, {self._sess_txt.get_inputs()[0].name: tokens})[0][0]
        return _fit_to_dim(out.tolist(), self.cfg.dimension)

    async def embed_image(self, image_bytes: bytes, mime: str = "image/jpeg") -> List[float]:
        self._lazy_load()
        from io import BytesIO
        from PIL import Image
        img = Image.open(BytesIO(image_bytes)).convert("RGB").resize((224, 224))
        arr = np.asarray(img, dtype=np.float32) / 255.0
        # CHW + ImageNet-ish normalization; exact mean/std must match the exported model.
        arr = (arr - 0.5) / 0.5
        arr = np.transpose(arr, (2, 0, 1))[None, ...]
        out = self._sess_img.run(None, {self._sess_img.get_inputs()[0].name: arr})[0][0]
        return _fit_to_dim(out.tolist(), self.cfg.dimension)


_PROVIDERS = {
    "jina": _JinaProvider,
    "cohere": _CohereProvider,
    "voyage": _VoyageProvider,
    "openclip-onnx": _OpenClipOnnxProvider,
}


async def get_media_embedding_provider() -> CrossModalProvider:
    """Factory: build the configured cross-modal provider. Raises if disabled."""
    cfg = await get_media_embedding_config()
    if not cfg.enabled:
        raise ValueError("mediaEmbedding.enabled is false")
    provider_cls = _PROVIDERS.get(cfg.provider)
    if provider_cls is None:
        raise ValueError(f"Unknown mediaEmbedding.provider: {cfg.provider}")
    return provider_cls(cfg)


async def is_media_enabled() -> bool:
    """Cheap gate used by the search/chat paths before doing any media work."""
    try:
        return (await get_media_embedding_config()).enabled
    except Exception:
        return False
