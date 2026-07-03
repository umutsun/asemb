'use client';

import { useEffect, useState, useCallback } from 'react';
import { Upload, RefreshCw, Image as ImageIcon, Music, Film, FileText, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import {
  uploadMedia, listMediaAssets, fetchMediaObjectUrl, MediaAsset,
} from '@/lib/api/media-client';

/**
 * Self-contained media management panel for the dashboard ("Media" tab).
 * Upload images/audio/video into the multimodal corpus and watch processing status.
 * Mount anywhere, e.g. in dashboard/documents/page.tsx behind a tab.
 */
const TYPE_ICON: Record<string, JSX.Element> = {
  image: <ImageIcon className="w-4 h-4 text-purple-500" />,
  scanned: <FileText className="w-4 h-4 text-purple-500" />,
  audio: <Music className="w-4 h-4 text-pink-500" />,
  video: <Film className="w-4 h-4 text-blue-500" />,
};

function StatusBadge({ status }: { status: MediaAsset['status'] }) {
  if (status === 'done') return <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> Tamam</span>;
  if (status === 'failed') return <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="w-3.5 h-3.5" /> Hata</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {status === 'processing' ? 'İşleniyor' : 'Bekliyor'}</span>;
}

function Thumb({ asset }: { asset: MediaAsset }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    if (asset.asset_type === 'image' || asset.asset_type === 'scanned') {
      fetchMediaObjectUrl(asset.id).then((u) => { revoked = u; setUrl(u); }).catch(() => {});
    }
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [asset.id, asset.asset_type]);

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`media-${asset.id}`} className="w-10 h-10 rounded object-cover" />;
  }
  return <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">{TYPE_ICON[asset.asset_type] || <FileText className="w-4 h-4" />}</div>;
}

export function MediaManager() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await listMediaAssets());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Yüklenemedi (mediaEmbedding.enabled açık mı?)');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while anything is pending/processing
  useEffect(() => {
    const busy = assets.some((a) => a.status === 'pending' || a.status === 'processing');
    if (!busy) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [assets, refresh]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');
        await uploadMedia(file, 'tr', !isVideo); // video → async via Celery
      }
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Yükleme başarısız');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Medya (Multimodal RAG)</h3>
          <p className="text-sm text-gray-500">Görsel, ses ve video yükleyin; çapraz-modal (CLIP) aramaya dahil edilir.</p>
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-purple-300 dark:border-purple-800 rounded-xl p-8 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors">
        {uploading ? <Loader2 className="w-6 h-6 text-purple-500 animate-spin" /> : <Upload className="w-6 h-6 text-purple-500" />}
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {uploading ? 'Yükleniyor…' : 'Dosya seçin veya sürükleyin (image / audio / video)'}
        </span>
        <input
          type="file"
          multiple
          accept="image/*,audio/*,video/*"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
          disabled={uploading}
        />
      </label>

      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</div>}

      <div className="border rounded-xl divide-y dark:divide-gray-800">
        {assets.length === 0 && !loading && (
          <div className="p-6 text-center text-sm text-gray-500">Henüz medya yok.</div>
        )}
        {assets.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3">
            <Thumb asset={a} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {TYPE_ICON[a.asset_type]}
                <span className="text-sm font-medium capitalize">{a.asset_type}</span>
                <span className="text-xs text-gray-400">#{a.id}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">
                {a.segment_count} segment · {new Date(a.created_at).toLocaleString('tr-TR')}
                {a.error ? ` · ${a.error}` : ''}
              </div>
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default MediaManager;
