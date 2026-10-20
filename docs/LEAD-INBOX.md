# 📥 The Lead Inbox: every bid opportunity in the CRM and in the bid portal (patch LD2)

> Owner, 10/20: "Can my bid portal scrub websites like other plan rooms (BuildingConnected, PlanHub, aandbplanroom.com, etc.), and every time a new job is added it goes to our bid portal and our leads in the CRM, so we never miss anything? Also alert admins about new bid opportunities."

The owner's setup steps (exact clicks) are in the scratchpad's `wLD2/SETUP.md`, handed over with this build. This page says what the Lead Inbox does and how it is built.

## The rule for websites

GrayCo never signs in to someone else's site with a robot. Every source is reached one of these ways:

- **E-mail.** Sites behind a login send their notices to **bids@grayco-cs.com**: BuildingConnected, PlanHub, A&B Planroom, RKA Planroom, Central Bidding, Ion Wave, OpenGov, MLGW, Edison, ARBuy and MAGIC.
- **Public pages and RSS.** Public government bid lists are read on a schedule, and robots.txt is obeyed:
  - Shelby County
  - City of Memphis
  - Memphis-Shelby County Schools (MSCS)
  - Memphis-Shelby County Airport Authority (MSCAA)
  - DeSoto County (RSS)
  - TN STREAM
  - TN CPO
  - Arkansas OSP
- **The official API (optional).** BuildingConnected's API, only if Autodesk grants access.

## What happens to every new opportunity

1. **One item in the Lead Inbox.**
   - Claude reads each e-mail: board, project, GC/owner, address, bid due, pre-bid, trades, type and plan links.
   - Plans, specs and addenda attached to the e-mail are kept in `crm-files`.
   - Duplicates merge into one item: the same project from two boards ("also on PlanHub"), a reminder, an addendum ("Addendum #2 received — bid date changed"), or a public listing whose e-mail also arrives.
   - A project marked **Not interested** never comes back.
2. **A CRM lead.** The CRM turns the item into a lead on **Leads → Lead Pipeline** the next time someone opens it.
   - The lead is written through the CRM's own synced setter, with real save stamps (SYNC-A).
   - If a lead with the same name is already on the pipeline (typed in by hand), that lead gets the details instead of a second lead.
3. **A draft bid job in the bid portal** (bids.grayco-cs.com) **for an admin to review.** The draft has:
   - the title, location, bid due date and time, description and notes;
   - the source link;
   - the plans and specs that came by e-mail, copied to `subportal-files`.

   It is saved with status **draft** and visibility **private**, and nobody is invited, so subcontractors never see it. An addendum updates the same draft.
4. **The admins are told** (every active `admin` on `gc_staff`, plus `OWNER_EMAILS`, by default Wesley and Nick):
   - **E-mail.** A bid due within 72 hours is e-mailed at once. Everything else goes out in **one e-mail an hour**, with commercial and insurance leads first under "Needs a PM".
   - **Phone push**, once the To-Do tab's push (patch TD) is set up.
   - **In the CRM:** a toast ("📥 3 new bid opportunities · 1 due within 3 days"), and a number on the **Leads** menu. **To-Do** gets the number too, unless patch TD's own count is there.

Nothing goes to subs on its own. **Publish to bid portal** (admins) on the lead's card is the only thing that makes the job public, so approved subs can see it and bid.

**RoofScout** leads come into the CRM through patch RSL as `LEAD_RS_<id>`. The inbox only **shows** them (source "RoofScout") with Assign PM and Not interested. It does not collect them again, and they do not become bid-portal drafts.

## The buttons on a lead card

- **Assign PM** (admins). You pick; nothing is assigned automatically. The PM gets a notification, and a to-do 3 days and 1 day before the bid is due.
- **Publish to bid portal** (admins). The tag on the card shows where the job is:
  - "Draft in the bid portal";
  - "✓ On the bid portal";
  - "waiting (portal not set up)".
- **Create bid job.** Makes a CRM job at Bidding, with the plans in its Plans & Bidding tab.
- **Merge with…**, **Not interested** (admins).
- **📐 Takeoff** on each plan.

## Before the bid portal is set up

