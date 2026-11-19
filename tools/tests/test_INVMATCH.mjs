// test_INVMATCH.mjs <build-dir> — patch INVMATCH (owner 11/16: "she had issues Friday entering invoices still and matching jobs. It was not
// matching or putting jobs in the right spot correctly"). The WHOLE CRM (index.html) in the offline harness (harness_N: stubbed Supabase +
// functions), signed in as the office, with made-up rows shaped like Friday's (11/13) live records:
//   A. the background job finders (FINDJOB _gcAssignByPO every 60 s, PO→job _gcLinkSubInvoices, the sub-invoice router) run on their own:
//      · a job for the customer "Office" no longer takes other customers' invoices that merely say "office" (#1120 / #1132 / bill #1250);
//      · a job for the customer "Enterprise" no longer takes a bill for another Enterprise site (#1302);
//      · a customer with several jobs → the invoice is NOT put on the first one; one PO on 3 jobs → no job; two jobs at one address → no job;
//      · a lost job is never the target; nothing attaches to a job that is not there;
//      · what IS sure still lands by itself: the PO of exactly one job, its street address, the customer of exactly one job.
//   B. ➕ New project (patch NEWPROJ) from the invoice:
//      · "Did you mean …?" finds the existing job for "4964 Given Ave" (the job is at 4964 GivenS Ave) and for a memo that holds the address;
//      · opened from 🔗 QuickBooks ↔ CRM it knows the record (id, vendor, memo);
//      · the type list is the CRM's (Insurance Claim, Mitigation…), a Mitigation job defaults to type Mitigation;
//      · a customer that already has jobs does not lend its billing address to the new job.
// Made-up data only. Run: flock <scratchpad>/locks/browser.lock node tools/tests/test_INVMATCH.mjs <abs build dir>
import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, waitFor, resetCloud, cset, cget } = H;
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

const now = new Date().toISOString();
const P = (id, o) => Object.assign({ id, type: 'Residential Reno', status: 'completed', jobYear: 2026, contract: 0, created: '2026-03-01', createdAt: '2026-03-01T12:00:00.000Z', pm: 'Demo PM', subs: [], photos: [], checklist: [], followUps: [], customerNotes: '', leadSource: 'GrayCo', source: 'grayco' }, o);
const PROJECTS = [
  P('PJ_OFF', { name: 'New Office', client: 'Office', address: '6382 Stage Rd', autoPO: 'O046', createdVia: 'invoice-entry', createdAt: now }),
  P('PJ_ENT', { name: 'Lexington Enterprise', client: 'Enterprise', address: '', autoPO: 'M898', createdVia: 'invoice-entry', createdAt: now }),
  P('PJ_EQ1', { name: 'Enterprise', client: 'Enterprise', status: 'Active', type: 'Commercial TI', autoPO: 'V221' }),
  P('PJ_EQ2', { name: 'Enterprise', client: 'Enterprise', status: 'Active', type: 'Commercial TI', autoPO: 'V221' }),
  P('PJ_EQ3', { name: 'Enterprise', client: 'Enterprise', status: 'Active', type: 'Commercial TI', autoPO: 'V221' }),
  P('PJ_MS1', { name: 'Midway Demo - Elm St water', client: 'Midway Demo Restoration Services', address: '10 Elm St', autoPO: 'A101' }),
  P('PJ_MS2', { name: 'Midway Demo - Oak Ave fire', client: 'Midway Demo Restoration Services', address: '20 Oak Ave', autoPO: 'A102' }),
  P('PJ_MS3', { name: 'Midway Demo - Pine Ln roof', client: 'Midway Demo Restoration Services', address: '30 Pine Ln', autoPO: 'A103' }),
  P('PJ_GF', { name: 'Gina Demo reroof', client: 'Gina Demo', address: '4964 Givens Ave, Memphis, TN', autoPO: 'W166', type: 'Roofing' }),
  P('PJ_CD1', { name: 'Evan Sample roof claim', client: '', address: '8901 Clair Douwie Cove, Memphis, TN', status: 'bidding', autoPO: 'P817' }),
  P('PJ_CD2', { name: 'Evan Sample', client: '', address: '8901 Clair Douwie Cove', status: 'bidding', autoPO: 'P642' }),
  P('PJ_ONE', { name: 'Hollis Demo Duplex', client: 'Ray Demo Hollis', address: '88 Hollis Rd, Memphis, TN', autoPO: 'K101', status: 'active' }),
  P('PJ_LOST', { name: 'Demo Lost Bath', client: 'Lou Demo Lost', address: '12 Lostwood Ln', autoPO: 'D626', status: 'lost' })];
