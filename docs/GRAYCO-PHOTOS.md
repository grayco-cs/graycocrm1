# GrayCo Photos (patch U2, on 33.150)

GrayCo's own job photo app, inside the CRM. It works like CompanyCam, and while you keep
using CompanyCam its photos show up in the same place.

## Opening it

- **Left menu (desk):** the **📸 GrayCo Photos** tab is the whole app, drawn inside the page with the menu still
  there.
  - It replaces the old "CompanyCam Photo Sync" screen.
  - Every role has it. Before this, only the office login had the old Photos tab, because no role list named it.
  - Its **‹** goes back to the tab you came from.
  - Its **⚙** holds **Check CompanyCam now**, the location switch, and who sees which photo.
- **Desk job page:**
  - **📸 Open in GrayCo Photos**, the green button under the job title. It replaced "Open in CompanyCam". A small
    **CompanyCam ↗** link stays next to it only when the job has a CompanyCam project.
  - **📸 GrayCo Photos**, next to **💬 Job Messages**.
- **Desk Projects list:** a **📸** on each row opens that job in GrayCo Photos.
- **Other "Open in CompanyCam" buttons** now say **📸 Open in GrayCo Photos**. That covers CompanyCam note approval,
  the CompanyCam tab, "New in CompanyCam" and the field job profile. They open the linked CRM job, or else that
  CompanyCam project inside the app.
- **Phone (field view):**
  - On the job list, tap **📸 GrayCo Photos**.
  - On a job screen, tap the **📸 GrayCo Photos** box, or **📷 Camera** to start shooting straight away.
  - Every screen closes with its own **‹** and goes back to where you were. The phone's Back does the same
    (patch NAV).
- **App icon on a phone:** open `https://<your site>/?app=photos`, sign in, then add it to the home screen.

## What's in it

- **Projects:** section chips (All, Leads, Bidding, Active, Completed) with counts.
  - Leads come from the Leads list. Jobs are sorted by status.
  - Each card shows a cover photo, 5 more photos, the team, the last activity and a
    "new messages" badge.
  - Search covers names, addresses and people.
  - Every team member's jobs are listed. CompanyCam projects that are not a CRM job yet also
    appear, but only while CompanyCam is connected.
- **Map:** shows every job with an address, with pins coloured by section. Tap a pin, then
  tap the card to open the job.
  - Addresses are looked up with the free US Census geocoder, which needs no key.
  - Each address is looked up once, and its point is saved on the job (`geoLat`, `geoLng`).
  - With no internet, the map turns into a list with Directions buttons.
- **Activity:** everything new, newest first:
  - photos added, with thumbnails;
  - photo comments and job chat;
  - customer updates (portal posts);
  - jobs moving to a new stage;
  - new leads;
  - CompanyCam uploads.

  The top of the screen shows **Today**: photos today, jobs updated, and jobs at Punch list
  or Final invoice that have **no "After" photo**. The tab shows how many items are new to you.
- **Team:** for each person:
  - role and when they were last active;
  - photos this week and active jobs;
  - their latest photos;
  - **Message**, which starts a direct conversation, with an unread count.
- **Job page:** a cover photo and the buttons **Camera**, **Chat**, **Directions** and
  **Report**. It has three tabs:
  - **Photos:** grouped by day. Each photo shows who took it, how many comments it has, a
    **CC** badge for CompanyCam photos, and filters for Before / During / Damage / After / Punch.
  - **Chat:** the whole team talks about the job.
  - **Info.**
- **Photo:** a large view and a note.
  - **Customer sees it / Internal only:** every photo starts customer-visible except
    **Damage**, which starts internal.
  - **Draw:** arrows, circles and text. This saves a new marked-up copy and keeps the original.
  - **Before/after:** pairs two photos so they show side by side.
  - **Add to report.**
  - **Comments,** where you can @mention someone.
  - **Delete:** admins only, and it is a soft delete. The record stays, marked deleted.

## Camera: photos go to the job, never to the phone's camera roll

- The camera button shoots **inside the app** with the phone's live camera (getUserMedia).
  - Each picture goes straight into the job.
  - Nothing is written to the phone's Photos or Gallery, and the app never calls any "save to
    device".
- Pick the tag (Before, During, Damage, After or Punch) before shooting. After **Done** you can
  change the tag and add a note for the whole batch.
- **Phone camera** and **Library** are the fallback buttons, for a phone that blocks the live
  camera.
  - **iPhone:** a photo taken this way is handed to the page only and is not added to Photos.
  - **Android:** most camera apps do the same. A few phone makers (some Samsung models) have a
    camera setting that also keeps a copy. The live in-app camera never does.
- Each photo is stamped with:
  - the time, the person and the job;
  - if you allow location once, the GPS point. It shows "on site" when the point is within
    about 150 m of the job's address.

## Never losing a photo (offline first)

1. The photo is written to the phone's own storage (IndexedDB, `grayco_photos`) the moment
   you take it. You never wait for the signal.
2. In the background it is shrunk like every CRM photo (patch G: up to 1600 px, JPEG 0.72) and
   stored by its fingerprint in the private bucket `crm-files`, with a small thumbnail.
3. Uploads retry with back-off. They pick up again after a reload, after the app was closed, and
   as soon as the signal returns.
