// netlify/functions/texts.js — patch TXT: 💬 "Text us" — staff replies by text and the automatic-answer settings.
// Owner 10/23: "can customers text the number for advice — texts go to our e-mails, or replies etc. … basic answers
// for different questions". Texts IN arrive at missed-call.js?event=sms (the Twilio webhook; _lib/sms.js).
//   GET  ?public=1   → { number } — the "Text us" number for the website / marketing (no sign-in; nothing else)
//   GET  ?status=1   → staff: Twilio ready, the number, automatic answers on/off, data-entry mode
//   POST ?send=1     → staff: { to, pid?, text } — one text from the GrayCo number; it goes on the job's Job Messages and
//                      💬 timeline. Refused while data-entry mode is on, to an opted-out number, or when Twilio is not set up.
//   GET  ?settings=1 → admins: the automatic-answer settings (rules, hours, relay list)
//   POST ?settings=1 → admins: save them
//   GET/POST ?alerts=1 → admins: 📱 Text alerts to cell phones (patch SMSALERT; _lib/smsalert.js)
//   POST ?try=1      → admins: { text, pid? } — which answer would go back (nothing is sent)
//   GET  ?callchain=1 → admins: 📞 Call order (patch CALLCHAIN, _lib/callorder.js): the saved order (or the defaults), the
//                      people with a phone, who would ring now, the last 50 calls (patch CALLSCREEN: menu answer, outcome);
//                      POST ?callchain=1 { settings } → save it (order, ring seconds, screening, blocked numbers)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const S = require('./_lib/sms.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function env(k){ return s(process.env[k]); }
function L(){ return require('./bid-inbox.js')._lib; }
function T(){ return require('./bid-inbox.js')._test; }
function MC(){ return require('./missed-call.js')._test; }
function core(){ return require('./portal.js')._core; }
function nowIso(){ return new Date().toISOString(); }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function number(){ const d = S.phone10(env('TWILIO_FROM')); return d.length === 10 ? S.tidy(d) : ''; }
/* patch SMSROUTE: our numbers for the rest of the CRM (OWNERTODO ticks the Twilio step from it) — gc_kv "gc_sms_numbers" */
async function publishNumbers(set){
  try { const list = require('./_lib/smsroute.js').publicList(set, env), same = l => JSON.stringify(l) === JSON.stringify(list);
    return await core().kvListUpdate('gc_sms_numbers', l => same(l) ? null : { list: list, check: same }); } catch (e) { return { ok: false }; }
}
async function getSettings(){ try { return S.settings(await L().kvGet(S.SETTINGS_KEY)); } catch (e) { return S.settings(null); } }

