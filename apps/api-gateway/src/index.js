const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app } = require('./index');

test('User Service', async (t) => {
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

  const makeRequest = (path) => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        });
      }).on('error', reject);
    });
  };

  await t.test('GET /health should return healthy status', async () => {
    const res = await makeRequest('/health');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.service, 'user-service');
  });

  await t.test('GET /users should return user list', async () => {
    const res = await makeRequest('/users');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.data));
  });
});