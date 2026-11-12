// test_QAC_crawl_money.mjs <build-dir> — patch QAC (overnight QA, area C: money, people, approvals): a click-crawl of the money tabs
// (Payroll, Accounting, Approvals, Invoices, Expenses, Sub Invoices, Payments, Admin, Office, Employees, …) for ONE role per run,
// in each company (Construction / Mitigation / Environmental / All), desktop or phone. Offline harness, made-up data only.
//   ROLE=admin|office|offmgr|pm|est|mkt   DEVICE=desk|phone   COS=construction,mitigation,environmental,all   DEEP=construction (the
//   company whose tabs get every button clicked; the others are opened + sub-tabs only)   MAXCLICK=30 (per view)   OUT=<json>   SHOTS=<dir>
// Skips destructive buttons (delete / remove / send / pay / approve / …). Records page errors, console errors, blank views, overlays left
// open, buttons that do nothing, and what each role sees when it opens a tab that is NOT in its menu (gating).
import fs from 'fs';
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { computer, signIn, sleep, cset, resetCloud } = H;
const BUILD = process.argv[2]; if (!BUILD) { console.error('usage: node test_QAC_crawl_money.mjs <build-dir>'); process.exit(2); }
const ROLE = process.env.ROLE || 'admin', DEVICE = process.env.DEVICE || 'desk';
const COS = (process.env.COS || 'construction,mitigation,environmental,all').split(',').filter(Boolean);
const DEEP = process.env.DEEP === undefined ? 'construction' : process.env.DEEP;
COS.sort((x, y) => (x === DEEP) - (y === DEEP));   /* the deep (clicking) company last, so the others are read on fresh screens */
const MAXCLICK = +(process.env.MAXCLICK || 30), MAXSUB = +(process.env.MAXSUB || 8);
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qac_shots';
const OUT = process.env.OUT || (SHOTS + '/crawl_' + ROLE + '_' + DEVICE + '.json');
fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };

/* ── the people (made-up) ── */
const PEOPLE = {
  admin:  { email: 'wjohnson@grayco-cs.com', name: 'Demo Owner', role: 'Admin', payType: 'owner' },
  office: { email: 'office@grayco-cs.com', name: 'Office Desk', role: 'Office Manager' },
  offmgr: { email: 'offmgr.demo@grayco-cs.com', name: 'Olive Demo', role: 'Office Manager', pw: 'Correct-Horse-51' },
  pm:     { email: 'sbiffle@grayco-cs.com', name: 'Sample PM', role: 'Project Manager' },
  est:    { email: 'est.demo@grayco-cs.com', name: 'Demo Estimator', role: 'Estimator', pw: 'Correct-Horse-52' },
  mkt:    { email: 'mkt.demo@grayco-cs.com', name: 'Demo Marketing', role: 'Marketing Manager', pw: 'Correct-Horse-53' }
};
for (const k of Object.keys(PEOPLE)) { const p = PEOPLE[k]; if (p.pw && !H.ACCOUNTS[p.email]) H.ACCOUNTS[p.email] = { pw: p.pw, id: 'u-' + k, role: 'staff' }; }
const ME = PEOPLE[ROLE]; if (!ME) { console.error('unknown ROLE ' + ROLE); process.exit(2); }

