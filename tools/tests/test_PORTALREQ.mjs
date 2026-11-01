/* patch PORTALREQ tests: node tools/tests/test_PORTALREQ.mjs [--no-browser]
   Made-up customers, GCs, property managers and jobs only; every network call is answered by the in-memory fakes below
   (a fake Supabase: gc_kv, the portal link / session tables, file storage; a fake Resend) — nothing leaves this computer.
   NODE: ➕ Request a change (customer, property manager, GC) · 🏗 Request a new project → a Lead Inbox lead linked to the
         customer (customerId), source "Portal request", emergency → the emergency path · the ✅ Approvals card (PM + office) ·
         staff reply / decline go through approvals (7 PM–7 AM → 7:00 AM) · status Received → Being priced → Change order sent /
         Not possible · only their own jobs and properties · 10 a day · upload limits · no carrier / sub / cost / note in answers.
   BROWSER (with the real functions behind a local server; phone 390 + desktop 1280): each portal's buttons and forms, a
         request sent with a photo, My requests and its status updates; the CRM's staff card (offline harness) and
         "Make a change order" opening the change order builder prefilled; no page errors. Screenshots → $PORTALREQ_SHOTS. */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FNDIR = path.join(ROOT, 'netlify/functions');
const SHOTS = process.env.PORTALREQ_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const PW = process.env.PLAYWRIGHT_DIR || SP + '/node_modules/playwright/index.js';

let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tok = () => b64u(crypto.randomBytes(32));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');

/* ═════════ the clock (Central quiet hours are 7 PM–7 AM) ═════════ */
const realNow = Date.now;
let NOW = Date.parse('2026-11-02T18:00:00Z');   /* Monday 12:00 Central */
Date.now = () => NOW;

