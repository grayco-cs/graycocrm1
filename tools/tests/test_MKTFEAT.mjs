// test_MKTFEAT.mjs <build-dir> — patch MKTFEAT in the browser (offline harness wN/harness_N.mjs; the REAL Netlify function handlers
// of the build run in this process against the same in-memory database; made-up data):
//   admin: ⭐ Review tracker (job names, per-PM "asked N, received N", the before / after draft from SHARED photos only, one per job),
//          🔎 Google rankings ("Connect Search Console" card with the service account to add — never a made-up rank),
//          📬 Monthly report (recipients, preview with the right numbers, "Send me this month's report now" to him only),
//          the recipients on ⚙️ Focus & approvals;
//   Marketing Manager: the same tracker / rankings with city + service + PM only — no customer name, phone, e-mail, street, cost or
//          margin anywhere on his screen or in any answer he got; he edits the searches; the win-back draft (one per lead) is in his
//          Approvals with no name; no report screen; no polling (idle = no new calls).
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(SP + '/wN/harness_N.mjs');
const { computer, signIn, sleep, ACCOUNTS, cset, cget, cloud, resetCloud } = H;
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };

/* ── people ── */
const MM_EMAIL = 'mm@grayco-cs.com', ADMIN = 'wjohnson@grayco-cs.com';
ACCOUNTS[MM_EMAIL] = { pw: 'Mm-Correct-1', id: 'u-mm', role: 'staff' };
const STAFF = { [ADMIN]: { email: ADMIN, name: 'Wesley Johnson', role: 'admin', active: true, profile: null, mkt_active: false },
  'nthomas@grayco-cs.com': { email: 'nthomas@grayco-cs.com', name: 'Nick Thomas', role: 'admin', active: true },
  'office@grayco-cs.com': { email: 'office@grayco-cs.com', name: 'Office', role: 'staff', active: true, profile: 'office', mkt_active: false },
  [MM_EMAIL]: { email: MM_EMAIL, name: 'Malcolm Demo', role: 'staff', active: false, profile: 'marketing', mkt_active: true } };
const emailOfTok = tok => { const m = /^utok-(u-[a-z]+)-/.exec(tok || ''); if (!m) return null; return Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === m[1]) || null; };

