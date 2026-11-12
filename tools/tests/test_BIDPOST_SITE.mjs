// test_BIDPOST_SITE.mjs <build-dir> [shot-dir] — the BID SITE itself (bids.grayco-cs.com, subportal/ built from subportal-app/src) end to end
// (patch BIDPOST + SIGNUPPAPERS), offline: the built React app in Chromium against the REAL netlify/functions/subportal.js on an in-memory
// Supabase (sp_rows, gc_staff, the sign-in, the file bucket). Made-up people, jobs and files only.
//   Owner: "will I be able to add the plans in the bid portal, and will it be clear from all old not-right jobs where it's only the 1 job
//   in it, and I can add a decent size plan set to it as a public bid?"
//   1. the admin list after the clean-up: only the job posted on purpose (auto-added ones archived; "🗄 Show archived (n)");
//      a job with no due date says "No due date" (never "NaN days left · Due Invalid Date");
//   2. the admin adds ONE public job, opens it, uploads a PDF and a ZIP (unpacked into the plans) and adds a 🔗 plan link for a set over
//      50 MB ("Over 50 MB? Paste a Drive/Dropbox link" — Google Drive is not set up here);
//   3. an approved sub sees that public job with the plans and "🔗 Open plans ↗";
//   4. "Request Access": one short screen + the papers (later / upload / exempt), on a phone and a computer; the uploaded papers are
//      saved as the sub's My Documents, the ticks as "says they have it".
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
delete process.env.RESEND_API_KEY;
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), now = new Date().toISOString();

/* ── the in-memory Supabase ── */
const DB = { sp_rows: [], gc_staff: [{ email: 'samplepm@grayco-cs.com', name: 'Sample PM', role: 'admin', active: true }] };
const ACC = { 'samplepm@grayco-cs.com': { pw: 'Admin-Pass-1', id: 'auth-w' }, 'sam@sampledrywall.test': { pw: 'Sub-Pass-123', id: 'auth-s' } };
const TOK = {}, STORE = new Map();
const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now }, extra || {});
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => body.buffer ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0) });
const dec = v => decodeURIComponent(String(v || ''));
function query(rows, q){
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dec(v.slice(3)));
    else if (v.startsWith('in.')) { const l = dec(v.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => l.includes(String(r[k]))); }
  }
  return rows;
}
async function sbFetch(url, init){
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  const auth = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, '');
  if (u.pathname === '/auth/v1/user') return TOK[auth] ? res(200, { id: ACC[TOK[auth]].id, email: TOK[auth] }) : res(401, {});
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body); ACC[b.email] = { pw: b.password, id: 'auth-' + crypto.randomBytes(3).toString('hex') }; return res(200, { id: ACC[b.email].id }); }
  if (u.pathname === '/rest/v1/sp_rows') {
    if (m === 'POST') { (JSON.parse(init.body)).forEach(r => { const i = DB.sp_rows.findIndex(x => x.key === r.key); if (i >= 0) DB.sp_rows[i] = Object.assign({}, DB.sp_rows[i], r); else DB.sp_rows.push(r); }); return res(201, []); }
    const rows = query(DB.sp_rows.slice(), q);
    if (m === 'DELETE') { rows.forEach(r => DB.sp_rows.splice(DB.sp_rows.indexOf(r), 1)); return res(204, ''); }
    return res(200, rows.sort((a, b) => a.key < b.key ? -1 : 1));
  }
  if (u.pathname === '/rest/v1/gc_staff') return res(200, DB.gc_staff);
  if (u.pathname === '/rest/v1/gc_kv' || u.pathname === '/rest/v1/gc_lead_inbox_kv') return res(200, []);
  let mm;
  if ((mm = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'POST') return res(200, { url: '/object/upload/sign/' + mm[1] + '/' + mm[2] + '?token=up' });
  if ((mm = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'PUT') { STORE.set(mm[1] + '/' + dec(mm[2]), Buffer.from(init.body || '')); return res(200, { Key: mm[2] }); }
  if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)$/.exec(u.pathname))) { const b = JSON.parse(init.body); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/' + mm[1] + '/' + p + '?token=s' }))); }
  if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(u.pathname))) { const b = STORE.get(mm[1] + '/' + dec(mm[2])); return b ? res(200, b) : res(404, {}); }
  if ((mm = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(u.pathname))) {
    const k = mm[1] + '/' + dec(mm[2]).split('/').map(decodeURIComponent).join('/');
    if (m === 'POST') { STORE.set(k, Buffer.from(init.body)); return res(200, { Key: k }); }
    const b = STORE.get(k) || STORE.get(mm[1] + '/' + dec(mm[2])); return b ? res(200, b) : res(404, {});
  }
  return res(404, {});
}
global.fetch = async (url, init) => { const u = new URL(url); if (u.host === 'sb.test') return sbFetch(url, init); return res(404, {}); };
const SPF = require(path.join(BUILD, 'netlify/functions/subportal.js'));

