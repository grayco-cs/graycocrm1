# GC / owner portal, company documents, the portal as a phone app (patch GCP)

Owner, 10/21: *"For GCs: yes 1, 2, 3, 4 — but they probably won't do portal stuff, so all of that can also be from auto
e-mail too, for jobs we are required to do payments like that, or anything from any GC we work for. No 5. Yes 6: have
all that current on the GC portal where they can download my documents."*

## GC jobs

A **GC job** is a job GrayCo is hired on by a GC / company:

- the job is ticked **Hired by a GC / company** (job page → 🏗 GC portal), **or**
- its customer is a GC account (Customers → type GC).

Every commercial job shows the **🏗 GC portal** bar under the job header, so you can tick it.

Everything below works **in the GC's project page AND by e-mail**. A GC that never logs in still gets every pay app,
change order and RFI in their inbox.

| | In the CRM (job → 🏗 GC portal) | The GC gets |
|---|---|---|
| **Contacts** | Add the GC's people: **billing** (gets pay apps), GC PM, super. The GC account's accounts-payable contact is used too. | — |
| **Project page** | Make the link; **Copy**, **Preview**, **Send** (waits on ✅ Approvals, the PM approves), **Turn off** / **New link**. | `portal.grayco-cs.com/#g=…` with the schedule, updates, photos, pay apps, change orders, RFIs and GrayCo's documents. |
| **Pay apps** | Upload the pay app PDF (AIA G702/G703 from the CRM's pay-app builder, or your own), the period, amount and retainage. It goes on **✅ Approvals** (the PM, then an admin), then out. **Mark paid** when the money comes. | An e-mail from billing@ with the PDF and a button to **Approve** on their page (one tap with their name). GrayCo is told at once. |
| **Change orders** | The GC's requests come in as a to-do for the PM; **price** one, or write a new one. It goes on **✅ Approvals** (PM + admin), then to the GC to sign. | An e-mail with a button to **review and sign** (typed name + "I approve"). A signed change order is added to the job's change orders automatically (approved, with their signature), so it is in the next pay app. |
| **RFIs** | Numbered per job (RFI #001 …). Sent at once from your name; replies go to you; the job is in the subject. Type in an answer that came by phone or e-mail. | The RFI by e-mail and on their page, where they can answer. The PM gets the answer by e-mail. |
| **Documents** | Admin → **📄 Company documents**: COI, W-9, licenses, safety program / records, lien info, each with its expiry date. | The **current** ones to download on every GC project page. A renewed COI is e-mailed to every active GC contact, one e-mail each, after an admin approves it. |

The GC **never** sees GrayCo's costs, margins, sub pricing or internal notes, or that subs have a portal.

**Reminders.** 30 days and 7 days before a company document runs out, and when it has, the admins get an e-mail and an
Office To-Do. This runs every morning on the server (`gc-portal-daily`).

## The portal like an app on the phone

The customer portal (and the GC page and the sub portal, which are the same page) can be added to the home screen:

- **Android:** an "Add GrayCo to your home screen" bar with **Install**.
- **iPhone:** the bar says: Share → Add to Home Screen.

`×` hides it for a month. The service worker keeps only the page's look and icons. Job data, photos, documents and
sign-in always come fresh from the server and are **never** stored on the phone. When the phone is offline it says so.

## The customer's Home

- **Mid-job check-in.** About halfway through the job (between its start and end dates) the customer gets
  *"How is your project going?"* 😀 😐 😟, once per job.
  - A 😟, or a 😐 with a comment, e-mails and pushes the job's PM, the admins and the office.
  - It always puts **"Check in with &lt;customer&gt; — &lt;PO · job · address&gt;"** on the shared Office To-Do, with the
    comment, a **📞 Call** button and **Open job**.
  - The to-do stays until someone presses **✅ Checked in** and says what was done. That note is logged on the job.
- **Warranty registry.** When the job is finished, the customer can download a **warranty registry PDF**:
  - GrayCo's workmanship warranty: 5 years on all roofing and on insurance / restoration work, 1 year on everything else;
  - the manufacturer registration (GAF, Owens Corning, CertainTeed …), from the job's `mfrWarranty`.

## Spring / fall free roof inspection

From **March 15** and from **September 15**, the daily run puts **one** approval on ✅ Approvals for the admins. It
lists every past residential customer who:

- has an e-mail;
- had a job finished more than 6 months ago;
- is in the service area;
- where the map knows the address, is within about 10 miles of another past customer.

Approved, each person gets one e-mail from news@ (with unsubscribe) and a **"Yes — schedule my free inspection"**
button.

- **"Yes"** makes a lead for their **original PM**. If that PM is no longer active, the lead is unassigned and the admins
  are alerted.
- Merely opening the link changes nothing; mail scanners open links.

## PM workload (Admin → 👷 PM workload)

For each active PM: open jobs, open leads, contract $ in progress, overdue items (jobs past their end date plus to-dos
past due) and approvals waiting on them. Every **Assign PM** pick-list shows the same numbers next to each name.
Notifications always go to *the job's PM* or by role; no person is hard-coded.

## Setup (nothing new on Netlify)

- **Uses what is already set:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `PORTAL_BASE_URL`.
- **Optional:**
  - `INSPECT_OFF=1`: no seasonal offer;
  - `INSPECT_RADIUS_MILES`: the service area, default 35;
  - `PORTAL_MAIL_OFF=1`: no e-mail at all.
- **To start:** upload the COI and W-9 in Admin → 📄 Company documents. On each GC job, tick *Hired by a GC* and add the
  GC's billing contact.

## Files

- `netlify/functions/_lib/gcp.js`: the rules and the stores. Everything lives in service-only `gc_lead_inbox_kv` rows;
  link codes are never synced to a browser.
- `netlify/functions/gc-portal.js`: the endpoint (public GC / customer / staff doors).
- `netlify/functions/gc-portal-daily.js`: the daily run.
- `portal.webmanifest`, `portal-sw.js`, `portal-icon-*.png`; `portal.html` (`<script id="gc-portal-gcp">`).
- `index.html` (`<script id="gc-patch-gcp">`, plus small To-Do hooks).
