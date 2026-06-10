# Design: `start orbitapply` terminal command

**Date:** 2026-06-10  
**Status:** Approved

---

## Problem

Users currently launch OrbitApply by typing `pnpm dev` from the project directory. The goal is to let users type `start orbitapply` instead — matching the UX of the existing `start-windows.bat` (production mode + auto-opens browser at localhost:3000).

## Scope

- Windows only, project directory only (user must `cd` to the project folder first)
- Production mode (`node index.js`), not hot-reload mode
- Behaviour identical to double-clicking `start-windows.bat`

---

## Solution

### New file: `orbitapply.bat`

A thin wrapper in the project root that delegates to `start-windows.bat`:

```bat
@echo off
call "%~dp0start-windows.bat"
```

`%~dp0` resolves to the directory containing the batch file, so the call works regardless of the terminal's current working directory as long as the file is invoked from within the project folder.

When the user types `start orbitapply` in CMD or PowerShell, Windows resolves `.bat` via PATHEXT and finds `orbitapply.bat` in the current directory — no PATH modification required.

**No changes to `start-windows.bat`** — all logic (Node/pnpm checks, `.env` validation, dependency install, browser auto-open, `node index.js`) stays there.

### Rationale for keeping both files

- `start-windows.bat` — discoverable name for File Explorer / double-click users
- `orbitapply.bat` — clean terminal command; the name matches the project

---

## Doc changes

| File | Change |
|------|--------|
| `orbitapply.bat` | New file (created) |
| `CLAUDE.md` | Add `start orbitapply` to Commands section as user-facing launch command |
| `README.md` | Add `start orbitapply` to "Running the app" section as primary Windows terminal command |
| `SETUP.md` | Replace `pnpm dev` in Windows Step 11 with `start orbitapply`; add dev note for hot reload |

---

## What is NOT changing

- `start-windows.bat` content — untouched
- `pnpm dev` / `pnpm start` scripts — untouched
- No new dependencies
- No PATH changes required
