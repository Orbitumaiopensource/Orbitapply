const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { logger, actionLogger } = require('../utils/logger');

const PROFILE_PATH = path.join(__dirname, '..', '..', 'memory', 'profile.json');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');
const SUBMIT_DIR = path.join(__dirname, '..', '..', 'workspace-submit');
const PIPELINE_PATH = path.join(__dirname, '..', '..', 'workspace-ledger', 'pipeline.json');

const HUMAN_PAUSE_LABELS = [
  // Salary / compensation
  'salary', 'compensation', 'pay rate', 'wage', 'desired salary', 'expected salary',
  'salary expectation', 'minimum salary', 'current salary', 'base salary',
  // Self-ID — disability
  'disability', 'disabled', 'self-identification of disability', 'self identification',
  'accommodation',
  // Gender
  'gender', 'gender identity', 'pronoun',
  // Race / ethnicity
  'race', 'ethnicity', 'racial', 'ethnic background', 'national origin',
  // Veteran
  'veteran', 'military', 'protected veteran', 'military status', 'armed forces',
  'military service',
  // Diversity / EEO
  'diversity', 'equal opportunity', 'eeoc', 'eeo', 'affirmative action',
  // Signature / certification
  'signature', 'sign here', 'certify', 'certification', 'attestation',
  'i certify', 'i attest', 'electronic signature', 'esignature',
  // Date fields tied to legal certification
  'date of signature', 'sign date', 'today\'s date',
  // Security
  'security clearance', 'clearance',
  // Essays
  'essay', 'personal statement',
];

const FIELD_WHITELIST = [
  'first name', 'last name', 'full name', 'name',
  'email', 'e-mail', 'email address',
  'phone', 'mobile', 'telephone',
  'linkedin', 'linkedin url', 'linkedin profile',
  'location', 'city', 'state', 'country', 'zip', 'postal',
  'website', 'portfolio',
  'work authorization', 'authorized to work', 'visa',
  'resume', 'cv', 'upload resume',
  'cover letter',
  'years of experience',
];

const SUBMIT_RESULT_DEFAULTS = {
  agentId: 'submit',
  jobId: null,
  platform: 'direct',
  status: 'pending',
  submittedAt: null,
  screenshots: [],
  pausedFields: [],
  error: null,
};

function loadConfig() {
  return readJSON(CONFIG_PATH, {});
}

function loadProfile() {
  return readJSON(PROFILE_PATH, {});
}

function detectPlatform(url) {
  if (!url) return 'direct';
  const u = url.toLowerCase();
  if (u.includes('greenhouse.io')) return 'greenhouse';
  if (u.includes('lever.co')) return 'lever';
  if (u.includes('ashbyhq.com') || u.includes('ashby.io')) return 'ashby';
  if (u.includes('myworkdayjobs.com') || u.includes('workday.com')) return 'workday';
  if (u.includes('icims.com')) return 'icims';
  if (u.includes('smartrecruiters.com')) return 'smartrecruiters';
  return 'direct';
}

function getSubmitLogPath(jobId) {
  return path.join(SUBMIT_DIR, `${jobId}-log.json`);
}

function getScreenshotPath(jobId, pageNum) {
  return path.join(SUBMIT_DIR, `${jobId}-page-${pageNum}.png`);
}

function ensureSubmitDir() {
  if (!fs.existsSync(SUBMIT_DIR)) fs.mkdirSync(SUBMIT_DIR, { recursive: true });
}

function writeSubmitLog(jobId, result) {
  ensureSubmitDir();
  writeJSON(getSubmitLogPath(jobId), result);
}

function getSubmitLog(jobId) {
  return readJSON(getSubmitLogPath(jobId), null);
}

function updateLedgerSubmitted(pipelineId, submittedAt) {
  try {
    const pipeline = readJSON(PIPELINE_PATH, { applications: [] });
    const app = pipeline.applications.find(a => a.id === pipelineId);
    if (app) {
      app.submittedAt = submittedAt;
      app.updatedAt = new Date().toISOString();
      writeJSON(PIPELINE_PATH, pipeline);
      logger.info(`[SUBMIT] Ledger updated — submittedAt for ${pipelineId}`);
    }
  } catch (err) {
    logger.error(`[SUBMIT] Failed to update ledger for ${pipelineId}: ${err.message}`);
  }
}

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';
  return { firstName, lastName };
}

function isSensitiveLabel(labelText) {
  const lower = (labelText || '').toLowerCase();
  return HUMAN_PAUSE_LABELS.some(kw => lower.includes(kw));
}

function isWhitelistedLabel(labelText) {
  const lower = (labelText || '').toLowerCase();
  return FIELD_WHITELIST.some(kw => lower.includes(kw));
}

