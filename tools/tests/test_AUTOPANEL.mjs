// test_AUTOPANEL.mjs <build-dir> [mirror.json] — patch AUTOPANEL: ⚙ Admin → ⚡ Automations ("make sure nothing is automatic
// in my CRM until I tell it to be auto").
//   A. Node, the real function handlers over a fake Supabase (tools/tests/officefix_bridge.mjs; nothing leaves):
//      A1 the registry (_lib/automations.js): defaults as the owner asked (safety / intake / sync / staff alerts / CUSTQUIET
//         release / approved posts ON, every other A or C OFF; price-index-monthly OFF);
//      A2 the switch row (automations.js function): admins switch, the office reads only, a non-staff call is refused,
//         every change is logged (who / when), "Turn on everything I had before" = every key ON;
//      A3 every registry key OFF, on a fake clock and the prod-shaped mirror: every scheduled function and webhook does
//         nothing (no e-mail, text, call, post; no business record written) and records "held: would have done N" in
//         gc_kv gc_auto_held; the price update on Tue 3 Nov 12:00 UTC with NO row (the defaults) changes no price;
//      A4 safety still fires with the defaults: missed-call text-back, the emergency call chain, lead intake;
//      A5 "Turn on everything I had before": the same runs do their work again (prices move, codes wiped, CompanyCam
//         makes the job, sub texts go …);
//      A6 ⏸ data-entry mode lets texts / calls tagged staff, emergency or reply (STOP / HELP) through, nothing else.
//   B. Browser (GC_NO_BROWSER=1 skips): see the bottom of this file.
// Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const BUILD = process.argv[2] && path.resolve(process.argv[2]);
const MIRROR = process.argv[3] || (fs.existsSync(SP + '/wUPG/mirror/rows.json') ? SP + '/wUPG/mirror/rows.json' : '');
if (!BUILD) { console.error('usage: node test_AUTOPANEL.mjs <build-dir> [mirror.json]'); process.exit(2); }
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const FN = path.join(BUILD, 'netlify', 'functions');
const req = createRequire(path.join(FN, 'x.js'));
const AUTO = req('./_lib/automations.js');

/* ── a fake clock (Date.now / new Date()) ── */
const RealDate = Date; let OFFSET = 0;
function setClock(iso){ OFFSET = RealDate.parse(iso) - RealDate.now(); }
class FakeDate extends RealDate { constructor(...a){ if (a.length) super(...a); else super(RealDate.now() + OFFSET); } static now(){ return RealDate.now() + OFFSET; } }
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;

/* ── the cloud: the prod-shaped mirror (read only copy), or a small made-up set — the browser harness's own gc_kv, so the
   page (part B) and the real function handlers (officefix_bridge) share it ── */
const HARNESS = process.env.GC_HARNESS || SP + '/wUPG/harness.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const cloud = H.cloud;
function loadCloud(){
  cloud.clear();
  if (MIRROR) { for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) if (!/^_probe_/.test(r.key)) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
  else {
    cloud.set('projects', { key: 'projects', value: [{ id: 'P1', name: 'Smith roof', status: 'Active', client: 'Ann Smith', pm: 'Pat PM' }, { id: 'P2', name: 'Done job', status: 'Completed', archived: true }], updated_at: '2026-11-01T00:00:00Z' });
    cloud.set('users', { key: 'users', value: [{ name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true }], updated_at: '2026-11-01T00:00:00Z' });
  }
}
loadCloud();
const OWNER = 'wjohnson@grayco-cs.com', OFFICE = 'office@grayco-cs.com', PM = 'sbiffle@grayco-cs.com', RANDOM = 'someone.random.test@gmail.com';
const STAFF = [
  { email: OFFICE, name: 'Brittany Pucket', role: 'staff', profile: null, active: true, payroll: true },
  { email: OWNER, name: 'Wesley Johnson', role: 'admin', profile: null, active: true, payroll: true },
  { email: PM, name: 'Steven Biffle', role: 'staff', profile: null, active: true }];
const B = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'officefix_bridge.mjs')).href);
const bridge = B.installBridge({ build: BUILD, cloud, accounts: H.ACCOUNTS, staffRows: STAFF });
delete process.env.PORTAL_MAIL_OFF; delete process.env.CUST_QUIET_OFF;   /* the real switches decide here */
process.env.RESEND_API_KEY = 'resend-test-fake'; process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok-test-fake'; process.env.TWILIO_FROM = '+19015550100';
process.env.COMPANYCAM_TOKEN = 'cc-test-token';

/* outside hosts with a useful answer: BLS (the price index), CompanyCam (one new 2026 project) */
const bridgeFetch = globalThis.fetch;
const BLS = { status: 'REQUEST_SUCCEEDED', Results: { series: ['WPU081', 'WPU083', 'WPU137', 'WPU1361', 'WPU1392', 'WPU0621', 'WPU117', 'WPU10260314', 'WPU105', 'WPU0721', 'WPU1333', 'WPU101', 'WPU082', 'WPU08210112', 'WPU123', 'WPU1344', 'WPUSI012011']
  .map(id => ({ seriesID: id, data: [{ year: '2026', period: 'M09', value: '103.0' }, { year: '2026', period: 'M08', value: '100.0' }] })) } };
let CC_NEW = null;
globalThis.fetch = async function(input, init){
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  if (/api\.bls\.gov/.test(url)) { bridge.EXT.push({ t: Date.now(), host: 'api.bls.gov', p: '/', m: 'POST', b: '' }); return new Response(JSON.stringify(BLS), { status: 200, headers: { 'content-type': 'application/json' } }); }
  if (/api\.companycam\.com\/v2\/projects\?/.test(url) && CC_NEW) { const pg = +(/[?&]page=(\d+)/.exec(url) || [0, 1])[1]; return new Response(JSON.stringify(pg === 1 ? [CC_NEW] : []), { status: 200, headers: { 'content-type': 'application/json' } }); }
  return bridgeFetch(input, init);
};
globalThis.fetch.__gcPause = undefined;

