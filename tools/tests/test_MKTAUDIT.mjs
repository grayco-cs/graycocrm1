// test_MKTAUDIT.mjs <build-dir> — the 📣 Marketing audit (patches MKTFIX1–4 + the function changes), made-up data only.
//   A. The functions (run in this process against an in-memory database): the Marketing Manager's referral view, his
//      approvals list, roof-check sign-ups, coupons and the newsletter draft never carry a customer's name.
//   B. The Marketing Manager on a database that is NOT locked (live while docs/security-lockdown.sql is not run), not
//      on the employee list yet: his first sign-in opens the Marketing layout; nothing of the company's (customers,
//      jobs, to-dos, approvals) lands in his browser; no request for other keys or refused staff function leaves it;
//      the live feed drops other keys; his screens show no button that can only fail.
//   C. An admin: 🎃 Events & community "+ Add an event" / "Open" work again (Free roof check events took them over);
//      🏠 Free roof check events still opens its own form; the referral look-up asks for the last 4.
//   On r16 (before the patches) parts B and C FAIL — that is the bug.
// Needs the scratch harness S/wN/harness_N.mjs (offline browser, in-memory gc_kv with a realtime mock).
import path from 'path';
import { createRequire } from 'module';
const S = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { computer, signIn, sleep, ACCOUNTS, cset, cget, cloud, resetCloud } = await import(S + '/wN/harness_N.mjs');
const BUILD = path.resolve(process.argv[2] || '.'), F = BUILD + '/netlify/functions';
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
async function until(fn, ms = 15000){ const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(300); } return false; }

/* ── the people ── */
const MM = 'mm@grayco-cs.com', ADMIN = 'wjohnson@grayco-cs.com';
ACCOUNTS[MM] = { pw: 'Mm-Correct-1', id: 'u-mm', role: 'staff' };
const STAFF = { [ADMIN]: { email: ADMIN, name: 'Wesley Johnson', role: 'admin', active: true, profile: null, mkt_active: false },
  [MM]: { email: MM, name: 'Malcolm Demo', role: 'staff', active: false, profile: 'marketing', mkt_active: true } };
const emailOfTok = tok => { const m = /^utok-(u-[a-z]+)-/.exec(tok || ''); return m ? Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === m[1]) || null : null; };
const PII = ['Demo Customer-Kline', 'kline@demo.example', '(901) 555-0100', '88 Maple Dr', 'Demo Customer-Stone', 'stone@demo.example', '12 Oak St', 'Demo Customer-Reyes', 'reyes@demo.example',
  'Demo Winner-Gray', 'Demo Neighbor-Ash', 'COST-SECRET', 'INVOICE-SECRET', 'office-only deductible', 'Demo Customer-Feed'];
