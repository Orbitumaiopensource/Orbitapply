const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { getDocuments, getDocumentText, saveDocumentText } = require('../services/tailor');
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

// GET plain editable text for resume or cover letter
router.get('/:jobId/text', (req, res) => {
  try {
    const result = getDocumentText(req.params.jobId);
    res.json(result);
  } catch (err) {
    logger.error(`GET /documents/:jobId/text failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load document text.' });
  }
});

// PATCH to save edits and regenerate PDF
router.patch('/:jobId', async (req, res) => {
  const { type, content } = req.body;
  if (!type || !content) return res.status(400).json({ error: 'type and content are required.' });
  try {
    await saveDocumentText(req.params.jobId, type, content);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`PATCH /documents/:jobId failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to save document.' });
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
