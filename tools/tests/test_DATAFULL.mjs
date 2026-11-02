// test_DATAFULL.mjs <build-dir> — patch DATAFULL: one data checklist per job, by its stage; the nightly check keeps doing
// what it did and adds the checklist; the ~7 AM Central alert to the admins + the office (e-mail + push, exactly once, never in
// data-entry mode, never a text, each person's own choice kept); no carrier name anywhere; the 🧾 Missing job data board.
// Real-data mirror (MIRROR) for the counts and the board; made-up records for the per-type rules.
// Usage: node test_DATAFULL.mjs <dir with index.html + netlify/>   (NOBROWSER=1: functions only; GC_HARNESS: the offline harness)
// Browser part: run it alone, under the scratchpad's browser_lock.sh. Screenshot: SHOT (default the scratchpad's datafull_board.png).
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
const FN = path.join(build, 'netlify', 'functions');
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOT = process.env.SHOT || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/datafull_board.png';
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const section = t => console.log('== ' + t);
const J = require(path.join(FN, '_lib', 'jobdata.js'));
const keys = r => r.need.map(x => x.key).sort().join(',');
const CARRIER = 'State Farm';

/* ── the mirror, as gc_kv rows (chunks folded the way the server reads them) ── */
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
function mirrorData(){
  const by = {}; rows.forEach(r => { by[r.key] = r; });
  const val = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
  const out = {};
  for (const k of Object.keys(by)) { if (/__(chunk\d+|manifest)$/.test(k) || k.startsWith('doc:')) continue; let v = val(by[k].v); const m = by[k + '__manifest'];
    const mv = m && val(m.v); if (mv && mv.chunked && mv.count > 0 && m.updated_at >= by[k].updated_at) { let a = []; for (let i = 0; i < mv.count; i++) a = a.concat(val((by[k + '__chunk' + i] || {}).v) || []); if (a.length) v = a; }
    out[k] = v; }
  out.docs = Object.keys(by).filter(k => k.startsWith('doc:')).map(k => val(by[k].v)).filter(x => x && typeof x === 'object');
  return out;
}
const M = mirrorData();

