# GrayCo Bid Portal — Future Features Spec

Status: Planning document — features listed here are **not built yet**, but are
tracked so nothing gets forgotten between sessions.
Owner / builder: Wesley Johnson
Last updated: 2026-09-02

---

## How to use this doc

Each feature has:
- **Why deferred** — the reason we didn't build it in the first pass
- **When to build** — the trigger that says "now is the right time"
- **Scope** — what "done" looks like
- **Rough effort** — how long it would take in focused build sessions
- **Dependencies** — what has to be true before this can happen

Priorities are grouped as:
- **P0 — Must-have before scale**: needed once real jobs and subs start flowing
- **P1 — Should-have**: makes the portal noticeably better, not blocking
- **P2 — Nice-to-have**: differentiators, competitive edge

---

# P0 — Must-have before scaling to real production use

## 1. Supabase port to full feature parity

**Why deferred:** we chose "Path A" — keep iterating rapidly on the prototype
(`window.storage` version), do a single clean port to Supabase once features
stabilize. The Supabase build currently lags the prototype by ~1500 lines of
features (estimating with flat margin, plan archive, invites, activity, won/lost,
public/private, trade scopes, bid attachments, edit-job, view-as-sub, sharing
modes, sub stats, takeoff, session persist, PO auto-gen, role/trades).

**When to build:** when the prototype has been stable for 2-3 weeks with no new
major features being added, AND you're ready to move off the artifact preview
onto a real deployed URL for subs to use.

**Scope:**
- Forward-port every feature from `grayco-bid-portal.jsx` into
  `grayco-bid-portal-supabase/src/App.jsx`
- Match all UI/UX exactly — subs shouldn't notice any difference
- Wire up Supabase auth (replace the plaintext-password login with real auth)
- Wire up Supabase storage buckets for plans (5 GB per file with Pro tier)
- Wire up Supabase storage for sub documents (W-9, insurance)
- Row-level security policies for public/private jobs and per-user data
- Session tokens replace the `window.storage` session key

**Rough effort:** 1-2 focused build sessions (4-8 hours of pair-work with Claude)

**Dependencies:**
- Supabase Pro tier ($25/mo) — for 5 GB per file storage
- Deployed Netlify site
- `portal.grayco-cs.com` CNAME configured through Squarespace DNS

---

## 2. Resend email edge function — wire it up

**Why deferred:** the Supabase edge function skeleton exists
(`supabase/functions/send-email/index.ts`) but isn't wired to Resend yet.
Deferring emails until Supabase port is done avoids double-wiring.

**When to build:** immediately after the Supabase port lands.

**Scope:**
- Add `RESEND_API_KEY` as a Supabase secret
- Add `FROM_EMAIL` as a Supabase secret (verified domain: `noreply@grayco-cs.com`)
- Wire the edge function to Resend's send API
- Add email templates for:
  - **New job invitation** — when admin invites a sub to a private job
  - **Bid submitted confirmation** — receipt to the sub, notification to PM+office
  - **Bid accepted/rejected** — to the sub who submitted
  - **Job status change to Won/Lost** — to admins
  - **Sub registration approved** — to the sub
  - **Document expiration warning** — 30 days before insurance expires
- Every email links back to the portal — never attach files (subs download from portal)
- Templates should match GrayCo branding (navy/gold, Inter font, logo)

**Rough effort:** 1 focused session (3-5 hours)

**Dependencies:**
- Supabase port done
- Resend account + verified sending domain
- MX / SPF / DKIM records set correctly on `grayco-cs.com`

---

## 3. Real phone numbers on Team tab

**Why deferred:** placeholders (`901-555-01XX`) used during build.

**When to build:** literally today — one edit before launch.

**Scope:** replace phone placeholders in `SEED_USERS`:
- Wesley: `901-555-0102` → your real number
- Nick: `901-555-0101` → real number
- Steven Biffle: `901-555-0103` → real number
- Glenn Miller: `901-555-0104` → real number
- Brittany: `901-555-0105` → real number

**Rough effort:** 5 minutes

**Dependencies:** none

---

# P1 — Should-have, adds significant value

## 4. Takeoff Tool — Phase 2 (DONE, 2026-09-02)

**Status:** ✓ All Phase 2 items shipped in one focused build session.

**What's now in the portal:**
1. ✓ Multi-page navigation (all pages of any PDF plan, prev/next controls)
2. ✓ Zoom in/out/reset (40% to 400%)
3. ✓ Area (polygon) measurement with SF calculation (Shoelace formula)
4. ✓ Rectangle tool (2-click, computes both LF perimeter and SF area)
5. ✓ Color-coded trade layers (Drywall/Framing/MEP/Flooring/Roofing/General, plus
   Add Layer for custom trades). Toggle visibility per layer.
