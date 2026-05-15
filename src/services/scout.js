const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { filterScoutResults } = require('./guardian');
const { logger } = require('../utils/logger');
const { SEARCH_DOMAINS, getPlatformFromUrl } = require('../config/jobSites');

const PROFILE_PATH = path.join(__dirname, '..', '..', 'memory', 'profile.json');
const DEFAULT_WORKSPACE = path.join(__dirname, '..', '..', 'workspace-scout');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');

const MIN_DISPLAY_SCORE = 40;
const MAX_RESULTS_PER_QUERY = 15;

const EXPIRED_JOB_PHRASES = [
  'no longer accepting applications',
  'not accepting applications',
  'no longer accepting new applications',
  'applications are closed',
  'closed to new applicants',
  'application deadline has passed',
  'this job is no longer available',
  'job is no longer available',
  'posting is no longer available',
  'position has been filled',
  'position is filled',
  'this position has been filled',
  'job has expired',
  'posting has expired',
  'job is closed',
  'listing has expired',
  'role has been filled',
  'the page you are looking for doesn\'t exist',
  'this job requisition is no longer available',
  'job requisition is closed',
  'this job listing has been removed',
  'this position is no longer available',
  'this role is no longer available',
  'this opening is no longer active',
  'this job is no longer accepting applications',
  'job is no longer active',
  'this position is closed',
  'this job is no longer open',
  'this job has been archived',
  'job is expired',
  'this job ad has been removed',
  'page you are looking for does not exist',
  'page does not exist',
  'job not found',
  'position not found',
];

function isExpiredJob(text) {
  const lower = (text || '').toLowerCase();
  return EXPIRED_JOB_PHRASES.some(phrase => lower.includes(phrase));
}

function getScoutWorkspace() {
  const config = readJSON(CONFIG_PATH, {});
  if (config.outputFolder && fs.existsSync(config.outputFolder)) {
    return path.join(config.outputFolder, 'scout');
  }
  return DEFAULT_WORKSPACE;
}

// URL patterns that identify aggregator SEARCH RESULT pages (not individual jobs)
const AGGREGATOR_SEARCH_URL_PATTERNS = [
  /indeed\.com\/jobs\?/i,
  /indeed\.com\/jobs\//i,
  /indeed\.com\/q-/i,
  /glassdoor\.com\/Job\/jobs\.htm/i,
  /glassdoor\.com\/job\/jobs-SRCH/i,
  /glassdoor\.com\/Jobs\//i,
  /linkedin\.com\/jobs\/search/i,
  /linkedin\.com\/jobs\/results/i,
];

function isJobDetailUrl(url) {
  if (!url) return false;
  if (AGGREGATOR_SEARCH_URL_PATTERNS.some(p => p.test(url))) return false;
  return true;
}

async function searchWithTavily(query, depth = 'basic') {
  try {
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: depth,
        max_results: MAX_RESULTS_PER_QUERY,
        include_domains: SEARCH_DOMAINS,
        include_answer: false,
      },
      { timeout: 15000 }
    );
    const results = response.data?.results || [];
    return results.filter(r => isJobDetailUrl(r.url));
  } catch (err) {
    logger.error(`[SCOUT] Tavily search failed for "${query}": ${err.message}`);
    return [];
  }
}

async function extractUrlWithTavily(url) {
  try {
    const response = await axios.post(
      'https://api.tavily.com/extract',
      { api_key: process.env.TAVILY_API_KEY, urls: [url] },
      { timeout: 15000 }
    );
    return response.data?.results?.[0] || null;
  } catch (err) {
    logger.warn(`[SCOUT] Tavily extract failed for "${url}": ${err.message}`);
    return null;
  }
}

function buildSearchQueries(profile, goal = '') {
  const items = [];
  const atsStr = 'site:lever.co OR site:greenhouse.io OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com';
  const adpStr = 'site:myjobs.adp.com OR site:linkedin.com/jobs';

  const goalTerm = (goal || '').trim();
  const profileRoles = (profile.targetRoles || []);

  const roleTerms = [];
  if (goalTerm) roleTerms.push(goalTerm);
  for (const role of profileRoles) {
    const normalised = role.trim();
    if (normalised && !roleTerms.some(r => r.toLowerCase() === normalised.toLowerCase())) {
      roleTerms.push(normalised);
    }
  }

  for (let i = 0; i < roleTerms.length && items.length < 12; i++) {
    const term = roleTerms[i];
    const isGoal = i === 0 && Boolean(goalTerm);
    const depth = isGoal ? 'advanced' : 'basic';
    items.push({ query: `"${term}" remote job ${atsStr}`, depth });
    items.push({ query: `"${term}" apply now ${adpStr}`, depth: 'basic' });
    if (isGoal) {
      items.push({ query: `"${term}" hiring remote ${atsStr}`, depth: 'advanced' });
    }
  }

  const primaryTerm = goalTerm || profileRoles[0] || '';
  if (primaryTerm && items.length < 15) {
    items.push({ query: `"${primaryTerm}" job opening ${atsStr}`, depth: 'basic' });
    items.push({ query: `"${primaryTerm}" remote position ${adpStr}`, depth: 'basic' });
  }

  return items.slice(0, 15);
}

