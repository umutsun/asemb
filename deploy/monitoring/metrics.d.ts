export declare class PerformanceMetrics {
    private static metrics;
    static track(operation: string, duration: number): void;
    static getStats(operation: string): {
        count: number;
        avg: number;
        p50: number;
        p95: number;
    };
}
