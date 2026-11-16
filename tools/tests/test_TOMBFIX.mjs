// test_TOMBFIX.mjs <build-dir> — patch TOMBFIX in the offline browser harness (made-up data; the 21 MB cloud delete list is
// generated here in the 11/12 shape: 26.8k "payrollProfiles:gid…-gid…-N-gid…" entries + ~2.9k real ones).
// Computer A starts the way the office computers are: localStorage ~5.1 M of ~5.24 M characters (rolling backups gc_bak_*, an
// old quick-start delete list, other entries), the cloud holds the 21 MB list, and the payroll profile list carries 2,000 old
// copies of one person's stub with runaway ids. Checked:
//  1. the CRM opens; the 21 MB list is never written to localStorage; no "storage full" refusals; LS use drops (gc_bak_* → IndexedDB)
//  2. the cloud list is written back clean (no auto payroll-profile ids, every real entry kept) by the app's own upload
//  3. deleted leads / projects / invoices stay deleted (A, after a reload, and on a fresh computer B)
//  4. a new lead / project / invoice saves (IndexedDB + cloud) and is there after a reload and on B
//  5. payroll profiles: one per person, the real pay kept, no auto ids, none lost
// Usage: node test_TOMBFIX.mjs <dir with index.html>   (run under the scratchpad browser lock)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const build = path.resolve(process.argv[2] || '.');
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
let pass = 0, fail = 0;
const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); } };
const EMAIL = 'wjohnson@grayco-cs.com';
const NOW = Date.now(), DAY = 864e5, iso = t => new Date(t).toISOString(), at = iso(NOW - 5 * DAY);

/* ── the synthetic world ── */
function djb(s){ let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'gid' + (h >>> 0).toString(36); }
const PAT = 'Pat Example';
const FP = djb([PAT, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].join('|'));
const SFP = djb('s|' + ['', '', '', '', '', '', '', '', '', '', '', '', '', PAT, '', '', '', '', ''].join('|'));
function runawayIds(){
  const ids = [FP, FP + '-' + SFP];
  for (let n = 2; n <= 9016; n++) ids.push(FP + '-' + SFP + '-' + n);
  for (let n = 2; n < 57; n++) { let id = FP + '-' + SFP + '-' + n; for (let s = 1; s <= 212; s++) { if (s <= 112) ids.push(id + '-' + (s % 2 ? SFP : FP) + '-' + (s % 2 ? SFP : FP)); id += '-' + (s % 2 ? FP : SFP); ids.push(id); } }
  return ids;
}
const RUN = runawayIds();
const TOMB = {};
RUN.forEach(id => { TOMB['payrollProfiles:' + id] = '2026-11-12T13:40:38.933Z'; });
const N = { schedule: 1791, expenses: 362, projects: 161, estimates: 145, leads: 138, invs: 103, gcAcctRegister: 94, invoices: 81, payrollRuns: 20, vendors: 6, subs: 4 };
const REAL = [];
Object.keys(N).forEach(c => { for (let i = 0; i < N[c]; i++) { const k = c + ':ZZ' + c.slice(0, 3) + i.toString(36); TOMB[k] = i % 3 ? iso(NOW - (i % 30) * DAY) : NOW - (i % 30) * DAY; REAL.push(k); } });
const DEAD = { leads: 'LDEL1', projects: 'PDEL1', invs: 'IDEL1' };
Object.keys(DEAD).forEach(c => { TOMB[c + ':' + DEAD[c]] = iso(NOW - 2 * DAY); REAL.push(c + ':' + DEAD[c]); });
TOMB['payrollProfiles:PPu-left'] = iso(NOW - 3 * DAY); REAL.push('payrollProfiles:PPu-left');
const TOMB_TXT = JSON.stringify(TOMB);

const USERS = [
  { id: 'u-wesley', name: 'Wesley Johnson', email: EMAIL, role: 'Admin', payType: 'owner', active: true },
  { id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true, hourlyRate: 20, payType: 'hourly' },
  { id: 'u-pat', name: PAT, email: 'pat@example.test', role: 'Crew', active: true, hourlyRate: 24, payType: 'hourly' }];