function capitalise(str) {
  return (str || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

// getPlatform now powered by jobSites.js config
const getPlatform = getPlatformFromUrl;

function extractCompany(url, title) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const parts = u.pathname.split('/').filter(Boolean);

    if (host.includes('lever.co')) return capitalise(parts[0] || '');
    if (host.includes('greenhouse.io')) {
      if (host.startsWith('boards.')) return capitalise(parts[0] || '');
      return capitalise(host.replace('.greenhouse.io', ''));
    }
    if (host.includes('ashbyhq.com')) return capitalise(parts[0] || '');
    if (host.includes('myworkdayjobs.com')) return capitalise(host.split('.')[0]);
    if (host.includes('smartrecruiters.com')) return capitalise(parts[1] || parts[0] || '');
    if (host.includes('jobvite.com')) return capitalise(parts[1] || '');
    if (host.includes('myjobs.adp.com')) {
      const adpSlug = parts[0] || '';
      const adpMatch = adpSlug.match(/^(?:cx7_)?(.+?)(?:careers)?$/i);
      if (adpMatch) return capitalise(adpMatch[1]);
    }
    if (host.includes('builtin.com')) return capitalise(parts[1] || '');
  } catch {}

  const atMatch = title.match(/\bat\s+([A-Z][A-Za-z0-9\s&.,']+?)(?:\s*[|\-—]|$)/);
  if (atMatch) return atMatch[1].trim().slice(0, 60);

  const dashMatch = title.match(/[-—]\s*([A-Z][A-Za-z0-9\s&.,]+?)\s*[|]/);
  if (dashMatch) return dashMatch[1].trim().slice(0, 60);

  return 'Unknown';
}

function extractJobTitle(rawTitle, company) {
  let t = rawTitle
    .replace(/\s*[|]\s*(Indeed|Glassdoor|LinkedIn|Lever|Greenhouse|Workday|SmartRecruiters|Jobvite|Built In).*$/i, '')
    .replace(/\s*[-—]\s*(Indeed|Glassdoor|LinkedIn).*$/i, '');

  if (company && company !== 'Unknown') {
    const safeCompany = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t
      .replace(new RegExp(`\\s+at\\s+${safeCompany}.*$`, 'i'), '')
      .replace(new RegExp(`\\s*[-—]\\s*${safeCompany}.*$`, 'i'), '');
  }
  return t.trim().slice(0, 120) || rawTitle.slice(0, 120);
}

function extractLocation(snippet, titleHint = '') {
  const text = `${snippet || ''} ${titleHint || ''}`.trim();
  if (/\bfully\s+remote\b/i.test(text)) return 'Remote';
  if (/\bwork\s+from\s+home\b/i.test(text)) return 'Remote';
  if (/\(remote\)/i.test(text)) return 'Remote';
  if (/\bremote[\s,)]/i.test(text)) {
    if (/\bhybrid\b/i.test(text)) return 'Hybrid (Remote Option)';
    return 'Remote';
  }
  if (/\bhybrid\b/i.test(text)) return 'Hybrid';

  const cityState = text.match(/\b([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})*),\s*([A-Z]{2})\b/);
  if (cityState) return cityState[0];

  const usCity = text.match(/\b(New York|Los Angeles|Chicago|Houston|Dallas|Austin|Seattle|Boston|Denver|Atlanta|San Francisco|Miami|Phoenix|McKinney|Plano|Frisco)\b/i);
  if (usCity) return usCity[0];

  return 'Unspecified';
}

function extractSalary(snippet) {
  const text = snippet || '';
  const range = text.match(/\$[\d,.]+[kK]?\s*[-—to]{1,3}\s*\$[\d,.]+[kK]?/);
  if (range) return range[0];
  const annual = text.match(/\$[\d,.]+[kK]?\s*(?:per\s+year|\/yr|\/year|annual|pa\b)/i);
  if (annual) return annual[0];
  const single = text.match(/\$\d{2,3}[kK]\b/);
  if (single) return single[0];
  return null;
}

const NOISE_PATTERNS = [
  /\bjobs?\s+in\b/i,
  /\bemployment\b/i,
  /\bvacancies?\b/i,
  /\bsalary\b/i,
  /\breviews?\b/i,
];

function scoreFit(jobTitle, location, salary, fullText, profile, goal = '') {
  const targetRoles = (profile.targetRoles || []).map(r => r.toLowerCase());
  const targetLocations = (profile.targetLocations || []).map(l => l.toLowerCase().trim()).filter(Boolean);
  const skills = (profile.skills || []).map(s => s.toLowerCase());
  const jobLower = jobTitle.toLowerCase();
  const textLower = fullText.toLowerCase();

  if (NOISE_PATTERNS.some(p => p.test(jobTitle))) {
    return { titleMatch: 0, locationMatch: 0, salaryMatch: 0, skillsMatch: 0 };
  }

  let titleMatch = 0;

  if (goal) {
    const goalWords = goal.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);
    if (goalWords.length > 0) {
      const goalMatched = goalWords.filter(w => jobLower.includes(w));
      const goalScore = Math.round((goalMatched.length / goalWords.length) * 35);
      if (goalScore > titleMatch) titleMatch = goalScore;
    }
  }

  for (const role of targetRoles) {
    const words = role.split(/\s+/).filter(w => w.length > 2);
    const matched = words.filter(w => jobLower.includes(w));
    const score = Math.round((matched.length / Math.max(words.length, 1)) * 35);
    if (score > titleMatch) titleMatch = score;
  }

  const seniorityWords = ['director', 'head', 'vp', 'vice president', 'chief', 'senior director', 'principal', 'lead', 'manager'];
  const hasSeniority = seniorityWords.some(w => jobLower.includes(w));
  if (!hasSeniority) titleMatch = Math.min(titleMatch, 20);

  let locationMatch = 0;
  const locLower = (location || '').toLowerCase();
  const isRemoteJob = locLower.includes('remote');
  const wantsRemote = profile.remotePreference === 'remote' || profile.remotePreference === 'open';

  if (isRemoteJob && wantsRemote) {
    locationMatch = 25;
  } else {
    for (const tl of targetLocations) {
      if (tl.length > 1 && (locLower.includes(tl) || textLower.includes(tl))) {
        locationMatch = 25;
        break;
      }
    }
    if (locationMatch === 0 && isRemoteJob) locationMatch = 15;
    if (locationMatch === 0 && wantsRemote) locationMatch = 5;
  }

  let salaryMatch = 0;
  if (salary) {
    const nums = (salary.match(/[\d,]+/g) || [])
      .map(n => parseInt(n.replace(/,/g, ''), 10))
      .filter(n => n >= 50);
    const expanded = nums.map(n => n < 1000 ? n * 1000 : n);
    if (expanded.length > 0) {
      const mid = expanded.reduce((a, b) => a + b, 0) / expanded.length;
      const pMin = profile.salaryMin || 0;
      const pMax = profile.salaryMax || 9999999;
      if (mid >= pMin && mid <= pMax) salaryMatch = 20;
      else if (mid >= pMin * 0.75 && mid <= pMax * 1.25) salaryMatch = 10;
    }
  }

  let matched = 0;
  for (const skill of skills) {
    const tokens = skill.split(/[\s&/]+/).filter(w => w.length > 3);
    if (tokens.some(w => textLower.includes(w.toLowerCase()))) matched++;
  }
  const skillsMatch = Math.min(20, Math.round((matched / Math.max(skills.length, 1)) * 20));

  return { titleMatch, locationMatch, salaryMatch, skillsMatch };
}

