# Contributing to OrbitApply

Thank you for your interest in contributing to OrbitApply — the open source AI job search and application system.

---

## Ways to Contribute

- **Bug fixes** — fix issues listed in [GitHub Issues](https://github.com/Orbitumaiopensource/Orbitapply/issues)
- **New job sites** — add sources to `src/config/jobSites.js`
- **New ATS platforms** — extend the pipeline for additional job board integrations
- **Agent improvements** — upgrade SOUL.md files in `agents/`
- **Documentation** — improve README, SETUP, or inline docs
- **Tests** — add Jest tests in `src/tests/`

---

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/Orbitapply.git`
3. Follow `SETUP.md` to get running locally
4. Create a branch: `git checkout -b fix/your-fix-name`
5. Make your changes
6. Test locally: `pnpm dev`
7. Commit: `git commit -m "fix: describe your change"`
8. Push: `git push origin fix/your-fix-name`
9. Open a Pull Request

---

## Commit Message Format

Use conventional commits:

```
feat: add new job site to config
fix: resolve blacklist parsing error
docs: update README setup steps
refactor: clean up scout scoring logic
test: add guardian unit tests
```

---

## Adding a New Job Site (Easiest Contribution)

Open `src/config/jobSites.js` and add one line:

```javascript
{ domain: 'yourjobsite.com', name: 'yourjobsite', type: 'direct', active: true },
```

Types:
- `ats` — direct applicant tracking system
- `aggregator` — job board aggregator
- `specialist` — niche/specialist board
- `direct` — company or recruiter direct site

---

## Code Style

- JavaScript (Node.js) — no TypeScript required
- No external linter enforced — keep it readable
- Comment complex logic
- Keep functions small and single-purpose

---

## Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Your OS and Node.js version
- Relevant log output from `logs/app.log`

---

## Questions

Open a GitHub Discussion or Issue — we respond to all of them.

---

Built by [OrbitumAI](https://orbitumai.com)
