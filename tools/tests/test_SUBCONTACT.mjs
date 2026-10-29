/* patch SUBCONTACT tests: node tools/tests/test_SUBCONTACT.mjs — made-up people, subs and jobs only.
   The customer's "Request your trade contacts" → a ✅ Approvals item for the job's PM (the office after 24 h);
   approving 1 of 2 subs with phone only → the portal shows only that sub's company / trade / phone (never a price,
   an invoice, a note or anything about the sub portal); revoke → gone; default OFF → nothing; the job-page toggle;
   who may change it; the sub's own record is never changed. */
import { createRequire } from 'module';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');

process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-key-test';
process.env.PORTAL_MAIL_OFF = '1';
delete process.env.RESEND_API_KEY;

const TOKEN = 'T'.repeat(43), TOKEN2 = 'U'.repeat(43);
const SUBS = [
  { id: 'S1', name: 'Ridgeway Framing', company: 'Ridgeway Framing', contact: 'Rory Lane', phone: '901-555-0111', email: 'rory@ridgeway.test', trade: 'Framing',
    notes: 'internal note: slow on paperwork', rate: 45, w9: true, portalToken: 'subportal-abc', subPortalUrl: 'https://portal.test/sub#x' },
  { id: 'S2', name: 'Summit Roofing Co', contact: 'Sky Moreno', phone: '901-555-0222', email: 'sky@summitroof.test', trades: ['Roofing', 'Gutters'], notes: 'internal note: price 12,000' }
];
const DATA = {
  projects: [
    { id: 'P1', name: 'Maple Deck', address: '77 Maple Ct, Germantown TN', autoPO: 'B201', client: 'Dana Quill', pm: 'Pat Mason', status: 'Active', contract: 30000,
      subs: [{ id: 'PSB1', subId: 'S1', name: 'Ridgeway Framing', trade: 'Framing', bidAmt: 8765, status: 'Awarded', notes: 'sub scope internal' },
             { id: 'PSB2', subId: 'S2', name: 'Summit Roofing Co', trade: 'Roofing', bidAmt: 12345, status: 'Awarded' }],
      subAgreements: [{ sub: 'Summit Roofing Co', subId: 'S2', amount: 12345, status: 'signed' }] },
    { id: 'P2', name: 'Birch Porch', address: '12 Birch Ln, Collierville TN', autoPO: 'B202', client: 'Lee Ortega', pm: 'Pat Mason', status: 'Active',
      subs: [{ subId: 'S2', name: 'Summit Roofing Co', trade: 'Roofing' }] }
  ],
  invs: [{ id: 'SI1', type: 'sub', pid: 'P1', sub: 'Ridgeway Framing', amt: 4321, status: 'pending_pm' }],
  users: [
    { name: 'Pat Mason', email: 'pat.pm@grayco-cs.test', role: 'Project Manager', active: true, phone: '901-555-0100' },
    { name: 'Olive Office', email: 'olive@grayco-cs.test', role: 'Office', active: true },
    { name: 'Sam Super', email: 'sam@grayco-cs.test', role: 'Superintendent', active: true },
    { name: 'Ada Admin', email: 'ada@grayco-cs.test', role: 'Admin', active: true }
  ]
};
const STAFF = { 'tok-pm': ['pat.pm@grayco-cs.test', 'staff'], 'tok-office': ['olive@grayco-cs.test', 'office'], 'tok-sam': ['sam@grayco-cs.test', 'staff'], 'tok-admin': ['ada@grayco-cs.test', 'admin'] };

