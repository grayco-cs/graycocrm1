// test_SCHEDPICK.mjs <build-dir> — patch SCHEDPICK: template suggestions are not the schedule; templates are chosen,
// never applied by themselves (owner 11/01, ROTC Cordova PO T724).
//   Data: the real-data mirror (GC_MIRROR, default the session scratchpad's loop/mirror.json — ROTC Cordova with its
//   16 Automations template rows, the Auto Start / Finish and the person-made Project Start / End Date) and, when
//   present, a read-only copy of the live "schedule" row (GC_PROD_SCHED, default /dev/shm/schedpick/sched_raw.json —
//   fetched by hand with the public anon key, never committed). Offline harness (GC_HARNESS), fake cloud.
//   Server: _lib/schedvis, the customer portal (portalSteps), the GC portal (gcp.scheduleOf), the sub portal reader
//   (portal-access kvRead → schedFor), the phone calendar feed. Browser: the CRM's screens, the 📋 Templates bar,
//   review → Add selected / Dismiss all, 🗓 Start from a template (drafts only, fitted, no Demo after the end),
//   the template chain audit, the duplicate bookend hidden, no automatic application, the one-time keep / remove,
//   the PM checklist offer, no page errors. A screenshot of the Suggested panel goes to GC_SHOT.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const PROD = process.env.GC_PROD_SCHED || '/dev/shm/schedpick/sched_raw.json';
const SHOT = process.env.GC_SHOT || '';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cget, cset, cloud } = await import(pathToFileURL(HARNESS).href);
const req = createRequire(import.meta.url);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_SCHEDPICK.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const FN = new URL('../../netlify/functions', import.meta.url).pathname;
const JOB = 'PRJ0sx249j6n8v', OWNER_EMAIL = 'wjohnson@grayco-cs.com';
const parse = v => { if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return v; };
const cloudArr = k => { const v = parse(cget(k)); return Array.isArray(v) ? v : []; };

/* ── the data ── */
resetCloud();
const M = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
for (const r of M) if (r && r.key && !/^_probe/.test(r.key)) cset(r.key, r.v !== undefined ? r.v : r.value);
const S0 = cloudArr('schedule'), P0 = cloudArr('projects');
const rotc = P0.find(p => p && p.id === JOB);
const drafts0 = S0.filter(r => r && r.pid === JOB && r.draft === true);
console.log('mirror: schedule ' + S0.length + ', projects ' + P0.length + ', ROTC drafts ' + drafts0.length);
ok(!!rotc && drafts0.length === 16 && drafts0.every(r => r.by === 'Automations' && r.tpl === 'large_com' && /^SCH_T_PRJ0sx249j6n8v_/.test(r.id)), 'fixture: ROTC Cordova with the 16 Automations "large_com" drafts (the live shape)', drafts0.length);
/* a draft dated TODAY on ROTC (and a person-made row), so the "today" readers would show it if they did not filter */
const T0 = new Date(), td = T0.getFullYear() + '-' + String(T0.getMonth() + 1).padStart(2, '0') + '-' + String(T0.getDate()).padStart(2, '0');
cset('schedule', S0.concat([{ id: 'SCH_T_PRJ0sx249j6n8v_zz_today_probe', pid: JOB, title: 'ROTC Cordova — ZZ draft today probe', date: td, endDate: td, time: '08:00', endTime: '17:00', type: 'work', vendor: 'Framing', tpl: 'large_com', tplTask: 'zz_today_probe', draft: true, by: 'Automations', portal: true, customerVisible: true }]));

