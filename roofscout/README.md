# GrayCo RoofScout

Commercial roof lead finder for GrayCo Construction Services. Start with [PROJECT-BRIEF.md](PROJECT-BRIEF.md): it holds every decision made so far.

## Run it
- **Shared (real use):** **https://roofscout.grayco-cs.com** (also `/roofscout/` on the CRM's site). Sign in with your GrayCo CRM email and password. First, an admin turns on the database once and connects the address: see [docs/ROOFSCOUT-SETUP.md](../docs/ROOFSCOUT-SETUP.md).
- **Demo mode (testing only):** available only when the files are opened on a computer (file:// or localhost), never on the website. It saves only in that browser and is not shared.

The satellite map needs internet. The **Imagery** box on the map switches between Esri, Esri Clarity (beta, often sharper), Google satellite (through the server; setup in `docs/ROOFSCOUT-SETUP.md` step 8) and **Older / leaf-off** (Esri Wayback: past pictures, with winter ones marked 🍂 for roofs hidden by trees). Each person's pick is remembered.

## Finding real leads
- **Scan an area (Map tab):** draw an area, or type a ZIP or city, and RoofScout lists the large commercial / industrial / institutional / church / school / apartment buildings in it from public data (OpenStreetMap buildings, county parcel owners, Memphis roof permits, NOAA hail), scored 0–100 with the reasons. **Add as lead** saves the address, owner of record, mailing address, footprint and score. Setup: `docs/ROOFSCOUT-SETUP.md` step 6; sources and their terms: `../docs/ROOFSCOUT-DATA-SOURCES.md`.
- **📞 Find owner contact** on a lead asks Tracerfy (paid skip tracing) for phones and emails: once per lead, monthly limit, Do-Not-Call / litigator flags shown, never auto-dialed. Setup: step 7.
- **On the Map tab:** search an address (or pan the satellite map), click **📐 Trace a roof**, click the roof's corners, then click the first corner again. RoofScout measures the roof (with a pitch setting for sloped roofs), fills in the street address, and opens a new lead with the estimate ready.
- **📐 Measure on map** in any lead re-traces its roof.
- **📡 Measure from address** in any lead asks Google's Solar API for the roof area and pitch (server-side key, monthly limit, figures kept 30 days; setup in `docs/ROOFSCOUT-SETUP.md` step 5).
- Or add a lead by hand with "+ Add lead".
- The **demo scan** (made-up sample sites tagged DEMO, fictional 555-01xx phones, @example.com emails) exists only in local demo mode (file:// or localhost), never on the website.

## Estimates
Each lead gets one **approximate estimate**:
- If the roof type has an **estimate per square**, the estimate is squares × that price (a square is 100 ft²). The defaults are:
  - TPO re-roof: $1,000 per square
  - Metal: $1,400 per square
  - Asphalt shingle (residential): $375 per square
- Otherwise the estimate is cost ÷ (1 − margin), a true gross margin. The default margin is 35%.
- Metal roofs also show the restorative coating as a cheaper alternative.

## Files
| File | What it does |
|---|---|
| `index.html` | Page shell: sign-in, top bar, modal, print area |
| `css/styles.css` | All styling, including the printed flyer and proposal |
| `js/util.js` | Small helpers (money formatting, escaping, condition grades) |
| `js/pricing.js` | Estimates (per square or margin), coating, weighted forecast |
| `js/scan.js` | Area scan logic shared by the page and the server: geodesic area, tile grid, OpenStreetMap / county / NOAA parsing, building type, score + reasons, dedupe, do-not-contact |
| `../netlify/functions/roofscout-scan.js` | Area scan server: OpenStreetMap (Overpass), county parcels, Memphis permits, NOAA hail; cached + rate-limited in Supabase |
| `../netlify/functions/roofscout-skiptrace.js` | 📞 Find owner contact: Tracerfy, once per lead, monthly limit |
| `js/imagery.js` | Imagery switcher logic shared by the page and the tests: sources, native zoom per source, Wayback release list, leaf-off dates, Google viewport, each person's pick |
| `../netlify/functions/roofscout-tiles.js` | Google satellite tiles (Map Tiles API): sign-in check, tile tickets, session token, monthly limit; the key stays on the server |
| `js/store.js` | Default settings, demo-mode saving, and the demo scan |
| `js/cloud.js` | GrayCo sign-in (shared with the CRM) and database calls |
| `js/data.js` | Saves to the shared database or, in demo mode, this browser; catches edit clashes |
| `js/docs.js` | Flyer and proposal layouts |
| `js/app.js` | The seven sections, lead editor, call logging, settings |
| `tests/*.test.js` | `node roofscout/tests/<name>.test.js` (pricing, geo, scan, scan-function, skiptrace, imagery, tiles-function; no network) |
| `tests/scan-ui.smoke.js` | Playwright smoke test of the scan screen and the imagery switcher: `NODE_PATH=<playwright dir> node roofscout/tests/scan-ui.smoke.js` |
| `tests/fixtures/` | Sample Overpass / ArcGIS / permits / SPC answers used by the tests (constructed, see its README) |
| `../docs/roofscout-setup.sql` | Creates RoofScout's tables and access rules in the CRM's Supabase |

## Rules
- Never guess or invent real contact info.
- Imagery must be licensed (never scrape Google Earth).
- Calls follow DNC and TCPA rules.
