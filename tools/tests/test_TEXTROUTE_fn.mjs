// test_TEXTROUTE_fn.mjs — patch TEXTROUTE (owner 11/26: "when a customer text our grayco text make sure they name the address so the
// message goes to the right project — if they are talking about their project — or if its a new project so it can create a lead instantly").
// Offline: Supabase REST (in-memory gc_kv), Twilio and Resend are fakes; made-up people, jobs, addresses and 555 numbers only; nothing
// leaves this computer and no real text is sent. Covers the pure decision (_lib/textroute.js) and the whole inbound webhook
// (missed-call.js inboundSms): the question, an address answer, NEW, no match, one job (no question), several jobs, the limits, the
// auto-answer switch, data-entry mode, quiet hours, emergencies, subs / staff / leads untouched, nothing sent that is not a reply.
// Usage: node tools/tests/test_TEXTROUTE_fn.mjs [worktree]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(HERE, '../..');
const SRC = path.join(ROOT, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'wes.test@grayco-cs.com,nick.test@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok-test', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'CUST_QUIET_OFF', 'PORTAL_MAIL_OFF', 'TWILIO_FROM_ALERTS', 'TWILIO_FROM_SUBS', 'TWILIO_FROM_CUSTOMERS', 'TWILIO_FROM_LEADS', 'TWILIO_LOCAL_NUMBERS', 'SMS_ALERTS_OFF'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }

/* ── the fake clock: Wednesday 2026-11-18 10:00 Central (business hours, not quiet hours) ── */
const realNow = Date.now;
let NOW = Date.parse('2026-11-18T16:00:00Z');
Date.now = () => NOW;

