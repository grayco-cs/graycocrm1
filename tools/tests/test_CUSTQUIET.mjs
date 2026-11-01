// test_CUSTQUIET.mjs — patch CUSTQUIET: customer quiet hours 7 PM–7 AM Central (owner: "never post to portal or send texts
// anything after 7pm -7am"). Offline: Supabase REST (in-memory gc_kv; gc_lead_inbox_kv missing → gc_kv), Twilio and Resend are
// fakes; made-up people, jobs and numbers only; nothing leaves this computer. The clock is faked (Date.now).
//   Node part (always): the Central clock + DST, held texts / e-mails, the 7 AM release (each once, a second run sends nothing),
//   approvals scheduled for 7 AM, the emergency reply at 10 PM, staff alerts unaffected, the admin override, no override for
//   anyone else.
//   Browser part (with a build dir): the approval toast, the "Scheduled 7:00 AM" row and the admin-only "Send now (emergency)"
//   in the real CRM page (offline harness — GC_HARNESS = harness_N.mjs; run one browser test at a time).
// Usage: node tools/tests/test_CUSTQUIET.mjs [dir with the built index.html]
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(path.join(HERE, '../../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'CUST_QUIET_OFF', 'PORTAL_MAIL_OFF'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); } }

/* ── the fake clock ── */
const realNow = Date.now;
let NOW = realNow();
Date.now = () => NOW;
const at = iso => { NOW = Date.parse(iso); };

/* ── the fake cloud ── */
const KV = new Map(), SMS = [], MAIL = [];
let tick = 0;
const stamp = () => new Date(realNow() + (++tick)).toISOString();
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: stamp() });
const getKv = k => { let v = (KV.get(k) || {}).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  if (u.host === 'sb.test') {
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') return J(200, []);
    if (u.pathname === '/rest/v1/gc_kv') {
      const kq = u.searchParams.get('key') || '';
      if (m === 'GET') {
        if (kq.startsWith('in.(')) { const keys = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return J(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k).value, updated_at: KV.get(k).updated_at }))); }
        const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r.value, updated_at: r.updated_at }] : []);
      }
      const body = JSON.parse(init.body || '{}'), key = kq.replace(/^eq\./, '');
      if (m === 'PATCH') { const r = KV.get(key), uat = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || (uat && r.updated_at !== uat)) return J(200, []); KV.set(key, { value: body.value, updated_at: body.updated_at || stamp() }); return J(200, [{ key }]); }
      if (m === 'POST') { const rows = Array.isArray(body) ? body : [body]; rows.forEach(b => KV.set(b.key, { value: b.value, updated_at: stamp() })); return J(201, null); }
    }
    return J(200, []);
  }
  if (u.host === 'api.twilio.com') { SMS.push(Object.assign({ at: NOW }, Object.fromEntries(new URLSearchParams(init.body)))); return J(201, { sid: 'SM' + SMS.length }); }
  if (u.host === 'api.resend.com') { MAIL.push(Object.assign({ at: NOW }, JSON.parse(init.body))); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
require(path.join(SRC, '_lib/pause.js')).install();
const CQ = require(path.join(SRC, '_lib/custquiet.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
const TX = require(path.join(SRC, 'texts.js'));
const SA = require(path.join(SRC, '_lib/smsalert.js'));
const RT = require(path.join(SRC, '_lib/smsroute.js'));
const SUBTXT = require(path.join(SRC, '_lib/subtxt.js'));
const portal = require(path.join(SRC, 'portal.js'));
const REL = require(path.join(SRC, 'cust-release.js'));
const C = portal._core;

const USERS = [
  { id: 'u1', name: 'Wes Admin', email: 'wes.test@grayco-cs.com', role: 'Admin', active: true, phone: '9015550100' },
  { id: 'u2', name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true, phone: '9015550111' }];
const ADMIN = { email: 'wes.test@grayco-cs.com', role: 'admin', name: 'Wes Admin', admin: true };
const PM = { email: 'steven.test@grayco-cs.com', role: 'pm', name: 'Steven Park' };
const PMREC = { name: 'Steven Park', email: 'steven.test@grayco-cs.com' };
function world(){
  KV.clear(); SMS.length = 0; MAIL.length = 0;
  setKv('users', USERS);
  setKv('projects', [{ id: 'PJ1', name: 'Test Reroof', pm: 'Steven Park', client: 'Pat Sample', clientEmail: 'customer@example.test', clientPhone: '9015551234' }]);
  setKv('customers', []); setKv('leads', []); setKv('gc_job_messages', '[]'); setKv('gc_office_tasks', '[]'); setKv('gc_approval_queue', '[]');
  setKv('gc_automation_pause', { on: false });
  try { require(path.join(SRC, '_lib/pause.js')).reset(); } catch (e) {}
}
const twilio = (to, body) => globalThis.fetch('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json', { method: 'POST',
  headers: { Authorization: 'Basic x', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: '+1' + to, From: '+19015550000', Body: body }).toString() });
const queue = () => (getKv(CQ.KEY) || { items: [] }).items || [];
const aq = () => getKv('gc_approval_queue') || [];
const CDT = 'Central daylight time', CST = 'Central standard time';

console.log('— the Central clock (one helper for every function) —');
{
  const t = s => CQ.quiet(Date.parse(s));
  ok(!t('2026-10-29T23:59:00Z'), '6:59 PM CDT is not quiet');
  ok(t('2026-10-30T00:00:00Z'), '7:00 PM CDT is quiet');
  ok(t('2026-10-30T07:00:00Z'), '2:00 AM CDT is quiet');
  ok(t('2026-10-30T11:59:59Z'), '6:59:59 AM CDT is quiet');
  ok(!t('2026-10-30T12:00:00Z'), '7:00 AM CDT is not quiet');
  ok(new Date(CQ.nextRelease(Date.parse('2026-10-30T00:00:00Z'))).toISOString() === '2026-10-30T12:00:00.000Z', 'released at the next 7:00 AM (' + CDT + ' = 12:00 UTC)');
  ok(new Date(CQ.nextRelease(Date.parse('2026-10-30T07:00:00Z'))).toISOString() === '2026-10-30T12:00:00.000Z', 'at 2 AM: the same morning\'s 7:00 AM');
  /* DST ends Sun Nov 1 2026 at 2 AM: 7 PM Saturday (CDT) → 7 AM Sunday (CST) is 13 hours */
  ok(new Date(CQ.nextRelease(Date.parse('2026-11-01T01:00:00Z'))).toISOString() === '2026-11-01T13:00:00.000Z', 'DST end: 8 PM Sat Oct 31 (CDT) → 7:00 AM Sun Nov 1 ' + CST + ' = 13:00 UTC');
  ok(t('2026-11-01T06:30:00Z') && t('2026-11-01T07:30:00Z'), 'DST end: 1:30 AM CDT and 1:30 AM CST (the repeated hour) are both quiet');
  ok(t('2026-11-01T12:00:00Z'), 'DST end: 12:00 UTC is 6:00 AM CST — still quiet (a fixed UTC-5 clock would have sent)');
  ok(!t('2026-11-01T13:00:00Z'), 'DST end: 13:00 UTC = 7:00 AM CST — not quiet');
  ok(!t('2026-11-02T00:59:00Z') && t('2026-11-02T01:00:00Z'), 'after DST: 6:59 PM CST sends, 7:00 PM CST (01:00 UTC) is quiet');
  ok(new Date(CQ.nextRelease(Date.parse('2027-03-14T04:00:00Z'))).toISOString() === '2027-03-14T12:00:00.000Z', 'DST start: 10 PM Sat Mar 13 (CST) → 7:00 AM Sun Mar 14 CDT = 12:00 UTC');
  ok(t('2027-03-14T11:30:00Z') && !t('2027-03-14T12:00:00Z'), 'DST start: 6:30 AM CDT quiet, 7:00 AM CDT not');
  ok(RT.quiet(Date.parse('2026-10-30T00:30:00Z')) && !RT.quiet(Date.parse('2026-10-29T23:30:00Z')), 'smsroute automatic-text quiet hours now start at 7 PM (was 8 PM)');
  ok(!SUBTXT.quietOk('evening', Date.parse('2026-10-30T00:10:00Z')) && SUBTXT.quietOk('evening', Date.parse('2026-10-29T23:10:00Z')), 'sub evening text: 6:10 PM goes, 7:10 PM waits');
  ok(CQ.heldNow('2026-10-30T02:00:00Z', Date.parse('2026-10-30T03:00:00Z')) && !CQ.heldNow('2026-10-29T23:00:00Z', Date.parse('2026-10-30T03:00:00Z')) && !CQ.heldNow('2026-10-30T02:00:00Z', Date.parse('2026-10-30T12:00:00Z')),
    'a portal post made at 9 PM is hidden until 7 AM; one made at 6 PM stays shown; at 7 AM the 9 PM post shows');
}

console.log('— texts: 6:59 PM sends, 7:00 PM / 2 AM are queued, 7 AM releases each once —');
world();
{
  at('2026-10-29T23:59:00Z');
  let r = await twilio('9015551234', 'six fifty-nine');
  ok(r.ok && SMS.length === 1 && SMS[0].Body === 'six fifty-nine', '6:59 PM: the text goes at once');
  at('2026-10-30T00:00:00Z');
  r = await twilio('9015551234', 'seven pm');
  const j1 = await r.json();
  ok(SMS.length === 1 && r.headers.get('x-gc-held') === '1' && j1.held && j1.held.releaseAt === '2026-10-30T12:00:00.000Z', '7:00 PM: queued for 7:00 AM, nothing reached Twilio', j1);
  at('2026-10-30T07:00:00Z');
  r = await twilio('9015552222', 'two am');
  ok(SMS.length === 1 && queue().filter(x => x.status === 'held').length === 2, '2 AM: queued too (2 waiting)');
  at('2026-10-30T11:59:00Z');
  let rel = await CQ.release({});
  ok(rel.quiet && SMS.length === 1, '6:59 AM: the release run does nothing (still quiet)');
  at('2026-10-30T12:00:00Z');
  rel = await CQ.release({});
  ok(rel.sent === 2 && SMS.length === 3 && SMS[1].Body === 'seven pm' && SMS[2].Body === 'two am', '7:00 AM: both go, oldest first', SMS.map(x => x.Body));
  ok(queue().every(x => x.status === 'sent'), 'both are marked sent', queue());
  rel = await CQ.release({});
  ok(rel.sent === 0 && SMS.length === 3, 'a second release run sends nothing');
  /* two release runs at the same moment: still once */
  at('2026-10-30T03:00:00Z'); await twilio('9015551234', 'race');
  at('2026-10-30T12:05:00Z');
  const both = await Promise.all([CQ.release({}), CQ.release({})]);
  ok(SMS.filter(x => x.Body === 'race').length === 1 && both[0].sent + both[1].sent === 1, 'two release runs at once: the text goes exactly once', both.map(b => b.sent));
}

console.log('— DST: held Saturday night, released at 7:00 AM CST (13:00 UTC) —');
world();
{
  at('2026-11-01T01:00:00Z');   /* 8 PM Sat Oct 31 CDT */
  await twilio('9015551234', 'dst night');
  ok(SMS.length === 0 && queue()[0].releaseAt === '2026-11-01T13:00:00.000Z', 'held for 7:00 AM CST', queue()[0]);
  at('2026-11-01T12:00:00Z');   /* 6 AM CST */
  let rel = await CQ.release({});
  ok(rel.quiet && SMS.length === 0, '6:00 AM CST (12:00 UTC): not yet');
  at('2026-11-01T13:00:00Z');
  rel = await CQ.release({});
  ok(rel.sent === 1 && SMS.length === 1, '7:00 AM CST: sent once');
}

console.log('— the emergency path still goes at 10 PM; a normal missed call waits —');
world();
{
  at('2026-10-30T03:00:00Z');   /* 10 PM CDT */
  let r = await MC._test.missed({ From: '+19015554444', CallSid: 'CAe1', CallerName: 'Tom Hardy' }, 'test', { what: 'my basement is flooding' });
  ok(SMS.length === 1 && SMS[0].To === '+19015554444' && !r.heldUntil, '10 PM: the text-back to a caller with an EMERGENCY (flooding) goes now', r && r.text);
  r = await MC._test.missed({ From: '+19015557777', CallSid: 'CAe2' }, 'after hours (pressed 1)', { emergency: true });
  ok(SMS.length === 2 && SMS[1].To === '+19015557777', '10 PM: an after-hours "press 1" emergency caller is texted now');
  r = await MC._test.missed({ From: '+19015555555', CallSid: 'CAn1' }, 'test', { what: 'I want a quote for a fence' });
  ok(SMS.length === 2 && r.heldUntil === '2026-10-30T12:00:00.000Z', '10 PM: a normal missed call\'s text-back (lead auto-reply) is queued for 7 AM', r);
  r = await MC._test.inboundSms({ From: '+19015556666', To: '+19015550000', Body: 'emergency water leak in my kitchen', MessageSid: 'SMem1' });
  ok(SMS.some(x => x.To === '+19015556666'), '10 PM: the automatic answer to a customer\'s EMERGENCY text goes now', r && { reply: r.reply, noReply: r.noReply });
  const n0 = SMS.length;
  r = await MC._test.inboundSms({ From: '+19015558888', To: '+19015550000', Body: 'what are your hours', MessageSid: 'SMn1' });
  ok(SMS.length === n0 && r.reply && r.reply.held && r.replyHeldUntil === '2026-10-30T12:00:00.000Z', '10 PM: the automatic answer (lead auto-reply) to an ordinary text is queued for 7 AM', r && { reply: r.reply, held: r.replyHeldUntil, noReply: r.noReply });
}

console.log('— staff alerts are unaffected; manual texts to customers wait; the admin override —');
world();
{
  at('2026-10-30T04:00:00Z');   /* 11 PM CDT */
  let r = await SA._D.send('9015550100', 'GrayCo: 🚨 emergency lead — water', '+19015550000');
  ok(r && r.ok && !r.held && SMS.length === 1, '11 PM: a staff cell alert (smsalert) goes now');
  r = await TX._t.send({ email: 'steven.test@grayco-cs.com', name: 'Steven Park' }, { to: '9015550100', text: 'call me when you can' });
  ok(r.code === 200 && !r.body.held && SMS.length === 2, '11 PM: a text from the CRM to a staff member\'s cell goes now', r.body);
  r = await TX._t.send({ email: 'steven.test@grayco-cs.com', name: 'Steven Park' }, { to: '9015551234', text: 'Your shingles arrive tomorrow', pid: 'PJ1' });
  ok(r.code === 200 && r.body.held === true && r.body.say === CQ.SAY && SMS.length === 2, '11 PM: a text to the customer is queued; the answer carries the sentence', r.body);
  const mid = r.body.id;
  const jm = () => (getKv('gc_job_messages') || []).find(x => x.id === mid) || {};
  ok(/⏰ Scheduled 7:00 AM/.test(jm().authorName) && jm().heldUntil === '2026-10-30T12:00:00.000Z', 'Job Messages shows it as "⏰ Scheduled 7:00 AM" until it goes', jm());
  r = await TX._t.send({ email: 'steven.test@grayco-cs.com', name: 'Steven Park', admin: false }, { to: '9015551234', text: 'pm tries sendNow', sendNow: true });
  ok(r.body.held === true && SMS.length === 2, 'a non-admin\'s sendNow is ignored — still queued');
  r = await TX._t.send({ email: 'wes.test@grayco-cs.com', name: 'Wes Admin', admin: true }, { to: '9015551234', text: 'admin emergency text', sendNow: true });
  ok(!r.body.held && SMS.length === 3 && SMS[2].Body.indexOf('admin emergency text') === 0, 'an admin\'s "Send now (emergency)" text goes at once');
  const held = queue().filter(x => x.status === 'held');
  r = await CQ.sendNow(held[1].id);
  ok(r.ok && SMS.length === 4 && SMS[3].Body.indexOf('pm tries sendNow') === 0 && queue().find(x => x.id === held[1].id).status === 'sent', 'an admin\'s Send now on one held text sends that one only');
  at('2026-10-30T12:00:00Z');
  const rep = await REL._t.runRelease({});
  ok(rep.queue.sent === 1 && SMS.length === 5 && SMS[4].Body.indexOf('Your shingles arrive tomorrow') === 0, '7:00 AM: the queued customer text goes (once)', rep);
  ok(!jm().heldUntil && !/Scheduled/.test(jm().authorName) && jm().releasedAt, 'its Job Messages line loses "Scheduled 7:00 AM"', jm());
  await REL._t.runRelease({});
  ok(SMS.length === 5, 'a second release sends nothing');
}

console.log('— approvals: scheduled for 7 AM, released once; admin-only "Send now" —');
world();
{
  const q = async (id) => C.queueApproval({ id, kind: 'thank_you', pid: 'PJ1', jobName: 'Test Reroof', pm: PMREC, to: 'customer@example.test', subject: 'Thank you ' + id, html: '<p>Hi ' + id + '</p>' });
  await q('A0'); await q('A1'); await q('A2'); await q('A3'); await q('A4');
  at('2026-10-29T23:59:00Z');
  let r = await C.approvalAction({ op: 'approve', id: 'A0' }, ADMIN);
  ok(r.out.ok && r.out.sent && MAIL.length === 1, '6:59 PM: an approval sends at once');
  at('2026-10-30T03:00:00Z');
  r = await C.approvalAction({ op: 'approve', id: 'A1' }, ADMIN);
  ok(r.out.ok && r.out.scheduled && !r.out.sent && r.out.say === CQ.SAY && r.out.item.status === 'scheduled' && r.out.releaseAt === '2026-10-30T12:00:00.000Z' && MAIL.length === 1,
    '10 PM: the approval is recorded and SCHEDULED for 7:00 AM — nothing sent; the answer carries the sentence', r.out);
  r = await C.approvalAction({ op: 'approve', id: 'A2' }, ADMIN);
  ok(r.out.scheduled && MAIL.length === 1, '10 PM: a second approval is scheduled too');
  r = await C.approvalAction({ op: 'sendnow', id: 'A2' }, PM);
  ok(r.status === 403 && MAIL.length === 1, 'a non-admin has no "Send now" (403)', r.out);
  r = await C.approvalAction({ op: 'sendnow', id: 'A2' }, ADMIN);
  ok(r.out.ok && r.out.sent && MAIL.length === 2 && MAIL[1].subject.indexOf('Thank you A2') >= 0 && aq().find(x => x.id === 'A2').status === 'sent', 'an admin\'s "Send now (emergency)" sends that one at once');
  r = await C.approvalAction({ op: 'approve', id: 'A3', sendNow: true }, ADMIN);
  ok(r.out.sent && MAIL.length === 3, 'an admin approving with sendNow (emergency) at 10 PM sends at once');
  r = await C.approvalAction({ op: 'approve', id: 'A4', sendNow: true }, Object.assign({}, PM, { role: 'office' }));
  ok(!r.out.sent && (r.out.scheduled || r.status === 403) && MAIL.length === 3, 'a non-admin\'s sendNow never sends at night', r.out);
  at('2026-10-30T11:59:00Z');
  let rel = await C.releaseScheduled({});
  ok(rel.quiet && MAIL.length === 3, '6:59 AM: nothing yet');
  at('2026-10-30T12:00:00Z');
  const rep = await REL._t.runRelease({});
  const sentNow = MAIL.slice(3).map(m => m.subject);
  ok(rep.approvals.sent >= 1 && sentNow.filter(x => /Thank you A1/.test(x)).length === 1 && aq().find(x => x.id === 'A1').status === 'sent', '7:00 AM: the scheduled approval goes, once', { rep, sentNow });
  const n = MAIL.length;
  rel = await C.releaseScheduled({});
  ok(rel.sent === 0 && MAIL.length === n, 'a second release sends nothing');
}

console.log('— portal posts made at night show from 7 AM —');
world();
{
  setKv('projects', [{ id: 'PJ1', name: 'Test Reroof', pm: 'Steven Park', client: 'Pat Sample', clientEmail: 'customer@example.test',
    portalPosts: [{ id: 'p6', at: '2026-10-29T23:00:00Z', text: 'six pm post' }, { id: 'p9', at: '2026-10-30T02:00:00Z', text: 'nine pm post' }] }]);
  const data = await C.crmData(true), p = (data.projects || []).find(x => x.id === 'PJ1');
  at('2026-10-30T03:00:00Z');
  let v = await C.buildView(data, p);
  const texts = vv => JSON.stringify(vv).match(/(six|nine) pm post/g) || [];
  ok(texts(v).indexOf('six pm post') >= 0 && texts(v).indexOf('nine pm post') < 0, '10 PM: the 6 PM post shows, the 9 PM post does not yet', texts(v));
  at('2026-10-30T12:00:00Z');
  v = await C.buildView(data, p);
  ok(texts(v).indexOf('nine pm post') >= 0, '7:00 AM: the 9 PM post shows');
}
Date.now = realNow;
console.log('node part: ' + pass + ' passed, ' + fail + ' failed');

/* ── the browser part: the approval toast in the real page ── */
const build = process.argv[2];
if (build) {
  const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
  const H = await import(pathToFileURL(HARNESS).href);
  const SAY = '⏰ Scheduled for 7:00 AM — customers don\'t get posts or texts 7 PM–7 AM';
  const NIGHT = Date.parse('2026-10-30T03:00:00Z');
  const item = st => ({ id: 'AQ_T1', kind: 'thank_you', title: 'Thank-you e-mail', jobId: 'P1', jobName: 'Demo Reroof', pm: 'Sample PM', to: 'customer@example.test', channel: 'email', subject: 'Thank you', html: '<p>Hi</p>',
    steps: ['admin'], step: 'admin', approvals: [], status: st, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), releaseAt: '2026-10-30T12:00:00.000Z', meta: {} });
  async function device(email){
    H.resetCloud();
    H.cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
      { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
    H.cset('projects', [{ id: 'P1', name: 'Demo Reroof', client: 'Sample Homeowner', pm: 'Sample PM', status: 'Active', contract: 10000 }]);
    H.cset('gc_approval_queue', JSON.stringify([item('waiting'), Object.assign(item('scheduled'), { id: 'AQ_T2', title: 'Scheduled one' })]));
    const c = await H.computer('CQ-' + email.split('@')[0], { build });
    c.calls = [];
    await c.ctx.route('**/.netlify/functions/portal*', async r => {
      let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      c.calls.push(b);
      if (b.action === 'approval' && b.op === 'approve') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent: false, scheduled: true, releaseAt: '2026-10-30T12:00:00.000Z', say: SAY, item: item('scheduled') }) });
      if (b.action === 'approval' && b.op === 'sendnow') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent: true, override: true, item: Object.assign(item('sent'), { id: b.id }) }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await H.signIn(c, email);
    await H.waitFor(c, () => !!(window._gcCQ && window._gcApprovalAct), null, 60000, 300);
    await c.ev(ms => { window._gcCQNow = () => ms; }, NIGHT);
    return c;
  }
  const toastOf = c => c.ev(() => { const t = document.querySelector('.gc-cq-toast'); return t ? { text: t.textContent, link: !!t.querySelector('[data-cq-a]') } : null; });
  /* the admin */
  let c = await device('wjohnson@grayco-cs.com');
  ok(await c.ev(() => window._gcCQ.quiet()), 'browser: the page\'s clock says 10 PM Central is quiet');
  ok(await c.ev(ms => !window._gcCQ.quiet(ms), Date.parse('2026-10-29T23:59:00Z')), 'browser: 6:59 PM is not quiet');
  await c.ev(() => window._gcApprovalAct('AQ_T1', 'approve'));
  let tt = null; for (let i = 0; i < 20 && !tt; i++) { await H.sleep(250); tt = await toastOf(c); }
  ok(tt && tt.text.indexOf(SAY) === 0, 'browser: approving at night shows "' + SAY + '"', tt);
  ok(tt && tt.link, 'browser: the admin\'s toast has "Send now (emergency)"');
  const rows = await c.ev(() => (window._gcAPX && window._gcAPX.rows ? window._gcAPX.rows() : []).filter(r => /AQ_T2/.test(r.key)).map(r => ({ waits: r.waits, step: r.step })));
  ok(rows.length && rows[0].waits === '⏰ Scheduled 7:00 AM', 'browser: the Approvals list keeps the scheduled item as "⏰ Scheduled 7:00 AM"', rows);
  const rh = await c.ev(() => window._gcCQRowHtml({ step: 'scheduled', src: 'queue', id: 'AQ_T2' }));
  ok(/Scheduled for 7:00 AM/.test(rh) && /Send now \(emergency\)/.test(rh), 'browser: an admin sees "Send now (emergency)" on it', rh);
  await c.ev(() => { const a = document.createElement('a'); a.setAttribute('data-cq-a', 'AQ_T2'); a.textContent = 'x'; document.body.appendChild(a); a.click(); });
  let sn = null; for (let i = 0; i < 20 && !sn; i++) { await H.sleep(250); sn = c.calls.find(b => b.op === 'sendnow'); }
  ok(sn && sn.id === 'AQ_T2', 'browser: the admin\'s "Send now (emergency)" asks the server for that one item (after a confirm)', c.calls.map(b => b.op));
  ok(!c.errs.filter(e => !/cdnjs/.test(e)).length, 'browser: no page errors (admin) ' + c.errs.slice(0, 2).join(' | '));
  await c.b.close();
  /* a PM: the same toast, no override */
  c = await device('sbiffle@grayco-cs.com');
  await c.ev(() => window._gcApprovalAct('AQ_T1', 'approve'));
  tt = null; for (let i = 0; i < 20 && !tt; i++) { await H.sleep(250); tt = await toastOf(c); }
  ok(tt && tt.text.indexOf(SAY) === 0 && !tt.link, 'browser: a non-admin gets the same sentence and NO "Send now"', tt);
  const rh2 = await c.ev(() => window._gcCQRowHtml({ step: 'scheduled', src: 'queue', id: 'AQ_T2' }));
  ok(/Scheduled for 7:00 AM/.test(rh2) && !/Send now/.test(rh2), 'browser: a non-admin\'s scheduled row has no override link');
  await c.ev(() => { const a = document.createElement('a'); a.setAttribute('data-cq-a', 'AQ_T2'); document.body.appendChild(a); a.click(); });
  await H.sleep(1500);
  ok(!c.calls.some(b => b.op === 'sendnow'), 'browser: a non-admin cannot send early even with a forged link');
  ok(!c.errs.filter(e => !/cdnjs/.test(e)).length, 'browser: no page errors (PM) ' + c.errs.slice(0, 2).join(' | '));
  await c.b.close();
}
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