const call = (email, method, name, search, body) => bridge.call({ method, name, search: search || '', headers: email ? { authorization: 'Bearer ntok:' + email } : {}, body: body == null ? null : JSON.stringify(body) });
const jb = r => { try { return JSON.parse(Buffer.isBuffer(r.body) ? r.body.toString() : r.body || '{}'); } catch (e) { return {}; } };
const kv = k => { const r = cloud.get(k); return r ? r.value : undefined; };
const setKv = (k, v) => cloud.set(k, { key: k, value: v, updated_at: new RealDate().toISOString() });
const reset = () => { AUTO._t.reset(); try { req('./_lib/pause.js').reset(); } catch (e) {} };
const sends = from => bridge.EXT.slice(from).filter(x => /api\.resend\.com|api\.twilio\.com|graph\.facebook|linkedin|tiktok|mybusiness|ayrshare|googleads/.test(x.host) && x.m !== 'GET');
const sched = name => { const m = req('./' + name + '.js'); return m.handler({ httpMethod: 'POST', body: JSON.stringify({ next_run: new Date().toISOString() }), headers: {}, queryStringParameters: {} }, {}); };

/* ══ A1. the registry ══ */
console.log('A1. the registry');
const L = AUTO.LIST, D = AUTO.defaults();
ok(L.length >= 80 && new Set(L.map(a => a.key)).size === L.length, 'one list, ' + L.length + ' automations, no key twice');
ok(L.every(a => a.key && a.name && a.desc && /^[ABCD]$/.test(a.effect) && AUTO.GROUPS.some(g => g[0] === a.group)), 'every automation has a key, a plain name, a description, an effect A/B/C/D and a group');
const MUST_ON = ['missed_call_textback', 'call_chain', 'emergency_line', 'oncall_paging', 'staff_text_alerts', 'website_intake', 'lead_intake', 'partner_api', 'callrail', 'bids_inbox', 'claims_inbox', 'money_intake',
  'backups', 'cloud_sync', 'companycam_read', 'companycam_photos', 'mail_index', 'cust_release', 'scheduled_posts', 'bid_alerts_staff', 'tax_alerts', 'approvals_digest', 'lead_auto_assign', 'bid_watch'];
ok(MUST_ON.every(k => D[k] === true), 'ON by default: safety, lead intake, sync / backups, CompanyCam read / photos, mail index, staff alerts, the 7 AM release, approved posts', MUST_ON.filter(k => D[k] !== true));
const MUST_OFF = ['price_index_monthly', 'companycam_new_jobs', 'invoice_autopost', 'expense_autopost', 'progress_autodraw', 'legacy_progress_billing', 'legacy_autoflag_notes', 'job_stages', 'auto_100', 'closeout_autopilot',
  'commission_sweep', 'mailed_invoice_booking', 'dup_invoice_delete', 'x10_code_wipe', 'ms_tax_add', 'approval_escalation', 'weekly_update', 'maint_plans', 'referral_credits', 'monthly_statements',
  'final_invoice_reminders', 'estimate_followups', 'appt_confirmations', 'we_need_reminders', 'one_year_note', 'adjuster_followups', 'lien_waiver_requests', 'bid_result_emails', 'sub_schedule_texts', 'sub_firstday_text'];
ok(MUST_OFF.every(k => D[k] === false), 'OFF by default: every automation the owner listed (price update, auto-posts, draws, stages, closeout, commission, booking, deletes, wipes, tax, assign, escalation, queueing, reminders, sub texts …)', MUST_OFF.filter(k => D[k] !== false));
ok(L.filter(a => (a.effect === 'A' || a.effect === 'C') && !a.critical && a.defaultOn).map(a => a.key).every(k => ['cust_release', 'scheduled_posts', 'lead_auto_assign', 'bid_watch'].indexOf(k) >= 0),   /* LEADAUTO (owner 11/9) */
  'no other customer send or record change is ON by default (only the 7 AM release and approved posts)', L.filter(a => (a.effect === 'A' || a.effect === 'C') && !a.critical && a.defaultOn).map(a => a.key));
ok(L.filter(a => a.group === 'safety').every(a => a.critical && a.defaultOn), 'safety items are critical (locked ON in the panel)');
ok(/OFF/.test(AUTO.BY.companycam_new_jobs.desc) && /how PM jobs arrive/.test(AUTO.BY.companycam_new_jobs.desc), 'CompanyCam "make new jobs" says plainly it is how PM jobs arrive');
ok(AUTO.valueOf({}, 'price_index_monthly') === false && AUTO.valueOf({ price_index_monthly: true }, 'price_index_monthly') === true && AUTO.valueOf({ backups: false }, 'backups') === false && AUTO.valueOf({}, 'nope') === false,
  'a missing key = its default; a stored key wins; an unknown key is OFF');
ok(Object.values(AUTO.before()).every(v => v === true), '"Turn on everything I had before" = every automation ON');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const mm = /\/\* AUTOREG-BEGIN \*\/\n([\s\S]*?)\/\* AUTOREG-END \*\//.exec(html);
ok(!!mm && mm[1] === fs.readFileSync(path.join(FN, '_lib', 'automations.js'), 'utf8'), 'the page carries _lib/automations.js word for word');

