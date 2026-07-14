# OrbitApply — Setup Guide

Complete setup instructions for Windows and Mac.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | v18 or later | [nodejs.org](https://nodejs.org) |
| pnpm | Latest | `npm install -g pnpm` |
| Git | Latest | [git-scm.com](https://git-scm.com) |

---

## API Keys Required

| Service | Purpose | Get Key |
|---|---|---|
| xAI Grok | Resume tailoring, company intel, interview prep | [console.x.ai](https://console.x.ai) |
| Tavily | Job search and company research | [tavily.com](https://tavily.com) |

---

## Windows Setup

### 1. Install Node.js
- Download the LTS installer from [nodejs.org](https://nodejs.org)
- Run the installer — check "Automatically install necessary tools"
- Close and reopen PowerShell after install

### 2. Fix PowerShell execution policy
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 3. Add Node to PATH (if npm not found)
```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\nodejs", "User")
```
Close and reopen PowerShell.

### 4. Install pnpm
```powershell
npm install -g pnpm
```

If pnpm not found after install:
```powershell
$env:PATH += ";C:\Users\YOUR-USERNAME\AppData\Roaming\npm"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Users\YOUR-USERNAME\AppData\Roaming\npm", "User")
```

### 5. Install Git
- Download from [git-scm.com](https://git-scm.com) — run with all defaults
- If git not found: `$env:PATH += ";C:\Program Files\Git\cmd"`

### 6. Clone and install
```powershell
git clone https://github.com/Orbitumaiopensource/Orbitapply.git
cd Orbitapply
pnpm install
```

### 7. Set up environment
```powershell
copy .env.example .env
notepad .env
```
Fill in your API keys.

### 8. Create required folders and files
```powershell
foreach ($dir in @("sessions","credentials","logs","Apply","memory")) {
  New-Item -ItemType Directory -Force -Path $dir
}
Set-Content -Path sessions\sessions.json -Value '{}'
Set-Content -Path memory\blacklist.json -Value '{"companies":[]}'
Set-Content -Path memory\protected.json -Value '{"contacts":[]}'
```

### 9. Create your profile
```powershell
notepad memory\profile.json
```
See `memory/profile.json` template in README.

### 10. Create your resume
```powershell
notepad memory\resume.md
```
Paste your resume in Markdown format.

### 11. Run
```
start orbitapply
```
This opens OrbitApply in your browser automatically.

> **For developers:** Use `pnpm dev` instead to run with nodemon hot reload.

Open [http://localhost:3000](http://localhost:3000)

---

## Mac Setup

### 1. Install Node.js
```bash
brew install node
```
Or download from [nodejs.org](https://nodejs.org)

### 2. Install pnpm
```bash
npm install -g pnpm
```

### 3. Clone and install
```bash
git clone https://github.com/Orbitumaiopensource/Orbitapply.git
cd Orbitapply
pnpm install
```

### 4. Set up environment
```bash
cp .env.example .env
nano .env
```
Fill in your API keys.

### 5. Create required folders and files
```bash
mkdir -p sessions credentials logs Apply memory
echo '{}' > sessions/sessions.json
echo '{"companies":[]}' > memory/blacklist.json
echo '{"contacts":[]}' > memory/protected.json
touch memory/profile.json
touch memory/resume.md
```

### 6. Run
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Troubleshooting

| Error | Fix |
|---|---|
| `npm: command not found` | Close and reopen terminal after Node install |
| `pnpm: command not found` | Add npm global folder to PATH (see step 4 above) |
| `git: command not found` | Add Git to PATH or reinstall Git |
| `Cannot find module` | Run `pnpm install` again |
| `No target roles found` | Check `targetRoles` array in `memory/profile.json` |
| `blacklist is not iterable` | Run: `Set-Content -Path memory\blacklist.json -Value '{"companies":[]}'` |
| SCOUT returns zero results | Check `TAVILY_API_KEY` in `.env` and Tavily credit balance |
| Budget hard stop | Raise `dailyLimitUSD` in `orbitapply.json` |
| TAILOR documents look generic | Add more detail and real numbers to `memory/resume.md` |

---

## Daily Usage

1. Open [http://localhost:3000](http://localhost:3000)
2. Type your target role and click **Start Job Search Run**
3. Review SCOUT Results
4. Check tailored documents in `Apply/applications/`
5. Update application status in Pipeline when responses arrive
6. COACH auto-generates interview prep on Phone Screen / Interview stage

---

## Cost Estimate

| Action | Approx Cost |
|---|---|
| Full run — 5 jobs (SCOUT + RECON + TAILOR) | $0.40–$0.80 |
| RECON only — per company | $0.05–$0.10 |
| TAILOR only — per job | $0.08–$0.15 |
| COACH — per interview prep | $0.05–$0.10 |
| Daily cap (default) | $5.00 |

---

Built by [OrbitumAI](https://orbitumai.com)
