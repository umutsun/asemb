// Modern Template Types

import type { Evidence } from '@/types/chat';

export type { Evidence };

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sources?: Source[];
    relatedTopics?: RelatedTopic[];
    context?: string[];
    isTyping?: boolean;
    isFromSource?: boolean;
    isStreaming?: boolean;
    isError?: boolean;
    responseTime?: number;
    startTime?: number;
    tokens?: TokenUsage;
    fastMode?: boolean;
    /** Answer language reported by the backend (en|ar|tr); used for RTL rendering + markdown repair */
    language?: string;
    /** Evidence-gate metadata from the backend (absent on legacy messages) */
    evidence?: Evidence;
    /** Backend-generated follow-up questions rendered as clickable chips */
    followUpQuestions?: string[];
}

export interface Source {
    title?: string;
    content?: string;
    excerpt?: string;
    sourceTable?: string;
    sourceType?: string;
    score?: number;
    summary?: string;
    keywords?: string[];
    category?: string;
    /** Structured corpus metadata (law_title, article_number, url, ...) */
    metadata?: Record<string, unknown>;
    /** Origin table/row of the retrieved chunk (when the backend provides it) */
    databaseInfo?: { table?: string; id?: string | number };
}

export interface RelatedTopic {
    title: string;
    description: string;
}

export interface TokenUsage {
    input?: number;
    output?: number;
    total?: number;
}

export interface ChatbotSettings {
    title: string;
    subtitle: string;
    logoUrl: string;
    placeholder: string;
    primaryColor: string;
    activeChatModel: string;
    enableSuggestions: boolean;
    welcomeMessage: string;
    greeting: string;
}

export interface RagSettings {
    minResults: number;
    maxResults: number;
    similarityThreshold: number;
}

export interface ActivePrompt {
    content: string;
    temperature: number;
    maxTokens: number;
    tone: string;
}

export interface UserInfo {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
}