const ymd = d => d.toISOString().slice(0, 10), ago = d => new Date(Date.now() - d * 864e5).toISOString(), dAgo = d => ymd(new Date(Date.now() - d * 864e5));
const r2 = v => Math.round(v * 100) / 100;
function seed(){
  resetCloud();
  const U = [
    { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Office Desk', email: 'office@grayco-cs.com', role: 'Office Manager', active: true, payType: 'salary' },
    { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, payType: 'salary' },
    { id: 'u4', name: 'Olive Demo', email: 'offmgr.demo@grayco-cs.com', role: 'Office Manager', active: true },
    { id: 'u5', name: 'Demo Estimator', email: 'est.demo@grayco-cs.com', role: 'Estimator', active: true },
    { id: 'u6', name: 'Demo Marketing', email: 'mkt.demo@grayco-cs.com', role: 'Marketing Manager', active: true },
    { id: 'u7', name: 'Zedd Crew', email: 'zedd.crew@example.test', role: 'Crew', active: true, payType: 'hourly', hourlyRate: 22 },
    { id: 'u8', name: 'Molly Demo', email: 'molly.demo@example.test', role: 'Mitigation Technician', active: true, payType: 'hourly', hourlyRate: 20, companies: ['mitigation'] },
    { id: 'u9', name: 'Eve Demo', email: 'eve.demo@example.test', role: 'Environmental Technician', active: true, payType: 'hourly', hourlyRate: 24, companies: ['environmental'] }];
  cset('users', U);
  const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: u.hourlyRate || 0, otAfter: 40, otMultiplier: 1.5,
    period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }, x);
  cset('payrollProfiles', [prof('PP7', U[6]), prof('PP8', U[7]), prof('PP9', U[8]), prof('PP3', U[2], { payType: 'salary', annualSalary: 65000 })]);
  const line = (name, gross, net, x) => Object.assign({ empId: name, name, payType: 'hourly', period: 'weekly', hours: 40, otHours: 0, rate: 22, gross, fed: 50, ss: r2(gross * .062), med: r2(gross * .0145), addlMed: 0, state: 0, otherDed: 0, net,
    employerSS: r2(gross * .062), employerMed: r2(gross * .0145), futa: 0, suta: 0, status: 'pending', checkNo: '' }, x);
  const run = (id, from, to, payDate, status, by, lines, x) => Object.assign({ id, from, to, payDate, payday: payDate, date: payDate, status, createdBy: by, createdAt: ago(20), lines,
    totals: { gross: lines.reduce((s, L) => s + L.gross, 0), net: lines.reduce((s, L) => s + L.net, 0) } }, x);
  cset('payrollRuns', [run('RPAID', dAgo(23), dAgo(17), dAgo(15), 'paid', 'Demo Owner', [line('Zedd Crew', 880, 762.68, { status: 'paid', checkNo: '9001', paidOut: true })], { approvedBy: 'Demo Owner', checksWritten: true }),
    run('RPEND', dAgo(16), dAgo(10), dAgo(8), 'pending', 'Office Desk', [line('Molly Demo', 800, 690.1), line('Eve Demo', 960, 820.4)], { submittedBy: 'Office Desk' })]);
  cset('timesheets', [{ id: 'T1', userId: 'u7', name: 'Zedd Crew', date: dAgo(1), hours: 9, pid: 'C1' }, { id: 'T2', userId: 'u8', name: 'Molly Demo', date: dAgo(1), hours: 11, pid: 'M1', afterHours: true }]);
  cset('payrollSettings', { companyName: 'Demo Co LLC', hoursCutoffDay: 3 });
  cset('projects', [
    { id: 'C1', po: 'PO-3001', name: 'Demo Smith deck', client: 'Demo Smith', address: '1 Demo St', status: 'Active', type: 'Residential Reno', contract: 12000, contractSigned: true, pm: 'Sample PM', updatedAt: ago(1) },
    { id: 'M1', po: 'PO-3002', name: 'Demo Ross basement', client: 'Demo Ross', address: '2 Demo St', status: 'Active', type: 'Water Damage', companyId: 'mitigation', contract: 6000, contractSigned: true, pm: 'Sample PM', updatedAt: ago(1) },
    { id: 'E1', po: 'PO-3003', name: 'Demo Kline trim', client: 'Demo Kline', address: '3 Demo St', status: 'Active', type: 'Environmental', companyId: 'environmental', contract: 9000, contractSigned: true, pm: 'Sample PM', updatedAt: ago(1) }]);
  cset('invs', [{ id: 'I1', pid: 'C1', type: 'client', num: '3001', amount: 6000, amt: 6000, status: 'Sent', date: dAgo(10), updatedAt: ago(10) },
    { id: 'I2', pid: 'M1', type: 'client', num: '3002', amount: 3000, amt: 3000, status: 'Sent', date: dAgo(12), updatedAt: ago(12) },
    { id: 'I3', pid: 'E1', type: 'client', num: '3003', amount: 4500, amt: 4500, status: 'paid', date: dAgo(30), updatedAt: ago(30) }]);
  cset('expenses', [{ id: 'X1', pid: 'C1', vendor: 'Demo Lumber', amount: 410.5, amt: 410.5, category: 'Materials', date: dAgo(3) },
    { id: 'X2', pid: 'M1', vendor: 'Demo Rentals', amount: 220, amt: 220, category: 'Equipment', date: dAgo(2) },
    { id: 'X3', vendor: 'Demo Office Supply', amount: 55, amt: 55, category: 'Office', date: dAgo(4), companyId: 'environmental' }]);
  cset('gcAcctRegister', [{ id: 'RG1', type: 'expense', category: 'Materials', payee: 'Demo Lumber', amt: 410.5, date: dAgo(3), status: 'paid', pid: 'C1' }]);
  cset('subs', [{ id: 'S1', name: 'Ace Demo Drywall', company: 'Ace Demo Drywall', trade: 'Drywall', isSub: true, phone: '9015552000', email: 'ace@example.test' }]);
  cset('gc_tombstones', {});
}

