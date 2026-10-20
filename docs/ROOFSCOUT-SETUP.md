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
| area scan tables exist | OK |
| area scan limit function | OK |
| owner lookup table + functions | OK |
| staff profiles | *N* profiles (one per person on the staff list) |
| anon reading rs_leads | OK (permission denied) |
| signed-in non-staff reading settings | OK (0 rows) |
| signed-in staff (Wesley) reading settings | OK (1 row) |
| usage counter hidden from the web | OK (permission denied) |
| scan cache hidden from the web | OK (permission denied) |
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

## 5. Google Solar: measure a roof from its address (admin)

**Cost:** Google gives 10,000 lookups a month free, then about 1¢ each. RoofScout also stops at a monthly limit you set (500 to start).

1. **Google Cloud project.** Go to **console.cloud.google.com**, open the project picker, click **New project**, and name it `GrayCo RoofScout`.
2. **Billing.** Go to **Billing** and link a billing account with a card.
3. **Turn on the Solar API.** Go to **APIs & Services → Library**, search **Solar API**, and click **Enable**.
4. **Make a key.**
   - Go to **APIs & Services → Credentials → Create credentials → API key**.
   - Open the key. Under **API restrictions**, choose **Restrict key** and tick **Solar API** only. Click **Save**.
5. **Spending alert (recommended).** Go to **Billing → Budgets & alerts** and create a budget of about $20/month with an email alert.
6. **Put the key in Netlify.**
   - Open site **graycocrm1 → Site configuration → Environment variables → Add a variable**.
   - Key: `GOOGLE_SOLAR_API_KEY`. Value: the key.
   - Then go to **Deploys → Trigger deploy**.
7. **Run `docs/roofscout-setup.sql` again in Supabase.** This adds the monthly usage counter. Running it again is safe, and every line should say OK.

**Check it's working:** RoofScout **Settings → Google Solar** should say "Connected to Google".

**Using it:** in any lead, click **📡 Measure from address**. Google's roof area, main pitch and photo date appear beside the estimate. **Use this size** puts Google's area into the lead.

**Google's rules:**
- Google limits how long its results may be kept. RoofScout keeps Google's figures on a lead for 30 days, then removes them; the area a person chose stays.
- Its pages say "Roof data © Google".
- Google also requires apps using the Solar API to have a public Terms of Use and Privacy Policy. Make sure grayco-cs.com links them.

**Coverage:** not every building has Google roof data, especially large or new commercial buildings. When it says "no roof data", trace the roof on the map instead (free).

## 6. Scan an area: find big commercial roofs (admin, free)

