// ─────────────────────────────────────────────────────────────────────────────
// Autonomous Apply — orchestrator
//
// Reuses the existing GUARDIAN + SUBMIT engines READ-ONLY. The only behavioral
// extension is submit.runSubmit's optional `dryRun` flag (default false) which
// fills + screenshots a supported ATS form without clicking the final Submit.
//
// Per-job choice:
//   - dryRun (default): fill + screenshot, you submit later from the UI.
//   - autoSubmit (opt-in per job): fill + click Submit autonomously.
//
// Respects GUARDIAN's existing 15/day cap and 45s rate limit — no extra cap.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const { readJSON, writeJSON } = require('../../utils/fileStore');
const { logger, actionLogger } = require('../../utils/logger');
const guardian = require('../guardian');
const { runSubmit, detectPlatform } = require('../submit');
const ledger = require('../ledger');
const { getEligibility, loadAutoApplyConfig } = require('./eligibility');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'orbitapply.json');

function getWorkspace() {
  const config = readJSON(CONFIG_PATH, {});
  const ws = config?.autoApply?.workspace || './workspace-autoapply';
  return path.isAbsolute(ws) ? ws : path.join(__dirname, '..', '..', '..', ws);
}

function ensureWorkspace() {
  const ws = getWorkspace();
  if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
  return ws;
}

// Single in-memory run (mirrors ORBI's model — one autonomous run at a time).
let currentRun = null;

function getAutoApplyStatus() {
  if (currentRun) return currentRun;
  const ws = getWorkspace();
  return readJSON(path.join(ws, 'last-run.json'), null);
}

function persistRun() {
  if (!currentRun) return;
  const ws = ensureWorkspace();
  writeJSON(path.join(ws, 'last-run.json'), currentRun);
  writeJSON(path.join(ws, `run-${currentRun.startedAt.replace(/[:.]/g, '-')}.json`), currentRun);
}

// Resolve a pipeline (ledger) id so a real submission can mark the ledger.
// Mirrors the Human Queue route's resolution strategy.
function resolvePipelineId(job) {
  try {
    const pipeline = ledger.getAll();
    const entry = (pipeline.applications || []).find(
      a => a.url === job.url || (a.company === job.company && a.title === job.title)
    );
    return entry ? entry.id : null;
  } catch (err) {
    logger.warn(`[AUTOAPPLY] Ledger lookup failed for ${job.company}: ${err.message}`);
    return null;
  }
}

/**
 * Start an autonomous apply run (fire-and-forget; poll getAutoApplyStatus()).
 * @param {string[]} jobIds            SCOUT job ids to process.
 * @param {string[]} autoSubmitJobIds  Subset that should click Submit (not dry run).
 * @param {string|null} date           SCOUT results date (default: latest).
 */
function startAutoApply({ jobIds = [], autoSubmitJobIds = [], date = null }) {
  if (currentRun && currentRun.status === 'running') {
    return { error: 'An autonomous apply run is already in progress.' };
  }
  const cfg = loadAutoApplyConfig();
  if (!cfg.enabled) {
    return { error: 'Autonomous apply is disabled in orbitapply.json (autoApply.enabled).' };
  }
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { error: 'No jobs selected.' };
  }

  const autoSet = new Set(autoSubmitJobIds || []);
  currentRun = {
    startedAt: new Date().toISOString(),
    status: 'running',
    date: date || null,
    total: jobIds.length,
    processed: 0,
    steps: jobIds.map(id => ({ jobId: id, status: 'pending', autoSubmit: autoSet.has(id) })),
    completedAt: null,
    summary: null,
  };
  persistRun();

  // Background execution — return immediately.
  executeAutoApply(jobIds, autoSet, date).catch(err => {
    logger.error(`[AUTOAPPLY] Run crashed: ${err.message}`, err);
    if (currentRun) {
      currentRun.status = 'error';
      currentRun.error = err.message;
      currentRun.completedAt = new Date().toISOString();
      persistRun();
    }
  });

  return { started: true, total: jobIds.length };
}

