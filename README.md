# GrayCo CRM

Live build: see `version.txt` (currently **33.143**).

- `index.html` — the whole CRM (single page).
- `netlify/functions/` — server functions (email, AI, QuickBooks, Google, Team access, nightly backup, lead and money intake).
- `netlify.toml`, `_headers` — Netlify settings (publish folder, function folder, nightly backup schedule, security headers, the roofscout., portal. and bids. addresses).
- `portal.html` + `portal-app.js` — the GrayCo Portal (portal.grayco-cs.com): sign-in, the customer portal and the sub portal. Server: `netlify/functions/portal.js` (customer job page) and `netlify/functions/portal-access.js` (sign-in, links, the sub portal, messages). Guide: `docs/SUB-PORTAL.md`.
- `subportal/` — the bid site as served (bids.grayco-cs.com and the 🔨 Sub Portal tab), built from `subportal-app/` with `npm run build`. Server: `netlify/functions/subportal.js`. Guide: `docs/SUBPORTAL-SETUP.md`.
- `website/` — the public website grayco-cs.com (its own Netlify site, base directory `website`; not served from the CRM). Its contact form sends leads to the CRM. Guide: `website/README.md`, search engines: `website/SEO-SETUP.md`.
- `agency.html` — the marketing agency's portal (crm.grayco-cs.com/agency): results by lead source, the plan, spend, calls, notes, the monthly report. No customer details. Server: `netlify/functions/agency.js`. Guide: `docs/AGENCY-PORTAL.md`. CallRail: `docs/CALLRAIL.md`.
- `docs/GO-LIVE-33.143.md` — the go-live checklist, in order (links to SECURITY-SETUP, FRESH-START and FILE-STORAGE).
- `docs/BUILD-33.143.md` — what changed in this build.

Never commit `backup.json`, API keys or passwords to this repository.
