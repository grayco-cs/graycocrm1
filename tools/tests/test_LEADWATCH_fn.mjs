// test_LEADWATCH_fn.mjs [worktree] — patch LEADWATCH (owner 11/19: "I need to make sure all my leads don't get ignored, get sent to PM etc.").
// Node only; everything is mocked (Supabase REST: an in-memory gc_kv, gc_lead_inbox_kv missing → gc_kv; Twilio / Resend: recorded, never
// sent). Made-up people, numbers and leads; Owner 1 / Owner 2 by role (the earliest-created admins). A stubbed clock.
//   1. the rule (_lib/lead-watch.js): what a customer lead is (LSA, website — a commercial website inquiry too —, phone / text / missed
//      call, referral, a lead source, a lead the office typed in) and what is not (a prime bid from a city's bid postings, a plan room /
//      bid board / GC invitation, a "Referral" from the old Bid Board with a GC, a permit, RoofScout, a job copy); the clock at 3:59 / 4 h /
//      24 h / 24 h after assignment / 48 h; "contacted" (stage, ✅ Contacted, a logged call; on LSA the PM's own 👍 — not the owner's GOOD);
//      the assignment time is the earliest stamp (an import that re-stamps assignedAt does not reset the clock)
//   2. bid routing: the City of Bartlett posting → the Estimator role only, "GrayCo BID INVITE: Generator-Animal Shelter for City of
//      Bartlett …", never the owners, never "NEW LEAD: Unknown"; a website commercial inquiry → the owners (not the estimator)
//   3. the chain on a stubbed clock (bid-alerts speedToLead): the first run only takes note; no PM at 4 h → the owners' text "👤 assign"
//      (once); 24 h → again; assigned → the PM's GrayCo lead text (name, number, what they asked, the CRM link) once; 24 h after it was
//      assigned and not contacted → the PM's "⏰ reach out"; 48 h → the owners "⚠️ <PM> has not contacted"; contacted → silence;
//      quiet hours: nothing at 10 PM, it goes at 7 AM; a phone lead the office typed in is on the clock; a bid invite never is; an LSA lead
//      the owner marked GOOD still reminds the PM, the PM's own 👍 stops it; data-entry mode does not stop these staff texts
//   4. a bid invite's own due reminder: 1 hour before → the estimator's text, not the owners
//   5. the 5 PM default assign (bid-inbox releaseHolds → defaultAssign): a website lead nobody assigned → Owner 2 at 5 PM (not at 4:59)
//      + the GrayCo lead text; a held Google lead → its suggested PM + the LSA text; a bid / an emergency / a lead the CRM already
//      assigned are left alone; ⚡ "5 PM lead auto-assign" OFF → nothing
//   LEADWATCH owner decisions (later 11/19): a PRIME bid → the owners as a lead ("GrayCo PRIME BID <code>: …"), a SUB bid → the CRM only;
//      24 h with no PM → the office role (text + "👤 Assign a PM" To-Do); 7. an owner's bare GOOD → that owner is the PM (suggested self);
//      8. the PM's free reply → the lead's / job's notes + "Saved to <name> notes. Open: <job or lead>"; "not a good lead" → the bad path
//   6. nobody outside GrayCo is texted except the switched customer texts (qualify ask, "a PM will reach out shortly")
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WT = path.resolve(process.argv[2] || path.join(HERE, '../..'));
const SRC = path.join(WT, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok-leadwatch', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com', CUST_QUIET_OFF: '1' });
['OWNER_EMAILS', 'ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'EMERG_OFF', 'ONCALL_OFF', 'SMS_ALERTS_OFF', 'TWILIO_FROM_ALERTS', 'SPEED_TO_LEAD_OFF', 'BID_ALERTS_OFF', 'LEAD_HOLD', 'LEAD_DEFAULT_ASSIGN', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 1400) : '')); } }

const KV = new Map(), SMS = [], MAIL = [], ALL = [];
const EM = { o1: 'ann.owner@grayco-cs.com', o2: 'ben.owner@grayco-cs.com', pat: 'pat@grayco-cs.com', off: 'olive@grayco-cs.com', est: 'eddie@grayco-cs.com' };
const STAFF = { [EM.o1]: ['admin', 'Ann Owner'], [EM.o2]: ['admin', 'Ben Owner'], [EM.off]: ['office', 'Olive Office'], [EM.pat]: ['Project Manager', 'Pat Miller'], [EM.est]: ['Estimator', 'Eddie Est'] };
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => { const v = (KV.get(k) || {}).value; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') { const row = x => ({ email: x, role: STAFF[x][0], active: true, name: STAFF[x][1] }); return J(200, Object.keys(STAFF).map(row)); }
    if (u.pathname === '/rest/v1/gc_kv') {
      const kq = u.searchParams.get('key') || '';
      if (m === 'GET') {
        if (kq.startsWith('in.(')) { const keys = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return J(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k).value, updated_at: KV.get(k).updated_at }))); }
        const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r.value, updated_at: r.updated_at }] : []);
      }
      const body = JSON.parse(init.body || '{}'), key = kq.replace(/^eq\./, '');
      if (m === 'PATCH') { const r = KV.get(key), at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || (at && r.updated_at !== at)) return J(200, []); KV.set(key, { value: body.value, updated_at: body.updated_at }); return J(200, [{ key }]); }
      if (m === 'POST') { (Array.isArray(body) ? body : [body]).forEach(b => KV.set(b.key, { value: b.value, updated_at: b.updated_at || new Date().toISOString() })); return J(201, null); }
    }
    return J(200, []);
  }
  if (u.host === 'api.twilio.com') { const p = Object.fromEntries(new URLSearchParams(init.body)); SMS.push(p); ALL.push(p); return J(201, { sid: 'SM' + SMS.length }); }
  if (u.host === 'api.resend.com') { try { MAIL.push(JSON.parse(init.body)); } catch (e) {} return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
const AUTO = require(path.join(SRC, '_lib/automations.js'));
let AUTO_ON = Object.assign(AUTO.defaults(), { staff_text_alerts: true });   /* the real defaults (lead_auto_assign ON, NOCUSTTEXT: no customer texts) */
AUTO._t.setStore({ get: async k => k === AUTO.KEY ? AUTO_ON : null, put: async () => true });
const LW = require(path.join(SRC, '_lib/lead-watch.js'));
const LH = require(path.join(SRC, '_lib/lead-hold.js'));
const SA = require(path.join(SRC, '_lib/smsalert.js'));
const BI = require(path.join(SRC, 'bid-inbox.js'));
let T = Date.now(); const clock = () => T;
SA._D.now = clock; BI._now = clock;
try { require(path.join(SRC, 'missed-call.js'))._now = clock; } catch (e) {}

const O1 = '9015552001', O2 = '9015552002', PAT = '9015552003', OFF = '9015552004', EST = '9015552005';
const CUST = ['9015557001', '9015557002', '9015557003', '9015557004', '9015557005', '9015557006'];
const USERS = [
  { id: 'u-pat', name: 'Pat Miller', email: EM.pat, role: 'Project Manager', cell: PAT, active: true, createdAt: '2022-01-01T12:00:00Z' },
  { id: 'u-ben', name: 'Ben Owner', email: EM.o2, role: 'Admin', cell: O2, active: true, createdAt: '2020-06-01T12:00:00Z' },
  { id: 'u-ann', name: 'Ann Owner', email: EM.o1, role: 'Admin', cell: O1, active: true, createdAt: '2019-01-01T12:00:00Z' },
  { id: 'u-off', name: 'Olive Office', email: EM.off, role: 'Office', cell: OFF, active: true },
  { id: 'u-est', name: 'Eddie Est', email: EM.est, role: 'Estimator', cell: EST, active: true }];
function world(){ KV.clear(); SMS.length = 0; MAIL.length = 0; setKv('users', USERS); setKv('leads', []); setKv('gc_office_tasks', []); setKv('gc_lead_inbox', []); }
const H = 3600e3, iso = ms => new Date(ms).toISOString();
const THU10 = Date.parse('2026-11-19T16:00:00Z');   /* Thu 10:00 AM Central */
const toPh = d => SMS.filter(x => String(x.To).replace(/\D/g, '').endsWith(d));
const custSms = () => ALL.filter(x => CUST.some(c => String(x.To).replace(/\D/g, '').endsWith(c)));
const staffPh = [O1, O2, PAT, OFF, EST];
const CUST_OK = /this is GrayCo Construction Services\. We (got|received) your request|A project manager will reach out to you shortly\./;   /* CUSTTEXT2: the qualify ask and the GOOD text are the only customer texts */
const custOther = () => custSms().filter(x => !CUST_OK.test(x.Body));
const onlyStaff = () => ALL.every(x => staffPh.some(p => String(x.To).replace(/\D/g, '').endsWith(p)));

/* made-up leads in the CRM's shape */
const web = (id, n, o) => Object.assign({ id, name: 'Website lead — Cus Tomer' + n, source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', contactName: 'Cus Tomer' + n,
  phone: '(901) 555-' + CUST[n].slice(-4), createdAt: iso(T), leadKind: 'Residential', said: { message: 'Roof leak over the kitchen' } }, o || {});
const BARTLETT = { id: 'LI-a3dfebd4', title: 'Generator-Animal Shelter', source: 'City of Bartlett', origin: 'watch', type: 'Government', leadKind: 'Government', bidRole: 'prime', bidRoleWhy: 'came from City of Bartlett (a public owner)',
  owner: 'City of Bartlett', city: 'Bartlett', state: 'TN', bidDue: '2026-12-03T14:00', bidNumber: 'FY2027-11-009', scope: 'INVITATION FOR SEALED BIDS — install a 60KW diesel generator at the Animal Shelter', contact: {}, sources: [{ name: 'City of Bartlett' }] };

(async () => {
  console.log('1. the rule (_lib/lead-watch.js)');
  T = THU10;
  const K = l => LW.kindOf(l);
  ok(K({ source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } }) === 'lsa' && K(web('W', 0)) === 'website' && K(web('W', 0, { leadKind: 'Commercial', type: 'Commercial Reno', websiteForm: 'Commercial bid inquiry' })) === 'website', 'Google LSA · website · a website commercial inquiry is still a website (customer) lead');
  ok(K({ source: 'Phone call', type: 'Residential Reno', createdBy: 'Office person' }) === 'phone' && K({ source: 'Text message', leadExtra: { textMessage: true } }) === 'phone' && K({ source: 'Missed call', leadExtra: { missedCall: true } }) === 'phone', 'a phone call the office typed in · a text · a missed call → phone');
  ok(K({ source: 'Referral', leadKind: 'Residential', inboxId: 'LI-1' }) === 'referral' && K({ source: 'Roof Ignite' }) === 'source' && K({ source: 'Walk-in', stage: 'New Lead' }) === 'other', 'referral · a lead source · any other lead → customer');
  ok(K(BARTLETT) === 'bid' && K({ source: 'MR plan room', origin: 'watch', leadKind: 'Commercial', bidRole: 'prime' }) === 'bid' && K({ source: 'BuildingConnected', gc: 'Big GC', leadKind: 'Commercial', origin: 'email' }) === 'bid', 'the City of Bartlett posting · a plan room · a GC\'s BuildingConnected invite → bid');
  ok(K({ source: 'Referral', gc: 'Cool Roofs', fromBidBoard: 'BID1', leadKind: 'Commercial', bidDue: '2026-05-13' }) === 'bid', 'an old Bid Board item whose source says "Referral" but has a GC → bid');
  ok(K({ source: 'Permit (Nashville)', permitId: 'P1' }) === 'permit' && K({ id: 'LEAD_RS_1', source: 'RoofScout' }) === 'roofscout' && K({ source: 'CompanyCam', fromProjectId: 'P1' }) === 'job' && K({ softLead: true, origin: 'website' }) === 'soft', 'permit · RoofScout · a job copy · a soft lead → not customer leads');
  const L0 = web('R0', 0, { createdAt: iso(T) });
  ok(LW.risk(L0, T + 4 * H - 60e3) === null && LW.risk(L0, T + 4 * H).k === 'nopm' && LW.risk(L0, T + 24 * H).k === 'nopm24', 'no PM: nothing at 3:59, "nopm" at 4 h, "nopm24" at 24 h');
  const A0 = web('R1', 1, { createdAt: iso(T - 30 * H), pm: 'Pat Miller', pmEmail: EM.pat, assignedAt: iso(T) });
  ok(LW.risk(A0, T + 24 * H - 60e3) === null && LW.risk(A0, T + 24 * H).k === 'pm24' && LW.risk(A0, T + 48 * H).k === 'pm48', 'assigned: nothing at 23:59, "pm24" at 24 h, "pm48" at 48 h after the assignment');
  ok(LW.risk(Object.assign({}, A0, { contactedAt: iso(T + H) }), T + 50 * H) === null && LW.risk(Object.assign({}, A0, { stage: 'Contacted' }), T + 50 * H) === null && LW.risk(Object.assign({}, A0, { activity: [{ at: iso(T + H), by: 'Pat Miller', type: 'call', text: 'Called, left VM' }] }), T + 50 * H) === null, 'contacted: ✅ Contacted, the stage, a call the PM logged');
  ok(LW.risk(Object.assign({}, A0, { activity: [{ at: iso(T + H), by: 'GrayCo text', text: '📱 texted Pat Miller (lead assigned)' }] }), T + 50 * H).k === 'pm48', 'the CRM\'s own "texted …" line is not contact');
  const LS = { id: 'LEADIN-ls1', source: 'Google LSA', stage: 'New Lead', createdAt: iso(T - 30 * H), pm: 'Pat Miller', pmEmail: EM.pat, assignedAt: iso(T), lsaCheck: 'good', lsaDecidedBy: 'Ann Owner (text)' };
  ok(LW.risk(LS, T + 25 * H).k === 'pm24' && LW.risk(Object.assign({}, LS, { lsaPmOkAt: iso(T + H), lsaDecidedBy: 'Pat Miller' }), T + 25 * H) === null && LW.risk(Object.assign({}, LS, { lsaCheck: 'bad' }), T + 25 * H) === null, 'LSA: the owner\'s GOOD (assigning) still leaves the PM\'s call open; the PM\'s own 👍 / a BAD closes it');
  ok(LW.asgAt(web('X', 0, { assignedAt: iso(T + 10 * H), hold: { state: 'auto', doneAt: iso(T) } })) === T, 'an import that re-stamps assignedAt does not reset the clock (the earliest stamp)');
  ok(LW.risk(Object.assign({}, BARTLETT, { createdAt: iso(T - 60 * H) }), T) === null && LW.atRisk([BARTLETT, L0], [], T + 5 * H).length === 1, 'a bid invite is never "at risk" (its due date is the estimator\'s)');
  ok(LW.atRisk([web('Old', 2, { createdAt: iso(T - 40 * 864e5) })], [], T).length === 0, 'the card looks back 30 days');

  console.log('2. bid routing');
  world(); T = THU10;
  let r = await SA.leads([Object.assign({ key: 'LEADIN-a3dfebd4' }, BARTLETT)], { [BARTLETT.id]: BARTLETT }, () => false);
  /* owner decision 11/19: GrayCo is the PRIME on the city's sealed bid → the owners as a lead, with a proper title; a SUB bid → the CRM only */
  const ob = (toPh(O1)[0] || {}).Body || '';
  ok(/^GrayCo PRIME BID [A-Z0-9]{4}: Generator-Animal Shelter for City of Bartlett · Bartlett, TN · due /.test(ob) && toPh(O2).length === 1 && /Reply GOOD [A-Z0-9]{4} \/ BAD/.test(ob), 'the City of Bartlett posting (prime) → Owner 1 / Owner 2: "GrayCo PRIME BID <code>: Generator-Animal Shelter for City of Bartlett …"', ob);
  ok(!SMS.some(x => /NEW LEAD: Unknown/.test(x.Body)) && !toPh(EST).length, 'never "NEW LEAD: Unknown"; not the estimator', SMS);
  SMS.length = 0;
  const SUB = { id: 'LI-sub1', title: 'Five Guys fit-out', source: 'BuildingConnected', origin: 'email', type: 'Commercial', leadKind: 'Commercial', bidRole: 'sub', gc: 'Big GC LLC', bidDue: '2026-12-01', contact: { name: 'GC PM', phone: '(901) 555-7001' } };
  await SA.leads([Object.assign({ key: 'LEADIN-sub1' }, SUB)], { [SUB.id]: SUB }, () => false);
  ok(!SMS.length, 'a SUB bid (a GC\'s BuildingConnected invitation) → the CRM only, no texts', SMS);
  SMS.length = 0;
  const WC = { id: 'LI-wc1', title: 'Commercial bid inquiry — Acme Shops', source: 'Website (grayco-cs.com)', origin: 'website', type: 'Commercial', websiteLead: true, contact: { name: 'Cora Shop', phone: '(901) 555-7006' }, leadExtra: { websiteForm: 'Commercial bid inquiry', websiteLead: true } };
  await SA.leads([Object.assign({ key: 'LEADIN-wc1' }, WC)], { [WC.id]: WC }, () => false);
  ok(toPh(O1).length === 1 && toPh(O2).length === 1 && !toPh(EST).length && /GrayCo website lead/.test(toPh(O1)[0].Body), 'a website commercial inquiry → the owners as a customer lead (not the estimator as a bid)', SMS.map(x => [x.To, x.Body.slice(0, 60)]));
  ok(!custOther().length, 'nothing else to the customer (the qualify ask only)', custSms());

  console.log('3. the chain on a stubbed clock');
  world(); T = THU10;
  const A = BI._lib.alertsApi();
  let W1 = web('LEADIN-w1', 1, { inboxId: 'LI-w1' }), PH1 = web('LEADph1', 2, { source: 'Phone call', origin: '', websiteLead: false, createdBy: 'Olive Office', leadKind: 'Residential', name: 'Johnson', contactName: 'Jo Johnson' });
  delete PH1.said;
  const BID = Object.assign({}, BARTLETT, { id: 'LEADIN-b1', name: BARTLETT.title, createdAt: iso(T), estimator: 'Eddie Est', estimatorEmail: EM.est });
  const src = () => ({ leads: [W1, PH1, BID], items: [], tombs: {} });
  await A.loadPeople(USERS);
  let s1 = await A.speedToLead(src(), T + 60e3);
  ok(s1.first && !SMS.length, 'the first run only takes note (nothing sent)', s1);
  T += 4 * H - 60e3; await A.speedToLead(src(), T);
  ok(!SMS.length, '3:59 → nothing', SMS);
  T += 60e3; let s2 = await A.speedToLead(src(), T);
  const a1 = toPh(O1).map(x => x.Body), a2 = toPh(O2).map(x => x.Body);
  ok(a1.length === 2 && a2.length === 2 && a1.every(b => /^GrayCo: 👤 assign /.test(b) && /has no PM/.test(b)), '4 h, no PM → both owners texted "👤 assign …" (the website lead and the phone lead the office typed in)', { a1, s2 });
  ok(a1.some(b => /Phone call lead .*Jo Johnson/.test(b)) && a1.some(b => /Reply GOOD [A-Z0-9]{4} <PM>/.test(b)), 'the phone lead is on the clock too; an inbox lead says "Reply GOOD <code> <PM>"', a1);
  ok(!toPh(EST).length && !toPh(PAT).length && !SMS.some(x => /Generator/.test(x.Body)), 'the bid invite is not on the clock', SMS.map(x => x.Body.slice(0, 50)));
  SMS.length = 0; T += 10 * 60e3; await A.speedToLead(src(), T);
  ok(!SMS.length, 'once (the next 10-minute run sends nothing)');
  T = THU10 + 24 * H; await A.speedToLead(src(), T);
  const of24 = toPh(OFF).map(x => x.Body), ot = (getKv('gc_office_tasks') || []).filter(x => /^LWASG_/.test(x.id));
  ok(!toPh(O1).length && of24.length === 2 && of24.every(b => /^GrayCo: 👤 please assign .*came in 24 h ago and the owners have not given it to a PM/.test(b)), 'owner decision: 24 h and the owners have not assigned it → the OFFICE role is texted', { of24, o1: toPh(O1) });
  ok(ot.length === 2 && ot.every(x => /^👤 Assign a PM: / .test(x.label) && !x.done), '… and gets an office To-Do "👤 Assign a PM" for each', ot);
  ok(of24.some(b => /Reply GOOD [A-Z0-9]{4} <PM>/.test(b)), 'the office can answer GOOD <code> <PM> like an owner (inbox lead)', of24);
  SMS.length = 0;
  /* assigned to Pat (in the CRM) → Pat's GrayCo lead text, once */
  T = THU10 + 25 * H; W1 = Object.assign({}, W1, { pm: 'Pat Miller', pmEmail: EM.pat, assignedAt: iso(T), assignedBy: 'Ann Owner' }); PH1 = Object.assign({}, PH1, { contactedAt: iso(T), stage: 'Contacted' });
  const n1 = await A.notifyAssigned(W1, { by: EM.o1 });
  const pt = (toPh(PAT)[0] || {}).Body || '';
  ok(/^GrayCo: GrayCo website lead [A-Z0-9]{4} for you from Ann: Cus Tomer1 📞 \(901\) 555-7002/.test(pt) && /CRM: crm\.grayco-cs\.com\/#leads&lead=LEADIN-w1/.test(pt) && /Roof leak over the kitchen/.test(pt), 'assigned → Pat gets the GrayCo lead text: name, 📞 number, what they asked, the CRM link', { pt, n1 });
  ok(!MAIL.some(m => (m.to || []).concat(m.to).includes(EM.pat)), 'texted → no e-mail to Pat for it (TEXTFIRST)', MAIL.map(m => m.to));
  SMS.length = 0; await A.notifyAssigned(W1, { by: EM.o1 }); await SA.assigned({ key: 'LEADIN-w1', assignee: 'Pat Miller', assigneeEmail: EM.pat, title: W1.name }, W1);
  ok(!toPh(PAT).length, 'once per lead and PM');
  T += 23 * H + 59 * 60e3; MAIL.length = 0; await A.speedToLead(src(), T);
  ok(!toPh(PAT).length && !toPh(O1).length, '23:59 after the assignment → no text (the 4 h reminder is an e-mail to Pat)', { sms: SMS, mail: MAIL.map(m => m.subject) });
  ok(!MAIL.some(m => /⏰ Reach out: /.test(m.subject) && [].concat(m.to).includes(EM.pat)), 'QUIETSAT: this is Saturday 11 AM — the 4 h reach-out e-mail to Pat is held (no Saturday notifications)', MAIL.map(m => [m.subject, m.to]));
  T += 60e3; await A.speedToLead(src(), T);
  ok(!toPh(PAT).length && !toPh(O1).length, 'QUIETSAT: Saturday — the 24 h "reach out" text is held, nothing sent', SMS);
  SMS.length = 0; T = THU10 + 25 * H + 48 * H; await A.speedToLead(src(), T);
  ok(!toPh(O1).length && !toPh(O2).length, 'QUIETSAT (owner 11/22): the 48 h "<PM> has not contacted" alert is never sent to the owners', SMS);
  SMS.length = 0; W1 = Object.assign({}, W1, { contactedAt: iso(T) }); T += 24 * H; await A.speedToLead(src(), T);
  ok(!SMS.length, 'contacted → nothing more');
  /* quiet hours: 4 h after a 6 PM lead is 10 PM → held; 7:10 AM → sent */
  world(); T = Date.parse('2026-11-20T00:00:00Z');   /* Thu 6 PM Central */
  const A2 = BI._lib.alertsApi(); await A2.loadPeople(USERS);
  let Q1 = web('LEADIN-q1', 3, { inboxId: 'LI-q1' }); const srcQ = () => ({ leads: [Q1], items: [], tombs: {} });
  await A2.speedToLead(srcQ(), T + 60e3);
  T += 4 * H; await A2.speedToLead(srcQ(), T);
  ok(!SMS.length, 'quiet hours: 10 PM → nothing', SMS);
  T = Date.parse('2026-11-20T13:10:00Z'); await A2.speedToLead(srcQ(), T);
  ok(toPh(O1).length === 1 && /👤 assign/.test(toPh(O1)[0].Body), '7:10 AM → the owners get it', SMS);
  /* LSA: the owner's GOOD while assigning still reminds the PM; the PM's own 👍 does not */
  world(); T = THU10; const A3 = BI._lib.alertsApi(); await A3.loadPeople(USERS);
  let LS1 = { id: 'LEADIN-ls1', inboxId: 'LI-ls1', name: 'Google LSA call', source: 'Google LSA', stage: 'New Lead', contactName: 'Lou Sa', phone: '(901) 555-7005', createdAt: iso(T), pm: 'Pat Miller', pmEmail: EM.pat, assignedAt: iso(T), lsaCheck: 'good', lsaDecidedBy: 'Ann Owner (text)', lsaVia: 'text' };
  let LS2 = Object.assign({}, LS1, { id: 'LEADIN-ls2', inboxId: 'LI-ls2', contactName: 'Lia Sb', lsaPmOkAt: iso(T + H), lsaDecidedBy: 'Pat Miller' });
  await A3.speedToLead({ leads: [LS1, LS2] }, T + 60e3);
  T += 24 * H; await A3.speedToLead({ leads: [LS1, LS2] }, T);
  const lp = toPh(PAT).map(x => x.Body);
  ok(lp.length === 1 && /Google LSA lead [A-Z0-9]{4} Lou Sa/.test(lp[0]) && /reply BAD [A-Z0-9]{4} <why>/.test(lp[0]), 'LSA: the owner\'s GOOD (assigning) → Pat is still reminded (with "reply BAD <code>"); his own 👍 → no reminder', lp);
  /* data-entry mode does not stop the staff texts */
  world(); T = THU10; setKv('gc_automation_pause', { on: true, at: iso(T) }); const A4 = BI._lib.alertsApi(); await A4.loadPeople(USERS);
  const D1 = web('LEADIN-d1', 4, { inboxId: 'LI-d1' });
  await A4.speedToLead({ leads: [D1] }, T + 60e3); T += 4 * H; await A4.speedToLead({ leads: [D1] }, T);
  ok(toPh(O1).length === 1, '⏸ data-entry mode on → the owners\' "assign" text still goes (staff only)', SMS);
  ok(/staff/.test(require('fs').readFileSync(path.join(SRC, '_lib/pause.js'), 'utf8')) && !custOther().length, 'data-entry mode lets staff-tagged texts through; the customer texts are only the switched ones (and pause.js blocks those)');

  console.log('4. a bid invite\'s due reminder');
  world(); T = Date.parse('2026-12-03T19:00:00Z');   /* Thu Dec 3, 1:00 PM Central — the bid is due 2:00 PM */
  const A5 = BI._lib.alertsApi(); await A5.loadPeople(USERS);
  const BD1 = Object.assign({}, BARTLETT, { id: 'LEADIN-b1', name: BARTLETT.title, createdAt: iso(T - 20 * 864e5), estimator: 'Eddie Est', estimatorEmail: EM.est, dueToCompany: 'City of Bartlett', submitMethod: 'sealed' });
  const rr = await A5.remind({ leads: [BD1], items: [], tombs: {}, users: USERS });
  const bt = (toPh(EST)[0] || {}).Body || '';
  ok(/^GrayCo ⏰ BID DUE IN 1 HOUR: Generator-Animal Shelter — .* to City of Bartlett/.test(bt) && !toPh(O1).length && !toPh(O2).length, 'due in 1 hour → the estimator\'s text, not the owners', { bt, rr: rr && rr.list, sms: SMS });

  console.log('5. the 5 PM default assign');
  world(); T = THU10;
  const IT = (id, n, o) => Object.assign({ id, title: 'Website lead — Cus Tomer' + n, source: 'Website (grayco-cs.com)', origin: 'website', type: 'Residential', status: 'new', receivedAt: iso(T), contact: { name: 'Cus Tomer' + n, phone: '(901) 555-' + CUST[n].slice(-4) },
    leadExtra: { websiteLead: true, websiteForm: 'Free estimate', said: { message: 'Need a new roof' } } }, o || {});
  const items = [IT('LI-d5', 5), IT('LI-ls9', 0, { title: 'Google LSA call', source: 'Google LSA', origin: '', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaJob: 'Roofing' },
      hold: { state: 'held', name: 'Pat Miller', email: EM.pat, field: 'pm', label: 'Roofing PM', k: 'roofing', until: iso(Date.parse('2026-11-19T23:00:00Z')), at: iso(T) } }),
    Object.assign({}, BARTLETT, { status: 'new', receivedAt: iso(T) }), IT('LI-em1', 1, { emergency: true, title: 'Burst pipe' }), IT('LI-crm1', 2)];
  setKv('gc_lead_inbox', items);
  const crm = [{ id: 'LEADIN-crm1', inboxId: 'LI-crm1', name: 'x', pm: 'Pat Miller', pmEmail: EM.pat, stage: 'New Lead' }];
  T = Date.parse('2026-11-19T22:59:00Z'); let d0 = await BI._lib.defaultAssign(crm);
  ok(!d0.assigned && !SMS.length, '4:59 PM → nothing yet', d0);
  T = Date.parse('2026-11-19T23:01:00Z'); AUTO_ON = Object.assign({}, AUTO_ON, { lead_auto_assign: false }); AUTO._t.reset(); let d1 = await BI._lib.defaultAssign(crm);
  ok(!d1.assigned && d1.held && !SMS.length, '⚡ 5 PM lead auto-assign OFF → nothing (held: would have done N)', d1);
  AUTO_ON = Object.assign({}, AUTO_ON, { lead_auto_assign: true }); AUTO._t.reset();
  let d2 = await BI._lib.defaultAssign(crm);
  const ib = getKv('gc_lead_inbox'), it5 = ib.find(x => x.id === 'LI-d5'), it9 = ib.find(x => x.id === 'LI-ls9');
  ok(d2.assigned === 2 && it5.pm === 'Ben Owner' && it5.pmEmail === EM.o2 && it5.hold && it5.hold.state === 'auto' && /^Auto · 5 PM default PM/.test(it5.assignedBy), '5:01 PM → the website lead nobody assigned goes to Owner 2 (the default PM, by role); hold "auto" so the CRM copies it', { d2, it5 });
  ok(it9.pm === 'Pat Miller' && it9.hold.state === 'auto', 'the held Google lead → its suggested PM', it9);
  ok(!ib.find(x => x.id === BARTLETT.id).pm && !ib.find(x => x.id === 'LI-em1').pm && !ib.find(x => x.id === 'LI-crm1').pm, 'the bid, the emergency and the lead the CRM already assigned are left alone', ib.map(x => [x.id, x.pm]));
  ok(/^GrayCo: GrayCo website lead [A-Z0-9]{4} for you: Cus Tomer5 📞 \(901\) 555-/.test((toPh(O2)[0] || {}).Body || '') && /^GrayCo: Google LSA lead [A-Z0-9]{4} for you/.test((toPh(PAT)[0] || {}).Body || ''), 'each PM gets the GrayCo lead text (Owner 2 the website lead, Pat the Google lead)', SMS.map(x => [x.To, x.Body.slice(0, 80)]));
  SMS.length = 0; let d3 = await BI._lib.defaultAssign(crm);
  ok(!d3.assigned && !SMS.length, 'the next run: nothing again');

  console.log('7. the suggested PM is the owner who answers');
  world(); T = THU10;
  const S1 = { id: 'LI-s1', title: 'Website lead', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, status: 'new', receivedAt: iso(T), contact: { name: 'Sue Self', phone: '(901) 555-7003' } };
  const S2 = Object.assign({}, S1, { id: 'LI-s2', contact: { name: 'Sam Self', phone: '(901) 555-7004' } });
  setKv('gc_lead_inbox', [S1, S2]); await SA.leads([S1, S2].map(x => Object.assign({ key: 'LEADIN-' + x.id.slice(3) }, x)), { 'LI-s1': S1, 'LI-s2': S2 }, () => false);
  let g1 = await SA.staffInbound(O1, 'GOOD ' + SA._lsaCode('LI-s1'), 'SMs1'), g2 = await SA.staffInbound(O2, 'GOOD ' + SA._lsaCode('LI-s2'), 'SMs2');
  const ib7 = getKv('gc_lead_inbox');
  ok(g1 && g1.pm === 'Ann Owner' && ib7.find(x => x.id === 'LI-s1').pm === 'Ann Owner' && g2 && g2.pm === 'Ben Owner' && ib7.find(x => x.id === 'LI-s2').pm === 'Ben Owner', 'Owner 1\'s bare GOOD → Owner 1 is the PM; Owner 2\'s → Owner 2 (by role, no names in the code)', { g1, g2 });
  ok(toPh(O1).some(x => /it's yours \(you answered it\)/.test(x.Body)), 'the confirmation says so and how to give it to someone else', toPh(O1).map(x => x.Body));
  ok(/selfPmEmail\(\) \|\| defaultPmEmail\(\)/.test(require('fs').readFileSync(path.join(WT, 'index.html'), 'utf8')), 'the CRM\'s Google calls picker preselects the admin who opened it; the default PM is the fallback');

  console.log('8. the PM\'s replies to his GrayCo lead text');
  world(); T = THU10; const A8 = BI._lib.alertsApi(); await A8.loadPeople(USERS);
  const P1 = { id: 'LI-p1', title: 'Website lead — Hal Roof', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, status: 'imported', receivedAt: iso(T), contact: { name: 'Hal Roof', phone: '(901) 555-7005' }, pm: 'Pat Miller', pmEmail: EM.pat, notes: [] };
  setKv('gc_lead_inbox', [P1]);
  await A8.notifyAssigned(Object.assign({}, P1, { id: 'LEADIN-p1', name: P1.title }), { by: EM.o1 });
  ok(/^GrayCo: GrayCo website lead [A-Z0-9]{4} for you/.test((toPh(PAT)[0] || {}).Body || '') && /#leads&lead=LEADIN-p1/.test(toPh(PAT)[0].Body), 'Pat\'s lead text links the lead (no job yet)', toPh(PAT).map(x => x.Body));
  SA._D.portalLink = async pid => pid === 'PRJp1' ? 'https://portal.test/#t=tokp1' : '';   /* the portal-link maker (gc_portal) — stubbed */
  SMS.length = 0; T += 61 * 60e3; await SA.lsaEscTick();
  ok(toPh(OFF).some(x => /Pat Miller has not answered the lead text for [A-Z0-9]{4} Hal Roof/.test(x.Body)), 'owner rule: the PM must reply — no reply in 1 hour → the office role is told (the reply ladder)', SMS.map(x => [x.To, x.Body]));
  SMS.length = 0; T += 60 * 60e3;
  let pn = await SA.staffInbound(PAT, 'talked to her, wants a new roof, insurance claim w/ State Farm, meet Tue 2pm', 'SMp1');
  const it8 = getKv('gc_lead_inbox').find(x => x.id === 'LI-p1'), dec8 = (getKv('gc_lsa_decisions') || []).find(d => d.id === 'LI-p1');
  ok(pn && pn.good && it8.lsaCheck === 'good' && it8.pmReplyAt && /\[\d+\/\d+ Pat Miller\] talked to her, wants a new roof/.test([].concat(it8.notes).join('\n')) && dec8 && dec8.good && /State Farm/.test(dec8.notes), 'his reply (not BAD) = a GOOD lead: the text goes on the lead\'s notes (the CRM page makes it a job, status bidding)', { pn, it8, dec8 });
  const ap = (getKv('gc_text_appts') || []).find(a => a.lw && a.leadId === 'LEADIN-p1');
  ok(ap && ap.date === '2026-11-24' && ap.time === '14:00' && ap.byEmail === EM.pat && ap.kind === 'sitevisit', '"meet Tue 2pm" → a site visit Tue 11/24 2:00 PM on the job\'s schedule, Pat\'s (America/Chicago)', ap);
  ok(/^GrayCo: Saved to Hal Roof notes — GOOD lead \(the job is being made — its link and the customer portal link come next\)\. Lead: crm\.grayco-cs\.com\/#leads&lead=LEADIN-p1 · Added to schedule: Tue 11\/24 2:00 PM$/.test((toPh(PAT)[0] || {}).Body || ''), 'Pat: "Saved … GOOD lead … Added to schedule: Tue 11/24 2:00 PM"', toPh(PAT).map(x => x.Body));
  SMS.length = 0; T += 61 * 60e3; await SA.lsaEscTick();
  ok(!toPh(OFF).length && !toPh(O1).length, 'he replied → the reply ladder stops', SMS.map(x => [x.To, x.Body]));
  /* the CRM made the job → Pat gets the job link + the customer's portal link (once; nothing to the customer) */
  setKv('projects', [{ id: 'PRJp1', name: 'Hal Roof — reroof', leadId: 'LEADIN-p1', status: 'bidding', pm: 'Pat Miller' }]); SMS.length = 0;
  await SA.jobReady('LEADIN-p1', 'PRJp1'); await SA.jobReady('LEADIN-p1', 'PRJp1');
  ok(toPh(PAT).length === 1 && /^GrayCo: Hal Roof — reroof is a job now \(bidding\)\. Job: crm\.grayco-cs\.com\/#job=PRJp1 · Customer portal \(for you — nothing was sent to the customer\): https:\/\/portal\.test\/#t=tokp1$/.test(toPh(PAT)[0].Body) && !custSms().some(x => /portal\.test/.test(x.Body)), 'job made → Pat gets the job link + the customer portal link, once; nothing to the customer', toPh(PAT).map(x => x.Body));
  SMS.length = 0;
  pn = await SA.staffInbound(PAT, 'sent the estimate, going out thu at 10, will measure', 'SMp2');
  const n1b = (getKv('gc_text_notes') || []).find(x => /sent the estimate/.test(x.text));
  ok(n1b && n1b.pid === 'PRJp1' && /^GrayCo: Saved to Hal Roof — reroof notes — GOOD lead\. Job: crm\.grayco-cs\.com\/#job=PRJp1 · Customer portal \(for you — nothing was sent to the customer\): https:\/\/portal\.test\/#t=tokp1 · Did you mean Thu 11\/26 10:00 AM\? Reply YES to add it to the schedule\.$/.test((toPh(PAT)[0] || {}).Body || ''), 'a job now: the job\'s notes, the job link + portal link; "thu at 10" (no am / pm) → "Did you mean Thu 11/26 10:00 AM? Reply YES"', { n1b, sms: toPh(PAT).map(x => x.Body) });
  ok(!(getKv('gc_text_appts') || []).some(a => a.date === '2026-11-26'), 'nothing on the schedule until he says YES');
  SMS.length = 0; pn = await SA.staffInbound(PAT, 'yes', 'SMp3');
  const ap2 = (getKv('gc_text_appts') || []).find(a => a.date === '2026-11-26');
  ok(pn && pn.appt === 'added' && ap2 && ap2.time === '10:00' && ap2.pid === 'PRJp1' && ap2.kind === 'estimate' && /^GrayCo: Added to schedule: Thu 11\/26 10:00 AM — Estimate — Hal Roof · Customer portal \(for you\): https:\/\/portal\.test/.test((toPh(PAT)[0] || {}).Body || ''), 'YES → an estimate Thu 11/26 10:00 AM on the job\'s schedule; Pat gets the portal link + "Added to schedule"', { ap2, sms: toPh(PAT).map(x => x.Body) });
  SMS.length = 0; pn = await SA.staffInbound(PAT, 'not a good lead, they want a handyman', 'SMp4');
  ok(pn && pn.byPm && pn.good === false && /handyman/.test(pn.pmBad || ''), '"not a good lead …" → the bad path (as built)', pn);

  console.log('9. a GOOD Google lead: "mark it qualified in Google" (PM → office → marketing → owners)');
  world(); T = THU10;
  const G1 = { id: 'LI-g1', title: 'Google LSA call', source: 'Google LSA', status: 'imported', receivedAt: iso(T), contact: { name: 'Gus Good', phone: '(901) 555-7006' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaLink: 'https://c.gle/DEMOG1' }, pm: 'Pat Miller', pmEmail: EM.pat };
  setKv('gc_lead_inbox', [G1]); await SA.pmAssignText({ name: 'Pat Miller', email: EM.pat }, { leadId: 'LI-g1', item: G1 }); SMS.length = 0;
  pn = await SA.staffInbound(PAT, 'called him, real roof leak, he wants a quote', 'SMg1');
  ok([O1, O2, PAT].every(ph => toPh(ph).some(x => /✅ GOOD lead: Gus Good .*mark it qualified in Google: https:\/\/c\.gle\/DEMOG1 Then tap crm\.grayco-cs\.com\/#leads&lead=LEADIN-g1&gq=1 or reply QUALIFIED/.test(x.Body))), 'his reply = GOOD → Pat and the owners get "GOOD lead … mark it qualified in Google" + the Google link + the tap link', SMS.map(x => [x.To, x.Body.slice(0, 90)]));
  SMS.length = 0; T += 61 * 60e3; await SA.lsaEscTick();
  ok(toPh(OFF).some(x => /✅ GOOD lead: Gus Good/.test(x.Body)), '1 hour later, not marked → the office role', SMS.map(x => [x.To, x.Body.slice(0, 80)]));
  let q = await SA.lsaMark({ leadId: 'LI-g1', verdict: 'qualified' }, { name: 'Olive Office', email: EM.off, office: true });
  ok(q && q.ok && getKv('gc_lead_inbox')[0].lsaGoogleOkAt && SA._lsaQualified(getKv('gc_lead_inbox')[0]), 'the tap link (?lsamark verdict qualified) → marked qualified in Google for everyone', q);
  SMS.length = 0; T += 3 * 61 * 60e3; await SA.lsaEscTick(); await SA.lsaEscTick(); await SA.lsaEscTick();
  ok(!SMS.some(x => /GOOD lead: Gus Good/.test(x.Body)), 'marked → the GOOD ladder stops', SMS.map(x => x.Body));
  ok(/qb_bcc_merge/.test(require('fs').readFileSync(path.join(WT, 'index.html'), 'utf8')) && /Bcc new invoices to invoices@grayco-cs\.com, and merge EAH Holdings into EAN Holdings/.test(require('fs').readFileSync(path.join(WT, 'index.html'), 'utf8')), 'Owner setup: the optional QuickBooks Bcc / merge item (a manual Done tick)');

  console.log('10. patch SUBSEEK: a sub looking for work (a website "Commercial bid inquiry", 11/21) is no customer lead — open ones are moved');
  world(); T = THU10;
  const SWISS = "Following up on the note we sent through your website last month. If you have any steel jobs coming up, we'd be glad to help with:\n- Structural and misc. steel shop drawings\nThanks,\nDave Drafter\nExample Drafting\nProject location: Brooklyn";
  const SUBI = { id: 'LI-sub1', status: 'new', title: 'Commercial bid inquiry — Example Drafting — Brooklyn', type: 'commercial', source: 'Website (grayco-cs.com)', receivedAt: iso(T - 50 * H),
    contact: { name: 'Dave Drafter', phone: '(323) 555-0872', email: 'dave@example-drafting.test' }, leadExtra: { said: { message: SWISS, company: 'Example Drafting' }, websiteLead: true, websiteForm: 'Commercial bid inquiry' },
    estimator: 'Eddie Est', estimatorEmail: EM.est };
  const SUBL = web('LEADIN-sub1', 3, { inboxId: 'LI-sub1', name: SUBI.title, leadKind: 'Commercial', type: 'Commercial Reno', websiteForm: 'Commercial bid inquiry', websiteType: 'commercial', company: 'Example Drafting',
    contactName: 'Dave Drafter', said: { message: SWISS, company: 'Example Drafting', service: 'A project (general contractor)' }, scope: SWISS, createdAt: iso(T - 50 * H), estimator: 'Eddie Est', estimatorEmail: EM.est,
    assignedAt: iso(T - 48 * H), hold: { k: 'bid', state: 'auto', field: 'estimator', name: 'Eddie Est', email: EM.est, doneAt: iso(T - 48 * H) } });
  ok(LW.kindOf(SUBL) === 'sub' && !LW.isCustomer(SUBL) && LW.risk(SUBL, T) === null && !LW.atRisk([SUBL], [SUBI], T).length, 'the rule: a sub / supplier is no customer lead (not on the clock, not on the 🚨 card) — before: "pm48"', LW.kindOf(SUBL));
  ok(!LW.defaultDue([SUBI], [], T + 60 * H, () => iso(T)).length, 'the 5 PM default assign skips it');
  setKv('gc_lead_inbox', [SUBI]);
  const ASB = BI._lib.alertsApi(); await ASB.loadPeople(USERS);
  const WSB = web('LEADIN-w5', 4, { createdAt: iso(T - 50 * H), pm: 'Pat Miller', pmEmail: EM.pat, assignedAt: iso(T - 48 * H) });
  await ASB.speedToLead({ leads: [SUBL, WSB], items: [SUBI] }, T - 60 * H);   /* the first run takes note */
  SMS.length = 0; MAIL.length = 0;
  const sp = await ASB.speedToLead({ leads: [SUBL, WSB], items: [SUBI] }, T + 60e3);
  ok(!SMS.some(x => /Dave Drafter|Example Drafting|LEADIN-sub1/.test(x.Body)) && !MAIL.some(m => /Example Drafting|Dave Drafter/.test(JSON.stringify(m))), 'speed to lead: no "reach out" / "has not contacted" for the sub (text or e-mail)', { sms: SMS.map(x => x.Body), sp });
  ok(sp.list && sp.list.some(x => x.key === 'LEADIN-w5'), '… a real customer lead on the same run still is', sp);
  SMS.length = 0;
  const mv = await ASB.subMove({ leads: [SUBL], items: [SUBI], tombs: {} });
  const sst = require(path.join(SRC, '_lib/salesguard.js')).cleanStore(getKv('gc_sales_spam')), ii = (getKv('gc_lead_inbox') || [])[0] || {};
  ok(mv.moved === 1 && sst.list.some(x => x.kind === 'sub' && x.status === 'sub' && x.leadId === 'LI-sub1' && /jobs coming up/.test(x.why)), 'the open lead is moved to 🤝 Subs & suppliers (with the reason)', { mv, list: sst.list });
  ok(ii.status === 'dismissed' && ii.dismissedBy === 'Sales & spam filter' && (ii.leadExtra || {}).sgKind === 'sub' && (getKv('gc_lead_inbox') || []).length === 1, 'its Lead Inbox item is dismissed (kept, not deleted)', ii);
  const mv2 = await ASB.subMove({ leads: [SUBL], items: [getKv('gc_lead_inbox')[0]], tombs: {} });
  ok(mv2.moved === 0 && require(path.join(SRC, '_lib/salesguard.js')).cleanStore(getKv('gc_sales_spam')).list.length === 1, 'once (the next run moves nothing)', mv2);
  const IN2 = { id: 'LI-sub2', status: 'new', title: 'Google LSA call', source: 'Google LSA', receivedAt: iso(T), contact: { name: 'Sam Sub', phone: '(901) 555-7019' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', callerSaid: 'Hi, we are a licensed drywall and framing subcontractor. Please add us to your bid list.' } };
  setKv('gc_lead_inbox', [IN2]);
  const mv3 = await ASB.subMove({ leads: [], items: [IN2], tombs: {} });
  ok(mv3.moved === 1 && getKv('gc_lead_inbox')[0].status === 'dismissed', 'a Google LSA call from a sub (not on the CRM yet) is moved the same way', mv3);
  ok(!SMS.length, 'nothing is texted by the move');

  console.log('6. nobody outside GrayCo');
  ok(!custOther().length, 'no other text to a customer, a GC or anyone outside the staff list (only the qualify ask / "a PM will reach out")', custOther());
  console.log((fail ? 'FAILED' : 'ALL PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
