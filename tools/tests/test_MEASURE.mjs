// test_MEASURE.mjs <build-dir> [shot-dir] — patch MEASURE (owner 11/20): the plan measure tool on bids.grayco-cs.com (phone first).
//   A. server: _lib/takeoffs.js math (LF / SF / EA / wall SF / CY, totals by name + unit), the measure ticket (signed, tamper → refused),
//      subportal.js action 'takeoffs' — a sub's own only (another sub never sees it), a job / plan they may not open → 403,
//      staff → owner 'gc' (saved to the job), a ticket → that CRM sub + job + file only, 📐 Attach my takeoff on a bid (server-made totals)
//   B. the bid site in Chromium at 390 × 844 (phone): a real 2-page PDF, preset scale 1/4"=1', Line 10 LF + wall height → 90 SF,
//      Rect 100 SF, Count 3 EA, a 📝 note pin, names + notes; saved on the server; reopened → all there; ☰ List totals; CSV; page 2
//   C. #measure=<ticket> (from portal.grayco-cs.com): the CRM plan opens with no bid-site sign-in and saves to that sub
// Offline; made-up data only.
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, STORE, putRow, rowData, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(200); } return false; };
W.install();
const F = W.fns(BUILD);
const TK = require(path.join(BUILD, 'netlify/functions/_lib/takeoffs.js'));
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* a real 2-page PDF (17" × 11" sheets) */
function pdf2(){
  const pages = ['0 0 1 rg 72 72 1080 648 re S BT /F1 36 Tf 100 700 Td (A-101 FLOOR PLAN) Tj ET', 'BT /F1 36 Tf 100 700 Td (A-102 SECOND FLOOR) Tj ET 72 72 m 1150 720 l S'];
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    '<< /Length ' + pages[0].length + ' >>\nstream\n' + pages[0] + '\nendstream', '<< /Length ' + pages[1].length + ' >>\nstream\n' + pages[1] + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
const PLAN = pdf2();

DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'a@sub.test', name: 'Alex Alpha', company: 'Alpha Drywall', trades: ['Drywall'], authUserId: 'auth-u_a' }, { user_id: 'u_a', email: 'a@sub.test' });
putRow('users', 'u_b', { id: 'u_b', role: 'sub', approved: true, email: 'b@sub.test', name: 'Bo Beta', company: 'Beta Paint', trades: ['Painting'], authUserId: 'auth-u_b' }, { user_id: 'u_b', email: 'b@sub.test' });
ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' }; ACC['a@sub.test'] = { pw: 'Sub-Pass-1', id: 'auth-u_a' }; ACC['b@sub.test'] = { pw: 'Sub-Pass-2', id: 'auth-u_b' };
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), pmId: 'st_owner', tradesSought: 'Drywall', createdAt: now }, x), { job_id: id });
job('J_PUB', { title: 'Clinic Drywall Demo', address: '1 Demo Rd', plans: [{ name: 'A-101 Floor Plan.pdf', type: 'application/pdf', size: PLAN.length, category: 'Plans' }, { name: 'Hidden Sheet.pdf', type: 'application/pdf', size: 10, category: 'Plans', subsVisible: false }] });
job('J_PRIV', { title: 'Private Fit-out Demo', visibility: 'private' });
putRow('plans', 'J_PUB', { items: [{ name: 'A-101 Floor Plan.pdf', type: 'application/pdf', fileRef: 'staff/x/a101.pdf', category: 'Plans' }, { name: 'Hidden Sheet.pdf', type: 'application/pdf', fileRef: 'staff/x/h.pdf', category: 'Plans', subsVisible: false }] }, { job_id: 'J_PUB' });
STORE.set('subportal-files/staff/x/a101.pdf', PLAN);
STORE.set('crm-files/abc123.pdf', PLAN);
const tokFor = e => { const t = 't-' + e.split('@')[0] + Math.random().toString(36).slice(2, 6); W.TOK[t] = e; return t; };
async function sp(email, body){
  const h = { origin: 'https://bids.test', 'x-nf-client-connection-ip': '10.1.' + Math.floor(Math.random() * 250) + '.1' }; if (email) h.authorization = 'Bearer ' + tokFor(email);
  const r = await F.sp.handler({ httpMethod: 'POST', headers: h, body: JSON.stringify(body) }); return { st: r.statusCode, d: JSON.parse(r.body || '{}') };
}

