const express = require('express');
const axios = require('axios');
const pino = require('pino');
const pinoHttp = require('pino-http');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

// 1. Structured Logging (Pino)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
});

app.use(pinoHttp({ logger }));
app.use(express.json());

// 2. Metrics (Prometheus)
const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api-gateway', timestamp: new Date().toISOString() });
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
});

app.get('/health/ready', async (req, res) => {
  try {
    await axios.get(`${USER_SERVICE_URL}/health`, { timeout: 2000 });
    res.json({ status: 'ready', dependencies: { userService: 'up' } });
  } catch (error) {
    logger.error({ err: error.message }, 'Readiness check failed');
    res.status(503).json({ status: 'not ready', dependencies: { userService: 'down' } });
  }
});

// Routes
app.get('/api/users', async (req, res) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/users`);
    res.json(response.data);
  } catch (error) {
    logger.error(error.message);
    res.status(502).json({ error: 'Failed to fetch users' });
  }
});

// 404 & Error handlers
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// 3. Graceful Shutdown
let server;
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Closing HTTP server...`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed. Exiting.');
      process.exit(0);
    });
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 4. THE FIX FOR CI/CD: Only start if not imported by tests
if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info(`API Gateway started on port ${PORT}`);
  });
}

module.exports = { app };