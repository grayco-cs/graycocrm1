/* __GC_PATCH_TEAMACT__ — 👥 TEAM ACTIVITY (owner 11/18: "can I see in my admin how long people were on CRM etc.").
   tools/patch_TEAMACTIVITY.py puts this file in index.html.
   AN ACTIVITY LOG, plainly: when each person had the CRM open AND was using it, which screen, how many saves. It counts
   taps, typing and scrolling as "active" — never WHAT was typed (no keystroke content), never the screen (no recording).
   • The heartbeat (every signed-in staff device; not the Marketing Manager — his sign-in cannot write gc_kv, as PERFREP):
     a tap / key / scroll marks the current minute (at most one look at the clock every 15 s — nothing else runs on a tap);
     the day's marks stay in memory (and this device's localStorage, so a reload keeps them) and are written every 5 minutes
     (and when the page is hidden) to gc_kv "gc_activity_<yyyy-mm-dd>__<e-mail>" — the day, keyed by the person, one row each
     (people never write over each other), the person's devices inside it:
       { email, name, day, upd, d: { <device id>: { k: phone|tablet|pc, app: desk|field, sa (home-screen app), v (version),
         view (last screen), last (ISO), m: "540-549,562" (active minutes of the day, America/Chicago), op (opens),
         si (sign-ins), sv (saves), er (page errors), sl (slow taps — PERFREP's stalls), ev: [[minute, "saved an estimate"] …] } } }
     A few hundred bytes a person a day. Kept for good (records: never purged). The device id is gc_adm_device_id (PERFREP,
     BOOTWATCH).
   • Active time: minutes with a tap / key / scroll, and the time between two of them when the gap is 5 minutes or less;
     a gap of more than 5 minutes (idle) is not counted.
   • 👥 Team activity (ADMINS ONLY — the admin role; the Office Manager only if they are an admin): ⚙ Admin and the 💎 menu.
     Per person: last seen, active today / this week, sign-ins today, devices (phone / pc, Desk / Field), version (⚠ old),
     last screen, saves today, errors / slow taps today, failed sign-ins (BOOTWATCH's gc_bootrep_<device>, last 7 days);
     tap a person: the day's timeline — active blocks and key actions (saves, approvals from gc_appr_audit, clock in / out
     from the time sheets, sign-ins, problem reports).
   • The bulk "what changed" pulls of every computer skip gc_activity_* / gc_problem_* (only this screen reads them).
   Console: _gcTeamAct.state(), _gcTeamAct.open(), _gcTeamAct.flush()   Off on this device: localStorage gc_teamact_off = '1' */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_TEAMACT__) return; W.__GC_PATCH_TEAMACT__ = true;
var OFF = false; try { OFF = localStorage.getItem('gc_teamact_off') === '1'; } catch (e) {}
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return RI.call(W, f, ms); }
var PRE = 'gc_activity_', IDLE = 5, FLUSH_MS = 5 * 60e3, LS_REC = 'gc_ta_rec', LS_SI = 'gc_ta_signin';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k){ try { localStorage.removeItem(k); } catch (e) {} }
function warn(e){ try { console.warn('[GC TEAMACT]', e && e.message || e); } catch (x) {} }
function slug(e){ return low(e).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }
function myEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }   /* the admin ROLE (not office access) */
function isMM(){ try { return typeof W._gcIsMM === 'function' && !!W._gcIsMM(); } catch (e) { return false; } }
function users(){ return arr((W._crm || {}).users).filter(function(u){ return u && typeof u === 'object' && u.active !== false && /@/.test(s(u.email)); }); }
var SKEW = 0;
function now(){ return Date.now() + SKEW; }

/* ── the company day (America/Chicago): its start, cached until the next half hour ── */
var DAY = { key: '', start: 0, next: 0 };
var FMT = null; try { FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) {}
function parts(t){
  var o = {}; try { FMT.formatToParts(new Date(t)).forEach(function(p){ o[p.type] = p.value; }); } catch (e) { var d = new Date(t); o = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() }; }
  return { ymd: o.year + '-' + ('0' + o.month).slice(-2) + '-' + ('0' + o.day).slice(-2), h: +o.hour % 24, m: +o.minute, sec: +o.second };
}
function dayOf(t){
  if (t >= DAY.start && t < DAY.next) return DAY;
  var p = parts(t), st = t - ((p.h * 60 + p.m) * 60 + p.sec) * 1000 - (t % 1000);
  DAY = { key: p.ymd, start: st, next: Math.min(st + 864e5, t + 30 * 60e3 - (t % (30 * 60e3)) + 1) };
  return DAY;
}
function ymd(t){ return dayOf(t).key; }
function minOf(t){ var d = dayOf(t); return Math.max(0, Math.min(1439, Math.floor((t - d.start) / 60e3))); }

