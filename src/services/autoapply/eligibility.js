// ─────────────────────────────────────────────────────────────────────────────
// Autonomous Apply — eligibility detection (pure JS, no AI, no side effects)
//
// A SCOUT job is "auto-eligible" only when ALL hold:
//   1. Application docs are Ready (TAILOR package exists with resume + cover).
//   2. Platform is one of autoApply.supportedPlatforms (greenhouse/lever/ashby).
//   3. GUARDIAN preflight returns PASS (budget, daily cap, blacklist, protected).
//   4. The job is not rejected/skipped in SCOUT.
//   5. It has not already been submitted (no submit log with status 'submitted').
//
// This module ONLY reads existing services. It never mutates the running
// system's state.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { readJSON } = require('../../utils/fileStore');
const { logger } = require('../../utils/logger');
const scout = require('../scout');
const tailor = require('../tailor');
const guardian = require('../guardian');
const { getSubmitLog } = require('../submit');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'orbitapply.json');

const DEFAULT_SUPPORTED = ['greenhouse', 'lever', 'ashby'];

function loadAutoApplyConfig() {
  const config = readJSON(CONFIG_PATH, {});
  const aa = config.autoApply || {};
  return {
    enabled: aa.enabled !== false,
    defaultAutoSubmit: aa.defaultAutoSubmit === true,
    supportedPlatforms: Array.isArray(aa.supportedPlatforms) && aa.supportedPlatforms.length
      ? aa.supportedPlatforms.map(p => String(p).toLowerCase())
      : DEFAULT_SUPPORTED,
  };
}

// Build a jobId → TAILOR application metadata map (resume/cover PDF paths).
function buildDocMap() {
  const map = {};
  let apps = [];
  try {
    apps = tailor.getAllApplications() || [];
  } catch (err) {
    logger.warn(`[AUTOAPPLY] Could not read TAILOR applications: ${err.message}`);
    return map;
  }
  for (const app of apps) {
    if (!app || !app.jobId) continue;
    // getAllApplications spreads metadata.json which carries resume/coverPdfPath
    map[app.jobId] = {
      resumePath: app.resumePdfPath || null,
      coverPath: app.coverPdfPath || null,
      atsScore: app.atsScore || 0,
      hasResume: Boolean(app.hasResume),
      hasCover: Boolean(app.hasCover),
    };
  }
  return map;
}

function alreadySubmitted(jobId) {
  try {
    const log = getSubmitLog(jobId);
    return Boolean(log && log.status === 'submitted');
  } catch {
    return false;
  }
}

// Returns { config, jobs: [{ ...scoutJob, eligible, reasons[], doc, autoSubmitDefault }] }
function getEligibility(date = null) {
  const cfg = loadAutoApplyConfig();
  const data = date ? scout.getResultsByDate(date) : scout.getLatestResults();
  const results = (data && data.results) || [];
  const docMap = buildDocMap();

  const jobs = results.map(job => {
    const reasons = [];
    const platform = String(job.platform || 'direct').toLowerCase();
    const doc = docMap[job.id] || null;

    if (job.rejected) reasons.push('Skipped in SCOUT');
    if (!doc || !doc.hasResume || !doc.hasCover) {
      reasons.push('Documents not ready (generate resume + cover first)');
    }
    if (!cfg.supportedPlatforms.includes(platform)) {
      reasons.push(`Platform "${platform}" not auto-supported (only ${cfg.supportedPlatforms.join(', ')})`);
    }
    if (alreadySubmitted(job.id)) reasons.push('Already submitted');

    // GUARDIAN preflight — no formFields here (real form scan happens at submit
    // time), so this checks budget / daily cap / blacklist / protected only.
    let guardianVerdict = 'PASS';
    try {
      const pf = guardian.runPreflightCheck({
        jobId: job.id,
        company: job.company,
        jobUrl: job.url,
        formFields: [],
      });
      guardianVerdict = pf.verdict;
      if (pf.verdict !== 'PASS') reasons.push(`GUARDIAN ${pf.verdict}: ${pf.reason}`);
    } catch (err) {
      guardianVerdict = 'ERROR';
      reasons.push(`GUARDIAN check failed: ${err.message}`);
    }

    return {
      id: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
      platform,
      location: job.location,
      salary: job.salary,
      fitScore: job.fitScore,
      eligible: reasons.length === 0,
      reasons,
      guardianVerdict,
      doc,
      autoSubmitDefault: cfg.defaultAutoSubmit,
    };
  });

  return { config: cfg, runDate: (data && data.runDate) || null, jobs };
}

module.exports = { getEligibility, loadAutoApplyConfig, buildDocMap };
