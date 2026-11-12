// test_BIDEST.mjs <build-dir> [shot-dir] — patch BIDEST (owner 11/12: "the admin page should have a spot where all bids for a job are at,
// and the selected bid then goes into the estimate builder as a bid for the project in projects"; "show us by trade; if a trade has
// multiple, show the bids lowest first"; "the bid portal tab on admin should open up where I can add, edit, see info").
// Offline harness, made-up data only; netlify/functions/bid-hub is routed to an in-test fake with made-up sub bids.
//   1. the 🏗 Bid portal tab opens on 🧰 Full bid portal (the /subportal/ admin iframe) for an admin; 📊 Bids & invites switches to the
//      CRM view (remembered per person); each job shows 📊 Bids (N);
//   2. 📊 Bids: every bid from the three doors, by trade A→Z, lowest first in a trade (no amount last), the low bid marked, status;
//   3. 🏆 Award → ONE sub line in the linked project's estimate (amount / sub / trade / bid reference), the totals follow;
//      awarding again → no duplicate; Undo → the bid line is off, the hand-typed lines are untouched;
//   4. no linked project (the lead is not a project yet) → the searchable picker; the pick is remembered (project + bid job);
//   5. company: a lead with a Mitigation and a Construction project → the Mitigation project's estimate gets it, not Construction's;
//   6. the builder shows "🏆 Awarded bid" on the line, live when the estimate is open; the old 📨 list sorts the same way.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 3 * 864e5).toISOString(), day = at.slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('leads', [
  { id: 'L1', name: 'Maple Street Clinic', stage: 'Won', source: 'Bid board', createdAt: at, updatedAt: at },
  { id: 'L2', name: 'Riverbend Flood Job', stage: 'Won', source: 'Insurance', companyId: 'mitigation', createdAt: at, updatedAt: at },
  { id: 'L3', name: 'Oak Hollow Office', stage: 'Estimating', source: 'Bid board', createdAt: at, updatedAt: at }]);
cset('projects', [
  { id: 'P1', name: 'Maple Street Clinic', client: 'Sample Health LLC', address: '100 Maple St', status: 'estimating', autoPO: 'T101', leadId: 'L1', createdAt: at, updatedAt: at, files: [] },
  { id: 'PM1', name: 'Riverbend Flood — dry-out', client: 'Pat Example', address: '7 River Rd', status: 'active', autoPO: 'M-T201', leadId: 'L2', companyId: 'mitigation', createdAt: at, updatedAt: at, files: [] },
  { id: 'PC1', name: 'Riverbend Flood — rebuild', client: 'Pat Example', address: '7 River Rd', status: 'estimating', autoPO: 'T202', leadId: 'L2', createdAt: at, updatedAt: at, files: [] },
  { id: 'P9', name: 'Sample Retail Fit-out', client: 'Demo Shops Inc', address: '9 Test Ave', status: 'estimating', autoPO: 'T909', createdAt: at, updatedAt: at, files: [] }]);
const HAND = [{ id: 'H1', desc: 'Drywall hang + finish labor', cost: 4200, qty: 1, cat: 'Drywall', type: 'labor', mult: 'type' },
  { id: 'H2', desc: 'Paint walls 2 coats', cost: 1.1, qty: 2000, cat: 'Paint', type: 'material', mult: 'type' }];
const SET = { tax: 9.75, marginPct: 30, matMult: 1.4286, labMult: 1.4286, subMult: 1.4286, eqMult: 1.4286, mhCharge: 75, mhCost: 44.44, jobState: 'TN', msContractorTax: 3.5 };
const est = (id, pid, name, ls, extra) => Object.assign({ id, name, gc: 'Demo client', num: '', estimator: 'Wesley Johnson', date: day, status: 'Draft', pid, lines: ls, scope: {}, settings: SET, jobMult: 'mat', ovrMult: 1.5, useOvr: false,
  totalCost: 0, totalCharge: 0, createdAt: at, firstSavedAt: at, savedAt: at, updatedAt: at, versions: [], versionNo: 1 }, extra || {});
