// test_SUPPLY.mjs <build-dir> — patch SUPPLY (tools/patch_SUPPLY.py): the CRM's outside scripts are pinned and checked.
//   A. static: no floating / generated outside script is left in index.html (supabase-js "@2", esm.sh, jsdelivr "+esm", the cdnjs docx
//      404); /vendor/supabase-js-2.119.0.min.js is in the site and is the 2.119.0 UMD build; every SRI hash in the table is the hash
//      of the CDN file (GC_SUPPLY_CDN: verified copies of the CDN files — fetched from two CDNs, byte-identical); netlify.toml
//      publishes "." with no build command and blocks nothing under /vendor/; crm-push-sw.js has no fetch handler.
//   B. browser (offline: the CDN addresses answer with those copies; index.html is served with the site's _headers, CSP included):
//      the sign-in screen opens, window.supabase.createClient exists (from /vendor/), React / ReactDOM load with integrity, no SRI /
//      CSP message in the console; every pinned library loads through a dynamic <script> / <link> with integrity +
//      crossorigin="anonymous" added; the Word reader (__gcMammoth) reads a .docx made with the docx library; a changed file is refused.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WT = path.resolve(process.argv[2] || path.join(HERE, '../..'));
const CDNDIR = process.env.GC_SUPPLY_CDN || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/leadtxt/cdnfix';
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }
const sha384 = b => 'sha384-' + crypto.createHash('sha384').update(b).digest('base64');

