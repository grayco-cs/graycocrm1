// test_LUMPACCT.mjs [build-dir] [shot-dir] — patch LUMPACCT (owner 11/13, with LUMPSUM):
//   "running account number for some companies — when we pay a monthly payment it needs to be written down in there so it's running
//    invoices and open invoices" and "I want invoices from companies to be paid 30 days after we get the invoice, on the payroll for
//    approval, so we won't send huge checks all the time — we'll do every invoice we get net 30".
// Offline. index.html's OWN scripts in a page with small stubs (no harness_N): the existing SUB PAY TERMS block (_gcSubTerms /
// _gcSubPayDate / _gcStampSubTerms), its Friday wrapper, the Friday check run (_gcChecksDue), 💵 Everyone we owe (_gcEveryoneWeOwe),
// SUPPLIERINV (who is a supplier), the Accounting rules, LUMPSUM and LUMPACCT. The clock is fixed at Fri 2026-11-13. Made-up data only.
//   H. Net 30: a supplier bill pays received + 30 days on that week's Friday; subs keep the Wednesday → Friday rule; vendor terms
//      (Net 15) and a per-invoice choice / typed date win; the pay lists use the date; ⏸ hold keeps it off them; 🧾 one check per vendor.
//   I. 📒 account: account # + terms on the vendor record, every invoice (job + address, QB #, due, due in N days), every payment (which
//      invoices the lump sum covered), running balance, open total, aging, CSV, print; 🔎 statement reconcile; crew refused.
import fs from 'fs'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 1400) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PWDIR = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright';
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = (re) => { const i = html.search(re); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const S = {
  terms: block(/══ 1\. SUB PAY TERMS/), fri: block(/f\.__subfri\) return;/), run: block(/window\._gcChecksDue = async function/), owe: block(/window\._gcEveryoneWeOwe = async function/),
  sup: block(/__GC_PATCH_SUPPLIERINV__ \(owner 11\/9/), acct: block(/if\(window\.__GC_ACCT_K__\) return;/), lump: block(/__GC_PATCH_LUMPSUM__ \(owner 11\/13/), va: block(/__GC_PATCH_LUMPACCT__ \(owner 11\/13/) };
ok('H0 index.html has the blocks (sub pay terms, the Friday wrapper, check run, Everyone we owe, SUPPLIERINV, Accounting rules, LUMPSUM, LUMPACCT)', Object.values(S).every(x => x.length > 3000), Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.length])));

const P = [{ id: 'PJ1', name: 'Demo Kitchen', address: '1 Demo St, Memphis', client: 'Pat Demo', autoPO: 'T601', status: 'active' }, { id: 'PJ2', name: 'Demo Bath', address: '2 Demo Ave, Memphis', client: 'Lee Demo', autoPO: 'T602', status: 'active' }];
const b = (id, pid, sub, n, amt, d, extra) => Object.assign({ id, type: 'sub', pid, sub, invNum: n, amt, recvDate: d, date: d, status: 'approved', po: pid === 'PJ1' ? 'T601' : 'T602' }, extra || {});
const INV0 = [
  b('S1', 'PJ1', 'Demo Lumber Supply', 'DL-1', 1000, '2026-10-14'),                       /* Wed → due Fri 11/13 → pays 11/13 */
  b('S2', 'PJ2', 'Demo Lumber Supply', 'DL-2', 500, '2026-10-02', { qbNum: 'Q77' }),     /* due Sun 11/01 → that week's Friday 10/30 */
  b('S3', 'PJ1', 'Demo Lumber Supply', 'DL-3', 250, '2026-11-02'),                       /* due Wed 12/02 → Fri 12/04 */
  b('S4', 'PJ2', 'Demo Lumber Supply', 'DL-4', 300, '2026-07-01', { status: 'paid', paidDate: '2026-08-01', checkNo: '3001' }),
  b('S5', 'PJ1', 'Demo Lumber Supply', 'DL-5', 400, '2026-11-09', { status: 'received' }),
  b('K1', 'PJ1', 'Zed Drywall', 'ZD-1', 2000, '2026-11-09'),                              /* a sub: Mon → in by Wed 11/11 → Fri 11/13 */
  b('K2', 'PJ2', 'Zed Drywall', 'ZD-2', 900, '2026-11-12'),                               /* Thu → missed Wed → Fri 11/20 */
  b('F1', 'PJ2', 'Farrell Calhoun Paint', 'FC-9', 640, '2026-10-12')];                   /* Mon → due Wed 11/11 → Fri 11/13 */