function extractAndScoreJobs(rawResults, profile, goal = '') {
  const seen = new Set();
  const jobs = [];

  rawResults.forEach((r, i) => {
    if (seen.has(r.url)) return;
    seen.add(r.url);

    const company = extractCompany(r.url, r.title || '');
    const jobTitle = extractJobTitle(r.title || '', company);
    const snippet = (r.snippet || '').slice(0, 400);
    const location = extractLocation(snippet, jobTitle);
    const salary = extractSalary(snippet);
    const platform = getPlatform(r.url);
    const fullText = `${r.title} ${snippet}`.toLowerCase();

    const breakdown = scoreFit(jobTitle, location, salary, fullText, profile, goal);
    const fitScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    if (fitScore < MIN_DISPLAY_SCORE) return;

    if (isExpiredJob(`${r.title} ${snippet}`)) {
      logger.info(`[SCOUT] Skipped expired posting: "${jobTitle}" @ ${company} — ${r.url}`);
      return;
    }

    jobs.push({
      id: `scout-${String(jobs.length + 1).padStart(3, '0')}`,
      title: jobTitle,
      company,
      location,
      url: r.url,
      platform,
      salary: salary || null,
      fitScore,
      fitBreakdown: breakdown,
      snippet,
      postedAt: 'recent',
      approved: false,
      rejected: false,
    });
  });

  return jobs.sort((a, b) => b.fitScore - a.fitScore).slice(0, 20);
}

