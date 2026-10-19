# GrayCo RoofScout — Project Brief

The single source of truth for this project. Read this first. It captures every decision made so far so any session or developer can continue without re-reading chat history.

_Last updated: 2026-10-19 (Phase 1 backend; single approximate estimate; MS license)_

> **Where this lives:** RoofScout sits in its own `roofscout/` folder inside the GrayCo CRM repo. The root `index.html` is the **live GrayCo CRM** (deployed by Netlify from `main`). Never put the RoofScout prototype at the repo root, because that would replace the CRM.

## What it is
A lead-generation tool for GrayCo Construction Services (commercial roofing, Memphis & Bartlett, TN). Goal: scan commercial roofs from satellite imagery, flag the ones in bad shape, measure them, find the owner/manager contacts, track outreach, and generate branded flyers & proposals to win the job.

## Current status — READ THIS
- **Standalone lead program** in `roofscout/` (see `README.md` there), split into small files. It will be moved into the GrayCo CRM once it is finished.
- **Addresses:** CRM at **https://crm.grayco-cs.com**, RoofScout at **https://roofscout.grayco-cs.com** (same Netlify site; a host rule in `netlify.toml` maps the subdomain to `roofscout/`). Connecting the subdomain is a one-time Netlify + DNS step in `docs/ROOFSCOUT-SETUP.md`. RoofScout is also a **tab in the CRM menu** (🏠 RoofScout, CRM build 33.146), opened inside the CRM with the same sign-in.
- **Phase 1 backend is built** on the CRM's own Supabase project (`docs/roofscout-setup.sql`, owner's guide `docs/ROOFSCOUT-SETUP.md`). It turns on when an admin runs that script once.
- **Team access:** everyone with a CRM sign-in gets in with the same email and password. There is one sign-in for both apps, one shared lead pool, and people are added and removed in the CRM (💎 → Team access). Admin = admin on the CRM's staff list.
- **Login protected, company only:** on the website the GrayCo sign-in is the only way in (client requirement 2026-10-19). Demo mode exists only when the files are opened locally for testing.
- **No demo data on the website** (2026-10-19). Real leads come from the Map tab: search an address or pan the satellite map, **trace the roof's outline to measure it** (pitch factor for sloped roofs), and save it as a lead. The street address is filled in from the spot (OpenStreetMap Nominatim, only on user action). The old synthetic scan remains only in local demo mode.
- **Google Solar API built (2026-10-19):** "📡 Measure from address" in each lead. Netlify function `solar-lookup` holds the key (`GOOGLE_SOLAR_API_KEY`), allows signed-in staff only, enforces an admin monthly limit (default 500) counted in `rs_usage`, and keeps Google's figures on a lead for at most 30 days (Google's storage rule). It turns on when the key is added.
- Still not automatic: owner names / phones / emails (Phase 2: Regrid + Tracerfy) and spotting bad roofs automatically (licensed imagery + condition AI).
- **Works for real today:** leads traced on the map or added by hand, estimates, call list (with Do-Not-Call flag), pipeline + weighted forecast, PM leaderboard, flyers and proposals, shared data, edit-clash protection, and the nightly backup.
- **Satellite imagery licensing:** Esri asks for an API key (free ArcGIS Location Platform account) for business use. An admin enters it in Settings → Satellite map; until then Esri's public tiles are shown.
- Hard rule honored throughout: never fabricate or guess real contact info. Real leads require the real data pipeline or contact info a teammate has verified.

