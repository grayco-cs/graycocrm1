# Lead Inbox + bid portal: owner setup (about 45 minutes, once)

> **Process rule: leads@grayco-cs.com is for all incoming leads and bid invitations.** Every bid site, plan room (BuildingConnected, PlanHub and
> others), city, county and school bid board, and GC invitation list gets signed up with leads@grayco-cs.com. GCs are told: "send invitations to
> leads@grayco-cs.com". Website, Facebook and Google lead forms also send to leads@. The CRM reads leads@ and turns each e-mail into a lead or bid
> lead in Leads → 📥 Lead Inbox / Bids automatically. **bids@grayco-cs.com is only for our own bids going out (sent from the CRM) and GCs' replies
> to them. Never sign up for notices with bids@.**
>
> **Changed 10/22 (patch EST4): bid notices go to leads@grayco-cs.com.** BuildingConnected, PlanHub, the planrooms, GCs and the
> agencies send their invitations to **leads@**; the CRM tells a bid invitation from a customer by itself. (Subcontractors' prices e-mailed
> to bids@ are still matched to their bid job and the estimator is told: Leads → 📨 Sub bids.)
> Make bids@ a Google Group whose members are the estimator and `bids@in.grayco-cs.com`. Invitations that still arrive at bids@ (old sign-ups)
> are recognised and still become bids. <!-- patch EST4 -->


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

**What you get.** Every bid opportunity reaches GrayCo in one of three ways:

- an e-mail to **leads@grayco-cs.com** (BuildingConnected, PlanHub, A&B, RKA, GCs, agencies);
- a public government bid list that the CRM reads on its own;
- the BuildingConnected API (optional).

Each one becomes:

1. a lead in **CRM → Leads → 📥 Lead Inbox**;
2. a **draft** job in the bid portal (bids.grayco-cs.com), which subs never see until you press **Publish to bid portal**;
3. an alert to the admins. Wesley, Nick and every admin on the staff list get an e-mail. A bid due within 3 days is e-mailed at once; the rest come in one e-mail an hour.

**What it never does.** Nothing signs in to BuildingConnected, PlanHub or the planrooms with your password. Those sites e-mail leads@ instead, which is allowed by their terms.

Do the steps in order. Where a screen in BuildingConnected, PlanHub or a planroom looks different from what is written here, look for "Notifications" or "Email settings" in your profile. Those sites change their menus often.

---

## 1. Supabase: the Lead Inbox's table (2 min)

1. Go to **supabase.com** and sign in. Open the **GrayCo CRM project**.
2. In the left bar, click **SQL Editor**, then **New query**.
3. Open `docs/lead-inbox.sql` from the repository. Copy **all** of it and paste it in.
4. Click **Run**. Every line of the result must say **OK**. The admins line should list `nthomas@…` and `wjohnson@…`.
   - If it says "none", open **Table Editor → gc_staff** and set **role** = `admin` for Wesley and Nick.
5. The last line says whether the bid portal's tables exist.
   - If it says **not yet**, run `docs/subportal-setup.sql` the same way once the bid-portal build has been deployed.
   - Until then, the drafts wait in a queue. They appear in the portal within the hour after its SQL has run.

## 2. Resend: receive e-mail at `in.grayco-cs.com` (15 min)

Google keeps your normal mail. Only the sub-address `in.grayco-cs.com` goes to Resend.

### 2a. The receiving domain and its MX record

1. Go to **resend.com** and sign in. In the left bar, click **Domains**, then **+ Add Domain**.
2. Type `in.grayco-cs.com`, pick the region **North Virginia (us-east-1)**, and click **Add**.
3. On the domain's page, find **Receiving** (or "Inbound"). Turn it **on**.
4. Resend shows an **MX** record. Copy its **Name** (for example `in`), its **Value** and its **Priority** exactly as shown.
5. Open the place where the `grayco-cs.com` DNS records are kept: Netlify → **Domains → grayco-cs.com → DNS settings**, or your registrar.
6. Click **Add new record**:
   - **Type:** MX
   - **Name / Host:** `in`
   - **Value / Mail server:** the value from Resend
   - **Priority:** the number from Resend
   - Click **Save**.
   - **Do not** change or delete the existing MX records for `grayco-cs.com` itself: those are Google's.
