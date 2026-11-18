// test_SUP1099.mjs <build-dir> — patch SUP1099 (owner 11/18: "We are hiring a 1099 superintendent … should we make him a 1099
// superintendent profile that has superintendent stuff so he can use our app?" — BOTH: a GrayCo Field sign-in with the Superintendent
// role + a linked sub portal account for his W-9, COI and invoices). Made-up people and data only.
//  N. server (node, the REAL portal-access.js on an in-memory Supabase): his linked Subs record (staff1099) signs in to the sub portal
//     with the same e-mail (his password, or a code), lists the job he is superintendent on (not others), takes his W-9 / COI / agreement
//     and an invoice on that job (no photo gate); a plain sub gets nothing new; nothing CRM-only in his answers.
//  B. the CRM (Chromium, the offline harness): an admin sets a new Superintendent as 1099 → a Subs record is linked (by e-mail) and its
//     sub portal link turned on; the profile's 🧾 Contractor paperwork card; his papers + invoice filed from the sub portal → the card,
//     ✅ Approvals (sub invoice for the PM) and job cost; paid → "paid this year" and the 1099 report; payroll skips him.
//  P. on a phone, the 1099 superintendent: the superintendent Field tools, no payroll / pay stub / call in sick / time off / commission,
//     🚧 Can't make it today → the job's PM + the admins; his punch is hours on site (payroll: false).
//  W. W-2 staff unchanged: a W-2 superintendent keeps Time off / Call in sick and an ordinary punch; editing a W-2 person writes no
//     employment field, makes no Subs record.
// Usage: node test_SUP1099.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; SUP_PART=N|B to run one part)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module'; import { pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
const PART = process.env.SUP_PART || 'all';
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) pass++; else fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + n + (!c && i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();
const YEAR = String(new Date().getFullYear());
const SUP = 'sam.super@sample-gc.test', OWN = 'olive.owner@sample-gc.test', PM = 'pat.pm@sample-gc.test', W2S = 'wade.wtwo@sample-gc.test';
const PDF = Buffer.from('%PDF-1.4\n% sample W-9\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
const PDF2 = Buffer.from('%PDF-1.4\n% sample COI\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
const PDF3 = Buffer.from('%PDF-1.4\n% sample agreement\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
const PDF4 = Buffer.from('%PDF-1.4\n% sample invoice\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
const JOB_SUP = { id: 'PC', po: 'PO-2002', name: 'Sample Office TI', client: 'Sample GC Inc.', address: '12 Sample Pkwy, Somerville TN', type: 'Commercial TI', pm: 'Pat PM', superintendent: 'Sam Super', status: 'Active', contract: 120000, contractSigned: true, claimNumber: 'CLM-SECRET-9', subs: [{ subId: 'SUBdry', name: 'Sample Drywall LLC', status: 'Awarded' }] };
const JOB_OTHER = { id: 'PR', po: 'PO-2003', name: 'Sample Roof', client: 'Sample Homeowner', address: '9 Demo Ln', type: 'Roofing', pm: 'Pat PM', superintendent: 'Wade Wtwo', status: 'Active', contract: 18000, contractSigned: true, subs: [] };
let EVENTS = [];   /* what the sub portal stored (part N) — the CRM files these in part B */

/* ═════════════ N. the server ═════════════ */
if (PART === 'all' || PART === 'N') {
  console.log('N. sub portal server (portal-access.js)');
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're_test', CUST_QUIET_OFF: '1', OWNER_EMAILS: OWN });
  delete process.env.PORTAL_MAIL_OFF;
  const SUBREC = { id: 'SUB1099sam', name: 'Sam Super', company: 'Sam Super', contact: 'Sam Super', email: SUP, phone: '901-555-0199', isSub: true, staff1099: true, staffUserId: 'u9', staffName: 'Sam Super', trade: 'Superintendent (1099)', source: '1099 staff' };
  const DRY = { id: 'SUBdry', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Dee Dry', email: 'dee@sampledrywall.test', phone: '901-555-0141', isSub: true, trade: 'Drywall' };
  const LOOK = { id: 'SUBlook', name: 'Sam Super Look-alike LLC', company: 'Sam Super Look-alike LLC', contact: 'Sam Super', email: 'look@alike.test', phone: '901-555-0177', isSub: true, trade: 'Paint' };
  const KV = { vendors: [SUBREC, DRY, LOOK], projects: [JOB_SUP, JOB_OTHER], users: [{ id: 'u9', name: 'Sam Super', email: SUP, role: 'Superintendent', employment: '1099', active: true, payType: '' }, { id: 'u3', name: 'Pat PM', email: PM, role: 'Project Manager', active: true, payType: 'revenue_pct', commPct: 5 }],
    gc_sub_portal_settings: { deviceCode: 'off', invPhotoMin: 5 }, invs: [], schedule: [], punch: [] };
  const AUTH = [{ id: 'auth-sam', email: SUP, pw: 'Crm-Pass-123' }];
  const T = { gc_sub_link: [{ token: 'S'.repeat(43), sub_id: SUBREC.id, sub_name: SUBREC.name, revoked: false, created_at: now() }, { token: 'D'.repeat(43), sub_id: DRY.id, sub_name: DRY.name, revoked: false, created_at: now() }, { token: 'K'.repeat(43), sub_id: LOOK.id, sub_name: LOOK.name, revoked: false, created_at: now() }],
    gc_portal_session: [], gc_sub_device: [], gc_portal_code: [], gc_portal_lock: [], gc_portal_login: [], gc_portal: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], sp_rows: [], gc_staff: [] };
  const MAIL = [], STORED = [];
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
  const dv = v => decodeURIComponent(String(v || ''));
  const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
  global.fetch = async (url, init) => {
    init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
    if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'em' + MAIL.length }); }
    if (u.host !== 'sb.test') return res(404, {});
    if (u.pathname === '/auth/v1/token') { const b = JSON.parse(init.body); const a = AUTH.find(x => x.email === String(b.email).toLowerCase()); return a && a.pw === b.password ? res(200, { access_token: 'tok-' + a.id, user: { id: a.id, email: a.email } }) : res(400, { error: 'invalid_grant' }); }
    if (u.pathname === '/auth/v1/user') return res(401, {});
    if (u.pathname.startsWith('/storage/v1/object/sign/')) return res(200, []);
    if (u.pathname.startsWith('/storage/v1/object/')) { STORED.push(u.pathname); return res(200, { Key: u.pathname }); }
    if (u.pathname === '/rest/v1/gc_kv') {
      if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
      const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
      return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
    }
    const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    if (tm) {
      const tb = T[tm[1]] || (T[tm[1]] = []);
      if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const key = r.key || r.id || r.token; const i = key ? tb.findIndex(x => (x.key || x.id || x.token) === key) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
      let rows = tb.slice();
      for (const [k, v] of q.entries()) {
        if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
        if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
        else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k]) !== dv(v.slice(4)));
        else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
        else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k] || '') > dv(v.slice(3)));
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
  let IP = 0;
  const pa = async (body, headers) => { try { PA._core && PA._core._reset && PA._core._reset(); } catch (e) {} const r = await PA.handler({ httpMethod: 'POST', headers: Object.assign({ 'x-nf-client-connection-ip': '10.7.' + (IP++ % 250) + '.1' }, headers || {}), body: JSON.stringify(body) }); return { st: r.statusCode, b: JSON.parse(r.body || '{}'), raw: r.body || '' }; };
  const sessFor = sid => { const tk = crypto.randomBytes(32).toString('base64url'); T.gc_portal_session.push({ id: crypto.createHash('sha256').update(tk).digest('hex'), kind: 'partner', ident: null, sub_id: sid, links: T.gc_sub_link.filter(l => l.sub_id === sid).map(l => l.token), created_at: now(), expires_at: new Date(Date.now() + 864e5).toISOString(), revoked: false }); return tk; };

  let r = await pa({ action: 'signin-password', email: SUP, password: 'Crm-Pass-123' });
  ok('N1 he signs in to the sub portal with the SAME e-mail (and his password) → his linked Subs record', r.st === 200 && r.b.kind === 'partner' && !!r.b.session && T.gc_portal_session.some(x => x.sub_id === SUBREC.id && !x.revoked), r.b);
  const SESS = r.b.session;
  const codes0 = T.gc_portal_code.length, mail0 = MAIL.length;
  r = await pa({ action: 'signin-start', who: SUP });
  ok('N1 …or with a 6-digit code to that e-mail', r.st === 200 && T.gc_portal_code.length === codes0 + 1 && T.gc_portal_code[T.gc_portal_code.length - 1].sub_id === SUBREC.id && MAIL.slice(mail0).some(x => [].concat(x.to).includes(SUP)), { st: r.st, codes: T.gc_portal_code.length, mail: MAIL.length });
  r = await pa({ action: 'p-home' }, { 'x-portal-session': SESS });
  const H0 = r.b;
  ok('N2 his sub portal home lists the job he is superintendent on — and no other job', r.st === 200 && Array.isArray(H0.jobs) && H0.jobs.length === 1 && H0.jobs[0].id === 'PC', H0.jobs);
  ok('N2 the job as any sub sees it (name, address, PM) — no contract price, claim number, payroll, pay type or staff fields', !!H0.jobs[0] && H0.jobs[0].pm && H0.jobs[0].pm.name === 'Pat PM'
    && !/120000|CLM-SECRET|payroll|payType|employment|staffUserId|staff1099|commPct|revenue_pct/.test(r.raw), r.raw.match(/120000|CLM-SECRET|payroll|payType|employment|staffUserId|staff1099|commPct|revenue_pct/));
  ok('N2 needs: his W-9 (not on file yet)', Array.isArray(H0.needs) && H0.needs.some(x => x.kind === 'w9') && H0.papers && H0.papers.w9 && H0.papers.w9.onFile === false, H0.needs);
  const LS = sessFor(LOOK.id);
  r = await pa({ action: 'p-home' }, { 'x-portal-session': LS });
  ok('N3 a plain sub whose contact has the same name gets NO superintendent job (only a linked 1099 staff record does)', r.st === 200 && Array.isArray(r.b.jobs) && r.b.jobs.length === 0, r.b.jobs);
  const DS = sessFor(DRY.id);
  r = await pa({ action: 'p-home' }, { 'x-portal-session': DS });
  ok('N3 the job\'s own sub keeps exactly what it had (its job by the job\'s sub list)', r.st === 200 && r.b.jobs.length === 1 && r.b.jobs[0].id === 'PC', r.b.jobs);
  const up = async (data, name) => (await pa({ action: 'p-upload', data, name, purpose: 'paper' }, { 'x-portal-session': SESS })).b.id;
  const u1 = await up(PDF, 'W-9 Sam Super.pdf');
  r = await pa({ action: 'p-paper', paper: 'w9', uploadId: u1 }, { 'x-portal-session': SESS });
  const r2 = await pa({ action: 'p-paper', paper: 'coi', uploadId: await up(PDF2, 'COI.pdf'), exp: '2027-06-30' }, { 'x-portal-session': SESS });
  const r3 = await pa({ action: 'p-paper', paper: 'agreement', uploadId: await up(PDF3, 'Contractor agreement signed.pdf') }, { 'x-portal-session': SESS });
  const papers = T.gc_sub_event.filter(e => e.kind === 'paper' && e.sub_id === SUBREC.id);
  ok('N4 he uploads his W-9, his COI (with its expiry) and his signed contractor agreement in the sub portal', r.st === 200 && r2.st === 200 && r3.st === 200 && papers.length === 3
    && papers.some(e => e.data.paper === 'w9') && papers.some(e => e.data.paper === 'coi' && e.data.exp === '2027-06-30') && papers.some(e => e.data.paper === 'agreement') && papers.every(e => (e.data.files || []).length === 1), { r: r.b, r2: r2.b, r3: r3.b, papers: papers.map(e => e.data) });
  r = await pa({ action: 'p-invoice', projectId: 'PC', amount: 2400, invNum: 'SS-001', uploadId: await up(PDF4, 'Invoice SS-001.pdf'), note: 'Supervision week 1 + receipts' }, { 'x-portal-session': SESS });
  const inv = T.gc_sub_event.filter(e => e.kind === 'invoice' && e.sub_id === SUBREC.id);
  ok('N5 his invoice on the job he supervises goes in (no "add photos first" gate — his job photos are in GrayCo Field)', r.st === 200 && /^SPI_/.test(r.b.id) && inv.length === 1 && inv[0].project_id === 'PC' && inv[0].data.amount === 2400 && inv[0].data.invNum === 'SS-001', r.b);
  r = await pa({ action: 'p-invoice', projectId: 'PR', amount: 100 }, { 'x-portal-session': SESS });
  ok('N5 an invoice on a job that is not his → refused', r.st === 404 || r.st === 403, r);
  r = await pa({ action: 'p-invoice', projectId: 'PC', amount: 100 }, { 'x-portal-session': DS });
  ok('N5 a plain sub still meets the photo rule (unchanged)', r.st === 409 && /photo/i.test(r.b.error || ''), r.b);
  r = await pa({ action: 'p-home' }, { 'x-portal-session': SESS });
  ok('N6 his home shows the invoice as submitted', r.st === 200 && r.b.invoices.some(x => x.number === 'SS-001' && x.state === 'submitted' && x.amount === 2400) && r.b.money.submitted === 2400, r.b.invoices);
  EVENTS = T.gc_sub_event.filter(e => e.sub_id === SUBREC.id && (e.kind === 'paper' || e.kind === 'invoice')).map(e => Object.assign({}, e, { applied_at: null }));
  ok('N7 nothing a sub sends writes the CRM\'s lists from the server (the CRM files the events itself)', JSON.stringify(KV.vendors) === JSON.stringify([SUBREC, DRY, LOOK]) && KV.invs.length === 0);
}

