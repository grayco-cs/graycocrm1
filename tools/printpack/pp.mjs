// node pp.mjs <srcdir> <outdir>  — renders the GrayCo print pack PDFs (OFFICE + PRINTSHOP variants)
// patch ADDRALL: with HTML_OUT=<dir> it also writes the HTML print version of every PDF (<dir>/<slug>.html: the same
// pages, @page size, page order and bleed / crop marks, with the company address as <span data-gc-addr> filled in at
// load by /gc-address.js), and with MANIFEST=<file> it records what each PDF holds (pages, size, the address baked in).
const { chromium } = await import(process.env.PLAYWRIGHT_MJS || 'playwright');
import path from 'path';
import fs from 'fs';
import { printHtml } from './printhtml.mjs';
const [src, out] = process.argv.slice(2);
// [output slug, source html, mode, trim w, trim h]
const JOBS = [];
for (const b of ['general', 'roofing', 'residential', 'commercial', 'insurance-restoration']) {
  JOBS.push(['brochure-' + b, 'brochure-' + b, 'office', 11, 8.5]);
  JOBS.push(['brochure-' + b + '-printshop', 'brochure-' + b, 'bleed', 11, 8.5]);
}
JOBS.push(['flyer-general', 'flyer-general-2up-letter', 'office', 11, 8.5, 0.94]);
JOBS.push(['flyer-general-printshop', 'flyer-general', 'bleed', 5.5, 8.5]);
JOBS.push(['door-hanger', 'door-hanger-2up-letter', 'office', 8.5, 11, 0.94]);
JOBS.push(['door-hanger-printshop', 'door-hanger', 'bleed', 4.25, 11]);
for (const f of ['expect-first-day', 'expect-insurance-claim-timeline', 'expect-after-your-project', 'scorecard-customer', 'scorecard-closeout-pm', 'checks-and-balances-sheet'])
  JOBS.push([f, f, 'office', 8.5, 11, 0.95]);

