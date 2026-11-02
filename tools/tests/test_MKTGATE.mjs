// test_MKTGATE.mjs <build-dir> <mirror.json> — patch MKTFIX (owner 11/02: "can Malcolm sign in and does all his buttons
// work, I don't want him in and stuff messes up"). Malcolm Lane, the Marketing Manager, at a PERSONAL e-mail address,
// against the REAL function handlers in this process (tools/tests/officefix_bridge.mjs: fake Supabase, nothing leaves).
//   A. Node, the handlers themselves:
//      A1 set-up: 💎 Team access → Add with the Marketing Manager profile accepts a personal e-mail (row: profile
//         marketing, active false, mkt_active true); before docs/marketing-role.sql is run the answer SAYS to run it;
//      A2 first sign-in: his "choose your own password" can be finished (staff-admin password-changed answers him);
//      A3 forgot password: the reset link reaches his personal address, also in data-entry mode; a random address never;
//      A4 every function by URL with his sign-in: none gives him more than a signed-in stranger, except the marketing
//         doors (soc, mkt, mkt2, referral — redacted / read-only);
//      A5 soc / mkt / mkt2 / referral: every admin / company operation refuses him; only gc_mkt_v1 through soc;
//         his To-Do only; approvals only the marketing ones he may decide;
//      A6 approvals: a draft he queues waits; an approved campaign / post / a queued post he edits afterwards does NOT go
//         out with his unapproved text; nothing reaches a customer;
//      A7 staff mail: the monthly marketing report, auto-wins staff mail and the reset link reach his personal address in
//         data-entry mode.
//   B. Browser, the owner: 💎 → Team access → Marketing Manager profile with a personal e-mail; ⚙ Admin → Employees →
//      Role "Marketing Manager" → "Open Team access (filled in)".
//   C. Browser, Malcolm on a desktop (1366×768): first sign-in with the temporary password → choose his own → the
//      welcome / tour → Marketing home (screenshot) → every left-menu tab and every Marketing section, every button →
//      his To-Do, 💎 menu, GrayCo Systems (marketing links), Lobby TV offers → forced routes (#jobs, #invoices …,
//      _setView of every company screen) are refused → nothing he did wrote gc_kv except through soc.js; no 401 / 403 /
//      5xx from our functions, no page error, no refused call loop.
//   D. Browser, Malcolm on a phone (390 wide): the forgot-password link from the e-mail → set a new password → signed in
//      → Marketing home (screenshot) → every tab.
// Env: PARTS (default "A,B,C,D"), SHOTS (screenshot folder), CLICKS (max buttons per section, default 30), FN_TIMEOUT.
// Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wUPG/harness.mjs').href);
const { computer, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_MKTGATE.mjs <build-dir> <mirror.json>'); process.exit(2); }
process.env.FN_TIMEOUT = process.env.FN_TIMEOUT || '12000';
const B = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'officefix_bridge.mjs')).href);
const PARTS = String(process.env.PARTS || 'A,B,C,D').split(','), CLICKS = +(process.env.CLICKS || 30);
const OWNER = 'wjohnson@grayco-cs.com', OFFICE = 'office@grayco-cs.com', PM = 'sbiffle@grayco-cs.com';
const MM = 'malcolm@adventuresmedia.com', MMNAME = 'Malcolm Lane', RANDOM = 'someone.random.test@gmail.com';
let fails = 0; const T = []; const ok = (c, m, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); T.push({ c: !!c, m }); if (!c) fails++; };
process.on('unhandledRejection', e => console.log('     (unhandled rejection: ' + String(e && e.message || e).slice(0, 160) + ')'));

const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
function loadCloud(){ cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
loadCloud();
const STAFF = [
  { email: OWNER, name: 'Wesley Johnson', role: 'admin', profile: null, active: true, payroll: true, mkt_active: false },
  { email: OFFICE, name: 'Brittany Pucket', role: 'staff', profile: null, active: true, payroll: true, mkt_active: false },
  { email: PM, name: 'Steven Biffle', role: 'staff', profile: null, active: true, mkt_active: false } ];
const bridge = B.installBridge({ build: BUILD, cloud, accounts: ACCOUNTS, staffRows: STAFF });
const staffT = bridge.tables.get('gc_staff');
const req = createRequire(path.join(BUILD, 'netlify', 'functions', 'x.js'));
const call = (email, method, name, search, body) => bridge.call({ method, name, search: search || '', headers: email ? { authorization: 'Bearer ntok:' + email } : {}, body: body == null ? null : JSON.stringify(body) });
const jb = r => { try { return JSON.parse(Buffer.isBuffer(r.body) ? r.body.toString() : r.body || '{}'); } catch (e) { return {}; } };
const kvv = k => { const r = cloud.get(k); let v = r && r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const kvSet = (k, v, asString) => cloud.set(k, { key: k, value: asString ? JSON.stringify(v) : v, updated_at: new Date().toISOString() });
const qList = () => { const v = kvv('gc_approval_queue'); return Array.isArray(v) ? v : (v && v.list) || []; };

/* the test's own hooks over the bridge's fetch: Supabase's recovery link, and "marketing-role.sql not run yet" */
const HOOK = { noMktCol: false, noMktProfile: false, links: [] };
{ const inner = globalThis.fetch;
  globalThis.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url); const m = String((init && init.method) || 'GET').toUpperCase();
    const body = init && typeof init.body === 'string' ? init.body : '';
    if (/supabase\.co\/auth\/v1\/admin\/generate_link/.test(url)) { const th = 'th-' + Math.random().toString(36).slice(2, 12); HOOK.links.push({ email: (JSON.parse(body || '{}') || {}).email, th }); return new Response(JSON.stringify({ properties: { hashed_token: th } }), { status: 200, headers: { 'content-type': 'application/json' } }); }
    if (/supabase\.co\/rest\/v1\/gc_staff/.test(url) && (HOOK.noMktCol || HOOK.noMktProfile)) {
      if (m !== 'GET' && HOOK.noMktCol && /"mkt_active"/.test(body)) return new Response(JSON.stringify({ code: 'PGRST204', message: "Could not find the 'mkt_active' column of 'gc_staff' in the schema cache" }), { status: 400, headers: { 'content-type': 'application/json' } });
      if (m !== 'GET' && HOOK.noMktProfile && /"profile":"marketing"/.test(body)) return new Response(JSON.stringify({ code: '23514', message: 'new row for relation "gc_staff" violates check constraint "gc_staff_profile_known"' }), { status: 400, headers: { 'content-type': 'application/json' } });
      if (m === 'GET' && HOOK.noMktCol) { const r = await inner(input, init); const j = await r.json().catch(() => []); return new Response(JSON.stringify((Array.isArray(j) ? j : []).map(x => { const o = Object.assign({}, x); delete o.mkt_active; return o; })), { status: r.status, headers: { 'content-type': 'application/json' } }); }
    }
    return inner(input, init);
  };
}
const extTo = (from, re) => bridge.EXT.slice(from).filter(x => x.host === 'api.resend.com').map(x => x.b).filter(b => re.test(b));
const STAFF_RE = /@([a-z0-9-]+\.)*grayco-cs\.com/i;
/* every e-mail / text / post that left (to the fake hosts) after `from`, to someone who is not staff */
function custOut(from){
  return bridge.EXT.slice(from).filter(x => {
    if (x.host === 'api.resend.com') { let j = {}; try { j = JSON.parse(x.b); } catch (e) { return /@/.test(x.b) && !STAFF_RE.test(x.b); } const to = [].concat(j.to || [], j.cc || [], j.bcc || []).map(String); return to.some(a => !STAFF_RE.test(a) && a.toLowerCase().indexOf(MM) < 0); }
    if (/twilio\.com$/.test(x.host)) return x.m !== 'GET';
    if (/graph\.facebook\.com|mybusiness|linkedin|tiktok|ayrshare|googleads/.test(x.host)) return x.m !== 'GET';
    return false;
  }).map(x => x.host + x.p);
}

