// test_PLANREQ_SITE.mjs <build-dir> [shot-dir] — patch PLANREQ + PLANREQ-A/B/C on the BID SITE itself (subportal/ built from subportal-app/src),
// offline: the built React app in Chromium against the REAL netlify/functions/subportal.js on an in-memory Supabase (+ gc_kv). Made-up data only.
//   Owner 11/12: "on bid portal if I don't have plans have where sub can request plans or more info and it emails and messages the PM or estimator";
//   "need to click private/public, make sure I can add all types of files, I have scopes I can't add in scopes, … put them in scopes by trade".
//   1. an approved sub on a job with NO plans: the big "📩 Request plans / more info" → the form (Plans ☐ Specs ☐ Site walk ☐ Other + note, their
//      company / name / phone / e-mail from the profile) → sent: the record, the PM's To-Do and the 💬 Job Messages post; asking twice → still one;
//   2. a job with plans: only the small "📩 Request more info" link; a phone (390 px) has no sideways scroll;
//   3. the admin: the request listed on the job; the 🔒/🌐 pill is a one-click switch (public asks first); uploading a Word scope + a plan sheet
//      → the scope lands on the Drywall trade, the sheet on Plans, the request closes;
//   4. the sub again: "✅ Plans are now posted", the update from GrayCo, and the Drywall scope file under their trade.
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
const TOK = {}, STORE = new Map(), KV = { gc_office_tasks: '[]', gc_job_messages: '[]', users: [{ id: 'U_pm', name: 'Sample PM', email: 'samplepm@grayco-cs.com', role: 'Project Manager', active: true }] }, KVT = {}; let KVN = 0;
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
  if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return res(200, []);
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { KV[r.key] = r.value; KVT[r.key] = 'T' + (++KVN); }); return res(201, []); }
    const k = dec(q.get('key') || ''), keys = k.startsWith('in.') ? k.slice(3).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [k.replace(/^eq\./, '')];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: KVT[x] || 'T0' })));
  }
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

/* ── made-up data: the PM (staff), an approved Drywall sub with papers, a job with no plans, a job with a plan link ── */
DB.sp_rows.push(spRow('users', 'u_sam', { id: 'u_sam', role: 'sub', approved: true, email: 'sam@sampledrywall.test', name: 'Sam Sample', company: 'Sample Drywall LLC', phone: '901-555-0141', trades: ['Drywall', 'Paint'] }, { user_id: 'u_sam', email: 'sam@sampledrywall.test' }));
DB.sp_rows.push(spRow('subdocs', 'u_sam', { items: [{ id: 'd1', type: 'w9', fileRef: 'u/u_sam/w9.pdf' }, { id: 'd2', type: 'insurance_general', expirationDate: day(200), fileRef: 'u/u_sam/gl.pdf' }, { id: 'd3', type: 'insurance_workers_comp', expirationDate: day(150), fileRef: 'u/u_sam/wc.pdf' }] }, { user_id: 'u_sam' }));
DB.sp_rows.push(spRow('jobs', 'j_np', { id: 'j_np', title: 'Sample Clinic Remodel (no plans yet)', address: '100 Sample Pkwy, Memphis, TN', status: 'open', visibility: 'public', draft: false, bidDueDate: day(9), postedAt: now, postedBy: 'samplepm@grayco-cs.com', pmEmail: 'samplepm@grayco-cs.com', pmName: 'Sample PM', pmId: 'st_samplepm', tradesSought: 'Drywall, Paint', scope: 'Interior remodel: 4 exam rooms and the lobby.', createdAt: now, createdByName: 'Sample PM' }, { job_id: 'j_np' }));
DB.sp_rows.push(spRow('jobs', 'j_wp', { id: 'j_wp', title: 'Sample Office Refresh (has plans)', address: '5 Demo Rd, Memphis, TN', status: 'open', visibility: 'public', draft: false, bidDueDate: day(12), postedAt: now, postedBy: 'samplepm@grayco-cs.com', pmEmail: 'samplepm@grayco-cs.com', tradesSought: 'Paint', plansLinks: [{ id: 'pl_1', url: 'https://drive.google.com/drive/folders/sample-set', label: 'Plan set' }], createdAt: now, createdByName: 'Sample PM' }, { job_id: 'j_wp' }));

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


const DOCX = zipOf([{ name: 'word/document.xml', data: Buffer.from('<w:document><w:body><w:p><w:r><w:t>SCOPE OF WORK — DRYWALL</w:t></w:r></w:p></w:body></w:document>') }]);
const kvl = k => { const v = KV[k]; return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const rowOf = k => (DB.sp_rows.find(r => r.key === k) || {}).data;
const waitFor = async (f, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = f(); if (v) return v; await sleep(250); } return v; };
async function openJob(p, title){ await p.waitForSelector('text=' + title, { timeout: 30000 }); await p.click('text=' + title); }

