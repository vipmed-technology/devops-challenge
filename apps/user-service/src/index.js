const express = require('express');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const promClient = require('prom-client');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 3001;

// Structured JSON logging with winston
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-service' },
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
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const redisOperations = new promClient.Counter({
  name: 'redis_operations_total',
  help: 'Total number of Redis operations',
  labelNames: ['operation', 'status']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(redisOperations);

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

redis.on('connect', () => logger.info('Connected to Redis'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

app.use(express.json());

// Request logging and metrics middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
    httpRequestTotal.labels(req.method, route, res.statusCode).inc();
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(3)}s`
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
  try {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (error) {
    logger.error('Failed to generate metrics', { error: error.message });
    res.status(500).send('Failed to generate metrics');
  }
});

const USERS_KEY = 'users';

// Initialize sample data
const initializeData = async () => {
  try {
    await redis.connect();
    redisOperations.labels('connect', 'success').inc();
    const exists = await redis.exists(USERS_KEY);
    if (!exists) {
      const sampleUsers = [
        { id: uuidv4(), name: 'John Doe', email: 'john@example.com', role: 'admin', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'Jane Smith', email: 'jane@example.com', role: 'user', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'Bob Wilson', email: 'bob@example.com', role: 'user', createdAt: new Date().toISOString() }
      ];
      await redis.set(USERS_KEY, JSON.stringify(sampleUsers));
      redisOperations.labels('set', 'success').inc();
      logger.info('Sample data initialized');
    }
  } catch (error) {
    redisOperations.labels('connect', 'error').inc();
    logger.warn('Could not initialize Redis data', { error: error.message });
  }
};

// Get all users
app.get('/users', async (req, res) => {
  try {
    const data = await redis.get(USERS_KEY);
    redisOperations.labels('get', 'success').inc();
    const users = data ? JSON.parse(data) : [];
    res.json({ data: users, total: users.length });
  } catch (error) {
    redisOperations.labels('get', 'error').inc();
    logger.error('Failed to get users', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const data = await redis.get(USERS_KEY);
    redisOperations.labels('get', 'success').inc();
    const users = data ? JSON.parse(data) : [];
    const user = users.find(u => u.id === req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    redisOperations.labels('get', 'error').inc();
    logger.error('Failed to get user', { error: error.message, userId: req.params.id });
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
    redisOperations.labels('get', 'success').inc();
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
    redisOperations.labels('set', 'success').inc();

    logger.info('User created', { userId: newUser.id, email: newUser.email });
    res.status(201).json(newUser);
  } catch (error) {
    redisOperations.labels('set', 'error').inc();
    logger.error('Failed to create user', { error: error.message });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Delete user
app.delete('/users/:id', async (req, res) => {
  try {
    const data = await redis.get(USERS_KEY);
    redisOperations.labels('get', 'success').inc();
    const users = data ? JSON.parse(data) : [];
    const index = users.findIndex(u => u.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users.splice(index, 1);
    await redis.set(USERS_KEY, JSON.stringify(users));
    redisOperations.labels('set', 'success').inc();

    logger.info('User deleted', { userId: req.params.id });
    res.status(204).send();
  } catch (error) {
    redisOperations.labels('set', 'error').inc();
    logger.error('Failed to delete user', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown implementation
// Handles SIGTERM from Kubernetes and SIGINT from Ctrl+C
let shuttingDown = false;

const gracefulShutdown = async (signal, server) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Starting graceful shutdown', { signal });

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      logger.error('Error during server close', { error: err.message });
    } else {
      logger.info('Server closed, all connections terminated');
    }

    // Close Redis connection gracefully
    try {
      await redis.quit();
      logger.info('Redis connection closed');
    } catch (redisErr) {
      logger.error('Error closing Redis connection', { error: redisErr.message });
    }

    process.exit(err ? 1 : 0);
  });

  // Force shutdown after 30s (Kubernetes default grace period)
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

const start = async () => {
  await initializeData();
  const server = app.listen(PORT, () => {
    logger.info('User Service started', { port: PORT });
  });

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
  process.on('SIGINT', () => gracefulShutdown('SIGINT', server));

  return server;
};

start();

module.exports = { app };