const USERS = [{ id: 'u2', name: 'Brittany Demo', email: 'office@grayco-cs.test', role: 'Office Manager' }];

const { chromium } = require(PWDIR);
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const KV = {};
const C = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
await C.route('**/*', async r => {
  const rq = r.request(), u = new URL(rq.url());
  if (u.host === 'crm.test') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app"></main></body></html>' });
  if (u.host === 'sb.test' && u.pathname === '/rest/v1/gc_kv') {
    if (rq.method() === 'POST') { const x = JSON.parse(rq.postData()); KV[x.key] = x.value; return r.fulfill({ status: 201, body: '' }); }
    const k = (u.searchParams.get('key') || '').replace(/^eq\./, '');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KV[k] !== undefined ? [{ key: k, value: KV[k] }] : []) });
  }
  return r.fulfill({ status: 404, body: '' });
});
const pg = await C.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); pg.on('dialog', d => d.accept());
await pg.clock.install({ time: new Date('2026-11-13T10:00:00') });
await pg.goto('https://crm.test/');
await pg.evaluate(([inv, projects, users]) => {
  localStorage.setItem('grayco_sb_url', 'https://sb.test'); localStorage.setItem('grayco_sb_key', 'anon-test'); localStorage.setItem('grayco_user', 'office@grayco-cs.test');
  window.__WHO = 'office';
  window.__GC_AUTH__ = { email: () => window.__WHO + '@grayco-cs.test', isAdmin: () => false };
  window._gcFullAccess = () => window.__WHO === 'office';
  window._crm = { invoices: inv, projects, expenses: [], users, vendors: [], subs: [{ id: 'SZ', name: 'Zed Drywall', isSub: true }], gcAcctRegister: [] };
  window._setInvoices = fn => { window._crm.invoices = typeof fn === 'function' ? fn(window._crm.invoices) : fn; };
  window._setExpenses = fn => { window._crm.expenses = fn(window._crm.expenses); };
  window._setVendors = v => { window._crm.vendors = typeof v === 'function' ? v(window._crm.vendors) : v; };
  window._setSubs = v => { window._crm.subs = typeof v === 'function' ? v(window._crm.subs) : v; };
  const IDB = {}; window.idbGet = async k => k === 'invs' ? JSON.parse(JSON.stringify(window._crm.invoices)) : IDB[k]; window.idbSet = async (k, v) => { IDB[k] = v; };
  window._gcAddToRegister = () => Promise.resolve(); window._gcRemoveFromRegister = () => Promise.resolve();
  window._gcInvoiceApproved = iv => /approved|partial/.test(String(iv.status));
}, [JSON.parse(JSON.stringify(INV0)), P, USERS]);
for (const k of ['terms', 'fri', 'run', 'owe', 'sup', 'acct', 'lump', 'va']) await pg.addScriptTag({ content: S[k] });
await pg.clock.runFor(5000);
const inv = id => pg.evaluate(id => JSON.parse(JSON.stringify(window._crm.invoices.find(x => x.id === id))), id);

