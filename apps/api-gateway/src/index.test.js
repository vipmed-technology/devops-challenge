const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./app');

describe('API Gateway', () => {
  it('GET /health should return healthy status', async () => {
    const app = createApp({
      httpClient: {
        get: async () => ({ data: { status: 'ready' } })
      }
    });
    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.status, 'healthy');
    assert.strictEqual(body.service, 'api-gateway');
    server.close();
  });

  it('GET /metrics should return Prometheus metrics', async () => {
    const app = createApp({
      httpClient: {
        get: async () => ({ data: { status: 'ready' } })
      }
    });
    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    const body = await response.text();

    assert.strictEqual(response.status, 200);
    assert.match(body, /http_requests_total|process_cpu_user_seconds_total/);
    server.close();
  });

  it('GET /api/users should proxy to user-service', async () => {
    const app = createApp({
      userServiceUrl: 'http://user-service.test',
      httpClient: {
        get: async () => ({ data: { status: 'ready' } }),
        request: async ({ url, method }) => {
          assert.strictEqual(method, 'get');
          assert.strictEqual(url, 'http://user-service.test/users');
          return { status: 200, data: { data: [{ id: '1', name: 'John' }], total: 1 } };
        }
      }
    });
    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/users`);
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.total, 1);
    server.close();
  });
});
