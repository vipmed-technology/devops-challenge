const express = require('express');
const Redis = require('ioredis');
const pino = require('pino');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3001;

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  lazyConnect: true
});

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'user-service' }));

app.get('/users', (req, res) => {
  res.json({ data: [{ id: 1, name: 'John Doe' }] });
});

module.exports = { app };

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`User Service started on port ${PORT}`);
  });
}