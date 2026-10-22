# Storage — where the CRM keeps files, and how much room there is (patch INS3)

Owner (10/22): "this entire CRM will have lots of memory of files in it, how do we store so much data, will we save
every year and delete the previous years?"

**Short answer: keep everything. Nothing needs to be deleted each year.**

## Where things live

| What | Where | Uses our space? |
|---|---|---|
| Job photos | GrayCo Photos / CompanyCam | **No.** The CRM shows them by link; only small thumbnails are cached in the browser. |
| PDFs (estimates, Xactimate, policies, contracts, invoices, checks, COIs) | Supabase Storage, private bucket `crm-files` | Yes — about 1–5 MB each |
| Photos someone uploads straight into the CRM or a portal | `crm-files` | Yes, but every upload is shrunk first: long side 1600 px, JPEG quality 0.72, camera data removed (usually 150–400 KB). The same file stored twice is kept once (its SHA-256 is its name). |
| Jobs, customers, estimates, notes, claims (the data) | Supabase database (`gc_kv` and tables) | Yes, but small: text, not files |

## The room on the Supabase Pro plan ($25/month)

- **100 GB of file storage included.** Extra is about **$0.021 per GB per month** (100 GB more ≈ $2/month).
- **8 GB database included.** Extra is about $0.125 per GB per month.

What 100 GB holds: roughly **25,000–50,000 PDFs**, or about **250,000+ shrunk photos**. At a few hundred jobs a year
with 10–30 PDFs each, that is many years before the included space is used, because photos stay in CompanyCam.

## Watching it

**Admin → 💾 Storage** shows space used by year and kind (images / PDFs / other), the database size, the plan limits
(editable) and a warning at 80 %. It needs `docs/storage-usage.sql` run once in Supabase (read-only; it only adds two
functions that count). Until then the card shows the plan limits and how to turn the numbers on.

## Old years

- **Nothing is deleted.** The **Year-end archive** (Admin → 🗄) still makes one download per year of every closed job.
- **"Archive old years" setting (OFF by default)** in Admin → 💾 Storage: when turned on, files of jobs closed more
  than N years ago (default 3) are listed for moving to the company Google Drive with a link left behind. In this
  build it only **counts** what would move (a dry run); the mover is not switched on. Nothing leaves Supabase until
  the owner says so.

## Printed materials

Print pamphlets and flyers after the address move date (see Admin → 🏢 Company address).