/* ── active minutes: ranges text <-> sorted minutes; the 5-minute idle rule ── */
function toRanges(m){ var out = [], a = -9, b = -9; m.forEach(function(x){ if (x === b + 1) b = x; else { if (a >= 0) out.push(a === b ? '' + a : a + '-' + b); a = b = x; } }); if (a >= 0) out.push(a === b ? '' + a : a + '-' + b); return out.join(','); }
function fromRanges(t){ var o = []; s(t).split(',').forEach(function(p){ var m = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(p.trim()); if (!m) return; var a = +m[1], b = m[2] ? +m[2] : a; for (var i = a; i <= b && i < 1440; i++) o.push(i); }); return uniq(o); }
function uniq(m){ return m.slice().sort(function(a, b){ return a - b; }).filter(function(x, i, l){ return i === 0 || x !== l[i - 1]; }); }
/* each marked minute counts 1; the time between two marks counts when the gap is ≤ 5 minutes */
function activeMin(m){ var t = 0; for (var i = 0; i < m.length; i++) { if (!i) { t = 1; continue; } var g = m[i] - m[i - 1]; t += g <= IDLE ? g : 1; } return t; }
function blocks(m){ var out = []; m.forEach(function(x){ var b = out[out.length - 1]; if (b && x - b.e <= IDLE) b.e = x; else out.push({ s: x, e: x }); }); out.forEach(function(b){ b.min = b.e - b.s + 1; }); return out; }

/* ═════ the heartbeat ═════ */
function devId(){ var d = lsGet('gc_adm_device_id'); if (!d || !/^[A-Za-z0-9_-]{4,40}$/.test(d)) { d = 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); lsSet('gc_adm_device_id', d); } return d; }
function kind(){ var k = ''; try { k = W._gcAwayDevice ? s(W._gcAwayDevice()) : ''; } catch (e) {} if (!k) { var ua = s(navigator.userAgent); k = /iPad|Tablet/i.test(ua) ? 'tablet' : /iPhone|Android.+Mobile|Mobile Safari/i.test(ua) ? 'phone' : 'pc'; } return k === 'computer' ? 'pc' : k; }
function appNow(){ return D.documentElement.classList.contains('_fieldmode') ? 'field' : 'desk'; }
function screenNow(){
  if (appNow() === 'field') return D.getElementById('_gcJobDash') ? 'Field · job page' : D.getElementById('_gcJobPick') ? 'Field · home' : 'Field · ' + s(lsGet('grayco_view') || 'home');
  return 'Desk · ' + s(lsGet('grayco_view') || 'dashboard');
}
function standalone(){ try { return !!(navigator.standalone || (W.matchMedia && W.matchMedia('(display-mode: standalone)').matches)); } catch (e) { return false; } }
var DEV = devId();
var REC = null, MSET = null, dirty = false, lastT = 0, lastAny = 0, lastMin = -1, tracking = false, lastFlush = 0, flushBusy = false, ROW_OTHERS = null;
function blank(day){ return { day: day, m: [], op: 0, si: 0, sv: 0, er: 0, sl: 0, ev: [], slAt: 0 }; }
function load(day){
  var r = null; try { r = JSON.parse(lsGet(LS_REC) || 'null'); } catch (e) {}
  if (!r || r.day !== day || r.email !== myEmail()) r = blank(day);
  r.m = uniq(arr(r.m).map(Number).filter(function(x){ return x >= 0 && x < 1440; })); r.ev = arr(r.ev).slice(-80);
  REC = r; MSET = {}; r.m.forEach(function(x){ MSET[x] = 1; });
}
function keep(){ if (!REC) return; REC.email = myEmail(); lsSet(LS_REC, JSON.stringify(REC)); }
function roll(t){
  var k = ymd(t);
  if (REC && REC.day === k) return;
  if (REC && REC.m.length && dirty) flush(true, REC);   /* the day that ended goes to its own row first */
  load(k); dirty = true; lastMin = -1;
}
function mark(t){
  roll(t);
  var m = minOf(t); if (m === lastMin) return; lastMin = m;
  if (!MSET[m]) { MSET[m] = 1; REC.m.push(m); if (REC.m.length > 1 && REC.m[REC.m.length - 2] > m) REC.m = uniq(REC.m); dirty = true; }
  REC.last = new Date(t).toISOString();
}
/* a tap / key / scroll: one comparison, and at most every 15 s a look at the clock (nothing is read from the event) */
function act(){ if (!tracking) return; var t = now(); lastAny = t; if (t - lastT < 15000 && t >= lastT) return; lastT = t; mark(t); }
function ev(label){
  if (!tracking || !REC) return; var t = now(); roll(t); var m = minOf(t), L = s(label).slice(0, 60);
  for (var i = REC.ev.length - 1; i >= 0 && i >= REC.ev.length - 12; i--) if (REC.ev[i][1] === L && m - REC.ev[i][0] < 10) return;   /* the same action again within 10 min: once */
  REC.ev.push([m, L]); if (REC.ev.length > 80) REC.ev.shift(); dirty = true;
}
function bump(k, n){ if (!tracking || !REC) return; roll(now()); REC[k] = (+REC[k] || 0) + (n || 1); dirty = true; }
if (!OFF) {
  ['pointerdown', 'keydown', 'wheel'].forEach(function(t){ try { W.addEventListener(t, act, { capture: true, passive: true }); } catch (e) {} });
  try { D.addEventListener('scroll', act, { capture: true, passive: true }); } catch (e) {}
  try { W.addEventListener('error', function(e){ if (e && e.target && e.target !== W && e.target.tagName) return; bump('er'); }, true); W.addEventListener('unhandledrejection', function(){ bump('er'); }); } catch (e) {}
  /* Sign in pressed (the e-mail box is on the form — nothing of it is read): the next signed-in open counts a sign-in */
  try { D.addEventListener('submit', function(e){ try { if (e.target && e.target.querySelector && e.target.querySelector('#gc-auth-email')) lsSet(LS_SI, String(Date.now())); } catch (x) {} }, true); } catch (e) {}
}