7. Add the other records Resend lists for the domain the same way (TXT / CNAME for sending).
8. Back in Resend, click **Verify DNS Records**. It can take a few minutes up to an hour. Wait until the domain shows **Verified**.

### 2b. The webhook and RESEND_INBOUND_SECRET

1. In Resend's left bar, click **Webhooks**, then **+ Add Endpoint**.
2. **Endpoint URL:** `https://crm.grayco-cs.com/.netlify/functions/bid-inbox`
3. **Events:** tick only **email.received**. Click **Add**.
4. Open the new webhook and click **Signing Secret → Reveal**. Copy it (it starts with `whsec_`).
5. In Resend's left bar, click **API Keys**. The key in Netlify's `RESEND_API_KEY` must be **Full access**, because it reads the received mail and sends the alert.
   - If it is "Sending access", click **+ Create API Key**, name it `GrayCo CRM`, choose **Full access**, click **Add** and copy the key.

### 2c. Netlify: the settings

1. Go to **app.netlify.com**, open the CRM site, then **Site configuration → Environment variables → Add a variable → Add a single variable**.
2. Add these, one at a time. For each, click **Create variable**.

| Key | Value |
|---|---|
| `RESEND_INBOUND_SECRET` | the `whsec_…` from 2b step 4 |
| `RESEND_API_KEY` | only if you made a new Full-access key in 2b step 5 (edit the existing variable) |
| `OWNER_EMAILS` | `wjohnson@grayco-cs.com,nthomas@grayco-cs.com` (if it is not there already). These two always get the alerts, together with every admin on gc_staff. |

3. Click **Deploys → Trigger deploy → Deploy site**. Wait for **Published**.
4. **Check:** open `https://crm.grayco-cs.com/.netlify/functions/bid-inbox?ping=1`. You should see `"signed":true`, `"resendApi":true`, `"ai":true`, `"database":true` and `"adminAlerts":true`.
   - `"bidPortal":true` appears once the bid portal's SQL has run.

## 3. Google: copy everything sent to bids@ (subs' bids) into the CRM (5 min)

**If bids@grayco-cs.com is a Google Group:**

1. Go to **admin.google.com** and open **Directory → Groups**. Click **bids@grayco-cs.com**.
2. Click **Members → Add members**.
3. Type `bids@in.grayco-cs.com`. Turn on **Add directly** (no invitation), then click **Add to group**.
4. Click **Group settings → Who can post**. Choose **Anyone on the web** (or **External**), then click **Save**.
   - Without this step, BuildingConnected's and PlanHub's e-mails bounce.
5. Keep your own people in the group too, so they still see the e-mails.

**If bids@ is a normal mailbox:**

1. Sign in to it in Gmail. Click **⚙ → See all settings → Forwarding and POP/IMAP → Add a forwarding address**.
2. Enter `bids@in.grayco-cs.com` and click **Next → Proceed**.
3. Google sends a confirmation code. It lands in the CRM: open **Leads → 📥 Lead Inbox → ⚙ → Messages from Google to bids@**.
4. Type the code in Gmail and click **Verify**.
5. Choose **Forward a copy … and keep Gmail's copy in the inbox**, then click **Save Changes**.

