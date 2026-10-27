# Marketing agency portal (patch AGY)

The marketing agency (AdVentures Media — Malcolm and team) works from **crm.grayco-cs.com/agency**. It is not a
CRM login: a CRM login reads every customer, job and invoice. The portal shows marketing numbers only.

Page: `agency.html` · Server: `netlify/functions/agency.js` + `netlify/functions/_lib/agency.js` ·
Monthly report: `netlify/functions/mkt-report.js` · In the CRM: Marketing → 🤝 Agency portal.

## Turn it on (5 minutes)

1. Deploy this build (push to `main`).
2. Open **crm.grayco-cs.com/agency** on a computer where you are signed in to the CRM. You are in as yourself.
3. **👥 Team & settings** → add `malcolm@adventuresmedia.com` (and Brian, Amy) → Add.
   Or set `AGENCY_EMAILS` on Netlify (comma list) and redeploy — the page's list wins when both name someone.
4. Tell them: open **crm.grayco-cs.com/agency**, type your e-mail, click the link in the e-mail.
   The link works for an hour and keeps them signed in on that browser for 14 days.
5. Optional: Settings → add your bookkeeper's e-mail for the monthly report.

To lock someone out: Team & settings → **turn off**. It takes effect on their next click.

## What each side sees and can do

| Tab | Agency | GrayCo staff | Admins |
|---|---|---|---|
| 📊 Results — leads, appointments, estimates, jobs won, spend, cost per lead / per job by source; campaigns; recent leads (date, source, campaign, city/ZIP, stage — **no names, streets or phones**) | ✓ (revenue and $-back-per-$1 if "Share revenue" is on; profit only if "Share profit" is on) | ✓ | ✓ everything |
| ✅ Plan — the 18-item plan from the 10/22 website audit; status, owner, due date, notes; add items. Some items show what the CRM sees (e.g. "Google Ads connected") | edit | edit | edit + delete |
| 💵 Spend — add a month's spend per channel (LSA, agency fee, print, call tracking …). It lands in the CRM's Marketing spend, so Marketing → Dashboard counts it too. Google Ads / Facebook come in by themselves once connected in the 📈 Ads hub | add; remove only what was added here | add | remove any line added here |
| 📞 Calls — Twilio tracking numbers + CallRail: source, time, length, keyword; caller's last 4 digits only | ✓ | ✓ | ✓ |
| 🔌 Setup — what is switched on (website leads, Twilio, Google Ads, Facebook, CallRail, LSA, the report) | ✓ | ✓ | ✓ |
| 💬 Notes — back and forth; a new note is e-mailed to the other side | ✓ | ✓ | ✓ |
| 🗓 Monthly report — preview any month | ✓ | ✓ | + "E-mail it now" |
| 👥 Team & settings — agency people, what they see, report recipients, activity log | — | — | ✓ |

Nothing on the page sends anything to customers or changes an ad. Ad changes stay in the CRM's 📈 Ads hub and go
through ✅ Approvals.

## The monthly report

On the 1st at 8 AM Central (`mkt-report`, scheduled in `netlify.toml`): last month's leads by source, jobs won
from them so far, that month's spend per channel, cost per lead / per job, $ back per $1, the 12-month totals and
the plan's progress. To the admins (gc_staff admins + `OWNER_EMAILS`), the agency people, the report list on the
page and `MKT_REPORT_TO`. Sent once per month. Local Services Ads spend has its own line in the report (the CRM's
own dashboard counts LSA inside Google Ads).

## Netlify settings

| Variable | |
|---|---|
| `AGENCY_EMAILS` | optional seed list of agency addresses |
| `AGENCY_SECRET` | optional, 16+ characters; signs the sign-in links and sessions (otherwise derived from the service key). Changing it signs everyone out |
| `MKT_REPORT_TO` | optional extra report recipients |
| `RESEND_API_KEY`, `OWNER_EMAILS`, `SUPABASE_*` | already set |

Data: service-only store `gc_lead_inbox_kv`, key `gc_agency_v1` (members, plan, notes, settings, activity log).
Spend added on the page: `gc_mkt_v1` → `spend` with `origin: "agency"`.