const PROF = (u, o) => Object.assign({ id: 'PP' + u.id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 0, otAfter: 40, otMultiplier: 1.5, period: 'weekly', filing: 'single', state: 'TN', active: true, updatedAt: at }, o);
const PROFILES = [PROF(USERS[0], { payType: 'owner_draw' }), PROF(USERS[1], { hourlyRate: 20 }), PROF(USERS[2], { hourlyRate: 24, filing: 'married', extra: 15 })]
  .concat(RUN.slice(0, 2000).map((id, i) => ({ id, name: PAT, frequency: 'weekly', userId: i % 4 ? '' : 'u-pat' })))      /* old copies on a stale computer */
  .concat([{ name: PAT, frequency: 'weekly' }, { name: PAT, homeState: 'TN', state: 'TN' }]);                           /* two id-less stubs */
const P = (id, o) => Object.assign({ id, name: 'Zedd Job ' + id, address: id + ' Demo St', status: 'Active', createdAt: at, updatedAt: at }, o);
const PROJECTS = [P('P1'), P('P2'), P('P3'), P('PDEL1', { name: 'Zedd Deleted Job' })];
const L = (id, o) => Object.assign({ id, name: 'Zedd Lead ' + id, stage: 'New Lead', source: 'Referral', createdAt: at, updatedAt: at }, o);
const LEADS = [L('L1'), L('L2'), L('LDEL1', { name: 'Zedd Deleted Lead' })];
const I = (id, o) => Object.assign({ id, pid: 'P1', type: 'client', client: 'Zedd Client', amt: 1000, total: 1000, status: 'sent', date: '2026-11-01', createdAt: at, updatedAt: at }, o);
const INVS = [I('I1'), I('I2', { pid: 'P2' }), I('IDEL1', { client: 'Zedd Deleted Invoice' })];

function seedCloud(){
  H.resetCloud();
  H.cset('users', USERS); H.cset('projects', PROJECTS); H.cset('leads', LEADS); H.cset('invs', INVS); H.cset('invoices', INVS);
  H.cset('payrollProfiles', PROFILES); H.cset('gc_tombstones', TOMB);
}
/* a full localStorage, the way the office computers are (before the page's own scripts run, first load only) */
const OLD_LS_TOMB = {}; REAL.slice(0, 1500).forEach(k => { OLD_LS_TOMB[k] = TOMB[k]; });
const FILL = `(() => { try {
  if (localStorage.getItem('tf_filled')) return;
  const snap = (n, w) => JSON.stringify(Array.from({ length: 3 }, (_, v) => ({ at: '2026-11-1' + v + 'T10:00:00.000Z', count: n + v, data: Array.from({ length: n + v }, (_, i) => ({ id: 'Z' + i, name: 'Zedd row ' + i, pad: 'x'.repeat(w) })) })));
  localStorage.setItem('gc_bak_projects', snap(300, 1000));
  localStorage.setItem('gc_bak_leads', snap(280, 1000));
  localStorage.setItem('gc_bak_invs', snap(90, 900));
  localStorage.setItem('gc_bak_customers', snap(70, 900));
  localStorage.setItem('gc_tombstones', ${JSON.stringify(JSON.stringify(OLD_LS_TOMB))});
  localStorage.setItem('gc_dupes_removed', JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ from: 'expenses', id: 'D' + i, row: { id: 'D' + i, pad: 'y'.repeat(900) } }))));
  let used = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); used += k.length + (localStorage.getItem(k) || '').length; }
  const target = 5130000; let n = 0;
  while (used < target - 1000) { const sz = Math.min(200000, target - used - 20); const k = 'zz_tf_fill_' + (n++); localStorage.setItem(k, 'f'.repeat(sz)); used += k.length + sz; }
  localStorage.setItem('tf_filled', String(used));
  window.__tfFilled = used;
} catch (e) { window.__tfFillErr = String(e); } })();`;