/* ══ A2. the switch row ══ */
console.log('A2. the switch row (automations function)');
cloud.delete('gc_automations'); cloud.delete('gc_auto_held');
let r = await call(OWNER, 'GET', 'automations');
ok(r.status === 200 && jb(r).settings && jb(r).settings.price_index_monthly === false && jb(r).admin === true, 'owner GET → 200, the defaults (price update OFF), admin', [r.status, jb(r).error]);
r = await call(OFFICE, 'GET', 'automations');
ok(r.status === 200 && jb(r).admin === false && jb(r).settings.backups === true, 'office GET → 200 (can view), admin: false', [r.status, jb(r).admin]);
r = await call(OFFICE, 'POST', 'automations', '', { set: { price_index_monthly: true } });
ok(r.status === 403 && !kv('gc_automations'), 'office POST a switch → 403, nothing saved', [r.status, kv('gc_automations')]);
r = await call(OFFICE, 'POST', 'automations', '', { op: 'before' });
ok(r.status === 403 && !kv('gc_automations'), 'office "Turn on everything" → 403');
r = await call(PM, 'POST', 'automations', '', { set: { invoice_autopost: true } });
ok(r.status === 403, 'a PM → 403');
r = await call(RANDOM, 'GET', 'automations');
ok(r.status === 403, 'a signed-in non-staff account → 403', r.status);
r = await call(RANDOM, 'POST', 'automations', '', { set: { price_index_monthly: true } });
ok(r.status === 403 && !kv('gc_automations'), 'a non-staff POST → 403, nothing saved', r.status);
r = await call(null, 'POST', 'automations', '', { op: 'before' });
ok(r.status === 401 && !kv('gc_automations'), 'no sign-in → 401', r.status);
r = await call(OWNER, 'POST', 'automations', '', { set: { invoice_autopost: true, cloud_sync: false, nope: true } });
let row = kv('gc_automations');
ok(r.status === 200 && row && row.invoice_autopost === true && !('cloud_sync' in row) && !('nope' in row), 'owner switches one ON → saved (an always-on item and an unknown key are ignored)', [r.status, row]);
ok(Array.isArray(row._log) && row._log[0].key === 'invoice_autopost' && row._log[0].on === true && row._log[0].by === OWNER && !!Date.parse(row._log[0].at), 'the change is logged: key, on, who, when', row && row._log);
r = await call(OWNER, 'POST', 'automations', '', { set: { invoice_autopost: false } });
ok(kv('gc_automations').invoice_autopost === false && kv('gc_automations')._log.length === 2, 'and back OFF (logged too)');
r = await call(OWNER, 'POST', 'automations', '', { op: 'before' });
ok(r.status === 200 && AUTO.LIST.every(a => AUTO.valueOf(kv('gc_automations'), a.key) === true) && jb(r).settings.price_index_monthly === true, '"Turn on everything I had before" → every automation ON', jb(r).error);
r = await call(OWNER, 'POST', 'automations', '', { op: 'defaults' });
ok(r.status === 200 && AUTO.LIST.every(a => AUTO.valueOf(kv('gc_automations'), a.key) === a.defaultOn), '"Back to defaults" → the defaults');
r = await call(OFFICE, 'POST', 'automations', '', { op: 'held', key: 'invoice_autopost', n: 3, sample: ['INV-1', 'INV-2'] });
ok(r.status === 200 && kv('gc_auto_held').invoice_autopost.n === 1 && kv('gc_auto_held').invoice_autopost.would === 3, 'any staff page records "held: would have done 3"', kv('gc_auto_held'));
r = await call(RANDOM, 'POST', 'automations', '', { op: 'held', key: 'invoice_autopost', n: 3 });
ok(r.status === 403 && kv('gc_auto_held').invoice_autopost.n === 1, 'a non-staff account cannot write held records');
const sqlTxt = fs.readFileSync(path.join(BUILD, 'docs', 'automation-pause.sql'), 'utf8');
ok(/'gc_automations', 'gc_auto_held'/.test(sqlTxt), 'docs/automation-pause.sql makes gc_automations / gc_auto_held admin-write in the database (no side door)');

/* ══ A3. every key OFF → nothing happens, a held record each ══ */
console.log('A3. every automation OFF (fake clock' + (MIRROR ? ', prod-shaped mirror' : '') + ')');
const toml = fs.readFileSync(path.join(BUILD, 'netlify.toml'), 'utf8');
const SCHED = [...bridge.SCHED].filter(n => n !== 'training-video');
const BUSINESS = k => !/^(gc_auto_held|gc_cc_sync_health|gc_cc_whoami|gc_mail_idx.*|gc_sent_log.*|gc_crm_sends.*)$/.test(k);
/* every table of the fake database (gc_kv and the service-only ones such as gc_lead_inbox_kv), except the sign-in list */
function snapshot(){ const o = {}; for (const [t, m] of bridge.tables) { if (t === 'gc_staff') continue; for (const [k, v] of m) o[t + ':' + k] = JSON.stringify(v.value !== undefined ? v.value : v); } return o; }
function changed(before){ const now = snapshot(), out = []; Object.keys(now).forEach(k => { if (before[k] !== now[k]) out.push(k.replace(/^gc_kv:/, '')); }); Object.keys(before).forEach(k => { if (!(k in now)) out.push(k.replace(/^gc_kv:/, '') + ' (deleted)'); }); return out; }
const LKV = () => { if (!bridge.tables.has('gc_lead_inbox_kv')) bridge.tables.set('gc_lead_inbox_kv', new Map()); return bridge.tables.get('gc_lead_inbox_kv'); };
const lkv = k => { const r = LKV().get(k); return r ? r.value : undefined; };
const ALL_OFF = {}; AUTO.LIST.forEach(a => { if (!a.fixed) ALL_OFF[a.key] = false; });
/* a scenario worth holding: a closed job with a door code, a waiting held lead, a sub schedule text due, a new CompanyCam project */
function seedWork(){
  const projs = kv('projects') || []; const closed = (Array.isArray(projs) ? projs : []).find(p => p && /complete|closed/i.test(String(p.status || ''))) || { id: 'P2' };
  LKV().set('gc_x10_codes', { key: 'gc_x10_codes', updated_at: '2026-11-01T00:00:00Z', value: [{ pid: closed.id, code: '1234#', kind: 'door', at: '2026-10-01T00:00:00Z' }, { pid: 'PRJ-gone-x', code: '5678', kind: 'gate', at: '2026-10-01T00:00:00Z' }] });
  LKV().set('gc_x10_pages', { key: 'gc_x10_pages', updated_at: '2026-11-01T00:00:00Z', value: [{ id: 'PGtest1', leadId: 'LEADtest-oc', title: 'EMERGENCY water (test)', at: '2026-11-02T03:00:00Z', step: 0, to: [{ name: 'Mitch', email: 'mitch.test@grayco-cs.com' }] }] });
  CC_NEW = { id: 990001, name: 'Autopanel Test Roof', address: { street_address_1: '77 Autopanel Test Ln', city: 'Bartlett', state: 'TN', postal_code: '38133' }, status: 'active',
    created_at: Math.floor(Date.now() / 1000) - 3600, updated_at: Math.floor(Date.now() / 1000) - 60, creator_name: 'Nobody Mapped', creator_id: 4242, project_url: 'https://app.companycam.com/projects/990001' };
}
const TIMES = ['2026-11-05T16:30:00Z', '2026-11-03T12:00:30Z', '2026-11-03T13:20:00Z', '2026-11-03T14:40:00Z', '2026-11-01T14:05:00Z', '2026-11-06T20:00:00Z', '2026-11-03T15:20:00Z', '2026-11-03T16:00:00Z', '2026-11-02T23:10:00Z'];
async function runAllScheduled(label){
  const res = {};
  for (const t of TIMES) {
    setClock(t); reset();
    for (const n of SCHED) {
      try { const o = await Promise.race([sched(n), new Promise(r => setTimeout(() => r({ statusCode: 'timeout' }), 30000))]); res[n + '@' + t] = o && o.statusCode; }
      catch (e) { res[n + '@' + t] = 'threw ' + String(e && e.message).slice(0, 80); }
    }
  }
  return res;
}
loadCloud(); seedWork(); setKv('gc_automations', ALL_OFF); cloud.delete('gc_auto_held');
let snap = snapshot(), ext0 = bridge.EXT.length;
const resOff = await runAllScheduled('off');
const threw = Object.keys(resOff).filter(k => /threw|timeout/.test(String(resOff[k])));
ok(!threw.length, 'every scheduled function ran on the fake clock without throwing (' + SCHED.length + ' functions × ' + TIMES.length + ' times)', threw.slice(0, 6).map(k => k + ': ' + resOff[k]));
const cq0 = JSON.parse(snap['gc_lead_inbox_kv:gc_cust_quiet'] || 'null');
let ch = changed(snap).filter(BUSINESS).filter(k => k !== 'gc_lead_inbox_kv:gc_x10_marks' && !(k === 'gc_lead_inbox_kv:gc_cust_quiet' && ((lkv('gc_cust_quiet') || {}).items || []).length === ((cq0 || {}).items || []).length));   /* the runs' own "done today" marks */
ok(!ch.length, 'all OFF: no business record written by any scheduled run', ch);
let sn = sends(ext0);
ok(!sn.length, 'all OFF: no e-mail, text, call or post went out', sn.slice(0, 5).map(x => x.host + x.p + ' ' + x.b.slice(0, 120)));
ok(!bridge.EXT.slice(ext0).some(x => x.host === 'api.bls.gov' && false), '(the price update may READ the index to count — it writes nothing)');
/* CompanyCam with the DEFAULTS (read / link ON, make new jobs OFF): the new project waits on the review list */
setKv('gc_automations', {}); setClock('2026-11-03T16:00:00Z'); reset(); { const s0 = snapshot(); await sched('companycam-sync'); const c2 = changed(s0).filter(BUSINESS).filter(k => !/^(gc_cc_review|gc_cc_sync_state|gc_cc_.*state|gc_cc_creator.*)$/.test(k));
  ok(!c2.some(k => /^projects/.test(k)), 'CompanyCam with the defaults: read / link runs, no job is made', c2); }
