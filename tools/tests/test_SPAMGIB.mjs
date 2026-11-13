// test_SPAMGIB.mjs — patch SPAMGIB (offline): a bot's random-letter form never becomes a lead. Owner 11/02, a 10:45 AM text
// "GrayCo NEW LEAD: lOwirBRUMGvsiaemuM (916) 236-3869 — "aElwvnTekCEguDEsBXoSmdl Project location: Peuhzbszn"":
// "Seems like a lead that should've never reached me." It came in through the grayco-cs.com contact form (website-intake.js,
// "Commercial bid inquiry"): it passed the honeypot and the 3-second form token. Now: no lead, alert, text, auto-reply or
// first-e-mail approval; it waits in 🧹 Sales & spam with the reason "looks like a bot (random text)" — on every intake path
// SALESBLOCK covers (website form, leads@ e-mail, lead sources, texts, any new lead). Every real lead in the mirror passes.
// Mocks: Supabase REST (in-memory gc_kv; gc_lead_inbox_kv missing → gc_kv; gc_staff), Twilio, Resend.
// Usage: node tools/tests/test_SPAMGIB.mjs [functionsDir]   (SPAMGIB_REAL=<file.json>[,…] adds more real rows to check)
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../../netlify/functions'));
const TOKEN = 'fake-twilio-token-sg';
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com', WEBSITE_ZAPIER_KEY: 'zap-test', LEAD_KEY_THUMBTACK: 'ri-test' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'EMERG_OFF', 'ONCALL_OFF', 'LEAD_INTAKE_ALERTS', 'SALESBLOCK_SECRET', 'TWILIO_FROM_ALERTS', 'PORTAL_AUTO_EMAIL', 'WEBSITE_AUTO_REPLY', 'ROOFING_IGNITE_KEY'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }

