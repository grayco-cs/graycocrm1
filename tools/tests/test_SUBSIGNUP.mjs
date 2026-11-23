// test_SUBSIGNUP.mjs <build-dir> [--node-only] — SUBSIGNUP (owner 11/16: "didn't I have more approvals? I saw 2 new subs signed in to
// portal, I should have an approval for it"). Why there was none: a sub who signs up from a JOB INVITE is approved at once (they see that
// job) and no card was ever made for GrayCo; and the self sign-up cards were only on the desk ✅ Approvals tab of an admin — not in the
// APPROVE badge / To-Do chip / field My Approvals, and not for the office.
// Made-up subs, staff and jobs only; the REAL sign-up (subportal.js register) and the CRM side (portal-access.js s-sync / s-bids-approve)
// run in node on an in-memory Supabase; e-mails are counted, nothing leaves this computer. The browser part (offline harness) talks to them.
//  node:
//   1. a self sign-up → not approved → a card (s-sync bids); the staff e-mail says "Approve new sub";
//   2. an INVITED sign-up → approved for that job at once AND a card ("vet": GrayCo has not checked them); e-mail "Check new sub (job invite)";
//   3. invited sign-ups made before this change (since VET_SINCE, no bidsApprovedAt) get a card too; older ones / owner-approved ones do not;
//   4. the office approves the invited one → checked (vettedAt, bidsApprovedAt), stays approved, NO e-mail to the sub, card gone;
//   5. an admin approves the self sign-up → approved, the sub gets the approval e-mail, card gone;
//   6. ✕ Deny an invited one → access taken away (approved false, bidsRevoked), card gone;
//   7. a PM (not office / admin) cannot approve (403).
//  browser:
//   8. admin desk ✅ Approvals: "New sub signed up: <company> · trades · contact" rows (the invited one says "from a job invite — please
//      check") with ✅ Approve / ✕ Deny sign-up / 📋 Open / Review; no duplicate rows;
//   9. they count in the ONE approval set (APPROVE badge / To-Do chip) — "N new sub sign-ups";
//  10. 📋 Open shows the sheet (invited: "Joined from a job invite"); ✕ Deny sign-up → s-bids-approve approve:false; ✅ Approve → approve:true;
//  11. the office sees the cards too (and can approve); a PM does not; the field (phone) My Approvals lists them under "Other approvals".
import path from 'path'; import fs from 'fs'; import crypto from 'crypto'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), NODE_ONLY = process.argv.includes('--node-only');
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const now = () => new Date().toISOString();

/* ═════ the in-memory Supabase (sb.test) ═════ */
const ACC = {}, MAILS = [];
const TOK = { 'tok-owner': 'owner@graycotest.test', 'tok-office': 'desk@graycotest.test', 'tok-pm': 'pm@graycotest.test' };
const KV = { projects: [{ id: 'PJ1', name: 'Sample Clinic', address: '1 Sample St', pm: 'Sample PM', status: 'Active' }], vendors: [], invs: [],
  users: [{ id: 'u1', name: 'Sample Owner', email: 'owner@graycotest.test', role: 'Admin', active: true }, { id: 'u2', name: 'Sample Desk', email: 'desk@graycotest.test', role: 'Office Admin', active: true },
    { id: 'u3', name: 'Sample PM', email: 'pm@graycotest.test', role: 'Project Manager', active: true }], gc_automation_pause: { on: false } };
