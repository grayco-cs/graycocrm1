/* patch A2HS tests: node tools/tests/test_A2HS.mjs [--no-browser]   (owner 11/26: "make sure they know they can share to their home screen
   and then its like an app, customer and subs portal so they can do that and how to do it")
   Made-up people only; every call is answered by in-memory fakes (a local web server for portal.html, qaa_world's fake Supabase for the
   bid site, the real subportal.js); nothing leaves this computer and no e-mail is sent.
   E-MAIL: the home-screen tip line (EN / ES) in the customer's portal-link e-mail, "Your GrayCo Portal is ready", the sub's portal link and
           approval e-mails, the bid-site approval, invite and sign-up-link e-mails.
   BROWSER (phone size, iPhone Safari and Android Chrome):
     customer portal — the "📲 Use it like an app" line under the header on Home stays after "Not now", opens the two-phone steps (iPhone:
       Share → Add to Home Screen → Add; Android: ⋮ → Install app), is in the 📲 menu, and is gone inside the installed app;
     sub portal — the first-visit card (Show me how / Not now 30 days), the 📲 header button and the line at the foot of Jobs, the same
       steps; no customer-portal card, menu or GCP bar; gone inside the installed app;
     bid site — manifest "GrayCo Bids" + icons + apple-touch-icon + apple-mobile-web-app-capable + theme-color, the card for a signed-in
       sub (Not now 30 days), 📲 in the header and in My Settings, the steps; no service worker; gone inside the installed app.
   Screenshots: A2HS_SHOTS (default: the scratchpad a2hs folder). */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FNDIR = path.join(ROOT, 'netlify/functions');
const SHOTS = process.env.A2HS_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/a2hs';
const NM = process.env.PW_NODE_MODULES || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules';
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const tok = () => crypto.randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TIP_EN = 'Tip: add it to your phone&#39;s home screen and it works like an app — iPhone: Share → Add to Home Screen; Android: ⋮ → Install app.';
const TIP_EN_RAW = "Tip: add it to your phone's home screen and it works like an app — iPhone: Share → Add to Home Screen; Android: ⋮ → Install app.";
const TIP_ES = 'Consejo: agréguelo a la pantalla de inicio de su teléfono y funciona como una app — iPhone: Compartir → Agregar a inicio; Android: ⋮ → Instalar app.';
const hasTip = (html, es) => es ? html.includes(TIP_ES) : (html.includes(TIP_EN) || html.includes(TIP_EN_RAW) || html.includes(TIP_EN_RAW.replace("'", '&#039;')));