async function takeScreenshot(page, jobId, pageNum, screenshots) {
  try {
    const screenshotPath = getScreenshotPath(jobId, pageNum);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    screenshots.push(screenshotPath);
    logger.info(`[SUBMIT] Screenshot saved: ${screenshotPath}`);
  } catch (err) {
    logger.warn(`[SUBMIT] Screenshot failed (page ${pageNum}): ${err.message}`);
  }
}

async function humanDelay(minMs = 800, maxMs = 2500) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise(r => setTimeout(r, delay));
}

async function fillInputByLabel(page, labelText, value) {
  if (!value) return false;
  try {
    const input = page.locator(`input, textarea, select`).filter({ hasText: '' }).first();
    const byLabel = page.getByLabel(new RegExp(labelText, 'i'));
    if (await byLabel.count() > 0) {
      const tag = await byLabel.first().evaluate(el => el.tagName.toLowerCase());
      if (tag === 'select') {
        await byLabel.first().selectOption({ label: value }).catch(() => {});
      } else {
        await byLabel.first().fill(value);
      }
      await humanDelay(300, 800);
      return true;
    }
    void input;
    return false;
  } catch {
    return false;
  }
}

async function uploadFile(page, filePath, labelPatterns) {
  if (!filePath || !fs.existsSync(filePath)) {
    logger.warn(`[SUBMIT] File not found for upload: ${filePath}`);
    return false;
  }

  try {
    // Strategy 1: find file input associated with a matching label
    for (const pattern of labelPatterns) {
      const byLabel = page.getByLabel(new RegExp(pattern, 'i'));
      if (await byLabel.count() > 0) {
        const inputType = await byLabel.first().evaluate(el => el.getAttribute('type')).catch(() => null);
        if (inputType === 'file') {
          await byLabel.first().setInputFiles(filePath);
          await humanDelay(600, 1200);
          logger.info(`[SUBMIT] File uploaded via label "${pattern}": ${filePath}`);
          return true;
        }
      }
    }

    // Strategy 2: find any visible file input near a matching label text in DOM
    const fileInputs = page.locator('input[type="file"]');
    const count = await fileInputs.count();
    for (let i = 0; i < count; i++) {
      const input = fileInputs.nth(i);
      // Look at surrounding DOM for label text
      const ariaLabel = await input.getAttribute('aria-label').catch(() => '');
      const name = await input.getAttribute('name').catch(() => '');
      const id = await input.getAttribute('id').catch(() => '');
      const combined = `${ariaLabel} ${name} ${id}`.toLowerCase();
      const matches = labelPatterns.some(p => combined.includes(p.toLowerCase()));
      if (matches) {
        await input.setInputFiles(filePath);
        await humanDelay(600, 1200);
        logger.info(`[SUBMIT] File uploaded via attribute match (name/id/aria): ${filePath}`);
        return true;
      }
    }

    // Strategy 3: if only one file input on page, use it for the first upload attempt
    if (count === 1 && labelPatterns.some(p => /resume|cv/i.test(p))) {
      await fileInputs.first().setInputFiles(filePath);
      await humanDelay(600, 1200);
      logger.info(`[SUBMIT] File uploaded to sole file input: ${filePath}`);
      return true;
    }

    logger.warn(`[SUBMIT] No file input found for patterns: ${labelPatterns.join(', ')}`);
    return false;
  } catch (err) {
    logger.warn(`[SUBMIT] File upload failed for ${filePath}: ${err.message}`);
    return false;
  }
}

async function fillResumeField(page, resumePath, resumeText) {
  // Try file upload first (preferred — what ATS platforms actually want)
  const uploaded = await uploadFile(page, resumePath, ['resume', 'cv', 'upload resume', 'upload cv', 'attach resume']);
  if (uploaded) return;

  // Fallback: paste text into textarea if file upload not found
  if (!resumeText) return;
  try {
    const resumeArea = page.getByLabel(/resume|cv/i).first();
    if (await resumeArea.count() > 0) {
      const tag = await resumeArea.evaluate(el => el.tagName.toLowerCase());
      if (tag === 'textarea') {
        await resumeArea.fill(resumeText.slice(0, 5000));
        await humanDelay(400, 900);
        logger.info('[SUBMIT] Resume text pasted into textarea (no file input found)');
      }
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Resume textarea fallback failed: ${err.message}`);
  }
}

async function fillCoverLetterField(page, coverPath, coverText) {
  // Try file upload first
  const uploaded = await uploadFile(page, coverPath, ['cover letter', 'cover_letter', 'coverletter', 'attach cover', 'upload cover']);
  if (uploaded) return;

  // Fallback: paste text into textarea
  if (!coverText) return;
  try {
    const coverArea = page.getByLabel(/cover letter/i).first();
    if (await coverArea.count() > 0) {
      const tag = await coverArea.evaluate(el => el.tagName.toLowerCase());
      if (tag === 'textarea') {
        await coverArea.fill(coverText.slice(0, 3000));
        await humanDelay(400, 900);
        logger.info('[SUBMIT] Cover letter text pasted into textarea (no file input found)');
      }
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Cover letter textarea fallback failed: ${err.message}`);
  }
}

