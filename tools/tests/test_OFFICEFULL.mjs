// test_OFFICEFULL.mjs <build-dir> <mirror.json> — patch OFFICEFULL in a real browser, offline (mock Supabase), on a READ-ONLY
// mirror of the company data (kept outside git). Signs in as the owner, the office and a PM:
//   * the office's left menu = the owner's menu; she opens every tab (none refused), ⚙ Admin too — without 💎 Team
//     access, + Add Employee / EDIT / Disable / 🗑, the 🛡 Security card and the backup / restore / storage rows;
//   * she opens all projects, Accounting, P&L and Payroll; the money records (cash vault, commission structures, the
//     private pay store) are hers once the database says office (gc_my_access().office = true, docs/office-full-access.sql);
//   * she changes a job's automations (the JA box and "More for this job"), the automation defaults are hers to save;
//   * a PM still has none of it (no ⚙ Admin / Payroll / P&L, "More for this job" read-only).
// Env: GC_HARNESS (default the wME harness), GC_SEED (its seed13.mjs: mockFns). Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wME/harness.mjs';
const SEED = process.env.GC_SEED || path.join(path.dirname(HARNESS), 'seed13.mjs');
const H = await import(pathToFileURL(HARNESS).href); const { mockFns } = await import(pathToFileURL(SEED).href);
const { computer, signIn, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_OFFICEFULL.mjs <build-dir> <mirror.json>'); process.exit(2); }
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
function loadCloud(){ cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
const OFFICE = 'office@grayco-cs.com', OWNER = 'wjohnson@grayco-cs.com', PM = 'sbiffle@grayco-cs.com';
const ADMINKV = new Map([['gc_cash_anchor', { key: 'gc_cash_anchor', value: { amount: 12345, date: '2026-10-29', by: 'test' }, updated_at: '2026-10-29T12:00:00Z' }],
  ['gc_accounts_ledger', { key: 'gc_accounts_ledger', value: [{ id: 'mvT', account: 'cash', amount: -500, kind: 'owner_draw', date: '2026-10-28', note: 'Owner draw (test)' }], updated_at: '2026-10-29T12:00:00Z' }]]);
let fails = 0; const ok = (c, m, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 300) : '')); if (!c) fails++; };

async function person(email){
  loadCloud();
  const c = await computer(email.split('@')[0], { build: BUILD }); await mockFns(c, email); c.acceptConfirm = true;
  const a = ACCOUNTS[email];
  /* the company sign-in as production has it: the office is 'staff' with no profile (her people-list role decides), payroll on;
     gc_my_access() as after docs/office-full-access.sql; gc_admin_kv as its rules let each person see it */
  c.adminKvPosts = [];
  await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access|gc_admin_kv)/.test(u), async r => {
    const u = new URL(r.request().url()), m = r.request().method();
    const J = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/gc_staff')) return J(200, [{ email, role: a.role, active: true, name: '', profile: null, payroll: email === OFFICE || a.role === 'admin' }]);
    if (u.pathname.endsWith('/gc_my_access')) return J(200, { email, staff: true, admin: a.role === 'admin', payroll: a.role === 'admin' || email === OFFICE, office: email === OFFICE, sec2: 1 });
    const may = a.role === 'admin' || email === OFFICE;
    if (m === 'GET') return J(200, may ? [...ADMINKV.values()] : []);
    if (!may) return J(403, { message: 'new row violates row-level security policy' });
    c.adminKvPosts.push(r.request().postData() || ''); return J(201, '');
  });
  await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
  await c.page().setViewportSize({ width: 1366, height: 768 });
  await signIn(c, email, 1000);
  await waitFor(c, () => document.querySelectorAll('aside button[draggable="true"]').length > 5 && !!(window._crm && window._crm.projects && window._crm.projects.length), null, 120000, 500);
  await sleep(8000);
  return c;
}
const navIds = c => c.ev(() => {
  function fk(b){ for (const k in b) if (k.indexOf('__reactFiber') === 0) { const f = b[k]; return f && f.key != null ? String(f.key) : null; } return null; }
  const a = document.querySelector('aside'); if (!a) return [];
  return [...a.querySelectorAll('button[draggable="true"]')].map(fk).filter(Boolean);
});
async function walk(c, ids){
  const out = {};
  for (const id of ids) {
    const r = await c.ev(async id => {
      const toast = () => [...document.querySelectorAll('div')].some(d => /is not on your tab list/.test(d.textContent || '') && d.children.length === 0);
      window._setView(id); await new Promise(r => setTimeout(r, 900));
      const m = document.querySelector('main');
      return { view: localStorage.getItem('grayco_view'), refused: toast(), text: m ? (m.innerText || '').length : 0, lock: !!(m && /Admin Access Required/.test(m.innerText || '')) };
    }, id).catch(e => ({ err: String(e.message || e).slice(0, 100) }));
    out[id] = r;
  }
  return out;
}

