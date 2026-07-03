"""
Media Router — multimodal ingest + asset status.

Endpoints (prefix /api/python/media provided by main.py):
  POST /upload         multipart file (image/audio/video) -> register asset, ingest
  GET  /assets         list recent assets
  GET  /assets/{id}    asset status
  POST /reingest/{id}  re-run ingestion for an existing asset

Gated by media_embedding_service.is_media_enabled(): when the feature is off the
endpoints return 409 so nothing happens until an admin turns it on in settings.

Heavy work (video, large files) is dispatched to the Celery media_worker; light
image/audio jobs can run inline (sync=true) for immediate query-time use.
"""

import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Query
from loguru import logger

from services.database import get_db
from services.media_embedding_service import is_media_enabled
from services.media_ingestion_service import media_ingestion_service

router = APIRouter(tags=["media"])  # prefix provided by main.py (/api/python/media)

MEDIA_UPLOAD_DIR = os.getenv("MEDIA_UPLOAD_DIR", os.path.join(os.getcwd(), "docs", "media"))

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".gif"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mpga"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".avi", ".webm"}


def _asset_type_for(ext: str) -> Optional[str]:
    ext = ext.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in VIDEO_EXT:
        return "video"
    return None


async def _require_enabled():
    if not await is_media_enabled():
        raise HTTPException(status_code=409, detail="mediaEmbedding.enabled is false")


@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    language: str = Form("tr"),
    sync: bool = Form(True),
):
    await _require_enabled()
    if not file.filename:
        raise HTTPException(400, "filename required")
    ext = os.path.splitext(file.filename)[1].lower()
    asset_type = _asset_type_for(ext)
    if not asset_type:
        raise HTTPException(400, f"unsupported media type: {ext}")

    data = await file.read()
    os.makedirs(MEDIA_UPLOAD_DIR, exist_ok=True)
    fd, path = tempfile.mkstemp(suffix=ext, dir=MEDIA_UPLOAD_DIR)
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)

    asset_id = await media_ingestion_service.create_asset(
        asset_type=asset_type, file_path=path, mime_type=file.content_type,
        file_size=len(data),
    )

    # Video and async requests go to Celery; image/audio can run inline.
    if asset_type == "video" or not sync:
        try:
            from workers.media_worker import process_media_asset
            process_media_asset.delay(asset_id, language)
            return {"asset_id": asset_id, "status": "queued", "async": True}
        except Exception as e:
            logger.warning(f"[media] celery dispatch failed, running inline: {e}")

    try:
        if asset_type == "image":
            result = await media_ingestion_service.ingest_image(
                asset_id, data, file.content_type or "image/jpeg", file.filename)
        elif asset_type == "audio":
            result = await media_ingestion_service.ingest_audio(
                asset_id, data, ext, language, file.filename)
        else:  # video, sync fallback
            result = await media_ingestion_service.ingest_video(
                asset_id, path, language, file.filename)
        return {"asset_id": asset_id, "status": "done", "result": result}
    except Exception as e:
        raise HTTPException(500, f"ingestion failed: {e}")


@router.post("/query")
async def query_with_image(
    file: UploadFile = File(...),
    limit: int = Form(8),
):
    """Query-time multimodal: embed an uploaded image into CLIP space, retrieve
    cross-modal matches from the corpus, and return a caption + OCR for the LLM.
    Does NOT persist the image. Used by the backend /api/v2/chat/with-media route."""
    await _require_enabled()
    if not file.filename:
        raise HTTPException(400, "filename required")
    ext = os.path.splitext(file.filename)[1].lower()
    if _asset_type_for(ext) != "image":
        raise HTTPException(400, "only images are supported for query-time upload")

    data = await file.read()
    mime = file.content_type or "image/jpeg"
    try:
        from services.media_embedding_service import get_media_embedding_provider
        from services.semantic_search_service import semantic_search_service

        provider = await get_media_embedding_provider()
        clip_vec = await provider.embed_image(data, mime)
        media_results = await semantic_search_service.media_vector_search(clip_vec, limit=limit)
        caption = await media_ingestion_service.caption_image(data, mime)
        ocr_text = media_ingestion_service.ocr_image(data)
        return {
            "caption": caption,
            "ocr_text": ocr_text,
            "media_results": media_results,
            "filename": file.filename,
        }
    except Exception as e:
        logger.error(f"[media] query failed: {e}")
        raise HTTPException(500, f"media query failed: {e}")


@router.get("/assets")
async def list_assets(limit: int = Query(50, le=200), status: Optional[str] = None):
    pool = await get_db()
    if status:
        rows = await pool.fetch(
            "SELECT id, asset_type, status, segment_count, file_path, error, created_at "
            "FROM media_assets WHERE status = $1 ORDER BY id DESC LIMIT $2", status, limit)
    else:
        rows = await pool.fetch(
            "SELECT id, asset_type, status, segment_count, file_path, error, created_at "
            "FROM media_assets ORDER BY id DESC LIMIT $1", limit)
    return {"assets": [dict(r) for r in rows]}


@router.get("/assets/{asset_id}")
async def get_asset(asset_id: int):
    pool = await get_db()
    row = await pool.fetchrow("SELECT * FROM media_assets WHERE id = $1", asset_id)
    if not row:
        raise HTTPException(404, "asset not found")
    seg = await pool.fetchval("SELECT COUNT(*) FROM media_embeddings WHERE asset_id = $1", asset_id)
    return {"asset": dict(row), "embedding_segments": seg}


@router.post("/reingest/{asset_id}")
async def reingest_asset(asset_id: int, language: str = Form("tr")):
    await _require_enabled()
    pool = await get_db()
    row = await pool.fetchrow("SELECT * FROM media_assets WHERE id = $1", asset_id)
    if not row:
        raise HTTPException(404, "asset not found")
    from workers.media_worker import process_media_asset
    process_media_asset.delay(asset_id, language)
    return {"asset_id": asset_id, "status": "queued"}
