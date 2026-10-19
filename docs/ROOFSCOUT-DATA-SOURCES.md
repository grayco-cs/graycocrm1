# RoofScout area scan: data sources (researched 2026-10-19)

Scope: free or public, legitimate data for finding large commercial / industrial roofs in
Shelby County TN, DeSoto County MS and Crittenden County AR.

**How this was checked.** This sandbox's outbound proxy refused connections to every data
host (overpass-api.de, gis.shelbycountytn.gov, maps.memphistn.gov, data.memphistn.gov,
www.spc.noaa.gov, gis.arkansas.gov, gis.desotocountyms.gov, the Microsoft and Overture
download hosts: `403` on CONNECT / DNS failure). Findings below come from web search
results that quote those services' own pages and metadata, plus the formats' public
documentation. Every endpoint is a setting the admin can change, the code detects field
names instead of hard-coding them, and the first live scan tells you in the results
panel which sources answered. The test fixtures in `roofscout/tests/fixtures/` were **constructed** from
the documented formats (not downloaded); see its `README.md`.

## Summary

| Source | What it gives | Usable now? | Sign-up / cost | Used by the scan |
|---|---|---|---|---|
| OpenStreetMap via Overpass API | Building footprints + tags (name, use, address) | **Yes** | None. Fair-use limits | Footprints (step 1) |
| Microsoft US Building Footprints | Footprints only (no tags) | Bulk download only | None (ODbL) | Not on-demand (see below) |
| Overture Maps buildings | Footprints (OSM + Microsoft + others) | Bulk GeoParquet only | None (ODbL) | Not on-demand (see below) |
| Shelby County ReGIS `Parcel/CERT_Parcel` | Parcels, owner, mailing address, land use, tax roll | Technically public REST; **use terms restrict it** | Written OK from ReGIS recommended | Parcels, **off until an admin turns it on** |
| Memphis `Tolemi_Feed` / 311 `ParcelCentroids` | Parcel id, owner name/address, living area | Public REST; data dated 2019 | None | Alternative URL for Shelby |
| DeSoto County MS GIS (`gis.desotocountyms.gov`) | Tax assessor web map layers | Public REST; parcel layer + fields unconfirmed | Ask county GIS (662) 469-8019 | Parcels, off until URL confirmed |
| Arkansas GIS Office `Planning_Cadastre` | Statewide parcels incl. Crittenden, owner name, address | **Yes** (state open data) | None | Parcels (Crittenden), on |
| Memphis DPD Building Permits (ArcGIS Hub) | Permits since Jan 2021, work description, issue date | Public; layer URL to paste in Settings | None | Roof-permit join (Memphis only) |
| NOAA SPC storm reports (daily CSV) | Hail reports: time, size, lat/lon | **Yes** | None (US Gov, public domain) | Hail flag |
| Google Solar API (existing) | Roof area/pitch per building | Yes (existing function) | Paid after 10k/mo; key in Netlify | Per-site "📡 Measure" only |
| Esri World Imagery (existing) | Satellite basemap | Yes | Free ArcGIS key for business use | Map only |
| **Tracerfy** (skip tracing) | Owner phones (DNC / TCPA flags) and emails | **Yes** — key is in Netlify | Paid credits (owner bought them) | "📞 Find owner contact" per lead |
| Nominatim (existing) | ZIP / city → bounding box | Yes, user-initiated only | None | Area picker (browser) |

## 1. Building footprints

### OpenStreetMap via Overpass API (primary, on demand)
- Endpoint: `https://overpass-api.de/api/interpreter` (POST `data=<query>`). Other public
  instances exist (e.g. `overpass.kumi.systems`, `overpass.private.coffee`); an env var
  `OVERPASS_URL` switches without a code change.
- Usage policy (Overpass manual, "commons" page): stay under about **10,000 requests and
  1 GB per day**. The OSM wiki adds: for anything that runs **regularly**, divide those by
  **100**, all of an app's users count together, the main instance is often overloaded,
  and heavy commercial use should run its own instance or a paid one.
- What RoofScout does to comply:
  - sends `User-Agent: GrayCoRoofScout/1.0 (+https://roofscout.grayco-cs.com; wjohnson@grayco-cs.com)`;
  - asks for one ~2 km × 2.2 km grid tile per request (`[timeout:20]`), only `building`
    ways/relations, `out geom;` (no recursion);
  - **caches each tile 30 days** in Supabase (`rs_scan_cache`); a rescan of the same area,
    by anyone, does not touch Overpass;
  - team-wide cap on live Overpass requests: **40 / hour, 100 / day** by default (≈ 1/100 of
    the headline limit, per the wiki); per-person cap on scan calls; a scan is at most 30 tiles;
  - backs off on HTTP 429/504 and tells the user to try later.
