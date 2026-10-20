# GrayCo CRM

Live build: see `version.txt` (currently **33.147**).

- `index.html` — the whole CRM (single page).
- `netlify/functions/` — server functions (email, AI, QuickBooks, Google, Team access, nightly backup, lead and money intake, customer portal, subcontractor portal).
- `netlify.toml`, `_headers` — Netlify settings (publish folder, function folder, nightly backup schedule, security headers, the roofscout. and portal. addresses).
- `roofscout/` — RoofScout (roofscout.grayco-cs.com and the 🏠 RoofScout tab).
- `subportal/` — the subcontractor portal as served (portal.grayco-cs.com and the 🔨 Sub Portal tab), built from `subportal-app/` with `npm run build`.
- `docs/GO-LIVE-33.143.md` — the go-live checklist, in order (links to SECURITY-SETUP, FRESH-START and FILE-STORAGE).
- `docs/SUBPORTAL-SETUP.md` — the subcontractor portal: what it does and its one-time setup.
- `docs/BUILD-33.147.md` — what changed in this build.

Never commit `backup.json`, API keys or passwords to this repository.