const KV = new Map(), SMS = [], CALLS = [], MAIL = [];
const USERS_BY_TOKEN = { 'tok-owner': 'owner@grayco-cs.com', 'tok-office': 'office1@grayco-cs.com', 'tok-pm': 'pm@grayco-cs.com' };
const STAFF = { 'owner@grayco-cs.com': 'admin', 'office1@grayco-cs.com': 'admin', 'pm@grayco-cs.com': 'Project Manager' };
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => (KV.get(k) || {}).value;
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const t = String((init.headers || {}).Authorization || '').replace(/^Bearer\s+/, ''); const e = USERS_BY_TOKEN[t]; return e ? J(200, { email: e }) : J(401, {}); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').replace(/^eq\./, ''); return J(200, e ? (STAFF[e] ? [{ email: e, role: STAFF[e], active: true }] : []) : Object.keys(STAFF).map(x => ({ email: x, role: STAFF[x], active: true }))); }
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
  if (u.host === 'api.twilio.com') { const p = Object.fromEntries(new URLSearchParams(init.body)); if (/Calls/.test(u.pathname)) CALLS.push(p); else SMS.push(p); return J(201, { sid: 'SM' + (SMS.length + CALLS.length) }); }
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
const SG = require(path.join(SRC, '_lib/salesguard.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
const WEB = require(path.join(SRC, 'website-intake.js'));
const BI = require(path.join(SRC, 'bid-inbox.js'));
const DAY = Date.parse('2026-11-02T15:45:00Z');   /* 10:45 AM Central, the text */
const clock = () => DAY;
SG._now = clock; MC._now = clock; BI._now = clock;
const BOT = 'looks like a bot (random text)';

/* the two that reached the owner on 11/02 (prod, read-only: gc_approval_queue / leads) */
const EXACT = { type: 'commercial', service: 'A project (general contractor)', name: 'IOwirBRUMGvsiaemuM', email: 'y.ic.e.sax.i.t.o.v.6.4@gmail.com', phone: '(916) 236-3869',
  city: 'Peuhzbszn', message: 'aElwvnTekCEguDEsBXoSmdl\n\nProject location: Peuhzbszn', page: 'https://grayco-cs.com/contact', via: 'grayco-cs.com contact form' };
const MORNING = { type: 'commercial', service: 'A project (general contractor)', name: 'HCgtLDzCZAHdZwQbrSXj', company: 'Zlwghr LLC', email: 'l.even.iq.opar.8.1.7@gmail.com', phone: '(336) 257-1096',
  city: 'Gyzgfxunav', message: 'BjTOXnEQuRVhraHngv\n\nProject location: Gyzgfxunav', page: 'https://grayco-cs.com/contact' };
const f2b = f => ({ name: f.name, message: f.message, location: [f.address, f.city, f.state].filter(Boolean).join(', '), company: f.company, email: f.email });
/* 10 more bot-style forms */
const BOTS = [
  { name: 'lOwirBRUMGvsiaemuM', message: 'aElwvnTekCEguDEsBXoSmdl Project location: Peuhzbszn' },   /* as the text showed it */
  f2b(MORNING),
  { name: 'xKqPzLmWvRtY', message: 'BvNmQwErTyUiOpAs', location: 'Hjklzxcv' },
  { name: 'GtrhYbnUjmIk', company: 'WsxEdcRfvTgb', message: '' },
  { name: 'qwzxkjhgfd', message: 'pltrnbvcxz mnbvcx' },
  { name: 'JzHtKwLqPm', message: 'XcVbNmAsDfGhJk\n\nProject location: Qwrtzpl' },
  { name: 'Vxbqrtnm', message: 'Zqprwlkst', email: 'a.b.c.d.e.f.1.2@gmail.com' },
  { name: 'yRtUoPwQ', message: 'fJdKsLaHgF' },
  { name: 'MkLoPnBhUy', location: 'TrEwQaSdZx' },
  { name: 'bdfhjklmnp', message: 'zxcvbnmqwrt' },
  { name: 'KTgLmVxRzQwP', company: 'HnGbFvDcSx', email: 'x.y.z.q.r.t@gmail.com' },
  { name: 'DJSFhsdkfjhSDF', message: 'sdfkjhSDFKJHsdfkjh', location: 'XCVbnm, TN' }
];
/* real people: odd names, all caps, other languages, one-word messages — never a bot */
const PEOPLE = [
  { name: 'Jon Hirschfeld', location: '123 Knightsbridge Dr, Collierville, TN' }, { name: 'DeShawn McKinney', message: 'need a roof estimate' },
  { name: 'LaToya O\'Neal', message: 'ROOF LEAKING CALL ASAP' }, { name: 'MCDONALD', message: 'Thanks' }, { name: 'Jose Hernandez', message: 'Necesito un estimado para mi techo' },
  { name: 'Nguyen Thi Hoa', message: 'Hmmmmm' }, { name: 'Szczepanski', location: 'Strengths Cv' }, { name: 'Scruggs', location: 'Church St' }, { name: 'J', message: 'ok' },
  { name: 'JeNNifer Smith', message: 'call me' }, { name: 'Brzezinski', company: 'HVAC Pros LLC', message: 'iPhone pics attached' }, { name: 'eBay Seller', message: 'HomeAdvisor sent me' },
  { name: 'Pfeiffer', message: '' }, { name: 'Rhythm Rhodes', message: 'Lights out after storm' }, { name: 'kbrwn', email: 'john.a.smith@gmail.com' }, { name: 'Abcdefghij', message: 'Kitchen remodel' },
  { name: 'GrayCo test', message: 'RFP-2026-XQ7 BDGWHSTX plans at https://x.y/abcDEFghiJKL' }, { name: 'MacKenzie DiNapoli', location: 'Germantown' }
];

/* every real lead (and customer / job / first-e-mail approval) in the read-only mirrors */
const MIRRORS = ['/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wUPG/mirror/rows.json',
  '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json'].concat(String(process.env.SPAMGIB_REAL || '').split(',').filter(Boolean));
const KNOWN_BOTS = /2882790d25997f33|24ee7a5153261a3b/;   /* the two bots of 11/02 (only in a fresh prod copy) */
function realRows(){
  const S = v => v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  const out = [], seen = { files: 0 };
  const lead = (x, src) => { if (!x || typeof x !== 'object') return; const le = x.leadExtra || {}, c = x.contact && typeof x.contact === 'object' ? x.contact : {}, said = x.said || le.said || {};
    out.push({ src, id: S(x.id), name: S(x.contactName) || S(c.name) || S(x.name) || S(x.client), message: [said.message, x.message, x.scope, x.description, x.textBody, le.textBody].map(S).filter(Boolean)[0] || '',
      location: [x.address, x.city, x.state].map(S).filter(Boolean).join(', '), company: S(x.company) || S(said.company), email: S(x.email) || S(c.email) });
    if (S(x.name) && S(x.name) !== out[out.length - 1].name) out.push({ src, id: S(x.id) + '#name', name: S(x.name) }); };
  for (const f of MIRRORS) {
    if (!fs.existsSync(f)) continue; seen.files++;
    let d = JSON.parse(fs.readFileSync(f, 'utf8')); if (!Array.isArray(d)) d = Object.entries(d.rows || d).map(([key, value]) => ({ key, value }));
    for (const r of d) {
      let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} }
      if (['leads', 'customers', 'projects'].includes(r.key)) (Array.isArray(v) ? v : []).forEach(x => lead(x, r.key));
      if (r.key === 'gc_leads_deleted') (v && Array.isArray(v.leads) ? v.leads : []).forEach(x => lead(x, r.key));
      if (r.key === 'gc_claim_inbox') (Array.isArray(v) ? v : []).forEach(x => out.push({ src: r.key, id: S(x.id), name: S(x.from && x.from.name), message: S(x.text).slice(0, 3000), email: S(x.from && x.from.email) }));
      if (r.key === 'gc_approval_queue') (Array.isArray(v) ? v : []).filter(x => x && /lead/.test(S(x.kind))).forEach(x => { const m = /^Hi ([^,\n]+),/.exec(S(x.text));
        out.push({ src: r.key, id: S(x.id), name: m ? m[1] : S(x.jobName).replace(/^.*— /, ''), location: S(x.meta && x.meta.address), email: S(x.to) }); });
    }
  }
  return { rows: out, files: seen.files };
}

