/* netlify/functions/_lib/mmmsg.js — patch MKTOFFICE (owner 11/19: "need to be able to send messages to the marketing manager too
   from admin").
   A direct message thread between the admins and each Marketing Manager (the marketing ROLE: a gc_staff row with profile
   'marketing' and mkt_active — never a name). The Marketing Manager is not on the staff rules (he cannot read gc_kv), so the
   thread lives on the server: gc_kv "gc_mm_msgs" = { msgs: [{ id, at, thread: <his e-mail>, from, fromName, fromRole, text,
   readBy: { <e-mail>: at } }] } (newest 1000), read and written only through netlify/functions/soc.js (ops mmmsg_list,
   mmmsg_send, mmmsg_read: an admin, or the Marketing Manager for his own thread; his answers are redacted there).
   Notifications (JOBMSG style, 5-minute throttle per thread, a message id never twice):
     • admin → him: the in-CRM message (his 📣 Marketing page shows it on top) + a TEXT to the cell on his CRM people record
       from the GrayCo alerts number (_lib/smsalert.js _D.send, tagged 'staff'). His e-mail is outside @grayco-cs.com, so the
       staff text list (smsalert.notify) and the staff phone push (_lib/staffpush.js, staff e-mails only) cannot reach him —
       this sends to his cell directly. No cell on file → in the CRM only (the answer says so). 🌙 Staff quiet hours (default
       9 PM → 7 AM): no text at night (a 🚨 message goes) — it is held and sent by the next mmmsg call after 7 AM. Opt-out (STOP)
       is respected. Customer phone numbers / e-mails / house numbers typed into the message are masked in the text.
     • him → the admins: the admins who wrote in his thread in the last 30 days (none → every admin / owner) get the JOBMSG
       notification: a phone push + a staff text (smsalert.notify, quiet hours held to 7 AM there).
   Tests: tools/tests/test_MKTOFFICE_fn.mjs swaps _D. */
