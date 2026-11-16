// saves_lib.mjs — SAVES: shared helpers for the data-save tests (test_SAVES*.mjs). Offline: harness_SAVES.mjs (in-memory
// "database" behind stubbed Supabase / Storage / Netlify functions). Made-up data only.
//   device(kind, email)   kind 'phone' (iPhone 390x844, touch → GrayCo Field) | 'desk' (1440x900 → Desk)
//   seed()                the standard made-up company (users, one active job, a lead, a customer, today's schedule)
//   cloudWait(fn, ms)     poll the stub DB (node side) until fn() is truthy
//   R(entry, dev, step, ok, info)   one result cell; table() prints entry × device → pass/fail (and writes GC_SAVES_OUT)
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const H = await import(pathToFileURL(process.env.GC_HARNESS_SAVES || path.join(HERE, 'harness_SAVES.mjs')).href);
export const sleep = H.sleep;
export const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/saves/shots/';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
export const BUILD = path.resolve(process.argv[2] || '.');
export const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });   /* the browsers run on Chicago time */
export const ago = d => new Date(Date.now() - d * 864e5).toISOString();
export const arr = v => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; };
export const find = (key, id) => arr(H.cget(key)).find(r => r && r.id === id);

let pass = 0, fail = 0;
export function ok(c, m, info){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } return !!c; }
export const counts = () => ({ pass, fail });

/* entry × device → { step: ok } */
const CELLS = {}; const ORDER = [];
export function R(entry, dev, step, c, info){
  const k = entry + '\u0000' + dev; if (!CELLS[k]) { CELLS[k] = { entry, dev, steps: {} }; ORDER.push(k); }
  CELLS[k].steps[step] = !!c;
  ok(c, '[' + entry + ' · ' + dev + '] ' + step, info);
  return !!c;
}
export function table(title){
  const rows = ORDER.map(k => CELLS[k]);
  const w = Math.max(18, ...rows.map(r => r.entry.length)) + 2;
  console.log('\n' + (title || 'SAVES') + ' — entry point × device (db = reached the database, other = another device shows it, reload = still there after a reload)');
  console.log('  ' + 'entry point'.padEnd(w) + 'device'.padEnd(8) + 'result  steps');
  rows.forEach(r => { const all = Object.values(r.steps).every(Boolean); console.log('  ' + r.entry.padEnd(w) + r.dev.padEnd(8) + (all ? 'PASS    ' : 'FAIL    ') + Object.entries(r.steps).map(([s, v]) => (v ? '' : '✗') + s).join(' ')); });
  const out = process.env.GC_SAVES_OUT;
  if (out) { try { const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : []; fs.writeFileSync(out, JSON.stringify(prev.concat(rows.map(r => ({ group: title, entry: r.entry, dev: r.dev, steps: r.steps }))), null, 1)); } catch (e) {} }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
}

