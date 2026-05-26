/**
 * portalScan.js — Zero-token direct ATS portal scanner
 *
 * Hits Greenhouse / Ashby / Lever APIs directly for a curated list of
 * AI-focused companies. Returns results in the same shape as waterfallSearch
 * so scout.js can merge them with web-search results.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 */

const path = require('path');
const { readJSON } = require('../utils/fileStore');
const { logger } = require('../utils/logger');

const PORTALS_PATH = path.join(__dirname, '..', '..', 'portals.json');
const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 10;

// ── API detection ─────────────────────────────────────────────────────────────

function detectApi(company) {
  if (company.api) {
    if (company.api.includes('greenhouse')) return { type: 'greenhouse', url: company.api };
    if (company.api.includes('ashby'))      return { type: 'ashby',      url: company.api };
    if (company.api.includes('lever'))      return { type: 'lever',      url: company.api };
  }

  const url = company.careers_url || '';

  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  const ghMatch = url.match(/boards\.greenhouse\.io\/([^/?#]+)/) ||
                  url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghMatch) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs`,
    };
  }

  return null;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseGreenhouse(json, companyName) {
  return (json.jobs || []).map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
    snippet: `${j.title || ''} at ${companyName}. ${j.location?.name || ''}`.trim(),
  }));
}

function parseAshby(json, companyName) {
  return (json.jobs || []).map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
    snippet: `${j.title || ''} at ${companyName}. ${j.location || ''}`.trim(),
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
    snippet: `${j.text || ''} at ${companyName}. ${j.categories?.location || ''}`.trim(),
  }));
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'OrbitApply/1.0 (+https://github.com/Orbitumaiopensource/Orbitapply)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Title matching ────────────────────────────────────────────────────────────

function titleMatchesRoles(title, targetRoles, goal = '') {
  const lower = title.toLowerCase();
  const terms = goal ? [goal, ...targetRoles] : targetRoles;
  return terms.some(role => {
    const words = role.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    return words.length > 0 && words.every(w => lower.includes(w));
  });
}

// ── Parallel fetch with concurrency cap ───────────────────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;
  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => next()));
  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Scan all enabled portals and return matching jobs as raw search results
 * (same shape as waterfallSearch output so scout.js can merge them directly).
 *
 * @param {string[]} targetRoles - from profile.targetRoles
 * @param {string}   goal        - optional free-text goal from the UI
 * @returns {Array<{url, title, snippet, _provider}>}
 */
async function scanPortals(targetRoles = [], goal = '') {
  const portals = readJSON(PORTALS_PATH, { companies: [] });
  const companies = (portals.companies || []).filter(c => c.enabled !== false);

  const targets = companies
    .map(c => ({ ...c, _api: detectApi(c) }))
    .filter(c => c._api !== null);

  if (targets.length === 0) {
    logger.info('[PORTAL] No companies configured in portals.json — skipping direct scan');
    return [];
  }

  logger.info(`[PORTAL] Scanning ${targets.length} company portals directly (Greenhouse/Ashby/Lever)`);

  const rawJobs = [];
  const errors = [];

  const tasks = targets.map(company => async () => {
    const { type, url } = company._api;
    try {
      const json = await fetchJson(url);
      const jobs = PARSERS[type](json, company.name);
      const matching = jobs.filter(j =>
        j.url && titleMatchesRoles(j.title, targetRoles, goal)
      );
      if (matching.length > 0) {
        logger.info(`[PORTAL] ${company.name}: ${matching.length}/${jobs.length} jobs match title filter`);
      }
      rawJobs.push(...matching);
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
      logger.warn(`[PORTAL] ${company.name} (${type}): ${err.message}`);
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  if (errors.length > 0) {
    logger.info(`[PORTAL] ${errors.length} company API(s) unreachable (expected for some portals)`);
  }

  logger.info(`[PORTAL] Direct scan complete — ${rawJobs.length} matching jobs across ${targets.length} portals`);

  // Return in waterfallSearch format so scout.js can use them as-is
  return rawJobs.map(j => ({
    url: j.url,
    title: j.title,
    snippet: j.snippet,
    _provider: `portal-${j.company.toLowerCase().replace(/\s+/g, '-')}`,
    _portalCompany: j.company,
    _portalLocation: j.location,
  }));
}

module.exports = { scanPortals };
