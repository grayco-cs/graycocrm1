// test_FOLLOW1.mjs <build-dir> [shot-dir] — patch FOLLOW1 (owner's 11/15 list, item 1). Made-up data only, offline harness, fake functions.
//   A. node: TWLIVE _lib/twstatus.js (GETs only, SID masked, token never returned; account / numbers / last texts; 401; not set up);
//      texts.js ?status=1&live=1 is admin-only; TEXTEDPM — smsalert.assigned() logs the text with the lead id (type 'assigned');
//      data-entry mode still holds it.
//   B. the CRM: NLBADGE (Field bar Home badge = my new leads), NOCELL (Text alerts: on + no cell flagged, live as you type),
//      TWLIVE (🔎 Check Twilio now), TEXTEDPM (the lead timeline shows "📱 texted Demo PM").
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const req = createRequire(import.meta.url), FN = path.join(BUILD, 'netlify/functions');

/* ════ A. node ════ */
{
  const TW = req(FN + '/_lib/twstatus.js');
  const E = { TWILIO_ACCOUNT_SID: 'AC0123456789abcdef0123456789abcd', TWILIO_AUTH_TOKEN: 'tok-secret-test', TWILIO_FROM: '+19015550999', TWILIO_FROM_ALERTS: '+19015550998' };
  const env = k => E[k] || '';
  const CALLS = [];
  const fake = (o) => async (url, init) => { CALLS.push({ url, m: (init && init.method) || 'GET', auth: init && init.headers && init.headers.Authorization });
    const J = (st, b) => ({ ok: st < 300, status: st, json: async () => b });
    if (o.unauth) return J(401, { message: 'auth' });
    if (/\/Accounts\/[^/]+\.json$/.test(url)) return J(200, { status: 'active', type: 'Full', auth_token: 'SHOULD-NOT-LEAK' });
    if (/IncomingPhoneNumbers\.json\?PhoneNumber=%2B19015550999/.test(url)) return J(200, { incoming_phone_numbers: [{ sms_url: 'https://crm.test/.netlify/functions/missed-call?event=sms', voice_url: 'https://crm.test/.netlify/functions/missed-call' }] });
    if (/IncomingPhoneNumbers\.json/.test(url)) return J(200, { incoming_phone_numbers: [{ sms_url: 'https://demo.twil.io/old', voice_url: '' }] });
    if (/Messages\.json\?PageSize=20$/.test(url)) return J(200, { messages: [{ status: 'delivered' }, { status: 'delivered' }, { status: 'undelivered', error_code: 30034, date_sent: 'Sat, 14 Nov 2026 15:00:00 +0000' }] });
    return J(404, {}); };
  let o = await TW.check({ env, fetch: fake({}) });
  ok('A1 account reached, active / Full, SID masked', o.ready && o.account.ok && o.account.status === 'active' && o.account.type === 'Full' && o.account.sid === 'AC…abcd', o.account);
  ok('A1 both numbers looked up: main → the CRM webhook, alerts → not the CRM (its URL shown)', o.numbers.length === 2 && o.numbers[0].found && o.numbers[0].smsHook && o.numbers[1].found && !o.numbers[1].smsHook && /old/.test(o.numbers[1].smsUrl), o.numbers);
  ok('A1 the last texts: 2 delivered, 1 undelivered, last error 30034', o.recent && o.recent.n === 3 && o.recent.failed === 1 && o.recent.by.delivered === 2 && o.recent.lastError.code === '30034' && /^2026-11-14/.test(o.recent.lastError.at), o.recent);
  ok('A2 read-only: every call is a GET to api.twilio.com', CALLS.length === 4 && CALLS.every(c => c.m === 'GET' && /^https:\/\/api\.twilio\.com\//.test(c.url)), CALLS.map(c => c.m + ' ' + c.url));
  ok('A2 the token / auth header never comes back in the answer', !/tok-secret-test|SHOULD-NOT-LEAK|Basic /.test(JSON.stringify(o)));
  o = await TW.check({ env, fetch: fake({ unauth: true }) });
  ok('A3 a wrong SID / token → "did not accept" (401), numbers not looked up', o.account.ok === false && /401/.test(o.account.error) && o.numbers.every(n => n.found === false), o);
  o = await TW.check({ env: k => k === 'TWILIO_FROM' ? '' : env(k), fetch: fake({}) });
  ok('A3 not set up → ready false (no call)', o.ready === false);
  const TX = fs.readFileSync(FN + '/texts.js', 'utf8');
  ok('A4 texts.js runs the live check only for an admin (qs.live && who.admin)', /if \(qs\.live && who\.admin\) \{ try \{ live = await require\('\.\/_lib\/twstatus\.js'\)\.check/.test(TX));

  process.env.TWILIO_FROM = '+19015550999'; process.env.CRM_URL = 'https://crm.test';
  const SA = req(FN + '/_lib/smsalert.js');
  const rig = (paused) => { const kv = {}, sent = [], logs = [];
    kv[SA.KEY] = { at: 'x', people: { 'pm@grayco-cs.com': { on: true, newMine: true, qOff: true, phone: '9015550003' } } };
    Object.assign(SA._D, { now: () => Date.parse('2026-11-11T16:00:00Z'), kvGet: async k => kv[k], kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true }; },
      send: async (to, body, from) => { if (paused) return { ok: false, held: true }; sent.push({ to, body }); return { ok: true }; }, paused: async () => !!paused, optouts: async () => ({}), consentNo: async () => false,
      hours: async () => null, people: async () => ({ users: [{ name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', cell: '9015550003', active: true }], staff: [] }), textLog: async row => { logs.push(row); return true; } });
    return { sent, logs }; };
  let r = rig(false);
  await SA.assigned({ id: 'L1', key: 'L1', title: 'Zedd Roof Lead', assigneeEmail: 'pm@grayco-cs.com', assignedBy: 'Wesley Johnson' });
  ok('A5 the PM is texted and the text is logged WITH the lead id (type assigned, who Demo PM)', r.sent.length === 1 && r.logs.length === 1 && r.logs[0].leadId === 'L1' && r.logs[0].type === 'assigned' && r.logs[0].who === 'Demo PM', { s: r.sent, l: r.logs });
  r = rig(true);
  await SA.assigned({ id: 'L2', key: 'L2', title: 'Demo Lead', assigneeEmail: 'pm@grayco-cs.com' });
  ok('A6 data-entry mode: nothing is texted, nothing logged as sent', r.sent.length === 0 && r.logs.length === 0, r);
}

/* ════ B. the CRM ════ */
const { computer, signIn, sleep, cset, resetCloud, onFn } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 2 * 3600e3).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', cell: '9015550003', role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'P1', name: 'Zedd Demo Job', client: 'Zedd Demo', clientPhone: '9015550111', address: '1 Demo St', status: 'active', pm: 'Demo PM', createdAt: at, updatedAt: at }]);
cset('leads', [
  { id: 'L1', name: 'Zedd Roof Lead', phone: '(901) 555-0141', stage: 'New Lead', status: 'new', pm: 'Demo PM', assignedTo: 'Demo PM', assignedBy: 'Wesley Johnson', assignedAt: at, source: 'Website', createdAt: at, updatedAt: at },
  { id: 'L2', name: 'Demo Gutter Lead', phone: '(901) 555-0142', stage: 'New Lead', status: 'new', pm: 'Demo PM', assignedTo: 'Demo PM', assignedBy: 'Wesley Johnson', assignedAt: at, source: 'Website', createdAt: at, updatedAt: at },
  { id: 'L3', name: 'Demo Old Lead', stage: 'Contacted', status: 'contacted', pm: 'Demo PM', assignedTo: 'Demo PM', assignedAt: at, createdAt: at, updatedAt: at }]);
const LIVE = { ready: true, account: { ok: true, sid: 'AC…abcd', status: 'active', type: 'Full' }, numbers: [{ number: '(901) 555-0999', label: 'Main number', found: true, smsHook: true }], recent: { n: 3, by: { delivered: 3 }, failed: 0, lastError: null } };
onFn('texts', ({ query }) => {
  if (query.alerts) return { ok: true, ready: true, from: '(901) 555-0999', settings: { people: { 'wjohnson@grayco-cs.com': { on: true, phone: '9015550002' }, 'pm@grayco-cs.com': { on: true, phone: '' } } },
    staff: [{ name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', admin: true, phone: '9015550002' }, { name: 'Demo PM', email: 'pm@grayco-cs.com', phone: '' }], roles: [] };
  if (query.status) return Object.assign({ ok: true, ready: true, paused: true }, query.live ? { live: LIVE } : {});
  return { ok: true };
});

/* B1 the PM's phone: Field bar Home badge */
{
  const A = await computer('pm', { build: BUILD, mobile: true });
  await signIn(A, 'pm@grayco-cs.com', 20000);
  const up = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 60000) { const v = await A.ev(() => !!(window._gcNewLead && window._gcFollow1 && (window._crm.leads || []).length >= 3)).catch(() => false); if (v) return true; await sleep(400); } return false; })();
  ok('B0 the PM CRM is up (phone)', up);
  const hasBar = await A.ev(() => !!document.querySelector('#gc-fh-tabs [data-t="home"]'));
  if (!hasBar) await A.ev(() => { const t = document.createElement('div'); t.id = 'gc-fh-tabs'; t.innerHTML = '<button type="button" data-t="home"><span class="e">▣</span>Home</button>'; document.body.appendChild(t); });
  let b = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 10000) { const v = await A.ev(() => { const x = document.querySelector('#gc-fh-tabs [data-t="home"] .gc-nl-badge'); return x && x.textContent; }); if (v) return v; await sleep(300); } return null; })();
  ok('B1 the Field bar Home button shows 2 (my two new leads, not the contacted one)' + (hasBar ? '' : ' [bar stubbed]'), b === '2', b);
  await shot(A, 'b1_badge');
  await A.ev(() => window._gcNewLead.seen('L2')); await sleep(1800);
  b = await A.ev(() => { const x = document.querySelector('#gc-fh-tabs [data-t="home"] .gc-nl-badge'); return x && x.textContent; });
  ok('B1 ✓ Got it on one → 1', b === '1', b);
  await A.ev(() => window._gcNewLead.seen('L1')); await sleep(1800);
  b = await A.ev(() => !!document.querySelector('#gc-fh-tabs [data-t="home"] .gc-nl-badge'));
  ok('B1 none left → no badge', b === false);
  ok('B1 no page errors', A.errs.length === 0, A.errs);
  await A.close();
}

/* the text log lands after the PM's phone is closed (its own reader would write the timeline first) */
cset('gc_text_log', [{ id: 'Tx1', at, dir: 'out', phone: '9015550003', text: 'GrayCo: lead assigned to you: Zedd Roof Lead (by Wesley Johnson) crm.test/#leads', who: 'pm@grayco-cs.com', leadId: 'L1', type: 'assigned', kind: 'staff' }]);
/* B2 the admin: Text alerts card + Check Twilio + lead timeline */
{
  const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
  await signIn(A, 'wjohnson@grayco-cs.com', 20000);
  const up = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 60000) { const v = await A.ev(() => !!(window._gcSmsAlerts && window._gcFollow1 && window._gcLsaCheck && (window._crm.leads || []).length >= 3)).catch(() => false); if (v) return true; await sleep(400); } return false; })();
  ok('B2 the admin CRM is up', up);
  await A.ev(() => { const d = document.createElement('div'); d.id = 'zz-sa'; document.body.prepend(d); window._gcSmsAlerts.render(d); });
  let f = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 10000) { const v = await A.ev(() => { const s = document.getElementById('gc-nocell-sum'); return s && s.textContent; }); if (v) return v; await sleep(300); } return null; })();
  ok('B2 the card says who is on with no cell: Demo PM (not Wesley)', !!f && /1 person is switched on but has no cell number: Demo PM/.test(f), f);
  const rowFlag = await A.ev(() => [].map.call(document.querySelectorAll('tr.gcsa-row'), tr => tr.getAttribute('data-email') + ':' + !!tr.querySelector('.gc-nocell')).join(','));
  ok('B2 the flag is on Demo PM\'s row only', rowFlag === 'wjohnson@grayco-cs.com:false,pm@grayco-cs.com:true', rowFlag);
  await shot(A, 'b2_nocell');
  await A.page().fill('tr.gcsa-row[data-email="pm@grayco-cs.com"] input[data-k="phone"]', '(901) 555-0003');
  await sleep(300);
  f = await A.ev(() => ({ sum: !!document.getElementById('gc-nocell-sum'), flag: !!document.querySelector('.gc-nocell') }));
  ok('B2 typing the cell clears the flag at once', !f.sum && !f.flag, f);
  await A.page().fill('tr.gcsa-row[data-email="pm@grayco-cs.com"] input[data-k="phone"]', '');
  await A.page().click('tr.gcsa-row[data-email="pm@grayco-cs.com"] input[data-k="on"]');
  await sleep(300);
  f = await A.ev(() => !!document.getElementById('gc-nocell-sum'));
  ok('B2 switched off with no cell → no flag', f === false);
  /* TWLIVE */
  await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 6000) { if (await A.ev(() => !!document.getElementById('gc-tw-btn'))) return; await sleep(300); } })();
  await A.page().click('#gc-tw-btn').catch(() => {});
  const tw = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 8000) { const v = await A.ev(() => { const o = document.getElementById('gc-tw-out'); return o && /Account/.test(o.textContent) ? o.textContent : ''; }); if (v) return v; await sleep(300); } return ''; })();
  ok('B3 🔎 Check Twilio now shows the account, the number, the last texts and data-entry mode', /Account AC…abcd: active \(Full\)/.test(tw) && /Main number \(901\) 555-0999: on the account, texts come to the CRM/.test(tw) && /Last 3 texts: 3 delivered/.test(tw) && /Data-entry mode is on/.test(tw), tw);
  ok('B3 it asked texts ?status=1&live=1 (a GET)', A.fn.some(c => c.name === 'texts' && c.query.status === '1' && c.query.live === '1' && c.method === 'GET'));
  await shot(A, 'b3_twilio');
  /* TEXTEDPM */
  await A.ev(() => window._gcLsaCheck.textLog());
  const act = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 10000) { const v = await A.ev(() => { const l = (window._crm.leads || []).find(x => x.id === 'L1'); return l && (l.activity || []).map(a => a.text).join(' | '); }); if (v) return v; await sleep(300); } return ''; })();
  ok('B4 the lead timeline: "📱 texted Demo PM (lead assigned): …"', /📱 texted Demo PM \(lead assigned\): GrayCo: lead assigned to you: Zedd Roof Lead/.test(act), act);
  ok('B4 no page errors', A.errs.length === 0, A.errs);
  await A.close();
}
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
