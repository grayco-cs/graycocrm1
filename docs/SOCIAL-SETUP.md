# Let the CRM post for GrayCo: Facebook, Instagram and Google

This guide is for Wesley (or whoever helps him), and it assumes no technical background. It takes about **30–45 minutes** once. Google's part needs an approval from Google that can take **several days**, so start that step first.

After setup, here is how it works:

1. The CRM writes the posts. **Autopilot** does it every week, or you make one in **Marketing → Social posts**.
2. Each post lands in **Approvals**: the green 📋 APPROVE button, or To-Do.
3. You tap **✅ Approve**.
4. The CRM posts it at the right time (Tue / Thu / Sat 11 AM Central by default).
5. The post's link and its likes / reach show up in **Marketing → Autopilot → Marketing this month**.

Until a network is connected, nothing breaks. An approved post waits with a **📋 Copy + open Facebook** button: one tap copies the caption, downloads the picture and opens Facebook (or Google Business). Then you paste it and post it yourself.

> **Where the keys go:** only in **Netlify → Site configuration → Environment variables**. Never put a key in an e-mail, a text, a document, the CRM or a chat. After you add or change a variable, click **Deploys → Trigger deploy → Deploy site** so the CRM picks it up.

---

## Before you start (the checklist in Marketing → Getting started)

1. **Google Business Profile is claimed and verified.** Go to <https://business.google.com>, find *GrayCo Construction Services*, then claim and verify it (postcard, phone or video).
2. **The Facebook Page exists, and it is a Page, not a personal profile.** You must be an admin of it. Check at <https://www.facebook.com/pages/?category=your_pages>.
3. **Instagram is a Business account, linked to the Page:**
   - In the Instagram app, go to **Settings → Account type and tools → Switch to professional account → Business**.
   - Then, on the Facebook Page, go to **Settings → Linked accounts → Instagram → Connect**.
4. **Connect them** using either Option A or Option B below.
5. **Add the Google review link** in Marketing → Google → Review link.
6. **Turn on Autopilot** in Marketing → Autopilot.

---

## Option A (easiest): one key for everything, with Ayrshare

Ayrshare is a paid service. Check its current price before you sign up. It connects Facebook, Instagram, Google Business (and LinkedIn / TikTok if you want them later) with one key.

1. Sign up at <https://www.ayrshare.com>.
2. In Ayrshare, open **Social Accounts** and link Facebook (pick the GrayCo Page), Instagram and Google Business Profile.
3. Copy your **API Key** (Ayrshare dashboard → API Key).
4. In Netlify, add the variable `AYRSHARE_API_KEY` and paste the key as its value.
5. Redeploy. **Marketing → Social posts** now shows every network as *connected (via Ayrshare)*.

When `AYRSHARE_API_KEY` is set, the CRM uses Ayrshare for every network and ignores the keys in Option B.

---

## Option B (free): connect each network yourself

### B1. Facebook Page + Instagram: your own Meta app

You only make this app for GrayCo's own Page. While it stays in **development mode** with you as its admin, it can post to your own Page and Instagram without Meta's "App Review".

1. Go to <https://developers.facebook.com>, log in with the Facebook account that is an admin of the GrayCo Page, and click **Get started** to register as a developer (free).
2. Click **My Apps → Create app** and make these choices:
   - **Use case:** *Other*.
   - **App type:** *Business*.
   - **Name:** *GrayCo CRM Poster*.
   - **Contact e-mail:** yours.
