# start orbitapply Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users launch OrbitApply from the project folder by typing `start orbitapply` in CMD or PowerShell instead of `pnpm dev`.

**Architecture:** Add `orbitapply.bat` as a thin wrapper that delegates to the existing `start-windows.bat` (production mode + auto-opens browser). Update three doc files to reference the new command. No logic moves — `start-windows.bat` stays unchanged.

**Tech Stack:** Windows batch scripting, Markdown

---

### Task 1: Create `orbitapply.bat`

**Files:**
- Create: `orbitapply.bat`

- [ ] **Step 1: Create the file**

Create `orbitapply.bat` in the project root with this exact content:

```bat
@echo off
call "%~dp0start-windows.bat"
```

`%~dp0` expands to the drive + path of the batch file itself (always ends with `\`), so the call resolves correctly regardless of where the terminal is positioned as long as `orbitapply.bat` lives in the project root.

- [ ] **Step 2: Verify the file exists**

```powershell
Test-Path C:\Users\subha\Orbitapply\orbitapply.bat
```

Expected output: `True`

- [ ] **Step 3: Verify the content is correct**

```powershell
Get-Content C:\Users\subha\Orbitapply\orbitapply.bat
```

Expected output:
```
@echo off
call "%~dp0start-windows.bat"
```

- [ ] **Step 4: Commit**

```powershell
git add orbitapply.bat
git commit -m "feat: add orbitapply.bat so users can type 'start orbitapply' to launch"
```

---

### Task 2: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (Commands section, lines 7–13)

- [ ] **Step 1: Edit the Commands section**

Replace this block in `CLAUDE.md`:

```markdown
- `pnpm install` — install dependencies (pnpm only; `pnpm-lock.yaml` is the lockfile, not `package-lock.json`)
- `pnpm dev` — run with nodemon (hot reload), serves UI + API at http://localhost:3000
- `pnpm start` — run without reload
- `pnpm test` — Jest (`--passWithNoTests`; there is currently no test suite)
- `pnpm test -- <pattern>` — run a single test file/pattern once tests exist
- `pnpm coverage` — Jest with coverage
There is no build step or linter configured. Node v18+ required.
```

With:

```markdown
- `pnpm install` — install dependencies (pnpm only; `pnpm-lock.yaml` is the lockfile, not `package-lock.json`)
- `start orbitapply` — user-facing launch command (Windows, from project folder); production mode, auto-opens browser at http://localhost:3000. Delegates to `start-windows.bat`.
- `pnpm dev` — run with nodemon (hot reload), serves UI + API at http://localhost:3000
- `pnpm start` — run without reload
- `pnpm test` — Jest (`--passWithNoTests`; there is currently no test suite)
- `pnpm test -- <pattern>` — run a single test file/pattern once tests exist
- `pnpm coverage` — Jest with coverage
There is no build step or linter configured. Node v18+ required.
```

- [ ] **Step 2: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs: add start orbitapply to CLAUDE.md commands"
```

---

### Task 3: Update `README.md`

**Files:**
- Modify: `README.md` (Running the app section, ~lines 393–413)

- [ ] **Step 1: Edit the Running the app section**

Replace this block in `README.md`:

```markdown
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
```

With:

```markdown
## Running the app

### Windows terminal (recommended)

From the project folder:

```
start orbitapply
```

This runs production mode and automatically opens http://localhost:3000 in your browser.

### Development mode (hot reload — for code changes)

```bash
pnpm dev
```

### Production mode (no reload)

```bash
pnpm start
```

Open your browser:

```
http://localhost:3000
```

No login required. The app is bound to `127.0.0.1` and is never accessible from the network.
```

- [ ] **Step 2: Commit**

```powershell
git add README.md
git commit -m "docs: add start orbitapply to README running the app section"
```

---

### Task 4: Update `SETUP.md`

**Files:**
- Modify: `SETUP.md` (Windows Step 11, ~lines 95–99)

- [ ] **Step 1: Edit Windows Step 11**

Replace this block in `SETUP.md`:

```markdown
### 11. Run
```powershell
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000)
```

With:

```markdown
### 11. Run
```
start orbitapply
```
This opens OrbitApply in your browser automatically.

> **For developers:** Use `pnpm dev` instead to run with nodemon hot reload.

Open [http://localhost:3000](http://localhost:3000)
```

- [ ] **Step 2: Commit**

```powershell
git add SETUP.md
git commit -m "docs: update SETUP.md Windows step 11 to use start orbitapply"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Open a new PowerShell window and navigate to the project**

```powershell
cd C:\Users\subha\Orbitapply
```

- [ ] **Step 2: Run the command**

```
start orbitapply
```

Expected: a new CMD window opens titled "OrbitApply", the startup checks run, and the browser opens at http://localhost:3000 after ~4 seconds.

- [ ] **Step 3: Verify `start-windows.bat` still works independently**

Double-click `start-windows.bat` from File Explorer.

Expected: same behavior as above — app starts, browser opens.