const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const HTML_OUT = process.env.HTML_OUT || '', MANIFEST = process.env.MANIFEST || '';
const manifest = { pieces: {} };
if (MANIFEST) { try { Object.assign(manifest, JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))); } catch (e) {} }
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [slug, file, mode, w, h, scale] of JOBS) {
  if (only && !only.includes(slug)) continue;
  await page.goto('file://' + path.resolve(src, file + '.html'));
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  const rep = await page.evaluate(({ mode, w, h, scale }) => {
    const notes = [];
    // OFFICE pieces: shrink each piece about its centre so a desk printer's ~0.2in unprintable edge cuts nothing
    if (scale) document.querySelectorAll('.sheet').forEach(s => { [...s.children].forEach(c => { c.style.transform = 'scale(' + scale + ')'; c.style.transformOrigin = '50% 50%'; }); s.style.background = '#fff'; });
    const sheets = [...document.querySelectorAll('.sheet')];
    sheets.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      if (Math.abs(r.width / 96 - w) > 0.01 || Math.abs(r.height / 96 - h) > 0.01) notes.push('sheet' + i + ' size ' + r.width / 96 + 'x' + r.height / 96);
      if (s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1) notes.push('sheet' + i + ' overflows');
      s.querySelectorAll('.panel,[data-fit],.pg,.fly,.hang').forEach(p => { if (p.scrollHeight > p.clientHeight + 1) notes.push('panel overflow: ' + p.className); });
      // text that a desk printer (≈0.2in hardware margin) could clip
      const safe = (mode === 'bleed' ? 0.125 : 0.2) * 96;
      const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      let n; while ((n = walker.nextNode())) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (q.width < 1) continue;
          if (q.left - r.left < safe || r.right - q.right < safe || q.top - r.top < safe || r.bottom - q.bottom < safe) { notes.push('EDGE: "' + n.textContent.trim().slice(0, 30) + '"'); break; }
        }
      }
    });
    if (mode !== 'bleed') return notes;
    const B = 12; // 0.125in at 96 px/in
    const st = document.createElement('style');
    st.textContent = '@page{size:' + (w + 0.25) + 'in ' + (h + 0.25) + 'in;margin:0}html,body{background:#fff!important}' +
      '.bpage{position:relative;overflow:hidden;background:#fff;break-after:page;page-break-after:always}.bpage:last-child{break-after:auto;page-break-after:auto}' +
      '.bpage>.sheet{position:absolute;left:' + B + 'px;top:' + B + 'px;margin:0!important;box-shadow:none!important;break-after:auto!important;page-break-after:auto!important}' +
      '.bext,.crop{position:absolute}.crop{background:#000;box-shadow:0 0 0 .6px #fff}';
    document.head.appendChild(st);
    sheets.forEach(s => {
      const sr = s.getBoundingClientRect(), W = sr.width, H = sr.height;
      const ext = [];
      s.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        const bgc = cs.backgroundColor, bgi = cs.backgroundImage;
        const has = (bgc && bgc !== 'rgba(0, 0, 0, 0)' && bgc !== 'rgb(255, 255, 255)') || (bgi && bgi !== 'none');
        if (!has || el.tagName === 'IMG') return;
        const r = el.getBoundingClientRect();
        let x0 = r.left - sr.left, y0 = r.top - sr.top, x1 = r.right - sr.left, y1 = r.bottom - sr.top;
        const L = x0 <= 0.5, R = x1 >= W - 0.5, T = y0 <= 0.5, Bo = y1 >= H - 0.5;
        if (!(L || R || T || Bo)) return;
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
        if (x1 - x0 < 1 || y1 - y0 < 1) return;
        ext.push({ x: (L ? 0 : x0 + B), y: (T ? 0 : y0 + B), w: (R ? W + 2 * B : x1 + B) - (L ? 0 : x0 + B), h: (Bo ? H + 2 * B : y1 + B) - (T ? 0 : y0 + B), bgc, bgi });
      });
      const wrap = document.createElement('div'); wrap.className = 'bpage';
      wrap.style.width = (W + 2 * B) + 'px'; wrap.style.height = (H + 2 * B) + 'px';
      s.parentNode.insertBefore(wrap, s);
      ext.forEach(e => { const d = document.createElement('div'); d.className = 'bext'; Object.assign(d.style, { left: e.x + 'px', top: e.y + 'px', width: e.w + 'px', height: e.h + 'px', backgroundColor: e.bgc, backgroundImage: e.bgi, backgroundSize: '100% 100%' }); wrap.appendChild(d); });
      wrap.appendChild(s);
      // crop marks: in the bleed zone, on the trim lines, stopping 2px short of the trim box
      const len = B - 3, t = 0.75;
      const marks = [];
      for (const x of [B, W + B]) { marks.push([x - t / 2, 0, t, len]); marks.push([x - t / 2, H + 2 * B - len, t, len]); }
      for (const y of [B, H + B]) { marks.push([0, y - t / 2, len, t]); marks.push([W + 2 * B - len, y - t / 2, len, t]); }
      marks.forEach(m => { const d = document.createElement('div'); d.className = 'crop'; Object.assign(d.style, { left: m[0] + 'px', top: m[1] + 'px', width: m[2] + 'px', height: m[3] + 'px' }); wrap.appendChild(d); });
    });
    return notes;
  }, { mode, w, h, scale });
  const pw = mode === 'bleed' ? w + 0.25 : w, ph = mode === 'bleed' ? h + 0.25 : h;
  const baked = await page.evaluate(() => { const e = document.querySelector('[data-gc-addr]'); return e ? e.textContent.trim() : ''; });
  if (HTML_OUT) { fs.mkdirSync(HTML_OUT, { recursive: true }); fs.writeFileSync(path.join(HTML_OUT, slug + '.html'), printHtml(await page.content(), { slug, w: pw, h: ph, mode })); }
  const o = path.join(out, slug + '.pdf');
  await page.pdf({ path: o, width: pw + 'in', height: ph + 'in', printBackground: true, preferCSSPageSize: true });
  const n = await page.evaluate(() => document.querySelectorAll('.sheet').length);
  manifest.pieces[slug] = { pdf: slug + '.pdf', html: slug + '.html', pages: n, width_in: pw, height_in: ph, mode };
  if (baked) manifest.address = baked;
  console.log(slug, mode, pw + 'x' + ph, 'sheets=' + n, rep.length ? 'NOTES: ' + [...new Set(rep)].slice(0, 8).join(' | ') : 'ok');
}
await browser.close();
if (MANIFEST) { manifest.builtAt = new Date().toISOString(); fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n'); }