/* a tiny Supabase: gc_kv rows, the gc_portal link table, sign-in and the staff list */
const KV = {}; let tick = 0;
function put(k, v){ KV[k] = { value: typeof v === 'string' ? v : JSON.stringify(v), updated_at: new Date(Date.UTC(2026, 9, 27, 12, 0, tick++)).toISOString() }; }
Object.keys(DATA).forEach(k => put(k, DATA[k]));
put('subs', SUBS);
put('gc_portal_gate', [{ id: '_meta', since: '2020-01-01T00:00:00Z', gf: {}, v: 1 }]);
const SUBS_BEFORE = KV.subs.value;
const LINKS = { [TOKEN]: 'P1', [TOKEN2]: 'P2' };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, method = (init.method || 'GET').toUpperCase();
  if (u.pathname === '/auth/v1/user') { const t = String((init.headers || {}).Authorization || '').replace(/^Bearer\s+/, ''); return STAFF[t] ? res(200, { id: 'u_' + t, email: STAFF[t][0] }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_staff') { const e = String(q.get('email') || '').replace(/^eq\./, ''); const r = Object.values(STAFF).find(x => x[0] === e); return res(200, r ? [{ email: r[0], role: r[1], active: true, name: '' }] : []); }
  if (u.pathname === '/rest/v1/gc_portal') {
    if (method === 'PATCH') return res(204, null);
    const t = String(q.get('token') || '').replace(/^eq\./, ''); return res(200, LINKS[t] ? [{ token: t, project_id: LINKS[t], revoked: false, last_viewed_at: null }] : []);
  }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (method === 'POST') { const b = JSON.parse(init.body); put(b.key, b.value); return res(201, null); }
    const key = q.get('key') || '';
    if (/^eq\./.test(key)) { const k = decodeURIComponent(key.slice(3)); return res(200, KV[k] ? [{ key: k, value: KV[k].value, updated_at: KV[k].updated_at }] : []); }
    const m = /^in\.\((.*)\)$/.exec(key); if (m) { const ks = m[1].split(',').map(x => x.replace(/^"|"$/g, '')); return res(200, ks.filter(k => KV[k]).map(k => ({ key: k, value: KV[k].value, updated_at: KV[k].updated_at }))); }
    return res(200, []);
  }
  return res(404, {});
};

const portal = require(FN + '/portal.js');
const C = portal._core;
const kv = k => (KV[k] ? JSON.parse(KV[k].value) : []);
async function call(body, hdrs){ C._reset(); const r = await portal.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.grayco-cs.com' }, hdrs || {}), body: JSON.stringify(body) }); return { status: r.statusCode, data: JSON.parse(r.body) }; }
const cust = (body, tok) => call(body, { 'x-portal-token': tok || TOKEN, 'x-forwarded-for': '10.0.0.' + (1 + (tick % 200)) });
const staff = (tok, body) => call(body, { authorization: 'Bearer ' + tok });
const queue = () => kv('gc_approval_queue');
const shareRec = pid => kv('gc_sub_share').find(x => x.pid === pid);
function noLeaks(obj, what){
  const t = JSON.stringify(obj);
  [/sub[\s_-]*portal/i, /subportal/i, /portalToken/i, /internal note/i, /8765|12345|4321|12,000/, /\bw9\b/i, /\brate\b/i, /bidAmt/i].forEach(re => assert.ok(!re.test(t), what + ' must not contain ' + re + ': ' + t.slice(0, 400)));
}

let passed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; } }

await t('default OFF: nothing about the subs is in the portal', async () => {
  const v = await cust({ action: 'view' });
  assert.strictEqual(v.status, 200); assert.deepStrictEqual(v.data.crew, []);
  const tx = JSON.stringify(v.data);
  ['Ridgeway', 'Summit', 'Rory', 'Sky Moreno', '555-0111', '555-0222', 'ridgeway.test', 'summitroof'].forEach(x => assert.ok(tx.indexOf(x) < 0, 'view leaks ' + x));
  noLeaks(v.data, 'view');
  const c = await cust({ action: 'crew', op: 'state' });
  assert.deepStrictEqual(c.data.crew, []); assert.strictEqual(c.data.canAsk, true); assert.strictEqual(c.data.asked, null);
});

await t('request → one ✅ Approvals item for the job’s PM (title, PM step, office after 24 h)', async () => {
  const r = await cust({ action: 'crew', op: 'request' });
  assert.strictEqual(r.status, 200); assert.ok(r.data.ok); assert.ok(r.data.asked && r.data.asked.at);
  const items = queue().filter(x => x.kind === 'sub_contact');
  assert.strictEqual(items.length, 1);
  const it = items[0];
  assert.strictEqual(it.jobId, 'P1'); assert.strictEqual(it.step, 'pm'); assert.deepStrictEqual(it.steps, ['pm']); assert.strictEqual(it.pm, 'Pat Mason');
  assert.strictEqual(it.pmEmail, 'pat.pm@grayco-cs.test'); assert.strictEqual(it.status, 'waiting'); assert.strictEqual(it.pmEsc, true);
  assert.strictEqual(it.title, '👷 Customer Dana Quill asked for the contact info of the trades on Maple Deck');
  assert.deepStrictEqual(it.meta.subs.map(x => x.key), ['id:S1', 'id:S2']);
  const again = await cust({ action: 'crew', op: 'request' });
  assert.ok(again.data.ok); assert.strictEqual(queue().filter(x => x.kind === 'sub_contact').length, 1, 'asking twice does not make a second item');
  const st = await cust({ action: 'crew', op: 'state' });
  assert.strictEqual(st.data.canAsk, false); assert.ok(st.data.asked); assert.deepStrictEqual(st.data.crew, []);
  assert.strictEqual(shareRec('P1').log.slice(-1)[0].op, 'request');
  /* a preview from the CRM never asks */
  const pv = await cust({ action: 'crew', op: 'request', preview: true }, TOKEN2);
  assert.strictEqual(pv.data.ok, false); assert.strictEqual(queue().filter(x => x.jobId === 'P2').length, 0);
});

