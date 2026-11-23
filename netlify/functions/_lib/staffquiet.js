/* netlify/functions/_lib/staffquiet.js — patch AWAY / QUIET (owner 11/16: "From 9 [PM] – 6 [AM] only call-outs and emergency
   notifications go through; all else wait until 7 AM").
   ONE quiet window for every staff notification (default 9 PM → 7 AM Central; Admin: 🏖 Away & notifications → 🌙 Quiet hours,
   gc_kv "gc_staff_quiet" = { on, from: 21, to: 7 }):
     • inside it only emergencies / call-outs go (a 🚨 emergency lead, the on-call call-out chain, anything the sender tags
       'emergency' — custquiet.run('emergency') — or marks { emergency: true });
     • everything else (approval pings, digests / reminders, the 24-hour escalation, lead / bid / sub alerts, the automatic staff
       e-mails) is HELD here: gc_kv "gc_staff_quiet_held" = [{ id, email, kind: 'push' | 'mail', title, body, url, subject, html, at }];
     • at the end of the window (7:00 AM; the 5-minute approval run, appr-ping-scheduled.js) each person gets ONE bundled
       notification: one push "🌙 N overnight: …" (or, with no phone, one staff e-mail listing them), plus — when e-mails were held —
       one staff e-mail carrying them all. _lib/apprping.js folds that person's new approvals into the same push.
   Staff texts (_lib/smsalert.js) keep their own overnight list (held there, sent at 7 AM / when the office opens).
   Tests: D.now. */
'use strict';
const KEY = 'gc_staff_quiet', HELD = 'gc_staff_quiet_held';
const DEF = { on: true, from: 21, to: 7, sat: true, sun: true };   /* QUIETSAT (owner 11/22): "I shouldn't get any on Saturdays unless emergencies" — all of Saturday is quiet; QUIETSUN (owner 11/23): "Sundays quiet too" */
const D = { now: function(){ return Date.now(); } };
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function hourOk(v, d){ const n = parseInt(v, 10); return isFinite(n) && n >= 0 && n <= 23 ? n : d; }
function clean(v){ v = obj(v); return { on: v.on !== false, from: hourOk(v.from, DEF.from), to: hourOk(v.to, DEF.to), sat: v.sat !== false, sun: v.sun !== false }; }
function core(){ return require('../portal.js')._core; }
function hourC(ms){ try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date(ms)), 10) % 24; } catch (e) { return new Date(ms - 6 * 3600e3).getUTCHours(); } }
/* pure: inside the window? */
function dayC(ms){ try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(ms)); } catch (e) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ms - 6 * 3600e3).getUTCDay()]; } }
function quiet(ms, set){ set = set || DEF; if (set.on === false) return false; const wd = (set.sat !== false || set.sun !== false) ? dayC(ms) : ''; if ((set.sat !== false && wd === 'Sat') || (set.sun !== false && wd === 'Sun')) return true;   /* QUIETSAT + QUIETSUN */
  if (set.from === set.to) return false; const h = hourC(ms); return set.from > set.to ? (h >= set.from || h < set.to) : (h >= set.from && h < set.to); }
