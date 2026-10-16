# The GrayCo customer portal

Every job has its own customer page. The customer opens it from a link. No password, nothing to download.

## One-time setup (do this once)

1. Open Supabase. Go to **SQL Editor → New query**.
2. Paste all of `docs/portal-setup.sql`. Click **Run**.
3. The grid at the bottom must say **OK** on every line.

That's it. These are already set on Netlify and are used as they are:
`SUPABASE_SERVICE_KEY`, `COMPANYCAM_TOKEN`, `RESEND_API_KEY`.

Optional on Netlify:
- `PORTAL_MAIL_OFF = 1` stops every portal e-mail (for a quiet week or a test).
- `PORTAL_BASE_URL` only if the links should use another web address.

## What happens by itself

- **A new job gets its link.** It does not matter how the job was made: + New Project, a lead turned into a job, or a CompanyCam project that became a job. Opening an older job makes its link too.
- **The link is e-mailed to the customer** the moment a new job is made. It goes once, never twice. The job card shows "Sent by e-mail".
- **No e-mail on file?** No e-mail goes out. The Office to-do list gets "Send portal link to (customer)". Open the job and tap **Text it** or **Copy link**.
- **Texting by itself** is built as a switch that stays off. It turns on only after texting (A2P 10DLC registration) is set up with a texting company.
- **New papers → the customer is e-mailed.** When a proposal or estimate reaches the portal (an estimate marked sent, a Google Docs proposal, a PDF or Word the PM uploads), or an approved change order, completion or warranty paper — the customer gets a short note from their PM with a "View it in my portal" button. Each paper only once. Several papers in a few minutes go in one e-mail. No e-mail on file: one Office to-do. The office switch and the job's pause switch stop these too.
- **Final invoice.** When a job has a final invoice that is not paid, it shows in the portal right away. The customer gets one e-mail with the link. Then a friendly reminder every 15 days until it is paid. It stops by itself when paid.
- **No e-mail on file for the final invoice?** An Office to-do: "Send the final invoice by hand".

## The office switch

On any job: **Customer portal → More → For every job**.
"E-mail the portal link to the customer when a job is made" — ON by default. Turn it off and no new customer gets the automatic e-mail. Turn it on again any time.

## How PMs use it (phone or desk)

Open the job. The **Customer portal** card is at the top.

- **📣 Post to customer** — type a few words, take or pick photos, tap **Post**. The customer sees it at once.
- **📋 Copy link · 💬 Text it · ✉️ Email it** — one tap each.
- **👁 See what the customer sees** — opens the customer's page.
- **📄 Documents & Google Docs** —
  - **Upload PDF or Word** (25 MB each at most). Word files are a download for the customer.
  - Paste a **Google Docs link** (proposal, scope). The doc must be shared "Anyone with the link can view".
  - Turn any file **on or off** for the customer.
- **More** — the stage the customer sees (automatic is fine), **pause automatic e-mails** to this customer (payment reminders and new-paper notes), **turn the link off**, **new link**.

## What the customer sees

- The GrayCo logo, a call button (901-585-0944), their PM's name with Call and Text.
- **Where the job is**: Lead → Contacted → Appointment booked → Estimate sent → Contract signed + scheduled → In progress → Punch list → Final invoice → Closed.
- **Updates** from the PM, with photos.
- **Photos**: every CompanyCam photo of the job, newest first. Plus "Open in CompanyCam".
- **Documents**, by themselves: proposals (made in the CRM or in Google Docs), the contract, approved change orders, invoices, the final invoice, warranty, welcome & FAQ packet, completion certificate, final inspection sign-off, lien waivers — as soon as they are on the job. Change orders, lien waivers, completion certificates, warranties and work authorizations made with **Create Document** are saved to the job and shown by themselves.
- **Warranty**: all roofs 5 years (residential, commercial and insurance roofs). Insurance / restoration 5 years. Everything else 1 year. It starts the day the job is complete.
- **Invoices & payments**: contract, approved change orders, each invoice paid or open, every payment. "Pay by check or cash to your Project Manager. Every payment shows on your final invoice." No card payments.
- **Their info** on file (name, address, phone, e-mail). To change it they call us.
- At the end (final invoice / closed): **Leave a Google review** and **Facebook** buttons.

## What is NEVER shown

Costs, margins, profit, commission, notes, internal notes, other jobs, pay, subcontractor papers (agreements, W-9, insurance certificates), bids, purchase orders, invoices still waiting for review, and the **insurance company's name** (it is replaced by "your insurance company"). Only a short, fixed list of things ever leaves the server.

## Turning a link off

Open the job → **Customer portal → More → Turn link off**. The old link stops at once. The customer sees "This link is not active — call GrayCo 901-585-0944".
**New link** makes a fresh one. Send the new one to the customer.

## Good to know

- A Google Doc preview only works if the doc is shared "Anyone with the link can view".
- CompanyCam photos come straight from CompanyCam. The "Open in CompanyCam" button may ask the customer to sign in, unless it is a CompanyCam share link.
- Links are long random codes. Nobody can guess one. Too many wrong tries from one place are blocked for a while.
