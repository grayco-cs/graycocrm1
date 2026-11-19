/* ============================================================================
   GrayCo — LOCAL TEXT NUMBERS (patch LOCALNUMS).   netlify/functions/_lib/localnums.js

   Owner 11/19: "I'll need to make more Twilio numbers for Mississippi area codes and Arkansas area codes so the right text
   number texts them, and then those texts route to our cell phones."

   · The list — Admin → 📱 Local text numbers (gc_kv "gc_sms_local": { list: [{ state, codes: ['662', …], number, label }] }),
     with a Netlify fallback TWILIO_LOCAL_NUMBERS (JSON, the same shape). Phone numbers only: the Twilio SID and token stay in
     Netlify — nothing secret is stored in the CRM.
   · Which number a person's text to a customer goes out on (texts.js "📱 Text them" / templates / the PM's texts, the
     portal welcome the PM approves, a staff reply relayed from a cell):
       1) sticky — the number this customer's conversation is already on (they texted it, or we texted them from a local
          number), while that number is still one of ours;
       2) the local number whose area codes include the customer's area code;
       3) else the main GrayCo number (the caller's default — TWILIO_FROM / the purpose's number).
     Subs and texts to staff cells never use it (they keep their own numbers).
   · Nothing here sends a text, and nothing here decides WHETHER a customer is texted (STOP and consent stay per customer
     phone, across every number, in missed-call.js / smsconsent.js). It only picks the From.
   · A2P 10DLC: every number must be in the messaging campaign's sender pool (Twilio → Messaging → Services → the service →
     Sender pool), or its texts are not delivered.
   Pure functions + a small store (kvGet / kvCas passed in).
   ========================================================================== */
'use strict';
const KEY = 'gc_sms_local';
const STICKY_KEY = 'gc_sms_local_sticky';
const ENV_KEY = 'TWILIO_LOCAL_NUMBERS';
const MAX = 20, STICKY_MAX = 5000, STICKY_DAYS = 365;
const STATES = { MS: 'Mississippi', AR: 'Arkansas', TN: 'Tennessee', AL: 'Alabama', MO: 'Missouri', KY: 'Kentucky', LA: 'Louisiana', GA: 'Georgia', TX: 'Texas' };
const EXAMPLE = [{ state: 'MS', codes: ['662', '601', '769', '228'] }, { state: 'AR', codes: ['870', '501', '479'] }, { state: 'TN', codes: ['901', '731'] }];
const A2P_NOTE = 'A2P 10DLC: every new number must be added to the existing messaging campaign\'s sender pool (Twilio → Messaging → Services → the service → Sender pool → Add), or its texts will not be delivered.';

function s(v){ return v == null ? '' : String(v).trim(); }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function codesOf(v){
  const raw = Array.isArray(v) ? v : s(v).split(/[^0-9]+/);
  const out = [];
  raw.map(x => s(x).replace(/\D/g, '')).forEach(c => { if (/^[2-9]\d\d$/.test(c) && out.indexOf(c) < 0) out.push(c); });
  return out.slice(0, 12);
}
/* one entry → { state, codes, number, label } or null (a number is required; area codes are what make it useful) */
function cleanOne(x){
  if (!x || typeof x !== 'object') return null;
  const number = phone10(x.number || x.phone || x.from);
  if (number.length !== 10) return null;
  const state = s(x.state).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return { state, codes: codesOf(x.codes != null ? x.codes : x.areaCodes), number, label: s(x.label).replace(/[<>]/g, '').slice(0, 60) };
}
function clean(list){
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = []; } }
  if (list && !Array.isArray(list) && Array.isArray(list.list)) list = list.list;
  const seen = {};
  return (Array.isArray(list) ? list : []).map(cleanOne).filter(x => x && !seen[x.number] && (seen[x.number] = 1)).slice(0, MAX);
}
/* TWILIO_LOCAL_NUMBERS: a JSON array like the admin list, or { "MS": { codes, number }, … } */
function fromEnv(env){
  const raw = s(env && env(ENV_KEY)); if (!raw) return [];
  let v; try { v = JSON.parse(raw); } catch (e) { return []; }
  if (v && !Array.isArray(v) && typeof v === 'object') v = Object.keys(v).map(k => Object.assign({ state: k }, v[k] && typeof v[k] === 'object' ? v[k] : { number: v[k] }));
  return clean(v);
}
/* the working list: the admin list first, then Netlify's numbers that are not on it */
function list(saved, env){
  const a = clean(saved).map(x => Object.assign({ src: 'crm' }, x)), have = {};
  a.forEach(x => { have[x.number] = 1; });
  return a.concat(fromEnv(env).filter(x => !have[x.number]).map(x => Object.assign({ src: 'netlify' }, x)));
}
function byNumber(l, num){ const d = phone10(num); return (l || []).find(x => x.number === d) || null; }
function forArea(l, ph){ const a = phone10(ph).slice(0, 3); if (a.length !== 3) return null; return (l || []).find(x => x.codes.indexOf(a) >= 0) || null; }

