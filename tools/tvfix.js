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
   2. ⚙ Admin (owner 11/02, from his screenshot): OFFICETV's "📺 Lobby TV … [Open] [📺 Office TV]" row in the Admin list (above
      📟 On call) becomes "📺 TVs · back office and front room screens" with [📺 Back office TV] [🖥 Front room (lobby) TV] side
      by side and the look every back office TV starts in. 🏁 Team goals stays under 🎯 Company goal. patch AUTO8's
      "📺 Office TV scoreboard" is taken out of its bar, so there is one place. Found from the page (main h1 "Admin"), so it is
      there however Admin was opened (the left menu, the role-app Desk's ☰ More); drawn here if OFFICETV cannot draw it.
   3. 🧭 GrayCo Systems → The office: 📺 Back office TV · 🖥 Front room (lobby) TV (the 📺 Lobby TV tile under Website &
      marketing stays).
   4. Why he saw the old TV (reproduced): his tab was still running the build before r17j (r17i, no OFFICETV at all) — exactly
      the old "Office TV scoreboard" bar, the old navy slideshow, no Team goals / Lobby TV rows; a fresh r17j sign-in (1366×768
      and 1920×1080, Admin from the Desk) has all of it. The "newer version" bar only asks. Also found: OFFICETV's Admin rows
      come from a timer that patch SYNCPERF's idle pacing runs every 30 s once nobody has touched the computer for a minute,
      so they could be missing for up to 30 s; this script asks for them at once. If OFFICETV ever fails while it loads, the
      small script just before it (gc-patch-tvfix-pre) keeps the error and this one puts it in the perf report.
   5. 🔵 Blue (default) / ⚪ White — the back office TV's look; a switch in its control bar (this TV, localStorage gc_otv_theme),
      the admin's default for every TV in the TVs row (gc_kv gc_tv_goals.theme, saved merged with the team goals).
   API: window._gcTVFIX = { office(), lobby(), state(), paint(), theme(), setTheme(v) }
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
  if (CUR) { CUR = null; BG.k = ''; } try { themeApply(); } catch (e) {}
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

/* ── 2. ⚙ Admin: the 📺 TVs row (owner 11/02, from his screenshot: "the lobby TV should be by back office TV" — in the Admin
   list, where OFFICETV's "📺 Lobby TV … [Open] [📺 Office TV]" row is, above 📟 On call / 🚚 Vehicles & gas): that row becomes
   "📺 TVs · back office and front room screens" with [📺 Back office TV] [🖥 Front room (lobby) TV] side by side, and the look
   every back office TV starts in (🔵 Blue / ⚪ White). 🏁 Team goals stays where OFFICETV puts it (under 🎯 Company goal).
   patch AUTO8's "📺 Office TV scoreboard" is gone from its bar (patch_TVFIX.py), so there is one place.
   OFFICETV draws its cards from a timer the idle pacing slows to 30 s; this asks it at once when Admin is on screen. If the
   cards cannot come (OFFICETV not loaded, or its card box missing) the same row + the goals are drawn here instead. ── */
var CSS = '#gc-otv-lobbycard.gc-tvs{align-items:center}#gc-otv-lobbycard.gc-tvs .bt{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
  '#gc-otv-lobbycard.gc-tvs button[data-otv="tv"],#gc-otv-lobbycard.gc-tvs button[data-tvs="office"]{background:#0F1D2F;color:#fff}' +
  '#gc-otv-lobbycard.gc-tvs button[data-otv="lobby"],#gc-otv-lobbycard.gc-tvs button[data-tvs="lobby"]{background:#D4A017;color:#0F1D2F}' +
  '#gc-otv-lobbycard.gc-tvs select{padding:7px 8px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;min-height:38px;background:#fff;color:#0f172a}' +
  '.gcx10-bar[data-tvs-own="1"]{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;background:#fff;border:1px solid #e2e8f0;border-left:3px solid #D4A017;border-radius:10px;padding:8px 12px;margin:8px 0;color:#0f172a;font:13px Inter,Arial,sans-serif}' +
  '.gcx10-bar[data-tvs-own="1"] button{padding:8px 14px;border-radius:8px;border:none;background:#e2e8f0;color:#0f172a;font-weight:800;cursor:pointer;min-height:38px}.gcx10-bar[data-tvs-own="1"] input{width:64px}' +
  '.gc-tvs-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483600;background:#0F1D2F;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px Inter,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)}.gc-tvs-toast.bad{background:#b91c1c}';
function css(){ if (D.getElementById('gc-tvs-css')) return; var st = D.createElement('style'); st.id = 'gc-tvs-css'; st.textContent = CSS + TCSS; (D.head || D.documentElement).appendChild(st); }
function adminH1(){
  var main = D.querySelector('main'); if (!main) return null;
  var hs = main.querySelectorAll('h1'); for (var i = 0; i < hs.length; i++) if (s(hs[i].textContent).replace(/^[^A-Za-z]+/, '') === 'Admin' && hs[i].getClientRects().length) return hs[i];
  return null;
}
/* gc_kv "gc_tv_goals" — the TV settings OFFICETV reads (every 5 minutes; its local copy gc_tv_goals_cache):
   { reviews, jobs, leads, theme, at, by } — theme is the admin's default look for every back office TV */
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
/* the row: OFFICETV's buttons keep data-otv (its own click handler opens them); the fallback row uses data-tvs (ours) */
function rowHtml(own){
  var th = okTheme(cachedGoals().theme) || 'blue', adm = isAdmin(), A = own ? 'data-tvs' : 'data-otv';
  return '<span><b>📺 TVs</b> · back office and front room screens</span><span class="bt">' +
    '<button type="button" ' + A + '="' + (own ? 'office' : 'tv') + '" data-tvs-b="office">📺 Back office TV</button>' +
    '<button type="button" ' + A + '="lobby" data-tvs-b="lobby">🖥 Front room (lobby) TV</button>' +
    '<select data-tvs-def title="The look every back office TV starts in (a TV switched with its own 🔵 / ⚪ button keeps its choice)"' + (adm ? '' : ' disabled') + '>' +
    THEMES.map(function(x){ return '<option value="' + x.k + '"' + (th === x.k ? ' selected' : '') + '>TV look: ' + esc(x.l) + '</option>'; }).join('') + '</select></span>';
}
function goalsHtml(){
  var g = cachedGoals(), adm = isAdmin();
  function inp(k, l){ return l + ' <input data-tg="' + k + '" type="number" min="0" value="' + esc(g[k] || '') + '"' + (adm ? '' : ' disabled') + '> '; }
  return '<span><b>🏁 Team goals</b> · this month, on the 📺 back office TV: ' + inp('reviews', '⭐ 5-star reviews') + inp('jobs', '✅ jobs completed') + inp('leads', '📈 new leads') + '</span>' +
    (adm ? '<button type="button" data-tvs="tg" style="background:#D4A017;color:#0f172a">Save</button>' : '');
}
function saveTv(patch, okMsg, btn){
  if (!isAdmin()) { toast('Only an admin sets this.', true); return; }
  if (btn) btn.disabled = true;
  /* the row holds the goals and the look: read it first so one never wipes the other */
  goalsGet().then(function(cur){
    var v = Object.assign({}, obj(cur || cachedGoals()), patch, { at: new Date().toISOString(), by: me() });
    Object.keys(v).forEach(function(k){ if (v[k] === null) delete v[k]; });
    return goalsPut(v).then(function(ok){ if (btn) btn.disabled = false; if (ok) { lsSet('gc_tv_goals_cache', v); themeApply(); } toast(ok ? okMsg : 'Could not save it — try again.', !ok); });
  });
}
function onOwn(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-tvs]') : null; if (!b) return;
  var a = b.getAttribute('data-tvs');
  if (a === 'office') return office();
  if (a === 'lobby') return lobby();
  if (a === 'tg') {
    var p = {}; Array.prototype.forEach.call(D.querySelectorAll('#gc-otv-goals [data-tg]'), function(i){ var n = Math.max(0, Math.round(num(i.value))); p[i.getAttribute('data-tg')] = n || null; });
    saveTv(p, '🏁 Team goals saved — on the back office TV', b);
  }
}
function onDef(e){
  var sel = e.target && e.target.hasAttribute && e.target.hasAttribute('data-tvs-def') ? e.target : null; if (!sel) return;
  saveTv({ theme: okTheme(sel.value) || 'blue' }, '🎨 Every back office TV now starts ' + themeLabel(okTheme(sel.value) || 'blue'));
}
function dress(row, own){
  if (row.getAttribute('data-tvs-row') === (own ? 'own' : 'otv')) return;
  css(); row.classList.add('gc-tvs'); row.setAttribute('data-tvs-row', own ? 'own' : 'otv'); row.style.borderLeftColor = '#D4A017';
  row.innerHTML = rowHtml(own);
  try { paintScreens(true); } catch (e) {}
  if (!row.__tvsDef) { row.__tvsDef = 1; row.addEventListener('change', onDef); }
}
var PULLED = 0, HAND = 0;
/* where the rows go, every time Admin is drawn or changes (owner: "the lobby TV should be by back office TV", in the old Lobby TV
   spot): inside patch X10's card box, 🏁 Team goals right under 🎯 Company goal and the 📺 TVs row right under it (so above
   📟 On call). X10's box can come late (its timer is idle-paced, and a heavy page draws it later): until it is there a stand-in
   pair stands after the settings hub; the moment the box is there the rows are put in their places (OFFICETV's own when it is
   loaded, the stand-ins moved in when it is not). Never two of either: extra copies are taken off. */
