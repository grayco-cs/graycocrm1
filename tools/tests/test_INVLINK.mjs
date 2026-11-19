// test_INVLINK.mjs <build-dir> — patch INVLINK in the WHOLE CRM (offline harness_N: stubbed Supabase), signed in as the office, made-up
// rows shaped like the live ones (owner 11/19: "this is Cat Country Boardwalk but says ROTC", "double and not real", "view", sub / supplier):
//   1. the background finders run on their own for a while: the A & B-style invoice with only the customer's name gets NO job, a
//      person's link is not moved, nothing new lands on ROTC;
//   2. ▥ Invoices: the PO cell never says "view"; three tabs Client · Sub · Supplier with counts; the Supplier tab lists the paint
//      store and asks "is this a sub?" for an unclear payee; a bill's Assign… list starts with ★ Job? guesses;
//   3. 🔗 Check invoice ↔ job links: #1131 (Cat Country Boardwalk) is listed as a wrong job with the boardwalk job suggested;
//      ✓ Accept moves it (pidManual, linkLog, the cloud copy) and it leaves the list; a 2nd finder pass leaves it there;
//   4. QuickBooks-only cleanup: the preview, Apply (archives the CRM draws on the past job, merges the copy of a QB invoice, EAH → EAN),
//      the client list and A/R drop them, ↩ Undo puts every field back;
//   5. the % slider on a past job drafts no draw invoice.
// Made-up data only. Run: flock <scratchpad>/locks/browser.lock node tools/tests/test_INVLINK.mjs <abs build dir>
import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, waitFor, resetCloud, cset, cget } = H;
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

const P = (id, o) => Object.assign({ id, type: 'Commercial Reno', status: 'completed', jobYear: 2026, contract: 0, created: '2026-03-02', createdAt: '2026-03-02T12:00:00.000Z', pm: 'Demo PM', subs: [], photos: [], checklist: [], followUps: [], customerNotes: '', address: '' }, o);
const PROJECTS = [
  P('PJ_ROTC', { name: 'ROTC Demo Course', client: 'A & Z Demo Builders, Inc.', autoPO: 'T724', status: 'active', created: '2026-10-20', createdAt: '2026-10-20T12:00:00.000Z', address: 'Somerville TN', contract: 60000, pct: 10 }),
  P('PJ_BW', { name: 'Zoo Boardwalk Redecking', client: 'A & Z Demo Builders, Inc.', autoPO: 'U807', contract: 119045, pct: 100 }),
  P('PJ_CEIL', { name: 'Somerville ceilings', client: 'A & Z Demo Builders, Inc.', autoPO: 'H393', contract: 50980, address: 'Somerville TN', qbInvoiceNums: ['1078'] }),
  P('PJ_BATH', { name: 'EAN- Bathroom remodel Mt Moriah', client: 'EAN Demo Holdings', autoPO: 'O229', contract: 15178.59, address: '2675 Mt Moriah' }),
  P('PJ_COLL', { name: 'Collierville New Build', client: 'EAH Demo Holdings', autoPO: 'A808', status: 'bidding', contract: 2500000 }),
  P('PJ_LOCH', { name: 'Eaves Demo — 4071 Loch Meade Dr Renovation', client: 'Eaves Demo Construction', autoPO: 'M291', contract: 41720.11, address: '4071 Loch Meade Dr' })];