async function runScout(goal = '') {
  const profile = readJSON(PROFILE_PATH, {});

  if (!profile.targetRoles?.length && !goal.trim()) {
    return { error: 'No target roles found in profile. Please complete your profile setup first.' };
  }

  if (!process.env.TAVILY_API_KEY) {
    return { error: 'TAVILY_API_KEY is not set in .env. Add it to run job searches.' };
  }

  const queries = buildSearchQueries(profile, goal);
  const rawResults = [];

  logger.info(`[SCOUT] Running ${queries.length} Tavily searches in parallel`);
  const searchBatches = await Promise.allSettled(queries.map(({ query, depth }) => {
    logger.info(`[SCOUT] Searching [${depth}]: "${query}"`);
    return searchWithTavily(query, depth);
  }));

  for (const batch of searchBatches) {
    if (batch.status !== 'fulfilled') continue;
    for (const r of batch.value) {
      rawResults.push({
        title: r.title || '',
        url: r.url || '',
        snippet: (r.content || r.snippet || '').slice(0, 400),
      });
    }
  }

  logger.info(`[SCOUT] ${rawResults.length} raw results from Tavily — scoring locally`);

  const scored = filterScoutResults(extractAndScoreJobs(rawResults, profile, goal));

  const today = new Date().toISOString().split('T')[0];
  const ws = getScoutWorkspace();
  const outPath = path.join(ws, `results-${today}.json`);

  const existing = readJSON(outPath, { results: [] });
  const preserved = (existing.results || []).filter(j => j.manuallyImported === true);
  const scoredUrls = new Set(scored.map(j => j.url));
  const uniquePreserved = preserved.filter(j => !scoredUrls.has(j.url));
  const merged = [...scored, ...uniquePreserved].sort((a, b) => b.fitScore - a.fitScore);

  const output = {
    agentId: 'scout',
    runDate: today,
    runTime: new Date().toISOString(),
    totalFound: rawResults.length,
    qualified: merged.filter(j => j.fitScore >= 70).length,
    results: merged,
  };

  writeJSON(outPath, output);
  logger.info(`[SCOUT] Saved ${merged.length} results (${uniquePreserved.length} manual preserved, ${output.qualified} qualified) to ${outPath}`);

  return output;
}

async function importJob({ url, title = '', company = '', salary = '' }) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { error: 'A valid URL is required.' };
  }

  const profile = readJSON(PROFILE_PATH, {});

  let snippet = '';
  let resolvedTitle = title.trim();

  if (process.env.TAVILY_API_KEY) {
    const extracted = await extractUrlWithTavily(url);
    if (extracted) {
      snippet = (extracted.raw_content || '').slice(0, 400);
      if (!resolvedTitle) resolvedTitle = (extracted.title || '').slice(0, 120).trim();
    }
  }

  const resolvedCompany = company.trim() || extractCompany(url, resolvedTitle);
  const jobTitle = resolvedTitle || extractJobTitle(url.split('/').pop() || 'Unknown Role', resolvedCompany);
  const jobSalary = salary.trim() || extractSalary(snippet);
  const location = extractLocation(snippet, jobTitle);
  const platform = getPlatform(url);
  const fullText = `${jobTitle} ${snippet}`.toLowerCase();

  const breakdown = scoreFit(jobTitle, location, jobSalary || null, fullText, profile);
  const fitScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const today = new Date().toISOString().split('T')[0];
  const ws = getScoutWorkspace();
  const outPath = path.join(ws, `results-${today}.json`);

  if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });

  const data = readJSON(outPath, {
    agentId: 'scout',
    runDate: today,
    runTime: new Date().toISOString(),
    totalFound: 0,
    qualified: 0,
    results: [],
  });

  if ((data.results || []).some(j => j.url === url)) {
    return { error: 'This job URL is already in today\'s results.' };
  }

  if (isExpiredJob(`${jobTitle} ${snippet}`)) {
    logger.info(`[SCOUT] Rejected manual import — expired posting: "${jobTitle}" @ ${resolvedCompany} — ${url}`);
    return { error: 'This job posting is no longer accepting applications and cannot be imported.' };
  }

  const newJob = {
    id: `scout-imp-${Date.now()}`,
    title: jobTitle,
    company: resolvedCompany,
    location,
    url,
    platform,
    salary: jobSalary || null,
    fitScore,
    fitBreakdown: breakdown,
    snippet,
    postedAt: 'recent',
    approved: false,
    rejected: false,
    manuallyImported: true,
  };

  data.results = [...(data.results || []), newJob].sort((a, b) => b.fitScore - a.fitScore);
  data.qualified = data.results.filter(j => j.fitScore >= 70).length;
  writeJSON(outPath, data);

  logger.info(`[SCOUT] Manually imported: "${jobTitle}" @ ${resolvedCompany} (fit: ${fitScore}) — ${url}`);
  return newJob;
}