- License: ODbL 1.0. **Attribution "© OpenStreetMap contributors"** is shown on the map and
  under the results, and stored on each lead created (`source: 'scan'`, `sourceNote`).
- Coverage note: OSM in Shelby County includes the 2017-2019 Microsoft-footprint import
  plus hand mapping, so most commercial buildings exist, but many are tagged only
  `building=yes`. Type then comes from the parcel's land use, or shows "Other".

### Microsoft US Building Footprints (v2)
- `https://minedbuildings.z5.web.core.windows.net/legacy/usbuildings-v2/Tennessee.geojson.zip`
  (also `Mississippi`, `Arkansas`). Tennessee: 3,212,306 buildings, 890 MiB unzipped.
  ODbL. Footprints only; some carry an imagery-vintage date. The newer Global ML
  footprints are split by quadkey tiles (CSV index on the same host).
- Not usable on demand from a Netlify function (size, 10 s limit). Option for later: a
  one-time import of the three counties' footprints ≥ 5,000 ft² into a Supabase table.
  Not needed now because OSM already contains this import for Shelby County.

### Overture Maps buildings
- Monthly GeoParquet releases on AWS S3 / Azure (`overturemaps-us-west-2`, theme
  `buildings`). Buildings theme is **ODbL** (Places theme is CDLA-Permissive 2.0).
  Conflates OSM + Microsoft + Esri community footprints, some with height.
- Bulk only (needs DuckDB / the `overturemaps` CLI with a bbox). Same "import later"
  option as Microsoft; not used on demand.

## 2. Parcels and owners

Owner names and mailing addresses on tax rolls are public records. RoofScout uses them
only for business-to-business outreach about the building's roof, shows a do-not-contact
list (Settings) that removes matching owners/parcels from every scan, and never
guesses contact details (no phone/email comes from these sources).

### Shelby County, TN
- **Shelby County ReGIS** map service:
  `https://gis.shelbycountytn.gov/arcgis/rest/services/Parcel/CERT_Parcel/MapServer`
  ("Certified Parcels and Tax Roll Data"). Its metadata says: *"This data is owned by
  Shelby County Government and is for the sole use of ReGIS its participants and their
  authorized agents."* It also says the data may be displayed publicly but may not be sold
  or transferred to any other entity without ReGIS's written consent, and that it is
  shared under the ReGIS Cooperative GIS Data Sharing Agreement. Contact: ReGIS
  Administrator, 160 N Main St, Suite 1000, Memphis TN 38103, ReGIS@shelbycountytn.gov.
  Other ReGIS layers say they may **not** be displayed publicly, so terms vary by layer.
  - **Decision:** RoofScout ships with this source **off**. The owner should email ReGIS,
    describe the use (internal staff lookups of individual parcels, no resale, no bulk
    download), and turn it on in Settings → Area scan once they say yes.
- **City of Memphis** copies: `maps.memphistn.gov/mapping/rest/services/Tolemi/Tolemi_Feed/MapServer/4`
  (PARCELOWNERPROPERTY: parcel id, owner name, owner address, total appraisal, living
  area; "last updated 6/11/2019") and `311.memphistn.gov/server/rest/services/311/ParcelCentroids/MapServer`.
  Public, but 2019 data and the same county source; can be pasted as the Shelby URL.
- **Assessor of Property** (Melvin Burgess): `https://www.assessormelvinburgess.com/`
  has a public property search (owner, address, parcel id). Its site disclaimer
  restricts reproducing its databases. RoofScout links to it per site ("look up") and
  never scrapes it.
- The Tennessee Comptroller's statewide parcel system does **not** maintain Shelby County.

### DeSoto County, MS
- County ArcGIS server `https://gis.desotocountyms.gov/arcgis/rest/services/` (also
  `maps.desotocountyms.gov`) publishes `CountyWebMap/Tax_Assessors_County_Web_Map/MapServer`;
  the parcel layer id and fields were not confirmed from here. The county's own
  instructions describe owner name, physical address and tax details in the Tax Parcel
  box. No published terms found; call county GIS (662) 469-8019.
  - **Decision:** off by default; admin pastes the parcel layer URL (`…/MapServer/<id>`)
    after confirming it with the county.

### Crittenden County, AR
- **Arkansas GIS Office** statewide parcels (from county assessor CAMA, updated about
  twice a year, "Not a legal boundary"):
  `https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6`
  (`PARCEL_POLYGON_CAMP`, display field `ownername`; also `parcelid`, `countyid`,
  `adrlabel`, `parcellgl`, `parceltype`, value fields). Crittenden is in the recent
  updates. State open data, no login. **On by default.**