**Map → Scan an area** lists the large commercial, industrial, church, school and apartment buildings in an area, ranked 0–100 by roof size, roof-age signals, recent hail and distance from Bartlett, each with the reasons ("42,000 ft² · built 1988 · last roof permit 2003 · 1.25" hail 9 days ago"). It uses free public data:

- **Buildings:** OpenStreetMap (through the Overpass service). RoofScout identifies itself, keeps each downloaded map square for 30 days, and stops at a team fair-use limit of 100 fresh map squares a day. Already-scanned areas never count.
- **Owners and mailing addresses:** the county's parcel records (public records). Use them only for business outreach about the building.
- **Roof permits:** City of Memphis building permits (records start in 2021).
- **Hail:** NOAA Storm Prediction Center reports.

Google Solar is **not** used by the scan. Each result has **📡 Measure**, which uses the same monthly limit as step 5.

**Turn it on — checklist (tick each):**

- [ ] **Run `docs/roofscout-setup.sql` again in Supabase** (SQL Editor → paste all → Run). Every line must say OK, including the new ones: *area scan tables exist*, *area scan limit function*, *owner lookup table + functions*, *scan cache hidden from the web*. Safe to repeat.
- [ ] **Deploy.** The scan is the new Netlify function `roofscout-scan`; it ships with the next deploy (no new environment variable is needed). Then open RoofScout → **Settings → Area scan**: it should say "Scan server ready".
- [ ] **Shelby County owners (needs an OK first).** Shelby County's parcel service says its data is "for the sole use of ReGIS, its participants and their authorized agents". Email the ReGIS Administrator (ReGIS@shelbycountytn.gov, 160 N Main St, Suite 1000, Memphis TN 38103), say GrayCo staff look up individual commercial parcels for roofing outreach (no resale, no bulk download), and ask for written OK. When they say yes: **Settings → Area scan → Shelby County parcels → tick, Save settings.** Until then, Shelby results say "Owner unknown — look up" with a link to the Assessor's site.
- [ ] **DeSoto County owners (optional).** Call DeSoto County GIS, (662) 469-8019, ask for the public ArcGIS address of the parcel layer (it ends in `/MapServer/<number>`) and whether business outreach use is fine. Paste it in **Settings → Area scan → DeSoto County parcels**, tick, Save.
- [ ] **Crittenden County owners:** already on (Arkansas GIS Office open data). Nothing to do.
- [ ] **Memphis roof permits (optional).** On **data.memphistn.gov** open **DPD Building Permits** → **I want to use this** → **View API resources** → copy the **GeoService** address (ends in `/FeatureServer/0`). Paste it in **Settings → Area scan → Memphis roof permits**, tick, Save.
- [ ] **Do-not-contact list.** In **Settings → Area scan → Do not contact**, add any owner name or parcel ID that asked not to be contacted (one per line). They are left out of every scan and owner lookup.
- [ ] **Optional:** change the minimum roof size (10,000 ft²), the default area and the score weights in the same section.

**Using it:** Map tab → **Scan an area** → **Draw** (click two corners on the map), or type a **ZIP** or **City** → set the minimum size, the building types and, if you want, "Hail-hit in last N days" → **🔎 Scan this area**. Results appear on the map and in a sortable list below it. **Add as lead** creates a lead with the address, owner of record, mailing address, measured footprint, score and reasons. Buildings that are already leads (same parcel, address or roof) say **Already a lead**. The largest scan is 30 map squares (about 55 square miles); draw smaller areas for big cities.

**Attribution:** building outlines are © OpenStreetMap contributors (shown on the map, under the results and on each lead's source note).

## 7. Owner phones and emails: Tracerfy (admin)

**📞 Find owner contact** on a lead (and on a scan result once it is a lead) asks **Tracerfy** for the owner's phones and emails. It is paid per lookup, so RoofScout:

- looks a lead up only when someone clicks, and asks first ("uses 1 Tracerfy lookup — N left this month");
- looks each lead up **once**. Clicking again shows the saved answer for free. **Trace again** asks first, then uses another lookup;
- stops at a monthly limit you set (**Settings → Owner contact lookup**, 200 to start), counting only lookups that found someone (Tracerfy charges nothing for a miss);
- refuses leads marked **Do not contact** and owners on the do-not-contact list;
- shows each phone's **Do Not Call** and **TCPA litigator** flags from Tracerfy, or "not checked against Do Not Call" when Tracerfy didn't say;
- never dials or texts by itself.

**Turn it on — checklist:**

- [ ] **Netlify → Site configuration → Environment variables:** `TRACERFY_API_KEY` = the key from your Tracerfy account (already added). Then **Deploys → Trigger deploy**.
- [ ] **Run `docs/roofscout-setup.sql` again** (same as step 6; it adds the one-lookup-per-lead table).
- [ ] **RoofScout Settings → Owner contact lookup** should say "Connected to Tracerfy" and show the credit balance. Set the monthly limit.
- [ ] **Recommended:** test once against Tracerfy's free sandbox first: add `TRACERFY_API_URL` = `https://mock.tracerfy.com/v1/api`, deploy, try one lead, then delete the variable and deploy again.

Without the key, the button is hidden and Settings says how to connect it.

**Before calling or texting:** check the National Do Not Call Registry (and Tennessee's list) for any number Tracerfy did not mark, call only 8 am–9 pm, and never use an auto-dialer or send texts to cell phones without consent (TCPA).

## 8. Sharper satellite imagery: the imagery switcher (admin)

A PM reported blurry imagery and trees hiding roofs. The map now has an **Imagery** box (top right) with four sources. Each person's choice is remembered in their browser:

| Source | What it is | Cost / setup |
|---|---|---|
| **Esri (standard)** | The imagery the map has always used. | Free (step 4 key optional). |
| **Esri Clarity (beta)** | Esri's `World_Imagery` on `clarity.maptiles.arcgis.com`. Often sharper (and sometimes older) than the standard picture. | Free, nothing to set up. Esri calls it beta, so it may change. |
| **Google satellite** | Google's Map Tiles API, 2D satellite tiles. Usually the sharpest in cities (down to zoom 21–22). | Needs the steps below. |
| **Older / leaf-off (Esri Wayback)** | Every past release of Esri's imagery since 2014. Pick a date, or click **🍂 Dates with new imagery here**: RoofScout lists only the pictures that actually differ at that spot, with the date each was **taken**, and marks winter ones 🍂 (Nov–Mar, trees bare). It jumps to the newest winter picture. | Free, nothing to set up. |

When you zoom past the sharpest level a source has at that spot, the map says **"Max detail reached"**. Zooming further only enlarges the picture. RoofScout checks each source's real depth at the spot (Esri: its tile map; Google: its viewport answer), so it no longer assumes zoom 19 everywhere. On high-density (retina) screens, Esri tiles are drawn at double resolution.

**Measurements don't depend on imagery.** **📡 Measure from address** (step 5) measures from Google's elevation data, so trees and blurry pictures don't fool it. The lead editor shows it first, labelled **Measurement source: Google Solar roof data**.

### Turning on Google satellite — checklist

- [ ] **Google Cloud** (the same project as step 5, **GrayCo RoofScout**): **APIs & Services → Library**, search **Map Tiles API**, click **Enable**. Billing is already linked.
- [ ] **Key: pick one of these.**
  - **Recommended:** go to **Credentials → Create credentials → API key**. Under **API restrictions**, tick **Map Tiles API** only. Then in **Netlify → Environment variables**, add **`GOOGLE_MAPS_TILES_KEY`** = that key. This keeps the Solar key limited to Solar.
  - **Or** reuse the Solar key: open it under **Credentials** and add **Map Tiles API** to its API restrictions. Without `GOOGLE_MAPS_TILES_KEY`, RoofScout uses `GOOGLE_SOLAR_API_KEY`.
  - Either way the key is **server-only**. Do not add a website (referrer) restriction, because the requests come from Netlify's server, not from browsers.
- [ ] **Hard cap (recommended):** go to **APIs & Services → Map Tiles API → Quotas** and set the 2D tiles requests per day to about **3,000**. That is about 90,000 a month, under the free 100,000. The step 5 budget alert covers this too.
- [ ] **Run `docs/roofscout-setup.sql` again in Supabase.** It adds the `rs_add_usage` counter. Running it again is safe, and every line should say OK.
- [ ] **Deploys → Trigger deploy.** Then **RoofScout Settings → Satellite map** should say "Google key found. Google tiles this month: … of 90,000". Set the **Monthly tile limit** there.

If Google says the API is not enabled, or that satellite tiles are not available to the project, RoofScout explains this and shows Esri instead. Google limits satellite tiles to "imagery visualization" use cases and does not offer them to projects billed in the EEA. If Google refuses the project, use Clarity and Wayback.

**Cost and limits (Google's price list, October 2026):** each tile, and each viewport request, is one billable "Map Tiles API: 2D Map Tiles" request. The first **100,000 a month are free**, then about **$0.60 per 1,000** (less above 1 million). One close-up look at a roof is about 20–40 tiles. RoofScout's own limit (default **90,000/month**) stops Google tiles before the free amount runs out, and Esri keeps working. The count is written in batches, so it can trail by a few dozen tiles. The Google Cloud quota above is the hard stop.

**How the key stays safe:** the browser never gets the key or Google's session token. A signed-in person gets a short-lived **tile ticket** from `/.netlify/functions/roofscout-tiles`. The function checks the GrayCo sign-in and the monthly limit before issuing it. Each tile request carries the ticket, and the function fetches the tile from Google. It does not check the sign-in again for every tile, because that would mean two database calls per tile. A ticket lasts at most 6 hours, so someone removed from the staff list loses Google tiles within 6 hours (they lose everything else at once). A referrer-restricted browser key would avoid the function, but anyone could copy that key from the page and use it from a page that fakes the referrer. That would spend GrayCo's money, so it was not used.

**Google's rules:** the map shows Google's attribution text and the **Google Maps** mark while Google imagery is on. Tiles are never stored by RoofScout. They are passed through with Google's own cache time, private to that browser (at most one day). Don't screenshot Google imagery into flyers or proposals.

## Finding leads

- **Map tab → Scan an area:** see step 6.
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
- **Demo leads:** the website has no demo data. The made-up practice scan exists only in local demo mode (files opened on a computer). If old DEMO leads are still in the shared list, an admin can clear them all with Settings → Data → **Remove demo leads**.

## Undo

The bottom of `docs/roofscout-setup.sql` has an UNDO block. It drops RoofScout's tables and everything in them, and does not touch the CRM.
