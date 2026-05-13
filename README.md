# OrbitApply

**AI-powered autonomous job search and application system — runs entirely on your local machine.**

OrbitApply uses a coordinated fleet of AI agents to find matching jobs, research companies, tailor your resume and cover letter for each role, and track every application through the full pipeline — from first apply to offer. Everything runs on `localhost:3000`. No cloud. No subscriptions. No data leaves your machine.

---

## Screenshots

**Dashboard — run the full pipeline with one click**
![Dashboard](screenshots/dashboard.png)

**SCOUT Results — ranked job matches with fit scores**
![SCOUT Results](screenshots/scout-results.png)

**Pipeline — track every application through every stage**
![Pipeline](screenshots/pipeline.png)

---

## How the workflow works

A single click of **Run** on the dashboard triggers ORBI, the master orchestrator. ORBI sequences all agents in order, streams live step-by-step progress to the UI, and produces a structured result at the end. Here is exactly what happens, in order.

---

### Step 1 — SCOUT: Job Discovery

SCOUT reads your `memory/profile.json` to understand your target roles, locations, salary range, and skills. It then builds up to 15 targeted search queries across two tiers:

- **Primary queries** (advanced Tavily depth) — high-signal titles like `"Director of AI"`, `"Head of AI"`, `"Agentic AI"` scoped to direct ATS platforms: Lever, Greenhouse, Ashby, Workday, SmartRecruiters
- **Extended queries** (basic Tavily depth) — broader role variants and profile-driven terms

SCOUT runs all queries in parallel, collects raw results, then scores every result locally using a pure JavaScript fit scoring engine — **no AI call at this stage**, which keeps costs near zero for discovery.

**Fit scoring breakdown (0–100):**

| Factor | Max points |
|---|---|
| Title match (senior AI signal keywords) | 35 |
| Location match (remote preference / city) | 25 |
| Salary range overlap | 20 |
| Skills keyword match | 20 |

- Results scoring below 40 are dropped silently.
- Results scoring 40–69 are shown in the UI for your reference.
- Results scoring 70+ are marked **qualified** and passed to the next stage.
- Any company in `memory/blacklist.json` is filtered out before results reach ORBI.

SCOUT saves today's results to `workspace-scout/results-{date}.json` (or `Apply/scout/results-{date}.json` if configured).

**You can also manually import a job** by pasting a URL into the dashboard. SCOUT will fetch the page via Tavily, extract the title and description, score it, and add it to today's results.

---

### Step 2 — RECON: Company Intelligence

For each qualified job (up to 8 companies per run), RECON builds a structured intelligence profile using Tavily web searches:

- Employee reviews and culture signals
- Salary benchmarks for the role
- Recent news — funding rounds, layoffs, product launches
- Tech stack from engineering blogs and job descriptions

RECON sends all gathered data to **Claude Haiku** to synthesise into a structured JSON profile containing: company size, funding stage, tech stack, culture summary, Glassdoor rating, salary benchmark (low/mid/high), red flags, opportunity score (0–100), and risk score (0–100).

Each profile is saved to `workspace-recon/{company-slug}-intel.json` and passed to TAILOR for document personalisation and to COACH for interview prep.

> If RECON hits an API rate limit, it skips remaining companies and continues the run with the intel already gathered.

---

### Step 3 — TAILOR: Document Generation

TAILOR processes every job with a fit score of 60 or above. For each job it runs two sequential Claude Sonnet calls:

**Resume tailoring:**
- Loads your base resume from `memory/resume.md`
- Loads the job description snippet and RECON intel for the company
- Asks Claude Sonnet to rewrite bullet points to mirror JD language, inject ATS keywords, and apply ORBIT Framework positioning in the summary
- Runs an internal ATS simulation — targeting 70+/100
- Returns the tailored resume as Markdown with an ATS score and list of injected keywords

**Cover letter writing:**
- Writes a 250–350 word cover letter using the ORBIT Framework structure:
  - **Outcome** — what specific result you deliver to this company
  - **Revenue Lever + Bottleneck** — why they need you right now
  - **Implement** — your concrete 30-60-90 day plan
  - **Track** — 1–2 quantified past achievements
- Tone: professional, direct — no filler phrases like "I'm excited to apply"

Both documents are saved into a named folder:

```
Apply/applications/{Company Name} — {Job Title}/
├── {Title}_{Company}_Resume_{FirstName}.doc
├── {Title}_{Company}_Coverletter_{FirstName}.doc
└── metadata.json
```

