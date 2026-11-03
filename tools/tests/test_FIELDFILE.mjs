// test_FIELDFILE.mjs <build-dir> — patch FIELDFILE (owner 11/03, iPhone, Field): 📷 Add Photo/File on a job opens the phone's
//   picker (camera / library / files); a FILE (PDF…) is stored on that job's Documents and the job page stays on the
//   screen — the dark Job Info sheet is NOT opened (the bug: "Tried to add a file and it went to this dark page");
//   a PHOTO goes to GrayCo Photos as before. The 📋 Job Info tile still opens its (dark, as designed) sheet.
//   + patch ESTUPLOAD: the job's "📄 Upload estimate" tile → 📤 Upload · 📘 Templates · this job's estimates. An old Word .doc
//   needs a typed total; a PDF's total is read; after Accept the panel: original / template side by side, "Customer sees",
//   the schedule found in the PDF (start, phases → finish) and 📅 Make schedule (tentative items), Template details
//   (scope from the paper, wording only; payment terms…), ✉️ Send it myself / ⬇️ Download / 📨 Put in customer portal
//   (nothing before the tap); the estimate is the job's Bid / Estimate; signing it makes the contract that total.
//   Phone: 390x844, iPhone UA, touch, the owner signed in, the real-data mirror (GC_MIRROR) in the offline harness
//   (GC_HARNESS) with a fake cloud and a fake file store — nothing is written anywhere else.
// Usage: node test_FIELDFILE.mjs <dir with index.html>
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/ff/';
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDFILE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
fs.mkdirSync(SHOTS, { recursive: true });
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(html.includes('__GC_PATCH_FIELDFILE__'), 'FIELDFILE is in the page');

function pdf(lines){
  const content = 'BT /F1 11 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'latin1')]);
}

const H = await import(pathToFileURL(HARNESS).href);
const { sleep, waitFor } = H;
H.resetCloud();
const M = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
for (const r of M) if (r && r.key && !/^_probe/.test(r.key)) H.cset(r.key, r.v !== undefined ? r.v : r.value);
let P0 = H.cget('projects'); if (typeof P0 === 'string') try { P0 = JSON.parse(P0); } catch (e) {}
P0 = (Array.isArray(P0) ? P0 : []).filter(p => p && p.id && p.name && !p.deleted && !p.tombstoned);
const low = v => String(v == null ? '' : v).toLowerCase();
/* the owner's job ("Brad", PO K624) when the mirror has it; else a job still bidding (no contract yet) — picked in the page,
   from the jobs the phone has (window._crm.projects) */
const PICK = ps => { const l = v => String(v == null ? '' : v).toLowerCase(); ps = (ps || []).filter(p => p && p.id && p.name && !p.deleted);
  return ps.find(p => /K624/i.test((p.autoPO || '') + ' ' + (p.po || ''))) || ps.find(p => /^bidding$/.test(l(p.status)) && !(+p.contract > 0) && p.address) || ps.find(p => /^active$/.test(l(p.status))); };
