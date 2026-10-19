# RoofScout: turning on the shared database (owner's guide)

RoofScout now runs on the **GrayCo CRM's own Supabase project**:

- **Same people.** Everyone with a CRM sign-in can use RoofScout, with the same email and password. Nobody needs a second account.
- **Same admins.** Wesley and Nick (role `admin` in the CRM's staff list) manage RoofScout's pricing and branding. Everyone else works the leads.
- **One shared lead pool.** A lead added or changed on one computer or phone shows up on everyone else's within about a minute.
- **Nightly backup.** RoofScout's tables are included in the CRM's nightly backup.

Until step 1 below is done, signing in to RoofScout says the database is not set up yet. Nobody can get in without a GrayCo sign-in: there is no demo or guest mode on the website.

## 1. Supabase: run the setup script (once)

The CRM's security script `docs/security-prepare.sql` must already have been run. It has been, if the CRM's company sign-in screen is live.

1. Open Supabase → **SQL Editor → New query**.
2. Paste all of `docs/roofscout-setup.sql` and click **Run**.

The results grid at the bottom must say **OK** on every line:

| Check | Expected |
|---|---|
| RoofScout tables exist | OK |
| RLS on every RoofScout table | OK |
| only GrayCo staff rules | OK |
| anon has no RoofScout rights | OK |
| staff profiles | *N* profiles (one per person on the staff list) |
| anon reading rs_leads | OK (permission denied) |
| signed-in non-staff reading settings | OK (0 rows) |
| signed-in staff (Wesley) reading settings | OK (1 row) |
| activity log cannot be erased | OK (permission denied) |

The script can be run again at any time and gives the same result. It does not touch any CRM table.

It also works with the CRM's lockdown script. `docs/security-lockdown.sql` removes every database rule except ones named `gc_staff_all` / `gc_staff_read`, and RoofScout's rules use exactly those names. Running the lockdown again later leaves RoofScout working.

## 2. Open RoofScout

RoofScout has its own address: **https://roofscout.grayco-cs.com**. The CRM stays at **https://crm.grayco-cs.com**. Both are the same Netlify site; a rule in `netlify.toml` makes the roofscout address show only RoofScout.

**One-time setup for the address:**

1. **Netlify:** open site **graycocrm1**, then **Domain management**, then **Add a domain**. Type `roofscout.grayco-cs.com` and confirm.
2. **DNS** (only if grayco-cs.com's DNS is *not* managed by Netlify): at the company that manages grayco-cs.com's DNS (where `crm` was set up), add a record:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `roofscout` | `graycocrm1.netlify.app` |

   If the DNS *is* managed by Netlify, step 1 does this automatically.
3. Wait for Netlify to show the certificate (the lock icon) for `roofscout.grayco-cs.com`. This is usually within an hour.
4. **Netlify → Site configuration → Environment variables → `SITE_ORIGIN`:** add `,https://roofscout.grayco-cs.com` to the end of the value. Then go to **Deploys** and click **Trigger deploy**.

**Signing in:** use your CRM email and password. The two addresses keep separate sign-ins, so you sign in once on each. Signing out of one does not sign you out of the other.

**Inside the CRM:** RoofScout is also a tab in the CRM menu (🏠 RoofScout, under Leads), already signed in. This needs no setup.

RoofScout also still opens at `crm.grayco-cs.com/roofscout/` and `graycocrm1.netlify.app/roofscout/`.

## 3. First things to set (admin)

Open **Settings** and fill in or confirm the following, then click **Save settings**. The settings apply to the whole team.

- **TN, AR and MS license numbers.** Until they are filled in, documents say "Licensed in Tennessee / Arkansas / Mississippi".
- **Estimate per square** for each roof type. The starting values are:
  - TPO: $1,000 per square
  - Metal: $1,400 per square
  - Asphalt shingle: $375 per square
  - Every other roof type: 0, which prices it from cost and the margin instead.
- **Material and labor $/ft²** for each roof type. These are your costs, and they drive the "margin on this estimate" figure each PM sees. They are placeholders until you set them.
- **Proposal terms.** These are placeholders too.

Each person then opens **Settings → My profile** and enters their title and direct phone. These go on the flyers and proposals they send.

## 4. Satellite map key (admin, free)

The satellite pictures come from Esri. For business use, Esri asks for an API key:

1. Go to **developers.arcgis.com** and create a free **ArcGIS Location Platform** account.
2. Create an **API key**. Under its privileges, allow **Basemaps** only. Under its allowed referrers, add your site addresses:
   - `https://graycocrm1.netlify.app`
   - `https://crm.grayco-cs.com`
   - `https://roofscout.grayco-cs.com`
3. In RoofScout, go to **Settings → Satellite map**, paste the key, and click **Save settings**.

Esri's free tier covers normal office use. The ArcGIS site shows your usage.

## Finding leads

- **Map tab:** search an address or pan to a roof, click **📐 Trace a roof**, click each corner, then click the first corner again.
  - RoofScout measures the roof and fills in the street address.
  - Pick a **pitch** for sloped roofs (flat / low-slope for most commercial).
  - The lead opens with the estimate ready. Name it, set the condition, and save.
- **📐 Measure on map** inside a lead re-measures it.
- **Address search** uses OpenStreetMap's free Nominatim service. Its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) allows searches a person clicks for, at moderate volume (about one a second for the whole team), and forbids bulk or automatic lookups. RoofScout only looks up when someone clicks **Go** or saves a traced roof. If the team ever outgrows it, switch to a paid geocoder.

## Everyday

- **Add or remove a person:** do it in the CRM (💎 → Team access). RoofScout follows that list automatically.
- **Two people edit the same lead at once:** nothing is overwritten. The second person to save is told who changed it, and their editor reloads with the newer version so they can make their change again.
- **Internet drops:** a change saved while offline is kept on that computer. The header shows "1 change waiting to send", and the change is sent when the connection is back. Don't sign out until it is gone.
- **Demo leads:** the scan is still a demo (Build tab). Its sites are tagged DEMO and are shared with the team. An admin can clear them all with Settings → Data → **Remove demo leads**.

## Undo

The bottom of `docs/roofscout-setup.sql` has an UNDO block. It drops RoofScout's tables and everything in them, and does not touch the CRM.