/* ── made-up data: the admin, an approved sub with papers, the old auto-added jobs (archived by the clean-up), one real job ── */
DB.sp_rows.push(spRow('users', 'u_sam', { id: 'u_sam', role: 'sub', approved: true, email: 'sam@sampledrywall.test', name: 'Sam Sample', company: 'Sample Drywall LLC', phone: '901-555-0141', trades: ['Drywall', 'Paint'] }, { user_id: 'u_sam', email: 'sam@sampledrywall.test' }));
DB.sp_rows.push(spRow('subdocs', 'u_sam', { items: [{ id: 'd1', type: 'w9', fileRef: 'u/u_sam/w9.pdf' }, { id: 'd2', type: 'insurance_general', expirationDate: day(200), fileRef: 'u/u_sam/gl.pdf' }, { id: 'd3', type: 'insurance_workers_comp', expirationDate: day(150), fileRef: 'u/u_sam/wc.pdf' }] }, { user_id: 'u_sam' }));
['Sample Lead Ann', 'Sample Lead Bo', 'Sample Lead Cy', 'Sample Refurb - 100 Test St'].forEach((t, i) => DB.sp_rows.push(spRow('jobs', 'j_old' + i, { id: 'j_old' + i, title: t, status: 'archived', archivedAt: now, archivedReason: 'auto', draft: true, visibility: 'private', createdBy: 'lead-inbox', leadInbox: { id: 'LI-' + i } }, { job_id: 'j_old' + i })));
DB.sp_rows.push(spRow('jobs', 'j_nodue', { id: 'j_nodue', title: 'Sample Shed Repair (no due date yet)', status: 'open', visibility: 'private', draft: false, bidDueDate: '', postedAt: now, postedBy: 'samplepm@grayco-cs.com', tradesSought: 'Framing' }, { job_id: 'j_nodue' }));

/* a ZIP (stored, no compression) with two plan sheets in folders */
function zipOf(files){
  const parts = [], central = []; let off = 0;
  const crc = b => { let c, t = [], r = 0xFFFFFFFF; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } for (const x of b) r = t[(r ^ x) & 0xFF] ^ (r >>> 8); return (r ^ 0xFFFFFFFF) >>> 0; };
  for (const f of files) {
    const name = Buffer.from(f.name), data = f.data, c = crc(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, data); central.push(ch, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, e]));
}
const PDF = n => Buffer.from('%PDF-1.4\n% sample sheet ' + n + '\n' + 'x'.repeat(2000) + '\n%%EOF');

