// test_SUBSCHED.mjs [build-dir] [shot-dir] — patch SUBSCHED (owner 11/12: "on the sub portal have where the subs can click the schedule they will
// do for the job when they get the job and that schedule will update our company schedule automatically whenever a sub enters his schedule in
// there with address, PO and task if they want"). Offline: the REAL portal-access.js on an in-memory Supabase; the sub portal (portal.html +
// portal-app.js) and the CRM (index.html, harness_N) in Chromium. Made-up data only.
//
//  A. server (p-sched / s-sched): a sub on the job lists / adds / changes / cancels entries (address + PO from the job, task prefilled with their
//     trade); validated (dates, time, task, crew; English / Spanish); a sub NOT on the job is refused; locked once the first day starts; rate-limited;
//     the job's PM gets ONE To-Do per entry (replaced on a change); a gc_sub_event 'sched' for the CRM; staff list / ✅ confirm / 📨 ask to move
//     (a message in the sub's portal thread); staff-only.
//  B. the sub portal: 📅 My schedule for this job on the job page — add (form with address / PO read-only), change, cancel, the confirmed / asked-to-move
//     states, 🔒 once started, Español.
//  C. the CRM: the entries become company schedule items by themselves ("🔨 <Sub company> — <task>", job, address, PO, time, source "Sub portal",
//     subId) with ⚠ for another trade the same day; a change by the sub moves the SAME items (no duplicates); a cancel removes them; a staff edit is
//     put back; the job's company (Construction / Mitigation filter); 📅 Sub schedules on the Schedule tab: ✅ Confirm / 📨 Ask to move; the job's
//     activity line from the 'sched' event.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(250); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
delete process.env.RESEND_API_KEY; delete process.env.VAPID_PUBLIC_KEY;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); };
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const wd = d => new Date(d + 'T12:00:00Z').getUTCDay();
let MON = addDays(TODAY, 3); while (wd(MON) !== 1) MON = addDays(MON, 1);          /* the next Monday at least 3 days out */
const TUE = addDays(MON, 1), WED = addDays(MON, 2), THU = addDays(MON, 3), FRI = addDays(MON, 4);

