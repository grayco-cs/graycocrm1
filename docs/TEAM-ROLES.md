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
| `gc_senior_pm` | `{ email, id, name }` | everyone reads, admins change |
| `gc_team_settings` | `{ apmCanApprove }` | everyone reads, admins change |
| `gc_reassign_log` | the reassign history | everyone reads, admins add |
| `gc_pay_templates` | the saved pay structures | admins only |

People records may carry `ccName` (GrayCo Photos name) and `assistsPm` (for an APM). Jobs may carry `apm` and `superintendent`.

The server uses the same rules: `netlify/functions/_lib/people.js`.
