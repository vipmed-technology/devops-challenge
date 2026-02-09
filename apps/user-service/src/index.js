const express = require('express');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3001;

// Structured JSON logging with Winston
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

// Enable default metrics
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

const redisOperationDuration = new promClient.Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Duration of Redis operations',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5]
});

const userOperationsTotal = new promClient.Counter({
  name: 'user_operations_total',
  help: 'Total number of user operations',
  labelNames: ['operation', 'status']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(redisOperationDuration);
register.registerMetric(userOperationsTotal);

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

redis.on('connect', () => logger.info({ message: 'Connected to Redis' }));
redis.on('error', (err) => logger.error({ message: 'Redis error', error: err.message }));

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

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'user-service', timestamp: new Date().toISOString() });
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
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

app.get('/health/ready', async (req, res) => {
  try {
    const start = Date.now();
    await redis.ping();
    const duration = (Date.now() - start) / 1000;
    
    redisOperationDuration.labels('ping').observe(duration);
    
    res.json({ status: 'ready', dependencies: { redis: 'up' } });
  } catch (error) {
    logger.warn({
      message: 'Redis health check failed',
      error: error.message
    });
    
    res.status(503).json({
      status: 'not ready',
      dependencies: { redis: 'down' }
    });
  }
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
      logger.info({ message: 'Sample data initialized', count: sampleUsers.length });
    }
  } catch (error) {
    logger.warn({ message: 'Could not initialize Redis data', error: error.message });
  }
};

// Get all users
app.get('/users', async (req, res) => {
  try {
    const start = Date.now();
    const data = await redis.get(USERS_KEY);
    const duration = (Date.now() - start) / 1000;
    
    redisOperationDuration.labels('get').observe(duration);
    userOperationsTotal.labels('list', 'success').inc();
    
    const users = data ? JSON.parse(data) : [];
    res.json({ data: users, total: users.length });
  } catch (error) {
    logger.error({ message: 'Failed to get users', error: error.message });
    userOperationsTotal.labels('list', 'error').inc();
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const start = Date.now();
    const data = await redis.get(USERS_KEY);
    const duration = (Date.now() - start) / 1000;
    
    redisOperationDuration.labels('get').observe(duration);
    
    const users = data ? JSON.parse(data) : [];
    const user = users.find(u => u.id === req.params.id);

    if (!user) {
      userOperationsTotal.labels('get', 'not_found').inc();
      return res.status(404).json({ error: 'User not found' });
    }

    userOperationsTotal.labels('get', 'success').inc();
    res.json(user);
  } catch (error) {
    logger.error({ message: 'Failed to get user', error: error.message, userId: req.params.id });
    userOperationsTotal.labels('get', 'error').inc();
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Create user
app.post('/users', async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email) {
      userOperationsTotal.labels('create', 'validation_error').inc();
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const start = Date.now();
    const data = await redis.get(USERS_KEY);
    const users = data ? JSON.parse(data) : [];

    // Check for duplicate email
    if (users.find(u => u.email === email)) {
      userOperationsTotal.labels('create', 'duplicate').inc();
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
    const duration = (Date.now() - start) / 1000;
    
    redisOperationDuration.labels('set').observe(duration);
    userOperationsTotal.labels('create', 'success').inc();

    logger.info({ message: 'User created', userId: newUser.id, email: newUser.email });
    res.status(201).json(newUser);
  } catch (error) {
    logger.error({ message: 'Failed to create user', error: error.message, body: req.body });
    userOperationsTotal.labels('create', 'error').inc();
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Delete user
app.delete('/users/:id', async (req, res) => {
  try {
    const start = Date.now();
    const data = await redis.get(USERS_KEY);
    const users = data ? JSON.parse(data) : [];
    const index = users.findIndex(u => u.id === req.params.id);

    if (index === -1) {
      userOperationsTotal.labels('delete', 'not_found').inc();
      return res.status(404).json({ error: 'User not found' });
    }

    users.splice(index, 1);
    await redis.set(USERS_KEY, JSON.stringify(users));
    const duration = (Date.now() - start) / 1000;
    
    redisOperationDuration.labels('set').observe(duration);
    userOperationsTotal.labels('delete', 'success').inc();

    logger.info({ message: 'User deleted', userId: req.params.id });
    res.status(204).send();
  } catch (error) {
    logger.error({ message: 'Failed to delete user', error: error.message, userId: req.params.id });
    userOperationsTotal.labels('delete', 'error').inc();
    res.status(500).json({ error: 'Failed to delete user' });
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
let isShuttingDown = false;
let server;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  
  logger.info({ message: 'Graceful shutdown initiated', signal });
  isShuttingDown = true;

  // Stop accepting new connections
  if (server) {
    server.close(async (err) => {
      if (err) {
        logger.error({ message: 'Error during server shutdown', error: err.message });
      } else {
        logger.info({ message: 'Server closed successfully' });
      }

      // Disconnect from Redis
      try {
        await redis.quit();
        logger.info({ message: 'Redis connection closed' });
      } catch (redisErr) {
        logger.error({ message: 'Error closing Redis connection', error: redisErr.message });
      }

      process.exit(err ? 1 : 0);
    });
  }

  // Force shutdown after 30 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error({ message: 'Forced shutdown after timeout' });
    process.exit(1);
  }, 30000);
};

const start = async () => {
  await initializeData();
  server = app.listen(PORT, () => {
    logger.info({
      message: 'User Service started',
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      redis: `${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`
    });
  });
  return server;
};

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

start();

module.exports = { app };