/* ══ A. the handlers ══ */
if (PARTS.includes('A')) {
  console.log('── A1. set-up: 💎 Team access → Add (Marketing Manager profile), a personal e-mail');
  HOOK.noMktCol = true;
  let r = await call(OWNER, 'POST', 'staff-admin', '', { action: 'add', email: 'mm.before.sql@adventuresmedia.com', name: 'Before SQL', role: 'staff', profile: 'marketing' });
  ok(r.status >= 400 && /marketing-role\.sql/.test(jb(r).error || ''), 'marketing-role.sql NOT run (no mkt_active column): Add says to run docs/marketing-role.sql', [r.status, jb(r).error]);
  HOOK.noMktCol = false; HOOK.noMktProfile = true;
  r = await call(OWNER, 'POST', 'staff-admin', '', { action: 'add', email: 'mm.before.sql2@adventuresmedia.com', name: 'Before SQL', role: 'staff', profile: 'marketing' });
  ok(r.status >= 400 && /marketing-role\.sql/.test(jb(r).error || ''), 'marketing-role.sql NOT run (profile check without "marketing"): Add says to run docs/marketing-role.sql', [r.status, jb(r).error]);
  HOOK.noMktProfile = false; staffT.delete('mm.before.sql@adventuresmedia.com'); staffT.delete('mm.before.sql2@adventuresmedia.com');
  r = await call(OWNER, 'POST', 'staff-admin', '', { action: 'add', email: MM, name: MMNAME, role: 'staff', profile: 'marketing' });
  const add = jb(r), row = staffT.get(MM);
  ok(r.status === 200 && add.ok && typeof add.tempPassword === 'string' && add.tempPassword.length >= 12, 'Add (personal e-mail ' + MM + ', profile Marketing Manager) → 200 + a temporary password', [r.status, add.error]);
  ok(!!row && row.profile === 'marketing' && row.active === false && row.mkt_active === true && row.role === 'staff', 'his gc_staff row: profile marketing, active false, mkt_active true, role staff', row);
  r = await call(OWNER, 'POST', 'staff-admin', '', { action: 'add', email: 'x@y.com', name: 'Bad', role: 'admin', profile: 'marketing' });
  ok(r.status === 400, 'an admin cannot have the Marketing Manager profile (400)', r.status);
  r = await call(OWNER, 'GET', 'staff-admin', '?action=list'); ok(r.status === 200 && (jb(r).staff || []).some(x => x.email === MM && x.profile === 'marketing' && x.mkt_active === true), 'Team access list shows him with the Marketing Manager profile', (jb(r).staff || []).find(x => x.email === MM));
  r = await call(MM, 'GET', 'staff-admin', '?action=list'); ok(r.status === 403, 'he cannot open Team access (staff-admin list → 403)', r.status);
  r = await call(MM, 'POST', 'staff-admin', '', { action: 'add', email: 'friend@gmail.com', name: 'x', role: 'admin' }); ok(r.status === 403, 'he cannot add a person (403)', r.status);
  r = await call(MM, 'POST', 'staff-admin', '', { action: 'reset', email: OWNER }); ok(r.status === 403, 'he cannot reset someone\'s password (403)', r.status);

  console.log('── A2. first sign-in: choose his own password');
  r = await call(MM, 'POST', 'staff-admin', '', { action: 'password-changed' });
  ok(r.status === 200 && jb(r).ok === true, 'the "choose your own password" finish (staff-admin password-changed) answers HIM → 200 (it was 403: stuck on that screen)', [r.status, jb(r).error]);
  r = await call(RANDOM, 'POST', 'staff-admin', '', { action: 'password-changed' }); ok(r.status === 403, 'a signed-in stranger still gets 403 there', r.status);
  r = await call(null, 'POST', 'staff-admin', '', { action: 'password-changed' }); ok(r.status === 401, 'no sign-in → 401', r.status);

  console.log('── A3. forgot password → the link e-mail');
  const PR = req('./password-reset.js'); PR._minMs = 0;
  process.env.RESEND_API_KEY = 're_test_fake_not_a_key'; delete process.env.PORTAL_MAIL_OFF;
  const PAUSE = req('./_lib/pause.js'), SM = req('./_lib/staff-mail.js');
  for (const paused of [false, true]) {
    if (paused) kvSet(PAUSE.KEY, { on: true, by: 'test' }); else cloud.delete(PAUSE.KEY);
    PAUSE.reset(); SM._reset(); PR._test.mem.clear();
    const n0 = bridge.EXT.length;
    r = await call(null, 'POST', 'password-reset', '', { email: MM });
    const sent = extTo(n0, new RegExp(MM.replace(/[.@]/g, '\\$&')));
    ok(r.status === 200 && sent.length === 1 && /token_hash=th-/.test(sent[0]), 'forgot password' + (paused ? ' in data-entry mode' : '') + ': the reset link goes to ' + MM, { status: r.status, sent: sent.length });
    const n1 = bridge.EXT.length; r = await call(null, 'POST', 'password-reset', '', { email: RANDOM });
    ok(r.status === 200 && bridge.EXT.length === n1, 'forgot password for a random gmail.com address: same answer, nothing sent', r.status);
  }
  cloud.delete(PAUSE.KEY); PAUSE.reset();
  delete process.env.RESEND_API_KEY; process.env.PORTAL_MAIL_OFF = '1';

  console.log('── A4. every function by its URL, with his sign-in');
  const SCH = bridge.SCHED;
  const fns = fs.readdirSync(path.join(BUILD, 'netlify', 'functions')).filter(f => /\.js$/.test(f)).map(f => f.replace(/\.js$/, '')).filter(n => !SCH.has(n) && !/-background$/.test(n)).sort();
  const MKT_DOORS = { soc: 1, mkt: 1, mkt2: 1, referral: 1 };
  const more = [], seen = {};
  const nEXT = bridge.EXT.length;
  for (const fn of fns) {
    for (const [m, q, b] of [['GET', '?action=list', null], ['POST', '', {}], ['POST', '', { action: 'list', op: 'list' }]]) {
      let a, s, x;
      try { a = await call(MM, m, fn, q, b); s = await call(RANDOM, m, fn, q, b); x = await call(null, m, fn, q, b); } catch (e) { more.push(fn + ' threw ' + String(e.message).slice(0, 80)); continue; }
      const gate = st => st === 401 || st === 403;
      if (!gate(a.status) && (gate(s.status) || gate(x.status)) && !MKT_DOORS[fn]) more.push(m + ' ' + fn + q + ' ' + (b ? JSON.stringify(b) : '') + ' → him ' + a.status + ', a stranger ' + s.status + ', nobody ' + x.status);
      if (!gate(a.status) && (gate(s.status) || gate(x.status))) seen[fn] = (seen[fn] || []).concat(m + ' ' + a.status);
    }
  }
  ok(!more.length, 'no function (other than soc / mkt / mkt2 / referral) gives him more than a signed-in stranger (' + fns.length + ' functions × 3 calls)', more.slice(0, 12));
  console.log('     functions that know him: ' + JSON.stringify(seen));
  ok(!custOut(nEXT).length, 'nothing reached a customer during the sweep', custOut(nEXT).slice(0, 5));
  for (const fn of ['invoice-track', 'paystubs', 'qb-proxy', 'money-intake', 'field-ops', 'comms', 'texts', 'mail-center', 'portal', 'lien', 'auto-wins', 'staff-admin', 'automation-pause', 'gc-portal', 'subportal', 'x10', 'brain', 'mail-all', 'weekly-update', 'selections', 'walkthrough']) {
    if (!fs.existsSync(path.join(BUILD, 'netlify', 'functions', fn + '.js')) || SCH.has(fn)) continue;
    const a = await call(MM, 'POST', fn, '', { action: 'list', op: 'list' }), s = await call(RANDOM, 'POST', fn, '', { action: 'list', op: 'list' });
    ok(a.status === 401 || a.status === 403 || (a.status === s.status && a.status >= 400), fn + ': he gets no more than a stranger (' + a.status + ' / stranger ' + s.status + ')', String(a.body).slice(0, 120));
  }

  console.log('── A5. the marketing doors: only marketing');
  /* seed: a marketing approval he may decide, one he may not, a company one, a To-Do of someone else */
  const NOW = new Date().toISOString(), LATER0 = () => new Date(Date.now() + 60e3).toISOString();
  const q0 = qList();
  q0.push({ id: 'appr_mkt_T_MMOK', kind: 'social_post', title: '📣 Marketing — social post (test, his to decide)', to: 'Facebook', subject: 'x', html: '<p>x</p>', steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: NOW, updatedAt: NOW, mmOk: true, meta: { recId: 'P_MMOK', coll: 'posts' } });
  q0.push({ id: 'appr_mkt_T_ADMIN', kind: 'mkt_campaign', title: '📣 Marketing — e-mail (test, admins only)', to: '12 customers', subject: 'Fall check', html: '<p>x</p>', steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: NOW, updatedAt: NOW, mmOk: false, meta: { recId: 'C_ADMIN', coll: 'campaigns' } });
  kvSet('gc_approval_queue', q0, true);
  const companyItem = q0.find(x => !/^mkt_|social_post|soc_week|winback/.test(x.kind) && x.status === 'waiting');
  const tl = kvv('gc_office_tasks'); const otherTask = (Array.isArray(tl) ? tl : []).find(t => t && !t.done && (t.assignees || []).every(a => String(a).toLowerCase() !== MM));
  const doc0 = kvv('gc_mkt_v1') || {};
  doc0.posts = Object.assign({}, doc0.posts, { P_MMOK: { id: 'P_MMOK', title: 'Test post', caption: 'Roof done in Bartlett', status: 'waiting', apprId: 'appr_mkt_T_MMOK', networks: ['facebook'], at: NOW } });
  kvSet('gc_mkt_v1', doc0);
  for (const [op, extra, why] of [['set_stage', { stage: 3 }, 'change the approval stage'], ['connect', { platform: 'facebook' }, 'connect a social account'], ['disconnect', { platform: 'facebook' }, 'disconnect a social account'],
    ['mm_settings', { set: { approvesStage2: true, soldValues: true } }, 'change his own settings'], ['feature_requests', {}, 'read the feature request log'], ['mf_ba_run', {}, 'run before / after posts by hand'],
    ['mf_report_cfg', { set: { to: [MM] } }, 'change who gets the monthly report'], ['mf_report_send', {}, 'send the monthly report'], ['mm_kv_read', { key: 'projects' }, 'read the jobs (gc_kv projects)'],
    ['mm_kv_read', { key: 'invoices' }, 'read the invoices'], ['mm_kv_write', { key: 'projects', value: { x: 1 } }, 'write the jobs'], ['mm_kv_write', { key: 'gc_approval_queue', value: { x: 1 } }, 'write the approvals list'],
    ['mm_kv_write', { key: 'gc_mkt_admin', value: { mm: { approvesStage2: true } } }, 'write the admins\' marketing settings'], ['mm_file', { ref: 'sb:crm-files/not-marketing.pdf' }, 'open a file that is not marketing'],
    ['mm_queue', { kind: 'mkt_payout', recId: 'x' }, 'send a payout for approval'], ['mm_queue', { kind: 'mkt_ad', recId: 'x' }, 'send an ad spend for approval'], ['nonesuch', {}, 'an unknown operation']]) {
    r = await call(MM, 'POST', 'soc', '', Object.assign({ op }, extra));
    ok(r.status === 403 || r.status === 400 || r.status === 404, 'soc ' + op + ': he cannot ' + why + ' (' + r.status + ')', jb(r).error);
  }
  ok(!(kvv('gc_mkt_admin') && kvv('gc_mkt_admin').mm && kvv('gc_mkt_admin').mm.by === MM), 'gc_mkt_admin untouched by him');
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_kv_write', key: 'gc_mkt_v1', value: { cfg: { main: { id: 'main', apprStage: { stage: 3 }, mm: { approvesStage2: true }, at: new Date(Date.now() + 5e3).toISOString() } } } });
  const cfgNow = (kvv('gc_mkt_v1').cfg || {}).main || {};
  ok(!(cfgNow.apprStage && +cfgNow.apprStage.stage === 3), 'through soc he cannot move the approval stage (cfg.apprStage kept)', cfgNow.apprStage);
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_tasks' }); const mine = jb(r).tasks || [];
  const rawT = kvv('gc_office_tasks'), MMlib = req('./_lib/mm.js'), his = (Array.isArray(rawT) ? rawT : []).filter(t => MMlib.mine(t, MM)).map(t => String(t.id));
  ok(r.status === 200 && mine.length === his.length && mine.every(t => his.includes(String(t.id))), 'My To-Do: exactly his own to-dos (' + mine.length + ' — assigned to ' + MM + ')', mine.map(t => t.id).slice(0, 5));
  if (otherTask) { r = await call(MM, 'POST', 'soc', '', { op: 'mm_task', id: otherTask.id, done: true }); ok(r.status === 403, 'he cannot tick someone else\'s to-do (403)', r.status); }
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_task', add: { label: 'MKTGATE test to-do' } }); ok(r.status === 200 && jb(r).ok, 'he can add his own to-do', r.status);
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_approvals' }); const ap = jb(r).items || [];
  ok(r.status === 200 && ap.every(x => /^(mkt_|social_post|soc_week|winback)/.test(x.kind)), 'his Approvals list: marketing items only (' + ap.length + ')', [...new Set(ap.map(x => x.kind))]);
  if (companyItem) { r = await call(MM, 'POST', 'soc', '', { op: 'mm_approve', id: companyItem.id, decision: 'approve' }); ok(r.status === 403, 'he cannot approve a company item (' + companyItem.kind + ') → 403', r.status); }
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_approve', id: 'appr_mkt_T_ADMIN', decision: 'approve' }); ok(r.status === 403, 'he cannot approve a marketing e-mail that needs an admin → 403', r.status);
  for (const op of ['send', 'test', 'save_audience', 'schedule', 'delete']) { r = await call(MM, 'POST', 'mkt', '', { op }); ok(r.status === 403, 'mkt ' + op + ': refused (' + r.status + ')', jb(r).error); }
  r = await call(MM, 'POST', 'mkt2', '', { op: 'coupon_redeem', code: 'GC100-AAAA-BBBB' }); ok(r.status === 403, 'mkt2 coupon_redeem: refused (403)', r.status);
  r = await call(MM, 'GET', 'referral', '?list=1'); const rl = jb(r);
  ok(r.status === 200 && rl.readOnly === true && (rl.members || []).every(m => /^Member \d+$|^a member$/.test(m.name) && !m.code && !m.email && !m.phone), 'referral list: read-only, no names / codes / contacts', (rl.members || []).slice(0, 2));
  r = await call(MM, 'POST', 'referral', '', { action: 'member', name: 'X', email: 'x@y.com' }); ok(r.status === 403, 'referral: he cannot add a member (403)', r.status);
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_kv_read', key: 'gc_mkt_v1' });
  ok(r.status === 200 && !/@(?!grayco-cs\.com)[a-z0-9-]+\.[a-z]{2,}/i.test(JSON.stringify(jb(r).value || {}).replace(/\[e-mail hidden\]/g, '')), 'the marketing document he reads carries no customer e-mail address');

  /* 📺 Lobby TV → 🏷 Offers: he reads them and saves his; his new / changed offers wait for an admin, approved ones stay */
  kvSet('gc_lobby_offers', { offers: { of_ok: { id: 'of_ok', h: 'Free roof check', on: true, pending: false, approvedBy: 'Wesley Johnson', at: NOW }, of_ok2: { id: 'of_ok2', h: 'Spring special', on: true, pending: false, at: NOW } } });
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_lobby_offers' });
  ok(r.status === 200 && jb(r).value && Object.keys(jb(r).value.offers || {}).length === 2, 'Lobby TV offers: he reads the offers (soc mm_lobby_offers)', [r.status, jb(r).error]);
  const offs = jb(r).value.offers; offs.of_new = { id: 'of_new', h: 'His new offer', on: true, pending: false, at: LATER0() }; offs.of_ok2 = Object.assign({}, offs.of_ok2, { h: 'Spring special — 10% off', pending: false });
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_lobby_offers', value: { offers: offs } });
  const lo = kvv('gc_lobby_offers').offers;
  ok(r.status === 200 && lo.of_new && lo.of_new.pending === true && lo.of_ok2.pending === true && lo.of_ok.pending === false && lo.of_ok.approvedBy === 'Wesley Johnson', 'Lobby TV offers: his new and changed offers are saved WAITING for an admin; the untouched approved one stays approved', { st: r.status, of_new: lo.of_new && lo.of_new.pending, of_ok2: lo.of_ok2.pending, of_ok: lo.of_ok.pending });

  console.log('── A6. approvals: nothing goes out without the approval');
  const n6 = bridge.EXT.length, LATER = () => new Date(Date.now() + 60e3).toISOString();
  const d6 = kvv('gc_mkt_v1');
  d6.campaigns = Object.assign({}, d6.campaigns, { C_OK: { id: 'C_OK', title: 'Approved fall e-mail', subject: 'Approved subject', body: 'Approved body', status: 'approved', apprId: 'appr_mkt_C_OK_1', approvedBy: 'Wesley Johnson', approvedAt: NOW, scheduleAt: new Date(Date.now() + 86400e3).toISOString(), aud: 'all', at: NOW } });
  d6.posts = Object.assign({}, d6.posts, { P_OK: { id: 'P_OK', title: 'Approved post', caption: 'Approved caption', status: 'approved', apprId: 'appr_mkt_P_OK_1', approvedBy: 'Wesley Johnson', networks: ['facebook'], scheduleAt: new Date(Date.now() + 86400e3).toISOString(), at: NOW },
    P_W: { id: 'P_W', title: 'Waiting post', caption: 'Caption the admin sees', status: 'waiting', apprId: 'appr_mkt_P_W_1', networks: ['facebook'], scheduleAt: new Date(Date.now() + 86400e3).toISOString(), at: NOW } });
  kvSet('gc_mkt_v1', d6);
  const q6 = qList(); q6.push({ id: 'appr_mkt_P_W_1', kind: 'social_post', title: '📣 Marketing — social post (Facebook)', to: 'Facebook', subject: 'Waiting post', html: '<div>Caption the admin sees</div>', steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: NOW, updatedAt: NOW, meta: { recId: 'P_W', coll: 'posts' } });
  kvSet('gc_approval_queue', q6, true);
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_kv_write', key: 'gc_mkt_v1', value: {
    campaigns: { C_OK: { id: 'C_OK', title: 'Approved fall e-mail', subject: 'HIS NEW SUBJECT', body: 'HIS NEW BODY', approvedHtml: '<p>HIS HTML</p>', status: 'approved', at: LATER() } },
    posts: { P_OK: { id: 'P_OK', title: 'Approved post', caption: 'HIS NEW CAPTION', status: 'approved', at: LATER() }, P_W: { id: 'P_W', title: 'Waiting post', caption: 'HIS SWAPPED CAPTION', status: 'waiting', at: LATER() } } } });
  ok(r.status === 200, 'he saves edits to an approved e-mail, an approved post and a waiting post (soc mm_kv_write 200)', [r.status, jb(r)]);
  const d7 = kvv('gc_mkt_v1'), c7 = d7.campaigns.C_OK, p7 = d7.posts.P_OK, w7 = d7.posts.P_W;
  const goesOut = (rec, re) => /^(approved|sending|posting)$/.test(rec.status) && re.test(JSON.stringify(rec));
  ok(!goesOut(c7, /HIS (NEW|HTML)/), 'an APPROVED customer e-mail he edits afterwards does not go out with his text (needs approving again)', { status: c7.status, subject: c7.subject, approvedHtml: c7.approvedHtml });
  ok(!goesOut(p7, /HIS NEW CAPTION/), 'an APPROVED post he edits afterwards does not go out with his text', { status: p7.status, caption: p7.caption });
  const PORTAL = req('./portal.js')._core;
  const ad = await PORTAL.approvalAction({ op: 'approve', id: 'appr_mkt_P_W_1' }, { ok: true, email: OWNER, role: 'admin', name: 'Wesley Johnson' });
  const w8 = kvv('gc_mkt_v1').posts.P_W;
  ok(!goesOut(w8, /HIS SWAPPED CAPTION/), 'a post waiting on Approvals that he edits, then the admin approves (the old text): his new text does not go out', { approve: ad.status, status: w8.status, caption: w8.caption });
  ok(ad.status >= 400 && /changed this draft after it was sent for approval/.test((ad.out || {}).error || ''), '… and the admin is told why it was not sent', ad.out && ad.out.error);
  /* the normal flows still work: he pauses / un-pauses an approved post (status only); an admin approves an untouched waiting post */
  const dA = kvv('gc_mkt_v1'); dA.posts.P_PZ = { id: 'P_PZ', title: 'Pause me', caption: 'Approved words', status: 'approved', apprId: 'appr_mkt_P_PZ_1', networks: ['facebook'], scheduleAt: new Date(Date.now() + 86400e3).toISOString(), at: NOW };
  dA.posts.P_UT = { id: 'P_UT', title: 'Untouched', caption: 'Untouched words', status: 'waiting', apprId: 'appr_mkt_P_UT_1', networks: ['facebook'], scheduleAt: new Date(Date.now() + 86400e3).toISOString(), at: NOW }; kvSet('gc_mkt_v1', dA);
  const qA = qList(); qA.push({ id: 'appr_mkt_P_UT_1', kind: 'social_post', title: '📣 Marketing — social post (Facebook)', to: 'Facebook', subject: 'Untouched', html: '<div>Untouched words</div>', steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: NOW, updatedAt: NOW, meta: { recId: 'P_UT', coll: 'posts' } }); kvSet('gc_approval_queue', qA, true);
  await call(MM, 'POST', 'soc', '', { op: 'mm_kv_write', key: 'gc_mkt_v1', value: { posts: { P_PZ: { id: 'P_PZ', title: 'Pause me', caption: 'Approved words', status: 'paused', networks: ['facebook'], scheduleAt: dA.posts.P_PZ.scheduleAt, at: LATER() } } } });
  const pz1 = kvv('gc_mkt_v1').posts.P_PZ.status;
  await call(MM, 'POST', 'soc', '', { op: 'mm_kv_write', key: 'gc_mkt_v1', value: { posts: { P_PZ: { id: 'P_PZ', title: 'Pause me', caption: 'Approved words', status: 'approved', networks: ['facebook'], scheduleAt: dA.posts.P_PZ.scheduleAt, at: new Date(Date.now() + 120e3).toISOString() } } } });
  const pz2 = kvv('gc_mkt_v1').posts.P_PZ;
  ok(pz1 === 'paused' && pz2.status === 'approved' && pz2.apprId === 'appr_mkt_P_PZ_1', 'he can still pause and un-pause an approved post (no edit → stays approved)', { pz1, pz2: pz2.status, apprId: pz2.apprId });
  const adU = await PORTAL.approvalAction({ op: 'approve', id: 'appr_mkt_P_UT_1' }, { ok: true, email: OWNER, role: 'admin', name: 'Wesley Johnson' });
  ok(adU.status === 200 && kvv('gc_mkt_v1').posts.P_UT.status === 'approved', 'an admin approving an untouched waiting post still approves it', [adU.status, kvv('gc_mkt_v1').posts.P_UT.status]);
  /* his own draft → Approvals (waiting, an admin at stage 1) */
  const d9 = kvv('gc_mkt_v1'); d9.posts.P_NEW = { id: 'P_NEW', title: 'His draft', caption: 'Fresh roof in Collierville — see the photos!', status: 'draft', networks: ['facebook'], at: NOW }; kvSet('gc_mkt_v1', d9);
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_queue', kind: 'social_post', recId: 'P_NEW' });
  const it9 = qList().find(x => x.id === jb(r).id);
  ok(r.status === 200 && !!it9 && it9.status === 'waiting' && kvv('gc_mkt_v1').posts.P_NEW.status === 'waiting', 'his draft post → ✅ Approvals, waiting (it is not posted)', [r.status, jb(r).error, it9 && it9.status, it9 && it9.mmOk]);
  ok(!(it9 && it9.mmOk) , 'at stage 1 (today) an admin decides it, not he (mmOk false)', it9 && it9.mmOk);
  r = await call(MM, 'POST', 'soc', '', { op: 'mm_approve', id: it9 && it9.id, decision: 'approve' }); ok(r.status === 403, 'he cannot approve his own draft at stage 1 (403)', r.status);
  /* for the report: what changes at approval stage 2 (an admin setting) — he may then approve unflagged drafts himself */
  const dS = kvv('gc_mkt_v1'); const cfg0 = JSON.stringify((dS.cfg || {}).main || null); dS.cfg = Object.assign({}, dS.cfg, { main: Object.assign({ id: 'main' }, (dS.cfg || {}).main, { apprStage: { stage: 2, since: NOW } }) });
  dS.posts.P_S2 = { id: 'P_S2', title: 'Stage 2 post', caption: 'New siding in Arlington — before and after', status: 'draft', networks: ['facebook'], at: NOW };
  dS.campaigns.C_S2 = { id: 'C_S2', title: 'Stage 2 e-mail', subject: 'Fall gutter check', body: 'Is your gutter ready for fall?', status: 'draft', aud: 'all', at: NOW }; kvSet('gc_mkt_v1', dS);
  const s2p = jb(await call(MM, 'POST', 'soc', '', { op: 'mm_queue', kind: 'social_post', recId: 'P_S2' })), s2c = jb(await call(MM, 'POST', 'soc', '', { op: 'mm_queue', kind: 'mkt_campaign', recId: 'C_S2' }));
  const i2p = qList().find(x => x.id === s2p.id), i2c = qList().find(x => x.id === s2c.id);
  console.log('     (stage 2, for the report) his social post → mmOk ' + (i2p && i2p.mmOk) + ' flags ' + JSON.stringify(i2p && i2p.flags) + ' · his customer e-mail → mmOk ' + (i2c && i2c.mmOk) + ' flags ' + JSON.stringify(i2c && i2c.flags) + (s2c.error ? ' (' + s2c.error + ')' : ''));
  if (i2p && i2p.mmOk) { const sa = await call(MM, 'POST', 'soc', '', { op: 'mm_approve', id: i2p.id, decision: 'approve' }); console.log('     (stage 2) he approves his OWN post → ' + sa.status + ' ' + JSON.stringify(jb(sa)).slice(0, 120)); }
  const dR = kvv('gc_mkt_v1'); dR.cfg.main = JSON.parse(cfg0) || { id: 'main' }; kvSet('gc_mkt_v1', dR);
  ok(!custOut(n6).length, 'nothing reached a customer or a social network', custOut(n6));

  console.log('── A7. staff mail to his personal address (data-entry mode)');
  kvSet(PAUSE.KEY, { on: true, by: 'test' }); PAUSE.reset(); SM._reset();
  process.env.RESEND_API_KEY = 're_test_fake_not_a_key'; delete process.env.PORTAL_MAIL_OFF;
  r = await call(OWNER, 'POST', 'soc', '', { op: 'mf_report_cfg', set: { to: [OWNER, MM] } });
  ok(r.status === 200 && (jb(r).to || []).includes(MM), 'the owner adds him to the monthly marketing report (his personal address is kept)', [r.status, jb(r).to]);
  const MF = req('./_lib/mktfeat.js'); const n7 = bridge.EXT.length;
  const rep = await MF.sendReport({ month: new Date().toISOString().slice(0, 7) });
  ok(extTo(n7, new RegExp(MM.replace(/[.@]/g, '\\$&'))).length >= 1, 'data-entry mode: the monthly marketing report reaches ' + MM, { ok: rep.ok, to: rep.to, err: rep.error });
  const AC = req('./_lib/auto-common.js'); const n8 = bridge.EXT.length;
  await AC.staffMail([MM, RANDOM], 'Digest (test)', '<p>x</p>');
  const s8 = bridge.EXT.slice(n8).filter(x => x.host === 'api.resend.com').map(x => x.b).join(' ');
  ok(s8.indexOf(MM) >= 0 && s8.indexOf(RANDOM) < 0, 'data-entry mode: a staff digest reaches him, never the random address');
  delete process.env.RESEND_API_KEY; process.env.PORTAL_MAIL_OFF = '1'; cloud.delete(PAUSE.KEY); PAUSE.reset();
}

