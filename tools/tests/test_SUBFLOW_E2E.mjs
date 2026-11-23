/* test_SUBFLOW_E2E.mjs [build dir] — patch SUBFLOW: the whole sub workflow, end to end, on BOTH sub doors (no browser; one in-memory
   Supabase behind the REAL netlify functions: subportal.js = bids.grayco-cs.com, portal-access.js = portal.grayco-cs.com, bid-hub.js = the
   CRM's 🏗 Bid portal; the CRM's "GrayCo Field" app answers through the same bid-hub op the desk uses). Made-up people, jobs and files only;
   nothing leaves the machine (PORTAL_MAIL_OFF; push / text captured through _lib/jobmsgnotify.js's own test hooks).
   Owner 11/23: "Make sure my sub portal is correctly taking bids for jobs and everything is working correctly. Remember bid portal is very
   important too like sub portal. Bid portal should take bids, make sure they can download plans, request plans; when a sub requests anything
   or messages on bid or sub portal directed towards PM or estimator they should get notification and be able to answer on their app or CRM."
   People: Pat (the job's PM — NOT an admin; only the CRM job names him) and Eve (the estimator — NOT an admin). Sub A (Drywall) has a bid-site
   account and a CRM sub record (so both doors); Mo is a coworker on A's team (PORTALTEAM); Sub C (Paint) is the other bidder.
   Chain checked for each kind: sub action → 🔔 For you post naming Pat + Eve (+ To-Do where it applies) → push / text (🌙 quiet hours held)
   → Pat / Eve answer (desk and Field call the same bid-hub op) → the sub sees it on the bid site AND the sub portal. */
