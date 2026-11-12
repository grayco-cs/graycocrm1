// test_COLEAK2.mjs <build-dir> [shot-dir] — owner 11/12 (GRAYCO MITIGATION picked): every tab, badge and pick list shows only the picked
// company's records; "All companies" shows both. Made-up data only: Conzz… = Construction, Mitzz… = Mitigation.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const SHOTS = process.argv[3] || '';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud();
const at = new Date().toISOString(), d = at.slice(0, 10), ago = n => new Date(Date.now() - n * 864e5).toISOString(), fut = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u4', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', payType: 'salary', active: true },
  { id: 'u2', name: 'Conzz Carpenter', email: 'conzz.worker@example.test', role: 'Field', payType: 'hourly', active: true },
  { id: 'u3', name: 'Mitzz Tech', email: 'mitzz.tech@example.test', role: 'Field', payType: 'hourly', active: true, companies: ['mitigation'] }]);
cset('projects', [{ id: 'C1', name: 'Conzz Alpha', client: 'Conzz Client', address: '1 Conzz St', contract: 77777, status: 'active', pm: 'Wesley Johnson', startDate: ago(10).slice(0, 10), createdAt: at, updatedAt: at },
  { id: 'C2', name: 'Conzz Bidjob', client: 'Conzz Bidder', contract: 33333, status: 'bidding', createdAt: at, updatedAt: at },
  { id: 'M1', name: 'Mitzz Beta', client: 'Mitzz Client', address: '9 Mitzz Rd', contract: 5000, status: 'active', companyId: 'mitigation', pm: 'Wesley Johnson', startDate: ago(3).slice(0, 10), createdAt: at, updatedAt: at }]);
const L = (id, o) => Object.assign({ id, client: id, name: id, stage: 'New', createdAt: at, updatedAt: at }, o);
cset('leads', [L('Conzz Kitchen', { type: 'Residential Reno', scope: 'Kitchen remodel' }), L('Conzz Bidlead', { type: 'Commercial Bid', bidDue: fut(2), scope: 'Office buildout bid' }),
  L('Conzz Storm', { type: 'Insurance', scope: 'Hail roof replacement' }), L('Mitzz Board Up', { emergency: true, scope: 'Board up after a break-in', companyId: 'mitigation' })]);
cset('invs', [{ id: 'IC1', pid: 'C1', type: 'client', client: 'Conzz Client', amt: 4321, status: 'Sent', date: d, savedAt: at, updatedAt: at },
  { id: 'BC1', pid: 'C1', type: 'sub', vendor: 'Conzz Framing Sub', sub: 'Conzz Framing Sub', amt: 1717, status: 'pending', date: d, savedAt: at, updatedAt: at },
  { id: 'IM1', pid: 'M1', type: 'client', client: 'Mitzz Client', amt: 1500, status: 'Sent', date: d, savedAt: at, updatedAt: at }]);
cset('expenses', [{ id: 'E1', pid: 'C1', amt: 1234.56, date: d, vendor: 'Conzz Lumber', status: 'approved', category: 'Materials' },
  { id: 'E3', amt: 818.18, date: d, vendor: 'Conzz Overhead Shop', status: 'approved', category: 'Office' },
  { id: 'E4', pid: 'C1', amt: 99.5, date: d, vendor: 'Conzz Pending Receipt', status: 'pending', category: 'Materials' },
  { id: 'E5', pid: 'M1', amt: 44.4, date: d, vendor: 'Mitzz Pending Receipt', status: 'pending', category: 'Equipment' },
  { id: 'E2', pid: 'M1', amt: 222.22, date: d, vendor: 'Mitzz Rental', status: 'approved', category: 'Equipment' }]);
