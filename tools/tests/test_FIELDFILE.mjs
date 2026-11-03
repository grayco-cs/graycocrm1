// test_FIELDFILE.mjs <build-dir> — patch FIELDFILE (owner 11/03, iPhone, Field): 📷 Add Photo/File on a job opens the phone's
//   picker (camera / library / files); a FILE (PDF…) is stored on that job's Documents and the job page stays on the
//   screen — the dark Job Info sheet is NOT opened (the bug: "Tried to add a file and it went to this dark page");
//   a PHOTO goes to GrayCo Photos as before. The 📋 Job Info tile still opens its (dark, as designed) sheet.
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
const STORE = []; const W = [];
async function fakeFiles(c){
  /* the private file bucket: uploads are recorded, nothing leaves the test */
  await c.ctx.route(u => /\/storage\/v1\/object\//.test(String(u)), async r => {
    const q = r.request(); if (q.method() === 'POST' || q.method() === 'PUT') STORE.push({ path: new URL(q.url()).pathname, type: q.headers()['content-type'], size: (q.postDataBuffer() || Buffer.alloc(0)).length });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: 'ok' }) });
  });
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
  ok(await O.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1), 'no sideways scroll');
  ok(!O.errs.length, 'phone: no page errors', O.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await close();
console.log(`FIELDFILE ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
