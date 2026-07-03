/**
 * Media (multimodal RAG) API client — talks to the backend media proxy + chat.
 * All requests go through the shared authenticated apiClient.
 */
import apiClient from './client';

export interface MediaAsset {
  id: number;
  asset_type: 'image' | 'scanned' | 'audio' | 'video';
  status: 'pending' | 'processing' | 'done' | 'failed';
  segment_count: number;
  file_path?: string;
  error?: string;
  created_at: string;
}

/** Ingest a media file into the searchable corpus (cross-modal + text-bridge). */
export async function uploadMedia(file: File, language = 'tr', sync = true) {
  const form = new FormData();
  form.append('file', file);
  form.append('language', language);
  form.append('sync', String(sync));
  const res = await apiClient.post('/api/v2/media/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
  return res.data as { asset_id: number; status: string; result?: any };
}

/** List recent media assets (optionally filtered by status). */
export async function listMediaAssets(status?: string) {
  const res = await apiClient.get('/api/v2/media/assets', { params: { limit: 100, status } });
  return (res.data?.assets || []) as MediaAsset[];
}

/** Get a single asset's status + embedding segment count. */
export async function getMediaAsset(id: number) {
  const res = await apiClient.get(`/api/v2/media/assets/${id}`);
  return res.data;
}

/** Query-time chat: ask about an uploaded image (cross-modal retrieval + vision). */
export async function sendMediaMessage(
  message: string,
  image: File,
  opts: { conversationId?: string; model?: string; temperature?: number } = {}
) {
  const form = new FormData();
  form.append('image', image);
  form.append('message', message);
  if (opts.conversationId) form.append('conversationId', opts.conversationId);
  if (opts.model) form.append('model', opts.model);
  if (opts.temperature != null) form.append('temperature', String(opts.temperature));
  const res = await apiClient.post('/api/v2/chat/with-media', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return res.data;
}

/** Semantic search with cross-modal media results included. */
export async function searchWithMedia(query: string, limit = 25) {
  const res = await apiClient.post('/api/v2/search', { query, limit, includeMedia: true });
  return res.data;
}

/**
 * Fetch a media file as an object URL (the file endpoint is auth-protected, so an
 * <img src> can't hit it directly — fetch as a blob with the bearer token instead).
 * Remember to URL.revokeObjectURL() when done.
 */
export async function fetchMediaObjectUrl(id: number): Promise<string> {
  const res = await apiClient.get(`/api/v2/media/file/${id}`, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
}
