/* netlify/functions/_lib/jobmsgnotify.js — patch JOBMSG (owner 11/19, on his iPhone in 💬 Job Messages, PO C846: "make sure if I
   message the team down there they get a notification").
   Until now a team message on a job only showed in the CRM's 💬 Messages (patch JOBMENTION). Now each person it is meant for
   also gets a REAL notification:
     • who: every person @tagged in the message (a tap on a chip or "@Name" typed; @Office = everybody in the office ROLE);
       nobody tagged → the job's PM (no PM on the job → the owners / admins, the CRM's own rule); NEVER the sender;
       only GrayCo staff addresses (@grayco-cs.com) can be reached by phone;
     • 🏖 Away: an away admin gets nothing — their cover does (_lib/away.js); the sender is taken out again after that;
     • how: a phone push when that person turned phone notifications on (_lib/staffpush.js — needs the VAPID keys in Netlify),
       PLUS a text to their cell from the GrayCo alerts number (_lib/smsalert.js notify — the 📱 Text alerts card row when
       there is one, else the cell on their CRM people record; a row switched off = no text). Both are tagged 'staff', so
       ⏸ data-entry mode lets them through (it only stops texts / e-mails to customers, subs and the public);
     • 🌙 quiet hours (_lib/staffquiet.js, default 9 PM → 7 AM): held and delivered in the 7 AM bundle (push) / the first
       alerts run after 7 AM (text). A message that starts with 🚨 counts as an emergency and goes at once;
     • throttle: at most ONE notification per person per job thread per 5 minutes — a burst of messages is one text; the next
       one after the pause says "(+N more)". A message already notified (same id, e.g. a retry) is never sent twice.
   The text: "GrayCo: Wesley on Outdoor Entertainment Area (C846): <message, clipped> crm.grayco-cs.com/?jobmsg=<job>"
   (≤ 300 characters; the link opens that job's 💬 Job Messages).
   Tests: tools/tests/test_JOBMSG_fn.mjs swap _D (people / jobs, push, text, state, clock, away, quiet). */
