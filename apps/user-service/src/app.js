const express = require('express');
const client = require('prom-client');
const logger = require('./logger');

function createApp(store) {
  const app = express();
  const registry = new client.Registry();
  const metricsPrefix = process.env.METRICS_PREFIX || 'user_service_';

  client.collectDefaultMetrics({ register: registry, prefix: metricsPrefix });

  const requestCounter = new client.Counter({
    name: `${metricsPrefix}http_requests_total`,
    help: 'Total HTTP requests handled by the user service',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry]
  });

  const requestDuration = new client.Histogram({
    name: `${metricsPrefix}http_request_duration_seconds`,
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [registry]
  });

  app.use(express.json());

  // Dejamos la observabilidad en el borde del servicio para capturar
  // tanto requests exitosos como errores de validacion o runtime.
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const route = req.route ? req.route.path : req.path;

      requestCounter.inc({
        method: req.method,
        route,
        status_code: String(res.statusCode)
      });

      requestDuration.observe(
        {
          method: req.method,
          route,
          status_code: String(res.statusCode)
        },
        durationSeconds
      );

      logger.info('request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationSeconds
      });
    });

    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', service: 'user-service', timestamp: new Date().toISOString() });
  });

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'alive' });
  });

  // Estar "vivo" no alcanza si Redis esta caido; en ese caso el pod
  // sigue arriba, pero no deberia recibir trafico.
  app.get('/health/ready', async (_req, res) => {
    try {
      await store.ping();
      res.json({ status: 'ready', dependencies: { redis: 'up' } });
    } catch (error) {
      logger.warn('readiness check failed', { error: error.message });
      res.status(503).json({
        status: 'not ready',
        dependencies: { redis: 'down' }
      });
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  app.get('/users', async (_req, res, next) => {
    try {
      const users = await store.listUsers();
      res.json({ data: users, total: users.length });
    } catch (error) {
      next(error);
    }
  });

  app.get('/users/:id', async (req, res, next) => {
    try {
      const user = await store.getUser(req.params.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.post('/users', async (req, res, next) => {
    try {
      const { name, email, role } = req.body;

      if (!name || !email) {
        res.status(400).json({ error: 'Name and email are required' });
        return;
      }

      const user = await store.createUser({ name, email, role });
      if (!user) {
        res.status(409).json({ error: 'Email already exists' });
        return;
      }

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/users/:id', async (req, res, next) => {
    try {
      const deleted = await store.deleteUser(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    logger.error('unhandled user-service error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
