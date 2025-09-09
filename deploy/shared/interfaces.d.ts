/**
 * Alice Semantic Bridge - Core TypeScript Interfaces
 * @author Claude (Architecture Lead)
 */
export interface ISemanticDocument {
    id: string;
    sourceId: string;
    content: string;
    metadata: IDocumentMetadata;
    embedding?: number[];
    chunks?: IDocumentChunk[];
    createdAt: Date;
    updatedAt: Date;
}
export interface IDocumentMetadata {
    title?: string;
    author?: string;
    url?: string;
    fileName?: string;
    fileType?: string;
    language?: string;
    keywords?: string[];
    summary?: string;
    publishedDate?: Date;
    wordCount?: number;
    readingTime?: number;
    [key: string]: any;
}
export interface IDocumentChunk {
    id: string;
    documentId: string;
    content: string;
    embedding?: number[];
    metadata: IChunkMetadata;
    position: number;
    startChar: number;
    endChar: number;
}
export interface IChunkMetadata {
    chunkIndex: number;
    totalChunks: number;
    chunkSize: number;
    overlap: number;
    strategy: ChunkingStrategy;
    [key: string]: any;
}
export declare enum ChunkingStrategy {
    AUTO = "auto",
    PROSE = "prose",
    CODE = "code",
    SEMANTIC = "semantic",
    CUSTOM = "custom"
}
export interface IChunkingOptions {
    strategy: ChunkingStrategy;
    chunkSize?: number;
    chunkOverlap?: number;
    separators?: string[];
    keepSeparator?: boolean;
    useAI?: boolean;
}
export interface ISearchQuery {
    query: string;
    projectKey: string;
    searchMode: SearchMode;
    filters?: ISearchFilters;
    options?: ISearchOptions;
}
export declare enum SearchMode {
    SEMANTIC = "semantic",
    KEYWORD = "keyword",
    HYBRID = "hybrid"
}
export interface ISearchFilters {
    sourceId?: string[];
    dateRange?: {
        start: Date;
        end: Date;
    };
    metadata?: Record<string, any>;
}
export interface ISearchOptions {
    limit?: number;
    expandQuery?: boolean;
    useCache?: boolean;
    includeMetadata?: boolean;
    minScore?: number;
}
export interface ISearchResult {
    id: string;
    content: string;
    score: number;
    metadata: IDocumentMetadata;
    highlights?: string[];
    searchType: SearchMode;
    chunk?: IDocumentChunk;
}
export interface IAgentMessage {
    id: string;
    from: AgentType;
    to: AgentType | 'all';
    type: MessageType;
    priority: MessagePriority;
    content: IMessageContent;
    timestamp: Date;
    replyTo?: string;
}
export declare enum AgentType {
    CLAUDE = "claude",
    GEMINI = "gemini",
    CODEX = "codex",
    DEEPSEEK = "deepseek",
    N8N_WORKFLOW = "n8n-workflow",
    API_SERVER = "api-server",
    DASHBOARD = "dashboard"
}
export declare enum MessageType {
    TASK = "task",
    UPDATE = "update",
    REVIEW = "review",
    DECISION = "decision",
    ERROR = "error",
    SUCCESS = "success",
    METRIC = "metric"
}
export declare enum MessagePriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export interface IMessageContent {
    title: string;
    description: string;
    data?: any;
    requiredAction?: string;
    metadata?: Record<string, any>;
}
export interface IWorkflowMetrics {
    workflowId: string;
    executionId: string;
    projectKey: string;
    status: WorkflowStatus;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    itemsProcessed: number;
    itemsFailed: number;
    performance: IPerformanceMetrics;
    errors?: IWorkflowError[];
}
export declare enum WorkflowStatus {
    PENDING = "pending",
    RUNNING = "running",
    SUCCESS = "success",
    ERROR = "error",
    CANCELLED = "cancelled"
}
export interface IPerformanceMetrics {
    averageProcessingTime: number;
    peakMemoryUsage: number;
    apiCallsCount: number;
    cacheHitRate: number;
    embeddingsCost?: number;
}
export interface IWorkflowError {
    nodeId: string;
    nodeName: string;
    error: string;
    timestamp: Date;
    itemIndex?: number;
    recoverable: boolean;
}
export interface IRedisKeys {
    context: (projectKey: string, contextKey: string) => string;
    contextList: (projectKey: string) => string;
    chunk: (projectKey: string, sourceId: string, chunkIndex: number) => string;
    chunkPattern: (projectKey: string, sourceId?: string) => string;
    contentHash: (projectKey: string, hash: string) => string;
    searchCache: (projectKey: string, queryHash: string) => string;
    embeddingCache: (projectKey: string, contentHash: string) => string;
    upsertQueue: (projectKey: string) => string;
    searchQueue: (projectKey: string) => string;
    agentStatus: (projectKey: string, agentName: string) => string;
    agentList: (projectKey: string) => string;
    workflowMetrics: (projectKey: string, workflowId: string) => string;
    projectMetrics: (projectKey: string) => string;
    metricsChannel: (projectKey: string) => string;
    workflowChannel: (projectKey: string) => string;
    agentChannel: (projectKey: string, agentName?: string) => string;
}
export declare const REDIS_KEYS: IRedisKeys;
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
export type AsyncResult<T> = Promise<{
    success: boolean;
    data?: T;
    error?: string;
}>;
export interface IPaginationOptions {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export interface IPaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
