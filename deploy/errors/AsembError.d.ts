/**
 * ASEMB Error Handling Standard
 * @author Claude - Architecture Lead
 * @version Phase 3
 */
import { NodeOperationError } from 'n8n-workflow';
export declare enum ErrorCode {
    WORKSPACE_NOT_FOUND = "ASEMB_1001",
    WORKSPACE_QUOTA_EXCEEDED = "ASEMB_1002",
    WORKSPACE_LOCKED = "ASEMB_1003",
    DATABASE_CONNECTION_FAILED = "ASEMB_2001",
    DATABASE_QUERY_FAILED = "ASEMB_2002",
    DATABASE_TRANSACTION_FAILED = "ASEMB_2003",
    DATABASE_POOL_EXHAUSTED = "ASEMB_2004",
    EMBEDDING_FAILED = "ASEMB_3001",
    EMBEDDING_DIMENSION_MISMATCH = "ASEMB_3002",
    EMBEDDING_PROVIDER_ERROR = "ASEMB_3003",
    EMBEDDING_RATE_LIMITED = "ASEMB_3004",
    SEARCH_FAILED = "ASEMB_4001",
    SEARCH_TIMEOUT = "ASEMB_4002",
    SEARCH_NO_RESULTS = "ASEMB_4003",
    SEARCH_INVALID_QUERY = "ASEMB_4004",
    CACHE_CONNECTION_FAILED = "ASEMB_5001",
    CACHE_OPERATION_FAILED = "ASEMB_5002",
    CACHE_INVALIDATION_FAILED = "ASEMB_5003",
    INVALID_INPUT = "ASEMB_6001",
    INVALID_CHUNK_SIZE = "ASEMB_6002",
    INVALID_SOURCE_ID = "ASEMB_6003",
    MISSING_REQUIRED_FIELD = "ASEMB_6004",
    RATE_LIMIT_EXCEEDED = "ASEMB_7001",
    QUOTA_EXCEEDED = "ASEMB_7002",
    INTERNAL_ERROR = "ASEMB_9001",
    NOT_IMPLEMENTED = "ASEMB_9002",
    SERVICE_UNAVAILABLE = "ASEMB_9003"
}
export interface ErrorDetails {
    code: ErrorCode;
    statusCode: number;
    context?: Record<string, any>;
    retryable: boolean;
    userMessage?: string;
    developerMessage?: string;
    documentationUrl?: string;
}
export declare class AsembError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly retryable: boolean;
    readonly context?: Record<string, any>;
    readonly timestamp: Date;
    constructor(code: ErrorCode, message: string, details?: Partial<ErrorDetails>);
    private getDefaultStatusCode;
    private isRetryableError;
    toJSON(): ErrorDetails;
    toNodeError(node: any): NodeOperationError;
}
/**
 * Error handler with retry logic
 */
export declare class ErrorHandler {
    static withRetry<T>(fn: () => Promise<T>, options?: {
        maxAttempts?: number;
        backoffMs?: number;
        exponential?: boolean;
        onRetry?: (attempt: number, error: Error) => void;
    }): Promise<T>;
    private static isRetryableError;
    /**
     * Wrap errors with context
     */
    static wrapError(error: unknown, code: ErrorCode, context?: Record<string, any>): AsembError;
    /**
     * Create user-friendly error messages
     */
    static getUserMessage(error: AsembError): string;
}
