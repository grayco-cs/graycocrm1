/* ============================================================================
   automations.js: ONE list of everything the CRM does by itself, and ONE switch per item (patch AUTOPANEL)

   Owner (11/02): "make sure nothing is automatic in my CRM until I tell it to be auto, I have a lot of stuff to add,
   fix and test this week."

   1. THE LIST (LIST below). Every automation, server or page, with a key, a plain name, what it does, its effect
      (A = sends to customers / subs / GCs / the public, B = staff only, C = creates or changes records,
      D = read-only, sync or housekeeping), `critical` (safety, lead intake, backups: shown with a lock, a confirm to
      turn off) and `defaultOn`.
        ON by default: safety (missed-call text-back, call chain / emergency line, on-call paging + escalation, staff
        text alerts), lead intake (website, lead-intake, partner API, CallRail, bids@ / leads@ / claims@, money intake),
        sync and backups (backups, CompanyCam read / link / photos, mail indexing), staff-only alerts, CUSTQUIET's 7 AM
        release of items people already approved, and posting already-approved scheduled posts.
        Everything else that sends to customers / subs / GCs (A) or creates / changes records (C) is OFF by default.
   2. THE SWITCHES: gc_kv "gc_automations" = { <key>: true | false, _log: [{ key, on, by, at }] }. A key that is not
      there uses its default. Only admins change it (netlify/functions/automations.js checks; docs/automation-pause.sql
      makes the row admin-write in the database too).
   3. ONE CHECK. Server: `await isOn(key)` at the top of each part (cached 30 s per function instance; when the row
      cannot be read every key uses its default, so A / C items stay OFF). Page: `window._gcAutoOn(key)` (same rule,
      the row is read through the automations function). When OFF the part does nothing and records
      "held: would have done N" (count + a short sample) in gc_kv "gc_auto_held" — nothing is queued to go later.
   4. "Turn on everything I had before" = every key ON (how the CRM ran before this panel).

   This file is copied word for word into index.html (window._gcAutoReg); the server-only part below is never called
   on the page.
   ============================================================================ */
