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
  const QBF = { calls: [], mode: 'ok' }; const FAKEREF = n => 'sb:crm-files/' + require('crypto').createHash('sha256').update('pdf-' + n).digest('hex') + '.pdf';
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/.netlify/functions/qb-proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://appcenter.intuit.test/connect/oauth2?client_id=abc&x=1' }) });
    if (u.pathname === '/.netlify/functions/qb-files') {
      const b = JSON.parse(r.request().postData() || '{}'), h = r.request().headers(); QBF.calls.push({ op: b.op, n: (b.items || []).length, tok: h['x-qb-token'], method: r.request().method() });
      if (QBF.mode === 'expired') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, notConnected: true, reason: 'expired', error: 'The QuickBooks sign-in on this computer has expired — connect again.' }) });
      const results = (b.items || []).map(it => it.num === '85390' ? { key: it.key, ok: true, id: '901', memo: '', lines: [{ desc: 'panel', customer: 'Smith, John:Smith Garage', amount: 900 }], files: [{ ref: FAKEREF(it.num), name: 'bill-' + it.num + '.pdf', type: 'application/pdf', size: 900, hash: FAKEREF(it.num).slice(13, 77) }], text: '' }
        : it.num || it.kind === 'expense' ? { key: it.key, ok: true, id: 'Q' + (it.num || it.date), memo: '', lines: [], files: [{ ref: FAKEREF(it.num || it.date), name: (it.num || it.date) + '.pdf', type: 'application/pdf', size: 100, hash: FAKEREF(it.num || it.date).slice(13, 77) }], text: '' } : { key: it.key, ok: false, error: 'not found in QuickBooks' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, results }) });
    }
    return u.host === 'crm.test' ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main></main></body></html>' }) : r.fulfill({ status: 404, body: '' });
  });
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
  /* QB # badges on the CRM's own screens (any list that shows the description) */
  const g = await P.evaluate(async () => {
    const box = document.createElement('div'); box.id = 'fakeInvoices'; box.innerHTML = '<table><tr><td class="d">QuickBooks bill #85378 — ROUGH IN</td><td>$1,800.00</td></tr><tr><td class="d2">Sub Invoice: QuickBooks invoice #5001 — PO P1001</td></tr><tr><td class="d3">Kitchen draw 2</td></tr></table><input value="QuickBooks bill #9">';
    document.body.appendChild(box); await new Promise(r => setTimeout(r, 1200));
    const a = box.querySelector('.d .gc-qbnum'), b = box.querySelector('.d2 .gc-qbnum'), c = box.querySelector('.d3 .gc-qbnum');
    box.querySelector('.d').firstChild.nodeValue = 'QuickBooks bill #85999 — reused row'; window._gcQbDecorate();
    return { a: a && a.textContent, b: b && b.textContent, c: !!c, n: box.querySelectorAll('.gc-qbnum').length, re: [...box.querySelectorAll('.d .gc-qbnum')].map(x => x.textContent) };
  });
  ok('G1 a list showing "QuickBooks bill #85378 — …" gets a "QB #85378" badge (once; never on plain rows / inputs)', g.a === 'QB #85378' && g.b === 'QB #5001' && !g.c, g);
  ok('G2 a row React re-uses for another record gets the right badge (the old one removed)', g.re.length === 1 && g.re[0] === 'QB #85999', g.re);
  ok('F19 no page errors', !errs.length, errs);

  /* ═════ I. 📎 QuickBooks PDFs (read-only link) ═════ */
  await P.evaluate(() => { window.__ROLE = 'Office'; window._crm.invs = window._crm.invs.filter(x => !/^INVQ/.test(x.id)); window._crm.invoices = window._crm.invs; window._crm.expenses = []; window._crm.projectDocs = []; window.__IDB.invs = window._crm.invs; window.__IDB.expenses = []; window.__KV.gc_qb_memo_jobs = {}; localStorage.removeItem('gc_qb_memo_jobs'); window._gcQbCsvImport.memo.map = {}; localStorage.removeItem('gc_qb_read_tokens'); window.open = () => ({ location: {}, close(){} }); });
  await P.evaluate(t => { window._gcQbCsvImport.open(t, 'oct.csv'); }, FX('transaction_list.csv'));
  await P.waitForSelector('#_gcQbCsvOv [data-qbconnect]', { timeout: 8000 });
  ok('I1 not connected: said plainly, with 🔗 Connect QuickBooks (read-only); the import still works', await P.evaluate(() => /not connected on this computer/.test(document.querySelector('#_gcQbCsvOv [data-qbpdf]').textContent) && !document.querySelector('#_gcQbCsvOv [data-go]').disabled));
  await P.click('#_gcQbCsvOv [data-qbconnect]'); await sleep(300);
  await P.evaluate(() => { localStorage.setItem('gc_qb_tokens', 'x'); window.gcQB._receiveTokens({ access_token: 'acc', refresh_token: 'ref', realmId: '4620', expires_in: 3600 }); });
  await P.waitForSelector('#_gcQbCsvOv [data-pdfon]', { timeout: 5000 });
  const tk = await P.evaluate(() => ({ r: JSON.parse(localStorage.getItem('gc_qb_read_tokens') || 'null'), q: localStorage.getItem('gc_qb_tokens') }));
  ok('I2 Connect → the read-only sign-in is kept for PDFs only (gc_qb_read_tokens); QuickBooks sync stays off (patch NOQB\'s key untouched by it)', tk.r && tk.r.realmId === '4620' && tk.r.readOnly === true && tk.q === 'x', tk);
  await P.click('#_gcQbCsvOv [data-findjobs]');
  await P.waitForFunction(() => /found a job from QuickBooks/.test((document.querySelector('#_gcQbCsvOv [data-pdfmsg]') || {}).textContent || ''), null, { timeout: 15000 }).catch(async e => { console.log('DBG', await P.evaluate(() => (document.querySelector('#_gcQbCsvOv [data-qbpdf]') || {}).innerHTML), JSON.stringify(QBF.calls), errs); });
  const fj = await P.evaluate(() => { const tr = [...document.querySelectorAll('#_gcQbCsvOv tr[data-i]')].find(t => /85390/.test(t.textContent)); return { job: tr.querySelector('[data-job]').value, why: tr.textContent }; });
  ok('I3 🔎 Find jobs from QuickBooks: bill 85390 (memo "John Smith" = two jobs) → the QuickBooks line\'s Customer:Job → Smith Garage', /Smith Garage/.test(fj.job) && /line customer/.test(fj.why), fj);
  await P.click('#_gcQbCsvOv [data-go]');
  await P.waitForFunction(() => /PDFs? from QuickBooks attached/.test((document.querySelector('#_gcQbCsvOv [data-pdfprog]') || {}).textContent || ''), null, { timeout: 20000 });
  await shot('qbcsv_pdfs');
  const pd = await P.evaluate(() => ({ t: document.querySelector('#_gcQbCsvOv [data-pdfprog]').textContent, b: window._crm.invs.find(x => x.invNum === '85390'), docs: window._crm.projectDocs, last: window._gcQbLastImport }));
  ok('I4 after Import the PDFs come from QuickBooks onto the records (files) and the job\'s documents (Sub Invoices on Smith Garage)', /attached/.test(pd.t) && pd.b && pd.b.files && pd.b.files[0].ref.indexOf('sb:crm-files/') === 0 && pd.docs.some(d => d.pid === 'PJ4' && d.cat === 'Sub Invoices' && d.ref === pd.b.files[0].ref), pd);
  const n2 = await P.evaluate(b => window._gcQbLink.attach([{ list: 'invs', id: b.id, files: b.files }], ''), pd.b);
  ok('I5 the same PDF again → not attached twice (record or job documents)', n2 === 0 && await P.evaluate(() => window._crm.projectDocs.length) === pd.docs.length, n2);
  const qcalls = QBF.calls.slice();
  ok('I6 only read-only lookups were asked of QuickBooks (op lookup, the read-only token), paced in small batches', qcalls.length >= 2 && qcalls.every(c => c.op === 'lookup' && c.tok === 'acc' && c.n <= 5), qcalls);
  const un = await P.evaluate(id => window._gcQbCsvImport.undo(id), pd.last.importId);
  ok('I7 ↩ Undo also takes that import\'s PDFs off the job documents', un.ok && await P.evaluate(() => window._crm.projectDocs.length === 0), un);
  await P.click('#_gcQbCsvOv [data-x]').catch(() => {});
  QBF.mode = 'expired';
  const ex = await P.evaluate(() => window._gcQbLink.lookupAll([{ key: 'a', kind: 'bill', num: '1' }]));
  ok('I8 an expired QuickBooks sign-in → stopped with plain words ("expired — connect again")', ex.stop && /expired/.test(ex.stop.error), ex);
  QBF.mode = 'ok';

  /* ═════ H. 💳 card / bank lines → job suggestions (patch MONEY + STMTPDF + QBCSV in the same page) ═════ */
  const S_MONEY = block(/__GC_PATCH_MONEY__ — MONEY IN BY ITSELF/), S_STMT = block(/__GC_PATCH_STMTPDF__ — PDF STATEMENTS/);
  await P.evaluate(() => {
    window.__ROLE = 'Office';
    window._crm.users = [{ name: 'Steven Demo', email: 'steven@grayco-cs.com', role: 'Crew', active: true }, { name: 'Pat Manager', email: 'pat@grayco-cs.com', role: 'Project Manager', active: true }];
    window._crm.projects.forEach(p => { p.city = 'Demo City'; });
    window._crm.projects.push({ id: 'PJT', name: 'Lakeview Deck', client: 'Ann Lake', address: '5 Shore Rd, Lakeview, TN', city: 'Lakeview', autoPO: 'P7007', status: 'active' });
    window._crm.schedule = [{ id: 'S1', pid: 'PJ2', date: '2026-11-03', assignee: 'Steven Demo', title: 'cabinets' }];
    window._crm.expenses = [{ id: 'E-old', pid: 'PJ3', vendor: 'DEMO RENTALS', amt: 210, date: '2026-10-20', status: 'paid' }];
    window.__IDB.timesheets = [{ id: 'T1', user: 'steven@grayco-cs.com', date: '2026-11-04', clockIn: '07:00', clockOut: '15:00', pid: 'PJ1' }];
    window._gcCards = async () => [{ id: 'c1', name: 'Demo Visa ••1111', last4: '1111', active: true }];
    window.__KV.gc_card_holders = { c1: { person: 'Steven Demo' } };
  });
  await P.addScriptTag({ content: S_MONEY }); await P.addScriptTag({ content: S_STMT });
  await P.evaluate(() => { window._gcCardHolders && window._gcCardHolders.holderOf('x'); });
  await sleep(300);
  await P.evaluate(async () => { localStorage.removeItem('gc_card_holders'); });
  const H = await P.evaluate(async () => {
    /* warm the caches (holders from the cloud, cards, timesheets) */
    window._gcCardHolders.refresh(); await new Promise(r => setTimeout(r, 400));
    const a = window._gcJobsOnDate('c1', '2026-11-03'), b = window._gcJobsOnDate('Steven Demo', '2026-11-04'), c = window._gcJobsOnDate('1111', '2026-11-09');
    const s1 = window._gcCardSuggest({ vendor: 'THE HOME DEPOT #4410 DEMO CITY TN', desc: 'THE HOME DEPOT #4410 DEMO CITY TN', date: '2026-11-03', amount: 84.12, cardId: 'c1' }, { pid: '' });
    const s2 = window._gcCardSuggest({ vendor: 'LOWES #22 LAKEVIEW TN', desc: 'LOWES #22 LAKEVIEW TN', date: '2026-11-10', amount: 40, cardId: '' }, { pid: '' });
    const s3 = window._gcCardSuggest({ vendor: 'DEMO RENTALS', desc: 'DEMO RENTALS', date: '2026-11-05', amount: 220, cardId: '' }, { pid: '' });
    const s4 = window._gcCardSuggest({ vendor: 'GAS N GO', desc: 'GAS N GO', memo: 'P1004 truck fuel', date: '2026-11-05', amount: 60 }, { pid: '' });
    return { a, b, c, s1, s2, s3, s4 };
  });
  ok('H1 _gcJobsOnDate(card, date): the card\'s holder (👤 Card holders) was SCHEDULED on Jones Kitchen that day', H.a.length === 1 && H.a[0].pid === 'PJ2' && /Steven was scheduled at 77 Maple Cove that day/.test(H.a[0].why), H.a);
  ok('H2 … and CLOCKED IN (Timesheets) on Smith Roof the next day; a day with nothing → nothing', H.b[0] && H.b[0].pid === 'PJ1' && /clocked in at 1234 Oak Ridge Dr/.test(H.b[0].why) && H.c.length === 0, [H.b, H.c]);
  ok('H3 a card charge with no job anywhere in the text → the job the holder was on that day, with the reason, picked (≥ 80 %)', H.s1.pid === 'PJ2' && H.s1.conf >= 80 && /Steven was scheduled/.test(H.s1.why) && H.s1.alts.length >= 1, H.s1);
  ok('H4 the store\'s town (LOWES … LAKEVIEW TN) = the only open job there → suggested (not picked by itself, under 80 %)', H.s2.alts[0] && H.s2.alts[0].pid === 'PJT' && /Lakeview/.test(H.s2.alts[0].why) && !H.s2.pid, H.s2);
  ok('H5 the same merchant at a similar amount went to a job before → suggested with the reason', H.s3.alts[0] && H.s3.alts[0].pid === 'PJ3' && /went to this job/.test(H.s3.alts[0].why), H.s3);
  ok('H6 a PO in the memo still wins (P1004 → Smith Garage)', H.s4.pid === 'PJ4', H.s4);
  /* the 💳 card statement import itself */
  await P.evaluate(() => window._gcOpenCardImport && window._gcOpenCardImport());
  await sleep(500);
  const hasImp = await P.evaluate(() => !!document.querySelector('[data-c="paste"]'));
  if (hasImp) {
    await P.evaluate(() => { const ta = document.querySelector('[data-c="paste"]'); ta.value = 'Transaction Date,Description,Amount\n11/03/2026,THE HOME DEPOT #4410 DEMO CITY TN,-84.12\n11/10/2026,LOWES #22 LAKEVIEW TN,-40.00\n11/12/2026,PAYMENT THANK YOU,500.00\n'; document.querySelector('[data-c="read"]').click(); });
    await sleep(900);
    const im = await P.evaluate(() => { const rows = [...document.querySelectorAll('tr[data-r]')]; return rows.map(tr => ({ job: tr.querySelector('[data-c="job"]').value, alts: [...tr.querySelectorAll('[data-c="alt"]')].map(b => b.textContent), why: tr.children[6] ? tr.children[6].textContent : '' })).concat([{ all: !!document.querySelector('[data-c="altall"]') }]); });
    await shot('qbcsv_cardimport');
    ok('H7 💳 Import card statement: the Home Depot line comes in on Jones Kitchen (who had the card that day) with the reason; the Lowe\'s line offers "→ Lakeview Deck" (one tap)', im[0].job === 'PJ2' && /Steven was scheduled/.test(im[0].why) && im[1].job === '' && im[1].alts.some(t => /Lakeview Deck/.test(t)), im);
    await P.evaluate(() => { [...document.querySelectorAll('tr[data-r]')][1].querySelector('[data-c="alt"]').click(); });
    ok('H8 one tap on a suggestion puts the line on that job', await P.evaluate(() => [...document.querySelectorAll('tr[data-r]')][1].querySelector('[data-c="job"]').value === 'PJT'));
  } else ok('H7 the card import window opened', false);
  ok('H9 no page errors (MONEY + STMTPDF + QBCSV together)', !errs.length, errs);
  await browser.close();
}