/* ═════════ the fake cloud ═════════ */
const KV = {}, TABLES = { gc_portal: [], gc_portal_session: [], gc_staff: [] }, FILES = {}, RESEND = [];
let tick = 0;
function put(key, v){ KV[key] = { value: typeof v === 'string' ? v : JSON.stringify(v), at: new Date(NOW + (++tick)).toISOString() }; }
function get(key){ const r = KV[key]; if (!r) return undefined; let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }
function res(status, body, hd){ return { ok: status < 400, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body), headers: { get: k => (hd || {})[String(k).toLowerCase()] || null }, arrayBuffer: async () => new ArrayBuffer(0) }; }
function match(row, k, cond){
  const v = row[k];
  if (cond.startsWith('eq.')) return String(v) === decodeURIComponent(cond.slice(3));
  if (cond.startsWith('in.')) return decodeURIComponent(cond.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).includes(String(v));
  if (cond === 'is.null') return v == null;
  return true;
}
function filt(rows, u){ const skip = ['select', 'order', 'limit', 'on_conflict', 'offset']; let out = rows; for (const [k, c] of u.searchParams) if (!skip.includes(k)) out = out.filter(r => match(r, k, c)); return out; }
const STAFF_TOKENS = { 'Bearer good-pm': 'steven.test@grayco-cs.com', 'Bearer good-office': 'olive.test@grayco-cs.com', 'Bearer good-admin': 'wes.test@grayco-cs.com', 'Bearer good-crew': 'carl.test@grayco-cs.com' };
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {}; const method = (o.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  const u = new URL(url);
  if (u.hostname === 'api.resend.com') { RESEND.push(JSON.parse(o.body)); return res(200, { id: 'em' }); }
  if (u.hostname !== 'fake-portalreq.supabase.co') return res(404, {});
  const hd = o.headers || {};
  if (u.pathname === '/auth/v1/user') { const a = hd.Authorization || hd.authorization || ''; const e = STAFF_TOKENS[a] || (/^Bearer utok-u-s-/.test(a) ? 'sbiffle@grayco-cs.com' : /^Bearer utok-u-w-/.test(a) ? 'wjohnson@grayco-cs.com' : ''); return e ? res(200, { id: 'u', email: e }) : res(401, {}); }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(o.body); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
  if (u.pathname.startsWith('/storage/v1/object/crm-files/')) { if (method === 'POST') { FILES[u.pathname.slice(29)] = o.body.length; return res(200, {}); } return res(404, {}); }
  if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return res(404, { code: 'PGRST205', message: 'schema cache' });
  if (u.pathname === '/rest/v1/gc_kv') {
    if (method === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(r => put(r.key, r.value)); return res(201, []); }
    if (method === 'PATCH') {
      const k = decodeURIComponent((u.searchParams.get('key') || '').slice(3)), at = decodeURIComponent((u.searchParams.get('updated_at') || '').slice(3));
      if (!KV[k] || (at && KV[k].at !== at)) return res(200, []);
      const b = JSON.parse(o.body); put(k, b.value); return res(200, [{ key: k }]);
    }
    const eq = u.searchParams.get('key') || '';
    const keys = eq.startsWith('eq.') ? [decodeURIComponent(eq.slice(3))] : eq.startsWith('in.') ? decodeURIComponent(eq.slice(3)).replace(/^\(|\)$/g, '').split(',').map(k => k.replace(/"/g, '')) : [];
    return res(200, keys.filter(k => KV[k]).map(k => ({ key: k, value: KV[k].value, updated_at: KV[k].at })));
  }
  const tm = /^\/rest\/v1\/(gc_portal|gc_portal_session|gc_staff)$/.exec(u.pathname);
  if (tm) {
    const T = TABLES[tm[1]];
    if (method === 'GET') return res(200, filt(T, u));
    if (method === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(r => T.push(Object.assign({}, r))); return res(201, []); }
    if (method === 'PATCH') { const rows = filt(T, u), b = JSON.parse(o.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
  }
  return res(200, []);
};
process.env.SUPABASE_URL = 'https://fake-portalreq.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test_only';
process.env.RESEND_API_KEY = 're_test_only';
process.env.OWNER_EMAILS = 'wes.test@grayco-cs.com';
['CUST_QUIET_OFF', 'PORTAL_MAIL_OFF', 'PORTAL_AUTO_EMAIL', 'URL', 'DEPLOY_PRIME_URL', 'ANTHROPIC_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].forEach(k => delete process.env[k]);

/* ═════════ the people, the jobs ═════════ */
const USERS = [{ name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true, phone: '901-555-0100' },
  { name: 'Olive Office', email: 'olive.test@grayco-cs.com', role: 'Office', active: true },
  { name: 'Wes Admin', email: 'wes.test@grayco-cs.com', role: 'Admin', active: true },
  { name: 'Carl Crew', email: 'carl.test@grayco-cs.com', role: 'Crew', active: true },
  { name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }];
TABLES.gc_staff.push({ email: 'steven.test@grayco-cs.com', name: 'Steven Park', role: 'staff', active: true }, { email: 'olive.test@grayco-cs.com', name: 'Olive Office', role: 'office', active: true },
  { email: 'wes.test@grayco-cs.com', name: 'Wes Admin', role: 'admin', active: true }, { email: 'carl.test@grayco-cs.com', name: 'Carl Crew', role: 'staff', active: true },
  { email: 'sbiffle@grayco-cs.com', name: 'Sample PM', role: 'staff', active: true }, { email: 'wjohnson@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
const CUSTOMERS = [
  { id: 'CU1', name: 'Ann Alpha', email: 'ann@example.test', phone: '901-555-0111', address: '1 Alpha Ln, Bartlett TN', properties: [{ address: '77 Lake Cabin Rd, Counce TN' }] },
  { id: 'CU2', name: 'Bob Bravo', email: 'bob@example.test', address: '2 Bravo St, Cordova TN' },
  { id: 'CUPM', name: 'Pine Property Management', company: 'Pine Property Management', email: 'pm@pine.test', type: 'commercial' },
  { id: 'CUGC', name: 'Ridge Builders', company: 'Ridge Builders', email: 'gc@ridge.test', type: 'gc' }];
const PROJECTS = [
  { id: 'PJA', name: 'Alpha Reroof — State Farm claim', client: 'Ann Alpha', customerId: 'CU1', clientEmail: 'ann@example.test', clientPhone: '901-555-0111', address: '1 Alpha Ln, Bartlett TN', autoPO: 'A101',
    pm: 'Steven Park', status: 'Active', contract: 18000, insCarrier: 'State Farm', internalNotes: 'internal note: margin is thin', costTotal: 12345.67,
    subs: [{ id: 'PS1', subId: 'S1', name: 'Ridgeway Framing', trade: 'Framing', bidAmt: 8765, notes: 'internal note: slow on paperwork' }] },
  { id: 'PJB', name: 'Bravo Siding', client: 'Bob Bravo', customerId: 'CU2', clientEmail: 'bob@example.test', address: '2 Bravo St, Cordova TN', autoPO: 'B202', pm: 'Steven Park', status: 'Active' },
  { id: 'M1', name: 'Pine Apts — Bldg A roof', client: 'Pine Property Management', customerId: 'CUPM', clientEmail: 'pm@pine.test', address: '100 Pine St, Memphis TN', pm: 'Steven Park', status: 'Active' },
  { id: 'M2', name: 'Pine Apts — Bldg B', client: 'Pine Property Management', customerId: 'CUPM', clientEmail: 'pm@pine.test', address: '200 Pine St, Memphis TN', pm: 'Steven Park', status: 'Complete' },
  { id: 'M3', name: 'Pine Apts — Bldg C', client: 'Pine Property Management', customerId: 'CUPM', clientEmail: 'pm@pine.test', address: '300 Pine St, Memphis TN', pm: 'Steven Park', status: 'Complete' },
  { id: 'GJ1', name: 'Ridge — Suite 210 build-out', client: 'Ridge Builders', customerId: 'CUGC', gcJob: true, address: '500 Commerce Dr, Memphis TN', autoPO: 'G301', pm: 'Steven Park', status: 'Active',
    gcContacts: [{ name: 'Gina GC', email: 'gina@ridge.test', role: 'pm' }] },
  { id: 'P1', name: 'Demo Reroof', client: 'Dana Demo', clientEmail: 'dana@example.test', address: '9 Demo Ct, Bartlett TN', autoPO: 'D901', pm: 'Sample PM', status: 'Active', contract: 10000 }];
function world(){
  for (const k of Object.keys(KV)) delete KV[k];
  put('users', USERS); put('customers', CUSTOMERS); put('projects', PROJECTS);
  put('subs', [{ id: 'S1', name: 'Ridgeway Framing', contact: 'Rory Lane', phone: '901-555-0300', email: 'rory@ridgeway.test' }]);
  put('gc_maint_portfolios', [{ id: 'pf_1', name: 'Pine Property Management', contact: 'Lee Manager', email: 'pm@pine.test', pids: ['M1', 'M2', 'M3'] }]);
  put('gc_automation_pause', { on: false });
  put('gc_gcp_links', [{ token: GTOK, pid: 'GJ1', by: 'test', at: new Date(NOW).toISOString(), revoked: false }]);
  put('gc_lead_inbox', []);
}
const LINK_A = tok(), LINK_B = tok(), LINK_M1 = tok(), LINK_P1 = tok(), SESS_PM = tok(), GTOK = tok();
TABLES.gc_portal.push({ token: LINK_A, project_id: 'PJA', revoked: false }, { token: LINK_B, project_id: 'PJB', revoked: false }, { token: LINK_M1, project_id: 'M1', revoked: false }, { token: LINK_P1, project_id: 'P1', revoked: false });
TABLES.gc_portal_session.push({ id: sha(SESS_PM), kind: 'customer', ident: 'e:pm@pine.test', links: [LINK_M1], expires_at: new Date(NOW + 30 * 864e5).toISOString(), revoked: false });
world();

const req = require(FNDIR + '/portal-req.js');
const portal = require(FNDIR + '/portal.js');
const gcp = require(FNDIR + '/gc-portal.js');
const C = portal._core;
const EM = require(FNDIR + '/_lib/emergency.js');
let ipn = 0;
const ev = (b, hd) => ({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.grayco-cs.com', 'x-forwarded-for': '10.9.' + (++ipn % 250) + '.' + (ipn % 200) }, hd || {}), body: JSON.stringify(b) });
const R = async (b, hd) => { const r = await req.handler(ev(b, hd)); return { status: r.statusCode, data: JSON.parse(r.body || '{}'), raw: r.body }; };
const A = { 'x-portal-token': LINK_A }, B = { 'x-portal-token': LINK_B }, PMH = { 'x-portal-session': SESS_PM }, GC = { 'x-gc-token': GTOK };
const PM = { authorization: 'Bearer good-pm' }, OFFICE = { authorization: 'Bearer good-office' }, CREW = { authorization: 'Bearer good-crew' };
const PNG = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
const aq = () => (get(C.AQ_KEY) || []);
const store = () => (get('gc_portal_requests') || []);
const ALL = [];   /* every public answer, checked at the end for anything private */
const P = async (b, hd) => { const r = await R(b, hd); ALL.push(r.raw); return r; };
const FORBIDDEN = [/state\s*farm/i, /ridgeway/i, /rory/i, /8765/, /12345/, /internal note/i, /margin/i, /bidAmt/i, /\bcost/i, /\brk\b|"rk"/, /sb:crm-files/, /steven\.test@/i, /byEmail/];

console.log('NODE');
let reqA = null, reqProj = null;
await t('a customer\'s "mine": their properties (job + their customer record\'s other property), work types without HVAC / pressure washing, 10 left', async () => {
  const r = await P({ action: 'mine' }, A);
  assert.strictEqual(r.status, 200, r.raw);
  assert.strictEqual(r.data.portal, 'customer');
  assert.deepStrictEqual(r.data.properties.map(x => x.label), ['1 Alpha Ln, Bartlett TN', '77 Lake Cabin Rd, Counce TN']);
  assert.deepStrictEqual(r.data.workTypes.map(x => x.label), ['Restoration / mitigation', 'Roofing', 'Commercial build-out', 'Commercial maintenance', 'Other']);
  assert.ok(!/hvac|pressure/i.test(JSON.stringify(r.data.workTypes)));
  assert.strictEqual(r.data.left, 10); assert.deepStrictEqual(r.data.requests, []);
});
await t('➕ Request a change: saved on the job, a ✅ Approvals card for the job\'s PM (the office may take it), no price / time promised', async () => {
  const r = await P({ action: 'change', text: 'Please add a skylight over the kitchen\nand match the shingle color', where: 'Kitchen, back of the house', urgency: 'soon', contact: 'text', contactNote: 'after 3 pm' }, A);
  assert.strictEqual(r.status, 200, r.raw); reqA = r.data.request;
  assert.strictEqual(reqA.status, 'received'); assert.strictEqual(reqA.statusLabel, 'Received');
  assert.ok(/Someone from our team will be with you shortly\./.test(r.data.say));
  assert.ok(!/\$|\bday(s)?\b|\bhours?\b|today|tomorrow/i.test(r.data.say + reqA.next), 'no price or time promised: ' + r.data.say + ' / ' + reqA.next);
  const s = store().find(x => x.id === reqA.id);
  assert.ok(s && s.pid === 'PJA' && s.kind === 'change' && s.urgency === 'soon' && s.contact === 'text');
  const card = aq().find(x => x.id === 'appr_preq_' + reqA.id);
  assert.ok(card && card.kind === 'preq_change' && card.pm === 'Steven Park' && card.pmEmail === 'steven.test@grayco-cs.com' && card.status === 'waiting' && card.channel === 'portal' && card.to === '');
  assert.strictEqual(card.priority, 'high'); assert.ok(/skylight/.test(card.text) && /Kitchen, back of the house/.test(card.text) && /after 3 pm/.test(card.text));
  assert.ok(require(FNDIR + '/_lib/office-kinds.js').isOfficeKind(card), 'the office takes it at once (APOFFICE4)');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('"preq_change","preq_project","preq_reply","preq_decline"];') && html.includes('<script id="gc-patch-portalreq">\n/* patch PORTALREQ */'), 'the CRM copy of the office kinds');
});
await t('photos / files: images and PDFs attach (4 MB each, 4 at most); other types and big files refused', async () => {
  let r = await P({ action: 'attach', id: reqA.id, file: { data: PNG, name: 'kitchen.png' } }, A); assert.strictEqual(r.data.files, 1, r.raw);
  r = await P({ action: 'attach', id: reqA.id, file: { data: PDF, name: 'sketch.pdf' } }, A); assert.strictEqual(r.data.files, 2, r.raw);
  r = await P({ action: 'attach', id: reqA.id, file: { data: 'data:text/html;base64,' + Buffer.from('<script>').toString('base64'), name: 'x.html' } }, A); assert.strictEqual(r.status, 400);
  r = await P({ action: 'attach', id: reqA.id, file: { data: 'data:image/jpeg;base64,' + Buffer.alloc(4 * 1024 * 1024 + 10, 1).toString('base64'), name: 'huge.jpg' } }, A);
  assert.strictEqual(r.status, 400); assert.ok(/over 4 MB/.test(r.data.error));
  r = await P({ action: 'attach', id: reqA.id, file: { data: 'data:image/png;base64,' + Buffer.from('a').toString('base64') + 'AA', name: 'c.png' } }, A);
  r = await P({ action: 'attach', id: reqA.id, file: { data: 'data:image/png;base64,' + Buffer.from('bb').toString('base64'), name: 'd.png' } }, A);
  r = await P({ action: 'attach', id: reqA.id, file: { data: 'data:image/png;base64,' + Buffer.from('ccc').toString('base64'), name: 'e.png' } }, A);
  assert.strictEqual(r.status, 409, 'a 5th file: ' + r.raw);
  const big = await req.handler(ev({ action: 'attach', id: reqA.id, file: { data: 'x'.repeat(6.2 * 1024 * 1024) } }, A)); assert.strictEqual(big.statusCode, 413);
  assert.strictEqual(store().find(x => x.id === reqA.id).files.length, 4);
});
await t('only their own jobs: customer B cannot ask on A\'s job, see A\'s requests, or add files to them; a dead code gets the portal\'s answer', async () => {
  let r = await P({ action: 'change', projectId: 'PJA', text: 'Change the other guy\'s roof color' }, B); assert.strictEqual(r.status, 404);
  r = await P({ action: 'mine' }, B); assert.deepStrictEqual(r.data.requests, []); assert.ok(!r.raw.includes(reqA.id));
  assert.ok(!r.data.properties.some(x => /Alpha|Cabin/.test(x.label)));
  r = await P({ action: 'attach', id: reqA.id, file: { data: PNG, name: 'x.png' } }, B); assert.strictEqual(r.status, 404);
  r = await P({ action: 'project', property: 'j:PJA', workType: 'roofing', text: 'New roof on Ann\'s house please' }, B); assert.strictEqual(r.status, 400);
  r = await P({ action: 'mine' }, { 'x-portal-token': tok() }); assert.strictEqual(r.status, 404); assert.ok(/not active/.test(r.data.error));
  r = await P({ action: 'mine' }, { 'x-gc-token': tok() }); assert.strictEqual(r.status, 404);
  r = await P({ action: 'change', text: 'A preview cannot send', preview: true }, A); assert.strictEqual(r.status, 403);
});
await t('staff side: the card\'s details with signed file links; only staff; a crew member\'s reply waits on approvals', async () => {
  let r = await R({ action: 'staff-get', id: reqA.id }); assert.strictEqual(r.status, 401);
  r = await R({ action: 'staff-get', id: reqA.id }, PM);
  assert.strictEqual(r.status, 200, r.raw); assert.strictEqual(r.data.request.files.length, 4); assert.ok(/^https:\/\/fake-portalreq\.supabase\.co\/storage\/v1\/object\/sign\//.test(r.data.request.files[0].url));
  assert.strictEqual(r.data.job.name, 'Alpha Reroof — State Farm claim'); assert.strictEqual(r.data.statusLabel, 'Received');
  r = await R({ action: 'staff-reply', id: reqA.id, text: 'Crew note — not for the customer yet' }, CREW);
  assert.ok(r.data.ok && r.data.waiting && !r.data.sent, r.raw);
  r = await P({ action: 'mine' }, A); assert.strictEqual(r.data.requests[0].replies.length, 0, 'not shown until approved');
});
await t('💬 Reply by the PM at noon: approved as it is sent → in My requests at once (a carrier / sub name in it is scrubbed)', async () => {
  const r = await R({ action: 'staff-reply', id: reqA.id, text: 'Thanks Ann — I will look at it with Ridgeway Framing; State Farm is not involved in this one.' }, PM);
  assert.ok(r.data.ok && r.data.sent, r.raw);
  const m = await P({ action: 'mine' }, A), it = m.data.requests.find(x => x.id === reqA.id);
  assert.strictEqual(it.replies.length, 1); assert.ok(/our crew/.test(it.replies[0].text) && /your insurance company/.test(it.replies[0].text), it.replies[0].text);
  assert.strictEqual(it.replies[0].by, 'Steven · GrayCo');
  const item = aq().find(x => x.kind === 'preq_reply' && x.status === 'sent'); assert.ok(item && item.approvals[0].by === 'Steven Park');
});
await t('💬 a reply approved at 9 PM waits for 7:00 AM (CUSTQUIET), then shows', async () => {
  NOW = Date.parse('2026-11-03T03:00:00Z');   /* 9 PM Central */
  const r = await R({ action: 'staff-reply', id: reqA.id, text: 'Night owl reply' }, PM);
  assert.ok(r.data.ok && r.data.scheduled && !r.data.sent, r.raw); assert.ok(/7:00 AM/.test(r.data.say));
  let m = await P({ action: 'mine' }, A); assert.ok(!JSON.stringify(m.data).includes('Night owl'));
  assert.strictEqual(store().find(x => x.id === reqA.id).replies.slice(-1)[0].state, 'scheduled');
  NOW = Date.parse('2026-11-03T13:05:00Z');   /* 7:05 AM */
  const rel = await C.releaseScheduled({}); assert.ok(rel.sent >= 1, JSON.stringify(rel));
  m = await P({ action: 'mine' }, A); assert.ok(JSON.stringify(m.data).includes('Night owl'));
  NOW = Date.parse('2026-11-03T18:00:00Z');
});
await t('🔁 Make a change order: Being priced → the change order linked (card closed) → Change order sent once it is in their portal to sign', async () => {
  let r = await R({ action: 'staff-pricing', id: reqA.id }, PM); assert.ok(r.data.ok);
  let m = await P({ action: 'mine' }, A); assert.strictEqual(m.data.requests.find(x => x.id === reqA.id).statusLabel, 'Being priced');
  r = await R({ action: 'staff-link-co', id: reqA.id, coId: 'CO_SKY1', coNum: 'CO-3' }, PM); assert.ok(r.data.ok, r.raw);
  assert.strictEqual(aq().find(x => x.id === 'appr_preq_' + reqA.id).status, 'sent', 'the card is closed');
  m = await P({ action: 'mine' }, A); assert.strictEqual(m.data.requests.find(x => x.id === reqA.id).statusLabel, 'Being priced', 'the sign request is not out yet');
  put('gc_sign_requests', [{ id: 'SR1', pid: 'PJA', kind: 'change_order', refId: 'CO_SKY1', title: 'Change order — skylight', amount: 2400, status: 'pending', auto: true, createdAt: new Date(NOW).toISOString() }]);
  put(C.AQ_KEY, aq().concat([{ id: 'appr_sign_SR1', kind: 'sign_change_order', status: 'waiting', jobId: 'PJA', steps: ['pm'], step: 'pm', approvals: [] }]));
  m = await P({ action: 'mine' }, A); assert.strictEqual(m.data.requests.find(x => x.id === reqA.id).statusLabel, 'Being priced', 'its e-mail is still waiting on approvals');
  put(C.AQ_KEY, aq().map(x => x.id === 'appr_sign_SR1' ? Object.assign({}, x, { status: 'sent' }) : x));
  m = await P({ action: 'mine' }, A); const it = m.data.requests.find(x => x.id === reqA.id);
  assert.strictEqual(it.statusLabel, 'Change order sent'); assert.ok(/sign it in your portal/.test(it.next));
});
await t('✖ Decline with note: Not possible (with the note) once approved; the office can do it too', async () => {
  const r0 = await P({ action: 'change', text: 'Move the chimney three feet left', urgency: 'normal', contact: 'call' }, A);
  const id = r0.data.request.id;
  let r = await R({ action: 'staff-decline', id: id, note: '' }, OFFICE); assert.strictEqual(r.status, 400);
  r = await R({ action: 'staff-decline', id: id, note: 'The chimney is structural — we cannot move it, but we can talk about a new cap.' }, OFFICE);
  assert.ok(r.data.ok && r.data.sent, r.raw);
  const m = await P({ action: 'mine' }, A), it = m.data.requests.find(x => x.id === id);
  assert.strictEqual(it.statusLabel, 'Not possible'); assert.ok(/structural/.test(it.note));
  assert.strictEqual(aq().find(x => x.id === 'appr_preq_' + id).status, 'sent');
});
await t('a reply that is not approved never shows', async () => {
  const r0 = await R({ action: 'staff-reply', id: reqA.id, text: 'A draft nobody approves' }, CREW);
  const item = aq().find(x => x.kind === 'preq_reply' && x.status === 'waiting' && /nobody approves/.test(x.text));
  const a = await C.approvalAction({ op: 'reject', id: item.id, reason: 'no' }, { email: 'steven.test@grayco-cs.com', name: 'Steven Park', role: 'staff' });
  assert.ok(a.out.ok, JSON.stringify(a.out));
  assert.strictEqual(store().find(x => x.id === reqA.id).replies.find(x => x.text === 'A draft nobody approves').state, 'rejected');
  const m = await P({ action: 'mine' }, A); assert.ok(!JSON.stringify(m.data).includes('nobody approves'));
});
await t('🏗 Request a new project: a Lead Inbox lead linked to the customer (customerId), source "Portal request", no spam filter; the PM gets a card', async () => {
  let r = await P({ action: 'project', property: 'c:CU1:1', workType: 'hvac', text: 'New AC unit' }, A); assert.strictEqual(r.status, 400, 'HVAC is not offered');
  r = await P({ action: 'project', property: 'j:PJB', workType: 'roofing', text: 'Someone else\'s house' }, A); assert.strictEqual(r.status, 400);
  r = await P({ action: 'project', property: 'c:CU1:1', workType: 'roofing', text: 'The lake cabin roof is 20 years old — want a new one. Also casino crypto words should not be filtered.', urgency: 'normal', contact: 'email' }, A);
  assert.strictEqual(r.status, 200, r.raw); reqProj = r.data.request;
  assert.strictEqual(reqProj.kind, 'project'); assert.strictEqual(reqProj.property, '77 Lake Cabin Rd, Counce TN'); assert.strictEqual(reqProj.workType, 'Roofing');
  const lead = (get('gc_lead_inbox') || []).find(x => x.leadExtra && x.leadExtra.portalRequest === reqProj.id);
  assert.ok(lead, JSON.stringify(get('gc_lead_inbox')).slice(0, 400));
  assert.strictEqual(lead.source, 'Portal request'); assert.strictEqual(lead.leadExtra.customerId, 'CU1'); assert.strictEqual(lead.customerId, 'CU1');
  assert.strictEqual(lead.leadExtra.existingCustomer, true); assert.strictEqual(lead.leadExtra.knownCustomer, true); assert.strictEqual(lead.leadExtra.customerPid, 'PJA');
  assert.strictEqual(lead.address, '77 Lake Cabin Rd, Counce TN'); assert.strictEqual(lead.contact.email, 'ann@example.test'); assert.strictEqual(lead.type, 'residential');
  assert.ok(!lead.emergency); assert.strictEqual(store().find(x => x.id === reqProj.id).leadId, lead.id);
  const card = aq().find(x => x.id === 'appr_preq_' + reqProj.id); assert.ok(card && card.kind === 'preq_project' && card.pm === 'Steven Park');
  r = await R({ action: 'staff-reply', id: reqProj.id, text: 'Got it — Steven will set up the inspection.' }, PM);
  const m = await P({ action: 'mine' }, A), it = m.data.requests.find(x => x.id === reqProj.id);
  assert.strictEqual(it.statusLabel, 'With our team'); assert.strictEqual(it.replies.length, 1);
});
await t('🚨 an emergency new-project request takes the emergency path (the lead is an emergency, the 🚨 alert goes out); not held', async () => {
  RESEND.length = 0;
  const r = await P({ action: 'project', property: 'j:PJA', workType: 'restoration', text: 'Pipe burst upstairs, water coming through the ceiling', urgency: 'emergency', contact: 'call' }, A);
  assert.strictEqual(r.status, 200, r.raw);
  const lead = (get('gc_lead_inbox') || []).find(x => x.leadExtra && x.leadExtra.portalRequest === r.data.request.id);
  assert.ok(lead.emergency === true && lead.urgency === 'emergency' && EM.isEmergency(lead) && EM.isMitigation(lead), JSON.stringify(lead).slice(0, 300));
  assert.strictEqual(lead.type, 'insurance');
  assert.ok(!(lead.hold && lead.hold.state === 'held'), 'an emergency is never held');
  assert.ok(RESEND.some(m => /emergency/i.test(m.subject || '')), 'the 🚨 alert: ' + RESEND.map(m => m.subject).join(' | '));
  assert.strictEqual(aq().find(x => x.id === 'appr_preq_' + r.data.request.id).priority, 'urgent');
});
await t('a property manager (signed in, portfolio e-mail): every building of the portfolio to pick from; a request for another building → a lead on that building', async () => {
  let r = await P({ action: 'mine' }, PMH);
  assert.strictEqual(r.data.portal, 'pm', r.raw);
  assert.deepStrictEqual(r.data.properties.map(x => x.label), ['100 Pine St, Memphis TN', '200 Pine St, Memphis TN', '300 Pine St, Memphis TN']);
  r = await P({ action: 'project', property: 'pf:pf_1:M3', workType: 'commaint', text: 'Quarterly gutter cleaning for building C', contact: 'email' }, PMH);
  assert.strictEqual(r.status, 200, r.raw);
  const lead = (get('gc_lead_inbox') || []).find(x => x.leadExtra && x.leadExtra.portalRequest === r.data.request.id);
  assert.ok(lead && lead.address === '300 Pine St, Memphis TN' && lead.leadExtra.customerId === 'CUPM' && lead.leadExtra.customerPid === 'M3' && lead.type === 'commercial', JSON.stringify(lead).slice(0, 400));
  r = await P({ action: 'change', projectId: 'M2', text: 'Change the color on building B' }, PMH); assert.strictEqual(r.status, 404, 'a change only on a job their portal opens');
  r = await P({ action: 'change', projectId: 'M1', text: 'Add two more downspouts on the north side', where: 'Building A, north wall' }, PMH); assert.strictEqual(r.status, 200, r.raw);
  r = await P({ action: 'mine' }, PMH); assert.strictEqual(r.data.requests.length, 2);
});
let gcReq = null;
await t('the GC page: a change request → the job\'s 🏗 GC portal change order waits (filled in), hidden from the GC until priced; then Change order sent', async () => {
  let r = await P({ action: 'change', text: 'Owner wants a second door into suite 210', where: 'Suite 210, east wall', urgency: 'normal', contact: 'email', name: 'Gina GC' }, GC);
  assert.strictEqual(r.status, 200, r.raw); gcReq = r.data.request;
  const s = store().find(x => x.id === gcReq.id); assert.ok(s.portal === 'gc' && s.gcpCoId && s.by === 'Gina GC', JSON.stringify(s));
  const G = require(FNDIR + '/_lib/gcp.js');
  let st = await G.jobState('GJ1'); const co = st.cos.find(x => x.id === s.gcpCoId); assert.ok(co && co.status === 'requested' && co.preqId === gcReq.id && /second door/.test(co.title));
  const v = await gcp.handler(ev({ action: 'gc-view', preview: true }, GC)); const vd = JSON.parse(v.body);
  assert.ok(vd.ok && !vd.cos.some(x => x.id === s.gcpCoId), 'not in the GC\'s change order list while requested');
  r = await P({ action: 'mine' }, GC); assert.strictEqual(r.data.portal, 'gc'); assert.strictEqual(r.data.requests[0].statusLabel, 'Received');
  assert.ok(!r.data.requests.some(x => x.id === reqA.id), 'the homeowner\'s requests are not on the GC page');
  await G.mutateJob('GJ1', st2 => { const c = st2.cos.find(x => x.id === s.gcpCoId); c.status = 'pricing'; c.amount = 3200; return c; });
  r = await P({ action: 'mine' }, GC); assert.strictEqual(r.data.requests[0].statusLabel, 'Being priced');
  await G.mutateJob('GJ1', st2 => { const c = st2.cos.find(x => x.id === s.gcpCoId); c.status = 'sent'; return c; });
  r = await P({ action: 'mine' }, GC); assert.strictEqual(r.data.requests[0].statusLabel, 'Change order sent'); assert.ok(/Change orders on this page/.test(r.data.requests[0].next));
  r = await P({ action: 'mine' }, A); assert.ok(!r.data.requests.some(x => x.id === gcReq.id), 'and the GC\'s not on a customer\'s');
  r = await P({ action: 'mine' }, GC); assert.deepStrictEqual(r.data.properties.map(x => x.label), ['500 Commerce Dr, Memphis TN']);
});
await t('10 requests a day (Central day), then a polite no; the next day it works again', async () => {
  world(); TABLES.gc_portal.length; let ok = 0, last = null;
  for (let i = 0; i < 11; i++) { last = await P({ action: 'change', text: 'Request number ' + (i + 1) + ' please', contact: 'call' }, B); if (last.status === 200) ok++; }
  assert.strictEqual(ok, 10); assert.strictEqual(last.status, 429); assert.ok(/10 requests today/.test(last.data.error) && /901-585-0944/.test(last.data.error));
  let m = await P({ action: 'mine' }, B); assert.strictEqual(m.data.left, 0);
  const pr = await P({ action: 'project', property: 'j:PJB', workType: 'roofing', text: 'One more, a project this time' }, B); assert.strictEqual(pr.status, 429, 'projects count too');
  NOW += 864e5; m = await P({ action: 'mine' }, B); assert.strictEqual(m.data.left, 10);
  const r = await P({ action: 'change', text: 'A new day, a new request', contact: 'call' }, B); assert.strictEqual(r.status, 200);
});
await t('no insurance carrier, sub, cost, internal note, staff e-mail or file reference in any portal answer', async () => {
  world();
  await P({ action: 'change', text: 'One more thing on the Alpha job', contact: 'call' }, A);
  ALL.push((await P({ action: 'mine' }, A)).raw);
  const bad = [];
  ALL.forEach((raw, i) => FORBIDDEN.forEach(re => { if (re.test(raw)) bad.push(i + ': ' + re + ' in ' + raw.slice(0, 200)); }));
  assert.deepStrictEqual(bad, []);
  const m = JSON.parse(ALL[ALL.length - 1]); assert.ok(m.requests.some(x => /your insurance company/.test(x.job)), 'the job name has the carrier taken out: ' + JSON.stringify(m.requests.map(x => x.job)));
});
await t('function hygiene: pause installed, node --check, CORS for the portal', async () => {
  const src = fs.readFileSync(path.join(FNDIR, 'portal-req.js'), 'utf8'); assert.ok(src.includes("require('./_lib/pause').install()"));
  const r = await req.handler({ httpMethod: 'OPTIONS', headers: { origin: 'https://portal.grayco-cs.com' } });
  assert.strictEqual(r.headers['Access-Control-Allow-Origin'], 'https://portal.grayco-cs.com'); assert.ok(/x-gc-token/.test(r.headers['Access-Control-Allow-Headers']));
});
Date.now = realNow;

/* ═════════ the browser ═════════ */
if (!process.argv.includes('--no-browser')) {
  console.log('BROWSER');
  const { chromium } = require(PW);
  const OFF = realNow() - Date.parse('2026-11-02T18:00:00Z');   /* a running clock that says Monday noon Central */
  Date.now = () => realNow() - OFF;
  world();
  try { C._reset(); } catch (e) {}
  const PORT = 18500 + Math.floor(Math.random() * 1000), HOST = 'portal.localhost', ORIGIN = 'http://' + HOST + ':' + PORT;
  const CALLS = [];
  const server = http.createServer((rq, rs) => {
    let body = ''; rq.on('data', c => { body += c; }); rq.on('end', async () => {
      const u = new URL(rq.url, ORIGIN);
      if (u.pathname.startsWith('/.netlify/functions/')) {
        const name = u.pathname.split('/').pop().replace(/[^a-z0-9-]/gi, ''), f = path.join(FNDIR, name + '.js');
        let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
        CALLS.push({ fn: name, action: b.action });
        if (!fs.existsSync(f)) { rs.writeHead(404, { 'Content-Type': 'application/json' }); return rs.end('{}'); }
        const headers = Object.assign({}, rq.headers, { origin: 'https://portal.grayco-cs.com', 'x-forwarded-for': '10.77.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250) });
        let out; try { out = await require(f).handler({ httpMethod: rq.method, headers, body, queryStringParameters: Object.fromEntries(u.searchParams), rawUrl: u.href, path: u.pathname }); } catch (e) { out = { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) }; }
        rs.writeHead(out.statusCode || 200, { 'Content-Type': 'application/json' }); return rs.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body || {}));
      }
      let f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/portal.html' : u.pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(ROOT, 'portal.html');
      const ct = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream';
      rs.writeHead(200, { 'Content-Type': ct + (/text|json|javascript/.test(ct) ? '; charset=utf-8' : '') }); fs.createReadStream(f).pipe(rs);
    });
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP ' + HOST + ' 127.0.0.1', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=' + HOST] });
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const ERRS = [];
  async function open(kind, url, ls){
    const ctx = await browser.newContext(kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: ANDROID } : { viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(o => { try { localStorage.setItem('gc_pwa_dismiss', String(Date.now())); if (o) Object.keys(o).forEach(k => { if (!sessionStorage.getItem('__s' + k)) { localStorage.setItem(k, o[k]); sessionStorage.setItem('__s' + k, '1'); } }); } catch (e) {} }, ls || null);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => ERRS.push(kind + ' ' + url + ': ' + e.message));
    await pg.goto(ORIGIN + url);
    await pg.waitForSelector('#gcpr-card #gcpr-change', { timeout: 20000 });
    return { ctx, pg };
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shot = async (pg, name, sel) => { if (sel) await pg.evaluate(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -10); }, sel); await sleep(350); await pg.screenshot({ path: SHOTS + '/portalreq_' + name + '.png' }); };
  const ICON = path.join(ROOT, 'portal-icon-192.png');
  const itemText = (pg, id) => pg.evaluate(id => { const el = document.querySelector('[data-preq="' + id + '"]'); return el ? el.textContent : ''; }, id);
  let custReq = null;
  for (const kind of ['phone', 'desktop']) {
    await t(kind + ': the customer portal — "➕ Request a change" form, a photo, sent → My requests (Received)', async () => {
      const { ctx, pg } = await open(kind, '/#t=' + LINK_A);
      const txt = await pg.textContent('#gcpr-card');
      assert.ok(/Need something\?/.test(txt) && /Request a change/.test(txt) && /Request a new project/.test(txt) && /My requests/.test(txt), txt);
      await shot(pg, 'customer_' + kind, '#gcpr-card');
      await pg.click('#gcpr-change'); await pg.waitForSelector('#gcpr-sheet #gcpr-text');
      await pg.fill('#gcpr-text', 'Add a gutter guard on the front of the house (' + kind + ')');
      await pg.fill('#gcpr-where', 'Front gutters over the porch');
      await pg.setInputFiles('#gcpr-files', ICON);
      await pg.click('#gcpr-sheet .gcpr-seg button[data-u="soon"]');
      await pg.selectOption('#gcpr-contact', 'text'); await pg.fill('#gcpr-ctnote', 'after 3 pm');
      assert.ok(/leak|portal-icon/.test(await pg.textContent('#gcpr-sheet .gcpr-chips')) || /📎/.test(await pg.textContent('#gcpr-sheet .gcpr-chips')));
      await shot(pg, 'customer_change_form_' + kind);
      await pg.click('#gcpr-sheet .gcpr-seg button[data-u="emergency"]');
      assert.ok(await pg.isVisible('#gcpr-sheet .gcpr-em'), 'the emergency note shows (call now)');
      await pg.click('#gcpr-sheet .gcpr-seg button[data-u="soon"]');
      await pg.click('#gcpr-send'); await pg.waitForSelector('#gcpr-thanks', { timeout: 15000 });
      assert.ok(/Someone from our team will be with you shortly\./.test(await pg.textContent('#gcpr-thanks')));
      const s = store().filter(x => /gutter guard/.test(x.text) && x.text.includes(kind)).slice(-1)[0];
      assert.ok(s && s.pid === 'PJA' && s.files.length === 1 && s.files[0].type === 'image/jpeg' && s.urgency === 'soon' && s.contact === 'text', JSON.stringify(s));
      assert.ok(aq().some(x => x.id === 'appr_preq_' + s.id && x.kind === 'preq_change'), 'the staff card');
      await pg.click('#gcpr-done'); await pg.waitForSelector('[data-preq="' + s.id + '"]');
      assert.ok(/Received/.test(await itemText(pg, s.id)));
      if (kind === 'phone') custReq = s.id;
      await pg.click('#gcpr-project'); await pg.waitForSelector('#gcpr-sheet #gcpr-wt');
      const opts = await pg.$$eval('#gcpr-prop option', o => o.map(x => x.textContent));
      assert.deepStrictEqual(opts, ['1 Alpha Ln, Bartlett TN', '77 Lake Cabin Rd, Counce TN']);
      const wts = await pg.$$eval('#gcpr-wt option', o => o.map(x => x.textContent).join('|')); assert.ok(!/hvac|pressure/i.test(wts), wts);
      await pg.selectOption('#gcpr-prop', { label: '77 Lake Cabin Rd, Counce TN' }); await pg.selectOption('#gcpr-wt', 'roofing');
      await pg.fill('#gcpr-text', 'New metal roof on the lake cabin (' + kind + ')');
      await shot(pg, 'customer_project_form_' + kind);
      await pg.click('#gcpr-send'); await pg.waitForSelector('#gcpr-thanks', { timeout: 15000 });
      const pr = store().filter(x => x.kind === 'project' && x.text.includes(kind)).slice(-1)[0];
      const lead = (get('gc_lead_inbox') || []).find(x => x.leadExtra && x.leadExtra.portalRequest === pr.id);
      assert.ok(lead && lead.source === 'Portal request' && lead.leadExtra.customerId === 'CU1' && lead.address === '77 Lake Cabin Rd, Counce TN', JSON.stringify(lead || {}).slice(0, 300));
      await ctx.close();
    });
  }
  await t('status updates show in the portal: our reply, Being priced, Change order sent', async () => {
    let r = await R({ action: 'staff-reply', id: custReq, text: 'Thanks Ann — I will stop by Thursday to measure.' }, PM); assert.ok(r.data.ok && r.data.sent, JSON.stringify(r.data));
    const { ctx, pg } = await open('phone', '/#t=' + LINK_A);
    await pg.waitForSelector('[data-preq="' + custReq + '"]');
    let tx = await itemText(pg, custReq); assert.ok(/I will stop by Thursday/.test(tx) && /Steven · GrayCo/.test(tx), tx);
    r = await R({ action: 'staff-link-co', id: custReq, coId: 'CO_GG1', coNum: 'CO-4' }, PM); assert.ok(r.data.ok);
    await pg.evaluate(() => window.GCPortalReq.reload()); await sleep(800);
    tx = await itemText(pg, custReq); assert.ok(/Being priced/.test(tx), tx);
    put('gc_sign_requests', [{ id: 'SRG', pid: 'PJA', kind: 'change_order', refId: 'CO_GG1', title: 'Change order — gutter guard', amount: 900, status: 'pending', auto: false }]);
    await pg.evaluate(() => window.GCPortalReq.reload()); await sleep(800);
    tx = await itemText(pg, custReq); assert.ok(/Change order sent/.test(tx) && /sign it in your portal/.test(tx), tx);
    await shot(pg, 'customer_status_phone', '#gcpr-card');
    const html = await pg.content(); assert.ok(!/State Farm|Ridgeway|8765/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'no carrier / sub / cost on the page');
    await ctx.close();
  });
  for (const kind of ['phone', 'desktop']) {
    await t(kind + ': a property manager (signed in) — the request card for their properties and the portfolio\'s buildings in the form', async () => {
      const { ctx, pg } = await open(kind, '/', { gc_portal_s: SESS_PM });
      assert.ok(/Requests for your properties/.test(await pg.textContent('#gcpr-card')));
      await shot(pg, 'pm_' + kind, '#gcpr-card');
      await pg.click('#gcpr-project'); await pg.waitForSelector('#gcpr-sheet #gcpr-prop');
      assert.deepStrictEqual(await pg.$$eval('#gcpr-prop option', o => o.map(x => x.textContent)), ['100 Pine St, Memphis TN', '200 Pine St, Memphis TN', '300 Pine St, Memphis TN']);
      await pg.selectOption('#gcpr-prop', { label: '200 Pine St, Memphis TN' }); await pg.selectOption('#gcpr-wt', 'commaint');
      await pg.fill('#gcpr-text', 'Twice-a-year roof and gutter check for building B (' + kind + ')');
      await shot(pg, 'pm_project_form_' + kind);
      await pg.click('#gcpr-send'); await pg.waitForSelector('#gcpr-thanks', { timeout: 15000 });
      const pr = store().filter(x => x.kind === 'project' && x.text.includes('building B (' + kind)).slice(-1)[0];
      assert.ok(pr && pr.portal === 'pm' && pr.property.label === '200 Pine St, Memphis TN');
      const lead = (get('gc_lead_inbox') || []).find(x => x.leadExtra && x.leadExtra.portalRequest === pr.id);
      assert.ok(lead && lead.leadExtra.customerId === 'CUPM' && lead.type === 'commercial');
      await pg.click('#gcpr-done'); await pg.click('#gcpr-change'); await pg.waitForSelector('#gcpr-sheet #gcpr-where');
      await ctx.close();
    });
  }
  for (const kind of ['phone', 'desktop']) {
    await t(kind + ': the GC page — "➕ Request a change" in Change orders and on the card; name kept; the 🏗 GC portal change order waits', async () => {
      const { ctx, pg } = await open(kind, '/#g=' + GTOK);
      assert.ok(await pg.$('#gcp-co #gcp-co-req'), 'the change orders card opens the same form');
      assert.ok(/Changes & new work/.test(await pg.textContent('#gcpr-card')));
      await shot(pg, 'gc_' + kind, '#gcpr-card');
      await pg.click('#gcp-co-req'); await pg.waitForSelector('#gcpr-sheet #gcpr-name');
      await pg.fill('#gcpr-text', 'Owner asks for blocking for a TV wall in suite 210 (' + kind + ')'); await pg.fill('#gcpr-where', 'Suite 210, west wall'); await pg.fill('#gcpr-name', 'Gina GC');
      await shot(pg, 'gc_change_form_' + kind);
      await pg.click('#gcpr-send'); await pg.waitForSelector('#gcpr-thanks', { timeout: 15000 });
      const s = store().filter(x => x.portal === 'gc' && x.text.includes(kind)).slice(-1)[0];
      assert.ok(s && s.gcpCoId && s.by === 'Gina GC', JSON.stringify(s));
      await pg.click('#gcpr-done'); await pg.waitForSelector('[data-preq="' + s.id + '"]');
      assert.ok(!/TV wall/.test(await pg.textContent('#gcp-co')), 'not twice: the requested change order is under My requests until priced');
      await pg.click('#gcpr-project'); await pg.waitForSelector('#gcpr-sheet #gcpr-prop');
      assert.deepStrictEqual(await pg.$$eval('#gcpr-prop option', o => o.map(x => x.textContent)), ['500 Commerce Dr, Memphis TN']);
      await shot(pg, 'gc_project_form_' + kind);
      await ctx.close();
    });
  }
  await t('the sub portal never shows the request card', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'portal-req.js'), 'utf8'); assert.ok(/if \(window\.GCPartner\) return '';/.test(src));
  });
  await t('no page errors (portals)', async () => { assert.deepStrictEqual(ERRS, []); });
  await browser.close(); server.close();

  /* ── the CRM: the staff card (offline harness, the real page) ── */
  const HARNESS = process.env.GC_HARNESS || SP + '/wN/harness_N.mjs';
  await t('the CRM: the staff card for the job\'s PM with the details, photo and 🔁 Make a change order / 💬 Reply / ✖ Decline with note; Make a change order opens the builder prefilled and links the saved change order', async () => {
    const r0 = await R({ action: 'change', text: 'Please add two attic vents over the garage', where: 'Garage roof, back side', urgency: 'soon', contact: 'call', contactNote: 'mornings' }, { 'x-portal-token': LINK_P1 });
    assert.strictEqual(r0.status, 200, JSON.stringify(r0.data)); const id = r0.data.request.id;
    await R({ action: 'attach', id, file: { data: 'data:image/png;base64,' + fs.readFileSync(ICON).toString('base64'), name: 'garage.png' } }, { 'x-portal-token': LINK_P1 });
    const H = await import(pathToFileURL(HARNESS).href);
    H.resetCloud();
    H.cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
    H.cset('projects', [{ id: 'P1', name: 'Demo Reroof', client: 'Dana Demo', clientEmail: 'dana@example.test', address: '9 Demo Ct, Bartlett TN', autoPO: 'D901', pm: 'Sample PM', status: 'Active', contract: 10000 }]);
    H.cset('gc_approval_queue', JSON.stringify(aq().filter(x => x.jobId === 'P1')));
    const c = await H.computer('PREQ', { build: ROOT });
    c.acceptConfirm = false;
    const seen = [];
    await c.ctx.route('**/.netlify/functions/portal-req*', async rt => {
      const rq = rt.request(); const b = rq.postData() || '{}'; seen.push(JSON.parse(b).action);
      const out = await require(FNDIR + '/portal-req.js').handler({ httpMethod: 'POST', headers: Object.assign({}, rq.headers(), { origin: 'https://crm.grayco-cs.com' }), body: b });
      return rt.fulfill({ status: out.statusCode, contentType: 'application/json', body: out.body });
    });
    await H.signIn(c, 'sbiffle@grayco-cs.com');
    await H.waitFor(c, () => !!(window._gcPortalReq && window._gcOpenApprovals && window.gcAddCO), null, 60000, 300);
    const p = c.page();
    await p.setViewportSize({ width: 1280, height: 900 });
    await c.ev(() => window._gcOpenApprovals());
    const sel = '._apCard[data-id="appr_preq_' + id + '"]';
    const okCard = await H.waitFor(c, s => { const el = document.querySelector(s); return !!(el && el.querySelector('.gcpr-staff .gcpr-bs') && el.querySelector('.gcpr-files img')); }, sel, 30000, 300);
    assert.ok(okCard, 'the card is decorated: ' + JSON.stringify(seen) + ' ' + (await c.ev(s => { const el = document.querySelector(s); return el ? el.textContent.slice(0, 300) : 'no card: ' + document.querySelectorAll('._apCard').length; }, sel)));
    const info = await c.ev(s => { const el = document.querySelector(s); return { text: el.textContent, btns: Array.from(el.querySelectorAll('.gcpr-bs button')).map(b => b.textContent), approveShown: !!Array.from(el.querySelectorAll('._apApprove')).find(b => b.offsetParent) }; }, sel);
    assert.deepStrictEqual(info.btns, ['🔁 Make a change order', '💬 Reply', '✖ Decline with note']);
    assert.ok(/attic vents/.test(info.text) && /Garage roof, back side/.test(info.text) && /mornings/.test(info.text) && /Soon/.test(info.text), info.text);
    assert.ok(!info.approveShown, 'no plain Approve on a request card');
    await c.ev(s => document.querySelector(s).scrollIntoView({ block: 'start' }), sel); await H.sleep(400);
    await p.screenshot({ path: SHOTS + '/portalreq_staff_card_desktop.png' });
    await p.setViewportSize({ width: 390, height: 844 }); await H.sleep(600);
    await c.ev(s => document.querySelector(s).scrollIntoView({ block: 'start' }), sel); await H.sleep(400);
    await p.screenshot({ path: SHOTS + '/portalreq_staff_card_phone.png' });
    await p.setViewportSize({ width: 1280, height: 900 }); await H.sleep(400);
    await c.ev(s => document.querySelector(s + ' .gcpr-bs .rp').click(), sel);
    await H.waitFor(c, s => !!document.querySelector(s + ' .gcpr-box textarea'), sel, 5000, 200);
    await c.ev(s => document.querySelector(s + ' .gcpr-bs .co').click(), sel);
    const pre = await H.waitFor(c, () => { const o = document.getElementById('gc-addco-overlay'); return o && o.classList.contains('visible') ? { desc: document.getElementById('gc-co-desc').value, reason: document.getElementById('gc-co-reason').value, notes: document.getElementById('gc-co-notes').value } : null; }, null, 10000, 200);
    assert.ok(pre && pre.desc === 'Please add two attic vents over the garage' && pre.reason === 'Customer request (portal)' && /Garage roof, back side/.test(pre.notes) && new RegExp(id).test(pre.notes), JSON.stringify(pre));
    await p.screenshot({ path: SHOTS + '/portalreq_staff_co_builder_desktop.png' });
    await c.ev(() => { document.getElementById('gc-co-amt').value = '1450'; window.gcAddCO.updateThreshold(); return window.gcAddCO.save(); });
    let linked = null; for (let i = 0; i < 40 && !linked; i++) { await H.sleep(300); const s = store().find(x => x.id === id); if (s && s.coId) linked = s; }
    assert.ok(linked && linked.status === 'pricing', 'the saved change order is linked to the request: ' + JSON.stringify(seen));
    assert.ok(seen.includes('staff-pricing') && seen.includes('staff-link-co'), JSON.stringify(seen));
    assert.strictEqual(aq().find(x => x.id === 'appr_preq_' + id).status, 'sent', 'the card is closed');
    const m = await R({ action: 'mine' }, { 'x-portal-token': LINK_P1 }); assert.strictEqual(m.data.requests.find(x => x.id === id).statusLabel, 'Being priced');
    const errs = c.errs.filter(e => !/cdnjs|ERR_|net::/.test(e));
    assert.deepStrictEqual(errs, [], 'no page errors in the CRM');
    await c.b.close();
  });
}
console.log((failed ? 'FAILED ' : 'OK ') + passed + '/' + (passed + failed));
process.exit(failed ? 1 : 0);
