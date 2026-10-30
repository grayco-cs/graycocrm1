/* patch SUBPHOTOS tests: node tools/tests/test_SUBPHOTOS.mjs — made-up subs, jobs and people only.
   · the invoice photo rule: max(minimum 5 | the admin's number, the sub's scheduled days) photos from THAT sub on THAT job;
     the portal's p-invoice refuses with "Add at least N photos of your work on <job> before sending this invoice (you have M)"
   · the portal shows the CRM's PO (autoPO || poNumber || po — the field _gcJobLabel shows), the customer's name + phone only
     on the sub's own jobs; another job → 404, and its customer is never in p-home
   · sub photos are customer-hidden by default (sub-photos upload, both portals); the staff upload Yes / No (`shared`) is
     what the customer portal shows
   · the first-day text: once on the first day, not on day 2, not after STOP, not in data-entry mode, the CRM PO, the per-sub off switch
   · the 12 PM approvals reminder: business days only, after noon, never in data-entry mode, skipped for whoever opened
     📋 Approvals today; the digest's "📋 N approvals waiting" line */
import { createRequire } from 'module';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-key-test';
process.env.PORTAL_MAIL_OFF = '1';
delete process.env.RESEND_API_KEY; delete process.env.SUB_FIRSTDAY_OFF;

let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e); } }

const SW = require(path.join(FN, '_lib/subwork.js'));
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const day = n => SW.addDays(TODAY, n);
const ref = i => 'sb:crm-files/' + String(i).padStart(64, 'a').slice(-64).replace(/[^0-9a-f]/g, 'b') + '.jpg';
const photo = (i, o) => Object.assign({ id: 'ph' + i, jobId: 'P1', subId: 'S1', source: 'sub', ref: ref(i), hash: 'h' + i, at: TODAY + 'T15:00:00Z' }, o || {});

const SUB = { id: 'S1', name: 'Ridgeway Framing', company: 'Ridgeway Framing', contact: 'Rory Lane', phone: '901-555-0111', isSub: true };
const SUB2 = { id: 'S2', name: 'Summit Roofing Co', company: 'Summit Roofing Co', phone: '(901) 555-0222', isSub: true };
const DATA = {
  projects: [
    { id: 'P1', name: 'Maple Deck', address: '77 Maple Ct, Germantown TN', poNumber: 'Q314', po: 'OLD-9', client: 'Dana Quill', clientPhone: '901-555-0901', clientEmail: 'dana@quill.test', pm: 'Pat Mason', status: 'Active',
      insCarrier: 'Acme Mutual', claimNumber: 'CLM-1', subs: [{ subId: 'S1', name: 'Ridgeway Framing', status: 'Awarded' }] },
    { id: 'P2', name: 'Birch Porch', address: '12 Birch Ln, Collierville TN', autoPO: 'B202', poNumber: 'X1', client: 'Lee Ortega', clientPhone: '901-555-0902', pm: 'Pat Mason', status: 'Active',
      subs: [{ subId: 'S2', name: 'Summit Roofing Co', status: 'Awarded' }] }
  ],
  vendors: [SUB, SUB2],
  schedule: [
    { id: 'R1', pid: 'P1', subId: 'S1', date: TODAY, time: '8:00', title: 'Framing' },
    { id: 'R2', pid: 'P2', subId: 'S2', date: TODAY, endDateSch: day(2), time: '9:00', title: 'Roof' }
  ],
  users: [{ name: 'Pat Mason', email: 'pat.pm@grayco-cs.com', role: 'Project Manager', active: true, phone: '901-555-0100' }]
};

