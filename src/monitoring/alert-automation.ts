import { EventEmitter } from 'events';
import { TelemetryService } from './telemetry';
import { StructuredLogger } from './structured-logger';

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  actions: AlertAction[];
  throttle?: ThrottleConfig;
  schedule?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface AlertCondition {
  type: 'threshold' | 'rate' | 'anomaly' | 'composite' | 'absence';
  metric?: string;
  query?: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'contains' | 'regex';
  value: number | string;
  duration?: string;
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'p95' | 'p99';
  window?: string;
  filters?: Record<string, any>;
}

export interface AlertAction {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty' | 'log' | 'custom';
  config: Record<string, any>;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

export interface ThrottleConfig {
  interval: string;
  maxAlerts: number;
}

export interface AlertState {
  ruleId: string;
  status: 'ok' | 'pending' | 'firing' | 'resolved';
  lastChecked: Date;
  lastFired?: Date;
  lastResolved?: Date;
  currentValue?: any;
  firedCount: number;
  context?: Record<string, any>;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  status: 'firing' | 'resolved';
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  value: any;
  message: string;
  context?: Record<string, any>;
  actions?: string[];
}

export class AlertManager extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private states: Map<string, AlertState> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private telemetry: TelemetryService;
  private logger: StructuredLogger;
  private actionHandlers: Map<string, (action: AlertAction, event: AlertEvent) => Promise<void>> = new Map();

