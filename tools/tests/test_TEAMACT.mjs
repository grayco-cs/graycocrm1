// test_TEAMACT.mjs <build-dir> — patch TEAMACTIVITY in the offline harness (made-up people and data).
//   1. A PM's computer: the heartbeat starts after sign-in (a sign-in counted); a scripted session — 10 minutes of keys /
//      scrolling, 12 idle minutes, 5 more minutes (the page's activity clock moved to a quiet hour of today) — and a save;
//      the 5-minute write: gc_kv gc_activity_<today>__pm-grayco-cs-com holds the device (pc · Desk, version, screen), the
//      active minutes as ranges, the sign-in, the save ("saved a lead"); nothing typed is in it.
//   2. The owner (admin): ⚙ Admin → 👥 Team activity, and the 💎 menu; the table: Demo PM active today = the rule applied to
//      the minutes (the 12-minute idle gap NOT counted: 10 + 5 = 15 for the scripted part), sign-ins, devices, version, last
//      screen, saves; failed sign-ins from BOOTWATCH's gc_bootrep rows (matched by its e-mail hash; an unmatched one listed);
//      the day timeline: the two active blocks (3:00–3:10 and 3:22–3:27 in the quiet hour), the save, an approval
//      (gc_appr_audit) and the sign-in as key actions.
//   3. Not for non-admins: a PM and the Office Manager (not an admin) cannot open it (no 💎 item, no ⚙ Admin button).
// Run: flock <browser.lock> node tools/tests/test_TEAMACT.mjs <abs build dir>
import path from 'path'; import fs from 'fs'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, cset, cget, resetCloud, ACCOUNTS, waitFor } = H;
const build = path.resolve(process.argv[2] || '.');
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/teamact/'; fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const byId = id => Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === id);
const WES = byId('u-wesley'), NICK = byId('u-nick'), OFF = byId('u-office'), PM = byId('u-pm');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const chi = t => { const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).forEach(p => { o[p.type] = p.value; }); return { ymd: `${o.year}-${o.month}-${o.day}`, h: +o.hour % 24, m: +o.minute, s: +o.second }; };
const now0 = Date.now(), C0 = chi(now0), TODAY = C0.ymd;
const dayStart = now0 - ((C0.h * 60 + C0.m) * 60 + C0.s) * 1000 - (now0 % 1000);
/* the scripted session runs in a quiet hour of today, far from the real sign-in minutes */
const BASE_H = C0.h >= 6 ? 3 : 20, BASE = BASE_H * 60;
/* the rule, written here independently: each marked minute 1; a gap ≤ 5 counts in full; a longer gap (idle) does not */
const rule = m => m.reduce((t, x, i) => t + (i === 0 ? 1 : (x - m[i - 1] <= 5 ? x - m[i - 1] : 1)), 0);
const fromR = t => String(t || '').split(',').filter(Boolean).flatMap(p => { const [a, b] = p.split('-').map(Number); const o = []; for (let i = a; i <= (b == null ? a : b); i++) o.push(i); return o; });
function bwHash(t){ let h1 = 0x811c9dc5, h2 = 0x1b873593; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822507) >>> 0; } return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-4); }

resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: WES, role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Office Demo', email: OFF, role: 'Office Manager', active: true }, { id: 'u4', name: 'Demo PM', email: PM, role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'P1', po: 'PO-1001', name: 'Demo Roof Job', client: 'Demo Client A', address: '1 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'Active', contract: 18000, createdAt: ago(20), updatedAt: ago(1) }]);
cset('leads', [{ id: 'L1', name: 'Demo Lead', phone: '9015550101', stage: 'New Lead', status: 'new', pm: 'Demo PM', createdAt: ago(1), updatedAt: ago(1) }]);
const atMin = m => new Date(dayStart + m * 60e3 + 20e3).toISOString();
cset('gc_appr_audit', JSON.stringify([{ id: 'A1', key: 'sub:S1', title: 'Demo Sub LLC invoice', decision: 'approved', by: 'Demo PM', email: PM, device: 'computer', at: atMin(BASE + 24) }]));
/* BOOTWATCH: two failed sign-ins today — one of the PM's (matched by the hash of the e-mail), one nobody's */
cset('gc_bootrep_Pdemo1', { dev: 'Pdemo1', kind: 'phone', updated: new Date().toISOString(), boots: [{ id: 'b1', at: new Date(now0 - 3600e3).toISOString(), kind: 'phone', si: [{ t: 900, dom: 'grayco-cs.com', h: bwHash(PM), err: 'Invalid login credentials', errT: 1500 }] }] });
cset('gc_bootrep_Pdemo2', { dev: 'Pdemo2', kind: 'pc', updated: new Date().toISOString(), boots: [{ id: 'b2', at: new Date(now0 - 7200e3).toISOString(), kind: 'pc', si: [{ t: 900, dom: 'gmail.com', h: 'abcdef012345', err: 'Not on the staff list' }] }] });