6. ✓ CSV export — all measurements across all pages, with page, type, layer,
   label, length, area, share status columns
7. ✓ Per-measurement labels (typeable inline)
8. ✓ Per-measurement "Share with GrayCo" toggle — admin can view shared takeoffs
   in read-only mode from JobDetail sidebar
9. ✓ Per-page scale (different pages of the same plan set can have different
   scales, common in real drawing sets)

**Additional future polish (Phase 3 — deferred):**
- **Pan** via mouse-drag on background (currently zooms only, scrolling for pan)
- **Snap-to-grid** or snap-to-existing-endpoints for cleaner measurements
- **Undo/redo history** (currently only "undo last on page")
- **Bulk-edit layer assignment** — select multiple measurements, change layer
- **Copy measurement to other pages** (useful when same room appears on multiple sheets)
- **Print/export view** — flatten measurements onto the PDF and download as PDF

These are polish, not features that unlock a new use case. Only build if subs
request them after real usage.

---

## 5. CRM Integration Phase 2 endpoint

**Why deferred:** the CRM is being built in parallel. Portal already produces the
`Copy CRM Payload` JSON; the CRM just needs to receive it.

**When to build:** as soon as the CRM has a project data model with a unique PO
Number field.

**Scope:** see the full spec in `CRM-INTEGRATION.md` — this doc summarizes:
- CRM builds `POST /api/import-from-bid-portal` endpoint
- Portal adds a "Send to CRM" button (replaces "Copy CRM Payload" clipboard flow)
- Merge logic: match by PO Number → attach; no match + `poAutoGenerated: true` → adopt PO and create project; no match + typed PO → reject with error prompting the user
- Portal disables the "Send to CRM" button on estimates whose job has no Project ID

**Rough effort:** 1-2 sessions on portal side; separate CRM-side work required

**Dependencies:**
- CRM project data model exists
- Five open questions in `CRM-INTEGRATION.md` answered (Project ID format, PO uniqueness, auth, plan file storage, estimate revision behavior)

---

## 6. ~~Homepage banner linking to portal~~ (DECIDED AGAINST, 2026-09-02)

**Decision:** portal is intentionally kept OFF the main grayco-cs.com website
navigation. Wesley wants the portal to be a business tool for approved subs,
distributed by direct URL (`portal.grayco-cs.com`) rather than surfaced as a
public marketing page. Reasons:

- Keeps main site focused on GC/marketing face of the business
- Reduces random unqualified signup requests
- Portal feels like a proper business tool subs bookmark, not a page to browse

**Distribution channels for the portal URL instead:**
- Outbound bid invite emails (Resend templates once wired)
- Wesley's / Nick's / Steve's email signatures
- Business cards + trade show handouts for sub recruitment
- Referral from existing approved subs

**Reversal trigger:** if sub recruitment stalls after 3-6 months and volume is
too low, revisit whether to make the portal more discoverable.

---

## 7. Notifications when new job matches sub's trades

**Why deferred:** requires the Resend edge function first.

**When to build:** after Resend is wired.

**Scope:**
- Sub profile has `trades: []` field already (populated at registration)
- When admin creates a public job with `tradesSought` filled in, cross-reference
  approved subs whose `trades` overlap
- Send those subs an email: *"New GrayCo bid opportunity matches your trades:
  [job title], bids due [date]. View → [portal link]"*
- Sub can unsubscribe (respect this via a per-sub notification preference)
- Don't spam — max one email per job per sub, even if job is edited later

**Rough effort:** 4-6 hours