const Q = (id, num, o) => Object.assign({ id, type: 'client', source: 'quickbooks', by: 'QuickBooks import', qbKey: 'QB:invoice:' + num + ':demo', qbNum: num, invNum: num, importedHistory: true, noSend: true, sent: 'recorded', noReminders: true, noAutoReminders: true, remindersPaused: true, status: 'paid', paid: true, date: '2026-10-12', dueDate: '2026-11-11', savedAt: '2026-11-05T16:47:44.435Z', updatedAt: '2026-11-13T15:57:07.722Z' }, o);
const INVS = [
  Q('IV_1131', '1131', { client: 'A & Z Demo Builders, Inc.', amt: 128045, desc: 'QuickBooks invoice #1131 — Cat Country Boardwalk replacement\n-added handrails and footrails-$44,500.00', pid: 'PJ_ROTC', po: 'T724', autoLinked: true, status: 'overdue', paid: undefined, openBalance: 19104.5 }),
  Q('IV_1078', '1078', { client: 'A & Z Demo Builders, Inc.', amt: 48180, desc: 'PO# 6160-12', pid: 'PJ_CEIL', date: '2026-06-30' }),
  Q('IV_CUST', '1141', { client: 'A & Z Demo Builders, Inc.', amt: 777, desc: 'QuickBooks invoice #1141 — misc', pid: '', qbNeedsHome: true, status: 'overdue', paid: undefined }),
  Q('IV_1125', '1125', { client: 'Misty Demo', amt: 2750, desc: 'QuickBooks invoice #1125 — Installing new fence', pid: '', status: 'overdue', paid: undefined }),
  Q('IV_1106', '1106', { client: 'EAH Demo Holdings', amt: 15178.59, desc: 'QuickBooks invoice #1106 — Upgraded ADA bathroom at 2675 Mt. Moriah store', pid: 'PJ_COLL', po: 'A808', linkedBy: "QuickBooks history import (the customer's only job)" }),
  Q('IV_MAN', '1140', { client: 'A & Z Demo Builders, Inc.', amt: 999, desc: 'QuickBooks invoice #1140 — Cat Country Boardwalk misc', pid: 'PJ_CEIL', pidManual: true, linkedBy: 'Office Demo (invoice re-check)' }),
  { id: 'IV_BW1', type: 'client', pid: 'PJ_BW', po: 'U807', client: 'A & Z Demo Builders, Inc.', amt: 29761.25, date: '2026-08-17', dueDate: '2026-09-16', sentDate: '2026-08-17', status: 'overdue', drawType: 'Draw to 25%', createdBy: 'auto-draw', desc: 'Draw to 25% at 30% complete — Zoo Boardwalk Redecking', savedAt: '2026-08-17T12:00:00.000Z', updatedAt: '2026-08-17T12:00:00.000Z' },
  { id: 'IV_BW2', type: 'client', pid: 'PJ_BW', po: 'U807', client: 'A & Z Demo Builders, Inc.', amt: 29761.25, date: '2026-09-11', dueDate: '2026-10-11', sentDate: '2026-09-11', status: 'overdue', drawType: 'progress', _autoDrafted: true, by: 'Auto (progress billing)', desc: 'Progress billing - Draw #1 (25%) - Zoo Boardwalk Redecking', savedAt: '2026-09-11T12:00:00.000Z', updatedAt: '2026-09-11T12:00:00.000Z' },
  { id: 'IV_BATHC', type: 'client', pid: 'PJ_BATH', po: 'O229', client: 'EAN Demo Holdings', amt: 15178.59, date: '2026-07-29', dueDate: '2026-08-28', sentDate: '2026-07-29', status: 'overdue', drawType: 'Final (100%)', desc: 'Final invoice — EAN- Bathroom remodel Mt Moriah', savedAt: '2026-07-29T12:00:00.000Z', updatedAt: '2026-07-29T12:00:00.000Z' },
  { id: 'IV_PAINT', type: 'sub', sub: 'Farrell Calhoun Demo Inc', amt: 93.11, desc: 'QuickBooks bill #012128755', recvDate: '2026-10-15', date: '2026-10-15', status: 'received', pid: '', source: 'quickbooks', qbKey: 'QB:bill:012128755:f' },
  { id: 'IV_PLUMB', type: 'sub', sub: 'Demo Plumbing', amt: 2160, desc: 'QuickBooks bill #1303', recvDate: '2026-08-03', date: '2026-08-03', status: 'received', pid: '', source: 'quickbooks', qbKey: 'QB:bill:1303:d' },
  { id: 'IV_WEST', type: 'sub', sub: 'Westdemo', amt: 36.83, desc: 'QuickBooks bill', recvDate: '2026-09-09', date: '2026-09-09', status: 'received', pid: '', source: 'quickbooks', qbKey: 'QB:bill:x:w' },
  { id: 'IV_INSUL', type: 'sub', sub: 'Demo Insul Crew', amt: 875, desc: 'QuickBooks bill #222 — Batt Insulation at 4071 Loche Meade Dr. Lakeland Tn.', recvDate: '2026-05-01', date: '2026-05-01', status: 'received', pid: '', noAutoLink: true, source: 'quickbooks', qbKey: 'QB:bill:222:i' }];
