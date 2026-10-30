/* patch OFFFEAT — the server side of the office features (_lib/offfeat.js, _lib/lien-deadlines.js, care11 coiRun,
   lien.js viaApproval, office-board.js). node tools/tests/test_OFFFEAT_fn.js — every store is in memory, nothing is sent.
   Checks: one payment reminder per invoice through Approvals; refusals (paid / automations off / no e-mail);
   unsigned change orders + one nudge each; the COI expiry request queued once (never e-mailed directly); the W-9
   request once; the lien switch off by default and the deadlines when on (TN / AR / MS); the daily To-Dos; the
   editable waiver wording; ⏸ data-entry mode; the esbuild bundle of each function; the page's copy of the rules. */
'use strict';
const assert = require('assert'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '../..'), FN = path.join(ROOT, 'netlify/functions');
process.env.SUPABASE_SERVICE_KEY = 'test-key'; process.env.RESEND_API_KEY = 're_test'; process.env.CRM_URL = 'https://crm.test';
let pass = 0, fail = 0;
function ok(c, m){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } }
/* no network at all: any fetch is recorded and refused */
const FETCHES = [];
globalThis.fetch = async function(u, o){ FETCHES.push({ u: String(u), body: o && o.body }); return { ok: false, status: 599, json: async () => ({}), text: async () => '' }; };

const NOW = Date.parse('2026-10-30T17:00:00Z');   /* 12 PM Central, Oct 30 2026 */
const portal = require(path.join(FN, 'portal.js'));
const CORE = portal._core;
const BI = require(path.join(FN, 'bid-inbox.js'))._lib;
const PAUSE = require(path.join(FN, '_lib/pause.js'));
const OFF = require(path.join(FN, '_lib/offfeat.js'));
const LD = require(path.join(FN, '_lib/lien-deadlines.js'));
const CARE = require(path.join(FN, '_lib/care11.js'));
const LIEN = require(path.join(FN, '_lib/lien.js'));