async function send(who, b){
  const to = S.phone10(b.to), pid = s(b.pid).slice(0, 80);
  /* patch SMSROUTE: signed with the sender's first name ("— Mike, GrayCo"); sent from the number for the purpose */
  const RT = require('./_lib/smsroute.js');
  const text = (b.noSign ? s(b.text) : RT.sign(s(b.text), who.name || '')).slice(0, 600);
  let purpose = s(b.purpose) ? RT.normPurpose(b.purpose) : '';
  let CD = null; try { CD = await core().kvRead(['subs', 'vendors', 'projects', 'customers', 'leads']); } catch (e) {}   /* patch SMSCONSENT: read once — the line and the consent check both use it */
  if (!purpose) { try { purpose = CD ? RT.purposeFor(CD, to) : 'customers'; } catch (e) { purpose = 'customers'; } }   /* a sub → the subs number, a customer → the customers number */
  if (to.length !== 10) return { code: 400, body: { ok: false, error: 'A 10-digit phone number is needed.' } };
  if (!text) return { code: 400, body: { ok: false, error: 'Type the text first.' } };
  if (pid && !/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return { code: 400, body: { ok: false, error: 'Bad job id.' } };
  if (!MC().ready()) return { code: 409, body: { ok: false, error: 'Texting is not set up yet (Netlify TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).' } };
  let paused = true; try { paused = await require('./_lib/pause').isPaused(); } catch (e) {}
  if (paused) return { code: 409, body: { ok: false, paused: true, error: '⏸ Data-entry mode is on — no texts go out until an admin turns it off.' } };
  const st = await MC().stateGet();
  /* patch SMSCONSENT: STOP (below) wins over everything; then a customer who declined on the contract is refused; marketing needs Yes; subs are not customers */
  if (!st.optout[to]) {
    const SC = require('./_lib/smsconsent.js'), marketing = b.marketing === true || (!!s(b.purpose) && RT.normPurpose(b.purpose) === 'leads');
    let isSub = false; try { isSub = !!CD && RT.purposeFor(CD, to) === 'subs'; } catch (e) {}
    /* patch SMSC2: a marketing / promotional send needs the SEPARATE smsMarketing = yes (job-text yes is not enough) */
    if (!isSub) { const cst = SC.statusFor(CD || {}, to, st.consent), mst = SC.marketingStatusFor(CD || {}, to, st.marketing), why = SC.refusal(cst, marketing, mst);
      if (why) return { code: 409, body: { ok: false, consent: cst || 'unknown', marketingConsent: mst || 'unknown', error: why } }; }
  }
  if (st.optout[to]) return { code: 409, body: { ok: false, error: 'This number texted STOP — GrayCo cannot text it until they text START.' } };
  if (b.checkQuiet === true && RT.quiet(typeof exports._now === 'function' ? exports._now() : Date.now())) return { code: 409, body: { ok: false, quiet: true, error: 'It is after 8 PM (or before 7 AM) — texts wait until morning. Send anyway only for something urgent.' } };
  const set = await getSettings(), from = RT.fromFor(purpose, set, env);
  const r = await MC().sendSms(to, text, from);
  if (!r.ok) return { code: 502, body: { ok: false, error: 'Twilio did not send it' + (r.status ? ' (' + r.status + ')' : r.why ? ' (' + r.why + ')' : '') + '.' } };
  const at = nowIso(), id = 'SMSO_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const msg = { id, pid, authorId: low(who.email), authorName: s(who.name || who.email) + ' 📱 (text to ' + S.tidy(to) + ')', text, tags: [], at, source: 'sms', channel: 'sms', dir: 'out', smsTo: to, smsFromNum: RT.phone10(from), purpose };
  try { await MC().stateCas(x => { x.lastOut = x.lastOut && typeof x.lastOut === 'object' ? x.lastOut : {}; x.lastOut[to] = { email: low(who.email), name: s(who.name), pid, at }; return true; }); } catch (e) {}   /* patch SMSROUTE: their reply comes back to this employee */
  const has = l => l.some(m => m && s(m.id) === id);
  try { await core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has }); } catch (e) {}
  try { await require('./_lib/textlead.js').onOutbound({ ph: to, text, who: s(who.name || who.email), id }); } catch (e) {}   /* patch TEXTLEAD: on the lead's conversation too */
  if (pid) { try { await require('./_lib/comms.js').addMessage(pid, { id: 'sms_' + id, kind: 'text', dir: 'out', at, from: s(who.email), fromName: s(who.name), to: [S.tidy(to)], text }); } catch (e) {} }
  return { code: 200, body: { ok: true, id, message: msg } };
}

exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase();
  if (m === 'OPTIONS') return J(200, {}, C);
  if (m === 'GET' && qs.public === '1') return J(200, { ok: true, number: number() }, Object.assign({ 'Access-Control-Allow-Origin': '*' }, {}));
  const who = await T().staffAuth(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  try {
    if (m === 'GET' && qs.status) {
      const set = await getSettings(); let paused = true; try { paused = await require('./_lib/pause').isPaused(); } catch (e) {}
      if (who.admin) await publishNumbers(set);   /* patch SMSROUTE: Netlify numbers show up without a save */
      return J(200, { ok: true, ready: MC().ready(), number: number(), numbers: require('./_lib/smsroute.js').numbers(set, env), autoOn: set.autoOn, paused, webhook: (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '') + '/.netlify/functions/missed-call?event=sms' }, C);
    }
    if (m === 'POST' && qs.send) {
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      const r = await send(who, b); return J(r.code, r.body, C);
    }
    if (qs.callchain) {   /* patch CALLCHAIN */
      if (!who.admin) return J(403, { ok: false, error: 'Only an admin can change the call order.' }, C);
      const CC = require('./_lib/callorder.js');
      let data = {}; try { data = await core().kvRead(['users', 'gc_senior_pm']); } catch (e) {}
      const ours = [env('TWILIO_FROM')].concat(require('./_lib/smsroute.js').numbers(await getSettings(), env).map(x => x.number));
      let log = []; try { const lv = await L().kvGet(CC.LOG_KEY); log = (lv && Array.isArray(lv.calls) ? lv.calls : []).slice(-50).reverse().map(x => ({ at: s(x.at), from: CC.tidy(x.from), choice: s(x.choice), what: s(x.what), outcome: s(x.outcome), by: s(x.by) })); } catch (e) {}
      const out = (cfg, saved) => J(200, { ok: true, saved, settings: cfg, openNow: CC.isOpen(typeof exports._now === 'function' ? exports._now() : Date.now(), cfg),   /* patch AFTERHOURS */ people: CC.peopleWithPhones(data.users), preview: CC.preview(cfg, data, ours),
        senior: (function(){ try { const u = require('./_lib/people.js').seniorPm(data.users, data.gc_senior_pm); return u ? { name: s(u.name), phone: CC.tidy(CC.userPhone(u)) } : null; } catch (e) { return null; } })(),
        log,   /* patch CALLSCREEN: the last 50 calls */
        office: CC.tidy(CC.companyPhone()), ringToEnv: CC.tidy(env('TWILIO_RING_TO')), ready: MC().ready(),
        voiceWebhook: (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '') + '/.netlify/functions/missed-call?event=voice' }, C);
      if (m === 'GET') {
        const raw = await L().kvGet(CC.KEY);
        return raw && typeof raw === 'object' ? out(CC.clean(raw), true) : out(CC.pinPeople(CC.defaults(), data.users), false);
      }
      if (m === 'POST') {
        let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
        const v = CC.clean(b.settings || b);
        if (!v.slots.length) return J(400, { ok: false, error: 'Keep at least one line in the call order (or turn it off).' }, C);
        v.by = low(who.email); v.at = nowIso();
        await L().kvCas(CC.KEY, () => v);
        return out(v, true);
      }
    }
    /* patch SMSALERT: Admin → 📱 Text alerts to cell phones (admins) — gc_lead_inbox_kv "gc_sms_alerts" */
    if (qs.alerts) {
      if (!who.admin) return J(403, { ok: false, error: 'Only an admin can change the text alerts.' }, C);
      const SA = require('./_lib/smsalert.js');
      if (m === 'GET') {
        const pp = await SA._D.people(), staff = SA.staffList(pp), set = await SA.load();
        const roles = [{ key: SA.ROLE_MIT, name: 'Mitigation manager', holders: SA.mitigationHolders(pp).map(x => ({ name: x.name, email: x.email, phone: x.phone })) }];
        let paused = true; try { paused = await require('./_lib/pause').isPaused(); } catch (e) {}
        return J(200, { ok: true, settings: set, staff, roles, types: SA.TYPES, ready: MC().ready(), from: S.tidy(env('TWILIO_FROM_ALERTS') || env('TWILIO_FROM')), paused, costCents: 1 }, C);
      }
      if (m === 'POST') {
        let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
        const v = await SA.save(b.settings || b, who.email);
        return J(200, { ok: true, settings: v }, C);
      }
    }
    if (qs.settings || qs.try) {
      if (!who.admin) return J(403, { ok: false, error: 'Only an admin can change the automatic answers.' }, C);
      if (m === 'GET' && qs.settings) return J(200, { ok: true, settings: await getSettings(), defaults: S.DEFAULT_RULES, number: number() }, C);
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      if (m === 'POST' && qs.settings) {
        const v = S.settings(b.settings || b);   /* cleaned: staff-only relay list, known fields only */
        v.by = low(who.email); v.at = nowIso();
        await L().kvCas(S.SETTINGS_KEY, () => v);
        await publishNumbers(v);   /* patch SMSROUTE */
        return J(200, { ok: true, settings: v }, C);
      }
      if (m === 'POST' && qs.try) {
        const set = S.settings(b.settings || await getSettings()), text = s(b.text).slice(0, 600), pid = s(b.pid);
        let rule = S.pickRule(text, set, { pid });
        if (!rule && b.ai === true) rule = await S.aiPick(text, set, { pid }, require('./_lib/ai.js'));
        const B = require('./_lib/brand.js');
        const ctx = { address: B.companyAddress(), billing: B.billingEmail ? B.billingEmail() : 'billing@grayco-cs.com', first: 'Pat', job: pid ? 'the job' : '', pm: '', visit: null };
        ctx.nextVisit = S.nextVisitText(ctx);
        const reply = rule ? S.safe(rule.id === 'status' ? ctx.nextVisit : S.fill(rule.answer, ctx)) : (set.fallbackOn ? S.FALLBACK : '');
        return J(200, { ok: true, rule: rule ? rule.id : '', label: rule ? rule.label : '', reply, alert: !!(rule && rule.alert), lead: !!(rule && rule.lead) }, C);
      }
    }
    return J(400, { ok: false, error: 'Bad request.' }, C);
  } catch (e) { return J(503, { ok: false, error: 'Texting is busy — try again (' + s(e && e.message) + ').' }, C); }
};
exports._t = { send, number };
