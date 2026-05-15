# Changelog

All notable changes to OrbitApply are documented here.

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