/* ══ the browser ══ */
const SBH = 'ieeonhpfahmwwecizdut.supabase.co';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwtOf = t => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString()); } catch (e) { return null; } };
const tokEmail = auth => { const t = String(auth || '').replace(/^Bearer\s+/i, ''); const j = t.split('.').length === 3 ? jwtOf(t) : null; return j && j.email ? String(j.email).toLowerCase() : bridge.emailOf(auth); };
/* Malcolm's sign-ins (Supabase Auth as production has it: JWTs with app_metadata.must_change_password) */
const AUTH = { pw: '', must: true, n: 0, puts: 0 };
const mmUser = () => ({ id: 'id-' + MM, email: MM, app_metadata: { must_change_password: AUTH.must } });
function mmSession(){ AUTH.n++; const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'id-' + MM, email: MM, role: 'authenticated', exp, app_metadata: { must_change_password: AUTH.must }, n: AUTH.n }) + '.sig', refresh_token: 'rt-mm-' + AUTH.n, expires_in: 3600, expires_at: exp, token_type: 'bearer', user: mmUser() }; }
/* the server clears his mark (staff-admin → PUT /auth/v1/admin/users/<id> { app_metadata.must_change_password: false }) */
{ const inner = globalThis.fetch;
  globalThis.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    if (/supabase\.co\/auth\/v1\/admin\/users\/id-/.test(url) && String((init && init.method) || '').toUpperCase() === 'PUT' && /"must_change_password":false/.test(String(init.body || '')) && decodeURIComponent(url).indexOf(MM) > 0) AUTH.must = false;
    if (/supabase\.co\/auth\/v1\/admin\/users\/id-/.test(url) && String((init && init.method) || '').toUpperCase() === 'PUT' && /"must_change_password":true/.test(String(init.body || '')) && decodeURIComponent(url).indexOf(MM) > 0) AUTH.must = true;
    return inner(input, init);
  };
}
async function mmAuthRoutes(c){
  await c.ctx.route(u => { const x = new URL(u); return x.host === SBH && x.pathname.startsWith('/auth/v1/'); }, async r => {
    const rq = r.request(), u = new URL(rq.url()), m = rq.method(), h = rq.headers();
    const J = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: b == null ? '' : JSON.stringify(b) });
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    let bd = {}; try { bd = JSON.parse(rq.postData() || '{}'); } catch (e) {}
    const mine = tokEmail(h.authorization) === MM;
    (c.authLog = c.authLog || []).push(m + ' ' + u.pathname + u.search);
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
      if (String(bd.email).toLowerCase() === MM) return bd.password === AUTH.pw ? J(200, mmSession()) : J(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return r.fallback();
    }
    if (u.pathname === '/auth/v1/token' && /^rt-mm-/.test(String(bd.refresh_token || ''))) return J(200, mmSession());
    if (u.pathname === '/auth/v1/user' && mine) { if (m === 'PUT') { if (bd.password === AUTH.pw) return J(422, { error_code: 'same_password', msg: 'New password should be different from the old password.' }); AUTH.pw = bd.password; AUTH.puts++; } return J(200, mmUser()); }
    if (u.pathname === '/auth/v1/verify') { const l = HOOK.links.find(x => x.th === bd.token_hash && !x.used); if (!l) return J(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }); l.used = true; return J(200, mmSession()); }
    if (u.pathname === '/auth/v1/logout' && mine) return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    return r.fallback();
  });
}
/* gc_staff as each sign-in reads it (his own row only, as docs/marketing-role.sql's gc_mm_staff_self lets him) + every
   database request of his page recorded; our functions → the real handlers (his JWT → the bridge's sign-in) */
