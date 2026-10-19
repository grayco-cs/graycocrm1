# GrayCo Lead List — Handoff for Claude Code

Owner: Wesley Johnson, GrayCo Construction Services (Bartlett, TN)
Original artifact (Version 14): https://claude.ai/artifact/S8tT5DPgrdRwg7bNyzZMNN
**Now lives in this repo at `leads/`, on the CRM's Supabase. See [README.md](README.md) and [docs/LEADS-SETUP.md](../docs/LEADS-SETUP.md). The sections below are the original handoff, with updates marked "Done".**
Goal: an outreach tracker / lead list for bids. It will later plug into the GrayCo CRM **Leads tab** (not yet — keep it standalone until told otherwise).

## Files in this folder
- `GrayCo_Lead_List.html` — the whole app, one file (HTML + CSS + JS + embedded data).
- `GrayCo_Multifamily_Outreach_Tracker.xlsx` — the source spreadsheet the app was seeded from.
- `HANDOFF.md` — this file.

## Where saved progress lived (artifact days)
Done: it was read out of the artifact on Oct 19, 2026 (27 companies + 1 added company) into `GrayCo_Lead_List_progress_2026-10-19.json`, which the app brings in with **Bring in saved progress (.json)**. Two saved records pointed at renamed rows: "Travelers contractor network" moved to "MyTravelers Repair Network…"; an older "West Hill" duplicate was dropped (Westhill Global has its own newer progress).

Statuses, notes, call logs, drafts, replies, contact edits and companies Wesley added are **not inside the HTML**. They live in the published artifact's shared database (`window.claude` `db` capability). Before moving off the artifact, click **Export progress (.xlsx)** in the app to keep a copy. Opened as a plain local file, the db calls won't exist — the app will need a replacement storage layer (see "Porting" below).

## App structure
- Runtime capabilities used: `db` (shared doc store), `sample` (Claude email drafting), `downloads` (xlsx export).
- Libraries: SheetJS 0.18.5 (cdnjs) for import/export; Archivo font (Google Fonts).
- Embedded data: `const SEED = [...]` (607 leads) and `const SEED_BUILT = "2026-10-14T04:38:02.000Z"`.
- `parseWorkbook(XLSX, wb)` turns the spreadsheet into lead objects (used for re-imports).
- Main functions: `boot`, `allLeads` (cached, `dirty()` invalidates), `order`/`buildOrder`, `filtered`, `render`/`rowHtml`, `openProfile`/`renderProfile`, `contact(l)` (seed + overrides), `statusOf`, `isDone`, `followDue`, `logAct(id,kind,note)`, `template(l)`, `claudeDraft(l,box)`, `setProjects(text,b,u)`, `saveProg`, `saveCustom`, `saveLeadList`/`loadLeadList`.

### Lead object
`{id, phase (1=Register, 2=Reach out), sheet, setup, pri, inz (within 100 mi of Bartlett), zone, title, what, how, area, links[], emails[], phones[], person, init, raw{every spreadsheet column}}`

### Database docs
- `progress/{leadId}`: `{status, log[{t,k,n}], fu (follow-up date), c{name,title,email,phone,web,portal,addr}, draft{to,s,b}, replies[{t,from,title,email,phone,outcome,said}], portals[{label,url}], notes, upd}`
- `custom/{id}`: companies Wesley added by hand.
- `leadlist/meta` `{at,fileName,chunks,count}` + `leadlist/c{i}` `{items}`: an imported spreadsheet; used only if `meta.at > SEED_BUILT`.

### Save safety (don't break this)
`pending[id]` counter tracks in-flight writes; the live snapshot ignores a doc while it's pending or if its `upd` is older than local. This fixed clicks/contact edits being overwritten by draft autosave. There is a "Saving… / Saved / Not saved" indicator.

### Ordering
phase → added-by-you first → setup items → insurance programs (phase 1) → priority → in-zone (≤100 mi) → original order. Outside-zone priority was bumped +1. Little Rock, Nashville, Jackson TN/MS, St. Louis, Huntsville, Oxford stay visible.

## Email template rules (`template(l)`)
- **Multifamily / commercial:** "self-performs all Division 9 finishes on commercial and multifamily, labor-only or furnish-and-install, and we're also a licensed general contractor (up to $3 million in Tennessee, unlimited in Mississippi and Arkansas)". No ratings / itemized finish lists.
- **Home builders:** Wesley's pricing email — $6 labor on framing, $70/sheet turnkey sheetrock, under $100/gal turnkey paint, "easy button". No GROW line.
- **Insurance programs / restoration:** restoration division, water/fire/storm, Xactimate, "Our team is IICRC WRT certified".
- **GROW line by type:** "We're growing, our pricing is very competitive, and we'd love to … be your easy button on your communities / on your Division 9 scope / for your owners and project teams / for renovations, build-outs and maintenance / on claims in our area / on your projects". None for marketing firms.
- Each type gets slightly different wording.
- Bartlett 312-unit and 36-unit jobs are **only** added when the checkboxes `#pjB` / `#pj36` are ticked (constants `PJ_B`, `PJ_36A`, `PJ_BOTH`).
- Greeting uses a person's name only if it looks like a real name (`looksPerson`), else "Hi there,".

## Data status
- Spreadsheet tabs: Multifamily Developers & GCs, Large GCs & Owners, GC Bid Lists (Prime), Corporate Accounts, Bid Lists & Plan Rooms, Architects, Join & Register, Insurance Programs (all Priority 1), Marketing Firms, Home Builders, Summary.
- All 265 links verified (Oct 2026): 26 fixed, 2 removed, ~70 phones added. Done: the fixes are now in the xlsx too, in new columns **Verified website / Verified phone / Verified email / Verified contact note / Research note**. `data/seed.json` is rebuilt from the xlsx, so re-uploading the spreadsheet no longer undoes them.
- Unverified: sriplanroom.com (call Southern Repro (479) 582-4022), kwcompanies.com, renaissanceatcolonypark.com ((601) 519-0900).
- Possible wrong matches to double-check: Harrell Construction (FL), Studio A Architecture (Louisville KY).
- 43 companies still have no contact info (3 are tasks; ~10 developers with names only; rest small builders).
- Known relationship: someone at JLL (property management) can get GrayCo in for Beale Street work.

## Open questions for Wesley
1. "$6 labor on framing" — per LF or per SF?
2. Add ASD / AMRT certs to insurance emails?
3. Add "for your projects" to the easy-button line everywhere?

## Suggested next steps in Claude Code
1. Done: split into `index.html`, `js/app.js`, `css/styles.css`, `data/seed.json`, `js/parse.js`.
2. Done: Supabase tables `ll_progress` / `ll_custom` / `ll_leadlist` (docs/leads-setup.sql), CRM sign-in. This is also the path into the CRM Leads tab.
3. Done: link-check fixes written back into the xlsx.
4. Done: drafting goes through the CRM's `claude-proxy` function (server-side key).
5. Optional: Gmail send/track, follow-up reminders, CRM Leads-tab integration.