/* ── made-up data; these strings must never reach the Marketing Manager ── */
const PII = ['Demo Kline', 'kline@demo.example', '9015550100', '(901) 555-0100', '88 Maple Dr', 'Demo Stone', 'stone@demo.example', '12 Oak St', 'State Farm', 'COST-SECRET', 'MARGIN-SECRET', 'lost@demo.example', 'Demo Lostlead'];
const NOW = Date.now(), iso = d => new Date(NOW - d * 864e5).toISOString();
const RM = new Date(Date.UTC(new Date(NOW).getUTCFullYear(), new Date(NOW).getUTCMonth() - 1, 1)).toISOString().slice(0, 7), inRM = d => RM + '-' + String(d).padStart(2, '0') + 'T15:00:00.000Z';
function seed(){
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin' }, { id: 'u2', name: 'Office', email: 'office@grayco-cs.com', role: 'Office Admin' }, { id: 'u3', name: 'Malcolm Demo', email: MM_EMAIL, role: 'Marketing Manager' }, { id: 'u4', name: 'Pat PM', email: 'pm@grayco-cs.com', role: 'Project Manager' }]);
  cset('projects', [
    { id: 'PW', name: 'Demo Kline Water', client: 'Demo Kline', clientEmail: 'kline@demo.example', clientPhone: '9015550100', address: '88 Maple Dr, Germantown, TN 38138', status: 'Completed', type: 'Water mitigation', isInsurance: true, carrier: 'State Farm', completedAt: iso(5), marketingOk: true, pm: 'Pat PM', contract: 18400, costNote: 'COST-SECRET', margin: 'MARGIN-SECRET' },
    { id: 'PR', name: 'Demo Stone Roof', client: 'Demo Stone', clientEmail: 'stone@demo.example', address: '12 Oak St, Bartlett, TN 38135', status: 'Completed', type: 'Roofing', completedAt: iso(8), pm: 'Pat PM', contract: 21700 },
    { id: 'PG1', name: 'Demo G Roof', client: 'Demo G', leadId: 'G1', status: 'Active', type: 'Roofing', contract: 12000, createdAt: inRM(6), pm: 'Pat PM' }]);
  cset('gc_photos', [
    { id: 'w1', jobId: 'PW', ref: 'sb:crm-files/w-before.jpg', tag: 'Before', shared: true, at: iso(20) }, { id: 'w2', jobId: 'PW', ref: 'sb:crm-files/w-private.jpg', tag: 'After', shared: false, at: iso(4) },
    { id: 'w3', jobId: 'PW', ref: 'sb:crm-files/w-sub.jpg', tag: 'After', shared: true, source: 'sub', subId: 'S1', at: iso(3) }, { id: 'w4', jobId: 'PW', ref: 'sb:crm-files/w-after.jpg', tag: 'After', shared: true, at: iso(6) }]);
  cset('leads', [
    { id: 'G1', name: 'Demo G', source: 'Google Ads', attrib: { gclid: 'x', utm_campaign: 'g-roof' }, city: 'Bartlett', type: 'Roofing', stage: 'Won', createdAt: inRM(3) },
    { id: 'G2', name: 'Demo G2', source: 'Google Ads', attrib: { gclid: 'x', utm_campaign: 'g-roof' }, city: 'Memphis', type: 'Roofing', stage: 'Contacted', createdAt: inRM(9) },
    { id: 'F1', name: 'Demo F1', source: 'Facebook', attrib: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'fb-water' }, city: 'Cordova', type: 'Water damage', stage: 'Lost', createdAt: inRM(5) },
    { id: 'WB1', name: 'Demo Lostlead', email: 'lost@demo.example', city: 'Bartlett', type: 'Roofing', stage: 'Lost', lostAt: iso(45), createdAt: iso(80) }]);
  cset('customers', []);
  cset('gc_approval_queue', JSON.stringify([{ id: 'TY1', kind: 'thank_you', jobId: 'PW', status: 'sent', sentAt: iso(4), createdAt: iso(5), to: 'kline@demo.example', title: 'Thank-you' }]));
  cset('gc_office_tasks', JSON.stringify([]));
  cset('gc_company_address', { current: '4014 Broadway Rd, Bartlett, TN 38135' });
  cset('gc_mkt_admin', { mm: { soldValues: true, approvesStage2: true } });
  cset('gc_mkt_v1', { cfg: { main: { id: 'main', at: iso(1), apprStage: { stage: 2, since: iso(3) } } },
    reviews: { rv1: { id: 'rv1', source: 'google', author: 'Demo K.', rating: 5, text: 'Great water cleanup', date: iso(3).slice(0, 10), at: iso(3) }, rs1: { id: 'rs1', source: 'google', author: 'A B', rating: 5, date: inRM(4).slice(0, 10), at: iso(30) } },
    posts: { pp1: { id: 'pp1', title: 'Tip', status: 'posted', postedAt: inRM(2), at: iso(30) } },
    spend: { s1: { id: 's1', month: RM, date: RM + '-01', channel: 'Google Ads', amount: 300, at: iso(30) }, s2: { id: 's2', month: RM, date: RM + '-01', channel: 'Facebook/Instagram Ads', amount: 150, at: iso(30) } } });
}