## Company facts (used on all documents)
- Name: GrayCo Construction Services
- Phone: (901) 585-0944
- Email: wjohnson@grayco-cs.com
- Website: www.grayco-cs.com
- Address: 4014 Broadway Road, Bartlett, TN 38135
- Licensed in **Tennessee, Arkansas and Mississippi** (license # fields are placeholders: fill in the real numbers in Settings). Every flyer and proposal lists all three.
- Insurance line: "Licensed · Bonded · Fully Insured"
- Logo: navy "GRAYCO CONSTRUCTION SERVICES" (the uploaded JPG). App embeds a white version for dark/colored headers and a navy version for white backgrounds, both transparent (no white box).

## Scope decisions (important)
- Scans both commercial AND residential roofs, but **commercial is the primary goal / default**. (Updated 2026-10-19: residential was briefly removed, then added back with commercial as the priority.)
- UI has a Commercial / Residential / All toggle that defaults to Commercial. Residential is flagged as lower-confidence (harder to grade from satellite: smaller roofs, tree cover, steeper pitches).
- Focus roof types: flat / low-slope (TPO, roll roofing, metal) measure easiest from the air; shingle/steep (often residential) are harder.
- Home base Memphis; scan radius is any size (slider + type-in box + presets 2/5/10/25/50 mi).

## Pricing engine
- **One approximate estimate per lead.** There are no Good / Better / Best tiers (removed 2026-10-19 at the client's request).
- Each roof type can have an **estimate per square** (1 square = 100 ft²): estimate = squares × that price. Defaults set by the client:
  - **TPO re-roof: $1,000 / square**
  - **Metal: $1,400 / square**
  - **Asphalt shingle (residential): $375 / square**
- Roof types with no per-square price use **true gross margin**: `estimate = cost ÷ (1 − margin%)`, with a default margin of 35%. Example confirmed with the client: $190K cost at 35% = $292K.
- Per roof type, the admin also sets material $/ft² and labor $/ft² (material + labor = cost/ft²). These drive the internal "margin on this estimate" each PM sees.
- Customer documents show "About $X" (rounded to $100) plus how it was worked out, e.g. "About 200 squares at $1,000 per square for a full TPO re-roof".
- Metal roof coating option (cheaper alternative to replacement): priced by the square, $165/square (cheap) to $250/square (premium). Material cost is shown separately: $197/gallon @ 320 ft²/gallon.

## Leads, attribution & commission
- Every RoofScout lead is a GrayCo lead (company-sourced via the scan).
- Commission split: 15 / 60 / 40. The actual payout is calculated in GrayCo's existing CRM, not in this tool. RoofScout only shows the split as a label on each lead and on the PM leaderboard.
- Activity tracking: every open/edit/call/print is stamped with the signed-in user. In shared mode the database does the stamping, so it can't be faked, and the log can't be edited or erased from the web. A PM leaderboard aggregates jobs touched, GrayCo leads, opens, edits, calls and pipeline value.

## Team & logins
- **The GrayCo CRM sign-in** (Supabase Auth): email + password, the same account as the CRM. Who may get in is the CRM's staff list (`gc_staff`); add and remove people in the CRM (💎 → Team access).
- Roles: **admin** comes from the CRM staff list (Wesley, Nick) and is the only role that can change pricing and branding. Everyone else is labeled PM or Sales (a RoofScout label, set by an admin in Settings → Team).
- One shared lead pool everyone works from; each person's name and direct number (Settings → My profile) go on the flyers THEY send.
- Changing your password in RoofScout changes your GrayCo sign-in for the CRM too.

## Documents (print to PDF to email or mail)
- **Friendly flyer**: flashy gradient header, logo, warm/positive tone, snapshot cards, the approximate estimate, the sending PM's contact card, trust badges (Licensed TN, AR & MS; Bonded & Insured; Local Bartlett; 5-Star), license footer.
- **Full proposal**: branded, multi-section: roof assessment, scope of work (by roof type), **one approximate estimate** (plus the coating alternative on metal roofs), terms & warranty, signature block, TN + AR + MS license footer.

## App sections
Map (real satellite via Leaflet + Esri World Imagery, markers + radius circle; needs internet) · Leads (sortable table) · Calls (priority-ranked call list) · Pipeline (summary KPIs + weighted forecast + detailed cards) · Activity (PM leaderboard + feed) · Settings (per-square pricing, margin, coating, company & licenses, team, my profile, commission split) · Build (the plan).

## Pipeline stages
New → Contacted → Quoted → Won / Lost. Weighted forecast uses close probabilities (New 10% / Contacted 30% / Quoted 60% / Won 100%).

## Go-Live Plan (turning the prototype into a real product)
The Build tab in the app shows this plan. (The older `GO-LIVE-PLAN.html` from an earlier session was not recovered.) Summary:

Two paths: (A) License imagery/detection/measurement: recommended to start, live in weeks, pay per roof. (B) Build your own AI: later, at volume. For a non-technical owner: Path A.

Build order:
1. **Backend + logins**: **BUILT 2026-10-19** on the CRM's existing Supabase project and staff sign-in (no new cost). Turn on with `docs/roofscout-setup.sql`.
2. **Owner data + skip trace** (Regrid ~$15–50/mo; skip trace $0.02–$0.15/record): real owners + phones/emails.
3. **Measurement** (Google Solar API cheap; EagleView $25–$75/report): real roof size & estimates.
4. **Imagery + condition detection** ("the scan"): Nearmap/EagleView or a custom AI model. The big, pricier phase; cost scales with area.

Costs: monthly software/data ~$75–250 starter → ~$1k–3k+ at volume. One-time build ~$15k–75k. Needs a developer.
Rules: imagery must be licensed (never scraped Google Earth); calling must respect DNC + TCPA.
Why costs exist: you pay to look at every rooftop (licensed imagery + compute), regardless of what's found. Most roofs are fine.

## Why we moved to Claude Code / how to not break it
- The prototype grew into one large single HTML file; editing it by string-replace got fragile.
- In this repo, git tracks every change so any edit can be rolled back (`git log`, `git revert`). That's the safety net.
- Done: the app is split into small files (see `roofscout/README.md`), and Phase 1 (backend) is built.

## Immediate next step
1. Admin runs `docs/roofscout-setup.sql` in Supabase (owner's guide: `docs/ROOFSCOUT-SETUP.md`). Every check line must say OK.
2. Connect https://roofscout.grayco-cs.com (Netlify domain + DNS, see the guide), open it, and sign in with a CRM account.
3. In Settings: fill in the TN / AR / MS license numbers, confirm the per-square prices and $/ft² costs, and set the proposal terms. Each person fills in My profile.
4. Then Phase 2 (owner data + skip trace), or finish the screens and move RoofScout into the CRM.
