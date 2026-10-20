# GrayCo CRM 33.147: Subcontractor Portal

`version.txt` = `33.147-2026-10-20-v1`. Built on 33.146.

## New
- **The subcontractor portal at https://portal.grayco-cs.com.** Subcontractors request access, upload their W-9 and insurance papers, see open jobs, bid, message the PM, and follow their own work with GrayCo: their jobs, every invoice and its status (waiting for approval, approved with a pay date, or paid with the check number), 1099 totals by year, and the insurance GrayCo has on file. Everything under "My Work & Pay" is read from the CRM's books. Setup and full details: `docs/SUBPORTAL-SETUP.md`.
- **🔨 Sub Portal** in the CRM menu, right under RoofScout, already signed in (same sign-in). It is in every role's menu, like RoofScout. You can find it with the menu search ("sub portal", "subs", "bids").
- **Approved Subs → CRM record** links a portal account to the sub's record in the CRM, and **Work & pay** shows staff exactly what that sub sees.
- **E-mails** (from portal@grayco-cs.com): new sign-up → office; approved → the sub; new bid → PM, estimator and office; a sub's message → PM, estimator and office; GrayCo's message → the sub.

## Built from the uploaded bid-portal prototype, made safe for real use
- **No passwords in the code or the docs.** The prototype's built-in admin passwords are gone. GrayCo staff use their CRM sign-in, and subs create their own.
- **Each sub sees only their own records.** The browser never reads the database. Every read and every save goes through `netlify/functions/subportal.js`, which filters by who is asking. The new table `sp_rows` and bucket `subportal-files` have Row Level Security on and no rules, so only that function can use them. Subs are signed-in Supabase users, but every CRM table, RoofScout table and the crm-files bucket already require being on the staff list. The setup script's checks prove this.
- **The AI key never reaches the browser.** Plan reading runs on the server with the existing `ANTHROPIC_API_KEY`.
- **Files go to private storage** (50 MB each), not into the database, and are only handed out as links that expire after 8 hours.
- **Two people working at once don't erase each other's work.** Only what changed is saved (the prototype re-saved whole lists).
- Also fixed from the prototype: buttons that lost their styling when given a width; plan reading wiping the PM and estimator fields; record ids that could collide.

## Files
- `subportal-app/`: the portal's source (React + Vite). `npm run build` writes `subportal/`.
- `subportal/`: the built portal that Netlify serves.
- `netlify/functions/subportal.js`: the portal's server.
- `docs/subportal-setup.sql`: run once in Supabase.
- `netlify.toml`: the portal.grayco-cs.com address.
- `netlify/functions/gc-backup.js`: `sp_rows` is added to the nightly backup.
- `index.html`: changed only for the menu entry, the role lists, the tab list for alerts, the menu search entry, the page itself, and the build number. These are the same places as the RoofScout tab in 33.146.

## Tests on this build
- Every changed script block in `index.html` passes a JavaScript syntax check (same as before).
- The portal was run in a browser against a stand-in database with the real server function. 31 checks passed, including:
  - sign-up lands on "waiting for approval"; papers upload to the sub's own folder in storage; approval works;
  - CRM linking works; jobs post as public or private; the sub sees only the public job; a bid is blocked until the papers are on file, then saves;
  - My Work & Pay shows that sub's CRM job, invoices and check number, and none of another sub's money;
  - a second sub can't read, change or delete the first sub's profile, bid or documents, and can't list the CRM's subs;
  - the CRM tab opens signed in and hides Log Out; no page errors on desktop or phone.

## Before it goes live
1. Run `docs/subportal-setup.sql` in Supabase (every line OK).
2. Add the two password-reset Redirect URLs in Supabase.
3. Add `portal.grayco-cs.com` in Netlify (and the DNS record if needed).

Details for all three: `docs/SUBPORTAL-SETUP.md`. Until step 1 is done, the Sub Portal tab says the portal is not set up in the database yet.

Open CRM tabs show the update bar. Click it, or reload with **Ctrl+F5**.