console.log('subwork — the invoice photo rule');
await t('4 photos → blocked (default minimum 5), with the owner\'s message', () => {
  const g = SW.invoiceGate({ job: DATA.projects[0], sub: SUB, schedule: DATA.schedule, gcPhotos: [1, 2, 3, 4].map(i => photo(i)), events: [], today: TODAY });
  assert.strictEqual(g.ok, false); assert.strictEqual(g.need, 5); assert.strictEqual(g.have, 4);
  assert.strictEqual(g.message, 'Add at least 5 photos of your work on Maple Deck before sending this invoice (you have 4).');
});
await t('5 photos → allowed; another sub\'s / another job\'s / deleted photos never count; the same picture twice counts once', () => {
  const mine = [1, 2, 3, 4, 5].map(i => photo(i));
  assert.strictEqual(SW.invoiceGate({ job: DATA.projects[0], sub: SUB, schedule: DATA.schedule, gcPhotos: mine, today: TODAY }).ok, true);
  const noise = [photo(1, { id: 'dupe' }), photo(6, { subId: 'S2' }), photo(7, { jobId: 'P2' }), photo(8, { deleted: true }), photo(9, { source: 'grayco' })];
  const g = SW.invoiceGate({ job: DATA.projects[0], sub: SUB, schedule: DATA.schedule, gcPhotos: mine.slice(0, 4).concat(noise), today: TODAY });
  assert.strictEqual(g.have, 4); assert.strictEqual(g.ok, false);
});
await t('portal-sent files (gc_sub_event) count too, deduped against GrayCo Photos', () => {
  const ev = [{ kind: 'photos', project_id: 'P1', sub_id: 'S1', data: { files: [{ ref: ref(1), hash: 'h1', type: 'image/jpeg' }, { ref: ref(20), hash: 'h20', type: 'image/jpeg' }, { ref: ref(21), hash: 'h21', type: 'application/pdf' }] } }];
  assert.strictEqual(SW.photoCount([photo(1)], ev, SUB, 'P1'), 2);
});
await t('scheduled 7 days → need 7 (whichever is higher); future days do not count yet', () => {
  const sched = [{ pid: 'P1', subId: 'S1', date: day(-6), endDateSch: day(3) }];
  const g = SW.invoiceGate({ job: DATA.projects[0], sub: SUB, schedule: sched, gcPhotos: [1, 2, 3, 4, 5, 6].map(i => photo(i)), today: TODAY });
  assert.strictEqual(g.days, 7); assert.strictEqual(g.need, 7); assert.strictEqual(g.ok, false); assert.match(g.message, /at least 7 photos .* \(you have 6\)/);
});
await t('the admin minimum (gc_sub_portal_settings.invPhotoMin) changes the rule; 0–50 only', () => {
  const g = SW.invoiceGate({ job: DATA.projects[0], sub: SUB, schedule: DATA.schedule, settings: { invPhotoMin: 2 }, gcPhotos: [photo(1), photo(2)], today: TODAY });
  assert.strictEqual(g.need, 2); assert.strictEqual(g.ok, true);
  assert.strictEqual(SW.minOf({ invPhotoMin: 500 }), 50); assert.strictEqual(SW.minOf({ invPhotoMin: -3 }), 0); assert.strictEqual(SW.minOf({}), 5);
});

/* ── a tiny Supabase for portal-access / sub-photos / portal.js ── */
const KV = {}, EVENTS = [], STORE = {};
const kput = (k, v) => { KV[k] = { value: v, updated_at: new Date().toISOString() }; };
Object.keys(DATA).forEach(k => kput(k, DATA[k]));
kput('gc_photos', []); kput('gc_sub_portal_settings', {});
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const val = v => String(v || '').replace(/^eq\./, '');
const inList = v => String(v || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); kput(b.key, b.value); return res(201, null); }
    const keys = q.get('key') ? (q.get('key').startsWith('in.') ? inList(q.get('key')) : [val(q.get('key'))]) : [];
    return res(200, keys.filter(k => KV[k]).map(k => ({ key: k, value: KV[k].value, updated_at: KV[k].updated_at })));
  }
  if (u.pathname === '/rest/v1/gc_sub_event') {
    if (m === 'POST') { const b = JSON.parse(init.body); EVENTS.push(Object.assign({ created_at: new Date().toISOString() }, b)); return res(201, null); }
    if (m === 'PATCH') return res(204, null);
    let rows = EVENTS.slice();
    if (q.get('sub_id')) rows = rows.filter(e => e.sub_id === val(q.get('sub_id')));
    if (q.get('project_id')) rows = rows.filter(e => e.project_id === val(q.get('project_id')));
    if (q.get('kind')) { const k = q.get('kind'); rows = rows.filter(e => k.startsWith('in.') ? inList(k).includes(e.kind) : e.kind === val(k)); }
    return res(200, rows);
  }
  if (/^\/rest\/v1\/(gc_sub_scope|gc_portal_msg|sp_rows|gc_sub_link)$/.test(u.pathname)) return res(200, []);
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=x' }))); }
  if (u.pathname.startsWith('/storage/v1/object/crm-files/')) { STORE[u.pathname] = 1; return res(200, {}); }
  return res(404, {});
};

