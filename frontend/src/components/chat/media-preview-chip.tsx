'use client';

import { Image as ImageIcon, Music, X, Loader2 } from 'lucide-react';

interface MediaPreviewChipProps {
  filename: string;
  size: number;
  mediaType: 'image' | 'audio';
  previewUrl?: string;  // object URL for an image thumbnail
  status?: 'ready' | 'uploading' | 'processing';
  onRemove: () => void;
}

/**
 * Query-time media attachment chip (image/audio), mirrors PdfPreviewChip.
 * Shows a thumbnail for images.
 */
export function MediaPreviewChip({
  filename, size, mediaType, previewUrl, status = 'ready', onRemove,
}: MediaPreviewChipProps) {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const displayName = filename.length > 25 ? filename.substring(0, 22) + '...' : filename;
  const busy = status === 'uploading' || status === 'processing';

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20
                    border border-purple-200 dark:border-purple-800 rounded-lg max-w-full sm:max-w-[300px]
                    transition-all duration-200 hover:bg-purple-100 dark:hover:bg-purple-900/30">
      {/* Thumbnail / icon / loading */}
      {busy ? (
        <Loader2 className="w-4 h-4 text-purple-500 animate-spin flex-shrink-0" />
      ) : mediaType === 'image' && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={filename}
             className="w-6 h-6 rounded object-cover flex-shrink-0" />
      ) : mediaType === 'image' ? (
        <ImageIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
      ) : (
        <Music className="w-4 h-4 text-purple-500 flex-shrink-0" />
      )}

      <span className="text-sm text-purple-700 dark:text-purple-300 truncate" title={filename}>
        {displayName}
      </span>

      <span className="text-xs text-purple-500 dark:text-purple-400 flex-shrink-0 hidden sm:inline">
        ({formatSize(size)})
      </span>

      {status === 'uploading' && (
        <span className="text-xs text-purple-400 flex-shrink-0">Yükleniyor...</span>
      )}
      {status === 'processing' && (
        <span className="text-xs text-purple-400 flex-shrink-0">İşleniyor...</span>
      )}

      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        className="p-0.5 hover:bg-purple-200 dark:hover:bg-purple-700 rounded transition-colors flex-shrink-0 ml-1"
        title="Dosyayı kaldır"
        disabled={busy}
      >
        <X className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
      </button>
    </div>
  );
}