const SUBS = [{ id: 'S1', name: 'Demo Plumbing', isSub: true, trade: 'Plumbing', w9: true, coi: true, phone: '' }, { id: 'S2', name: 'Farrell Calhoun Demo Inc', isSub: true, phone: '' }, { id: 'S3', name: 'Westdemo', isSub: true, phone: '' }, { id: 'S4', name: 'Demo Insul Crew', isSub: true, phone: '' }];
const CUSTOMERS = [{ id: 'CU_EAN', name: 'EAN Demo Holdings', source: 'QuickBooks' }, { id: 'CU_EAH', name: 'EAH Demo Holdings', source: 'QuickBooks' }, { id: 'CU_AZ', name: 'A & Z Demo Builders, Inc.' }];
const USERS = [{ id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }];

resetCloud();
cset('projects', PROJECTS); cset('invs', INVS); cset('customers', CUSTOMERS); cset('users', USERS); cset('subs', SUBS); cset('vendors', SUBS); cset('expenses', []); cset('leads', []);
cset('gc_automation_pause', { on: true, at: '2026-11-04T12:00:00.000Z', by: 'owner' });

const A = await computer('office', { build, init: ["window.__GC_TEST_ALIAS__=1"] });
ok(await signIn(A, 'office@grayco-cs.com', 30000), 'the office is signed in to the CRM');
ok(await waitFor(A, n => (window._crm && (window._crm.projects || []).length >= n) || null, PROJECTS.length, 90000), 'the CRM loaded the jobs');
ok(await waitFor(A, () => !!(window._gcInvLink && window._gcInvLink.open && window._gcInvPoCell), null, 30000), 'patch INVLINK is loaded');
/* the made-up "EAH" = "EAN" (the real alias is EAH Holdings → EAN Holdings) */
await A.ev(() => { window._gcInvLink.core.ALIAS['eah demo holdings'] = 'ean demo holdings'; });

/* 1. the finders run on their own */
await sleep(16000);
await A.ev(async () => { try { await window._gcAssignByPO(); } catch (e) {} try { await window._gcLinkSubInvoices(true); } catch (e) {} try { window._gcAutoRouteSubInvoices(); } catch (e) {} try { await window._gcQbHistLink.run(); } catch (e) {} });
await sleep(2500);
const liv = () => A.ev(() => { const l = (window._crm && (window._crm.invs && window._crm.invs.length ? window._crm.invs : window._crm.invoices)) || []; const o = {}; l.forEach(x => { if (x && /^IV_/.test(x.id)) o[x.id] = { pid: x.pid || '', type: x.type, pidManual: !!x.pidManual, dup: x._dupOf || '', client: x.client, linkLog: (x.linkLog || []).length }; }); return o; });
let L = await liv();
ok(!L.IV_CUST.pid, 'A & B case: an invoice with only the customer\'s name gets NO job by itself (it has 3 jobs; before, the first one)', L.IV_CUST);
ok(L.IV_MAN.pid === 'PJ_CEIL' && L.IV_MAN.pidManual, 'manual-link-kept: a person\'s link is not moved by any finder (even though its text says "Boardwalk")', L.IV_MAN);
ok(L.IV_1131.pid === 'PJ_ROTC', 'nothing is moved by itself without sure evidence (#1131 waits for the office)', L.IV_1131);
ok(!L.IV_INSUL.pid, 'a bill a person left with no job (noAutoLink) stays with no job', L.IV_INSUL);

