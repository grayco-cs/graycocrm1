// test_CALLCHAIN.mjs — patch CALLCHAIN (offline): the GrayCo Twilio number rings the 📞 Call order one number at a time.
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
['TWILIO_RING_TO', 'TWILIO_WEBHOOK_BASE', 'URL', 'DEPLOY_PRIME_URL', 'GC_PAUSE'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 600) : '')); } }

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
const CC = require(path.join(SRC, '_lib/callchain.js'));

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
function hit(qs, p, o = {}){
  const q = '?' + Object.keys(qs).map(k => k + '=' + encodeURIComponent(qs[k])).join('&'), url = SITE + q;
  const headers = o.noSig ? {} : { 'X-Twilio-Signature': o.sig || sign(o.signUrl || url, p) };
  return MC.handler({ httpMethod: 'POST', headers, queryStringParameters: qs, rawUrl: url, body: new URLSearchParams(p).toString() });
}
const base = (o) => Object.assign({ CallSid: 'CA' + Math.random().toString(16).slice(2, 12), From: '+1' + CALLER, To: '+19015550000', CallStatus: 'ringing' }, o || {});
const dials = b => [...String(b).matchAll(/<Number>\+1(\d{10})<\/Number>/g)].map(x => x[1]);
const action = b => { const m = /action="([^"]+)"/.exec(String(b)); return m ? m[1].replace(/&amp;/g, '&') : ''; };
const leads = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
/* walk the call: voice, then dialdone for each step (unanswered unless answerAt) — returns every number rung, in order */
async function walk(p, answerAt){
  const rung = [], bodies = [];
  let r = await hit({ event: 'voice' }, p); bodies.push(r.body);
  for (let i = 0; i < 30; i++) {
    const n = dials(r.body); if (!n.length) break; rung.push(n[0]);
    const a = new URL(action(r.body)), qs = Object.fromEntries(a.searchParams);
    ok(a.origin + a.pathname === SITE && qs.event === 'dialdone' && String(qs.step) === String(i), 'hop ' + i + ': action URL is …?event=dialdone&step=' + i, action(r.body));
    const ans = answerAt === i;
    r = await hit(qs, Object.assign({}, p, { DialCallStatus: ans ? 'completed' : 'no-answer', DialCallSid: 'CAd' + i }), { signUrl: action(r.body) }); bodies.push(r.body);
  }
  return { rung, bodies, last: r };
}

const CHAIN = { on: true, ringSeconds: 15, slots: [
  { id: 'office', on: true, kind: 'company' }, { id: 'owner1', on: true, kind: 'person', person: 'u1' }, { id: 'owner2', on: true, kind: 'person', person: 'u2' },
  { id: 'gm', on: true, kind: 'person', person: '' }, { id: 'leadpm', on: true, kind: 'senior' }, { id: 'x_pm2', label: 'PM 2', on: true, kind: 'person', person: 'u4' }] };