/* ═══ 1. the rule, per job type ═══ */
section('the checklist follows the job\'s stage and type');
{
  const ix = J.index({ customers: [{ id: 'C1', name: 'Pat Example', phone: '9015550101', email: 'pat@example.com', preferredContact: 'Text', billingSame: true }],
    schedule: [{ id: 'S1', pid: 'W1', date: '2026-11-03', title: 'Demo day', by: 'Office Person' }, { id: 'S2', pid: 'W2', date: '2026-11-03', title: 'Draft task', by: 'Automations', draft: true, tpl: 'res' },
      { id: 'S3', pid: 'W2', date: '2026-11-03', title: 'Start — W2', by: 'Auto', _autoBookend: true, type: 'milestone' }, { id: 'S4', pid: 'W3', date: '2026-11-04', title: 'Picked', by: 'Automations', draft: false, acceptedBy: 'Sample PM', tpl: 'res' },
      { id: 'S5', pid: 'W4', title: 'Draft but accepted?', draft: true, acceptedBy: 'x' }],
    projectDocs: [{ id: 'D1', pid: 'W1', cat: 'Contracts', name: 'Signed contract.pdf' }, { id: 'D2', pid: 'A1', cat: 'Photos', name: 'front.jpg' }, { id: 'D3', pid: 'X1', cat: 'Photos', name: 'Closeout - after.jpg' }],
    invs: [{ id: 'I1', pid: 'X1', type: 'client', isFinal: true, amt: 100 }],
    estimates: [{ id: 'E1', pid: 'E9', status: 'sent', sentPdf: { ref: 'sb:crm-files/' + 'a'.repeat(64) + '.pdf' } }],
    gc_claims: [{ id: 'CL1', projectId: 'N2', claimNumber: 'CLM-1', dateOfLoss: '2026-10-01', carrier: CARRIER, adjuster: { name: 'Adj', phone: '9015550199' } }] });
  const base = { pm: 'Sample PM', type: 'Residential Reno', customerId: 'C1', clientPhone: '9015550101', address: '1 Demo St', contract: 12000 };
  const bid = J.check({ id: 'B1', name: 'Quick bid', address: '9 Demo Rd', status: 'bidding' }, ix);
  ok(bid.stage === 'bidding' && bid.need.length === 0 && bid.score === 100, 'bidding job with a name and an address: complete (nothing else asked)', bid);
  ok(J.chip(bid) === 'Data: bidding', 'its chip is the quiet "Data: bidding"', J.chip(bid));
  const bid2 = J.check({ id: 'B2', name: 'No address yet', status: 'bidding' }, ix);
  ok(keys(bid2) === 'address', 'bidding job with no address: only the address (no PM, contract, papers, schedule…)', keys(bid2));
  const bid3 = J.check({ id: 'B3', name: 'Field job with photos', address: '3 Demo', status: 'bidding', photos: [{ id: 'ph' }] }, ix);
  ok(bid3.need.length === 0, 'a bidding job made in the field with photos is complete');
  const est = J.check({ id: 'E9', name: 'Estimate going out', address: '5 Demo', status: 'bidding', client: 'Lee' }, ix);
  ok(est.stage === 'estimate' && keys(est) === 'billing,custEmail,custMobile,custName,prefContact', 'estimate being sent: the customer-ready list (ESTPDF\'s fields)', keys(est));
  const estI = J.check({ id: 'E8', name: 'Ins estimate', address: '5 Demo', status: 'Proposal sent', type: 'Insurance Claim', customerId: 'C1' }, ix);
  ok(estI.stage === 'estimate' && keys(estI) === 'claim,dol', 'insurance estimate: + claim number and date of loss', keys(estI));
  const cr = J.custReady({ id: 'E7', name: 'x', address: '7 Demo', type: 'Water Damage', client: 'Ann Lee', clientPhone: '9015550000' }, ix);
  ok(!cr.ok && cr.missing.map(x => x.key).join(',') === 'custEmail,billing,prefContact,claim,dol', 'custReady(): full name, mobile, e-mail, service address, billing (or same), preferred contact + claim # / date of loss', cr);
  const won = J.check(Object.assign({ id: 'W1', name: 'Won job', status: 'approved' }, base), ix);
  ok(won.stage === 'won' && won.need.length === 0 && won.score === 100, 'won residential job with everything: 100 %', keys(won));
  const won2 = J.check({ id: 'W9', name: 'Won, empty', status: 'approved', type: 'Residential Reno' }, ix);
  ok(keys(won2) === 'address,contact,contract,customer,papers,pm,schedule', 'won job: customer linked, phone/e-mail, address, PM, contract, papers, schedule', keys(won2));
  const act = J.check(Object.assign({ id: 'A1', name: 'Active', status: 'Active', startDate: '2026-10-01' }, base, { contractSigned: true }), ix);
  ok(act.stage === 'active' && keys(act) === 'schedule', 'active job: + start date and photos (a photo doc counts); no accepted schedule item yet', keys(act));
  const act2 = J.check(Object.assign({ id: 'A2', name: 'Active 2', status: 'In Progress' }, base, { contractSigned: true }), ix);
  ok(keys(act2) === 'photos,schedule,start', 'active job with no start date / photos', keys(act2));
  const done = J.check(Object.assign({ id: 'X1', name: 'Done', status: 'completed', startDate: '2026-09-01', completionDate: '2026-10-20', contractSigned: true }, base), ix);
  ok(done.stage === 'complete' && keys(done) === 'schedule', 'completed job: final invoice + completion date + closeout photos found', keys(done));
  const done2 = J.check(Object.assign({ id: 'X2', name: 'Done 2', status: 'completed', startDate: '2026-09-01', contractSigned: true, ccamId: '1' }, base), ix);
  ok(keys(done2) === 'closeout,completion,finalInv,schedule', 'completed job missing the final invoice, completion date, closeout photos', keys(done2));
  const ins = J.check(Object.assign({}, base, { id: 'N1', name: 'Water loss', status: 'approved', contractSigned: true, type: 'Water Damage', carrier: CARRIER }), ix);
  ok(keys(ins) === 'adjuster,claim,dol,schedule', 'insurance / mitigation job: claim number, date of loss, adjuster contact', keys(ins));
  const ins2 = J.check(Object.assign({}, base, { id: 'N2', name: 'Claim linked', status: 'approved', contractSigned: true, type: 'Insurance Claim' }), ix);
  ok(keys(ins2) === 'schedule', 'a linked claim (claims app) supplies the claim #, date of loss and adjuster');
  const com = J.check(Object.assign({}, base, { id: 'K1', name: 'Commercial TI', status: 'approved', contractSigned: true, type: 'Commercial TI', autoPO: 'Q100', po: 'Q100' }), ix);
  ok(keys(com) === 'gc,po,retainage,schedule', 'commercial job: GC / contact, the customer\'s PO (GrayCo\'s own PO does not count), retainage %', keys(com));
  const com2 = J.check(Object.assign({}, base, { id: 'K2', name: 'Commercial 2', status: 'approved', contractSigned: true, type: 'Commercial Reno', gcContact: 'Site Super', customerPO: 'PO-77', retainageNone: true }), ix);
  ok(keys(com2) === 'schedule', '"No retainage" answers the retainage question');
  const lost = J.check({ id: 'L1', name: 'Lost', status: 'lost' }, ix);
  ok(lost.stage === 'skip' && J.chip(lost) === '', 'lost jobs are not checked');
  const sc = J.check(Object.assign({ id: 'A3', name: 'Score', status: 'Active', contractSigned: true, startDate: '2026-10-01', ccamId: '5' }, base, { pm: '', contract: 0 }), ix);
  ok(sc.total === 12 && sc.score === 75 && J.chip(sc) === 'Data 75% · 3 missing' && keys(sc) === 'contract,pm,schedule', 'score = done ÷ required (9 of 12) → "Data 75% · 3 missing"', { total: sc.total, score: sc.score, chip: J.chip(sc) });

  section('draft schedule items do not count');
  const d1 = J.check(Object.assign({ id: 'W2', name: 'Only drafts', status: 'approved', contractSigned: true }, base), ix);
  ok(keys(d1) === 'schedule', 'draft:true template items and the automatic start marker → still "Schedule item someone accepted"', keys(d1));
  const d2 = J.check(Object.assign({ id: 'W3', name: 'Picked', status: 'approved', contractSigned: true }, base), ix);
  ok(d2.need.length === 0, 'a template item a person accepted (draft:false, acceptedBy) counts');
  const d3 = J.check(Object.assign({ id: 'W4', name: 'Draft wins', status: 'approved', contractSigned: true }, base), ix);
  ok(keys(d3) === 'schedule', 'an item still marked draft:true never counts');
  ok(!J.realSched({ draft: true, by: 'Wesley' }) && J.realSched({ by: 'Wesley' }) && !J.realSched({ by: 'Automations' }), 'realSched(): person-made yes, draft no, automatic no');

  section('N/A for this job');
  const na = J.check(Object.assign({ id: 'A2', name: 'Active 2', status: 'In Progress', dataNA: { photos: { by: 'Office', at: '2026-11-01' }, name: { by: 'x' } } }, base, { contractSigned: true }), ix);
  ok(keys(na) === 'schedule,start' && na.na.join() === 'photos' && na.total === act2.total - 1, 'an item marked N/A stops counting (the job name can never be N/A)', { need: keys(na), na: na.na, total: na.total });
  section('leads');
  const l1 = J.leadCheck({ id: 'LD1', name: 'Roof lead', stage: 'New Lead' });
  ok(l1.need.map(x => x.key).join() === 'assignee,source,next', 'open lead: assigned to, source, next step / due date');
  const l2 = J.leadCheck({ id: 'LD2', name: 'Roof lead', stage: 'New Lead', pm: 'Glenn', source: 'Website', bidDue: '2026-11-04' });
  ok(l2.need.length === 0 && J.leadCheck({ id: 'LD3', stage: 'won' }).skip, 'a lead with all three is complete; won / lost leads are not checked');
  ok(!JSON.stringify([bid, won2, ins, com, est, l1]).includes(CARRIER), 'no carrier name in any result');
}

