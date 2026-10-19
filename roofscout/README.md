# GrayCo RoofScout

Commercial roof lead finder for GrayCo Construction Services. Start with [PROJECT-BRIEF.md](PROJECT-BRIEF.md): it holds every decision made so far.

## Run it
Open `roofscout/index.html` in a browser (double-click works). The satellite map needs internet; everything else works offline.

Demo logins: `wjohnson@grayco-cs.com` / `admin`, `mreed@grayco-cs.com` / `pm`, `dcole@grayco-cs.com` / `sales`. Change these passwords in Settings before real use.

## What's real today and what's demo
- **Demo:** the scan (sites, roof sizes, conditions, owners). Demo phones are in the fictional 555-01xx range; demo emails are @example.com. Every demo lead is tagged DEMO.
- **Real:** leads you add with "+ Add lead", the pricing engine, call list, pipeline, leaderboard, flyers and proposals.
- **Saved in this browser only** (localStorage). Use Settings → Data → Download backup, and Restore backup to move data to another computer. Shared team data comes with the backend (Build tab, step 1).

## Files
| File | What it does |
|---|---|
| `index.html` | Page shell: sign-in, top bar, modal, print area |
| `css/styles.css` | All styling, including the printed flyer and proposal |
| `js/util.js` | Small helpers (money formatting, escaping, condition grades) |
| `js/pricing.js` | Pricing engine: true gross margin, coating, weighted forecast |
| `js/store.js` | Default settings and team, saving, and the demo scan |
| `js/docs.js` | Flyer and proposal layouts |
| `js/app.js` | The seven sections, lead editor, call logging, settings |
| `tests/pricing.test.js` | `node roofscout/tests/pricing.test.js` |

## Rules
- Never guess or invent real contact info.
- Imagery must be licensed (never scrape Google Earth).
- Calls follow DNC and TCPA rules.
