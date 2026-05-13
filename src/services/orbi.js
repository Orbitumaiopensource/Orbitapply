const { logger } = require('../utils/logger');
const { runPreflightCheck, checkBudget } = require('./guardian');
const { runScout, getLatestResults } = require('./scout');
const { runRecon } = require('./recon');
const { runTailor } = require('./tailor');
const ledger = require('./ledger');
const { FIT_SCORE_MIN, TAILOR_SCORE_MIN } = require('../utils/constants');
const { readJSON } = require('../utils/fileStore');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');

let currentRun = {
  running: false,
  sessionId: null,
  step: null,
  steps: [],
  startedAt: null,
  result: null,
  error: null,
};

function getRunStatus() {
  return currentRun;
}

function updateStep(label, status = 'active') {
  currentRun.step = label;
  const idx = currentRun.steps.findIndex(s => s.label === label);
  if (idx >= 0) {
    currentRun.steps[idx].status = status;
  }
  logger.info(`[ORBI] Step: ${label}`);
}

function completeStep(label) {
  updateStep(label, 'done');
}

function failStep(label) {
  updateStep(label, 'error');
}

async function startRun(goal = '') {
  if (currentRun.running) {
    return { error: 'A run is already in progress.' };
  }

  const budget = checkBudget();
  if (budget.hardStop) {
    return { error: `Daily budget cap reached ($${budget.used.toFixed(2)} / $${budget.limit}). Reset at midnight.` };
  }

  const sessionId = `orbi-${Date.now()}`;
  const steps = [
    { label: 'SCOUT: Job Discovery', status: 'pending' },
    { label: 'RECON: Company Intel', status: 'pending' },
    { label: 'TAILOR: Documents', status: 'pending' },
    { label: 'LEDGER: Pipeline', status: 'pending' },
  ];

  currentRun = {
    running: true,
    sessionId,
    step: 'Initialising',
    steps,
    startedAt: new Date().toISOString(),
    result: null,
    error: null,
    goal,
  };

  setImmediate(() => executeRun(sessionId, goal));
  return { started: true, sessionId };
}

const API_LIMIT_PHRASES = ['usage limits', 'API usage limits', 'rate_limit', 'overloaded'];

function isApiLimitError(err) {
  const msg = err?.message || '';
  return API_LIMIT_PHRASES.some(p => msg.includes(p));
}