setKv('gc_automations', ALL_OFF); reset();
const held = kv('gc_auto_held') || {};
const SERVER_SCHED_KEYS = ['price_index_monthly', 'x10_code_wipe', 'companycam_new_jobs', 'companycam_read', 'companycam_photos', 'approval_escalation', 'invoice_email_queue', 'final_invoice_reminders', 'portal_docs_notice',
  'estimate_followups', 'customer_app_push', 'cust_release', 'weekly_update', 'bid_alerts_staff', 'bid_portal_drafts', 'data_check', 'winback', 'mkt_internal_reports', 'social_drafts', 'company_docs_expiry', 'inspection_offer',
  'scheduled_posts', 'mkt_autopilot', 'field_dispatch', 'adjuster_followups', 'field_staff_nudges', 'one_year_note', 'maint_plans', 'newsletter_drafts', 'event_reminders', 'oncall_paging', 'emergency_line', 'x10_vehicle',
  'monthly_statements', 'x10_mydata', 'coi_requests', 'warranty_checkup_offer', 'we_need_reminders', 'office_todos', 'mkt_report_external', 'crm_health', 'referral_credits', 'est_price_watch', 'photo_tags', 'daily_plan',
  'mail_index', 'gdocs_sync', 'mail_followup', 'ar_reminders', 'payroll_check', 'lien_waiver_requests', 'approvals_digest', 'tax_alerts', 'backups', 'portal_gate_queue', 'text_thread_copy', 'ads_insights'];
const notHeld = SERVER_SCHED_KEYS.filter(k => !(held[k] && held[k].n >= 1));
ok(!notHeld.length, 'all OFF: every scheduled part recorded "held" in gc_auto_held (' + (SERVER_SCHED_KEYS.length - notHeld.length) + ' / ' + SERVER_SCHED_KEYS.length + ')', notHeld);
ok(held.x10_code_wipe && held.x10_code_wipe.would >= 1 && (lkv('gc_x10_codes') || []).length === 2, 'the access-code wipe: held, "would have done ' + (held.x10_code_wipe && held.x10_code_wipe.would) + '", every code still there', held.x10_code_wipe);
ok(held.companycam_new_jobs && held.companycam_new_jobs.would === 1 && /Autopanel Test Roof/.test((held.companycam_new_jobs.sample || []).join(' ')), 'CompanyCam: the new project is held ("would have done 1", its name in the sample)', held.companycam_new_jobs);
const rev = (kv('gc_cc_review') || []).find(x => String(x.cc) === '990001');
ok(rev && rev.kind === 'new' && /Make new jobs/.test(rev.why), 'and it waits on the CompanyCam review list ("＋ Make it a new job")', rev);
ok(!(JSON.stringify(kv('projects') || '').includes('PRJcc_990001')) && !JSON.stringify(kv('projects__chunk0') || '').includes('PRJcc_990001'), 'no CompanyCam job was made');
ok(held.price_index_monthly && held.price_index_monthly.would > 0 && /lumber|all materials/.test((held.price_index_monthly.sample || []).join(' ')), 'the price update: held, "would have done ' + (held.price_index_monthly && held.price_index_monthly.would) + '" with the series in the sample', held.price_index_monthly);
ok(held.price_index_monthly && held.price_index_monthly.since && held.price_index_monthly.last, 'each held record has "since" and "last" (for "held N times since …")');

/* the webhooks, all OFF */
snap = snapshot();
r = await call(null, 'POST', 'website-intake', '', { type: 'estimate', name: 'Test', phone: '9015550111', email: 't@example.com' });
ok(r.status === 503 && jb(r).held === 'website_intake' && !changed(snap).filter(BUSINESS).length, 'website intake OFF → refused with "try later", held, nothing filed', [r.status, jb(r)]);
/* the other intake doors and webhooks, all OFF: refused politely (the sender may retry), held, nothing filed */
process.env.CALLRAIL_WEBHOOK_KEY = 'cr-test-key';
for (const [name, search, body, key] of [['lead-intake', '', { name: 'Test Lead', phone: '9015550113' }, 'lead_intake'], ['partner-api', '', { kind: 'lead', name: 'Partner Test' }, 'partner_api'],
  ['money-intake', '', { amount: 12 }, 'money_intake'], ['callrail', '?key=cr-test-key', { id: 'CRtest1', customer_phone_number: '+19015550114', answered: false }, 'callrail']]) {
  snap = snapshot(); reset();
  const rr = await call(null, 'POST', name, search, body);
  ok(rr.status === 503 && jb(rr).held === key && !changed(snap).filter(BUSINESS).length, name + ' OFF → 503 "retry later", held, nothing filed', [rr.status, jb(rr)]);
}
snap = snapshot(); reset();
r = await call(OWNER, 'POST', 'portal', '', { action: 'approval', op: 'escalate' });
ok(r.status === 200 && jb(r).held === 'approval_escalation' && !changed(snap).filter(BUSINESS).length, 'approval escalation asked by the page OFF → nothing escalated, held', [r.status, jb(r)]);
reset(); { const PC = req('./portal.js')._core; let sl = null; try { sl = await PC.sendLink((Array.isArray(kv('projects')) ? kv('projects') : [{ id: 'P1' }])[0].id, {}, 'test'); } catch (e) { sl = { error: e.message }; }
  ok(sl && (sl.held === 'portal_invite_email' || /auto-send is turned off/.test(String(sl.skipped))), 'new-job portal link e-mail OFF → not sent (held)', sl); }
