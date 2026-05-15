const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { getDocuments } = require('../services/tailor');
const { getPrepPack, runCoach } = require('../services/coach');
const ledger = require('../services/ledger');

router.get('/:jobId', (req, res) => {
  try {
    const docs = getDocuments(req.params.jobId);
    res.json(docs);
  } catch (err) {
    logger.error(`GET /documents/:jobId failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load documents.' });
  }
});

router.get('/:applicationId/prep', (req, res) => {
  try {
    const content = getPrepPack(req.params.applicationId);
    res.json({ content: content || null });
  } catch (err) {
    logger.error(`GET /documents/:id/prep failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load prep pack.' });
  }
});

// On-demand generation — lets COACH be run from the Pipeline UI without
// having to move the application into an interview stage first.
router.post('/:applicationId/prep', async (req, res) => {
  try {
    const application = ledger.getById(req.params.applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found in pipeline.' });
    }
    const { content } = await runCoach(application);
    res.json({ content });
  } catch (err) {
    logger.error(`POST /documents/:id/prep failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to generate prep pack.' });
  }
});

module.exports = router;
