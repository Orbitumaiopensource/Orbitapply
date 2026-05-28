const express = require('express');
const router = express.Router();
const path = require('path');
const { logger } = require('../utils/logger');
const { readJSON, writeJSON } = require('../utils/fileStore');

const PROFILE_PATH = path.join(__dirname, '..', '..', 'memory', 'profile.json');
const PROTECTED_PATH = path.join(__dirname, '..', '..', 'memory', 'protected.json');
const BLACKLIST_PATH = path.join(__dirname, '..', '..', 'memory', 'blacklist.json');

router.get('/', (req, res) => {
  try {
    res.json(readJSON(PROFILE_PATH, {}));
  } catch (err) {
    logger.error(`GET /profile failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

const STRING_MAX = {
  name: 120, title: 120, email: 254, phone: 30, linkedinUrl: 500,
  website: 500, location: 200, city: 100, state: 100, country: 100,
  workAuthorization: 100, companySize: 50, remotePreference: 20,
  noticePeriod: 50, coverLetterTone: 50, orbitPositioningStatement: 500,
  productionSystems: 4000, techStackText: 4000,
};

const ARRAY_STRING_MAX = {
  targetRoles: 120,
  targetLocations: 120,
  targetIndustries: 120,
  skills: 100,
  seniorityKeywords: 60,
  excludeTitles: 60,
};

function sanitiseProfileField(key, value) {
  if (STRING_MAX[key] !== undefined) {
    if (typeof value !== 'string') return null;
    return value.slice(0, STRING_MAX[key]);
  }
  if (ARRAY_STRING_MAX[key] !== undefined) {
    if (!Array.isArray(value)) return null;
    return value
      .filter(v => typeof v === 'string')
      .map(v => v.slice(0, ARRAY_STRING_MAX[key]).toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  if (['salaryMin', 'salaryMax', 'yearsExperience', 'minFitScore', 'minQualifyScore'].includes(key)) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (key === 'equityAcceptable') {
    return value === true || value === false ? value : null;
  }
  if (key === 'resume') {
    if (value && typeof value === 'object') return value;
    return null;
  }
  return null;
}

router.put('/', (req, res) => {
  try {
    const current = readJSON(PROFILE_PATH, {});
    const body = req.body;

    const ALLOWED_FIELDS = [
      'name', 'title', 'email', 'phone', 'linkedinUrl', 'website',
      'location', 'city', 'state', 'country', 'workAuthorization',
      'targetRoles', 'targetLocations', 'targetIndustries', 'companySize', 'remotePreference',
      'salaryMin', 'salaryMax', 'equityAcceptable', 'noticePeriod', 'skills', 'yearsExperience',
      'resume', 'coverLetterTone', 'orbitPositioningStatement',
      // Search quality controls
      'seniorityKeywords', 'excludeTitles', 'minFitScore', 'minQualifyScore',
      // TAILOR source-material fields (used in resume + cover letter prompts)
      'productionSystems', 'techStackText',
    ];

    const updated = { ...current };
    for (const field of ALLOWED_FIELDS) {
      if (body[field] === undefined) continue;
      const sanitised = sanitiseProfileField(field, body[field]);
      if (sanitised !== null) updated[field] = sanitised;
    }

    writeJSON(PROFILE_PATH, updated);
    res.json(updated);
  } catch (err) {
    logger.error(`PUT /profile failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
});

router.get('/protected', (req, res) => {
  try { res.json(readJSON(PROTECTED_PATH, [])); }
  catch (err) { res.status(500).json({ error: 'Failed to load protected contacts.' }); }
});

router.post('/protected', (req, res) => {
  try {
    const { domain, name, notes } = req.body;
    if (!domain && !name) return res.status(400).json({ error: 'domain or name required.' });
    const list = readJSON(PROTECTED_PATH, []);
    list.push({ domain: domain || '', name: name || '', notes: notes || '', addedAt: new Date().toISOString() });
    writeJSON(PROTECTED_PATH, list);
    res.json(list);
  } catch (err) { res.status(500).json({ error: 'Failed to add protected contact.' }); }
});

router.get('/blacklist', (req, res) => {
  try { res.json(readJSON(BLACKLIST_PATH, [])); }
  catch (err) { res.status(500).json({ error: 'Failed to load blacklist.' }); }
});

router.post('/blacklist', (req, res) => {
  try {
    const { name, domain } = req.body;
    if (!name && !domain) return res.status(400).json({ error: 'name or domain required.' });
    const blacklistData = readJSON(BLACKLIST_PATH, { companies: [] });
    const list = Array.isArray(blacklistData) ? blacklistData : (blacklistData.companies || []);
    list.push({ name: name || '', domain: domain || '', addedAt: new Date().toISOString() });
    writeJSON(BLACKLIST_PATH, { companies: list });
    res.json({ companies: list });
  } catch (err) { res.status(500).json({ error: 'Failed to add to blacklist.' }); }
});

module.exports = router;
