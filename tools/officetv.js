/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   patch OFFICETV — 📺 the OFFICE TV (owner 11/01: "on office tv one of the screens i want to have the goals screen maybe the
   pm leaderboard … you tell me what looks best") + the 📺 LOBBY TV editor (owner 11/01: "a front room TV for customers").

   A) THE OFFICE TV — its own full-screen display (not the CRM's first page: the first page is for working, the TV is for
      looking). White and gold, the GrayCo logo, type sized for 15 ft, no scrolling, no clicks needed. 1920×1080 first; the
      whole screen scales with the window (1366×768 … 3840×2160). It rotates every 20 s (dots, a gold progress line);
      ⏸ / Space pauses; ← → step. Slides:
        1. 🎯 Goals — the year's revenue goal (⚙ Admin → 🎯 Company goal, patch X10) as a ring, signed this year, this month
           vs the monthly pace, what it takes per week, "On pace / Behind by X%"; the team goals the owner sets next to it
           (⚙ Admin → 🏁 Team goals: 5★ reviews, jobs completed, new leads — this month; gc_kv "gc_tv_goals").
        2. 🏆 PM leaderboard — this month (or this quarter: the 📅 switch). One row per PM (Team access role / the jobs' pm
           field), ranked, 🥇🥈🥉. Positive measures only: jobs completed, $ invoiced, gross margin % (only when job costs
           exist), 5★ reviews tied to their jobs, punch items closed, daily logs posted. The score is in the small print:
           each measure as a share of the leader, weighted (completed 30 · $ 25 · reviews 20 · punch 15 · logs 10 · margin
           10), only the measures that have data this period.
        3. 📊 Scoreboard — patch AUTO8's numbers (tvNumbers), restyled.
        4. 🏗 This week — jobs in progress / starting / finishing, inspections, recent wins (jobs signed; 5★ reviews: first
           name + last initial only).
      Privacy: no customer names, addresses, phones, insurance carriers or anything about subs — jobs show as their type and
      job number. "Show $ amounts" (default ON — owner 11/01: the office TV is for the offices; the switch stays): OFF shows
      % of goal and counts instead of dollars.
      Who: admin and office only (the role the menu follows: _gcRP.role()). Everyone else gets no TV.
      Direct link: crm.grayco-cs.com/#tv opens straight into the TV after sign-in (kept through the sign-in), stays on (Screen
      Wake Lock where the browser has it; re-asked when the tab comes back), reopens after a reload; Close takes the #tv off.
      window._gcA8.tv() now opens this TV (the old navy slideshow stays as _gcA8.tvClassic).
      Per-device settings: localStorage gc_otv_v1 { money, period, iv, paused }.
   B) 📺 LOBBY TV — the editor (⚙ Admin → 📺 Lobby TV; also 🧭 GrayCo Systems → Website & marketing → 📺 Lobby TV):
        • Playlist (admin + office): the slides from the library (lobby-types.js, ~37 types), on / off, order, each one's
          text and photos, seconds per slide (12–15). A live preview of the slide and "▶ Preview full rotation" — both are
          lobby.html?preview=1 fed by lobby.js's preview answer, so the preview is exactly what the TV will show.
        • Offers (admin, office and the Marketing Manager): 🏷 promotions shown by the offer / promo slides; the $100-off
          coupon and the 📣 Marketing campaigns each get a "📺 Show on lobby TV" switch. An offer stops on its end date.
          Marketing follows its approval rule (everything customer-facing is approved by an admin): an offer the Marketing
          Manager saves waits for "✓ Approve" here before lobby.js serves it.
        • Lobby link (admin): turn the lobby on → a link with a long random code (crm.grayco-cs.com/lobby.html#t=…);
          "Turn off" / "New link" kill the old code at once.
      Storage (gc_kv; the CRM writes them like its other settings, lobby.js reads them with the service key):
        gc_lobby { v, interval, slides: [{ id, type, on, h, sub, t, items, url, label, end, photos, pairs, people,
                   reviews, offer, rating, count }], uploads: [refs], at, by }      — admin + office
        gc_lobby_offers { offers: { id: { id, h, t, fine, end, url, label, photos, on, pending, src, at, by } } } — + marketing
        gc_lobby_access { on, token, at, by }                                       — admin
   API: window._gcOTV = { open(), close(), allowed(), state(), data(k) } · window._gcLobbyAdmin = { open(tab) }
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_OFFICETV__) return; window.__GC_PATCH_OFFICETV__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var CT = W.__GC_NATIVE_CLEARTIMEOUT__ || W.clearTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return RI.call(W, f, ms); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad2(n){ return (n < 10 ? '0' : '') + n; }
function ymd(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function today(){ return ymd(new Date()); }
function addDays(y, n){ var d = new Date(y + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
function nowIso(){ return new Date().toISOString(); }
function lsGet(k, d){ try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function ssGet(k){ try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
function ssSet(k, v){ try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) {} }
function warn(e){ try { console.warn('[GC OFFICETV]', e && e.message || e); } catch (x) {} }
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects).filter(function(p){ return p && p.id && !p.deleted && !p._deleted; }); }
function invs(){ var c = crm(), a = arr(c.invoices), b = arr(c.invs), seen = {}, out = []; a.concat(b).forEach(function(iv){ if (!iv || !iv.id || seen[iv.id]) return; seen[iv.id] = 1; out.push(iv); }); return out; }
function leads(){ var L = []; try { if (typeof W._gcLaLeads === 'function') L = arr(W._gcLaLeads()); } catch (e) {} if (!L.length) L = arr(crm().leads); return L.filter(function(l){ return l && l.id && !l.deleted; }); }
function users(){ return arr(crm().users); }
function money0(v){ return '$' + Math.round(num(v)).toLocaleString('en-US'); }
function moneyK(v){ v = num(v); var a = Math.abs(v); if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M'; if (a >= 1e4) return '$' + Math.round(v / 1e3) + 'K'; if (a >= 1e3) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; return money0(v); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function role(){ try { if (W._gcRP && W._gcRP.role) return s(W._gcRP.role()); } catch (e) {} return ''; }
function isMM(){ try { if (W._gcIsMM && W._gcIsMM()) return true; } catch (e) {} return /^marketing/i.test(role()); }
function me(){ try { var u = W.meUser && W.meUser(); if (u && u.name) return s(u.name); } catch (e) {} return ''; }
function signedIn(){ try { if (D.getElementById('gc-auth-email')) return false; var e = W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email(); return !!e; } catch (e) { return false; } }
/* admin and office only — the role the menu follows (an admin "viewing as" a PM is a PM here) */
function allowed(){ var r = role(); if (/^admin$/i.test(r)) return true; if (/^office/i.test(r)) return true; if (!r && isAdmin()) return true; return false; }
function lobbyEditor(){ return allowed(); }
function lobbyOffers(){ return allowed() || isMM(); }
function toast(msg, bad){
  try { var t = D.createElement('div'); t.className = 'gc-otv-toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg; D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4200); } catch (e) {}
}
/* gc_kv straight from the CRM (the same reads / writes as patch AUTO8 / U) */
function lsRaw(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function creds(){ return { u: (s(lsRaw('grayco_sb_url')) || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k: s(lsRaw('grayco_sb_key')) }; }
function sbH(extra){ var c = creds(), h = { 'Content-Type': 'application/json' }; if (c.k) { h.apikey = c.k; h.Authorization = 'Bearer ' + c.k; } return Object.assign(h, extra || {}); }
function kvGet(key){
  var c; try { c = creds(); } catch (e) { return Promise.resolve(undefined); }
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', { headers: sbH(), cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); })
    .then(function(rows){ var v = rows && rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }, function(){ return undefined; });
}
function kvPut(key, value){
  var c = creds();
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return r.ok; }, function(){ return false; });
}
function fn(path, body){
  return W.fetch('/.netlify/functions/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { ok: false, error: t.slice(0, 200) }; } j.__status = r.status; return j; }); },
      function(e){ return { ok: false, error: 'No internet (' + (e && e.message) + ')', __status: 0 }; });
}

/* ═════════════════════════════ shared data (cached; read only) ═════════════════════════════ */
var CACHE = { goals: { v: lsGet('gc_tv_goals_cache', null), at: 0 }, mkt: { v: null, at: 0 }, goal: { v: null, at: 0 } };
function pullGoals(force){
  if (!force && Date.now() - CACHE.goals.at < 300e3) return Promise.resolve(CACHE.goals.v);
  CACHE.goals.at = Date.now();
  return kvGet('gc_tv_goals').then(function(v){ if (v !== undefined) { CACHE.goals.v = obj(v); lsSet('gc_tv_goals_cache', CACHE.goals.v); } return CACHE.goals.v; });
}
function mktDoc(){ var v = CACHE.mkt.v; if (v) return v; return obj(lsGet('gc_mkt_cache:gc_mkt_v1', {})); }
function pullMkt(force){
  if (!force && Date.now() - CACHE.mkt.at < 300e3) return Promise.resolve(mktDoc());
  CACHE.mkt.at = Date.now();
  return kvGet('gc_mkt_v1').then(function(v){ if (v && typeof v === 'object') CACHE.mkt.v = v; return mktDoc(); });
}
function reviews(){ var m = obj(mktDoc().reviews); return Object.keys(m).map(function(k){ return m[k]; }).filter(function(r){ return r && !r.del; }); }
function pullGoal(force){
  if (!force && CACHE.goal.at && Date.now() - CACHE.goal.at < 120e3) return Promise.resolve(CACHE.goal.v);
  CACHE.goal.at = Date.now();
  var X = W._gcX10; if (!X || typeof X.goal2 !== 'function') return Promise.resolve(CACHE.goal.v);
  return X.goal2().then(function(r){ CACHE.goal.v = r && r.g ? r.g : null; return CACHE.goal.v; }, function(){ return CACHE.goal.v; });
}
/* first name + last initial — the only way a customer's name is ever shown (reviews) */
function shortName(n){ var p = s(n).replace(/[^A-Za-zÀ-ɏ' .-]/g, '').split(/\s+/).filter(Boolean); if (!p.length) return 'A GrayCo customer'; return p[0].charAt(0).toUpperCase() + p[0].slice(1).toLowerCase() + (p.length > 1 ? ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : ''); }
function nk(v){ return low(v).replace(/\s+/g, ' '); }
/* a job's date of completion (the fields the CRM has used over time) */
function doneAt(p){
  var st = obj(p.jobStageAt);
  var v = s(p.completedAt || p.completionDate || p.completeDate || p.completedDate || st.complete || st.completed || st.closed || st.substantial || (typeof p.completed === 'string' ? p.completed : ''));
  return v.slice(0, 10);
}
function isDone(p){ return /complete|closed/i.test(s(p.status)) && !/cancel|lost/i.test(s(p.status)); }
function isActive(p){ return /^(active|in progress|approved|started|on_hold|on hold)$/i.test(s(p.status)); }
function signedAt(p){ return s(p.contractSignedAt || p.signedAt || p.contractDate || p.wonAt || p.startDate || p.createdAt || p.created).slice(0, 10); }
function jobLabel(p){   /* never the customer / address: the job's type and its number */
  var ty = s(p.jobTypeLabel || p.type || 'Job').replace(/\s*[—–-]\s*.*$/, ''), n = s(p.autoPO || p.po);
  return ty + (n ? ' · ' + n : '');
}
function period(kind){
  var t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7);
  if (kind === 'quarter') { var q0 = Math.floor((m - 1) / 3) * 3 + 1; var a = y + '-' + pad2(q0) + '-01', e = ymd(new Date(y, q0 + 2, 0)); return { a: a, b: e, label: 'Q' + ((q0 + 2) / 3) + ' ' + y, kind: 'quarter' }; }
  return { a: t.slice(0, 8) + '01', b: ymd(new Date(y, m, 0)), label: new Date(t + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), kind: 'month' };
}
function inP(d, P){ d = s(d).slice(0, 10); return !!d && d >= P.a && d <= P.b; }
/* the PMs: active people with the PM role (Team access) + the names on the jobs' pm field that are active people */
function pmList(){
  var U = users().filter(function(u){ return u && s(u.name) && u.active !== false && !u.departed && !u.tombstoned; }), out = {}, byName = {};
  U.forEach(function(u){ byName[nk(u.name)] = u; });
  function match(v){ v = nk(s(v).split(/\s+[—–]\s+/)[0]); if (!v) return null; if (byName[v]) return byName[v]; var hit = null; U.forEach(function(u){ if (!hit && v.indexOf(nk(u.name)) === 0) hit = u; }); return hit; }
  U.forEach(function(u){ if (/project manager|^pm$|assistant pm|\bapm\b/i.test(s(u.role)) || /project manager/i.test(s(u.profile))) out[nk(u.name)] = u; });
  projects().forEach(function(p){ if (!(isActive(p) || isDone(p))) return; var u = match(p.pm || p.projectManager); if (u) out[nk(u.name)] = u; });
  return { list: Object.keys(out).map(function(k){ return out[k]; }), match: match };
}
var DATA = {};
DATA.goals = function(){
  var g = CACHE.goal.v, t = today(), y = t.slice(0, 4), m = +t.slice(5, 7), d = +t.slice(8, 10), dim = new Date(+y, m, 0).getDate();
  var basis = g && g.basis === 'billed' ? 'billed' : 'collected', rev = {}, ytd = 0, month = 0;
  invs().forEach(function(iv){
    if (!iv || iv.deleted || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status))) return;
    if (basis === 'billed') { var mm = s(iv.date || iv.sentDate || iv.created).slice(0, 7); if (mm) rev[mm] = (rev[mm] || 0) + num(iv.amt || iv.amount || iv.total); return; }
    arr(iv.payments).forEach(function(p){ var m2 = s(p && (p.date || p.paidDate)).slice(0, 7); if (m2) rev[m2] = (rev[m2] || 0) + num(p.amt || p.amount); });
    if (!arr(iv.payments).length && s(iv.paidDate)) { var m3 = s(iv.paidDate).slice(0, 7); rev[m3] = (rev[m3] || 0) + num(iv.amt || iv.amount || iv.total); }
  });
  for (var i = 1; i <= m; i++) ytd += num(rev[y + '-' + pad2(i)]);
  month = num(rev[t.slice(0, 7)]);
  var signed = 0, signedN = 0;
  projects().forEach(function(p){ if (!(isActive(p) || isDone(p))) return; if (signedAt(p).slice(0, 4) !== y) return; signed += num(p.contract || p.contractAmt); signedN++; });
  var goal = g ? num(g.goal) : 0, frac = ((m - 1) + d / dim) / 12, should = goal * frac, mPace = goal / 12, mShould = mPace * d / dim;
  var endY = Date.parse(y + '-12-31T23:59:59'), weeksLeft = Math.max(1, (endY - Date.now()) / (7 * 864e5)), gap = Math.max(0, goal - ytd);
  var P = period('month'), rv5 = 0, done = 0, newL = 0;
  reviews().forEach(function(r){ if ((+r.rating || 0) >= 5 && inP(r.date || r.at, P)) rv5++; });
  projects().forEach(function(p){ if (isDone(p) && inP(doneAt(p), P)) done++; });
  leads().forEach(function(l){ var c = s(l.createdAt || l.receivedAt || l.created || l.date).slice(0, 10); if (inP(c, P) && !/quickbooks|import/i.test(s(l.source || l.leadSource))) newL++; });
  var tg = obj(CACHE.goals.v);
  return { has: goal > 0, goal: goal, basis: basis, ytd: ytd, pct: goal ? ytd / goal * 100 : 0, should: should, diffPct: should > 0 ? (ytd - should) / should * 100 : 0,
    month: month, mPace: mPace, mShould: mShould, mPct: mPace ? month / mPace * 100 : 0, gapWeek: gap / weeksLeft, weeksLeft: Math.round(weeksLeft), gap: gap,
    signed: signed, signedN: signedN, signedPct: goal ? signed / goal * 100 : 0, year: y, monthName: P.label,
    team: [{ k: 'reviews', ic: '⭐', l: '5-star reviews', v: rv5, goal: num(tg.reviews) }, { k: 'jobs', ic: '✅', l: 'Jobs completed', v: done, goal: num(tg.jobs) }, { k: 'leads', ic: '📈', l: 'New leads', v: newL, goal: num(tg.leads) }] };
};
DATA.board = function(kind){
  var P = period(kind), pm = pmList(), rows = {}, byPid = {};
  pm.list.forEach(function(u){ rows[nk(u.name)] = { name: s(u.name), jobs: 0, usd: 0, rev: 0, cost: 0, hasCost: false, rv: 0, punch: 0, logs: 0 }; });
  function rowOf(p){ var u = pm.match(p && (p.pm || p.projectManager)); return u ? rows[nk(u.name)] || null : null; }
  var cost = {};
  arr(crm().expenses).forEach(function(x){ if (x && x.pid && !x.deleted && !/reject|void/i.test(s(x.status))) cost[x.pid] = (cost[x.pid] || 0) + num(x.amt || x.amount); });
  invs().forEach(function(iv){ if (iv && (iv.type === 'sub' || iv.sub) && iv.pid && !/void|cancel|reject/i.test(s(iv.status))) cost[iv.pid] = (cost[iv.pid] || 0) + num(iv.amt || iv.amount || iv.total); });
  projects().forEach(function(p){
    var r = rowOf(p); if (!r) return; byPid[p.id] = r;
    if (isDone(p) && inP(doneAt(p), P)) { r.jobs++; if (cost[p.id] > 0 && num(p.contract) > 0) { r.hasCost = true; r.rev += num(p.contract); r.cost += cost[p.id]; } }
    arr(p.dailyLogs).concat(arr(p.updates)).forEach(function(x){ if (x && inP(x.at || x.date, P)) r.logs++; });
  });
  arr(lsGet('gc_daily_logs', [])).forEach(function(l){ var r = l && byPid[l.pid]; if (r && inP(l.at || l.date, P)) r.logs++; });
  invs().forEach(function(iv){
    if (!iv || iv.deleted || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status))) return;
    var r = byPid[iv.pid]; if (r && inP(iv.date || iv.sentDate || iv.created, P)) r.usd += num(iv.amt || iv.amount || iv.total);
  });
  arr(crm().punch).forEach(function(x){ if (!x || x.deleted) return; var r = byPid[x.pid]; if (!r) return; if (/done|closed|complete|fixed/i.test(s(x.status)) && inP(x.closedAt || x.doneAt || x.completedAt || x.updatedAt, P)) r.punch++; });
  reviews().forEach(function(rv){ if ((+rv.rating || 0) < 5 || !inP(rv.date || rv.at, P)) return; var r = byPid[s(rv.jobId)]; if (r) r.rv++; });
  var L = Object.keys(rows).map(function(k){ var r = rows[k]; r.margin = r.hasCost && r.rev > 0 ? (r.rev - r.cost) / r.rev * 100 : null; return r; });
  var W8 = [['jobs', 30], ['usd', 25], ['rv', 20], ['punch', 15], ['logs', 10], ['margin', 10]], max = {}, used = [];
  W8.forEach(function(w){ var m = 0; L.forEach(function(r){ var v = r[w[0]] == null ? 0 : r[w[0]]; if (v > m) m = v; }); max[w[0]] = m; if (m > 0) used.push(w); });
  var wsum = used.reduce(function(a, w){ return a + w[1]; }, 0) || 1;
  L.forEach(function(r){ var sc = 0; used.forEach(function(w){ var v = r[w[0]] == null ? 0 : Math.max(0, r[w[0]]); sc += w[1] * v / max[w[0]]; }); r.score = Math.round(sc / wsum * 1000) / 10; });
  L.sort(function(a, b){ return b.score - a.score || b.jobs - a.jobs || b.usd - a.usd || (a.name < b.name ? -1 : 1); });
  var showMargin = L.some(function(r){ return r.margin != null; });
  return { rows: L, P: P, used: used.map(function(w){ return w[0]; }), weights: used, showMargin: showMargin };
};
DATA.week = function(){
  var t0 = today(), d0 = new Date(t0 + 'T12:00:00'), mon = addDays(t0, -((d0.getDay() + 6) % 7)), sun = addDays(mon, 6), W0 = { a: mon, b: sun };
  var act = [], start = [], fin = [];
  projects().forEach(function(p){
    if (!isActive(p) || /bid|estimat|lead|pending/i.test(s(p.status))) return;
    act.push(p);
    if (inP(p.startDate, W0)) start.push(p);
    if (inP(p.endDate, W0)) fin.push(p);
  });
  var insp = [], P = {}; projects().forEach(function(p){ P[p.id] = p; });
  arr(crm().inspections).forEach(function(x){ if (x && inP(x.date, W0)) insp.push({ d: s(x.date).slice(0, 10), t: s(x.type || x.label || 'Inspection'), job: P[x.pid] ? s(P[x.pid].autoPO || P[x.pid].po) : '', st: s(x.status) }); });
  arr(crm().schedule).forEach(function(x){ if (x && inP(x.date, W0) && /inspect/i.test(s(x.type) + ' ' + s(x.title))) insp.push({ d: s(x.date).slice(0, 10), t: /inspect/i.test(s(x.type)) ? s(x.type) : 'Inspection', job: P[x.pid] ? s(P[x.pid].autoPO || P[x.pid].po) : '', st: '' }); });
  insp.sort(function(a, b){ return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  var ahead = { a: addDays(sun, 1), b: addDays(sun, 45) }, upS = [], upF = [];
  act.forEach(function(p){ if (inP(p.startDate, ahead)) upS.push(p); if (inP(p.endDate, ahead)) upF.push(p); });
  upS.sort(function(a, b){ return s(a.startDate) < s(b.startDate) ? -1 : 1; }); upF.sort(function(a, b){ return s(a.endDate) < s(b.endDate) ? -1 : 1; });
  var fort = addDays(t0, -14), wins = [];
  projects().forEach(function(p){ if ((isActive(p) || isDone(p)) && signedAt(p) >= fort && signedAt(p) <= t0) wins.push({ k: 'job', d: signedAt(p), t: jobLabel(p), usd: num(p.contract || p.contractAmt) }); });
  reviews().forEach(function(r){ var d = s(r.date || r.at).slice(0, 10); if ((+r.rating || 0) >= 5 && d >= fort) wins.push({ k: 'rv', d: d, t: shortName(r.author), q: s(r.text).slice(0, 90) }); });
  wins.sort(function(a, b){ return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  return { act: act, start: start, fin: fin, insp: insp, wins: wins, mon: mon, sun: sun, upS: upS, upF: upF };
};
DATA.score = function(){ try { return W._gcA8 && W._gcA8.tvNumbers ? W._gcA8.tvNumbers() : null; } catch (e) { return null; } };

/* ═════════════════════════════ the Office TV ═════════════════════════════ */
var CFGK = 'gc_otv_v1', IVS = [15, 20, 30, 45, 60];
function cfgLoad(){ var c = Object.assign({ money: true, period: 'month', iv: 20, paused: false, sound: false }, obj(lsGet(CFGK, {}))); c.sound = c.sound === true; if (IVS.indexOf(c.iv) < 0) c.iv = 20; c.money = c.money !== false; return c; }
function cfgSave(c){ lsSet(CFGK, { money: !!c.money, period: c.period === 'quarter' ? 'quarter' : 'month', iv: c.iv, paused: !!c.paused, sound: !!c.sound }); }
var SLIDES = [{ k: 'goals', t: 'Goals', ic: '🎯' }, { k: 'board', t: 'PM leaderboard', ic: '🏆' }, { k: 'score', t: 'Scoreboard', ic: '📊' }, { k: 'week', t: 'This week', ic: '🏗' }];
var CSS = '#gc-otv{position:fixed;inset:0;z-index:2147483000;background:#F7F4EC;color:#0F1D2F;font-family:Inter,"Inter Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden;cursor:default}' +
  '#gc-otv.idle{cursor:none}' +
  '#gc-otv .stg{position:absolute;left:50%;top:50%;width:120em;height:67.5em;transform:translate(-50%,-50%);font-size:min(calc(100vw / 120),calc(100vh / 67.5));overflow:hidden;' +
    'background:radial-gradient(ellipse 70em 40em at 100% 0%,rgba(212,160,23,.10),rgba(212,160,23,0) 60%),linear-gradient(180deg,#FFFFFF 0%,#FBF8F1 100%)}' +
  '#gc-otv .hd{position:absolute;left:0;right:0;top:0;height:8.4em;display:flex;align-items:center;padding:0 3.6em;border-bottom:.18em solid #E8DDBF;background:#fff}' +
  '#gc-otv .hd img{height:5.6em;width:auto;margin-right:2.4em}' +
  '#gc-otv .hd .tt{display:flex;flex-direction:column;justify-content:center;border-left:.18em solid #E8DDBF;padding-left:2.4em}' +
  '#gc-otv .hd .tt b{font-size:3.1em;font-weight:800;letter-spacing:-.02em;line-height:1.05}' +
  '#gc-otv .hd .tt span{font-size:1.35em;color:#6B7585;font-weight:600;margin-top:.25em;letter-spacing:.02em}' +
  '#gc-otv .hd .sp{flex:1}' +
  '#gc-otv .hd .ck{text-align:right;line-height:1.05}#gc-otv .hd .ck b{font-size:3em;font-weight:800;letter-spacing:-.02em}#gc-otv .hd .ck b small{font-size:.48em;color:#B8860B;margin-left:.2em}' +
  '#gc-otv .hd .ck span{display:block;font-size:1.35em;color:#6B7585;font-weight:600;margin-top:.3em}' +
  '#gc-otv .bd{position:absolute;left:3.6em;right:3.6em;top:10.2em;bottom:9.2em}' +
  '#gc-otv .sl{position:absolute;inset:0;opacity:0;transition:opacity .8s ease}#gc-otv .sl.in{opacity:1}' +
  '#gc-otv .ft{position:absolute;left:0;right:0;bottom:4.6em;height:4.2em;display:flex;align-items:center;padding:0 3.6em;gap:1.4em}' +
  '#gc-otv .dots{display:flex;gap:.8em;align-items:center}#gc-otv .dots button{all:unset;cursor:pointer;display:flex;align-items:center;gap:.6em;font-size:1.25em;font-weight:700;color:#8A93A3;padding:.45em .9em;border-radius:2em}' +
  '#gc-otv .dots button i{width:.75em;height:.75em;border-radius:50%;background:#D5CBB0;display:block}#gc-otv .dots button.on{background:#0F1D2F;color:#fff}#gc-otv .dots button.on i{background:#F2C14E}' +
  '#gc-otv .ft .sp{flex:1}#gc-otv .ft .note{font-size:1.15em;color:#8A93A3;font-weight:600}' +
  '#gc-otv .ctl{display:flex;gap:.6em;transition:opacity .6s}#gc-otv.idle .ctl{opacity:.0}' +
  '#gc-otv .ctl button{all:unset;cursor:pointer;font-size:1.15em;font-weight:700;padding:.5em 1em;border-radius:.7em;background:#fff;border:.12em solid #E2D8BC;color:#0F1D2F}#gc-otv .ctl button.on{background:#0F1D2F;color:#fff;border-color:#0F1D2F}' +
  '#gc-otv .ctl button:focus-visible{outline:.2em solid #D4A017}' +
  '#gc-otv .pg{position:absolute;left:0;bottom:4.6em;height:.35em;z-index:4;background:linear-gradient(90deg,#D4A017,#F2C14E);width:0}#gc-otv .pg.run{animation:gcotvpg linear forwards}@keyframes gcotvpg{from{width:0}to{width:100%}}' +
  '#gc-otv .paused-b{background:#0F1D2F;color:#fff;font-weight:800;font-size:1.15em;padding:.4em .9em;border-radius:.6em;letter-spacing:.1em;display:none}#gc-otv.paused .paused-b{display:block}' +
  /* cards */
  '#gc-otv .cd{background:#fff;border:.12em solid #EAE1C8;border-radius:1.8em;box-shadow:0 .5em 2em rgba(15,29,47,.06);padding:2.4em 2.6em;position:relative;overflow:hidden}' +
  '#gc-otv .lb{font-size:1.35em;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#A07A0C}' +
  '#gc-otv .big{font-size:6.4em;font-weight:900;letter-spacing:-.035em;line-height:1;margin-top:.15em;font-variant-numeric:tabular-nums}' +
  '#gc-otv .mut{color:#6B7585;font-weight:600}' +
  '#gc-otv .grid{display:grid;gap:2em;height:100%}' +
  '#gc-otv .ring{position:relative;width:34em;height:34em;margin:0 auto}#gc-otv .ring svg{width:100%;height:100%;transform:rotate(-90deg)}' +
  '#gc-otv .ring .ct{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}' +
  '#gc-otv .ring .ct b{font-size:7.4em;font-weight:900;letter-spacing:-.04em;line-height:.95}#gc-otv .ring .ct span{font-size:1.6em;color:#6B7585;font-weight:700;margin-top:.35em}' +
  '#gc-otv .badge{display:inline-flex;align-items:center;gap:.5em;font-size:1.9em;font-weight:800;padding:.45em 1em;border-radius:3em}' +
  '#gc-otv .b-ok{background:#E7F6EC;color:#13753A}#gc-otv .b-warn{background:#FFF1D6;color:#9A5B00}#gc-otv .b-bad{background:#FDE8E8;color:#B42318}' +
  '#gc-otv .bar{height:1.5em;border-radius:1em;background:#F1EBDA;overflow:hidden;position:relative}#gc-otv .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:1em;background:linear-gradient(90deg,#D4A017,#F2C14E)}' +
  '#gc-otv .bar em{position:absolute;top:-.35em;bottom:-.35em;width:.3em;background:#0F1D2F;border-radius:.2em}' +
  '#gc-otv .gl{display:flex;justify-content:space-between;align-items:baseline;gap:1em;font-size:1.6em;font-weight:800;margin-bottom:.55em;white-space:nowrap}#gc-otv .gl span{overflow:hidden;text-overflow:ellipsis}#gc-otv .gl b{font-weight:900}' +
  '#gc-otv .tg{display:flex;align-items:center;gap:1.2em;padding:1.8em 0;border-top:.1em solid #F0E8D2}#gc-otv .tg:first-of-type{border-top:0}' +
  '#gc-otv .tg .ti{font-size:3.2em;width:1.5em;text-align:center}#gc-otv .tg .tl{flex:1;min-width:0}#gc-otv .tg .tl b{font-size:2em;font-weight:800;display:block;white-space:nowrap}#gc-otv .tg .tl .bar{margin-top:.8em;height:1.4em}' +
  '#gc-otv .tg .tv{font-size:3.8em;font-weight:900;font-variant-numeric:tabular-nums;min-width:3.4em;text-align:right}#gc-otv .tg .tv small{font-size:.45em;color:#8A93A3;font-weight:700}' +
  /* leaderboard */
  '#gc-otv table.lbd{width:100%;border-collapse:separate;border-spacing:0 .8em;margin-top:-.6em;table-layout:auto}#gc-otv table.lbd.cmp td{font-size:1.85em;padding:.5em .9em}#gc-otv table.lbd.cmp td.nm{font-size:2.05em}#gc-otv table.lbd.cmp td.md{font-size:2.4em}#gc-otv table.lbd.cmp td.nm small{display:none}#gc-otv table.lbd.cmp{border-spacing:0 .5em}' +
  '#gc-otv table.lbd th{font-size:1.2em;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8A6A10;text-align:right;padding:0 1.2em .2em}#gc-otv table.lbd th.l{text-align:left}' +
  '#gc-otv table.lbd td{background:#fff;border-top:.12em solid #EAE1C8;border-bottom:.12em solid #EAE1C8;padding:.85em 1em;text-align:right;font-size:2.3em;font-weight:800;font-variant-numeric:tabular-nums}' +
  '#gc-otv table.lbd td:first-child{border-left:.12em solid #EAE1C8;border-radius:1em 0 0 1em;text-align:center;width:3.2em}#gc-otv table.lbd td:last-child{border-right:.12em solid #EAE1C8;border-radius:0 1em 1em 0}' +
  '#gc-otv table.lbd td.nm{text-align:left;font-size:2.6em}#gc-otv table.lbd td.nm small{display:block;font-size:.5em;color:#8A93A3;font-weight:700;margin-top:.2em}' +
  '#gc-otv table.lbd tr.r1 td{background:#FFF7DD;border-color:#E9C766}#gc-otv table.lbd td.md{font-size:3.2em}' +
  '#gc-otv table.lbd td.sc{color:#A07A0C}#gc-otv table.lbd td .z{color:#C3C9D2}' +
  '#gc-otv .fine{font-size:1.15em;color:#7B8494;font-weight:600;line-height:1.45}' +
  /* scoreboard tiles */
  '#gc-otv .tiles{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr;gap:2em;height:100%}' +
  '#gc-otv .tile{display:flex;flex-direction:column;justify-content:space-between}#gc-otv .tile .ic{font-size:2.6em}#gc-otv .tile .big{font-size:6em}#gc-otv .tile .sub{font-size:1.45em;font-weight:700;color:#6B7585}' +
  '#gc-otv .tile.s-green .sub{color:#13753A}#gc-otv .tile.s-amber .sub{color:#9A5B00}#gc-otv .tile.s-red .sub{color:#B42318}' +
  '#gc-otv .tile.hero{background:#0F1D2F;color:#fff;border-color:#0F1D2F}#gc-otv .tile.hero .lb{color:#F2C14E}#gc-otv .tile.hero .sub{color:#C9D4E3}' +
  /* this week */
  '#gc-otv .wk3{display:grid;grid-template-columns:repeat(3,1fr);gap:2em}#gc-otv .wk3 .cd{padding:2em 2.2em}#gc-otv .wk3 .big{font-size:5.4em}' +
  '#gc-otv .li{list-style:none;margin-top:1em}#gc-otv .li li{font-size:1.5em;font-weight:700;padding:.5em 0;border-top:.1em solid #F0E8D2;display:flex;gap:.6em;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '#gc-otv .li li span{flex:1;overflow:hidden;text-overflow:ellipsis}#gc-otv .li li em{font-style:normal;color:#8A93A3;font-weight:700;font-size:.9em}' +
  '#gc-otv .empty{font-size:1.6em;color:#9AA2AF;font-weight:600;padding:1em 0}' +
  'html.gc-otv-on,html.gc-otv-on body{overflow:hidden!important}.gc-otv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#0F1D2F;color:#fff;padding:12px 18px;border-radius:12px;font:600 14px/1.35 system-ui,sans-serif;z-index:2147483600;box-shadow:0 8px 24px rgba(0,0,0,.25)}.gc-otv-toast.bad{background:#B42318}';
function css(){ if (D.getElementById('gc-otv-css')) return; var st = D.createElement('style'); st.id = 'gc-otv-css'; st.textContent = CSS + TCSS + LCSS; D.head.appendChild(st); }

function ring(pct, sz, sub, big, color){
  var r = 44, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)), off = c * (1 - p / 100);
  return '<div class="ring" style="width:' + sz + 'em;height:' + sz + 'em"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#F1EBDA" stroke-width="8"/>' +
    '<circle cx="50" cy="50" r="44" fill="none" stroke="url(#gcotvg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
    '<defs><linearGradient id="gcotvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + (color || '#F2C14E') + '"/><stop offset="1" stop-color="#B8860B"/></linearGradient></defs></svg>' +
    '<div class="ct"><b>' + big + '</b><span>' + sub + '</span></div></div>';
}
function pctTxt(v){ v = num(v); return (v >= 10 || v === 0 ? Math.round(v) : Math.round(v * 10) / 10) + '%'; }
var R = {};
R.goals = function(d, cfg){
  var $ = cfg.money, out = '';
  var left = '';
  if (!d.has) left = '<div class="cd" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">' + ring(0, 30, 'no goal set yet', '🎯') +
    '<div style="font-size:2.4em;font-weight:800;margin-top:1.2em">Set the ' + esc(d.year) + ' revenue goal</div><div class="mut" style="font-size:1.6em;margin-top:.4em">⚙ Admin → 🎯 Company goal</div></div>';
  else {
    var pace = d.diffPct, badge = pace >= -2 ? '<span class="badge b-ok">● On pace' + (pace > 2 ? ' · ahead ' + pctTxt(pace) : '') + '</span>' : '<span class="badge ' + (pace < -15 ? 'b-bad' : 'b-warn') + '">● Behind by ' + pctTxt(-pace) + '</span>';
    left = '<div class="cd" style="height:100%;display:flex;gap:2.6em;align-items:center">' + ring(d.pct, 29, (d.basis === 'billed' ? 'billed' : 'collected') + ' of the ' + esc(d.year) + ' goal', pctTxt(d.pct)) +
      '<div style="flex:1;min-width:0"><div class="lb">' + esc(d.year) + ' revenue goal</div>' +
      '<div class="big" style="font-size:6.2em">' + ($ ? esc(moneyK(d.ytd)) : pctTxt(d.pct)) + '</div>' +
      '<div class="mut" style="font-size:1.9em;margin-top:.2em">' + ($ ? 'of ' + esc(money0(d.goal)) + ' · ' + (d.basis === 'billed' ? 'billed' : 'collected') : 'of the year’s goal · ' + (d.basis === 'billed' ? 'billed' : 'collected')) + '</div>' +
      '<div style="margin-top:2em">' + badge + '</div>' +
      '<div style="margin-top:2.6em"><div class="gl"><span>Signed this year</span><b>' + ($ ? esc(moneyK(d.signed)) + ' · ' : '') + pctTxt(d.signedPct) + '</b></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, d.signedPct).toFixed(1) + '%;background:linear-gradient(90deg,#0F1D2F,#3B5578)"></i></div></div>' +
      '<div style="margin-top:2em"><div class="gl"><span>' + esc(d.monthName.split(' ')[0]) + ' vs monthly pace</span><b>' + ($ ? esc(moneyK(d.month)) + ' / ' + esc(moneyK(d.mPace)) : pctTxt(d.mPct)) + '</b></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, d.mPct).toFixed(1) + '%"></i><em style="left:' + Math.min(99.5, d.mPace ? d.mShould / d.mPace * 100 : 0).toFixed(1) + '%"></em></div><div class="fine" style="margin-top:.6em">▮ marks where today should be</div></div>' +
      '<div style="margin-top:2em;display:flex;gap:1em;align-items:baseline;white-space:nowrap"><span style="font-size:3.4em;font-weight:900;letter-spacing:-.02em">' + ($ ? esc(moneyK(d.gapWeek)) : pctTxt(d.goal ? d.gapWeek / d.goal * 100 : 0)) + '</span><span class="mut" style="font-size:1.5em">' + ($ ? 'a week needed' : 'of goal a week') + ' · ' + d.weeksLeft + ' wks left</span></div>' +
      '</div></div>';
  }
  var tg = d.team.map(function(t){
    var g = t.goal, p = g ? Math.min(100, t.v / g * 100) : 0, hit = g && t.v >= g;
    return '<div class="tg"><div class="ti">' + t.ic + '</div><div class="tl"><b>' + esc(t.l) + (hit ? ' <span style="color:#13753A">✓</span>' : '') + '</b>' + (g ? '<div class="bar"><i style="width:' + p.toFixed(1) + '%' + (hit ? ';background:linear-gradient(90deg,#16A34A,#4ADE80)' : '') + '"></i></div>' : '<div class="fine" style="margin-top:.4em">no goal set · ⚙ Admin → 🏁 Team goals</div>') + '</div>' +
      '<div class="tv">' + t.v + (g ? '<small> / ' + g + '</small>' : '') + '</div></div>';
  }).join('');
  out = '<div class="grid" style="grid-template-columns:1.7fr 1fr">' + left + '<div class="cd" style="display:flex;flex-direction:column"><div class="lb">Team goals · ' + esc(d.monthName) + '</div><div style="flex:1;display:flex;flex-direction:column;justify-content:center">' + tg + '</div></div></div>';
  return out;
};
R.board = function(d, cfg){
  var $ = cfg.money, rows = d.rows.slice(0, 6), MED = ['🥇', '🥈', '🥉'];
  var cols = [['jobs', 'Jobs done'], ['usd', $ ? '$ invoiced' : 'Invoiced'], ['rv', '5★ reviews'], ['punch', 'Punch closed'], ['logs', 'Daily logs']];
  if (d.showMargin) cols.splice(2, 0, ['margin', 'Margin']);
  var maxUsd = 0; rows.forEach(function(r){ if (r.usd > maxUsd) maxUsd = r.usd; });
  function cell(k, r){
    var v = r[k];
    if (k === 'usd') return $ ? (v ? esc(moneyK(v)) : '<span class="z">—</span>') : (maxUsd ? '<span style="display:inline-block;width:2.6em;height:.6em;vertical-align:middle" class="bar"><i style="width:' + (v / maxUsd * 100).toFixed(0) + '%"></i></span>' : '<span class="z">—</span>');
    if (k === 'margin') return v == null ? '<span class="z">—</span>' : Math.round(v) + '%';
    return v ? String(v) : '<span class="z">0</span>';
  }
  var body = rows.map(function(r, i){
    var lead = i === 0 && r.score > 0;
    return '<tr class="' + (lead ? 'r1' : '') + '"><td class="md">' + (r.score > 0 && i < 3 ? MED[i] : '<span style="font-size:.6em;color:#9AA2AF">' + (i + 1) + '</span>') + '</td><td class="nm">' + esc(r.name) + '<small>' + (lead ? 'leading ' + esc(d.P.kind === 'quarter' ? 'the quarter' : 'the month') : r.score > 0 ? 'on the board' : 'ready to start') + '</small></td>' +
      cols.map(function(c){ return '<td>' + cell(c[0], r) + '</td>'; }).join('') + '<td class="sc">' + (r.score ? r.score.toFixed(0) : '<span class="z">0</span>') + '</td></tr>';
  }).join('');
  var WN = { jobs: 'jobs done', usd: 'invoiced', rv: '5★ reviews', punch: 'punch closed', logs: 'daily logs', margin: 'margin' };
  var formula = d.weights.length ? 'Score 0–100: each measure as a share of the leader, weighted ' + d.weights.map(function(w){ return WN[w[0]] + ' ' + w[1]; }).join(' · ') + '.' : 'Score: nothing completed, invoiced or closed yet this period.';
  return '<div style="display:flex;flex-direction:column;height:100%"><div style="display:flex;align-items:flex-end;gap:2em;margin-bottom:1em"><div><div class="lb">PM leaderboard · ' + esc(d.P.label) + '</div><div style="font-size:3.6em;font-weight:900;letter-spacing:-.02em;margin-top:.15em">' + (rows[0] && rows[0].score > 0 ? '🏆 ' + esc(rows[0].name) + ' leads ' + (d.P.kind === 'quarter' ? 'the quarter' : 'the month') : 'A fresh ' + (d.P.kind === 'quarter' ? 'quarter' : 'month') + ' — who takes the lead?') + '</div></div></div>' +
    (rows.length ? '<table class="lbd' + (rows.length > 3 ? ' cmp' : '') + '"><thead><tr><th></th><th class="l">Project manager</th>' + cols.map(function(c){ return '<th>' + c[1] + '</th>'; }).join('') + '<th>Score</th></tr></thead><tbody>' + body + '</tbody></table>' : '<div class="empty">No project managers yet (Team access role “Project Manager”, or a PM on a job).</div>') +
    '<div style="flex:1"></div><div class="fine" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(formula) + (d.showMargin ? '' : ' Margin shows once completed jobs have job costs.') + '</div></div>';
};
R.score = function(n, cfg){
  if (!n) return '<div class="empty">The scoreboard numbers are not loaded on this computer yet.</div>';
  var $ = cfg.money;
  function T(ic, l, v, sub, st, hero){ return '<div class="cd tile' + (st ? ' s-' + st : '') + (hero ? ' hero' : '') + '"><div class="ic">' + ic + '</div><div><div class="lb">' + l + '</div><div class="big">' + v + '</div></div><div class="sub">' + esc(sub) + '</div></div>'; }
  var payN = 0, mo = today().slice(0, 7), openN = 0;
  invs().forEach(function(iv){ if (!iv || iv.deleted || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status))) return; arr(iv.payments).forEach(function(p){ if (s(p && (p.date || p.paidDate)).slice(0, 7) === mo) payN++; }); if (!arr(iv.payments).length && s(iv.paidDate).slice(0, 7) === mo) payN++;
    var bal = num(iv.amt || iv.amount || iv.total) - (iv.paid === true || /^paid$/i.test(s(iv.status)) ? num(iv.amt || iv.amount || iv.total) : 0); if (bal > 0.01 && !/^paid$/i.test(s(iv.status))) openN++; });
  var cs = n.close == null ? '' : n.close >= 50 ? 'green' : n.close >= 30 ? 'amber' : 'red', P0 = period('month'), doneN = 0;
  projects().forEach(function(p){ if (isDone(p) && inP(doneAt(p), P0)) doneN++; });
  return '<div class="tiles">' +
    T('📈', 'New leads', n.newWeek, 'last 7 days', '', true) +
    T('🎯', 'Close rate', n.close == null ? '—' : n.close + '%', n.won + ' won · ' + n.lost + ' lost (90 days)', cs) +
    T('🏗', 'Jobs in progress', n.jobs, 'active right now') +
    T('📐', 'Bids due', n.bidsWeek, n.bidsWeek ? 'in the next 7 days' : 'none due this week') +
    T('💵', 'Collected', $ ? esc(moneyK(n.collected)) : payN, $ ? 'this month' : 'payments this month', 'green') +
    T('🧾', 'Receivables', $ ? esc(moneyK(n.ar)) : openN, $ ? (n.ar60 > 0 ? moneyK(n.ar60) + ' over 60 days' : 'nothing over 60 days') : 'open invoices', $ ? (n.ar60 > 0 ? 'red' : 'green') : '') +
    T('✅', 'Approvals waiting', n.appr, n.appr ? 'waiting on someone' : 'all caught up', n.appr ? 'amber' : 'green') +
    T('🏁', 'Jobs completed', doneN, 'this month', doneN ? 'green' : '') + '</div>';
};
R.week = function(d, cfg){
  var $ = cfg.money;
  function L(list, f, emp){ var l = list.slice(0, 5); return l.length ? '<ul class="li">' + l.map(f).join('') + (list.length > 5 ? '<li><em>+ ' + (list.length - 5) + ' more</em></li>' : '') + '</ul>' : '<div class="empty">' + emp + '</div>'; }
  function pmS(p){ var n = s(p.pm).split(/\s+/); return n[0] ? n[0] + (n[1] ? ' ' + n[1].charAt(0) + '.' : '') : ''; }
  function day(x){ try { return new Date(s(x).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }); } catch (e) { return ''; } }
  var md = function(x){ try { return new Date(s(x).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  var jobRow = function(k){ return function(p){ return '<li><span>' + esc(jobLabel(p)) + '</span><em>' + esc(k === 'start' ? day(p.startDate) : k === 'end' ? day(p.endDate) : k === 'startd' ? md(p.startDate) : k === 'endd' ? md(p.endDate) : pmS(p)) + '</em></li>'; }; };
  var wins = d.wins.slice(0, 5).map(function(w){ return w.k === 'rv' ? '<li><span>⭐⭐⭐⭐⭐ ' + esc(w.t) + '</span><em>review</em></li>' : '<li><span>🏆 ' + esc(w.t) + '</span><em>' + ($ && w.usd ? esc(moneyK(w.usd)) : 'signed') + '</em></li>'; }).join('');
  var fmt = function(x){ return new Date(x + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  return '<div style="display:flex;flex-direction:column;height:100%;gap:2em"><div class="wk3">' +
    '<div class="cd"><div class="lb">In progress</div><div class="big">' + d.act.length + '</div>' + L(d.act, jobRow('pm'), 'No active jobs.') + '</div>' +
    '<div class="cd"><div class="lb">Starting this week</div><div class="big">' + d.start.length + '</div>' + (d.start.length || !d.upS.length ? L(d.start, jobRow('start'), 'Nothing starts this week.') : '<div class="fine" style="margin-top:1em;font-size:1.3em">Nothing this week · coming up</div>' + L(d.upS, jobRow('startd'), '')) + '</div>' +
    '<div class="cd"><div class="lb">Finishing this week</div><div class="big">' + d.fin.length + '</div>' + (d.fin.length || !d.upF.length ? L(d.fin, jobRow('end'), 'Nothing is due to finish.') : '<div class="fine" style="margin-top:1em;font-size:1.3em">Nothing this week · coming up</div>' + L(d.upF, jobRow('endd'), '')) + '</div></div>' +
    '<div class="grid" style="grid-template-columns:1fr 1.4fr;flex:1;min-height:0">' +
    '<div class="cd"><div class="lb">Inspections · ' + esc(fmt(d.mon)) + ' – ' + esc(fmt(d.sun)) + '</div>' + L(d.insp, function(x){ return '<li><span>🔎 ' + esc(x.t) + (x.job ? ' · ' + esc(x.job) : '') + '</span><em>' + esc(day(x.d)) + (x.st ? ' · ' + esc(x.st) : '') + '</em></li>'; }, 'No inspections booked this week.') + '</div>' +
    '<div class="cd"><div class="lb">Recent wins · last 14 days</div>' + (wins ? '<ul class="li">' + wins + '</ul>' : '<div class="empty">The next win shows here — a signed job or a 5★ review.</div>') + '</div></div></div>';
};
/* ═════════════════════════════ the live ticker (owner 11/01: "notifications dragging at the bottom … like ESPN … on each theme
   make different") — events DERIVED from the data the CRM already syncs (no new tracking, no new polling: the TV re-reads the
   CRM's own live lists every 15 s; reviews / goals come with the TV's 5-minute reads):
     🆕 new lead (leads.createdAt — type + city, never the name) · 🚨 emergency (a lead marked emergency / urgency Emergency)
     📝 estimate sent (a lead's stageHistory → "Estimate Sent") · ✍ contract signed (a job's contractSignedAt / signedAt / wonAt,
     a lead won) · ✅ job finished (the job's completion date) · 💵 payment received (an invoice payment's date) · ⭐ 5-star review
     (📣 Marketing reviews) · 🏆 goal milestone (25 / 50 / 75 / 100 % of the revenue goal crossed by the last 24 h of money).
   The last 24 h; when that is fewer than 6, the newest 20 of the last 14 days. A job shows as its type + job number. ═══════ */
var CITIES = ['Bartlett', 'Memphis', 'Cordova', 'Collierville', 'Germantown', 'Arlington', 'Lakeland', 'Millington', 'Atoka', 'Munford', 'Oakland', 'Somerville', 'Brighton', 'Covington', 'Eads', 'Southaven', 'Olive Branch', 'Horn Lake', 'Hernando', 'West Memphis', 'Marion', 'Rossville', 'Piperton', 'Mason', 'Nashville', 'Jackson', 'Little Rock', 'Tupelo', 'Oxford'];
function cityOf(x){ var hay = ' ' + s(x && x.city) + ' ' + s(x && x.address).split(',').slice(1).join(' ') + ' '; for (var i = 0; i < CITIES.length; i++) if (new RegExp('\\b' + CITIES[i] + '\\b', 'i').test(hay)) return CITIES[i]; return ''; }
function leadType(l){ var t = s(l.type || l.leadKind || l.jobType || 'Inquiry').replace(/\s*[—–-]\s*.*$/, ''); return t.length > 26 ? t.slice(0, 26) : t; }
function tms(v){ v = s(v); if (!v) return NaN; return Date.parse(/^\d{4}-\d\d-\d\d$/.test(v) ? v + 'T12:00:00' : v); }
function initials(n){ return s(n).split(/\s+/).filter(Boolean).map(function(w){ return w.charAt(0).toUpperCase(); }).join('').slice(0, 3); }
var EVK = { lead: ['🆕', 'NEW LEAD'], emerg: ['🚨', 'EMERGENCY'], est: ['📝', 'ESTIMATE SENT'], sign: ['✍', 'CONTRACT SIGNED'], done: ['✅', 'JOB FINISHED'], pay: ['💵', 'PAYMENT RECEIVED'], rv: ['⭐', '5-STAR REVIEW'], goal: ['🏆', 'MILESTONE'] };
function events(money){
  var now = Date.now(), d14 = now - 14 * 864e5, out = [], P = {};
  projects().forEach(function(p){ P[p.id] = p; });
  function add(id, kind, t, txt, extra){ if (!isFinite(t) || t < d14 || t > now + 864e5) return; out.push(Object.assign({ id: id, kind: kind, t: t, txt: txt }, extra || {})); }
  leads().forEach(function(l){
    var c = tms(l.createdAt || l.receivedAt || l.created), city = cityOf(l), em = l.emergency === true || /emergenc/i.test(s(l.urgency) + ' ' + s(l.priority));
    if (!/quickbooks|import/i.test(s(l.source || l.leadSource))) add('L:' + l.id, em ? 'emerg' : 'lead', c, leadType(l) + (city ? ' · ' + city : ''), { pm: s(l.pm || l.assignedTo || l.estimator) });
    arr(l.stageHistory).forEach(function(h, i){ if (h && /estimate\s*sent/i.test(s(h.to || h.stage))) add('E:' + l.id + ':' + i, 'est', tms(h.at || h.date), leadType(l) + (city ? ' · ' + city : ''), { pm: s(l.estimator || l.pm) }); });
    if (/^won$/i.test(s(l.bidStatus || l.status || l.stage)) && l.wonAt) add('W:' + l.id, 'sign', tms(l.wonAt), leadType(l) + (city ? ' · ' + city : ''), { usd: num(l.estValue), pm: s(l.pm || l.estimator) });
  });
  projects().forEach(function(p){
    var sg = tms(p.contractSignedAt || p.signedAt || p.wonAt);
    if (isFinite(sg) && (isActive(p) || isDone(p))) add('S:' + p.id, 'sign', sg, jobLabel(p), { usd: num(p.contract || p.contractAmt), pm: s(p.pm) });
    if (isDone(p)) add('D:' + p.id, 'done', tms(doneAt(p)), jobLabel(p), { pm: s(p.pm) });
  });
  var pays = [];
  invs().forEach(function(iv){
    if (!iv || iv.deleted || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status))) return;
    var p = P[iv.pid], lab = p ? jobLabel(p) : 'Invoice';
    arr(iv.payments).forEach(function(x, i){ var t = tms(x && (x.date || x.paidDate)); add('P:' + iv.id + ':' + i, 'pay', t, lab, { usd: num(x.amt || x.amount), pm: p ? s(p.pm) : '' }); pays.push({ t: t, v: num(x.amt || x.amount) }); });
    if (!arr(iv.payments).length && s(iv.paidDate)) { var t2 = tms(iv.paidDate), v2 = num(iv.amt || iv.amount || iv.total); add('P:' + iv.id, 'pay', t2, lab, { usd: v2, pm: p ? s(p.pm) : '' }); pays.push({ t: t2, v: v2 }); }
  });
  reviews().forEach(function(r){ if ((+r.rating || 0) >= 5) add('R:' + r.id, 'rv', tms(r.date || r.at), shortName(r.author), { pm: P[s(r.jobId)] ? s(P[s(r.jobId)].pm) : '' }); });
  var g = CACHE.goal.v; if (g && num(g.goal) > 0) {   /* the milestone the last 24 h of money crossed */
    var gd = DATA.goals(), recent = 0; pays.forEach(function(x){ if (x.t >= now - 864e5) recent += x.v; });
    var before = (gd.ytd - recent) / gd.goal * 100, nowP = gd.pct;
    [25, 50, 75, 100].forEach(function(m){ if (before < m && nowP >= m) add('G:' + gd.year + ':' + m, 'goal', now - 60e3, 'Revenue goal ' + m + '%!'); });
  }
  out.sort(function(a, b){ return b.t - a.t; });
  var day = out.filter(function(e){ return e.t >= now - 864e5; });
  return (day.length >= 6 ? day : out).slice(0, 20).map(function(e){ e.ic = EVK[e.kind][0]; e.lab = EVK[e.kind][1]; e.amt = money && e.usd > 0 && /sign|pay/.test(e.kind) ? moneyK(e.usd) : ''; return e; });
}
function ago(t){ var m = Math.round((Date.now() - t) / 6e4); if (m < 60) return Math.max(1, m) + 'm ago'; var h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; }
function dayStamp(t){ try { return new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
function evText(e){ return e.txt + (e.amt ? ' · ' + e.amt : ''); }
/* the four looks: the content and the frame differ per slide */
var TK = {};
TK.goals = function(ev){
  if (!ev.length) return ['<span class="it"><b>GRAYCO</b> Waiting for the next lead, contract or payment</span>'];
  return ev.map(function(e){ return '<span class="it"><b>' + e.ic + ' ' + e.lab + '</b> ' + esc(evText(e)) + ' <em>' + esc(ago(e.t)) + '</em></span>'; });
};
TK.board = function(ev, cfg){
  var out = [], bd = DATA.board(cfg.period);
  ev.forEach(function(e){
    var who = initials(e.pm) || 'GC', what = e.kind === 'done' ? '+1 job finished' : e.kind === 'sign' ? '+1 contract' + (e.amt ? ' ' + e.amt : '') : e.kind === 'pay' ? (e.amt ? '+' + e.amt + ' collected' : '+1 payment') : e.kind === 'rv' ? '+1 ★★★★★' : e.kind === 'est' ? '+1 estimate' : e.kind === 'lead' ? '+1 lead' : e.kind === 'emerg' ? 'emergency call' : e.txt;
    out.push('<span class="it"><b class="ini">' + esc(who) + '</b> ' + esc(what) + ' <em>' + esc(e.kind === 'goal' ? e.txt : ago(e.t)) + '</em></span>');
  });
  bd.rows.slice(0, 6).forEach(function(r, i){ out.push('<span class="it"><b class="ini">' + esc(initials(r.name)) + '</b> #' + (i + 1) + ' · ' + r.jobs + ' job' + (r.jobs === 1 ? '' : 's') + (cfg.money && r.usd ? ' · ' + esc(moneyK(r.usd)) : '') + ' · score ' + Math.round(r.score) + '</span>'); });
  return out;
};
TK.score = function(ev, cfg){
  var t0 = today(), y0 = addDays(t0, -1), c = {};
  function k(kind, d, v){ var o = c[kind] = c[kind] || { t: 0, y: 0, tv: 0, yv: 0 }; if (d === t0) { o.t++; o.tv += v || 0; } else if (d === y0) { o.y++; o.yv += v || 0; } }
  leads().forEach(function(l){ var d = s(l.createdAt || l.receivedAt || l.created).slice(0, 10); if (!/quickbooks|import/i.test(s(l.source || l.leadSource))) k('lead', ymd(new Date(tms(d) || 0)), 0); });
  invs().forEach(function(iv){ if (!iv || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status))) return; arr(iv.payments).forEach(function(x){ k('pay', s(x && (x.date || x.paidDate)).slice(0, 10), num(x.amt || x.amount)); }); if (!arr(iv.payments).length && s(iv.paidDate)) k('pay', s(iv.paidDate).slice(0, 10), num(iv.amt || iv.amount || iv.total)); });
  projects().forEach(function(p){ if (isDone(p)) k('done', doneAt(p), 0); var sg = s(p.contractSignedAt || p.signedAt || p.wonAt).slice(0, 10); if (sg) k('sign', sg, num(p.contract)); });
  reviews().forEach(function(r){ if ((+r.rating || 0) >= 5) k('rv', s(r.date || r.at).slice(0, 10), 0); });
  function q(kind, label, usd){ var o = c[kind] || { t: 0, y: 0, tv: 0, yv: 0 }, a = usd && cfg.money ? o.tv : o.t, b = usd && cfg.money ? o.yv : o.y, d = a - b;
    var arrw = d > 0 ? '<i class="up">▲</i>' : d < 0 ? '<i class="dn">▼</i>' : '<i class="eq">▬</i>';
    return '<span class="it"><b>' + label + '</b> ' + (usd && cfg.money ? esc(moneyK(a)) : a) + ' ' + arrw + ' <em>' + (d > 0 ? '+' : '') + (usd && cfg.money ? (d ? (d > 0 ? '' : '−') + esc(moneyK(Math.abs(d))) : '0') : d) + ' vs yesterday</em></span>'; }
  var out = [q('lead', 'NEW LEADS'), q('sign', 'CONTRACTS', true), q('pay', 'COLLECTED', true), q('done', 'JOBS DONE'), q('rv', '5★ REVIEWS')];
  var n = DATA.score(); if (n) out.push('<span class="it"><b>JOBS ACTIVE</b> ' + n.jobs + '</span>', '<span class="it"><b>BIDS DUE 7D</b> ' + n.bidsWeek + '</span>', '<span class="it"><b>CLOSE RATE</b> ' + (n.close == null ? '—' : n.close + '%') + '</span>');
  return out;
};
TK.week = function(ev){
  if (!ev.length) return ['<span class="it"><i class="ds">' + esc(dayStamp(Date.now())) + '</i> A quiet day so far — the next lead, contract or payment shows here</span>'];
  return ev.map(function(e){ return '<span class="it"><i class="ds">' + esc(dayStamp(e.t)) + '</i> ' + e.ic + ' ' + esc(e.lab.charAt(0) + e.lab.slice(1).toLowerCase()) + ' — ' + esc(evText(e)) + '</span>'; });
};
var TKTAB = { goals: 'GRAYCO <span>LIVE</span>', board: 'LEADERS', score: 'GRAYCO INDEX', week: 'THIS WEEK' };
var TKCLS = { goals: 'espn', board: 'board', score: 'stock', week: 'news' };
var TCSS = '#gc-otv .tk{position:absolute;left:0;right:0;bottom:0;height:4.6em;display:flex;align-items:stretch;overflow:hidden;z-index:3}' +
  '#gc-otv .tk .tab{flex:0 0 auto;display:flex;align-items:center;padding:0 2.2em 0 3.6em;font-weight:900;letter-spacing:.14em;font-size:1.45em;position:relative;z-index:2;white-space:nowrap}' +
  '#gc-otv .tk .win{flex:1;overflow:hidden;position:relative;display:flex;align-items:center}' +
  '#gc-otv .tk .trk{display:inline-flex;white-space:nowrap;will-change:transform;animation:gcotvcrawl linear infinite;animation-duration:var(--dur,60s)}' +
  '@keyframes gcotvcrawl{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}' +
  '#gc-otv .tk .it{display:inline-flex;align-items:center;gap:.5em;font-size:1.6em;font-weight:600;padding:0 1.6em;position:relative}' +
  '#gc-otv .tk .it em{font-style:normal;opacity:.65;font-size:.82em;font-weight:600}' +
  /* 🎯 ESPN bottom line */
  '#gc-otv .tk.espn{background:#0B1626;color:#fff;border-top:.25em solid #D4A017}#gc-otv .tk.espn .tab{background:#D4A017;color:#0B1626;clip-path:polygon(0 0,100% 0,calc(100% - 1.2em) 100%,0 100%)}#gc-otv .tk.espn .tab span{background:#B42318;color:#fff;padding:.15em .45em;margin-left:.5em;border-radius:.2em;letter-spacing:.1em}' +
  '#gc-otv .tk.espn .it b{color:#F2C14E;font-weight:900;letter-spacing:.06em;font-size:.85em}#gc-otv .tk.espn .it:after{content:"";position:absolute;right:-.3em;width:.55em;height:.55em;background:#D4A017;transform:rotate(45deg)}' +
  /* 🏆 sports leaderboard crawl */
  '#gc-otv .tk.board{background:linear-gradient(180deg,#14324F,#0E2338);color:#E8EEF5;border-top:.25em solid #F2C14E}#gc-otv .tk.board .tab{background:#F2C14E;color:#0E2338}' +
  '#gc-otv .tk.board .ini{background:#fff;color:#0E2338;font-weight:900;padding:.12em .45em;border-radius:.3em;letter-spacing:.04em}#gc-otv .tk.board .it{border-right:.1em solid rgba(255,255,255,.18)}' +
  /* 📊 stock ticker */
  '#gc-otv .tk.stock{background:#05080D;color:#E6EDF5;border-top:.2em solid #1F2937;font-variant-numeric:tabular-nums}#gc-otv .tk.stock .tab{background:#111827;color:#F2C14E;border-right:.15em solid #F2C14E}' +
  '#gc-otv .tk.stock .it{font-family:"Inter Display",Inter,monospace;font-weight:700}#gc-otv .tk.stock .it b{color:#9CA3AF;font-weight:800;letter-spacing:.08em;font-size:.85em}#gc-otv .tk.stock i{font-style:normal}#gc-otv .tk.stock .up{color:#22C55E}#gc-otv .tk.stock .dn{color:#EF4444}#gc-otv .tk.stock .eq{color:#6B7280}' +
  /* 🏗 calm news crawl */
  '#gc-otv .tk.news{background:#FBF8F1;color:#0F1D2F;border-top:.18em solid #E8DDBF}#gc-otv .tk.news .tab{background:#0F1D2F;color:#fff;font-size:1.3em}#gc-otv .tk.news .it{font-weight:600}#gc-otv .tk.news .ds{font-style:normal;color:#A07A0C;font-weight:800;font-size:.8em;letter-spacing:.08em;text-transform:uppercase}' +
  /* breaking banner */
  '#gc-otv .brk{position:absolute;left:0;right:0;bottom:4.6em;height:6.4em;display:flex;align-items:center;gap:1.6em;padding:0 3.6em;background:linear-gradient(90deg,#0F1D2F 0%,#13263F 100%);color:#fff;z-index:4;transform:translateY(110%);opacity:0;transition:transform .55s cubic-bezier(.2,.8,.2,1),opacity .4s}' +
  '#gc-otv .brk.on{transform:translateY(0);opacity:1}#gc-otv .brk .bl{background:#B42318;color:#fff;font-weight:900;letter-spacing:.16em;font-size:1.35em;padding:.45em .9em;border-radius:.4em;animation:gcotvblink 1.2s ease-in-out infinite alternate}' +
  '#gc-otv .brk .bi{font-size:3em}#gc-otv .brk .bt{display:flex;flex-direction:column;min-width:0}#gc-otv .brk .bt b{font-size:2.6em;font-weight:900;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gc-otv .brk .bt span{font-size:1.4em;color:#F2C14E;font-weight:800;letter-spacing:.14em}' +
  '#gc-otv .brk:before{content:"";position:absolute;left:0;top:0;bottom:0;width:.6em;background:#D4A017}@keyframes gcotvblink{from{opacity:1}to{opacity:.55}}';
function chime(){ try { var A = W.AudioContext || W.webkitAudioContext; if (!A) return; var c = new A(), o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(880, c.currentTime); o.frequency.setValueAtTime(1320, c.currentTime + .12); g.gain.setValueAtTime(.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(.2, c.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .5); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .55); setTimeout(function(){ try { c.close(); } catch (e) {} }, 900); } catch (e) {} }
var TV = null;
function open(opts){
  opts = opts || {};
  if (!allowed()) { toast('The office TV is for admin and office sign-ins.', true); return null; }
  css();
  if (TV) { try { TV.__close(); } catch (e) {} }
  var cfg = cfgLoad(), cur = 0, playing = !cfg.paused, T = { adv: 0, clk: 0, ref: 0, ev: 0, brk: 0 }, SEEN = {}, QUE = [], TKSIG = '', BRK = { n: 0, last: null }, PF = { max: 0, at: '' }, alive = true, lastMove = Date.now(), L = [], WL = null, kiosk = !!opts.kiosk;
  var el = D.createElement('div'); el.id = 'gc-otv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Office TV');
  el.innerHTML = '<div class="stg"><div class="hd"><img alt="GrayCo Construction Services" src="/grayco-logo-wide.jpg"><div class="tt"><b data-t>Goals</b><span data-s>GrayCo Construction Services · office</span></div><span class="sp"></span><div class="ck"><b data-tm></b><span data-dt></span></div></div>' +
    '<div class="bd" data-bd></div>' +
    '<div class="ft"><div class="dots" data-dots></div><span class="sp"></span><span class="paused-b">⏸ PAUSED</span><span class="note" data-note></span><div class="ctl">' +
    '<button type="button" data-k="play" title="Pause / play (Space)">⏸ Pause</button><button type="button" data-k="money" title="Show $ amounts">$ on</button><button type="button" data-k="period" title="Leaderboard: month or quarter">📅 Month</button>' +
    '<button type="button" data-k="sound" title="A chime on new events">🔕</button><button type="button" data-k="fs" title="Full screen">⛶</button><button type="button" data-k="x" title="Close (Esc)">✕ Close</button></div></div><i class="pg" data-pg></i>' +
    '<div class="brk" data-brk aria-live="polite"><span class="bl">BREAKING</span><span class="bi" data-bi></span><div class="bt"><span data-bk></span><b data-bt></b></div></div>' +
    '<div class="tk" data-tk><div class="tab" data-tab></div><div class="win"><div class="trk" data-trk></div></div></div></div>';
  var $ = function(q){ return el.querySelector(q); };
  function on(t, ev, f, o){ t.addEventListener(ev, f, o); L.push([t, ev, f, o]); }
  function data(k){ return k === 'goals' ? DATA.goals() : k === 'board' ? DATA.board(cfg.period) : k === 'week' ? DATA.week() : DATA.score(); }
  function draw(dir){
    var sl = SLIDES[cur], node = D.createElement('div'); node.className = 'sl'; node.setAttribute('data-slide', sl.k);
    try { node.innerHTML = R[sl.k](data(sl.k), cfg); } catch (e) { warn(e); node.innerHTML = '<div class="empty">This slide could not be drawn (' + esc(e && e.message) + ').</div>'; }
    var bd = $('[data-bd]'), old = bd.querySelectorAll('.sl'); bd.appendChild(node); void node.offsetWidth; node.classList.add('in');
    Array.prototype.forEach.call(old, function(o){ o.classList.remove('in'); later(function(){ try { o.remove(); } catch (e) {} }, dir ? 850 : 0); if (!dir) o.remove(); });
    $('[data-t]').textContent = sl.ic + ' ' + (sl.k === 'board' ? 'PM leaderboard' : sl.t);
    $('[data-s]').textContent = sl.k === 'board' ? (cfg.period === 'quarter' ? 'This quarter' : 'This month') + ' · ranked on completed work' : sl.k === 'goals' ? 'Where we stand this year' : sl.k === 'week' ? 'The week at a glance' : 'Live numbers · updated every minute';
    ticker(true);
    $('[data-dots]').innerHTML = SLIDES.map(function(x, i){ return '<button type="button" data-go="' + i + '"' + (i === cur ? ' class="on" aria-current="true"' : '') + '><i></i>' + esc(x.t) + '</button>'; }).join('');
    syncUi();
  }
  function syncUi(){
    var b = $('[data-k="play"]'); b.textContent = playing ? '⏸ Pause' : '▶ Play'; b.classList.toggle('on', !playing);
    var m = $('[data-k="money"]'); m.textContent = cfg.money ? '$ on' : '$ off'; m.classList.toggle('on', !cfg.money); m.setAttribute('aria-pressed', cfg.money ? 'true' : 'false');
    var p = $('[data-k="period"]'); p.textContent = cfg.period === 'quarter' ? '📅 Quarter' : '📅 Month';
    var so = $('[data-k="sound"]'); so.textContent = cfg.sound ? '🔔' : '🔕'; so.classList.toggle('on', !!cfg.sound);
    el.classList.toggle('paused', !playing);
    $('[data-note]').textContent = (cfg.money ? '' : '$ hidden · ') + 'next slide every ' + cfg.iv + ' s';
  }
  function arm(){
    try { CT.call(W, T.adv); } catch (e) {} T.adv = 0;
    var pg = $('[data-pg]'); pg.className = 'pg'; pg.style.animationDuration = '';
    if (!alive || !playing || D.hidden) return;
    void pg.offsetWidth; pg.style.animationDuration = cfg.iv + 's'; pg.className = 'pg run';
    T.adv = later(function(){ T.adv = 0; if (alive && playing) step(1); }, cfg.iv * 1000);
  }
  function go(i, dir){ cur = (i + SLIDES.length) % SLIDES.length; draw(dir == null ? 1 : dir); arm(); }
  function step(d){ go(cur + d, d); }
  function setPlaying(v){ playing = v; cfg.paused = !v; cfgSave(cfg); syncUi(); arm(); }
  function clock(){
    var d = new Date(), hm = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), m = hm.match(/^(.*?)\s*([AP]M)$/i);
    $('[data-tm]').innerHTML = m ? esc(m[1]) + '<small>' + esc(m[2]) + '</small>' : esc(hm);
    $('[data-dt]').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (Date.now() - lastMove > 3000) el.classList.add('idle');
    if (!signedIn()) { close(true); }
  }
  function refresh(){ Promise.all([pullGoal(), pullGoals(), pullMkt()]).then(function(){ if (alive) draw(0); }); }   /* the 5-minute reads; the CRM's own lists are live */
  function timed(name, f){ return function(){ var t0 = W.performance.now(); try { return f.apply(this, arguments); } finally { var d = W.performance.now() - t0; if (d > PF.max) { PF.max = Math.round(d * 10) / 10; PF.at = name; } } }; }
  /* the crawl: rebuilt only when its words change (or the slide does); one CSS transform animation, no timers */
  function ticker(force){
    var k = SLIDES[cur].k, ev = events(cfg.money), html = TK[k](ev, cfg).join(''), sig = k + '|' + (cfg.money ? 1 : 0) + '|' + html;
    if (sig === TKSIG) return; TKSIG = sig;
    var tk = $('[data-tk]'), trk = $('[data-trk]'); tk.className = 'tk ' + TKCLS[k]; $('[data-tab]').innerHTML = TKTAB[k];
    trk.innerHTML = html + html;   /* twice: the loop is seamless */
    var w = trk.scrollWidth / 2, px = parseFloat(W.getComputedStyle($('.stg')).fontSize) || 16;
    trk.style.setProperty('--dur', Math.max(20, Math.round(w / (px * 7))) + 's');
  }
  /* new events → one "breaking" banner each (8 s), then into the crawl */
  function poll(){
    var ev = events(cfg.money), fresh = [];
    ev.forEach(function(e){ if (!SEEN[e.id]) { SEEN[e.id] = 1; if (e.t >= Date.now() - 6 * 3600e3) fresh.push(e); } });
    fresh.reverse().forEach(function(e){ QUE.push(e); });
    if (QUE.length > 5) QUE = QUE.slice(-5);
    if (!T.brk) showBreak(); ticker(false);
  }
  function showBreak(){
    var e = QUE.shift(), b = $('[data-brk]'); if (!e || !alive) { T.brk = 0; return; }
    $('[data-bi]').textContent = e.ic; $('[data-bk]').textContent = e.lab; $('[data-bt]').textContent = evText(e);
    BRK.n++; BRK.last = { id: e.id, kind: e.kind, text: evText(e) };
    b.classList.add('on'); if (cfg.sound) chime();
    T.brk = later(function(){ b.classList.remove('on'); T.brk = later(function(){ T.brk = 0; if (QUE.length) showBreak(); }, 700); }, 8000);
  }
  ticker = timed('ticker', ticker); poll = timed('poll', poll);
  function wake(){ try { if (navigator.wakeLock && !WL && D.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function(l){ WL = l; l.addEventListener('release', function(){ WL = null; }); }, function(){}); } catch (e) {} }
  function onKey(e){
    poke();
    var tn = e.target && e.target.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA') return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) setPlaying(!playing); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); step(-1); }
  }
  function poke(){ lastMove = Date.now(); el.classList.remove('idle'); }
  function onClick(e){
    poke(); var b = e.target && e.target.closest ? e.target.closest('[data-k],[data-go]') : null; if (!b) return;
    var k = b.getAttribute('data-k'), g = b.getAttribute('data-go');
    if (g != null) { go(+g, +g > cur ? 1 : -1); return; }
    if (k === 'play') setPlaying(!playing);
    else if (k === 'money') { cfg.money = !cfg.money; cfgSave(cfg); draw(0); }
    else if (k === 'period') { cfg.period = cfg.period === 'quarter' ? 'month' : 'quarter'; cfgSave(cfg); if (SLIDES[cur].k !== 'board') cur = 1; draw(0); arm(); }
    else if (k === 'sound') { cfg.sound = !cfg.sound; cfgSave(cfg); syncUi(); if (cfg.sound) chime(); }
    else if (k === 'fs') { try { (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (x) {} }
    else if (k === 'x') close();
    try { b.blur(); } catch (x) {}
  }
  function onVis(){ if (D.hidden) { try { CT.call(W, T.adv); } catch (e) {} T.adv = 0; return; } wake(); refresh(); arm(); }
  function close(keepWant){
    if (!alive) return; alive = false;
    try { CT.call(W, T.adv); CT.call(W, T.brk); clearInterval(T.clk); clearInterval(T.ref); clearInterval(T.ev); } catch (e) {}
    L.forEach(function(x){ try { x[0].removeEventListener(x[1], x[2], x[3]); } catch (e) {} }); L = [];
    try { if (WL) WL.release(); } catch (e) {} WL = null;
    try { if (D.fullscreenElement) D.exitFullscreen(); } catch (e) {}
    el.remove(); if (TV === el) TV = null; D.documentElement.classList.remove('gc-otv-on');
    if (!keepWant) WANT = false;   /* closed by a person: the #tv link does not reopen it */
    if (kiosk && !keepWant) { ssSet('gc_tv_want', ''); try { if (/^#\/?tv$/i.test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {} }
  }
  el.__close = close;
  el.__state = function(){ return { slide: SLIDES[cur].k, playing: playing, money: cfg.money, period: cfg.period, iv: cfg.iv, kiosk: kiosk, wake: !!WL, sound: cfg.sound, breaking: BRK.n, lastBreak: BRK.last, perf: PF, ticker: ($('[data-tk]') || {}).className }; };
  el.__poll = function(){ poll(); };
  el.__go = function(k){ var i = SLIDES.map(function(x){ return x.k; }).indexOf(k); if (i >= 0) go(i, 0); };
  el.__set = function(o){ Object.assign(cfg, o || {}); cfgSave(cfg); if (o && o.paused != null) playing = !o.paused; draw(0); arm(); };
  on(el, 'click', onClick); on(el, 'mousemove', poke); on(W, 'keydown', onKey, true); on(D, 'visibilitychange', onVis);
  D.body.appendChild(el); TV = el; D.documentElement.classList.add('gc-otv-on');
  clock(); T.clk = every(clock, 1000); T.ref = every(refresh, 60000);
  events(cfg.money).forEach(function(e){ SEEN[e.id] = 1; });   /* what is already there is not "breaking" */
  draw(0); arm(); wake(); T.ev = every(poll, 15000);
  Promise.all([pullGoal(), pullGoals(), pullMkt()]).then(function(){ if (alive) draw(0); });
  return el;
}
function close(){ if (TV) TV.__close(); }

/* ── the #tv link: straight into the TV after sign-in, and back after a reload ── */
var WANT = /^#\/?tv$/i.test(location.hash || '') || ssGet('gc_tv_want') === '1';
if (WANT) ssSet('gc_tv_want', '1');
W.addEventListener('hashchange', function(){ if (/^#\/?tv$/i.test(location.hash || '')) { WANT = true; ssSet('gc_tv_want', '1'); } });
var told = false, BOOT = Date.now();
every(function(){
  if (!WANT || TV) return;
  if (!signedIn()) return;
  if (!role() && !isAdmin()) return;   /* the role is not known yet */
  if (!projects().length && Date.now() - BOOT < 20000) return;   /* let the jobs load first */
  if (!allowed()) { if (!told) { told = true; toast('The office TV is for admin and office sign-ins.', true); } WANT = false; ssSet('gc_tv_want', ''); return; }
  try { if (!/^#\/?tv$/i.test(location.hash || '')) history.replaceState(history.state, '', location.pathname + location.search + '#tv'); } catch (e) {}
  open({ kiosk: true });
}, 1000);

/* ── the old entry points open this TV; the TV tile only for admin / office ── */
function hookA8(){ var A = W._gcA8; if (!A || A.__otv) return; A.__otv = true; A.tvClassic = A.tv; A.tv = function(){ return open(); }; }
hookA8(); later(hookA8, 3000);

/* ═════════════════════════════ ⚙ Admin: 🏁 Team goals + 📺 Lobby TV cards ═════════════════════════════ */
function adminCards(){
  var box = D.getElementById('gc-x10-admin'); if (!box || !box.isConnected) return;
  if (!D.getElementById('gc-otv-goals')) {
    var goalBar = box.querySelector('[data-a="goal"]'); goalBar = goalBar ? goalBar.closest('.gcx10-bar') : null;
    var c = D.createElement('div'); c.id = 'gc-otv-goals'; c.className = 'gcx10-bar'; c.style.borderLeftColor = '#D4A017';
    var g = obj(CACHE.goals.v);
    c.innerHTML = '<span><b>🏁 Team goals</b> · this month, on the 📺 office TV: ⭐ 5-star reviews <input data-tg="reviews" type="number" min="0" style="width:64px" value="' + esc(g.reviews || '') + '"> ✅ jobs completed <input data-tg="jobs" type="number" min="0" style="width:64px" value="' + esc(g.jobs || '') + '"> 📈 new leads <input data-tg="leads" type="number" min="0" style="width:64px" value="' + esc(g.leads || '') + '"></span>' +
      '<button type="button" data-otv="tg" style="background:#D4A017;color:#0f172a">Save</button>';
    c.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-otv="tg"]'); if (!b) return;
      var v = { at: nowIso(), by: me() }; Array.prototype.forEach.call(c.querySelectorAll('[data-tg]'), function(i){ var n = Math.max(0, Math.round(num(i.value))); if (n) v[i.getAttribute('data-tg')] = n; });
      if (!isAdmin()) { toast('Only an admin sets the team goals.', true); return; }
      kvPut('gc_tv_goals', v).then(function(ok){ if (ok) { CACHE.goals.v = v; CACHE.goals.at = Date.now(); lsSet('gc_tv_goals_cache', v); } toast(ok ? '🏁 Team goals saved' : 'Could not save the team goals.', !ok); }); });
    if (goalBar && goalBar.parentNode) goalBar.parentNode.insertBefore(c, goalBar.nextSibling); else box.appendChild(c);
    pullGoals().then(function(v){ v = obj(v); Array.prototype.forEach.call(c.querySelectorAll('[data-tg]'), function(i){ if (D.activeElement !== i) i.value = v[i.getAttribute('data-tg')] || ''; }); });
  }
  if (!D.getElementById('gc-otv-lobbycard')) {
    var l = D.createElement('div'); l.id = 'gc-otv-lobbycard'; l.className = 'gcx10-bar'; l.style.borderLeftColor = '#0F1D2F';
    l.innerHTML = '<span><b>📺 Lobby TV</b> · the front-room screen for customers: slides, photos, reviews, offers, the lobby link</span><button type="button" data-otv="lobby">Open</button>' +
      '<button type="button" data-otv="tv" style="margin-left:6px">📺 Office TV</button>';
    l.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-otv]'); if (!b) return; if (b.getAttribute('data-otv') === 'lobby') LOB.open(); else open(); });
    var ref = D.getElementById('gc-otv-goals'); if (ref && ref.parentNode) ref.parentNode.insertBefore(l, ref.nextSibling); else box.appendChild(l);
  }
}
every(function(){ try { adminCards(); } catch (e) {} }, 1200);

/* ═════════════════════════════ 📺 LOBBY TV — the editor ═════════════════════════════ */
var LCSS = '#gc-lob{position:fixed;inset:0;z-index:2147482000;background:rgba(15,29,47,.55);display:flex;align-items:stretch;justify-content:center;font:14px/1.4 Inter,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0F1D2F}' +
  '#gc-lob .win{background:#F7F4EC;margin:18px;border-radius:16px;flex:1;max-width:1500px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
  '#gc-lob .top{display:flex;align-items:center;gap:12px;padding:14px 20px;background:#0F1D2F;color:#fff}#gc-lob .top b{font-size:18px}#gc-lob .top .sp{flex:1}' +
  '#gc-lob .tabs{display:flex;gap:6px}#gc-lob .tabs button{all:unset;cursor:pointer;padding:7px 14px;border-radius:9px;color:#C9D4E3;font-weight:700}#gc-lob .tabs button.on{background:#D4A017;color:#0F1D2F}' +
  '#gc-lob .x{all:unset;cursor:pointer;font-size:20px;padding:2px 8px;color:#fff}' +
  '#gc-lob .body{flex:1;display:flex;min-height:0}' +
  '#gc-lob .side{width:360px;border-right:1px solid #E5DCC3;display:flex;flex-direction:column;background:#fff;min-height:0}' +
  '#gc-lob .side .hdr{padding:12px 14px;border-bottom:1px solid #EFE7D2;display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
  '#gc-lob .list{flex:1;overflow:auto;padding:8px}' +
  '#gc-lob .it{display:flex;align-items:center;gap:8px;padding:8px 8px;border-radius:10px;border:1px solid transparent;cursor:pointer}#gc-lob .it:hover{background:#FBF7EC}#gc-lob .it.sel{background:#FFF6DA;border-color:#E9C766}' +
  '#gc-lob .it .n{flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gc-lob .it .n small{display:block;font-weight:500;color:#7B8494}#gc-lob .it.off .n{opacity:.45}' +
  '#gc-lob .it .k{all:unset;cursor:pointer;padding:2px 6px;border-radius:6px;color:#5A6678}#gc-lob .it .k:hover{background:#EEE6CF}' +
  '#gc-lob .main{flex:1;overflow:auto;padding:16px 20px;min-width:0}' +
  '#gc-lob .pv{position:relative;width:100%;max-width:880px;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#0B1626;box-shadow:0 6px 24px rgba(0,0,0,.18)}' +
  '#gc-lob .pv iframe{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0}' +
  '#gc-lob .fld{margin:10px 0}#gc-lob .fld label{display:block;font-weight:700;margin-bottom:4px}#gc-lob .fld small{color:#7B8494;font-weight:500}' +
  '#gc-lob input[type=text],#gc-lob input[type=url],#gc-lob input[type=date],#gc-lob input[type=number],#gc-lob textarea,#gc-lob select{width:100%;padding:8px 10px;border:1px solid #D9CFB3;border-radius:8px;font:inherit;background:#fff}' +
  '#gc-lob textarea{min-height:80px;resize:vertical}' +
  '#gc-lob .btn{all:unset;cursor:pointer;display:inline-block;padding:8px 14px;border-radius:9px;background:#0F1D2F;color:#fff;font-weight:700}#gc-lob .btn.g{background:#D4A017;color:#0F1D2F}#gc-lob .btn.w{background:#fff;color:#0F1D2F;border:1px solid #D9CFB3}#gc-lob .btn.r{background:#B42318}' +
  '#gc-lob .row2{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}#gc-lob .row2>*{flex:1;min-width:220px}' +
  '#gc-lob .lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}' +
  '#gc-lob .lib button{all:unset;cursor:pointer;background:#fff;border:1px solid #E5DCC3;border-radius:12px;padding:12px;display:flex;gap:10px;align-items:center;font-weight:700}#gc-lob .lib button:hover{border-color:#D4A017;background:#FFFBEF}' +
  '#gc-lob .lib h4{grid-column:1/-1;margin:10px 0 0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#A07A0C}' +
  '#gc-lob .phs{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}#gc-lob .phs label{position:relative;display:block;aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:#E9E3D2;cursor:pointer;border:2px solid transparent}' +
  '#gc-lob .phs label.on{border-color:#D4A017}#gc-lob .phs img{width:100%;height:100%;object-fit:cover}#gc-lob .phs input{position:absolute;left:6px;top:6px}#gc-lob .phs span{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 5px}' +
  '#gc-lob .card{background:#fff;border:1px solid #E5DCC3;border-radius:12px;padding:14px;margin:10px 0}' +
  '#gc-lob .mut{color:#7B8494}#gc-lob .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:12px;font-weight:700;background:#EEE6CF}#gc-lob .tag.ok{background:#E7F6EC;color:#13753A}#gc-lob .tag.wait{background:#FFF1D6;color:#9A5B00}' +
  '#gc-lob .full{position:fixed;inset:0;background:#000;z-index:2147482100;display:flex;align-items:center;justify-content:center}#gc-lob .full iframe{border:0;width:100vw;height:56.25vw;max-height:100vh;max-width:177.78vh}#gc-lob .full button{position:absolute;right:16px;top:12px;z-index:2}';
var LOB = { el: null };
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function TYPES(){ return W.GC_LOBBY_TYPES || null; }
function loadTypes(){
  if (TYPES()) return Promise.resolve(TYPES());
  return new Promise(function(res){ var sc = D.createElement('script'); sc.src = '/lobby-types.js'; sc.onload = function(){ res(TYPES()); }; sc.onerror = function(){ res(null); }; D.head.appendChild(sc); });
}
function newToken(){ var b = new Uint8Array(32); (W.crypto || W.msCrypto).getRandomValues(b); var x = ''; for (var i = 0; i < b.length; i++) x += String.fromCharCode(b[i]); return btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function defaultDoc(TT){ return { v: 1, interval: 14, slides: TT.defaults.map(function(k){ return { id: uid('ls_'), type: k, on: true }; }), uploads: [] }; }
/* the approved photos the lobby may use: GrayCo Photos marked "Customer sees it" (the customer portal's own rule) */
function sharedOf(r){ return r.shared === true || (r.shared == null && s(r.tag) !== 'Damage'); }
function photoChoices(){
  return kvGet('gc_photos').then(function(v){
    var P = {}; projects().forEach(function(p){ P[p.id] = p; });
    var seen = {}, out = [];
    arr(v).forEach(function(r){
      if (!r || r.deleted === true || r.source === 'ccflag' || !/^sb:crm-files\//.test(s(r.ref))) return;
      if (!sharedOf(r)) return; if (r.source === 'sub' && !(r.shared === true && s(r.custOkBy))) return;
      var k = s(r.hash) || s(r.ref); if (seen[k]) return; seen[k] = 1;
      var p = P[s(r.jobId)]; out.push({ id: s(r.id), ref: s(r.thumbRef) || s(r.ref), tag: s(r.tag), at: s(r.at), job: p ? jobLabel(p) : 'Job' });
    });
    out.sort(function(a, b){ return a.at < b.at ? 1 : -1; });
    return out.slice(0, 160);
  });
}
function thumb(ref, img){ try { if (typeof W._gcFileUrl === 'function') Promise.resolve(W._gcFileUrl(ref)).then(function(u){ if (u) img.src = u; }, function(){}); } catch (e) {} }
LOB.open = function(tab){
  if (!lobbyOffers()) { toast('📺 Lobby TV is for admin, office and marketing.', true); return; }
  css();
  if (LOB.el) { try { LOB.el.remove(); } catch (e) {} }
  var canPlay = lobbyEditor(), canAccess = isAdmin() && allowed(), canApprove = isAdmin() && allowed();
  var st = { tab: tab || (canPlay ? 'play' : 'offers'), doc: null, offers: null, access: null, sel: 0, lib: false, photos: null, dirty: false, pvT: 0, reviews: [] };
  var el = D.createElement('div'); el.id = 'gc-lob'; LOB.el = el;
  el.innerHTML = '<div class="win"><div class="top"><b>📺 Lobby TV</b><span class="mut" style="color:#A9B7CA">the front-room screen for customers — no internal numbers, no customer names</span><span class="sp"></span><div class="tabs">' +
    (canPlay ? '<button type="button" data-tab="play">🎞 Playlist</button>' : '') + '<button type="button" data-tab="offers">🏷 Offers</button>' + (canAccess ? '<button type="button" data-tab="link">🔗 Lobby link</button>' : '') +
    '</div><button type="button" class="x" data-a="x" aria-label="Close">✕</button></div><div class="body" data-body><div style="padding:30px" class="mut">Loading…</div></div></div>';
  D.body.appendChild(el);
  var $ = function(q){ return el.querySelector(q); };
  function TT(){ return TYPES(); }
  function slide(){ return st.doc && st.doc.slides[st.sel]; }
  function offersList(){ var m = obj(st.offers && st.offers.offers); return Object.keys(m).map(function(k){ return m[k]; }).filter(function(o){ return o && !o.del; }).sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; }); }
  function draw(){
    Array.prototype.forEach.call(el.querySelectorAll('[data-tab]'), function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === st.tab); });
    var b = $('[data-body]');
    if (st.tab === 'play') b.innerHTML = playHtml(); else if (st.tab === 'offers') b.innerHTML = offersHtml(); else b.innerHTML = linkHtml();
    if (st.tab === 'play') { mountPreview(); if (st.photos == null) { st.photos = []; photoChoices().then(function(l){ st.photos = l; if (st.tab === 'play') { var f = $('[data-fields]'); if (f) f.innerHTML = fieldsHtml(); thumbs(); } }); } thumbs(); }
  }
  function thumbs(){ Array.prototype.forEach.call(el.querySelectorAll('img[data-ref]'), function(i){ if (!i.src) thumb(i.getAttribute('data-ref'), i); }); }
  /* ── playlist ── */
  function playHtml(){
    var T0 = TT(), d = st.doc, list = d.slides.map(function(x, i){ var t = T0.by[x.type] || { name: x.type, ic: '?' };
      return '<div class="it' + (i === st.sel ? ' sel' : '') + (x.on === false ? ' off' : '') + '" data-i="' + i + '"><input type="checkbox" data-on="' + i + '"' + (x.on !== false ? ' checked' : '') + ' title="Plays on the lobby TV"><span style="font-size:18px">' + t.ic + '</span><span class="n">' + (i + 1) + '. ' + esc(t.name) + (t.chk && !x.ok ? ' <span class="tag wait">edit me</span>' : '') + '<small>' + esc(s(x.h) || (t.d && t.d.h) || '') + '</small></span>' +
        '<button type="button" class="k" data-mu="' + i + '" title="Move up">↑</button><button type="button" class="k" data-dn="' + i + '" title="Move down">↓</button><button type="button" class="k" data-rm="' + i + '" title="Remove">✕</button></div>'; }).join('');
    var nOn = d.slides.filter(function(x){ return x.on !== false; }).length;
    var main = st.lib ? libHtml() : (slide() ? '<div class="row2" style="align-items:center;margin-bottom:10px"><div style="flex:3"><b style="font-size:17px">' + esc((T0.by[slide().type] || {}).ic) + ' ' + esc((T0.by[slide().type] || {}).name) + '</b> <span class="mut">— the live preview below is exactly what the lobby shows</span></div>' +
      '<div style="flex:0 0 auto;min-width:0"><button type="button" class="btn w" data-a="full">▶ Preview full rotation</button></div></div><div class="pv" data-pv><iframe data-if title="Slide preview" src="/lobby.html?preview=1"></iframe></div><div data-fields>' + fieldsHtml() + '</div>' : '<div class="mut">Pick a slide on the left, or add one from the library.</div>');
    return '<div class="side"><div class="hdr"><b>Playlist</b><span class="mut">' + nOn + ' playing</span><span style="flex:1"></span><label class="mut">Each slide <select data-iv style="width:auto">' + [12, 13, 14, 15].map(function(v){ return '<option' + (v === (+d.interval || 14) ? ' selected' : '') + ' value="' + v + '">' + v + ' s</option>'; }).join('') + '</select></label></div>' +
      '<div class="list">' + list + '</div><div class="hdr" style="border-top:1px solid #EFE7D2;border-bottom:0"><button type="button" class="btn w" data-a="lib">＋ Add from the library</button><span style="flex:1"></span><button type="button" class="btn g" data-a="save">Save</button></div></div>' +
      '<div class="main">' + main + '</div>';
  }
  function libHtml(){
    var T0 = TT(), cats = {}; T0.types.forEach(function(t){ (cats[t.cat] = cats[t.cat] || []).push(t); });
    return '<div class="row2" style="align-items:center"><b style="font-size:17px">📚 The slide library</b><span class="mut">' + T0.types.length + ' slide types — click one to add it to the playlist</span><span style="flex:0 0 auto;min-width:0"><button type="button" class="btn w" data-a="libx">Done</button></span></div>' +
      '<div class="lib">' + Object.keys(cats).map(function(c){ return '<h4>' + esc(c) + '</h4>' + cats[c].map(function(t){ return '<button type="button" data-add="' + esc(t.k) + '"><span style="font-size:22px">' + t.ic + '</span><span>' + esc(t.name) + '</span></button>'; }).join(''); }).join('') + '</div>';
  }
  function fieldsHtml(){
    var x = slide(); if (!x) return ''; var t = TT().by[x.type] || { f: [], d: {} }, d = t.d || {}, h = '';
    function inp(k, label, type, ph){ return '<div class="fld"><label>' + label + '</label><input type="' + (type || 'text') + '" data-f="' + k + '" value="' + esc(x[k] || '') + '" placeholder="' + esc(ph != null ? ph : (d[k] || '')) + '"></div>'; }
    t.f.forEach(function(k){
      if (k === 'h') h += inp('h', 'Headline');
      else if (k === 'sub') h += inp('sub', 'Subhead');
      else if (k === 't') h += '<div class="fld"><label>Text</label><textarea data-f="t" placeholder="' + esc(d.t || '') + '">' + esc(x.t || '') + '</textarea></div>';
      else if (k === 'items') h += '<div class="fld"><label>List <small>(one per line)</small></label><textarea data-f="items" placeholder="' + esc(arr(d.items).join('\n')) + '">' + esc(arr(x.items).join('\n')) + '</textarea></div>';
      else if (k === 'url') h += '<div class="row2">' + inp('url', 'QR code link', 'url') + inp('label', 'QR caption', 'text', d.label || '') + '</div>';
      else if (k === 'end') h += inp('end', 'End date', 'date');
      else if (k === 'rating') h += '<div class="row2">' + inp('rating', 'Google rating (e.g. 4.9)', 'number', '') + inp('count', 'Number of reviews', 'number', '') + '</div>';
      else if (k === 'offer') { h += '<div class="fld"><label>Offer</label><select data-f="offer"><option value="">The first live offer</option>' + offersList().map(function(o){ return '<option value="' + esc(o.id) + '"' + (x.offer === o.id ? ' selected' : '') + '>' + esc(o.h) + (o.on ? '' : ' (not on the lobby)') + '</option>'; }).join('') + '</select><small>Offers are made in the 🏷 Offers tab.</small></div>'; }
      else if (k === 'reviews') { var R5 = st.reviews.filter(function(r){ return (+r.rating || 0) >= 5 && s(r.text); });
        h += '<div class="fld"><label>5★ reviews <small>(none picked = the newest; shown as first name + last initial)</small></label>' + (R5.length ? R5.slice(0, 40).map(function(r){ return '<label style="font-weight:500;display:flex;gap:8px;align-items:flex-start;margin:4px 0"><input type="checkbox" data-rv="' + esc(r.id) + '"' + (arr(x.reviews).indexOf(r.id) >= 0 ? ' checked' : '') + '><span><b>' + esc(shortName(r.author)) + '</b> — ' + esc(s(r.text).slice(0, 140)) + '</span></label>'; }).join('') : '<div class="mut">No 5★ reviews in 📣 Marketing → Reviews yet — the slide shows a “read our reviews” QR until there are.</div>') + '</div>'; }
      else if (k === 'photos') h += photosHtml(x, t.max || 6);
      else if (k === 'pairs') h += pairsHtml(x);
      else if (k === 'people') h += peopleHtml(x);
    });
    var chk = t.chk ? '<div class="card" style="background:#FFF6DA;border-color:#E9C766"><b>✎ Edit me</b> — ' + esc(t.chk) + '. The grey words are only a starting point, so this slide plays on the lobby only after someone checks it.<label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:700"><input type="checkbox" data-ok' + (x.ok ? ' checked' : '') + '> ✓ Checked — every word on this slide is true for GrayCo</label></div>' : '';
    return chk + '<div class="card">' + h + '<div class="mut" style="margin-top:8px">Empty fields use the text shown in grey. Never type a customer’s name or address, an insurance company’s name or a price that is not set — the lobby leaves such lines out.</div></div>';
  }
  function phLabel(id){ var p = (st.photos || []).filter(function(x){ return x.id === id; })[0]; return p ? p.job + (p.tag ? ' · ' + p.tag : '') : (/^up:/.test(id) ? 'Uploaded photo' : 'Photo'); }
  function photosHtml(x, max){
    var picked = arr(x.photos), list = st.photos || [];
    return '<div class="fld"><label>Photos <small>(up to ' + max + ' — only photos marked “Customer sees it” in GrayCo Photos, or one you upload here)</small></label>' +
      (list.length ? '<div class="phs">' + list.map(function(p){ var on = picked.indexOf(p.id) >= 0; return '<label class="' + (on ? 'on' : '') + '"><img data-ref="' + esc(p.ref) + '" alt=""><input type="checkbox" data-ph="' + esc(p.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(p.job + (p.tag ? ' · ' + p.tag : '')) + '</span></label>'; }).join('') + '</div>' : '<div class="mut">No customer-visible GrayCo photos yet' + (st.photos == null ? '' : '') + '.</div>') +
      '<div style="margin-top:8px">' + picked.filter(function(id){ return /^up:/.test(id); }).map(function(id){ return '<span class="tag ok" style="margin-right:6px">📎 uploaded photo <a href="#" data-unph="' + esc(id) + '">remove</a></span>'; }).join('') + '<label class="btn w" style="margin-top:6px">⬆ Upload a photo<input type="file" accept="image/*" data-up="photos" hidden></label></div></div>';
  }
  function pairsHtml(x){
    var opts = function(sel){ return '<option value="">— pick —</option>' + (st.photos || []).map(function(p){ return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.job + (p.tag ? ' · ' + p.tag : '') + ' · ' + s(p.at).slice(0, 10)) + '</option>'; }).join(''); };
    return '<div class="fld"><label>Before / after pairs <small>(each showing takes the next pair; caption = what + the city only, e.g. “Roof replacement · Bartlett”)</small></label>' + arr(x.pairs).map(function(pr, i){
      return '<div class="row2" style="margin:6px 0"><select data-pr="' + i + '" data-pk="b">' + opts(pr.b) + '</select><select data-pr="' + i + '" data-pk="a">' + opts(pr.a) + '</select><input type="text" data-pr="' + i + '" data-pk="cap" value="' + esc(pr.cap || '') + '" placeholder="Roof replacement · Bartlett"><button type="button" class="btn w" style="flex:0 0 auto;min-width:0" data-prx="' + i + '">✕</button></div>'; }).join('') +
      '<button type="button" class="btn w" data-a="pair">＋ Add a pair</button>' + ((st.photos || []).length ? '' : ' <span class="mut">No customer-visible photos yet — the preview shows empty frames; the lobby skips this slide until a pair is set.</span>') + '</div>';
  }
  function peopleHtml(x){
    return '<div class="fld"><label>People <small>(up to 5 — first names are fine)</small></label>' + arr(x.people).map(function(p, i){
      return '<div class="row2" style="margin:6px 0"><input type="text" data-pp="' + i + '" data-pk="name" value="' + esc(p.name || '') + '" placeholder="Name"><input type="text" data-pp="' + i + '" data-pk="role" value="' + esc(p.role || '') + '" placeholder="Role"><label class="btn w" style="flex:0 0 auto;min-width:0">' + (p.photo ? '✓ photo' : '⬆ photo') + '<input type="file" accept="image/*" data-up="person" data-i="' + i + '" hidden></label><button type="button" class="btn w" style="flex:0 0 auto;min-width:0" data-ppx="' + i + '">✕</button></div>'; }).join('') +
      '<button type="button" class="btn w" data-a="person">＋ Add a person</button></div>';
  }
  function mountPreview(){
    var pv = $('[data-pv]'), ifr = $('[data-if]'); if (!pv || !ifr) return;
    function fit(){ var w = pv.getBoundingClientRect().width; ifr.style.transform = 'scale(' + (w / 1920) + ')'; }
    fit(); later(fit, 50);
    ifr.addEventListener('load', function(){ preview(); });
  }
  function preview(full){
    CT.call(W, st.pvT);
    st.pvT = later(function(){
      var target = full ? (el.querySelector('.full iframe')) : $('[data-if]'); if (!target) return;
      var only = full ? null : st.sel;
      fn('lobby', { action: 'preview', lobby: st.doc, offers: st.offers, only: only }).then(function(r){
        if (!r || !r.ok) { toast((r && r.error) || 'The preview could not be made.', true); return; }
        try { target.contentWindow.postMessage({ gcLobby: 'data', data: r.data, only: r.only == null ? null : r.only }, location.origin); } catch (e) {}
      });
    }, full ? 0 : 450);
  }
  /* ── offers ── */
  function offersHtml(){
    var L = offersList(), md = mktDoc(), camps = obj(md.campaigns), cp = obj(obj(md.cfg).coupons);
    var have = {}; L.forEach(function(o){ have[o.src || ''] = o; });
    var mk = '<div class="card"><b>📣 From Marketing</b><div class="mut">Turn one on and it becomes a lobby offer (edit its words below). It stops on its end date.</div>' +
      '<div style="margin-top:8px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-src="coupon"' + (have.coupon && have.coupon.on ? ' checked' : '') + '> 🎟 The $' + esc(cp.amount || 100) + '-off coupon <span class="mut">(coupon page QR)</span> — 📺 Show on lobby TV</label>' +
      Object.keys(camps).map(function(k){ var c = camps[k]; if (!c || c.del) return ''; return '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-src="campaign:' + esc(k) + '"' + (have['campaign:' + k] && have['campaign:' + k].on ? ' checked' : '') + '> 📣 ' + esc(c.name || c.subject || 'Campaign') + ' — 📺 Show on lobby TV</label>'; }).join('') + '</div></div>';
    var rows = L.map(function(o){
      var ended = s(o.end) && s(o.end) < today();
      return '<div class="card" data-oid="' + esc(o.id) + '"><div class="row2" style="align-items:center"><label style="flex:0 0 auto;min-width:0;display:flex;gap:6px;align-items:center;font-weight:700"><input type="checkbox" data-oon' + (o.on ? ' checked' : '') + '> 📺 Show on lobby TV</label>' +
        '<span style="flex:0 0 auto;min-width:0">' + (o.pending ? '<span class="tag wait">waiting for an admin’s approval</span>' : '<span class="tag ok">approved</span>') + (ended ? ' <span class="tag">ended</span>' : '') + '</span><span></span>' +
        (o.pending && canApprove ? '<button type="button" class="btn g" style="flex:0 0 auto;min-width:0" data-oap>✓ Approve</button>' : '') + '<button type="button" class="btn w" style="flex:0 0 auto;min-width:0" data-orm>Delete</button></div>' +
        '<div class="row2"><div class="fld"><label>Headline</label><input type="text" data-o="h" value="' + esc(o.h) + '" placeholder="$100 off GrayCo work"></div><div class="fld"><label>Ends on</label><input type="date" data-o="end" value="' + esc(o.end || '') + '"></div></div>' +
        '<div class="fld"><label>Offer text</label><input type="text" data-o="t" value="' + esc(o.t || '') + '" placeholder="On projects over $1,000"></div><div class="fld"><label>Fine print</label><input type="text" data-o="fine" value="' + esc(o.fine || '') + '"></div>' +
        '<div class="row2"><div class="fld"><label>QR link</label><input type="url" data-o="url" value="' + esc(o.url || '') + '" placeholder="https://crm.grayco-cs.com/coupon.html"></div><div class="fld"><label>QR caption</label><input type="text" data-o="label" value="' + esc(o.label || '') + '" placeholder="Scan to claim"></div></div></div>';
    }).join('');
    return '<div class="main"><div class="row2" style="align-items:center"><div style="flex:3"><b style="font-size:17px">🏷 Offers & promotions</b> <span class="mut">— shown by the 🏷 Current offer and 🎠 Promo rotation slides' + (isMM() && !allowed() ? '. Your offers go live once an admin approves them (marketing approval rule).' : '.') + '</span></div><div style="flex:0 0 auto;min-width:0"><button type="button" class="btn w" data-a="newoffer">＋ New offer</button> <button type="button" class="btn g" data-a="saveoffers">Save offers</button></div></div>' + mk + (rows || '<div class="mut" style="margin-top:12px">No offers yet.</div>') + '</div>';
  }
  /* ── the lobby link ── */
  function linkHtml(){
    var a = st.access || {}, url = a.on && a.token ? location.origin + '/lobby.html#t=' + a.token : '';
    return '<div class="main"><div class="card" style="max-width:820px"><b style="font-size:17px">🔗 The lobby link</b><p class="mut">The lobby screen is NOT a signed-in CRM: it opens this link (on the lobby TV stick or computer) and shows only the playlist. Nobody can get from it into the CRM. Turn it off or make a new link and the old one stops at once.</p>' +
      (url ? '<div class="fld"><label>Lobby link <span class="tag ok">ON</span></label><input type="text" readonly value="' + esc(url) + '" data-link></div><div class="row2"><button type="button" class="btn" data-a="copy" style="flex:0 0 auto;min-width:0">Copy link</button><button type="button" class="btn w" data-a="newlink" style="flex:0 0 auto;min-width:0">Make a new link (the old one stops)</button><button type="button" class="btn r" data-a="off" style="flex:0 0 auto;min-width:0">Turn the lobby off</button></div>' +
        '<p class="mut" style="margin-top:10px">Made ' + esc(s(a.at).slice(0, 10)) + (a.by ? ' by ' + esc(a.by) : '') + '. Tip: open it in full screen (click once on the TV) — the screen stays awake.</p>' :
        '<p><span class="tag">OFF</span> The lobby shows nothing.</p><button type="button" class="btn g" data-a="newlink">Turn the lobby on — make the link</button>') + '</div></div>';
  }
  function saveDoc(){ st.doc.at = nowIso(); st.doc.by = me(); return kvPut('gc_lobby', st.doc).then(function(ok){ st.dirty = !ok; toast(ok ? '📺 Lobby playlist saved' : 'Could not save the playlist.', !ok); return ok; }); }
  function saveOffers(){ st.offers.at = nowIso(); return kvPut('gc_lobby_offers', st.offers).then(function(ok){ toast(ok ? '🏷 Offers saved' : 'Could not save the offers.', !ok); return ok; }); }
  function saveAccess(a){ st.access = a; return kvPut('gc_lobby_access', a).then(function(ok){ toast(ok ? (a.on ? '🔗 The lobby link is on' : 'The lobby is off — the old link shows nothing') : 'Could not save.', !ok); draw(); return ok; }); }
  function setOffer(id, patch){ var m = st.offers.offers = obj(st.offers.offers); var o = m[id] || { id: id }; Object.assign(o, patch, { at: nowIso(), by: me() }); if (!allowed() && isMM()) o.pending = true; m[id] = o; return o; }
  function upload(file){
    if (!file || typeof W._gcStoreFile !== 'function') { toast('Uploading is not available on this computer.', true); return Promise.resolve(''); }
    toast('Uploading…');
    return Promise.resolve(W._gcStoreFile(file, { kind: 'doc', name: file.name })).then(function(m){ var ref = s(m && m.ref); if (!ref) throw new Error('no file'); st.doc.uploads = arr(st.doc.uploads).concat([ref]); return ref; }).catch(function(e){ toast('Upload failed: ' + s(e && e.message), true); return ''; });
  }
  /* ── events ── */
  el.addEventListener('click', function(e){
    var t = e.target; if (!t || !t.closest) return;
    var b = t.closest('[data-tab],[data-a],[data-mu],[data-dn],[data-rm],[data-add],[data-prx],[data-ppx],[data-oap],[data-orm],[data-unph],[data-i]'); if (!b) return;
    if (b.hasAttribute('data-tab')) { st.tab = b.getAttribute('data-tab'); st.lib = false; draw(); return; }
    var a = b.getAttribute('data-a');
    if (a === 'x') { if (st.dirty && !W.confirm('Close without saving the playlist?')) return; el.remove(); LOB.el = null; return; }
    if (a === 'lib') { st.lib = true; draw(); return; } if (a === 'libx') { st.lib = false; draw(); return; }
    if (a === 'save') { saveDoc(); return; }
    if (a === 'full') { var f = D.createElement('div'); f.className = 'full'; f.innerHTML = '<button type="button" class="btn g" data-a="fullx">✕ Close preview</button><iframe title="Full rotation" src="/lobby.html?preview=1"></iframe>'; el.appendChild(f); f.querySelector('iframe').addEventListener('load', function(){ preview(true); }); return; }
    if (a === 'fullx') { var ff = el.querySelector('.full'); if (ff) ff.remove(); return; }
    if (a === 'pair') { var x = slide(); x.pairs = arr(x.pairs).concat([{ b: '', a: '', cap: '' }]); st.dirty = true; $('[data-fields]').innerHTML = fieldsHtml(); return; }
    if (a === 'person') { var y = slide(); y.people = arr(y.people).concat([{ name: '', role: '' }]).slice(0, 5); st.dirty = true; $('[data-fields]').innerHTML = fieldsHtml(); return; }
    if (a === 'newoffer') { setOffer(uid('of_'), { h: '', on: false, src: 'custom' }); draw(); return; }
    if (a === 'saveoffers') { saveOffers(); return; }
    if (a === 'copy') { var li = $('[data-link]'); try { navigator.clipboard.writeText(li.value).then(function(){ toast('Link copied'); }, function(){ li.select(); }); } catch (x2) { li.select(); } return; }
    if (a === 'newlink') { saveAccess({ on: true, token: newToken(), at: nowIso(), by: me() }); return; }
    if (a === 'off') { if (W.confirm('Turn the lobby off? The lobby TV goes blank until you make a new link.')) saveAccess({ on: false, token: '', at: nowIso(), by: me() }); return; }
    if (b.hasAttribute('data-add')) { st.doc.slides.push({ id: uid('ls_'), type: b.getAttribute('data-add'), on: true }); st.sel = st.doc.slides.length - 1; st.lib = false; st.dirty = true; draw(); return; }
    var i;
    if (b.hasAttribute('data-mu')) { i = +b.getAttribute('data-mu'); if (i > 0) { var su = st.doc.slides.splice(i, 1)[0]; st.doc.slides.splice(i - 1, 0, su); st.sel = i - 1; st.dirty = true; draw(); } return; }
    if (b.hasAttribute('data-dn')) { i = +b.getAttribute('data-dn'); if (i < st.doc.slides.length - 1) { var sl = st.doc.slides.splice(i, 1)[0]; st.doc.slides.splice(i + 1, 0, sl); st.sel = i + 1; st.dirty = true; draw(); } return; }
    if (b.hasAttribute('data-rm')) { i = +b.getAttribute('data-rm'); st.doc.slides.splice(i, 1); st.sel = Math.max(0, Math.min(st.sel, st.doc.slides.length - 1)); st.dirty = true; draw(); return; }
    if (b.hasAttribute('data-prx')) { var z = slide(); z.pairs.splice(+b.getAttribute('data-prx'), 1); st.dirty = true; $('[data-fields]').innerHTML = fieldsHtml(); preview(); return; }
    if (b.hasAttribute('data-ppx')) { var q = slide(); q.people.splice(+b.getAttribute('data-ppx'), 1); st.dirty = true; $('[data-fields]').innerHTML = fieldsHtml(); preview(); return; }
    if (b.hasAttribute('data-unph')) { e.preventDefault(); var u = slide(); u.photos = arr(u.photos).filter(function(x){ return x !== b.getAttribute('data-unph'); }); st.dirty = true; $('[data-fields]').innerHTML = fieldsHtml(); thumbs(); preview(); return; }
    var card = b.closest('[data-oid]');
    if (card && b.hasAttribute('data-oap')) { var o = st.offers.offers[card.getAttribute('data-oid')]; if (o) { o.pending = false; o.approvedBy = me(); o.approvedAt = nowIso(); } saveOffers().then(draw); return; }
    if (card && b.hasAttribute('data-orm')) { var o2 = st.offers.offers[card.getAttribute('data-oid')]; if (o2 && W.confirm('Delete this offer?')) { o2.del = true; o2.on = false; o2.at = nowIso(); saveOffers().then(draw); } return; }
    if (b.hasAttribute('data-i') && !t.closest('input,button')) { i = +b.getAttribute('data-i'); if (i === st.sel && !st.lib) return; st.sel = i; st.lib = false; draw(); return; }
  });
  el.addEventListener('change', function(e){
    var t = e.target; if (!t || !t.getAttribute) return;
    if (t.hasAttribute('data-iv')) { st.doc.interval = +t.value || 14; st.dirty = true; return; }
    if (t.hasAttribute('data-on')) { st.doc.slides[+t.getAttribute('data-on')].on = !!t.checked; st.dirty = true; draw(); return; }
    var x = slide();
    if (t.hasAttribute('data-ok')) { x.ok = !!t.checked; st.dirty = true; draw(); return; }
    if (t.hasAttribute('data-ph')) { var id = t.getAttribute('data-ph'), max = (TT().by[x.type] || {}).max || 6, l = arr(x.photos).filter(function(v){ return v !== id; }); if (t.checked) l.push(id); if (l.length > max) l = l.slice(l.length - max); x.photos = l; st.dirty = true; $('[data-fields]').innerHTML = fieldsHtml(); thumbs(); preview(); return; }
    if (t.hasAttribute('data-rv')) { var rid = t.getAttribute('data-rv'), rl = arr(x.reviews).filter(function(v){ return v !== rid; }); if (t.checked) rl.push(rid); x.reviews = rl.slice(-((TT().by[x.type] || {}).max || 6)); st.dirty = true; preview(); return; }
    if (t.hasAttribute('data-up')) { var f = t.files && t.files[0], kind = t.getAttribute('data-up'), pi = +t.getAttribute('data-i');
      upload(f).then(function(ref){ if (!ref) return; if (kind === 'person') { x.people[pi].photo = 'up:' + ref; } else { var mx = (TT().by[x.type] || {}).max || 6; x.photos = arr(x.photos).concat(['up:' + ref]).slice(-mx); } st.dirty = true; $('[data-fields]').innerHTML = fieldsHtml(); thumbs(); preview(); }); return; }
    if (t.hasAttribute('data-src')) { var src = t.getAttribute('data-src'), L = offersList().filter(function(o){ return o.src === src; })[0], md = mktDoc();
      if (L) setOffer(L.id, { on: !!t.checked });
      else if (src === 'coupon') { var cp = obj(obj(md.cfg).coupons); setOffer(uid('of_'), { src: 'coupon', on: !!t.checked, h: '$' + (cp.amount || 100) + ' off GrayCo work', t: 'On projects over $' + Number(cp.min || 1000).toLocaleString('en-US') + ' — one per household.', fine: 'Not combinable with other coupons or offers. Expires ' + (cp.days || 90) + ' days after it is issued.', url: location.origin + '/coupon.html?s=lobby', label: 'Claim your coupon' }); }
      else { var c = obj(obj(md.campaigns)[src.slice(9)]); setOffer(uid('of_'), { src: src, on: !!t.checked, h: s(c.name || c.subject).slice(0, 80), t: s(c.offer || c.preheader || '').slice(0, 200) }); }
      draw(); return; }
    var card = t.closest && t.closest('[data-oid]');
    if (card) { var o = st.offers.offers[card.getAttribute('data-oid')]; if (!o) return; if (t.hasAttribute('data-oon')) setOffer(o.id, { on: !!t.checked }); else if (t.getAttribute('data-o')) { var pt = {}; pt[t.getAttribute('data-o')] = s(t.value); setOffer(o.id, pt); } return; }
  });
  el.addEventListener('input', function(e){
    var t = e.target, x = slide(); if (!t || !t.getAttribute || !x) return;
    var k = t.getAttribute('data-f');
    if (k) { if (k === 'items') x.items = s(t.value).split('\n').map(s).filter(Boolean); else x[k] = t.value; st.dirty = true; var n = el.querySelector('.it.sel small'); if (k === 'h' && n) n.textContent = t.value; preview(); return; }
    if (t.hasAttribute('data-pr')) { x.pairs[+t.getAttribute('data-pr')][t.getAttribute('data-pk')] = t.value; st.dirty = true; preview(); return; }
    if (t.hasAttribute('data-pp')) { x.people[+t.getAttribute('data-pp')][t.getAttribute('data-pk')] = t.value; st.dirty = true; preview(); return; }
  });
  Promise.all([loadTypes(), kvGet('gc_lobby'), kvGet('gc_lobby_offers'), canAccess ? kvGet('gc_lobby_access') : Promise.resolve(null), pullMkt(true)]).then(function(r){
    if (!r[0]) { $('[data-body]').innerHTML = '<div style="padding:30px">The slide library (lobby-types.js) could not be loaded.</div>'; return; }
    var doc = obj(r[1]); st.doc = arr(doc.slides).length ? doc : defaultDoc(r[0]); st.doc.slides = arr(st.doc.slides);
    st.offers = obj(r[2]); st.offers.offers = obj(st.offers.offers); st.access = obj(r[3]); st.reviews = reviews();
    if (!canPlay && st.tab === 'play') st.tab = 'offers';
    draw();
  });
  return el;
};
W._gcLobbyAdmin = { open: function(tab){ return LOB.open(tab); }, canSee: lobbyOffers };
W._gcOTV = { _adm: adminCards, open: open, close: close, allowed: allowed, state: function(){ return TV ? TV.__state() : null; }, el: function(){ return TV; }, data: function(k){ return k === 'board2' ? DATA.board('quarter') : DATA[k] ? DATA[k](k === 'board' ? cfgLoad().period : undefined) : null; } };
try { console.log('[GC] Office TV + Lobby TV editor ready (patch OFFICETV): _gcOTV.open() · _gcLobbyAdmin.open() · link #tv'); } catch (e) {}
})();