/* ─── H. Net 30 ─── */
{
  await pg.evaluate(() => window._gcVendorAcct.stampNet());
  const d = await pg.evaluate(() => { const I = id => window._crm.invoices.find(x => x.id === id); return { s1: window._gcSubPayDate(I('S1')), s2: window._gcSubPayDate(I('S2')), s3: window._gcSubPayDate(I('S3')), f1: window._gcSubPayDate(I('F1')), k1: window._gcSubPayDate(I('K1')), k2: window._gcSubPayDate(I('K2')), t1: window._gcSubTerms(I('S1')), tk: window._gcSubTerms(I('K1')), sup: window._gcIsSupplierInv(I('F1')) }; });
  ok('H1 a supplier bill is Net 30 on that week\'s Friday: received Wed 10/14 → due 11/13 → pays Fri 11/13; 10/02 → due Sun 11/01 → Fri 10/30; 11/02 → due 12/02 → Fri 12/04; Farrell Calhoun 10/12 → 11/13',
    d.t1 === 'net30' && d.s1 === '2026-11-13' && d.s2 === '2026-10-30' && d.s3 === '2026-12-04' && d.f1 === '2026-11-13' && d.sup, d);
  const kt = await pg.evaluate(() => [window._gcVendorAcct.termsFor(window._crm.invoices.find(x => x.id === 'K1')), window._crm.invoices.find(x => x.id === 'K1').payTerms]);
  ok('H2 a sub keeps its own rule (no Net 30 for subs): Zed Drywall stays on "friday" (11/09 → Fri 11/13), its date is the existing rule\'s', d.tk === 'friday' && kt[0] === null && d.k1 === '2026-11-13' && /^2026-11-(13|20)$/.test(d.k2), { d, kt });
  globalThis.K2D = d.k2;
  const s1 = await inv('S1'), s3 = await inv('S3');
  ok('H3 written on the bill (documented, not implied): payTerms net30, netDue, payDate, the rule in words', s1.payTerms === 'net30' && s1.netDue === '2026-11-13' && s1.payDate === '2026-11-13' && /Net 30 — received 10-14, due 11-13, paid Friday 11-13/.test(s1.payDateRule) && s3.payDate === '2026-12-04', { s1, s3 });
  const due = await pg.evaluate(async () => { const o = await window._gcChecksDue('2026-11-13'); return o.subs.map(r => r.id + ':' + r.payDate).sort(); });
  ok('H4 the Friday check run 11/13 holds what is due by then: DL-1 (11/13), DL-2 (10/30, overdue), Farrell FC-9, Zed ZD-1 (and ZD-2 when the sub rule says so) — not DL-3 (12/04), not DL-5 (not approved), not DL-4 (paid)', due.join() === ['F1:2026-11-13', 'K1:2026-11-13'].concat(globalThis.K2D <= '2026-11-13' ? ['K2:' + globalThis.K2D] : []).concat(['S1:2026-11-13', 'S2:2026-10-30']).join(), due);
  await pg.evaluate(() => window._gcVendorAcct.hold('S2', true));
  const h = await pg.evaluate(async () => { const o = await window._gcChecksDue('2026-11-13'); const e = await window._gcEveryoneWeOwe(); return { run: o.subs.map(r => r.id), blocked: (o.blocked || []).filter(r => r.id === 'S2').map(r => r.why), oweDue: e.due.map(r => r.id), held: e.held.filter(r => r.id === 'S2').map(r => r.why) }; });
  ok('H5 ⏸ Hold keeps DL-2 off the check run (blocked "⏸ on hold") and off 💵 Everyone we owe (held)', !h.run.includes('S2') && h.blocked[0] === '⏸ on hold' && !h.oweDue.includes('S2') && h.held[0] === '⏸ on hold' && h.oweDue.includes('S1'), h);
  const r = await pg.evaluate(() => window._gcVendorAcct.setVendor('Demo Lumber Supply', { accountNo: 'GC-55821', payTerms: 'net15' }));
  await pg.clock.runFor(1500);
  const s1b = await inv('S1'), v = await pg.evaluate(() => window._crm.vendors.find(x => x.name === 'Demo Lumber Supply'));
  ok('H6 vendor terms Net 15 + account # on the vendor record (synced list): DL-1 10/14 → due 10/29 → Fri 10/30', r.ok && v.accountNo === 'GC-55821' && v.payTerms === 'net15' && s1b.payTerms === 'net15' && s1b.payDate === '2026-10-30', { r, v, s1b });
  const ov = await pg.evaluate(() => { const I = window._crm.invoices.find(x => x.id === 'S3'); return [window._gcSubPayDate(Object.assign({}, I, { payTerms: 'net45', termsSetBy: 'Brittany' })), window._gcSubPayDate(Object.assign({}, I, { payDateOverride: '2026-11-20' }))]; });
  ok('H7 a person\'s choice on one bill wins (Net 45 → 12/17 → Fri 12/18), and a typed pay date wins over everything', ov[0] === '2026-12-18' && ov[1] === '2026-11-20', ov);
  await pg.evaluate(() => { window._gcVendorAcct.setVendor('Demo Lumber Supply', { payTerms: 'net30' }); window._gcVendorAcct.hold('S2', false); });
  await pg.clock.runFor(1500);
  const G = await pg.evaluate(() => window._gcVendorAcct.weekGroups('2026-11-13').map(g => g.name + '|' + g.ids.sort().join('+') + '|' + g.total + '|' + g.waiting));
  ok('H8 🧾 this week\'s supplier checks (pay day 11/13): ONE per vendor — Demo Lumber Supply DL-1 + DL-2 = $1,500, Farrell Calhoun $640; subs not in it; DL-3 not due', G.join() === 'Demo Lumber Supply|S1+S2|1500|0,Farrell Calhoun Paint|F1|640|0', G);
  await pg.evaluate(() => window._gcVendorAcct.week());
  await pg.click('#gc-lump tr[data-party="Demo Lumber Supply"] [data-va="one"]');
  const sc = await pg.evaluate(() => ({ amt: document.querySelector('#gc-lump [data-lp="amount"]').value, on: [...document.querySelectorAll('#gc-lump tr.on')].map(t => t.getAttribute('data-id')), sum: document.querySelector('#gc-lump [data-lp="sum"]').textContent }));
  ok('H9 💵 Write one check → the lump-sum screen with DL-1 + DL-2 ticked, $1,500, balanced (Save writes it against each job)', sc.amt === '1500' && sc.on.sort().join() === 'S1,S2' && /✓ balanced/.test(sc.sum), sc);
  await pg.fill('#gc-lump [data-lp="checkNo"]', '5001'); await pg.click('#gc-lump [data-lp="save"]'); await pg.clock.runFor(500);
  ok('H10 saved: both bills paid with check #5001', (await inv('S1')).status === 'paid' && (await inv('S2')).checkNo === '5001');
}

