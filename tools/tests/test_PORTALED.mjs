// test_PORTALED.mjs <build-dir> — patch PORTALED: 👤 Customer portal opens the job's portal full screen (what the customer sees
// + edit it). Offline harness (GC_HARNESS, made-up data) for the CRM; the REAL portal functions (portal.js, portal-access.js,
// cust-care.js, portal-sign.js …) answer behind it with mocked storage (custportal_world.mjs: in-memory Supabase / Resend — nothing
// leaves the machine). The SAMPLE job (made up) has a carrier and a sub on it; the portal page inside is the real portal.html.
//   1. admin (Wesley) on an iPhone: 👤 Customer portal on a job WITH a portal → the full-screen page (✏️ Edit portal) and
//      👁 Customer view = the real portal (staff preview) with the job, its updates;
//   2. adds a task, a plan file (approved in place) and a question — each shows "👁 Visible to the customer" first and is saved
//      only on its button (a Cancel saves nothing) — and they appear in the customer view (Home checklist, Documents, Messages);
//   3. a job with NO portal → the "Make the portal" prompt; it says nothing is sent; the link is made only on its confirm; no
//      e-mail at any time, no "send-link" / "notify-docs" asked by the page;
//   4. the customer view has no carrier name and no sub-portal link / sub name anywhere;
//   5. a PM (Demo PM) gets only his jobs' portals (another PM's job: nothing opens);
//   6. no page errors. Screenshots (deviceScaleFactor 2) → $GC_SHOTS (default scratchpad/portaled/).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = path.resolve(process.argv[2] || '.');
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/portaled/';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

const W = await import(pathToFileURL(path.join(build, 'tools/tests/custportal_world.mjs')).href);
const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), PM = byId('u-pm'), OFFICE = byId('u-office');
const S = W.S;