const lsInfo = A => A.ev(() => { let chars = 0, keys = 0, tomb = 0, bak = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k) || ''; chars += k.length + v.length; keys++; if (k === 'gc_tombstones') tomb = v.length; if (/^gc_bak_/.test(k)) bak += v.length; } return { chars, keys, tomb, bak, runaway: /payrollProfiles:gid/.test(localStorage.getItem('gc_tombstones') || '') }; });
const guard = A => A.ev(() => { try { const s = window._gcLsGuard.state(); return { count: s.count, refused: s.refused, keys: s.events.map(e => e.key + (e.ok ? '+' : '-')) }; } catch (e) { return null; } });
const lists = A => A.ev(() => { const c = window._crm || {}; const ids = l => (Array.isArray(l) ? l : []).map(x => x && x.id); return { projects: ids(c.projects), leads: ids(c.leads), invs: ids(c.invoices) }; });
const idbIds = (A, k) => A.ev(k => window.idbGet(k).then(v => (Array.isArray(v) ? v : []).map(x => x && x.id)), k);
async function ready(A){ return H.waitFor(A, () => (window._crm && (window._crm.projects || []).length >= 3 && (window._crm.leads || []).length >= 2 && typeof window._gcPayrollProfiles === 'function') || null, null, 90000); }
const cloudTomb = () => { const v = H.cget('gc_tombstones'); return typeof v === 'string' ? JSON.parse(v) : (v || {}); };