let JOB = null, PID = '';
const STORE = [], SIGN = [], FNS = []; const W = [];
async function fakeFiles(c){
  /* the private file bucket: uploads are recorded, nothing leaves the test */
  await c.ctx.route(u => /\/storage\/v1\/object\//.test(String(u)), async r => {
    const q = r.request(); if (q.method() === 'POST' || q.method() === 'PUT') STORE.push({ path: new URL(q.url()).pathname, type: q.headers()['content-type'], size: (q.postDataBuffer() || Buffer.alloc(0)).length });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: 'ok' }) });
  });
  /* the server functions the page calls are recorded; portal-sign answers like the real one (a request id) */
  await c.ctx.route(u => /\/\.netlify\/functions\//.test(String(u)), async r => {
    const q = r.request(), u = new URL(q.url()); let b = {}; try { b = JSON.parse(q.postData() || '{}'); } catch (e) {}
    FNS.push({ fn: u.pathname.split('/').pop(), q: u.search, method: q.method(), action: b.action || b.op || '' });
    if (/portal-sign$/.test(u.pathname)) { SIGN.push(b); if (b.action === 'request') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'SR_' + b.refId }) }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  /* the PDF maker the CRM loads from cdnjs (html2pdf): a stand-in that hands back a small PDF */
  await c.ctx.route(u => /cdnjs\.cloudflare\.com\/ajax\/libs\/html2pdf/.test(String(u)), r => r.fulfill({ status: 200, contentType: 'text/javascript', body: "window.html2pdf=function(){var o={set:function(){return o},from:function(){return o},toPdf:function(){return o},get:function(){return Promise.resolve({output:function(){return new Blob(['%PDF-1.4 test proposal'],{type:'application/pdf'})}})}};return o;};" }));
}
const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const noJobInfo = c => c.ev(() => !/PO NUMBER/.test(document.body.innerText) && !document.getElementById('_jpFileInput'));
async function openJob(c){
  await c.ev(pid => { document.querySelectorAll('#_gcJobPick,#_gcJobDash,.gcfp-sheet').forEach(o => o.remove()); window._gcJobDashboard(pid); }, PID);
  return waitFor(c, () => !!document.querySelector('#_gcJobDash .gcfp-grid ._jdAct[data-fn="photo"]'), null, 15000);
}
try {
  const O = await H.computer('OWN', { build, mobile: true }); W.push(O); await fakeFiles(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await waitFor(O, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 60000)), 'the phone opens in GrayCo Field');
  await waitFor(O, () => typeof window._gcStoreFile === 'function' && !!(window._gcPhotos && window._gcPhotos.capture) && ((window._crm && window._crm.projects) || []).length > 0, null, 90000);
  await sleep(2500);
  JOB = await O.ev(src => { const f = eval(src); const p = f((window._crm && window._crm.projects) || []); return p ? { id: p.id, name: p.name, status: p.status, po: p.autoPO || p.po, contract: p.contract } : null; }, '(' + PICK.toString() + ')');
  PID = JOB && JOB.id;
  ok(!!JOB, 'fixture: a real job from the mirror', JOB);
  ok(!!(await openJob(O)), 'the job opens in Field with its tiles', await O.ev(() => { const d = document.getElementById('_gcJobDash'); return d ? { fp: d.getAttribute('data-gcfp'), acts: [...d.querySelectorAll('._jdAct')].map(b => b.getAttribute('data-fn')), grid: !!d.querySelector('.gcfp-grid') } : 'no dash'; }));
  const pg = O.page();
  await pg.screenshot({ path: SHOTS + 'fieldfile_job.png' });

  /* ── 📷 Add Photo/File → the picker; a PDF → the job's Documents, the job page stays ── */
  const docs0 = await O.ev(async pid => ((await window.idbGet('projectDocs')) || []).filter(d => d && d.pid === pid).length, PID);
  let fc = pg.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
  await pg.locator('#_gcJobDash ._jdAct[data-fn="photo"]').first().tap();
  let ch = await fc;
  ok(!!ch, 'tapping 📷 Add Photo/File opens the phone\'s file chooser');
  const acc = ch ? await ch.element().getAttribute('accept') : '';
  ok(!!ch && ch.isMultiple() && /image\/\*/.test(acc) && /\.pdf/.test(acc) && /\.docx/.test(acc), 'the chooser takes photos (camera / library) and files (PDF, Word…), several at once', { acc, multi: ch && ch.isMultiple() });
  ok(await noJobInfo(O), 'opening the chooser does not open Job Info');
  if (ch) await ch.setFiles({ name: 'Scope and drawings.pdf', mimeType: 'application/pdf', buffer: pdf(['GrayCo test file', 'Scope of work', 'Drawings attached']) });
  const doc = await waitFor(O, async pid => { const l = ((await window.idbGet('projectDocs')) || []).filter(d => d && d.pid === pid && d.name === 'Scope and drawings.pdf'); return l.length ? l[0] : null; }, PID, 20000);
  await sleep(1200);
  await pg.screenshot({ path: SHOTS + 'fieldfile_after_pdf.png' });
  ok(await noJobInfo(O), 'after picking a PDF the dark Job Info sheet is NOT opened (the owner\'s bug)', await O.ev(() => document.body.innerText.slice(0, 200)));
  ok(await O.ev(() => { const d = document.getElementById('_gcJobDash'); if (!d) return false; const el = document.elementFromPoint(195, 600); return !!el && d.contains(el); }), 'the job page is still the screen');
  ok(!!doc && /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(doc.ref || '') && doc.cat === 'document' && !doc.data, 'the PDF is on the job\'s Documents (file storage reference, not a data blob)', doc);
  ok(await O.ev(() => /added to this job's Documents/.test((document.getElementById('gcfp-toast') || {}).textContent || '')), 'a toast says it was added to the job\'s Documents', await O.ev(() => (document.getElementById('gcfp-toast') || {}).textContent));
  const docs1 = await O.ev(async pid => ((await window.idbGet('projectDocs')) || []).filter(d => d && d.pid === pid).length, PID);
  ok(docs1 === docs0 + 1, 'exactly one record was added', { docs0, docs1 });
  const inCloud = await (async () => { for (let i = 0; i < 120; i++) { let v = H.cget('projectDocs'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) { v = []; } if (Array.isArray(v) && v.some(d => d && d.pid === PID && d.name === 'Scope and drawings.pdf')) return true; await sleep(500); } return false; })();
  ok(inCloud, 'the record reaches the cloud (gc_kv projectDocs, through the save queue)');
  const up = await (async () => { for (let i = 0; i < 40; i++) { const hit = STORE.find(x => doc && x.path.endsWith(String(doc.ref).slice(3))); if (hit) return hit; await sleep(500); } return null; })();
  ok(!!up && up.size > 100, 'the file itself is uploaded to the file bucket (crm-files/<hash>.pdf)', { up, store: STORE.slice(-3) });
  const inList = await O.ev(pid => ((window._crm && window._crm.projectDocs) || []).some(d => d && d.pid === pid && d.name === 'Scope and drawings.pdf'), PID);
  ok(inList, 'the job\'s Documents list on this phone has it right away');

  /* ── a PHOTO → GrayCo Photos (unchanged), still no Job Info ── */
  await openJob(O);
  fc = pg.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
  await pg.locator('#_gcJobDash ._jdAct[data-fn="photo"]').first().tap();
  ch = await fc;
  const cap0 = await O.ev(() => { window.__ffCap = []; const P = window._gcPhotos, f = P.capture; P.capture = function(pid, files, phase){ window.__ffCap.push({ pid, n: files.length, phase }); return f.apply(this, arguments); }; return true; });
  const JPG = Buffer.from(await O.ev(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#3a7'; x.fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }), 'base64');   /* a real JPEG */
  if (ch) await ch.setFiles({ name: 'site.jpg', mimeType: 'image/jpeg', buffer: JPG });
  await sleep(2500);
  const cap = await O.ev(() => window.__ffCap);
  ok(cap0 && cap.length === 1 && cap[0].pid === PID && cap[0].n === 1, 'a photo goes to GrayCo Photos\' own upload for this job', cap);
  ok(await noJobInfo(O), 'a photo does not open Job Info either');
  await pg.screenshot({ path: SHOTS + 'fieldfile_after_photo.png' });
  await O.ev(() => document.querySelectorAll('.gc-custq,.gcu-ov,[data-gcu-sheet],.gcfp-sheet').forEach(o => o.remove()));

  /* ── 📋 Job Info: its own (dark) sheet, as designed ── */
  await openJob(O);
  await pg.locator('#_gcJobDash ._jdAct[data-fn="info"]').first().tap(); await sleep(800);
  const info = await O.ev(() => { const el = [...document.querySelectorAll('body > div')].reverse().find(d => /PO NUMBER/.test(d.innerText || '')); const card = el && el.firstElementChild; return el ? { bg: getComputedStyle(card).backgroundColor } : null; });
  ok(!!info && info.bg === 'rgb(15, 36, 64)', '📋 Job Info still opens the Job Info sheet (dark navy is its normal look)', info);
  await pg.screenshot({ path: SHOTS + 'fieldfile_jobinfo.png' });

  /* ══ ESTUPLOAD: 📄 Upload estimate on the job ══ */
  ok(html.includes('__GC_PATCH_ESTUPLOAD__'), 'ESTUPLOAD is in the page');
  await O.ev(() => document.querySelectorAll('body > div').forEach(d => { if (/PO NUMBER/.test(d.innerText || '') && !d.id) d.remove(); }));
  await openJob(O);
  const tile = pg.locator('#_gcJobDash .gcfp-t[data-fp="estup"]');
  ok(await tile.count() === 1, 'the job screen has a "📄 Upload estimate" tile', await O.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-grid > *')].map(b => b.textContent.trim())));
  const estOf = src => O.ev(async src => { const all = [].concat(window._gcEstimatesState || [], (window._crm && window._crm.estimates) || [], (await window.idbGet('estimates')) || []); const e = all.find(x => x && x.sourceName === src && !x.deleted); return e ? { id: e.id, pid: e.pid, total: e.totalCharge, name: e.name, ref: e.sourceRef, sees: e.customerSees || '', status: e.status, review: !!e.estinReview, wait: !!e.estinWait, tpl: e.tplDetails || null } : null; }, src);
  const estWait = async src => { for (let i = 0; i < 30; i++) { const e = await estOf(src); if (e) return e; await sleep(400); } return null; };
  const menuUp = async () => { await tile.tap(); return waitFor(O, () => !!document.querySelector('#gceu-menu [data-eu="up"]') && !!document.querySelector('#gceu-menu [data-eu="tpl"]'), null, 8000); };
  const sheetUp = () => waitFor(O, () => !!document.querySelector('.gces-ov [data-es="file"]'), null, 10000);
  const panelUp = () => waitFor(O, () => !!document.querySelector('#gceu-after [data-eu-prev]'), null, 15000);
  ok(!!(await menuUp()), 'the tile opens the estimate menu: 📤 Upload estimate · 📘 Templates');
  await pg.screenshot({ path: SHOTS + 'estupload_menu.png' });
  await pg.locator('#gceu-menu [data-eu="up"]').tap();
  ok(!!(await sheetUp()), '📤 opens the CRM\'s estimate upload (the same sheet as the desk\'s 📤 Upload estimate)');
  const acc2 = await O.ev(() => document.querySelector('.gces-ov [data-es="file"]').getAttribute('accept'));
  ok(/\.pdf/.test(acc2) && /\.docx/.test(acc2) && /\.doc\b/.test(acc2), 'it takes PDF and Word (.docx / .doc)', acc2);
  // an old Word file: kept, the total typed
  await pg.locator('.gces-ov [data-es="file"]').setInputFiles({ name: 'Old proposal.doc', mimeType: 'application/msword', buffer: Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), Buffer.alloc(3000, 7)]) });
  ok(!!(await waitFor(O, () => !!document.querySelector('.gces-ov [data-es="total"]'), null, 20000)), 'an old Word .doc is accepted (review shown)', await O.ev(() => (document.querySelector('.gces-ov [data-es-out]') || {}).innerText));
  ok(await O.ev(() => document.querySelector('.gces-ov [data-es="total"]').value === '' && /type the total/i.test(document.querySelector('.gces-ov').innerText)), 'no total can be read from it — it asks for the total');
  await O.ev(() => document.querySelector('.gces-ov [data-es="save"]').click()); await sleep(800);
  ok(!(await estOf('Old proposal.doc')) && !!(await O.ev(() => document.querySelector('.gces-ov'))), 'Accept without a total: not saved, the sheet stays');
  await pg.locator('.gces-ov [data-es="total"]').fill('9,800');
  await pg.locator('.gces-ov [data-es="name"]').fill('Old Word proposal');
  await O.ev(() => document.querySelector('.gces-ov [data-es="save"]').click());
  const e1 = await estWait('Old proposal.doc');
  ok(!!e1 && e1.pid === PID && e1.total === 9800 && e1.name === 'Old Word proposal' && /^sb:crm-files\//.test(e1.ref || '') && !e1.review && e1.wait, 'saved as this job\'s estimate: the typed total ($9,800), the name, the file kept; it waits (nothing made / sent)', e1);
  ok(!!(await panelUp()), 'then the panel opens');
  const p1 = await O.ev(() => { const v = document.getElementById('gceu-after'); const r = [...v.querySelectorAll('[data-eu-cs]')]; return { pdfDis: r.find(x => x.value === 'pdf').disabled, tpl: r.find(x => x.value === 'template').checked, details: !v.querySelector('[data-eu-details]').hidden }; });
  ok(p1.pdfDis && p1.tpl && p1.details, 'a Word original: "My PDF" is off, the Template version is chosen and its details shown', p1);
  await O.ev(() => document.querySelector('#gceu-after [data-eu="x"]').click()); await sleep(300);
  // a PDF (Word / Google Docs saved as PDF) with schedule language
  await menuUp(); await pg.locator('#gceu-menu [data-eu="up"]').tap(); await sheetUp();
  await pg.locator('.gces-ov [data-es="file"]').setInputFiles({ name: 'Brad roof.pdf', mimeType: 'application/pdf', buffer: pdf(['GrayCo Construction Services', 'Proposal', 'Tear off and replace shingles = $11,500.00', 'Gutters and downspouts = $1,000.00', 'Total: $12,500.00', 'Start date: 11/16/2026', 'Phase 1: Tear off, 2 days', 'Phase 2: Install shingles and gutters, 3 days']) });
  ok(!!(await waitFor(O, () => !!document.querySelector('.gces-ov [data-es="total"]'), null, 20000)), 'the PDF is read (review shown)');
  const tv = await O.ev(() => document.querySelector('.gces-ov [data-es="total"]').value);
  ok(tv === '12500', 'the total is read from the PDF ($12,500)', tv);
  await pg.locator('.gces-ov [data-es="name"]').fill('Brad roof proposal');
  await O.ev(() => document.querySelector('.gces-ov [data-es="save"]').click());
  const e2 = await estWait('Brad roof.pdf');
  ok(!!e2 && e2.pid === PID && e2.total === 12500 && /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(e2.ref || '') && e2.wait, 'saved as this job\'s estimate ($12,500, its own PDF kept)', e2);
  ok(!!(await panelUp()), 'the panel opens');
  await sleep(800);
  const p2 = await O.ev(() => { const v = document.getElementById('gceu-after'), f = k => v.querySelector('[data-eu-f="' + k + '"]'); return { cards: [...v.querySelectorAll('[data-eu-card]')].map(c => c.getAttribute('data-eu-card')), cs: (v.querySelector('[data-eu-cs]:checked') || {}).value, details: !v.querySelector('[data-eu-details]').hidden, start: f('start').value, finish: f('finish').value, phases: [...v.querySelectorAll('[data-eu-ph]')].map(r => r.querySelector('[data-k="name"]').value + ':' + r.querySelector('[data-k="days"]').value), quotes: [...v.querySelectorAll('.gceu-q')].map(q => q.textContent), prev: (v.querySelector('[data-eu-prev]') || {}).srcdoc || '' }; });
  ok(p2.cards.join() === 'pdf,template' && p2.cs === 'pdf' && !p2.details, 'side by side: 📎 Your original PDF / 📘 Template version; Customer sees: My PDF (the default); the template details stay hidden', p2.cards.concat([p2.cs, p2.details]));
  ok(p2.start === '2026-11-16' && p2.phases.join('|') === 'Tear off:2|Install shingles and gutters:3' && p2.finish === '2026-11-20', 'the schedule found in the PDF: start 11/16, two phases → finish 11/20 (working days)', p2);
  ok(p2.quotes.some(q => /found in your PDF: “Start date: 11\/16\/2026”/.test(q)) && p2.quotes.some(q => /Phase 1: Tear off, 2 days/.test(q)), 'each one says the words it came from ("found in your PDF: …")', p2.quotes);
  const scopeOl = (/<ol class="scope">([\s\S]*?)<\/ol>/.exec(p2.prev) || ['', ''])[1];
  ok(/Tear off and replace shingles/.test(scopeOl) && !/\$|11,500/.test(scopeOl) && /12,500\.00/.test(p2.prev), 'the template version is built from the numbers: the scope wording only, the total $12,500 (SCOPEWORDS)', scopeOl.slice(0, 300));
  await pg.screenshot({ path: SHOTS + 'estupload_panel.png', fullPage: false });
  ok(!SIGN.some(b => b.action === 'request' && (b.refId === e2.id || b.refId === e1.id)), 'nothing is made for the customer yet (no approval, nothing sent)');
  // 📅 Make schedule for job
  const job0 = await O.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return { sw: p.scopeOfWork || '', sc: p.scope || '' }; }, PID);
  await pg.locator('#gceu-after [data-eu="sched"]').tap(); await sleep(1500);
  const sch = await O.ev(pid => ((window._crm && window._crm.schedule) || []).filter(x => x && x.pid === pid && x.source === 'estimate').map(x => x.title + '@' + x.date + '>' + (x.endDateSch || '') + (x.tentative ? ':t' : '')), PID);
  ok(sch.join('|') === 'Tear off@2026-11-16>2026-11-17:t|Install shingles and gutters@2026-11-18>2026-11-20:t', '📅 Make schedule → the two phases on the job\'s Schedule, tentative, on working days', sch);
  const inIdb = await O.ev(async pid => ((await window.idbGet('schedule')) || []).filter(x => x && x.pid === pid && x.source === 'estimate').length, PID);
  ok(inIdb === 2, '… saved on this phone (and queued for the cloud)', inIdb);
  const job1 = await O.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return { sw: p.scopeOfWork || '', sc: p.scope || '', msg: document.querySelector('#gceu-after [data-eu-scopemsg]').innerText }; }, PID);
  if (!job0.sw && !job0.sc) ok(/Tear off and replace shingles/.test(job1.sw) && job1.sw === job1.sc && !/\$/.test(job1.sw), 'the job had no Scope of Work: the scope (wording only) is now its scope', job1);
  else ok(job1.sw === job0.sw && job1.sc === job0.sc && /Add to job scope/.test(job1.msg), 'the job already had a Scope of Work: left as it is, "＋ Add to job scope" offered', { job0: job0.sw.slice(0, 80), msg: job1.msg });
  await pg.locator('#gceu-after [data-eu="sched"]').tap(); await sleep(1000);
  ok((await O.ev(pid => ((window._crm && window._crm.schedule) || []).filter(x => x && x.pid === pid && x.source === 'estimate').length, PID)) === 2, 'tapping it again adds nothing twice');
  // the Template version: its details
  await pg.locator('#gceu-after label:has([data-eu-cs][value="template"])').tap(); await sleep(400);
  const p3 = await O.ev(() => { const v = document.getElementById('gceu-after'), f = k => v.querySelector('[data-eu-f="' + k + '"]'); return { details: !v.querySelector('[data-eu-details]').hidden, scope: f('scope').value, terms: f('terms').value, valid: f('valid').value, war: f('warranty').value, exc: f('exc').value.split('\n').length, which: v.querySelector('[data-eu-which]').textContent }; });
  ok(p3.details && p3.scope === 'Tear off and replace shingles\nGutters and downspouts' && p3.terms === '' && /^\d{4}-\d{2}-\d{2}$/.test(p3.valid) && /one \(1\) year/i.test(p3.war) && p3.exc >= 3 && /Template/.test(p3.which), 'Template version → its details: the scope built from the PDF (no prices), payment terms = the template default, valid until, warranty and exclusions from the template', p3);
  await pg.locator('#gceu-after [data-eu-f="terms"]').selectOption({ index: 1 });
  await pg.locator('#gceu-after [data-eu="savetpl"]').tap(); await sleep(800);
  const e2b = await estOf('Brad roof.pdf');
  const prev2 = await O.ev(() => document.querySelector('#gceu-after [data-eu-prev]').srcdoc);
  ok(!!e2b.tpl && e2b.tpl.scope === p3.scope && e2b.tpl.start === '2026-11-16' && e2b.tpl.finish === '2026-11-20' && e2b.sees === 'template', '💾 Save template details → kept on the estimate (scope, dates); Customer sees: Template', e2b.tpl && { scope: e2b.tpl.scope, start: e2b.tpl.start, sees: e2b.sees });
  ok(/50% is due as a deposit and 50% at completion/.test(prev2) && /Estimated schedule: start November 16, 2026, completion November 20, 2026/.test(prev2), 'the template shows the payment terms and the schedule', prev2.length);
  await pg.screenshot({ path: SHOTS + 'estupload_template.png' });
  // ✉️ Send it myself (the template PDF) — the phone's share sheet gets the file
  await O.ev(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = d => { window.__shared = { n: d.files[0].name, t: d.files[0].type, sz: d.files[0].size }; return Promise.resolve(); }; });
  await sleep(1500);
  await pg.locator('#gceu-after [data-eu="share"]').tap(); await sleep(800);
  const sh = await O.ev(() => window.__shared);
  ok(!!sh && sh.n === 'Proposal - Brad roof proposal.pdf' && sh.t === 'application/pdf', '✉️ Send it myself → the template PDF to the phone\'s share sheet (e-mail, text)', sh);
  // ⬇️ Download the original
  await pg.locator('#gceu-after label:has([data-eu-cs][value="pdf"])').tap(); await sleep(1500);
  const dl = pg.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await pg.locator('#gceu-after [data-eu="dl"]').tap();
  const d1 = await dl;
  ok(!!d1 && d1.suggestedFilename() === 'Brad roof.pdf', '⬇️ Download → the original PDF', d1 && d1.suggestedFilename());
  ok(!SIGN.some(b => b.action === 'request' && b.refId === e2.id) && !FNS.some(f => /send|deliver|e-?mail|notify|invite|approve/i.test(f.action)), 'still nothing to the customer (share / download are his own)');
  // 📨 Put in customer portal (the original)
  await pg.locator('#gceu-after [data-eu="portal"]').tap();
  const req = await (async () => { for (let i = 0; i < 40; i++) { const r = SIGN.find(b => b.action === 'request' && b.refId === e2.id); if (r) return r; await sleep(500); } return null; })();
  ok(!!req && req.estin === true && req.auto === true && req.amount == null && req.docRef === e2.ref, '📨 Put in customer portal → ESTIN\'s ONE approval with the original PDF (it waits on ✅ Approvals)', req && { estin: req.estin, amount: req.amount, apprTitle: req.apprTitle });
  ok(await O.ev(() => /On ✅ Approvals/.test((document.getElementById('gceu-toast') || {}).textContent || '')), 'it says it waits on ✅ Approvals');
  await O.ev(() => document.querySelector('#gceu-after [data-eu="x"]').click()); await sleep(300);
  const strip = await waitFor(O, () => { const t = (document.querySelector('#_gcJobDash .gcjt-fsum') || {}).innerText || ''; return /Bid \/ Estimate\s*\$12,500/i.test(t) ? t : null; }, null, 30000);
  ok(!!strip, 'the job\'s summary strip shows Bid / Estimate $12,500', await O.ev(() => (document.querySelector('#_gcJobDash .gcjt-fsum') || {}).innerText));
  // the customer signs it in the portal
  const before = await O.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return { contract: p.contract, status: p.status }; }, PID);
  H.cset('gc_sign_requests', [{ id: 'SR_' + e2.id, pid: PID, kind: 'estimate', refId: e2.id, title: 'Estimate — Brad roof proposal', amount: null, status: 'signed', createdAt: new Date(Date.now() - 3600e3).toISOString(),
    signed: { name: 'Test Customer', at: new Date().toISOString(), docRef: 'sb:crm-files/' + 'b'.repeat(64) + '.pdf', docName: 'Signed estimate.pdf', sigId: 'SIG1' } }]);
  await O.ev(() => window._gcAuto5.pull(true));
  const after = await waitFor(O, pid => { const p = window._crm.projects.find(x => x.id === pid); return p && +p.contract === 12500 ? { contract: p.contract, status: p.status, from: p.contractSetFrom, signedAt: p.contractSignedAt } : null; }, PID, 30000);
  ok(!(+before.contract > 0) && !!after && after.from && after.from.estId === e2.id && !!after.signedAt, 'signed in the portal → the job\'s contract is the estimate\'s total ($12,500)', { before, after });
  ok(!!after && /active/i.test(after.status), 'and the job is signed (active)', after && after.status);
  await openJob(O);
  const strip2 = await waitFor(O, () => { const t = (document.querySelector('#_gcJobDash .gcjt-fsum') || {}).innerText || ''; return /Contract\s*\$12,500/i.test(t) ? t : null; }, null, 30000);
  ok(!!strip2, 'the summary strip shows Contract $12,500', await O.ev(() => (document.querySelector('#_gcJobDash .gcjt-fsum') || {}).innerText));
  // the menu: this job's estimates and 📘 Templates
  await menuUp();
  ok(await O.ev(id => !!document.querySelector('#gceu-menu [data-eu="est"][data-id="' + id + '"]'), e2.id), 'the menu lists this job\'s estimates (each reopens its panel)');
  await pg.locator('#gceu-menu [data-eu="tpl"]').tap();
  const tplv = await waitFor(O, () => { let v = ''; try { v = localStorage.getItem('grayco_view'); } catch (e) {} return v === 'templates' ? { v, field: document.documentElement.classList.contains('_fieldmode') } : null; }, null, 10000);
  ok(!!tplv, '📘 Templates opens the estimate Templates screen (the desk\'s Templates view)', tplv);
  await pg.screenshot({ path: SHOTS + 'estupload_templates.png' });
  ok(await O.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1), 'no sideways scroll');
  ok(!O.errs.length, 'phone: no page errors', O.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await close();
console.log(`FIELDFILE + ESTUPLOAD ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
