const express = require('express');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 3001;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
});

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 200, 300, 500, 1000, 2000, 5000],
  registers: [register]
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

redis.on('connect', () => logger.info('Connected to Redis'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

app.use(express.json());
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route?.path || req.path;
    logger.info('request', {
      method: req.method,
      path: req.path,
      route,
      statusCode: res.statusCode,
      durationMs
    });
    httpRequestDuration.labels(req.method, route, String(res.statusCode)).observe(durationMs);
  });
  next();
});

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

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const USERS_KEY = 'users';

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

app.post('/users', async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const data = await redis.get(USERS_KEY);
    const users = data ? JSON.parse(data) : [];

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

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

const start = async () => {
  await initializeData();
  const server = app.listen(PORT, () => {
    logger.info('User Service started', { port: PORT });
  });

  const shutdown = async (signal) => {
    logger.info('Shutting down', { signal });
    server.close(async (err) => {
      if (err) {
        logger.error('Error closing server', { error: err.message });
        process.exit(1);
      }
      try {
        await redis.quit();
      } catch (closeError) {
        logger.error('Error closing Redis', { error: closeError.message });
      } finally {
        process.exit(0);
      }
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      try {
        redis.disconnect();
      } catch (closeError) {
        logger.error('Error disconnecting Redis', { error: closeError.message });
      }
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
};

start();

module.exports = { app };
