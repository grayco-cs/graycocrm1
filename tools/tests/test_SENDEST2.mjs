// test_SENDEST2.mjs <build-dir> — patch SENDEST2 (owner 11/20, iPhone Home Screen app).
//   A. 📤 Send estimate opens with "📎 Upload a PDF estimate" on top: a PDF from the phone → the job → stored in the CRM
//      (the exact bytes, fingerprinted) as the job's estimate document + a CRM estimate → the same send sheet; the send names
//      the same bytes; data-entry mode (server "paused") → nothing marked sent; a photo → a PDF, for a customer with no job.
//   B. In an emulated standalone iPhone (navigator.standalone) the send flow never opens a window: 👁 Preview, a blank
//      window written into, a blob: window — all show in the CRM's viewer, ‹ Back returns to the send sheet; one page only.
// Offline harness, made-up people / jobs / files only; nothing is sent anywhere.
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); } }
const build = path.resolve(process.argv[2] || process.cwd());
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const OUT = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const JSPDF = process.env.GC_JSPDF || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/combo/pdfcdn/x_jspdf-2.5.1/package/dist/jspdf.umd.min.js';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs').href);
const { computer, sleep, waitFor, cset, signIn, cloud } = H;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pdf = Buffer.from('%PDF-1.4\n% made-up test estimate for SENDEST2\n1 0 obj << /T (Demo upload) >> endobj\ntrailer << >>\n%%EOF\n', 'latin1');
/* a small made-up PNG (a gray 40x30 picture) */
import zlib from 'zlib';
function mkPng(w, h){ const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x99); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const png = mkPng(40, 30);

cloud.clear();
const iso = new Date().toISOString(), day = iso.slice(0, 10);
cset('projects', [{ id: 'PRJSE1', name: 'Demo Upload Job', autoPO: 'T777', client: 'Demo Una Uploader', clientEmail: 'una@example.com', clientPhone: '901-555-0177', address: '7 Test Way, Memphis, TN 38103',
  billingSameAsJob: true, preferredContact: 'email', pm: 'Wesley Johnson', status: 'bidding', type: 'Residential', created: day, createdAt: iso, savedAt: iso, updatedAt: iso }]);
cset('customers', [{ id: 'CUSSE2', name: 'Demo Nojob Customer', email: 'nojob@example.com', phone: '901-555-0188', mobile: '901-555-0188', address: '8 Test Way, Memphis, TN 38103', billingSameAsJob: true, preferredContact: 'email', created: day }]);
cset('estimates', []); cset('projectDocs', []); cset('leads', []);
const old = new Date(Date.now() - 3600e3).toISOString(); for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: old }));

