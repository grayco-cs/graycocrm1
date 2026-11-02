// test_ACCTGATE.mjs <build-dir> <mirror.json> [out-dir] — the accounting + approvals GATE, end to end, as the OFFICE
// (office@grayco-cs.com, Brittany: gc_staff role 'staff', no profile, payroll on; her people-list role "Office Admin").
// The real page in Chromium, the REAL Netlify function handlers in this process (acctgate/bridge.mjs — a copy of
// claude/officefix's officefix_bridge.mjs: fake Supabase / storage, nothing leaves; a scheduled function cannot be called
// by URL), on the READ-ONLY real-data mirror (job / customer shapes; kept outside git) plus made-up "Agt …" jobs, subs,
// invoices and e-mails. Every fixture in git is synthetic (acctgate/qb_fixtures.mjs, stmtpdf/make_fixtures.py).
//   1. QuickBooks CSV: 💎 → Import from QuickBooks (CSV), the old ⚙️ Automation Inbox (GC_AUTO.uploadQuickBooksCSV) and
//      📥 Expense inbox, with Transaction Detail by Account, Expenses by Vendor (summary + detail) and P&L Detail.
//   2. 💳 card / 🏦 bank statements, PDF and CSV: every line shown, totals, duplicates, money in vs invoices.
//   3. 📧 receipts / sub invoices e-mailed in (_lib/money-mail.js, _lib/subinv.js) → job by address / PO, or 🧾 Match this
//      invoice → Approvals.
//   4. Enter an invoice by hand (📎 Upload Invoice): dropdowns in front, supplier vs sub paperwork rules, file, job, Approvals.
//   5. Approvals: approve, deny with / without a reason, approve & send, assign a lead, the sub pay list; card + badge; reload
//      and a second device; money reaches the job cost / P&L (denied does not).
//   6. Collections / A/R: an invoice marked paid → A/R and cash.   7. Print / PDF statement for a customer.
//   8. Permissions: office all; a PM only his jobs; marketing none.
// Every step records: pass / fail, our functions' 4xx / 5xx, page errors, long tasks over 1 s, money before → after.
// patch ACCTFIX2 (claude/acctfix2) adds: pending / denied costs out of job cost and the P&L ("⏳ Waiting for approval" apart),
// card refunds exact, a bank deposit → 💵 Payment matches → confirm (A/R and cash exact), the customer statement (rows, balance,
// aging, 🖨 / 📄 / ✉ on Approvals), and the 📥 Expense inbox's own message after every import.
// Env: GC_HARNESS (default the wUPG harness), GC_PDFJS, ONLY (comma list of step groups: qb,stmt,mail,manual,appr,coll,stmt7,perm).
// Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import os from 'os'; import zlib from 'zlib'; import { pathToFileURL } from 'url';
import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wUPG/harness.mjs').href);
const { computer, signIn, sleep, cloud, ACCOUNTS, waitFor, broadcast } = H;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const B = await import(pathToFileURL(path.join(HERE, 'acctgate', 'bridge.mjs')).href);
const QB = await import(pathToFileURL(path.join(HERE, 'acctgate', 'qb_fixtures.mjs')).href);
const PDFJS = process.env.GC_PDFJS || SP + '/wSG/tb_sg/vendor/pdfjs';
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
const OUT = process.argv[4] || fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'acctgate-out-'));
if (!BUILD || !MIRROR) { console.error('usage: node test_ACCTGATE.mjs <build-dir> <mirror.json> [out-dir]'); process.exit(2); }
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = g => !ONLY || ONLY.has(g);
const OFFICE = 'office@grayco-cs.com', PM = 'sbiffle@grayco-cs.com', MKT = 'agt.mktg@grayco-cs.com';
ACCOUNTS[MKT] = { pw: 'Correct-Horse-5', id: 'u-mk', role: 'staff', profile: 'marketing' };
fs.mkdirSync(OUT, { recursive: true });

/* ══════════ the world: the mirror + made-up "Agt" records ══════════ */
const FX = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'acctgate-fx-'));
execFileSync('python3', [path.join(HERE, 'stmtpdf', 'make_fixtures.py'), FX], { stdio: 'ignore' });
const SNAMES = JSON.parse(fs.readFileSync(FX + '/index.json', 'utf8'));
const SEXP = Object.fromEntries(SNAMES.map(n => [n, JSON.parse(fs.readFileSync(FX + '/' + n + '.json', 'utf8'))]));
fs.writeFileSync(FX + '/qb_tdba.csv', QB.transactionDetailByAccount());
fs.writeFileSync(FX + '/qb_pnl_detail.csv', QB.profitAndLossDetail());
fs.writeFileSync(FX + '/qb_exp_vendor_summary.csv', QB.expensesByVendorSummary());
fs.writeFileSync(FX + '/qb_exp_vendor_detail.csv', QB.expensesByVendorDetail());
fs.writeFileSync(FX + '/agt_bank.csv', ['Date,Description,Withdrawals,Deposits,Balance',
  '10/20/2026,"DEPOSIT - AGT HOLLIS INV 1043",,"5,000.00","17,425.00"',
  '10/21/2026,"CHECK 1209",310.00,,"17,115.00"',
  '10/22/2026,"MOBILE DEPOSIT",,"1,200.00","18,315.00"'].join('\n'));

