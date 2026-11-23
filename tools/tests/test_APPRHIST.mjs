// test_APPRHIST.mjs <build-dir> [--node-only] — APPRHIST (owner 11/23: "shouldn't we show what I just approved, all the portal
// sign-ups, COIs etc; also have a button down at bottom … all approvals dated and sorted by how I want").
// Made-up people / jobs / subs only; nothing leaves this computer: the REAL appr-away function (audit, history) runs in node on the
// harness's in-memory cloud and the browser (offline harness, Chromium) talks to it.
//  node:
//   1. a decision of a new kind (answered, with job + note) is kept with them;
//   2. what leaves the live audit (older than 60 days / past 2000) is archived first (gc_appr_audit_arch_<year>) — nothing is lost;
//   3. an archive that cannot be written keeps the old entries on the live list;
//   4. op history: live + archive, newest first, pages (before / limit / more); admins, the office and PMs (CRM role) — not an estimator.
//  browser (desk 1440×900 and phone 390×844):
//   5. ✅ Approvals → 🕘 Recently approved: exactly the newest 8 items of 14 days, of every kind (sign-ups, COIs, material
//      requests, plan requests, time off, customer e-mails with who approved each step …), job links; "📜 All approvals history (N)";
//   6. the history screen (in the page — no dialog): date / who / kind / what / outcome, newest first, 50 at a time, Load more,
//      older pages from the server (the archive), sort oldest / by person / by kind, filters (outcome, person, kind, dates, search),
//      Clear, ← Back; a job link opens the job; no long main-thread task while opening / filtering;
//   7. a live decision (a sub sign-up approved, a bid-site material request declined, a COI denied) is on top at once, and on the server;
//   8. a PM sees his own and his jobs' decisions only; an estimator has no history; no horizontal scroll on the phone; no page errors.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), NODE_ONLY = process.argv.includes('--node-only');
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs');
const { cset, cget, cloud, resetCloud, sleep } = H;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };

