# CompanyCam: setup, automatic Bidding jobs (2026+) and the review list

## Why it stopped working

The old CompanyCam access key was revoked at CompanyCam months ago. Every call
the CRM made with it failed, and the failures slowed the screen down. A later
build answered every CompanyCam call with "nothing" so the screen stayed fast.
After that, CompanyCam could only be turned back on from the browser console,
and that had to be done on each computer every time the CRM opened.

From this build the key is kept on the server, not in the browser. The CRM
checks it by itself.

## Turning it on (one time, about 5 minutes)

### 1. Make a new key in CompanyCam

1. Sign in to the CompanyCam web app (app.companycam.com) with an Admin account.
2. Open the company **Settings** and go to **Integrations**. Find the CompanyCam
   **API / Access Tokens** section. CompanyCam sometimes renames its menus. If you
   can't find it, search the CompanyCam help center for "access token".
3. Create a new token:
   - Give it a name you'll recognise, for example "GrayCo CRM".
   - Give it **read and write** access. The CRM reads projects, and it creates a
     project when you add a job in the CRM.
   - If CompanyCam asks for an expiry, choose **never**.
4. Copy the token with CompanyCam's copy button. Don't select the text by hand,
   and don't copy the row of dots.

### 2. Add it on Netlify

1. Netlify → your site → **Site configuration → Environment variables →
   Add a variable**.
2. Key: `COMPANYCAM_TOKEN`. Value: the token you just copied. Scope: at least
   **Functions**. Save.
3. **Deploys → Trigger deploy → Deploy site.** Functions only see a new
   variable after a deploy.

### 3. Check it

Open the CRM and go to **Admin**. The CompanyCam card at the top should say
**● CompanyCam connected — using the key stored on Netlify (COMPANYCAM_TOKEN)**
in green.

- If it shows red with **"CompanyCam key needs replacing — Netlify → Environment
  variables → COMPANYCAM_TOKEN"**, CompanyCam refused the key, or no key is set.
  Repeat steps 1 and 2, then press **Check again**.
- If it shows amber with "CompanyCam is not answering right now", that is
  temporary. Press **Check again** later.

Nothing has to be typed into the CRM, and no console command is needed on any
computer.

**Is the token accepted? One truth (patch CCS2).** Only a fresh, authenticated
`GET https://api.companycam.com/v2/company` that answers 200 **with the company record**
counts. The CRM records each such check with its time in gc_kv `gc_cc_whoami`; the
server's check (Test Connection) and every sync run make one. Every CompanyCam
message in the CRM now reads one of:

- ✅ Token accepted (checked 11:42 PM)
- ❌ Token not accepted (401/403)
- ⚠ CompanyCam error 500 on projects (the token works, the projects list does not)
- ⚠ Not checked yet

Before this patch, several older checkers said "Token works", "Key works",
"Connected!" or "connected and working" whenever they got a 200. They could get a
200 without CompanyCam ever being asked, because this browser's CompanyCam gate
answers those old requests with an empty `200 []`. That answer is now marked
`X-GC-Gate: blocked`, and none of them treat it as success.