async function executeRun(sessionId, goal) {
  try {
    updateStep('SCOUT: Job Discovery');
    const scoutOutput = await runScout(goal);
    if (scoutOutput.error) {
      currentRun.error = scoutOutput.error;
      failStep('SCOUT: Job Discovery');
      currentRun.running = false;
      return;
    }
    completeStep('SCOUT: Job Discovery');

    const qualifiedJobs = (scoutOutput.results || []).filter(j => j.fitScore >= FIT_SCORE_MIN && !j.rejected);
    logger.info(`[ORBI] ${qualifiedJobs.length} qualified jobs (fitScore >= ${FIT_SCORE_MIN})`);

    // ── RECON ──────────────────────────────────────────────────────────────
    updateStep('RECON: Company Intel');
    const reconResults = {};
    let reconApiBlocked = false;
    for (const job of qualifiedJobs.slice(0, 8)) {
      if (reconApiBlocked) break;
      try {
        const intel = await runRecon(job.company, job.title, sessionId);
        reconResults[job.company] = intel;
      } catch (err) {
        logger.error(`[ORBI] RECON failed for ${job.company}: ${err.message}`);
        if (isApiLimitError(err)) {
          reconApiBlocked = true;
          logger.warn('[ORBI] RECON: API limit hit — skipping remaining companies');
        }
      }
    }
    completeStep('RECON: Company Intel');

    // ── TAILOR ─────────────────────────────────────────────────────────────
    // Process ALL jobs at or above TAILOR_SCORE_MIN so ≥80% of qualified get docs
    const tailorCandidates = qualifiedJobs.filter(j => j.fitScore >= TAILOR_SCORE_MIN);
    logger.info(`[ORBI] ${tailorCandidates.length} jobs eligible for TAILOR (fitScore >= ${TAILOR_SCORE_MIN})`);
    updateStep('TAILOR: Documents');
    const tailorResults = [];
    let tailorApiBlocked = false;
    for (const job of tailorCandidates) {
      if (tailorApiBlocked) break;
      try {
        const snippetLower = (job.snippet || '').toLowerCase();
        const formFields = [];
        if (/salary|compensation|pay rate|wage|desired salary/i.test(snippetLower)) formFields.push('salary');
        if (/diversity|equal opportunity|eeoc|eeo\b/i.test(snippetLower)) formFields.push('diversity');
        if (/security clearance|clearance required|classified|secret clearance/i.test(snippetLower)) formFields.push('security_clearance');
        if (/cover letter required|personal statement|essay question/i.test(snippetLower)) formFields.push('custom_essay');
        if (/disability|self.identif/i.test(snippetLower)) formFields.push('disability');
        if (/\bgender\b|gender identity/i.test(snippetLower)) formFields.push('gender');
        if (/\brace\b|ethnicity|racial/i.test(snippetLower)) formFields.push('race');
        if (/veteran|military status|vevraa/i.test(snippetLower)) formFields.push('veteran');

        const guardianCheck = runPreflightCheck({ jobId: job.id, company: job.company, companyDomain: job.companyDomain, formFields, jobUrl: job.url });
        if (guardianCheck.verdict === 'HARD_STOP') {
          logger.warn(`[ORBI] HARD STOP from GUARDIAN: ${guardianCheck.reason}`);
          break;
        }
        if (guardianCheck.verdict === 'BLOCK') {
          logger.info(`[ORBI] Job blocked by GUARDIAN: ${job.company}`);
          continue;
        }
        if (guardianCheck.verdict === 'PAUSE') {
          logger.info(`[ORBI] Job paused by GUARDIAN for human review: ${job.company} — fields: ${(guardianCheck.humanPauseFields || []).join(', ')}`);
          continue;
        }

        const intel = reconResults[job.company] || null;
        const tailor = await runTailor(job, intel, sessionId);
        tailorResults.push(tailor);
      } catch (err) {
        logger.error(`[ORBI] TAILOR failed for ${job.company}: ${err.message}`);
        if (isApiLimitError(err)) {
          tailorApiBlocked = true;
          logger.warn('[ORBI] TAILOR: API limit hit — skipping remaining documents');
        }
      }
    }
    completeStep('TAILOR: Documents');

    updateStep('LEDGER: Pipeline');
    for (const tailor of tailorResults) {
      if (tailor.atsScore >= 70 || tailorResults.length <= 2) {
        ledger.createApplication({
          title: tailor.role,
          company: tailor.company,
          url: qualifiedJobs.find(j => j.id === tailor.jobId)?.url || '',
          platform: qualifiedJobs.find(j => j.id === tailor.jobId)?.platform || 'direct',
          fitScore: qualifiedJobs.find(j => j.id === tailor.jobId)?.fitScore || 0,
          resumePath: tailor.resumePath,
          coverPath: tailor.coverPath,
          reconPath: reconResults[tailor.company]?._path || '',
          budgetUSD: 0.08,
        });
      }
    }
    completeStep('LEDGER: Pipeline');

    currentRun.running = false;
    currentRun.step = 'Complete';
    currentRun.result = {
      jobsFound: scoutOutput.totalFound,
      jobsQualified: qualifiedJobs.length,
      companiesResearched: Object.keys(reconResults).length,
      documentsGenerated: tailorResults.length,
      addedToPipeline: tailorResults.filter(t => t.atsScore >= 70).length,
    };
    logger.info(`[ORBI] Run complete: ${JSON.stringify(currentRun.result)}`);

  } catch (err) {
    logger.error(`[ORBI] Run failed: ${err.message}`, err);
    currentRun.running = false;
    currentRun.error = err.message || 'Run failed. Check server logs for details.';
    currentRun.steps = currentRun.steps.map(s =>
      s.status === 'active' ? { ...s, status: 'error' } : s
    );
  }
}

module.exports = { startRun, getRunStatus };
