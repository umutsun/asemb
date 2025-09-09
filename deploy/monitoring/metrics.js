"use strict";
// src/monitoring/metrics.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMetrics = void 0;
function average(arr) {
    if (arr.length === 0)
        return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
}
function percentile(arr, p) {
    if (arr.length === 0)
        return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
        return sorted[lower];
    }
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
class PerformanceMetrics {
    static track(operation, duration) {
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, []);
        }
        this.metrics.get(operation).push(duration);
    }
    static getStats(operation) {
        const durations = this.metrics.get(operation) || [];
        return {
            count: durations.length,
            avg: average(durations),
            p50: percentile(durations, 50),
            p95: percentile(durations, 95)
        };
    }
}
exports.PerformanceMetrics = PerformanceMetrics;
PerformanceMetrics.metrics = new Map();