**The projects request (patch CCS2), per CompanyCam's v2 spec**
([openapi.yaml](https://github.com/CompanyCam/openapi-spec/blob/main/openapi.yaml)):

- `modified_since` is an **ISO8601** date-time. Until this patch the CRM sent unix
  seconds, which is the likely cause of the 500.
- The list comes "sorted by most recent activity first". There is no sort parameter.
- `status` is `active` or `deleted`. Photos take `per_page` up to 100.

A 5xx is retried once. If page 1 still fails, the sync tries `per_page` 25, then the
list with no filter (newest first). The form that worked and CompanyCam's own error
text are kept in `gc_cc_sync_health`.

The token from Netlify is cleaned on the way in: spaces, newlines, quotes and a
pasted "Bearer " are removed. Only its length and those flags are recorded, as
`tokenShape`, never the value.

**Is the 15-minute sync running? (patch CCS)** Every run of `companycam-sync` now
leaves one small record (gc_kv `gc_cc_sync_health`: time, OK / skipped / error,
CompanyCam's HTTP status, projects read, jobs made; never the key). The CRM shows it
as one line in **🧭 GrayCo Systems → CompanyCam** (green / red dot), under every
CompanyCam bar with **Test Connection**, and in Admin's CompanyCam setup:

| Line | What to do |
|---|---|
| Last sync: … — OK, n projects read, n jobs made | Nothing. |
| ⚠ CompanyCam token not set in Netlify | Steps 1–2 above, then Trigger deploy. |
| ⚠ CompanyCam refused the token (401) | Make a new token in CompanyCam, paste it into `COMPANYCAM_TOKEN`, Trigger deploy. |
| ⚠ No CompanyCam sync run recorded (yet) | `SUPABASE_SERVICE_KEY` missing, or no deploy since the change: Trigger deploy. |
| ⚠ No CompanyCam sync in the last hour | Netlify → Logs → Functions → `companycam-sync`. |

**📸 GrayCo Photos** shows a red banner above the photos while CompanyCam is not
working. Without a working key its CompanyCam photos come back empty, so this
banner is the reason the page looks empty.

### 4. Remove the old key from the cloud (one line, once)

Earlier builds copied the old (dead) key into the company database. The CRM no
longer writes it there, and it does not delete anything by itself. To remove the
old copies, run this once in the Supabase dashboard → **SQL Editor**:

```sql
delete from public.gc_kv where key in ('gc_cc_token', 'gc_cc_token_backup', 'gc_cc_key_mirror', 'grayco_ccam_key');
```

Older daily backups (`gc_dailybackup_YYYY-MM-DD`) also have a copy of the old key
inside the browser settings they saved. That key is revoked, so the copy can't
be used, and new daily backups no longer include it. Don't delete the backups to
get rid of it.

Old copies in each browser's own storage (`gc_cc_token`, `grayco_ccam_key`,
`gc_cc_token_backup`, `gc_cc_key_mirror`) are left alone. They are only used if
`COMPANYCAM_TOKEN` is missing on Netlify.

## How the CRM uses the key now

- When the CRM opens, it asks the server one question: "does the key work?" It
  only asks after you are signed in, after the fresh-start check, and when nobody
  is typing.
  - The answer is remembered for 30 minutes.
  - It asks again when you open Admin, and when you press **Check again**.
  - The server never sends the key back to the browser.
- **Key works:** the CRM's CompanyCam features run.
- **Key doesn't work:** every CompanyCam call stays off, as before, so there is
  no flood of failing requests. Admin shows the red notice.
- Everything goes through `netlify/functions/companycam-webhook.js`, which uses
  `COMPANYCAM_TOKEN`. A key sent by a browser is only used when that variable
  isn't set.
- **Console override:**
  - `_gcCompanyCamOn(true)` forces it on for this session.
  - `_gcCompanyCamOn(false)` forces it off for this session.
  - `_gcCompanyCamOn(null)` goes back to automatic.
  - `_gcCCStatus()` shows the current state.

## New CompanyCam projects become Bidding jobs by themselves

The rule is set by the date a project was **created in CompanyCam**.

### Made before 1 January 2026: never brought in

These projects never come into the CRM, by any path. They don't become jobs or
leads, and they don't appear on the review list. That covers the regular check,
CompanyCam's notifications, and every older import button or console command.

The CRM decides the date like this:

1. It uses CompanyCam's "created" date.
2. If CompanyCam doesn't give one, it uses the earliest date the project has.
3. If there is no date at all, the project is treated as made before 2026.

### Made on or after 1 January 2026: becomes a Bidding job

If the project isn't already in the CRM, it becomes a job in the pipeline with
status **Bidding**. No click is needed. The new job has:

- The project's name and address.
- The client's name, phone and email, if CompanyCam has them.
- The CompanyCam id and link.
- Source "companycam".
- A created date equal to the CompanyCam created date.

It shows on the job board straight away. It is saved the normal way (this
computer first, then the union sync), and nothing is ever deleted.

**"Already in the CRM"** is checked in this order: the CompanyCam id stored on a
job, lead or customer; then the street address (small differences ignored, so
"250 Elm Avenue" matches "250 Elm Ave"); then the name. A project that matches is
left alone. No second job is made, and nothing is written onto the existing job.

**Never twice:**
- Each automatic job's id is built from the CompanyCam id: `PRJcc_<CompanyCam id>`.
  If two computers make it at the same moment, they make the same record, and the
  sync keeps one.
- A job that was made and later deleted is not made again.
- A project someone pressed **Ignore** on is not made.

### What still waits for a person: "New in CompanyCam"

A 2026 project waits for a person only when it **could be either of two jobs
already in the CRM**. That means its address or name matches two different jobs.

You can open the list three ways:
- From **Admin**: the CompanyCam card.
- From the **💎** menu. The 💎 button shows a red count.
- From the **CompanyCam** item in the left menu.

Each row shows the project's name, address, created date, creator, photo count,
the jobs it could be, and a link to open it in CompanyCam.

| Button | What it does |
|---|---|
| **New job** | Makes it a Bidding job anyway. |
| **Make lead** | Makes a lead with the CompanyCam id and link. |
| **Link to job** | Pick the right job. The CompanyCam id and link are stored on it. |
| **Ignore** | Adds it to the shared ignore list, which is the same on every computer. |

### When the CRM checks

- **Everything since 1 January 2026:** at most every 30 minutes while the CRM is
  open and nobody is typing, and whenever **Check now** is pressed on the list.
- **CompanyCam's notifications:** the CRM picks these up from our own server
  every 5 minutes. This doesn't contact CompanyCam. So once notifications are on
  (see below), a new 2026 project becomes a job within about 5 minutes.

## Other changes

### A CRM job and its CompanyCam project (PHOTOLINK, 10/27)

The CRM no longer makes CompanyCam projects from the browser in the
background. (That made a second, empty project for every new CRM job, and a
mismatch in the server's answer meant the link was never saved, so the job's
photos never showed.)

Instead, the 15-minute server sync ties each 2026 CompanyCam project to the
CRM job at the same address (house number + street name; "Street"/"St",
commas, city and ZIP written any way) or with the same name:

- A job's existing link is never replaced. A second project at the same place
  is added beside it, and the job shows photos from both.
- Projects made before 1 January 2026 are never linked by themselves. (From
  CCPHOTOS: one that clearly is a job with no photo project yet goes on the
  list, for one tap.)
- (CCPHOTOS) The job's PO in the project name ("Q368 - Smith roof") comes
  first, then the address, then the name. A project archived in CompanyCam is
  tied to the ONE job it clearly is, so a finished job's photos show too. It
  never becomes a new job.
- If it could be two jobs, has the same name but a different address, or
  anything else is unsure, it goes on **📸 GrayCo Photos → "Link these photo
  projects"** (admin and office). Tap **Link** and its photos show on that job
  at once. Tap **Not this job** and that pair is never suggested again.

Photos (and every CompanyCam call from the browser) load only while GrayCo
Photos or a job's photos are open. Leaving the screen stops them.

### Every CompanyCam photo in GrayCo Photos (CCPHOTOS, 10/30)

Before this, nothing was stored. GrayCo Photos asked CompanyCam for one job's
photos only while that job's page was open in that browser, and only up to
1,000 photos. The home page's cards, counts and feed knew only the jobs opened
in that session, plus CompanyCam's newest 40 photos. A lead's CompanyCam
project was never read. So only some jobs ever showed their photos.

Now a server function, `companycam-photos`, runs every 15 minutes (at :07,
:22, :37 and :52). It lists every photo of every CompanyCam project that a job
or lead is linked to. No picture is copied and nothing goes into the file
bucket. It keeps only CompanyCam's own small links, about 0.2–0.3 KB per photo,
in `gc_kv` (`ccidx:<project>` plus the summary `ccidx`). Grids use
CompanyCam's **thumbnail** link and a photo opened full screen uses its **web**
link. Download fetches that photo's original once.

- **The first run after a deploy is the backfill.** It reads all pages of all
  linked projects. It runs ~18 s and then hands the rest to
  `companycam-photos-background`, which runs ~13 min. Each run keeps its place,
  so a big backlog is finished by the next runs. After the backfill, a run
  reads only the projects CompanyCam says changed. Every project is also read
  in full again every 12 hours, which drops deleted photos and takes fresh
  links.
- It paces itself (≥ 260 ms between calls). When CompanyCam answers 429, it
  waits the Retry-After time, or stops until then.
- **📸 CompanyCam sync status** shows "CompanyCam photos in GrayCo Photos":
  projects indexed / linked, photos, and progress while it runs. **⟳ Index all
  photos now** (admin / office) starts a full re-read at once. Press
  **Refresh** to see how far it is.
- A project linked after the last run still shows its photos straight from
  CompanyCam, as before, until the next run lists it.
- The index is never in the CRM's "what changed" download or the nightly
  backup, because it is rebuilt from CompanyCam.
- The "Customer sees it" / "Subs see it" choices work as before (`ccf_<id>`
  records).

Phone photos taken in GrayCo Photos were already small, and they stay that
way. They are stored at ≤ 1600 px, JPEG 0.72, metadata removed, with a 360 px
thumbnail.

### The old importers are off

These older parts of the CRM used to turn CompanyCam projects into Bidding jobs
or leads automatically:

- The webhook poller
- The 2-minute pull
- The CompanyCam tab's import
- The 2026 / year import
- The polling sync
- The 5-minute notes sweep
- The lead poller
- The drain

None of them can create a project or bring in a pre-2026 one any more. Their
timers are off, and their buttons and console commands now open the review list
instead. New jobs come only from the 2026 rule above.

### Live notifications from CompanyCam (optional)

CompanyCam can notify the CRM as soon as a project is made:

- **To turn it on:** run `_gcCCEnableLive()` once the key works, or add a webhook
  in CompanyCam's settings pointing to
  `https://<your site>/.netlify/functions/companycam-webhook` with the event
  `project.created`.
- **What happens to the notifications:** they wait on the server until the CRM
  picks them up (every 5 minutes). Then the 2026 rule applies: a project made in
  2026 or later becomes a Bidding job; an older or undated one is dropped. Only
  after that are they removed from the server.
