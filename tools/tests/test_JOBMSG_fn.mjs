/* patch JOBMSG — server tests: node tools/tests/test_JOBMSG_fn.mjs (made-up people and jobs; texts and pushes are mocked, nothing
   leaves the machine). A team message on a job's 💬 Job Messages → a real notification (phone push + a text from the GrayCo alerts
   number) for the people it is meant for:
   · each @tagged person (a chip = a user id, or "@Name" typed); nobody tagged → the job's PM; no PM → the owners; never the sender
   · @Office → everybody in the office ROLE (same address once)
   · only GrayCo staff addresses; a 📱 Text alerts row switched off → no text
   · 🌙 quiet hours (9 PM – 7 AM): held — the push for the 7 AM bundle, the text sent by the first alerts run after 7 AM (even on a
     Saturday, when the office is closed); a 6:30 PM message goes at once; a 🚨 message goes at night
   · 🏖 Away: an away admin gets nothing, the cover does; the cover is not told when the cover wrote it
   · throttle: one per person per job per 5 minutes, the next says "(+N more)"; the same message id is never sent twice
   · the text: "GrayCo: Wesley on Outdoor Entertainment Area (C846): <message, clipped> crm.test/?jobmsg=<job>" ≤ 300
   · the staff text alerts automation OFF → no text, and it says so
   · the endpoint: sign-in required; answers names only (no phone numbers) */
import { createRequire } from 'module';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
process.env.CRM_URL = 'https://crm.test';
process.env.TWILIO_FROM = '+19015550999';
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-key-test';
delete process.env.SMS_ALERTS_OFF; delete process.env.OWNER_EMAILS;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => { throw new Error('no network in tests: ' + String(u).slice(0, 60)); };

let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e); } }

const JM = require(path.join(FN, '_lib/jobmsgnotify.js'));
const SA = require(path.join(FN, '_lib/smsalert.js'));
const AW = require(path.join(FN, '_lib/away.js'));
const SQ = require(path.join(FN, '_lib/staffquiet.js'));
const AUTO = require(path.join(FN, '_lib/automations.js'));
const CO = require(path.join(FN, '_lib/callorder.js'));

const DOM = '@grayco-cs.com';
const WES = 'wes.owner' + DOM, NICK = 'nick.owner' + DOM, PAT = 'pat.pm' + DOM, GLEN = 'glen.est' + DOM, OFF = 'office' + DOM, OLIVE = 'olive.desk' + DOM, SAM = 'sam.pm' + DOM;
const USERS = [
  { id: 'U2', name: 'Wes Owner', email: WES, role: 'Admin', payType: 'owner', phone: '901-555-0102', active: true },
  { id: 'U1', name: 'Nick Owner', email: NICK, role: 'Admin', payType: 'owner', phone: '9015550101', active: true },
  { id: 'UP', name: 'Pat Mason', email: PAT, role: 'Project Manager', cell: '(901) 555-0103', active: true },
  { id: 'US', name: 'Sam Roofer', email: SAM, role: 'Project Manager', phone: '', active: true },
  { id: 'UG', name: 'Glen Estimator', email: GLEN, role: 'Estimator', phone: '9015550104', active: true },
  { id: 'U_office', name: 'Bree Desk', email: OFF, role: 'Office Admin', title: 'office manager', phone: '', active: true },
  { id: 'U5', name: 'Office', email: OFF, role: 'Office', active: true },
  { id: 'UO', name: 'Olive Front', email: OLIVE, role: 'Office', cell: '9015550106', active: true },
  { id: 'UM', name: 'Mal Marketing', email: 'mal@outside-agency.test', role: 'Marketing Manager', phone: '9015550107', active: true },
  { id: 'UX', name: 'Gone Guy', email: 'gone' + DOM, role: 'Project Manager', phone: '9015550109', active: false }
];
const PROJECTS = [
  { id: 'P846', name: 'Outdoor Entertainment Area', autoPO: 'C846', pm: 'Pat Mason', address: '1 Demo Vly Dr, Lakeland, TN' },
  { id: 'PNOPM', name: 'No PM Job', autoPO: 'C900', pm: '', address: '2 Demo St' },
  { id: 'PSAM', name: 'Sam Job', autoPO: 'C901', pm: 'Sam Roofer', address: '3 Demo St' }
];
/* Central times: Wed 2026-11-18 10:00 = 16:00Z; 18:30 = 00:30Z next day; 22:00 = 04:00Z; Sat 11-21 07:30 = 13:30Z */
const DAY = Date.parse('2026-11-18T16:00:00Z'), EVE = Date.parse('2026-11-19T00:30:00Z'), NIGHT = Date.parse('2026-11-19T04:00:00Z');
const SAT_NIGHT = Date.parse('2026-11-21T04:00:00Z'), SAT_MORN = Date.parse('2026-11-21T13:30:00Z');

