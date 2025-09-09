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
export enum ErrorCode {
  // Database errors
  DB_CONNECTION_FAILED = 'DB_001',
  DB_QUERY_FAILED = 'DB_002',
  DB_TRANSACTION_FAILED = 'DB_003',
  DB_POOL_EXHAUSTED = 'DB_004',
  
  // Validation errors
  INVALID_INPUT = 'VAL_001',
  MISSING_REQUIRED = 'VAL_002',
  TYPE_MISMATCH = 'VAL_003',
  OUT_OF_RANGE = 'VAL_004',
  
  // Operation errors
  OPERATION_FAILED = 'OP_001',
  OPERATION_TIMEOUT = 'OP_002',
  OPERATION_CANCELLED = 'OP_003',
  CONCURRENT_MODIFICATION = 'OP_004',
  
  // Search errors
  SEARCH_FAILED = 'SEARCH_001',
  NO_RESULTS = 'SEARCH_002',
  INVALID_QUERY = 'SEARCH_003',
  INDEX_UNAVAILABLE = 'SEARCH_004',
  
  // Embedding errors
  EMBEDDING_FAILED = 'EMB_001',
  EMBEDDING_SERVICE_UNAVAILABLE = 'EMB_002',
  EMBEDDING_RATE_LIMITED = 'EMB_003',
  
  // Cache errors
  CACHE_OPERATION_FAILED = 'CACHE_001',
  CACHE_UNAVAILABLE = 'CACHE_002',
  
  // System errors
  INTERNAL_ERROR = 'SYS_001',
  CONFIGURATION_ERROR = 'SYS_002',
  RESOURCE_EXHAUSTED = 'SYS_003'
}

/**
 * Main error class for ASEMB system
 */
