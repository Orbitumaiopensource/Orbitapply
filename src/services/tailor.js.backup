const path = require('path');
const fs = require('fs');
const { runAgent, parseJSONFromContent } = require('./agentBase');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { logger } = require('../utils/logger');

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
  const folderName = `${slugify(company)} — ${slugify(jobTitle)}`;
  return path.join(getApplicationsRoot(), folderName);
}

function getBaseResume(profile) {
  if (profile.resume?.path && fs.existsSync(profile.resume.path)) {
    return fs.readFileSync(profile.resume.path, 'utf8');
  }
  return profile.resume?.summary || 'No base resume found. Please upload a resume in your profile.';
}

async function runTailor(job, reconIntel = null, sessionId = null) {
  const profile = readJSON(PROFILE_PATH, {});
  const baseResume = getBaseResume(profile);

  const reconContext = reconIntel ? `
COMPANY INTELLIGENCE:
- Culture: ${reconIntel.culture?.summary || 'unknown'}
- Tech Stack: ${(reconIntel.techStack || []).join(', ')}
- Size: ${reconIntel.size || 'unknown'}
- Salary Benchmark: $${reconIntel.salaryBenchmark?.low || 0}k - $${reconIntel.salaryBenchmark?.high || 0}k
- Recent News: ${(reconIntel.recentNews || []).join('; ')}
- Red Flags: ${(reconIntel.redFlags || []).join('; ') || 'none'}
` : '';

  const resumePrompt = `
JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB URL: ${job.url}
JOB DESCRIPTION EXCERPT: ${job.snippet || ''}

CANDIDATE PROFILE:
- Name: ${profile.name}
- Current Title: ${profile.title}
- Skills: ${(profile.skills || []).join(', ')}
- Years Experience: ${profile.yearsExperience}
- ORBIT Positioning: ${profile.orbitPositioningStatement || 'AI Solutions Specialist delivering measurable outcomes'}
${reconContext}

BASE RESUME:
${baseResume.slice(0, 3000)}

TASK: Rewrite this resume for the specific role above.
1. Mirror JD language while preserving factual accuracy
2. Inject relevant keywords into skills section
3. Rewrite bullet points to highlight relevant experience
4. Add/strengthen ORBIT-framework positioning in summary
5. Run internal ATS scoring (target >= 70/100)

Return JSON:
{
  "atsScore": 82,
  "keywordsInjected": ["keyword1", "keyword2"],
  "resumeMarkdown": "# Full Name\\n## Summary\\n...",
  "notes": "any caveats"
}
`;

  const resumeResult = await runAgent('tailor', resumePrompt, sessionId);
  const tailoredResume = parseJSONFromContent(resumeResult.content);

  const coverPrompt = `
JOB: ${job.title} at ${job.company}
JOB DESCRIPTION: ${job.snippet || ''}

CANDIDATE:
- Name: ${profile.name}
- Title: ${profile.title}
- ORBIT Statement: ${profile.orbitPositioningStatement || ''}
- Key Skills: ${(profile.skills || []).slice(0, 10).join(', ')}
- Cover Letter Tone: ${profile.coverLetterTone || 'orbit-framework'}
${reconContext}

Write a cover letter using the ORBIT Framework structure:
- Para 1 (Outcome): What specific result does this candidate deliver to ${job.company}?
- Para 2 (Revenue Lever + Bottleneck): Why does ${job.company} need this person now?
- Para 3 (Implement): Concrete 30-60-90 day plan for this role
- Para 4 close (Track): 1-2 quantified past achievements

Rules: 250-350 words, no "I'm excited to apply", professional but human, direct.
Return ONLY the cover letter text, no JSON wrapper.
`;

  const coverResult = await runAgent('tailor', coverPrompt, `${sessionId}-cover`);
  const coverLetter = coverResult.content;

  const resumeMd = tailoredResume?.resumeMarkdown || resumeResult.content;

  // Save into applications/{Company — Job Title}/
  const appFolder = getApplicationFolder(job.company, job.title);
  if (!fs.existsSync(appFolder)) fs.mkdirSync(appFolder, { recursive: true });

  const nameSlug = getFullNameSlug(profile);
  const titleSlug = fileSlug(job.title);
  const companySlug = fileSlug(job.company);
  const yearMonth = getYearMonth();

  // Naming standard:
  //   Resume:       FirstLast_Resume_[Role]_Company_Name.YYYY-MM.doc
  //   Cover letter: FirstLast_coverletter_[Role]_YYYY-MM.doc
  const resumeFileName = `${nameSlug}_Resume_${titleSlug}_${companySlug}.${yearMonth}.doc`;
  const coverFileName = `${nameSlug}_coverletter_${titleSlug}.${yearMonth}.doc`;

  const resumePath = path.join(appFolder, resumeFileName);
  const coverPath = path.join(appFolder, coverFileName);
  const jobPath = path.join(appFolder, 'job.json');
  const metaPath = path.join(appFolder, 'metadata.json');

  fs.writeFileSync(resumePath, resumeMd, 'utf8');
  fs.writeFileSync(coverPath, coverLetter, 'utf8');
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
  });

  logger.info(`[TAILOR] Saved application package for ${job.company} — ${job.title} (ATS: ${tailoredResume?.atsScore || 'N/A'}) → ${appFolder}`);

  return {
    agentId: 'tailor',
    jobId: job.id,
    company: job.company,
    role: job.title,
    atsScore: tailoredResume?.atsScore || 0,
    keywordsInjected: tailoredResume?.keywordsInjected || [],
    resumePath,
    coverPath,
    folder: appFolder,
    resumeContent: resumeMd,
    coverContent: coverLetter,
  };
}

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
      const resumeFile = files.find(f => f.includes('_Resume_') && f.endsWith('.doc'));
      const coverFile = files.find(f => (f.includes('_coverletter_') || f.includes('_Coverletter_')) && f.endsWith('.doc'));
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
        hasResume: files.some(f => f.includes('_Resume_') && f.endsWith('.doc')),
        hasCover: files.some(f => (f.includes('_coverletter_') || f.includes('_Coverletter_')) && f.endsWith('.doc')),
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

module.exports = { runTailor, getDocuments, getAllApplications, docExistsForJob, getApplicationsRoot };