let NOW = DAY, AWAY = {}, AUTO_ON = true, CARD = null;
const KV = {}, SMS = [], PUSH = [];
function rig(o){
  o = o || {};
  NOW = o.now || DAY; AWAY = o.away || {}; AUTO_ON = o.auto !== false; CARD = o.card || null;
  Object.keys(KV).forEach(k => delete KV[k]); SMS.length = 0; PUSH.length = 0;
  if (CARD) KV[SA.KEY] = CARD;
}
const cas = async (k, f) => { const nv = f(KV[k] == null ? null : JSON.parse(JSON.stringify(KV[k]))); if (nv !== undefined) KV[k] = nv; return { ok: true, value: KV[k] }; };
/* the staff text path: the real smsalert.notify, its sends recorded */
Object.assign(SA._D, {
  now: () => NOW, kvGet: async k => KV[k], kvCas: cas,
  send: async (to, body, from) => { SMS.push({ to, body, from, at: NOW }); return { ok: true }; },
  paused: async () => true,   /* data-entry mode ON: staff alerts must still go */
  optouts: async () => ({}), consentNo: async () => false,
  people: async () => ({ users: USERS, staff: [] }),
  hours: async () => CO.defaults().hours,   /* the call order's business hours: Mon–Fri 7–6 */
  textLog: async () => {}
});
AW.activeNow = async () => AWAY;
SQ.settings = async () => SQ.DEF;
AUTO.isOn = async () => AUTO_ON;
/* the phone push: staffpush.send's contract (quiet → held for the 7 AM bundle; phones saved for Pat + Glen only) */
const SUBS = [PAT, GLEN, NICK];
Object.assign(JM._D, {
  now: () => NOW,
  data: async () => ({ users: USERS, projects: PROJECTS }),
  stateCas: f => cas(JM.STATE, f),
  push: async (emails, payload, opts) => {
    PUSH.push({ emails: emails.slice(), payload, opts, at: NOW });
    if (!opts.emergency && SQ.quiet(NOW, SQ.DEF)) return { sent: 0, to: [], none: [], held: emails.slice() };
    return { sent: 1, to: emails.filter(e => SUBS.includes(e)), none: emails.filter(e => !SUBS.includes(e)) };
  }
});
const ME = { email: WES, name: 'Wes Owner' };
const go = (b, who) => JM.run(who || ME, Object.assign({ pid: 'P846', msgId: 'M' + Math.random().toString(36).slice(2) }, b));
const texted = () => SMS.map(x => x.to).sort();
const names = r => r.to.map(x => x.name).sort();

