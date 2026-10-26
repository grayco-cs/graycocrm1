# GrayCo CRM: turn everything on

This is the one list of everything still to set up, in order. Each item says where to click.

- ✅ means it's already done.
- ⏳ means wait for Claude: that part isn't released yet.

---

## 1. Email addresses (Google Workspace, about 5 minutes)

Your company addresses: **office@**, **billing@**, **portal@**, **news@** and **claims@**.

**What each one does:**

| Address | The CRM sends from it | People can email it | Where replies and mail land |
|---|---|---|---|
| office@grayco-cs.com | everyday CRM email | yes, it's Brittany's mailbox | Brittany |
| billing@grayco-cs.com | customer invoices, statements and payment reminders go out from here; customers reply here | yes, once you add the alias below; **suppliers and subs send bills to invoices@, not here** | Brittany (and the CRM, once the bill inbox ships) |
| portal@grayco-cs.com | portal links and "new papers in your portal" | yes, once you add the alias below | Brittany |

**Sending already works.** ✅ The domain is verified in Resend. Resend can send from **any** @grayco-cs.com name without creating it, which is why you don't see portal@ or billing@ listed in Resend. That's normal.

**To receive mail at billing@ and portal@, add them as aliases of office@:**
- [ ] Go to **admin.google.com** and sign in as an admin.
- [ ] Open **Directory → Users** and click **office@grayco-cs.com**.
- [ ] Click **User information → Alternate email addresses (email alias)** → **Add**.
- [ ] Type `billing`, then **Add** again and type `portal`. Click **Save**.
- [ ] Test it: from your phone, send an email to billing@grayco-cs.com. It should arrive in Brittany's inbox within a minute or two. New aliases can take up to an hour to start working.

**Also add `claims` and `news`:**
- [ ] **news@grayco-cs.com:** add it as an alias on office@, the same way as above. The CRM already sends newsletters and marketing emails from news@, so replies to those land with Brittany.
- [ ] **claims@grayco-cs.com** (insurance: adjusters, carriers, claim programs). Make it a **Google Group** so more than one person gets every claim email:
  - admin.google.com → **Directory → Groups → Create group**.
  - Name: **Claims**. Email: `claims`.
  - Members: you, Brittany (office@) and whoever handles insurance jobs.
  - Access settings: set **"Who can post"** to **Anyone on the web**. Without that, adjusters outside GrayCo can't email it.
  - Click **Create**.

**That's the full set of addresses you need right now:**

| Address | Used for | How to make it |
|---|---|---|
| office@ | everyday mail; Brittany's mailbox | ✅ exists |
| billing@ | customer invoices and reminders go out from it; customer payment questions come in to it (supplier and sub bills go to invoices@) | alias on office@ |
| portal@ | customer portal emails | alias on office@ |
| news@ | newsletters and marketing | alias on office@ |
| claims@ | insurance adjusters and carriers | Google Group: you + office + the insurance PM |

**Optional, add later if you want them:**
- **info@** for the website or the public. Use an alias on office@.
- **estimates@** if customers send plans or photos for bids. Use a Google Group of the estimators.

Each person's own address (wjohnson@, nthomas@, sbiffle@, gmiller@) already exists.

---

## 2. Supplier bills into the CRM automatically ⏳ (when Claude says the bill inbox is ready)

1. Tell suppliers and subcontractors to email bills to **invoices@grayco-cs.com** (the CRM files them under Invoices; billing@ is for customers). You can start this today; the bills land in Brittany's inbox.
2. When the bill inbox ships, Claude gives you these steps:
   - **Resend → Domains → grayco-cs.com → Enable Receiving.** It uses a **separate sub-address**, so your Google email isn't touched.
   - **Netlify → DNS → grayco-cs.com:** add the one MX record Resend shows, for that sub-address only.
   - **Netlify environment variable** for the inbox secret, then Trigger deploy.
   - **Gmail (office@):** add a filter so mail sent **to billing@** is forwarded to the CRM's inbound address. Gmail sends a confirmation code the first time.
3. After that, every bill shows up on Brittany's **"Bills to approve"** list with a suggested job. Nothing reaches a job until she approves it.

---

## 3. Already done ✅

- Netlify is linked to GitHub (it deploys from **main**), and the Live check is on GitHub.
- Netlify variables are set: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SITE_ORIGIN, STAFF_EMAILS, COMPANYCAM_TOKEN, RESEND_API_KEY, ANTHROPIC_API_KEY.
- Supabase scripts C1–C5 have run, and public sign-ups are off.
- Team access is set up and everyone can sign in.
- DNS for email is fixed: Google SPF and DKIM, the GOOGLE spelling, and the Resend records.
- The Resend domain is verified.
- The CompanyCam card is green.

---

## 4. Do now

