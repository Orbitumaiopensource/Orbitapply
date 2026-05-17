/**
 * OrbitApply — Multi-Provider Search Engine
 * ─────────────────────────────────────────
 * Waterfall fallback: Tavily → Brave → SerpAPI → Bing → Google → DuckDuckGo → Jina
 *
 * Each provider is tried in priority order.
 * If a provider has no API key, returns 0 results, or throws — next provider is tried.
 * DuckDuckGo requires no API key and is always the final fallback.
 *
 * Add keys to .env:
 *   TAVILY_API_KEY
 *   BRAVE_API_KEY
 *   SERPAPI_KEY
 *   BING_SEARCH_KEY
 *   GOOGLE_CSE_KEY + GOOGLE_CSE_ID
 *   JINA_API_KEY (optional — works without key at lower rate limit)
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

// ─── Provider definitions ─────────────────────────────────────────────────────

const PROVIDERS = [
  {
    name: 'tavily',
    envKey: 'TAVILY_API_KEY',
    priority: 1,
    rateLimit: 'paid',
    search: searchTavily,
  },
  {
    name: 'brave',
    envKey: 'BRAVE_API_KEY',
    priority: 2,
    rateLimit: '2000/month free',
    search: searchBrave,
  },
  {
    name: 'serpapi',
    envKey: 'SERPAPI_KEY',
    priority: 3,
    rateLimit: '100/month free',
    search: searchSerpAPI,
  },
  {
    name: 'bing',
    envKey: 'BING_SEARCH_KEY',
    priority: 4,
    rateLimit: '1000/month free',
    search: searchBing,
  },
  {
    name: 'google',
    envKey: 'GOOGLE_CSE_KEY',
    priority: 5,
    rateLimit: '100/day free',
    search: searchGoogle,
  },
  {
    name: 'jina',
    envKey: 'JINA_API_KEY',
    priority: 6,
    rateLimit: 'free tier',
    search: searchJina,
  },
  {
    name: 'duckduckgo',
    envKey: null, // No key required
    priority: 7,
    rateLimit: 'free, no key',
    search: searchDuckDuckGo,
  },
];

// ─── Tavily ───────────────────────────────────────────────────────────────────

async function searchTavily(query, depth = 'basic', domains = []) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  const response = await axios.post(
    'https://api.tavily.com/search',
    {
      api_key: key,
      query,
      search_depth: depth,
      max_results: 15,
      include_domains: domains.length > 0 ? domains : undefined,
      include_answer: false,
    },
    { timeout: 15000 }
  );

  return normalise(response.data?.results || [], 'tavily');
}

// ─── Brave Search ─────────────────────────────────────────────────────────────

async function searchBrave(query, depth = 'basic', domains = []) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];

  // Build site: filter string from domains list
  const siteFilter = domains.length > 0
    ? ' ' + domains.slice(0, 5).map(d => `site:${d}`).join(' OR ')
    : '';

  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': key,
    },
    params: {
      q: `${query}${siteFilter}`,
      count: 15,
      search_lang: 'en',
      country: 'us',
      safesearch: 'off',
      freshness: 'pm', // past month
    },
    timeout: 15000,
  });

  const results = response.data?.web?.results || [];
  return normalise(results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
  })), 'brave');
}

// ─── SerpAPI (Google Search) ──────────────────────────────────────────────────

async function searchSerpAPI(query, depth = 'basic', domains = []) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];

  const siteFilter = domains.length > 0
    ? ' ' + domains.slice(0, 5).map(d => `site:${d}`).join(' OR ')
    : '';

  const response = await axios.get('https://serpapi.com/search', {
    params: {
      engine: 'google',
      q: `${query}${siteFilter}`,
      api_key: key,
      num: 15,
      hl: 'en',
      gl: 'us',
    },
    timeout: 15000,
  });

  const results = response.data?.organic_results || [];
  return normalise(results.map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || '',
  })), 'serpapi');
}

// ─── Bing Search ──────────────────────────────────────────────────────────────

async function searchBing(query, depth = 'basic', domains = []) {
  const key = process.env.BING_SEARCH_KEY;
  if (!key) return [];

  const siteFilter = domains.length > 0
    ? ' ' + domains.slice(0, 5).map(d => `site:${d}`).join(' OR ')
    : '';

  const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
    headers: { 'Ocp-Apim-Subscription-Key': key },
    params: {
      q: `${query}${siteFilter}`,
      count: 15,
      mkt: 'en-US',
      freshness: 'Month',
    },
    timeout: 15000,
  });

  const results = response.data?.webPages?.value || [];
  return normalise(results.map(r => ({
    title: r.name,
    url: r.url,
    snippet: r.snippet || '',
  })), 'bing');
}

// ─── Google Custom Search ─────────────────────────────────────────────────────

async function searchGoogle(query, depth = 'basic', domains = []) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];

  const siteFilter = domains.length > 0
    ? ' ' + domains.slice(0, 3).map(d => `site:${d}`).join(' OR ')
    : '';

  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: {
      key,
      cx,
      q: `${query}${siteFilter}`,
      num: 10,
      lr: 'lang_en',
      dateRestrict: 'm1', // past month
    },
    timeout: 15000,
  });

  const results = response.data?.items || [];
  return normalise(results.map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || '',
  })), 'google');
}

// ─── Jina AI Reader ───────────────────────────────────────────────────────────

async function searchJina(query, depth = 'basic', domains = []) {
  const key = process.env.JINA_API_KEY;

  const headers = {
    'Accept': 'application/json',
    'X-Return-Format': 'json',
  };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const siteFilter = domains.length > 0
    ? ' ' + domains.slice(0, 5).map(d => `site:${d}`).join(' OR ')
    : '';

  const response = await axios.get(`https://s.jina.ai/${encodeURIComponent(`${query}${siteFilter}`)}`, {
    headers,
    timeout: 20000,
  });

  const results = response.data?.data || [];
  return normalise(results.map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || r.content?.slice(0, 400) || '',
  })), 'jina');
}

// ─── DuckDuckGo (no key required) ────────────────────────────────────────────

async function searchDuckDuckGo(query, depth = 'basic', domains = []) {
  const siteFilter = domains.length > 0
    ? ' ' + domains.slice(0, 5).map(d => `site:${d}`).join(' OR ')
    : '';

  // DuckDuckGo instant answer API (free, no key)
  const response = await axios.get('https://api.duckduckgo.com/', {
    params: {
      q: `${query}${siteFilter}`,
      format: 'json',
      no_html: 1,
      skip_disambig: 1,
    },
    timeout: 15000,
  });

  const data = response.data || {};
  const results = [
    ...(data.Results || []),
    ...(data.RelatedTopics || []).filter(t => t.FirstURL),
  ];

  return normalise(results.map(r => ({
    title: r.Text || r.Result || '',
    url: r.FirstURL || '',
    snippet: r.Text || '',
  })).filter(r => r.url), 'duckduckgo');
}

// ─── Normalise results to common format ──────────────────────────────────────

function normalise(results, provider) {
  return results
    .filter(r => r.url && r.url.startsWith('http'))
    .map(r => ({
      title: (r.title || '').trim().slice(0, 200),
      url: (r.url || '').trim(),
      snippet: (r.snippet || r.content || '').trim().slice(0, 400),
      _provider: provider,
    }));
}

// ─── Main waterfall search ────────────────────────────────────────────────────

/**
 * Run a search query through all providers in priority order.
 * Returns results from the first provider that returns data.
 * Falls through to the next if a provider fails or returns nothing.
 *
 * @param {string} query — search query string
 * @param {string} depth — 'basic' or 'advanced' (Tavily only; others ignore)
 * @param {string[]} domains — optional list of domains to restrict results
 * @returns {Promise<Array>} — normalised results array
 */