/* saves: a write to the cloud within 20 s of a tap / key (the person did it), by list name; background syncs are not saves */
var SAVE_L = { estimates: 'saved an estimate', leads: 'saved a lead', projects: 'saved a job', invs: 'saved an invoice', invoices: 'saved an invoice', expenses: 'saved an expense',
  schedule: 'changed the schedule', timesheets: 'time sheet', customers: 'saved a customer', subs: 'saved a sub', cos: 'saved a change order', changeOrders: 'saved a change order',
  projectDocs: 'saved a document', gc_office_tasks: 'changed a to-do', punch: 'changed a punch list', projectPayments: 'recorded a payment', gc_problem_reports: 'problem report',
  gc_approval_queue: 'changed an approval', gc_expense_approvals: 'expense approval', vendors: 'saved a vendor', users: 'changed the team' };
var NOT_SAVE = /^(gc_perfrep_|gc_activity_|gc_bootrep_|gc_problem_(rl|shot|detail|inbox)|gc_speedlog|gc_ta_|gc_lastPull|gc_appr_feed|gc_heartbeat|gc_presence|__)/;
var lastSave = {};
function sawWrite(key){
  if (!tracking || !key || NOT_SAVE.test(key)) return;
  var t = now(); if (t - lastAny > 20000 || t < lastAny) return;
  if (lastSave[key] && t - lastSave[key] < 10000) { lastSave[key] = t; return; }   /* autosave while typing: one save */
  lastSave[key] = t; bump('sv');
  if (SAVE_L[key]) ev(SAVE_L[key]); else if (/^[A-Za-z][\w]{1,40}$/.test(key) && !/^gc_/.test(key)) ev('saved ' + key);
}
if (!OFF && typeof W.fetch === 'function') {
  var NF = W.fetch;
  var wf = function(input, init){
    try {
      var m = s((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET');
      if (m !== 'GET' && m !== 'HEAD') {
        var u = typeof input === 'string' ? input : s(input && input.url);
        if (u.indexOf('/rest/v1/gc_kv') >= 0) {
          var k = ''; var q = /[?&]key=eq\.([^&]{1,80})/.exec(u);
          if (q) { try { k = decodeURIComponent(q[1]); } catch (e) {} }
          else if (init && typeof init.body === 'string') { var b = /"key"\s*:\s*"([^"]{1,80})"/.exec(init.body.slice(0, 300)); if (b) k = b[1]; }
          if (k) sawWrite(k);
        }
      }
    } catch (e) {}
    return NF.apply(this, arguments);
  };
  try { Object.keys(NF).forEach(function(k){ if (!(k in wf)) wf[k] = NF[k]; }); } catch (e) {}
  W.fetch = wf;
}

/* slow taps today: PERFREP's stall list (its own times) since the last look */
function slowCount(){
  try {
    var R = W._gcPerfRep && W._gcPerfRep.report ? W._gcPerfRep.report() : null; if (!R || !REC) return;
    var st = dayOf(now()).start, n = 0, mx = +REC.slAt || 0;
    arr(R.lt).forEach(function(x){ var a = +x.at || 0; if (a >= st && a > (+REC.slAt || 0)) { n++; if (a > mx) mx = a; } });
    if (n) { REC.sl = (+REC.sl || 0) + n; REC.slAt = mx; dirty = true; }
  } catch (e) {}
}

/* ── the row: read (another device of mine may have written), merge my device, write ── */
function creds(){ return { u: s(lsGet('grayco_sb_url')).replace(/\/$/, ''), k: s(lsGet('grayco_sb_key')) }; }
function rowKey(day, email){ return PRE + day + '__' + slug(email); }
function kvRead(key){
  var c = creds(); if (!c.u || !c.k) return Promise.resolve(null);
  return W.fetch(c.u + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; })
    .then(function(rows){ if (!Array.isArray(rows)) return null; var v = rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return { value: v }; });
}
function kvWrite(key, value, keepalive){
  var c = creds(); if (!c.u || !c.k) return Promise.resolve(false);
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', keepalive: !!keepalive, headers: { apikey: c.k, Authorization: 'Bearer ' + c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
function devEntry(r){
  return { k: kind(), app: appNow(), sa: standalone() || undefined, v: s(W.__GC_BUILD_ID__).slice(0, 40), view: screenNow().slice(0, 50), last: r.last || new Date(now()).toISOString(),
    m: toRanges(r.m), op: r.op || 0, si: r.si || 0, sv: r.sv || 0, er: r.er || 0, sl: r.sl || 0, ev: r.ev.slice(-80) };
}
function mergeDev(a, b){   /* the same device's entry in the row (a reload that lost this browser's copy): keep both */
  if (!a) return b;
  var o = Object.assign({}, b); o.m = toRanges(uniq(fromRanges(a.m).concat(fromRanges(b.m))));
  ['op', 'si', 'sv', 'er', 'sl'].forEach(function(k){ o[k] = Math.max(+a[k] || 0, +b[k] || 0); });
  var seen = {}; o.ev = arr(a.ev).concat(arr(b.ev)).filter(function(e){ var k = e[0] + '|' + e[1]; if (seen[k]) return false; seen[k] = 1; return true; }).sort(function(x, y){ return x[0] - y[0]; }).slice(-80);
  if (s(a.last) > s(o.last)) o.last = a.last;
  return o;
}
function name(){ var e = myEmail(), u = users().filter(function(x){ return low(x.email) === e; })[0]; return s(u && u.name) || e.split('@')[0]; }
function flush(force, rec, keepalive){
  rec = rec || REC;
  if (!tracking || !rec || (!dirty && !force)) return Promise.resolve(false);
  if (flushBusy) { if (rec !== REC) later(function(){ flush(true, rec); }, 3000); return Promise.resolve(false); }   /* the day that ended is not dropped */
  if (!rec.m.length && !rec.op && !rec.si) return Promise.resolve(false);
  slowCount();
  var email = myEmail(); if (!email) return Promise.resolve(false);
  var key = rowKey(rec.day, email), mine = devEntry(rec);
  flushBusy = true; if (rec === REC) { dirty = false; keep(); }
  var write = function(cur){
    var v = cur && cur.value && typeof cur.value === 'object' && !Array.isArray(cur.value) ? cur.value : { d: {} };
    var d = Object.assign({}, v.d || {}); d[DEV] = mergeDev(d[DEV], mine);
    ROW_OTHERS = { key: key, d: d };
    return kvWrite(key, { email: email, name: name(), day: rec.day, upd: new Date().toISOString(), d: d }, keepalive);
  };
  var p = keepalive ? write({ value: { d: ROW_OTHERS && ROW_OTHERS.key === key ? ROW_OTHERS.d : {} } }) : kvRead(key).then(function(cur){ if (!cur) return false; return write(cur); });
  return p.then(function(ok){ flushBusy = false; lastFlush = Date.now(); if (!ok && rec === REC) dirty = true; return ok; }, function(){ flushBusy = false; if (rec === REC) dirty = true; return false; });
}
/* start once signed in (never for the Marketing Manager) */
function begin(){
  if (tracking || OFF || !myEmail() || isMM()) return;
  tracking = true;
  var t = now(); load(ymd(t)); REC.op = (+REC.op || 0) + 1; dirty = true;
  var si = +lsGet(LS_SI) || 0; if (si && Date.now() - si < 5 * 60e3) { REC.si = (+REC.si || 0) + 1; ev('signed in'); } lsDel(LS_SI);
  ev('opened the CRM (' + kind() + ' · ' + (appNow() === 'field' ? 'Field' : 'Desk') + ')');
  keep();
  later(function(){ flush(true); }, 30e3 + Math.random() * 20e3);
  /* every 5 minutes, at a different second on each device (two devices never meet on the same second) */
  later(function(){ every(function(){ if (dirty) flush(false); else if (REC) keep(); }, FLUSH_MS); }, Math.random() * 40e3);
  /* clock in / out, through the time clock's own button */
  var hookClock = function(){ var f = W._gcClockInNow; if (typeof f === 'function' && !f.__gcTA) { var w = function(){ ev('clocked in'); return f.apply(this, arguments); }; w.__gcTA = true; W._gcClockInNow = w; } };
  hookClock(); later(hookClock, 15e3);
}
every(function(){ if (!tracking) begin(); }, 3000);
later(begin, 1500);
try {
  D.addEventListener('visibilitychange', function(){ if (D.hidden && tracking && dirty && Date.now() - lastFlush > 60e3) flush(false, null, true); });
  W.addEventListener('pagehide', function(){ if (tracking) { keep(); if (dirty) flush(false, null, true); } });
} catch (e) {}

/* ═════ 👥 Team activity (admins) ═════ */
function bwHash(t){   /* BOOTWATCH's short hash of a sign-in e-mail (tools/bootwatch_early.js): a failed attempt → the person */
  var h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822507) >>> 0; }
  return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-4);
}
function kvList(q){
  var c = creds(); if (!c.u || !c.k) return Promise.resolve(null);
  return W.fetch(c.u + '/rest/v1/gc_kv?select=key,value,updated_at&' + q, { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; })
    .then(function(rows){ return Array.isArray(rows) ? rows.map(function(r){ var v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return { key: s(r.key), value: v, at: s(r.updated_at) }; }) : null; });
}
function addDays(day, n){ var d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function monday(day){ var d = new Date(day + 'T12:00:00Z'), w = (d.getUTCDay() + 6) % 7; return addDays(day, -w); }
function hm(min){ var h = Math.floor(min / 60), m = min % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12; return h12 + ':' + ('0' + m).slice(-2) + ' ' + ap; }
function dur(min){ min = Math.round(min || 0); if (!min) return '0 min'; var h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
function ago(iso){ var t = Date.parse(iso); if (!t) return '—'; var m = Math.round((Date.now() - t) / 60e3); if (m < 2) return 'now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + ' h ago'; var d = Math.round(h / 24); return d + ' day' + (d === 1 ? '' : 's') + ' ago'; }
function verNum(v){ var m = /^(\d+)\.(\d+)/.exec(s(v)); return m ? +m[1] * 1e4 + +m[2] : 0; }
var A = { rows: null, boot: null, audit: null, live: '', ts: null, day: '', person: '' };
function load2(){
  var today = ymd(Date.now()), mon = monday(today);
  A.day = today;
  return Promise.all([
    kvList('key=gte.' + PRE + mon + '&key=lt.' + PRE + addDays(mon, 7)),
    kvList('key=like.gc_bootrep_*'),
    W.fetch('/version.txt?t=' + Date.now(), { cache: 'no-store' }).then(function(r){ return r && r.ok ? r.text() : ''; }, function(){ return ''; })
  ]).then(function(v){ A.rows = v[0]; A.boot = v[1]; A.live = s(v[2]).slice(0, 60); return A; });
}
function dayData(email, day){ var k = rowKey(day, email); var r = arr(A.rows).filter(function(x){ return x.key === k; })[0]; return r && r.value && r.value.d ? r.value.d : null; }
function mins(d){ var m = []; Object.keys(d || {}).forEach(function(k){ m = m.concat(fromRanges(d[k] && d[k].m)); }); return uniq(m); }
function sum(d, k){ var n = 0; Object.keys(d || {}).forEach(function(x){ n += +(d[x] && d[x][k]) || 0; }); return n; }
function failedSignins(){
  var since = new Date(Date.now() - 7 * 864e5).toISOString(), byHash = {}, out = { by: {}, unknown: [] };
  users().forEach(function(u){ byHash[bwHash(low(u.email))] = low(u.email); });
  arr(A.boot).forEach(function(r){
    var v = r.value || {};
    arr(v.boots).forEach(function(b){
      if (!b || s(b.at || b.got) < since) return;
      arr(b.si).forEach(function(a){
        if (!a || !a.err) return;
        var who = low(b.email) || (a.h && byHash[a.h]) || '';
        if (who) out.by[who] = (out.by[who] || 0) + 1;
        else out.unknown.push({ dev: s(v.dev), dom: s(a.dom), err: s(a.err), at: s(b.at || b.got), kind: s(b.kind || v.kind) });
      });
    });
  });
  return out;
}
function people(){
  var e2u = {}; users().forEach(function(u){ e2u[low(u.email)] = u; });
  arr(A.rows).forEach(function(r){ var e = low(r.value && r.value.email); if (e && !e2u[e]) e2u[e] = { email: e, name: s(r.value.name) || e, role: '' }; });
  var mon = monday(A.day), F = failedSignins();
  return Object.keys(e2u).map(function(e){
    var u = e2u[e], today = dayData(e, A.day) || {}, week = 0, last = '';
    for (var i = 0; i < 7; i++) { var dd = dayData(e, addDays(mon, i)); if (!dd) continue; week += activeMin(mins(dd)); Object.keys(dd).forEach(function(k){ if (s(dd[k].last) > last) last = s(dd[k].last); }); }
    arr(A.boot).forEach(function(r){ var v = r.value || {}; if (low(v.email) === e && s(v.updated) > last && !last) last = s(v.updated); });
    var devs = Object.keys(today).map(function(k){ return Object.assign({ id: k }, today[k]); }).sort(function(a, b){ return s(b.last).localeCompare(s(a.last)); });
    var top = devs[0] || null;
    return { email: e, name: s(u.name) || e, role: s(u.role), last: last, today: activeMin(mins(today)), week: week, si: sum(today, 'si'), op: sum(today, 'op'), sv: sum(today, 'sv'), er: sum(today, 'er'), sl: sum(today, 'sl'),
      devs: devs, ver: top ? s(top.v) : '', view: top ? s(top.view) : '', failed: F.by[e] || 0 };
  }).sort(function(a, b){ return s(b.last).localeCompare(s(a.last)) || a.name.localeCompare(b.name); });
}
var CSS = false;
function css(){
  if (CSS) return; CSS = true;
  var st = D.createElement('style'); st.id = 'gc-ta-css';
  st.textContent = '.gc-ta-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(6,12,20,.62);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;font:13.5px Inter,-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a}' +
    '.gc-ta-ov *{box-sizing:border-box}.gc-ta-card{background:#fff;width:100%;max-width:1180px;max-height:92vh;overflow:auto;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.4)}' +
    '.gc-ta-hd{position:sticky;top:0;left:0;background:#fff;display:flex;align-items:center;gap:8px;padding:14px 16px 10px;border-bottom:1px solid #e2e8f0;z-index:2}.gc-ta-hd b{font-size:17px;flex:1}' +
    '.gc-ta-x{border:none;background:#e2e8f0;border-radius:8px;min-width:36px;height:34px;font-size:16px;font-weight:800;cursor:pointer}.gc-ta-bd{padding:12px 16px 18px}' +
    '.gc-ta-note{font-size:12.5px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;line-height:1.45;margin-bottom:10px}' +
    '.gc-ta-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.gc-ta-t{border-collapse:collapse;width:100%;min-width:980px}.gc-ta-t th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;white-space:nowrap}' +
    '.gc-ta-t td{padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:top}.gc-ta-t tr[data-ta-p]{cursor:pointer}.gc-ta-t tr[data-ta-p]:hover{background:#f8fafc}.gc-ta-t td small{display:block;color:#64748b;font-size:11.5px}' +
    '.gc-ta-chip{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;background:#f1f5f9;color:#334155;margin:0 3px 3px 0;white-space:nowrap}.gc-ta-chip.w{background:#fef3c7;color:#92400e}.gc-ta-chip.r{background:#fee2e2;color:#b91c1c}' +
    '.gc-ta-btn{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 11px;font:700 12.5px inherit;font-family:inherit;cursor:pointer}' +
    '.gc-ta-bar{position:relative;height:26px;background:#f1f5f9;border-radius:6px;margin:8px 0 2px;overflow:hidden}.gc-ta-bar i{position:absolute;top:0;bottom:0;background:#2563eb;border-radius:3px;min-width:2px}' +
    '.gc-ta-bar u{position:absolute;top:0;bottom:0;width:2px;background:#f59e0b}.gc-ta-ax{display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8}' +
    '.gc-ta-ev{display:flex;gap:10px;padding:5px 0;border-bottom:1px dashed #f1f5f9;font-size:13px}.gc-ta-ev b{min-width:74px;color:#334155}' +
    '#gc-adm-tools{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}#gc-adm-tools button{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 14px;font:800 13px Inter,Arial,sans-serif;cursor:pointer;color:#0f172a}';
  D.head.appendChild(st);
}
var OV = null;
function close(){ if (OV) { OV.remove(); OV = null; } }
D.addEventListener('keydown', function(e){ if (e.key === 'Escape' && OV && OV.isConnected && !D.querySelector('.gc-rpb-ov')) { close(); e.stopPropagation(); } }, true);
function shell(title){
  css(); close();
  var ov = D.createElement('div'); ov.id = 'gc-ta'; ov.className = 'gc-ta-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1');
  ov.innerHTML = '<div class="gc-ta-card" role="dialog" aria-modal="true" aria-label="Team activity"><div class="gc-ta-hd"><b>' + esc(title) + '</b><button type="button" class="gc-ta-btn" data-ta="refresh">↻</button><button type="button" class="gc-ta-x" aria-label="Close">✕</button></div><div class="gc-ta-bd"></div></div>';
  ov.querySelector('.gc-ta-x').onclick = close;
  ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
  D.body.appendChild(ov); OV = ov;
  return ov.querySelector('.gc-ta-bd');
}
var NOTE = '<div class="gc-ta-note"><b>Activity log.</b> When each person had the CRM open and was using it: taps, typing and scrolling count as active (a gap of more than 5 minutes with none is idle and not counted); which screen; how many saves. <b>Nothing anyone types is kept and nothing is recorded from the screen.</b> Only admins can open this. Kept as a record (never deleted).</div>';
function devChips(p){
  return p.devs.length ? p.devs.map(function(d){ return '<span class="gc-ta-chip">' + (d.k === 'phone' ? '📱' : d.k === 'tablet' ? '📟' : '🖥') + ' ' + esc(d.k || '?') + ' · ' + (d.app === 'field' ? 'Field' : 'Desk') + (d.sa ? ' · app' : '') + '</span>'; }).join('') : '<span style="color:#94a3b8">—</span>';
}
function open(){
  if (!isAdmin()) { try { alert('👥 Team activity is for admins.'); } catch (e) {} return null; }
  var bd = shell('👥 Team activity');
  bd.innerHTML = NOTE + '<div class="gc-ta-note">Loading…</div>';
  var paint = function(){
    if (!OV) return;
    if (A.rows === null) { bd.innerHTML = NOTE + '<div class="gc-ta-note">Could not read the activity log — check the connection and tap ↻.</div>'; return; }
    var P = people(), live = verNum(A.live), newest = 0; P.forEach(function(p){ newest = Math.max(newest, verNum(p.ver)); });
    var ref = live || newest, F = failedSignins(), bwOn = arr(A.boot).length > 0;
    bd.innerHTML = NOTE + '<div class="gc-ta-wrap"><table class="gc-ta-t"><thead><tr><th>Person</th><th>Last seen</th><th>Active today</th><th>This week</th><th>Sign-ins today</th><th>Devices</th><th>Version</th><th>Last screen</th><th>Saves today</th><th>Errors · slow taps</th><th>Failed sign-ins (7 d)</th></tr></thead><tbody>' +
      P.map(function(p){
        var old = p.ver && ref && verNum(p.ver) < ref;
        return '<tr data-ta-p="' + esc(p.email) + '"><td><b>' + esc(p.name) + '</b><small>' + esc(p.role || p.email) + '</small></td><td>' + esc(p.last ? ago(p.last) : 'not this week') + (p.last ? '<small>' + esc(new Date(p.last).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</small>' : '') + '</td>' +
          '<td><b>' + esc(dur(p.today)) + '</b></td><td>' + esc(dur(p.week)) + '</td><td>' + (p.si || 0) + (p.op ? '<small>' + p.op + ' open' + (p.op === 1 ? '' : 's') + '</small>' : '') + '</td><td>' + devChips(p) + '</td>' +
          '<td>' + (p.ver ? esc(p.ver.replace(/-\d{4}-\d\d-\d\d/, '')) + (old ? ' <span class="gc-ta-chip w">⚠ old</span>' : '') : '—') + '</td><td>' + esc(p.view || '—') + '</td><td>' + (p.sv || 0) + '</td>' +
          '<td>' + (p.er ? '<span class="gc-ta-chip r">' + p.er + ' error' + (p.er === 1 ? '' : 's') + '</span>' : '0 errors') + '<small>' + (p.sl || 0) + ' slow tap' + (p.sl === 1 ? '' : 's') + '</small></td>' +
          '<td>' + (p.failed ? '<span class="gc-ta-chip r">' + p.failed + '</span>' : bwOn ? '0' : '<span style="color:#94a3b8" title="The sign-in watch (BOOTWATCH) has not reported yet">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (F.unknown.length ? '<div class="gc-ta-note" style="margin-top:10px"><b>Failed sign-ins not matched to a person (7 days):</b><br>' + F.unknown.slice(0, 12).map(function(x){ return esc(new Date(x.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + ' · ' + esc(x.kind || 'device') + ' ' + esc(x.dev) + (x.dom ? ' · @' + esc(x.dom) : '') + ' — “' + esc(x.err) + '”'; }).join('<br>') + '</div>' : '') +
      '<div class="gc-ta-note" style="margin-top:10px">Live version: ' + esc(A.live || '?') + '. Tap a person for the day\'s timeline.</div>';
  };
  var go = function(){ load2().then(paint, paint); };
  OV.querySelector('[data-ta="refresh"]').onclick = function(){ if (A.person) person(A.person, A.pday); else go(); };
  bd.addEventListener('click', function(e){ var r = e.target && e.target.closest && e.target.closest('[data-ta-p]'); if (r) person(r.getAttribute('data-ta-p'), A.day); });
  go();
  return OV;
}
function audits(){ if (A.audit) return Promise.resolve(A.audit); return kvList('key=eq.gc_appr_audit').then(function(r){ A.audit = r && r[0] ? arr(r[0].value) : []; return A.audit; }); }
function timesheets(){ return Promise.resolve(typeof W.idbGet === 'function' ? W.idbGet('timesheets') : null).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return arr(Array.isArray(v) ? v : (W._crm || {}).timesheets); }, function(){ return arr((W._crm || {}).timesheets); }); }
function person(email, day){
  if (!OV) open(); if (!OV) return;
  A.person = email; A.pday = day;
  var bd = OV.querySelector('.gc-ta-bd'), p = people().filter(function(x){ return x.email === email; })[0] || { name: email, email: email };
  OV.querySelector('.gc-ta-hd b').textContent = '👥 ' + p.name + ' — ' + new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  bd.innerHTML = NOTE + '<div class="gc-ta-note">Loading…</div>';
  Promise.all([kvList('key=eq.' + encodeURIComponent(rowKey(day, email))), audits(), timesheets()]).then(function(v){
    var row = v[0] && v[0][0] && v[0][0].value || {}, d = row.d || {}, m = mins(d), B = blocks(m), tot = activeMin(m);
    var evs = [];
    Object.keys(d).forEach(function(k){ arr(d[k].ev).forEach(function(e){ evs.push({ m: +e[0], t: s(e[1]), dev: d[k].k }); }); });
    arr(v[1]).forEach(function(a){ if (low(a.email) !== email) return; var t = Date.parse(a.at); if (!t || ymd(t) !== day) return; evs.push({ m: minOf(t), t: (a.decision === 'denied' ? '✖ declined: ' : a.decision === 'recorded' ? '📝 recorded: ' : '✅ approved: ') + s(a.title).slice(0, 80), dev: a.device }); });
    var nm = low(p.name);
    arr(v[2]).forEach(function(r){ if (!r || low(r.user) !== nm || s(r.date) !== day) return; [['clockIn', '⏱ clocked in'], ['clockOut', '⏱ clocked out']].forEach(function(c){ var x = /^(\d{1,2}):(\d\d)/.exec(s(r[c[0]])); if (x) evs.push({ m: +x[1] * 60 + +x[2], t: c[1] + ' (time sheet)' }); }); });
    evs.sort(function(a, b){ return a.m - b.m; });
    var lo = Math.min(6 * 60, m.length ? m[0] : 1e9, evs.length ? evs[0].m : 1e9), hi = Math.max(19 * 60, m.length ? m[m.length - 1] + 1 : 0, evs.length ? evs[evs.length - 1].m + 1 : 0);
    lo = Math.floor(lo / 60) * 60; hi = Math.min(1440, Math.ceil(hi / 60) * 60); var span = Math.max(60, hi - lo);
    var pct = function(x){ return ((x - lo) / span * 100).toFixed(2) + '%'; };
    var ax = []; for (var h = lo; h <= hi; h += Math.max(60, Math.round(span / 6 / 60) * 60)) ax.push('<span>' + hm(h).replace(':00', '') + '</span>');
    bd.innerHTML = NOTE + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><button type="button" class="gc-ta-btn" data-ta="back">‹ Everyone</button><button type="button" class="gc-ta-btn" data-ta="prev">‹ Day before</button>' +
      (day < A.day ? '<button type="button" class="gc-ta-btn" data-ta="next">Next day ›</button>' : '') + '<span style="margin-left:auto;font-size:15px"><b data-ta-total>' + esc(dur(tot)) + '</b> active</span></div>' +
      '<div class="gc-ta-bar">' + B.map(function(b){ return '<i title="' + esc(hm(b.s) + ' – ' + hm(b.e + 1)) + '" style="left:' + pct(b.s) + ';width:calc(' + pct(b.e + 1) + ' - ' + pct(b.s) + ')"></i>'; }).join('') + evs.map(function(e){ return '<u title="' + esc(hm(e.m) + ' ' + e.t) + '" style="left:' + pct(e.m) + '"></u>'; }).join('') + '</div><div class="gc-ta-ax">' + ax.join('') + '</div>' +
      '<h4 style="margin:14px 0 4px">Active</h4>' + (B.length ? B.map(function(b){ return '<div class="gc-ta-ev" data-ta-block><b>' + esc(hm(b.s)) + '</b><span>to ' + esc(hm(b.e + 1)) + ' · ' + esc(dur(b.min)) + '</span></div>'; }).join('') : '<div class="gc-ta-note">No activity that day.</div>') +
      '<h4 style="margin:14px 0 4px">Key actions</h4>' + (evs.length ? evs.map(function(e){ return '<div class="gc-ta-ev"><b>' + esc(hm(e.m)) + '</b><span>' + esc(e.t) + (e.dev ? ' <span class="gc-ta-chip">' + esc(e.dev) + '</span>' : '') + '</span></div>'; }).join('') : '<div class="gc-ta-note">None recorded.</div>') +
      '<div class="gc-ta-note" style="margin-top:10px">Devices that day: ' + (Object.keys(d).map(function(k){ var x = d[k]; return esc((x.k || '?') + ' · ' + (x.app === 'field' ? 'Field' : 'Desk') + ' · v' + s(x.v).replace(/-\d{4}-\d\d-\d\d/, '') + ' · ' + (x.sv || 0) + ' saves · ' + (x.er || 0) + ' errors · ' + (x.sl || 0) + ' slow taps'); }).join('<br>') || '—') + '</div>';
    bd.querySelector('[data-ta="back"]').onclick = function(){ A.person = ''; OV.querySelector('.gc-ta-hd b').textContent = '👥 Team activity'; open(); };
    bd.querySelector('[data-ta="prev"]').onclick = function(){ person(email, addDays(day, -1)); };
    var nx = bd.querySelector('[data-ta="next"]'); if (nx) nx.onclick = function(){ person(email, addDays(day, 1)); };
  });
}

/* ── where it opens: ⚙ Admin (a button above the warnings) and the 💎 menu — admins only ── */
function admBar(){
  var top = D.getElementById('gc-adm-top'); if (!top || !isAdmin()) return;
  var bar = D.getElementById('gc-adm-tools');
  if (!bar) { css(); bar = D.createElement('div'); bar.id = 'gc-adm-tools'; top.parentNode.insertBefore(bar, top); }
  if (!bar.querySelector('[data-ta-adm]')) { var b = D.createElement('button'); b.type = 'button'; b.setAttribute('data-ta-adm', '1'); b.textContent = '👥 Team activity'; b.onclick = function(){ open(); }; bar.insertBefore(b, bar.firstChild); }
  if (W._gcReportProb && !bar.querySelector('[data-rp-adm]')) { var c = D.createElement('button'); c.type = 'button'; c.setAttribute('data-rp-adm', '1'); c.textContent = '🆘 Problem reports'; c.onclick = function(){ W._gcReportProb.list(); }; bar.appendChild(c); }
}
function hubItem(panel){
  if (!panel || !isAdmin() || panel.querySelector('#gc-ta-hub')) return;
  var it = D.createElement('div'); it.id = 'gc-ta-hub'; it.className = 'gc-hub-item'; it.setAttribute('data-label', 'Team activity');
  it.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9';
  it.innerHTML = '<span style="font-size:18px">👥</span><span>Team activity</span>';
  it.onclick = function(){ later(open, 0); };
  panel.appendChild(it);
}
D.addEventListener('gc-hub-open', function(e){ try { hubItem(e && e.detail && e.detail.panel); } catch (x) { warn(x); } });
every(function(){ if (D.hidden || !myEmail()) return; try { admBar(); var all = D.querySelectorAll('.gc-hub-panel'); for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) { hubItem(all[i]); break; } } catch (e) { warn(e); } }, 1500);

W._gcTeamAct = { open: open, person: person, flush: function(){ return flush(true); }, activeMin: activeMin, blocks: blocks, toRanges: toRanges, fromRanges: fromRanges,
  skew: function(ms){ SKEW = +ms || 0; lastT = 0; return now(); },   /* test only: moves this page's activity clock */
  state: function(){ return { on: tracking, off: OFF, dev: DEV, day: REC && REC.day, minutes: REC ? REC.m.length : 0, active: REC ? activeMin(REC.m) : 0, dirty: dirty, lastFlush: lastFlush, rec: REC ? devEntry(REC) : null }; } };
try { console.log('[GC] 👥 Team activity log (patch TEAMACT): _gcTeamAct.state()'); } catch (e) {}
})();
