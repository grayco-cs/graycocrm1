/* patch INVMAIL tests (browser): node tools/tests/test_INVMAIL_ui.mjs [build-dir] [shot-dir] — made-up data only, nothing leaves the computer.
   index.html's OWN gc-patch-invmail script in a stubbed page (no CRM harness: a <main>, the ✅ Approvals list and 📬 Mail received card,
   the signed-in office user); /.netlify/functions/bid-inbox is the REAL handler on the made-up world (invmail_world.mjs).
     · 📭 "Wesley/Nick/office mail not connected yet" while none of those mailboxes has been seen; only the missing ones once one is
     · 📥 Possible invoices from e-mail: the uncertain ones with who / came to / why / 📎 file; above 📬 Mail received
     · ✓ It's an invoice → the invoices@ intake (gc_mail_money) and gone from the list; ✕ Not an invoice → remembered for the sender
     · a PM never sees the card;  phone width: no sideways scrolling
   Playwright: NODE_PATH or PLAYWRIGHT_DIR. */
import fs from 'fs'; import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { W, kv, money, resend, deliver, file, UNSURE, UNSURE2, INV, BI, IM, COPY } from './invmail_world.mjs';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')), SHOTS = process.argv[3] || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? '  ✓ ' : '  ✗ FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(f, ms){ const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 10000)) { v = await f(); if (v) return v; await sleep(150); } return v; }
let PW; try { PW = require('playwright'); } catch (e) { PW = require(process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright'); }

const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const i0 = html.indexOf('<script id="gc-patch-invmail">'); const SRC = i0 < 0 ? '' : html.slice(html.indexOf('>', i0) + 1, html.indexOf('</script>', i0));
console.log('INVMAIL (browser)');
ok('index.html has its own gc-patch-invmail block', SRC.length > 3000 && /__GC_PATCH_INVMAIL__/.test(SRC));

/* nothing seen yet: two uncertain e-mails came by the history copy only for office@ … then the seen marks are wiped to start "fresh" */
await deliver(resend({ envelope: COPY, from: 'Jo New <jo@newcrew.test>', toHdr: ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com'], subject: 'Hollis job paperwork', mid: '<ui-jo1@newcrew.test>', text: 'Here is what we discussed.', files: [file('Hollis-0412.pdf', UNSURE)] }));
await deliver(resend({ envelope: COPY, from: 'Sam Other <sam@othercrew.test>', toHdr: ['office@grayco-cs.com'], subject: 'Paperwork for 123 Senatobia', mid: '<ui-sam1@othercrew.test>', text: 'see attached', files: [file('senatobia.pdf', UNSURE2)] }));
delete W.tables.gc_lead_inbox_kv[IM.KV_SEEN];

const TOK = { office: 'tok-office', pm: 'tok-pm' };
const browser = await PW.chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
async function page(who, vp){
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 860 }, serviceWorkers: 'block' });
  const errs = [];
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host !== 'crm.test') return r.abort('blockedbyclient');
    if (u.pathname === '/.netlify/functions/bid-inbox') {
      BI._test.resetKvTable();
      const resp = await BI.handler({ httpMethod: rq.method(), headers: { authorization: 'Bearer ' + TOK[who], origin: 'https://crm.grayco-cs.com' }, queryStringParameters: Object.fromEntries(u.searchParams), body: rq.postData() || '' });
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0b1a2e;font-family:sans-serif"><main style="padding:12px"><h2>Approvals</h2><div id="_gcApprOv"><div class="_apList"><div class="_apItem">🧾 Match this invoice (demo)</div><details class="gc-mailrecv"><summary>📬 Mail received</summary></details></div></div></main></body></html>' });
  });
  const P = await ctx.newPage(); P.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await P.goto('https://crm.test/');
  const user = who === 'pm' ? { name: 'Pat Mason', email: 'pat@grayco-cs.com', role: 'Project Manager' } : { name: 'Brittany Demo', email: 'office@grayco-cs.com', role: 'Office Admin' };
  await P.evaluate(u => { window._gcMeUser = () => u; window.__opened = []; window._gcOpenRef = (ref, name) => window.__opened.push([ref, name]); }, user);
  await P.addScriptTag({ content: SRC });
  return { P, ctx, errs };
}
const shot = async (P, n) => { if (SHOTS) await P.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }).catch(() => {}); };

