const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const orbi = require('../services/orbi');

router.post('/', async (req, res) => {
  try {
    const { goal } = req.body;
    const result = await orbi.startRun(goal || '');
    if (result.error) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    logger.error(`POST /run failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to start run.' });
  }
});

router.post('/stop', (req, res) => {
  try {
    const result = orbi.stopRun();
    if (result.error) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    logger.error(`POST /run/stop failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to stop run.' });
  }
});

router.get('/status', (req, res) => {
  res.json(orbi.getRunStatus());
});

module.exports = router;