async function wire(c, who){
  c.db = []; c.calls = [];
  await c.ctx.route(u => { const x = new URL(u); return x.host === SBH && x.pathname.startsWith('/rest/'); }, async r => {
    const rq = r.request(), u = new URL(rq.url()), m = rq.method();
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const e = tokEmail(rq.headers().authorization);
    c.db.push({ m, p: u.pathname, k: u.searchParams.getAll('key').join('&'), who: e, phase: c.phase || '', key1: ((rq.postData() || '').slice(0, 300).match(/"key"\s*:\s*"([^"]+)"/) || [])[1] || '' });
    if (u.pathname === '/rest/v1/gc_staff') { const row = staffT.get(e); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(row ? [row] : []) }); }
    if (u.pathname === '/rest/v1/rpc/gc_my_access') { const row = staffT.get(e) || {}; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ email: e, staff: row.active !== false, admin: row.role === 'admin', payroll: !!row.payroll, office: e === OFFICE, sec2: 1 }) }); }
    return r.fallback();
  });
  await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, async r => {
    const rq = r.request(), u = new URL(rq.url()), name = u.pathname.split('/')[3] || '', m = rq.method();
    if (m === 'OPTIONS') return r.fulfill({ status: 204, body: '' });
    const hd = Object.assign({}, rq.headers()); const e = tokEmail(hd.authorization); if (e && hd.authorization && hd.authorization.split('.').length === 3) hd.authorization = 'Bearer ntok:' + e;
    const rec = { t: Date.now(), fn: name, m, q: u.search.slice(0, 160), b: (rq.postData() || '').slice(0, 200), phase: c.phase || '', who: e };
    c.calls.push(rec);
    let out; try { out = await bridge.call({ method: m, name, search: u.search, headers: hd, body: rq.postData() }); }
    catch (err) { out = { status: 500, headers: {}, body: JSON.stringify({ error: 'handler threw: ' + (err && err.message) }) }; rec.threw = String(err && err.stack || err).slice(0, 400); }
    rec.status = out.status; if (out.status >= 400) rec.err = (Buffer.isBuffer(out.body) ? '' : String(out.body)).slice(0, 200);
    const h2 = {}; Object.keys(out.headers || {}).forEach(k => { if (!/^access-control|^vary$/i.test(k)) h2[k] = String(out.headers[k]); });
    try { await r.fulfill({ status: out.status, headers: h2, body: out.body }); } catch (err) {}
  });
  await c.ctx.addInitScript(() => {
    window.__opened = []; window.open = function(u){ window.__opened.push(String(u || '')); return { closed: false, close(){}, focus(){}, document: { write(){}, close(){}, open(){} }, location: {} }; };
    try { window.print = function(){}; } catch (e) {}
  });
}
const vis = `window.__vis = e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none' && !e.disabled; }; true;`;
const SKIP = /sign ?out|log ?out|🚪|delete|remove|🗑|wipe|erase|restore|reset|backup|fresh start|print|download|export|\bcsv\b|\bpdf\b|void|merge|disable|archive|discard|clear all|uninstall|disconnect|refresh the crm|reload|update now|install|log in as|view as|switch user|take a tour|start tour|\?$|^✕$|^×$|^x$|close|cancel|^connect|copy/i;
/* the clickable things now: <main> (or the Marketing mount) and any overlay on top; never the left menu */
const COLLECT = `(() => { ${vis}
  const roots = [...document.querySelectorAll('main')].concat([...document.body.children].filter(e => { const st = getComputedStyle(e); return (st.position === 'fixed' || st.position === 'absolute') && +st.zIndex > 100 && e.getBoundingClientRect().height > 100 && !/gc-hub-panel|gc-hub-btn/.test(e.className + ' ' + e.id); }));
  const seen = {}, out = [];
  roots.forEach(root => root.querySelectorAll('button, [role=button], [data-a], select, a[href^="#"]').forEach(el => {
    if (!__vis(el) || el.closest('aside') || el.closest('nav.gc-mm-nav')) return;
    const t = (el.tagName === 'SELECT' ? 'SELECT:' + (el.name || el.getAttribute('data-ch') || el.id || (el.options[0] && el.options[0].text) || '') : (el.innerText || el.getAttribute('aria-label') || el.title || el.getAttribute('data-a') || '')).trim().replace(/\\s+/g, ' ').slice(0, 60);
    if (!t) return; seen[t] = (seen[t] || 0) + 1; out.push({ t, n: seen[t] - 1, a: el.getAttribute('data-a') || '' });
  }));
  return out; })()`;
