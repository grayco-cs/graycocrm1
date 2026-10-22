# Marketing, part 2 (patch MKT2)

Everything lives in the CRM's **📣 Marketing** tab. Anything that goes to customers, partners or the public first waits on **✅ Approvals**.

## The new sections

| Section | What it does |
|---|---|
| 📈 Ads hub | Google Ads + Facebook / Instagram. Shows spend, clicks, CRM leads, cost per lead, jobs won and cost per job for each campaign, with suggestions. Pause, resume and budget changes go through approval (kind `mkt_ad`). The AI ad-copy writer stays inside each platform's limits. |
| 📚 Ad library & posting plan | 50+ ready ads: customer referrals (credits stack, refer again and again), partners, roofing, storm, water, remodel, maintenance, giveaway, coupons, seasonal, realtor pre-listing, Marketplace and group posts, and the Nextdoor ask. Each ad carries a tracked link. There is a weekly posting checklist, and a card that says what posts itself and what is posted by hand. |
| 🔗 Tracked links, QR & numbers | Links at `crm.grayco-cs.com/go/<code>` with QR codes (PNG or vector SVG); clicks are counted. Twilio tracking numbers forward to the office, and every call is logged. |
| 🗞 Neighborhood flyers | PMs, or **🗞 Flyer** on the job's 🧰 Job tools bar. Prints letter, half-page or door-hanger size. Shows the street but never the house number or the customer's name. Photos appear only with the customer's OK. Includes a tracked QR and a delivery-list CSV. |
| 🤝 Referral partners | Realtors, insurance agents and property managers. Each partner gets a code and a magic-link page (`partner.html`). Fees go through approval (`mkt_payout`). Also holds the lunch & learn kit: RSVP page, invite text and flyer, sign-in sheet, and enrollment from the sheet. |
| 🏠 Free roof check events | Date, area and time slots, plus a public sign-up page at `roofcheck.html?e=<id>`. Each sign-up becomes a lead for the event's PM. Includes a flyer, a Facebook radius-ad draft, and the day-before reminders (approval `mkt_event`). |
| 🎟 Coupons & sponsorships | $100 off work over $1,000 via `coupon.html?s=<source>`. One coupon per household, and each can be redeemed once (checked by the server). Shows ROI per sponsorship and gives vector artwork for a truck decal, shirt chest, shirt back and banner. |
| 🎁 Monthly giveaway | Default prize is "a FREE handyman hour". Entries come from the website, the portal and Facebook. The draw is logged: who ran it, when, the seed and the count. The winner e-mail needs approval (`mkt_giveaway`). The section also has a Lead Ads form template and a note on Meta's promotion rules. |
| 📰 Newsletter & charity | This month's newsletter is drafted on the 1st, and you can edit all of it. Charity tie-ins are set up as "Every [job type] in [month] = $[AMOUNT] to [cause]", with a running total. |
| 📆 Yearly calendar | One theme per month, including Trunk or Treat (Sun 10/25, 5:30 PM). Each month can draft an e-mail, a post or ad copy in one tap. |
| 🌐 Website, pixels & guides | Pixel IDs, the city-page text (edit, preview, then approval `mkt_page`), the free guides, and Google Business drafts. |
| 🎬 Reel kit | A before/after video made in the browser. Needs the customer's OK. |
| 🎤 Presentations | BNI 60-second and 10-minute talks, lunch & learns, and new-hire training. Present from the browser or save as PDF; every deck is editable. |
| 🧭 Marketing coach | A weekly checklist with streaks, plus one-time setup steps: LSA steps and document checklist, Nextdoor and Faves, NAP consistency, Yelp, BBB and Angi. Also the Video FAQ series and the review blitz (batches of 50, approval, never anyone with a bad rating). |
| 🏢 HOA & property managers | A target list (CSV import), a 3-step intro e-mail sequence sent from your own address after approval (`mkt_outreach`), the community maintenance pitch, and a status for each target. |

## Server

