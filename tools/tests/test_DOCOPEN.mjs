// test_DOCOPEN.mjs <build-dir> — patch DOCOPEN (owner 11/03, iPhone): a document opens as a page inside the CRM — ‹ Back,
//   ⬇️ Download, 📤 Share — never a pop-up, never about:blank. Phone 390x844, iPhone UA, touch, the owner signed in, a real
//   job from the real-data mirror (GC_MIRROR) in the offline harness (GC_HARNESS); the mirror has no file bytes, so the
//   job gets test files: a PDF and a .docx in the file store, and an older .docx kept inside the record (data:).
//   pdf.js / mammoth come from the local copies in GC_LIBS (npm pdfjs-dist 3.11.174 / mammoth 1.6.0, the versions the CRM
//   loads from cdnjs). Checks: Field → job → 📄 Documents → each file opens in the viewer (PDF pages drawn, Word text
//   shown), no window.open and no new tab; ‹ Back and history.back() return to the list; Download / Share hand over the
//   file; a job paper (Scope of Work) opens in the viewer with 🖨 Print; a desk file link (_gcOpenRef) and a generated
//   document (_gcOpenDocHTML) too.
// Usage: node test_DOCOPEN.mjs <dir with index.html>
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const LIBS = process.env.GC_LIBS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/libs';
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/ff/';
const build = process.argv[2];
if (!build) { console.error('usage: node test_DOCOPEN.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
fs.mkdirSync(SHOTS, { recursive: true });
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(html.includes('__GC_PATCH_DOCOPEN__'), 'DOCOPEN is in the page');

/* ── test files ── */
function pdf(lines){
  const content = 'BT /F1 18 Tf 50 750 Td ' + lines.map((l, i) => (i ? '0 -24 Td ' : '') + '(' + l.replace(/([()\\])/g, '\\$1') + ') Tj').join(' ') + ' ET';
  const comp = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>', null, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let out = Buffer.from('%PDF-1.4\n', 'latin1'); const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); const head = Buffer.from((i + 1) + ' 0 obj\n', 'latin1'); out = Buffer.concat([out, head, o ? Buffer.from(o + '\nendobj\n', 'latin1') : Buffer.concat([Buffer.from('<</Length ' + comp.length + '/Filter/FlateDecode>>\nstream\n', 'latin1'), comp, Buffer.from('\nendstream\nendobj\n', 'latin1')])]); });
  const xref = out.length; let x = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.concat([out, Buffer.from(x + 'trailer<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF', 'latin1')]);
}
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xFFFFFFFF; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }; })();
function zip(files){   /* a stored (no compression) zip */
  const parts = [], cen = []; let off = 0;
  for (const [name, txt] of files) {
    const data = Buffer.from(txt, 'utf8'), nm = Buffer.from(name, 'utf8'), crc = CRC(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nm, data); cen.push(c, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
function docx(paras){
  return zip([['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paras.map(p => '<w:p><w:r><w:t>' + p + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>']]);
}
const PDF = pdf(['GrayCo test proposal', 'Potts flooring PDF page']), DOCX = docx(['GrayCo Proposal', 'Potts flooring scope: install LVP in the kitchen.']), DOCX2 = docx(['Older copy', 'Kept inside the record.']);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const FILES = { [sha(PDF) + '.pdf']: PDF, [sha(DOCX) + '.docx']: DOCX };
const DOCX_T = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const H = await import(pathToFileURL(HARNESS).href);
const { sleep, waitFor } = H;
H.resetCloud();
const M = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
for (const r of M) if (r && r.key && !/^_probe/.test(r.key)) H.cset(r.key, r.v !== undefined ? r.v : r.value);
let P0 = H.cget('projects'); if (typeof P0 === 'string') P0 = JSON.parse(P0);
const JOB = (P0 || []).find(p => p && p.id && /^active$/i.test(p.status || '') && p.address && !p.deleted);
ok(!!JOB, 'fixture: a real job from the mirror', JOB && { id: JOB.id, name: JOB.name });
const PID = JOB.id, at = new Date().toISOString();
let PD = H.cget('projectDocs'); if (typeof PD === 'string') PD = JSON.parse(PD);
H.cset('projectDocs', (Array.isArray(PD) ? PD : []).concat([
  { id: 'TDOC_PDF', pid: PID, name: 'Potts proposal.pdf', cat: 'Contracts', type: 'application/pdf', ref: 'sb:crm-files/' + sha(PDF) + '.pdf', uploadedAt: at, uploaded: at.slice(0, 10) },
  { id: 'TDOC_DOCX', pid: PID, name: 'GrayCo_Proposal_Potts_Flooring.docx', cat: 'document', type: DOCX_T, ref: 'sb:crm-files/' + sha(DOCX) + '.docx', portalShare: true, uploadedAt: at, uploaded: at.slice(0, 10) },
  { id: 'TDOC_OLD', pid: PID, name: 'Older proposal.docx', fileName: 'Older proposal.docx', cat: 'document', type: DOCX_T, data: 'data:' + DOCX_T + ';base64,' + DOCX2.toString('base64'), uploadedAt: at, uploaded: at.slice(0, 10) }]));

const W = [];
try {
  const O = await H.computer('OWN', { build, mobile: true }); W.push(O);
  await O.ctx.route(u => /\/storage\/v1\/object\//.test(String(u)), async r => {
    const u = new URL(r.request().url()), name = u.pathname.split('/').pop(), b = FILES[name];
    if (r.request().method() === 'GET' && b) return r.fulfill({ status: 200, body: b, headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' } });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
  });
  await O.ctx.route(u => /cdnjs\.cloudflare\.com\/ajax\/libs\/(pdf\.js|mammoth)\//.test(String(u)), async r => {
    const u = String(r.request().url()), f = /mammoth/.test(u) ? LIBS + '/m/package/mammoth.browser.min.js' : /worker/.test(u) ? LIBS + '/p/package/build/pdf.worker.min.js' : LIBS + '/p/package/build/pdf.min.js';
    return r.fulfill({ path: f, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  await O.ctx.addInitScript(() => { window.__opens = []; const o = window.open; window.open = function(){ window.__opens.push([...arguments].map(String).join(' | ')); return o.apply(this, arguments); }; });
  const newPages = () => O.pages.filter(p => !p.isClosed()).length - 1;
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await waitFor(O, () => !!document.querySelector('#_gcJobPick.gc-fh') && ((window._crm && window._crm.projects) || []).length > 0 && !!window._gcViewer, null, 90000)), 'the phone opens in GrayCo Field');
  await sleep(2500);
  const pg = O.page();
  await O.ev(pid => { document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._gcJobDashboard(pid); }, PID); await sleep(1200);
  await pg.locator('#_gcJobDash ._jdAct[data-fn="docs"]').first().tap();
  ok(!!(await waitFor(O, () => document.querySelectorAll('.gcfp-docs .gcfp-doc[data-k="doc"]').length >= 3, null, 20000)), 'Field 📄 Documents lists the job\'s files');
  const listUp = () => O.ev(() => !document.getElementById('gc-viewer') && !!document.querySelector('.gcfp-docs .gcfp-doc'));
  const viewer = () => O.ev(() => { const v = document.getElementById('gc-viewer'); if (!v) return null; const b = v.querySelector('.gv-bar'), r = b.getBoundingClientRect(), back = v.querySelector('[data-gv="back"]').getBoundingClientRect(); return { name: b.querySelector('b').textContent, top: Math.round(r.top), backH: Math.round(back.height), backW: Math.round(back.width), btns: [...v.querySelectorAll('.gv-bar .gv-b')].filter(x => !x.hidden).map(x => x.textContent.trim()), body: v.querySelector('[data-gv-body]').innerText.slice(0, 200), imgs: v.querySelectorAll('img.gv-page').length, frame: !!v.querySelector('iframe') }; });

  /* 1. the .docx from the file store (the owner's file) */
  await pg.locator('.gcfp-docs .gcfp-doc[data-id="TDOC_DOCX"]').tap();
  await waitFor(O, () => { const f = document.querySelector('#gc-viewer iframe'); return !!(f && /Potts flooring scope/.test(f.srcdoc || '')); }, null, 20000);
  let v = await viewer();
  const docTxt = await O.ev(() => (document.querySelector('#gc-viewer iframe') || {}).srcdoc || '');
  ok(!!v && /GrayCo_Proposal_Potts_Flooring\.docx/.test(v.name) && /Potts flooring scope: install LVP/.test(docTxt), 'the .docx opens as a page in the CRM, its text readable (no about:blank)', { v, docTxt: docTxt.slice(-200) });
  ok(!!v && ['‹ Back', '⬇️ Download', '📤 Share'].every(b => v.btns.includes(b)) && v.top <= 1 && v.backH >= 44 && v.backW >= 44, 'the top bar: ‹ Back (44 px+), the name, ⬇️ Download, 📤 Share', v);
  ok((await O.ev(() => window.__opens.length)) === 0 && newPages() === 0, 'no window.open, no new tab', await O.ev(() => window.__opens));
  await pg.screenshot({ path: SHOTS + 'docopen_docx.png' });
  const dl = pg.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await pg.locator('#gc-viewer [data-gv="dl"]').tap();
  const d1 = await dl;
  ok(!!d1 && d1.suggestedFilename() === 'GrayCo_Proposal_Potts_Flooring.docx', '⬇️ Download saves the file under its name', d1 && d1.suggestedFilename());
  await O.ev(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = d => { window.__shared = { n: d.files[0].name, t: d.files[0].type, sz: d.files[0].size }; return Promise.resolve(); }; });
  await pg.locator('#gc-viewer [data-gv="share"]').tap(); await sleep(400);
  const sh = await O.ev(() => window.__shared);
  ok(!!sh && sh.n === 'GrayCo_Proposal_Potts_Flooring.docx' && sh.t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && sh.sz === DOCX.length, '📤 Share hands the file itself to the phone\'s share sheet', sh);
  await pg.locator('#gc-viewer [data-gv="back"]').tap(); await sleep(500);
  ok(await listUp(), '‹ Back → back on the Documents list');

  /* 2. the PDF: pages drawn in the page */
  await pg.locator('.gcfp-docs .gcfp-doc[data-id="TDOC_PDF"]').tap();
  await waitFor(O, () => document.querySelectorAll('#gc-viewer img.gv-page').length > 0, null, 25000);
  v = await viewer();
  ok(!!v && v.imgs === 1 && /Potts proposal\.pdf/.test(v.name), 'the PDF opens as a page — its page drawn as a picture (pdf.js)', v);
  await pg.screenshot({ path: SHOTS + 'docopen_pdf.png' });
  await O.ev(() => history.back()); await sleep(1200);
  ok(await listUp(), 'the phone\'s Back (history.back) → back on the Documents list', await viewer());

  /* 3. an older file kept inside the record (data:) */
  await pg.locator('.gcfp-docs .gcfp-doc[data-id="TDOC_OLD"]').tap();
  await waitFor(O, () => { const f = document.querySelector('#gc-viewer iframe'); return !!(f && /Kept inside the record/.test(f.srcdoc || '')); }, null, 20000);
  ok(!!(await O.ev(() => /Kept inside the record/.test((document.querySelector('#gc-viewer iframe') || {}).srcdoc || ''))), 'an older in-record .docx opens the same way');
  await pg.locator('#gc-viewer [data-gv="back"]').tap(); await sleep(400);
  ok(await listUp(), '… and ‹ Back returns');

  /* 4. a job paper (Scope of Work) */
  const paper = await O.ev(pid => { const L = window._gcDocLib, b = (L && L.builtins && L.builtins()) || []; const t = b.find(x => /scope of work/i.test(x.name)) || b[0]; if (!t) return null; L.open(t.id || t.file, pid); return t.name; }, PID);
  await waitFor(O, () => { const f = document.querySelector('#gc-viewer iframe'); return !!(f && f.srcdoc && f.srcdoc.length > 500); }, null, 15000);
  v = await viewer();
  ok(!!paper && !!v && v.frame && v.btns.includes('🖨 Print') && v.btns.includes('‹ Back'), 'a job paper (' + paper + ') opens in the viewer, filled in, with 🖨 Print and ‹ Back', v);
  await pg.screenshot({ path: SHOTS + 'docopen_paper.png' });
  await O.ev(() => history.back()); await sleep(1200);
  ok(!(await O.ev(() => !!document.getElementById('gc-viewer'))), 'Back closes the paper too');

  /* 5. a desk file link and a generated document */
  await O.ev(r => window._gcOpenRef(r, 'Potts proposal.pdf'), 'sb:crm-files/' + sha(PDF) + '.pdf');
  ok(!!(await waitFor(O, () => document.querySelectorAll('#gc-viewer img.gv-page').length > 0, null, 20000)), 'a file link anywhere in the CRM (_gcOpenRef) opens in the viewer');
  await O.ev(() => document.querySelector('#gc-viewer [data-gv="back"]').click());
  await O.ev(() => window._gcOpenDocHTML('<!doctype html><html><head><title>Invoice 1001</title></head><body><h1>Invoice 1001</h1></body></html>'));
  await waitFor(O, () => !!document.querySelector('#gc-viewer iframe'), null, 10000);
  v = await viewer();
  ok(!!v && /Invoice 1001/.test(v.name) && v.frame, 'a generated document (_gcOpenDocHTML) opens in the viewer', v);
  await O.ev(() => document.querySelector('#gc-viewer [data-gv="back"]').click());
  ok((await O.ev(() => window.__opens.length)) === 0 && newPages() === 0, 'through all of it: no window.open, no new tab', await O.ev(() => window.__opens));
  ok(await O.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1), 'no sideways scroll');
  ok(!O.errs.length, 'no page errors', O.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const c of W) await c.b.close().catch(() => {});
console.log(`DOCOPEN ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
