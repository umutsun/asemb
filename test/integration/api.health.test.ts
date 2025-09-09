import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import request from 'supertest';

describe('API Health (supertest via URL)', () => {
  let proc: ChildProcessWithoutNullStreams | null = null;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

  beforeAll(async () => {
    // Start server only if not CI-managed
    if (!process.env.CI) {
      proc = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['src/index.js'], {
        env: { ...process.env, PORT: '3001', NODE_ENV: 'test' },
        stdio: 'pipe',
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }, 20000);

  afterAll(() => {
    if (proc) {
      proc.kill();
      proc = null;
    }
  });

  it('GET /api/health returns status field', async () => {
    const res = await request(baseUrl).get('/api/health');
    expect([200, 503]).toContain(res.status); // healthy or degraded
    expect(res.body).toHaveProperty('status');
  });
});