async function waterfallSearch(query, depth = 'basic', domains = []) {
  for (const provider of PROVIDERS) {
    // Skip if key required but not set
    if (provider.envKey && !process.env[provider.envKey]) {
      logger.debug(`[SEARCH] Skipping ${provider.name} — no API key set`);
      continue;
    }

    try {
      logger.debug(`[SEARCH] Trying ${provider.name} for: "${query}"`);
      const results = await provider.search(query, depth, domains);

      if (results && results.length > 0) {
        logger.info(`[SEARCH] ${provider.name} returned ${results.length} results for: "${query.slice(0, 60)}"`);
        return results;
      }

      logger.debug(`[SEARCH] ${provider.name} returned 0 results — trying next provider`);
    } catch (err) {
      logger.warn(`[SEARCH] ${provider.name} failed: ${err.message} — trying next provider`);
    }
  }

  logger.warn(`[SEARCH] All providers exhausted for: "${query}" — returning empty`);
  return [];
}

/**
 * Extract/fetch a single URL's content.
 * Tries Tavily extract first, falls back to Jina reader, then raw axios GET.
 *
 * @param {string} url
 * @returns {Promise<{title: string, content: string} | null>}
 */
// `maxChars` defaults to 2000 to preserve existing callers (SCOUT snippet
// only takes 400 anyway). Pass { maxChars: 0 } for the full page text
// (used by TAILOR's Job Description PDF).
async function waterfallExtract(url, { maxChars = 2000 } = {}) {
  const clip = (s) => {
    const str = String(s || '');
    return maxChars > 0 ? str.slice(0, maxChars) : str;
  };
  // 1. Tavily extract
  if (process.env.TAVILY_API_KEY) {
    try {
      const response = await axios.post(
        'https://api.tavily.com/extract',
        { api_key: process.env.TAVILY_API_KEY, urls: [url] },
        { timeout: 15000 }
      );
      const result = response.data?.results?.[0];
      if (result?.raw_content) {
        logger.debug(`[SEARCH] Extracted via Tavily: ${url}`);
        return { title: result.title || '', content: clip(result.raw_content) };
      }
    } catch (err) {
      logger.debug(`[SEARCH] Tavily extract failed: ${err.message}`);
    }
  }

  // 2. Jina reader
  try {
    const headers = { 'Accept': 'application/json', 'X-Return-Format': 'json' };
    if (process.env.JINA_API_KEY) headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;

    const response = await axios.get(`https://r.jina.ai/${url}`, {
      headers,
      timeout: 20000,
    });
    const data = response.data?.data;
    if (data?.content) {
      logger.debug(`[SEARCH] Extracted via Jina: ${url}`);
      return { title: data.title || '', content: clip(data.content) };
    }
  } catch (err) {
    logger.debug(`[SEARCH] Jina extract failed: ${err.message}`);
  }

  // 3. Raw axios GET (last resort)
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OrbitApply/1.0)' },
    });
    const text = clip((response.data || '').toString().replace(/<[^>]+>/g, ' '));
    logger.debug(`[SEARCH] Extracted via raw GET: ${url}`);
    return { title: '', content: text };
  } catch (err) {
    logger.warn(`[SEARCH] All extract methods failed for: ${url}`);
    return null;
  }
}

/**
 * Returns a list of all configured providers and their status.
 * Useful for the UI to show which providers are active.
 */
function getProviderStatus() {
  return PROVIDERS.map(p => ({
    name: p.name,
    priority: p.priority,
    rateLimit: p.rateLimit,
    active: p.envKey ? Boolean(process.env[p.envKey]) : true,
    requiresKey: Boolean(p.envKey),
  }));
}

module.exports = { waterfallSearch, waterfallExtract, getProviderStatus };