- [ ] **Everyone changes off the shared password.** Each person goes to 💎 → **Change my password** and picks their own.
- [ ] **Brittany signs in on her computer.** About 50 files waiting there upload by themselves. Don't clear her browser data before she does.
- [ ] **QuickBooks: mark Jay & Lorri Arnold inactive** so they don't come back from QuickBooks.
- [ ] **CompanyCam live notifications** (optional, makes new projects arrive within about 5 minutes):
  - In CompanyCam's settings, add a webhook to `https://graycocrm1.netlify.app/.netlify/functions/companycam-webhook`.
  - Event: **project.created**.

---

## 5. Go-live day ⏳ (when Claude says 33.145 is live)

- [ ] Delete **Dale** once in Admin → Employees. With 33.145, he stays deleted.
- [ ] Read the **QuickBooks check sheet** and tell Claude "OK".
- [ ] **Fresh start:** follow `SETUP-CHECKLIST.md` Part E with the clean QuickBooks file Claude sends.
- [ ] **Lock the database the same day:** Part F, `security-lockdown.sql`, then check in a private browser window that only the sign-in screen shows.
- [ ] **Brittany works her review lists:** costs to confirm, invoices not in QuickBooks, costs to assign to a job, the Mid-South refund, and invoice #1111.

---

## 6. After go-live

- [ ] **Reconnect Google Calendar and Drive** in the CRM, so appointments and Google Docs proposals flow in.
- [ ] **Pay setup:**
  - Glenn's pay type and 1099 setup;
  - Steven's hire date of Aug 17;
  - margin tiers for insurance and residential;
  - mark bid-board jobs.
- [ ] **Add Steven's jobs** that aren't in the CRM or QuickBooks yet.
- [ ] Optionally send the **QuickBooks 2025 reports** for EAN and K&R, to replace the two 2025 placeholders:
  - Open Invoices as of 12/31/2025;
  - Transaction List by Customer for 2025.

---

## 7. Later, when you're ready

- [ ] **Texting:**
  - Open a Twilio account.
  - Register **A2P 10DLC** with your EIN, legal name, address and website. Approval takes a few days to two weeks.
  - Tell Claude, and texting gets switched on. Until then everything goes by email.
- [ ] **Insurance (DASH / Xactimate):** Claude will tell you exactly which API access to request from DASH or Xactware once the research is done.
- [ ] **Bank and cards:** decide on QuickBooks bank feeds, or Plaid or Teller.
- [ ] **Google Ads:** account ID and API developer token, when we get to Marketing.
- [ ] **Two-step login** for admins.

## E-mail addresses: what goes where

| Address | What goes there | What the CRM does |
|---|---|---|
| **leads@grayco-cs.com** | Every lead and every bid invitation or bid-board notice: BuildingConnected, PlanHub, plan rooms, public bid sites, GC invitation lists, and the website, Facebook and Google forms. Sign up for every bid site with leads@. | Read into Leads → 📥 Lead Inbox. Alerts go to the office. |
| **bids@grayco-cs.com** | Only our own bids going out, GC replies to them, and subcontractors' prices for bids we are pricing. | GC replies are filed on the bid; sub prices land in Leads → 📨 Sub bids. |
| **claims@grayco-cs.com** | Insurance carriers, TPAs and adjusters: claim correspondence and new assignments. Copy claims@ on insurance e-mail. | Filed on the claim. A new assignment becomes an insurance lead. |
| **invoices@grayco-cs.com** | Subcontractor and supplier bills and invoices. Forward any invoice you get to invoices@. | Filed under Invoices, waiting for approval. |
| **receipts@grayco-cs.com** | Staff e-mail receipt photos and PDFs. | Shows on the To-Do as "Receipts e-mailed in". Someone confirms it. |
| **billing@grayco-cs.com** | Customer invoices, statements and pay apps are sent from here. Customers reply here about payments. | Lands in office@ (Brittany). |
| **office@grayco-cs.com** | The main office mailbox. | Brittany reads it. |
| **orders@grayco-cs.com** | Supplier order confirmations. | Linked to the job: delivery, schedule, Materials arriving. |
| **estimates@grayco-cs.com** | Estimators e-mail a takeoff or estimate (Word, PDF, Excel) to the CRM. | Stored for the office to build the estimate. |
| **replies@ · portal@ · news@** | Send-only. The CRM sends from them (portal links, newsletters); replies@ is the Reply-To of automatic e-mails. | Nothing reads them by machine; people answer replies@. |

- Never sign up for bid sites with bids@ or your personal e-mail. Use leads@grayco-cs.com.
- Forward any invoice you get to invoices@grayco-cs.com.
- Forward receipts (photo or PDF) to receipts@grayco-cs.com.
- Insurance correspondence: copy claims@grayco-cs.com.
- Tell subcontractors: invoices and pay requests go to invoices@, their prices for our bids go to bids@.
- Tell customers: payments and billing go to billing@, insurance claims go to claims@. Texts go to (901) 582-8255; the office line is (901) 585-0944.

Phone and text: text (901) 582-8255; office line (901) 585-0944. Tell subcontractors: send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO). Send your price for our bids to bids@grayco-cs.com.
