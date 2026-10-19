# GrayCo Lead List

Outreach tracker for bids: portals and plan rooms to register with (tab 1) and companies to call or email (tab 2), with follow-ups, email drafts and a call/reply log. It started as a Claude artifact; [HANDOFF.md](HANDOFF.md) has the history, the email-template rules and the open questions.

It stays a standalone page for now. Later it can feed the CRM's Leads tab.

## Run it
- **Shared (real use):** `https://crm.grayco-cs.com/leads/` (also `graycocrm1.netlify.app/leads/`). Sign in with your GrayCo CRM email and password. First, an admin turns on the database once: see [docs/LEADS-SETUP.md](../docs/LEADS-SETUP.md).
- **On this computer (testing only):** `python3 -m http.server` in the repo folder, then open `http://localhost:8000/leads/` and click **Try it on this computer**. It saves only in that browser. This button never appears on the website.

## Where things are saved
| What | Where |
|---|---|
| Status, call/email log, follow-up date, contact edits, email draft, replies, extra portals, notes | Supabase table `ll_progress` (one row per company) |
| Companies added by hand | `ll_custom` |
| A spreadsheet uploaded with **Update from spreadsheet** | `ll_leadlist` (used instead of the built-in list once it is newer) |
| The built-in list (607 companies) | `data/seed.json`, sent to signed-in staff by the `leads-seed` function |

Everyone on the staff list shares one list. Changes made on another computer show up within about 20 seconds. All three tables are in the nightly backup.

`data/` is not served by the website (`netlify.toml` answers 404 there), so the company list and spreadsheet are only reachable after signing in.

## Files
| File | What it does |
|---|---|
| `index.html` | Page shell: sign-in, list, company profile, dialogs |
| `css/styles.css` | All styling (light and dark) |
| `js/parse.js` | Turns the outreach spreadsheet into the ordered lead list |
| `js/cloud.js` | GrayCo sign-in (shared with the CRM) and database calls |
| `js/store.js` | The lead list's tables, the built-in list, Claude drafting |
| `js/app.js` | Everything on screen: list, ordering, profile, email templates, import/export |
| `data/seed.json` | The built-in company list |
| `data/GrayCo_Multifamily_Outreach_Tracker.xlsx` | The source spreadsheet |
| `build-seed.js` | Rebuilds `data/seed.json` from the spreadsheet |
| `../netlify/functions/leads-seed.js` | Sends the built-in list to signed-in staff |
| `../docs/leads-setup.sql` | Creates the tables and access rules in the CRM's Supabase |

**Rewrite with Claude** goes through the CRM's `claude-proxy` function, so the Anthropic key stays on the server.

## Changing the company list
Edit the spreadsheet. Then either:
- upload it in the app with **Update from spreadsheet** (everyone sees it at once), or
- commit it and rebuild the built-in list: `npm install --no-save xlsx@0.18.5 && node leads/build-seed.js`.

Calls, notes and replies are kept by company id (tab name + company name), so renaming a company in the spreadsheet starts it fresh.

The **Verified website / Verified phone / Verified email** columns hold contact details checked by hand. When filled, they replace what the app would pick out of the other columns. `none` means "show nothing". **Verified contact note** and **Research note** explain each fix.