function one(id){ var L = D.querySelectorAll('[id="' + id + '"]'), keep = null; Array.prototype.forEach.call(L, function(x){ if (!keep && (x.getAttribute('data-tvs-own') !== '1' || L.length === 1)) keep = x; }); keep = keep || L[0] || null;
  Array.prototype.forEach.call(L, function(x){ if (x !== keep) x.remove(); }); return keep; }
function after(el, ref){ if (el && ref && ref.parentNode && el.previousElementSibling !== ref) ref.parentNode.insertBefore(el, ref.nextSibling); }
function standIns(){
  css();
  var g = D.createElement('div'); g.className = 'gcx10-bar'; g.id = 'gc-otv-goals'; g.setAttribute('data-tvs-own', '1'); g.style.borderLeftColor = '#D4A017'; g.innerHTML = goalsHtml(); g.addEventListener('click', onOwn);
  var r = D.createElement('div'); r.className = 'gcx10-bar'; r.id = 'gc-otv-lobbycard'; r.setAttribute('data-tvs-own', '1'); r.addEventListener('click', onOwn); dress(r, true);
  return { g: g, r: r };
}
function paint(){
  var h1 = adminH1();
  if (!h1 || !canTV()) { if (!h1) Array.prototype.forEach.call(D.querySelectorAll('[data-tvs-own="1"]'), function(x){ x.remove(); }); return; }
  /* patch AUTO8's old "📺 Office TV scoreboard" part, if an older AUTO8 bar is still drawn */
  var a8 = D.getElementById('gc-a8-admin');
  if (a8) { var ob = a8.querySelector('[data-a8adm="tv"]'); if (ob) { var sp = ob.previousElementSibling; if (sp && /Office TV/.test(sp.textContent || '')) sp.remove(); ob.remove(); } }
  var o = OTV(), x10 = D.getElementById('gc-x10-admin'), gb = x10 && x10.querySelector('[data-a="goal"]'), goalBar = gb && (gb.closest('.gcx10-bar') || gb.parentNode);
  if (x10 && goalBar && goalBar.parentNode === x10) {
    if (o && o._adm) {
      /* OFFICETV draws its own two rows in the box: the stand-ins step aside so it does; one it did not draw comes back */
      var owns = D.querySelectorAll('[data-tvs-own="1"]'), held = [];
      if (!owns.length || Date.now() - HAND > 5000) {   /* a failed hand-over is tried again at most every 5 s (no redraw loop) */
        if (owns.length) HAND = Date.now();
        held = Array.prototype.map.call(owns, function(x){ var h = { x: x, p: x.parentNode, n: x.nextSibling }; x.remove(); return h; });
        try { o._adm(); } catch (e) {}
      }
      held.forEach(function(h){ if (!D.getElementById(h.x.id) && h.p) h.p.insertBefore(h.x, h.n && h.n.parentNode === h.p ? h.n : null); });
    }
    var g = one('gc-otv-goals'), r = one('gc-otv-lobbycard');
    if (!g || !r) { var si = standIns(); if (!g) g = si.g; if (!r) r = si.r; }
    after(g, goalBar); after(r, g);
    if (r.getAttribute('data-tvs-own') !== '1') dress(r, false);
  } else {
    /* no X10 box yet: OFFICETV cannot draw; the stand-ins after the settings hub (or the heading) */
    var g2 = one('gc-otv-goals'), r2 = one('gc-otv-lobbycard');
    if (!g2 || !r2) { var s2 = standIns(); if (!g2) g2 = s2.g; if (!r2) r2 = s2.r; }
    var hub = D.getElementById('gc-adm-hub'), at = hub && hub.parentNode ? hub : h1;
    if (!g2.isConnected || g2.parentNode !== at.parentNode) after(g2, at);
    after(r2, g2);
    if (r2.getAttribute('data-tvs-own') !== '1') dress(r2, false);
  }
  if (Date.now() - PULLED > 60000) { PULLED = Date.now();
    goalsGet().then(function(v){ if (!v) return; lsSet('gc_tv_goals_cache', v); themeApply();
      var sel = D.querySelector('#gc-otv-lobbycard [data-tvs-def]'); if (sel && D.activeElement !== sel) sel.value = okTheme(v.theme) || 'blue';
      Array.prototype.forEach.call(D.querySelectorAll('#gc-otv-goals[data-tvs-own="1"] [data-tg]'), function(i){ if (D.activeElement !== i) i.value = v[i.getAttribute('data-tg')] || ''; }); }); }
}