/* ═══ A. server ═══ */
{
  const d = TK.clean({ pages: { 1: { ppf: 18, label: '1/4"=1\'' } }, items: [
    { id: 'l1', page: 1, type: 'line', pts: [[0, 0], [180, 0]], name: 'Wall A', height: 9, note: 'north wall' },
    { id: 'l2', page: 1, type: 'line', pts: [[0, 0], [0, 90]], name: 'wall a' },
    { id: 'r1', page: 1, type: 'rect', pts: [[0, 0], [180, 180]], name: 'Slab', depth: 4 },
    { id: 'a1', page: 1, type: 'area', pts: [[0, 0], [180, 0], [0, 180]], name: 'Tri' },
    { id: 'c1', page: 1, type: 'count', pts: [[1, 1], [2, 2], [3, 3]], name: 'Outlets' },
    { id: 'n1', page: 1, type: 'note', pts: [[5, 5]], text: 'Verify ceiling height' },
    { id: 'x', page: 1, type: 'bogus', pts: [[1, 1]] }, { id: 'p2', page: 2, type: 'line', pts: [[0, 0], [100, 0]], name: 'No scale' }] }, { name: 'A.pdf' });
  const tt = TK.totals([d]), g = (n, u) => (tt.find(r => r.name === n && r.unit === u) || {}).qty;
  ok('A1 math: Wall A = 10 + 5 = 15 LF (names group case-blind), wall SF 90, Slab 100 SF + 40 LF perimeter + 1.23 CY at 4", triangle 50 SF, Outlets 3 EA; a page without a scale counts nothing; a bad type dropped',
    g('Wall A', 'LF') === 15 && g('Wall A (wall)', 'SF') === 90 && g('Slab', 'SF') === 100 && g('Slab (perimeter)', 'LF') === 40 && g('Slab', 'CY') === 1.23 && g('Tri', 'SF') === 50 && g('Outlets', 'EA') === 3 && !tt.some(r => r.name === 'No scale') && d.items.length === 7, tt);
  const t1 = TK.mint({ sub: 'SUB1', pid: 'P1', ref: 'abc123.pdf', name: 'Plans.pdf', type: 'application/pdf', job: 'Demo Job' });
  const bad = t1.slice(0, 5) + (t1[5] === 'A' ? 'B' : 'A') + t1.slice(6);
  ok('A2 measure ticket: reads back (sub, job, file); a changed character → refused; an expired one → refused', (TK.read(t1) || {}).s === 'SUB1' && TK.read(bad) === null && TK.read(TK.mint({ sub: 'S', pid: 'P', ref: 'r' }, -1000)) === null);

  const file = { name: 'A-101 Floor Plan.pdf', type: 'application/pdf' };
  const put = await sp('a@sub.test', { action: 'takeoffs', op: 'put', jobId: 'J_PUB', file, doc: { pages: { 1: { ppf: 18 } }, items: [{ id: 'm1', page: 1, type: 'line', pts: [[0, 0], [180, 0]], name: 'Wall A' }] } });
  const row = rowsOf('takeoffs').find(r => r.user_id === 'u_a');
  ok('A3 a sub saves a takeoff → one takeoffs row, theirs (user u_a, job J_PUB), 10 LF', put.st === 200 && row && row.job_id === 'J_PUB' && put.d.totals[0].qty === 10, put);
  const other = await sp('b@sub.test', { action: 'takeoffs', op: 'get', jobId: 'J_PUB', file });
  const otherJob = await sp('b@sub.test', { action: 'takeoffs', op: 'job', jobId: 'J_PUB' });
  ok('A4 another sub on the same job and plan gets their OWN (empty) takeoff — never Alpha\'s', other.st === 200 && other.d.doc === null && otherJob.d.totals.length === 0, [other, otherJob]);
  const priv = await sp('a@sub.test', { action: 'takeoffs', op: 'get', jobId: 'J_PRIV', file });
  const hid = await sp('a@sub.test', { action: 'takeoffs', op: 'put', jobId: 'J_PUB', file: { name: 'Hidden Sheet.pdf' }, doc: { items: [] } });
  const anon = await sp('', { action: 'takeoffs', op: 'get', jobId: 'J_PUB', file });
  ok('A5 a job they may not see → 403; a plan hidden from subs → 403; no sign-in → refused', priv.st === 403 && hid.st === 403 && anon.st >= 400, [priv, hid, anon.st]);
  const st = await sp('owner@grayco-cs.com', { action: 'takeoffs', op: 'put', jobId: 'J_PRIV', file: { name: 'Any.pdf' }, doc: { items: [] } });
  ok('A6 GrayCo staff → owner "gc" (saved to the job, any job)', st.st === 200 && rowsOf('takeoffs').some(r => r.user_id === 'gc' && r.job_id === 'J_PRIV'), st);
  const tk = TK.mint({ sub: 'SUB9', pid: 'P9', ref: 'abc123.pdf', name: 'Kitchen Plans.pdf', type: 'application/pdf', job: 'Demo Kitchen' });
  const op = await sp('', { action: 'takeoffs', op: 'open', mt: tk });
  const tput = await sp('', { action: 'takeoffs', op: 'put', mt: tk, jobId: 'J_PUB', file: { name: 'A-101 Floor Plan.pdf' }, doc: { items: [{ id: 'q', page: 1, type: 'count', pts: [[1, 1]] }] } });
  const trow = rowsOf('takeoffs').find(r => r.user_id === 'crm.SUB9');
  const tbad = await sp('', { action: 'takeoffs', op: 'get', mt: bad });
  ok('A7 a ticket (no sign-in): opens its CRM file (a signed crm-files link) and saves to crm.SUB9 + crm.P9 + that file — the jobId / file in the body are ignored; a changed ticket → 403',
    op.st === 200 && /crm-files\/abc123\.pdf/.test(op.d.file.url) && op.d.job === 'Demo Kitchen' && tput.st === 200 && trow && trow.job_id === 'crm.P9' && trow.data.file.name === 'Kitchen Plans.pdf' && tbad.st === 403, [op, tput, trow, tbad]);
  /* 📐 Attach my takeoff on a bid (papers on file first, as for every bid) */
  putRow('subdocs', 'u_a', { items: ['w9', 'insurance_general', 'insurance_workers_comp'].map(t => ({ id: 'd' + t, type: t, fileName: t + '.pdf', fileRef: 'u/u_a/' + t + '.pdf', expirationDate: t === 'w9' ? null : DAY(200) })) }, { user_id: 'u_a' });
  const bid = await sp('a@sub.test', { action: 'save', key: 'bids', upsert: [{ id: 'b_a1', jobId: 'J_PUB', amount: 5000, notes: 'see PDF', docs: [], attachTakeoff: true }] });
  const b = rowData('bids/b_a1') || {};
  ok('A8 📐 Attach my takeoff → the bid carries the totals of THEIR saved takeoffs on that job (Wall A 10 LF), made on the server', bid.st === 200 && (b.takeoff || []).length === 1 && b.takeoff[0].name === 'Wall A' && b.takeoff[0].qty === 10 && !!b.takeoffAt, [bid, b]);
}