async function executeAutoApply(jobIds, autoSet, date) {
  const { jobs } = getEligibility(date);
  const byId = {};
  for (const j of jobs) byId[j.id] = j;

  let submitted = 0;
  let filled = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < jobIds.length; i++) {
    const jobId = jobIds[i];
    const step = currentRun.steps[i];
    const job = byId[jobId];

    step.status = 'running';
    step.startedAt = new Date().toISOString();
    persistRun();

    if (!job) {
      step.status = 'skipped';
      step.message = 'Job not found in current SCOUT results';
      skipped++;
      currentRun.processed++;
      persistRun();
      continue;
    }

    step.company = job.company;
    step.title = job.title;

    if (!job.eligible) {
      step.status = 'skipped';
      step.message = `Not eligible: ${job.reasons.join('; ')}`;
      skipped++;
      currentRun.processed++;
      persistRun();
      continue;
    }

    // ── GUARDIAN preflight (authoritative gate) ──
    const pf = guardian.runPreflightCheck({
      jobId,
      company: job.company,
      jobUrl: job.url,
      formFields: [],
    });
    if (pf.verdict === 'HARD_STOP') {
      step.status = 'skipped';
      step.message = `GUARDIAN HARD_STOP: ${pf.reason}`;
      currentRun.status = 'stopped';
      currentRun.summary = `Stopped by GUARDIAN: ${pf.reason}`;
      currentRun.completedAt = new Date().toISOString();
      persistRun();
      logger.warn(`[AUTOAPPLY] HARD_STOP — aborting remaining jobs: ${pf.reason}`);
      return;
    }
    if (pf.verdict === 'BLOCK' || pf.verdict === 'PAUSE') {
      step.status = 'skipped';
      step.message = `GUARDIAN ${pf.verdict}: ${pf.reason}`;
      skipped++;
      currentRun.processed++;
      persistRun();
      continue;
    }

    // ── Rate limit (45s between submissions, shared with the rest of the system) ──
    const rl = guardian.enforceRateLimit();
    if (rl.blocked) {
      const waitMs = Math.min(rl.waitMs || 45000, 60000);
      logger.info(`[AUTOAPPLY] Rate limited — waiting ${Math.ceil(waitMs / 1000)}s before ${job.company}`);
      step.message = `Waiting ${Math.ceil(waitMs / 1000)}s (rate limit)`;
      persistRun();
      await new Promise(r => setTimeout(r, waitMs + 500));
    }

    const dryRun = !autoSet.has(jobId);
    step.mode = dryRun ? 'dry-run (fill + screenshot)' : 'auto-submit';

    const pipelineId = resolvePipelineId(job);

    try {
      logger.info(`[AUTOAPPLY] ${dryRun ? 'Dry-run' : 'Auto-submit'} → ${job.company} — ${job.title} (${job.platform})`);
      const result = await runSubmit({
        jobId,
        pipelineId,
        url: job.url,
        platform: detectPlatform(job.url || ''),
        resumePath: job.doc && job.doc.resumePath,
        coverPath: job.doc && job.doc.coverPath,
        fieldValues: {},
        dryRun,
      });

      step.result = {
        status: result.status,
        dryRun: Boolean(result.dryRun),
        error: result.error || null,
        screenshots: (result.screenshots || []).length,
        submittedAt: result.submittedAt || null,
      };

      if (result.status === 'submitted') {
        step.status = 'submitted';
        step.message = 'Application submitted';
        guardian.recordSubmit();
        submitted++;
      } else if (result.status === 'paused') {
        // Sensitive fields found on the real form — already added to Human Queue
        // by submit.js. Surface it; do not auto-answer.
        step.status = 'human-queue';
        step.message = `Paused → Human Queue: ${(result.pausedFields || []).join(', ')}`;
        skipped++;
      } else if (result.status === 'form_filled') {
        step.status = result.dryRun ? 'filled-dry-run' : 'form-filled';
        step.message = result.error || 'Form filled';
        // A real (non-dry) form fill consumed a slot on the ATS — record it so
        // the rate limit / daily count stay accurate. Dry runs do NOT.
        if (!result.dryRun) {
          guardian.recordSubmit();
        }
        filled++;
      } else {
        step.status = 'failed';
        step.message = result.error || 'Submission failed';
        failed++;
      }
    } catch (err) {
      step.status = 'failed';
      step.message = err.message;
      failed++;
      logger.error(`[AUTOAPPLY] Job ${jobId} failed: ${err.message}`);
    }

    step.completedAt = new Date().toISOString();
    currentRun.processed++;
    persistRun();

    if (actionLogger) {
      actionLogger.info(`[autoapply] job=${jobId} company="${job.company}" mode=${step.mode} status=${step.status}`);
    }
  }

  currentRun.status = 'done';
  currentRun.completedAt = new Date().toISOString();
  currentRun.summary = `${submitted} submitted, ${filled} filled (review), ${skipped} skipped, ${failed} failed`;
  persistRun();
  logger.info(`[AUTOAPPLY] Run complete — ${currentRun.summary}`);
}

module.exports = { startAutoApply, getAutoApplyStatus, getEligibility };
