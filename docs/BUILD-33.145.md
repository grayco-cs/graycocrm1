# GrayCo CRM 33.145: deletes stick, no old data coming back

`version.txt` = `33.145-2026-10-16-v1900`. Built on 33.144.

## Fixed
- **Deletes stick.** Every delete is recorded permanently, on every device and in the cloud. A sync, a backup, a safety feature or an old device can't bring it back. That covers employees (Dale), jobs, customers, invoices, expenses, estimates, documents, photos and more. Before, 14 delete buttons left no record, and the Customers delete did nothing at all.
- **Old devices can't push old data.** A computer or phone that still has an old copy (an open tab, a laptop waking up) can't send old jobs or old statuses back. Your newest change wins. Before, a Completed job could go back to Active.
- **"Make the cloud the truth now"** (Admin, owners only): one click makes every other device put its old leftovers aside and take the cloud's version. It keeps a backup on that device and never deletes anything in the cloud.
- **Job delete button:** now a grey 🗑 that shows when you point at a job row. It asks with the job's name, and Enter or Esc cancels.
- **CompanyCam:** a new 2026 project for a customer you already have is no longer skipped.

## Tests on this build
- delete and old-device test: 29/29 (33.144: 9/28)
- CompanyCam: 10/10
- security 158/158, pop-ups 7/7
- duplicates 55/55, data loss 39/39, Accounting 37/37
- portal 115 / 37 / 40
- sharing 11/11

## Right after it goes live
1. Reload every open CRM tab with **Ctrl+F5**, on every computer and phone.
2. Delete Dale, and anything else that came back, once.
3. Admin → **Make the cloud the truth now** → OK.
