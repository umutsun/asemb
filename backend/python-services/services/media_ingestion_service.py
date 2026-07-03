"""
Media Ingestion Service — turns an uploaded/registered media file into:
  (a) CLIP cross-modal vectors  -> media_embeddings   (image<->text similarity)
  (b) a text-bridge (caption / OCR / transcript) -> unified_embeddings
      (so the existing 1536 hybrid search + Turkish BM25 + rerank keep working).

Reuses existing building blocks instead of re-implementing them:
  - cross-modal embeddings  -> media_embedding_service.get_media_embedding_provider()
  - text-bridge embeddings  -> semantic_search_service.generate_embedding() (the 1536 path)
  - audio transcription     -> whisper_service.get_whisper_service()
  - OCR (optional)          -> tesseract_ocr.TesseractOCR (guarded import)
  - image captioning        -> OpenAI vision (mediaEmbedding.captionModel), guarded

Everything here assumes mediaEmbedding.enabled is already true; callers gate on
media_embedding_service.is_media_enabled() first. Heavy jobs (video, batch backfill)
run under the Celery media_worker; light query-time work can call these directly.
"""

import os
import hashlib
import subprocess
import tempfile
from typing import List, Optional, Dict, Any

from loguru import logger

from services.database import get_db
from services.media_embedding_service import (
    get_media_embedding_provider,
    get_media_embedding_config,
)
from services.text_chunker import split_text

# unified_embeddings rows produced from media share this namespace so they are easy
# to identify / clean up and never collide with real source tables.
MEDIA_SOURCE_TABLE = "media_embeddings"
MEDIA_SOURCE_TYPE = "media"
TEXT_BRIDGE_MAX = 30000  # mirror the truncation other unified_embeddings writers use


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "ignore")).hexdigest()