**Dependencies:** Resend wired (P0 #2)

---

## 8. Bid due date reminder emails

**Why deferred:** same as above — needs Resend.

**When to build:** after Resend is wired.

**Scope:**
- Nightly cron (Supabase scheduled edge function) checks jobs with bid due date
  within 48 hours
- For each such job, find all approved subs who viewed the job but haven't yet
  submitted a bid
- Email them: *"Reminder: bids for [job title] are due [date/time]. Submit →"*
- Also emails admins if bid count is unusually low (< 3 bids on a public job)

**Rough effort:** 3-4 hours

**Dependencies:** Resend wired

---

# P2 — Nice-to-have, competitive differentiation

## 9. Admin analytics dashboard

**Why deferred:** need real usage data before there's anything to analyze.

**When to build:** after ~3 months of real portal use.

**Scope:**
- New "Analytics" admin tab
- Metrics per period (weekly/monthly/quarterly):
  - Jobs posted
  - Total bids received
  - Average bids per job
  - Bid response rate (bids ÷ subs invited or viewing)
  - Time-to-first-bid (median)
  - Time-to-decision (median)
  - Win/loss ratio for GrayCo
  - Estimate accuracy (final contract $ vs original estimate)
- Per-sub stats:
  - Bids submitted / accepted / win rate
  - Average bid time (days between view and submission)
  - Most active trades
- Charts using Recharts (already available in the artifact environment)

**Rough effort:** 8-12 hours

**Dependencies:** enough data to be meaningful (~3 months, ~20+ jobs)

---

## 10. Sub bid history export

**Why deferred:** the sub stats panel already shows summary numbers. Full export is
a next-level ask.

**When to build:** when a sub asks for it.

**Scope:**
- On the sub's My Bids tab, add "Export My History" button
- Downloads CSV with columns: job title, address, bid date, bid amount, status
  (won/lost/pending), acceptance date, notes
- Useful for their own tax/business records

**Rough effort:** 1-2 hours

**Dependencies:** none

---

## 11. Bulk plan upload with folder structure

**Why deferred:** current upload is one-file-at-a-time. Fine for most jobs.

**When to build:** when a job has 50+ plan sheets and this becomes painful.

**Scope:**
- Support ZIP upload — auto-extract, preserve folder structure in the display
- Show plans in a collapsible tree (Architectural, Structural, MEP, etc.)
- Bulk-download a subset (checkboxes + "download selected as ZIP")

**Rough effort:** 4-6 hours

**Dependencies:** Supabase Pro (5 GB per file)

---

## 12. DWG / AutoCAD file support

**Why deferred:** rendering DWG in the browser requires either an Autodesk cloud
API (paid, complex) or a JavaScript viewer library (heavy, limited). Different
project entirely.

**When to build:** only if multiple subs specifically request it AND you're
willing to invest in Autodesk's paid API.

**Scope:**
- Autodesk Platform Services (formerly Forge) API integration
- Upload DWG → server converts to viewable format → renders in the portal
- Same measure/takeoff tools work on top of it (in theory)

**Rough effort:** 15-25 hours + ongoing Autodesk API costs (~$0.05-$0.20 per file
translation)

**Dependencies:**
- Autodesk Platform Services account
- Server-side processing (Supabase edge function or dedicated backend)

**Alternative:** don't build. Ask subs to convert DWG to PDF before upload —
takes them 30 seconds in AutoCAD, saves you a big engineering investment.

---

## 13. In-portal messaging between admin and subs

**Why deferred:** email covers this today. Portal-native messaging is a bigger
lift than it seems (notification handling, unread counts, threading).

**When to build:** if email volume becomes unmanageable AND you want a single
audit trail per job.

**Scope:**
- Per-job messages tab (admin + all subs who bid on it)
- Threading, unread counts, @mentions to specific people
- Email notification when a message is posted
- Read receipts

**Rough effort:** 15-20 hours

**Dependencies:** Resend wired, Supabase realtime enabled

---

## 14. Multi-office / multi-region support

**Why deferred:** GrayCo is one office in Memphis metro right now.

**When to build:** if GrayCo expands to Nashville, Little Rock, Birmingham, etc.

**Scope:**
- "Region" or "Office" field on jobs
- Subs can filter jobs by region
- PMs are scoped to their office
- Analytics broken out by region

**Rough effort:** 6-10 hours

**Dependencies:** actual expansion

---

# Deferred design/UX polish

## 15. Custom email templates with drag-drop editor
- Admin-editable email templates in the portal itself
- Preview before sending
- ~6 hours after Resend is wired

## 16. Sub company logo upload
- Sub can upload their company logo, shows on their bid cards
- ~2 hours

## 17. Dark mode
- Not a real ask yet, but easy once Tailwind or CSS vars are properly used
- ~3-4 hours

## 18. Mobile-native app
- Currently the portal is a responsive web app that works on mobile
- Native (React Native) would give push notifications, camera access for on-site photos
- Big project — only if strong signal

---

# Anti-features (things we've discussed and decided NOT to build)

- **Auto-logout after idle** — explicitly decided against. Subs typing long bids
  should never be interrupted.
- **Corporate SSO (Google/Microsoft)** — overkill for a subcontractor portal;
  simple username/password is what subs expect.
- **In-portal document e-signature** — DocuSign/HelloSign already do this;
  linking out is fine.
- **AI-powered bid recommendations** — the AI plan analysis is already useful.
  Suggesting bid amounts crosses into legal territory and would erode trust.

---

# Notes for future build sessions

- Every new feature should keep the "no timeout" principle — nothing kicks users out
- Every new feature must work in both English and Spanish (add to both `T.en` and `T.es`)
- Sub-facing UI must never expose competitor names or amounts unless admin
  explicitly enabled that per-job
- PO Number remains the shared merge key with the CRM — don't build features that
  bypass or duplicate it
- Match the design system: Inter font, navy `#140665`, gold `#D4A017`, cream
  `#FBFAF7`, 10-16px corners, soft shadows over hard borders
- Wesley builds all the software; Nick handles CRM data model decisions