cset('schedule', [{ id: 'S1', pid: 'C1', date: d, title: 'Conzz Alpha demo day', assignee: 'Wesley Johnson' }, { id: 'S2', pid: 'M1', date: d, title: 'Mitzz drying check', assignee: 'Wesley Johnson' }]);
cset('estimates', [{ id: 'ES1', pid: 'C1', name: 'Conzz Alpha estimate', client: 'Conzz Client', status: 'sent', totalCharge: 25000, savedAt: ago(2), updatedAt: ago(2) }]);
cset('cos', [{ id: 'CO1', pid: 'C1', title: 'Conzz extra outlet', desc: 'Conzz extra outlet', amt: 650, status: 'pending', date: d }, { id: 'CO2', pid: 'M1', title: 'Mitzz extra dehu', desc: 'Mitzz extra dehu', amt: 120, status: 'pending', date: d }]);
cset('gc_job_messages', JSON.stringify([{ id: 'MSG1', pid: 'C1', authorId: 'x', authorName: 'Conzz Foreman', text: 'Conzz need drywall date', tags: [], at },
  { id: 'MSG3', pid: 'C1', authorId: 'x', authorName: 'Conzz Foreman', text: '@Wesley Conzz please call the inspector', tags: [], at },
  { id: 'MSG2', pid: 'M1', authorId: 'y', authorName: 'Mitzz Tech', text: 'Mitzz moisture readings in', tags: [], at }]));
