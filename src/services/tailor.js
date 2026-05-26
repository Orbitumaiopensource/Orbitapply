const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { runAgent, parseJSONFromContent } = require('./agentBase');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { logger } = require('../utils/logger');
const { waterfallExtract } = require('../utils/searchProvider');

const PROFILE_PATH = path.join(__dirname, '..', '..', 'memory', 'profile.json');
const DEFAULT_WORKSPACE = path.join(__dirname, '..', '..', 'workspace-tailor');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');

function getApplicationsRoot() {
  const config = readJSON(CONFIG_PATH, {});
  const base = config.outputFolder && fs.existsSync(config.outputFolder)
    ? config.outputFolder
    : DEFAULT_WORKSPACE;
  return path.join(base, 'applications');
}

function slugify(str) {
  return (str || 'unknown')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function fileSlug(str) {
  return (str || 'unknown')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50);
}

function getFullNameSlug(profile) {
  const name = (profile?.name || 'Candidate').trim();
  return name.split(/\s+/).map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
}

function getYearMonth() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function getApplicationFolder(company, jobTitle) {
  const folderName = `${slugify(company)} - ${slugify(jobTitle)}`;
  return path.join(getApplicationsRoot(), folderName);
}

function getBaseResume(profile) {
  if (profile.resume?.path && fs.existsSync(profile.resume.path)) {
    return fs.readFileSync(profile.resume.path, 'utf8');
  }
  return profile.resume?.summary || 'No base resume found. Please upload a resume in your profile.';
}

// ─── PDF GENERATOR ────────────────────────────────────────────────────────────
function safe(str) {
  return (str || '').replace(/[^\x20-\x7E]/g, '').trim();
}

function drawRule(doc, x, y, w, color, thickness) {
  doc.save().strokeColor(color || '#CCCCCC').lineWidth(thickness || 0.5)
    .moveTo(x, y).lineTo(x + w, y).stroke().restore();
}

async function generatePDF(resumeText, coverText, outputFolder, nameSlug, titleSlug, yearMonth, job, jobDescText, profile) {
  const resumePdfPath = path.join(outputFolder, `${nameSlug}_Resume_${titleSlug}.${yearMonth}.pdf`);
  const coverPdfPath = path.join(outputFolder, `${nameSlug}_CoverLetter_${titleSlug}.${yearMonth}.pdf`);
  const jobDescPdfPath = path.join(outputFolder, `JobDescription_${titleSlug}.${yearMonth}.pdf`);

  await buildResumePDF(resumeText, resumePdfPath);
  await buildCoverPDF(coverText, coverPdfPath, profile);
  await buildJobDescriptionPDF(job || {}, jobDescText, jobDescPdfPath);

  return { resumePdfPath, coverPdfPath, jobDescPdfPath };
}