export const PEOPLE = [
  { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
  { id: 'u3', name: 'Nick Gray', email: 'ngray@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550103' },
  { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true, phone: '9015550102' },
  { id: 'u4', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true },
  { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u6', name: 'Demo Crew', email: 'crew@grayco-cs.com', role: 'Crew', payType: 'hourly', payRate: 20, active: true },
  { id: 'u7', name: 'Demo Mit Tech', email: 'mit@grayco-cs.com', role: 'Mitigation Tech', payType: 'hourly', payRate: 22, active: true, companies: ['mitigation'] },
  { id: 'u8', name: 'Demo Env Tech', email: 'env@grayco-cs.com', role: 'Environmental Tech', payType: 'hourly', payRate: 24, active: true, companies: ['environmental'] }];
export function seed(extra){
  H.resetCloud();
  H.cset('users', PEOPLE);
  H.cset('projects', [
    { id: 'P1', name: 'Demo Kitchen', client: 'Pat Demo', address: '123 Demo St, Memphis, TN', pm: 'Wesley Johnson', status: 'active', type: 'Remodel', contract: 20000, contractSigned: true, autoPO: 'K101', company: 'GrayCo', customerId: 'C1', createdAt: ago(20), updatedAt: ago(2), savedAt: ago(2) },
    { id: 'P3', name: 'Demo Water Loss', client: 'Sam Sample', address: '41 Flood Ct, Memphis, TN', pm: 'Demo Mit Tech', status: 'active', type: 'Water Damage', company: 'GrayCo Mitigation', companyId: 'mitigation', isInsurance: true, claimNumber: 'DEMO-CLM-1', contract: 7000, contractSigned: true, autoPO: 'W303', createdAt: ago(4), updatedAt: ago(1), savedAt: ago(1) },
    { id: 'P4', name: 'Demo Tile Abatement', client: 'Ash Sample', address: '8 Fiber Ln, Memphis, TN', pm: 'Demo Env Tech', status: 'active', type: 'Asbestos Abatement', company: 'GrayCo Environmental', companyId: 'environmental', contract: 5000, contractSigned: true, autoPO: 'E404', createdAt: ago(6), updatedAt: ago(1), savedAt: ago(1) },
    { id: 'P2', name: 'Lee Bath', client: 'Lee Sample', address: '9 Sample Ave, Memphis, TN', pm: 'Demo PM', status: 'active', type: 'Bath', contract: 9000, contractSigned: true, autoPO: 'B202', createdAt: ago(30), updatedAt: ago(3), savedAt: ago(3) }]);
  H.cset('customers', [{ id: 'C1', name: 'Pat Demo', phone: '9015550111', email: 'pat@demo.test', address: '123 Demo St, Memphis, TN', updatedAt: ago(5) }]);
  H.cset('leads', [{ id: 'L1', name: 'Robin Sample', phone: '9015550122', address: '77 Test Rd, Memphis, TN', stage: 'new', source: 'Website', createdAt: ago(1), updatedAt: ago(1) }]);
  H.cset('schedule', [{ id: 'S1', pid: 'P1', date: TODAY, title: 'Demo day', assignee: 'Wesley Johnson', type: 'work', updatedAt: ago(1) }]);
  H.cset('schedule', arr(H.cget('schedule')).concat([{ id: 'S3', pid: 'P3', date: TODAY, title: 'Drying check', assignee: 'Demo Mit Tech', type: 'work' }, { id: 'S4', pid: 'P4', date: TODAY, title: 'Abatement day', assignee: 'Demo Env Tech', type: 'work' }]));
  H.cset('gc_claims', [{ id: 'CLM1', projectId: 'P3', pid: 'P3', companyId: 'mitigation', title: 'Demo Water Loss', phase: 'mitigation', kind: 'water', jobType: 'water', mitigation: true, lossType: 'Water', claimNumber: 'DEMO-CLM-1', lossDate: ago(4).slice(0, 10), createdAt: ago(4), updatedAt: ago(1) }]);
  H.cset('estimates', []);
  H.cset('invs', []); H.cset('expenses', []);
  H.cset('gc_office_tasks', JSON.stringify([]));
  for (const [k, v] of Object.entries(extra || {})) H.cset(k, v);
}

const EMAIL = { phone: 'wjohnson@grayco-cs.com', desk: 'office@grayco-cs.com' };
/* one device: a fresh browser context (= another computer / phone), signed in, the app up */
export async function device(kind, email, opt){
  opt = opt || {};
  const A = await H.computer(kind + ':' + (email || EMAIL[kind]), Object.assign({ build: BUILD, mobile: kind === 'phone' }, opt));
  const signed = await H.signIn(A, email || EMAIL[kind], 20000);
  if (!signed) console.log('  (sign-in did not finish for ' + kind + ')');
  await H.waitFor(A, () => !!(window._crm && Array.isArray(window._crm.projects) && window._crm.projects.length), null, 30000);
  if (kind === 'phone') await H.waitFor(A, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 30000);
  await sleep(opt.settle || 2500);
  A.kind = kind;
  return A;
}
export async function reload(A){
  await A.page().reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await H.waitFor(A, () => !!(window._crm && Array.isArray(window._crm.projects) && window._crm.projects.length), null, 40000);
  if (A.kind === 'phone') await H.waitFor(A, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 30000);
  await sleep(2500);
}
export async function cloudWait(fn, ms){
  const t0 = Date.now(); ms = ms || 30000; let v;
  while (Date.now() - t0 < ms) { try { v = fn(); } catch (e) { v = undefined; } if (v) return v; await sleep(400); }
  return v;
}
/* the page's own copy of a list (memory, then IndexedDB) */
export function pageList(A, key){
  return A.ev(async k => {
    const m = { invs: 'invoices' }; let v = window._crm && window._crm[m[k] || k];
    if (!Array.isArray(v) || !v.length) { try { v = await window.idbGet(k); } catch (e) {} }
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} }
    return Array.isArray(v) ? v : [];
  }, key);
}
/* wait for a record to show on a device (its synced copy), pulling as a person would by changing tabs */
export async function pageWait(A, key, id, pred, ms){
  const t0 = Date.now(); ms = ms || 45000; let last = null, nudged = 0;
  while (Date.now() - t0 < ms) {
    const l = await pageList(A, key).catch(() => []); last = l.find(r => r && r.id === id) || null;
    if (last && (!pred || pred(last))) return last;
    if (Date.now() - t0 > 6000 * (nudged + 1)) { nudged++; await A.ev(() => { try { window.dispatchEvent(new Event('focus')); } catch (e) {} }).catch(() => {}); }
    await sleep(700);
  }
  return pred ? null : last;
}
export async function shot(A, name){ try { await A.page().screenshot({ path: SHOTS + 'saves_' + name + '.png' }); } catch (e) {} }
export async function closeAll(list){ for (const A of list) { try { await A.close(); } catch (e) {} } }

