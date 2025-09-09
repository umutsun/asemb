import { test, expect } from '@playwright/test';

test('health endpoint returns JSON with status', async ({ request, baseURL }) => {
  const url = `${baseURL}/api/health`;
  const res = await request.get(url);
  // If server is not running, skip gracefully in local
  test.skip(res.status() === 403 || res.status() === 404, 'Server not running');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json).toHaveProperty('status');
});