/* ═════ the made-up CRM ═════ */
const SUB = { id: 'SUBzedd1', name: 'Zedd Drywall LLC', company: 'Zedd Drywall LLC', contact: 'Zed Zedd', phone: '901-555-0141', email: 'zed@zedddrywall.test', isSub: true, trade: 'Drywall', lang: 'en' };
const SUB2 = { id: 'SUBdemo2', name: 'Demo Paint Co', company: 'Demo Paint Co', contact: 'Dee Demo', phone: '901-555-0142', email: 'dee@demopaint.test', isSub: true, trade: 'Paint' };
const USERS = [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', phone: '901-555-0100', role: 'Project Manager', active: true }];
const JOB = { id: 'PZEDD1', name: 'Zedd Kitchen Remodel', address: '123 Demo St, Memphis, TN 38117', client: 'Pat Demo', pm: 'Sam Biffle', status: 'active', autoPO: 'T501', startDate: addDays(MON, -7), endDate: THU,
  contract: 48250, subs: [{ id: 'r1', subId: SUB.id, name: SUB.name, trade: 'Drywall', status: 'Awarded' }, { id: 'r2', subId: SUB2.id, name: SUB2.name, trade: 'Paint', status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const JOBM = { id: 'PZEDDM', name: 'Zedd Water Loss', address: '9 Demo Ave, Memphis, TN 38104', client: 'Lee Demo', pm: 'Sam Biffle', status: 'active', autoPO: 'T502', companyId: 'mitigation', companyIdBy: 'test',
  subs: [{ id: 'r3', subId: SUB.id, name: SUB.name, trade: 'Drywall', status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const JOB3 = { id: 'PDEMO3', name: 'Demo Bath', address: '5 Elsewhere Rd', client: 'Dot Demo', pm: 'Sam Biffle', status: 'active', autoPO: 'T503', subs: [{ id: 'r4', subId: SUB2.id, name: SUB2.name, status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const OTHER = { id: 'SCHother1', pid: JOB.id, title: 'Paint prep', date: MON, time: '08:00', vendor: 'Demo Paint Co', subId: SUB2.id, scope: 'company', by: 'Sam Biffle', createdAt: now(), updatedAt: now() };

let KV, KVAT, T;
function freshDb(){
  KV = { projects: [JOB, JOBM, JOB3], vendors: [SUB, SUB2], users: USERS, schedule: [OTHER], gc_sub_portal_settings: {} }; KVAT = {};
  T = { gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal_code: [], gc_sub_device: [], gc_portal: [], gc_portal_lock: [], gc_portal_login: [], sp_rows: [], gc_lead_inbox_kv: [],
    gc_staff: [{ email: 'wjohnson@grayco-cs.com', role: 'admin', active: true, name: 'Wesley Johnson' }, { email: 'sbiffle@grayco-cs.com', role: 'staff', active: true, name: 'Sam Biffle' }] };
}
freshDb();
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); const mm = /^staff:(.+)$/.exec(a); return mm ? res(200, { id: 'u', email: mm[1] }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = typeof x.value === 'string' && /^[\[{]/.test(x.value) ? JSON.parse(x.value) : x.value; KVAT[x.key] = x.updated_at || now(); }); return res(201, null); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: KVAT[x] || 'T0' })));
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const i = r.key ? tb.findIndex(x => x.key === r.key) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
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
  if (u.pathname.startsWith('/storage/v1/object/sign/')) return res(200, []);
  return res(404, {});
};
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const resetPA = () => { try { PA._core._reset(); } catch (e) {} };
let NET = 0;
const SESS = 'S'.repeat(43), SESS2 = 'Q'.repeat(43), LINK = 'L'.repeat(43), LINK2 = 'K'.repeat(43);
function sessions(){
  T.gc_sub_link.push({ token: LINK, sub_id: SUB.id, revoked: false, created_at: now() }, { token: LINK2, sub_id: SUB2.id, revoked: false, created_at: now() });
  T.gc_portal_session.push({ id: sha(SESS), kind: 'partner', sub_id: SUB.id, links: [LINK], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false },
    { id: sha(SESS2), kind: 'partner', sub_id: SUB2.id, links: [LINK2], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false });
}
sessions();
async function sub(action, body, sess, ip){
  const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': sess || SESS, 'x-nf-client-connection-ip': ip || ('10.4.' + (NET++ % 250) + '.1') }, body: JSON.stringify(Object.assign({ action }, body || {})) });
  return { st: r.statusCode, d: JSON.parse(r.body) };
}
async function staff(body, email){
  const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: email === null ? '' : 'Bearer staff:' + (email || 'wjohnson@grayco-cs.com') }, body: JSON.stringify(Object.assign({ action: 's-sched' }, body || {})) });
  return { st: r.statusCode, d: JSON.parse(r.body) };
}
const store = () => { const row = T.gc_lead_inbox_kv.find(x => x.key === 'gc_sub_sched'); let v = row && row.value; if (typeof v === 'string') v = JSON.parse(v); return (v && v.list) || {}; };
const todos = () => (Array.isArray(KV.gc_office_tasks) ? KV.gc_office_tasks : []).filter(t => t && t.kind === 'sub_sched');

/* ─── A. the server ─── */
let E1, E2;
{
  let r = await sub('p-sched', { projectId: JOB.id, op: 'list' });
  ok('A1 a sub on the job lists 📅 My schedule: the job\'s address + PO, the task prefilled with their trade, no entries yet', r.st === 200 && r.d.job.address === JOB.address && r.d.job.po === 'T501' && r.d.job.task === 'Drywall' && r.d.entries.length === 0, r);
  r = await sub('p-sched', { projectId: JOB.id, op: 'save', start: MON, end: WED, time: '07:30', task: 'Hang drywall — kitchen', crew: 3, notes: 'Need the garage open', lang: 'en' });
  E1 = r.d.entry;
  ok('A2 add Mon–Wed 7:30 AM, crew 3 → saved: 3 work days, address + PO from the job, editable, waiting for confirm', r.st === 200 && E1 && E1.days.join() === [MON, TUE, WED].join() && E1.time === '07:30' && E1.crew === 3 && E1.address === JOB.address && E1.po === 'T501' && E1.editable === true && !E1.confirmed && r.d.entries.length === 1, r);
  const st = store()[E1.id];
  ok('A2 kept in the server store (gc_sub_sched) with the sub, the job, the company and the day revisions', st && st.subId === SUB.id && st.pid === JOB.id && st.subName === 'Zedd Drywall LLC' && st.v === 1 && st.dayV[MON] === 1, st);
  const ev = T.gc_sub_event.filter(e => e.kind === 'sched');
  ok('A2 a gc_sub_event "sched" for the CRM (op add, the dates line)', ev.length === 1 && ev[0].sub_id === SUB.id && ev[0].project_id === JOB.id && ev[0].data.op === 'add' && /Mon/.test(ev[0].data.line), ev);
  let td = todos();
  ok('A2 the job\'s PM (Sam Biffle) gets a To-Do "📅 Zedd Drywall LLC scheduled Hang drywall …" with the address and PO', td.length === 1 && td[0].assignees[0] === 'sbiffle@grayco-cs.com' && /^📅 Zedd Drywall LLC scheduled Hang drywall — kitchen /.test(td[0].label) && /Address: 123 Demo St/.test(td[0].note) && /PO: T501/.test(td[0].note) && td[0].pid === JOB.id, td);

  /* a sub NOT on the job */
  r = await sub('p-sched', { projectId: JOBM.id, op: 'list' }, SESS2);
  const r2 = await sub('p-sched', { projectId: JOBM.id, op: 'save', start: MON, end: MON, task: 'Paint' }, SESS2);
  const r3 = await sub('p-sched', { projectId: JOB3.id, op: 'cancel', id: E1.id }, SESS2);
  const r3b = await sub('p-sched', { projectId: JOB.id, op: 'cancel', id: E1.id }, SESS2);
  ok('A3 a sub not on the job is refused (404 "not one of yours"); another sub can never change / cancel this entry', r.st === 404 && /not one of yours/.test(r.d.error) && r2.st === 404 && r3.st === 404 && r3b.st === 404 && store()[E1.id].status === 'active', { r: r.st, r2: r2.st, r3: r3.st, r3b: r3b.st });

  /* validation */
  const bad = [[{ start: addDays(TODAY, -1), end: TODAY, task: 'x y' }, /first day/], [{ start: TUE, end: MON, task: 'Hang' }, /last day/], [{ start: MON, end: MON, time: '25:00', task: 'Hang' }, /start time/],
    [{ start: MON, end: MON, task: ' ' }, /task/i], [{ start: MON, end: MON, task: 'Hang', crew: 0 }, /Crew/], [{ start: MON, end: addDays(MON, 120), task: 'Hang' }, /at most/]];
  const outs = []; for (const [b, re] of bad) { const x = await sub('p-sched', Object.assign({ projectId: JOB.id, op: 'save' }, b)); outs.push(x.st === 400 && re.test(x.d.error) ? 1 : [x.st, x.d.error]); }
  ok('A4 checked on the server: a past first day, last before first, a bad time, no task, crew 0, more than 60 work days → 400 with a plain message', outs.every(x => x === 1), outs);
  const es = await sub('p-sched', { projectId: JOB.id, op: 'save', start: TUE, end: MON, task: 'Hang', lang: 'es' });
  ok('A4 … in Spanish when the portal is in Español', es.st === 400 && /último día/.test(es.d.error), es);
  r = await sub('p-sched', { projectId: JOBM.id, op: 'save', start: MON, days: 5, task: 'Hang board — water loss', lang: 'en' });
  E2 = r.d.entry;
  ok('A4 "number of work days" 5 from Monday → Monday–Friday (weekends skipped) on the Mitigation job', r.st === 200 && E2 && E2.end === FRI && E2.days.length === 5, r);

  /* change */
  r = await sub('p-sched', { projectId: JOB.id, op: 'save', id: E1.id, start: TUE, end: THU, time: '08:00', task: 'Hang drywall — kitchen', crew: 3, notes: 'Need the garage open' });
  const st2 = store()[E1.id];
  ok('A5 change to Tue–Thu → the same entry (v2), the kept days keep their revision, the new day is new', r.st === 200 && r.d.entry.id === E1.id && r.d.entry.days.join() === [TUE, WED, THU].join() && st2.v === 2 && st2.dayV[TUE] === 1 && st2.dayV[THU] === 2 && !st2.dayV[MON] && r.d.op === 'update', st2);
  td = todos();
  ok('A5 the PM\'s To-Do is REPLACED (one per entry): "… moved Hang drywall …"', td.filter(t => t.id === 'subsched_' + E1.id).length === 1 && /moved Hang drywall/.test(td.find(t => t.id === 'subsched_' + E1.id).label), td.map(t => t.label));

  /* locked once started */
  r = await sub('p-sched', { projectId: JOB.id, op: 'save', start: TODAY, end: TODAY, task: 'Walk the job' });
  const E3 = r.d.entry;
  const r4 = await sub('p-sched', { projectId: JOB.id, op: 'save', id: E3.id, start: addDays(TODAY, 1), end: addDays(TODAY, 1), task: 'Walk the job' });
  const r5 = await sub('p-sched', { projectId: JOB.id, op: 'cancel', id: E3.id });
  ok('A6 an entry for today can be added, but once its first day starts it is locked (409 "message your PM")', r.st === 200 && E3.editable === false && r4.st === 409 && /message your PM/.test(r4.d.error) && r5.st === 409, { r: r.st, r4, r5: r5.st });

  /* staff */
  r = await staff({ op: 'list' });
  ok('A7 staff s-sched list: every entry with the sub, job, versions and day revisions', r.st === 200 && r.d.entries.length === 3 && r.d.entries.some(e => e.id === E1.id && e.v === 2 && e.subName === 'Zedd Drywall LLC' && e.dayV[THU] === 2), r.d);
  const nope = await staff({ op: 'list' }, null), nope2 = await staff({ op: 'list' }, 'stranger@example.test');
  ok('A7 not signed in / not on the staff list → 401 / 403', nope.st === 401 && nope2.st === 403, [nope.st, nope2.st]);
  r = await staff({ op: 'confirm', id: E2.id });
  ok('A8 ✅ Confirm → the entry is confirmed by the staff member', r.st === 200 && store()[E2.id].confirmed && store()[E2.id].confirmed.by === 'Wesley Johnson', store()[E2.id]);
  r = await staff({ op: 'move', id: E1.id, text: 'Can you start Wednesday instead? The cabinets come Tuesday.' });
  const msg = T.gc_portal_msg.find(m => m.party === 's:' + SUB.id && m.side === 'gc');
  ok('A8 📨 Ask to move → a message in the sub\'s portal thread on that job, and the entry shows the request', r.st === 200 && msg && msg.project_id === JOB.id && /asks you to move "Hang drywall — kitchen"/.test(msg.text) && /start Wednesday/.test(msg.text) && store()[E1.id].moveAsk.text.includes('Wednesday'), msg);
  const sv = await staff({ op: 'move', id: E1.id, text: '' });
  ok('A8 an empty "ask to move" is refused', sv.st === 400, sv);
  /* the sub's job page carries the entries; a filed CRM item for them is not listed twice */
  KV.schedule = [OTHER, { id: 'SPS_' + E1.id + '_x', pid: JOB.id, subId: SUB.id, subEntryId: E1.id, date: TUE, title: '🔨 Zedd Drywall LLC — Hang drywall — kitchen' }]; resetPA();
  r = await sub('p-job', { projectId: JOB.id });
  ok('A9 p-job carries mySched (entries + address / PO / task); the CRM\'s copy of the sub\'s own days is not listed again under "Your days on the schedule"', r.st === 200 && r.d.mySched && r.d.mySched.entries.length === 2 && r.d.mySched.job.po === 'T501' && !r.d.schedule.some(x => x.fromSub), { ms: r.d.mySched, sch: r.d.schedule });
  KV.schedule = [OTHER]; resetPA();
  /* rate limit: save / cancel from one address */
  let lim = 0; for (let i = 0; i < 70; i++) { const x = await sub('p-sched', { projectId: JOB.id, op: 'cancel', id: 'SSnothere000' }, SESS, '10.77.0.1'); if (x.st === 429) { lim = i; break; } }
  ok('A10 rate-limited like the other sub actions (429 after 60 changes from one address in 10 minutes)', lim >= 60 && lim <= 61, lim);
  resetPA();
}

/* ─── B. the sub portal ─── */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
async function portalCtx(mobile){
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block', bypassCSP: true }, mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 860 } }));
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host !== 'portal.test') return r.abort('blockedbyclient');
    const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
    if (fm) {
      if (fm[1] !== 'portal-access') return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
      const resp = await PA.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': '10.5.' + (NET++ % 250) + '.1' }, rq.headers()), body: rq.postData() || '' });
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    if (u.pathname === '/' || u.pathname === '/portal.html') return r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(BUILD, 'portal.html'), 'utf8') });
    const f = path.join(BUILD, decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  return ctx;
}
{
  const C = await portalCtx(true);
  const P = await C.newPage(); P.on('pageerror', e => errs.push('portal: ' + String(e.message).slice(0, 200))); P.on('dialog', d => d.accept().catch(() => {}));
  await P.goto('https://portal.test/');
  await P.evaluate(([s]) => { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); }, [SESS]);
  await P.goto('https://portal.test/#job=' + JOB.id);
  await P.reload();
  const card = await waitFor(() => P.evaluate(() => { const c = document.getElementById('mySched'); return c ? c.innerText : null; }), 30000);
  ok('B1 the job page has "📅 My schedule for this job" with the sub\'s entries: the moved one shows GrayCo\'s "ask to move" note, the started one is 🔒', !!card && /My schedule for this job/.test(card) && /Hang drywall — kitchen/.test(card) && /GrayCo asks you to move this/.test(card) && /start Wednesday/.test(card) && /Started — message your PM/.test(card), card || await P.evaluate(() => document.body.innerText.slice(0, 1500)));
  await shot(P, 'subsched_b1_portal_card');
  await P.click('#msAdd');
  await P.waitForSelector('#msStart');
  const info = await P.evaluate(() => ({ addr: document.querySelector('[data-ms-addr]').textContent, po: document.querySelector('[data-ms-po]').textContent, task: document.getElementById('msTask').value, ro: !document.querySelector('#msJobInfo input') }));
  ok('B2 ➕ Add my days: the job\'s address and PO are shown (read-only), the task is prefilled with their trade', /123 Demo St/.test(info.addr) && /T501/.test(info.po) && info.task === 'Drywall' && info.ro, info);
  await P.fill('#msStart', FRI); await P.fill('#msEnd', FRI); await P.fill('#msTime', '09:00'); await P.fill('#msTask', 'Touch-up and sand'); await P.fill('#msCrew', '2'); await P.fill('#msNotes', 'Bring the big fans');
  await shot(P, 'subsched_b2_portal_form');
  await P.click('#msSave');
  const added = await waitFor(() => P.evaluate(() => { const c = document.getElementById('mySched'); return c && /Touch-up and sand/.test(c.innerText) && !document.querySelector('.sheet') ? c.innerText : null; }));
  const E4 = Object.values(store()).find(e => e.task === 'Touch-up and sand');
  ok('B3 Save → the entry is on the card ("⏳ waiting for your PM to confirm") and on the server (Fri 9 AM, crew 2, notes)', !!added && /waiting for your PM to confirm/.test(added) && E4 && E4.start === FRI && E4.time === '09:00' && E4.crew === 2 && E4.notes === 'Bring the big fans', { added, E4 });
  /* change it */
  await P.click('[data-ms-edit="' + E4.id + '"]'); await P.waitForSelector('#msStart');
  await P.fill('#msStart', THU); await P.fill('#msEnd', ''); await P.fill('#msDaysN', '2'); await P.click('#msSave');
  const moved = await waitFor(async () => { const e = store()[E4.id]; return e && e.start === THU && e.v === 2 ? e : null; });
  ok('B4 ✏️ Change → 2 work days from Thursday (Thu–Fri), the same entry', moved && moved.days.join() === [THU, FRI].join(), moved);
  /* Spanish */
  await P.evaluate(() => window.GCPartner.setLang('es'));
  const es2 = await waitFor(() => P.evaluate(() => { const c = document.getElementById('mySched'); return c && /Mi horario para este trabajo/.test(c.innerText) ? c.innerText : null; }), 8000);
  ok('B5 Español: "📅 Mi horario para este trabajo", "➕ Agregar mis días", the states in Spanish', !!es2 && /Agregar mis días/.test(es2) && /esperando que su PM confirme|GrayCo le pide mover/.test(es2), es2);
  await shot(P, 'subsched_b5_portal_es');
  await P.evaluate(() => { try { window.GCPartner.setLang('en'); } catch (e) {} });
  await sleep(600);
  /* cancel it */
  await P.click('[data-ms-cancel="' + E4.id + '"]');
  const gone = await waitFor(async () => store()[E4.id].status === 'cancelled' && await P.evaluate(id => !document.querySelector('[data-ms-entry="' + id + '"]'), E4.id));
  ok('B6 ✕ Cancel these days → cancelled on the server and off the card', !!gone, store()[E4.id]);
  /* desktop: the card is in the left column next to the tabs */
  const C2 = await portalCtx(false); const P2 = await C2.newPage(); P2.on('pageerror', e => errs.push('portal-desk: ' + String(e.message).slice(0, 200)));
  await P2.goto('https://portal.test/'); await P2.evaluate(([s]) => { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); }, [SESS]);
  await P2.goto('https://portal.test/#job=' + JOBM.id);
  await P2.reload();
  const dk = await waitFor(() => P2.evaluate(() => { const c = document.querySelector('.col-l #mySched'); return c ? c.innerText : null; }), 30000);
  ok('B7 on a computer the card sits in the job\'s left column; the confirmed entry shows "✅ Confirmed by GrayCo"', !!dk && /Hang board — water loss/.test(dk) && /Confirmed by GrayCo/.test(dk), dk);
  await shot(P2, 'subsched_b7_portal_desktop');
  await C.close(); await C2.close();
}

