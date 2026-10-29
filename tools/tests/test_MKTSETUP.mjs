// test_MKTSETUP.mjs <buildDir> [shotsDir] — patch MKTSETUP in the browser (the offline set-up of test_MMTABS.mjs / test_MM.mjs:
// the wN harness page, the REAL Netlify function handlers of the build in this process, the database answering him like
// docs/marketing-role.sql). 🧰 Marketing setup: his 🔗 Marketing logins tab shows the checklist (19 cards, links, who does what,
// a status picker on each card but the "Admin only" one); he sets a status → saved through soc.js (gc_mkt_admin.setup) and
// nothing else changes; the admin sees the progress on 📣 Marketing and in 🔗 Marketing logins, can set every card; the
// office does not see it; no password / key on the page; no customer data reaches him.
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(SP + '/wN/harness_N.mjs');
const { computer, signIn, sleep, ACCOUNTS, cset, cget, cloud, resetCloud } = H;
const BUILD = path.resolve(process.argv[2]), SHOTS = process.argv[3] || '', F = BUILD + '/netlify/functions';
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 600) : '')); } }
async function until(fn, ms = 15000){ const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(300); } return false; }
/* ── the people ── */
ACCOUNTS['mm@grayco-cs.com'] = { pw: 'Mm-Correct-1', id: 'u-mm', role: 'staff' };
const STAFF = { 'wjohnson@grayco-cs.com': { email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true, profile: null, mkt_active: false },
  'office@grayco-cs.com': { email: 'office@grayco-cs.com', name: 'Office', role: 'staff', active: true, profile: 'office', mkt_active: false },
  'mm@grayco-cs.com': { email: 'mm@grayco-cs.com', name: 'Mark Eting', role: 'staff', active: false, profile: 'marketing', mkt_active: true } };
const emailOfTok = tok => { const m = /^utok-(u-[a-z]+)-/.exec(tok || ''); if (!m) return null; return Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === m[1]) || null; };
/* ── demo data only (customer contact data that must never reach him) ── */
const PII = ['Demo Customer-Kline', 'kline@demo.example', '9015550100', '(901) 555-0100', '88 Maple Dr', 'Demo Customer-Stone', 'stone@demo.example', '12 Oak St', 'PAYROLL-SECRET', 'INVOICE-SECRET', 'COST-SECRET'];
resetCloud();
const now = Date.now(), iso = d => new Date(now - d * 864e5).toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }, { id: 'u2', name: 'Office', email: 'office@grayco-cs.com', role: 'Office Admin' }, { id: 'u3', name: 'Mark Eting', email: 'mm@grayco-cs.com', role: 'Marketing Manager' }, { id: 'u4', name: 'Pat PM', email: 'pm@grayco-cs.com', role: 'Project Manager' }]);
cset('projects', [{ id: 'PW', name: 'Demo Customer-Kline Water', client: 'Demo Customer-Kline', clientEmail: 'kline@demo.example', clientPhone: '9015550100', address: '88 Maple Dr, Germantown, TN 38138', status: 'Completed', type: 'Water mitigation', completedAt: iso(9), marketingOk: true, contract: 18400, costNote: 'COST-SECRET', leadId: 'L1' },
  { id: 'PR', name: 'Demo Customer-Stone Roof', client: 'Demo Customer-Stone', clientEmail: 'stone@demo.example', address: '12 Oak St, Bartlett, TN 38135', status: 'Completed', type: 'Roofing', completedAt: iso(12), contract: 21700, leadId: 'L2' }]);
cset('leads', [{ id: 'L1', name: 'Demo Customer-Kline', contact: { email: 'kline@demo.example', phone: '(901) 555-0100' }, address: '88 Maple Dr', city: 'Germantown', type: 'Water damage', stage: 'Won', createdAt: iso(30), contactedAt: iso(29.8), pm: 'Pat PM', attrib: { utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'soc-restoration-water' } },
  { id: 'L2', name: 'Demo Customer-Stone', contact: { email: 'stone@demo.example' }, city: 'Bartlett', type: 'Roofing', stage: 'Won', createdAt: iso(20), pm: 'Pat PM', attrib: { gclid: 'g', utm_campaign: '77' } },
  { id: 'L3', name: 'Demo Lost', city: 'Memphis', type: 'Storm damage', stage: 'Lost', lostReason: 'Price', createdAt: iso(12), mkSource: 'Door hanger / postcard' },
  { id: 'L4', name: 'Demo Web', city: 'Cordova', type: 'Fire damage', stage: 'Contacted', createdAt: iso(4), contactedAt: iso(3.9), sourceKind: 'website', source: 'Website form' },
  { id: 'L5', name: 'Demo Web 2', city: 'Collierville', type: 'Water leak', stage: 'Site Visit', createdAt: iso(2), attrib: { utm_source: 'instagram', utm_campaign: 'soc-restoration-water' } }]);
