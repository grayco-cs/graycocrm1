// part F of test_QBCSV.mjs — the CRM side in Chromium: index.html's own scripts (the 📁 Document Uploader + patch QBCSV) in a stubbed page.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PWDIR = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function run({ ok, BUILD, SHOTS, PROJ, FX, block }){
  const S_DOC = block(/Document Uploader — upload any file/), S_QB = block(/__GC_PATCH_QBCSV__ — /);
  ok('F0 index.html has the Document Uploader and patch QBCSV scripts', S_DOC.length > 2000 && S_QB.length > 20000);
  const { chromium } = require(PWDIR);
  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: 'block' });
  await ctx.route('**/*', r => new URL(r.request().url()).host === 'crm.test' ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main></main></body></html>' }) : r.fulfill({ status: 404, body: '' }));
  const P = await ctx.newPage(); const errs = []; P.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  const shot = async n => { if (SHOTS) await P.screenshot({ path: path.join(SHOTS, n + '.png') }).catch(() => {}); };
  await P.goto('https://crm.test/');
  const seedInvs = [{ id: 'INVold1', type: 'sub', pid: '', sub: 'Demo Electric Co', invNum: '700', amt: 500, desc: 'QuickBooks bill #700 — panel at 9 Pine Ln', source: 'quickbooks', qbKey: 'QB:bill:700:demo', status: 'paid', paid: true, date: '2026-09-01', recvDate: '2026-09-01', noSend: true, importedHistory: true },
    { id: 'INVhand', type: 'client', pid: 'PJ2', client: 'Mary Jones', invNum: '1001', amt: 900, status: 'sent', date: '2026-09-02' }];
  await P.evaluate(([projects, invs]) => {
    const IDB = {}; window.idbGet = async k => IDB[k]; window.idbSet = async (k, v) => { IDB[k] = v; }; window.__IDB = IDB;
    window._crm = { projects, invs: invs.slice(), invoices: invs.slice(), expenses: [], users: [], subs: [], vendors: [{ id: 'V1', name: 'Demo Lumber Yard' }] };
    window._setInvoices = l => { window._crm.invs = l; window._crm.invoices = l; };
    window._setExpenses = l => { window._crm.expenses = typeof l === 'function' ? l(window._crm.expenses) : l; };
    window._supaUpsertNow = () => Promise.resolve(true);
    const KV = {}; window.__KV = KV; window._gcOT_kv = { get: k => KV[k], put: (k, v) => { KV[k] = JSON.parse(JSON.stringify(v)); } };
    window.__ROLE = 'Office'; window._gcMeUser = () => ({ name: window.__ROLE === 'Office' ? 'Brittany Demo' : 'Crew Demo', role: window.__ROLE, email: 'demo@grayco-cs.com' });
    /* patch J's doors (the older importer) as they are when patch QBCSV loads */
    window.__oldOpen = 0; window._gcQbCsvOpen = async () => { window.__oldOpen++; return { old: true }; }; window._gcOpenQbCsvImport = () => { window.__oldPick = 1; };
    window.confirm = () => true; window.alert = m => { window.__alert = String(m); };
  }, [PROJ, seedInvs]);
  await P.addScriptTag({ content: S_DOC });
  await P.addScriptTag({ content: S_QB });
  ok('F1 the patch loads with no page errors; patch J\'s door + Upload Documents are wrapped', await P.evaluate(() => !!(window._gcQbCsvImport && window._gcOpenDocUploader.__qbcsv && window._gcQbCsvOpen.__qbcsv)) && !errs.length, errs);

  /* 📁 Upload Documents → a CSV */
  await P.evaluate(() => window._gcOpenDocUploader());
  ok('F2 Upload Documents (office) says a QuickBooks CSV needs no job, with a 📊 button', await P.evaluate(() => !!document.querySelector('[data-qbcsv-tip] [data-qbcsv-pick]')));
  await shot('qbcsv_uploader');
  await P.setInputFiles('#_duInput', { name: 'quickbooks-october.csv', mimeType: 'text/csv', buffer: Buffer.from(FX('transaction_list.csv')) });
  await P.waitForSelector('#_gcQbCsvOv tbody tr[data-i]', { timeout: 8000 });
  ok('F3 choosing the CSV there opens 📊 Import from QuickBooks CSV (no job asked; the uploader closes)', await P.evaluate(() => !document.querySelector('#_duJob') && document.querySelectorAll('#_gcQbCsvOv tbody tr[data-i]').length === 12));
  await shot('qbcsv_preview');
  const pre = await P.evaluate(() => ({ go: document.querySelector('#_gcQbCsvOv [data-go]').textContent, note: document.querySelector('#_gcQbCsvOv [data-note]').textContent, job: [...document.querySelectorAll('#_gcQbCsvOv [data-job]')].map(i => i.value) }));
  ok('F4 the preview: date · type · # · name · memo · amount · job (filled from the memo) · what happens; Import N', /^Import \d+ rows$/.test(pre.go) && /new/.test(pre.note) && pre.job[0].indexOf('Smith Roof Replacement') >= 0 && pre.job.some(v => /Baker Water Loss · 450 Elm St · Mitigation/.test(v)), pre);
  /* pick the job for the ambiguous bill 85390 (John Smith has two jobs) */
  const n0 = await P.evaluate(() => +document.querySelector('#_gcQbCsvOv [data-go]').textContent.replace(/\D/g, ''));
  await P.evaluate(() => { const tr = [...document.querySelectorAll('#_gcQbCsvOv tr[data-i]')].find(t => /85390/.test(t.textContent)); const inp = tr.querySelector('[data-job]'); const lab = [...document.querySelectorAll('#qbcJobs option')].map(o => o.value).find(v => /Smith Garage/.test(v)); inp.value = lab; inp.dispatchEvent(new Event('change', { bubbles: true })); });
  const n1 = await P.evaluate(() => +document.querySelector('#_gcQbCsvOv [data-go]').textContent.replace(/\D/g, ''));
  ok('F5 the job picker (type to search) on an ambiguous row → the row is now imported (count +1), "picked by you"', n1 === n0 + 1 && await P.evaluate(() => /picked by you/.test([...document.querySelectorAll('#_gcQbCsvOv tr[data-i]')].find(t => /85390/.test(t.textContent)).textContent)), [n0, n1]);
  await P.click('#_gcQbCsvOv [data-go]');
  await P.waitForSelector('#_gcQbCsvOv [data-undo]', { timeout: 8000 });
  await shot('qbcsv_done');
  const s1 = await P.evaluate(() => ({ t: document.querySelector('#_gcQbCsvOv .qbc-card').textContent, invs: window._crm.invs, exp: window._crm.expenses, kv: window.__KV, last: window._gcQbLastImport }));
  const b85390 = s1.invs.find(x => x.invNum === '85390'), cost = s1.exp.find(x => x.subInvId === (b85390 || {}).id);
  ok('F6 Import → "N added to M jobs · … already · … left out" + ↩ Undo', /added to \d+ jobs/.test(s1.t) && /left out/.test(s1.t) && s1.last.added >= 7, s1.t);
  ok('F7 records land where the CRM keeps them: the bill in Sub Invoices on Smith Garage with its job cost row; the invoice on Smith Roof part-paid by the payment; costs in Expenses',
    b85390 && b85390.pid === 'PJ4' && b85390.type === 'sub' && b85390.source === 'quickbooks' && cost && cost.pid === 'PJ4' && s1.invs.find(x => x.invNum === '5001').status === 'partial' && s1.exp.some(x => x.checkNo === '1102' && x.pid === 'PJ2'), { b85390, cost });
  ok('F8 the memo → job she picked is remembered in the cloud (gc_qb_memo_jobs: "john smith" → Smith Garage) and the batch is kept for Undo', s1.kv.gc_qb_memo_jobs && s1.kv.gc_qb_memo_jobs['john smith'] && s1.kv.gc_qb_memo_jobs['john smith'].pid === 'PJ4' && Array.isArray(s1.kv.gc_qbcsv_batches) && s1.kv.gc_qbcsv_batches[0].id === s1.last.importId, s1.kv.gc_qb_memo_jobs);
  await P.click('#_gcQbCsvOv [data-x]');

  /* the same file again → nothing new; the remembered memo fills the job */
  await P.evaluate(t => { window.__p2 = window._gcQbCsvImport.open(t, 'again.csv'); }, FX('transaction_list.csv'));
  await P.waitForSelector('#_gcQbCsvOv tbody tr[data-i]', { timeout: 8000 });
  const again = await P.evaluate(() => ({ go: document.querySelector('#_gcQbCsvOv [data-go]').textContent, note: document.querySelector('#_gcQbCsvOv [data-note]').textContent }));
  ok('F9 importing the SAME file again: 0 new, nothing to import (all "up to date / already in the CRM")', /^0 new · 0 updates/.test(again.note) && /Nothing to import/.test(again.go), again);
  await P.click('#_gcQbCsvOv [data-x]');

  /* undo */
  const before = await P.evaluate(() => ({ n: window._crm.invs.length, e: window._crm.expenses.length }));
  const u = await P.evaluate(id => window._gcQbCsvImport.undo(id), s1.last.importId);
  const after = await P.evaluate(() => ({ n: window._crm.invs.length, e: window._crm.expenses.length, inv1001: window._crm.invs.find(x => x.id === 'INVhand') }));
  ok('F10 ↩ Undo removes that import\'s records and restores what it changed', u.ok && after.n === 2 && after.e === 0 && before.n > 2, { u, before, after });

  /* patch J's doors */
  await P.evaluate(t => { window.__pj = window._gcQbCsvOpen(t, 'list.csv'); }, 'Customer Contact List\n\nCustomer,Phone Numbers,Email,Full Name\nDemo Person,555,d@x.test,Demo Person\n');
  await sleep(400);
  ok('F11 the older 💎 Import from QuickBooks (CSV): a contact list still goes to patch J; transactions come here', await P.evaluate(() => window.__oldOpen === 1 && !document.querySelector('#_gcQbCsvOv')));
  await P.evaluate(t => { window._gcQbCsvOpen(t, 'tx.csv'); }, FX('bill_list.csv'));
  await P.waitForSelector('#_gcQbCsvOv tbody tr[data-i]', { timeout: 8000 });
  const bl = await P.evaluate(() => [...document.querySelectorAll('#_gcQbCsvOv tr[data-i]')].map(t => t.textContent + ' | ' + (t.querySelector('[data-job]') || {}).value));
  ok('F12 … a Bill List through the old door → this preview; bill 85400 (Customer:Job "Smith Garage") is on Smith Garage', bl.length === 3 && bl.some(t => /85400/.test(t) && /Smith Garage/.test(t)) && await P.evaluate(() => window.__oldOpen === 1));
  await P.click('#_gcQbCsvOv [data-x]');

  /* 🔗 QuickBooks ↔ CRM: the old bill with no job */
  await P.evaluate(() => window._gcQbCheck.open());
  await P.waitForSelector('#_gcQbCheckOv tbody tr[data-i]', { timeout: 8000 });
  await shot('qbcsv_check');
  const ck = await P.evaluate(() => ({ rows: [...document.querySelectorAll('#_gcQbCheckOv tbody tr')].map(t => t.textContent), go: document.querySelector('#_gcQbCheckOv [data-go]').textContent }));
  ok('F13 🔗 QuickBooks ↔ CRM lists the no-job bill with its QB # and the suggested job (9 Pine Ln → Smith Garage), ticked', ck.rows.length === 1 && /QB #700/.test(ck.rows[0]) && /Put 1 on their job/.test(ck.go) && await P.evaluate(() => /Smith Garage/.test(document.querySelector('#_gcQbCheckOv [data-job]').value)), ck);
  await P.click('#_gcQbCheckOv [data-go]');
  await P.waitForSelector('#_gcQbCheckOv [data-undo]', { timeout: 8000 });
  const ap = await P.evaluate(() => ({ b: window._crm.invs.find(x => x.id === 'INVold1'), c: window._crm.expenses.find(x => x.subInvId === 'INVold1') }));
  ok('F14 Apply → the bill is on its job (history kept: noSend) and gets its job cost row (paid) for the P&L', ap.b.pid === 'PJ4' && ap.b.noSend === true && /picked by/.test(ap.b.linkedBy) && ap.c && ap.c.pid === 'PJ4' && ap.c.status === 'paid' && ap.c.amt === 500, ap);
  await P.click('#_gcQbCheckOv [data-undo]'); await sleep(500);
  ok('F15 … ↩ Undo puts it back (no job, no cost row)', await P.evaluate(() => window._crm.invs.find(x => x.id === 'INVold1').pid === '' && !window._crm.expenses.some(x => x.subInvId === 'INVold1')));
  await P.evaluate(() => { const o = document.getElementById('_gcQbCheckOv'); if (o) o.remove(); });

  /* the QB # badge */
  const bd = await P.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window._gcQbBadge({ source: 'quickbooks', type: 'sub', desc: 'QuickBooks bill #85378 — x' }); document.body.appendChild(d); window.__copied = ''; navigator.clipboard && (navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }); window.confirm = () => false; d.firstChild.click(); return { h: d.innerHTML, c: window.__copied }; });
  ok('F16 the QB # badge: "QB #85378", a click copies the number', /QB #85378/.test(bd.h) && bd.c === '85378', bd);

  /* crew: refused, a CSV in Upload Documents stays a document */
  await P.evaluate(() => { window.__ROLE = 'Crew'; window.__alert = ''; });
  const cr = await P.evaluate(() => window._gcQbCsvImport.open('x', 'x.csv'));
  ok('F17 crew: the import refuses ("for admins and the office")', cr.refused === true && await P.evaluate(() => /admins and the office/.test(window.__alert)));
  await P.evaluate(() => window._gcOpenDocUploader());
  await P.setInputFiles('#_duInput', { name: 'list.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n') });
  await sleep(300);
  ok('F18 crew: Upload Documents has no QuickBooks tip and a CSV is just a document to upload to the job', await P.evaluate(() => !document.querySelector('[data-qbcsv-tip]') && !document.querySelector('#_gcQbCsvOv') && /list\.csv/.test(document.querySelector('#_duList').textContent)));
  ok('F19 no page errors', !errs.length, errs);
  await browser.close();
}
