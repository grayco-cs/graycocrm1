/* test_E2E_SUBS.mjs [build dir] — the sub portal end to end, 3 subs (owner's 11/15 list, section 5). Offline: the REAL portal-access.js and
   bid-hub.js on one in-memory Supabase (gc_kv + the bid site's sp_rows + the portal tables), made-up subs / jobs / bids only.
     Sub A (Drywall) and Sub B (Drywall) bid on the same trade of one bid job; Sub C (Paint) bids paint. GrayCo awards A for drywall and
     C for paint (bid-hub award with the CRM job's PO) → B is "Not selected" by itself (AWARDFLOW); the CRM puts A and C on the job.
   Checked every step: no sub ever sees another sub (name / e-mail / bid / price / files), customer contract amounts or line prices,
   the insurance carrier / claim, or a job / thread they are not on. */
import { createRequire } from 'module'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.message ? e.message.slice(0, 600) : e); } }
function eq(a, b, m){ if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function yes(c, m){ if (!c) throw new Error(m || 'expected true'); }
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-key-test'; process.env.PORTAL_MAIL_OFF = '1';
delete process.env.RESEND_API_KEY; delete process.env.OWNER_EMAILS; delete process.env.SUBPORTAL_NOTIFY;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const now = new Date().toISOString();

/* ── the CRM (gc_kv) ── */
const SUBS = {
  A: { id: 'SA', name: 'Alpha Drywall LLC', company: 'Alpha Drywall LLC', contact: 'Al Alpha', email: 'al@alphadrywall.test', phone: '901-555-0161', isSub: true, trade: 'Drywall' },
  B: { id: 'SB', name: 'Bravo Drywall Co', company: 'Bravo Drywall Co', contact: 'Bo Bravo', email: 'bo@bravodrywall.test', phone: '901-555-0162', isSub: true, trade: 'Drywall' },
  C: { id: 'SC', name: 'Charlie Paint Inc', company: 'Charlie Paint Inc', contact: 'Cy Charlie', email: 'cy@charliepaint.test', phone: '901-555-0163', isSub: true, trade: 'Paint' } };
const JOB = { id: 'PE2E', name: 'Echo Demo Clinic', address: '500 Echo Pkwy, Memphis, TN 38117', client: 'Echo Health LLC', clientPhone: '901-555-0100', clientEmail: 'owner@echohealth.test', status: 'active', pm: 'Pat PM', autoPO: 'T950',
  contract: 184250, insurance: true, carrier: 'ZZ-CARRIER-MUTUAL', claimNumber: 'CLM-ZZ-123', insuranceCompany: 'ZZ-CARRIER-MUTUAL', estimateLines: [{ desc: 'Drywall', price: 41000 }], subs: [], createdAt: now, updatedAt: now };
const KV = { projects: [JOB], vendors: Object.values(SUBS), users: [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Pat PM', email: 'pat@grayco-cs.com', phone: '901-555-0142', role: 'Project Manager', active: true }],
  gc_sub_portal_settings: {}, gc_automation_pause: { on: false } };
/* ── the bid site (sp_rows) ── */
const U = {
  A: { id: 'u_a', role: 'sub', approved: true, email: SUBS.A.email, name: 'Al Alpha', company: 'Alpha Drywall LLC', phone: '901-555-0161', trades: ['Drywall'] },
  B: { id: 'u_b', role: 'sub', approved: true, email: SUBS.B.email, name: 'Bo Bravo', company: 'Bravo Drywall Co', phone: '901-555-0162', trades: ['Drywall'] },
  C: { id: 'u_c', role: 'sub', approved: true, email: SUBS.C.email, name: 'Cy Charlie', company: 'Charlie Paint Inc', phone: '901-555-0163', trades: ['Paint'] } };
const BJ = { id: 'j_e2e', title: 'Echo Demo Clinic — interiors', address: '500 Echo Pkwy, Memphis, TN 38117', bidDueDate: day(7), status: 'open', visibility: 'private', tradesSought: 'Drywall, Paint',
  scope: 'Interior build-out, 6 exam rooms.', tradeScopes: [{ id: 'ts1', trade: 'Drywall', scope: 'DRYWALL-WORDS: hang, tape, Level 4.' }, { id: 'ts2', trade: 'Paint', scope: 'PAINT-WORDS: prime and 2 coats.' }], crmPid: 'PE2E', log: ['INTERNAL-LOG'] };
const T = { gc_portal_lock: [], gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal: [], sp_rows: [],
  gc_staff: [{ email: 'wjohnson@grayco-cs.com', role: 'admin', active: true, name: 'Wesley Johnson', profile: '' }] };
const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now }, extra || {});
Object.values(U).forEach(u => T.sp_rows.push(spRow('users', u.id, u, { user_id: u.id, email: u.email })));
T.sp_rows.push(spRow('jobs', BJ.id, BJ, { job_id: BJ.id }));
['A', 'B', 'C'].forEach(k => T.sp_rows.push(spRow('invites', 'inv_' + k, { id: 'inv_' + k, jobId: BJ.id, email: SUBS[k].email }, { job_id: BJ.id, email: SUBS[k].email })));
const papers = [{ id: 'd1', type: 'w9' }, { id: 'd2', type: 'insurance_general', expirationDate: day(200) }, { id: 'd3', type: 'insurance_workers_comp', expirationDate: day(150) }];
['a', 'b', 'c'].forEach(k => T.sp_rows.push(spRow('subdocs', 'u_' + k, { items: papers }, { user_id: 'u_' + k })));
const SESS = {};
['A', 'B', 'C'].forEach((k, i) => { const tok = String.fromCharCode(65 + i).repeat(43), link = String.fromCharCode(97 + i).repeat(43); SESS[k] = tok;
  T.gc_portal_session.push({ id: sha(tok), kind: 'partner', sub_id: SUBS[k].id, links: [link], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now });
  T.gc_sub_link.push({ token: link, sub_id: SUBS[k].id, revoked: false }); });