cset('estimates', [est('E1', 'P1', 'Maple Street Clinic — base bid', HAND, { totalCost: 6614.5, totalCharge: 9449.6 }),
  est('EM', 'PM1', 'Riverbend dry-out', [{ id: 'HM1', desc: 'Air movers 5 days', cost: 35, qty: 25, cat: 'General', type: 'equipment', mult: 'type' }], { companyId: 'mitigation', totalCost: 875, totalCharge: 1250 }),
  est('EC', 'PC1', 'Riverbend rebuild', [{ id: 'HC1', desc: 'Base trim', cost: 2.5, qty: 300, cat: 'General', type: 'material', mult: 'type' }], { totalCost: 823, totalCharge: 1176 })]);

/* the fake bid-hub: made-up bid jobs and sub bids from the three doors */
const JOBS = [
  { id: 'J1', title: 'Maple Street Clinic', address: '100 Maple St', status: 'open', visibility: 'private', due: day, trades: 'Electrical, Plumbing', invited: 5, bids: 6, leadId: 'crm:L1' },
  { id: 'J2', title: 'Riverbend Flood Job', address: '7 River Rd', status: 'open', visibility: 'private', due: day, trades: 'Mold remediation', invited: 2, bids: 2, leadId: 'crm:L2' },
  { id: 'J3', title: 'Oak Hollow Office', address: '3 Oak Way', status: 'open', visibility: 'public', due: day, trades: 'Roofing', invited: 3, bids: 1, leadId: 'crm:L3' }];
const BIDS = {
  J1: [{ source: 'portal', id: 'b-e1', company: 'Bright Spark Electric', sub: 'Ed Sample', email: 'ed@example.com', trade: 'Electrical', amount: 12400, files: [{ name: 'bright-spark-bid.pdf', ref: 'sb:crm-files/aaa.pdf' }], at, awarded: false, scope: 'Rough-in and trim per E-sheets, new panel 200A, fixtures by owner.' },
    { source: 'email', id: 'b-e2', company: 'Volt Brothers', sub: 'Val Example', email: 'val@example.com', trade: 'Electrical', amount: 9850, files: [{ name: 'volt-quote.pdf', ref: 'sb:crm-files/bbb.pdf' }], at, awarded: false, scope: 'Complete electrical per plans; excludes low voltage.' },
    { source: 'subportal', id: 'b-e3', company: 'Current Co', sub: 'Cy Test', email: 'cy@example.com', trade: 'Electrical', amount: null, files: [], at, awarded: false, scope: 'Will price after the walk.' },
    { source: 'portal', id: 'b-p1', company: 'Pipe Dream Plumbing', email: 'pd@example.com', trade: 'Plumbing', amount: 7200, files: [], at, awarded: false, scope: 'Rough + set fixtures.' },
    { source: 'portal', id: 'b-p2', company: 'Flow Right LLC', email: 'fr@example.com', trade: 'Plumbing', amount: 6900, files: [], at, awarded: false, scope: 'Plumbing complete, gas line excluded.' },
    { source: 'email', id: 'b-x1', company: 'Handy Test Co', email: 'ht@example.com', trade: '', amount: 500, files: [], at, awarded: false, scope: 'Misc.' }],
  J2: [{ source: 'portal', id: 'b-m1', company: 'Dry Fast Demo', email: 'df@example.com', trade: 'Mold remediation', amount: 3300, files: [], at, awarded: false, scope: 'Containment + HEPA.' },
    { source: 'portal', id: 'b-m2', company: 'Clean Air Sample', email: 'ca@example.com', trade: 'Mold remediation', amount: 3900, files: [], at, awarded: false, scope: 'Remediation + clearance.' }],
  J3: [{ source: 'portal', id: 'b-r1', company: 'Top Roof Demo', email: 'tr@example.com', trade: 'Roofing', amount: 18500, files: [], at, awarded: false, scope: 'TPO over ISO.' }] };