async function fillStandardFields(page, profile, resumePath, coverPath, resumeText, coverText) {
  const { firstName, lastName } = splitName(profile.name);
  const fieldMap = [
    { labels: ['first name', 'given name'], value: firstName },
    { labels: ['last name', 'family name', 'surname'], value: lastName },
    { labels: ['full name', 'your name'], value: profile.name },
    { labels: ['email', 'e-mail', 'email address'], value: profile.email },
    { labels: ['phone', 'mobile', 'telephone', 'cell'], value: profile.phone || '' },
    { labels: ['linkedin', 'linkedin url', 'linkedin profile'], value: profile.linkedinUrl || '' },
    { labels: ['city'], value: profile.city || '' },
    { labels: ['state'], value: profile.state || '' },
    { labels: ['location', 'address'], value: profile.location || '' },
    { labels: ['country'], value: profile.country || 'United States' },
    { labels: ['website', 'portfolio', 'personal website'], value: profile.website || '' },
    { labels: ['years of experience', 'experience'], value: String(profile.yearsExperience || '') },
  ];

  for (const { labels, value } of fieldMap) {
    if (!value) continue;
    for (const label of labels) {
      const filled = await fillInputByLabel(page, label, value);
      if (filled) break;
    }
  }

  await fillResumeField(page, resumePath, resumeText);
  await fillCoverLetterField(page, coverPath, coverText);
}

const CANONICAL_FIELD_MAP = [
  { canonical: 'Desired Salary',                    patterns: ['salary', 'compensation', 'pay rate', 'wage', 'desired salary', 'expected salary', 'base salary'] },
  { canonical: 'Self-Identification of Disability', patterns: ['disability', 'disabled', 'self-identification of disability', 'self identification'] },
  { canonical: 'Gender',                            patterns: ['gender', 'gender identity', 'pronoun'] },
  { canonical: 'Race / Ethnicity',                  patterns: ['race', 'ethnicity', 'racial', 'ethnic background', 'national origin'] },
  { canonical: 'Veteran Status',                    patterns: ['veteran', 'military status', 'vevraa', 'protected veteran', 'military service', 'armed forces'] },
  { canonical: 'Security Clearance',                patterns: ['security clearance', 'clearance required', 'secret clearance'] },
  { canonical: 'Essay / Personal Statement',        patterns: ['essay', 'personal statement'] },
  { canonical: 'Electronic Signature',              patterns: ['signature', 'sign here', 'certify', 'certification', 'attestation', 'electronic signature', 'esignature', 'i certify', 'i attest'] },
  { canonical: 'Signature Date',                    patterns: ['date of signature', 'sign date', 'today\'s date', 'signature date'] },
];

function toCanonicalField(labelText) {
  const lower = (labelText || '').toLowerCase().trim();
  for (const { canonical, patterns } of CANONICAL_FIELD_MAP) {
    if (patterns.some(p => lower.includes(p))) return canonical;
  }
  return null;
}

