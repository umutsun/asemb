import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { metrics, trace, context, SpanStatusCode } from '@opentelemetry/api';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  otlpEndpoint?: string;
  prometheusPort?: number;
  enableAutoInstrumentation?: boolean;
  customAttributes?: Record<string, string>;
}

export class TelemetryService {
  private sdk: NodeSDK | null = null;
  private config: TelemetryConfig;
  private tracer: any;
  private meter: any;
  private customMetrics: Map<string, any> = new Map();
  private isInitialized: boolean = false;

  constructor(config: TelemetryConfig) {
    this.config = {
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
      prometheusPort: 9090,
      enableAutoInstrumentation: true,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
      ...this.config.customAttributes
    });

    const traceExporter = new OTLPTraceExporter({
      url: `${this.config.otlpEndpoint}/v1/traces`,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const metricExporter = new OTLPMetricExporter({
      url: `${this.config.otlpEndpoint}/v1/metrics`,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const prometheusExporter = new PrometheusExporter(
      {
        port: this.config.prometheusPort,
        endpoint: '/metrics'
      },
      () => {
        console.log(`Prometheus metrics available at http://localhost:${this.config.prometheusPort}/metrics`);
      }
    );

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10000
    });

    this.sdk = new NodeSDK({
      resource,
      spanProcessor: new BatchSpanProcessor(traceExporter),
      metricReader,
      instrumentations: this.config.enableAutoInstrumentation
        ? [getNodeAutoInstrumentations()]
        : []
    });

    await this.sdk.start();

    this.tracer = trace.getTracer(
      this.config.serviceName,
      this.config.serviceVersion
    );

    this.meter = metrics.getMeter(
      this.config.serviceName,
      this.config.serviceVersion
    );

    this.setupDefaultMetrics();
    this.isInitialized = true;

    console.log('OpenTelemetry initialized successfully');
  }

  private setupDefaultMetrics(): void {
    this.customMetrics.set('request_duration', this.meter.createHistogram('request_duration_ms', {
      description: 'Duration of HTTP requests in milliseconds',
      unit: 'ms'
    }));

    this.customMetrics.set('request_count', this.meter.createCounter('request_count', {
      description: 'Total number of requests'
    }));

    this.customMetrics.set('error_count', this.meter.createCounter('error_count', {
      description: 'Total number of errors'
    }));

    this.customMetrics.set('active_connections', this.meter.createUpDownCounter('active_connections', {
      description: 'Number of active connections'
    }));

    this.customMetrics.set('memory_usage', this.meter.createObservableGauge('memory_usage_mb', {
      description: 'Memory usage in MB'
    }));

    this.meter.addBatchObservableCallback(
      (observableResult: any) => {
        const memUsage = process.memoryUsage();
        observableResult.observe(
          this.customMetrics.get('memory_usage'),
          Math.round(memUsage.heapUsed / 1024 / 1024),
          { type: 'heap_used' }
        );
        observableResult.observe(
          this.customMetrics.get('memory_usage'),
          Math.round(memUsage.rss / 1024 / 1024),
          { type: 'rss' }
        );
      },
      [this.customMetrics.get('memory_usage')]
    );

    this.customMetrics.set('cpu_usage', this.meter.createObservableGauge('cpu_usage_percent', {
      description: 'CPU usage percentage'
    }));

    let previousCpuUsage = process.cpuUsage();
    this.meter.addBatchObservableCallback(
      (observableResult: any) => {
        const currentCpuUsage = process.cpuUsage(previousCpuUsage);
        const totalUsage = (currentCpuUsage.user + currentCpuUsage.system) / 1000000;
        observableResult.observe(
          this.customMetrics.get('cpu_usage'),
          Math.round(totalUsage * 100) / 100
        );
        previousCpuUsage = process.cpuUsage();
      },
      [this.customMetrics.get('cpu_usage')]
    );
  }

  startSpan(name: string, attributes?: Record<string, any>): any {
    if (!this.tracer) {
      throw new Error('Telemetry not initialized');
    }

    return this.tracer.startSpan(name, {
      attributes: {
        'span.type': 'custom',
        ...attributes
      }
    });
  }

  async withSpan<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, any>
  ): Promise<T> {
    const span = this.startSpan(name, attributes);

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        fn
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
    }
  }

  recordMetric(
    metricName: string,
    value: number,
    attributes?: Record<string, any>
  ): void {
    const metric = this.customMetrics.get(metricName);
    
    if (!metric) {
      console.warn(`Metric ${metricName} not found`);
      return;
    }

    if (metric.add) {
      metric.add(value, attributes);
    } else if (metric.record) {
      metric.record(value, attributes);
    }
  }

  incrementCounter(
    counterName: string,
    value: number = 1,
    attributes?: Record<string, any>
  ): void {
    const counter = this.customMetrics.get(counterName);
    
    if (!counter || !counter.add) {
      console.warn(`Counter ${counterName} not found`);
      return;
    }

    counter.add(value, attributes);
  }

  recordHistogram(
    histogramName: string,
    value: number,
    attributes?: Record<string, any>
  ): void {
    const histogram = this.customMetrics.get(histogramName);
    
    if (!histogram || !histogram.record) {
      console.warn(`Histogram ${histogramName} not found`);
      return;
    }

    histogram.record(value, attributes);
  }

  createCustomMetric(
    name: string,
    type: 'counter' | 'histogram' | 'gauge' | 'updown',
    description: string,
    unit?: string
  ): void {
    let metric;

    switch (type) {
      case 'counter':
        metric = this.meter.createCounter(name, { description, unit });
        break;
      case 'histogram':
        metric = this.meter.createHistogram(name, { description, unit });
        break;
      case 'gauge':
        metric = this.meter.createObservableGauge(name, { description, unit });
        break;
      case 'updown':
        metric = this.meter.createUpDownCounter(name, { description, unit });
        break;
    }

    this.customMetrics.set(name, metric);
  }

  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.isInitialized = false;
      console.log('OpenTelemetry shut down successfully');
    }
  }

  getTracer(): any {
    return this.tracer;
  }

  getMeter(): any {
    return this.meter;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export class TelemetryMiddleware {
  private telemetry: TelemetryService;

  constructor(telemetry: TelemetryService) {
    this.telemetry = telemetry;
  }

  express() {
    return async (req: any, res: any, next: any) => {
      const startTime = Date.now();
      const span = this.telemetry.startSpan(`HTTP ${req.method} ${req.path}`, {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.host': req.hostname,
        'http.scheme': req.protocol,
        'http.user_agent': req.get('user-agent'),
        'net.peer.ip': req.ip
      });

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response_content_length': res.get('content-length') || 0
        });

        if (res.statusCode >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${res.statusCode}`
          });
          this.telemetry.incrementCounter('error_count', 1, {
            method: req.method,
            path: req.path,
            status: res.statusCode
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        this.telemetry.recordHistogram('request_duration', duration, {
          method: req.method,
          path: req.path,
          status: res.statusCode
        });

        this.telemetry.incrementCounter('request_count', 1, {
          method: req.method,
          path: req.path,
          status: res.statusCode
        });

        span.end();
      });

      context.with(trace.setSpan(context.active(), span), () => {
        next();
      });
    };
  }
}

let globalTelemetry: TelemetryService | null = null;

export function initializeTelemetry(config: TelemetryConfig): Promise<TelemetryService> {
  if (!globalTelemetry) {
    globalTelemetry = new TelemetryService(config);
    return globalTelemetry.initialize().then(() => globalTelemetry!);
  }
  return Promise.resolve(globalTelemetry);
}

export function getTelemetry(): TelemetryService {
  if (!globalTelemetry) {
    throw new Error('Telemetry not initialized. Call initializeTelemetry first.');
  }
  return globalTelemetry;
}

export default TelemetryService;