cset('invoices', [{ id: 'I1', note: 'INVOICE-SECRET', amount: 21700 }]); cset('payrollRuns', [{ id: 'R1', note: 'PAYROLL-SECRET' }]);
cset('gc_photos', [{ id: 'ph1', jobId: 'PW', ref: 'sb:crm-files/demo-after.jpg', tag: 'After', at: iso(9) }, { id: 'ph2', jobId: 'PR', ref: 'sb:crm-files/demo-roof.jpg', tag: 'After', at: iso(12) }]);
cset('gc_office_tasks', JSON.stringify([{ id: 'T1', label: 'Call Demo Customer-Kline about the deductible', assignees: ['office@grayco-cs.com'] }, { id: 'T2', label: 'Shoot the crew photos for October', assignees: ['mm@grayco-cs.com'], due: new Date().toISOString().slice(0, 10) }]));
cset('gc_approval_queue', JSON.stringify([]));
cset('gc_company_address', { current: '4007 Broadway Rd, Bartlett, TN 38135', next: '4014 Broadway Rd, Bartlett, TN 38135', switchOn: '2026-10-29' });
cset('gc_mkt_v1', { cfg: { main: { id: 'main', at: iso(1), socPlan: { on: true }, apprStage: { stage: 2, since: iso(3), known: ['post:tip:roofing'] } } },
  posts: { p1: { id: 'p1', title: 'Before / after', caption: 'Water damage dry-out and rebuild in Germantown!', jobId: 'PW', jobAddresses: ['88 Maple Dr, Germantown, TN 38138'], names: ['Demo Customer-Kline'], status: 'draft', socType: 'beforeafter', socService: 'restoration', networks: ['facebook'], photoRef: 'sb:crm-files/demo-after.jpg', at: iso(1) },
    p2: { id: 'p2', title: 'Gutter tip', caption: 'Clean your gutters this fall.', socType: 'tip', socService: 'roofing', networks: ['facebook'], status: 'draft', at: iso(1) } },
  adcamps: { g77: { id: 'g77', platform: 'google', campaignId: '77', name: 'Water Damage — Memphis', spend30: 620, at: iso(1) } },
  partners: { pt1: { id: 'pt1', name: 'Rita Realtor', email: 'rita@realtor.example', code: 'RE-RITA', status: 'active', at: iso(1) } } });
