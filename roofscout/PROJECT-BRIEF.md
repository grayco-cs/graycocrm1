# GrayCo RoofScout — Project Brief

The single source of truth for this project. Read this first. It captures every decision made so far so any session or developer can continue without re-reading chat history.

_Last updated: 2026-10-19_

> **Where this lives:** RoofScout sits in its own `roofscout/` folder inside the GrayCo CRM repo. The root `index.html` is the **live GrayCo CRM** (deployed by Netlify from `main`). Never put the RoofScout prototype at the repo root, because that would replace the CRM.

## What it is
A lead-generation tool for GrayCo Construction Services (commercial roofing, Memphis & Bartlett, TN). Goal: scan commercial roofs from satellite imagery, flag the ones in bad shape, measure them, find the owner/manager contacts, track outreach, and generate branded flyers & proposals to win the job.

## Current status — READ THIS
- **2026-10-19: rebuilt from this brief** as a standalone lead program in `roofscout/` (see `README.md` there). It's split into small files (`index.html`, `css/styles.css`, `js/*.js`) instead of one giant HTML file.
- The **scan is still DEMO**: synthetic sites, sizes, conditions and owners, all tagged DEMO, with fictional 555-01xx phones and @example.com emails. It does NOT look up real properties, roofs, owners or phone numbers.
- **Works for real today:** leads a teammate adds by hand, the pricing engine, call list (with Do-Not-Call flag), pipeline + weighted forecast, PM leaderboard, flyers and proposals.
- **Data now survives a refresh** (saved in the browser), with CSV export and backup/restore. It is still per-browser: shared team data needs the backend (Phase 1).
- Plan agreed 2026-10-19: perfect the lead program standalone first, then connect it to the GrayCo CRM (same repo; the CRM already runs on Supabase).
- Hard rule honored throughout: never fabricate or guess real contact info. Real leads require the real data pipeline or contact info a teammate has verified.

## Company facts (used on all documents)
- Name: GrayCo Construction Services
- Phone: (901) 585-0944
- Email: wjohnson@grayco-cs.com
- Website: www.grayco-cs.com
- Address: 4014 Broadway Road, Bartlett, TN 38135
- Licensed in Tennessee and Arkansas (license # fields are placeholders; fill in real numbers)
- Insurance line: "Licensed · Bonded · Fully Insured"
- Logo: navy "GRAYCO CONSTRUCTION SERVICES" (the uploaded JPG). App embeds a white version for dark/colored headers and a navy version for white backgrounds, both transparent (no white box).

## Scope decisions (important)
- Scans both commercial AND residential roofs, but **commercial is the primary goal / default**. (Updated 2026-10-19: residential was briefly removed, then added back with commercial as the priority.)
- UI has a Commercial / Residential / All toggle that defaults to Commercial. Residential is flagged as lower-confidence (harder to grade from satellite: smaller roofs, tree cover, steeper pitches).
- Focus roof types: flat / low-slope (TPO, roll roofing, metal) measure easiest from the air; shingle/steep (often residential) are harder.
- Home base Memphis; scan radius is any size (slider + type-in box + presets 2/5/10/25/50 mi).

## Pricing engine
- Per roof type, admin sets material $/ft² and labor $/ft². material + labor = cost/ft²; × roof area = cost.
- Quotes use **TRUE gross margin, NOT markup**: `sale price = cost ÷ (1 − margin%)`.
  - Example confirmed with client: $190K cost at 35% margin = $190K ÷ 0.65 = $292K.
  - Default tiers: Low 25%, Middle 35%, High 45%. The Middle tier is the "Est. value" shown everywhere.
- Metal roof coating option (cheaper alternative to replacement): priced by the square, $165/square (cheap) to $250/square (premium). Material cost shown separately: $197/gallon @ 320 ft²/gallon.

## Leads, attribution & commission
- Every RoofScout lead is a GrayCo lead (company-sourced via the scan).
- Commission split: 15 / 60 / 40. The actual payout is calculated in GrayCo's existing CRM, not in this tool. RoofScout only shows the split as a label on each lead and on the PM leaderboard.
- Activity tracking: every open/edit is stamped with the signed-in user; a PM leaderboard aggregates jobs touched, GrayCo leads, opens, edits, pipeline value.

## Team & logins
- Email + password logins. Demo accounts: wjohnson@grayco-cs.com/admin, mreed@…/pm, dcole@…/sales.
- Admin (W. Johnson) adds/edits/removes teammates in Settings → Team & Profiles (name, title, phone, email, password, role).
- One shared lead pool everyone works from; each person's name & direct number go on the flyers THEY send.
- (Prototype simulates this in one browser; real shared logins need the backend, which is Phase 1.)

## Documents (print to PDF to email or mail)
- **Friendly flyer**: flashy gradient header, logo, warm/positive tone, snapshot cards, estimate range, the sending PM's contact card, trust badges (Licensed TN & AR, Bonded & Insured, Local Bartlett, 5-Star), license footer.
- **Full proposal**: branded, multi-section: roof assessment, scope of work (by roof type), Good / Better / Best = Low / Middle / High pricing, terms & warranty, signature block, TN+AR license footer.

## App sections
Map (real satellite via Leaflet + Esri World Imagery, markers + radius circle; needs internet) · Leads (sortable table) · Calls (priority-ranked call list) · Pipeline (summary KPIs + weighted forecast + detailed cards) · Activity (PM leaderboard + feed) · Settings (pricing, margins, coating, branding, team/logins, commission split) · Build (the plan).

## Pipeline stages
New → Contacted → Quoted → Won / Lost. Weighted forecast uses close probabilities (New 10% / Contacted 30% / Quoted 60% / Won 100%).

## Go-Live Plan (turning the prototype into a real product)
The Build tab in the app shows this plan. (The older `GO-LIVE-PLAN.html` from an earlier session was not recovered.) Summary:

Two paths: (A) License imagery/detection/measurement: recommended to start, live in weeks, pay per roof. (B) Build your own AI: later, at volume. For a non-technical owner: Path A.

Build order:
1. **Backend + logins** (Supabase ~$25/mo): shared database + real accounts. Delivers the "shared data, everyone has a profile" requirement. Do first. (The GrayCo CRM already runs on Supabase, so RoofScout can likely share that project and its staff logins.)
2. **Owner data + skip trace** (Regrid ~$15–50/mo; skip trace $0.02–$0.15/record): real owners + phones/emails.
3. **Measurement** (Google Solar API cheap; EagleView $25–$75/report): real roof size & estimates.
4. **Imagery + condition detection** ("the scan"): Nearmap/EagleView or a custom AI model. The big, pricier phase; cost scales with area.

Costs: monthly software/data ~$75–250 starter → ~$1k–3k+ at volume. One-time build ~$15k–75k. Needs a developer.
Rules: imagery must be licensed (never scraped Google Earth); calling must respect DNC + TCPA.
Why costs exist: you pay to look at every rooftop (licensed imagery + compute), regardless of what's found. Most roofs are fine.

## Why we moved to Claude Code / how to not break it
- The prototype grew into one large single HTML file; editing it by string-replace got fragile.
- In this repo, git tracks every change so any edit can be rolled back (`git log`, `git revert`). That's the safety net.
- Done: the app is split into small files (see `roofscout/README.md`). Next: Phase 1 (backend) per the plan.

## Immediate next step
1. Try the rebuilt app (`roofscout/index.html`), then change the demo passwords and fill in the real TN/AR license numbers, $/ft² pricing and proposal terms in Settings.
2. Give feedback on the screens, then start Phase 1 (backend + shared logins), most likely on the CRM's existing Supabase project.
