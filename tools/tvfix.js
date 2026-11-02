/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   patch TVFIX — every "Office TV" entry point opens the NEW 📺 office TV (patch OFFICETV), and ⚙ Admin has one 📺 TVs bar
   (owner 11/02: "where is back office and front office TV, I don't see in admin, only see office TV which shows back office
   with no changes in themes etc, feels old").

   1. One way in: window._gcTVFIX.office() opens the new office TV (window._gcOTV.open()). patch AUTO8's ⚙ Admin button, the
      🧭 GrayCo Systems tile and window._gcA8.tv all go through it; _gcA8.tv is re-pointed (and kept re-pointed) to it, the
      old navy slideshow stays reachable only as _gcA8.tvClassic. The old one is shown ONLY when the new office TV did not
      load on this computer — and then it is written to the perf report (_gcPerfRep.note) with the reason.
      If the old slideshow ever shows up while the new TV is loaded (some path we did not know about), it is closed and
      the new TV opens in its place (also noted).
   2. ⚙ Admin: one "📺 TVs" bar where patch AUTO8's "📺 Office TV scoreboard" was (AUTO8 keeps 🦺 Toolbox talk topics and
      🏗 Retainage held): [📺 Back office TV] [🖥 Front room (lobby) TV editor] and the 🏁 Team goals (this month: 5★ reviews,
      jobs completed, new leads — gc_kv "gc_tv_goals", the same value OFFICETV reads). It is found by the page itself
      (main h1 "Admin" or the settings hub #gc-adm-hub), not by another patch's card box, so it is there however Admin was
      opened (the left menu, the role-app Desk, ☰ More → All systems). OFFICETV's own two cards (#gc-otv-goals,
      #gc-otv-lobbycard) are folded into this bar (the ids live here, so OFFICETV does not add them again).
   3. 🧭 GrayCo Systems → The office: the same two buttons (📺 Back office TV · 🖥 Front room (lobby) TV editor); the
      📺 Lobby TV tile under Website & marketing stays.
   4. Why the new TV went missing: an error thrown while the OFFICETV script ran left window._gcOTV undefined (the
      AUTO8 button then fell back to the old TV). The small script just before OFFICETV (gc-patch-tvfix-pre) catches any such
      error; this script reports it (perf report) and console.warns it.
   API: window._gcTVFIX = { office(), lobby(), state(), paint() }
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_TVFIX__) return; window.__GC_PATCH_TVFIX__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsRaw(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function warn(e){ try { console.warn('[GC TVFIX]', e && e.message || e); } catch (x) {} }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function role(){ try { if (W._gcRP && W._gcRP.role) return s(W._gcRP.role()); } catch (e) {} return ''; }
function me(){ try { var u = W.meUser && W.meUser(); if (u && u.name) return s(u.name); } catch (e) {} return ''; }
function OTV(){ var o = W._gcOTV; return o && typeof o.open === 'function' ? o : null; }
function LOBA(){ var l = W._gcLobbyAdmin; return l && typeof l.open === 'function' ? l : null; }
/* who may open the TVs: what OFFICETV says; without it, the same rule (admin / office, the role the menu follows) */
function canTV(){ var o = OTV(); if (o) { try { return !!o.allowed(); } catch (e) {} } var r = role(); return /^admin$/i.test(r) || /^office/i.test(r) || (!r && isAdmin()); }
function canLobby(){ var l = LOBA(); if (l && l.canSee) { try { return !!l.canSee(); } catch (e) {} } return canTV(); }
function toast(msg, bad){
  try { var t = D.createElement('div'); t.className = 'gc-tvs-toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg; D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4200); } catch (e) {}
}
var NOTED = {};
function note(k){ if (NOTED[k]) return; NOTED[k] = 1; warn(k); try { if (W._gcPerfRep && W._gcPerfRep.note) W._gcPerfRep.note('TVFIX: ' + k); } catch (e) {} }

/* ── 4. did OFFICETV load? (gc-patch-tvfix-pre caught any error thrown while it ran) ── */
var PRE = W.__GC_TVFIX_PRE__ || null, LOADERR = '';
try { if (PRE && PRE.stop) PRE.stop(); } catch (e) {}
function loadState(){
  if (OTV()) return 'ok';
  var e = PRE && PRE.errs && PRE.errs[0];
  if (e) return 'error: ' + s(e).slice(0, 160);
  if (W.__GC_PATCH_OFFICETV__) return 'started, did not finish';
  if (!D.getElementById('gc-patch-officetv')) return 'not on the page';
  return 'did not run';
}
if (!OTV()) { LOADERR = loadState(); note('the new office TV (OFFICETV) did not load: ' + LOADERR); }

/* ── 1. one way in ── */
var CLASSIC = null, VIA_CLASSIC = 0;
function classic(){ var A = W._gcA8; return CLASSIC || (A && (A.tvClassic || (A.tv && !A.tv.__tvfix ? A.tv : null))) || null; }
function office(){
  var o = OTV();
  if (o) { try { return o.open(); } catch (e) { note('office TV open() threw: ' + s(e && e.message).slice(0, 120)); } }
  if (!canTV()) { toast('The office TV is for admin and office sign-ins.', true); return null; }
  var c = classic();
  note('the old scoreboard was shown because the new office TV is not loaded (' + (LOADERR || loadState()) + ')');
  if (c) { VIA_CLASSIC = Date.now(); try { return c(); } catch (e) { warn(e); } }
  toast('📺 The office TV is not loaded on this computer — reload the page.', true); return null;
}
function lobby(){
  var l = LOBA();
  if (l) { try { return l.open(); } catch (e) { warn(e); } }
  note('the lobby TV editor is not loaded (' + (LOADERR || loadState()) + ')');
  toast('🖥 The lobby TV editor is not loaded on this computer — reload the page.', true); return null;
}
office.__tvfix = true;
function hookA8(){
  var A = W._gcA8; if (!A) return;
  if (A.tv && A.tv.__tvfix) return;
  if (!CLASSIC) CLASSIC = A.tvClassic || A.tv || null;   /* OFFICETV keeps the original as tvClassic */
  if (CLASSIC && !A.tvClassic) A.tvClassic = CLASSIC;
  A.tv = office;
}
/* the old slideshow (#gc-a8-tv) on screen while the new TV is loaded = a path we did not re-point: swap it */
function guardOld(){
  var el = D.getElementById('gc-a8-tv'); if (!el || !OTV()) return;
  if (VIA_CLASSIC && Date.now() - VIA_CLASSIC < 5000) return;
  note('the old scoreboard opened from an unknown place — replaced by the new office TV');
  try { if (el.__close) el.__close(); else el.remove(); } catch (e) { try { el.remove(); } catch (x) {} }
  try { OTV().open(); } catch (e) { warn(e); }
}

/* ── 2. ⚙ Admin: the 📺 TVs bar ── */
var CSS = '#gc-tvs-admin{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #D4A017;border-radius:12px;padding:10px 14px;margin:8px 0;color:#0f172a;font:13px Inter,Arial,sans-serif}' +
  '#gc-tvs-admin .hd{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#gc-tvs-admin .hd .t{flex:1 1 260px;min-width:0}#gc-tvs-admin .hd .t b{font-size:15px}' +
  '#gc-tvs-admin button{padding:8px 14px;border-radius:8px;border:none;font-weight:800;cursor:pointer;min-height:38px;font:inherit;font-weight:800}' +
  '#gc-tvs-admin button[data-tvs="office"]{background:#0F1D2F;color:#fff}#gc-tvs-admin button[data-tvs="lobby"]{background:#D4A017;color:#0F1D2F}#gc-tvs-admin button[data-tvs="tg"]{background:#e2e8f0;color:#0f172a}' +
  '#gc-tvs-admin .tg{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0}#gc-tvs-admin .tg label{white-space:nowrap}' +
  '#gc-tvs-admin .tg input{width:64px;padding:5px 6px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#gc-tvs-admin .mut{color:#64748b}' +
  '.gc-tvs-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483600;background:#0F1D2F;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px Inter,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)}.gc-tvs-toast.bad{background:#b91c1c}';

function css(){ if (D.getElementById('gc-tvs-css')) return; var st = D.createElement('style'); st.id = 'gc-tvs-css'; st.textContent = CSS; (D.head || D.documentElement).appendChild(st); }
function adminH1(){
  var main = D.querySelector('main'); if (!main) return null;
  var hs = main.querySelectorAll('h1'); for (var i = 0; i < hs.length; i++) if (s(hs[i].textContent).replace(/^[^A-Za-z]+/, '') === 'Admin' && hs[i].getClientRects().length) return hs[i];
  return null;
}
/* gc_kv "gc_tv_goals" — the same read / write as OFFICETV (it reads it every 5 minutes; the local copy now) */
function creds(){ return { u: (s(lsRaw('grayco_sb_url')) || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k: s(lsRaw('grayco_sb_key')) }; }
function sbH(extra){ var c = creds(), h = { 'Content-Type': 'application/json' }; if (c.k) { h.apikey = c.k; h.Authorization = 'Bearer ' + c.k; } return Object.assign(h, extra || {}); }
function goalsGet(){
  var c = creds();
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.gc_tv_goals&select=value', { headers: sbH(), cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; }).then(function(rows){ return rows && rows[0] ? obj(rows[0].value) : null; }, function(){ return null; });
}
function goalsPut(v){
  var c = creds();
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: 'gc_tv_goals', value: v, updated_at: new Date().toISOString() }) }).then(function(r){ return r.ok; }, function(){ return false; });
}
function cachedGoals(){ try { return obj(JSON.parse(lsRaw('gc_tv_goals_cache') || 'null')); } catch (e) { return {}; } }
function barHtml(){
  var g = cachedGoals(), adm = isAdmin();
  function inp(k, l){ return '<label>' + l + ' <input data-tg="' + k + '" type="number" min="0" inputmode="numeric" value="' + esc(g[k] || '') + '"' + (adm ? '' : ' disabled') + '></label>'; }
  return '<div class="hd" id="gc-otv-lobbycard"><span class="t"><b>📺 TVs</b> · <span class="mut">the back office TV (goals, PM leaderboard, scoreboard, this week) and the front room TV for customers</span></span>' +
    '<button type="button" data-tvs="office" data-otv="tv">📺 Back office TV</button><button type="button" data-tvs="lobby" data-otv="lobby">🖥 Front room (lobby) TV editor</button></div>' +
    '<div class="tg" id="gc-otv-goals"><b>🏁 Team goals</b><span class="mut">this month, on the back office TV:</span>' + inp('reviews', '⭐ 5-star reviews') + inp('jobs', '✅ jobs completed') + inp('leads', '📈 new leads') +
    (adm ? '<button type="button" data-tvs="tg" data-otv="tg">Save goals</button>' : '<span class="mut">(an admin sets these)</span>') + '</div>';
}
function onBar(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-tvs]') : null; if (!b) return;
  var a = b.getAttribute('data-tvs');
  if (a === 'office') return office();
  if (a === 'lobby') return lobby();
  if (a === 'tg') {
    if (!isAdmin()) return toast('Only an admin sets the team goals.', true);
    var bar = D.getElementById('gc-tvs-admin'), v = { at: new Date().toISOString(), by: me() };
    Array.prototype.forEach.call(bar.querySelectorAll('[data-tg]'), function(i){ var n = Math.max(0, Math.round(num(i.value))); if (n) v[i.getAttribute('data-tg')] = n; });
    b.disabled = true;
    goalsPut(v).then(function(ok){ b.disabled = false; if (ok) lsSet('gc_tv_goals_cache', v); toast(ok ? '🏁 Team goals saved — on the back office TV' : 'Could not save the team goals.', !ok); });
  }
}
var PULLED = 0;
function paint(){
  var h1 = adminH1(), have = D.getElementById('gc-tvs-admin');
  if (!h1 || !canTV()) { if (have) have.remove(); return; }
  /* OFFICETV's own cards (made when its card box is there): this bar holds them now */
  ['gc-otv-goals', 'gc-otv-lobbycard'].forEach(function(id){ var x = D.getElementById(id); if (x && !(have && have.contains(x))) x.remove(); });
  /* patch AUTO8's old "📺 Office TV scoreboard" part, if an older AUTO8 bar is still drawn */
  var a8 = D.getElementById('gc-a8-admin');
  if (a8) { var ob = a8.querySelector('[data-a8adm="tv"]'); if (ob) { var sp = ob.previousElementSibling; if (sp && /Office TV/.test(sp.textContent || '')) sp.remove(); ob.remove(); } }
  var par = h1.parentNode;
  /* where: in AUTO8's place (just before its bar), else after the 🎯 Company goal box, else after the settings hub, else under the heading */
  var x10 = D.getElementById('gc-x10-admin'), hub = D.getElementById('gc-adm-hub');
  var before = a8 && a8.parentNode ? a8 : null, after = null;
  if (!before) after = x10 && x10.parentNode ? x10 : hub && hub.parentNode ? hub : h1;
  if (have && have.isConnected) {
    var placed = before ? have.nextElementSibling === before : have.previousElementSibling === after;
    if (!placed) { if (before) before.parentNode.insertBefore(have, before); else after.parentNode.insertBefore(have, after.nextSibling); }
    return;
  }
  css();
  var c = D.createElement('div'); c.id = 'gc-tvs-admin'; c.setAttribute('data-gc-keep', '1'); c.innerHTML = barHtml();
  c.addEventListener('click', onBar);
  if (before) before.parentNode.insertBefore(c, before); else (after.parentNode || par).insertBefore(c, after.nextSibling);
  if (Date.now() - PULLED > 60000) { PULLED = Date.now();
    goalsGet().then(function(v){ if (!v) return; lsSet('gc_tv_goals_cache', v); var bar = D.getElementById('gc-tvs-admin'); if (!bar) return;
      Array.prototype.forEach.call(bar.querySelectorAll('[data-tg]'), function(i){ if (D.activeElement !== i) i.value = v[i.getAttribute('data-tg')] || ''; }); }); }
}