const CLEAN = [];
async function desk(who, email){
  const c = await computer(who, { build }); CLEAN.push(c);
  await signIn(c, email, 15000);
  ok(!!(await waitFor(c, () => !!window._gcTeamAct && !!document.getElementById('gc-hub-btn') && (window._crm && window._crm.users || []).length >= 4, null, 60000)), who + ': the Desk is open');
  await sleep(2000);
  return c;
}
try {
  console.log('1 · a PM\'s computer: the heartbeat');
  const P = await desk('PM', PM);
  ok(!!(await waitFor(P, () => window._gcTeamAct.state().on, null, 10000)), 'the activity log starts after the sign-in');
  const s0 = await P.ev(() => window._gcTeamAct.state());
  ok(s0.rec && s0.rec.si === 1 && s0.rec.op >= 1 && s0.rec.k === 'pc' && s0.rec.app === 'desk', 'this open is counted, and the sign-in (the Sign in button was pressed)', s0.rec);
  /* the scripted session */
  const target = dayStart + BASE * 60e3;
  const at = async (min, how) => { await P.ev(ms => window._gcTeamAct.skew(ms), target + min * 60e3 + 3000 - Date.now()); if (how === 'scroll') await P.page().mouse.wheel(0, 40); else await P.page().keyboard.press('Shift'); await sleep(30); };
  for (let i = 0; i < 10; i++) await at(i, i % 3 === 0 ? 'scroll' : 'key');
  for (let i = 22; i < 27; i++) await at(i, i === 24 ? 'scroll' : 'key');
  /* a save the person made: a key, then the leads list goes to the cloud */
  await at(26, 'key');
  await P.ev(() => { const l = JSON.parse(JSON.stringify(window._crm.leads)); l[0].notes = 'called back ' + Date.now(); l[0].updatedAt = new Date().toISOString(); return window._supaUpsertNow ? window._supaUpsertNow('leads', l) : window._supaUpsert('leads', l); });
  await sleep(800);
  const st = await P.ev(() => window._gcTeamAct.state());
  ok(st.rec && st.rec.sv >= 1 && st.rec.ev.some(e => e[1] === 'saved a lead' && e[0] === BASE + 26), 'the save is counted ("saved a lead" at that minute)', st.rec && { sv: st.rec.sv, ev: st.rec.ev });
  ok(await P.ev(() => window._gcTeamAct.flush()), 'the write goes out');
  await P.ev(() => window._gcTeamAct.skew(0));
  const key = 'gc_activity_' + TODAY + '__pm-grayco-cs-com', row = cget(key);
  ok(row && row.email === PM && row.name === 'Demo PM' && row.day === TODAY && row.d && Object.keys(row.d).length === 1, 'gc_kv ' + key + ': the person, the day, one device', row && { email: row.email, day: row.day, devs: Object.keys(row.d || {}) });
  const dv = row && Object.values(row.d)[0];
  const mins = dv ? fromR(dv.m) : [], part = mins.filter(m => m >= BASE && m < BASE + 60);
  ok(JSON.stringify(part) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 22, 23, 24, 25, 26].map(x => x + BASE)), 'the scripted minutes are marked (as ranges: "' + (dv && dv.m) + '")', part);
  ok(dv && dv.k === 'pc' && dv.app === 'desk' && /^\d+\.\d+/.test(dv.v) && /^Desk/.test(dv.view) && dv.si === 1 && dv.sv >= 1, 'device · app · version · last screen · sign-in · saves', dv && { k: dv.k, app: dv.app, v: dv.v, view: dv.view, si: dv.si, sv: dv.sv });
  ok(JSON.stringify(row).length < 2000 && !/Shift|password|"pw"/.test(JSON.stringify(row)), 'small (' + JSON.stringify(row).length + ' bytes) and nothing typed in it');
  ok(rule(part) === 15, 'the rule on the scripted part: 10 + 5 = 15 active minutes (the 12-minute idle gap not counted)', rule(part));
  const expToday = rule(mins);

  console.log('2 · the owner: 👥 Team activity');
  const O = await desk('OWNER', WES);
  await O.ev(() => { try { window._gcRA && window._gcRA.hide && window._gcRA.hide(); } catch (e) {} window._setView && window._setView('admin'); });
  ok(!!(await waitFor(O, () => !!document.querySelector('#gc-adm-tools [data-ta-adm]'), null, 15000)), '⚙ Admin has 👥 Team activity');
  await O.page().click('#gc-adm-tools [data-ta-adm]');
  ok(!!(await waitFor(O, () => !!document.querySelector('#gc-ta tr[data-ta-p]'), null, 10000)), 'Team activity opens');
  const label = await O.ev(() => (document.querySelector('#gc-ta .gc-ta-note') || {}).textContent || '');
  ok(/Activity log/.test(label) && /Nothing anyone types is kept/.test(label) && /nothing is recorded from the screen/.test(label) && /Only admins/.test(label), 'plainly labelled: an activity log, no keystrokes, no screen recording, admins only');
  const pmRow = await O.ev(e => { const r = document.querySelector('#gc-ta tr[data-ta-p="' + e + '"]'); return r ? [...r.children].map(td => td.innerText.replace(/\s+/g, ' ').trim()) : null; }, PM);
  const durTxt = m => { const h = Math.floor(m / 60), mm = m % 60; return h ? h + ' h' + (mm ? ' ' + mm + ' min' : '') : mm + ' min'; };
  ok(pmRow && pmRow[2] === durTxt(expToday) && pmRow[3] === durTxt(expToday), 'Demo PM: active today = this week = ' + durTxt(expToday) + ' (the rule on all of today\'s minutes)', pmRow);
  ok(pmRow && /^1/.test(pmRow[4]) && /pc · Desk/.test(pmRow[5]) && /^\d+\.\d+/.test(pmRow[6]) && /^Desk/.test(pmRow[7]) && +pmRow[8] >= 1 && /0 errors/.test(pmRow[9]), 'sign-ins 1 · 🖥 pc · Desk · version · last screen · saves · errors', pmRow);
  ok(pmRow && pmRow[10] === '1', 'failed sign-ins (BOOTWATCH, 7 days): 1 — matched by the e-mail hash', pmRow && pmRow[10]);
  ok(/not matched to a person[\s\S]*gmail\.com[\s\S]*Not on the staff list/i.test(await O.ev(() => document.getElementById('gc-ta').innerText)), 'the unmatched failed sign-in is listed (device, domain, the error)');
  await O.page().screenshot({ path: SHOTS + 'teamact_table.png' });
  await O.page().click(`#gc-ta tr[data-ta-p="${PM}"]`);
  ok(!!(await waitFor(O, () => !!document.querySelector('#gc-ta [data-ta-block]'), null, 10000)), 'tap the person: the day\'s timeline');
  const tl = await O.ev(() => ({ total: (document.querySelector('#gc-ta [data-ta-total]') || {}).textContent, blocks: [...document.querySelectorAll('#gc-ta [data-ta-block]')].map(b => b.innerText.replace(/\s+/g, ' ').trim()), ev: [...document.querySelectorAll('#gc-ta .gc-ta-ev:not([data-ta-block])')].map(b => b.innerText.replace(/\s+/g, ' ').trim()), bars: document.querySelectorAll('#gc-ta .gc-ta-bar i').length }));
  const hh = BASE_H % 12 || 12, ap = BASE_H < 12 ? 'AM' : 'PM';
  ok(tl.total === durTxt(expToday), 'the timeline total = ' + durTxt(expToday), tl.total);
  ok(tl.blocks.includes(`${hh}:00 ${ap} to ${hh}:10 ${ap} · 10 min`) && tl.blocks.includes(`${hh}:22 ${ap} to ${hh}:27 ${ap} · 5 min`), 'two active blocks: ' + hh + ':00–' + hh + ':10 (10 min) and ' + hh + ':22–' + hh + ':27 (5 min) — the idle gap between them is not active', tl.blocks);
  ok(tl.ev.some(e => new RegExp(`^${hh}:26 ${ap} saved a lead`).test(e)) && tl.ev.some(e => /approved: Demo Sub LLC invoice/.test(e)) && tl.ev.some(e => /signed in/.test(e)), 'key actions: the save, the approval (gc_appr_audit), the sign-in', tl.ev);
  ok(tl.bars >= 2, 'the bar shows the active blocks', tl.bars);
  await O.page().screenshot({ path: SHOTS + 'teamact_timeline.png' });
  await O.page().keyboard.press('Escape'); await sleep(300);
  ok(!(await O.ev(() => !!document.getElementById('gc-ta'))), 'Esc closes it');
  await O.ev(() => { window._gcCloseHub && window._gcCloseHub(); window._gcToggleHub(); });
  ok(!!(await waitFor(O, () => { const p = [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop(); return p && !!p.querySelector('#gc-ta-hub'); }, null, 5000)), '💎 has 👥 Team activity for the owner');
  await O.ev(() => window._gcCloseHub && window._gcCloseHub());

  console.log('3 · not for non-admins');
  ok(!(await P.ev(() => { const r = window._gcTeamAct.open(); return !!r || !!document.getElementById('gc-ta'); })), 'a PM cannot open Team activity');
  ok(P.dialogs.some(d => /for admins/.test(d.message)), '…and is told it is for admins');
  await P.ev(() => { window._gcCloseHub && window._gcCloseHub(); window._gcToggleHub(); }); await sleep(800);
  ok(!(await P.ev(() => !!document.querySelector('.gc-hub-panel #gc-ta-hub'))), 'a PM\'s 💎 has no Team activity');
  await P.ev(() => window._gcCloseHub && window._gcCloseHub());
  const F = await desk('OFFICE', OFF);
  ok(await F.ev(() => !window.__GC_AUTH__.isAdmin()), 'the Office Manager is not an admin here');
  ok(!(await F.ev(() => { const r = window._gcTeamAct.open(); return !!r || !!document.getElementById('gc-ta'); })), 'the Office Manager (not an admin) cannot open Team activity');
  await F.ev(() => { try { window._gcRA && window._gcRA.hide && window._gcRA.hide(); } catch (e) {} window._setView && window._setView('admin'); }); await sleep(3000);
  ok(!(await F.ev(() => !!document.querySelector('[data-ta-adm]'))), '…and no 👥 button on any Admin page it can reach');
  ok(P.errs.length === 0 && O.errs.length === 0 && F.errs.length === 0, 'no page errors', [P.errs, O.errs, F.errs]);
} catch (e) { fail++; console.log('  ✗ FAIL (threw) ' + (e && e.stack || e)); }
finally { for (const c of CLEAN) { try { await c.close(); } catch (e) {} } }
console.log(`\nTEAMACT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
