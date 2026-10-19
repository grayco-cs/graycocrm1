# Lead list: turning on the shared database (owner's guide)

The lead list (`/leads/`) now runs on the **GrayCo CRM's own Supabase project**, like RoofScout:

- **Same people.** Everyone with a CRM sign-in can use it, with the same email and password.
- **One shared list.** A status, call or note saved on one computer or phone shows up on everyone else's within about 20 seconds.
- **Nightly backup.** Its tables are in the CRM's nightly backup.

Until step 1 is done, signing in says the database is not set up yet.

## 1. Supabase: run the setup script (once)

`docs/security-prepare.sql` must already have been run. It has been if the CRM's company sign-in screen is live.

1. Open Supabase → **SQL Editor → New query**.
2. Paste all of `docs/leads-setup.sql` and click **Run**.

Every line in the results must say **OK**:

| Check | Expected |
|---|---|
| lead list tables exist | OK |
| RLS on every lead list table | OK |
| only GrayCo staff rules | OK |
| anon has no lead list rights | OK |
| anon reading ll_progress | OK (permission denied) |
| signed-in non-staff writing | OK (refused) |
| signed-in staff (Wesley) saving | OK |
| saved companies | *N* with progress |

You can run the script again at any time. It does not touch any CRM or RoofScout table, and its rules keep working after `docs/security-lockdown.sql` is run again.

## 2. Deploy

Merge this branch so Netlify deploys it. That adds the `leads-seed` function and the rule that keeps `/leads/data/` private. No new environment variables are needed. **Rewrite with Claude** uses the CRM's existing `ANTHROPIC_API_KEY`.

## 3. Open it and bring over the saved progress

1. Open **https://crm.grayco-cs.com/leads/** and sign in with your CRM email and password.
2. Click **Bring in saved progress (.json)** and choose `GrayCo_Lead_List_progress_2026-10-19.json`. That file is everything saved in the old Claude artifact as of Oct 19, 2026:
   - 27 companies' statuses, logs, drafts and notes
   - the company you added (cramemphis)
3. Confirm. Running it twice changes nothing, because a company is only taken from the file when the file's copy is newer.

If anything was changed in the old artifact after Oct 19, click **Export progress (.xlsx)** there first, or ask Claude to export it again.

## Undo

The last lines of `docs/leads-setup.sql` remove the lead list's tables. Nothing else is affected.