console.log('JOBMSG — a team message on a job → push + text');
await t('a tagged person (a chip = their user id) gets a push and a text; the PM is not texted; the sender never', async () => {
  rig();
  const r = await go({ text: 'Can you price the pergola? @Glen Estimator', tags: ['UG'] });
  assert.deepStrictEqual(names(r), ['Glen Estimator']); assert.strictEqual(r.why, 'mention');
  assert.deepStrictEqual(texted(), ['9015550104']);
  assert.deepStrictEqual(PUSH.map(p => p.emails), [[GLEN]]);
  assert.ok(r.to[0].pushed && r.to[0].texted);
  assert.ok(!PUSH.some(p => p.emails.includes(WES)) && !SMS.some(x => x.to === '9015550102'));
});
await t('the text reads "GrayCo: Wes on Outdoor Entertainment Area (C846): <message>" + the job link, ≤ 300 characters', async () => {
  rig();
  await go({ text: '@Glen Estimator need numbers by Friday', tags: ['UG'] });
  assert.strictEqual(SMS[0].body, 'GrayCo: Wes on Outdoor Entertainment Area (C846): @Glen Estimator need numbers by Friday crm.test/?jobmsg=P846');
  assert.strictEqual(PUSH[0].payload.url, 'https://crm.test/?jobmsg=P846');
  assert.ok(/^💬 Wes on Outdoor Entertainment Area \(C846\)$/.test(PUSH[0].payload.title), PUSH[0].payload.title);
  rig();
  await go({ text: '@Glen Estimator ' + 'long words here '.repeat(60), tags: ['UG'] });
  assert.ok(SMS[0].body.length <= 300 && /… crm\.test\/\?jobmsg=P846$/.test(SMS[0].body), SMS[0].body.length + ' ' + SMS[0].body);
});
await t('"@Name" typed (no chip) counts too; "@First" when only one person has that first name', async () => {
  rig();
  const r = await go({ text: '@Olive can you call the customer?', tags: [] });
  assert.deepStrictEqual(names(r), ['Olive Front']); assert.deepStrictEqual(texted(), ['9015550106']);
});
await t('nobody tagged → the job\'s PM only', async () => {
  rig();
  const r = await go({ text: 'Materials arrive Tuesday', tags: [] });
  assert.strictEqual(r.why, 'pm'); assert.deepStrictEqual(names(r), ['Pat Mason']); assert.deepStrictEqual(texted(), ['9015550103']);
});
await t('nobody tagged and no PM on the job → the owners (not the sender)', async () => {
  rig();
  const r = await go({ pid: 'PNOPM', text: 'Who is running this one?' });
  assert.strictEqual(r.why, 'owner'); assert.deepStrictEqual(names(r), ['Nick Owner']); assert.deepStrictEqual(texted(), ['9015550101']);
});
await t('the PM writes on his own job with no tag → nobody (never the sender)', async () => {
  rig();
  const r = await go({ text: 'Note to self' }, { email: PAT, name: 'Pat Mason' });
  assert.deepStrictEqual(r.to, []); assert.strictEqual(SMS.length + PUSH.length, 0);
});
await t('the sender tags themself and someone else → only the other person', async () => {
  rig();
  const r = await go({ text: '@Wes Owner @Glen Estimator see photos', tags: ['U2', 'UG'] });
  assert.deepStrictEqual(names(r), ['Glen Estimator']); assert.deepStrictEqual(texted(), ['9015550104']);
});
await t('@Office → everybody in the office role (one address once); a person with no cell is still told how it went', async () => {
  rig();
  const r = await go({ text: '@Office please order the permit', tags: ['U5', 'U_office'] });
  assert.deepStrictEqual(r.to.map(x => x.name).sort(), ['Bree Desk', 'Olive Front']);
  assert.deepStrictEqual(texted(), ['9015550106']);   /* the shared office address has no cell on file */
  assert.ok(r.to.find(x => x.name === 'Bree Desk').noPhone);
  rig();
  const r2 = await go({ text: '@Office please order the permit', tags: [] });   /* typed */
  assert.deepStrictEqual(r2.to.map(x => x.name).sort(), ['Bree Desk', 'Olive Front']);
});
await t('a tagged person outside GrayCo (not an @grayco-cs.com address) gets no text or push', async () => {
  rig();
  const r = await go({ text: '@Mal Marketing photos for the ad', tags: ['UM'] });
  assert.deepStrictEqual(r.to, []); assert.deepStrictEqual(r.skipped.notStaff, ['Mal Marketing']); assert.strictEqual(SMS.length, 0);
});
await t('a 📱 Text alerts row switched off → no text (the push still goes)', async () => {
  rig({ card: { at: 'x', people: { [GLEN]: { on: false } } } });
  const r = await go({ text: '@Glen Estimator hi', tags: ['UG'] });
  assert.strictEqual(SMS.length, 0); assert.ok(r.to[0].pushed && !r.to[0].texted);
});
await t('⏸ data-entry mode on: staff texts still go (the alert path tags them staff; a customer text stays stopped)', async () => {
  rig();
  const r = await go({ text: 'For the PM' });
  assert.deepStrictEqual(texted(), ['9015550103']); assert.ok(r.to[0].texted);
  /* the real guard (_lib/pause.js): the flag cannot be read here → counts as ON (fail closed) */
  const PZ = require(path.join(FN, '_lib/pause.js')), CQ = require(path.join(FN, '_lib/custquiet.js'));
  PZ.reset && PZ.reset();
  const TW = 'https://api.twilio.com/2010-04-01/Accounts/AC0/Messages.json';
  assert.strictEqual(await PZ.shouldSkip(TW, { method: 'POST' }), true, 'an untagged text is stopped in data-entry mode');
  assert.strictEqual(await CQ.run('staff', () => PZ.shouldSkip(TW, { method: 'POST' })), false, 'a staff alert text goes');
  assert.ok(/custquiet\.js'\)\.run\(tag \|\| 'staff'/.test(require('fs').readFileSync(path.join(FN, '_lib/smsalert.js'), 'utf8')), 'smsalert sends tagged staff');
});
await t('quiet hours (10 PM): nothing now — the push is held for 7 AM, the text is held', async () => {
  rig({ now: NIGHT });
  const r = await go({ text: '@Glen Estimator tomorrow?', tags: ['UG'] });
  assert.strictEqual(SMS.length, 0); assert.ok(r.quiet && r.to[0].held && !r.to[0].texted && !r.to[0].pushed);
  assert.strictEqual(PUSH[0].opts.emergency, false);
  assert.ok(KV[SA.SKEY].held[GLEN] && KV[SA.SKEY].held[GLEN][0].sq);
  NOW = Date.parse('2026-11-19T12:30:00Z');   /* 6:30 AM: still quiet */
  await SA.flushHeld(); assert.strictEqual(SMS.length, 0);
  NOW = Date.parse('2026-11-19T13:05:00Z');   /* 7:05 AM */
  const f = await SA.flushHeld(); assert.strictEqual(f.sent, 1); assert.deepStrictEqual(texted(), ['9015550104']);
  assert.ok(/^GrayCo: Wes on Outdoor Entertainment Area \(C846\): @Glen Estimator tomorrow\? Open: crm\.test\/\?jobmsg=P846$/.test(SMS[0].body), SMS[0].body);
});
await t('held over a Friday night → sent Saturday 7:30 AM although the office is closed', async () => {
  rig({ now: SAT_NIGHT });
  await go({ text: 'Weekend check' });
  assert.strictEqual(SMS.length, 0);
  NOW = SAT_MORN; await SA.flushHeld();
  assert.deepStrictEqual(texted(), ['9015550103']);
});
await t('a team message at 6:30 PM (after business hours, before quiet hours) goes at once', async () => {
  rig({ now: EVE });
  const r = await go({ text: 'Running late tomorrow' });
  assert.deepStrictEqual(texted(), ['9015550103']); assert.ok(!r.quiet);
});
await t('a 🚨 message goes through the quiet hours', async () => {
  rig({ now: NIGHT });
  const r = await go({ text: '🚨 water coming through the ceiling', tags: [] });
  assert.deepStrictEqual(texted(), ['9015550103']); assert.strictEqual(PUSH[0].opts.emergency, true); assert.ok(r.to[0].pushed);
});
await t('🏖 Away: the away admin gets nothing, the cover does', async () => {
  rig({ away: { [NICK]: { email: NICK, cover: WES } } });
  const r = await go({ text: '@Nick Owner sign the change order', tags: ['U1'] }, { email: GLEN, name: 'Glen Estimator' });
  assert.deepStrictEqual(names(r), ['Wes Owner']); assert.deepStrictEqual(texted(), ['9015550102']);
  assert.ok(!PUSH.some(p => p.emails.includes(NICK)));
});
await t('🏖 Away: the cover wrote it → nobody is told (never the sender)', async () => {
  rig({ away: { [NICK]: { email: NICK, cover: WES } } });
  const r = await go({ text: '@Nick Owner fyi', tags: ['U1'] });
  assert.deepStrictEqual(r.to, []); assert.strictEqual(SMS.length + PUSH.length, 0);
});
await t('throttle: a burst is one text; after 5 minutes the next one says (+N more)', async () => {
  rig();
  await go({ text: 'one' }); NOW += 30e3; const r2 = await go({ text: 'two' }); NOW += 60e3; await go({ text: 'three' });
  assert.strictEqual(SMS.length, 1); assert.ok(r2.to[0].throttled);
  assert.strictEqual(PUSH.length, 1);
  NOW += 5 * 60e3;
  await go({ text: 'four' });
  assert.strictEqual(SMS.length, 2); assert.ok(/^GrayCo \(\+2 more\): Wes on Outdoor Entertainment Area \(C846\): four /.test(SMS[1].body), SMS[1].body);
  /* another job is its own thread */
  await go({ pid: 'PSAM', text: 'other job' });
  assert.strictEqual(PUSH.length, 3);
});
await t('the same message id twice (a retry) → told once', async () => {
  rig();
  await go({ msgId: 'MSAME', text: 'hello' }); NOW += 10 * 60e3; const r = await go({ msgId: 'MSAME', text: 'hello' });
  assert.strictEqual(SMS.length, 1); assert.ok(r.to[0].throttled);
});
await t('the staff text alerts automation OFF → no text, and the answer says so', async () => {
  rig({ auto: false });
  const r = await go({ text: 'hello' });
  assert.strictEqual(SMS.length, 0); assert.ok(/automation is off/.test(r.textWhy), JSON.stringify(r));
});
await t('bad input: no job id / no text', async () => {
  rig();
  assert.strictEqual((await JM.run(ME, { pid: '', text: 'x' })).code, 400);
  assert.strictEqual((await JM.run(ME, { pid: 'P846', text: '  ' })).code, 400);
});
await t('the endpoint: sign-in required; answers names only — never a phone number', async () => {
  rig();
  const H = require(path.join(FN, 'job-notify.js'));
  const portal = require(path.join(FN, 'portal.js'));
  const a = await H.handler({ httpMethod: 'POST', headers: {}, body: '{}' });
  assert.strictEqual(a.statusCode, 401);
  const keep = portal._core.gcStaffAuth;
  portal._core.gcStaffAuth = async () => ({ ok: true, email: WES, name: 'Wes Owner', role: 'admin', admin: true });
  try {
    const b = await H.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify({ pid: 'P846', msgId: 'MEP', text: '@Glen Estimator hi', tags: ['UG'] }) });
    const o = JSON.parse(b.body);
    assert.strictEqual(b.statusCode, 200, b.body); assert.deepStrictEqual(o.to.map(x => x.name), ['Glen Estimator']); assert.ok(o.to[0].texted);
    assert.ok(!/\d{3}\D?\d{3}\D?\d{4}/.test(b.body) && !/@grayco/.test(b.body), b.body);
  } finally { portal._core.gcStaffAuth = keep; }
});
globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