/* ═══ 2. the real-data mirror ═══ */
section('real-data mirror');
const FULL = J.checkAll(M, { now: Date.parse('2026-11-02T13:05:00Z') });
console.log('    jobs checked ' + FULL.checked + ' · complete ' + FULL.complete + ' · need info ' + FULL.needInfo + ' · by stage ' + JSON.stringify(FULL.byStage) + ' · leads missing ' + FULL.leads.length);
console.log('    top missing: ' + FULL.top.slice(0, 8).map(t => t.label + ' ' + t.count).join(' | '));
ok(FULL.checked > 300 && FULL.needInfo > 0 && FULL.complete > 0 && FULL.checked === FULL.complete + FULL.needInfo, 'every open job is checked: complete + need info = checked');
ok(FULL.jobs.every((j, i, a) => i === 0 || a[i - 1].need.length >= j.need.length), 'most missing first');
ok(FULL.jobs.filter(j => j.stage === 'bidding').every(j => j.need.every(m => m.key === 'name' || m.key === 'address')), 'bidding jobs are asked only for their name / address', FULL.jobs.filter(j => j.stage === 'bidding').slice(0, 2));
ok(FULL.jobs.every(j => j.score >= 0 && j.score < 100), 'scores 0–99 % for jobs that need something');
const noSched = M.projects.filter(p => (M.schedule || []).some(e => e.pid === p.id) && (M.schedule || []).filter(e => e.pid === p.id).every(e => e.draft === true || e._autoBookend));
const nsr = noSched.map(p => J.check(p, J.index(M))).filter(r => r.stage !== 'skip' && r.stage !== 'bidding' && r.stage !== 'estimate');
ok(nsr.length === 0 || nsr.every(r => r.need.some(m => m.key === 'schedule')), 'mirror: jobs whose only schedule items are drafts / automatic markers still need a schedule item (' + nsr.length + ' jobs)');