/* ── the fake cloud ── */
const KV = new Map(), SMS = [], MAIL = [];
let tick = 0;
const stamp = () => new Date(realNow() + (++tick)).toISOString();
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: stamp() });
const getKv = k => { let v = (KV.get(k) || {}).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const OUTSIDE = [];
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
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  OUTSIDE.push(String(url));
  return J(404, {});
};
require(path.join(SRC, '_lib/pause.js')).install();
const AUTO = require(path.join(SRC, '_lib/automations.js'));
let AUTO_ON = true;
{ const _on = AUTO.isOn; AUTO.isOn = async function(k, o){ if (k === 'staff_text_alerts') return true; if (k === 'text_auto_answers') return AUTO_ON; return _on.call(AUTO, k, o); }; }
const TR = require(path.join(SRC, '_lib/textroute.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
const SA = require(path.join(SRC, '_lib/smsalert.js'));
const S = require(path.join(SRC, '_lib/sms.js'));

const MAIN = '9015550000';
const USERS = [
  { id: 'u1', name: 'Wes Owner', email: 'wes.test@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, cell: '9015550100' },
  { id: 'u2', name: 'Nick Owner', email: 'nick.test@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, cell: '9015550101' },
  { id: 'u3', name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true, cell: '9015550111' },
  { id: 'u4', name: 'Other Pm', email: 'other.test@grayco-cs.com', role: 'Project Manager', active: true, cell: '9015550122' },
  { id: 'u5', name: 'Office Person', email: 'office.test@grayco-cs.com', role: 'Office', active: true, cell: '9015550133' }];
const ONEJOB = '9015551001', TWOJOBS = '9015551002', SUBPH = '9015559999', LEADPH = '9015558888';
const PROJECTS = [
  { id: 'PJA', name: 'Poplar Reroof', pm: 'Steven Park', client: 'Ann Sample', clientPhone: '9015557001', address: '4410 Poplar Ave, Memphis, TN 38117', status: 'Active', updatedAt: '2026-11-01' },
  { id: 'PJB', name: 'Elm Kitchen', pm: 'Other Pm', client: 'Bea Sample', clientPhone: TWOJOBS, address: '22 Elm St, Bartlett, TN 38135', status: 'Active', updatedAt: '2026-10-01' },
  { id: 'PJC', name: 'Oak Deck', pm: 'Steven Park', client: 'Bea Sample', clientPhone: TWOJOBS, address: '7 Oak Cv, Cordova, TN 38016', status: 'Active', updatedAt: '2026-11-10' },
  { id: 'PJD', name: 'Pine Siding', pm: 'Steven Park', client: 'Cal Sample', clientPhone: ONEJOB, address: '88 Pine Rd, Memphis, TN 38118', status: 'Active', updatedAt: '2026-11-02' },
  { id: 'PJE', name: 'Old Fence', pm: 'Other Pm', client: 'Cal Sample', clientPhone: ONEJOB, address: '90 Pine Rd, Memphis, TN 38118', status: 'Complete', updatedAt: '2025-05-02' }];
function world(o){
  o = o || {};
  KV.clear(); SMS.length = 0; MAIL.length = 0;
  setKv('users', USERS); setKv('projects', PROJECTS);
  setKv('subs', [{ id: 'S1', company: 'Test Roofing Sub', phone: SUBPH }]);
  setKv('customers', []); setKv('leads', [{ id: 'L1', name: 'Lee Lead', phone: LEADPH }]); setKv('vendors', []); setKv('schedule', []); setKv('gc_job_messages', '[]'); setKv('gc_office_tasks', '[]');
  setKv('gc_automation_pause', { on: !!o.paused });
  setKv(SA.KEY, { at: '2026-11-01T00:00:00Z', by: 'wes.test@grayco-cs.com', people: {
    'wes.test@grayco-cs.com': { on: true, cust: 'all', qOff: true }, 'steven.test@grayco-cs.com': { on: true, cust: 'mine', qOff: true }, 'other.test@grayco-cs.com': { on: true, cust: 'mine', qOff: true } } });
  try { require(path.join(SRC, '_lib/pause.js')).reset(); } catch (e) {}
  AUTO_ON = o.auto !== false;
}
let N = 0; const inbound = (from, body, sidIn) => MC._test.inboundSms({ From: '+1' + from, To: '+1' + MAIN, Body: body, MessageSid: sidIn || 'SMin' + (++N) });
const toCust = n => SMS.filter(x => x.To === '+1' + n);
const custBodies = n => toCust(n).map(x => x.Body);
const msgs = () => (getKv('gc_job_messages') || []).filter(m => m && m.dir === 'in');
const msgOf = sid => msgs().find(m => m.id === 'SMS_' + sid);
const leads = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const leadOf = ph => leads().find(x => String((x.contact || {}).phone || '').replace(/\D/g, '').endsWith(ph));
const tasks = () => getKv('gc_office_tasks') || [];
const ends = (b, t) => String(b || '').trim().endsWith(t);

console.log('— the decision (pure) —');
{
  const P = PROJECTS;
  ok(TR.jobsByAddress('Hi, about 4410 Poplar', P).map(p => p.id).join() === 'PJA', '"4410 Poplar" → the Poplar job (house number + street word)');
  ok(TR.jobsByAddress('its 22 elm street bartlett', P).map(p => p.id).join() === 'PJB', '"22 elm street bartlett" → the Elm job');
  ok(TR.jobsByAddress('4411 Poplar Ave', P).length === 0, 'a different house number → no job');
  ok(TR.jobsByAddress('call me at 901-555-1234 or 901 555 1234', P).length === 0, 'phone numbers are not addresses');
  ok(TR.jobsByAddress('4410 Poplar and 7 Oak Cv', P).length === 2, 'two different places named → not one job');
  ok(TR.jobsByAddress('88 Pine', P).map(p => p.id).join() === 'PJD', '"88 Pine" → Pine Siding (not 90 Pine)');
  ok(['NEW', 'new', 'New project', "it's new", 'I need a quote for a new fence', 'another project at my rental'].every(x => TR.saysNew(x, {})), 'NEW / "new project" / "need a quote" / "another project" = a new project (anyone)');
  ok(!TR.saysNew('the new roof is leaking', {}) && !TR.saysNew('when will the estimate be done', {}), 'a customer on file talking about their job is not a new project');
  ok(TR.saysNew('how much for a new roof?', { unknown: true }) && TR.saysNew('can I get an estimate', { unknown: true }), 'a stranger asking for an estimate = a new project');
  const base = { purpose: 'main', projects: P, ph: '9015550001', now: NOW, canAsk: true };
  ok(TR.decide(Object.assign({}, base, { who: null, body: 'Hi there' })).action === 'ask', 'unknown number, no address, nothing new → ask');
  ok(TR.decide(Object.assign({}, base, { who: null, body: 'Hi there', canAsk: false })).action === 'today', '…but when the question cannot go out → exactly as today');
  ok(TR.decide(Object.assign({}, base, { who: { kind: 'customer', pid: 'PJD', jobs: 2, openJobs: 1 }, body: 'Hi' })).action === 'today', 'a number on exactly one active job → as today (no question)');
  ok(TR.decide(Object.assign({}, base, { who: { kind: 'customer', pid: 'PJC', jobs: 2, openJobs: 2 }, body: 'Hi' })).action === 'ask', 'a number on two open jobs → ask');
  ok(TR.decide(Object.assign({}, base, { who: { kind: 'customer', pid: 'PJC', jobs: 2, openJobs: 2 }, body: 'Hi', lastPid: 'PJB' })).action === 'today', '…unless an employee texted them about one job lately (the reply goes there, as today)');
  ok(['sub', 'staff', 'lead'].every(k => TR.decide(Object.assign({}, base, { who: { kind: k }, body: 'Hi' })).action === 'today'), 'subs, staff and leads → as today');
  ok(TR.decide(Object.assign({}, base, { who: null, body: 'Hi', purpose: 'subs' })).action === 'today' && TR.decide(Object.assign({}, base, { who: null, body: 'Hi', purpose: 'leads' })).action === 'today', 'the subs / leads lines → as today');
  ok(TR.decide(Object.assign({}, base, { who: null, body: 'Hi', emergency: true })).action === 'today', 'an emergency → as today (answered at once)');
  ok(TR.decide(Object.assign({}, base, { who: null, body: 'Hi', own: { lead: 'LI-1' } })).action === 'today', 'a number that already has a lead from a text → as today (it goes on the lead)');
  const pend = { step: 'asked', at: new Date(NOW - 3600e3).toISOString(), sid: 'X1', body: 'Hi' };
  let d = TR.decide(Object.assign({}, base, { who: null, body: '4410 Poplar Ave', tr: pend }));
  ok(d.action === 'job' && d.pid === 'PJA' && d.reply === TR.GOT && d.step === 'answer', 'answer with an address → that job, one thanks', d);
  d = TR.decide(Object.assign({}, base, { who: null, body: 'NEW', tr: pend }));
  ok(d.action === 'lead' && d.reply === TR.GOT_NEW, 'answer NEW → a lead, "new project request" thanks', d);
  d = TR.decide(Object.assign({}, base, { who: null, body: 'umm the blue house', tr: pend }));
  ok(d.action === 'todo' && d.reply === TR.GOT, 'answer that names no job → office To-Do, the same thanks (a stranger learns nothing)', d);
  ok(TR.GOT === TR.decide(Object.assign({}, base, { who: null, body: '4410 Poplar', tr: pend })).reply, 'found and not found get the very same words');
  d = TR.decide(Object.assign({}, base, { who: null, body: 'Hi', tr: Object.assign({}, pend, { at: new Date(NOW - 50 * 3600e3).toISOString() }) }));
  ok(d.action === 'ask', 'a question older than 48 hours is not waiting any more → asked again', d);
  d = TR.decide(Object.assign({}, base, { who: null, body: 'one more thing', tr: { step: 'filed', pid: 'PJA', at: new Date(NOW - 5 * 864e5).toISOString() } }));
  ok(d.action === 'job' && d.pid === 'PJA' && !d.reply, 'the address they named (5 days ago) → their next texts go to that job, no question');
  d = TR.decide(Object.assign({}, base, { who: null, body: 'anyone?', tr: { step: 'office', at: new Date(NOW - 864e5).toISOString() } }));
  ok(d.action === 'todo' && !d.reply, 'the office already has them → added to that To-Do, nothing sent');
  ok(TR.ASK === "Is this about a project we're working on? Reply with the job address — or NEW if it's a new project.", 'the question, word for word');
}

console.log('— a number not on file: the question, then an address —');
world();
{
  const r1 = await inbound('9015552001', 'Hi, I have a question', 'SMq1');
  const got = custBodies('9015552001');
  ok(got.length === 1 && ends(got[0], TR.ASK), 'one text back, ending with the question', got);
  ok(r1.textRoute && r1.textRoute.action === 'ask', 'decided: ask', r1.textRoute);
  ok(!r1.newLead && !leadOf('9015552001'), 'no lead yet (it might be a customer of a project we are working on)', leads().map(x => x.title));
  ok(msgOf('SMq1') && msgOf('SMq1').pid === '', 'the text is kept in Job Messages → 📥 Unsorted meanwhile', msgOf('SMq1'));
  SMS.length = 0; NOW += 5 * 60000;
  const r2 = await inbound('9015552001', 'It is 4410 Poplar Ave', 'SMq2');
  ok(r2.textRoute.action === 'job' && r2.textRoute.pid === 'PJA', 'the answer names the Poplar job', r2.textRoute);
  ok(msgOf('SMq2').pid === 'PJA' && msgOf('SMq1').pid === 'PJA', 'the answer AND the first text are on the Poplar job now', [msgOf('SMq1'), msgOf('SMq2')].map(m => m && m.pid));
  ok(r2.route.to.indexOf('steven.test@grayco-cs.com') >= 0, 'routed to that job\'s PM (Steven Park)', r2.route);
  const cells = SMS.filter(x => x.To === '+19015550111');
  ok(cells.length === 1 && /4410|Poplar/.test(cells[0].Body), 'the job\'s PM gets the text on his cell, labelled with the job (📱 Text alerts, as today)', SMS.map(x => [x.To, x.Body.slice(0, 90)]));
  ok(!SMS.some(x => x.To === '+19015550122'), 'the other PM is not told');
  const back = custBodies('9015552001');
  ok(back.length === 1 && back[0] === TR.GOT, 'one thanks back: "' + TR.GOT + '"', back);
  ok(!leadOf('9015552001'), 'still no lead');
  SMS.length = 0; NOW += 5 * 60000;
  const r3 = await inbound('9015552001', 'Also the gutter by the gate', 'SMq3');
  ok(r3.textRoute.action === 'job' && msgOf('SMq3').pid === 'PJA', 'their next text goes to the Poplar job without asking', r3.textRoute);
  ok(!custBodies('9015552001').some(b => ends(b, TR.ASK)), '…and no second question');
  const menuTexts = custBodies('9015552001');
  ok(!menuTexts.some(b => /Poplar|4410|\$\s?\d|https?:\/\/|portal\.grayco/i.test(b)), 'an address someone named never gets them the job\'s details / portal link / balance (at most today\'s general menu)', menuTexts);
  SMS.length = 0; NOW += 60000;
  await inbound('9015552001', '2', 'SMq4'); await inbound('9015552001', '3', 'SMq5');
  ok(!custBodies('9015552001').some(b => /https?:\/\/|portal\.grayco|\$\s?\d/i.test(b)), '…even when they pick 2 (portal link) or 3 (balance) from that menu', custBodies('9015552001'));
}

console.log('— a number not on file answers NEW → a lead at once —');
world();
{
  await inbound('9015552002', 'Hello?', 'SMn1');
  ok(ends(custBodies('9015552002')[0], TR.ASK), 'asked');
  SMS.length = 0; NOW += 60000;
  const r = await inbound('9015552002', 'NEW', 'SMn2');
  const l = leadOf('9015552002');
  ok(r.textRoute.action === 'lead' && r.newLead && l, 'a lead is made at once', { tr: r.textRoute, leads: leads().map(x => x.title) });
  ok(l && /Text message/.test(l.source + ' ' + (l.sourceRef || '')) && /Hello\?/.test(JSON.stringify(l)) && /NEW/.test(JSON.stringify(l)), 'source "Text message" (the existing text-lead path); both texts on the lead', l && { source: l.source, sourceRef: l.sourceRef });
  ok(custBodies('9015552002').length === 1 && custBodies('9015552002')[0] === TR.GOT_NEW, 'one thanks back: "' + TR.GOT_NEW + '"', custBodies('9015552002'));
  SMS.length = 0; NOW += 60000;
  const r2 = await inbound('9015552002', 'its a roof leak at my house', 'SMn3');
  ok(r2.lead === l.id && !r2.newLead && r2.textRoute.action === 'today', 'their next text goes on that lead (no second lead, no question)', r2);
}

console.log('— a number not on file names no job → an office To-Do —');
world();
{
  await inbound('9015552003', 'hey', 'SMt1');
  SMS.length = 0; NOW += 60000;
  const r = await inbound('9015552003', 'the blue house on the corner', 'SMt2');
  const t = tasks().find(x => /^SMSWHICH_/.test(x.id));
  ok(r.textRoute.action === 'todo' && t && t.office === true && !t.done, 'an office To-Do', { tr: r.textRoute, tasks: tasks().map(x => x.id) });
  ok(t && /hey/.test(t.note) && /blue house/.test(t.note) && t.note.indexOf(TR.ASK) >= 0 && /Which project/.test(t.label), 'with both texts and the question we asked', t);
  ok(!tasks().some(x => /^SMSR_/.test(x.id)), 'no second "Text back" To-Do for the same text');
  ok(custBodies('9015552003').length === 1 && custBodies('9015552003')[0] === TR.GOT, 'one thanks back (the same words as when the address is found)');
  ok(!leadOf('9015552003'), 'no lead');
  SMS.length = 0; NOW += 60000;
  const r2 = await inbound('9015552003', 'hello??', 'SMt3');
  const t2 = tasks().find(x => x.id === t.id);
  ok(r2.textRoute.action === 'todo' && /hello\?\?/.test(t2.note) && tasks().filter(x => /^SMSWHICH_/.test(x.id)).length === 1, 'a later text is added to the same To-Do', t2);
  ok(custBodies('9015552003').length === 0, '…and nothing is sent back (one reply per step)');
}

console.log('— a customer on exactly one active job: as today, no question —');
world();
{
  const r = await inbound(ONEJOB, 'Is the crew coming today?', 'SMo1');
  ok(r.textRoute.action === 'today' && msgOf('SMo1').pid === 'PJD', 'filed on Pine Siding (their only open job)', r.textRoute);
  ok(!custBodies(ONEJOB).some(b => b.indexOf(TR.ASK) >= 0), 'no question', custBodies(ONEJOB));
}

console.log('— a customer on two open jobs —');
world();
{
  const r = await inbound(TWOJOBS, 'Quick question for you', 'SMw1');
  ok(r.textRoute.action === 'ask' && msgOf('SMw1').pid === '', 'asked; the text waits in 📥 Unsorted (not on the job the phone match guessed)', { tr: r.textRoute, pid: msgOf('SMw1') && msgOf('SMw1').pid });
  ok(ends(custBodies(TWOJOBS)[0], TR.ASK), 'the question went out');
  ok(!SMS.some(x => x.To === '+19015550111'), 'the Oak Deck PM (the guessed job) is not told yet');
  SMS.length = 0; NOW += 60000;
  const r2 = await inbound(TWOJOBS, 'the one at 22 Elm', 'SMw2');
  ok(r2.textRoute.action === 'job' && r2.textRoute.pid === 'PJB' && msgOf('SMw1').pid === 'PJB' && msgOf('SMw2').pid === 'PJB', 'both texts on Elm Kitchen', r2.textRoute);
  ok(r2.route.to.indexOf('other.test@grayco-cs.com') >= 0 && SMS.some(x => x.To === '+19015550122'), 'Elm Kitchen\'s PM hears', r2.route);
  ok(custBodies(TWOJOBS).length === 1 && custBodies(TWOJOBS)[0] === TR.GOT, 'one thanks', custBodies(TWOJOBS));
  SMS.length = 0; NOW += 60000;
  const r3 = await inbound(TWOJOBS, 'I need a quote for another project at my rental', 'SMw3');
  ok(r3.textRoute.action === 'lead' && r3.newLead, 'a customer on file asking for another project → a lead at once', r3.textRoute);
}

console.log('— first texts that already say it —');
world();
{
  const r = await inbound('9015552004', 'This is about 7 Oak Cv, the deck boards', 'SMf1');
  ok(r.textRoute.action === 'job' && msgOf('SMf1').pid === 'PJC' && !r.newLead, 'a first text naming a job address → that job, no question, no lead', r.textRoute);
  ok(!custBodies('9015552004').some(b => b.indexOf(TR.ASK) >= 0), 'no question');
  const r2 = await inbound('9015552005', 'Can I get an estimate for a new roof?', 'SMf2');
  ok(r2.textRoute.action === 'lead' && r2.newLead && !custBodies('9015552005').some(b => b.indexOf(TR.ASK) >= 0), 'a stranger asking for an estimate → a lead at once, no question (the approved estimate answer, as today)', { tr: r2.textRoute, b: custBodies('9015552005') });
  const r3 = await inbound('9015552006', 'Water is flooding my basement, pipe burst!', 'SMf3');
  ok(r3.textRoute.action === 'today' && r3.newLead && !custBodies('9015552006').some(b => b.indexOf(TR.ASK) >= 0), 'an emergency → as today (a lead and the emergency answer at once), no question', { tr: r3.textRoute, b: custBodies('9015552006') });
  const r4 = await inbound(SUBPH, 'running late', 'SMf4');
  const r5 = await inbound(LEADPH, 'any update?', 'SMf5');
  const r6 = await inbound('9015550111', 'test from my cell', 'SMf6');
  ok([r4, r5, r6].every(x => !x.textRoute || x.textRoute.action === 'today') && ![SUBPH, LEADPH].some(p => custBodies(p).some(b => b.indexOf(TR.ASK) >= 0)), 'a sub, a lead and a staff cell are never asked', [r4, r5, r6].map(x => x.textRoute || x));
}

console.log('— the limits: the switch, data-entry mode, quiet hours, retries —');
world({ auto: false });
{
  const r = await inbound('9015552007', 'Hi', 'SMl1');
  ok(r.textRoute.action === 'today' && r.newLead && custBodies('9015552007').every(b => b.indexOf(TR.ASK) < 0), '⚡ Text auto-answers off → no question; exactly as today (a lead)', { tr: r.textRoute, b: custBodies('9015552007') });
}
world({ paused: true });
{
  const r = await inbound('9015552008', 'Hi', 'SMl2');
  ok(r.textRoute.action === 'today' && custBodies('9015552008').length === 0, '⏸ data-entry mode → nothing sent, as today', r.textRoute);
}
world();
{
  const r = await inbound('9015552009', 'Hi', 'SMl3');
  const again = await inbound('9015552009', 'Hi', 'SMl3');
  ok(again.skipped === 'already handled' && custBodies('9015552009').length === 1, 'a Twilio retry of the same text is handled once (one question)', again);
  ok(r.textRoute.action === 'ask', 'asked once');
}
world();
{
  NOW = Date.parse('2026-11-19T04:00:00Z');   /* 10 PM Central */
  const r = await inbound('9015552010', 'Hi is anyone there', 'SMl4');
  ok(r.textRoute.action === 'ask' && r.replyHeldUntil && custBodies('9015552010').length === 0, '10 PM: the question waits for 7 AM (the customer quiet hours), nothing sent now', { tr: r.textRoute, held: r.replyHeldUntil, b: custBodies('9015552010') });
  NOW = Date.parse('2026-11-18T16:00:00Z');
}
world();
{
  /* the daily limit of automatic answers per number (maxPerDay 4) also caps the question */
  const st = getKv('gc_sms_state') || {}; st.auto = { '9015552011': [1, 2, 3, 4].map(i => ({ at: new Date(NOW - i * 60000).toISOString(), rule: 'x' + i })) }; setKv('gc_sms_state', st);
  const r = await inbound('9015552011', 'Hi', 'SMl5');
  ok(r.textRoute.action === 'today' && custBodies('9015552011').every(b => b.indexOf(TR.ASK) < 0), 'four automatic answers today already → no question (as today)', { tr: r.textRoute, b: custBodies('9015552011') });
}

console.log('— nothing else —');
ok(OUTSIDE.length === 0, 'no call to any other service', OUTSIDE.slice(0, 5));
ok(SMS.every(x => /^\+1(901555|662555|870555)/.test(x.To)), 'every text went to a made-up 555 number');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