let KV, SVC, DATA, PAUSED = false;
const clone = v => JSON.parse(JSON.stringify(v));
function rig(data){
  DATA = data; KV = { gc_approval_queue: [], gc_office_tasks: [], gc_sign_requests: [], gc_lien_waivers: [] }; SVC = {}; PAUSED = false; FETCHES.length = 0;
  Object.assign(CORE, {
    crmData: async () => clone(DATA),
    kvRead: async keys => { const o = {}; keys.forEach(k => { o[k] = k in KV ? clone(KV[k]) : clone(DATA[k]); }); return o; },
    kvListRead: async k => ({ list: clone(KV[k] || []) }),
    kvListUpdate: async (k, fn) => { const l = clone(KV[k] || []); const r = fn(l); if (!r || !r.list) return { ok: true, unchanged: true, result: r && r.result }; KV[k] = r.list; return { ok: true, result: r.result }; },
    queueApproval: async o => { const l = KV.gc_approval_queue; if (l.some(x => x.id === o.id)) return true; const steps = !o.pm ? ['admin'] : ['pm'];
      l.push({ id: o.id, kind: o.kind, title: o.title, jobId: o.pid || '', pm: o.pm ? o.pm.name : '', to: o.to, subject: o.subject, html: o.html, attachments: o.attachments || [], steps: steps, step: steps[0], status: 'waiting', officeOk: o.officeOk === true, createdAt: new Date(NOW).toISOString(), meta: o.meta || {} }); return true; },
    pmOf: (d, p) => p && p.pm ? { name: p.pm, email: 'pat@grayco-cs.com' } : null,
    isOffice: async who => /office/.test(who.role || ''),
    gcStaffAuth: async ev => ev.who ? Object.assign({ ok: true }, ev.who) : { ok: false, statusCode: 401, error: 'Sign in' }
  });
  BI.kvGet = async k => SVC[k] == null ? null : clone(SVC[k]);
  BI.kvCas = async (k, f) => { const nv = f(SVC[k] == null ? null : clone(SVC[k])); if (nv !== undefined) SVC[k] = nv; return { ok: true }; };
  OFF._D.kvGet = BI.kvGet; OFF._D.kvCas = BI.kvCas; OFF._D.kvPut = async (k, v) => { KV[k] = clone(v); return true; };
  OFF._D.paused = async () => PAUSED; OFF._D.now = () => NOW;
  PAUSE.isPaused = async () => PAUSED;
}
const aq = kind => KV.gc_approval_queue.filter(x => !kind || x.kind === kind);
const PROJ = [
  { id: 'P1', name: 'Smith Roof', client: 'Ann Smith', clientEmail: 'ann@example.com', pm: 'Pat PM', address: '12 Oak St, Memphis, TN 38117', status: 'Active', type: 'Residential', startDate: '2026-08-03' },
  { id: 'P2', name: 'Lee Deck', client: 'Bo Lee', clientEmail: '', address: '5 Elm, Southaven, MS 38671', status: 'Active', type: 'Residential' },
  { id: 'P3', name: 'Mall TI', client: 'A & B Construction', clientEmail: 'ap@ab.example', gcJob: true, address: '1 Main, Little Rock, AR 72201', status: 'Active', type: 'Commercial', startDate: '2026-06-15', auto: { paymentReminders: false } }
];
const INVS = [
  { id: 'I1', pid: 'P1', type: 'client', status: 'overdue', amt: 10000, due: '2026-09-20', invNum: '1001' },
  { id: 'I2', pid: 'P1', type: 'client', status: 'paid', amt: 5000, due: '2026-09-01', paidDate: '2026-09-05', invNum: '1000' },
  { id: 'I3', pid: 'P2', type: 'client', status: 'sent', amt: 2500, due: '2026-11-10', invNum: '1002' },
  { id: 'I4', pid: 'P3', type: 'client', status: 'overdue', amt: 40000, due: '2026-08-01', invNum: '1003' },
  { id: 'S1', pid: 'P1', type: 'sub', status: 'approved', amt: 3000, sub: 'Ace Gutters', subId: 'V1', date: '2026-10-01', _pmApproved: true }
];
const VENDORS = [
  { id: 'V1', name: 'Ace Gutters', isSub: true, email: 'ace@example.com', insExp: '2026-11-29', w9: true },
  { id: 'V2', name: 'Bob Paint', isSub: true, email: 'bob@example.com', insExp: '2027-06-01', w9: false },
  { id: 'V3', name: 'Cal Tile', isSub: true, email: 'cal@example.com', insExp: '2027-06-01', w9: false },
  { id: 'V4', name: 'No Mail Framing', isSub: true, insExp: '2026-11-10', w9: false }
];
const base = () => ({ projects: clone(PROJ), invs: clone(INVS), vendors: clone(VENDORS), subs: [], customers: [], users: [] });
const WHO = { email: 'office@grayco-cs.com', role: 'office', name: 'Brittany' };

