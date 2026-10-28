// test_CALLCHAIN.mjs — patches CALLCHAIN + CALLSCREEN (offline): the GrayCo Twilio number screens the caller (1 work ·
// 2 customer · 3 other / sales), then rings the 📞 Call order one number at a time, each person pressing 1 to accept.
// Mocks: Supabase REST (an in-memory gc_kv; gc_lead_inbox_kv missing → gc_kv), Twilio REST (texts recorded, never sent),
// Resend. Every webhook is signed with a fake TWILIO_AUTH_TOKEN exactly as Twilio signs (url + sorted POST params).
// Usage: node tools/tests/test_CALLCHAIN.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../../netlify/functions'));
const TOKEN = 'fake-twilio-token-123';
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com' });
['TWILIO_RING_TO', 'TWILIO_RING_SECONDS', 'TWILIO_WEBHOOK_BASE', 'TWILIO_CALL_CHAIN', 'URL', 'DEPLOY_PRIME_URL', 'GC_PAUSE'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); } }

/* ── the world ── */
const KV = new Map(), SMS = [], MAIL = [];
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => (KV.get(k) || {}).value;
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') return J(200, [{ email: 'owner@grayco-cs.com', role: 'admin', active: true }]);
    if (u.pathname === '/rest/v1/gc_kv') {
      const kq = u.searchParams.get('key') || '';
      if (m === 'GET') {
        if (kq.startsWith('in.(')) { const keys = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return J(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k).value, updated_at: KV.get(k).updated_at }))); }
        const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r.value, updated_at: r.updated_at }] : []);
      }
      const body = JSON.parse(init.body || '{}'), key = kq.replace(/^eq\./, '');
      if (m === 'PATCH') { const r = KV.get(key), at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || (at && r.updated_at !== at)) return J(200, []); KV.set(key, { value: body.value, updated_at: body.updated_at }); return J(200, [{ key }]); }
      if (m === 'POST') { KV.set(body.key, { value: body.value, updated_at: body.updated_at || new Date().toISOString() }); return J(201, null); }
    }
    return J(200, []);
  }
  if (u.host === 'api.twilio.com') { SMS.push(Object.fromEntries(new URLSearchParams(init.body))); return J(201, { sid: 'SM' + SMS.length }); }
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
const MC = require(path.join(SRC, 'missed-call.js'));
const CC = require(path.join(SRC, '_lib/callorder.js'));

const NICK = '9015551001', WES = '9015551002', SENIOR = '9015551003', PM2 = '9015551004', OFFICE = '9015850944', CALLER = '9015557777';
function world(chain){
  KV.clear(); SMS.length = 0; MAIL.length = 0;
  setKv('users', [
    { id: 'u1', name: 'Nick Thomas', email: 'nick@grayco-cs.com', role: 'Admin', phone: '(901) 555-1001', active: true },
    { id: 'u2', name: 'Wesley Johnson', email: 'wesley@grayco-cs.com', role: 'Admin', cell: '901-555-1002', active: true },
    { id: 'u3', name: 'Sam Senior', email: 'sam@grayco-cs.com', role: 'Project Manager', mobile: '+1 901 555 1003', active: true },
    { id: 'u4', name: 'Pat Two', email: 'pat@grayco-cs.com', role: 'Project Manager', phone: '9015551004', active: true }]);
  setKv('gc_senior_pm', { email: 'sam@grayco-cs.com', id: 'u3', name: 'Sam Senior' });
  setKv('projects', []); setKv('customers', []); setKv('leads', []);
  if (chain !== undefined) setKv(CC.KEY, chain);
}
const SITE = 'https://crm.grayco-cs.com/.netlify/functions/missed-call';
function sign(url, p, token){ return crypto.createHmac('sha1', token || TOKEN).update(Buffer.from(url + Object.keys(p).sort().map(k => k + p[k]).join(''), 'utf8')).digest('base64'); }
/* POST to a URL exactly as Twilio would (the URL from our own TwiML), signed over that URL */
function post(url, p, o = {}){
  const u = new URL(url), qs = Object.fromEntries(u.searchParams);
  const headers = o.noSig ? {} : { 'X-Twilio-Signature': o.sig || sign(o.signUrl || url, p) };
  return MC.handler({ httpMethod: 'POST', headers, queryStringParameters: qs, rawUrl: url, body: new URLSearchParams(p).toString() });
}
const VOICE = SITE + '?event=voice';
const base = (o) => Object.assign({ CallSid: 'CA' + Math.random().toString(16).slice(2, 12), From: '+1' + CALLER, To: '+19015550000', CallStatus: 'in-progress' }, o || {});
const unesc = x => x.replace(/&amp;/g, '&');
const dials = b => [...String(b).matchAll(/<Number[^>]*>\+1(\d{10})<\/Number>/g)].map(x => x[1]);
const attr = (b, tag, a) => { const m = new RegExp('<' + tag + '[^>]*\\s' + a + '="([^"]+)"').exec(String(b)); return m ? unesc(m[1]) : ''; };
const leads = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const logRow = sid => ((getKv(CC.LOG_KEY) || {}).calls || []).find(x => x.sid === sid) || null;
/* a whole call: menu answer, (what they need), then every ring. answerAt = the step where the person presses 1;
   vmAt = a step where a voicemail picks up (completed, nobody pressed 1) */
