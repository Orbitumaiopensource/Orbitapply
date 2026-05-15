# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.1.x | ✅ Yes |
| 1.0.x | ⚠️ Critical fixes only |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities as public GitHub issues.**

If you discover a security vulnerability, report it privately:

1. Go to the [Security tab](https://github.com/Orbitumaiopensource/Orbitapply/security) on GitHub
2. Click **"Report a vulnerability"**
3. Or contact directly via [LinkedIn](https://www.linkedin.com/in/shuv)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

You will receive a response within 48 hours. We take all security reports seriously.

## Security Design

OrbitApply is designed with privacy and security as defaults:

- **Local only** — server binds to `127.0.0.1`, never accessible from the network
- **No telemetry** — zero data collection, no analytics, no tracking
- **Keys in .env** — API keys are never hardcoded or committed
- **Personal data gitignored** — `memory/`, `Apply/`, `sessions/`, `credentials/` are all gitignored
- **GUARDIAN agent** — enforces safety limits that cannot be bypassed by any other agent
- **No auto-submit by default** — SUBMIT agent is off unless explicitly enabled

## Known Limitations

- OrbitApply has no authentication — physical access to the machine is the security boundary
- Never expose the app beyond localhost (do not use port forwarding or ngrok)
- Auto-submit (when enabled) interacts with third-party ATS platforms — review their ToS

## Responsible Disclosure

We follow responsible disclosure. If you report a valid security issue, we will:
- Acknowledge receipt within 48 hours
- Fix and release a patch within 7 days for critical issues
- Credit you in the CHANGELOG (unless you prefer anonymity)