{
  const { P, ctx, errs } = await page('office');
  const notice = await waitFor(() => P.evaluate(() => { const n = document.querySelector('.gc-invmail [data-im-notice]'); return n && n.offsetParent ? n.textContent : ''; }), 10000);
  ok('📭 "Wesley/Nick/office mail not connected yet" — nothing from those mailboxes has been seen', /📭 Wesley\/Nick\/office mail not connected yet/.test(notice || ''), notice);
  ok('the card sits in ✅ Approvals, right above 📬 Mail received', await P.evaluate(() => { const c = document.querySelector('#_gcApprOv ._apList > .gc-invmail'); return !!c && c.nextElementSibling && c.nextElementSibling.classList.contains('gc-mailrecv'); }));
  ok('the summary counts what is waiting: "(2 to check)"', /\(2 to check\)/.test(await P.textContent('.gc-invmail summary')), await P.textContent('.gc-invmail summary'));
  await shot(P, 'invmail-1-notice');
  await P.click('.gc-invmail summary');
  await waitFor(() => P.evaluate(() => document.querySelectorAll('.gc-invmail [data-im-item]').length === 2), 8000);
  const items = await P.evaluate(() => [...document.querySelectorAll('.gc-invmail [data-im-item]')].map(x => x.textContent));
  const jo = items.find(x => /Hollis job paperwork/.test(x)) || '';
  ok('each one: the subject, who sent it, which mailboxes it came to, why it might be an invoice, the 📎 file, ✓ / ✕', /Jo New/.test(jo) && /came to wjohnson@, nthomas@/.test(jo) && /Why it might be:.*Amount due/i.test(jo) && /📎 Hollis-0412\.pdf/.test(jo) && /✓ It's an invoice/.test(jo) && /✕ Not an invoice/.test(jo), items);
  await P.click('.gc-invmail [data-im-file]');
  ok('📎 opens the stored file (the CRM\'s own opener)', await P.evaluate(() => window.__opened.length === 1 && /^sb:crm-files\//.test(window.__opened[0][0])));
  await shot(P, 'invmail-2-list');
  /* ✓ It's an invoice */
  const joId = await P.evaluate(() => [...document.querySelectorAll('.gc-invmail [data-im-item]')].find(x => /Hollis/.test(x.textContent)).getAttribute('data-im-item'));
  const n0 = money().length;
  await P.click('.gc-invmail [data-im-yes="' + joId + '"]');
  await waitFor(() => P.evaluate(() => document.querySelectorAll('.gc-invmail [data-im-item]').length === 1), 10000);
  const msg = await P.textContent('.gc-invmail [data-im-msg]');
  ok('✓ It\'s an invoice → into the invoices@ intake (gc_mail_money, its PDF kept) and off the list', money().length === n0 + 1 && money().some(x => /Hollis job paperwork/.test(x.subject) && x.files.length === 1) && /Sent to the invoice intake/.test(msg), { n: money().length, msg });
  /* ✕ Not an invoice */
  const samId = await P.evaluate(() => document.querySelector('.gc-invmail [data-im-item]').getAttribute('data-im-item'));
  await P.click('.gc-invmail [data-im-no="' + samId + '"]');
  await waitFor(() => P.evaluate(() => document.querySelectorAll('.gc-invmail [data-im-item]').length === 0), 10000);
  const sd = kv(IM.KV_SENDERS, 'gc_lead_inbox_kv') || {};
  ok('✕ Not an invoice → set aside, remembered for that sender; "Answered lately" shows both', sd['sam@othercrew.test'] && sd['sam@othercrew.test'].a === 'not' && sd['jo@newcrew.test'].a === 'invoice' && /Answered lately: .*✓ Jo New.*✕ Sam Other|Answered lately: .*✕ Sam Other.*✓ Jo New/.test(await P.textContent('.gc-invmail [data-im-list]')), sd);
  /* mail of Wesley's mailbox arrives (an invoice to him only) → only Nick / office are still "not connected" */
  await deliver(resend({ envelope: COPY, from: 'Casey Ortiz <casey@ridgelineroof.test>', toHdr: ['wjohnson@grayco-cs.com'], subject: 'Invoice RR-5001 - 8382 Laurett Cove', mid: '<ui-rr5001@ridgeline.test>', text: 'Invoice attached', files: [file('RR-5001.pdf', INV)] }));
  await P.click('.gc-invmail [data-im-reload]');
  const n2 = await waitFor(() => P.evaluate(() => { const n = document.querySelector('.gc-invmail [data-im-notice]'); return n && /Nick\/office mail not connected yet/.test(n.textContent) && !/Wesley/.test(n.textContent) ? n.textContent : ''; }), 8000);
  ok('once Wesley\'s mail has been seen: "📭 Nick/office mail not connected yet"', !!n2, await P.evaluate(() => (document.querySelector('.gc-invmail [data-im-top]') || {}).textContent));
  ok('"Invoices lately caught from Wesley / Nick / office@ mail" lists RR-5001 and where it came', await P.evaluate(() => [...document.querySelectorAll('.gc-invmail [data-im-caught]')].some(x => /RR-4001|Ridgeline/i.test(x.textContent) && /came to wjohnson@/.test(x.textContent))));
  /* all three seen → the green line */
  W.tables.gc_lead_inbox_kv[IM.KV_SEEN].value = Object.assign({}, kv(IM.KV_SEEN, 'gc_lead_inbox_kv'), { 'nthomas@grayco-cs.com': { gmail: new Date().toISOString(), at: new Date().toISOString() }, 'office@grayco-cs.com': { copy: new Date().toISOString(), at: new Date().toISOString() } });
  await P.click('.gc-invmail [data-im-reload]');
  ok('all three seen → no 📭, "✓ Wesley, Nick and office@ mail is connected"', !!await waitFor(() => P.evaluate(() => !document.querySelector('.gc-invmail [data-im-notice]') && !!document.querySelector('.gc-invmail [data-im-ok]')), 8000));
  await shot(P, 'invmail-3-done');
  ok('no page errors', errs.length === 0, errs);
  await ctx.close();
}
{
  const { P, ctx } = await page('pm');
  await sleep(2500);
  ok('a PM never sees the card', await P.evaluate(() => !document.querySelector('.gc-invmail')));
  await ctx.close();
}
{
  delete W.tables.gc_lead_inbox_kv[IM.KV_SEEN];
  await deliver(resend({ envelope: COPY, from: 'Lee Maybe <lee@maybe.test>', toHdr: ['nthomas@grayco-cs.com'], subject: 'Paperwork — a very long subject line that keeps going and going to test wrapping on a phone screen', mid: '<ui-lee@maybe.test>', text: 'see attached', files: [file('a-very-long-file-name-that-does-not-break-easily-0001.pdf', UNSURE)] }));
  delete W.tables.gc_lead_inbox_kv[IM.KV_SEEN];
  const { P, ctx, errs } = await page('office', { width: 390, height: 844 });
  await waitFor(() => P.evaluate(() => !!document.querySelector('.gc-invmail [data-im-notice]')), 8000);
  await P.click('.gc-invmail summary');
  await waitFor(() => P.evaluate(() => document.querySelectorAll('.gc-invmail [data-im-item]').length >= 1), 8000);
  const wide = await P.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('phone (390 px): the notice and the list fit — no sideways scrolling', wide.sw <= wide.cw + 1, wide);
  await shot(P, 'invmail-4-phone');
  ok('no page errors (phone)', errs.length === 0, errs);
  await ctx.close();
}
await browser.close();
const f = R.filter(x => !x).length; console.log((R.length - f) + ' passed' + (f ? ', ' + f + ' FAILED' : '')); if (f) process.exitCode = 1;