await t('approving needs the picker; only the PM (or office / admin) may approve', async () => {
  const id = queue().find(x => x.kind === 'sub_contact').id;
  const bare = await staff('tok-pm', { action: 'approval', op: 'approve', id });
  assert.strictEqual(bare.status, 400); assert.ok(bare.data.pick);
  const sam = await staff('tok-sam', { action: 'approval', op: 'approve', id, share: [{ key: 'id:S1', on: true, fields: ['phone'] }] });
  assert.strictEqual(sam.status, 403);
  assert.deepStrictEqual((await cust({ action: 'view' })).data.crew, []);
});

await t('approve 1 of 2 subs with phone only → the portal has only that sub’s name / trade / phone', async () => {
  const id = queue().find(x => x.kind === 'sub_contact').id;
  const a = await staff('tok-pm', { action: 'approval', op: 'approve', id, share: [{ key: 'id:S1', on: true, fields: ['phone'] }, { key: 'id:S2', on: false }] });
  assert.strictEqual(a.status, 200, JSON.stringify(a.data)); assert.ok(a.data.ok && a.data.sent);
  assert.strictEqual(queue().find(x => x.id === id).status, 'sent');
  const v = await cust({ action: 'view' });
  assert.deepStrictEqual(v.data.crew, [{ company: 'Ridgeway Framing', trade: 'Framing', phone: '901-555-0111' }]);
  const tx = JSON.stringify(v.data);
  ['Summit', 'Rory', 'rory@ridgeway.test', 'Sky', '555-0222'].forEach(x => assert.ok(tx.indexOf(x) < 0, 'view leaks ' + x));
  noLeaks(v.data, 'view');
  const c = await cust({ action: 'crew', op: 'state' });
  assert.deepStrictEqual(c.data.crew, [{ company: 'Ridgeway Framing', trade: 'Framing', phone: '901-555-0111' }]);
  assert.strictEqual(c.data.asked, null); assert.strictEqual(c.data.canAsk, false);
  noLeaks(c.data, 'crew');
  const log = shareRec('P1').log;
  const sh = log.find(l => l.op === 'share');
  assert.ok(sh && sh.by === 'Pat Mason' && sh.role === 'pm' && sh.key === 'id:S1' && sh.at && sh.via === 'approval');
  assert.deepStrictEqual(sh.fields, ['company', 'phone']);
  assert.ok(log.some(l => l.op === 'approve' && l.by === 'Pat Mason'));
  assert.strictEqual(shareRec('P1').request.status, 'approved');
});

await t('the job page: who may change it, revoke → the card is gone, logged', async () => {
  const g = await staff('tok-pm', { action: 'subshare', op: 'get', projectId: 'P1' });
  assert.ok(g.data.ok && g.data.canEdit);
  assert.deepStrictEqual(g.data.subs.map(x => [x.key, x.name, x.trade, x.on]), [['id:S1', 'Ridgeway Framing', 'Framing', true], ['id:S2', 'Summit Roofing Co', 'Roofing', false]]);
  assert.deepStrictEqual(g.data.subs[1].fields, ['company', 'phone'], 'default: company name + phone');
  const gs = await staff('tok-sam', { action: 'subshare', op: 'get', projectId: 'P1' });
  assert.strictEqual(gs.data.canEdit, false);
  const ss = await staff('tok-sam', { action: 'subshare', op: 'set', projectId: 'P1', share: [{ key: 'id:S2', on: true }] });
  assert.strictEqual(ss.status, 403);
  const rv = await staff('tok-pm', { action: 'subshare', op: 'set', projectId: 'P1', share: [{ key: 'id:S1', on: false }] });
  assert.ok(rv.data.ok); assert.strictEqual(rv.data.changed, 1);
  assert.deepStrictEqual((await cust({ action: 'view' })).data.crew, []);
  assert.deepStrictEqual((await cust({ action: 'crew', op: 'state' })).data.crew, []);
  const l = shareRec('P1').log.slice(-1)[0];
  assert.ok(l.op === 'revoke' && l.by === 'Pat Mason' && l.key === 'id:S1' && l.at && l.via === 'job page');
});

