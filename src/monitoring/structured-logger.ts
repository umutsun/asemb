import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import { trace, context } from '@opentelemetry/api';

export interface LogContext {
  service?: string;
  component?: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, any>;
}

export interface LoggerConfig {
  level: string;
  service: string;
  environment: string;
  elasticsearch?: {
    node: string;
    index: string;
    auth?: {
      username: string;
      password: string;
    };
  };
  file?: {
    filename: string;
    maxSize: string;
    maxFiles: number;
  };
  console?: boolean;
}

export class StructuredLogger {
  private logger: winston.Logger;
  private config: LoggerConfig;
  private defaultContext: LogContext;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.defaultContext = {
      service: config.service,
      environment: config.environment
    };

    this.logger = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    if (this.config.console !== false) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(info => {
            const { timestamp, level, message, ...meta } = info;
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      }));
    }

    if (this.config.file) {
      transports.push(new winston.transports.File({
        filename: this.config.file.filename,
        maxsize: this.parseSize(this.config.file.maxSize),
        maxFiles: this.config.file.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    if (this.config.elasticsearch) {
      const esTransport = new ElasticsearchTransport({
        level: this.config.level,
        clientOpts: {
          node: this.config.elasticsearch.node,
          auth: this.config.elasticsearch.auth
        },
        index: this.config.elasticsearch.index,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        transformer: (logData: any) => {
          const transformed = {
            '@timestamp': logData.timestamp || new Date().toISOString(),
            severity: logData.level,
            message: logData.message,
            ...this.extractTraceContext(),
            ...this.defaultContext,
            ...logData.meta
          };
          return transformed;
        }
      });

      transports.push(esTransport);
    }

    return winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: this.defaultContext,
      transports
    });
  }

  private parseSize(size: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024
    };

    const match = size.toLowerCase().match(/^(\d+)([a-z]+)$/);
    if (!match) {
      return parseInt(size);
    }

    const [, value, unit] = match;
    return parseInt(value) * (units[unit] || 1);
  }

  private extractTraceContext(): { traceId?: string; spanId?: string } {
    const span = trace.getActiveSpan();
    
    if (!span) {
      return {};
    }

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId
    };
  }

  private formatMessage(message: string, context?: LogContext): any {
    const traceContext = this.extractTraceContext();
    
    return {
      message,
      ...this.defaultContext,
      ...traceContext,
      ...context,
      timestamp: new Date().toISOString()
    };
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.formatMessage(message, context));
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.formatMessage(message, context));
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.formatMessage(message, context));
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error ? {
        message: error.message || error,
        stack: error.stack,
        name: error.name,
        ...error
      } : undefined
    };

    this.logger.error(this.formatMessage(message, errorContext));
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    const fatalContext = {
      ...context,
      fatal: true,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    };

    this.logger.error(this.formatMessage(message, fatalContext));
  }

  async withContext<T>(
    context: LogContext,
    fn: () => Promise<T>
  ): Promise<T> {
    const previousContext = { ...this.defaultContext };
    this.defaultContext = { ...this.defaultContext, ...context };

    try {
      return await fn();
    } finally {
      this.defaultContext = previousContext;
    }
  }

  child(context: LogContext): StructuredLogger {
    const childConfig = { ...this.config };
    const childLogger = new StructuredLogger(childConfig);
    childLogger.defaultContext = { ...this.defaultContext, ...context };
    return childLogger;
  }

  startTimer(): () => void {
    const start = Date.now();
    
    return () => {
      const duration = Date.now() - start;
      return duration;
    };
  }

  profile(id: string, message?: string, context?: LogContext): void {
    const timestamp = Date.now();
    
    if (this.logger.profile) {
      this.logger.profile(id);
    }

    if (message) {
      this.info(message, {
        ...context,
        profileId: id,
        timestamp
      });
    }
  }

  query(queryInfo: {
    type: string;
    query: string;
    params?: any[];
    duration?: number;
    error?: Error;
  }): void {
    const context: LogContext = {
      component: 'database',
      metadata: {
        queryType: queryInfo.type,
        query: queryInfo.query,
        params: queryInfo.params,
        duration: queryInfo.duration
      }
    };

    if (queryInfo.error) {
      this.error('Database query failed', queryInfo.error, context);
    } else {
      this.debug('Database query executed', context);
    }
  }

  http(httpInfo: {
    method: string;
    url: string;
    statusCode?: number;
    duration?: number;
    error?: Error;
    headers?: Record<string, string>;
    body?: any;
  }): void {
    const context: LogContext = {
      component: 'http',
      metadata: {
        method: httpInfo.method,
        url: httpInfo.url,
        statusCode: httpInfo.statusCode,
        duration: httpInfo.duration,
        headers: httpInfo.headers,
        body: httpInfo.body
      }
    };

    if (httpInfo.error || (httpInfo.statusCode && httpInfo.statusCode >= 400)) {
      this.error('HTTP request failed', httpInfo.error, context);
    } else {
      this.info('HTTP request completed', context);
    }
  }

  metric(name: string, value: number, tags?: Record<string, any>): void {
    this.info('Metric recorded', {
      component: 'metrics',
      metadata: {
        metricName: name,
        value,
        tags
      }
    });
  }

  audit(action: string, details: {
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    changes?: any;
    result?: 'success' | 'failure';
    reason?: string;
  }): void {
    const auditContext: LogContext = {
      component: 'audit',
      userId: details.userId,
      metadata: {
        action,
        resourceType: details.resourceType,
        resourceId: details.resourceId,
        changes: details.changes,
        result: details.result,
        reason: details.reason,
        timestamp: new Date().toISOString()
      }
    };

    this.info(`Audit: ${action}`, auditContext);
  }

  security(event: string, details: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    threat?: string;
    action?: string;
    blocked?: boolean;
  }): void {
    const securityContext: LogContext = {
      component: 'security',
      userId: details.userId,
      metadata: {
        event,
        ip: details.ip,
        userAgent: details.userAgent,
        threat: details.threat,
        action: details.action,
        blocked: details.blocked
      }
    };

    const level = details.blocked ? 'warn' : 'info';
    this[level](`Security event: ${event}`, securityContext);
  }

  performance(operation: string, metrics: {
    duration: number;
    cpu?: number;
    memory?: number;
    throughput?: number;
    custom?: Record<string, any>;
  }): void {
    const perfContext: LogContext = {
      component: 'performance',
      metadata: {
        operation,
        ...metrics
      }
    };

    if (metrics.duration > 1000) {
      this.warn(`Slow operation: ${operation}`, perfContext);
    } else {
      this.debug(`Performance: ${operation}`, perfContext);
    }
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.logger.transports) {
        const transports = Array.isArray(this.logger.transports) 
          ? this.logger.transports 
          : [this.logger.transports];

        let pending = transports.length;
        
        transports.forEach((transport: any) => {
          if (transport.flush) {
            transport.flush(() => {
              pending--;
              if (pending === 0) resolve();
            });
          } else {
            pending--;
            if (pending === 0) resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  close(): void {
    this.logger.close();
  }
}

export class LoggerMiddleware {
  private logger: StructuredLogger;

  constructor(logger: StructuredLogger) {
    this.logger = logger;
  }

  express() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();
      const requestId = this.generateRequestId();

      req.logger = this.logger.child({
        requestId,
        userId: req.user?.id,
        metadata: {
          method: req.method,
          path: req.path,
          ip: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      req.logger.info('Request started', {
        metadata: {
          query: req.query,
          headers: this.sanitizeHeaders(req.headers)
        }
      });

      const originalSend = res.send;
      res.send = function(data: any) {
        res.send = originalSend;
        const duration = Date.now() - startTime;

        req.logger.http({
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          duration
        });

        if (res.statusCode >= 400) {
          req.logger.warn('Request failed', {
            metadata: {
              statusCode: res.statusCode,
              duration,
              response: data
            }
          });
        }

        return res.send(data);
      };

      next();
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}

let globalLogger: StructuredLogger | null = null;

export function initializeLogger(config: LoggerConfig): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger(config);
  }
  return globalLogger;
}

export function getLogger(): StructuredLogger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger first.');
  }
  return globalLogger;
}

export default StructuredLogger;