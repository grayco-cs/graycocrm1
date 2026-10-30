// test_MONEY.mjs <build-dir> — patch MONEY in the browser, made-up data only (offline harness, nothing leaves the computer).
//   The office signs in → To-Do → 💳 Import card statement → a Chase-style CSV (date · description · type · signed amount):
//   the payment is left out; Lowe's "PO A101" → the PO's job; ABC Supply "8382 LAURETT COVE" → the open job at that address;
//   Home Depot → its usual job lately; FACEBK → Advertising/Marketing, picked as Overhead → Import → the charges are on the
//   jobs' costs and the Accounting P&L moved by exactly those amounts; the vendor rules are saved (gc_kv gc_money_rules).
//   A second statement in another format (Capital One: Debit / Credit columns) fills itself from those rules and a charge
//   already entered is merged, not doubled. Marketing: the FACEBK charge is the Facebook / Instagram spend → cost per lead
//   and per won job in 📣 Marketing's numbers. 📥 Needs a job lists a card charge with no job and saves the picked job.
// Harness: GC_HARNESS (default the session scratchpad's wME/harness.mjs).
import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wME/harness.mjs';
const { computer, sleep, waitFor, cset, cget, signIn, cloud } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_MONEY.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

/* ── made-up world ── */
const pad = n => String(n).padStart(2, '0'); const now = new Date(); const Y = now.getFullYear();
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const us = ymd => ymd.slice(5, 7) + '/' + ymd.slice(8, 10) + '/' + ymd.slice(0, 4);
cloud.clear();
const iso = new Date().toISOString();
cset('users', [{ id: 'U1', name: 'Demo Office', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'U2', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [
  { id: 'P1', name: 'Demo Hollis Reroof', address: '8382 Laurett Cove, Cordova, TN', autoPO: 'A101', pm: 'Demo Owner', client: 'Demo Hollis', status: 'Active', contract: 20000, type: 'Residential', leadSource: 'Facebook/Instagram Ads', created: day(-20), savedAt: iso, updatedAt: iso },
  { id: 'P2', name: 'Demo Brent Kitchen', address: '123 Senatobia Dr, Hernando, MS', autoPO: 'T724', pm: 'Demo Owner', client: 'Demo Brent', status: 'Active', contract: 30000, type: 'Residential', created: day(-30), savedAt: iso, updatedAt: iso },
  { id: 'P3', name: 'Demo Old Deck', address: '77 Finished Rd, Memphis TN', autoPO: 'D404', pm: 'Demo Owner', client: 'X', status: 'completed', contract: 5000, created: day(-200), savedAt: iso, updatedAt: iso }
]);
cset('invs', [{ id: 'I1', type: 'client', pid: 'P1', amt: 10000, status: 'paid', paid: 10000, paidDate: day(-5), date: day(-10), invNum: '9001', savedAt: iso, updatedAt: iso }]);
cset('expenses', [
  { id: 'E1', pid: 'P2', type: 'purchase', vendor: 'THE HOME DEPOT #6620', desc: 'lumber', amt: 120, category: 'Materials', status: 'approved', approved: true, date: day(-12), payMethod: 'Credit Card', savedAt: iso, updatedAt: iso },
  { id: 'E2', pid: 'P2', type: 'purchase', vendor: 'HOME DEPOT 6620', desc: 'screws', amt: 40, category: 'Materials', status: 'approved', approved: true, date: day(-8), payMethod: 'Credit Card', savedAt: iso, updatedAt: iso },
  { id: 'E3', pid: '', type: 'purchase', vendor: 'SHELL OIL 5741', desc: 'Card charge PO T724', amt: 61.5, category: 'Fuel/Gas', status: 'approved', date: day(-3), payMethod: 'Credit Card', by: 'CC Import', savedAt: iso, updatedAt: iso }
]);
/* (every row is an hour old, like a real cloud: the CRM's catch-up poll must not think the seed just changed) */
const seedLeads = [1, 2, 3, 4].map(i => ({ id: 'L' + i, name: 'Demo lead ' + i, source: 'Facebook/Instagram Ads', status: i === 1 ? 'won' : 'new', stage: i === 1 ? 'Won' : 'New Lead', createdAt: day(-i) + 'T12:00:00Z', created: day(-i), projectId: i === 1 ? 'P1' : '' }));
cset('leads', seedLeads);
const old = new Date(Date.now() - 3600e3).toISOString(); for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: old }));

