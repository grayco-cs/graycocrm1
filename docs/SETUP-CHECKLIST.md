# GrayCo CRM — the master setup checklist

Everything that has to be done, in order. Tick each box as you go.

- **"Safe to repeat"** means: if you have already done it, doing it again changes nothing.
- **Stuck on a step?** Send Claude a screenshot of that screen.

Websites you will use:
- **Netlify:** app.netlify.com. Where the CRM website lives.
- **Supabase:** supabase.com/dashboard. Where the CRM data lives.
- **GitHub:** github.com/grayco-cs/graycocrm1. Where Claude puts each new version.

---

## PART A — Make the newest CRM live, automatically, forever (about 15 minutes)

You have been dragging zip files into Netlify. That is why nobody can tell which version is live. After Part A, Netlify takes the newest version from GitHub by itself and you never upload anything again.

### A1. Connect Netlify to GitHub
- [ ] Go to **app.netlify.com** and sign in.
- [ ] Click your project **graycocrm1**.
- [ ] In the left menu, click **Project configuration**.
- [ ] Click **Build & deploy** → **Continuous deployment**.
- [ ] Click **Link repository** (it may say "Link site to Git").
- [ ] Choose **GitHub**. If GitHub asks you to sign in or "Authorize Netlify", say yes.
- [ ] Pick the repository **grayco-cs/graycocrm1**. If it isn't listed, click "Configure the Netlify app on GitHub", give it access to that repository, then come back.
- [ ] **Branch to deploy:** `claude/peaceful-dijkstra-goqgjq`
- [ ] **Build command:** leave it **empty**.
- [ ] **Publish directory:** type a single dot: `.`
- [ ] **Functions directory:** `netlify/functions`. It may fill in by itself.
- [ ] Click **Deploy** or **Save**.

**You'll know it worked when:** the left menu → **Deploys** shows a new deploy saying "Published", and it no longer says "Netlify Drop".

### A2. Check which version is live
- [ ] On any computer, open **https://graycocrm1.netlify.app/version.txt**
- [ ] It should say **33.143-2026-10-15-v1800**, or newer once Claude ships updates.

**From now on, this page is the only answer to "what version is live?"**

### A3. Reload the CRM on every computer and phone
- [ ] On each device, open the CRM and press **Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac). On phones, close the tab and open it again.

---

## PART B — Settings in Netlify (10 minutes, safe to repeat)

Netlify → **graycocrm1** → left menu **Environment variables** → **Add a variable** → **Add a single variable**.
Check each of these exists. If one is missing, add it: type the **Key** exactly, paste the **Value**, then **Create variable**.

- [ ] `SUPABASE_URL` = `https://ieeonhpfahmwwecizdut.supabase.co`
- [ ] `SUPABASE_SERVICE_KEY` = Supabase → Project Settings → API Keys → **service_role** (secret) key
- [ ] `SUPABASE_ANON_KEY` = Supabase → Project Settings → API Keys → **anon / public** key
- [ ] `SITE_ORIGIN` = `https://graycocrm1.netlify.app,https://crm.grayco-cs.com`
- [ ] `STAFF_EMAILS` = `nthomas@grayco-cs.com,sbiffle@grayco-cs.com,office@grayco-cs.com,gmiller@grayco-cs.com,wjohnson@grayco-cs.com`
- [ ] `COMPANYCAM_TOKEN` = a **new** CompanyCam token. Get it from CompanyCam → Settings → Integrations → API / Access Tokens → create. Then delete the old token there, since it was pasted in chat.
- [ ] `ANTHROPIC_API_KEY` = the AI key. **Make a new one** at console.anthropic.com → API Keys, then delete the old one.
- [ ] `RESEND_API_KEY` = the email key. **Make a new one** at resend.com → API Keys, then delete the old one.

- [ ] **Resend:** at resend.com → **Domains**, `grayco-cs.com` must say **Verified**. If not, add the DNS lines Resend shows (or send Claude a screenshot). Without it, automatic emails to customers won't arrive.

- [ ] Then: left menu **Deploys** → **Trigger deploy** → **Deploy site**. Netlify only reads new settings on a fresh deploy.

---

## PART C — Database setup in Supabase (15 minutes, all scripts safe to repeat)

Supabase → your project → left menu **SQL Editor** → **New query**. For each script: open the file from GitHub (github.com/grayco-cs/graycocrm1 → `docs` folder → click the file → copy all the text), paste it, click **Run**.

- [ ] **C1.** `docs/security-prepare.sql`. Ends with `prepared | 5`.
- [ ] **C2.** `docs/storage-setup.sql`. Every line says **OK**. *This uploads the ~50 files waiting on Brittany's computer, including your PM Operations Manual. Until it runs, don't clear her browser data.*
- [ ] **C3.** Logins. Left menu **Authentication**:
  - [ ] **Sign In / Providers**: turn **"Allow new users to sign up" OFF** → Save.
  - [ ] **Users**: check that **wjohnson@grayco-cs.com** and **nthomas@grayco-cs.com** exist. If not: **Add user → Create new user** → email, a strong new password, tick **Auto Confirm User**.

---

## PART D — Your team signs in (10 minutes)

