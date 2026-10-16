# Fresh start — the CRM holds only what you load from your backups

Use this when the synced data keeps going wrong. After a fresh start, the CRM starts empty. Then you load your backup file, and the CRM holds exactly what is in that file.

No computer and no cloud copy can bring the old data back.

**Nothing is destroyed.** The old data is kept in three places, and you can put it back at any time (see the end of this guide).

---

## Before you start

1. **Keep your backup files safe.** Copy the one you mean to use into a second folder or onto a USB stick.
   - Pick the newest file you trust, for example `GrayCo_CRM_backup_2026-08-28….json`.
   - Every backup format the CRM has ever saved works, including the August 28 file.
2. **The new build must be live first.** Deploy the whole folder to Netlify, including `netlify/functions/gc-backup.js`. Then open `…/version.txt` on the live site and check that it shows the new build.
   - Only this build knows how to empty itself.
3. **Close the CRM on every computer, tablet and phone.** Close every tab and every window.
   - Do this so that nothing is open while the cloud is being cleared.
   - If you forget one, it still cannot put old data back. The database refuses any save from a window that is not on the new fresh start, even one still running an older build. That window shows errors until you close and reopen it.

## The steps, in this order

1. **Run the SQL.**
   1. Go to Supabase → SQL Editor → New query.
   2. Paste all of `docs/fresh-start.sql`.
   3. Click Run.
   4. In the last results grid, every line should say **OK**.
   - The line "removed, not on either list" names anything the script did not recognise. These are kept in the copies. Tell Claude if one of them should have stayed.
   - Running the SQL a second time does nothing. It says "already done".
2. **On the computer you will load the backup from:** open the CRM and sign in if it asks.
   - A dark screen appears for a few seconds: **"GrayCo — fresh start … putting its old CRM data aside"**.
   - The CRM then opens empty, and you are still signed in.
3. **Load the backup.**
   1. Click **Admin → 💾 Storage → 📤 Import Backup**.
   2. Pick your backup file.
   3. Read the summary. It says how many projects, invoices and expenses will be added, and how many records the backup itself had marked deleted. Those deleted records are left out.
   4. Click **OK**. The page re-opens with your data.
   - If you have more than one file, import them one after another. An import only adds; it never removes.
4. **Check the counts.** Look at Projects, Invoices, Expenses, Schedule and Customers. They should match your backup.
5. **Every other computer:** open the CRM and sign in.
   - It empties itself the same way. Its own old data is kept on that computer.
   - It then fills from the cloud within about a minute.
   - Phones and tablets work the same way.

## What stays after the fresh start

These are settings a backup file does not carry:

- the company sign-ins
- Google Calendar and Docs connections
- the CompanyCam key, QuickBooks tokens and the lead/money door token
- document and contract templates
- the rate books (labor rates, price sheets, the estimator rate book)
- commission structures, payroll settings and check-run settings
- ACH details and the overhead and starting-cash settings
- each computer's own screen settings (night mode, menu order, idle time)
- one-time markers, so old one-time jobs do not run again

**Everything else is cleared from the cloud and from every computer:**

- jobs, invoices, expenses, schedule, customers, subs, vendors, leads, change orders, estimates, payroll and timesheets
- the register and approvals
- Cordova Club
- attached documents
- old in-cloud daily backups
- **all deletion lists ("tombstones")**

Because the deletion lists are gone, every record in your backup file loads, including records that had been deleted before. The only records left out are the ones the backup file itself marks as deleted.

## Things to know

- **Unsaved typing is safe.** If a computer is in the middle of typing when it finds out about the fresh start, it shows an orange bar and waits. It empties itself only after the words are saved or the form is closed. Nothing typed in that window can reach the company data.
- **A computer opened without internet does nothing until it can ask the cloud.** It deletes nothing and sends nothing. As soon as it is back online, it empties itself.
  - An old laptop that has been off for weeks cannot push its old data back.
