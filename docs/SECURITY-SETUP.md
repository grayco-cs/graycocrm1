# GrayCo CRM — locking it down (owner's guide)

**Goal:** someone who has the public web page, the public "anon" key, or the old
shared password gets **nothing**: no data read, no data changed, no AI, no e-mail.

## What changes

| Before | After |
|---|---|
| The page opened for anyone. The login was checked inside the page itself, and everyone shared one password. | A **company sign-in screen** comes first. Each person signs in with their own work email and password. Supabase checks it, not the page. |
| The database answered anyone holding the public key, which is inside the page. | After step 6, the database answers **only signed-in people on the staff list** (`gc_staff`). |
| The AI, e-mail, QuickBooks and Brain functions answered anyone. | They answer only signed-in staff. Without a sign-in they return 401, and for an account not on the list they return 403. |
| An admin password sat in plain text inside the page. | It is gone. Admin tools now check whether the person signed in is an admin. |
| The calendar feed link showed the schedule to anyone who guessed `?who=`. | Each person gets a private, signed link. |
| No history in the cloud. | A **nightly backup** goes into a private table that nobody can read or erase from the web. The last 30 nights are kept. |

Other behaviour:
* **The old shared password ("grayco2025") is gone.** The CRM no longer puts it back on users, and new employees no longer get it as a default. The old CRM login screen only opens the CRM for the email you used at the company sign-in. Sign-ins for new people come from 💎 → Team access.
* **One sign-in.** Once you sign in, the CRM opens as the CRM user with the same email. The old CRM login screen only appears for an email the CRM does not know.
* **Idle for 8 hours, you are signed out.** This never happens while there are typed words that have not been saved. Nothing is lost either way, because the CRM stays underneath the sign-in screen.
* **Internet down:** a computer that has signed in before opens from its own copy and shows "Offline". A computer that has never signed in cannot get in.
* **💎 menu:** this now has *Team access* (admins only), *Change my password*, and *Sign out of GrayCo*.

---

## Steps, in this order

Follow them in this order and nothing stops working at any point. The new build works both before and after the database lock in step 6.

### 1. Netlify: add three settings
Netlify → your site (**graycocrm1**) → **Site configuration → Environment variables → Add a variable → Add a single variable**. Add each of these, with scopes left at "All" and the same value for every deploy context:

| Key | Value |
|---|---|
| `SUPABASE_ANON_KEY` | Supabase → **Project Settings → API Keys** → the **anon / public** key (the long `eyJ…` one). |
| `SITE_ORIGIN` | `https://graycocrm1.netlify.app,https://crm.grayco-cs.com` |
| `STAFF_EMAILS` | `nthomas@grayco-cs.com,sbiffle@grayco-cs.com,office@grayco-cs.com,gmiller@grayco-cs.com,wjohnson@grayco-cs.com` |

While you are on that page, check two settings that should already be there:
* `SUPABASE_URL` must be `https://ieeonhpfahmwwecizdut.supabase.co`.
* `SUPABASE_SERVICE_KEY` must be set (Supabase → Project Settings → API Keys → **service_role**). This key must never go in the page, and it never does.

Optional: `CALENDAR_FEED_SECRET`, any long random text. Without it, the calendar links are signed with a secret derived from the service key.

`STAFF_EMAILS` is only a fallback. Once step 2 has made the `gc_staff` table, that table is the list, and you manage it from the CRM.

### 2. Supabase: run the "prepare" script (safe, changes nothing for anyone today)
Supabase → **SQL Editor → New query**. Paste all of `docs/security-prepare.sql` and click **Run**. It ends with `prepared | 5`.

It creates the staff list with these people:
* Wesley and Nick as **admin**.
* Glenn, sbiffle@ and office@ as **staff**.

It also creates the private backup table, and adds a rule to each CRM table that lets signed-in staff use it. The CRM people are using today keeps working exactly as before.