3. In the app, open **App roles → Roles** and check that you are listed as **Administrator**.
4. Open the **Graph API Explorer** at <https://developers.facebook.com/tools/explorer/>.
5. Make a token:
   - At the top right, pick your app.
   - Under **User or Page**, pick **Get User Access Token**.
   - Tick these permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`, `instagram_basic`, `instagram_content_publish`, `business_management`.
   - Click **Generate Access Token** and allow everything for the GrayCo Page and Instagram.
6. Make that token long-lived:
   - Open the **Access Token Debugger** at <https://developers.facebook.com/tools/debug/accesstoken/>.
   - Paste the token, click **Debug**, then **Extend Access Token**.
   - Copy the new long-lived token.
7. Get the **Page token**, which is the one the CRM needs:
   - Back in the Graph API Explorer, paste the long-lived token in the token box.
   - In the request box, type `me/accounts` and click **Submit**.
   - Find the GrayCo Page in the answer and copy two values:
     - `id`: this is your **`META_PAGE_ID`**.
     - `access_token`: this is your **`META_PAGE_TOKEN`**. A Page token made from a long-lived user token does not expire.
8. Get the **Instagram id**:
   - In the request box, type `<META_PAGE_ID>?fields=instagram_business_account`.
   - Copy the `id` inside `instagram_business_account`. This is your **`META_IG_USER_ID`**.
9. In Netlify, add these three variables:

   | Variable | Value |
   |---|---|
   | `META_PAGE_ID` | the Page id from step 7 |
   | `META_PAGE_TOKEN` | the Page access token from step 7 |
   | `META_IG_USER_ID` | the Instagram id from step 8 |

10. Redeploy. **Marketing → Social posts** shows 📘 Facebook and 📸 Instagram as *connected*.

If Facebook ever says the token is invalid (for example, you changed your Facebook password), repeat steps 5–7 and replace `META_PAGE_TOKEN`.

### B2. Google Business Profile posts (and reviews)

**Google must approve API access first.** This takes days, so start here.

1. Make sure a Google Cloud project exists:
   - The CRM's Google sign-in (Calendar) already uses one. It holds the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` that are on Netlify.
   - Open it at <https://console.cloud.google.com>.
2. Request API access:
   - Go to <https://developers.google.com/my-business/content/prereqs> and fill in the **GBP API access request form** with that project's number and your business e-mail.
   - Wait for Google's e-mail. It often takes several days.
3. After approval, in Cloud Console → **APIs & Services → Library**, enable:
   - *Google My Business API*
   - *My Business Account Management API*
   - *My Business Business Information API*
4. In **APIs & Services → Credentials**, open the existing OAuth client (the one whose id is `GOOGLE_CLIENT_ID`) and add this **Authorized redirect URI**: `https://developers.google.com/oauthplayground`
5. Get a refresh token:
   1. Open the **OAuth Playground** at <https://developers.google.com/oauthplayground>.
   2. Click the ⚙ (top right), tick **Use your own OAuth credentials**, and paste the client id and secret.
   3. In *Step 1*, type the scope `https://www.googleapis.com/auth/business.manage`, then click **Authorize APIs** and sign in with the Google account that owns the Business Profile.
   4. In *Step 2*, click **Exchange authorization code for tokens** and copy the **Refresh token**. This is your **`GBP_REFRESH_TOKEN`**.
6. Find the account and location ids, still in the Playground:
   1. In *Step 3*, run GET `https://mybusinessaccountmanagement.googleapis.com/v1/accounts`. The answer has `"name": "accounts/1234567890"`. The number is your **`GBP_ACCOUNT_ID`**.
   2. Run GET `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/<GBP_ACCOUNT_ID>/locations?readMask=name,title`. The answer has `"name": "locations/9876543210"` for *GrayCo Construction Services*. The number is your **`GBP_LOCATION_ID`**.
7. In Netlify, add these three variables. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are already there.

   | Variable | Value |
   |---|---|
   | `GBP_ACCOUNT_ID` | the account number from step 6 |
   | `GBP_LOCATION_ID` | the location number from step 6 |
   | `GBP_REFRESH_TOKEN` | the refresh token from step 5 |

8. Redeploy. The 📍 Google Business light turns green.
9. New Google reviews now come into **Marketing → Reviews & referrals** every 15 minutes, each with a reply draft:
   - The **office approves** the reply, and it is posted on Google.
   - A 5-star review also gets a thank-you post draft.

---

## Google Local Services Ads (LSA) leads straight into the CRM

1. In Netlify, add `LEAD_KEY_GOOGLE_LSA` and set it to a long random password (40+ letters and numbers — e.g. from your password manager).
2. In Zapier, make a zap:
   - **Trigger:** *Google Local Services Ads → New Lead*.
   - **Action:** *Webhooks by Zapier → POST*.
   - **URL:** `https://crm.grayco-cs.com/.netlify/functions/lead-intake`
   - **Header:** `x-api-key` set to the same password.
   - **Data:** name, phone, email, zip, job type.
3. Leads arrive in **Leads** with the source *Google Lsa* and count as Google Ads on the Marketing dashboard. The usual new-lead first contact (with approval) and the new-lead alert apply.
4. Without Zapier, export the LSA leads as CSV and import them in **Marketing → Google → LSA**.

---

