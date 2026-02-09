const express = require('express');
const axios = require('axios');
const winston = require('winston');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

// Structured JSON logging with Winston
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-gateway' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Prometheus metrics setup
const register = new promClient.Registry();

// Enable default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const upstreamRequestDuration = new promClient.Histogram({
  name: 'upstream_request_duration_seconds',
  help: 'Duration of upstream requests to user-service',
  labelNames: ['method', 'endpoint', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(upstreamRequestDuration);

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    logger.info({
      message: 'HTTP request',
      method: req.method,
      path: req.path,
      route: route,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(3)}s`,
      userAgent: req.get('user-agent'),
      ip: req.ip
    });

    // Record metrics
    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
    httpRequestTotal.labels(req.method, route, res.statusCode).inc();
  });
  
  next();
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error({ message: 'Error generating metrics', error: err.message });
    res.status(500).end();
  }
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
    const start = Date.now();
    await axios.get(`${USER_SERVICE_URL}/health`, { timeout: 2000 });
    const duration = (Date.now() - start) / 1000;
    
    upstreamRequestDuration.labels('GET', '/health', '200').observe(duration);
    
    res.json({ status: 'ready', dependencies: { userService: 'up' } });
  } catch (error) {
    logger.warn({
      message: 'User service health check failed',
      error: error.message,
      url: USER_SERVICE_URL
    });
    
    res.status(503).json({
      status: 'not ready',
      dependencies: { userService: 'down' }
    });
  }
});

// Proxy to User Service
app.get('/api/users', async (req, res) => {
  try {
    const start = Date.now();
    const response = await axios.get(`${USER_SERVICE_URL}/users`);
    const duration = (Date.now() - start) / 1000;
    
    upstreamRequestDuration.labels('GET', '/users', response.status).observe(duration);
    
    res.json(response.data);
  } catch (error) {
    logger.error({
      message: 'Failed to fetch users',
      error: error.message,
      url: `${USER_SERVICE_URL}/users`
    });
    res.status(502).json({ error: 'Failed to fetch users from user-service' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const start = Date.now();
    const response = await axios.get(`${USER_SERVICE_URL}/users/${req.params.id}`);
    const duration = (Date.now() - start) / 1000;
    
    upstreamRequestDuration.labels('GET', '/users/:id', response.status).observe(duration);
    
    res.json(response.data);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'User not found' });
    }
    logger.error({
      message: 'Failed to fetch user',
      error: error.message,
      userId: req.params.id
    });
    res.status(502).json({ error: 'Failed to fetch user from user-service' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const start = Date.now();
    const response = await axios.post(`${USER_SERVICE_URL}/users`, req.body);
    const duration = (Date.now() - start) / 1000;
    
    upstreamRequestDuration.labels('POST', '/users', response.status).observe(duration);
    
    logger.info({
      message: 'User created',
      userId: response.data.id
    });
    
    res.status(201).json(response.data);
  } catch (error) {
    logger.error({
      message: 'Failed to create user',
      error: error.message,
      body: req.body
    });
    res.status(502).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const start = Date.now();
    const response = await axios.delete(`${USER_SERVICE_URL}/users/${req.params.id}`);
    const duration = (Date.now() - start) / 1000;
    
    upstreamRequestDuration.labels('DELETE', '/users/:id', response.status).observe(duration);
    
    logger.info({
      message: 'User deleted',
      userId: req.params.id
    });
    
    res.status(204).send();
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'User not found' });
    }
    logger.error({
      message: 'Failed to delete user',
      error: error.message,
      userId: req.params.id
    });
    res.status(502).json({ error: 'Failed to delete user' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error({
    message: 'Unhandled error',
    error: err.message,
    stack: err.stack
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown implementation
// Handles SIGTERM and SIGINT signals for clean container termination
let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  
  logger.info({ message: 'Graceful shutdown initiated', signal });
  isShuttingDown = true;

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error({ message: 'Error during server shutdown', error: err.message });
      process.exit(1);
    }

    logger.info({ message: 'Server closed successfully' });
    process.exit(0);
  });

  // Force shutdown after 30 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error({ message: 'Forced shutdown after timeout' });
    process.exit(1);
  }, 30000);
};

const server = app.listen(PORT, () => {
  logger.info({
    message: 'API Gateway started',
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    userServiceUrl: USER_SERVICE_URL
  });
});

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error({ message: 'Uncaught exception', error: err.message, stack: err.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ message: 'Unhandled rejection', reason, promise });
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = { app, server };