- Assessor lookup link: arcountydata.com (Arkansas county assessor data).

### How parcels are joined
- One ArcGIS `query` per county per batch of up to 50 buildings: `geometryType=esriGeometryMultipoint`,
  `inSR=4326`, `spatialRel=esriSpatialRelIntersects`, `outFields=*`, `returnGeometry=true`,
  `outSR=4326`, `f=json`, sent as POST. Each building's point-on-surface is matched to
  the parcel polygon that contains it (point-in-polygon locally).
- Field names differ by county; RoofScout picks them from candidate lists (e.g. owner:
  `OWNER`, `OWNERNAME`, `OwnerName`, `ownername`…; land use: `LUC`, `LANDUSE`, `parceltype`…).
- Residential single-family is excluded by a land-use pattern (Settings; default matches
  "single family", "residential", "SFR", "condo", "mobile home", "duplex" but not
  "multi"/"apartment").
- Results cached 30 days per tile.

## 3. Permits (Memphis)
- **Memphis Data Hub** (`data.memphistn.gov`) is now an **ArcGIS Hub** site, not Socrata.
  Dataset **"DPD Building Permits"** (owner MEMEGIS): new / alteration / addition permits
  issued **since January 2021**, ~28k records; fields include permit number, issue date
  (reported as `Issued_Date`), permit type (e.g. `COM-ALT`), work description (free text),
  address, coordinates. A third party reports a 2-4 week lag.
- An older Socrata-style resource (`data.memphistn.gov/resource/68xw-w2fe.csv`) appears in
  search results; not relied on.
- RoofScout queries the layer by tile envelope with `where = <description or type> LIKE '%ROOF%'`
  and detects the date / description / type / address fields from the layer's metadata.
  The admin pastes the layer URL (dataset page → "I want to use this" → API → GeoService
  URL, ending in `/FeatureServer/0`) in Settings.
- **Limit:** records start in 2021, so "no roof permit in 20+ years" cannot be known from
  this data. The scorer only treats a missing permit as an age signal when the source's
  coverage start (a setting, default 2021-01-01) is at least 20 years ago; otherwise it
  says "no roof permit on file since 2021" and relies on year built. A roof permit in
  the last 7 years lowers the score.
- Bartlett, Germantown, Collierville, DeSoto and Crittenden permits are not published as
  open data that we found.

## 4. Hail: NOAA Storm Prediction Center reports
- Daily CSVs: `https://www.spc.noaa.gov/climo/reports/YYMMDD_rpts_filtered_hail.csv`
  (fallback `YYMMDD_rpts_hail.csv`). Header `Time,Size,Location,County,State,Lat,Lon,Comments`;
  `Time` is HHMM UTC; a "day" runs 12Z to 11:59Z next day; `Size` is hundredths of an
  inch (175 = 1.75"); Lat/Lon decimal degrees. Public domain (US Government).
  Reports are preliminary (filtered = de-duplicated).
- RoofScout fetches each day once, keeps only reports inside the service region, and
  caches each finished day for a year (today/yesterday for 1 hour). "Hail-hit" = a report
  within 2 miles of the building in the last N days (max 90).

## 5. Imagery and measurement (existing)
- **Google Solar API** via `solar-lookup`: unchanged, monthly cap counted in `rs_usage`.
  The scan never calls it automatically; each result has "📡 Measure", which uses the
  same function and cap. Google's figures are kept 30 days on a lead (existing rule).
- **Esri World Imagery** basemap: unchanged.

## 6. Owner phones and emails: Tracerfy (paid)

Checked 2026-10-19 from Tracerfy's API documentation page
(`tracerfy.com/skip-tracing-api-documentation/`) as quoted by web search; tracerfy.com itself
could not be fetched from this sandbox. Field names the docs show inconsistently are parsed
defensively (see `normalize()` in `roofscout-skiptrace.js`). **Verify on the first live call**
or against the free sandbox.

- **Base URL:** `https://tracerfy.com/v1/api/`. **Auth:** `Authorization: Bearer <API key>` on
  every call; a missing or bad token returns **401**.
- **Single lookup (used):** `POST /v1/api/trace/lookup/` (synchronous). Body: `address`, `city`,
  `state`, `zip`, `find_owner: true` (find the owner of that property). A parcel variant
  `POST /v1/api/trace/parcel/lookup/` returns the same shape.
- **Batch (not used):** `POST /v1/api/trace/` takes a CSV, runs as an async job, results to S3,
  optional webhook. Not needed for one-lead-at-a-time lookups.
- **Response:** `hit`, `persons_count`, `credits_deducted`, `persons[]`. Each person:
  `first_name`, `last_name`, `full_name`, `age`, `dob`, `deceased`, `property_owner`,
  `litigator` (person-level), `mailing_address{street,city,state,zip}`,
  `phones[]` = `{ number, type: Mobile|Landline, dnc, tcpa, carrier, rank }` (ranked best first),
  `emails[]` = `{ email, rank }`. Marketing pages call the per-phone flag "TCPA litigator";
  the JSON example uses `tcpa` per phone and `litigator` per person. RoofScout treats either as
  "litigator: do not call".
- **Cost:** instant lookup **5 credits per hit, 0 on a miss**; credits from about $0.02
  (standard) down to ~$0.014 on the 50k plan, so ~7–10¢ per found owner. All Tracerfy products
  share one credit balance.
- **Credit balance:** `GET /v1/api/analytics/` returns the account summary (jobs, properties
  traced, credit balance, usage). RoofScout shows the balance in Settings and in the "are you
  sure" prompt when the field is present.
- **Rate limits:** the docs state "500 lookups per minute" and also "10 POST trace requests per
  5-minute window" (likely the batch endpoint). **429** answers carry `lookups_in_window` (or
  `retry_in` for the queue endpoint). RoofScout makes one call per click and reports a 429 as
  "wait a minute".
