/**
 * OrbitApply — Job Sites Configuration
 * ─────────────────────────────────────
 * Add or remove job sites here without touching scout.js
 *
 * Each entry:
 *   domain   — the site domain used in Tavily include_domains
 *   name     — short platform label used in the UI and pipeline
 *   type     — 'ats' (direct ATS), 'aggregator', 'specialist', 'direct'
 *   active   — set to false to disable without deleting
 */

const JOB_SITES = [

  // ─── Direct ATS Platforms ─────────────────────────────────────────────────
  { domain: 'lever.co',                name: 'lever',           type: 'ats',        active: true },
  { domain: 'greenhouse.io',           name: 'greenhouse',      type: 'ats',        active: true },
  { domain: 'jobs.ashbyhq.com',        name: 'ashby',           type: 'ats',        active: true },
  { domain: 'myworkdayjobs.com',       name: 'workday',         type: 'ats',        active: true },
  { domain: 'smartrecruiters.com',     name: 'smartrecruiters', type: 'ats',        active: true },
  { domain: 'jobvite.com',             name: 'jobvite',         type: 'ats',        active: true },
  { domain: 'workable.com',            name: 'workable',        type: 'ats',        active: true },
  { domain: 'breezy.hr',              name: 'breezy',          type: 'ats',        active: true },
  { domain: 'apply.workable.com',      name: 'workable',        type: 'ats',        active: true },
  { domain: 'myjobs.adp.com',          name: 'adp',             type: 'ats',        active: true },
  { domain: 'icims.com',               name: 'icims',           type: 'ats',        active: true },
  { domain: 'taleo.net',               name: 'taleo',           type: 'ats',        active: true },
  { domain: 'successfactors.com',      name: 'successfactors',  type: 'ats',        active: true },
  { domain: 'bamboohr.com',            name: 'bamboohr',        type: 'ats',        active: true },
  { domain: 'recruitee.com',           name: 'recruitee',       type: 'ats',        active: true },
  { domain: 'pinpoint.co',             name: 'pinpoint',        type: 'ats',        active: true },
  { domain: 'rippling.com',            name: 'rippling',        type: 'ats',        active: true },

  // ─── Aggregators ──────────────────────────────────────────────────────────
  { domain: 'linkedin.com',            name: 'linkedin',        type: 'aggregator', active: true },
  { domain: 'indeed.com',              name: 'indeed',          type: 'aggregator', active: true },
  { domain: 'glassdoor.com',           name: 'glassdoor',       type: 'aggregator', active: true },
  { domain: 'builtin.com',             name: 'builtin',         type: 'aggregator', active: true },
  { domain: 'wellfound.com',           name: 'wellfound',       type: 'aggregator', active: true },
  { domain: 'simplyhired.com',         name: 'simplyhired',     type: 'aggregator', active: true },
  { domain: 'ziprecruiter.com',        name: 'ziprecruiter',    type: 'aggregator', active: true },
  { domain: 'monster.com',             name: 'monster',         type: 'aggregator', active: true },
  { domain: 'careerbuilder.com',       name: 'careerbuilder',   type: 'aggregator', active: true },
  { domain: 'dice.com',                name: 'dice',            type: 'aggregator', active: true },

  // ─── Tech & AI Specialist Boards ──────────────────────────────────────────
  { domain: 'ycombinator.com',         name: 'ycombinator',     type: 'specialist', active: true },
  { domain: 'remoteok.com',            name: 'remoteok',        type: 'specialist', active: true },
  { domain: 'weworkremotely.com',      name: 'weworkremotely',  type: 'specialist', active: true },
  { domain: 'remotive.com',            name: 'remotive',        type: 'specialist', active: true },
  { domain: 'techjobsforgood.com',     name: 'techjobsforgood', type: 'specialist', active: true },
  { domain: 'ai-jobs.net',             name: 'aijobs',          type: 'specialist', active: true },
  { domain: 'aijobboard.com',          name: 'aijobboard',      type: 'specialist', active: true },

  // ─── Executive & Leadership Boards ────────────────────────────────────────
  { domain: 'theladders.com',          name: 'theladders',      type: 'specialist', active: true },
  { domain: 'execthread.com',          name: 'execthread',      type: 'specialist', active: true },
  { domain: 'chiefexecutive.net',      name: 'chiefexecutive',  type: 'specialist', active: true },

  // ─── Staffing & Recruiting Agencies ───────────────────────────────────────
  { domain: '83zero.com',              name: '83zero',          type: 'direct',     active: true },
  { domain: 'roberthalf.com',          name: 'roberthalf',      type: 'direct',     active: true },
  { domain: 'heidrick.com',            name: 'heidrick',        type: 'direct',     active: true },
  { domain: 'spencerstuart.com',       name: 'spencerstuart',   type: 'direct',     active: true },
  { domain: 'kornferry.com',           name: 'kornferry',       type: 'direct',     active: true },
  { domain: 'michaelpage.com',         name: 'michaelpage',     type: 'direct',     active: true },
  { domain: 'randstad.com',            name: 'randstad',        type: 'direct',     active: true },
  { domain: 'adecco.com',              name: 'adecco',          type: 'direct',     active: true },

];

// ─── Derived exports used by scout.js ────────────────────────────────────────

/** All active domains — passed to Tavily include_domains */
const SEARCH_DOMAINS = JOB_SITES
  .filter(s => s.active)
  .map(s => s.domain);

/** Map from domain keyword → platform name — used by getPlatform() */
const PLATFORM_MAP = JOB_SITES
  .filter(s => s.active)
  .reduce((acc, s) => {
    acc[s.domain] = s.name;
    return acc;
  }, {});

/**
 * Resolve a URL to a platform name.
 * Falls back to 'direct' if no match found.
 */
function getPlatformFromUrl(url) {
  for (const [domain, name] of Object.entries(PLATFORM_MAP)) {
    if (url.includes(domain)) return name;
  }
  return 'direct';
}

module.exports = { JOB_SITES, SEARCH_DOMAINS, PLATFORM_MAP, getPlatformFromUrl };