/* 0. the server (no browser): bid-hub op link stores the CRM project on the bid job; a bid's file keeps its stored ref */
{ const req = createRequire(import.meta.url), FN = path.resolve(process.argv[2], 'netlify/functions');
  const H = req(FN + '/bid-hub.js')._test, SPH = req(FN + '/subportal.js')._hub, rows = { J1: { job_id: 'J1', data: { id: 'J1', title: 'Maple Street Clinic', log: [] } } }; let saved = null;
  SPH.getRow = async (c, id) => (c === 'jobs' ? rows[id] || null : null); SPH.upsertRows = async r => { saved = r; return r; };
  const no = await H.link({ email: 'pm@example.com', canInvite: false }, { jobId: 'J1', projectId: 'P1' });
  const yes = await H.link({ email: 'wjohnson@grayco-cs.com', canInvite: true }, { jobId: 'J1', projectId: 'P1', projectName: 'T101 · Maple Street Clinic' });
  const d = saved && saved[0] && (saved[0].data || saved[0]);
  ok('0 server: op link — only an admin / estimator / office; saves crmProjectId + name + a log line on the bid job', no.code === 403 && yes.ok && d && d.crmProjectId === 'P1' && d.crmProjectName === 'T101 · Maple Street Clinic' && /Linked to the CRM project/.test(JSON.stringify(d.log)), { no, yes, d });
  ok('0 server: a bid\'s file keeps its stored ref / link (the CRM opens it); anything else is only a name', JSON.stringify([H.fileOut({ name: 'a.pdf', ref: 'sb:crm-files/x.pdf' }), H.fileOut({ fileName: 'b.pdf', url: 'https://example.com/b.pdf' }), H.fileOut({ name: 'c', ref: 'javascript:x' })])
    === JSON.stringify([{ name: 'a.pdf', ref: 'sb:crm-files/x.pdf' }, { name: 'b.pdf', url: 'https://example.com/b.pdf' }, { name: 'c' }])); }
const HUB = { awards: [], links: [] };
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await A.ctx.route('**/.netlify/functions/bid-hub*', async r => {
  const u = new URL(r.request().url()), q = u.searchParams, J = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (r.request().method() === 'POST') {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.op === 'award') { HUB.awards.push(b); const l = BIDS[b.jobId] || []; const x = l.find(y => y.id === b.id && y.source === b.source); if (!x) return J({ ok: false }); x.awarded = b.on !== false; let n = 0;
      l.forEach(o => { if (o !== x && o.source !== 'email' && o.trade === x.trade) { if (x.awarded && !o.awarded && !o.notSelected) { o.notSelected = true; o.nsBy = x.id; n++; } if (!x.awarded && o.nsBy === x.id) { o.notSelected = false; o.nsBy = ''; } } });
      return J({ ok: true, awarded: x.awarded, notSelected: x.awarded ? n : 0 }); }
    if (b.op === 'link') { HUB.links.push(b); const j = JOBS.find(y => y.id === b.jobId); if (j) { j.crmProjectId = b.projectId; j.crmProjectName = b.projectName; } return J({ ok: true }); }
    return J({ ok: true, opened: 0 });
  }
  if (q.get('jobs')) return J({ ok: true, jobs: JOBS, me: { admin: true, estimator: false, office: false, canInvite: true, canPublic: true } });
  const jid = q.get('subbids') || (q.get('lead') ? (JOBS.find(j => j.leadId === q.get('lead')) || {}).id : '');
  if (jid) return J({ ok: true, jobId: jid, bids: JSON.parse(JSON.stringify(BIDS[jid] || [])) });
  return J({ ok: true, subs: [] });
});
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(7000);
const P = () => A.page();
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('patch BIDEST is loaded (and the Bid portal module)', await A.ev(() => !!window.__GC_PATCH_BIDEST__ && !!(window._gcSys && window._gcSys.bp && window._gcSys.bp.mode)));
await wait(() => window._gcEST3 && window._gcEST3.list().some(e => e.id === 'E1') && (window._crm.projects || []).length >= 4, null, 60000);