async function scanForSensitiveFields(page) {
  const found = new Set();
  try {
    // Only scan <label> elements — never <option>, never element content
    const labelEls = await page.locator('label').all();
    for (const labelEl of labelEls) {
      const text = await labelEl.textContent().catch(() => '');
      const canonical = toCanonicalField(text);
      if (canonical) found.add(canonical);
    }

    // Also scan aria-label and placeholder attributes on inputs/textareas
    const inputs = await page.locator('input:not([type="file"]):not([type="hidden"]):not([type="submit"]), textarea').all();
    for (const input of inputs) {
      const ariaLabel = await input.getAttribute('aria-label').catch(() => '');
      const placeholder = await input.getAttribute('placeholder').catch(() => '');
      for (const text of [ariaLabel, placeholder]) {
        const canonical = toCanonicalField(text);
        if (canonical) found.add(canonical);
      }
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Error scanning for sensitive fields: ${err.message}`);
  }

  // Remove fields that are in the whitelist (safe auto-fill fields)
  return [...found].filter(f => !isWhitelistedLabel(f));
}

const CANONICAL_FILL_PATTERNS = {
  'Desired Salary': ['salary', 'compensation', 'pay rate', 'wage', 'desired salary', 'expected salary', 'base salary', 'what is your desired', 'annual salary'],
  'Self-Identification of Disability': ['disability', 'self-identification of disability', 'self identification', 'disabled'],
  'Gender': ['gender', 'gender identity'],
  'Race / Ethnicity': ['race', 'ethnicity', 'racial', 'ethnic'],
  'Veteran Status': ['veteran', 'military status', 'protected veteran', 'vevraa'],
  'Electronic Signature': ['signature', 'sign here', 'certify', 'attestation', 'electronic signature', 'esignature', 'i certify', 'i attest', 'legal name'],
  'Signature Date': ['date of signature', 'sign date', 'today\'s date', 'signature date'],
};

async function clickRadioByValue(page, groupPatterns, value) {
  // Find a radio button whose visible label text best matches the value string
  const radios = page.locator('input[type="radio"]');
  const count = await radios.count();
  const valueLower = value.toLowerCase();

  for (let i = 0; i < count; i++) {
    const radio = radios.nth(i);
    try {
      // Get surrounding label text via DOM
      const labelText = await radio.evaluate(el => {
        const lbl = el.labels?.[0]?.textContent || el.closest('label')?.textContent || el.getAttribute('aria-label') || '';
        return lbl.trim().toLowerCase();
      }).catch(() => '');

      const nearbyText = await radio.evaluate(el => {
        const parent = el.parentElement?.textContent || '';
        return parent.trim().toLowerCase();
      }).catch(() => '');

      const combined = `${labelText} ${nearbyText}`;
      const groupMatch = groupPatterns.some(p => combined.includes(p.toLowerCase()));
      const valueMatch = combined.includes(valueLower) || valueLower.includes(labelText.slice(0, 20));

      if (groupMatch && valueMatch) {
        await radio.check();
        await humanDelay(300, 700);
        logger.info(`[SUBMIT] Radio checked for label: "${labelText}"`);
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

async function fillApprovedSensitiveField(page, canonicalName, value) {
  if (!value) return false;
  const patterns = CANONICAL_FILL_PATTERNS[canonicalName] || [canonicalName.toLowerCase()];

  // ── Try radio buttons first (disability, gender, veteran — all use radio groups) ──
  const radioFilled = await clickRadioByValue(page, patterns, value);
  if (radioFilled) {
    logger.info(`[SUBMIT] Filled approved field "${canonicalName}" via radio button`);
    return true;
  }

  // ── Try standard label-based fill (text inputs, selects, date) ──
  for (const pattern of patterns) {
    try {
      const byLabel = page.getByLabel(new RegExp(pattern, 'i'));
      const count = await byLabel.count();
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const el = byLabel.nth(i);
          const tag = await el.evaluate(n => n.tagName.toLowerCase()).catch(() => 'input');
          const type = await el.getAttribute('type').catch(() => 'text');
          try {
            if (type === 'radio') {
              // Radio: check if value matches this specific option
              const lbl = await el.evaluate(n => n.labels?.[0]?.textContent || n.getAttribute('aria-label') || '').catch(() => '');
              if (lbl.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(lbl.toLowerCase().slice(0, 15))) {
                await el.check();
              }
            } else if (tag === 'select') {
              await el.selectOption({ label: value }).catch(() =>
                el.selectOption({ value }).catch(() => {})
              );
            } else if (type === 'date') {
              await el.fill(value);
            } else if (tag === 'textarea' || tag === 'input') {
              await el.fill(String(value));
            }
            await humanDelay(300, 700);
          } catch { /* try next element */ }
        }
        logger.info(`[SUBMIT] Filled approved field "${canonicalName}" via label pattern "${pattern}"`);
        return true;
      }
    } catch (err) {
      logger.warn(`[SUBMIT] Pattern "${pattern}" failed for "${canonicalName}": ${err.message}`);
    }
  }
  logger.warn(`[SUBMIT] Could not find form element for approved field: ${canonicalName}`);
  return false;
}

async function fillFieldValues(page, fieldValues = {}) {
  for (const [fieldName, value] of Object.entries(fieldValues)) {
    if (!value) continue;
    const canonical = toCanonicalField(fieldName) || fieldName;
    await fillApprovedSensitiveField(page, canonical, String(value));
  }
}

function getUncoveredSensitiveFields(detectedFields, fieldValues) {
  const coveredCanonicals = new Set(
    Object.keys(fieldValues)
      .map(k => toCanonicalField(k) || k)
      .filter(Boolean)
  );
  return detectedFields.filter(f => !coveredCanonicals.has(f));
}

async function fillAshbyForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId, dryRun = false) {
  logger.info('[SUBMIT] Filling Ashby form');
  let pageNum = 1;
  const config = loadConfig();

  await humanDelay(2000, 4000);

  // ── Navigate to the Application tab if present (Ashby job pages have Overview / Application tabs) ──
  try {
    const appTab = page.locator('a, button, [role="tab"]').filter({ hasText: /^application$/i }).first();
    if (await appTab.count() > 0) {
      logger.info('[SUBMIT] Ashby: Clicking Application tab');
      await appTab.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await humanDelay(2000, 3500);
    } else {
      // Also try clicking "Apply" button which some Ashby pages show on the overview
      const applyBtn = page.locator('a, button').filter({ hasText: /^apply$/i }).first();
      if (await applyBtn.count() > 0) {
        logger.info('[SUBMIT] Ashby: Clicking Apply button');
        await applyBtn.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await humanDelay(2000, 3500);
      }
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Ashby: Could not click Application tab: ${err.message}`);
  }

  // ── Standard text/select fields (name, email, phone, linkedin, work auth) ──
  const { firstName, lastName } = splitName(profile.name);
  const standardTextFields = [
    { labels: ['first name', 'given name'], value: firstName },
    { labels: ['last name', 'family name', 'surname'], value: lastName },
    { labels: ['full name', 'your name'], value: profile.name },
    { labels: ['email', 'e-mail', 'email address'], value: profile.email },
    { labels: ['phone', 'phone number', 'mobile', 'telephone', 'cell'], value: profile.phone || '' },
    { labels: ['linkedin', 'linkedin url', 'linkedin profile'], value: profile.linkedinUrl || '' },
    { labels: ['website', 'portfolio', 'personal website'], value: profile.website || '' },
    { labels: ['years of experience', 'experience'], value: String(profile.yearsExperience || '') },
  ];

  for (const { labels, value } of standardTextFields) {
    if (!value) continue;
    for (const label of labels) {
      const filled = await fillInputByLabel(page, label, value);
      if (filled) break;
    }
  }

  // ── Location: Ashby uses a typeahead — type, wait, select first suggestion ──
  const locationValue = profile.city && profile.state
    ? `${profile.city}, ${profile.state}`
    : profile.location || '';

  if (locationValue) {
    try {
      const locationInput = page.getByLabel(/^location/i).first();
      if (await locationInput.count() > 0) {
        await locationInput.click();
        await humanDelay(300, 600);
        await locationInput.fill(locationValue);
        await humanDelay(1500, 2500); // Wait for typeahead results
        // Try clicking the first dropdown suggestion
        const suggestion = page.locator('[role="option"],[role="listbox"] li,.pac-item,.suggestions li').first();
        if (await suggestion.count() > 0) {
          await suggestion.click();
        } else {
          await locationInput.press('ArrowDown');
          await humanDelay(400, 700);
          await locationInput.press('Enter');
        }
        await humanDelay(500, 1000);
        logger.info(`[SUBMIT] Ashby: Location filled with "${locationValue}"`);
      }
    } catch (err) {
      logger.warn(`[SUBMIT] Ashby: Location fill failed: ${err.message}`);
    }
  }

  // ── File uploads: use index-based approach (1st input = resume, 2nd = cover letter) ──
  try {
    const fileInputs = page.locator('input[type="file"]');
    const fileCount = await fileInputs.count();
    logger.info(`[SUBMIT] Ashby: Found ${fileCount} file input(s)`);

    if (fileCount >= 1 && resumePath && fs.existsSync(resumePath)) {
      await fileInputs.nth(0).setInputFiles(resumePath);
      await humanDelay(1000, 2000);
      logger.info(`[SUBMIT] Ashby: Resume uploaded: ${resumePath}`);
    } else if (fileCount >= 1) {
      logger.warn(`[SUBMIT] Ashby: Resume file not found at: ${resumePath}`);
    }

    if (fileCount >= 2 && coverPath && fs.existsSync(coverPath)) {
      await fileInputs.nth(1).setInputFiles(coverPath);
      await humanDelay(1000, 2000);
      logger.info(`[SUBMIT] Ashby: Cover letter uploaded: ${coverPath}`);
    } else if (fileCount >= 2) {
      logger.warn(`[SUBMIT] Ashby: Cover letter file not found at: ${coverPath}`);
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Ashby: File upload failed: ${err.message}`);
  }

  // ── Approved sensitive fields (salary, disability, gender, veteran, etc.) ──
  await fillFieldValues(page, fieldValues);
  await humanDelay(1000, 2000);

  // ── Check for any genuinely unanswered sensitive fields ──
  const sensitive = await scanForSensitiveFields(page);
  const uncovered = getUncoveredSensitiveFields(sensitive, fieldValues);
  if (uncovered.length > 0) {
    logger.info(`[SUBMIT] Ashby: ${uncovered.length} unanswered field(s): ${uncovered.join(', ')}`);
    if (config?.submit?.screenshotOnEachPage) {
      await takeScreenshot(page, jobId, pageNum++, screenshots);
    }
    return { paused: true, pausedFields: uncovered };
  }

  // ── Screenshot before final submit ──
  if (config?.submit?.screenshotOnEachPage) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
  }

  // ── Dry run: form is filled — stop before clicking Submit ──
  if (dryRun) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
    logger.info('[SUBMIT] Ashby: dry run — form filled, Submit NOT clicked');
    return { paused: false, submitted: false, dryRun: true, error: 'Dry run — form filled; final Submit not clicked. Review screenshots, then submit from Auto-Apply.' };
  }

  // ── Submit ──
  try {
    const submitBtn = page
      .locator('button[type="submit"], input[type="submit"], button')
      .filter({ hasText: /submit application|apply now|submit|send application/i })
      .first();
    if (await submitBtn.count() > 0) {
      logger.info('[SUBMIT] Ashby: Clicking submit button');
      await humanDelay(1500, 3000);
      await submitBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await humanDelay(2500, 4000);

      if (config?.submit?.screenshotOnEachPage) {
        await takeScreenshot(page, jobId, pageNum++, screenshots);
      }

      // ── Verify submission succeeded by checking for confirmation page ──
      const currentUrl = page.url();
      const pageText = await page.locator('body').textContent().catch(() => '');
      const pageTextLower = pageText.toLowerCase();

      const confirmed = (
        pageTextLower.includes('thank you') ||
        pageTextLower.includes('application received') ||
        pageTextLower.includes('successfully submitted') ||
        pageTextLower.includes('application submitted') ||
        pageTextLower.includes('we have received') ||
        pageTextLower.includes('you\'ve applied') ||
        pageTextLower.includes('application complete') ||
        currentUrl.includes('confirmation') ||
        currentUrl.includes('success') ||
        currentUrl.includes('thank')
      );

      // Check for visible validation errors
      const hasError = (
        pageTextLower.includes('required') ||
        pageTextLower.includes('please fill') ||
        pageTextLower.includes('this field') ||
        pageTextLower.includes('invalid')
      );

      if (confirmed) {
        logger.info('[SUBMIT] Ashby: Submission confirmed by page content');
        return { paused: false, submitted: true };
      } else if (hasError) {
        logger.warn('[SUBMIT] Ashby: Validation error detected on post-submit page');
        return { paused: false, submitted: false, error: 'Ashby form submitted but validation error detected — review screenshot and submit manually' };
      } else {
        logger.warn('[SUBMIT] Ashby: Submit button clicked but confirmation page not detected — may need manual verification');
        return { paused: false, submitted: false, error: 'Submit button clicked — confirmation not detected. Check your email or the job URL to verify.' };
      }
    } else {
      logger.warn('[SUBMIT] Ashby: No submit button found — form filled but not submitted');
      return { paused: false, submitted: false, error: 'Ashby form filled — submit button not found; review screenshot' };
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Ashby submit click failed: ${err.message}`);
    return { paused: false, submitted: false, error: err.message };
  }
}