/* ═══ 3. the nightly run + the morning alert, on the real functions with a fake Supabase / Resend / web-push ═══ */
section('nightly run and the 7 AM alert (functions)');
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test'; process.env.RESEND_API_KEY = 're_test';
process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv'; process.env.CRM_URL = 'https://crm.grayco-cs.com';
delete process.env.DATACHECK_OFF; delete process.env.PORTAL_MAIL_OFF;
const KV = new Map(); const SENT = { mail: [], twilio: [], other: [] };
const kvSet = (k, v) => KV.set(k, { key: k, value: v, updated_at: new Date(Date.now() + KV.size).toISOString() });
function seedKv(){
  KV.clear();
  rows.forEach(r => { if (!r.key.startsWith('gc_cc_token')) kvSet(r.key, r.v); });
  /* one insurance job with a carrier on it (the carrier must never show up) */
  const P = mirrorData().projects; const ip = P.find(p => p.isInsurance && /active/i.test(p.status)) || P.find(p => p.isInsurance);
  ip.carrier = CARRIER; ip.insuranceCarrier = CARRIER; kvSet('projects', P); kvSet('projects__manifest', { count: 0, chunked: false });
  ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com', 'office@grayco-cs.com', 'sbiffle@grayco-cs.com'].forEach(e => kvSet('gc_push_subs__' + e, [{ endpoint: 'https://push.test/' + e, keys: { p256dh: 'x', auth: 'y' } }]));
  KV.delete('gc_automation_pause'); KV.delete('gc_datafull_report'); KV.delete('gc_datafull_prefs');
  kvSet('gc_autowins_log', JSON.stringify([]));
}
function J200(b, st){ return new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: st || 200, headers: { 'Content-Type': 'application/json' } }); }
const realFetch = globalThis.fetch;
globalThis.fetch = async function(url, opts){
  const u = new URL(String(url && url.url ? url.url : url)); const m = String((opts && opts.method) || 'GET').toUpperCase();
  if (u.host === 'sb.test' && u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { let b = JSON.parse(opts.body); (Array.isArray(b) ? b : [b]).forEach(r => kvSet(r.key, r.value)); return J200('', 201); }
    let list = [...KV.values()]; const k = u.searchParams.get('key') || '';
    if (k.startsWith('eq.')) list = list.filter(x => x.key === k.slice(3));
    else if (k.startsWith('in.')) { const ks = k.slice(3).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')); list = list.filter(x => ks.includes(x.key)); }
    else if (k.startsWith('like.')) { const re = new RegExp('^' + k.slice(5).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); list = list.filter(x => re.test(x.key)); }
    const sel = (u.searchParams.get('select') || 'key,value,updated_at').split(',');
    return J200(list.map(x => { const o = {}; sel.forEach(f => { const a = /^(\w+):value->>(\w+)$/.exec(f); if (a) { let v = x.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } const y = v && typeof v === 'object' ? v[a[2]] : null; o[a[1]] = y == null ? null : String(y); } else if (f in x) o[f] = x[f]; }); return o; }));
  }
  if (u.host === 'sb.test') return J200([]);
  if (u.host === 'api.resend.com') { SENT.mail.push(JSON.parse(opts.body)); return J200({ id: 'em_' + SENT.mail.length }); }
  if (u.host === 'api.twilio.com') { SENT.twilio.push(opts.body); return J200({ sid: 'SM1' }); }
  SENT.other.push(u.href); return J200({});
};
const PUSH = [];
const core = require(path.join(FN, 'portal.js'))._core;
core._webPush = { setVapidDetails(){}, async sendNotification(sub, payload){ PUSH.push({ to: sub.endpoint.replace('https://push.test/', ''), payload: JSON.parse(payload) }); } };
const DC = require(path.join(FN, '_lib', 'datacheck.js'));
const handler = require(path.join(FN, 'data-check.js')).handler;
const pause = require(path.join(FN, '_lib', 'pause.js'));
const sched = () => ({ httpMethod: 'POST', body: JSON.stringify({ next_run: '2026-11-03T12:05:00Z' }) });
const realNow = Date.now;
async function at(iso, f){ const t = Date.parse(iso); Date.now = () => t; try { return await f(); } finally { Date.now = realNow; } }
const kvList = k => { const r = KV.get(k); if (!r) return []; let v = r.value; if (typeof v === 'string') v = JSON.parse(v); return Array.isArray(v) ? v : []; };
const reset = () => { SENT.mail.length = 0; SENT.twilio.length = 0; SENT.other.length = 0; PUSH.length = 0; pause.reset(); core._reset && core._reset(); };