const Q = (id, o) => Object.assign({ id, pid: '', source: 'quickbooks', by: 'QuickBooks import', status: 'paid', paid: true, sent: 'recorded', noSend: true, importedHistory: true, noReminders: true, noAutoReminders: true, remindersPaused: true, date: '2026-10-13', recvDate: '2026-10-13', savedAt: '2026-11-05T16:47:44.435Z', updatedAt: '2026-11-05T16:47:44.435Z' }, o);
const INVS = [
  Q('IV_1120', { type: 'client', client: 'Vertex Demo Operating Company', invNum: '1120', qbNum: '1120', amt: 6500, qbKey: 'QB:invoice:1120:vertex', qbNeedsHome: true, desc: 'QuickBooks invoice #1120 — Front office repairs from water damage\n\nSOW-\n1.Replace all ceiling tiles' }),
  Q('IV_1132', { type: 'client', client: 'City of Demoville', invNum: '1132', qbNum: '1132', amt: 10000, qbKey: 'QB:invoice:1132:city', qbNeedsHome: true, status: 'overdue', paid: undefined, desc: 'QuickBooks invoice #1132 — All work completed in the engineering office for the partition walls added' }),
  Q('IV_1250', { type: 'sub', sub: 'CH Demo Plumbing', invNum: '1250', amt: 2300, qbKey: 'QB:bill:1250:ch', desc: 'QuickBooks bill #1250 — 3161 Hwy 64 Ped. Office top out (2/3)' }),
  Q('IV_1302', { type: 'sub', sub: 'CH Demo Plumbing', invNum: '1302', amt: 4378.09, qbKey: 'QB:bill:1302:ch', desc: 'QuickBooks bill #1302 — Enterprise ADA remodel 2681 Mount Moriah' }),
  Q('IV_1102', { type: 'client', client: 'Midway Demo Restoration Services', invNum: '1102', qbNum: '1102', amt: 15000, qbKey: 'QB:invoice:1102:midway', qbNeedsHome: true, desc: 'QuickBooks invoice #1102 — Final draw' }),
  Q('IV_V221', { type: 'sub', sub: 'Demo Lumber', invNum: '7001', amt: 600, po: 'V221', qbKey: 'QB:bill:7001:demo', desc: 'QuickBooks bill #7001 — lumber' }),
  Q('IV_K101', { type: 'sub', sub: 'Demo Lumber', invNum: '7002', amt: 610, po: 'K101', qbKey: 'QB:bill:7002:demo', desc: 'QuickBooks bill #7002 — lumber' }),
  Q('IV_ADDR', { type: 'sub', sub: 'Demo Roofing', invNum: '7003', amt: 4650, qbKey: 'QB:bill:7003:demo', desc: 'QuickBooks bill #7003 — Tear-off at 88 Hollis Road' }),
  Q('IV_CLAIR', { type: 'sub', sub: 'Demo Gutter Co', invNum: '7004', amt: 950, qbKey: 'QB:bill:7004:demo', desc: 'QuickBooks bill #7004 — gutters 8901 Clair Douwie Cove' }),
  Q('IV_CUST1', { type: 'client', client: 'Ray Demo Hollis', invNum: '1140', qbNum: '1140', amt: 2500, qbKey: 'QB:invoice:1140:ray', qbNeedsHome: true, desc: 'QuickBooks invoice #1140 — draw 2' }),
  Q('IV_LOST', { type: 'sub', sub: 'Demo Tile', invNum: '7005', amt: 300, qbKey: 'QB:bill:7005:demo', desc: 'QuickBooks bill #7005 — 12 Lostwood Ln tile' }),
  Q('IV_GIV', { type: 'sub', sub: 'Central Demo Roofing', invNum: '0128', amt: 1623, qbKey: 'QB:bill:0128:central', desc: 'QuickBooks bill #0128' }),
  Q('IV_MEMO', { type: 'sub', sub: 'Central Demo Roofing', invNum: '0129', amt: 400, qbKey: 'QB:bill:0129:central', desc: 'QuickBooks bill #0129 — tarp. address job 4964 Givens Ave' })];