async function clickOne(c, item){
  const p = c.page();
  const before = await c.ev(() => document.body.children.length).catch(() => 0);
  const hit = await c.ev(({ t, n, V }) => { eval(V);
    const roots = [...document.querySelectorAll('main')].concat([...document.body.children].filter(e => { const st = getComputedStyle(e); return (st.position === 'fixed' || st.position === 'absolute') && +st.zIndex > 100 && e.getBoundingClientRect().height > 100 && !/gc-hub-panel|gc-hub-btn/.test(e.className + ' ' + e.id); }));
    let k = 0;
    for (const root of roots) for (const el of root.querySelectorAll('button, [role=button], [data-a], select, a[href^="#"]')) {
      if (!__vis(el) || el.closest('aside') || el.closest('nav.gc-mm-nav')) continue;
      const tt = (el.tagName === 'SELECT' ? 'SELECT:' + (el.name || el.getAttribute('data-ch') || el.id || (el.options[0] && el.options[0].text) || '') : (el.innerText || el.getAttribute('aria-label') || el.title || el.getAttribute('data-a') || '')).trim().replace(/\s+/g, ' ').slice(0, 60);
      if (tt !== t) continue; if (k++ !== n) continue;
      if (el.tagName === 'SELECT') { const picks = [...el.options].map(o => o.value).slice(0, 4); for (const v of picks) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } return 'select:' + picks.length; }
      el.scrollIntoView({ block: 'center' }); el.click(); return 'click';
    }
    return null;
  }, Object.assign({ V: vis }, item)).catch(e => 'err:' + String(e.message).slice(0, 80));
  await sleep(1100);
  try { await p.keyboard.press('Escape'); } catch (e) {}
  await c.ev(n => { [...document.body.children].slice(n).forEach(e => { const st = getComputedStyle(e); if ((st.position === 'fixed' || st.position === 'absolute') && e.tagName !== 'SCRIPT' && !/gc-hub-btn|gc-mm|_gcPause|gc-pause/.test(e.id + ' ' + e.className)) e.remove(); }); }, before).catch(() => {});
  return hit;
}
/* one screen: open it, click every button once (re-opening the screen after each), record what each did */
async function screen(c, name, open, opts){
  opts = opts || {}; c.phase = name;
  const e0 = c.errs.length, k0 = c.calls.length;
  try { await open(); } catch (e) { ok(false, name + ': opens', String(e.message).slice(0, 120)); return { n: 0 }; }
  await sleep(opts.wait || 3000);
  const items = (await c.ev(COLLECT).catch(() => [])).filter(x => !SKIP.test(x.t) && !(opts.skip && opts.skip.test(x.t)));
  const uniq = [], seenT = {}; for (const x of items) { if (seenT[x.t] && x.n > 0) continue; seenT[x.t] = 1; uniq.push(x); }
  const list = uniq.slice(0, opts.clicks || CLICKS); let n = 0; const res = [];
  for (const it of list) {
    const k1 = c.calls.length, e1 = c.errs.length;
    const r = await clickOne(c, it); if (r) n++;
    const bad = c.calls.slice(k1).filter(x => x.status === 401 || x.status === 403 || x.status >= 500).map(x => x.fn + ' ' + x.status + ' ' + (x.err || '').slice(0, 80));
    res.push({ t: it.t, r, bad, err: c.errs.slice(e1).map(x => x.slice(0, 120)) });
    if (opts.reopen !== false) { try { await open(); } catch (e) {} await sleep(600); }
  }
  const text = await c.ev(() => (document.querySelector('main') || document.body).innerText.slice(0, 20000)).catch(() => '');
  (c.screens = c.screens || []).push({ name, total: uniq.length, clicked: n, res, errs: c.errs.slice(e0), calls: c.calls.slice(k0), text });
  console.log('     ' + name + ': clicked ' + n + ' of ' + uniq.length + ' (' + list.map(x => x.t).join(' | ').slice(0, 700) + ')');
  return { n, total: uniq.length, res, text };
}
const errsOf = c => c.errs.filter(e => !/ResizeObserver|Failed to load resource|net::ERR|AbortError|chrome-extension/i.test(e));
/* customer names from the real data — none may show on his screens */
const NAMES = (() => { const out = new Set(); const add = v => { v = String(v || '').trim(); if (/^[A-Z][a-z]+ [A-Z][a-z]{2,}$/.test(v) && !/GrayCo|Marketing|Malcolm|Wesley|Johnson|Brittany|Biffle|Thomas/.test(v)) out.add(v); };
  const g = k => { const r = rows.find(x => x.key === k); let v = r && r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; };
  g('customers').forEach(x => add(x && x.name)); g('projects').forEach(x => add(x && (x.client || x.clientName))); g('leads').forEach(x => add(x && x.name));
  return [...out].slice(0, 600); })();
const piiIn = t => NAMES.filter(n => t.indexOf(n) >= 0);

async function signInAs(c, email, pw){
  const p = c.page();
  await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
  await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(pw); await sleep(300);
  await p.locator('#gc-auth-submit').click();
}
const mmReady = c => waitFor(c, () => !!(window._gcMMData && window._gcIsMM && window._gcIsMM() && document.querySelectorAll('aside button').length > 3), null, 120000, 500);