console.log('portal-access — the sub portal');
const PA = require(path.join(FN, 'portal-access.js'))._core;
const ctxS1 = async () => { PA._reset(); const c = await PA.partnerCtx({ sub_id: 'S1' }); c.ip = '1.1.1.1'; return c; };
await t('p-job shows the CRM\'s PO (autoPO || poNumber || po), the address + Maps, the customer\'s name and phone — never the carrier', async () => {
  const r = await PA.partnerAction('p-job', { projectId: 'P1' }, await ctxS1());
  assert.strictEqual(r.job.po, 'Q314');                       /* poNumber wins over the older po, as in _gcJobLabel */
  assert.strictEqual(r.job.po, SW.poOf(DATA.projects[0]));
  assert.strictEqual(r.job.customer.name, 'Dana Quill'); assert.strictEqual(r.job.customer.phone, '901-555-0901');
  assert.strictEqual(r.job.customer.email, '');                /* e-mail still needs the PM's switch */
  assert.match(r.job.maps, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=77%20Maple/);
  assert.ok(!/Acme Mutual|CLM-1/.test(JSON.stringify(r)));
  assert.deepStrictEqual([r.photoRule.need, r.photoRule.have, r.photoRule.invoiceOk], [5, 0, false]);
});
await t('a sub cannot get the customer\'s phone for a job they are not on (404, and not in p-home)', async () => {
  await assert.rejects(PA.partnerAction('p-job', { projectId: 'P2' }, await ctxS1()), e => e.status === 404);
  const home = await PA.partnerAction('p-home', {}, await ctxS1());
  const txt = JSON.stringify(home);
  assert.ok(!/901-555-0902|Lee Ortega|Birch/.test(txt));
  assert.strictEqual(home.today.length, 1); assert.strictEqual(home.today[0].id, 'P1');
  assert.strictEqual(home.today[0].po, 'Q314'); assert.strictEqual(home.today[0].customer.phone, '901-555-0901');
  assert.ok(!/Acme Mutual/.test(txt));
});
await t('the PO the portal shows matches the CRM for every job (autoPO first)', async () => {
  PA._reset(); const c2 = await PA.partnerCtx({ sub_id: 'S2' });
  const r = await PA.partnerAction('p-job', { projectId: 'P2' }, c2);
  assert.strictEqual(r.job.po, 'B202');
});
await t('p-invoice is refused until 5 photos, with the message; then accepted (the PO filled in from the CRM)', async () => {
  KV.gc_photos.value = [1, 2, 3].map(i => photo(i));
  await assert.rejects(PA.partnerAction('p-invoice', { projectId: 'P1', amount: 1200 }, await ctxS1()),
    e => e.status === 409 && e.message === 'Add at least 5 photos of your work on Maple Deck before sending this invoice (you have 3).' && e.extra.photos.need === 5);
  assert.ok(!EVENTS.some(e => e.kind === 'invoice'));
  KV.gc_photos.value = [1, 2, 3, 4, 5].map(i => photo(i));
  const ok = await PA.partnerAction('p-invoice', { projectId: 'P1', amount: 1200 }, await ctxS1());
  assert.ok(ok.ok); const ev = EVENTS.find(e => e.kind === 'invoice'); assert.strictEqual(ev.data.po, 'Q314');
});
await t('the optional check-in / done for today are stored, and need nothing', async () => {
  const a = await PA.partnerAction('p-checkin', { projectId: 'P1', op: 'here' }, await ctxS1());
  const b = await PA.partnerAction('p-checkin', { projectId: 'P1', op: 'done' }, await ctxS1());
  assert.ok(a.ok && b.ok); assert.deepStrictEqual(EVENTS.filter(e => e.kind === 'checkin').map(e => e.data.op), ['here', 'done']);
  await assert.rejects(PA.partnerAction('p-checkin', { projectId: 'P2' }, await ctxS1()), e => e.status === 404);
});

