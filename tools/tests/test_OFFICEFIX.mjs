// test_OFFICEFIX.mjs <build-dir> <mirror.json> — patch OFFICEFIX: the office (office@ — Brittany) works every button of her
// screens, against the REAL function handlers (tools/tests/officefix_bridge.mjs: in this process, fake Supabase, nothing
// leaves; like Netlify in production a SCHEDULED function cannot be called by its URL → 403).
//   A. Node, the handlers themselves: the office (gc_staff role 'staff', no profile — her people-list role "Office Admin"
//      decides, as in production) passes every office door; an admin unchanged; a PM / the Marketing Manager / a
//      non-staff address refused where they should be; owner-only doors (lead-source admin, running automations) stay
//      admins-only. The staff e-mail rule: an active Marketing Manager at a gmail.com address gets staff e-mail in
//      data-entry mode, a random gmail.com address does not.
//   B. Browser, real data (the read-only mirror, kept outside git): the office signs in, opens her screens (Office,
//      Approvals incl. approve / deny / approve & send, Invoices incl. + enter invoice and its dropdowns, Messages,
//      Customers, Collections, sub paperwork, liens, To-Do, Mail …) and clicks their buttons. PASS when no call to our
//      functions answered 401 / 403 / 500 (or timed out), no page error, no request repeated more than 3 times in a minute,
//      and no long task over MAXTASK ms (default 2000) on Invoices.
//   C. Browser: the owner (admin) on Approvals + Invoices, the same checks.
// Env: PARTS (default "A,B,C"), CPU (Invoices CPU slow-down, default 4), MAXTASK, CLICKS (max buttons per screen, default 40), GC_HARNESS. Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wUPG/harness.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { computer, signIn, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_OFFICEFIX.mjs <build-dir> <mirror.json>'); process.exit(2); }
const B = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'officefix_bridge.mjs')).href);
const PARTS = String(process.env.PARTS || 'A,B,C').split(','), MAXTASK = +(process.env.MAXTASK || 2000), CLICKS = +(process.env.CLICKS || 40);
const OFFICE = 'office@grayco-cs.com', OWNER = 'wjohnson@grayco-cs.com', PM = 'sbiffle@grayco-cs.com', MKT = 'malcolm.mktg.test@gmail.com', RANDOM = 'someone.random.test@gmail.com';
let fails = 0; const ok = (c, m, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); if (!c) fails++; };

