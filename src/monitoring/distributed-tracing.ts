import { trace, context, SpanKind, SpanStatusCode, Span, Context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

export interface ServiceSpan {
  name: string;
  service: string;
  operation: string;
  attributes?: Record<string, any>;
  baggage?: Record<string, string>;
}

export class DistributedTracing {
  private tracer: any;
  private propagator: W3CTraceContextPropagator;
  private serviceName: string;
  private activeSpans: Map<string, Span> = new Map();

  constructor(serviceName: string, version: string = '1.0.0') {
    this.serviceName = serviceName;
    this.tracer = trace.getTracer(serviceName, version);
    this.propagator = new W3CTraceContextPropagator();
  }

  startServiceSpan(config: ServiceSpan): Span {
    const span = this.tracer.startSpan(`${config.service}.${config.operation}`, {
      kind: SpanKind.SERVER,
      attributes: {
        [SemanticAttributes.SERVICE_NAME]: config.service,
        'operation.name': config.operation,
        'operation.type': config.name,
        ...config.attributes
      }
    });

    const spanId = span.spanContext().spanId;
    this.activeSpans.set(spanId, span);

    if (config.baggage) {
      Object.entries(config.baggage).forEach(([key, value]) => {
        span.setAttribute(`baggage.${key}`, value);
      });
    }

    return span;
  }

  async traceAsyncOperation<T>(
    operationName: string,
    fn: (span: Span) => Promise<T>,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, any>;
      parentSpan?: Span;
    }
  ): Promise<T> {
    const parentContext = options?.parentSpan 
      ? trace.setSpan(context.active(), options.parentSpan)
      : context.active();

    const span = this.tracer.startSpan(operationName, {
      kind: options?.kind || SpanKind.INTERNAL,
      attributes: options?.attributes
    }, parentContext);

    try {
      const result = await context.with(
        trace.setSpan(parentContext, span),
        () => fn(span)
      );

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
      this.activeSpans.delete(span.spanContext().spanId);
    }
  }

  traceSyncOperation<T>(
    operationName: string,
    fn: (span: Span) => T,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, any>;
      parentSpan?: Span;
    }
  ): T {
    const parentContext = options?.parentSpan 
      ? trace.setSpan(context.active(), options.parentSpan)
      : context.active();

    const span = this.tracer.startSpan(operationName, {
      kind: options?.kind || SpanKind.INTERNAL,
      attributes: options?.attributes
    }, parentContext);

    try {
      const result = context.with(
        trace.setSpan(parentContext, span),
        () => fn(span)
      );

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
      this.activeSpans.delete(span.spanContext().spanId);
    }
  }

  async traceHttpRequest(
    url: string,
    options: RequestInit & { span?: Span }
  ): Promise<Response> {
    const parentSpan = options.span || trace.getActiveSpan();
    
    return this.traceAsyncOperation(
      `HTTP ${options.method || 'GET'} ${url}`,
      async (span) => {
        span.setAttributes({
          [SemanticAttributes.HTTP_METHOD]: options.method || 'GET',
          [SemanticAttributes.HTTP_URL]: url,
          [SemanticAttributes.HTTP_TARGET]: new URL(url).pathname
        });

        const headers = new Headers(options.headers);
        this.injectTraceContext(headers);

        const response = await fetch(url, {
          ...options,
          headers
        });

        span.setAttributes({
          [SemanticAttributes.HTTP_STATUS_CODE]: response.status,
          [SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH]: 
            response.headers.get('content-length') || 0
        });

        if (!response.ok) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${response.status}`
          });
        }

        return response;
      },
      {
        kind: SpanKind.CLIENT,
        parentSpan
      }
    );
  }

  async traceDatabaseQuery(
    query: string,
    params: any[],
    execute: () => Promise<any>,
    options?: {
      dbSystem?: string;
      dbName?: string;
      parentSpan?: Span;
    }
  ): Promise<any> {
    return this.traceAsyncOperation(
      `db.query`,
      async (span) => {
        span.setAttributes({
          [SemanticAttributes.DB_SYSTEM]: options?.dbSystem || 'postgresql',
          [SemanticAttributes.DB_NAME]: options?.dbName,
          [SemanticAttributes.DB_STATEMENT]: this.sanitizeQuery(query),
          'db.params_count': params.length
        });

        const startTime = Date.now();
        const result = await execute();
        const duration = Date.now() - startTime;

        span.setAttributes({
          'db.rows_affected': result.rowCount || 0,
          'db.duration_ms': duration
        });

        return result;
      },
      {
        kind: SpanKind.CLIENT,
        parentSpan: options?.parentSpan
      }
    );
  }

  async traceRedisOperation(
    command: string,
    args: any[],
    execute: () => Promise<any>,
    options?: {
      parentSpan?: Span;
    }
  ): Promise<any> {
    return this.traceAsyncOperation(
      `redis.${command}`,
      async (span) => {
        span.setAttributes({
          [SemanticAttributes.DB_SYSTEM]: 'redis',
          'redis.command': command,
          'redis.args_count': args.length
        });

        const startTime = Date.now();
        const result = await execute();
        const duration = Date.now() - startTime;

        span.setAttributes({
          'redis.duration_ms': duration,
          'redis.response_size': JSON.stringify(result).length
        });

        return result;
      },
      {
        kind: SpanKind.CLIENT,
        parentSpan: options?.parentSpan
      }
    );
  }

  async traceMessageQueue(
    operation: 'send' | 'receive' | 'process',
    queueName: string,
    fn: () => Promise<any>,
    options?: {
      messageId?: string;
      correlationId?: string;
      parentSpan?: Span;
    }
  ): Promise<any> {
    const spanKind = operation === 'send' ? SpanKind.PRODUCER : SpanKind.CONSUMER;

    return this.traceAsyncOperation(
      `${queueName}.${operation}`,
      async (span) => {
        span.setAttributes({
          [SemanticAttributes.MESSAGING_SYSTEM]: 'rabbitmq',
          [SemanticAttributes.MESSAGING_DESTINATION]: queueName,
          [SemanticAttributes.MESSAGING_OPERATION]: operation,
          'messaging.message_id': options?.messageId,
          'messaging.correlation_id': options?.correlationId
        });

        return await fn();
      },
      {
        kind: spanKind,
        parentSpan: options?.parentSpan
      }
    );
  }

  createChildSpan(name: string, parentSpan?: Span): Span {
    const parent = parentSpan || trace.getActiveSpan();
    const parentContext = parent ? trace.setSpan(context.active(), parent) : context.active();

    return this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL
    }, parentContext);
  }

  linkSpans(span: Span, linkedSpans: Span[]): void {
    linkedSpans.forEach((linkedSpan, index) => {
      const linkedContext = linkedSpan.spanContext();
      span.setAttribute(`link.${index}.trace_id`, linkedContext.traceId);
      span.setAttribute(`link.${index}.span_id`, linkedContext.spanId);
    });
  }

  injectTraceContext(carrier: Headers | Record<string, string>): void {
    const currentContext = context.active();
    
    if (carrier instanceof Headers) {
      const temp: Record<string, string> = {};
      this.propagator.inject(currentContext, temp, {
        set: (carrier, key, value) => {
          carrier[key] = value;
        },
        get: () => undefined,
        keys: () => []
      });
      
      Object.entries(temp).forEach(([key, value]) => {
        carrier.set(key, value);
      });
    } else {
      this.propagator.inject(currentContext, carrier, {
        set: (carrier, key, value) => {
          carrier[key] = value;
        },
        get: () => undefined,
        keys: () => []
      });
    }
  }

  extractTraceContext(carrier: Headers | Record<string, string>): Context {
    if (carrier instanceof Headers) {
      const temp: Record<string, string> = {};
      carrier.forEach((value, key) => {
        temp[key] = value;
      });
      
      return this.propagator.extract(context.active(), temp, {
        get: (carrier, key) => carrier[key],
        set: () => {},
        keys: (carrier) => Object.keys(carrier)
      });
    }

    return this.propagator.extract(context.active(), carrier, {
      get: (carrier, key) => carrier[key],
      set: () => {},
      keys: (carrier) => Object.keys(carrier)
    });
  }

  getCurrentTraceContext(): TraceContext | null {
    const span = trace.getActiveSpan();
    
    if (!span) {
      return null;
    }

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
      traceState: spanContext.traceState?.serialize()
    };
  }

  setSpanAttributes(span: Span, attributes: Record<string, any>): void {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value);
      }
    });
  }

  addSpanEvent(span: Span, name: string, attributes?: Record<string, any>): void {
    span.addEvent(name, attributes);
  }

  private sanitizeQuery(query: string): string {
    return query
      .replace(/\b\d{4,}\b/g, '?')
      .replace(/'.+?'/g, '?')
      .replace(/".+?"/g, '?')
      .substring(0, 1000);
  }

  getActiveSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  getAllActiveSpans(): Map<string, Span> {
    return new Map(this.activeSpans);
  }

  endSpan(span: Span, status?: { code: SpanStatusCode; message?: string }): void {
    if (status) {
      span.setStatus(status);
    }
    span.end();
    this.activeSpans.delete(span.spanContext().spanId);
  }

  createBaggage(items: Record<string, string>): string {
    return Object.entries(items)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
  }

  parseBaggage(baggageString: string): Record<string, string> {
    const items: Record<string, string> = {};
    
    baggageString.split(',').forEach(item => {
      const [key, value] = item.split('=');
      if (key && value) {
        items[key.trim()] = value.trim();
      }
    });

    return items;
  }
}

export class TracingMiddleware {
  private tracing: DistributedTracing;

  constructor(serviceName: string) {
    this.tracing = new DistributedTracing(serviceName);
  }

  express() {
    return (req: any, res: any, next: any) => {
      const traceContext = this.tracing.extractTraceContext(req.headers);

      context.with(traceContext, () => {
        const span = this.tracing.startServiceSpan({
          name: 'http.request',
          service: 'express',
          operation: `${req.method} ${req.path}`,
          attributes: {
            [SemanticAttributes.HTTP_METHOD]: req.method,
            [SemanticAttributes.HTTP_URL]: req.url,
            [SemanticAttributes.HTTP_TARGET]: req.path,
            [SemanticAttributes.HTTP_HOST]: req.hostname,
            [SemanticAttributes.HTTP_SCHEME]: req.protocol,
            [SemanticAttributes.HTTP_USER_AGENT]: req.get('user-agent'),
            [SemanticAttributes.NET_PEER_IP]: req.ip
          }
        });

        req.span = span;
        req.tracing = this.tracing;

        const originalSend = res.send;
        res.send = function(data: any) {
          res.send = originalSend;

          span.setAttributes({
            [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
            [SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH]: 
              res.get('content-length') || Buffer.byteLength(data)
          });

          if (res.statusCode >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${res.statusCode}`
            });
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
          }

          span.end();
          return res.send(data);
        };

        next();
      });
    };
  }
}

export function createTracingMiddleware(serviceName: string): any {
  return new TracingMiddleware(serviceName).express();
}

export default DistributedTracing;