/* ── the server ── */
const SV = req(FN + '/_lib/schedvis.js');
const vis = SV.visible(cloudArr('schedule'));
const rv = vis.filter(r => r && r.pid === JOB);
ok(!vis.some(r => SV.isDraft(r)), 'server rule: no suggestion is left in the visible schedule (' + (cloudArr('schedule').length - vis.length) + ' hidden of ' + cloudArr('schedule').length + ')');
ok(rv.map(r => r.title).sort().join(' | ') === 'ROTC Cordova — End Date | ROTC Cordova — Project Start', 'ROTC Cordova: only the person-made Project Start and End Date are on the schedule (the Auto Start / Finish duplicates are hidden)', rv.map(r => r.title));
ok(cloudArr('schedule').filter(r => r && r.pid === JOB && r._autoBookend).length === 2, 'the hidden Auto Start / Finish are kept in the data (hidden, not deleted)');
if (fs.existsSync(PROD)) {
  const pr = JSON.parse(fs.readFileSync(PROD, 'utf8')), live = parse((pr.find(x => x.key === 'schedule') || {}).value) || [];
  const lv = SV.visible(live), ld = live.filter(SV.isDraft);
  ok(live.length > 0 && !lv.some(SV.isDraft) && lv.length === live.length - ld.length - live.filter(r => r && r._autoBookend && SV.hiddenBookend(r, SV.personIndex(live))).length, 'the live schedule row (' + live.length + ' items, ' + ld.length + ' suggestions): none of the suggestions is visible');
  const lr = lv.filter(r => r && r.pid === JOB).map(r => r.title);
  ok(lr.indexOf('Start — ROTC Cordova') < 0 && lr.indexOf('ROTC Cordova — Project Start') >= 0, 'live: the Auto "Start — ROTC Cordova" is hidden behind the person-made Project Start on Nov 9', lr);
}
/* gc_kv served to the functions from the fake cloud */
process.env.SUPABASE_URL = 'https://fake.supabase.local'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test_only';
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u.indexOf('fake.supabase.local/rest/v1/gc_kv') < 0) return realFetch(u, o);
  const q = new URL(u), key = q.searchParams.get('key') || '';
  let keys = []; if (/^eq\./.test(key)) keys = [decodeURIComponent(key.slice(3))]; else if (/^in\.\(/.test(key)) keys = key.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''));
  const rows = keys.filter(k => cloud.has(k)).map(k => ({ key: k, value: cget(k), updated_at: cloud.get(k).updated_at }));
  return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const PORTAL = req(FN + '/portal.js'), GCP = req(FN + '/_lib/gcp.js'), PA = req(FN + '/portal-access.js'), CAL = req(FN + '/calendar-feed.js');
