/* custportal_preview.mjs — screenshots of EVERY customer-portal page with the made-up SAMPLE job (patch CUSTPORTAL).
   node tools/tests/custportal_preview.mjs [out-dir]     (default: <scratch>/preview/customer)
   Offline: custportal_world.mjs answers every cloud call; the real functions run behind a local server that applies
   netlify.toml's rules for portal.grayco-cs.com. Writes NN_<page>_phone.png (390×844) / NN_<page>_desktop.png (1366×768)
   and index.txt (one line per image). Needs the browser lock (the caller takes it). */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import * as W from './custportal_world.mjs';
const OUT = path.resolve(process.argv[2] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/preview/customer');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/\.(png|txt)$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const INDEX = [], ERRS = [], BAD = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = await W.startServer();
const browser = await W.launch();
let n = 0;
const num = {};
/* the numbers of the first preview stay (the owner refers to them: "page 20" …); pages added later come after them */
['signin', 'forgot_password', 'forgot_code', 'home_after_signin', 'home', 'home_full', 'papers_to_sign', 'requests_card', 'updates', 'your_info', 'sign_before', 'sign_filled', 'photos', 'photo_big', 'documents', 'documents_full', 'document_pdf', 'payments', 'payments_full', 'invoice_pdf', 'messages', 'request_change_form', 'request_sent', 'request_project_form', 'link_off',
  'sign_after', 'signed_copy_pdf', 'spanish', 'estimate_pdf', 'estimate_uploaded_pdf', 'proposal_pdf', 'invoice_download_pdf'].forEach(function(k){ num[k] = String(++n).padStart(2, '0'); });
function nn(page){ if (!num[page]) num[page] = String(++n).padStart(2, '0'); return num[page]; }
async function snap(pg, page, kind, what, opts){
  opts = opts || {};
  if (opts.sel) await pg.evaluate(s => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -8); } }, opts.sel);
  await sleep(opts.wait || 450);
  const file = nn(page) + '_' + page + '_' + kind + '.png';
  await pg.screenshot({ path: path.join(OUT, file), fullPage: !!opts.full });
  INDEX.push(file + ' — ' + what);
}
async function step(name, fn){ try { await fn(); } catch (e) { BAD.push(name + ': ' + (e && e.message || e).split('\n')[0]); console.log('  ! ' + name + ': ' + (e && e.message || e).split('\n')[0]); } }
function watch(pg, kind){
  pg.on('pageerror', e => ERRS.push(kind + ' pageerror: ' + e.message));
  pg.on('response', r => { const u = r.url(); if (r.status() >= 400 && !/favicon/.test(u) && !/-off$/.test(kind)) { let a = ''; try { a = (JSON.parse(r.request().postData() || '{}') || {}).action || ''; } catch (e) {} ERRS.push(kind + ' HTTP ' + r.status() + ' ' + u.replace(/token=[^&]+/, 'token=…').slice(0, 140) + (a ? ' action=' + a : '')); } });   /* the turned-off link answers 404 on purpose */
}
async function pdfShot(ctx, kind, url, page, what){
  const name = new URL(url).pathname.replace(/^.*\/crm-files\//, ''), f = W.FILES[name];
  if (!f) throw new Error('no such PDF ' + name);
  const tmp = path.join(OUT, '.tmp_' + kind); fs.writeFileSync(tmp + '.pdf', f.bytes);
  execFileSync('pdftoppm', ['-png', '-r', kind === 'phone' ? '110' : '96', '-singlefile', tmp + '.pdf', tmp]);
  const png = fs.readFileSync(tmp + '.png').toString('base64'); fs.unlinkSync(tmp + '.pdf'); fs.unlinkSync(tmp + '.png');
  const pg = await ctx.newPage();
  await pg.setContent('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#525659;font:14px Arial">' +
    '<div style="background:#323639;color:#fff;padding:10px 12px;position:sticky;top:0">📄 ' + name.slice(0, 10) + '…pdf — opened from the portal (rendered from the real file)</div>' +
    '<img style="display:block;margin:12px auto;max-width:96%;box-shadow:0 2px 8px #0008" src="data:image/png;base64,' + png + '"></body>');
  await snap(pg, page, kind, what);
  await pg.close();
}

for (const kind of ['phone', 'desktop']) {
  W.seedSample();
  try { require_reset(); } catch (e) {}
  const ctx = await W.context(browser, kind);
  const pg = await ctx.newPage(); watch(pg, kind);
  const O = srv.ORIGIN;
  /* 1. sign-in (a new phone, nothing saved) */
  await step('signin', async () => {
    await pg.goto(O + '/'); await pg.waitForSelector('#signinBox', { timeout: 15000 });
    await snap(pg, 'signin', kind, 'Sign-in: e-mail or mobile + password ("New here? Your password is your first name"), Forgot password');
    await pg.click('#siForgot'); await pg.waitForSelector('#siSend');
    await snap(pg, 'forgot_password', kind, 'Forgot password: "Send me a code" (a 6-digit code to the e-mail on file)');
    await pg.fill('#siWho', W.S.customer.email); await pg.click('#siSend'); await pg.waitForSelector('#siCode');
    await snap(pg, 'forgot_code', kind, 'Forgot password: enter the 6-digit code');
  });
  /* 2. password sign-in with the starter password (first name) → home + "Make your own password" */
  await step('password', async () => {
    await pg.goto(O + '/'); await pg.waitForSelector('#siLogin');
    await pg.fill('#siEmail', W.S.customer.email); await pg.fill('#siPw', 'Sample'); await pg.click('#siLogin');
    await pg.waitForSelector('#track, #ownPwCard', { timeout: 20000 }); await sleep(2500);
    await snap(pg, 'home_after_signin', kind, 'Home right after signing in with the starter password (first name): "Make your own password" card, the estimate, where the job is');
  });
  /* 3. the e-mailed link (what most customers tap) */
  await step('home', async () => {
    await pg.evaluate(() => { localStorage.clear(); }); await pg.goto('about:blank');   /* a full load (a hash-only change keeps the old page) */
    await pg.goto(O + '/#t=' + W.S.link); await pg.waitForSelector('#track', { timeout: 20000 }); await sleep(3000);
    await snap(pg, 'home', kind, 'Home (opened from the e-mailed link): hello, job name + address + PO, the estimate card, where the job is + schedule');
    await snap(pg, 'home_full', kind, 'Home, the whole page (full length)', { full: true });
    await step('papers', async () => { await pg.waitForSelector('#gcesign', { timeout: 8000 }); await snap(pg, 'papers_to_sign', kind, '✍️ Papers to sign: the estimate, change order #2 (to sign) and the signed roof contract', { sel: '#gcesign' }); });
    await step('requests', async () => { await pg.waitForSelector('#gcpr-card', { timeout: 8000 }); await snap(pg, 'requests_card', kind, 'Need something? ➕ Request a change · 🏗 Request a new project · My requests', { sel: '#gcpr-card' }); });
    await step('updates', async () => { await snap(pg, 'updates', kind, 'Updates from your team (PM posts with photos), your PM card (Call / Text / Messages)', { sel: '.post' }); });
    await step('info', async () => { await snap(pg, 'your_info', kind, 'Your info (name, address, phone, e-mail; "Call us to change it") + how to reach us', { sel: '#gcReach' }); });
  });
  /* 4. sign flow: change order #2 */
  await step('sign', async () => {
    const id = 'sr_' + W.S.pid + '_change_order_CO2';
    const sel = '#gcesign .es-item[data-id="' + id + '"]';
    await pg.waitForSelector(sel);
    await snap(pg, 'sign_before', kind, 'Sign flow — before: change order #2 (+$2,350), Read it, e-sign consent, name, draw signature, I approve', { sel });
    await pg.evaluate(s => { const b = document.querySelector(s); const c = b.querySelector('input[type=checkbox]'); if (c && !c.checked) c.click(); }, sel);
    const boxes = await pg.$$(sel + ' input[type=checkbox]'); for (const b of boxes) { if (!(await b.isChecked())) await b.check(); }
    await pg.fill(sel + ' input.sel-name', 'Sample Customer');
    const cv = await pg.$(sel + ' canvas'); const bb = await cv.boundingBox();
    await pg.mouse.move(bb.x + 20, bb.y + bb.height * 0.6); await pg.mouse.down();
    for (let i = 1; i <= 24; i++) await pg.mouse.move(bb.x + 20 + i * (bb.width - 40) / 24, bb.y + bb.height * (0.6 - 0.3 * Math.sin(i / 3)));
    await pg.mouse.up();
    await snap(pg, 'sign_filled', kind, 'Sign flow — filled in: consent ticked, name typed, signature drawn', { sel: sel + ' input.sel-name' });
    await pg.click(sel + ' .es-sign');
    await pg.waitForFunction(s => { const el = document.querySelector(s); return el && el.getAttribute('data-status') === 'signed'; }, sel, { timeout: 15000 });
    await snap(pg, 'sign_after', kind, 'Sign flow — after: "Thank you — signed", ✓ Signed by Sample Customer, Open my signed copy', { sel: '#gcesign' });
    const href = await pg.getAttribute(sel + ' a.btn:last-of-type', 'href');
    if (href) await pdfShot(ctx, kind, href, 'signed_copy_pdf', 'The signed change order PDF (the copy the customer gets; also filed on the job)');
  });
  /* 5. photos */
  await step('photos', async () => {
    await pg.click('#tabs button[data-tab="photos"]'); await pg.waitForSelector('#gp-gallery #grid img', { timeout: 15000 }); await sleep(1500);
    await snap(pg, 'photos', kind, 'Photos: GrayCo Photos + CompanyCam photos of this job, newest first, thumbnails (lazy)');
    await pg.click('#gp-gallery #grid button'); await pg.waitForSelector('.lb img'); await sleep(900);
    await snap(pg, 'photo_big', kind, 'One photo enlarged (swipe / arrows, date)');
    await pg.keyboard.press('Escape');
  });
  /* 6. documents */
  await step('docs', async () => {
    await pg.click('#tabs button[data-tab="docs"]'); await sleep(1200);
    await snap(pg, 'documents', kind, 'Documents: the estimate card + Documents & proposals (contract, change order, warranty, completion, lien waiver, photo report, maintenance plan)');
    await snap(pg, 'documents_full', kind, 'Documents, the whole page', { full: true });
    const href = await pg.evaluate(() => { const a = [...document.querySelectorAll('.doc a.btn')].find(x => /Warranty/i.test(x.closest('.doc').textContent)); return a ? a.href : ''; });
    if (href) await pdfShot(ctx, kind, href, 'document_pdf', 'Opening one document (Warranty certificate) — the PDF the "Open" button opens');
  });
  /* 7. payments */
  await step('pay', async () => {
    await pg.click('#tabs button[data-tab="pay"]'); await sleep(1000);
    await snap(pg, 'payments', kind, 'Payments: contract, paid so far, balance, how to pay, final invoice, change orders, invoices (paid + open), history');
    await snap(pg, 'payments_full', kind, 'Payments, the whole page', { full: true });
    const pop = ctx.waitForEvent('page', { timeout: 15000 });
    await pg.click('[data-inv-open="INVS2"]'); const ip = await pop; watch(ip, kind + '-invoice');
    await ip.waitForSelector('#topTotal', { timeout: 15000 }); await sleep(2600);
    await snap(ip, 'invoice_pdf', kind, '📄 Open invoice → invoice 1002 as the CRM makes it: the CRM\'s own animated invoice (_gcViewInvoicePDF — "the blue animated screen"), with its ⬇️ Download PDF');
    await ip.close();
  });
  /* 8. messages */
  await step('msgs', async () => {
    await pg.click('#tabs button[data-tab="msgs"]'); await pg.waitForSelector('#cMsgList .msg', { timeout: 10000 }); await sleep(600);
    await snap(pg, 'messages', kind, 'Messages with the GrayCo team (read receipts), write + Send');
  });
  /* 9. requests: the forms */
  await step('reqforms', async () => {
    await pg.click('#tabs button[data-tab="home"]'); await pg.waitForSelector('#gcpr-change', { timeout: 10000 });
    await pg.click('#gcpr-change'); await pg.waitForSelector('#gcpr-sheet #gcpr-text'); await sleep(500);
    await snap(pg, 'request_change_form', kind, '➕ Request a change (a change order): what, where, photos, how soon, how to reach you');
    await pg.fill('#gcpr-text', 'Please add a gutter guard over the back porch too.'); await pg.click('#gcpr-send'); await pg.waitForSelector('#gcpr-thanks', { timeout: 15000 });
    await snap(pg, 'request_sent', kind, 'Request sent: "Someone from our team will be with you shortly."');
    await pg.click('#gcpr-done'); await sleep(600);
    await pg.click('#gcpr-project'); await pg.waitForSelector('#gcpr-sheet #gcpr-wt'); await sleep(500);
    await snap(pg, 'request_project_form', kind, '🏗 Request a new project: which property, kind of work, details, photos');
    await pg.keyboard.press('Escape'); await pg.evaluate(() => { const x = document.querySelector('#gcpr-sheet [data-x], #gcpr-sheet .gcpr-x, #gcpr-close'); if (x) x.click(); });
  });
  /* 10. Spanish */
  await step('es', async () => { const p3 = await ctx.newPage(); watch(p3, kind); await p3.goto(O + '/#t=' + W.S.link); await p3.waitForSelector('#track', { timeout: 20000 }); await p3.click('#langBtn'); await sleep(1500); await snap(p3, 'spanish', kind, 'EN / ES switch: the portal in Spanish'); await p3.click('#langBtn'); await p3.close(); });
  /* 12. the CRM's own estimate PDF (what "📤 Send estimate" stored) and its 5-page proposal, as they open from the portal */
  await step('crm_pdfs', async () => {
    await pg.goto('about:blank'); await pg.goto(O + '/#t=' + W.S.link); await pg.waitForSelector('#track', { timeout: 20000 });
    await pg.click('#tabs button[data-tab="docs"]'); await sleep(900);
    const est = await pg.evaluate(() => { const a = document.querySelector('[data-est-card] [data-est-pdf]'); return a ? a.href : ''; });
    if (est) await pdfShot(ctx, kind, est, 'estimate_pdf', 'Estimate #1042: "📄 View PDF" opens the PDF the CRM made from the owner\'s template and sent (_gcEstPdf.makePdf, ⚙ Proposal template) — the stored file, byte for byte');
    const up = await pg.evaluate(() => { const a = document.querySelector('[data-est-card="ESAMPLE2"] [data-est-pdf]'); return a ? a.href : ''; });
    if (up) await pdfShot(ctx, kind, up, 'estimate_uploaded_pdf', 'Estimate #2051: "📄 View PDF" opens the PDF that was uploaded to the CRM, exactly as uploaded');
    const p5 = await pg.evaluate(() => { const a = [...document.querySelectorAll('.doc a.btn')].find(x => /GrayCo proposal/i.test(x.closest('.doc').textContent)); return a ? a.href : ''; });
    if (p5) await pdfShot(ctx, kind, p5, 'proposal_pdf', 'The 5-page GrayCo Customer Proposal (the CRM\'s generator), as it opens from Documents');
  });
  /* 11. a link that was turned off */
  await step('off', async () => { const p2 = await ctx.newPage(); watch(p2, kind + '-off'); await p2.goto(O + '/#t=' + W.tok()); await p2.waitForSelector('.off', { timeout: 15000 }); await snap(p2, 'link_off', kind, 'A link that is not active: "call GrayCo 901-585-0944" + Sign in'); await p2.close(); });
  await ctx.close();
}
function require_reset(){ W.resetCaches(); }
await browser.close(); await srv.close();
fs.writeFileSync(path.join(OUT, 'index.txt'), INDEX.join('\n') + '\n\nSample job (made up): Sample Customer, 123 Sample St, Memphis TN 38103 — PM Dana Rivers. Branch claude/custportal.\n' +
  (ERRS.length ? '\nPage errors / HTTP errors seen:\n' + [...new Set(ERRS)].join('\n') + '\n' : '\nNo page errors, no HTTP 4xx/5xx.\n') + (BAD.length ? '\nSteps that did not finish:\n' + BAD.join('\n') + '\n' : ''));
console.log(INDEX.length + ' screenshots → ' + OUT); if (ERRS.length) console.log('ERRORS:\n' + [...new Set(ERRS)].join('\n')); if (BAD.length) console.log('STEPS:\n' + BAD.join('\n'));
