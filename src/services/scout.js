const path = require('path');
const fs = require('fs');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { filterScoutResults } = require('./guardian');
const { logger } = require('../utils/logger');
const { SEARCH_DOMAINS, getPlatformFromUrl } = require('../config/jobSites');
const { waterfallSearch, waterfallExtract } = require('../utils/searchProvider');
const { FIT_SCORE_MIN } = require('../utils/constants');
const { scanPortals } = require('./portalScan');

const PROFILE_PATH = path.join(__dirname, '..', '..', 'memory', 'profile.json');
const ACTIONS_PATH = path.join(__dirname, '..', '..', 'memory', 'scout-actions.json');
const DEFAULT_WORKSPACE = path.join(__dirname, '..', '..', 'workspace-scout');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');

// Statuses that hide a job from SCOUT results going forward
const HIDDEN_ACTION_STATUSES = new Set(['applied', 'not_interested', 'deleted']);

const MIN_DISPLAY_SCORE = 30;
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
  // ZipRecruiter browse/search pages ("Browse N jobs…") — not a single posting.
  // Real listings live at ziprecruiter.com/c/<company>/Job/… or /jobs/<id>
  /ziprecruiter\.com\/Jobs\/[A-Za-z-]+\/?$/i,
  /ziprecruiter\.com\/candidate\/search/i,
];

