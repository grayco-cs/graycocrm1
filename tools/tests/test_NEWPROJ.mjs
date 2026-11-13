// test_NEWPROJ.mjs <build-dir> [shot-dir] — patch NEWPROJ (owner 11/13: "for office on invoices it's making her choose what job but she also
// needs to add project if an invoice has no project — this will only be for data entry"). Offline, made-up data only.
// The CRM side = index.html's OWN scripts (patch CC2 _gcSelfAddJob, patch INBOXNEWJOB, patch MONEY 📥 Needs a job, the Office Sub-Match
// window (_jobGuess), the 📁 Document Uploader, patch APX ✅ Approvals 📍 Job, patch NEWPROJ) in a page with small stubs for the CRM's
// lists (no harness_N: it was lost). The React ▥ Invoices "New Client Invoice" modal is stood in for by the same markup (re: <div><label>
// <select>) with a controlled-select stand-in that appends new jobs' options the way React does.
//  1. "➕ New project…" in each picker for the office (Office Admin) and an admin; never for the crew.
//  2. the form is prefilled from the invoice (customer, job name, address, company, status Completed/Active, contract = the total).
//  3. made through the normal path (_gcSelfAddJob → _setProjects: stamped, needsPm, auto-PO, company, the customer id), tagged
//     createdVia 'invoice-entry' + dataEntry; the invoice gets it (the picker's own change handler / 📥 Save / 📍 setJob).
//  4. "Did you mean …?" (address / customer / PO): Use this job assigns the existing one; a new one takes a second click.
//  5. Projects → 📝 Invoice entry (n) lists them; ✓ Reviewed.
import fs from 'fs'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const PWDIR = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright';
const { chromium } = require(PWDIR);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = re => { const i = html.search(re); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const S = {
  cc2: block(/patch CC2 \(__GC_PATCH_CC2__\)/), inj: block(/__GC_PATCH_INBOXNEWJOB__ ═/), money: block(/<script id="gc-patch-money">/), sm: block(/GrayCo Office Sub-Match \+ Queue Sync/),
  du: block(/Document Uploader — upload any file\(s\), choose the job/), apx: block(/<script id="gc-patch-apx">/), np: block(/__GC_PATCH_NEWPROJ__ ═/)
};
ok('0 index.html has the scripts (CC2, INBOXNEWJOB, MONEY, Sub-Match, Doc Uploader, APX, NEWPROJ)', Object.values(S).every(x => x.length > 1500), Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.length])));

const now = new Date().toISOString();
const PROJECTS = [
  { id: 'PRJA1', name: 'Demo Kitchen', client: 'Pat Demo', address: '123 Demo St, Memphis, TN', status: 'active', autoPO: 'K101', pm: 'Sam Demo', contract: 20000, createdAt: now },
  { id: 'PRJA2', name: 'Lee Bath Remodel', client: 'Lee Sample', address: '9 Sample Ave, Memphis, TN', status: 'completed', autoPO: 'B202', createdAt: now },
  { id: 'PRJA3', name: 'Office Build-out', client: 'Acme Test LLC', address: '50 Test Pkwy', status: 'bidding', autoPO: 'C303', createdAt: now }];