class MediaIngestionService:
    # ---- asset registry --------------------------------------------------
    async def create_asset(
        self,
        asset_type: str,
        file_path: Optional[str] = None,
        source_url: Optional[str] = None,
        mime_type: Optional[str] = None,
        file_size: Optional[int] = None,
        document_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        pool = await get_db()
        row = await pool.fetchrow(
            """
            INSERT INTO media_assets
                (asset_type, file_path, source_url, mime_type, file_size, document_id, metadata, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending')
            RETURNING id
            """,
            asset_type, file_path, source_url, mime_type, file_size, document_id,
            __import__("json").dumps(metadata or {}),
        )
        return row["id"]

    async def set_status(self, asset_id: int, status: str, error: Optional[str] = None,
                         segment_count: Optional[int] = None) -> None:
        pool = await get_db()
        await pool.execute(
            """
            UPDATE media_assets
               SET status = $2,
                   error = $3,
                   segment_count = COALESCE($4, segment_count),
                   updated_at = NOW()
             WHERE id = $1
            """,
            asset_id, status, error, segment_count,
        )

    # ---- low-level stores ------------------------------------------------
    async def _store_clip(
        self, asset_id: int, segment_index: int, embedding: List[float],
        caption: str, clip_model: str, clip_provider: str, clip_dim: int,
        segment_meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        pool = await get_db()
        vec_literal = "[" + ",".join(f"{x:.7f}" for x in embedding) + "]"
        row = await pool.fetchrow(
            """
            INSERT INTO media_embeddings
                (asset_id, segment_index, embedding, clip_model, clip_dim,
                 clip_provider, caption, content_hash, segment_meta)
            VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, $9::jsonb)
            ON CONFLICT (asset_id, segment_index) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                caption = EXCLUDED.caption,
                content_hash = EXCLUDED.content_hash,
                segment_meta = EXCLUDED.segment_meta
            RETURNING id
            """,
            asset_id, segment_index, vec_literal, clip_model, clip_dim,
            clip_provider, caption[:2000] if caption else None,
            _hash(caption or "") if caption else None,
            __import__("json").dumps(segment_meta or {}),
        )
        return row["id"]

    async def _store_text_bridge(
        self, media_emb_id: int, source_name: str, content: str,
        asset_type: str, asset_id: int,
    ) -> None:
        """Embed the bridge text with the EXISTING 1536 path and store in unified_embeddings."""
        content = (content or "").strip()
        if not content:
            return
        from services.semantic_search_service import semantic_search_service
        vec = await semantic_search_service.generate_embedding(content[:8000])
        if not vec:
            logger.warning(f"[MediaIngest] empty text-bridge embedding for media:{media_emb_id}")
            return
        pool = await get_db()
        vec_literal = "[" + ",".join(f"{x:.7f}" for x in vec) + "]"
        meta = {"media_asset_id": asset_id, "media_type": asset_type, "media_embedding_id": media_emb_id}
        await pool.execute(
            """
            INSERT INTO unified_embeddings
                (source_table, source_type, source_id, source_name, content,
                 embedding, metadata, content_hash, model_used, embedding_provider)
            VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8, $9, $10)
            """,
            MEDIA_SOURCE_TABLE, MEDIA_SOURCE_TYPE, media_emb_id, (source_name or "media")[:255],
            content[:TEXT_BRIDGE_MAX], vec_literal,
            __import__("json").dumps(meta), _hash(content),
            "text-embedding-3-small", "openai",
        )

    async def _purge_asset_rows(self, asset_id: int) -> None:
        """Idempotent re-ingest: drop this asset's prior media + text-bridge rows."""
        pool = await get_db()
        ids = await pool.fetch("SELECT id FROM media_embeddings WHERE asset_id = $1", asset_id)
        media_ids = [r["id"] for r in ids]
        if media_ids:
            await pool.execute(
                f"DELETE FROM unified_embeddings WHERE source_table = $1 AND source_id = ANY($2::int[])",
                MEDIA_SOURCE_TABLE, media_ids,
            )
        await pool.execute("DELETE FROM media_embeddings WHERE asset_id = $1", asset_id)

    # ---- captioning / OCR (reuse existing infra, both optional) ----------
    async def caption_image(self, image_bytes: bytes, mime: str = "image/jpeg") -> str:
        """Caption an image with a vision LLM (mediaEmbedding.captionModel). Best-effort."""
        try:
            import base64
            from services.semantic_search_service import semantic_search_service
            cfg = await get_media_embedding_config()
            # caption model lives in settings; fall back to gpt-4o
            pool = await get_db()
            row = await pool.fetchrow("SELECT value FROM settings WHERE key = 'mediaEmbedding.captionModel'")
            model = (row["value"] if row else None) or "gpt-4o"
            client = await semantic_search_service._get_openai_client()
            b64 = base64.b64encode(image_bytes).decode("ascii")
            resp = await client.chat.completions.create(
                model=model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Bu görseli Türkçe, arama için zengin bir şekilde tek paragrafta betimle. Görünen metinleri de aktar."},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ],
                }],
                max_tokens=400,
                temperature=0.2,
            )
            return (resp.choices[0].message.content or "").strip()
        except Exception as e:
            logger.warning(f"[MediaIngest] caption failed: {e}")
            return ""

    def ocr_image(self, image_bytes: bytes) -> str:
        try:
            from services.tesseract_ocr import TesseractOCR
            res = TesseractOCR().ocr_image(image_bytes)
            return (res.get("text") or "").strip() if isinstance(res, dict) else ""
        except Exception as e:
            logger.debug(f"[MediaIngest] OCR skipped: {e}")
            return ""

    # ---- per-modality pipelines -----------------------------------------
    async def ingest_image(self, asset_id: int, image_bytes: bytes,
                           mime: str = "image/jpeg", source_name: str = "image") -> Dict[str, Any]:
        await self.set_status(asset_id, "processing")
        try:
            await self._purge_asset_rows(asset_id)
            provider = await get_media_embedding_provider()
            cfg = await get_media_embedding_config()

            clip_vec = await provider.embed_image(image_bytes, mime)
            caption = await self.caption_image(image_bytes, mime)
            ocr_text = self.ocr_image(image_bytes)
            bridge = "\n".join([t for t in (caption, ocr_text) if t]).strip()

            media_id = await self._store_clip(
                asset_id, 0, clip_vec, caption,
                cfg.model, cfg.provider, cfg.dimension, {"source": "image"},
            )
            await self._store_text_bridge(media_id, source_name, bridge or source_name,
                                          "image", asset_id)
            await self.set_status(asset_id, "done", segment_count=1)
            return {"asset_id": asset_id, "media_embedding_id": media_id, "segments": 1}
        except Exception as e:
            logger.error(f"[MediaIngest] image {asset_id} failed: {e}")
            await self.set_status(asset_id, "failed", error=str(e))
            raise

    async def ingest_audio(self, asset_id: int, audio_bytes: bytes,
                          file_ext: str = ".mp3", language: str = "tr",
                          source_name: str = "audio") -> Dict[str, Any]:
        """Audio is text-bridge only (CLIP is image<->text). Transcript -> unified_embeddings."""
        await self.set_status(asset_id, "processing")
        try:
            await self._purge_asset_rows(asset_id)
            cfg = await get_media_embedding_config()
            mode = os.getenv("WHISPER_MODE", "api")
            whisper = get_whisper_service_safe(mode)
            result = await whisper.transcribe_audio(audio_bytes, language=language, file_extension=file_ext)
            if not result.get("success"):
                raise RuntimeError(result.get("error", "transcription failed"))
            transcript = (result.get("text") or "").strip()

            # chunk transcript into ~1500-char windows; each chunk is its own segment row
            chunks = _chunk_text(transcript, 1500)
            for idx, chunk in enumerate(chunks):
                # audio has no image vector; store a NULL-embedding media row only to carry the caption
                media_id = await self._store_clip(
                    asset_id, idx, [0.0] * cfg.dimension, chunk,
                    cfg.model, cfg.provider, cfg.dimension,
                    {"source": "audio", "segment": idx},
                )
                await self._store_text_bridge(media_id, f"{source_name} #{idx+1}", chunk,
                                              "audio", asset_id)
            await self.set_status(asset_id, "done", segment_count=len(chunks))
            return {"asset_id": asset_id, "segments": len(chunks)}
        except Exception as e:
            logger.error(f"[MediaIngest] audio {asset_id} failed: {e}")
            await self.set_status(asset_id, "failed", error=str(e))
            raise

    async def ingest_video(self, asset_id: int, video_path: str,
                          language: str = "tr", source_name: str = "video",
                          frame_every_sec: int = 10, max_frames: int = 30) -> Dict[str, Any]:
        """Keyframes -> CLIP+caption; audio track -> Whisper transcript text-bridge. Needs ffmpeg."""
        await self.set_status(asset_id, "processing")
        try:
            await self._purge_asset_rows(asset_id)
            provider = await get_media_embedding_provider()
            cfg = await get_media_embedding_config()

            frames = _extract_keyframes(video_path, frame_every_sec, max_frames)
            seg = 0
            for ts, frame_bytes in frames:
                clip_vec = await provider.embed_image(frame_bytes, "image/jpeg")
                caption = await self.caption_image(frame_bytes, "image/jpeg")
                media_id = await self._store_clip(
                    asset_id, seg, clip_vec, caption,
                    cfg.model, cfg.provider, cfg.dimension,
                    {"source": "video_frame", "ts_sec": ts},
                )
                await self._store_text_bridge(media_id, f"{source_name} @{ts}s",
                                              caption or source_name, "video", asset_id)
                seg += 1

            # audio track -> transcript
            audio_bytes = _extract_audio(video_path)
            if audio_bytes:
                mode = os.getenv("WHISPER_MODE", "api")
                whisper = get_whisper_service_safe(mode)
                result = await whisper.transcribe_audio(audio_bytes, language=language, file_extension=".mp3")
                if result.get("success"):
                    for chunk in _chunk_text((result.get("text") or "").strip(), 1500):
                        media_id = await self._store_clip(
                            asset_id, seg, [0.0] * cfg.dimension, chunk,
                            cfg.model, cfg.provider, cfg.dimension,
                            {"source": "video_audio", "segment": seg},
                        )
                        await self._store_text_bridge(media_id, f"{source_name} transcript",
                                                      chunk, "video", asset_id)
                        seg += 1
            await self.set_status(asset_id, "done", segment_count=seg)
            return {"asset_id": asset_id, "segments": seg}
        except Exception as e:
            logger.error(f"[MediaIngest] video {asset_id} failed: {e}")
            await self.set_status(asset_id, "failed", error=str(e))
            raise


