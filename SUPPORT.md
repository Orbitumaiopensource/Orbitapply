# Support

## Getting Help

### 1. Check the docs first

- [SETUP.md](SETUP.md) — full installation guide for Windows and Mac
- [README.md](README.md) — feature overview and daily usage
- [CHANGELOG.md](CHANGELOG.md) — recent fixes and known issues

### 2. Search existing issues

Someone may have already solved your problem:
[github.com/Orbitumaiopensource/Orbitapply/issues](https://github.com/Orbitumaiopensource/Orbitapply/issues)

### 3. Join Discord

The fastest way to get help:
[discord.gg/ZamMu766Q](https://discord.gg/ZamMu766Q)

Post in `#bugs-and-fixes` with:
- Your OS and Node.js version
- The error message
- Relevant output from `logs/app.log`

### 4. Open a GitHub Issue

If you've confirmed it's a bug:
[Open a Bug Report](https://github.com/Orbitumaiopensource/Orbitapply/issues/new?template=bug-report.yml)

---

## Common Issues

| Problem | Fix |
|---|---|
| `blacklist is not iterable` | `Set-Content -Path memory\blacklist.json -Value '{"companies":[]}'` |
| `pnpm: command not found` | Add npm global to PATH — see SETUP.md |
| `npm: command not found` | Close and reopen terminal after installing Node.js |
| SCOUT returns zero results | Check API keys in `.env` — DuckDuckGo needs no key |
| Budget hard stop | Raise `dailyLimitUSD` in `orbitapply.json` |
| Documents look generic | Add real numbers and achievements to `memory/resume.md` |
| `Cannot find module` | Run `pnpm install` again |

---

## What We Don't Support

- Custom modifications to the codebase (we can advise but can't debug your fork)
- Issues caused by using unsupported Node.js versions (use v18+)
- Third-party ATS platform behavior (Workday, Greenhouse, Lever ToS questions)

---

*Built by OrbitumAI — [orbitumai.com](https://orbitumai.com)*
