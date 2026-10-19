# GrayCo CRM 33.147 (2026-10-19, v1): the fix update

This is 33.145 plus 33.146 (RoofScout), with these fixes. After it is live, press **Ctrl+F5** on every computer and phone.

## Data safety
- **Deletes stay deleted.** The automatic "recovery from the daily backup" ran 20 seconds after opening and then every 5 minutes. It put back anything missing from a list, including things deleted on purpose. That automatic run is off. Daily backups are still made, and 💎 → Daily Backups → Restore still works when you choose it.
- **Old computers can't push old data.**
  - A computer waits for the cloud's copy before its first save.
  - A start-up re-save no longer counts as a person's edit.
  - A deleted employee leaves every screen.
- **The old floating 🎤 voice button is turned off.** Its notes were never saved, and it could overwrite newer edits.

## Screens
- **Customer portal card:** shows only inside an opened job, as one compact row. Errors now say what is wrong. Health check: `/.netlify/functions/portal?ping=1` (yes/no only, never a key).
- **Old ✕ is gone.** On a computer, hovering over a row shows the trash can at the right edge of what's visible. On a phone it is under "⋯". It always asks first, naming the job.
- **Projects and every tab open faster.** Payroll opens in about 0.1 s instead of about 0.8 s.
- **Dashboard:**
  - "Active · Pipeline" uses the same count as the Projects page.
  - "Price Sync Overdue" is gone; it stays on the Products page.
- **Expense Center and Tax Center** are light tabs inside Accounting.
- **Forms & Docs:** every form opens, both Blank and Generate Filled. Filled uses the job you picked. If pop-ups are blocked, the form opens on the page with Print.
- **Licenses:** every document shows `TN License #85034 BCB · AR License #0486990627 · MS License #27769`.

## People and sign-in
- **Who shows up:** only active, hired people appear in lists, chips and pickers. Dale stays out unless he is re-enabled in Employees.
- **PMs on a phone:** a PM can sign in on a new phone. Before, they got stuck on an old sign-in screen that ran off the side.

## CompanyCam
- **Admin → CompanyCam:**
  - the card shows each 2026 project and what happened to it;
  - it has a **Check CompanyCam now** button;
  - the first check runs within a minute of signing in.
- **Fixed skips:**
  - a stale "key not working" answer blocked checks for 30 minutes;
  - computers that never checked now check;
  - a match only to a closed job now goes to the review list;
  - a project deleted on another computer is not re-made.

## Customer e-mails need approval
Automatic customer e-mails now become **"Approve & send…"** Office to-dos and are not sent:
- the final invoice and its 15-day reminders;
- the new-job portal link;
- "new papers in your portal".

Sends a PM starts with a tap (Post, Email it) still go out. `PORTAL_AUTO_EMAIL=1` on Netlify would turn automatic sending back on; don't set it.

## Known and not changed here
- Moving a schedule day to an EARLIER date can occasionally be reverted by sync. This is older than this update; the fix comes next.
- The app's duplicate clean-up can pass duplicates back and forth between two open computers for about a minute. It removes only true duplicates and can be undone.

## Tests (offline, on this build and its parts)

| Area | Result |
|---|---|
| Data sync suites | H 7/7, J 55/55, R 39/39, K 37/37 |
| Screens | trash can 31/31, people 10/10, counts 4/4 |
| CompanyCam | 12/12 and 10/10 |
| Documents and old voice button | documents 16–17/17, old voice 3/3 |
| Forms & Docs | 80/80 |
| Phone sign-in | 16/16 |
| Portal functions and approvals | 125/125, approval 10/10, portal CRM 47/47 |
| Delete test | 28–29/29, the same as live 33.145 (27–29/29) |

## 33.148 (same day)
- **The Photos tab and a job's "Sync from CompanyCam"** no longer ask for a CompanyCam API key. They used an old server address that no longer existed. They now use the company key stored on Netlify (COMPANYCAM_TOKEN), the same as Admin → CompanyCam. Patch CCX: `tail_CCX.js`. `companycam-webhook` passes on name searches and pages.
- **Tests:** CCX 7/7, H 7/7, CompanyCam 10/10 and 12/12.

## 33.149 (same day): security fixes from the cloud audit
- **Cloud write guard:** sign-in sessions, QuickBooks/CompanyCam keys and safety copies are no longer uploaded inside daily backups. Old password hashes are kept out of "users".
- **Export guard:** backup files leave out tokens and keys.
- **💎 → 🧹 Cloud cleanup (admins):** dry run first, then removes old secret copies and test rows. A backup file is downloaded before any change.
- **qb-callback:** no longer writes the address text into the page (an XSS hole), and sends QuickBooks tokens only to the CRM's own sites.
- **Internal files:** `/docs/*`, `/netlify/*`, README, RECOVER.js, audit.html and package.json now answer 404. The W-9 moved to an unguessable address and the CRM's links point there.
- **`security-lockdown.sql`** keeps the owners-only rules on gc_admin_kv.
