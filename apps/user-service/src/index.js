const Redis = require('ioredis');
const http = require('http');
const { createApp } = require('./app');
const { createRedisStore } = require('./store');
const logger = require('./logger');

const PORT = Number(process.env.PORT || 3001);

function createRedisClient() {
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });
}

async function start() {
  const redis = createRedisClient();
  const store = createRedisStore(redis);

  redis.on('connect', () => logger.info('connected to redis'));
  redis.on('error', (error) => logger.error('redis error', { error: error.message }));

  await redis.connect();
  await store.initializeData();

  const app = createApp(store);
  const server = http.createServer(app);
  let shuttingDown = false;

  server.listen(PORT, () => {
    logger.info('user service started', { port: PORT });
  });

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('shutdown signal received', { signal });

    server.close(async (error) => {
      if (error) {
        logger.error('graceful shutdown failed', { error: error.message });
        process.exit(1);
      }

      await redis.quit();
      logger.info('user service stopped');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      try {
        redis.disconnect();
      } catch (error) {
        logger.error('redis disconnect failed during forced shutdown', { error: error.message });
      }
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server, redis };
}

if (require.main === module) {
  start().catch((error) => {
    logger.error('user service failed to start', { error: error.message });
    process.exit(1);
  });
}

module.exports = { start, createApp };
