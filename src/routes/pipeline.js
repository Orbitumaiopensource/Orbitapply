const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const ledger = require('../services/ledger');
const { runCoach } = require('../services/coach');
const { PIPELINE_STAGES } = require('../utils/constants');

router.get('/', (req, res) => {
  try {
    res.json(ledger.getAll());
  } catch (err) {
    logger.error(`GET /pipeline failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load pipeline.' });
  }
});

router.get('/stats', (req, res) => {
  try {
    res.json(ledger.getStats());
  } catch (err) {
    logger.error(`GET /pipeline/stats failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

router.get('/followups', (req, res) => {
  try {
    res.json({ followUps: ledger.getFollowUpsDue() });
  } catch (err) {
    logger.error(`GET /pipeline/followups failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load follow-ups.' });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !PIPELINE_STAGES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${PIPELINE_STAGES.join(', ')}` });
    }
    const result = ledger.updateStatus(req.params.id, status);
    res.json(result);

    if (result.coachTrigger) {
      const application = ledger.getById(req.params.id);
      if (application) {
        runCoach(application).catch(err =>
          logger.error(`[COACH] Failed to generate prep pack for ${req.params.id}: ${err.message}`, err)
        );
      }
    }
  } catch (err) {
    logger.error(`PATCH /pipeline/:id/status failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

router.patch('/:id/notes', (req, res) => {
  try {
    const { notes } = req.body;
    const result = ledger.addNote(req.params.id, notes || '');
    res.json(result);
  } catch (err) {
    logger.error(`PATCH /pipeline/:id/notes failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to update notes.' });
  }
});

module.exports = router;