const now = Date.now(), iso = d => new Date(now - d * 864e5).toISOString();
const inbox = new Map();
function seed(){
  resetCloud(); inbox.clear();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin' }, { id: 'u4', name: 'Pat PM', email: 'pm@grayco-cs.com', role: 'Project Manager' }]);   /* he is not on it yet */
  cset('projects', [{ id: 'PW', name: 'Demo Customer-Kline Water', client: 'Demo Customer-Kline', clientEmail: 'kline@demo.example', address: '88 Maple Dr, Germantown, TN 38138', status: 'Completed', type: 'Water mitigation', completedAt: iso(9), marketingOk: true, contract: 18400, costNote: 'COST-SECRET', leadId: 'L1' },
    { id: 'PR', name: 'Demo Customer-Stone Roof', client: 'Demo Customer-Stone', clientEmail: 'stone@demo.example', address: '12 Oak St, Bartlett, TN 38135', status: 'Completed', type: 'Roofing', completedAt: iso(12), contract: 21700 }]);
  cset('leads', [{ id: 'L1', name: 'Demo Customer-Kline', contact: { email: 'kline@demo.example', phone: '(901) 555-0100' }, city: 'Germantown', type: 'Water damage', stage: 'Won', createdAt: iso(30), attrib: { utm_source: 'facebook', utm_campaign: 'soc-water' } }]);
  cset('customers', [{ id: 'C1', name: 'Demo Customer-Kline', email: 'kline@demo.example', phone: '(901) 555-0100' }]);
  cset('invoices', [{ id: 'I1', note: 'INVOICE-SECRET' }]);
  cset('gc_photos', [{ id: 'ph1', jobId: 'PW', ref: 'sb:crm-files/demo-after.jpg', tag: 'After', at: iso(9) }, { id: 'ph2', jobId: 'PR', ref: 'sb:crm-files/demo-roof-no-ok.jpg', tag: 'After', at: iso(12) }]);
  cset('gc_office_tasks', JSON.stringify([{ id: 'T1', label: 'Call Demo Customer-Kline about the office-only deductible', assignees: ['office@grayco-cs.com'] }]));
  cset('gc_approval_queue', JSON.stringify([
    { id: 'A1', kind: 'mkt_giveaway', title: '📣 Marketing — giveaway winner e-mail: Demo Winner-Gray (2026-10)', to: 'Demo Winner-Gray <gray@demo.example>', subject: 'You won the GrayCo giveaway!', status: 'waiting', step: 'admin', steps: ['admin'], createdAt: iso(0.2) },
    { id: 'A2', kind: 'mkt_campaign', title: '📣 Marketing — e-mail “Fall check”', to: '12 customers (all)', subject: 'Demo Customer-Reyes, your fall check', status: 'waiting', step: 'admin', steps: ['admin'], createdAt: iso(0.1) }]));
  cset('gc_company_address', { current: '4014 Broadway Rd, Bartlett, TN 38135' });
  cset('gc_mkt_v1', { cfg: { main: { id: 'main', at: iso(1) } },   /* stage 1: the start setting */
    reviews: { r2: { id: 'r2', author: 'K. Roe', rating: 2, text: 'Took too long.', date: iso(4).slice(0, 10), at: iso(4) } },
    referrals: { rf1: { id: 'rf1', referrer: 'Demo Customer-Kline', referrerEmail: 'kline@demo.example', referred: 'Demo Customer-Reyes', status: 'Referred', at: iso(5) } },
    events: { ev1: { id: 'ev1', name: 'Trunk or Treat', date: '2026-10-25', at: iso(6) } } });
  inbox.set('probe', { key: 'probe', value: 1 });
  inbox.set('gc_ref_members', { key: 'gc_ref_members', value: [{ id: 'm1', name: 'Demo Customer-Kline', email: 'kline@demo.example', phone: '(901) 555-0100', code: 'KLINE1234567', createdAt: iso(20) }] });
  inbox.set('gc_ref_referrals', { key: 'gc_ref_referrals', value: [{ id: 'rr1', memberId: 'm1', name: 'Demo Customer-Reyes', email: 'reyes@demo.example', phone: '(901) 555-0177', status: 'job', createdAt: iso(10) }] });
  inbox.set('gc_event_signups', { key: 'gc_event_signups', value: { ev9: [{ name: 'Demo Neighbor-Ash', phone: '(901) 555-0123', email: 'ash@demo.example', address: '9 Elm St', slot: '09:00', at: iso(1) }] } });
}
/* ── the functions, here, against the same database ── */
Object.assign(process.env, { SUPABASE_URL: 'https://fn.sb.test', SUPABASE_SERVICE_KEY: 'svc', CRM_URL: 'https://app.local', SITE_ORIGIN: 'https://app.local', MKT2_SECRET: 'a-long-test-secret-123456' });
['ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'STAFF_EMAILS'].forEach(k => delete process.env[k]);
function J(st, body){ return { ok: st >= 200 && st < 300, status: st, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => 'application/json' } }; }
function keysOf(q){ if (q.startsWith('eq.')) return [q.slice(3)]; if (q.startsWith('in.(')) return q.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return null; }
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  let body = null; try { body = typeof init.body === 'string' && /^[\[{]/.test(init.body) ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
  if (u.host !== 'fn.sb.test') return J(404, { error: 'offline' });
  if (u.pathname === '/auth/v1/user') { const e = emailOfTok(String(hd.Authorization || hd.authorization || '').replace('Bearer ', '')); return e ? J(200, { id: ACCOUNTS[e].id, email: e }) : J(401, {}); }
  if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').slice(3); return J(200, e ? (STAFF[e] ? [Object.assign({}, STAFF[e])] : []) : Object.values(STAFF)); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'GET') { const ks = keysOf(u.searchParams.get('key') || ''); return J(200, (ks || [...cloud.keys()]).map(k => cloud.get(k)).filter(Boolean).map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at }))); }
    (Array.isArray(body) ? body : [body]).forEach(b => { if (!b) return; let v = b.value; if (typeof v === 'string' && /^[\[{]/.test(v) && !['gc_office_tasks', 'gc_approval_queue'].includes(b.key)) { try { v = JSON.parse(v); } catch (e) {} } cset(b.key || (u.searchParams.get('key') || '').slice(3), v); });
    return J(201, []);
  }
  if (u.pathname === '/rest/v1/gc_lead_inbox_kv') { if (m === 'GET') { const ks = keysOf(u.searchParams.get('key') || ''); return J(200, (ks || [...inbox.keys()]).map(k => inbox.get(k)).filter(Boolean)); } const b = Array.isArray(body) ? body[0] : body; if (b && b.key) inbox.set(b.key, { key: b.key, value: b.value }); return J(201, b ? [inbox.get(b.key)] : []); }
  return J(m === 'GET' ? 200 : 201, []);
};
const LIVE = {}; ['soc', 'mkt', 'mkt2', 'referral', 'portal'].forEach(n => { LIVE[n] = require(F + '/' + n + '.js'); });
async function callFn(name, who, body, method = 'POST', qs = {}){
  const tok = 'utok-' + ACCOUNTS[who].id + '-1';
  const r = await LIVE[name].handler({ httpMethod: method, headers: { origin: 'https://app.local', authorization: 'Bearer ' + tok }, queryStringParameters: qs, body: body ? JSON.stringify(body) : '' });
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (e) {}
  return { status: r.statusCode, j, txt: String(r.body || '') };
}
const hasPII = txt => PII.filter(x => String(txt).indexOf(x) >= 0);

/* ═══ A. the functions ═══ */
seed();
console.log('A. the functions answer the Marketing Manager without customer names');
let r = await callFn('referral', MM, null, 'GET', { list: '1' });
ok(r.status === 200 && r.j.readOnly === true && (r.j.members || []).length === 1 && (r.j.totals || {}).members === 1, '🎁 referral list (his, read-only): the member and the totals are there', r);
ok(!hasPII(r.txt).length && !/KLINE1234567/.test(r.txt), '… without a member name, a referred friend\'s name, a phone, an e-mail or the member code', hasPII(r.txt));
r = await callFn('soc', MM, { op: 'mm_approvals' });
const a1 = (r.j.items || []).find(x => x.id === 'A1'), a2 = (r.j.items || []).find(x => x.id === 'A2');
ok(r.status === 200 && a1 && a2 && !hasPII(r.txt).length && /giveaway winner e-mail/.test(a1.title), '🗳 his approvals list: a giveaway winner e-mail without the winner\'s name, an e-mail without the customer\'s first name in the subject', hasPII(r.txt));
r = await callFn('mkt2', MM, { op: 'event_signups', id: 'ev9' });
ok(r.status === 200 && (r.j.list || []).length === 1 && r.j.list[0].slot === '09:00' && !hasPII(r.txt).length && !/555-0123|ash@demo|Elm St/.test(r.txt), '🏠 roof-check sign-ups (his): the slot, never who signed up', r.j);
r = await callFn('mkt2', MM, { op: 'coupon_redeem', code: 'GC100-AAAA-BBBB' });
ok(r.status === 403, '🎟 he cannot redeem a coupon (403)', r.status);
r = await callFn('mkt2', MM, { op: 'newsletter' });
ok(r.status === 200 && r.j.ok === true, '📰 he can draft this month\'s newsletter (a draft — it still waits on Approvals)', r);
r = await callFn('soc', MM, { op: 'mm_kv_read', key: 'gc_mkt_v1' });
ok(r.status === 200 && r.j.value && r.j.value.referrals && !hasPII(r.txt).length, 'the marketing document he reads has no referrer / referred customer names', hasPII(r.txt));
r = await callFn('soc', MM, { op: 'mm_kv_write', key: 'gc_mkt_v1', value: { perms: { job_PR: { id: 'job_PR', jobId: 'PR', marketing: true, at: new Date(Date.now() + 60e3).toISOString() } } } });
const pj = await callFn('soc', MM, { op: 'mm_jobs' }), pf = await callFn('soc', MM, { op: 'mm_file', ref: 'sb:crm-files/demo-roof-no-ok.jpg' });
ok(!(cget('gc_mkt_v1').perms || {}).job_PR && (pj.j.photos || []).length === 1 && pj.j.photos[0].jobId === 'PW' && pf.status === 403, 'he cannot mark a job "the customer said OK" himself: that job\'s photos stay closed to him (403)', { perms: cget('gc_mkt_v1').perms, photos: (pj.j.photos || []).map(x => x.jobId), file: pf.status });
r = await callFn('referral', ADMIN, null, 'GET', { list: '1' });
ok(r.status === 200 && /Demo Customer-Kline/.test(r.txt), '… an admin still sees the members by name');

/* ═══ B. the Marketing Manager on an open database ═══ */
console.log('B. the Marketing Manager on a database that is not locked yet (live today), not on the employee list');
seed();
const net = { fn: [], db: [], dbAll: [] };
async function fnRoute(c){
  await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, async rt => {
    const req = rt.request(), u = new URL(req.url()), name = u.pathname.split('/').pop(), h = req.headers();
    if (/utok-u-mm-/.test(h.authorization || '')) net.fn.push(name);
    const mod = LIVE[name]; if (!mod) return rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    let res; try { res = await mod.handler({ httpMethod: req.method(), path: u.pathname, headers: Object.assign({ origin: 'https://app.local' }, h), queryStringParameters: Object.fromEntries(u.searchParams), body: req.postData() || '' }); } catch (e) { res = { statusCode: 500, body: '{}' }; }
    return rt.fulfill({ status: res.statusCode || 200, headers: Object.assign({ 'content-type': 'application/json' }, res.headers || {}), body: res.isBase64Encoded ? '' : String(res.body || '') });
  });
}
async function staffRows(c){
  await c.ctx.route(u => { const x = new URL(u); return /supabase\.co$/.test(x.host) && x.pathname === '/rest/v1/gc_staff'; }, async rt => {
    if (rt.request().method() === 'OPTIONS') return rt.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const e = emailOfTok((rt.request().headers()['authorization'] || '').replace(/^Bearer /, ''));
    return rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(e && STAFF[e] ? [STAFF[e]] : []) });
  });
  await c.ctx.route(u => /supabase\.co$/.test(new URL(u).host), async rt => {
    const req = rt.request(), u = new URL(req.url());
    if (/utok-u-mm-/.test(req.headers()['authorization'] || '') && u.pathname.startsWith('/rest/')) { const k = u.searchParams.getAll('key').join('&'); net.dbAll.push(req.method() + ' ' + u.pathname + ' ' + k); if (u.pathname === '/rest/v1/gc_kv') net.db.push(req.method() + ' ' + k); }
    return rt.fallback();
  });
}
async function boot(email, name){
  let c, n = 0; for (;;) { try { c = await computer(name, { build: BUILD }); break; } catch (e) { if (++n > 4) throw e; await sleep(5000); } }
  await fnRoute(c); await staffRows(c); await signIn(c, email, 15000); return c;
}
const mm = await boot(MM, 'mm'); const pm = mm.page(); await pm.setViewportSize({ width: 1366, height: 900 });
const layout = await until(() => pm.evaluate(() => !!(window._gcMMData && window._gcIsMM && window._gcIsMM()) && [...document.querySelectorAll('nav button')].some(b => b.offsetParent && /My leads/.test(b.innerText))), 40000);
ok(layout, 'his first sign-in opens the Marketing layout (his own tabs), though he is not on the employee list yet');
await sleep(6000);
const store = await pm.evaluate(async () => {
  const all = await new Promise(res => { try { const q = indexedDB.open('grayco_crm'); q.onsuccess = () => { const d = q.result; if (!d.objectStoreNames.contains('kv')) return res({ keys: [], txt: '' }); const tx = d.transaction('kv', 'readonly'), os = tx.objectStore('kv'); const a = os.getAllKeys(), b = os.getAll(); tx.oncomplete = () => res({ keys: a.result, txt: JSON.stringify(b.result) }); }; q.onerror = () => res({ keys: [], txt: '' }); } catch (e) { res({ keys: [], txt: '' }); } });
  let ls = ''; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += k + '=' + (localStorage.getItem(k) || '') + '\n'; }
  return { keys: all.keys, idb: all.txt, ls, crm: JSON.stringify({ p: (window._crm || {}).projects, c: (window._crm || {}).customers, l: (window._crm || {}).leads }) };
});
ok(!hasPII(store.idb).length && !store.keys.some(k => /^(projects|customers|leads|invoices|gc_office_tasks|gc_approval_queue|gc_mkt_v1)$/.test(k)), 'his browser database holds none of the company\'s keys (customers, jobs, leads, invoices, to-dos, approvals)', { keys: store.keys, pii: hasPII(store.idb) });
ok(!hasPII(store.ls).length && !hasPII(store.crm).length, '… and nothing of theirs in his local storage or the page\'s memory', hasPII(store.ls + store.crm));
const okKeys = /^(gc_company_address|gc_epoch|gc_mkt_admin|gc_automation_pause)$/;   /* MKTFIX6: not users */
const badDb = net.dbAll.filter(x => { if (/^GET \/rest\/v1\/gc_staff/.test(x)) return false; if (!/\/rest\/v1\/gc_kv/.test(x) || !/^(GET|HEAD) /.test(x)) return true; const ks = []; x.split(' ').slice(2).join(' ').split('&').forEach(f => { if (f.startsWith('eq.')) ks.push(f.slice(3)); else if (f.startsWith('in.(')) f.slice(4, -1).split(',').forEach(k => ks.push(k.replace(/"/g, ''))); else if (!f.startsWith('not.')) ks.push('?' + f); }); return !ks.length || ks.some(k => !okKeys.test(k)); });
ok(net.dbAll.length > 0 && !badDb.length, 'every database request that left his browser asks only for the keys docs/marketing-role.sql lets him read (' + net.dbAll.length + ' requests)', badDb.slice(0, 6));
const badFn = [...new Set(net.fn.filter(n => !/^(soc|mkt|mkt2|referral|mkt-public|go|track-call|website-intake|claude-proxy)$/.test(n)))];
ok(net.fn.includes('soc') && !badFn.length, 'no staff function that refuses him is called from his browser (they were ~25 refused calls a load)', badFn);
/* the live feed: an admin saves the jobs; his browser drops the row */
const ad = await boot(ADMIN, 'admin'); const pa = ad.page(); await pa.setViewportSize({ width: 1366, height: 900 }); await sleep(5000);
await pa.evaluate(() => fetch('https://ieeonhpfahmwwecizdut.supabase.co/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'projects', value: [{ id: 'PF', name: 'Demo Customer-Feed Roof', client: 'Demo Customer-Feed' }], updated_at: new Date().toISOString() }) }));
await sleep(4000);
const fed = await pm.evaluate(async () => { const t = await new Promise(res => { const q = indexedDB.open('grayco_crm'); q.onsuccess = () => { const d = q.result; if (!d.objectStoreNames.contains('kv')) return res(''); const tx = d.transaction('kv', 'readonly'), b = tx.objectStore('kv').getAll(); tx.oncomplete = () => res(JSON.stringify(b.result)); }; q.onerror = () => res(''); }); let ls = ''; for (let i = 0; i < localStorage.length; i++) ls += localStorage.getItem(localStorage.key(i)); return t + ls + JSON.stringify((window._crm || {}).projects || []); });
ok(!/Demo Customer-Feed/.test(fed), 'the live feed: an admin saves the jobs — his browser drops that row');
/* his screens */
await pm.evaluate(() => window._setView('marketing')); await sleep(1500);
const view = async sec => { await pm.evaluate(s => window._gcMkt.go(s), sec); await sleep(2500); return pm.evaluate(() => ({ t: (document.querySelector('#gc-mk-mount .gmt-body') || {}).innerText || '', a: [...document.querySelectorAll('#gc-mk-mount [data-a], #gc-mk-mount [data-gref]')].map(b => b.getAttribute('data-a') || 'gref:' + b.getAttribute('data-gref')) })); };
let v = await view('mmappr');
ok(/Stage 1 right now: an admin approves every marketing draft/.test(v.t) && !v.a.includes('mm-yes'), '🗳 his Approvals at stage 1: says an admin approves everything and where that changes; no Approve button', v.t.slice(0, 300));
v = await view('reviews');
ok(v.a.includes('rv-draft') && !v.a.includes('rv-reply'), '⭐ a 2★ review: "💾 Save the draft — an admin approves it", not an Approve button that can only fail', v.a);
ok(!v.a.includes('rv-ask') && !v.a.includes('ref-new') && !v.a.includes('ref-thanks') && /office logs referrals/.test(v.t) && !hasPII(v.t).length, '… no review-request e-mail button, no referral log with customer names (a card points to 🎁 Referral program)', hasPII(v.t));
await pm.evaluate(() => { const t = document.getElementById('gmt-rr-r2'); if (t) t.value = 'Thank you for telling us, K. Please call us.'; document.querySelector('[data-a="rv-draft"]').click(); }); await sleep(2500);
const saved = await until(async () => { const d = cget('gc_mkt_v1'); return d && d.reviews && d.reviews.r2 && /Please call us/.test(d.reviews.r2.replyDraft || '') ? d.reviews.r2 : null; }, 15000);
ok(saved && !saved.replyStatus, '… "Save the draft" saves his reply draft for an admin (not approved)', saved);
v = await view('refprog');
ok(/Read-only: the office adds members/.test(v.t) && !v.a.some(x => /gref:(member|refer|lookup|use-member|link|use)$/.test(x)) && !hasPII(v.t).length, '🎁 Referral program (his): read-only, no forms that answer "read-only", no customer names', { a: v.a.filter(x => /gref/.test(x)), pii: hasPII(v.t) });
v = await view('mytodo');
await pm.evaluate(() => { const i = document.getElementById('mm-task'); if (i) i.value = ''; document.querySelector('[data-a="mm-task-add"]').click(); }); await sleep(400);
const tt = await pm.evaluate(() => [...document.querySelectorAll('.gmt-toast')].map(x => x.innerText).join(' '));
ok(/Type the to-do first/.test(tt), '✅ My To-Do: "Add" with an empty box asks for the to-do', tt);
v = await view('flyers');
await pm.evaluate(() => { const s = document.querySelector('#gc-mk-mount select[data-ch="fl-job"]'); if (s) { const o = [...s.options].find(x => x.value); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } } }); await sleep(1500);
const perm = await pm.evaluate(() => { const c = document.getElementById('fl-perm'); return c ? { disabled: c.disabled } : null; });
ok(perm && perm.disabled === true, '🗞 flyers (his): "The customer said OK …" shows the answer but he cannot change it', perm);
v = await view('coupons');
ok(v.a.includes('cp-check') && !v.a.includes('cp-redeem'), '🎟 Coupons (his): Check stays, no Redeem button (the office redeems on the job)', v.a.filter(x => /^cp-/.test(x)));
const pageTxt = await pm.evaluate(() => document.body.innerText);
ok(!hasPII(pageTxt).length, 'nothing on his screen names a customer', hasPII(pageTxt));
ok(!mm.errs.filter(e => /MKTFIX|mmFence|mmFeed/.test(e)).length, 'no page errors from the fence', mm.errs.slice(-4));
await mm.b.close();

/* ═══ C. an admin ═══ */
console.log('C. an admin');
await pa.evaluate(() => window._setView('marketing')); await until(() => pa.evaluate(() => !!document.querySelector('#gc-mk-mount .gmt-body')), 20000);
await pa.evaluate(() => window._gcMkt.go('events')); await sleep(1500);
await pa.evaluate(() => document.querySelector('#gc-mk-mount [data-a="ev-new"]').click()); await sleep(1200);
let st = await pa.evaluate(() => ({ form: window._gcMkt.state().form, t: document.querySelector('#gc-mk-mount .gmt-body').innerText.slice(0, 200) }));
ok(st.form === 'event', '🎃 Events & community: "+ Add an event" opens the event form (it did nothing)', st);
await pa.evaluate(() => window._gcMkt.go('events')); await sleep(1200);
await pa.evaluate(() => document.querySelector('#gc-mk-mount [data-a="ev-edit"]').click()); await sleep(1200);
st = await pa.evaluate(() => ({ form: window._gcMkt.state().form, t: document.querySelector('#gc-mk-mount .gmt-body').innerText.slice(0, 200) }));
ok(st.form === 'event' && /Trunk or Treat/.test(st.t), '… "Open" on Trunk or Treat opens it', st);
await pa.evaluate(() => window._gcMkt.go('events2')); await sleep(1200);
const before = await pa.evaluate(() => document.querySelectorAll('#ev-date').length);
await pa.evaluate(() => document.querySelector('#gc-mk-mount [data-a="ev-new"]').click()); await sleep(1200);
st = await pa.evaluate(() => ({ date: document.querySelectorAll('#ev-date').length, slots: document.querySelectorAll('#ev-slots').length, form: window._gcMkt.state().form }));
ok(st.date === 1 && st.slots === 1 && !st.form, '🏠 Free roof check events: its own "+ new event" still opens its own form', { before, st });
await pa.evaluate(() => window._gcMkt.go('refprog')); await sleep(3500);
await pa.evaluate(() => { const b = document.querySelector('#gc-mk-mount [data-gref="lookup"]'); if (b) b.click(); }); await sleep(800);
const lt = await pa.evaluate(() => (document.body.innerText.match(/[^\n]*last 4 characters[^\n]*|[^\n]*Method not allowed[^\n]*/) || [''])[0]);
ok(/last 4 characters/.test(lt), '🎁 "Look up" with an empty box asks for the last 4 (it said "Method not allowed")', lt);
await ad.b.close();
console.log((fail ? 'FAILED ' : 'ALL PASS ') + 'MKTAUDIT ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
