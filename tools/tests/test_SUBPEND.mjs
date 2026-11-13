// test_SUBPEND.mjs <build-dir> [shot-dir] — patch SUBPEND (owner 11/13: "John signed up and then it wouldn't let him enter with the
// password he just made — make sure that doesn't happen").
// Offline: Chromium against the REAL server functions (portal-access.js + subportal.js) on an in-memory Supabase. Made-up data only.
//
//  1. sign up on the sub portal → signed straight in to the "waiting for approval" page (pending session), no second password
//  2. Sign out → sign in again with the same password (any case / spaces in the e-mail) → the pending page, NOT "not turned on"
//  3. papers: 📎 upload a COI (+ expiry) from the pending page → saved as THEIR bid-site papers (subdocs), shown "On file"
//  4. contact info edit → their profile only (role / approved / e-mail can't be changed)
//  5. a pending session can't reach partner (p-*: 403), customer (c-*) or staff (s-*) actions; pend-me carries no CRM data
//  6. wrong password → the normal "don't match" (many times, never locked — PWNOLOCK), the right one still works
//  7. owner approves (s-bids-approve) → "↻ Check again" / reload → the full partner portal, SAME sign-in (session row upgraded)
//  8. denied → "Your sign-up was not approved — call GrayCo" (at sign-in, and on an open pending page); Español
//  9. an e-mail that is also a customer's with their own saved password: the sub's own password still signs in (was "don't match")
// 10. bids.grayco-cs.com: an unapproved account that signs in sees "Waiting for GrayCo approval" + My Documents (no error, no bounce)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(200); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
delete process.env.RESEND_API_KEY; delete process.env.COMPANYCAM_TOKEN; delete process.env.OWNER_EMAILS;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }).catch(() => {}); };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* ═════ the in-memory Supabase ═════ */
const ACC = {};                     // e-mail → { pw, id }   (Supabase sign-ins)
const TOK = { 'staff-owner': 'owner@graycotest.test' };   // access token → e-mail
const UPLOADS = [];
const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now() }, extra || {});
const SUB = { id: 'SUBold1', name: 'Sample Old Drywall LLC', company: 'Sample Old Drywall LLC', contact: 'Olga Sample', phone: '901-555-0141', email: 'olga@sampleold.test', isSub: true, trade: 'Drywall', lang: 'en' };
const JOB = { id: 'PSAMPLE1', name: 'Sample Kitchen Remodel', address: '123 Sample St, Memphis, TN 38117', client: 'Pat Sample', pm: 'Sample PM', status: 'Active', subs: [{ subId: SUB.id, name: SUB.name, status: 'Awarded' }] };
const CJOB = { id: 'PCUST1', name: 'Sample Bath', address: '9 Sample Ln, Memphis, TN', client: 'Casey Sample', clientEmail: 'casey@samplepaint.test', status: 'Active', subs: [] };
const KV = { projects: [JOB, CJOB], vendors: [SUB], invs: [{ id: 'INV-SECRET', type: 'sub', subId: SUB.id, pid: JOB.id, amt: 9876.54, status: 'approved', invNum: 'SECRET-77' }],
  users: [{ id: 'u1', name: 'Sample PM', email: 'samplepm@grayco-cs.test', phone: '901-555-0100', role: 'Project Manager', active: true }], gc_sub_portal_settings: {} };