/* ── the made-up world: the SAMPLE job (has a portal), the same customer's second job (no portal), another PM's job ── */
W.seedSample({ photos: 4, crmDocs: false }); W.resetCaches();
const LIST_KEYS = ['projects', 'projectDocs', 'users', 'customers', 'schedule', 'estimates', 'invs', 'cos', 'changeOrders', 'subs', 'vendors', 'punch', 'leads', 'scopes', 'gc_photos'];
{
  const jobs = W.get('projects');
  const j = jobs.find(x => x.id === S.pid), o = jobs.find(x => x.id === S.other);
  Object.assign(j, { pm: 'Demo PM', portalUrl: 'https://crm.grayco-cs.com/portal.html#t=' + S.link, portalAt: '2026-10-02T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z', createdAt: '2026-10-01T12:00:00Z' });
  Object.assign(o, { pm: 'Other PM', portalUrl: 'https://crm.grayco-cs.com/portal.html#t=' + S.otherLink, updatedAt: '2026-11-01T12:00:00Z', createdAt: '2026-10-01T12:00:00Z' });
  jobs.push({ id: 'PNOPORT', name: 'Sample Customer — Deck', client: S.customer.name, clientEmail: S.customer.email, clientPhone: S.customer.phone, address: S.customer.address, autoPO: 'S1002', pm: 'Demo PM', status: 'bidding', type: 'Residential', created: '2026-10-01', createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z' });
  W.put('projects', jobs);
  const users = W.get('users').concat([{ id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true },
    { id: 'u4', name: 'Office Demo', email: OFFICE, role: 'Office Manager', active: true }, { id: 'u3', name: 'Other PM', role: 'Project Manager', active: true }]);
  W.put('users', users);
  W.put('scopes', [{ id: 'SCS_1', ss: 1, kind: 'sub', internal: false, pid: S.pid, title: 'Kitchen — cabinets', lines: [{ k: 'a', sec: 'Kitchen', desc: 'Install shaker cabinets', qty: 22, unit: 'LF', note: 'INTERNAL: ' + S.sub + ' does it' }], version: 1 },
    { id: 'SCB_1', ss: 1, kind: 'budget', internal: true, pid: S.pid, title: '', lines: [{ k: 'a', sec: 'Kitchen', desc: 'Install shaker cabinets', qty: 22, unit: 'LF', budget: 8765 }] }]);
  H.resetCloud();
  for (const k of Object.keys(W.KV)) H.cset(k, W.get(k));
}
/* the CRM's lists go to the functions' cloud before each call (the CRM writes them to the harness's cloud) */
const synced = new Map();
function sync(){ let n = 0; for (const k of LIST_KEYS) { const r = H.cloud.get(k); if (!r) continue; if (synced.get(k) === r.updated_at) continue; synced.set(k, r.updated_at); W.put(k, r.value); n++; } if (n) W.resetCaches(); }
const REAL = new Set(['portal', 'portal-access', 'cust-care', 'portal-sign', 'portal-plus', 'portal-home', 'selections', 'portal-extra']);
const CALLS = []; let ipn = 0;
async function wire(A, staffTok){
  await A.ctx.route(u => /\/\.netlify\/functions\//.test(String(u.href || u)), async route => {
    const rq = route.request(); const u = new URL(rq.url()); const name = (u.pathname.split('/')[3] || '').replace(/[^a-z0-9-]/gi, '');
    let fromFrame = false; try { fromFrame = rq.frame() !== A.page().mainFrame(); } catch (e) {}
    const f = path.join(W.FNDIR, name + '.js');
    if ((!REAL.has(name) && !fromFrame) || !fs.existsSync(f)) return route.fallback();
    sync();
    let b = {}; try { b = JSON.parse(rq.postData() || '{}'); } catch (e) {}
    CALLS.push({ who: A.name, name, action: b.action, op: b.op, frame: fromFrame, at: Date.now() });
    const hd = Object.assign({}, rq.headers()); delete hd.authorization;
    if (!fromFrame) hd.authorization = staffTok;
    hd.origin = 'https://crm.grayco-cs.com'; hd['x-forwarded-for'] = '10.7.' + (++ipn % 250) + '.' + (ipn % 200);
    let out; try { out = await require(f).handler({ httpMethod: rq.method(), headers: hd, body: rq.postData() || '', queryStringParameters: Object.fromEntries(u.searchParams), path: u.pathname }); }
    catch (e) { out = { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) }; }
    return route.fulfill({ status: out.statusCode || 200, contentType: 'application/json', body: typeof out.body === 'string' ? out.body : JSON.stringify(out.body || {}) });
  });
}
const IPHONE = () => { try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1' }); } catch (e) {} };
async function phone(email, who, tok){
  const c = await H.computer(who, { build, mobile: true, init: IPHONE }); OPEN.push(c);
  await wire(c, tok);
  ok(await H.signIn(c, email, 20000), who + ' signs in on the phone');
  await H.waitFor(c, () => { const j = document.querySelector('#_gcJobPick.gc-fh'); return !!j && getComputedStyle(j).display !== 'none' && (window._crm && window._crm.projects || []).length >= 2; }, null, 45000);
  await H.waitFor(c, () => !!window._gcPortalEd && !!window._gcFP, null, 20000);
  await sleep(1500);
  return c;
}
async function tap(c, sel){
  const L = c.page().locator(sel).first();
  await L.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {}); await sleep(150);
  const bb = await L.boundingBox().catch(() => null);
  const free = bb ? await L.evaluate((e, p) => { const h = document.elementFromPoint(p.x, p.y); return !!h && (h === e || e.contains(h)); }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }).catch(() => false) : false;
  if (bb && free) await c.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await L.evaluate(e => e.click()).catch(() => {});
  await sleep(600);
}
/* the job's 👤 Customer portal button: its Field card (the list of jobs) — the same run('fp-cust') as the job page tile */
async function custBtn(c, pid){
  await c.ev(() => { document.querySelectorAll('.gcfp-sheet,.gc-ra-sheet,.gc-fh-sheet,._gcSheetOv').forEach(o => o.remove()); try { if (window._gcPortalEd) window._gcPortalEd.close(); } catch (e) {} try { window.__gcFhAll = true; window._gcField.open(); } catch (e) {} });
  await sleep(800);
  const sel = '#_gcJobPick .fh-job[data-job="' + pid + '"] [data-fa="fp-cust"]';
  const has = await H.waitFor(c, s => !!document.querySelector(s), sel, 8000);
  if (has) await tap(c, sel); else await c.ev(id => window._gcFP.run('fp-cust', window._crm.projects.find(p => p.id === id)), pid);
  await sleep(800);
  return !!has;
}
const cloudJob = id => (H.cget('projects') || []).find(p => p.id === id) || {};
async function waitCloud(fn, ms){ const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { try { if (fn()) return true; } catch (e) {} await sleep(400); } return false; }
const frameOf = c => c.page().frames().find(f => /\/portal\.html#t=/.test(f.url()));
async function custView(c){
  await tap(c, '#gcpe [data-pe="mode"][data-m="cust"]');
  let fr = null; const t0 = Date.now();
  while (Date.now() - t0 < 30000) { fr = frameOf(c); if (fr) { const okj = await fr.evaluate(() => { const j = document.getElementById('jobName'); return !!j && j.textContent.length > 2 && !document.querySelector('#main .skel'); }).catch(() => false); if (okj) break; } await sleep(400); }
  await sleep(800);
  return fr;
}
const shot = async (c, n) => { await c.page().screenshot({ path: path.join(SHOTS, n + '.png') }); console.log('    📸 ' + n + '.png'); };

const OPEN = [];
try {
  const mails0 = W.RESEND.length;
  console.log('1. admin on an iPhone — a job with a portal');
  const A = await phone(ADMIN, 'Admin', 'Bearer good-admin');
  await shot(A, '01_field_home');
  const viaCard = await custBtn(A, S.pid);
  const st1 = await A.ev(() => { const o = document.getElementById('gcpe'); return o ? { pid: o.getAttribute('data-pid'), title: o.querySelector('.pe-tt b').textContent, secs: [...o.querySelectorAll('[data-pe-sec]')].map(s => s.getAttribute('data-pe-sec')), make: !!o.querySelector('[data-pe-make]'), sheet: !!document.querySelector('.gcfp-sheet'), full: (() => { const r = o.getBoundingClientRect(), app = document.documentElement.classList.contains('gc-pu-app'), keep = app ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gc-pu-tabs')) || 0) : 0; const floor = innerHeight - keep;   /* PHONEUI: Field pages end above its bottom bar (+ dock) */ return r.top <= 0.5 && r.left <= 0.5 && r.width >= innerWidth - 1 && r.bottom >= floor - 1; })(), own: o.hasAttribute('data-gc-pu-own') && !o.classList.contains('gc-pu-page'), bar: (() => { const tb = document.getElementById('gc-fh-tabs'); if (!tb || getComputedStyle(tb).display === 'none') return null; const b = tb.querySelector('[data-t]'); if (!b) return null; const q = b.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!h && tb.contains(h); })() } : null; });
  ok(viaCard && st1 && st1.pid === S.pid && !st1.sheet && st1.full && st1.own && st1.bar !== false, '👤 Customer portal on the job card opens the portal full screen down to the bottom bar (not the small sheet; its own page, not restyled by PHONEUI; the bar stays tappable)', st1);
  ok(st1 && ['status', 'details', 'sched', 'tasks', 'needs', 'scope', 'docs', 'co', 'msgs', 'posts', 'jobs', 'tell'].every(k => st1.secs.includes(k)) && !st1.make, '✏️ Edit portal: details · schedule · checklist · we need · scope · plans & documents · change orders · messages · updates · jobs · tell', st1 && st1.secs);
  await H.waitFor(A, () => !!document.querySelector('#gcpe [data-pe-sec="msgs"] .pe-msg') && !/Loading/.test(document.querySelector('#gcpe [data-pe-docs]').textContent), null, 15000);
  ok(await A.ev(() => /Can the crew park in the driveway/.test(document.querySelector('#gcpe [data-pe-sec="msgs"]').textContent)), 'the portal\'s Messages thread is on the page (the customer\'s question)');
  ok(await A.ev(() => !/Open in GrayCo Photos|Sub portal|subportal/i.test(document.getElementById('gcpe').innerText)), 'the page has no "Open in GrayCo Photos" and no sub portal');
  ok(await A.ev(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#gcpe .pe-body').scrollWidth <= innerWidth + 1), 'no sideways scroll at 390 px');
  await shot(A, '02_edit_top');

  /* 👁 the customer's view: the real portal page (staff preview) */
  let fr = await custView(A);
  const cv = fr ? await fr.evaluate(() => ({ job: document.getElementById('jobName').textContent, pv: !!document.getElementById('pvbar'), text: document.body.innerText, html: document.getElementById('main').outerHTML + document.querySelector('header').outerHTML, hrefs: [...document.querySelectorAll('a[href],iframe[src],img[src]')].map(a => a.getAttribute('href') || a.getAttribute('src')) })) : null;
  ok(!!cv && /Roof & Kitchen/.test(cv.job) && cv.pv && /Materials are on site/.test(cv.text), '👁 Customer view: the real portal (staff preview bar) with the job and its updates', cv && { job: cv.job, pv: cv.pv });
  ok(!!cv && !cv.html.includes(S.carrier) && !/Sample Mutual/i.test(cv.text), 'customer view: no carrier name anywhere on the page');
  ok(!!cv && !cv.html.includes(S.sub) && !cv.hrefs.some(h => /subportal|portal-app|#s=|\/#t=/.test(h || '')), 'customer view: no sub name, no sub-portal link', cv && cv.hrefs.filter(h => /subportal|portal-app|#s=|\/#t=/.test(h || '')));
  await shot(A, '03_customer_view');
  await tap(A, '#gcpe [data-pe="mode"][data-m="edit"]');

  /* a task: "Visible to the customer" first; Cancel saves nothing */
  await A.page().locator('#gcpe [data-f="task-text"]').fill('Cancelled task — never saved');
  await tap(A, '#gcpe [data-pe="task-add"]');
  const vis0 = await A.ev(() => { const v = document.querySelector('#gcpe .pe-vis'); return v ? v.innerText : ''; });
  ok(/Visible to the customer/.test(vis0) && /Cancelled task/.test(vis0) && /Nothing is e-mailed or texted/.test(vis0), 'a change shows "👁 Visible to the customer" (what they will see) before saving', vis0);
  await tap(A, '#gcpe .pe-vis [data-v="no"]'); await sleep(1500);
  ok(!JSON.stringify(cloudJob(S.pid).portalTasks || []).includes('Cancelled task'), 'Cancel: nothing saved');
  await A.page().locator('#gcpe [data-f="task-text"]').fill('Pick your tile color');
  await tap(A, '#gcpe [data-pe="task-add"]');
  await shot(A, '04_visible_to_customer');
  ok(!JSON.stringify(cloudJob(S.pid).portalTasks || []).includes('Pick your tile color'), 'not saved before its button');
  await tap(A, '#gcpe .pe-vis [data-v="ok"]');
  ok(await waitCloud(() => (cloudJob(S.pid).portalTasks || []).some(t => t.text === 'Pick your tile color' && !t.done)), 'task saved on the job (the cloud copy)');

  /* a scope from the job's scopes (the no-price sub scope, never the budget) */
  console.log('    scope options: ' + JSON.stringify(await A.ev(() => [[...document.querySelectorAll('#gcpe [data-f="scope-src"] option')].map(o => o.value), (window._crm.scopes || []).length, window._gcScopeSend && window._gcScopeSend.list ? JSON.stringify(window._gcScopeSend.list('PSAMPLE1')).slice(0, 300) : 'nolist'])));
  await A.page().locator('#gcpe [data-f="scope-src"]').selectOption('SCS_1');
  await tap(A, '#gcpe [data-pe="scope-add"]');
  const visS = await A.ev(() => (document.querySelector('#gcpe .pe-vis') || {}).innerText || '');
  ok(/Install shaker cabinets/.test(visS) && !/8765|INTERNAL/.test(visS), 'scope preview: the work words, no budget / note', visS);
  await tap(A, '#gcpe .pe-vis [data-v="ok"]');
  ok(await waitCloud(() => (cloudJob(S.pid).portalScopes || []).some(x => x.title === 'Kitchen — cabinets' && x.lines.length === 1 && !('note' in x.lines[0]))), 'scope saved on the job (no notes / prices)');

  /* a plan: upload → job's Documents (Plans) → ⏳ waiting for approval → ✅ Put in portal (the approval, in place) */
  const pdf = W.pdfOf('Kitchen plans', ['Plan view, elevations']);
  await A.page().locator('#gcpe [data-f="doc-file"]').setInputFiles({ name: 'Kitchen plans.pdf', mimeType: 'application/pdf', buffer: pdf });
  await sleep(600);
  const visP = await A.ev(() => (document.querySelector('#gcpe .pe-vis') || {}).innerText || '');
  ok(/Kitchen plans\.pdf/.test(visP) && /once approved|after its/.test(visP), 'plan upload: "Visible to the customer" says it shows once approved', visP);
  await tap(A, '#gcpe .pe-vis [data-v="ok"]');
  ok(await waitCloud(() => (H.cget('projectDocs') || []).some(d => d.pid === S.pid && d.name === 'Kitchen plans.pdf' && d.portalShare === true && d.cat === 'Plans')), 'plan in the job\'s Documents (Plans, customer sees it)');
  const waitBtn = await H.waitFor(A, () => { const r = [...document.querySelectorAll('#gcpe [data-doc]')].find(x => /Kitchen plans/.test(x.textContent)); return !!r && /Waiting for approval/.test(r.textContent) && !!r.querySelector('[data-pe="doc-appr"]'); }, null, 30000);
  ok(!!waitBtn, 'the plan shows "⏳ Waiting for approval — not in portal" with ✅ Put in portal', await A.ev(() => [...document.querySelectorAll('#gcpe [data-doc]')].map(x => x.textContent)));
  await A.ev(() => { const r = [...document.querySelectorAll('#gcpe [data-doc]')].find(x => /Kitchen plans/.test(x.textContent)); if (r) r.scrollIntoView({ block: 'center' }); });
  await shot(A, '05_plan_waiting');
  if (!waitBtn) console.log('    plan in the functions\' cloud: ' + JSON.stringify((W.get('projectDocs') || []).filter(d => /Kitchen plans/.test(d.name))) + '\n    gate: ' +JSON.stringify((W.get('gc_portal_gate') || []).filter(x => x && (x.pid === S.pid || x.id === '_meta')).map(x => [x.id, x.st, x.aq, x.since])) + ' calls: ' + JSON.stringify(CALLS.filter(x => x.action === 'gate').map(x => x.op)));
  if (waitBtn) {
    await A.ev(() => { const r = [...document.querySelectorAll('#gcpe [data-doc]')].find(x => /Kitchen plans/.test(x.textContent)); r.querySelector('[data-pe="doc-appr"]').setAttribute('data-test-appr', '1'); });
    await tap(A, '#gcpe [data-test-appr]');
    await tap(A, '#gcpe .pe-vis [data-v="ok"]');
    ok(!!(await H.waitFor(A, () => { const r = [...document.querySelectorAll('#gcpe [data-doc]')].find(x => /Kitchen plans/.test(x.textContent)); return !!r && /Customer sees it/.test(r.textContent); }, null, 20000)), '✅ approved in place → "Customer sees it"');
  }

  /* a question → the portal's Messages */
  await A.page().locator('#gcpe [data-f="msg-text"]').fill('Do you want the gutters white or bronze?');
  await tap(A, '#gcpe [data-pe="msg-send"]');
  const visM = await A.ev(() => (document.querySelector('#gcpe .pe-vis') || {}).innerText || '');
  ok(/gutters white or bronze/.test(visM) && /No e-mail or text/.test(visM), 'question: "Visible to the customer" — Messages, no e-mail or text', visM);
  await tap(A, '#gcpe .pe-vis [data-v="ok"]');
  ok(!!(await H.waitFor(A, () => /gutters white or bronze/.test((document.querySelector('#gcpe [data-pe-sec="msgs"]') || {}).textContent || ''), null, 15000)), 'the question is in the thread');
  ok((W.TABLES.gc_portal_msg || []).some(m => m.project_id === S.pid && m.party === 'c' && m.side === 'gc' && /gutters/.test(m.text)), 'stored as a GrayCo message on the customer\'s thread (gc_portal_msg party c)');

  /* summary + milestone */
  await A.page().locator('#gcpe [data-f="summary"]').fill('New roof and a kitchen remodel. ' + S.carrier + ' pays the roof part.');
  await tap(A, '#gcpe [data-pe="details-save"]');
  const visD = await A.ev(() => (document.querySelector('#gcpe .pe-vis') || {}).innerText || '');
  ok(/never shown to a customer/.test(visD), 'a carrier name typed by staff: warned before saving (the portal will say "your insurance company")', visD);
  await tap(A, '#gcpe .pe-vis [data-v="ok"]');
  ok(await waitCloud(() => /kitchen remodel/.test(((cloudJob(S.pid).portalSummary) || {}).text || '')), 'About your project saved');
  await A.page().locator('#gcpe [data-f="ms-name"]').fill('Cabinets installed');
  await A.page().locator('#gcpe [data-f="ms-date"]').fill('2026-12-03');
  await tap(A, '#gcpe [data-pe="ms-add"]'); await tap(A, '#gcpe .pe-vis [data-v="ok"]');
  ok(await waitCloud(() => (cloudJob(S.pid).portalMilestones || []).some(m => m.name === 'Cabinets installed')), 'milestone saved');

  /* 👁 the customer view now: checklist, scope, summary, milestone (Home), the plan (Documents), the question (Messages) */
  await sleep(1500);
  fr = await custView(A);
  { const wj = (W.get('projects') || []).find(x => x.id === S.pid) || {}, hj = cloudJob(S.pid); console.log('    diag: world job has ' + ['portalTasks', 'portalSummary', 'portalScopes', 'portalMilestones'].filter(k => k in wj).join(',') + ' | harness job has ' + ['portalTasks', 'portalSummary', 'portalScopes', 'portalMilestones'].filter(k => k in hj).join(',') + ' | world plan: ' + (W.get('projectDocs') || []).some(d => d.name === 'Kitchen plans.pdf') + ' harness plan: ' + (H.cget('projectDocs') || []).some(d => d.name === 'Kitchen plans.pdf') + ' frame calls: ' + JSON.stringify(CALLS.filter(x => x.frame).slice(-6).map(x => x.name + ':' + x.action))); }
  const home = fr ? await fr.evaluate(() => ({ t: (document.getElementById('gcEdTasks') || {}).innerText || '', sum: (document.getElementById('gcEdSummary') || {}).innerText || '', scope: [...document.querySelectorAll('.gc-ed-scope')].map(x => x.innerText).join('|'), steps: (document.getElementById('schedSteps') || {}).innerText || '', html: document.documentElement.outerHTML })) : null;
  ok(!!home && /Pick your tile color/.test(home.t), 'customer view: the task is on "Your project checklist"', home && home.t);
  ok(!!home && /Install shaker cabinets/.test(home.scope) && /kitchen remodel/.test(home.sum) && /Cabinets installed/.test(home.steps), 'customer view: the scope, About your project and the milestone', home && { sum: home.sum, steps: home.steps, scope: home.scope.slice(0, 100) });
  ok(!!home && /[Yy]our insurance company/.test(home.sum) && !home.html.includes(S.carrier), 'customer view: the typed carrier name reads "your insurance company"', home && home.sum);
  if (fr) await fr.evaluate(() => { const e = document.getElementById('gcEdSummary') || document.getElementById('gcEdTasks'); if (e) e.scrollIntoView({ block: 'start' }); });
  await shot(A, '06_customer_view_after');
  if (fr) {
    await fr.evaluate(() => document.querySelector('#tabs button[data-tab="docs"]').click()); await sleep(1500);
    const dtx = await fr.evaluate(() => document.getElementById('main').innerText);
    ok(/Kitchen plans/.test(dtx), 'customer view → Documents: the plan', dtx.slice(0, 300));
    await fr.evaluate(() => { const e = [...document.querySelectorAll('#main a, #main div, #main span')].find(x => /^Kitchen plans/.test((x.textContent || '').trim()) && x.children.length < 3); if (e) e.scrollIntoView({ block: 'center' }); });
    await A.page().screenshot({ path: path.join(SHOTS, '07_customer_docs.png') });
    await fr.evaluate(() => document.querySelector('#tabs button[data-tab="msgs"]').click());
    const mt = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 10000) { const x = await fr.evaluate(() => (document.getElementById('cMsgList') || {}).innerText || ''); if (/gutters/.test(x)) return x; await sleep(400); } return ''; })();
    ok(/gutters white or bronze/.test(mt), 'customer view → Messages: the question', mt.slice(0, 200));
    await A.page().screenshot({ path: path.join(SHOTS, '08_customer_msgs.png') });
    const all = await fr.evaluate(() => document.documentElement.outerHTML);
    ok(!all.includes(S.carrier) && !all.includes(S.sub), 'customer view (every tab drawn): no carrier, no sub');
  }
  await tap(A, '#gcpe [data-pe="mode"][data-m="edit"]');

  console.log('2. a job with no portal');
  const n0 = CALLS.length;
  await custBtn(A, 'PNOPORT');
  const mk = await A.ev(() => { const o = document.getElementById('gcpe'); return o ? { pid: o.getAttribute('data-pid'), make: !!o.querySelector('[data-pe="make"]'), cust: o.querySelector('[data-m="cust"]').disabled } : null; });
  ok(mk && mk.pid === 'PNOPORT' && mk.make && mk.cust, 'no portal → the "🏠 Make the portal" prompt (Customer view is off)', mk);
  await tap(A, '#gcpe [data-pe="make"]');
  const mtx = await A.ev(() => (document.querySelector('#gcpe [data-pe-makeok]') || {}).innerText || '');
  ok(/NOTHING is sent/.test(mtx) && /no e-mail, no text/.test(mtx), 'it says what will be sent and when: nothing, until you send the link yourself', mtx);
  await shot(A, '09_make_portal');
  ok(!CALLS.slice(n0).some(x => x.action === 'create'), 'no link made before its confirm');
  await tap(A, '#gcpe [data-pe="make-go"]');
  ok(!!(await H.waitFor(A, () => !!document.querySelector('#gcpe [data-pe-sec="details"]') && !document.querySelector('#gcpe [data-pe="make"]'), null, 20000)), 'Make it — send nothing → the portal is made and the editor opens');
  ok(await waitCloud(() => /portal\.html#t=/.test(cloudJob('PNOPORT').portalUrl || '')), 'the new link is on the job');
  ok((W.TABLES.gc_portal || []).some(r => r.project_id === 'PNOPORT' && !r.revoked && !r.sent_at), 'gc_portal row made, not sent (sent_at empty)');
  await shot(A, '10_portal_made');
  await sleep(3000);
  ok(!CALLS.some(x => x.action === 'send-link' || x.action === 'notify-docs' || x.action === 'c-send'), 'the page asked for no e-mail (no send-link / notify-docs) at any time', CALLS.filter(x => !x.frame).map(x => x.action + (x.op ? ':' + x.op : '')));
  ok(W.RESEND.length === mails0, 'no e-mail went out (Resend untouched)', W.RESEND.slice(mails0).map(m => m && m.subject));
  const aq = W.get(require(path.join(W.FNDIR, 'portal.js'))._core.AQ_KEY) || [];
  const aqL = Array.isArray(aq) ? aq : (aq && aq.list) || [];
  ok(!aqL.some(x => x && /portal_link|portal_docs/.test(x.kind)), 'no customer e-mail waiting either (only the paper\'s "Put in the portal" approval, done)', aqL.map(x => x && x.kind));
  /* the desk's 🏠 Portal card (patch Q) carries ✏️ Open portal → the same page */
  const dk = await A.ev(id => { try { window._gcPortalEd.close(); const p = window._crm.projects.find(x => x.id === id); const el = window._gcPortal.card(p, false); el.setAttribute('data-test-card', '1'); document.body.appendChild(el); const b = el.querySelector('[data-q="ped"]'); if (!b) return { btn: false }; b.click(); const o = document.getElementById('gcpe'); const r = { btn: true, pid: o && o.getAttribute('data-pid') }; window._gcPortalEd.close(); el.remove(); return r; } catch (e) { return { err: String(e) }; } }, S.pid);
  ok(dk.btn && dk.pid === S.pid, 'desk: the 🏠 Portal card has ✏️ Open portal → the same full-screen page', dk);
  ok(!A.errs.length, 'no page errors (admin)', A.errs.slice(0, 5));
  await A.close();

  console.log('3. a PM: only his own jobs');
  const P = await phone(PM, 'PM', 'Bearer good-pm');
  const pv = await P.ev(o => ({ own: window._gcPortalEd.can(o.a), noport: window._gcPortalEd.can('PNOPORT'), other: window._gcPortalEd.can(o.b), openOther: window._gcPortalEd.open(o.b), ov: !!document.getElementById('gcpe') }), { a: S.pid, b: S.other });
  ok(pv.own && pv.noport && !pv.other && !pv.openOther && !pv.ov, 'PM: his jobs\' portals open; another PM\'s job does not', pv);
  ok(!(await P.ev(id => !!document.querySelector('#_gcJobPick .fh-job[data-job="' + id + '"] [data-fa="fp-cust"]'), S.other)), 'PM: no Customer portal button for another PM\'s job');
  await custBtn(P, S.pid);
  const pst = await P.ev(() => { const o = document.getElementById('gcpe'); return o ? { pid: o.getAttribute('data-pid'), addJob: !!o.querySelector('[data-pe="job-add"]'), tasks: o.querySelector('[data-pe-sec="tasks"]').innerText } : null; });
  ok(pst && pst.pid === S.pid && /Pick your tile color/.test(pst.tasks), 'PM: his job\'s portal opens with what the admin added', pst);
  ok(pst && !pst.addJob, 'PM: no ➕ Add a job (admin / office only)');
  await shot(P, '11_pm_portal');
  ok(!P.errs.length, 'no page errors (PM)', P.errs.slice(0, 5));
  await P.close();
} catch (e) { fail++; console.log('  ✗ FAIL exception ' + (e && e.stack || e)); }
finally { for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`PORTALED ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
