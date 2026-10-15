# GrayCo CRM

Live build: see `version.txt` (currently **33.142**).

- `index.html` — the whole CRM (single page).
- `netlify/functions/` — server functions (email, AI, QuickBooks, Google, Team access, nightly backup, lead and money intake).
- `netlify.toml`, `_headers` — Netlify settings (publish folder, function folder, nightly backup schedule, security headers).
- `docs/GO-LIVE-33.142.md` — the go-live checklist, in order (links to SECURITY-SETUP, FRESH-START and FILE-STORAGE).
- `docs/BUILD-33.142.md` — what changed in this build.

Never commit `backup.json`, API keys or passwords to this repository.
