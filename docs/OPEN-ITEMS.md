# GrayCo CRM — open items (the one list)

Updated 2026-10-15. Anything marked **YOU** is waiting on you, Wesley. Claude reminds you about these until they are done.

---

## YOU — do these (most important first)

| # | What | Why it matters | How |
|---|---|---|---|
| 1 | **Make 33.143 live.** Steps 1–7 of `docs/GO-LIVE-33.143.md` | Ends the lag, the 211 ↔ 12 jumping, typed words being wiped, stuck windows and the security holes. Nothing new is live until this is done. | Netlify settings → Supabase scripts → your login and Nick's → link Netlify to GitHub → check `version.txt` |
| 2 | **Fresh start and load your clean data** (steps 8–11) | Removes the 377 bogus jobs from the cloud for good | Wait for Claude's **duplicate-free** clean file, then follow the steps |
| 3 | **New CompanyCam key in Netlify** (`COMPANYCAM_TOKEN`) | CompanyCam is switched off until then. The key pasted in chat should be replaced with a fresh one. | CompanyCam → Settings → Integrations → API / Access Tokens → new token → Netlify → Environment variables |
| 4 | **QuickBooks production keys** | The old connection pointed at QuickBooks' *test sandbox*, never your real company | developer.intuit.com → your app → **Production** keys → Netlify `QB_CLIENT_ID`, `QB_CLIENT_SECRET` → CRM: Connect QuickBooks |
| 5 | **A2P 10DLC texting registration** | Required by the phone carriers before the CRM can send any business text messages. Without it, texts are blocked or marked spam. | Through the texting provider (Twilio or similar). Needs your **EIN, legal business name, address, website**, and a sample of the texts you'll send. It takes a few days to approve. |
| 6 | **Replace the Anthropic and Resend keys** | They could be used by anyone through the old open functions | `docs/SECURITY-SETUP.md` step 8 |
| 7 | **Reconnect Google (Calendar / Drive) and QuickBooks** after going live | Their old tokens were readable in the old open database | Remove access in Google, then reconnect in the CRM |
| 8 | **Glenn's pay type** | So his pay screens are right | Admin → Employees → Glenn → "PM (overhead split)" (overhead/split blank); Payroll → 1099, weekly, $19,968/yr |
| 9 | **Bank and cards in Accounting** (admins only) | Live balances for Wesley and Nick | Decide later: through QuickBooks (free), or Plaid / Teller |
| 10 | **Google Ads access** | So the CRM can see which ads bring jobs | Google Ads account ID + a manager (MCC) account + API developer token request. Claude gives the clicks when ready. |
| 11 | **Answer the open questions** | Claude can't build these without your answers | Job stages · top 5 PM scorecard items · daily/Friday report numbers · any SOPs/checklists you already have · CompanyCam: auto-job (a) or review list (b) · customer portal decisions |
| 12 | **Two-step login (optional)** | Extra protection for admin accounts | You said "not yet". Revisit once everyone is signed in. |

---

## Claude — building now

- **33.144:**
  - **Duplicates:** cleanup, never-allow-duplicates, the QuickBooks CSV import with Office to-dos, and invoices for review that don't count until confirmed
  - **CompanyCam:** fixed and tested
  - **New Accounting:** sections 2–7; cash today for admins only
- **Duplicate-free clean data file** from your Oct 15 backup
- **Branded customer handouts:** roofing, insurance claims, commercial build-outs, residential; a customer scorecard with Google review QR; job-site "checks and balances" leave-behind
- **Field app and Office checks:** field app speed and instant sharing with desktop; Brittany's To-Do and Office tabs

## Planned next (after the above)

1. Office approval desk ("runs without me") + daily / Friday report
2. PM accountability: stage checklists, PM scorecard, SOPs, quizzes, flowcharts; GrayCo forms for every role on every job (auto email; text after A2P)
3. Estimating made easier for every PM
4. Sales without being there in person: automatic follow-up, **customer portal**, review requests
5. Marketing: Facebook / Google posts and ads, lead-source report

## Done (most recent first)

- 33.143 on GitHub: all fixes, security, fresh start, small file storage, pop-up windows always close
- Clean data reviewed with you: bogus jobs removed, lost invoices recovered, your decisions on each disputed invoice