console.log('CALLCHAIN — order, skips, answered, all missed');
{
  world(JSON.parse(JSON.stringify(CHAIN)));
  const w = await walk(base());
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK, WES, SENIOR, PM2]), 'rings Office → Owner 1 → Owner 2 → (GM empty: skipped) → Lead PM = Senior PM → PM 2', w.rung);
  ok(/please hold while we connect you/.test(w.bodies[0]) && !/please hold/.test(w.bodies[1]), 'the hold greeting plays once, before the first ring');
  ok(/<Dial timeout="15" answerOnBridge="true"/.test(w.bodies[0]), 'each <Dial> rings 15 s with answerOnBridge');
  ok(/sent you a text message/.test(w.last.body) && /<Hangup\/>/.test(w.last.body), 'after the last one: the goodbye message');
  ok(SMS.length === 1 && SMS[0].To === '+1' + CALLER, 'exactly ONE auto-text, to the caller', SMS);
  ok(leads().length === 1 && leads()[0].source === 'Missed call', 'exactly one Missed call lead', leads().map(x => x.source));
  const st = getKv('gc_sms_state'); ok(st && Object.keys(st.calls).length === 1, 'the call is claimed once in gc_sms_state');
}
{
  world(JSON.parse(JSON.stringify(CHAIN)));
  const w = await walk(base(), 2);
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK, WES]), 'answered at slot 2 (Owner 2): nobody after is rung', w.rung);
  ok(/<Response><Hangup\/><\/Response>/.test(w.last.body), 'answered → hang-up flow, no goodbye');
  ok(SMS.length === 0 && leads().length === 0, 'answered → no text, no lead');
}
console.log('CALLCHAIN — loop guard and caller skip');
{
  world(JSON.parse(JSON.stringify(CHAIN)));
  const w = await walk(base({ ForwardedFrom: '+1' + OFFICE }));
  ok(w.rung[0] === NICK && w.rung.indexOf(OFFICE) < 0, 'forwarded from the office line (ForwardedFrom) → the office is not rung again', w.rung);
  world(JSON.parse(JSON.stringify(CHAIN)));
  const w2 = await walk(base({ CalledVia: '9015850944' }));
  ok(w2.rung.indexOf(OFFICE) < 0, 'CalledVia = the office line → office skipped', w2.rung);
  world(JSON.parse(JSON.stringify(CHAIN)));
  const w3 = await walk(base({ From: '+1' + WES }));
  ok(w3.rung.indexOf(WES) < 0 && w3.rung.length === 4, 'the caller\'s own number is skipped (Wesley calling in)', w3.rung);
  world(JSON.parse(JSON.stringify(CHAIN)));
  const w4 = await walk(base({ From: '+1' + OFFICE }));
  ok(w4.rung.indexOf(OFFICE) < 0 && SMS.length === 0 && leads().length === 0, 'the office line as caller ID: office not rung, no text / lead to our own line', { rung: w4.rung, sms: SMS.length });
}
console.log('CALLCHAIN — signature on every hop');
{
  world(JSON.parse(JSON.stringify(CHAIN)));
  const p = base();
  const r0 = await hit({ event: 'voice' }, p, { noSig: true }); ok(r0.statusCode === 403, 'voice without X-Twilio-Signature → 403');
  const r1 = await hit({ event: 'voice' }, p, { sig: sign(SITE + '?event=voice', p, 'wrong-token') }); ok(r1.statusCode === 403, 'voice signed with another token → 403');
  const p2 = Object.assign({}, p, { DialCallStatus: 'no-answer' });
  const r2 = await hit({ event: 'dialdone', step: '0' }, p2, { noSig: true }); ok(r2.statusCode === 403, 'dialdone hop without signature → 403');
  const r3 = await hit({ event: 'dialdone', step: '0' }, p2, { signUrl: SITE + '?event=dialdone' }); ok(r3.statusCode === 403, 'dialdone signed over a URL without &step → 403 (step is covered by the signature)');
  const r4 = await hit({ event: 'dialdone', step: '3' }, p2, { signUrl: SITE + '?event=dialdone&step=0' }); ok(r4.statusCode === 403, 'step tampered (signed for 0, sent 3) → 403');
  const r5 = await hit({ event: 'dialdone', step: '0' }, p2); ok(r5.statusCode === 200 && dials(r5.body)[0] === NICK, 'a correctly signed hop → the next number', r5.body);
  ok(MC._test.hookUrl('dialdone', 2) === SITE + '?event=dialdone&step=2', 'hookUrl builds the exact URL Twilio calls back');
  ok(SMS.length === 0, 'refused hops send nothing');
}
console.log('CALLCHAIN — Lead PM follows the Senior PM; fallbacks');
{
  world(JSON.parse(JSON.stringify(CHAIN)));
  setKv('gc_senior_pm', { email: 'pat@grayco-cs.com', id: 'u4', name: 'Pat Two' });
  const w = await walk(base());
  ok(JSON.stringify(w.rung) === JSON.stringify([OFFICE, NICK, WES, PM2]), 'Senior PM changed to Pat → Lead PM rings Pat; PM 2 (also Pat) is not rung twice', w.rung);
  world(JSON.parse(JSON.stringify(CHAIN)));
  setKv('gc_senior_pm', { none: true, email: '', id: '' });
  const wN = await walk(base());
  ok(wN.rung.indexOf(SENIOR) < 0 && wN.rung.length === 4, 'no Senior PM → Lead PM skipped', wN.rung);
  /* the CC preview / defaults */
  const d = CC.pinPeople(CC.defaults(), getKv('users'));
  ok(d.slots.map(x => x.id).join() === 'office,owner1,owner2,gm,leadpm' && d.slots[1].person === 'u1' && d.slots[2].person === 'u2', 'defaults: Office · Owner 1 = Nick · Owner 2 = Wesley · GM empty · Lead PM = Senior PM', d.slots);
  const pv = CC.preview(CHAIN, { users: getKv('users'), gc_senior_pm: { id: 'u3' } }, ['+19015550000']);
  ok(pv.list.length === 5 && pv.wait === 75 && pv.skipped.some(x => x.id === 'gm' && x.why === 'empty'), 'preview: 5 ring, 75 s wait, GM skipped (empty)', pv);
  /* nothing saved → old behaviour: TWILIO_RING_TO */
  world(undefined);
  process.env.TWILIO_RING_TO = '+19015552222';
  const r = await hit({ event: 'voice' }, base());
  ok(dials(r.body)[0] === '9015552222' && !/step=/.test(r.body) && !/please hold/.test(r.body), 'no saved call order → Netlify TWILIO_RING_TO as before', r.body);
  delete process.env.TWILIO_RING_TO;
  const r2 = await hit({ event: 'voice' }, base());
  ok(!dials(r2.body).length && SMS.length === 1, 'no call order, no TWILIO_RING_TO → a missed call at once (forwarded mode) as before');
  world(Object.assign(JSON.parse(JSON.stringify(CHAIN)), { on: false }));
  const r3 = await hit({ event: 'voice' }, base());
  ok(!dials(r3.body).length, 'call order turned off → old behaviour');
  /* a long list is walked to the end (each hop its own <Dial>) */
  const many = JSON.parse(JSON.stringify(CHAIN)); for (let i = 0; i < 8; i++) many.slots.push({ id: 'x' + i, label: 'PM ' + (i + 3), kind: 'phone', phone: '90155520' + String(10 + i) });
  world(many);
  const wl = await walk(base());
  ok(wl.rung.length === 13 && SMS.length === 1, 'a 13-number list is walked to the end, then one text', wl.rung.length);
}
console.log('CALLCHAIN — Admin → 📞 Call order (texts.js ?callchain=1)');
{
  world(undefined);
  const BI = require(path.join(SRC, 'bid-inbox.js')), TX = require(path.join(SRC, 'texts.js'));
  let WHO = { ok: true, email: 'owner@grayco-cs.com', name: 'Owner', role: 'admin', admin: true };
  BI._test.staffAuth = async () => WHO;
  const call = (m, body) => TX.handler({ httpMethod: m, headers: { origin: 'https://crm.grayco-cs.com' }, queryStringParameters: { callchain: '1' }, body: body ? JSON.stringify(body) : '' }).then(r => Object.assign({ code: r.statusCode }, JSON.parse(r.body)));
  process.env.TWILIO_RING_SECONDS = '20';
  const g = await call('GET');
  ok(g.ok && g.saved === false && g.settings.ringSeconds === 20, 'nothing saved: ring seconds start at Netlify TWILIO_RING_SECONDS (20)', g.settings);
  ok(g.settings.slots[1].person === 'u1' && g.people.length === 4 && g.preview.list.length === 4 && g.preview.wait === 80, 'defaults pinned to people; 4 ring now (GM empty), a caller waits up to 80 s', g.preview);
  const v = g.settings; v.ringSeconds = 12; v.slots.push({ id: 'x_pm2', label: 'PM 2', on: true, kind: 'person', person: 'u4' });
  const s1 = await call('POST', { settings: v });
  ok(s1.ok && s1.saved && getKv(CC.KEY).ringSeconds === 12 && getKv(CC.KEY).slots.length === 6 && getKv(CC.KEY).by === 'owner@grayco-cs.com', 'admin saves: the card value (12 s) wins over the env; PM 2 added', getKv(CC.KEY));
  const g2 = await call('GET'); ok(g2.saved && g2.settings.ringSeconds === 12 && g2.settings.slots[5].label === 'PM 2', 'read back as saved');
  WHO = Object.assign({}, WHO, { role: 'staff', admin: false });
  const n = await call('GET'); ok(n.code === 403, 'a non-admin cannot read or change the call order');
  delete process.env.TWILIO_RING_SECONDS;
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