cset('gc_mkt_admin', { mm: { soldValues: true, approvesStage2: true } });
/* ── the functions, in this process, against the same database ── */
Object.assign(process.env, { SUPABASE_URL: 'https://fn.sb.test', SUPABASE_SERVICE_KEY: 'svc', CRM_URL: 'https://app.local', SITE_ORIGIN: 'https://app.local', MKT2_SECRET: 'a-long-test-secret-123456', MKT_SEND_GAP_MS: '0' });
['ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'STAFF_EMAILS'].forEach(k => delete process.env[k]);
const inbox = new Map([['probe', { key: 'probe', value: 1, updated_at: new Date().toISOString() }]]);
function J(st, body){ return { ok: st >= 200 && st < 300, status: st, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from('x'), headers: { get: () => 'application/json' } }; }
function keysOf(q){ if (q.startsWith('eq.')) return [q.slice(3)]; if (q.startsWith('in.(')) return q.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return null; }
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  let body = null; try { body = typeof init.body === 'string' && /^[\[{]/.test(init.body) ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
  if (u.host !== 'fn.sb.test') return J(404, { error: 'offline' });
  if (u.pathname === '/auth/v1/user') { const e = emailOfTok(String(hd.Authorization || hd.authorization || '').replace('Bearer ', '')); return e ? J(200, { id: ACCOUNTS[e].id, email: e }) : J(401, {}); }
  if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').slice(3); return J(200, e ? (STAFF[e] ? [Object.assign({}, STAFF[e])] : []) : Object.values(STAFF)); }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) return J(200, { signedURL: '/object/sign/' + u.pathname.split('/sign/')[1] + '?token=t' });
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'GET') { const ks = keysOf(u.searchParams.get('key') || ''); const rows = (ks || [...cloud.keys()]).map(k => cloud.get(k)).filter(Boolean).map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at })); return J(200, rows); }
    if (m === 'POST' || m === 'PATCH') { const rows = Array.isArray(body) ? body : [body]; rows.forEach(b => { let v = b.value; if (typeof v === 'string' && /^[\[{]/.test(v) && !['gc_office_tasks', 'gc_approval_queue'].includes(b.key)) { try { v = JSON.parse(v); } catch (e) {} } cset(b.key || (u.searchParams.get('key') || '').slice(3), v); }); return J(m === 'POST' ? 201 : 200, []); }
  }
  if (u.pathname === '/rest/v1/gc_lead_inbox_kv') { if (m === 'GET') { const ks = keysOf(u.searchParams.get('key') || ''); return J(200, (ks || [...inbox.keys()]).map(k => inbox.get(k)).filter(Boolean)); } const b = Array.isArray(body) ? body[0] : body; inbox.set(b.key, { key: b.key, value: b.value, updated_at: new Date().toISOString() }); return J(m === 'POST' ? 201 : 200, [inbox.get(b.key)]); }
  if (u.pathname === '/rest/v1/gc_news_suppress') return J(200, []);
  return J(m === 'GET' ? 200 : 201, []);
};
const LIVE = {}; ['soc', 'mkt', 'mkt2', 'referral', 'portal', 'staff-admin', 'x10', 'comms', 'bid-inbox', 'website-intake', 'plan-nightly', 'partner-api', 'cust-care', 'portal-extra', 'qb-proxy', 'gc-backup', 'social-post', 'subportal', 'send-email'].forEach(n => { try { LIVE[n] = require(F + '/' + n + '.js'); } catch (e) { console.log('  (not loadable: ' + n + ')'); } });
const seen = [];   /* every answer he got */
/* ── the browser ── */
async function fnRoute(c){
await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, async r => {
  const req = r.request(), u = new URL(req.url()), name = u.pathname.split('/').pop(), h = req.headers();
  const mod = LIVE[name];
  if (!mod) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  const ev = { httpMethod: req.method(), path: u.pathname, headers: Object.assign({ origin: 'https://app.local' }, h), queryStringParameters: Object.fromEntries(u.searchParams), body: req.postData() || '' };
  let res; try { res = await mod.handler(ev); } catch (e) { res = { statusCode: 500, body: JSON.stringify({ error: String(e && e.message) }) }; }
  const bodyTxt = res.isBase64Encoded ? '' : String(res.body || '');
  if (/utok-u-mm-/.test(h.authorization || '')) seen.push({ where: 'fn:' + name, status: res.statusCode, body: bodyTxt, req: ev.body.slice(0, 120) });
  return r.fulfill({ status: res.statusCode || 200, headers: Object.assign({ 'content-type': 'application/json' }, res.headers || {}), body: bodyTxt });
});
}
const c = await computer('mm', { build: BUILD, mobile: false });
await fnRoute(c);
/* the database answers him like docs/marketing-role.sql: his own staff row, 4 keys, nothing to write; everyone else: the harness */
const MM_KEYS = ['users', 'gc_company_address', 'gc_epoch', 'gc_mkt_admin'];
await c.ctx.route(u => /supabase\.co$/.test(new URL(u).host), async r => {
  const req = r.request(), u = new URL(req.url()), a = req.headers()['authorization'] || '';
  if (!/utok-u-mm-/.test(a) || u.pathname.startsWith('/auth/')) return r.fallback();
  const Jr = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  let out;
  if (u.pathname === '/rest/v1/gc_staff') out = [Object.assign({}, STAFF['mm@grayco-cs.com'])];
  else if (u.pathname === '/rest/v1/gc_kv' && req.method() === 'GET') { const ks = keysOf(u.searchParams.get('key') || '') || [...cloud.keys()]; out = ks.filter(k => MM_KEYS.includes(k)).map(k => cloud.get(k)).filter(Boolean).map(x => ({ key: x.key, value: x.value, updated_at: x.updated_at })); }
  else if (req.method() === 'GET' || req.method() === 'HEAD') out = [];
  else { seen.push({ where: 'db-write', status: 403, body: '', req: u.pathname + ' ' + (req.postData() || '').slice(0, 80) }); return Jr(403, { code: '42501', message: 'new row violates row-level security policy' }); }
  seen.push({ where: 'db:' + u.pathname, status: 200, body: JSON.stringify(out) });
  return Jr(200, out);
});
await signIn(c, 'mm@grayco-cs.com', 12000);
const p = c.page();
await p.setViewportSize({ width: 1366, height: 900 });
ok(await until(() => p.evaluate(() => !!(window.__GC_AUTH__ && window.__GC_AUTH__.marketing && window.__GC_AUTH__.marketing()))), 'he signs in as the Marketing Manager (a gc_staff row that is never active staff)');
await p.reload(); await sleep(9000);
ok(await until(() => p.evaluate(() => typeof window._gcIsMM === 'function' && window._gcIsMM() && !!window._gcMMData && !!window._gcMM && !!window._gcMMT), 25000), 'the marketing profile is on (patch MM + MMTABS)');
await until(() => p.evaluate(() => !!document.querySelector('#gc-mk-mount .gmt-body')), 20000);
const navItems = pg => pg.evaluate(() => [...document.querySelectorAll('nav button')].filter(b => b.offsetParent).map(b => (b.innerText || '').replace(/\s+/g, ' ').trim()));
const clickTab = async (pg, label) => { await sleep(900); return pg.evaluate(l => { const b = [...document.querySelectorAll('nav button')].find(x => x.offsetParent && (x.innerText || '').replace(/\s+/g, ' ').trim().replace(/^\S+\s*/, '') === l); if (!b) return false; b.click(); return true; }, label); };
const st = pg => pg.evaluate(() => ({ view: localStorage.getItem('grayco_view'), sec: window._gcMkt && window._gcMkt.state().sec, h1: ((document.querySelector('#gc-mk-mount .gmt-head h1') || {}).innerText || ''), on: ([...document.querySelectorAll('nav button')].find(b => b.offsetParent && /600|700/.test(getComputedStyle(b).fontWeight)) || {}).innerText || '' }));
const shotP = async (pg, name, full) => { if (!SHOTS) return; await sleep(600); await pg.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 82, fullPage: !!full }); };
const setupRow = () => { const v = cget('gc_mkt_admin'); return (typeof v === 'string' ? JSON.parse(v) : v) || {}; };
const tasks0 = JSON.stringify(cget('gc_office_tasks')), mkt0 = JSON.stringify(cget('gc_mkt_v1'));
/* ════════════ patch MKTSETUP: him ════════════ */
ok(await p.evaluate(() => !!window._gcMktSetup && window._gcMktSetup.items.length === 19), 'patch MKTSETUP is on (19 cards)');
ok(await clickTab(p, 'Marketing logins'), 'his 🔗 Marketing logins tab');
ok(await until(() => p.evaluate(() => !!document.querySelector('[data-mkt-setup]') && window._gcMktSetup.state().loaded), 15000), '🧰 Marketing setup is in the tab, statuses loaded from the server');
let cards = await p.evaluate(() => [...document.querySelectorAll('[data-mks]')].map(c => ({ k: c.getAttribute('data-mks'), st: c.getAttribute('data-status'), sel: !!c.querySelector('select[data-mks-set]'), links: [...c.querySelectorAll('a[href]')].map(a => [a.getAttribute('href'), a.target, a.rel]), go: [...c.querySelectorAll('[data-a="go"]')].map(b => b.getAttribute('data-sec')), txt: c.innerText })));
ok(cards.length === 19, '19 platform cards', cards.map(c => c.k));
ok(cards.filter(c => !c.sel).map(c => c.k).join() === 'resend' && /Admin only/.test(cards.find(c => c.k === 'resend').txt) && !cards.find(c => c.k === 'resend').links.length, 'a status picker on every card but Resend ("Admin only", no link for him)', cards.filter(c => !c.sel).map(c => c.k));
ok(cards.every(c => c.links.every(l => l[1] === '_blank' && /noopener/.test(l[2]))), 'every link opens in a new tab (noopener)');
const href = k => (cards.find(c => c.k === k) || { links: [] }).links.map(l => l[0]);
ok(href('gsc').some(h => /sc-domain:grayco-cs\.com/.test(h)) && href('lsa').includes('https://ads.google.com/local-services-ads/') && href('review').includes('https://grayco-cs.com/review') && href('meta').some(h => /events_manager2/.test(h)), 'the direct links (Search Console sc-domain, Local Services sign-up, review link, Events Manager)');
ok(cards.find(c => c.k === 'listings').go.includes('listings'), 'Yelp / BBB / Angi → the existing 📍 Listings section');
const all = await p.evaluate(() => document.querySelector('[data-mkt-setup]').parentNode.innerHTML);
ok(/accounts@grayco-cs\.com/.test(all) && /mm@grayco-cs\.com/.test(all) && /Owner grants access once/.test(all) && /signs up himself/.test(all), 'who does what: owner adds his e-mail once / he signs up with accounts@grayco-cs.com');
ok(/Water, fire and storm damage only/.test(all) && /\(901\) \d{3}-\d{4}/.test(all) && /swap\.js/.test(all) && /lead-intake/.test(all) && /x-api-key/.test(all) && /Grayco website/.test(all), 'LSA water / fire / storm, CallRail main number + swap.js, Zapier → lead-intake with x-api-key (filled by an admin), pixel dataset');
ok(!/password\s*[:=]|api[_ -]?key\s*[:=]|secret\s*[:=]|sk_live|re_[A-Za-z0-9]{8}|LEAD_KEY_[A-Z_]+\s*=/i.test(all), 'no password or key on the page');
const prog0 = await p.evaluate(() => document.querySelector('[data-mks-progress]').innerText);
ok(prog0 === '0 of 19 done', 'progress: 0 of 19 done', prog0);
/* he sets a status: Google Analytics → Done, Business Profile → Waiting on owner */
const setSel = (pg, k, v) => pg.evaluate(([k, v]) => { const s = document.querySelector('select[data-mks-set="' + k + '"]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);
await setSel(p, 'ga', 'done'); await sleep(2500);
await setSel(p, 'gbp', 'owner'); await sleep(2500);
let row = setupRow();
ok(row.setup && row.setup.ga && row.setup.ga.status === 'done' && row.setup.gbp.status === 'owner' && row.setup.ga.byEmail === 'mm@grayco-cs.com', 'saved on the server (gc_mkt_admin.setup) — done / waiting on owner, by him', row.setup);
ok(row.mm && row.mm.soldValues === true && row.mm.approvesStage2 === true, 'his settings in the same row untouched', row.mm);
ok(JSON.stringify(cget('gc_office_tasks')) === tasks0 && JSON.stringify(cget('gc_mkt_v1')) === mkt0, 'nothing else changed (to-dos, the marketing document)');
const prog1 = await p.evaluate(() => document.querySelector('[data-mks-progress]').innerText);
ok(prog1 === '1 of 19 done', 'progress: 1 of 19 done', prog1);
const r3 = await p.evaluate(() => window._gcMktExt.api('soc', { op: 'mkt_setup_set', key: 'resend', status: 'done' }));
ok(r3.__status === 403 && !(setupRow().setup || {}).resend, 'he cannot set the Admin only card (403)', r3);
await p.setViewportSize({ width: 1366, height: 900 });
await p.evaluate(() => { const g = document.querySelector('[data-mks="gbp"] details'); if (g) g.open = true; document.querySelector('[data-mkt-setup]').scrollIntoView(); });
await shotP(p, '01_mm_marketing_setup');
if (SHOTS) { await sleep(400); await p.screenshot({ path: path.join(SHOTS, '02_mm_marketing_setup_full.jpg'), type: 'jpeg', quality: 78, fullPage: true }); }
await p.setViewportSize({ width: 390, height: 844 }); await sleep(1200);
const ovf = await p.evaluate(() => { const g = document.querySelector('[data-mks-grid]'); return g ? g.scrollWidth - g.clientWidth : -1; });
ok(ovf <= 1, 'phone width: the cards fit (no sideways scroll)', ovf);
await p.evaluate(() => document.querySelector('[data-mkt-setup]').scrollIntoView()); await shotP(p, '03_mm_marketing_setup_phone');
await p.setViewportSize({ width: 1366, height: 900 });

/* ════════════ the admin and the office ════════════ */
const adm = await computer('admin', { build: BUILD, mobile: false }); await fnRoute(adm);
await signIn(adm, 'wjohnson@grayco-cs.com', 12000);
const pa = adm.page(); await pa.setViewportSize({ width: 1366, height: 900 }); await sleep(6000);
await pa.evaluate(() => window._setView('marketing')); await until(() => pa.evaluate(() => !!document.querySelector('#gc-mk-mount .gmt-body')), 20000);
await pa.evaluate(() => window._gcMkt.go('home')); await sleep(800);
const hc = await until(() => pa.evaluate(() => { const c = document.querySelector('[data-mks-home]'); return c && window._gcMktSetup.state().loaded ? c.innerText : null; }), 15000);
await pa.evaluate(() => window._gcMkt.draw && window._gcMkt.draw()); await sleep(600);
const hc2 = await pa.evaluate(() => (document.querySelector('[data-mks-home]') || {}).innerText || '');
ok(/1 of 19 done/.test(hc2) && /1 waiting on the owner/.test(hc2), '📣 Marketing (admin): 🧰 Marketing setup — 1 of 19 done · 1 waiting on the owner', hc2 || hc);
await pa.evaluate(() => document.querySelector('[data-mks-home] [data-a="go"][data-sec="logins"]').click()); await sleep(1200);
const ac = await pa.evaluate(() => ({ n: document.querySelectorAll('[data-mks]').length, sel: document.querySelectorAll('select[data-mks-set]').length, owner: (document.querySelector('[data-mks-owner]') || {}).innerText || '', resend: [...document.querySelectorAll('[data-mks="resend"] a')].map(a => a.href) }));
ok(ac.n === 19 && ac.sel === 19 && /Google Business Profile/.test(ac.owner) && ac.resend.some(h => /resend\.com/.test(h)), '"Open the checklist" → the admin can set all 19 (Resend too), "Waiting on you: Google Business Profile"', ac);
await shotP(pa, '04_admin_marketing_setup');
await setSel(pa, 'gbp', 'done'); await sleep(2500);
await setSel(pa, 'resend', 'done'); await sleep(2500);
row = setupRow();
ok(row.setup.gbp.status === 'done' && row.setup.resend.status === 'done' && row.setup.ga.status === 'done' && /Wesley/.test(row.setup.gbp.by), 'the admin marks Business Profile done (access granted) and the Admin only card', row.setup);
await p.evaluate(() => window._gcMktSetup.reload()); await sleep(2000);
const prog2 = await p.evaluate(() => (document.querySelector('[data-mks-progress]') || {}).innerText);
ok(prog2 === '3 of 19 done', 'he sees the admin\'s changes (3 of 19 done)', prog2);
const off = await computer('office', { build: BUILD, mobile: false }); await fnRoute(off);
await signIn(off, 'office@grayco-cs.com', 12000); await sleep(5000);
const po = off.page();
await po.evaluate(() => window._setView('marketing')); await until(() => po.evaluate(() => !!document.querySelector('#gc-mk-mount .gmt-body')), 20000);
await po.evaluate(() => window._gcMkt.go('logins')); await sleep(1500);
const oc = await po.evaluate(() => ({ logins: document.querySelectorAll('[data-login]').length, setup: !!document.querySelector('[data-mkt-setup]'), home: !!document.querySelector('[data-mks-home]') }));
ok(oc.logins > 0 && !oc.setup && !oc.home, 'the office: 🔗 Marketing logins as before, no setup checklist', oc);
await off.b.close();

/* nothing he got carries customer data */
const dom2 = await p.evaluate(() => document.body.innerText);
ok(!PII.filter(x => dom2.indexOf(x) >= 0).length, 'his page shows no customer data', PII.filter(x => dom2.indexOf(x) >= 0));
const netLeak = []; seen.forEach(x => { const L = PII.filter(y => x.body.indexOf(y) >= 0); if (L.length) netLeak.push(x.where + ' ' + x.status + ' ' + L.join(',')); });
ok(!netLeak.length, 'none of the ' + seen.length + ' answers he received carries it', netLeak.slice(0, 8));
ok(c.errs.filter(e => /mktsetup|_gcMktSetup/i.test(e)).length === 0 && adm.errs.filter(e => /mktsetup|_gcMktSetup/i.test(e)).length === 0, 'no page errors from patch MKTSETUP', c.errs.concat(adm.errs).slice(-6));
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
await adm.b.close(); await c.b.close(); process.exit(fail ? 1 : 0);