async function walk(p, o = {}){
  const press = o.press === undefined ? '1' : o.press, rung = [], bodies = [], whispers = [];
  let r = await post(VOICE, p); bodies.push(r.body);
  if (/<Gather[^>]*input="dtmf speech"/.test(r.body)) {
    const a = attr(r.body, 'Gather', 'action');
    r = await post(a, Object.assign({}, p, press ? { Digits: press } : {})); bodies.push(r.body);
    if (/<Gather[^>]*input="speech"/.test(r.body)) { r = await post(attr(r.body, 'Gather', 'action'), Object.assign({}, p, o.said ? { SpeechResult: o.said } : {})); bodies.push(r.body); }
  }
  for (let i = 0; i < 30; i++) {
    const n = dials(r.body); if (!n.length) break; rung.push(n[0]);
    const act = attr(r.body, 'Dial', 'action'), wurl = attr(r.body, 'Number', 'url'), aq = Object.fromEntries(new URL(act).searchParams);
    ok(new URL(act).origin + new URL(act).pathname === SITE && aq.event === 'dialdone' && aq.step === String(i), 'hop ' + i + ': action …?event=dialdone&step=' + i, act);
    const child = { CallSid: 'CAchild' + i, ParentCallSid: p.CallSid, From: p.From, To: '+1' + n[0], CallStatus: 'in-progress' };
    let accepted = false;
    if (wurl && (o.answerAt === i || o.vmAt === i)) {
      const w = await post(wurl, child); whispers.push(w.body);
      if (o.answerAt === i) { const acc = await post(attr(w.body, 'Gather', 'action'), Object.assign({}, child, { Digits: '1' })); accepted = acc.statusCode === 200 && !/Hangup/.test(acc.body); }
    }
    const done = o.answerAt === i || o.vmAt === i ? 'completed' : 'no-answer';
    r = await post(act, Object.assign({}, p, { DialCallStatus: done, DialCallSid: 'CAchild' + i, CallStatus: o.hangAt === i ? 'completed' : 'in-progress' })); bodies.push(r.body);
    if (accepted && !/<Hangup\/><\/Response>$/.test(r.body)) ok(false, 'accepted call ends with Hangup', r.body);
  }
  return { rung, bodies, whispers, last: r };
}

const CHAIN = { on: true, ringSeconds: 15, slots: [
  { id: 'office', on: true, kind: 'company' }, { id: 'owner1', on: true, kind: 'person', person: 'u1' }, { id: 'owner2', on: true, kind: 'person', person: 'u2' },
  { id: 'gm', on: true, kind: 'person', person: '' }, { id: 'leadpm', on: true, kind: 'senior' }, { id: 'x_pm2', label: 'PM 2', on: true, kind: 'person', person: 'u4' }] };
const chain = (o) => Object.assign(JSON.parse(JSON.stringify(CHAIN)), o || {});