'use strict';
const KEY = 'gc_mm_msgs', STATE = 'gc_mm_msgs_notify';
const THROTTLE_MS = 5 * 60 * 1000, MAXN = 1000, MAXTXT = 300;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ v = s(v).replace(/\s+/g, ' '); return v.length > n ? v.slice(0, Math.max(0, n - 1)) + '…' : v; }
function d10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function staffEmail(e){ return /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(low(e)); }
function site(){ return (s(process.env.CRM_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function first(n){ return s(n).split(/\s+/)[0] || s(n); }
function inactive(u){ return !u || u.active === false || u.disabled === true || !!u.terminated || !!u.departed || /^(inactive|terminated|disabled|former|let go)$/i.test(s(u.status)); }
function ownerEmails(){ return (s(process.env.OWNER_EMAILS) || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(Boolean); }

/* ── dependencies (tests swap these) ── */
function L(){ return require('../bid-inbox.js')._lib; }
const _D = {
  now: function(){ return Date.now(); },
  kvGet: function(k){ return L().kvGet(k); },
  kvCas: function(k, f){ return L().kvCas(k, f); },
  /* the CRM's people list + gc_staff (with the marketing profile columns) */
  people: async function(){
    let users = [], staff = [];
    try { users = arr((await require('../portal.js')._core.kvRead(['users'])).users); } catch (e) {}
    try { const r = await L().sb('gc_staff?select=email,name,role,active,profile,mkt_active'); if (r && r.ok) staff = arr(await r.json()); } catch (e) {}
    return { users: users, staff: staff };
  },
  quiet: async function(ms){ const SQ = require('./staffquiet.js'); return SQ.quiet(ms, await SQ.settings()); },
  optouts: function(){ return require('./smsalert.js')._D.optouts(); },
  sms: function(to10, body){ return require('./smsalert.js')._D.send(to10, body, undefined, 'staff'); },
  push: function(emails, payload, opts){ return require('./staffpush.js').send(emails, payload, opts); },
  text: function(o){ return require('./smsalert.js').notify(o); },
  scrub: function(t){ try { return require('./mm.js').scrubText(String(t)); } catch (e) { return String(t); } }
};

/* ── who ── */
/* the Marketing Managers: gc_staff rows with profile 'marketing' + mkt_active (the server's own rule, mm.js); their name and
   cell from the CRM people record with the same e-mail */
function managers(pp){
  pp = pp || {}; const out = [], seen = {};
  const userBy = {}; arr(pp.users).forEach(function(u){ const e = low(u.email); if (e && !userBy[e]) userBy[e] = u; });
  arr(pp.staff).forEach(function(r){
    const e = low(r.email); if (!e || seen[e] || low(r.profile) !== 'marketing' || r.mkt_active !== true) return;
    const u = userBy[e] || {}; if (u.email && (u.departed || u.terminated || u.disabled === true)) return;   /* let go: no thread */
    seen[e] = 1; out.push({ email: e, name: s(u.name) || s(r.name) || e.split('@')[0], cell: d10(u.cell || u.mobile || u.cellPhone || u.phone) });
  });
  return out.map(function(m){ if (m.cell.length !== 10) m.cell = ''; return m; });
}
function admins(pp){
  pp = pp || {}; const by = {}, owners = ownerEmails();
  arr(pp.users).forEach(function(u){ const e = low(u.email); if (!staffEmail(e) || inactive(u)) return; if (/^admin$/i.test(s(u.role)) || low(u.payType) === 'owner' || owners.indexOf(e) >= 0) by[e] = { email: e, name: s(u.name) || e }; });
  arr(pp.staff).forEach(function(r){ const e = low(r.email); if (!staffEmail(e)) return; if (r.active === false) { delete by[e]; return; } if (low(r.role) === 'admin' && !by[e]) by[e] = { email: e, name: s(r.name) || e }; });
  return Object.keys(by).map(function(e){ return by[e]; });
}

/* ── the store ── */
function store(v){ const o = obj(v); return { msgs: arr(o.msgs) }; }
function threadOf(who, b, mgrs){
  if (who.marketing) return low(who.email);
  const t = low(b && b.thread);
  if (t && mgrs.some(function(m){ return m.email === t; })) return t;
  return mgrs.length === 1 ? mgrs[0].email : '';
}
function view(m, me, marketing){
  const o = { id: s(m.id), at: s(m.at), fromName: s(m.fromName), fromRole: s(m.fromRole), text: s(m.text), mine: low(m.from) === me, read: !!obj(m.readBy)[me] };
  const others = Object.keys(obj(m.readBy)).filter(function(e){ return e !== low(m.from); });
  o.seen = others.length > 0;
  if (!marketing) { o.thread = s(m.thread); o.from = s(m.from); }
  return o;
}

/* ── notifications ── */
function textBody(more, head, msg, link){
  const pre = 'GrayCo' + (more ? ' (+' + more + ' more)' : '') + ': ' + head + ': ';
  const tail = ' ' + s(link).replace(/^https?:\/\//, '');
  return pre + clip(msg, Math.max(20, MAXTXT - pre.length - tail.length)) + tail;
}
/* a throttle slot for (person|thread): true = notify now; { more } counts the messages folded into the next one */
async function claim(key, msgId, t){
  let go = false, more = 0;
  try {
    await _D.kvCas(STATE, function(v){
      const st = obj(v); go = false; more = 0;
      Object.keys(st).forEach(function(k){ if (k !== '__held' && t - Date.parse(s(st[k] && st[k].at) || 0) > 86400000) delete st[k]; });
      const last = st[key];
      if (last && msgId && Array.isArray(last.ids) && last.ids.indexOf(msgId) >= 0) return st;
      if (last && t - Date.parse(s(last.at) || 0) < THROTTLE_MS) { last.more = (+last.more || 0) + 1; last.ids = (Array.isArray(last.ids) ? last.ids : []).concat(msgId ? [msgId] : []).slice(-20); return st; }
      more = last ? (+last.more || 0) : 0; st[key] = { at: new Date(t).toISOString(), more: 0, ids: msgId ? [msgId] : [] }; go = true; return st;
    });
  } catch (e) { go = true; }
  return { go: go, more: more };
}
async function holdText(mm, body){
  try { await _D.kvCas(STATE, function(v){ const st = obj(v), h = obj(st.__held); h[mm.email] = { at: new Date(_D.now()).toISOString(), body: body, n: (+obj(h[mm.email]).n || 0) + 1 }; st.__held = h; return st; }); return true; } catch (e) { return false; }
}
/* the held night texts go once the quiet hours are over (any mmmsg call) */
async function flushHeld(pp){
  const t = _D.now(); let q = false; try { q = !!(await _D.quiet(t)); } catch (e) { q = false; }
  if (q) return [];
  let take = {};
  try { await _D.kvCas(STATE, function(v){ const st = obj(v), h = obj(st.__held); take = h; if (!Object.keys(h).length) return undefined; st.__held = {}; return st; }); } catch (e) { return []; }
  const sent = []; const mgrs = managers(pp || await _D.people());
  for (const e of Object.keys(take)) {
    const mm = mgrs.filter(function(m){ return m.email === e; })[0]; if (!mm || !mm.cell) continue;
    const x = take[e]; let body = s(x.body); if (+x.n > 1) body = body.replace(/^GrayCo(?: \(\+\d+ more\))?:/, 'GrayCo (+' + (+x.n - 1) + ' more):');
    try { await _D.sms(mm.cell, body); sent.push(e); } catch (e2) {}
  }
  return sent;
}
async function notifyManager(mm, msg, sender, t){
  const r = { name: mm.name, texted: false, held: false, throttled: false, noPhone: !mm.cell, pushed: false, pushWhy: 'the Marketing Manager is not on the staff push list (his e-mail is outside @grayco-cs.com) — the text goes to his CRM cell' };
  if (!mm.cell) return r;
  const c = await claim(mm.email + '|' + mm.email, msg.id, t); if (!c.go) { r.throttled = true; return r; }
  let opt = {}; try { opt = obj(await _D.optouts()); } catch (e) {}
  if (opt[mm.cell]) { r.optout = true; return r; }
  const head = first(sender.name) + ' (admin)', link = site() + '/?mmmsg=1';
  const body = textBody(c.more, head, _D.scrub(msg.text), link);
  const emergency = /^\s*🚨/.test(msg.text);
  let quiet = false; if (!emergency) { try { quiet = !!(await _D.quiet(t)); } catch (e) { quiet = false; } }
  if (quiet) { r.held = await holdText(mm, body); return r; }
  try { const a = await _D.sms(mm.cell, body); r.texted = !(a && (a.ok === false || a.error)); if (!r.texted) r.error = s(a && (a.error || a.why)); } catch (e) { r.error = s(e && e.message); }
  return r;
}
async function notifyAdmins(list, msg, mm, t){
  const out = [];
  const go = [], more = {};
  for (const a of list) { const c = await claim(a.email + '|' + mm.email, msg.id, t); if (c.go) { go.push(a.email); more[a.email] = c.more; } else out.push({ name: a.name, throttled: true }); }
  if (!go.length) return out;
  const head = first(mm.name) + ' (marketing)', link = site() + '/?mmmsg=' + encodeURIComponent(mm.email);
  const emergency = /^\s*🚨/.test(msg.text);
  const res = {}; go.forEach(function(e){ res[e] = { name: (list.filter(function(a){ return a.email === e; })[0] || {}).name || e, pushed: false, texted: false, held: false }; });
  let P = null; try { P = await _D.push(go, { title: '💬 ' + clip(head, 100), body: clip(msg.text, 200), url: link, tag: 'mmmsg-' + mm.email }, { noAway: true, emergency: emergency }); } catch (e) { P = null; }
  arr(P && P.to ? P.to.map(function(e){ return { e: e }; }) : []).forEach(function(x){ if (res[low(x.e)]) res[low(x.e)].pushed = true; });
  (Array.isArray(P && P.held) ? P.held : []).forEach(function(e){ if (res[low(e)]) res[low(e)].held = true; });
  let T = null;
  try { T = await _D.text({ type: 'jobmsg', only: go, emergency: emergency, hold: true, sqOnly: true, thread: 'mmmsg:' + mm.email, text: head + ': ' + clip(msg.text, 160), link: link,
    body: function(m2){ return textBody(m2 || 0, head, msg.text, link); } }); } catch (e) { T = null; }
  (Array.isArray(T && T.to) ? T.to : []).forEach(function(e){ if (res[low(e)]) res[low(e)].texted = true; });
  arr(obj(T && T.skipped).held ? obj(T.skipped).held.map(function(e){ return { e: e }; }) : []).forEach(function(x){ if (res[low(x.e)]) res[low(x.e)].held = true; });
  go.forEach(function(e){ const r = res[e]; if (!r.pushed && !r.texted && !r.held) r.noPhone = true; out.push(r); });
  return out;
}

/* ── the ops (soc.js) ── */
/* op(op, body, who, { marketing, admin }) → { status, out } */
async function op(name, b, who, ctx){
  b = b || {}; ctx = ctx || {}; who = who || {};
  const me = low(who.email), marketing = !!(ctx.marketing || who.marketing);
  if (!marketing && !ctx.admin) return { status: 403, out: { ok: false, error: 'Messages to marketing: admins and the Marketing Manager.' } };
  const pp = await _D.people(), mgrs = managers(pp);
  if (marketing && !mgrs.some(function(m){ return m.email === me; })) mgrs.push({ email: me, name: s(who.name) || me.split('@')[0], cell: '' });
  try { await flushHeld(pp); } catch (e) {}
  const t = _D.now(), at = new Date(t).toISOString();
  if (name === 'mmmsg_list') {
    const st = store(await _D.kvGet(KEY));
    if (marketing) return { status: 200, out: { ok: true, msgs: st.msgs.filter(function(m){ return low(m.thread) === me; }).slice(-200).map(function(m){ return view(m, me, true); }), unread: st.msgs.filter(function(m){ return low(m.thread) === me && low(m.from) !== me && !obj(m.readBy)[me]; }).length } };
    const threads = mgrs.map(function(m){ const l = st.msgs.filter(function(x){ return low(x.thread) === m.email; }); return { email: m.email, name: m.name, cell: !!m.cell, n: l.length, unread: l.filter(function(x){ return low(x.from) !== me && !obj(x.readBy)[me] && x.fromRole === 'marketing'; }).length, last: l.length ? s(l[l.length - 1].at) : '' }; });
    const th = threadOf(who, b, mgrs);
    return { status: 200, out: { ok: true, threads: threads, thread: th, msgs: th ? st.msgs.filter(function(m){ return low(m.thread) === th; }).slice(-200).map(function(m){ return view(m, me, false); }) : [] } };
  }
  if (name === 'mmmsg_read') {
    const th = threadOf(who, b, mgrs); if (!th) return { status: 400, out: { ok: false, error: 'Which thread?' } };
    let n = 0;
    await _D.kvCas(KEY, function(v){ const st = store(v); n = 0; st.msgs.forEach(function(m){ if (low(m.thread) === th && low(m.from) !== me && !obj(m.readBy)[me]) { m.readBy = Object.assign({}, obj(m.readBy)); m.readBy[me] = at; n++; } }); return n ? st : undefined; });
    return { status: 200, out: { ok: true, marked: n } };
  }
  if (name === 'mmmsg_send') {
    const text = s(b.text).slice(0, 2000); if (!text) return { status: 400, out: { ok: false, error: 'Type a message first.' } };
    const th = threadOf(who, b, mgrs); if (!th) return { status: 400, out: { ok: false, error: mgrs.length ? 'Pick the Marketing Manager.' : 'No Marketing Manager is set up (Admin → people: the marketing profile).' } };
    const mm = mgrs.filter(function(m){ return m.email === th; })[0];
    const id = /^[A-Za-z0-9_-]{6,60}$/.test(s(b.id)) ? s(b.id) : 'MM' + t.toString(36) + Math.random().toString(36).slice(2, 7);
    const ad = admins(pp);
    const sender = { email: me, name: marketing ? mm.name : ((ad.filter(function(a){ return a.email === me; })[0] || {}).name || s(who.name) || me.split('@')[0]) };
    const msg = { id: id, at: at, thread: th, from: me, fromName: sender.name, fromRole: marketing ? 'marketing' : 'admin', text: text, readBy: {} };
    msg.readBy[me] = at;
    let dup = false;
    await _D.kvCas(KEY, function(v){ const st = store(v); dup = st.msgs.some(function(m){ return m.id === id; }); if (dup) return undefined; st.msgs.push(msg); if (st.msgs.length > MAXN) st.msgs = st.msgs.slice(-MAXN); return st; });
    const out = { ok: true, id: id, at: at, dup: dup, to: [] };
    if (dup) return { status: 200, out: out };
    if (!marketing) out.to.push(await notifyManager(mm, msg, sender, t));
    else {
      const st = store(await _D.kvGet(KEY)), cut = t - 30 * 864e5, wrote = {};
      st.msgs.forEach(function(m){ if (low(m.thread) === th && m.fromRole === 'admin' && Date.parse(m.at) >= cut) wrote[low(m.from)] = 1; });
      let list = ad.filter(function(a){ return wrote[a.email]; }); if (!list.length) list = ad;
      out.to = await notifyAdmins(list, msg, mm, t);
    }
    return { status: 200, out: out };
  }
  return { status: 400, out: { ok: false, error: 'Unknown op' } };
}
module.exports = { KEY, STATE, THROTTLE_MS, _D, managers, admins, textBody, op, flushHeld };