function isJobDetailUrl(url) {
  if (!url) return false;
  if (AGGREGATOR_SEARCH_URL_PATTERNS.some(p => p.test(url))) return false;
  return true;
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

// getPlatform powered by jobSites.js config
const getPlatform = getPlatformFromUrl;

// Job boards / aggregators — never a real employer name
const JOB_BOARDS = [
  'ziprecruiter', 'indeed', 'glassdoor', 'linkedin', 'lever', 'greenhouse',
  'workday', 'smartrecruiters', 'jobvite', 'built in', 'builtin', 'bebee',
  'dice', 'monster', 'simplyhired', 'talent.com', 'talent', 'adzuna', 'jooble',
  'careerbuilder', 'snagajob', 'wellfound', 'angellist', 'otta', 'remote.co',
  'we work remotely', 'flexjobs', 'jobright', 'himalayas', 'jobs', 'careers',
  'career site', 'hiring', 'now hiring', 'apply now', 'remote', 'unspecified',
  'remotive', 'virtual vocations', 'icims', 'candidate portal', 'candidate',
  'portal', 'section', 'recruiting', 'recruiter', 'staffing', 'talent acquisition',
  'job opportunity', 'opportunity', 'position', 'opening', 'vacancy',
];

// words that signal the segment is a location / board / generic, not an employer
const COMPANY_REJECT = /\b(?:portal|vocations|remotive|icims|remote|hybrid|onsite|on-site|united states|united kingdom|usa|u\.s\.|europe|apac|emea|anywhere|worldwide|contract|full[- ]time|part[- ]time|freelance|intern(?:ship)?)\b/i;

function cleanCompany(raw) {
  let c = (raw || '')
    .replace(/\b(?:career site|careers|jobs?|openings?|hiring|now hiring)\b/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(?:NOW HIRING|APPLY NOW).*$/i, '')
    .replace(/[,|\-–—:]+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (c.length < 2 || c.length > 50) return null;
  if (c.includes('@') || /\d{2,}/.test(c)) return null;        // domains / pay rates
  if (JOB_BOARDS.includes(c.toLowerCase())) return null;
  if (COMPANY_REJECT.test(c)) return null;
  if (/,/.test(c)) return null;                                 // location-like "City, ST"
  if (c.split(/\s+/).length > 5) return null;                   // too long to be a name
  if (!/[A-Z]/.test(c)) return null;                            // needs a proper-noun cap
  return c;
}

// Last-resort: pull an employer name out of the job snippet/body text.
// Only strong, low-ambiguity signals — noisy nav text must not leak through.
function extractCompanyFromSnippet(snippet) {
  const s = (snippet || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // "@brand.ai" / "brand.io is hiring" — domain-style company handle
  const dom = s.match(/@?\b([a-z][a-z0-9-]{1,30}\.(?:ai|io|com|co|app|dev))\b\s+is\s+hiring/i)
    || s.match(/@\b([a-z][a-z0-9-]{1,30}\.(?:ai|io|com|co|app|dev))\b/i);
  if (dom) {
    const label = dom[1].split('.')[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  // "<Name> is the #1 / a / an / hiring / looking for" — introduces the employer
  const intro = s.match(/\b([A-Z][A-Za-z0-9&.'’-]+(?:\s+[A-Z][A-Za-z0-9&.'’-]+){0,3})\s+is\s+(?:the\s+#?1|an?\s|hiring\b|looking\s+for)/);
  if (intro) {
    const c = cleanCompany(intro[1]);
    if (c) return c;
  }
  return null;
}

function extractCompany(url, title, snippet = '') {
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

  const t = (title || '').trim();

  // "@Company" or "@ Company"  e.g. "[Hiring] … Consultant @Cox Enterprises"
  // (title patterns are tried before the domain fallback below)
  const atSign = t.match(/@\s*([A-Z][\w&.,'’\- ]+?)(?:\s*[|\-–—:]|\s*$)/);
  if (atSign && cleanCompany(atSign[1])) return cleanCompany(atSign[1]);

  // "Company hiring …" / "Company is hiring …"  e.g. "Lenovo hiring Head of AI …"
  const leadHiring = t.match(/^([A-Z][\w&.,'’\- ]+?)\s+(?:is\s+)?hiring\b/i);
  if (leadHiring && cleanCompany(leadHiring[1])) return cleanCompany(leadHiring[1]);

  // "… at Company"
  const atWord = t.match(/\bat\s+([A-Z][\w&.,'’\- ]+?)(?:\s*[|\-–—:]|\s*$)/);
  if (atWord && cleanCompany(atWord[1])) return cleanCompany(atWord[1]);

  // Trailing "- Company" / "— Company" / "| Company" (last segment), e.g.
  // "Senior AI Transformation Consultant - Blue Orange Digital career site"
  const segs = t.split(/\s+[|\-–—]\s+/).map(s => s.trim()).filter(Boolean);
  if (segs.length > 1) {
    for (let i = segs.length - 1; i >= 1; i--) {
      const cand = cleanCompany(segs[i]);
      if (cand) return cand;
    }
  }

  const fromSnippet = extractCompanyFromSnippet(snippet);
  if (fromSnippet) return fromSnippet;

  // Known company-owned career hosts only (jobs.<co>.com / careers.<co>.com).
  // Generic aggregator/ATS domains are intentionally NOT guessed — a wrong
  // company name is worse than "Unknown" since it flows into folders/letters.
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const careerHost = host.match(/^(?:jobs|careers)\.([a-z0-9-]+)\.[a-z.]+$/i);
    const NON_EMPLOYER = [
      'ceipal', 'icims', 'gartner-careers', 'lever', 'greenhouse', 'ashbyhq',
      'smartrecruiters', 'jobvite', 'workday', 'myworkdayjobs', 'adp',
      'euremotejobs', 'dailyremote', 'theirstack', 'jora', 'lensa',
    ];
    if (careerHost && !NON_EMPLOYER.includes(careerHost[1].toLowerCase())
        && careerHost[1].length > 2) {
      return capitalise(careerHost[1]);
    }
  } catch {}

  return 'Unknown';
}

function extractJobTitle(rawTitle, company) {
  let t = (rawTitle || '')
    .replace(/^\s*\[[^\]]*\]\s*/i, '')                 // leading "[Hiring] "
    .replace(/\s*[|]\s*(Indeed|Glassdoor|LinkedIn|Lever|Greenhouse|Workday|SmartRecruiters|Jobvite|Built In|ZipRecruiter).*$/i, '')
    .replace(/\s*[-—]\s*(Indeed|Glassdoor|LinkedIn|ZipRecruiter).*$/i, '')
    .replace(/@\s*[A-Z][\w&.,'’\- ]+$/i, '')           // trailing "@Company"
    .replace(/\b(?:career site|careers)\b/gi, '')      // "… career site"
    .replace(/\s*\(NOW HIRING\).*$/i, '')
    .replace(/^([A-Z][\w&.,'’\- ]+?)\s+(?:is\s+)?hiring\s+/i, ''); // "Lenovo hiring "

  if (company && company !== 'Unknown') {
    const safeCompany = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t
      .replace(new RegExp(`\\s*@\\s*${safeCompany}.*$`, 'i'), '')
      .replace(new RegExp(`\\s+at\\s+${safeCompany}.*$`, 'i'), '')
      .replace(new RegExp(`\\s*[|\\-–—]\\s*${safeCompany}.*$`, 'i'), '');
  }
  t = t
    .replace(/\s*[-–—(]\s*remote\s*\)?\s*$/i, '')   // trailing "- Remote" / "(Remote)"
    .replace(/\s+jobs?\s*$/i, '')                    // trailing " Jobs"
    .replace(/[\s,|\-–—:]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t.slice(0, 120) || (rawTitle || '').slice(0, 120);
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

  // Read seniority and exclude from profile — user-controlled from UI
  const seniorityWords = (profile.seniorityKeywords || [
    'director', 'head', 'vp', 'vice president', 'chief',
    'senior director', 'principal', 'lead', 'manager',
  ]).map(w => w.toLowerCase().trim());

  const excludeTitles = (profile.excludeTitles || [
    'junior', 'entry level', 'intern', 'associate', 'coordinator',
  ]).map(w => w.toLowerCase().trim());

  // Hard exclude — if title contains any excluded word, score zero
  if (excludeTitles.some(w => jobLower.includes(w))) {
    return { titleMatch: 0, locationMatch: 0, salaryMatch: 0, skillsMatch: 0 };
  }

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

  // Seniority check — uses profile-defined keywords
  const hasSeniority = seniorityWords.some(w => jobLower.includes(w));

  // Goal match bypass — if user searched a specific term and it matches title well, skip seniority cap
  const goalMatchesTitle = goal && goal.trim().split(/\s+/).filter(w => w.length > 2)
    .every(w => jobLower.includes(w.toLowerCase()));

  if (!hasSeniority && !goalMatchesTitle) titleMatch = Math.min(titleMatch, 28);

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

  // Use profile-defined min score → orbitapply.json scout.minDisplayScore → hardcoded default
  const cfg = readJSON(CONFIG_PATH, {});
  const minScore = profile.minFitScore ?? cfg?.scout?.minDisplayScore ?? MIN_DISPLAY_SCORE;

  rawResults.forEach((r) => {
    if (seen.has(r.url)) return;
    seen.add(r.url);

    const snippet = (r.snippet || '').slice(0, 400);
    const company = extractCompany(r.url, r.title || '', snippet);
    const jobTitle = extractJobTitle(r.title || '', company);
    const location = extractLocation(snippet, jobTitle);
    const salary = extractSalary(snippet);
    const platform = getPlatform(r.url);
    const fullText = `${r.title} ${snippet}`.toLowerCase();

    const breakdown = scoreFit(jobTitle, location, salary, fullText, profile, goal);
    const fitScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    if (fitScore < minScore) return;

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
      searchProvider: r._provider || 'unknown',
      postedAt: 'recent',
      approved: false,
      rejected: false,
    });
  });

  return jobs.sort((a, b) => b.fitScore - a.fitScore).slice(0, 50);
}

async function runScout(goal = '') {
  const profile = readJSON(PROFILE_PATH, {});

  if (!profile.targetRoles?.length && !goal.trim()) {
    return { error: 'No target roles found in profile. Please complete your profile setup first.' };
  }

  const queries = buildSearchQueries(profile, goal);
  const rawResults = [];

  // Run web searches and direct portal scan in parallel
  logger.info(`[SCOUT] Running ${queries.length} web searches + direct portal scan in parallel`);
  const [searchBatches, portalResults] = await Promise.all([
    Promise.allSettled(queries.map(({ query, depth }) => {
      logger.info(`[SCOUT] Searching [${depth}]: "${query}"`);
      return waterfallSearch(query, depth, SEARCH_DOMAINS);
    })),
    scanPortals(profile.targetRoles || [], goal).catch(err => {
      logger.warn(`[SCOUT] Portal scan failed: ${err.message}`);
      return [];
    }),
  ]);

  for (const batch of searchBatches) {
    if (batch.status !== 'fulfilled') continue;
    for (const r of batch.value) {
      if (isJobDetailUrl(r.url)) rawResults.push(r);
    }
  }

  // Portal results are already individual job URLs — add directly
  for (const r of portalResults) {
    if (r.url && isJobDetailUrl(r.url)) rawResults.push(r);
  }

  logger.info(`[SCOUT] ${rawResults.length} raw results (web + portal) — scoring locally`);

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

  const extracted = await waterfallExtract(url);
  if (extracted) {
    snippet = (extracted.content || '').slice(0, 400);
    if (!resolvedTitle) resolvedTitle = (extracted.title || '').slice(0, 120).trim();
  }

  const resolvedCompany = company.trim() || extractCompany(url, resolvedTitle, snippet);
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

async function importJobFromDoc({ title = '', company = '', salary = '', jdText = '' }) {
  if (!jdText || jdText.trim().length < 50) {
    return { error: 'Document appears to be empty or too short to score.' };
  }

  const profile = readJSON(PROFILE_PATH, {});
  const snippet = jdText.slice(0, 400);
  const fullText = jdText.toLowerCase();

  const firstLine = jdText.split('\n').find(l => l.trim().length > 3)?.slice(0, 80) || 'Unknown Role';
  const resolvedCompany = company.trim() || extractCompanyFromSnippet(snippet);
  const resolvedTitle = title.trim() || extractJobTitle(firstLine, resolvedCompany);
  const jobSalary = salary.trim() || extractSalary(jdText.slice(0, 1000));
  const location = extractLocation(jdText.slice(0, 800), resolvedTitle);

  const breakdown = scoreFit(resolvedTitle, location, jobSalary || null, fullText, profile);
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

  const newJob = {
    id: `scout-imp-doc-${Date.now()}`,
    title: resolvedTitle,
    company: resolvedCompany,
    location,
    url: '',
    platform: 'document',
    salary: jobSalary || null,
    fitScore,
    fitBreakdown: breakdown,
    snippet,
    jdText,
    postedAt: 'recent',
    approved: false,
    rejected: false,
    manuallyImported: true,
  };

  data.results = [...(data.results || []), newJob].sort((a, b) => b.fitScore - a.fitScore);
  data.qualified = data.results.filter(j => j.fitScore >= 70).length;
  writeJSON(outPath, data);

  logger.info(`[SCOUT] Imported from doc: "${resolvedTitle}" @ ${resolvedCompany} (fit: ${fitScore})`);
  return newJob;
}

function getLatestResults() {
  const today = new Date().toISOString().split('T')[0];
  const raw = readJSON(path.join(getScoutWorkspace(), `results-${today}.json`), null);
  return _filterHidden(raw);
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
  const raw = readJSON(path.join(getScoutWorkspace(), `results-${date}.json`), null);
  return _filterHidden(raw);
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
  const headers = ['#', 'Title', 'Company', 'Location', 'Salary', 'Fit Score', 'Platform', 'Provider', 'Status', 'URL'];
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
      j.searchProvider || 'unknown',
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

// ─── PERSISTENT JOB ACTIONS (applied / not_interested / deleted) ──────────────
// Stored in memory/scout-actions.json. Any job whose fingerprint matches an
// entry here is filtered out of SCOUT results — both today's list and future
// runs — so the user only ever sees jobs they haven't yet acted on.
function _normFp(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getJobFingerprint(job) {
  if (!job) return '';
  if (job.url) {
    // Strip tracking params and trailing slash so the same posting fetched
    // by different searches dedups to the same fingerprint.
    return String(job.url).split('?')[0].replace(/\/$/, '').toLowerCase();
  }
  return `t:${_normFp(job.company)}|${_normFp(job.title)}`;
}

function _readActions() {
  return readJSON(ACTIONS_PATH, { actions: {} });
}

function getHiddenFingerprints() {
  const store = _readActions();
  const out = new Set();
  for (const [fp, entry] of Object.entries(store.actions || {})) {
    if (entry && HIDDEN_ACTION_STATUSES.has(entry.status)) out.add(fp);
  }
  return out;
}

function _filterHidden(data) {
  if (!data || !Array.isArray(data.results)) return data;
  const hidden = getHiddenFingerprints();
  const before = data.results.length;
  const visible = data.results.filter(j => {
    // Hide via the new fingerprint-based action store
    if (hidden.has(getJobFingerprint(j))) return false;
    // Also hide legacy Approve/Skip rows so the new 3-button flow has a clean slate
    if (j.approved === true || j.rejected === true) return false;
    return true;
  });
  if (visible.length === before) return data;
  return { ...data, results: visible, hiddenCount: (data.hiddenCount || 0) + (before - visible.length) };
}

function recordJobAction(jobId, status) {
  if (!HIDDEN_ACTION_STATUSES.has(status) && status !== 'cleared') {
    throw new Error(`Invalid action status: ${status}`);
  }
  // Locate the job in today's results (most common). Fall back to scanning
  // recent files so the action still records even if the user is viewing
  // a historical result set.
  const ws = getScoutWorkspace();
  if (!fs.existsSync(ws)) return null;

  const today = new Date().toISOString().split('T')[0];
  const candidates = [
    path.join(ws, `results-${today}.json`),
    ...fs.readdirSync(ws)
      .filter(f => f.startsWith('results-') && f.endsWith('.json'))
      .sort().reverse()
      .map(f => path.join(ws, f)),
  ];

  let job = null;
  let foundPath = null;
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const data = readJSON(p, { results: [] });
    const match = (data.results || []).find(j => j.id === jobId);
    if (match) { job = match; foundPath = p; break; }
  }
  if (!job) return null;

  const fp = getJobFingerprint(job);
  if (!fp) return null;

  const store = _readActions();
  if (status === 'cleared') {
    delete store.actions[fp];
  } else {
    store.actions[fp] = {
      status,
      url: job.url || '',
      title: job.title || '',
      company: job.company || '',
      actionedAt: new Date().toISOString(),
    };
  }
  writeJSON(ACTIONS_PATH, store);

  // Mirror the state onto the stored result row so older code paths still
  // see something sensible (approved=true on applied, rejected=true on the
  // other two). The filter handles hiding at read time regardless.
  if (foundPath) {
    const data = readJSON(foundPath, { results: [] });
    const row = (data.results || []).find(j => j.id === jobId);
    if (row) {
      if (status === 'applied') { row.approved = true; row.rejected = false; }
      else if (status === 'not_interested' || status === 'deleted') {
        row.rejected = true; row.approved = false;
      } else if (status === 'cleared') {
        row.approved = false; row.rejected = false;
      }
      row.action = status;
      writeJSON(foundPath, data);
    }
  }

  return { fingerprint: fp, status, job };
}

// Public read functions get the filtered view
function _getLatestRaw() {
  const today = new Date().toISOString().split('T')[0];
  return readJSON(path.join(getScoutWorkspace(), `results-${today}.json`), null);
}

module.exports = {
  runScout, getLatestResults, getAllResults, getResultsByDate, buildCSV,
  approveJob, rejectJob, importJob, importJobFromDoc, purgeExpiredJobs,
  // Action tracking
  recordJobAction, getJobFingerprint, getHiddenFingerprints,
};