await t('turned on from the job without a request (admin), with contact + e-mail; a sub taken off the job disappears', async () => {
  const on = await staff('tok-admin', { action: 'subshare', op: 'set', projectId: 'P1', share: [{ key: 'id:S2', on: true, fields: ['company', 'contact', 'email'] }] });
  assert.ok(on.data.ok, JSON.stringify(on.data));
  assert.deepStrictEqual((await cust({ action: 'view' })).data.crew, [{ company: 'Summit Roofing Co', trade: 'Roofing', contact: 'Sky Moreno', email: 'sky@summitroof.test' }]);
  assert.ok(shareRec('P1').log.slice(-1)[0].role === 'admin');
  const p = JSON.parse(KV.projects.value); p[0].subs = p[0].subs.filter(x => x.subId !== 'S2'); p[0].subAgreements = []; put('projects', p);
  assert.deepStrictEqual((await cust({ action: 'view' })).data.crew, []);
  p[0].subs = DATA.projects[0].subs; p[0].subAgreements = DATA.projects[0].subAgreements; put('projects', p);
  await staff('tok-admin', { action: 'subshare', op: 'set', projectId: 'P1', share: [{ key: 'id:S2', on: false }] });
  assert.deepStrictEqual((await cust({ action: 'view' })).data.crew, []);
  assert.ok(!(await cust({ action: 'view' }, TOKEN2)).data.crew.length, 'another job shows nothing');
});

await t('nobody answered in 24 h → the office may approve (logged as office)', async () => {
  const r = await cust({ action: 'crew', op: 'request' }, TOKEN2);
  assert.ok(r.data.ok);
  const it = queue().find(x => x.kind === 'sub_contact' && x.jobId === 'P2');
  const early = await staff('tok-office', { action: 'approval', op: 'approve', id: it.id, share: [] });
  assert.strictEqual(early.status, 403, 'not before 24 h');
  C._reset();
  const e = await C.escalateDue({ now: Date.parse(it.createdAt) + 25 * 3600e3 });
  assert.ok(e.ok); assert.deepStrictEqual(e.ids, [it.id]);
  const it2 = queue().find(x => x.id === it.id);
  assert.strictEqual(it2.step, 'admin'); assert.ok(it2.escalated && /PM did not answer/.test(it2.escalated.why));
  assert.ok(kv('gc_office_tasks').some(x => x.id === 'appr_esc_' + it.id));
  const ok = await staff('tok-office', { action: 'approval', op: 'approve', id: it.id, share: [{ key: 'id:S2', on: true }] });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.data));
  assert.deepStrictEqual((await cust({ action: 'view' }, TOKEN2)).data.crew, [{ company: 'Summit Roofing Co', trade: 'Roofing', phone: '901-555-0222' }]);
  assert.ok(shareRec('P2').log.some(l => l.op === 'share' && l.role === 'office' && l.by === 'Olive Office'));
});

await t('not approved → nothing shared, no new ask for a while; the sub’s own record never changed', async () => {
  await staff('tok-admin', { action: 'subshare', op: 'set', projectId: 'P2', share: [{ key: 'id:S2', on: false }] });
  /* the next ask on P2 is declined */
  const st0 = await cust({ action: 'crew', op: 'state' }, TOKEN2); assert.strictEqual(st0.data.canAsk, true);
  await cust({ action: 'crew', op: 'request' }, TOKEN2);
  const it = queue().filter(x => x.kind === 'sub_contact' && x.jobId === 'P2' && x.status === 'waiting')[0];
  const rj = await staff('tok-pm', { action: 'approval', op: 'reject', id: it.id, reason: 'call the PM' });
  assert.ok(rj.data.ok);
  const st = await cust({ action: 'crew', op: 'state' }, TOKEN2);
  assert.deepStrictEqual(st.data.crew, []); assert.strictEqual(st.data.canAsk, false);
  assert.strictEqual(shareRec('P2').request.status, 'declined');
  assert.strictEqual(KV.subs.value, SUBS_BEFORE, 'gc_kv subs untouched');
  noLeaks(kv('gc_sub_share').map(r => ({ subs: r.subs })), 'share records');
});

console.log(passed + ' passed' + (process.exitCode ? ', SOME FAILED' : ''));