async function fillGreenhouseForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId, dryRun = false) {
  logger.info('[SUBMIT] Filling Greenhouse form');
  let pageNum = 1;

  await humanDelay(1500, 3000);
  await fillStandardFields(page, profile, resumePath, coverPath, resumeText, coverText);
  await fillFieldValues(page, fieldValues);
  await humanDelay(800, 1500);

  const sensitive = await scanForSensitiveFields(page);
  const uncovered = getUncoveredSensitiveFields(sensitive, fieldValues);
  if (uncovered.length > 0) {
    logger.info(`[SUBMIT] Greenhouse: ${uncovered.length} unanswered field(s): ${uncovered.join(', ')}`);
    return { paused: true, pausedFields: uncovered };
  }

  const config = loadConfig();
  if (config?.submit?.screenshotOnEachPage) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
  }

  if (dryRun) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
    logger.info('[SUBMIT] Greenhouse: dry run — form filled, Submit NOT clicked');
    return { paused: false, submitted: false, dryRun: true, error: 'Dry run — form filled; final Submit not clicked. Review screenshots, then submit from Auto-Apply.' };
  }

  try {
    const submitBtn = page.locator('button[type="submit"], input[type="submit"]').filter({ hasText: /submit|apply/i }).first();
    if (await submitBtn.count() > 0) {
      await humanDelay(1000, 2000);
      await submitBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      if (config?.submit?.screenshotOnEachPage) {
        await takeScreenshot(page, jobId, pageNum++, screenshots);
      }
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Greenhouse submit click failed: ${err.message}`);
    return { paused: false, submitted: false, error: err.message };
  }

  return { paused: false, submitted: true };
}

async function fillLeverForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId, dryRun = false) {
  logger.info('[SUBMIT] Filling Lever form');
  let pageNum = 1;

  await humanDelay(1500, 3000);

  try {
    const applyBtn = page.locator('a, button').filter({ hasText: /apply/i }).first();
    if (await applyBtn.count() > 0) {
      await applyBtn.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await humanDelay(1000, 2000);
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Lever: Could not find apply button: ${err.message}`);
  }

  await fillStandardFields(page, profile, resumePath, coverPath, resumeText, coverText);
  await fillFieldValues(page, fieldValues);
  await humanDelay(800, 1500);

  const sensitive = await scanForSensitiveFields(page);
  const uncovered = getUncoveredSensitiveFields(sensitive, fieldValues);
  if (uncovered.length > 0) {
    logger.info(`[SUBMIT] Lever: ${uncovered.length} unanswered field(s): ${uncovered.join(', ')}`);
    return { paused: true, pausedFields: uncovered };
  }

  const config = loadConfig();
  if (config?.submit?.screenshotOnEachPage) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
  }

  if (dryRun) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
    logger.info('[SUBMIT] Lever: dry run — form filled, Submit NOT clicked');
    return { paused: false, submitted: false, dryRun: true, error: 'Dry run — form filled; final Submit not clicked. Review screenshots, then submit from Auto-Apply.' };
  }

  try {
    const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /submit|apply/i }).first();
    if (await submitBtn.count() > 0) {
      await humanDelay(1000, 2000);
      await submitBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      if (config?.submit?.screenshotOnEachPage) {
        await takeScreenshot(page, jobId, pageNum++, screenshots);
      }
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Lever submit click failed: ${err.message}`);
    return { paused: false, submitted: false, error: err.message };
  }

  return { paused: false, submitted: true };
}

async function fillSmartRecruitersForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId) {
  logger.info('[SUBMIT] Filling SmartRecruiters form');
  let pageNum = 1;

  await humanDelay(1500, 3000);

  try {
    const applyBtn = page.locator('button, a').filter({ hasText: /apply now|apply for/i }).first();
    if (await applyBtn.count() > 0) {
      await applyBtn.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await humanDelay(1000, 2000);
    }
  } catch (err) {
    logger.warn(`[SUBMIT] SmartRecruiters: Could not find apply button: ${err.message}`);
  }

  await fillStandardFields(page, profile, resumePath, coverPath, resumeText, coverText);
  await fillFieldValues(page, fieldValues);
  await humanDelay(800, 1500);

  const sensitive = await scanForSensitiveFields(page);
  const uncovered = getUncoveredSensitiveFields(sensitive, fieldValues);
  if (uncovered.length > 0) {
    logger.info(`[SUBMIT] SmartRecruiters: ${uncovered.length} unanswered field(s): ${uncovered.join(', ')}`);
    return { paused: true, pausedFields: uncovered };
  }

  const config = loadConfig();
  if (config?.submit?.screenshotOnEachPage) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
  }

  return { paused: false, submitted: false, error: 'SmartRecruiters multi-step — manual submission required after form fill' };
}

async function fillDirectForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId) {
  logger.info('[SUBMIT] Filling direct career page form (best-effort)');
  let pageNum = 1;

  await humanDelay(2000, 4000);

  try {
    const applyBtn = page.locator('a, button').filter({ hasText: /apply now|apply online|apply for this/i }).first();
    if (await applyBtn.count() > 0) {
      await applyBtn.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await humanDelay(1500, 3000);
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Direct: Could not find apply button: ${err.message}`);
  }

  await fillStandardFields(page, profile, resumePath, coverPath, resumeText, coverText);
  await fillFieldValues(page, fieldValues);
  await humanDelay(800, 1500);

  const sensitive = await scanForSensitiveFields(page);
  const uncovered = getUncoveredSensitiveFields(sensitive, fieldValues);
  if (uncovered.length > 0) {
    logger.info(`[SUBMIT] Direct: ${uncovered.length} unanswered field(s): ${uncovered.join(', ')}`);
    return { paused: true, pausedFields: uncovered };
  }

  const config = loadConfig();
  if (config?.submit?.screenshotOnEachPage) {
    await takeScreenshot(page, jobId, pageNum++, screenshots);
  }

  return { paused: false, submitted: false, error: 'Direct page — form filled but auto-submit skipped for safety; review screenshots' };
}