  constructor(telemetry: TelemetryService, logger: StructuredLogger) {
    super();
    this.telemetry = telemetry;
    this.logger = logger;
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.actionHandlers.set('log', async (action, event) => {
      const level = action.severity || 'info';
      this.logger[level](`Alert: ${event.ruleName}`, {
        component: 'alerts',
        metadata: {
          alertId: event.id,
          ruleId: event.ruleId,
          status: event.status,
          value: event.value,
          ...event.context
        }
      });
    });

    this.actionHandlers.set('webhook', async (action, event) => {
      const { url, headers, method = 'POST' } = action.config;
      
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify({
            alert: event,
            timestamp: new Date().toISOString()
          })
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }

        this.logger.info('Alert webhook sent', {
          component: 'alerts',
          metadata: { alertId: event.id, url, status: response.status }
        });
      } catch (error) {
        this.logger.error('Alert webhook failed', error as Error, {
          component: 'alerts',
          metadata: { alertId: event.id, url }
        });
      }
    });

    this.actionHandlers.set('slack', async (action, event) => {
      const { webhookUrl, channel, username = 'Alert Bot' } = action.config;
      
      const color = {
        info: '#36a64f',
        warning: '#ff9900',
        error: '#ff0000',
        critical: '#990000'
      }[event.severity];

      const payload = {
        channel,
        username,
        attachments: [{
          color,
          title: event.ruleName,
          text: event.message,
          fields: [
            { title: 'Status', value: event.status, short: true },
            { title: 'Severity', value: event.severity, short: true },
            { title: 'Value', value: String(event.value), short: true },
            { title: 'Time', value: event.timestamp.toISOString(), short: true }
          ],
          footer: 'Alice Semantic Bridge',
          ts: Math.floor(event.timestamp.getTime() / 1000)
        }]
      };

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Slack webhook failed: ${response.status}`);
        }

        this.logger.info('Slack alert sent', {
          component: 'alerts',
          metadata: { alertId: event.id, channel }
        });
      } catch (error) {
        this.logger.error('Slack alert failed', error as Error, {
          component: 'alerts',
          metadata: { alertId: event.id }
        });
      }
    });
  }

  registerActionHandler(
    type: string,
    handler: (action: AlertAction, event: AlertEvent) => Promise<void>
  ): void {
    this.actionHandlers.set(type, handler);
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.states.set(rule.id, {
      ruleId: rule.id,
      status: 'ok',
      lastChecked: new Date(),
      firedCount: 0
    });

    if (rule.enabled) {
      this.startMonitoring(rule);
    }

    this.logger.info('Alert rule added', {
      component: 'alerts',
      metadata: { ruleId: rule.id, ruleName: rule.name }
    });
  }

  removeRule(ruleId: string): void {
    this.stopMonitoring(ruleId);
    this.rules.delete(ruleId);
    this.states.delete(ruleId);

    this.logger.info('Alert rule removed', {
      component: 'alerts',
      metadata: { ruleId }
    });
  }

  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    const wasEnabled = rule.enabled;
    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);

    if (wasEnabled && !updatedRule.enabled) {
      this.stopMonitoring(ruleId);
    } else if (!wasEnabled && updatedRule.enabled) {
      this.startMonitoring(updatedRule);
    } else if (updatedRule.enabled) {
      this.stopMonitoring(ruleId);
      this.startMonitoring(updatedRule);
    }

    this.logger.info('Alert rule updated', {
      component: 'alerts',
      metadata: { ruleId, updates }
    });
  }

  private startMonitoring(rule: AlertRule): void {
    const checkInterval = this.parseInterval(rule.schedule || '1m');
    
    const interval = setInterval(() => {
      this.checkRule(rule);
    }, checkInterval);

    this.intervals.set(rule.id, interval);

    this.checkRule(rule);
  }

  private stopMonitoring(ruleId: string): void {
    const interval = this.intervals.get(ruleId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(ruleId);
    }
  }

  private async checkRule(rule: AlertRule): Promise<void> {
    const state = this.states.get(rule.id);
    if (!state) return;

    try {
      const value = await this.evaluateCondition(rule.condition);
      const shouldFire = this.shouldTriggerAlert(rule.condition, value);

      state.lastChecked = new Date();
      state.currentValue = value;

      if (shouldFire && state.status !== 'firing') {
        if (this.shouldThrottle(rule, state)) {
          this.logger.debug('Alert throttled', {
            component: 'alerts',
            metadata: { ruleId: rule.id, ruleName: rule.name }
          });
          return;
        }

        state.status = 'firing';
        state.lastFired = new Date();
        state.firedCount++;

        const event = this.createAlertEvent(rule, state, 'firing', value);
        await this.fireAlert(rule, event);

      } else if (!shouldFire && state.status === 'firing') {
        state.status = 'resolved';
        state.lastResolved = new Date();

        const event = this.createAlertEvent(rule, state, 'resolved', value);
        await this.fireAlert(rule, event);

      } else if (!shouldFire) {
        state.status = 'ok';
      }

      this.telemetry.recordMetric('alert_checks', 1, {
        ruleId: rule.id,
        status: state.status
      });

    } catch (error) {
      this.logger.error('Alert check failed', error as Error, {
        component: 'alerts',
        metadata: { ruleId: rule.id, ruleName: rule.name }
      });
    }
  }

  private async evaluateCondition(condition: AlertCondition): Promise<any> {
    switch (condition.type) {
      case 'threshold':
        return this.evaluateThreshold(condition);
      
      case 'rate':
        return this.evaluateRate(condition);
      
      case 'anomaly':
        return this.evaluateAnomaly(condition);
      
      case 'composite':
        return this.evaluateComposite(condition);
      
      case 'absence':
        return this.evaluateAbsence(condition);
      
      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
  }

  private async evaluateThreshold(condition: AlertCondition): Promise<number> {
    return Math.random() * 100;
  }

  private async evaluateRate(condition: AlertCondition): Promise<number> {
    return Math.random() * 10;
  }

  private async evaluateAnomaly(condition: AlertCondition): Promise<number> {
    return Math.random() > 0.9 ? 1 : 0;
  }

  private async evaluateComposite(condition: AlertCondition): Promise<boolean> {
    return Math.random() > 0.5;
  }

  private async evaluateAbsence(condition: AlertCondition): Promise<boolean> {
    return Math.random() > 0.95;
  }

  private shouldTriggerAlert(condition: AlertCondition, value: any): boolean {
    const threshold = condition.value;

    switch (condition.operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      case '==':
        return value === threshold;
      case '!=':
        return value !== threshold;
      case 'contains':
        return String(value).includes(String(threshold));
      case 'regex':
        return new RegExp(String(threshold)).test(String(value));
      default:
        return false;
    }
  }

  private shouldThrottle(rule: AlertRule, state: AlertState): boolean {
    if (!rule.throttle) return false;

    const { interval, maxAlerts } = rule.throttle;
    const intervalMs = this.parseInterval(interval);
    const now = Date.now();

    if (state.lastFired) {
      const timeSinceLastFired = now - state.lastFired.getTime();
      if (timeSinceLastFired < intervalMs) {
        return true;
      }
    }

    const recentAlerts = state.firedCount;
    return recentAlerts >= maxAlerts;
  }

  private createAlertEvent(
    rule: AlertRule,
    state: AlertState,
    status: 'firing' | 'resolved',
    value: any
  ): AlertEvent {
    const severity = this.determineSeverity(rule, value);
    
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      status,
      severity,
      timestamp: new Date(),
      value,
      message: this.formatAlertMessage(rule, status, value),
      context: {
        ...rule.metadata,
        ...state.context
      }
    };
  }

  private determineSeverity(rule: AlertRule, value: any): 'info' | 'warning' | 'error' | 'critical' {
    const defaultSeverity = rule.actions[0]?.severity || 'warning';
    
    if (typeof value === 'number') {
      const threshold = Number(rule.condition.value);
      const ratio = value / threshold;
      
      if (ratio > 2) return 'critical';
      if (ratio > 1.5) return 'error';
      if (ratio > 1) return 'warning';
    }

    return defaultSeverity;
  }

  private formatAlertMessage(rule: AlertRule, status: string, value: any): string {
    const verb = status === 'firing' ? 'triggered' : 'resolved';
    return `Alert ${verb}: ${rule.name}. Current value: ${value} ${rule.condition.operator} ${rule.condition.value}`;
  }

  private async fireAlert(rule: AlertRule, event: AlertEvent): Promise<void> {
    this.emit('alert', event);

    for (const action of rule.actions) {
      const handler = this.actionHandlers.get(action.type);
      
      if (handler) {
        try {
          await handler(action, event);
        } catch (error) {
          this.logger.error(`Alert action failed: ${action.type}`, error as Error, {
            component: 'alerts',
            metadata: { alertId: event.id, actionType: action.type }
          });
        }
      }
    }

    this.telemetry.recordMetric('alerts_fired', 1, {
      ruleId: rule.id,
      severity: event.severity,
      status: event.status
    });
  }

  private parseInterval(interval: string): number {
    const units: Record<string, number> = {
      's': 1000,
      'm': 60000,
      'h': 3600000,
      'd': 86400000
    };

    const match = interval.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 60000;
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  getState(ruleId: string): AlertState | undefined {
    return this.states.get(ruleId);
  }

  getAllStates(): Map<string, AlertState> {
    return new Map(this.states);
  }

  async testRule(ruleId: string): Promise<AlertEvent | null> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    const state = this.states.get(ruleId) || {
      ruleId,
      status: 'ok',
      lastChecked: new Date(),
      firedCount: 0
    };

    const value = await this.evaluateCondition(rule.condition);
    const event = this.createAlertEvent(rule, state, 'firing', value);

    this.logger.info('Alert rule tested', {
      component: 'alerts',
      metadata: { ruleId, result: event }
    });

    return event;
  }

  stop(): void {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    this.removeAllListeners();

    this.logger.info('Alert manager stopped', {
      component: 'alerts'
    });
  }
}

export function createDefaultAlertRules(): AlertRule[] {
  return [
    {
      id: 'high-error-rate',
      name: 'High Error Rate',
      enabled: true,
      condition: {
        type: 'rate',
        metric: 'error_count',
        operator: '>',
        value: 0.05,
        duration: '5m',
        aggregation: 'avg'
      },
      actions: [
        {
          type: 'log',
          config: {},
          severity: 'error'
        },
        {
          type: 'slack',
          config: {
            channel: '#alerts'
          },
          severity: 'error'
        }
      ],
      throttle: {
        interval: '5m',
        maxAlerts: 3
      }
    },
    {
      id: 'high-response-time',
      name: 'High Response Time',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'request_duration_ms',
        operator: '>',
        value: 1000,
        duration: '2m',
        aggregation: 'p95'
      },
      actions: [
        {
          type: 'log',
          config: {},
          severity: 'warning'
        }
      ],
      throttle: {
        interval: '10m',
        maxAlerts: 5
      }
    },
    {
      id: 'memory-usage',
      name: 'High Memory Usage',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'memory_usage_mb',
        operator: '>',
        value: 1024,
        duration: '5m',
        aggregation: 'avg'
      },
      actions: [
        {
          type: 'log',
          config: {},
          severity: 'warning'
        }
      ]
    },
    {
      id: 'database-slow-query',
      name: 'Database Slow Query',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'db.duration_ms',
        operator: '>',
        value: 500,
        aggregation: 'max'
      },
      actions: [
        {
          type: 'log',
          config: {},
          severity: 'warning'
        }
      ]
    },
    {
      id: 'hallucination-detected',
      name: 'RAG Hallucination Detected',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'rag_hallucination_risk',
        operator: '>',
        value: 0.7,
        aggregation: 'max'
      },
      actions: [
        {
          type: 'log',
          config: {},
          severity: 'error'
        },
        {
          type: 'webhook',
          config: {
            url: 'http://localhost:3000/alerts/hallucination'
          },
          severity: 'error'
        }
      ]
    }
  ];
}

export default AlertManager;