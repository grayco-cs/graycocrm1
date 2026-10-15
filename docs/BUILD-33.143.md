# GrayCo CRM 33.143 — what changed (built on 33.139)

33.143 replaces 33.140, 33.141 and 33.142. None of them was deployed. **Follow `docs/GO-LIVE-33.143.md` step by step.**

## New in 33.143
- **Pop-up windows always close.** 33 windows (Payroll history and others) could get stuck when opened twice; "won't let me exit" was reproduced and fixed.
- Opening a window again replaces it.
- Close and ✕ always work.
- Esc, or a click outside, closes a window — except a form you have typed into. The company sign-in can never be dismissed.

## New in 33.142
- **Fresh start.** One Supabase script (`fresh-start.sql`) puts all old data away and the CRM starts empty. Then you load your clean backup.
  - **Nothing is destroyed.** The old data is kept twice, permanently, in the cloud. Each computer also keeps its own old copy. There is an UNDO.
  - **An old or offline computer cannot push old data back.** It checks the fresh-start date before it saves anything. The database refuses old data too.
  - Your sign-in and per-computer settings survive.
- **Files are as small as possible.**
  - Photos and receipts are shrunk on upload but stay readable. Example: 3.8 MB → about 100 KB.
  - The same file is stored once.
  - Files go to private file storage, and records keep only a short reference. Documents now show on every computer.
  - Existing files convert automatically on each computer.
  - On the Aug-28 data, the stored data went from 32 MB to 0.4 MB.
- **Fixed:** a background schedule clean-up in 33.141 treated every item as its own duplicate and could delete the company schedule from the cloud.
- **Fixed:** the import now leaves out records your backup itself had marked deleted. It also brings back job sources, approvals, commission-paid marks and Cordova data.

Stamp: **33.143-2026-10-15-v1800** — build comment, console line, `BUILD_ID` and `version.txt` all say this.
After deploying, open `…/version.txt` on the live site to confirm 33.143 is really live before judging any fix.

**Deploy the whole folder** (index.html, netlify/functions, netlify.toml, _headers, docs). There are two new functions:
`staff-admin.js` (Team access) and `gc-backup.js` (nightly backup).
**Follow `docs/GO-LIVE-33.143.md` step by step.**

Every fix below was reproduced on 33.139 first, then shown fixed by an automated test that clicks through the real app.
The tests ran offline, so nothing touched the real data.

---

## 1. Security: the public gets nothing
- **A company sign-in screen comes first.** Each person has their own email and password, checked by Supabase, not by the page.
- **The database answers only signed-in staff** once you run the lockdown script.
- **Email, AI, QuickBooks, Google, Brain and reports functions** need a signed-in staff member. Before this, anyone could use them.
- **💎 → Team access:** add or remove people, and reset passwords. Removing someone cuts them off at once.
- **Removed:**
  - the plain-text admin password and the built-in Nick/Wesley Admin passwords;
  - the old shared password, and the code that kept putting it back;
  - the old second cloud sync.
- **Removed from the public page:** customer and employee personal emails and phone numbers, old built-in job, customer and invoice data, and salary figures. About 200 KB.
- **Nightly protected backup:** 30 nights kept, out of reach of the web.
- **Automatic sign-out after 8 hours idle**, but never while you are in the middle of typing.

## 2. Money and accounting
- **A sub bill counts once.** It is not doubled when approved on a later day, and a rejected or deleted bill no longer counts as a cost.
- **A client invoice no longer creates an expense row.** It is saved as a draft.
- **A contract saved as text was being added to other numbers as text.** One example: the Dashboard showed $2.5 billion contracted. Now each contract is read as a number.
- **P&L:**
  - revenue = billed;
  - a paid sub bill is counted once;
  - a PM's P&L shows only their jobs;
  - "Collected" includes 💵 Payment entries, and a payment entered both ways counts once.
- **Reports:**
  - week expenses no longer go negative from client payments;
  - the week is right on Sundays and in the evening.
- **Refunds and credits lower a job's costs** on every screen. Client payments are never costs.
- **Credit change orders create a negative (credit) invoice.**
- **Card and bank imports (Chase, Amex, Capital One, Wells Fargo, generic):**
  - dates are read;
  - "$1,234.56" is read correctly;
  - payments and refunds are no longer imported as charges;
  - Wells Fargo's first row is kept;
  - totals skip excluded transactions.
- **AI statement upload:** it no longer sticks on "Parsing…", no longer imports duplicates, and skips credits.
- **"Today" uses Central time.** After 7 pm it used to give tomorrow's date.
- **Picking a sub no longer replaces the amount you typed.**
- **Deleting an expense sticks.**
- **Dragging rows to reorder them no longer hides other rows.**
- **Accounting tiles:**
  - Sub AP skips rejected bills;
  - Change Orders skips declined ones;
  - the dark view skips duplicate register copies and card payoffs;
  - the Payments page counts client invoices only.