/* ── the browser ── */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const SBH = 'ieeonhpfahmwwecizdut.supabase.co';
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const CALLS = [];
async function ctxFor(kind){
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 860 } }));
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === SBH && u.pathname === '/auth/v1/token') {
      const b = JSON.parse(rq.postData() || '{}');
      let email = '';
      if (u.searchParams.get('grant_type') === 'password') { const a = ACC[String(b.email).toLowerCase()]; if (!a || a.pw !== b.password) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_grant"}' }); email = String(b.email).toLowerCase(); }
      else { email = TOK[String(b.refresh_token).replace(/^r-/, '')]; if (!email) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_grant"}' }); }
      const tok = 't-' + crypto.randomBytes(6).toString('hex'); TOK[tok] = email;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: tok, refresh_token: 'r-' + tok, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: ACC[email].id, email } }) });
    }
    if (u.host === 'sb.test') {   /* the browser PUTs a picked file to its signed upload link */
      if (rq.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      const x = await sbFetch(rq.url(), { method: rq.method(), headers: rq.headers(), body: rq.postDataBuffer() });
      return r.fulfill({ status: x.status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: await x.text() });
    }
    if (u.host !== 'bids.test') return r.abort('blockedbyclient');
    if (u.pathname === '/.netlify/functions/subportal') {
      const resp = await SPF.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://bids.test', 'x-nf-client-connection-ip': '10.0.0.' + (CALLS.length % 200) }, rq.headers()), body: rq.postData() || '' });
      let a = ''; try { a = JSON.parse(rq.postData() || '{}').action; } catch (e) {}
      CALLS.push(a + ':' + resp.statusCode);
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    if (u.pathname === '/.netlify/functions/gdrive') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"configured":false}' });
    const f = path.join(BUILD, 'subportal', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  return ctx;
}
const errs = [];
async function page(ctx){ const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await p.goto('https://bids.test/'); return p; }
async function login(p, email, pw){
  await p.waitForSelector('input[type=email]', { timeout: 30000 });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', pw); await p.press('input[type=password]', 'Enter');
}
const fieldIn = (p, label, tag) => p.locator('xpath=//label[starts-with(normalize-space(.), "' + label + '")]/following-sibling::' + (tag || 'input')).first();
const shot = async (p, name, full) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }); };
const D = await ctxFor('desktop');