import { createRequire } from 'module'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0; const ST = {};
const NOB = process.argv.includes('--no-browser');
function HNB(){ if (NOB) return false; try { require(path.join(process.env.NODE_PATH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright')); return true; } catch (e) { return false; } }
const R = [];
async function t(name, fn){ Object.keys(ST).forEach(k => delete ST[k]); /* each step is a new moment: the 5-minute throttle of the job-message rules starts over */ try { await fn(); pass++; R.push(['PASS', name]); console.log('  ✓', name); } catch (e) { fail++; R.push(['FAIL', name]); console.log('  ✗', name, '\n     ', e && e.message ? e.message.slice(0, 900) : e); } }
function eq(a, b, m){ if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function yes(c, m){ if (!c) throw new Error(m || 'expected true'); }
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-key-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
['RESEND_API_KEY', 'OWNER_EMAILS', 'SUBPORTAL_NOTIFY', 'LEAD_ADMINS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'PORTAL_AUTO_EMAIL', 'STAFF_EMAILS'].forEach(k => delete process.env[k]);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const hmac = v => crypto.createHmac('sha256', 'svc-key-test').update(String(v)).digest('hex');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const now = new Date().toISOString();
const PAT = 'pat@grayco-cs.com', EVE = 'eve@grayco-cs.com', OWN = 'wesley@grayco-cs.com';

/* ── the CRM (gc_kv) ── */
const KV = {
  users: [{ id: 'u1', name: 'Wes Owner', email: OWN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Pat Manager', email: PAT, phone: '901-555-0142', role: 'Project Manager', active: true },
    { id: 'u3', name: 'Eve Estimator', email: EVE, phone: '901-555-0143', role: 'Estimator', active: true }],
  projects: [{ id: 'P1', name: 'Foxtrot Demo Clinic', address: '600 Foxtrot Ave, Memphis, TN 38117', client: 'Foxtrot Health LLC', status: 'estimating', pm: 'Pat Manager', autoPO: 'T777', subs: [{ id: 'r1', subId: 'SA', name: 'Alpha Drywall LLC', trade: 'Drywall', status: 'Awarded' }], createdAt: now, updatedAt: now },
    { id: 'P2', name: 'Golf Demo Office', address: '7 Golf Rd', client: 'Golf LLC', status: 'active', pm: 'Pat Manager', autoPO: 'T778', subs: [{ id: 'r2', subId: 'SA', name: 'Alpha Drywall LLC', trade: 'Drywall', status: 'Awarded' }], createdAt: now, updatedAt: now }],
  leads: [],
  vendors: [{ id: 'SA', name: 'Alpha Drywall LLC', company: 'Alpha Drywall LLC', contact: 'Al Alpha', email: 'al@alphadrywall.test', phone: '901-555-0161', isSub: true, trade: 'Drywall' },
    { id: 'SC', name: 'Charlie Paint Inc', company: 'Charlie Paint Inc', contact: 'Cy Charlie', email: 'cy@charliepaint.test', phone: '901-555-0163', isSub: true, trade: 'Paint' }],
  gc_job_messages: [], gc_office_tasks: [], gc_automation_pause: { on: false }, gc_sub_portal_settings: {}
};
/* ── sp_rows (the bid site) + the portal tables ── */
const T = { gc_portal_lock: [], gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal: [], sp_rows: [], gc_portal_code: [],
  gc_staff: [{ email: OWN, role: 'admin', active: true, name: 'Wes Owner', profile: '' }, { email: PAT, role: 'staff', active: true, name: 'Pat Manager', profile: '' }, { email: EVE, role: 'staff', active: true, name: 'Eve Estimator', profile: 'estimator' }] };
const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now }, extra || {});
const U = { A: { id: 'u_a', role: 'sub', approved: true, email: 'al@alphadrywall.test', name: 'Al Alpha', company: 'Alpha Drywall LLC', phone: '901-555-0161', trades: ['Drywall'] },
  C: { id: 'u_c', role: 'sub', approved: true, email: 'cy@charliepaint.test', name: 'Cy Charlie', company: 'Charlie Paint Inc', phone: '901-555-0163', trades: ['Paint', 'Drywall'] },
  E: { id: 'u_e', role: 'sub', approved: true, email: 'ed@echodrywall.test', name: 'Ed Echo', company: 'Echo Drywall Co', phone: '901-555-0165', trades: ['Drywall'] } };   /* E: bid site only (no CRM sub record) */
Object.values(U).forEach(u => T.sp_rows.push(spRow('users', u.id, u, { user_id: u.id, email: u.email })));
/* bid jobs: J1 public drywall (the CRM job P1 names its PM; Eve is its estimator), JP public paint only, JD a draft, JX private (not invited),
   JI private + A invited, JL past due, JC ⏸ bidding closed */
const est = 'st_eve';
const J = {
  J1: { id: 'J1', title: 'Foxtrot Demo Clinic — interiors', address: '600 Foxtrot Ave, Memphis, TN 38117', bidDueDate: day(6), bidDueTime: '14:00', status: 'open', visibility: 'public', tradesSought: 'Drywall',
    scope: 'Interior build-out, 4 exam rooms.', tradeScopes: [{ id: 'ts1', trade: 'Drywall', scope: 'DRYWALL: hang, tape, Level 4.' }], crmProjectId: 'P1', estimatorId: est,
    plansLinks: [{ id: 'pl1', url: 'https://drive.google.com/drive/folders/demo-foxtrot', label: 'Drive plan room' }], bidForm: [{ id: 'bf1', trade: 'Drywall', item: 'Walls L4', unit: 'LS' }], log: ['INTERNAL-LOG-ZZ'], internalNotes: 'INTERNAL-NOTE-ZZ', estValue: 98765 },
  JP: { id: 'JP', title: 'Paint Only Demo', bidDueDate: day(6), status: 'open', visibility: 'public', tradesSought: 'Paint' },
  JD: { id: 'JD', title: 'Draft Demo Job', bidDueDate: day(6), status: 'draft', draft: true, visibility: 'private', tradesSought: 'Drywall' },
  JX: { id: 'JX', title: 'Private Demo Job', bidDueDate: day(6), status: 'open', visibility: 'private', tradesSought: 'Drywall' },
  JI: { id: 'JI', title: 'Invited Demo Job', bidDueDate: day(6), status: 'open', visibility: 'private', tradesSought: 'Drywall', crmProjectId: 'P1' },
  JL: { id: 'JL', title: 'Late Demo Job', bidDueDate: day(-2), status: 'open', visibility: 'public', tradesSought: 'Drywall', crmProjectId: 'P1' },
  JA: { id: 'JA', title: 'Addenda Demo Job', address: '9 Addenda Way', bidDueDate: day(8), status: 'open', visibility: 'public', tradesSought: 'Drywall', crmProjectId: 'P1', estimatorId: est },
  JC: { id: 'JC', title: 'Closed Demo Job', bidDueDate: day(6), status: 'open', visibility: 'public', tradesSought: 'Drywall', biddingClosed: true, crmProjectId: 'P1' } };
Object.values(J).forEach(j => T.sp_rows.push(spRow('jobs', j.id, j, { job_id: j.id })));
T.sp_rows.push(spRow('invites', 'inv_ai', { id: 'inv_ai', jobId: 'JI', email: U.A.email }, { job_id: 'JI', email: U.A.email }));
/* plan files (bytes in the bucket) */
const STORE = new Map();
const PDF = n => Buffer.concat([Buffer.from('%PDF-1.4\n% sheet ' + n + '\n'), Buffer.alloc(900, 0x20), Buffer.from('\n%%EOF')]);
const PL = [{ name: 'A-101 Floor plan.pdf', fileRef: 'staff/2026-11/aa11-A-101.pdf', size: 0, type: 'application/pdf', category: 'Plans' }, { name: 'S-201 Structure.pdf', fileRef: 'staff/2026-11/bb22-S-201.pdf', size: 0, type: 'application/pdf', category: 'Plans' }];
PL.forEach((p, i) => { const b = PDF(p.name); p.size = b.length; STORE.set('subportal-files/' + p.fileRef, b); });
T.sp_rows.push(spRow('plans', 'J1', { items: PL }, { job_id: 'J1' }));
const DPL = [{ name: 'DRAFT-SECRET.pdf', fileRef: 'staff/2026-11/cc33-D.pdf', size: 10, type: 'application/pdf' }];
STORE.set('subportal-files/' + DPL[0].fileRef, Buffer.from('%PDF-secret'));
T.sp_rows.push(spRow('plans', 'JD', { items: DPL }, { job_id: 'JD' }), spRow('plans', 'JX', { items: [{ name: 'PRIVATE-SECRET.pdf', fileRef: 'staff/2026-11/dd44-X.pdf', size: 10, type: 'application/pdf' }] }, { job_id: 'JX' }));
const papers = [{ id: 'd1', type: 'w9' }, { id: 'd2', type: 'insurance_general', expirationDate: day(200) }, { id: 'd3', type: 'insurance_workers_comp', expirationDate: day(150) }];
T.sp_rows.push(spRow('subdocs', 'u_c', { items: papers }, { user_id: 'u_c' }));   /* A has NO papers yet (the gate) */
/* PORTALTEAM: Mo is an active coworker on A's team */
const MO = 'mo@alphadrywall.test';
T.sp_rows.push(spRow('team', 'tm_mo', { id: 'tm_mo', company: 'sp:u_a', kind: 'sub', companyName: 'Alpha Drywall LLC', name: 'Mo Member', email: MO, status: 'active', addedAt: now }, { user_id: 'sp:u_a', email: MO }));
/* sub portal sessions: A (primary), Mo (A's coworker), C */
const SESS = { A: 'A'.repeat(43), MO: 'M'.repeat(43), C: 'C'.repeat(43) };
T.gc_portal_session.push({ id: sha(SESS.A), kind: 'partner', sub_id: 'SA', links: ['a'.repeat(43)], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now },
  { id: sha(SESS.MO), kind: 'partner', sub_id: 'SA', ident: hmac('e:' + MO), links: ['a'.repeat(43)], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now },
  { id: sha(SESS.C), kind: 'partner', sub_id: 'SC', links: ['c'.repeat(43)], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now });
T.gc_sub_link.push({ token: 'a'.repeat(43), sub_id: 'SA', revoked: false }, { token: 'c'.repeat(43), sub_id: 'SC', revoked: false });
/* a bid PDF each sub stored in the portal (p-upload) */
const PDFREF = { SA: 'sb:crm-files/' + 'a'.repeat(64) + '.pdf', SC: 'sb:crm-files/' + 'c'.repeat(64) + '.pdf' };
T.gc_sub_event.push({ id: 'EupA', kind: 'upload', sub_id: 'SA', project_id: null, data: { ref: PDFREF.SA, name: 'Alpha bid.pdf', type: 'application/pdf', size: 1500 }, created_at: now },
  { id: 'EupC', kind: 'upload', sub_id: 'SC', project_id: null, data: { ref: PDFREF.SC, name: 'Charlie bid.pdf', type: 'application/pdf', size: 1500 }, created_at: now });

/* ── the in-memory Supabase ── */
const MAIL = [], OUT = [];
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => (typeof body === 'string' ? JSON.parse(body || 'null') : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  arrayBuffer: async () => Buffer.isBuffer(body) ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0) });
const val = v => decodeURIComponent(String(v || '')).replace(/^eq\./, '');
const inl = v => decodeURIComponent(String(v || '')).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
const kvOut = v => typeof v === 'string' ? v : v;
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(String(url)), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  const hget = k => { if (typeof hd.get === 'function') return hd.get(k) || ''; return hd[k] || hd[k.toLowerCase()] || ''; };
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'mail' + MAIL.length }); }
  if (u.host !== 'sb.test') { OUT.push(u.host); return res(404, {}); }
  if (u.pathname === '/auth/v1/user') { const a = String(hget('Authorization')).replace(/^Bearer\s+/i, ''); const mm = /^tok:(.+)$/.exec(a); return mm ? res(200, { id: 'auth-' + mm[1].split('@')[0], email: mm[1] }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { KV[r.key] = typeof r.value === 'string' && /^[\[{]/.test(r.value) ? JSON.parse(r.value) : r.value; KV['__at_' + r.key] = new Date().toISOString() + Math.random(); }); return res(201, []); }
    if (m === 'PATCH') { const k = val(q.get('key')), b = JSON.parse(init.body); KV[k] = typeof b.value === 'string' && /^[\[{]/.test(b.value) ? JSON.parse(b.value) : b.value; return res(200, [{ key: k, value: KV[k], updated_at: now }]); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [val(k)];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: kvOut(KV[x]), updated_at: KV['__at_' + x] || 'T0' })));
  }
  if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return res(200, []);
  let mm;
  if ((mm = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'POST') return res(200, { url: '/object/upload/sign/' + mm[1] + '/' + mm[2] + '?token=up' });
  if ((mm = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'PUT') { STORE.set(mm[1] + '/' + mm[2].split('/').map(decodeURIComponent).join('/'), Buffer.from(init.body || '')); return res(200, { Key: mm[2] }); }
  if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)$/.exec(u.pathname))) { const b = JSON.parse(init.body); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/' + mm[1] + '/' + p + '?token=signed' }))); }
  if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(u.pathname))) { const b = STORE.get(mm[1] + '/' + decodeURIComponent(mm[2])); return b ? res(200, b) : res(404, {}); }
  if ((mm = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(u.pathname))) {
    const k = mm[1] + '/' + mm[2].split('/').map(decodeURIComponent).join('/');
    if (m === 'POST' || m === 'PUT') { STORE.set(k, Buffer.from(init.body)); return res(200, { Key: k }); }
    const b = STORE.get(k); return b ? res(200, m === 'HEAD' ? '' : b) : res(404, { error: 'not found' });
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm && T[tm[1]]) {
    const tb = T[tm[1]];
    if (m === 'POST') { const b = JSON.parse(init.body), merge = /merge-duplicates/.test(hget('Prefer')) && (q.get('on_conflict') || 'key');
      (Array.isArray(b) ? b : [b]).forEach(r => { const i = merge && r[merge] !== undefined ? tb.findIndex(x => x[merge] === r[merge]) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], JSON.parse(JSON.stringify(r))); else tb.push(Object.assign({ created_at: new Date().toISOString() }, JSON.parse(JSON.stringify(r)))); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k] == null ? '' : r[k]) === val(v));
      else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k]) !== decodeURIComponent(v.slice(4)));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > decodeURIComponent(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (tm[1] === 'sp_rows') rows.sort((a, b) => a.key < b.key ? -1 : 1);
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    return res(200, JSON.parse(JSON.stringify(rows)));
  }
  return res(200, []);
};
/* push / text: the job-message notifier's own hooks (its rules — who, 🌙 quiet, throttle — stay real) */
const JMN = require(path.join(FN, '_lib/jobmsgnotify.js'));
const PUSH = [], TEXT = []; let QUIET = false;
Object.assign(JMN._D, { data: async () => ({ users: KV.users, projects: KV.projects }), away: async () => ({}), quiet: async () => QUIET,
  push: async (emails, payload, opts) => { PUSH.push({ emails: emails.slice(), payload, opts }); return QUIET && !(opts && opts.emergency) ? { to: [], held: emails.slice() } : { to: emails.slice() }; },
  text: async o => { TEXT.push(o); return QUIET && !o.emergency ? { to: [], skipped: { held: o.only.slice() } } : { to: o.only.slice() }; },
  stateCas: async f => { const v = f(JSON.parse(JSON.stringify(ST))); Object.keys(ST).forEach(k => delete ST[k]); Object.assign(ST, v); return v; } });