/* pure: is this an emergency / call-out (always goes)? */
function emergency(o){
  o = o || {};
  if (o.emergency === true) return true;
  try { if (require('./custquiet.js').tag() === 'emergency') return true; } catch (e) {}
  return /🚨|\bemergenc|\bcall[- ]?out\b|\bon[- ]?call\b/i.test([o.title, o.subject, o.tag, o.kind].map(s).join(' '));
}
let CACHE = null;
async function settings(force){
  if (!force && CACHE && Date.now() - CACHE.at < 60e3) return CACHE.v;
  /* no row = the default (9 PM → 7 AM); the setting cannot be READ (database down) = not quiet, as before this patch —
     a notification that goes at night is better than one that is lost */
  let v = DEF; try { v = clean((await core().kvRead([KEY]))[KEY]); } catch (e) { v = Object.assign(clean(null), { on: false, unread: true }); }
  CACHE = { at: Date.now(), v: v }; return v;
}
async function save(v, by){
  const nv = Object.assign(clean(v), { setBy: low(by), setAt: new Date(D.now()).toISOString() });
  const C = core();
  const r = await fetch(C.sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: C.H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: KEY, value: nv, updated_at: new Date().toISOString() }) });
  CACHE = null;
  if (!r || !r.ok) throw new Error('gc_kv write ' + (r && r.status));
  return nv;
}
async function isQuiet(ms){ return quiet(ms == null ? D.now() : ms, await settings()); }
/* hold one notification per person (kept 3 days, at most 600) */
async function hold(emails, rec){
  const at = new Date(D.now()).toISOString();
  const add = (Array.isArray(emails) ? emails : [emails]).map(low).filter(Boolean).filter(function(e, i, a){ return a.indexOf(e) === i; }).map(function(e, i){
    return { id: 'H' + D.now().toString(36) + i + Math.random().toString(36).slice(2, 6), email: e, kind: rec.kind === 'mail' ? 'mail' : 'push', title: s(rec.title).slice(0, 140), body: s(rec.body).slice(0, 240), url: s(rec.url).slice(0, 600), subject: s(rec.subject).slice(0, 240), html: s(rec.html).slice(0, 60000), at: at };
  });
  if (!add.length) return { held: 0 };
  const cut = new Date(D.now() - 3 * 864e5).toISOString();
  const r = await core().kvListUpdate(HELD, function(l){ return { list: l.filter(function(x){ return x && s(x.at) >= cut; }).concat(add).slice(-600), check: function(l2){ return add.every(function(a){ return l2.some(function(x){ return x && x.id === a.id; }); }); } }; });
  return { held: r && r.ok ? add.length : 0 };
}
/* take (and remove) what is held for these people → { email: [recs] } */
async function take(emails){
  const want = emails ? (Array.isArray(emails) ? emails : [emails]).map(low) : null, out = {};
  const r = await core().kvListUpdate(HELD, function(l){
    Object.keys(out).forEach(function(k){ delete out[k]; });
    const keep = [];
    l.forEach(function(x){ if (x && (!want || want.indexOf(low(x.email)) >= 0)) (out[low(x.email)] = out[low(x.email)] || []).push(x); else keep.push(x); });
    if (keep.length === l.length) return null;
    return { list: keep, check: function(l2){ return l2.length <= keep.length + 50; } };
  });
  if (!r || !r.ok) return {};
  return out;
}
/* one push line per held thing */
function lines(recs){ return (recs || []).map(function(x){ return s(x.title || x.subject); }).filter(Boolean); }
/* the morning bundle for everybody not already served (apprping folds its approvals in first) */
async function flush(opts){
  opts = opts || {};
  const now = opts.now == null ? D.now() : opts.now;
  if (await isQuiet(now)) return { ok: true, quiet: true };
  const got = await take(null), rep = { ok: true, people: 0, pushed: 0, mailed: 0 };
  for (const e of Object.keys(got)) { rep.people++; const d = await deliver(e, got[e], [], opts.base); rep.pushed += d.pushed; rep.mailed += d.mailed; }
  return rep;
}
/* ONE notification for this person: their held things + (from apprping) their new approvals; e-mails held → one e-mail with them all */
async function deliver(email, recs, approvals, base){
  base = s(base) || (s(process.env.CRM_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  const A = require('./auto-common.js'), SP = require('./staffpush.js');
  const all = lines(approvals).concat(lines(recs)), n = all.length;
  const out = { pushed: 0, mailed: 0, how: 'none' };
  if (!n) return out;
  const one = n === 1 ? ((approvals && approvals[0]) || recs[0]) : null;
  const title = n === 1 ? (approvals && approvals.length ? '✅ Approval waiting' : s(recs[0].title || recs[0].subject).slice(0, 100) || 'GrayCo CRM') : '🌙 ' + n + ' waiting from overnight';
  const body = n === 1 ? (approvals && approvals.length ? s(approvals[0].title) : s(recs[0].body || recs[0].subject)) : all.slice(0, 4).map(function(t){ return t.slice(0, 60); }).join(' · ') + (n > 4 ? ' · +' + (n - 4) + ' more' : '');
  const url = one ? (s(one.url || one.link) || base + '/#apx=mine') : base + '/#apx=mine';
  const p = await SP.send([email], { title: title, body: body, url: url, tag: 'gc-morning', count: n }, { noAway: true, noQuiet: true });
  if (p && Array.isArray(p.to) && p.to.indexOf(low(email)) >= 0) { out.pushed = 1; out.how = 'push'; }
  const mails = (recs || []).filter(function(x){ return x.kind === 'mail' && s(x.html); });
  if (mails.length || !out.pushed) {
    const html = A.shell(mails.length === 1 && !out.pushed ? s(mails[0].subject) : '🌙 From overnight (held 9 PM – 7 AM): ' + n,
      (out.pushed ? '' : '<ul style="padding-left:18px">' + all.slice(0, 60).map(function(t){ return '<li>' + A.esc(t) + '</li>'; }).join('') + '</ul><p><a href="' + A.esc(base + '/#apx=mine') + '">Open my approvals</a></p>') +
      mails.map(function(m){ return '<hr style="border:none;border-top:1px solid #E2DCCD;margin:14px 0"><div style="font-weight:bold;margin-bottom:6px">' + A.esc(m.subject) + '</div>' + m.html; }).join(''));
    const subj = mails.length === 1 && !out.pushed && n === 1 ? s(mails[0].subject) : '🌙 ' + n + ' from overnight — GrayCo CRM';
    const r = await A.staffMail(email, subj, html, { noAway: true, noQuiet: true });
    if (r && r.ok) { out.mailed = 1; if (out.how === 'none') out.how = 'email'; }
  }
  return out;
}
function _reset(){ CACHE = null; }
module.exports = { KEY, HELD, DEF, D, clean, quiet, emergency, settings, save, isQuiet, hold, take, flush, deliver, _reset };