### 3. Supabase: sign-ins
1. **Authentication → Sign In / Providers** (on older dashboards: **Authentication → Providers → Email**). Leave **Email** enabled, turn **"Allow new users to sign up" OFF**, and click **Save**. After this, only an admin can create an account.
2. **Authentication → Users → Add user → Create new user**:
   * Email `wjohnson@grayco-cs.com`, a strong password that is new and not the old shared one, and tick **Auto Confirm User**. Click **Create user**.
   * Do the same for `nthomas@grayco-cs.com`.

   The others can be added by Wesley from inside the CRM in step 5. You can also add them here the same way.

### 4. Deploy the new build
Deploy as usual. The build includes:
* `index.html`
* `netlify/functions/` (new: `staff-admin.js` and `gc-backup.js`)
* `netlify.toml` (this adds the nightly backup schedule)
* `_headers`

Do **not** deploy `patch_S.py` or `test_S.mjs`. They are build tools.

Open the site. You should see the company sign-in screen ("GrayCo — Company sign-in").

### 5. Everyone signs in once
* **Wesley** signs in. Then open **💎 → Team access** and use **Add** for each of these:
  * `gmiller@grayco-cs.com`
  * `sbiffle@grayco-cs.com`
  * `office@grayco-cs.com`
  * anyone else, such as Brittany.

  Each Add creates their sign-in and shows a **temporary password once**. The CRM does not save it anywhere. Give it to the person in person or by phone.
* Each person signs in on **each computer and phone** they use. Then they open **💎 → Change my password** and set their own password.
* Old tabs that were left open from before the update should be reloaded. Anything typed in them is kept on that computer and synced after the reload.

### 6. Supabase: run the lockdown
Only do this after step 5 is done.

Supabase → **SQL Editor → New query**. Paste all of `docs/security-lockdown.sql` and click **Run**. The results grid at the bottom must say **OK** on every line:

* RLS on every public table — OK
* no rules other than GrayCo staff rules — OK
* anon has no table rights — OK
* views follow the rules — OK
* anon reading gc_kv — OK (permission denied)
* signed-in non-staff reading gc_kv — OK (0 rows)
* signed-in staff (Wesley) reading gc_kv — OK (N rows)
* staff reading gc_backups — OK (permission denied)

The script can be run again at any time, and it gives the same result.

### 7. Check it from the outside
1. Open a **private/incognito window** and go to the site. You get the sign-in screen and nothing else. Nothing from the CRM shows.
2. From any terminal, replacing `<anon>` with the anon key:
   ```
   curl -s "https://ieeonhpfahmwwecizdut.supabase.co/rest/v1/gc_kv?select=key&limit=1" -H "apikey: <anon>"
   ```
   This must answer with `permission denied` (code 42501) or `[]`. It must **never** return a row.
3. ```
   curl -s -X POST https://graycocrm1.netlify.app/.netlify/functions/claude-proxy -d '{}'
   curl -s -X POST https://graycocrm1.netlify.app/.netlify/functions/send-email  -d '{}'
   ```
   Both must answer `Sign in to the GrayCo CRM first` (HTTP 401).
4. An old calendar link without `&t=` must answer "This calendar link is not valid any more". Each person gets their new link from the **📅 Schedule to Phone** button while signed in.
5. Your doors still work. Roof Ignite / lead sources and the money door each keep their own keys and nothing changed for them. Check them with:
   * `…/lead-intake?ping=1`
   * `…/money-intake?ping=1`

### 8. Change the keys that were open
These could be used by anyone until now, so treat them as known:
* **Anthropic key:** console.anthropic.com → **API Keys**. Create a new key, put it in Netlify `ANTHROPIC_API_KEY`, then **delete the old key**. Anyone could spend it through the open `claude-proxy` and `brain` functions.
* **Resend key:** resend.com → **API Keys**. Create a new key, put it in Netlify `RESEND_API_KEY`, then delete the old one. Anyone could send mail as @grayco-cs.com. Also look at Resend → **Emails** for messages you did not send.
* **Google Calendar / Drive connections:** the tokens were stored in `gc_kv`, which was readable with the public key. Each person who connected Google does this:
  1. Go to myaccount.google.com → **Security → Third-party apps with account access → GrayCo**, then **Remove access**.
  2. Reconnect from the CRM.
