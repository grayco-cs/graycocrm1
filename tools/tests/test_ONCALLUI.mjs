// test_ONCALLUI.mjs <build-dir> — owner 11/11 (ONCALL2): 📟 On call sheet — Mitigation Manager first, foremen, techs (text only),
// last resort (insurance lead manager → owners), the screening steps and 🚩 missed emergency calls. Made-up people only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Max Manager', email: 'max@example.com', role: 'Mitigation Manager', phone: '5015550101', active: true },
  { id: 'u3', name: 'Fred Foreman', email: 'fred@example.com', role: 'Foreman', phone: '5015550102', active: true },
  { id: 'u4', name: 'Tina Tech', email: 'tina@example.com', role: 'Field Tech', phone: '5015550103', active: true }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const SETS = [];
const cfg = { on: true, weekends: true, hours: { start: '07:00', end: '18:00' }, holidays: [], escalateMin: 10, startDate: '2026-01-05',
  mitManager: { email: 'max@example.com', name: 'Max Manager', phone: '5015550101' }, rotation: [{ email: 'fred@example.com', name: 'Fred Foreman', phone: '5015550102' }],
  techRotation: [{ email: 'tina@example.com', name: 'Tina Tech', phone: '5015550103' }], owners: [] };
const misses = [{ at: new Date(Date.now() - 3 * 864e5).toISOString(), title: '🚨 EMERGENCY call — Test Caller', kind: 'water damage', city: 'Testville', reached: 'owner', minutes: 17, missed: [{ name: 'Max Manager' }, { name: 'Fred Foreman' }] }];
await A.ctx.route('**/.netlify/functions/x10*', async r => {
  let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
  if (b.action === 'oncall-get') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cfg, now: cfg.rotation[0], techNow: cfg.techRotation[0], afterHours: true, canEdit: true, pages: [], misses }) });
  if (b.action === 'oncall-set') { SETS.push(b.cfg); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cfg: b.cfg }) }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => window._gcX10.oncall()); await sleep(2500);
const txt = await A.ev(() => { const o = [...document.querySelectorAll('div')].reverse().find(d => /📟 On call — after-hours emergencies/.test(d.innerText || '') && d.querySelector('[data-mm]')); return o ? o.innerText : ''; });
ok('the sheet shows the Mitigation Manager (called first), foreman and tech this week', /Mitigation Manager — always on call, called first/.test(txt) && /Max Manager/.test(txt) && /Foreman this week: Fred Foreman/.test(txt) && /Tech this week: Tina Tech/.test(txt), txt.slice(0, 300));
ok('it spells out the screening: press 1 only for a real emergency, the yes / no check, press 3 = not a real emergency, 15 min → the last resort', /press 1 only for an emergency happening right now/.test(txt) && /yes \/ no check/.test(txt) && /Press 3 = not a real emergency/.test(txt) && /15 min/.test(txt), '');
ok('🚩 missed emergency calls: per person, and which ones reached the owners', /Max Manager: 1 missed · 1 reached the owners/.test(txt) && /Fred Foreman: 1 missed/.test(txt), txt.slice(txt.indexOf('🚩 Missed'), txt.indexOf('🚩 Missed') + 200));
ok('last resort defaults to Wesley Johnson, then Nick Thomas', /Not set — Wesley Johnson, then Nick Thomas/.test(txt));
{ const fs = await import('fs'); let sp = process.argv[3] || '/tmp/oncall_sheet.png'; try { if (fs.statSync(sp).isDirectory()) sp += '/oncall_sheet.png'; } catch (e) {} await A.page().screenshot({ path: sp, fullPage: false }); }
await A.ev(() => { const s = document.querySelector('[data-addl="own"]'); s.value = 'wjohnson@grayco-cs.com'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(800);
ok('adding an owner saves the whole config (owners + foremen + techs + manager)', SETS.length === 1 && SETS[0].owners[0].email === 'wjohnson@grayco-cs.com' && SETS[0].techRotation[0].email === 'tina@example.com' && SETS[0].mitManager.email === 'max@example.com' && SETS[0].rotation.length === 1, SETS);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('ONCALLUI ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