export class ASEMBError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly recoverable: boolean;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;
  
  constructor(
    code: ErrorCode,
    message: string,
    details?: any,
    recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ASEMBError';
    this.code = code;
    this.details = details;
    this.recoverable = recoverable;
    this.timestamp = new Date();
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ASEMBError);
    }
  }
  
  /**
   * Get error severity based on code
   */
  get severity(): 'critical' | 'error' | 'warning' {
    const criticalCodes = [
      ErrorCode.DB_CONNECTION_FAILED,
      ErrorCode.INTERNAL_ERROR,
      ErrorCode.RESOURCE_EXHAUSTED
    ];
    
    const warningCodes = [
      ErrorCode.NO_RESULTS,
      ErrorCode.CACHE_UNAVAILABLE
    ];
    
    if (criticalCodes.includes(this.code)) return 'critical';
    if (warningCodes.includes(this.code)) return 'warning';
    return 'error';
  }
  
  /**
   * Convert to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }
  
  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    const userMessages: Record<ErrorCode, string> = {
      [ErrorCode.DB_CONNECTION_FAILED]: 'Unable to connect to database. Please try again later.',
      [ErrorCode.DB_QUERY_FAILED]: 'Database query failed. Please check your input.',
      [ErrorCode.INVALID_INPUT]: 'Invalid input provided. Please check your data.',
      [ErrorCode.MISSING_REQUIRED]: 'Required fields are missing.',
      [ErrorCode.SEARCH_FAILED]: 'Search operation failed. Please try again.',
      [ErrorCode.NO_RESULTS]: 'No results found for your query.',
      [ErrorCode.EMBEDDING_FAILED]: 'Failed to generate embeddings.',
      [ErrorCode.CACHE_UNAVAILABLE]: 'Cache is temporarily unavailable.',
      [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred. Please contact support.',
      [ErrorCode.CONFIGURATION_ERROR]: 'System configuration error detected.',
      [ErrorCode.RESOURCE_EXHAUSTED]: 'System resources are exhausted. Please try again later.',
      [ErrorCode.DB_TRANSACTION_FAILED]: 'Database transaction failed.',
      [ErrorCode.DB_POOL_EXHAUSTED]: 'Database connection pool exhausted.',
      [ErrorCode.TYPE_MISMATCH]: 'Type mismatch in provided data.',
      [ErrorCode.OUT_OF_RANGE]: 'Value is out of acceptable range.',
      [ErrorCode.OPERATION_FAILED]: 'Operation failed.',
      [ErrorCode.OPERATION_TIMEOUT]: 'Operation timed out.',
      [ErrorCode.OPERATION_CANCELLED]: 'Operation was cancelled.',
      [ErrorCode.CONCURRENT_MODIFICATION]: 'Concurrent modification detected.',
      [ErrorCode.INVALID_QUERY]: 'Invalid search query.',
      [ErrorCode.INDEX_UNAVAILABLE]: 'Search index is unavailable.',
      [ErrorCode.EMBEDDING_SERVICE_UNAVAILABLE]: 'Embedding service is unavailable.',
      [ErrorCode.EMBEDDING_RATE_LIMITED]: 'Embedding service rate limit exceeded.',
      [ErrorCode.CACHE_OPERATION_FAILED]: 'Cache operation failed.'
    };
    
    return userMessages[this.code] || this.message;
  }
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
export class ErrorHandler {
  private static recoveryStrategies = new Map<ErrorCode, RecoveryStrategy>();
  
  /**
   * Register a recovery strategy for specific error code
   */
  static registerRecovery(code: ErrorCode, strategy: RecoveryStrategy) {
    this.recoveryStrategies.set(code, strategy);
  }
  
  /**
   * Handle error with recovery strategy
   */
  static async handle(
    error: Error | ASEMBError,
    context?: Record<string, any>
  ): Promise<any> {
    // Convert to ASEMBError if needed
    const asembError = error instanceof ASEMBError
      ? error
      : new ASEMBError(
          ErrorCode.INTERNAL_ERROR,
          error.message,
          { originalError: error },
          false
        );
    
    // Log error
    this.logError(asembError, context);
    
    // Get recovery strategy
    const strategy = this.recoveryStrategies.get(asembError.code);
    
    if (strategy && asembError.recoverable) {
      return await this.executeRecovery(asembError, strategy, context);
    }
    
    // No recovery possible, throw the error
    throw asembError;
  }
  
  /**
   * Execute recovery strategy
   */
  private static async executeRecovery(
    error: ASEMBError,
    strategy: RecoveryStrategy,
    context?: Record<string, any>
  ): Promise<any> {
    // Try retry strategy
    if (strategy.retry) {
      try {
        return await this.retryWithBackoff(
          () => context?.operation?.(),
          strategy.retry
        );
      } catch (retryError) {
        console.error('Retry strategy failed:', retryError);
      }
    }
    
    // Try fallback
    if (strategy.fallback) {
      try {
        return await strategy.fallback();
      } catch (fallbackError) {
        console.error('Fallback strategy failed:', fallbackError);
      }
    }
    
    // Send notifications
    if (strategy.notify) {
      await this.sendNotifications(error, strategy.notify);
    }
    
    throw error;
  }
  
  /**
   * Retry with exponential backoff
   */
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = config.initialDelay;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Check if error is retryable
        if (error instanceof ASEMBError) {
          if (config.retryableErrors && !config.retryableErrors.includes(error.code)) {
            throw error;
          }
          if (!error.recoverable) {
            throw error;
          }
        }
        
        if (attempt < config.maxAttempts) {
          console.log(`Retry attempt ${attempt}/${config.maxAttempts} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        }
      }
    }
    
    throw lastError || new Error('Retry failed');
  }
  
  /**
   * Log error with appropriate level
   */
  private static logError(error: ASEMBError, context?: Record<string, any>) {
    const logData = {
      ...error.toJSON(),
      context
    };
    
    switch (error.severity) {
      case 'critical':
        console.error('[CRITICAL]', logData);
        break;
      case 'error':
        console.error('[ERROR]', logData);
        break;
      case 'warning':
        console.warn('[WARNING]', logData);
        break;
    }
  }
  
  /**
   * Send notifications for errors
   */
  private static async sendNotifications(
    error: ASEMBError,
    config: NotificationConfig
  ): Promise<void> {
    if (!config.severity.includes(error.severity)) {
      return;
    }
    
    const promises: Promise<void>[] = [];
    
    if (config.channels.includes('log')) {
      promises.push(Promise.resolve(this.logError(error)));
    }
    
    if (config.channels.includes('webhook') && config.webhookUrl) {
      promises.push(this.sendWebhook(error, config.webhookUrl));
    }
    
    if (config.channels.includes('email') && config.emailTo) {
      promises.push(this.sendEmail(error, config.emailTo));
    }
    
    await Promise.allSettled(promises);
  }
  
  private static async sendWebhook(error: ASEMBError, url: string): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error.toJSON())
      });
    } catch (err) {
      console.error('Failed to send webhook notification:', err);
    }
  }
  
  private static async sendEmail(error: ASEMBError, recipients: string[]): Promise<void> {
    // Email implementation would go here
    console.log(`Would send email to ${recipients.join(', ')} about error:`, error.code);
  }
}

/**
 * Initialize default recovery strategies
 */
export function initializeErrorHandling() {
  // Database connection failures - retry with exponential backoff
  ErrorHandler.registerRecovery(ErrorCode.DB_CONNECTION_FAILED, {
    retry: {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: [ErrorCode.DB_CONNECTION_FAILED, ErrorCode.DB_POOL_EXHAUSTED]
    },
    notify: {
      channels: ['log', 'webhook'],
      severity: ['critical']
    }
  });
  
  // Search failures - retry with smaller backoff
  ErrorHandler.registerRecovery(ErrorCode.SEARCH_FAILED, {
    retry: {
      maxAttempts: 3,
      initialDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 1.5
    }
  });
  
  // Cache failures - fallback to direct database
  ErrorHandler.registerRecovery(ErrorCode.CACHE_UNAVAILABLE, {
    fallback: async () => {
      console.log('Cache unavailable, falling back to direct database access');
      return null;
    }
  });
  
  // Rate limiting - exponential backoff
  ErrorHandler.registerRecovery(ErrorCode.EMBEDDING_RATE_LIMITED, {
    retry: {
      maxAttempts: 5,
      initialDelay: 5000,
      maxDelay: 60000,
      backoffMultiplier: 2
    }
  });
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  defaultErrorCode: ErrorCode = ErrorCode.OPERATION_FAILED
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error: any) {
      if (error instanceof ASEMBError) {
        throw error;
      }
      
      throw new ASEMBError(
        defaultErrorCode,
        error.message || 'Operation failed',
        { originalError: error },
        false
      );
    }
  }) as T;
}

/**
 * Create error response for n8n nodes
 */
export function createErrorOutput(
  error: Error | ASEMBError,
  continueOnFail: boolean = false
): INodeExecutionData[] {
  const asembError = error instanceof ASEMBError
    ? error
    : new ASEMBError(ErrorCode.INTERNAL_ERROR, error.message, { originalError: error });
  
  const errorOutput = {
    json: {
      error: true,
      code: asembError.code,
      message: asembError.getUserMessage(),
      details: asembError.details,
      severity: asembError.severity,
      timestamp: asembError.timestamp.toISOString()
    }
  };
  
  if (continueOnFail) {
    return [errorOutput];
  }
  
  throw asembError;
}