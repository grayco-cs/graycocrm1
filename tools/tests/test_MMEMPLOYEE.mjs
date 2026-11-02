// test_MMEMPLOYEE.mjs <build-dir> <mirror.json> — patch OFFICEFIX (owner 11/01): adding the Marketing Manager (Malcolm Lane,
// a personal e-mail) under ⚙ Admin → 👤 Employees, as the owner, with the REAL function handlers (officefix_bridge.mjs).
//   * the Role box offers "Marketing Manager";
//   * choosing it shows the line "Also add him in 💎 → Team access …" and its button opens Team access filled in
//     (name, e-mail, profile Marketing Manager); Add there → staff-admin → gc_staff row profile 'marketing', active false,
//     mkt_active true (never active staff) and a temporary password shown once;
//   * Create Employee keeps his personal e-mail (not turned into @grayco-cs.com) and the role;
//   * the staff e-mail rule (_lib/staff-mail.js) then counts his address as staff; admin / office rules do not.
// Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wUPG/harness.mjs').href);
const { computer, signIn, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_MMEMPLOYEE.mjs <build-dir> <mirror.json>'); process.exit(2); }
const B = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'officefix_bridge.mjs')).href);
const OWNER = 'wjohnson@grayco-cs.com', MM = 'malcolm@adventuresmedia.com', NAME = 'Malcolm Lane';
let fails = 0; const ok = (c, m, x) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 300) : '')); if (!c) fails++; };
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const STAFF = [{ email: OWNER, name: 'Wesley Johnson', role: 'admin', profile: null, active: true, payroll: true, mkt_active: false }];
const bridge = B.installBridge({ build: BUILD, cloud, accounts: ACCOUNTS, staffRows: STAFF });
const c = await computer('owner', { build: BUILD }); c.acceptConfirm = true;
await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access)/.test(u), async r => {
  const u = new URL(r.request().url()); const J = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname.endsWith('/gc_staff')) return J(STAFF); return J({ email: OWNER, staff: true, admin: true, payroll: true, office: false, sec2: 1 });
});
await B.routeFunctions(c, bridge);
await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
await signIn(c, OWNER, 1000);
await waitFor(c, () => document.querySelectorAll('aside button[draggable="true"]').length > 5 && !!(window._crm && window._crm.projects && window._crm.projects.length), null, 150000, 500);
await sleep(6000);
await sleep(6000); await waitFor(c, () => !!(window._setView && window._crm && window._crm.projects && window._crm.projects.length), null, 60000, 500);
const p = c.page();
const HJS = `window.__vis = e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none'; };
window.__click = re => { re = new RegExp(re); const b = [...document.querySelectorAll('button, [role=tab], a')].filter(__vis).find(e => re.test((e.innerText || '').trim())); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; };
window.__setV = (el, v) => { const P = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(P, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
window.__field = (root, label) => { const l = [...root.querySelectorAll('label, div, span, b')].filter(e => e.children.length === 0 && (e.textContent || '').trim().toLowerCase() === label.toLowerCase())[0]; if (!l) return null; let q = l.parentElement; for (let i = 0; i < 3 && q; i++) { const x = q.querySelector('input'); if (x) return x; q = q.parentElement; } return null; }; true;`;
await p.evaluate(HJS);
/* a late sign-in reload can replace the page under a step: wait for it, put the helpers back, try once more */
const _ev = p.evaluate.bind(p);
p.evaluate = async (f, a) => { try { return await _ev(f, a); } catch (e) { if (!/context was destroyed|navigation|is not defined/i.test(e.message)) throw e; await sleep(4000); for (let i = 0; i < 120; i++) { const r = await _ev(() => !!(window._setView && window._crm && window._crm.projects && window._crm.projects.length)).catch(() => false); if (r) break; await sleep(500); } await sleep(3000); await _ev(HJS); return _ev(f, a); } };
/* ⚙ Admin → 👤 Employees → + Add Employee */
const opened = await p.evaluate(async () => {
  window._setView('admin'); await new Promise(z => setTimeout(z, 3000));
  for (let i = 0; i < 6 && !__click('^\\+ Add Employee$'); i++) { __click('Employees'); await new Promise(z => setTimeout(z, 1200)); }
  await new Promise(z => setTimeout(z, 1200));
  const sel = [...document.querySelectorAll('select')].filter(__vis).find(s => [...s.options].some(o => o.text === 'Crew Lead'));
  return sel ? [...sel.options].map(o => o.text) : null;
});
ok(!!opened, '⚙ Admin → 👤 Employees → + Add Employee opens the form', opened);
ok(!!opened && opened.includes('Marketing Manager'), 'the Role box offers "Marketing Manager"', opened);
const filled = await p.evaluate(async ({ NAME, MM }) => {
  const sel = [...document.querySelectorAll('select')].filter(__vis).find(s => [...s.options].some(o => o.text === 'Crew Lead'));
  let root = sel; for (let i = 0; i < 14 && root; i++) { root = root.parentElement; if (root && [...root.querySelectorAll('button')].some(b => /^(Create Employee|Save Changes)$/.test((b.innerText || '').trim()))) break; }
  __setV(__field(root, 'Full Name'), NAME); __setV(__field(root, 'Email'), MM); __setV(sel, 'Marketing Manager'); await new Promise(z => setTimeout(z, 1200));
  const note = root.querySelector('[data-ofx-mm]'); return { note: note && note.innerText, role: sel.value };
}, { NAME, MM });
ok(filled.role === 'Marketing Manager', 'the role is picked', filled.role);
ok(!!filled.note && /Also add him in 💎 → Team access with the Marketing Manager profile to give him a sign-in/.test(filled.note), 'the line under the Role box says how he gets a sign-in', filled.note);
/* the button → Team access filled in → Add */
const ta = await p.evaluate(async () => { document.querySelector('[data-ofx-mm-open]').click(); await new Promise(z => setTimeout(z, 2000));
  const e = document.getElementById('gcTaEmail'), n = document.getElementById('gcTaName'), pr = document.getElementById('gcTaProfile'), rl = document.getElementById('gcTaRole');
  return { email: e && e.value, name: n && n.value, profile: pr && pr.value, role: rl && rl.value, hasMkt: !!pr && [...pr.options].some(o => o.value === 'marketing') }; });
