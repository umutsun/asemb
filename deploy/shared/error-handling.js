"use strict";
/**
 * Alice Semantic Bridge - Error Handling & Retry Logic
 * @author Claude (Architecture Lead)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceDegradation = exports.ServiceDegradation = exports.DEFAULT_RETRY_CONFIG = exports.ASBError = exports.ErrorType = void 0;
exports.retryWithBackoff = retryWithBackoff;
exports.connectRedisWithRetry = connectRedisWithRetry;
exports.callOpenAIWithRetry = callOpenAIWithRetry;
exports.formatErrorMessage = formatErrorMessage;
// Error Types
var ErrorType;
(function (ErrorType) {
    ErrorType["CONNECTION_ERROR"] = "CONNECTION_ERROR";
    ErrorType["RATE_LIMIT_ERROR"] = "RATE_LIMIT_ERROR";
    ErrorType["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorType["PROCESSING_ERROR"] = "PROCESSING_ERROR";
    ErrorType["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
    ErrorType["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
class ASBError extends Error {
    constructor(message, type = ErrorType.UNKNOWN_ERROR, context = {}, recoverable = false, retryAfter) {
        super(message);
        this.name = 'ASBError';
        this.type = type;
        this.context = context;
        this.recoverable = recoverable;
        this.retryAfter = retryAfter;
    }
    toWorkflowError() {
        return {
            nodeId: this.context.nodeId || 'unknown',
            nodeName: this.context.nodeName || 'unknown',
            error: this.message,
            timestamp: new Date(),
            itemIndex: this.context.itemIndex,
            recoverable: this.recoverable,
        };
    }
}
exports.ASBError = ASBError;
exports.DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
};
// Retry Logic with Exponential Backoff
async function retryWithBackoff(fn, config = {}, onRetry) {
    const { maxRetries, initialDelay, maxDelay, backoffMultiplier, jitter } = {
        ...exports.DEFAULT_RETRY_CONFIG,
        ...config,
    };
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // Check if error is recoverable
            if (error instanceof ASBError && !error.recoverable) {
                throw error;
            }
            if (attempt === maxRetries) {
                throw new ASBError(`Failed after ${maxRetries} attempts: ${lastError.message}`, ErrorType.CONNECTION_ERROR, { metadata: { attempts: maxRetries } }, false);
            }
            // Calculate delay with exponential backoff
            let delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
            delay = Math.min(delay, maxDelay);
            // Add jitter to prevent thundering herd
            if (jitter) {
                delay = delay * (0.5 + Math.random() * 0.5);
            }
            // Use custom retry delay if specified (e.g., from rate limit headers)
            if (error instanceof ASBError && error.retryAfter) {
                delay = error.retryAfter * 1000;
            }
            if (onRetry) {
                onRetry(attempt, lastError);
            }
            await sleep(delay);
        }
    }
    throw lastError;
}
// Redis Connection with Retry
async function connectRedisWithRetry(connectFn, context = {}) {
    return retryWithBackoff(async () => {
        try {
            return await connectFn();
        }
        catch (error) {
            throw new ASBError(`Redis connection failed: ${error.message}`, ErrorType.CONNECTION_ERROR, context, true // Redis connection errors are recoverable
            );
        }
    }, {
        maxRetries: 5,
        initialDelay: 1000,
        maxDelay: 10000,
    }, (attempt, error) => {
        console.log(`Redis connection attempt ${attempt} failed:`, error.message);
    });
}
// OpenAI API with Rate Limit Handling
async function callOpenAIWithRetry(apiCall, context = {}) {
    return retryWithBackoff(async () => {
        var _a, _b;
        try {
            return await apiCall();
        }
        catch (error) {
            // Check for rate limit error
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 429) {
                const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
                throw new ASBError('OpenAI API rate limit exceeded', ErrorType.RATE_LIMIT_ERROR, context, true, retryAfter);
            }
            // Check for timeout
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                throw new ASBError('OpenAI API request timeout', ErrorType.TIMEOUT_ERROR, context, true);
            }
            // Other errors
            throw new ASBError(`OpenAI API error: ${error.message}`, ErrorType.PROCESSING_ERROR, context, ((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) >= 500 // 5xx errors are recoverable
            );
        }
    }, {
        maxRetries: 3,
        initialDelay: 2000,
        backoffMultiplier: 3,
    });
}
// Graceful Degradation
class ServiceDegradation {
    constructor() {
        this.serviceStatus = new Map();
        this.fallbackStrategies = new Map();
        this.registerFallbacks();
    }
    registerFallbacks() {
        // OpenAI fallback
        this.fallbackStrategies.set('openai', () => {
            console.warn('OpenAI service degraded, using mock embeddings');
            return {
                embedding: new Array(1536).fill(0).map(() => Math.random()),
                model: 'mock-embedding',
            };
        });
        // Redis fallback
        this.fallbackStrategies.set('redis', () => {
            console.warn('Redis service degraded, using in-memory cache');
            return new Map();
        });
        // PostgreSQL fallback
        this.fallbackStrategies.set('postgres', () => {
            console.warn('PostgreSQL service degraded, returning empty results');
            return [];
        });
    }
    async executeWithFallback(service, operation) {
        try {
            const result = await operation();
            this.serviceStatus.set(service, true);
            return result;
        }
        catch (error) {
            this.serviceStatus.set(service, false);
            const fallback = this.fallbackStrategies.get(service);
            if (fallback) {
                return fallback();
            }
            throw error;
        }
    }
    isServiceHealthy(service) {
        var _a;
        return (_a = this.serviceStatus.get(service)) !== null && _a !== void 0 ? _a : true;
    }
    getServiceStatus() {
        return Object.fromEntries(this.serviceStatus);
    }
}
exports.ServiceDegradation = ServiceDegradation;
// Error Message Formatter
function formatErrorMessage(error, context = {}) {
    const parts = [];
    // Add context information
    if (context.nodeName) {
        parts.push(`[${context.nodeName}]`);
    }
    if (context.operation) {
        parts.push(`Operation: ${context.operation}`);
    }
    if (context.itemIndex !== undefined) {
        parts.push(`Item #${context.itemIndex}`);
    }
    // Add error message
    parts.push(error.message);
    // Add recovery hint
    if (error instanceof ASBError && error.recoverable) {
        parts.push('(This error may be temporary)');
    }
    return parts.join(' - ');
}
// Utility Functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Export singleton instance
exports.serviceDegradation = new ServiceDegradation();
