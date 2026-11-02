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
  '#gc-tvs-admin .gcx10-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;background:#fff;border:1px solid #e2e8f0;border-left:3px solid #D4A017;border-radius:10px;padding:8px 12px;margin:8px 0;color:#0f172a;font:13px Inter,Arial,sans-serif}' +
  '#gc-tvs-admin .gcx10-bar button{padding:8px 14px;border-radius:8px;border:none;background:#e2e8f0;color:#0f172a;font-weight:800;cursor:pointer;min-height:38px}#gc-tvs-admin input{width:64px}' +
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
  var th = cachedGoals().theme === 'white' ? 'white' : 'blue', adm = isAdmin(), A = own ? 'data-tvs' : 'data-otv';
  return '<span><b>📺 TVs</b> · back office and front room screens</span><span class="bt">' +
    '<button type="button" ' + A + '="' + (own ? 'office' : 'tv') + '" data-tvs-b="office">📺 Back office TV</button>' +
    '<button type="button" ' + A + '="lobby" data-tvs-b="lobby">🖥 Front room (lobby) TV</button>' +
    '<select data-tvs-def title="The look every back office TV starts in (a TV switched with its own 🔵 / ⚪ button keeps its choice)"' + (adm ? '' : ' disabled') + '>' +
    '<option value="blue"' + (th === 'blue' ? ' selected' : '') + '>TV look: 🔵 Blue</option><option value="white"' + (th === 'white' ? ' selected' : '') + '>TV look: ⚪ White</option></select></span>';
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
  saveTv({ theme: sel.value === 'white' ? 'white' : 'blue' }, '🎨 Every back office TV now starts ' + (sel.value === 'white' ? '⚪ White' : '🔵 Blue'));
}
function dress(row, own){
  if (row.getAttribute('data-tvs-row') === (own ? 'own' : 'otv')) return;
  css(); row.classList.add('gc-tvs'); row.setAttribute('data-tvs-row', own ? 'own' : 'otv'); row.style.borderLeftColor = '#D4A017';
  row.innerHTML = rowHtml(own);
  if (!row.__tvsDef) { row.__tvsDef = 1; row.addEventListener('change', onDef); }
}
var PULLED = 0, SEEN_AT = 0;
function paint(){
  var h1 = adminH1();
  if (!h1 || !canTV()) { SEEN_AT = 0; var f = D.getElementById('gc-tvs-admin'); if (f && !h1) f.remove(); return; }
  if (!SEEN_AT) SEEN_AT = Date.now();
  /* patch AUTO8's old "📺 Office TV scoreboard" part, if an older AUTO8 bar is still drawn */
  var a8 = D.getElementById('gc-a8-admin');
  if (a8) { var ob = a8.querySelector('[data-a8adm="tv"]'); if (ob) { var sp = ob.previousElementSibling; if (sp && /Office TV/.test(sp.textContent || '')) sp.remove(); ob.remove(); } }
  var o = OTV(); if (o && o._adm) { try { o._adm(); } catch (e) {} }   /* OFFICETV's cards now, not on its slowed timer */
  var row = D.getElementById('gc-otv-lobbycard'), own = D.getElementById('gc-tvs-admin');
  if (row && !(own && own.contains(row))) { dress(row, false); if (own) own.remove(); }
  else if (!row || (own && own.contains(row))) {
    /* no OFFICETV row (not loaded, or no card box after 3 s): ours, after the 🎯 Company goal box / the settings hub / the heading */
    if (!own) {
      if (o && D.getElementById('gc-x10-admin') && Date.now() - SEEN_AT < 3000) return;
      css(); own = D.createElement('div'); own.id = 'gc-tvs-admin'; own.setAttribute('data-gc-keep', '1');
      own.innerHTML = '<div class="gcx10-bar" id="gc-otv-lobbycard"></div>' + (D.getElementById('gc-otv-goals') ? '' : '<div class="gcx10-bar" id="gc-otv-goals">' + goalsHtml() + '</div>');
      own.addEventListener('click', onOwn); dress(own.firstChild, true);
      var x10 = D.getElementById('gc-x10-admin'), hub = D.getElementById('gc-adm-hub'), at = x10 && x10.parentNode ? x10 : hub && hub.parentNode ? hub : h1;
      at.parentNode.insertBefore(own, at.nextSibling);
    }
  }
  if (Date.now() - PULLED > 60000) { PULLED = Date.now();
    goalsGet().then(function(v){ if (!v) return; lsSet('gc_tv_goals_cache', v); themeApply();
      var sel = D.querySelector('#gc-otv-lobbycard [data-tvs-def]'); if (sel && D.activeElement !== sel) sel.value = v.theme === 'white' ? 'white' : 'blue';
      Array.prototype.forEach.call(D.querySelectorAll('#gc-tvs-admin [data-tg]'), function(i){ if (D.activeElement !== i) i.value = v[i.getAttribute('data-tg')] || ''; }); }); }
}

/* ── 5. 🔵 Blue / ⚪ White — the back office TV's look (owner 11/02: "This is white too. I had a cool blue one, keep blue and
   a white one"). Blue (the default): the GrayCo navy of the lobby TV — dark navy, white type, gold accents. White: OFFICETV's
   own look. The look is a class on <html> (html.gc-otv-blue), so a TV opened any way is drawn in it from its first frame;
   each slide's ticker keeps its own style in both. Which one: this TV's own switch (localStorage gc_otv_theme), else the
   admin's default for every TV (gc_kv gc_tv_goals.theme), else Blue. ── */