/* 1. the tab: 🧰 Full bid portal by default, 📊 Bids & invites on a click (remembered) */
await A.ev(() => { try { localStorage.removeItem('gc_bp_mode:wjohnson@grayco-cs.com'); } catch (e) {} window._setView('bidportal'); });
await wait(() => document.querySelector('#gc-sys-bp-mount [data-bp-frame]'));
const t1 = await A.ev(() => { const m = document.getElementById('gc-sys-bp-mount'), f = m.querySelector('[data-bp-frame]'), crm = m.querySelector('#gc-sys-bp');
  return { src: f && f.getAttribute('src'), frameShown: !!f && f.offsetHeight > 300, crmHidden: !!crm && crm.style.display === 'none', sw: [...m.querySelectorAll('[data-sys="bpmode"]')].map(b => b.textContent.trim() + (b.classList.contains('on') ? ' [on]' : '')) }; });
ok('1 an admin opens the Bid portal tab on 🧰 Full bid portal: the /subportal/ admin, full height; the CRM view hidden', t1.src === '/subportal/' && t1.frameShown && t1.crmHidden && /Full bid portal.*\[on\]/.test(t1.sw[0]) && /Bids & invites/.test(t1.sw[1]), t1);
await sleep(2500); await shot(A, '01_tab_full_bid_portal');
await A.ev(() => document.querySelector('#gc-sys-bp-mount [data-sys="bpmode"][data-m="crm"]').click());
await wait(() => document.querySelector('#gc-sys-bp-mount tr[data-sys-job="J1"]'));
const t2 = await A.ev(() => { const m = document.getElementById('gc-sys-bp-mount'); return { crm: m.querySelector('#gc-sys-bp').style.display !== 'none', frameHidden: m.querySelector('[data-bp-full]').style.display === 'none',
  saved: localStorage.getItem('gc_bp_mode:wjohnson@grayco-cs.com'), btn: (m.querySelector('tr[data-sys-job="J1"] [data-sys="bids"]') || {}).textContent }; });
ok('1 📊 Bids & invites shows the CRM view (remembered for this person); each job has 📊 Bids (N)', t2.crm && t2.frameHidden && t2.saved === 'crm' && t2.btn === '📊 Bids (6)', t2);
await shot(A, '02_tab_bids_and_invites');

/* 2. the comparison */
await A.ev(() => document.querySelector('#gc-sys-bp-mount tr[data-sys-job="J1"] [data-sys="bids"]').click());
await wait(() => document.querySelector('#gcsys-modal [data-be-bid]'));
const cmp = () => A.ev(() => [...document.querySelectorAll('#gcsys-modal [data-be-trade]')].map(t => { const rows = [...t.nextElementSibling.querySelectorAll('tr[data-be-bid]')];
  return { trade: t.getAttribute('data-be-trade'), bids: rows.map(r => ({ k: r.getAttribute('data-be-bid'), a: r.getAttribute('data-amount'), low: !!r.querySelector('[data-be-low]'), st: r.querySelector('[data-be-status]').getAttribute('data-be-status'), co: r.querySelector('td b').textContent, files: r.cells[3].textContent })) }; }));
let c = await cmp();
ok('2 by trade A→Z (no trade last): Electrical, Plumbing, Trade not given', c.map(g => g.trade).join('|') === 'Electrical|Plumbing|Trade not given', c.map(g => g.trade));
ok('2 inside a trade the lowest first, no amount last: Electrical 9850 → 12400 → (none); Plumbing 6900 → 7200', c[0].bids.map(b => b.a).join(',') === '9850,12400,' && c[1].bids.map(b => b.a).join(',') === '6900,7200', c);
ok('2 the lowest bid of each trade is marked (and only it)', c[0].bids.map(b => b.low).join() === 'true,false,false' && c[1].bids.map(b => b.low).join() === 'true,false', c);
ok('2 all three doors, company, files, status pending', c[0].bids.map(b => b.k).join() === 'email:b-e2,portal:b-e1,subportal:b-e3' && c[0].bids[0].co === 'Volt Brothers' && /volt-quote\.pdf/.test(c[0].bids[0].files) && c.every(g => g.bids.every(b => b.st === 'pending')), c);
const headTxt = await A.ev(() => document.querySelector('#gcsys-modal [data-be-proj]').textContent);
ok('2 the header names the linked project (from the bid job\'s lead): T101 · Maple Street Clinic', /T101 · Maple Street Clinic/.test(headTxt) && /lead/.test(headTxt), headTxt);
await shot(A, '03_bid_comparison');