/* ── 3. 🧭 GrayCo Systems → The office: the two tiles are in its TILES() list (patch_TVFIX.py) and come here ── */

/* ── the loop: cheap checks only ── */
var TICKS = 0, TERR = '';
function tick(){
  TICKS++;
  try { hookA8(); } catch (e) {}
  try { paint(); } catch (e) { TERR = s(e && e.message); warn(e); }
  try { guardOld(); } catch (e) {}
}
/* the browser's own interval (patch SYNCPERF's, captured before any governor): the governed ones run every 30 s once nobody
   has touched the computer for a minute, and Admin opened from code or a remote click would wait that long for its bar.
   The tick is a handful of getElementById / querySelector calls. Any click or view change also paints at once. */
var RAW = W.__GC_REAL_SETINTERVAL__ || RI;
hookA8(); RAW.call(W, tick, 1000); later(tick, 300);
W.addEventListener('hashchange', function(){ later(tick, 400); });
D.addEventListener('click', function(){ later(tick, 350); later(tick, 1200); }, true);
W._gcTVFIX = { office: office, lobby: lobby, paint: paint, canTV: canTV, canLobby: canLobby,
  state: function(){ return { otv: !!OTV(), lobby: !!LOBA(), load: LOADERR || loadState(), a8: !!(W._gcA8 && W._gcA8.tv && W._gcA8.tv.__tvfix), classicShown: VIA_CLASSIC, bar: !!D.getElementById('gc-tvs-admin'), notes: Object.keys(NOTED), ticks: TICKS, err: TERR }; } };
try { console.log('[GC] TVFIX: every Office TV entry → the new TV; ⚙ Admin 📺 TVs bar (back office TV · lobby editor · team goals) — _gcTVFIX.state()'); } catch (e) {}
})();
