// test_ZIPSCHED.mjs <build-dir> — patch ZIPSCHED (owner 11/25): "when I send mass zips … if you read a schedule or tentative schedule
// make sure to put those into the schedule".
//   · a ZIP with "123 Demo St/Tentative Schedule.xlsx" (3 rows), "PO K791/Construction Schedule.csv" (3 rows), "PO K791/3 Week Look
//     Ahead.pdf" (2 rows, PDF text) and "misc/Project Schedule.csv" (no job → needs a job);
//   · preview: "📅 N schedule items found", Tentative ON for the tentative file only, a row can be unticked;
//   · Import: the rows land on the right job's Schedule (title, date, endDateSch, scope/tentative, source zip-import, zipBatch, fromFile),
//     the unticked row does not; the counts are in the gc_zip_import log; they reach the cloud schedule;
//   · the needs-a-job file's rows go on the job the admin picks in 📥 Place; a re-import adds nothing;
//   · the text reader on a cell-per-line (MS Project / P6) layout; no page errors, no dialogs.
// Usage: node test_ZIPSCHED.mjs <dir with index.html>  (GC_HARNESS, GC_JSZIP = jszip 3.10.1 dist, GC_XLSX = xlsx 0.18.5 dist/xlsx.full.min.js)
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SP = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const JSZIP_FILE = process.env.GC_JSZIP || SP + '/jsz/package/dist/jszip.min.js';
const XLSX_FILE = process.env.GC_XLSX || SP + '/xlsxp/package/dist/xlsx.full.min.js';
const H = await import(pathToFileURL(HARNESS).href);
const JSZip = require(JSZIP_FILE), XLSX = require(XLSX_FILE);
const build = process.argv[2];
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const NICK = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === 'Nick Gray');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true }]);
const P = (id, name, client, address, po, extra) => Object.assign({ id, name, client, address, po, pm: 'Nick Gray', status: 'Active', updatedAt: ago(1) }, extra || {});
H.cset('projects', [
  P('P1', 'Kitchen - Maple', 'Sample Homeowner A', '123 Demo St, Memphis, TN', 'H138'),
  P('P2', 'Roof - Sample', 'Sample Homeowner B', '202 Demo Ave, Memphis, TN', '', { autoPO: 'K791' }),
  P('HS1', 'Head Start - Center 1', 'Head Start', '456 Oak Ave, Memphis, TN', 'H201'),
  P('HS2', 'Head Start - Center 2', 'Head Start', '12 Elm Rd, Memphis, TN', 'H202')]);
H.cset('projectDocs', []); H.cset('schedule', [{ id: 'S0', pid: 'P2', title: 'Existing item', date: '2026-02-02', type: 'work', scope: 'company' }]); H.cset('leads', []);

function pdfLines(lines){
  const st = 'BT /F1 10 Tf 14 TL 72 740 Td ' + lines.map(l => '(' + l + ') Tj 0 -14 Td').join(' ') + ' ET';
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + st.length + '>>\nstream\n' + st + '\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Kitchen - Maple tentative schedule'], [], ['Task', 'Start', 'Finish', 'Sub'],
  ['Demo kitchen', '3/2/2026', '3/4/2026', 'Sample Demo Co'], ['Rough plumbing', '3/5/2026', '3/9/2026', 'Sample Plumbing'], ['Cabinets install', '3/16/2026', '3/18/2026', '']]), 'Schedule');
const XBUF = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const z = new JSZip();
z.file('123 Demo St/Tentative Schedule.xlsx', XBUF);
z.file('PO K791/Construction Schedule.csv', 'Activity,Start Date,End Date,Duration,Trade\nTear off,2026-04-06,2026-04-07,2,Roofing\n"Dry-in, underlayment",2026-04-08,2026-04-08,1,Roofing\nShingles,2026-04-09,2026-04-14,4,Roofing\n');
z.file('PO K791/3 Week Look Ahead.pdf', pdfLines(['3 Week Look Ahead', 'Printed 3/30/2026', 'ID Task Name Duration Start Finish', '1 Gutter install 2 days Mon 4/20/26 Tue 4/21/26', '2 Final clean up 1 day Wed 4/22/26 Wed 4/22/26']));
z.file('misc/Project Schedule.csv', 'Task,Start,Finish\nSite walk,5/4/2026,5/4/2026\nPunch list,5/11/2026,5/13/2026\n');
z.file('123 Demo St/contract.pdf', pdfLines(['Contract']));
const ZIPBUF = await z.generateAsync({ type: 'nodebuffer' });

