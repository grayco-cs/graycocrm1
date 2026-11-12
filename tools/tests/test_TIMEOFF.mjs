// test_TIMEOFF.mjs <build-dir> — patch TIMEOFF in a real (headless) browser, offline harness, MADE-UP people only.
//  1. a crew member on a phone: GrayCo Field home shows "📅 My schedule" + 🏖 / 🤒 / ⏰ / 📅; asks for a day off.
//  2. the admin on a computer: the request is on ✅ Approvals ("🏖 Time off: Zedd Demo …"), Review → ✅ Approve with a note;
//     the Schedule screen's "Who's out" board shows "🏖 Off · Zedd" that day; scheduling Zedd that day shows a warning.
//  3. the phone gets "✅ Time off approved"; Zedd calls in sick today.
//  4. his manager (Sample PM) gets the in-app notice "🤒 Zedd Demo called in sick today" and the To-Do "Cover Zedd Demo’s jobs today: …".
//  5. the admin's 🕐 Timesheets lists the sick day as its own row (Unpaid — no paid leave on the record).
// Screenshots: SHOTS (default the scratchpad's timeoff_shots/).
import fs from 'fs';
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_TIMEOFF.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/timeoff_shots/';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const pad = n => String(n).padStart(2, '0'), ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = ymd(new Date()), add = k => { const d = new Date(T + 'T12:00:00'); d.setDate(d.getDate() + k); return ymd(d); };
const OFF = [2, 3, 4, 5].map(add).find(d => new Date(d + 'T12:00:00').getDay() !== 0);
const CREW = 'crew.demo@grayco-cs.com', ADMIN = 'wjohnson@grayco-cs.com', PM = 'sbiffle@grayco-cs.com';
if (!H.ACCOUNTS[CREW]) H.ACCOUNTS[CREW] = { pw: 'Correct-Horse-44', id: 'u-crew', role: 'staff' };
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Demo Owner', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sample PM', email: PM, role: 'Project Manager', active: true },
  { id: 'u5', name: 'Office Desk', email: 'office@grayco-cs.com', role: 'Office Manager', active: true },
  { id: 'u9', name: 'Zedd Demo', email: CREW, role: 'Superintendent', active: true, manager: 'Sample PM' }]);
H.cset('projects', [
  { id: 'P1', po: 'PO-3001', autoPO: 'PO-3001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', address: '100 Demo St', pm: 'Sample PM', superintendent: 'Zedd Demo', status: 'Active', contract: 20000, contractSigned: true, updatedAt: new Date().toISOString() },
  { id: 'P2', po: 'PO-3002', autoPO: 'PO-3002', name: 'Demo Bath', client: 'Second Homeowner', address: '200 Demo Ave', pm: 'Sample PM', status: 'Active', contract: 9000, contractSigned: true, updatedAt: new Date().toISOString() }]);
H.cset('schedule', [
  { id: 'SC1', pid: 'P1', date: T, title: 'Cabinet install', assignee: 'Zedd Demo', time: '08:00', scope: 'company', by: 'Sample PM' },
  { id: 'SC2', pid: 'P2', date: OFF, title: 'Tile layout', assignee: 'Zedd Demo', time: '08:00', scope: 'company', by: 'Sample PM' }]);