async function buildResumePDF(text, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const W = 595, H = 842;
    const ML = 50, MR = 50, MW = W - ML - MR;
    const TOP = 60, BOTTOM = 792;          // body content bounds (below header, above footer)
    const ACCENT = '#1A3C5E';
    const ACCENT_SOFT = '#5B7B99';
    const DARK = '#1A1A1A';
    const MID = '#3F3F3F';
    const LIGHT = '#7A7A7A';
    let y = 0;

    const SECTION_HEADERS = [
      'EXECUTIVE SUMMARY', 'PROFESSIONAL SUMMARY', 'SUMMARY',
      'CORE COMPETENCIES', 'SKILLS', 'PROFESSIONAL EXPERIENCE',
      'EXPERIENCE', 'KEY AI DELIVERY PROJECTS', 'KEY PROJECTS', 'PROJECTS',
      'EDUCATION & CERTIFICATIONS', 'EDUCATION', 'CERTIFICATIONS', 'EARLIER CAREER',
    ];
    const isSectionHeader = (l) =>
      l.length < 48 && SECTION_HEADERS.some(h => l.toUpperCase() === h || l.toUpperCase().startsWith(h));

    // Draw the colored name/title/contact band at the top of a page
    function drawHeaderBand(name, title, contact) {
      doc.rect(0, 0, W, 96).fill(ACCENT);
      doc.fontSize(22).fillColor('#FFFFFF').font('Helvetica-Bold')
        .text(safe(name), ML, 22, { width: MW });
      doc.fontSize(11).fillColor('#C7D6E5').font('Helvetica')
        .text(safe(title), ML, 50, { width: MW });
      doc.fontSize(8.5).fillColor('#9FB6CC').font('Helvetica')
        .text(safe(contact).replace(/\s*\|\s*/g, '   •   '), ML, 70, { width: MW });
    }

    function newPage() {
      doc.addPage();
      y = TOP;
    }
    // Ensure `need` vertical px are available before drawing; page-break if not.
    function ensure(need) {
      if (y + need > BOTTOM) newPage();
    }

    const rawLines = text.split('\n').map(l => l.trim());
    const lines = rawLines.filter(Boolean);

    // First 3 non-empty lines = name / title / contact
    const name = lines[0] || 'Candidate';
    const title = lines[1] || '';
    const contact = lines[2] || '';
    drawHeaderBand(name, title, contact);
    y = 96 + 20;

    const body = lines.slice(3);

    for (let i = 0; i < body.length; i++) {
      const line = body[i];

      // ── Section header ──
      if (isSectionHeader(line)) {
        ensure(46);
        y += 6;
        doc.fontSize(10).fillColor(ACCENT).font('Helvetica-Bold')
          .text(safe(line.toUpperCase()), ML, y, { width: MW, characterSpacing: 1 });
        y = doc.y + 4;
        drawRule(doc, ML, y, MW, ACCENT, 1);
        y += 12;
        continue;
      }

      // ── Bullet point ──
      if (line.startsWith('•') || line.startsWith('-')) {
        const bulletText = safe(line.replace(/^[•\-]\s*/, ''));
        const txtW = MW - 14;
        const need = doc.heightOfString(bulletText, { width: txtW, lineGap: 1.5 });
        ensure(need + 4);
        doc.fontSize(9).fillColor(ACCENT_SOFT).font('Helvetica-Bold')
          .text('•', ML, y, { width: 10 });
        doc.fontSize(9).fillColor(MID).font('Helvetica')
          .text(bulletText, ML + 14, y, { width: txtW, lineGap: 1.5 });
        y = doc.y + 4;
        continue;
      }

      // ── Job / role line: "Title | Company | Dates" ──
      if (line.includes(' | ')) {
        const [jobTitle, company = '', dates = ''] = line.split(' | ').map(s => s.trim());
        // Keep the role header attached to its first bullet (no orphan headers).
        const nextIsBullet = (body[i + 1] || '').startsWith('•') || (body[i + 1] || '').startsWith('-');
        ensure(nextIsBullet ? 64 : 34);
        y += 4;
        doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold')
          .text(safe(jobTitle), ML, y, { width: MW - 120, continued: false });
        if (dates) {
          doc.fontSize(9).fillColor(ACCENT).font('Helvetica')
            .text(safe(dates), ML + MW - 120, y, { width: 120, align: 'right' });
        }
        y = doc.y + 1;
        if (company) {
          doc.fontSize(9.5).fillColor(LIGHT).font('Helvetica-Oblique')
            .text(safe(company), ML, y, { width: MW });
          y = doc.y + 5;
        }
        continue;
      }

      // ── Regular paragraph / sub-heading ──
      const isSub = line.length < 50 && !/[.;,]$/.test(line) && !line.includes(',')
        && line.split(/\s+/).length <= 6 && /^[A-Z0-9]/.test(line);
      const txt = safe(line);
      const need = doc.heightOfString(txt, { width: MW, lineGap: 1.5 });
      ensure(need + 4);
      if (isSub) {
        doc.fontSize(9).fillColor(ACCENT).font('Helvetica-Bold')
          .text(txt, ML, y, { width: MW });
        y = doc.y + 3;
      } else {
        doc.fontSize(9).fillColor(MID).font('Helvetica')
          .text(txt, ML, y, { width: MW, lineGap: 1.5 });
        y = doc.y + 4;
      }
    }

    // ── Footer + page numbers on every page ──
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      drawRule(doc, ML, H - 40, MW, '#D8DEE5', 0.5);
      doc.fontSize(7.5).fillColor(LIGHT).font('Helvetica')
        .text(safe(name), ML, H - 33, { width: MW / 2 });
      doc.fontSize(7.5).fillColor(LIGHT).font('Helvetica')
        .text(`Page ${p + 1} of ${range.count}`, ML + MW / 2, H - 33, { width: MW / 2, align: 'right' });
    }

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