const html = fs.readFileSync(path.join(WT, 'index.html'), 'utf8');
console.log('A. static');
const blk = html.slice(html.indexOf('__GC_PATCH_SUPPLY__'), html.indexOf('</script>', html.indexOf('__GC_PATCH_SUPPLY__')));
const SRI = {}; for (const m of blk.matchAll(/'(https:\/\/[^']+)': '(sha384-[A-Za-z0-9+/=]+)'/g)) SRI[m[1]] = m[2];
ok(Object.keys(SRI).length >= 17, 'the SRI table is in the page (' + Object.keys(SRI).length + ' files)');
ok(!/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2["'\/]/.test(html) && !/esm\.sh\//.test(html) && !/\/\+esm/.test(html) && !/cdnjs\.cloudflare\.com\/ajax\/libs\/docx\//.test(html), 'no floating supabase-js, no esm.sh / +esm import, no cdnjs docx link');
ok((html.match(/<script src="\/vendor\/supabase-js-2\.119\.0\.min\.js"><\/script>/g) || []).length === 1, 'one <script> for the self-hosted supabase-js');
const vend = fs.readFileSync(path.join(WT, 'vendor/supabase-js-2.119.0.min.js'));
ok(vend.length > 150000 && /^var supabase=\(function/.test(vend.slice(0, 40).toString()) && !/sourceMappingURL/.test(vend.toString()), 'vendor/supabase-js-2.119.0.min.js is the UMD build (' + vend.length + ' bytes), no source map link');
ok(sha384(vend) === 'sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O', 'its sha384 is the one jsdelivr, unpkg and the npm package give for 2.119.0 dist/umd/supabase.js', sha384(vend));
const toml = fs.readFileSync(path.join(WT, 'netlify.toml'), 'utf8');
ok(/^\s*publish\s*=\s*"\."\s*$/m.test(toml) && !/^\s*command\s*=/m.test(toml), 'netlify.toml: publish "." and no build command (files are served as they are)');
const blocked = [...toml.matchAll(/from\s*=\s*"([^"]+)"[^\[]*?status\s*=\s*(404|301|302)/g)].map(m => m[1]);
ok(!blocked.some(f => /^\/(\*|vendor)/.test(f)), 'no redirect hides /vendor/ on the CRM host', blocked);
const hdrs = fs.readFileSync(path.join(WT, '_headers'), 'utf8');
const site = hdrs.split(/\n(?=\S)/).find(s => /^\/\*\s*$/m.test(s.split('\n')[0])) || '';
const HDR = {}; site.split('\n').slice(1).forEach(l => { const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(l); if (m) HDR[m[1].toLowerCase()] = m[2].trim(); });
ok(HDR['content-security-policy'] && !/script-src|default-src/.test(HDR['content-security-policy']), 'the site CSP limits frames / objects / base only (no script-src to update)', HDR['content-security-policy']);
const sw = fs.readFileSync(path.join(WT, 'crm-push-sw.js'), 'utf8');
ok(!/addEventListener\(\s*['"]fetch['"]/.test(sw) && !/caches\./.test(sw), 'crm-push-sw.js has no fetch handler and caches nothing (the /vendor/ file is fetched as usual)');
const FIX = {};
for (const u of Object.keys(SRI)) { const f = path.join(CDNDIR, u.replace(/^https:\/\//, '')); if (fs.existsSync(f)) FIX[u] = fs.readFileSync(f); }
ok(Object.keys(FIX).length === Object.keys(SRI).length, 'a verified copy of every CDN file (' + CDNDIR + ')', Object.keys(SRI).filter(u => !FIX[u]));
const bad = Object.keys(FIX).filter(u => sha384(FIX[u]) !== SRI[u]);
ok(!bad.length, 'every SRI hash is the sha384 of the CDN file', bad);
for (const m of html.matchAll(/<script src="(https:\/\/[^"]+)"([^>]*)>/g)) {
  if (/fonts\.googleapis|crm\.grayco-cs\.com\/website-form/.test(m[1])) continue;
  ok(SRI[m[1]] && m[2].indexOf('integrity="' + SRI[m[1]] + '"') >= 0 && /crossorigin="anonymous"/.test(m[2]), 'static tag ' + m[1].split('/').slice(-1)[0] + ': integrity + crossorigin="anonymous"', m[2]);
}

console.log('B. browser');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const ACAO = { 'access-control-allow-origin': '*' };
async function open(tamper){
  const b = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 860 } });
  const R = { msgs: [], errs: [], cdn: [], miss: [], b, ctx };
  await ctx.routeWebSocket(/.*/, () => {});
  await ctx.route('**/*', async r => {
    const u = new URL(r.request().url()), full = u.origin + u.pathname;
    if (u.host === 'app.local') {
      if (u.pathname.startsWith('/.netlify/functions/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(WT, p);
      if (f.startsWith(WT) && fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, body: fs.readFileSync(f), headers: Object.assign({ 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }, HDR) });
      return r.fulfill({ status: 404, body: '' });
    }
    if (FIX[full]) { R.cdn.push(full); let body = FIX[full]; if (tamper && tamper.test(full)) body = Buffer.concat([body, Buffer.from('\n/* changed */')]);
      return r.fulfill({ status: 200, body, headers: Object.assign({ 'content-type': /\.css$/.test(full) ? 'text/css' : 'application/javascript' }, ACAO) }); }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u.host)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (/supabase\.co$/.test(u.host)) return r.fulfill({ status: 401, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-headers': '*' }, ACAO), body: '{"message":"no session (test)"}' });
    R.miss.push(full); return r.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage(); R.page = page;
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') R.msgs.push(m.text()); });
  page.on('pageerror', e => R.errs.push(String(e && e.message || e)));
  return R;
}
const SRIERR = /integrity|Content Security Policy|Refused to (load|execute|apply)/i;
let R = await open();
try {
  await R.page.goto('http://app.local/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await R.page.waitForSelector('#gc-auth-email', { timeout: 90000 }).catch(() => {});
  const st = await R.page.evaluate(() => ({ email: !!document.getElementById('gc-auth-email'), pw: !!document.getElementById('gc-auth-password'), sb: !!(window.supabase && typeof window.supabase.createClient === 'function'),
    react: !!(window.React && window.React.version), rv: window.React && window.React.version, dom: !!window.ReactDOM,
    sbSrc: [].slice.call(document.scripts).filter(s => /supabase/.test(s.src)).map(s => s.src),
    rI: [].slice.call(document.scripts).filter(s => /cdnjs\.cloudflare\.com\/ajax\/libs\/react/.test(s.src)).map(s => [s.integrity.slice(0, 12), s.crossOrigin]) }));
  ok(st.email && st.pw, 'the sign-in screen opens', st);
  ok(st.sb, 'window.supabase.createClient exists', st);
  ok(st.sbSrc.length === 1 && st.sbSrc[0] === 'http://app.local/vendor/supabase-js-2.119.0.min.js', 'supabase-js comes from /vendor/ (no CDN request for it)', st.sbSrc);
  ok(st.react && st.rv === '18.3.1' && st.dom && st.rI.length === 2 && st.rI.every(x => x[0] === 'sha384-DGyLx' || x[0] === 'sha384-gTGxh') && st.rI.every(x => x[1] === 'anonymous'), 'React / ReactDOM 18.3.1 load with integrity', st);
  await R.page.waitForTimeout(2500);
  ok(!R.msgs.some(m => SRIERR.test(m)) && !R.errs.some(m => SRIERR.test(m)), 'no SRI / CSP message in the console', R.msgs.filter(m => SRIERR.test(m)));
  ok(!R.miss.some(u => /cdnjs|jsdelivr|unpkg|esm\.sh|skypack/.test(u)), 'no other CDN file was asked for at load', R.miss);
  /* every pinned library, the way the CRM loads them (a dynamic <script> / <link>) */
  const libs = Object.keys(SRI).filter(u => !/pdf\.worker/.test(u));
  const res = await R.page.evaluate(async (libs) => {
    const out = [];
    for (const u of libs) {
      const css = /\.css$/.test(u), el = document.createElement(css ? 'link' : 'script');
      if (css) { el.rel = 'stylesheet'; el.href = u; } else el.src = u;
      const r = await new Promise(res => { el.onload = () => res('load'); el.onerror = () => res('error'); document.head.appendChild(el); setTimeout(() => res('timeout'), 20000); });
      out.push({ u, r, integrity: el.integrity, co: el.crossOrigin });
    }
    out.globals = { pdfjsLib: !!window.pdfjsLib, JSZip: !!window.JSZip, mammoth: !!window.mammoth, jspdf: !!(window.jspdf && window.jspdf.jsPDF), html2pdf: !!window.html2pdf, XLSX: !!window.XLSX, PDFLib: !!window.PDFLib, docx: !!(window.docx && window.docx.Document), L: !!(window.L && window.L.map) };
    return { out, globals: out.globals };
  }, libs);
  const SRIs = SRI;
  for (const x of res.out) ok(x.r === 'load' && x.integrity === SRIs[x.u] && x.co === 'anonymous', 'loads with integrity: ' + x.u.replace(/^https:\/\//, ''), x);
  ok(Object.values(res.globals).every(Boolean), 'each library is there (pdf.js, JSZip, mammoth, jsPDF, html2pdf, SheetJS, pdf-lib, docx, Leaflet)', res.globals);
  /* the Word reader for the two former "+esm" imports, on a real .docx (made with the docx library) */
  const wr = await R.page.evaluate(async () => {
    const d = window.docx, doc = new d.Document({ sections: [{ children: [new d.Paragraph('Week 1: tear off and dry-in'), new d.Paragraph('Week 2: shingles')] }] });
    const blob = await d.Packer.toBlob(doc), ab = await blob.arrayBuffer();
    const m = await window.__gcMammoth(), m2 = await window.__gcMammoth();
    const t = await m.extractRawText({ arrayBuffer: ab });
    return { same: m === m2 && m === window.mammoth, text: t.value };
  });
  ok(wr.same && /Week 1: tear off and dry-in/.test(wr.text) && /Week 2: shingles/.test(wr.text), '__gcMammoth() reads a .docx (what the two +esm imports did)', wr);
  ok(!R.msgs.some(m => SRIERR.test(m)) && !R.errs.some(m => SRIERR.test(m)), 'still no SRI / CSP message', R.msgs.filter(m => SRIERR.test(m)));
} finally { await R.b.close(); }
/* a changed file is refused; __gcMammoth loads it fresh when nothing is there yet */
R = await open(/jszip|mammoth/);
try {
  await R.page.goto('http://app.local/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await R.page.waitForSelector('#gc-auth-email', { timeout: 90000 }).catch(() => {});
  const t = await R.page.evaluate(async () => {
    const el = document.createElement('script'); el.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    const r = await new Promise(res => { el.onload = () => res('load'); el.onerror = () => res('error'); document.head.appendChild(el); setTimeout(() => res('timeout'), 15000); });
    let mm = ''; try { await window.__gcMammoth(); mm = 'loaded'; } catch (e) { mm = String(e.message); }
    return { r, jszip: !!window.JSZip, mm };
  });
  await R.page.waitForTimeout(500);
  ok(t.r === 'error' && !t.jszip, 'a changed CDN file is refused (not run)', t);
  ok(/Could not load the Word reader/.test(t.mm), 'a changed Word reader: the caller gets an error (its old fallback runs)', t);
  ok(R.msgs.some(m => /integrity/i.test(m) && /jszip/.test(m)), 'the browser says why (integrity)', R.msgs.slice(-4));
} finally { await R.b.close(); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
