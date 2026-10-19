# GrayCo RoofScout

Commercial roof lead finder for GrayCo Construction Services. Start with [PROJECT-BRIEF.md](PROJECT-BRIEF.md): it holds every decision made so far.

## Run it
- **Shared (real use):** **https://roofscout.grayco-cs.com** (also `/roofscout/` on the CRM's site). Sign in with your GrayCo CRM email and password. First, an admin turns on the database once and connects the address: see [docs/ROOFSCOUT-SETUP.md](../docs/ROOFSCOUT-SETUP.md).
- **Demo mode (testing only):** available only when the files are opened on a computer (file:// or localhost), never on the website. It saves only in that browser and is not shared.

The satellite map needs internet.

## Finding real leads
- **On the Map tab:** search an address (or pan the satellite map), click **📐 Trace a roof**, click the roof's corners, then click the first corner again. RoofScout measures the roof (with a pitch setting for sloped roofs), fills in the street address, and opens a new lead with the estimate ready.
- **📐 Measure on map** in any lead re-traces its roof.
- Or add a lead by hand with "+ Add lead".
- The **demo scan** (made-up sample sites tagged DEMO, fictional 555-01xx phones, @example.com emails) exists only in local demo mode, never on the website.

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
| `js/store.js` | Default settings, demo-mode saving, and the demo scan |
| `js/cloud.js` | GrayCo sign-in (shared with the CRM) and database calls |
| `js/data.js` | Saves to the shared database or, in demo mode, this browser; catches edit clashes |
| `js/docs.js` | Flyer and proposal layouts |
| `js/app.js` | The seven sections, lead editor, call logging, settings |
| `tests/pricing.test.js` | `node roofscout/tests/pricing.test.js` |
| `../docs/roofscout-setup.sql` | Creates RoofScout's tables and access rules in the CRM's Supabase |

## Rules
- Never guess or invent real contact info.
- Imagery must be licensed (never scrape Google Earth).
- Calls follow DNC and TCPA rules.
