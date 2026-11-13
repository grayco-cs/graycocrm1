// test_POGUARD.mjs [build-dir] [shot-dir] — patch POGUARD (owner 11/13: "when the guys don't put a PO make sure we get a notification to
// admin and office 'no PO' to then message the sub what PO, and if they are active on a job it'll suggest that's the job the receipt is
// for, and also alert them and PM 'no PO for an expense'." · "make sure sub and PM can [put] POs on every receipt and expense.")
// Offline: the REAL po-guard.js / _lib/poguard.js / portal-access.js / money-mail.js on an in-memory Supabase (gc_kv, the server-only kv,
// portal tables); phone push = a recorder in place of web-push. The CRM side = index.html's OWN scripts (GrayCo Field's 🧾 Log Expense,
// the SUB filing block, patch POGUARD) run in a stub page; the sub portal (portal.html + portal-app.js) in Chromium. Made-up data only.
//  A. server: PO in text (job PO formats, "PO-2026-0012"), the suggestion from THAT DAY (clock-in / daily log / schedule / the sub's own
//     schedule / 📍 check-in / only active job / near the store), the alerts (admin + office To-Do + push, the PM, the submitter, the
//     sub's portal thread), one per receipt, the daily digest past N, set PO (who may), 💬 Ask (sub portal / crew push), the sweep,
//     the sub portal p-receipt / p-receipt-po (own, until approved), e-mailed receipts.
//  B. the CRM / GrayCo Field (Chromium): PO pick in Log Expense, no PO → saved + flagged + "Suggested: … (on that job that day)" ✓ Use,
//     the 🧾 No PO screen (✓ Use, Save, 💬 Ask), crew sees only their own, a sub receipt filed as a pending expense.
//  C. the sub portal (Chromium): 🧾 Send a receipt with the PO picked from their jobs; ❓ I don't know → suggestion ✓ Use; ✏️ Add PO.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, +(process.env.TRUNC || 1200)) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(200); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
delete process.env.RESEND_API_KEY; delete process.env.VAPID_PUBLIC_KEY; delete process.env.PO_GUARD_DIGEST_N;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }).catch(() => {}); };
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const DAY = n => new Date(Date.parse(TODAY + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const PWDIR = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright';

/* ═════ the made-up CRM ═════ */
const SUB = { id: 'SUBzedd1', name: 'Zedd Drywall LLC', company: 'Zedd Drywall LLC', contact: 'Zed Zedd', phone: '901-555-0141', email: 'zed@zedddrywall.test', isSub: true, trade: 'Drywall', lang: 'en' };
const SUB2 = { id: 'SUBdemo2', name: 'Demo Paint Co', company: 'Demo Paint Co', contact: 'Dee Demo', phone: '901-555-0142', email: 'dee@demopaint.test', isSub: true, trade: 'Paint' };
const USERS = [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Olive Office', email: 'olive@grayco-cs.com', role: 'Office', active: true },
  { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u4', name: 'Carl Crew', email: 'carl@grayco-cs.com', role: 'Crew', active: true },
  { id: 'u5', name: 'Dan Demo', email: 'dan@grayco-cs.com', role: 'Crew', active: true }];
const JA = { id: 'PA1', name: 'Demo Roof A', address: '1 Demo St, Memphis, TN 38117', client: 'Pat Demo', pm: 'Sam Biffle', status: 'In Progress', autoPO: 'K729', crew: 'Carl Crew', subs: [{ id: 'r1', subId: SUB.id, name: SUB.name, status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const JB = { id: 'PB2', name: 'Demo Bath B', address: '9 Elm Ave, Germantown, TN 38138', client: 'Lee Demo', pm: 'Sam Biffle', status: 'In Progress', autoPO: 'B314', po: 'PO-2026-0012', subs: [{ id: 'r2', subId: SUB.id, name: SUB.name, status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const JC = { id: 'PC3', name: 'Demo Kitchen C', address: '5 Oak Rd, Memphis, TN 38104', client: 'Dot Demo', pm: 'Wesley Johnson', status: 'In Progress', autoPO: 'C555', subs: [{ id: 'r3', subId: SUB2.id, name: SUB2.name, status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const JD = { id: 'PD4', name: 'Done Deck D', address: '7 Pine, Memphis, TN 38117', pm: 'Sam Biffle', status: 'Complete', autoPO: 'D101', createdAt: now(), updatedAt: now() };
const SCHED = [{ id: 'S1', pid: 'PB2', date: TODAY, title: 'Tile', crew: ['Carl Crew'] }, { id: 'S2', pid: 'PC3', date: DAY(-1), title: 'Demo', assignee: 'Dan Demo' }];

let KV, KVAT, T; const STORE = new Map(); const PUSHES = [];
function freshDb(){
  KV = { projects: [JA, JB, JC, JD], vendors: [SUB, SUB2], users: USERS, schedule: SCHED, expenses: [], gc_sub_portal_settings: { invPhotoMin: 0 }, gc_office_tasks: [] }; KVAT = {};
  USERS.forEach(u => { KV['gc_push_subs__' + u.email] = [{ endpoint: 'ep:' + u.email, keys: { p256dh: 'x', auth: 'y' } }]; });
  T = { gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal_code: [], gc_sub_device: [], gc_portal: [], gc_portal_lock: [], gc_portal_login: [], sp_rows: [], gc_lead_inbox_kv: [],
    gc_staff: [{ email: 'wjohnson@grayco-cs.com', role: 'admin', active: true, name: 'Wesley Johnson' }, { email: 'olive@grayco-cs.com', role: 'office', active: true, name: 'Olive Office' },
      { email: 'sbiffle@grayco-cs.com', role: 'pm', active: true, name: 'Sam Biffle' }, { email: 'carl@grayco-cs.com', role: 'crew', active: true, name: 'Carl Crew' }, { email: 'dan@grayco-cs.com', role: 'crew', active: true, name: 'Dan Demo' }] };
}
freshDb();
const res = (status, body, raw) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => raw || new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); const mm = /^staff:(.+)$/.exec(a); return mm ? res(200, { id: 'u', email: mm[1] }) : res(401, {}); }
  if (u.pathname.startsWith('/storage/v1/object/sign/crm-files')) { const b = JSON.parse(init.body || '{}'); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
  const sm = /^\/storage\/v1\/object\/crm-files\/(.+)$/.exec(u.pathname);
  if (sm && m === 'POST') { const b = Buffer.from(init.body); if (STORE.has(sm[1])) return res(409, 'Duplicate'); STORE.set(sm[1], b); return res(200, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = typeof x.value === 'string' && /^\s*[\[{]/.test(x.value) ? JSON.parse(x.value) : x.value; KVAT[x.key] = x.updated_at || now(); }); return res(201, null); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: KVAT[x] || 'T0' })));
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const i = r.key ? tb.findIndex(x => x.key === r.key) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
      else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k]) !== dv(v.slice(4)));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > dv(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (/created_at\.desc/.test(q.get('order') || '')) rows = rows.slice().reverse();
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    return res(200, rows);
  }
  return res(404, {});
};
const PORTAL = require(path.join(BUILD, 'netlify/functions/portal.js'));
PORTAL._core._webPush = { setVapidDetails(){}, sendNotification: async (sub, payload) => { PUSHES.push({ to: String(sub.endpoint).replace(/^ep:/, ''), p: JSON.parse(payload) }); } };
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const PGF = require(path.join(BUILD, 'netlify/functions/po-guard.js'));
const PG = require(path.join(BUILD, 'netlify/functions/_lib/poguard.js'));
const MM = require(path.join(BUILD, 'netlify/functions/_lib/money-mail.js'));
const resetAll = () => { try { PA._core._reset(); } catch (e) {} try { PORTAL._core._reset(); } catch (e) {} };
let NET = 0;
const SESS = 'S'.repeat(43), SESS2 = 'Q'.repeat(43), LINK = 'L'.repeat(43), LINK2 = 'K'.repeat(43);
function seedSessions(){
  T.gc_sub_link.push({ token: LINK, sub_id: SUB.id, revoked: false, created_at: now() }, { token: LINK2, sub_id: SUB2.id, revoked: false, created_at: now() });
  T.gc_portal_session.push({ id: sha(SESS), kind: 'partner', sub_id: SUB.id, links: [LINK], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false },
    { id: sha(SESS2), kind: 'partner', sub_id: SUB2.id, links: [LINK2], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false });
}
seedSessions();
async function sub(action, body, sess){
  resetAll();
  const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': sess || SESS, 'x-nf-client-connection-ip': '10.4.' + (NET++ % 250) + '.1' }, body: JSON.stringify(Object.assign({ action }, body || {})) });
  return { st: r.statusCode, d: JSON.parse(r.body) };
}
async function staff(email, body, get){
  resetAll();
  const r = await PGF.handler({ httpMethod: get ? 'GET' : 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:' + email }, queryStringParameters: get ? { list: '1' } : {}, body: get ? '' : JSON.stringify(body || {}) });
  return { st: r.statusCode, d: JSON.parse(r.body) };
}
const guard = () => { const row = T.gc_lead_inbox_kv.find(r => r.key === PG.KEY); return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : { list: {}, dg: {} }; };
const alerts = () => Object.values(guard().list || {});
const tasks = () => (Array.isArray(KV.gc_office_tasks) ? KV.gc_office_tasks : JSON.parse(KV.gc_office_tasks || '[]'));
const pushesTo = (em, re) => PUSHES.filter(p => p.to === em && (!re || re.test(p.p.title + ' ' + p.p.body)));
const crewItem = (id, o) => Object.assign({ key: 'exp:' + id, src: 'expense', expId: id, amt: 42.5, vendor: 'Home Depot', date: TODAY, po: '', pid: '', by: { kind: 'crew', name: 'Carl Crew', email: 'carl@grayco-cs.com' } }, o || {});

/* ─── A. the server ─── */
{
  const L = KV.projects;
  const p1 = PG.poFromText('Your receipt — PO-2026-0012 thanks', L), p2 = PG.poFromText('order for po# k729 at the store', L), p3 = PG.poFromText('Ref K729 delivery', L), p4 = PG.poFromText('PO 99887 home depot', L), p5 = PG.poFromText('SKU A1000 rebar 3/8', L), p6 = PG.poFromText('PO D101 old job', L);
  ok('A1 a PO in text: the job\'s own PO in any format ("PO-2026-0012", "po# k729", a bare "K729") → that job; "PO 99887" (no job\'s) is kept but no job; a SKU is not a PO; a done job\'s PO still names it',
    p1.pid === 'PB2' && p2.pid === 'PA1' && p3.pid === 'PA1' && p4.pid === '' && p4.po === '99887' && p5.po === '' && p5.pid === '' && p6.pid === 'PD4', [p1.pid, p2.pid, p3.pid, p4, p5, p6.pid]);
  ok('A1 jobByPo: "PO-2026-0012", "po k729", "b314" → their jobs; unknown → null', PG.jobByPo('PO-2026-0012', L).id === 'PB2' && PG.jobByPo('po k729', L).id === 'PA1' && PG.jobByPo('b314', L).id === 'PB2' && PG.jobByPo('Z999', L) === null);
  const data = { projects: L, schedule: SCHED, users: USERS, timesheets: [], logs: [] };
  const s1 = PG.suggest(crewItem('x1'), data);
  ok('A2 crew, no PO, today: Carl is on Demo Bath B\'s schedule TODAY (his crew field says Demo Roof A) → "Demo Bath B — on that job that day (schedule)" first', s1[0] && s1[0].pid === 'PB2' && /that day/.test(s1[0].why) && s1[0].po === 'B314', s1);
  const s2 = PG.suggest(crewItem('x2', { date: DAY(-3) }), data);
  ok('A2 … a day he was on no schedule → his only active job (Demo Roof A, crew field)', s2[0] && s2[0].pid === 'PA1' && /only active job/.test(s2[0].why), s2);
  const s3 = PG.suggest(crewItem('x3', { date: DAY(-3) }), Object.assign({}, data, { timesheets: [{ user: 'carl@grayco-cs.com', date: DAY(-3), clockIn: '07:00', pid: 'PC3' }] }));
  const s4 = PG.suggest(crewItem('x4', { date: DAY(-2) }), Object.assign({}, data, { logs: [{ pid: 'PC3', date: DAY(-2), startBy: 'Carl Crew' }] }));
  ok('A2 … clocked in on a job that day (a punch with its job) → that job (97); on a job\'s daily log that day → that job', s3[0].pid === 'PC3' && /clocked in/.test(s3[0].why) && s4[0].pid === 'PC3' && /daily log/.test(s4[0].why), [s3, s4]);
  const s5 = PG.suggest(crewItem('x5', { by: { kind: 'crew', name: 'Dan Demo', email: 'dan@grayco-cs.com' }, date: DAY(-1) }), data);
  const s6 = PG.suggest(crewItem('x6', { by: { kind: 'unknown', name: 'Nobody' }, merchantAddr: '400 Store Blvd, Germantown, TN 38138' }), data);
  ok('A2 … Dan scheduled on Demo Kitchen C yesterday (assignee) → it; nobody known + the store in 38138 → the job near the store (same ZIP)', s5[0] && s5[0].pid === 'PC3' && s6[0] && s6[0].pid === 'PB2' && /near the store/.test(s6[0].why), [s5, s6]);
  const sb = { kind: 'sub', name: SUB.name, subId: SUB.id };
  const s7 = PG.suggest({ by: sb, date: DAY(2) }, Object.assign({}, data, { subSched: [{ subId: SUB.id, pid: 'PB2', start: DAY(1), end: DAY(3), status: 'active' }] }));
  const s8 = PG.suggest({ by: sb, date: DAY(-4) }, Object.assign({}, data, { checkins: [{ subId: SUB.id, pid: 'PA1', day: DAY(-4) }] }));
  const s9 = PG.suggest({ by: { kind: 'sub', name: SUB2.name, subId: SUB2.id }, date: DAY(-9) }, data);
  ok('A2 a sub: their own schedule (sub portal SUBSCHED) covering that day → that job; their 📍 check-in that day → that job; else their only job', s7[0].pid === 'PB2' && /their schedule/.test(s7[0].why) && s8[0].pid === 'PA1' && /checked in/.test(s8[0].why) && s9[0].pid === 'PC3' && /only active/.test(s9[0].why), [s7, s8, s9]);
}
/* flag through po-guard.js (the CRM's / GrayCo Field's road) */
let AL1;
{
  PUSHES.length = 0;
  const r = await staff('carl@grayco-cs.com', { op: 'flag', items: [crewItem('EXP1')] });
  AL1 = (r.d.made || [])[0] || {};
  const t = tasks(), tOff = t.find(x => x.id === 'poguard_' + AL1.id) || {}, tPm = t.find(x => x.id === 'poguard_pm_' + AL1.id) || {};
  ok('A3 a crew receipt with NO PO → one alert with the suggestion (Demo Bath B, on that job that day)', r.st === 200 && r.d.ok && AL1.sug && AL1.sug[0].pid === 'PB2' && AL1.status === 'open' && alerts().length === 1, r.d);
  ok('A4 admin + office: an office To-Do "🧾 No PO — Carl Crew, $42.50, Home Depot, <date>" (with the suggestion) + a phone push to both',
    /^🧾 No PO — Carl Crew, \$42\.50, Home Depot, \d+\/\d+$/.test(tOff.label) && /Suggested: Demo Bath B \(PO B314\) — on that job that day/.test(tOff.note) && !tOff.done && pushesTo('wjohnson@grayco-cs.com', /No PO — Carl Crew/).length === 1 && pushesTo('olive@grayco-cs.com', /No PO — Carl Crew/).length === 1, { tOff, PUSHES });
  ok('A5 the suggested job\'s PM (Sam Biffle) gets the same: their own To-Do (assigned to them) + a push "No PO for an expense"', tPm.assignees && tPm.assignees[0] === 'sbiffle@grayco-cs.com' && /Carl Crew/.test(tPm.label) && pushesTo('sbiffle@grayco-cs.com', /No PO for an expense/).length === 1, tPm);
  ok('A6 the person who sent it (Carl) gets "🧾 Add the PO for this receipt" on his phone', pushesTo('carl@grayco-cs.com', /Add the PO for this receipt/).length === 1, PUSHES.filter(p => p.to === 'carl@grayco-cs.com'));
  const again = await staff('olive@grayco-cs.com', { op: 'flag', items: [crewItem('EXP1')] });
  ok('A7 one alert per receipt: flagged again (another computer) → nothing new, no second To-Do / push', again.d.ok && again.d.made.length === 0 && alerts().length === 1 && tasks().filter(x => x.poGuard === AL1.id).length === 2 && pushesTo('olive@grayco-cs.com').length === 1, again.d);
  const placed = await staff('carl@grayco-cs.com', { op: 'flag', items: [crewItem('EXP9', { po: 'K729' })] });
  ok('A7 … a receipt WITH a job\'s PO (K729) makes no alert', placed.d.made.length === 0 && alerts().length === 1, placed.d);
}
/* the list, who sees what, who may set */
{
  const lc = await staff('carl@grayco-cs.com', null, true), ld = await staff('dan@grayco-cs.com', null, true), lp = await staff('sbiffle@grayco-cs.com', null, true), lo = await staff('olive@grayco-cs.com', null, true);
  ok('A8 who sees it: the office (all), the job\'s PM, Carl (his own) — not Dan (crew, not his)', lc.d.alerts.length === 1 && ld.d.alerts.length === 0 && lp.d.alerts.length === 1 && lo.d.alerts.length === 1, [lc.d.alerts.length, ld.d.alerts.length, lp.d.alerts.length, lo.d.alerts.length]);
  const bad = await staff('dan@grayco-cs.com', { op: 'set', id: AL1.id, pid: 'PC3' });
  const nopo = await staff('carl@grayco-cs.com', { op: 'set', id: AL1.id, po: 'Z999' });
  ok('A9 crew can\'t set the PO on someone else\'s receipt (Dan → 403); a PO that is no job\'s is refused (400)', bad.st === 403 && nopo.st === 400 && /not a job/.test(nopo.d.error) && alerts()[0].status === 'open', [bad, nopo]);
  const askNo = await staff('carl@grayco-cs.com', { op: 'ask', id: AL1.id });
  PUSHES.length = 0;
  const askOk = await staff('olive@grayco-cs.com', { op: 'ask', id: AL1.id });
  ok('A10 💬 Ask for the PO: admin / office only (crew → 403); for crew it is a phone push "What PO is this receipt for? $42.50 at Home Depot on …" + kept on the alert (his Field notice)',
    askNo.st === 403 && askOk.st === 200 && askOk.d.via === 'field' && /^What PO is this receipt for\? \$42\.50 at Home Depot on \d+\/\d+\.$/.test(askOk.d.text) && pushesTo('carl@grayco-cs.com', /What PO is this receipt for/).length === 1 && alerts()[0].asks.length === 1, [askNo, askOk.d, PUSHES]);
  const setOk = await staff('carl@grayco-cs.com', { op: 'set', id: AL1.id, po: 'po-2026-0012' });
  const t = tasks().filter(x => x.poGuard === AL1.id);
  ok('A11 Carl sets PO "po-2026-0012" on his own receipt → job Demo Bath B; the alert is resolved and BOTH To-Dos (office + PM) are done', setOk.st === 200 && setOk.d.pid === 'PB2' && setOk.d.po === 'po-2026-0012' && alerts()[0].status === 'resolved' && alerts()[0].resolvedBy === 'Carl Crew' && t.length === 2 && t.every(x => x.done), [setOk.d, t]);
  const a2 = (await staff('sbiffle@grayco-cs.com', { op: 'flag', items: [crewItem('EXP2', { amt: 18, vendor: 'Lowes' })] })).d.made[0];
  const pmSet = await staff('sbiffle@grayco-cs.com', { op: 'set', id: a2.id, pid: 'PB2' });
  ok('A12 the PM of the job sets the PO on a crew receipt (by job) → resolved, PO B314 filled from the job', pmSet.st === 200 && pmSet.d.po === 'B314' && pmSet.d.pid === 'PB2', pmSet.d);
}
/* digest: more than N (3) from one person in a day */
{
  PUSHES.length = 0; const before = tasks().length;
  const items = [1, 2, 3, 4, 5].map(i => crewItem('DG' + i, { amt: 10 * i, vendor: 'Store ' + i, by: { kind: 'crew', name: 'Dan Demo', email: 'dan@grayco-cs.com' } }));
  for (const it of items) await staff('olive@grayco-cs.com', { op: 'flag', items: [it] });
  const mine = alerts().filter(a => a.by.email === 'dan@grayco-cs.com'), dg = tasks().find(x => /^poguard_dg_/.test(x.id)) || {};
  const singles = tasks().slice(before).filter(x => /^poguard_PG/.test(x.id));
  ok('A13 more than 3 from Dan in one day: the first 3 get their own To-Do / push, the 4th and 5th go into ONE daily digest To-Do ("2 more receipts …") with one push',
    mine.length === 5 && singles.length === 3 && /Dan Demo: 2 more receipts on/.test(dg.label) && /Store 4/.test(dg.note) && /Store 5/.test(dg.note) && pushesTo('olive@grayco-cs.com', /No PO — Dan Demo More than 3 receipts/).length === 1 && pushesTo('olive@grayco-cs.com').length === 4 && pushesTo('dan@grayco-cs.com').length === 4,
    { n: mine.length, singles: singles.map(x => x.label), dg, p: PUSHES.map(p => p.to + ' ' + p.p.title) });
  const a4 = mine.find(a => a.vendor === 'Store 4'), a5 = mine.find(a => a.vendor === 'Store 5');
  await staff('olive@grayco-cs.com', { op: 'set', id: a4.id, pid: 'PC3' });
  const dg1 = tasks().find(x => x.id === dg.id);
  await staff('olive@grayco-cs.com', { op: 'set', id: a5.id, pid: 'PC3' });
  const dg2 = tasks().find(x => x.id === dg.id);
  ok('A14 the digest follows: one set → "1 more receipt"; both set → the digest To-Do is done', /1 more receipt on/.test(dg1.label) && !dg1.done && dg2.done === true, [dg1.label, dg2.done]);
}
/* the sweep: the CRM gave the expense its job (📥 Needs a job, the expense form …) → resolved on the next look */
{
  const a = (await staff('olive@grayco-cs.com', { op: 'flag', items: [crewItem('EXP7', { amt: 77, vendor: 'Ace' })] })).d.made[0];
  KV.expenses = [{ id: 'EXP7', amt: 77, vendor: 'Ace', pid: 'PA1', matchedBy: 'Olive Office' }];
  await staff('olive@grayco-cs.com', null, true);
  const x = alerts().find(z => z.id === a.id), tk = tasks().filter(t => t.poGuard === a.id);
  ok('A15 set anywhere in the CRM (the expense got job Demo Roof A) → the next look resolves the alert and its To-Dos ("Olive Office")', x.status === 'resolved' && x.setPid === 'PA1' && x.resolvedBy === 'Olive Office' && tk.length && tk.every(t => t.done), [x, tk]);
}
/* the sub portal */
let SR1, SR2, ALS;
{
  /* Zedd's own schedule says Demo Roof A today (SUBSCHED, the server-only store) */
  T.gc_lead_inbox_kv.push({ key: 'gc_sub_sched', value: { v: 1, list: { SS1: { id: 'SS1', subId: SUB.id, pid: 'PA1', start: TODAY, end: TODAY, status: 'active' } } }, updated_at: now() });
  const withPo = await sub('p-receipt', { po: 'B314', amount: 120.5, vendor: 'Sherwin Williams', date: TODAY });
  const ev1 = T.gc_sub_event.filter(e => e.kind === 'receipt').pop() || {};
  ok('A16 sub portal 🧾 Send a receipt with the PO of one of their jobs (B314) → on Demo Bath B, a gc_sub_event "receipt" (for the CRM), no alert', withPo.st === 200 && withPo.d.needsPo === false && withPo.d.receipt.pid === 'PB2' && withPo.d.receipt.po === 'B314' && ev1.project_id === 'PB2' && ev1.data.amount === 120.5 && !alerts().some(a => a.src === 'sub'), withPo.d);
  PUSHES.length = 0; const msgs0 = T.gc_portal_msg.length;
  const noPo = await sub('p-receipt', { amount: 64.1, vendor: 'Home Depot', date: TODAY });
  SR1 = noPo.d.receipt; ALS = alerts().find(a => a.src === 'sub' && a.srid === SR1.id) || {};
  const m = T.gc_portal_msg.slice(msgs0).find(x => x.party === 's:' + SUB.id) || {};
  ok('A17 sub receipt with NO PO → the alert; the suggestion = Demo Roof A ("on that job that day (their schedule)") shown back to the sub', noPo.st === 200 && noPo.d.needsPo === true && noPo.d.suggestion && noPo.d.suggestion.pid === 'PA1' && /their schedule/.test(noPo.d.suggestion.why) && ALS.status === 'open', noPo.d);
  ok('A18 … admin + office To-Do + push "🧾 No PO — Zedd Drywall LLC (sub), $64.10, Home Depot, …", the PM (Sam) too, and the sub a message in their portal thread on that job "🧾 Add the PO for your receipt …"',
    tasks().some(t => t.id === 'poguard_' + ALS.id && /No PO — Zedd Drywall LLC \(sub\), \$64\.10, Home Depot/.test(t.label)) && pushesTo('olive@grayco-cs.com', /Zedd/).length === 1 && pushesTo('sbiffle@grayco-cs.com', /Zedd/).length === 1 &&
    m.project_id === 'PA1' && m.side === 'gc' && /Add the PO for your receipt: \$64\.10 at Home Depot/.test(m.text), { m, p: PUSHES.map(p => p.to) });
  const home = await sub('p-home', {});
  const need = (home.d.poGuard.poNeeded || []).find(n => n.id === SR1.id), rr = (home.d.poGuard.receipts || []).find(x => x.id === SR1.id);
  ok('A19 the sub\'s home: the receipt waits for its PO (needsPo, with the suggestion) and is in "Needs you" (poNeeded)', !!need && need.sug.pid === 'PA1' && rr && rr.needsPo === true && !rr.locked, home.d.poGuard);
  const msgs1 = T.gc_portal_msg.length;
  const ask = await staff('olive@grayco-cs.com', { op: 'ask', id: ALS.id });
  const am = T.gc_portal_msg.slice(msgs1)[0] || {};
  const home2 = await sub('p-home', {});
  ok('A20 💬 Ask for the PO (office) → the sub\'s portal thread on that job: "💬 What PO is this receipt for? $64.10 at Home Depot on …" (in the portal, never an e-mail); their home shows the question',
    ask.st === 200 && ask.d.via === 'portal' && am.party === 's:' + SUB.id && am.project_id === 'PA1' && /^💬 What PO is this receipt for\? \$64\.10 at Home Depot on/.test(am.text) && /What PO is this receipt for/.test(((home2.d.poGuard.poNeeded || [])[0] || {}).ask), [ask.d, am]);
  const other = await sub('p-receipt-po', { id: SR1.id, projectId: 'PC3' }, SESS2);
  const notMine = await sub('p-receipt-po', { id: SR1.id, projectId: 'PC3' });
  ok('A21 another sub can\'t touch it (404); Zedd can\'t put it on a job that is not his (404)', other.st === 404 && notMine.st === 404, [other, notMine]);
  const fix = await sub('p-receipt-po', { id: SR1.id, po: 'k729' });
  const ev2 = T.gc_sub_event.filter(e => e.kind === 'receipt').pop() || {};
  const al = alerts().find(a => a.id === ALS.id);
  ok('A22 the sub ✏️ Adds PO "k729" → Demo Roof A; an event op "po" for the CRM; the alert is resolved and its To-Dos done', fix.st === 200 && fix.d.receipt.pid === 'PA1' && ev2.data.op === 'po' && ev2.data.pid === 'PA1' && al.status === 'resolved' && tasks().filter(t => t.poGuard === ALS.id).every(t => t.done), [fix.d, al]);
  const fix2 = await sub('p-receipt-po', { id: SR1.id, po: 'B314' });
  KV.expenses = [{ id: 'SPR_' + SR1.id, pid: 'PB2', amt: 64.1, approved: true, _posted: true }];
  const locked = await sub('p-receipt-po', { id: SR1.id, po: 'K729' });
  const home3 = await sub('p-home', {});
  ok('A23 they can fix it again until GrayCo approved it (B314 ok); approved → 409 "already approved", and their list shows it locked', fix2.st === 200 && fix2.d.receipt.po === 'B314' && locked.st === 409 && /already approved/.test(locked.d.error) && ((home3.d.poGuard.receipts || []).find(x => x.id === SR1.id) || {}).locked === true, [fix2.d, locked]);
  KV.expenses = [];
  const typoPo = await sub('p-receipt', { po: 'ZZ-0001', amount: 9.99, vendor: 'QuikTrip', date: TODAY, lang: 'es' });
  SR2 = typoPo.d.receipt;
  ok('A24 a PO that is not one of their jobs (ZZ-0001) → kept on it, but No-PO alert (badPo)', typoPo.d.needsPo === true && typoPo.d.badPo === true && alerts().some(a => a.srid === SR2.id && a.badPo && a.po === 'ZZ-0001'), typoPo.d);
  const bad = await sub('p-receipt', { amount: 0, vendor: 'X' }), bad2 = await sub('p-receipt', { amount: 10, vendor: '' , lang: 'es' });
  ok('A24 guards: amount 0 → 400, no store → 400 (Spanish when asked)', bad.st === 400 && bad2.st === 400 && /tienda/.test(bad2.d.error), [bad, bad2]);
  const offSet = await staff('olive@grayco-cs.com', { op: 'set', id: alerts().find(a => a.srid === SR2.id).id, pid: 'PA1' });
  const v = T.gc_lead_inbox_kv.find(r => r.key === PG.SUBR_KEY).value.list[SR2.id];
  ok('A25 the office sets it in the CRM → the sub\'s own receipt shows the job / PO too', offSet.st === 200 && v.pid === 'PA1' && v.po === 'K729', [offSet.d, v]);
}
/* e-mailed receipts */
{
  const store = async (buf, type, name) => ({ stored: true, ref: 'sb:crm-files/' + sha(buf) + '.pdf', hash: sha(buf) });
  let LIST = [];
  const flagged = [];
  const deps = (extra) => Object.assign({ storeFile: store, kvListRead: async () => ({ list: LIST }), kvListUpdate: async (k, fn) => { const r = fn(LIST.slice()); if (r && r.list) LIST = r.list; return { ok: true }; }, crmData: async () => ({ projects: KV.projects, users: USERS, vendors: [SUB, SUB2] }), poGuard: async (rec) => { flagged.push(rec); return { ok: true }; } }, extra || {});
  const f = n => ({ name: 'r' + n + '.pdf', type: 'application/pdf', size: 100, buf: Buffer.from('%PDF-1.4 receipt ' + n) });
  const SIx = require(path.join(BUILD, 'netlify/functions/_lib/subinv.js'));
  const realAnalyze = SIx.analyze; SIx.analyze = async () => ({ v: 1, route: 'match', why: 'no job matched', read: { vendor: 'Home Depot', total: 51.2, date: TODAY }, top: [] });
  const r1 = await MM.fromEmail({ messageId: '<m1@x>', from: { email: 'carl@grayco-cs.com', name: 'Carl Crew' }, subject: 'Receipt for PO-2026-0012', text: 'thanks', files: [f(1)] }, 'receipt', deps());
  const rec1 = LIST.find(x => x.id === r1.id) || {};
  const r2 = await MM.fromEmail({ messageId: '<m2@x>', from: { email: 'carl@grayco-cs.com', name: 'Carl Crew' }, subject: 'my receipt', text: 'from the store', files: [f(2)] }, 'receipt', deps());
  SIx.analyze = realAnalyze;
  ok('A26 e-mailed receipt: "PO-2026-0012" in the subject → booked on Demo Bath B (the PO wins; route book); no PO anywhere → the No-PO alert is raised (once kept)',
    rec1.si && rec1.si.route === 'book' && rec1.si.job.pid === 'PB2' && /PO PO-2026-0012 in the e-mail/.test(rec1.si.why) && !flagged.some(x => x.id === r1.id) && r2.noPo === true && flagged.length === 1 && flagged[0].id === r2.id, { rec1: rec1.si, r2, flagged: flagged.map(x => x.id) });
  const it = PG.mailItem(Object.assign({}, flagged[0], { si: { read: { vendor: 'Home Depot', total: 51.2, date: TODAY } } }), { users: USERS, vendors: [SUB] });
  ok('A27 … the e-mailed receipt\'s person = the staff member who sent it (Carl, crew) → his suggestion / his notices', it.by.kind === 'crew' && it.by.email === 'carl@grayco-cs.com' && it.amt === 51.2 && it.key === 'mail:' + r2.id, it);
}
if (process.argv.includes('--node-only')) { const n = R.filter(Boolean).length; console.log('\nPOGUARD (node) ' + n + '/' + R.length + ' passed'); process.exit(n === R.length ? 0 : 1); }

/* ─── B. the CRM / GrayCo Field (index.html's own scripts in a stub page) ─── */
const { chromium } = require(PWDIR);
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = (re) => { const i = html.search(re); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const S_LOG = block(/FIELD: Log Expense \(receipt photo \+ manual price\/store\/date -> job expense\)/), S_SUB = block(/__GC_PATCH_SUB__ \n|GrayCo — THE PORTALS, CRM SIDE/), S_PG = block(/__GC_PATCH_POGUARD__ — /);
ok('B0 index.html has the scripts: GrayCo Field\'s 🧾 Log Expense, the SUB filing block (with the receipt branch), patch POGUARD', S_LOG.length > 2000 && S_SUB.length > 10000 && /ev\.kind === 'receipt'/.test(S_SUB) && S_PG.length > 10000, [S_LOG.length, S_SUB.length, S_PG.length]);
let ME = 'carl@grayco-cs.com';
const cerrs = [];
async function crmPage(email, extra){
  ME = email;
  const C = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  await C.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.pathname === '/.netlify/functions/po-guard') { resetAll(); const resp = await PGF.handler({ httpMethod: rq.method(), headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:' + ME }, queryStringParameters: Object.fromEntries(u.searchParams.entries()), body: rq.postData() || '' }); return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body }); }
    if (u.pathname === '/.netlify/functions/portal-access') { resetAll(); const resp = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:wjohnson@grayco-cs.com' }, body: rq.postData() || '{}' }); return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body }); }
    if (u.host === 'crm.test') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main><div><div id="_todoMount"></div></div></main></body></html>' });
    return r.fulfill({ status: 404, body: '' });
  });
  const P = await C.newPage(); P.on('pageerror', e => cerrs.push(String(e.message).slice(0, 200))); P.on('dialog', d => d.accept().catch(() => {}));
  await P.goto('https://crm.test/');
  await P.evaluate(([projects, users, schedule, email, expenses]) => {
    const real = Date.now; let skew = 0; Date.now = () => real() + skew; window.__skew = v => { skew = v; };
    const IDB = { expenses: expenses.slice(), projectDocs: [] }; window.idbGet = async k => IDB[k]; window.idbSet = async (k, v) => { IDB[k] = v; if (k === 'expenses') window._crm.expenses = v; };
    window._crm = { projects, users, schedule, expenses: expenses.slice(), vendors: [], subs: [], invoices: [], projectDocs: [], punch: [] };
    window._setExpenses = fn => { window._crm.expenses = typeof fn === 'function' ? fn(window._crm.expenses) : fn; IDB.expenses = window._crm.expenses; };
    window._setInvoices = fn => { window._crm.invoices = fn(window._crm.invoices); };
    window._setProjectDocs = fn => { window._crm.projectDocs = fn(window._crm.projectDocs); };
    window._setProjects = fn => { window._crm.projects = fn(window._crm.projects); };
    window._supaUpsertNow = () => Promise.resolve(true); window._gcPushAll = () => {};
    window.__GC_AUTH__ = { email: () => email, mode: () => 'google', isAdmin: () => email === 'wjohnson@grayco-cs.com' };
    localStorage.setItem('grayco_user', email);
  }, [KV.projects, USERS, SCHED, email, extra || []]);
  for (const src of [S_LOG, S_SUB, S_PG]) await P.addScriptTag({ content: src });
  await waitFor(() => P.evaluate(() => !!(window._gcFieldLogExpense && window._gcFieldLogExpense.__pog)), 5000);
  return { C, P };
}
const exps = P => P.evaluate(() => window._crm.expenses);
{
  const { C, P } = await crmPage('carl@grayco-cs.com');
  await P.evaluate(() => window._gcFieldLogExpense(null));
  await P.waitForSelector('#_pgPo');
  const opts = await P.evaluate(() => [...document.querySelectorAll('#_pgPo option')].map(o => o.textContent));
  ok('B1 GrayCo Field 🧾 Log Expense has a PO box under the job: the POs of HIS active jobs (Demo Roof A — his crew; Demo Bath B — on today\'s schedule), ✏️ Type a PO…, ❓ I don\'t know the PO',
    opts.includes('K729 · Demo Roof A') && opts.includes('B314 · Demo Bath B') && !opts.some(o => /Demo Kitchen C/.test(o)) && opts.includes('✏️ Type a PO…') && opts.includes('❓ I don\'t know the PO'), opts);
  await P.selectOption('#_pgPo', 'pid:PB2');
  const jobv = await P.evaluate(() => document.getElementById('_leJob').value);
  await P.fill('#_leStore', 'Lowes'); await P.fill('#_lePrice', '23.45');
  await shot(P, 'poguard_b1_field');
  await P.click('#_leSave');
  const e1 = await waitFor(async () => (await exps(P)).find(x => x.amt === 23.45 && x.byEmail), 9000);
  ok('B2 picking the PO picks the job; Save → the expense is on Demo Bath B with PO B314 and who sent it (Carl)', jobv === 'PB2' && e1 && e1.pid === 'PB2' && e1.po === 'B314' && e1.byEmail === 'carl@grayco-cs.com' && e1.by === 'Carl Crew', { jobv, e1 });
  await sleep(1300);
  await P.evaluate(() => window._gcFieldLogExpense(null));
  await P.waitForSelector('#_pgPo');
  await P.selectOption('#_pgPo', '__type'); await P.fill('#_pgPoTxt', 'k729');
  const typed = await P.evaluate(() => ({ job: document.getElementById('_leJob').value, hint: document.getElementById('_pgPoHint').textContent }));
  await P.fill('#_pgPoTxt', 'Q12345');
  const typed2 = await P.evaluate(() => ({ job: document.getElementById('_leJob').value, hint: document.getElementById('_pgPoHint').textContent }));
  ok('B3 typing the PO: "k729" → Demo Roof A picked ("✓ PO K729 — Demo Roof A"); "Q12345" → "not a job\'s PO — it goes to the office"', typed.job === 'PA1' && /K729 — Demo Roof A/.test(typed.hint) && /not a job's PO/.test(typed2.hint), [typed, typed2]);
  await P.evaluate(() => { document.getElementById('_leJob').value = ''; });
  await P.selectOption('#_pgPo', ''); await P.fill('#_leStore', 'Home Depot'); await P.fill('#_lePrice', '61.07');
  const n0 = (await exps(P)).length;
  await P.click('#_leSave');
  const armed = await P.evaluate(() => document.getElementById('_leMsg').textContent);
  const n1 = (await exps(P)).length;
  ok('B4 no PO and no job → Save asks once ("Tap Save again to send it without one …"); nothing saved yet', /Tap Save again/.test(armed) && n1 === n0, armed);
  await P.click('#_leSave');
  await P.waitForSelector('#_pgUse', { timeout: 10000 }).catch(() => {});
  const e2 = (await exps(P)).find(x => x.amt === 61.07) || {};
  const box = await P.evaluate(() => (document.getElementById('_leMsg') || {}).innerText || '');
  const al = alerts().find(a => a.expId === e2.id) || {};
  ok('B5 second Save → saved WITHOUT a job (pending, no PO, Carl) and flagged at once; the phone shows "Suggested: Demo Bath B (PO B314) — on that job that day" with ✓ Use',
    e2.id && !e2.pid && e2.needsPo === true && e2.status === 'pending' && e2.byEmail === 'carl@grayco-cs.com' && al.status === 'open' && /Suggested: Demo Bath B \(PO B314\) — on that job that day/.test(box), { e2, box, al });
  await shot(P, 'poguard_b5_nopo');
  await P.click('#_pgUse');
  const e2b = await waitFor(async () => { const x = (await exps(P)).find(z => z.id === e2.id); return x && x.pid ? x : null; }, 8000);
  const al2 = alerts().find(a => a.expId === e2.id) || {};
  ok('B6 ✓ Use → the expense is on Demo Bath B with PO B314; the alert is resolved and its To-Dos are done', e2b && e2b.pid === 'PB2' && e2b.po === 'B314' && al2.status === 'resolved' && tasks().filter(t => t.poGuard === al2.id).every(t => t.done), { e2b, al2 });
  /* one more with ❓ I don't know, left open, for the notice */
  await sleep(1300);
  await P.evaluate(() => window._gcFieldLogExpense(null)); await P.waitForSelector('#_pgPo');
  await P.evaluate(() => { document.getElementById('_leJob').value = ''; });
  await P.selectOption('#_pgPo', '__dk'); await P.fill('#_leStore', 'Ace Hardware'); await P.fill('#_lePrice', '15.5');
  await P.click('#_leSave'); await P.waitForSelector('#_pgDone', { timeout: 10000 }).catch(() => {}); await P.click('#_pgDone').catch(() => {});
  await P.evaluate(() => window._gcPoGuard.load());
  const note = await waitFor(() => P.evaluate(() => { const n = document.getElementById('gc-poguard-note'); return n ? n.innerText : null; }), 6000);
  ok('B7 ❓ I don\'t know the PO → saved in one tap; Carl\'s own notice: "🧾 Add the PO for your receipt: $15.50 at Ace Hardware … ✏️ Add PO"', /Add the PO for your receipt: \$15\.50 at Ace Hardware/.test(note || '') && /Add PO/.test(note || ''), note);
  await P.click('#gc-poguard-note span');
  const panel = await waitFor(() => P.evaluate(() => { const o = document.getElementById('gc-pog-ov'); return o ? o.innerText : null; }), 5000);
  ok('B8 the notice opens "🧾 My receipts & POs" with his receipt and the suggestion', /My receipts & POs/.test(panel || '') && /Ace Hardware/.test(panel || '') && /Suggested:\s*Demo Bath B/.test(panel || '') && !/Dan Demo/.test(panel || ''), panel);
  await C.close();
}
{
  /* Olive (office): the To-Do chip, the screen, ✓ Use / Save / 💬 Ask; the CRM's own expense with no job is flagged */
  const msgs0 = T.gc_portal_msg.length;
  const sr = await sub('p-receipt', { amount: 88.8, vendor: 'Floor & Decor', date: TODAY });
  const { C, P } = await crmPage('olive@grayco-cs.com', [{ id: 'EXPOF1', amt: 33, vendor: 'Ace', by: 'Olive Office', byEmail: 'olive@grayco-cs.com', date: TODAY, enteredAt: now(), source: 'crm' }]);
  const made = await P.evaluate(() => window._gcPoGuard.scan());
  ok('B9 the office computer\'s look: a CRM expense with no job / no PO (entered by Olive) → flagged (card charges are left to the card import)', made === 1 && alerts().some(a => a.expId === 'EXPOF1' && a.by.kind === 'office'), made);
  await P.evaluate(() => window._gcPoGuard.load()); 
  const chip = await waitFor(() => P.evaluate(() => { window._gcPoGuard.paint(); const c = document.querySelector('#gc-poguard-chip button'); return c ? c.textContent : null; }), 6000);
  ok('B10 the To-Do shows "🧾 No PO (n)" to the office', /🧾 No PO \(\d+\)/.test(chip || ''), chip);
  await P.click('#gc-poguard-chip button');
  await P.waitForSelector('#gc-pog-ov .gcpog-row');
  const rows = await P.evaluate(() => [...document.querySelectorAll('#gc-pog-ov .gcpog-row')].map(r => r.innerText));
  const subRow = rows.findIndex(t => /Floor & Decor/.test(t));
  ok('B11 the screen lists every open one (Carl\'s, Dan\'s, the sub\'s) with "Suggested: … ✓ Use", a job / PO picker and 💬 Ask for the PO', subRow > -1 && rows.some(t => /Ace Hardware/.test(t)) && rows.some(t => /Dan Demo/.test(t)) && /Suggested:\s*Demo Roof A/.test(rows[subRow]) && /Ask for the PO/.test(rows[subRow]), rows.slice(0, 6));
  await shot(P, 'poguard_b11_office');
  const subSel = '#gc-pog-ov .gcpog-row:nth-of-type(' + 1 + ')';
  const rowEl = (await P.$$('#gc-pog-ov .gcpog-row'))[subRow];
  await (await rowEl.$('[data-pg="ask"]')).click();
  const pre = await (await rowEl.$('[data-pg="asktext"]')).inputValue();
  await (await rowEl.$('[data-pg="asksend"]')).click();
  const m = await waitFor(() => T.gc_portal_msg.slice(msgs0).find(x => /What PO is this receipt for\? \$88\.80/.test(x.text)), 6000);
  ok('B12 💬 Ask for the PO: prefilled "What PO is this receipt for? $88.80 at Floor & Decor on …" → the sub\'s portal thread on the suggested job (no e-mail)', /^What PO is this receipt for\? \$88\.80 at Floor & Decor on \d+\/\d+\.$/.test(pre) && m && m.party === 's:' + SUB.id && m.project_id === 'PA1' && m.side === 'gc', { pre, m });
  const aceIdx = rows.findIndex(t => /Ace Hardware/.test(t));
  await (await (await P.$$('#gc-pog-ov .gcpog-row'))[aceIdx].$('[data-pg="use"]')).click();
  const aceAl = await waitFor(() => { const a = alerts().find(z => z.vendor === 'Ace Hardware'); return a && a.status === 'resolved' ? a : null; }, 6000);
  ok('B13 ✓ Use on Carl\'s receipt (office) → resolved by Olive Office on Demo Bath B', aceAl && aceAl.setPid === 'PB2' && aceAl.resolvedBy === 'Olive Office', aceAl);
  await P.evaluate(() => { const o = document.getElementById('gc-pog-ov'); if (o) o.remove(); window._gcPoGuard.open(); });
  await P.waitForSelector('#gc-pog-ov .gcpog-row');
  const rows2 = await P.$$('#gc-pog-ov .gcpog-row'); let ofRow = null;
  for (const r of rows2) if (/\$33\.00, Ace/.test(await r.innerText())) ofRow = r;
  await (await ofRow.$('[data-pg="po"]')).fill('c555'); await (await ofRow.$('[data-pg="save"]')).click();
  const ofE = await waitFor(async () => { const x = (await exps(P)).find(z => z.id === 'EXPOF1'); return x && x.pid ? x : null; }, 6000);
  ok('B14 typing the PO (c555) + Save → the CRM expense gets Demo Kitchen C / C555 and its alert clears', ofE && ofE.pid === 'PC3' && ofE.po === 'c555' && alerts().find(a => a.expId === 'EXPOF1').status === 'resolved', ofE);
  /* the sub's receipts are filed in the CRM (the SUB block → patch POGUARD) */
  await P.evaluate(() => window.__skew(60000));
  await P.evaluate(() => window._gcSubHub.sync());
  const spr = await waitFor(async () => { const l = (await exps(P)).filter(x => /^SPR_/.test(x.id)); return l.length >= 3 ? l : null; }, 10000);
  const s1 = (spr || []).find(x => x.id === 'SPR_' + SR1.id) || {}, s0 = (spr || []).find(x => x.amt === 120.5) || {}, s3 = (spr || []).find(x => x.amt === 88.8) || {};
  ok('B15 sub-portal receipts are filed as PENDING expenses "SPR_<id>": the one with its PO on Demo Bath B; the one the sub fixed later on the job its ✏️ Add PO set (B314); the one with no PO still without a job',
    s0.pid === 'PB2' && s0.po === 'B314' && s0.status === 'pending' && s0.subId === SUB.id && s1.pid === 'PB2' && s1.po === 'B314' && s3.id && !s3.pid && s3.needsPo === true, { s0, s1, s3 });
  ok('no page errors (CRM)', cerrs.length === 0, cerrs.slice(0, 6));
  await C.close();
}
{
  /* Dan (crew): only his own; he can't edit Carl's */
  const { C, P } = await crmPage('dan@grayco-cs.com');
  await P.evaluate(() => window._gcPoGuard.load()); await P.evaluate(() => window._gcPoGuard.open());
  await P.waitForSelector('#gc-pog-ov .gcpog-c');
  const txt = await P.evaluate(() => document.getElementById('gc-pog-ov').innerText);
  const carlAl = alerts().find(a => a.by.email === 'carl@grayco-cs.com' && a.status === 'open');
  const tryIt = carlAl ? await P.evaluate(id => window._gcPoGuard.setPo({ id, src: 'expense' }, { pid: 'PC3' }), carlAl.id) : { error: 'none open' };
  ok('B16 crew (Dan) sees only his own receipts ("My receipts & POs", Store 1–3), none of Carl\'s; setting Carl\'s is refused', /My receipts & POs/.test(txt) && /Store 1/.test(txt) && !/Carl Crew/.test(txt) && (!carlAl || (tryIt && tryIt.ok !== true && /Only the office/.test(tryIt.error))), { tryIt, txt: txt.slice(0, 300) });
  await C.close();
}

/* ─── C. the sub portal (phone) ─── */
async function portalCtx(){
  const ctx = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host !== 'portal.test') return r.abort('blockedbyclient');
    const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
    if (fm) {
      if (fm[1] !== 'portal-access') return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
      resetAll();
      const resp = await PA.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': '10.5.' + (NET++ % 250) + '.1' }, rq.headers()), body: rq.postData() || '' });
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    if (u.pathname === '/' || u.pathname === '/portal.html') return r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(BUILD, 'portal.html'), 'utf8') });
    const f = path.join(BUILD, decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  return ctx;
}
{
  const perrs = [];
  const C = await portalCtx(), P = await C.newPage(); P.on('pageerror', e => perrs.push(String(e.message).slice(0, 200))); P.on('dialog', d => d.accept().catch(() => {}));
  await P.goto('https://portal.test/');
  await P.evaluate(([s]) => { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); }, [SESS]);
  await P.reload();
  const need = await waitFor(() => P.evaluate(() => { const b = document.querySelector('[data-pg-need]'); return b ? b.innerText : null; }), 30000);
  ok('C1 the sub\'s home → "Needs you": "🧾 Add the PO for your receipt: $88.80 · Floor & Decor …" with GrayCo\'s question', /Add the PO for your receipt: \$88\.80/.test(need || '') && /What PO is this receipt for/.test(need || ''), need);
  await shot(P, 'poguard_c1_home');
  await P.click('#pgNewRcpt');
  await P.waitForSelector('#pgPo');
  const o = await P.evaluate(() => [...document.querySelectorAll('#pgPo option')].map(x => x.textContent));
  ok('C2 🧾 Send a receipt / expense: the PO is picked from THEIR jobs (K729 · Demo Roof A, B314 · Demo Bath B — not Demo Kitchen C) + ✏️ Type a PO… + ❓ I don\'t know the PO', o.includes('K729 · Demo Roof A') && o.includes('B314 · Demo Bath B') && !o.some(x => /Kitchen C/.test(x)) && o.includes('✏️ Type a PO…') && o.includes('❓ I don\'t know the PO'), o);
  await P.click('#pgSendBtn');
  const e0 = await P.evaluate(() => document.querySelector('[data-pg-err]').textContent);
  await P.fill('#pgAmt', '19.99'); await P.fill('#pgStore', 'QuikTrip'); await P.click('#pgSendBtn');
  const e1 = await P.evaluate(() => document.querySelector('[data-pg-err]').textContent);
  ok('C3 the form asks for the amount, then the PO ("Pick the PO — or \\"I don\'t know the PO\\"")', /amount/.test(e0) && /Pick the PO/.test(e1), [e0, e1]);
  const ev0 = T.gc_sub_event.filter(e => e.kind === 'receipt').length;
  await P.selectOption('#pgPo', 'PA1'); await P.click('#pgSendBtn');
  const sent = await waitFor(() => { const e = T.gc_sub_event.filter(x => x.kind === 'receipt'); return e.length > ev0 ? e[e.length - 1] : null; }, 8000);
  ok('C4 with the PO picked → sent on Demo Roof A (PO K729), no alert', sent && sent.project_id === 'PA1' && sent.data.po === 'K729' && sent.data.amount === 19.99 && !alerts().some(a => a.srid === sent.data.receiptId), sent && sent.data);
  await waitFor(() => P.evaluate(() => !document.querySelector('.sheet')), 6000);
  await P.click('#pgNewRcpt'); await P.waitForSelector('#pgPo');
  await P.selectOption('#pgPo', '__dk'); await P.fill('#pgAmt', '7.25'); await P.fill('#pgStore', 'Shell'); await P.click('#pgSendBtn');
  const after = await waitFor(() => P.evaluate(() => { const b = document.querySelector('[data-pg-after]'); return b ? b.innerText : null; }), 8000);
  ok('C5 ❓ I don\'t know the PO → "Sent — it has no PO yet …" + "Is it this job? Demo Roof A (PO K729)" ✓ Use (their own schedule today)', /no PO yet/.test(after || '') && /Is it this job\? Demo Roof A \(PO# K729\)/.test(after || ''), after);
  await shot(P, 'poguard_c5_sug');
  await P.click('#pgUseSug');
  const shellAl = await waitFor(() => { const a = alerts().find(z => z.vendor === 'Shell'); return a && a.status === 'resolved' ? a : null; }, 8000);
  ok('C6 ✓ Use → the receipt is on Demo Roof A; GrayCo\'s alert is resolved by the sub', shellAl && shellAl.setPid === 'PA1' && /Zedd Drywall LLC \(sub\)/.test(shellAl.resolvedBy), shellAl);
  await waitFor(() => P.evaluate(() => !document.querySelector('.sheet')), 6000);
  await P.reload();
  await waitFor(() => P.evaluate(() => !!document.querySelector('[data-pg-need]')), 20000);
  await P.click('[data-pg-need]'); await P.waitForSelector('#pgPoFix');
  const fixTxt = await P.evaluate(() => document.querySelector('.sheet').innerText);
  await P.click('[data-pg-use]'); await P.click('#pgPoSave');
  const fdAl = await waitFor(() => { const a = alerts().find(z => z.vendor === 'Floor & Decor'); return a && a.status === 'resolved' ? a : null; }, 8000);
  const gone = await waitFor(() => P.evaluate(() => !document.querySelector('[data-pg-need]') ? true : null), 8000);
  ok('C7 ✏️ Add PO from "Needs you": GrayCo\'s question + the suggested job (✓ Use) → saved; the alert clears and the row leaves "Needs you"', /What PO is this receipt for/.test(fixTxt) && /Demo Roof A/.test(fixTxt) && fdAl && fdAl.setPid === 'PA1' && gone === true, { fixTxt, fdAl });
  KV.expenses = [{ id: 'SPR_' + SR1.id, pid: 'PB2', amt: 64.1, approved: true, _posted: true }];
  await P.reload(); await waitFor(() => P.evaluate(() => document.querySelectorAll('[data-pg-rcpt]').length >= 4), 20000);
  const list = await P.evaluate(() => [...document.querySelectorAll('[data-pg-rcpt]')].map(x => x.innerText));
  const hd = list.find(t => /Home Depot/.test(t)) || '';
  ok('C8 "🧾 Your receipts": each with its PO / job and ✏️ to fix it; the one GrayCo approved is locked ("Approved by GrayCo", no ✏️)', list.length >= 5 && list.filter(t => /PO# K729 · Demo Roof A/.test(t) && /✏️/.test(t)).length >= 3 && /Approved by GrayCo/.test(hd) && !/✏️/.test(hd), list.slice(0, 6));
  KV.expenses = [];
  await P.evaluate(() => window.GCPartner.setLang('es')); await sleep(600); await P.reload();
  const es = await waitFor(() => P.evaluate(() => { const b = document.getElementById('pgNewRcpt'); return b ? b.textContent : null; }), 20000);
  ok('C9 Español: "🧾 Enviar un recibo / gasto"', es === '🧾 Enviar un recibo / gasto', es);
  await P.evaluate(() => { try { window.GCPartner.setLang('en'); } catch (e) {} });
  ok('no page errors (sub portal)', perrs.length === 0, perrs.slice(0, 6));
  await C.close();
}
await browser.close();
const n = R.filter(Boolean).length;
console.log('\nPOGUARD ' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