## 3. Commission and pay (your rules)
- **Pay is figured job by job, on billed revenue only:** $0 until a client invoice goes out.
- **Thresholds count billed revenue** and reset on each PM's hire-date anniversary. Steven's is August 17.
- **New or unset PMs: 15% overhead, then 60% GrayCo / 40% PM.** Bid-board jobs also pay 60/40.
- **Insurance and residential margin tiers pay the tier % of billed revenue.** For example, a 45% margin pays 12% → $12,000 on $100,000.
- **Handoffs:** the PM share is split evenly between the person who brought the job in and the person who runs it. An owner's half goes to GrayCo.
  - Set this per job in 💎 → Job Source (commission) → "Brought in by".
- **Sub invoices received by Wednesday are paid the following Friday;** Thursday to Sunday, the Friday after next.
  - "Always pay this Friday" is a per-person option.
  - The late banner follows this rule.
- **Bugs fixed:**
  - the automatic commission check used to count client payments against costs, double-count sub bills, and ignore the Wednesday rule;
  - the Payroll Check figured every commission on $0 costs;
  - the PM's own My Pay ignored their set overhead and split;
  - sub bills counted as PM revenue.
- **Steven's pay settings no longer re-apply themselves automatically.** The manual button is still there.

## 4. Estimates, projects, change orders
- **Estimate builder:**
  - Save works; it used to open an invisible dialog.
  - Two estimates made the same day no longer merge into one.
  - Lines you add are kept on Save.
  - The saved list responds to clicks.
  - No more empty ghost drafts.
  - The Estimates page and the builder show the same totals.
- **Default pricing by job type.** Pick the type in the new **Job type** box; it is filled in automatically from the linked job.
  - **Residential: 30% margin** (×1.4286) → $1,000 of cost sells for $1,428.60.
  - **Commercial: 20% margin** (×1.25) → $1,250.00.
  - **Insurance:** the same 30% default if someone builds one in the builder. Insurance is normally priced in Xactimate.
  - Both defaults can be changed in the builder's Settings.
  - **Saved estimates are never repriced.** An old estimate reopens at exactly its saved price.
  - Settings still on the untouched old 22% default move to 30%; numbers someone typed in stay.
- **Hand-typed contracts are never overwritten.** The background estimate→contract sync only fills a job that has no contract yet.
- **Approved change orders raise the job's contract value,** shown live: "Contract + COs = total". Draws are not billed twice.
- **Deleting a job keeps its estimates** as unassigned. Invoices and change orders stay.
- **Also fixed:**
  - a project made from a won bid could never be opened;
  - editing a proposal line reset the contract to cost;
  - "Fixed Price" sold at $30, and 0% markup still charged 30%;
  - per-line markups were ignored;
  - takeoff crew labor was priced for one person;
  - Launch Job draft estimates showed $0, and its Google Doc and Gmail steps were broken;
  - the draw schedule from proposals came out empty;
  - template Edit did not open;
  - files over about 400 KB crashed;
  - Schedule "Complete & Invoice" crashed.

## 5. Sync, backup, Cordova Club
- **The company sync pull works again.** Payroll, timesheets, approvals, commission-paid marks and the rate book now reach every computer.
  - This had been broken since 33.115.
  - The merge is safe: newer wins, and nothing is deleted because another computer lacks it.
- **Cordova Club:**
  - it was a blank page in 33.139, and now opens;
  - it saves, and syncs company-wide;
  - loan, bid and money inputs are cleaned.
- **Every Import / Load Backup button only adds.** You see a summary with Cancel first.
- **Every Export button gives the verified full backup.**
- **"Reset All Data" is removed.**
- **Also fixed:**
  - the crash screen's Reload wiped data;
  - the Docs project link crashed;
  - night mode showed photos as negatives;
  - login now works on plain-http addresses.

---

## You do these (only you can)
1. Follow `docs/SECURITY-SETUP.md`, steps 1–9.
2. **Get new keys** for Anthropic and Resend. Reconnect Google and QuickBooks (setup guide step 8).
3. **Glenn:**
   - Admin → Employees → Glenn Miller → Pay Type **"PM (overhead split)"**, with overhead and split left blank so he gets 15/60/40.
   - 💵 Payroll → Glenn → Pay setup → **1099 contractor**, weekly, $19,968 a year ($384 × 52).
4. **Insurance and residential tiers apply only to PMs who have tiers on their profile.** Add them under the PM's pay settings.
5. **Bid-board jobs:** mark them in 💎 → Job Source (commission) → "Bid board". 33.139 had no reliable way to tell them apart.
6. **Old doubled sub bills** (approved before this update) still show twice. New ones are fine.

## Decided by you and built in
- **Commission is figured job by job.** A losing job does not reduce a profitable one.
- **Pending (unapproved) expenses still count as costs.** This is open question (b), unchanged. Say if you want it changed.
