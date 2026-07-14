const PIPELINE_STAGES = ['applied', 'viewed', 'phone_screen', 'interview_1', 'interview_2', 'offer', 'rejected', 'withdrawn'];

const AGENT_MODELS = {
  ORBI: 'grok-4',
  TAILOR: 'grok-4',
  COACH: 'grok-4',
  SCOUT: 'grok-4-fast',
  RECON: 'grok-4-fast',
  SUBMIT: 'grok-4-fast',
  LEDGER: 'grok-4-fast',
  GUARDIAN: 'grok-4-fast',
};

const AGENT_IDS = Object.keys(AGENT_MODELS).map(k => k.toLowerCase());

const DAILY_BUDGET_CAP_USD = 5.00;
const BUDGET_ALERT_USD = 3.00;
const MAX_APPLIES_PER_DAY = 15;
const RATE_LIMIT_MS = 45000;
const MAX_RETRIES = 3;

const FIT_SCORE_MIN = 50;   // jobs at/above this are "qualified" → RECON + TAILOR
const TAILOR_SCORE_MIN = 50;

// Per-run caps so a single "Run Job Search" doesn't grind through every
// qualified job (each TAILOR job = 2 sequential Sonnet calls, ~40s).
// Override via orbitapply.json → run.maxReconPerRun / run.maxTailorPerRun.
const MAX_RECON_PER_RUN = 8;
const MAX_TAILOR_PER_RUN = 8;

const HUMAN_PAUSE_FIELDS = ['salary', 'diversity', 'custom_essay', 'security_clearance'];

const JOB_PLATFORMS = ['linkedin', 'indeed', 'glassdoor', 'direct'];

module.exports = {
  PIPELINE_STAGES,
  AGENT_MODELS,
  AGENT_IDS,
  DAILY_BUDGET_CAP_USD,
  BUDGET_ALERT_USD,
  MAX_APPLIES_PER_DAY,
  RATE_LIMIT_MS,
  MAX_RETRIES,
  FIT_SCORE_MIN,
  TAILOR_SCORE_MIN,
  MAX_RECON_PER_RUN,
  MAX_TAILOR_PER_RUN,
  HUMAN_PAUSE_FIELDS,
  JOB_PLATFORMS,
};