/* 3. award → one sub line in P1's estimate */
const recOf = id => A.ev(id => { const l = (window._gcEstimatesState && window._gcEstimatesState.length ? window._gcEstimatesState : window._crm.estimates) || []; const e = l.find(x => x && x.id === id); return e ? JSON.parse(JSON.stringify(e)) : null; }, id);
const before = await recOf('E1');
await A.ev(() => document.querySelector('#gcsys-modal tr[data-be-bid="email:b-e2"] [data-be="award"]').click());
await wait(() => { const r = document.querySelector('#gcsys-modal tr[data-be-bid="email:b-e2"] [data-be-status]'); return r && r.getAttribute('data-be-status') === 'awarded'; });
await sleep(800);
let e1 = await recOf('E1');
const bl = l => (l || []).filter(x => x.bidRef && x.bidRef.from === 'bid portal');
let lines = bl(e1 && e1.lines);
ok('3 🏆 Award → the bid-hub award op (email:b-e2, on)', HUB.awards.some(a => a.op === 'award' && a.jobId === 'J1' && a.source === 'email' && a.id === 'b-e2' && a.on === true), HUB.awards);
ok('3 ONE sub line in P1\'s estimate: Electrical, $9,850, Volt Brothers, type sub, bid reference (id, source, file)', lines.length === 1 && lines[0].cost === 9850 && lines[0].type === 'sub' && lines[0].cat === 'Electrical' && lines[0].supplier === 'Volt Brothers'
  && lines[0].bidRef.key === 'email:b-e2' && lines[0].bidRef.id === 'b-e2' && lines[0].bidRef.source === 'email' && lines[0].bidRef.jobId === 'J1' && lines[0].bidRef.awarded === true && lines[0].bidRef.files[0].ref === 'sb:crm-files/bbb.pdf' && /low voltage/.test(lines[0].bidRef.scope), lines);
ok('3 the line text never names the sub (customer documents print it)', !/Volt/.test(lines[0] && lines[0].desc), lines[0] && lines[0].desc);
ok('3 the estimate totals follow: cost +9,850, charge +9,850 × the sub margin', e1 && Math.abs(e1.totalCost - before.totalCost - 9850) < 0.01 && Math.abs(e1.totalCharge - before.totalCharge - 9850 * 1.4286) < 0.05, { b: [before.totalCost, before.totalCharge], a: e1 && [e1.totalCost, e1.totalCharge] });
ok('3 the hand-typed lines are as they were', JSON.stringify((e1.lines || []).filter(x => !x.bidRef).map(x => [x.id, x.desc, x.cost, x.qty, x.type])) === JSON.stringify(HAND.map(x => [x.id, x.desc, x.cost, x.qty, x.type])), e1.lines);
c = await cmp();
ok('3 after the award: Volt Brothers 🏆 awarded, the other Electrical bids Not selected; the row says ✓ In estimate', c[0].bids[0].st === 'awarded' && c[0].bids.slice(1).every(b => b.st === 'notselected') && c[1].bids.every(b => b.st === 'pending')
  && await A.ev(() => /In estimate/.test(document.querySelector('#gcsys-modal tr[data-be-bid="email:b-e2"]').textContent)), c);
