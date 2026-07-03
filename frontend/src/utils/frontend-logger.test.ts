import frontendLogger from './frontend-logger';

// Mock fetch globally
global.fetch = jest.fn();

// Mock window and navigator only if they don't exist
if (typeof window === 'undefined') {
    Object.defineProperty(global, 'window', {
        value: {
            location: { href: 'http://localhost:3000' },
            addEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
    });
}

if (typeof navigator === 'undefined') {
    Object.defineProperty(global, 'navigator', {
        value: {
            userAgent: 'Jest Test Agent',
        },
        writable: true,
        configurable: true,
    });
}

// The logger is DISABLED by default (NEXT_PUBLIC_FRONTEND_LOG is unset in tests). The
// contract we care about is the leak-prevention one: it must never monkey-patch console
// and never fire a fetch per log call.
describe('FrontendLogger (inert by default)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    });

    afterEach(() => {
        frontendLogger.restore();
    });

    it('creates singleton instance', () => {
        expect(frontendLogger).toBeDefined();
    });

    it('never monkey-patches console (the per-log fetch storm is gone)', () => {
        const originalLog = console.log;
        const originalError = console.error;
        frontendLogger.initialize();
        expect(console.log).toBe(originalLog);
        expect(console.error).toBe(originalError);
    });

    it('manual log methods never throw and never fetch when disabled', async () => {
        frontendLogger.initialize();
        expect(() => {
            frontendLogger.info('Test info', { key: 'value' });
            frontendLogger.warn('Test warn');
            frontendLogger.error('Test error');
            frontendLogger.debug('Test debug');
        }).not.toThrow();

        await new Promise(resolve => setTimeout(resolve, 50));
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('initialize/restore are safe and idempotent', () => {
        expect(() => {
            frontendLogger.initialize();
            frontendLogger.initialize();
            frontendLogger.restore();
            frontendLogger.restore();
        }).not.toThrow();
    });
});