(function(root){
'use strict';
var KEY = 'gc_automations', HELD_KEY = 'gc_auto_held';
var GROUPS = [
  ['cust', 'Customer sends', 'E-mails, texts, portal posts and pushes to customers, GCs, adjusters or the public'],
  ['sub', 'Sub sends', 'Texts and e-mails to subcontractors'],
  ['rec', 'Record changes', 'Creates or changes jobs, invoices, expenses, prices, leads or approvals by itself'],
  ['staff', 'Staff alerts', 'Only tells GrayCo staff (e-mail, push, text, To-Do)'],
  ['safety', 'Safety', 'Missed calls, emergencies, on-call — kept ON'],
  ['sync', 'Sync / backups / lead intake', 'Brings leads and data in, keeps copies safe']
];
/* [key, group, effect, critical, defaultOn, where, name, what it does] */
var ROWS = [
  /* ── safety ── */
  ['missed_call_textback', 'safety', 'A', 1, 1, 'server', 'Missed-call text-back', 'A missed call gets a text back at once and becomes a lead.'],
  ['call_chain', 'safety', 'B', 1, 1, 'server', 'Call menu / call chain', 'Rings staff in the 📞 Call order, screens robocalls, blocks blocked numbers.'],
  ['emergency_line', 'safety', 'B', 1, 1, 'server', 'Emergency line', 'Emergency words or "press 1" phone and text staff until someone answers.'],
  ['oncall_paging', 'safety', 'B', 1, 1, 'server', 'On-call paging + escalation', 'An after-hours emergency pages the on-call person; nobody accepts → the next person, then all admins.'],
  ['staff_text_alerts', 'safety', 'B', 1, 1, 'server', 'Staff text alerts', 'Text alerts to staff cells (new lead, emergency, missed call); replies relayed.'],
  /* ── lead intake, sync, backups ── */
  ['website_intake', 'sync', 'C', 1, 1, 'server', 'Website leads', 'Website forms and the roof price widget go into the Lead Inbox.'],
  ['lead_intake', 'sync', 'C', 1, 1, 'server', 'Partner lead intake (Roof Ignite …)', 'Leads posted by lead partners come into the CRM.'],
  ['partner_api', 'sync', 'C', 1, 1, 'server', 'Partner API', 'Partners post leads, bids and jobs.'],
  ['callrail', 'sync', 'C', 1, 1, 'server', 'CallRail calls', 'Logs tracking-number calls; a first-time caller becomes a lead.'],
  ['bids_inbox', 'sync', 'C', 1, 1, 'server', 'bids@ / leads@ inbox', 'Bid invites and lead e-mails become leads; GC replies and sub bids are filed.'],
  ['claims_inbox', 'sync', 'C', 1, 1, 'server', 'claims@ inbox', 'Claim e-mails are filed on the claim; a new claim becomes an Insurance lead.'],
  ['money_intake', 'sync', 'C', 1, 1, 'server', 'Money intake (bills@, invoices@, receipts@, QuickBooks)', 'Money e-mails and QuickBooks events go into the review list (nothing is booked by this).'],
  ['backups', 'sync', 'D', 1, 1, 'both', 'Backups', 'Nightly cloud backup (30 nights) and the CRM’s own snapshots.'],
  ['cloud_sync', 'sync', 'D', 1, 1, 'page', 'Cloud sync', 'Keeps every open CRM in step with the cloud. Always on: the CRM cannot work without it.', 1],
  ['companycam_read', 'sync', 'D', 0, 1, 'server', 'CompanyCam read / link', 'Reads changed CompanyCam projects and ties them to existing jobs; review list.'],
  ['companycam_photos', 'sync', 'D', 0, 1, 'server', 'CompanyCam photo copy / indexing', 'Indexes every CompanyCam photo and copies it into GrayCo storage.'],
  ['mail_index', 'sync', 'D', 0, 1, 'server', 'Mail indexing', 'Gmail metadata into the admins’ e-mail index.'],
  ['gdocs_sync', 'sync', 'D', 0, 1, 'server', 'Google Docs list', 'The team’s new Google Docs show in the CRM (no e-mail).'],
  ['photo_tags', 'sync', 'D', 0, 1, 'server', 'Photo AI tags', 'AI tags on new photos (read-only).'],
  ['ads_insights', 'sync', 'D', 0, 1, 'server', 'Ads and social numbers', 'Google Ads, Meta and social likes / reach / clicks are read in.'],
  ['text_thread_copy', 'sync', 'D', 0, 1, 'server', 'Texted lead → job conversation copy', 'A texted lead that became a job gets its text conversation and notes copied onto the job.'],
  /* ── staff alerts ── */
  ['bid_alerts_staff', 'staff', 'B', 0, 1, 'server', 'Bid-due and speed-to-lead alerts', '"Bid due in 1 h / today / tomorrow", "assign this lead", "reach out", RoofScout lead mail.'],
  ['data_check', 'staff', 'B', 0, 1, 'server', 'Nightly data check', 'Keeps ONE Office To-Do of missing data; 7 AM alert to admins and office.'],
  ['company_docs_expiry', 'staff', 'B', 0, 1, 'server', 'Company documents expiring', 'COI, W-9 or licence expiring: admins e-mailed and an Office To-Do.'],
  ['field_dispatch', 'staff', 'B', 0, 1, 'server', '7 AM field dispatch', 'E-mail and push to each superintendent with today’s jobs.'],
  ['field_staff_nudges', 'staff', 'B', 0, 1, 'server', 'Mortgage-check and warranty-ticket nudges', 'The PM is nudged about a stuck mortgage check; admins about a ticket unanswered 48 h.'],
  ['x10_vehicle', 'staff', 'B', 0, 1, 'server', 'Vehicle reminders', 'Oil, registration and insurance reminders to the driver.'],
  ['x10_mydata', 'staff', 'B', 0, 1, 'server', '"My data" monthly e-mails', 'Each person’s own monthly numbers.'],
  ['crm_health', 'staff', 'B', 0, 1, 'server', 'CRM health + equipment reminders', 'Mitigation equipment-on-site To-Do; health e-mail on the 1st.'],
  ['est_price_watch', 'staff', 'B', 0, 1, 'server', 'Estimate price watch', 'E-mail to the estimator when material prices on open estimates went up more than 5 %.'],
  ['daily_plan', 'staff', 'B', 0, 1, 'server', 'Today’s plan', '"📅 Today’s plan" To-Do per person; 6 AM e-mail for those who opted in.'],
  ['sub_unconfirmed_pm', 'staff', 'B', 0, 1, 'server', '"Sub hasn’t confirmed" to the PM', 'Tells the PM a sub has not confirmed tomorrow’s start.'],
  ['mail_followup', 'staff', 'B', 0, 1, 'server', '"No reply — follow up" To-Dos', 'Office To-Dos for sent mail nobody answered.'],
  ['payroll_check', 'staff', 'B', 0, 1, 'server', 'Thursday payroll check', 'Is Friday’s payroll draft there? → staff.'],
  ['approvals_digest', 'staff', 'B', 0, 1, 'server', 'Approvals digest, scorecard, noon nudge', 'Approvals digest, owner scorecard, noon "not opened" push.'],
  ['tax_alerts', 'staff', 'B', 0, 1, 'server', 'Tax deadline alerts', 'Tax deadlines 7 days before, on the day and when overdue.'],
  ['mkt_internal_reports', 'staff', 'B', 0, 1, 'server', 'Marketing rank + report (staff)', 'Google ranking (Mon) and the monthly marketing report to admins.'],
  ['office_todos', 'staff', 'B', 0, 1, 'both', 'Office To-Do builders', 'Friday check task, supplier-bills task, lien-deadline and unsigned-CO To-Dos.'],
  /* ── customer sends (A) ── */
  ['cust_release', 'cust', 'A', 0, 1, 'server', 'CUSTQUIET 7 AM release', 'At 7 AM sends what was held overnight — only items a person already approved or sent.'],
  ['scheduled_posts', 'cust', 'A', 0, 1, 'server', 'Approved scheduled posts', 'Posts approved social posts and approved news@ campaigns at their scheduled time.'],
  ['invoice_email_queue', 'cust', 'C', 0, 0, 'server', 'Invoice e-mail queueing', 'Every new client invoice gets an "Invoice … to customer" item on ✅ Approvals.'],
  ['final_invoice_reminders', 'cust', 'A', 0, 0, 'server', 'Final-invoice e-mail + 15-day reminders', 'Final invoice e-mail, then a reminder every 15 days while unpaid (later ones go by themselves).'],
  ['portal_docs_notice', 'cust', 'A', 0, 0, 'server', '"Something new in your portal" e-mails', 'Tells the customer new papers are in the portal.'],
  ['estimate_followups', 'cust', 'A', 0, 0, 'server', 'Estimate follow-ups', 'Estimate nudges on day 2, 5 and 10 (only the first needs approval).'],
  ['customer_app_push', 'cust', 'A', 0, 0, 'server', 'Customer app pushes (held overnight)', 'Portal-app push notifications held overnight go out.'],
  ['weekly_update', 'cust', 'C', 0, 0, 'server', 'Weekly customer update queueing', 'Friday: an AI-drafted weekly update per active portal job goes on ✅ Approvals.'],
  ['bid_result_emails', 'cust', 'A', 0, 0, 'server', 'Bid-result e-mails to GCs', '7 days after a bid is due, e-mails the GC asking for the result.'],
  ['winback', 'cust', 'C', 0, 0, 'server', 'Lost-lead win-back', 'Leads lost 6 / 12 months ago get an approval item; 30–90 days get a draft.'],
  ['inspection_offer', 'cust', 'C', 0, 0, 'server', 'Free roof inspection offer', 'From 15 Mar and 15 Sep: one approval item listing past customers.'],
  ['social_drafts', 'cust', 'C', 0, 0, 'server', 'Before / after social drafts', 'Daily before/after social post drafts for ✅ Approvals.'],
  ['mkt_autopilot', 'cust', 'C', 0, 0, 'server', 'Marketing autopilot', 'Weekly posts, monthly e-mail, door-hanger lists, review replies, Sunday plan.'],
  ['adjuster_followups', 'cust', 'A', 0, 0, 'server', 'Adjuster closeout follow-ups', 'Follow-up to the adjuster every 7 days after the first packet was approved.'],
  ['one_year_note', 'cust', 'A', 0, 0, 'server', 'One-year notes', 'A note one year after completion (approved once, then by itself).'],
  ['maint_plans', 'cust', 'C', 0, 0, 'server', 'Maintenance plan queueing', 'Visit To-Dos, the yearly plan invoice on ✅ Approvals, "Offer a plan" To-Dos.'],
  ['newsletter_drafts', 'cust', 'C', 0, 0, 'server', 'Newsletter drafts + thank-you To-Dos', 'Monthly newsletter draft; December and milestone thank-you To-Dos.'],
  ['event_reminders', 'cust', 'A', 0, 0, 'server', 'Free roof check event reminders', 'Reminder the day before an event.'],
  ['monthly_statements', 'cust', 'C', 0, 0, 'server', 'Monthly statement queueing', 'On the 1st every customer with a balance gets a statement on ✅ Approvals.'],
  ['warranty_checkup_offer', 'cust', 'C', 0, 0, 'server', 'Warranty check-up offer', 'One approval item per day offering a check-up.'],
  ['we_need_reminders', 'cust', 'A', 0, 0, 'server', '"We need from you" reminders', 'Day 3 reminder on Approvals; day 7 sent by itself.'],
  ['mkt_report_external', 'cust', 'A', 0, 0, 'server', 'Marketing report to the agency', 'Monthly marketing report to the outside agency and the report list.'],
  ['referral_credits', 'cust', 'C', 0, 0, 'server', 'Referral credit queueing', 'A referred job’s first payment puts a credit proposal on ✅ Approvals.'],
  ['ar_reminders', 'cust', 'C', 0, 0, 'server', 'Past-due reminders (AUTO-AR)', 'Past-due reminders put on ✅ Approvals.'],
  ['text_auto_answers', 'cust', 'A', 0, 0, 'server', 'Text auto-answers', 'Automatic replies to customers’ texts (rules, hours). STOP / HELP always answer.'],
  ['portal_gate_queue', 'cust', 'C', 0, 0, 'server', 'New portal items → Approvals', 'New portal papers / photos / certificates are put on ✅ Approvals before the customer sees them. OFF: they stay hidden, not queued.'],
  ['portal_invite_email', 'cust', 'C', 0, 0, 'both', 'New-job portal link e-mail', 'Every new job’s portal link e-mail is queued.'],
  ['appt_confirmations', 'cust', 'A', 0, 0, 'page', 'Appointment confirmations', 'Confirmation on a schedule change, reminder at 4 PM the day before.'],
  ['thank_you_queue', 'cust', 'C', 0, 0, 'page', 'Job-complete thank-you', 'Fully paid → thank-you on ✅ Approvals; commission unlocked flag.'],
  ['proposal_maker', 'cust', 'C', 0, 0, 'page', 'Proposal maker', 'Makes the proposal PDF for every finished estimate → ✅ Approvals.'],
  /* ── sub sends (A) ── */
  ['sub_schedule_texts', 'sub', 'A', 0, 0, 'server', 'Sub schedule texts', '6 PM the evening before and about 1 h before each start.'],
  ['sub_firstday_text', 'sub', 'A', 0, 0, 'server', 'Sub first-day text', 'A sub’s first-day text with the portal link.'],
  ['lien_waiver_requests', 'sub', 'A', 0, 0, 'both', 'Lien waiver requests', 'Waiver requests to subs (first needs approval, later ones go by themselves).'],
  ['coi_requests', 'sub', 'C', 0, 0, 'server', 'COI renewal requests', 'Approval item per sub whose insurance expires in 30 / 7 / 0 days.'],
  ['w9_requests', 'sub', 'C', 0, 0, 'server', 'W-9 requests', 'W-9 requests put on ✅ Approvals.'],
  /* ── record changes (C) ── */
  ['price_index_monthly', 'rec', 'C', 0, 0, 'server', 'Monthly price update (PPI)', 'On the 3rd, moves every Products price by the national Producer Price Index change.'],
  ['companycam_new_jobs', 'rec', 'C', 0, 0, 'both', 'CompanyCam "make new jobs"', 'A new 2026+ CompanyCam project becomes a Bidding job with its PM. This is how PM jobs arrive from CompanyCam — while it is OFF, new projects wait on the review list.'],
  ['approval_escalation', 'rec', 'C', 0, 0, 'server', 'Approval escalation', 'An admin-step approval waiting 24 h becomes approvable by the office.'],
  ['lead_auto_assign', 'rec', 'C', 0, 0, 'both', '5 PM lead auto-assign', 'A held lead is assigned to the suggested person at 5 PM. OFF: it stays "Suggested" until an admin acts.'],
  ['bid_watch', 'rec', 'C', 0, 0, 'server', 'Public bid watch', 'Reads public bid listings; makes CRM leads and draft bid-portal jobs.'],
  ['bid_portal_drafts', 'rec', 'C', 0, 0, 'server', 'Bid-portal drafts', 'Creates the draft bid-portal jobs that waited for the portal.'],
  ['x10_code_wipe', 'rec', 'C', 0, 0, 'server', 'Access-code wipe', 'Deletes the stored door / gate codes of closed jobs.'],
  ['invoice_autopost', 'rec', 'C', 0, 0, 'page', 'Invoice 1-day auto-post', 'A client draft waiting 24 h is approved by itself → sent (shows in the portal).'],
  ['expense_autopost', 'rec', 'C', 0, 0, 'page', 'Expense 5-day auto-post', 'Matched expenses are posted to the job P&L after 5 days; unmatched ones escalated.'],
  ['progress_autodraw', 'rec', 'C', 0, 0, 'page', 'Progress-slider auto-draw', 'Dragging progress past a draw milestone makes a draw invoice.'],
  ['cc_pct_sync', 'rec', 'C', 0, 0, 'page', 'CompanyCam % -> job %', 'Every 2 minutes copies the progress % read from CompanyCam notes into the job % of each active job (a draw then still needs "Progress-slider auto-draw"). OFF: the job % is left alone.'],
  ['auto_mark_paid', 'rec', 'C', 0, 0, 'page', 'Invoice auto-mark-paid (amount match)', 'Every 2 minutes marks an open client invoice PAID (and puts it on the books) when a payment recorded on the same job has the same amount. A guess: the payment names no invoice and the match is not saved. OFF: nothing is marked; mark invoices paid by hand.'],
  ['legacy_progress_billing', 'rec', 'C', 0, 0, 'page', 'Legacy progress-billing timer', 'Schedule milestone passed + % reached → a draft client invoice.'],
  ['legacy_autoflag_notes', 'rec', 'C', 0, 0, 'page', 'AUTO-FLAG job notes', 'Writes "⚠️ AUTO-FLAG …", "[PM] …", "🔴 CRITICAL …" lines into job notes.'],
  ['legacy_po_route', 'rec', 'C', 0, 0, 'page', 'Invoice PO auto-route', 'An invoice with a PO and no job gets its job set.'],
  ['job_stages', 'rec', 'C', 0, 0, 'page', 'AUT3 job stages', 'Kickoff (deposit draft, welcome), stage changes, schedule shifts and the % from the schedule, the final invoice at Complete, Certificate of Completion, check-ups. A draw because the % moved also needs "Progress-slider auto-draw" ON.'],
  ['auto_100', 'rec', 'C', 0, 0, 'page', 'Auto-100 %', 'A completed job or a sent final invoice sets progress to 100 %.'],
  ['closeout_autopilot', 'rec', 'C', 0, 0, 'page', 'Closeout autopilot', 'Final invoice fully paid → job completed and archived, warranty certificate, check-up.'],
  ['commission_sweep', 'rec', 'C', 0, 0, 'page', 'Commission sweep', 'A fully collected job gets its commission worked out and a check queued on the pay run.'],
  ['mailed_invoice_booking', 'rec', 'C', 0, 0, 'page', 'E-mailed invoice auto-booking', 'E-mailed sub invoices, supplier bills, receipts and QuickBooks copies are booked by themselves. OFF: they wait in 📥 Needs a job / review.'],
  ['dup_invoice_delete', 'rec', 'C', 0, 0, 'page', 'Duplicate sub invoice / $0 row delete', 'Deletes duplicate sub invoices and $0 rows. OFF: they are only flagged.'],
  ['ms_tax_add', 'rec', 'C', 0, 0, 'page', 'Mississippi tax auto-add', 'Adds 3.5 % MS contractor’s tax to Mississippi estimates.']
];
var LIST = ROWS.map(function(r){ return { key: r[0], group: r[1], effect: r[2], critical: !!r[3], defaultOn: !!r[4], where: r[5], name: r[6], desc: r[7], fixed: !!r[8] }; });
var BY = {}; LIST.forEach(function(a){ BY[a.key] = a; });

function parse(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
/* the switch for one key, from the stored row (missing key = its default; an unknown key = OFF) */
function valueOf(row, key){
  var a = BY[key]; if (!a) return false;
  if (a.fixed) return true;
  var r = parse(row), v = r[key];
  if (v && typeof v === 'object' && typeof v.on === 'boolean') v = v.on;
  return typeof v === 'boolean' ? v : a.defaultOn;
}
function defaults(){ var o = {}; LIST.forEach(function(a){ o[a.key] = a.defaultOn; }); return o; }
/* "Turn on everything I had before": every automation ran before the panel existed */
function before(){ var o = {}; LIST.forEach(function(a){ o[a.key] = true; }); return o; }
function all(row){ var o = {}; LIST.forEach(function(a){ o[a.key] = valueOf(row, a.key); }); return o; }
/* a held record, merged into the gc_auto_held row: { n: times held, since, last, would: last count, sample } */
function heldMerge(heldRow, key, n, sample, nowIso){
  var h = parse(heldRow), e = parse(h[key]);
  var out = Object.assign({}, h);
  out[key] = { n: (+e.n || 0) + 1, since: e.since || nowIso, last: nowIso, would: n == null ? null : +n || 0, total: (+e.total || 0) + (+n || 0),
    sample: (Array.isArray(sample) ? sample : sample == null ? [] : [sample]).slice(0, 3).map(function(x){ return String(x == null ? '' : x).slice(0, 120); }), ran: e.ran || null };
  return out;
}
function ranMerge(heldRow, key, nowIso){
  var h = parse(heldRow), out = Object.assign({}, h);
  out[key] = Object.assign({}, parse(h[key]), { ran: nowIso });
  return out;
}

var API = { V: 1, KEY: KEY, HELD_KEY: HELD_KEY, GROUPS: GROUPS, LIST: LIST, BY: BY, valueOf: valueOf, defaults: defaults, before: before, all: all, heldMerge: heldMerge, ranMerge: ranMerge, parse: parse };

/* ── server only (Netlify functions): read the switches, record "held" / "ran" ── */
if (typeof module !== 'undefined' && module.exports) {
  var CACHE_MS = 30 * 1000, RAN_MS = 10 * 60 * 1000;
  var cache = { at: 0, row: null, ok: false }, ranAt = {}, store = null, chain = Promise.resolve();
  /* one read-modify-write of gc_auto_held at a time in this instance (a held and a ran record never overwrite each other) */
  var serial = function(fn){ var p = chain.then(fn, fn); chain = p.catch(function(){}); return p; };
  var sbUrl = function(){ return String(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); };
  var svc = function(){ return String(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''); };
  var hdr = function(extra){ var k = svc(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); };
  var kv = {
    get: async function(key){
      if (store) return store.get(key);
      if (!svc()) throw new Error('no SUPABASE_SERVICE_KEY');
      var r = await globalThis.fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: hdr() });
      if (!r || !r.ok) throw new Error('gc_kv answered ' + (r && r.status));
      var rows = await r.json(); return Array.isArray(rows) && rows[0] ? rows[0].value : null;
    },
    put: async function(key, value){
      if (store) return store.put(key, value);
      if (!svc()) throw new Error('no SUPABASE_SERVICE_KEY');
      var r = await globalThis.fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: hdr({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
      if (!r || !r.ok) throw new Error('gc_kv write answered ' + (r && r.status));
      return true;
    }
  };
  var readRow = async function(fresh){
    if (!fresh && cache.ok && Date.now() - cache.at < CACHE_MS) return cache.row;
    try { var v = await kv.get(KEY); cache = { at: Date.now(), row: parse(v), ok: true }; }
    catch (e) { cache = { at: Date.now(), row: {}, ok: false }; }   /* unreadable → every key uses its default (A / C stay OFF) */
    return cache.row;
  };
  API.isOn = async function(key, opts){
    var on = valueOf(await readRow(opts && opts.fresh), key);
    if (on && !(opts && opts.noRan)) API.ran(key).catch(function(){});
    return on;
  };
  API.row = function(fresh){ return readRow(fresh); };
  /* "held: would have done N" — n = how many it would have done (null when unknown), sample = a few short labels */
  API.held = async function(key, n, sample){
    var now = new Date().toISOString();
    try { console.log('[automations] held ' + key + ': would have done ' + (n == null ? '?' : n) + (sample && sample.length ? ' (' + [].concat(sample).slice(0, 3).join('; ').slice(0, 200) + ')' : '')); } catch (e) {}
    try { await serial(async function(){ var cur = await kv.get(HELD_KEY); await kv.put(HELD_KEY, heldMerge(cur, key, n, sample, now)); }); } catch (e) {}
    return { held: key, would: n == null ? null : n };
  };
  API.ran = async function(key){
    if (ranAt[key] && Date.now() - ranAt[key] < RAN_MS) return;
    ranAt[key] = Date.now();
    try { await serial(async function(){ var cur = await kv.get(HELD_KEY); await kv.put(HELD_KEY, ranMerge(cur, key, new Date().toISOString())); }); } catch (e) {}
  };
  /* a part that is OFF: record it and say so in one line — `if (await AUTO.off('key', () => count)) return …` style */
  API.gate = async function(key, count){
    if (await API.isOn(key)) return null;
    var n = null, sample = [];
    if (typeof count === 'function') { try { var c = await count(); if (c && typeof c === 'object') { n = c.n; sample = c.sample || []; } else n = c; } catch (e) {} }
    else if (count != null) n = count;
    return API.held(key, n, sample);
  };
  API._t = { reset: function(){ cache = { at: 0, row: null, ok: false }; ranAt = {}; }, setStore: function(s){ store = s; cache = { at: 0, row: null, ok: false }; ranAt = {}; } };
  module.exports = API;
} else root._gcAutoReg = API;
})(this);