ok(ta.email === MM && ta.name === NAME && ta.profile === 'marketing' && ta.role === 'staff', '🔐 Open Team access (filled in): e-mail, name and the Marketing Manager profile are filled in', ta);
const n0 = c.calls.length;
const added = await p.evaluate(async () => { document.getElementById('gcTaAdd').click(); await new Promise(z => setTimeout(z, 3000)); const m = document.getElementById('gcTaEmail'); const box = m && m.closest('div'); return (document.body.innerText.match(/[^\n]{0,60}can now sign in with this temporary password[^\n]{0,40}/) || [''])[0]; });
const call = c.calls.slice(n0).find(x => x.fn === 'staff-admin' && /"action":"add"/.test(x.b));
ok(!!call && call.status === 200, 'Team access → Add: staff-admin add answered 200', call && [call.status, call.err]);
const row = bridge.tables.get('gc_staff').get(MM);
ok(!!row && row.profile === 'marketing' && row.active === false && row.mkt_active === true && row.role === 'staff', 'gc_staff: profile marketing, NOT active staff, mkt_active on (the Marketing Manager rule)', row);
ok(/malcolm@adventuresmedia\.com can now sign in with this temporary password/.test(added), 'the result is shown to the admin (the temporary password, once)', added);
/* close Team access, then Create Employee */
const made = await p.evaluate(async ({ MM }) => {
  [...document.querySelectorAll('body > div')].forEach(d => { if (d.querySelector('#gcTaEmail')) d.remove(); });
  await new Promise(z => setTimeout(z, 400));
  const b = [...document.querySelectorAll('button')].filter(__vis).find(x => (x.innerText || '').trim() === 'Create Employee'); if (!b) return { err: 'no Create Employee' }; b.click(); await new Promise(z => setTimeout(z, 2000));
  const u = (window._crm.users || []).find(x => (x.email || '').toLowerCase() === MM); return u ? { email: u.email, role: u.role, name: u.name } : { err: 'not in the people list' };
}, { MM });
ok(made.email === MM && made.role === 'Marketing Manager', 'Create Employee keeps his personal e-mail and the role', made);
/* the staff e-mail rule now counts him; admin / office rules do not */
const req = createRequire(path.join(BUILD, 'netlify', 'functions', 'x.js'));
const SM = req('./_lib/staff-mail.js'); SM._reset(); await SM.load({ fresh: true });
ok(SM.isStaffEmail(MM) && !SM.isStaffEmail('someone.random.test@gmail.com'), 'staff e-mail: his address counts as staff, a random gmail.com one does not');
const SR = req('./_lib/staff-role.js');
ok(!SR.isAdmin(Object.assign({ ok: true }, row)) && !SR.isOfficeOrAdmin(Object.assign({ ok: true }, row)), 'he is neither admin nor office');
const errs = c.errs.filter(e => !/ResizeObserver|Failed to load resource|net::ERR|AbortError/i.test(e)); ok(!errs.length, 'no page errors', errs.slice(0, 4));
console.log(fails ? 'MMEMPLOYEE: FAIL (' + fails + ')' : 'MMEMPLOYEE: PASS');
await c.b.close(); process.exit(fails ? 1 : 0);