const MC = req('./missed-call.js')._test;
ext0 = bridge.EXT.length; reset();
let mo = await MC.missed({ From: '+19015550177', CallSid: 'CAtestoff1', CallerName: 'Test Caller' }, 'test');
ok(!sends(ext0).some(x => /twilio/.test(x.host)) && (kv('gc_auto_held').missed_call_textback || {}).n >= 1, 'missed-call text-back OFF → no text, held', [mo && mo.text, sends(ext0).map(x => x.p)]);

/* the price update with NO switch row at all (the state on Tue 3 Nov 12:00 UTC unless the owner turns it on) */
loadCloud(); cloud.delete('gc_automations'); cloud.delete('gc_auto_held'); setClock('2026-11-03T12:00:05Z'); reset();
const pe0 = JSON.stringify(kv('priceEdits')), cp0 = JSON.stringify(kv('customProducts'));
let pr = await sched('price-index-monthly');
ok(pr.statusCode === 200 && JSON.parse(pr.body).held === 'price_index_monthly' && JSON.stringify(kv('priceEdits')) === pe0 && JSON.stringify(kv('customProducts')) === cp0 && !kv('gc_price_hist'),
  'Tue 3 Nov 12:00 UTC, no switch row (defaults): the monthly price update changes NO price', JSON.parse(pr.body));

/* ══ A4. safety with the defaults ══ */
console.log('A4. safety keeps firing with the defaults');
loadCloud(); cloud.delete('gc_automations'); cloud.delete('gc_auto_held'); setClock('2026-11-03T15:00:00Z'); reset();
ext0 = bridge.EXT.length;
mo = await MC.missed({ From: '+19015550178', CallSid: 'CAtestdef1', CallerName: 'Test Caller Two' }, 'test');
ok(sends(ext0).some(x => /twilio/.test(x.host) && /Messages/.test(x.p)) && mo && mo.text && mo.text.ok !== false && mo.lead, 'missed-call text-back: the text goes and the caller becomes a lead', [mo && mo.text, mo && mo.lead]);
r = await call(null, 'POST', 'website-intake', '', { type: 'estimate', name: 'Test Intake', phone: '9015550112', email: 'intake.test@example.com', address: '1 Test St', message: 'roof leak test' });
ok(r.status !== 503 && !jb(r).held, 'lead intake (website) with the defaults: taken, not held', [r.status, jb(r).error]);
/* the emergency call chain: an emergency nobody acknowledged → the CRM phones the call order */
const EC = MC.EC();
setKv('gc_call_order', { on: true, slots: [{ label: 'Mitigation manager', phone: '9015550190', name: 'Mitch' }], night: { slots: [{ label: 'Mitigation manager', phone: '9015550190', name: 'Mitch' }] } });
let ecr = null; try { ecr = await EC.register({ id: 'EMtest1', leadId: 'LEADtest1', title: 'EMERGENCY water test', kind: 'water', contact: { phone: '9015550179' }, createdAt: new Date(Date.now() - 30 * 60000).toISOString() }); } catch (e) { ecr = { error: e.message }; }
ext0 = bridge.EXT.length; reset();
let tk = null; try { tk = await EC.tick(); } catch (e) { tk = { error: e.message }; }
ok(tk && !tk.paused && !tk.error, 'the emergency line ticks with the defaults (not stopped)', [ecr, tk]);
/* ⏸ data-entry mode ON: the emergency line, staff texts and HELP still go */
setKv('gc_automation_pause', { on: true, by: OWNER, at: new Date().toISOString() }); reset();
let tk2 = null; try { tk2 = await EC.tick(); } catch (e) { tk2 = { error: e.message }; }
ok(tk2 && !tk2.paused, 'data-entry mode ON: the emergency line is not stopped any more', tk2);

/* ══ A6. data-entry mode lets the safety tags through ══ */
console.log('A6. data-entry mode: the safety tags pass');
const CQ = req('./_lib/custquiet.js'), PZ = req('./_lib/pause.js');
PZ.install();
const twilioPost = () => globalThis.fetch('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'To=%2B19015550180&From=%2B19015550100&Body=test' });
const twilioCall = () => globalThis.fetch('https://api.twilio.com/2010-04-01/Accounts/ACtest/Calls.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'To=%2B19015550180&From=%2B19015550100&Url=x' });
setClock('2026-11-03T16:00:00Z'); PZ.reset();
ok(Object.keys(PZ.PASS_TAGS).sort().join(',') === 'emergency,reply,staff', 'the tags that pass data-entry mode: staff, emergency, reply (STOP / HELP answers, sign-in codes)', PZ.PASS_TAGS);
const through = async (tag, f) => { const n = bridge.EXT.length; const res = await (tag ? CQ.run(tag, f) : f()); return { out: bridge.EXT.slice(n).some(x => x.host === 'api.twilio.com'), paused: res.headers.get('x-gc-paused') === '1' }; };
let t1 = await through('staff', twilioPost), t2 = await through('emergency', twilioCall), t3 = await through('reply', twilioPost), t4 = await through('customer', twilioPost), t5 = await through('', twilioPost), t6 = await through('override', twilioPost);
ok(t1.out && !t1.paused, 'a staff text (on-call, smsalert) goes', t1);
ok(t2.out && !t2.paused, 'an emergency call (the call chain) goes', t2);
ok(t3.out && !t3.paused, 'a STOP / HELP reply goes', t3);
ok(!t4.out && t4.paused && !t5.out && t5.paused && !t6.out && t6.paused, 'a customer text, an untagged text and an "override" are still skipped', { t4, t5, t6 });
const mailN = bridge.EXT.length; const mres = await CQ.run('staff', () => globalThis.fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'x@grayco-cs.com', to: ['customer.test@example.com'], subject: 't', html: 'x' }) }));
ok(!bridge.EXT.slice(mailN).some(x => x.host === 'api.resend.com') && mres.headers.get('x-gc-paused') === '1', 'an e-mail to a customer is still skipped (the tags are for texts / calls only)');
cloud.delete('gc_automation_pause'); PZ.reset();