const before = (rotc.schedPlan.steps || []).filter(x => x && x.portal === true && x.name);
ok(before.length === 14, 'BEFORE the patch the customer portal served ' + before.length + ' plan steps for ROTC Cordova (p.schedPlan from the drafts: Pre-construction meeting … Closeout documents)', before.length);
const stepsNow = PORTAL._sched.portalSteps(rotc, cloudArr('schedule'));
ok(stepsNow.length === 0, 'customer portal: the ROTC plan steps are not shown (none is on the real schedule)', stepsNow);
const kv = await PORTAL._core.kvRead(['schedule']);
ok(Array.isArray(kv.schedule) && !kv.schedule.some(SV.isDraft) && kv.schedule.length === vis.length, 'the functions read the schedule without suggestions (portal kvRead → sub texts, plan, field, weekly update, GC portal)');
const gcs = await GCP.scheduleOf(JOB);
ok(gcs.map(x => x.title).sort().join(' | ') === 'ROTC Cordova — End Date | ROTC Cordova — Project Start', 'GC portal schedule for ROTC: Project Start + End Date only', gcs);
const subRows = PA._sched.schedFor({ schedule: (await PORTAL._core.kvRead(['schedule'])).schedule }, [rotc], { id: 'SUBx', name: 'Framing', company: 'Framing' });
ok(!subRows.some(x => /draft today probe|Framing$/.test(s(x.title))), 'sub portal: the Framing draft never reaches a "Framing" sub', subRows.map(x => x.title));
function s(v){ return v == null ? '' : String(v); }
const ics = await CAL.handler({ queryStringParameters: { t: CAL._feedSig('') }, headers: {} });
ok(ics.statusCode === 200 && /BEGIN:VCALENDAR/.test(ics.body) && !/Pre-construction meeting|draft today probe|Start — ROTC Cordova/.test(ics.body) && /ROTC Cordova — Project Start/.test(ics.body), 'phone calendar feed: no suggestion, no hidden duplicate bookend', ics.statusCode);
globalThis.fetch = realFetch;
if (process.env.GC_SERVER_ONLY) { console.log('\nSCHEDPICK (server only): ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

/* ── the browser ── */
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
const c = await computer('SP', { build }); const p = c.page();
const rawSched = () => c.ev(() => (window._crm && window._crm.schedule) || []);
try {
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(OWNER_EMAIL); await p.locator('#gc-auth-password').fill(ACCOUNTS[OWNER_EMAIL].pw); await sleep(300); const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 100 && (window._crm.schedule || []).length > 20 && window._gcSchedPick && window._gcTplOffer && typeof window._setSchedule === 'function', null, 180000, 500); await sleep(8000);
  const me = await c.ev(() => window._gcAut.util.me());
  /* 1. the data is kept; the screens get the visible list */
  const st = await c.ev(id => { const raw = window._crm.schedule, v = window._gcSchedVisible(raw); return { raw: raw.filter(r => r && r.pid === id).length, rawDrafts: raw.filter(r => r && r.pid === id && window._gcSchedDraft(r)).length, vis: v.filter(r => r && r.pid === id).map(r => r.title), same: window._gcSchedVisible(raw) === v }; }, JOB);
  ok(st.rawDrafts === 17 && st.raw === 21, 'the CRM keeps every row (17 suggestions incl. the today probe, 2 hidden bookends) — nothing deleted', st);
  ok(st.vis.sort().join(' | ') === 'ROTC Cordova — End Date | ROTC Cordova — Project Start' && st.same, 'the CRM screens get only Project Start + End Date for ROTC (cached list)', st.vis);
  /* 2. the Schedule screen, the dashboard, the calendar */
  const DRAFT_RE = 'Pre-construction meeting|Long-lead procurement|Weekly OAC|Pay applications|Rough inspections|Retainage release|ZZ draft today probe|Start — ROTC Cordova|Finish — ROTC Cordova';
  const screenText = async view => { await c.ev(v => window._setView(v), view); await sleep(2500); return c.ev(() => (document.querySelector('main') || document.body).innerText); };
  const sched = await screenText('schedule');
  ok(/ROTC Cordova/.test(sched) && !new RegExp(DRAFT_RE).test(sched), 'Schedule list: ROTC Cordova is there, no suggestion and no duplicate Start / Finish', (sched.match(new RegExp('.{0,60}(' + DRAFT_RE + ').{0,20}')) || [])[0]);
  const calBtns = await c.ev(() => [...document.querySelectorAll('main button')].filter(b => !b.hasAttribute('data-tax-a')).map(b => b.textContent.trim())   /* the schedule's own views (not 🧾 Taxes' "Calendar ›") */.filter(t => /month|week|calendar|day/i.test(t)).slice(0, 12));
  let calOk = true, calSeen = [];
  for (const label of calBtns) {
    await c.ev(l => { const b = [...document.querySelectorAll('main button')].find(x => x.textContent.trim() === l && !x.hasAttribute('data-tax-a')); if (b) b.click(); }, label); await sleep(1200);
    const tx = await c.ev(() => (document.querySelector('main') || document.body).innerText); calSeen.push(label);
    if (new RegExp(DRAFT_RE).test(tx)) { calOk = false; calSeen.push('LEAK: ' + (tx.match(new RegExp('.{0,40}(' + DRAFT_RE + ')')) || [])[0]); }
  }
  ok(calOk, 'calendar views (' + calBtns.join(', ') + '): no suggestion, no duplicate bookend', calSeen);
  const dash = await screenText('dashboard');
  ok(!new RegExp(DRAFT_RE).test(dash), 'dashboard: no suggestion (incl. the one dated today)', (dash.match(new RegExp('.{0,60}(' + DRAFT_RE + ')')) || [])[0]);
  /* every reader that shows or notifies goes through the rule (Field today, Office TV, digest, conflicts, ics, print …) */
  const html = fs.readFileSync(build + '/index.html', 'utf8');
  const wrapped = ['function jobsToday(){\n  var t = today(), sched = arr(window._gcSchedVisible(crm().schedule))', "arr(window._gcSchedVisible(crm().schedule)).forEach(function(x){ var d = s(x.date).slice(0, 10), p = s(x.pid); if (p && d >= t0",
    'var sched=window._gcSchedVisible(crm().schedule||[]); var mn=myName();', "var sched=window._gcSchedVisible((window._crm&&window._crm.schedule)||[]).filter(function(e){return e&&e.date;});",
    'function conflicts(){\n  var t = today(), out = [], by = {}, R = realSubs();\n  arr(window._gcSchedVisible(crm().schedule))', 'function schedToday(p){\n  var t = today();\n  return arr(window._gcSchedVisible(C().schedule))'];
  ok(wrapped.every(w => html.indexOf(w) >= 0), 'Field "today", Office TV week, smart digest, iPhone .ics, sub-conflict toasts, field job "today" read the visible schedule', wrapped.filter(w => html.indexOf(w) < 0).map(w => w.slice(0, 60)));
  const tv = await c.ev(() => { const raw = window._crm.schedule; return window._gcSchedVisible(raw).some(r => /ZZ draft today probe/.test(r.title)); });
  ok(!tv, 'the draft dated today is not in what the today / TV readers see');

  /* 3. the job: 📋 Suggested schedule (16) — review */
  await c.ev(id => window._navToJob(id), JOB); await sleep(3000);
  const bar = await waitFor(c, id => { const b = document.querySelector('.gcsp-bar[data-pid="' + id + '"]'); return b && /Suggested schedule/.test(b.textContent) ? b.textContent : null; }, JOB, 30000, 500);
  ok(bar && /📋 Suggested schedule \(17\) — review/.test(bar) && /🗓 Start from a template/.test(bar), 'the job shows "📋 Suggested schedule (N) — review" and "🗓 Start from a template"', bar);
  /* drop the today probe so the panel shows the real 16 */
  await c.ev(() => window._gcSchedPick.dismiss('PRJ0sx249j6n8v', ['SCH_T_PRJ0sx249j6n8v_zz_today_probe']));
  const bar16 = await waitFor(c, id => { window._gcSchedPick.paint(); const b = document.querySelector('.gcsp-bar[data-pid="' + id + '"]'); return b && /Suggested schedule \(16\)/.test(b.textContent) ? b.textContent : null; }, JOB, 20000, 500);
  ok(!!bar16, '"📋 Suggested schedule (16) — review" on ROTC Cordova', bar16);
  await p.locator('.gcsp-bar [data-sp="review"]').click(); await sleep(800);
  const rv1 = await c.ev(() => { const o = document.getElementById('gcsp-ov'); if (!o) return null; const trs = [...o.querySelectorAll('tr[data-id]')];
    return { title: o.querySelector('h2').textContent, n: trs.length, rows: trs.map(tr => ({ id: tr.getAttribute('data-id'), name: tr.querySelector('b').textContent, on: tr.querySelector('[data-k=on]').checked, cv: tr.querySelector('[data-k=cv]').checked, warn: tr.querySelector('[data-k=warn]').textContent, internal: /internal/.test(tr.textContent) })),
      btns: [...o.querySelectorAll('.sp-ft button')].map(b => b.textContent) }; });
  ok(rv1 && rv1.n === 16 && /Suggested schedule — ROTC Cordova \(16\)/.test(rv1.title), 'the review lists the 16 suggestions', rv1 && rv1.title);
  ok(rv1 && rv1.btns.some(b => /^Add selected/.test(b)) && rv1.btns.indexOf('Dismiss all') >= 0, 'buttons: Add selected, Dismiss all', rv1 && rv1.btns);
  ok(rv1 && rv1.rows.every(r => !r.on), 'nothing is ticked until a person chooses');
  ok(rv1 && rv1.rows.filter(r => r.internal).every(r => !r.cv) && rv1.rows.filter(r => r.internal).length === 2, 'customer-visible is OFF for the internal ones (pay applications, retainage release)', rv1 && rv1.rows.filter(r => r.internal));
  ok(rv1 && /after the job’s end date/.test((rv1.rows.find(r => r.name === 'Demo') || {}).warn), 'Demo (Nov 29, after the Nov 20 end) is flagged in the review', rv1 && rv1.rows.find(r => r.name === 'Demo'));
  await sleep(500);
  if (SHOT) { await p.screenshot({ path: SHOT, fullPage: false }); console.log('  screenshot: ' + SHOT); }

  /* 4. Add selected: three tasks, dates set inside the job */
  const pick = { 'Pre-construction meeting': ['2026-11-09', '2026-11-09'], 'Permit': ['2026-11-10', '2026-11-12'], 'Demo': ['2026-11-13', '2026-11-16'] };
  await c.ev(pk => { const o = document.getElementById('gcsp-ov'); [...o.querySelectorAll('tr[data-id]')].forEach(tr => { const n = tr.querySelector('b').textContent; if (pk[n]) { tr.querySelector('[data-k=on]').checked = true; tr.querySelector('[data-k=date]').value = pk[n][0]; tr.querySelector('[data-k=endDate]').value = pk[n][1]; } }); o.querySelector('.sp-bd').dispatchEvent(new Event('change', { bubbles: true })); }, pick);
  const warnDemo = await c.ev(() => [...document.querySelectorAll('#gcsp-ov tr[data-id]')].find(tr => tr.querySelector('b').textContent === 'Demo').querySelector('[data-k=warn]').textContent);
  ok(warnDemo === '', 'the warning clears once Demo is inside the job dates', warnDemo);
  await c.ev(() => [...document.querySelectorAll('#gcsp-ov .sp-ft button')].find(b => /^Add selected/.test(b.textContent)).click());
  const acc = await waitFor(c, id => { const l = (window._crm.schedule || []).filter(r => r && r.pid === id && r.acceptedBy); return l.length === 3 ? l.map(r => ({ t: r.tplName, d: r.date, e: r.endDate, by: r.by, ab: r.acceptedBy, draft: r.draft, cv: r.customerVisible, notes: r.notes })) : null; }, JOB, 30000, 500);
  ok(acc && acc.every(r => r.draft === false && r.by === me && r.ab === me && /added by /.test(r.notes)), 'Add selected: the 3 are on the schedule — draft cleared, by / accepted by ' + me + ', "added by" in the notes', acc);
  ok(acc && acc.find(r => r.t === 'Demo').d === '2026-11-13' && acc.find(r => r.t === 'Demo').e === '2026-11-16', 'Demo keeps the dates the person set (Nov 13–16)', acc && acc.find(r => r.t === 'Demo'));
  await sleep(4000);
  const after1 = await c.ev(id => { const v = window._gcSchedVisible(window._crm.schedule).filter(r => r && r.pid === id); return { vis: v.map(r => r.tplName || r.title).sort(), drafts: window._gcSchedPick.drafts(id).length, demo: v.find(r => r.tplName === 'Demo') }; }, JOB);
  ok(after1.drafts === 13 && after1.vis.length === 5, 'the schedule now has the 3 added tasks; 13 stay suggestions', after1);
  ok(after1.demo && after1.demo.date === '2026-11-13', 'no automatic follow-up move undid the person\'s dates', after1.demo && after1.demo.date);
  const sched2 = await screenText('schedule');
  ok(/Pre-construction meeting/.test(sched2) && !/Long-lead procurement|Weekly OAC|Retainage release/.test(sched2), 'Schedule list: the added task shows, the suggestions still do not');
  /* 5. Dismiss all */
  await c.ev(id => window._navToJob(id), JOB); await sleep(2000);
  await c.ev(() => { window.confirm = () => true; }); await c.ev(id => window._gcSchedPick.open(id), JOB); await sleep(600);
  await c.ev(() => [...document.querySelectorAll('#gcsp-ov .sp-ft button')].find(b => b.textContent === 'Dismiss all').click());
  const dis = await waitFor(c, id => { const raw = window._crm.schedule.filter(r => r && r.pid === id); return raw.some(r => window._gcSchedDraft(r)) ? null : raw.map(r => r.title); }, JOB, 30000, 500);
  ok(dis && dis.length === 7, 'Dismiss all: the 13 suggestions are gone; the 3 added + Project Start + End Date + the 2 hidden bookends stay', dis);
  /* 6. the customer portal follows: only the added, customer-visible steps */
  let cs = []; for (let i = 0; i < 40; i++) { await sleep(500); const q = cloudArr('projects').find(x => x && x.id === JOB); cs = PORTAL._sched.portalSteps(q || {}, cloudArr('schedule')); if (cs.length === 3) break; }
  ok(cs.map(x => x.name).join(', ') === 'Pre-construction meeting, Permit, Demo', 'customer portal: exactly the 3 added steps (no suggestion)', cs);

  /* 7. 🗓 Start from a template → suggestions only, fitted, Demo before the end */
  await c.ev(id => window._gcSchedPick.pick(id), JOB); await sleep(600);
  const pk = await c.ev(() => { const o = document.getElementById('gcsp-ov'); return { opts: [...o.querySelectorAll('input[name=gcsp-tpl]')].map(i => ({ v: i.value, on: i.checked })), fit: !!(o.querySelector('[data-k=fit]') || {}).checked }; });
  ok(pk.opts.length >= 8 && (pk.opts.find(x => x.on) || {}).v === 'large_com' && pk.fit, 'the picker: every template, the job type\'s one (Large commercial) marked, "fit to the job dates" on', pk);
  const nRaw0 = (await rawSched()).length;
  await c.ev(() => { const o = document.getElementById('gcsp-ov'); o.querySelector('[data-k=start]').value = '2026-11-09'; [...o.querySelectorAll('.sp-ft button')].find(b => /Show the suggested/.test(b.textContent)).click(); }); await sleep(1500);
  const made = await waitFor(c, id => { const l = (window._crm.schedule || []).filter(r => r && r.pid === id && window._gcSchedDraft(r)); return l.length >= 16 ? l : null; }, JOB, 30000, 500);
  ok(made && made.length === 16, 'a template from the picker makes 16 rows', made && made.length);
  ok(made && made.every(r => r.draft === true), 'every picked-template row is draft:true');
  const leak = await c.ev(id => window._gcSchedVisible(window._crm.schedule).filter(r => r && r.pid === id && r.draft === true).length, JOB);
  ok(leak === 0, 'none of them is on the schedule');
  const demo = made && made.find(r => r.tplTask === 'demo'), fin = '2026-11-20';
  ok(demo && demo.date <= fin && demo.endDate <= fin && demo.date >= '2026-11-09', 'fitted: Demo ' + (demo && demo.date) + '–' + (demo && demo.endDate) + ' is inside Nov 9 – Nov 20 (no Demo after Finish)', demo && [demo.date, demo.endDate]);
  ok(demo && demo.dep.join() === 'pre_construction_meeting,permit', 'Demo waits on the pre-construction meeting and the permit (not pay applications)', demo && demo.dep);
  ok(made && made.filter(r => !r.reminder).every(r => r.endDate <= fin), 'no work task ends after the job\'s end date', made && made.filter(r => !r.reminder && r.endDate > fin).map(r => r.tplTask));
  const rvw = await c.ev(() => !!document.querySelector('#gcsp-ov[data-gcsp=review]'));
  ok(rvw, 'the picker opens the same review list');
  await c.ev(id => window._gcSchedPick.dismiss(id), JOB); await sleep(1500);
  await c.ev(() => window._gcSchedPick.close());

  /* 8. the template audit: nothing waits on a recurring / reminder task; work keeps its order */
  const aud = await c.ev(() => { const all = window._gcSchedTemplates.all(), out = [];
    Object.keys(all).forEach(k => { const t = all[k], by = {}; t.tasks.forEach(x => { by[x.id] = x; });
      t.tasks.forEach(x => { (x.dep || []).forEach(d => { const y = by[d]; if (!y) out.push(k + ':' + x.id + ' → missing ' + d); else if (y.reminder || y.recurring) out.push(k + ':' + x.id + ' → ' + d + ' (reminder)'); }); }); });
    return { n: Object.keys(all).length, bad: out }; });
  ok(aud.n >= 8 && aud.bad.length === 0, 'audit of ' + aud.n + ' templates: no task waits on a recurring / reminder task (pay apps, OAC, retainage, invoices, depreciation)', aud.bad);
  const aud2 = await c.ev(id => { const all = window._gcSchedTemplates.all(), out = [];
    Object.keys(all).forEach(k => { const rows = window._gcTplOffer.preview(id, k, '2026-11-20', '2026-11-09') || []; rows.forEach(r => { if (!r.reminder && r.endDate > '2026-11-20') out.push(k + ':' + r.tplTask + ' ends ' + r.endDate); });
      const un = window._gcTplOffer.preview(id, k, false, '2026-11-09') || [], at = {}; un.forEach(r => { at[r.tplTask] = r; }); un.forEach(r => (r.dep || []).forEach(d => { if (at[d] && r.date < at[d].date) out.push(k + ':' + r.tplTask + ' starts before ' + d); })); });
    return out; }, JOB);
  ok(aud2.length === 0, 'audit: fitted to a job\'s dates no work task of any template ends after Finish; unfitted, no task starts before what it waits on', aud2);

  /* 9. nothing applied by itself */
  const auto = await c.ev(() => { const p = (window._crm.projects || []).find(x => x && !/lost|dead|cancel|complete|closed/i.test(String(x.status)) && x.id !== 'PRJ0sx249j6n8v' && !(x.schedPlan) && /commercial|construction|roof|reno/i.test(String(x.type))); if (!p) return null;
    const n0 = window._crm.schedule.filter(r => r && r.pid === p.id).length; const r1 = window._gcSchedTemplates.apply(p.id); window._gcAut3.runStage('signed', p.id); return { id: p.id, type: p.type, r1: r1, n0: n0, perm: (p.permits || []).length, draws: p.drawSchedule || '' }; });
  await sleep(6000);
  const auto2 = auto && await c.ev(a => { const p = window._gcAut.proj(a.id); return { n: window._crm.schedule.filter(r => r && r.pid === a.id).length, tpl: window._crm.schedule.filter(r => r && r.pid === a.id && r.tpl).length, perm: (p.permits || []).length, draws: p.drawSchedule || '', contract: !!(p.autoDocs || {}).contract }; }, auto);
  ok(auto && auto.r1 === null && auto2.tpl === 0 && auto2.perm === auto.perm && auto2.draws === auto.draws && !auto2.contract, 'kickoff ("signed") on ' + (auto && auto.type) + ' job: no template rows, no permit rows, no draw schedule, no contract — all only offered', [auto, auto2]);
  const off = auto && await c.ev(id => window._gcTplOffer.offers(id), auto.id);
  ok(off && off.template && (off.permits.permits.length + off.permits.inspections.length) > 0, 'the job offers its template (' + (off && off.template && off.template.name) + ') and the permit checklist instead', off && { t: off.template, p: off.permits });

  /* 10. one-time "added automatically — keep / remove" on ROTC (2 permit rows, the kickoff contract) */
  await c.ev(id => window._navToJob(id), JOB); await sleep(1500);
  const al = await c.ev(id => window._gcTplOffer.autoAdded(id), JOB);
  ok(al.length === 3 && al.filter(x => x.kind === 'Permit').length === 2 && al.some(x => x.key === 'doc:contract'), 'ROTC: 3 things the automations added by themselves are listed for review (2 permits, the contract draft)', al);
  const barA = await waitFor(c, id => { window._gcSchedPick.paint(); const b = document.querySelector('.gcsp-bar[data-pid="' + id + '"]'); return b && /Added automatically \(3\)/.test(b.textContent) ? b.textContent : null; }, JOB, 20000, 700);
  ok(!!barA, 'the job bar shows "🧾 Added automatically (3) — keep / remove"', barA);
  await c.ev(id => window._gcSchedPick.auto(id), JOB); await sleep(800);
  await c.ev(() => { const o = document.getElementById('gcsp-ov'); const cb = [...o.querySelectorAll('[data-key]')].find(x => /fire_marshal/.test(x.getAttribute('data-key'))); cb.checked = true; [...o.querySelectorAll('.sp-ft button')].find(b => /Remove the ticked/.test(b.textContent)).click(); });
  const rvd = await waitFor(c, id => { const p = window._gcAut.proj(id); return p && p.autoReview && p.autoReview.done ? { perm: (p.permits || []).map(x => x.type), rev: p.autoReview } : null; }, JOB, 20000, 500);
  ok(rvd && rvd.perm.join() === 'Building permit' && rvd.rev.removed.length === 1 && rvd.rev.kept.length === 2, 'remove the ticked one (Fire marshal review), keep the rest; recorded once', rvd);
  const al2 = await c.ev(id => window._gcTplOffer.autoAdded(id), JOB);
  ok(al2.length === 0, 'asked once: nothing is listed again');

  /* 11. PM Field Controls: the job-type checklist is offered */
  const pm = await c.ev(async () => { const p = (window._crm.projects || []).find(x => x && x.id !== 'PRJ0sx249j6n8v' && /active|approved/i.test(String(x.status))); await window.idbSet('gcPMScope', {}); await window.gcPMScope.open(p.id); await new Promise(r => setTimeout(r, 400));
    const box = document.getElementById('gc-pm-box'), n0 = box.querySelectorAll('.gc-pm-item').length, offer = !!box.querySelector('[data-gcsp-pm-apply]');
    if (offer) box.querySelector('[data-gcsp-pm-apply]').click(); await new Promise(r => setTimeout(r, 600));
    const n1 = document.getElementById('gc-pm-box').querySelectorAll('.gc-pm-item').length; window.gcPMScope.close(); return { n0, offer, n1 }; });
  ok(pm.offer && pm.n1 > pm.n0, 'PM Field Controls: the job-type checklist is offered (Apply the checklist) and only added when clicked', pm);

  const errs = c.errs.filter(e => /PAGEERROR/.test(e));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL exception ' + (e && e.stack || e)); }
await shared.close().catch(() => {});
console.log('\nSCHEDPICK: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