/* ═══ B. the bid site on a phone ═══ */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const CDN = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/leadtxt/cdnfix/cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
async function phone(url){
  const ctx = await W.bidsCtx(browser, BUILD, F, 'phone');
  await ctx.route(u => new URL(u).host === 'cdnjs.cloudflare.com', r => r.fulfill({ path: CDN + path.basename(new URL(r.request().url()).pathname), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await p.goto(url || 'https://bids.test/'); return p;
}
/* tap a point of the plan (page units) */
async function tapAt(p, x, y){
  const s = await p.evaluate(([x, y]) => { const c = document.querySelector('[data-m-viewport] > div[style*="transform"]'); const r = c.getBoundingClientRect(); const z = r.width / parseFloat(c.style.width); return [r.left + x * z, r.top + y * z]; }, [x, y]);
  await p.touchscreen.tap(s[0], s[1]); await sleep(120);
}
const doc = () => (rowsOf('takeoffs').find(r => r.user_id === 'u_a' && r.data.file.name === 'A-101 Floor Plan.pdf') || {}).data || {};
try {
  const P = await phone();
  await W.bidsLogin(P, 'a@sub.test', 'Sub-Pass-1');
  await P.waitForSelector('h3:has-text("Clinic Drywall Demo")', { timeout: 30000 });
  await P.click('h3:has-text("Clinic Drywall Demo")');
  await P.waitForSelector('button:has-text("Measure")', { timeout: 15000 });
  await sleep(800);
  await P.click('button:has-text("Measure")');
  await P.waitForSelector('[data-measure-tool] canvas', { timeout: 15000 });
  ok('B1 📐 Measure opens the full-screen tool; the real PDF draws (2 pages) and the earlier saved line is back', await until(() => P.evaluate(() => { const c = document.querySelector('[data-measure-tool] canvas'); return c && c.width > 500 && /1\/2/.test(document.body.innerText) && document.querySelectorAll('[data-mitem]').length === 1; }), 20000),
    await P.evaluate(() => document.body.innerText.slice(0, 300)));
  /* the scale: preset 1/4"=1' */
  await P.click('[data-m-tool="scale"]'); await P.click('[data-m-preset="1/4\\"=1\'"]');
  ok('B2 preset 1/4"=1\' → "Scale: 1/4"=1\'" on the page, saved (18 points per foot, both pages)', await until(() => { const d = doc(); return d.pages && d.pages[1] && d.pages[1].ppf === 18 && d.pages[2] && d.pages[2].ppf === 18; }) && /Scale: 1\/4"=1'/.test(await P.innerText('[data-m-scalechip]')), doc().pages);
  /* Line: 10 LF, name, wall height 9 → 90 SF wall */
  await tapAt(P, 300, 250); await tapAt(P, 480, 250);
  await P.waitForSelector('[data-m-editor]');
  await P.fill('[data-m-name]', 'Wall B'); await P.fill('[data-m-height]', '9'); await P.fill('[data-m-note]', 'Type X both sides');
  ok('B3 📏 Line, two taps 180 pt apart → "10 LF · 90 SF wall" with a name, height and note', await until(async () => /10 LF · 90 SF wall/.test(await P.innerText('[data-m-qty]'))), await P.innerText('[data-m-qty]'));
  await P.click('[data-m-done]');
  /* Rect: 100 SF */
  await P.click('[data-m-tool="rect"]'); await tapAt(P, 600, 300); await tapAt(P, 780, 480);
  await P.fill('[data-m-name]', 'Ceiling'); await P.fill('[data-m-depth]', '4');
  ok('B4 ▭ Rect 180 × 180 pt → 100 SF · 40 LF perimeter · 1.23 CY at 4"', await until(async () => /100 SF · 40 LF perimeter · 1.23 CY/.test(await P.innerText('[data-m-qty]'))), await P.innerText('[data-m-qty]'));
  await P.click('[data-m-done]');
  /* Count: 3 */
  await P.click('[data-m-tool="count"]'); await tapAt(P, 850, 300); await tapAt(P, 900, 300); await tapAt(P, 950, 300);
  await P.fill('[data-m-name]', 'Outlets');
  ok('B5 ⊕ Count, three taps → 3 EA', /3 EA/.test(await P.innerText('[data-m-qty]')), await P.innerText('[data-m-qty]'));
  await P.click('[data-m-done]');
  /* a 📝 note pin */
  await P.click('[data-m-tool="note"]'); await tapAt(P, 380, 420);
  await P.fill('[data-m-notetext]', 'Verify soffit height');
  await P.click('[data-m-done]');
  ok('B6 saved on the server: 5 measurements with names, height, depth, notes, the note pin text', await until(() => { const d = doc(); const it = d.items || []; return it.length === 5 && it.some(m => m.name === 'Wall B' && m.height === 9 && m.note === 'Type X both sides') && it.some(m => m.type === 'rect' && m.depth === 4) && it.some(m => m.type === 'count' && m.pts.length === 3) && it.some(m => m.type === 'note' && m.text === 'Verify soffit height'); }, 10000), doc().items);
  await until(async () => /Saved/.test(await P.innerText('[data-m-save]')));
  await P.click('[data-m-zoomin]'); await P.click('[data-m-zoomin]'); await sleep(300); await shot(P, 'measure_plan');
  /* ☰ List totals */
  await P.click('[data-m-tool="list"]');
  const tl = await P.innerText('[data-m-list]');
  ok('B7 ☰ List: totals by name + unit (Wall B 10 LF, Wall B (wall) 90 SF, Ceiling 100 SF / 1.23 CY, Outlets 3 EA) and every measurement', /Wall B\s*10 LF/.test(tl) && /Wall B \(wall\)\s*90 SF/.test(tl) && /Ceiling\s*100 SF/.test(tl) && /Ceiling\s*1\.23 CY/.test(tl) && /Outlets\s*3 EA/.test(tl) && /Verify soffit height/.test(tl), tl);
  await shot(P, 'measure_list');
  const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 8000 }).catch(() => null), P.click('[data-m-csv]')]);
  let csv = ''; if (dl) { const fp = await dl.path().catch(() => ''); if (fp) csv = fs.readFileSync(fp, 'utf8'); }
  ok('B8 ⬇ Export CSV: one row per measurement + TOTALS', /"Wall B","10","LF"/.test(csv) && /TOTALS/.test(csv) && /Verify soffit height/.test(csv), csv.slice(0, 400));
  /* page 2 has its own items; delete from the list */
  await P.click('[data-m-list] button:has-text("✕")');
  await P.click('[aria-label="next page"]');
  ok('B9 page 2 → 2/2, none of page 1\'s measurements drawn', await until(async () => (await P.getAttribute('[data-m-page]', 'data-m-page')) === '2' && (await P.$$('[data-mitem]')).length === 0));
  await P.click('[aria-label="previous page"]');
  await P.click('[data-m-close]');
  /* another phone: reopen → everything back */
  const P2 = await phone();
  await W.bidsLogin(P2, 'a@sub.test', 'Sub-Pass-1');
  await P2.waitForSelector('h3:has-text("Clinic Drywall Demo")', { timeout: 30000 }); await P2.click('h3:has-text("Clinic Drywall Demo")');
  await P2.waitForSelector('button:has-text("Measure")'); await sleep(800); await P2.click('button:has-text("Measure")');
  ok('B10 another phone → the same takeoff: all 5 measurements drawn on page 1 (the earlier line + the 4 new)', await until(async () => (await P2.$$('[data-mitem]')).length === 5, 20000), (await P2.$$('[data-mitem]')).length);
  await P2.click('[data-m-tool="list"]');
  await P2.click('[data-m-row]:has-text("Outlets") button[aria-label="delete"]');
  ok('B11 🗑 delete from the list → gone on the server', await until(() => !(doc().items || []).some(m => m.type === 'count')));

  /* ═══ C. from portal.grayco-cs.com: #measure=<ticket> ═══ */
  const tk = TK.mint({ sub: 'SUBdemo', pid: 'PDEMO', ref: 'abc123.pdf', name: 'Kitchen Plans.pdf', type: 'application/pdf', job: 'Demo Kitchen' });
  const P3 = await phone('https://bids.test/#measure=' + tk);
  await P3.waitForSelector('[data-measure-tool] canvas', { timeout: 20000 });
  await until(() => P3.evaluate(() => document.querySelector('[data-measure-tool] canvas').width > 500), 20000);
  await P3.click('[data-m-tool="scale"]'); await P3.click('[data-m-preset="1/8\\"=1\'"]');
  await P3.click('[data-m-tool="line"]'); await tapAt(P3, 200, 300); await tapAt(P3, 290, 300);
  await P3.fill('[data-m-name]', 'Base cabinets');
  ok('C1 #measure=<ticket>: the CRM plan opens with no bid-site sign-in (no login form); 1/8"=1\' → 90 pt = 10 LF; saved to that sub + CRM job',
    !(await P3.$('input[type=password]')) && await until(() => { const r = rowsOf('takeoffs').find(x => x.user_id === 'crm.SUBdemo'); return r && r.job_id === 'crm.PDEMO' && (r.data.items || []).some(m => m.name === 'Base cabinets'); }) && /10 LF/.test(await P3.innerText('[data-m-qty]')));
  ok('C2 no page errors', errs.length === 0, errs);
} catch (e) { ok('no crash', false, String(e && e.stack || e).slice(0, 900)); }
async function shot(p, n){ if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png') }).catch(() => {}); }
await browser.close();
const fails = R.filter(x => !x).length;
console.log(`\n${R.length - fails}/${R.length} passed`);
process.exit(fails ? 1 : 0);
