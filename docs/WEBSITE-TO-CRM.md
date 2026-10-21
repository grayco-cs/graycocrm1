# 🌐 Website → CRM (grayco-cs.com on Squarespace)  — patch WEB

> Owner, 10/21: website leads, inquiries, job applications and everything else land in the CRM as **GrayCo leads, unassigned**; the admin assigns them to a PM. Plus an **instant roof price from the address**.

## What happens to a form someone sends on grayco-cs.com

| They send | It becomes |
|---|---|
| Free estimate request · Storm / insurance damage · Commercial bid inquiry · Maintenance plan sign-up · Report a problem (existing customer) | A **lead** on **Leads → 📥 Lead Inbox** and the Lead Pipeline: source **Website (grayco-cs.com)**, owner **GrayCo** (commission source "grayco"), **no PM**. The card says which form it was. |
| Instant roof price | The same, plus the roof measurement (area, pitch, squares) and the price range shown to them (if any). |
| Job application | **the Hiring board (Admin → Hiring / Payroll → Hiring)**, stage **Applied**, with the résumé. Not a lead. |

For every one of them:

- **Wesley and Nick get an e-mail at once** (and a phone push, if push is set up): "🌐 New website lead: …" or "👷 New job application: …".
- **An admin assigns the PM** on the lead's card (**Assign PM**). Nothing is assigned automatically — not even commercial inquiries.
- **The thank-you e-mail to the customer waits on ✅ Approvals** (the owner's rule: nothing goes to a customer without approval). Approve it there and it goes out. To switch the thank-you off completely, set `WEBSITE_AUTO_REPLY=0` on Netlify.
- **Existing customers:** if the e-mail address or phone number matches a job, the lead says **⭐ Existing customer: <job>**, and the message is also posted as a note on that job.
- Job applications reach **Hiring** the next time an admin has the CRM open (Hiring is admin-only).

---

## A. Put the GrayCo form on a page (5 minutes)

You need the Squarespace **Business / Core plan or higher** — the cheapest plan (Personal / Basic) does not run code in Code blocks.

1. Log in to Squarespace and open the grayco-cs.com site.
2. Click **Pages**, then the page where the form goes (for example **Contact**, **Free Estimate** or **Careers**).
3. Click **Edit** (top left of the page preview).
4. Hover where the form should go and click the **+** (**Add block**). Choose **Code**.
5. Click the new Code block's **pencil** (Edit). Delete what is in the box, then **paste one of the snippets below**. Leave **Display Source** off.
6. Click outside the box (or **Apply**), then **Save** (top left).
7. Open the page on your phone and send a test. It shows on **Leads → 📥 Lead Inbox** in the CRM within a minute, and you get the e-mail.

**All forms** (the visitor picks: estimate, storm, commercial, maintenance, problem, careers):

```html
<div data-grayco-form="all"></div>
<script src="https://crm.grayco-cs.com/website-form.js" defer></script>
```

**One form only** — change the word in quotes to one of: `estimate` · `storm` · `commercial` · `maintenance` · `problem` · `careers`

```html
<div data-grayco-form="careers"></div>
<script src="https://crm.grayco-cs.com/website-form.js" defer></script>
```

**Instant roof price** (they enter name, phone, e-mail and address **before** they see a price):

```html
<div data-grayco-form="roof-price"></div>
<script src="https://crm.grayco-cs.com/website-form.js" defer></script>
```

Two forms on one page: paste both `<div …>` lines; the `<script …>` line is needed once per page (twice does no harm).

The same snippets are in the CRM: **Leads → 🌐 Website → Embed code** (admins).

## B. Set the roof prices (admins)

**Leads → 🌐 Website → Roof prices.** Three pitch tiers (low slope up to 4/12, standard 5–7/12, steep 8/12+), each a **price per square** from–to (a square is 100 sq ft of roof), plus the % waste added (default 10 %).

- Until **every** box has a price, the website shows **no price** — the visitor sees "we measured your roof (2,400 sq ft) — an estimator will call you with your price", and the lead says so.
- Example: 2,400 sq ft + 10 % = 26.4 squares × $450–$600 → the visitor sees **$11,900 – $15,800**.
- Measuring uses RoofScout's Google Solar key (`GOOGLE_SOLAR_API_KEY`) and counts against RoofScout's monthly limit (RoofScout Settings). If Google has no roof there, the lead still comes in, marked "measure it".
- The prices are kept in gc_kv `roofPriceRanges`; only admins can change them.

## C. Squarespace's own forms (if you keep using them)

A Squarespace **Form block** can also send its submissions on. Open the page → **Edit** → click the Form block → **Edit** → **Storage**. Pick one:

### Option 1 — e-mail them to leads@ or office@ (simplest, nothing automatic)

1. In **Storage**, click **Email** → enter **leads@grayco-cs.com** (or **office@grayco-cs.com**) → **Save**.
2. Squarespace sends a confirmation e-mail to that address the first time — open it and click **Confirm**.
3. Each submission is now an e-mail. **It does not reach the CRM by itself** — someone types it in as a lead. (leads@ must exist: make it an alias of office@ in Google Workspace → Admin → Users → office@ → Add alternate e-mail.)

### Option 2 — Zapier → the CRM (automatic, same as the GrayCo form)

One-time on Netlify: **Site settings → Environment variables → Add** `WEBSITE_ZAPIER_KEY` = a long random password you make up (30+ letters and numbers). Keep it only in Netlify and Zapier — never on a web page. Redeploy.

1. In the Form block's **Storage**, click **Zapier** → **Connect** → log in to Zapier and allow Squarespace.
2. In Zapier, **Create Zap**:
   - **Trigger:** app **Squarespace** → event **New Form Submission** → pick the site and the form → **Test trigger** (send a test from the website first).
   - **Action:** app **Webhooks by Zapier** → event **POST**.
     - **URL:** `https://crm.grayco-cs.com/.netlify/functions/website-intake`
     - **Payload Type:** `json`
     - **Data** (left: the name we expect, right: pick the Squarespace field):
       `name` → Name · `email` → Email · `phone` → Phone · `address` → Address · `city` → City · `zip` → Zip · `message` → Message
       and `type` → type a fixed word: `estimate`, `storm`, `commercial`, `maintenance`, `problem` or `careers`.
     - **Headers:** `x-api-key` → the same value as `WEBSITE_ZAPIER_KEY`.
   - **Test action** → the lead appears on Leads → 📥 Lead Inbox. **Publish** the Zap.
3. One Zap per form (each with its own `type`). Field names are forgiving: "Email Address", "First Name"/"Last Name", "Phone Number", "Comments" also work.

(Résumé uploads through Zapier are not carried over — use the GrayCo careers form for applications.)

## D. Optional: Cloudflare Turnstile ("I am human" check)

Spam is already stopped by a hidden trap field, a time check (a form sent less than 3 seconds after the page opened is refused), a per-connection limit (5 forms per 10 minutes; 3 roof prices per hour and 4 per day), and a link/spam-word check. If spam still gets through:

1. dash.cloudflare.com → **Turnstile** → **Add widget** → name "grayco-cs.com", domains `grayco-cs.com` and `www.grayco-cs.com`, mode **Managed** → **Create**.
2. Copy the **Site key** and the **Secret key** into Netlify environment variables `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` → redeploy. The form shows the check by itself from then on.

## E. Check it works

Open `https://crm.grayco-cs.com/.netlify/functions/website-intake?ping=1` — `database`, `roofMeasure` should be `true`; `priced` is `true` once roof prices are set; `turnstile` / `zapier` are `true` only if you set them up.

---

## For whoever maintains it

| File | What |
|---|---|
| `website-form.js` (site root) | The embeddable form and roof widget (shadow DOM, so the site's CSS cannot break it). No keys inside. |
| `netlify/functions/website-intake.js` | Public: `GET ?form=1` (signed token, Turnstile site key), `POST` (a form), `POST ?act=roofprice`, `GET ?ping=1`. CRM sign-in: `GET ?settings=1` (staff), `POST ?settings=1` (admins: roofPriceRanges), `GET ?list=1` / `?file=<id>` / `POST ?act=imported` (admins: applications → Hiring). CORS: grayco-cs.com, www, the CRM, `WEBSITE_ORIGINS`, and `*.squarespace.com` (editor preview; `WEBSITE_SQSP_PREVIEW=0` turns it off). |
| `netlify/functions/bid-inbox.js` | Leads are Lead Inbox items (`gc_lead_inbox`, origin `website`, `leadExtra` copied onto the CRM lead by patch LD2). A website item is matched only by its own id (same person + same form + same day = one lead). No bid-portal draft, no default estimator. |
| `netlify/functions/_lib/bid-alerts.js` | The admins' "🌐 New website lead" e-mail (patch LA's new-lead alert); website leads are not bids (no "Missing due info"). |
| `netlify/functions/solar-lookup.js` | `_measure(lat, lng)`: the same Google Solar lookup and monthly limit as RoofScout. |
| `index.html` (`tail_WEB.js`, `<script id="gc-patch-web">`) | The 🌐 card line, the existing-customer note on the job, applications → Hiring, the 🌐 Website strip (embed code, roof prices). |

Applications and the rate-limit counters are kept in `gc_lead_inbox_kv` (service key only); before `docs/lead-inbox.sql` has run, in gc_kv as `users__website_apps` / `users__website_rl`, which SEC2 makes admin-only.

Env: nothing new is required (SUPABASE_*, RESEND_API_KEY, GOOGLE_SOLAR_API_KEY are already set). Optional: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `WEBSITE_ZAPIER_KEY`, `WEBSITE_AUTO_REPLY=0`, `WEBSITE_ORIGINS`, `WEBSITE_FORM_SECRET`, `WEBSITE_MIN_SECONDS`, `WEBSITE_RATE`, `WEBSITE_ROOF_RATE`, `LEAD_INTAKE_ALERTS=0`.