let TEMP = '';
/* ══ B. the owner adds him ══ */
if (PARTS.includes('B')) {
  console.log('── B. the owner: 💎 → Team access → Marketing Manager profile (personal e-mail); Employees → Role "Marketing Manager"');
  staffT.delete(MM); loadCloud();
  const c = await computer('owner', { build: BUILD }); c.acceptConfirm = true; await wire(c, OWNER);
  await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
  await c.page().setViewportSize({ width: 1366, height: 768 });
  await signInAs(c, OWNER, ACCOUNTS[OWNER].pw);
  await waitFor(c, () => document.querySelectorAll('aside button[draggable="true"]').length > 5 && !!(window._crm && window._crm.projects && window._crm.projects.length), null, 150000, 500);
  await sleep(8000);
  const p = c.page(); await p.evaluate(vis);
  const ta = await p.evaluate(async ({ MM, MMNAME }) => {
    window._gcTeamAccess(); await new Promise(z => setTimeout(z, 2500));
    const e = document.getElementById('gcTaEmail'), n = document.getElementById('gcTaName'), pr = document.getElementById('gcTaProfile');
    if (!e || !pr) return { err: 'no form' };
    const opts = [...pr.options].map(o => o.value + '=' + o.text);
    e.value = MM; n.value = MMNAME; pr.value = 'marketing'; pr.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('gcTaAdd').click();
    for (let i = 0; i < 40; i++) { await new Promise(z => setTimeout(z, 250)); if (/can now sign in with this temporary password/.test(document.body.innerText)) break; }
    const box = [...document.querySelectorAll('div')].find(d => /can now sign in with this temporary password/.test(d.innerText || '') && d.querySelector('div[style*="monospace"]'));
    await new Promise(z => setTimeout(z, 1500));
    return { opts, placeholder: e.placeholder, pw: box ? box.querySelector('div[style*="monospace"]').innerText.trim() : '', list: (document.getElementById('gc-auth-modal-Dialog') || document.body).innerText.slice(0, 3000) };
  }, { MM, MMNAME });
  ok(!!ta.opts && ta.opts.some(x => /^marketing=/.test(x)), 'Team access: the Profile box offers "Marketing Manager"', ta.opts && ta.opts.filter(x => /market/i.test(x)));
  ok(/^[A-Za-z0-9]{12,}$/.test(ta.pw), 'Team access → Add (' + MM + ', Marketing Manager): the temporary password is shown once', ta.pw ? '(shown)' : ta.err || ta.list.slice(0, 200));
  TEMP = ta.pw;
  const row = staffT.get(MM);
  ok(!!row && row.profile === 'marketing' && row.active === false && row.mkt_active === true, '… and his row is the Marketing Manager shape (personal e-mail accepted)', row);
  ok(new RegExp(MM.replace(/[.@]/g, '\\$&')).test(ta.list) && /Marketing/i.test(ta.list), '… and the list shows him with the Marketing Manager profile', ta.list.split('\n').filter(l => /malcolm/i.test(l)).slice(0, 2));
  /* Employees → + Add Employee → Role "Marketing Manager" → "Open Team access (filled in)" */
  await p.evaluate(() => { document.querySelectorAll('#gc-auth-modal-Dialog').forEach(x => x.remove()); });
  const emp = await p.evaluate(async ({ MM, MMNAME }) => {
    const click = re => { re = new RegExp(re); const b = [...document.querySelectorAll('button, [role=tab], a')].filter(__vis).find(e => re.test((e.innerText || '').trim())); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); return true; } return false; };
    const setV = (el, v) => { const P = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(P, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const field = (root, label) => { const l = [...root.querySelectorAll('label, div, span, b')].filter(e => e.children.length === 0 && (e.textContent || '').trim().toLowerCase() === label.toLowerCase())[0]; if (!l) return null; let q = l.parentElement; for (let i = 0; i < 3 && q; i++) { const x = q.querySelector('input'); if (x) return x; q = q.parentElement; } return null; };
    window._setView('admin'); await new Promise(z => setTimeout(z, 3000));
    for (let i = 0; i < 6 && !click('^\\+ Add Employee$'); i++) { click('Employees'); await new Promise(z => setTimeout(z, 1200)); }
    await new Promise(z => setTimeout(z, 1200));
    const sel = [...document.querySelectorAll('select')].filter(__vis).find(s => [...s.options].some(o => o.text === 'Crew Lead'));
    if (!sel) return { err: 'no Add Employee form' };
    let root = sel; for (let i = 0; i < 14 && root; i++) { root = root.parentElement; if (root && [...root.querySelectorAll('button')].some(b => /^(Create Employee|Save Changes)$/.test((b.innerText || '').trim()))) break; }
    const fn = field(root, 'Full Name'), fe = field(root, 'Email'); if (fn) setV(fn, MMNAME); if (fe) setV(fe, MM); setV(sel, 'Marketing Manager'); await new Promise(z => setTimeout(z, 1200));
    const note = root.querySelector('[data-ofx-mm]'), btn = document.querySelector('[data-ofx-mm-open]');
    if (!btn) return { err: 'no Open Team access button', note: note && note.innerText };
    btn.click(); await new Promise(z => setTimeout(z, 2500));
    const g = id => (document.getElementById(id) || {}).value;
    return { note: note && note.innerText, email: g('gcTaEmail'), name: g('gcTaName'), profile: g('gcTaProfile'), role: g('gcTaRole') };
  }, { MM, MMNAME });
  ok(!emp.err && /Team access/.test(emp.note || ''), 'Employees → Role "Marketing Manager": the line says to add him in 💎 → Team access', emp.err || emp.note);
  ok(emp.email === MM && emp.name === MMNAME && emp.profile === 'marketing', '"Open Team access (filled in)": e-mail (personal), name and the Marketing Manager profile are filled in', emp);
  const bad = c.calls.filter(x => x.status === 401 || x.status === 403 || x.status >= 500);
  ok(!bad.length, 'owner: no call to our functions answered 401 / 403 / 5xx', bad.slice(0, 5).map(x => x.fn + ' ' + x.status + ' ' + x.err));
  ok(!errsOf(c).length, 'owner: no page errors', errsOf(c).slice(0, 4));
  await c.b.close();
}
if (!staffT.get(MM) || !TEMP) {   /* without B: the row and a temporary password as Team access makes them */
  staffT.delete(MM); const r = await call(OWNER, 'POST', 'staff-admin', '', { action: 'add', email: MM, name: MMNAME, role: 'staff', profile: 'marketing' }); TEMP = jb(r).tempPassword || 'Temp-Start-Pw-2026';
}
AUTH.pw = TEMP; AUTH.must = true;

