import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
};

const BASE = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  const res = http.get(`${BASE}/api/health`);
  check(res, {
    'status is 200/503': (r) => r.status === 200 || r.status === 503,
  });
  sleep(1);
}

