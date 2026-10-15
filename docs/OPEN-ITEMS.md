# GrayCo CRM — open items (the one list)

Updated 2026-10-15. Anything marked **YOU** is waiting on you, Wesley. Claude reminds you about these until they are done.

---

## YOU — do these (most important first)

| # | What | Why it matters | How |
|---|---|---|---|
| 1 | **Confirm what is live, then update to 33.143.** Your Oct-15 backup shows **33.142 is already live on at least one computer**. Tell Claude: what `graycocrm1.netlify.app/version.txt` says; whether Netlify is linked to GitHub; which steps of the go-live checklist are done (Netlify settings, prepare SQL, **storage-setup SQL**, logins). | Claude can only fix the right thing if we know exactly which build each computer runs. 33.143 adds the stuck-window fix. | Netlify settings → Supabase scripts → your login and Nick's → link Netlify to GitHub → check `version.txt` |
| 2 | **Fresh start and load your clean data** (steps 8–11) | Removes the 377 bogus jobs from the cloud for good | Wait for Claude's **duplicate-free** clean file, then follow the steps |
| 3 | **New CompanyCam key in Netlify** (`COMPANYCAM_TOKEN`) | CompanyCam is switched off until then. The key pasted in chat should be replaced with a fresh one. | CompanyCam → Settings → Integrations → API / Access Tokens → new token → Netlify → Environment variables |
| 4 | **QuickBooks: CSV files only (owner decision, no API)** | After 33.144: export the 5 reports and load them with 💎 → Import from QuickBooks (CSV) | See `docs/SETUP-CHECKLIST.md` Part G |
| 5 | **A2P 10DLC texting registration** | Required by the phone carriers before the CRM can send any business text messages. Without it, texts are blocked or marked spam. | Through the texting provider (Twilio or similar). Needs your **EIN, legal business name, address, website**, and a sample of the texts you'll send. It takes a few days to approve. |
| 6 | **Replace the Anthropic and Resend keys** | They could be used by anyone through the old open functions | `docs/SECURITY-SETUP.md` step 8 |
| 7 | **Reconnect Google (Calendar / Drive) and QuickBooks** after going live | Their old tokens were readable in the old open database | Remove access in Google, then reconnect in the CRM |
| 8 | **Glenn's pay type** | So his pay screens are right | Admin → Employees → Glenn → "PM (overhead split)" (overhead/split blank); Payroll → 1099, weekly, $19,968/yr |
| 9 | **Bank and cards in Accounting** (admins only) | Live balances for Wesley and Nick | Decide later: through QuickBooks (free), or Plaid / Teller |
| 10 | **Google Ads access** | So the CRM can see which ads bring jobs | Google Ads account ID + a manager (MCC) account + API developer token request. Claude gives the clicks when ready. |
| 11 | **Answer the open questions** | Claude can't build these without your answers | Still open: customer portal: photos automatic or PM-picked, and what you'd change in the mockup · daily/Friday report: which numbers |
| 13 | **Run `docs/storage-setup.sql` in Supabase if not done** | 33.142+ stores files in private storage. Until this runs, files wait **only on the computer that uploaded them** (Brittany's has about 50, including your PM Operations Manual). **Don't clear browser data there.** | Supabase → SQL Editor → paste `docs/storage-setup.sql` → Run → every line OK |
| 12 | **Two-step login (optional)** | Extra protection for admin accounts | You said "not yet". Revisit once everyone is signed in. |

| 14 | **Handouts: insurance carrier name** | The last blank on the handouts | Tell Claude your insurance carrier (or leave it as "Fully insured — certificate on request"). Everything else is answered. |
---

## Claude — building now

- **33.144:**
  - **Duplicates:** cleanup, never-allow-duplicates, the QuickBooks CSV import with Office to-dos, and invoices for review that don't count until confirmed
  - **CompanyCam:** fixed and tested
  - **New Accounting:** sections 2–7; cash today for admins only
- **Duplicate-free clean data file** from your Oct 15 backup
- **Field app and Office checks:** field app speed and instant sharing with desktop; Brittany's To-Do and Office tabs

## Your answers (recorded 2026-10-15)

- **QuickBooks:** CSV downloads only, no API. Banking later.
- **Handouts:**
  - MS license **#27769**
  - warranty **1 year on everything except insurance/restoration (5 years)**
  - **8 years in business** (through two previous companies, now one)
  - Facebook: facebook.com/p/GrayCo-Construction-Services-LLC-100092932745320
  - Google review link: share.google/quDuhdlL0ckxPLLY3
  - no Instagram or Nextdoor
  - wants a **send-online version** of each handout
- **Accounting answers:**
  - QuickBooks invoices are real; review invoices get confirmed by the QuickBooks CSV import
  - A001 stays in review
  - K&R $13,100 is one payment
  - Jon Rodriguez $250 stays in review
  - overhead placeholder costs are company overhead, not job costs
- **Customer portal:**
  - very easy to open and use; no password to remember
  - always shows the job's **CompanyCam link** and all their information
  - proposals made in **Google Docs or the CRM** appear there automatically
  - payments by **check or cash to the PM** for now; no card payments yet
  - mockup: https://claude.ai/artifact/Gc7K5MmeVEn48Z3LjpUc7t
- **CompanyCam:** projects created **before 2026 never come into the CRM**. From 2026 on, new CompanyCam projects **automatically become pipeline jobs as Bidding**.
- **The master step-by-step list is `docs/SETUP-CHECKLIST.md`.**

- **Job stages:**
  1. Lead
  2. Contacted (text / call / email, auto or manual)
  3. Appointment booked (goes into that PM's own schedule; **every appointment a PM makes flows into the CRM automatically**)
  4. Estimate sent
  5. Contract signed + job scheduled
  6. In progress (documents, keeping the customer aware, CompanyCam)
  7. Punch list
  8. Final invoice
  9. Closed (thank-you letter, closeout checklists, completion documents, warranty)
- **PM scorecard:** use all the suggested measures. Margin vs goal, on schedule, daily logs, photos at each stage, change orders billed, customer review score, invoices on time and checklist completion.
- **Daily and Friday reports:** must contain real information from the CRM, not placeholders.
- **Existing SOPs and checklists** (in your CRM's document templates):
  - PM Operations Manual
  - Software Tutorial Guide
  - Change Order
  - Residential and Insurance questionnaires
  - Sub Scope of Work
  - Warranties: Residential 1 yr, Insurance 5 yr, Commercial 1 yr
  - Conditional waiver
  - Forms library: contract, Arkansas notice, insurance work authorization, welcome & FAQ packet, final inspection sign-off, completion certificates, invoice
  - Closeout and walkthrough checklists

  Claude builds from these.

## Planned next (after the above)

1. Office approval desk ("runs without me") + daily / Friday report
2. PM accountability: stage checklists, PM scorecard, SOPs, quizzes, flowcharts; GrayCo forms for every role on every job (auto email; text after A2P)
3. Estimating made easier for every PM
4. Sales without being there in person: automatic follow-up, **customer portal**, review requests
5. Marketing: Facebook / Google posts and ads, lead-source report

## Done (most recent first)

- Draft branded handouts (12): four brochures, customer scorecard, closeout scorecard, checks & balances sheet, door hanger, three "what to expect" pages. Waiting on item 14.

- 33.143 on GitHub: all fixes, security, fresh start, small file storage, pop-up windows always close
- Clean data reviewed with you: bogus jobs removed, lost invoices recovered, your decisions on each disputed invoice
