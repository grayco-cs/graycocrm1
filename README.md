# GrayCo CRM

Live build: see `version.txt` (currently **33.141**).

- `index.html` — the whole CRM (single page).
- `netlify/functions/` — server functions (email, AI, QuickBooks, Google, Team access, nightly backup, lead and money intake).
- `netlify.toml`, `_headers` — Netlify settings (publish folder, function folder, nightly backup schedule, security headers).
- `docs/SECURITY-SETUP.md` — the owner's step-by-step to switch on the company sign-in and lock the database. Follow it in order.
- `docs/BUILD-33.141.md` — what changed in this build.

Never commit `backup.json`, API keys or passwords to this repository.