4. The header shows **All synced**, **N uploading** or **N waiting · offline**.
5. The same picture twice (a double tap or the same file picked again) is one photo.

## Reports

**Job → Report:**

1. **Pick the photos.** All customer-visible photos are picked to start with. Internal-only
   photos are left out unless you pick them.
2. **Preview** the report.
3. **Send it:**
   - **Download PDF:** the navy GrayCo logo and each photo with its date and time, tag, who
     took it and note. It is also saved to the job's documents (Photo Reports).
   - **Copy share link:** a read-only page for a customer, sub or adjuster. It shows only the
     picked photos, its address cannot be guessed, and you can turn it off at any time
     (Report → Share links → Turn off).
   - **Text or email it:** the phone's share menu with the PDF. If the phone has none, a text
     or e-mail with the link.
   - **Post to customer portal:** the PDF appears on the customer's portal page.

## CompanyCam runs in the background only (owner, 10/20)

"Everything should be the GrayCo Photos app, not CompanyCam." Every place that told staff or customers to take or see
photos in CompanyCam now says GrayCo Photos:
- the job page buttons and the job's Photos section;
- the Projects rows and the field tiles / job profile;
- proposals ("Daily photo updates in your GrayCo customer portal");
- the completion checklists, the SOP and tutorial documents, and the PM Playbook;
- the customer portal.

CompanyCam's import, sync and webhook keep working, so its photos keep arriving inside GrayCo Photos. Only staff see
CompanyCam:
- the CC badge on its photos;
- a small "CompanyCam ↗" in the job's Info tab and under the job title;
- ⚙ → Check CompanyCam now;
- the CompanyCam admin screens.

## Who sees a photo (customer portal, sub portal)

On the photo screen, two switches:

- **Customer sees it / Hidden from customer**.
- **Subs see it / Hidden from subs** (`hideSubs`). When it is not set, it follows the customer switch, so an **Internal only** photo is never shown to a sub.

Both switches work on CompanyCam photos too, through a small flag record `ccf_<id>`. Photos a sub uploads from the sub portal show with a **SUB** badge. They start hidden from the customer. The contract is in `docs/SUB-PHOTOS-API.md`.

## The customer portal

The portal's **Photos** tab now shows the GrayCo photos marked **Customer sees it** next to the
CompanyCam ones:
- They are served as short-lived signed links.
- The marked-up copy is shown when there is one.
- Notes and names are never sent.
- Job chat and comments are internal and never reach the portal.

## CompanyCam (optional)

GrayCo Photos works fully with no CompanyCam token. When the server key works (patch I, the
`COMPANYCAM_TOKEN` setting), the job's CompanyCam photos are added through the existing server
proxy with a **CC** badge. When it does not work, nothing is asked for and nothing errors.

## Where the data lives

- `gc_kv` key **`gc_photos`** is the photo records, an id-keyed list. Each record has id,
  jobId, ref, thumbRef, tag, note, by, at, lat, lng, shared, annotatedRef, pairId, source and a
  fingerprint.
- `gc_kv` key **`gc_jobchat`** holds the job chat, direct messages and photo comments.
- Neither is ever stored in the projects row. Every save reads the cloud copy first and writes
  the union, so an older list never overwrites a newer one and a delete is a soft delete.
- The pictures are in the `crm-files` bucket.
- An @mention also adds an item to the Office / To-Do list (`gc_office_tasks`).

## One-time setup

1. Run `docs/grayco-photos-setup.sql` in Supabase → SQL editor. It creates `gc_photo_reports` (share links) and
   `gc_sub_portal` (sub portal link codes). Both have RLS on, no policies, and access is granted explicitly to
   service_role only. Every check line should say OK.
   - Nothing changes in the `crm-files` bucket or its rules: subs never touch it, and the server stores and signs
     their photos.
2. **Storage plan:**
   - Photos are about 150–350 KB each after shrinking, plus a thumbnail of about 15 KB.
   - At around 100 photos a day, that is roughly 1 GB a month.
   - The Supabase free plan has 1 GB of file storage. The Pro plan has 100 GB, then a small
     charge per GB.
   - Check Supabase → Settings → Usage → Storage.
3. **Location:** `_headers` now allows location for this site only
   (`geolocation=(self)`). Nothing else changed.
4. **Map tiles:** the map loads Leaflet 1.9.4 from unpkg and the map pictures from
   OpenStreetMap. Both are free and need no key or account.

## Limits

- **iPhone (Safari / home-screen app):**
  - The live camera works while the app is open on screen.
  - iOS may ask for camera permission again after an update.
  - Uploads only run while the app is open: iOS stops web pages in the background. Photos
    already taken stay safe on the phone and upload the next time the app is opened with
    signal.
- **Android:** the same, but Chrome often keeps uploading for a short while after you switch
  apps.
- Photos waiting offline use phone storage, about 3–5 MB each until they are shrunk. Hundreds
  of unsent photos on a nearly full phone could hit the browser's storage limit.

## Console

| Command | What it does |
| --- | --- |
| `_gcPhotos.open(jobId)` | opens Photos on a job |
| `_gcPhotos.status()` | the upload queue and the sync state |
| `_gcPhotoStats(jobId)` | counts by tag, for the PM scorecard and stage checks |
