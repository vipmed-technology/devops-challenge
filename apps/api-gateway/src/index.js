const express = require('express');
const axios = require('axios');
const pino = require('pino');
const pinoHttp = require('pino-http');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
app.use(pinoHttp({ logger }));
app.use(express.json());

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'api-gateway' }));

app.get('/api/users', async (req, res) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/users`);
    res.json(response.data);
  } catch (error) {
    res.status(502).json({ error: 'User Service unreachable' });
  }
});

// Export app for testing
module.exports = { app };

// Only start the server if called directly (not via require)
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`API Gateway started on port ${PORT}`);
  });
}