const SP = require(path.join(FN, 'subportal.js'));
const PA = require(path.join(FN, 'portal-access.js'));
const BH = require(path.join(FN, 'bid-hub.js'));
let ipN = 0;
const ip = () => '10.7.' + Math.floor(++ipN / 250) + '.' + (ipN % 250);
/* the bid site (bids.grayco-cs.com) as a signed-in person */
const bid = async (email, action, body) => { const r = await SP.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.grayco-cs.com', authorization: 'Bearer tok:' + email, 'x-nf-client-connection-ip': ip() }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
/* the sub portal (portal.grayco-cs.com) */
const portal = async (who, action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': SESS[who], 'x-nf-client-connection-ip': ip() }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
/* the CRM (desk or GrayCo Field — the same calls) as Pat / Eve */
const hub = async (email, body) => { const r = await BH.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer tok:' + email }, queryStringParameters: {}, body: JSON.stringify(body) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const hubGet = async (email, qs) => { const r = await BH.handler({ httpMethod: 'GET', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer tok:' + email }, queryStringParameters: qs }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const staffPortal = async (email, action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer tok:' + email }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const dl = async url => { const r = await fetch(url); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
const jm = () => KV.gc_job_messages || [];
const todos = () => KV.gc_office_tasks || [];
const told = m => (m.notify || []).map(x => x.e).sort();
const newMsgs = f => { const n = jm().length; return () => jm().slice(n).filter(f || (() => true)); };
const pingTo = (since) => PUSH.slice(since).flatMap(p => p.emails);
/* the CRM's 🔔 For you rule (index.html patch JOBMENTION recipients(): m.notify when the post carries it, else the job's PM) */
const forYou = (email, m) => Array.isArray(m.notify) ? m.notify.some(x => x.e === email) : (KV.projects.find(p => p.id === m.pid) || {}).pm === (KV.users.find(u => u.email === email) || {}).name;
const NEVER_SUB = ['INTERNAL-LOG-ZZ', 'INTERNAL-NOTE-ZZ', '98765', 'DRAFT-SECRET', 'PRIVATE-SECRET', 'Draft Demo Job', 'Private Demo Job'];
const clean = (raw, extra) => { const bad = NEVER_SUB.concat(extra || []).filter(w => raw.indexOf(w) >= 0); if (bad.length) throw new Error('a sub saw: ' + bad.join(', ')); };

console.log('\n1. find and open a job (TRADEVIS; details, scope, due date)');
await t('1a bid site: A (Drywall) sees J1, JA, JI (invited), JL, JC — never the draft, the uninvited private job or the paint-only job; J1 details are right', async () => {
  const r = await bid(U.A.email, 'load', { keys: ['jobs'] }); eq(r.code, 200, r.raw);
  const ids = r.j.data.jobs.map(j => j.id).sort(); eq(ids, ['J1', 'JA', 'JC', 'JI', 'JL']);
  const j = r.j.data.jobs.find(x => x.id === 'J1'); eq([j.title, j.bidDueDate, j.bidDueTime, j.scope, j.tradeScopes.map(x => x.scope)], [J.J1.title, J.J1.bidDueDate, '14:00', J.J1.scope, ['DRYWALL: hang, tape, Level 4.']]);
  clean(r.raw);
});
await t('1b sub portal 📋 Jobs to bid: the same five for A, the same details; C (Paint + Drywall) sees JP too', async () => {
  const r = await portal('A', 'p-bidjobs'); eq(r.code, 200, r.raw);
  eq(r.j.jobs.map(j => j.id).sort(), ['J1', 'JA', 'JC', 'JI', 'JL']);
  const j = r.j.jobs.find(x => x.id === 'J1'); eq([j.bidDueDate, j.scope, j.canBid, j.invited], [J.J1.bidDueDate, J.J1.scope, true, false]);
  eq(r.j.jobs.find(x => x.id === 'JI').invited, true, 'JI invited');
  clean(r.raw);
  const c = await portal('C', 'p-bidjobs'); yes(c.j.jobs.some(x => x.id === 'JP') && c.j.jobs.some(x => x.id === 'J1'), 'C: ' + c.j.jobs.map(x => x.id));
});
await t('1c past due (JL) and ⏸ bidding closed (JC) show as closed on both sites', async () => {
  const r = await bid(U.A.email, 'load', { keys: ['jobs'] }); const jl = r.j.data.jobs.find(x => x.id === 'JL'), jc = r.j.data.jobs.find(x => x.id === 'JC');
  eq([!!jl.biddingClosed, !!jl.pastDue, !!jc.biddingClosed], [true, true, true]);
  const p = await portal('A', 'p-bidjobs'); eq([p.j.jobs.find(x => x.id === 'JL').canBid, p.j.jobs.find(x => x.id === 'JC').canBid, p.j.jobs.find(x => x.id === 'JL').pastDue], [false, false, true]);
});

console.log('\n2. plans: every file, the ZIP of all, the plan links; drafts / private never');
await t('2a bid site: both plan files come signed and download the exact bytes; the Drive link is on the job', async () => {
  const r = await bid(U.A.email, 'load', { keys: ['plans:J1', 'jobs'] }); eq(r.code, 200, r.raw);
  const L = r.j.data['plans:J1']; eq(L.map(f => f.name), PL.map(f => f.name));
  for (const f of L) { const b = await dl(f.dataUrl); yes(b && b.equals(STORE.get('subportal-files/' + PL.find(p => p.name === f.name).fileRef)), 'bytes of ' + f.name); }
  eq(r.j.data.jobs.find(x => x.id === 'J1').plansLinks.map(l => l.url), [J.J1.plansLinks[0].url]);
});
await t('2b sub portal: the same two files download the same bytes; the Drive link is there', async () => {
  const r = await portal('A', 'p-bidjobs'); const j = r.j.jobs.find(x => x.id === 'J1');
  eq(j.plans.map(f => f.name), PL.map(f => f.name)); for (const f of j.plans) { const b = await dl(f.url); yes(b && b.length > 900 && b.slice(0, 5).toString() === '%PDF-', 'bytes ' + f.name); }
  eq(j.plansLinks.map(l => l.url), [J.J1.plansLinks[0].url]);
});
const unzip = buf => { const out = {}; let o = 0; while (buf.readUInt32LE(o) === 0x04034b50) { const n = buf.readUInt16LE(o + 26), x = buf.readUInt16LE(o + 28), sz = buf.readUInt32LE(o + 18); const name = buf.slice(o + 30, o + 30 + n).toString(); out[name] = buf.slice(o + 30 + n + x, o + 30 + n + x + sz); o += 30 + n + x + sz; } return out; };
await t('2c ⬇ All plans (ZIP) from the bid site AND the sub portal: one ZIP holding both files byte for byte', async () => {
  const a = await bid(U.A.email, 'plans-zip', { jobId: 'J1' }); eq(a.code, 200, a.raw); const za = unzip(await dl(a.j.url));
  eq(Object.keys(za).sort(), PL.map(f => f.name).sort()); PL.forEach(f => yes(za[f.name].equals(STORE.get('subportal-files/' + f.fileRef)), 'zip bytes ' + f.name));
  const b = await portal('A', 'p-bid-zip', { jobId: 'J1' }); eq(b.code, 200, b.raw); eq(Object.keys(unzip(await dl(b.j.url))).sort(), PL.map(f => f.name).sort());
});
await t('2d a draft / an uninvited private job: no plans, no ZIP, from either site', async () => {
  const r = await bid(U.A.email, 'load', { keys: ['plans:JD', 'plans:JX'] }); eq([r.j.data['plans:JD'], r.j.data['plans:JX']], [[], []]); clean(r.raw);
  for (const id of ['JD', 'JX']) { const z = await bid(U.A.email, 'plans-zip', { jobId: id }); yes(z.code === 404, id + ' bid zip ' + z.code); const p = await portal('A', 'p-bid-zip', { jobId: id }); yes(p.code === 403 || p.code === 404, id + ' portal zip ' + p.code); }
});

console.log('\n3. 📩 request plans / info → PM + estimator → answered from the CRM (desk) and GrayCo Field → the sub sees it on both sites');
let pr1Msg = null;
await t('3a bid site request (A): 🔔 For you post naming Pat (PM, from the CRM job) AND Eve (estimator); a To-Do for both; push + text to both', async () => {
  const p0 = PUSH.length, nm = newMsgs();
  const r = await bid(U.A.email, 'request-plans', { jobId: 'J1', needs: ['specs', 'other'], note: 'Need the finish schedule.' }); eq(r.code, 200, r.raw);
  eq(r.j.to.map(x => x.name).sort(), ['Eve Estimator', 'Pat Manager']);
  pr1Msg = nm().find(m => m.planReqId === 'J1__u_a'); yes(pr1Msg, 'job message'); eq(told(pr1Msg), [EVE, PAT]); yes(forYou(PAT, pr1Msg) && forYou(EVE, pr1Msg), 'For you'); eq(pr1Msg.pid, 'P1');
  eq((pr1Msg.sf || {}).kind, 'planreq', 'reply hook');
  const td = todos().find(x => x.id === 'planreq_J1__u_a'); yes(td && !td.done, 'To-Do'); eq(td.assignees.sort(), [EVE, PAT]);
  eq(pingTo(p0).sort(), [EVE, PAT]); yes(TEXT.length && TEXT[TEXT.length - 1].only.sort().join() === [EVE, PAT].join(), 'text alert to both');
});
await t('3b Pat (PM, not an admin) answers it with ↩ Reply from the job thread (bid-hub op subreply — desk and GrayCo Field) → To-Do done; the team sees the answer', async () => {
  const r = await hub(PAT, { op: 'subreply', kind: 'planreq', id: 'J1__u_a', text: 'Finish schedule is sheet A-601, added to the Drive folder.', pid: pr1Msg.pid, msgId: pr1Msg.id }); eq(r.code, 200, r.raw);
  yes(todos().find(x => x.id === 'planreq_J1__u_a').done, 'To-Do done');
  yes(jm().some(m => m.id === r.j.posted && /Answered Alpha Drywall LLC: Finish schedule/.test(m.text) && m.notify.length === 0), 'answer post in the thread');
});
await t('3c A sees the answer on the bid site (request + update) AND the sub portal (📋 Jobs to bid)', async () => {
  const b = await bid(U.A.email, 'load', { keys: ['planreqs', 'messages'] }); const q = b.j.data.planreqs.find(x => x.jobId === 'J1');
  eq([q.status, q.closedHow, q.reply], ['closed', 'answered', 'Finish schedule is sheet A-601, added to the Drive folder.']);
  yes(b.j.data.messages.some(m => /Finish schedule is sheet A-601/.test(m.body)), 'bid-site update');
  const p = await portal('A', 'p-bidjobs'); const pq = p.j.jobs.find(x => x.id === 'J1').request; eq([pq.closedHow, pq.reply], ['answered', 'Finish schedule is sheet A-601, added to the Drive folder.']);
});
await t('3d sub portal request (A, again): the same people hear; Eve answers it from GrayCo Field (the same op) → both sites show it', async () => {
  const p0 = PUSH.length, nm = newMsgs();
  const r = await portal('A', 'p-bid-request', { jobId: 'J1', needs: ['sitewalk'], note: 'When can we walk it?' }); eq(r.code, 200, r.raw);
  const m = nm().find(x => x.planReqId === 'J1__u_a'); yes(m, 'post'); eq(told(m), [EVE, PAT]); eq(pingTo(p0).sort(), [EVE, PAT]);
  const a = await hub(EVE, { op: 'subreply', kind: 'planreq', id: 'J1__u_a', text: 'Walk Thursday 9 AM, meet at the front.', pid: m.pid, msgId: m.id }); eq(a.code, 200, a.raw);
  const b = await bid(U.A.email, 'load', { keys: ['planreqs'] }); eq(b.j.data.planreqs.find(x => x.jobId === 'J1').reply, 'Walk Thursday 9 AM, meet at the front.');
  const p = await portal('A', 'p-bidjobs'); eq(p.j.jobs.find(x => x.id === 'J1').request.reply, 'Walk Thursday 9 AM, meet at the front.');
});
await t('3e 🌙 staff quiet hours: a request at night still posts (🔔) but the push / text are HELD for the morning', async () => {
  QUIET = true; const p0 = PUSH.length;
  try { const r = await bid(U.C.email, 'request-plans', { jobId: 'J1', needs: ['plans'] }); eq(r.code, 200, r.raw);
    const last = PUSH.slice(p0); yes(last.length, 'a push call'); yes(!(last[0].opts || {}).emergency, 'not an emergency');
    const tx = TEXT[TEXT.length - 1]; yes(tx.hold === true && tx.sqOnly === true, 'text through the quiet-hours rule');
  } finally { QUIET = false; }
});
await t('3f another staffer (not the PM / estimator / admin) cannot answer; a sub cannot use the staff op', async () => {
  T.gc_staff.push({ email: 'ray@grayco-cs.com', role: 'staff', active: true, name: 'Ray Field', profile: '' }); KV.users.push({ id: 'u9', name: 'Ray Field', email: 'ray@grayco-cs.com', role: 'Field Tech', active: true });
  const r = await hub('ray@grayco-cs.com', { op: 'subreply', kind: 'planreq', id: 'J1__u_c', text: 'x' }); eq(r.code, 403, r.raw);
  const s = await hub(U.A.email, { op: 'subreply', kind: 'planreq', id: 'J1__u_c', text: 'x' }); eq(s.code, 403, s.raw);
});

console.log('\n4. ❓ questions and 💬 messages, from either site');
let q1 = '', q1Msg = null;
await t('4a bid site question (A): 🔔 post + To-Do + push / text for Pat AND Eve', async () => {
  const p0 = PUSH.length, nm = newMsgs(); q1 = 'q_bid_' + Date.now().toString(36);
  const r = await bid(U.A.email, 'save', { key: 'questions', upsert: [{ id: q1, jobId: 'J1', body: 'Is the corridor in the drywall scope?' }] }); eq(r.code, 200, r.raw);
  q1Msg = nm().find(m => m.sf && m.sf.kind === 'question' && m.sf.id === q1); yes(q1Msg, 'post: ' + JSON.stringify(jm().slice(-2)));
  eq(told(q1Msg), [EVE, PAT]); yes(/corridor/.test(q1Msg.text), 'the words');
  const td = todos().find(x => x.id === 'sf_question_' + q1); yes(td && !td.done, 'To-Do'); eq(td.assignees.sort(), [EVE, PAT]);
  eq(pingTo(p0).sort(), [EVE, PAT]);
});
await t('4b Eve answers PRIVATELY from the thread → To-Do done; A sees it on the bid site AND the sub portal; C never sees it', async () => {
  const r = await hub(EVE, { op: 'subreply', kind: 'question', id: q1, text: 'Yes — corridor walls are in.', pid: q1Msg.pid, msgId: q1Msg.id }); eq(r.code, 200, r.raw);
  yes(todos().find(x => x.id === 'sf_question_' + q1).done, 'To-Do done');
  const b = await bid(U.A.email, 'load', { keys: ['questions'] }); eq(b.j.data.questions.find(x => x.id === q1).answer, 'Yes — corridor walls are in.');
  const p = await portal('A', 'p-bidjobs'); eq(p.j.jobs.find(x => x.id === 'J1').questions.find(x => x.id === q1).answer, 'Yes — corridor walls are in.');
  const c = await bid(U.C.email, 'load', { keys: ['questions'] }); yes(!c.raw.includes('corridor'), 'C saw a private answer');
  const cp = await portal('C', 'p-bidjobs'); yes(!cp.raw.includes('corridor'), 'C saw it on the portal');
});
let q2 = '';
await t('4c sub portal question (A) → Pat answers TO ALL BIDDERS → A and C see it (no name), on both sites; its e-mail waits on approval', async () => {
  const nm = newMsgs();
  const r = await portal('A', 'p-bid-ask', { jobId: 'J1', text: 'Who supplies the corner bead?' }); eq(r.code, 200, r.raw); q2 = r.j.id;
  const m = nm().find(x => x.sf && x.sf.id === q2); yes(m, 'post'); eq(told(m), [EVE, PAT]); yes(/sub portal/.test(m.authorName), 'door: ' + m.authorName);
  const a = await hub(PAT, { op: 'subreply', kind: 'question', id: q2, text: 'GrayCo supplies the corner bead.', publish: true, pid: m.pid, msgId: m.id }); eq(a.code, 200, a.raw);
  const row = T.sp_rows.find(x => x.key === 'questions/' + q2).data; eq([row.visibility, row.noticeStatus, row.num], ['public', 'waiting', 1]);
  for (const e of [U.A.email, U.C.email]) { const b = await bid(e, 'load', { keys: ['questions'] }); eq((b.j.data.questions.find(x => x.id === q2) || {}).answer, 'GrayCo supplies the corner bead.', e); }
  const c = await portal('C', 'p-bidjobs'); const cq = c.j.jobs.find(x => x.id === 'J1').questions.find(x => x.id === q2); eq([cq.answer, cq.mine, cq.shared], ['GrayCo supplies the corner bead.', false, true]);
  yes(!c.raw.includes('Alpha'), 'C sees no name');
});
let bm1 = '', bmMsg = null;
await t('4d bid site 💬 message (A, CRM sub linked, job linked to CRM job P1): in the CRM job\'s sub thread naming Pat + Eve (🔔), push / text to both', async () => {
  const p0 = PUSH.length, nm = newMsgs(); bm1 = 'm_bid_' + Date.now().toString(36);
  const r = await bid(U.A.email, 'save', { key: 'messages', upsert: [{ id: bm1, jobId: 'J1', body: 'Can we start a week later?' }] }); eq(r.code, 200, r.raw);
  bmMsg = nm().find(m => /Can we start a week later/.test(m.text)); yes(bmMsg, 'post'); eq(bmMsg.pid, 'P1'); eq(told(bmMsg), [EVE, PAT]); eq(bmMsg.channel, 'subportal');
  eq(pingTo(p0).sort(), [EVE, PAT]);
});
await t('4e Pat answers it from the thread (↩ Reply) → A sees it on the bid site AND the sub portal', async () => {
  const r = await hub(PAT, { op: 'subreply', kind: 'portal', subId: bmMsg.subId, pid: bmMsg.pid, text: 'A week later is fine.', msgId: bmMsg.id }); eq(r.code, 200, r.raw);
  const b = await bid(U.A.email, 'load', { keys: ['messages'] }); yes(b.j.data.messages.some(m => m.fromCrm && /A week later is fine/.test(m.body)), 'bid site: ' + JSON.stringify(b.j.data.messages.map(m => m.body)));
  const p = await portal('A', 'p-bidjobs'); yes(p.j.jobs.find(x => x.id === 'J1').messages.some(m => !m.mine && /A week later is fine/.test(m.text)), 'sub portal Jobs to bid: ' + JSON.stringify(p.j.jobs.find(x => x.id === 'J1').messages) + JSON.stringify(T.gc_portal_msg.map(m => [m.project_id, m.party, m.side, m.text])));
});
await t('4f a bid-site message from a sub with NO CRM record (E) → 🔔 post + push for Pat + Eve; Eve answers → E sees it on the bid site', async () => {
  const p0 = PUSH.length, nm = newMsgs(); const id = 'm_e_' + Date.now().toString(36);
  const r = await bid(U.E.email, 'save', { key: 'messages', upsert: [{ id, jobId: 'J1', body: 'Is paint by others?' }] }); eq(r.code, 200, r.raw);
  const m = nm().find(x => x.sf && x.sf.kind === 'message'); yes(m, 'post: ' + JSON.stringify(nm())); eq(told(m), [EVE, PAT]); eq(pingTo(p0).sort(), [EVE, PAT]);
  const a = await hub(EVE, { op: 'subreply', kind: 'message', id, text: 'Yes, paint is by others.', pid: m.pid, msgId: m.id }); eq(a.code, 200, a.raw); eq(a.j.via, 'bid-site');
  const b = await bid(U.E.email, 'load', { keys: ['messages'] }); yes(b.j.data.messages.some(x => /paint is by others/.test(x.body) && x.senderRole === 'admin'), 'E bid site');
  const o = await bid(U.A.email, 'load', { keys: ['messages'] }); yes(!o.raw.includes('paint is by others'), 'A saw E\'s thread');
  const c = await portal('C', 'p-bidjobs'); yes(!c.raw.includes('paint is by others'), 'C saw E\'s thread');
});
await t('4g sub portal 💬 message on an active CRM job (A on P2): the PM gets a push + text at once; ↩ Reply from the thread reaches the portal', async () => {
  const p0 = PUSH.length, nm = newMsgs();
  const r = await portal('A', 'p-send', { projectId: 'P2', text: 'Drywall delivery is Monday.' }); eq(r.code, 200, r.raw); eq(r.j.pmTold, true);
  eq(pingTo(p0), [PAT]);
  const m = nm().find(x => /Drywall delivery is Monday/.test(x.text)); yes(m && forYou(PAT, m), '🔔 For you (the PM)');
  const a = await hub(PAT, { op: 'subreply', kind: 'portal', subId: 'SA', pid: 'P2', text: 'Thanks, gate code 4321.', msgId: m.id }); eq(a.code, 200, a.raw);
  const t2 = await portal('A', 'p-msgs', { projectId: 'P2' }); yes(t2.j.messages.some(x => !x.mine && /gate code 4321/.test(x.text)), 'reply on the portal');
});

console.log('\n5. 📨 bids: amount, bid form, PDF, papers gate, edit before due, closed / past due blocked, the CRM list, notify, award');
let bidA = '';
await t('5a papers gate: A has no W-9 / GL / WC → refused on the bid site AND the sub portal', async () => {
  const r = await bid(U.A.email, 'save', { key: 'bids', upsert: [{ id: 'b_x', jobId: 'J1', amount: 1000 }] }); eq(r.code, 403, r.raw); yes(/W-9/.test(r.j.error), r.j.error);
  const p = await portal('A', 'p-bid-save', { jobId: 'J1', amount: 1000, uploadIds: ['EupA'] }); eq(p.code, 409, p.raw);
});
await t('5b with papers: the bid site bid (amount, bid form line, PDF) is saved; 🔔 post + push for Pat + Eve (no price in the post)', async () => {
  T.sp_rows.push(spRow('subdocs', 'u_a', { items: papers }, { user_id: 'u_a' }));
  const p0 = PUSH.length, nm = newMsgs(); bidA = 'b_a_' + Date.now().toString(36);
  const r = await bid(U.A.email, 'save', { key: 'bids', upsert: [{ id: bidA, jobId: 'J1', amount: 41250, scope: 'Hang, tape, L4', lines: [{ id: 'bf1', amount: 41250 }], docs: [{ name: 'Alpha bid.pdf', type: 'application/pdf', size: 900, fileRef: 'u/u_a/ff-bid.pdf' }] }] }); eq(r.code, 200, r.raw);
  const m = nm().find(x => x.sf && x.sf.kind === 'bid'); yes(m, 'post'); eq(told(m), [EVE, PAT]); yes(!/41,?250/.test(m.text), 'no price in the post'); eq(pingTo(p0).sort(), [EVE, PAT]);
});
await t('5c edit before the due date (bid site) works; ⏸ closed and past-due jobs are refused on BOTH sites', async () => {
  const r = await bid(U.A.email, 'save', { key: 'bids', upsert: [{ id: bidA, jobId: 'J1', amount: 40900, scope: 'Hang, tape, L4', docs: [{ name: 'Alpha bid.pdf', type: 'application/pdf', size: 900, fileRef: 'u/u_a/ff-bid.pdf' }] }] }); eq(r.code, 200, r.raw);
  eq(T.sp_rows.find(x => x.key === 'bids/' + bidA).data.amount, 40900);
  for (const id of ['JC', 'JL']) {
    const b = await bid(U.A.email, 'save', { key: 'bids', upsert: [{ id: 'b_' + id, jobId: id, amount: 500 }] }); eq(b.code, 403, id + ' bid site ' + b.raw);
    const p = await portal('A', 'p-bid-save', { jobId: id, amount: 500, uploadIds: ['EupA'] }); eq(p.code, 403, id + ' portal ' + p.raw);
  }
});
await t('5d the sub portal bid (C: amount, trade, included / not, its PDF) is saved, Pat + Eve hear; C changes it before the due date', async () => {
  T.sp_rows.find(r => r.key === 'users/u_c').data.trades = ['Paint', 'Drywall'];
  const p0 = PUSH.length, nm = newMsgs();
  const r = await portal('C', 'p-bid-save', { jobId: 'J1', amount: 43900, trade: 'Drywall', inclusions: 'Hang, tape', exclusions: 'Patching', uploadIds: ['EupC'] }); eq(r.code, 200, r.raw); eq(r.j.created, true);
  const m = nm().find(x => x.sf && x.sf.kind === 'bid'); yes(m && /sub portal/.test(m.authorName), 'post ' + (m && m.authorName)); eq(pingTo(p0).sort(), [EVE, PAT]);
  const r2 = await portal('C', 'p-bid-save', { jobId: 'J1', amount: 43500, trade: 'Drywall', inclusions: 'Hang, tape', exclusions: 'Patching', uploadIds: [] }); eq([r2.code, r2.j.created, r2.j.bid.amount], [200, false, 43500], r2.raw);
});
await t('5e the CRM (🏗 Bid portal → 📨 Bids, by trade): both bids with their PDF, for Pat (PM) and Eve (estimator)', async () => {
  for (const e of [PAT, EVE]) {
    const r = await hubGet(e, { subbids: 'J1' }); eq(r.code, 200, r.raw);
    eq(r.j.bids.map(b => [b.trade, b.company, b.amount, b.files.length > 0]), [['Drywall', 'Alpha Drywall LLC', 40900, true], ['Drywall', 'Charlie Paint Inc', 43500, true]], e);
  }
});
await t('5f award A → A sees 🏆 on both sites; C sees Not selected; the CRM list shows it', async () => {
  const a = await hub(OWN, { op: 'award', jobId: 'J1', source: 'portal', id: bidA, on: true, trade: 'Drywall', mail: false }); eq(a.code, 200, a.raw);
  const ba = await bid(U.A.email, 'load', { keys: ['bids'] }); eq(ba.j.data.bids.find(x => x.id === bidA).accepted, true);
  const pa = await portal('A', 'p-bidjobs'); eq(pa.j.jobs.find(x => x.id === 'J1').myBid.status, 'accepted');
  const pc = await portal('C', 'p-bidjobs'); eq(pc.j.jobs.find(x => x.id === 'J1').myBid.status, 'rejected'); yes(!pc.raw.includes('40900') && !pc.raw.includes('Alpha'), 'C sees no price / name');
  const bc = await bid(U.C.email, 'load', { keys: ['bids'] }); yes(bc.j.data.bids.every(b => b.userId === 'u_c'), 'C sees only own bid');
});

console.log('\n6. 🧱 material requests (and the rest a sub can send)');
await t('6a bid site material request (A, awarded): Pat (the CRM job\'s PM — the bid job has no PM e-mail) + Eve hear (🔔 + push); Pat sees it in ✅ Approvals and decides; A sees the answer', async () => {
  const p0 = PUSH.length, nm = newMsgs();
  const r = await bid(U.A.email, 'matreq', { op: 'add', jobId: 'J1', item: 'Corner bead', qty: 40, unit: 'pcs', reason: 'Extra corners in the corridor' }); eq(r.code, 200, r.raw);
  const m = nm().find(x => x.sf && x.sf.kind === 'matreq'); yes(m, 'post'); eq(told(m), [EVE, PAT]); eq(pingTo(p0).sort(), [EVE, PAT]);
  const ap = await hubGet(PAT, { matreqs: '1' }); yes(ap.j.requests.some(x => x.id === r.j.request.id), 'in Pat\'s ✅ Approvals: ' + ap.raw);
  const ae = await hubGet(EVE, { matreqs: '1' }); yes(!ae.j.requests.some(x => x.id === r.j.request.id), 'not the estimator\'s to decide');
  const d = await hub(PAT, { op: 'matreq', id: r.j.request.id, act: 'decline', note: 'Use the bead on site.' }); eq(d.code, 200, d.raw);
  const l = await bid(U.A.email, 'matreq', { op: 'list' }); eq(l.j.requests.find(x => x.id === r.j.request.id).answer, 'Use the bead on site.');
});

console.log('\n7. 🧱 supplier quotes on the bid site');
await t('7a a supplier\'s material quote → Pat + Eve hear (🔔 + push), the staff see it in the bid site\'s admin view', async () => {
  const SU = { id: 'u_s', role: 'supplier', approved: true, email: 'sal@supplydemo.test', name: 'Sal Supply', company: 'Supply Demo Co', trades: [] };
  T.sp_rows.push(spRow('users', 'u_s', SU, { user_id: 'u_s', email: SU.email }));
  const jr = T.sp_rows.find(x => x.key === 'jobs/J1'); jr.data = Object.assign({}, jr.data, { suppliersCanQuote: true });
  const p0 = PUSH.length, nm = newMsgs();
  const r = await bid(SU.email, 'save', { key: 'mquotes', upsert: [{ id: 'mq1', jobId: 'J1', lines: [{ desc: 'Board 5/8 X', qty: 200, unit: 'sh', unitPrice: 14.5 }], leadTime: '3 days' }] }); eq(r.code, 200, r.raw);
  const m = nm().find(x => x.sf && x.sf.kind === 'mquote'); yes(m, 'post'); eq(told(m), [EVE, PAT]); eq(pingTo(p0).sort(), [EVE, PAT]);
  const v = await bid(PAT, 'load', { keys: ['mquotes'] }); yes(v.j.data.mquotes.some(q => q.id === 'mq1'), 'staff see the quote');
});

console.log('\n8. 👥 team members (PORTALTEAM): Mo acts for Alpha Drywall');
await t('8a Mo on the bid site: sees the company\'s jobs (incl. the INVITED private one), downloads plans, asks → Pat + Eve hear; the answer reaches Mo and Al', async () => {
  const r = await bid(MO, 'load', { keys: ['jobs', 'plans:J1'] }); eq(r.code, 200, r.raw);
  eq(r.j.data.jobs.map(j => j.id).sort(), ['J1', 'JA', 'JC', 'JI', 'JL']); yes(r.j.data['plans:J1'].length === 2, 'plans');
  const nm = newMsgs(); const id = 'q_mo_' + Date.now().toString(36);
  const q = await bid(MO, 'save', { key: 'questions', upsert: [{ id, jobId: 'JI', body: 'Mo here: is the soffit included?' }] }); eq(q.code, 200, q.raw);
  const m = nm().find(x => x.sf && x.sf.id === id); yes(m, 'post'); eq(told(m), [PAT], 'JI has no estimator set: its PM');
  const a = await hub(PAT, { op: 'subreply', kind: 'question', id, text: 'Soffit is included.', pid: m.pid, msgId: m.id }); eq(a.code, 200, a.raw);
  for (const e of [MO, U.A.email]) { const b = await bid(e, 'load', { keys: ['questions'] }); eq((b.j.data.questions.find(x => x.id === id) || {}).answer, 'Soffit is included.', e); }
});
await t('8b Mo on the sub portal: 📋 Jobs to bid, ⬇ ZIP, 📩 request, ❓ ask — all as Alpha Drywall', async () => {
  const j = await portal('MO', 'p-bidjobs'); eq(j.code, 200, j.raw); eq(j.j.jobs.map(x => x.id).sort(), ['J1', 'JA', 'JC', 'JI', 'JL']);
  const z = await portal('MO', 'p-bid-zip', { jobId: 'J1' }); eq(z.code, 200, z.raw);
  const nm = newMsgs();
  const q = await portal('MO', 'p-bid-ask', { jobId: 'JI', text: 'Mo again: ceiling height?' }); eq(q.code, 200, q.raw);
  const m = nm().find(x => x.sf && x.sf.id === q.j.id); yes(m, 'post'); eq(told(m), [PAT]);
  const row = T.sp_rows.find(x => x.key === 'questions/' + q.j.id).data; eq([row.userId, row.userCompany], ['u_a', 'Alpha Drywall LLC']);
});

console.log('\n11. 📎 addenda on the bid site (owner 11/23: "trying to put addendum here it won\'t let me … it should put it under Addendums")');
const putStaff = (name, buf) => { const ref = 'staff/2026-11/' + crypto.randomBytes(4).toString('hex') + '-' + name.replace(/[^A-Za-z0-9._-]+/g, '_'); STORE.set('subportal-files/' + ref, buf); return ref; };
let addRef = '';
await t('11a admin upload (Plans & Documents → ⬆ Upload): "Addendum 2 - revised doors.pdf" is NOT filed with the plans — it comes back as Addendum #2 to post; an Outlook .msg / .eml / .odt goes on the job (was refused)', async () => {
  addRef = putStaff('Addendum 2 - revised doors.pdf', PDF('ADD2'));
  const r = await bid(OWN, 'plans-import', { jobId: 'J1', fileRef: addRef, name: 'Addendum 2 - revised doors.pdf', size: 950 }); eq(r.code, 200, r.raw);
  eq([r.j.added.length, (r.j.addenda || []).map(x => [x.name, x.num, x.fileRef === addRef])], [0, [['Addendum 2 - revised doors.pdf', 2, true]]]);
  yes(!T.sp_rows.find(x => x.key === 'plans/J1').data.items.some(f => /Addendum/.test(f.name)), 'not in the plans');
  for (const n of ['Site walk notes.msg', 'RFI answer.eml', 'Meeting minutes.odt']) { const ref = putStaff(n, Buffer.from('x'.repeat(300))); const m = await bid(OWN, 'plans-import', { jobId: 'J1', fileRef: ref, name: n, size: 300 }); eq([m.code, (m.j.added || []).length + (m.j.scoped || []).length], [200, 1], n + ' ' + m.raw); }
  const odd = await bid(OWN, 'plans-import', { jobId: 'J1', fileRef: putStaff('virus.exe', Buffer.from('MZ')), name: 'virus.exe', size: 2 }); eq(odd.code, 400); yes(/can not go on a bid job/.test(odd.j.error), 'a clear message');
});
await t('11b 📎 Post addendum (the bid site\'s box → the CRM\'s own code): #2 with its file, what changed, a new due date, "e-mail the subs" → published; the e-mail waits on ✅ Approvals', async () => {
  const nd = day(9);
  const r = await bid(OWN, 'addendum-post', { jobId: 'J1', num: 2, title: 'Revised doors', date: day(0), text: 'Door hardware set 4 changed.', files: [{ name: 'Addendum 2 - revised doors.pdf', size: 950, type: 'application/pdf', fileRef: addRef }], newDue: nd, notify: true }); eq(r.code, 200, r.raw);
  eq(r.j.num, 2); yes(/^(waiting|held|nobody)$/.test(r.j.notice.status), 'notice ' + JSON.stringify(r.j.notice));
  const j = T.sp_rows.find(x => x.key === 'jobs/J1').data; const a = j.addenda.find(x => x.num === 2);
  yes(a && a.publishedAt && a.files.length === 1 && a.dueTo && a.dueTo.indexOf(nd) === 0, JSON.stringify(a)); eq(j.bidDueDate, nd);
  const r3 = await bid(OWN, 'addendum-post', { jobId: 'J1', text: 'Corridor ceilings now ACT.', notify: false }); eq([r3.code, r3.j.num], [200, 3], r3.raw);   /* auto number */
  const pm = await bid(PAT, 'addendum-post', { jobId: 'J1', text: 'x' }); eq(pm.code, 403, 'the PM (not admin / estimator / office) — the CRM rule: ' + pm.raw);
});
await t('11c the sub sees Addendum #2 (file downloads) and #3 under Addenda on the bid site AND the sub portal, acknowledges #2; the CRM (📂 Manage) shows both and the acknowledgement', async () => {
  const b = await bid(U.A.email, 'load', { keys: ['jobs'] }); const ad = b.j.data.jobs.find(x => x.id === 'J1').addenda;
  eq(ad.map(x => x.num).sort(), [2, 3]); const f = ad.find(x => x.num === 2).files[0]; yes((await dl(f.dataUrl)).slice(0, 5).toString() === '%PDF-', 'addendum file bytes');
  eq((await bid(U.A.email, 'save', { key: 'acks', upsert: [{ id: 'J1__a2__u_a', jobId: 'J1', num: 2 }] })).code, 200);
  const p = await portal('A', 'p-bidjobs'); const pa = p.j.jobs.find(x => x.id === 'J1').addenda; eq(pa.map(x => x.num), [3, 2]); yes(/^https:/.test(pa[1].files[0].url) && (await dl(pa[1].files[0].url)).length > 900, 'portal file');
  const m = await hubGet(OWN, { manage: 'J1' }); eq(m.code, 200, m.raw); eq(m.j.job.addenda.map(x => x.num).sort(), [2, 3]); yes(m.j.acks.some(k => k.num === 2 && k.userId === 'u_a'), 'the ack in the CRM');
});

/* ── 12. the bid site itself in a browser (the built subportal/ app against the REAL subportal.js above), desk and phone ── */
if (HNB()) {
  console.log('\n12. the bid site in a browser: ⬆ Upload an addendum file → 📎 Post addendum #N (desk), the box on a phone, the sub sees and acknowledges it');
  const { chromium } = require(path.join(process.env.NODE_PATH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
  const BRW = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const SBH = 'ieeonhpfahmwwecizdut.supabase.co', fs = require('fs');
  const ctxFor = async kind => {
    const ctx = await BRW.newContext(Object.assign({ serviceWorkers: 'block' }, kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 860 } }));
    await ctx.route('**/*', async r => {
      const rq = r.request(), u = new URL(rq.url());
      if (u.host === SBH && u.pathname === '/auth/v1/token') { const b = JSON.parse(rq.postData() || '{}'); const email = u.searchParams.get('grant_type') === 'password' ? String(b.email).toLowerCase() : String(b.refresh_token || '').replace(/^r-tok:/, '');
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: 'tok:' + email, refresh_token: 'r-tok:' + email, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'auth-' + email.split('@')[0], email } }) }); }
      if (u.host === SBH) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
      if (u.host === 'sb.test') { if (rq.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        const x = await fetch(rq.url(), { method: rq.method(), headers: rq.headers(), body: rq.postDataBuffer() }); const buf = Buffer.from(await x.arrayBuffer()); return r.fulfill({ status: x.status, headers: { 'access-control-allow-origin': '*' }, body: buf.length ? buf : await x.text() }); }
      if (u.host !== 'bids.test') return r.abort('blockedbyclient');
      if (u.pathname === '/.netlify/functions/subportal') { const resp = await SP.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://bids.test', 'x-nf-client-connection-ip': ip() }, rq.headers()), body: rq.postData() || '' }); return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body }); }
      if (u.pathname === '/.netlify/functions/gdrive') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"configured":false}' });
      const f = path.join(ROOT, 'subportal', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
      return r.fulfill({ path: path.join(ROOT, 'subportal/index.html'), contentType: 'text/html' });
    });
    return ctx;
  };
  const errs = [];
  const open = async (kind, email) => { const ctx = await ctxFor(kind), p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await p.goto('https://bids.test/');
    await p.waitForSelector('input[type=email]', { timeout: 30000 }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'Any-Pass-123'); await p.press('input[type=password]', 'Enter');
    await p.waitForSelector('text=Addenda Demo Job', { timeout: 30000 }); await p.click('text=Addenda Demo Job'); await new Promise(r => setTimeout(r, 1500)); if (process.env.SUBFLOW_SHOTS) await p.screenshot({ path: process.env.SUBFLOW_SHOTS + '/bidsite-open-' + kind + '-' + email.split('@')[0] + '.png', fullPage: true }); return { ctx, p }; };
  const SHOT = process.env.SUBFLOW_SHOTS || '';
  const ja = () => T.sp_rows.find(x => x.key === 'jobs/JA').data;
  const until = async (f, ms) => { const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 20000)) { v = f(); if (v) return v; await new Promise(r => setTimeout(r, 250)); } return v; };
  try {
    await t('12a DESK admin: ⬆ Upload "ADD-01 Revised doors.pdf" + a .msg → the .msg goes on the job, the addendum opens "📎 Post addendum #1" prefilled → posted, shown under Addenda, never in the plans', async () => {
      const { ctx, p } = await open('desk', OWN);
      try {
        if (errs.length) throw new Error('page errors: ' + errs.join(' / '));
        const acc = await p.getAttribute('[data-plans="file"]', 'accept'); yes(['.msg', '.eml', '.pdf', '.docx', '.zip'].every(x => acc.indexOf(x) > -1), 'accept: ' + acc);
        await p.setInputFiles('[data-plans="file"]', [{ name: 'ADD-01 Revised doors.pdf', mimeType: 'application/pdf', buffer: PDF('ADD-01') }, { name: 'Bidder call notes.msg', mimeType: 'application/vnd.ms-outlook', buffer: Buffer.from('x'.repeat(400)) }]);
        await p.waitForSelector('[data-addpost="ask"]', { timeout: 20000 });
        eq(await p.inputValue('[data-addpost="num"]'), '1', 'prefilled number');
        yes((await p.textContent('[data-addpost="form"]')).includes('ADD-01 Revised doors.pdf'), 'the file is on the form');
        await p.fill('[data-addpost="text"]', 'Doors 101-104 changed to HM frames.');
        if (SHOT) await p.screenshot({ path: SHOT + '/bidsite-addendum-desk.png', fullPage: false });
        await p.click('[data-addpost="send"]');
        yes(await until(() => (ja().addenda || []).some(a => a.num === 1 && a.publishedAt && a.files.length === 1)), 'Addendum #1 published: ' + JSON.stringify(ja().addenda));
        yes(await p.waitForSelector('[data-addendum="1"]', { timeout: 15000 }).catch(() => null), 'shown under Addenda');
        const pl = (T.sp_rows.find(x => x.key === 'plans/JA') || { data: { items: [] } }).data.items.map(f => f.name);
        yes(pl.includes('Bidder call notes.msg') && !pl.some(n => /ADD-01/.test(n)), 'plans: ' + pl);
      } finally { await ctx.close(); }
    });
    await t('12b PHONE admin: 📎 Post addendum (no file, auto #2) from the box on a 390 px screen — no sideways scroll', async () => {
      const { ctx, p } = await open('phone', OWN);
      try {
        await p.waitForSelector('[data-addpost="open"]', { timeout: 20000 }); await p.click('[data-addpost="open"]');
        eq(await p.inputValue('[data-addpost="num"]'), '2', 'the next number');
        await p.fill('[data-addpost="title"]', 'Ceilings'); await p.fill('[data-addpost="text"]', 'Corridor ceilings are now ACT.');
        const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); yes(!wide, 'no sideways scroll');
        if (SHOT) await p.screenshot({ path: SHOT + '/bidsite-addendum-phone.png' });
        await p.click('[data-addpost="send"]');
        yes(await until(() => (ja().addenda || []).some(a => a.num === 2 && a.title === 'Ceilings')), 'Addendum #2 published');
      } finally { await ctx.close(); }
    });
    await t('12c PHONE sub (A): both addenda under Addenda on the bid site, ✍️ acknowledges #1; the CRM shows the acknowledgement; the sub portal lists both', async () => {
      const { ctx, p } = await open('phone', U.A.email);
      try {
        await p.waitForSelector('[data-addendum="1"]', { timeout: 20000 }); yes(await p.$('[data-addendum="2"]'), '#2 there');
        await p.click('[data-ack="1"]');
        yes(await until(() => T.sp_rows.some(x => x.key === 'acks/JA__a1__u_a')), 'ack saved');
      } finally { await ctx.close(); }
      const m = await hubGet(OWN, { manage: 'JA' }); eq(m.j.job.addenda.map(x => x.num).sort(), [1, 2]); yes(m.j.acks.some(k => k.num === 1 && k.userId === 'u_a'), 'CRM ack');
      const po = await portal('A', 'p-bidjobs'); eq(po.j.jobs.find(x => x.id === 'JA').addenda.map(x => x.num), [2, 1]);
      eq(errs, [], 'page errors');
    });
  } finally { await BRW.close(); }
}

