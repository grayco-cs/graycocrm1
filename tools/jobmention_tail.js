<script id="gc-patch-jobmention">
/* __GC_PATCH_JOBMENTION__ — 💬 Job Messages: @mentions on a phone, and who is told (owner 11/03, ROTC Cordova PO T724:
   "It wouldn't let me @ anyone, and that @ should go to a notification on the employee's CRM Messages").
   tools/patch_JOBMENTION.py has the why. The owner's rule for a team message on a job:
     • no @ → the job's PM only (not when the PM wrote it); no PM on the job → the owners (role, _gcOwnerUsers);
     • @mentions → each person named (@Office = the office role) AND the PM (owners when no PM);
     • never the sender, one notification per person per message, nobody else.
   Texts with customers (sms) keep their old behaviour (everyone's unread).
   API: window._gcJM = { stamp, recipients, tagsFor, sent, opened, keep, wire, chipsHtml, chipText, parse };
        window._gcJobMsgForMe() → [{ m, mention }], window._gcJobMsgForMeCount(), window._gcJobMsgForYouHtml(). */
(function(){
'use strict';
if (window.__GC_PATCH_JOBMENTION__) return; window.__GC_PATCH_JOBMENTION__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function users(){ return arr(crm().users); }
function projects(){ return arr(crm().projects); }
var STATS = /\s+[—–-]+\s+\d+\s+jobs?\b.*$/;
function clean(n){ return s(n).replace(STATS, '').replace(/\s+/g, ' ').trim(); }
function first(n){ return clean(n).split(' ')[0] || clean(n); }
function lsJ(k, d){ try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
function nowIso(){ return new Date().toISOString(); }
function warn(e){ try { console.warn('[GC] job mentions', e); } catch (x) {} }

/* ── people ── */
function inactive(u){ return !u || u.active === false || u.disabled === true || !!u.terminated || !!u.letGo || /^(inactive|terminated|disabled|former|let go)$/i.test(s(u.status)); }
function external(u){ return /\b(sub|subcontractor|customer|client|vendor|supplier|homeowner)\b/i.test(s(u.role) + ' ' + s(u.type) + ' ' + s(u.profile)) || !!u.isCustomer || !!u.isSub; }
function isOffice(u){ return !!u && (/office/i.test(s(u.role) + ' ' + s(u.title)) || low(u.email).indexOf('office@') === 0 || /^office$/i.test(clean(u.name))); }
function P(u){ return { id: s(u && u.id), e: low(u && u.email), n: clean(u && u.name) || low(u && u.email) }; }
function same(a, b){
  if (!a || !b) return false;
  if (a.id && b.id && low(a.id) === low(b.id)) return true;
  if (a.e && b.e && a.e === b.e) return true;
  return !!(a.n && b.n && low(a.n) === low(b.n));
}
var SC = { src: null, l: [] };
function staff(){
  var U = users(); if (SC.src === U) return SC.l;
  var out = [], seen = {};
  U.forEach(function(u){
    if (inactive(u) || external(u)) return;
    var n = clean(u.name); if (!n) return; var k = low(n); if (seen[k]) return; seen[k] = 1;
    var x = P(u); x.r = s(u.role); x.office = isOffice(u); out.push(x);
  });
  out.sort(function(a, b){ return a.n.localeCompare(b.n); });
  SC = { src: U, l: out }; return out;
}
function officeTeam(){ return staff().filter(function(x){ return x.office; }); }
/* the names offered: the team, and "Office" (the office role) when no one is called that */
function chips(){
  var l = staff().map(function(x){ return { n: x.n, r: x.office && /^office$/i.test(x.n) ? 'the office' : x.r }; });
  if (officeTeam().length && !l.some(function(x){ return /^office$/i.test(x.n); })) l.push({ n: 'Office', r: 'the office' });
  return l;
}
function userBy(v){
  v = low(clean(v)); if (!v) return null;
  return users().filter(function(u){ return u && !inactive(u) && (low(u.id) === v || low(u.email) === v || low(clean(u.name)) === v); })[0] || null;
}
function meP(){
  var u = null;
  try { u = typeof W._gcMeUser === 'function' ? W._gcMeUser() : null; } catch (e) {}
  if (!u || !(u.name || u.email)) {
    try { var em = low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); if (em) u = users().filter(function(x){ return x && low(x.email) === em; })[0] || { email: em }; } catch (e) {}
  }
  return u && (u.name || u.email || u.id) ? P(u) : null;
}
function owners(){
  var l = []; try { l = typeof W._gcOwnerUsers === 'function' ? arr(W._gcOwnerUsers()) : []; } catch (e) {}
  if (!l.length) l = users().filter(function(u){ return u && !inactive(u) && !isOffice(u) && /^(admin|owner)$/i.test(s(u.role)); });
  return l.map(P);
}
function proj(pid){ var l = projects(); for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === pid) return l[i]; return null; }
function pmOf(pid){
  var p = proj(pid), n = clean(p && p.pm); if (!n || /^office$/i.test(n)) return null;
  var u = userBy(n); return u ? P(u) : { id: '', e: '', n: n };
}
function jobLabel(pid){ var p = proj(pid); if (!p) return 'a job'; try { if (typeof W._gcJobTag === 'function') return s(W._gcJobTag(p)) || s(p.name); } catch (e) {} return s(p.name || p.address) || 'a job'; }

/* ── "@First Last" in a text (or "@First" when only one person has that first name) ── */
function hasAt(t, k){ var i = -1; while ((i = t.indexOf(k, i + 1)) >= 0) { if (!/[a-z0-9]/.test(t.charAt(i + k.length))) return true; } return false; }
function parse(text){
  var t = ' ' + low(text) + ' ', st = chips(), out = [];
  if (t.indexOf('@') < 0) return out;
  st.forEach(function(x){
    var f = low(first(x.n));
    var hit = hasAt(t, '@' + low(x.n)) || (st.filter(function(y){ return low(first(y.n)) === f; }).length === 1 && hasAt(t, '@' + f));
    if (hit) out.push(x.n);
  });
  return out;
}
/* names → people; "Office" → everyone in the office role */
function expand(names){
  var out = [];
  names.forEach(function(n){
    if (/^office$/i.test(n)) { officeTeam().forEach(function(x){ out.push(x); }); return; }
    var x = staff().filter(function(y){ return low(y.n) === low(n); })[0]; if (x) out.push(x);
  });
  return out;
}
function mentionsOf(m){
  var out = [];
  function add(x){ if (x && !out.some(function(y){ return same(y, x); })) out.push(x); }
  arr(m.tags).forEach(function(t){
    var u = userBy(t); if (!u) return;
    if (/^office$/i.test(clean(u.name))) { expand(['Office']).forEach(add); return; }
    add(P(u));
  });
  expand(parse(m.text)).forEach(add);
  return out;
}
function senderOf(m){ var a = s(m.authorId); return { id: a, e: low(m.authorEmail) || (a.indexOf('@') > 0 ? low(a) : ''), n: clean(m.authorName) }; }
function slim(x, why){ var o = { id: s(x.id), e: s(x.e), n: s(x.n) }; if (why) o.why = why; return o; }
/* the owner's rule */
function calc(m, men){
  var sender = senderOf(m), out = [];
  function add(x, why){ if (!x || same(x, sender) || out.some(function(y){ return same(y, x); })) return; out.push(slim(x, why)); }
  men.forEach(function(x){ add(x, 'mention'); });
  var pm = pmOf(m.pid);
  if (pm) add(pm, 'pm'); else owners().forEach(function(x){ add(x, 'owner'); });
  return out;
}
function team(m){ return !(m.smsFrom || m.smsTo || m.channel === 'sms' || m.source === 'sms'); }
var RC = { src: null, psrc: null, map: {} };
/* who a message tells: [{ id, e, n, why }] — null for a text with a customer (everyone, as before) */
function recipients(m){
  if (!m || !team(m)) return null;
  if (Array.isArray(m.notify)) return m.notify;
  var a = s(m.authorId); if (!a || a === 'me') return [];   /* saved before this fix: the sender is not known — tells nobody */
  if (RC.src !== users() || RC.psrc !== projects()) RC = { src: users(), psrc: projects(), map: {} };
  var k = s(m.id) + '|' + s(m.pid); if (RC.map[k]) return RC.map[k];
  return (RC.map[k] = calc(m, mentionsOf(m)));
}
function stamp(m){
  if (!m) return m;
  var me = meP();
  if (me && (!s(m.authorId) || m.authorId === 'me' || m.authorId === me.id || same(senderOf(m), me))) {   /* my own message */
    if (!s(m.authorId) || m.authorId === 'me') m.authorId = me.id || me.e || me.n;
    if (!s(m.authorName) || m.authorName === 'Someone') m.authorName = me.n;
    if (me.e && !s(m.authorEmail)) m.authorEmail = me.e;
  }
  var men = mentionsOf(m);
  m.mentions = men.map(function(x){ return slim(x); });
  m.notify = calc(m, men);
  return m;
}
function tagsFor(text){ return expand(parse(text)).map(function(x){ return x.id || x.e || x.n; }).filter(function(v, i, l){ return v && l.indexOf(v) === i; }); }

/* ── what is waiting for me ── */
var FM = { sig: '', l: [] };
function forMe(){
  var raw = '', sraw = '';
  try { raw = localStorage.getItem('gc_job_messages') || '[]'; sraw = localStorage.getItem('gc_job_msg_seen') || '{}'; } catch (e) { return FM.l; }
  var me = meP(); if (!me) return [];
  var sig = raw.length + '|' + raw.slice(-60) + '|' + sraw.length + '|' + sraw.slice(-60) + '|' + me.id + me.e + me.n + '|' + users().length + '|' + projects().length + '|' + Math.floor(Date.now() / 30000);
  if (sig === FM.sig) return FM.l;
  var all = []; try { all = arr(JSON.parse(raw)); } catch (e) {}
  var seen = {}; try { seen = JSON.parse(sraw) || {}; } catch (e) {}
  var out = [];
  all.forEach(function(m){
    if (!m || !m.pid || m.deleted === true) return;
    if (s(m.at) <= s(seen[m.pid])) return;
    if (same(senderOf(m), me) || m.authorId === me.id) return;
    var r = recipients(m), mention = false;
    if (r === null) { if (s(m.authorId) === 'me') return; mention = arr(m.tags).indexOf(me.id) >= 0 || (me.e && arr(m.tags).indexOf(me.e) >= 0); }
    else { var mine = r.filter(function(x){ return same(x, me); }); if (!mine.length) return; mention = mine.some(function(x){ return x.why === 'mention'; }); }
    out.push({ m: m, mention: mention });
  });
  out.sort(function(a, b){ return s(b.m.at).localeCompare(s(a.m.at)); });
  FM = { sig: sig, l: out };
  return out;
}
W._gcJobMsgForMe = function(){ return forMe().slice(); };
W._gcJobMsgForMeCount = function(){ return forMe().length; };
W._gcJobMsgNotifiesMe = function(m){ var me = meP(); if (!m || !me || same(senderOf(m), me)) return false; var r = recipients(m); return r === null ? true : r.some(function(x){ return same(x, me); }); };
/* the counts every screen already reads (per-job badges, the Field alerts) follow the same rule */
var un = function(pid){ var n = 0; forMe().forEach(function(x){ if (x.m.pid === pid) n++; }); return n; };
un.__cached = true;   /* patch MSGCACHE leaves it alone */
W._gcJobMsgUnread = un;
W._gcJobMsgUnreadTotal = function(){ return forMe().length; };
W._gcJobMsgTaggedUnread = function(){ return forMe().filter(function(x){ return x.mention; }).map(function(x){ return x.m; }); };

function when(v){ var d = new Date(v); if (isNaN(d)) return ''; try { return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
W._gcJobMsgForYouHtml = function(){
  var l = forMe(); if (!l.length) return '';
  return '<div class="gcjm-fy" data-gc-keep="1" style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:8px 10px;margin:0 0 10px;font-family:Arial,sans-serif">'
    + '<div style="font-weight:800;color:#9f1239;font-size:13px;margin-bottom:4px">🔔 For you (' + l.length + ')</div>'
    + l.slice(0, 30).map(function(x){
      var m = x.m, who = s(m.authorName) || 'Someone';
      return '<button type="button" class="gcjm-fyi" data-pid="' + esc(m.pid) + '" data-mid="' + esc(m.id) + '" data-mention="' + (x.mention ? '1' : '0') + '" style="display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;background:#fff;border:1px solid #fecdd3;border-radius:8px;padding:9px 10px;margin:5px 0 0;cursor:pointer;font:13px Arial,sans-serif;color:#0f2440;min-height:44px;touch-action:manipulation">'
        + '<span style="flex:0 0 auto;width:22px;height:22px;border-radius:11px;background:' + (x.mention ? '#e11d48' : '#2563eb') + ';color:#fff;font-weight:800;display:inline-flex;align-items:center;justify-content:center;font-size:12px">' + (x.mention ? '@' : '💬') + '</span>'
        + '<span style="min-width:0;overflow-wrap:anywhere"><b>' + esc(who) + '</b> ' + (x.mention ? '@mentioned you on' : 'wrote on your job') + ' <b>' + esc(jobLabel(m.pid)) + '</b>: ' + esc(s(m.text).slice(0, 180))
        + '<span style="display:block;color:#64748b;font-size:11px;margin-top:2px">' + esc(when(m.at)) + ' · tap to open the thread</span></span></button>';
    }).join('') + '</div>';
};

/* ── the mention To-Do (the GrayCo Photos / APPRMENTION channel: gc_office_tasks kind "mention", 💬 Reply opens the thread) ── */
function tasksSave(list){
  try { localStorage.setItem('gc_office_tasks', JSON.stringify(list)); } catch (e) { warn(e); return false; }
  try { if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (W._gcSyncQ && W._gcSyncQ.add) W._gcSyncQ.add('gc_office_tasks', list); } catch (e) { warn(e); }
  return true;
}
function todos(m){
  var men = arr(m && m.notify).filter(function(x){ return x.why === 'mention'; }); if (!men.length) return [];
  var list = lsJ('gc_office_tasks', []); if (!Array.isArray(list)) list = [];
  var by = s(m.authorName) || 'Someone', job = jobLabel(m.pid), added = [], ks = {};
  men.forEach(function(x){
    var k = x.e || low(x.n); if (!k || ks[k]) return; ks[k] = 1;
    var id = 'jmmn_' + m.id + '_' + k.replace(/[^a-z0-9]/g, '');
    if (list.some(function(t){ return t && t.id === id; })) return;
    list.push({ id: id, kind: 'mention', label: '💬 ' + by + ' @mentioned you on ' + job, note: s(m.text).slice(0, 300), addedBy: by, addedAt: m.at, updatedAt: m.at, done: false,
      assignee: x.n, forUser: x.e || x.n, pid: s(m.pid), msgId: s(m.id), source: 'Job Messages' });
    added.push(x.n);
  });
  if (added.length && !tasksSave(list)) return [];
  return added;
}
function opened(pid){
  var me = meP(); if (!me || !pid) return;
  var list = lsJ('gc_office_tasks', []); if (!Array.isArray(list)) return;
  var at = nowIso(), ch = false;
  list.forEach(function(t){
    if (!t || t.kind !== 'mention' || t.source !== 'Job Messages' || t.pid !== pid || t.done) return;
    var who = s(t.forUser); if (!same({ id: '', e: who.indexOf('@') > 0 ? low(who) : '', n: who.indexOf('@') > 0 ? s(t.assignee) : who }, me)) return;
    t.done = true; t.doneAt = at; t.doneBy = me.n; t.updatedAt = at; t.doneWhy = 'read the thread'; ch = true;
  });
  if (ch) tasksSave(list);
}
function toast(msg){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.className = 'gcjm-toast'; t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:100400;background:#14532d;color:#fff;padding:10px 16px;border-radius:10px;font:600 13px Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;text-align:center';
    D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4500); } catch (e) {}
}

/* ── the box: chips, "@" list, the draft kept through a redraw ── */
var DR = {};
function draft(pid){ return DR[pid] || (DR[pid] = { v: '', s: null, e: null, f: false }); }
function keep(ov, pid){
  var ta = ov && ov.querySelector && ov.querySelector('#_jmText'); if (!ta) return;
  var d = draft(pid); d.v = ta.value; d.f = D.activeElement === ta;
  if (typeof ta.selectionStart === 'number') { d.s = ta.selectionStart; d.e = ta.selectionEnd; }
}
function chipsHtml(){
  return chips().map(function(x){
    return '<button type="button" class="_jmChip" data-jm-name="' + esc(x.n) + '" aria-pressed="false" title="Mention ' + esc(x.n) + '" style="display:inline-flex;align-items:center;font:600 13px Arial,sans-serif;background:#eef2f7;color:#0f2440;border:1px solid #d5dde8;border-radius:14px;padding:6px 11px;min-height:34px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(37,99,235,.2)">@' + esc(x.n) + '</button>';
  }).join('');
}
function chipText(h){
  try {
    chips().slice().sort(function(a, b){ return b.n.length - a.n.length; }).forEach(function(x){
      var e = esc('@' + x.n); if (h.indexOf(e) < 0) return;
      h = h.split(e).join('<b class="gcjm-at" style="background:rgba(99,102,241,.18);border-radius:6px;padding:0 3px">' + e + '</b>');
    });
  } catch (e) {}
  return h;
}
function wire(ov, pid){
  var ta = ov.querySelector('#_jmText'), box = ov.querySelector('#_jmMn'), tags = ov.querySelector('#_jmTags');
  if (!ta || ta.__gcjm) return; ta.__gcjm = true;
  var d = draft(pid), M = { at: -1, list: [], i: 0 };
  if (d.v && !ta.value) ta.value = d.v;
  function save(){ d.v = ta.value; if (typeof ta.selectionStart === 'number' && ta.selectionStart !== null) { d.s = ta.selectionStart; d.e = ta.selectionEnd; } }
  function focusAt(pos){
    try { ta.focus({ preventScroll: true }); } catch (e) { try { ta.focus(); } catch (x) {} }
    try { ta.setSelectionRange(pos, pos); } catch (e) {}
    d.s = d.e = pos; d.f = true;
  }
  function paintChips(){
    var t = ' ' + low(ta.value) + ' ';
    Array.prototype.forEach.call(ov.querySelectorAll('._jmChip'), function(b){
      var on = hasAt(t, '@' + low(b.getAttribute('data-jm-name')));
      if (b.getAttribute('aria-pressed') !== String(on)) { b.setAttribute('aria-pressed', String(on)); b.style.background = on ? '#dbeafe' : '#eef2f7'; b.style.borderColor = on ? '#2563eb' : '#d5dde8'; b.style.color = on ? '#1e3a8a' : '#0f2440'; }
    });
  }
  function hide(){ M.at = -1; M.list = []; M.i = 0; if (box) { box.style.display = 'none'; box.innerHTML = ''; } }
  function draw(){
    if (!box) return;
    box.style.cssText = 'display:block;background:#fff;border:1px solid #c7d2fe;border-radius:9px;box-shadow:0 6px 18px rgba(15,23,42,.14);margin:6px 0;max-height:220px;overflow:auto;font:14px Arial,sans-serif;color:#1e1b4b';
    box.innerHTML = '<div style="padding:6px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #eef2ff">Mention someone on the team</div>' + M.list.map(function(x, i){
      return '<button type="button" role="option" data-jm-i="' + i + '" aria-selected="' + (i === M.i) + '" style="display:flex;justify-content:space-between;gap:10px;width:100%;border:0;background:' + (i === M.i ? '#eef2ff' : '#fff') + ';padding:10px;text-align:left;cursor:pointer;font:14px Arial,sans-serif;min-height:44px;color:#1e1b4b;touch-action:manipulation"><b>@' + esc(x.n) + '</b><span style="color:#64748b;font-size:12px">' + esc(x.r) + '</span></button>';
    }).join('');
  }
  function scan(){
    var v = ta.value, c = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length;
    var m = /(^|[\s(])@([A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*)?)?$/.exec(v.slice(0, c));
    if (!m) { hide(); return; }
    var q = low(m[2] || ''), l = chips().filter(function(x){ var n = low(x.n); return !q || n.indexOf(q) === 0 || n.split(' ').some(function(w){ return w.indexOf(q) === 0; }); }).slice(0, 8);
    if (!l.length) { hide(); return; }
    if (M.q !== q) M.i = 0;
    M.at = c - (m[2] || '').length - 1; M.q = q; M.list = l; if (M.i >= l.length) M.i = 0;
    draw();
  }
  /* put txt in place of [a, b) — the cursor (or the end when the phone lost it) */
  function insert(txt, a, b){
    var v = ta.value;
    a = typeof a === 'number' && a >= 0 && a <= v.length ? a : v.length;
    b = typeof b === 'number' && b >= a && b <= v.length ? b : a;
    var pre = v.slice(0, a), post = v.slice(b);
    if (pre && !/[\s(]$/.test(pre)) txt = ' ' + txt;
    if (/^\s/.test(post)) txt = txt.replace(/\s+$/, '');
    ta.value = pre + txt + post; d.v = ta.value;
    var pos = (pre + txt).length + (/^\s/.test(post) ? 1 : 0);
    hide(); focusAt(pos); paintChips();
  }
  function chip(name){
    if (hasAt(' ' + low(ta.value) + ' ', '@' + low(name))) { focusAt(typeof d.s === 'number' && d.s <= ta.value.length ? d.s : ta.value.length); return; }   /* already in the message */
    var a = d.s, b = d.e;
    if (D.activeElement === ta && typeof ta.selectionStart === 'number') { a = ta.selectionStart; b = ta.selectionEnd; }
    insert('@' + name + ' ', a, b);
  }
  function pick(i){
    var x = M.list[i]; if (!x || M.at < 0) { hide(); return; }
    var c = D.activeElement === ta && typeof ta.selectionStart === 'number' ? ta.selectionStart : (typeof d.s === 'number' ? d.s : ta.value.length);
    var at = M.at; insert('@' + x.n + ' ', at, Math.max(at, c));
  }
  ['input', 'keyup', 'mouseup', 'touchend', 'select', 'focus'].forEach(function(n){ ta.addEventListener(n, function(){ save(); if (n === 'focus') d.f = true; }); });
  /* iOS moves the cursor without a key or input event */
  var onSel = function(){ if (!ta.isConnected) { D.removeEventListener('selectionchange', onSel); return; } if (D.activeElement === ta) save(); };
  D.addEventListener('selectionchange', onSel);
  ta.addEventListener('input', function(){ scan(); paintChips(); });
  ta.addEventListener('click', scan);
  ta.addEventListener('blur', function(){ d.f = false; later(function(){ if (D.activeElement !== ta && !(box && box.__hold)) hide(); }, 400); });
  ta.addEventListener('keydown', function(ev){
    if (!M.list.length) return;
    var k = ev.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { M.i = (M.i + (k === 'ArrowDown' ? 1 : -1) + M.list.length) % M.list.length; draw(); }
    else if (k === 'Enter' || k === 'Tab') pick(M.i);
    else if (k === 'Escape') hide();
    else return;
    ev.preventDefault(); ev.stopPropagation();
  });
  [tags, box].forEach(function(host){
    if (!host) return;
    /* the box keeps the focus (and the cursor) while a name is tapped */
    host.addEventListener('mousedown', function(ev){ if (ev.target.closest && ev.target.closest('button')) ev.preventDefault(); });
    host.addEventListener('touchstart', function(){ if (host === box) { box.__hold = true; later(function(){ box.__hold = false; }, 900); } }, { passive: true });
    host.addEventListener('click', function(ev){
      var b = ev.target.closest && ev.target.closest('[data-jm-name],[data-jm-i]'); if (!b) return;
      ev.preventDefault(); ev.stopPropagation();
      if (b.hasAttribute('data-jm-i')) pick(+b.getAttribute('data-jm-i')); else chip(b.getAttribute('data-jm-name'));
    });
  });
  if (d.f) focusAt(typeof d.s === 'number' && d.s <= ta.value.length ? d.s : ta.value.length);
  paintChips();
}
function sent(m, ov){
  if (!m) return;
  var pid = m.pid; DR[pid] = { v: '', s: null, e: null, f: false };
  var ta = ov && ov.querySelector && ov.querySelector('#_jmText'); if (ta) ta.value = '';
  var added = []; try { added = todos(m); } catch (e) { warn(e); }
  var told = arr(m.notify).map(function(x){ return x.n + (x.why === 'pm' ? ' (PM)' : x.why === 'owner' ? ' (owner)' : ''); });
  toast(told.length ? 'Sent — ' + told.join(', ') + (told.length === 1 ? ' was' : ' were') + ' told in 💬 Messages.' : 'Sent.');
  try { if (W._gcRefreshAlerts) W._gcRefreshAlerts(); } catch (e) {}
  paint();
  return added;
}

W._gcJM = { stamp: stamp, recipients: recipients, tagsFor: tagsFor, sent: sent, opened: opened, keep: keep, wire: wire, chipsHtml: chipsHtml, chipText: chipText, parse: parse, todos: todos };

/* ── the 💬 Messages badge: left menu, Field tile / bar, old Field home tile ── */
var css0 = false;
function css(){
  if (css0) return; css0 = true;
  var st = D.createElement('style'); st.id = 'gcjm-css';
  st.textContent = '.gcjm-nb{margin-left:auto;background:#e11d48;color:#fff;font:800 11px/20px Arial,sans-serif;min-width:20px;height:20px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;box-sizing:border-box}'
    + '.fh-tile .gcjm-nb,._fhTile .gcjm-nb{margin-left:auto}#gc-fh-tabs .gcjm-nb{position:absolute;top:0;right:12px;margin:0}#gc-fh-tabs [data-t]{position:relative}'
    + '#_jmTags ._jmChip[aria-pressed="true"]{box-shadow:0 0 0 1px #2563eb inset}';
  (D.head || D.documentElement).appendChild(st);
}
function navLabel(el){ return s(el.textContent).replace(/(\s*\d+\+?)+$/, '').replace(/^[^A-Za-z]+/, '').trim(); }
function badge(el, n, tip){
  var b = el.querySelector(':scope > .gcjm-nb');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = D.createElement('span'); b.className = 'gcjm-nb'; el.appendChild(b); }
  var v = String(n); if (b.textContent !== v) b.textContent = v;
  if (b.title !== tip) { b.title = tip; b.setAttribute('aria-label', tip); }
}
function paint(){
  try {
    if (D.hidden) return;
    var n = 0; try { n = forMe().length; } catch (e) {}
    if (n) css();
    var tip = n + ' new message' + (n === 1 ? '' : 's') + ' for you in 💬 Messages';
    var els = Array.prototype.filter.call(D.querySelectorAll('aside nav button, nav button, aside button, [role=navigation] button, #gc-mobile-bottom-nav button'), function(el){ return /^Messages$/.test(navLabel(el)); });
    Array.prototype.forEach.call(D.querySelectorAll('.fh-tile[data-tile="msgs"], ._fhTile[data-fn="messages"], #gc-fh-tabs [data-t="msgs"]'), function(el){ els.push(el); });
    els.forEach(function(el){ badge(el, n, tip); });
  } catch (e) { warn(e); }
}
RI.call(W, paint, 1500);
later(paint, 1200);
try { console.log('[GC] 💬 Job message @mentions + who is told (patch JOBMENTION): _gcJM, _gcJobMsgForMe()'); } catch (e) {}
})();
</script>