* **QuickBooks:** if QuickBooks was connected, disconnect and reconnect it in the CRM. This gives new tokens.
* **Passwords:** the old shared CRM password and the old admin password were effectively public. Do not reuse them anywhere, including the new sign-ins or email. The CRM's old login screen still exists behind the new one, but it no longer protects anything.
* After any Netlify variable change: **Deploys → Trigger deploy → Deploy site**, so the functions pick up the new values.
* Two-factor sign-in is not switched on, which is your choice for now. It can be added later in Supabase → Authentication.

### 9. Was anything copied while it was open?
Until step 6, anyone holding the page could read everything in the CRM's cloud tables. That includes customers, addresses, phone numbers, invoices, jobs, subs and the Google tokens.
* Supabase → **Logs → API** (Logs Explorer) shows recent requests. Look for IP addresses or user agents that are not yours. How far back you can see depends on your plan.
* Check whether the CRM held anything legally sensitive: Social Security numbers, bank account or routing numbers, or full card numbers. If it did, talk to your lawyer or insurer about notification rules in Tennessee and Arkansas.
* The **second, older Supabase project** (`hctlgfxagsxqvdiviqpg`) also had its public key in the page. If you still need it, run `docs/security-lockdown.sql` there too. If you do not, use Project Settings → General → **Pause project**, or delete it.

---

## Everyday

* **Add a person:** 💎 → Team access → enter email, name, Staff/Admin → **Add and create sign-in**, then give them the temporary password.
* **Remove a person:** 💎 → Team access → **Remove**. They are cut off at once: from the database, from every function, and their sign-in is blocked. An admin cannot remove themselves or the last admin.
* **Forgot password:** an admin opens 💎 → Team access → **Reset password** for that person and gives them the new temporary password.
* **Change your own password:** 💎 → Change my password.
* **Idle time:** the default is 8 hours. To change it on one computer, open the browser console and run `localStorage.setItem('gc_idle_hours','4')`.
* **Backups:** these run every night at about 2:15 am Central. To see them, open Supabase → SQL Editor and run:
  ```sql
  select id, taken_at, source, row_count from public.gc_backups order by taken_at desc limit 20;
  ```
  To look inside one, for example the projects in the newest gc_kv backup:
  ```sql
  select jsonb_path_query_array(snapshot, '$[*] ? (@.key == "projects").value') from public.gc_backups
  where source = 'gc_kv' order by taken_at desc limit 1;
  ```
  Restoring is a decision for you. Ask for help putting a specific list back, so nothing newer is overwritten.

## If something breaks after step 6
1. Open `docs/security-lockdown.sql` and find the **RE-OPEN** block at the bottom.
2. Take the lines between `do $$` and `end re-open`, remove the leading `-- ` from each, paste them into a new query and click **Run**.

This lets the public key back into the CRM's own tables, as before, while the problem is looked at. Running the whole lockdown file again closes it.

## What is still not covered
* A computer or phone that is **stolen while signed in** has the CRM's copy on it. That copy is kept in the browser so the CRM works offline. If that happens:
  1. Remove the person in Team access. This blocks the cloud at once.
  2. Add them back with a new password when they have a new device.

  Turn on a screen lock and disk encryption on every work computer (Windows: BitLocker, Mac: FileVault).
* The **CompanyCam webhook** (CompanyCam → us) can still be posted to by anyone who knows its address. All it can do is put a lead on the review list. It cannot change a job, read anything, or send anything.
* The Google Calendar connect page (`gcal-oauth`) accepts any Google sign-in result. The worst it can do is link the wrong Google calendar to a name, which then shows up in the review/schedule import. Disconnect it in the CRM if you see a calendar you do not know.
