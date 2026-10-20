# The GrayCo Subcontractor Portal (owner's guide)

Subcontractors get their own portal at **https://portal.grayco-cs.com**. Inside the CRM, the same portal is the **🔨 Sub Portal** tab (right under RoofScout), already signed in.

## What a subcontractor can do

- **Request access** with their company details (contact, address, trades, service area, license numbers, last 4 of the EIN). The office gets an e-mail for every new sign-up.
- **Wait for approval.** Until GrayCo approves them, they see only **My Documents**, so they can upload their W-9 and insurance certificates. Subs who sign up from a **job invite link** are approved right away.
- **My Documents:** upload the W-9, general liability COI, workers' comp, auto insurance, licenses and other papers (PDF or photo, 50 MB each at most), with expiration dates. They can also edit their company profile. They can't change the e-mail they sign in with; the office does that.
- **Open Jobs:** see the jobs posted as public, private jobs they were invited to, and every job they have bid on. They can download plans, measure on the plans (takeoff), and message the PM.
- **Bid:** enter an amount, the scope and notes, and attach files. The portal blocks a bid until the W-9, GL and WC are on file and not expired. The PM, the estimator and the office get an e-mail for every new bid. Once GrayCo accepts or rejects a bid, the sub can't change it anymore.
- **My Bids:** each bid's status (pending, accepted, rejected). If a job has results sharing turned on, they also see their place, and for "full" the amounts, never the names.
- **My Work & Pay**, straight from the CRM's books, read-only:
  - jobs they are on (the job's subcontractor list in the CRM), scopes of work sent to them, and subcontract agreements;
  - every invoice GrayCo has from them and where it stands: **Received — waiting for approval**, **Approved — scheduled to pay** (with the pay date), or **Paid** (date and check number);
  - totals: waiting for approval, approved but not yet paid, paid this year, paid all time;
  - **1099 information:** paid total by year, whether a 1099-NEC applies ($600 or more), whether a W-9 is on file, and the last 4 of the tax ID;
  - **insurance on file in the CRM:** GL and WC expiration and carrier, W-9, subcontract agreement, lien waiver, and whether "everything GrayCo needs to pay you is on file" (the same check the CRM runs before it pays).
- English or Spanish, on a phone or a computer. "Forgot password?" sends a reset e-mail.

## What a subcontractor can NEVER see

Other subcontractors (their names, bids, papers, messages, pay), estimates and margins, GrayCo's activity log, admin links, any CRM job they are not on, and any CRM money that isn't theirs. The server function checks every read and every save. Hiding things on the screen is not the security.

## What GrayCo staff do (in the 🔨 Sub Portal tab)

Everyone on the CRM staff list (💎 → Team access) is an admin in the portal, with the same e-mail and password as the CRM.

- **Add Job:** post a bid job with plans, scope documents, trade scopes, PM, estimator and PO. Set it as public or private, and choose bid-results sharing. **Read plans with AI** fills in the title, address, scope, specs and notes from the first PDF.
- **Invite** subs to a job by e-mail. The invite link signs them up already approved.
- **Pending Subs:** approve or deny. Approving e-mails the sub. Denying removes their account.
- **Approved Subs:**
  - **CRM record:** pick the sub's record from the CRM's subcontractor list. This is what connects **My Work & Pay**; until it is picked, the sub sees "not connected yet" there. When the portal finds a likely match (same e-mail or company name), it shows **Likely match … Link it**. It never links by itself, because sign-up e-mails are not verified and a look-alike company must not see someone else's pay.
  - **Work & pay:** see exactly what that sub sees.
  - **View documents:** their uploaded papers, with expiration status.
  - **Revoke:** takes their access away.
- **All Bids**, **Estimating**, **Plan Archive**, **Admin Links**, and **Team** (phone and title shown to subs on each job).
- **View as Sub** previews the portal as one of your approved subs.
- New bids, messages and jobs from other people appear within a minute without reloading.

The CRM's books stay the only record of pay and insurance. The portal only reads them. To change what a sub sees under My Work & Pay, change it in the CRM (invoice status, the job's sub list, the sub record's insurance dates).

## One-time setup

### 1. Supabase: run the setup script

`docs/security-prepare.sql` must already have been run. It has been, if the CRM's company sign-in screen is live.

1. Supabase → **SQL Editor → New query**.
2. Paste all of `docs/subportal-setup.sql` and click **Run**.
3. The grid at the bottom must say **OK** on every line, including **"a signed-in subcontractor reading CRM records (gc_kv)"**. If that line says PROBLEM, run `docs/security-lockdown.sql` first (see `docs/SECURITY-SETUP.md`), then run this script again.

The script can be run again at any time. It does not touch any CRM table. It creates the table `sp_rows` and the private file bucket `subportal-files`. It adds no rules at all, so only the portal's server function can use them, and running the CRM lockdown again leaves the portal working.

### 2. Supabase: let password-reset e-mails come back to the portal

Supabase → **Authentication → URL Configuration → Redirect URLs**: add

- `https://portal.grayco-cs.com/`
- `https://crm.grayco-cs.com/subportal/`

### 3. The address portal.grayco-cs.com

1. **Netlify:** site **graycocrm1** → **Domain management** → **Add a domain** → `portal.grayco-cs.com`.
2. **DNS** (only if grayco-cs.com's DNS is *not* managed by Netlify): at the company that manages grayco-cs.com's DNS, add:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `portal` | `graycocrm1.netlify.app` |

3. Wait for the certificate (the lock icon) for `portal.grayco-cs.com`, usually within an hour.

A rule in `netlify.toml` makes that address show only the sub portal. The customer page (`portal.html`) also still opens at that address.

### 4. Netlify environment variables

These are already set and are used as they are: `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY` (e-mail, from portal@grayco-cs.com), `ANTHROPIC_API_KEY` (AI plan reading).

Optional:
- `SUBPORTAL_NOTIFY`: who gets the "new subcontractor sign-up" e-mail and the copy of every new bid and sub message. The default is office@grayco-cs.com.
- `SUBPORTAL_AI_MODEL`: the Claude model for plan reading. The default is `claude-opus-5-5`.
- `PORTAL_MAIL_OFF = 1`: stops all portal e-mails (customer portal and sub portal).

After changing a variable: **Deploys → Trigger deploy**.

## Test it once (10 minutes)

1. Open https://portal.grayco-cs.com in a private window → **Request Access** with a test company and your own spare e-mail. You should land on **My Documents** with the "waiting for approval" note, and office@ gets the sign-up e-mail.
2. Upload a W-9, a GL and a WC certificate with expiration dates.
3. In the CRM → **🔨 Sub Portal** → **Pending Subs** → **Approve**. The test e-mail gets "You are approved".
4. **Add Job** (public) → in the private window, reload: the job shows → bid on it. The PM gets the new-bid e-mail.
5. **Approved Subs** → pick the test sub's **CRM record** (any sub that has invoices) → **Work & pay** shows that sub's jobs and invoices.
6. Deny or revoke the test company when you're done.

## Everyday

- **Someone leaves GrayCo:** remove them in the CRM (💎 → Team access). They lose portal admin access at once.
- **A sub changes e-mail:** for now, deny the old account and have them request access again with the new e-mail (their old bids stay on the jobs).
- **Backups:** `sp_rows` is in the CRM's nightly backup. Files in `subportal-files` are kept in Supabase Storage.

## For whoever changes the portal's code

The portal's source is in `subportal-app/` (React). Netlify serves the built files in `subportal/` as they are, and the CRM site has no build step. After changing anything in `subportal-app/src/`:

```bash
cd subportal-app
npm install
npm run build      # writes ../subportal/
```

Commit both folders. The server side is `netlify/functions/subportal.js`.

## Undo

- Take the address off: Netlify → Domain management → remove `portal.grayco-cs.com`.
- Remove the data: the UNDO line at the bottom of `docs/subportal-setup.sql` (empty the `subportal-files` bucket in Supabase → Storage first).