await shot(A, '04_after_award');
const cloudE1 = () => { let v = cget('estimates'); if (typeof v === 'string') v = JSON.parse(v); return (Array.isArray(v) ? v : []).find(e => e && e.id === 'E1'); };
for (let i = 0; i < 90 && bl((cloudE1() || {}).lines).length !== 1; i++) await sleep(500);   /* the CRM's sync queue sends it (patch SYNCQ) */
ok('3 the estimate with the bid line reached the cloud', bl((cloudE1() || {}).lines).length === 1, (cloudE1() || {}).lines);
/* award twice: the lead drawer's / old list's award path and the API → still one line */
await A.ev(() => window._gcBidEst.sync('J1', 'email', 'b-e2', true)); await sleep(1500);
await A.ev(() => window._gcBidEst.put('J1', { source: 'email', id: 'b-e2', company: 'Volt Brothers', trade: 'Electrical', amount: 9850, files: [], scope: '' }, true)); await sleep(500);
e1 = await recOf('E1');
ok('3 awarding again → no duplicate (one line, same amount)', bl(e1.lines).length === 1 && bl(e1.lines)[0].cost === 9850 && Math.abs(e1.totalCost - before.totalCost - 9850) < 0.01, bl(e1.lines));
/* undo */
await A.ev(() => document.querySelector('#gcsys-modal tr[data-be-bid="email:b-e2"] [data-be="unaward"]').click());
await wait(() => { const r = document.querySelector('#gcsys-modal tr[data-be-bid="email:b-e2"] [data-be-status]'); return r && r.getAttribute('data-be-status') === 'pending'; });
await sleep(600);
e1 = await recOf('E1');
ok('3 Undo award → the bid line is off; the hand-typed lines untouched; totals back', bl(e1.lines).length === 0 && JSON.stringify(e1.lines.map(x => [x.id, x.desc, x.cost, x.qty])) === JSON.stringify(HAND.map(x => [x.id, x.desc, x.cost, x.qty])) && Math.abs(e1.totalCost - before.totalCost) < 0.01, e1.lines);
ok('3 Undo → the bid-hub award op with on:false', HUB.awards.some(a => a.id === 'b-e2' && a.on === false));

/* ➕ Add to estimate (no award) → one line marked "Sub bid"; then take it off */
await A.ev(() => document.querySelector('#gcsys-modal tr[data-be-bid="portal:b-p2"] [data-be="add"]').click()); await sleep(600);
e1 = await recOf('E1');
ok('3 ➕ Add to estimate puts the bid in without awarding it', bl(e1.lines).length === 1 && bl(e1.lines)[0].bidRef.key === 'portal:b-p2' && bl(e1.lines)[0].bidRef.awarded === false && bl(e1.lines)[0].cost === 6900 && bl(e1.lines)[0].cat === 'Plumbing', bl(e1.lines));

/* 6. the builder: the line shows its tag; an award while the estimate is open goes in live */
await A.ev(() => window._gcBidEst.close());
for (let i = 0; i < 5; i++) {   /* the first open of the builder after a sign-in only loads it (as a person would, open again) */
  await A.ev(() => window._gcEST3.open('E1'));
  if (!await wait(() => document.querySelector('#est-lines .el[data-lineid="bid_portal_b-p2"]'), null, 8000)) continue;
  /* the builder brings back its stored tabs when a sync lands while nobody works in it (before this patch too): settle first */
  await sleep(6000); if (await A.ev(() => !!document.querySelector('#est-lines .el[data-lineid="bid_portal_b-p2"]'))) break;
}
await A.ev(() => window._gcBidEst.sync('J1', 'email', 'b-e2', true)); await sleep(2000);
const bld = await A.ev(() => { const tags = [...document.querySelectorAll('#est-lines [data-bidest-tag]')].map(t => t.textContent + '=' + t.getAttribute('data-bidest-tag'));
  const tot = lines.reduce((s, l) => s + lineCharge(l), 0), hand = lines.filter(l => !l.bidRef).reduce((s, l) => s + lineCharge(l), 0);
  return { tags, n: lines.length, bidN: lines.filter(l => l.bidRef).length, tot, hand, sum: document.getElementById('est-summary') ? document.getElementById('est-summary').innerText : '', note: (document.querySelector('#est-lines .gc-bidest-note') || {}).textContent || '' }; });
