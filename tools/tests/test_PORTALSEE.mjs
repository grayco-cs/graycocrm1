// test_PORTALSEE.mjs <build-dir> — patch PORTALSEE (owner 11/27): what the customer's portal shows — the GrayCo Care plans OFF until
// ⚙ Admin turns them on (then residential jobs only), the job's own "👤 What the customer sees" switches, "property" words and the
// 👷 Your Superintendent card on a commercial job, and Home in order: 📅 schedule first, the asks (How did you hear, GrayCo Care,
// referral, review) last. The real portal page + functions (custportal_world.mjs: in-memory Supabase, nothing leaves the machine);
// the CRM's editor on the offline harness (GC_HARNESS). Made-up data only.
//   A. the portal page (phone 390 + desktop 1366): a commercial job — no plans (switch ON), "How did you hear" kept and LAST, 👷 card under
//      the PM, schedule first; Payments hidden by the job → no tab; a residential job with the switch ON → "Protect your home";
//      the commercial job set to Show → "Protect your property"; "My property" on the commercial job.
//   B. the CRM (admin, desktop): ✏️ Edit portal → 👤 What the customer sees: Automatic / Show / Hide; a tap saves job.portalShow (and
//      nothing else) through the job's person-edit path; the new job's 🏠 Portal card offers "👤 Customer portal: what they see".
// Screenshots → $GC_SHOTS (default scratchpad/portalsee/).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = path.resolve(process.argv[2] || '.');
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/portalsee/';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const W = await import(pathToFileURL(path.join(build, 'tools/tests/custportal_world.mjs')).href);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = W.S;
const SUPER = { id: 'U9', name: 'Sam Steel', email: 'super.sample@grayco-cs.com', phone: '901-555-0177', role: 'Superintendent', active: true, payRate: 44, homeAddress: '77 Private Ln' };
function seed(job, settings){
  W.setDay(); W.seedSample({ photos: 4, crmDocs: false });
  const jobs = W.get('projects'), j = jobs.find(x => x.id === S.pid); Object.assign(j, job || {}); W.put('projects', jobs);
  W.put('users', W.get('users').concat([SUPER]));
  if (settings) W.put('gc_portal_settings', settings);
  W.resetCaches();
}
const COMJOB = { client: 'Acme Property Management LLC', type: 'Commercial Roofing', jobType: 'Commercial', superintendent: SUPER.name, name: 'Acme Plaza — Roof & Lobby' };
const order = pg => pg.evaluate(() => { const main = document.getElementById('main'), host = main.querySelector('.col-r') || main;
  return [...host.children].filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none').map(e => ({ id: e.id || (e.className || '').split(' ')[0], top: Math.round(e.getBoundingClientRect().top + scrollY) })).sort((a, b) => a.top - b.top).map(e => e.id); });

console.log('A. the portal page');
const srv = await W.startServer(), browser = await W.launch(), ERRS = [];
for (const kind of ['phone', 'desktop']) {
  seed(COMJOB, { autoSend: true, plans: true });
  let ctx = await W.context(browser, kind), pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push(kind + ': ' + e.message));
  await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 30000 }); await sleep(4000);
  const t = await pg.evaluate(() => document.body.innerText);
  ok(!(await pg.isVisible('#gcpp-maint').catch(() => false)) && !/GrayCo Care|Protect your home/i.test(t), kind + ': commercial job, company switch ON — no GrayCo Care plans');
  ok(await pg.isVisible('#gcpp-heard').catch(() => false), kind + ': "How did you hear about us" is kept on the commercial job');
  ok(/My property/.test(t) && !/🏠 My home/.test(t), kind + ': "🏢 My property", not "My home"');
  const sup = await pg.evaluate(() => { const c = document.getElementById('gcSuper'); return c ? c.innerText : ''; });
  ok(/Your Superintendent/.test(sup) && /Sam Steel/.test(sup) && /901-555-0177/.test(sup) && /super\.sample@grayco-cs\.com/.test(sup) && /Call/.test(sup) && /Text/.test(sup), kind + ': 👷 Your Superintendent — name, phone, e-mail, Call / Text', sup);
  const pmTop = await pg.evaluate(() => { const pm = document.querySelector('.pm'); const s = document.getElementById('gcSuper'); return pm && s ? [Math.round(pm.closest('section').getBoundingClientRect().top), Math.round(s.getBoundingClientRect().top), pm.closest('section').parentNode === s.parentNode] : null; });
  ok(!!pmTop && pmTop[0] < pmTop[1] && pmTop[2], kind + ': the superintendent card sits under the PM card', pmTop);
  const o = await order(pg);
  ok(o[0] === 'jobbar' || o[0] === 'gcSched' ? o.filter(x => x !== 'jobbar')[0] === 'gcSched' : false, kind + ': 📅 Your schedule is the first card', o);
  const lastAsks = o.slice(-3);
  ok(o.indexOf('gcpp-heard') > o.indexOf('gcSched') && o.slice(o.indexOf('gcpp-heard')).every(x => /^(gcpp-heard|gcpp-maint|gcRefCard|gcrefer|gcReview|gcph-testi)$/.test(x)), kind + ': the asks are last ("How did you hear" then referral / review)', o);
  const vw = await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); ok(vw, kind + ': no sideways scroll');
  const tr = await pg.textContent('#track');
  ok(!/\bLead\b|Contacted|Appointment booked/.test(tr) && /Contract signed \+ scheduled/.test(tr) && /In progress — now/.test(tr), kind + ': "Where your job is" has no Lead / Contacted / Appointment booked (commercial: from Contract signed)', tr.slice(0, 200));
  await pg.screenshot({ path: path.join(SHOTS, kind + '_commercial_home.png') }); await pg.screenshot({ path: path.join(SHOTS, kind + '_commercial_home_full.png'), fullPage: true });
  const raw = await pg.evaluate(async t => { const r = await fetch('/.netlify/functions/portal-plus', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-token': t }, body: JSON.stringify({ action: 'view' }) }); return r.json(); }, S.link);
  ok(raw.maint && raw.maint.offered === false && !raw.maint.plans && !raw.maint.tiers, kind + ': the server sent no plans data for the commercial job', raw.maint);
  const pv = await pg.evaluate(async t => { const r = await fetch('/.netlify/functions/portal', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-token': t }, body: JSON.stringify({ action: 'view' }) }); return r.json(); }, S.link);
  ok(pv.super && JSON.stringify(Object.keys(pv.super).sort()) === '["email","name","phone"]' && !JSON.stringify(pv).includes('77 Private Ln'), kind + ': the view carries only the super\'s name / phone / e-mail', pv.super);
  await ctx.close();

  /* the job's own switches: plans Show, Payments Hide */
  seed(Object.assign({}, COMJOB, { portalShow: { plans: 'on', pay: 'off' } }), { plans: false });
  ctx = await W.context(browser, kind); pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push(kind + ' show: ' + e.message));
  await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 30000 }); await sleep(4000);
  const care = await pg.evaluate(() => { const c = document.getElementById('gcpp-maint'); return c ? c.innerText : ''; });
  ok(/Protect your property/.test(care) && !/Protect your home/.test(care), kind + ': the job\'s Show → GrayCo Care on the commercial job says "Protect your property"', care.slice(0, 120));
  ok(!(await pg.isVisible('#tabs button[data-tab="pay"]')), kind + ': Payments hidden on the job → no Payments tab');
  const pv2 = await pg.evaluate(async t => { const r = await fetch('/.netlify/functions/portal', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-token': t }, body: JSON.stringify({ action: 'view' }) }); return r.json(); }, S.link);
  ok(pv2.money && pv2.money.invoices.length === 0 && pv2.money.payments.length === 0 && pv2.show.pay === false, kind + ': …and the server sent no invoices or payments', pv2.money);
  const ordr = await order(pg); ok(ordr.slice(-4).includes('gcpp-maint') && ordr.indexOf('gcpp-maint') > ordr.indexOf('gcpp-heard'), kind + ': GrayCo Care comes after "How did you hear", at the bottom', ordr);
  await pg.screenshot({ path: path.join(SHOTS, kind + '_commercial_plans_shown_full.png'), fullPage: true });
  await ctx.close();

  /* a residential job: switch ON → plans; switch OFF → none */
  seed({}, { plans: true });
  ctx = await W.context(browser, kind); pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push(kind + ' res: ' + e.message));
  await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 30000 }); await sleep(4000);
  const care2 = await pg.evaluate(() => { const c = document.getElementById('gcpp-maint'); return c ? c.innerText : ''; });
  ok(/Protect your home/.test(care2) && !(await pg.$('#gcSuper')), kind + ': residential job, switch ON → "Protect your home"; no superintendent card (Automatic = commercial)', care2.slice(0, 80));
  await pg.screenshot({ path: path.join(SHOTS, kind + '_residential_plans_on_full.png'), fullPage: true });
  await ctx.close();
  seed({}, null);
  { const c2 = await W.context(browser, kind); await c2.addInitScript(() => { try { localStorage.setItem('gc_lang', 'es'); } catch (e) {} }); const p2 = await c2.newPage(); p2.on('pageerror', e => ERRS.push(kind + ' es: ' + e.message));
    await p2.goto(srv.ORIGIN + '/#t=' + S.link); await p2.waitForSelector('#track', { timeout: 30000 }); await sleep(2500);
    const tes = await p2.textContent('#track');
    ok(/Dónde va su trabajo/.test(tes) && /Presupuesto enviado/.test(tes) && /En progreso — ahora/.test(tes) && !/Lead|Contacted|Appointment/.test(tes), kind + ': Spanish — "Dónde va su trabajo" from "Presupuesto enviado"', tes.slice(0, 200));
    await p2.screenshot({ path: path.join(SHOTS, kind + '_residential_es_stages.png') }); await c2.close(); }
  ctx = await W.context(browser, kind); pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push(kind + ' res0: ' + e.message));
  await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 30000 }); await sleep(4000);
  ok(!(await pg.$('#gcpp-maint')), kind + ': residential job, switch OFF (the default) → no plans');
  await ctx.close();
}
ok(ERRS.length === 0, 'portal page: no page errors', ERRS);
await browser.close(); await srv.close();