/* ── the node side: every Supabase call the function makes is answered from the harness cloud ── */
let tick = 0, FAILKEY = '';
const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {}; const m = (o.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  const u = new URL(url);
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(o.body); const l = Array.isArray(b) ? b : [b]; if (FAILKEY && l.some(x => x.key.startsWith(FAILKEY))) return res(500, {}); l.forEach(x => cloud.set(x.key, { key: x.key, value: x.value, updated_at: new Date(Date.now() + (++tick)).toISOString() })); return res(201, {}); }
    const k = u.searchParams.get('key') || '';
    const keys = k.startsWith('in.') ? dv(k.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [dv(k).replace(/^eq\./, '')];
    return res(200, keys.filter(x => cloud.has(x)).map(x => cloud.get(x)));
  }
  return res(m === 'POST' ? 201 : 200, []);
};
Object.assign(process.env, { SUPABASE_URL: 'https://ieeonhpfahmwwecizdut.supabase.co', SUPABASE_SERVICE_KEY: 'test-only-not-a-key', APPR_PING_OFF: '1' });
const FN = path.join(BUILD, 'netlify/functions');
const AWAYFN = require(FN + '/appr-away.js');
const PG = require(FN + '/_lib/apprping.js');
const kl = k => { const v = cget(k); return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const USERS = [
  { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Nick Gray', email: 'ngray@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },
  { id: 'u4', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u5', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true }];
const ADM = { email: 'wjohnson@grayco-cs.com', role: 'admin', name: 'Wesley Johnson', admin: true };
const OFF = { email: 'office@grayco-cs.com', role: 'office', name: 'Office Demo', admin: false };
const PMW = { email: 'pm@grayco-cs.com', role: 'staff', name: 'Demo PM', admin: false };
const EST = { email: 'sbiffle@grayco-cs.com', role: 'staff', name: 'Demo Estimator', admin: false };
const act = (body, who) => AWAYFN._act(body, who).catch(e => ({ status: 'threw', out: { error: String(e && e.stack || e) } }));
const DAY = 864e5, iso = ms => new Date(ms).toISOString();

resetCloud(); cset('users', USERS);
/* 1 */
let r = await act({ op: 'audit', rec: { key: 'bp:pr:J9', src: 'bp', kind: 'Plan / info request', title: '📩 Plan request answered — Sample Gym', pid: 'P1', note: 'Sent the plans', decision: 'answered', device: 'phone' } }, ADM);
let a1 = kl('gc_appr_audit').find(x => x.key === 'bp:pr:J9');
ok('1. a new kind of decision (answered) is kept with its job and note, who from the sign-in', r.status === 200 && a1 && a1.decision === 'answered' && a1.pid === 'P1' && a1.note === 'Sent the plans' && a1.by === 'Wesley Johnson' && a1.device === 'phone', { r, a1 });
/* 2 */
const now = Date.now();
const oldOnes = [0, 1, 2].map(i => ({ id: 'OLD' + i, key: 'sub:OLD' + i, src: 'sub', kind: 'Sub invoice', title: 'Old sub invoice ' + i, decision: 'approved', by: 'Nick Gray', email: 'ngray@grayco-cs.com', at: iso(now - (70 + i) * DAY) }));
cset('gc_appr_audit', JSON.stringify(kl('gc_appr_audit').concat(oldOnes)));
r = await act({ op: 'audit', rec: { key: 'coi:subdoc_x1', src: 'coi', kind: 'Sub COI / W-9', title: '🛡 COI denied — Sample Sub', decision: 'denied', note: 'Expired' } }, OFF);
const yr = new Date(now - 70 * DAY).getUTCFullYear();
let live = kl('gc_appr_audit'), arch = kl('gc_appr_audit_arch_' + yr);
ok('2a. the entries older than 60 days went to the archive (gc_appr_audit_arch_' + yr + ') and left the live list', r.status === 200 && oldOnes.every(o => arch.some(x => x.id === o.id)) && !live.some(x => /^OLD/.test(x.id)) && live.some(x => x.key === 'coi:subdoc_x1'), { live: live.map(x => x.id), arch: arch.map(x => x.id) });
/* overflow past 2000 */
const many = Array.from({ length: 2000 }, (_, i) => ({ id: 'M' + i, key: 'exp:M' + i, src: 'exp', kind: 'Expense', title: 'Expense ' + i, decision: 'approved', by: 'Office Demo', email: 'office@grayco-cs.com', at: iso(now - DAY - (2000 - i) * 60e3) }));
cset('gc_appr_audit', JSON.stringify(many));
r = await act({ op: 'audit', rec: { key: 'exp:NEW', src: 'exp', kind: 'Expense', title: 'New expense', decision: 'approved' } }, ADM);
live = kl('gc_appr_audit'); arch = kl('gc_appr_audit_arch_' + new Date(now - DAY).getUTCFullYear());
ok('2b. past 2000 the oldest is archived first, the live list stays 2000 and holds the new one', live.length === 2000 && live.some(x => x.key === 'exp:NEW') && !live.some(x => x.id === 'M0') && arch.some(x => x.id === 'M0'), { n: live.length, a: arch.length });
const allIds = new Set(live.concat(arch, kl('gc_appr_audit_arch_' + yr)).map(x => x.id));
ok('2c. nothing was lost: every entry is on the live list or in the archive', many.every(m => allIds.has(m.id)) && oldOnes.every(o => allIds.has(o.id)));
/* 3 */
cset('gc_appr_audit', JSON.stringify([{ id: 'OLDX', key: 'sub:OLDX', decision: 'approved', by: 'Nick Gray', email: 'ngray@grayco-cs.com', at: iso(now - 90 * DAY) }]));
FAILKEY = 'gc_appr_audit_arch_';
r = await act({ op: 'audit', rec: { key: 'exp:N2', decision: 'approved' } }, ADM);
FAILKEY = '';
live = kl('gc_appr_audit');
ok('3. the archive could not be written → the old entry stays on the live list (never dropped); the new one is kept', live.some(x => x.id === 'OLDX') && live.some(x => x.key === 'exp:N2'), live.map(x => x.id));
/* 4 */
resetCloud(); cset('users', USERS);
cset('gc_appr_audit', JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ id: 'L' + i, key: 'exp:L' + i, decision: 'approved', by: 'Office Demo', at: iso(now - i * 3600e3) }))));
cset('gc_appr_audit_arch_' + yr, JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: 'H' + i, key: 'exp:H' + i, decision: 'denied', by: 'Nick Gray', at: iso(now - (61 + i) * DAY) }))));
let h1 = await act({ op: 'history', limit: 25 }, ADM);
const p1 = h1.out.items || [];
let h2 = await act({ op: 'history', limit: 25, before: p1.length ? p1[p1.length - 1].at : '' }, ADM);
const p2 = h2.out.items || [];
ok('4a. history: newest first, 25 a page with "more", the next page from where it stopped — the archive included (50 in all)', h1.status === 200 && p1.length === 25 && h1.out.more === true && h1.out.total === 50 && p1[0].id === 'L0' && p1.every((x, i) => !i || p1[i - 1].at >= x.at) && p2.length === 25 && h2.out.more === false && p2.some(x => x.id === 'H19') && !p2.some(x => p1.some(y => y.id === x.id)), { p1: p1.map(x => x.id), p2: p2.map(x => x.id), h1: h1.out.more, h2: h2.out.more });
const hp = await act({ op: 'history' }, PMW), ho = await act({ op: 'history' }, OFF), he = await act({ op: 'history' }, EST);
ok('4b. who: the office and a PM (by CRM role) may read it; an estimator may not (403)', hp.status === 200 && ho.status === 200 && he.status === 403, { hp: hp.status, ho: ho.status, he: he.status });