/* the decision (pure).  o: { list, sticky: { number, at } | null, ours: [10-digit numbers of ours that are not local], fallback: '+1…' | '' }
   → { from: '+1…' | '', number: 10 digits | '', local: entry | null, why: 'sticky' | 'area' | 'main' } */
function pick(ph, o){
  o = o || {};
  const l = o.list || [], ours = (o.ours || []).map(phone10), fb = phone10(o.fallback);
  const st = o.sticky && phone10(o.sticky.number);
  if (st && st.length === 10) {
    const e = byNumber(l, st);
    if (e) return { from: '+1' + st, number: st, local: e, why: 'sticky' };
    if (ours.indexOf(st) >= 0) return { from: '+1' + st, number: st, local: null, why: 'sticky' };
  }
  const e = forArea(l, ph);
  if (e) return { from: '+1' + e.number, number: e.number, local: e, why: 'area' };
  return { from: fb.length === 10 ? '+1' + fb : '', number: fb.length === 10 ? fb : '', local: null, why: 'main' };
}
function label(r){
  if (!r || !r.number) return '';
  return 'Sending from ' + tidy(r.number) + (r.local ? ' · ' + [r.local.state, r.local.label].filter(Boolean).join(' ') + ' local number' : ' · main GrayCo number') + (r.why === 'sticky' ? ' (this customer\'s number)' : '');
}
function via(num){ const d = phone10(num); return d.length === 10 ? '(' + d.slice(0, 3) + ')' : ''; }

/* ── the store ── */
function sticky0(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function pruneSticky(m, nowMs){
  const cut = new Date((nowMs || Date.now()) - STICKY_DAYS * 864e5).toISOString();
  Object.keys(m).forEach(k => { if (!m[k] || s(m[k].at) < cut) delete m[k]; });
  const keys = Object.keys(m);
  if (keys.length > STICKY_MAX) keys.sort((a, b) => s(m[a].at).localeCompare(s(m[b].at))).slice(0, keys.length - STICKY_MAX).forEach(k => { delete m[k]; });
  return m;
}
function make(d){
  d = d || {};
  const env = d.env || (k => s(process.env[k]));
  const now = d.now || (() => Date.now());
  async function load(){ try { return list(await d.kvGet(KEY), env); } catch (e) { return list(null, env); } }
  async function stickyOf(ph){ try { return sticky0(await d.kvGet(STICKY_KEY))[phone10(ph)] || null; } catch (e) { return null; } }
  /* remember the number this customer's conversation is on (one write; same number → no write) */
  async function remember(ph, num, why){
    ph = phone10(ph); num = phone10(num); if (ph.length !== 10 || num.length !== 10 || !d.kvCas) return false;
    const at = new Date(now()).toISOString();
    try { await d.kvCas(STICKY_KEY, v => { const m = Object.assign({}, sticky0(v)); if (m[ph] && m[ph].number === num) return undefined; m[ph] = { number: num, at, why: s(why).slice(0, 20) }; return pruneSticky(m, now()); }); return true; } catch (e) { return false; }
  }
  /* the From for a person's text to a customer.  o: { fallback, ours } */
  async function fromFor(ph, o){
    o = o || {};
    const l = await load();
    const st = l.length || (o.ours && o.ours.length) ? await stickyOf(ph) : null;
    return pick(ph, { list: l, sticky: st, ours: o.ours || [], fallback: o.fallback || env('TWILIO_FROM') });
  }
  /* after a send: a local number (or a sticky one) is remembered; the main number by fallback is not, so a customer moves to a
     local number once one is added for their area code */
  async function afterSend(ph, r){ if (r && r.number && (r.local || r.why === 'sticky')) return remember(ph, r.number, 'sent'); return false; }
  return { load, stickyOf, remember, fromFor, afterSend };
}
module.exports = { KEY, STICKY_KEY, ENV_KEY, STATES, EXAMPLE, A2P_NOTE, clean, cleanOne, codesOf, fromEnv, list, byNumber, forArea, pick, label, via, tidy, phone10, make, pruneSticky };