const T = { gc_portal_session: [], gc_sub_link: [{ token: 'o'.repeat(43), sub_id: SUB.id, revoked: false, created_at: now() }], gc_sub_event: [], gc_sub_portal: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal_code: [], gc_sub_device: [],
  gc_portal: [{ token: 'c'.repeat(43), project_id: CJOB.id, revoked: false }], gc_portal_lock: [], gc_portal_login: [], sp_rows: [], gc_staff: [{ email: 'owner@graycotest.test', name: 'Sample Owner', role: 'admin', active: true }] };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') {
    const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, '');
    return TOK[a] ? res(200, { id: (ACC[TOK[a]] || {}).id || 'auth-staff', email: TOK[a] }) : res(401, { msg: 'invalid JWT' });
  }
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') {
    const b = JSON.parse(init.body); const e = String(b.email).toLowerCase();
    if (ACC[e]) return res(422, { msg: 'A user with this email address has already been registered' });
    ACC[e] = { pw: b.password, id: 'auth-' + crypto.randomBytes(3).toString('hex') }; return res(200, { id: ACC[e].id, email: e });
  }
  if (u.pathname.startsWith('/auth/v1/admin/users/') && m === 'DELETE') return res(200, {});
  if (u.pathname === '/auth/v1/token') {   /* the server's password check (portal-access subPasswordLogin) */
    const b = JSON.parse(init.body); const a = ACC[String(b.email).toLowerCase()];
    if (!a || a.pw !== b.password) return res(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    const tok = 't-' + crypto.randomBytes(6).toString('hex'); TOK[tok] = String(b.email).toLowerCase(); return res(200, { access_token: tok });
  }
  if (u.pathname === '/rest/v1/gc_kv') {
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  if (u.pathname.startsWith('/storage/v1/object/upload/sign/')) return res(200, { url: '/object/upload/sign/' + u.pathname.split('/upload/sign/')[1] + '?token=up' });
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); const bucket = u.pathname.split('/').pop(); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/' + bucket + '/' + p + '?token=signed' }))); }
  if (u.pathname.startsWith('/storage/v1/')) return res(404, {});
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') {
      const b = JSON.parse(init.body), oc = q.get('on_conflict');
      (Array.isArray(b) ? b : [b]).forEach(r => { const i = oc ? tb.findIndex(x => x[oc] === r[oc]) : (r.key ? tb.findIndex(x => x.key === r.key) : -1); if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); });
      return res(201, []);
    }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > dv(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    const ord = q.get('order'); if (ord) { const [f, d] = ord.split('.'); rows.sort((a, b) => (String(a[f]) < String(b[f]) ? -1 : String(a[f]) > String(b[f]) ? 1 : 0) * (d === 'desc' ? -1 : 1)); }
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    return res(200, rows);
  }
  return res(404, {});
};
const SPF = require(path.join(BUILD, 'netlify/functions/subportal.js'));
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const reset = () => { try { PA._core._reset(); } catch (e) {} };
let IPN = 0;
const ipNext = () => '10.' + (1 + (IPN >> 8) % 200) + '.' + (IPN++ % 250) + '.1';
const pa = async (action, body, headers) => { const r = await PA.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': ipNext() }, headers || {}), body: JSON.stringify(Object.assign({ action }, body || {})) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { status: r.statusCode, data: j, raw: r.body }; };
const spf = async (action, body) => { const r = await SPF.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-nf-client-connection-ip': ipNext() }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { status: r.statusCode, data: JSON.parse(r.body || '{}') }; };
const profOf = e => (T.sp_rows.find(r => r.collection === 'users' && r.email === e) || {}).data;
const sessRow = tok => T.gc_portal_session.find(x => x.id === sha(tok));
const approve = (id, yes) => pa('s-bids-approve', { id, approve: yes }, { authorization: 'Bearer staff-owner' });

/* ═════ the browser ═════ */
const PW_MOD = process.env.NODE_PATH && fs.existsSync(path.join(process.env.NODE_PATH.split(':')[0], 'playwright')) ? path.join(process.env.NODE_PATH.split(':')[0], 'playwright') : 'playwright';
const { chromium } = require(PW_MOD);
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [], bad = [];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
async function portalCtx(){
  const ctx = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === 'sb.test' && u.pathname.startsWith('/storage/v1/object/upload/sign/')) {   /* the signed upload (browser → Supabase storage) */
      if (rq.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS, body: '' });
      UPLOADS.push({ path: decodeURIComponent(u.pathname.split('/upload/sign/subportal-files/')[1] || ''), size: (rq.postDataBuffer() || Buffer.alloc(0)).length, type: rq.headers()['content-type'] });
      return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{"Key":"ok"}' });
    }
    if (u.host !== 'portal.test') return r.abort('blockedbyclient');
    const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
    if (fm) {
      let a = ''; try { a = JSON.parse(rq.postData() || '{}').action; } catch (e) {}
      const fn = fm[1] === 'portal-access' ? PA : fm[1] === 'subportal' ? SPF : null;
      if (!fn) return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
      const resp = await fn.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': ipNext() }, rq.headers()), body: rq.postData() || '' });
      if (resp.statusCode >= 500) bad.push(fm[1] + ':' + a + ' → ' + resp.statusCode + ' ' + String(resp.body).slice(0, 160));
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    const f = path.join(BUILD, u.pathname === '/' ? 'portal.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  return ctx;
}
async function newPage(ctx){ const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); }); return p; }
const txt = (p, sel) => p.textContent(sel || 'body').catch(() => '');
const stored = p => p.evaluate(() => localStorage.getItem('gc_portal_s') || '');
async function signinPw(p, email, pw){
  await p.goto('https://portal.test/'); await p.waitForSelector('#siEmail', { timeout: 15000 });
  await p.fill('#siEmail', email); await p.fill('#siPw', pw); await p.click('#siLogin');
}
const EMAIL = 'john@samplenewpaint.test', PW = 'Johns-New-Pass-1';