seedKv(); reset();
/* the 2 AM run (07:05 UTC): the nightly check — To-Do + report, no alert */
const night = await at('2026-11-02T07:05:00Z', () => handler(sched()));
const nj = JSON.parse(night.body);
ok(night.statusCode === 200 && nj.ok && nj.jobs && nj.jobs.needInfo === FULL.needInfo, 'the 2 AM run still runs the data check and adds the job checklist (' + (nj.jobs && nj.jobs.needInfo) + ' jobs need info)', nj);
const todo = kvList('gc_office_tasks').find(x => x.id === 'DATACHECK_NIGHTLY');
ok(todo && /Nightly data check/.test(todo.label) && todo.refs.length > 0, 'the grouped Office To-Do item is still kept', todo && todo.label);
const bidNoPm = M.projects.filter(p => /bid/i.test(p.status) && !String(p.pm || '').trim() && String(p.address || '').trim());
ok(bidNoPm.length > 0 && !todo.refs.some(r => r.kind === 'job' && bidNoPm.some(p => p.id === r.ids[0])), 'a bidding job is no longer flagged "no PM" on the To-Do (' + bidNoPm.length + ' such jobs)');
ok(todo.refs.some(r => r.kind === 'job' && r.why.includes('no PM')), 'an active job with no PM still is');
const rep0 = kvList('gc_datafull_report')[0];
ok(rep0 && rep0.needInfo === FULL.needInfo && rep0.jobs.length === Math.min(400, FULL.jobs.length) && !rep0.alert, 'the report is kept for the CRM (gc_datafull_report), no alert yet', rep0 && { needInfo: rep0.needInfo, alert: rep0.alert });
ok(SENT.mail.length === 0 && PUSH.length === 0 && SENT.twilio.length === 0, 'nothing is sent at night', { mail: SENT.mail.length, push: PUSH.length });
ok(!JSON.stringify(KV.get('gc_datafull_report')).includes(CARRIER), 'no carrier name in the report');

/* 6:05 AM Central in winter (12:05 UTC): too early — the check only */
reset();
await at('2026-11-02T12:05:00Z', () => handler(sched()));
ok(SENT.mail.length === 0 && PUSH.length === 0, 'the 12:05 UTC run in winter (6:05 AM Central) sends nothing');

/* data-entry mode: nothing at all */
reset(); kvSet('gc_automation_pause', { on: true, by: 'test' });
const pz = await at('2026-11-02T13:05:00Z', () => handler(sched()));
ok(SENT.mail.length === 0 && PUSH.length === 0 && /data-entry/.test(pz.body), 'data-entry mode: no e-mail, no push (not even staff e-mail)', pz.body);
ok(!kvList('gc_autowins_log').some(x => /^datafull:/.test(x.id)), 'and the day is not used up — it goes when the mode is off');
KV.delete('gc_automation_pause');

/* 7:05 AM Central (13:05 UTC in winter): ONE alert to the admins + the office */
reset();
const mo = await at('2026-11-02T13:05:00Z', () => handler(sched()));
const mj = JSON.parse(mo.body).morning || {};
const to = SENT.mail.map(x => x.to.join(',')).sort();
ok(JSON.stringify(to) === JSON.stringify(['nthomas@grayco-cs.com', 'office@grayco-cs.com', 'wjohnson@grayco-cs.com']), 'exactly one e-mail each to the two admins and the office', to);
ok(SENT.mail.every(x => x.subject === '🧾 Job data check: ' + FULL.needInfo + ' jobs need info — GrayCo CRM'), 'subject "🧾 Job data check: N jobs need info"', SENT.mail[0] && SENT.mail[0].subject);
ok(SENT.mail.every(x => x.html.includes('https://crm.grayco-cs.com/#datafull') && x.html.includes(FULL.top[0].label) && x.html.includes('Most missing first')), 'it lists the top items and the most-missing jobs, with the link to the board');
ok(PUSH.map(p => p.to).sort().join() === 'nthomas@grayco-cs.com,office@grayco-cs.com,wjohnson@grayco-cs.com' && PUSH.every(p => /^🧾 Job data check: \d+ jobs need info$/.test(p.payload.title)), 'one phone push each, same three people', PUSH.map(p => p.to));
ok(!SENT.mail.some(x => x.to.includes('sbiffle@grayco-cs.com')) && SENT.mail.every(x => x.to.every(e => /@grayco-cs\.com$/.test(e))), 'staff only — not the PM, never a customer');
ok(SENT.twilio.length === 0, 'never a text');
ok(!JSON.stringify(SENT.mail).includes(CARRIER) && !JSON.stringify(PUSH).includes(CARRIER), 'no carrier name in the e-mail or the push');
const rep1 = kvList('gc_datafull_report')[0];
ok(rep1.alert && rep1.alert.ymd === '2026-11-02' && /🧾 Job data check/.test(rep1.alert.text) && rep1.alert.to.length === 3, 'the CRM is told too (report.alert, for the in-app notice)', rep1.alert);
reset();
await at('2026-11-02T13:35:00Z', () => DC.morning(core));
await at('2026-11-02T14:05:00Z', () => handler(sched()));
ok(SENT.mail.length === 0 && PUSH.length === 0, 'a second run the same morning sends nothing (claimed once per day)');