/* ── 5. THE LOOKS (owner 11/02: "I had different themes, a regular one, a golf one, a nature one etc"; there was no earlier
   golf / nature TV in the repo's history — these are new):
     🔵 Blue (default) — the GrayCo navy of the lobby TV: dark navy, white type, gold accents
     ⚪ White          — OFFICETV's own look
     ⛳ Golf           — a clean green golf-course look (no photos)
     🌲 National parks — 12 public-domain NPS photos (img/tv/parks, CREDITS.txt), a new one every 2 minutes, the park named
                          in a small caption; the numbers sit on dark panels so they stay readable
     📷 Office photos  — the back office TV's own album (⚙ Admin → 📺 TVs → 📷 Office photos; any admin adds / removes)
   A personal TV screen (6.) has the same list, its own album first ("📷 My photos").
   The look is a set of classes on <html> (gc-otv-dark + gc-otv-blue / -golf / -photo), so a TV opened any way is drawn in it
   from its first frame; each slide's ticker keeps its own style.
   Which one: this TV's own pick (the 🎨 menu in its control bar; localStorage gc_otv_theme, or gc_otv_theme:<screen> on a
   personal screen), else the admin's default for the back office TV (gc_kv gc_tv_goals.theme) / the screen's own look,
   else Blue. An album with no photos yet shows "Add photos in ⚙ Admin → 📺 TVs" and is drawn Blue. ── */
var THEMES = [{ k: 'blue', l: '🔵 Blue' }, { k: 'white', l: '⚪ White' }, { k: 'golf', l: '⛳ Golf' }, { k: 'parks', l: '🌲 National parks' }, { k: 'album', l: '📷 Office photos' }];
var PARKS = [['grsm-fall', 'Great Smoky Mountains National Park'], ['yell', 'Yellowstone National Park'], ['yose', 'Yosemite National Park'], ['grca', 'Grand Canyon National Park'],
  ['zion', 'Zion National Park'], ['glac', 'Glacier National Park'], ['arch', 'Arches National Park'], ['grsm-winter', 'Great Smoky Mountains National Park'],
  ['grte', 'Grand Teton National Park'], ['romo', 'Rocky Mountain National Park'], ['brca', 'Bryce Canyon National Park'], ['mora', 'Mount Rainier National Park']];