const STANDALONE = `Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  (function(){ var mm = window.matchMedia; window.matchMedia = function(q){ var r = mm.call(window, q); if (/display-mode:\\s*standalone/.test(q)) return Object.assign(Object.create(r), { matches: true, media: q }); return r; }; })();`;
/* http://app.local is not a secure context in the harness (no crypto.subtle): a plain-JS SHA-256 stands in (test only) */
const SUBTLE = `if (!(window.crypto && crypto.subtle)) { (function(){
  function sha(buf){ var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var m=new Uint8Array(buf), l=m.length, n=((l+9+63)>>6)<<6, b=new Uint8Array(n); b.set(m); b[l]=0x80; var bits=l*8; for(var i=0;i<8;i++) b[n-1-i]=(i<4)?(bits>>>(8*i))&255:Math.floor(bits/Math.pow(2,8*i))&255;
    var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w=new Array(64), r=function(x,c){return (x>>>c)|(x<<(32-c));};
    for(var o=0;o<n;o+=64){ for(var j=0;j<16;j++) w[j]=(b[o+4*j]<<24)|(b[o+4*j+1]<<16)|(b[o+4*j+2]<<8)|b[o+4*j+3];
      for(j=16;j<64;j++){ var s0=r(w[j-15],7)^r(w[j-15],18)^(w[j-15]>>>3), s1=r(w[j-2],17)^r(w[j-2],19)^(w[j-2]>>>10); w[j]=(w[j-16]+s0+w[j-7]+s1)|0; }
      var a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for(j=0;j<64;j++){ var S1=r(e,6)^r(e,11)^r(e,25), ch=(e&f)^(~e&g), t1=(h+S1+ch+K[j]+w[j])|0, S0=r(a,2)^r(a,13)^r(a,22), mj=(a&bb)^(a&c)^(bb&c), t2=(S0+mj)|0; h=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0; }
      H[0]=(H[0]+a)|0;H[1]=(H[1]+bb)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0; }
    var out=new Uint8Array(32); for(i=0;i<8;i++){ out[4*i]=H[i]>>>24; out[4*i+1]=(H[i]>>>16)&255; out[4*i+2]=(H[i]>>>8)&255; out[4*i+3]=H[i]&255; } return out.buffer; }
  Object.defineProperty(Crypto.prototype, 'subtle', { configurable: true, get: function(){ return { digest: function(alg, data){ return Promise.resolve(sha(data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))); } }; } });
})(); }`;
const C = await computer('phone', { build, mobile: true, init: [STANDALONE, SUBTLE] });
const STORE = new Map(), FN = []; let paused = false; const pages = [];
C.ctx.on('page', pg => pages.push(pg.url()));
await C.ctx.route(u => /\/storage\/v1\/object\//.test(new URL(u).pathname), async r => {
  const req = r.request(), m = req.method(), p = new URL(req.url()).pathname.split('/').pop();
  const hd = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: hd });
  if (m === 'POST') { STORE.set(p, req.postDataBuffer()); return r.fulfill({ status: 200, headers: hd, contentType: 'application/json', body: '{"Key":"x"}' }); }
  const b = STORE.get(p); return b ? r.fulfill({ status: 200, headers: hd, contentType: 'application/pdf', body: b }) : r.fulfill({ status: 404, headers: hd, contentType: 'application/json', body: '{"error":"not found"}' });
});
await C.ctx.route(u => new URL(u).pathname.startsWith('/.netlify/functions/'), async r => {
  const req = r.request(), fn = new URL(req.url()).pathname.split('/').pop(); let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
  FN.push({ fn, body }); let out = { ok: true };
  if (fn === 'send-email' && body.mode === 'estimate') {
    const b = STORE.get(String(body.pdf && body.pdf.ref || '').replace('sb:crm-files/', ''));
    out = !b || sha(b) !== body.pdf.sha256 ? { ok: false, blocked: true } : (paused ? { ok: true, paused: true } : { ok: true, from: 'Wesley Johnson <wjohnson@grayco-cs.com>', held: false, sent: { id: 'es_' + FN.length, version: 1 } });
  } else if (fn === 'portal-sign') out = { ok: true, id: 'sr1', mailed: true };
  return r.fulfill({ status: out.blocked ? 409 : 200, contentType: 'application/json', body: JSON.stringify(out) });
});
await C.ctx.route(u => /jspdf\.umd\.min\.js/.test(u), r => r.fulfill({ path: JSPDF, contentType: 'text/javascript' }));
const p = C.page(); const LOGS = []; p.on('console', m => { if (/ESTPDF|error/i.test(m.text())) LOGS.push(m.text().slice(0, 300)); });
await signIn(C, 'wjohnson@grayco-cs.com', 9000);
await waitFor(C, () => !!(window._gcEstPdf && window._gcEstPdf.openNewPdf && window._crm && (window._crm.projects || []).some(x => x.id === 'PRJSE1')), null, 90000);
ok(await p.evaluate(() => window._gcEstPdf.standalone()), 'the page sees the Home Screen app (standalone)');