/* ── the tabs of this area: id → the menu label ── */
const TABS = [['payroll', 'Payroll'], ['taxcenter', 'Accounting'], ['approvals', 'Approvals'], ['invoices', 'Invoices'], ['expenses', 'Expenses'], ['subinv', 'Sub Invoices'],
  ['payments', 'Payments'], ['emppay', 'All Payments'], ['pmpay', 'PM Commissions'], ['qbimport', 'QuickBooks'], ['pay', 'My Pay'], ['users', 'Employees'], ['vendors', 'Vendors'],
  ['admin', 'Admin'], ['officemanager', 'Office']];
const SKIP = /delete|remove|trash|archive|sign ?out|log ?out|\bsend|e-?mail|\btext\b|texts?\b|\bpay\b|pay now|mark paid|\bpaid\b|submit|approve|reject|deny|don.t approve|\bvoid|merge|reset|cancel subscription|wipe|erase|disconnect|restore|undo|import|upload|choose file|run payroll now|write checks|print|clear|refund|deactivate|let go|terminate|fire\b|turn off|data-entry|pause/i;
const CLOSE = /^(?=.)(?:[✕×x]\s*)?(?:close|cancel|done|back|← back|‹ back|ok|got it|not now|later|dismiss)?$/i;

seed();
const A = await computer(ME.email, { build: BUILD, mobile: DEVICE === 'phone' });
const errs = [], cons = []; let errMark = 0;
A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 240)));
A.page().on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::ERR|favicon|blockedbyclient|ERR_BLOCKED|status of 404|status of 400/.test(t)) cons.push(t.slice(0, 240)); } });
A.ctx.on('page', pg => { pg.on('pageerror', e => errs.push('POPUP ' + String(e.message).slice(0, 200))); });
await signIn(A, ME.email, 14000); await sleep(5000);
const P = () => A.page();
const ev = (fn, arg) => P().evaluate(fn, arg).catch(e => ({ __err: String(e && e.message).slice(0, 200) }));
const findings = { role: ROLE, device: DEVICE, cos: {}, gating: {}, noops: [], stuck: [], errors: [], blank: [], clicked: 0 };

