# Files in the CRM — where they live now

**Your rule:** "Anything put into the CRM for storage must always be the smallest it can be."

## What changed

Until now every file you attached (job documents, receipts and invoice PDFs, photos, sub W-9s and COIs,
profile photos, Cordova loan statements, estimate and plan files) was stored **inside the record itself** as
text (base64). That made each file a third bigger, stored the same file again for every record that held
it (your backup had the same 0.9 MB PDF three times), kept phone photos at full camera size, and made the
job-documents list too big to reach your other computers at all.

Now every file goes through one path:

1. **Photos are made small.** Turned the right way up, shrunk so the longest side is 1600 pixels (profile
   photos 256), saved as JPEG at quality 0.72, with the camera's hidden data (GPS, phone model) removed.
   A 4 MB phone photo becomes about 100–250 KB. A photographed receipt or invoice stays easy to read
   (tested: the smallest print stays about 14 pixels tall). If shrinking would ever make a file bigger,
   the original is kept. Logos with a see-through background stay PNG.
2. **One copy of each file.** Every file gets a fingerprint (SHA-256). The same file attached to two jobs,
   or uploaded on two computers, is stored once.
3. **The file goes to the company's private file storage** (Supabase Storage, bucket `crm-files`). Only
   GrayCo staff who are signed in can open it — the public key cannot.
4. **The record keeps only a short reference** (about 150 characters):
   `sb:crm-files/<fingerprint>.pdf` plus name, type, size, fingerprint, date and who added it.
   No file text is kept in records, on your computers, in the cloud database rows, or in backups.

Because the records are now tiny, **job documents sync to every computer again** (they were switched
off in build 33.115 because they were too big). A document added on one computer opens on the other.

## The one setup step (5 minutes, once)

After `docs/security-prepare.sql` has been run:

1. Supabase → **SQL Editor** → New query.
2. Paste all of **`docs/storage-setup.sql`** → **Run**.
3. The grid at the bottom must say **OK** on every line.

It creates the private `crm-files` bucket (25 MB per file) and its rules: staff can read and add files;
**nobody can change or delete a stored file from the CRM** (one stored file can belong to several
records, so deleting it from one place could break the others — permanent removal is done by you in
Supabase → Storage → crm-files). Running `docs/security-lockdown.sql` later does not touch these rules.

Until this is run, the CRM keeps new files on the computer they were added on (small, already shrunk)
and sends them up by itself as soon as the bucket exists. Nothing is lost while you wait.

## What you will see

- **Nothing different when you attach a file** — except that big photos save faster.
- **The first time each computer opens this build** (after you sign in, and after the fresh-start check),
  it quietly moves the files it already has into the file storage, one record at a time, pausing while
  anyone types. On your 28-Aug backup's data this took a computer from about **32 MB to under 0.4 MB**.
  It never deletes a record and never writes a deletion. If the computer is closed half way, it simply
  continues next time.
- **Opening a file** works as before (Download, 👁 Preview, the job document lists, receipts, sub W-9 /
  COI, Cordova statements). The file is fetched from the private storage with your sign-in.
- **No internet:** files added on this computer still open; a file added elsewhere that was never opened
  here shows **"This file is available when online."** A file the other computer has not finished sending
  yet says so.
- **💾 Import of an old backup** that still has files inside it: the files are shrunk, stored once, and
  the records keep references. Backups made from now on are small (references only).

## Good to know

- **A fresh start (docs/fresh-start.sql) does not delete stored files.** They sit in the private bucket,
  harmless; when you re-import a backup, any file already there is simply re-used by its fingerprint.
- **Backups now hold references, not the files.** The files themselves are kept by Supabase Storage.
  If you ever want an offline copy of every file, download the `crm-files` bucket from the Supabase
  dashboard (or ask for an export tool).
- **Files over 25 MB** (e.g. a long video) stay on the computer they were added on and are listed by
  `_gcFilesStatus()`; raise the limit in `storage-setup.sql` if you need bigger files shared.
- Optional: `localStorage.setItem('gc_files_webp','1')` lets photos be saved as WebP when that is even
  smaller (off by default because some e-mail programs and PDF tools still cannot show WebP).

## For whoever maintains the CRM

- Pipeline: `window._gcStoreFile(file | blob | dataURL, {kind:'doc'|'profile', name})`
  → `{ref, name, type, size, hash, uploadedAt, by}`.
- Reading back: `_gcFileUrl(ref)` (blob: URL, cached per page), `_gcFileBlob(ref)`,
  `_gcFileDataUrl(ref)`, `_gcOpenRef(ref, name)`, `_gcDownloadRef(ref, name)`.
- Console: `_gcFilesStatus()` (waiting uploads, bucket state), `_gcFilesMigration()` (what the one-time
  move did, MB before → after), `_gcFilesSweep({now:true})` (run the move now),
  `_gcFilesUploadNow()`, `_gcFilesDocRows()` (rewrite old per-document cloud rows).
- This computer's waiting files: IndexedDB `grayco_files` (stores `pending`, `done`, `src`).