'use strict';
const STATE = 'gc_jobmsg_notify_state';
const THROTTLE_MS = 5 * 60 * 1000;
const MAX = 300;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ v = s(v).replace(/\s+/g, ' '); return v.length > n ? v.slice(0, Math.max(0, n - 1)) + '…' : v; }
function staffEmail(e){ return /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(low(e)); }
function site(){ return (s(process.env.CRM_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function core(){ return require('../portal.js')._core; }

/* ── dependencies (tests swap these) ── */
const _D = {
  now: function(){ return Date.now(); },
  data: async function(){ return core().kvRead(['users', 'projects']); },
  away: async function(ms){ return require('./away.js').activeNow(ms); },
  quiet: async function(ms){ const SQ = require('./staffquiet.js'); return SQ.quiet(ms, await SQ.settings()); },
  push: function(emails, payload, opts){ return require('./staffpush.js').send(emails, payload, opts); },
  text: function(o){ return require('./smsalert.js').notify(o); },
  stateCas: function(f){ return require('../bid-inbox.js')._lib.kvCas(STATE, f); }
};

/* ── people (the same rules as the page's patch JOBMENTION) ── */
var STATS = /\s+[—–-]+\s+\d+\s+jobs?\b.*$/;
function clean(n){ return s(n).replace(STATS, '').replace(/\s+/g, ' ').trim(); }
function first(n){ return clean(n).split(' ')[0] || clean(n); }
function inactive(u){ return !u || u.active === false || u.disabled === true || !!u.terminated || !!u.letGo || !!u.departed || /^(inactive|terminated|disabled|former|let go)$/i.test(s(u.status)); }
function external(u){ return /\b(sub|subcontractor|customer|client|vendor|supplier|homeowner)\b/i.test(s(u.role) + ' ' + s(u.type) + ' ' + s(u.profile)) || !!u.isCustomer || !!u.isSub; }
function isOffice(u){ return !!u && (/office/i.test(s(u.role) + ' ' + s(u.title)) || low(u.email).indexOf('office@') === 0 || /^office$/i.test(clean(u.name))); }
function isOwner(u){ return !!u && !isOffice(u) && (/^(admin|owner)$/i.test(s(u.role)) || low(u.payType) === 'owner'); }
function staffOf(users){ return arr(users).filter(function(u){ return !inactive(u) && !external(u) && (clean(u.name) || s(u.email)); }); }
function userBy(staff, v){
  const k = low(clean(v)); if (!k) return null;
  return staff.filter(function(u){ return low(u.id) === k || low(u.email) === k || low(clean(u.name)) === k; })[0] || null;
}
function hasAt(t, k){ let i = -1; while ((i = t.indexOf(k, i + 1)) >= 0) { if (!/[a-z0-9]/.test(t.charAt(i + k.length))) return true; } return false; }
/* "@First Last" (or "@First" when only one person has that first name) and "@Office" in the text */
function parseText(text, staff){
  const t = ' ' + low(text) + ' ', out = [];
  if (t.indexOf('@') < 0) return out;
  staff.forEach(function(u){
    const n = clean(u.name); if (!n) return;
    const f = low(first(n));
    if (hasAt(t, '@' + low(n)) || (staff.filter(function(y){ return low(first(y.name)) === f; }).length === 1 && hasAt(t, '@' + f))) out.push(u);
  });
  if (hasAt(t, '@office')) out.push({ __office: true });
  return out;
}
/* who is tagged: [{ email, name }] (Office → every active staff member in the office role) */
function mentions(b, staff){
  const out = [];
  const add = function(u){ if (!u) return; if (u.__office || /^office$/i.test(clean(u.name))) { staff.filter(isOffice).forEach(function(x){ push(x); }); return; } push(u); };
  const push = function(u){ const e = low(u.email), n = clean(u.name) || e; if (out.some(function(y){ return (e && y.email === e) || (!e && low(y.name) === low(n)); })) return; out.push({ email: e, name: n }); };
  (Array.isArray(b.tags) ? b.tags : []).slice(0, 30).forEach(function(t){ if (/^office$/i.test(s(t))) add({ __office: true }); else add(userBy(staff, t)); });
  parseText(b.text, staff).forEach(add);
  return out;
}
function project(data, pid){ return arr(data.projects).filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
/* nobody tagged → the job's PM; no PM (or "Office") → the owners */
function fallback(p, staff){
  const n = clean(p && p.pm);
  if (n && !/^office$/i.test(n)) { const u = userBy(staff, n); if (u) return { list: [{ email: low(u.email), name: clean(u.name) }], why: 'pm' }; }
  return { list: staff.filter(isOwner).map(function(u){ return { email: low(u.email), name: clean(u.name) }; }), why: 'owner' };
}
/* pure: who this message tells → { list: [{ email, name, why }], why } (sender out) */
function recipients(b, data, sender){
  const staff = staffOf(data.users), me = low(sender && sender.email);
  let list = mentions(b, staff).map(function(x){ return Object.assign(x, { why: 'mention' }); }), why = 'mention';
  if (!list.length) { const f = fallback(project(data, b.pid), staff); why = f.why; list = f.list.map(function(x){ return Object.assign(x, { why: f.why }); }); }
  list = list.filter(function(x){ return !(me && x.email === me); });
  return { list: list, why: why };
}
function jobLabel(p, pid){
  if (!p) return 'a job';
  const nm = s(p.name) || s(p.address).split(',')[0] || s(pid), po = s(p.autoPO || p.poNumber || p.po);
  return nm + (po && nm.indexOf(po) < 0 ? ' (' + po + ')' : '');
}
function textBody(more, head, msg, link){
  const pre = 'GrayCo' + (more ? ' (+' + more + ' more)' : '') + ': ' + head + ': ';
  const tail = ' ' + s(link).replace(/^https?:\/\//, '');
  return pre + clip(msg, Math.max(20, MAX - pre.length - tail.length)) + tail;
}

/* run({ email, name }, { pid, msgId, text, tags, head?, link? (PORTALPOL: a customer's portal message — the CRM's own address only) }) → { ok, to: [{ email, name, why, pushed, texted, held, throttled, noPhone }], … } */
async function run(who, b){
  b = b || {};
  const pid = s(b.pid).slice(0, 80), msgId = s(b.msgId).slice(0, 80), msg = s(b.text).slice(0, 2000);
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return { ok: false, code: 400, error: 'Bad job id.' };
  if (!msg) return { ok: false, code: 400, error: 'No message.' };
  const t = _D.now(), at = new Date(t).toISOString();
  let data = {}; try { data = obj(await _D.data()); } catch (e) { return { ok: false, code: 502, error: 'Could not read the people list — try again.' }; }
  const sender = { email: low(who && who.email), name: s(who && who.name) };
  const su = staffOf(data.users).filter(function(u){ return low(u.email) === sender.email; })[0];
  const sname = first(clean(su && su.name) || sender.name || sender.email.split('@')[0]) || 'Someone';
  const R = recipients({ pid: pid, text: msg, tags: b.tags }, data, sender);
  const out = { ok: true, why: R.why, to: [], skipped: { notStaff: [], sender: false } };
  let want = R.list.filter(function(x){ if (staffEmail(x.email)) return true; out.skipped.notStaff.push(x.name || x.email); return false; });
  const nameOf = {}; want.forEach(function(x){ nameOf[x.email] = x.name; });
  const whyOf = {}; want.forEach(function(x){ whyOf[x.email] = x.why; });
  /* 🏖 Away: an away person → their cover (or nobody); never the sender */
  let emails = want.map(function(x){ return x.email; });
  try {
    const am = await _D.away(t);
    if (am && Object.keys(am).length) {
      const before = emails.slice();
      emails = require('./away.js').redirect(emails, am);
      before.forEach(function(e){ if (am[e]) { out.away = out.away || []; out.away.push(e); } });
      const usersAll = arr(data.users);
      emails.forEach(function(e){ if (!nameOf[e]) { const u = usersAll.filter(function(x){ return low(x.email) === e; })[0]; nameOf[e] = clean(u && u.name) || e; whyOf[e] = 'cover'; } });
    }
  } catch (e) {}
  emails = emails.filter(function(e, i, a){ return e && e !== sender.email && a.indexOf(e) === i; });
  if (!emails.length) return out;
  /* throttle: one per person per job thread per 5 minutes; a message id is never notified twice */
  const go = [], thr = [], more = {};
  try {
    await _D.stateCas(function(v){
      const st = obj(v); go.length = 0; thr.length = 0;
      Object.keys(st).forEach(function(k){ if (t - Date.parse(s(st[k] && st[k].at) || 0) > 86400000) delete st[k]; });
      emails.forEach(function(e){
        const k = e + '|' + pid, last = st[k];
        if (last && msgId && Array.isArray(last.ids) && last.ids.indexOf(msgId) >= 0) { thr.push(e); return; }
        if (last && t - Date.parse(s(last.at) || 0) < THROTTLE_MS) { last.more = (+last.more || 0) + 1; if (msgId) last.ids = (Array.isArray(last.ids) ? last.ids : []).concat([msgId]).slice(-20); thr.push(e); return; }
        more[e] = last ? (+last.more || 0) : 0;
        st[k] = { at: at, more: 0, ids: msgId ? [msgId] : [] };
        go.push(e);
      });
      return st;
    });
  } catch (e) { go.length = 0; thr.length = 0; emails.forEach(function(x){ go.push(x); more[x] = 0; }); }   /* the throttle cannot be read: notify (better twice than never) */
  thr.forEach(function(e){ out.to.push({ email: e, name: nameOf[e] || e, why: whyOf[e] || '', throttled: true }); });
  if (!go.length) return out;

  const p = project(data, pid), job = jobLabel(p, pid), head = s(b.head).slice(0, 140) || (sname + ' on ' + job);   /* PORTALPOL: a customer's portal message names its own head / link */
  const link = /^https:\/\/[^\s]+$/.test(s(b.link)) && s(b.link).indexOf(site() + '/') === 0 ? s(b.link) : site() + '/?jobmsg=' + encodeURIComponent(pid);
  const emergency = /^\s*🚨/.test(msg) || b.emergency === true;
  let quiet = false; if (!emergency) { try { quiet = !!(await _D.quiet(t)); } catch (e) { quiet = false; } }
  out.quiet = quiet;
  /* the phone push (held by staffpush for the 7 AM bundle inside the quiet hours) */
  const byMore = {}; go.forEach(function(e){ const m = more[e] || 0; (byMore[m] = byMore[m] || []).push(e); });
  const res = {}; go.forEach(function(e){ res[e] = { email: e, name: nameOf[e] || e, why: whyOf[e] || '', pushed: false, texted: false, held: false }; });
  for (const m of Object.keys(byMore)) {
    let P = null;
    try { P = await _D.push(byMore[m], { title: '💬 ' + clip(head, 100), body: clip(msg, 200) + (+m ? ' (+' + m + ' more)' : ''), url: link, tag: 'jobmsg-' + pid }, { noAway: true, emergency: emergency }); } catch (e) { P = { error: s(e && e.message) }; }
    (Array.isArray(P && P.to) ? P.to : []).forEach(function(e){ if (res[low(e)]) res[low(e)].pushed = true; });
    (Array.isArray(P && P.held) ? P.held : []).forEach(function(e){ if (res[low(e)]) res[low(e)].held = true; });
    if (P && P.why) out.pushWhy = P.why;
    /* the text to their cell (smsalert holds it inside the quiet hours and sends it after 7 AM) */
    let T = null;
    try {
      T = await _D.text({ type: 'jobmsg', only: byMore[m], emergency: emergency, hold: true, sqOnly: true, thread: 'jobmsg:' + pid,
        text: head + ': ' + clip(msg, 160), link: link, body: function(more2){ return textBody((+m || 0) + (more2 || 0), head, msg, link); } });
    } catch (e) { T = { error: s(e && e.message) }; }
    (Array.isArray(T && T.to) ? T.to : []).forEach(function(e){ if (res[low(e)]) res[low(e)].texted = true; });
    const sk = obj(T && T.skipped);
    (Array.isArray(sk.held) ? sk.held : []).forEach(function(e){ if (res[low(e)]) { res[low(e)].held = true; res[low(e)].textHeld = true; } });
    (Array.isArray(sk.optout) ? sk.optout : []).forEach(function(e){ if (res[low(e)]) res[low(e)].optout = true; });
    if (T && (T.off || T.held === 'staff_text_alerts')) out.textWhy = T.off ? 'staff texts are off (SMS_ALERTS_OFF)' : 'the staff text alerts automation is off';
  }
  go.forEach(function(e){ const r = res[e]; if (!r.pushed && !r.texted && !r.held) r.noPhone = true; out.to.push(r); });
  return out;
}
module.exports = { STATE, THROTTLE_MS, _D, recipients, mentions, jobLabel, textBody, run, isOffice, isOwner };