var TKEY = 'gc_otv_theme';
function okTheme(v){ return THEMES.some(function(t){ return t.k === v; }) ? v : ''; }
function tkey(){ return CUR ? TKEY + ':' + CUR.id : TKEY; }
function themeOwn(){ return okTheme(lsRaw(tkey()).replace(/"/g, '')); }
function themeDef(){ if (CUR) return okTheme(CUR.theme) || 'album'; return okTheme(cachedGoals().theme) || 'blue'; }
function theme(){ return themeOwn() || themeDef(); }
function themeLabel(k){ if (k === 'album') return CUR ? '📷 ' + (CUR.photosLabel || 'My photos') : '📷 Office photos'; var t = THEMES.filter(function(x){ return x.k === k; })[0]; return t ? t.l : k; }
/* the photos of the current album (refs in gc_kv gc_tv_screens) */
function albumRefs(){ var sc = CUR || screenById('office'); return sc ? arr(sc.photos) : []; }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
var BG = { k: '', i: -1, at: 0, hint: '' };
function themeApply(){
  var th = theme(), de = D.documentElement; if (!de) return th;
  var refs = th === 'album' ? albumRefs() : [], photo = th === 'parks' || (th === 'album' && refs.length > 0);
  var cls = { 'gc-otv-dark': th !== 'white', 'gc-otv-blue': th === 'blue' || (th === 'album' && !refs.length), 'gc-otv-golf': th === 'golf', 'gc-otv-photo': photo,
    'gc-otv-photosonly': !!(CUR && CUR.mode !== 'office'), 'gc-otv-noticker': !!(CUR && CUR.ticker === false) };
  Object.keys(cls).forEach(function(c){ if (de.classList.contains(c) !== cls[c]) de.classList.toggle(c, cls[c]); });
  css();
  var tv = D.getElementById('gc-otv'); if (!tv) { BG.k = ''; return th; }
  var img = tv.querySelector('.hd img'); if (img) { var want = th === 'white' ? '/grayco-logo-wide.jpg' : '/portal-logo.png'; if (img.getAttribute('src') !== want) img.setAttribute('src', want); }
  picker(tv, th);
  extras(tv, th, refs);
  return th;
}
/* 🎨 the look picker in the TV's control bar (before Close) */
function picker(tv, th){
  var ctl = tv.querySelector('.ctl'); if (!ctl) return;
  var b = ctl.querySelector('[data-tvs-theme]');
  if (!b) { b = D.createElement('button'); b.type = 'button'; b.setAttribute('data-tvs-theme', '1'); b.title = 'The look of this TV';
    b.addEventListener('click', function(e){ e.stopPropagation(); var m = tv.querySelector('.gc-tvs-menu'); if (m) { m.remove(); return; } menu(tv, b); });
    var x = ctl.querySelector('[data-k="x"]'); ctl.insertBefore(b, x || null); }
  var lab = '🎨 ' + themeLabel(th) + ' ▾'; if (b.textContent !== lab) b.textContent = lab;
}
function menu(tv, b){
  var m = D.createElement('div'); m.className = 'gc-tvs-menu'; m.setAttribute('role', 'menu'); var th = theme();
  m.innerHTML = THEMES.map(function(t){ return '<button type="button" role="menuitemradio" aria-checked="' + (t.k === th) + '" data-tvs-th="' + t.k + '"' + (t.k === th ? ' class="on"' : '') + '>' + esc(themeLabel(t.k)) + '</button>'; }).join('');
  m.addEventListener('click', function(e){ e.stopPropagation(); var x = e.target.closest && e.target.closest('[data-tvs-th]'); if (!x) return; lsSet(tkey(), x.getAttribute('data-tvs-th')); m.remove(); BG.k = ''; themeApply(); });
  var r = b.getBoundingClientRect(), st = tv.querySelector('.stg'), sr = st.getBoundingClientRect(), em = sr.width / 120;
  m.style.right = ((sr.right - r.right) / em) + 'em'; m.style.bottom = ((sr.bottom - r.top) / em + .6) + 'em';
  st.appendChild(m);
}
/* the photo layer (behind everything in the stage), the park caption, the "add photos" hint, a personal screen's clock */
function extras(tv, th, refs){
  var st = tv.querySelector('.stg'); if (!st) return;
  var bg = st.querySelector('.gc-tvs-bg');
  var photo = th === 'parks' || (th === 'album' && refs.length);
  if (!photo) { if (bg) bg.remove(); BG.k = ''; }
  else {
    if (!bg) { bg = D.createElement('div'); bg.className = 'gc-tvs-bg'; bg.innerHTML = '<i></i><i></i><span class="cap"></span>'; st.insertBefore(bg, st.firstChild); BG.k = ''; }
    var key = th + ':' + (th === 'album' ? refs.join(',') : ''), every = CUR && CUR.mode !== 'office' ? 30000 : 120000;
    if (BG.k !== key) { BG.k = key; BG.i = -1; BG.at = 0; }
    if (Date.now() - BG.at >= every) { BG.at = Date.now(); BG.i++; showPhoto(bg, th, refs); }
  }
  var hint = st.querySelector('.gc-tvs-hint'), needHint = th === 'album' && !refs.length;
  if (needHint && !hint) { hint = D.createElement('div'); hint.className = 'gc-tvs-hint'; hint.textContent = '📷 Add photos in ⚙ Admin → 📺 TVs'; st.appendChild(hint); }
  if (!needHint && hint) hint.remove();
  var ck = st.querySelector('.gc-tvs-clock'), want = !!(CUR && CUR.mode !== 'office');
  if (want) {
    if (!ck) { ck = D.createElement('div'); ck.className = 'gc-tvs-clock'; ck.innerHTML = '<b></b><span></span><em></em>'; st.appendChild(ck); }
    var d = new Date(), h = d.getHours(), t = ((h + 11) % 12 + 1) + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ' ' + (h < 12 ? 'AM' : 'PM');
    var dt = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (ck.firstChild.textContent !== t) ck.firstChild.textContent = t;
    if (ck.children[1].textContent !== dt) ck.children[1].textContent = dt;
    if (ck.children[2].textContent !== CUR.name) ck.children[2].textContent = CUR.name;
  } else if (ck) ck.remove();
}
function showPhoto(bg, th, refs){
  var L = bg.querySelectorAll('i'), next = L[BG.i % 2], prev = L[(BG.i + 1) % 2], cap = bg.querySelector('.cap');
  function put(url, caption){ var im = new Image(); im.onload = function(){ next.style.backgroundImage = 'url("' + url + '")'; next.classList.add('on'); prev.classList.remove('on'); cap.textContent = caption || ''; }; im.src = url; }
  if (th === 'parks') { var p = PARKS[BG.i % PARKS.length]; put('/img/tv/parks/' + p[0] + '.jpg', '📍 ' + p[1] + ' · NPS photo'); return; }
  var ref = refs[BG.i % refs.length];
  if (typeof W._gcFileUrl !== 'function') return;
  Promise.resolve(W._gcFileUrl(ref)).then(function(u){ put(u, ''); }, function(){ note('a TV photo could not be loaded'); });
}
var N = '#0B1626', LN = 'rgba(255,255,255,.12)', MU = '#A9B7CA', G = '#D4A017', G2 = '#F2C14E';
var B = 'html.gc-otv-dark #gc-otv';
var TCSS = B + '{background:#050B14;color:#fff}' +
  B + ' .stg{background:radial-gradient(ellipse 80em 60em at 85% 0%,#1C3456 0%,rgba(28,52,86,0) 60%),radial-gradient(ellipse 70em 50em at 0% 100%,#122A47 0%,rgba(18,42,71,0) 65%),' + N + '}' +
  B + ' .hd{background:rgba(5,11,20,.55);border-bottom-color:rgba(212,160,23,.35)}' + B + ' .hd .tt{border-left-color:rgba(212,160,23,.35)}' +
  B + ' .hd .tt span,' + B + ' .hd .ck span{color:' + MU + '}' + B + ' .hd .ck b small{color:' + G2 + '}' +
  B + ' .dots button{color:' + MU + '}' + B + ' .dots button i{background:rgba(255,255,255,.25)}' + B + ' .dots button.on{background:' + G + ';color:' + N + '}' + B + ' .dots button.on i{background:' + N + '}' +
  B + ' .ft .note{color:' + MU + '}' +
  B + ' .ctl button{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.22);color:#fff}' + B + ' .ctl button.on{background:' + G + ';color:' + N + ';border-color:' + G + '}' +
  B + ' .paused-b{background:' + G + ';color:' + N + '}' +
  B + ' .cd{background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.04));border-color:' + LN + ';box-shadow:0 .6em 2.4em rgba(0,0,0,.35)}' +
  B + ' .lb{color:' + G2 + '}' + B + ' .mut,' + B + ' .ring .ct span,' + B + ' .tile .sub{color:' + MU + '}' +
  B + ' .fine,' + B + ' .tg .tv small,' + B + ' .li li em,' + B + ' table.lbd td.nm small{color:#B4C2D4}' + B + ' .empty{color:#B4C2D4}' +
  B + ' .ring circle:first-child{stroke:rgba(255,255,255,.12)}' +
  B + ' .bar{background:rgba(255,255,255,.12)}' + B + ' .bar em{background:#fff}' +
  B + ' .bar i[style*="#0F1D2F"]{background:linear-gradient(90deg,#5B84B8,#A9C4E6)!important}' +
  B + ' .tg{border-top-color:' + LN + '}' + B + ' .li li{border-top-color:' + LN + '}' +
  B + ' .b-ok{background:rgba(34,197,94,.16);color:#86EFAC}' + B + ' .b-warn{background:rgba(242,193,78,.16);color:' + G2 + '}' + B + ' .b-bad{background:rgba(248,113,113,.16);color:#FCA5A5}' +
  B + ' .tg .tl b span[style*="#13753A"]{color:#86EFAC!important}' +
  B + ' .tile.s-green .sub{color:#86EFAC}' + B + ' .tile.s-amber .sub{color:' + G2 + '}' + B + ' .tile.s-red .sub{color:#FCA5A5}' +
  B + ' .tile.hero{background:linear-gradient(160deg,#1C3456,#0E1C30);border-color:rgba(212,160,23,.55)}' +
  B + ' table.lbd th{color:' + G2 + '}' +
  B + ' table.lbd td{background:rgba(255,255,255,.06);border-color:' + LN + ';color:#fff}' +
  B + ' table.lbd tr.r1 td{background:rgba(212,160,23,.18);border-color:rgba(242,193,78,.6)}' +
  B + ' table.lbd td.sc{color:' + G2 + '}' + B + ' table.lbd td .z{color:#B4C2D4}' +
  /* the leader's row is tinted: its small print and zeros a step lighter, ≥ 5 : 1 on every dark look */
  B + ' table.lbd tr.r1 td.nm small,' + B + ' table.lbd tr.r1 td .z{color:#E8EEF6}' +
  B + ' .brk{background:linear-gradient(90deg,#1C3456 0%,#13243B 100%)}' +
  /* ⛳ Golf: fairway greens, sand and flag accents */
  'html.gc-otv-golf #gc-otv{background:#06140E}' +
  'html.gc-otv-golf #gc-otv .stg{background:radial-gradient(ellipse 70em 40em at 85% 0%,rgba(233,210,122,.10),rgba(233,210,122,0) 60%),repeating-linear-gradient(100deg,rgba(255,255,255,.035) 0 7em,rgba(255,255,255,0) 7em 14em),linear-gradient(180deg,#145A3A 0%,#0C3B26 55%,#082A1B 100%)}' +
  'html.gc-otv-golf #gc-otv .hd{background:rgba(4,22,14,.55);border-bottom-color:rgba(233,210,122,.4)}html.gc-otv-golf #gc-otv .hd .tt{border-left-color:rgba(233,210,122,.4)}' +
  'html.gc-otv-golf #gc-otv .lb,html.gc-otv-golf #gc-otv table.lbd th,html.gc-otv-golf #gc-otv table.lbd td.sc,html.gc-otv-golf #gc-otv .hd .ck b small{color:#F1DD8E}' +
  'html.gc-otv-golf #gc-otv .mut,html.gc-otv-golf #gc-otv .ring .ct span,html.gc-otv-golf #gc-otv .tile .sub,html.gc-otv-golf #gc-otv .hd .tt span,html.gc-otv-golf #gc-otv .hd .ck span,html.gc-otv-golf #gc-otv .dots button,html.gc-otv-golf #gc-otv .ft .note{color:#BFDCCB}' +
  'html.gc-otv-golf #gc-otv .fine,html.gc-otv-golf #gc-otv .tg .tv small,html.gc-otv-golf #gc-otv .li li em,html.gc-otv-golf #gc-otv table.lbd td.nm small,html.gc-otv-golf #gc-otv .empty,html.gc-otv-golf #gc-otv table.lbd td .z{color:#BCD9C8}html.gc-otv-golf #gc-otv table.lbd tr.r1 td.nm small,html.gc-otv-golf #gc-otv table.lbd tr.r1 td .z{color:#F3F6F1}' +
  'html.gc-otv-golf #gc-otv .cd{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.045));border-color:rgba(255,255,255,.14)}' +
  'html.gc-otv-golf #gc-otv .dots button.on,html.gc-otv-golf #gc-otv .ctl button.on,html.gc-otv-golf #gc-otv .paused-b{background:#F1DD8E;color:#0C3B26;border-color:#F1DD8E}html.gc-otv-golf #gc-otv .dots button.on i{background:#C8102E}' +
  'html.gc-otv-golf #gc-otv .bar i{background:linear-gradient(90deg,#E9D27A,#F6E7A8)}html.gc-otv-golf #gc-otv table.lbd tr.r1 td{background:rgba(241,221,142,.16);border-color:rgba(241,221,142,.55)}' +
  'html.gc-otv-golf #gc-otv .tile.hero{background:linear-gradient(160deg,#1C6B47,#0C3B26);border-color:rgba(241,221,142,.55)}html.gc-otv-golf #gc-otv .tile.hero .lb{color:#F1DD8E}' +
  /* 🌲 / 📷 photo looks: the photo behind, the numbers on dark panels */
  'html.gc-otv-photo #gc-otv .stg{background:#04080F}' +
  '#gc-otv .gc-tvs-bg{position:absolute;inset:0;z-index:-1;overflow:hidden}#gc-otv .gc-tvs-bg i{position:absolute;inset:0;background:#04080F center/cover no-repeat;opacity:0;transition:opacity 2s ease}#gc-otv .gc-tvs-bg i.on{opacity:1}' +
  '#gc-otv .gc-tvs-bg:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,8,15,.55) 0%,rgba(4,8,15,.30) 35%,rgba(4,8,15,.45) 70%,rgba(4,8,15,.80) 100%)}' +
  '#gc-otv .gc-tvs-bg .cap{position:absolute;right:3.6em;top:8.9em;z-index:1;font-size:1.05em;font-weight:600;color:rgba(255,255,255,.85);text-shadow:0 .1em .4em rgba(0,0,0,.8)}' +
  'html.gc-otv-photo #gc-otv .hd{background:rgba(4,8,15,.62)}' +
  'html.gc-otv-photo #gc-otv .cd{background:rgba(6,12,22,.74);border-color:rgba(255,255,255,.14)}' +
  'html.gc-otv-photo #gc-otv table.lbd td{background:rgba(6,12,22,.76)}html.gc-otv-photo #gc-otv table.lbd tr.r1 td{background:rgba(70,52,8,.82)}' +
  'html.gc-otv-photo #gc-otv .ft{background:linear-gradient(180deg,rgba(4,8,15,0),rgba(4,8,15,.55))}' +
  '#gc-otv .gc-tvs-hint{position:absolute;right:3.6em;top:8.9em;font-size:1.2em;font-weight:700;color:' + G2 + '}' +
  /* a personal screen, photos + clock: the photos, the time and date, the screen's name; the ticker if it is on */
  'html.gc-otv-photosonly #gc-otv .bd,html.gc-otv-photosonly #gc-otv .dots,html.gc-otv-photosonly #gc-otv .hd,html.gc-otv-photosonly #gc-otv .pg{display:none}' +
  'html.gc-otv-photosonly #gc-otv .gc-tvs-bg:after{background:linear-gradient(180deg,rgba(4,8,15,.25) 0%,rgba(4,8,15,0) 30%,rgba(4,8,15,.15) 60%,rgba(4,8,15,.70) 100%)}html.gc-otv-photosonly #gc-otv .gc-tvs-bg .cap{top:2.4em}' +
  '#gc-otv .gc-tvs-clock{position:absolute;left:3.6em;bottom:11em;color:#fff;text-shadow:0 .08em .5em rgba(0,0,0,.65)}#gc-otv .gc-tvs-clock b{display:block;font-size:10em;font-weight:800;letter-spacing:-.03em;line-height:1}' +
  '#gc-otv .gc-tvs-clock span{display:block;font-size:2.6em;font-weight:600;margin-top:.2em}#gc-otv .gc-tvs-clock em{display:block;font-style:normal;font-size:1.5em;font-weight:700;color:' + G2 + ';margin-top:.5em;letter-spacing:.06em}' +
  'html.gc-otv-noticker #gc-otv .tk{display:none}' +
  '#gc-otv .gc-tvs-menu{position:absolute;z-index:6;display:flex;flex-direction:column;gap:.3em;padding:.6em;border-radius:1em;background:#fff;box-shadow:0 1em 3em rgba(0,0,0,.35);font-size:1.15em}' +
  '#gc-otv .gc-tvs-menu button{all:unset;cursor:pointer;padding:.55em 1.1em;border-radius:.6em;font-weight:700;color:#0F1D2F;white-space:nowrap}#gc-otv .gc-tvs-menu button:hover,#gc-otv .gc-tvs-menu button.on{background:#FFF1C9}';

/* ── 6. PERSONAL TV SCREENS (owner 11/02: "so we can each have our own office TV screen if we want with our families etc").
   ⚙ Admin → 📺 TVs → ＋ New TV screen: a name ("Wesley's office"); it belongs to whoever made it. Its own link
   (crm.grayco-cs.com/#tv=<id>: open it on that TV, signed in as that person), Open / Copy link, and its own settings:
   📷 its photo album (＋ Add photos, ✕, ↑ ↓), its look (the list above, its album first), what it shows (📷 photos + clock
   and date — the default — or the back office slides), the ticker on / off. Delete asks first and takes its album with it.
   Privacy: only the person who made a screen sees it, opens it or edits it (the company owners — payType owner — may also
   delete one, nothing more); its photos are never on the front room TV or on anyone else's screen. The back office TV's
   📷 Office photos album (screen id "office") is shared by the admins.
   Storage: gc_kv "gc_tv_screens" { screens: [{ id, name, owner, ownerName, at, theme, mode: 'photos'|'office', ticker,
   photos: [ref] }] }. The photos go through the CRM's one upload pipeline (window._gcStoreFile → the private crm-files
   bucket, shrunk to 1600 px JPEG, no camera data); the TV loads them with window._gcFileUrl. ── */
var SCR = { v: lsGetJ('gc_tv_screens_cache') || { screens: [] }, at: 0 }, CUR = null;
function lsGetJ(k){ try { return JSON.parse(lsRaw(k) || 'null'); } catch (e) { return null; } }
function myEmail(){ try { return s(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()).toLowerCase(); } catch (e) { return ''; } }
function coOwner(){ try { var u = W.meUser && W.meUser(); return !!(u && /^owner$/i.test(s(u.payType))); } catch (e) { return false; } }
function screens(){ return arr(obj(SCR.v).screens).filter(function(x){ return x && x.id; }); }
function screenById(id){ return screens().filter(function(x){ return x.id === id; })[0] || null; }
function mine(sc){ return !!sc && sc.id !== 'office' && !!myEmail() && s(sc.owner).toLowerCase() === myEmail(); }
function kvGetK(key){ var c = creds(); return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: sbH(), cache: 'no-store' })
  .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); }).then(function(rows){ return rows && rows[0] ? obj(rows[0].value) : {}; }); }