/* ══ A5. "Turn on everything I had before" → the old behaviour ══ */
console.log('A5. "Turn on everything I had before"');
loadCloud(); seedWork(); cloud.delete('gc_auto_held');
r = await call(OWNER, 'POST', 'automations', '', { op: 'before' });
ok(r.status === 200, 'owner: Turn on everything I had before → 200');
setClock('2026-11-03T12:00:30Z'); reset();
pr = await sched('price-index-monthly');
ok(pr.statusCode === 200 && typeof JSON.parse(pr.body).held !== 'string' && JSON.parse(pr.body).changed > 0 && JSON.stringify(kv('priceEdits')) !== pe0, 'the price update runs again: ' + (JSON.parse(pr.body).changed) + ' prices moved', [pr.statusCode, String(pr.body).slice(0, 300)]);
setClock('2026-11-04T13:20:00Z'); reset();
const before13 = (lkv('gc_x10_codes') || []).length;
await sched('x10-scheduled');
ok((lkv('gc_x10_codes') || []).length < before13, 'the 7 AM access-code wipe runs again (closed / gone jobs\' codes cleared)', lkv('gc_x10_codes'));
reset(); await sched('companycam-sync');
ok(JSON.stringify(kv('projects') || '').includes('PRJcc_990001') || JSON.stringify(kv('projects__chunk0') || '').concat(JSON.stringify([...cloud.keys()].filter(k => /^projects__chunk/.test(k)).map(k => kv(k)))).includes('PRJcc_990001'), 'CompanyCam makes the new job again');

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed (part A)');
globalThis.Date = RealDate;
if (process.env.GC_NO_BROWSER === '1') process.exit(fail ? 1 : 0);

/* ══ B. the browser: the page's timers, the panel, as the owner and as the office ══
   B1 every page automation OFF (gc_automations all false): the page loads with no error; the invoice 1-day auto-post, the
      expense 5-day auto-post, the %-slider draw, auto-100 %, the commission sweep, AUT3 stages / draws, the MS tax, the
      legacy progress-billing timer and its AUTO-FLAG notes do nothing and record "held"; no long task;
   B2 the panel: every automation, grouped, a switch each; the owner switches one ON (saved + logged), "Turn on everything
      I had before" (every key ON) — and the invoice auto-post then works again;
   B3 the office: sees the panel read-only; her switch POST is refused (403) and nothing changes. */