/* 2. ▥ Invoices */
await A.ev(() => window._setView('invoices')); await sleep(3000);
const tabsTxt = await A.ev(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /^(Client|Sub|Supplier) Invoices \(\d+\)$/.test(t)));
ok(tabsTxt.length === 3 && /^Supplier Invoices \(\d+\)$/.test(tabsTxt[2]), 'three tabs: Client · Sub · Supplier', tabsTxt);
const nSup = +((tabsTxt[2] || '').match(/\((\d+)\)/) || [])[1], nSub = +((tabsTxt[1] || '').match(/\((\d+)\)/) || [])[1];
ok(nSub === 2 && nSup === 2, 'the counts: subs = the plumber + the insulation crew (2); suppliers = the paint store + the unclear payee (2)', tabsTxt);
await A.ev(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Client Invoices/.test(x.textContent.trim())); b && b.click(); }); await sleep(1500);
const poCells = await A.ev(() => Array.from(document.querySelectorAll('td a[title="Open invoice document"]')).map(a => a.textContent.replace('📄', '').trim()));
ok(poCells.length >= 6 && !poCells.some(t => /^view$/i.test(t)), 'the PO column never says "view"', poCells);
ok(poCells.includes('—'), 'an invoice with no job and no PO shows "—"', poCells);
ok(await A.ev(() => !!document.getElementById('gc-il-btn')), 'the office sees 🔗 Check invoice ↔ job links on ▥ Invoices', await A.ev(() => (document.getElementById('gc-il-btn') || {}).textContent));
await A.ev(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Supplier Invoices/.test(x.textContent.trim())); b && b.click(); }); await sleep(2500);
const supTxt = await A.ev(() => { const t = Array.from(document.querySelectorAll('table')).find(x => /ON TIME/i.test(x.textContent) || /SUB/.test((x.tHead || {}).textContent || '')); return t ? t.textContent : document.body.innerText.slice(0, 3000); });
ok(/Farrell Calhoun Demo/.test(supTxt) && !/Demo Plumbing/.test(supTxt), 'the Supplier tab lists the paint store, not the plumber', supTxt.slice(0, 400));
ok(await A.ev(() => /Westdemo/.test((document.getElementById('gc-il-unclear') || {}).textContent || '')), '"Is this a sub?" asks about the unclear payee');
await A.ev(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Sub Invoices/.test(x.textContent.trim())); b && b.click(); }); await sleep(2000);
const opts = await A.ev(() => Array.from(document.querySelectorAll('select')).map(s => Array.from(s.options).slice(0, 3).map(o => o.textContent)).filter(o => o[0] === 'Assign...'));
ok(opts.length >= 1, 'the Sub tab has bills with Assign…', opts);

/* 3. the review screen */
await A.ev(() => document.getElementById('gc-il-btn').click()); await sleep(800);
const rowTxt = await A.ev(() => { const r = document.querySelector('#gc-il [data-il-row="IV_1131"]'); return r ? r.textContent : ''; });
ok(/Wrong job/.test(rowTxt) && /Zoo Boardwalk/.test(rowTxt) && /ROTC/.test(rowTxt), '#1131 is listed: now ROTC, wrong job, Zoo Boardwalk suggested with the evidence', rowTxt.slice(0, 300));
ok(await A.ev(() => /Only the customer name|Needs a job/.test((document.querySelector('#gc-il [data-il-row="IV_CUST"]') || {}).textContent || '')), 'the customer-only invoice is listed for a person');
ok(await A.ev(() => !document.querySelector('#gc-il [data-il-row="IV_MAN"]')), 'a person\'s link is not on the list');
await A.ev(() => document.querySelector('#gc-il [data-il-row="IV_1131"] [data-il="accept"]').click()); await sleep(2500);
L = await liv();
ok(L.IV_1131.pid === 'PJ_BW' && L.IV_1131.pidManual && L.IV_1131.linkLog === 1, '✓ Accept: #1131 is on Zoo Boardwalk, kept for good, logged', L.IV_1131);
ok(await A.ev(() => !document.querySelector('#gc-il [data-il-row="IV_1131"]')), '…and it leaves the list');
await sleep(2500);
ok(((cget('invs') || []).find(x => x.id === 'IV_1131') || {}).pid === 'PJ_BW', 'the cloud copy has the new job');
await A.ev(async () => { try { await window._gcAssignByPO(); } catch (e) {} try { await window._gcQbHistLink.run(); } catch (e) {} }); await sleep(1500);
ok((await liv()).IV_1131.pid === 'PJ_BW', 'a finder pass later leaves the person\'s choice alone');
ok(Array.isArray(cget('gc_invlink_log')) && cget('gc_invlink_log').some(e => e.kind === 'relink' && e.inv === 'IV_1131'), 'the relink is in the shared log (gc_invlink_log)', cget('gc_invlink_log'));