if (NODE_ONLY) { const n = R.filter(Boolean).length; console.log('APPRHIST ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1); }

/* ═════ the browser ═════ */
const KINDS = [['bp:su:', 'bp', 'New sub sign-up', 'Sign-up approved: Sample Sub '], ['coi:subdoc_', 'coi', 'Sub COI / W-9', '🛡 COI confirmed — Sample Sub '], ['bp:mr:', 'bp', 'Material request', '🧱 Sample Supply asks for lumber '],
  ['bp:pr:', 'bp', 'Plan / info request', '📩 Plan / info request answered — Sample Gym '], ['td:to:', 'other', 'Time off', '🏖 Time off: Sample Person '], ['exp:', 'exp', 'Expense', 'Expense — Sample Store '], ['sub:', 'sub', 'Sub invoice', 'Sub invoice — Sample Sub ']];
const PEOPLE = [['Wesley Johnson', 'wjohnson@grayco-cs.com', 'admin'], ['Nick Gray', 'ngray@grayco-cs.com', 'admin'], ['Office Demo', 'office@grayco-cs.com', 'office'], ['Demo PM', 'pm@grayco-cs.com', 'staff']];
const DEC = ['approved', 'approved', 'denied', 'approved', 'recorded'];
function seedBrowser(){
  resetCloud();
  cset('users', USERS);
  cset('projects', [{ id: 'P1', name: 'Sample Gym Remodel', client: 'Sample Owner', address: '1 Sample Ln', pm: 'Demo PM', status: 'Active', autoPO: 'T101', createdAt: iso(now - 200 * DAY), updatedAt: iso(now - 9 * DAY) },
    { id: 'P2', name: 'Sample Clinic', client: 'Sample Health', address: '2 Sample Ln', pm: 'Wesley Johnson', status: 'Active', autoPO: 'T102', createdAt: iso(now - 200 * DAY), updatedAt: iso(now - 9 * DAY) }]);
  const recs = [];
  for (let i = 0; i < 600; i++) {
    const k = KINDS[i % KINDS.length], p = PEOPLE[i % PEOPLE.length], d = k[2] === 'Plan / info request' ? 'answered' : DEC[i % DEC.length];
    recs.push({ id: 'R' + i, key: k[0] + 'K' + i, src: k[1], kind: k[2], title: k[3] + i, job: i % 3 === 0 ? 'PO T101 · Sample Gym Remodel' : i % 3 === 1 ? 'PO T102 · Sample Clinic' : '', pid: i % 3 === 0 ? 'P1' : i % 3 === 1 ? 'P2' : '',
      decision: d, by: p[0], email: p[1], role: p[2], device: i % 2 ? 'phone' : 'computer', at: iso(now - 3600e3 - i * 12 * 3600e3), note: d === 'denied' ? 'Needs a new copy' : '' });
  }
  cset('gc_appr_audit', JSON.stringify(recs.filter(x => Date.parse(x.at) >= now - 60 * DAY)));
  const byY = {}; recs.filter(x => Date.parse(x.at) < now - 60 * DAY).forEach(x => { const y = x.at.slice(0, 4); (byY[y] = byY[y] || []).push(x); });
  Object.keys(byY).forEach(y => cset('gc_appr_audit_arch_' + y, JSON.stringify(byY[y])));
  /* a customer e-mail approved by the PM, then by Wesley, then sent — the record keeps who approved each step */
  cset('gc_approval_queue', JSON.stringify([{ id: 'Q1', kind: 'customer_email', title: '✉️ Update to Sample Owner', jobId: 'P1', jobName: 'Sample Gym Remodel', pm: 'Demo PM', status: 'sent', sentAt: iso(now - 20 * 60e3),
    approvals: [{ by: 'Demo PM', email: 'pm@grayco-cs.com', role: 'pm', at: iso(now - 50 * 60e3) }, { by: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', at: iso(now - 25 * 60e3) }], createdAt: iso(now - 2 * 3600e3) }]));
  return recs;
}
const RECS = seedBrowser();
const whoOf = e => { const a = H.ACCOUNTS[e] || {}; return { email: e, name: a.name, role: a.role, admin: a.role === 'admin' }; };
H.ACCOUNTS['pm@grayco-cs.com'].name = 'Demo PM';
const AUD = [];
H.onFn('appr-away', async ({ body, A }) => {
  if (body && (body.op === 'audit' || body.op === 'history')) { if (body.op === 'audit') AUD.push(body.rec); const o = await AWAYFN._act(body, whoOf(A.name)); return { status: o.status, body: o.out }; }
  return { ok: true };
});
const BIDS = [{ id: 'u_new1', company: 'Sample Paint Co', name: 'Sal Sample', email: 'sal@samplepaint.test', trades: ['Paint'], at: iso(now - 2 * DAY), papers: { ready: true } }];
const MATS = [{ id: 'mr1', userCompany: 'Sample Supply', qty: '10', unit: 'sheets', item: 'plywood', jobTitle: 'Sample Gym Remodel', crmProjectId: 'P1', reason: 'short', at: iso(now - DAY) }];
async function routes(c){
  await c.ctx.route('**/.netlify/functions/portal-access*', async rt => { const b = JSON.parse(rt.request().postData() || '{}'), J = v => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (b.action === 's-sync') return J({ ok: true, events: [], unread: {}, links: {}, waiting: [], codes: [], admin: true, me: c.name, bids: BIDS.filter(x => !x.done) });
    if (b.action === 's-bids-approve') { const x = BIDS.find(y => y.id === b.id); if (x) x.done = true; return J({ ok: true }); }
    return J({ ok: true }); });
  await c.ctx.route('**/.netlify/functions/bid-hub*', async rt => { const u = new URL(rt.request().url()), J = v => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (u.searchParams.get('matreqs')) return J({ ok: true, requests: MATS.filter(x => !x.done) });
    if (rt.request().method() === 'POST') { const b = JSON.parse(rt.request().postData() || '{}'); if (b.op === 'matreq') { const x = MATS.find(y => y.id === b.id); if (x) x.done = true; return J({ ok: true }); } }
    return J({ ok: true, jobs: [] }); });
}
const LT = `(() => { window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch (e) {} })()`;
const errsOf = A => A.errs.filter(e => !/ResizeObserver|Script error/.test(e));
async function openApprovals(A){
  await A.ev(() => { try { window._gcApprovalsRefresh && window._gcApprovalsRefresh(); } catch (e) {} window._setView('approvals'); });
  return H.waitFor(A, () => { const b = document.querySelector('[data-apxh-open]'); const n = document.querySelectorAll('[data-apxh-recent] .apx-rr').length; return b && n ? { btn: b.textContent, n } : null; }, null, 40000);
}
async function suite(dev){
  const PH = dev === 'phone', tag = (PH ? 'phone' : 'desk') + ': ';
  seedBrowser(); BIDS.forEach(b => { b.done = false; }); MATS.forEach(m => { m.done = false; });
  const A = await H.computer('wjohnson@grayco-cs.com', { build: BUILD, mobile: PH, init: LT });
  await routes(A);
  await H.signIn(A, 'wjohnson@grayco-cs.com', 20000); await sleep(6000);
  const st = await openApprovals(A);
  const rec = await H.waitFor(A, () => { const l = [...document.querySelectorAll('[data-apxh-recent] .apx-rr')]; return l.length && /\(\d+\+?\)/.test((document.querySelector('[data-apxh-open]') || {}).textContent || '') && /Sign-up approved|COI/.test(document.querySelector('[data-apxh-recent]').textContent) ? l.map(x => x.textContent) : null; }, null, 20000);
  ok(tag + '5a. Recently approved: exactly the newest 8 items', Array.isArray(rec) && rec.length === 8, { st, rec });
  ok(tag + '5b. …of every kind: the customer e-mail with who approved each step (PM → admin → sent) on top, sign-ups / COIs / material requests / plan requests / time off', Array.isArray(rec) && /Update to Sample Owner/.test(rec[0]) && /PM · Demo PM/.test(rec[0]) && /Admin · Wesley Johnson/.test(rec[0]) && /sent/.test(rec[0]) && rec.some(t => /Sign-up approved/.test(t)) && rec.some(t => /COI confirmed/.test(t)) && rec.some(t => /asks for lumber/.test(t)) && rec.some(t => /Plan \/ info request answered/.test(t)), rec);
  const btn = await A.ev(() => { const b = document.querySelector('[data-apxh-open]'); const l = document.querySelector('[data-apxh-recent]'); return b ? { t: b.textContent, after: !!(l && (l.compareDocumentPosition(b) & 4)), jobs: document.querySelectorAll('[data-apxh-recent] [data-apxh-job]').length } : null; });
  ok(tag + '5c. "📜 All approvals history (N)" right below the 8, N = every decision (more on the server: "+"); job names are links', btn && /📜 All approvals history \(\d{3}\+?\)/.test(btn.t) && btn.after && btn.jobs > 0, btn);
  /* 7. a live decision: a sub sign-up approved on the Approvals tab */
  await A.ev(() => { window._gcBpAppr && window._gcBpAppr.refresh(); });
  const su = await H.waitFor(A, () => !!document.querySelector('.apx-row[data-k="bp:su:u_new1"]'), null, 20000);
  if (su) await A.ev(() => { const b = [...document.querySelectorAll('.apx-row[data-k="bp:su:u_new1"] button')].find(x => /Approve/.test(x.textContent)); if (b) b.click(); });
  const top = await H.waitFor(A, () => { const f = document.querySelector('[data-apxh-recent] .apx-rr'); return f && /Sample Paint Co/.test(f.textContent) ? f.textContent : null; }, null, 15000);
  ok(tag + '7a. a sub sign-up approved on the tab is on top of Recently approved at once (who + when)', !!su && !!top && /Sign-up approved: Sample Paint Co/.test(top) && /Wesley Johnson/.test(top), { su, top });
  await H.waitFor(A, () => { try { return JSON.parse(localStorage.getItem('gc_appr_hist_mine_v1') || '[]').some(x => x.key === 'bp:su:u_new1' && x.sent); } catch (e) { return false; } }, null, 10000);
  const srv = kl('gc_appr_audit').find(x => x.key === 'bp:su:u_new1');
  ok(tag + '7b. …and on the server record (who from the sign-in, the device)', srv && srv.decision === 'approved' && srv.by === 'Wesley Johnson' && /^(phone|computer|tablet)$/.test(srv.device), srv);
  await A.ev(() => window._gcMatReq && window._gcMatReq.decide('mr1', 'decline', 'Use the stock on site'));
  await A.ev(() => window._gcCoiAppr && window._gcCoiAppr.deny({ id: 'subdoc_live1', ref: 'ref-live1', sub: 'Sample Roofing', subId: 'S-none', file: 'coi-2026.pdf', kind: 'coi', readId: '', fileId: '' }, 'Expired'));
  const live2 = await H.waitFor(A, () => { const t = (document.querySelector('[data-apxh-recent]') || {}).textContent || ''; return /plywood/.test(t) && /COI denied — Sample Roofing/.test(t) ? t : null; }, null, 15000);
  ok(tag + '7c. a bid-site material request declined and a COI denied land there too (✖ denied, the reason)', !!live2 && /Use the stock on site|Expired/.test(live2), live2);
  /* 6. the history screen */
  await A.ev(() => { window.__lt = []; });
  const t0 = Date.now();
  await A.ev(() => document.querySelector('[data-apxh-open]').click());
  const hs = await H.waitFor(A, () => { const p = document.getElementById('gc-apxh'), m = document.getElementById('gc-apx-mount'); const rows = p ? p.querySelectorAll('.apxh-row').length : 0; return p && rows && /Load more/.test(p.textContent) ? { rows, mountHidden: m && getComputedStyle(m).display === 'none', dlg: !!document.querySelector('#gc-apxh [role=dialog]'), fixed: getComputedStyle(p).position, n: p.querySelector('.apxh-n').textContent } : null; }, null, 15000);
  const openMs = Date.now() - t0;
  ok(tag + '6a. the history opens in the page (the Approvals list hidden, not a popup): 50 rows, "Showing 50 of N", Load more', hs && hs.rows === 50 && hs.mountHidden && !hs.dlg && hs.fixed !== 'fixed' && /Showing 50 of \d{3}/.test(hs.n), { hs, openMs });
  const order = await A.ev(() => [...document.querySelectorAll('#gc-apxh .apxh-row')].map(r => ({ w: r.querySelector('.apxh-when').textContent, who: r.querySelector('.apxh-who').textContent, what: r.querySelector('.apxh-what').textContent, out: r.querySelector('.apxh-out').textContent })));
  ok(tag + '6b. each row: date + time, who (role), kind + what (+ job), outcome; newest first (the COI just denied on top)', order.length === 50 && /COI denied — Sample Roofing/.test(order[0].what) && /✖ Denied/.test(order[0].out) && order.every(r => /\d{1,2}:\d{2}/.test(r.w) && r.who && r.out) && order.some(r => /Admin/.test(r.who)), order.slice(0, 3));
  await A.ev(() => document.querySelector('#gc-apxh [data-apxh-more]').click());
  const more = await A.ev(() => document.querySelectorAll('#gc-apxh .apxh-row').length);
  ok(tag + '6c. Load more → 100 rows', more === 100, more);
  /* the server's older pages (the archive) */
  for (let i = 0; i < 12; i++) { const has = await A.ev(() => { const m = document.querySelector('#gc-apxh [data-apxh-more]'); if (m) { m.click(); return 'more'; } const o = document.querySelector('#gc-apxh [data-apxh-older]'); if (o) { o.click(); return 'older'; } return ''; }); if (!has) break; await sleep(has === 'older' ? 1500 : 60); }
  const tot = await H.waitFor(A, () => { const n = document.querySelector('#gc-apxh .apxh-n'); const m = /of (\d+)/.exec(n ? n.textContent : ''); return m && +m[1] >= 600 ? +m[1] : null; }, null, 15000);
  ok(tag + '6d. older pages come from the server on demand (the archive kept for good): all 600+ decisions reachable', tot >= 600, tot);
  const oldest = await A.ev(() => window._gcApprHist.all().some(x => x.id === 'R599'));
  ok(tag + '6e. the oldest archived decision (~300 days) is there', oldest);
  const lt0 = await A.ev(() => (window.__lt || []).slice());
  /* sort and filter */
  const pick = async (f, v) => { await A.ev(([f, v]) => { const e = document.querySelector('#gc-apxh [data-apxh-f="' + f + '"]'); e.value = v; e.dispatchEvent(new Event(f === 'q' ? 'input' : 'change', { bubbles: true })); }, [f, v]); await sleep(f === 'q' ? 400 : 120); return A.ev(() => [...document.querySelectorAll('#gc-apxh .apxh-row')].map(r => ({ w: r.querySelector('.apxh-when').textContent, who: r.querySelector('.apxh-who').firstChild.textContent.trim(), kind: r.querySelector('.apxh-kind').textContent, what: r.querySelector('.apxh-what').textContent, out: r.querySelector('.apxh-out').textContent }))); };
  let rows = await pick('sort', 'old');
  ok(tag + '6f. sort: oldest first', rows.length && /Sample Sub 599|599/.test(rows[0].what), rows.slice(0, 2));
  rows = await pick('sort', 'who');
  ok(tag + '6g. sort: by person (A→Z)', rows.length > 3 && rows.every((r, i) => !i || rows[i - 1].who.toLowerCase() <= r.who.toLowerCase()), rows.slice(0, 3).map(r => r.who));
  rows = await pick('sort', 'kind');
  ok(tag + '6h. sort: by kind', rows.length > 3 && rows.every((r, i) => !i || rows[i - 1].kind.toLowerCase() <= r.kind.toLowerCase()) && new Set(rows.map(r => r.kind)).size >= 2, rows.slice(0, 2).map(r => r.kind));
  await pick('sort', 'new');
  rows = await pick('out', 'denied');
  ok(tag + '6i. filter: outcome Denied only (with the reason)', rows.length > 5 && rows.every(r => /Denied/.test(r.out)) && rows.some(r => /Needs a new copy/.test(r.what)), rows.slice(0, 2));
  rows = await pick('who', 'Nick Gray');
  ok(tag + '6j. filter: + person', rows.length > 2 && rows.every(r => /Nick Gray/.test(r.who) && /Denied/.test(r.out)), rows.slice(0, 2));
  await A.ev(() => document.querySelector('#gc-apxh [data-apxh-clear]').click()); await sleep(200);
  rows = await pick('kind', 'Time off');
  ok(tag + '6k. Clear, then filter by kind (Time off)', rows.length > 5 && rows.every(r => /Time off/.test(r.what)), rows.slice(0, 2));
  const d1 = new Date(now - 10 * DAY), d2 = new Date(now - 3 * DAY), ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  await A.ev(() => document.querySelector('#gc-apxh [data-apxh-clear]').click()); await sleep(200);
  await pick('from', ymd(d1)); rows = await pick('to', ymd(d2));
  const cnt = await A.ev(() => document.querySelector('#gc-apxh .apxh-n').textContent);
  ok(tag + '6l. filter: a date range (8 days → ~16 decisions)', rows.length >= 12 && rows.length <= 18, { n: rows.length, cnt });
  await A.ev(() => document.querySelector('#gc-apxh [data-apxh-clear]').click()); await sleep(200);
  rows = await pick('q', 'plywood');
  ok(tag + '6m. search text', rows.length === 1 && /plywood/.test(rows[0].what), rows);
  const lt = await A.ev(() => (window.__lt || []).slice());
  ok(tag + '6n. fast: no main-thread task over 300 ms while opening, paging 600 decisions, sorting and filtering', Math.max(0, ...lt) <= 300, { lt, lt0, openMs });
  if (process.env.GC_SHOTS) await A.page().screenshot({ path: path.join(process.env.GC_SHOTS, 'apprhist_' + dev + '.png') }).catch(() => {});
  if (PH) { const ov = await A.ev(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth })); ok(tag + '8c. no sideways scroll on the phone', ov.sw <= ov.w + 1, ov); }
  await A.ev(() => document.querySelector('#gc-apxh [data-apxh-clear]').click()); await sleep(200);
  await A.ev(() => document.querySelector('#gc-apxh [data-apxh-back]').click());
  const back = await H.waitFor(A, () => !document.getElementById('gc-apxh') && getComputedStyle(document.getElementById('gc-apx-mount')).display !== 'none' && !!document.querySelector('[data-apxh-open]'), null, 8000);
  ok(tag + '6o. ← Back returns to the Approvals list', !!back);
  /* a job link opens the job */
  await A.ev(() => document.querySelector('[data-apxh-open]').click());
  await H.waitFor(A, () => document.querySelector('#gc-apxh [data-apxh-job]'), null, 8000);
  await A.ev(() => { window.__jobGo = []; const f = window._gcGoToTaskJob; window._gcGoToTaskJob = function(p, t){ window.__jobGo.push(p); return f && f.apply(this, arguments); }; document.querySelector('#gc-apxh [data-apxh-job]').click(); });
  const went = await A.ev(() => ({ go: window.__jobGo, hist: !!document.getElementById('gc-apxh') }));
  ok(tag + '6p. a job link in the history opens that job (the CRM\'s open-the-job) and leaves the history', went.go.length === 1 && /^P[12]$/.test(went.go[0]) && !went.hist, went);
  ok(tag + '8d. no page errors', !errsOf(A).length, errsOf(A));
  await A.close();
}
await suite('desk');
await suite('phone');
/* 8. a PM / an estimator */
seedBrowser();
const P = await H.computer('pm@grayco-cs.com', { build: BUILD });
await H.signIn(P, 'pm@grayco-cs.com', 20000); await sleep(6000);
const pst = await openApprovals(P);
await P.ev(() => window._gcApprHist.load(true)); await sleep(1500);
for (let i = 0; i < 3; i++) { await P.ev(() => window._gcApprHist.loadOlder()); await sleep(800); }
const pv = await P.ev(() => { const l = window._gcApprHist.visible(window._gcAPX.state().scope); return { n: l.length, bad: l.filter(r => !(r.by === 'Demo PM' || r.email === 'pm@grayco-cs.com' || r.pid === 'P1')).map(r => r.id + ' ' + r.by + ' ' + r.pid).slice(0, 5) }; });
const expect = RECS.filter(x => x.by === 'Demo PM' || x.pid === 'P1').length;
ok('8a. a PM sees his own decisions and his jobs\' only (' + expect + ' of 600)', !!pst && pv.bad.length === 0 && pv.n >= expect - 5 && pv.n <= expect + 3, { pst, pv, expect });
const E = await H.computer('sbiffle@grayco-cs.com', { build: BUILD });
await H.signIn(E, 'sbiffle@grayco-cs.com', 20000); await sleep(5000);
const ev = await E.ev(() => ({ html: window._gcApprHist ? window._gcApprHist.recentHtml({ kind: 'pm', pm: 'Demo Estimator' }, Date.now(), []) : 'x', open: window._gcApprHist ? window._gcApprHist.open() : 'x' }));
ok('8b. an estimator (no ✅ Approvals by role): no history', ev.html === '' && ev.open === false, ev);
ok('8e. no page errors (PM, estimator)', !errsOf(P).length && !errsOf(E).length, errsOf(P).concat(errsOf(E)));
await P.close(); await E.close();
/* 9. the read-only snapshot of the company's real rows (when one is in the scratchpad; APPRHIST_SNAP=none skips): an owner's
   Approvals tab shows ≤ 8 recent items + the button, the history opens, nothing slow, no page errors. Loaded into the harness's
   in-memory cloud only — nothing is written anywhere real. */
const QL = await import(path.join(BUILD, 'tools/qa/qa_lib.mjs')).catch(() => null);
const SNAP = process.env.APPRHIST_SNAP === 'none' ? null : (process.env.APPRHIST_SNAP || (QL && QL.latestSnap(SP.replace('-home-user-graycocrm1', '-home-user') + '/qa/snap')));
if (QL && SNAP) {
  const snap = QL.readSnap(SNAP); QL.loadIntoHarness(H, snap); const who = QL.accountsFromSnap(H, snap).map.admin;
  if (who) {
    const S = await H.computer(String(who.email).toLowerCase(), { build: BUILD, init: LT });
    await H.signIn(S, String(who.email).toLowerCase(), 30000); await sleep(9000);
    await S.ev(() => { window.__lt = []; });
    const sst = await openApprovals(S);
    await S.ev(() => window._gcApprHist.load(true)); await sleep(2500);
    const sr = await S.ev(() => ({ n: document.querySelectorAll('[data-apxh-recent] .apx-rr').length, btn: (document.querySelector('[data-apxh-open]') || {}).textContent || '', all: window._gcApprHist.all().length }));
    await S.ev(() => document.querySelector('[data-apxh-open]').click());
    const so = await H.waitFor(S, () => { const p = document.getElementById('gc-apxh'); return p ? { rows: p.querySelectorAll('.apxh-row').length, n: (p.querySelector('.apxh-n') || {}).textContent } : null; }, null, 10000);
    const slt = await S.ev(() => (window.__lt || []).slice());
    ok('9a. real snapshot (' + path.basename(SNAP) + '): Recently approved ≤ 8 + the history button; the history opens with every decision', !!sst && sr.n > 0 && sr.n <= 8 && /All approvals history \(\d+/.test(sr.btn) && so && so.rows === Math.min(50, sr.all), { sst, sr, so });
    ok('9b. real snapshot: no main-thread task over 500 ms from opening Approvals to the history', Math.max(0, ...slt) <= 500, slt);
    ok('9c. real snapshot: no page errors', !errsOf(S).length, errsOf(S));
    await S.close();
  }
} else console.log('(no snapshot — 9 skipped)');
const n = R.filter(Boolean).length; console.log('APPRHIST ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