async function buildCoverPDF(text, outputPath, profile) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const W = 595, H = 842;
    const ML = 64, MR = 64, MW = W - ML - MR;
    const DARK = '#1A1A1A';
    const MID = '#333333';
    const LIGHT = '#7A7A7A';
    const BOTTOM = 800;

    // === HEADER: candidate name + contact + horizontal rule ===
    const candidateName = safe(profile?.name || '');
    const contactParts = [profile?.location, profile?.email, profile?.linkedinUrl]
      .filter(Boolean).map(safe);
    const contactLine = contactParts.join('  |  ');

    doc.fontSize(20).fillColor(DARK).font('Helvetica-Bold')
      .text(candidateName, ML, 48, { width: MW });
    let y = doc.y + 4;

    if (contactLine) {
      doc.fontSize(9.5).fillColor(LIGHT).font('Helvetica')
        .text(contactLine, ML, y, { width: MW });
      y = doc.y + 10;
    }
    drawRule(doc, ML, y, MW, '#CCCCCC', 0.75);
    y += 20;

    // === BODY: parse the AI cover letter text ===
    const CLOSING_RE = /^(sincerely|best regards|regards|warm regards|yours truly|respectfully),?$/i;
    let inClosing = false;
    let closingNameWritten = false;

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (y > BOTTOM) { doc.addPage(); y = 48; }

      // Blank line → spacing
      if (!line) {
        y += inClosing && !closingNameWritten ? 14 : 10;
        continue;
      }

      // Skip AI-echoed candidate name/contact at the top of the letter body
      if (!inClosing && i < 6 && candidateName && line === candidateName) continue;

      // "Re:" reference line → bold
      if (/^Re:/i.test(line)) {
        doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold')
          .text(safe(line), ML, y, { width: MW });
        y = doc.y + 8;
        continue;
      }

      // Closing word (Sincerely, etc.)
      if (CLOSING_RE.test(line)) {
        inClosing = true;
        closingNameWritten = false;
        doc.fontSize(10.5).fillColor(MID).font('Helvetica')
          .text(safe(line), ML, y, { width: MW });
        y = doc.y + 8;
        continue;
      }

      // First non-empty line after closing → bold name
      if (inClosing && !closingNameWritten) {
        closingNameWritten = true;
        doc.fontSize(10.5).fillColor(DARK).font('Helvetica-Bold')
          .text(safe(line), ML, y, { width: MW });
        y = doc.y + 4;
        continue;
      }

      // Subsequent closing lines (title, website) → light regular text
      if (inClosing) {
        doc.fontSize(9.5).fillColor(MID).font('Helvetica')
          .text(safe(line), ML, y, { width: MW });
        y = doc.y + 4;
        continue;
      }

      // Body paragraphs (long lines) → justified; short lines (date, address, salutation) → left
      const isBodyParagraph = line.length > 80;
      doc.fontSize(10.5).fillColor(MID).font('Helvetica')
        .text(safe(line), ML, y, { width: MW, align: isBodyParagraph ? 'justify' : 'left', lineGap: 3 });
      y = doc.y + 8;
    }

    // Page numbers
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      doc.fontSize(7.5).fillColor(LIGHT).font('Helvetica')
        .text(`Page ${p + 1} of ${range.count}`, ML, H - 28, { width: MW, align: 'right' });
    }

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