// `dryRun` (default false) makes supported-platform fillers stop *before* the
// final Submit click — form is filled and screenshotted for human review, but
// nothing is sent. Existing callers omit it and keep their exact behavior.
async function runSubmit({ jobId, pipelineId, url, platform, resumePath, coverPath, fieldValues = {}, dryRun = false }) {
  const result = {
    ...SUBMIT_RESULT_DEFAULTS,
    jobId,
    platform: platform || detectPlatform(url),
    startedAt: new Date().toISOString(),
  };

  ensureSubmitDir();

  const config = loadConfig();
  const profile = loadProfile();
  const unsupportedPlatforms = config?.submit?.unsupportedPlatforms || ['workday', 'icims'];
  const isHeadless = config?.submit?.headless !== false;

  if (!url) {
    result.status = 'failed';
    result.error = 'No job URL provided — cannot navigate to application form';
    writeSubmitLog(jobId, result);
    logger.error(`[SUBMIT] No URL for job ${jobId}`);
    return result;
  }

  const detectedPlatform = detectPlatform(url);
  result.platform = detectedPlatform;

  if (unsupportedPlatforms.includes(detectedPlatform)) {
    result.status = 'paused';
    result.pausedFields = [`Platform "${detectedPlatform}" requires manual login — queued for human submission`];
    writeSubmitLog(jobId, result);
    logger.info(`[SUBMIT] Unsupported platform ${detectedPlatform} for job ${jobId} — paused`);
    return result;
  }

  let resumeText = '';
  let coverText = '';

  try {
    if (resumePath && fs.existsSync(resumePath)) {
      resumeText = fs.readFileSync(resumePath, 'utf8');
    } else if (profile?.resume?.summary) {
      resumeText = profile.resume.summary;
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Could not read resume file: ${err.message}`);
    resumeText = profile?.resume?.summary || '';
  }

  try {
    if (coverPath && fs.existsSync(coverPath)) {
      coverText = fs.readFileSync(coverPath, 'utf8');
    }
  } catch (err) {
    logger.warn(`[SUBMIT] Could not read cover letter file: ${err.message}`);
  }

  let browser = null;
  try {
    browser = await chromium.launch({ headless: isHeadless });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    logger.info(`[SUBMIT] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 4000);

    let fillResult;
    const screenshots = [];

    switch (detectedPlatform) {
      case 'ashby':
        fillResult = await fillAshbyForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId, dryRun);
        break;
      case 'greenhouse':
        fillResult = await fillGreenhouseForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId, dryRun);
        break;
      case 'lever':
        fillResult = await fillLeverForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId, dryRun);
        break;
      case 'smartrecruiters':
        fillResult = await fillSmartRecruitersForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId);
        break;
      default:
        fillResult = await fillDirectForm(page, profile, resumePath, coverPath, resumeText, coverText, fieldValues, screenshots, jobId);
    }

    result.screenshots = screenshots;

    if (fillResult.paused) {
      result.status = 'paused';
      result.pausedFields = fillResult.pausedFields || [];
      logger.info(`[SUBMIT] Job ${jobId} paused — sensitive fields: ${result.pausedFields.join(', ')}`);
    } else if (fillResult.submitted) {
      result.status = 'submitted';
      result.submittedAt = new Date().toISOString();
      logger.info(`[SUBMIT] Job ${jobId} submitted successfully via ${detectedPlatform}`);
      if (pipelineId) {
        updateLedgerSubmitted(pipelineId, result.submittedAt);
      }
    } else {
      result.status = 'form_filled';
      result.dryRun = Boolean(fillResult.dryRun);
      result.error = fillResult.error || 'Form filled but auto-submit not completed';
      logger.info(`[SUBMIT] Job ${jobId} form filled — ${result.error}`);
      // A dry run did NOT submit — never mark the ledger as applied for it.
      if (pipelineId && !fillResult.dryRun) {
        updateLedgerSubmitted(pipelineId, new Date().toISOString());
      }
    }

    await context.close();
  } catch (err) {
    result.status = 'failed';
    result.error = err.message || 'Browser automation failed';
    logger.error(`[SUBMIT] Job ${jobId} failed: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  result.completedAt = new Date().toISOString();
  writeSubmitLog(jobId, result);

  if (actionLogger) {
    actionLogger.info(`[submit] job=${jobId} platform=${result.platform} status=${result.status}`);
  }

  return result;
}

module.exports = { runSubmit, getSubmitLog, detectPlatform };