function kvPutK(key, v){ var c = creds(); return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
  body: JSON.stringify({ key: key, value: v, updated_at: new Date().toISOString() }) }).then(function(r){ return r.ok; }, function(){ return false; }); }
function pullScreens(force){
  if (!force && Date.now() - SCR.at < 120000) return Promise.resolve(SCR.v);
  SCR.at = Date.now();
  return kvGetK('gc_tv_screens').then(function(v){ SCR.v = { screens: arr(v.screens) }; lsSet('gc_tv_screens_cache', SCR.v); if (CUR) CUR = screenById(CUR.id) || CUR; return SCR.v; }, function(){ return SCR.v; });
}
/* read → change → write, so two admins never wipe each other's screens */
function editScreens(fn, okMsg){
  return kvGetK('gc_tv_screens').then(function(v){ var L = arr(v.screens); var r = fn(L); if (r === false) return false;
    var nv = { screens: L, at: new Date().toISOString(), by: me() };
    return kvPutK('gc_tv_screens', nv).then(function(ok){ if (ok) { SCR.v = nv; SCR.at = Date.now(); lsSet('gc_tv_screens_cache', nv); if (CUR) CUR = screenById(CUR.id); BG.k = ''; if (okMsg) toast(okMsg); } else toast('Could not save — try again.', true); return ok; });
  }, function(){ toast('Could not reach the cloud — try again.', true); return false; });
}
function newId(){ return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function screenLink(id){ return location.origin + location.pathname.replace(/index\.html$/, '') + '#tv=' + id; }
/* open a screen on this computer (its owner only) */
function openScreen(id, kiosk){
  var sc = screenById(id);
  if (!sc) { toast('That TV screen is not there any more.', true); return null; }
  if (sc.id !== 'office' && !mine(sc)) { toast('That TV screen is someone else\'s.', true); return null; }
  var o = OTV(); if (!o) { toast('📺 The TV is not loaded on this computer — reload the page.', true); return null; }
  CUR = sc.id === 'office' ? null : sc; BG.k = ''; themeApply();
  var el = o.open({ kiosk: !!kiosk }); themeApply(); return el;
}
/* the #tv=<screen> link: straight into that screen after sign-in, and back after a reload */
var WANTSCR = '';
function wantFromHash(){ var m = /^#\/?tv=([A-Za-z0-9_-]{4,40})$/.exec(location.hash || ''); if (m) { WANTSCR = m[1]; try { sessionStorage.setItem('gc_tv_screen', WANTSCR); } catch (e) {} } }
wantFromHash(); try { if (!WANTSCR) WANTSCR = sessionStorage.getItem('gc_tv_screen') || ''; } catch (e) {}
W.addEventListener('hashchange', wantFromHash);
function wantTick(){
  if (!WANTSCR || D.getElementById('gc-otv')) return;
  if (!myEmail() || D.getElementById('gc-auth-email') || !OTV()) return;
  if (!role() && !isAdmin()) return;
  pullScreens(true).then(function(){
    if (!WANTSCR || D.getElementById('gc-otv')) return;
    var id = WANTSCR; WANTSCR = '';
    try { if (!new RegExp('#tv=' + id + '$').test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search + '#tv=' + id); } catch (e) {}
    openScreen(id, true);
  });
}
/* a personal screen closed: back to the back office TV's look; the link comes off the address */
function curTick(){
  if (CUR && !D.getElementById('gc-otv')) { CUR = null; BG.k = ''; try { sessionStorage.removeItem('gc_tv_screen'); if (/^#\/?tv=/.test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {} themeApply(); }
}

/* ── ⚙ Admin: the screen editor (📷 Office photos is the same editor for the shared album) ── */
var ECSS = '#gc-tvs-ed{position:fixed;inset:0;z-index:2147482500;background:rgba(15,29,47,.55);display:flex;align-items:center;justify-content:center;font:14px/1.4 Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#0F1D2F}' +
  '#gc-tvs-ed .win{background:#fff;border-radius:16px;width:min(860px,calc(100vw - 32px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
  '#gc-tvs-ed .top{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#0F1D2F;color:#fff}#gc-tvs-ed .top b{font-size:17px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#gc-tvs-ed .x{all:unset;cursor:pointer;font-size:20px;padding:2px 8px}#gc-tvs-ed .body{padding:14px 18px;overflow:auto}' +
  '#gc-tvs-ed .f{margin:0 0 14px}#gc-tvs-ed .f>label{display:block;font-weight:800;margin-bottom:5px}#gc-tvs-ed .mut{color:#64748b;font-size:12.5px}' +
  '#gc-tvs-ed input[type=text],#gc-tvs-ed select{padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;min-width:0}#gc-tvs-ed .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
  '#gc-tvs-ed button.b{padding:8px 14px;border-radius:8px;border:none;background:#e2e8f0;color:#0f172a;font:inherit;font-weight:800;cursor:pointer;min-height:38px}#gc-tvs-ed button.b.g{background:#D4A017;color:#0F1D2F}#gc-tvs-ed button.b.n{background:#0F1D2F;color:#fff}#gc-tvs-ed button.b.r{background:#fee2e2;color:#b91c1c}' +
  '#gc-tvs-ed .ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:8px}#gc-tvs-ed .ph .t{position:relative;border-radius:10px;overflow:hidden;background:#0F1D2F;aspect-ratio:16/10}' +
  '#gc-tvs-ed .ph .t img{width:100%;height:100%;object-fit:cover;display:block}#gc-tvs-ed .ph .t .k{position:absolute;left:6px;right:6px;bottom:6px;display:flex;gap:4px;justify-content:flex-end}' +
  '#gc-tvs-ed .ph .t .k button{all:unset;cursor:pointer;background:rgba(15,29,47,.8);color:#fff;border-radius:6px;padding:3px 8px;font-weight:800}#gc-tvs-ed .ph .t .n{position:absolute;left:6px;top:6px;background:rgba(15,29,47,.8);color:#fff;border-radius:6px;padding:1px 7px;font-size:12px;font-weight:800}' +
  '#gc-tvs-ed .busy{color:#A07A0C;font-weight:700}';
function edit(id){
  var sc = screenById(id), office = id === 'office';
  if (!office && !mine(sc) && !(sc && coOwner())) { toast('That TV screen is someone else\'s.', true); return; }
  if (office && !isAdmin()) { toast('Only an admin edits the office photos.', true); return; }
  var onlyDelete = !office && !mine(sc);
  if (!D.getElementById('gc-tvs-edcss')) { var st = D.createElement('style'); st.id = 'gc-tvs-edcss'; st.textContent = ECSS; D.head.appendChild(st); }
  var old = D.getElementById('gc-tvs-ed'); if (old) old.remove();
  var el = D.createElement('div'); el.id = 'gc-tvs-ed'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', office ? 'Office photos' : 'TV screen');
  D.body.appendChild(el);
  var busy = '';
  function draw(){
    sc = screenById(id) || (office ? { id: 'office', photos: [] } : null);
    if (!sc) { el.remove(); return; }
    var P = arr(sc.photos);
    var head = office ? '📷 Office photos — the back office TV\'s 📷 look' : '🏠 ' + esc(sc.name);
    var h = '';
    if (onlyDelete) h += '<div class="f"><div class="mut">' + esc(sc.ownerName || sc.owner) + '\'s screen. Its photos are private; as a company owner you can only delete it.</div></div>';
    else {
      if (!office) {
        h += '<div class="f"><label>Name</label><div class="row"><input type="text" data-e="name" maxlength="60" style="flex:1" value="' + esc(sc.name) + '"><button type="button" class="b" data-e="rename">Rename</button></div></div>' +
          '<div class="f"><label>Its link — open it on that TV, signed in as you</label><div class="row"><input type="text" readonly data-e="link" style="flex:1" value="' + esc(screenLink(sc.id)) + '"><button type="button" class="b n" data-e="open">📺 Open</button><button type="button" class="b" data-e="copy">Copy link</button></div></div>' +
          '<div class="f"><label>Shows</label><div class="row"><select data-e="mode"><option value="photos"' + (sc.mode !== 'office' ? ' selected' : '') + '>📷 Photos + clock and date</option><option value="office"' + (sc.mode === 'office' ? ' selected' : '') + '>📊 Back office slides (goals, PM leaderboard, …)</option></select>' +
          '<label class="row" style="gap:6px;font-weight:600"><input type="checkbox" data-e="ticker"' + (sc.ticker !== false ? ' checked' : '') + '> the ticker at the bottom (new leads, signed contracts, finished jobs)</label></div></div>' +
          '<div class="f"><label>Look</label><select data-e="theme">' + THEMES.map(function(t){ return '<option value="' + t.k + '"' + ((okTheme(sc.theme) || 'album') === t.k ? ' selected' : '') + '>' + (t.k === 'album' ? '📷 My photos (this screen\'s album)' : esc(t.l)) + '</option>'; }).join('') + '</select></div>';
      }
      h += '<div class="f"><label>📷 Photos <span class="mut">(' + P.length + ')</span></label><div class="row"><button type="button" class="b g" data-e="add">＋ Add photos</button><input type="file" accept="image/*" multiple data-e="file" hidden>' +
        '<span class="mut">' + (office ? 'Shown behind the numbers on the back office TV when its look is 📷 Office photos.' : 'Personal and family photos — only on this screen.') + ' Shrunk to 1600 px when added.</span><span class="busy">' + esc(busy) + '</span></div>' +
        '<div class="ph">' + P.map(function(r, i){ return '<div class="t" data-i="' + i + '"><img alt="" data-ref="' + esc(r) + '"><span class="n">' + (i + 1) + '</span><span class="k">' + (i ? '<button type="button" data-e="up" title="Earlier">↑</button>' : '') + (i < P.length - 1 ? '<button type="button" data-e="dn" title="Later">↓</button>' : '') + '<button type="button" data-e="rm" title="Remove">✕</button></span></div>'; }).join('') + '</div></div>';
    }
    if (!office) h += '<div class="f" style="margin-top:18px"><button type="button" class="b r" data-e="del">🗑 Delete this screen</button> <span class="mut">and its photo album</span></div>';
    el.innerHTML = '<div class="win"><div class="top"><b>' + head + '</b><button type="button" class="x" data-e="x" aria-label="Close">✕</button></div><div class="body">' + h + '</div></div>';
    Array.prototype.forEach.call(el.querySelectorAll('img[data-ref]'), function(im){ var r = im.getAttribute('data-ref'); if (typeof W._gcFileUrl === 'function') Promise.resolve(W._gcFileUrl(r)).then(function(u){ im.src = u; }, function(){ im.alt = 'not reachable'; }); });
  }
  function upd(fn, msg){ return editScreens(function(L){ var x = L.filter(function(y){ return y && y.id === id; })[0]; if (!x && id === 'office') { x = { id: 'office', name: 'Office photos', photos: [] }; L.push(x); } if (!x) return false; return fn(x, L); }, msg).then(function(){ draw(); }); }
  el.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-e]'); if (!b) { if (e.target === el) el.remove(); return; }
    var a = b.getAttribute('data-e'), t = b.closest('[data-i]'), i = t ? +t.getAttribute('data-i') : -1;
    if (a === 'x') return el.remove();
    if (a === 'open') { el.remove(); return openScreen(id); }
    if (a === 'copy') { var lk = screenLink(id); try { W.navigator.clipboard.writeText(lk).then(function(){ toast('🔗 Link copied'); }, function(){ toast(lk); }); } catch (x) { toast(lk); } return; }
    if (a === 'rename') { var nm = s(el.querySelector('[data-e="name"]').value).slice(0, 60); if (!nm) return toast('Give the screen a name.', true); return upd(function(x){ x.name = nm; }, '✓ Renamed'); }
    if (a === 'add') return el.querySelector('[data-e="file"]').click();
    if (a === 'rm') { if (!W.confirm('Take this photo off the screen?')) return; return upd(function(x){ x.photos = arr(x.photos); x.photos.splice(i, 1); }); }
    if (a === 'up' || a === 'dn') return upd(function(x){ var p = arr(x.photos), j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= p.length) return false; var tmp = p[i]; p[i] = p[j]; p[j] = tmp; x.photos = p; });
    if (a === 'del') { if (!W.confirm('Delete the TV screen "' + (sc.name || '') + '" and its photo album? Its link stops working.')) return;
      return editScreens(function(L){ var k = L.findIndex(function(y){ return y && y.id === id; }); if (k < 0) return false; L.splice(k, 1); }, '🗑 Screen deleted').then(function(){ el.remove(); try { localStorage.removeItem(TKEY + ':' + id); } catch (x) {} }); }
  });
  el.addEventListener('change', function(e){
    var a = e.target.getAttribute && e.target.getAttribute('data-e');
    if (a === 'mode') return upd(function(x){ x.mode = e.target.value === 'office' ? 'office' : 'photos'; }, '✓ Saved');
    if (a === 'ticker') return upd(function(x){ x.ticker = !!e.target.checked; }, '✓ Saved');
    if (a === 'theme') return upd(function(x){ x.theme = okTheme(e.target.value) || 'album'; }, '✓ Saved');
    if (a === 'file') {
      var files = Array.prototype.slice.call(e.target.files || []).filter(function(f){ return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name); });
      if (!files.length) return; if (typeof W._gcStoreFile !== 'function') return toast('File storage is not ready on this computer.', true);
      var refs = [], n = 0; busy = 'Adding 1 of ' + files.length + '…'; draw();
      files.reduce(function(pr, f){ return pr.then(function(){ busy = 'Adding ' + (++n) + ' of ' + files.length + '…'; var bz = el.querySelector('.busy'); if (bz) bz.textContent = busy;
        return Promise.resolve(W._gcStoreFile(f, { kind: 'photo', name: f.name })).then(function(m){ if (m && m.ref) refs.push(m.ref); }, function(err){ warn(err); }); }); }, Promise.resolve())
        .then(function(){ busy = ''; if (!refs.length) { draw(); return toast('Those photos could not be added.', true); }
          return upd(function(x){ x.photos = arr(x.photos).concat(refs.filter(function(r){ return arr(x.photos).indexOf(r) < 0; })); }, '📷 ' + refs.length + ' photo' + (refs.length === 1 ? '' : 's') + ' added'); });
    }
  });
  draw();
  pullScreens(true).then(draw);
}
function newScreen(){
  if (!isAdmin()) return toast('Only an admin makes TV screens.', true);
  var u = null; try { u = W.meUser && W.meUser(); } catch (e) {}
  var first = s(u && u.name).split(/\s+/)[0];
  var nm = W.prompt('A name for your TV screen:', first ? first + '\'s office' : 'My office'); nm = s(nm).slice(0, 60); if (!nm) return;
  var sc = { id: newId(), name: nm, owner: myEmail(), ownerName: s(u && u.name) || myEmail(), at: new Date().toISOString(), theme: 'album', mode: 'photos', ticker: true, photos: [] };
  editScreens(function(L){ L.push(sc); }, '📺 "' + nm + '" made — add its photos').then(function(ok){ if (ok) { paintScreens(true); edit(sc.id); } });
}
/* the TVs row: + 📷 Office photos, each of my screens (company owners: everyone's, to delete), ＋ New TV screen */
function paintScreens(force){
  var row = D.querySelector('#gc-otv-lobbycard.gc-tvs'); if (!row) return;
  var bt = row.querySelector('.bt'); if (!bt) return;
  var L = screens().filter(function(x){ return x.id !== 'office' && (mine(x) || coOwner()); });
  var sig = L.map(function(x){ return x.id + ':' + x.name + ':' + (mine(x) ? 1 : 0); }).join('|') + '|' + isAdmin();
  if (!force && bt.getAttribute('data-tvs-sig') === sig) return;
  bt.setAttribute('data-tvs-sig', sig);
  Array.prototype.forEach.call(bt.querySelectorAll('[data-tvs-scr]'), function(x){ x.remove(); });
  if (!isAdmin()) return;
  function btn(id, label, title){ var b = D.createElement('button'); b.type = 'button'; b.setAttribute('data-tvs-scr', id); b.textContent = label; if (title) b.title = title; b.style.background = '#e2e8f0'; b.style.color = '#0f172a'; return b; }
  var frag = D.createDocumentFragment();
  frag.appendChild(btn('office', '📷 Office photos', 'The back office TV\'s photo album'));
  L.forEach(function(x){ frag.appendChild(btn(x.id, '🏠 ' + x.name, mine(x) ? 'Your TV screen: its link, photos and look' : (x.ownerName || x.owner) + '\'s screen (private)')); });
  frag.appendChild(btn('new', '＋ New TV screen', 'Your own TV screen, with your own photos'));
  var sel = bt.querySelector('[data-tvs-def]'); bt.insertBefore(frag, sel || null);
  if (!row.__tvsScr) { row.__tvsScr = 1; row.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-tvs-scr]'); if (!b) return; e.stopPropagation(); var id = b.getAttribute('data-tvs-scr'); if (id === 'new') newScreen(); else edit(id); }); }
}