## E-mail results (opens / clicks), optional

News e-mails go from `news@grayco-cs.com` through Resend. To see opens and clicks on the dashboard later:

1. In Resend, open **Domains → grayco-cs.com** and turn on **Open tracking** and **Click tracking**.
2. Add a webhook. This is a small follow-up build.

Leads from the e-mails' buttons already count today, because every button carries a UTM tag.

---

## What the CRM will and will not do

- **It never posts or e-mails without an admin's approval.** After 24 hours, the office may approve too (the owner's approvals rule).
- **It never shows a customer's address, and never names an insurance company.**
  - The guard checks every caption when it is sent for approval, and again right before it posts.
  - House numbers, the job's street and carrier names are refused.
- **Unsubscribed customers never get news@ e-mail.** If the unsubscribe list cannot be read, nothing is sent at all.
- **Keys stay on Netlify.** The CRM only ever shows *connected / not connected*.

## Troubleshooting

| What you see | What to do |
|---|---|
| “Facebook: Invalid OAuth access token” | Make a new Page token (B1 steps 5–7) and replace `META_PAGE_TOKEN`. |
| “Instagram needs a picture” | Instagram posts must have a photo. Pick a job photo, or untick Instagram. |
| “Google Business: … PERMISSION_DENIED” | API access is not approved yet (B2 step 2), or the refresh token belongs to a Google account that does not own the profile. |
| A post stays “Approved — scheduled” | Its time has not come yet (see the 🗓 calendar). An admin can tap **🚀 Post now**. |
| Nothing is connected yet | Use **📋 Copy + open Facebook / Google Business** on the approved post. |

## Part C — TikTok, LinkedIn, BrightLocal, the week plan, approval stages (patch SOC)

Everything below is **dormant until its keys are on Netlify**. Until then each approved post becomes a
**📲 Ready-to-post pack** (caption + picture + Open app) on the To-Do. Tokens from the sign-ins are kept only on
the server (service-only store `gc_social_tokens`); the CRM page only ever sees "connected yes / no".

| Platform | What to do | Netlify variables |
|---|---|---|
| TikTok | developers.tiktok.com → app with **Login Kit** + **Content Posting API** (Direct Post). Redirect URI `https://crm.grayco-cs.com/.netlify/functions/soc?callback=1`. Verify the domain `crm.grayco-cs.com` (TikTok pulls pictures from the CRM's signed links). **Submit the app for review** — until TikTok approves it, posts can only be private. Then Marketing → 🔌 Connections → Connect TikTok. | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (optional `TIKTOK_PRIVACY`) |
| LinkedIn | linkedin.com/developers → app linked to the GrayCo company page; products Sign In with LinkedIn (OpenID), Share on LinkedIn, **Community Management API** (LinkedIn **reviews** this one — posting as the company page needs it). Redirect URL as above. Then Connect LinkedIn (the sign-in lasts 60 days). | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (optional `LINKEDIN_ORG_ID`) |
| Facebook / Instagram / Google Business | Part A / B above (Meta and Google also review the posting permissions). | as above |
| BrightLocal (optional) | Citation Tracker report for GrayCo → 📍 Listings → Check with BrightLocal. | `BRIGHTLOCAL_API_KEY`, `BRIGHTLOCAL_API_SECRET`, `BRIGHTLOCAL_REPORT_ID` |
| AI versions (optional) | Without it, templates write the five versions. | `ANTHROPIC_API_KEY` (optional `SOC_AI_MODEL`) |

* **🗓 Week plan** — Marketing → 🗓 Week plan → turn the 3-a-week plan on. Every Sunday the CRM proposes Mon / Wed / Fri
  posts (restoration first: Marketing focus), each written for Facebook, Instagram, TikTok, LinkedIn and Google Business.
  The week is ONE approval; edit, swap or pause any post.
* **⚙️ Focus & approvals** — the Marketing focus (organic, default 60 / 20 / 12 / 8), the Ads focus (paid ads, default
  restoration 100%) and the approval stage (1 admin checks everything → 2 office approves → 3 autopilot with a 24-hour
  veto). The CRM suggests the next stage after 2 weeks without admin edits; a person moves it, and every move is logged.
* **🚨 Restoration ads** — Google Ads drafts (water / fire / storm × 7 cities), keywords, negatives, LSA job types, boosts.
  The CRM never spends money: an approved draft is a Google Ads Editor file + a To-Do.
