import { AsembError, ErrorCode, ErrorHandler } from '../../src/errors/AsembError';

jest.setTimeout(10000);

describe('ErrorHandler', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries on retryable error and eventually succeeds', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 3) {
        throw new AsembError(ErrorCode.SERVICE_UNAVAILABLE, 'temporary');
      }
      return 'ok';
    });

    await expect(ErrorHandler.withRetry(fn, { maxAttempts: 5, backoffMs: 5, exponential: false })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('stops retrying on non-retryable error', async () => {
    const err = new AsembError(ErrorCode.INVALID_INPUT, 'bad');
    const fn = jest.fn(async () => { throw err; });
    await expect(ErrorHandler.withRetry(fn, { maxAttempts: 3, backoffMs: 10 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