- `netlify/functions/_lib/mkt2.js` holds the logic. Around it:
  - `mkt2.js`: staff calls, plus the return address for the ad-platform sign-ins.
  - `mkt-public.js`: the public pages.
  - `go.js`: tracked links.
  - `track-call.js`: Twilio tracking numbers.
  - `mkt2-scheduled.js` runs hourly:
    - the daily ad pull;
    - the monthly newsletter draft;
    - December and milestone thank-you to-dos;
    - event reminders.
- Tokens, clicks, calls, coupons, entries, sign-ups and newsletter sign-ups are kept only in the service-only store (`gc_lead_inbox_kv`). They are never synced to browsers.

## Setup for the owner

### Google Ads

1. Google Ads → Tools → **API Center**: apply for a developer token. Basic access is needed for the CRM to make approved changes. A test token can only read test accounts.
2. Google Cloud console → enable **Google Ads API** → Credentials → **OAuth client (Web)**. Add this authorized redirect URI: `https://crm.grayco-cs.com/.netlify/functions/mkt2?callback=1`
3. Netlify:
   - `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET`.
   - `GOOGLE_ADS_LOGIN_CUSTOMER_ID` if you use a manager (MCC) account. Optional: `GOOGLE_ADS_CUSTOMER_ID` and `GOOGLE_ADS_API_VERSION`.
   - Redeploy.
4. CRM → Marketing → 📈 Ads hub → **Connect Google Ads**.
5. In each campaign, set the final URL suffix to `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}` and keep auto-tagging on.

### Facebook / Instagram (Meta)

1. developers.facebook.com → create an app (Business type) and add the **Marketing API**. Under Facebook Login, add the redirect URI `https://crm.grayco-cs.com/.netlify/functions/mkt2?callback=1`
2. Netlify: either
   - `META_APP_ID` + `META_APP_SECRET` (optional `META_AD_ACCOUNT_ID`) — a login token lasts about 60 days, so reconnect when the CRM says so; or
   - `META_SYSTEM_TOKEN`, a Business system-user token with `ads_read` + `ads_management` that does not expire.

   Then redeploy.
3. Ads hub → **Connect Facebook / Instagram**.
4. Ad URL parameters: `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}`. Home-improvement ads may need Meta's **Housing** special ad category, which means a 15-mile minimum radius and no age, gender or ZIP targeting.

### Google Business Profile

- Posting goes through the existing `social.js`. Set `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`, `GBP_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. API access must be requested from Google (Business Profile APIs).
- Until then, approved Google Business drafts are copied and opened by hand.

### Website pixels

- CRM → Marketing → 🌐 Website, pixels & guides. Enter:
  - the Google tag (`G-…`);
  - the Google Ads conversion (`AW-…/label`; create a "Submit lead form" conversion in Google Ads);
  - the Meta pixel ID (Events Manager).
- The website loads them only after a visitor accepts the cookie notice. A sent form fires a lead event, never with personal data.

### Tracking phone numbers (optional)

1. Buy a Twilio number per source.
2. Set "A call comes in" to Webhook (POST) `https://crm.grayco-cs.com/.netlify/functions/track-call`.
3. Netlify needs `TWILIO_AUTH_TOKEN`. Optionally set `TRACK_FORWARD_TO`; the default is (901) 585-0944.
4. Add each number in Marketing → 🔗.

### Google Local Services Ads

Follow the coach's LSA steps and document checklist. In LSA → Settings → Notifications, send lead e-mails to **leads@grayco-cs.com**. The CRM files each one as a lead with source "Google LSA".

## Rules kept

- Customer-facing sends wait for approval.
- No carrier names.
- No house numbers or customer names in public pieces.
- Photos only with the customer's OK.
- No made-up numbers or reviews: placeholders stay where there is no data.
- Customer referral credits are repeatable and stack.
- Giveaway entry never requires a like, share, tag or follow.
- Warranty: 5 years on roofing and insurance work, 1 year on other work.
- Address: 4014 Broadway Rd, Bartlett, TN 38135.