async function buildJobDescriptionPDF(job, descText, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const W = 595, ML = 56, MW = W - ML - 56;
    const ACCENT = '#1A3C5E';
    const DARK = '#1A1A1A';
    const MID = '#333333';
    const LIGHT = '#6B6B6B';

    // Header band
    doc.rect(0, 0, W, 88).fill(ACCENT);
    doc.fontSize(18).fillColor('#FFFFFF').font('Helvetica-Bold')
      .text(safe(job.title || 'Job Description'), ML, 20, { width: MW });
    doc.fontSize(11).fillColor('#C7D6E5').font('Helvetica')
      .text(safe(job.company || ''), ML, 48, { width: MW });
    const metaBits = [job.location, job.salary, job.platform]
      .filter(Boolean).join('   •   ');
    doc.fontSize(8.5).fillColor('#9FB6CC').font('Helvetica')
      .text(safe(metaBits), ML, 66, { width: MW });

    let y = 108;
    if (job.url) {
      doc.fontSize(8.5).fillColor(ACCENT).font('Helvetica')
        .text(safe(job.url), ML, y, { width: MW, link: job.url, underline: true });
      y = doc.y + 10;
    }
    drawRule(doc, ML, y, MW, '#D8DEE5', 1);
    y += 14;

    const BOTTOM = 805;          // last usable y before a page break
    const PAGE_TOP = 44;

    // Strip Jina/markdown image lines and collapse blank runs so the full
    // posting reads cleanly across pages.
    const lines = String(descText || 'No description available.')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')        // markdown images
      .replace(/\r/g, '')
      .split('\n')
      .map(l => l.replace(/[ \t]+$/g, ''));

    let blankRun = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        // collapse 3+ consecutive blank lines to one gap
        if (++blankRun <= 2) y += 6;
        continue;
      }
      blankRun = 0;

      // Markdown bullets / headings → cleaned, styled
      const isMdBullet = /^[-*•]\s+/.test(line);
      const cleaned = line.replace(/^#{1,6}\s*/, '').replace(/^[-*•]\s+/, '').replace(/\*\*/g, '');
      const isHeading = /^#{1,6}\s/.test(line) ||
        (cleaned.length < 60 && /^[A-Z][A-Za-z0-9 &/\-’',.]+:?$/.test(cleaned) && !isMdBullet);

      const fontSize = isHeading ? 11 : 9.5;
      const indentX = isMdBullet ? ML + 14 : ML;
      const textW = isMdBullet ? MW - 14 : MW;
      const display = isMdBullet ? `•  ${cleaned}` : cleaned;

      doc.fontSize(fontSize)
        .font(isHeading ? 'Helvetica-Bold' : 'Helvetica');
      const h = doc.heightOfString(safe(display), { width: textW, lineGap: 3 });

      // Page-break BEFORE drawing if this block would overflow.
      if (y + h > BOTTOM) { doc.addPage(); y = PAGE_TOP; }
      if (isHeading) y += 6;

      doc.fillColor(isHeading ? DARK : MID)
        .text(safe(display), indentX, y, { width: textW, lineGap: 3 });
      y = doc.y + (isHeading ? 6 : 4);
    }

    // Footer on a guaranteed-clear spot: if the last content is near the
    // page bottom, start a fresh page so the footer never overlaps text.
    if (y + 24 > BOTTOM) { doc.addPage(); y = PAGE_TOP; }
    doc.fontSize(7.5).fillColor(LIGHT).font('Helvetica')
      .text(`Source: ${safe(job.url || '')}  •  Captured ${new Date().toLocaleString()}`,
        ML, y + 10, { width: MW });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// ─── MAIN TAILOR FUNCTION ─────────────────────────────────────────────────────
function inferIndustry(job, profile, reconIntel) {
  const targets = (profile.targetIndustries || []);
  const haystack = `${job.title || ''} ${job.company || ''} ${job.snippet || ''} ${reconIntel?.industry || ''}`.toLowerCase();
  const match = targets.find(ind => haystack.includes(ind.toLowerCase()));
  return match || targets[0] || 'Technology';
}

async function runTailor(job, reconIntel = null, sessionId = null) {
  const profile = readJSON(PROFILE_PATH, {});
  const baseResume = getBaseResume(profile);
  const industry = inferIndustry(job, profile, reconIntel);
  const educationLines = (profile.education || [])
    .map(e => `${e.degree} — ${e.school}${e.year ? ` | ${e.year}` : ''}`)
    .join('\n');

  const reconContext = reconIntel ? `
COMPANY INTELLIGENCE:
- Culture: ${reconIntel.culture?.summary || 'unknown'}
- Tech Stack: ${(reconIntel.techStack || []).join(', ')}
- Size: ${reconIntel.size || 'unknown'}
- Salary Benchmark: $${reconIntel.salaryBenchmark?.low || 0}k - $${reconIntel.salaryBenchmark?.high || 0}k
- Recent News: ${(reconIntel.recentNews || []).join('; ')}
- Red Flags: ${(reconIntel.redFlags || []).join('; ') || 'none'}
` : '';

  // ── RESUME PROMPT ──────────────────────────────────────────────────────────
  const resumePrompt = `
You are an expert resume writer and ATS optimization specialist.

JOB TARGET:
- Title: ${job.title}
- Company: ${job.company}
- Description: ${job.snippet || 'Not provided'}
${reconContext}

TARGET INDUSTRY: ${industry}
(Tailor terminology, domain examples, and keyword emphasis toward the ${industry} industry while staying factually accurate.)

CANDIDATE PROFILE:
- Name: ${profile.name}
- Current Title: ${profile.title}
- Location: ${profile.location || ''}
- Email: ${profile.email || ''}
- LinkedIn: ${profile.linkedinUrl || ''}
- Skills: ${(profile.skills || []).join(', ')}
- Years Experience: ${profile.yearsExperience}
- ORBIT Positioning: ${profile.orbitPositioningStatement || 'AI Solutions Specialist delivering measurable outcomes'}
- Education & Certifications:
${educationLines || '(see base resume)'}

COMPLETE BASE RESUME — use ALL sections, never truncate:
${baseResume.slice(0, 16000)}

YOUR TASK:
Rewrite this resume tailored for the job above.

STRICT RULES:
1. PRESERVE every single job title, company name, date, and certification — never drop any
2. Mirror JD language naturally in Summary and Skills sections only
3. Inject relevant keywords from the JD into Skills/Competencies section
4. Rewrite Summary (3-4 sentences) to target this specific role and company
5. Keep all bullet points factually accurate — reword only, never fabricate metrics
6. Preserve the ORBIT Framework mention in Summary
7. Output CLEAN PLAIN TEXT — absolutely NO markdown symbols (no ##, no **, no *, no _, no #)
8. Use ALL CAPS for section headers
9. Use the bullet character • for all bullet points
10. Job lines must follow format: Job Title | Company Name | Start Year – End Year
11. ALWAYS include the EDUCATION & CERTIFICATIONS section in full — never drop a degree or certification
12. Frame the Summary and Core Competencies for the ${industry} industry without inventing experience

EXACT OUTPUT STRUCTURE — follow this precisely:

[Full Name]
[Target Job Title for this role]
[Location] • [Email] • [LinkedIn]

EXECUTIVE SUMMARY
[3-4 sentences targeting this role and company]

CORE COMPETENCIES
[Skill 1] • [Skill 2] • [Skill 3] • [Skill 4] • [Skill 5]
[Skill 6] • [Skill 7] • [Skill 8] • [Skill 9] • [Skill 10]

PROFESSIONAL EXPERIENCE

[Job Title] | [Company Name] | [Start Year] – [End Year or Present]
• [Achievement bullet 1]
• [Achievement bullet 2]
• [Achievement bullet 3]

[Repeat above block for EVERY job — never skip any role]

KEY AI DELIVERY PROJECTS
[Project Name] | [Stack and outcome in one line]

EDUCATION & CERTIFICATIONS
• [Degree/Cert] — [Institution] | [Year]

Return ONLY this JSON — no preamble, no explanation, no markdown:
{
  "atsScore": 85,
  "keywordsInjected": ["keyword1", "keyword2", "keyword3"],
  "resumeText": "[complete plain text resume exactly as structured above — all jobs included]",
  "notes": "brief note on tailoring approach"
}
`;

  // ── COVER LETTER PROMPT ───────────────────────────────────────────────────
  const coverPrompt = `
You are an expert cover letter writer using the ORBIT Framework.

JOB: ${job.title} at ${job.company}
JOB DESCRIPTION: ${job.snippet || ''}

CANDIDATE:
- Name: ${profile.name}
- Title: ${profile.title}
- ORBIT Statement: ${profile.orbitPositioningStatement || ''}
- Key Skills: ${(profile.skills || []).slice(0, 10).join(', ')}
${reconContext}

Write a cover letter using the ORBIT Framework with the EXACT structure below (plain text, no markdown):

[Today's date, e.g. May 26, 2026]

Hiring Team
${job.company}
${job.location || ''}

Re: ${job.title}

Dear Hiring Team,

[Para 1 — OUTCOME: specific result this candidate delivers to ${job.company}]

[Para 2 — REVENUE LEVER + BOTTLENECK: why ${job.company} needs this person now]

[Para 3 — IMPLEMENT: concrete 30-60-90 day plan for this specific role]

[Para 4 — TRACK: 2-3 quantified past achievements as proof, then a professional closing sentence]

Sincerely,

${profile.name}
${profile.title || ''}

RULES:
- 280-320 words in the four body paragraphs only
- Never start Para 1 with "I am excited to apply" or "I am writing to apply"
- Professional, direct, no filler phrases
- No markdown symbols, no JSON, no extra commentary outside the letter
`;

  // Resume and cover prompts are built independently above and the cover
  // call does not consume the resume result — generate both concurrently
  // to roughly halve per-job TAILOR time.
  const [resumeResult, coverResult] = await Promise.all([
    runAgent('tailor', resumePrompt, sessionId),
    runAgent('tailor', coverPrompt, `${sessionId}-cover`),
  ]);
  const tailoredResume = parseJSONFromContent(resumeResult.content);
  const coverLetter = coverResult.content;

  // Use resumeText (new) or fall back to resumeMarkdown (legacy)
  const resumeText = tailoredResume?.resumeText || tailoredResume?.resumeMarkdown || resumeResult.content;

  // ── FULL JOB DESCRIPTION (fetched live at generate time) ───────────────────
  // Fetch the live posting so the Job Description PDF holds the full text.
  // If the fetch fails, fall back to the stored snippet so Generate never
  // breaks just because a page was unreachable.
  let jobDescText = job.snippet || '';
  try {
    if (job.url) {
      const extracted = await waterfallExtract(job.url, { maxChars: 0 });
      const full = (extracted && extracted.content || '').trim();
      if (full && full.length > jobDescText.length) {
        jobDescText = full;
        logger.info(`[TAILOR] Full job description fetched (${full.length} chars) for ${job.company} - ${job.title}`);
      } else {
        logger.warn(`[TAILOR] JD fetch returned little for ${job.url} — using stored snippet`);
      }
    }
  } catch (jdErr) {
    logger.warn(`[TAILOR] JD fetch failed for ${job.url}: ${jdErr.message} — using stored snippet`);
  }
  if (!jobDescText) jobDescText = 'No description available.';

  // ── SAVE FILES ────────────────────────────────────────────────────────────
  const appFolder = getApplicationFolder(job.company, job.title);
  if (!fs.existsSync(appFolder)) fs.mkdirSync(appFolder, { recursive: true });

  const nameSlug = getFullNameSlug(profile);
  const titleSlug = fileSlug(job.title);
  const companySlug = fileSlug(job.company);
  const yearMonth = getYearMonth();

  const jobPath = path.join(appFolder, 'job.json');
  const metaPath = path.join(appFolder, 'metadata.json');

  // Generate PDFs (resume, cover letter, job description)
  let resumePdfPath = null;
  let coverPdfPath = null;
  let jobDescPdfPath = null;
  try {
    const paths = await generatePDF(resumeText, coverLetter, appFolder, nameSlug, titleSlug, yearMonth, job, jobDescText, profile);
    resumePdfPath = paths.resumePdfPath;
    coverPdfPath = paths.coverPdfPath;
    jobDescPdfPath = paths.jobDescPdfPath;
    logger.info(`[TAILOR] 3 PDFs generated (resume, cover, job description) for ${job.company} - ${job.title}`);
  } catch (pdfErr) {
    logger.error(`[TAILOR] PDF generation failed: ${pdfErr.message}`);
    // Fallback: save as plain text
    const resumeFallback = path.join(appFolder, `${nameSlug}_Resume_${titleSlug}_${companySlug}.${yearMonth}.txt`);
    const coverFallback = path.join(appFolder, `${nameSlug}_CoverLetter_${titleSlug}.${yearMonth}.txt`);
    const jdFallback = path.join(appFolder, `JobDescription_${titleSlug}.${yearMonth}.txt`);
    fs.writeFileSync(resumeFallback, resumeText, 'utf8');
    fs.writeFileSync(coverFallback, coverLetter, 'utf8');
    fs.writeFileSync(jdFallback, `${job.title || ''} — ${job.company || ''}\n${job.url || ''}\n\n${jobDescText}`, 'utf8');
    resumePdfPath = resumeFallback;
    coverPdfPath = coverFallback;
    jobDescPdfPath = jdFallback;
  }

  // Always save editable plain-text copies so the UI can load/edit them
  const resumeEditPath = path.join(appFolder, 'resume_edit.txt');
  const coverEditPath = path.join(appFolder, 'cover_edit.txt');
  fs.writeFileSync(resumeEditPath, resumeText, 'utf8');
  fs.writeFileSync(coverEditPath, coverLetter, 'utf8');

  writeJSON(jobPath, job);
  writeJSON(metaPath, {
    jobId: job.id,
    company: job.company,
    title: job.title,
    url: job.url,
    platform: job.platform,
    location: job.location,
    salary: job.salary,
    fitScore: job.fitScore,
    atsScore: tailoredResume?.atsScore || 0,
    keywordsInjected: tailoredResume?.keywordsInjected || [],
    generatedAt: new Date().toISOString(),
    folder: appFolder,
    resumePdfPath,
    coverPdfPath,
    jobDescPdfPath,
    resumeEditPath,
    coverEditPath,
  });

  logger.info(`[TAILOR] Package complete for ${job.company} - ${job.title} (ATS: ${tailoredResume?.atsScore || 'N/A'})`);

  return {
    agentId: 'tailor',
    jobId: job.id,
    company: job.company,
    role: job.title,
    atsScore: tailoredResume?.atsScore || 0,
    keywordsInjected: tailoredResume?.keywordsInjected || [],
    resumePath: resumePdfPath,
    coverPath: coverPdfPath,
    jobDescPath: jobDescPdfPath,
    folder: appFolder,
    resumeContent: resumeText,
    coverContent: coverLetter,
  };
}

// ─── DOCUMENT READERS ─────────────────────────────────────────────────────────
function getDocuments(jobId) {
  const appsRoot = getApplicationsRoot();
  if (!fs.existsSync(appsRoot)) return { resume: null, cover: null };

  const folders = fs.readdirSync(appsRoot).filter(f =>
    fs.statSync(path.join(appsRoot, f)).isDirectory()
  );

  for (const folder of folders) {
    const metaPath = path.join(appsRoot, folder, 'metadata.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = readJSON(metaPath, {});
    if (meta.jobId === jobId) {
      const folderPath = path.join(appsRoot, folder);
      const files = fs.readdirSync(folderPath);
      const resumeFile = files.find(f => f.includes('_Resume_') && (f.endsWith('.pdf') || f.endsWith('.txt')));
      const coverFile = files.find(f => f.includes('_CoverLetter_') && (f.endsWith('.pdf') || f.endsWith('.txt')));
      return {
        resume: resumeFile ? fs.readFileSync(path.join(folderPath, resumeFile), 'utf8') : null,
        cover: coverFile ? fs.readFileSync(path.join(folderPath, coverFile), 'utf8') : null,
        folder: folderPath,
        meta,
      };
    }
  }
  return { resume: null, cover: null };
}

function getAllApplications() {
  const appsRoot = getApplicationsRoot();
  if (!fs.existsSync(appsRoot)) return [];

  return fs.readdirSync(appsRoot)
    .filter(f => fs.statSync(path.join(appsRoot, f)).isDirectory())
    .map(folder => {
      const metaPath = path.join(appsRoot, folder, 'metadata.json');
      if (!fs.existsSync(metaPath)) return null;
      const meta = readJSON(metaPath, {});
      const files = fs.readdirSync(path.join(appsRoot, folder));
      return {
        ...meta,
        folderName: folder,
        hasResume: files.some(f => f.includes('_Resume_') && (f.endsWith('.pdf') || f.endsWith('.txt'))),
        hasCover: files.some(f => f.includes('_CoverLetter_') && (f.endsWith('.pdf') || f.endsWith('.txt'))),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
}

function docExistsForJob(jobId) {
  const appsRoot = getApplicationsRoot();
  if (!fs.existsSync(appsRoot)) return false;
  const folders = fs.readdirSync(appsRoot).filter(f =>
    fs.statSync(path.join(appsRoot, f)).isDirectory()
  );
  for (const folder of folders) {
    const metaPath = path.join(appsRoot, folder, 'metadata.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = readJSON(metaPath, {});
    if (meta.jobId === jobId) return true;
  }
  return false;
}

// ─── EDITABLE TEXT HELPERS ────────────────────────────────────────────────────
function _findAppFolder(jobId) {
  const appsRoot = getApplicationsRoot();
  if (!fs.existsSync(appsRoot)) return null;
  for (const folder of fs.readdirSync(appsRoot)) {
    const metaPath = path.join(appsRoot, folder, 'metadata.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = readJSON(metaPath, {});
    if (meta.jobId === jobId) return { folderPath: path.join(appsRoot, folder), meta };
  }
  return null;
}

function getDocumentText(jobId) {
  const found = _findAppFolder(jobId);
  if (!found) return { resume: null, cover: null };
  const { folderPath, meta } = found;
  const resumeEditPath = meta.resumeEditPath || path.join(folderPath, 'resume_edit.txt');
  const coverEditPath = meta.coverEditPath || path.join(folderPath, 'cover_edit.txt');
  return {
    resume: fs.existsSync(resumeEditPath) ? fs.readFileSync(resumeEditPath, 'utf8') : null,
    cover: fs.existsSync(coverEditPath) ? fs.readFileSync(coverEditPath, 'utf8') : null,
    meta,
  };
}

async function saveDocumentText(jobId, type, content) {
  const found = _findAppFolder(jobId);
  if (!found) throw new Error('Application folder not found.');
  const { folderPath, meta } = found;

  if (type === 'resume') {
    const editPath = meta.resumeEditPath || path.join(folderPath, 'resume_edit.txt');
    fs.writeFileSync(editPath, content, 'utf8');
    if (meta.resumePdfPath && meta.resumePdfPath.endsWith('.pdf')) {
      await buildResumePDF(content, meta.resumePdfPath);
      logger.info(`[TAILOR] Resume PDF regenerated for jobId=${jobId}`);
    }
  } else if (type === 'cover') {
    const editPath = meta.coverEditPath || path.join(folderPath, 'cover_edit.txt');
    fs.writeFileSync(editPath, content, 'utf8');
    if (meta.coverPdfPath && meta.coverPdfPath.endsWith('.pdf')) {
      await buildCoverPDF(content, meta.coverPdfPath);
      logger.info(`[TAILOR] Cover PDF regenerated for jobId=${jobId}`);
    }
  } else {
    throw new Error(`Unknown document type: ${type}`);
  }
}

module.exports = {
  runTailor, getDocuments, getAllApplications, docExistsForJob,
  getApplicationsRoot, buildResumePDF, buildCoverPDF,
  getDocumentText, saveDocumentText,
};
