const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { logger } = require('../utils/logger');
const {
  DAILY_BUDGET_CAP_USD,
  BUDGET_ALERT_USD,
  MAX_APPLIES_PER_DAY,
  HUMAN_PAUSE_FIELDS,
} = require('../utils/constants');

const PIPELINE_PATH = path.join(__dirname, '..', '..', 'workspace-ledger', 'pipeline.json');
const PROTECTED_PATH = path.join(__dirname, '..', '..', 'memory', 'protected.json');
const BLACKLIST_PATH = path.join(__dirname, '..', '..', 'memory', 'blacklist.json');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');
const HUMAN_QUEUE_PATH = path.join(__dirname, '..', '..', 'workspace-submit', 'human-queue.json');
const LAST_SUBMIT_PATH = path.join(__dirname, '..', '..', 'workspace-submit', 'last-submit-at.json');

function loadConfig() {
  return readJSON(CONFIG_PATH, {});
}

function getPipeline() {
  return readJSON(PIPELINE_PATH, { applications: [], stats: { today_count: 0, budget_used_usd: 0, last_reset_date: '', total_applied: 0, response_rate: 0 } });
}

function resetTodayCountIfNeeded(stats) {
  const today = new Date().toISOString().split('T')[0];
  if (stats.last_reset_date !== today) {
    stats.today_count = 0;
    stats.last_reset_date = today;
    return true;
  }
  return false;
}

function checkBudget() {
  const config = loadConfig();
  const limit = config?.budget?.dailyLimitUSD || DAILY_BUDGET_CAP_USD;
  const alertAt = config?.budget?.alertAtUSD || BUDGET_ALERT_USD;
  const pipeline = getPipeline();
  const used = pipeline.stats.budget_used_usd || 0;

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    hardStop: used >= limit,
    alert: used >= alertAt,
  };
}

function checkDailyLimit() {
  const config = loadConfig();
  const maxApplies = config?.guardian?.maxAppliesPerDay || MAX_APPLIES_PER_DAY;
  const pipeline = getPipeline();
  const stats = pipeline.stats;

  resetTodayCountIfNeeded(stats);

  return {
    todayCount: stats.today_count,
    maxApplies,
    hardStop: stats.today_count >= maxApplies,
  };
}

function checkProtectedContacts(companyDomain, hiringManagerName) {
  const protectedData = readJSON(PROTECTED_PATH, { contacts: [] });
  const protected_ = Array.isArray(protectedData) ? protectedData : (protectedData.contacts || []);
  for (const p of protected_) {
    if (companyDomain && p.domain && companyDomain.toLowerCase().includes(p.domain.toLowerCase())) {
      return { blocked: true, reason: `Company domain matches protected contact: ${p.domain}` };
    }
    if (hiringManagerName && p.name && hiringManagerName.toLowerCase().includes(p.name.toLowerCase())) {
      return { blocked: true, reason: `Hiring manager matches protected contact: ${p.name}` };
    }
  }
  return { blocked: false };
}

function checkBlacklist(companyName) {
  const blacklistData = readJSON(BLACKLIST_PATH, { companies: [] });
  const blacklist = Array.isArray(blacklistData) ? blacklistData : (blacklistData.companies || []);
  for (const entry of blacklist) {
    const bl = typeof entry === 'string' ? entry : entry.name || entry.domain || '';
    if (bl && companyName.toLowerCase().includes(bl.toLowerCase())) {
      return { blocked: true, reason: `Company matches blacklist: ${bl}` };
    }
  }
  return { blocked: false };
}

function filterScoutResults(results) {
  const blacklistData = readJSON(BLACKLIST_PATH, { companies: [] });
  const blacklist = Array.isArray(blacklistData) ? blacklistData : (blacklistData.companies || []);
  return results.filter(job => {
    const check = checkBlacklist(job.company || '');
    if (check.blocked) {
      logger.info(`[GUARDIAN] Filtered blacklisted company: ${job.company}`);
      return false;
    }
    return true;
  });
}

function checkHumanPauseFields(formFields = []) {
  const config = loadConfig();
  const pauseFields = config?.guardian?.humanPauseFields || HUMAN_PAUSE_FIELDS;
  const triggered = formFields.filter(f => pauseFields.some(p => f.toLowerCase().includes(p)));
  return { paused: triggered.length > 0, fields: triggered };
}

