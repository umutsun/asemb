const request = require('supertest');
const { app } = require('../../src/index'); // Assuming the express app is exported from src/index.js

describe('POST /api/lightrag/graph', () => {
  it('should return 400 if documents array is invalid', async () => {
    const res = await request(app)
      .post('/api/lightrag/graph')
      .send({ documents: 'invalid' });
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Invalid documents array');
  });
});
