// test_COMMCO.mjs <build> [server|browser|all] — patch COMMCO: commercial change orders always signed + the job on hold until
// they are; the GC superintendent initials the materials before work starts; change orders / materials / submittals /
// approvals through the GC portal (link + e-mail, office@ copied). Residential unchanged. Made-up names only.
// No network: an in-memory Supabase / Resend (the harness's gc_kv is the same store the page writes).
import { createRequire } from 'module';
import path from 'path';
import { chromium } from 'playwright';
import { computer, signIn, sleep, cset, cget, cloud, waitFor, resetCloud, mclick } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
const MODE = process.argv[3] || 'all';
const F = path.join(build, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test-key', RESEND_API_KEY: 're-test-key', PORTAL_BASE_URL: 'https://portal.grayco-cs.com', SITE_ORIGIN: 'https://crm.grayco-cs.com,https://app.local', OWNER_EMAILS: 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.PORTAL_AUTO_EMAIL;

const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };

/* ── the fake world: gc_kv = the harness cloud; other tables in memory; Resend captured ── */
const W = { t: {}, sent: [], files: {} };
const STAFF = { 'tok-pm': ['nthomas@grayco-cs.com', 'staff', 'Nick Thomas'], 'tok-admin': ['wjohnson@grayco-cs.com', 'admin', 'Wesley Johnson'] };
function who(tok){ if (STAFF[tok]) return STAFF[tok]; if (/^utok-u-w-/.test(tok)) return STAFF['tok-admin']; if (/^utok-u-n-/.test(tok)) return STAFF['tok-pm']; return null; }
function tbl(n){ return W.t[n] || (W.t[n] = []); }
function J(status, body){ return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => (body instanceof Buffer ? body : Buffer.from(JSON.stringify(body))) }; }
function filt(rows, qs){
  for (const [k, v] of qs) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) { const x = decodeURIComponent(v.slice(3)); rows = rows.filter(r => String(r[k]) === x); }
    else if (v.startsWith('gt.')) { const x = v.slice(3); rows = rows.filter(r => String(r[k]) > x); }
    else if (v.startsWith('in.(')) { const xs = decodeURIComponent(v.slice(4, -1)).split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => xs.includes(String(r[k]))); }
  }
  return rows;
}
let tick = 0; const stamp = () => new Date(Date.now() + (++tick)).toISOString();
const realFetch = global.fetch;
global.fetch = async function(url, init = {}){
  const u = new URL(url); const m = (init.method || 'GET').toUpperCase(); const hd = init.headers || {};
  const auth = String(hd.Authorization || hd.authorization || '');
  let body = null; try { body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const x = who(auth.replace('Bearer ', '')); return x ? J(200, { id: 'u', email: x[0] }) : J(401, {}); }
    if (hd.apikey !== 'svc-test-key') return J(401, { message: 'no service key' });
    const qs = [...u.searchParams.entries()];
    if (u.pathname === '/rest/v1/gc_staff') return J(200, filt(Object.values(STAFF).map(x => ({ email: x[0], role: x[1], name: x[2], active: true })), qs));
    if (u.pathname.startsWith('/storage/v1/object/sign/crm-files')) return J(200, body.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=signed', error: null })));
    if (u.pathname.startsWith('/storage/v1/object/crm-files/')) { const p = u.pathname.split('/').pop(); if (m === 'POST') { W.files[p] = Buffer.from(body); return J(200, { Key: p }); } return W.files[p] ? J(200, W.files[p]) : J(400, {}); }
    const mt = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname); if (!mt) return J(404, {});
    const name = mt[1];
    if (name === 'gc_kv') {
      let rows = [...cloud.values()];
      if (m === 'GET') return J(200, filt(rows, qs).map(x => ({ key: x.key, value: x.value, updated_at: x.updated_at })));
      if (m === 'POST') { (Array.isArray(body) ? body : [body]).forEach(r => cset(r.key, r.value)); return J(201, []); }
      if (m === 'PATCH') { const rs = filt(rows, qs); rs.forEach(r => cset(r.key, body.value !== undefined ? body.value : r.value)); return J(200, rs.map(r => ({ key: r.key, value: cget(r.key), updated_at: cloud.get(r.key).updated_at }))); }
      return J(405, {});
    }
    const rows = tbl(name);
    if (m === 'GET') return J(200, filt(rows, qs).map(x => Object.assign({}, x)));
    if (m === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const merge = /merge-duplicates/.test(String(hd.Prefer || '')), key = u.searchParams.get('on_conflict') || (name.indexOf('kv') >= 0 ? 'key' : 'id');
      for (const r of list) { const at = rows.findIndex(x => x[key] === r[key] && r[key] != null); if (at >= 0) { if (!merge) return J(409, { code: '23505' }); rows[at] = Object.assign({}, rows[at], r, { updated_at: stamp() }); } else rows.push(Object.assign({}, r, { updated_at: stamp() })); }
      return J(201, []);
    }
    if (m === 'PATCH') { const rs = filt(rows, qs); rs.forEach(r => Object.assign(r, body, { updated_at: stamp() })); return J(200, rs.map(x => Object.assign({}, x))); }
    return J(405, {});
  }
  if (u.host === 'api.resend.com') { if (auth !== 'Bearer re-test-key') return J(401, {}); W.sent.push(body); return J(200, { id: 'em' + W.sent.length }); }
  if (u.host === 'push.test') return J(201, {});
  throw new Error('BLOCKED network call in a test: ' + url);
};
const H = require(path.join(F, 'gc-portal.js')), G = H._G, CORE = require(path.join(F, 'portal.js'))._core, CC = require(path.join(F, '_lib/commco.js')), JA = require(path.join(F, '_lib/job-auto.js'));
CORE._webPush = { setVapidDetails(){}, sendNotification: async () => {} };
function ev(body, hd){ return { httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.grayco-cs.com', 'x-nf-client-connection-ip': '10.0.0.' + Math.floor(Math.random() * 200) }, hd || {}), body: JSON.stringify(body), queryStringParameters: {} }; }
async function call(body, hd){ CORE._reset(); const r = await H.handler(ev(body, hd)); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { status: r.statusCode, j }; }
const staff = (b, t) => call(b, { authorization: 'Bearer ' + (t || 'tok-pm') });
const queue = () => { const v = cget('gc_approval_queue'); return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const lik = k => { const r = tbl('gc_lead_inbox_kv').find(x => x.key === k); return r ? (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) : null; };
const today = new Date().toISOString().slice(0, 10), D = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const SHA = 'c'.repeat(64);
const PROOF = { proofReason: 'GC asked on site', proofPhotos: [{ ref: 'sb:crm-files/' + SHA + '.jpg' }] };

function seed(){
  resetCloud(); W.t = {}; W.sent = []; W.files = {}; tbl('gc_lead_inbox_kv');
  W.files[SHA + '.pdf'] = Buffer.from('%PDF-1.4 product data'); W.files[SHA + '.jpg'] = Buffer.from('jpg');
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Project Manager', phone: '901-555-0101', active: true },
    { id: 'u3', name: 'Olive Office', email: 'office@grayco-cs.com', role: 'Office', active: true }]);
  cset('customers', [{ id: 'C1', name: 'Northgate Builders LLC', company: 'Northgate Builders LLC', type: 'gc', email: 'bids@northgate.example' }, { id: 'C2', name: 'Rita Homeowner', email: 'rita@example.com' }]);
  cset('projects', [
    { id: 'COM1', name: 'Eastgate Clinic TI', type: 'Commercial TI', client: 'Northgate Builders LLC', pm: 'Nick Thomas', autoPO: 'C101', address: '10 Commerce Dr, Bartlett, TN', status: 'approved', createdAt: ago(5), created: today, auto: Object.assign({}, JA.defaultsFor('commercial', null), { updatedAt: ago(5), by: 'Nick Thomas' }),
      contract: 180000, costs: 120000, gcContacts: [{ name: 'Gus Super', email: 'gus@northgate.example', role: 'super' }, { name: 'Pam Manager', email: 'pam@northgate.example', role: 'pm' }] },
    { id: 'COM3', name: 'Lakeside Bank Remodel', type: 'Commercial Reno', client: 'Northgate Builders LLC', pm: 'Nick Thomas', autoPO: 'C103', address: '5 Lake Rd, Memphis, TN', status: 'approved', createdAt: ago(5), created: today, gcContacts: [{ name: 'Gus Super', email: 'gus@northgate.example', role: 'super' }] },
    { id: 'RES1', name: 'Rita Kitchen', type: 'Residential Reno', client: 'Rita Homeowner', clientEmail: 'rita@example.com', pm: 'Nick Thomas', autoPO: 'R201', status: 'active', createdAt: ago(5), created: today, pct: 10 }
  ]);
  cset('cos', [
    Object.assign({ id: 'CO_A', pid: 'COM1', amt: 100, desc: 'Add one duplex outlet in exam room 2', reason: 'GC request', status: 'pending', created: today, createdAt: ago(1), commco: true, requiresSignature: true }, PROOF),
    Object.assign({ id: 'CO_R', pid: 'RES1', amt: 100, desc: 'Extra cabinet pull', status: 'pending', created: today, createdAt: ago(1) }, PROOF),
    { id: 'CO_OLD', pid: 'COM1', amt: 900, desc: 'Old approved change (before COMMCO)', status: 'approved', created: '2026-09-01' }
  ]);
  cset('schedule', []);
  cset('estimates', [{ id: 'EST1', pid: 'COM3', name: 'Lakeside Bank', status: 'approved', lines: [
    { id: 'l1', type: 'material', cat: 'Flooring', desc: 'FL-01 LVT plank Shaw Endura "Oak Grey"', qty: 2400, unit: 'SF', cost: 3.1, calcNote: '$3.10/SF supplier quote', sku: 'SH-ENDURA-OG', notes: '' },
    { id: 'l2', type: 'material', cat: 'Walls', desc: 'Paint SW 7015 Repose Gray eggshell', qty: 30, unit: 'gal', cost: 42 },
    { id: 'l3', type: 'labor', cat: 'Walls', desc: 'Paint labor', qty: 40, cost: 44.44 }] }]);
  cset('gc_office_tasks', JSON.stringify([])); cset('gc_approval_queue', JSON.stringify([]));
}

/* ═════════════ 1. the server ═════════════ */
async function serverPart(){
  console.log('── 1. rules');
  ok('commercial: a $100 change order needs a signature (limit $0)', CC.coNeedsSign(true, { amt: 100 }) && CC.coSignLimit(true) === 0);
  ok('residential: a $100 change order does not; over $2,500 does (unchanged)', !CC.coNeedsSign(false, { amt: 100 }) && CC.coNeedsSign(false, { amt: 3000 }) && CC.coSignLimit(false) === 2500);
  ok('a draft with no work does not hold; a draft with work does; a voided / signed / pre-COMMCO one does not',
    !CC.coHolds({ status: 'draft', created: today }) && CC.coHolds({ status: 'draft', desc: 'x', created: today }) && !CC.coHolds({ status: 'void', desc: 'x', created: today }) && !CC.coHolds({ desc: 'x', created: today, signedAt: ago(1) }) && !CC.coHolds({ desc: 'x', created: '2026-09-01', status: 'approved' }));
  ok('approved by the office but not signed still holds', CC.coHolds({ desc: 'x', created: today, status: 'approved' }));
  const m0 = { lines: [{ id: 'a', product: 'LVT', spec: 'Oak', qty: '10', where: 'Lobby', init: { initials: 'GS', sig: 'lvt|oak|10|lobby' } }], signedAt: ago(1) };
  ok('materials: all initialed + signed → the job may start', CC.startGate(true, m0).ok);
  const m1 = JSON.parse(JSON.stringify(m0)); m1.lines[0].spec = 'Walnut';
  ok('a line changed after it was initialed needs new initials', !CC.startGate(true, m1).ok && CC.startGate(true, m1).pending === 1);
  ok('no checklist → a commercial job cannot start; a residential job is not gated', !CC.startGate(true, null).ok && CC.startGate(false, null).ok);
  ok('the GC never sees prices in material lines', CC.noMoney('LVT · $3.10/SF supplier quote') === 'LVT· supplier quote' || !/\$/.test(CC.noMoney('LVT · $3.10/SF supplier quote')));

  console.log('── 2. the hold, the GC portal change order, signing lifts the hold');
  seed();
  let data = await CORE.crmData(true);
  const P = id => CORE.findProject(data, id);
  ok('COM1 is commercial (the AUTOCOM rule); RES1 is residential', CC.isCommercial(data, P('COM1')) && !CC.isCommercial(data, P('RES1')));
  let h = CC.holdFor(data, P('COM1'), {});
  ok('commercial $100 change order unsigned → job on hold, CO #2 (the old pre-COMMCO one is #1 and does not hold)', h.on && h.cos.length === 1 && h.cos[0].number === '2', h);
  ok('the banner text: "⛔ Work stopped — waiting on signed Change Order #2 from Northgate Builders LLC"', CC.holdText(h, G.gcCompany(data, P('COM1'))) === '⛔ Work stopped — waiting on signed Change Order #2 from Northgate Builders LLC', CC.holdText(h, G.gcCompany(data, P('COM1'))));
  ok('residential $100 change order: no hold', !CC.holdFor(data, P('RES1'), {}).on);
  const sub = CC.holdSubText(h);
  ok('the sub sees "Stop: do not start the added work — job on hold until the change order is signed", never a price', /^Stop: do not start the added work — job on hold until the change order is signed/.test(sub) && !/\$|100/.test(sub), sub);
  { const PA = require(path.join(F, 'portal-access.js'));
    const sh = await PA._commco.subHolds(data, [P('COM1'), P('RES1')]);
    ok('sub portal (p-job / p-home): COM1 carries the stop line (English + Spanish), no price; RES1 nothing', sh.COM1 && sh.COM1.on && /^Stop: do not start the added work/.test(sh.COM1.text) && /^Alto:/.test(sh.COM1.es) && !/\$|100/.test(sh.COM1.text) && !sh.RES1, sh);
    ok('the sub portal app draws it (red stop card on the job, ⛔ On hold on the job row)', /JOB\.hold && JOB\.hold\.on/.test(require('fs').readFileSync(path.join(build, 'portal-app.js'), 'utf8')) && /j\.hold && j\.hold\.on/.test(require('fs').readFileSync(path.join(build, 'portal-app.js'), 'utf8'))); }
  ok('homeowner portal stays OFF for a commercial job; the GC portal link + invite are ON', JA.effective(P('COM1'), null).portalLink === false && JA.effective(P('COM1'), null).portalInvite === false && JA.effective(P('COM1'), null).gcPortalLink === true && JA.effective(P('COM1'), null).gcPortalInvite === true);
  { const cs = G.contactsOf({ customers: [], leads: [{ id: 'LB', bidTo: [{ company: 'Northgate Builders, LLC', contact: 'Bea Bidder', email: 'bea@northgate.example' }, { company: 'Other GC Inc', contact: 'Oz', email: 'oz@other.example' }] }] }, { id: 'X', client: 'Northgate Builders LLC', leadId: 'LB' });
    ok('GC contacts from the bid (lead.bidTo): only the GC the job is with, not every GC that invited us', cs.length === 1 && cs[0].email === 'bea@northgate.example', cs); }
  ok('residential: GC portal options off, customer portal on (unchanged)', JA.effective(P('RES1'), null).gcPortalLink === false && JA.effective(P('RES1'), null).portalLink === true);

  let r = await staff({ action: 'gcp-link', projectId: 'COM1', op: 'create' });
  const GTOK = (/#g=([A-Za-z0-9_-]{43})/.exec(r.j.url || '') || [])[1];
  ok('the GC link', !!GTOK, r.j);
  r = await staff({ action: 'cc-co-push', projectId: 'COM1', crmId: 'CO_A', number: '2', title: 'Add one duplex outlet in exam room 2', description: 'GC request', amount: 100 });
  ok('the job change order goes to the GC portal: on ✅ Approvals (PM, then admin — existing rule), number kept', r.status === 200 && r.j.queued && r.j.co.number === '2' && r.j.co.crmId === 'CO_A', r.j);
  let q = queue().find(x => x.kind === 'gcp_co_contract');
  ok('the approval goes to the GC PM with the super + office@ copied', q && q.to === 'pam@northgate.example' && q.meta.cc.includes('gus@northgate.example') && q.meta.cc.includes('office@grayco-cs.com'), q && { to: q.to, cc: q.meta.cc });
  r = await staff({ action: 'cc-co-push', projectId: 'COM1', crmId: 'CO_A', number: '2', title: 'Add one duplex outlet in exam room 2', description: 'GC request', amount: 100 });
  ok('pushing the same change order again makes no second one', (lik('gc_gcp_jobs').COM1.cos || []).length === 1);
  W.sent = [];
  let out = await G.onApproved(Object.assign({}, q));
  const coMail = W.sent[0] || {};
  ok('approved → e-mailed to the GC (link to sign), office@ copied', out.ok && coMail.to && coMail.to[0] === 'pam@northgate.example' && (coMail.cc || []).includes('office@grayco-cs.com') && /#g=[A-Za-z0-9_-]{43}&(amp;)?co=/.test(coMail.html), { out, to: coMail.to, cc: coMail.cc });
  r = await call({ action: 'gc-view' }, { 'x-gc-token': GTOK });
  ok('the GC portal shows the red hold + the change order to sign', r.j.hold && r.j.hold.on && /Change Order #2 from Northgate Builders LLC/.test(r.j.hold.text) && r.j.cos.some(c => c.number === '2' && c.status === 'sent'), r.j.hold);
  ok('the GC portal never shows costs / the contract / a sub portal', !/120000|180000|costs|sub ?portal/i.test(JSON.stringify(r.j)));
  const GCO = r.j.cos.find(c => c.number === '2').id;
  W.sent = [];
  r = await call({ action: 'gc-co-sign', id: GCO, name: 'Pam Manager', title: 'PM', agree: true }, { 'x-gc-token': GTOK });
  ok('the GC signs CO #2 in the portal', r.status === 200 && r.j.co.status === 'signed');
  const lift = W.sent.find(x => /CO #2 signed — job can continue/.test(x.subject));
  ok('PM + office@ told "CO #2 signed — job can continue"', lift && lift.to.includes('nthomas@grayco-cs.com') && lift.to.includes('office@grayco-cs.com'), W.sent.map(x => [x.subject, x.to]));
  data = await CORE.crmData(true);
  h = CC.holdFor(data, P('COM1'), lik('gc_gcp_jobs').COM1);
  ok('the hold lifts at once on the server (sub portal / GC page) — the GC portal signature counts', !h.on, h);
  r = await staff({ action: 'gcp-signed' });
  ok('the CRM finds it with its job change order id (crmId) to mark signed', r.j.signed.length === 1 && r.j.signed[0].crmId === 'CO_A', r.j);

  console.log('── 3. reminders: unsigned 24 h → the GC, then daily');
  cset('cos', cget('cos').concat([Object.assign({ id: 'CO_B', pid: 'COM1', amt: 250, desc: 'Move door 2 ft', status: 'pending', created: today, createdAt: ago(1), commco: true }, PROOF)]));
  r = await staff({ action: 'cc-co-push', projectId: 'COM1', crmId: 'CO_B', number: '3', title: 'Move door 2 ft', amount: 250 });
  q = queue().find(x => x.kind === 'gcp_co_contract' && x.meta.crmId === 'CO_B');
  await G.onApproved(Object.assign({}, q));
  W.sent = [];
  let rr = await CC.reminders({ force: true });
  ok('not yet 24 hours: no reminder', rr.sent === 0 && !W.sent.length, rr);
  const T0 = Date.now(); G.T.now = () => T0 + 25 * 3600e3;
  rr = await CC.reminders({ force: true });
  const rem = W.sent.find(x => /Reminder: change order #3 waiting for your signature/.test(x.subject));
  ok('after 24 hours: a reminder to the GC with the link, office@ copied', rem && rem.to.includes('pam@northgate.example') && (rem.cc || []).includes('office@grayco-cs.com') && /co=/.test(rem.html), W.sent.map(x => [x.subject, x.to, x.cc]));
  W.sent = []; rr = await CC.reminders({ force: true });
  ok('not twice the same day', rr.sent === 0, rr);
  G.T.now = () => T0 + 49 * 3600e3; W.sent = []; rr = await CC.reminders({ force: true });
  ok('then daily', rr.sent === 1, rr);
  G.T.now = null;

  console.log('── 4. materials approval');
  W.sent = [];
  r = await staff({ action: 'cc-mats-save', projectId: 'COM3', lines: [{ id: 'm1', product: 'LVT plank Shaw Endura', spec: 'Oak Grey · $3.10/SF', qty: '2400 SF', where: 'Lobby + halls' }, { id: 'm2', product: 'Paint SW 7015 Repose Gray', spec: 'eggshell', qty: '30 gal', where: 'Walls' }] });
  ok('the PM saves the checklist; prices are stripped from GC-facing words', r.status === 200 && r.j.mats.lines.length === 2 && !/\$/.test(JSON.stringify(r.j.mats)) && r.j.mats.pending === 2, r.j);
  r = await staff({ action: 'gcp-link', projectId: 'COM3', op: 'create' });
  const T3 = (/#g=([A-Za-z0-9_-]{43})/.exec(r.j.url || '') || [])[1];
  r = await staff({ action: 'cc-mats-send', projectId: 'COM3', name: 'Gus Super', email: 'gus@northgate.example' });
  const sm = W.sent[0] || {};
  ok('"Send to the super": e-mail with the link (mats=1) + the checklist PDF, office@ copied', r.j.mailed && sm.to[0] === 'gus@northgate.example' && (sm.cc || []).includes('office@grayco-cs.com') && /mats=1/.test(sm.html) && sm.attachments && Buffer.from(sm.attachments[0].content, 'base64').toString('latin1').startsWith('%PDF'), { to: sm.to, cc: sm.cc });
  r = await call({ action: 'gc-view' }, { 'x-gc-token': T3 });
  ok('the GC page shows the 2 materials waiting for initials', r.j.mats && r.j.mats.pending === 2 && r.j.mats.lines.length === 2);
  r = await call({ action: 'gc-mats-sign', name: 'Gus Super', initials: { m1: 'GS' }, strokes: [[[10, 10], [80, 60]]] }, { 'x-gc-token': T3 });
  ok('every line needs initials', r.status === 400 && /Initial every material/.test(r.j.error), r.j);
  r = await call({ action: 'gc-mats-sign', name: 'Gus Super', initials: { m1: 'GS', m2: 'GS' }, strokes: [] }, { 'x-gc-token': T3 });
  ok('the signature is needed', r.status === 400);
  W.sent = [];
  r = await call({ action: 'gc-mats-sign', name: 'Gus Super', title: 'Superintendent', company: 'Northgate Builders LLC', email: 'gus@northgate.example', initials: { m1: 'gs', m2: 'GS' }, strokes: [[[10, 10], [80, 60], [120, 30]]] }, { 'x-gc-token': T3 });
  ok('the super initials + signs through the link', r.status === 200 && r.j.mats.pending === 0 && r.j.mats.signedAt && r.j.signoff.pdfRef, r.j);
  const pdfKey = (r.j.signoff.pdfRef || '').split('/').pop(), pdf = W.files[pdfKey] ? W.files[pdfKey].toString('latin1') : '';
  const ptxt = (pdf.match(/\((?:[^()\\]|\\.)*\) Tj/g) || []).join(' ');
  ok('a PDF: logo header (one centered image), the lines with initials, the signature, no prices', pdf.startsWith('%PDF') && (pdf.match(/\/Subtype \/Image/g) || []).length === 1 && /Initials: GS/.test(ptxt) && /Signed: Gus Super, Superintendent/.test(ptxt) && /GrayCo Construction Services/.test(ptxt) && !/\$/.test(ptxt), ptxt.slice(0, 400));
  const cp = W.sent.find(x => /Signed: materials approval/.test(x.subject));
  ok('e-mailed to the super with the PDF, office@ copied; PM + office told', cp && cp.to[0] === 'gus@northgate.example' && (cp.cc || []).includes('office@grayco-cs.com') && cp.attachments.length === 1 && W.sent.some(x => /Materials approved by Gus Super/.test(x.subject) && x.to.includes('office@grayco-cs.com')), W.sent.map(x => x.subject));
  r = await staff({ action: 'cc-pull', pids: ['COM3'] });
  ok('the CRM pull gets the checklist + the signed PDF to file on the job', r.j.jobs.COM3 && r.j.jobs.COM3.files.length === 1 && CC.startGate(true, r.j.jobs.COM3.mats).ok, r.j.jobs.COM3);
  r = await staff({ action: 'cc-filed', projectId: 'COM3', ids: [r.j.jobs.COM3.files[0].id] });
  r = await staff({ action: 'cc-pull', pids: ['COM3'] });
  ok('filed once', r.j.jobs.COM3.files.length === 0);
  const cur = r.j.jobs.COM3.mats.lines.map(l => ({ id: l.id, product: l.product, spec: l.spec, qty: l.qty, where: l.where }));
  r = await staff({ action: 'cc-mats-save', projectId: 'COM3', lines: cur.concat([{ id: 'm3', product: 'Acoustic ceiling tile Armstrong Ultima', spec: '2x2', qty: '80 ea', where: 'Lobby' }]) });
  ok('a material added later needs its own initials (1 awaiting); the earlier ones keep theirs', r.j.mats.pending === 1 && r.j.mats.lines.filter(l => l.ok).length === 2 && !CC.startGate(true, r.j.raw).ok);
  r = await staff({ action: 'cc-mats-sign', projectId: 'COM3', name: 'Gus Super', initials: { m3: 'GS' }, strokes: [[[5, 5], [50, 50]]] });
  ok('on-site sign mode (staff) initials the new one → a second signed PDF', r.status === 200 && r.j.mats.pending === 0 && r.j.mats.signoffs.length === 2 && r.j.signoff.lines === 1, r.j);

  console.log('── 5. submittals');
  W.sent = [];
  r = await staff({ action: 'cc-sub-save', projectId: 'COM3', spec: '09 65 19', item: 'LVT plank Shaw Endura', desc: 'Oak Grey, 6x48', due: D(5), files: [{ ref: 'sb:crm-files/' + SHA + '.pdf', name: 'Endura product data.pdf', kind: 'product' }], submit: true });
  const S1 = r.j.submittal;
  const sMail = W.sent.find(x => /Submittal #001 rev 1 for review/.test(x.subject));
  ok('submittal #001 rev 1 submitted: e-mailed to the GC contacts with the file + link, office@ copied', r.j.mailed && S1.status === 'submitted' && S1.rev === 1 && sMail && sMail.attachments && sMail.attachments.length === 1 && (sMail.cc || []).includes('office@grayco-cs.com') && /sub=/.test(sMail.html), W.sent.map(x => x.subject));
  r = await call({ action: 'gc-sub-review', id: S1.id, decision: 'approved_as_noted', name: 'Pam Manager' }, { 'x-gc-token': T3 });
  ok('approved as noted needs comments', r.status === 400);
  W.sent = [];
  r = await call({ action: 'gc-sub-review', id: S1.id, decision: 'approved_as_noted', comment: 'Use the 12 mil wear layer', name: 'Pam Manager', file: { name: 'markup.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4 markup').toString('base64') } }, { 'x-gc-token': T3 });
  ok('the GC approves as noted (comment + a marked-up file)', r.status === 200 && r.j.submittal.status === 'approved_as_noted' && r.j.submittal.markup && r.j.fedMaterials === 1, r.j);
  ok('PM + office@ told', W.sent.some(x => /Submittal #001 rev 1: Approved as noted/.test(x.subject) && x.to.includes('nthomas@grayco-cs.com') && x.to.includes('office@grayco-cs.com')));
  r = await staff({ action: 'cc-pull', pids: ['COM3'] });
  ok('the approved-as-noted material feeds the materials checklist (needs the super\'s initials)', r.j.jobs.COM3.mats.lines.some(l => /Submittal #001/.test(l.src) && /as noted: Use the 12 mil/.test(l.spec) && !CC.lineOk(l)));
  r = await staff({ action: 'cc-sub-save', projectId: 'COM3', spec: '08 71 00', item: 'Door hardware set', due: D(3), submit: true });
  const S2 = r.j.submittal;
  r = await call({ action: 'gc-sub-review', id: S2.id, decision: 'revise', comment: 'Need ADA lever trim', name: 'Pam Manager' }, { 'x-gc-token': T3 });
  ok('revise & resubmit', r.j.submittal.status === 'revise');
  r = await staff({ action: 'cc-sub-resubmit', projectId: 'COM3', id: S2.id });
  ok('resubmittal → #002 rev 2, submitted again; rev 1 superseded', r.status === 200 && r.j.submittal.number === S2.number && r.j.submittal.rev === 2 && r.j.submittal.status === 'submitted', r.j);
  r = await call({ action: 'gc-view' }, { 'x-gc-token': T3 });
  ok('the GC page shows both revisions', r.j.subm.filter(x => x.number === S2.number).map(x => x.rev + ':' + x.superseded).sort().join() === '1:true,2:false', r.j.subm);
  const T0b = Date.now(); G.T.now = () => T0b + 7 * 864e5; W.sent = [];
  rr = await CC.reminders({ force: true });
  ok('an overdue submittal → a reminder to the GC (office@ copied)', W.sent.some(x => /Reminder: submittal #002 rev 2 review was due/.test(x.subject) && (x.cc || []).includes('office@grayco-cs.com')), W.sent.map(x => x.subject));
  G.T.now = null;

  console.log('── 6. approval requests');
  W.sent = [];
  r = await staff({ action: 'cc-appr-new', projectId: 'COM3', subject: 'Night work on 11/3', question: 'May we pour the slab patch after 6 PM?', due: D(2) });
  const AP = r.j.approval;
  ok('sent to the GC (link + e-mail, office@ copied)', r.j.mailed && W.sent.some(x => /Approval request #001/.test(x.subject) && (x.cc || []).includes('office@grayco-cs.com') && /ap=/.test(x.html)));
  W.sent = [];
  r = await call({ action: 'gc-appr-answer', id: AP.id, decision: 'approved', answer: 'Yes, till 10 PM', name: 'Pam Manager' }, { 'x-gc-token': T3 });
  ok('the GC answers in the portal', r.status === 200 && r.j.approval.status === 'approved' && r.j.approval.answeredBy === 'Pam Manager (GC)');
  ok('PM + office@ told', W.sent.some(x => /Approval request #001 approved/.test(x.subject) && x.to.includes('office@grayco-cs.com')));
  r = await call({ action: 'gc-file', id: 'nope' }, { 'x-gc-token': T3 });
  ok('a GC link opens only its own job\'s files', r.status === 404);
  r = await call({ action: 'gc-view' }, { 'x-gc-token': GTOK });
  ok('another job\'s GC link does not see this job\'s submittals', !(r.j.subm || []).length);
}

/* ═════════════ 2. the CRM page + the GC page ═════════════ */
async function browserPart(){
  console.log('── 7. the CRM page');
  seed();
  /* the job made before COMMCO keeps its old behaviour; the new ones are commercial */
  const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
  process.on('exit', () => { try { shared.close(); } catch (e) {} });
  const A = await computer('A', { build });
  const MP = A.page(); A.page = () => MP;   /* the CRM page (the GC pages open beside it) */
  /* the desk job page: the harness does not draw the React job detail (it stays on the list), so the job header the patches
     anchor to ("← All Projects" + the open project) is put in place the way the job page has it */
  const openJob = pid => A.ev(pid => { window._navToJob(pid); setTimeout(() => { const main = document.querySelector('main'); if (!main) return;
    if (!Array.from(main.querySelectorAll('button')).some(b => /^\s*←\s*All Projects\s*$/.test(b.textContent || ''))) { const d = document.createElement('div'); d.id = 'cc-fakejob'; d.innerHTML = '<button type="button">← All Projects</button><h2>job</h2>'; main.prepend(d); }
    window._gcOpenProject = window._crm.projects.find(p => p.id === pid); }, 1500); }, pid);
  const fnRoute = async route => {
    const req = route.request(); const u = new URL(req.url());
    const hd = req.headers(); CORE._reset();
    const res = await H.handler({ httpMethod: req.method(), headers: Object.assign({}, hd, { origin: 'https://crm.grayco-cs.com', 'x-nf-client-connection-ip': '10.1.1.' + Math.floor(Math.random() * 200) }), body: req.postData() || '', queryStringParameters: Object.fromEntries(u.searchParams) });
    return route.fulfill({ status: res.statusCode, contentType: 'application/json', body: res.body || '' });
  };
  await A.ctx.route('**/.netlify/functions/gc-portal*', fnRoute);
  try {
    await signIn(A, 'wjohnson@grayco-cs.com', 12000);
    const ready = await waitFor(A, () => !!(window._gcCommco && window._gcJA && (window._crm || {}).projects && window._crm.projects.length >= 3 && window._gcGCP && window._gcGCP._paint), null, 90000, 500);
    ok('page ready (COMMCO + JA + GCP)', !!ready);
    await waitFor(A, () => ((window._crm || {}).changeOrders || []).length >= 3 || window._gcCommco.hold('COM1').on, null, 30000, 500);
    let st = await A.ev(() => ({ h: window._gcCommco.hold('COM1'), t: window._gcCommco.holdText(window._gcCommco.hold('COM1'), window._gcCommco.gcName(window._crm.projects.find(p => p.id === 'COM1'))), r: window._gcCommco.hold('RES1').on, isC: window._gcCommco.isComm('COM1'), isR: window._gcCommco.isComm('RES1') }));
    ok('page: COM1 on hold for CO #2 from the GC (same rule as the server); RES1 not', st.h.on && st.h.cos[0].number === '2' && st.t === '⛔ Work stopped — waiting on signed Change Order #2 from Northgate Builders LLC' && !st.r && st.isC && !st.isR, st);

    /* the Add Change Order form */
    const th = async (pid, amt) => A.ev(([pid, amt]) => { window.gcAddCO.open(pid, 'x', 'PO', 'c', 'Nick Thomas'); const a = document.getElementById('gc-co-amt'); a.value = amt; window.gcAddCO.updateThreshold(); return document.getElementById('gc-co-thresh').textContent; }, [pid, amt]);
    let t1 = await th('RES1', 100), t2 = await th('COM1', 100), t3 = await th('RES1', 3000);
    ok('residential $100: "Under $2,500 … No signatures needed" (unchanged)', /Under \$2,500: no owner approval required.*No signatures needed/.test(t1), t1);
    ok('residential $3,000: owner approval + signatures (unchanged)', /Over \$2,500: requires owner approval/.test(t3), t3);
    ok('commercial $100: "every change order needs the GC’s signature … the job is on hold until it is signed"', /every change order needs the GC’s signature, whatever the amount/.test(t2) && /on hold until it is signed/.test(t2), t2);
    A.acceptConfirm = false;
    await th('COM1', 100);
    await A.ev(() => { document.getElementById('gc-co-desc').value = 'Extra blocking for TV mount'; return window.gcAddCO.save(); });
    const saved = await waitFor(A, () => ((window._crm || {}).changeOrders || []).find(c => c.desc === 'Extra blocking for TV mount'), null, 15000, 300);
    ok('a commercial $100 change order saved from the form: commco + requiresSignature (no typed customer name needed)', saved && saved.commco === true && saved.requiresSignature === true && saved.amt === 100, saved);
    A.acceptConfirm = true;
    await A.ev(() => { try { window.gcAddCO.close(); } catch (e) {} });
    st = await A.ev(() => window._gcCommco.hold('COM1'));
    ok('…and it holds the job too (CO #2 + the new one)', st.on && st.cos.length === 2, st);
    /* drop it again (voided) so the signature test below is about CO #2 */
    await A.ev(() => window._gcSetCOs(a => a.map(c => c.desc === 'Extra blocking for TV mount' ? Object.assign({}, c, { status: 'void' }) : c)));
    await sleep(400);

    /* the banner on the job page */
    await openJob('COM1');
    const ban = await waitFor(A, () => { const b = document.querySelector('.gccc-ban[data-gccc="hold"]'); return b ? b.textContent : null; }, null, 15000, 300);
    ok('the job page shows the red "⛔ Work stopped — waiting on signed Change Order #2 from Northgate Builders LLC"', ban && /⛔ Work stopped — waiting on signed Change Order #2 from Northgate Builders LLC/.test(ban), ban || await A.ev(() => ({ op: window._gcOpenProject && (window._gcOpenProject.id || typeof window._gcOpenProject), back: Array.from(document.querySelectorAll('main button')).filter(b => /All Projects/.test(b.textContent)).map(b => b.textContent), gcgp: !!document.querySelector('.gcgp-bar'), view: localStorage.grayco_view, main: !!document.querySelector('main') })));

    /* GrayCo Field (Today): the job card carries the red line too */
    await A.ev(() => { const d = document.createElement('div'); d.className = 'fh-job'; d.setAttribute('data-job', 'COM1'); d.innerHTML = '<b>Eastgate Clinic TI</b><div>today</div>'; d.id = 'cc-fieldcard'; document.body.appendChild(d); });
    const fb = await waitFor(A, () => { const b = document.querySelector('#cc-fieldcard .gccc-fban'); return b ? b.textContent : null; }, null, 8000, 300);
    ok('the GrayCo Field job card (Today) shows the red hold line', fb && /Work stopped — waiting on signed Change Order #2/.test(fb), fb);
    await A.ev(() => document.getElementById('cc-fieldcard').remove());
    let ran = await A.ev(() => { window.__ccRan = 0; const b = document.createElement('button'); b.setAttribute('data-fa', 'progress'); b.setAttribute('data-pid', 'COM1'); b.id = 'cc-fa'; b.addEventListener('click', () => { window.__ccRan++; }); document.body.appendChild(b); b.click(); return window.__ccRan; });
    const fdlg = await waitFor(A, () => { const d = document.getElementById('gccc-stop'); return d ? d.textContent : null; }, null, 5000, 200);
    ok('GrayCo Field "📈 Progress" on the held job: stopped before the tool runs (override sheet)', ran === 0 && fdlg && /Work stopped/.test(fdlg), { ran, fdlg });
    await A.ev(() => { document.querySelector('#gccc-stop [data-x="close"]').click(); document.getElementById('cc-fa').remove(); });
    /* a crew day on the held job → stopped; an admin override with a reason → allowed + logged */
    await A.page().mouse.click(5, 5);
    await A.ev(() => window._setSchedule(prev => (prev || []).concat([{ id: 'SCH1', pid: 'COM1', title: 'Framing crew', date: new Date().toISOString().slice(0, 10) }])));
    let dlg = await waitFor(A, () => { const d = document.getElementById('gccc-stop'); return d ? d.textContent : null; }, null, 8000, 200);
    ok('scheduling a crew day on the held job is stopped (admin override sheet)', dlg && /Work stopped — waiting on signed Change Order #2/.test(dlg) && /Override/.test(dlg), dlg);
    ok('…not on the schedule', await A.ev(() => !((window._crm.schedule || []).some(e => e.id === 'SCH1'))));
    await A.ev(() => { document.getElementById('gccc-why').value = 'GC super approved by phone'; document.querySelector('#gccc-stop [data-x="ov"]').click(); });
    const added = await waitFor(A, () => (window._crm.schedule || []).some(e => e.id === 'SCH1'), null, 10000, 300);
    ok('admin override with a reason → the crew day goes on', !!added);
    const log = await waitFor(A, () => { const p = window._crm.projects.find(x => x.id === 'COM1'); return (p.commcoLog || []).find(x => x.kind === 'override'); }, null, 10000, 300);
    ok('the override is logged on the job (who, why, which CO)', log && log.reason === 'GC super approved by phone' && log.by === 'Wesley Johnson' && /^(schedule|start)$/.test(log.action) && log.why === 'hold' && log.cos.join() === '#2', log);
    /* progress on the held job */
    await A.page().mouse.click(5, 5);
    await A.ev(() => window._setProjects(prev => prev.map(p => p.id === 'COM1' ? Object.assign({}, p, { pct: 20 }) : p)));
    dlg = await waitFor(A, () => { const d = document.getElementById('gccc-stop'); return d ? d.textContent : null; }, null, 8000, 200);
    ok('progress on the held job is stopped', !!dlg && /progress|starting/.test(dlg), dlg);
    await A.ev(() => document.querySelector('#gccc-stop [data-x="close"]').click());
    ok('…and not saved', await A.ev(() => !(window._crm.projects.find(p => p.id === 'COM1').pct > 0)));
    /* a residential job is not touched */
    await A.page().mouse.click(5, 5);
    await A.ev(() => window._setProjects(prev => prev.map(p => p.id === 'RES1' ? Object.assign({}, p, { pct: 30 }) : p)));
    await sleep(600);
    ok('residential progress goes through (no sheet)', await A.ev(() => !document.getElementById('gccc-stop') && window._crm.projects.find(p => p.id === 'RES1').pct === 30));

    /* the CO goes to the GC portal, the GC signs it on their page, the hold lifts */
    await A.ev(() => window._gcCommco.pull(true));
    let gst = await waitFor(A, () => true, null, 1000, 200);
    const jobs = lik('gc_gcp_jobs') || {};
    const gco = ((jobs.COM1 || {}).cos || []).find(c => c.crmId === 'CO_A');
    ok('the page sent CO #2 to the GC portal by itself (priced → ✅ Approvals)', gco && gco.number === '2' && gco.status === 'pricing', jobs.COM1);
    const q = queue().find(x => x.kind === 'gcp_co_contract' && x.meta.crmId === 'CO_A');
    W.sent = [];
    await G.onApproved(Object.assign({}, q));
    ok('approved → e-mailed to the GC with office@ copied', W.sent.some(x => x.to[0] === 'pam@northgate.example' && (x.cc || []).includes('office@grayco-cs.com')));
    let r = await staff({ action: 'gcp-link', projectId: 'COM1', op: 'create' });
    const GT = (/#g=([A-Za-z0-9_-]{43})/.exec(r.j.url || '') || [])[1];
    const pg = await A.ctx.newPage();
    await pg.goto('https://app.local/portal.html#g=' + GT + '&co=' + gco.id);
    await pg.waitForSelector('#gcc-hold', { timeout: 30000 }).catch(() => null);
    const holdTxt = await pg.evaluate(() => (document.getElementById('gcc-hold') || {}).textContent || '');
    ok('the GC page: red hold banner', /Work stopped — waiting on signed Change Order #2 from Northgate Builders LLC/.test(holdTxt), holdTxt);
    await pg.evaluate(() => { const it = document.querySelector('[data-gcp-id="' + location.hash.split('co=')[1] + '"]'); it.querySelector('input.gcp-in').value = 'Pam Manager'; it.querySelector('input[type=checkbox]').checked = true; Array.from(it.querySelectorAll('button')).find(b => /Sign change order/.test(b.textContent)).click(); });
    await pg.waitForFunction(() => /Signed — thank you/.test(document.body.textContent), null, { timeout: 20000 }).catch(() => null);
    ok('the GC signs on their page', /Signed — thank you/.test(await pg.evaluate(() => document.body.textContent)));
    ok('"CO #2 signed — job can continue" to the PM + office@', W.sent.some(x => /CO #2 signed — job can continue/.test(x.subject) && x.to.includes('office@grayco-cs.com')), W.sent.map(x => x.subject));
    await A.ev(() => window._gcGCP.sweep());
    const lifted = await waitFor(A, () => !window._gcCommco.hold('COM1').on, null, 20000, 400);
    const coA = await A.ev(() => window._gcCommco.cos().find(c => c.id === 'CO_A'));
    ok('signing lifts the hold in the CRM (the job change order is signed, no copy added)', lifted && coA && coA.gcSigned && coA.signedAt && !(await A.ev(() => (window._crm.changeOrders || []).some(c => /^gcco_/.test(c.id)))), { coA, ids: await A.ev(() => [(window._crm.changeOrders || []).map(c => c.id + ':' + (c.signedAt ? 's' : '')), window._gcCommco.cos().map(c => c.id + ':' + (c.signedAt ? 's' : ''))]), hold: await A.ev(() => window._gcCommco.hold('COM1')) });
    await sleep(1800);
    ok('the red banner is gone from the job page', await A.ev(() => !document.querySelector('.gccc-ban[data-gccc="hold"]')));

    console.log('── 8. materials: the start gate, sign mode, the link');
    await A.page().mouse.click(5, 5);
    await A.ev(() => window._setProjects(prev => prev.map(p => p.id === 'COM3' ? Object.assign({}, p, { status: 'active' }) : p)));
    dlg = await waitFor(A, () => { const d = document.getElementById('gccc-stop'); return d ? d.textContent : null; }, null, 8000, 200);
    ok('COM3 cannot move to In Progress (Active) before the materials are initialed', dlg && /Materials approval not done|awaiting super initials/.test(dlg), dlg);
    await A.ev(() => document.querySelector('#gccc-stop [data-x="close"]').click());
    await A.page().mouse.click(5, 5);
    await A.ev(() => window._setSchedule(prev => (prev || []).concat([{ id: 'SCH3', pid: 'COM3', title: 'Demo crew', date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }])));
    dlg = await waitFor(A, () => { const d = document.getElementById('gccc-stop'); return d ? d.textContent : null; }, null, 8000, 200);
    ok('…nor get its first crew day', dlg && /Materials/.test(dlg), dlg);
    await A.ev(() => document.querySelector('#gccc-stop [data-x="close"]').click());
    await A.ev(() => window._gcCommco.open('COM3', 'mats'));
    await waitFor(A, () => !!document.querySelector('#gcgp [data-cc="fill"]'), null, 20000, 300);
    await A.ev(() => document.querySelector('#gcgp [data-cc="fill"]').click());
    await sleep(300);
    const lines = await A.ev(() => Array.from(document.querySelectorAll('#gcgp tr[data-cc-i]')).map(tr => Array.from(tr.querySelectorAll('input')).map(i => i.value).join(' | ')));
    ok('the checklist fills from the estimate\'s materials (product, spec, qty, where) — no labor, no prices', lines.length === 2 && /LVT plank Shaw Endura/.test(lines[0]) && /2400 SF/.test(lines[0]) && /Flooring/.test(lines[0]) && !/\$|Paint labor/.test(lines.join()), lines);
    await A.ev(() => { const i = document.querySelector('#gcgp input[data-cc-f="where"][data-cc-i="1"]'); i.value = 'All walls'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await A.ev(() => document.querySelector('#gcgp [data-cc="save"]').click());
    await waitFor(A, () => { const p = window._crm.projects.find(x => x.id === 'COM3'); return p.commcoMats && p.commcoMats.lines.length === 2; }, null, 15000, 300);
    const g0 = await A.ev(() => window._gcCommco.gate('COM3'));
    ok('saved: 2 materials awaiting the super\'s initials (gate closed)', !g0.ok && g0.pending === 2, g0);
    await A.ev(() => document.querySelector('#gcgp [data-cc="sign"]').click());
    await waitFor(A, () => !!document.getElementById('gccc-sign'), null, 8000, 200);
    await A.ev(() => { document.querySelectorAll('#gccc-sign [data-ini]').forEach(i => { i.value = 'gs'; }); document.getElementById('gccc-n').value = 'Gus Super'; });
    const pad = A.page().locator('#gccc-pad'); await pad.scrollIntoViewIfNeeded(); const bb = await pad.boundingBox();
    await A.page().mouse.move(bb.x + 20, bb.y + 20); await A.page().mouse.down(); await A.page().mouse.move(bb.x + 120, bb.y + 60, { steps: 6 }); await A.page().mouse.move(bb.x + 200, bb.y + 30, { steps: 6 }); await A.page().mouse.up();
    W.sent = [];
    await A.ev(() => document.querySelector('#gccc-sign [data-x="sign"]').click());
    const doc = await waitFor(A, () => ((window._crm.projectDocs || []).concat(window._gcProjectDocs || [])).find(d => d && /^ccmats_/.test(d.id) && d.pid === 'COM3'), null, 20000, 400);
    ok('sign mode on the PM\'s device: the signed PDF is on the job\'s documents', doc && /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(doc.ref) && /GC superintendent/.test(doc.by), doc);
    const g1 = await waitFor(A, () => { const g = window._gcCommco.gate('COM3'); return g.ok ? g : null; }, null, 15000, 300);
    ok('…and the gate opens (every line initialed + signed)', !!g1);
    ok('…the PDF e-mailed (office@ copied — no super e-mail typed → office)', W.sent.some(x => /materials approval/i.test(x.subject) && (x.to.includes('office@grayco-cs.com') || (x.cc || []).includes('office@grayco-cs.com'))), W.sent.map(x => [x.subject, x.to]));
    await A.page().mouse.click(5, 5);
    await A.ev(() => window._setProjects(prev => prev.map(p => p.id === 'COM3' ? Object.assign({}, p, { status: 'active' }) : p)));
    await sleep(700);
    ok('now COM3 moves to Active (no sheet)', await A.ev(() => !document.getElementById('gccc-stop') && window._crm.projects.find(p => p.id === 'COM3').status === 'active'));
    /* a material added later */
    await A.ev(() => window._gcCommco.open('COM3', 'mats'));
    await waitFor(A, () => !!document.querySelector('#gcgp [data-cc="save"]') && window._gcGCP._p.cc && window._gcGCP._p.st, null, 20000, 300);
    await A.ev(() => { const P = window._gcGCP._p; P.cc.lines.push({ product: 'Ceiling tile Armstrong Ultima', spec: '2x2', qty: '80 ea', where: 'Lobby', src: 'PM' }); P.cc.dirty = true; document.querySelector('#gcgp [data-cc="save"]').click(); });
    await waitFor(A, () => (window._crm.projects.find(x => x.id === 'COM3').commcoMats || { lines: [] }).lines.length === 3, null, 15000, 300);
    await A.ev(() => { const o = document.getElementById('gcgp-ov'); if (o) o.remove(); const f = document.getElementById('cc-fakejob'); if (f) f.remove(); }); await openJob('COM3');
    const amb = await waitFor(A, () => { const b = document.querySelector('.gccc-ban[data-gccc="mats"]'); return b ? b.textContent : null; }, null, 15000, 300);
    ok('the job shows "1 material awaiting super initials"', amb && /1 material awaiting super initials/.test(amb), amb);
    /* the super initials it through the link (GC page) */
    r = await staff({ action: 'gcp-link', projectId: 'COM3', op: 'create' });
    const G3 = (/#g=([A-Za-z0-9_-]{43})/.exec(r.j.url || '') || [])[1];
    const pg3 = await A.ctx.newPage();
    await pg3.goto('https://app.local/portal.html#g=' + G3 + '&mats=1');
    await pg3.waitForSelector('#gcp-mats [data-gcc-init]', { timeout: 30000 }).catch(() => null);
    await pg3.evaluate(() => { document.querySelectorAll('[data-gcc-init]').forEach(i => { i.value = 'GS'; i.dispatchEvent(new Event('input')); }); const n = document.getElementById('gcc-m-n'); n.value = 'Gus Super'; n.dispatchEvent(new Event('input')); });
    const c3 = pg3.locator('#gcp-mats canvas'); await c3.scrollIntoViewIfNeeded(); const b3 = await c3.boundingBox();
    await pg3.mouse.move(b3.x + 20, b3.y + 20); await pg3.mouse.down(); await pg3.mouse.move(b3.x + 140, b3.y + 50, { steps: 8 }); await pg3.mouse.up();
    await pg3.evaluate(() => document.getElementById('gcc-m-sign').click());
    await pg3.waitForFunction(() => /Signed — thank you/.test(document.body.textContent), null, { timeout: 20000 }).catch(() => null);
    ok('the link: the super initials the new material + signs on the GC page', /Signed — thank you/.test(await pg3.evaluate(() => document.body.textContent)));
    await A.ev(() => window._gcCommco.pull(true));
    const g2 = await waitFor(A, () => { const p = window._crm.projects.find(x => x.id === 'COM3'); return p.commcoMats && p.commcoMats.lines.every(l => window._gcCommco.lineOk(l)) && (p.commcoMats.signoffs || []).length === 2 && new Set((window._crm.projectDocs || []).concat(window._gcProjectDocs || []).filter(d => d && /^ccmats_/.test(d.id) && d.pid === 'COM3' && !/_photo$/.test(d.id)).map(d => d.id)).size === 2 ? p.commcoMats : null; }, null, 25000, 500);
    ok('the CRM pulls it: all initialed, 2 signoffs, both PDFs filed on the job', !!g2, await A.ev(() => ({ docs: (window._crm.projectDocs || []).map(d => d.id + ':' + d.pid), gdocs: (window._gcProjectDocs || []).length, m: (window._crm.projects.find(x => x.id === 'COM3').commcoMats || {}).signoffs })));

    console.log('── 9. submittals + approvals in the GC page');
    r = await staff({ action: 'cc-sub-save', projectId: 'COM3', spec: '08 71 00', item: 'Door hardware set', desc: 'Lever trim', submit: true });
    const SU = r.j.submittal;
    r = await staff({ action: 'cc-appr-new', projectId: 'COM3', subject: 'Saturday work', question: 'May we work Saturday 8-4?' });
    const AP = r.j.approval;
    await pg3.goto('about:blank'); await pg3.goto('https://app.local/portal.html#g=' + G3 + '&sub=' + SU.id);
    await pg3.waitForSelector('[data-gcc-dec="' + SU.id + '"]', { timeout: 30000 }).catch(() => null);
    await pg3.evaluate(id => { const it = document.querySelector('[data-gcp-id="' + id + '"]'); it.querySelector('select').value = 'revise'; it.querySelector('textarea').value = 'Need ADA lever trim'; const n = Array.from(it.querySelectorAll('input.gcp-in')).pop(); n.value = 'Pam Manager'; Array.from(it.querySelectorAll('button')).find(b => /Send my review/.test(b.textContent)).click(); }, SU.id);
    await pg3.waitForFunction(() => /GrayCo has your review/.test(document.body.textContent), null, { timeout: 20000 }).catch(() => null);
    r = await staff({ action: 'gcp-state', projectId: 'COM3' });
    const s1 = (r.j.state.subm || []).find(x => x.id === SU.id);
    ok('the GC returns the submittal "Revise & resubmit" on their page', s1 && s1.status === 'revise' && s1.reviewer === 'Pam Manager', s1);
    await A.ev(() => window._gcCommco.open('COM3', 'subm'));
    await waitFor(A, () => !!document.querySelector('#gcgp [data-cc="sresub"]'), null, 20000, 300);
    await A.ev(() => { window.confirm = () => true; const b = document.querySelector('#gcgp [data-cc="sresub"]'); const orig = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function(){ if (this.type === 'file') { HTMLInputElement.prototype.click = orig; this.dispatchEvent(new Event('cancel')); return; } return orig.call(this); }; b.click(); });
    const rev2 = await waitFor(A, () => { const S = window._gcGCP._p.st && window._gcGCP._p.st.state; return S && (S.subm || []).find(x => x.rev === 2 && x.status === 'submitted'); }, null, 20000, 400);
    ok('Resubmit from the job → rev 2, submitted again', rev2 && rev2.number === SU.number, rev2);
    await pg3.goto('about:blank'); await pg3.goto('https://app.local/portal.html#g=' + G3 + '&ap=' + AP.id);
    await pg3.waitForSelector('[data-gcp-id="' + AP.id + '"]', { timeout: 30000 }).catch(() => null);
    await pg3.evaluate(id => { const it = document.querySelector('[data-gcp-id="' + id + '"]'); const n = Array.from(it.querySelectorAll('input.gcp-in')).pop(); n.value = 'Pam Manager'; Array.from(it.querySelectorAll('button')).find(b => /Approve/.test(b.textContent)).click(); }, AP.id);
    await pg3.waitForFunction(() => /GrayCo has your answer/.test(document.body.textContent), null, { timeout: 20000 }).catch(() => null);
    r = await staff({ action: 'gcp-state', projectId: 'COM3' });
    ok('the GC approves the approval request on their page', ((r.j.state.apprs || []).find(x => x.id === AP.id) || {}).status === 'approved');
    ok('the GC project page (#main) never mentions a sub portal or costs', !/sub ?portal|subportal|120000/i.test(await pg3.evaluate(() => document.getElementById('main').innerText)));
    ok('no page errors', !A.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e)).length, A.errs.slice(0, 5));
    await pg.close(); await pg3.close();
  } finally { try { await A.b.close(); } catch (e) {} try { await shared.close(); } catch (e) {} }
}

try {
  if (MODE === 'all' || MODE === 'server') await serverPart();
  if (MODE === 'all' || MODE === 'browser') await browserPart();
} catch (e) { console.log('FAIL exception ' + (e && e.stack || e)); R.push(false); }
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