console.log('sub photos — never on the customer portal by default');
const SP = require(path.join(FN, 'sub-photos.js'))._core;
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('made-up jpeg for the test')]);
await t('a sub\'s upload → GrayCo Photos: source sub, the company, the day, "From sub portal", shared:false', async () => {
  SP._reset(); SP.CHECK_MS = 1; KV.gc_photos.value = [];
  const r = await SP.uploadForSub({ id: 'S1', name: 'Ridgeway Framing', email: '' }, 'P1', { data: JPEG.toString('base64'), name: 'deck.jpg', tag: 'After' });
  assert.ok(r.ok, JSON.stringify(r));
  const rec = KV.gc_photos.value.find(x => x.id === r.id);
  assert.strictEqual(rec.source, 'sub'); assert.strictEqual(rec.jobId, 'P1'); assert.strictEqual(rec.shared, false); assert.strictEqual(rec.subCompany, 'Ridgeway Framing');
  assert.strictEqual(rec.label, 'From sub portal'); assert.ok(rec.labels.includes('From sub portal') && rec.labels.includes(rec.at.slice(0, 10)));
  assert.strictEqual(SP.custOf(rec), false);
  const other = await SP.uploadForSub({ id: 'S1', name: 'Ridgeway Framing' }, 'P2', { data: JPEG.toString('base64') });
  assert.strictEqual(other.ok, false); assert.strictEqual(other.status, 404);
});
const PJ = require(path.join(FN, 'portal.js'))._core;
await t('the customer portal: a sub photo is hidden even when shared:true, shown only with an admin / office stamp (custOkBy)', async () => {
  const recs = [photo(31, { shared: true }), photo(32, { shared: true, custOkBy: 'Olive Office' }), photo(33, { shared: false, custOkBy: 'x' })];
  const out = await PJ.grayCoPhotos('P1', recs);
  assert.deepStrictEqual(out.map(x => x.id), ['ph32']);
  assert.strictEqual(SP.custOf(recs[0]), false); assert.strictEqual(SP.custOf(recs[1]), true);
});
await t('the staff upload choice (shared Yes / No) is what the customer portal shows', async () => {
  const recs = [photo(41, { source: 'grayco', subId: '', shared: true, shareSet: true }), photo(42, { source: 'grayco', subId: '', shared: false, shareSet: true }), photo(43, { source: 'grayco', subId: '', tag: 'During' })];
  const out = await PJ.grayCoPhotos('P1', recs);
  assert.deepStrictEqual(out.map(x => x.id).sort(), ['ph41', 'ph43']);
});