- [ ] **D1.** Wesley signs in to the CRM with his new password.
- [ ] **D2.** Click **💎** → **Team access** → **Add** each person:
  - [ ] `sbiffle@grayco-cs.com` (Steven)
  - [ ] `gmiller@grayco-cs.com` (Glenn)
  - [ ] `office@grayco-cs.com` (Brittany, or her own email if she has one)
  - [ ] Nick, if not added in C3

  Each Add shows a **temporary password once**. Give it to the person by phone or in person.
- [ ] **D3.** Each person signs in on **every computer and phone** they use, then 💎 → **Change my password**.

---

## PART E — Start clean with the right data

**Wait for Claude's message "the duplicate-free file is ready".** Then:

- [ ] **E1.** Close the CRM on every computer and phone.
- [ ] **E2.** Supabase → SQL Editor → run `docs/fresh-start.sql`. Every line says **OK**.
  - Your old data is **kept twice, permanently**, and there is an undo. Nothing is destroyed.
- [ ] **E3.** On your computer: open the CRM and sign in. It empties itself once and reopens.
- [ ] **E4.** **Admin** → **💾 Storage** → **📤 Import Backup** → choose the duplicate-free file Claude sends → **OK**.
- [ ] **E5.** Check: about **73 jobs**, the right invoices, **no 211 pipeline**.
- [ ] **E6.** Everyone else: open the CRM and sign in. Each computer empties itself once, then shows the clean data.

---

## PART F — Lock the door (5 minutes, after Part D and E)

- [ ] **F1.** Supabase → SQL Editor → run `docs/security-lockdown.sql`. Every line says **OK**.
- [ ] **F2.** Open a **private / incognito** browser window → go to the CRM. You should see **only the sign-in screen**.
- [ ] **F3.** In Supabase SQL Editor, run this once to delete old CompanyCam key copies:
  `delete from public.gc_kv where key in ('gc_cc_token','gc_cc_token_backup','gc_cc_key_mirror','grayco_ccam_key');`

---

## PART G — After the next update (33.144) goes live

Claude will tell you when. Because Netlify is linked to GitHub, it goes live by itself.

- [ ] **G1.** Admin → **CompanyCam** card should be **green**. If it's red, the token in Part B is wrong.
  - 2026+ CompanyCam projects then appear as **Bidding** jobs on their own. Projects from before 2026 never come in.
- [ ] **G2.** **QuickBooks CSV.** In QuickBooks Online, export these (Reports → pick the report → dates "All Dates" → Export → CSV/Excel):
  - [ ] Invoice List (or Sales by Customer Detail)
  - [ ] Transaction List by Date
  - [ ] Customer Contact List
  - [ ] Vendor Contact List
  - [ ] Open Invoices (A/R Aging Detail)

  Then CRM → 💎 → **Import from QuickBooks (CSV)** → load each. Anything that doesn't fit becomes an Office to-do.
- [ ] **G3.** Brittany works the **Office To-Do** list: "QuickBooks import — needs a home" and "QuickBooks invoices to confirm" (JBS, Vanderbilt, S.W. Eavenson…).

---

## PART H — People and pay (10 minutes)

- [ ] **H1.** Glenn: Admin → Employees → Glenn Miller → Pay Type **"PM (overhead split)"**, leaving overhead and split blank.
- [ ] **H2.** Glenn: 💵 Payroll → Glenn → Pay setup → **1099 contractor**, weekly, **$19,968/year**.
- [ ] **H3.** Steven: profile → hire date (his commission year runs from **Aug 17**).
- [ ] **H4.** Each PM with insurance or residential **margin tiers**: add the tiers on their pay settings.
- [ ] **H5.** Mark **bid-board** jobs: 💎 → Job Source (commission) → "Bid board".

---

## PART I — Handouts (answer Claude, then print)

- [ ] **I1.** Tell Claude the warranty length for each type: residential, insurance/restoration, commercial, roofing.
- [ ] **I2.** Tell Claude your years in business and insurance carrier name.
- [ ] **I3.** Send Claude your real Google **review** link (the one that opens the "write a review" box).
- [ ] **I4.** Instagram / Nextdoor pages, or "none".

---

## PART J — Later (when you're ready)

- [ ] **J1.** **Texting:** (a) open a texting account (Twilio is the usual choice, a few cents per text); (b) register **A2P 10DLC** through it with your EIN, legal business name, address and website (approval takes a few days to two weeks); (c) tell Claude, who switches texting on. Until then everything that would be a text goes by email.
- [ ] **J2.** **Bank and credit cards** in Accounting (admins only): decide through QuickBooks, Plaid or Teller.
- [ ] **J3.** **Google Ads:** account ID and API developer token, when we get to Marketing.
- [ ] **J4.** **Customer portal:** tell Claude which pieces you want and how you take card payments.
- [ ] **J5.** **Google Calendar / Drive:** reconnect in the CRM after Part F.
- [ ] **J6.** **Two-step login** for admins (optional).

---

## If something goes wrong

- **Check `version.txt` first.**
- **Take a screenshot and send it to Claude.**
- **Nothing is ever destroyed:**
  - the fresh start has an **UNDO** block in `fresh-start.sql`;
  - the lockdown has a **RE-OPEN** block in `security-lockdown.sql`;
  - every computer keeps its own old copy;
  - nightly backups are kept for 30 nights.