/* ── the functions, in this process, against the same database ── */
Object.assign(process.env, { SUPABASE_URL: 'https://fn.sb.test', SUPABASE_SERVICE_KEY: 'svc', CRM_URL: 'https://app.local', SITE_ORIGIN: 'https://app.local', RESEND_API_KEY: 're_test', MKT2_SECRET: 'a-long-test-secret-123456', OWNER_EMAILS: ADMIN + ',nthomas@grayco-cs.com' });
['ANTHROPIC_API_KEY', 'STAFF_EMAILS', 'GOOGLE_SA_EMAIL', 'GOOGLE_SA_KEY'].forEach(k => delete process.env[k]);
const inbox = new Map([['probe', { key: 'probe', value: 1, updated_at: new Date().toISOString() }]]);
const mails = [];
function J(st, body){ return { ok: st >= 200 && st < 300, status: st, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => 'application/json' } }; }
function keysOf(q){ if (q.startsWith('eq.')) return [decodeURIComponent(q.slice(3))]; if (q.startsWith('in.(')) return q.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return null; }
let tick = 0; const stampI = () => new Date(Date.now() + (++tick)).toISOString();
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  let body = null; try { body = typeof init.body === 'string' && /^[\[{]/.test(init.body) ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
  if (u.host === 'api.resend.com') { mails.push(body); return J(200, { id: 'm' + mails.length }); }
  if (u.host !== 'fn.sb.test') return J(404, { error: 'offline' });
  if (u.pathname === '/auth/v1/user') { const e = emailOfTok(String(hd.Authorization || hd.authorization || '').replace('Bearer ', '')); return e ? J(200, { id: ACCOUNTS[e].id, email: e }) : J(401, {}); }
  if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').slice(3), role = (u.searchParams.get('role') || '').slice(3); let rows = e ? (STAFF[e] ? [STAFF[e]] : []) : Object.values(STAFF); if (role) rows = rows.filter(r => r.role === role); return J(200, rows.map(r => Object.assign({}, r))); }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) return J(200, { signedURL: '/object/sign/' + u.pathname.split('/sign/')[1] + '?token=t' });
  if (u.pathname.startsWith('/storage/v1/')) return J(200, { Key: 'ok' });
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'GET') { const ks = keysOf(u.searchParams.get('key') || ''); const rows = (ks || [...cloud.keys()]).map(k => cloud.get(k)).filter(Boolean).map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at })); return J(200, rows); }
    if (m === 'POST' || m === 'PATCH') { const rows = Array.isArray(body) ? body : [body]; rows.forEach(b => { let v = b.value; if (typeof v === 'string' && /^[\[{]/.test(v) && !['gc_office_tasks', 'gc_approval_queue'].includes(b.key)) { try { v = JSON.parse(v); } catch (e) {} } cset(b.key || (u.searchParams.get('key') || '').slice(3), v); }); return J(m === 'POST' ? 201 : 200, []); }
    if (m === 'DELETE') return J(204, []);
  }
  if (u.pathname === '/rest/v1/gc_lead_inbox_kv' || u.pathname === '/rest/v1/gc_social_tokens') {
    if (m === 'GET') { const ks = keysOf(u.searchParams.get('key') || ''); return J(200, (ks || [...inbox.keys()]).map(k => inbox.get(k)).filter(Boolean)); }
    const k0 = (keysOf(u.searchParams.get('key') || '') || [])[0];
    if (m === 'PATCH') { const at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''), cur = inbox.get(k0); if (!cur || (at && cur.updated_at !== at)) return J(200, []); inbox.set(k0, { key: k0, value: body.value, updated_at: stampI() }); return J(200, [inbox.get(k0)]); }
    const b = Array.isArray(body) ? body[0] : body; if (b && b.key) inbox.set(b.key, { key: b.key, value: b.value, updated_at: stampI() }); return J(201, b ? [inbox.get(b.key)] : []);
  }
  if (u.pathname === '/rest/v1/gc_news_suppress') return J(200, []);
  return J(m === 'GET' ? 200 : 201, []);
};
const F = path.join(build, 'netlify/functions'), LIVE = {};
['soc', 'mkt', 'mkt2', 'referral', 'portal', 'staff-admin', 'x10', 'comms', 'bid-inbox', 'website-intake', 'plan-nightly', 'cust-care', 'portal-extra', 'social-post', 'send-email', 'mkt-report', 'review-queue', 'mkt-public', 'ai-assist', 'integrations', 'lead-source', 'mail-center', 'texts', 'photo-tag', 'automation-pause', 'storage-usage', 'crm-health', 'mkt-feat'].forEach(n => { try { LIVE[n] = require(F + '/' + n + '.js'); } catch (e) { if (!/Cannot find module/.test(String(e))) console.log('  (not loadable: ' + n + ': ' + String(e).slice(0, 80) + ')'); } });
const MF = require(F + '/_lib/mktfeat.js'), WB = require(F + '/_lib/winback.js');
const seen = [], calls = [];
async function fnRoute(c, who){
  await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, async r => {
    const req = r.request(), u = new URL(req.url()), name = u.pathname.split('/').pop(), h = req.headers();
    const mod = LIVE[name]; let op = ''; try { const b = JSON.parse(req.postData() || '{}'); op = b.op || b.action || ''; if (b.action && b.op) op = b.action + '.' + b.op; } catch (e) {}
    if (!mod) { calls.push({ who, name, op, status: 'nofn', t: Date.now() }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    const ev = { httpMethod: req.method(), path: u.pathname, headers: Object.assign({ origin: 'https://app.local' }, h), queryStringParameters: Object.fromEntries(u.searchParams), body: req.postData() || '' };
    let res; try { res = await mod.handler(ev); } catch (e) { res = { statusCode: 500, body: JSON.stringify({ error: 'THROW ' + String(e && e.message) }) }; }
    res = res || { statusCode: 500, body: '{"error":"no response"}' };
    const bodyTxt = res.isBase64Encoded ? '' : String(res.body || '');
    calls.push({ who, name, op, status: res.statusCode, t: Date.now() });
    if (/utok-u-mm-/.test(h.authorization || '')) seen.push({ where: 'fn:' + name + ':' + op, status: res.statusCode, body: bodyTxt });
    return r.fulfill({ status: res.statusCode || 200, headers: Object.assign({ 'content-type': 'application/json' }, res.headers || {}), body: bodyTxt });
  });
}
const MM_KEYS = ['users', 'gc_company_address', 'gc_epoch', 'gc_mkt_admin', 'gc_automation_pause'];   /* docs/marketing-role.sql (users: until MKTFIX6 drops it) */
async function dbRoutes(c, isMM){
  await c.ctx.route(u => /supabase\.co$/.test(new URL(u).host), async r => {
    const req = r.request(), u = new URL(req.url()), a = req.headers()['authorization'] || '', e = emailOfTok(a.replace(/^Bearer /, ''));
    const Jr = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.startsWith('/auth/')) return r.fallback();
    if (u.pathname === '/rest/v1/gc_staff') return Jr(200, e && STAFF[e] ? [STAFF[e]] : e ? [{ email: e, role: ACCOUNTS[e].role, active: true, name: '' }] : []);
    if (!isMM || !/utok-u-mm-/.test(a)) return r.fallback();
    /* the database answers him like docs/marketing-role.sql: four keys to read, nothing to write */
    let out;
    if (u.pathname === '/rest/v1/gc_kv' && req.method() === 'GET') { const ks = keysOf(u.searchParams.get('key') || '') || [...cloud.keys()]; out = ks.filter(k => MM_KEYS.includes(k)).map(k => cloud.get(k)).filter(Boolean).map(x => ({ key: x.key, value: x.value, updated_at: x.updated_at })); }
    else if (req.method() === 'GET' || req.method() === 'HEAD') out = [];
    else return Jr(403, { code: '42501', message: 'new row violates row-level security policy' });
    seen.push({ where: 'db:' + u.pathname, status: 200, body: JSON.stringify(out) });
    return Jr(200, out);
  });
}
async function launch(email){
  let c, tries = 0;
  for (;;) { try { c = await computer(email.split('@')[0], { build }); break; } catch (e) { if (++tries > 4) throw e; await sleep(5000); } }
  await fnRoute(c, email === MM_EMAIL ? 'mm' : 'admin'); await dbRoutes(c, email === MM_EMAIL);
  await signIn(c, email, 14000);
  return c;
}
async function until(fn, ms = 30000){ const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(300); } return false; }
const sec = async (p, id) => { await p.evaluate(id => window._gcMkt.go(id), id); await sleep(400); };
const bodyText = p => p.evaluate(() => { const sec = window._gcMktExt && window._gcMktExt.UI.sec; const all = [...document.querySelectorAll('.gmt[data-gmt-sec]')]; const g = all.find(x => x.getAttribute('data-gmt-sec') === sec && x.isConnected) || all[0]; const b = g && g.querySelector('.gmt-body'); return b ? b.innerText : ''; });
const where = p => p.evaluate(() => ({ sec: window._gcMktExt && window._gcMktExt.UI.sec, mounts: [...document.querySelectorAll('.gmt[data-gmt-sec]')].map(x => (x.parentElement && (x.parentElement.id || x.parentElement.className)) + ':' + x.getAttribute('data-gmt-sec')), rows: !!document.querySelector('[data-mf-rows]') }));
const openMkt = async p => { await until(() => p.evaluate(() => !!(window._gcMktExt && window._gcMktFeat)), 60000);
  const m = await until(() => p.evaluate(() => { if (document.querySelector('.gmt[data-gmt-sec]')) return true; try { window._setView('marketing'); } catch (e) {} return false; }), 60000); if (!m) console.log('  (Marketing did not mount)', JSON.stringify(await p.evaluate(() => ({ sv: typeof window._setView, mm: window._gcIsMM && window._gcIsMM(), mmd: !!window._gcMMData, body: document.body.innerText.slice(0, 300), mount: !!document.getElementById('gc-mk-mount') })))); await sleep(2000); };