function runPreflightCheck({ jobId, company, companyDomain, hiringManager, formFields = [], jobUrl = null }) {
  const budget = checkBudget();
  if (budget.hardStop) {
    logger.warn(`[GUARDIAN] HARD STOP - Daily budget exceeded: $${budget.used.toFixed(2)} / $${budget.limit}`);
    return { verdict: 'HARD_STOP', reason: `Daily budget cap reached ($${budget.used.toFixed(2)} of $${budget.limit})`, budgetStatus: budget, todayCount: 0 };
  }

  const daily = checkDailyLimit();
  if (daily.hardStop) {
    logger.warn(`[GUARDIAN] HARD STOP - Daily apply limit reached: ${daily.todayCount}/${daily.maxApplies}`);
    return { verdict: 'HARD_STOP', reason: `Daily apply limit reached (${daily.todayCount}/${daily.maxApplies})`, budgetStatus: budget, todayCount: daily.todayCount };
  }

  const protectedCheck = checkProtectedContacts(companyDomain, hiringManager);
  if (protectedCheck.blocked) {
    logger.info(`[GUARDIAN] BLOCK - ${protectedCheck.reason}`);
    return { verdict: 'BLOCK', reason: protectedCheck.reason, budgetStatus: budget, todayCount: daily.todayCount };
  }

  const blacklistCheck = checkBlacklist(company || '');
  if (blacklistCheck.blocked) {
    logger.info(`[GUARDIAN] BLOCK - ${blacklistCheck.reason}`);
    return { verdict: 'BLOCK', reason: blacklistCheck.reason, budgetStatus: budget, todayCount: daily.todayCount };
  }

  const pauseCheck = checkHumanPauseFields(formFields);
  if (pauseCheck.paused) {
    logger.info(`[GUARDIAN] PAUSE - Human review required for fields: ${pauseCheck.fields.join(', ')}`);
    addToHumanQueue({ jobId, company, companyDomain, url: jobUrl, pausedFields: pauseCheck.fields });
    return { verdict: 'PAUSE', reason: 'Human review required', humanPauseFields: pauseCheck.fields, budgetStatus: budget, todayCount: daily.todayCount };
  }

  if (budget.alert) {
    logger.warn(`[GUARDIAN] ALERT - Budget at $${budget.used.toFixed(2)} / $${budget.limit} (${((budget.used / budget.limit) * 100).toFixed(0)}%)`);
  }

  return {
    agentId: 'guardian',
    jobId,
    verdict: 'PASS',
    reason: 'All pre-flight checks passed',
    humanPauseFields: [],
    budgetStatus: budget,
    todayCount: daily.todayCount,
  };
}

function enforceRateLimit() {
  const config = loadConfig();
  const baseMs = config?.guardian?.rateLimitMs || 45000;
  const jitter = baseMs * 0.3;
  const minWaitMs = baseMs - jitter;

  const record = readJSON(LAST_SUBMIT_PATH, { lastSubmitAt: null });
  if (!record.lastSubmitAt) return { blocked: false };

  const elapsed = Date.now() - new Date(record.lastSubmitAt).getTime();
  if (elapsed < minWaitMs) {
    const waitSec = Math.ceil((minWaitMs - elapsed) / 1000);
    logger.warn(`[GUARDIAN] RATE LIMIT - ${waitSec}s remaining before next submission`);
    return { blocked: true, reason: `Rate limit active - please wait ${waitSec}s before submitting again`, waitMs: minWaitMs - elapsed };
  }
  return { blocked: false };
}

function recordSubmit() {
  const dir = path.dirname(LAST_SUBMIT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeJSON(LAST_SUBMIT_PATH, { lastSubmitAt: new Date().toISOString() });
  logger.info('[GUARDIAN] Submit timestamp recorded for rate limiting');
}

function addToHumanQueue(item) {
  const queue = readJSON(HUMAN_QUEUE_PATH, []);
  queue.push({ ...item, addedAt: new Date().toISOString(), reviewed: false });
  writeJSON(HUMAN_QUEUE_PATH, queue);
}

function requeueWithNewFields(jobId, newPausedFields) {
  const queue = readJSON(HUMAN_QUEUE_PATH, []);
  const idx = queue.findIndex(q => q.jobId === jobId);
  if (idx >= 0) {
    const existing = queue[idx];
    const existingValues = existing.fieldValues || {};
    const dedupedFields = [...new Set(newPausedFields)];
    queue[idx] = {
      ...existing,
      pausedFields: dedupedFields,
      fieldValues: existingValues,
      reviewed: false,
      approvedAt: null,
      requeuedAt: new Date().toISOString(),
      requeueReason: 'Additional sensitive fields found on actual form',
    };
    writeJSON(HUMAN_QUEUE_PATH, queue);
    logger.info(`[GUARDIAN] Re-queued ${jobId} with ${dedupedFields.length} field(s): ${dedupedFields.join(', ')}`);
    return queue[idx];
  }
  return null;
}

function getHumanQueue() {
  return readJSON(HUMAN_QUEUE_PATH, []);
}

function approveHumanQueueItem(jobId, fieldValues) {
  const queue = readJSON(HUMAN_QUEUE_PATH, []);
  const idx = queue.findIndex(q => q.jobId === jobId);
  if (idx >= 0) {
    queue[idx].reviewed = true;
    queue[idx].approvedAt = new Date().toISOString();
    queue[idx].fieldValues = fieldValues || {};
  }
  writeJSON(HUMAN_QUEUE_PATH, queue);
  return queue[idx] || null;
}

module.exports = {
  runPreflightCheck,
  checkBudget,
  checkDailyLimit,
  filterScoutResults,
  addToHumanQueue,
  getHumanQueue,
  approveHumanQueueItem,
  requeueWithNewFields,
  enforceRateLimit,
  recordSubmit,
};