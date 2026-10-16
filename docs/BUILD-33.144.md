# GrayCo CRM 33.144: what's new

`version.txt` = `33.144-2026-10-15-v2300`. Built on 33.143 plus the v1930 quick fix.

## New
- **Customer portal.** Every job gets its own link, emailed to the customer when the job is created (email now, text after A2P 10DLC).
  - PMs post updates and photos from the phone (**📣 Post to customer**), upload PDF/Word files, and add Google Doc links.
  - Customers see all CompanyCam photos, every customer document, invoices and payments (check or cash to the PM), and the warranty: all roofs 5 years, insurance/restoration 5 years, everything else 1 year.
  - **New estimates, proposals and papers are emailed automatically.** One email lists everything new, with a button to the portal.
  - **Final invoice:** emailed and posted, then a friendly reminder every 15 days until paid. The office can pause a job.
  - Customers never see costs, margins, notes, pay, internal papers, or the insurance carrier's name.
  - See `docs/PORTAL.md`.
- **New Accounting home:** Money In, Money Out, Next 8 Weeks, Job Profit, P&L and To Match.
  - **Bank and cash numbers are only on Wesley's and Nick's computers.** Office computers never receive them.
  - See `docs/ACCOUNTING.md`.
- **No duplicates.**
  - Duplicate invoices, costs and payments are blocked when entered and folded out of the totals. Folding can be undone.
  - "Review" invoices don't count until confirmed.
  - QuickBooks CSV import: anything without a home becomes an Office to-do.
  - See `docs/QUICKBOOKS-CSV.md`.
- **CompanyCam:** 2026+ projects become **Bidding** jobs automatically. Pre-2026 projects never come in. This needs `COMPANYCAM_TOKEN` in Netlify.

- **Field app and instant sharing:** the field app opens instantly. Phone and desktop changes reach each other in 1–2.5 seconds (needs `docs/realtime-setup.sql`). Brittany's To-Do and Office tabs work: ticks stay, the list updates, and the owner's tasks reach her and show done on the owner's phone.
- **Emails come from the right address:** portal emails from portal@grayco-cs.com, final invoices and reminders from billing@grayco-cs.com, everything else from office@. Replies go to office@.

## Fixed
- **Data loss:** a background job could put back an older list and erase something you had just saved. Examples: a second sub bill vanishing, or a contract amount filled from an approved estimate going blank again. Every list now merges instead of overwriting.
- Everything from the v1930 quick fix:
  - the pipeline count no longer jumps (11 → 9 → 210);
  - the 2 MB-every-1.5-seconds upload loop is gone;
  - phone taps are fast.

## Setup for this update
In Supabase → SQL Editor, run `docs/admin-data.sql`, `docs/portal-setup.sql` and `docs/realtime-setup.sql`; each line should say OK. Both are safe to run again. See `SETUP-CHECKLIST.md` Part C.

## Coming next
- PM Performance (admins only).
- Paperwork autopilot: stage slider, documents made and sent per stage, customer checklist, field notes.
- GrayCo Photos.
