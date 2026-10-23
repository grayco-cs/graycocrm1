# GrayCo Portal — customers and subs (owner's guide, build 33.151)

## What you get

| address | who | what |
|---|---|---|
| **portal.grayco-cs.com** — "GrayCo Portal" | customers **and** subs | One sign-in page with the GrayCo logo. A customer gets their job (updates, photos, documents, payments, messages). A sub gets their work with GrayCo: jobs, scopes, change orders, schedule, site notes, progress, punch list, invoices and pay, paperwork, photos, messages. Nothing a customer can see mentions subs or bids. |
| **bids.grayco-cs.com** — "GrayCo Bids" | approved subs | The bid site from build 33.147: open jobs, plans, takeoff, bids, my bids. Same account as the sub's portal. |
| CRM → job → **👷 Subs & portal messages** (desk) / **👷 Subs & messages** tile (field) | PMs | The Sub hub for that job: each sub's status, Call / Text / Email, the portal link, scopes, change orders, punch items, files, messages; the customer's messages and login. |
| CRM → **Subs** tab → **Sub portal** panel | office / owners | Every sub with Call / Text / Email, link, messages, uploads, invoices waiting. Owners also see **Portal links to send** and **Bid site requests**. |
| CRM → **🔨 Sub Portal** tab | staff | The bid site's admin screens (add bid jobs, invite, approve subs, all bids). |

## One-time setup (about 20 minutes)

### 1. Supabase: run the setup script

1. Supabase → **SQL Editor** → **New query**.
2. Paste **all** of `docs/subportal-setup.sql` → **Run**. (It needs `docs/security-prepare.sql` and `docs/portal-setup.sql`, which are already run.)
3. The grid at the bottom must say **OK** on every line (sp_rows and "all 9 portal tables").

It can be run again any time. It creates the bid site's table and file bucket and the portal's tables (links, sign-in codes, signed-in devices, scopes, messages, what subs sent, customer passwords as fingerprints only). Row Level Security is on with **no rules**: only the server functions get in. Nothing in the CRM's tables changes.

If GrayCo Photos (patch U2) is installed, also run its `docs/grayco-photos-setup.sql`; the portals then show GrayCo Photos (customers: their job; subs: their jobs, never a photo marked "Hidden from subs").

### 2. Netlify: add the two addresses

For **each** of `portal.grayco-cs.com` and `bids.grayco-cs.com`:

1. app.netlify.com → site **graycocrm1** → **Domain management** → **Add a domain** (or **Add domain alias**).
2. Type the address → **Verify** → **Add domain**.
3. Only if grayco-cs.com's DNS is **not** at Netlify: at your DNS company add **CNAME** · name `portal` (then `bids`) · value `graycocrm1.netlify.app`.
4. Wait for the lock (HTTPS certificate) next to the address — usually under an hour.

`netlify.toml` already makes portal.grayco-cs.com show only the portal page (never the CRM) and bids.grayco-cs.com show only the bid site. Internal files (docs/, the app source) answer 404 on every address.

### 3. Netlify: environment variables

Site **graycocrm1** → **Site configuration** → **Environment variables**:

