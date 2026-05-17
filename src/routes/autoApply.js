const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { startAutoApply, getAutoApplyStatus, getEligibility } = require('../services/autoapply/autoApply');

// List SCOUT jobs with auto-apply eligibility (read-only).
router.get('/eligible', (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : null;
    res.json(getEligibility(date));
  } catch (err) {
    logger.error(`GET /autoapply/eligible failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to compute auto-apply eligibility.' });
  }
});

// Live status of the current / last autonomous run.
router.get('/status', (req, res) => {
  try {
    res.json({ run: getAutoApplyStatus() });
  } catch (err) {
    logger.error(`GET /autoapply/status failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load auto-apply status.' });
  }
});

// Start an autonomous run. Body: { jobIds:[], autoSubmitJobIds:[], date }
router.post('/run', (req, res) => {
  try {
    const { jobIds, autoSubmitJobIds, date } = req.body || {};

    const ids = Array.isArray(jobIds)
      ? jobIds.filter(x => typeof x === 'string').slice(0, 50)
      : [];
    const autoIds = Array.isArray(autoSubmitJobIds)
      ? autoSubmitJobIds.filter(x => typeof x === 'string').slice(0, 50)
      : [];

    if (!ids.length) return res.status(400).json({ error: 'jobIds (array) is required.' });

    const out = startAutoApply({
      jobIds: ids,
      autoSubmitJobIds: autoIds,
      date: typeof date === 'string' ? date : null,
    });

    if (out.error) return res.status(409).json({ error: out.error });
    res.json(out);
  } catch (err) {
    logger.error(`POST /autoapply/run failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to start autonomous apply run.' });
  }
});

module.exports = router;