const A = await computer('A', { build });
await A.ctx.route(u => new URL(u).pathname.startsWith('/.netlify/functions/'), r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
const p = A.page(); await p.setViewportSize({ width: 1400, height: 900 });
await signIn(A, 'office@grayco-cs.com', 1500);
ok(await waitFor(A, () => !!(window._gcMoney && window._crm && (window._crm.projects || []).length === 3 && (window._crm.expenses || []).length >= 3 && window._gcAddCardCharge && window._gcAcctModel), null, 90000), 'the CRM loaded with the made-up jobs and the money patch');
await p.evaluate(() => { for (const b of [...document.querySelectorAll('button')]) if (b.offsetParent && /^(Later|Got it!?|Not now|×|✕)$/.test(b.textContent.trim())) b.click(); }).catch(() => {});

const before = await p.evaluate(() => { const m = window._gcAcctModel({ range: { from: '', to: '' } }); const j = id => (m.pnl.jobs.find(x => x.pid === id) || { cost: 0 }).cost; return { jobCosts: m.pnl.jobCosts, overhead: m.pnl.overhead, p1: j('P1'), p2: j('P2'), n: window._crm.expenses.length }; });

/* ── To-Do → 💳 Import card statement ── */
await p.evaluate(() => { const b = [...document.querySelectorAll('aside nav button, nav button')].find(y => y.offsetParent && /To-Do/.test(y.textContent)); if (b) b.click(); });
ok(await waitFor(A, () => !!document.querySelector('#gc-money-needs [data-mn="import"]'), null, 30000), 'the To-Do shows 💳 Import card statement (and 📥 Needs a job when something waits)');
ok(await waitFor(A, () => /Needs a job \(1\)/.test((document.querySelector('#gc-money-needs') || {}).textContent || ''), null, 15000), '📥 Needs a job (1): the Shell charge with no job', await p.evaluate(() => (document.querySelector('#gc-money-needs') || {}).textContent));
await p.click('#gc-money-needs [data-mn="import"]');
await waitFor(A, () => !!document.querySelector('.gc-money-imp textarea'), null, 10000);
const d1 = day(-6), d2 = day(-5), d3 = day(-4), d4 = day(-3), d5 = day(-2);
const CHASE = ['Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
  `${us(d1)},${us(d1)},THE HOME DEPOT #6620,Home Improvement,Sale,-245.10,`,
  `${us(d2)},${us(d2)},"LOWES #01234, PO A101",Home Improvement,Sale,-88.40,`,
  `${us(d3)},${us(d3)},ABC SUPPLY 8382 LAURETT COVE,Home Improvement,Sale,-512.00,`,
  `${us(d4)},${us(d4)},FACEBK *ADS 8XK2Q,Professional Services,Sale,-300.00,`,
  `${us(d5)},${us(d5)},Payment Thank You-Mobile,,Payment,1145.50,`].join('\n');
await p.fill('.gc-money-imp [data-c="newcard"]', 'Demo Chase Ink 4421');
await p.fill('.gc-money-imp textarea', CHASE);
await p.click('.gc-money-imp [data-c="read"]');
await waitFor(A, () => document.querySelectorAll('.gc-money-imp tr[data-r]').length >= 4, null, 10000);
const prev = await p.evaluate(() => [...document.querySelectorAll('.gc-money-imp tr[data-r]')].map(tr => ({ d: tr.children[2].textContent, amt: tr.children[3].textContent, cat: tr.querySelector('[data-c="cat"]').value, job: tr.querySelector('[data-c="job"]').value, why: tr.children[6].textContent })));
ok(prev.length === 4, 'Chase CSV: 4 charges read, the payment left out', prev);
const row = re => prev.find(x => re.test(x.d)) || {};
ok(row(/LOWES/).job === 'P1' && /PO A101 in the memo/.test(row(/LOWES/).why), 'Lowe\'s "PO A101" → the PO\'s job', row(/LOWES/));
ok(row(/ABC SUPPLY/).job === 'P1' && /open job at 8382 Laurett/.test(row(/ABC SUPPLY/).why), 'ABC Supply "8382 LAURETT COVE" → the open job at that address', row(/ABC SUPPLY/));
ok(row(/HOME DEPOT/).job === 'P2' && /usual job/.test(row(/HOME DEPOT/).why) && row(/HOME DEPOT/).cat === 'Materials', 'Home Depot → its usual job lately, Materials', row(/HOME DEPOT/));
ok(row(/FACEBK/).cat === 'Advertising/Marketing' && row(/FACEBK/).job === '', 'FACEBK → Advertising/Marketing, no job suggested', row(/FACEBK/));
/* the office marks the ad charge as overhead */
await p.evaluate(() => { const tr = [...document.querySelectorAll('.gc-money-imp tr[data-r]')].find(t => /FACEBK/.test(t.textContent)); const s = tr.querySelector('[data-c="job"]'); s.value = '__oh'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await p.click('.gc-money-imp [data-c="go"]');
ok(await waitFor(A, () => /4 charges added/.test((document.querySelector('.gc-money-imp [data-c="prev"]') || {}).textContent || ''), null, 20000), 'Import → "✓ 4 charges added"', await p.evaluate(() => (document.querySelector('.gc-money-imp [data-c="prev"]') || {}).textContent));
const after = await p.evaluate(() => { const m = window._gcAcctModel({ range: { from: '', to: '' } }); const j = id => (m.pnl.jobs.find(x => x.pid === id) || { cost: 0 }).cost; const ex = window._crm.expenses;
  const f = re => ex.find(e => re.test(e.vendor || '')) || {}; return { jobCosts: m.pnl.jobCosts, overhead: m.pnl.overhead, p1: j('P1'), p2: j('P2'), n: ex.length, hd: f(/HOME DEPOT #6620/i).pid, lowes: f(/LOWES/).pid, abc: f(/ABC/).pid, fb: { pid: f(/FACEBK/).pid, oh: f(/FACEBK/).overhead, cat: f(/FACEBK/).category } }; });
ok(after.n === before.n + 4, '4 expenses added to the expense list', { before, after });
ok(after.lowes === 'P1' && after.abc === 'P1' && after.hd === 'P2' && after.fb.pid === '' && after.fb.oh === true, 'each charge is on its job (the ad on overhead)', after);
ok(Math.abs((after.p1 - before.p1) - 600.40) < 0.01 && Math.abs((after.p2 - before.p2) - 245.10) < 0.01, 'job P&L: Hollis +$600.40, Brent +$245.10', { before, after });
ok(Math.abs((after.jobCosts - before.jobCosts) - 845.50) < 0.01, 'company P&L job costs +$845.50', { before, after });
ok(Math.abs((after.overhead - before.overhead) - 300) < 0.01, 'company P&L overhead +$300.00 (the ad)', { before, after });
const rules = cget('gc_money_rules') || {};
ok(rules['home depot'] && rules['home depot'].pid === 'P2' && rules['home depot'].category === 'Materials' && rules.facebk && rules.facebk.overhead === true && rules.facebk.category === 'Advertising/Marketing', 'vendor rules remembered (gc_kv gc_money_rules)', rules);
ok(!rules.lowes || !rules.lowes.pid, 'a PO match is not learned as the vendor\'s job', rules.lowes);
await p.click('.gc-money-imp [data-c="x"]');

/* ── a second statement, Capital One format (Debit / Credit columns): the rules fill it; a charge already in is merged ── */
const d6 = day(-1);
const CAP1 = ['Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
  `${d6},${d6},4421,THE HOME DEPOT 0512,Merchandise,77.25,`,
  `${d6},${d6},4421,FACEBK *ADS 9QQ,Other Services,150.00,`,
  `${d1},${d1},4421,THE HOME DEPOT #6620,Merchandise,245.10,`,
  `${d6},${d6},4421,CAPITAL ONE AUTOPAY PYMT,Payment/Credit,,500.00`].join('\n');
await p.click('#gc-money-needs [data-mn="import"]');
await waitFor(A, () => !!document.querySelector('.gc-money-imp textarea'), null, 10000);
await waitFor(A, () => [...document.querySelectorAll('.gc-money-imp [data-c="card"] option')].some(o => /4421/.test(o.textContent)), null, 10000);
await p.evaluate(() => { const s = document.querySelector('.gc-money-imp [data-c="card"]'); const o = [...s.options].find(o => /4421/.test(o.textContent)); s.value = o.value; });
await p.fill('.gc-money-imp textarea', CAP1);
await p.click('.gc-money-imp [data-c="read"]');
await waitFor(A, () => document.querySelectorAll('.gc-money-imp tr[data-r]').length >= 3, null, 10000);
const prev2 = await p.evaluate(() => [...document.querySelectorAll('.gc-money-imp tr[data-r]')].map(tr => ({ d: tr.children[2].textContent, cat: tr.querySelector('[data-c="cat"]').value, job: tr.querySelector('[data-c="job"]').value, why: tr.children[6].textContent })));
ok(prev2.length === 3, 'Capital One CSV (debit / credit): 3 charges, the autopay left out', prev2);
const r2 = re => prev2.find(x => re.test(x.d)) || {};
ok(r2(/0512/).job === 'P2' && /your rule/.test(r2(/0512/).why), 'Home Depot → P2 by your rule', r2(/0512/));
ok(r2(/9QQ/).job === '__oh' && r2(/9QQ/).cat === 'Advertising/Marketing', 'FACEBK → Overhead, Advertising/Marketing by your rule', r2(/9QQ/));
await p.click('.gc-money-imp [data-c="go"]');
ok(await waitFor(A, () => /2 charges added · 1 were already in/.test((document.querySelector('.gc-money-imp [data-c="prev"]') || {}).textContent || ''), null, 20000), 'the same charge already entered is merged, not doubled', await p.evaluate(() => (document.querySelector('.gc-money-imp [data-c="prev"]') || {}).textContent));
await p.click('.gc-money-imp [data-c="x"]');

/* ── marketing: the ad charges are the Facebook / Instagram spend → cost per lead / per won job ── */
const mk = await p.evaluate(() => { const sp = window._gcMoneyMkSpend([]); const M = window.__gcMkCalc; let row = null;
  try { const s = M.build({ leads: window._crm.leads || [], projects: window._crm.projects, invs: window._crm.invoices, expenses: window._crm.expenses, estimates: [], spend: sp, now: new Date().toISOString().slice(0, 10) }); row = (s.channels || s.rows || []).find(r => r.channel === 'Facebook/Instagram Ads') || null; } catch (e) { row = 'ERR ' + e.message; }
  const typed = window._gcMoneyMkSpend([{ channel: 'Facebook/Instagram Ads', month: new Date().toISOString().slice(0, 7), amount: 999 }]);
  return { sp, row, typed: typed.filter(x => x.channel === 'Facebook/Instagram Ads') }; });
ok(mk.sp.length >= 1 && mk.sp.reduce((a, x) => a + (x.channel === 'Facebook/Instagram Ads' ? x.amount : 0), 0) === 450, 'marketing spend from the books: Facebook / Instagram $450 (two card charges)', mk.sp);
ok(mk.row && typeof mk.row === 'object' && mk.row.spend === 450 && mk.row.leads >= 1 && mk.row.cpl === Math.round(450 / mk.row.leads * 100) / 100, '📣 Marketing numbers: spend $450, cost per lead from the leads\' source', mk.row);
ok(mk.typed.length === 1 && mk.typed[0].amount === 999 || mk.typed.every(x => x.month !== new Date().toISOString().slice(0, 7) || x.amount === 999), 'spend typed in for that source and month wins (never doubled)', mk.typed);

/* ── 📥 Needs a job: the Shell charge (PO T724 in its memo → suggested Brent) → Save ── */
await p.click('#gc-money-needs [data-mn="needs"]');
await waitFor(A, () => !!document.querySelector('.gc-money-ov [data-i]'), null, 10000);
const nj = await p.evaluate(() => [...document.querySelectorAll('.gc-money-ov [data-i]')].map(r => ({ t: r.textContent.slice(0, 160), sel: (r.querySelector('[data-m="job"]') || {}).value })));
ok(nj.length === 1 && /SHELL/.test(nj[0].t) && nj[0].sel === 'P2' && /PO T724 in the memo/.test(nj[0].t), 'Needs a job: the Shell charge, PO T724 suggested', nj);
await p.click('.gc-money-ov [data-m="save"]');
ok(await waitFor(A, () => (window._crm.expenses.find(e => e.id === 'E3') || {}).pid === 'P2', null, 10000), 'Save → the charge is on Brent\'s job');
ok(A.errs.length === 0, 'no page errors', A.errs.slice(0, 5));
console.log(`\n${pass} passed, ${fail} failed`);
await A.b.close(); process.exit(fail ? 1 : 0);
