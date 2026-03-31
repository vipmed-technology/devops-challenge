const http = require('http');
const { createApp } = require('./app');
const logger = require('./logger');

const PORT = Number(process.env.PORT || 3000);

function start() {
  const app = createApp();
  const server = http.createServer(app);
  let shuttingDown = false;

  server.listen(PORT, () => {
    logger.info('api gateway started', { port: PORT });
  });

  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('shutdown signal received', { signal });

    server.close((error) => {
      if (error) {
        logger.error('graceful shutdown failed', { error: error.message });
        process.exit(1);
      }

      logger.info('api gateway stopped');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server };
}

if (require.main === module) {
  start();
}

module.exports = { start, createApp };