1. **SITE_ORIGIN** → **Edit** → add `,https://portal.grayco-cs.com,https://bids.grayco-cs.com` to the end of what is there → **Save**.
2. **PORTAL_BASE_URL** → set it to `https://portal.grayco-cs.com` → **Save**. (New customer links become `portal.grayco-cs.com/#t=…`. Links already sent, `crm.grayco-cs.com/portal.html#t=…`, keep working.)
3. Optional: **BIDS_URL** — leave it unset (the default is `https://bids.grayco-cs.com`).
4. Optional: **OWNER_EMAILS** — who approves bid-site requests (default: wjohnson@ and nthomas@grayco-cs.com).
5. Later, when Twilio A2P registration is done: **TWILIO_ACCOUNT_SID**, **TWILIO_AUTH_TOKEN**, **TWILIO_FROM** (+1 number). Until then nothing is texted by the server; the CRM offers **"Text from my phone"** (a text with the message filled in, from the PM's own phone).
6. **Deploys** → **Trigger deploy** → **Deploy site**.

Already set and used as they are: SUPABASE_SERVICE_KEY, RESEND_API_KEY (e-mail), ANTHROPIC_API_KEY (bid site plan reading). The secrets scanner is told that BIDS_URL is a public address; no key is in any file.

### 4. Supabase: password-reset e-mails for the bid site

Supabase → **Authentication** → **URL Configuration** → **Redirect URLs** → add `https://bids.grayco-cs.com/` and `https://crm.grayco-cs.com/subportal/` → **Save**.

## How a sub gets their link

**Automatically offered when they are set up:** every sub in the Subs list with an e-mail or mobile number and no link yet shows under **Subs tab → Sub portal → 📨 Portal links to send**. Wesley or Nick taps **Approve & send portal link** — that tap is the approval — and the sub gets one e-mail (in their language) with their private link.

**From a job:** open the job → **👷 Subs & portal messages** (desk) or the **👷 Subs & messages** tile (field) → the sub → **🔗 Portal link** → **E-mail it**, **💬 Text from my phone**, or **Copy link**. **Turn the link off** signs out every phone they used at once (and their portal sign-in stops working). **Make the link** again gives them a new one.

The link looks like `portal.grayco-cs.com/#t=…` — one per sub company. The first time it opens on a new phone, GrayCo e-mails the sub a 6-digit code (by text once Twilio is set up); after that the phone is remembered. (An owner can turn this check off: `portal-access` `s-settings` → `deviceCode: off`.) Subs can also sign in at portal.grayco-cs.com with their bid-site e-mail and password, or "Forgot password? E-mail me a code".

## What the PM does in the Sub hub

- **🧾 Create scope** — lines (area, work, measurement, qty, unit), included / not included, material GrayCo provides / the sub provides, notes, dates, plans / drawings / photos, and ONE total. **No line prices, ever.** Lines can be copied from a patch-SC sub scope (estimate / Xactimate) when one is on the job. **Send for approval** → the job's PM (or an owner) taps **✅ Approve & publish** → the sub sees it (and gets one e-mail) → the sub taps **✍️ Review & sign** (typed full name + "I agree" + an optional drawn signature; the time, IP and version are kept) or **Ask a question**. The scope is the **sub agreement** (what they are paid on the job): the job's sub row shows Draft → Sent → **Signed ✓**, and the sub pay check uses the SIGNED amount (patch AUTO6, docs/AUTOMATIONS-AUTO6.md).
- **➕ Change order** — the same, shown to the sub as its own line with its amount, and signed the same way.
- **☑ Punch item** — goes on the CRM punch list, assigned to the sub; they mark it done with a photo.
- **💬 Messages** — one thread per job and sub (photos / PDFs, read receipts, unread badges on desk and field).
- **📍 Site notes** — gate code, parking, hours, dumpster, power, water — the sub sees them on the job.
- "This sub may see the customer's phone / e-mail" — off unless you turn it on for that job.

## What happens when a sub sends something

Within a minute any open CRM computer (desk or field) files it with the CRM's own saves:

| the sub sends | it lands in the CRM |
|---|---|
| an invoice (PDF or photo, amount; PO# filled in for them) | **Sub Invoices** as *received* (waiting for approval), with its Friday pay date and the file |
| photos, progress photos | the job's documents (tagged with the sub, internal) — and GrayCo Photos when patch U2 is installed |
| progress % + note | the job's sub row (% done), the job's updates and a Daily Log entry |
| punch item done + photo | that punch item: complete, with the photo |
| W-9, insurance certificate (with expiry), agreement, lien waiver | the sub's record (w9 / coi + **insExp** / subAgreement / lien) — the Dashboard's "Insurance Expiring" uses it |
| scope accepted / question | the job's sub row, the job's updates and Messages |

Their pay status follows the CRM: Submitted → Approved → Scheduled for Friday pay → Paid (with dates). Invoices in by Wednesday are paid the following Friday.

## The bid site invite

The sub's portal shows **"You're invited to bid on GrayCo jobs"** → **Accept invite** (they choose a password) → Wesley and Nick get an e-mail and see it under **Subs tab → Bid site requests** (and in 🔨 Sub Portal → Pending Subs) → **Approve** → the sub gets "You can now sign in at bids.grayco-cs.com". Before that, the bid site says "Waiting for GrayCo approval". **Deny** (or Revoke in 🔨 Sub Portal → Approved Subs) takes the bid site away; their GrayCo Portal stays.

## Questions on a bid job (pre-bid Q&A / RFI)

- On bids.grayco-cs.com every bid job has a **Questions** spot: a sub asks (and can attach a photo or a marked-up plan page). The PM can set **Questions due by** on the job.
- A new question e-mails the job's PM / estimator and Wesley and Nick, and shows in the CRM: **Subs tab → ❓ Bid questions (N)** on the desk, and a **❓ Bid questions (N)** button on the field job list.
- Answer there (or in 🔨 Sub Portal → the job): **Answer privately** (only the asker sees it) or **Answer to all bidders** — it is numbered (Q1, Q2…) and then **✅ Approve & e-mail all bidders** sends it to every invited / bidding sub, in their language. The asker's name is never shown to other subs; private questions stay private.

## Lead Inbox drafts on the bid site

The CRM's 📥 Lead Inbox (patch LD2) turns each new bid opportunity into a **draft** bid job on bids.grayco-cs.com (with its plans copied over). GrayCo staff see it in 🔨 Sub Portal with a **📝 Draft** badge; **no sub ever sees a draft** — not even one invited to it — and nobody can ask questions on it. Editing a draft keeps it a draft. It goes live only when an admin taps **Publish to bid portal** (in the Lead Inbox, or on the job in 🔨 Sub Portal; it needs a bid due date).

## 🏗 Bid portal tab and 🧭 GrayCo Systems (patch SYS)

- **Every estimator lead is a PRIVATE bid job at once.** This covers commercial, government and bid-board leads, and any lead with an estimator. It is created the moment the lead comes in, from bids@ / leads@, a bid watcher, or a lead typed into the CRM. Only the subs you invite see it. Leads that were already drafts are switched to private when an admin or the estimator opens the 🏗 Bid portal tab. This never makes a public job private again. Residential leads stay drafts.
- **🏗 Bid portal** (left menu: Admin, Office, Estimator — right under Leads for the estimator) lists every bid job: 🔒 private / 🌐 public / 📝 draft, how many subs were invited, how many sub bids came in, and the bid due date.
  - **🌐 Make public**: an admin or an estimator, after a yes. It needs a bid due date.
  - **✉️ Invite subs**:
    - pick subs (⭐ Preferred first; ⛔ Do not use never shown), **invite all subs in these trades**, or **invite all subs**;
    - each sub gets their own e-mail, in Spanish when that is their language, with the job, address and due date in the subject;
    - nobody sees who else was invited;
    - inviting on a draft opens it as private.
- **📨 Sub bids** is ONE list per job, from all three doors: ✉️ e-mailed to bids@, 🏗 the bid portal, 🔨 the sub portal. It is grouped by trade with the low bid in green, and an admin or estimator can **🏆 Mark awarded**. The same list is in each lead's drawer under 🏗 Sub bid portal.
- **🧭 GrayCo Systems** (Admin, Office; a short one for the Estimator) has a tile for every portal, site and app:
  - the bid site, sub portal and customer / GC portal (pick a job), RoofScout, GrayCo Photos, CompanyCam;
  - the website and News, and the partner / roof check / giveaway / coupon pages;
  - Marketing, Business Brain, the office TV and CRM health;
  - admins also get the year-end archive, QuickBooks, Supabase, Netlify, Resend and Google Admin.

  Status dots come from the `?ping=1` checks.
- Server: `netlify/functions/bid-hub.js` (GrayCo staff only; a customer never sees subs).

## 📂 Manage a bid job, 🗑 Delete (patch SYS2)

**The job list.** Each row has one short row of buttons: **📂 Manage**, **📨 Bids** and **⋯ Actions**. ⋯ Actions holds Invite subs, Make public / private, the lead, and 🗑 Delete. The list never scrolls sideways, and on a phone each job is a card.

**🗑 Delete** (an admin or an estimator):
- It asks first, and says how many invited subs lose access.
- The job leaves the bid site at once: no sub sees it any more, even one who bid on it.
- No sub is e-mailed about it.
- Invitations and sub bids stay in history.
- **🗑 Deleted (n)** lists it, with **↩ Restore**, for 30 days.
- The CRM lead is not touched unless you tick **Also mark the lead Lost / not bidding**.
- Admins can tick several jobs and **Delete selected**.

**📂 Manage** opens one drawer per bid job, from the Bid portal row or from a lead's drawer (🏗 Sub bid portal). Everything there is on bids.grayco-cs.com only for the subs who may see that job: the invited ones, or every approved sub when the job is public. GrayCo prices and customers never see any of it.

- **📐 Plans & specs**
  - Drop or pick files, several at once: PDF, DWG / DXF, pictures, or a ZIP, which is unpacked into its sheets.
  - You can add a plan-room link instead.
  - Each file gets a version and a date, and **⭐ Current** marks the current one.
  - The files go to the bid site's own storage.
- **📝 Scope** — one per trade, typed, or made **📐 From an estimate** with every price removed (removed again on the server). A sub sees only the scopes of their own trades.
- **📎 Addenda**
  - Addendum #1, #2… with a date, what changed, files, and an optional new bid due date.
  - Subs tap **Acknowledge addendum #n** on the bid site, and the drawer shows who did and who has not yet.
  - The e-mail to the subs waits on **✅ Approvals** (one e-mail each, in Spanish when that is theirs).
  - In **⏸ Data-entry mode** nothing is queued: the e-mail is *held*, and **Send now** queues it after the pause.
- **📣 Updates**
  - Send to every sub who can see the job, one trade, or one sub.
  - It shows on the bid site (Messages and "Updates from GrayCo") at once.
  - An e-mail copy, when ticked, waits on ✅ Approvals.
- **💬 Q&A** — the subs' questions from the bid site. **Reply privately** or **Publish answer to all bidders**; the e-mail to the bidders waits on approval, as before.
- **🗂 Activity** — what was posted, when and by whom; which sub viewed or downloaded what; acknowledgements.

Server: `bid-hub.js` (`?manage=`, ops `archive`, `restore`, `plans`, `scope`, `addendum`, `post`, `answer`, `notice`), `subportal.js` (the `acks` collection, each sub's view of a job), and `_lib/bp-notice.js` (an approved notice is sent). The bid site's source is `subportal-app/`; it is rebuilt into `subportal/`.

## Plans on bid jobs

- **Automatic:** a bid job made by the Lead Inbox (bids@ e-mails, bid watchers) gets the plans that came with it (PDFs copied into the bid site's file bucket, links in the job notes) — patch LD2.
- **Upload a ZIP or PDF** (admins): CRM → **Subs tab → 📄 Plans requested → ⬆ Upload plans (ZIP/PDF)**, the **⬆ Upload plans (ZIP/PDF)** button on a Lead Inbox lead that has a bid job, or the bid job in 🔨 Sub Portal. A ZIP is unpacked on the server into its drawings; folder names become the categories; only PDF, pictures and DWG/DXF, up to 50 MB a file, 300 files / 250 MB a ZIP; Mac extras are left out; the same drawing twice is added once.
- **"📄 Request plans — I'm interested in bidding":** a job with no plans shows this to approved subs. GrayCo gets an e-mail (Wesley, Nick and the job's estimator — Glenn when none is set), a phone push when push is set up, and one to-do. The CRM shows **Plans requested by N subs**.
- When plans arrive (any of the ways above), **everyone who asked gets "Plans are ready for <job>"** once, in their language, with the bids.grayco-cs.com link. It is a transactional notice, so it does not wait for approval.
- Subs see plans only on jobs they may see: approved, and the job is public or they are invited; never a draft.

## Customers

- **Their link** (as before) or **sign in at portal.grayco-cs.com**: user name = the e-mail on the job (or their mobile number if there is no e-mail), password = **their first name** (capitals and spaces don't matter). Only a fingerprint of a password they choose themselves is ever stored. 5 wrong tries → 15 minutes locked. After signing in they see an optional "Make your own password" card. "Forgot password?" e-mails a 6-digit code.
- **Your selections** (selections v2) works the same whether they came in by their link or signed in with e-mail + password, and follows the job they pick.
- A customer with several jobs gets a job picker. Turning the job's link off turns their login off and signs them out.
- The job's **👷 Subs & portal** sheet shows "Login: e-mail · starter password = first name · changed: yes/no", **Reset to first name** (owners), and **📨 Welcome note** (link + "Sign in at portal.grayco-cs.com · E-mail/Phone · Password: your first name") to text from your phone. The automatic welcome e-mail includes the same sign-in line and waits for approval like every automatic e-mail. No e-mail and no mobile number on the job: "Add an e-mail or mobile number to give this customer a portal login".

## English / Español

Both sign-ins and the sub portal have an **English / Español** toggle, remembered on that phone. A sub's choice is saved on their CRM record and their e-mails go out in it.