Before running any TAILOR call, ORBI checks the job snippet for sensitive fields (salary, diversity, security clearance, custom essay). If GUARDIAN detects a sensitive field it issues a **PAUSE** verdict — the application is moved to the human review queue and skipped by the automated flow.

> Before TAILOR runs for any job, GUARDIAN runs a pre-flight check:
> - `PASS` → proceed to tailoring
> - `BLOCK` → company is blacklisted or protected contact — skip silently
> - `PAUSE` → sensitive form fields detected — add to human queue, skip
> - `HARD_STOP` → daily budget or apply cap reached — stop the entire run

---

### Step 4 — LEDGER: Pipeline Registration

Every successfully tailored job (ATS score ≥ 70, or the only result) is registered in `workspace-ledger/pipeline.json` as a new application record with:

- Full metadata: title, company, URL, platform, fit score, ATS score, document paths
- Initial status: `applied`
- Follow-up reminder: set to 7 days after creation
- Budget cost per application recorded (≈ $0.08 per application)

LEDGER maintains running stats: total applied, response rate, today's count, total budget spent.

---

### Step 5 — SUBMIT: Application Submission *(optional)*

SUBMIT is only active if `submit.autoSubmit: true` is set in `orbitapply.json`. It is **off by default**.

When enabled, SUBMIT uses Playwright to automate form filling on supported ATS platforms:

| Platform | Support |
|---|---|
| Workday | Multi-step application wizard |
| Greenhouse | Standard form + custom questions |
| Lever | Application form + cover letter field |
| iCIMS | Enterprise ATS form fill |
| Direct career pages | Best-effort Playwright |

SUBMIT enforces a minimum **45-second delay** (±30% jitter) between submissions to avoid triggering spam detection. It fills standard fields from your profile, pastes the tailored resume and cover letter, takes a screenshot after each form page, and logs the full submission.

GUARDIAN runs again immediately before each submission. If the daily apply limit (15) has been hit, or the daily budget ($5) is exhausted, SUBMIT hard-stops and does not continue.

---

### After the run — ongoing pipeline management

Once a run completes, the dashboard shows your full application pipeline board. You move applications through stages manually as real responses come in:

```
applied → viewed → phone_screen → interview_1 → interview_2 → offer
                                                              → rejected
                                                              → withdrawn
```

When you update a status to `phone_screen`, `interview_1`, or `interview_2`, LEDGER triggers **COACH**.

---

### COACH: Interview Preparation *(triggered automatically on stage change)*

COACH activates the moment you mark an application as reaching an interview stage. It loads the RECON intel for that company and generates a full prep pack saved to `workspace-coach/{job-id}-prep.md`:

1. **Company overview** — from the RECON intelligence profile
2. **Role analysis** — what the interviewer is actually testing for
3. **10 behavioural questions** with STAR-method answer templates (Situation, Task, Action, Result)
4. **5–10 technical/domain questions** matched to the role
5. **Salary negotiation script** — anchored 15–20% above the RECON salary benchmark mid-point, with exact counter-offer language
6. **5 strategic questions to ask the interviewer**
7. **3 recent news items** to reference naturally in conversation

---

### Budget and safety controls (GUARDIAN)

GUARDIAN runs as a gating layer before every TAILOR and SUBMIT action. It cannot be bypassed by any agent.

| Control | Default | Configurable in |
|---|---|---|
| Daily budget cap | $5.00 (hard stop) | `orbitapply.json` → `budget.dailyLimitUSD` |
| Budget alert threshold | $3.00 (warn) | `orbitapply.json` → `budget.alertAtUSD` |
| Max applications per day | 15 | `orbitapply.json` → `guardian.maxAppliesPerDay` |
| Rate limit between submits | 45 seconds | `orbitapply.json` → `guardian.rateLimitMs` |
| Human pause fields | salary, diversity, custom_essay, security_clearance | `orbitapply.json` → `guardian.humanPauseFields` |

---

## Agent summary

| Agent | Model | Role |
|---|---|---|
| **ORBI** | Claude Sonnet | Master orchestrator — sequences all agents, streams progress, enforces fit threshold |
| **SCOUT** | No AI (pure JS) | Job discovery via Tavily — 15 parallel searches, local fit scoring |
| **RECON** | Claude Haiku | Company intelligence — culture, salary, funding, red flags |
| **TAILOR** | Claude Sonnet | Resume tailoring + cover letter writing per JD |
| **GUARDIAN** | No AI (pure JS) | Safety layer — budget, rate limits, blacklist, human queue |
| **SUBMIT** | Claude Haiku | Playwright-based form fill and submission (off by default) |
| **LEDGER** | No AI (pure JS) | Pipeline tracker — status, stats, follow-up reminders |
| **COACH** | Claude Sonnet | Interview prep — activated on phone_screen/interview stage change |