(async function(){
  console.log('— (2) Collections: payment reminder through Approvals');
  rig(base());
  let r = await OFF.remind({ invoiceId: 'I1' }, WHO);
  ok(r.status === 200 && r.out.queued, 'Send payment reminder → queued (' + JSON.stringify(r.out).slice(0, 80) + ')');
  let it = aq('payment_reminder')[0];
  ok(it && it.kind === 'payment_reminder' && it.to === 'ann@example.com' && it.officeOk === true && it.step === 'admin', 'the existing kind payment_reminder, to the job’s customer, the office may approve');
  ok(it && it.meta.invoiceId === 'I1' && it.attachments[0].invoiceId === 'I1' && /40 days late/.test(it.title), 'invoice id, PDF attachment and days late (' + (it && it.title) + ')');
  ok(it && /Balance due: \$10,000\.00/.test(it.html) && /1\.5% per month/.test(it.html), 'the auto-ar letter (balance, the one late-fee wording)');
  r = await OFF.remind({ invoiceId: 'I1' }, WHO);
  ok(r.out.already === true && aq('payment_reminder').length === 1, 'a second press → "already waiting", still ONE reminder for the invoice');
  KV.gc_approval_queue[0].status = 'sent'; KV.gc_approval_queue[0].sentAt = '2026-10-30T18:00:00Z';
  r = await OFF.remind({ invoiceId: 'I1' }, WHO);
  ok(r.out.queued && aq('payment_reminder').length === 2, 'once the first one went out, a new reminder may be queued');
  r = await OFF.remind({ invoiceId: 'I2' }, WHO); ok(r.out.ok === false && r.out.paid, 'a paid invoice is refused');
  r = await OFF.remind({ invoiceId: 'I4' }, WHO); ok(r.out.ok === false && r.out.off === 'paymentReminders', '⏰ Payment reminders off on the job → refused');
  r = await OFF.remind({ invoiceId: 'I3' }, WHO); ok(r.out.ok === false && r.out.noEmail, 'no customer e-mail → refused with the reason');
  r = await OFF.remind({ invoiceId: 'S1' }, WHO); ok(r.status === 400, 'a sub invoice is refused');
  /* an automatic reminder already waiting counts as the open one */
  rig(base()); KV.gc_approval_queue.push({ id: 'appr_arrem_I1_30', kind: 'payment_reminder', status: 'waiting', meta: { invoiceId: 'I1' } });
  r = await OFF.remind({ invoiceId: 'I1' }, WHO); ok(r.out.already && aq('payment_reminder').length === 1, 'an automatic 30-day reminder waiting = the open reminder');
  ok(FETCHES.filter(f => /resend/.test(f.u)).length === 0, 'nothing e-mailed directly');

  console.log('— (7) Unsigned change orders + nudge');
  rig(base());
  KV.gc_sign_requests = [
    { id: 'sr_P1_change_order_CO1', pid: 'P1', kind: 'change_order', refId: 'CO1', title: 'Change order — gutters', amount: 1200, status: 'pending', createdAt: '2026-10-10T10:00:00Z' },
    { id: 'sr_P1_change_order_CO2', pid: 'P1', kind: 'change_order', refId: 'CO2', title: 'Change order — paint', amount: 300, status: 'pending', createdAt: '2026-10-29T10:00:00Z' },
    { id: 'sr_P1_change_order_CO3', pid: 'P1', kind: 'change_order', refId: 'CO3', title: 'Change order — signed one', amount: 50, status: 'signed' },
    { id: 'sr_P1_estimate_E1', pid: 'P1', kind: 'estimate', status: 'pending' }
  ];
  KV.gc_approval_queue.push({ id: 'appr_sign_sr_P1_change_order_CO1', kind: 'sign_change_order', status: 'sent', sentAt: '2026-10-12T15:00:00Z' },
    { id: 'appr_sign_sr_P1_change_order_CO2', kind: 'sign_change_order', status: 'waiting' },
    { id: 'appr_gcp_co_GCO9_1', kind: 'gcp_co_contract', status: 'sent', to: 'pm@ab.example', createdAt: '2026-10-01T10:00:00Z' });
  SVC.gc_gcp_jobs = { P3: { cos: [{ id: 'GCO9', number: '4', title: 'Extra framing', amount: 8000, status: 'sent', sentAt: '2026-10-02T10:00:00Z' }, { id: 'GCO8', number: '3', status: 'signed', signedAt: '2026-09-01' }] } };
  let L1 = await OFF.cos({});
  ok(L1.length === 3, 'three unsigned change orders (2 customer, 1 GC); signed ones and estimates left out (' + L1.map(x => x.ref).join(', ') + ')');
  const c1 = L1.find(x => x.ref === 'sr:sr_P1_change_order_CO1');
  ok(c1 && c1.days === 18 && c1.sentAt.slice(0, 10) === '2026-10-12', 'days waiting counted from when its e-mail went out (' + (c1 && c1.days) + ')');
  ok(L1.find(x => x.ref === 'sr:sr_P1_change_order_CO2').days == null, 'one whose e-mail still waits on Approvals has no days');
  ok((await OFF.cos({ pid: 'P3' })).length === 1, 'per job');
  r = await OFF.nudge({ ref: 'sr:sr_P1_change_order_CO1' }, WHO);
  it = aq('sign_co_nudge')[0];
  ok(r.out.queued && it && it.to === 'ann@example.com' && it.step === 'pm' && it.officeOk && /\{\{PORTAL_LINK\}\}/.test(it.html), 'Nudge → sign_co_nudge to the customer with the portal link, PM step (office may take it)');
  ok(it && !/sub(contractor)?s?\b.*portal|sub portal/i.test(it.html), 'the nudge does not mention subs or a sub portal');
  r = await OFF.nudge({ ref: 'sr:sr_P1_change_order_CO1' }, WHO);
  ok(r.out.already && aq('sign_co_nudge').length === 1, 'one open nudge per change order');
  r = await OFF.nudge({ ref: 'sr:sr_P1_change_order_CO2' }, WHO); ok(r.out.notSent, 'not sent yet → no nudge');
  r = await OFF.nudge({ ref: 'gc:P3:GCO9' }, WHO);
  it = aq('gcp_co_nudge')[0];
  ok(r.out.queued && it && it.to === 'pm@ab.example' && it.meta.gcp === 'nudge' && /\{\{GC_PORTAL_LINK\}\}/.test(it.html), 'a GC change order → gcp_co_nudge to the GC contact, GC portal link');
  L1 = await OFF.cos({}); ok(L1.find(x => x.ref === 'gc:P3:GCO9').openNudge, 'the list shows the open nudge');

  console.log('— (3) Sub paperwork: COI expiry request queued once, W-9 once');
  rig(base());
  let cr = await CARE.coiRun(NOW);
  const sd = aq('sub_doc_request');
  ok(cr.queued === 1 && sd.length === 1 && sd[0].to === 'ace@example.com' && sd[0].meta.need[0] === 'coi', 'COI running out in 30 days → ONE request on Approvals (' + JSON.stringify(cr) + ')');
  ok(sd[0] && sd[0].officeOk && sd[0].step === 'admin' && /insurance certificate/i.test(sd[0].subject), 'for the office to approve; the COI wording');
  ok(FETCHES.filter(f => /resend/.test(f.u)).length === 0, 'the sub is NOT e-mailed directly any more');
  ok(KV.gc_office_tasks.some(t => /^COI_REQ_V1_2026-11-29$/.test(t.id) && /waits on ✅ Approvals/.test(t.note)), 'the office To-Do says it waits on Approvals');
  cr = await CARE.coiRun(NOW); ok(aq('sub_doc_request').length === 1, 'run again the same day → still one');
  cr = await CARE.coiRun(NOW + 23 * 864e5); ok(aq('sub_doc_request').length === 1 && cr.queued === 1, '7 days out while the first is still waiting → not a second one (one open per sub)');
  PAUSED = true; rig(base()); PAUSED = true; cr = await CARE.coiRun(NOW); ok(cr.dataEntryMode && aq().length === 0, '⏸ data-entry mode → nothing queued');
  rig(base());
  let q = (await OFF.subDoc({ subId: 'V2' }, WHO)).out;
  ok(q.ok && q.queued && q.need.join() === 'w9', 'Request docs (board) → W-9 request for a sub missing it');
  q = (await OFF.subDoc({ subId: 'V2' }, WHO)).out; ok(q.already, 'pressed again → already waiting');
  q = (await OFF.subDoc({ subId: 'V4' }, WHO)).out; ok(q.noEmail, 'no e-mail on the sub → the reason, nothing queued');

  console.log('— (4) Lien deadlines (off by default) and the daily run');
  const p1 = clone(PROJ[0]);
  ok(!LD.on(p1) && LD.reminders(p1, '2026-10-30').length === 0, 'a job without the switch: no deadlines, no reminders');
  p1.lienTrack = { on: true, lastWork: '2026-10-15' };
  let cp = LD.compute(p1, '2026-10-30');
  ok(cp.state === 'TN' && cp.role === 'prime' && cp.residential === true, 'TN from the address, prime, residential');
  const byId = id => cp.items.find(x => x.rule === id);
  ok(byId('TN203') && byId('TN203').due === '2026-08-03', 'TN notice of lien rights by the start date (§ 66-11-203)');
  ok(byId('TN112') && byId('TN112').due === '2027-01-13' && byId('TN112').aim === '2026-12-30', 'TN notice of lien: 90 days after the last work, aim 14 days earlier (§ 66-11-112)');
  ok(byId('TN106') && byId('TN106').due === '2027-10-15', 'TN suit: one year (365 days) after the last work (§ 66-11-106)');
  ok(!byId('TN145'), 'no monthly nonpayment notice for a prime contractor');
  ok(cp.items.every(x => x.lawyer && x.cite) && /not legal advice/i.test(cp.disclaimer), 'every rule has its source and is marked confirm-with-your-lawyer');
  const p3 = Object.assign(clone(PROJ[2]), { lienTrack: { on: true } });
  cp = LD.compute(p3, '2026-10-30');
  ok(cp.state === 'AR' && cp.role === 'sub' && cp.residential === false, 'AR, sub (GC job), commercial');
  ok(cp.items.find(x => x.rule === 'AR117').status === 'needs-date' && cp.notes.some(n => /18-44-115\(b\)/.test(n)), 'no last-work date yet → "needs a date"; the commercial-sub note');
  p3.lienTrack.lastWork = '2026-10-01'; cp = LD.compute(p3, '2026-10-30');
  ok(cp.items.find(x => x.rule === 'AR114').due === '2027-01-19' && cp.items.find(x => x.rule === 'AR117').due === '2027-01-29', 'AR 10-day notice by day 110, lien by day 120 (§ 18-44-114, -117)');
  p3.lienTrack.filedAt = '2027-01-10'; cp = LD.compute(p3, '2026-10-30');
  ok(cp.items.find(x => x.rule === 'AR119').due === '2028-04-09', 'AR suit 15 months after filing (§ 18-44-119)');
  const p2 = Object.assign(clone(PROJ[1]), { lienTrack: { on: true, lastWork: '2026-10-20', filedAt: '2026-12-01' } });
  cp = LD.compute(p2, '2026-10-30');
  ok(cp.items.find(x => x.rule === 'MS405').due === '2027-01-18' && cp.items.find(x => x.rule === 'MS409').due === '2027-01-08' && cp.items.find(x => x.rule === 'MS421').due === '2027-05-30', 'MS: lien 90 days, pre-lien notice day 80, suit 180 days after filing');
  const pTNsub = { id: 'X', address: 'Nashville, TN 37201', type: 'Commercial', gcJob: true, startDate: '2026-08-20', lienTrack: { on: true } };
  cp = LD.compute(pTNsub, '2026-10-30');
  const m = cp.items.filter(x => x.rule === 'TN145');
  ok(m.length === 3 && m[0].due === '2026-11-29' && m[0].key === 'TN145:2026-08', 'TN sub, non-residential: a notice of nonpayment for each month worked (Aug → due Nov 29)');
  const pEnd = { id: 'Y', address: 'Memphis, TN 38103', endDate: '2026-10-01', completionDate: '2026-10-10', lienTrack: { on: true } };
  ok(LD.datesOf(pEnd, '2026-10-30').last === '2026-10-01', 'no last-work date: the EARLIEST past end / completion date is used (conservative)');
  ok(LD.compute({ id: 'Z', address: 'Atlanta, GA', lienTrack: { on: true } }, '2026-10-30').items.length === 0, 'a state outside TN / AR / MS: no dates, a note to pick the state');
  /* the daily run */
  const d = base(); d.projects[0].lienTrack = { on: true, lastWork: '2026-08-15' };   /* TN112 due Nov 13, aim Oct 30 → urgent */
  rig(d);
  KV.gc_sign_requests = [{ id: 'sr_A', pid: 'P1', kind: 'change_order', title: 'Change order — gutters', amount: 1200, status: 'pending' }];
  KV.gc_approval_queue.push({ id: 'appr_sign_sr_A', kind: 'sign_change_order', status: 'sent', sentAt: '2026-10-20T15:00:00Z' });
  let dr = await OFF.daily();
  const lt = KV.gc_office_tasks.filter(t => t.kind === 'lien_deadline');
  ok(dr.lienTodos >= 1 && lt.some(t => /Record the Notice of Lien/.test(t.label) && t.due === '2026-10-30' && t.prio === 'high' && t.go.pid === 'P1'), 'a lien-deadline To-Do for the office before the deadline (' + lt.map(t => t.label).join(' | ').slice(0, 160) + ')');
  ok(lt.every(t => /confirm with your lawyer/.test(t.note)), 'the To-Do says "confirm with your lawyer"');
  ok(!KV.gc_office_tasks.some(t => t.kind === 'lien_deadline' && t.go.pid !== 'P1'), 'only the job with the switch on gets lien To-Dos');
  ok(KV.gc_office_tasks.some(t => t.kind === 'co_unsigned' && /10 days/.test(t.label)), 'a change order waiting 10 days → one office To-Do');
  ok(dr.w9Queued === 0, 'W-9: Bob / Cal are not working on an open job → not asked');
  const n0 = KV.gc_office_tasks.length; dr = await OFF.daily(); ok(KV.gc_office_tasks.length === n0 && dr.lienTodos === 0 && dr.coTodos === 0, 'the next run adds nothing twice');
  DATA.projects[0].lienTrack.done = { TN112: { at: 'x', by: 'Brittany' } };
  dr = await OFF.daily(); ok(dr.lienTicked >= 1 && KV.gc_office_tasks.find(t => t.offLien && t.offLien.key === 'TN112').done, 'marked done on the job → its To-Do ticks itself off');
  DATA.projects[0].subs = [{ subId: 'V2', name: 'Bob Paint' }];
  dr = await OFF.daily(); ok(dr.w9Queued === 1 && aq('sub_doc_request').some(x => x.to === 'bob@example.com' && x.meta.need.join() === 'w9'), 'a sub on an open job with no W-9 → one W-9 request on Approvals');
  KV.gc_approval_queue.forEach(x => { if (x.kind === 'sub_doc_request') x.status = 'sent'; });
  dr = await OFF.daily(); ok(dr.w9Queued === 0, '…asked once only');
  PAUSED = true; const n1 = KV.gc_office_tasks.length; dr = await OFF.daily(); ok(dr.dataEntryMode && KV.gc_office_tasks.length === n1, '⏸ data-entry mode → the daily run does nothing');

  console.log('— (4) Lien waivers: wording, GrayCo’s waiver to the customer, sub waivers through Approvals');
  rig(base());
  let w = await OFF.wording();
  ok(w.texts.cust_conditional && !w.custom.cust_conditional && /lawyer/.test(w.draftNote), 'built-in DRAFT wording until someone edits it');
  w = await OFF.wordingSet({ cust_unconditional: 'My Waiver <b>\n\nPaid {{AMOUNT}} for {{JOB}}' }, WHO);
  ok(w && w.custom.cust_unconditional && KV.gc_lien_wording.by === 'Brittany', 'the office saves her own wording');
  const h = OFF.fill('Title <x>\n\nPaid {{AMOUNT}} by {{PAYER}} {{NOPE}}', { AMOUNT: '$5.00', PAYER: 'A&B <Co>' });
  ok(h === '<p><b>Title &lt;x&gt;</b></p><p>Paid $5.00 by A&amp;B &lt;Co&gt; </p>', 'placeholders filled and escaped (' + h + ')');
  r = await OFF.lienCustomer({ invoiceId: 'I2', kind: 'unconditional' }, WHO);
  it = aq('lien_waiver')[0];
  ok(r.out.queued && it && it.to === 'ann@example.com' && it.meta.waiver === 'unconditional' && /Paid \$5,000\.00 for Smith Roof/.test(it.html), 'unconditional waiver for a paid invoice → lien_waiver on Approvals, with the edited wording');
  r = await OFF.lienCustomer({ invoiceId: 'I2', kind: 'unconditional' }, WHO); ok(r.out.already, 'one open waiver per payment and kind');
  r = await OFF.lienCustomer({ invoiceId: 'I1', kind: 'unconditional' }, WHO); ok(r.out.ok === false, 'unconditional with no payment recorded → refused');
  r = await OFF.lienCustomer({ invoiceId: 'I1', kind: 'conditional' }, WHO); ok(r.out.queued, 'conditional waiver for an open invoice');
  /* sub waiver: even a sub already contacted waits on Approvals when asked from the job page */
  rig(base()); KV.gc_lien_waivers = [{ id: 'LWc_OLD', status: 'sent', subEmail: 'ace@example.com' }];
  const lr = await LIEN.request({ kind: 'conditional', invId: 'S1', pid: 'P1', sub: 'Ace Gutters', subId: 'V1', amount: 3000, through: '2026-10-01', by: 'Brittany', viaApproval: true }, Object.assign(base(), { subs: VENDORS }));
  ok(lr.queued && aq('sub_lien_request').length === 1 && FETCHES.filter(f => /resend/.test(f.u)).length === 0, 'a sub waiver request from the job page waits on Approvals (sub_lien_request), not sent directly');
  ok(KV.gc_lien_waivers.find(x => x.id === 'LWc_S1').status === 'waiting_approval', 'the waiver shows "waiting for approval"');
  rig(base()); await OFF.wordingSet({ sub_conditional: 'Edited {{CLAIMANT}} waiver {{AMOUNT}}' }, WHO);
  await LIEN.request({ kind: 'conditional', invId: 'S1', pid: 'P1', sub: 'Ace Gutters', subId: 'V1', amount: 3000, by: 'B', viaApproval: true }, Object.assign(base(), { subs: VENDORS }));
  const wv = KV.gc_lien_waivers.find(x => x.id === 'LWc_S1');
  ok(wv && /Edited/.test(wv.wording) && /Edited Ace Gutters waiver \$3,000\.00/.test(LIEN.waiverText(wv)), 'the edited sub wording is frozen on the waiver the sub signs');

  console.log('— the function, the bundle, the page copy');
  const H = require(path.join(FN, 'office-board.js')).handler;
  rig(base());
  let res = await H({ httpMethod: 'POST', body: JSON.stringify({ action: 'remind', invoiceId: 'I1' }) });
  ok(res.statusCode === 401, 'not signed in → 401');
  res = await H({ httpMethod: 'POST', who: { email: 'pat@grayco-cs.com', role: 'staff' }, body: JSON.stringify({ action: 'wording', set: { cust_conditional: 'x' } }) });
  ok(res.statusCode === 403, 'a PM cannot change the waiver wording');
  res = await H({ httpMethod: 'POST', who: WHO, body: JSON.stringify({ action: 'remind', invoiceId: 'I1' }) });
  ok(res.statusCode === 200 && JSON.parse(res.body).queued, 'office-board remind works');
  ok(/require\('\.\/_lib\/pause'\)\.install\(\)/.test(fs.readFileSync(path.join(FN, 'office-board.js'), 'utf8')), 'office-board.js installs the pause guard');
  let esb = null; try { esb = require(path.join(ROOT, 'node_modules/esbuild')); } catch (e) { try { esb = require('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/esbuild'); } catch (e2) {} }
  if (esb) {
    for (const f of ['office-board.js', 'care11-scheduled.js', 'lien.js', 'portal.js']) {
      let e = ''; try { await esb.build({ entryPoints: [path.join(FN, f)], bundle: true, platform: 'node', write: false, logLevel: 'silent', external: ['@netlify/*', 'aws-sdk'] }); } catch (x) { e = String(x.message || x).slice(0, 200); }
      ok(!e, 'esbuild bundles ' + f + (e ? ' — ' + e : ''));
    }
  } else console.log('  (esbuild not found — bundle check skipped)');
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (page.indexOf('gc-patch-offfeat') >= 0) ok(page.indexOf(fs.readFileSync(path.join(FN, '_lib/lien-deadlines.js'), 'utf8').trim()) >= 0, 'index.html carries the same lien rules as the server');
  console.log(`OFFFEAT_fn ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