/* the people's own choice */
reset(); kvSet('gc_datafull_prefs', JSON.stringify([{ email: 'nthomas@grayco-cs.com', mail: false }, { email: 'office@grayco-cs.com', push: false }]));
await at('2026-11-03T13:05:00Z', () => handler(sched()));
ok(SENT.mail.map(x => x.to[0]).sort().join() === 'office@grayco-cs.com,wjohnson@grayco-cs.com' && PUSH.map(p => p.to).sort().join() === 'nthomas@grayco-cs.com,wjohnson@grayco-cs.com', 'each person\'s own choice is kept (e-mail off / push off)', { mail: SENT.mail.map(x => x.to[0]), push: PUSH.map(p => p.to) });
/* summer time: 12:05 UTC is 7:05 AM CDT */
reset(); kvSet('gc_autowins_log', JSON.stringify([])); KV.delete('gc_datafull_prefs');
await at('2026-07-07T12:05:00Z', () => handler(sched()));
ok(SENT.mail.length === 3, 'in summer the 12:05 UTC run is the 7 AM one', SENT.mail.length);
reset();
await at('2026-07-07T13:05:00Z', () => handler(sched()));
ok(SENT.mail.length === 0, '…and the 13:05 one finds it done');
reset();
const sun = await at('2026-11-08T13:05:00Z', () => DC.morning(core));
ok(SENT.mail.length === 0 && /Sunday/.test(JSON.stringify(sun)), 'no alert on Sunday');
/* N/A sticks on the server too */
{
  const P = kvList('projects').length ? kvList('projects') : (KV.get('projects').value);
  const j0 = FULL.jobs.find(j => j.stage === 'active' && j.need.length >= 2), k0 = j0.need[0].key;
  const P2 = (Array.isArray(P) ? P : JSON.parse(P)).map(p => p.id === j0.pid ? Object.assign({}, p, { dataNA: { [k0]: { by: 'Office', at: '2026-11-02T15:00:00Z' } } }) : p);
  kvSet('projects', P2); reset();
  await at('2026-11-03T07:05:00Z', () => handler(sched()));
  const r2 = kvList('gc_datafull_report')[0].jobs.find(j => j.pid === j0.pid);
  ok(r2 && !r2.need.includes(k0) && r2.need.length === j0.need.length - 1, 'N/A sticks: the nightly report no longer lists it (' + k0 + ')', r2);
}
const ping = await handler({ queryStringParameters: { ping: '1' } }); const pub = await handler({ body: '{}' });
ok(ping.statusCode === 200 && pub.statusCode === 403, 'a public call is refused; ping answers');
globalThis.fetch = realFetch;

/* ═══ 4. the page: the same rule, verbatim ═══ */
section('the page carries the same rule');
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const rule = fs.readFileSync(path.join(FN, '_lib', 'jobdata.js'), 'utf8').trim();
ok(html.includes('/* patch DATAFULL */') && html.includes(rule), 'index.html has /* patch DATAFULL */ and _lib/jobdata.js verbatim');
ok(html.split('<script id="gc-patch-datafull">').length === 2, 'one DATAFULL script');

/* ═══ 5. the board in the browser ═══ */
if (process.env.NOBROWSER !== '1') await browser();
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