/* ── 3. 🧭 GrayCo Systems → The office: the two tiles are in its TILES() list (patch_TVFIX.py) and come here ── */

/* ── the loop: cheap checks only ── */
var TICKS = 0, TERR = '';
function tick(){
  TICKS++;
  try { hookA8(); } catch (e) {}
  try { paint(); } catch (e) { TERR = s(e && e.message); warn(e); }
  try { guardOld(); } catch (e) {}
  try { curTick(); wantTick(); } catch (e) { warn(e); }
  try { if (D.getElementById('gc-otv') || TICKS % 10 === 1) themeApply(); } catch (e) {}
  try { if (D.querySelector('#gc-otv-lobbycard.gc-tvs')) { paintScreens(); if (TICKS % 60 === 2) pullScreens(); } } catch (e) { warn(e); }
}
/* the browser's own interval (patch SYNCPERF's, captured before any governor): the governed ones run every 30 s once nobody
   has touched the computer for a minute, and Admin opened from code or a remote click would wait that long for its bar.
   The tick is a handful of getElementById / querySelector calls. Any click or view change also paints at once. */
var RAW = W.__GC_REAL_SETINTERVAL__ || RI;
hookA8(); try { themeApply(); } catch (e) {} RAW.call(W, tick, 1000); later(function(){ pullScreens(true); }, 4000); later(tick, 300);
W.addEventListener('hashchange', function(){ later(tick, 400); });
/* Admin redrawn (X10's card box arriving late, React re-drawing the page): the rows are put back in their places at once */
var MOQ = 0;
try { new W.MutationObserver(function(){ if (MOQ) return; MOQ = later(function(){ MOQ = 0; try { if (adminH1()) paint(); } catch (e) {} }, 60); })
  .observe(D.body || D.documentElement, { childList: true, subtree: true }); } catch (e) {}