/* ── the in-memory Supabase ── */
const MAIL = [], OUT = [];
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body), headers: { get: () => null } });
const val = v => decodeURIComponent(String(v || '')).replace(/^eq\./, '');
const inl = v => decodeURIComponent(String(v || '')).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'mail' + MAIL.length }); }
  if (u.host !== 'sb.test') { OUT.push(u.host); return res(404, {}); }
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); const mm = /^staff:(.+)$/.exec(a); return mm ? res(200, { id: 'u', email: mm[1] }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { KV[r.key] = typeof r.value === 'string' && /^[\[{]/.test(r.value) ? JSON.parse(r.value) : r.value; }); return res(201, []); }
    if (m === 'PATCH') { const k = val(q.get('key')), b = JSON.parse(init.body); KV[k] = typeof b.value === 'string' && /^[\[{]/.test(b.value) ? JSON.parse(b.value) : b.value; return res(200, [{ key: k, value: KV[k], updated_at: new Date().toISOString() }]); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [val(k)];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); const bucket = u.pathname.split('/').pop(); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/' + bucket + '/' + p + '?token=signed' }))); }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm && T[tm[1]]) {
    const tb = T[tm[1]];
    if (m === 'POST') { const b = JSON.parse(init.body), merge = /merge-duplicates/.test(hd.Prefer || hd.prefer || '') && (q.get('on_conflict') || 'key');
      (Array.isArray(b) ? b : [b]).forEach(r => { const i = merge && r[merge] !== undefined ? tb.findIndex(x => x[merge] === r[merge]) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: new Date().toISOString() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === val(v));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > val(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    return res(200, rows);
  }
  return res(200, []);
};
const PA = require(path.join(FN, 'portal-access.js'));
const BH = require(path.join(FN, 'bid-hub.js'));
let ipN = 0;
const call = async (who, action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': SESS[who], 'x-nf-client-connection-ip': '10.9.0.' + (++ipN % 250) }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const staff = async (action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:wjohnson@grayco-cs.com' }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const hub = async body => { const r = await BH.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:wjohnson@grayco-cs.com' }, queryStringParameters: {}, body: JSON.stringify(body) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const bidOf = u => (T.sp_rows.find(r => r.collection === 'bids' && r.user_id === u) || {}).data;
/* what must never reach a sub, by sub */
const NEVER = { A: ['Bravo', 'Charlie', 'bo@', 'cy@', '23900', '9800'], B: ['Alpha', 'Charlie', 'al@', 'cy@', '21500', '9800', 'T950'], C: ['Alpha', 'Bravo', 'al@', 'bo@', '21500', '23900'] };
const ALWAYS_NEVER = ['184250', '184,250', '41000', '41,000', 'ZZ-CARRIER', 'CLM-ZZ', 'INTERNAL-LOG', 'owner@echohealth'];
function clean(who, raw, extra){ const bad = ALWAYS_NEVER.concat(NEVER[who]).concat(extra || []).filter(w => raw.indexOf(w) >= 0); if (bad.length) throw new Error(who + ' saw: ' + bad.join(', ')); }

await t('1 three subs see the bid job with their own trade\'s words only (A, B: drywall; C: paint) — nobody else', async () => {
  for (const k of ['A', 'B', 'C']) { const r = await call(k, 'p-bidjobs'); eq(r.code, 200, r.raw); const j = r.j.jobs.find(x => x.id === 'j_e2e'); yes(j && j.invited, k + ' sees the job');
    eq(j.tradeScopes.map(x => x.trade), [k === 'C' ? 'Paint' : 'Drywall'], k + ' trade scope'); yes(!(k === 'C' ? /DRYWALL-WORDS/ : /PAINT-WORDS/).test(r.raw), k + ' saw another trade'); clean(k, r.raw); }
});
await t('2 A and B bid drywall, C bids paint (amount, included / not included); each sees only their own bid', async () => {
  eq((await call('A', 'p-bid-save', { jobId: 'j_e2e', amount: 21500, trade: 'Drywall', inclusions: 'Hang, tape, L4', exclusions: 'Paint' })).code, 200);
  eq((await call('B', 'p-bid-save', { jobId: 'j_e2e', amount: 23900, trade: 'Drywall', inclusions: 'Hang, tape', exclusions: 'Patching' })).code, 200);
  eq((await call('C', 'p-bid-save', { jobId: 'j_e2e', amount: 9800, trade: 'Paint', inclusions: '2 coats' })).code, 200);
  eq([bidOf('u_a').trade, bidOf('u_b').trade, bidOf('u_c').trade], ['Drywall', 'Drywall', 'Paint']);
  for (const k of ['A', 'B', 'C']) { const r = await call(k, 'p-bidjobs'); clean(k, r.raw); }
});
await t('3 GrayCo sees all three side by side (bid-hub subbids, by trade)', async () => {
  const r = await BH.handler({ httpMethod: 'GET', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:wjohnson@grayco-cs.com' }, queryStringParameters: { subbids: 'j_e2e' } });
  const j = JSON.parse(r.body); eq(r.statusCode, 200, r.body);
  const L = j.bids.map(b => [b.trade, b.company, b.amount]).sort((a, b) => (a[0] + a[2]).localeCompare(b[0] + b[2]));
  eq(L, [['Drywall', 'Alpha Drywall LLC', 21500], ['Drywall', 'Bravo Drywall Co', 23900], ['Paint', 'Charlie Paint Inc', 9800]]);
});
await t('4 award A (drywall) and C (paint) with the job\'s PO → B is Not selected by itself; C\'s paint award leaves A alone', async () => {
  const a = await hub({ op: 'award', jobId: 'j_e2e', source: 'subportal', id: bidOf('u_a').id, on: true, trade: 'Drywall', mail: false, po: 'T950' }); eq(a.code, 200, a.raw);
  const c = await hub({ op: 'award', jobId: 'j_e2e', source: 'subportal', id: bidOf('u_c').id, on: true, trade: 'Paint', mail: false, po: 'T950' }); eq(c.code, 200, c.raw);
  eq([bidOf('u_a').accepted, bidOf('u_b').rejected, bidOf('u_b').notSelected, bidOf('u_c').accepted, !!bidOf('u_a').rejected], [true, true, true, true, false]);
  eq([bidOf('u_a').awardPo, bidOf('u_c').awardPo, bidOf('u_b').awardPo || ''], ['T950', 'T950', '']);
});
await t('5 A and C see 🏆 + the PO; B sees Not selected (rejected) with no prices, no names, no PO', async () => {
  const ra = await call('A', 'p-bidjobs'), rb = await call('B', 'p-bidjobs'), rc = await call('C', 'p-bidjobs');
  const ja = ra.j.jobs.find(x => x.id === 'j_e2e'), jb = rb.j.jobs.find(x => x.id === 'j_e2e'), jc = rc.j.jobs.find(x => x.id === 'j_e2e');
  eq([ja.myBid.status, ja.myBid.award.po, jc.myBid.status, jc.myBid.award.po, jb.myBid.status, jb.myBid.award], ['accepted', 'T950', 'accepted', 'T950', 'rejected', null]);
  clean('A', ra.raw); clean('B', rb.raw); clean('C', rc.raw);
});
/* the CRM puts the awarded subs on the job (patch BIDMULTI addBid — a person's award) */
KV.projects[0].subs = [{ id: 'r1', subId: 'SA', name: 'Alpha Drywall LLC', trade: 'Drywall', status: 'Awarded' }, { id: 'r2', subId: 'SC', name: 'Charlie Paint Inc', trade: 'Paint', status: 'Awarded' }];
PA._core && PA._core._reset && PA._core._reset();
await t('6 the job: A and C have it (🔨 with the PO), B does not; nobody sees the contract, line prices, carrier or claim', async () => {
  for (const k of ['A', 'B', 'C']) { const r = await call(k, 'p-home'); eq(r.code, 200, r.raw); const has = (r.j.jobs || []).some(j => j.id === 'PE2E'); eq(has, k !== 'B', k + ' has the job'); clean(k, r.raw); }
  const jA = await call('A', 'p-job', { projectId: 'PE2E' }); eq(jA.code, 200, jA.raw); clean('A', jA.raw); yes(/T950/.test(jA.raw), 'A sees the PO');
  const jB = await call('B', 'p-job', { projectId: 'PE2E' }); yes(jB.code === 404 || jB.code === 403, 'B refused the job: ' + jB.code);
});
await t('7 threads: GrayCo → A on the job; only A reads it; C\'s thread on the same job is separate; B is refused; it is in the job\'s Messages tagged with A', async () => {
  const s1 = await staff('s-send', { projectId: 'PE2E', party: 's:SA', text: 'Al — please confirm Monday start.' }); eq(s1.code, 200, s1.raw);
  const s2 = await staff('s-send', { projectId: 'PE2E', party: 's:SC', text: 'Cy — colors attached tomorrow.' }); eq(s2.code, 200, s2.raw);
  const a = await call('A', 'p-msgs', { projectId: 'PE2E' }), c = await call('C', 'p-msgs', { projectId: 'PE2E' }), b = await call('B', 'p-msgs', { projectId: 'PE2E' });
  yes(/confirm Monday start/.test(a.raw) && !/colors attached/.test(a.raw), 'A reads only A\'s thread');
  yes(/colors attached/.test(c.raw) && !/confirm Monday/.test(c.raw), 'C reads only C\'s thread');
  yes(b.code === 404 || b.code === 403, 'B refused: ' + b.code);
  const jm = (KV.gc_job_messages || []).filter(m => m.pid === 'PE2E');
  yes(jm.some(m => /→ 🔨 Alpha Drywall LLC \(sub portal\)/.test(m.authorName)) && jm.some(m => /→ 🔨 Charlie Paint Inc \(sub portal\)/.test(m.authorName)), JSON.stringify(jm.map(m => m.authorName)));
  const r = await call('A', 'p-send', { projectId: 'PE2E', text: 'Monday works for us.' }); eq(r.code, 200, r.raw);
  yes((KV.gc_job_messages || []).some(m => m.pid === 'PE2E' && /^🔨 Alpha Drywall LLC/.test(m.authorName) && /Monday works/.test(m.text)), 'A\'s reply is in the job\'s Messages');
  clean('A', a.raw); clean('C', c.raw);
});
await t('8 data-entry / mail off: nothing left the machine (no outside host, no e-mail while PORTAL_MAIL_OFF)', () => { eq(OUT, []); eq(MAIL.length, 0); });
console.log('\nE2E_SUBS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
