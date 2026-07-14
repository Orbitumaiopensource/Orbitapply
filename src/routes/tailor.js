const express = require('express');
const { exec } = require('child_process');
const router = express.Router();
const { logger } = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { runTailor, getDocuments, getAllApplications, docExistsForJob, getApplicationsRoot } = require('../services/tailor');
const scoutService = require('../services/scout');
const ledger = require('../services/ledger');

// List all generated application packages
router.get('/applications', (req, res) => {
  try {
    res.json(getAllApplications());
  } catch (err) {
    logger.error(`GET /tailor/applications failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load applications.' });
  }
});

// Check if docs exist for a given jobId
router.get('/applications/status', (req, res) => {
  try {
    const { jobId } = req.query;
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' });
    res.json({ exists: docExistsForJob(jobId) });
  } catch (err) {
    logger.error(`GET /tailor/applications/status failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to check document status.' });
  }
});

// On-demand generate docs for a single job by jobId
router.post('/generate', async (req, res) => {
  try {
    const { jobId, date } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' });

    const today = date || new Date().toISOString().split('T')[0];
    const data = scoutService.getResultsByDate(today);
    const job = data?.results?.find(j => j.id === jobId);

    if (!job) {
      return res.status(404).json({ error: `Job ${jobId} not found in results for ${today}.` });
    }

    if (!process.env.GROK_API_KEY) {
      return res.status(503).json({ error: 'GROK_API_KEY is not configured.' });
    }

    logger.info(`[TAILOR] On-demand generation for ${job.company} — ${job.title}`);
    const result = await runTailor(job, null, `tailor-ondemand-${Date.now()}`);

    if (result.atsScore >= 0) {
      try {
        const existing = ledger.getAll();
        const alreadyInPipeline = (existing.applications || []).some(
          a => a.resumePath === result.resumePath || (a.company === result.company && a.title === result.role)
        );
        if (!alreadyInPipeline) {
          const created = ledger.createApplication({
            title: result.role,
            company: result.company,
            url: job.url || '',
            platform: job.platform || 'direct',
            fitScore: job.fitScore || 0,
            resumePath: result.resumePath,
            coverPath: result.coverPath,
            reconPath: '',
            budgetUSD: 0.02,
          });
          // Stamp the ledger application id into metadata.json so the doc
          // editor / regenerate lookups can find this folder by application id.
          try {
            const metaPath = path.join(result.folder, 'metadata.json');
            if (created?.id && fs.existsSync(metaPath)) {
              const meta = readJSON(metaPath, {});
              writeJSON(metaPath, { ...meta, applicationId: created.id });
            }
          } catch (stampErr) {
            logger.warn(`[TAILOR] Failed to stamp applicationId: ${stampErr.message}`);
          }
          logger.info(`[TAILOR] Pipeline entry created for ${result.company} — ${result.role}`);
        }
      } catch (ledgerErr) {
        logger.error(`[TAILOR] Failed to create pipeline entry: ${ledgerErr.message}`);
      }
    }

    res.json({
      success: true,
      company: result.company,
      role: result.role,
      atsScore: result.atsScore,
      folder: result.folder,
      keywordsInjected: result.keywordsInjected,
    });
  } catch (err) {
    logger.error(`POST /tailor/generate failed: ${err.message}`, err);
    const knownError = err.message?.includes('usage limits')
      || err.message?.includes('API usage limits')
      || err.message?.includes('timed out')
      || err.message?.includes('invalid or missing');
    res.status(503).json({
      error: knownError ? err.message : 'Failed to generate documents. Check server logs.',
    });
  }
});

// Get resume/cover letter content for a job
router.get('/documents/:jobId', (req, res) => {
  try {
    const docs = getDocuments(req.params.jobId);
    res.json(docs);
  } catch (err) {
    logger.error(`GET /tailor/documents/:jobId failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load documents.' });
  }
});

// Open the applications folder in Windows Explorer
router.post('/applications/open-folder', (req, res) => {
  try {
    const appsRoot = getApplicationsRoot();
    const safePath = appsRoot.replace(/"/g, '');
    exec(`explorer "${safePath}"`, err => {
      if (err) logger.error(`[TAILOR] Failed to open folder: ${err.message}`);
    });
    res.json({ opened: true, path: appsRoot });
  } catch (err) {
    logger.error(`POST /tailor/applications/open-folder failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to open folder.' });
  }
});

module.exports = router;
