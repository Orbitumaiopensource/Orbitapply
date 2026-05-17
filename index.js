require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { logger } = require('./src/utils/logger');

const runRoutes = require('./src/routes/run');
const pipelineRoutes = require('./src/routes/pipeline');
const profileRoutes = require('./src/routes/profile');
const scoutRoutes = require('./src/routes/scout');
const tailorRoutes = require('./src/routes/tailor');
const budgetRoutes = require('./src/routes/budget');
const humanQueueRoutes = require('./src/routes/humanQueue');
const sessionsRoutes = require('./src/routes/sessions');
const documentsRoutes = require('./src/routes/documents');
const configRoutes = require('./src/routes/config');
const submitRoutes = require('./src/routes/submit');
const autoApplyRoutes = require('./src/routes/autoApply');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({ origin: `http://${HOST}:${PORT}`, credentials: false }));

app.use('/api/v1/run', runRoutes);
app.use('/api/v1/pipeline', pipelineRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/scout', scoutRoutes);
app.use('/api/v1/tailor', tailorRoutes);
app.use('/api/v1/budget', budgetRoutes);
app.use('/api/v1/human-queue', humanQueueRoutes);
app.use('/api/v1/sessions', sessionsRoutes);
app.use('/api/v1/documents', documentsRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/submit', submitRoutes);
app.use('/api/v1/autoapply', autoApplyRoutes);

app.use(express.static(path.join(__dirname, 'ui')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'ui', 'index.html'));
  } else {
    res.status(404).json({ error: 'Route not found.' });
  }
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, err);
  res.status(500).json({ error: 'Something went wrong. Check server logs.' });
});

const server = app.listen(PORT, HOST, () => {
  logger.info(`OrbitApply gateway running at http://${HOST}:${PORT}`);
  logger.info(`Control UI: http://localhost:${PORT}`);
});

// If the port is still held (e.g. a previous process is shutting down),
// fail with a clear message instead of an unhandled 'error' crash.
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      `Port ${PORT} is already in use. Another OrbitApply instance is still running — ` +
      `stop it (Stop-Process -Name node) and retry.`
    );
  } else {
    logger.error(`Server error: ${err.message}`, err);
  }
  process.exit(1);
});

// Graceful shutdown so the port is released before nodemon (or the OS)
// starts the next instance. Prevents EADDRINUSE on dev restarts.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal} — closing server...`);
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out — forcing exit.');
    process.exit(0);
  }, 8000);
  forceExit.unref();
  server.close(() => {
    clearTimeout(forceExit);
    logger.info('Server closed cleanly.');
    process.exit(0);
  });
}

// SIGUSR2 is what nodemon sends on restart; SIGINT/SIGTERM cover Ctrl+C and OS kills.
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(sig => {
  process.once(sig, () => shutdown(sig));
});

module.exports = app;