/* the full CRM (role apps open on their own home first) */
async function fullCrm(){
  await ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); });
  await ev(() => { try { if (window._gcField && window._gcField.close) window._gcField.close(); } catch (e) {} });
  await sleep(1200);
}
await fullCrm();
const navLabels = async () => ev(() => [...document.querySelectorAll('aside nav button, aside button, nav button')].filter(b => !b.closest('#gc-ra-dock,#gc-fh-tabs')).map(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').replace(/^[^A-Za-z0-9]+/, '').trim()).filter(Boolean));
const view = async () => ev(() => { try { return localStorage.getItem('grayco_view') || ''; } catch (e) { return ''; } });
async function openTab(id){
  await ev(() => { try { if (window._gcDeskToDo) window._gcDeskToDo.hide('qac'); } catch (e) {} });
  await ev(i => window._setView(i), id); await sleep(1800);
}
/* overlays: fixed / absolute elements that cover a big part of the screen (modals, sheets, drawers) */
const overlays = async () => ev(() => {
  const W = innerWidth, Hh = innerHeight, out = [];
  document.querySelectorAll('body > *, body > * > div').forEach(el => {
    if (!(el instanceof HTMLElement)) return; const cs = getComputedStyle(el); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect(); if (r.width * r.height < W * Hh * 0.25) return;
    if (el.matches('#root, aside, nav, #gc-co-strip') || el.getAttribute('data-gc-keep') === '1' && !el.innerText.trim()) return;
    out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]) + ':' + (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40));
  });
  return out;
});
const mainText = async () => ev(() => { const m = document.querySelector('#root main') || document.querySelector('main') || document.body; return (m.innerText || '').replace(/\s+/g, ' ').trim(); });
/* the rows a person reads (not the options of a job picker): selects / datalists left out */
const rowText = async () => ev(() => { const m = document.querySelector('#root main') || document.querySelector('main') || document.body; const st = document.createElement('style'); st.textContent = 'select,datalist{display:none!important}'; document.head.appendChild(st); const t = (m.innerText || '').replace(/\s+/g, ' ').trim(); st.remove(); return t; });   /* what is on screen (a company's fresh page hides the rest) */
const sig = async () => ev(() => { const m = document.querySelector('#root main') || document.querySelector('main') || document.body; return (m.innerText || '').length + ':' + m.querySelectorAll('*').length + ':' + document.querySelectorAll('body *').length + ':' + location.hash; });
/* the visible buttons of the main area (and of an open overlay, if any) */
const buttons = async (scope) => ev(sc => {
  const root = sc ? document.querySelector(sc) : (document.querySelector('#root main') || document.querySelector('main'));
  if (!root) return [];
  const seen = {}, out = [];
  root.querySelectorAll('button, [role=button], a[href="#"], a[onclick], .btn').forEach((b, i) => {
    if (!b.offsetParent || b.disabled) return; const r = b.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
    const t = (b.innerText || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!t) return;
    const k = t; if (seen[k]) return; seen[k] = 1; out.push(t);
  });
  return out;
}, scope);
async function clickByText(t){
  const h = await P().evaluateHandle(tt => { const root = document.querySelector('#root main') || document.querySelector('main') || document.body;
    return [...root.querySelectorAll('button, [role=button], a[href="#"], a[onclick], .btn')].find(b => b.offsetParent && !b.disabled && (b.innerText || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 60) === tt) || null; }, t);
  const el = h.asElement(); if (!el) return 'gone';
  try { await el.click({ timeout: 2500 }); return 'ok'; } catch (e) { try { await el.evaluate(b => b.click()); return 'js'; } catch (e2) { return 'fail'; } }
}
async function closeAll(base){
  for (let i = 0; i < 4; i++) {
    const o = (await overlays()).filter(x => !base.includes(x)); if (!o.length) return [];
    await P().keyboard.press('Escape').catch(() => {}); await sleep(350);
    const o2 = (await overlays()).filter(x => !base.includes(x)); if (!o2.length) return [];
    await ev(re => { const R = new RegExp(re, 'i'); const all = [...document.querySelectorAll('button, [role=button], a, span')].filter(b => b.offsetParent && R.test((b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()));
      const top = all.filter(b => { let e = b; while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.position === 'fixed') return true; e = e.parentElement; } return false; });
      const b = top[top.length - 1]; if (b) b.click(); }, CLOSE.source); await sleep(400);
  }
  return (await overlays()).filter(x => !base.includes(x));
}
const pageOpenCount = () => A.ctx.pages().filter(p => !p.isClosed()).length;
async function closePopups(){ const pgs = A.ctx.pages().filter(p => !p.isClosed()); for (let i = 1; i < pgs.length; i++) await pgs[i].close().catch(() => {}); }
const errsSince = m => errs.slice(m);