function getLatestResults() {
  const today = new Date().toISOString().split('T')[0];
  return readJSON(path.join(getScoutWorkspace(), `results-${today}.json`), null);
}

function getAllResults() {
  const ws = getScoutWorkspace();
  if (!fs.existsSync(ws)) return [];
  return fs.readdirSync(ws)
    .filter(f => f.startsWith('results-') && f.endsWith('.json'))
    .sort()
    .reverse()
    .map(f => {
      const data = readJSON(path.join(ws, f), null);
      if (!data) return null;
      return {
        runDate: data.runDate,
        runTime: data.runTime || null,
        totalFound: data.totalFound || 0,
        qualified: data.qualified || 0,
        jobCount: (data.results || []).length,
        file: f,
      };
    })
    .filter(Boolean);
}

function getResultsByDate(date) {
  return readJSON(path.join(getScoutWorkspace(), `results-${date}.json`), null);
}

function purgeExpiredJobs(date) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const outPath = path.join(getScoutWorkspace(), `results-${targetDate}.json`);
  const data = readJSON(outPath, null);
  if (!data) return { removed: 0, remaining: 0 };

  const before = (data.results || []).length;
  const kept = (data.results || []).filter(job => {
    const text = `${job.title || ''} ${job.snippet || ''}`;
    if (isExpiredJob(text)) {
      logger.info(`[SCOUT] Purged expired posting: "${job.title}" @ ${job.company} — ${job.url}`);
      return false;
    }
    return true;
  });

  const removed = before - kept.length;
  if (removed > 0) {
    data.results = kept;
    data.qualified = kept.filter(j => j.fitScore >= 70).length;
    writeJSON(outPath, data);
  }

  return { removed, remaining: kept.length };
}

function buildCSV(jobs) {
  const headers = ['#', 'Title', 'Company', 'Location', 'Salary', 'Fit Score', 'Platform', 'Status', 'URL'];
  const rows = jobs.map((j, i) => {
    const status = j.approved ? 'Approved' : j.rejected ? 'Rejected' : 'Pending';
    return [
      i + 1,
      `"${(j.title || '').replace(/"/g, '""')}"`,
      `"${(j.company || '').replace(/"/g, '""')}"`,
      `"${(j.location || '').replace(/"/g, '""')}"`,
      `"${(j.salary || 'Unspecified').replace(/"/g, '""')}"`,
      j.fitScore || 0,
      j.platform || 'direct',
      status,
      `"${(j.url || '').replace(/"/g, '""')}"`,
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

function approveJob(jobId) {
  const today = new Date().toISOString().split('T')[0];
  const outPath = path.join(getScoutWorkspace(), `results-${today}.json`);
  const data = readJSON(outPath, { results: [] });
  const job = data.results?.find(j => j.id === jobId);
  if (job) { job.approved = true; job.rejected = false; writeJSON(outPath, data); }
  return job;
}

function rejectJob(jobId) {
  const today = new Date().toISOString().split('T')[0];
  const outPath = path.join(getScoutWorkspace(), `results-${today}.json`);
  const data = readJSON(outPath, { results: [] });
  const job = data.results?.find(j => j.id === jobId);
  if (job) { job.rejected = true; job.approved = false; writeJSON(outPath, data); }
  return job;
}

module.exports = { runScout, getLatestResults, getAllResults, getResultsByDate, buildCSV, approveJob, rejectJob, importJob, purgeExpiredJobs };
