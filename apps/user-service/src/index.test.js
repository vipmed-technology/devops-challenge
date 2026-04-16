const express = require('express');
const Redis = require('ioredis');
const pino = require('pino');
const pinoHttp = require('pino-http');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Structured Logging
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Redis Connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true // Important for tests!
});

app.use(pinoHttp({ logger }));
app.use(express.json());

// 2. Metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Health checks
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'user-service' }));
app.get('/health/ready', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ready', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'down' });
  }
});

// Dummy Users Route
app.get('/users', (req, res) => {
  res.json({ data: [{ id: 1, name: 'John Doe' }] });
});

// 3. Graceful Shutdown
let server;
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Cleaning up...`);
  if (server) server.close();
  await redis.quit();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 4. THE FIX FOR CI/CD: Only start if not imported by tests
if (require.main === module) {
  redis.connect().catch(() => logger.warn('Redis not available at startup'));
  server = app.listen(PORT, () => {
    logger.info(`User Service started on port ${PORT}`);
  });
}

module.exports = { app };