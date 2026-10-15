# GrayCo CRM 33.143 — go-live checklist (do these in order)

This is the only list you need. Each step says where to click. The other guides have the detail if something looks different:
`SECURITY-SETUP.md`, `FRESH-START.md` and `FILE-STORAGE.md`.

**Have ready:**
- Optional: also add `COMPANYCAM_TOKEN` (your new CompanyCam key) in step 1. The next update uses it.
- `GrayCo_CLEAN_START_2026-10-15.json`, your clean data from today. Keep a second copy on a USB stick or in Google Drive.
- About 45 minutes.
- Everyone else **out of the CRM**.

---

## Part 1 — Settings (nothing changes for anyone yet)

**1. Netlify settings.** Netlify → your project → left menu **Environment variables** → **Add a variable**. Add three:

| Key | Value |
|---|---|
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → the **anon / public** key |
| `SITE_ORIGIN` | `https://graycocrm1.netlify.app,https://crm.grayco-cs.com` |
| `STAFF_EMAILS` | `nthomas@grayco-cs.com,sbiffle@grayco-cs.com,office@grayco-cs.com,gmiller@grayco-cs.com,wjohnson@grayco-cs.com` |

On the same page, check that `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are already there.

**2. Supabase: prepare.** Supabase → **SQL Editor** → **New query**. Paste all of `docs/security-prepare.sql` and click **Run**. It ends with `prepared | 5`.

**3. Supabase: file storage.** **SQL Editor** → **New query**. Paste all of `docs/storage-setup.sql` and click **Run**. Every line in the result must say **OK**.

**4. Supabase: logins.**
- **Authentication** → **Sign In / Providers**: turn **"Allow new users to sign up" OFF** and click **Save**.
- **Authentication** → **Users** → **Add user** → **Create new user**:
  - `wjohnson@grayco-cs.com`, a new strong password, tick **Auto Confirm User**.
  - Do the same for `nthomas@grayco-cs.com`.

## Part 2 — Make 33.142 live

**5. Connect Netlify to GitHub (one time).** Netlify → **Project configuration** → **Build & deploy** → **Continuous deployment** → **Link repository**.
- Choose **GitHub**, then **grayco-cs/graycocrm1**.
- Branch `claude/peaceful-dijkstra-goqgjq`.
- Build command: **empty**. Publish directory: **`.`**
- Click **Deploy**.

**6. Check it is live.** Open `https://graycocrm1.netlify.app/version.txt`. It must say **33.143-2026-10-15-v1800**. If it shows anything else, stop and ask.

**7. Sign in once** as Wesley to check the new sign-in screen works. Then **close the CRM everywhere**: every tab, every computer, phones too.

## Part 3 — Fresh start (old data put away, never destroyed)

**8. Run the fresh start.** Supabase → **SQL Editor** → **New query**. Paste all of `docs/fresh-start.sql` and click **Run**. Every line in the check list must say **OK**.
It first makes two permanent copies of everything, then empties the CRM data.

**9. On YOUR computer:** open the CRM and sign in. It empties itself once and re-opens.

**10. Load your clean data.** **Admin** → **💾 Storage** → **📤 Import Backup** → choose `GrayCo_CLEAN_START_2026-10-15.json` → **OK**.

**11. Check the counts.** You should see about:
- **73 jobs**
- **80 invoices**
- **115 customers**
- **about 19 leads**
- a schedule with only automatic Start/Finish markers for active jobs
- **no 211 pipeline**


## Part 4 — Everyone else, then lock the door

**12. Add your team.** 💎 → **Team access** → **Add** for each person: `sbiffle@`, `gmiller@`, `office@`, and Brittany if she has her own email.
Each Add shows a **temporary password once**. Give it to the person by phone or in person.

**13. Each person, on each computer and phone:** open the CRM and sign in. It empties itself once and then shows the clean data. Then 💎 → **Change my password**.

**14. Lock the database.** Do this only after step 13. Supabase → **SQL Editor** → paste `docs/security-lockdown.sql` → **Run**. Every line must say **OK**.

**15. Check from outside.** Open a **private / incognito** window and go to the site. You must see only the sign-in screen.

**16. Replace the keys that were open.** You can do this the same day or later:
- new **Anthropic** key, then put it in Netlify as `ANTHROPIC_API_KEY`;
- new **Resend** key, then put it in Netlify as `RESEND_API_KEY`;
- reconnect **Google** and **QuickBooks** in the CRM.

`SECURITY-SETUP.md` step 8 has the clicks. After changing a Netlify setting: **Deploys** → **Trigger deploy**.

**17. Glenn's pay.**
- Admin → Employees → Glenn Miller → Pay Type **"PM (overhead split)"**, with overhead and split left blank.
- 💵 Payroll → Glenn → Pay setup → **1099 contractor**, weekly, **$19,968 a year**.

**18. Documents.** Open `GrayCo_documents.zip` and upload the ones you still need to their jobs. They are stored small and every computer sees them.

---

**If anything goes wrong:** nothing is destroyed.
- `fresh-start.sql` has an **UNDO** block that puts the old cloud data back exactly.
- `security-lockdown.sql` has a **RE-OPEN** block.
- Your backup files are untouched.
- Each computer also keeps its old copy (see `FRESH-START.md`).