**Test:** from your own phone, e-mail **leads@grayco-cs.com** with the subject "ITB – test project, bids due next Friday". (A sub's bid test: e-mail **bids@** "Our bid for <a bid job's name>" with a PDF — the estimator gets "Sub bid received".)

- Within a minute or two, in **CRM → Leads**, press **↻ Check now**. The test shows as a lead with "Draft in the bid portal".
- Mark it **Not interested** afterwards.

To bring in a single bid invitation someone already got, **forward it to leads@grayco-cs.com**. Its plan PDFs come in too.

## 3b. leads@grayco-cs.com: website inquiries into the CRM (10 min)

Everything sent to **leads@grayco-cs.com** becomes a GrayCo lead with no PM. This covers the website's form notifications and people who write in. The admins get a 🌐 alert. Then the speed-to-lead reminders start:

- No PM after **4 hours** (and again at 24 hours): the admins get a reminder to assign it.
- Assigned, but nobody has reached out after **4 hours**: the PM gets a reminder.
- Still no contact after **24 hours**: the PM, Wesley and Nick get a reminder.
- Nothing is sent between 9 PM and 7 AM Central.
- To stop the reminders, press **✅ Contacted** on the lead, or move its stage to Contacted.

Set it up:

1. **admin.google.com → Directory → Groups → Create group.** Name it **Leads**, with the address **leads@grayco-cs.com**. Add Wesley and Nick (and the office, if they want copies).
2. **Members → Add members.** Type `leads@in.grayco-cs.com`, turn on **Add directly**, then click **Add to group**.
3. **Group settings → Who can post → Anyone on the web**, then click **Save**. Without this step, Squarespace's form e-mails and customers' e-mails bounce.
4. **Squarespace → Website → each form block → Edit → Storage → Email.** Set the notification address to **leads@grayco-cs.com**. Do the same for the Contact page form and any other form.
5. Nothing to add on Netlify. The default is `LEAD_INBOX_TO=leads@in.grayco-cs.com,leads@grayco-cs.com`. `SPEED_TO_LEAD_OFF=1` turns off the reminders.

**Test:** fill in the website's contact form with your own phone number. Within a minute or two, it shows in **CRM → Leads → 📥 Lead Inbox** with source "Website / leads@ e-mail", and Wesley and Nick get a "🌐 New website lead" e-mail. Replying to that e-mail goes to the customer.

The `in.grayco-cs.com` receiving domain (step 2) has to show **Verified** in Resend first. Until then, nothing sent to bids@ or leads@ reaches the CRM.

## 4. Point the bid boards and planrooms at leads@grayco-cs.com (10 min)

| Site | Exact steps |
|---|---|
| **BuildingConnected** | Sign in at app.buildingconnected.com. Click your name (top right) → **Settings → Notifications** (or **Email Preferences**). Turn on **Bid invitations**, **Addenda / file updates** and **Messages**, then save. **Then either:** (a) Profile → **Email** → set the notification e-mail to `leads@grayco-cs.com`, **or** (b) **Company → Team → Invite** `leads@grayco-cs.com` as an estimator, so invitations to the company reach it. |
| **PlanHub** | Sign in at app.planhub.com. Click your name → **Account Settings → Notifications**. Turn on **Project invitations** and **New projects** for your trades (Roofing, Drywall, General) and your area (Memphis metro, North MS, East AR). Set the e-mail to `leads@grayco-cs.com`, or add a **user** with that e-mail. Click **Save**. |
| **A&B Planroom** (aandbplanroom.com) | Sign in. Open **My Account / Profile → Notifications**. Turn on **new projects** and **addenda**, and set the e-mail to `leads@grayco-cs.com`. Save. **If there is no such setting:** call A&B and ask them to add `leads@grayco-cs.com` to their bid-notice distribution list. |
| **RKA Planroom** (rkaplanroom.com) | Same as A&B: profile → notifications → `leads@grayco-cs.com`, or ask them to add it to their distribution list. |
| **GCs you bid for** | Ask each estimator to add `leads@grayco-cs.com` to their invite list. (Their invitations then come through BuildingConnected or PlanHub to the same address.) |
| **Dodge / ConstructConnect** (only if you subscribe) | Point their project alerts at `leads@grayco-cs.com`. They come in as source "Other". |

## 5. Government vendor registrations (use leads@grayco-cs.com as the contact e-mail everywhere)

These public lists are **also read automatically**, weekdays at 7, 10, 1, 4 and 6 o'clock:

- Shelby County
- City of Memphis
- MSCS
- MSCAA
- DeSoto County
- TN STREAM
- TN CPO
- Arkansas OSP

Registering still matters. Many agencies only e-mail their packages, addenda and invitations to registered vendors.

| Agency | Where / what to pick |
|---|---|
| **Shelby County** | Purchasing, 160 N. Main St, 5th Fl, 901-222-2250 (or the county's vendor registration page). Keep the vendor number and BRN current. Pick the **NIGP codes for roofing and building repair / construction**. |
| **City of Memphis** | memphistn.gov → Business → **Become a Supplier**. Commodity codes for **construction / roofing / building maintenance**. Contact e-mail: bids@. |
| **Memphis-Shelby County Schools** | **mscsprocurementservices.ionwave.net → Supplier Registration** (free). Categories: construction, roofing, maintenance and repair. |
| **MLGW** | **Bid Notification System** (contracted services) and **iSupplier Portal** (materials). Purchasing: 901-528-4701. |
| **Memphis Airport (MSCAA)** | **OpenGov Procurement** (procurement.opengov.com) → create a free vendor account → **Follow** "Memphis-Shelby County Airport Authority". |
| **Southaven, Olive Branch, DeSoto County** | **centralbidding.com** → free vendor account → follow each agency, notifications to bids@. |
| **State of Tennessee** | **Edison** supplier registration (sso.edison.tn.gov) → UNSPSC codes for roofing and building repair. |
| **State of Arkansas** | **ARBuy** (arbuy.arkansas.gov) → free vendor registration → NIGP codes for roofing / construction. Help: ARBuySupport@arkansas.gov, 501-682-8888. |
| **State of Mississippi** | **MAGIC** supplier self-service → supplier registration → construction / roofing codes. |

## 6. Optional

- **Phone alerts.** This comes with the To-Do tab's notifications build (patch TD).
  1. Put `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Netlify the way TD's setup says, then redeploy.
  2. Each admin opens the CRM on their phone and taps **🔔 Turn on phone notifications**.
  3. New bid alerts then also buzz the phone.
- **BuildingConnected API.** This is only worth it with a **Bid Board Pro** subscription and API access granted by your Autodesk / BuildingConnected rep.
  1. Go to **aps.autodesk.com** and click **My Apps → Create application** (Traditional Web App).
     - Add the **BuildingConnected API**.
     - Callback URL: `https://crm.grayco-cs.com/`.
  2. Sign in once through Autodesk's 3-legged OAuth with scope `data:read` to get a **refresh token**.
  3. Put `BC_CLIENT_ID`, `BC_CLIENT_SECRET` and `BC_REFRESH_TOKEN` in Netlify.
  4. Run `docs/admin-data.sql` if you have not already (the rotating token is kept encrypted in `gc_admin_kv`).
  5. **Trigger deploy.**
  6. In the CRM, **📥 Lead Inbox → ⚙** now shows "BuildingConnected API ✅".
- **Fewer alert e-mails.** Netlify variable `BID_ALERT_SOON_HOURS` (default 72) sets what counts as "due soon". `BID_ALERTS_OFF=1` stops the e-mails.

## 7. Every day: what you do

1. An alert e-mail or the CRM toast says new bids came in. Open **CRM → Leads → 📥 Lead Inbox**.
2. For each one:
   - **Assign PM.** You pick; nothing is assigned automatically. Commercial and insurance are listed first.
   - **Not interested** (with a reason). It never comes back from any board.
   - **Publish to bid portal.** The draft goes live on bids.grayco-cs.com for approved subs. To change its title, scope or plans first, open it in the **Sub Portal** tab, where it waits as a draft.
3. For BuildingConnected / PlanHub plans, which stay behind their sign-in, do one of these:
   - **Forward the plans e-mail to bids@.** The files go to the lead, its bid-portal draft and its bid job.
   - **Download them there and drop them on the lead's card.** They go to the lead and its bid job. For the bid portal, attach them to the job in the Sub Portal tab.