/* 4. QuickBooks-only cleanup */
await A.ev(() => document.querySelector('#gc-il [data-il-tab="cleanup"]').click()); await sleep(800);
const prev = await A.ev(() => document.getElementById('gc-il').textContent);
ok(/archive .*2|Archive — not in QuickBooks \(2\)/.test(prev) && /Merge into the QuickBooks invoice \(1\)/.test(prev) && /EAN Demo Holdings/.test(prev), 'the preview: 2 CRM draws archived, 1 copy merged, EAH → EAN', prev.slice(0, 600));
await A.ev(() => document.querySelector('#gc-il [data-il="apply"]').click()); await sleep(3500);
L = await liv();
ok(L.IV_BW1.type === 'archived' && L.IV_BW2.type === 'archived' && L.IV_BATHC.type === 'archived' && L.IV_BATHC.dup === 'IV_1106', 'Apply: the CRM draws are archived, the copy points at QuickBooks #1106 — nothing deleted', [L.IV_BW1, L.IV_BW2, L.IV_BATHC]);
ok(L.IV_1106.client === 'EAN Demo Holdings', 'Apply: EAH\'s invoice now says EAN', L.IV_1106);
ok(((cget('customers') || []).find(c => c.id === 'CU_EAH') || {})._mergedInto === 'CU_EAN', 'Apply: the EAH customer is archived as merged into EAN (kept)', cget('customers'));
await A.ev(() => document.querySelector('#gc-il [data-il="close"]').click());
await A.ev(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Client Invoices/.test(x.textContent.trim())); b && b.click(); }); await sleep(1500);
const clientTxt = await A.ev(() => document.body.innerText);
ok(!/Draw to 25% at 30% complete/.test(clientTxt) && !/Progress billing - Draw #1/.test(clientTxt), 'the client list no longer shows the archived draws', clientTxt.slice(0, 200));
await A.ev(() => { window._gcInvLink.open('cleanup'); }); await sleep(1200);
await A.ev(() => document.querySelector('#gc-il [data-il="undo"]').click()); await sleep(3500);
L = await liv();
ok(L.IV_BW1.type === 'client' && L.IV_BATHC.type === 'client' && !L.IV_BATHC.dup && L.IV_1106.client === 'EAH Demo Holdings', '↩ Undo: every field is back', [L.IV_BW1, L.IV_BATHC, L.IV_1106]);
await A.ev(() => window._gcInvLink.close());

/* 5. no automatic draw on a past job */
const before = (await A.ev(() => ((window._crm.invs && window._crm.invs.length ? window._crm.invs : window._crm.invoices) || []).length));
await A.ev(() => { try { window._gcSetProjectPct('PJ_ROTC', 60); } catch (e) {} }); await sleep(2500);
const after = (await A.ev(() => ((window._crm.invs && window._crm.invs.length ? window._crm.invs : window._crm.invoices) || []).length));
ok(after === before, 'the % slider on a past job (made before go-live) drafts no draw invoice', [before, after]);

ok(!A.errs.some(e => /invlink|_gcInvLink|INVLINK/i.test(e)), 'no page errors from INVLINK', A.errs.slice(0, 5));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await A.close();
process.exit(fail ? 1 : 0);