/* ── 1. the owner ── */
const W = await person(OWNER);
const adminTabs = await navIds(W);
ok(adminTabs.length > 20 && adminTabs.includes('admin') && adminTabs.includes('payroll'), 'owner: left menu has ' + adminTabs.length + ' tabs', adminTabs);
const projAll = await W.ev(() => (window._crm.projects || []).length);
await W.b.close();

/* ── 2. the office ── */
const O = await person(OFFICE);
const st = await O.ev(() => ({ full: window._gcFullAccess(), office: window._gcIsOfficeFull(), acc: window.__GC_SEC2.access(), state: window._gcOfficeFull && window._gcOfficeFull.state().office }));
ok(st.full && st.office && st.acc.office && st.acc.officeDb && !st.acc.admin, 'office: _gcFullAccess / SEC2 office + officeDb, not admin', st.acc);
const offTabs = await navIds(O);
const missing = adminTabs.filter(x => !offTabs.includes(x)), extra = offTabs.filter(x => !adminTabs.includes(x));
ok(!missing.length && !extra.length, 'office: the same left menu as the owner (' + offTabs.length + ' tabs)', { missing, extra });
const walked = await walk(O, adminTabs);
const bad = Object.keys(walked).filter(k => !walked[k] || walked[k].err || walked[k].view !== k || walked[k].refused || walked[k].lock);
ok(!bad.length, 'office: every admin tab opens (' + Object.keys(walked).length + ')', bad.map(k => [k, walked[k]]));
const money = await O.ev(() => {
  const S = window.__GC_SEC2, P = (window._crm.projects || []);
  return { allowed: ['admin', 'payroll', 'pnl', 'taxcenter', 'invoices', 'payments', 'expenses', 'reports', 'cctrans', 'qbimport', 'officemanager'].filter(v => !window._gcViewAllowed(v)),
    canCash: S.can('gc_accounts_ledger', 'read') && S.can('gc_cash_anchor', 'write') && S.can('gc_commission_structures', 'read') && S.can('users_private', 'read') && S.can('gc_overhead_manual', 'write'),
    noHr: !S.can('candidates', 'read') && !S.can('users_private', 'write') && !S.can('gc_team_settings', 'write') && !S.can('gc_automation_pause', 'write'),
    cash: localStorage.getItem('gc_cash_anchor'), ledger: localStorage.getItem('gc_accounts_ledger'),
    commission: (function(){ try { var j = P.find(p => p && p.pm); return window._gcJobCommission(j, 0, 0) !== null; } catch (e) { return 'err ' + e.message; } })(),
    projects: P.length, vault: window.__GC_ADMIN_KV && window.__GC_ADMIN_KV.state };
});
ok(!money.allowed.length, 'office: Admin, Payroll, P&L, Accounting, invoices, payments, expenses, reports … all allowed', money.allowed);
ok(money.canCash && money.noHr, 'office: reads / changes the money keys; hiring, pay records, team roles, data-entry mode stay admin', money);
ok(/12345/.test(money.cash || '') && /Owner draw/.test(money.ledger || ''), 'office: the cash vault loaded (cash on hand, the bank movements / owner draws)', { vault: money.vault });
ok(money.commission === true, 'office: commission figures are not hidden', money.commission);
ok(money.projects === projAll && projAll > 0, 'office: all ' + projAll + ' projects', money.projects);
/* ⚙ Admin as the office */
const adm = await O.ev(async () => {
  window._setView('admin'); await new Promise(r => setTimeout(r, 2500));
  const m = document.querySelector('main'), vis = b => !!(b.offsetParent);
  const btn = t => [...m.querySelectorAll('button')].filter(b => vis(b) && (b.textContent || '').trim() === t).length;
  const hub = document.getElementById('gc-adm-hub');
  return { lock: /Admin Access Required/.test(m.innerText), add: btn('+ Add Employee'), edit: btn('EDIT'), del: btn('🗑'), dis: btn('Disable'),
    hub: !!hub, teamRow: /Team access/.test(hub ? hub.innerText : ''), security: /Security & system check/.test(hub ? hub.innerText : ''),
    sections: window._gcAdm && window._gcAdm.sections ? window._gcAdm.sections().map(s => s.id) : [], text: m.innerText.length };
});
const rows = await O.ev(() => (window._gcAdm.sections() || []).reduce((a, s) => a.concat(s.rows.map(r => r.t)), []));
ok(!adm.lock && adm.text > 500, 'office: ⚙ Admin opens', { text: adm.text });
ok(!adm.add && !adm.edit && !adm.del && !adm.dis, 'office: no + Add Employee / EDIT / Disable / 🗑 on the team list', adm);
ok(!adm.sections.includes('security') && !rows.some(t => /^(Team access|Backups|Import a backup|Make the cloud the truth|Storage|Offboarding|Hiring)/.test(t)), 'office: no Team access / backups / restore / storage / Security card in Admin settings', { sections: adm.sections });
ok(rows.some(t => /^Pay structures|^Overhead/.test(t)) && adm.sections.includes('pay'), 'office: the pay / money settings are there', rows.filter(t => /Pay|Overhead/.test(t)));
const d0 = O.dialogs.length;
await O.ev(() => { try { window._gcTeamAccess(); } catch (e) {} });
await sleep(500);
ok(O.dialogs.slice(d0).some(d => /Team access is for admins/.test(d)) && !(await O.ev(() => !!document.getElementById('gcTaAdd'))), 'office: 💎 Team access stays with the admins', O.dialogs.slice(d0));
/* the job's automations */
const pid = await O.ev(() => { const p = (window._crm.projects || []).find(p => p && p.id && !/lost|cancel/i.test(p.status || '') && /active|progress|approved|scheduled/i.test(p.status || '')) || window._crm.projects[0]; return p.id; });
const ja = await O.ev(async pid => {
  const ov = window._gcJA.open(pid); await new Promise(r => setTimeout(r, 300));
  const more = ov && ov.querySelector('.gcof-more'); if (!more) return { more: false };
  const cbs = [...more.querySelectorAll('input[data-gcof-k]')];
  const t = more.querySelector('input[data-gcof-k="drawInvoices"]'); const was = t.checked;
  t.click(); await new Promise(r => setTimeout(r, 1500));
  const p = window._crm.projects.find(x => String(x.id) === String(pid));
  /* the JA box itself: turn the thank-you e-mail off and save for this job */
  const ty = ov.querySelector('input[type="checkbox"][data-k="thankYou"]');
  let jaSaved = null;
  if (ty) { ty.click(); ov.querySelector('.gcja-save').click(); await new Promise(r => setTimeout(r, 1500)); const q = window._crm.projects.find(x => String(x.id) === String(pid)); jaSaved = !!(q && q.auto && q.auto.updatedAt); }
  else { ov.remove(); }
  return { more: true, n: cbs.length, enabled: cbs.filter(x => !x.disabled).length, was, now: p && p.autoX && p.autoX.drawInvoices, by: p && p.autoX && p.autoX.by, jaSaved, tyFound: !!ty };
}, pid);
ok(ja.more && ja.n === 8 && ja.enabled === 8, 'office: the job\'s ⚙ Automations has "More for this job" (8 switches, all hers)', ja);
ok(ja.was === true && ja.now === false, 'office: turning "Draw invoices" off is saved on the job (project.autoX)', ja);
ok(ja.jaSaved === true || !ja.tyFound, 'office: the job\'s automatic e-mails (JA box) saved for this job', ja);
const posted = O.posts(0).filter(x => /"key":"projects/.test(x.body.slice(0, 40)) || (x.keys || []).some(k => /^projects/.test(k)));
ok(posted.length > 0, 'office: the job change went to the cloud (' + posted.length + ' project write(s))');
const defs = await O.ev(async () => { const ov = window._gcJobAutoDefaults.open(); await new Promise(r => setTimeout(r, 300)); const has = !!(ov && ov.querySelector('.gcja-save')); if (ov) ov.remove(); return has; });
ok(defs, 'office: ⚡ Automation defaults can be saved by her');
ok(!O.errs.length, 'office: no page errors', O.errs.slice(0, 5));
await O.b.close();

/* ── 3. a PM ── */
const P = await person(PM);
const pmTabs = await navIds(P);
const pm = await P.ev(async pid => {
  const out = { full: window._gcFullAccess(), office: window._gcIsOfficeFull(), allowed: ['admin', 'payroll', 'pnl'].filter(v => window._gcViewAllowed(v)),
    cash: window.__GC_SEC2.can('gc_accounts_ledger', 'read'), vault: localStorage.getItem('gc_cash_anchor') };
  const ov = window._gcJA.open(pid); await new Promise(r => setTimeout(r, 300));
  const more = ov && ov.querySelector('.gcof-more'); out.more = !!more; out.enabled = more ? [...more.querySelectorAll('input[data-gcof-k]')].filter(x => !x.disabled).length : -1;
  if (ov) ov.remove();
  window._setView('admin'); await new Promise(r => setTimeout(r, 1200)); out.view = localStorage.getItem('grayco_view');
  return out;
}, pid);
ok(!pmTabs.includes('admin') && !pmTabs.includes('payroll') && !pmTabs.includes('pnl'), 'PM: no ⚙ Admin / Payroll / P&L in the menu', pmTabs);
ok(!pm.full && !pm.office && !pm.allowed.length && !pm.cash && !pm.vault, 'PM: no full access, no money screens, no cash records', pm);
ok(pm.more && pm.enabled === 0, 'PM: "More for this job" is read-only', pm);
ok(pm.view !== 'admin', 'PM: ⚙ Admin does not open', pm.view);
await P.b.close();
console.log('OFFICEFULL browser: ' + (fails ? 'FAIL (' + fails + ')' : 'PASS'));
process.exit(fails ? 1 : 0);