const OPEN = [];
try {
  const a = await H.computer('nick', { build }); OPEN.push(a);
  const ACAO = { 'access-control-allow-origin': '*' };
  await a.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.1\/jszip\.min\.js/, r => r.fulfill({ path: JSZIP_FILE, contentType: 'application/javascript', headers: ACAO }));
  await a.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/0\.18\.5\/xlsx\.full\.min\.js/, r => r.fulfill({ path: XLSX_FILE, contentType: 'application/javascript', headers: ACAO }));
  await H.signIn(a, NICK, 9000);
  await H.waitFor(a, () => (window._crm && window._crm.projects || []).length >= 4 && !!window._gcZipImport && typeof window._setSchedule === 'function', null, 45000);
  await sleep(1500);
  const sched = () => a.ev(async () => (await window.idbGet('schedule')) || []);
  const waitCloud = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { try { if (fn()) return true; } catch (e) {} await sleep(400); } return false; };
  const load = async () => {
    await a.ev(() => window._gcZipImport.open());
    await a.page().setInputFiles('#gczi-ov [data-zi-in="files"]', { name: 'jobs.zip', mimeType: 'application/zip', buffer: ZIPBUF });
    return H.waitFor(a, () => { const s = window._gcZipImport.state(); return s && s.rows.length && !document.querySelector('#gczi-ov [data-zi="msg"]').textContent ? s : null; }, null, 30000);
  };
  const importNow = async () => { await a.ev(() => document.querySelector('#gczi-ov [data-zi="go"]').click()); return H.waitFor(a, () => window._gcZipImport.state().done ? document.querySelector('#gczi-ov .sum').innerText : null, null, 60000); };
  const untick = async (file, title) => {
    const id = await a.ev(([f, t]) => { const S = window._gcZipImport.state(); const i = S.rows.findIndex(r => r.name === f); const j = S.rows[i].sched.items.findIndex(x => x.t === t); return 'r' + i + ':' + j; }, [file, title]);
    await a.ev(id => { const d = document.querySelector('[data-zs-it="' + id + '"]').closest('details'); d.open = true; }, id);
    await a.page().locator('[data-zs-it="' + id + '"]').uncheck();
    await sleep(200);
  };

  /* unit: text readers */
  const u = await a.ev(() => ({
    cells: window._gcZipImport.schedFromText('Activity Name\nOriginal Duration\nStart\nFinish\nSite prep\n5d\n05-Jan-26\n09-Jan-26\nFoundations\n10d\n12-Jan-26\n23-Jan-26\nPage 1 of 1'),
    none: window._gcZipImport.schedFromText('Meeting notes\nWe talked on 1/5/2026 about the job.'),
    dates: ['Mon 4/20/26', 'March 3, 2026', '5-Jan-26', '2026-01-05', '13/40/2026'].map(window._gcZipImport.ymd) }));
  ok(u.cells.length === 2 && u.cells[0].t === 'Site prep' && u.cells[0].s === '2026-01-05' && u.cells[0].e === '2026-01-09' && u.cells[1].e === '2026-01-23', 'PDF text, cell per line (P6 / MS Project layout): activity + start + finish', u.cells);
  ok(u.none.length === 0, 'text with one stray date is not read as a schedule', u.none);
  ok(JSON.stringify(u.dates) === JSON.stringify(['2026-04-20', '2026-03-03', '2026-01-05', '2026-01-05', '']), 'date formats', u.dates);

  const S = await load();
  const R = n => S.rows.find(r => r.name === n) || {};
  console.log('    found: ' + S.rows.filter(r => r.sched).map(r => r.name + ' ' + r.sched.n + (r.sched.tent ? ' tentative' : '')).join(' · '));
  ok(R('Tentative Schedule.xlsx').sched && R('Tentative Schedule.xlsx').sched.n === 3 && R('Tentative Schedule.xlsx').sched.tent === true && R('Tentative Schedule.xlsx').pid === 'P1', 'Tentative Schedule.xlsx: 3 items, Tentative ON, job 123 Demo St', R('Tentative Schedule.xlsx'));
  ok(R('Construction Schedule.csv').sched && R('Construction Schedule.csv').sched.n === 3 && R('Construction Schedule.csv').sched.tent === false && R('Construction Schedule.csv').pid === 'P2', 'Construction Schedule.csv: 3 items, Tentative OFF, job K791', R('Construction Schedule.csv').sched);
  ok(R('Construction Schedule.csv').sched.items[1].t === 'Dry-in, underlayment', 'CSV: a quoted comma stays in the title');
  ok(R('3 Week Look Ahead.pdf').sched && R('3 Week Look Ahead.pdf').sched.n === 2 && R('3 Week Look Ahead.pdf').sched.items[0].t === 'Gutter install' && R('3 Week Look Ahead.pdf').sched.items[0].e === '2026-04-21', '3 Week Look Ahead.pdf: 2 items from the PDF text (the "Printed" line left out)', R('3 Week Look Ahead.pdf').sched);
  ok(R('Project Schedule.csv').sched && R('Project Schedule.csv').pid === '', 'misc/Project Schedule.csv: 2 items, the file needs a job', R('Project Schedule.csv'));
  ok(!R('contract.pdf').sched, 'a contract is not read as a schedule');
  const ui = await a.ev(() => [...document.querySelectorAll('#gczi-ov .sch')].map(x => x.innerText.split('\n')[0]));
  ok(ui.some(t => /3 schedule items found → add to Kitchen - Maple’s Schedule/.test(t)) && ui.some(t => /the job the office picks/.test(t)), 'preview: "📅 3 schedule items found → add to Kitchen - Maple’s Schedule"', ui);
  await untick('Construction Schedule.csv', 'Shingles');
  const S1 = await a.ev(() => window._gcZipImport.state().rows.find(r => r.name === 'Construction Schedule.csv').sched.items.map(x => x.on));
  ok(JSON.stringify(S1) === '[true,true,false]', 'a row can be unticked', S1);

  const e0 = a.errs.length, n0 = (await sched()).length;
  const sum = await importNow();
  console.log('    ' + String(sum).replace(/\n/g, ' | '));
  ok(/📅 7 schedule items added to 2 job schedules/.test(sum), 'summary: 7 schedule items added to 2 job schedules', sum);
  const L = await sched(), mine = L.filter(x => x.source === 'zip-import');
  ok(L.length === n0 + 7 && mine.length === 7, '7 rows on the Schedule list', { n0, n: L.length });
  const p1 = mine.filter(x => x.pid === 'P1'), p2 = mine.filter(x => x.pid === 'P2');
  ok(p1.length === 3 && p1.every(x => x.scope === 'tentative' && x.tentative === true && x.fromFile === 'Tentative Schedule.xlsx' && x.zipBatch && x.type === 'work'), 'P1: 3 tentative rows (scope tentative → the 📋 Tentative tab), fromFile, zipBatch', p1);
  const demo = p1.find(x => x.title === 'Demo kitchen') || {};
  ok(demo.date === '2026-03-02' && demo.endDateSch === '2026-03-04' && demo.assignee === 'Sample Demo Co' && demo.address === '123 Demo St, Memphis, TN', 'a row: date, endDateSch, assignee (Sub column), job address', demo);
  ok(p2.length === 4 && p2.every(x => x.scope === 'company' && x.tentative === false) && !p2.some(x => x.title === 'Shingles') && p2.some(x => x.title === 'Gutter install' && x.endDateSch === '2026-04-21'), 'P2: 2 CSV rows (Shingles unticked) + 2 PDF rows, not tentative', p2.map(x => x.title));
  ok(L.some(x => x.id === 'S0'), 'the existing schedule item is kept');
  ok(await waitCloud(() => (H.cget('schedule') || []).filter(x => x.source === 'zip-import').length === 7, 40000), 'the rows reached the cloud schedule');
  await waitCloud(() => (H.cget('gc_zip_import') || []).length === 1, 10000);
  const LOG = (H.cget('gc_zip_import') || [])[0] || {};
  ok(LOG.counts && LOG.counts.schedAdded === 7 && LOG.counts.schedFound === 10 && LOG.counts.schedJobs === 2, 'log: schedFound 10, schedAdded 7, schedJobs 2', LOG.counts);
  const wf = (LOG.files || []).find(f => f.name === 'Project Schedule.csv') || {};
  ok(wf.queued && wf.sched && wf.sched.items.length === 2, 'the needs-a-job file carries its 2 rows', wf.sched);

  /* the needs-a-job file → 📥 Place on HS1: its rows go on HS1's Schedule */
  await a.ev(() => { document.getElementById('gczi-ov').remove(); window._gcZipImport.openPlace(window._gcZipImport.items()[0].b.id); });
  const pr = await H.waitFor(a, () => { const r = [...document.querySelectorAll('#gczi-place [data-zp]')].find(x => /Project Schedule/.test(x.textContent)); return r ? { id: r.getAttribute('data-zp'), t: r.innerText } : null; }, null, 8000);
  ok(pr && /2 schedule items go on the job’s Schedule/.test(pr.t), 'the 📥 Place card says the schedule goes along', pr);
  await a.page().selectOption('#gczi-place [data-zp-job="' + pr.id + '"]', 'HS1');
  await a.ev(id => document.querySelector('#gczi-place [data-zp-go="' + id + '"]').click(), pr.id);
  await H.waitFor(a, () => !document.querySelector('#gczi-place [data-zp]'), null, 8000);
  const hs = (await sched()).filter(x => x.pid === 'HS1');
  ok(hs.length === 2 && hs.every(x => x.source === 'zip-import' && x.fromFile === 'Project Schedule.csv' && x.tentative === false) && hs.some(x => x.title === 'Punch list' && x.endDateSch === '2026-05-13'), 'placed on HS1 → its 2 rows on HS1’s Schedule', hs);

  /* re-import the same ZIP (Shingles unticked again): nothing new */
  await a.ev(() => document.getElementById('gczi-place').remove());
  const n1 = (await sched()).length;
  await load(); await untick('Construction Schedule.csv', 'Shingles');
  const sum2 = await importNow();
  const n2 = (await sched()).length;
  ok(n2 === n1 && /📅 0 schedule items added/.test(sum2), 're-import: no schedule row added twice', { n1, n2, sum2 });
  ok(a.errs.length === e0 && a.errs.length === 0, 'no page errors', a.errs.slice(0, 3));
  ok(a.dialogs.length === 0, 'no alert / confirm / prompt', a.dialogs);
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of OPEN) await x.close().catch(() => {});
console.log(`ZIPSCHED ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