/* ─── C. the CRM ─── */
const { computer, signIn, cset, cget, resetCloud } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
resetCloud();
cset('users', USERS); cset('projects', [JOB, JOBM, JOB3]); cset('vendors', [SUB, SUB2]); cset('schedule', [OTHER]);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD }); A.acceptConfirm = true;
const cerrs = []; A.page().on('pageerror', e => cerrs.push(String(e.message).slice(0, 200)));
const CALLS = [];
await A.ctx.route('**/.netlify/functions/portal-access*', async rt => {
  const rq = rt.request(); let b = {}; try { b = JSON.parse(rq.postData() || '{}'); } catch (e) {} CALLS.push(b.action + (b.op ? ':' + b.op : ''));
  resetPA();
  const resp = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:wjohnson@grayco-cs.com' }, body: rq.postData() || '{}' });
  return rt.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
});
await signIn(A, 'wjohnson@grayco-cs.com', 15000);
await sleep(6000);
const items = () => A.ev(async () => (await window._gcSubSched.live()).filter(x => x && x.subEntryId).map(x => ({ id: x.id, e: x.subEntryId, date: x.date, time: x.time, title: x.title, address: x.address, po: x.po, source: x.source, subId: x.subId, pid: x.pid, co: x.companyId, conflict: x.conflict, notes: x.notes, groupId: x.groupId })));
await A.ev(() => { window._gcSubSched._loaded(0); return window._gcSubSched.refresh(); });
let it = await waitFor(async () => { const l = await items(); return l.length >= 8 ? l : null; }, 20000);
const e1 = (it || []).filter(x => x.e === E1.id), e2 = (it || []).filter(x => x.e === E2.id);
ok('C1 the subs\' entries are on the company schedule by themselves: one item per day (Tue–Thu drywall, Mon–Fri water loss, today\'s walk)', e1.length === 3 && e2.length === 5 && it.length === 9, it && it.map(x => x.e.slice(-4) + ' ' + x.date));
const x1 = e1.find(x => x.date === WED) || {};
ok('C1 each item: "🔨 Zedd Drywall LLC — Hang drywall — kitchen", the job, its address, PO T501, 8:00, source "Sub portal", the sub\'s id, one group per entry', x1.title === '🔨 Zedd Drywall LLC — Hang drywall — kitchen' && x1.pid === JOB.id && x1.address === JOB.address && x1.po === 'T501' && x1.time === '08:00' && x1.source === 'Sub portal' && x1.subId === SUB.id && x1.groupId === 'SPS_' + E1.id && /Crew: 3/.test(x1.notes) && /Asked to move/.test(x1.notes), x1);
const thu = e1.find(x => x.date === THU) || {}, mon2 = e2.find(x => x.date === MON) || {};
ok('C1 ⚠ when another trade is on that job the same day (Demo Paint Co on Monday is not on these days → none); Thursday inside the job dates → none', !e1.some(x => x.conflict) && !thu.conflict, e1.map(x => [x.date, x.conflict]));
ok('C1 the Mitigation job\'s days carry its company (mitigation); ✅ confirmed shows in the notes', e2.every(x => x.co === 'mitigation') && /Confirmed by Wesley Johnson/.test(mon2.notes) && e1.every(x => x.co === 'construction'), [e2[0], e1[0] && e1[0].co]);
/* the sub moves it to Mon–Wed (Monday: Demo Paint Co is there; …) */
const before = e1.map(x => x.id); await A.ev(id => { window.__E1 = id; }, E1.id);
let r = await sub('p-sched', { projectId: JOB.id, op: 'save', id: E1.id, start: MON, end: WED, time: '07:00', task: 'Hang drywall — kitchen', crew: 3, notes: '' });
await A.ev(() => window._gcSubSched.refresh());
it = await waitFor(async () => { const l = (await items()).filter(x => x.e === E1.id); return l.length === 3 && l.some(x => x.date === MON) ? l : null; });
const tomb = await A.ev(ids => ids.map(id => window._gcIsTombstoned('schedule', id)), before);
ok('C2 the sub changes the days → the SAME items move (Tue / Wed keep their ids, Thursday is removed, Monday added) — no duplicates', !!it && it.length === 3 && it.filter(x => before.includes(x.id)).length === 2 && !it.some(x => x.date === THU) && tomb[before.indexOf(e1.find(x => x.date === THU).id)] === true && it.every(x => x.time === '07:00'), it || { r: r.st, v: store()[E1.id].v, st: await A.ev(() => { const s = window._gcSubSched.state(); return { at: s.at, err: s.err, writes: s.writes, e1: (s.entries.find(e => e.id === window.__E1) || {}).v }; }), now: (await items()).filter(x => x.e === E1.id).map(x => x.id + ' ' + x.date + ' ' + x.time), calls: CALLS.slice(-6) });
const monItem = (it || []).find(x => x.date === MON) || {};
ok('C2 ⚠ on Monday: another trade (Demo Paint Co) is on that job that day — shown on the item, nothing blocked', /^⚠ 🔨 Zedd Drywall LLC/.test(monItem.title) && /same day as Demo Paint Co/.test(monItem.conflict), monItem);
/* a staff edit is put back */
const wedId = ((it || []).find(x => x.date === WED) || {}).id;
await A.ev(id => { window.__GC_MANUAL_SAVE__ = true; window._setSchedule(prev => prev.map(x => x && x.id === id ? Object.assign({}, x, { date: '2099-01-01', title: 'Edited by staff', updatedAt: new Date().toISOString() }) : x)); setTimeout(() => { window.__GC_MANUAL_SAVE__ = false; }, 1500); }, wedId);   /* a person's edit (drawn at once) */
const edited = await waitFor(async () => { const l = await items(); const w = l.find(x => x.id === wedId); return w && w.date === '2099-01-01' ? 1 : (w && w.date === WED && await A.ev(() => !!document.querySelector('.gcss-toast')) ? 2 : null); }, 10000);
const back = await waitFor(async () => { const l = await items(); const w = l.find(x => x.id === wedId); return w && w.date === WED && /Zedd Drywall/.test(w.title) ? w : null; }, 12000);
const toastTxt = await A.ev(() => [...document.querySelectorAll('.gcss-toast')].map(t => t.textContent).join(' | '));
ok('C3 staff can\'t silently overwrite a sub\'s day: the edit is put back within seconds, with a note to use ✅ Confirm / 📨 Ask to move', !!edited && !!back && /came from the sub's portal — put back/.test(toastTxt), { edited, back, toastTxt });
/* company filter */
const vis = await A.ev(async ([a, b]) => { const live = await window._gcSubSched.live(); const out = {}; ['mitigation', 'construction', 'all'].forEach(f => { window._gcCo.setFilter(f); const l = window._gcSchedVisible(live); out[f] = { m: l.filter(x => x.subEntryId === a).length, c: l.filter(x => x.subEntryId === b).length }; }); window._gcCo.setFilter('all'); return out; }, [E2.id, E1.id]);
ok('C4 company separation: Mitigation\'s schedule shows the water-loss days only, Construction\'s the kitchen days only, All both', vis.mitigation.m === 5 && vis.mitigation.c === 0 && vis.construction.m === 0 && vis.construction.c === 3 && vis.all.m === 5 && vis.all.c === 3, vis);
/* 📅 Sub schedules on the Schedule tab */
for (let i = 0; i < 8; i++) { await A.ev(() => { try { if (window._gcRA && window._gcRA.hide) window._gcRA.hide(); } catch (e) {} window._setView('schedule'); }); await sleep(1500); if (await A.ev(() => [...document.querySelectorAll('h1')].some(h => /^Schedule/.test(h.textContent)))) break; }
const btn = await waitFor(() => A.ev(() => { const b = document.querySelector('[data-gcss-open]'); return b ? b.textContent : null; }), 15000);
ok('C5 the Schedule tab has "📅 Sub schedules (N to confirm)"', !!btn && /Sub schedules \(\d+ to confirm\)/.test(btn), btn || await A.ev(() => ({ v: localStorage.getItem('grayco_view'), h: [...document.querySelectorAll('h1,h2')].map(h => h.textContent.slice(0, 30)), ra: window._gcRA && JSON.stringify(window._gcRA.state()).slice(0, 150), ov: [...document.querySelectorAll('body > div')].filter(d => getComputedStyle(d).position === 'fixed' && d.offsetHeight > 300).map(d => d.id || d.className) })));
await A.ev(() => document.querySelector('[data-gcss-open]').click());
const sh = await waitFor(() => A.ev(() => { const s = document.getElementById('gcss-sheet'); return s && s.querySelectorAll('[data-ss]').length >= 3 ? s.innerText : null; }), 10000);
ok('C5 the sheet lists each entry: sub — task, dates, job · address · PO, ⚠, ✅ Confirm / 📨 Ask to move', !!sh && /Zedd Drywall LLC — Hang drywall — kitchen/.test(sh) && /PO T501/.test(sh) && /⚠ same day as Demo Paint Co/.test(sh) && /Confirm/.test(sh) && /Ask to move/.test(sh), sh && sh.slice(sh.indexOf('Hang drywall'), sh.indexOf('Hang drywall') + 500));
if (SHOTS) await A.page().screenshot({ path: path.join(SHOTS, 'subsched_c5_crm_sheet.png') });
await A.ev(id => document.querySelector('[data-ss="' + id + '"] [data-ss-act="confirm"]').click(), E1.id);
const conf = await waitFor(async () => store()[E1.id].confirmed ? store()[E1.id] : null, 10000);
const confNotes = await waitFor(async () => { const l = await items(); const w = l.find(x => x.id === wedId); return w && /Confirmed by Wesley Johnson/.test(w.notes) ? w.notes : null; }, 10000);
ok('C6 ✅ Confirm → confirmed on the server (the sub sees it) and on the schedule items', !!conf && !!confNotes, { conf, confNotes });
await A.ev(id => document.querySelector('[data-ss="' + id + '"] [data-ss-act="move"]').click(), E2.id);
await A.ev(id => { const c = document.querySelector('[data-ss="' + id + '"]'); c.querySelector('[data-ss-text]').value = 'Please start Tuesday — the drying equipment comes out Monday.'; c.querySelector('[data-ss-act="send-move"]').click(); }, E2.id);
const mv = await waitFor(async () => T.gc_portal_msg.find(m => m.project_id === JOBM.id && m.party === 's:' + SUB.id && /drying equipment/.test(m.text)), 10000);
ok('C6 📨 Ask to move → a message to the sub in their portal thread on that job', !!mv && mv.side === 'gc' && mv.author === 'Wesley Johnson', mv);
/* the 👷 Subs & portal sheet of the job shows the sub's entries */
await A.ev(() => { const s = document.getElementById('gcss-sheet'); if (s) s.remove(); });
await A.ev(pid => window._gcSubHub && window._gcSubHub.open(pid), JOB.id);
const hubLine = await waitFor(() => A.ev(() => { const b = document.querySelector('#gcsub-hub [data-gcss-sub]'); return b ? b.textContent : null; }), 10000);
ok('C7 the job\'s 👷 Subs & portal sheet: "📅 Entered … schedule entries in the portal" on the sub\'s card (opens 📅 Sub schedules)', !!hubLine && /Entered 2 schedule entries/.test(hubLine), hubLine);
await A.ev(() => { const h = document.getElementById('gcsub-hub'); if (h) h.remove(); });
/* the sub cancels → the items come off */
r = await sub('p-sched', { projectId: JOB.id, op: 'cancel', id: E1.id });
await A.ev(() => window._gcSubSched.refresh());
const off = await waitFor(async () => { const l = await items(); return !l.some(x => x.e === E1.id) ? l : null; }, 10000);
ok('C8 the sub cancels → those days come off the company schedule (the other entries stay)', r.st === 200 && !!off && off.filter(x => x.e === E2.id).length === 5, off && off.length);
/* the 'sched' events → the job's activity line (the sub-portal filing) */
await A.ev(() => window._gcSubHub && window._gcSubHub.sync && window._gcSubHub.sync());
const act = await waitFor(() => A.ev(pid => { const p = (window._crm.projects || []).find(x => x.id === pid); const u = (p && p.updates || []).filter(x => /^📅 /.test(x.text)); return u.length ? u.map(x => x.text) : null; }, JOB.id), 40000);
ok('C9 the job\'s activity: "📅 Zedd Drywall LLC scheduled / moved / cancelled …" (from the sub-portal filing) and the events acknowledged', !!act && act.some(t => /scheduled Hang drywall/.test(t)) && act.some(t => /cancelled/.test(t)) && T.gc_sub_event.filter(e => e.kind === 'sched' && e.applied_at).length >= 3, act);
const saved = cget('schedule'); const cl = (typeof saved === 'string' ? JSON.parse(saved) : saved) || [];
ok('C10 written to the cloud like any schedule change (the water-loss days are in gc_kv schedule; no duplicate ids)', Array.isArray(cl) && cl.filter(x => x && x.subEntryId === E2.id).length === 5 && new Set(cl.map(x => x && x.id)).size === cl.length, Array.isArray(cl) ? cl.length : typeof saved);
ok('no page errors (portal + CRM)', errs.length === 0 && cerrs.length === 0, errs.concat(cerrs).slice(0, 6));
await browser.close(); try { await A.b.close(); } catch (e) {}
const n = R.filter(Boolean).length;
console.log('\nSUBSCHED ' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
