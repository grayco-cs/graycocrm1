# 📜 Certifications (patch CERTS)

Where: Forms & Docs → 🎓 Training → **📜 Certifications** (admins). To-Do items open it too.

- **Company** tab: GrayCo's licenses and firm certifications (TN / AR / MS contractor licenses, EPA RRP firm, MDEQ, TDEC,
  ADH lead, IICRC Certified Firm, HAAG). Added automatically the first time an admin opens it, with blank dates.
- **Employees** tab: each person's certifications (IICRC technician, RRP renovator, state lead certs, HAAG …). ＋ Add
  certification → pick the person and a type.
- Each one: number, issued, **exact expiration**, **apply by** (expiration minus its lead days: EPA RRP firm 90, TN license 30
  …), how often it renews, the fee and late fees, what renewal needs, the website, the certificate file.
- **✓ Renewed / paid** logs the payment (date, amount, method, confirmation #) and sets the new expiration (pre-filled from
  the renewal cycle). **💵 Payments & fees** lists every payment by year and the fees due in the next 12 months.

Reminders: each certification warns first 30 days before its apply-by date; only the ones that need lead time warn earlier
("First warning" on the form: TN license 60 for the CPA statement, IICRC technician 90 for CE hours, RRP renovator and TDEC
individual 60). A To-Do for admins from the first warning, past apply-by, expired, or missing a date; and the daily run
(gc-portal-daily → `gcp.certRun`, under the "Company documents expiring" automation) e-mails admins + office and adds an
Office To-Do at the first warning, 30 and 7 days, on the apply-by date, and once expired. Company documents (COI, W-9,
licenses uploaded in Company documents) keep their 30- and 7-day warnings.

Data: gc_kv `gc_certs` ({ list }), `gc_certs_state` (which reminders went out). Rules and fees: agency websites, Nov 2026.
