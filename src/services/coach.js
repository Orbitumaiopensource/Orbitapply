const path = require('path');
const fs = require('fs');
const { runAgent } = require('./agentBase');
const { readJSON } = require('../utils/fileStore');
const { logger } = require('../utils/logger');
const { selectQuestions } = require('../data/genaiInterviewBank');

const WORKSPACE = path.join(__dirname, '..', '..', 'workspace-coach');

async function runCoach(application, sessionId = null) {
  const reconPath = application.reconPath;
  const intel = reconPath && fs.existsSync(reconPath) ? readJSON(reconPath, {}) : {};
  const profilePath = path.join(__dirname, '..', '..', 'memory', 'profile.json');
  const profile = readJSON(profilePath, {});

  // Ground the technical section in a vetted, role-appropriate question bank
  // instead of letting the model improvise questions.
  const curated = selectQuestions(
    { title: application.title, company: application.company, snippet: application.snippet || '' },
    profile,
    { count: 12 }
  );
  const curatedBlock = curated.map((q, i) =>
    `${i + 1}. [${q.category} · ${q.level}] ${q.question}\n   Must cover: ${q.keyPoints.join('; ')}`
  ).join('\n');

  const prompt = `
INTERVIEW PREP REQUEST
Stage: ${application.status}
Job: ${application.title} at ${application.company}
Applied: ${application.appliedAt}

COMPANY INTEL:
${JSON.stringify(intel, null, 2).slice(0, 2000)}

CANDIDATE:
- Name: ${profile.name}
- Title: ${profile.title}
- Skills: ${(profile.skills || []).join(', ')}
- ORBIT Statement: ${profile.orbitPositioningStatement || ''}
- Salary Target: $${profile.salaryMin || 0}k - $${profile.salaryMax || 0}k

CURATED TECHNICAL/DOMAIN QUESTION BANK (vetted — use THESE for section 4, do not invent your own):
${curatedBlock}

Generate a comprehensive interview prep pack in Markdown format with these sections:
1. ## Company Overview (from intel data)
2. ## What They're Really Looking For (role analysis)
3. ## Top 10 Behavioral Questions (with STAR answer templates)
4. ## Technical / Domain Questions
   - Use the CURATED QUESTION BANK above. For EACH question, provide: the question
     verbatim, a model answer tailored to THIS candidate's real experience and the
     ORBIT Framework, and the "must cover" points worked in naturally.
   - Do not add invented questions; only expand the curated ones.
5. ## Salary Negotiation Script (anchored to salary benchmark)
6. ## Questions to Ask the Interviewer (5 strategic questions)
7. ## Recent News to Reference (from company intel)
`;

  const result = await runAgent('coach', prompt, sessionId);

  if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
  const outPath = path.join(WORKSPACE, `${application.id}-prep.md`);
  fs.writeFileSync(outPath, result.content, 'utf8');

  logger.info(`[COACH] Prep pack saved for ${application.company} - ${application.title}`);

  return { prepPath: outPath, content: result.content };
}

function getPrepPack(applicationId) {
  const prepPath = path.join(WORKSPACE, `${applicationId}-prep.md`);
  return fs.existsSync(prepPath) ? fs.readFileSync(prepPath, 'utf8') : null;
}

module.exports = { runCoach, getPrepPack };