console.log('the first-day portal text');
const STX = require(path.join(FN, 'sub-texts.js'));
const BI = require(path.join(FN, 'bid-inbox.js'))._lib, MC = require(path.join(FN, 'missed-call.js'))._test, PAUSE = require(path.join(FN, '_lib/pause.js'));
const PCORE = require(path.join(FN, 'portal.js'))._core;
const LKV = {}; let OPTOUT = {}, PAUSED = false; const SENT = [], JOBMSG = [];
BI.kvGet = async k => LKV[k] == null ? null : JSON.parse(JSON.stringify(LKV[k]));
BI.kvCas = async (k, fn) => { const nx = fn(LKV[k] == null ? null : JSON.parse(JSON.stringify(LKV[k]))); if (nx === undefined) return { ok: true, unchanged: true }; LKV[k] = nx; return { ok: true }; };
MC.ready = () => true; MC.stateGet = async () => ({ optout: OPTOUT }); MC.sendSms = async (to, body) => { SENT.push({ to, body }); return { ok: true }; };
PAUSE.isPaused = async () => PAUSED;
PA.subLinkActive = async id => id === 'S1' ? { token: 'L'.repeat(43) } : null;
let FD = JSON.parse(JSON.stringify(DATA));
PCORE.kvRead = async () => FD;
PCORE.kvListUpdate = async (k, fn) => { const r = fn(JOBMSG.slice()); if (r) { JOBMSG.length = 0; r.list.forEach(x => JOBMSG.push(x)); } return { ok: true }; };
const at = (d, hh, mm) => { /* Central wall time → ms (CDT/CST probe) */ for (const off of [5, 6]) { const ms = Date.parse(d + 'T' + String(hh + off).padStart(2, '0') + ':' + String(mm || 0).padStart(2, '0') + ':00Z'); const c = SW.central(ms); if (c.ymd === d && c.min === hh * 60 + (mm || 0)) return ms; } throw new Error('tz'); };
const run = async ms => { STX._now = () => ms; return STX._lib.firstDayRun({}); };
await t('sends ONE text on the first day at 7 AM: greeting, job, address, the CRM PO, start, the portal link, photos line, STOP — never the carrier', async () => {
  const r0 = await run(at(TODAY, 6, 45)); assert.strictEqual(SENT.length, 0, 'not before 7 AM'); assert.strictEqual(r0.due, 0);
  const r = await run(at(TODAY, 7, 5));
  assert.strictEqual(r.sent, 2, JSON.stringify(r));
  const a = SENT.find(x => x.to === '9015550111').body;
  assert.match(a, /^GrayCo: Hi Rory, you start Maple Deck today \(8:00\)\./);
  assert.ok(a.includes('Address: 77 Maple Ct, Germantown TN')); assert.ok(a.includes('PO for materials: Q314'));
  assert.ok(a.includes('https://portal.grayco-cs.com/#t=' + 'L'.repeat(43))); assert.ok(a.includes('Add photos of your work in your portal.')); assert.ok(/Reply STOP to opt out\.$/.test(a));
  assert.ok(!/Acme|CLM|insur/i.test(a));
  const b = SENT.find(x => x.to === '9015550222').body; assert.ok(b.includes('PO for materials: B202')); assert.ok(b.includes('https://portal.grayco-cs.com'));
  assert.strictEqual(JOBMSG.filter(m => /^SUBFD_/.test(m.id)).length, 2);
  const again = await run(at(TODAY, 7, 20)); assert.strictEqual(again.sent, 0); assert.strictEqual(SENT.length, 2);
});
await t('does not send on day 2 (S2 is scheduled 3 days)', async () => {
  const r = await run(at(day(1), 7, 5)); assert.strictEqual(r.due, 0); assert.strictEqual(SENT.length, 2);
});
await t('a reschedule of the first day sends again only when the day moved', async () => {
  FD.schedule.push({ id: 'R3', pid: 'P1', subId: 'S2', date: day(5) });
  FD.projects[0].subs.push({ subId: 'S2', name: 'Summit Roofing Co' });
  let r = await run(at(day(5), 7, 5)); assert.strictEqual(r.sent, 1); assert.ok(SENT[2].body.includes('Maple Deck'));
  FD.schedule = FD.schedule.filter(x => x.id !== 'R3'); FD.schedule.push({ id: 'R3', pid: 'P1', subId: 'S2', date: day(7) });   /* the first day moved */
  r = await run(at(day(7), 7, 5)); assert.strictEqual(r.sent, 1);
  r = await run(at(day(7), 8, 0)); assert.strictEqual(r.sent, 0);
});
const fresh = () => { Object.keys(LKV).forEach(k => delete LKV[k]); SENT.length = 0; FD = JSON.parse(JSON.stringify(DATA)); };
await t('does not send after STOP', async () => {
  fresh(); OPTOUT = { '9015550111': true };
  const r = await run(at(TODAY, 7, 5)); assert.strictEqual(SENT.filter(x => x.to === '9015550111').length, 0); assert.ok(r.skipped.some(x => /STOP/.test(x))); OPTOUT = {};
});
await t('does not send in data-entry mode (and sends once it is off)', async () => {
  fresh(); PAUSED = true;
  const r = await run(at(TODAY, 7, 5)); assert.strictEqual(SENT.length, 0); assert.deepStrictEqual(r.skipped, ['data-entry mode']);
  PAUSED = false; assert.strictEqual((await run(at(TODAY, 7, 20))).sent, 2);
});
await t('the per-sub off switch (an admin, on the sub card) works; the schedule-texts switch does not matter', async () => {
  fresh(); LKV.gc_sub_texts = { subs: { S1: { on: false, firstOff: true }, S2: { on: false } } };
  const r = await run(at(TODAY, 7, 5)); assert.strictEqual(r.sent, 1); assert.strictEqual(SENT[0].to, '9015550222');
  assert.strictEqual(require(path.join(FN, '_lib/subtxt.js')).settings(LKV.gc_sub_texts).subs.S1.firstOff, true);
});
await t('the PO in the text is the CRM\'s PO for the job', async () => {
  fresh(); FD.projects[0].autoPO = 'A777';
  await run(at(TODAY, 7, 5)); assert.ok(SENT.find(x => x.to === '9015550111').body.includes('PO for materials: A777'));
  assert.strictEqual(SW.poOf(FD.projects[0]), 'A777');
});

