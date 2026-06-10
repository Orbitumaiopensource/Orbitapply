# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm install` — install dependencies (pnpm only; `pnpm-lock.yaml` is the lockfile, not `package-lock.json`)
- `start orbitapply` — user-facing launch command (Windows, from project folder); production mode, auto-opens browser at http://localhost:3000. Delegates to `start-windows.bat`.
- `pnpm dev` — run with nodemon (hot reload), serves UI + API at http://localhost:3000
- `pnpm start` — run without reload
- `pnpm test` — Jest (`--passWithNoTests`; there is currently no test suite)
- `pnpm test -- <pattern>` — run a single test file/pattern once tests exist
- `pnpm coverage` — Jest with coverage
There is no build step or linter configured. Node v18+ required.

## Architecture

OrbitApply is a single-user, **localhost-only** Express app (`index.js`) that orchestrates 7 AI agents into a job-search pipeline. The server binds to `127.0.0.1` only — never change `HOST` to `0.0.0.0` or expose it publicly.

### Request flow
`index.js` mounts all routes under `/api/v1/*` and serves the static UI from `ui/` (SPA fallback to `ui/index.html` for non-`/api` paths). Routes (`src/routes/`) are thin HTTP layers; all real logic lives in `src/services/`. One service file per agent, mirrored by a `SOUL.md` and (for most) a route — see the table in `AGENTS.md`, which is the authoritative agent map.

### The agent pipeline (`src/services/orbi.js`)
ORBI is the orchestrator. A "run" is fire-and-forget: `startRun()` returns immediately and `executeRun()` proceeds in the background while the UI polls `getRunStatus()` for live step state (`currentRun` is in-memory module state — a single run at a time). Sequence:

```
SCOUT (no AI, pure JS scoring) → RECON (Haiku) → GUARDIAN preflight → TAILOR (Sonnet) → LEDGER (no AI) → COACH (Sonnet, on stage change / on demand)
```

Gating uses `FIT_SCORE_MIN` / `TAILOR_SCORE_MIN` from `src/utils/constants.js`. GUARDIAN runs a preflight check before each TAILOR with verdicts `HARD_STOP` (abort run) / `BLOCK` / `PAUSE` (human review) / proceed. API rate/usage-limit errors short-circuit the remaining RECON/TAILOR loop rather than failing the whole run (`isApiLimitError`).

### Agent execution model (`src/services/agentBase.js`)
All AI agents go through `runAgent(agentId, userPrompt, sessionId, extraContext)`:
- The agent's system prompt is its `agents/<id>/SOUL.md` file (read fresh each call). **Always read the relevant `SOUL.md` before modifying an agent service** — the SOUL defines the contract the code parses.
- Model is resolved per-agent from `orbitapply.json` (`agents.overrides[id].model` → `agents.defaults.model`). `src/utils/constants.js` `AGENT_MODELS` documents the intended mapping (ORBI/TAILOR/COACH = Sonnet; rest = Haiku).
- Every call has a timeout (`AGENT_TIMEOUTS_MS`), persists the transcript to `sessions/sessions.json` (capped at 200), and maps API errors to user-safe messages.
- AI agents that return structured data rely on `parseJSONFromContent()` — the SOUL must instruct the model to emit a parseable JSON block.

### Configuration & state
- `orbitapply.json` — runtime config: models, budget caps, GUARDIAN limits, scout thresholds, workspace paths. Read at runtime via `readJSON`; not all keys are mirrored in `constants.js` (e.g. expanded `guardian.humanPauseFields`).
- `src/utils/constants.js` — hardcoded defaults/thresholds (budget $5/day, 15 applies/day, 45s rate limit, score minimums, pipeline stages).
- `src/config/jobSites.js` — single source of all job sources. Add a site here (one line); do not hardcode sites in `scout.js`.
- `src/utils/searchProvider.js` — 7-provider waterfall (Tavily → Brave → SerpAPI → Bing → Google → Jina → DuckDuckGo). Fallback order is intentional; DuckDuckGo needs no key.
- `src/data/genaiInterviewBank.js` — COACH's question bank. Original content only; never paste third-party question lists.
- `src/utils/fileStore.js` — all JSON/log persistence (`readJSON`/`writeJSON`/`appendLog`/`ensureFile`); auto-creates parent dirs. All persistence is flat files — there is no database.
- `src/utils/logger.js` — Winston logger. Use it, not `console.log`.

### User data (do not touch)
`memory/` (profile.json, resume.md, blacklist.json, protected.json), `Apply/` (generated PDFs), `credentials/`, `sessions/`, `logs/` are user-private and gitignored. Never read, modify, or commit them.

## Conventions & guardrails

These come from `AGENTS.md` and `.cursorrules` (note: `.cursorrules` describes an older sibling project — its stack section is stale; the rules below are the parts that apply here):

- pnpm exclusively — never `npm` or `yarn`. Do not add dependencies without being asked.
- All external API calls go through `src/services/` — never inline in routes or UI. Wrap in try/catch; log the real error, surface a generic message to the client (never raw API errors/stack traces/status codes to the frontend).
- Never modify `agents/guardian/SOUL.md` safety rules.
- TAILOR renders PDFs via `pdfkit`; keep the `.txt` fallback path intact.
- Ask before: paid external API calls, modifying `.env`/config, installing deps, anything that would expose the app beyond localhost.
- `src/services/tailor.js.backup` is a stale backup — ignore it; edit `tailor.js`.
