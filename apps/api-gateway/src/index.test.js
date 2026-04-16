const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app } = require('./index');

test('API Gateway Unit Tests', async (t) => {
  let server;
  let port;

  t.before(() => {
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  t.after(() => {
    if (server) server.close();
  });

  await t.test('GET /health returns 200', async () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        resolve();
      }).on('error', reject);
    });
  });
});