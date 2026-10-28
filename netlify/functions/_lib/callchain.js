/* ============================================================================
   GrayCo — the 24/7 EMERGENCY LINE call chain (patch CHAIN).   netlify/functions/_lib/callchain.js

   Owner (10/27): "our twilio number should forward to on call mitigation manager, then insurance manager, then
   admin / nick / wesley" — the Twilio number (TWILIO_FROM) is the website's 24/7 water emergency line.

   A call to the Twilio number (missed-call.js, event=voice, when TWILIO_CALL_CHAIN=1) rings, one after the other:
     1. this week's ON-CALL person (💧 Mitigation → 📟 On call: the rotation and its phone numbers);
     2. the INSURANCE manager(s) — people whose CRM sign-in profile is "insurance" (💎 → Team access), or whose role /
        title on Admin → Employees says insurance;
     3. the ADMINS — CALL_CHAIN_LAST on Netlify (comma list of e-mails, in that order) when set, else the gc_staff
        admins, else OWNER_EMAILS.
   Phone numbers come from the people list (Admin → Employees: phone / cell / mobile) and the on-call rotation.
   No person is named in code.
   Each person hears "GrayCo emergency line … press 1 to take this call": a voicemail or a pocket answer does not
   stop the chain — only pressing 1 connects them. Nobody takes it → the missed-call text-back and a lead, as before.
   The caller's own number shows on the phone that rings.
   State (service-only gc_lead_inbox_kv "gc_callchain"): each call's chain (fixed when the call starts), who took
   it — kept 14 days.
   ========================================================================== */
'use strict';
const KEY = 'gc_callchain';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; }
function okEmail(e){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(e)); }
function active(u){ return !!u && u.active !== false && u.departed !== true && u.fired !== true && u.deleted !== true && !/^(terminated|inactive|former|departed|fired)$/i.test(s(u.status)); }
function phoneOf(u){ return u ? phone10(u.cell || u.mobile || u.phone || u.phoneNumber || u.tel) : ''; }

/* the chain from plain data (pure — tested): [{ step, name, email, phone }] — no repeats, never our own number */
function build(o){
  o = o || {};
  const users = arr(o.users).filter(active), staff = arr(o.staff).filter(x => x.active !== false);
  const byEmail = {}; users.forEach(u => { if (okEmail(u.email)) byEmail[low(u.email)] = u; });
  const out = [], seen = {}, own = phone10(o.ownNumber);
  function add(step, name, email, phone){
    const ph = phone10(phone) || phoneOf(byEmail[low(email)]); if (!ph || ph === own || seen[ph]) return;
    seen[ph] = 1; out.push({ step: step, name: s(name) || s(byEmail[low(email)] && byEmail[low(email)].name) || low(email) || 'GrayCo', email: low(email), phone: ph });
  }
  if (o.onCall) add('on call', o.onCall.name, o.onCall.email, o.onCall.phone);
  const ins = {};
  staff.filter(x => low(x.profile) === 'insurance').forEach(x => { ins[low(x.email)] = 1; });
  users.filter(u => /insurance/.test([u.role, u.profile, u.title, u.jobTitle, u.position].map(low).join(' '))).forEach(u => { if (okEmail(u.email)) ins[low(u.email)] = 1; });
  Object.keys(ins).sort().forEach(e => add('insurance', '', e, ''));
  let last = s(o.lastList).split(',').map(low).filter(okEmail);
  if (!last.length) last = staff.filter(x => low(x.role) === 'admin').map(x => low(x.email)).filter(okEmail);
  if (!last.length) last = s(o.ownerEmails).split(',').map(low).filter(okEmail);
  last.forEach(e => add('admin', '', e, ''));
  return out;
}

function make(d){
  const env = k => s(d.env(k));
  const nowIso = () => new Date(typeof d.now === 'function' ? d.now() : Date.now()).toISOString();
  function on(){ return false; }   /* off in r12: the screened call order (CALLSCREEN) replaces this; owner 10/28 "no unscreened calls to Nick" */
  function ringSecs(){ return Math.max(10, Math.min(45, parseInt(env('TWILIO_CHAIN_SECONDS') || '20', 10) || 20)); }
  async function current(){
    const X = require('./x10.js');
    let cfg = null; try { cfg = await d.kvGet('gc_x10_oncall'); } catch (e) {}
    const c = X.oncallCfg(cfg), oc = c.on ? X.onCallNow(typeof d.now === 'function' ? d.now() : Date.now(), c) : null;
    let users = []; try { users = arr((await require('./mkt.js').crmData(['users'])).users); } catch (e) {}
    let staff = []; try { const r = await d.sb('gc_staff?select=email,name,role,profile,active'); if (r.ok) staff = arr(await r.json()); } catch (e) {}
    return build({ onCall: oc, users: users, staff: staff, lastList: env('CALL_CHAIN_LAST'), ownerEmails: env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com', ownNumber: env('TWILIO_FROM') });
  }
  async function cas(fn){
    return d.kvCas(KEY, v => {
      v = v && typeof v === 'object' ? v : {}; v.calls = v.calls && typeof v.calls === 'object' ? v.calls : {};
      const cut = new Date(Date.parse(nowIso()) - 14 * 864e5).toISOString();
      Object.keys(v.calls).forEach(k => { if (s(v.calls[k].at) < cut) delete v.calls[k]; });
      return fn(v) === false ? undefined : v;
    });
  }
  async function get(sid){ const v = await d.kvGet(KEY); return v && v.calls && v.calls[sid] || null; }
  /* the call starts: fix its chain */
  async function start(sid, from){
    const ch = await current();
    await cas(v => { if (v.calls[sid]) return false; v.calls[sid] = { at: nowIso(), from: phone10(from).slice(-4), chain: ch.map(x => ({ step: x.step, name: x.name, phone: x.phone })), took: null }; });
    return ch;
  }
  async function took(parentSid, i){
    await cas(v => { const c = v.calls[parentSid]; if (!c || c.took) return false; c.took = { i: i, name: s(c.chain[i] && c.chain[i].name), step: s(c.chain[i] && c.chain[i].step), at: nowIso() }; });
  }
  return { on, ringSecs, current, start, get, took };
}
module.exports = { build, make, KEY };