/* ═════════ the e-mails ═════════ */
process.env.SUPABASE_URL = 'https://fake-a2hs.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'test-only';
delete process.env.RESEND_API_KEY;   /* nothing could be sent even by mistake */
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]', headers: { get: () => null } });
console.log('E-MAIL');
const PA = require(FNDIR + '/portal-access.js'), PO = require(FNDIR + '/portal.js'), PS = require(FNDIR + '/_lib/portalsignup.js');
const SPH = require(FNDIR + '/subportal.js')._hub, BM = require(FNDIR + '/_lib/bidmail.js'), BI = require(FNDIR + '/_lib/bidinvite.js');
await t('customer: the portal link e-mail (portal.js sendLink → linkMailHtml) has the tip', async () => {
  const html = PO._a2hs.linkMailHtml({ job: { name: 'Alpha Reroof' }, customer: { firstName: 'Ann', email: 'ann@example.test' }, pm: { name: 'Steven Park' } }, 'https://portal.grayco-cs.com/#t=x', 'Ann');
  assert.ok(hasTip(html), html.slice(-900));
});
await t('customer: "Your GrayCo Portal is ready" (portalsignup connectedMail) has the tip — English and Spanish', async () => {
  const sent = [];
  const D = { sendMail: async (to, subj, html) => { sent.push({ to, subj, html }); return { ok: true }; }, mailHtml: PA._a2hs.mailHtml, portalBase: () => 'https://portal.grayco-cs.com' };
  await PS.connectedMail(D, { lang: 'en', name: 'Ann Alpha', email: 'ann@example.test' }, [{ address: '1 Test St' }]);
  await PS.connectedMail(D, { lang: 'es', name: 'Ana Alfa', email: 'ana@example.test' }, [{ address: '1 Test St' }]);
  assert.strictEqual(sent[0].subj, 'Your GrayCo Portal is ready'); assert.ok(hasTip(sent[0].html), sent[0].html);
  assert.strictEqual(sent[1].subj, 'Su Portal GrayCo está listo'); assert.ok(hasTip(sent[1].html, true), sent[1].html);
  assert.ok(sent[0].html.indexOf('Open my GrayCo Portal') < sent[0].html.indexOf('Tip: add it'), 'the tip sits under the button');
});
await t('sub: the portal link and the approval e-mails (portal-access) carry the tip — English and Spanish', async () => {
  for (const lg of ['en', 'es']) {
    const L = PA._a2hs.MAIL[lg];
    assert.ok(hasTip(PA._a2hs.mailHtml(L.linkHead, L.linkBody, '', { href: 'https://portal.grayco-cs.com/#t=x', label: L.linkBtn }, L.appTip), lg === 'es'));
    assert.ok(hasTip(PA._a2hs.mailHtml(L.approvedSubj, L.approvedBody, '', { href: 'https://portal.grayco-cs.com', label: L.approvedBtn }, L.appTip), lg === 'es'));
  }
  const src = fs.readFileSync(FNDIR + '/portal-access.js', 'utf8');
  assert.ok(src.includes("label: L.linkBtn }, L.appTip)") && src.includes("label: L.approvedBtn }, L.appTip)"), 'both sends pass the tip');
  assert.ok(!hasTip(PA._a2hs.mailHtml('Code', 'Your code', '123456')), 'a sign-in code e-mail stays as it was');
});
await t('bid site: invite, sign-up link and "you can now sign in" e-mails carry the tip — English and Spanish', async () => {
  const job = { title: 'Clinic Drywall Demo', address: '1 Demo Rd', bidDueDate: '2026-12-10' };
  for (const es of [false, true]) {
    assert.ok(hasTip(BM.inviteMail(job, 'https://bids.grayco-cs.com/', es, false, true).html, es), 'bidmail invite');
    assert.ok(hasTip(BI.inviteMail(job, 'https://bids.grayco-cs.com/?invite=x', es, false, false).html, es), 'bidinvite invite');
    assert.ok(hasTip(BI.signupMail('https://bids.grayco-cs.com/?invite=x', es, 'Alex').html, es), 'sign-up link');
  }
  const src = fs.readFileSync(FNDIR + '/subportal.js', 'utf8');
  assert.ok(src.includes("label: 'Open bids.grayco-cs.com' }, appTip(false))") && src.includes("label: 'Abrir bids.grayco-cs.com' }, appTip(true))"), 'the approval e-mail');
  assert.ok(!hasTip(SPH.mailHtml('Your bid was accepted', ['x'])), 'other bid-site e-mails stay as they were');
  const hub = fs.readFileSync(FNDIR + '/bid-hub.js', 'utf8'); assert.ok(hub.includes("SP.appTip ? SP.appTip(es) : ''"), 'bid-hub invite');
});

