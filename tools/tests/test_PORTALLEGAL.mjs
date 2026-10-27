// test_PORTALLEGAL.mjs <build-dir> — patch PORTALLEGAL: the customer portal never shows the sub portal's legal papers.
// 1) legal2.js: linksHtml default / 'customer' = customer papers only; 'sub' = the sub papers; the sign-in notes.
// 2) portal.html in a browser (offline harness): footer + sign-in screen have no "Sub Portal" / sub-terms / sub-privacy.
// 3) the bid / sub sign-in (boot({ bid: true })) keeps its own sub papers.
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_PORTALLEGAL.mjs <dir with portal.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const SUBRE = /Sub Portal|sub-terms|sub-privacy|subcontractor portal|bids\.grayco/i;

/* 1) the library, all three copies */
for (const f of ['legal2.js', 'subportal/legal2.js', 'subportal-app/public/legal2.js']) {
  const ctx = { window: {}, document: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(build, f), 'utf8'), ctx);
  const L = ctx.GCLegal;
  const cust = L.linksHtml(''), cust2 = L.linksHtml('', 'customer'), sub = L.linksHtml('', 'sub');
  ok(!SUBRE.test(cust) && !SUBRE.test(cust2) && /Customer Portal Terms of Use/.test(cust) && /Privacy/.test(cust) && /E-SIGN/.test(cust), f + ': customer links = Customer Portal Terms · Privacy · E-SIGN only', cust);
  ok(/Sub Portal Terms of Use/.test(sub) && /Sub Portal Privacy Notice/.test(sub) && !/Customer Portal/.test(sub), f + ': the sub links keep the sub papers', sub);
}
ok(!SUBRE.test(fs.readFileSync(path.join(build, 'portal.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')), 'portal.html markup: no sub-portal paper anywhere');

/* 2) + 3) in the browser */
const { computer, sleep } = await import(pathToFileURL(HARNESS).href);
const c = await computer('PL', { build, mobile: true }); const p = c.page();
try {
  await p.goto('https://app.local/portal.html?t=' + 'T'.repeat(43)); await sleep(4000);
  const r = await p.evaluate(() => ({ html: document.body.innerText + ' ' + [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href') + ' ' + a.textContent).join(' '), foot: (document.querySelector('footer') || {}).innerText || '', note: (document.querySelector('[data-gc-legal-note]') || {}).innerText || '', text: document.body.innerText }));
  ok(/Customer Portal Terms of Use · Privacy\. Documents/.test(r.note) && (r.note.match(/E-SIGN/g) || []).length === 1, 'the customer sign-in note: Customer Portal Terms of Use · Privacy, then the E-SIGN line (once)', r.note);
  ok(/Customer Portal Terms of Use/.test(r.foot) && !SUBRE.test(r.foot), 'customer portal footer: customer papers only', r.foot);
  ok(!SUBRE.test(r.html), 'customer portal page (screen shown: ' + (r.note ? 'sign-in, note "' + r.note.slice(0, 90) + '…"' : 'no sign-in note') + '): no sub-portal text or link on screen', (r.html.match(/[\s\S]{80}(Sub Portal|sub-terms|sub-privacy|subcontractor portal|bids\.grayco)[\s\S]{40}/i) || [])[0]);
  await p.goto('https://app.local/cancel-notice.html'); await sleep(500);
  await p.setContent('<html><body><form><input type="password"></form></body></html>');
  await p.addScriptTag({ path: path.join(build, 'legal2.js') });
  await p.evaluate(() => window.GCLegal.boot({ bid: true, base: 'https://portal.example' })); await sleep(300);
  const b = await p.evaluate(() => ({ note: (document.querySelector('[data-gc-legal-note]') || {}).innerText || '', foot: (document.querySelector('[data-gc-legal-footer]') || {}).innerText || '' }));
  ok(/Sub Portal Terms of Use/.test(b.note) && !/Customer Portal/.test(b.note) && (b.note.match(/E-SIGN/g) || []).length === 1 && /Sub Portal Terms of Use/.test(b.foot), 'the bid / sub sign-in keeps its own papers', b);
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