/* ─── I. the account ─── */
{
  const lg = await pg.evaluate(() => { const l = window._gcVendorAcct.ledger('Demo Lumber Supply'); return JSON.parse(JSON.stringify(Object.assign({}, l, { invoices: l.invoices.map(r => Object.assign({}, r, { inv: undefined })) }))); });
  const p1 = lg.payments.find(p => p.lump) || {};
  ok('I1 📒 ledger: account # GC-55821, Net 30, 5 invoices (date, #, QB #, job + address), the payments — the $1,500 check #5001 covering DL-1 (Demo Kitchen) + DL-2 (Demo Bath), the $300 check #3001 on DL-4',
    lg.accountNo === 'GC-55821' && lg.terms === 'Net 30' && lg.invoices.length === 5 && lg.invoices[1].qbNum === 'Q77' && lg.invoices[1].address === '2 Demo Ave, Memphis' && p1.amount === 1500 && p1.ref === '5001' && p1.covers.map(x => x.invNum + '/' + x.job).sort().join() === 'DL-1/Demo Kitchen,DL-2/Demo Bath' && lg.payments.some(p => p.amount === 300 && p.ref === '3001'), lg);
  ok('I2 running balance = invoices − payments ($2,450 − $1,800 = $650), open total $650 (DL-3 $250 + DL-5 $400), aging: all current', lg.balance === 650 && lg.openTotal === 650 && lg.aging.current === 650 && lg.aging.d91 === 0 && lg.events[lg.events.length - 1].balance === 650, { b: lg.balance, o: lg.openTotal, a: lg.aging });
  const dueIn = lg.invoices.find(r => r.id === 'S3');
  ok('I3 an open bill says when: DL-3 due 12/02, pays Fri 12/04, "due in 19 days"', dueIn.due === '2026-12-02' && dueIn.pays === '2026-12-04' && dueIn.dueIn === 19, dueIn);
  await pg.evaluate(() => { window._crm.invoices.push({ id: 'S6', type: 'sub', pid: 'PJ1', sub: 'Demo Lumber Supply', invNum: 'DL-6', amt: 120, recvDate: '2026-07-20', date: '2026-07-20', status: 'approved' }); });
  const ag = await pg.evaluate(() => window._gcVendorAcct.ledger('Demo Lumber Supply').aging);
  ok('I4 aging: a July bill still open sits in 90+', ag.d91 === 120 && ag.current === 650, ag);
  await pg.evaluate(() => window._gcVendorAcct.open('Demo Lumber Supply', 'pay'));
  const scr = await pg.evaluate(() => { const o = document.getElementById('gc-lump'); return { t: o.innerText, rows: o.querySelectorAll('table[data-va="invs"] tr[data-id]').length, acct: o.querySelector('[data-va="acctno"]').value }; });
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'lumpacct_i5_account.png'), fullPage: true });
  ok('I5 the 📒 screen: account # field, aging cards, invoices with job + address and "due in 19 days", payments with what they covered, running balance', scr.acct === 'GC-55821' && scr.rows === 6 && /due in 19 days/.test(scr.t) && /90\+ days/.test(scr.t) && /1 Demo St, Memphis/.test(scr.t) && /DL-1 \(Demo Kitchen\) \$1,000\.00/.test(scr.t) && /Running balance/.test(scr.t), scr.t.slice(0, 600));
  await pg.click('#gc-lump table[data-va="invs"] tr[data-id="S3"] [data-va="hold"]'); await pg.clock.runFor(200);
  ok('I6 ⏸ Hold from the account page', (await inv('S3')).payHold === true && /on hold/.test(await pg.evaluate(() => document.getElementById('gc-lump').innerText)));
  await pg.click('#gc-lump [data-va="csv"]');
  const csv = await pg.evaluate(() => window.__gcLastCsv || '');
  ok('I7 ⬇ CSV: account, account #, every invoice and payment (what it covered), open, balance, aging', /Account #,GC-55821/.test(csv) && /DL-3/.test(csv) && /Payment \(several\)/.test(csv) && /DL-1 \$1,000\.00; DL-2 \$500\.00|DL-2 \$500\.00; DL-1 \$1,000\.00/.test(csv) && /90\+,120\.00/.test(csv), csv.slice(0, 900));
  await pg.evaluate(() => { window._gcOpenDocHTML = h => { window.__printed = h; }; });
  await pg.click('#gc-lump [data-va="print"]');
  ok('I8 🖨 Print statement: the running balance page', /account with Demo Lumber Supply/.test(await pg.evaluate(() => window.__printed || '')));
  /* their statement: DL-1, DL-3 (they say $260), and one we never got; DL-5 and DL-6 are not on it */
  const st = 'Demo Lumber Supply — Statement\nStatement date 11/12/2026   Account GC-55821\n10/14/2026 DL-1 Invoice $1,000.00\n11/02/2026 DL-3 Invoice $260.00\n11/05/2026 DL-0099 Invoice $812.40\nBalance forward $0.00\nTotal due $2,072.40';
  const rc = await pg.evaluate(t => window._gcVendorAcct.reconcile(t, 'Demo Lumber Supply'), st);
  ok('I9 🔎 reconcile: theirs not ours = DL-0099 $812.40; ours not on theirs (open, in their dates) = DL-5; DL-3 amount differs ($250 vs $260); totals lines ignored', rc.theirsOnly.length === 1 && rc.theirsOnly[0].ref === 'DL-0099' && rc.theirsOnly[0].amount === 812.4 && rc.oursOnly.map(x => x.invNum).join() === 'DL-5' && rc.differ.length === 1 && rc.differ[0].invNum === 'DL-3' && rc.matched.length === 2, rc);
  await pg.click('#gc-lump [data-va="recon"]');
  await pg.fill('#gc-lump [data-va="rtext"]', st); await pg.click('#gc-lump [data-va="rgo"]'); await pg.clock.runFor(300);
  const rt = await pg.evaluate(() => (document.querySelector('#gc-lump [data-va="recon-result"]') || {}).innerText || '');
  ok('I10 the reconcile on screen lists both sides', /On their statement, not in the CRM \(1\)/.test(rt) && /DL-0099/.test(rt) && /not on their statement \(1\)/.test(rt) && /DL-3: ours \$250\.00, theirs \$260\.00/.test(rt), rt);
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'lumpacct_i10_reconcile.png'), fullPage: true });
  await pg.evaluate(() => window._gcVendorAcct.list());
  const lt = await pg.evaluate(() => document.getElementById('gc-lump').innerText);
  ok('I11 📒 Vendor accounts: each vendor, account #, terms (subs: the Friday rule), open, next pay date', /Demo Lumber Supply\s+GC-55821\s+Net 30/.test(lt) && /Zed Drywall\s+—\s+Sub rule/.test(lt) && /Farrell Calhoun Paint/.test(lt), lt.slice(0, 500));
  await pg.evaluate(() => { window.__WHO = 'crew'; });
  const cr = await pg.evaluate(() => [window._gcVendorAcct.open('Demo Lumber Supply'), window._gcVendorAcct.setVendor('Demo Lumber Supply', { accountNo: 'X' }), window._gcVendorAcct.hold('S1', true), window._gcVendorAcct.week()]);
  ok('I12 crew refused (account, account #, hold, week)', cr[0].refused && !cr[1].ok && !cr[2].ok && cr[3].refused && (await pg.evaluate(() => window._crm.vendors[0].accountNo)) === 'GC-55821', cr);
}
ok('no page errors', errs.length === 0, errs.slice(0, 6));
await C.close(); await browser.close();
const n = R.filter(Boolean).length;
console.log('\nLUMPACCT ' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