/* ── A. the new top of 📤 Send estimate ── */
await p.evaluate(() => window._gcEstPdf.openSend());
await p.waitForSelector('#gc-estpdf-pick [data-newpdf]', { timeout: 10000 });
const top = await p.evaluate(() => { const box = document.querySelector('#gc-estpdf-pick .gcep-box'), b = box.querySelector('[data-newpdf]'), q = box.querySelector('[data-q]'); return { first: box.children[1] === b, text: b.textContent, above: b.getBoundingClientRect().top < q.getBoundingClientRect().top }; });
ok(top.first && top.above && /Upload a PDF estimate/.test(top.text), '📎 Upload a PDF estimate is the first thing under the title, above the estimate search', top);
const clean = () => p.evaluate(() => { [...document.body.querySelectorAll('body > *')].forEach(el => { if (!el.classList.contains('gcep-ov') && el.id !== 'gc-viewer' && /WRONG SITE|All clear|tap to dismiss/i.test((el.textContent || '').slice(0, 300)) && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; }); });
await sleep(2500); await clean(); await p.screenshot({ path: path.join(OUT, 'sendest2_390.png') });
console.log('    screenshot: ' + path.join(OUT, 'sendest2_390.png'));
await p.click('#gc-estpdf-pick [data-newpdf]');
await p.waitForSelector('#gc-estpdf-newpdf [data-file]', { timeout: 5000 });
await p.click('#gc-estpdf-newpdf [data-go]'); await sleep(200);
ok(/Pick the estimate PDF/.test(await p.textContent('#gc-estpdf-newpdf [data-m]')), 'no file → it asks for the PDF (nothing saved)');
await p.setInputFiles('#gc-estpdf-newpdf [data-file]', { name: 'Una estimate.pdf', mimeType: 'application/pdf', buffer: pdf });
await p.fill('#gc-estpdf-newpdf [data-q]', 'T777');
await p.selectOption('#gc-estpdf-newpdf [data-t]', 'p:PRJSE1');
await p.fill('#gc-estpdf-newpdf [data-amt]', '4,321.50');
await sleep(300); await clean(); await p.screenshot({ path: path.join(OUT, 'sendest2_upload_390.png') });
ok((await p.inputValue('#gc-estpdf-newpdf [data-name]')) === 'Demo Upload Job', 'the estimate name comes from the job picked');
await p.click('#gc-estpdf-newpdf [data-go]');
await p.waitForSelector('#gc-estpdf-send [data-send], #gc-estpdf-prof, #gc-estpdf-newpdf .gcep-msg.bad', { timeout: 15000 }).catch(() => {});
const where = await p.evaluate(() => ({ send: !!document.querySelector('#gc-estpdf-send'), prof: (document.querySelector('#gc-estpdf-prof .sub') || {}).textContent, m: (document.querySelector('#gc-estpdf-newpdf [data-m]') || {}).textContent, ovs: [...document.querySelectorAll('.gcep-ov')].map(x => x.id) }));
ok(where.send, 'Continue → the send sheet', where);
if (!where.send) { console.log(JSON.stringify(where), LOGS.slice(-10)); await C.close(); process.exit(1); }
const h = sha(pdf);
const st = await p.evaluate(h => { const E = window._gcEstPdf, e = (window._crm.estimates || []).concat(E._S.est).find(x => x.sourceSha256 === h);
  const docs = (window._crm.projectDocs || []).concat(E._S.docs || []).filter(d => d.estimateId === (e && e.id));
  return { e: e && { id: e.id, pid: e.pid, ref: e.sourceRef, src: e.source, total: e.totalCharge, cs: e.customerSees, estin: e.estin && e.estin.state }, docs: docs.map(d => ({ cat: d.cat, ref: d.ref, pid: d.pid, src: d.source })), design: document.querySelector('#gc-estpdf-send [data-design]').value, to: document.querySelector('#gc-estpdf-send [data-to]').value }; }, h);
ok(STORE.has(h + '.pdf') && sha(STORE.get(h + '.pdf')) === h, 'the exact PDF bytes are stored in the CRM file storage (crm-files/<sha256>.pdf)');
ok(st.e && st.e.pid === 'PRJSE1' && st.e.ref === 'sb:crm-files/' + h + '.pdf' && st.e.src === 'upload' && st.e.total === 4321.5 && st.e.cs === 'pdf', 'a CRM estimate on the job, its source = the stored PDF, the amount, "Customer sees: My PDF"', st.e);
ok(st.e && st.e.estin === 'skipped', 'the proposal maker leaves it alone (the PDF IS the estimate)', st.e);
ok(st.docs.some(d => d.cat === 'Estimates' && d.pid === 'PRJSE1' && d.ref === st.e.ref), 'the PDF is on the job\'s Files & Docs → Estimates', st.docs);
ok(st.design === 'uploaded' && st.to === 'una@example.com', 'it continues into the same send sheet: PDF design = the uploaded PDF, To = the customer', st);

/* ── B. standalone: Preview stays in the app ── */
const before = pages.length;
await p.click('#gc-estpdf-send [data-dprev]');
await p.waitForSelector('#gc-viewer', { timeout: 10000 }); await sleep(500);
ok(pages.length === before && C.ctx.pages().length === 1, '👁 Preview opens no window (no blank black page) — one page only', { pages, n: C.ctx.pages().length });
ok(await p.evaluate(() => !!document.querySelector('#gc-viewer [data-gv="back"]') && /Preview/.test(document.querySelector('#gc-viewer .gv-bar b').textContent)), 'the PDF shows in the CRM\'s viewer with ‹ Back');
await p.locator('#gc-viewer button:visible', { hasText: /Back/ }).first().click(); await sleep(300);   /* the phone's app header ‹ Back (or the viewer's own) */
ok(await p.evaluate(() => !document.querySelector('#gc-viewer') && !!document.querySelector('#gc-estpdf-send [data-send]')), '‹ Back closes the viewer — back on the send sheet');
const gen = await p.evaluate(async () => {
  const w = window.open('', '_blank'); w.document.open(); w.document.write('<html><head><title>Demo paper</title></head><body><h1>Demo paper</h1></body></html>'); w.document.close();
  await new Promise(r => setTimeout(r, 300)); const a = !!document.querySelector('#gc-viewer') && /Demo paper/.test(document.querySelector('#gc-viewer .gv-bar b').textContent);
  window._gcViewer.close();
  const u = URL.createObjectURL(new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' })); window.open(u, '_blank'); await new Promise(r => setTimeout(r, 300)); const b = !!document.querySelector('#gc-viewer');
  window._gcViewer.close(); return { a, b, inApp: window._gcEstPdf._S.inApp };
});
ok(gen.a && gen.b && C.ctx.pages().length === 1, 'standalone: a blank window written into, and a blob: window, show in the viewer — no new window', gen);

/* ── the send: same bytes; data-entry mode → not sent ── */
paused = true;
await p.click('#gc-estpdf-send [data-send]');
await waitFor(C, () => /Data-entry mode/.test((document.querySelector('#gc-estpdf-send [data-m]') || {}).textContent || ''), null, 20000);
const call1 = FN.filter(x => x.fn === 'send-email' && x.body.mode === 'estimate').pop();
ok(call1 && call1.body.pdf.sha256 === h && call1.body.pid === 'PRJSE1', 'the send names the uploaded PDF (same fingerprint) on the job', call1 && call1.body.pdf);
const pz = await p.evaluate(id => { const e = window._gcEstPdf._S.est.concat(window._crm.estimates || []).filter(x => x.id === id).pop(); return { sent: (e && e.sentPdfs || []).length, st: e && e.status }; }, st.e.id);
ok(pz.sent === 0 && !/sent/i.test(pz.st), 'data-entry mode on (server paused) → shown, nothing marked sent', pz);
paused = false;
await p.click('#gc-estpdf-send [data-send]');
await waitFor(C, () => /Sent to/.test((document.querySelector('#gc-estpdf-send [data-m]') || {}).textContent || '') || !document.querySelector('#gc-estpdf-send'), null, 20000);
const sentSt = await p.evaluate(id => { const E = window._gcEstPdf, e = E._S.est.concat(window._crm.estimates || []).filter(x => x.id === id).pop(); const all = {}; (window._crm.projectDocs || []).concat(window._gcProjectDocs || [], E._S.docs || []).forEach(d => { if (d && d.estimateId === id) all[d.id] = Object.assign({}, all[d.id] || {}, d); }); const docs = Object.values(all).filter(d => !d.supersededBy); return { v: (e && e.sentPdfs || []).map(x => x.sha256), docs: docs.map(d => d.source) }; }, st.e.id);
ok(sentSt.v.length === 1 && sentSt.v[0] === h, 'sent: v1 is the uploaded PDF', sentSt);
ok(sentSt.docs.length === 1 && sentSt.docs[0] === 'estimate-sent', 'one entry on the job for that PDF (the upload copy is folded into the sent v1)', sentSt.docs);

/* ── a photo, a customer with no job yet ── */
await p.evaluate(() => document.querySelectorAll('.gcep-ov').forEach(x => x.remove()));
await p.evaluate(() => window._gcEstPdf.openNewPdf({}));
await p.waitForSelector('#gc-estpdf-newpdf [data-file]', { timeout: 5000 });
await p.setInputFiles('#gc-estpdf-newpdf [data-file]', { name: 'photo.png', mimeType: 'image/png', buffer: png });
await p.fill('#gc-estpdf-newpdf [data-q]', 'Nojob');
await p.selectOption('#gc-estpdf-newpdf [data-t]', 'c:CUSSE2');
await p.click('#gc-estpdf-newpdf [data-go]');
await waitFor(C, () => !document.querySelector('#gc-estpdf-newpdf') && !!document.querySelector('#gc-estpdf-send [data-send], #gc-estpdf-prof'), null, 20000);
const ph = await p.evaluate(() => { const e = window._gcEstPdf._S.est.find(x => x.customerId === 'CUSSE2'); return !e ? { none: true, m: (document.querySelector('#gc-estpdf-newpdf [data-m]') || {}).textContent, ovs: [...document.querySelectorAll('.gcep-ov')].map(x => x.id) } : { pid: e.pid, ref: e.sourceRef, client: e.client, to: (document.querySelector('#gc-estpdf-send [data-to]') || {}).value }; });
const phRef = ph && String(ph.ref).replace('sb:crm-files/', ''), phB = phRef && STORE.get(phRef);
ok(ph && !ph.pid && ph.client === 'Demo Nojob Customer' && phB && phB.slice(0, 5).toString() === '%PDF-', 'a photo for a customer with no job → made into a PDF, stored, an estimate for that customer', ph);
ok(ph && ph.to === 'nojob@example.com', '… and on to the send sheet, To = the customer', ph);
ok(C.ctx.pages().length === 1 && pages.length === 0, 'the whole flow: never a second window', pages);
const errs = (C.errs || []).filter(e => !/favicon|net::|Failed to load resource|ERR_/i.test(String(e)));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await C.close();
console.log('\nSENDEST2: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