const AQ = (id, job, nm) => ({ id, kind: 'portal_link', title: 'Portal link — ' + nm, jobId: job, jobName: nm, pm: 'Wesley Johnson', pmEmail: 'wjohnson@grayco-cs.com', channel: 'email', to: id + '@example.test', subject: nm + ' your project page', html: '<p>Hi</p>', text: 'Hi', attachments: [], steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: at, updatedAt: at, meta: {} });
cset('gc_approval_queue', JSON.stringify([AQ('aq1', 'C1', 'Conzz Alpha'), AQ('aq2', 'M1', 'Mitzz Beta')]));
cset('gc_sub_approvals', [{ id: 'SA1', jobId: 'C1', pid: 'C1', subName: 'Conzz Framing Sub', amt: 1717, status: 'pending_pm', pmName: 'Wesley Johnson', createdAt: at }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
const pg = A.page(); await pg.setViewportSize({ width: 1400, height: 900 });
if (SHOTS) { try { const cdp = await pg.context().newCDPSession(pg); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false }); } catch (e) {} }   /* sharp screenshots */
const co = async c => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(1800); };
const go = async v => { await pg.mouse.move(700 + Math.random() * 50, 300); await A.ev(v => window._setView(v), v); await sleep(3200); };   /* a person at the computer (the screens slow down when nobody is) */
const text = () => A.ev(() => { const opt = new Set([...document.querySelectorAll('select option')].map(o => o.textContent.trim())); return document.body.innerText.split('\n').filter(l => !opt.has(l.trim())).join('\n'); });   /* a drop-down's options are checked on their own (hidden or not) */
const lines = (t, re) => t.split('\n').filter(l => re.test(l));
const nav = () => A.ev(() => { const o = {}; document.querySelectorAll('aside button, nav button').forEach(b => { const l = (b.textContent || '').replace(/(\s*\d+\+?)+$/, '').replace(/^[^A-Za-z]+/, '').trim(); if (!/^(To-Do|Approvals|Messages|Leads|Accounting)$/.test(l) || o[l] != null) return; let n = 0; b.querySelectorAll('span,b,div').forEach(x => { if (x.children.length || x.offsetParent === null) return; const v = /^\s*(\d+)\+?\s*$/.exec(x.textContent || ''); if (v) n = Math.max(n, +v[1]); }); const g = b.querySelector('#gck-navbadge'); if (g && g.offsetParent !== null) n = +g.getAttribute('data-n') || 0; o[l] = n; }); return o; });
const shot = async name => { if (!SHOTS) return; await pg.screenshot({ path: SHOTS + '/' + name + '.png' }); fs.appendFileSync(SHOTS + '/index.txt', name + '.png — ' + (await A.ev(() => window._gcCo.filter())) + ' · ' + (await A.ev(() => localStorage.getItem('grayco_view'))) + '\n'); };
const CON = /Conzz|77,777|4,321|1,717|1,234\.56|818\.18/, MIT = /Mitzz|222\.22|1,500\.00/;
/* ── All companies: both ── */
await co('all');
const navAll = await nav();
const alertsOf = () => A.ev(() => (window._gcFieldAlerts ? window._gcFieldAlerts() : []).map(a => a.label));
const alAll = await alertsOf();
const seen = {};
for (const v of ['projects', 'invoices', 'expenses', 'customers', 'approvals', 'messages']) { await go(v); const t = await text(); seen[v] = [CON.test(t), MIT.test(t)]; }
ok('All companies: Projects, Invoices, Expenses, Customers, Approvals, Messages show both companies', Object.values(seen).every(x => x[0] && x[1]), seen);
await go('admin'); await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*👥?\s*(Employees|Team|Users)\b/i.test(x.textContent || '')); if (b) b.click(); }); await sleep(1500);
let t = await text();
ok('All companies: Admin → Employees lists everyone with company chips', /Conzz Carpenter/.test(t) && /Mitzz Tech/.test(t) && await A.ev(() => document.querySelectorAll('[data-co-uchips]').length >= 4), lines(t, /Employees \(|Conzz Carpenter|Mitzz Tech/).slice(0, 4));
/* ── Mitigation ── */
await co('mitigation');
const views = ['dashboard', 'todo', 'approvals', 'messages', 'leads', 'projects', 'estbuilder', 'estimates', 'allphotos', 'invoices', 'taxcenter', 'expenses', 'payments', 'schedule', 'payroll', 'claude', 'officemanager', 'changeorders', 'crewboard', 'dailylogs', 'punchlist', 'customers', 'admin'];   /* the full-screen Insurance and Mitigation boards are checked last */
const leak = {};
for (const v of views) {
  await go(v); await sleep(900); t = await text();
  const l = lines(t, CON).filter(x => !(v === 'messages' && /@mentioned you/.test(x)) && !(v === 'admin' && /not on the Subs list|Add “Conzz Framing Sub”|“Conzz Framing Sub” as supplier/.test(x)));
  const visOpt = await A.ev(() => [...document.querySelectorAll('select option')].filter(o => !o.hidden && /Conzz/.test(o.textContent)).map(o => 'option ' + (o.parentElement.id || o.parentElement.className || '') + ':' + o.value + '=' + o.textContent + (o.selected ? ' (selected)' : '')));
  if (l.length || visOpt.length) leak[v] = l.slice(0, 4).concat(visOpt.slice(0, 3));
  await shot('mit_' + v);
}
ok('Mitigation: no tab shows a Construction job, lead, customer, amount or person (drop-downs included)', !Object.keys(leak).length, leak);
/* the Leads page's views and chips (Board, List, Calendar, Map, Outreach · All, Bids, Residential, Insurance …) */
await go('leads');
const lsub = {};
for (const sel of ['[data-gcl-v]', '[data-gclu-chip]']) {
  const keys = await A.ev(s => [...document.querySelectorAll(s)].map(b => b.getAttribute(s.slice(1, -1))), sel);
  for (const k of [...new Set(keys)]) { await A.ev(([s, k]) => { const b = document.querySelector(s.slice(0, -1) + '="' + k + '"]'); if (b) b.click(); }, [sel, k]); await sleep(1300); t = await text(); const l = lines(t, CON); if (l.length) lsub[k] = l.slice(0, 3); }
}
ok('Mitigation: every Leads view and chip (board, list, calendar, map, outreach, bids, residential, insurance …) is free of Construction leads', !Object.keys(lsub).length, lsub);
await shot('mit_leads_last_view');
const navMit = await nav();
const alMit = await alertsOf();
ok('Mitigation: the 🔔 alerts (field app / bell) count Mitigation\'s items only — 1 change order, no Construction sub invoice; All counts both', alMit.includes('1 change order to approve') && !alMit.some(x => /sub invoice/.test(x)) && alAll.includes('2 change orders to approve') && alAll.some(x => /sub invoice/.test(x)), { alMit, alAll });
ok('Mitigation: no Accounting badge (Accounting is its fresh page) — All has one', !navMit.Accounting && navAll.Accounting > 0, { navMit, navAll });
const apx = await A.ev(() => { const s = window._gcApprovalCurrent(); const titles = []; Object.values(s.groups).forEach(g => g.forEach(x => titles.push(x.title))); return { n: window._gcApprovalCount(), titles }; });
ok('Mitigation: the Approvals badge = the Mitigation set (no Construction approval in it)', navMit.Approvals === apx.n && !apx.titles.some(x => CON.test(x)) && apx.titles.some(x => /Mitzz/.test(x)), { nav: navMit.Approvals, apx });
await go('approvals'); t = await text();
ok('Mitigation: the Approvals tab lists the Mitigation e-mail, not Construction\'s', /Mitzz your project page|Portal link — Mitzz Beta/.test(t) && !CON.test(t), lines(t, /Portal|Conzz|Mitzz/).slice(0, 8));
ok('Mitigation: the To-Do and Approvals badges are below All\'s (Construction lines not counted)', (navMit['To-Do'] || 0) < (navAll['To-Do'] || 0) && (navMit.Approvals || 0) < (navAll.Approvals || 0), { navMit, navAll });
await go('messages'); t = await text();
ok('Mitigation: Messages "For you" keeps your @mention on a Construction job, marked 🏗 Construction; no other Construction message', /@mentioned you on/.test(t) && !/Conzz need drywall date/.test(t) && await A.ev(() => !!document.querySelector('.gcjm-fy .gc-co-b[data-co="construction"]')), lines(t, /For you|Conzz|mention/).slice(0, 8));
ok('Mitigation: the Messages badge = the For-you list', navMit.Messages === await A.ev(() => window._gcJobMsgForMeCount()), { nav: navMit.Messages, list: await A.ev(() => window._gcJobMsgForMeCount()) });
await go('customers'); t = await text();
ok('Mitigation: Customers = Mitzz Client / Mitzz Board Up only', /Mitzz Client/.test(t) && !/Conzz/.test(t), lines(t, /customers|Mitzz|Conzz/).slice(0, 4));
await go('admin'); await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*👥?\s*(Employees|Team|Users)\b/i.test(x.textContent || '')); if (b) b.click(); }); await sleep(1500); t = await text();
const emp = await A.ev(() => { const tb = [...document.querySelectorAll('table')].find(x => /Pay Type/i.test(x.textContent) && /Insurance/i.test(x.textContent)); return tb ? [...tb.querySelectorAll('tbody tr')].map(r => (r.cells[0] || {}).textContent.trim()) : null; });
ok('Mitigation: Admin → Employees = the owner, Nick and Mitigation\'s people (not Conzz Carpenter)', emp && /Employees \((\d+)\)/.test(t) && +/Employees \((\d+)\)/.exec(t)[1] === emp.length && emp.some(x => /Wesley Johnson/.test(x)) && emp.some(x => /Nick Thomas/.test(x)) && emp.some(x => /Mitzz Tech/.test(x)) && !emp.some(x => /Conzz/.test(x)), { emp, head: lines(t, /Employees \(/) });
await shot('mit_admin_employees');
await go('dashboard'); await sleep(1000);
const sel = await A.ev(() => { const o = [...document.querySelectorAll('select option')]; return { con: o.filter(x => /Conzz Carpenter/.test(x.textContent)).map(x => x.hidden), mit: o.filter(x => /Mitzz Tech/.test(x.textContent)).map(x => x.hidden) }; });
ok('Mitigation: the Dashboard "View a person…" list hides Conzz Carpenter, keeps Mitzz Tech', sel.con.length && sel.con.every(Boolean) && sel.mit.length && !sel.mit.some(Boolean), sel);
await go('expenses'); await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^\+ Add$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(1500);
const jsel = await A.ev(() => { const o = [...document.querySelectorAll('select option')]; return { c1: o.filter(x => x.value === 'C1').map(x => x.hidden), m1: o.filter(x => x.value === 'M1').map(x => x.hidden) }; });
ok('Mitigation: the new-expense job picker lists Mitzz Beta, not Conzz Alpha', jsel.m1.length && !jsel.m1.some(Boolean) && jsel.c1.every(Boolean), jsel);
await pg.keyboard.press('Escape'); await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*(cancel|close|✕)\s*$/i.test(x.textContent || '')); if (b) b.click(); }); await sleep(600);
/* ── Construction: none of Mitigation's ── */
await co('construction');
const cleak = {};
for (const v of ['dashboard', 'todo', 'approvals', 'messages', 'projects', 'invoices', 'expenses', 'payments', 'changeorders', 'taxcenter', 'customers', 'admin', 'officemanager', 'estbuilder', 'schedule', 'crewboard', 'leads']) { await go(v); t = await text(); const l = lines(t, MIT); const vo = await A.ev(() => [...document.querySelectorAll('select option')].filter(o => !o.hidden && /Mitzz/.test(o.textContent)).map(o => o.textContent)); if (l.length || vo.length) cleak[v] = l.slice(0, 4).concat(vo.slice(0, 3)); }
ok('Construction: Dashboard, To-Do, Approvals, Messages, Projects, Invoices, Expenses, Payments, Change orders, Accounting job costing, Customers, Admin, Office, Estimates, Schedule, Crew board and Leads show no Mitigation record or person', !Object.keys(cleak).length, cleak);
const navCon = await nav();
ok('Construction: the Accounting badge counts Construction\'s items (the Mitigation expense to approve is not in it); All counts both', navCon.Accounting > 0 && navCon.Accounting === navAll.Accounting - 1, { navCon, navAll });
await go('taxcenter'); await shot('con_taxcenter');
await co('mitigation'); await go('taxcenter'); await shot('mit_taxcenter_nobadge');
/* ── Admin: 🏢 Companies boxes write only that person's record ── */
await co('all'); await go('admin'); await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*👥?\s*(Employees|Team|Users)\b/i.test(x.textContent || '')); if (b) b.click(); }); await sleep(1500);
await A.ev(() => { const r = [...document.querySelectorAll('td span')].find(x => /Conzz Carpenter/.test(x.textContent || '') && x.style.cursor === 'pointer'); if (r) r.click(); }); await sleep(1500);
const boxes = await A.ev(() => [...document.querySelectorAll('[data-gc-co-uck]')].map(b => b.getAttribute('data-gc-co-uck') + '=' + b.checked));
ok('Admin → an employee: 🏢 Companies boxes (Construction ticked by default)', boxes.join() === 'construction=true,mitigation=false,environmental=false', boxes);
await shot('all_admin_employee_companies');
const before = JSON.stringify((cget('users') || []).filter(u => u.id !== 'u2'));
await A.ev(() => { const b = document.querySelector('[data-gc-co-uck="mitigation"]'); b.click(); }); await sleep(4500);
const after = cget('users') || [], u2 = after.find(u => u.id === 'u2') || {};
ok('ticking Mitigation saves companies on that person only', JSON.stringify(u2.companies) === '["construction","mitigation"]' && JSON.stringify(after.filter(u => u.id !== 'u2')) === before, { u2: u2.companies, others: JSON.stringify(after.filter(u => u.id !== 'u2')) === before });
await co('mitigation');
ok('…and Conzz Carpenter now shows on Mitigation\'s lists', await A.ev(() => window._gcCo.passUser(window._crm.users.find(u => u.id === 'u2'))));
/* the full-screen Insurance and Mitigation boards (they stay over the page, so they come last) */
await co('mitigation');
const boards = {};
for (const v of ['insurance', 'mitigation']) { await go(v); t = await text(); const l = lines(t, CON); if (l.length) boards[v] = l.slice(0, 4); await shot('mit_' + v); }
ok('Mitigation: the Insurance board (its insurance leads and claims) and the Mitigation board show nothing of Construction\'s', !Object.keys(boards).length, boards);
await co('construction'); await go('insurance'); t = await text();
ok('Construction: the Insurance board shows nothing of Mitigation\'s', !MIT.test(t), lines(t, MIT).slice(0, 4));
await co('all');
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('COLEAK2 ' + n + '/' + R.length); await A.b.close(); process.exit(n === R.length ? 0 : 1);