const USERS = [{ id: 'u1', name: 'Wes Admin', email: 'admin@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Brittany Office', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },
  { id: 'u3', name: 'Sam Demo', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u4', name: 'Carl Crew', email: 'crew@grayco-cs.com', role: 'Crew', active: true }];
const CUSTOMERS = [{ id: 'C_demo1', name: 'Pat Demo', phone: '901-555-0100', email: 'pat@demo.test', address: '123 Demo St, Memphis, TN' }, { id: 'C_new2', name: 'Riverside Test Church', phone: '901-555-0111', email: 'office@riverside.test', address: '' }];
const OLD = '2025-06-02';
const INVOICES = [
  { id: 'INVc1', type: 'client', client: 'Riverside Test Church', amt: 18450, invNum: '1042', desc: 'Fellowship hall roof', date: OLD, status: 'paid', pid: '' },
  { id: 'INVs1', type: 'sub', sub: 'Zedd Drywall LLC', amt: 2400, invNum: 'ZD-77', desc: 'Hang + finish — 77 Oak Hollow Cv', recvDate: OLD, status: 'received', pid: '' }];
const EXPENSES = [{ id: 'EXP1', vendor: 'Demo Lumber', amt: 512.4, desc: 'Lumber', date: OLD, status: 'pending', pid: '' }];
const BILL = { id: 'MM-np01', kind: 'supplier_invoice', at: '2025-05-20T15:00:00.000Z', from: 'billing@demo-paint.test', fromName: 'Demo Paint Co', subject: 'Invoice 5531', files: [],
  si: { payee: 'supplier', route: 'match', why: 'no job matched', top: [], read: { vendor: 'Demo Paint Co', total: 93.11, po: '', invoiceDate: '2025-05-20', invoiceNumber: '5531', jobName: 'Hollis Duplex', jobAddress: '88 Hollis Rd, Memphis, TN' } } };

const browser = await chromium.launch();
async function page(role){
  const C = await browser.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: 'block' });
  await C.route('**/*', r => new URL(r.request().url()).host === 'crm.test' ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"><main></main></div></body></html>' }) : r.fulfill({ status: 404, body: '' }));
  const P = await C.newPage(); const errs = []; P.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); P.on('dialog', d => d.dismiss().catch(() => {}));
  await P.goto('https://crm.test/');
  await P.evaluate(([role, projects, users, customers, invoices, expenses, bill]) => {
    const me = users.find(u => u.role === role);
    const IDB = {}; window.idbGet = async k => IDB[k]; window.idbSet = async (k, v) => { IDB[k] = v; }; window.__IDB = IDB;
    window.__UPS = []; window._supaUpsert = (k, v) => { window.__UPS.push([k, (v || []).length]); };
    window._graycoCustomers = customers;
    window._crm = { projects: projects.slice(), users, customers, invoices: invoices.slice(), expenses: expenses.slice(), leads: [], schedule: [] };
    const paint = () => { try { window.__repaint && window.__repaint(); } catch (e) {} };
    window._setProjects = f => { window._crm.projects = typeof f === 'function' ? f(window._crm.projects) : f; paint(); };
    window._setInvoices = f => { window._crm.invoices = typeof f === 'function' ? f(window._crm.invoices) : f; paint(); };
    window._setExpenses = f => { window._crm.expenses = typeof f === 'function' ? f(window._crm.expenses) : f; paint(); };
    window._setLeads = f => { window.__leads = typeof f === 'function' ? f(window.__leads || []) : f; };
    window._setSchedule = f => { window._crm.schedule = typeof f === 'function' ? f(window._crm.schedule) : f; };
    window._gcMeUser = () => me; window._gcMeNow = me;
    localStorage.setItem('grayco_user', me.name);
    window.__GC_AUTH__ = { isAdmin: () => role === 'Admin', email: () => me.email, session: () => ({ roleKnown: true, role: role === 'Admin' ? 'admin' : role === 'Office Admin' ? 'office' : 'crew', email: me.email }) };
    window._gcIsOfficeFull = () => role === 'Office Admin';
    window._gcCo = { list: () => [{ id: 'construction', short: 'Construction', icon: '🏗' }, { id: 'mitigation', short: 'Mitigation', icon: '💧' }, { id: 'environmental', short: 'Environmental', icon: '☢️' }], filter: () => 'all', valid: x => /^(construction|mitigation|environmental)$/.test(x) };
    localStorage.setItem('gc_mail_money_seed', JSON.stringify([bill]));
    window.__bill = bill;
  }, [role, PROJECTS, USERS, CUSTOMERS, INVOICES, EXPENSES, BILL]);
  for (const k of ['cc2', 'inj', 'money', 'sm', 'du', 'apx', 'np']) await P.addScriptTag({ content: S[k] }).catch(e => errs.push(k + ': ' + String(e.message).slice(0, 200)));
  /* ▥ Invoices → "New Client Invoice" (the React modal's markup: re = <div><label>…</label><select/input>) */
  await P.evaluate(() => {
    localStorage.setItem('grayco_view', 'invoices');
    const st = { pid: '', amt: '', client: '' };
    const main = document.querySelector('#root main');
    main.innerHTML = '<div style="position:fixed;inset:0;z-index:1000"><div id="invModal" style="background:#fff;width:560px;margin:30px auto;padding:12px"><b>New Client Invoice</b><div style="display:grid;grid-template-columns:1fr 1fr 1fr">' +
      '<div><label>PO # (Auto from Project)</label><input id="invPO"></div><div><label>Project</label><select id="invProj"><option value="">Select...</option></select></div><div><label>Amount</label><input id="invAmt" type="number" value="18450"></div>' +
      '<div><label>Bill To</label><input id="invBill" value="Riverside Test Church"></div><div><label>Description</label><input id="invDesc" value="Fellowship hall roof"></div><div><label>Invoice Date</label><input id="invDate" type="date" value="2025-06-02"></div></div>' +
      '<div><label>Unassigned sub invoice</label><select id="subAssign"><option value="">Assign...</option></select></div></div></div>';
    const sel = document.getElementById('invProj'), sa = document.getElementById('subAssign');
    const opts = el => { const have = new Set([...el.options].map(o => o.value)); window._crm.projects.forEach(p => { if (!have.has(p.id)) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name + (p.autoPO ? ' (' + p.autoPO + ')' : ''); el.appendChild(o); } }); };
    window.__repaint = () => { opts(sel); opts(sa); sel.value = st.pid; };
    window.__repaint();
    sel.addEventListener('change', e => { const p = window._crm.projects.find(x => x.id === e.target.value); st.pid = e.target.value; st.client = p ? p.client || '' : ''; window.__invState = Object.assign({}, st, { po: p ? p.autoPO : '' }); });
    sa.addEventListener('change', e => { window._setInvoices(l => l.map(iv => iv.id === 'INVs1' ? Object.assign({}, iv, { pid: e.target.value }) : iv)); });
  });
  await sleep(1800);
  return { P, C, errs };
}
const opts = (P, css) => P.evaluate(c => { const s = document.querySelector(c); return s ? [...s.options].map(o => o.value + '|' + o.textContent) : null; }, css);
const has = o => !!o && o.some(x => x.startsWith('__newjob|➕ New project…'));
async function pick(P, css){ await P.evaluate(c => { const s = document.querySelector(c); s.dispatchEvent(new Event('focusin', { bubbles: true })); }, css); await P.selectOption(css, '__newjob'); await P.waitForSelector('#gc-np-ov', { timeout: 5000 }); }
const formVals = P => P.evaluate(() => { const q = k => document.querySelector('#gc-np-ov [data-np="' + k + '"]'); return { cust: q('cust').value, name: q('name').value, addr: q('addr').value, co: q('co').value, status: q('status').value, contract: q('contract').value, po: q('po') ? q('po').value : null, dups: q('dups').innerText, ctx: document.querySelector('#gc-np-ov [role=dialog]').innerText.split('\n').slice(0, 3).join(' | ') }; });
const setF = (P, k, v) => P.evaluate(([k, v]) => { const el = document.querySelector('#gc-np-ov [data-np="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);

/* ════════ OFFICE (Brittany) ════════ */
{
  const { P, C, errs } = await page('Office Admin');
  /* 1. the pickers */
  const o1 = await opts(P, '#invProj'), o2 = await opts(P, '#subAssign');
  ok('1a office: ▥ New Client Invoice "Project" picker offers "➕ New project…" (right under "Select...")', has(o1) && o1[1].startsWith('__newjob'), o1 && o1.slice(0, 3));
  ok('1b office: ▥ the sub invoice "Assign..." picker offers it too', has(o2), o2 && o2.slice(0, 3));
  ok('1c office may create projects (_gcNewProjectCan)', await P.evaluate(() => window._gcNewProjectCan()));
  ok('1d the Project picker still shows "Select..." (adding the option changed nothing)', await P.evaluate(() => document.getElementById('invProj').value === ''));

  /* 2–3. a customer invoice from 2025 with no project */
  await pick(P, '#invProj');
  const f1 = await formVals(P);
  ok('2a the form is prefilled from the invoice: customer "Riverside Test Church", job name "Fellowship hall roof", Completed (an old invoice), contract $18,450 (the total), Construction',
    f1.cust === 'Riverside Test Church' && f1.name === 'Fellowship hall roof' && f1.status === 'completed' && +f1.contract === 18450 && f1.co === 'construction', f1);
  ok('2b the picker went back to "Select..." while the form is open (no stray "➕" value)', await P.evaluate(() => document.getElementById('invProj').value === ''));
  ok('2c the form says what it is for (Customer invoice · Riverside Test Church · $18,450.00)', /Customer invoice/.test(f1.ctx) && /18,450\.00/.test(f1.ctx), f1.ctx);
  if (SHOTS) await P.screenshot({ path: path.join(SHOTS, 'newproj_form.png') });
  await setF(P, 'addr', '400 Riverside Test Dr, Memphis, TN');
  await P.click('#gc-np-ov [data-np="ok"]'); await sleep(2200);
  const made = await P.evaluate(() => { const p = window._crm.projects.find(x => x.createdVia === 'invoice-entry'); return p ? JSON.parse(JSON.stringify(p)) : null; });
  ok('3a created through the normal path (_gcSelfAddJob): PRJ id, name, client, address, status completed, contract, auto-PO, stamped createdBy, office → needs a PM',
    made && /^PRJ/.test(made.id) && made.name === 'Fellowship hall roof' && made.client === 'Riverside Test Church' && made.address === '400 Riverside Test Dr, Memphis, TN' && made.status === 'completed' && made.contract === 18450 && /^[A-Z]\d{3}$/.test(made.autoPO) && made.createdBy === 'Brittany Office' && made.needsPm === true, made);
  ok('3b customer linked: customerId C_new2 (the Customers list record), phone + e-mail from it', made && made.customerId === 'C_new2' && made.clientPhone === '901-555-0111', made && [made.customerId, made.clientPhone]);
  ok('3c company tagged (companyId construction, companyIdBy), GrayCo origin', made && made.companyId === 'construction' && /invoice entry/.test(made.companyIdBy) && made.graycoOrigin === true && made.source === 'grayco', made && [made.companyId, made.companyIdBy, made.source]);
  ok('3d tagged for review: createdVia "invoice-entry" + dataEntry { kind client, customer, amount, invDate } + a 📝 note', made && made.dataEntry && made.dataEntry.via === 'invoice-entry' && made.dataEntry.kind === 'client' && made.dataEntry.amount === 18450 && made.dataEntry.invDate === '2025-06-02' && /^📝 Data-entry/.test(made.notes), made && [made.dataEntry, made.notes]);
  const inv = await P.evaluate(() => ({ sel: document.getElementById('invProj').value, st: window.__invState, form: !!document.getElementById('gc-np-ov') }));
  ok('3e the invoice gets it at once: the Project picker = the new job and the form\'s own change handler ran (pid, Bill To, PO)', made && inv.sel === made.id && inv.st && inv.st.pid === made.id && inv.st.client === 'Riverside Test Church' && inv.st.po === made.autoPO && !inv.form, inv);
  ok('3f in Projects (window._crm.projects) once, and pushed like the React Create (idbSet + _supaUpsert projects)', await P.evaluate(id => window._crm.projects.filter(p => p.id === id).length === 1 && Array.isArray(window.__IDB.projects) && window.__IDB.projects.some(p => p.id === id) && window.__UPS.some(u => u[0] === 'projects'), made && made.id));

  /* 4. duplicates: the sub invoice says 123 Demo St (Demo Kitchen) */
  await P.evaluate(() => { window._crm.invoices = window._crm.invoices.map(i => i.id === 'INVs1' ? Object.assign({}, i, { desc: 'Drywall — Pat Demo' }) : i); });
  const sa = await P.$('#subAssign'); await P.evaluate(() => { document.getElementById('subAssign').setAttribute('data-gcnp-json', JSON.stringify({ id: 'INVs1', kind: 'sub', vendor: 'Zedd Drywall LLC', customer: 'Pat Demo', memo: 'Drywall', address: '123 Demo Street, Memphis', amount: 2400, date: '2025-06-02' })); });
  await pick(P, '#subAssign');
  const f2 = await formVals(P);
  ok('4a "Did you mean …?": Demo Kitchen (same address · same customer) is listed with "Use this job"', /Did you mean/.test(f2.dups) && /Demo Kitchen/.test(f2.dups) && /same address/.test(f2.dups) && /same customer/.test(f2.dups), f2.dups);
  ok('4b a sub invoice: contract left empty (not a customer invoice), Completed', f2.contract === '' && f2.status === 'completed', f2);
  await P.click('#gc-np-ov [data-np="ok"]'); await sleep(300);
  const armed = await P.evaluate(() => ({ open: !!document.getElementById('gc-np-ov'), btn: document.querySelector('#gc-np-ov [data-np="ok"]').textContent, n: window._crm.projects.length }));
  ok('4c Create with a close match does NOT create: the button turns into "Create a NEW project anyway" (an extra click)', armed.open && /NEW project anyway/.test(armed.btn) && armed.n === 4, armed);
  await P.click('#gc-np-ov [data-np-use="PRJA1"]'); await sleep(1500);
  const used = await P.evaluate(() => ({ pid: (window._crm.invoices.find(i => i.id === 'INVs1') || {}).pid, n: window._crm.projects.length, open: !!document.getElementById('gc-np-ov') }));
  ok('4d "Use this job" → the sub invoice is on Demo Kitchen (its picker\'s own handler); no new project', used.pid === 'PRJA1' && used.n === 4 && !used.open, used);
  /* a duplicate on purpose: two clicks */
  await P.evaluate(() => { window._crm.invoices = window._crm.invoices.map(i => i.id === 'INVs1' ? Object.assign({}, i, { pid: '' }) : i); document.getElementById('subAssign').value = ''; });
  await pick(P, '#subAssign'); await setF(P, 'name', 'Pat Demo garage'); await setF(P, 'status', 'active');
  await P.click('#gc-np-ov [data-np="ok"]'); await sleep(150); await P.click('#gc-np-ov [data-np="ok"]'); await sleep(2200);
  const dup = await P.evaluate(() => { const p = window._crm.projects.find(x => x.name === 'Pat Demo garage'); return { p: p && { status: p.status, client: p.client, cid: p.customerId, via: p.createdVia, kind: p.dataEntry && p.dataEntry.kind }, pid: (window._crm.invoices.find(i => i.id === 'INVs1') || {}).pid, id: p && p.id }; });
  ok('4e second click makes it (Active, customer Pat Demo → C_demo1, dataEntry kind sub) and the sub invoice is on it', dup.p && dup.p.status === 'active' && dup.p.cid === 'C_demo1' && dup.p.via === 'invoice-entry' && dup.p.kind === 'sub' && dup.pid === dup.id, dup);

  /* 📥 Needs a job (patch MONEY + INBOXNEWJOB) */
  await P.evaluate(() => { try { window._gcMoney.process([window.__bill], {}); } catch (e) { window.__perr = String(e); } });
  await sleep(400);
  const nj = await P.evaluate(() => (window._gcMoney.needs() || []).some(x => x.id === 'MM-np01'));
  if (nj) {
    await P.evaluate(() => window._gcMoney.openNeeds()); await sleep(500);
    const css = '.gc-money-ov select[data-m="job"]';
    const o3 = await opts(P, css);
    ok('5a 📥 Needs a job: the job picker offers "➕ New project…" (one option — INBOXNEWJOB\'s now opens this form)', has(o3) && o3.filter(x => x.startsWith('__newjob')).length === 1, o3 && o3.slice(0, 4));
    await pick(P, css);
    const f3 = await formVals(P);
    ok('5b prefilled from the bill: job "Hollis Duplex", address 88 Hollis Rd, Supplier bill · Demo Paint Co · $93.11, Completed (May 2025)', f3.name === 'Hollis Duplex' && /^88 Hollis Rd/.test(f3.addr) && /Supplier bill/.test(f3.ctx) && /Demo Paint Co/.test(f3.ctx) && /93\.11/.test(f3.ctx) && f3.status === 'completed', f3);
    await P.click('#gc-np-ov [data-np="ok"]'); await sleep(2500);
    const r3 = await P.evaluate(() => { const p = window._crm.projects.find(x => x.name === 'Hollis Duplex'); const e = (window._crm.expenses || []).find(x => x.mailId === 'MM-np01'); const row = document.querySelector('.gc-money-ov [data-i]'); return { p: p && p.id, via: p && p.createdVia, e: e && e.pid, row: row && row.innerText }; });
    ok('5c made + booked right away (📥 Save): the bill is an expense on the new job, the row says ✓ Saved', r3.p && r3.via === 'invoice-entry' && r3.e === r3.p && /Saved/.test(r3.row || ''), r3);
    await P.evaluate(() => { const o = document.querySelector('.gc-money-ov'); if (o) o.remove(); });
  } else ok('5 📥 Needs a job lists the seeded bill', false, await P.evaluate(() => window.__perr || 'not listed'));

  /* Assign Sub to Job (_jobGuess) */
  await P.evaluate(() => { localStorage.setItem('gc_sub_approvals', JSON.stringify([{ invId: 'INVs1', pid: '', sub: 'Zedd Drywall LLC', amt: 2400, desc: 'Hang + finish', status: 'needs_office_match', jobGuessName: '' }])); window._crm.invoices = window._crm.invoices.map(i => i.id === 'INVs1' ? Object.assign({}, i, { pid: '', desc: 'Hang + finish — 77 Oak Hollow Cv' }) : i); });
  await P.evaluate(() => window._gcOpenSubMatch('INVs1')); await sleep(300);
  const o4 = await opts(P, '#_smJob');
  ok('6a Assign Sub to Job (the _jobGuess window): "➕ New project…"', has(o4), o4 && o4.slice(0, 3));
  await pick(P, '#_smJob'); const f4 = await formVals(P);
  ok('6b prefilled from the sub invoice: Sub invoice · Zedd Drywall LLC · $2,400.00, job "Hang + finish — 77 Oak Hollow Cv"', /Sub invoice/.test(f4.ctx) && /Zedd Drywall/.test(f4.ctx) && f4.name === 'Hang + finish — 77 Oak Hollow Cv', f4);
  await P.click('#gc-np-ov [data-np="ok"]'); await sleep(2200);
  const r4 = await P.evaluate(() => { const p = window._crm.projects.find(x => x.name === 'Hang + finish — 77 Oak Hollow Cv'); return { p: p && p.id, sel: (document.getElementById('_smJob') || {}).value }; });
  ok('6c made and chosen in the window (Confirm sends it to the PM)', r4.p && r4.sel === r4.p, r4);
  await P.evaluate(() => { const b = document.getElementById('_smCancel'); if (b) b.click(); });

  /* 📁 Upload Documents */
  await P.evaluate(() => window._gcOpenDocUploader()); await sleep(300);
  const o5 = await opts(P, '#_duJob');
  ok('7 📁 Upload Documents "Which job?": "➕ New project…" (at the end; the first job stays chosen)', has(o5) && o5[o5.length - 1].startsWith('__newjob') && await P.evaluate(() => document.getElementById('_duJob').value !== '__newjob'), o5 && o5.slice(-2));
  await P.evaluate(() => { const o = document.getElementById('_duClose'); if (o) o.click(); });

  /* ✅ Approvals 📍 Job (patch APX) — the list with the option, then the record gets the job */
  await P.evaluate(() => { document.querySelector('#root main').insertAdjacentHTML('beforeend', '<div class="apx-row" data-k="exp:EXP1"><div class="apx-jpw" data-apx-jpw="exp:EXP1"><input class="apx-jpi"><div class="apx-jpl"><button type="button" class="apx-jpo" data-apx-jpp="PRJA1">Demo Kitchen</button></div></div></div>'); });
  await sleep(1800);
  const apx = await P.evaluate(() => { const b = document.querySelector('.apx-jpl [data-gcnp-apx]'); return b ? b.textContent : null; });
  ok('8a ✅ Approvals 📍 Job pick: "➕ New project…" at the top of the job list', apx === '➕ New project…', apx);
  await P.evaluate(() => { document.querySelector('.apx-jpl').remove(); });   /* the window closed: the record gets it directly */
  await P.evaluate(() => { const l = document.createElement('div'); l.className = 'apx-jpl'; l.innerHTML = '<button type="button" data-gcnp-apx="exp:EXP1">x</button>'; document.querySelector('.apx-jpw').appendChild(l); l.firstChild.click(); });
  await P.waitForSelector('#gc-np-ov'); const f5 = await formVals(P);
  ok('8b prefilled from the expense: Expense / receipt · Demo Lumber · $512.40', /Expense/.test(f5.ctx) && /Demo Lumber/.test(f5.ctx) && /512\.40/.test(f5.ctx), f5.ctx);
  await setF(P, 'name', 'Lumber yard job'); await P.evaluate(() => document.querySelector('.apx-jpl').remove());
  await P.click('#gc-np-ov [data-np="ok"]'); await sleep(1500);
  const r5 = await P.evaluate(() => { const p = window._crm.projects.find(x => x.name === 'Lumber yard job'); return { p: p && p.id, e: (window._crm.expenses.find(x => x.id === 'EXP1') || {}).pid }; });
  ok('8c the expense is charged to the new project', r5.p && r5.e === r5.p, r5);

  /* the API for other patches (QuickBooks CSV import pickers) */
  const api = await P.evaluate(() => { let got = null; const pr = window._gcNewProjectFor({ kind: 'qb', customer: 'Q Test Co', memo: 'Q Test Co:Warehouse roof', amount: 990, date: '2024-03-01', source: 'quickbooks' }, p => { got = p.id; }); return new Promise(r => setTimeout(() => { const q = k => document.querySelector('#gc-np-ov [data-np="' + k + '"]'); const v = { cust: q('cust').value, name: q('name').value, status: q('status').value }; q('ok').click(); if (document.getElementById('gc-np-ov')) q('ok').click(); setTimeout(() => pr.then(x => r({ v, got, ret: x && x.project && x.project.id })), 1500); }, 300)); });
  ok('9 window._gcNewProjectFor(invoiceLike, onCreated): QuickBooks "Customer:Job" memo → customer "Q Test Co", job "Warehouse roof", Completed; onCreated gets the project', api.v.cust === 'Q Test Co' && api.v.name === 'Warehouse roof' && api.v.status === 'completed' && api.got && api.got === api.ret, api);

  /* the review list */
  await P.evaluate(() => { localStorage.setItem('grayco_view', 'projects'); document.querySelector('#root main').insertAdjacentHTML('afterbegin', '<div><button>+ New Project</button></div>'); }); await sleep(2000);
  const lb = await P.evaluate(() => (document.getElementById('gcnp-listbtn') || {}).textContent);
  ok('10a Projects: "📝 Invoice entry (6)" next to + New Project', lb === '📝 Invoice entry (6)', lb);
  await P.evaluate(() => document.getElementById('gcnp-listbtn').click()); await sleep(200);
  const lst = await P.evaluate(() => document.getElementById('gc-np-list').innerText);
  ok('10b the list shows them with what they came from (Customer invoice · Riverside Test Church · $18,450.00)', /Fellowship hall roof/.test(lst) && /Customer invoice · Riverside Test Church · \$18,450\.00/.test(lst), lst.slice(0, 400));
  await P.click('#gc-np-list tr[data-pid] [data-l="ok"]'); await sleep(200);
  ok('10c ✓ Reviewed → dataEntry.reviewedAt/by; off the to-review list', await P.evaluate(() => window._gcInvoiceEntryProjects().length === 6 && window._crm.projects.filter(p => p.dataEntry && p.dataEntry.reviewedBy === 'Brittany Office').length === 1));
  if (SHOTS) await P.screenshot({ path: path.join(SHOTS, 'newproj_list.png') });
  ok('11 no page errors (office)', !errs.length, errs);
  await C.close();
}

/* ════════ ADMIN ════════ */
{
  const { P, C, errs } = await page('Admin');
  const o1 = await opts(P, '#invProj');
  ok('12a admin: "➕ New project…" in the invoice picker', has(o1), o1 && o1.slice(0, 3));
  await pick(P, '#invProj'); await P.click('#gc-np-ov [data-np="ok"]'); await sleep(2000);
  const p = await P.evaluate(() => { const p = window._crm.projects.find(x => x.createdVia === 'invoice-entry'); return p && { by: p.createdBy, id: p.id, sel: document.getElementById('invProj').value }; });
  ok('12b admin creates + assigns the same way', p && p.by === 'Wes Admin' && p.sel === p.id, p);
  ok('12c no page errors (admin)', !errs.length, errs);
  await C.close();
}

/* ════════ CREW ════════ */
{
  const { P, C, errs } = await page('Crew');
  const o1 = await opts(P, '#invProj'), o2 = await opts(P, '#subAssign');
  await P.evaluate(() => window._gcOpenDocUploader()); await sleep(1700);
  const o3 = await opts(P, '#_duJob');
  const api = await P.evaluate(() => window._gcNewProjectFor({ kind: 'client' }).then(r => r === null && !document.getElementById('gc-np-ov')));
  ok('13 crew: no "➕ New project…" anywhere (invoice, sub assign, upload documents) and the API refuses', o1 && !has(o1) && !has(o2) && !has(o3) && api && !(await P.evaluate(() => window._gcNewProjectCan())), [o1 && o1.slice(0, 2), o3 && o3.slice(-1)]);
  ok('13b no page errors (crew)', !errs.length, errs);
  await C.close();
}
await browser.close();
const nf = R.filter(x => !x).length;
console.log((nf ? 'FAILED ' : 'ALL PASS ') + (R.length - nf) + '/' + R.length);
process.exit(nf ? 1 : 0);