ok('6 the builder shows the bid lines with their tags: 🏗 Sub bid (➕) and 🏆 Awarded bid (awarded while open, live)', bld.bidN === 2 && bld.n === 4 && bld.tags.some(t => t === '🏆 Awarded bid=email:b-e2') && bld.tags.some(t => t === '🏗 Sub bid=portal:b-p2') && /From the bid portal/.test(bld.note), bld);
const fmt2 = n => n.toFixed(2), fmtC = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
ok('6 the builder total includes the bid lines (sum of the line charges, shown in the summary)', bld.tot - bld.hand > 16750 * 1.4 && (bld.sum.includes(fmt2(bld.tot)) || bld.sum.includes(fmtC(bld.tot))), { tot: bld.tot, hand: bld.hand, sum: bld.sum.slice(0, 300) });
await A.ev(() => { const r = document.querySelector('#est-lines .el[data-lineid="bid_email_b-e2"]'); if (r) r.scrollIntoView({ block: 'center' }); }); await sleep(600);
await shot(A, '05_estimate_builder_bid_line');
await sleep(2500);
e1 = await recOf('E1');
ok('6 the live award was saved with the estimate (2 bid lines, the hand-typed ones kept)', bl(e1.lines).length === 2 && HAND.every(h => e1.lines.some(l => l.id === h.id && l.cost === h.cost)), (e1.lines || []).map(l => l.id));
await A.ev(() => window._gcBidEst.take('portal:b-p2')); await sleep(1500);
const live2 = await A.ev(() => ({ ids: lines.map(l => l.id), dom: !!document.querySelector('#est-lines .el[data-lineid="bid_portal_b-p2"]') }));
ok('6 ➖ while open: the line leaves the builder at once, the others stay', !live2.ids.includes('bid_portal_b-p2') && live2.ids.includes('bid_email_b-e2') && live2.ids.includes('H1') && !live2.dom, live2);

/* 4. no linked project → the picker; the pick is remembered */
await A.ev(() => { window._setView('bidportal'); }); await sleep(1500);
await A.ev(() => window._gcBidEst.open('J3'));
await wait(() => document.querySelector('#gcsys-modal tr[data-be-bid="portal:b-r1"]'));
const h3 = await A.ev(() => document.querySelector('#gcsys-modal [data-be-proj]').textContent);
ok('4 the lead is not a project yet → said so, with 📁 Pick the project', /Oak Hollow Office/.test(h3) && /not a project yet/.test(h3) && /Pick the project/.test(h3), h3);
await A.ev(() => document.querySelector('#gcsys-modal tr[data-be-bid="portal:b-r1"] [data-be="award"]').click());
await wait(() => document.querySelector('#gcsys-modal [data-be-picker]'));
await A.ev(() => { const i = document.querySelector('#gcsys-modal [data-be-q]'); i.value = 'retail'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(400);
const pl = await A.ev(() => [...document.querySelectorAll('#gcsys-modal [data-be="pickp"]')].map(b => b.getAttribute('data-pid')));
ok('4 award with no project → the searchable project picker ("retail" → Sample Retail Fit-out)', pl.join() === 'P9', pl);
await shot(A, '06_project_picker');
await A.ev(() => document.querySelector('#gcsys-modal [data-be="pickp"][data-pid="P9"]').click());
await wait(() => { const r = document.querySelector('#gcsys-modal tr[data-be-bid="portal:b-r1"] [data-be-status]'); return r && r.getAttribute('data-be-status') === 'awarded'; });
await sleep(1500);
const p9 = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'P9'); const es = (window._gcEstimatesState || window._crm.estimates || []).filter(e => e && e.pid === 'P9'); return { link: p.bidJobId, es: es.map(e => ({ id: e.id, st: e.status, n: e.lines.length, l: e.lines[0], co: e.companyId })), head: (document.querySelector('#gcsys-modal [data-be-proj]') || {}).textContent }; });
ok('4 the pick is remembered on the project (bidJobId) and on the bid job (op link)', p9.link === 'J3' && HUB.links.some(l => l.jobId === 'J3' && l.projectId === 'P9'), { p9: p9.link, links: HUB.links });
ok('4 P9 had no estimate → a new Draft estimate for P9 with the $18,500 Roofing sub line', p9.es.length === 1 && p9.es[0].st === 'Draft' && p9.es[0].n === 1 && p9.es[0].l.cost === 18500 && p9.es[0].l.cat === 'Roofing' && p9.es[0].l.bidRef.key === 'portal:b-r1', p9.es);
ok('4 the header now names the picked project', /T909 · Sample Retail Fit-out/.test(p9.head || ''), p9.head);