var TKEY = 'gc_otv_theme';
function themeOwn(){ var v = lsRaw(TKEY).replace(/"/g, ''); return v === 'white' || v === 'blue' ? v : ''; }
function theme(){ return themeOwn() || (cachedGoals().theme === 'white' ? 'white' : 'blue'); }
function themeApply(){
  var th = theme(), de = D.documentElement; if (!de) return th;
  var blue = th === 'blue'; if (de.classList.contains('gc-otv-blue') !== blue) de.classList.toggle('gc-otv-blue', blue);
  css();
  var tv = D.getElementById('gc-otv'); if (!tv) return th;
  var img = tv.querySelector('.hd img'); if (img) { var want = blue ? '/portal-logo.png' : '/grayco-logo-wide.jpg'; if (img.getAttribute('src') !== want) img.setAttribute('src', want); }
  var ctl = tv.querySelector('.ctl');
  if (ctl) {
    var b = ctl.querySelector('[data-tvs-theme]');
    if (!b) { b = D.createElement('button'); b.type = 'button'; b.setAttribute('data-tvs-theme', '1'); b.title = 'The look of this TV: 🔵 Blue / ⚪ White';
      b.addEventListener('click', function(e){ e.stopPropagation(); lsSet(TKEY, theme() === 'blue' ? 'white' : 'blue'); themeApply(); });
      var x = ctl.querySelector('[data-k="x"]'); ctl.insertBefore(b, x || null); }
    var lab = blue ? '🔵 Blue' : '⚪ White'; if (b.textContent !== lab) b.textContent = lab;
  }
  return th;
}
var N = '#0B1626', N2 = '#13243B', LN = 'rgba(255,255,255,.12)', MU = '#A9B7CA', G = '#D4A017', G2 = '#F2C14E';
var B = 'html.gc-otv-blue #gc-otv';
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
  B + ' .fine,' + B + ' .tg .tv small,' + B + ' .li li em,' + B + ' table.lbd td.nm small{color:#8FA0B8}' + B + ' .empty{color:#8FA0B8}' +
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
  B + ' table.lbd td.sc{color:' + G2 + '}' + B + ' table.lbd td .z{color:#8394AD}' +
  B + ' .brk{background:linear-gradient(90deg,#1C3456 0%,#13243B 100%)}';

/* ── 3. 🧭 GrayCo Systems → The office: the two tiles are in its TILES() list (patch_TVFIX.py) and come here ── */

/* ── the loop: cheap checks only ── */
var TICKS = 0, TERR = '';
function tick(){
  TICKS++;
  try { hookA8(); } catch (e) {}
  try { paint(); } catch (e) { TERR = s(e && e.message); warn(e); }
  try { guardOld(); } catch (e) {}
  try { if (D.getElementById('gc-otv') || TICKS % 10 === 1) themeApply(); } catch (e) {}
}
/* the browser's own interval (patch SYNCPERF's, captured before any governor): the governed ones run every 30 s once nobody
   has touched the computer for a minute, and Admin opened from code or a remote click would wait that long for its bar.
   The tick is a handful of getElementById / querySelector calls. Any click or view change also paints at once. */
var RAW = W.__GC_REAL_SETINTERVAL__ || RI;
hookA8(); try { themeApply(); } catch (e) {} RAW.call(W, tick, 1000); later(tick, 300);
W.addEventListener('hashchange', function(){ later(tick, 400); });
D.addEventListener('click', function(e){
  /* OFFICETV's 🏁 Team goals Save writes the row without the look: save it here, merged */
  var b = e.target && e.target.closest ? e.target.closest('#gc-otv-goals [data-otv="tg"]') : null;
  if (b) { e.stopPropagation(); e.preventDefault(); var p = {}; Array.prototype.forEach.call(D.querySelectorAll('#gc-otv-goals [data-tg]'), function(i){ var n = Math.max(0, Math.round(num(i.value))); p[i.getAttribute('data-tg')] = n || null; }); saveTv(p, '🏁 Team goals saved', b); }
  later(tick, 350); later(tick, 1200); }, true);
W._gcTVFIX = { office: office, lobby: lobby, paint: paint, canTV: canTV, canLobby: canLobby, theme: theme, themeApply: themeApply,
  setTheme: function(v){ lsSet(TKEY, v === 'white' ? 'white' : v === 'blue' ? 'blue' : null); if (v !== 'white' && v !== 'blue') { try { localStorage.removeItem(TKEY); } catch (e) {} } return themeApply(); },
  state: function(){ return { otv: !!OTV(), lobby: !!LOBA(), load: LOADERR || loadState(), a8: !!(W._gcA8 && W._gcA8.tv && W._gcA8.tv.__tvfix), classicShown: VIA_CLASSIC, bar: !!D.querySelector('#gc-otv-lobbycard.gc-tvs'), own: !!D.getElementById('gc-tvs-admin'), theme: theme(), notes: Object.keys(NOTED), ticks: TICKS, err: TERR }; } };
try { console.log('[GC] TVFIX: every Office TV entry → the new TV; ⚙ Admin 📺 TVs bar (back office TV · lobby editor · team goals) — _gcTVFIX.state()'); } catch (e) {}
})();
