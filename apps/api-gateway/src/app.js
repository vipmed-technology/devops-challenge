const express = require('express');
const axios = require('axios');
const client = require('prom-client');
const logger = require('./logger');

function createApp(options = {}) {
  const app = express();
  const userServiceUrl = options.userServiceUrl || process.env.USER_SERVICE_URL || 'http://localhost:3001';
  const httpClient = options.httpClient || axios.create({ timeout: 3000 });
  const registry = new client.Registry();
  const metricsPrefix = process.env.METRICS_PREFIX || 'api_gateway_';

  client.collectDefaultMetrics({ register: registry, prefix: metricsPrefix });

  const requestCounter = new client.Counter({
    name: `${metricsPrefix}http_requests_total`,
    help: 'Total HTTP requests handled by the API gateway',
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

  // Tomamos la métrica al cierre de la respuesta para registrar el status final
  // y el tiempo real que terminó viendo el cliente.
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
    res.json({ status: 'healthy', service: 'api-gateway', timestamp: new Date().toISOString() });
  });

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'alive' });
  });

  // Si el user-service no responde bien, preferimos marcar este pod como
  // no listo para que Kubernetes deje de mandarle tráfico.
  app.get('/health/ready', async (_req, res) => {
    try {
      await httpClient.get(`${userServiceUrl}/health/ready`);
      res.json({ status: 'ready', dependencies: { userService: 'up' } });
    } catch (error) {
      logger.warn('readiness check failed', { error: error.message });
      res.status(503).json({
        status: 'not ready',
        dependencies: { userService: 'down' }
      });
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  // Centralizar el proxy nos evita repetir el mismo manejo de errores
  // y mantiene consistente la respuesta hacia el cliente.
  async function proxyRequest(req, res, method, path, successStatus) {
    try {
      const response = await httpClient.request({
        url: `${userServiceUrl}${path}`,
        method,
        data: req.body
      });
      res.status(successStatus || response.status).json(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (error.response?.status === 400 || error.response?.status === 409) {
        res.status(error.response.status).json(error.response.data);
        return;
      }

      logger.error('proxy request failed', {
        method,
        path,
        error: error.message
      });
      res.status(502).json({ error: 'Failed to process request through user-service' });
    }
  }

  app.get('/api/users', (req, res) => proxyRequest(req, res, 'get', '/users'));
  app.get('/api/users/:id', (req, res) => proxyRequest(req, res, 'get', `/users/${req.params.id}`));
  app.post('/api/users', (req, res) => proxyRequest(req, res, 'post', '/users', 201));
  app.delete('/api/users/:id', async (req, res) => {
    try {
      await httpClient.delete(`${userServiceUrl}/users/${req.params.id}`);
      res.status(204).send();
    } catch (error) {
      if (error.response?.status === 404) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      logger.error('proxy delete failed', {
        path: `/users/${req.params.id}`,
        error: error.message
      });
      res.status(502).json({ error: 'Failed to delete user' });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    logger.error('unhandled api-gateway error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