async function browser(){
  section('the board (browser, real-data mirror)');
  const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
  const H = await import(pathToFileURL(HARNESS).href);
  H.resetCloud(); rows.forEach(r => { if (!/^gc_cc_token/.test(r.key)) H.cset(r.key, r.v); });
  const P = mirrorData().projects; const ip = P.find(p => p.isInsurance && /active/i.test(p.status)) || P.find(p => p.isInsurance); ip.carrier = CARRIER;
  H.cset('projects', P); H.cset('projects__manifest', { count: 0, chunked: false });
  H.cset('gc_datafull_report', JSON.stringify([Object.assign({ id: 'latest' }, DC.compact(FULL), { alert: { ymd: (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date()), at: new Date().toISOString(), text: DC.alertText(FULL), top: FULL.top.slice(0, 3).map(t => t.label), to: ['wjohnson@grayco-cs.com', 'office@grayco-cs.com'] } })]));
  const c = await H.computer('office', { build });
  await c.ctx.route(u => /\/\.netlify\/functions\//.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
  await c.page().setViewportSize({ width: 1366, height: 900 });
  try {
    await H.signIn(c, 'office@grayco-cs.com', 9000);
    const st = await H.waitFor(c, () => { const s = window._gcDataFull && window._gcDataFull.state(); return s && s.canSee && s.checked > 0 ? s : null; }, null, 60000, 500);
    ok(st && st.full && st.needInfo === FULL.needInfo && st.checked === FULL.checked, 'the page\'s count is the server\'s (' + (st && st.needInfo) + ' of ' + (st && st.checked) + ')', st);
    const al = await H.waitFor(c, () => { const a = document.getElementById('gc-df-alert'); return a ? a.textContent : null; }, null, 20000, 400);
    ok(al && /🧾 Job data check: \d+ jobs need info/.test(al), 'the morning alert shows once in the CRM', al);
    const desk = await H.waitFor(c, () => { const x = document.querySelector('#gc-ra-desk [data-card="datafull"]'); return x ? x.textContent.slice(0, 120) : null; }, null, 20000, 400);
    ok(desk && /Missing job data/.test(desk), 'the office desk home has the 🧾 Missing job data card', desk);
    await c.ev(() => { const a = document.getElementById('gc-df-alert'); if (a) a.remove(); window._gcDataFull.open(); }); await H.sleep(1500);
    const b = await c.ev(() => { const ov = document.getElementById('gc-df-ov'); if (!ov) return null; const jobs = [...ov.querySelectorAll('.gc-df-job')]; return { title: ov.querySelector('.gc-df-h b').textContent, jobs: jobs.length, firstMissing: jobs.slice(0, 5).map(j => j.querySelectorAll('.gc-df-it').length), fix: ov.querySelectorAll('[data-df="fix"]').length, na: ov.querySelectorAll('[data-df="na"]').length, pms: ov.querySelectorAll('select[data-df-f="pm"] option').length, text: ov.textContent }; });
    ok(b && b.title === '🧾 Missing job data' && b.jobs === Math.min(60, FULL.needInfo), 'the board lists the jobs that need info', b && { title: b.title, jobs: b.jobs });
    ok(b && b.firstMissing.every((n, i, a) => i === 0 || a[i - 1] >= n), 'most missing first', b && b.firstMissing);
    ok(b && b.fix > 0 && b.na > 0 && b.pms > 2, 'every missing item has Fix and "N/A for this job"; a PM filter', b && { fix: b.fix, na: b.na, pms: b.pms });
    ok(b && !b.text.includes(CARRIER), 'no carrier name on the board');
    await c.page().screenshot({ path: SHOT });
    const pm = await c.ev(() => { const sel = document.querySelector('#gc-df-ov select[data-df-f="pm"]'); const o = [...sel.options].find(x => /Steven/.test(x.textContent)); sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return o.value; });
    await H.sleep(600);
    const fpm = await c.ev(pm => [...document.querySelectorAll('#gc-df-ov .gc-df-job small')].map(x => x.textContent).every(t => t.includes('PM ' + pm.trim()) || t.includes('PM ' + pm)), pm);
    ok(fpm, 'filter by PM shows only that PM\'s jobs');
    await c.ev(() => { const sel = document.querySelector('#gc-df-ov select[data-df-f="pm"]'); sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await H.sleep(500);
    /* N/A sticks */
    const pick = await c.ev(() => { const btn = document.querySelector('#gc-df-ov [data-df="na"]'); const r = { pid: btn.getAttribute('data-id'), k: btn.getAttribute('data-k') }; btn.click(); return r; });
    await H.sleep(2500);
    const naState = await c.ev(r => { const p = window._crm.projects.find(x => x.id === r.pid); const c1 = window._gcDataFull.check(r.pid); return { na: p && p.dataNA && p.dataNA[r.k], need: c1.need.map(x => x.key) }; }, pick);
    ok(naState.na && naState.na.by && !naState.need.includes(pick.k), 'N/A for this job: saved on the job and no longer asked', naState);
    const cloudNA = await H.waitFor(c, () => true, null, 1, 1).then(async () => { for (let i = 0; i < 30; i++) { let v = H.cget('projects'); if (typeof v === 'string') v = JSON.parse(v); const p = (v || []).find(x => x.id === pick.pid); if (p && p.dataNA && p.dataNA[pick.k]) return true; await H.sleep(500); } return false; });
    ok(cloudNA, 'and it is saved to the cloud (the next nightly check reads it)');
    /* Fix opens the right field */
    const fx = await c.ev(() => { const btn = [...document.querySelectorAll('#gc-df-ov [data-df="fix"]')].find(b => ['pm', 'contract', 'startDate', 'address'].includes(b.getAttribute('data-k')) || b.getAttribute('data-k') === 'start'); if (!btn) return null; const r = { pid: btn.getAttribute('data-id'), k: btn.getAttribute('data-k') }; btn.click(); return r; });
    await H.sleep(600);
    const fxs = await c.ev(() => { const f = document.getElementById('gc-df-fix'); return f ? { title: f.querySelector('.gc-df-fh b').textContent, input: (f.querySelector('.gc-df-in') || {}).getAttribute && f.querySelector('.gc-df-in').getAttribute('data-k') } : null; });
    ok(fx && fxs && fxs.input, 'Fix opens the right field (' + (fxs && fxs.title) + ' → ' + (fxs && fxs.input) + ')', { fx, fxs });
    if (fx && fxs) {
      const val = { pm: 'Steven Biffle ', start: '2026-11-09', address: '42 Fixed Rd', contract: '18000' }[fx.k] || '2026-11-09';
      await c.ev(v => { const i = document.querySelector('#gc-df-fix .gc-df-in'); if (i.tagName === 'SELECT') { const o = [...i.options].find(x => x.value && x.value.trim() === v.trim()) || [...i.options].find(x => x.value); i.value = o.value; } else i.value = v; document.querySelector('#gc-df-fix [data-df="fixsave"]').click(); }, val);
      await H.sleep(1200);
      const after = await c.ev(r => window._gcDataFull.check(r.pid).need.map(x => x.key), fx);
      ok(!after.includes(fx.k), 'what the person typed is saved and the item is done', after);
    }
    /* the job header chip */
    await c.ev(() => { window._gcDataFull.close(); });
    const jid = FULL.jobs.find(j => j.stage === 'active').pid;
    await c.ev(pid => { try { window._gcRA && window._gcRA.hide(); } catch (e) {} const p = window._crm.projects.find(x => x.id === pid); window._setView('projects'); window._openJobDetail(p); }, jid);
    const chip = await H.waitFor(c, () => { const x = document.querySelector('.gc-df-chipb'); return x ? x.textContent : null; }, null, 15000, 400);
    ok(chip && /^🧾 Data \d+% · \d+ missing$/.test(chip), 'the job header shows "Data 80% · 3 missing"', chip);
    /* the new-job form: only name + address; More details folded */
    await c.ev(() => { try { window._gcSelfNewJob({ via: 'field' }); } catch (e) {} });
    await H.sleep(800);
    const nf = await c.ev(() => { const ov = document.getElementById('gc-cc2-new'); if (!ov) return null; const vis = e => !!(e && e.getClientRects().length); return { more: vis(ov.querySelector('.gc-df-moreb')), phoneHidden: !vis(ov.querySelector('#gc-cc2-phone')), name: vis(ov.querySelector('#gc-cc2-name')), addr: vis(ov.querySelector('#gc-cc2-addr')) }; });
    ok(nf && nf.more && nf.phoneHidden && nf.name && nf.addr, 'Field "＋ New project": name + address, the rest under "＋ More details (optional)"', nf);
    const n0 = await c.ev(() => window._crm.projects.length);
    await c.ev(() => { const ov = document.getElementById('gc-cc2-new'); ov.querySelector('#gc-cc2-name').value = 'Quick field job'; ov.querySelector('.gc-df-moreb').click(); ov.querySelector('[data-m="isInsurance"]').checked = true; ov.querySelector('[data-m="claimNumber"]').value = 'CLM-TEST-1'; ov.querySelector('#gc-cc2-save').click(); });
    await H.sleep(1500);
    const made = await c.ev(n0 => { const l = window._crm.projects; const p = l.find(x => x.name === 'Quick field job'); return { n: l.length - n0, p: p ? { claimNumber: p.claimNumber, isInsurance: p.isInsurance, status: p.status } : null, stage: p ? window._gcDataFull.check(p.id).stage : '' }; }, n0);
    ok(made.p && made.p.claimNumber === 'CLM-TEST-1' && made.p.isInsurance === true, 'a quick Field job with only a name is made — nothing forced — and what was picked under More details is on it', made);
    const errs = c.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/i.test(e));
    ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
  } finally { await c.b.close().catch(() => {}); }
}