/* crawl one view: click every non-destructive button (capped), close what opens, come back to the tab when a click moves away */
async function crawlView(tabId, label, depth, ctx){
  const base = await overlays(); const list = (await buttons()).filter(t => !SKIP.test(t));
  let n = 0; const sub = [];
  for (const t of list) {
    if (n >= MAXCLICK) break;
    const s0 = await sig(), v0 = await view(), e0 = errs.length, c0 = cons.length, p0 = pageOpenCount();
    const how = await clickByText(t); if (how === 'gone') continue; n++; findings.clicked++;
    await sleep(700);
    const s1 = await sig(), v1 = await view(), o1 = (await overlays()).filter(x => !base.includes(x)), p1 = pageOpenCount();
    const ne = errsSince(e0), nc = cons.slice(c0);
    if (ne.length) { findings.errors.push({ ctx, tab: tabId, btn: t, errs: ne }); console.log('   ⚠ page error on [' + t + '] ' + ne[0]); await P().screenshot({ path: SHOTS + '/err_' + ROLE + '_' + DEVICE + '_' + tabId + '_' + findings.errors.length + '.png' }).catch(() => {}); }
    if (nc.length) findings.errors.push({ ctx, tab: tabId, btn: t, console: nc.slice(0, 3) });
    if (p1 > p0) { await closePopups(); }
    if (s1 === s0 && v1 === v0 && !o1.length && p1 === p0) findings.noops.push({ ctx, tab: tabId, btn: t });
    if (o1.length) {
      if (depth === 0 && ctx.deep) {   /* one level inside a modal: its own buttons (non-destructive), not deeper */
        const inner = (await ev(() => { const fx = [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().width > innerWidth * 0.3).pop(); if (!fx) return []; return [...fx.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled).map(b => (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(Boolean); })) || [];
        findings.cos[ctx.co].modals = findings.cos[ctx.co].modals || []; findings.cos[ctx.co].modals.push({ tab: tabId, btn: t, inner: (inner.__err ? [] : inner).slice(0, 20) });
      }
      const left = await closeAll(base);
      if (left.length) { findings.stuck.push({ ctx, tab: tabId, btn: t, left }); await P().screenshot({ path: SHOTS + '/stuck_' + ROLE + '_' + DEVICE + '_' + tabId + '_' + findings.stuck.length + '.png' }).catch(() => {});
        await ev(() => { document.querySelectorAll('body > *').forEach(el => { if (el.id !== 'root' && getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().width * el.getBoundingClientRect().height > innerWidth * innerHeight * 0.25) el.remove(); }); }); }
    }
    if (v1 !== v0 && v1 !== tabId) { await openTab(tabId); }
    else if (depth === 0 && !o1.length && s1 !== s0) sub.push(t);   /* the view changed in place: a sub-tab or an expanded section */
  }
  return { clicked: n, sub, list };
}

const navAll = await navLabels();
findings.nav = navAll;
console.log('menu (' + ROLE + ', ' + DEVICE + '): ' + navAll.join(' | ').slice(0, 900));
for (const co of COS) {
  const r0 = await ev(c => { try { window._gcCo.setFilter(c); return window._gcCo.filter(); } catch (e) { return 'ERR ' + e.message; } }, co); await sleep(1800);
  const nav = await navLabels();
  findings.cos[co] = { filter: r0, tabs: {} };
  for (const [id, label] of TABS) {
    const inMenu = nav.some(x => x === label || x.replace(/\s*\(\d+\)$/, '') === label);
    const e0 = errs.length;
    await openTab(id);
    const v = await view(); const txt = await mainText();
    const rtx = await rowText();
    const MK = { C: /Demo Smith|PO-3001|\b3001\b|Demo Lumber/, M: /Demo Ross|PO-3002|\b3002\b|Demo Rentals/, E: /Demo Kline|PO-3003|\b3003\b|Demo Office Supply/, crewC: /Zedd Crew/, crewM: /Molly Demo/, crewE: /Eve Demo/ };
    const rec = { inMenu, view: v, chars: txt.length, head: txt.slice(0, 160), marks: Object.keys(MK).filter(k => MK[k].test(rtx)).join(',') };   /* which company's made-up rows show */
    findings.cos[co].tabs[id] = rec;
    if (!inMenu) {   /* gating: what a role sees when it reaches a tab that is not in its menu (a saved link / old view, a button elsewhere) */
      findings.gating[id] = findings.gating[id] || {}; findings.gating[id][co] = { view: v, head: txt.slice(0, 120), chars: txt.length };
      if (/Dashboard\s*Welcome|^\S*\s*Dashboard/.test(txt.slice(0, 80)) || txt.length < 30) continue;   /* falls back to the Dashboard: nothing to crawl */
      rec.reachable = true;   /* it draws its own screen: crawl it too */
    }
    if (txt.length < 30) { findings.blank.push({ co, tab: id, txt }); await P().screenshot({ path: SHOTS + '/blank_' + ROLE + '_' + DEVICE + '_' + co + '_' + id + '.png' }).catch(() => {}); }
    const ctx = { co, deep: co === DEEP };
    if (ctx.deep) {
      const r = await crawlView(id, label, 0, ctx); rec.clicked = r.clicked; rec.buttons = r.list.length; rec.sub = r.sub.slice(0, MAXSUB);
      for (const st of rec.sub) {   /* the sub-tabs: open each, click its buttons once */
        await openTab(id); const how = await clickByText(st); if (how === 'gone') continue; await sleep(900);
        const rr = await crawlView(id + '>' + st, label, 1, ctx); rec['sub:' + st] = rr.clicked;
        if (await view() !== id) await openTab(id);
      }
    } else {   /* the other companies: the tab + its own tab strip, no clicks inside */
      const strip = await ev(() => { const root = document.querySelector('#root main') || document.body; return [...root.querySelectorAll('[data-tab], [data-gc-tab], [role=tab]')].filter(b => b.offsetParent).map(b => (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(Boolean); });
      rec.strip = Array.isArray(strip) ? strip.slice(0, 12) : [];
      for (const st of rec.strip) { if (SKIP.test(st)) continue; const e1 = errs.length; await clickByText(st); await sleep(800); const t2 = await mainText(); if (t2.length < 30) findings.blank.push({ co, tab: id + '>' + st }); if (errs.length > e1) findings.errors.push({ ctx, tab: id + '>' + st, errs: errsSince(e1) }); }
    }
    if (errs.length > e0 && !findings.errors.some(x => x.tab === id && x.ctx && x.ctx.co === co)) findings.errors.push({ ctx, tab: id, errs: errsSince(e0) });
    const left = await closeAll(await overlays().then(() => []));
    if (left.length) await ev(() => { document.querySelectorAll('body > *').forEach(el => { if (el.id !== 'root' && getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().width * el.getBoundingClientRect().height > innerWidth * innerHeight * 0.25) el.remove(); }); });
  }
  if (DEVICE === 'phone') { const ov = await ev(() => document.documentElement.scrollWidth - innerWidth); findings.cos[co].hScroll = ov; }
  await P().screenshot({ path: SHOTS + '/co_' + ROLE + '_' + DEVICE + '_' + co + '.png' }).catch(() => {});
}
findings.pageErrors = errs; findings.consoleErrors = cons.slice(0, 40);
fs.writeFileSync(OUT, JSON.stringify(findings, null, 1));
/* summary */
const seenTabs = co => Object.entries(findings.cos[co] ? findings.cos[co].tabs : {}).filter(([, r]) => r.inMenu || r.reachable).map(([k, r]) => k + (r.reachable ? '*' : '') + (r.clicked != null ? '(' + r.clicked + ')' : ''));
for (const co of COS) { console.log('  ' + co + ': ' + seenTabs(co).join(' ')); console.log('     rows seen: ' + Object.entries(findings.cos[co] ? findings.cos[co].tabs : {}).filter(([, r]) => (r.inMenu || r.reachable) && r.marks).map(([k, r]) => k + '[' + r.marks + ']').join(' ')); }
console.log('  gating (opened though not in the menu): ' + Object.entries(findings.gating).map(([k, v]) => k + '→' + Object.values(v).map(x => x.chars + 'ch').slice(0, 1)).join(' '));
ok('no page errors (' + ROLE + ', ' + DEVICE + ')', !errs.length, errs.slice(0, 6));
ok('no blank views', !findings.blank.length, findings.blank);
ok('no overlay left open after Escape / ✕', !findings.stuck.length, findings.stuck.slice(0, 6));
console.log('  clicked ' + findings.clicked + ' buttons; ' + findings.noops.length + ' did nothing visible: ' + findings.noops.slice(0, 25).map(x => x.tab + ':' + x.btn).join(' · '));
if (cons.length) console.log('  console errors: ' + cons.slice(0, 8).join(' || '));
console.log((R.every(Boolean) ? 'ALL PASS ' : 'FAILED ') + R.filter(Boolean).length + '/' + R.length);
await A.b.close();
process.exit(R.every(Boolean) ? 0 : 1);