/* ── 10. the CRM's own screens (a browser, the offline CRM harness): the PM on the PHONE (GrayCo Field) and the estimator on the DESK find the
   sub's post (🔔 / "💬 unread job message"), tap ↩ Reply to <sub>, and the REAL bid-hub answers the sub — who sees it on both sites.
   Skipped with --no-browser (or when the harness / Chromium is not there). */
let HN = null; if (!NOB && HNB()) { try { HN = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs'); } catch (e) { console.log('  (browser part skipped: ' + String(e && e.message).slice(0, 120) + ')'); } }
if (HN) {
  console.log('\n10. the CRM: ↩ Reply from GrayCo Field (phone, the PM) and the desk (the estimator) — the real bid-hub behind it');
  /* the harness's sign-ins: pm@ (Demo PM) = Pat, sbiffle@ (Demo Estimator) = Eve */
  const AS = { 'pm@grayco-cs.com': PAT, 'sbiffle@grayco-cs.com': EVE }, IDS = { u2: 'u-pm', u3: 'u-sbiffle' }, EM = { [PAT]: 'pm@grayco-cs.com', [EVE]: 'sbiffle@grayco-cs.com' }, NM = { 'Pat Manager': 'Demo PM', 'Eve Estimator': 'Demo Estimator' };
  const toCrm = m => { const c = JSON.parse(JSON.stringify(m)); const fx = x => ({ id: IDS[x.id] || x.id, e: EM[x.e] || x.e, n: NM[x.n] || x.n, why: x.why });
    if (c.notify) c.notify = c.notify.map(fx); if (c.mentions) c.mentions = c.mentions.map(fx); c.tags = (c.tags || []).map(x => IDS[x] || x); Object.keys(NM).forEach(k => { c.text = c.text.split(k).join(NM[k]); }); return c; };
  const seed = posts => { HN.resetCloud(); const at = new Date().toISOString();
    HN.cset('users', [{ id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'u-sbiffle', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true }]);
    HN.cset('projects', [{ id: 'P1', name: 'Foxtrot Demo Clinic', address: '600 Foxtrot Ave', client: 'Foxtrot Health LLC', status: 'active', pm: 'Demo PM', autoPO: 'T777', createdAt: at, updatedAt: at }]);
    HN.cset('gc_job_messages', JSON.stringify(posts.map(toCrm))); };
  const HUBCALLS = [];
  HN.onFn('bid-hub', async ({ body, method, query, A }) => {
    const email = AS[A.signedAs]; if (!email) return { status: 401, body: { error: 'not signed in' } };
    if (method !== 'POST') { const r = await BH.handler({ httpMethod: 'GET', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer tok:' + email }, queryStringParameters: query || {} }); return { status: r.statusCode, body: r.body }; }
    HUBCALLS.push({ as: email, body });
    const r = await BH.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer tok:' + email }, queryStringParameters: {}, body: JSON.stringify(body) });
    return { status: r.statusCode, body: r.body };
  });
  const SHOT = process.env.SUBFLOW_SHOTS || '';
  const reply = async (A, text, which) => { const P = A.page();
    await P.click('#_gcJobMsgOv [data-sfr]', { timeout: 20000 });   /* re-resolved: the thread redraws on its own pull */
    await P.waitForSelector('#gc-sfr-text', { timeout: 5000 }); await P.fill('#gc-sfr-text', text); await P.click('#gc-sfr-sheet [data-sfx=' + (which || 'send') + ']');
    await HN.waitFor(A, () => !document.getElementById('gc-sfr-sheet'), null, 15000); };
  await t('10a the PM on the PHONE (GrayCo Field): Home says "💬 1 unread job message" → Open → ↩ Reply to Alpha Drywall LLC → A sees the answer on the bid site AND the sub portal; the To-Do is done', async () => {
    const id = 'q_field_' + Date.now().toString(36), nm = newMsgs();
    eq((await bid(U.A.email, 'save', { key: 'questions', upsert: [{ id, jobId: 'J1', body: 'Field test: is the ceiling in scope?' }] })).code, 200);
    const post = nm().find(m => m.sf && m.sf.id === id); yes(post, 'post'); seed([post]);
    const A = await HN.computer('pmPhone', { build: ROOT, mobile: true }); A.signedAs = 'pm@grayco-cs.com';
    try {
      yes(await HN.signIn(A, 'pm@grayco-cs.com'), 'signed in'); const P = A.page();
      const home = await HN.waitFor(A, () => document.documentElement.classList.contains('_fieldmode') && /1 unread job message/.test(document.body.innerText) && Array.from(document.querySelectorAll('div,button,a')).filter(e => /unread job message/.test(e.innerText || '') && e.offsetParent).sort((a, b) => a.innerText.length - b.innerText.length)[0], null, 30000);
      yes(home, 'Field home lists the unread job message');
      await P.evaluate(() => { const e = Array.from(document.querySelectorAll('div,button,a')).filter(x => /unread job message/.test(x.innerText || '') && x.offsetParent).sort((a, b) => a.innerText.length - b.innerText.length)[0]; e.click(); });
      yes(await HN.waitFor(A, () => { const b = Array.from(document.querySelectorAll('button,a')).filter(e => /^\s*Open\s*$/.test(e.innerText || '') && e.offsetParent).pop(); if (b) { b.click(); return true; } return false; }, null, 10000), 'Open');
      yes(await HN.waitFor(A, () => !!document.querySelector('#_gcJobMsgOv [data-sfr]'), null, 30000), 'the thread shows ↩ Reply');
      if (SHOT) await P.screenshot({ path: SHOT + '/subflow-field-thread.png' });
      await reply(A, 'Ceiling is by others.');
      yes(HUBCALLS.some(c => c.as === PAT && c.body.op === 'subreply' && c.body.kind === 'question' && c.body.id === id), 'the real bid-hub was asked as Pat');
      yes(await HN.waitFor(A, () => /✓ Answered by /.test((document.getElementById('_gcJobMsgOv') || {}).innerText || ''), null, 10000), '"✓ Answered by" in the thread');
      if (SHOT) await P.screenshot({ path: SHOT + '/subflow-field-answered.png' });
      eq(A.errs, [], 'page errors');
    } finally { await A.close(); }
    yes(todos().find(x => x.id === 'sf_question_' + id).done, 'To-Do done');
    const b = await bid(U.A.email, 'load', { keys: ['questions'] }); eq(b.j.data.questions.find(x => x.id === id).answer, 'Ceiling is by others.');
    const p = await portal('A', 'p-bidjobs'); eq(p.j.jobs.find(x => x.id === 'J1').questions.find(x => x.id === id).answer, 'Ceiling is by others.');
  });
  await t('10b the estimator on the DESK: 🔔 For you lists C\'s 📩 plan request; the thread\'s ↩ Reply answers it → C sees it on the bid site AND the sub portal', async () => {
    const post = jm().find(m => m.planReqId === 'J1__u_c'); yes(post, 'C\'s request post (3e)'); seed([post]);
    const A = await HN.computer('estDesk', { build: ROOT }); A.signedAs = 'sbiffle@grayco-cs.com';
    try {
      yes(await HN.signIn(A, 'sbiffle@grayco-cs.com'), 'signed in'); const P = A.page();
      yes(await HN.waitFor(A, () => window._gcJobMsgForMe && window._gcJobMsgForMe().some(x => x.m.planReqId === 'J1__u_c' && x.mention), null, 30000), '🔔 For you (@ you)');
      const html = await P.evaluate(() => window._gcJobMsgForYouHtml()); yes(/Charlie Paint Inc/.test(html) && /data-pid="P1"/.test(html), 'the For you card');
      await P.evaluate(() => window._gcOpenJobMessages('P1'));   /* what a tap on that card does */
      yes(await HN.waitFor(A, () => !!document.querySelector('#_gcJobMsgOv [data-sfr]'), null, 30000), 'the thread shows ↩ Reply');
      if (SHOT) await P.screenshot({ path: SHOT + '/subflow-desk-thread.png' });
      await reply(A, 'Plans are in the Drive folder now.');
      yes(HUBCALLS.some(c => c.as === EVE && c.body.op === 'subreply' && c.body.kind === 'planreq' && c.body.id === 'J1__u_c'), 'the real bid-hub was asked as Eve');
      eq(A.errs, [], 'page errors');
    } finally { await A.close(); }
    const b = await bid(U.C.email, 'load', { keys: ['planreqs'] }); eq(b.j.data.planreqs.find(x => x.jobId === 'J1').reply, 'Plans are in the Drive folder now.');
    const p = await portal('C', 'p-bidjobs'); eq(p.j.jobs.find(x => x.id === 'J1').request.reply, 'Plans are in the Drive folder now.');
  });
}

console.log('\n9. safety');
await t('9a nothing left the machine (no outside host; no e-mail while PORTAL_MAIL_OFF)', () => { eq(OUT, []); eq(MAIL.length, 0); });
console.log('\nSUBFLOW_E2E: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
