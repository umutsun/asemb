export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sources?: Source[];
  isLoading?: boolean;
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
  metadata?: any;
  confidence?: number;
  timestamp?: string;
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
  conversationId: string;
}