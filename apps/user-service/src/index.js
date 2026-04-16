const express = require('express');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3001;

// Structured JSON logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-service' },
  transports: [new winston.transports.Console()],
});

// Prometheus metrics
const register = promClient.register;
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const redisConnectionStatus = new promClient.Gauge({
  name: 'redis_connection_status',
  help: 'Redis connection status (1 = connected, 0 = disconnected)',
});

// Redis connection
const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  lazyConnect: true
};

if (process.env.REDIS_PASSWORD) {
  redisOptions.password = process.env.REDIS_PASSWORD;
}

const redis = new Redis(redisOptions);

redis.on('connect', () => {
  logger.info('Connected to Redis');
  redisConnectionStatus.set(1);
});
redis.on('error', (err) => {
  logger.error('Redis error', { error: err.message });
  redisConnectionStatus.set(0);
});
redis.on('close', () => redisConnectionStatus.set(0));

app.use(express.json());

// Request logging + metrics middleware
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestDuration.observe(labels, durationMs / 1000);
    httpRequestsTotal.inc(labels);
    logger.info('request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
    });
  });
  next();
});

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'user-service', timestamp: new Date().toISOString() });
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
});

app.get('/health/ready', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ready', dependencies: { redis: 'up' } });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      dependencies: { redis: 'down' }
    });
  }
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const USERS_KEY = 'users';

// Initialize sample data
const initializeData = async () => {
  try {
    await redis.connect();
    const exists = await redis.exists(USERS_KEY);
    if (!exists) {
      const sampleUsers = [
        { id: uuidv4(), name: 'John Doe', email: 'john@example.com', role: 'admin', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'Jane Smith', email: 'jane@example.com', role: 'user', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'Bob Wilson', email: 'bob@example.com', role: 'user', createdAt: new Date().toISOString() }
      ];
      await redis.set(USERS_KEY, JSON.stringify(sampleUsers));
      logger.info('Sample data initialized');
    }
  } catch (error) {
    logger.warn('Could not initialize Redis data', { error: error.message });
  }
};

// Get all users
app.get('/users', async (req, res) => {
  try {
    const data = await redis.get(USERS_KEY);
    const users = data ? JSON.parse(data) : [];
    res.json({ data: users, total: users.length });
  } catch (error) {
    logger.error('Failed to get users', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const data = await redis.get(USERS_KEY);
    const users = data ? JSON.parse(data) : [];
    const user = users.find(u => u.id === req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Failed to get user', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Create user
app.post('/users', async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const data = await redis.get(USERS_KEY);
    const users = data ? JSON.parse(data) : [];

    // Check for duplicate email
    if (users.find(u => u.email === email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const newUser = {
      id: uuidv4(),
      name,
      email,
      role: role || 'user',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await redis.set(USERS_KEY, JSON.stringify(users));

    logger.info('User created', { userId: newUser.id });
    res.status(201).json(newUser);
  } catch (error) {
    logger.error('Failed to create user', { error: error.message });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Delete user
app.delete('/users/:id', async (req, res) => {
  try {
    const data = await redis.get(USERS_KEY);
    const users = data ? JSON.parse(data) : [];
    const index = users.findIndex(u => u.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users.splice(index, 1);
    await redis.set(USERS_KEY, JSON.stringify(users));

    logger.info('User deleted', { userId: req.params.id });
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete user', { error: error.message });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

const start = async () => {
  await initializeData();
  const server = app.listen(PORT, () => {
    logger.info(`User Service started on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await redis.quit();
        logger.info('Redis connection closed');
      } catch (err) {
        logger.error('Error closing Redis', { error: err.message });
      }
      process.exit(0);
    });

    // Force exit after 10s if connections aren't closed
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
};

start();

module.exports = { app };