/* ═════════════ B / P / W. the CRM in a browser ═════════════ */
if (PART === 'all' || PART === 'B') {
  const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
  const H = await import(pathToFileURL(HARNESS).href);
  const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/sup1099/';
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
  H.ACCOUNTS[OWN] = { id: 'u-olive', name: 'Olive Owner', role: 'admin' };
  H.ACCOUNTS[PM] = { id: 'u-patpm', name: 'Pat PM', role: 'staff' };
  H.ACCOUNTS[SUP] = { id: 'u-samsup', name: 'Sam Super', role: 'staff' };
  H.ACCOUNTS[W2S] = { id: 'u-wadew', name: 'Wade Wtwo', role: 'staff' };
  if (!EVENTS.length) {   /* SUP_PART=B alone: the same events part N makes */
    const f = (n, ref) => [{ ref: 'sb:crm-files/' + crypto.createHash('sha256').update(n).digest('hex') + '.pdf', name: n, type: 'application/pdf' }];
    EVENTS = [
      { id: 'Ew9', kind: 'paper', project_id: null, sub_id: 'X', data: { paper: 'w9', exp: '', files: f('W-9 Sam Super.pdf') }, created_at: now(), applied_at: null },
      { id: 'Ecoi', kind: 'paper', project_id: null, sub_id: 'X', data: { paper: 'coi', exp: '2027-06-30', files: f('COI.pdf') }, created_at: now(), applied_at: null },
      { id: 'Eagr', kind: 'paper', project_id: null, sub_id: 'X', data: { paper: 'agreement', exp: '', files: f('Contractor agreement signed.pdf') }, created_at: now(), applied_at: null },
      { id: 'Einv', kind: 'invoice', project_id: 'PC', sub_id: 'X', data: { subName: 'Sam Super', invId: 'SPI_Einv', amount: 2400, po: 'PO-2002', invNum: 'SS-001', note: 'Supervision week 1 + receipts', recvDate: now().slice(0, 10), payDate: '', files: f('Invoice SS-001.pdf') }, created_at: now(), applied_at: null }];
  }
  H.resetCloud();
  const USERS0 = [
    { id: 'u1', name: 'Olive Owner', email: OWN, role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
    { id: 'u3', name: 'Pat PM', email: PM, role: 'Project Manager', active: true, phone: '9015550111', payType: 'revenue_pct', commPct: 5, title: 'PM' },
    { id: 'u9', name: 'Sam Super', email: SUP, role: 'Superintendent', active: true, phone: '9015550199', title: 'Superintendent', hireDate: '2026-11-18' },
    { id: 'u7', name: 'Wade Wtwo', email: W2S, role: 'Superintendent', active: true, phone: '9015550177', payType: 'hourly', hourlyRate: '30' },
    { id: 'u8', name: 'Cora Contract', email: 'cora.contract@sample-gc.test', role: 'Field Supervisor', employment: '1099', active: true, phone: '9015550166' }];
  H.cset('users', USERS0);
  H.cset('projects', [JOB_SUP, Object.assign({}, JOB_OTHER)]);
  H.cset('vendors', [{ id: 'SUBdry', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Dee Dry', email: 'dee@sampledrywall.test', phone: '901-555-0141', isSub: true, trade: 'Drywall', w9: true, insExp: '2027-01-01' }]);
  H.cset('invs', []); H.cset('timesheets', []); H.cset('punch', []); H.cset('projectDocs', []); H.cset('expenses', []);
  const PORTAL = [], NOTIFY = [];
  H.onFn('portal-access', ({ body }) => {
    PORTAL.push(body);
    if (body.action === 's-link') return { ok: true, active: true, url: 'https://portal.example.test/#t=' + 'L'.repeat(43) };
    if (body.action === 's-sync') { const evs = EVENTS.filter(e => EV_ON && !e.applied_at).map(e => Object.assign({}, e, { sub_id: SUBID || e.sub_id })); return { ok: true, events: evs, unread: {}, links: {}, waiting: [], bids: [], codes: [], admin: true, me: 'Olive Owner', at: now() }; }
    if (body.action === 's-ack') { (body.ids || []).forEach(id => { const e = EVENTS.find(x => x.id === id); if (e) e.applied_at = now(); }); return { ok: true, acked: (body.ids || []).length }; }
    return { ok: true };
  });
  H.onFn('appr-away', ({ body }) => { if (body && body.op === 'notify') NOTIFY.push(body); return { ok: true, pushed: 1 }; });
  let SUBID = '', EV_ON = false;
  const W = [];
  const HJS = () => {
    window.__vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 1 && r.height > 1 && st.visibility !== 'hidden' && st.display !== 'none' && !!e.offsetParent; };
    window.__setV = (el, v) => { const P = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(P, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.__btn = (re, root) => [...(root || document).querySelectorAll('button')].filter(__vis).find(b => new RegExp(re).test((b.innerText || '').trim()));
    window.__row = name => [...document.querySelectorAll('#root tr')].filter(__vis).find(tr => (tr.innerText || '').includes(name));
  };
  async function desk(email, who){
    const c = await H.computer(who, { build: BUILD, init: [() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} }] }); W.push(c);
    await H.signIn(c, email, 9000);
    await H.waitFor(c, () => !!(window._setView && window._crm && (window._crm.users || []).length >= 5 && (window._crm.projects || []).length >= 2), null, 60000);
    await sleep(3000); await c.ev(HJS);
    return c;
  }
  async function openEmployees(c, name){
    return c.ev(async name => {
      try { window._gcRA && window._gcRA.hide && window._gcRA.hide(); } catch (e) {}
      window._setView('admin'); await new Promise(z => setTimeout(z, 2500));
      for (let i = 0; i < 8 && !__row(name); i++) { const bk = __btn('Back to Employees'); if (bk) bk.click(); else { const b = __btn('Employees'); if (b) b.click(); } await new Promise(z => setTimeout(z, 1000)); }
      return !!__row(name);
    }, name || 'Sam Super');
  }
  async function editRow(c, name){
    return c.ev(async name => {
      const tr = __row(name); if (!tr) return { err: 'no row' };
      const b = [...tr.querySelectorAll('button')].find(x => (x.innerText || '').trim() === 'EDIT'); if (!b) return { err: 'no EDIT' }; b.click();
      await new Promise(z => setTimeout(z, 900));
      const sel = document.querySelector('select[data-gc-employment]');
      const tabs = [...document.querySelectorAll('#root button')].filter(__vis).map(x => (x.innerText || '').trim()).filter(t => /^(👤 Info|💰 Pay|🏥 Insurance|📋 Additional)$/.test(t));
      const roleLab = sel ? [...sel.closest('div').parentElement.querySelectorAll('*')].map(x => x.children.length === 0 ? (x.textContent || '').trim() : '').filter(Boolean) : [];
      return { sel: !!sel, value: sel && sel.value, options: sel ? [...sel.options].map(o => o.text) : [], tabs, near: roleLab.slice(0, 4) };
    }, name);
  }

  /* ── B1. an admin sets the new Superintendent as 1099 ── */
  console.log('B. the CRM (admin)');
  const A = await desk(OWN, 'admin');
  ok('B1 ⚙ Admin → 👤 Employees opens with the team list', await openEmployees(A));
  let ed = await editRow(A, 'Sam Super');
  ok('B1 EDIT: an "Employment" box (W-2 employee | 1099 contractor) in the staff editor; an existing person reads W-2 employee', ed.sel && ed.value === 'w2' && JSON.stringify(ed.options) === JSON.stringify(['W-2 employee', '1099 contractor']), ed);
  const pick = await A.ev(async () => {
    const sel = document.querySelector('select[data-gc-employment]'); __setV(sel, '1099'); await new Promise(z => setTimeout(z, 600));
    const role = [...document.querySelectorAll('#root select')].find(s => [...s.options].some(o => o.text === 'Superintendent') && s !== sel);
    const tabs = [...document.querySelectorAll('#root button')].filter(__vis).map(x => (x.innerText || '').trim()).filter(t => /^(👤 Info|💰 Pay|🏥 Insurance|📋 Additional)$/.test(t));
    const note = document.querySelector('[data-gc-employment-note]');
    return { role: role && role.value, tabs, note: note && note.innerText };
  });
  ok('B1 the role stays Superintendent; picking 1099 takes away the 💰 Pay and 🏥 Insurance tabs and says what 1099 means', pick.role === 'Superintendent' && pick.tabs.join('|') === '👤 Info|📋 Additional' && /no payroll, pay stubs, W-2, PTO, sick days, commissions or benefits/.test(pick.note || '') && /Subs record by his e-mail/.test(pick.note || ''), pick);
  const pmBefore = JSON.stringify((await A.ev(() => (window._crm.users || []).find(u => u.id === 'u3'))));
  PORTAL.length = 0;
  await A.ev(async () => { __btn('^Save Changes$').click(); await new Promise(z => setTimeout(z, 500)); });
  const linked = await H.waitFor(A, () => { const u = (window._crm.users || []).find(x => x.id === 'u9'); const v = (window._crm.vendors || []).find(x => x && x.staff1099 === true); return u && u.employment === '1099' && v && u.subId === v.id ? { u: { employment: u.employment, subId: u.subId, role: u.role }, v: { id: v.id, email: v.email, isSub: v.isSub, staffUserId: v.staffUserId, staffName: v.staffName, name: v.name, trade: v.trade } } : null; }, null, 20000);
  ok('B1 Save: he is 1099 (role Superintendent) and linked to a NEW Subs record made from his e-mail (isSub, staff1099, his name / e-mail)', !!linked && linked.u.role === 'Superintendent' && linked.v.email === SUP && linked.v.isSub === true && linked.v.staffUserId === 'u9' && linked.v.name === 'Sam Super' && /Superintendent \(1099\)/.test(linked.v.trade), linked);
  SUBID = linked ? linked.v.id : '';
  await H.waitFor(A, () => !!(window._gc1099 && window._gc1099.state().last), null, 15000);
  ok('B1 his sub portal link is turned on for that record (portal-access s-link create) — he signs in there with the same e-mail', PORTAL.some(b => b.action === 's-link' && b.op === 'create' && b.subId === SUBID), PORTAL);
  await sleep(2500);
  const cloudV = (H.cget('vendors') || []).find(v => v && v.id === SUBID), cloudU = (H.cget('users') || []).find(u => u && u.id === 'u9');
  ok('B1 the Subs record and his employment reach the cloud (every computer, the sub portal server)', !!cloudV && cloudV.staff1099 === true && cloudV.email === SUP && !!cloudU && cloudU.employment === '1099' && cloudU.subId === SUBID, { cloudV, cloudU: cloudU && { e: cloudU.employment, s: cloudU.subId } });
  ok('B1 the other people\'s records are untouched (the PM: byte for byte)', JSON.stringify((await A.ev(() => (window._crm.users || []).find(u => u.id === 'u3')))) === pmBefore);
  const sameAgain = await A.ev(async () => { const u = (window._crm.users || []).find(x => x.id === 'u9'); const r = await window._gc1099.link(u); return { r, n: (window._crm.vendors || []).filter(v => v && v.staff1099 === true).length }; });
  ok('B1 linking again matches the same record by e-mail (never a second one)', sameAgain.r.ok && sameAgain.r.subId === SUBID && sameAgain.r.made === false && sameAgain.n === 1, sameAgain);

  /* ── B2. his profile: the badge + 🧾 Contractor paperwork ── */
  const card = async () => A.ev(async () => {
    window._setView('admin'); await new Promise(z => setTimeout(z, 600));
    for (let i = 0; i < 6 && !document.querySelector('.gc1099-card'); i++) {
      const tr = __row('Sam Super'); if (tr) { const b = [...tr.querySelectorAll('button')].find(x => /Profile/.test(x.innerText || '')); if (b) b.click(); }
      await new Promise(z => setTimeout(z, 1200));
    }
    const c = document.querySelector('.gc1099-card'); if (!c) return null;
    const k = q => (c.querySelector('[data-k="' + q + '"]') || {}).innerText || '';
    const pay = [...document.querySelectorAll('#root b')].filter(__vis).some(b => /💰 Pay Structure|🏥 Insurance/.test(b.innerText || ''));
    const badge = !!document.querySelector('[data-gc1099-badge]');
    return { text: c.innerText, w9: k('w9'), coi: k('coi'), agr: k('agreement'), ytd: k('ytd'), payShown: pay, badge };
  });
  let C1 = await card();
  ok('B2 his profile (admin): "1099 contractor" badge and the 🧾 Contractor paperwork card — W-9 ✗, COI not on file, agreement not signed, $0.00 paid this year', !!C1 && C1.badge && /✗/.test(C1.w9) && /COI not on file/.test(C1.coi) && /not signed/.test(C1.agr) && /\$0\.00 paid in /.test(C1.ytd), C1);
  ok('B2 no 💰 Pay Structure / 🏥 Insurance (benefits) on a 1099 contractor\'s profile', !!C1 && !C1.payShown, C1);
  try { await A.page().screenshot({ path: SHOTS + 'b2_card.png' }); } catch (e) {}

  /* ── B3. his papers and invoice from the sub portal → the CRM ── */
  EV_ON = true;
  const filed = await A.ev(async () => { try { await window._gcSubHub.sync(); } catch (e) { return String(e); } await new Promise(z => setTimeout(z, 2500)); try { await window._gcSubHub.sync(); } catch (e) {} return 'ok'; });
  await H.waitFor(A, sid => { const v = (window._crm.vendors || []).find(x => x && x.id === sid); return v && v.w9 === true && v.insExp === '2027-06-30' && v.subAgreement && (window._crm.invoices || []).some(i => i && i.id === 'SPI_Einv'); }, SUBID, 25000);
  const fv = await A.ev(sid => { const v = (window._crm.vendors || []).find(x => x && x.id === sid) || {}; const iv = (window._crm.invoices || []).find(i => i && i.id === 'SPI_Einv') || null; return { w9: v.w9, coi: v.coi, insExp: v.insExp, agr: v.subAgreement, files: (v.files || []).map(f => f.kind), iv: iv && { type: iv.type, subId: iv.subId, pid: iv.pid, amt: iv.amt, status: iv.status, sub: iv.sub } }; }, SUBID);
  ok('B3 the W-9, COI (expires 2027-06-30) and contractor agreement he sent land on his Subs record', filed === 'ok' && fv.w9 === true && fv.insExp === '2027-06-30' && !!fv.agr && ['w9', 'coi', 'agreement'].every(k => fv.files.includes(k)), fv);
  C1 = await card();
  ok('B3 …and show on his profile card: W-9 ✓, COI expiry 2027-06-30, agreement signed', !!C1 && /✓/.test(C1.w9) && /✓/.test(C1.coi) && /expires 2027-06-30/.test(C1.coi) && /✓/.test(C1.agr) && /signed/.test(C1.agr), C1);
  ok('B3 his invoice is a sub bill on the job (type sub, his Subs record, PC, $2,400, received)', !!fv.iv && fv.iv.type === 'sub' && fv.iv.subId === SUBID && fv.iv.pid === 'PC' && fv.iv.amt === 2400 && fv.iv.status === 'received', fv.iv);
  const ap = await A.ev(async () => { window._gcQueueSubApprovals && window._gcQueueSubApprovals(); await new Promise(z => setTimeout(z, 300)); const q = JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]').find(a => a.invId === 'SPI_Einv'); const jc = await window._gcJobExpenses('PC'); return { q: q && { status: q.status, pmName: q.pmName, amt: q.amt, pid: q.pid }, subs: jc.subs, lines: jc.lines }; });
  ok('B3 it goes to ✅ Approvals — a sub invoice waiting on the job\'s PM (Pat PM); not a job cost until approved (the existing rule)', !!ap.q && ap.q.status === 'pending_pm' && ap.q.pmName === 'Pat PM' && ap.q.amt === 2400 && ap.subs === 0, ap);
  const apRow = await A.ev(async () => { window._setView('approvals'); for (let i = 0; i < 20; i++) { await new Promise(z => setTimeout(z, 500)); const m = (document.body.innerText.match(/Sub invoice — Sam Super[^\n]*/) || [])[0]; if (m) return m; } return ''; });
  ok('B3 ✅ Approvals shows "Sub invoice — Sam Super" for the PM / an admin', /Sub invoice — Sam Super/.test(apRow), apRow);
  try { await A.page().screenshot({ path: SHOTS + 'b3_approvals.png' }); } catch (e) {}
  const jc2 = await A.ev(async () => { window._gcPmDecideSub('SPI_Einv', true, ''); await new Promise(z => setTimeout(z, 800)); const jc = await window._gcJobExpenses('PC'); return { subs: jc.subs, lines: jc.lines }; });
  ok('B3 approved (✅ Approve) → it is in the job\'s cost (sub costs on Sample Office TI: $2,400)', jc2.subs === 2400 && jc2.lines.some(l => /Sam Super/.test(l.what)), { jc2, apRow });
  await A.ev(() => window._setInvoices(l => (l || []).map(i => i && i.id === 'SPI_Einv' ? Object.assign({}, i, { status: 'paid', paid: true, paidDate: new Date().toISOString().slice(0, 10) }) : i)));
  await sleep(1500);
  C1 = await card();
  ok('B3 paid → the card says $2,400.00 paid this year (the 1099 total)', !!C1 && /\$2,400\.00 paid in /.test(C1.ytd) && /1099-NEC due/.test(C1.ytd), C1 && C1.ytd);
  const r99 = await A.ev(async yr => { document.querySelectorAll('body > div').forEach(d => { if (/1099-NEC/.test(d.innerText || '') && getComputedStyle(d).position === 'fixed') d.remove(); }); window._gcOpen1099('out', +yr); await new Promise(z => setTimeout(z, 800)); const ov = [...document.querySelectorAll('body > div')].filter(d => /1099-NEC/.test(d.innerText || '')).pop(); const t = ov ? ov.innerText : ''; if (ov) ov.remove(); return t; }, YEAR);
  ok('B3 the existing 📄 1099 Reports (admins / office) list him with $2,400.00', /Sam Super/.test(r99) && /2,400\.00/.test(r99), r99.slice(0, 400));
  try { await A.page().screenshot({ path: SHOTS + 'b3_card_paid.png' }); } catch (e) {}

  /* ── B4. payroll skips him ── */
  const pr = await A.ev(async () => { const P = window.__GC_PAY; const L0 = await P.profiles(); const L = L0.filter(p => p && p.active !== false && !window._gc1099.skipPay(p)); return { cora: L0.filter(p => p && (p.userId === 'u8' || p.name === 'Cora Contract')).length, sam: L.filter(p => p && (p.userId === 'u9' || /Sam Super/.test(p.name || ''))).length, pat: L.filter(p => p && (p.userId === 'u3' || p.name === 'Pat PM')).length, wade: L.filter(p => p && (p.userId === 'u7' || p.name === 'Wade Wtwo')).length, skipSam: window._gc1099.skipPay({ userId: 'u9' }), skipWade: window._gc1099.skipPay({ userId: 'u7' }) }; });
  ok('B4 payroll: no payroll profile is made for a 1099 contractor (any role); the payroll runs\' list skips the 1099 superintendent; W-2 staff keep theirs', pr.cora === 0 && pr.sam === 0 && pr.pat >= 1 && pr.wade >= 1 && pr.skipSam === true && pr.skipWade === false, pr);
  const comm = await A.ev(() => { try { return typeof window._gcPmJobPay === 'function' ? window._gcPmJobPay(Object.assign({}, (window._crm.projects || []).find(p => p.id === 'PC'), { pm: 'Sam Super' })) : 'none'; } catch (e) { return 'err ' + e.message; } });
  ok('B4 commissions: a job run by a 1099 contractor pays him no PM commission (his share stays with GrayCo)', comm === 'none' || (comm && typeof comm === 'object' && !(+comm.pmPay > 0) && !(+comm.pay > 0) && !(+comm.toPm > 0)), comm);

  /* ── W1. W-2 staff unchanged in the editor ── */
  console.log('W. W-2 staff unchanged');
  await openEmployees(A, 'Wade Wtwo');
  ed = await editRow(A, 'Wade Wtwo');
  const wadeBefore = await A.ev(() => JSON.stringify((window._crm.users || []).find(u => u.id === 'u7')));
  PORTAL.length = 0;
  ok('W1 a W-2 superintendent\'s editor: Employment W-2 employee, all four tabs', ed.sel && ed.value === 'w2' && ed.tabs.some(t => /Pay$/.test(t)) && ed.tabs.some(t => /Insurance/.test(t)), ed);
  await A.ev(async () => { __btn('^Save Changes$').click(); await new Promise(z => setTimeout(z, 2500)); });
  const wade = await A.ev(() => (window._crm.users || []).find(u => u.id === 'u7'));
  const nV = await A.ev(() => (window._crm.vendors || []).filter(v => v && v.staff1099 === true).length);
  ok('W1 saving a W-2 person writes no employment field, makes no Subs record, calls no sub portal', !!wade && !('employment' in wade) && !wade.subId && nV === 1 && !PORTAL.some(b => b.action === 's-link'), { wade: wade && { e: wade.employment, s: wade.subId }, nV, PORTAL });
  ok('W1 …and keeps his pay fields', !!wade && wade.payType === 'hourly' && String(wade.hourlyRate) === '30', wade && { p: wade.payType, r: wade.hourlyRate, before: JSON.parse(wadeBefore).payType });
  const errsA = A.errs.filter(e => !/ResizeObserver|Failed to load resource|net::ERR|AbortError|Load failed/i.test(e));
  ok('B no page errors (admin)', !errsA.length, errsA.slice(0, 4));
  await A.close();

  /* ── P. on a phone: the 1099 superintendent ── */
  console.log('P. the 1099 superintendent on a phone');
  const IPHONE = () => { try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); } catch (e) {} };
  async function phone(email, who){
    const c = await H.computer(who, { build: BUILD, mobile: true, init: [IPHONE] }); W.push(c);
    await H.signIn(c, email, 9000);
    ok(who + ': the phone opens GrayCo Field', !!(await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 45000)));
    await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 2 && !!document.querySelector('.gc-to-btns'), null, 30000);
    await sleep(3500); await c.ev(HJS);
    return c;
  }
  const PAYRX = /pay ?stubs?|payroll|my pay\b|paycheck|call in sick|time off|\bpto\b|paid time off|commission|benefits|pending pay|\bw-?2\b|\bw-?4\b/i;
  const visText = c => c.ev(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = (n.nodeValue || '').trim(); if (!t) continue; const el = n.parentElement; if (!el || el.closest('script,style,[aria-hidden="true"]')) continue; const r = el.getBoundingClientRect(); const st = getComputedStyle(el); if (r.width < 1 || r.height < 1 || st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') continue; let hid = false; for (let p = el; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).display === 'none') { hid = true; break; } } if (!hid) out.push(t); } return out; });
  const S = await phone(SUP, 'Sam (1099)');
  const vt = await visText(S);
  const tools = ['Clock in', 'Photos', 'Daily log', 'Punch list', 'My jobs today', 'Safety sign-in', 'Inspections & permits', 'Snap a receipt', 'Start daily log', 'Who\'s on site'];
  const missing = tools.filter(t => !vt.some(x => x.includes(t)));
  ok('P1 the superintendent\'s Field tools are there: ' + tools.join(', '), missing.length === 0, { missing, sample: vt.slice(0, 60) });
  const bad = vt.filter(t => PAYRX.test(t));
  ok('P2 nothing about payroll, pay stubs, call in sick, time off, commission, PTO or benefits on his screen', bad.length === 0, bad);
  ok('P2 🚧 Can\'t make it today instead of Call in sick', vt.some(t => /Can.t make it today/.test(t)) && !(await S.ev(() => !!document.querySelector('[data-to-a="sick"],[data-to-a="off"]'))), vt.filter(t => /make it|sick|Time off/i.test(t)));
  try { await S.page().screenshot({ path: SHOTS + 'p_home.png' }); } catch (e) {}
  NOTIFY.length = 0;
  await S.ev(async () => { const b = document.querySelector('[data-gc1099="cant"]'); b.scrollIntoView({ block: 'center' }); b.click(); await new Promise(z => setTimeout(z, 600)); });
  const sh = await S.ev(() => { const o = document.getElementById('gc1099-cant'); return o ? o.innerText : ''; });
  ok('P3 🚧 opens a short sheet: today\'s job, who hears it (the PM + the admins), no sick day recorded', /Sample Office TI/.test(sh) && /Pat/.test(sh) && /Olive/.test(sh) && /No sick day or time off is recorded/.test(sh), sh);
  await S.ev(async () => { const o = document.getElementById('gc1099-cant'); const i = o.querySelector('[data-f="note"]'); __setV(i, 'truck broke down — back tomorrow'); o.querySelector('[data-go]').click(); await new Promise(z => setTimeout(z, 1500)); });
  const nt = NOTIFY[0] || {};
  ok('P3 Send → a plain message to the job\'s PM and the admins (no approval, no sick record)', NOTIFY.length === 1 && [].concat(nt.to).includes(PM) && [].concat(nt.to).includes(OWN) && !([].concat(nt.to).includes(SUP)) && /Sam Super can.t make it today/.test(nt.title) && /Sample Office TI/.test(nt.body) && /truck broke down/.test(nt.body), nt);
  const toRec = await S.ev(() => { try { return (window._gcTimeOff.list(window.__GC_AUTH__.email()) || []).filter(r => r.kind === 'sick').length; } catch (e) { return -1; } });
  ok('P3 …and no "sick" record in the time-off list', toRec === 0, toRec);
  const blocked = await S.ev(async () => { const r = []; ['_gcOpenMyPay', '_gcOpenPayroll', '_gcOpenPMCommission'].forEach(k => { if (typeof window[k] === 'function') { const v = window[k](); r.push([k, v === false]); } }); try { window._gcTimeOff.openSick(); } catch (e) {} await new Promise(z => setTimeout(z, 300)); const cant = !!document.getElementById('gc1099-cant'); const o = document.getElementById('gc1099-cant'); if (o) o.remove(); const pays = [...document.body.children].filter(e => /My Pay|Payroll|Commission/.test(e.innerText || '') && getComputedStyle(e).position === 'fixed').length; return { r, cant, pays }; });
  ok('P4 My Pay / Payroll / PM commission screens do not open for him (a short note instead); "Call in sick" from anywhere opens 🚧', blocked.r.length >= 1 && blocked.r.every(x => x[1]) && blocked.cant && blocked.pays === 0, blocked);
  const punch = await H.waitFor(S, async () => { const L = await window._gcTimeClock.list(); const r = (L || []).find(x => x && x.user && /sam/i.test(x.user) && !x.manual); return r ? { onsite: r.onsite, payroll: r.payroll, user: r.user } : null; }, null, 25000);
  ok('P5 his clock-in is "hours on site" — onsite: true, payroll: false (job records and his invoices, never payroll)', !!punch && punch.onsite === true && punch.payroll === false, punch);
  const hub = await S.ev(async () => { const b = [...document.querySelectorAll('#gc-fh-tabs [data-t]')].pop(); if (b) b.click(); await new Promise(z => setTimeout(z, 1800)); const o = [...document.body.children].filter(e => getComputedStyle(e).position === 'fixed' && e.offsetHeight > 150 && e.id !== 'gc-fh-tabs'); return o.map(e => e.innerText).join('\n'); });
  const hubVis = (await visText(S)).filter(t => PAYRX.test(t));
  ok('P6 his 💎 menu has no pay stubs / payroll / time off / commission items', hubVis.length === 0, { hubVis, hub: hub.slice(0, 600) });
  try { await S.page().screenshot({ path: SHOTS + 'p_hub.png' }); } catch (e) {}
  const errsS = S.errs.filter(e => !/ResizeObserver|Failed to load resource|net::ERR|AbortError|Load failed/i.test(e));
  ok('P no page errors (his phone)', !errsS.length, errsS.slice(0, 4));
  await S.close();

  /* ── W2. a W-2 superintendent on a phone: unchanged ── */
  const V = await phone(W2S, 'Wade (W-2)');
  const vw = await visText(V);
  ok('W2 a W-2 superintendent still has 🏖 Time off and 🤒 Call in sick (no 🚧)', vw.some(t => /^Time off$/.test(t)) && vw.some(t => /^Call in sick$/.test(t)) && !vw.some(t => /Can.t make it today/.test(t)), vw.filter(t => /Time off|sick|make it/i.test(t)));
  const p2 = await H.waitFor(V, async () => { const L = await window._gcTimeClock.list(); const r = (L || []).find(x => x && x.user && /wade/i.test(x.user) && !x.manual); return r ? { onsite: r.onsite, payroll: r.payroll, keys: Object.keys(r).sort().join(',') } : null; }, null, 25000);
  ok('W2 …and an ordinary punch (no onsite / payroll fields)', !!p2 && p2.onsite === undefined && p2.payroll === undefined, p2);
  ok('W2 the 1099 rules are off for him (no gc-1099 class)', !(await V.ev(() => document.documentElement.classList.contains('gc-1099'))));
  const errsV = V.errs.filter(e => !/ResizeObserver|Failed to load resource|net::ERR|AbortError|Load failed/i.test(e));
  ok('W no page errors (W-2 phone)', !errsV.length, errsV.slice(0, 4));
  await V.close();
}

console.log(fail ? 'SUP1099: FAIL (' + fail + ' of ' + (pass + fail) + ')' : 'SUP1099: PASS (' + pass + ')');
process.exit(fail ? 1 : 0);