const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
function loadCloud(){ cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
loadCloud();
/* the company sign-in rows as production has them (docs/office-full-access.sql: the office is 'staff', no profile, payroll on) */
const STAFF = [
  { email: OFFICE, name: 'Brittany Pucket', role: 'staff', profile: null, active: true, payroll: true },
  { email: OWNER, name: 'Wesley Johnson', role: 'admin', profile: null, active: true, payroll: true },
  { email: PM, name: 'Steven Biffle', role: 'staff', profile: null, active: true },
  { email: MKT, name: 'Malcolm (Marketing Manager)', role: 'staff', profile: 'marketing', active: false, mkt_active: true } ];
const bridge = B.installBridge({ build: BUILD, cloud, accounts: ACCOUNTS, staffRows: STAFF });
const SCH = new Set(bridge.SCHED);
const call = (email, method, name, search, body) => bridge.call({ method, name, search: search || '', headers: email ? { authorization: 'Bearer ntok:' + email } : {}, body: body == null ? null : JSON.stringify(body) });
const jb = r => { try { return JSON.parse(Buffer.isBuffer(r.body) ? r.body.toString() : r.body || '{}'); } catch (e) { return {}; } };
const req = createRequire(path.join(BUILD, 'netlify', 'functions', 'x.js'));

/* ══ A. the handlers ══ */
if (PARTS.includes('A')) {
  console.log('── A. the function handlers, as each person');
  ok(!SCH.has('auto-wins') && !SCH.has('referral'), 'auto-wins.js and referral.js have no schedule (the CRM calls them by URL)', [...SCH].filter(x => /auto-wins|referral/.test(x)));
  ok(SCH.has('auto-wins-scheduled') && SCH.has('referral-scheduled'), 'their schedules are on auto-wins-scheduled / referral-scheduled');
  for (const f of ['auto-wins-scheduled', 'referral-scheduled']) { const m = req('./' + f + '.js'); ok(typeof m.handler === 'function', f + '.js loads and has a handler'); }
  const page = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
  const byUrl = [...new Set((page.match(/\/\.netlify\/functions\/([\w-]+)/g) || []).map(x => x.split('/').pop()).concat((page.match(/\bpost\(\s*'([\w-]+)'/g) || []).map(x => x.replace(/^post\(\s*'|'$/g, ''))))];
  ok(!byUrl.some(n => SCH.has(n) && !/^(gc-backup|field-auto|price-index-monthly)$/.test(n)), 'no office screen calls a scheduled function by its URL (the admin-only gc-backup, field-auto, price-index-monthly aside — owner follow-up)', byUrl.filter(n => SCH.has(n)));

  let r = await call(OFFICE, 'POST', 'auto-wins', '', { action: 'appr-seen' });
  ok(r.status === 200 && jb(r).ok === true, 'office: 📋 Approvals "opened today" stamp → 200 ok', [r.status, jb(r)]);
  r = await call(OFFICE, 'POST', 'auto-wins', '', { action: 'appr-seen-list' });
  ok(r.status === 200 && Array.isArray(jb(r).rows), 'office: who checked Approvals today → 200 + rows', [r.status, (jb(r).rows || []).length]);
  ok((jb(r).rows || []).some(x => x.email === OFFICE && x.checkedToday), 'office: her own stamp shows as checked today');
  r = await call(OFFICE, 'POST', 'auto-wins', '', { part: 'none-such' });
  ok(r.status === 403, 'office: running the automations by hand stays admins-only (403)', r.status);
  r = await call(OFFICE, 'GET', 'referral', '?list=1');
  ok(r.status === 200 && jb(r).ok === true, 'office: 🎁 Referral program list → 200', [r.status, jb(r).error]);
  r = await call(OFFICE, 'GET', 'referral', '?pending=1'); ok(r.status === 200, 'office: referral credits waiting → 200', r.status);
  r = await call(OFFICE, 'GET', 'referral', '?settings=1'); ok(r.status === 200, 'office: referral settings → 200', r.status);
  r = await call(OFFICE, 'POST', 'lien', '', { action: 'list' }); ok(r.status === 200, 'office: lien waivers list → 200', [r.status, jb(r).error]);
  r = await call(OFFICE, 'GET', 'lead-source', '?review=1'); ok(r.status === 403, 'office: lead-source admin (review) stays admins-only (403)', r.status);
  r = await call(OFFICE, 'POST', 'lead-source', '', { action: 'log', entry: { job: 'P-test', action: 'auto', from: '(none)', to: 'company' } });
  ok(r.status === 200, 'office: the CRM\'s own "auto" lead-source log line still goes (200)', [r.status, jb(r).error]);

  const SR = req('./_lib/staff-role.js');
  ok(SR.isOfficeOrAdmin({ ok: true, email: OFFICE, role: 'staff', office: true }) === true, 'staff-role.isOfficeOrAdmin: the office (who.office from the data) → true');
  ok(SR.isOfficeOrAdmin({ ok: true, email: OWNER, role: 'admin' }) === true, 'staff-role.isOfficeOrAdmin: an admin → true');
  ok(SR.isOfficeOrAdmin({ ok: true, email: PM, role: 'staff', office: false }) === false, 'staff-role.isOfficeOrAdmin: a PM → false');
  ok(SR.isOfficeOrAdmin({ ok: true, email: MKT, role: 'staff', profile: 'marketing', office: true }) === false, 'staff-role.isOfficeOrAdmin: the Marketing Manager → false (even if marked office)');
  ok(SR.isOfficeOrAdmin({ ok: true, email: MKT, role: 'office', marketing: true }) === false, 'staff-role.isOfficeOrAdmin: marketing:true → false');
  ok(SR.isOfficeOrAdmin({ ok: false, email: RANDOM, role: 'office' }) === false, 'staff-role.isOfficeOrAdmin: a refused sign-in → false');
  ok(SR.isOfficeOrAdmin({ ok: true, email: OFFICE, role: 'office', active: false }) === false, 'staff-role.isOfficeOrAdmin: inactive → false');
  const OA = req('./_lib/office-access.js');
  ok(await OA.officeOrAdmin({ ok: true, email: OFFICE, role: 'staff' }) === true, 'office-access.officeOrAdmin: office@ from the data (people-list role "Office Admin") → true');
  ok(await OA.officeOrAdmin({ ok: true, email: PM, role: 'staff' }) === false, 'office-access.officeOrAdmin: the PM → false');

  r = await call(OWNER, 'POST', 'auto-wins', '', { action: 'appr-seen-list' }); ok(r.status === 200, 'admin: who checked Approvals today → 200 (unchanged)', r.status);
  r = await call(OWNER, 'POST', 'auto-wins', '', { part: 'none-such' }); ok(r.status === 200 && jb(r).ok, 'admin: run a part by hand → 200 (unchanged)', r.status);
  r = await call(OWNER, 'GET', 'referral', '?list=1'); ok(r.status === 200, 'admin: referral list → 200 (unchanged)', r.status);
  r = await call(OWNER, 'GET', 'lead-source', '?review=1'); ok(r.status === 200, 'admin: lead-source review → 200 (unchanged)', [r.status, jb(r).error]);

  r = await call(PM, 'POST', 'auto-wins', '', { action: 'appr-seen' }); ok(r.status === 200, 'PM: may stamp his own "opened Approvals" (200)', r.status);
  r = await call(PM, 'POST', 'auto-wins', '', { action: 'appr-seen-list' }); ok(r.status === 403, 'PM: who checked Approvals → 403 (office + admins only)', r.status);
  r = await call(PM, 'GET', 'referral', '?list=1'); ok(r.status === 403, 'PM: referral list → 403', r.status);

  r = await call(MKT, 'POST', 'auto-wins', '', { action: 'appr-seen-list' }); ok(r.status === 403, 'Marketing Manager: who checked Approvals → 403', r.status);
  r = await call(MKT, 'POST', 'auto-wins', '', { action: 'appr-seen' }); ok(r.status === 403, 'Marketing Manager: not CRM staff for the Approvals stamp → 403', r.status);
  r = await call(MKT, 'GET', 'referral', '?list=1'); const mm = jb(r);
  ok(r.status === 200 ? (mm.readOnly === true && (mm.members || []).every(m => /^Member \d+$|^a member$/.test(m.name) && !m.code)) : r.status === 403, 'Marketing Manager: referral list is the redacted read-only view (no customer names / codes) or refused', [r.status, (mm.members || []).slice(0, 2)]);
  r = await call(MKT, 'POST', 'lien', '', { action: 'list' }); ok(r.status === 403, 'Marketing Manager: lien waivers → 403', r.status);
  r = await call(MKT, 'GET', 'lead-source', '?review=1'); ok(r.status === 403, 'Marketing Manager: lead-source review → 403', r.status);
  for (const [fn, q, b] of [['auto-wins', '', { action: 'appr-seen' }], ['referral', '?list=1', null], ['lien', '', { action: 'list' }]]) {
    r = await call(RANDOM, b ? 'POST' : 'GET', fn, q, b); ok(r.status === 403, 'not staff (' + RANDOM + '): ' + fn + ' → 403', r.status);
    r = await call(null, b ? 'POST' : 'GET', fn, q, b); ok(r.status === 401, 'no sign-in: ' + fn + ' → 401', r.status);
  }
  r = await call(null, 'POST', 'auto-wins', '', { next_run: '2026-11-01T22:19:00Z' }); ok(r.status === 401, 'auto-wins by URL: a fake scheduler POST { next_run } without sign-in → 401 (runs nothing)', r.status);
  r = await call(OFFICE, 'GET', 'crm-health', '?ping=1'); ok(r.status === 200, 'crm-health ?ping=1 (the GrayCo Systems status) → 200', r.status);
  r = await call(null, 'POST', 'crm-health', '', { next_run: '2026-11-01T15:05:00Z' }); ok(r.status === 401, 'crm-health by URL: a fake scheduler POST without sign-in → 401 (sends nothing)', r.status);
  ok(SCH.has('crm-health-scheduled') && !SCH.has('crm-health') && typeof req('./crm-health-scheduled.js').handler === 'function', 'crm-health: the schedule is on crm-health-scheduled.js');
  r = await call(null, 'POST', 'referral', '', { next_run: '2026-11-01T22:37:00Z' }); ok(r.status === 401, 'referral by URL: a fake scheduler POST { next_run } without sign-in → 401 (no sweep)', r.status);

  /* the staff e-mail rule in data-entry mode (coordinator 11/01: Malcolm, the Marketing Manager, at a personal address) */
  const PAUSE = req('./_lib/pause.js'), SM = req('./_lib/staff-mail.js'), AC = req('./_lib/auto-common.js');
  const prevPause = cloud.get(PAUSE.KEY);
  cloud.set(PAUSE.KEY, { key: PAUSE.KEY, value: { on: true, by: 'test' }, updated_at: new Date().toISOString() }); PAUSE.reset(); SM._reset();
  const send = async to => { const n = bridge.EXT.length; const res = await globalThis.fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: [to], subject: 'test', html: 'x' }) }); return { out: bridge.EXT.length > n, paused: res.headers.get('x-gc-paused') === '1' }; };
  let s1 = await send(MKT); ok(s1.out && !s1.paused, 'data-entry mode: a staff e-mail to the active Marketing Manager at gmail.com goes out', s1);
  s1 = await send(RANDOM); ok(!s1.out && s1.paused, 'data-entry mode: an e-mail to a random gmail.com address is held', s1);
  s1 = await send(OFFICE); ok(s1.out && !s1.paused, 'data-entry mode: @grayco-cs.com staff mail still goes', s1);
  const sbN = bridge.SB.filter(x => /gc_staff/.test(x.p)).length; await send(MKT); await send(MKT);
  ok(bridge.SB.filter(x => /gc_staff/.test(x.p)).length === sbN, 'the gc_staff list is read once and cached (no read per message)');
  process.env.RESEND_API_KEY = 're_test_fake_not_a_key'; delete process.env.PORTAL_MAIL_OFF; SM._reset();
  const n0 = bridge.EXT.length; const sm = await AC.staffMail([MKT, RANDOM], 'Marketing report (test)', '<p>x</p>');
  const sent = bridge.EXT.slice(n0).filter(x => x.host === 'api.resend.com').map(x => x.b).join(' ');
  ok(sm.ok && sent.indexOf(MKT) >= 0 && sent.indexOf(RANDOM) < 0, 'auto-wins staffMail: goes to the Marketing Manager, never to the random gmail.com address', { ok: sm.ok, toMkt: sent.indexOf(MKT) >= 0, toRandom: sent.indexOf(RANDOM) >= 0 });
  ok(AC.staffEmail(MKT) && !AC.staffEmail(RANDOM) && AC.staffEmail(PM), 'auto-common.staffEmail: Marketing Manager yes, random no, @grayco-cs.com yes');
  const MF = req('./_lib/mktfeat.js');
  ok(typeof MF === 'object', 'mktfeat.js loads');
  delete process.env.RESEND_API_KEY; process.env.PORTAL_MAIL_OFF = '1';
  ok(SR.isAdmin({ ok: true, email: MKT, role: 'staff', profile: 'marketing' }) === false && SR.isOfficeOrAdmin({ ok: true, email: MKT, role: 'staff', profile: 'marketing', marketing: true }) === false, 'the Marketing Manager is still neither admin nor office');
  if (prevPause) cloud.set(PAUSE.KEY, prevPause); else cloud.delete(PAUSE.KEY); PAUSE.reset();
}