D.addEventListener('click', function(e){
  /* OFFICETV's 🏁 Team goals Save writes the row without the look: save it here, merged */
  var b = e.target && e.target.closest ? e.target.closest('#gc-otv-goals [data-otv="tg"]') : null;
  if (b) { e.stopPropagation(); e.preventDefault(); var p = {}; Array.prototype.forEach.call(D.querySelectorAll('#gc-otv-goals [data-tg]'), function(i){ var n = Math.max(0, Math.round(num(i.value))); p[i.getAttribute('data-tg')] = n || null; }); saveTv(p, '🏁 Team goals saved', b); }
  /* a click anywhere else closes the 🎨 look menu */
  var mn = D.querySelector('#gc-otv .gc-tvs-menu'); if (mn && !(e.target.closest && e.target.closest('.gc-tvs-menu,[data-tvs-theme]'))) mn.remove();
  later(tick, 350); later(tick, 1200); }, true);
W._gcTVFIX = { office: office, lobby: lobby, paint: paint, canTV: canTV, canLobby: canLobby, theme: theme, themeApply: themeApply,
  setTheme: function(v){ if (okTheme(v)) lsSet(tkey(), v); else { try { localStorage.removeItem(tkey()); } catch (e) {} } BG.k = ''; return themeApply(); },
  screens: { list: screens, pull: pullScreens, open: openScreen, edit: edit, make: newScreen, link: screenLink, current: function(){ return CUR; } },
  state: function(){ return { otv: !!OTV(), lobby: !!LOBA(), load: LOADERR || loadState(), a8: !!(W._gcA8 && W._gcA8.tv && W._gcA8.tv.__tvfix), classicShown: VIA_CLASSIC, bar: !!D.querySelector('#gc-otv-lobbycard.gc-tvs'), own: !!D.querySelector('[data-tvs-own="1"]'), theme: theme(), screen: CUR ? CUR.id : '', notes: Object.keys(NOTED), ticks: TICKS, err: TERR }; } };
try { console.log('[GC] TVFIX: every Office TV entry → the new TV; ⚙ Admin 📺 TVs bar (back office TV · lobby editor · team goals) — _gcTVFIX.state()'); } catch (e) {}
})();