/* ─── 1. sign up → signed straight in (pending) ─── */
const C = await portalCtx();
const P = await newPage(C);
let pendTok = '';
{
  await P.goto('https://portal.test/'); await P.waitForSelector('#siSignup', { timeout: 20000 });
  await P.click('#siSignup'); await P.waitForSelector('#signupBox', { timeout: 15000 });
  const v = { company: 'Sample New Paint LLC', name: 'John Sample', email: 'John@SampleNewPaint.test', phone: '901-555-0177', city: 'Memphis', state: 'tn', pw: PW, pw2: PW };
  for (const k of Object.keys(v)) await P.fill('#su_' + k, v[k]);
  await P.click('[data-su-trade="Paint"]'); await P.check('#pp_w9_later'); await P.check('#su_agree');
  await P.click('#suGo');
  const box = await P.waitForSelector('#pendBox', { timeout: 20000 }).catch(() => null);
  const prof = profOf(EMAIL); pendTok = await stored(P);
  ok('1 sign-up → the account is made (Supabase sign-in + profile, approved: false)', !!ACC[EMAIL] && ACC[EMAIL].pw === PW && prof && prof.approved === false && prof.role === 'sub', prof);
  ok('1 … and they are signed STRAIGHT in to the waiting page (no second password, no "Account created → Sign in")', !!box && !(await P.$('#signupDone')) && !(await P.$('#signinBox')), await txt(P, '#main'));
  const row = sessRow(pendTok);
  ok('1 … a pending session (kind pending, tied to their profile id, no portal links)', row && row.kind === 'pending' && row.sub_id === prof.id && Array.isArray(row.links) && row.links.length === 0 && !row.revoked, row);
  const t1 = await txt(P, '#pendBox');
  ok('1 the page: "✅ You\'re signed in. GrayCo is reviewing your sign-up (usually the same business day). You\'ll get an e-mail when you\'re approved." + Call GrayCo 901-585-0944',
    /✅ You're signed in\./.test(t1) && /GrayCo is reviewing your sign-up \(usually the same business day\)\. You'll get an e-mail when you're approved\./.test(t1) && (await P.getAttribute('#pendCall', 'href')) === 'tel:9015850944' && /901-585-0944/.test(t1), t1.slice(0, 500));
  ok('1 the papers checklist: W-9 ("you said you have it"), COI, workers\' comp, licenses — each with 📎 Upload',
    (await P.$$eval('#pendPapers [data-pd]', x => x.map(e => e.getAttribute('data-pd')))).join() === 'w9,gl,wc,lic' && /You said you have it/.test(await txt(P, '[data-pd="w9"]')) && /Not on file yet/.test(await txt(P, '[data-pd="gl"]')) && (await P.$$('[data-pd-up]')).length === 4, await txt(P, '#pendPapers'));
  ok('1 the Sign out button shows; no partner tabs / jobs / pay on the page', await P.isVisible('#signOut') && !(await P.isVisible('#tabs')) && !/Pay|Invoices|SECRET|Kitchen/.test(await txt(P, '#main')), await txt(P, '#main'));
  const w = await P.evaluate(() => document.documentElement.scrollWidth); ok('1 phone width: no sideways scroll', w <= 390, w);
  await shot(P, 'subpend_01_pending_after_signup');
}

/* ─── 2. sign out → sign in again with the same password ─── */
{
  await P.click('#signOut'); await P.waitForSelector('#siEmail', { timeout: 15000 });
  ok('2 Sign out → the sign-in screen, the pending session ended on the server', !(await stored(P)) && sessRow(pendTok).revoked === true);
  await signinPw(P, '  JOHN@samplenewpaint.TEST ', PW);
  const box = await P.waitForSelector('#pendBox', { timeout: 20000 }).catch(() => null);
  ok('2 sign in again with the password just made (e-mail in any case, with spaces) → the waiting page, NOT "Your GrayCo Portal is not turned on yet"', !!box && !/not turned on/i.test(await txt(P)), await txt(P, '#siErr'));
  pendTok = await stored(P);
  ok('2 … a fresh pending session', sessRow(pendTok) && sessRow(pendTok).kind === 'pending');
  await P.reload(); ok('2 reload → still on the waiting page (stays signed in)', !!(await P.waitForSelector('#pendBox', { timeout: 15000 }).catch(() => null)));
}

/* ─── 3. papers ─── */
{
  const prof = profOf(EMAIL), u0 = UPLOADS.length;
  await P.click('[data-pd-up="gl"]');
  await P.setInputFiles('[data-pd-file="gl"]', { name: 'gl-coi.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample GL certificate') });
  await P.click('[data-pd-send="gl"]');
  ok('3 a COI without its expiry date → asked for it', /expiration date/i.test(await txt(P, '[data-pd-form="gl"] .err')), await txt(P, '[data-pd-form="gl"]'));
  await P.fill('[data-pd-exp="gl"]', day(200)); await P.click('[data-pd-send="gl"]');
  const on = await waitFor(async () => /On file/.test(await txt(P, '[data-pd="gl"]')), 15000);
  const docs = (T.sp_rows.find(r => r.key === 'subdocs/' + prof.id) || {}).data;
  ok('3 📎 Upload from the waiting page → stored under THEIR folder and saved as their bid-site papers (subdocs) with the expiry', UPLOADS.length === u0 + 1 && UPLOADS[u0].path.indexOf('u/' + prof.id + '/') === 0 && docs && docs.items.some(d => d.type === 'insurance_general' && d.expirationDate === day(200) && d.fileRef.indexOf('u/' + prof.id + '/') === 0), { up: UPLOADS.slice(u0), docs });
  ok('3 … and the checklist shows it "On file"', !!on, await txt(P, '[data-pd="gl"]'));
  await P.click('[data-pd-up="wc"]'); await P.check('[data-pd-exempt="wc"]');
  await P.setInputFiles('[data-pd-file="wc"]', { name: 'wc-exempt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 0, 9, 9]) });
  await P.click('[data-pd-send="wc"]');
  ok('3 workers\' comp exemption (no date needed) → on file as exempt', !!(await waitFor(async () => /Exempt \(sole proprietor\) — on file/.test(await txt(P, '[data-pd="wc"]')), 15000)), await txt(P, '[data-pd="wc"]'));
  await shot(P, 'subpend_03_papers');
}

/* ─── 4. contact info ─── */
{
  const prof0 = profOf(EMAIL);
  await P.click('#pendEdit'); await P.fill('[data-pd-c="phone"]', '901-555-0199'); await P.fill('[data-pd-c="businessCity"]', 'Germantown'); await P.click('#pendSave');
  await waitFor(async () => /901-555-0199/.test(await txt(P, '#pendContact')), 10000);
  const prof = profOf(EMAIL);
  ok('4 contact info edit → their profile (phone, city) saved', prof.phone === '901-555-0199' && prof.businessCity === 'Germantown' && /901-555-0199/.test(await txt(P, '#pendContact')), prof);
  const r = await pa('pend-contact', { contact: { approved: true, role: 'admin', email: 'evil@x.test', crmSubId: SUB.id, name: 'John Sample' } }, { 'x-portal-session': pendTok });
  const p2 = profOf(EMAIL);
  ok('4 … it can never change approved / role / e-mail / the CRM link', r.status === 200 && p2.approved === false && p2.role === 'sub' && p2.email === EMAIL && !p2.crmSubId && p2.id === prof0.id, p2);
}

/* ─── 5. what a pending session can NOT do ─── */
{
  const H = { 'x-portal-session': pendTok };
  const out = {};
  for (const a of ['p-home', 'p-job', 'p-invoice', 'p-bidjobs', 'p-msgs', 'p-paper']) out[a] = (await pa(a, { projectId: JOB.id }, H)).status;
  ok('5 partner actions (home, job, invoice, bids, messages, papers) → 403 "waiting for approval"', Object.values(out).every(s => s === 403), out);
  const c = await pa('c-jobs', {}, H), s1 = await pa('s-sync', {}, H), wh = await pa('whoami', {}, H), me = await pa('pend-me', {}, H);
  ok('5 customer actions → not active (404); staff actions → refused (401)', c.status === 404 && s1.status === 401, [c.status, s1.status]);
  ok('5 whoami → kind "pending"', wh.status === 200 && wh.data.kind === 'pending' && wh.data.state === 'pending', wh.data);
  ok('5 pend-me carries only their own sign-up: no jobs, invoices, pay, other subs', me.status === 200 && Object.keys(me.data).sort().join() === 'kind,lang,me,message,ok,paperToken,papers,state' && !/SECRET|9876|Kitchen|Olga|SUBold1|PSAMPLE1/.test(me.raw), me.raw.slice(0, 400));
  const other = await spf('signup-papers', { paperToken: me.data.paperToken, items: [{ type: 'w9', fileRef: 'u/u_someoneelse/x.pdf' }] });
  ok('5 the papers token reaches only their own folder (another sub\'s file is refused)', other.status === 200 && other.data.saved === 0, other);
  const forged = await pa('whoami', {}, { 'x-portal-session': 'Z'.repeat(43) });
  ok('5 a made-up session → not active', forged.status === 404);
}

/* ─── 6. wrong password: the normal answer, never locked ─── */
{
  const outs = [];
  for (let i = 0; i < 7; i++) outs.push(await pa('signin-password', { email: EMAIL, password: 'wrong-pass-' + i }));
  ok('6 a wrong password → 401 "That e-mail and password don\'t match" every time (7 in a row, no lock-out)', outs.every(r => r.status === 401 && /don't match/.test(r.data.error)), outs.map(r => r.status + ' ' + r.data.error));
  const good = await pa('signin-password', { email: EMAIL, password: PW });
  ok('6 … and the right password right after still signs in (pending)', good.status === 200 && good.data.kind === 'pending' && good.data.session, good.data);
  const lock = T.gc_portal_lock.filter(x => x.locked_until); ok('6 nothing is ever locked (PWNOLOCK)', lock.length === 0, lock);
  const none = await pa('signin-password', { email: 'nobody@sample.test', password: 'whatever-1' });
  ok('6 an unknown e-mail → the same "don\'t match"', none.status === 401 && /don't match/.test(none.data.error));
  await P.click('#signOut'); await P.waitForSelector('#siEmail'); await signinPw(P, EMAIL, 'not-my-pass');
  ok('6 on the page: wrong password → "don\'t match" under the box', !!(await waitFor(async () => /don't match/.test(await txt(P, '#siErr')), 10000)), await txt(P, '#siErr'));
  await P.fill('#siPw', PW); await P.click('#siLogin'); await P.waitForSelector('#pendBox', { timeout: 15000 });
  pendTok = await stored(P);
}

/* ─── 7. Español; owner approves → the full portal, same sign-in ─── */
{
  await P.click('#langBtn'); await P.waitForSelector('#pendBox'); await sleep(300);
  const es = await txt(P, '#pendBox');
  ok('7 Español: "✅ Ya entró a su cuenta. GrayCo está revisando su registro…" + Llame a GrayCo', /✅ Ya entró a su cuenta\./.test(es) && /GrayCo está revisando su registro/.test(es) && /Llame a GrayCo 901-585-0944/.test(es) && /Sus documentos/.test(es), es.slice(0, 300));
  await shot(P, 'subpend_07_pending_es');
  await P.click('#langBtn'); await P.waitForSelector('#pendBox'); await sleep(200);
  await P.click('#pendCheck'); await sleep(800);
  ok('7 "↻ Check again" before approval → still waiting', !!(await P.$('#pendBox')));
  const prof = profOf(EMAIL);
  const ap = await approve(prof.id, true); reset();
  ok('7 the owner approves (s-bids-approve, as ✅ Approvals / Subs → Bid site requests)', ap.status === 200 && ap.data.approved === true && profOf(EMAIL).approved === true, ap);
  await P.click('#pendCheck');
  const full = await waitFor(async () => P.evaluate(() => !!(window.GCPartner && window.GCPartner._state && window.GCPartner._state().home) && !document.getElementById('pendBox')), 20000);
  const row = sessRow(pendTok), bidId = 'SBP' + EMAIL.replace(/[^a-z0-9]+/g, '').slice(0, 24);
  ok('7 "↻ Check again" → the full partner portal by itself (no second sign-in)', !!full && !(await P.$('#signinBox')), await txt(P, '#main'));
  ok('7 … with the SAME sign-in: the session row became kind partner, its link made automatically', row.kind === 'partner' && row.sub_id === bidId && row.links.length === 1 && T.gc_sub_link.some(l => l.token === row.links[0] && l.sub_id === bidId && !l.revoked) && (await stored(P)) === pendTok, row);
  const home = await pa('p-home', {}, { 'x-portal-session': pendTok });
  ok('7 partner actions now open (p-home 200), still never another sub\'s pay', home.status === 200 && !/SECRET-77|9876/.test(home.raw), home.status);
  await P.reload();
  ok('7 reload → the full portal', !!(await waitFor(async () => P.evaluate(() => !!(window.GCPartner && window.GCPartner._state().home)), 20000)));
  await shot(P, 'subpend_07_full_portal');
}

/* ─── 7b. approved while the page is closed: the next open (whoami) upgrades ─── */
{
  const e2 = 'maria@samplenewtile.test', pw2 = 'Maria-Pass-22';
  const r = await spf('register', { email: e2, password: pw2, profile: { name: 'Maria Sample', company: 'Sample New Tile LLC', phone: '901-555-0123', trades: ['Tile'], lang: 'es' } });
  const s1 = await pa('signin-password', { email: e2, password: pw2 });
  ok('7b a bid-site / portal sign-up (Spanish) signs in → pending', r.status === 200 && s1.status === 200 && s1.data.kind === 'pending' && s1.data.lang === 'es', [r.data, s1.data]);
  await approve(profOf(e2).id, true); reset();
  const w = await pa('whoami', {}, { 'x-portal-session': s1.data.session });
  ok('7b … approved → the next whoami answers kind partner (session upgraded, no new sign-in)', w.status === 200 && w.data.kind === 'partner' && sessRow(s1.data.session).kind === 'partner', w.data);
  const C3 = await portalCtx(); const P3 = await newPage(C3);
  const tok2 = s1.data.session;
  await P3.addInitScript(([s]) => { localStorage.setItem('gc_portal_s', s); }, [tok2]); await P3.goto('https://portal.test/');
  ok('7b … and the page opens straight into the full portal', !!(await waitFor(async () => P3.evaluate(() => !!(window.GCPartner && window.GCPartner._state().home)), 20000)));
  await C3.close();
}

/* ─── 8. denied ─── */
{
  const e3 = 'dan@samplenewdeny.test', pw3 = 'Dan-Pass-333';
  await spf('register', { email: e3, password: pw3, profile: { name: 'Dan Sample', company: 'Sample Deny LLC', phone: '901-555-0133', trades: ['Paint'] } });
  const s1 = await pa('signin-password', { email: e3, password: pw3 });
  const C4 = await portalCtx(); const P4 = await newPage(C4);
  await P4.addInitScript(([s]) => { localStorage.setItem('gc_portal_s', s); }, [s1.data.session]); await P4.goto('https://portal.test/');
  await P4.waitForSelector('#pendBox', { timeout: 15000 });
  const dn = await approve(profOf(e3).id, false); reset();
  await P4.reload();
  const d = await P4.waitForSelector('#pendDenied', { timeout: 15000 }).catch(() => null);
  ok('8 denied while signed in → "Your sign-up was not approved — call GrayCo 901-585-0944" (+ Call), no papers / contact forms', dn.status === 200 && !!d && /Your sign-up was not approved — call GrayCo 901-585-0944/.test(await txt(P4, '#pendBox')) && !(await P4.$('#pendPapers')) && (await P4.getAttribute('#pendCall', 'href')) === 'tel:9015850944', await txt(P4, '#main'));
  await shot(P4, 'subpend_08_denied');
  const s2 = await pa('signin-password', { email: e3, password: pw3 });
  ok('8 signing in after a denial → 403 "Your sign-up was not approved — call GrayCo" (clear, not "don\'t match", not "not turned on")', s2.status === 403 && /not approved — call GrayCo 901-585-0944/.test(s2.data.error), s2.data);
  await P4.click('#signOut'); await P4.waitForSelector('#siEmail'); await signinPw(P4, e3, pw3);
  ok('8 … shown under the sign-in box', !!(await waitFor(async () => /not approved/.test(await txt(P4, '#siErr')), 10000)), await txt(P4, '#siErr'));
  const s3 = await pa('signin-password', { email: e3, password: 'wrong-one-9' });
  ok('8 a wrong password for a denied account → still just "don\'t match"', s3.status === 401 && /don't match/.test(s3.data.error));
  /* the bid site's own Deny removes the profile */
  const e4 = 'gone@samplenewgone.test';
  await spf('register', { email: e4, password: 'Gone-Pass-44', profile: { name: 'Gina Sample', company: 'Sample Gone LLC', phone: '901-555-0144', trades: ['Paint'] } });
  const g1 = await pa('signin-password', { email: e4, password: 'Gone-Pass-44' });
  T.sp_rows = T.sp_rows.filter(r => !(r.collection === 'users' && r.email === e4));
  const g2 = await pa('whoami', {}, { 'x-portal-session': g1.data.session });
  ok('8 the bid site\'s Deny removed the profile → the open page says "not approved"', g2.status === 200 && g2.data.kind === 'pending' && g2.data.state === 'denied', g2.data);
  await C4.close();
}

/* ─── 9. the e-mail is also a customer's with their own password ─── */
{
  T.gc_portal_login.push({ login: 'e:casey@samplepaint.test', pw_hash: PA._core.pwHash('Customer-Own-1'), changed: true });
  await spf('register', { email: 'casey@samplepaint.test', password: 'Casey-Sub-Pass-1', profile: { name: 'Casey Sample', company: 'Sample Casey Paint', phone: '901-555-0155', trades: ['Paint'] } });
  const a = await pa('signin-password', { email: 'casey@samplepaint.test', password: 'Casey-Sub-Pass-1' });
  const b = await pa('signin-password', { email: 'casey@samplepaint.test', password: 'Customer-Own-1' });
  ok('9 an e-mail that is also a customer\'s (own password saved): the SUB password signs in (pending) — was "don\'t match"', a.status === 200 && a.data.kind === 'pending', a.data);
  ok('9 … and the customer password still opens the customer portal', b.status === 200 && b.data.kind === 'customer', b.data);
}
await C.close();

/* ─── 10. bids.grayco-cs.com: an unapproved account signs in ─── */
{
  const SBH = 'ieeonhpfahmwwecizdut.supabase.co';
  const e5 = 'wait@samplenewbid.test', pw5 = 'Wait-Pass-55';
  await spf('register', { email: e5, password: pw5, profile: { name: 'Walt Sample', company: 'Sample Wait Bids LLC', phone: '901-555-0166', trades: ['Paint'] } });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === SBH && u.pathname === '/auth/v1/token') {
      const b = JSON.parse(rq.postData() || '{}'); const a = ACC[String(b.email).toLowerCase()];
      if (!a || a.pw !== b.password) return r.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: '{"error":"invalid_grant","error_description":"Invalid login credentials"}' });
      const tok = 't-' + crypto.randomBytes(6).toString('hex'); TOK[tok] = String(b.email).toLowerCase();
      return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ access_token: tok, refresh_token: 'r-' + tok, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: a.id, email: b.email } }) });
    }
    if (u.host === SBH) return r.fulfill({ status: 204, headers: CORS, body: '' });
    if (u.host !== 'bids.test') return r.abort('blockedbyclient');
    if (u.pathname === '/.netlify/functions/subportal') {
      const resp = await SPF.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://bids.test', 'x-nf-client-connection-ip': ipNext() }, rq.headers()), body: rq.postData() || '' });
      if (resp.statusCode >= 500) bad.push('bids:' + resp.statusCode + ' ' + String(resp.body).slice(0, 120));
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    if (/^\/\.netlify\/functions\//.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const dir = path.join(BUILD, 'subportal');
    const f = path.join(dir, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  const B = await newPage(ctx); await B.goto('https://bids.test/');
  await B.waitForSelector('input[type=email]', { timeout: 30000 });
  await B.fill('input[type=email]', e5); await B.fill('input[type=password]', pw5); await B.press('input[type=password]', 'Enter');
  const w = await B.waitForSelector('#bids-waiting', { timeout: 20000 }).catch(() => null);
  const t = await txt(B);
  ok('10 bid site: an unapproved account signs in → "Waiting for GrayCo approval … upload your W-9 and insurance certificates here … Call 901-585-0944" (no error, no bounce to sign-in)',
    !!w && /Waiting for GrayCo approval/.test(t) && /upload your W-9 and insurance/.test(t) && !(await B.$('input[type=password]')), t.slice(0, 400));
  ok('10 … on My Documents (where they upload their papers)', /My Documents/.test(t) && /W-9/.test(t), t.slice(0, 600));
  await shot(B, 'subpend_10_bids_waiting');
  await ctx.close();
}

await browser.close();
ok('no page errors', errs.length === 0, errs.slice(0, 5));
ok('no 5xx from the server functions', bad.length === 0, bad.slice(0, 5));
const n = R.filter(Boolean).length;
console.log('\n' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
