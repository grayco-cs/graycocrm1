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

### A new CRM job still gets its CompanyCam project

When you add a job in the CRM, the CRM looks for a matching CompanyCam project
and links it. If there isn't one, it creates the project in CompanyCam. This
uses the key on Netlify.

- It only does this for jobs added in the last 14 days. It never goes through
  old jobs.
- It runs about 2 minutes after a job is added, and during each 30-minute check.

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
