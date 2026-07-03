interface FrontendLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
  timestamp?: string;
  metadata?: any;
}

/**
 * Frontend logger.
 *
 * IMPORTANT: this used to monkey-patch console.log/info/warn/error/debug and fire ONE
 * fetch() per console call to a backend endpoint. Combined with the app's chatty
 * per-request logging + axios-retry, that turned every page load into an unbounded storm
 * of fetch/Promise/string allocations to a (non-existent) endpoint — ballooning the tab
 * to tens of GB of RAM. It is now:
 *   - OFF by default (enable per deployment via NEXT_PUBLIC_FRONTEND_LOG='true'),
 *   - never patches console.* (no per-log fetch),
 *   - only captures genuine window errors / unhandled rejections,
 *   - queue is CAPPED and flushed in a single batched interval (drops on overflow/failure).
 */
class FrontendLogger {
  private isInitialized = false;
  private readonly enabled: boolean;
  private readonly apiUrl: string;
  private logQueue: FrontendLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_QUEUE = 50;
  private readonly FLUSH_MS = 10000;
  // Bound reference to the real console.error so failure reporting can never re-enter.
  private readonly reportError: typeof console.error;

  constructor() {
    // Disabled unless a deployment explicitly opts in AND a backend log sink exists.
    this.enabled = String(process.env.NEXT_PUBLIC_FRONTEND_LOG || '').toLowerCase() === 'true';
    this.apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    this.reportError = (typeof console !== 'undefined' ? console.error.bind(console) : (() => {})) as typeof console.error;
  }

  initialize() {
    if (this.isInitialized || typeof window === 'undefined' || !this.enabled) return;
    this.isInitialized = true;

    // Capture ONLY real runtime errors — never console.* (patching console + fetching per
    // call is exactly what caused the unbounded allocation storm).
    window.addEventListener('error', (event) => {
      this.enqueue({
        level: 'error',
        message: String(event.message || 'window.error').slice(0, 500),
        source: 'window.error',
        timestamp: new Date().toISOString(),
        metadata: { filename: event.filename, lineno: event.lineno, colno: event.colno }
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      this.enqueue({
        level: 'error',
        message: `Unhandled promise rejection: ${String((event as PromiseRejectionEvent).reason)}`.slice(0, 500),
        source: 'unhandled.rejection',
        timestamp: new Date().toISOString()
      });
    });

    this.flushTimer = setInterval(() => { void this.flush(); }, this.FLUSH_MS);
  }

  private enqueue(entry: FrontendLogEntry) {
    if (!this.enabled) return;
    this.logQueue.push(entry);
    // Hard cap: drop the oldest so the queue can never grow without bound.
    if (this.logQueue.length > this.MAX_QUEUE) {
      this.logQueue = this.logQueue.slice(-this.MAX_QUEUE);
    }
  }

  private async flush() {
    if (!this.enabled || this.logQueue.length === 0 || !this.apiUrl) return;
    const batch = this.logQueue;
    this.logQueue = [];
    try {
      await fetch(`${this.apiUrl}/api/v2/frontend/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: batch })
      });
    } catch (error) {
      // Drop on failure — NEVER re-queue (unbounded re-queue is what let it grow).
      this.reportError('[frontend-logger] flush failed:', error);
    }
  }

  // Manual API — queued + batched, inert when disabled. Kept for existing callers/tests.
  info(message: string, metadata?: any) {
    this.enqueue({ level: 'info', message, source: 'manual', timestamp: new Date().toISOString(), metadata });
  }

  warn(message: string, metadata?: any) {
    this.enqueue({ level: 'warn', message, source: 'manual', timestamp: new Date().toISOString(), metadata });
  }

  error(message: string, metadata?: any) {
    this.enqueue({ level: 'error', message, source: 'manual', timestamp: new Date().toISOString(), metadata });
  }

  debug(message: string, metadata?: any) {
    this.enqueue({ level: 'debug', message, source: 'manual', timestamp: new Date().toISOString(), metadata });
  }

  // Kept for API compatibility. Nothing is patched anymore, so this only stops the flush timer.
  restore() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.isInitialized = false;
  }
}

// Singleton instance
const frontendLogger = new FrontendLogger();

export default frontendLogger;

// Initialize on the client (no-op unless NEXT_PUBLIC_FRONTEND_LOG='true').
if (typeof window !== 'undefined') {
  setTimeout(() => {
    frontendLogger.initialize();
  }, 1000);
}