---

## Prerequisites

Before you start, install:

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **pnpm** — install with `npm install -g pnpm` after Node.js
- **Git** — [git-scm.com](https://git-scm.com)

---

## API Keys

OrbitApply requires two API keys.

### 1. Anthropic Claude (required)

All AI writing — resume tailoring, cover letters, company intelligence, interview coaching — runs on Claude.

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** → **Create Key**
3. Copy the key — it starts with `sk-ant-`

### 2. Tavily (required)

SCOUT and RECON use Tavily for all web searches.

1. Sign up at [tavily.com](https://tavily.com)
2. Go to your dashboard → copy your API key
3. The key starts with `tvly-`

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/OrbitApply.git
cd OrbitApply
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up your environment file

```bash
cp .env.example .env
```

Open `.env` and fill in your real keys:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
TAVILY_API_KEY=tvly-your-key-here
PORT=3000
NODE_ENV=development
```

> **Never commit `.env` to version control.** It is already in `.gitignore`.

### 4. Set up your candidate profile

`memory/profile.json` is your personal data file. It is gitignored and must be created manually.

```bash
# Mac/Linux
mkdir -p memory && touch memory/profile.json

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path memory
New-Item -ItemType File -Path memory\profile.json
```

Paste this template into `memory/profile.json` and fill in your information:

```json
{
  "name": "Your Full Name",
  "title": "Your Current Job Title",
  "email": "your@email.com",
  "phone": "+1 555 000 0000",
  "location": "City, State",
  "linkedinUrl": "https://linkedin.com/in/yourprofile",
  "githubUrl": "https://github.com/yourusername",
  "targetRoles": ["Director of AI", "Head of AI", "VP of AI"],
  "targetLocations": ["Remote", "New York, NY"],
  "remotePreference": "remote",
  "targetIndustries": ["SaaS", "Fintech", "Enterprise Software"],
  "salaryCurrency": "USD",
  "salaryMin": 150000,
  "salaryMax": 250000,
  "yearsExperience": 8,
  "skills": ["AI Strategy", "LLM", "Agentic AI", "Python", "Node.js", "AWS"],
  "orbitPositioningStatement": "AI Director delivering measurable revenue outcomes through agentic systems and AI transformation.",
  "coverLetterTone": "orbit-framework",
  "education": [
    {
      "degree": "B.S. Computer Science",
      "school": "University Name",
      "year": 2016
    }
  ],
  "resume": {
    "path": "memory/resume.md",
    "summary": "One to two sentence professional summary."
  }
}
```

### 5. Create your base resume

Create `memory/resume.md` with your resume in Markdown format. TAILOR rewrites bullet language for each job — it never invents experience, so keep this file factual and complete.

```bash
# Mac/Linux
touch memory/resume.md

# Windows (PowerShell)
New-Item -ItemType File -Path memory\resume.md
```

### 6. Create required runtime directories and seed files

These directories and files are gitignored and must be created locally before first run:

```bash
# Mac/Linux
mkdir -p sessions credentials logs Apply
echo '{}' > sessions/sessions.json
echo '{"companies":[]}' > memory/blacklist.json
echo '{"contacts":[]}' > memory/protected.json
```

```powershell
# Windows (PowerShell)
foreach ($dir in @("sessions","credentials","logs","Apply")) {
  New-Item -ItemType Directory -Force -Path $dir
}
Set-Content -Path sessions\sessions.json -Value '{}'
Set-Content -Path memory\blacklist.json -Value '{"companies":[]}'
Set-Content -Path memory\protected.json -Value '{"contacts":[]}'
```

---

## Running the app

### Development mode (recommended — auto-restarts on file changes)

```bash
pnpm dev
```

### Production mode

```bash
pnpm start
```

Open your browser:

```
http://localhost:3000
```

No login required. The app is bound to `127.0.0.1` and is never accessible from the network.

---

## Daily usage

1. Open `http://localhost:3000`
2. Click **Run** and set your goal (role, location, urgency)
3. Watch the live progress: SCOUT → RECON → TAILOR → LEDGER
4. Review SCOUT results — approve or reject individual jobs if you wish (the pipeline works automatically based on fit score)
5. Check the **Documents** section to review your tailored resume and cover letter for each job
6. When a real response arrives, update the application status in the pipeline board
7. When a stage reaches **Phone Screen** or **Interview**, COACH automatically generates your prep pack

---

## Enabling auto-submit

SUBMIT is disabled by default. To enable automated form filling, add the following to `orbitapply.json`:

```json
"submit": {
  "autoSubmit": true
}
```

> With auto-submit enabled, GUARDIAN still enforces all limits. Applications with sensitive fields (salary, diversity, custom essay, security clearance) are always routed to the human review queue, never submitted automatically.

---

## Blacklisting companies

To prevent OrbitApply from ever finding, tailoring, or applying to a company, add it to `memory/blacklist.json`:

```json
{
  "companies": ["CompanyName", "another-company.com"]
}
```

GUARDIAN checks this list at the SCOUT filter stage and again before every TAILOR and SUBMIT action.

---

## Budget controls

The default daily spend cap is **$5 USD** across all Anthropic API calls. Configurable in `orbitapply.json`:

```json
"budget": {
  "dailyLimitUSD": 5,
  "hardStop": true,
  "alertAtUSD": 3
}
```

Approximate cost per full run (SCOUT + RECON + TAILOR for 5 jobs): **$0.40–$0.80**

---

## Project structure

```
OrbitApply/
├── agents/              # Agent identity and rules (SOUL.md per agent)
│   ├── orbi/
│   ├── scout/
│   ├── recon/
│   ├── tailor/
│   ├── guardian/
│   ├── submit/
│   ├── ledger/
│   └── coach/
├── src/
│   ├── routes/          # Express API routes (/api/v1/*)
│   ├── services/        # Agent service modules (one file per agent)
│   └── utils/           # Logger, constants, file store
├── ui/                  # Frontend (served by Express at /)
├── memory/              # profile.json, resume.md, blacklist.json (gitignored)
├── sessions/            # Active session state (gitignored)
├── credentials/         # Auth profiles (gitignored)
├── logs/                # Runtime logs (gitignored)
├── Apply/               # All generated application documents
│   └── applications/
│       └── {Company} — {Job Title}/
│           ├── {Title}_{Company}_Resume_{Name}.doc
│           ├── {Title}_{Company}_Coverletter_{Name}.doc
│           └── metadata.json
├── workspace-scout/     # Daily job search results (gitignored)
├── workspace-recon/     # Company intelligence profiles (gitignored)
├── workspace-tailor/    # Fallback document workspace (gitignored)
├── workspace-ledger/    # pipeline.json — application tracker (gitignored)
├── workspace-coach/     # Interview prep packs (gitignored)
├── .env.example         # Environment variable template
├── orbitapply.json      # Agent configuration, budget, guardian settings
├── index.js             # Express server entry point
└── package.json
```

---

## Logs

| File | Contents |
|---|---|
| `logs/run.log` | Full pipeline run logs |
| `logs/app.log` | Server errors |
| `logs/agent-actions.log` | Every agent delegation and action |

---

## Security

- Server binds to `127.0.0.1` only — never accessible from the network
- All API keys are in `.env` — never hardcoded, never committed
- No authentication required — physical access to the machine is the only gate
- Never expose this app beyond localhost

---

## Troubleshooting

**`pnpm: command not found`**
Run `npm install -g pnpm` first.

**`Cannot find module` on startup**
Run `pnpm install` to restore dependencies.

**`No target roles found in profile`**
Open `memory/profile.json` and make sure `targetRoles` is a non-empty array.

**SCOUT returns zero results**
Check your `TAVILY_API_KEY` in `.env`. Verify remaining credits on your Tavily dashboard. SCOUT runs 15 queries — if all return nothing, the key is likely invalid or exhausted.

**Budget hard stop at startup**
The $5 daily cap was already reached today. Either wait until midnight or raise `dailyLimitUSD` in `orbitapply.json`.

**TAILOR documents look generic**
Ensure `memory/resume.md` has complete, detailed content. Also check that `orbitPositioningStatement` in your profile accurately reflects your seniority and specialisation — TAILOR uses it in every summary section.

**SUBMIT fails on a form**
Disable `autoSubmit` for that session and submit manually. Review the screenshots in `workspace-submit/` to see where the form failed.

---

## License

OrbitumAI Free License — free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