/* ══ B / C. the browser ══ */
const SKIP = /sign ?out|log ?out|delete|remove|🗑|wipe|erase|restore|reset|backup|fresh start|print|download|export|\bcsv\b|\bpdf\b|void|merge|disable|archive|discard|clear all|uninstall|disconnect|refresh the crm|reload|update now|install|log in as|view as|switch user|take a tour|help|\?$|^✕$|^×$|^x$|close|cancel|google|quickbooks|connect/i;
async function person(email){
  loadCloud();
  const c = await computer(email.split('@')[0], { build: BUILD }); c.acceptConfirm = true; c.prompts = [];
  const row = STAFF.find(x => x.email === email);
  await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access)/.test(u), async r => {
    const u = new URL(r.request().url());
    const J = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/gc_staff')) return J(row ? [row] : []);
    return J({ email, staff: true, admin: row && row.role === 'admin', payroll: !!(row && row.payroll), office: email === OFFICE, sec2: 1 });
  });
  await B.routeFunctions(c, bridge);
  await c.ctx.addInitScript(() => {
    try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
    window.__LT = []; window.__PH = '';
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push({ s: Math.round(e.startTime), d: Math.round(e.duration), ph: window.__PH }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    window.open = function(){ return { closed: false, close(){}, focus(){}, document: { write(){}, close(){}, open(){} }, location: {} }; };   /* no popups */
    try { window.print = function(){}; } catch (e) {}
  });
  await c.page().setViewportSize({ width: 1366, height: 768 });
  c.phase = 'signin';
  await signIn(c, email, 1000);
  await waitFor(c, () => document.querySelectorAll('aside button[draggable="true"]').length > 5 && !!(window._crm && window._crm.projects && window._crm.projects.length), null, 150000, 500);
  await sleep(8000);
  return c;
}
/* CPU (default 4): the Invoices phases run at 1/CPU speed (CDP), like the office's own Windows computer; the rest at full speed */
const CPU = +(process.env.CPU || 4);
const setPhase = async (c, ph) => {
  c.phase = ph; await c.ev(ph => { window.__PH = ph; }, ph).catch(() => {});
  if (CPU > 1) { try { if (!c.cdp) c.cdp = await c.page().context().newCDPSession(c.page()); await c.cdp.send('Emulation.setCPUThrottlingRate', { rate: /invoice/.test(ph) ? CPU : 1 }); } catch (e) {} }
};
/* the clickable things of the screen now: in <main> and in any dialog / overlay on top */
const collect = c => c.ev(() => {
  const vis = e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none' && !e.disabled; };
  const roots = [...document.querySelectorAll('main')].concat([...document.body.children].filter(e => { const st = getComputedStyle(e); return (st.position === 'fixed' || st.position === 'absolute') && +st.zIndex > 100 && e.getBoundingClientRect().height > 100; }));
  const seen = {}, out = [];
  roots.forEach(root => root.querySelectorAll('button, [role=button], select').forEach(el => {
    if (!vis(el) || el.closest('aside')) return;
    const t = (el.tagName === 'SELECT' ? 'SELECT:' + (el.name || el.getAttribute('data-f') || el.id || (el.options[0] && el.options[0].text) || '') : (el.innerText || el.getAttribute('aria-label') || el.title || '')).trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!t) return; const k = t; seen[k] = (seen[k] || 0) + 1; out.push({ t, n: seen[k] - 1 });
  }));
  return out;
});
async function clickOne(c, item){
  const p = c.page();
  const before = await c.ev(() => document.body.children.length).catch(() => 0);
  const hit = await c.ev(({ t, n }) => {
    const vis = e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none' && !e.disabled; };
    const roots = [...document.querySelectorAll('main')].concat([...document.body.children].filter(e => { const st = getComputedStyle(e); return (st.position === 'fixed' || st.position === 'absolute') && +st.zIndex > 100 && e.getBoundingClientRect().height > 100; }));
    let k = 0;
    for (const root of roots) for (const el of root.querySelectorAll('button, [role=button], select')) {
      if (!vis(el) || el.closest('aside')) continue;
      const tt = (el.tagName === 'SELECT' ? 'SELECT:' + (el.name || el.getAttribute('data-f') || el.id || (el.options[0] && el.options[0].text) || '') : (el.innerText || el.getAttribute('aria-label') || el.title || '')).trim().replace(/\s+/g, ' ').slice(0, 60);
      if (tt !== t) continue; if (k++ !== n) continue;
      if (el.tagName === 'SELECT') { const opts = [...el.options].map(o => o.value); const picks = opts.slice(0, 6); for (const v of picks) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } return 'select:' + picks.length; }
      el.scrollIntoView({ block: 'center' }); el.click(); return 'click';
    }
    return null;
  }, item).catch(e => 'err:' + String(e.message).slice(0, 80));
  await sleep(1300);
  /* close what the click opened: Escape, then any new overlay */
  try { await p.keyboard.press('Escape'); } catch (e) {}
  await c.ev(n => { [...document.body.children].slice(n).forEach(e => { const st = getComputedStyle(e); if ((st.position === 'fixed' || st.position === 'absolute') && e.tagName !== 'SCRIPT') e.remove(); }); }, before).catch(() => {});
  return hit;
}
async function screen(c, name, open, opts){
  opts = opts || {};
  await setPhase(c, name);
  await c.ev(open.toString().startsWith('async') || open.toString().startsWith('(') || open.toString().startsWith('function') ? `(${open})()` : open).catch(e => ok(false, name + ': opens', String(e.message).slice(0, 120)));
  await sleep(opts.wait || 5000);
  const items = (await collect(c)).filter(x => !SKIP.test(x.t) && !(opts.skip && opts.skip.test(x.t)));
  const uniq = []; const seenT = {}; for (const x of items) { if (seenT[x.t] && x.n > 0) continue; seenT[x.t] = 1; uniq.push(x); }
  const list = uniq.slice(0, opts.clicks || CLICKS);
  let n = 0;
  for (const it of list) {
    const r = await clickOne(c, it); if (r) n++;
    if (opts.reopen !== false) { await c.ev(`(${open})()`).catch(() => {}); await sleep(900); }
  }
  console.log('     ' + name + ': clicked ' + n + ' of ' + uniq.length + ' (' + list.map(x => x.t).slice(0, 60).join(' | ').slice(0, 900) + ')');
  return { n, total: uniq.length };
}
function judge(c, who, scope){
  const ours = c.calls.filter(x => x.fn);
  const bad = ours.filter(x => x.status === 401 || x.status === 403 || x.status >= 500);
  const distinct = {}; bad.forEach(x => { const k = x.m + ' ' + x.fn + x.q.split('&')[0] + ' → ' + x.status; if (!distinct[k]) distinct[k] = [x.phase, x.b.slice(0, 50), (x.err || '').slice(0, 110)]; });
  ok(bad.length === 0, who + ': no call to our functions answered 401 / 403 / 5xx / timed out (' + ours.length + ' calls)');
  Object.keys(distinct).forEach(k => console.log('       ✗ ' + k + '  ' + JSON.stringify(distinct[k])));
  if (process.env.DUMP) try { fs.writeFileSync(process.env.DUMP + '.' + who + '.json', JSON.stringify(c.calls, null, 1)); } catch (e) {}
  const rep = {}; let worst = null;
  for (const x of ours) { const k = x.m + ' ' + x.fn + x.q + ' ' + x.b; (rep[k] = rep[k] || []).push(x.t); }
  for (const k of Object.keys(rep)) { const ts = rep[k]; for (let i = 0; i + 3 < ts.length; i++) if (ts[i + 3] - ts[i] < 60000) { worst = worst || [k.slice(0, 160), ts.length]; break; } }
  ok(!worst, who + ': no request repeated more than 3 times in a minute', worst);
  const errs = c.errs.filter(e => !/ResizeObserver|Failed to load resource|net::ERR|AbortError|chrome-extension/i.test(e));
  ok(errs.length === 0, who + ': no page errors', errs.slice(0, 6));
}
async function longTasks(c, phase){ return (await c.ev(() => window.__LT).catch(() => [])).filter(x => x.ph === phase); }