const CUSTOMERS = [{ id: 'CUS_ENT', name: 'Enterprise', address: '1700 West Demo Cove, Hernando MS', phone: '', email: 'ap@enterprise.example' }, { id: 'CUS_GF', name: 'Gina Demo', address: '4964 Givens Ave, Memphis, TN', phone: '901-555-0101', email: '' }];
const USERS = [{ id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }];

resetCloud();
cset('projects', PROJECTS); cset('invs', INVS); cset('customers', CUSTOMERS); cset('users', USERS); cset('subs', []); cset('expenses', []); cset('leads', []);
cset('gc_automation_pause', { on: true, at: '2026-11-04T12:00:00.000Z', by: 'owner' });

const A = await computer('office', { build });
const signed = await signIn(A, 'office@grayco-cs.com', 30000);
ok(signed, 'the office is signed in to the CRM');
const loaded = await waitFor(A, n => (window._crm && (window._crm.projects || []).length >= n) || null, PROJECTS.length, 90000);
ok(loaded, 'the CRM loaded the jobs', await A.ev(() => (window._crm && window._crm.projects || []).length));
ok(await waitFor(A, () => typeof window._gcAssignByPO === 'function' && typeof window._gcAutoRouteSubInvoices === 'function' && typeof window._gcLinkSubInvoices === 'function' && typeof window._gcNewProjectFor === 'function', null, 30000), 'the job finders and ➕ New project are loaded');

/* A. let every background finder run (FINDJOB beat: at once, then every 60 s; PO→job: 9 s; the sub router: 12 s) — then run each once more by hand */
await sleep(16000);
await A.ev(async () => { try { await window._gcAssignByPO(); } catch (e) {} try { await window._gcLinkSubInvoices(true); } catch (e) {} try { window._gcAutoRouteSubInvoices(); } catch (e) {} });
await sleep(2500);
const live = await A.ev(() => { const l = (window._crm && (window._crm.invs && window._crm.invs.length ? window._crm.invs : window._crm.invoices)) || []; const o = {}; l.forEach(x => { if (x && /^IV_/.test(x.id)) o[x.id] = { pid: x.pid || '', guess: x._jobGuess || '', auto: !!x.autoLinked, why: x.autoLinkWhy || '' }; }); return o; });
const pidOf = id => (live[id] || {}).pid;
ok(Object.keys(live).length === INVS.length, 'all the made-up invoices are on screen', Object.keys(live));
ok(pidOf('IV_1120') !== 'PJ_OFF' && pidOf('IV_1132') !== 'PJ_OFF', 'two other customers\' invoices that say "office" are NOT put on the job of the customer "Office"', [live.IV_1120, live.IV_1132]);
ok(pidOf('IV_1250') !== 'PJ_OFF', 'a bill for "3161 Hwy 64 Ped. Office" is NOT put on "New Office" (6382 Stage Rd)', live.IV_1250);
ok(!/^PJ_(ENT|EQ)/.test(pidOf('IV_1302')), 'a bill for "Enterprise ADA remodel 2681 Mount Moriah" is NOT put on an Enterprise job at another site', live.IV_1302);
ok(!pidOf('IV_1102'), 'a customer with 3 jobs: its invoice is NOT put on the first one (the office picks)', live.IV_1102);
ok(!pidOf('IV_V221'), 'one PO on 3 jobs: the bill gets no job by itself', live.IV_V221);
ok(!pidOf('IV_CLAIR'), 'two jobs at the same address: the bill gets no job by itself', live.IV_CLAIR);
ok(pidOf('IV_LOST') !== 'PJ_LOST', 'a lost job is never picked by the finder', live.IV_LOST);
ok(pidOf('IV_K101') === 'PJ_ONE', 'the PO of exactly one job still puts the bill on it', live.IV_K101);
ok(pidOf('IV_ADDR') === 'PJ_ONE', 'the street address of exactly one job ("88 Hollis Road" = 88 Hollis Rd) still puts the bill on it', live.IV_ADDR);
ok(!pidOf('IV_CUST1'), 'INVLINK (owner 11/19): the customer\'s name alone is a suggestion, never a link — even when it has ONE job', live.IV_CUST1);
ok(/address 88 Hollis/.test((live.IV_ADDR || {}).why) || /PO K101/.test((live.IV_K101 || {}).why), 'an automatic link by the job finder says why (autoLinkWhy)', [live.IV_K101, live.IV_ADDR]);
const jobIds = new Set(PROJECTS.map(p => p.id));
ok(Object.values(live).every(v => !v.pid || jobIds.has(v.pid)), 'nothing is attached to a job that is not there', live);
/* the cloud copy agrees (the finders saved) */
await sleep(3000);
const cl = (cget('invs') || []).filter(x => x && /^IV_/.test(x.id)), cpid = id => ((cl.find(x => x.id === id) || {}).pid || '');
ok(cl.length === INVS.length && cpid('IV_1120') !== 'PJ_OFF' && !cpid('IV_1102') && !cpid('IV_V221'), 'the cloud has no wrong job on them either', cl.map(x => x.id + '→' + (x.pid || '-')));
/* the pure checks behind it */
const pure = await A.ev(() => { const J = window._crm.projects; const f = (inv) => { const p = window._gcJobForInvoice(inv, J); return p ? p.id : ''; };
  return { office: f({ desc: 'Front office repairs', client: 'Someone Else LLC' }), givenTypo: f({ desc: 'reroof 4964 Givens Avenue' }), poDup: f({ po: 'v221' }), poOne: f({ po: 'PO# K-101' }), clientMismatch: f({ client: 'Another Demo Customer', desc: 'Hollis Demo Duplex' }), lostAddr: f({ desc: '12 Lostwood Lane' }),
    orphans: window._gcOrphanPOs().map(o => o.po), subRoute: (function(){ const m = window._gcMatchSubInvoice({ type: 'sub', sub: 'X', desc: 'Evan Sample gutters 8901 Clair Douwie Cove' }); return { pid: m.pid || '', certain: !!m.jobCertain, guess: m.jobGuess || '', amb: !!m.jobAmbiguous }; })(),
    subOne: (function(){ const m = window._gcMatchSubInvoice({ type: 'sub', sub: 'X', desc: 'labor', po: 'K101' }); return m.pid || ''; })() }; });