const T = { sp_rows: [], gc_staff: [{ email: 'owner@graycotest.test', name: 'Sample Owner', role: 'admin', active: true }, { email: 'desk@graycotest.test', name: 'Sample Desk', role: 'office', active: true }, { email: 'pm@graycotest.test', name: 'Sample PM', role: 'staff', active: true }] };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
globalThis.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { MAILS.push(JSON.parse(init.body)); return res(200, { id: 'm' + MAILS.length }); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); return TOK[a] ? res(200, { id: 'auth-' + a, email: TOK[a] }) : res(401, { msg: 'invalid JWT' }); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body); const e = String(b.email).toLowerCase(); if (ACC[e]) return res(422, { msg: 'already registered' }); ACC[e] = { id: 'auth-' + crypto.randomBytes(3).toString('hex') }; return res(200, { id: ACC[e].id, email: e }); }
  if (u.pathname.startsWith('/auth/v1/')) return res(200, {});
  if (u.pathname === '/rest/v1/gc_kv') {
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  if (u.pathname.startsWith('/storage/v1/')) return res(404, {});
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body), oc = q.get('on_conflict'); (Array.isArray(b) ? b : [b]).forEach(r => { const i = oc ? tb.findIndex(x => x[oc] === r[oc]) : (r.key ? tb.findIndex(x => x.key === r.key) : -1); if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > dv(v.slice(3)));
      else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k]) !== dv(v.slice(4)));
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
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're_test_only', OWNER_EMAILS: 'owner@graycotest.test', SUBPORTAL_NOTIFY: 'desk@graycotest.test', CUST_QUIET_OFF: '1' });
delete process.env.PORTAL_MAIL_OFF;
const FN = path.join(BUILD, 'netlify/functions');
const SPF = require(path.join(FN, 'subportal.js')), PA = require(path.join(FN, 'portal-access.js'));
const reset = () => { try { PA._core._reset(); } catch (e) {} };
let IPN = 0; const ip = () => '10.9.' + (IPN >> 8) + '.' + (IPN++ % 250);
const spf = async (action, body) => { const r = await SPF.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-nf-client-connection-ip': ip() }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { status: r.statusCode, data: JSON.parse(r.body || '{}') }; };
const pa = async (action, body, tok) => { reset(); const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-nf-client-connection-ip': ip(), authorization: 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { status: r.statusCode, data: JSON.parse(r.body || '{}') }; };
const profOf = e => (T.sp_rows.find(r => r.collection === 'users' && (r.email === e || (r.data || {}).email === e)) || {}).data;
const bids = async tok => ((await pa('s-sync', {}, tok)).data.bids || []);
const PROFILE = (co, tr) => ({ name: 'Sam ' + co.split(' ')[0], company: co, phone: '901-555-01' + String(10 + T.sp_rows.length).slice(-2), trades: tr, businessCity: 'Memphis', businessState: 'TN' });

/* 1. self sign-up */
let m0 = MAILS.length;
let r = await spf('register', { email: 'self@sample-paint.test', password: 'Sample-pass-1', profile: PROFILE('Sample Paint Co', ['Paint']) });
/* SIGNUPVERIFY (owner 11/23: "Yes subs should confirm their email"): the sign-up taps the link in its confirm e-mail first */
const svConfirm = async (email) => { const mm = MAILS.filter(x => (x.to || []).includes(email) && /signup-confirm=/.test(x.html)).slice(-1)[0]; return spf('signup-confirm', { token: mm ? decodeURIComponent(/signup-confirm=([A-Za-z0-9_%-]+)/.exec(mm.html)[1]) : '' }); };
const sv1 = await svConfirm('self@sample-paint.test');
ok('1a. a self sign-up: created, NOT approved (held until its e-mail is confirmed, then waits for GrayCo)', r.status === 200 && r.data.ok && r.data.verify === true && sv1.status === 200 && r.data.approved === false && profOf('self@sample-paint.test').approved === false, r);
ok('1b. the staff e-mail: "🔨 Approve new sub — Sample Paint Co" (to the office + the owners)', MAILS.slice(m0).some(x => /Approve new sub — Sample Paint Co/.test(x.subject) && x.to.includes('desk@graycotest.test')), MAILS.slice(m0).map(x => x.subject));
/* 2. invited sign-up */
const invTok = crypto.randomBytes(16).toString('hex');
T.sp_rows.push({ key: 'invites/i1', collection: 'invites', id: 'i1', job_id: 'J1', data: { id: 'i1', token: invTok, email: 'invited@sample-roof.test', jobId: 'J1' } });
m0 = MAILS.length;
r = await spf('register', { email: 'invited@sample-roof.test', password: 'Sample-pass-2', profile: PROFILE('Sample Roofing LLC', ['Roofing', 'Gutters']), invite: invTok, job: 'J1' });
const ip2 = profOf('invited@sample-roof.test');
ok('2a. an INVITED sign-up: approved for that job at once, and marked for GrayCo\'s check (vetPending)', r.status === 200 && r.data.approved === true && ip2.approved === true && ip2.vetPending === true && ip2.invitedJobId === 'J1', { r, ip2 });
ok('2b. the staff e-mail asks to check them: "🔨 Check new sub (job invite) — Sample Roofing LLC"', MAILS.slice(m0).some(x => /Check new sub \(job invite\) — Sample Roofing LLC/.test(x.subject) && /please check|Please check/i.test(x.html)), MAILS.slice(m0).map(x => x.subject));
/* 3. sign-ups made before this change */
const mk = (id, email, co, extra) => T.sp_rows.push({ key: 'users/' + id, collection: 'users', id, user_id: id, email, data: Object.assign({ id, email, username: email, role: 'sub', company: co, name: 'Old ' + co.split(' ')[0], trades: ['Drywall'] }, extra) });
mk('u_recentinv', 'recent@sample-dry.test', 'Sample Drywall Inc', { approved: true, invitedJobId: 'J0', createdAt: '2026-11-16T16:34:42.000Z' });
mk('u_oldinv', 'old@sample-old.test', 'Sample Old Framing', { approved: true, invitedJobId: 'J0', createdAt: '2026-10-01T10:00:00.000Z' });
mk('u_ownerok', 'ok@sample-ok.test', 'Sample Approved Tile', { approved: true, bidsApprovedAt: '2026-11-12T20:30:20.000Z', createdAt: '2026-11-12T19:00:00.000Z' });
mk('u_denied', 'no@sample-no.test', 'Sample Denied Co', { approved: false, bidsRevoked: true, createdAt: '2026-11-14T10:00:00.000Z' });
let B = await bids('tok-owner');
const ids = B.map(b => b.id), byMail = e => B.find(b => b.email === e) || {};
ok('3a. the cards (s-sync): the self sign-up, the invited one (vet), and the invited one from before this change (since 11/09)', !!byMail('self@sample-paint.test').id && byMail('self@sample-paint.test').vet === false && byMail('invited@sample-roof.test').vet === true && byMail('invited@sample-roof.test').invited === true && ids.includes('u_recentinv'), B.map(b => [b.id, b.vet, b.invited]));
ok('3a2. the card carries their trades (they were always dropped: the server\'s arr() kept objects only)', JSON.stringify(byMail('invited@sample-roof.test').trades) === '["Roofing","Gutters"]', byMail('invited@sample-roof.test').trades);
ok('3b. no card for an old invited sub (before 11/09), one the owner already approved, or a denied one', !ids.includes('u_oldinv') && !ids.includes('u_ownerok') && !ids.includes('u_denied'), ids);
ok('3c. the office gets the same cards', (await bids('tok-office')).length === B.length);
/* 4. the office checks the invited one */
m0 = MAILS.length;
r = await pa('s-bids-approve', { id: ip2.id, approve: true }, 'tok-office');
const ip2b = profOf('invited@sample-roof.test');
ok('4a. the office approves the invited one → checked (vettedAt, bidsApprovedAt by her), still approved', r.status === 200 && r.data.ok && r.data.checked === true && ip2b.approved === true && !!ip2b.vettedAt && !!ip2b.bidsApprovedAt && ip2b.vetPending === false && /Desk/.test(ip2b.vettedBy || ''), { r, ip2b });
ok('4b. no "you are approved" e-mail to an invited sub (they were already in)', !MAILS.slice(m0).some(x => (x.to || []).includes('invited@sample-roof.test')), MAILS.slice(m0).map(x => [x.to, x.subject]));
ok('4c. its card is gone', !(await bids('tok-owner')).some(b => b.id === ip2.id));
/* 5. the admin approves the self sign-up */
m0 = MAILS.length;
const sp1 = profOf('self@sample-paint.test');
r = await pa('s-bids-approve', { id: sp1.id, approve: true }, 'tok-owner');
ok('5a. the admin approves the self sign-up → approved; the sub gets the approval e-mail', r.status === 200 && profOf('self@sample-paint.test').approved === true && MAILS.slice(m0).some(x => (x.to || []).includes('self@sample-paint.test')), { r, m: MAILS.slice(m0).map(x => [x.to, x.subject]) });
ok('5b. its card is gone', !(await bids('tok-owner')).some(b => b.id === sp1.id));
/* 6. deny the older invited one */
r = await pa('s-bids-approve', { id: 'u_recentinv', approve: false }, 'tok-owner');
const dn = profOf('recent@sample-dry.test');
ok('6. ✕ Deny an invited one → access taken away (approved false, bidsRevoked), card gone', r.status === 200 && dn.approved === false && dn.bidsRevoked === true && !(await bids('tok-owner')).some(b => b.id === 'u_recentinv'), dn);
/* 7. a PM */
mk('u_pmtry', 'pmtry@sample-x.test', 'Sample X Co', { approved: false, createdAt: now() });
r = await pa('s-bids-approve', { id: 'u_pmtry', approve: true }, 'tok-pm');
ok('7. a PM (not office / admin) cannot approve a sign-up (403)', r.status === 403 && profOf('pmtry@sample-x.test').approved === false, r);

if (NODE_ONLY) { const n = R.filter(Boolean).length; console.log('SUBSIGNUP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1); }

/* ═════ the browser: the CRM with the same server ═════ */
const H = await import(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs');
const { sleep } = H;
H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'u3', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
H.cset('projects', [{ id: 'P1', name: 'Sample Clinic Remodel', client: 'Sample Health', address: '100 Sample St', status: 'active', autoPO: 'T101', pm: 'Demo PM', createdAt: now(), updatedAt: now() }]);
H.cset('gc_approval_queue', '[]');
/* the harness accounts are this server's staff too */
const HT = { 'wjohnson@grayco-cs.com': 'tok-h-admin', 'office@grayco-cs.com': 'tok-h-office', 'pm@grayco-cs.com': 'tok-h-pm' };
Object.keys(HT).forEach(e => { TOK[HT[e]] = e; });
T.gc_staff.push({ email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true }, { email: 'office@grayco-cs.com', name: 'Office Demo', role: 'office', active: true }, { email: 'pm@grayco-cs.com', name: 'Demo PM', role: 'staff', active: true });
KV.users = KV.users.concat([{ id: 'u5', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'u6', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
T.sp_rows = T.sp_rows.filter(r => r.id !== 'u_pmtry');   /* the node part's leftover */
mk('u_brow1', 'b1@sample-gutter.test', 'Sample Gutter Pros', { approved: false, createdAt: now(), trades: ['Gutters'], name: 'Gus Sample' });
mk('u_brow2', 'b2@sample-floor.test', 'Sample Flooring LLC', { approved: true, vetPending: true, invitedJobId: 'J1', createdAt: now(), trades: ['Flooring', 'Tile'], name: 'Flo Sample' });
const CALLS = [];
H.onFn('portal-access', async ({ body, A }) => {
  if (body && /^s-/.test(body.action || '')) { if (body.action === 's-bids-approve') CALLS.push(Object.assign({ who: A.name }, body)); const o = await pa(body.action, body, HT[A.name] || 'none'); return { status: o.status, body: o.data }; }
  return { ok: true };
});
H.onFn('bid-hub', async () => ({ ok: true, jobs: [], subs: [] }));
const errsOf = A => A.errs.filter(e => !/ResizeObserver|Script error/.test(e));
async function open(email, opt){
  const A = await H.computer(email, Object.assign({ build: BUILD }, opt || {})); A.acceptConfirm = true;
  await H.signIn(A, email, 20000); await sleep(6000);
  await A.ev(() => { try { window._gcSubsBids.sync(); } catch (e) {} try { window._gcBpAppr.refresh(); } catch (e) {} });
  return A;
}
const A = await open('wjohnson@grayco-cs.com');
await A.ev(() => window._setView('approvals'));
const rows = await H.waitFor(A, () => { const l = [...document.querySelectorAll('.apx-row[data-k^="bp:su:"]')].map(r => ({ k: r.getAttribute('data-k'), t: r.textContent.slice(0, 260), b: [...r.querySelectorAll('button')].map(b => b.textContent.trim()) })); return l.length >= 2 ? l : null; }, null, 40000);
const r1 = (rows || []).find(x => /u_brow1/.test(x.k)) || {}, r2 = (rows || []).find(x => /u_brow2/.test(x.k)) || {};
ok('8a. admin ✅ Approvals: "New sub signed up: Sample Gutter Pros · Gutters · Gus Sample"', /New sub signed up: Sample Gutter Pros · Gutters · Gus Sample/.test(r1.t || ''), rows);
ok('8b. the invited one: "New sub signed up: Sample Flooring LLC … from a job invite — please check"', /New sub signed up: Sample Flooring LLC · Flooring, Tile · Flo Sample · 📨 from a job invite — please check/.test(r2.t || ''), r2);
ok('8c. each card: ✅ Approve · ✕ Deny sign-up · 📋 Open / Review', ['Approve', 'Deny sign-up', 'Open / Review'].every(w => (r1.b || []).some(b => b.indexOf(w) >= 0)), r1.b);
const dupes = await A.ev(() => [...document.querySelectorAll('.apx-row')].filter(r => /bidsite_/.test(r.getAttribute('data-k') || '')).length);
ok('8d. no duplicate rows for them', dupes === 0, dupes);
const set = await A.ev(() => { try { window._gcApprovalSetFresh(); } catch (e) {} const s = window._gcApprovalSet(); return { total: s.total, tip: s.tip, other: (s.groups.other || []).filter(x => /^bidsite_/.test(x.id)).map(x => x.title) }; });
ok('9. they count in the ONE approval set (APPROVE badge / To-Do chip): 2 new sub sign-ups', set.other.length === 2 && set.total >= 2 && /2 new sub sign-ups/.test(set.tip), set);
await A.ev(() => [...document.querySelectorAll('.apx-row[data-k="bp:su:u_brow2"] button')].find(b => /Open/.test(b.textContent)).click());
const sh = await H.waitFor(A, () => { const m = document.getElementById('gcbpa-sheet'); return m ? m.innerText : null; }, null, 8000);
ok('10a. 📋 Open: the sheet says they joined from a job invite and what Approve / Deny do', !!sh && /Joined from a job invite/.test(sh) && /Deny = they lose access/.test(sh), sh);
await A.ev(() => { const m = document.getElementById('gcbpa-sheet'); if (m) m.remove(); });
await A.ev(() => [...document.querySelectorAll('.apx-row[data-k="bp:su:u_brow1"] button')].find(b => /Deny sign-up/.test(b.textContent)).click());
await H.waitFor(A, () => !document.querySelector('.apx-row[data-k="bp:su:u_brow1"]'), null, 15000);
ok('10b. ✕ Deny sign-up → s-bids-approve approve:false (the server took the access away)', CALLS.some(c => c.id === 'u_brow1' && c.approve === false) && profOf('b1@sample-gutter.test').bidsRevoked === true, CALLS);
/* the office */
const O = await open('office@grayco-cs.com');
await O.ev(() => window._setView('approvals'));
const orow = await H.waitFor(O, () => { const r = document.querySelector('.apx-row[data-k="bp:su:u_brow2"]'); return r ? [...r.querySelectorAll('button')].map(b => b.textContent.trim()) : null; }, null, 40000);
ok('11a. the office sees the invited sub\'s card', !!orow && orow.some(b => /Approve/.test(b)), orow);
if (orow) { await O.ev(() => [...document.querySelectorAll('.apx-row[data-k="bp:su:u_brow2"] button')].find(b => /^✅ Approve$/.test(b.textContent.trim())).click()); await sleep(1200); await O.ev(() => { const y = document.querySelector('[data-apx-conf="yes"]'); if (y) y.click(); }); }
await H.waitFor(O, () => !document.querySelector('.apx-row[data-k="bp:su:u_brow2"]'), null, 15000);
ok('11b. the office\'s ✅ Approve → checked on the server (vettedAt), still approved', CALLS.some(c => c.id === 'u_brow2' && c.approve === true && c.who === 'office@grayco-cs.com') && !!profOf('b2@sample-floor.test').vettedAt && profOf('b2@sample-floor.test').approved === true, CALLS);
/* a PM: none */
const P = await open('pm@grayco-cs.com');
mk('u_brow3', 'b3@sample-hvac.test', 'Sample HVAC Co', { approved: false, createdAt: now(), trades: ['HVAC'], name: 'Hal Sample' });
await P.ev(() => { try { window._gcSubsBids.sync(); } catch (e) {} }); await sleep(1500);
const prows = await P.ev(() => { const s = window._gcApprovalSet(); return { extra: window._gcBpAppr.rows().length, set: (s.groups.other || []).filter(x => /^bidsite_/.test(x.id)).length }; });
ok('11c. a PM gets no sign-up cards (tab or set)', prows.extra === 0 && prows.set === 0, prows);
/* the field (phone): My Approvals */
const F = await open('wjohnson@grayco-cs.com', { mobile: true });
const fset = await H.waitFor(F, () => { try { window._gcApprovalSetFresh(); } catch (e) {} const s = window._gcApprovalSet(); const o = (s.groups.other || []).filter(x => /^bidsite_/.test(x.id)); return o.length ? o.map(x => x.title) : null; }, null, 30000);
ok('11d. the field\'s approval set (APPROVE badge / My Approvals "Other approvals") has the waiting sign-up', !!fset && fset.some(t => /New sub signed up: Sample HVAC Co/.test(t)), fset);
await F.ev(() => { try { window._gcOpenPmApprovals(); } catch (e) {} });
const fm = await H.waitFor(F, () => { const b = document.querySelector('[data-gc-appr-other-box]'); return b && /New sub signed up: Sample HVAC Co/.test(b.textContent) ? true : null; }, null, 15000);
ok('11e. field My Approvals lists it under "Other approvals" (Open → the Approve / Deny sheet)', !!fm);
if (fm) { await F.ev(() => { const b = [...document.querySelectorAll('[data-gc-appr-other-box] [data-gc-appr-other] button')].find(x => /Open/.test(x.textContent)) || document.querySelector('[data-gc-appr-other-box] button[data-i]'); if (b) b.click(); }); }
ok('11f. Open from field My Approvals → the sheet', !!(await H.waitFor(F, () => !!document.getElementById('gcbpa-sheet'), null, 8000)));
ok('12. no page errors', ![A, O, P, F].some(x => errsOf(x).length), [A, O, P, F].map(errsOf));
await Promise.all([A, O, P, F].map(x => x.close()));
const n = R.filter(Boolean).length; console.log('SUBSIGNUP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