/* 5. company: L2 has a Mitigation and a Construction project → the lead's company (Mitigation) */
await A.ev(() => window._gcBidEst.open('J2'));
await wait(() => document.querySelector('#gcsys-modal tr[data-be-bid="portal:b-m1"]'));
const h2 = await A.ev(() => ({ t: document.querySelector('#gcsys-modal [data-be-proj]').textContent, pid: document.querySelector('#gcsys-modal [data-be-proj]').getAttribute('data-be-proj') }));
ok('5 a lead with a Mitigation and a Construction project → the Mitigation one (the lead\'s company)', h2.pid === 'PM1' && /M-T201/.test(h2.t), h2);
const ecBefore = await recOf('EC');
await A.ev(() => document.querySelector('#gcsys-modal tr[data-be-bid="portal:b-m1"] [data-be="award"]').click());
await wait(() => { const r = document.querySelector('#gcsys-modal tr[data-be-bid="portal:b-m1"] [data-be-status]'); return r && r.getAttribute('data-be-status') === 'awarded'; });
await sleep(800);
const em = await recOf('EM'), ec = await recOf('EC');
ok('5 the Mitigation project\'s estimate gets the $3,300 line; the Construction one is untouched', bl(em.lines).length === 1 && bl(em.lines)[0].cost === 3300 && bl(ec.lines).length === 0 && JSON.stringify(ec.lines) === JSON.stringify(ecBefore.lines), { em: em.lines, ec: ec.lines });

/* the old 📨 list (lead drawer) sorts the same way */
const old = await A.ev(() => { const h = window._gcSys.bp.table([{ trade: 'Plumbing', amount: 7200, id: 'a', files: [], source: 'portal' }, { trade: 'Electrical', amount: null, id: 'b', files: [], source: 'portal' }, { trade: 'Electrical', amount: 12400, id: 'c', files: [], source: 'portal' }, { trade: 'Electrical', amount: 9850, id: 'd', files: [], source: 'email' }, { trade: 'Plumbing', amount: 6900, id: 'e', files: [], source: 'portal' }], 'J1');
  const d = document.createElement('div'); d.innerHTML = h; return [...d.querySelectorAll('tr[data-sys-bid]')].map(r => r.getAttribute('data-sys-bid')).join(','); });
ok('6 the lead drawer\'s 📨 list: by trade A→Z, lowest first, no amount last', old === 'd,c,b,e,a', old);
ok('no page errors', !errs.length, errs);
if (SHOTS) fs.writeFileSync(SHOTS + '/index.txt', [
  'BIDEST screenshots — made-up data only (offline harness; fake bid-hub with invented subs, projects, estimates)',
  '01_tab_full_bid_portal.png      🏗 Bid portal tab for an admin, default 🧰 Full bid portal (the /subportal/ admin iframe; offline the bid site has no data, so the frame is blank here)',
  '02_tab_bids_and_invites.png     the same tab switched to 📊 Bids & invites (CRM view): each job has 📊 Bids (N)',
  '03_bid_comparison.png           📊 All bids — Maple Street Clinic: by trade A→Z, lowest first, ⬇ Lowest marked, all three doors, status, 🏆 Award / ➕ Add to estimate',
  '04_after_award.png              after 🏆 Award on Volt Brothers ($9,850, e-mailed bid): Awarded, the other Electrical bids Not selected, ✓ In estimate',
  '05_estimate_builder_bid_line.png the project\'s estimate in the 📐 Estimate Builder: the sub lines with 🏆 Awarded bid / 🏗 Sub bid tags and where they came from; totals include them',
  '06_project_picker.png           a bid job whose lead is not a project yet: award → the searchable project picker', ''].join('\n'));
const n = R.filter(Boolean).length; console.log('BIDEST ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