/* ═════════ the browser ═════════ */
if (!process.argv.includes('--no-browser')) {
  console.log('BROWSER');
  const { chromium } = require(path.join(NM, 'playwright'));
  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
  };
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const ERRS = [];
  const standaloneInit = () => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} } : mm(q);
    try { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); } catch (e) {}
  };

  /* ── portal.html on a local server: a customer link (TOKC) and a sub session (SUBS) ── */
  const PORT = 18000 + Math.floor(Math.random() * 2000), HOST = 'portal.localhost', ORIGIN = 'http://' + HOST + ':' + PORT;
  const TOKC = tok(), SUBS = tok(), CUSTS = tok(), CUST = new Set([CUSTS]);
  const VIEW = { ok: true, office: { phone: '901-585-0944' }, customer: { name: 'Ann Alpha', firstName: 'Ann', address: '1 Test St', phone: '', email: 'ann@example.test' },
    job: { name: 'Alpha Reroof', address: '1 Test St', po: '1001', stage: 3, stageName: 'Work', stages: ['Signed', 'Ordered', 'Scheduled', 'Work', 'Done'], steps: [] },
    pm: { name: 'Steven Park', phone: '', email: '' }, money: { contract: 10000, changeOrders: [], invoices: [], payments: [], paid: 0, due: 0, finalInvoice: null },
    posts: [], docs: [], companyCam: { url: '', linked: false }, warranty: null, showReview: false, review: null, crew: [] };
  const SUBHOME = { ok: true, me: { name: 'Sam Sub', company: 'Sub Demo Drywall', trade: 'Drywall', email: 'sam@sub.test' }, jobs: [], needs: [], week: [], money: { submitted: 0, approved: 0, paidMonth: 0 }, bids: { state: 'off' }, lang: 'en' };
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      const u = new URL(req.url, ORIGIN); const J = (o, st) => { res.writeHead(st || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname.startsWith('/.netlify/functions/')) {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
        const fn = u.pathname.split('/').pop(), sess = req.headers['x-portal-session'] || '', tk = req.headers['x-portal-token'] || '';
        if (fn === 'portal-access') {
          if (b.action === 'open') return J(tk === TOKC ? { ok: true, kind: 'customer' } : { ok: false, error: 'This link is not active' }, tk === TOKC ? 200 : 404);
          if (b.action === 'whoami') return sess === SUBS ? J({ ok: true, kind: 'partner' }) : CUST.has(sess) ? J({ ok: true, kind: 'customer' }) : J({ ok: false, error: 'This link is not active' }, 404);
          if (b.action === 'c-jobs') return CUST.has(sess) || tk === TOKC ? J({ ok: true, kind: 'customer', jobs: [{ id: 'PJA', name: 'Alpha Reroof', address: '1 Test St', unread: 0 }] }) : J({ ok: false }, 404);
          if (b.action === 'p-home') return sess === SUBS ? J(SUBHOME) : J({ ok: false, error: 'This link is not active' }, 404);
          if (b.action === 'c-msgs') return J({ ok: true, messages: [] });
          if (b.action === 'c-app') { const c = tok(); CUST.add(c); return J({ ok: true, session: c, handoff: tok(), days: 365 }); }
          return J({ ok: true });
        }
        if (fn === 'portal') {
          if (tk !== TOKC && !CUST.has(sess)) return J({ ok: false, error: 'This link is not active' }, 404);
          if (b.action === 'view') return J(VIEW);
          if (b.action === 'app') return J({ ok: true, unread: { home: 0, photos: 0, docs: 0, pay: 0, msgs: 0 }, total: 0, push: { ready: false } });
          return J({ ok: true, photos: [] });
        }
        return J({ ok: true });
      }
      let f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/portal.html' : u.pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(ROOT, 'portal.html');
      const ext = path.extname(f); const ct = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct + (/text|json|javascript/.test(ct) ? '; charset=utf-8' : '') }); fs.createReadStream(f).pipe(res);
    });
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP ' + HOST + ' 127.0.0.1', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=' + HOST] });
  async function phone(kind, o){
    o = o || {};
    const ctx = await browser.newContext(Object.assign({}, PHONE, { userAgent: UA[kind], serviceWorkers: 'block' }));
    if (o.standalone) await ctx.addInitScript(standaloneInit);
    if (o.ls) await ctx.addInitScript(x => { for (const k of Object.keys(x)) { try { if (!sessionStorage.getItem('__s_' + k)) { localStorage.setItem(k, x[k]); sessionStorage.setItem('__s_' + k, '1'); } } catch (e) {} } }, o.ls);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => ERRS.push(kind + ': ' + e.message));
    pg.on('dialog', d => { ERRS.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
    return { ctx, pg };
  }
  const steps = async (pg, sel) => pg.evaluate(s => { const o = {}; for (const k of ['ios', 'android']) { const el = document.querySelector(s + k); o[k] = el ? el.innerText : ''; } return o; }, sel);
  const okSteps = st => {
    assert.ok(/Safari/.test(st.ios) && /Share/.test(st.ios) && /Add to Home Screen/.test(st.ios) && /\bAdd\b/.test(st.ios), 'iPhone steps: ' + st.ios);
    assert.ok(/Chrome/.test(st.android) && /⋮/.test(st.android) && /Install app/.test(st.android) && /Add to Home screen/.test(st.android), 'Android steps: ' + st.android);
  };

  /* ── customer portal ── */
  for (const kind of ['iphone', 'android']) {
    await t('customer portal (' + kind + '): "📲 Use it like an app" under the header on Home — still there after "Not now" — opens the steps for both phones', async () => {
      const { ctx, pg } = await phone(kind);
      await pg.goto(ORIGIN + '/#t=' + TOKC); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 10000 });
      await pg.waitForSelector('#gca-help', { timeout: 6000 });
      assert.ok(/Use it like an app/.test(await pg.textContent('#gca-help')));
      if (kind === 'iphone') { await pg.waitForSelector('#gca-card', { timeout: 8000 }); await pg.click('#gca-not'); assert.strictEqual(await pg.$('#gca-card'), null); }
      await pg.reload(); await pg.waitForSelector('#tabs:not([hidden])'); await sleep(3200);
      assert.strictEqual(await pg.$('#gca-card'), null, 'the card waits 30 days after Not now');
      await pg.waitForSelector('#gca-help', { timeout: 4000 });
      await pg.locator('#gca-help').scrollIntoViewIfNeeded(); await pg.screenshot({ path: SHOTS + '/customer_' + kind + '_home_line.png' });
      await pg.click('#gca-help-how'); await pg.waitForSelector('#gca-two');
      okSteps(await steps(pg, '#gca-two-'));
      const first = await pg.evaluate(() => document.querySelector('#gca-two .gca-ph').id);
      assert.strictEqual(first, kind === 'iphone' ? 'gca-two-ios' : 'gca-two-android', 'this phone first');
      assert.ok(await pg.$('#gca-two-' + (kind === 'iphone' ? 'ios' : 'android') + '.me'), '"Your phone" marked');
      await pg.screenshot({ path: SHOTS + '/customer_' + kind + '_howto.png' });
      await pg.click('#gca-two-ok'); assert.strictEqual(await pg.$('#gca-two'), null);
      await pg.click('#tabs button[data-tab="docs"]'); await sleep(600);
      assert.strictEqual(await pg.$('#gca-help'), null, 'only on Home');
      await pg.click('#gca-mbtn'); await pg.waitForSelector('#gca-m-how'); await pg.click('#gca-m-how'); await pg.waitForSelector('#gca-two');
      assert.strictEqual(await pg.$('#gcs-a2-card'), null); assert.strictEqual(await pg.$('#gcs-a2-btn'), null, 'never the sub portal\'s pieces');
      await ctx.close();
    });
  }
  await t('customer portal: Android with the install prompt → "Install now" in the steps calls prompt()', async () => {
    const { ctx, pg } = await phone('android', { ls: { gc_pwa_dismiss: String(Date.now()) } });
    await pg.goto(ORIGIN + '/#t=' + TOKC); await pg.waitForSelector('#gca-help', { timeout: 10000 });
    await pg.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
    await sleep(300);
    await pg.click('#gca-help-how'); await pg.waitForSelector('#gca-two-install');
    await pg.click('#gca-two-install'); await sleep(400);
    assert.strictEqual(await pg.evaluate(() => window.__prompted), 1);
    await ctx.close();
  });
  await t('customer portal inside the installed app: no line, no steps in the menu', async () => {
    const { ctx, pg } = await phone('iphone', { standalone: true, ls: { gc_portal_app: CUSTS } });
    await pg.goto(ORIGIN + '/portal.html?app=1'); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 10000 }); await sleep(3200);
    assert.strictEqual(await pg.$('#gca-help'), null); assert.strictEqual(await pg.$('#gca-card'), null);
    await pg.click('#gca-mbtn'); await pg.waitForSelector('#gca-menu'); assert.strictEqual(await pg.$('#gca-m-how'), null);
    await ctx.close();
  });

  /* ── sub portal ── */
  for (const kind of ['iphone', 'android']) {
    await t('sub portal (' + kind + '): first-visit card → Show me how → both phones; 📲 header button and the Jobs line; no customer card / menu / GCP bar', async () => {
      const { ctx, pg } = await phone(kind, { ls: { gc_portal_s: SUBS } });
      await pg.goto(ORIGIN + '/'); await pg.waitForSelector('#gcs-a2-btn', { timeout: 12000 });
      await pg.waitForSelector('#gcs-a2-card', { timeout: 6000 });
      const txt = await pg.textContent('#gcs-a2-card'); assert.ok(/home screen/.test(txt) && /Show me how/.test(txt) && /Not now/.test(txt), txt);
      await pg.screenshot({ path: SHOTS + '/sub_' + kind + '_card.png' });
      await pg.click('#gcs-a2-how'); await pg.waitForSelector('#gca-two');
      assert.strictEqual(await pg.$('#gcs-a2-card'), null);
      okSteps(await steps(pg, '#gca-two-'));
      assert.ok(/GrayCo Portal like an app/.test(await pg.textContent('#gca-two')));
      await pg.screenshot({ path: SHOTS + '/sub_' + kind + '_howto.png' });
      await pg.click('#gca-two-ok');
      assert.ok(await pg.$('#gcs-a2-line'), 'the line at the foot of Jobs');
      await sleep(6500);
      assert.strictEqual(await pg.$('#gcp-install'), null, 'the old GCP bar is not shown to subs');
      assert.strictEqual(await pg.$('#gca-card'), null); assert.strictEqual(await pg.$('#gca-mbtn'), null); assert.strictEqual(await pg.$('#gca-help'), null, 'nothing of the customer portal');
      await ctx.close();
    });
  }
  await t('sub portal: "Not now" hides the card for 30 days; the 📲 button still opens the steps', async () => {
    const { ctx, pg } = await phone('iphone', { ls: { gc_portal_s: SUBS } });
    await pg.goto(ORIGIN + '/'); await pg.waitForSelector('#gcs-a2-card', { timeout: 12000 });
    await pg.click('#gcs-a2-not'); assert.strictEqual(await pg.$('#gcs-a2-card'), null);
    const d = Number(await pg.evaluate(() => localStorage.getItem('gc_sub_a2hs_dismiss'))); assert.ok(Math.abs(Date.now() - d) < 60e3);
    await pg.reload(); await pg.waitForSelector('#gcs-a2-btn', { timeout: 12000 }); await sleep(3200);
    assert.strictEqual(await pg.$('#gcs-a2-card'), null, 'not again for 30 days');
    await pg.click('#gcs-a2-btn'); await pg.waitForSelector('#gca-two');
    await pg.click('#gca-two-ok'); await pg.click('#gcs-a2-how2'); await pg.waitForSelector('#gca-two');
    await pg.evaluate(() => localStorage.setItem('gc_sub_a2hs_dismiss', String(Date.now() - 31 * 864e5)));
    await pg.reload(); await pg.waitForSelector('#gcs-a2-card', { timeout: 12000 });
    await ctx.close();
  });
  await t('sub portal inside the installed app: no card, no 📲 button, no line', async () => {
    const { ctx, pg } = await phone('android', { standalone: true, ls: { gc_portal_s: SUBS } });
    await pg.goto(ORIGIN + '/'); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 12000 }); await sleep(3200);
    assert.strictEqual(await pg.$('#gcs-a2-card'), null); assert.strictEqual(await pg.$('#gcs-a2-btn'), null); assert.strictEqual(await pg.$('#gcs-a2-line'), null);
    await ctx.close();
  });
  server.close();

  /* ── the bid site (the built subportal/, the real subportal.js on qaa_world's fake Supabase) ── */
  const W = await import('./qaa_world.mjs');
  W.install(); process.env.CUST_QUIET_OFF = '1';
  const F = W.fns(ROOT);
  W.H.resetCloud(); W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]); W.H.cset('projects', []); W.H.cset('gc_automation_pause', { on: false });
  W.putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'a@sub.test', name: 'Alex Alpha', company: 'Alpha Drywall', trades: ['Drywall'], authUserId: 'auth-u_a' }, { user_id: 'u_a', email: 'a@sub.test' });
  W.ACC['a@sub.test'] = { pw: 'Sub-Pass-1', id: 'auth-u_a' };
  const bids = async (kind, o) => {
    const ctx = await W.bidsCtx(browser, ROOT, F, 'phone', { userAgent: UA[kind], deviceScaleFactor: 2 });
    if (o && o.standalone) await ctx.addInitScript(standaloneInit);
    const pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push('bids ' + kind + ': ' + e.message)); pg.on('dialog', d => { ERRS.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
    await pg.goto('https://bids.test/'); return { ctx, pg };
  };
  await t('bid site: manifest "GrayCo Bids" with the GrayCo icons, apple-touch-icon, apple-mobile-web-app-capable, theme-color; no service worker', async () => {
    const { ctx, pg } = await bids('android');
    await pg.waitForSelector('input[type=email]', { timeout: 30000 });
    const m = await pg.evaluate(async () => {
      const l = document.querySelector('link[rel="manifest"]'); const j = await (await fetch(l.href)).json();
      const icons = []; for (const i of j.icons) { const r = await fetch(new URL(i.src, l.href)); icons.push([i.sizes, r.status, (r.headers.get('content-type') || '')]); }
      const at = document.querySelector('link[rel="apple-touch-icon"]'); const ar = await fetch(at.href);
      return { j, icons, apple: [ar.status, ar.headers.get('content-type')], cap: (document.querySelector('meta[name="apple-mobile-web-app-capable"]') || {}).content, theme: (document.querySelector('meta[name="theme-color"]') || {}).content,
        title: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content, sw: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0 };
    });
    assert.strictEqual(m.j.name, 'GrayCo Bids'); assert.strictEqual(m.j.short_name, 'GrayCo Bids'); assert.strictEqual(m.j.display, 'standalone'); assert.strictEqual(m.j.start_url, './');
    assert.deepStrictEqual(m.icons.map(i => i[0] + ' ' + i[1] + ' ' + /png/.test(i[2])), ['192x192 200 true', '512x512 200 true', '180x180 200 true']);
    assert.ok(m.apple[0] === 200 && /png/.test(m.apple[1])); assert.strictEqual(m.cap, 'yes'); assert.strictEqual(m.theme, '#140665'); assert.strictEqual(m.title, 'GrayCo Bids');
    assert.strictEqual(m.sw, 0, 'no service worker');
    const icon = fs.readFileSync(path.join(ROOT, 'subportal/portal-icon-192.png')); assert.ok(icon.equals(fs.readFileSync(path.join(ROOT, 'portal-icon-192.png'))), 'the GrayCo portal icon');
    await ctx.close();
  });
  for (const kind of ['iphone', 'android']) {
    await t('bid site (' + kind + '): a signed-in sub gets the card → Show me how → both phones; 📲 in the header and in My Settings', async () => {
      const { ctx, pg } = await bids(kind);
      await W.bidsLogin(pg, 'a@sub.test', 'Sub-Pass-1');
      await pg.waitForSelector('#bids-a2-btn', { timeout: 30000 });
      await pg.waitForSelector('#bids-a2-card', { timeout: 8000 });
      const txt = await pg.textContent('#bids-a2-card'); assert.ok(/Add GrayCo Bids to your home screen/.test(txt) && /Show me how/.test(txt) && /Not now/.test(txt), txt);
      await pg.screenshot({ path: SHOTS + '/bids_' + kind + '_card.png' });
      await pg.click('#bids-a2-how'); await pg.waitForSelector('#bids-a2-sheet');
      okSteps(await steps(pg, '#bids-a2-'));
      const first = await pg.evaluate(() => document.querySelector('#bids-a2-sheet [id^="bids-a2-"]').id);
      assert.strictEqual(first, kind === 'iphone' ? 'bids-a2-ios' : 'bids-a2-android', 'this phone first');
      await pg.screenshot({ path: SHOTS + '/bids_' + kind + '_howto.png' });
      await pg.click('#bids-a2-ok'); assert.strictEqual(await pg.$('#bids-a2-sheet'), null);
      await pg.click('[data-nav="mySettings"]'); await pg.waitForSelector('#bids-a2-settings', { timeout: 10000 });
      await pg.click('#bids-a2-settings button'); await pg.waitForSelector('#bids-a2-sheet');
      await ctx.close();
    });
  }
  await t('bid site: "Not now" → no card for 30 days (the 📲 button stays); inside the installed app: none of it', async () => {
    const a = await bids('iphone');
    await W.bidsLogin(a.pg, 'a@sub.test', 'Sub-Pass-1'); await a.pg.waitForSelector('#bids-a2-card', { timeout: 30000 });
    await a.pg.click('#bids-a2-not'); assert.strictEqual(await a.pg.$('#bids-a2-card'), null);
    const d = Number(await a.pg.evaluate(() => localStorage.getItem('gc_bids_a2hs_dismiss'))); assert.ok(Math.abs(Date.now() - d) < 60e3);
    await a.pg.reload(); await a.pg.waitForSelector('#bids-a2-btn', { timeout: 30000 }); await sleep(3200);
    assert.strictEqual(await a.pg.$('#bids-a2-card'), null);
    await a.ctx.close();
    const b = await bids('android', { standalone: true });
    await W.bidsLogin(b.pg, 'a@sub.test', 'Sub-Pass-1'); await b.pg.waitForSelector('[data-nav="mySettings"]', { timeout: 30000 }); await sleep(3200);
    assert.strictEqual(await b.pg.$('#bids-a2-card'), null); assert.strictEqual(await b.pg.$('#bids-a2-btn'), null);
    await b.pg.click('[data-nav="mySettings"]'); await sleep(800); assert.strictEqual(await b.pg.$('#bids-a2-settings'), null);
    await b.ctx.close();
  });
  await t('no page errors, no pop-ups', async () => { assert.deepStrictEqual(ERRS, []); });
  await browser.close();
}
console.log((failed ? 'FAILED ' : 'OK ') + passed + '/' + (passed + failed));
process.exit(failed ? 1 : 0);