The functions check whether the portal's table (`sp_rows`) is there. Until it is, each draft **waits in a queue**. Within the hour after `docs/subportal-setup.sql` has run, the queued drafts are created (the hourly `bid-alerts` run also empties the queue). Dismissed or merged leads are left out. Publish answers "not set up yet" until then.

---

## For whoever maintains it

### Netlify functions

| File | What |
|---|---|
| `bid-inbox.js` (+ `bid-inbox-background.js`) | The Resend inbound webhook. It checks the Svix signature (`BID_INBOUND_SECRET` or `RESEND_INBOUND_SECRET`) and the CRM doors: `GET ?list=1`, `POST ?act=1` (imported / assigned / job / dismissed / merged / restore / **publish**), `?settings=1`, `?watch=1`, `?ping=1`. `afterStore()` makes the bid-portal draft and queues the alert for every item that is added, merged or has an addendum. |
| `bid-watch.js` | The public bid watcher. Schedule: `17 12,15,18,21,23 * * 1-5` UTC. Optional BuildingConnected API adapter. |
| `bid-alerts.js` | Runs every hour at :11. Sends the admins' digest and creates the drafts waiting in the queue. |
| `_lib/bid-portal.js` | The adapter to the bid portal: `status()`, `draft(item)`, `publish(item, who)`, `flush()`, `jobIdFor(item)`. The job id is `j_ld<sha256(inbox id)>`, the same every time. The draft is written as `jobs/<id>` and `plans/<id>` rows in `sp_rows`, with files copied from crm-files to subportal-files under `staff/lead-inbox/…`. `_lib/` is bundled into the functions and is not a function itself. |
| `_lib/bid-alerts.js` | Recipients, the due-soon e-mail, the hourly digest and the phone push. |

### Storage

- **Records:** table `gc_lead_inbox_kv` (`docs/lead-inbox.sql`). It is read and written with the service key only; RLS is on with no rules. Before that SQL has run, the same keys live in `gc_kv`, and the SQL copies them over. The keys:
  - `gc_lead_inbox`
  - `gc_lead_inbox_settings`
  - `gc_lead_inbox_notices`
  - `gc_bid_watch_seen`
  - `gc_bid_watch_status`
  - `gc_lead_inbox_alerts`
  - `gc_bidportal_queue`
- **Every write** is a compare-and-set on `updated_at`.

### Environment

| Name | |
|---|---|
| `RESEND_INBOUND_SECRET` (or `BID_INBOUND_SECRET`) | The bids@ webhook's signing secret. **Required.** |
| `RESEND_API_KEY` | Full access. Reads the received mail and sends the admins' alert. |
| `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Already set. |
| `OWNER_EMAILS` | Admins who always get the alert. Default: `wjohnson@grayco-cs.com,nthomas@grayco-cs.com`. |
| `BID_ALERT_TO`, `BID_ALERT_SOON_HOURS` (72), `BID_ALERTS_OFF=1`, `BID_ALERT_FROM` | Optional. |
| `BID_PORTAL_DRAFTS=0` | Optional: no bid-portal drafts. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (+ `web-push` in `netlify/functions/package.json`) | Phone push (patch TD). Optional. |
| `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, `BC_REFRESH_TOKEN` | BuildingConnected API. Optional. |

**Check:** open `https://crm.grayco-cs.com/.netlify/functions/bid-inbox?ping=1`. It should show `signed`, `resendApi`, `ai`, `database`, `bidPortal` and `adminAlerts` all `true`.

### In the page (`tail_LD2.js`, `<script id="gc-patch-ld2">`, marker `__GC_PATCH_LD2__`)

`window._gcLeadInbox` has:

- `list({unassigned})` and `assignList()`, the admins' list (commercial and insurance first);
- `assign(id, pm)`, `publish(id)`, `dismiss`, `merge`, `createJob`, `reminders({pm})`, `refresh()` and `status()`.

It fires the event `gc:leads-changed`.

- **Admin** is decided by `gc_staff` only (`__GC_AUTH__.isAdmin()` or the server's answer). Never from the people list (SEC2).
- **No menu label is changed.** Badges are numbers.
- **Dialogs** have a ✕ in the header, so NAV's Back closes them.
- **The page never polls.**
