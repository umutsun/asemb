/**
 * Standardized Error Handling System
 * @author Claude - Architecture Lead
 * @version Phase 3
 * @description Comprehensive error handling with recovery strategies
 */
import { INodeExecutionData } from 'n8n-workflow';
/**
 * Error codes for categorizing errors
 */
export declare enum ErrorCode {
    DB_CONNECTION_FAILED = "DB_001",
    DB_QUERY_FAILED = "DB_002",
    DB_TRANSACTION_FAILED = "DB_003",
    DB_POOL_EXHAUSTED = "DB_004",
    INVALID_INPUT = "VAL_001",
    MISSING_REQUIRED = "VAL_002",
    TYPE_MISMATCH = "VAL_003",
    OUT_OF_RANGE = "VAL_004",
    OPERATION_FAILED = "OP_001",
    OPERATION_TIMEOUT = "OP_002",
    OPERATION_CANCELLED = "OP_003",
    CONCURRENT_MODIFICATION = "OP_004",
    SEARCH_FAILED = "SEARCH_001",
    NO_RESULTS = "SEARCH_002",
    INVALID_QUERY = "SEARCH_003",
    INDEX_UNAVAILABLE = "SEARCH_004",
    EMBEDDING_FAILED = "EMB_001",
    EMBEDDING_SERVICE_UNAVAILABLE = "EMB_002",
    EMBEDDING_RATE_LIMITED = "EMB_003",
    CACHE_OPERATION_FAILED = "CACHE_001",
    CACHE_UNAVAILABLE = "CACHE_002",
    INTERNAL_ERROR = "SYS_001",
    CONFIGURATION_ERROR = "SYS_002",
    RESOURCE_EXHAUSTED = "SYS_003"
}
/**
 * Main error class for ASEMB system
 */
export declare class ASEMBError extends Error {
    readonly code: ErrorCode;
    readonly details?: any;
    readonly recoverable: boolean;
    readonly timestamp: Date;
    readonly context?: Record<string, any>;
    constructor(code: ErrorCode, message: string, details?: any, recoverable?: boolean);
    /**
     * Get error severity based on code
     */
    get severity(): 'critical' | 'error' | 'warning';
    /**
     * Convert to JSON for logging
     */
    toJSON(): {
        name: string;
        code: ErrorCode;
        message: string;
        details: any;
        recoverable: boolean;
        severity: "error" | "critical" | "warning";
        timestamp: string;
        stack: string | undefined;
    };
    /**
     * Get user-friendly error message
     */
    getUserMessage(): string;
}
/**
 * Retry configuration
 */
export interface RetryConfig {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    retryableErrors?: ErrorCode[];
}
/**
 * Notification configuration
 */
export interface NotificationConfig {
    channels: ('log' | 'email' | 'webhook')[];
    severity: ('critical' | 'error' | 'warning')[];
    webhookUrl?: string;
    emailTo?: string[];
}
/**
 * Recovery strategy interface
 */
export interface RecoveryStrategy {
    retry?: RetryConfig;
    fallback?: () => Promise<any>;
    notify?: NotificationConfig;
    circuitBreaker?: {
        threshold: number;
        timeout: number;
        resetTimeout: number;
    };
}
/**
 * Error handler with recovery strategies
 */
export declare class ErrorHandler {
    private static recoveryStrategies;
    /**
     * Register a recovery strategy for specific error code
     */
    static registerRecovery(code: ErrorCode, strategy: RecoveryStrategy): void;
    /**
     * Handle error with recovery strategy
     */
    static handle(error: Error | ASEMBError, context?: Record<string, any>): Promise<any>;
    /**
     * Execute recovery strategy
     */
    private static executeRecovery;
    /**
     * Retry with exponential backoff
     */
    static retryWithBackoff<T>(operation: () => Promise<T>, config: RetryConfig): Promise<T>;
    /**
     * Log error with appropriate level
     */
    private static logError;
    /**
     * Send notifications for errors
     */
    private static sendNotifications;
    private static sendWebhook;
    private static sendEmail;
}
/**
 * Initialize default recovery strategies
 */
export declare function initializeErrorHandling(): void;
/**
 * Wrap async functions with error handling
 */
export declare function withErrorHandling<T extends (...args: any[]) => Promise<any>>(fn: T, defaultErrorCode?: ErrorCode): T;
/**
 * Create error response for n8n nodes
 */
export declare function createErrorOutput(error: Error | ASEMBError, continueOnFail?: boolean): INodeExecutionData[];