console.log('B. the CRM — ✏️ Edit portal → 👤 What the customer sees');
const H = await import(pathToFileURL(HARNESS).href);
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley');
W.seedSample({ photos: 4, crmDocs: false });
{
  const jobs = W.get('projects'), j = jobs.find(x => x.id === S.pid);
  Object.assign(j, COMJOB, { pm: 'Wesley Johnson', portalUrl: 'https://crm.grayco-cs.com/portal.html#t=' + S.link, portalAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-25T12:00:00Z', createdAt: new Date(Date.now() - 2 * 864e5).toISOString() });
  W.put('projects', jobs);
  W.put('users', W.get('users').concat([SUPER, { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true }]));
  W.put('gc_portal_settings', { autoSend: true, plans: true });
  W.resetCaches(); H.resetCloud();
  for (const k of Object.keys(W.KV)) H.cset(k, W.get(k));
}
const LIST_KEYS = ['projects', 'projectDocs', 'users', 'customers', 'schedule', 'estimates', 'invs', 'cos', 'changeOrders', 'subs', 'leads'];
const synced = new Map();
function sync(){ let n = 0; for (const k of LIST_KEYS) { const r = H.cloud.get(k); if (!r) continue; if (synced.get(k) === r.updated_at) continue; synced.set(k, r.updated_at); W.put(k, r.value); n++; } if (n) W.resetCaches(); }
const REAL = new Set(['portal', 'portal-access', 'cust-care', 'portal-sign', 'portal-plus', 'portal-home', 'selections', 'portal-extra']);
let ipn = 0;
const A = await H.computer('Admin', { build, viewport: { width: 1366, height: 900 } });
await A.ctx.route(u => /\/\.netlify\/functions\//.test(String(u.href || u)), async route => {
  const rq = route.request(); const u = new URL(rq.url()); const name = (u.pathname.split('/')[3] || '').replace(/[^a-z0-9-]/gi, '');
  let fromFrame = false; try { fromFrame = rq.frame() !== A.page().mainFrame(); } catch (e) {}
  const f = path.join(W.FNDIR, name + '.js');
  if ((!REAL.has(name) && !fromFrame) || !fs.existsSync(f)) return route.fallback();
  sync();
  const hd = Object.assign({}, rq.headers()); delete hd.authorization; if (!fromFrame) hd.authorization = 'Bearer good-admin';
  hd.origin = 'https://crm.grayco-cs.com'; hd['x-forwarded-for'] = '10.8.' + (++ipn % 250) + '.1';
  let out; try { out = await require(f).handler({ httpMethod: rq.method(), headers: hd, body: rq.postData() || '', queryStringParameters: Object.fromEntries(u.searchParams), path: u.pathname }); }
  catch (e) { out = { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) }; }
  return route.fulfill({ status: out.statusCode || 200, contentType: 'application/json', body: typeof out.body === 'string' ? out.body : JSON.stringify(out.body || {}) });
});
try {
  ok(await H.signIn(A, ADMIN, 20000), 'the admin signs in');
  await H.waitFor(A, () => !!window._gcPortalEd && (window._crm && window._crm.projects || []).length >= 1, null, 45000); await sleep(2500);
  ok(await A.ev(id => window._gcPortalEd.openSee(id), S.pid), '_gcPortalEd.openSee opens the editor');
  await H.waitFor(A, () => !!document.querySelector('#gcpe [data-pe-seekind]'), null, 15000);
  const st = await A.ev(() => { const s = document.querySelector('#gcpe [data-pe-sec="see"]'); return s ? { kind: s.querySelector('[data-pe-seekind]').getAttribute('data-pe-seekind'), rows: [...s.querySelectorAll('[data-pe-see]')].map(r => r.getAttribute('data-pe-see')), text: s.innerText } : null; });
  ok(!!st && st.kind === 'commercial' && ['plans', 'heard', 'review', 'referral', 'project', 'myhome', 'super', 'pay', 'photos', 'docs'].every(k => st.rows.includes(k)), '👤 What the customer sees: every switch, "a commercial job"', st);
  ok(!!st && /Maintenance plans[\s\S]*Now: hidden/.test(st.text) && /Superintendent card[\s\S]*Now: shown/.test(st.text), 'Automatic says what it means here (plans hidden, superintendent shown)', st && st.text.slice(0, 600));
  const navy = await A.ev(() => [...document.querySelectorAll('#gcpe [data-pe-sec="see"] *')].some(e => { const c = getComputedStyle(e); return /rgb\(15, 29, 47\)/.test(c.backgroundColor); }));
  ok(!navy, 'no navy in the new switches');
  await A.page().locator('#gcpe [data-pe-sec="see"]').screenshot({ path: path.join(SHOTS, 'crm_editor_switches.png') });
  await sleep(6000);   /* the CRM's own start-up work on the job (e-sign status, logs) settles first */
  /* the newest copy of the job on this computer (what the person-edit path starts from) */
  const before = await A.ev(id => JSON.parse(JSON.stringify((window._crm.projects || []).find(p => p.id === id) || {})), S.pid);
  await A.ev(() => document.querySelector('#gcpe [data-pe="see-set"][data-k="heard"][data-v="off"]').click());
  const saved = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { const p = (H.cget('projects') || []).find(x => x.id === S.pid) || {}; if (p.portalShow && p.portalShow.heard === 'off') return p; await sleep(400); } return null; })();
  ok(!!saved, 'Hide "How did you hear" → job.portalShow.heard = off reaches the cloud', saved && saved.portalShow);
  if (saved) { const diff = Object.keys(Object.assign({}, before, saved)).filter(k => !/^(portalShow|updatedAt|updatedBy|_fe|_lastEdit|savedAt|_v|_rev)$/.test(k) && JSON.stringify(before[k]) !== JSON.stringify(saved[k])); ok(diff.length === 0, '…from the newest copy of the job, and nothing else on it changed', diff); }
  ok(await A.ev(() => /Saved — 🙋 How did you hear about us: hidden from the customer/.test(document.querySelector('#gcpe [data-pe-seemsg]').textContent)), 'the editor says what was saved (nothing was sent)');
  await A.page().locator('#gcpe [data-pe-sec="see"]').screenshot({ path: path.join(SHOTS, 'crm_editor_switches_saved.png') });
  /* 👁 Customer view = exactly what the customer gets */
  await A.ev(() => document.querySelector('#gcpe [data-pe="mode"][data-m="cust"]').click());
  let fr = null; const t0 = Date.now();
  while (Date.now() - t0 < 30000) { fr = A.page().frames().find(f => /\/portal\.html#t=/.test(f.url())); if (fr && await fr.evaluate(() => !!document.getElementById('track')).catch(() => false)) break; await sleep(400); }
  await sleep(4000);
  const cv = fr ? await fr.evaluate(() => ({ heard: !!document.getElementById('gcpp-heard'), maint: !!document.getElementById('gcpp-maint'), sup: (document.getElementById('gcSuper') || {}).innerText || '' })) : null;
  ok(!!cv && !cv.heard && !cv.maint && /Sam Steel/.test(cv.sup), '👁 Customer view: no "How did you hear", no plans, the 👷 superintendent', cv);
  await A.page().screenshot({ path: path.join(SHOTS, 'crm_customer_view.png') });
  await A.ev(() => window._gcPortalEd.close());
  /* ⚙ Admin: the company switch is in the portal row */
  const crm = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
  ok(/id="gc-adm-plans"/.test(crm) && /Show GrayCo Care maintenance plans on customer portals/.test(crm) && /set: \{ plans: v \}/.test(crm), '⚙ Admin: "🛠 Show GrayCo Care maintenance plans on customer portals" next to the portal settings');
  ok(/data-q="psee"/.test(crm) && /👤 Customer portal: what they see/.test(crm), 'the job\'s 🏠 Portal card offers "👤 Customer portal: what they see" on a new job (inline, no popup)');
  ok(!A.errs.length, 'CRM: no page errors', A.errs.slice(0, 5));
} finally { try { await A.b.close(); } catch (e) {} }
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail) + '   screenshots: ' + SHOTS);
process.exit(fail ? 1 : 0);