/* the Desk's sidebar, like a person: click the tab by its label (a panel's shade in the way is closed first) */
export async function navDesk(A, label){
  const pg = A.page();
  await A.ev(() => { document.querySelectorAll('#gcl-shade').forEach(x => { try { x.click(); } catch (e) {} }); });
  await pg.keyboard.press('Escape').catch(() => {});
  const b = pg.locator('aside button, aside a').filter({ hasText: label }).first();
  await b.click({ timeout: 8000 }).catch(async () => { await b.click({ force: true, timeout: 5000 }).catch(() => {}); });
  await sleep(1800);
}
/* the estimate builder: 📐 Estimates → ＋ New estimate → type the job → "+ Add line" per line (it saves by itself) */
export async function estNew(A, name, lines){
  const pg = A.page();
  await navDesk(A, 'Estimates');
  await H.waitFor(A, () => !!document.getElementById('gc-est3-list') || !!document.getElementById('ej-name'), null, 20000);
  const nb = pg.locator('button:visible', { hasText: /New estimate|＋ New/ }).first();
  if (await nb.count()) await nb.click(); else console.log('  (no ＋ New estimate button)');
  await H.waitFor(A, () => { const e = document.getElementById('ej-name'); return !!(e && e.offsetParent); }, null, 20000);
  await sleep(1200);
  await pg.fill('#ej-name', name); await pg.fill('#ej-address', '55 Estimate Ln, Memphis, TN');
  for (const l of lines) { await pg.fill('#nl-desc', l.desc); await pg.fill('#nl-cost', String(l.cost)); await pg.fill('#nl-qty', String(l.qty)); await pg.click('#gc-est-wrap button:has-text("+ Add line"):visible'); await sleep(400); }
  await pg.click('#ej-notes').catch(() => {});
}
export const estSavedText = A => A.ev(() => (document.getElementById('gc-rp-saved') || {}).textContent || '');
/* open one from the list by its name (the row's Open button) */
export async function estOpen(A, name){
  const pg = A.page();
  await navDesk(A, 'Estimates');
  await H.waitFor(A, n => { const l = document.getElementById('gc-est3-list'); return !!(l && l.innerText.indexOf(n) >= 0); }, name, 20000);
  const row = pg.locator('#gc-est3-list .r', { hasText: name }).first();
  if (!(await row.count())) return false;
  const o = row.locator('button[data-ac="open"]').first();
  if (await o.count()) await o.click(); else await row.click();
  return !!(await H.waitFor(A, n => { const e = document.getElementById('ej-name'); return !!(e && e.offsetParent && e.value === n); }, name, 20000));
}
