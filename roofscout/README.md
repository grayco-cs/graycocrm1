# GrayCo RoofScout

Commercial roof lead finder for GrayCo Construction Services. Start with [PROJECT-BRIEF.md](PROJECT-BRIEF.md): it holds every decision made so far.

## Run it
- **Shared (real use):** `/roofscout/` on the CRM's site. Sign in with your GrayCo CRM email and password. First, an admin turns on the database once: see [docs/ROOFSCOUT-SETUP.md](../docs/ROOFSCOUT-SETUP.md).
- **Demo mode (practice):** click "Practice in demo mode" on the sign-in screen. It needs no sign-in, saves only in that browser, and is not shared.

The satellite map needs internet.

## What's real today and what's demo
- **Demo:** the scan (sites, roof sizes, conditions, owners). Demo phones are in the fictional 555-01xx range, demo emails are @example.com, and every demo lead is tagged DEMO.
- **Real:** leads you add with "+ Add lead", estimates, the call list, pipeline, leaderboard, flyers and proposals, team sign-in and the shared database.

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
