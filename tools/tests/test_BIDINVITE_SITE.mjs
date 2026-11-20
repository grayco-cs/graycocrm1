// test_BIDINVITE_SITE.mjs <build-dir> — patch BIDINVITE in the browser, ⏸ data-entry mode ON (made-up data; e-mail / texts captured where
// they would reach Resend / Twilio — nothing leaves the machine). The REAL subportal.js / bid-hub.js on qaa_world's in-memory Supabase.
//   · the bid site (subportal/, built): an admin's Invite (🔨 sub) on a private job → the e-mail at once, the row says ✉ e-mailed
//   · the CRM (offline harness): 📨 Send sign-up link (Admin → 🔐 Sub portal accounts / Subs) → e-mail + text from the GrayCo number
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, putRow, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(250); } return false; };
W.install();
const MAIL = [], SMS = []; const f0 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.indexOf('api.resend.com') > -1) { MAIL.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'm' + MAIL.length }), text: async () => '{}' }; }
  if (u.indexOf('api.twilio.com') > -1) { const p = {}; new URLSearchParams(String(init.body)).forEach((v, k) => { p[k] = v; }); SMS.push(p); return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ sid: 'SM' + SMS.length, status: 'queued' }), text: async () => '{}' }; }
  return f0(url, init);
};
Object.assign(process.env, { RESEND_API_KEY: 'test-mail-key', CUST_QUIET_OFF: '1', TWILIO_ACCOUNT_SID: 'AC_test_sid', TWILIO_AUTH_TOKEN: 'test-twilio-token', TWILIO_FROM: '+19015550100' }); delete process.env.PORTAL_MAIL_OFF;
const F = W.fns(BUILD);
const DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []);
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true }]);
W.H.cset('gc_automation_pause', { on: true, why: 'data entry (test)' });
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true }, { email: 'wjohnson@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' };
putRow('jobs', 'J1', { id: 'J1', title: 'Private Fit-out Demo', status: 'open', visibility: 'private', draft: false, bidDueDate: DAY(14), pmId: 'st_owner', estimatorId: 'st_owner', tradesSought: 'Drywall', createdAt: new Date().toISOString() }, { job_id: 'J1' });
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = []; const OPEN = [];
try {
  /* ═══ the bid site ═══ */
  const ctx = await W.bidsCtx(browser, BUILD, F, 'desktop'); const A = await ctx.newPage(); A.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await A.goto('https://bids.test/'); await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await A.waitForSelector('h3:has-text("Private Fit-out Demo")', { timeout: 30000 }); await A.click('h3:has-text("Private Fit-out Demo")');
  await A.waitForSelector('[data-invite-email]', { timeout: 15000 });
  await A.fill('[data-invite-email]', 'new@sub.test'); await A.click('[data-invite-send]');
  ok('1 bid site Invite (data-entry mode ON) → the e-mail goes at once: "GrayCo invited you to bid: Private Fit-out Demo" with the sign-up link', await until(() => MAIL.some(m => m.to.includes('new@sub.test') && m.subject === 'GrayCo invited you to bid: Private Fit-out Demo' && /invite=[a-f0-9]{32}/.test(m.html))), MAIL.map(m => m.subject));
  ok('2 the invite row says ✉ e-mailed; one invite (the page\'s own save does not double it)', await A.waitForSelector('[data-invite-row="new@sub.test"]:has-text("e-mailed")', { timeout: 10000 }).then(() => true, () => false) && (await sleep(1500), rowsOf('invites').filter(r => r.email === 'new@sub.test').length === 1));
  ok('3 no page errors (bid site)', errs.length === 0, errs);

  /* ═══ the CRM: 📨 Send sign-up link ═══ */
  const C = await W.H.computer('wjohnson@grayco-cs.com', { build: BUILD }); OPEN.push(C);
  await W.wireCrm(C, BUILD, F);
  ok('4 the admin signs in to the CRM', await W.H.signIn(C, 'wjohnson@grayco-cs.com', 60000));
  await W.H.waitFor(C, () => !!window._gcSignupLink, null, 60000);
  await C.ev(() => window._gcSignupLink.open({ name: 'Lee Link', email: 'lee@sub.test', phone: '9015550142' }));
  await C.page().waitForSelector('#gc-sul [data-sul="send"]', { timeout: 10000 });
  ok('5 📨 Send sign-up link: name, e-mail, cell, ✉ e-mail / 💬 text, Sub / Supplier, Español', await C.ev(() => { const m = document.getElementById('gc-sul'); return !!(m.querySelector('[data-sul-via="email"]').checked && m.querySelector('[data-sul-via="sms"]').checked && m.querySelector('input[name="gc-sul-as"][value="supplier"]') && m.querySelector('[data-sul-es]')); }));
  await C.page().click('#gc-sul [data-sul="send"]');
  ok('6 sent in data-entry mode: the e-mail and the text from the GrayCo number, with the sign-up link', await until(() => MAIL.some(m => m.to.includes('lee@sub.test') && /sign-up link/i.test(m.subject)) && SMS.some(x => /5550142/.test(x.To) && /bids\.grayco-cs\.com\/\?invite=/.test(x.Body))), { m: MAIL.map(m => m.subject), s: SMS });
  const shown = await W.H.waitFor(C, () => { const a = document.querySelector('#gc-sul [data-sul-link]'); const t = (document.querySelector('#gc-sul [data-sul-msg]') || {}).textContent || ''; return a && /e-mailed \+ 💬 texted/.test(t) ? a.getAttribute('href') : null; }, null, 10000);
  ok('7 the sheet says "✓ Sign-up link ✉ e-mailed + 💬 texted" and shows the link to copy', !!shown && /\?invite=[a-f0-9]{32}&job=signup/.test(shown), shown);
  ok('8 no page errors (CRM)', !C.errs.length, C.errs.slice(0, 5));
} finally { for (const c of OPEN) await c.close().catch(() => {}); await browser.close(); }
const n = R.filter(Boolean).length; console.log('BIDINVITE_SITE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
