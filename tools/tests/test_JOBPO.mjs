// test_JOBPO.mjs <build-dir> [shot-dir] — patch JOBPO (11/15 list 5.1c): 🧾 Expenses by PO on the job — PO column (⚠ No PO, ⚠ another
// job's PO), PO / who filters, PO spend by sub (receipts on the PO + sub invoices); admins / office / the job's PM only. Made-up data, offline.
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const { computer, signIn, sleep, cset, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const at = new Date(Date.now() - 3 * 864e5).toISOString(), d = at.slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('vendors', [{ id: 'S1', name: 'Zedd Drywall LLC', trade: 'Drywall', isSub: true }, { id: 'S2', name: 'Demo Paint Co', trade: 'Paint', isSub: true }]);
cset('projects', [{ id: 'P1', name: 'Zedd Demo Kitchen', client: 'Zedd Demo', clientPhone: '9015550111', status: 'active', pm: 'Demo PM', autoPO: 'T801', createdAt: at, updatedAt: at },
  { id: 'P9', name: 'Demo Other', client: 'Dot Demo', clientPhone: '9015550112', status: 'active', pm: 'Demo PM', autoPO: 'T999', createdAt: at, updatedAt: at }]);
cset('expenses', [
  { id: 'SPR_1', pid: 'P1', sub: 'Zedd Drywall LLC', subId: 'S1', payee: 'Zedd Drywall LLC', vendor: 'Home Depot', amt: 120, po: 'T801', date: d, status: 'pending', source: 'sub-portal' },
  { id: 'SPR_2', pid: 'P1', sub: 'Zedd Drywall LLC', subId: 'S1', payee: 'Zedd Drywall LLC', vendor: "Lowe's", amt: 60, po: '', date: d, status: 'pending', source: 'sub-portal' },
  { id: 'E3', pid: 'P1', vendor: 'Demo Lumber', by: 'Demo PM', amt: 40, po: 'T801', date: d, status: 'approved' },
  { id: 'E4', pid: 'P1', vendor: 'Demo Supply', sub: 'Demo Paint Co', subId: 'S2', amt: 25, po: 'Z123', date: d, status: 'pending' },
  { id: 'E5', pid: 'P9', vendor: 'Elsewhere', amt: 999, po: 'T999', date: d, status: 'approved' }]);
cset('invs', [{ id: 'I1', type: 'sub', sub: 'Zedd Drywall LLC', subId: 'S1', pid: 'P1', amt: 1800, status: 'received', date: d }]);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up', !!await wait(() => window._gcJobPo && (window._crm.expenses || []).length >= 5 && (window._crm.invs || window._crm.invoices || []).length >= 1, null, 60000));
const rows = await A.ev(() => window._gcJobPo.rows('P1').map(r => r.id + ':' + r.po + ':' + r.flag + ':' + r.who).sort());
ok('B1 the job\'s 4 expenses with their PO and the flag (no PO, another job\'s PO); not the other job\'s', JSON.stringify(rows) === JSON.stringify(['E3:T801::Demo PM', 'E4:Z123:other:Demo Paint Co', 'SPR_1:T801::Zedd Drywall LLC', 'SPR_2::none:Zedd Drywall LLC']), rows);
const S = await A.ev(() => window._gcJobPo.bySub('P1'));
ok('B2 PO spend by sub: Zedd receipts $180 (2, 1 no PO) + invoices $1,800 (1); Demo Paint $25', S.length === 2 && S[0].sub === 'Zedd Drywall LLC' && S[0].rec === 180 && S[0].n === 2 && S[0].noPo === 1 && S[0].inv === 1800 && S[1].sub === 'Demo Paint Co' && S[1].rec === 25, S);
await A.ev(() => { const c = document.createElement('details'); c.id = 'zz-jpo'; c.open = true; document.body.prepend(c); c.innerHTML = window._gcJobPo.html(window._crm.projects.find(p => p.id === 'P1')); });
const t = await A.ev(() => ({ rows: document.querySelectorAll('#zz-jpo [data-jpo-r]').length, nopo: /⚠ No PO/.test(document.getElementById('zz-jpo').textContent), other: /not this job's PO/.test(document.getElementById('zz-jpo').textContent), opts: [...document.querySelectorAll('#zz-jpo [data-jpo="po"] option')].map(o => o.value), who: [...document.querySelectorAll('#zz-jpo [data-jpo="who"] option')].map(o => o.value), subRows: document.querySelectorAll('#zz-jpo [data-jpo-sub]').length }));
ok('B3 the card: 4 rows, the PO column with ⚠ No PO and ⚠ not this job\'s PO, PO filter (T801, Z123, No PO), who filter (each sub + our crew), 2 sub totals', t.rows === 4 && t.nopo && t.other && JSON.stringify(t.opts) === JSON.stringify(['', 'T801', 'Z123', '__none']) && JSON.stringify(t.who) === JSON.stringify(['', 'Demo Paint Co', 'Zedd Drywall LLC', '__crew']) && t.subRows === 2, t);
const f = await A.ev(() => { const out = {}; [['po', '__none'], ['po', 'T801'], ['who', '__crew']].forEach(([k, v], i) => { const o = { po: '', who: '' }; o[k] = v; if (i === 2) o.po = 'T801'; window._gcJobPo.filter(o); }); const p = window._crm.projects.find(x => x.id === 'P1'); window._gcJobPo.filter({ po: '__none', who: '' }); out.none = (window._gcJobPo.html(p).match(/data-jpo-r=/g) || []).length; window._gcJobPo.filter({ po: 'T801', who: '__crew' }); out.crew = (window._gcJobPo.html(p).match(/data-jpo-r=/g) || []).length; window._gcJobPo.filter({ po: '', who: 'Zedd Drywall LLC' }); out.zedd = (window._gcJobPo.html(p).match(/data-jpo-r=/g) || []).length; window._gcJobPo.filter({ po: '', who: '' }); return out; });
ok('B4 filters: No PO → 1 · T801 + our crew → 1 · Zedd → 2', f.none === 1 && f.crew === 1 && f.zedd === 2, f);
if (SHOTS) await A.page().screenshot({ path: SHOTS + '/jobpo.png' });
ok('B5 no page errors', A.errs.length === 0, A.errs);
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