let ipN = 0;
const web = b => WEB.handler({ httpMethod: 'POST', headers: { 'x-api-key': 'zap-test', 'x-nf-client-connection-ip': '10.2.0.' + (++ipN) }, queryStringParameters: {}, body: JSON.stringify(b) });
const sms = (from, body) => MC._test.inboundSms({ From: '+1' + from, To: '+19015550000', Body: body, MessageSid: 'SM' + crypto.randomBytes(6).toString('hex') });
function world(){
  KV.clear(); SMS.length = 0; CALLS.length = 0; MAIL.length = 0;
  setKv('users', [{ id: 'u1', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', phone: '(901) 555-1001', active: true },
    { id: 'u2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', cell: '901-555-1002', active: true }]);
  setKv('projects', []); setKv('customers', []); setKv('leads', []); setKv('gc_job_messages', []); setKv('gc_office_tasks', []);
  try { WEB._test.reset(); } catch (e) {}
  SG._reset();
}
const listOf = k => { let v = getKv(k); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : (v && (v.list || v.v)) || []; };
const inbox = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub && x.status !== 'dismissed');
const held = () => SG.cleanStore(getKv(SG.SKEY)).list.filter(x => x.status === 'held');
const firstMail = () => listOf('gc_approval_queue').filter(x => x && x.kind === 'lead_first_contact');