- **Out of credits:** exact code not documented; RoofScout treats HTTP 402, or any error whose
  message mentions credits / balance, as "out of credits".
- **Sandbox:** `https://mock.tracerfy.com/v1/api/trace/lookup/`: any token, nothing billed,
  sentinel inputs such as `RATE_LIMIT` return a 429. Set `TRACERFY_API_URL=https://mock.tracerfy.com/v1/api`
  to try it.
- **Compliance in RoofScout:** only on a person's click, after a confirmation; once per lead
  (`rs_skiptrace`); monthly cap (`rs_usage` kind `tracerfy`, default 200); refused for leads
  marked "Do not contact" and owners / parcels on the do-not-contact list; each phone shows
  Tracerfy's DNC / litigator status or "not checked against Do Not Call"; the reminder "Check the
  National Do Not Call list before cold calls or texts"; numbers are shown as text (no click-to-dial),
  nothing is dialed or texted automatically.

## 7. Terms checklist
- [x] Overpass: User-Agent, cache, small tiles, team cap, attribution.
- [x] OSM ODbL attribution on map + results; source stored on leads.
- [x] No scraping behind logins; no assessor website scraping; links only.
- [x] County REST services: only services published without login; Shelby off until ReGIS OK.
- [x] SPC: public domain; once per day per file.
- [x] Google Solar: per-site, user-initiated, monthly cap, 30-day retention (existing).
- [x] Owner data: business outreach only, do-not-contact list honored, no invented contacts.
- [x] Tracerfy: key server-side only, per-click, once per lead, monthly cap, DNC / litigator flags shown, no auto-dial.

## Sources consulted
- Overpass API manual, "commons" (usage limits): dev.overpass-api.de/overpass-doc/en/preface/commons.html
- OSM wiki, Overpass API: wiki.openstreetmap.org/wiki/Overpass_API
- Microsoft US Building Footprints: github.com/microsoft/USBuildingFootprints (fetched)
- Overture Maps release notes / AWS registry: overturemaps.org, registry.opendata.aws/overture
- Shelby County ReGIS `Parcel/CERT_Parcel` item info: gis.shelbycountytn.gov/arcgis/rest/services/Parcel/CERT_Parcel/MapServer/info/iteminfo
- Memphis `Tolemi/Tolemi_Feed/MapServer/4`, `311/ParcelCentroids`: maps.memphistn.gov, 311.memphistn.gov
- Shelby County Assessor of Property: assessormelvinburgess.com
- DeSoto County GIS: gis.desotocountyms.gov/arcgis/rest/services; desotocountyms.gov (foreclosure lookup instructions)
- Arkansas GIS Office `Planning_Cadastre` FeatureServer/6 and parcel update notices: gis.arkansas.gov
- Memphis Data Hub "DPD Building Permits": data.memphistn.gov/datasets/MEMEGIS::dpd-building-permits-1
- SPC storm reports: spc.noaa.gov/climo/reports/
- Tracerfy API docs: tracerfy.com/skip-tracing-api-documentation/, tracerfy.com/pricing, tracerfy.com/property-data-api