/* 1. the sub, a job with no plans */
const S = await page(D); await login(S, 'sam@sampledrywall.test', 'Sub-Pass-123');
await openJob(S, 'Sample Clinic Remodel (no plans yet)');
await S.waitForSelector('[data-planreq-open="big"]', { timeout: 20000 });
const b1 = await S.evaluate(() => ({ btn: document.querySelector('[data-planreq-open="big"]').textContent, box: document.getElementById('plans-request').innerText }));
ok('1 a job with no plans: a clear "📩 Request plans / more info" button', /📩 Request plans \/ more info/.test(b1.btn) && /plans are not here yet/i.test(b1.box), b1);
await S.evaluate(() => document.getElementById('plans-request').scrollIntoView({ block: 'center' }));
await shot(S, 'pr01_bidsite_sub_noplans_button');
await S.click('[data-planreq-open="big"]');
await S.waitForSelector('[data-planreq-form]');
const f1 = await S.evaluate(() => ({ needs: [...document.querySelectorAll('[data-planreq-need]')].map(x => x.getAttribute('data-planreq-need') + (x.checked ? '+' : '')), from: document.querySelector('[data-planreq-from]').textContent }));
ok('1 the form: ☐ Plans (ticked) ☐ Specs ☐ Site walk / access ☐ Other + note; "From (your profile): Sample Drywall LLC · Sam Sample · 901-555-0141 · sam@…"', f1.needs.join() === 'plans+,specs,sitewalk,other' && /Sample Drywall LLC · Sam Sample · 901-555-0141 · sam@sampledrywall\.test/.test(f1.from), f1);
await S.click('[data-planreq-need="plans"]'); await S.click('[data-plans="ask"]');
ok('1 nothing ticked → "Tick what you need."', /Tick what you need/.test(await S.textContent('[data-planreq-err]').catch(() => '')));
await S.click('[data-planreq-need="plans"]'); await S.click('[data-planreq-need="sitewalk"]');
await S.fill('[data-plans="note"]', 'Need the full set and a walk-through time, please.');
await shot(S, 'pr02_bidsite_sub_request_form');
await S.click('[data-plans="ask"]');
await S.waitForSelector('[data-plans="asked"]', { timeout: 20000 });
const q1 = await waitFor(() => rowOf('planreqs/j_np__u_sam'));
ok('1 sent: "✓ Request sent … Plans, Site walk / access" on the page', /Request sent .*: Plans, Site walk \/ access/.test(await S.textContent('[data-plans="asked"]')), await S.textContent('[data-plans="asked"]'));
ok('1 the request is saved (who, needs, note, phone from the profile), open', q1 && q1.status === 'open' && q1.needs.join() === 'plans,sitewalk' && q1.phone === '901-555-0141' && /walk-through/.test(q1.note), q1);
const td = kvl('gc_office_tasks').find(x => x.id === 'planreq_j_np__u_sam'), jm = kvl('gc_job_messages').find(x => x.planReqId === 'j_np__u_sam');
ok('1 the PM\'s To-Do "📩 Sample Drywall LLC asked for plans — Sample Clinic Remodel (no plans yet)" and a 💬 Job Messages post naming @Sample PM', td && td.label === '📩 Sample Drywall LLC asked for plans — Sample Clinic Remodel (no plans yet)' && td.assignees.join() === 'samplepm@grayco-cs.com' && jm && /^📩 @Sample PM — Sample Drywall LLC/.test(jm.text) && jm.notify[0].e === 'samplepm@grayco-cs.com', { td, jm });
await shot(S, 'pr03_bidsite_sub_request_sent');
/* 2. a job with plans: the small link; the phone */
const S2 = await page(D); await openJob(S2, 'Sample Office Refresh (has plans)');
await S2.waitForSelector('[data-planreq-open="small"]', { timeout: 20000 });
ok('2 a job with plans: the smaller "📩 Request more info" link (no big box)', /📩 Request more info/.test(await S2.textContent('[data-planreq-open="small"]')) && !(await S2.$('[data-planreq-big]')));
await S2.evaluate(() => document.getElementById('plans-request').scrollIntoView({ block: 'center' })); await shot(S2, 'pr04_bidsite_sub_hasplans_small_link');
const PH = await ctxFor('phone'), SP = await page(PH); await login(SP, 'sam@sampledrywall.test', 'Sub-Pass-123'); await openJob(SP, 'Sample Clinic Remodel (no plans yet)');
await SP.waitForSelector('[data-plans="asked"]', { timeout: 20000 });
const w = await SP.evaluate(() => document.documentElement.scrollWidth);
ok('2 on a phone (390 px): the request shows as sent, no sideways scroll; asking again is not offered while it is open', w <= 391 && !(await SP.$('[data-planreq-open]')), w);
await SP.evaluate(() => document.getElementById('plans-request').scrollIntoView({ block: 'center' })); await shot(SP, 'pr05_bidsite_sub_phone_sent');
const again = await SP.evaluate(async () => { const tok = JSON.parse(localStorage.getItem('gc_auth_v1') || '{}').access_token; const r = await fetch('/.netlify/functions/subportal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ action: 'request-plans', jobId: 'j_np', needs: ['other'], note: 'again' }) }); return r.json(); });
ok('2 asking again for the same job → "already" (one open request per sub per job)', again.already === true && kvl('gc_office_tasks').filter(x => /^planreq_j_np__/.test(x.id)).length === 1, again);
await PH.close();
/* 3. the admin */
const AD = await ctxFor('desktop'), A = await page(AD); A.on('dialog', d => d.accept()); await login(A, 'samplepm@grayco-cs.com', 'Admin-Pass-1');
await openJob(A, 'Sample Clinic Remodel (no plans yet)');
await A.waitForSelector('[data-planreq-admin]', { timeout: 20000 });
const ad = await A.textContent('[data-planreq-admin]');
ok('3 the admin sees the request: Sample Drywall LLC · Plans, Site walk / access — “note” · contact · open', /Sample Drywall LLC/.test(ad) && /Plans, Site walk \/ access/.test(ad) && /walk-through/.test(ad) && /901-555-0141/.test(ad) && /open/.test(ad), ad);
await A.waitForSelector('[data-vis-toggle]');
await A.click('[data-vis-toggle="private"]');
ok('3 🌐 Public ⇄ — one click makes it 🔒 Private', !!(await waitFor(() => rowOf('jobs/j_np').visibility === 'private')) && !!(await A.waitForSelector('[data-vis-toggle="public"]', { timeout: 8000 }).catch(() => null)));
await A.click('[data-vis-toggle="public"]');
ok('3 🔒 Private ⇄ — one click (it asks first) makes it 🌐 Public again', !!(await waitFor(() => rowOf('jobs/j_np').visibility === 'public')));
const acc = await A.getAttribute('[data-plans="file"]', 'accept');
ok('3 the upload takes every common type (Word, Excel, PowerPoint, text, pictures, DWG, ZIP)', ['.docx', '.xlsx', '.pptx', '.txt', '.csv', '.heic', '.dwg', '.zip', '.pdf'].every(x => acc.indexOf(x) > -1), acc);
await A.setInputFiles('[data-plans="file"]', [{ name: 'Drywall scope.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: DOCX }, { name: 'A-101 Floor plan.pdf', mimeType: 'application/pdf', buffer: PDF('A-101') }]);
const j3 = await waitFor(() => { const j = rowOf('jobs/j_np'); return j && (j.tradeScopes || []).some(x => x.trade === 'Drywall' && (x.files || []).length) && (j.plans || []).some(p => p.name === 'A-101 Floor plan.pdf') ? j : null; });
ok('3 "Drywall scope.docx" → the Drywall trade\'s scope files; "A-101 Floor plan.pdf" → Plans', !!j3, rowOf('jobs/j_np'));
const q3 = await waitFor(() => { const q = rowOf('planreqs/j_np__u_sam'); return q && q.status === 'closed' ? q : null; });
ok('3 plans added → the request closes ("plans"), its To-Do is done', q3 && q3.closedHow === 'plans' && kvl('gc_office_tasks').find(x => x.id === 'planreq_j_np__u_sam').done === true, q3);
await sleep(800); await A.evaluate(() => { const e = document.getElementById('plans-admin'); if (e) e.scrollIntoView({ block: 'start' }); });
await shot(A, 'pr06_bidsite_admin_requests_upload_sorted');
/* 4. the sub again */
const S3 = await page(await ctxFor('desktop')); await login(S3, 'sam@sampledrywall.test', 'Sub-Pass-123'); await openJob(S3, 'Sample Clinic Remodel (no plans yet)');
await S3.waitForSelector('[data-plans="ready"]', { timeout: 20000 });
const s4 = await S3.evaluate(() => ({ body: document.body.innerText, files: [...document.querySelectorAll('[data-scopefile]')].map(x => x.getAttribute('data-scopefile')) }));
ok('4 the sub: "✅ Plans are now posted", the update from GrayCo, the new sheet, and "Drywall scope.docx" under their Drywall scope', /Plans are now posted/.test(s4.body) && /Plans are now posted for Sample Clinic Remodel/.test(s4.body) && /A-101 Floor plan\.pdf/.test(s4.body) && s4.files.indexOf('Drywall scope.docx') > -1, s4.files);
ok('4 the small "📩 Ask for something else" link is back (a new request can be made)', !!(await S3.$('[data-planreq-open="small"]')));
await shot(S3, 'pr07_bidsite_sub_plans_posted', true);
ok('no page errors', !errs.length, errs);
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'index-planreq-site.txt'), ['Bid site screenshots (test_PLANREQ_SITE.mjs) — made-up data; the built bid site against the real subportal.js',
  'pr01  a sub on a job with no plans: "📩 Request plans / more info"', 'pr02  the form: Plans / Specs / Site walk / Other + note, from the profile', 'pr03  sent', 'pr04  a job with plans: the small "📩 Request more info" link',
  'pr05  phone 390 px: the request shows as sent', 'pr06  the admin: the request on the job, 🔒/🌐 one-click pill, upload sorted (scope → Drywall, sheet → Plans)', 'pr07  the sub: "Plans are now posted", the update, the Drywall scope file', ''].join('\n'));
await browser.close();
const n = R.filter(Boolean).length; console.log('PLANREQ_SITE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