H.cset('timesheets', []); H.cset('punch', []); H.cset('cos', []); H.cset('gc_office_tasks', []);
const W = []; const closeAll = async () => { for (const c of W) await c.b.close().catch(() => {}); W.length = 0; };
async function device(name, mobile){
  const c = await H.computer(name, { build, mobile }); W.push(c);
  await c.ctx.route(u => /\/storage\/v1\//.test(u.href || u), r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  if (!mobile) await c.page().setViewportSize({ width: 1366, height: 900 });
  return c;
}
const pageErrs = c => c.errs.filter(x => /PAGEERROR/.test(x));
const shot = (c, n) => c.page().screenshot({ path: SHOTS + n + '.png' }).catch(() => {});
try {
  // ── 1. the crew member's phone ──
  const P = await device('CREW-F', true);
  await H.signIn(P, CREW, 9000);
  const strip = await H.waitFor(P, () => { const e = document.getElementById('gc-to-strip'); return e && e.getBoundingClientRect().height > 0 ? e.innerText : null; }, null, 45000);
  ok(!!strip && /My schedule/.test(strip) && /Cabinet install|Demo Kitchen/.test(strip) && /Time off/.test(strip) && /Call in sick/.test(strip) && /Running late/.test(strip) && /Availability/.test(strip), 'phone: GrayCo Field home has 📅 My schedule (today: Demo Kitchen) + 🏖 🤒 ⏰ 📅 buttons', strip);
  ok(await P.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1), 'phone: no sideways scroll');
  await shot(P, '1_phone_field_home');
  await P.page().locator('#gc-to-strip [data-to-a="mine"]').first().tap();
  await sleep(700);
  const my = await P.ev(() => { const o = document.querySelector('.gc-to-ov[data-to-sheet="mine"]'); return o ? o.innerText : null; });
  ok(!!my && /Today/.test(my) && /Cabinet install/.test(my) && /Tile layout/.test(my), 'phone: 📅 My schedule lists the next days by day (today Cabinet install, Tile layout later)', my && my.slice(0, 300));
  await shot(P, '2_phone_my_schedule');
  await P.page().locator('.gc-to-ov [data-to-a="off"]').first().tap(); await sleep(600);
  await P.ev(d => { const o = document.querySelector('.gc-to-ov[data-to-sheet="off"]'); const f = o.querySelector('[data-f="from"]'), t = o.querySelector('[data-f="to"]'); f.value = d; f.dispatchEvent(new Event('change', { bubbles: true })); t.value = d; t.dispatchEvent(new Event('change', { bubbles: true })); o.querySelector('[data-f="reason"]').value = 'Demo dentist'; }, OFF);
  await sleep(300);
  const info = await P.ev(() => document.querySelector('.gc-to-ov[data-to-sheet="off"] [data-f="info"]').innerText);
  ok(/Tile layout|Demo Bath/.test(info) && /Approvals/.test(info), 'phone: the request sheet warns about the job on the schedule that day and says it goes to ✅ Approvals', info);
  await shot(P, '3_phone_request_off');
  await P.page().locator('.gc-to-ov[data-to-sheet="off"] [data-go]').tap(); await sleep(2500);
  const rec = (H.cget('gc_timeoff') || { list: [] }).list.find(r => r.kind === 'off');
  ok(!!rec && rec.status === 'pending' && rec.from === OFF && rec.email === CREW && rec.companyId === 'construction', 'the request is in the cloud (gc_timeoff), pending, Construction', rec);
  ok(!!rec && rec.notify.includes(PM) && rec.notify.includes(ADMIN), '…and goes to his manager (Sample PM) and the admin', rec && rec.notify);

  // ── 2. the admin approves ──
  const A = await device('ADMIN-D', false);
  await H.signIn(A, ADMIN, 9000);
  await H.waitFor(A, () => !!window._gcTimeOff && !!window._gcApprovalCurrent, null, 45000);
  await A.ev(() => window._gcTimeOff.pull()); await sleep(1500);
  const set = await A.ev(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); const c = window._gcApprovalCurrent(); return c.groups.other.map(x => x.id + ' ' + x.title); });
  ok(set.some(x => /^to:/.test(x) && /Time off: Zedd Demo/.test(x)), 'admin: the request is in the one approval set (APPROVE badge / To-Do chip / Approvals tab)', set);
  await A.ev(() => { try { window._gcRA && window._gcRA.hide && window._gcRA.hide(); } catch (e) {} window._setView('approvals'); }); await sleep(2500);
  const row = await A.ev(() => { const els = [...document.querySelectorAll('#gc-apx-mount *')].filter(e => /Time off: Zedd Demo/.test(e.textContent || '') && e.children.length < 40); return els.length ? els[els.length - 1].closest('[data-apx-key],[data-key],div').innerText.slice(0, 300) : (document.getElementById('gc-apx-mount') || {}).innerText; });
  ok(/Time off: Zedd Demo/.test(row || ''), 'admin: ✅ Approvals tab shows "🏖 Time off: Zedd Demo …"', row && row.slice(0, 300));
  await shot(A, '4_admin_approvals');
  const btn = A.page().locator('#gc-apx-mount button', { hasText: /Review/ }).first();
  if (await btn.count()) { await btn.click({ timeout: 5000 }).catch(() => {}); await sleep(900); }
  let opened = await A.ev(() => !!document.querySelector('.gc-to-ov[data-to-sheet="decide"]'));
  ok(opened, 'admin: the Approvals row\'s Review button opens the decide sheet');
  if (!opened) { await A.ev(id => window._gcTimeOff.openDecide(id), rec.id); await sleep(500); }
  const ds = await A.ev(() => document.querySelector('.gc-to-ov[data-to-sheet="decide"]').innerText);
  ok(/Zedd Demo/.test(ds) && /Tile layout|Demo Bath/.test(ds) && /Demo dentist/.test(ds), 'decide sheet: who, the reason and ⚠ the job on the schedule that day', ds.slice(0, 300));
  await A.page().locator('.gc-to-ov[data-to-sheet="decide"] [data-f="note"]').fill('OK — get well');
  await shot(A, '5_admin_decide');
  await A.page().locator('.gc-to-ov[data-to-sheet="decide"] [data-go="1"]').click(); await sleep(2500);
  const rec2 = (H.cget('gc_timeoff') || { list: [] }).list.find(r => r.id === rec.id);
  ok(rec2 && rec2.status === 'approved' && rec2.decidedBy === 'Demo Owner' && rec2.decisionNote === 'OK — get well', 'approved in the cloud with the note', rec2);
  const set2 = await A.ev(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); return window._gcApprovalCurrent().groups.other.filter(x => /^to:/.test(x.id)).length; });
  ok(set2 === 0, 'admin: off the approval list once decided');
  // the schedule board
  await A.ev(() => window._setView('schedule')); await sleep(2500);
  const bar = await H.waitFor(A, d => { const c = document.querySelector('#gc-to-schedbar [data-day="' + d + '"]'); return c ? c.innerText : null; }, OFF, 20000);
  ok(/Off · Zedd/.test(bar || ''), 'Schedule: the Who\'s-out board shows "🏖 Off · Zedd" on that day', bar);
  const api = await A.ev(d => window._gcTimeOff.isOff('crew.demo@grayco-cs.com', d), OFF);
  ok(api.off === true && api.kind === 'Off', 'window._gcTimeOff.isOff(email, day) → { off: true, kind: "Off" } for the schedule pickers', api);
  await shot(A, '6_admin_schedule_whos_out');
  // scheduling him that day → a warning
  await A.page().mouse.click(700, 40); await sleep(200);
  await A.ev(d => window._setSchedule(prev => prev.concat([{ id: 'SC9', pid: 'P1', date: d, title: 'Punch walk', assignee: 'Zedd Demo', time: '09:00', scope: 'company', by: 'Demo Owner' }])), OFF);
  const warnT = await H.waitFor(A, () => { const t = document.getElementById('gc-to-toast'); return t && t.style.display === 'block' && /Zedd Demo is off/.test(t.textContent) ? t.textContent : null; }, null, 8000);
  ok(!!warnT && /Punch walk/.test(warnT), 'scheduling Zedd on his day off shows a warning (a warning only)', warnT);
  await sleep(1200);
  const barW = await A.ev(() => (document.querySelector('#gc-to-schedbar .warn') || {}).textContent || '');
  ok(/Zedd Demo is off/.test(barW), '…and it stays on the Who\'s-out board for 10 minutes', barW);
  await shot(A, '7_admin_schedule_warning');
  ok(!pageErrs(A).length, 'admin: no page errors', pageErrs(A).slice(0, 3));

  // ── 3. the phone sees the answer; calls in sick ──
  await P.ev(() => window._gcTimeOff.pull()); await sleep(1800);
  const note = await H.waitFor(P, () => { const e = document.getElementById('gc-to-note-card'); return e ? e.innerText : null; }, null, 10000);
  ok(/Time off approved/.test(note || '') && /get well/.test(note || ''), 'phone: "✅ Time off approved … by Demo Owner — “OK — get well”"', note);
  await shot(P, '8_phone_approved_notice');
  await P.page().locator('#gc-to-note-card [data-to-a="seen"]').tap().catch(() => {}); await sleep(400);
  await P.ev(() => { document.querySelectorAll('.gc-to-ov').forEach(o => o.remove()); });
  await P.page().locator('#gc-to-strip [data-to-a="sick"]').first().tap(); await sleep(700);
  const si = await P.ev(() => document.querySelector('.gc-to-ov[data-to-sheet="sick"] [data-f="info"]').innerText);
  ok(/No approval/.test(si) && /Demo Kitchen|Cabinet/.test(si) && /Sample/.test(si), 'phone: the sick sheet shows today\'s job and who is told', si);
  await P.page().locator('.gc-to-ov[data-to-sheet="sick"] [data-f="note"]').fill('Demo fever');
  await shot(P, '9_phone_call_in_sick');
  await P.page().locator('.gc-to-ov[data-to-sheet="sick"] [data-go]').tap(); await sleep(3000);
  const sick = (H.cget('gc_timeoff') || { list: [] }).list.find(r => r.kind === 'sick');
  ok(!!sick && sick.from === T && sick.status === 'noted' && [PM, ADMIN, 'office@grayco-cs.com'].every(e => sick.notify.includes(e)), 'sick call saved, no approval; the manager, the office and the admin are told', sick);
  const ot = (H.cget('gc_office_tasks') || []), cov = (typeof ot === 'string' ? JSON.parse(ot) : ot).find(t => /Cover Zedd Demo/.test(t.label || ''));
  ok(!!cov && cov.kind === 'given' && cov.assignees.includes(PM) && /Demo Kitchen Remodel/.test(cov.label) && /today/.test(cov.label), 'the To-Do "🤒 Cover Zedd Demo’s jobs today: Demo Kitchen Remodel …" is in the cloud for Sample PM', cov);
  ok(!pageErrs(P).length, 'phone: no page errors', pageErrs(P).slice(0, 3));

  // ── 4. the manager ──
  const M = await device('PM-D', false);
  await H.signIn(M, PM, 9000);
  await H.waitFor(M, () => !!window._gcTimeOff, null, 30000);
  await M.ev(() => window._gcTimeOff.pull()); await sleep(1500);
  const mn = await H.waitFor(M, () => { const e = document.getElementById('gc-to-note-card'); return e ? e.innerText : null; }, null, 10000);
  ok(/Zedd Demo called in sick today/.test(mn || '') && /Demo Kitchen/.test(mn || ''), 'manager: in-app notice "🤒 Zedd Demo called in sick today — Jobs: Demo Kitchen …"', mn);
  const td = await H.waitFor(M, () => { try { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const x = l.find(t => /Cover Zedd Demo/.test(t.label || '')); return x ? x.label : null; } catch (e) { return null; } }, null, 20000);
  ok(/Cover Zedd Demo’s jobs today/.test(td || ''), 'manager: the "Cover Zedd Demo’s jobs today" To-Do reached this computer', td);
  const card = await H.waitFor(M, () => { const e = document.getElementById('gcn-card'); return e && e.getClientRects().length ? e.innerText : null; }, null, 12000);
  ok(/Cover Zedd Demo/.test(card || ''), 'manager: the To-Do notice card ("📋 New To-Do from Zedd") shows it', card);
  await shot(M, '10_manager_sick_notice_todo');
  ok(!pageErrs(M).length, 'manager: no page errors', pageErrs(M).slice(0, 3));

  // ── 5. Timesheets ──
  await A.ev(() => window._gcTimeOff.pull()); await sleep(1200);
  const tsOpen = await A.ev(() => Promise.race([Promise.resolve(window._gcOpenTimesheets()).then(() => 'opened', e => 'threw ' + e), new Promise(r => setTimeout(() => r('still waiting'), 4000))])); await sleep(1500);
  if (!(await A.ev(() => !!document.getElementById('_tsTable')))) console.log('    (timesheets: ' + tsOpen + ' · dialogs ' + JSON.stringify(A.dialogs.slice(-3)) + ' · errs ' + JSON.stringify(A.errs.slice(-3)) + ')');
  const ts = await H.waitFor(A, () => { const e = document.getElementById('gc-to-ts'); return e ? e.innerText : null; }, null, 8000);
  ok(/Zedd Demo/.test(ts || '') && /Sick/.test(ts || '') && /Unpaid/.test(ts || '') && /Off/.test(ts || ''), 'admin 🕐 Timesheets: the sick day and the day off are their own rows (Unpaid — no paid leave on the record)', ts && ts.slice(0, 400));
  ok(!JSON.stringify(H.cget('timesheets') || []).includes('Sick'), 'the timesheets list itself is not changed (pay math untouched)');
  await shot(A, '11_admin_timesheets');
  await A.ev(() => document.querySelectorAll('[id^="_ts"], .gc-to-ov').forEach(e => { let o = e; while (o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o !== document.getElementById('root')) o.remove(); }));

  // ── 6. ✕ Deny on the Approvals row denies the request (not a "fix and resend" To-Do) ──
  const D2 = [6, 7, 8].map(add).find(d => new Date(d + 'T12:00:00').getDay() !== 0);
  const r2 = await P.ev(d => window._gcTimeOff.request({ kind: 'off', from: d, to: d, part: 'full', reason: 'Demo game' }).then(x => x.rec && x.rec.id), D2);
  await sleep(1500); await A.ev(() => window._gcTimeOff.pull()); await sleep(1200);
  await A.ev(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); window._setView('dashboard'); }); await sleep(800);
  await A.ev(() => window._setView('approvals')); await sleep(2500);
  const clicked = await A.ev(() => { const cards = [...document.querySelectorAll('#gc-apx-mount *')].filter(e => /Time off: Zedd Demo/.test(e.textContent || '') && [...e.querySelectorAll('button')].some(b => /Deny/.test(b.textContent))); const c = cards[cards.length - 1]; if (!c) return false; [...c.querySelectorAll('button')].find(b => /Deny/.test(b.textContent)).click(); return true; });
  await sleep(700);
  const went = await A.ev(() => {   /* the deny bar ("✕ Denied — … Why? · Send back · ↩ Undo"), or the older in-card box */
    const w = document.querySelector('[data-apx-dwhy]');
    if (w) { w.value = 'Busy week'; w.dispatchEvent(new Event('input', { bubbles: true })); const g = document.querySelector('[data-apx-dsend]'); if (!g) return false; g.click(); return true; }
    const i = document.querySelector('[data-apx-deny-in]'); if (!i) return false; i.value = 'Busy week'; i.dispatchEvent(new Event('input', { bubbles: true })); const g = document.querySelector('[data-apx-act$="|denygo"]'); if (!g) return false; g.click(); return true; });
  await sleep(2500);
  const r2c = (H.cget('gc_timeoff') || { list: [] }).list.find(r => r.id === r2);
  ok(clicked && went && r2c && r2c.status === 'denied' && r2c.decisionNote === 'Busy week', 'Approvals row ✕ Deny (with a reason) denies the time-off request', { clicked, went, st: r2c && r2c.status, n: r2c && r2c.decisionNote });
  const fixTodo = JSON.stringify(H.cget('gc_office_tasks') || []).includes('Fix and resend: 🏖');
  ok(!fixTodo, '…and makes no "↩ Fix and resend" To-Do');
  await shot(A, '12_admin_deny_from_row');
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await closeAll();
console.log(`\nTIMEOFF browser: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
