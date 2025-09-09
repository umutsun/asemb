"use strict";
/**
 * ASEMB Error Handling Standard
 * @author Claude - Architecture Lead
 * @version Phase 3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.AsembError = exports.ErrorCode = void 0;
const n8n_workflow_1 = require("n8n-workflow");
var ErrorCode;
(function (ErrorCode) {
    // Workspace Errors (1xxx)
    ErrorCode["WORKSPACE_NOT_FOUND"] = "ASEMB_1001";
    ErrorCode["WORKSPACE_QUOTA_EXCEEDED"] = "ASEMB_1002";
    ErrorCode["WORKSPACE_LOCKED"] = "ASEMB_1003";
    // Database Errors (2xxx)
    ErrorCode["DATABASE_CONNECTION_FAILED"] = "ASEMB_2001";
    ErrorCode["DATABASE_QUERY_FAILED"] = "ASEMB_2002";
    ErrorCode["DATABASE_TRANSACTION_FAILED"] = "ASEMB_2003";
    ErrorCode["DATABASE_POOL_EXHAUSTED"] = "ASEMB_2004";
    // Embedding Errors (3xxx)
    ErrorCode["EMBEDDING_FAILED"] = "ASEMB_3001";
    ErrorCode["EMBEDDING_DIMENSION_MISMATCH"] = "ASEMB_3002";
    ErrorCode["EMBEDDING_PROVIDER_ERROR"] = "ASEMB_3003";
    ErrorCode["EMBEDDING_RATE_LIMITED"] = "ASEMB_3004";
    // Search Errors (4xxx)
    ErrorCode["SEARCH_FAILED"] = "ASEMB_4001";
    ErrorCode["SEARCH_TIMEOUT"] = "ASEMB_4002";
    ErrorCode["SEARCH_NO_RESULTS"] = "ASEMB_4003";
    ErrorCode["SEARCH_INVALID_QUERY"] = "ASEMB_4004";
    // Cache Errors (5xxx)
    ErrorCode["CACHE_CONNECTION_FAILED"] = "ASEMB_5001";
    ErrorCode["CACHE_OPERATION_FAILED"] = "ASEMB_5002";
    ErrorCode["CACHE_INVALIDATION_FAILED"] = "ASEMB_5003";
    // Validation Errors (6xxx)
    ErrorCode["INVALID_INPUT"] = "ASEMB_6001";
    ErrorCode["INVALID_CHUNK_SIZE"] = "ASEMB_6002";
    ErrorCode["INVALID_SOURCE_ID"] = "ASEMB_6003";
    ErrorCode["MISSING_REQUIRED_FIELD"] = "ASEMB_6004";
    // Rate Limiting Errors (7xxx)
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "ASEMB_7001";
    ErrorCode["QUOTA_EXCEEDED"] = "ASEMB_7002";
    // System Errors (9xxx)
    ErrorCode["INTERNAL_ERROR"] = "ASEMB_9001";
    ErrorCode["NOT_IMPLEMENTED"] = "ASEMB_9002";
    ErrorCode["SERVICE_UNAVAILABLE"] = "ASEMB_9003";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
class AsembError extends Error {
    constructor(code, message, details) {
        var _a;
        super(message);
        this.name = 'AsembError';
        this.code = code;
        this.statusCode = (details === null || details === void 0 ? void 0 : details.statusCode) || this.getDefaultStatusCode(code);
        this.retryable = (_a = details === null || details === void 0 ? void 0 : details.retryable) !== null && _a !== void 0 ? _a : this.isRetryableError(code);
        this.context = details === null || details === void 0 ? void 0 : details.context;
        this.timestamp = new Date();
        // Ensure stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AsembError);
        }
    }
    getDefaultStatusCode(code) {
        const prefix = code.slice(0, 7); // ASEMB_X
        switch (prefix[6]) {
            case '1': return 404; // Workspace errors
            case '2': return 503; // Database errors
            case '3': return 502; // Embedding errors
            case '4': return 400; // Search errors
            case '5': return 503; // Cache errors
            case '6': return 400; // Validation errors
            case '7': return 429; // Rate limiting
            case '9': return 500; // System errors
            default: return 500;
        }
    }
    isRetryableError(code) {
        const retryableCodes = [
            ErrorCode.DATABASE_CONNECTION_FAILED,
            ErrorCode.DATABASE_POOL_EXHAUSTED,
            ErrorCode.EMBEDDING_RATE_LIMITED,
            ErrorCode.CACHE_CONNECTION_FAILED,
            ErrorCode.RATE_LIMIT_EXCEEDED,
            ErrorCode.SERVICE_UNAVAILABLE
        ];
        return retryableCodes.includes(code);
    }
    toJSON() {
        return {
            code: this.code,
            statusCode: this.statusCode,
            retryable: this.retryable,
            context: this.context,
            userMessage: this.message,
            developerMessage: this.stack
        };
    }
    toNodeError(node) {
        var _a;
        return new n8n_workflow_1.NodeOperationError(node, this.message, {
            message: this.message,
            description: `Error Code: ${this.code}`,
            itemIndex: (_a = this.context) === null || _a === void 0 ? void 0 : _a.itemIndex
        });
    }
}
exports.AsembError = AsembError;
/**
 * Error handler with retry logic
 */
class ErrorHandler {
    static async withRetry(fn, options = {}) {
        const { maxAttempts = 3, backoffMs = 1000, exponential = true, onRetry } = options;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                // Check if error is retryable
                const isRetryable = error instanceof AsembError
                    ? error.retryable
                    : this.isRetryableError(error);
                if (!isRetryable || attempt === maxAttempts) {
                    throw error;
                }
                // Calculate delay
                const delay = exponential
                    ? backoffMs * Math.pow(2, attempt - 1)
                    : backoffMs;
                // Call retry callback
                if (onRetry) {
                    onRetry(attempt, error);
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
    static isRetryableError(error) {
        // Check for common retryable error patterns
        const message = error.message.toLowerCase();
        return (message.includes('timeout') ||
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            message.includes('rate limit') ||
            message.includes('429') ||
            message.includes('503'));
    }
    /**
     * Wrap errors with context
     */
    static wrapError(error, code, context) {
        if (error instanceof AsembError) {
            // Add additional context
            if (context) {
                // Merge additional context safely
                if (!error.context) {
                    error.context = {};
                }
                Object.assign(error.context, context || {});
            }
            return error;
        }
        const message = error instanceof Error
            ? error.message
            : String(error);
        return new AsembError(code, message, { context });
    }
    /**
     * Create user-friendly error messages
     */
    static getUserMessage(error) {
        switch (error.code) {
            case ErrorCode.WORKSPACE_NOT_FOUND:
                return 'The requested workspace does not exist';
            case ErrorCode.RATE_LIMIT_EXCEEDED:
                return 'Too many requests. Please try again later';
            case ErrorCode.INVALID_CHUNK_SIZE:
                return 'The chunk size must be between 100 and 2048 characters';
            case ErrorCode.DATABASE_CONNECTION_FAILED:
                return 'Unable to connect to the database. Please try again';
            case ErrorCode.EMBEDDING_FAILED:
                return 'Failed to generate embeddings. Please check your API credentials';
            default:
                return 'An error occurred while processing your request';
        }
    }
}
exports.ErrorHandler = ErrorHandler;
