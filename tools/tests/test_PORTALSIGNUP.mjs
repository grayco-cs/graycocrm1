// test_PORTALSIGNUP.mjs <build-dir> [shot-dir] [--no-browser] — patch PORTALSIGNUP (owner 11/23: "also be able to tell customers to sign up
// on portal.grayco-cs.com and their name will match to what we already have in our CRM system for their job address etc and that's a way they
// can sign up or we send them a link too, let them choose customer, subcontractor, supplier and other as choices").
// Offline: the REAL server functions (portal-access.js + _lib/portalsignup.js, portal.js's ✅ Approvals, subportal.js's register) on an
// in-memory Supabase (auth, PostgREST tables, gc_kv) and Resend — the world of test_PORTALTEAM.mjs. Made-up data only; nothing leaves the
// machine. Part B drives portal.html / portal-signup.js / portal-app.js in Chromium (phone 390 px, desk 1280 px); part C the CRM's
// gc-patch-portalsignup block on a stub page.
//  1. Customer: e-mail confirm first (one-time, 24 h; nothing before it)    2. a known e-mail → straight in (as sign-in does today)
//  3. name + address only → ✅ Approvals card (PM / office / admin; plain staff no) → Approve → access (that job only) + "connected" e-mail
//  4. "Not this job" → another job (office / admin) · ✖ Deny → no access, nothing sent      5. no match → office To-Do
//  6. nothing revealed (same answers)   7. Other → office To-Do   8. the staff link: name match → in; mismatch → card; tampered / expired
//  9. rate limits (address and e-mail)   10. Sub / Supplier → the existing sign-up (register + its e-mail confirm)   11. remove access, records kept
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'));
const BUILD = path.resolve(ARGS[0] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
const SHOTS = ARGS[1] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const NO_BROWSER = process.argv.includes('--no-browser');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
setTimeout(() => { console.log('FAIL watchdog: the run took over 9 minutes (a page or the browser stopped answering)'); process.exit(2); }, 540e3).unref();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(150); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're_test', CUST_QUIET_OFF: '1', PORTAL_BASE_URL: 'https://portal.test' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.OWNER_EMAILS; delete process.env.STAFF_EMAILS; delete process.env.TWILIO_ACCOUNT_SID;
const now = () => new Date().toISOString();

/* ═════ a made-up world ═════ */
const JA = { id: 'PJA', name: 'Sample Kitchen Remodel', address: '123 Maple Street, Memphis, TN 38104', client: 'Jordan Sample', clientEmail: 'jordan@samplehome.test', clientPhone: '901-555-0111', pm: 'Sample PM', autoPO: 'PO-7781', status: 'Active', projectType: 'Residential' };
const JA2 = { id: 'PJA2', name: 'Sample Fence', address: '700 Cedar Ave, Memphis, TN 38104', client: 'Jordan Sample', clientEmail: 'jordan@samplehome.test', pm: 'Sample PM', status: 'Active', projectType: 'Residential' };
const JB = { id: 'PJB', name: 'Sample Roof', address: '45 Oak Lane, Memphis, TN 38117', client: 'Riley Example', clientEmail: 'riley@examplehome.test', pm: 'Sample PM', autoPO: 'PO-5512', status: 'Active', projectType: 'Residential' };
const JC = { id: 'PJC', name: 'Sample Deck', address: '9 Birch Court, Memphis, TN 38120', client: 'Casey Neighbor', clientEmail: 'casey@neighborhome.test', pm: 'Other PM', status: 'Active', projectType: 'Residential' };
const SUB1 = { id: 'SUBacme', name: 'Acme Drywall LLC', company: 'Acme Drywall LLC', contact: 'Bo Boss', email: 'boss@acmedrywall.test', phone: '901-555-0101', isSub: true, trade: 'Drywall' };
let AUTH, TOK, T, KV, MAIL;
function fresh(){
  AUTH = {};
  TOK = { 'tok-admin': 'owner@grayco.test', 'tok-office': 'office@grayco.test', 'tok-pm': 'pm@grayco.test', 'tok-pm2': 'pm2@grayco.test', 'tok-staff': 'crew@grayco.test' };
  KV = { vendors: [SUB1], projects: [JA, JA2, JB, JC], customers: [{ id: 'C1', name: 'Jordan Sample', firstName: 'Jordan', email: 'jordan@samplehome.test', phone: '901-555-0111' }, { id: 'C2', name: 'Riley Example', email: 'riley@examplehome.test' }],
    users: [{ id: 'u1', name: 'Sample PM', email: 'pm@grayco.test', role: 'Project Manager', active: true }, { id: 'u2', name: 'Ofelia Office', email: 'office@grayco.test', role: 'Office Manager', active: true },
      { id: 'u3', name: 'Other PM', email: 'pm2@grayco.test', role: 'Project Manager', active: true }, { id: 'u4', name: 'Cal Crew', email: 'crew@grayco.test', role: 'Field', active: true }, { id: 'u5', name: 'Owen Owner', email: 'owner@grayco.test', role: 'admin', active: true }],
    gc_sub_portal_settings: { deviceCode: 'off' } };
  T = { gc_portal_session: [], gc_portal_code: [], gc_portal_lock: [], gc_portal_login: [], gc_sub_device: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [],
    gc_sub_link: [{ token: 'a'.repeat(43), sub_id: SUB1.id, revoked: false, created_at: now() }],
    gc_portal: [{ token: 'k'.repeat(43), project_id: JA.id, revoked: false }, { token: 'f'.repeat(43), project_id: JA2.id, revoked: false }, { token: 'r'.repeat(43), project_id: JB.id, revoked: false }, { token: 'd'.repeat(43), project_id: JC.id, revoked: false }],
    gc_staff: [{ email: 'owner@grayco.test', name: 'Owen Owner', role: 'admin', active: true }, { email: 'office@grayco.test', name: 'Ofelia Office', role: 'office', active: true },
      { email: 'pm@grayco.test', name: 'Sample PM', role: 'staff', profile: 'pm', active: true }, { email: 'pm2@grayco.test', name: 'Other PM', role: 'staff', profile: 'pm', active: true }, { email: 'crew@grayco.test', name: 'Cal Crew', role: 'staff', active: true }],
    sp_rows: [] };
  MAIL = [];
}
fresh();
const res = (status, body, hd) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => (hd || {})[String(k).toLowerCase()] || null }, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { const b = JSON.parse(init.body); MAIL.push(b); return res(200, { id: 'mail-' + MAIL.length }); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); return TOK[a] ? res(200, { id: (AUTH[TOK[a]] || {}).id || 'auth-staff-' + TOK[a], email: TOK[a] }) : res(401, { msg: 'invalid JWT' }); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body), e = String(b.email).toLowerCase(); if (AUTH[e]) return res(422, { msg: 'A user with this email address has already been registered' }); AUTH[e] = { id: 'auth-' + crypto.randomBytes(3).toString('hex'), pw: b.password }; return res(200, { id: AUTH[e].id, email: e }); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'GET') return res(200, { users: [] });
  if (u.pathname.startsWith('/auth/v1/admin/users/')) return res(200, {});
  if (u.pathname === '/auth/v1/admin/generate_link') return res(404, { msg: 'User not found' });
  if (u.pathname === '/auth/v1/token') return res(400, { error: 'invalid_grant' });
  if (u.pathname === '/rest/v1/gc_kv') {
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  if (u.pathname.startsWith('/storage/v1/')) return res(200, []);
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body), oc = q.get('on_conflict'); (Array.isArray(b) ? b : [b]).forEach(r => { const i = oc ? tb.findIndex(x => x[oc] === r[oc]) : (r.key ? tb.findIndex(x => x.key === r.key) : -1); if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
      else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k]) !== dv(v.slice(4)));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > dv(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    return res(200, rows);
  }
  return res(404, {});
};
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const SPF = require(path.join(BUILD, 'netlify/functions/subportal.js'));
const PJ = require(path.join(BUILD, 'netlify/functions/portal.js'));
const SU = require(path.join(BUILD, 'netlify/functions/_lib/portalsignup.js'));
const reset = () => { try { PA._core._reset(); } catch (e) {} };
let IPN = 0; const ipNext = () => '10.' + (1 + (IPN >> 8) % 200) + '.' + (IPN++ % 250) + '.9';
const raw = async (fn, body, headers, ip) => { const r = await fn.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': ip || ipNext() }, headers || {}), body: JSON.stringify(body) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { st: r.statusCode, b: j }; };
const call = async (fn, body, headers) => { reset(); return raw(fn, body, headers); };
const pa = (action, body, headers) => call(PA, Object.assign({ action }, body || {}), headers);
const pas = (sess, action, body) => pa(action, body, { 'x-portal-session': sess });
const st = (tok, action, body) => pa(action, body, { authorization: 'Bearer ' + tok });
const rows = () => { const v = KV.gc_portal_signups; return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const queue = () => { const v = KV.gc_approval_queue; return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const todos = () => { const v = KV.gc_office_tasks; return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const rowOf = email => rows().filter(x => x.email === email).slice(-1)[0];
const confirmTok = email => { const mm = MAIL.filter(x => (x.to || []).includes(email) && /signup-confirm=/.test(x.html)).slice(-1)[0]; return mm ? decodeURIComponent((/signup-confirm=([A-Za-z0-9_%-]+)/.exec(mm.html) || [])[1] || '') : ''; };
const start = (o) => pa('su-start', Object.assign({ kind: 'customer', phone: '901-555-0199' }, o));
const confirm = email => pa('su-confirm', { token: confirmTok(email) });
const codeSignin = async (who) => {
  const n0 = MAIL.length; await pa('signin-start', { who });
  const mm = MAIL.slice(n0).find(x => /code/i.test(x.subject) && (x.to || []).length);
  const code = mm && (/(\d{6})/.exec(String(mm.html).replace(/<[^>]+>/g, ' ')) || [])[1];
  if (!code) return { st: 0, b: {}, nomail: true };
  return pa('signin-verify', { who, code });
};
const jobsOf = async sess => { const j = await pas(sess, 'c-jobs'); return (j.b.jobs || []).map(x => x.id).sort(); };
const PROJ0 = JSON.stringify(KV.projects), CUST0 = JSON.stringify(KV.customers);
const LEAKS = /bids?\.grayco|bid site|subcontract|sub portal|SUBacme|Acme/i;

/* ═══ 1. Customer: the e-mail is confirmed first ═══ */
{
  const n0 = MAIL.length;
  const r = await start({ name: 'Jordan Sample', email: 'jordan@samplehome.test', address: '123 Maple St' });
  const row = rowOf('jordan@samplehome.test'), tok = confirmTok('jordan@samplehome.test'), mm = MAIL.slice(n0)[0] || {};
  ok('1 su-start → "check your e-mail" (verify) — no session, nothing else', r.st === 200 && r.b.ok && r.b.verify === true && !r.b.session && /Check your e-mail/.test(r.b.message), r);
  ok('1 … one e-mail to that address with a one-time confirm button (portal.test/?signup-confirm=…)', MAIL.length - n0 === 1 && (mm.to || []).join() === 'jordan@samplehome.test' && /Confirm your e-mail/.test(mm.subject) && /https:\/\/portal\.test\/\?signup-confirm=/.test(mm.html) && !!tok, MAIL.slice(n0).map(x => x.subject));
  ok('1 … only the SHA-256 of the code is kept (24 h), the row says unconfirmed', row && row.status === 'unconfirmed' && /^[0-9a-f]{64}$/.test(row.verifyHash) && Date.parse(row.verifyExp) - Date.now() > 23.9 * 3600e3 && JSON.stringify(rows()).indexOf(tok) < 0, row);
  const bad = await pa('su-confirm', { token: 'x'.repeat(43) });
  ok('1 a wrong confirm code → 400, nothing happens', bad.st === 400 && rowOf('jordan@samplehome.test').status === 'unconfirmed', bad);
}

/* ═══ 2. a known e-mail → straight in (same as sign-in today) ═══ */
let jordanS = '';
{
  const c = await confirm('jordan@samplehome.test');
  jordanS = c.b.session;
  ok('2 confirm (their e-mail is on the job) → signed in at once, kind customer', c.st === 200 && c.b.ok && c.b.in === true && c.b.kind === 'customer' && !!jordanS, c);
  ok('2 … the same jobs sign-in gives them today (both of Jordan\'s jobs)', JSON.stringify(await jobsOf(jordanS)) === JSON.stringify(['PJA', 'PJA2']), await jobsOf(jordanS));
  const again = await pa('su-confirm', { token: confirmTok('jordan@samplehome.test') });
  ok('2 the confirm link works once (a second tap → 400)', again.st === 400 && !again.b.session, again);
}

/* ═══ 3. name + address only → the ✅ Approvals card; approve → access ═══ */
const NEW1 = 'jordan.spouse@freemail.test';
let card1 = null;
{
  const s0 = await start({ name: 'Jordan Sample', email: NEW1, address: '123 Maple St', zip: '38104' });
  const c = await confirm(NEW1);
  card1 = queue().find(x => x.kind === 'portal_signup' && x.meta && x.meta.signupId === rowOf(NEW1).id);
  ok('3 name + address, e-mail NOT on the job → not let in: "Thanks — GrayCo will connect your account…"', c.st === 200 && c.b.ok && !c.b.in && !c.b.session && /GrayCo will connect your account to your job, usually within one business day/.test(c.b.message), c);
  ok('3 … a ✅ Approvals card for the job\'s PM (and the office / admins): "<name> asks for portal access to <job> (<address>) — matched by name + address"', !!card1 && card1.jobId === 'PJA' && card1.pmEmail === 'pm@grayco.test' && card1.status === 'waiting'
    && /^Jordan Sample asks for portal access to Sample Kitchen Remodel \(123 Maple Street, Memphis, TN 38104\) — matched by name \+ address/.test(card1.title), card1);
  ok('3 … the card shows the evidence (typed vs CRM: name, address; e-mail confirmed, phone not)', /name: &quot;Jordan Sample&quot;/.test(card1.html) && /address: &quot;123 Maple St 38104&quot;/.test(card1.html) && /\(confirmed\)/.test(card1.html) && /not confirmed/.test(card1.html), card1 && card1.html);
  const pre = await codeSignin(NEW1);
  ok('3 before anyone approves: no sign-in for that e-mail (no code goes out)', pre.nomail === true, pre);
  const g = await st('tok-office', 's-su-get', { id: card1.id });
  ok('3 the office opens the card: what they typed, the job, the evidence (name + address)', g.st === 200 && g.b.signup.email === NEW1 && g.b.job.id === 'PJA' && g.b.evidence.some(w => w.k === 'name') && g.b.evidence.some(w => w.k === 'address') && g.b.canMove === true, g.b);
  const plain = await st('tok-staff', 's-su-decide', { id: card1.id, op: 'approve' });
  const other = await st('tok-pm2', 's-su-decide', { id: card1.id, op: 'approve' });
  ok('3 gate by role: plain staff and another job\'s PM cannot approve (403)', plain.st === 403 && other.st === 403 && queue().find(x => x.id === card1.id).status === 'waiting', { plain, other });
  const n0 = MAIL.length;
  const ap = await st('tok-pm', 's-su-decide', { id: card1.id, op: 'approve' });
  const mail = MAIL.slice(n0).find(x => (x.to || []).includes(NEW1));
  ok('3 the job\'s PM approves → sent; the person gets "Your GrayCo Portal is ready" (the PM\'s click sent it)', ap.st === 200 && ap.b.ok && queue().find(x => x.id === card1.id).status === 'sent' && !!mail && /ready/.test(mail.subject), { ap, subj: mail && mail.subject });
  const r1 = rowOf(NEW1);
  ok('3 … their e-mail + mobile are an extra portal contact on THAT job (grant kept on the sign-up row: who / when)', r1.status === 'granted' && r1.grant.pid === 'PJA' && r1.grant.keys.join() === 'e:' + NEW1 + ',p:9015550199' && r1.grant.by && r1.grant.by.email === 'pm@grayco.test', r1);
  ok('3 … nothing on the job or the customer record was changed (a person\'s typed values stay)', JSON.stringify(KV.projects) === PROJ0 && JSON.stringify(KV.customers) === CUST0);
  const si = await codeSignin(NEW1);
  ok('3 now they sign in with a code to their own e-mail → only that job (not Jordan\'s other job)', si.st === 200 && si.b.kind === 'customer' && JSON.stringify(await jobsOf(si.b.session)) === '["PJA"]', { si, jobs: si.b.session ? await jobsOf(si.b.session) : null });
  const pw = await pas(si.b.session, 'c-password', { password: 'Spouse-Pass-1' });
  const pl = await pa('signin-password', { email: NEW1, password: 'Spouse-Pass-1' });
  const st1 = await pa('signin-password', { email: NEW1, password: 'Jordan' });
  ok('3 … and can pick their own password (the job customer\'s first-name starter is not theirs)', pw.st === 200 && pl.st === 200 && pl.b.kind === 'customer' && st1.st === 401, { pw, pl, st1 });
}

/* ═══ 4. "Not this job" → another job (office) · ✖ Deny ═══ */
{
  await start({ name: 'Riley Example', email: 'riley.alt@freemail.test', address: '45 Oak Ln' }); await confirm('riley.alt@freemail.test');
  const c4 = queue().find(x => x.meta && x.meta.signupId === rowOf('riley.alt@freemail.test').id);
  ok('4 another name + address → card on Riley\'s job', !!c4 && c4.jobId === 'PJB', c4);
  const pmMove = await st('tok-pm', 's-su-decide', { id: c4.id, op: 'move', pid: 'PJC' });
  ok('4 the PM cannot pick another job (office / admin only — 403)', pmMove.st === 403, pmMove);
  const mv = await st('tok-office', 's-su-decide', { id: c4.id, op: 'move', pid: 'PJC' });
  const r4 = rowOf('riley.alt@freemail.test'), it4 = queue().find(x => x.id === c4.id);
  ok('4 the office: Not this job → picks Sample Deck → approved for THAT job', mv.st === 200 && mv.b.ok && mv.b.moved && r4.status === 'granted' && r4.grant.pid === 'PJC' && it4.jobId === 'PJC' && it4.meta.movedFrom === 'PJB', { mv, r4 });
  const si = await codeSignin('riley.alt@freemail.test');
  ok('4 … they get the job the office picked, not the first match', si.st === 200 && JSON.stringify(await jobsOf(si.b.session)) === '["PJC"]');
  await start({ name: 'Riley Example', email: 'riley.fake@freemail.test', address: '45 Oak Lane' }); await confirm('riley.fake@freemail.test');
  const c5 = queue().find(x => x.meta && x.meta.signupId === rowOf('riley.fake@freemail.test').id);
  const n0 = MAIL.length;
  const dn = await st('tok-office', 's-su-decide', { id: c5.id, op: 'deny' });
  const r5 = rowOf('riley.fake@freemail.test');
  ok('4 ✖ Deny → the card is closed (not approved), the sign-up says denied (who / when), nothing is e-mailed', dn.st === 200 && queue().find(x => x.id === c5.id).status === 'rejected' && r5.status === 'denied' && r5.decidedBy.email === 'office@grayco.test' && MAIL.length === n0, { dn, r5 });
  ok('4 … and they have no access', (await codeSignin('riley.fake@freemail.test')).nomail === true);
  const late = await st('tok-office', 's-su-decide', { id: c5.id, op: 'approve' });
  ok('4 a decided card cannot be approved afterwards (409)', late.st === 409, late);
}

/* ═══ 5. no match → office To-Do; 6. nothing revealed ═══ */
{
  await start({ name: 'Pat Nobody', email: 'pat@nowhere.test', address: '1 Nowhere Road', zip: '38111', po: 'PO-0000', contractName: 'Pat Nobody' });
  const c = await confirm('pat@nowhere.test');
  const td = todos().find(x => x.id === 'psu_' + rowOf('pat@nowhere.test').id);
  ok('5 no job matches → an office To-Do with everything they typed (and how to connect them)', !!td && /no job match: Pat Nobody/.test(td.label) && /1 Nowhere Road 38111/.test(td.note) && /PO-0000/.test(td.note) && /🔗 Portal sign-up link/.test(td.note), td);
  ok('5 … no ✅ Approvals card for it', !queue().some(x => x.meta && x.meta.signupId === rowOf('pat@nowhere.test').id));
  const cardAns = JSON.parse(JSON.stringify((await (async () => { await start({ name: 'Jordan Sample', email: 'j3@freemail.test', address: '123 Maple Street' }); return confirm('j3@freemail.test'); })()).b));
  ok('6 the person cannot tell a card from "no match": the same answer (no job, name or address in it)', JSON.stringify(c.b) === JSON.stringify(cardAns) && !/Maple|Kitchen|Jordan|PJA/.test(JSON.stringify(c.b)), { c: c.b, cardAns });
  const a1 = await start({ name: 'Any One', email: 'known.check@freemail.test', address: '123 Maple Street' });
  const a2 = await start({ name: 'Any One', email: 'unknown.check@freemail.test', address: '999 Nothing Blvd' });
  ok('6 su-start answers the same whether the name / address exist or not', a1.st === a2.st && JSON.stringify(a1.b) === JSON.stringify(a2.b), { a1, a2 });
  const v1 = await start({ name: '', email: 'x@freemail.test', address: '1 A St' });
  ok('6 a missing field → a plain "enter your name" (nothing about any job)', v1.st === 400 && /Enter your name/.test(v1.b.error), v1);
  ok('6 nothing a customer sees in this run mentions subs / bids', [a1, a2, c, cardAns].every(x => !LEAKS.test(JSON.stringify(x))));
}

/* ═══ 7. Other ═══ */
{
  const r = await pa('su-start', { kind: 'other', name: 'Val Vendor', email: 'val@othercorp.test', phone: '', message: 'We sell dumpsters — who do I talk to?' });
  ok('7 Other: name, e-mail, message → "check your e-mail" first', r.st === 200 && r.b.verify === true, r);
  ok('7 … nothing reaches the office before the confirm', !todos().some(x => /Val Vendor/.test(x.label)));
  const c = await confirm('val@othercorp.test');
  const td = todos().find(x => /Portal sign-up \(Other\): Val Vendor/.test(x.label));
  ok('7 confirmed → an office To-Do with the message; they see "GrayCo got your message"', c.st === 200 && c.b.done && /got your message/.test(c.b.message) && !!td && /dumpsters/.test(td.note), { c, td });
  const nm = await pa('su-start', { kind: 'other', name: 'Val', email: 'val2@othercorp.test' });
  ok('7 Other needs a message (400)', nm.st === 400, nm);
}

/* ═══ 8. the staff link ═══ */
let LINK = '';
{
  const no = await pa('s-su-link', { projectId: 'PJB' });
  ok('8 the sign-up link needs a GrayCo sign-in (401 without one)', no.st === 401, no);
  const l = await st('tok-pm', 's-su-link', { projectId: 'PJB' });
  LINK = l.b.url || '';
  const tok = (/[?&]job=([^&]+)/.exec(LINK) || [])[1] || '';
  ok('8 🔗 Portal sign-up link: portal.test/?signup=customer&job=<signed token>, 30 days, with a ready message (sent only by a person)', l.st === 200 && /^https:\/\/portal\.test\/\?signup=customer&job=v1\./.test(LINK) && Date.parse(l.b.expires) - Date.now() > 29 * 86400e3 && l.b.message.indexOf(LINK) > -1 && l.b.email === 'riley@examplehome.test', l.b);
  ok('8 … the token is signed and names only that job', SU.linkRead({ hmac: PA._core.hmac }, decodeURIComponent(tok)).pid === 'PJB');
  const n0 = MAIL.length;
  ok('8 … making the link sent nothing', MAIL.length === n0);
  await start({ name: 'Riley Example', email: 'riley.link@freemail.test', address: 'my house', job: decodeURIComponent(tok) });
  const c = await confirm('riley.link@freemail.test');
  ok('8 through the link + the name matches → let straight in, to THAT job only', c.st === 200 && c.b.in && JSON.stringify(await jobsOf(c.b.session)) === '["PJB"]', c);
  const rl = rowOf('riley.link@freemail.test');
  ok('8 … recorded as a grant by the link (e-mail only — their phone was not checked)', rl.status === 'granted' && rl.grant.via === 'link-name' && rl.grant.keys.join() === 'e:riley.link@freemail.test', rl);
  await start({ name: 'Sam Stranger', email: 'sam.stranger@freemail.test', address: 'somewhere', job: decodeURIComponent(tok) });
  const c2 = await confirm('sam.stranger@freemail.test');
  const cd = queue().find(x => x.meta && x.meta.signupId === rowOf('sam.stranger@freemail.test').id);
  ok('8 through the link but the name does not match → NOT in; a ✅ Approvals card on that job', c2.st === 200 && !c2.b.in && /GrayCo will connect/.test(c2.b.message) && !!cd && cd.jobId === 'PJB' && /sign-up link for this job, but the name does not match/.test(cd.title), { c2, cd: cd && cd.title });
  const t = decodeURIComponent(tok), bad = t.slice(0, -1) + (t.slice(-1) === 'a' ? 'b' : 'a');
  await start({ name: 'Riley Example', email: 'riley.tamper@freemail.test', address: 'somewhere', job: bad });
  const c3 = await confirm('riley.tamper@freemail.test');
  ok('8 a tampered link → ignored (no access; no job named by it — here: no match → To-Do)', c3.st === 200 && !c3.b.in && rowOf('riley.tamper@freemail.test').link.bad === 'bad' && rowOf('riley.tamper@freemail.test').status === 'todo', rowOf('riley.tamper@freemail.test'));
  const pidB = Buffer.from('PJA').toString('base64url'), forged = t.replace(/^v1\.[^.]+\./, 'v1.' + pidB + '.');
  await start({ name: 'Jordan Sample', email: 'jordan.forge@freemail.test', address: 'x', job: forged });
  const c3b = await confirm('jordan.forge@freemail.test');
  ok('8 a link re-pointed at another job (signature no longer fits) → no access', !c3b.b.in && rowOf('jordan.forge@freemail.test').link.bad === 'bad', rowOf('jordan.forge@freemail.test'));
  const expired = SU.linkMakeToken({ hmac: PA._core.hmac }, 'PJB', -1);
  await start({ name: 'Riley Example', email: 'riley.expired@freemail.test', address: 'somewhere', job: expired });
  const c4 = await confirm('riley.expired@freemail.test');
  ok('8 an expired link → no access (recorded as expired)', !c4.b.in && rowOf('riley.expired@freemail.test').link.bad === 'expired', rowOf('riley.expired@freemail.test'));
  const lst = await st('tok-office', 's-su-link', { projectId: 'PJB' });
  ok('8 the job\'s strip lists its portal sign-ups (let in, waiting …) and the office may remove access', lst.b.signups.some(x => x.email === 'riley.link@freemail.test' && x.status === 'granted') && lst.b.signups.some(x => x.status === 'approval') && lst.b.canRemove === true, lst.b.signups);
}

/* ═══ 9. rate limits ═══ */
{
  reset();
  const IP = '10.250.250.250', outs = [];
  for (let i = 0; i < 7; i++) outs.push((await raw(PA, { action: 'su-start', kind: 'customer', name: 'Rate Test', email: 'rate' + i + '@freemail.test', phone: '9015550100', address: '1 Rate St' }, {}, IP)).st);
  ok('9 one address: 6 sign-ups per 10 minutes, then 429', outs.slice(0, 6).every(x => x === 200) && outs[6] === 429, outs);
  const n0 = MAIL.length, E = 'same.person@freemail.test', ans = [];
  for (let i = 0; i < 4; i++) { const r = await start({ name: 'Same Person', email: E, address: '1 Same St' }); ans.push(JSON.stringify(r.b)); }
  const sent = MAIL.slice(n0).filter(x => (x.to || []).includes(E)).length;
  ok('9 one e-mail: one confirm e-mail a minute, 3 sign-ups an hour — the answer never changes', sent === 1 && rows().filter(x => x.email === E).length <= 3 && new Set(ans).size === 1, { sent, rowsN: rows().filter(x => x.email === E).length });
  reset();
  const cf = []; for (let i = 0; i < 12; i++) cf.push((await raw(PA, { action: 'su-confirm', token: crypto.randomBytes(32).toString('base64url') }, {}, '10.251.0.1')).st);
  ok('9 guessing confirm codes from one address → 429 after 10 wrong', cf.slice(0, 10).every(x => x === 400) && cf.slice(10).every(x => x === 429), cf);
  /* an expired confirm code */
  await start({ name: 'Late Larry', email: 'late@freemail.test', address: '1 Late St' });
  const tk = confirmTok('late@freemail.test'), all = rows(); all.find(x => x.email === 'late@freemail.test').verifyExp = new Date(Date.now() - 1000).toISOString(); KV.gc_portal_signups = JSON.stringify(all);
  const ex = await pa('su-confirm', { token: tk });
  ok('9 a confirm code older than 24 h → 410 "has run out"', ex.st === 410 && /run out/.test(ex.b.error), ex);
}

/* ═══ 10. Sub / Supplier → the existing sign-up ═══ */
{
  const sub = await call(SPF, { action: 'register', email: 'new.sub@newframing.test', password: 'Good-Pass-1111', profile: { name: 'Nia New', company: 'New Framing Co', phone: '901-555-0444', trades: ['Framing'] } });
  const sup = await call(SPF, { action: 'register', email: 'new.supplier@newlumber.test', password: 'Good-Pass-1111', profile: { name: 'Sol Supply', company: 'New Lumber Yard', phone: '901-555-0555', trades: ['Lumber'], acctType: 'supplier' } });
  const pf = e => (T.sp_rows.find(r => r.collection === 'users' && r.email === e) || {}).data || {};
  ok('10 Subcontractor → the bid site\'s register: a sub account, held until its e-mail is confirmed (SIGNUPVERIFY)', sub.st === 200 && sub.b.verify === true && pf('new.sub@newframing.test').role === 'sub' && pf('new.sub@newframing.test').emailUnverified === true, sub);
  ok('10 Supplier → the same register as a SUPPLIER account (acctType), held until confirmed', sup.st === 200 && sup.b.verify === true && pf('new.supplier@newlumber.test').role === 'supplier' && pf('new.supplier@newlumber.test').emailUnverified === true, sup);
  ok('10 … nothing of theirs went into the customer sign-ups', !rows().some(x => /newframing|newlumber/.test(x.email)));
  const app = fs.readFileSync(path.join(BUILD, 'portal-app.js'), 'utf8');
  ok('10 the portal\'s supplier choice passes acctType through the existing form (one marked line in portal-app.js)', /acctType: opts\.acctType === 'supplier' \? 'supplier' : undefined \} \};\s+\/\* PORTALSIGNUP/.test(app));
}

/* ═══ 11. remove access (archived) ═══ */
{
  const n = rowOf(NEW1);
  const pm = await st('tok-pm', 's-su-remove', { id: n.id });
  ok('11 🗄 Remove access: not for a PM (office / admin — 403)', pm.st === 403, pm);
  const sessBefore = T.gc_portal_session.filter(x => x.kind === 'customer' && !x.revoked && x.ident === PA._core.hmac('e:' + NEW1)).length;
  const rm = await st('tok-office', 's-su-remove', { id: n.id });
  const after = rowOf(NEW1);
  ok('11 the office removes it → kept on record (removed, by whom, when), their devices signed out', rm.st === 200 && after.status === 'removed' && after.removedBy.email === 'office@grayco.test' && !!after.removedAt && after.grant.pid === 'PJA' && sessBefore > 0
    && T.gc_portal_session.filter(x => x.kind === 'customer' && !x.revoked && x.ident === PA._core.hmac('e:' + NEW1)).length === 0, { rm, after, sessBefore });
  ok('11 … and they can no longer sign in to that job', (await codeSignin(NEW1)).nomail === true);
  ok('11 the job and customer records are untouched by the whole run', JSON.stringify(KV.projects) === PROJ0 && JSON.stringify(KV.customers) === CUST0);
}

/* ═══ B. the pages (Chromium) — phone and desk ═══ */
if (!NO_BROWSER) {
  const PW_MOD = process.env.NODE_PATH && fs.existsSync(path.join(process.env.NODE_PATH.split(':')[0], 'playwright')) ? path.join(process.env.NODE_PATH.split(':')[0], 'playwright') : 'playwright';
  const { chromium } = require(PW_MOD);
  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const errs = [], bad = [], REQ = [];
  async function ctxOf(w, hgt, mobile){
    const ctx = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: w, height: hgt }, isMobile: mobile, hasTouch: mobile });
    await ctx.route('**/*', async r => {
      const rq = r.request(), u = new URL(rq.url());
      if (u.host !== 'portal.test') return r.abort('blockedbyclient');
      const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
      if (fm) {
        const fn = fm[1] === 'portal-access' ? PA : fm[1] === 'subportal' ? SPF : fm[1] === 'portal' ? PJ : null;
        if (!fn) return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
        reset(); try { REQ.push(JSON.parse(rq.postData() || '{}')); } catch (e) {}
        const resp = await fn.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': ipNext() }, rq.headers()), body: rq.postData() || '' });
        if (resp.statusCode >= 500) bad.push(fm[1] + ' → ' + resp.statusCode + ' ' + String(resp.body).slice(0, 160));
        return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
      }
      const f = path.join(BUILD, u.pathname === '/' ? 'portal.html' : decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
      return r.fulfill({ status: 404, body: '' });
    });
    return ctx;
  }
  const page = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); p.on('dialog', d => { errs.push('a pop-up: ' + d.message()); d.dismiss(); }); return p; };
  const txt = (p, sel) => p.textContent(sel || 'body').catch(() => '');
  const wide = async (p, w, tag, what) => { const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok('B ' + tag + ': ' + what + ' — no sideways scroll (' + w + ' px)', sw <= w, sw); };
  const ageRows = () => { const l = rows(); l.forEach(x => { x.createdAt = x.mailedAt = new Date(Date.now() - 2 * 3600e3).toISOString(); }); KV.gc_portal_signups = JSON.stringify(l); };   /* the per-e-mail limit is tested in 9 */
  for (const [w, hgt, mob, tag] of [[390, 844, true, 'phone'], [1280, 900, false, 'desk']]) {
    ageRows();
    const ctx = await ctxOf(w, hgt, mob), p = await page(ctx);
    await p.goto('https://portal.test/');
    await p.waitForSelector('#siNewHere', { timeout: 20000 });
    ok('B ' + tag + ': the sign-in page has "✨ New here? Sign up" (the old buttons stay)', /New here\? Sign up/.test(await txt(p, '#siNewHere')) && !!(await p.$('#siLogin')) && !!(await p.$('#siSignup')));
    await p.click('#siNewHere');
    await p.waitForSelector('#suChoose');
    const kinds = await p.$$eval('#suChoose [data-su-kind]', b => b.map(x => x.getAttribute('data-su-kind') + '=' + x.textContent));
    ok('B ' + tag + ': "I am a:" 🏠 Customer · 🔨 Subcontractor · 🧱 Supplier · ✉️ Other', JSON.stringify(kinds) === JSON.stringify(['customer=🏠 Customer', 'sub=🔨 Subcontractor', 'supplier=🧱 Supplier', 'other=✉️ Other']), kinds);
    await wide(p, w, tag, 'the chooser');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'portalsignup_choose_' + tag + '.png'), fullPage: true }).catch(() => {});
    /* Customer: a name + address match → the card answer */
    await p.click('[data-su-kind=customer]'); await p.waitForSelector('#su2Cust');
    await p.click('#su2Go');
    ok('B ' + tag + ': the customer form asks for name, e-mail, mobile, job address (inline message, no pop-up)', /Please fill in: Your name, E-mail, Mobile number, Job address/.test(await txt(p, '#su2Err')), await txt(p, '#su2Err'));
    const E = 'browser.' + tag + '@freemail.test';
    await p.fill('#su2_name', 'Jordan Sample'); await p.fill('#su2_email', E); await p.fill('#su2_phone', '901-555-0177'); await p.fill('#su2_address', '123 Maple Street'); await p.fill('#su2_zip', '38104'); await p.fill('#su2_po', 'PO-7781');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'portalsignup_customer_' + tag + '.png'), fullPage: true }).catch(() => {});
    await wide(p, w, tag, 'the customer form');
    await p.click('#su2Go');
    await p.waitForSelector('#su2Check', { timeout: 15000 });
    ok('B ' + tag + ': → "✉️ Check your e-mail" with Send it again', /Check your e-mail/.test(await txt(p, '#su2Check')) && !!(await p.$('#su2Again')));
    const tk = confirmTok(E);
    await p.goto('https://portal.test/?signup-confirm=' + encodeURIComponent(tk));
    await p.waitForSelector('#su2Confirm', { timeout: 15000 });
    ok('B ' + tag + ': opening the e-mail\'s link confirms nothing by itself (a button to tap)', rowOf(E).status === 'unconfirmed');
    await p.click('#su2Confirm');
    await p.waitForSelector('#su2Done', { timeout: 15000 });
    const dm = await txt(p, '#su2Done');
    ok('B ' + tag + ': confirmed → "Thanks — GrayCo will connect your account to your job, usually within one business day." (no job named)', /GrayCo will connect your account to your job, usually within one business day/.test(dm) && !/Maple|Kitchen/.test(dm) && /matched by name \+ address \+ PO/.test((queue().find(x => x.meta && x.meta.signupId === rowOf(E).id) || {}).title || ''), dm);
    ok('B ' + tag + ': … the address bar no longer carries the code', !/signup-confirm/.test(p.url()), p.url());
    /* a known e-mail: straight into the customer portal */
    const K = 'riley@examplehome.test';
    await p.goto('https://portal.test/?signup=customer'); await p.waitForSelector('#su2Cust');
    await p.fill('#su2_name', 'Riley Example'); await p.fill('#su2_email', K); await p.fill('#su2_phone', '901-555-0188'); await p.fill('#su2_address', '45 Oak Lane');
    MAIL.length = 0; await p.click('#su2Go'); await p.waitForSelector('#su2Check');
    await p.goto('https://portal.test/?signup-confirm=' + encodeURIComponent(confirmTok(K))); await p.waitForSelector('#su2Confirm'); await p.click('#su2Confirm');
    const inPortal = await waitFor(async () => /Sample Roof/.test(await txt(p)) && !(await p.$('#su2Conf')), 20000);
    ok('B ' + tag + ': a customer whose e-mail is on the job → straight into their portal (Sample Roof)', !!inPortal, (await txt(p)).slice(0, 300));
    { const body = await p.evaluate(() => document.body.innerText), lk = LEAKS.exec(body); ok('B ' + tag + ': … no sub / bid words on the customer\'s pages', !lk, lk && body.slice(Math.max(0, lk.index - 120), lk.index + 60)); }
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'portalsignup_in_' + tag + '.png'), fullPage: true }).catch(() => {});
    await ctx.close();
    /* the staff link */
    const c2 = await ctxOf(w, hgt, mob), q = await page(c2);
    await q.goto(LINK); await q.waitForSelector('#su2LinkNote', { timeout: 20000 });
    ok('B ' + tag + ': the CRM\'s link opens the customer form tied to the job (no job details shown)', /GrayCo sent you this link/.test(await txt(q, '#su2LinkNote')) && !/Oak|Roof|Riley/.test(await txt(q, '#su2Cust')));
    await q.fill('#su2_name', 'Riley Example'); const LE = 'riley.page.' + tag + '@freemail.test'; await q.fill('#su2_email', LE); await q.fill('#su2_phone', '9015550166'); await q.fill('#su2_address', 'home');
    await q.click('#su2Go'); await q.waitForSelector('#su2Check');
    await q.goto('https://portal.test/?signup-confirm=' + encodeURIComponent(confirmTok(LE))); await q.waitForSelector('#su2Confirm'); await q.click('#su2Confirm');
    ok('B ' + tag + ': link + matching name → straight in to that job', !!(await waitFor(async () => /Sample Roof/.test(await txt(q)) && !(await q.$('#su2Conf')), 20000)) && rowOf(LE).grant.pid === 'PJB');
    await c2.close();
    /* Other */
    const c3 = await ctxOf(w, hgt, mob), o = await page(c3);
    await o.goto('https://portal.test/'); await o.waitForSelector('#siNewHere'); await o.click('#siNewHere'); await o.click('[data-su-kind=other]');
    await o.waitForSelector('#su2Other');
    const OE = 'other.' + tag + '@othercorp.test';
    await o.fill('#su2_name', 'Olive Other'); await o.fill('#su2_email', OE); await o.fill('#su2_message', 'Question about a warranty');
    await o.click('#su2Go'); await o.waitForSelector('#su2Check');
    await o.goto('https://portal.test/?signup-confirm=' + encodeURIComponent(confirmTok(OE))); await o.waitForSelector('#su2Confirm'); await o.click('#su2Confirm');
    await o.waitForSelector('#su2Done');
    ok('B ' + tag + ': ✉️ Other → check e-mail → confirmed → "GrayCo got your message" + an office To-Do', /got your message/.test(await txt(o, '#su2Done')) && todos().some(x => /Olive Other/.test(x.label)));
    await wide(o, w, tag, 'the Other page');
    /* Subcontractor and Supplier → the existing sign-up */
    await o.goto('https://portal.test/'); await o.waitForSelector('#siNewHere'); await o.click('#siNewHere'); await o.click('[data-su-kind=sub]');
    await o.waitForSelector('#signupBox', { timeout: 20000 });
    ok('B ' + tag + ': 🔨 Subcontractor → the existing sub sign-up form (trades, papers)', !!(await o.$('#suTrades')) && !!(await o.$('#suPapers')) && (await o.getAttribute('#signupBox', 'data-acct')) === null);
    await o.click('#suBack'); await o.waitForSelector('#siNewHere'); await o.click('#siNewHere'); await o.click('[data-su-kind=supplier]');
    await o.waitForSelector('#signupBox[data-acct=supplier]', { timeout: 20000 });
    ok('B ' + tag + ': 🧱 Supplier → the same form as a supplier sign-up', /Supplier sign-up/.test(await txt(o, '#signupBox h2')));
    const SE = 'supplier.' + tag + '@newlumber.test';
    await o.fill('#su_company', tag === 'phone' ? 'Pine Lumber Yard' : 'Oak Supply House'); await o.fill('#su_name', 'Sam Supplier'); await o.fill('#su_email', SE); await o.fill('#su_phone', tag === 'phone' ? '901-555-0123' : '901-555-0124'); await o.fill('#su_city', 'Memphis'); await o.fill('#su_state', 'TN');
    await o.fill('#su_tradeOther', 'Lumber'); await o.fill('#su_pw', 'Good-Pass-1111'); await o.fill('#su_pw2', 'Good-Pass-1111'); await o.check('#su_agree');
    REQ.length = 0; await o.click('#suGo');
    await o.waitForSelector('#svCheck', { timeout: 20000 });
    const rq = REQ.find(x => x.action === 'register');
    const prof = (T.sp_rows.find(r => r.collection === 'users' && r.email === SE) || {}).data || {};
    ok('B ' + tag + ': … it registers a SUPPLIER account and asks them to confirm their e-mail (the existing SIGNUPVERIFY step)', !!rq && rq.profile.acctType === 'supplier' && prof.role === 'supplier' && prof.emailUnverified === true, { rq: rq && rq.profile, role: prof.role });
    if (SHOTS) await o.screenshot({ path: path.join(SHOTS, 'portalsignup_supplier_' + tag + '.png'), fullPage: true }).catch(() => {});
    await c3.close();
  }
  /* C. the CRM: the job's 🏠 Portal card strip + the ✅ Approvals card (the real gc-patch-portalsignup block on a stub page) */
  {
    const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
    const blk = (/<script id="gc-patch-portalsignup">[\s\S]*?<\/script>/.exec(html) || [''])[0];
    ok('C index.html carries the block, and "portal_signup" is an office kind (the CRM copy of _lib/office-kinds.js)', !!blk && /"preq_decline","portal_signup"\]/.test(html));
    await start({ name: 'Riley Example', email: 'riley.crm@freemail.test', address: '45 Oak Lane' }); await confirm('riley.crm@freemail.test');
    const cardC = queue().find(x => x.meta && x.meta.signupId === rowOf('riley.crm@freemail.test').id);
    await start({ name: 'Riley Example', email: 'riley.crm2@freemail.test', address: '45 Oak Lane' }); await confirm('riley.crm2@freemail.test');
    const cardD = queue().find(x => x.meta && x.meta.signupId === rowOf('riley.crm2@freemail.test').id);
    for (const [w, tag, tokn] of [[390, 'phone', 'tok-pm'], [1280, 'desk', 'tok-office']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 500, hasTouch: w < 500 });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://crm.test' }).catch(() => {});
      await ctx.route('**/*', async rt => {
        const rq = rt.request(), u = new URL(rq.url());
        if (u.pathname === '/.netlify/functions/portal-access') { reset(); if (process.env.SU_DEBUG) console.log('CRM →', rq.postData()); const out = await PA.handler({ httpMethod: 'POST', headers: Object.assign({ 'x-nf-client-connection-ip': ipNext() }, rq.headers()), body: rq.postData() || '' }); if (process.env.SU_DEBUG) console.log('CRM ←', out.statusCode, String(out.body).slice(0, 300)); if (out.statusCode >= 500) bad.push('portal-access ' + out.body); return rt.fulfill({ status: out.statusCode, contentType: 'application/json', body: out.body }); }
        if (u.pathname === '/') return rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:8px">'
          + '<div class="gcq-card" data-pid="PJB" style="border:1px solid #ccc;padding:8px"><div data-row="1"><b>🏠 Portal</b></div></div>'
          + '<div class="_ap2Card" data-id="' + (tag === 'phone' ? cardC.id : cardD.id) + '" style="border:1px solid #ccc;padding:8px;margin-top:10px"><b>' + (tag === 'phone' ? cardC.title : cardD.title).replace(/</g, '&lt;') + '</b><button class="_ap2Yes">Approve</button><button class="_ap2No">Don’t approve</button></div>'
          + '<script>window.__GC_AUTH__ = { fresh: function(){ return Promise.resolve({ access_token: "' + tokn + '" }); } }; window._crm = { projects: ' + JSON.stringify(KV.projects) + ' };</script>' + blk + '</body></html>' });
        return rt.abort('blockedbyclient');
      });
      const p = await ctx.newPage(); p.on('pageerror', e => errs.push('crm: ' + String(e.message).slice(0, 200))); p.on('dialog', d => { errs.push('crm pop-up: ' + d.message()); d.dismiss(); });
      await p.goto('http://crm.test/');
      await p.waitForSelector('.gcq-card .gcps-strip [data-gcps=link]', { timeout: 10000 });
      await p.click('[data-gcps=link]');
      await p.waitForSelector('[data-gcps-url]', { timeout: 10000 });
      const url = await p.inputValue('[data-gcps-url]'), mail = await p.getAttribute('[data-gcps=mail]', 'href'), sms = await p.getAttribute('[data-gcps=sms]', 'href');
      ok('C ' + tag + ': 🔗 Portal sign-up link on the job\'s 🏠 Portal card → the signed link, 📋 Copy · ✉️ E-mail it (mailto: the customer) · 💬 Text it (sms:)', /^https:\/\/portal\.test\/\?signup=customer&job=v1\./.test(url) && /^mailto:riley@examplehome\.test\?/.test(mail) && /^sms:/.test(sms) && mail.indexOf(encodeURIComponent(url)) > -1, { url, mail, sms });
      const n0 = MAIL.length;
      await p.click('[data-gcps=copy]');
      ok('C ' + tag + ': Copy says copied; nothing is e-mailed or texted by the page itself', !!(await waitFor(async () => /copied|Could not copy/i.test(await txt(p, '.gcps-strip')))) && MAIL.length === n0);
      ok('C ' + tag + ': the strip lists this job\'s sign-ups (let in / waiting)', /PORTAL SIGN-UPS FOR THIS JOB/.test(await txt(p, '.gcps-strip')) && /let in/.test(await txt(p, '.gcps-strip')));
      /* the approvals card */
      await p.waitForSelector('.gcps-card [data-gcps-c=approve]', { timeout: 10000 });
      const ct = await txt(p, '.gcps-card');
      ok('C ' + tag + ': the ✅ Approvals card shows what they typed, the job and what matched; the default Approve / Don\'t approve are replaced', /They typed/.test(ct) && /Sample Roof/.test(ct) && /✓ Name/.test(ct) && /✓ Address/.test(ct) && !(await p.isVisible('._ap2Yes')) && !(await p.isVisible('._ap2No')), ct);
      if (tag === 'phone') {
        await p.click('[data-gcps-c=approve]');
        ok('C phone: the job\'s PM taps ✅ Approve — let them in → approved (granted to the job)', !!(await waitFor(async () => rowOf('riley.crm@freemail.test').status === 'granted' && /Approved/.test(await txt(p, '.gcps-card')), 30000)), await txt(p, '.gcps-card'));
      } else {
        await p.click('[data-gcps-c=other]');
        await p.fill('[data-gcps-q]', 'Birch');
        await p.waitForSelector('[data-gcps-c=move][data-pid=PJC]', { timeout: 5000 });
        await p.click('[data-gcps-c=move][data-pid=PJC]');
        ok('C desk: the office taps ↪ Not this job → finds "Birch" → links them to Sample Deck', !!(await waitFor(async () => (rowOf('riley.crm2@freemail.test') || {}).status === 'granted')) && rowOf('riley.crm2@freemail.test').grant.pid === 'PJC', rowOf('riley.crm2@freemail.test'));
      }
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      ok('C ' + tag + ': fits (' + w + ' px, no sideways scroll)', sw <= w + 1, sw);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'portalsignup_crm_' + tag + '.png'), fullPage: true }).catch(() => {});
      await ctx.close();
    }
  }
  ok('B no page errors, no pop-ups', errs.length === 0, errs);
  ok('B no server 5xx', bad.length === 0, bad);
  await browser.close();
}

const n = R.length, f = R.filter(x => !x).length;
console.log('\nPORTALSIGNUP ' + (n - f) + '/' + n + ' passed' + (f ? ' — ' + f + ' FAILED' : ''));
process.exit(f ? 1 : 0);