const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const iso = t => new Date(t).toISOString(), NOW = Date.now(), HOURAGO = iso(NOW - 3600e3);
const A = 'PRJagtA', BJ = 'PRJagtB';
function loadCloud(){
  cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
  const rd = k => { const r = cloud.get(k); let v = r && r.value; let str = false; if (typeof v === 'string') { try { v = JSON.parse(v); str = true; } catch (e) {} } return { v, str }; };
  const edit = (k, fn) => { const o = rd(k); const nv = fn(Array.isArray(o.v) ? o.v : (o.v && typeof o.v === 'object' ? o.v : [])); cloud.set(k, { key: k, value: o.str ? JSON.stringify(nv) : nv, updated_at: HOURAGO }); };
  edit('projects', l => l.concat([
    { id: A, name: 'Agt Hollis Reroof', address: '4471 Quarry Bend Dr, Bartlett, TN 38133', autoPO: 'A101', client: 'Agt Hollis', clientEmail: 'agt.hollis@example.invalid', pm: 'Steven Biffle', status: 'Active', contract: 24000, type: 'Residential', created: '2026-09-01', savedAt: HOURAGO, updatedAt: HOURAGO },
    { id: BJ, name: 'Agt Brentley Gutters & Trim', address: '1880 Wren Hollow Rd, Germantown, TN 38138', autoPO: 'Q902', client: 'Agt Brentley', pm: '', status: 'Active', contract: 18000, type: 'Residential', created: '2026-09-10', savedAt: HOURAGO, updatedAt: HOURAGO }]));
  edit('subs', l => l.concat([
    { id: 'SUBagtR', name: 'Agt Ridgeline Roofing LLC', email: 'ap@agt-ridgeline.test', isSub: true, w9: false, insExp: '', wcExp: '', cat: 'Roofing', savedAt: HOURAGO, updatedAt: HOURAGO },
    { id: 'SUBagtD', name: 'Agt Delta Gutter Co', email: 'office@agt-delta.test', isSub: true, w9: true, insExp: '2027-06-30', wcExp: '2027-06-30', agreement: true, subAgreement: true, cat: 'Gutters', savedAt: HOURAGO, updatedAt: HOURAGO }]));
  edit('invs', l => l.concat([
    { id: 'INVagt1', type: 'client', pid: A, client: 'Agt Hollis', amt: 5000, invNum: '1043', status: 'sent', date: '2026-10-01', sentDate: '2026-10-01', dueDate: '2026-10-16', desc: 'Agt progress draw', savedAt: HOURAGO, updatedAt: HOURAGO },
    { id: 'INVagt2', type: 'client', pid: A, client: 'Agt Hollis', amt: 2750, invNum: '1044', status: 'sent', date: '2026-09-10', sentDate: '2026-09-10', dueDate: '2026-09-25', desc: 'INTERNAL margin note — not for the customer', savedAt: HOURAGO, updatedAt: HOURAGO },
    { id: 'INVagt3', type: 'client', pid: A, client: 'Agt Hollis', amt: 1200, invNum: '1045', status: 'sent', date: '2026-10-20', sentDate: '2026-10-20', dueDate: '2026-11-19', desc: 'Agt closing draw', savedAt: HOURAGO, updatedAt: HOURAGO },   /* not "final": a sent invoice that says final marks the job 100 % and the job's automatic draws then bill the rest of the contract (real behaviour, not under test here) */
    { id: 'INVagtS1', type: 'sub', pid: BJ, sub: 'Agt Delta Gutter Co', subId: 'SUBagtD', invNum: 'DG-5520', amt: 1850, status: 'received', recvDate: '2026-10-25', date: '2026-10-25', desc: 'Gutters phase 1', savedAt: HOURAGO, updatedAt: HOURAGO }]));
  const exp = (id, pid, vendor, amt, desc) => ({ id, pid, type: 'expense', vendor, payee: vendor, desc, amt, category: 'Materials', status: 'pending', date: '2026-10-29', by: 'Steven Biffle', enteredAt: HOURAGO, savedAt: HOURAGO, updatedAt: HOURAGO });
  edit('expenses', l => l.concat([exp('EXPagt1', BJ, 'Agt Supply House', 321, 'trim coil'), exp('EXPagt2', BJ, 'Agt Supply House', 77.5, 'wrong order (deny with reason)'), exp('EXPagt3', BJ, 'Agt Snack Bar', 18.25, 'lunch (deny)'), exp('EXPagtA1', A, 'Agt Supply House', 444, 'ridge vent')]));
  const ea = (e, pid, pm, amount, payee, desc) => ({ id: 'expId:' + e, expId: e, pm, jobId: pid, payee, desc, amount, status: 'pending_pm', matched: true, enteredAt: HOURAGO, updatedAt: HOURAGO });
  edit('gc_expense_approvals', l => l.concat([ea('EXPagt1', BJ, '', 321, 'Agt Supply House', 'trim coil'), ea('EXPagt2', BJ, '', 77.5, 'Agt Supply House', 'wrong order'), ea('EXPagt3', BJ, '', 18.25, 'Agt Snack Bar', 'lunch'), ea('EXPagtA1', A, 'Steven Biffle', 444, 'Agt Supply House', 'ridge vent')]));
  edit('gc_sub_approvals', l => l.concat([{ id: 'invId:INVagtS1', invId: 'INVagtS1', amt: 1850, pid: BJ, sub: 'Agt Delta Gutter Co', desc: 'Gutters phase 1', pmName: '', status: 'pending_pm', matched: true, createdAt: NOW - 3600e3, updatedAt: HOURAGO }]));
  edit('gc_approval_queue', l => l.concat([1, 2].map(i => ({ id: 'appr_agt_mail' + i, kind: 'portal_docs', title: 'New in your GrayCo portal: Agt_document_' + i + '.pdf', jobId: BJ, jobName: 'Agt Brentley Gutters & Trim', pm: '', pmEmail: '', channel: 'email', to: 'agt.customer' + i + '@example.invalid', subject: 'New in your GrayCo portal', html: '<p>x</p>', text: 'x', attachments: [], steps: ['office'], step: 'office', approvals: [], status: 'waiting', createdAt: iso(NOW - i * 3600e3), updatedAt: iso(NOW - i * 3600e3), meta: {} }))));
  edit('leads', l => l.concat([{ id: 'LAGTHOLD1', name: 'Agt Held Lead', client: 'Agt Held Lead', phone: '901-555-0142', type: 'Residential', stage: 'New', status: 'New', source: 'Website', createdAt: iso(NOW - 1800e3), updatedAt: iso(NOW - 1800e3),
    hold: { state: 'held', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', field: 'pm', label: 'Roofing', until: iso(NOW + 6 * 3600e3), at: iso(NOW - 1800e3) } }]));
  edit('users', l => l.concat([{ id: 'Uagtmk', name: 'Agt Marketing', email: MKT, role: 'Marketing Manager', active: true }]));
}
loadCloud();
const STAFF = [{ email: OFFICE, name: 'Brittany Pucket', role: 'staff', profile: null, active: true, payroll: true },
  { email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', profile: null, active: true, payroll: true },
  { email: PM, name: 'Steven Biffle', role: 'staff', profile: null, active: true },
  { email: MKT, name: 'Agt Marketing', role: 'staff', profile: 'marketing', active: true, mkt_active: true }];
const bridge = B.installBridge({ build: BUILD, cloud, accounts: ACCOUNTS, staffRows: STAFF, broadcast });
const req = createRequire(path.join(BUILD, 'netlify', 'functions', 'x.js'));

/* ══════════ a person's computer ══════════ */
async function person(email, name, opts){
  const c = await computer(name, Object.assign({ build: BUILD }, opts || {})); c.acceptConfirm = true; c.prompts = [];
  const row = STAFF.find(x => x.email === email);
  await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access)/.test(u), async r => {
    const u = new URL(r.request().url()); const J = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/gc_staff')) return J(row ? [row] : []);
    return J({ email, staff: true, admin: !!(row && row.role === 'admin'), payroll: !!(row && row.payroll), office: email === OFFICE, sec2: 1 });
  });
  await B.routeFunctions(c, bridge);
  c.cons = []; c.ctx.on('console', m => { try { if (/warning|error/.test(m.type())) c.cons.push(m.type() + ' ' + m.text().slice(0, 220)); } catch (e) {} });
  await c.ctx.route(u => /pdf(\.worker)?\.min\.js$/.test(new URL(u).pathname), r => r.fulfill({ path: PDFJS + '/' + (/worker/.test(r.request().url()) ? 'pdf.worker.min.js' : 'pdf.min.js'), contentType: 'text/javascript' }));
  await c.ctx.addInitScript(() => {
    try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
    window.__LT = []; window.__PH = '';
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push({ d: Math.round(e.duration), ph: window.__PH || '' }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    window.__OPENED = []; window.open = function(u){ window.__OPENED.push(String(u || '')); const doc = { _h: '', write(h){ this._h += h; }, close(){}, open(){} }; const w = { closed: false, close(){}, focus(){}, print(){}, addEventListener(){}, document: doc, location: {} }; window.__OPENED_W = w; return w; };
    try { window.print = function(){}; } catch (e) {}
  });
  if (!opts || !opts.mobile) await c.page().setViewportSize({ width: 1366, height: 800 });
  c.email = email;
  await signIn(c, email, 1000);
  await waitFor(c, (all) => !!(window._crm && window._setView && document.querySelectorAll('aside button[draggable="true"]').length > 2 && (!all || (window._crm.projects || []).length > 50)), email === OFFICE, 180000, 500);
  await sleep(9000); await c.page().evaluate(H_JS);
  c.calls.forEach(x => BG.add(x.fn + ' ' + x.q.split('&')[0].split('=')[0]));
  return c;
}
const H_JS = `
window.__vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none'; };
window.__clickText = (re, root) => { re = new RegExp(re, 'i'); const el = [...(root || document).querySelectorAll('button, [role=button], a, summary, label')].filter(__vis).find(e => re.test((e.innerText || e.title || '').trim())); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; };
window.__row = k => [...document.querySelectorAll('.apx-row')].find(r => r.getAttribute('data-k') === k);
window.__toasts = () => [...document.querySelectorAll('.apx-toast, [class*=toast], [role=status], [data-apx-dk]')].filter(__vis).map(e => e.innerText.slice(0, 160)).join(' / ');
window.__setV = (el, v) => { const P = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(P, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
window.__go = async v => { window._setView(v); await new Promise(z => setTimeout(z, 2500)); };
window.__r2 = n => Math.round((+n || 0) * 100) / 100;
window.__money = () => { try {
  const a = window._gcAcctModel({ range: { from: '', to: '' } }), c = window._gcAcctModel({ range: { from: '', to: '' }, basis: 'cash' });
  const j = id => { const x = a.pnl.jobs.find(y => y.pid === id); return x ? __r2(x.cost) : 0; };
  return { jobCosts: __r2(a.pnl.jobCosts), overhead: __r2(a.pnl.overhead), unassigned: __r2(a.pnl.unassigned), costs: __r2(a.pnl.jobCosts + a.pnl.overhead + a.pnl.unassigned), revenue: __r2(a.pnl.revenue), cashIn: __r2(c.pnl.revenue), ar: __r2(a.ar.totals.all), jobA: j('${A}'), jobB: j('${BJ}') };
} catch (e) { return { err: String(e.message || e) }; } };
window.__apset = () => { try { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); } catch (e) {} const s = window._gcApprovalSet(); const ids = []; Object.keys(s.groups).forEach(g => s.groups[g].forEach(x => ids.push(String(x.id)))); const nb = document.querySelector('.apx-nb'); return { total: s.total, count: window._gcApprovalCount ? window._gcApprovalCount() : -1, ids, badge: nb ? +nb.textContent : null }; };
window.__file = (name, type, b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name, { type }); };
window.__captureInput = (open) => { const ce = document.createElement.bind(document); let cap = null; document.createElement = function(t){ const e = ce(t); if (String(t).toLowerCase() === 'input') { cap = e; e.click = function(){}; } return e; }; try { open(); } finally { document.createElement = ce; } return cap; };
window.__give = (inp, f) => { const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); };
true;`;
const b64 = f => fs.readFileSync(f).toString('base64');
const mk = (c) => async (fn, arg) => { try { return await c.page().evaluate(fn, arg); } catch (e) { if (/is not defined|is not a function/.test(e.message)) { await c.page().evaluate(H_JS); return c.page().evaluate(fn, arg); } throw e; } };

/* ══════════ steps ══════════ */
const RESULTS = []; let fails = 0, stepN = 0; const BG = new Set(['referral ?pending', 'gdocs-sync ?op', 'auto-wins ', 'bid-inbox ?list', 'referral ?list', 'referral ?settings']);   /* the office's background refusals that claude/officefix fixes — counted in the session check */
const IGNORE_ERR = /ResizeObserver|Failed to load resource|net::ERR|AbortError/i;
async function step(c, group, name, f, o){
  o = o || {}; stepN++; const ph = 's' + stepN; c.phase = ph; const ev = mk(c);
  await ev(ph => { window.__PH = ph; }, ph).catch(() => {});
  /* a person is at the computer: the mouse moves at the start of each step (a real input event). Without one for a minute the
     CRM's background loops slow to every 30 s (patch SYNCPERF "nobody at the computer") and a screen opened by code — like
     📋 Approvals here — is not drawn for up to 30 s. */
  try { await c.page().mouse.move(40 + (stepN % 9) * 7, 300); } catch (e) {}
  const m0 = o.money === false ? null : await ev(() => window.__money()).catch(() => null);
  const t0 = Date.now(), n0 = c.calls.length, e0 = c.errs.length, k0 = (c.cons || []).length;
  let r; try { r = await f(ev); } catch (e) { r = { ok: false, note: 'threw: ' + String(e.message).slice(0, 300) }; }
  await sleep(300);
  const m1 = o.money === false ? null : await ev(() => window.__money()).catch(() => null);
  const ms = Date.now() - t0, calls = c.calls.slice(n0);
  const allow = r && r.allow || [];
  const isBg = x => BG.has(x.fn + ' ' + x.q.split('&')[0].split('=')[0]);
  const bgBad = calls.filter(x => x.status >= 400 && isBg(x));
  const bad = calls.filter(x => x.status >= 400 && !isBg(x) && !allow.some(a => a.fn === x.fn && (!a.status || a.status === x.status)));
  const lts = (await ev(ph => window.__LT.filter(x => x.ph === ph).map(x => x.d), ph).catch(() => [])).filter(d => d > 1000);
  const perrs = c.errs.slice(e0).filter(e => !IGNORE_ERR.test(e));
  const ok = !!(r && r.ok) && !bad.length && !perrs.length;
  if (!ok) fails++;
  const delta = {}; if (m0 && m1 && !m0.err && !m1.err) Object.keys(m1).forEach(k => { const d = Math.round((m1[k] - m0[k]) * 100) / 100; if (d) delta[k] = d; });
  const cons = (c.cons || []).slice(k0).filter(x => /held your place|TypeError|ReferenceError|is not a function|Cannot read/.test(x));
  const rec = { n: stepN, who: c.name, group, name, ok, ms, console: cons.slice(0, 6), note: (r && r.note) || '', bad: bad.map(x => x.m + ' ' + x.fn + x.q.split('&')[0] + ' → ' + x.status + ' ' + (x.err || '').slice(0, 100)), allowed: calls.filter(x => x.status >= 400 && !bad.includes(x) && !bgBad.includes(x)).map(x => x.fn + ' ' + x.status), background: [...new Set(bgBad.map(x => x.m + ' ' + x.fn + x.q.split('&')[0] + ' → ' + x.status))], pageErrors: perrs.slice(0, 4), longTasks: lts, money: { before: m0, after: m1, delta }, data: r && r.data };
  RESULTS.push(rec);
  console.log((ok ? 'ok   ' : 'FAIL ') + stepN + '. [' + c.name + '] ' + name + ' — ' + ms + ' ms' + (lts.length ? ', long tasks ' + JSON.stringify(lts) : '') + (Object.keys(delta).length ? ', money ' + JSON.stringify(delta) : '') + (rec.note ? '\n        ' + rec.note : '') + (bad.length ? '\n        BAD ' + JSON.stringify(rec.bad) : '') + (rec.background.length ? '\n        (background) ' + JSON.stringify(rec.background) : '') + (perrs.length ? '\n        PAGE ERRORS ' + JSON.stringify(perrs.slice(0, 3)) : '') + (!ok && cons.length ? '\n        CONSOLE ' + JSON.stringify(cons.slice(0, 4)) : ''));
  return r;
}
const near = (a, b) => Math.abs((+a || 0) - (+b || 0)) < 0.011;
const money$ = n => '$' + (+n).toFixed(2);

/* ══════════════════ the office, computer 1 ══════════════════ */
console.log('── signing in as the office (office@grayco-cs.com) …');
const O = await person(OFFICE, 'office');
const ev = mk(O);
await step(O, 'perm', 'Office signs in: full office access, every money screen allowed', async ev => {
  await waitFor(O, () => (window._crm.invoices || []).filter(i => /^INVagt/.test(i.id)).length >= 4, null, 30000, 500).catch(() => null);   /* a first sign-in: the cloud's lists arrive in the first seconds */
  const r = await ev(() => ({ full: window._gcFullAccess && window._gcFullAccess(), office: window._gcIsOfficeFull && window._gcIsOfficeFull(), notAllowed: ['payroll', 'pnl', 'invoices', 'payments', 'expenses', 'approvals', 'officemanager', 'todo'].filter(v => window._gcViewAllowed && !window._gcViewAllowed(v)), money: window.__money(), jobs: (window._crm.projects || []).filter(p => /^PRJagt/.test(p.id)).length, invs: (window._crm.invoices || []).filter(i => /^INVagt/.test(i.id)).length }));
  return { ok: r.full && r.office && !r.notAllowed.length && r.jobs === 2 && r.invs === 4, note: JSON.stringify(r).slice(0, 400), data: r };
});

/* ─────────── 1. QuickBooks CSV ─────────── */
if (want('qb')) {
  const files = { tdba: 'qb_tdba.csv', pnl: 'qb_pnl_detail.csv', evs: 'qb_exp_vendor_summary.csv', evd: 'qb_exp_vendor_detail.csv' };
  for (const [k, f] of Object.entries(files)) {
    await step(O, 'qb', '💎 → Import from QuickBooks (CSV): ' + f, async ev => {
      const r = await ev(async ([name, b64s]) => {
        const has = typeof window._gcOpenQbCsvImport === 'function';
        const inp = window.__captureInput(() => window._gcOpenQbCsvImport()); if (!inp) return { has, err: 'no file input' };
        window.__give(inp, window.__file(name, 'text/csv', b64s));
        let ov = null; for (let i = 0; i < 40 && !ov; i++) { await new Promise(z => setTimeout(z, 250)); ov = document.getElementById('_gcQbImpOv'); }
        if (!ov) return { has, err: 'no preview window', alert: '' };
        const summary = ov.innerText.slice(0, 700), plan = window._gcQbLastPlan;
        const before = { exp: window._crm.expenses.length, inv: window._crm.invoices.length };
        ov.querySelector('#_jQbOk').click();
        for (let i = 0; i < 40 && document.getElementById('_gcQbImpOv'); i++) await new Promise(z => setTimeout(z, 250));
        await new Promise(z => setTimeout(z, 1500));
        const newInv = window._crm.invoices.filter(i => i.source === 'quickbooks' && /QuickBooks/.test(i.by || '')).map(i => ({ id: i.id, client: i.client, amt: i.amt, pid: i.pid, status: i.status }));
        const newOnes = window._crm.invoices.length > before.inv ? window._crm.invoices.slice().sort((a, b) => String(b.createdAt || b.at || '').localeCompare(String(a.createdAt || a.at || ''))).slice(0, 2).map(i => ({ id: i.id, amt: i.amt, pid: i.pid, src: i.source, by: i.by, st: i.status, at: i.createdAt || i.at, num: i.invNum })) : [];
        return { newOnes, has, label: plan && plan.label, counts: plan && plan.counts, rows: plan ? plan.rows.map(x => x.action + ' ' + x.rec.kind + ' ' + (x.rec.name || '') + ' ' + x.rec.amount).slice(0, 30) : [], summary, exp: window._crm.expenses.length - before.exp, inv: window._crm.invoices.length - before.inv, newInv };
      }, [f, b64(FX + '/' + f)]);
      const dlg = O.dialogs.slice(-1)[0] || '';
      if (k === 'evs') return { ok: (!!r.err && /header row/.test(O.dialogs.slice(-1)[0] || '')) || (r.counts && r.exp === 0 && r.inv === 0), note: 'summary report: ' + (r.err ? r.err : (r.label + ' → ' + JSON.stringify(r.counts))) + ' · ' + dlg.slice(0, 160), data: r };
      return { ok: r.has && !r.err && r.inv === 0, note: (r.label || r.err) + ' · ' + JSON.stringify(r.counts) + ' · new expenses ' + r.exp + ', new invoices ' + r.inv + (r.inv ? ' ' + JSON.stringify(r.newOnes) : '') + ' (costs are NOT made into expenses by this door — it says to use 📥 Expense inbox) · ' + dlg.slice(0, 200), data: r };
    });
  }
  /* 📥 Expense inbox */
  const inboxImport = (f) => step(O, 'qb', '📥 Expense inbox → import ' + f, async ev => {
    await ev(() => { const o = document.getElementById('gc-exp2-inbox'); if (!o) window._gcExpInbox(); });
    await waitFor(O, () => !!document.querySelector('#gc-exp2-inbox input[data-imp]'), null, 15000);
    const w0 = await ev(() => (window._gcExp2.inbox() || []).length);
    await O.page().setInputFiles('#gc-exp2-inbox input[data-imp]', FX + '/' + f);
    await sleep(2500);
    const r = await ev(() => ({ msg: ((document.querySelector('#gc-exp2-inbox [data-msg]') || {}).textContent || '') + ' [' + ((document.querySelector('#gc-exp2-inbox h2') || {}).textContent || '') + ']', waiting: (window._gcExp2.inbox() || []).filter(x => x.status === 'new').map(x => ({ id: x.id, date: x.date, amount: x.amount, vendor: x.vendor, ref: x.ref, account: x.account, memo: x.memo })) }));
    r.added = (await ev(() => (window._gcExp2.inbox() || []).length)) - w0;
    return { ok: true, note: r.msg, data: r };
  }, { money: false });
  const t1 = await inboxImport('qb_tdba.csv');
  const rowsT = (t1.data.waiting || []).filter(x => QB.COSTS.some(c => c.date === x.date));
  const sumT = rowsT.reduce((a, x) => a + x.amount, 0);
  RESULTS[RESULTS.length - 1].ok = rowsT.length === 5 && near(sumT, 4069.49);
  if (!RESULTS[RESULTS.length - 1].ok) { fails++; RESULTS[RESULTS.length - 1].note += ' — WRONG: ' + rowsT.length + ' rows / ' + money$(sumT) + ' (right: 5 rows / $4,069.49: every cost once, the −212.00 return skipped). Rows: ' + rowsT.map(x => x.vendor + ' ' + x.amount + ' [' + x.account + ']').join('; '); console.log('FAIL ↑ ' + RESULTS[RESULTS.length - 1].note); }
  else console.log('     ↑ 5 rows, $4,069.49 — every cost once');
  const t2 = await inboxImport('qb_tdba.csv');
  const ok2 = t2.data.added === 0 && /0 rows added, 5 duplicates skipped/.test(t2.note) && /\(5 waiting\)/.test(t2.note);   /* the window redraws (ACCTFIX2-E1) */
  if (!ok2) { fails++; RESULTS[RESULTS.length - 1].ok = false; } RESULTS[RESULTS.length - 1].name += ' (again: duplicates skipped)';
  console.log((ok2 ? '     ↑ ' : 'FAIL ↑ ') + 're-import: ' + t2.data.added + ' added · ' + t2.note);
  const t3 = await inboxImport('qb_pnl_detail.csv');
  const ok3 = t3.data.added === 2 && /✅ 2 rows added/.test(t3.note) && /\(7 waiting\)/.test(t3.note); if (!ok3) { fails++; RESULTS[RESULTS.length - 1].ok = false; }
  console.log((ok3 ? '     ↑ ' : 'FAIL ↑ ') + 'P&L Detail: ' + t3.data.added + ' new (right: 2 — print shop, landfill; the invoice and the rest are skipped)');
  const t4 = await inboxImport('qb_exp_vendor_summary.csv');
  console.log('     ↑ Expenses by Vendor SUMMARY (QuickBooks Online\'s own report): ' + t4.data.added + ' added · "' + t4.note + '"');
  RESULTS[RESULTS.length - 1].ok = t4.data.added === 0 && /No "Date"/.test(t4.note); if (!RESULTS[RESULTS.length - 1].ok) fails++;
  const t5 = await inboxImport('qb_exp_vendor_detail.csv');
  const ok5 = t5.data.added === 1 && /✅ 1 row added/.test(t5.note) && /\(8 waiting\)/.test(t5.note); if (!ok5) { fails++; RESULTS[RESULTS.length - 1].ok = false; }
  console.log((ok5 ? '     ↑ ' : 'FAIL ↑ ') + 'Expenses by Vendor DETAIL: ' + t5.data.added + ' new (right: 1 — Agt Rental Co $310.00)');
  await step(O, 'qb', '⚙️ Automation Inbox → QuickBooks CSV (GC_AUTO.uploadQuickBooksCSV) with Transaction Detail by Account (its 5 costs are already in 📥)', async ev => {
    const r = await ev(async ([b64s]) => {
      const k = 'gc_pending_qbmap', n0 = JSON.parse(localStorage.getItem(k) || '[]').length, i0 = (window._gcExp2.inbox() || []).length;
      window.GC_AUTO.uploadQuickBooksCSV(window.__file('qb_tdba.csv', 'text/csv', b64s)); await new Promise(z => setTimeout(z, 2500));
      const L = JSON.parse(localStorage.getItem(k) || '[]').slice(n0);
      const inboxAdded = (window._gcExp2.inbox() || []).length - i0;
      return { queued: L.length, sample: L.slice(0, 6).map(x => ({ vendor: x.vendor, amt: x.amt, date: x.date, cat: x.cat, pid: x.pid })), sum: L.reduce((a, x) => a + (+x.amt || 0), 0), inboxAdded };
    }, [b64(FX + '/qb_tdba.csv')]);
    const dlg = O.dialogs.slice(-1)[0] || '';
    const m = /(\d+) row\(s\) added(?:, (\d+) already in)?/.exec(dlg);
    const right = (r.queued === 5 && near(r.sum, 4069.49)) || (!!m && +m[1] === 0 && +(m[2] || 0) === 5 && r.inboxAdded === 0);
    return { ok: right, note: (m ? 'hands the file to 📥 Expense inbox: ' : 'old browser-only queue (localStorage gc_pending_qbmap, not synced, no job): ' + r.queued + ' row(s), ' + money$(r.sum) + ' (right: the 5 costs, $4,069.49) · ') + 'alert: ' + dlg.slice(0, 160), data: r };
  }, { money: false });
  /* put every waiting row on its suggested job, or overhead */
  await step(O, 'qb', '📥 Expense inbox: each row → suggested job (Put on job) or Overhead; categories; P&L moves by exactly the imported amount', async ev => {
    const r = await ev(async (costs) => {
      const out = [];
      for (let guard = 0; guard < 40; guard++) {
        const row = [...document.querySelectorAll('#gc-exp2-inbox [data-id]')].find(x => { const it = (window._gcExp2.inbox() || []).find(y => y.id === x.getAttribute('data-id')); return it && costs.some(c => c.date === it.date && Math.abs(c.amount - it.amount) < 0.01); });
        if (!row) break;
        const id = row.getAttribute('data-id'), it = window._gcExp2.inbox().find(y => y.id === id), job = row.querySelector('[data-job]').value;
        const n0 = window._crm.expenses.length;
        if (job) row.querySelector('[data-assign]').click(); else row.querySelector('[data-oh]').click();
        await new Promise(z => setTimeout(z, 700));
        const e = window._crm.expenses.find(x => x.fromInbox === id) || {};
        const p = (window._crm.projects || []).find(x => x.id === e.pid) || {};
        out.push({ vendor: it.vendor, amount: it.amount, account: it.account, job: job.slice(0, 40), po: p.autoPO || '', pid: e.pid || '', cat: e.category, overhead: !!e.overhead, added: window._crm.expenses.length - n0 });
      }
      return out;
    }, QB.COSTS);
    const exp = QB.COSTS.reduce((a, c) => a + c.amount, 0), got = r.reduce((a, x) => a + x.amount, 0);
    const wrongJob = [], wrongCat = [];
    for (const x of r) { const c = QB.COSTS.find(c => Math.abs(c.amount - x.amount) < 0.01 && (c.vendor === x.vendor || x.vendor.indexOf(c.vendor.split(' ')[0]) === 0)); if (!c) continue; if ((c.job || '') !== (x.po || '')) wrongJob.push(c.k + ' ' + c.vendor + ': want ' + (c.job || 'overhead') + ' got ' + (x.po || (x.overhead ? 'overhead' : '?'))); const cat = x.overhead ? 'Overhead' : x.cat; if (c.cat !== cat && !(c.cat === 'Fuel' && x.overhead)) wrongCat.push(c.k + ' ' + c.vendor + ' [' + x.account + ']: want ' + c.cat + ' got ' + cat); }
    return { ok: r.length === 8 && near(got, exp) && !wrongJob.length && !wrongCat.length, note: r.length + ' rows booked, ' + money$(got) + ' (right: 8 rows, ' + money$(exp) + ')' + (wrongJob.length ? ' · job: ' + wrongJob.join('; ') : '') + (wrongCat.length ? ' · category: ' + wrongCat.join('; ') : ''), data: { rows: r, expected: exp } };
  });
  {
    const last = RESULTS[RESULTS.length - 1], d = last.money.delta, booked = (last.data && last.data.rows || []).reduce((a, x) => a + x.amount, 0);
    const moved = Math.round(((d.jobCosts || 0) + (d.overhead || 0) + (d.unassigned || 0)) * 100) / 100;
    const okp = near(moved, booked);
    console.log((okp ? '     ↑ ' : 'FAIL ↑ ') + 'P&L costs moved ' + money$(moved) + ' = booked ' + money$(booked) + ' (job costs ' + money$(d.jobCosts || 0) + ', overhead ' + money$(d.overhead || 0) + ')');
    if (!okp) { fails++; last.ok = false; last.note += ' · P&L moved ' + money$(moved) + ' ≠ booked ' + money$(booked); }
  }
  await step(O, 'qb', '📥 Expense inbox: P&L Detail again after booking → every line a duplicate; "📥 Needs a job" door state', async ev => {
    await O.page().setInputFiles('#gc-exp2-inbox input[data-imp]', FX + '/qb_pnl_detail.csv'); await sleep(2500);
    const r = await ev(async () => { const msg = (document.querySelector('#gc-exp2-inbox [data-msg]') || {}).textContent || ''; document.getElementById('gc-exp2-inbox').remove(); await window.__go('todo'); await new Promise(z => setTimeout(z, 2500)); const mn = document.getElementById('gc-money-needs'); return { msg, needs: mn ? mn.innerText.replace(/\s+/g, ' ').slice(0, 200) : '(no 📥 Needs a job box on To-Do)' }; });
    return { ok: /^✅ 0 rows added/.test(r.msg), note: r.msg + ' · To-Do: ' + r.needs, data: r };
  });
}

/* ─────────── 2. statements ─────────── */
const stTable = ev => ev(() => ({
  r: [...document.querySelectorAll('.gc-money-imp tr[data-r]')].map(tr => ({ d: tr.children[2].textContent.slice(0, 60), amt: tr.children[3].textContent, cat: (tr.querySelector('[data-c="cat"]') || {}).value, job: (tr.querySelector('[data-c="job"]') || {}).value, on: (tr.querySelector('[data-c="on"]') || {}).checked, dup: !!tr.querySelector('[data-c="dup"]') })),
  x: [...document.querySelectorAll('.gc-money-imp tr[data-x]')].map(tr => tr.textContent.replace(/\s+/g, ' ').slice(0, 90)),
  totals: ((document.querySelector('.gc-money-imp [data-c="totals"]') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 300),
  okTxt: !!document.querySelector('.gc-money-imp [data-c="stmtok"]'), warn: !!document.querySelector('.gc-money-imp [data-c="stmtwarn"]'),
  msg: (document.querySelector('.gc-money-imp [data-c="msg"]') || {}).textContent || '' }));
const stLoad = async (c, file) => { await c.page().setInputFiles('.gc-money-imp [data-c="file"]', file); return waitFor(c, () => document.querySelectorAll('.gc-money-imp tr[data-r], .gc-money-imp tr[data-x]').length > 0 || !!document.querySelector('.gc-money-imp [data-c="image"]') || /No transactions|could not|password/i.test((document.querySelector('.gc-money-imp [data-c="msg"]') || {}).textContent || ''), null, 45000); };
const stOpen = async (c, which) => { await mk(c)(async w => { if (!document.querySelector('#gc-money-needs [data-mn="' + w + '"]')) await window.__go('todo'); for (let i = 0; i < 30 && !document.querySelector('#gc-money-needs [data-mn="' + w + '"]'); i++) await new Promise(z => setTimeout(z, 500)); const b = document.querySelector('#gc-money-needs [data-mn="' + w + '"]'); if (b) b.click(); }, which); return waitFor(c, () => !!document.querySelector('.gc-money-imp [data-c="file"]'), null, 15000); };
const stGo = async (c) => { await c.page().click('.gc-money-imp [data-c="go"]'); await waitFor(c, () => !!document.querySelector('.gc-money-imp [data-c="done"]'), null, 30000); await sleep(1200); return mk(c)(() => (document.querySelector('.gc-money-imp [data-c="done"]') || {}).textContent || ''); };
const stClose = c => mk(c)(() => { const x = document.querySelector('.gc-money-imp [data-c="x"]'); if (x) x.click(); });
const stNet = (name, bank) => Math.round(SEXP[name].rows.filter(r => bank ? (r.dir === 'out' && r.kind !== 'transfer') : r.kind !== 'payment').reduce((a, r) => a + (r.dir === 'out' ? r.amt : -r.amt), 0) * 100) / 100;
if (want('stmt')) {
  for (const [file, mode, last4] of [['chase_card', 'import', '4421'], ['amex_card', 'import', ''], ['firsthorizon_bank', 'bank', '']]) {
    const e = SEXP[file], bank = mode === 'bank';
    const wantR = e.rows.filter(r => bank ? (r.dir === 'out' && r.kind !== 'transfer') : r.kind !== 'payment').length, wantX = e.rows.length - wantR, net = stNet(file, bank);
    await step(O, 'stmt', (bank ? '🏦 Import bank statement' : '💳 Import card statement') + ' → ' + file + '.pdf: every line shown, totals, Import', async ev => {
      if (!(await stOpen(O, mode))) return { ok: false, note: 'the import window did not open' };
      if (!(await stLoad(O, FX + '/' + file + '.pdf'))) return { ok: false, note: 'the PDF was not read' };
      const T = await stTable(ev);
      const done = await stGo(O);
      await stClose(O);
      return { ok: T.r.length === wantR && T.x.length === wantX && T.okTxt && !T.warn, note: 'shown ' + T.r.length + ' to import + ' + T.x.length + ' left out (right: ' + wantR + ' + ' + wantX + ') · statement check ' + (T.okTxt ? '✓' : T.warn ? '⚠ MISMATCH' : 'none') + ' · ' + T.totals.slice(0, 140) + ' · ' + done.slice(0, 120), data: { T, net } };
    });
    const last = RESULTS[RESULTS.length - 1], d = last.money.delta, moved = Math.round(((d.jobCosts || 0) + (d.overhead || 0) + (d.unassigned || 0)) * 100) / 100;
    const okp = near(moved, net); console.log((okp ? '     ↑ ' : 'FAIL ↑ ') + 'P&L costs moved ' + money$(moved) + ' (right: ' + money$(net) + ' — charges − refunds)');
    if (!okp) { fails++; last.ok = false; last.note += ' · P&L moved ' + money$(moved) + ' ≠ ' + money$(net); }
    await step(O, 'stmt', 'the same ' + file + '.pdf again → every line "already in", nothing added', async ev => {
      await stOpen(O, mode); await stLoad(O, FX + '/' + file + '.pdf'); const T = await stTable(ev); const n0 = await ev(() => window._crm.expenses.length); const done = await stGo(O); await stClose(O); const n1 = await ev(() => window._crm.expenses.length);
      return { ok: T.r.length === wantR && T.r.every(x => x.dup && !x.on) && n1 === n0, note: T.r.filter(x => x.dup).length + '/' + T.r.length + ' marked already in · ' + done.slice(0, 80) + ' · expenses ' + n0 + ' → ' + n1 };
    });
  }
  await step(O, 'stmt', '💳 Capital One CSV, then the PDF of the same statement → caught as duplicates', async ev => {
    const e = SEXP.capone_card;
    fs.writeFileSync(FX + '/capone.csv', ['Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit'].concat(e.rows.map(r => `${r.date},${r.date},9902,"${r.desc}",Other,${r.dir === 'out' ? r.amt.toFixed(2) : ''},${r.dir === 'in' ? r.amt.toFixed(2) : ''}`)).join('\n'));
    await stOpen(O, 'import'); await O.page().fill('.gc-money-imp [data-c="newcard"]', 'Capital One 9902').catch(() => {}); await stLoad(O, FX + '/capone.csv'); const T1 = await stTable(ev); const d1 = await stGo(O); await stClose(O);
    await stOpen(O, 'import'); await stLoad(O, FX + '/capone_card.pdf'); const T2 = await stTable(ev); const n0 = await ev(() => window._crm.expenses.length); await stGo(O); await stClose(O); const n1 = await ev(() => window._crm.expenses.length);
    return { ok: T1.r.length > 0 && T2.r.length === T1.r.length && T2.r.every(x => x.dup) && n1 === n0, note: 'CSV ' + T1.r.length + ' lines (' + d1.slice(0, 60) + '); PDF ' + T2.r.filter(x => x.dup).length + '/' + T2.r.length + ' already in; added ' + (n1 - n0) };
  });
  await step(O, 'stmt', '🏦 bank CSV with deposits → $5,000 "AGT HOLLIS INV 1043" is a CERTAIN match (💵 Payment matches); "MOBILE DEPOSIT" $1,200 is listed, not applied', async ev => {
    await stOpen(O, 'bank'); await stLoad(O, FX + '/agt_bank.csv'); const T = await stTable(ev);
    const recon = await ev(async () => { const b = document.querySelector('.gc-money-imp [data-c="recon"]'); if (!b) return 'no 🧾 button'; b.click(); await new Promise(z => setTimeout(z, 2500)); return ((document.querySelector('.gc-money-imp [data-c="reconmsg"]') || {}).textContent || '').slice(0, 200); });
    await stGo(O); await sleep(2500);
    const r = await ev(() => { const box = document.querySelector('.gc-money-imp [data-c="depmatch"]'); const ld = window._gcMoney && window._gcMoney.lastDeposits; return { panel: box ? box.innerText.replace(/\s+/g, ' ').slice(0, 400) : '', certain: ld ? ld.certain.map(x => x.invId + ' ' + x.amt) : null, unsure: ld ? ld.unsure.map(u => u.dep.amount + ' ' + u.why) : null, added: ld && ld.added,
      pm: (() => { try { return JSON.parse(localStorage.getItem('gc_pay_matches') || '[]').filter(m => m.status === 'new').map(m => m.invId + ' ' + m.amt); } catch (e) { return []; } })(), i1: (window._crm.invoices.find(i => i.id === 'INVagt1') || {}).status, i3: (window._crm.invoices.find(i => i.id === 'INVagt3') || {}).status }; });
    await stClose(O);
    return { ok: T.x.some(x => /AGT HOLLIS/i.test(x)) && !!r.certain && r.certain.length === 1 && /^INVagt1 5000$/.test(r.certain[0]) && r.unsure.length === 1 && /amount only/.test(r.unsure[0]) && r.pm.includes('INVagt1 5000') && r.i1 !== 'paid' && r.i3 !== 'paid',
      note: 'panel: ' + r.panel + ' · 💵 list: ' + JSON.stringify(r.pm) + ' · #1043 ' + r.i1 + ' (not applied until confirmed) · #1045 ' + r.i3 + ' · Monthly Bank Check: ' + recon, data: r };
  });
  await step(O, 'stmt', '💵 Payment matches → ✅ Confirm the $5,000 deposit → invoice #1043 paid: A/R −$5,000.00, cash +$5,000.00 exactly', async ev => {
    const r = await ev(async () => {
      let pill = null; for (let i = 0; i < 20 && !pill; i++) { pill = document.getElementById('_gcPayPill'); if (!pill) await new Promise(z => setTimeout(z, 500)); }
      if (pill) pill.click(); else if (window._gcAUTAI && window._gcAUTAI.openPayMatches) window._gcAUTAI.openPayMatches(); await new Promise(z => setTimeout(z, 1200));
      const card = [...document.querySelectorAll('.gcautai-act')].find(c => /1043/.test(c.innerText)); if (!card) return { pill: !!pill, err: 'no 1043 card on 💵 Payment matches' };
      card.querySelector('._ok').click(); for (let i = 0; i < 20; i++) { await new Promise(z => setTimeout(z, 500)); if ((window._crm.invoices.find(x => x.id === 'INVagt1') || {}).status === 'paid') break; }
      const res = (card.querySelector('._res') || {}).textContent || ''; document.querySelectorAll('.gcautai-sheet, [class*=gcautai-ov]').forEach(x => { try { x.remove(); } catch (e) {} });
      const i = window._crm.invoices.find(x => x.id === 'INVagt1') || {}; return { pill: !!pill, res, status: i.status, paidDate: i.paidDate, payments: (i.payments || []).map(p => p.amt + ' ' + p.date + ' ' + p.method) };
    });
    return { ok: r.status === 'paid' && r.paidDate === '2026-10-20', note: JSON.stringify(r), data: r };
  });
  { const last = RESULTS[RESULTS.length - 1], d = last.money.delta; const okp = near(d.ar, -5000) && near(d.cashIn, 5000);
    console.log((okp ? '     ↑ ' : 'FAIL ↑ ') + 'A/R ' + money$(d.ar || 0) + ' (right −$5,000.00), cash ' + money$(d.cashIn || 0) + ' (right +$5,000.00)'); if (!okp) { fails += last.ok ? 1 : 0; last.ok = false; last.note += ' · A/R ' + money$(d.ar || 0) + ', cash ' + money$(d.cashIn || 0); } }
}

/* ─────────── 3. e-mailed receipts / sub invoices ─────────── */
function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}
let MAILED = {};
if (want('mail')) {
  await step(O, 'mail', '📧 three e-mails arrive (server: money-mail.js / subinv.js, real handlers): a receipt, a sub invoice with a PO, an unknown sender', async ev => {
    const MM = req('./_lib/money-mail.js'), MB = req('./_lib/money-box.js'), storeFile = req('./bid-inbox.js')._lib.storeFile;
    let n = 0; const mail = o => Object.assign({ id: 'agtm' + (++n), messageId: '<agt' + n + '.' + NOW + '@test>', subject: '', text: '', html: '', date: iso(NOW - 600e3), files: [], headers: {} }, o);
    const file = (name, lines) => { const b = pdf(lines); return { name, type: 'application/pdf', size: b.length, buf: b }; };
    const out = {};
    out.receipt = await MM.fromEmail(mail({ from: { email: 'sbiffle@grayco-cs.com', name: 'Steven Biffle' }, to: ['receipts@grayco-cs.com'], subject: 'Agt hardware receipt', files: [file('receipt.pdf', ['AGT HARDWARE SUPPLY', 'RECEIPT', 'Deliver to: 4471 Quarry Bend Dr, Bartlett TN', 'SUBTOTAL 196.20', 'TOTAL $212.48'])] }), 'receipt', MB.moneyDeps(storeFile, { via: 'receipts@' }));
    out.sub = await MM.fromEmail(mail({ from: { email: 'office@agt-delta.test', name: 'Agt Delta Gutter Co' }, to: ['invoices@grayco-cs.com'], subject: 'Invoice DG-5531', files: [file('DG-5531.pdf', ['AGT DELTA GUTTER CO', 'Invoice #: DG-5531', 'Invoice Date: 10/30/2026', 'PO #: Q902', 'Seamless gutters 1880 Wren Hollow Rd   $1,240.00', 'Total Due: $1,240.00'])] }), 'sub_invoice', MB.moneyDeps(storeFile, { via: 'invoices@' }));
    out.unknown = await MM.fromEmail(mail({ from: { email: 'billing@agt-stranger.test', name: 'Agt Stranger Services' }, to: ['invoices@grayco-cs.com'], subject: 'Invoice 77', files: [file('77.pdf', ['AGT STRANGER SERVICES', 'Invoice #: 77', 'Total Due: $640.00'])] }), 'sub_invoice', MB.moneyDeps(storeFile, { via: 'invoices@' }));
    MAILED = out;
    const r = await ev(async () => { try { await window._gcMoneyMail.pull(); } catch (e) {} await new Promise(z => setTimeout(z, 6000)); try { await window._gcMoneyMail.pull(); } catch (e) {} await new Promise(z => setTimeout(z, 4000));
      const ex = window._crm.expenses.find(e => /Receipt e-mailed in/.test(e.desc || '') && Math.abs(e.amt - 212.48) < 0.01) || null;
      const si = window._crm.invoices.find(i => /DG-5531/.test(i.invNum || '')) || null;
      const st = window._gcMoneyMail.state ? window._gcMoneyMail.state() : {};
      return { list: (st.list || []).length, exp: ex && { pid: ex.pid, status: ex.status, receipt: !!ex.receipt, amt: ex.amt }, sub: si && { pid: si.pid, status: si.status, amt: si.amt, file: !!(si.fileData || (si.files || []).length) } }; });
    const sumr = k => out[k] && (out[k].route + (out[k].jobId ? ' → ' + out[k].jobId : '') + (out[k].why ? ' (' + String(out[k].why).slice(0, 60) + ')' : ''));
    return { ok: out.receipt.route === 'book' && out.receipt.jobId === A && out.sub.route === 'book' && out.sub.jobId === BJ && out.unknown.route === 'match' && r.exp && r.exp.pid === A && r.sub && r.sub.pid === BJ, note: 'server: receipt ' + sumr('receipt') + ' · sub ' + sumr('sub') + ' · unknown ' + sumr('unknown') + ' | office CRM read ' + r.list + ' e-mail(s): receipt → ' + JSON.stringify(r.exp) + ' · sub invoice → ' + JSON.stringify(r.sub), data: r };
  });
  { const last = RESULTS[RESULTS.length - 1], d = last.money.delta; const pend = await ev(() => { const a = window._gcCostPending ? window._gcCostPending('PRJagtA') : { rows: [] }, b = window._gcCostPending ? window._gcCostPending('PRJagtB') : { rows: [] }; return { a: a.rows.map(r => r.amt), b: b.rows.map(r => r.amt) }; });
    const okp = !d.jobA && !d.jobB && pend.a.includes(212.48) && pend.b.includes(1240); console.log((okp ? '     ↑ ' : 'FAIL ↑ ') + 'booked but not approved: job costs moved A ' + money$(d.jobA || 0) + ' / B ' + money$(d.jobB || 0) + ' (right $0.00); ⏳ waiting A ' + JSON.stringify(pend.a) + ' B ' + JSON.stringify(pend.b)); if (!okp) { if (last.ok) fails++; last.ok = false; } }
  await step(O, 'mail', '📋 Approvals: "🧾 Match this invoice" for the unknown sender → pick the job → booked', async ev => {
    const r = await ev(async () => { await window.__go('approvals'); window.__clickText('^\\d+\\s+All$'); await new Promise(z => setTimeout(z, 1500));
      const set = window._gcApprovalSet(); const all = []; Object.keys(set.groups).forEach(g => set.groups[g].forEach(x => all.push({ id: String(x.id), t: String(x.title || '') + ' ' + String(x.sub || x.who || '') })));
      const inSet = all.filter(x => /Stranger|640/.test(x.t) || /Match this invoice/.test(x.t));
      for (let i = 0; i < 6 && ![...document.querySelectorAll('.apx-row')].some(x => /Agt Stranger|\$640/.test(x.innerText)); i++) { if (!window.__clickText('^Show (more|all)|^More|^Load more')) break; await new Promise(z => setTimeout(z, 800)); }
      const row = [...document.querySelectorAll('.apx-row')].find(x => /Agt Stranger|\$640/.test(x.innerText)); if (!row) return { found: false, inSet, total: all.length, kinds: [...new Set(all.map(x => x.id.split(':')[0]))] };
      row.scrollIntoView({ block: 'center' });
      const k = row.getAttribute('data-k'), text = row.innerText.slice(0, 300), btns = [...row.querySelectorAll('button')].filter(__vis).map(b => b.innerText.trim()), sels = [...row.querySelectorAll('select')];
      let picked = '';
      const mb = [...row.querySelectorAll('button')].filter(__vis).find(b => /Match/.test(b.innerText)); if (mb) { mb.click(); await new Promise(z => setTimeout(z, 1500)); }
      const top = [...document.querySelectorAll('button, [role=option], li, a')].filter(__vis).filter(b => !b.closest('.apx-row') || b.closest('.apx-row') === row).find(b => /Brentley|Q902/.test(b.innerText) && b.innerText.length < 160);
      const pk = document.querySelector('[data-si="job"]'); const pov = pk && pk.closest('div[style]') ? pk.ownerDocument : document;
      const rad = [...document.querySelectorAll('input[name="gcsi-j"]')].find(i => /Q902|Brentley/.test((i.closest('label') || i.parentElement || {}).innerText || ''));
      if (rad) { rad.click(); picked = 'picker radio'; await new Promise(z => setTimeout(z, 400)); const go0 = document.querySelector('[data-si="ok"]'); if (go0) { go0.click(); picked += ' + ' + go0.innerText.trim().slice(0, 30); } }
      const sels2 = rad ? [] : (pk && [...pk.options].some(o => /Q902|Brentley/.test(o.text)) ? [pk] : [...document.querySelectorAll('select')].filter(__vis).filter(x => [...x.options].some(o => /Q902|Brentley/.test(o.text))));   /* the picker's own job box first (never the Approvals tab's job filter) */
      if (rad) {}
      else if (top) { top.click(); picked = 'job button: ' + top.innerText.slice(0, 60); await new Promise(z => setTimeout(z, 800)); const go = [...document.querySelectorAll('[data-si="ok"]')].filter(__vis)[0] || [...document.querySelectorAll('button')].filter(__vis).find(b => /^(Book|Save|Put it on|Confirm|Match|✅)/.test(b.innerText.trim()) && !b.closest('.apx-row') && !b.closest('nav, aside, [class*=sidebar], [class*=nav]'));   /* the picker's own "Book it on this job" — never a menu item */ if (go) { go.click(); picked += ' + ' + go.innerText.trim().slice(0, 30); } }
      else if (sels2.length) { const s2 = sels2[0]; __setV(s2, [...s2.options].find(o => /Q902|Brentley/.test(o.text)).value); picked = 'picker select'; await new Promise(z => setTimeout(z, 500)); const go = [...document.querySelectorAll('[data-si="ok"]')].filter(__vis)[0] || [...document.querySelectorAll('button')].filter(__vis).find(b => /^(Book|Save|Put it on|Confirm|Match|✅)/.test(b.innerText.trim()) && !b.closest('.apx-row') && !b.closest('nav, aside, [class*=sidebar], [class*=nav]'));   /* the picker's own "Book it on this job" — never a menu item */ if (go) { go.click(); picked += ' + ' + go.innerText.trim().slice(0, 30); } }
      else picked = 'after Match: ' + [...document.querySelectorAll('button')].filter(__vis).map(b => b.innerText.trim()).filter(t => t && t.length < 40).slice(-12).join('|');
      const fin = () => window._crm.invoices.find(i => Math.abs((+i.amt || 0) - 640) < 0.01 && /stranger/i.test(i.sub || i.vendor || '')) || window._crm.expenses.find(e => Math.abs((+e.amt || 0) - 640) < 0.01 && /stranger/i.test(e.vendor || ''));
      for (let i = 0; i < 15 && !fin(); i++) await new Promise(z => setTimeout(z, 1000));
      const doneMsg = ([...document.querySelectorAll('div')].filter(__vis).map(d => d.innerText).find(t => /^✓ Booked on/.test(t || '')) || '') + ((document.querySelector('[data-si="msg"]') || {}).textContent ? ' · picker says: ' + document.querySelector('[data-si="msg"]').textContent : '') + (document.querySelector('[data-si="job"]') ? ' · job box: ' + document.querySelector('[data-si="job"]').value : '');
      const cl = [...document.querySelectorAll('[data-si="x"]')].filter(__vis).pop(); if (cl) cl.click();   /* close the picker, as a person would */
      const inv = fin();
      return { found: true, k, text, btns, sels: sels.length, picked, msg: doneMsg.slice(0, 120), booked: inv ? { id: inv.id, pid: inv.pid, type: inv.type, status: inv.status } : null, still: !!window.__row(k) };
    });
    return { ok: r.found && r.booked && r.booked.pid === BJ && !r.still, note: JSON.stringify(r).slice(0, 600), data: r };
  });
}

/* ─────────── 4. enter an invoice by hand ─────────── */
let MANUAL = {};
if (want('manual')) {
  await step(O, 'manual', '💵 + New Invoice: the job / PO autocomplete opens IN FRONT of the window', async ev => {
    await ev(async () => { await window.__go('invoices'); window.__clickText('^Client Invoices'); await new Promise(z => setTimeout(z, 800)); window.__clickText('^\\+ New Invoice$'); await new Promise(z => setTimeout(z, 1200)); const inp = [...document.querySelectorAll('input')].filter(__vis).find(i => /auto-fill|PO|project/i.test(i.placeholder || '')); if (inp) inp.setAttribute('data-agt', '1'); });
    if (!(await O.page().locator('input[data-agt="1"]').count())) return { ok: false, note: 'no PO / job box on + New Invoice' };
    try { await O.page().locator('input[data-agt="1"]').click({ timeout: 10000 }); } catch (e) { const cover = await ev(() => { const i = document.querySelector('input[data-agt="1"]'); const b = i.getBoundingClientRect(); const e2 = document.elementFromPoint(b.left + 5, b.top + 5); return e2 ? (e2.id || e2.className || e2.tagName) + ' / ' + String(e2.innerText || '').slice(0, 80) : 'nothing'; }); await O.page().keyboard.press('Escape').catch(() => {}); await ev(() => window.__clickText('^Cancel$')); return { ok: false, note: 'the PO box could not be clicked — covered by ' + cover }; }
    await O.page().keyboard.type('Agt', { delay: 40 }); await sleep(1200);
    const r = await ev(() => { const l = [...document.querySelectorAll('._ac-list, datalist, [role=listbox]')].filter(__vis)[0]; if (!l) return { ok: false, note: 'no list opened' }; const b = l.getBoundingClientRect(); const pts = [[b.left + 8, b.top + 8], [b.left + b.width / 2, b.top + b.height / 2]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && l.contains(e)); }); return { ok: pts.every(Boolean), note: pts.every(Boolean) ? 'list in front (' + l.innerText.split('\n').slice(0, 3).join(' | ') + ')' : 'the list is BEHIND the window' }; });
    await O.page().keyboard.press('Escape').catch(() => {}); await ev(() => window.__clickText('^Cancel$'));   /* end the entry, as a person would (the typing guard holds a form for 90 s) */
    return r;
  });
  const upload = (label, o) => step(O, 'manual', label, async ev => ev(async (o) => {
    const inp = window.__captureInput(() => window._gcSmartInvoiceUpload()); if (!inp) return { ok: false, note: 'no file chooser' };
    window.__give(inp, window.__file(o.file, 'application/pdf', o.b64)); let ov = null; for (let i = 0; i < 40 && !ov; i++) { await new Promise(z => setTimeout(z, 300)); ov = document.getElementById('_gcInvReview'); }
    if (!ov) return { ok: false, note: 'no review window' };
    const sels = [...ov.querySelectorAll('select')].filter(__vis);
    const front = sels.map(s => { const b = s.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e === s || s.contains(e); });
    const zi = +getComputedStyle(ov).zIndex || 0;
    const opts = sels.map(s => [...s.options].map(x => x.text));
    const subSel = sels.find(s => [...s.options].some(x => /Calhoun|Ridgeline|Delta/.test(x.text))), jobSel = sels.find(s => [...s.options].some(x => /Q902|Brentley/.test(x.text)));
    if (!subSel || !jobSel) return { ok: false, note: 'selects: ' + JSON.stringify(opts.map(x => x.slice(0, 4))) };
    const so = [...subSel.options].find(x => new RegExp(o.sub).test(x.text)); __setV(subSel, so ? so.value : subSel.value);
    __setV(jobSel, [...jobSel.options].find(x => /Q902|Brentley/.test(x.text)).value);
    const vis = [...ov.querySelectorAll('input')].filter(__vis); const amt = vis.find(i => /amount|\$/i.test(i.placeholder || '') || i.type === 'number') || vis[0]; __setV(amt, o.amt);
    const dt = vis.find(i => i.type === 'date'); if (dt) __setV(dt, '2026-10-30'); const num = vis.find(i => /invoice|#/i.test(i.placeholder || '')) || vis[2]; if (num) __setV(num, o.num);
    const save = [...ov.querySelectorAll('button')].find(b => /Save/.test(b.innerText)); save.click(); await new Promise(z => setTimeout(z, 2500));
    const iv = window._crm.invoices.find(i => String(i.invNum || '').indexOf(o.num) >= 0);
    let chk = null; try { const c = iv && window._gcSubPayCheck(iv.id); chk = c && { ok: c.ok, supplier: c.supplier, problems: c.problems }; } catch (e) { chk = 'threw ' + e.message; }
    const sdiag = (so ? '' : ' · DIAG ' + JSON.stringify({ seen: window.__gcCloudSeen && window.__gcCloudSeen.subs && { n: window.__gcCloudSeen.subs.n, has: window.__gcCloudSeen.subs.ids.includes('SUBagtR') }, seenV: window.__gcCloudSeen && window.__gcCloudSeen.vendors && window.__gcCloudSeen.vendors.ids.includes('SUBagtR'), screen: (window._crm.subs || []).some(x => x && x.id === 'SUBagtR'), n: (window._crm.subs || []).length, sa: window.__gcSyncAll && window.__gcSyncAll.stats(), pend: window.__gcSyncAll && window.__gcSyncAll.pending() }));
    return { ok: !!(iv && (iv.fileData || (iv.files || []).length) && iv.pid === o.pid), note: 'sub picked "' + (so ? so.text : '(none matched ' + o.sub + ' in ' + [...subSel.options].map(x => x.text).filter(t => /agt|ridge|roof/i.test(t)).slice(0, 8).join(' / ') + ')') + '"' + sdiag + ' · dropdowns in front: ' + front.join(',') + ' (z ' + zi + ') · saved ' + (iv ? iv.id + ' type ' + iv.type + ' status ' + iv.status + ' file ' + !!(iv.fileData || (iv.files || []).length) : 'NOT saved') + ' · pay check ' + JSON.stringify(chk), data: { id: iv && iv.id, chk, front } };
  }, o));
  const r1 = await upload('📎 Upload Invoice: SUPPLIER Farrell Calhoun (isSub false) on job Q902, PDF attached', { file: 'Farrell-Calhoun-INV-55123.pdf', b64: pdf(['FARREL CALHOUN', 'INVOICE 55123', 'PO Q902', 'Total $812.40']).toString('base64'), sub: 'Farrel+ Calhoun|Ferrel Calhoun', amt: '812.40', num: 'FC55123', pid: BJ });
  const r2 = await upload('📎 Upload Invoice: SUB Agt Ridgeline Roofing (no COI / W-9) on job Q902, PDF attached', { file: 'Ridgeline-RR-3001.pdf', b64: pdf(['AGT RIDGELINE ROOFING LLC', 'Invoice #: RR-3001', 'PO #: Q902', 'Total Due: $3,200.00']).toString('base64'), sub: 'Ridgeline', amt: '3200', num: 'RR3001', pid: BJ });
  MANUAL = { sup: r1 && r1.data && r1.data.id, sub: r2 && r2.data && r2.data.id };
  await step(O, 'manual', 'paperwork rules: the supplier is NOT held to COI / W-9 (SUPPLIERPAY); the sub IS', async ev => ev((m) => {
    const a = m.sup ? window._gcSubPayCheck(m.sup) : null, b = m.sub ? window._gcSubPayCheck(m.sub) : null;
    return { ok: !!(a && a.ok && a.supplier && !(a.problems || []).length && b && !b.ok && (b.problems || []).some(x => /COI/.test(x)) && (b.problems || []).some(x => /W-9/.test(x))), note: 'supplier ' + JSON.stringify(a && { ok: a.ok, supplier: a.supplier, problems: a.problems, warnings: a.warnings }) + ' · sub ' + JSON.stringify(b && { ok: b.ok, problems: b.problems }) };
  }, MANUAL), { money: false });
  await step(O, 'manual', 'the two hand-entered invoices show on the job (Q902) and in 📋 Approvals', async ev => ev(async (m) => {
    const onJob = window._crm.invoices.filter(i => i.pid === 'PRJagtB' && (i.id === m.sup || i.id === m.sub)).length;
    let page = ''; try { window._navToJob && window._navToJob('PRJagtB'); await new Promise(z => setTimeout(z, 3000)); window.__clickText('^Invoices'); await new Promise(z => setTimeout(z, 1500)); page = (document.querySelector('main') || {}).innerText || ''; } catch (e) {}
    let inAp = [false, false]; for (let i = 0; i < 70 && !inAp.every(Boolean); i++) { if (i % 10 === 0) { try { window._gcQueueSubApprovals && window._gcQueueSubApprovals(); } catch (e) {} }   /* the sub approval list is filled by a 60 s timer (skipped while typing) */
      const set = window.__apset(); inAp = [m.sup, m.sub].map(id => set.ids.some(k => k.indexOf(id) >= 0)); if (!inAp.every(Boolean)) await new Promise(z => setTimeout(z, 1000)); }
    const sq = (() => { try { return (JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]') || []).filter(a => [m.sup, m.sub].includes(a.invId)).map(a => a.invId.slice(-6) + ':' + a.status + ':' + (a.pmName || '')); } catch (e) { return 'err'; } })();
    return { ok: onJob === 2 && inAp.every(Boolean), note: 'queue ' + JSON.stringify(sq) + ' typing ' + !!window.__GC_IS_TYPING__ + ' · on the job: ' + onJob + '/2 (job page shows FC55123 ' + /FC55123/.test(page) + ', RR3001 ' + /RR3001/.test(page) + ') · in Approvals: supplier ' + inAp[0] + ', sub ' + inAp[1] };
  }, MANUAL), { money: false });
}

/* ─────────── 5. approvals, on two computers ─────────── */
let O2 = null;
if (want('appr')) {
  console.log('── a second office computer signs in …');
  O2 = await person(OFFICE, 'office-2');
  const ev2 = mk(O2);
  process.env.RESEND_API_KEY = 're_placeholder_not_a_key'; delete process.env.PORTAL_MAIL_OFF;   /* e-mail "set up" (the fake host answers 200) */
  const ACTED = [];
  const open = () => ev(async () => { await window.__go('approvals'); window.__clickText('^\\d+\\s+All$'); await new Promise(z => setTimeout(z, 1500)); return [...document.querySelectorAll('.apx-row')].filter(__vis).map(r => ({ k: r.getAttribute('data-k'), t: r.innerText.replace(/\s+/g, ' ').slice(0, 140), b: [...r.querySelectorAll('button')].filter(__vis).map(b => b.innerText.trim()) })); });
  let AP = [];
  await step(O, 'appr', '📋 Approvals opens: the office\'s cards, the badge, the sub pay list', async ev => {
    AP = await open(); const s = await ev(() => window.__apset());
    const subRow = AP.find(r => /^sub:/.test(r.k));
    const mine = AP.filter(r => /agt|Agt|EXPagt|INVagt|FC55123|RR3001|DG-5531/.test(r.k + r.t));
    const diag = AP.length ? '' : ' · EMPTY SCREEN: view ' + (await ev(() => localStorage.getItem('grayco_view'))) + ', held ' + (await ev(() => window._gcHeldCount ? window._gcHeldCount() : -1)) + ', typing ' + (await ev(() => !!window.__GC_IS_TYPING__)) + ', main: ' + JSON.stringify((await ev(() => ((document.querySelector('main') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 300))));
    return { ok: AP.length > 0 && s.count === s.total && !!subRow && /Sub pay list closes Wednesday/.test(subRow.t), note: diag + ' · ' + AP.length + ' cards on screen, set ' + s.total + ', count ' + s.count + ', badge ' + s.badge + ' · sub card: ' + (subRow ? subRow.t.slice(0, 120) : 'none') + ' · Agt cards: ' + mine.map(r => r.k).join(', '), data: { keys: AP.map(r => r.k), set: s } };
  }, { money: false });
  const act = (k, re, wait) => ev(async ({ k, re, wait }) => { const r = window.__row(k); if (!r) return 'NOROW'; const b = [...r.querySelectorAll('button')].filter(__vis).find(b => new RegExp(re).test(b.innerText)); if (!b) return 'NOBTN ' + [...r.querySelectorAll('button')].filter(__vis).map(b => b.innerText.trim()).join('|'); b.click(); await new Promise(z => setTimeout(z, wait || 1500)); return 'ok'; }, { k, re, wait });
  const cnt = () => ev(() => { const s = window.__apset(); return s.count; });
  const pick = re => (AP.find(r => re.test(r.k + ' ' + r.t)) || {}).k;
  const one = (label, k, fn, check) => step(O, 'appr', label, async ev => {
    if (!k) return { ok: false, note: 'no such card on the office\'s list' };
    const c0 = await cnt(); const r = await fn(k); await sleep(1500);
    let gone = false; for (let i = 0; i < 20 && !gone; i++) { gone = await ev(k => !window.__row(k), k); if (!gone) await sleep(1000); }
    const c1 = await cnt(); ACTED.push(k);
    const extra = check ? await check(k) : { ok: true, note: '' };
    return { ok: r === 'ok' && gone && c1 === c0 - 1 && extra.ok, note: k + ': ' + r + ' · card gone ' + gone + ' · count ' + c0 + ' → ' + c1 + (extra.note ? ' · ' + extra.note : ''), allow: extra.allow };
  });
  const expSt = id => ev(id => { const e = window._crm.expenses.find(x => x.id === id) || {}; let a = null; try { a = (JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]') || []).find(x => x.expId === id); } catch (er) {} let t = null; try { t = (JSON.parse(localStorage.getItem('gc_office_tasks') || '[]') || []).filter(x => x && x._deny && String(x._deny.key || '').indexOf(id) >= 0).pop(); } catch (er) {} return { status: e.status, appr: a && a.status, todo: t ? (t.label || '').slice(0, 120) : null, reason: t && t._deny ? t._deny.reason : '' }; }, id);
  await one('✅ Approve an expense (Agt Supply House $321, job Q902) — "Open the APPROVE panel" → Approve', pick(/EXPagt1/), async k => { const direct = await ev(k => { const r = window.__row(k); return !!(r && [...r.querySelectorAll('button')].filter(__vis).some(b => /^✅\s*Approve$/.test(b.innerText.trim()))); }, k);
    if (direct) { const r0 = await act(k, '^✅\\s*Approve$', 1500); await sleep(6000); return r0; }   /* the card's own ✅ Approve (approved in place after the 5 s undo) */
    const r = await act(k, 'Open the APPROVE panel|^✅|^Approve', 1500); const r2 = await ev(async k => { await new Promise(z => setTimeout(z, 1200)); const near = b => { let e = b; for (let i = 0; i < 6 && e; i++, e = e.parentElement) { const t = e.innerText || ''; if (/Agt Supply House/.test(t) && /321/.test(t)) return true; if (t.length > 600) return false; } return false; }; const pool = [...document.querySelectorAll('button')].filter(__vis).filter(b => !b.closest('.apx-row')); const b = pool.find(b => /approve/i.test(b.innerText) && !/Open the APPROVE panel|Approve & send|Approve all|selected/i.test(b.innerText) && near(b)); if (!b) return 'no approve button in the panel: ' + pool.map(b => b.innerText.trim()).slice(0, 12).join('|'); b.click(); await new Promise(z => setTimeout(z, 2000)); const y = [...document.querySelectorAll('button')].filter(__vis).find(b => /^Yes|^Confirm/i.test(b.innerText.trim())); if (y) { y.click(); await new Promise(z => setTimeout(z, 1500)); } return 'ok'; }, k); return r === 'ok' ? r2 : r; }, async () => { const s = await expSt('EXPagt1'); return { ok: /approved|paid|posted/i.test(s.status), note: 'expense ' + JSON.stringify(s) }; });
  { const last = RESULTS[RESULTS.length - 1], d = last.money.delta; const okp = near(d.jobB, 321); console.log((okp ? '     ↑ ' : 'FAIL ↑ ') + 'job Q902 cost ' + money$(d.jobB || 0) + ' (right +$321.00 — counted once approved)'); if (!okp) { if (last.ok) fails++; last.ok = false; last.note += ' · job Q902 moved ' + money$(d.jobB || 0); } }
  await one('✅ Approve the sub invoice (Agt Delta $1,850 — papers OK)', pick(/INVagtS1/), k => act(k, '^✅|Approve'), async () => ev(() => { const i = window._crm.invoices.find(x => x.id === 'INVagtS1') || {}; return { ok: /approved|scheduled|paid/i.test(i.status), note: 'sub invoice ' + i.status }; }));
  await one('✕ Deny WITH a reason (expense $77.50, "wrong order — return it")', pick(/EXPagt2/), async k => { const r = await act(k, 'Deny', 800); await ev(k => { const i = document.querySelector('[data-apx-dwhy="' + k.replace(/^[^:]+:/, '') + '"]') || [...document.querySelectorAll('[data-apx-dk] input')].pop(); if (i) window.__setV(i, 'wrong order — return it'); const b = [...document.querySelectorAll('[data-apx-dk] button')].find(b => /Send back/.test(b.innerText)); if (b) b.click(); }, k); await sleep(2500); return r; },
    async () => { await sleep(1500); const s = await expSt('EXPagt2'); return { ok: !!s.todo && /wrong order/.test(s.reason || s.todo), note: 'sent back: ' + JSON.stringify(s) + (/denied|rejected/i.test(s.status + ' ' + s.appr) ? '' : ' — the expense itself stays "' + s.status + '" (still counted: see the money step)') }; });
  await one('✕ Deny WITHOUT a reason (expense $18.25) — the 10 s undo runs out', pick(/EXPagt3/), async k => { const r = await act(k, 'Deny', 800); await sleep(11500); return r; },
    async () => { const s = await expSt('EXPagt3'); return { ok: !!s.todo, note: 'sent back: ' + JSON.stringify(s) + (/denied|rejected/i.test(s.status + ' ' + s.appr) ? '' : ' — the expense itself stays "' + s.status + '"') }; });
  const sendK = (AP.find(r => /^ap2:appr_agt_mail/.test(r.k) && r.b.some(b => /Approve & send/.test(b))) || AP.find(r => r.b.some(b => /Approve & send/.test(b)) && /agt/i.test(r.k + r.t)) || AP.find(r => r.b.some(b => /Approve & send/.test(b))) || {}).k;
  await one('✅ Approve & send (a customer e-mail; two-step confirm)', sendK, async k => { const r = await act(k, 'Approve & send', 1200); await act(k, 'Yes, approve', 4000); return r; },
    async k => { const call = O.calls.filter(x => x.fn === 'portal' && /"op":"approve"/.test(x.b)).pop(); return { ok: !!call && call.status === 200, note: 'portal approve → ' + (call ? call.status + ' ' + (call.err || '') : 'no call') }; });
  const denyK = (AP.find(r => /^ap2:appr_agt_mail/.test(r.k) && r.k !== sendK && r.b.some(b => /Deny/.test(b))) || AP.find(r => /^ap2:/.test(r.k) && r.k !== sendK && r.b.some(b => /Deny/.test(b)) && /agt/i.test(r.k + r.t)) || AP.find(r => /^ap2:/.test(r.k) && r.k !== sendK && r.b.some(b => /Deny/.test(b))) || {}).k;
  await one('✕ Deny a customer e-mail (sent back)', denyK, async k => { const r = await act(k, 'Deny', 800); await sleep(11500); return r; },
    async k => { const call = O.calls.filter(x => x.fn === 'portal' && /"op":"reject"/.test(x.b)).pop(); return { ok: !!call && call.status === 200, note: 'portal reject → ' + (call ? call.status : 'no call') }; });
  const asgK = (AP.find(r => r.b.some(b => /Assign/.test(b)) && /Agt Held/.test(r.t)) || AP.find(r => r.b.some(b => /Assign/.test(b))) || {}).k;
  await one('👤 Assign this lead (picker → a person)', asgK, async k => { const r = await act(k, 'Assign', 1200); const p = await ev(() => { const pk = document.getElementById('gcl-asgpick'); if (!pk) return 'no picker'; const names = [...pk.querySelectorAll('button')].filter(__vis).map(b => b.innerText.trim()); const b = [...pk.querySelectorAll('button')].filter(__vis).find(b => /Steven Biffle|Glenn Miller|Nick Thomas/.test(b.innerText)); if (b) b.click(); return names.slice(0, 6).join('|'); }); await sleep(3000); return r === 'ok' ? 'ok' : r + ' / ' + p; },
    async () => { const L = await ev(() => { const l = window._crm.leads.find(x => x.id === 'LAGTHOLD1') || {}; return { pm: l.pm, hold: l.hold && l.hold.state }; }); return { ok: true, note: 'lead ' + JSON.stringify(L) }; });
  await step(O, 'appr', 'money after approvals: approved costs in job cost / P&L; pending shown apart ("⏳ Waiting"); denied nowhere', async ev => ev(async () => {
    const inPnl = id => { const rows = window._gcAcctModel({ range: { from: '', to: '' } }).pnl.rows.job; return rows.some(r => r.id === id || (r.src && (r.src.srcInvId === 'SUB_' + id || r.src.subInvId === id || r.src.id === id))); };
    let sub = false; for (let i = 0; i < 40 && !(sub = inPnl('INVagtS1')); i++) { try { window._gcRefreshSpend && window._gcRefreshSpend(); } catch (e) {} await new Promise(z => setTimeout(z, 1000)); }
    const pend = window._gcCostPending ? window._gcCostPending() : { rows: [] }, pid = id => pend.rows.some(r => r.id === id);
    let tile = null; try { const t = window._gcJobMoneyTiles((window._crm.projects || []).find(p => p.id === 'PRJagtA'), { spent: 0, contract: 24000, profit: 0, margin: 0 }, v => '$' + v, { grn: '', red: '' }, true); tile = (t.find(x => /Waiting for approval/.test(x.l)) || {}).v || null; } catch (e) { tile = 'err ' + e.message; }
    let pl = ''; try { window._gcAcctOpen('k_pnl'); } catch (e) {} for (let i = 0; i < 20 && !pl; i++) { await new Promise(z => setTimeout(z, 500)); const w = document.querySelector('[data-acctfix2="waiting"]'); if (w) pl = w.innerText.replace(/\s+/g, ' '); }
    const r = { approvedExp: inPnl('EXPagt1'), approvedSub: sub, deniedReason: inPnl('EXPagt2'), denied: inPnl('EXPagt3'), pendingA1: inPnl('EXPagtA1'), deniedPending: pid('EXPagt2') || pid('EXPagt3'), waitingA1: pid('EXPagtA1'), tileA: tile, plLine: pl, waitingTotal: pend.total };
    return { ok: r.approvedExp && r.approvedSub && !r.deniedReason && !r.denied && !r.pendingA1 && !r.deniedPending && r.waitingA1 && /\$/.test(String(tile)) && /Waiting for approval/.test(pl), note: JSON.stringify(r) };
  }), { money: false });
  await step(O2, 'appr', 'the SECOND office computer (no reload): every acted card gone within 60 s, same count', async ev2 => {
    let s = null, left = ACTED; for (let i = 0; i < 30; i++) { s = await ev2(() => window.__apset()); left = ACTED.filter(k => s.ids.includes(k)); if (!left.length) break; await sleep(2000); }
    const s1 = await ev(() => window.__apset());
    return { ok: !left.length && s.count === s1.count, note: 'still on computer 2: ' + JSON.stringify(left) + ' · count here ' + s.count + ' vs computer 1 ' + s1.count };
  }, { money: false });
  await step(O, 'appr', 'computer 1 reloads: the acted cards stay gone', async () => {
    await O.page().reload(); await waitFor(O, () => !!(window._crm && window._crm.projects && window._crm.projects.length > 50 && window._setView), null, 150000, 500); await sleep(9000); await O.page().evaluate(H_JS);
    const s = await ev(() => window.__apset()); const back = ACTED.filter(k => s.ids.includes(k));
    return { ok: !back.length, note: 'came back: ' + JSON.stringify(back) + ' · count ' + s.count };
  }, { money: false });
  await O2.b.close(); O2 = null;
}

/* ─────────── 6. collections / A/R ─────────── */
if (want('coll')) {
  await step(O, 'coll', '📬 Collections lists the overdue invoice #1044 ($2,750, Agt Hollis)', async ev => ev(async () => {
    window._gcOpenCollectionsDesk(); await new Promise(z => setTimeout(z, 2500)); const ov = document.getElementById('gcoff-coll-ov'); const t = ov ? ov.innerText : ''; const has = !!(ov && ov.querySelector('[data-offrem="INVagt2"]')); if (ov) ov.remove();
    return { ok: has, note: has ? 'listed' : 'not listed (' + t.slice(0, 160) + ')' };
  }), { money: false });
  await step(O, 'coll', '💵 mark invoice #1044 paid (job → Invoices → Mark Paid) → A/R −$2,750, cash +$2,750', async ev => {
    O.prompts.push('2750', new Date().toISOString().slice(0, 10), 'Check');
    const r = await ev(async () => { const pre = window._crm.invoices.find(i => i.id === 'INVagt2').status; try { await window.gcProjInvoices.markPaid('INVagt2'); } catch (e) { return { err: e.message }; } await new Promise(z => setTimeout(z, 3000)); const i = window._crm.invoices.find(i => i.id === 'INVagt2') || {}; return { pre, status: i.status, paidDate: i.paidDate, paid: i.paid }; });
    await sleep(1000);
    return { ok: /paid/i.test(r.status || ''), note: JSON.stringify(r), data: r };
  });
  {
    const last = RESULTS[RESULTS.length - 1], d = last.money.delta;
    const okp = near(d.ar, -2750) && near(d.cashIn, 2750);
    console.log((okp ? '     ↑ ' : 'FAIL ↑ ') + 'A/R ' + money$(d.ar || 0) + ' (right −$2,750.00), cash-basis income ' + money$(d.cashIn || 0) + ' (right +$2,750.00)');
    if (!okp) { fails++; last.ok = false; last.note += ' · A/R moved ' + money$(d.ar || 0) + ', cash ' + money$(d.cashIn || 0); }
  }
}

/* ─────────── 7. print / PDF statement ─────────── */
if (want('stmt7')) {
  await step(O, 'stmt7', '🧾 Customer statement (Agt Hollis, Jan 1 → today): the doors, invoices / payments / balance / aging exact, no internal notes', async ev => {
    const r = await ev(async () => {
      try { if (window._gcPushAll) await window._gcPushAll(); } catch (e) {} await new Promise(z => setTimeout(z, 5000));
      const out = {};
      /* the doors: the customer's profile and the job's 🧰 Job tools */
      try { window._gcOpenCustomerProfile('Agt Hollis'); await new Promise(z => setTimeout(z, 1200)); const ovs = document.querySelectorAll('._gcSheetOv'); const ov = ovs[ovs.length - 1]; out.profileBtn = !!(ov && ov.querySelector('[data-acctstmt]')); if (ov) ov.remove(); } catch (e) { out.profileBtn = 'err ' + e.message; }
      try { const bar = document.createElement('div'); bar.setAttribute('data-pid', 'PRJagtA'); if (window._gcMkt2Deco) window._gcMkt2Deco(bar); out.jobBtn = !!bar.querySelector('[data-acctstmt-pid]'); } catch (e) { out.jobBtn = 'err ' + e.message; }
      const ov = window._gcStatement.open({ customer: 'Agt Hollis' }); const j = await ov.__ready;
      const page = ov.querySelector('[data-st="page"]'), st = ov.__statement || {};
      out.ok = !!j.ok; out.err = j.error; out.rows = (st.rows || []).map(r => r.kind + ' ' + r.ref.replace(/^.*#/, '#').split(' ')[0] + ' ' + r.date + ' ' + (r.charge || -r.credit) + ' → ' + r.balance);
      out.balanceDue = st.balanceDue; out.aging = st.aging; out.text = page.innerText.replace(/\s+/g, ' ');
      out.leak = /INTERNAL|margin note|Agt progress draw|Agt closing draw|Supply House|Delta Gutter/.test(out.text);
      window.__OPENED.length = 0; ov.querySelector('[data-st="print"]').click(); await new Promise(z => setTimeout(z, 800)); out.print = window.__OPENED.length > 0 && /STATEMENT/.test((window.__OPENED_W && window.__OPENED_W.document._h) || '');
      window.__OPENED.length = 0; ov.querySelector('[data-st="pdf"]').click(); await new Promise(z => setTimeout(z, 3000)); out.pdf = window.__OPENED.length > 0 || /PDF saved/.test(ov.querySelector('[data-st="msg"]').textContent); out.pdfMsg = ov.querySelector('[data-st="msg"]').textContent;
      window.__fspy = []; { const of = window.fetch; window.fetch = function(u, o){ const e = { u: String(u && u.url || u).slice(0, 70), b: String(o && o.body || '').slice(0, 50), t: Date.now() }; window.__fspy.push(e); const p = of.apply(this, arguments); Promise.resolve(p).then(r => { e.st = r && r.status; e.ms = Date.now() - e.t; }, x => { e.err = String(x).slice(0, 80); }); return p; }; }   /* which call the e-mail button made, and what came back */
      ov.querySelector('[data-st="mail"]').click(); for (let i = 0; i < 240 && !/✉ On ✅ Approvals|already waiting|⚠|Not put|No customer|paused|[Ee]rror/.test(ov.querySelector('[data-st="msg"]').textContent); i++) await new Promise(z => setTimeout(z, 500)); out.mail = ov.querySelector('[data-st="msg"]').textContent; out.fspy = JSON.stringify(window.__fspy.filter(e => /functions/.test(e.u)).slice(0, 6)); out.mailMs = (window.__fspy.find(e => /office-board/.test(e.u)) || {}).ms;
      ov.remove(); return out;
    });
    const q = (() => { const v = cloud.get('gc_approval_queue'); let l = v && v.value; if (typeof l === 'string') l = JSON.parse(l); return (l || []).filter(x => x.kind === 'customer_statement'); })();
    const AG = r.aging || {}, rowsWant = ['Invoice #1044 2026-09-10 2750 → 2750', 'Invoice #1043 2026-10-01 5000 → 7750', 'Invoice #1045 2026-10-20 1200 → 8950', 'Payment #1043 2026-10-20 -5000 → 3950'];
    const okRows = rowsWant.every((w, i) => r.rows && r.rows[i] === w) && r.rows.length === 5 && /^Payment #1044 \d{4}-\d\d-\d\d -2750 → 1200$/.test(r.rows[4]);
    return { ok: r.ok && r.profileBtn === true && r.jobBtn === true && okRows && r.balanceDue === 1200 && AG.current === 1200 && !AG.d30 && !AG.d60 && !AG.d90 && !AG.d90p && !r.leak && r.print && r.pdf && /On ✅ Approvals/.test(r.mail) && q.length === 1 && q[0].to === 'agt.hollis@example.invalid' && q[0].status === 'waiting',
      note: 'doors: profile ' + r.profileBtn + ', job tools ' + r.jobBtn + ' · rows ' + JSON.stringify(r.rows) + ' · balance due ' + r.balanceDue + ' · aging ' + JSON.stringify(AG) + ' · internal text shown: ' + r.leak + ' · 🖨 ' + r.print + ' · 📄 ' + r.pdf + ' (' + (r.pdfMsg || '') + ') · ✉ ' + r.mail + ' · Approvals items: ' + q.length + (q[0] ? ' to ' + q[0].to + ' (' + q[0].status + ')' : '') + (r.err ? ' · ERR ' + r.err : '') + (/On ✅ Approvals/.test(r.mail || '') ? '' : ' · page calls: ' + r.fspy + ' · office-board calls: ' + JSON.stringify(O.calls.filter(x => x.fn === 'office-board').slice(-3).map(x => x.status + ' ' + String(x.err || '').slice(0, 80) + ' ' + String(x.b || '').slice(0, 60)))), data: r };
  }, { money: false });
}

/* ─────────── 8. permissions: a PM, marketing ─────────── */
if (want('perm')) {
  await step(O, 'perm', 'office: no 401 / 403 / 5xx from our functions all session', async () => {
    const bad = O.calls.filter(x => x.status === 401 || x.status === 403 || x.status >= 500);
    const by = {}; bad.forEach(x => { const k = x.m + ' ' + x.fn + (x.q.split('&')[0]) + ' ' + x.status; by[k] = (by[k] || 0) + 1; });
    return { ok: !bad.length, note: bad.length ? JSON.stringify(by).slice(0, 700) : 'none (' + O.calls.length + ' calls)', data: { by, sample: bad.slice(0, 8).map(x => [x.fn + x.q, x.status, (x.err || '').slice(0, 100)]) } };
  }, { money: false });
  await O.b.close();
  console.log('── a PM (sbiffle) signs in …');
  const P = await person(PM, 'pm');
  await step(P, 'perm', 'PM: only HIS jobs\' items on Approvals (Agt Hollis = his; Agt Brentley = not); no money screens; moneymail refused', async ev => ev(async () => {
    const s = window.__apset(); const ids = s.ids.join(' ');
    const r = { his: /EXPagtA1/.test(ids), notHis: ['EXPagt1', 'EXPagt2', 'EXPagt3', 'INVagtS1', 'appr_agt_mail', 'FC55123', 'RR3001'].filter(x => ids.indexOf(x) >= 0), views: ['pnl', 'payroll', 'invoices', 'expenses'].filter(v => window._gcViewAllowed && window._gcViewAllowed(v)), count: s.count };
    const mm = await fetch('/.netlify/functions/bid-inbox?moneymail=1').then(x => x.status).catch(() => 0); r.moneymail = mm;
    r.cash = window.__GC_SEC2 ? window.__GC_SEC2.can('gc_accounts_ledger', 'read') : null;
    return { ok: r.his && !r.notHis.length && !r.views.includes('pnl') && !r.views.includes('payroll') && mm === 403 && !r.cash, note: JSON.stringify(r), allow: [{ fn: 'bid-inbox', status: 403 }] };
  }).then(r => Object.assign(r, { allow: [{ fn: 'bid-inbox', status: 403 }] })), { money: false });
  await P.b.close();
  console.log('── marketing (Agt Marketing, Marketing Manager) signs in …');
  const M = await person(MKT, 'marketing');
  await step(M, 'perm', 'Marketing: no money / approval items, no money screens, moneymail refused', async ev => ev(async () => {
    let s = { ids: [], count: 0 }; try { s = window.__apset(); } catch (e) {}
    const money = s.ids.filter(k => /^(exp|sub|inv|pay|mat):|EXPagt|INVagt|appr_agt|hot1|leadhold|Match/.test(k));
    const views = ['pnl', 'payroll', 'invoices', 'expenses', 'approvals', 'payments'].filter(v => window._gcViewAllowed && window._gcViewAllowed(v));
    const mm = await fetch('/.netlify/functions/bid-inbox?moneymail=1').then(x => x.status).catch(() => 0);
    return { ok: !money.length && !views.length && mm === 403, note: JSON.stringify({ money, views, moneymail: mm, count: s.count }) };
  }).then(r => Object.assign(r, { allow: [{ fn: 'bid-inbox', status: 403 }] })), { money: false });
  await M.b.close();
} else await O.b.close().catch(() => {});

/* ══════════ report ══════════ */
fs.writeFileSync(path.join(OUT, 'acctgate.json'), JSON.stringify({ build: BUILD, at: new Date().toISOString(), results: RESULTS, mailed: MAILED }, null, 1));
console.log('\n| # | Who | Flow | Step | Pass | 4xx/5xx | Page errors | Long tasks >1 s | Money Δ | Notes |\n|---|---|---|---|---|---|---|---|---|---|');
for (const r of RESULTS) console.log('| ' + [r.n, r.who, r.group, r.name, r.ok ? 'PASS' : 'FAIL', r.bad.join('; ') || '-', r.pageErrors.join('; ').slice(0, 120) || '-', r.longTasks.join(', ') || '-', Object.keys(r.money.delta).length ? JSON.stringify(r.money.delta) : '-', r.note.slice(0, 260)].map(x => String(x).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ') + ' |');
console.log('\nreport: ' + path.join(OUT, 'acctgate.json'));
try { fs.rmSync(FX, { recursive: true, force: true }); } catch (e) {}
console.log(fails ? '\nACCTGATE: FAIL (' + fails + ')' : '\nACCTGATE: PASS');
process.exit(fails ? 1 : 0);
