# Team roles: Senior PM, PMs, APMs and Superintendents (patch PMG)

The CRM does not name any employee in its code. Who gets what is decided by your people list and one setting.

## The Senior PM

**Admin → Admin settings → 👥 Team roles & Senior PM → Senior PM.** Pick from the active Project Managers.

The Senior PM gets:
- GrayCo Photos (CompanyCam) jobs made by someone who isn't mapped to a person. These come in with the Senior PM as PM, but they are **not** counted as the Senior PM's own lead.
- Notices about a job that has no PM, such as a customer picking selections in the portal.
- The jobs of a PM who has left (turned off or offboarded), until someone reassigns them.
- The first e-mail to a bought lead (Roof Ignite and the like) that nobody is assigned to.

If no Senior PM is set, or the Senior PM is turned off:
- Admin shows a red warning at the top: **"Pick a new Senior PM"**.
- Until you pick someone, those notices go to every active PM, and with no PMs to the admins.

The first time the new build opens on an admin's computer, if the company has exactly one active Project Manager, that person becomes the Senior PM. This keeps the behavior from before.

## Roles

These are set in Admin → Employees (Role):
- **Project Manager.**
- **Assistant PM** (APM):
  - Sees and works the jobs of the PM(s) they assist (set in Team roles → "APM assists"), and any job where they are set as the APM.
  - Gets the same job notices as the PM.
  - Cannot approve unless an admin ticks **"APMs may approve"**. Off by default: an APM prepares items and the PM approves them.
- **Superintendent:** set per job in Team roles → Job team, and in the Site Book.

A new hire with one of these roles appears in every pick-list, in the routing and in "View as" with no other step. The sign-in profile (💎 → Team access) can also be `apm`. For the database to accept `apm`, run **docs/team-roles.sql** once.

## Other tools in the same section

- **GrayCo Photos name / e-mail:** each person's name as it appears in CompanyCam. Their CompanyCam projects come in as their own leads.
- **Reassign open work:** moves every open job (PM, APM, super) and every open lead from one person to another.
  - It asks you to confirm first.
  - Each move is logged: who did it, when, from whom, to whom, and how many jobs and leads.
  - Closed jobs keep the old name.
- **Pay structure templates:** save one person's pay setup (and their commission structure) under a name, then apply it to anyone.
  - The first run makes one template from each person's current two-structure pay.
- **Monthly Overhead:** a line can be tagged with a person and marked **"Estimate only (a person's gas / vehicle)"**.
  - That person's own gas and vehicle receipts are shown under **"Cost of each employee"** and never added on top.

## Data

| Key (gc_kv) | What it holds | Who reads / writes |
|---|---|---|
| `gc_senior_pm` | `{ email, id, name, setBy, setAt }`, or `{ none: true, setBy, setAt }` for "— Nobody yet —" | everyone reads, admins change |
| `gc_team_settings` | `{ apmCanApprove, leadRoles: { insurancePm, roofingMgr }, seniorFixV1 }` | everyone reads, admins change |
| `gc_reassign_log` | the reassign history | everyone reads, admins add |
| `gc_pay_templates` | the saved pay structures | admins only |

People records may carry `ccName` (GrayCo Photos name) and `assistsPm` (for an APM). Jobs may carry `apm` and `superintendent`.

The server uses the same rules: `netlify/functions/_lib/people.js`.

## Senior PM can be "nobody" (patch HOT2)

- The Senior PM pick-list starts with **"— Nobody yet —"**. Saving it is a choice like any other (`setBy` / `setAt`), and the
  first-time setup never fills it in again.
- While nobody is Senior PM, Admin shows a grey info line, not a red warning, and work with no PM goes to **every active PM**,
  then the admins.
- One time only (`gc_team_settings.seniorFixV1`): a Senior PM that the automatic first-time setup picked (not an admin) became
  the **Senior Roofing PM**, and Senior PM was left empty. A Senior PM an admin picked is kept, with a note "Senior PM is … —
  change if needed".

## Lead roles (patch HOT2)

Admin → Admin settings → 👥 Team roles → **🎯 Lead roles**. A new lead goes, by its type, to the person in that role the moment
it comes in (website forms, missed calls, referrals, the partner API, bid e-mail, bid boards, BuildingConnected, SAM.gov):

| Role | Gets | Where it is kept |
|---|---|---|
| **Senior Estimator** | commercial / government bids (the lead's owner) | Leads → 📥 Lead Inbox → ⚙ (`_lib/estimator.js`) |
| **Senior Insurance PM** | restoration: water (water, flood, leak, mitigation, mold), fire (fire, smoke, soot), storm (storm, hail, wind, tree), insurance / claims | `gc_team_settings.leadRoles.insurancePm` |
| **Senior Roofing PM** | roofing with no storm / water words. Also the **second person** (`lead.coAssignees`) on a commercial roofing bid and on a storm / water lead about a roof — they get its alerts and due reminders too | `gc_team_settings.leadRoles.roofingMgr` |
| nobody | remodel and everything else | an admin assigns it ("👤 Assign this lead") |

- A storm + roof lead follows the lead's own insurance answer when it has one ("not insurance" → Senior Roofing PM); with
  none it goes to the Senior Insurance PM and the Senior Roofing PM is added as the second person.
- A role nobody holds, or whose person is turned off, routes nothing: the lead waits for an admin, and Admin shows a grey
  info line "Pick a …".
- Leads already in the CRM are routed the same way the next time an admin, an estimator or a role holder opens Leads (once;
  closed leads are left alone). Routed leads are not "Assign this lead" approvals.
- Admins see and reassign every lead; a role holder may reassign the leads of their own area.
- Rules: `netlify/functions/_lib/lead-roles.js` (server) and `window._gcLeadRoles` (the CRM page) — keep the two in step.