ok(pure.office === '' && pure.poDup === '' && pure.lostAddr === '', '_gcJobForInvoice: "office" in the text, a PO on 3 jobs, a lost job\'s address → no job', pure);
ok(pure.givenTypo === 'PJ_GF' && pure.poOne === 'PJ_ONE' && pure.clientMismatch === 'PJ_ONE', '_gcJobForInvoice: the address with "Avenue", "PO# K-101", the full job name on an invoice to another customer → the one job', pure);
ok(pure.orphans.indexOf('V221') < 0, 'a PO that 3 jobs carry is not reported as "PO with no job"', pure.orphans);
ok(!pure.subRoute.certain && !pure.subRoute.pid, 'the sub-invoice router: two jobs at one address → not certain, no job (a guess for the office at most)', pure.subRoute);
ok(pure.subOne === 'PJ_ONE', 'the sub-invoice router: the PO of one job is still certain', pure.subOne);

/* B. ➕ New project from the invoice (patch NEWPROJ) */
async function openFor(arg){ await A.ev(a => { window.__npRes = 'pending'; window._gcNewProjectFor(a).then(r => { window.__npRes = r ? { id: r.project && r.project.id, existing: !!r.existing, address: r.project && r.project.address, type: r.project && r.project.type, co: r.project && r.project.companyId } : null; }); }, arg); await waitFor(A, () => !!document.getElementById('gc-np-ov'), null, 5000); await sleep(400); }
const dupIds = () => A.ev(() => [...document.querySelectorAll('#gc-np-ov [data-np-use]')].map(b => b.getAttribute('data-np-use')));
const setF = (k, v) => A.ev(([k, v]) => { const el = document.querySelector('#gc-np-ov [data-np="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);
const val = k => A.ev(k => { const el = document.querySelector('#gc-np-ov [data-np="' + k + '"]'); return el ? el.value : null; }, k);
const closeForm = () => A.ev(() => { const b = document.querySelector('#gc-np-ov [data-np="x"]'); if (b) b.click(); });

await openFor({ id: 'IV_GIV', type: 'sub', sub: 'Central Demo Roofing', desc: 'QuickBooks bill #0128', amt: 1623, invNum: '0128', source: 'quickbooks' });
await setF('name', '4964 Given Ave'); await setF('addr', '4964 Given Ave'); await sleep(700);
let d = await dupIds();
ok(d[0] === 'PJ_GF', '"Did you mean …?" finds the job at 4964 GivenS Ave when "4964 Given Ave" is typed', d);
await A.ev(() => document.querySelector('#gc-np-ov [data-np-use="PJ_GF"]').click()); await sleep(300);
ok((await A.ev(() => window.__npRes)).id === 'PJ_GF' && (await A.ev(() => window.__npRes)).existing, '"Use this job" gives the existing job — no new one', await A.ev(() => window.__npRes));

await openFor({ id: 'IV_MEMO', type: 'sub', sub: 'Central Demo Roofing', desc: 'QuickBooks bill #0129 — tarp. address job 4964 Givens Ave', amt: 400, invNum: '0129', source: 'quickbooks' });
d = await dupIds();
ok(d.indexOf('PJ_GF') === 0, 'the address written in the bill\'s memo finds the job before anything is typed', d);
const types = await A.ev(() => [...document.querySelectorAll('#gc-np-ov [data-np="type"] option')].map(o => o.value));
ok(types.indexOf('Insurance Claim') > -1 && types.indexOf('Mitigation') > -1 && types.indexOf('Insurance') < 0, 'the Type list is the CRM\'s own types (Insurance Claim, Mitigation …)', types);
await setF('co', 'mitigation'); await sleep(150);
ok(await val('type') === 'Mitigation', 'picking the Mitigation company makes the type Mitigation', await val('type'));
await closeForm(); await sleep(300);

/* a QuickBooks customer that already has jobs: its billing address is not the new job's site */
await openFor({ id: 'IV_1302', type: 'sub', sub: 'CH Demo Plumbing', desc: 'QuickBooks bill #1302 — Enterprise ADA remodel 2681 Mount Moriah', amt: 4378.09, invNum: '1302', source: 'quickbooks' });
await setF('cust', 'Enterprise'); await setF('name', 'Enterprise Mount Moriah ADA'); await setF('addr', ''); await setF('em', 'ap@enterprise.example'); await sleep(500);
for (let i = 0; i < 3 && (await A.ev(() => window.__npRes)) === 'pending'; i++) { await A.ev(() => { const b = document.querySelector('#gc-np-ov [data-np="ok"]'); if (b) b.click(); }); await sleep(900); }
const made = await A.ev(() => window.__npRes);
ok(made && made.id && !made.existing && !made.address, 'a new Enterprise job does not get the customer\'s billing address (another site) when no address is typed', made);
ok(made && made.type === 'Commercial Reno', 'a business customer → type Commercial Reno by default', made);

/* 🔗 QuickBooks ↔ CRM → ➕ New project: the form knows the record */
await A.ev(() => { window.__npArgs = []; const f = window._gcNewProjectFor; window._gcNewProjectFor = function(a, cb){ window.__npArgs.push(a); return Promise.resolve(null); }; window.__npOrig = f; });
await A.ev(() => window._gcQbCheck.open());
await waitFor(A, () => document.querySelectorAll('#_gcQbCheckOv tr[data-i]').length > 0, null, 15000);
await A.ev(() => { const tr = [...document.querySelectorAll('#_gcQbCheckOv tr[data-i]')].find(t => /1302/.test(t.textContent)); const inp = tr && tr.querySelector('[data-job]'); if (!inp) return; inp.value = '➕ New project…'; inp.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(400);
const npa = await A.ev(() => window.__npArgs[0] || null);
ok(npa && npa.id === 'IV_1302' && npa.vendor === 'CH Demo Plumbing' && /Mount Moriah/.test(npa.memo || '') && npa.kind === 'sub', '🔗 QuickBooks ↔ CRM hands ➕ New project the record (id, kind, vendor, memo)', npa);
await A.ev(() => { window._gcNewProjectFor = window.__npOrig; const o = document.getElementById('_gcQbCheckOv'); if (o) o.remove(); });

ok(!A.errs.filter(e => /INVMATCH|_gcJobMatchesForInvoice|_gcJobForInvoice|_gcProjectsForPO|typeFor|addrNear|custHasJobs/.test(e)).length, 'no page errors from the changed code', A.errs.slice(0, 8));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await A.close(); process.exit(fail ? 1 : 0);