/* ════════ the server runs first: the before / after draft and the win-back draft ════════ */
seed();
const ba1 = await MF.runBeforeAfter({}), ba2 = await MF.runBeforeAfter({});
const post = cget('gc_mkt_v1').posts[MF.baPostId('PW')];
ok(ba1.made.length === 1 && ba2.made.length === 0, 'server: one before / after draft for the finished water job, none on the second run', { ba1, ba2 });
ok(post && post.beforeRef === 'sb:crm-files/w-before.jpg' && post.afterRef === 'sb:crm-files/w-after.jpg' && !/w-private|w-sub/.test(JSON.stringify(post)), 'server: shared photos only (not the private one, not the sub\'s)', post && [post.beforeRef, post.afterRef]);
const wb = await WB.run(require(F + '/portal.js')._core), wb2 = await WB.run(require(F + '/portal.js')._core);
ok(wb.followUp30 && wb.followUp30.queued.length === 1 && wb2.followUp30.queued.length === 0, 'server: one win-back draft for the lead lost 45 days ago, never twice', [wb.followUp30, wb2.followUp30]);

/* ════════ the admin ════════ */
if (!process.env.MF_SKIP_ADMIN) { console.log("admin");
var c = await launch(ADMIN), p = c.page();
await openMkt(p);
const st = await p.evaluate(() => window._gcMktFeat.state());
ok(st.secs.join(',') === 'revtrack,rankings,mfreport', 'Marketing has ⭐ Review tracker, 🔎 Google rankings and 📬 Monthly report', st);
await sec(p, 'revtrack'); await until(() => p.evaluate(() => !!document.querySelector('[data-mf-rows]')));
var t = await bodyText(p);
ok(/Demo Kline Water/.test(t) && /Water damage/.test(t) && /Germantown/.test(t), 'the tracker lists the finished jobs (an admin sees the job names)');
ok(/asked 1, received 1/.test(t), 'per PM: "asked 1, received 1" (Pat PM)', t.match(/asked \d+, received \d+/g));
ok(/thank-you/.test(t) && /★★★★★/.test(t) && /matched by name/.test(t), 'the water job: asked by the thank-you e-mail; the 5★ Google review matched by name');
const baBtn = await p.evaluate(id => !!document.querySelector('[data-mf-rows] [data-a="post-edit"][data-id="' + id + '"]'), MF.baPostId('PW'));
ok(baBtn && /Draft/.test(t), 'the before / after draft shows on the job with an Open button');
ok(/Needs the customer's OK/.test(t), 'a job without the marketing OK says so (no draft)');
await sec(p, 'rankings'); await until(() => p.evaluate(() => !!document.querySelector('[data-mf-ranks]')));
t = await bodyText(p);
ok(/Connect Search Console/.test(t) && /GOOGLE_SA_EMAIL/.test(t) && /Users and permissions/.test(t), 'rankings: the "Connect Search Console" card with the exact steps');
const cells = await p.evaluate(() => [...document.querySelectorAll('[data-mf-ranks] table tr')].slice(1).map(tr => tr.innerText));
ok(cells.length === 4 && /roof repair memphis/.test(cells.join()) && cells.every(x => /not checked yet/.test(x) && !/#\d/.test(x)), 'the four searches, no number made up', cells);
await sec(p, 'mfreport'); await until(() => p.evaluate(() => !!document.querySelector('[data-mf-recipients]')));
const boxes = await p.evaluate(() => [...document.querySelectorAll('[data-mf-to]')].map(x => x.getAttribute('data-mf-to') + ':' + x.checked));
ok(boxes.includes(ADMIN + ':true') && boxes.includes('nthomas@grayco-cs.com:false'), 'report recipients: Wesley ticked, Nick optional', boxes);
await p.evaluate(() => { document.querySelector('[data-mf-to="nthomas@grayco-cs.com"]').checked = true; document.querySelector('[data-a="mf-to-save"]').click(); }); await sleep(1500);
const saved = inbox.get(MF.KS) && inbox.get(MF.KS).value.report.to;
ok(saved && saved.join() === ADMIN + ',nthomas@grayco-cs.com', 'saved: Wesley and Nick', saved);
await p.evaluate(m => document.querySelector('[data-a="mf-rep-prev"][data-m="' + m + '"]').click(), RM);
const pv = await until(() => p.evaluate(() => { const f = document.querySelector('[data-mf-preview]'); return f && f.getAttribute('srcdoc'); }), 30000);
ok(pv && /Marketing report/.test(pv) && /Google Ads/.test(pv) && /\$300/.test(pv) && /\$150/.test(pv) && /\$12,000/.test(pv) && /g-roof/.test(pv), 'preview of last month: Google Ads $300 spend, $150 per lead, $12,000 sold, the top campaign', pv && pv.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
mails.length = 0;
await p.evaluate(() => document.querySelector('[data-a="mf-rep-send"]').click());
await until(() => mails.length > 0, 20000);
ok(mails.length === 1 && mails[0].to.join() === ADMIN && /so far/.test(mails[0].subject), '"Send me this month\'s report now" → one e-mail, to him only', mails.map(x => [x.to, x.subject]));
await sec(p, 'mktsettings'); await until(() => p.evaluate(() => !!document.querySelector('[data-mf-recipients]')));
ok(await p.evaluate(() => !!document.querySelector('[data-mf-recipients]')), 'the recipients are on ⚙️ Focus & approvals too');
ok(!c.errs.length, 'no page errors (admin)', c.errs.slice(0, 3));
await c.b.close(); }

/* ════════ the Marketing Manager ════════ */
console.log('Marketing Manager');
c = await launch(MM_EMAIL); p = c.page();
const layout = await until(() => p.evaluate(() => !!(window._gcMMData && window._gcIsMM && window._gcIsMM()) && [...document.querySelectorAll('nav button')].some(b => b.offsetParent && /My leads/.test(b.innerText))), 60000);
ok(layout, 'he signs in to his Marketing layout');
await openMkt(p);
await until(() => p.evaluate(() => window._gcMktFeat.state().role === 'marketing'), 60000);
const st2 = await p.evaluate(() => window._gcMktFeat.state());
ok(st2.secs.join(',') === 'revtrack,rankings', 'he has ⭐ Review tracker and 🔎 Google rankings, not the report screen', [st2, await p.evaluate(() => window._gcMktExt.SECS.map(x => x.id).join(','))]);
await sec(p, 'revtrack'); await until(() => p.evaluate(() => !!document.querySelector('[data-mf-rows]')));
t = await bodyText(p);
ok(/Water damage/.test(t) && /Germantown/.test(t) && /Pat PM/.test(t) && /asked 1, received 1/.test(t), 'his tracker: service + city + PM, the per-PM counts', [t.slice(0, 600), await where(p)]);
ok(!PII.some(x => t.indexOf(x) >= 0), 'no customer name, phone, e-mail, street, carrier or cost on his screen', PII.filter(x => t.indexOf(x) >= 0));
const n0 = calls.filter(x => x.who === 'mm' && /^mf_/.test(x.op)).length;
await sleep(8000);
ok(calls.filter(x => x.who === 'mm' && /^mf_/.test(x.op)).length === n0, 'no polling: nothing is asked again while the screen sits open');
await p.evaluate(() => { const s = document.querySelector('[data-ch="mf-mark"]'); s.value = 'text'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(2500);
const asks = inbox.get(MF.KS) && inbox.get(MF.KS).value.asks;
ok(asks && asks.PR && asks.PR.how === 'text', 'he records "asked by text" on a job (the server finds the job by the row key)', asks);
await sec(p, 'rankings'); await until(() => p.evaluate(() => !!document.querySelector('[data-mf-ranks]')));
t = await bodyText(p);
ok(/Connect Search Console/.test(t) && /An admin connects it/.test(t) && !/iam\.gserviceaccount/.test(t), 'rankings: he is told an admin connects it');
await p.evaluate(() => { const ta = document.getElementById('mf-terms'); ta.value = 'roof repair memphis\nemergency roof tarp memphis'; ta.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-a="mf-terms-save"]').click(); }); await sleep(2500);
const terms = inbox.get(MF.KS).value.rank.terms;
ok(terms && terms.join('|') === 'roof repair memphis|emergency roof tarp memphis', 'he edits the searches', terms);
await sec(p, 'mmappr'); await sleep(3000);
t = await bodyText(p);
ok(/Win-back follow-up/.test(t) && /Bartlett/.test(t) && !/Demo Lostlead|lost@demo/.test(t), 'the win-back draft is in his Approvals — no name, no e-mail', t.match(/Win-back[^\n]*/));
const leak = seen.filter(x => PII.some(y => x.body.indexOf(y) >= 0));
ok(!leak.length, 'no answer he got carries a customer name, phone, e-mail, street, carrier or cost (' + seen.length + ' answers)', leak.map(x => x.where + ' ' + PII.filter(y => x.body.indexOf(y) >= 0).join(',')).slice(0, 5));
const rep = await p.evaluate(() => fetch('/.netlify/functions/soc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'mf_report_preview' }) }).then(r => r.status));
ok(rep === 403 || rep === 401, 'the report preview is refused to him', rep);
ok(!c.errs.length, 'no page errors (Marketing Manager)', c.errs.slice(0, 3));
await c.b.close();
console.log(`MKTFEAT ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
