// node tools/printpack/rebuild.mjs <printdir> <outdir> "<company address>"   (patch ADDRALL)
// Prints every HTML print version (<printdir>/<slug>.html) to <outdir>/<slug>.pdf with the given company address —
// the same page size, page count and order as the PDF it replaces (checked against <printdir>/manifest.json).
// tools/printpack/rebuild.sh runs it, then sets the PRINTSHOP trim / bleed boxes, the thumbnails and the manifest.
const { chromium } = await import(process.env.PLAYWRIGHT_MJS || 'playwright');
import path from 'path';
import fs from 'fs';

const [dir, out, address] = process.argv.slice(2);
if (!dir || !out || !address) { console.error('usage: node rebuild.mjs <printdir> <outdir> "<company address>"'); process.exit(2); }
const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
let bad = 0;
for (const [slug, p] of Object.entries(man.pieces || {})) {
  if (only && !only.includes(slug)) continue;
  const f = path.resolve(dir, p.html || slug + '.html');
  if (!fs.existsSync(f)) { console.log(slug, 'MISSING', f); bad++; continue; }
  await page.goto('file://' + f);
  await page.evaluate((a) => {
    try { window._gcCompanyAddress && window._gcCompanyAddress.set({ current: a, next: '', switchOn: '' }); } catch (e) {}
    document.querySelectorAll('[data-gc-addr]').forEach(e => { e.textContent = a; });
  }, address);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  const o = path.join(out, slug + '.pdf');
  await page.pdf({ path: o, width: p.width_in + 'in', height: p.height_in + 'in', printBackground: true, preferCSSPageSize: true });
  const n = await page.evaluate(() => document.querySelectorAll('.sheet').length);
  const shown = await page.evaluate(() => { const e = document.querySelector('.sheet [data-gc-addr]'); return e ? e.textContent.trim() : ''; });
  const ok = n === p.pages && shown === address;
  if (!ok) bad++;
  console.log(slug, p.width_in + 'x' + p.height_in, 'pages=' + n + '/' + p.pages, ok ? 'ok' : 'CHECK (address shown: ' + shown + ')');
}
await browser.close();
process.exit(bad ? 1 : 0);
