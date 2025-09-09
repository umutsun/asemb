/**
 * Alice Semantic Bridge - Error Handling & Retry Logic
 * @author Claude (Architecture Lead)
 */
import { IWorkflowError } from './interfaces';
export declare enum ErrorType {
    CONNECTION_ERROR = "CONNECTION_ERROR",
    RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    PROCESSING_ERROR = "PROCESSING_ERROR",
    TIMEOUT_ERROR = "TIMEOUT_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export interface IErrorContext {
    nodeId?: string;
    nodeName?: string;
    operation?: string;
    itemIndex?: number;
    projectKey?: string;
    metadata?: Record<string, any>;
}
export declare class ASBError extends Error {
    readonly type: ErrorType;
    readonly context: IErrorContext;
    readonly recoverable: boolean;
    readonly retryAfter?: number;
    constructor(message: string, type?: ErrorType, context?: IErrorContext, recoverable?: boolean, retryAfter?: number);
    toWorkflowError(): IWorkflowError;
}
export interface IRetryConfig {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: boolean;
}
export declare const DEFAULT_RETRY_CONFIG: IRetryConfig;
export declare function retryWithBackoff<T>(fn: () => Promise<T>, config?: Partial<IRetryConfig>, onRetry?: (attempt: number, error: Error) => void): Promise<T>;
export declare function connectRedisWithRetry(connectFn: () => Promise<any>, context?: IErrorContext): Promise<any>;
export declare function callOpenAIWithRetry<T>(apiCall: () => Promise<T>, context?: IErrorContext): Promise<T>;
export declare class ServiceDegradation {
    private serviceStatus;
    private fallbackStrategies;
    constructor();
    private registerFallbacks;
    executeWithFallback<T>(service: string, operation: () => Promise<T>): Promise<T>;
    isServiceHealthy(service: string): boolean;
    getServiceStatus(): Record<string, boolean>;
}
export declare function formatErrorMessage(error: Error | ASBError, context?: IErrorContext): string;
export declare const serviceDegradation: ServiceDegradation;
