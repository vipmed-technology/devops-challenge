const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./app');
const { createMemoryStore } = require('./store');

describe('User Service', () => {
  it('should export express app', () => {
    const app = createApp(createMemoryStore());
    assert.ok(app);
    assert.strictEqual(typeof app.listen, 'function');
  });

  it('should have health endpoints registered', () => {
    const app = createApp(createMemoryStore());
    const routes = app._router.stack
      .filter((r) => r.route)
      .map((r) => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));

    assert.ok(routes.find((r) => r.path === '/health'));
    assert.ok(routes.find((r) => r.path === '/health/live'));
    assert.ok(routes.find((r) => r.path === '/health/ready'));
    assert.ok(routes.find((r) => r.path === '/metrics'));
  });

  it('should have CRUD endpoints for users', () => {
    const app = createApp(createMemoryStore());
    const routes = app._router.stack
      .filter((r) => r.route)
      .map((r) => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));

    assert.ok(routes.find((r) => r.path === '/users' && r.methods.includes('get')));
    assert.ok(routes.find((r) => r.path === '/users' && r.methods.includes('post')));
    assert.ok(routes.find((r) => r.path === '/users/:id' && r.methods.includes('delete')));
  });

  it('should create a user', async () => {
    const app = createApp(createMemoryStore());
    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        role: 'admin'
      })
    });
    const body = await response.json();

    assert.strictEqual(response.status, 201);
    assert.strictEqual(body.email, 'grace@example.com');
    server.close();
  });
});