console.log('PMs check their approvals every day');
const NOON = require(path.join(FN, '_lib/appr-noon.js')), AC = require(path.join(FN, '_lib/auto-common.js')), DG = require(path.join(FN, '_lib/auto-digest.js'));
const BOX = { 'pat.pm@grayco-cs.com': [{ title: 'Sub invoice', link: 'x' }, { title: 'Change order', link: 'y' }], 'ivy.pm@grayco-cs.com': [{ title: 'A', link: 'z' }], 'nobody@grayco-cs.com': [] };
const wed = '2026-10-28', sat = '2026-10-31';
await t('12 PM on a business day: everyone with approvals waiting who has not opened 📋 Approvals today', () => {
  const seen = { 'ivy.pm@grayco-cs.com': new Date(at(wed, 9, 0)).toISOString() };
  assert.deepStrictEqual(NOON.due(BOX, seen, at(wed, 12, 5), {}).map(x => [x.email, x.n]), [['pat.pm@grayco-cs.com', 2]]);
  assert.deepStrictEqual(NOON.due(BOX, { 'ivy.pm@grayco-cs.com': new Date(at('2026-10-27', 16, 0)).toISOString() }, at(wed, 12, 5), {}).length, 2, 'yesterday does not count');
});
await t('not before noon, not on a weekend', () => {
  assert.strictEqual(NOON.due(BOX, {}, at(wed, 11, 55), {}).length, 0);
  assert.strictEqual(NOON.due(BOX, {}, at(sat, 12, 30), {}).length, 0);
});
await t('run(): never in data-entry mode; a weekend skips; otherwise push + e-mail + one ASAP To-Do each', async () => {
  const pushes = [], mails = [], tasks = [];
  AC.paused = async () => true;
  assert.strictEqual((await NOON.run({ now: at(wed, 12, 5) })).skipped, 'data-entry mode');
  AC.paused = async () => false;
  assert.strictEqual((await NOON.run({ now: at(sat, 12, 5) })).skipped, 'not a business day');
  DG.collect = async () => ({ box: BOX, opt: {}, nameOf: { 'pat.pm@grayco-cs.com': 'Pat Mason' }, base: 'https://crm.test' });
  PCORE.kvListRead = async k => k === NOON.SEEN_KEY ? { list: [{ id: 'ivy.pm@grayco-cs.com', email: 'ivy.pm@grayco-cs.com', at: new Date(at(wed, 9, 0)).toISOString() }] } : { list: [] };
  PCORE.pushTo = async (to, p) => { pushes.push([to, p.title]); return { sent: 1 }; };
  PCORE.kvListUpdate = async (k, fn) => { const r = fn(tasks.slice()); if (r) { tasks.length = 0; r.list.forEach(x => tasks.push(x)); } return { ok: true, unchanged: !r }; };
  AC.staffMail = async (to, subj, html) => { mails.push([to, subj, html]); return { ok: true }; };
  const rep = await NOON.run({ now: at(wed, 12, 5) });
  assert.deepStrictEqual([rep.people, rep.mailed, rep.pushed, rep.todos], [1, 1, 1, 1]);
  assert.deepStrictEqual(pushes[0], [['pat.pm@grayco-cs.com'], '⏰ You have 2 approvals waiting']);
  assert.strictEqual(mails[0][1], '⏰ You have 2 approvals waiting — GrayCo CRM');
  assert.strictEqual(tasks[0].urgency, 'asap'); assert.deepStrictEqual(tasks[0].assignees, ['pat.pm@grayco-cs.com']);
  await NOON.run({ now: at(wed, 13, 5) }); assert.strictEqual(tasks.length, 1, 'one To-Do a day');
});
await t('the 7 AM digest line: "📋 N approvals waiting" with the link to Approvals', () => {
  const l = DG.apprLine(3, 'https://crm.test');
  assert.ok(l.includes('📋 3 approvals waiting.')); assert.ok(l.includes('href="https://crm.test/#todo"')); assert.ok(l.includes('Open 📋 Approvals'));
  assert.ok(DG.apprLine(1, 'https://crm.test').includes('📋 1 approval waiting.'));
  const src = require('fs').readFileSync(path.join(FN, '_lib/auto-digest.js'), 'utf8'); assert.ok(/apprLine\(list\.length, base\) \+ '<p>Tap one/.test(src), 'the digest e-mail starts with the line');
});
await t('the auto-wins schedule: the noon part runs Mon–Fri from 12 PM, once a day', () => {
  const src = require('fs').readFileSync(path.join(FN, 'auto-wins.js'), 'utf8');
  assert.ok(/key: 'apprnoon'.*Mon\|Tue\|Wed\|Thu\|Fri.*c\.hour >= 12.*'apprnoon:' \+ c\.ymd/.test(src));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