console.log('CALLSCREEN — the menu');
{
  world(chain());
  const p = base(), w = await walk(p, { press: '' });
  ok(/press 1/.test(w.bodies[0]) && /press 3/.test(w.bodies[0]) && /<Gather[^>]*numDigits="1"[^>]*timeout="6"/.test(w.bodies[0]), 'the call opens with the 1 / 2 / 3 menu (Gather dtmf+speech, 1 digit, 6 s)', w.bodies[0]);
  ok(/try=2/.test(w.bodies[1]) && /press 1/.test(w.bodies[1]), 'nothing pressed → the menu once more', w.bodies[1]);
  const r3 = await post(attr(w.bodies[1], 'Gather', 'action'), p);
  ok(/Goodbye/.test(r3.body) && /<Hangup\/>/.test(r3.body) && !dials(r3.body).length, 'nothing pressed twice → goodbye, hang up, nobody rung', r3.body);
  ok(SMS.length === 0 && leads().length === 0, 'no input → no text, no lead');
  ok(/likely robocall/.test((logRow(p.CallSid) || {}).outcome), 'logged as "no answer to menu (likely robocall)"', logRow(p.CallSid));
}
{
  world(chain());
  const p = base(), w = await walk(p, { press: '3' });
  ok(w.rung.length === 0 && /don.{1,5}t take sales calls/.test(w.last.body) && /<Hangup\/>/.test(w.last.body), '3 → "we don\'t take sales calls", hang up, nobody rung', w.last.body);
  ok(SMS.length === 0 && leads().length === 0 && /pressed 3/.test(logRow(p.CallSid).outcome), '3 → no text, no lead; logged only', logRow(p.CallSid));
  world(chain());
  const ps = base(), ws = await walk(ps, { press: null, said: '' });
  const r = await post(attr((await post(VOICE, ps)).body, 'Gather', 'action'), Object.assign({}, ps, { SpeechResult: 'Hi, we offer SEO services for contractors' }));
  ok(!dials(r.body).length && /sales/.test(r.body), 'saying "we offer SEO services" counts as 3', r.body);
}
{
  world(chain());
  const p = base({ StirVerstat: 'TN-Validation-Failed-C' }), r = await post(VOICE, p);
  ok(!dials(r.body).length && !/press 1/.test(r.body) && /sales/.test(r.body) && SMS.length === 0 && leads().length === 0, 'failed STIR/SHAKEN attestation → no menu, no ring, no text', r.body);
  world(chain({ screen: { on: true, blocked: ['(901) 555-7777'] } }));
  const pb = base(), rb = await post(VOICE, pb);
  ok(!dials(rb.body).length && /sales/.test(rb.body) && logRow(pb.CallSid).outcome === 'blocked number', 'a blocked number → no ring, logged "blocked number"', logRow(pb.CallSid));
  world(chain());
  const rp = await post(VOICE, base({ StirVerstat: 'TN-Validation-Passed-A' }));
  ok(/press 1/.test(rp.body), 'a passed attestation → the menu as usual');
}
console.log('CALLCHAIN — 1: what they need, the order, the whisper');
{
  world(chain());
  const p = base(), w = await walk(p, { said: 'roof leak over the kitchen' });
  ok(/what work do you need/.test(w.bodies[1]) && /<Gather[^>]*input="speech"[^>]*timeout="8"/.test(w.bodies[1]), '1 → "In a few words, what work do you need?" (speech, 8 s)', w.bodies[1]);
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK, WES, SENIOR, PM2]), 'rings Office → Owner 1 → Owner 2 → (GM empty: skipped) → Lead PM = Senior PM → PM 2', w.rung);
  ok(/please hold while we connect you/i.test(w.bodies[2]) && !/hold/i.test(w.bodies[3]), 'the hold line plays once, before the first ring');
  ok(/<Dial timeout="15" answerOnBridge="true"/.test(w.bodies[2]) && /<Number url="[^"]*event=whisper/.test(w.bodies[2]), 'each <Dial> rings 15 s, answerOnBridge, with the whisper URL on <Number>');
  ok(/sent you a text message/.test(w.last.body) && /<Hangup\/>/.test(w.last.body), 'after the last one: the goodbye message');
  ok(SMS.length === 1 && SMS[0].To === '+1' + CALLER, '1, unanswered → exactly ONE auto-text, to the caller', SMS);
  ok(leads().length === 1 && /roof leak over the kitchen/.test(JSON.stringify(leads()[0])), 'exactly one Missed call lead, with what they said', leads().map(x => x.source + ' ' + JSON.stringify(x).slice(0, 200)));
  ok(logRow(p.CallSid).outcome === 'missed' && logRow(p.CallSid).choice === '1', 'logged: pressed 1, missed');
}
{
  world(chain());
  const p = base(), w = await walk(p, { said: 'new deck', answerAt: 2 });
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK, WES]), 'answered (pressed 1) at slot 2: nobody after is rung', w.rung);
  ok(/GrayCo call: new deck\. Press 1 to accept/.test(w.whispers[0]) && /<Gather numDigits="1"/.test(w.whispers[0]) && /<Hangup\/><\/Response>$/.test(w.whispers[0]), 'the person hears "GrayCo call: new deck. Press 1 to accept" (no key → their leg hangs up)', w.whispers[0]);
  ok(/<Response><Hangup\/><\/Response>/.test(w.last.body) && SMS.length === 0 && leads().length === 0, 'answered → hang-up flow, no text, no lead');
  ok(logRow(p.CallSid).outcome === 'answered' && /Owner 2/.test(logRow(p.CallSid).by), 'logged: answered by Owner 2', logRow(p.CallSid));
}
{
  world(chain());
  const p = base(), w = await walk(p, { said: 'gutters', vmAt: 1, answerAt: 3 });
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK, WES, SENIOR]), 'a voicemail picking up at Owner 1 (nobody pressed 1) does not stop the list', w.rung);
  ok(SMS.length === 0, 'Lead PM accepted → no text');
}
{
  world(chain());
  const p = base(), w = await walk(p, { said: 'water heater', hangAt: 1 });
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK]) && SMS.length === 1 && leads().length === 1, 'the caller hangs up while it rings → stop, one text + lead', { rung: w.rung, sms: SMS.length });
}
console.log('CALLCHAIN — 2: a current customer');
{
  world(chain());
  setKv('projects', [{ id: 'P1', name: 'Smith kitchen', client: 'Jane Smith', phone: '(901) 555-7777', pm: 'Pat Two', address: '1 Main St' }]);
  const p = base(), w = await walk(p, { press: '2' });
  ok(!/what work/.test(w.bodies[1]) && w.rung[0] === PM2, '2 → no question; the job\'s PM (Pat) first', w.rung);
  ok(w.rung.filter(x => x === PM2).length === 1 && w.rung.length === 5, 'the job PM is not rung twice (PM 2 = Pat later in the list is skipped)', w.rung);
  ok(SMS.length === 1 && leads().length === 0, '2, unanswered → one text; an existing customer gets a call-back to-do, not a lead', { sms: SMS.length, leads: leads().length });
}
console.log('CALLCHAIN — loop guard and caller skip');
{
  world(chain());
  const w = await walk(base({ ForwardedFrom: '+1' + OFFICE }), { said: 'x' });
  ok(w.rung[0] === NICK && w.rung.indexOf(OFFICE) < 0, 'forwarded from the office line (ForwardedFrom) → the office is not rung again', w.rung);
  world(chain());
  const w2 = await walk(base({ CalledVia: '9015850944' }), { said: 'x' });
  ok(w2.rung.indexOf(OFFICE) < 0, 'CalledVia = the office line → office skipped', w2.rung);
  world(chain());
  const w3 = await walk(base({ From: '+1' + WES }), { said: 'x' });
  ok(w3.rung.indexOf(WES) < 0 && w3.rung.length === 4, 'the caller\'s own number is skipped (Wesley calling in)', w3.rung);
  world(chain());
  const w4 = await walk(base({ From: '+1' + OFFICE }), { said: 'x' });
  ok(w4.rung.indexOf(OFFICE) < 0 && SMS.length === 0 && leads().length === 0, 'the office line as caller ID: office not rung, no text / lead to our own line', { rung: w4.rung, sms: SMS.length });
}
console.log('CALLCHAIN — signature on every hop');
{
  world(chain());
  const p = base();
  ok((await post(VOICE, p, { noSig: true })).statusCode === 403, 'voice without X-Twilio-Signature → 403');
  ok((await post(VOICE, p, { sig: sign(VOICE, p, 'wrong-token') })).statusCode === 403, 'voice signed with another token → 403');
  const m1 = SITE + '?event=menu&try=1', p1 = Object.assign({}, p, { Digits: '1' });
  ok((await post(m1, p1, { noSig: true })).statusCode === 403, 'menu hop without signature → 403');
  ok((await post(m1, p1, { signUrl: SITE + '?event=menu' })).statusCode === 403, 'menu signed over another URL → 403');
  ok((await post(SITE + '?event=what', Object.assign({}, p, { SpeechResult: 'x' }), { noSig: true })).statusCode === 403, 'what hop without signature → 403');
  const wurl = SITE + '?event=whisper&step=0&p=' + p.CallSid;
  ok((await post(wurl, { CallSid: 'CAc', ParentCallSid: p.CallSid }, { noSig: true })).statusCode === 403, 'whisper hop without signature → 403');
  ok((await post(SITE + '?event=accept&step=0&p=' + p.CallSid, { CallSid: 'CAc', Digits: '1' }, { signUrl: SITE + '?event=accept&step=0&p=CAother' })).statusCode === 403, 'accept with the parent call id tampered → 403');
  const p2 = Object.assign({}, p, { DialCallStatus: 'no-answer' });
  ok((await post(SITE + '?event=dialdone&step=0', p2, { noSig: true })).statusCode === 403, 'dialdone hop without signature → 403');
  ok((await post(SITE + '?event=dialdone&step=0', p2, { signUrl: SITE + '?event=dialdone' })).statusCode === 403, 'dialdone signed without &step → 403 (step is covered)');
  ok((await post(SITE + '?event=dialdone&step=3', p2, { signUrl: SITE + '?event=dialdone&step=0' })).statusCode === 403, 'step tampered (signed for 0, sent 3) → 403');
  ok(MC._test.hookUrl('dialdone', { step: 2 }) === SITE + '?event=dialdone&step=2', 'hookUrl builds the exact URL Twilio calls back');
  ok(SMS.length === 0, 'refused hops send nothing');
  /* a forged dialdone for a call that never pressed 1 / 2 never texts */
  const r = await post(SITE + '?event=dialdone&step=9', Object.assign(base(), { DialCallStatus: 'no-answer' }));
  ok(SMS.length === 0 && leads().length === 0, 'a (signed) dialdone for a call that never answered the menu → no text, no lead', r.body);
}
console.log('CALLCHAIN — Lead PM follows the Senior PM; settings; fallbacks');
{
  world(chain());
  setKv('gc_senior_pm', { email: 'pat@grayco-cs.com', id: 'u4', name: 'Pat Two' });
  const w = await walk(base(), { said: 'x' });
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK, WES, PM2]), 'Senior PM changed to Pat → Lead PM rings Pat; PM 2 (also Pat) is not rung twice', w.rung);
  world(chain());
  setKv('gc_senior_pm', { none: true, email: '', id: '' });
  const wN = await walk(base(), { said: 'x' });
  ok(wN.rung.indexOf(SENIOR) < 0 && wN.rung.length === 4, 'no Senior PM → Lead PM skipped', wN.rung);
  const d = CC.pinPeople(CC.defaults(), getKv('users'));
  ok(d.slots.map(x => x.id).join() === 'office,owner1,owner2,gm,leadpm' && d.slots[1].person === 'u1' && d.slots[2].person === 'u2' && d.screen.on && d.screen.askWhat && d.screen.whisper, 'defaults: Office · Owner 1 = Nick · Owner 2 = Wesley · GM empty · Lead PM = Senior PM; screening on', d);
  const pv = CC.preview(CHAIN, { users: getKv('users'), gc_senior_pm: { id: 'u3' } }, ['+19015550000']);
  ok(pv.list.length === 5 && pv.wait === 75 && pv.skipped.some(x => x.id === 'gm' && x.why === 'empty'), 'preview: 5 ring, 75 s wait, GM skipped (empty)', pv);
  /* nothing saved, no TWILIO_RING_TO → the owner's default order (screened) */
  world(undefined);
  const wd = await walk(base(), { said: 'x' });
  ok(JSON.stringify(wd.rung) === JSON.stringify([OFFICE, NICK, WES, SENIOR]), 'nothing saved → the default order Office · Nick · Wesley · (GM) · Lead PM', wd.rung);
  world(undefined); process.env.TWILIO_RING_TO = '+19015552222';
  const we = await walk(base(), { said: 'x' });
  ok(JSON.stringify(we.rung) === JSON.stringify(['9015552222']) && SMS.length === 1, 'nothing saved + Netlify TWILIO_RING_TO → screened, then that one number', we.rung);
  delete process.env.TWILIO_RING_TO;
  world(chain({ on: false }));
  const wo = await walk(base(), { said: 'x' });
  ok(wo.rung.length === 0 && SMS.length === 1 && leads().length === 1, 'call order off, screening on → 1 still gets the text + lead, nobody rung');
  world(chain({ on: false, screen: { on: false } }));
  const r3 = await post(VOICE, base());
  ok(!dials(r3.body).length && !/press 1/.test(r3.body) && SMS.length === 1, 'both off (no TWILIO_CALL_CHAIN) → the old path: a missed call at once');
  world(chain({ on: false, screen: { on: false } })); process.env.TWILIO_CALL_CHAIN = '1';
  const rc = await post(VOICE, base());
  ok(/event=chain|sent you a text/.test(rc.body) && !/press 1/.test(rc.body), 'both off + TWILIO_CALL_CHAIN=1 → the rc-r13 24/7 chain path (patch CHAIN) runs', rc.body.slice(0, 300));
  delete process.env.TWILIO_CALL_CHAIN;
  world(chain({ screen: { on: false } }));
  const wns = await walk(base());
  ok(wns.rung.length === 5 && /Thanks for calling GrayCo Construction Services, please hold/.test(wns.bodies[0]), 'screening off → hold greeting, then the order', wns.bodies[0]);
  const many = chain(); for (let i = 0; i < 8; i++) many.slots.push({ id: 'x' + i, label: 'PM ' + (i + 3), kind: 'phone', phone: '90155520' + String(10 + i) });
  world(many);
  const wl = await walk(base(), { said: 'x' });
  ok(wl.rung.length === 13 && SMS.length === 1, 'a 13-number list is walked to the end, then one text', wl.rung.length);
}
console.log('CALLCHAIN — Admin → 📞 Call order (texts.js ?callchain=1)');
{
  world(undefined);
  const BI = require(path.join(SRC, 'bid-inbox.js')), TX = require(path.join(SRC, 'texts.js'));
  let WHO = { ok: true, email: 'owner@grayco-cs.com', name: 'Owner', role: 'admin', admin: true };
  BI._test.staffAuth = async () => WHO;
  const call = (m, body) => TX.handler({ httpMethod: m, headers: { origin: 'https://crm.grayco-cs.com' }, queryStringParameters: { callchain: '1' }, body: body ? JSON.stringify(body) : '' }).then(r => Object.assign({ code: r.statusCode }, JSON.parse(r.body)));
  await walk(base(), { press: '3' });
  process.env.TWILIO_RING_SECONDS = '20';
  const g = await call('GET'); if (!g.ok) console.log(g);
  ok(g.ok && g.saved === false && g.settings.ringSeconds === 20, 'nothing saved: ring seconds start at Netlify TWILIO_RING_SECONDS (20)', g.settings);
  ok(g.settings.slots[1].person === 'u1' && g.people.length === 4 && g.preview.list.length === 4 && g.preview.wait === 80, 'defaults pinned to people; 4 ring now (GM empty), a caller waits up to 80 s', g.preview);
  ok(Array.isArray(g.log) && g.log.length === 1 && g.log[0].choice === '3' && /pressed 3/.test(g.log[0].outcome), 'the call log comes back for the card (the sales call)', g.log);
  const v = g.settings; v.ringSeconds = 12; v.slots.push({ id: 'x_pm2', label: 'PM 2', on: true, kind: 'person', person: 'u4' });
  v.screen.blocked = ['901-555-8888', 'junk']; v.screen.greeting = 'Hello, press 1 for work.'; v.screen.askWhat = false;
  const s1 = await call('POST', { settings: v }), sv = getKv(CC.KEY);
  ok(s1.ok && s1.saved && sv.ringSeconds === 12 && sv.slots.length === 6 && sv.by === 'owner@grayco-cs.com', 'admin saves: the card value (12 s) wins over the env; PM 2 added', sv);
  ok(JSON.stringify(sv.screen.blocked) === '["9015558888"]' && sv.screen.greeting === 'Hello, press 1 for work.' && sv.screen.askWhat === false, 'screening settings saved (blocked list cleaned, greeting, question off)', sv.screen);
  const g2 = await call('GET'); ok(g2.saved && g2.settings.ringSeconds === 12 && g2.settings.slots[5].label === 'PM 2', 'read back as saved');
  const rv = await post(VOICE, base()); ok(/Hello, press 1 for work\./.test(rv.body), 'the edited greeting is what callers hear');
  WHO = Object.assign({}, WHO, { role: 'staff', admin: false });
  const n = await call('GET'); ok(n.code === 403, 'a non-admin cannot read or change the call order');
  delete process.env.TWILIO_RING_SECONDS;
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
