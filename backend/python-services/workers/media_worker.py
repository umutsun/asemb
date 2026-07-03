"""
Celery worker for multimodal media ingestion.

Heavy/long jobs (video keyframe + transcript, batch backfill) run here so the
FastAPI request thread is never blocked. Registered explicitly in celery_app.py
(autodiscover only covers the workers package, but the import must be explicit —
mirrors google_drive_worker).

Each task runs the async ingestion pipeline inside a fresh event loop because
Celery tasks are synchronous.
"""

import asyncio
from loguru import logger

from workers.celery_app import celery_app


def _run(coro):
    """Run an async coroutine to completion inside a synchronous Celery task."""
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="media.process_asset", bind=True, max_retries=2)
def process_media_asset(self, asset_id: int, language: str = "tr"):
    """Dispatch an already-registered media_asset to the right ingest pipeline."""
    from services.database import get_db, close_db
    from services.media_ingestion_service import media_ingestion_service

    async def _job():
        pool = await get_db()
        row = await pool.fetchrow("SELECT * FROM media_assets WHERE id = $1", asset_id)
        if not row:
            logger.error(f"[media_worker] asset {asset_id} not found")
            return {"asset_id": asset_id, "status": "missing"}

        asset_type = row["asset_type"]
        file_path = row["file_path"]
        try:
            if asset_type in ("image", "scanned"):
                with open(file_path, "rb") as fh:
                    data = fh.read()
                return await media_ingestion_service.ingest_image(
                    asset_id, data, row["mime_type"] or "image/jpeg", file_path)
            elif asset_type == "audio":
                import os
                with open(file_path, "rb") as fh:
                    data = fh.read()
                ext = os.path.splitext(file_path)[1] or ".mp3"
                return await media_ingestion_service.ingest_audio(
                    asset_id, data, ext, language, file_path)
            elif asset_type == "video":
                return await media_ingestion_service.ingest_video(
                    asset_id, file_path, language, file_path)
            else:
                await media_ingestion_service.set_status(asset_id, "failed",
                                                         error=f"unknown type {asset_type}")
                return {"asset_id": asset_id, "status": "failed"}
        finally:
            await close_db()

    try:
        return _run(_job())
    except Exception as e:
        logger.error(f"[media_worker] asset {asset_id} failed: {e}")
        raise self.retry(exc=e, countdown=30)