- **Attached documents** (photos and PDFs) in the backup load on the computer that imports it.
  - Each file under 3 MB also goes to the cloud as its own row, and the other computers get it.
  - Larger files stay on the importing computer and are flagged for review. They have never synced.
- **People** (the users list) are matched by email.
  - A backup's Wesley is the same person as the built-in Wesley, so you will not see him twice.
  - The company sign-in still opens the CRM as the right person.
- **QuickBooks jobs** in the backup that have a contract or a PM stay on the job board.
  - Importer rows that nobody ever touched are kept off the board, as before (33.136).

## Nothing is destroyed — how to get it back

The old data is kept in three places:

1. **In the cloud, twice, permanently.**
   - The table `gc_backups` holds it, labelled `fresh-start <time>` and marked *keep*. The nightly backup never prunes it.
   - The separate table `gc_archive_fresh_start` also holds it. That table refuses any change or delete.
   - Neither table can be reached from the web.
2. **On each computer.** Its own old data, including records that only ever existed on that laptop, is kept in a separate database on that computer called `grayco_crm_archive_<time>`. The CRM never reads it.
   - To get it as a file:
     1. Press F12 on that computer and open Console.
     2. Type `_gcArchiveList()` to see the copies.
     3. Type `_gcArchiveExport()` to download the newest one, or `_gcArchiveExport('<name>')` for a specific copy.
   - 📤 Import reads that file and adds only what is new.
3. **Your backup files**, untouched.

**Put one setting back.** If something should have stayed, use the "PUT ONE KEY BACK" block near the end of `fresh-start.sql`. Put the key name in and run it.

**Undo the whole fresh start.**

1. Use the **UNDO** block at the bottom of `fresh-start.sql`.
   - It first keeps a copy of what is there now (your import), labelled `before-undo …`.
   - It then puts the cloud back exactly as it was, with every record and every deletion list.
2. Every computer then empties itself once more (each keeps its copy) and loads the restored data from the cloud.

**A second fresh start later.** In `fresh-start.sql`, change `v_force boolean := false` to `true`, then run it. Every earlier copy stays.

## For Claude / support

- Console tools on any computer:
  - `_gcEpochStatus()`: which fresh start this computer is on, and whether writes are allowed
  - `_gcArchiveList()` and `_gcArchiveExport(name)`: the archives kept on this computer
- The marker is the gc_kv row `gc_epoch`, `{epoch, by}`.
  - Each computer keeps `gc_epoch_local`.
  - A computer writes to the database only after it has confirmed the two match. It checks again before writing if the last check is over a minute old, and always after a wake-up or reconnect.
  - Every gc_kv row it writes carries `epoch`. The trigger `gc_kv_epoch_guard`, added by `fresh-start.sql`, refuses a browser's row with any other epoch. The SQL editor and the service-key functions are not checked.
- The schedule sweep used to delete (tombstone) every schedule row that was on both a computer and the cloud, 9 seconds after each load. That would have wiped an imported schedule, so it is fixed in this build:
  - the same row is no longer treated as its own duplicate;
  - the automatic sweep never writes a deletion.

## Owners-only data (gc_admin_kv) — not touched by a fresh start

Since patch K the cash / bank-balance records (`gc_cash_anchor`, `gc_accounts_cfg`,
`gc_accounts_ledger`) live in the table **gc_admin_kv** (docs/admin-data.sql), which only Wesley
and Nick can read. `fresh-start.sql` works on `gc_kv` only, so **gc_admin_kv is left exactly as it
is** — the starting cash and account balances survive a fresh start. (`gc_cash_anchor` is still on
the fresh-start KEEP list for the old gc_kv copy, until the one-line delete in admin-data.sql step 5
is run; a non-admin computer never keeps a copy of it either way.) The nightly cloud backup
(gc-backup) now also copies gc_admin_kv into the private gc_backups table.