/* his page: every database request may only READ the four keys docs/marketing-role.sql lets him (or his own gc_staff row) */
const MM_READ = /^(gc_company_address|gc_epoch|gc_mkt_admin|gc_automation_pause)$/;
function dbJudge(c, who){
  const mine = c.db.filter(x => x.who === MM);
  const writes = mine.filter(x => x.m !== 'GET' && x.m !== 'HEAD');
  const otherReads = mine.filter(x => (x.m === 'GET' || x.m === 'HEAD') && x.p === '/rest/v1/gc_kv' && x.k.split('&').some(f => { const ks = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map(k => k.replace(/"/g, '')) : f.startsWith('not.') ? [] : ['?' + f]; return ks.some(k => !MM_READ.test(k)); }));
  const otherTables = mine.filter(x => !/^\/rest\/v1\/(gc_kv|gc_staff|rpc\/gc_my_access)$/.test(x.p));
  ok(!writes.length, who + ': his page wrote NOTHING to the database directly (' + mine.length + ' database requests; marketing goes through soc.js)', writes.slice(0, 5));
  ok(!otherReads.length && !otherTables.length, who + ': his page asked the database only for the four keys he may read (and his own gc_staff row)', otherReads.concat(otherTables).slice(0, 5));
}
function fnJudge(c, who){
  const mine = c.calls.filter(x => x.who === MM || !x.who);
  const bad = mine.filter(x => x.status === 401 || x.status === 403 || x.status >= 500 || x.timeout);
  const distinct = {}; bad.forEach(x => { const k = x.m + ' ' + x.fn + ' ' + (x.b.match(/"(op|action)":"([^"]+)"/) || [])[2] + ' → ' + x.status; if (!distinct[k]) distinct[k] = [x.phase, (x.err || '').slice(0, 120)]; });
  ok(!bad.length, who + ': no call to our functions answered 401 / 403 / 5xx (' + mine.length + ' calls)', distinct);
  const fns = [...new Set(mine.map(x => x.fn))];
  ok(fns.every(f => /^(soc|mkt|mkt2|referral|mkt-public|go|track-call|website-intake|claude-proxy|password-reset|staff-admin)$/.test(f)), who + ': his page called only the marketing functions (+ sign-in ones)', fns);
  const rep = {}; let worst = null;
  for (const x of mine) { const k = x.m + ' ' + x.fn + x.q + ' ' + x.b; (rep[k] = rep[k] || []).push(x.t); }
  for (const k of Object.keys(rep)) { const ts = rep[k]; for (let i = 0; i + 4 < ts.length; i++) if (ts[i + 4] - ts[i] < 60000) { worst = worst || [k.slice(0, 160), ts.length]; break; } }
  ok(!worst, who + ': no request repeated more than 4 times in a minute', worst);
}
const COMPANY_VIEWS = ['dashboard', 'projects', 'leads', 'schedule', 'invoices', 'payments', 'pnl', 'payroll', 'expenses', 'estimates', 'estbuilder', 'customers', 'todo', 'approvals', 'admin', 'messages', 'gmail', 'subs', 'officemanager', 'allphotos', 'reports', 'integrations', 'taxcenter', 'cctrans', 'qbimport', 'insurance', 'mitigation', 'maintenance', 'timeclock', 'field'];

async function walkMM(c, who, opts){
  opts = opts || {};
  const p = c.page(); await p.evaluate(vis);
  /* the left menu, as he sees it */
  const menu = await c.ev(() => [...document.querySelectorAll('aside button')].filter(b => b.getBoundingClientRect().height > 2).map(b => (b.innerText || b.title || '').trim().replace(/\s+/g, ' ')).filter(Boolean));
  console.log('     ' + who + ' menu: ' + menu.join(' | '));
  ok(menu.length >= 5 && menu.every(t => !/invoice|payroll|estimate|customer|job|schedule|p&l|payments|admin|approvals$/i.test(t) || /marketing approvals/i.test(t)), who + ': his menu is Marketing only (no jobs, money, customers, admin)', menu);
  const tabs = await c.ev(() => [...document.querySelectorAll('aside button')].filter(b => b.getBoundingClientRect().height > 2).map((b, i) => ({ i, t: (b.innerText || b.title || '').trim().replace(/\s+/g, ' ') })).filter(x => x.t));
  for (const tb of tabs) {
    if (/sign out|collapse|^«|^»|^‹|^›/i.test(tb.t)) continue;
    const open = async () => { const loc = c.page().locator('aside button').filter({ hasText: tb.t.split(' ').slice(-2).join(' ') }).first(); if (await loc.count()) await loc.click({ timeout: 5000 }).catch(() => c.ev(i => { const b = [...document.querySelectorAll('aside button')].filter(b => b.getBoundingClientRect().height > 2)[i]; if (b) b.click(); }, tb.i)); else await c.ev(i => { const b = [...document.querySelectorAll('aside button')].filter(b => b.getBoundingClientRect().height > 2)[i]; if (b) b.click(); }, tb.i); };
    await screen(c, who + ' tab ' + tb.t, open, { clicks: opts.clicks, wait: 3500 });
  }
  /* every Marketing section he has (also the ones reached from inside a tab) */
  const secs = await c.ev(() => (window._gcMktExt && window._gcMktExt.SECS || []).map(x => x.id));
  console.log('     ' + who + ' Marketing sections: ' + secs.join(' '));
  for (const sec of secs) {
    await screen(c, who + ' Marketing › ' + sec, async () => { await c.ev(s => { window._setView('marketing'); setTimeout(() => window._gcMkt && window._gcMkt.go(s), 300); }, sec); await sleep(900); }, { clicks: opts.clicks, wait: 3000 });
  }
  return { menu, secs };
}

/* ══ C. Malcolm, desktop ══ */
if (PARTS.includes('C')) {
  console.log('── C. Malcolm on a desktop (1366×768): first sign-in, every tab, every button, the fences');
  loadCloud(); cloud.delete('gc_automation_pause');
  const c = await computer('mm-desk', { build: BUILD }); c.acceptConfirm = true; c.prompts = [];
  await wire(c, MM); await mmAuthRoutes(c);
  await c.page().setViewportSize({ width: 1366, height: 768 });
  const p = c.page();
  c.phase = 'signin';
  await signInAs(c, MM, TEMP);
  const pwScr = await waitFor(c, () => { const t = document.getElementById('gc-pw-new1'); return t ? (document.querySelector('.gc-pw-screen, #gc-pw-screen') || t.closest('form') || document.body).innerText.slice(0, 300) : null; }, null, 60000, 300);
  ok(!!pwScr && /Choose your own password/.test(pwScr), 'first sign-in with the temporary password → "Choose your own password"', (pwScr || '').slice(0, 160));
  const NEWPW = 'Malcolm-Own-Pw-2026!';
  if (pwScr) {
    await p.locator('#gc-pw-new1').fill(NEWPW); await p.locator('#gc-pw-new2').fill(NEWPW); await p.locator('#gc-pw-save').click();
    const after = await waitFor(c, () => { const m = document.querySelector('#gc-pw-msg, .gc-pw-msg'); const t = m && m.innerText || ''; if (/could not finish|did not update/i.test(t)) return 'STUCK: ' + t; if (!document.getElementById('gc-pw-new1') && window._gcMMData) return 'in'; return null; }, null, 90000, 400);
    ok(after === 'in' && AUTH.pw === NEWPW && AUTH.must === false, 'he chooses his own password → he is in (not stuck on "could not finish")', { after, must: AUTH.must, pwSet: AUTH.pw === NEWPW });
    if (after !== 'in') { AUTH.must = false; AUTH.pw = NEWPW; await signInAs(c, MM, NEWPW); }
  }
  ok(!!(await mmReady(c)), 'his CRM opens (the Marketing layout)');
  c.phase = 'welcome';
  const wel = await waitFor(c, () => { const w = document.getElementById('_gcHelpWelcome'); return w ? w.innerText : null; }, null, 25000, 500);
  let tour = '';
  if (wel) { await c.ev(() => { const b = document.getElementById('_hwTour'); if (b) b.click(); }); await sleep(1500);
    for (let i = 0; i < 9; i++) { tour += ' ¶ ' + (await c.ev(() => { const h = [...document.querySelectorAll('h2')].filter(x => x.getBoundingClientRect().height > 0).map(x => x.innerText).join(' / '); const n = document.getElementById('_tourNext'); if (n) n.click(); return h; }).catch(() => '')); await sleep(500); } }
  console.log('     welcome: ' + JSON.stringify(wel) + ' tour: ' + tour.slice(0, 400));
  ok(!wel || !/Bank|Invoices|Numbers/i.test(tour), 'the welcome / tour he gets is not the company bookkeeping tour (bank imports, invoices, the numbers)', { welcome: wel, tour: tour.slice(0, 300) });
  await c.ev(() => { ['_gcHelpWelcome'].forEach(id => { const x = document.getElementById(id); if (x) x.remove(); }); [...document.body.children].forEach(e => { if (/_tour|gc-tour/i.test(e.id + ' ' + e.className)) e.remove(); }); }).catch(() => {});
  try { await p.keyboard.press('Escape'); } catch (e) {}
  await c.ev(() => window._setView('marketing')); await sleep(5000);
  await p.screenshot({ path: path.join(SHOTS, 'mktgate_desktop_home.png') });
  const home = await c.ev(() => document.body.innerText.slice(0, 6000));
  ok(/Marketing|My To-Do|My leads/i.test(home), 'his home is Marketing (screenshot ' + path.join(SHOTS, 'mktgate_desktop_home.png') + ')');
  const W1 = await walkMM(c, 'desktop');
  /* his To-Do: add one, tick it */
  c.phase = 'todo';
  const td = await c.ev(async () => { window._setView('marketing'); await new Promise(z => setTimeout(z, 500)); window._gcMkt.go('mytodo'); await new Promise(z => setTimeout(z, 2500)); const i = document.getElementById('mm-task'); if (!i) return { err: 'no box' }; i.value = 'MKTGATE desktop to-do'; const b = document.querySelector('[data-a="mm-task-add"]'); if (b) b.click(); await new Promise(z => setTimeout(z, 3500)); return { has: /MKTGATE desktop to-do/.test(document.body.innerText) }; });
  ok(td.has === true, 'My To-Do: he adds a to-do and it shows', td);
  const tlist = kvv('gc_office_tasks'); const tnew = (Array.isArray(tlist) ? tlist : []).find(t => t && t.label === 'MKTGATE desktop to-do');
  ok(!!tnew && (tnew.assignees || []).includes(MM), '… saved on the company to-do list as HIS (through soc.js)', tnew && { assignees: tnew.assignees });
  /* 💎 menu */
  c.phase = 'hub';
  const hub = await c.ev(async () => { const b = document.getElementById('gc-hub-btn'); if (!b || !b.getClientRects().length || getComputedStyle(b).display === 'none') return { none: true }; b.click(); await new Promise(z => setTimeout(z, 1200)); const pn = [...document.querySelectorAll('.gc-hub-panel')].find(x => x.getClientRects().length); return { items: pn ? [...pn.querySelectorAll('.gc-hub-item, div[style*="cursor:pointer"]')].map(x => (x.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean) : [] }; });
  console.log('     💎 menu: ' + JSON.stringify(hub).slice(0, 900));
  const hubBad = (hub.items || []).filter(t => /invoice|financial|payment|pay\b|1099|p&l|cash|payroll|job|schedule|merge|backup|purge|force-clean|collections|team access|sub|test the crm|approvals|recover/i.test(t));
  ok(hub.none || !hubBad.length, 'the 💎 menu shows him no company tools (jobs, money, subs, backups, Team access)', hubBad.slice(0, 12));
  for (const it of (hub.items || []).filter(t => !/sign out|🚪/i.test(t)).slice(0, 40)) {
    const k1 = c.calls.length, d1 = c.db.length, e1 = c.errs.length;
    await c.ev(async t => { let pn = [...document.querySelectorAll('.gc-hub-panel')].find(x => x.getClientRects().length); if (!pn) { document.getElementById('gc-hub-btn').click(); await new Promise(z => setTimeout(z, 800)); pn = [...document.querySelectorAll('.gc-hub-panel')].find(x => x.getClientRects().length); } const el = pn && [...pn.querySelectorAll('.gc-hub-item, div[style*="cursor:pointer"]')].find(x => (x.innerText || '').trim().replace(/\s+/g, ' ') === t); if (el) el.click(); }, it).catch(() => {});
    await sleep(1500);
    const shown = await c.ev(() => [...document.body.children].filter(e => { const st = getComputedStyle(e); return (st.position === 'fixed') && +st.zIndex > 100 && e.getBoundingClientRect().height > 150 && !/gc-hub/.test(e.className); }).map(e => e.innerText.slice(0, 300)).join(' ¶ ')).catch(() => '');
    (c.hubRes = c.hubRes || []).push({ it, bad: c.calls.slice(k1).filter(x => x.status >= 400).map(x => x.fn + ' ' + x.status), err: c.errs.slice(e1).slice(0, 2), shown: shown.slice(0, 200), pii: piiIn(shown) });
    await c.ev(() => { [...document.body.children].forEach(e => { const st = getComputedStyle(e); if (st.position === 'fixed' && +st.zIndex > 100 && e.getBoundingClientRect().height > 150 && !/gc-hub-btn/.test(e.id)) e.remove(); }); }).catch(() => {});
    try { await p.keyboard.press('Escape'); } catch (e) {}
  }
  if (c.hubRes) { console.log('     💎 items: ' + c.hubRes.map(x => x.it + (x.bad.length ? ' ✗' + x.bad.join(',') : '') + (x.err.length ? ' ⚠' + x.err.join(',').slice(0, 80) : '') + (x.shown ? ' → ' + x.shown.slice(0, 60).replace(/\n/g, ' ') : '')).join(' | ').slice(0, 3000));
    ok(!c.hubRes.some(x => x.pii.length), 'nothing he opens from the 💎 menu shows a customer name', c.hubRes.filter(x => x.pii.length).map(x => [x.it, x.pii.slice(0, 3)])); }
  /* Lobby TV offers (OFFICETV: the Marketing Manager may save an offer; it waits for an admin's ✓ Approve) */
  c.phase = 'lobby';
  const lob = await c.ev(async () => { if (!window._gcLobbyAdmin) return { none: true }; window._gcLobbyAdmin.open('offers'); await new Promise(z => setTimeout(z, 3500)); return { text: document.body.innerText.slice(-4000) }; });
  if (!lob.none) {
    const s1 = await screen(c, 'desktop Lobby TV offers', async () => { await c.ev(() => window._gcLobbyAdmin.open('offers')); }, { wait: 3000, clicks: 20, skip: /approve|turn off|new link/i });
    const toasts = await c.ev(() => document.body.innerText.match(/Could not save the offers\.|🏷 Offers saved/g) || []);
    ok(!toasts.includes('Could not save the offers.'), 'Lobby TV → Offers: what he saves is saved (no "Could not save the offers.")', toasts);
  } else console.log('     (no Lobby TV editor in this build)');
  /* GrayCo Systems launcher: the marketing links */
  c.phase = 'systems';
  const sys = await c.ev(async () => { try { window._setView('systems'); } catch (e) {} await new Promise(z => setTimeout(z, 2500)); return (document.querySelector('main') || document.body).innerText.slice(0, 3000); });
  ok(!/Bid portal|Sub portal|QuickBooks|Payroll/i.test(sys), 'GrayCo Systems: marketing systems / logins only', sys.slice(0, 200));
  /* forced routes: every company screen by _setView and by the address bar */
  c.phase = 'forced';
  const forced = [];
  for (const v of COMPANY_VIEWS) {
    const r = await c.ev(async v => { let allowed = null; try { allowed = window._gcViewAllowed ? !!window._gcViewAllowed(v) : null; } catch (e) {} try { window._setView(v); } catch (e) {} await new Promise(z => setTimeout(z, 1500)); let cur = ''; try { cur = localStorage.getItem('grayco_view') || ''; } catch (e) {} return { v, allowed, cur, txt: (document.querySelector('main') || document.body).innerText.slice(0, 4000) }; }, v).catch(e => ({ v, err: String(e.message).slice(0, 80) }));
    r.pii = piiIn(r.txt || ''); forced.push(r);
  }
  const leaks = forced.filter(r => r.allowed === true || (r.cur === r.v && r.v !== 'marketing') || r.pii.length);
  ok(!leaks.length, 'every company screen by _setView (' + COMPANY_VIEWS.length + ': jobs, invoices, payroll, estimates, customers, To-Do, approvals, admin …) is refused — he stays on Marketing, no customer name shows', leaks.map(r => [r.v, r.allowed, r.cur, r.pii.slice(0, 2)]));
  for (const h of ['#todo', '#invoices', '#jobs', '#projects', '#payroll', '#customers', '#approvals', '#admin', '#tv', '#estimates']) {
    await p.goto('https://app.local/index.html' + h).catch(() => {}); await mmReady(c); await sleep(4000);
    const r = await c.ev(() => ({ cur: (() => { try { return localStorage.getItem('grayco_view'); } catch (e) { return ''; } })(), txt: (document.querySelector('main') || document.body).innerText.slice(0, 4000), tv: !!document.querySelector('#gc-otv, .gc-otv, [data-otv]') }));
    ok(/^(marketing|mmt_[a-z]+)$/.test(r.cur || 'marketing') && !piiIn(r.txt).length && !r.tv, 'address bar ' + h + ': he lands on Marketing (no company screen, no lobby TV)', { cur: r.cur, pii: piiIn(r.txt).slice(0, 3), tv: r.tv });
  }
  /* straight at the database and the functions from his own page (what a curious person could type in the console) */
  c.phase = 'direct';
  const direct = await c.ev(async () => {
    const SB = 'https://ieeonhpfahmwwecizdut.supabase.co/rest/v1/';
    const out = {};
    const g = async (u, o) => { try { const r = await fetch(u, o); const t = await r.text(); return r.status + ' ' + t.slice(0, 80); } catch (e) { return 'ERR ' + e.message; } };
    out.readJobs = await g(SB + 'gc_kv?select=key,value&key=eq.projects');
    out.readAll = await g(SB + 'gc_kv?select=key&limit=5');
    out.writeKv = await g(SB + 'gc_kv?on_conflict=key', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'gc_mkt_v1', value: { hacked: true } }) });
    out.writePause = await g(SB + 'gc_kv?on_conflict=key', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'gc_automation_pause', value: { on: false } }) });
    out.del = await g(SB + 'gc_kv?key=eq.invoices', { method: 'DELETE' });
    for (const fn of ['invoice-track', 'paystubs', 'portal', 'staff-admin?action=list', 'automation-pause', 'field-ops', 'comms', 'lien', 'auto-wins', 'money-intake']) out['fn ' + fn] = await g('/.netlify/functions/' + fn, { method: fn.indexOf('?') > 0 ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: fn.indexOf('?') > 0 ? undefined : JSON.stringify({ action: 'list', op: 'approvals' }) });
    return out;
  });
  console.log('     from his page: ' + JSON.stringify(direct).slice(0, 1500));
  ok(/^200 \[\]/.test(direct.readJobs) && /^200 \[\]/.test(direct.readAll), 'from his page: reading the jobs / any gc_kv row gives nothing', [direct.readJobs, direct.readAll]);
  ok(/^403/.test(direct.writeKv) && /^403/.test(direct.writePause) && /^403/.test(direct.del), 'from his page: writing / deleting gc_kv (incl. switching data-entry mode off) is refused', [direct.writeKv, direct.writePause, direct.del]);
  ok(Object.keys(direct).filter(k => /^fn /.test(k)).every(k => /^40[13]/.test(direct[k])), 'from his page: every company function refuses him', Object.keys(direct).filter(k => /^fn /.test(k) && !/^40[13]/.test(direct[k])).map(k => k + ' ' + direct[k]));
  ok(!(kvv('gc_mkt_v1') || {}).hacked && !kvv('gc_automation_pause'), '… and the cloud copy is unchanged');
  /* data-entry mode switch */
  const pz = await c.ev(async () => { const f = window._gcPause || window._gcAutomationPause || window.__gcPause; return { has: !!f, keys: Object.keys(window).filter(k => /pause/i.test(k)).slice(0, 10) }; });
  console.log('     data-entry mode objects on his page: ' + JSON.stringify(pz));
  await sleep(20000); c.phase = 'idle';
  /* the verdicts */
  fnJudge(c, 'desktop'); dbJudge(c, 'desktop');
  const errs = errsOf(c); ok(!errs.length, 'desktop: no page errors', errs.slice(0, 8));
  const piiScreens = (c.screens || []).filter(s => piiIn(s.text).length).map(s => [s.name, piiIn(s.text).slice(0, 3)]);
  ok(!piiScreens.length, 'desktop: no customer name on any of his screens (' + (c.screens || []).length + ' screens, ' + NAMES.length + ' names checked)', piiScreens.slice(0, 6));
  const dead = (c.screens || []).filter(s => s.res.some(r => r.bad.length || r.err.length));
  dead.forEach(s => s.res.filter(r => r.bad.length || r.err.length).forEach(r => console.log('       ✗ ' + s.name + ' › ' + r.t + ' → ' + JSON.stringify(r.bad.concat(r.err)).slice(0, 220))));
  fs.writeFileSync(path.join(process.env.TMPDIR || '/dev/shm', 'mktgate_desktop_screens.json'), JSON.stringify((c.screens || []).map(s => ({ name: s.name, total: s.total, clicked: s.clicked, res: s.res, errs: s.errs })), null, 1));
  ok(!custOut(0).length, 'nothing he clicked reached a customer or a social network', custOut(0).slice(0, 5));
  await c.b.close();
}

/* ══ D. Malcolm, phone: forgot password → the e-mailed link → in (data-entry mode on) ══ */
if (PARTS.includes('D')) {
  console.log('── D. Malcolm on a phone (390 wide): forgot password → link → new password → every tab (data-entry mode on)');
  loadCloud(); kvSet('gc_automation_pause', { on: true, by: 'wjohnson@grayco-cs.com', at: new Date().toISOString() });
  req('./_lib/pause.js').reset(); req('./_lib/staff-mail.js')._reset();
  process.env.RESEND_API_KEY = 're_test_fake_not_a_key'; delete process.env.PORTAL_MAIL_OFF; req('./password-reset.js')._minMs = 0; req('./password-reset.js')._test.mem.clear();
  AUTH.must = false; if (!AUTH.pw || AUTH.pw === TEMP) AUTH.pw = 'Malcolm-Own-Pw-2026!';
  const c = await computer('mm-phone', { build: BUILD, mobile: true }); c.acceptConfirm = true;
  await wire(c, MM); await mmAuthRoutes(c);
  const p = c.page();
  await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
  c.phase = 'forgot';
  const fg = await c.ev(async () => { const a = document.getElementById('gc-auth-forgot') || [...document.querySelectorAll('a, button')].find(x => /Forgot password/i.test(x.innerText || '')); if (!a) return 'no link'; a.click(); await new Promise(z => setTimeout(z, 800)); return !!document.getElementById('gc-forgot-email'); });
  ok(fg === true, 'phone: "Forgot password?" opens the e-mail box', fg);
  const n0 = bridge.EXT.length;
  await p.locator('#gc-forgot-email').fill(MM); await p.locator('#gc-forgot-send').click();
  const said = await waitFor(c, () => { const t = document.body.innerText; return /reset link is on its way/i.test(t) ? t.match(/[^\n]*reset link is on its way[^\n]*/)[0] : null; }, null, 30000, 300);
  ok(!!said, 'phone: the neutral answer shows', said);
  const mail = bridge.EXT.slice(n0).filter(x => x.host === 'api.resend.com' && x.b.indexOf(MM) >= 0);
  const link = HOOK.links.filter(l => l.email === MM).slice(-1)[0];
  ok(mail.length === 1 && !!link, 'data-entry mode: the reset e-mail went to ' + MM + ' (not held)', { mails: mail.length });
  await p.goto('https://app.local/index.html#token_hash=' + (link ? link.th : 'none') + '&type=recovery');
  const setScr = await waitFor(c, () => document.getElementById('gc-pw-new1') ? document.body.innerText.slice(0, 300) : null, null, 30000, 300);
  ok(!!setScr && /Set a new password/i.test(setScr), 'phone: the link from the e-mail opens "Set a new password"', (setScr || '').slice(0, 120));
  const PW2 = 'Malcolm-Phone-Pw-2026!';
  if (setScr) { await p.locator('#gc-pw-new1').fill(PW2); await p.locator('#gc-pw-new2').fill(PW2); await p.locator('#gc-pw-save').click(); }
  const inn = await mmReady(c);
  ok(!!inn && AUTH.pw === PW2, 'phone: new password saved and he is signed in with it', { pw: AUTH.pw === PW2 });
  await sleep(6000);
  await c.ev(() => { const x = document.getElementById('_gcHelpWelcome'); if (x) x.remove(); }).catch(() => {});
  await c.ev(() => window._setView('marketing')); await sleep(5000);
  await p.screenshot({ path: path.join(SHOTS, 'mktgate_phone_home.png') });
  const banner = await c.ev(() => /data-entry mode/i.test(document.body.innerText));
  console.log('     phone: data-entry banner shown: ' + banner);
  const wide = await c.ev(() => document.documentElement.scrollWidth);
  ok(wide <= 392, 'phone: Marketing home fits 390 px (no sideways scroll; ' + wide + ' px)', wide);
  await walkMM(c, 'phone', { clicks: 12 });
  const over = []; for (const s of (c.screens || [])) { /* a second look at width per tab */ }
  const tabsW = [];
  const tabs = await c.ev(() => (window._gcMMTabs || []).map(x => x.id));
  for (const id of tabs) { await c.ev(v => window._setView(v), id).catch(() => {}); await sleep(2500); const w = await c.ev(() => document.documentElement.scrollWidth).catch(() => 0); if (w > 392) tabsW.push([id, w]); }
  ok(!tabsW.length, 'phone: every one of his tabs fits 390 px', tabsW);
  fnJudge(c, 'phone'); dbJudge(c, 'phone');
  const errs = errsOf(c); ok(!errs.length, 'phone: no page errors', errs.slice(0, 8));
  const piiScreens = (c.screens || []).filter(s => piiIn(s.text).length).map(s => [s.name, piiIn(s.text).slice(0, 3)]);
  ok(!piiScreens.length, 'phone: no customer name on any of his screens', piiScreens.slice(0, 6));
  (c.screens || []).filter(s => s.res.some(r => r.bad.length || r.err.length)).forEach(s => s.res.filter(r => r.bad.length || r.err.length).forEach(r => console.log('       ✗ ' + s.name + ' › ' + r.t + ' → ' + JSON.stringify(r.bad.concat(r.err)).slice(0, 220))));
  fs.writeFileSync(path.join(process.env.TMPDIR || '/dev/shm', 'mktgate_phone_screens.json'), JSON.stringify((c.screens || []).map(s => ({ name: s.name, total: s.total, clicked: s.clicked, res: s.res, errs: s.errs })), null, 1));
  ok(!custOut(0).length, 'phone: nothing reached a customer or a social network (data-entry mode on)', custOut(0).slice(0, 5));
  delete process.env.RESEND_API_KEY; process.env.PORTAL_MAIL_OFF = '1';
  await c.b.close();
}

console.log('\n── summary: ' + T.filter(x => x.c).length + ' passed, ' + T.filter(x => !x.c).length + ' failed');
T.filter(x => !x.c).forEach(x => console.log('   ✗ ' + x.m));
console.log(fails ? 'MKTGATE: FAIL (' + fails + ')' : 'MKTGATE: PASS');
process.exit(fails ? 1 : 0);
