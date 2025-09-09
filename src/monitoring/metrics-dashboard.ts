import { TelemetryService } from './telemetry';

export interface DashboardConfig {
  title: string;
  refreshInterval: number;
  timeRange: string;
  panels: DashboardPanel[];
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'stat' | 'gauge' | 'table' | 'heatmap' | 'logs';
  gridPos: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  datasource: string;
  targets: MetricQuery[];
  thresholds?: Threshold[];
  alert?: AlertRule;
}

export interface MetricQuery {
  expr: string;
  refId: string;
  legendFormat?: string;
  interval?: string;
  step?: number;
}

export interface Threshold {
  value: number;
  color: string;
  label?: string;
}

export interface AlertRule {
  name: string;
  condition: string;
  duration: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  annotations?: Record<string, string>;
}

export class MetricsDashboard {
  private config: DashboardConfig;
  private telemetry: TelemetryService;

  constructor(telemetry: TelemetryService) {
    this.telemetry = telemetry;
    this.config = this.getDefaultConfig();
  }

  private getDefaultConfig(): DashboardConfig {
    return {
      title: 'Alice Semantic Bridge Monitoring',
      refreshInterval: 5000,
      timeRange: '1h',
      panels: [
        {
          id: 'request-rate',
          title: 'Request Rate',
          type: 'graph',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'rate(request_count[5m])',
              refId: 'A',
              legendFormat: '{{method}} {{path}}'
            }
          ],
          thresholds: [
            { value: 100, color: 'green' },
            { value: 500, color: 'yellow' },
            { value: 1000, color: 'red' }
          ]
        },
        {
          id: 'response-time',
          title: 'Response Time (p95)',
          type: 'graph',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'histogram_quantile(0.95, rate(request_duration_ms_bucket[5m]))',
              refId: 'A',
              legendFormat: 'p95'
            },
            {
              expr: 'histogram_quantile(0.99, rate(request_duration_ms_bucket[5m]))',
              refId: 'B',
              legendFormat: 'p99'
            }
          ],
          alert: {
            name: 'High Response Time',
            condition: 'A > 1000',
            duration: '5m',
            severity: 'warning',
            annotations: {
              summary: 'Response time exceeds 1 second',
              description: '95th percentile response time is {{ $value }}ms'
            }
          }
        },
        {
          id: 'error-rate',
          title: 'Error Rate',
          type: 'stat',
          gridPos: { x: 0, y: 8, w: 6, h: 4 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'rate(error_count[5m])',
              refId: 'A'
            }
          ],
          thresholds: [
            { value: 0, color: 'green' },
            { value: 0.01, color: 'yellow' },
            { value: 0.05, color: 'red' }
          ],
          alert: {
            name: 'High Error Rate',
            condition: 'A > 0.05',
            duration: '2m',
            severity: 'error',
            annotations: {
              summary: 'Error rate exceeds 5%'
            }
          }
        },
        {
          id: 'memory-usage',
          title: 'Memory Usage',
          type: 'gauge',
          gridPos: { x: 6, y: 8, w: 6, h: 4 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'memory_usage_mb{type="heap_used"}',
              refId: 'A'
            }
          ],
          thresholds: [
            { value: 0, color: 'green' },
            { value: 512, color: 'yellow' },
            { value: 1024, color: 'red' }
          ]
        },
        {
          id: 'cpu-usage',
          title: 'CPU Usage',
          type: 'gauge',
          gridPos: { x: 12, y: 8, w: 6, h: 4 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'cpu_usage_percent',
              refId: 'A'
            }
          ],
          thresholds: [
            { value: 0, color: 'green' },
            { value: 50, color: 'yellow' },
            { value: 80, color: 'red' }
          ]
        },
        {
          id: 'active-connections',
          title: 'Active Connections',
          type: 'stat',
          gridPos: { x: 18, y: 8, w: 6, h: 4 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'active_connections',
              refId: 'A'
            }
          ]
        },
        {
          id: 'vector-search-latency',
          title: 'Vector Search Latency',
          type: 'heatmap',
          gridPos: { x: 0, y: 12, w: 12, h: 8 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'vector_search_duration_ms_bucket',
              refId: 'A'
            }
          ]
        },
        {
          id: 'rag-quality-scores',
          title: 'RAG Answer Quality',
          type: 'graph',
          gridPos: { x: 12, y: 12, w: 12, h: 8 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'rag_answer_quality_score',
              refId: 'A',
              legendFormat: 'Overall Score'
            },
            {
              expr: 'rag_hallucination_risk',
              refId: 'B',
              legendFormat: 'Hallucination Risk'
            }
          ]
        },
        {
          id: 'database-performance',
          title: 'Database Performance',
          type: 'table',
          gridPos: { x: 0, y: 20, w: 12, h: 6 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'pg_stat_user_tables_n_tup_ins',
              refId: 'A',
              legendFormat: 'Inserts'
            },
            {
              expr: 'pg_stat_user_tables_n_tup_upd',
              refId: 'B',
              legendFormat: 'Updates'
            },
            {
              expr: 'pg_stat_user_tables_n_tup_del',
              refId: 'C',
              legendFormat: 'Deletes'
            }
          ]
        },
        {
          id: 'redis-performance',
          title: 'Redis Cache Performance',
          type: 'graph',
          gridPos: { x: 12, y: 20, w: 12, h: 6 },
          datasource: 'prometheus',
          targets: [
            {
              expr: 'redis_commands_processed_total',
              refId: 'A',
              legendFormat: 'Commands/sec'
            },
            {
              expr: 'redis_cache_hit_ratio',
              refId: 'B',
              legendFormat: 'Hit Ratio'
            }
          ]
        },
        {
          id: 'system-logs',
          title: 'Recent Logs',
          type: 'logs',
          gridPos: { x: 0, y: 26, w: 24, h: 8 },
          datasource: 'loki',
          targets: [
            {
              expr: '{service="alice-semantic-bridge"} |= "error"',
              refId: 'A'
            }
          ]
        }
      ]
    };
  }

  exportGrafanaJSON(): string {
    const grafanaConfig = {
      dashboard: {
        id: null,
        uid: 'alice-semantic-bridge',
        title: this.config.title,
        tags: ['alice-semantic-bridge', 'monitoring', 'rag'],
        timezone: 'browser',
        schemaVersion: 30,
        version: 1,
        refresh: `${this.config.refreshInterval / 1000}s`,
        time: {
          from: `now-${this.config.timeRange}`,
          to: 'now'
        },
        panels: this.config.panels.map((panel, index) => ({
          id: index + 1,
          title: panel.title,
          type: this.mapPanelType(panel.type),
          datasource: {
            type: 'prometheus',
            uid: panel.datasource
          },
          gridPos: panel.gridPos,
          targets: panel.targets.map(target => ({
            ...target,
            datasource: {
              type: 'prometheus',
              uid: panel.datasource
            }
          })),
          options: this.getPanelOptions(panel),
          fieldConfig: this.getFieldConfig(panel)
        }))
      }
    };

    return JSON.stringify(grafanaConfig, null, 2);
  }

  private mapPanelType(type: string): string {
    const typeMap: Record<string, string> = {
      'graph': 'timeseries',
      'stat': 'stat',
      'gauge': 'gauge',
      'table': 'table',
      'heatmap': 'heatmap',
      'logs': 'logs'
    };
    return typeMap[type] || 'graph';
  }

  private getPanelOptions(panel: DashboardPanel): any {
    const baseOptions: any = {
      legend: {
        displayMode: 'list',
        placement: 'bottom'
      },
      tooltip: {
        mode: 'single',
        sort: 'none'
      }
    };

    switch (panel.type) {
      case 'stat':
        return {
          ...baseOptions,
          reduceOptions: {
            values: false,
            calcs: ['lastNotNull'],
            fields: ''
          },
          orientation: 'auto',
          textMode: 'auto',
          colorMode: 'value',
          graphMode: 'area',
          justifyMode: 'auto'
        };

      case 'gauge':
        return {
          ...baseOptions,
          reduceOptions: {
            values: false,
            calcs: ['lastNotNull'],
            fields: ''
          },
          orientation: 'auto',
          showThresholdLabels: false,
          showThresholdMarkers: true
        };

      case 'table':
        return {
          showHeader: true,
          sortBy: []
        };

      case 'heatmap':
        return {
          calculate: true,
          calculation: {
            xBuckets: {
              mode: 'count',
              value: '50'
            },
            yBuckets: {
              mode: 'count'
            }
          },
          color: {
            mode: 'spectrum',
            scheme: 'Spectral',
            steps: 128
          },
          yAxis: {
            axisPlacement: 'left'
          }
        };

      default:
        return baseOptions;
    }
  }

  private getFieldConfig(panel: DashboardPanel): any {
    const fieldConfig: any = {
      defaults: {
        mappings: [],
        color: {
          mode: 'palette-classic'
        },
        custom: {
          axisLabel: '',
          axisPlacement: 'auto',
          barAlignment: 0,
          drawStyle: 'line',
          fillOpacity: 10,
          gradientMode: 'none',
          hideFrom: {
            tooltip: false,
            viz: false,
            legend: false
          },
          lineInterpolation: 'linear',
          lineWidth: 1,
          pointSize: 5,
          scaleDistribution: {
            type: 'linear'
          },
          showPoints: 'never',
          spanNulls: true
        }
      },
      overrides: []
    };

    if (panel.thresholds) {
      fieldConfig.defaults.thresholds = {
        mode: 'absolute',
        steps: panel.thresholds.map(t => ({
          color: t.color,
          value: t.value
        }))
      };
    }

    if (panel.type === 'gauge') {
      fieldConfig.defaults.min = 0;
      fieldConfig.defaults.max = panel.thresholds 
        ? Math.max(...panel.thresholds.map(t => t.value)) * 1.2
        : 100;
    }

    return fieldConfig;
  }

  createCustomPanel(panel: DashboardPanel): void {
    this.config.panels.push(panel);
  }

  updatePanel(panelId: string, updates: Partial<DashboardPanel>): void {
    const index = this.config.panels.findIndex(p => p.id === panelId);
    if (index !== -1) {
      this.config.panels[index] = {
        ...this.config.panels[index],
        ...updates
      };
    }
  }

  removePanel(panelId: string): void {
    this.config.panels = this.config.panels.filter(p => p.id !== panelId);
  }

  getConfig(): DashboardConfig {
    return this.config;
  }

  setConfig(config: DashboardConfig): void {
    this.config = config;
  }

  async collectMetrics(): Promise<Record<string, any>> {
    const metrics: Record<string, any> = {};

    for (const panel of this.config.panels) {
      if (panel.type === 'logs') continue;

      for (const target of panel.targets) {
        const metricName = target.expr.split(/[\(\[]/)[0];
        metrics[`${panel.id}_${target.refId}`] = {
          panel: panel.title,
          query: target.expr,
          value: Math.random() * 100
        };
      }
    }

    return metrics;
  }
}

export function createGrafanaDashboard(telemetry: TelemetryService): string {
  const dashboard = new MetricsDashboard(telemetry);
  return dashboard.exportGrafanaJSON();
}

export default MetricsDashboard;