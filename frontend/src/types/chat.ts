export interface PdfAttachment {
  filename: string;
  size: number;
  pageCount?: number;
  cacheKey?: string;
}

/**
 * Article query metadata from RAG article anchoring
 * Used to show warnings when a specific law article was queried but not found
 */
export interface ArticleQuery {
  detected: boolean;
  lawCode?: string;       // e.g., "VUK", "GVK", "KDVK"
  articleNumber?: string; // e.g., "114", "40", "29"
  exactMatchFound?: boolean;
  exactMatchCount?: number;
  wrongMatchCount?: number;
}

/**
 * Evidence-gate metadata attached to assistant answers by the backend RAG pipeline.
 * Scores are 0-1. Legacy messages (persisted before this field existed) won't carry it —
 * consumers must handle absence gracefully.
 */
export interface Evidence {
  gatePassed: boolean;
  bestScore: number;
  qualityChunkCount: number;
  minScore: number;
  minChunks: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sources?: Source[];
  isLoading?: boolean;
  isStreaming?: boolean;
  status?: 'reading-document' | 'searching' | 'generating' | 'complete' | 'error';
  statusMessage?: string;
  relatedTopics?: Source[];
  pdfAttachment?: PdfAttachment;
  articleQuery?: ArticleQuery; // Article anchoring metadata
  /** Answer language reported by the backend (en|ar|tr); used for RTL rendering + markdown repair */
  language?: string;
  /** Evidence-gate metadata (absent on legacy messages) */
  evidence?: Evidence;
  /** Backend-generated follow-up questions rendered as clickable chips */
  followUpQuestions?: string[];
}

export interface Source {
  id: string;
  title: string;
  url?: string;
  excerpt?: string;
  relevanceScore?: number;
  sourceTable?: string;
  category?: string;
  citation?: string;
  metadata?: Record<string, unknown>;
  /** Origin table/row of the retrieved chunk (when the backend provides it) */
  databaseInfo?: { table?: string; id?: string | number };
  confidence?: number;
  timestamp?: string;
  // v12.27: Synthetic source fields for transparent labeling
  _synthetic?: boolean;
  _syntheticNote?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface SendMessageParams {
  content: string;
  conversationId?: string;
}

export interface ChatResponse {
  message: Message;
  sources?: Source[];
  relatedTopics?: Source[];
  conversationId: string;
  articleQuery?: ArticleQuery; // Article anchoring metadata from RAG
}