console.log('B. the browser');
const { computer, signIn, sleep, waitFor } = H;
const MAXTASK = +(process.env.MAXTASK || 2000);
async function person(email){
  const c = await computer(email.split('@')[0], { build: BUILD }); c.acceptConfirm = true; c.prompts = [];
  const row = STAFF.find(x => x.email === email);
  await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access)/.test(u), async r => {
    const u = new URL(r.request().url());
    const J = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/gc_staff')) return J(row ? [row] : []);
    return J({ email, staff: true, admin: row && row.role === 'admin', payroll: !!(row && row.payroll), office: email === OFFICE, sec2: 1 });
  });
  await B.routeFunctions(c, bridge);
  await c.ctx.addInitScript(() => {
    try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
    window.__LT = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push({ s: Math.round(e.startTime), d: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    window.open = function(){ return { closed: false, close(){}, focus(){}, document: { write(){}, close(){}, open(){} }, location: {} }; };
  });
  await c.page().setViewportSize({ width: 1366, height: 768 });
  await signIn(c, email, 1000);
  await waitFor(c, () => document.querySelectorAll('aside button[draggable="true"]').length > 5 && !!(window._crm && window._crm.projects && window._crm.projects.length), null, 150000, 500);
  return c;
}
const ev = (c, f, a) => c.page().evaluate(f, a);
let bf = 0; const bok = (c, m, info) => { ok(c, m, info); if (!c) bf++; };
loadCloud(); cloud.delete('gc_auto_held');
/* every automation OFF except the 🔒 safety ones, which stay at their default ON (what the owner has in production: e.g. a
   missed call gets its text back). B checks the page automations (none of them is safety) and, below, that a safety switch
   shows 🔒 ON and asks before it is turned OFF — and before it is turned back ON (patch AUTOPANEL2). With every safety
   switch stored OFF here, that check started from OFF and could never see "🔒 ON". */
const B_ROW = Object.assign({}, ALL_OFF); AUTO.LIST.filter(a => a.group === 'safety').forEach(a => { B_ROW[a.key] = true; });
setKv('gc_automations', B_ROW); reset();
/* a job to drag, an old pending invoice approval, an old matched expense */
const projs0 = kv('projects') || [], jobB = (Array.isArray(projs0) ? projs0 : []).find(p => p && !/complete|closed|lost|cancel|archiv/i.test(String(p.status || '')) && parseFloat(String(p.contract || '').replace(/[$,]/g, '')) > 1000 && (+p.pct || 0) < 40 && !p.deleted) || null;
const flagsBefore = JSON.stringify(kv('projects') || '').split('AUTO-FLAG').length;
const owner = await person(OWNER);
bok(!!(await ev(owner, () => !!(window._gcAutoReg && window._gcAutoGate && window._gcAutomations && window._gcAutoPanel))), 'the page has the list, the one check and the panel');
await waitFor(owner, () => window._gcAutomations.state().loaded, null, 30000, 300);
bok(await ev(owner, () => window._gcAutomations.state().loaded && window._gcAutoOn('invoice_autopost') === false && window._gcAutoOn('backups') === false && window._gcAutoOn('cloud_sync') === true), 'the page read the switches (all OFF; cloud sync always on)');
const invN0 = await ev(owner, () => ((window._crm && window._crm.invoices) || []).filter(i => i && /auto-draw/.test(String(i.createdBy || ''))).length);
const r1 = await ev(owner, async (pid) => {
  const out = {};
  const old = Date.now() - 3 * 864e5;
  const inv = ((window._crm && window._crm.invoices) || []).find(i => i && i.type === 'client' && /draft/i.test(String(i.status || '')));
  out.draft = inv ? inv.id : null;
  try { localStorage.setItem('gc_invoice_approvals', JSON.stringify([{ invId: inv ? inv.id : 'INVnone', pid: inv ? inv.pid : '', amt: 1, desc: 'autopanel test', createdAt: old, status: 'pending' }])); } catch (e) {}
  try { const q = JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]'); q.unshift({ expId: 'EXP-autopanel', enteredAt: new Date(old - 5 * 864e5).toISOString(), status: 'pending_pm', matched: true, payee: 'Autopanel test' }); localStorage.setItem('gc_expense_approvals', JSON.stringify(q)); } catch (e) {}
  try { window._gcExpenseAging(); } catch (e) { out.expErr = String(e.message); }
  out.exp = (JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]').find(a => a.expId === 'EXP-autopanel') || {}).status;
  try { out.sweep = await window._gcSweepCommissions(true); } catch (e) { out.sweepErr = String(e.message); }
  try { const jp = ((window._crm && window._crm.projects) || []).find(p => p && (+p.pct || 0) < 100 && !p.deleted && /complete|closed/i.test(String(p.status || ''))) || ((window._crm && window._crm.projects) || []).find(p => p && (+p.pct || 0) < 100 && !p.deleted);
    if (jp) { out.a100job = jp.id; if (!/complete|closed/i.test(String(jp.status || ''))) { window._setProjects(l => l.map(p => p && p.id === jp.id ? Object.assign({}, p, { _manualComplete: true }) : p)); await new Promise(r => setTimeout(r, 800)); } }
    window._gcAutoProgress100(); await new Promise(r => setTimeout(r, 500)); const j2 = ((window._crm && window._crm.projects) || []).find(p => p && p.id === out.a100job); out.a100pct = j2 ? j2.pct : null; } catch (e) { out.a100 = String(e.message); }
  try { if (window._gcCheckMSTax) window._gcCheckMSTax(); } catch (e) { out.ms = String(e.message); }
  try { if (window._gcAut3 && window._gcAut3.stageTick) window._gcAut3.stageTick(); } catch (e) { out.st = String(e.message); }
  pid = (((window._crm && window._crm.projects) || []).find(p => p && parseFloat(String(p.contract || '').replace(/[$,]/g, '')) > 1000 && (+p.pct || 0) < 50 && !/complete|closed|lost|cancel/i.test(String(p.status || '')) && window._gcDrawMilestones && window._gcDrawMilestones(p).some(m => !window._gcDrawInvoiced(p.id, m.n))) || {}).id || pid; out.dragPid = pid;
  if (pid) { try { window.__alerts = []; const a = window.alert; window.alert = m => window.__alerts.push(String(m)); window._gcSetProjectPct(pid, 100); window.alert = a; out.alerts = window.__alerts.slice(); } catch (e) { out.drag = String(e.message); } }
  return out;
}, jobB && jobB.id);
await sleep(26000);   /* the invoice sweep's first run (20 s after load) and the legacy 60-s timers */
await sleep(40000);
const r2 = await ev(owner, () => ({ inv: (JSON.parse(localStorage.getItem('gc_invoice_approvals') || '[]')[0] || {}).status, invs: ((window._crm && window._crm.invoices) || []).filter(i => i && /auto-draw/.test(String(i.createdBy || ''))).length,
  held: Object.keys(window._gcAutomations.state().localHeld) }));
bok(r1.exp === 'pending_pm', 'expense 5-day auto-post OFF: the 8-day-old matched expense is still waiting (not auto-posted, not escalated)', r1);
bok(Array.isArray(r1.sweep) && r1.sweep.length === 0, 'the automatic commission sweep OFF: nothing queued', r1.sweep);
bok(r2.inv === 'pending', 'invoice 1-day auto-post OFF: the 3-day-old draft is still pending (not sent)', r2);
bok(!!jobB && r2.invs === invN0 && !(r1.alerts || []).some(a => /DRAFT/.test(a)), 'progress-slider auto-draw OFF: dragging ' + (jobB ? jobB.name : '(no job)') + ' to 100 % made no invoice', [invN0, r2.invs, r1.alerts]);
bok(!!r1.a100job && r1.a100pct !== 100, 'auto-100 % OFF: a completed job is not moved to 100 %', r1);
const PAGE_KEYS = ['invoice_autopost', 'expense_autopost', 'commission_sweep', 'progress_autodraw', 'auto_100', 'job_stages', 'legacy_progress_billing', 'legacy_autoflag_notes', 'dup_invoice_delete'];
bok(PAGE_KEYS.every(k => r2.held.indexOf(k) >= 0), 'every page automation that came due recorded "held" on this computer', PAGE_KEYS.filter(k => r2.held.indexOf(k) < 0));
await ev(owner, () => window._gcAutomations.flush()); await sleep(2500);
const heldB = kv('gc_auto_held') || {};
bok(['invoice_autopost', 'expense_autopost', 'job_stages'].every(k => heldB[k] && heldB[k].n >= 1), 'and sent them to gc_auto_held (the panel shows "held N times since …")', Object.keys(heldB));
bok(JSON.stringify(kv('projects') || '').split('AUTO-FLAG').length === flagsBefore, 'no new AUTO-FLAG note on any job');
/* the panel */
await ev(owner, () => window._gcAutoPanel.open()); await sleep(2500);
const pan = await ev(owner, () => { const b = document.querySelector('#gcap-ov'); return b ? { rows: b.querySelectorAll('[data-gcap-key]').length, groups: [...b.querySelectorAll('h4')].map(h => h.textContent.replace(/\s*\(.*$/, '')), locks: [...b.querySelectorAll('.gcap-name')].filter(n => /🔒/.test(n.textContent)).length,
  cc: !!b.querySelector('.gcap-cc') && /how PM jobs arrive/.test(b.querySelector('.gcap-cc').textContent), held: /held \d+ time/.test(b.textContent), enabled: b.querySelectorAll('input[data-gcap-sw]:not([disabled])').length, before: !!b.querySelector('[data-gcap="before"]') } : null; });
bok(pan && pan.rows === AUTO.LIST.length, 'the panel lists every automation (' + (pan && pan.rows) + ')', pan);
bok(pan && ['Customer sends', 'Sub sends', 'Record changes', 'Staff alerts', 'Safety', 'Sync / backups / lead intake'].every(g => pan.groups.indexOf(g) >= 0), 'grouped: Customer sends · Sub sends · Record changes · Staff alerts · Safety · Sync / backups', pan && pan.groups);
bok(pan && pan.locks === AUTO.LIST.filter(a => a.group === 'safety').length && pan.cc && pan.held && pan.before && pan.enabled > 80, 'safety lines carry 🔒, CompanyCam says it is how PM jobs arrive, "held N times" shows, the owner can switch', pan);
/* switch the invoice auto-post ON in the panel */
await ev(owner, () => { const i = document.querySelector('#gcap-ov input[data-gcap-sw="invoice_autopost"]'); i.click(); }); await sleep(2500);
bok(kv('gc_automations').invoice_autopost === true && kv('gc_automations')._log[0].key === 'invoice_autopost' && kv('gc_automations')._log[0].by === OWNER, 'owner: the switch in the panel turns "Invoice 1-day auto-post" ON (saved, logged)', (kv('gc_automations')._log || [])[0]);
/* a safety switch asks first */
const sc = await ev(owner, async () => { const c0 = window.confirm; const asked = []; window.confirm = m => { asked.push(String(m)); return false; };
  const i = document.querySelector('#gcap-ov input[data-gcap-sw="missed_call_textback"]'); const was = i && i.checked; if (i) i.click(); await new Promise(r => setTimeout(r, 1500)); window.confirm = c0;
  const j = document.querySelector('#gcap-ov input[data-gcap-sw="missed_call_textback"]'); return { was, now: j && j.checked, asked, lock: /🔒/.test(j && j.closest('.gcap-row').textContent) }; });
const ws = await ev(owner, async () => { const c0 = window.confirm; const asked = []; window.confirm = m => { asked.push(String(m)); return false; };
  const i = document.querySelector('#gcap-ov input[data-gcap-sw="job_stages"]'); if (i) i.click(); await new Promise(r => setTimeout(r, 1200)); window.confirm = c0;
  const j = document.querySelector('#gcap-ov input[data-gcap-sw="job_stages"]'); return { now: j && j.checked, asked, line: j && j.closest('.gcap-row').textContent }; });
bok(ws.now === false && ws.asked.some(m => /will act on (\d+|an unknown number of) waiting/.test(m)) && /switching it on acts on/.test(ws.line) && !AUTO.valueOf(kv('gc_automations'), 'job_stages'),
  'a state-based automation (AUT3 stages / draws) warns "Turning this on will act on N waiting … NOW" before switch-on (said no → still OFF)', ws);
bok(sc.was === true && sc.now === true && sc.lock && sc.asked.some(m => /SAFETY/.test(m)) && AUTO.valueOf(kv('gc_automations'), 'missed_call_textback') === true, 'a safety switch shows 🔒 ON and asks first (said no → still ON)', sc);
/* and back ON asks first too (patch AUTOPANEL2): yes → OFF, then said no to ON → stays OFF ("Turn on everything" below puts it back) */
const sc2 = await ev(owner, async () => { const c0 = window.confirm; const asked = []; const sw = () => document.querySelector('#gcap-ov input[data-gcap-sw="missed_call_textback"]');
  window.confirm = m => { asked.push(String(m)); return true; }; if (sw()) sw().click(); await new Promise(r => setTimeout(r, 2500));
  const off = !!sw() && sw().checked === false;
  window.confirm = m => { asked.push(String(m)); return false; }; if (sw()) sw().click(); await new Promise(r => setTimeout(r, 1500)); window.confirm = c0;
  return { off, now: sw() && sw().checked, asked, lock: /🔒/.test(sw() && sw().closest('.gcap-row').textContent) }; });
bok(sc2.off && sc2.now === false && sc2.lock && sc2.asked.length === 2 && /Turn OFF/.test(sc2.asked[0]) && /Turn ON/.test(sc2.asked[1]) && /SAFETY/.test(sc2.asked[1]) && AUTO.valueOf(kv('gc_automations'), 'missed_call_textback') === false,
  'a safety switch that is OFF asks before it is turned back ON (said no → stays OFF)', sc2);
await ev(owner, () => { const b = document.querySelector('#gcap-ov [data-gcap="before"]'); b.click(); }); await sleep(3000);
bok(AUTO.LIST.every(a => AUTO.valueOf(kv('gc_automations'), a.key) === true), '"↺ Turn on everything I had before" → every automation ON');
const r3 = await ev(owner, async () => { await window._gcAutomations.load(); return { a: window._gcAutoOn('invoice_autopost'), b: window._gcAutoOn('expense_autopost'), c: window._gcAutoSince('expense_autopost'), st: window._gcAutomations.state().err, log: (window._gcAutomations.state().log || []).length }; });
bok(r3.a && r3.b && r3.c > 0, 'the page sees them ON again; time-based ones count from now (no burst)', r3);
const lt = (await ev(owner, () => window.__LT)).filter(x => x.d > MAXTASK);
bok(!lt.length, 'owner: no long task over ' + MAXTASK + ' ms', lt.slice(0, 5));
bok(!owner.errs.length, 'owner: no page error', owner.errs.slice(0, 5));
await owner.b.close();
/* the office */
setKv('gc_automations', {}); reset();
const office = await person(OFFICE);
await waitFor(office, () => window._gcAutomations.state().loaded, null, 30000, 300);
await ev(office, () => window._gcAutoPanel.open()); await sleep(2500);
const po = await ev(office, () => { const b = document.querySelector('#gcap-ov'); return b ? { rows: b.querySelectorAll('[data-gcap-key]').length, enabled: b.querySelectorAll('input[data-gcap-sw]:not([disabled])').length, before: !!b.querySelector('[data-gcap="before"]'), note: /only an admin/i.test(b.textContent) } : null; });
bok(po && po.rows === AUTO.LIST.length && po.enabled === 0 && !po.before && po.note, 'office: sees every automation, read only ("only an admin can switch")', po);
const of = await ev(office, async () => { const o = await window._gcAutomations.set({ invoice_autopost: true }); return o.__status; });
bok(of === 403 && !('invoice_autopost' in (kv('gc_automations') || {})), 'office: a switch sent anyway is refused by the server (403), nothing changes', of);
bok(!office.errs.length, 'office: no page error', office.errs.slice(0, 5));
const lt2 = (await ev(office, () => window.__LT)).filter(x => x.d > MAXTASK);
bok(!lt2.length, 'office: no long task over ' + MAXTASK + ' ms', lt2.slice(0, 5));
await office.b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
