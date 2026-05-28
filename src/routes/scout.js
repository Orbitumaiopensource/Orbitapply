const express = require('express');
const router = express.Router();
const multer = require('multer');
const mammoth = require('mammoth');
const { logger } = require('../utils/logger');
const scoutService = require('../services/scout');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/results', (req, res) => {
  try {
    const { date } = req.query;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const results = scoutService.getResultsByDate(date);
      return res.json(results || { results: [], totalFound: 0, qualified: 0 });
    }
    const results = scoutService.getLatestResults();
    res.json(results || { results: [], totalFound: 0, qualified: 0 });
  } catch (err) {
    logger.error(`GET /scout/results failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load scout results.' });
  }
});

router.get('/history', (req, res) => {
  try {
    res.json(scoutService.getAllResults());
  } catch (err) {
    logger.error(`GET /scout/history failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load run history.' });
  }
});

router.get('/export', (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid or missing date. Use YYYY-MM-DD.' });
    }
    const data = scoutService.getResultsByDate(date);
    if (!data) return res.status(404).json({ error: 'No results found for that date.' });
    const csv = scoutService.buildCSV(data.results || []);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="scout-results-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    logger.error(`GET /scout/export failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to export results.' });
  }
});

router.post('/import', async (req, res) => {
  try {
    const { url, title, company, salary } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url is required.' });
    const result = await scoutService.importJob({ url, title, company, salary });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    logger.error(`POST /scout/import failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to import job.' });
  }
});

router.post('/import-docx', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!/\.docx$/i.test(req.file.originalname)) {
      return res.status(400).json({ error: 'Only .docx files are supported.' });
    }
    const { value: jdText } = await mammoth.extractRawText({ buffer: req.file.buffer });
    const { title = '', company = '', salary = '' } = req.body;
    const result = await scoutService.importJobFromDoc({ title, company, salary, jdText });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    logger.error(`POST /scout/import-docx failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to import job from document.' });
  }
});

router.post('/results/:id/approve', (req, res) => {
  try {
    const job = scoutService.approveJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ approved: true, job });
  } catch (err) {
    logger.error(`POST /scout/results/:id/approve failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to approve job.' });
  }
});

// Mark a job as applied / not_interested / deleted. Any of these statuses
// removes the job from current + future SCOUT result views (by fingerprint).
router.post('/results/:id/action', (req, res) => {
  try {
    const { action } = req.body || {};
    const allowed = ['applied', 'not_interested', 'deleted', 'cleared'];
    if (!allowed.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${allowed.join(', ')}` });
    }
    const result = scoutService.recordJobAction(req.params.id, action);
    if (!result) return res.status(404).json({ error: 'Job not found in any saved results.' });
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error(`POST /scout/results/:id/action failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to record job action.' });
  }
});

router.post('/results/:id/reject', (req, res) => {
  try {
    const job = scoutService.rejectJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ rejected: true, job });
  } catch (err) {
    logger.error(`POST /scout/results/:id/reject failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to reject job.' });
  }
});

router.post('/purge-expired', (req, res) => {
  try {
    const { date } = req.body || {};
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    const result = scoutService.purgeExpiredJobs(date || null);
    logger.info(`[SCOUT] Purge expired: removed ${result.removed}, remaining ${result.remaining}`);
    res.json(result);
  } catch (err) {
    logger.error(`POST /scout/purge-expired failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to purge expired jobs.' });
  }
});

module.exports = router;