if (PARTS.includes('B')) {
  console.log('── B. the office in the browser (real data, real handlers)');
  const c = await person(OFFICE);
  const t0 = Date.now();
  await setPhase(c, 'invoices-open');
  await c.ev(() => window._setView('invoices')); await sleep(12000);
  const lt = await longTasks(c, 'invoices-open'); const mx = lt.reduce((a, x) => Math.max(a, x.d), 0);
  ok(mx <= MAXTASK, 'office: opening 💵 Invoices on the real data — no long task over ' + MAXTASK + ' ms (longest ' + mx + ' ms)', lt.filter(x => x.d > 300));
  await setPhase(c, 'invoices-stay'); await sleep(20000);
  const lt2 = await longTasks(c, 'invoices-stay'); const mx2 = lt2.reduce((a, x) => Math.max(a, x.d), 0);
  ok(mx2 <= MAXTASK, 'office: staying on 💵 Invoices 20 s — no long task over ' + MAXTASK + ' ms (longest ' + mx2 + ' ms)', lt2.filter(x => x.d > 300));

  const sv = v => `function(){ window._setView('${v}'); }`;
  await screen(c, 'office', sv('officemanager'), { wait: 7000 });
  await screen(c, 'approvals', sv('approvals'), { wait: 6000, skip: /^(approve|deny|reject|approve & send|✅|❌)/i });
  /* approve / deny / approve & send on real items, one each */
  for (const want of [/^✅? ?approve$/i, /deny|reject|decline/i, /approve.*send|send.*approve/i]) {
    await setPhase(c, 'approvals-act'); await c.ev(() => window._setView('approvals')); await sleep(2500);
    let items = [];
    for (let i = 0; i < 15 && !items.length; i++) { items = (await collect(c)).filter(x => want.test(x.t.replace(/^[^\w]+/, '').trim())); if (!items.length) await sleep(1000); }
    c.prompts = ['Not this one (test)'];
    if (items.length) { const r = await clickOne(c, items[0]); console.log('     approvals: ' + items[0].t + ' → ' + r); }
    else console.log('     approvals: no button like ' + want);
  }
  await setPhase(c, 'invoices'); await c.ev(() => window._setView('invoices')); await sleep(4000);
  const enter = (await collect(c)).find(x => /enter invoice|new invoice|\+ ?invoice|add invoice|create invoice/i.test(x.t));
  ok(!!enter, 'office: Invoices has its enter / new invoice button', enter && enter.t);
  if (enter) {
    await setPhase(c, 'enter-invoice');
    await c.ev(({ t, n }) => { const el = [...document.querySelectorAll('main button, main [role=button]')].filter(e => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60) === t)[n]; if (el) el.click(); }, enter);
    await sleep(2500);
    const sel = await c.ev(() => [...document.querySelectorAll('select')].filter(s => s.getBoundingClientRect().height > 2).map(s => ({ n: s.options.length, f: s.name || s.getAttribute('data-f') || s.id || '' })));
    ok(sel.length > 0, 'office: the enter-invoice form has its dropdowns', sel);
    await c.ev(() => { for (const s of [...document.querySelectorAll('select')].filter(s => s.getBoundingClientRect().height > 2)) { for (const o of [...s.options].slice(0, 8)) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } } });
    await sleep(2000);
    const lt3 = await longTasks(c, 'enter-invoice'); const mx3 = lt3.reduce((a, x) => Math.max(a, x.d), 0);
    ok(mx3 <= MAXTASK, 'office: the enter-invoice form and its dropdowns — no long task over ' + MAXTASK + ' ms (longest ' + mx3 + ')', lt3.filter(x => x.d > 300));
    try { await c.page().keyboard.press('Escape'); } catch (e) {}
  }
  await screen(c, 'invoices', sv('invoices'), { wait: 5000 });
  const ltI = (await longTasks(c, 'invoices')); const mxI = ltI.reduce((a, x) => Math.max(a, x.d), 0);
  ok(mxI <= MAXTASK, 'office: clicking through 💵 Invoices — no long task over ' + MAXTASK + ' ms (longest ' + mxI + ')', ltI.filter(x => x.d > 500));
  await screen(c, 'messages', sv('messages'));
  await screen(c, 'customers', sv('customers'));
  await screen(c, 'todo', sv('todo'));
  await screen(c, 'collections', 'function(){ window._gcOpenCollectionsDesk(); }', { reopen: true });
  await screen(c, 'sub-paperwork', 'function(){ window._gcOpenSubCompliance(); }', { reopen: true });
  await screen(c, 'payments', sv('payments'));
  await screen(c, 'gmail', sv('gmail'));
  await screen(c, 'subs', sv('subs'));
  await screen(c, 'dashboard', sv('dashboard'));
  /* the rest of her menu: open each, no clicks (every screen's own calls) */
  const ids = await c.ev(() => { function fk(b){ for (const k in b) if (k.indexOf('__reactFiber') === 0) { const f = b[k]; return f && f.key != null ? String(f.key) : null; } return null; } const a = document.querySelector('aside'); return a ? [...a.querySelectorAll('button[draggable="true"]')].map(fk).filter(Boolean) : []; });
  for (const id of ids) { await setPhase(c, 'menu:' + id); await c.ev(id => { try { window._setView(id); } catch (e) {} }, id).catch(() => {}); await sleep(3500); }
  console.log('     menu walked: ' + ids.join(' '));
  await setPhase(c, 'idle'); await sleep(65000);   /* a minute on the last screen: no polling storm */
  judge(c, 'office', 'all');
  const aw = c.calls.filter(x => x.fn === 'auto-wins');
  ok(aw.length >= 1 && aw.every(x => x.status === 200), 'office: the Approvals stamp / "who checked today" reached auto-wins and answered 200', aw.map(x => [x.b.slice(0, 40), x.status]));
  ok(c.calls.filter(x => x.fn === 'auto-wins' && /appr-seen"/.test(x.b)).length <= 3, 'office: the Approvals stamp was posted at most 3 times in the whole session', c.calls.filter(x => x.fn === 'auto-wins' && /appr-seen"/.test(x.b)).length);
  const sum = {}; c.calls.forEach(x => { const k = x.m + ' ' + x.fn + ' → ' + x.status; sum[k] = (sum[k] || 0) + 1; });
  console.log('     office calls: ' + JSON.stringify(sum));
  console.log('     office session ' + Math.round((Date.now() - t0) / 1000) + ' s');
  await c.b.close();
}

if (PARTS.includes('C')) {
  console.log('── C. the owner (admin) — unchanged');
  const c = await person(OWNER);
  await screen(c, 'approvals', `function(){ window._setView('approvals'); }`, { wait: 6000, clicks: 15, skip: /^(approve|deny|reject|approve & send|✅|❌)/i });
  await setPhase(c, 'invoices'); await c.ev(() => window._setView('invoices')); await sleep(12000);
  const lt = await longTasks(c, 'invoices'); const mx = lt.reduce((a, x) => Math.max(a, x.d), 0);
  ok(mx <= MAXTASK, 'owner: 💵 Invoices on the real data — no long task over ' + MAXTASK + ' ms (longest ' + mx + ')', lt.filter(x => x.d > 300));
  await setPhase(c, 'office'); await c.ev(() => window._setView('officemanager')); await sleep(6000);
  judge(c, 'owner', 'all');
  ok(c.calls.some(x => x.fn === 'auto-wins' && x.status === 200), 'owner: the Approvals stamp reaches auto-wins (200)');
  await c.b.close();
}
console.log(fails ? 'OFFICEFIX: FAIL (' + fails + ')' : 'OFFICEFIX: PASS');
process.exit(fails ? 1 : 0);