(async () => {
  console.log('— 1. the detector');
  ok(SG.botWhy(f2b(EXACT)) === BOT, 'the exact 10:45 AM submission → "' + BOT + '"', SG.botWhy(f2b(EXACT)));
  BOTS.forEach((b, i) => ok(SG.botWhy(b) === BOT, 'bot ' + (i + 1) + ': ' + JSON.stringify(b).slice(0, 90)));
  PEOPLE.forEach(p => ok(!SG.botWhy(p), 'a person: ' + JSON.stringify(p).slice(0, 90)));
  ok(!SG.botWhy({}) && !SG.botWhy(null) && !SG.botWhy({ name: '', message: '' }), 'nothing typed → not a bot');

  console.log('— 2. every real lead in the mirror passes (zero false positives)');
  const R = realRows();
  const bad = R.rows.filter(r => !KNOWN_BOTS.test(r.id) && SG.botWhy(r));
  ok(R.files >= 1 && R.rows.length >= 300, 'real rows read: ' + R.rows.length + ' from ' + R.files + ' mirror file(s)', R.files);
  ok(bad.length === 0, 'no real lead / customer / job / approval is called a bot', bad.slice(0, 5));
  const harsh = R.rows.filter(r => !KNOWN_BOTS.test(r.id)).filter(r => [{ name: r.name, location: r.location, company: r.company, email: r.email }, { name: r.name, email: 'a.b.c.d.e@gmail.com' }, { name: r.location, email: 'a.b.c.d.e@gmail.com' }, { message: r.message, email: 'a.b.c.d.e@gmail.com' }].some(v => SG.botWhy(v)));
  ok(harsh.length === 0, 'even with the message left out, or one field alone + a dotted Gmail address: none', harsh.slice(0, 5));

  console.log('— 3. the website form (the path it came in on)');
  world();
  let r = await web(EXACT), b = JSON.parse(r.body);
  ok(r.statusCode === 200 && b.ok && b.received, 'the bot sees "received" (nothing to learn from)', b);
  ok(!inbox().length, 'no lead', inbox().map(x => x.title));
  ok(SMS.length === 0 && CALLS.length === 0 && MAIL.length === 0, 'no alert text, no call, no e-mail / auto-reply', { SMS, M: MAIL.map(x => x.subject) });
  ok(!firstMail().length && !listOf('gc_approval_queue').length, 'no first-e-mail approval', listOf('gc_approval_queue').map(x => x.kind));
  let h = held(); ok(h.length === 1 && h[0].why === BOT && h[0].via === 'website' && h[0].phone === '9162363869' && h[0].refile && h[0].refile.f, 'held in 🧹 Sales & spam: "' + BOT + '" (Not spam → make lead still works)', h);
  r = await web(MORNING);
  ok(!inbox().length && !SMS.length && !MAIL.length && held().length === 2 && held()[1].why === BOT, 'the 7:28 AM one too (same day, company "Zlwghr LLC")', held().map(x => x.name));
  r = await web({ type: 'commercial', service: 'A project (general contractor)', name: 'Dana Whitfield', company: 'Whitfield Dental', email: 'dana@whitfielddental.com', phone: '(901) 555-0177', city: 'Germantown', state: 'TN',
    message: 'Tenant build-out for a dental office, about 2,400 sq ft. Bid due Nov 14.\n\nProject location: Germantown, TN' });
  ok(inbox().length === 1 && firstMail().length === 1 && held().length === 2, 'control: a real commercial inquiry is still a lead with its first-e-mail approval', { i: inbox().map(x => x.title), a: firstMail().length });

  console.log('— 4. leads@ e-mail, lead sources, texts, any new lead');
  world();
  r = await WEB.fromEmail({ from: { email: 'x.y.z.q.r.t@gmail.com', name: '' }, subject: 'Inquiry', text: 'Name: KTgLmVxRzQwP\nPhone: 901-555-0199\nMessage: BvNmQwErTyUiOpAs', messageId: '<g1@x>' });
  ok(r.ignored && /salesblock/.test(r.ignored) && !inbox().length && !MAIL.length && held().some(x => x.via === 'email' && x.why === BOT), 'leads@ e-mail: a bot → no lead / alert; held', r);
  const LI = require(path.join(SRC, 'lead-intake.js'));
  const intake = x => LI.handler({ httpMethod: 'POST', headers: { 'x-api-key': 'ri-test', 'content-type': 'application/json' }, queryStringParameters: {}, body: JSON.stringify(x) });
  world();
  r = await intake({ name: 'yRtUoPwQ', phone: '901-555-0188', email: 'q.w.e.r.t.y@gmail.com', notes: 'fJdKsLaHgF', address: 'TrEwQaSdZx' }); b = JSON.parse(r.body);
  ok(b.held && !b.stored && !listOf('gc_approval_queue').length && !SMS.length && !MAIL.length && held().some(x => x.why === BOT), 'lead source: a bot → no first e-mail / text / alert; held', { b, n: SMS.length + MAIL.length });
  world();
  r = await sms('9015550187', 'aElwvnTekCEguDEsBXoSmdl');
  ok(r.salesblock && SMS.length === 0 && MAIL.length === 0 && held().some(x => x.via === 'sms' && x.why === BOT), 'a text of random letters → no reply, lead or alert; held', { r: r.salesblock, SMS });
  world();
  r = await sms('9015550186', 'Hmmmmm ok');
  ok(!r.salesblock && r.newLead, 'control: a short real text is still a lead', r);
  /* any new lead before it alerts (bid-alerts notifyNew → screenLeads): a website "Commercial bid inquiry" is screened too */
  world();
  const SGm = SG.make({ kvGet: async k => getKv(k), kvCas: async (k, fn) => { const v = fn(getKv(k)); if (v !== undefined) setKv(k, v); return v; } });
  const botLead = { id: 'LEADIN-2882790d25997f33', type: 'commercial', leadKind: 'commercial', title: 'Commercial bid inquiry — Zlwghr LLC — Gyzgfxunav', city: 'Gyzgfxunav',
    contact: { name: 'HCgtLDzCZAHdZwQbrSXj', email: 'l.even.iq.opar.8.1.7@gmail.com', phone: '(336) 257-1096' }, said: { message: 'BjTOXnEQuRVhraHngv\nProject location: Gyzgfxunav', company: 'Zlwghr LLC' } };
  const realLead = { id: 'LI-real1', type: 'commercial', title: 'Commercial bid inquiry — Whitfield Dental', contact: { name: 'Dana Whitfield', phone: '(901) 555-0177' }, said: { message: 'Tenant build-out, bid due Nov 14' } };
  setKv('gc_lead_inbox', [botLead, realLead].map(x => Object.assign({ status: 'new' }, x)));
  let sc = await SGm.screenLeads([botLead, realLead, Object.assign({}, botLead, { id: 'LI-ns', leadExtra: { notSpam: true } })], { inboxKey: 'gc_lead_inbox' });
  ok(sc.drop.length === 1 && sc.drop[0] === botLead.id && sc.why[botLead.id] === BOT, 'any new lead: the bot lead is dropped before it alerts (a commercial / bid kind too); the real one and a "not spam" one go on', sc);
  ok((getKv('gc_lead_inbox') || []).find(x => x.id === botLead.id).status === 'dismissed' && (getKv('gc_lead_inbox') || []).find(x => x.id === 'LI-real1').status === 'new', 'the bot lead leaves the Lead Inbox (dismissed by the Sales & spam filter)');
  /* a "Not spam" sender is never filtered again */
  world();
  await SG.def().allow({ phone: '9162363869' }, 'owner@grayco-cs.com'); SG._reset();
  r = await web(Object.assign({}, EXACT));
  ok(inbox().length === 1 && !held().length, 'a sender marked "Not spam" is let through', { i: inbox().length, h: held().length });

  console.log('— 5. the page (index.html)');
  const html = path.resolve(SRC, '../../index.html');
  if (fs.existsSync(html)) {
    const page = fs.readFileSync(html, 'utf8'), lib = fs.readFileSync(path.join(SRC, '_lib/salesguard.js'), 'utf8');
    const rules = s0 => { const a0 = s0.indexOf('/* RULES-BEGIN'), b0 = s0.indexOf('/* RULES-END */'); return a0 >= 0 && b0 > a0 ? s0.slice(a0, b0) : ''; };
    ok(rules(page) === rules(lib) && rules(lib).indexOf('function sgBotWhy(') >= 0, 'index.html carries the same rules block, with the bot detector');
    ok(page.split('/* patch SPAMGIB */').length === 2 && page.indexOf('🤖 Looks like a bot (random text)') > 0 && page.indexOf('🚫 Not a real lead — block sender') > 0, 'the lead drawer: "🤖 Looks like a bot" + "🚫 Not a real lead — block sender" on a lead that already came in');
    const W = {}; new Function('W', rules(lib) + '\nW.b = sgBotWhy;')(W);
    ok(W.b(f2b(EXACT)) === BOT && !W.b(PEOPLE[1]), 'the page copy runs on its own (ES5) and agrees');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
