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
//   6. nobody outside GrayCo is ever texted
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
  const eb = (toPh(EST)[0] || {}).Body || '';
  ok(/^GrayCo BID INVITE: Generator-Animal Shelter for City of Bartlett · Bartlett, TN · due /.test(eb) && /crm\.grayco-cs\.com\/#leads&lead=/.test(eb), 'the City of Bartlett posting → the estimator: "GrayCo BID INVITE: Generator-Animal Shelter for City of Bartlett …"', eb);
  ok(!toPh(O1).length && !toPh(O2).length && !SMS.some(x => /NEW LEAD: Unknown/.test(x.Body)), 'never the owners, never "NEW LEAD: Unknown"', SMS);
  SMS.length = 0;
  const WC = { id: 'LI-wc1', title: 'Commercial bid inquiry — Acme Shops', source: 'Website (grayco-cs.com)', origin: 'website', type: 'Commercial', websiteLead: true, contact: { name: 'Cora Shop', phone: '(901) 555-7006' }, leadExtra: { websiteForm: 'Commercial bid inquiry', websiteLead: true } };
  await SA.leads([Object.assign({ key: 'LEADIN-wc1' }, WC)], { [WC.id]: WC }, () => false);
  ok(toPh(O1).length === 1 && toPh(O2).length === 1 && !toPh(EST).length && /GrayCo website lead/.test(toPh(O1)[0].Body), 'a website commercial inquiry → the owners as a customer lead (not the estimator as a bid)', SMS.map(x => [x.To, x.Body.slice(0, 60)]));
  ok(!custSms().length, 'no text to the customer');

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
  ok(toPh(O1).length === 2 && toPh(O2).length === 2 && /came in 24 h ago/.test(toPh(O1)[0].Body), '24 h, still no PM → the owners again', toPh(O1));
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
  ok(MAIL.some(m => /⏰ Reach out: /.test(m.subject) && [].concat(m.to).includes(EM.pat)), 'the 4 h reach-out e-mail went to Pat', MAIL.map(m => [m.subject, m.to]));
  T += 60e3; await A.speedToLead(src(), T);
  const pr = (toPh(PAT)[0] || {}).Body || '';
  ok(/^GrayCo: ⏰ reach out — GrayCo website lead [A-Z0-9]{4} Cus Tomer1 📞 \(901\) 555-7002 was given to you 24 h ago and is not marked contacted/.test(pr) && !toPh(O1).length, '24 h after the assignment, not contacted → Pat\'s "⏰ reach out" (not the owners)', { pr, o1: toPh(O1) });
  SMS.length = 0; T = THU10 + 25 * H + 48 * H; await A.speedToLead(src(), T);
  const o48 = (toPh(O1)[0] || {}).Body || '';
  ok(/^GrayCo: ⚠️ Pat Miller has not contacted GrayCo website lead [A-Z0-9]{4} Cus Tomer1/.test(o48) && toPh(O2).length === 1 && !toPh(PAT).length, '48 h → both owners: "⚠️ Pat Miller has not contacted …"', { o48, all: SMS });
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
  ok(/staff/.test(require('fs').readFileSync(path.join(SRC, '_lib/pause.js'), 'utf8')) && onlyStaff(), 'data-entry mode lets staff-tagged texts through; customers stay blocked (nothing here texts one)');

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

  console.log('6. nobody outside GrayCo');
  ok(!custSms().length && onlyStaff(), 'no text to a customer, a GC or anyone outside the staff list', custSms());
  console.log((fail ? 'FAILED' : 'ALL PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