/* 1. the admin list after the clean-up */
const A = await page(D); await login(A, 'samplepm@grayco-cs.com', 'Admin-Pass-1');
await A.waitForSelector('[data-archived-toggle]', { timeout: 30000 });
const list1 = await A.evaluate(() => ({ cards: [...document.querySelectorAll('h3, h4')].map(x => x.textContent.trim()).filter(t => /Sample|Ryan|Brandon|Wesley|VMF/.test(t)), btn: document.querySelector('[data-archived-toggle]').textContent, body: document.body.innerText }));
ok('1 after the clean-up the admin list shows only the real job; "🗄 Show archived (4)"', /Show archived \(4\)/.test(list1.btn) && /Sample Shed Repair/.test(list1.body) && !/Sample Lead Ann|Sample Lead Cy|Sample Refurb/.test(list1.body), list1);
ok('1 no due date → "No due date" (never "NaN days left" / "Invalid Date")', /No due date/.test(list1.body) && !/NaN|Invalid Date/.test(list1.body), list1.body.slice(0, 600));
await shot(A, '06_bidsite_admin_after_cleanup');
await A.click('[data-archived-toggle]'); await sleep(300);
const list2 = await A.evaluate(() => document.body.innerText);
ok('1 "Show archived" lists the 4 old auto-added jobs (archived, not deleted)', /Sample Lead Ann/.test(list2) && /Sample Refurb/.test(list2) && /Archived/.test(list2), list2.slice(0, 400));
await A.click('[data-archived-toggle]'); await sleep(200);
/* 2. ONE public job with plans */
await A.click('text=Add Job'); await fieldIn(A, 'Project Title').waitFor({ timeout: 15000 });
await fieldIn(A, 'Project Title').fill('Sample Office Build-Out');
await fieldIn(A, 'Project Address').fill('2200 Sample Ave, Memphis, TN');
await fieldIn(A, 'Bid Due Date').fill(day(10));
await fieldIn(A, 'Trades / Scope We Need Bids For').fill('Drywall, Paint, Acoustic ceilings');
await A.click('button:has-text("Save")'); await sleep(1500);
let job = DB.sp_rows.find(r => r.collection === 'jobs' && r.data.title === 'Sample Office Build-Out');
ok('2 the admin adds one PUBLIC job on the bid site', !!job && job.data.visibility === 'public' && job.data.status === 'open' && job.data.bidDueDate === day(10), job && job.data);
await A.click('text=Sample Office Build-Out'); await A.waitForSelector('[data-plans="upload"]', { timeout: 15000 });
const hint = await A.textContent('[data-plans="linkhint"]');
ok('2 Google Drive is not set up here → "Over 50 MB? Paste a Drive/Dropbox link"', /Over 50 MB\? Paste a Drive\/Dropbox link/.test(hint) && !(await A.$('[data-plans="drive"]')), hint);
await A.setInputFiles('[data-plans="file"]', [{ name: 'A0.1 Cover sheet.pdf', mimeType: 'application/pdf', buffer: PDF('A0.1') }, { name: 'Plan set.zip', mimeType: 'application/zip', buffer: zipOf([{ name: 'Architectural/A1.1 Floor plan.pdf', data: PDF('A1.1') }, { name: 'Electrical/E1.1 Lighting.pdf', data: PDF('E1.1') }, { name: '__MACOSX/._junk', data: Buffer.from('x') }]) }]);
await A.waitForFunction(() => /A1\.1 Floor plan\.pdf/.test(document.body.innerText) && /E1\.1 Lighting\.pdf/.test(document.body.innerText) && /A0\.1 Cover sheet\.pdf/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
const plans = (DB.sp_rows.find(r => r.key === 'plans/' + job.id) || { data: { items: [] } }).data.items;
ok('2 a PDF and a ZIP: the ZIP is unpacked into its sheets (folders → categories), all on the job', plans.map(x => x.name).sort().join('|') === 'A0.1 Cover sheet.pdf|A1.1 Floor plan.pdf|E1.1 Lighting.pdf' && plans.some(x => x.category === 'Electrical'), plans.map(x => x.name + '/' + x.category));
await A.fill('[data-plans="linkurl"]', 'https://drive.google.com/file/d/sample-full-set/view'); await A.fill('[data-plans="linklabel"]', 'Full plan set (180 MB)');
await A.click('[data-plans="linkadd"]'); await sleep(1500);
job = DB.sp_rows.find(r => r.key === 'jobs/' + job.id);
ok('2 over 50 MB: a 🔗 plan link (Google Drive / Dropbox) is added to the job', (job.data.plansLinks || []).some(l => l.url === 'https://drive.google.com/file/d/sample-full-set/view' && l.label === 'Full plan set (180 MB)'), job.data.plansLinks);
await A.evaluate(() => { const e = document.getElementById('plans-admin'); if (e) e.scrollIntoView({ block: 'start' }); }); await sleep(300);
await shot(A, '07_bidsite_admin_public_job_plans');
/* 3. the sub's view of the public job */
const S = await page(await ctxFor('desktop')); await login(S, 'sam@sampledrywall.test', 'Sub-Pass-123');
await S.waitForSelector('text=Sample Office Build-Out', { timeout: 30000 });
const sl = await S.evaluate(() => document.body.innerText);
ok('3 an approved sub sees the public job in the list (days left · due date) — not the archived ones', /Sample Office Build-Out/.test(sl) && /days left · Due/.test(sl) && !/Sample Lead Ann|Sample Refurb/.test(sl), sl.slice(0, 500));
await S.click('text=Sample Office Build-Out'); await S.waitForSelector('#bid-planlinks', { timeout: 20000 });
const sv = await S.evaluate(() => ({ body: document.body.innerText, link: [...document.querySelectorAll('#bid-planlinks ~ div a, a[href*="drive.google.com"]')].map(a => [a.textContent.trim(), a.getAttribute('href'), a.getAttribute('target')]) }));
ok('3 the sub sees the plans (the PDF and the unpacked sheets) and "🔗 Open plans ↗ — Full plan set (180 MB)" (new tab)', /A1\.1 Floor plan\.pdf/.test(sv.body) && /E1\.1 Lighting\.pdf/.test(sv.body) && sv.link.some(l => /Open plans ↗ — Full plan set \(180 MB\)/.test(l[0]) && l[1] === 'https://drive.google.com/file/d/sample-full-set/view' && l[2] === '_blank'), sv.link);
ok('3 the plan pills say "Open plans ↗" for the link', /Open plans ↗/.test(sv.body));
await shot(S, '08_bidsite_sub_public_job_plans', true);
/* 4. Request Access: one short screen + the papers */
for (const kind of ['phone', 'desktop']) {
  const C = await ctxFor(kind), P = await page(C);
  await P.waitForSelector('text=Request Access', { timeout: 30000 }); await P.click('text=Request Access');
  await P.waitForSelector('[data-signup-papers]', { timeout: 15000 });
  const f = await P.evaluate(() => ({ su: [...document.querySelectorAll('[data-su]')].map(x => x.getAttribute('data-su')), labels: [...document.querySelectorAll('label')].map(l => l.textContent.trim()).join(' | '), w: document.documentElement.scrollWidth, rows: [...document.querySelectorAll('[data-pp-row]')].map(x => x.getAttribute('data-pp-row')) }));
  ok('4 [' + kind + '] Request Access is one short screen: company, name, e-mail, cell, city / state, crew, trades (+ other), area, password — and the papers rows', f.su.join() === 'company,name,email,phone,city,state,crew,trades,tradeOther,area,pw' && f.rows.join() === 'w9,gl,wc,lic' && !/Website|Union|EIN|DBA|Years in Business|Business Address/i.test(f.labels) && f.w <= (kind === 'phone' ? 390 : 1366), f);
  if (kind === 'phone') { await shot(P, '09_bidsite_signup_phone', true); await C.close(); continue; }
  await P.fill('[data-su="company"]', 'Sample Tile & Paint LLC'); await P.fill('[data-su="name"]', 'Tia Sample'); await P.fill('[data-su="email"]', 'tia@sampletile.test'); await P.fill('[data-su="phone"]', '901-555-0190');
  await P.fill('[data-su="city"]', 'Bartlett'); await P.fill('[data-su="state"]', 'tn'); await P.fill('[data-su="crew"]', '4');
  await P.click('[data-su-trade="Tile"]'); await P.click('[data-su-trade="Paint"]'); await P.fill('[data-su="area"]', 'Shelby county'); await P.fill('[data-su="pw"]', 'Tile-Pass-123');
  await P.check('[data-pp="w9_later"]'); await P.check('[data-pp="gl_upload"]'); await P.check('[data-pp="wc_exempt"]');
  await P.setInputFiles('[data-pp="gl"]', { name: 'gl-certificate.pdf', mimeType: 'application/pdf', buffer: PDF('GL') });
  await P.fill('[data-pp="gle"]', day(320));
  await shot(P, '10_bidsite_signup_desktop', true);
  await P.click('button:has-text("Request Access") >> nth=-1').catch(() => {});
  await sleep(4000);
  const prof = (DB.sp_rows.find(r => r.collection === 'users' && r.data.email === 'tia@sampletile.test') || {}).data;
  const docs = prof ? ((DB.sp_rows.find(r => r.key === 'subdocs/' + prof.id) || { data: { items: [] } }).data.items) : [];
  ok('4 signing up saves the short profile (trades from the buttons, city / state, crew, area) and what they SAY they have (W-9 later, WC exempt)', prof && prof.trades.join() === 'Tile,Paint' && prof.businessCity === 'Bartlett' && prof.businessState === 'TN' && String(prof.numEmployees) === '4'
    && prof.papersClaimed.w9 === true && prof.papersClaimed.wcExempt === true && prof.papersClaimed.gl === false && prof.approved === false, prof);
  ok('4 the uploaded GL certificate is saved as their My Documents (insurance_general with its expiry) — a claim is not a paper', docs.length === 1 && docs[0].type === 'insurance_general' && docs[0].expirationDate === day(320) && /^u\//.test(docs[0].fileRef || ''), docs);
  await C.close();
}
ok('no page errors', !errs.length, errs);
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'index-site.txt'), ['Bid site screenshots (test_BIDPOST_SITE.mjs) — made-up data; the built bid site against the real subportal.js on an in-memory database',
  '06_bidsite_admin_after_cleanup.png        bids.grayco-cs.com as the admin after the clean-up: only the job posted on purpose, "🗄 Show archived (4)", "No due date"',
  '07_bidsite_admin_public_job_plans.png     the admin\'s new PUBLIC job: Plans — a PDF + a ZIP (unpacked), "Over 50 MB? Paste a Drive/Dropbox link" and the 🔗 link added',
  '08_bidsite_sub_public_job_plans.png       an approved sub\'s view of that job: the plan sheets and "🔗 Open plans ↗ — Full plan set (180 MB)"',
  '09_bidsite_signup_phone.png               Request Access on a phone: one short screen + papers (I have it — later / 📎 Upload / Exempt)',
  '10_bidsite_signup_desktop.png             Request Access on a computer, filled in: trades picked, W-9 later, GL uploaded + expiry, WC exempt', ''].join('\n'));
await browser.close();
const n = R.filter(Boolean).length; console.log('BIDPOST_SITE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
