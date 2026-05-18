# Changelog

All notable changes to OrbitApply are documented here.

---

## [1.3.0] — 2026-05-17

### Added
- **Configurable SCOUT result cap** — `orbitapply.json` → `scout.maxResults` (default: 50) controls how many scored jobs SCOUT keeps per run. Previously hardcoded to 20 in `extractAndScoreJobs`. Falls back to 20 if the key is missing or invalid, so existing configs keep working.

### Improved
- `src/services/scout.js` — LinkedIn job-search tuning. Queries now target the individual-posting path (`site:linkedin.com/jobs/view`) instead of the broad `linkedin.com/jobs` path, which surfaced `/jobs/search` & `/jobs/results` pages that `isJobDetailUrl()` then rejected. Added a dedicated LinkedIn pass for the highest-intent (goal) term. No new search queries beyond the goal term — total stays within the 15-query cap, so search-provider cost is unchanged. No LinkedIn login or scraping — public indexed postings only.

---

## [1.2.0] — 2026-05-15

### Added
- **PDF generation** — TAILOR now produces polished A4 PDF resumes and cover letters (`pdfkit`) with a structured layout: header band, section rules, two-column competencies, smart page breaks, and page numbers. Falls back to `.txt` if PDF generation fails. Output lands in `Apply/applications/<Company> - <Title>/`.
- **GenAI interview question bank** — `src/data/genaiInterviewBank.js`, an original 32-question bank across 9 categories (LLM fundamentals, RAG, agents, fine-tuning, prompt/context engineering, evaluation, governance, production/cost, AI strategy & leadership), tagged by level and role. Owned content — no third-party material.
- **COACH on-demand** — `POST /api/v1/documents/:id/prep` plus "Generate / Refresh" and "View Prep Pack" buttons in the Pipeline application modal. COACH no longer requires moving an application to an interview stage to run, and its output is now visible in the UI.

### Improved
- `src/services/scout.js` — company-extraction overhaul. Now resolves employers from `@Company`, `Company hiring …`, `… at Company`, and trailing `- Company` title patterns, from job-snippet text (`brand.ai is hiring`, `<Name> is the #1 …`), and from company-owned career hosts (`jobs.<co>.com`). Aggregators/job boards (ZipRecruiter, Remotive, Virtual Vocations, iCIMS, etc.) and locations are rejected rather than mis-labeled. ZipRecruiter browse/search pages are no longer ingested as jobs.
- `src/services/tailor.js` — resume prompt is now industry-aware (infers target industry from the job + `profile.targetIndustries`), carries education/certifications through explicitly, and no longer truncates the base resume mid-section.
- `src/services/coach.js` — the technical/domain section is now grounded in the vetted question bank, role-weighted by seniority, instead of model-improvised questions.

---

## [1.1.0] — 2026-05-15

### Added
- `src/config/jobSites.js` — centralised job site configuration with 40+ sources
- `CONTRIBUTING.md` — contributor guide
- `SETUP.md` — detailed Windows and Mac setup guide
- `CHANGELOG.md` — version history
- Scout quality thresholds in `orbitapply.json` (`minDisplayScore`, `minQualifiedScore`)
- Executive and leadership job boards (The Ladders, ExecThread, Chief Executive)
- AI specialist job boards (ai-jobs.net, aijobboard.com)
- Staffing and recruiting agency sources (83zero, Robert Half, Korn Ferry, Heidrick & Struggles)

### Fixed
- `guardian.js` — blacklist and protected contacts not iterable bug (JSON object vs array mismatch)
- `package.json` — description encoding error

### Improved
- `agents/tailor/SOUL.md` — upgraded with strict ORBIT quality rules, banned phrases list, quality self-check, ATS scoring breakdown, and stricter cover letter structure
- `src/services/scout.js` — now imports domains and platform resolver from `jobSites.js` config

---

## [1.0.0] — 2026-05-14

### Initial Release
- ORBI — master orchestrator agent (Claude Sonnet)
- SCOUT — job discovery via Tavily with local fit scoring (no AI cost)
- RECON — company intelligence agent (Claude Haiku)
- TAILOR — resume and cover letter generator using ORBIT Framework (Claude Sonnet)
- GUARDIAN — safety layer: budget caps, rate limits, blacklist, human queue
- SUBMIT — Playwright-based form fill (off by default)
- LEDGER — pipeline tracker with follow-up reminders
- COACH — interview prep generator triggered on stage change (Claude Sonnet)
- Dashboard UI at localhost:3000
- Pipeline board with drag-and-drop stage management
- Manual job import via URL
- Daily budget cap ($5 default)
- Human review queue for sensitive form fields
- Blacklist and protected contacts support
- Mac and Windows launch scripts