# ---- helpers ------------------------------------------------------------
def get_whisper_service_safe(mode: str = "api"):
    from services.whisper_service import get_whisper_service
    model = "whisper-1" if mode == "api" else os.getenv("WHISPER_LOCAL_MODEL", "base")
    return get_whisper_service(model_name=model, mode=mode, api_key=os.getenv("OPENAI_API_KEY"))


def _chunk_text(text: str, size: int) -> List[str]:
    # Shared word/sentence-aware chunker with a small word-aligned overlap, so transcript
    # segments never break mid-word (was raw text[i:i+size] slicing with no overlap).
    return split_text(text, size=size, overlap=max(1, size // 10))


def _extract_keyframes(video_path: str, every_sec: int, max_frames: int):
    """Sample one JPEG every `every_sec` seconds using ffmpeg. Returns [(ts_sec, bytes)]."""
    frames = []
    out_dir = tempfile.mkdtemp(prefix="vframes_")
    pattern = os.path.join(out_dir, "f_%04d.jpg")
    try:
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", video_path,
             "-vf", f"fps=1/{every_sec}", "-frames:v", str(max_frames), pattern],
            check=True,
        )
        for i, name in enumerate(sorted(os.listdir(out_dir))):
            with open(os.path.join(out_dir, name), "rb") as fh:
                frames.append((i * every_sec, fh.read()))
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not installed (required for video ingest)")
    finally:
        import shutil
        shutil.rmtree(out_dir, ignore_errors=True)
    return frames


def _extract_audio(video_path: str) -> Optional[bytes]:
    out = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    out.close()
    try:
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", video_path,
             "-vn", "-acodec", "libmp3lame", out.name],
            check=True,
        )
        with open(out.name, "rb") as fh:
            return fh.read()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    finally:
        if os.path.exists(out.name):
            os.remove(out.name)


media_ingestion_service = MediaIngestionService()