seedCloud();
console.log('    cloud gc_tombstones: ' + Object.keys(TOMB).length + ' entries, ' + (TOMB_TXT.length / 1e6).toFixed(1) + ' M characters; payrollProfiles: ' + PROFILES.length + ' rows');
const A = await H.computer('A', { build, init: FILL });
let B = null;
try {
  await H.signIn(A, EMAIL, 20000);
  const filled = await A.ev(() => +localStorage.getItem('tf_filled') || null);
  await ready(A);
  const t0 = Date.now();
  ok(await A.ev(() => !!(window._crm && window._crm.projects)), '1. the CRM opens on a full browser storage with the 21 MB cloud list');
  const ls0 = await lsInfo(A);
  console.log('    localStorage right after sign-in: ' + JSON.stringify(ls0) + (filled ? ' (filled to ' + filled + ' before the page)' : ''));
  /* the sync, the clean write-back (25 s after the dirty read), the rolling backups (8 s) */
  await H.sleep(50000);
  const g = await guard(A), ls1 = await lsInfo(A), tf = await A.ev(() => window._gcTombFix ? window._gcTombFix.state() : null);
  console.log('    TOMBFIX: ' + JSON.stringify(tf));
  console.log('    LSGUARD: ' + JSON.stringify(g));
  console.log('    localStorage after ~1 min: ' + JSON.stringify(ls1));
  ok(g && !g.keys.some(k => /^gc_tombstones/.test(k)), '1. the delete list never hit "storage full"', g);
  ok(g && g.refused === 0, '1. no "storage full … not saved" at all', g);
  ok(ls1.tomb > 0 && ls1.tomb < 300000 && !ls1.runaway, '1. the quick-start delete list in localStorage is small (' + ls1.tomb + ' characters), no auto payroll ids', ls1);
  ok(ls1.bak === 0 && filled && ls1.chars < filled - 1000000, '1. rolling backups moved out of localStorage (' + filled + ' → ' + ls1.chars + ' characters)', { filled, ls0, ls1 });
  const bakIdb = await A.ev(() => window.idbGet('gc_bak_projects').then(v => Array.isArray(v) ? v.map(s => s.count) : null));
  ok(Array.isArray(bakIdb) && bakIdb.length >= 3 && bakIdb.includes(300), '1. …into IndexedDB, every old version kept (' + JSON.stringify(bakIdb) + ')', bakIdb);
  const ct = cloudTomb(), ctk = Object.keys(ct), ctLen = JSON.stringify(ct).length;
  ok(ctLen < 300000 && !ctk.some(k => /^payrollProfiles:gid/.test(k)), '2. the cloud delete list is written back clean: ' + ctk.length + ' entries, ' + ctLen + ' characters (from ' + TOMB_TXT.length + ')', { n: ctk.length, len: ctLen });
  const missing = REAL.filter(k => !(k in ct));
  ok(missing.length === 0, '2. …every real delete kept (' + REAL.length + ')', missing.slice(0, 5));
  const idbT = await A.ev(() => window.idbGet('gc_tombstones_all').then(v => v ? { n: Object.keys(v).length, run: Object.keys(v).filter(k => /^payrollProfiles:gid/.test(k)).length } : null));
  ok(!idbT || idbT.run === 0, '2. IndexedDB copy clean too', idbT);

  let li = await lists(A);
  ok(!li.leads.includes('LDEL1') && !li.projects.includes('PDEL1') && !li.invs.includes('IDEL1') && li.leads.includes('L1') && li.projects.includes('P1') && li.invs.includes('I1'), '3. deleted lead / job / invoice stay deleted; the others are there', li);

  /* 4. saves */
  await A.ev(() => { const now = new Date().toISOString();
    window.__GC_MANUAL_SAVE__ = true;
    window._setLeads(l => (l || []).concat([{ id: 'LNEW1', name: 'Zedd New Lead', stage: 'New Lead', source: 'Referral', createdAt: now, updatedAt: now }]));
    window._setProjects(l => (l || []).concat([{ id: 'PNEW1', name: 'Zedd New Job', address: '9 New St', status: 'Active', createdAt: now, updatedAt: now }]));
    window._setInvoices(l => (l || []).concat([{ id: 'INEW1', pid: 'P1', type: 'client', client: 'Zedd New Client', amt: 500, total: 500, status: 'draft', date: now.slice(0, 10), createdAt: now, updatedAt: now }]));
    setTimeout(() => { window.__GC_MANUAL_SAVE__ = false; }, 3000); });
  const cl = await (async () => { const t = Date.now(); let v; while (Date.now() - t < 45000) { const ids = k => (H.cget(k) || []).map(x => x && x.id); v = { leads: ids('leads').includes('LNEW1'), projects: ids('projects').includes('PNEW1'), invs: ids('invs').includes('INEW1') || ids('invoices').includes('INEW1') }; if (v.leads && v.projects && v.invs) return v; await H.sleep(1000); } return v; })();
  ok(cl.leads && cl.projects && cl.invs, '4. a new lead / job / invoice reach the cloud', cl);
  const idbS = { leads: (await idbIds(A, 'leads')).includes('LNEW1'), projects: (await idbIds(A, 'projects')).includes('PNEW1'), invs: (await idbIds(A, 'invs')).includes('INEW1') || (await idbIds(A, 'invoices')).includes('INEW1') };
  ok(idbS.leads && idbS.projects && idbS.invs, '4. …and this computer\'s IndexedDB', idbS);
  const g2 = await guard(A); ok(g2 && g2.refused === 0, '4. still no "storage full" refusal after the saves', g2);

  /* 5. payroll profiles */
  const pp = await A.ev(async () => { const l = await window._gcPayrollProfiles(); const by = {}; l.forEach(p => { if (p && p.name) (by[p.name] = by[p.name] || []).push({ id: p.id, rate: p.hourlyRate, filing: p.filing, extra: p.extra, freq: p.frequency, homeState: p.homeState }); }); return { n: l.length, by, auto: l.filter(p => p && /^gid/.test(String(p.id))).length }; });
  console.log('    payroll profiles: ' + JSON.stringify(pp).slice(0, 600));
  const ppAll = await A.ev(async () => (await window._gcPayrollProfiles()).map(p => [p.id, p.userId || '', p.name]));
  const uids = ppAll.map(x => x[1]).filter(Boolean);
  ok(pp.by[PAT] && pp.by[PAT].length === 1 && pp.auto === 0 && uids.length === new Set(uids).size && pp.n <= 8, '5. payroll profiles: one for ' + PAT + ' (from 2,005 rows), no auto ids, no two for one user (' + pp.n + ' in all)', ppAll);
  const pr = pp.by[PAT] && pp.by[PAT][0];
  ok(pr && pr.id === 'PPu-pat' && pr.rate === 24, '5. …the real profile kept its id and pay (24/h)', pr);
  /* not asserted: on a FRESH computer the start-up seed of a profile (updatedAt now) beats the cloud's older copy in the union —
     the same on origin/main in this harness (pre-existing, not this patch); noted for the record */
  console.log('    note: ' + PAT + ' W-4 after the fresh-computer seed: ' + JSON.stringify(pr && { filing: pr.filing, extra: pr.extra }));
  await H.sleep(6000);
  const cpp = H.cget('payrollProfiles') || [];
  ok(cpp.length <= 8 && !cpp.some(p => /^gid/.test(String(p && p.id))) && cpp.some(p => p.id === 'PPu-pat' && p.hourlyRate === 24), '5. the cloud payroll list is folded too (' + cpp.length + ' rows, no auto ids)', cpp.map(p => p.id));
  const ct2 = cloudTomb(); ok(Object.keys(ct2).filter(k => /^payrollProfiles:/.test(k)).length <= 3 && !Object.keys(ct2).some(k => /^payrollProfiles:gid/.test(k)), '5. folding the copies did not grow the delete list again', Object.keys(ct2).filter(k => /^payrollProfiles:/.test(k)));

  /* reload A */
  await A.page().reload({ waitUntil: 'domcontentloaded' }); await ready(A); await H.sleep(12000);
  li = await lists(A);
  ok(!li.leads.includes('LDEL1') && !li.projects.includes('PDEL1') && !li.invs.includes('IDEL1') && li.leads.includes('LNEW1') && li.projects.includes('PNEW1') && li.invs.includes('INEW1'), '3/4. after a reload: deleted stay deleted, the new ones are there', li);
  const g3 = await guard(A); ok(g3 && g3.refused === 0 && !g3.keys.some(k => /^gc_tombstones/.test(k)), '1. after a reload: no "storage full" refusal', g3);

  /* B: a fresh computer */
  B = await H.computer('B', { build });
  await H.signIn(B, EMAIL, 20000); await ready(B); await H.sleep(15000);
  const lb = await lists(B);
  ok(!lb.leads.includes('LDEL1') && !lb.projects.includes('PDEL1') && !lb.invs.includes('IDEL1') && lb.leads.includes('LNEW1') && lb.projects.includes('PNEW1') && lb.invs.includes('INEW1'), '3/4. computer B: deleted stay deleted, the new ones are there', lb);
  const lsB = await lsInfo(B); ok(lsB.tomb > 0 && lsB.tomb < 300000 && !lsB.runaway, 'computer B: small delete list (' + lsB.tomb + ' characters)', lsB);
  const ppB = await B.ev(async () => { const l = await window._gcPayrollProfiles(); return { n: l.length, pat: l.filter(p => p && p.name === 'Pat Example').map(p => [p.id, p.hourlyRate]) }; });
  ok(ppB.pat.length === 1 && ppB.pat[0][0] === 'PPu-pat' && ppB.pat[0][1] === 24, 'computer B: payroll profiles one per person, pay kept', ppB);
  const errs = A.errs.concat(B.errs).filter(e => !/ResizeObserver|Script error/.test(e));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
  console.log('    took ' + Math.round((Date.now() - t0) / 1000) + ' s after the first sign-in');
} catch (e) { fail++; console.log('FAIL exception ' + (e && e.stack || e)); }
finally { try { await A.close(); } catch (e) {} try { if (B) await B.close(); } catch (e) {} }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
