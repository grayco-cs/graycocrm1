/* ═══ patch LEADSUI — the Leads screen, organized (owner 10/28: "very new, needs to be more organized and easy to use,
   refined"; approved layout "build it"). Built on the LEADCOLS list code (columns · 🗑 · priority chip · Bid to).
   • header: Leads · one search · Board / List / Calendar / Map / Outreach (List first, always opens on List) · ⋯ More · ＋ New lead
   • chips: All · Bids · Residential · Insurance · Unassigned · Due this week (tap = narrow, tap again = clear) · Within … mi ·
     ✕ Clear. Nothing is remembered: every visit (and reload) opens on All.
   • three count boxes: Needs assigning · Due in 7 days · Not contacted (each toggles its filter)
   • one list: Lead | Due | Priority | Bid to | Stage | Assigned | Distance | 🗑 — soonest due, then priority; every header sorts
   • the lead panel: status (stage · priority · assigned · won / lost) → bid (due + where it came from · bid to · plans) →
     🏢 Bidding to (BIDSEND) → contact → notes & activity → the rest (sub bid portal, estimate & job) folded
   • a change shows at once (the changed lead is drawn from its new copy until the saved list has it) and is saved as before
   • speed: one model per (lead list, filters, distances) — nothing is redrawn while nothing changed; 60 rows, then "Show more"
   • the old manual Bid Board: its open bids (Open / Bidding / Submitted) become bid leads once (never twice: the id
     LBB_<bid id>, a deleted one stays deleted, the same name + address is not added again); the rest is kept, read-only,
     under ⋯ More → Old Bid Board */
var LU = { more: false, adv: false, rso0: false, t: {} }, NST0 = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
var REFID = typeof WeakMap === 'function' ? new WeakMap() : null, REFN = 0;
function refId(a){ if (!a || !REFID) return 0; var v = REFID.get(a); if (!v) { v = ++REFN; REFID.set(a, v); } return v; }
/* ── a change shows at once: the changed copy is drawn until the saved list carries it ── */
var OVL = {}, OVL_V = 0, OVL_N = 0, OVM = { b: null, v: -1, out: null };
function rawLeads(){
  var b = rawLeads0(); if (!OVL_N) return b;
  if (OVM.b === b && OVM.v === OVL_V && Date.now() - OVM.at < 5000) return OVM.out;
  /* the saved copy wins once it is as new as the change; the change is kept 20 s, so an older copy read back from this
     computer's disk in the meantime (a read started before the save landed) cannot bring the old values back */
  var hit = false, out = b.map(function(l){ var o = l && OVL[s(l.id)]; if (!o) return l; if (s(l.updatedAt) >= s(o.updatedAt)) { if (Date.now() - o.__ovAt > 20000) { delete OVL[s(l.id)]; OVL_N--; } return l; } hit = true; return o; });
  Object.keys(OVL).forEach(function(id){ if (Date.now() - OVL[id].__ovAt > 120000) { delete OVL[id]; OVL_N--; } });
  if (OVL_N < 0) OVL_N = 0;
  OVM = { b: b, v: OVL_V, out: hit ? out : b, at: Date.now() };
  return OVM.out;
}
function overlay(id, fn2){
  var l0 = rawLeads().filter(function(x){ return x && x.id === id; })[0]; if (!l0) return false;
  var l = Object.assign({}, l0); if (fn2(l) === false) return false;
  l.updatedAt = nowIso(); try { Object.defineProperty(l, '__ovAt', { value: Date.now(), enumerable: false }); } catch (e) {}
  if (!OVL[id]) OVL_N++; OVL[id] = l; OVL_V++; LD_C.ref = null;
  return true;
}
function patchLead(id, fn2){
  var shown = overlay(id, fn2);
  if (shown) { HUB_SIG = ''; try {   /* what the person is looking at first (the open panel, or the one row), the whole list right after */
    var tr = D.querySelector('#gc-leads-hub tr.gcl-lr[data-gcl-id="' + String(id).replace(/["\\]/g, '') + '"]'), done = false;
    if (UI.open === id && D.getElementById('gcl-drawer')) { if (LU.fast) { LU.fast = false; NST0.call(W, function(){ if (UI.open === id) openDrawer(id); }, 0); } else openDrawer(id); done = true; }
    else if (tr && UI.v === 'list') { var l1 = rawLeads().filter(function(x){ return x && x.id === id; })[0]; if (l1) { var r1 = lcRow(l1), tmp = D.createElement('tbody'); tmp.innerHTML = lcRowHtml(l1, r1, lcBidCell(l1, r1, GG.v || lcGcGroups()), lcCanDel(), Date.now()); if (tmp.firstChild) { held(function(){ tr.parentNode.replaceChild(tmp.firstChild, tr); }); done = true; } } }
    if (done) NST0.call(W, redraw, 30); else redraw();
  } catch (e) { warn(e); redraw(); } }
  return patchLead0(id, fn2).then(function(ok){ if (!ok && OVL[id]) { delete OVL[id]; OVL_N--; OVL_V++; LD_C.ref = null; redraw(); } return ok; });
}
W._gcLeadsUIOverlay = function(){ return Object.keys(OVL); };

/* ── distance (from the office — the company address setting — or from my location) ── */
var GEO = { ver: 0, mem: lsGet('gc_leads_geo_v1', {}) || {}, busy: false, at: 0, office: lsGet('gc_office_geo_v1', null), me: null, from: 'office', officeAsk: 0 };
var OFFICE_FALLBACK = { lat: 35.2046, lng: -89.8668, a: '4007 Broadway Rd, Bartlett, TN 38135' };
function gkey(a){ return low(a).replace(/[^a-z0-9]+/g, ' ').trim(); }
function officeAddr(){ try { var f = W._gcCompanyAddress; var a = typeof f === 'function' ? s(f()) : ''; if (a) return a; } catch (e) {} return OFFICE_FALLBACK.a; }
function addrOf(l){
  var a = s(l.address).trim(); if (!a) return '';
  [l.city, l.state, l.zip].forEach(function(x){ x = s(x).trim(); if (x && low(a).indexOf(low(x)) < 0) a += ', ' + x; });
  return a;
}
function numLL(la, ln){ la = +la; ln = +ln; return isFinite(la) && isFinite(ln) && la && ln && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? { lat: la, lng: ln } : null; }
function llOf(l){
  if (!l) return null;
  var g = numLL(l.geoLat, l.geoLng) || numLL(l.lat, l.lng) || numLL(l.latitude, l.longitude) || (l.geo && numLL(l.geo.lat, l.geo.lng)); if (g) return g;
  var a = addrOf(l); if (!a) return null;
  var m = GEO.mem[gkey(a)]; return m && m.lat != null ? m : null;
}
function origin(){
  if (GEO.from === 'me' && GEO.me) return GEO.me;
  var oa = officeAddr(), o = GEO.office;
  return o && o.a === oa && o.lat != null ? o : OFFICE_FALLBACK;   /* until the office address is looked up once */
}
function miles(a, b){ var R = 3958.8, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLn = (b.lng - a.lng) * r, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLn / 2) * Math.sin(dLn / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
function distOf(l){ var p = llOf(l), o = origin(); return p && o ? miles(o, p) : null; }
function miTxt(d){ return d == null ? '' : d < 10 ? d.toFixed(1).replace(/\.0$/, '') + ' mi' : Math.round(d) + ' mi'; }
function geoSave(){ var ks = Object.keys(GEO.mem); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach(function(k){ delete GEO.mem[k]; }); lsSet('gc_leads_geo_v1', GEO.mem); }
function geoCall(addrs){
  return W.fetch('/.netlify/functions/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addresses: addrs }) })
    .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; });
}
/* a few addresses at a time, never while hidden, never blocking: the rows on screen first, then (a distance filter / sort on) the rest */
function geoPump(rows){
  if (GEO.busy || D.hidden || navigator.onLine === false || Date.now() - GEO.at < 4000 || typeof W.fetch !== 'function') return;
  var oa = officeAddr();
  if (GEO.from === 'office' && !(GEO.office && GEO.office.a === oa) && Date.now() - GEO.officeAsk > 3600e3) {
    GEO.officeAsk = Date.now(); GEO.busy = true; GEO.at = Date.now();
    geoCall([oa]).then(function(j){ GEO.busy = false; var r = j && j.ok && arr(j.results)[0]; var g = r && numLL(r.lat, r.lng); if (g) { GEO.office = { a: oa, lat: g.lat, lng: g.lng }; lsSet('gc_office_geo_v1', GEO.office); GEO.ver++; redraw(); } });
    return;
  }
  var want = [], seen = {}, now = Date.now();
  arr(rows).some(function(l){ if (llOf(l)) return false; var a = addrOf(l), k = gkey(a); if (a.length < 6 || seen[k]) return false; var m = GEO.mem[k]; if (m && m.miss && now - m.miss < (m.soft ? 3600e3 : 7 * 864e5)) return false; seen[k] = 1; want.push(a); return want.length >= 20; });
  if (!want.length) return;
  GEO.busy = true; GEO.at = Date.now();
  geoCall(want).then(function(j){
    GEO.busy = false; var res = j && j.ok ? arr(j.results) : null, ch = false;
    want.forEach(function(a, i){ var g = res && res[i] && numLL(res[i].lat, res[i].lng); if (g) { GEO.mem[gkey(a)] = { lat: g.lat, lng: g.lng }; ch = true; } else GEO.mem[gkey(a)] = { miss: Date.now(), soft: !res }; });
    geoSave(); if (ch) { GEO.ver++; redraw(); }
  });
}
function useMyLocation(on){
  if (!on) { GEO.from = 'office'; GEO.ver++; redraw(); return; }
  if (!navigator.geolocation) { toast('This browser cannot share its location'); return; }
  navigator.geolocation.getCurrentPosition(function(p){ GEO.me = { lat: p.coords.latitude, lng: p.coords.longitude }; GEO.from = 'me'; GEO.ver++; redraw(); },
    function(){ toast('Location not allowed — distances stay from the office'); }, { maximumAge: 600000, timeout: 10000 });
}
W._gcLeadsGeo = { dist: function(id){ var l = rawLeads().filter(function(x){ return x.id === id; })[0]; return l ? distOf(l) : null; }, origin: origin, mem: function(){ return GEO.mem; }, pump: function(){ GEO.at = 0; geoPump(model().all); } };

/* ── the filters (chips, count boxes, distance, search) ── */
function kindOf(l){
  if (isBidL(l)) return 'bids';
  var k = ''; try { k = W._gcLeadRoles && W._gcLeadRoles.classify ? W._gcLeadRoles.classify(l) : ''; } catch (e) {}
  if (k === 'insurance' || typeOf(l) === 'insurance' || typeOf(l) === 'mitigation') return 'ins';
  var ts = typesOf(l); if (ts.indexOf('Insurance claim') >= 0 || ts.indexOf('Mitigation') >= 0 || ts.some(function(x){ return /^Restoration/.test(x); })) return 'ins';
  return 'res';
}
function weekEnd(){ var d = new Date(); d.setHours(23, 59, 59, 999); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return d.getTime(); }
function dayStart(){ var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function chipPass(l, now){
  if (UI.k && kindOf(l) !== UI.k) return false;
  if (UI.un && assignee(l)) return false;
  if (UI.wk) { var t = dueMs(l); if (!isFinite(t) || t < dayStart() || t > weekEnd()) return false; }
  if (UI.d7) { var t2 = dueMs(l); if (!isFinite(t2) || t2 < now || t2 - now > 7 * 864e5) return false; }
  if (UI.nc && (contacted(l) || closed(l))) return false;
  if (UI.mi) { var d = distOf(l); if (d == null || d > UI.mi) return false; }
  return true;
}
function anyFilter(){ return !!(UI.k || UI.un || UI.wk || UI.d7 || UI.nc || UI.mi || s(UI.q) || UI.who || UI.src || UI.type || UI.stage || UI.due || UI.prio || UI.role || UI.exp || UI.closed || UI.imp || UI.arch); }
function clearFilters(){ ['k', 'q', 'who', 'src', 'type', 'stage', 'due', 'prio', 'role'].forEach(function(k){ UI[k] = ''; }); ['un', 'wk', 'd7', 'nc', 'exp', 'closed', 'imp', 'arch'].forEach(function(k){ UI[k] = false; }); UI.mi = 0; MORE.ulist = 0; }

/* ── one model per (lead list, filters, distances): rows, counts, Bid-to groups ── */
var MD = { key: '', v: null };
function model(){
  var r = rawLeads(), sc = myScope();
  var key = [refId(r), OVL_V, sc.kind, sc.why, myName(), JSON.stringify([UI.k, UI.un, UI.wk, UI.d7, UI.nc, UI.mi, UI.q, UI.who, UI.src, UI.type, UI.stage, UI.due, UI.prio, UI.role, UI.exp, UI.closed, UI.imp, UI.arch, UI.preset, UI.lsort, UI.ldir]), GEO.ver, GEO.from, Object.keys(LC_GONE).length, s(inboxRaw()).length, Math.floor(Date.now() / 6e5)].join('|');
  if (MD.key === key && MD.v) return MD.v;
  var list = filtered().filter(function(l){ return !LC_GONE[s(l.id)]; }), now = Date.now();
  var base = scoped().filter(function(l){ return !importedL(l) && !shut(l) && !LC_GONE[s(l.id)]; });
  var cnt = { un: 0, d7: 0, nc: 0 };
  base.forEach(function(l){ if (!assignee(l)) cnt.un++; var t = dueMs(l); if (isFinite(t) && t >= now && t - now <= 7 * 864e5) cnt.d7++; if (!contacted(l)) cnt.nc++; });
  var v = { list: list, rows: null, cnt: cnt, all: list };
  MD = { key: key, v: v };
  return v;
}
function inboxRaw(){ try { return localStorage.getItem('gc_ldi_cache_v2') || ''; } catch (e) { return ''; } }
function modelRows(){ var m = model(); if (!m.rows) m.rows = lcSorted(m.list); return m.rows; }

/* ── the list (LEADCOLS code: Lead | Due | Priority | Bid to | Stage | Assigned | Distance | 🗑) ── */
var LC_COLS = [['name', 'Lead'], ['due', 'Due'], ['prio', 'Priority'], ['bidto', 'Bid to'], ['stage', 'Stage'], ['who', 'Assigned'], ['dist', 'Distance']];
var LC_PAGE = 60, LC_ROW = {}, LC_N = 0, LC_GONE = {};
function lcCanDel(){ try { var L = W._gcLDEL, me = L && L.who && L.who(); return !!(me && me.email && (me.all || me.est)); } catch (e) { return false; } }
function lcBidTo(l, role){
  var C = W._gcBidRoleCore || {}, isPub = function(v){ try { return !!(C.isPublic && C.isPublic(v)); } catch (e) { return false; } };
  var str = function(v){ return v && typeof v === 'object' ? s(v.name || v.company) : s(v); };
  var due = s(l.dueToCompany); if (due) return due;
  var gc = s(l.gc), ow = s(l.owner);
  if (role === 'sub' && gc) return gc;
  if (role === 'prime') { if (ow) return ow; var so = s(l.source || l.leadSource); if (so && isPub(so)) return so; }
  if (gc) return gc;
  if (ow) return ow;
  if (role === 'sub') { var em = arr(l.emails); for (var i = 0; i < em.length; i++) { var fn0 = s(em[i] && em[i].fromName); try { if (fn0 && C.isCompany && C.isCompany(fn0)) return fn0; } catch (e) {} } }
  return str(l.company) || str(l.client) || str(l.customer) || str(l.customerName) || '';
}
function heldOf(l){ try { return !assignee(l) && W._gcLeadHold && W._gcLeadHold.isHeld && W._gcLeadHold.isHeld(l) ? W._gcLeadHold.chip(l) : ''; } catch (e) { return ''; } }
function lcSig(l){ return [l.updatedAt, l.savedAt, l.stage, l.status, l.bidDue, l.priority, l.bidRole, l.name, l.title, l.address, l.city, l.source, l.leadSource, l.dueToCompany, l.gc, l.owner, typeof l.company === 'string' ? l.company : '', typeof l.client === 'string' ? l.client : '', l.inboxRev, l.pm, l.estimator, l.apm, l.hold && l.hold.state, GEO.ver, GEO.from, s(l.notes).length, l.lastNote && l.lastNote.at].join('|'); }
function lcRow(l){
  var id = s(l.id), sig = lcSig(l), r = LC_ROW[id];
  if (r && r.sig === sig) return r;
  if (++LC_N > 4000) { LC_ROW = {}; LC_N = 0; }
  var role = roleOfL(l), to = lcBidTo(l, role), st = stageOf(l), t = dueMs(l), p = prioOf(l), C = W._gcBidRoleCore || {}, gc = [], d = distOf(l), who = assignee(l);
  if (role !== 'prime') [s(l.dueToCompany), s(l.gc)].forEach(function(g){ var pb = false; try { pb = !!(C.isPublic && C.isPublic(g)); } catch (e) {} if (g && !pb) gc.push(g); });
  r = { sig: sig, to: to, stage: st, role: role, gc: gc, pk: (role === 'sub' || isBidL(l)) ? lcProjKey(l) : '', d: d, who: who,
    k: { name: low(l.name || l.title), due: isFinite(t) ? t : NaN, prio: p || NaN, bidto: low(to), stage: STAGES.indexOf(st), who: low(who) || NaN, dist: d == null ? NaN : d, born: receivedMs(l) || NaN },
    name: esc(s(l.name || l.title) || 'Lead'), addr: esc([l.address, l.city].filter(Boolean).join(', ')), ic: srcIc(l), note: (function(n){ return n ? { t: esc(s(n.text).slice(0, 160)), tip: esc(s(n.text).slice(0, 500) + (n.by || n.at ? ' — ' + [s(n.by), n.at ? new Date(n.at).toLocaleString() : ''].filter(Boolean).join(', ') : '')) } : null; })(lastNote(l)) };
  return (LC_ROW[id] = r);
}
function lcProjKey(l){ var n = low(l.name || l.title).replace(/^((re|fw|fwd|itb)\s*:\s*|invitation to bid\s*:?\s*|bid invitation\s*:?\s*|request for (bid|proposal)\s*:?\s*)+/, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); return n.length >= 6 ? n : ''; }
function lcCoKey(c){ return low(c).replace(/&/g, ' and ').replace(/[.,']/g, '').replace(/\b(inc|llc|co|corp|corporation|company|ltd|lp|pllc)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
/* the GCs we bid each lead to: its own (due-to / GC), its 🏢 Bidding to list, and those of the other leads for the same project */
var GG = { key: '', v: null };
function lcGcGroups(){
  var B = null; try { B = W._gcBidSend && W._gcBidSend._S && W._gcBidSend._S.bidders; } catch (e) {}
  var all = rawLeads(), key = refId(all) + '|' + OVL_V + '|' + (B ? JSON.stringify(B).length : 0) + '|' + GEO.ver;
  if (GG.key === key && GG.v) return GG.v;
  var byPk = {}, byId = {};
  all.forEach(function(l){
    if (dead(l)) return; var r = lcRow(l), own = {};
    var add = function(c){ c = s(c); var k = lcCoKey(c); if (k && !own[k]) own[k] = c; };
    r.gc.forEach(add);
    var rec = B && B['lead:' + l.id]; arr(rec && rec.list).forEach(function(b){ add(b && b.company); });
    byId[s(l.id)] = own;
    if (r.pk) { var g = byPk[r.pk] = byPk[r.pk] || {}; Object.keys(own).forEach(function(k){ if (!g[k]) g[k] = own[k]; }); }
  });
  GG = { key: key, v: { pk: byPk, id: byId } };
  return GG.v;
}
function lcBidCell(l, r, G){
  var own = G.id[s(l.id)] || {}, all = Object.assign({}, own, (r.pk && G.pk[r.pk]) || {}), names = Object.keys(all).map(function(k){ return all[k]; });
  if (names.length > 1) return { txt: names.length + ' GCs', names: names, k: low(names.length + ' gcs') };
  if (names.length === 1) return { txt: names[0], names: names, k: low(names[0]) };
  return { txt: r.to, names: [], k: low(r.to) };
}
function lcBlank(v){ return v == null || v === '' || v !== v; }
function lcSorted(list){
  var k = UI.lsort || 'due', dir = UI.ldir === -1 ? -1 : 1, G = lcGcGroups();
  var rows = list.map(function(l){ var r = lcRow(l), b = lcBidCell(l, r, G); return { l: l, r: r, b: b, kk: k === 'bidto' ? b.k : r.k[k] }; });
  /* ties (and the default): soonest due, then the highest priority, then the name */
  var tie = function(a, b){ var x = a.r.k.due, y = b.r.k.due, bx = lcBlank(x), by = lcBlank(y); if (bx !== by) return bx ? 1 : -1; if (!bx && x !== y) return x - y;
    var px = a.r.k.prio, py = b.r.k.prio, qx = lcBlank(px), qy = lcBlank(py); if (qx !== qy) return qx ? 1 : -1; if (!qx && px !== py) return py - px;
    return a.r.k.name < b.r.k.name ? -1 : a.r.k.name > b.r.k.name ? 1 : 0; };
  rows.sort(function(a, b){ if (k === 'due') { var c0 = tie(a, b); return dir < 0 && !lcBlank(a.kk) && !lcBlank(b.kk) && a.kk !== b.kk ? -c0 : c0; }
    var x = a.kk, y = b.kk, bx = lcBlank(x), by = lcBlank(y);
    if (bx || by) return bx && by ? tie(a, b) : bx ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir || tie(a, b); });
  return rows;
}
var LC_TF = {};
function lcTime(t){ var k = String(t); if (LC_TF[k] === undefined) { if (Object.keys(LC_TF).length > 2000) LC_TF = {}; LC_TF[k] = new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s?AM$/, 'a').replace(/\s?PM$/, 'p'); } return LC_TF[k]; }
function lcDue(l, r, now){
  var t = r.k.due; if (lcBlank(t)) return '<span class="gcl-dash">—</span>';
  var h = (t - now) / 36e5, raw = s(l.bidDue), timed = raw.length > 10;
  return '<span class="gcl-due' + (h < 0 ? ' od' : h < 72 ? ' soon' : '') + '" data-due="' + (h < 0 ? 'overdue' : h < 72 ? 'soon' : 'later') + '" title="Bid due ' + esc(raw.replace('T', ' ')) + (timed ? '' : ' (no time given)') + (h < 0 ? ' — overdue' : '') + '">' + esc(shortDay(t) + (timed ? ' ' + lcTime(t) : '')) + '</span>'
    + (timed ? '' : '<div class="gclu-nt">time not stated</div>');
}
function lcPrio(l){
  var p = prioOf(l), can = canPrio(l), cls = p >= 8 ? 'p-hi' : p >= 5 ? 'p-md' : p ? 'p-lo' : 'p-no';
  var tip = p ? 'Priority ' + p + ' of 10' : 'No priority yet';
  if (!can) return p ? '<span class="gcl-pc gcl-prio ' + cls + '" title="' + tip + '">' + p + '</span>' : '<span class="gcl-dash">—</span>';
  return '<button type="button" class="gcl-pc gcl-prio ' + cls + '" data-gcl-lprio="' + esc(l.id) + '" title="' + tip + ' — tap to set 1–10">' + (p ? p : 'SET') + '</button>';
}
function lcWho(l, r){
  var hc = heldOf(l), asg = canAssignAll();
  var inner = r.who ? '<span class="gclu-av">' + esc(initials(r.who)) + '</span> ' + esc(r.who) : hc ? hc : '<span class="gclu-un">Unassigned</span>';
  return asg ? '<button type="button" class="gclu-who" data-gcl-asg="' + esc(l.id) + '" title="Assign this lead">' + inner + '</button>' : inner;
}
function lcRowHtml(l, r, bc, del, now){
  var id = esc(l.id), cell = function(c, v, tip){ return '<td class="c-' + c + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + (v ? esc(v) : '<span class="gcl-dash">—</span>') + '</td>'; };
  return '<tr class="gcl-lr" data-gcl-id="' + id + '"><td class="c-name">'
    + '<button type="button" class="gclu-nb" data-gclu-note="' + id + '" title="Add a quick note" aria-label="Add a quick note">📝</button>'
    + '<b>' + r.ic + ' ' + r.name + '</b> ' + roleChip(l) + (r.addr ? '<div class="gcl-addr">' + r.addr + (r.d != null ? ' <span class="gclu-mi">· ' + miTxt(r.d) + '</span>' : '') + '</div>' : '')
    + (r.note ? '<div class="gclu-np" title="' + r.note.tip + '">📝 ' + r.note.t + '</div>' : '') + '</td>'
    + '<td class="c-due">' + lcDue(l, r, now) + '</td>'
    + '<td class="c-prio">' + lcPrio(l) + '</td>'
    + (bc.names.length > 1 ? '<td class="c-bidto" title="' + esc('Bid to ' + bc.names.length + ' GCs: ' + bc.names.join(' · ')) + '"><button type="button" class="gcl-gcs" data-gcl-gcs="' + esc(l.id) + '" data-names="' + esc(JSON.stringify(bc.names)) + '">🏢 ' + esc(bc.txt) + '</button></td>' : cell('bidto', bc.txt, bc.txt))
    + '<td class="c-stage">' + (STAGE_IC[r.stage] || '') + ' ' + esc(r.stage) + '</td>'
    + '<td class="c-who">' + lcWho(l, r) + '</td>'
    + '<td class="c-dist">' + (r.d != null ? esc(miTxt(r.d)) : '<span class="gcl-dash">—</span>') + '</td>'
    + (del ? '<td class="gcl-tc"><button type="button" class="gcl-del" data-gcl-del="' + id + '" title="Delete this lead" aria-label="Delete this lead">🗑</button></td>' : '')
    + '</tr>';
}
function uiListHtml(){
  var rows = modelRows(), del = lcCanDel(), k = UI.lsort || 'due', dir = UI.ldir === -1 ? -1 : 1, now = Date.now();
  var shown = rows.slice(0, lim('ulist', LC_PAGE));
  return '<div class="gcl-wrap"><table class="gcl-list gcl-lc gclu-list" data-gc-linked="1"><thead><tr>' + LC_COLS.map(function(c){ var on = k === c[0]; return '<th class="c-' + c[0] + '" data-gcl-lsort="' + c[0] + '"' + (on ? ' aria-sort="' + (dir > 0 ? 'ascending' : 'descending') + '"' : '') + ' title="Sort by ' + c[1] + '">' + c[1] + (on ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + (del ? '<th class="gcl-tc"><span class="gcl-sr">Delete</span></th>' : '') + '</tr></thead><tbody>'
    + shown.map(function(x){ return lcRowHtml(x.l, x.r, x.b, del, now); }).join('')
    + '</tbody></table></div>' + moreBtn('ulist', rows.length, LC_PAGE) + (rows.length ? '' : '<p class="gclu-empty">No leads match' + (anyFilter() ? ' — <button type="button" class="gclu-lnk" data-gclu-clear>✕ Clear the filters</button>' : '.') + '</p>');
}
function lcLead(id){ return leads().filter(function(x){ return x.id === id; })[0] || null; }
function lcAskDel(id){
  var l = lcLead(id); if (!l || !lcCanDel() || !W._gcLDEL) return;
  var old = D.getElementById('gcl-delq'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gcl-delq'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="b" role="dialog" aria-modal="true" aria-labelledby="gcl-delq-t"><div id="gcl-delq-t" class="q">Delete this lead?</div>'
    + '<div class="n">' + esc(s(l.name || l.title) || 'Lead') + '</div>'
    + '<div class="w">It is removed on every computer. Undo is offered for 5 seconds; after that an admin can bring it back from “Recently deleted” (30 days).</div>'
    + '<div class="a"><button type="button" data-a="cancel">Cancel</button><button type="button" data-a="delete">🗑 Delete</button></div></div>';
  function key(e){ if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } }
  function done(yes){ D.removeEventListener('keydown', key, true); ov.remove(); if (yes) lcDelete(id); }
  ov.addEventListener('click', function(e){ var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (e.target === ov || a === 'cancel') done(false); else if (a === 'delete') done(true); });
  D.addEventListener('keydown', key, true);
  D.body.appendChild(ov);
  try { ov.querySelector('[data-a=cancel]').focus(); } catch (e) {}
}
function lcDelete(id){
  LC_GONE[id] = 1; if (UI.open === id) closeDrawer(); redraw();
  Promise.resolve().then(function(){ return W._gcLDEL.remove([id], { silent: true }); }).then(function(res){
    if (!res || !res.ok) { delete LC_GONE[id]; redraw(); toast('Could not delete this lead — try again'); return; }
    HUB_SIG = ''; lcToast(id);
  }, function(){ delete LC_GONE[id]; redraw(); toast('Could not delete this lead — try again'); });
}
function lcToast(id){
  var old = D.getElementById('gcl-deltoast'); if (old) old.remove();
  var el = D.createElement('div'); el.id = 'gcl-deltoast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status');
  el.innerHTML = '<span>Deleted</span><span style="opacity:.5">·</span><button type="button" data-a="undo">Undo</button>';
  el.querySelector('[data-a=undo]').onclick = function(){
    el.remove();
    Promise.resolve(W._gcLDEL.restore([id])).then(function(r){ delete LC_GONE[id]; HUB_SIG = ''; redraw(); toast(r && r.ok ? 'Lead restored' : 'Could not undo — use “Recently deleted”'); }, function(){ delete LC_GONE[id]; redraw(); });
  };
  D.body.appendChild(el);
  later(function(){ if (el.parentNode) el.remove(); }, 5000);
}
function lcPop(btn, html, id, cls){
  lcPopClose();
  var pop = D.createElement('div'); pop.id = 'gcl-lprio-pop'; if (cls) pop.className = cls; pop.setAttribute('data-gc-keep', '1'); pop.innerHTML = html; if (id) pop.setAttribute('data-id', id);
  D.body.appendChild(pop);
  var bb = btn.getBoundingClientRect(), w = pop.offsetWidth, x = Math.max(8, Math.min(bb.left, (W.innerWidth || 800) - w - 8));
  pop.style.left = x + 'px'; pop.style.top = (bb.bottom + 4 + (W.scrollY || 0)) + 'px';
  return pop;
}
function lcPrioPop(btn){
  var id = btn.getAttribute('data-gcl-lprio'), l = lcLead(id); lcPopClose();
  if (!l || !canPrio(l)) return;
  var p = prioOf(l), h = '<div class="t">Priority (10 = most important)</div>';
  for (var i = 1; i <= 10; i++) h += '<button type="button" class="gcl-pb' + (i === p ? ' on' : '') + (i >= 8 ? ' hi' : i >= 5 ? ' md' : '') + '" data-lp="' + i + '">' + i + '</button>';
  var pop = lcPop(btn, h, id); pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Priority 1 to 10');
}
function lcGcsPop(btn){
  var names = []; try { names = JSON.parse(btn.getAttribute('data-names') || '[]'); } catch (e) {}
  var pop = lcPop(btn, '<div class="t">Bid to ' + names.length + ' GCs</div><ul>' + names.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>', '', 'gcl-gcpop');
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'GCs we bid this project to');
}
/* ── 📝 quick note (owner 10/28): one line, saved on the lead (notes + activity, who / when), shown at once; one write per note ── */
function lastNote(l){
  if (l.lastNote && s(l.lastNote.text)) return l.lastNote;
  var a = arr(l.activity); for (var i = a.length - 1; i >= 0; i--) if (a[i] && a[i].type === 'note' && s(a[i].text)) return { text: s(a[i].text), at: a[i].at, by: a[i].by };
  var n = s(l.notes).trim(); if (n) { var ln = n.split('\n'); return { text: ln[ln.length - 1] }; }
  return null;
}
function saveNote(id, txt){
  txt = s(txt).replace(/\s+/g, ' ').trim().slice(0, 500); if (!id || !txt) return Promise.resolve(false);
  var at = nowIso(), by = myName() || myEmail();
  return patchLead(id, function(l){ logAct(l, 'note', txt); l.notes = (s(l.notes) ? s(l.notes) + '\n' : '') + txt; l.lastNote = { text: txt, at: at, by: by }; })
    .then(function(ok){ toast(ok ? '📝 Note saved' : 'Could not save the note — try again'); return ok; });
}
function qnBox(id){ return '<div class="gclu-qn" data-id="' + esc(id) + '"><input type="text" data-gclu-qn-in maxlength="500" placeholder="Quick note — what happened, what is next…" aria-label="Quick note"><button type="button" class="b" data-gclu-qn-save>📝 Save</button></div>'; }
function qnSubmit(box){
  var inp = box && box.querySelector('[data-gclu-qn-in]'), id = box && box.getAttribute('data-id'); if (!inp || !s(inp.value).trim()) { if (inp) inp.focus(); return; }
  var v = inp.value; inp.value = ''; if (box.closest('#gcl-lprio-pop')) lcPopClose();
  saveNote(id, v);
}
function lcNotePop(btn){
  var id = btn.getAttribute('data-gclu-note'), l = lcLead(id); if (!l) return;
  var pop = lcPop(btn, '<div class="t">📝 Note on ' + esc(s(l.name || l.title) || 'this lead') + '</div>' + qnBox(id), id, 'gclu-notepop');
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Quick note');
  try { pop.querySelector('[data-gclu-qn-in]').focus(); } catch (e) {}
}
function lcPopClose(){ var p = D.getElementById('gcl-lprio-pop'); if (p) p.remove(); }

/* ── the header: title · search · views · More · New lead; chips; count boxes ── */
var VIEWS = [['board', '🗂 Board'], ['list', '📋 List'], ['cal', '📅 Calendar'], ['map', '🗺 Map'], ['outreach', '🛰 Outreach']];
function rsoOk(){ try { return !!(W._gcRSO && (!W._gcRSO._allowed || W._gcRSO._allowed())); } catch (e) { return false; } }
function rsoOn(){ try { return !!(W._gcRSO && W._gcRSO.state().on); } catch (e) { return false; } }
function chipB(k, label, on, tip){ return '<button type="button" class="gclu-chip' + (on ? ' on' : '') + '" data-gclu-chip="' + k + '"' + (k === 'all' || k === 'bids' ? ' data-gcl-preset="' + k + '"' : '') + ' aria-pressed="' + !!on + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + label + '</button>'; }
function moreMenu(){
  var adm = isAdmin(), sc = myScope(), office = adm || sc.why === 'office';
  var all0 = rawLeads().filter(function(l){ return !dead(l); }), nImp = all0.filter(function(l){ return !archivedL(l) && importedL(l); }).length, nArch = all0.filter(archivedL).length;
  var base = scoped().filter(function(l){ return !importedL(l); }), nShut = base.filter(shut).length, nExp = base.filter(expired).length;
  var nCl = 0; if (adm) { try { nCl = W._gcLeadClean ? W._gcLeadClean.count() : 0; } catch (e) {} }
  var it = function(attr, label, tip, on){ return '<button type="button" role="menuitem" class="gclu-mi-it' + (on ? ' on' : '') + '" ' + attr + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + label + '</button>'; };
  return '<div class="gclu-menu" role="menu" aria-label="More">'
    + it('data-gclu-tab="bidboard"', '📥 Lead Inbox (e-mail cards)', 'The Lead Inbox cards and the watched bid boards')
    + it('data-gclu-tab="website"', '🌐 Website & lead forms', 'The website strip and the Facebook / Google lead-form note')
    + it('data-gcl-impf', '📦 Imported (' + nImp + ')', 'QuickBooks customers and CompanyCam projects filed as leads that never became an inquiry', UI.imp)
    + it('data-gcl-arch', '🗄 Archived (' + nArch + ')', 'Leads archived by the cleanup — open one to restore it', UI.arch)
    + it('data-gclu-closed', '✖ Show lost / closed (' + nShut + ')', '', UI.closed)
    + it('data-gclu-exp', '⌛ Expired bids (' + nExp + ')', 'Bids whose due date went by more than a week ago and were never submitted', UI.exp)
    + it('data-gclu-adv', '🔎 More filters (person, source, type, stage …)', '', LU.adv)
    + (adm ? it('data-gcl-clean', '🧹 Clean up' + (nCl ? ' (' + nCl + ')' : ''), 'Duplicates, imported, stale and already-a-job leads') : '')
    + (office ? it('data-gclu-dups', '🧹 Duplicates', 'Records entered twice — merge or archive, 7-day Undo') : '')
    + (adm ? it('data-gcl-settings', '⚙ Lead settings', 'Bid boards, keywords & switches, Check public bids now, Set-up') : '')
    + (adm ? it('data-gclu-claims', '🛡 Insurance claims go to…', 'Who a new claims@ claim is assigned to') : '')
    + it('data-gclu-oldbb', '📋 Old Bid Board (archived, read-only)', 'The old manual bid list — its open bids are now leads')
    + (adm ? it('data-gcl-classic', D.documentElement.classList.contains('gcl-classic-ok') ? '🗃 Hide the old table' : '🗃 Old table (admin)') : '')
    + '</div>';
}
function advRow(){
  if (!LU.adv) return '';
  var base0 = scoped(), sc = {}, tc = {}, rc = { prime: 0, sub: 0, unset: 0 }; base0.forEach(function(l){ var k = srcCanon(l); sc[k] = (sc[k] || 0) + 1; typesOf(l).forEach(function(x){ tc[x] = (tc[x] || 0) + 1; }); var r0 = roleOfL(l); if (r0) rc[r0] = (rc[r0] || 0) + 1; else if (isBidL(l)) rc.unset++; });
  var who = [{ v: '__me', t: 'Mine' }, { v: '__mybids', t: '📐 My bids (estimator)' }].concat(people().map(function(n){ return { v: n, t: n }; }));
  return '<div class="gclu-adv gcl-hide-rso">'
    + '<select data-gcl-f="who" aria-label="Assignee">' + optionsFor(who, UI.who, 'Everyone') + '</select>'
    + '<select data-gcl-f="src" aria-label="Source">' + optionsFor(sourceList(rawLeads()).map(function(x){ return { v: x, t: x + ' (' + (sc[x] || 0) + ')' }; }), UI.src, 'All sources') + '</select>'
    + '<select data-gcl-f="type" aria-label="Type">' + optionsFor(LEAD_TYPES.map(function(t){ return { v: t, t: t + ' (' + (tc[t] || 0) + ')' }; }), UI.type, 'All types') + '</select>'
    + '<select data-gcl-f="role" aria-label="Prime or sub">' + optionsFor([{ v: 'prime', t: '🏛 Prime: to the owner (' + rc.prime + ')' }, { v: 'sub', t: '🔧 Sub: to a GC (' + rc.sub + ')' }, { v: 'unset', t: '❔ Bid, not marked (' + rc.unset + ')' }], UI.role, 'Prime & sub') + '</select>'
    + '<select data-gcl-f="stage" aria-label="Stage">' + optionsFor(STAGES, UI.stage, 'All stages') + '</select>'
    + '<select data-gcl-f="prio" aria-label="Priority">' + optionsFor([{ v: 'hi', t: '8–10 (high)' }, { v: 'md', t: '5–7' }, { v: 'lo', t: '1–4' }, { v: 'none', t: 'No priority yet' }], UI.prio, 'Any priority') + '</select>'
    + '</div>';
}
function hubHtml(){
  var m = model(), c = m.cnt, out = UI.v === 'outreach';
  var views = VIEWS.filter(function(v){ return v[0] !== 'outreach' || rsoOk(); });
  var mi = [0, 25, 50, 100, 200];
  return '<div class="gclu-top"><h2>Leads</h2>'
    + '<input type="search" class="gclu-q" placeholder="Search leads, people, addresses, bid #…" data-gcl-f="q" value="' + esc(UI.q) + '" aria-label="Search leads">'
    + '<span class="gclu-views" role="tablist" aria-label="Views">' + views.map(function(v){ var on = UI.v === v[0]; return '<button type="button" role="tab" data-gcl-v="' + v[0] + '" class="' + (on ? 'on' : '') + '" aria-selected="' + on + '">' + v[1] + '</button>'; }).join('') + '</span>'
    + '<span class="gclu-sp"></span>'
    + '<span class="gclu-mw"><button type="button" class="gclu-btn" data-gclu-more aria-haspopup="menu" aria-expanded="' + LU.more + '">⋯ More</button>' + (LU.more ? moreMenu() : '') + '</span>'
    + '<button type="button" class="gclu-btn gold" data-gcl-new>＋ New lead</button></div>'
    + (out ? '' : '<div class="gclu-chips gcl-hide-rso" role="group" aria-label="Show">'
      + chipB('all', 'All', !anyFilter(), 'Every open lead — clears the filters')
      + chipB('bids', '📐 Bids', UI.k === 'bids', 'Commercial / government bids (Lead Inbox bid mail, bid boards, plan rooms, GCs)')
      + chipB('res', '🏠 Residential', UI.k === 'res')
      + chipB('ins', '🛡 Insurance', UI.k === 'ins', 'Insurance claims, restoration and mitigation')
      + chipB('un', '👤 Unassigned', UI.un)
      + chipB('wk', '⏰ Due this week', UI.wk, 'Bid due from today through Sunday')
      + '<label class="gclu-within' + (UI.mi ? ' on' : '') + '">📍 Within <select data-gclu-mi aria-label="Distance">' + mi.map(function(n){ return '<option value="' + n + '"' + ((+UI.mi || 0) === n ? ' selected' : '') + '>' + (n ? n + ' mi' : 'any') + '</option>'; }).join('') + '</select></label>'
      + '<button type="button" class="gclu-chip gclu-from' + (GEO.from === 'me' ? ' on' : '') + '" data-gclu-from aria-pressed="' + (GEO.from === 'me') + '" title="Distances from ' + esc(GEO.from === 'me' ? 'my location' : 'the office: ' + officeAddr()) + ' — tap to switch">' + (GEO.from === 'me' ? '📡 from my location' : '🏢 from the office') + '</button>'
      + (anyFilter() ? '<button type="button" class="gclu-clear" data-gclu-clear>✕ Clear</button>' : '')
      + '</div>'
      + advRow()
      + '<div class="gclu-counts gcl-hide-rso">'
      + '<button type="button" class="gclu-cnt' + (UI.un ? ' on' : '') + (c.un ? ' alert' : '') + '" data-gclu-cnt="un" aria-pressed="' + !!UI.un + '"><b>' + c.un + '</b><span>Needs assigning</span></button>'
      + '<button type="button" class="gclu-cnt' + (UI.d7 ? ' on' : '') + (c.d7 ? ' alert' : '') + '" data-gclu-cnt="d7" aria-pressed="' + !!UI.d7 + '"><b>' + c.d7 + '</b><span>Due in 7 days</span></button>'
      + '<button type="button" class="gclu-cnt' + (UI.nc ? ' on' : '') + (c.nc ? ' bad' : '') + '" data-gclu-cnt="nc" aria-pressed="' + !!UI.nc + '"><b>' + c.nc + '</b><span>Not contacted</span></button>'
      + '</div>'
      + (UI.arch ? '<div class="gclu-banner">🗄 Showing archived leads — <button type="button" class="gclu-lnk" data-gcl-arch>back to open leads</button></div>' : UI.imp ? '<div class="gclu-banner">📦 Showing imported leads — <button type="button" class="gclu-lnk" data-gcl-impf>back to open leads</button></div>' : ''))
    + '<div class="gcl-body gcl-hide-rso">' + (out ? '' : bodyHtml()) + '</div>';
}

/* ── clicks: chips, counts, sort, views, More, the row buttons (never the row click that opens the lead) ── */
function setTab(t){ var b = D.querySelector('#gc-leads-tabs [data-gc-tab="' + t + '"]'); if (b) b.click(); else toast('Not ready yet — try again in a moment'); }
function openClaims(){ var d = openSettings(); if (!d) return; var n = 0; (function f(){ var el = D.getElementById('gc-claimlead-set'); if (el) { try { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid #d4a017'; } catch (e) {} return; } if (++n < 20) later(f, 150); })(); }
function setView(v){
  if (v === 'outreach') { UI.v = 'outreach'; try { if (W._gcRSO && !rsoOn()) W._gcRSO.open(); } catch (e) { warn(e); } }
  else { UI.v = v; try { if (rsoOn()) W._gcRSO.close(); } catch (e) { warn(e); } }
  LU.more = false; redraw(); try { luTick(); } catch (e) {}   /* Outreach goes under the header at once */
}
D.addEventListener('click', function(ev){
  var t = ev.target; if (!t || !t.closest) return;
  var pop = D.getElementById('gcl-lprio-pop');
  var fp = t.closest('#gcl-drawer [data-gcl-prio]');   /* the panel's 1–10: lit at once, the panel redrawn right after */
  if (fp) { LU.fast = true; Array.prototype.forEach.call(D.querySelectorAll('#gcl-drawer [data-gcl-prio]'), function(x){ var on = x === fp; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); NST0.call(W, function(){ LU.fast = false; }, 300); }
  var qs = t.closest('[data-gclu-qn-save]'); if (qs) { ev.stopPropagation(); ev.preventDefault(); qnSubmit(qs.closest('.gclu-qn')); return; }
  if (pop && pop.contains(t)) { var n = t.getAttribute('data-lp'); if (n) { ev.stopPropagation(); var pid = pop.getAttribute('data-id'); lcPopClose(); setPriority(pid, +n); } return; }
  if (pop && !t.closest('[data-gcl-lprio],[data-gcl-gcs],[data-gclu-note]')) lcPopClose();
  if (t.closest('#gc-leads-tabs [data-gc-tab]')) { [40, 120, 300, 700].forEach(function(ms){ NST0.call(W, function(){ if (!D.getElementById('gc-leads-hub') || !D.getElementById('gc-leads-hub').offsetParent) redraw(); }, ms); }); return; }   /* back from the Lead Inbox / Website tab: the list at once */
  if (t.closest('[data-rso-back]') && D.getElementById('gc-leads-hub')) { ev.stopPropagation(); ev.preventDefault(); setView('list'); return; }   /* Outreach's own "Back to Leads" */
  var hub = t.closest('#gc-leads-hub'); if (!hub) return;
  if (LU.more && !t.closest('.gclu-mw')) { LU.more = false; redraw(); }
  var b = t.closest('[data-gclu-note],[data-gcl-del],[data-gcl-lprio],[data-gcl-gcs],[data-gcl-lsort],[data-gclu-chip],[data-gclu-cnt],[data-gclu-clear],[data-gclu-more],[data-gclu-from],[data-gcl-v],[data-gclu-tab],[data-gclu-closed],[data-gclu-exp],[data-gclu-adv],[data-gclu-dups],[data-gclu-claims],[data-gclu-oldbb],.gclu-menu [data-gcl-impf],.gclu-menu [data-gcl-arch],.gclu-menu [data-gcl-clean],.gclu-menu [data-gcl-settings],.gclu-menu [data-gcl-classic]');
  if (!b) return;
  if (b.closest('.gclu-menu')) { LU.more = false; if (b.matches('[data-gcl-impf],[data-gcl-arch],[data-gcl-clean],[data-gcl-settings],[data-gcl-classic]')) { later(redraw, 0); return; } }   /* those are the hub's / LCLEAN's own buttons */
  ev.stopPropagation(); ev.preventDefault();
  if (b.hasAttribute('data-gclu-note')) return lcNotePop(b);
  if (b.hasAttribute('data-gcl-del')) return lcAskDel(b.getAttribute('data-gcl-del'));
  if (b.hasAttribute('data-gcl-lprio')) return lcPrioPop(b);
  if (b.hasAttribute('data-gcl-gcs')) return lcGcsPop(b);
  if (b.hasAttribute('data-gcl-v')) return setView(b.getAttribute('data-gcl-v'));
  if (b.hasAttribute('data-gclu-more')) { LU.more = !LU.more; return redraw(); }
  if (b.hasAttribute('data-gclu-chip')) { var k = b.getAttribute('data-gclu-chip');
    if (k === 'all') clearFilters(); else if (k === 'un' || k === 'wk') UI[k] = !UI[k]; else UI.k = UI.k === k ? '' : k;
    MORE.ulist = 0; return redraw(); }
  if (b.hasAttribute('data-gclu-cnt')) { var c = b.getAttribute('data-gclu-cnt'); UI[c] = !UI[c]; MORE.ulist = 0; if (UI.v === 'outreach') setView('list'); return redraw(); }
  if (b.hasAttribute('data-gclu-clear')) { clearFilters(); return redraw(); }
  if (b.hasAttribute('data-gclu-from')) return useMyLocation(GEO.from !== 'me');
  if (b.hasAttribute('data-gclu-tab')) { LU.more = false; redraw(); return setTab(b.getAttribute('data-gclu-tab')); }
  if (b.hasAttribute('data-gclu-closed')) { UI.closed = !UI.closed; return redraw(); }
  if (b.hasAttribute('data-gclu-exp')) { UI.exp = !UI.exp; return redraw(); }
  if (b.hasAttribute('data-gclu-adv')) { LU.adv = !LU.adv; return redraw(); }
  if (b.hasAttribute('data-gclu-dups')) { redraw(); try { if (W._gcDedupe && W._gcDedupe.open) W._gcDedupe.open(); else toast('Duplicates is still loading — try again in a moment'); } catch (e) { warn(e); } return; }
  if (b.hasAttribute('data-gclu-claims')) { redraw(); return openClaims(); }
  if (b.hasAttribute('data-gclu-oldbb')) { redraw(); return oldBidBoard(); }
  var col = b.getAttribute('data-gcl-lsort');
  if ((UI.lsort || 'due') === col) UI.ldir = UI.ldir === -1 ? 1 : -1; else { UI.lsort = col; UI.ldir = col === 'prio' ? -1 : 1; }
  redraw();
}, true);
D.addEventListener('change', function(ev){ var t = ev.target; if (!t || !t.hasAttribute || !t.hasAttribute('data-gclu-mi')) return; ev.stopPropagation(); UI.mi = +t.value || 0; MORE.ulist = 0; if (UI.mi) { GEO.at = 0; } redraw(); }, true);
D.addEventListener('keydown', function(ev){ if (ev.key === 'Enter' && ev.target && ev.target.hasAttribute && ev.target.hasAttribute('data-gclu-qn-in')) { ev.preventDefault(); ev.stopPropagation(); qnSubmit(ev.target.closest('.gclu-qn')); return; } }, true);
D.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') { lcPopClose(); if (LU.more) { LU.more = false; redraw(); } } }, true);

/* ── the old manual Bid Board: open bids become bid leads once; the rest stays, read-only ── */
var BBM = { at: 0, busy: false, done: false, n: 0, last: null };
var BB_PRIO = { urgent: 9, high: 7, medium: 5, med: 5, low: 3 };
function bbNorm(v){ return low(v).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function bbOpen(b){ return /^(open|bidding|submitted)$/i.test(s(b && b.status || 'Open')); }
function bbRead(){ try { if (typeof W.idbGet !== 'function') return Promise.resolve(null); return Promise.resolve(W.idbGet('bidLists')).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return Array.isArray(v) ? v : null; }, function(){ return null; }); } catch (e) { return Promise.resolve(null); } }
function bbTomb(kind, id){ try { return typeof W._gcIsTombstoned === 'function' && !!W._gcIsTombstoned(kind, id); } catch (e) { return false; } }
function bbLead(b){
  var at = nowIso(), plans = arr(b.plans).map(function(p){ var u = s(p && (p.url || p.link || p.href)); return /^https?:\/\//i.test(u) ? { url: u, label: s(p.name || p.label) || 'Plans', at: at } : null; }).filter(Boolean);
  var notes = [s(b.description), s(b.scopeOfWork) ? 'Scope: ' + s(b.scopeOfWork) : '', s(b.requirements) ? 'Requirements: ' + s(b.requirements) : '', s(b.notes)].filter(Boolean).join('\n');
  var l = { id: 'LBB_' + s(b.id), name: s(b.title) || 'Bid', address: s(b.address), client: s(b.client), dueToCompany: s(b.client), gc: s(b.client), contact: s(b.gcContact), phone: s(b.gcPhone), email: s(b.gcEmail),
    leadKind: 'Commercial', type: s(b.type) || 'Commercial', source: s(b.source) || 'Bid Board', bidDue: s(b.bidDue), estValue: s(b.estValue), estimator: s(b.assignedTo),
    stage: /submitted/i.test(s(b.status)) ? 'Estimate Sent' : 'New Lead', status: 'new', bidStatus: s(b.status), notes: notes, plansLinks: plans,
    fromBidBoard: s(b.id), bidBoardStatus: s(b.status), createdAt: s(b.createdAt || b.date) || at, updatedAt: at, activity: [{ type: 'system', text: 'Moved here from the old Bid Board (' + s(b.status || 'Open') + ')', at: at, by: 'CRM' }] };
  var p = BB_PRIO[low(b.priority)]; if (p) l.priority = p;
  if (b.bondRequired) l.bondRequired = true; if (b.prevailingWage) l.prevailingWage = true; if (s(b.walkthroughDate || b.walkthrough)) l.walkthrough = s(b.walkthroughDate || b.walkthrough);
  if (s(b.pid)) l.pid = s(b.pid); if (s(b.estId)) l.estimateId = s(b.estId);
  Object.keys(l).forEach(function(k){ if (l[k] === '') delete l[k]; });
  return l;
}
/* what to add: open, not deleted, not already a lead (its id, or the same name + address), not deleted as a lead */
function bbPlan(bids, list){
  var have = {}, nk = {};
  arr(list).forEach(function(l){ if (!l) return; have[s(l.id)] = 1; nk[bbNorm(l.name || l.title) + '|' + bbNorm(l.address)] = 1; });
  var add = [];
  arr(bids).forEach(function(b){
    if (!b || !s(b.id) || !bbOpen(b) || b.deleted || bbTomb('bidLists', b.id)) return;
    try { if (W._gcBidDismissed && W._gcBidDismissed(b)) return; } catch (e) {}
    var id = 'LBB_' + s(b.id), k = bbNorm(b.title) + '|' + bbNorm(b.address);
    if (have[id] || bbTomb('leads', id) || nk[k]) return;
    have[id] = 1; nk[k] = 1; add.push(bbLead(b));
  });
  return add;
}
function bbMigrate(){
  if (BBM.done || BBM.busy || Date.now() - BBM.at < 15000 || D.hidden) return;
  var sc = myScope(); if (sc.kind !== 'all' || typeof W._setLeads !== 'function' || !LEADS_NOW) return;   /* admins / office, once the live list is read */
  BBM.at = Date.now(); BBM.busy = true;
  bbRead().then(function(bids){
    if (!bids) { BBM.busy = false; return; }
    var add = bbPlan(bids, rawLeads0());
    BBM.last = { bids: bids.length, open: bids.filter(bbOpen).length, add: add.length, at: nowIso() };
    if (!add.length) { BBM.busy = false; if (bids.length) BBM.done = true; return; }
    setLeads(function(list){ var a2 = bbPlan(bids, list); if (!a2.length) return null; BBM.n += a2.length; return list.concat(a2); }).then(function(ok){ BBM.busy = false; if (ok) { BBM.done = true; LD_C.ref = null; redraw(); } });
  }, function(){ BBM.busy = false; });
}
function oldBidBoard(){
  var old = D.getElementById('gclu-oldbb'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gclu-oldbb'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Old Bid Board');
  ov.innerHTML = '<div class="b"><div class="h"><b>📋 Old Bid Board — archived, read-only</b><button type="button" data-x aria-label="Close">✕</button></div><div class="c">Loading…</div></div>';
  D.body.appendChild(ov);
  var close = function(){ ov.remove(); D.removeEventListener('keydown', key, true); };
  var key = function(e){ if (e.key === 'Escape') close(); };
  ov.addEventListener('click', function(e){ if (e.target === ov || (e.target.closest && e.target.closest('[data-x]'))) close(); var o = e.target.closest && e.target.closest('[data-gclu-open]'); if (o) { close(); openDrawer(o.getAttribute('data-gclu-open')); } });
  D.addEventListener('keydown', key, true);
  bbRead().then(function(bids){
    bids = arr(bids).filter(function(b){ return b && !bbTomb('bidLists', b.id); });
    var ls = {}; rawLeads().forEach(function(l){ if (l && !dead(l)) { ls[s(l.id)] = l; if (l.fromBidBoard) ls['LBB_' + s(l.fromBidBoard)] = l; } });
    var c = ov.querySelector('.c');
    c.innerHTML = '<p class="n">The old manual bid list. Its open bids (Open, Bidding, Submitted) are now bid leads on the Leads list; nothing here can be changed, and nothing was deleted.</p>'
      + (bids.length ? '<table><thead><tr><th>Bid</th><th>GC / client</th><th>Due</th><th>Status</th><th>Lead</th></tr></thead><tbody>' + bids.map(function(b){ var l = ls['LBB_' + s(b.id)];
          return '<tr><td><b>' + esc(s(b.title) || '—') + '</b><div class="n">' + esc(s(b.address)) + '</div></td><td>' + esc(s(b.client) || '—') + '</td><td>' + esc(s(b.bidDue).replace('T', ' ') || '—') + '</td><td>' + esc(s(b.status) || 'Open') + '</td><td>' + (l ? '<button type="button" data-gclu-open="' + esc(l.id) + '">Open lead</button>' : bbOpen(b) ? '<span class="n">same as an existing lead</span>' : '<span class="n">archived</span>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>No bids on the old board.</p>');
  });
}
W._gcBidBoardMigrate = { run: function(){ BBM.at = 0; BBM.done = false; bbMigrate(); }, state: function(){ return Object.assign({ done: BBM.done, added: BBM.n }, BBM.last || {}); }, plan: bbPlan, lead: bbLead, open: oldBidBoard };

/* ── the lead panel: status → bid → (🏢 Bidding to) → contact → notes & activity → the rest folded ── */
function dueFrom(l){
  var it = inboxOf(l) || {};
  if (!s(l.bidDue)) return '';
  if (it.bidDueManual || l.bidDueManual) return 'set by ' + esc(s(it.bidDueBy || l.bidDueBy) || 'a person') + (s(it.bidDueAt || l.bidDueAt) ? ' on ' + esc(new Date(it.bidDueAt || l.bidDueAt).toLocaleDateString()) : '');
  if (l.fromBidBoard) return 'from the old Bid Board';
  if (l.inboxId) return 'read from the ' + esc(srcOf(l)) + ' notice (Lead Inbox)';
  return 'typed on the lead';
}
function secOf(html, re){ var parts = html.split('<section>'); for (var i = 1; i < parts.length; i++) { var h = parts[i]; var m = /^<h4>([\s\S]*?)<\/h4>/.exec(h); if (m && re.test(m[1])) return h.replace(/<\/section>[\s\S]*$/, ''); } return ''; }
function secBody(sec){ return sec.replace(/^<h4>[\s\S]*?<\/h4>/, ''); }
function drawerHtml(l){
  var old = drawerHtml0(l), hd = old.split('<section>')[0], adm = isAdmin(), r = lcRow(l), bc = lcBidCell(l, r, lcGcGroups());
  var ov = secOf(old, /^Overview/), asg = secOf(old, /Assigned to|Estimator/), con = secOf(old, /^Contact/), bid = secOf(old, /⏰ Bid/), pl = secOf(old, /Plans/), act = secOf(old, /Activity/);
  var asgRow = (/<div class="row"><select data-d="assign"[\s\S]*?<\/select>[\s\S]*?<\/div>/.exec(asg) || [''])[0];
  var asgPre = asg.indexOf('<div class="row"><select data-d="assign"') > 0 ? secBody(asg.slice(0, asg.indexOf('<div class="row"><select data-d="assign"'))) : '';
  var held = ''; try { held = W._gcLeadHold && W._gcLeadHold.drawer ? s(W._gcLeadHold.drawer(l)) : ''; } catch (e) {}
  var due = /<div class="row"><input type="datetime-local" data-d="due"[\s\S]*?<\/div>/.exec(bid), dueKv = /<div class="kv"><span>Due:<\/span>[\s\S]*?<\/div>/.exec(bid);
  var d = r.d, prRow = /<div class="row gcl-role-row">[\s\S]*?<\/div>/.exec(ov), ovRest = (ov.match(/<div class="kv">[\s\S]*?<\/div>/g) || []).join('');
  var edit = /<button type="button" class="b" data-d="editfull"[\s\S]*?data-d="delfull">[^<]*<\/button>/.exec(ov);
  var subp = secOf(old, /Sub bid portal/), est = secOf(old, /Estimate &amp; job|Estimate & job/);
  var notes = s(l.notes).trim();
  return hd
    + '<section class="gclu-s-status"><h4>Status</h4>' + qnBox(l.id) + (function(n){ return n ? '<div class="note gclu-lastn">Latest note: ' + esc(s(n.text).slice(0, 300)) + (n.by || n.at ? ' <i>— ' + esc([s(n.by), n.at ? new Date(n.at).toLocaleString() : ''].filter(Boolean).join(', ')) + '</i>' : '') + '</div>' : ''; })(lastNote(l))
    + '<div class="row"><span class="kv"><span>Stage:</span></span><select data-d="stage" aria-label="Stage">' + STAGES.map(function(st){ return '<option' + (st === stageOf(l) ? ' selected' : '') + '>' + st + '</option>'; }).join('') + '</select>'
    + '<button type="button" class="b gold" data-d="won">🏆 Won</button><button type="button" class="b red" data-d="lost">✖ Lost</button>' + (!contacted(l) && !closed(l) ? '<button type="button" class="b" data-d="contacted">✅ Contacted</button>' : '') + '</div>'
    + '<div class="row gcl-prio-row"><span class="kv"><span>Priority:</span></span> ' + prioChip(l) + ' ' + (canPrio(l) ? prioPicker(l) : '<span class="note">An admin sets the priority' + (isBidL(l) ? ' (or the estimator, on a bid)' : '') + '.</span>') + '</div>'
    + '<div class="gclu-asg"><span class="kv"><span>' + ((W._gcBidRole && W._gcBidRole.isBid(l)) ? 'Estimator' : 'Assigned to') + ':</span> <b data-gclu-assigned>' + esc(assignee(l) || 'Unassigned') + '</b></span>' + held + asgPre + asgRow + '</div>'
    + (l.lostReason ? '<div class="note">Lost because: ' + esc(l.lostReason) + '</div>' : '')
    + '</section>'
    + '<section><h4>⏰ Bid</h4>'
    + (dueKv ? dueKv[0] : '') + (s(l.bidDue) ? '<div class="note">Due date ' + dueFrom(l) + (s(l.bidDue).length <= 10 ? ' · time not stated' : '') + '</div>' : '')
    + '<div class="kv"><span>Bid to:</span> ' + (bc.names.length > 1 ? '🏢 ' + esc(bc.names.length + ' GCs: ' + bc.names.join(' · ')) : esc(bc.txt || '—')) + (prRow ? '' : '') + '</div>'
    + (prRow ? prRow[0] : '')
    + (d != null ? '<div class="kv"><span>Distance:</span> 📍 ' + esc(miTxt(d)) + ' from ' + (GEO.from === 'me' ? 'my location' : 'the office') + '</div>' : '')
    + (due ? due[0] : '')
    + '<div class="gclu-plans"><div class="kv"><span>Plans & links:</span></div>' + secBody(pl) + '</div>'
    + '</section>'
    + '<section><h4>Contact</h4>' + secBody(con) + '</section>'
    + '<section><h4>📝 Notes & activity</h4>' + (notes ? '<div class="gclu-notes">' + esc(notes.slice(-2000)) + '</div>' : '<div class="note">No notes yet.</div>') + '<div class="row"><button type="button" class="b" data-d="lognote">📝 Add a note / log a call</button></div>' + secBody(act) + '</section>'
    + '<section class="gclu-s-more"><details><summary><b>More on this lead</b> — details, sub bid portal, estimate &amp; job</summary>'
    + '<div class="gclu-ov">' + ovRest + (edit ? '<div class="row">' + edit[0] + '</div>' : '') + '</div>'
    + (subp ? '<h4>🏗 Sub bid portal</h4>' + secBody(subp) : '') + (est ? '<h4>📐 Estimate & job</h4>' + secBody(est) : '')
    + '</details></section>';
}
W._gcLeadsUI = { model: function(){ var m = model(); return { n: m.list.length, cnt: m.cnt }; }, rows: function(){ return modelRows().map(function(x){ return x.l.id; }); }, kind: kindOf, dist: distOf, clear: function(){ clearFilters(); redraw(); }, ui: function(){ return UI; } };

function css2(){
  if (D.getElementById('gc-leadsui-css')) return;
  var c = D.createElement('style'); c.id = 'gc-leadsui-css';
  c.textContent = [
    '#gc-leads-tabs[data-tab="leads"]{display:none!important}',
    'body.gcrso-on #gc-leads-hub{display:block!important}body.gcrso-on #gc-leads-hub .gcl-hide-rso{display:none!important}',
    '.gclu-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}.gclu-top h2{margin:0 6px 0 0;font-size:22px}',
    '.gclu-q{flex:1 1 220px;min-width:160px;max-width:420px;border:1px solid #d6d3ea;border-radius:9px;padding:8px 10px;font:14px Arial;min-height:38px;background:#fff}',
    '.gclu-views{display:inline-flex;border:1px solid #d6d3ea;border-radius:9px;overflow:hidden;background:#fff}.gclu-views button{border:0;border-right:1px solid #ece9f7;background:#fff;color:#241968;padding:8px 11px;font:700 13px Arial;cursor:pointer;min-height:38px;white-space:nowrap}.gclu-views button:last-child{border-right:0}.gclu-views button.on{background:#241968;color:#fff}',
    '.gclu-sp{flex:1}.gclu-btn{border:1px solid #cfc8ea;background:#fff;color:#241968;border-radius:9px;padding:8px 12px;font:700 13px Arial;cursor:pointer;min-height:38px;white-space:nowrap}.gclu-btn.gold{background:#d4a017;border-color:#d4a017;color:#1b1640}',
    '.gclu-mw{position:relative;display:inline-block}.gclu-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:100150;background:#fff;border:1px solid #d6d3ea;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.18);min-width:280px;padding:4px 0;display:flex;flex-direction:column}',
    '.gclu-mi-it{border:0;background:#fff;text-align:left;padding:10px 14px;font:13px Arial;color:#1b1640;cursor:pointer;min-height:40px}.gclu-mi-it:hover{background:#f4f2fb}.gclu-mi-it.on{font-weight:700;background:#ede9fe}',
    '.gclu-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 10px}.gclu-chip{border:1px solid #d6d3ea;background:#fff;color:#241968;border-radius:999px;padding:6px 12px;font:700 13px Arial;cursor:pointer;min-height:34px}.gclu-chip.on{background:#241968;color:#fff;border-color:#241968}',
    '.gclu-within{display:inline-flex;align-items:center;gap:4px;border:1px solid #d6d3ea;border-radius:999px;padding:2px 4px 2px 10px;font:700 13px Arial;color:#241968;background:#fff;min-height:34px}.gclu-within.on{border-color:#241968;background:#ede9fe}.gclu-within select{border:0;background:transparent;font:700 13px Arial;color:#241968;min-height:28px}',
    '.gclu-from{font-weight:400}.gclu-clear{border:0;background:none;color:#b91c1c;font:700 13px Arial;cursor:pointer;padding:6px 8px;min-height:34px}',
    '.gclu-adv{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}.gclu-adv select{border:1px solid #d6d3ea;border-radius:8px;padding:6px 8px;font:13px Arial;background:#fff;min-height:34px}',
    '.gclu-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 10px;max-width:640px}.gclu-cnt{background:#fff;border:1px solid #e3e1f0;border-radius:10px;padding:8px 12px;cursor:pointer;text-align:left;font:inherit;color:inherit}.gclu-cnt b{display:block;font-size:22px;line-height:1.1}.gclu-cnt span{font-size:12px;color:#555}',
    '.gclu-cnt.alert{border-color:#f59e0b;background:#fffbeb}.gclu-cnt.bad{border-color:#fca5a5;background:#fef2f2}.gclu-cnt.on{outline:2px solid #241968;outline-offset:-1px}',
    '.gclu-banner{background:#f6f5fb;border:1px solid #e3e1f0;border-radius:8px;padding:6px 10px;margin:0 0 8px;font-size:13px}.gclu-lnk{border:0;background:none;color:#241968;text-decoration:underline;cursor:pointer;font:inherit;padding:0}.gclu-empty{color:#666;padding:10px 4px}',
    '.gcl-lc th,.gcl-lc td{padding:6px 8px;font-size:12.5px;white-space:nowrap;vertical-align:middle}.gcl-lc th[aria-sort]{color:#241968}',
    '.gcl-lc td.c-name{white-space:normal;min-width:200px}.gcl-lc .gcl-addr{font-size:11px;color:#666;margin-top:1px}.gclu-mi{color:#475569}',
    '.gcl-lc td.c-bidto{max-width:220px;overflow:hidden;text-overflow:ellipsis}.gcl-gcs{border:1px solid #d6d3ea;background:#f6f5fb;color:#241968;border-radius:999px;padding:1px 9px;font:700 11.5px Arial;cursor:pointer;min-height:24px}.gcl-gcs:hover{border-color:#241968}',
    '.gcl-lc td.c-who{white-space:normal;max-width:240px}.gclu-who{border:0;background:none;padding:2px 0;font:inherit;color:inherit;cursor:pointer;text-align:left}.gclu-who:hover{text-decoration:underline}.gclu-un{color:#b45309;font-weight:700}.gclu-av{display:inline-flex;width:20px;height:20px;border-radius:50%;background:#241968;color:#fff;font:700 9px Arial;align-items:center;justify-content:center;vertical-align:middle}',
    '.gcl-lc td.c-who .gcl-chip{white-space:normal;display:inline;line-height:1.5}.gclu-nt{font-size:10.5px;color:#888;margin-top:1px}.gcl-lc td.c-dist{color:#475569}',
    '.gclu-nb{float:right;border:0;background:none;cursor:pointer;font-size:13px;opacity:.45;padding:2px 4px;margin:-2px -4px 0 6px;border-radius:6px;min-width:28px;min-height:28px}.gclu-nb:hover,.gclu-nb:focus-visible{opacity:1;background:#ede9fe}',
    '.gclu-np{font-size:11px;color:#6b7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}',
    '.gclu-qn{display:flex;gap:6px;align-items:center;margin:0 0 8px}.gclu-qn input{flex:1;min-width:0;border:1px solid #d6d3ea;border-radius:8px;padding:7px 9px;font:13px Arial;min-height:36px}.gclu-qn button{border:1px solid #d6d3ea;background:#fff;border-radius:8px;padding:7px 11px;font:700 13px Arial;cursor:pointer;color:#241968;min-height:36px;white-space:nowrap}',
    '#gcl-lprio-pop.gclu-notepop{max-width:min(420px,94vw);width:420px;display:block}#gcl-drawer .gclu-lastn{margin:-2px 0 8px}',
    '.gcl-gcpop{display:block!important}.gcl-gcpop ul{margin:2px 0 0 16px;padding:0;font-size:13px;line-height:1.6}',
    '.gcl-dash{color:#9ca3af}.gcl-due{font-weight:700;border-radius:6px;padding:1px 6px}.gcl-due.od{color:#b91c1c;background:#fee2e2}.gcl-due.soon{color:#b45309;background:#fef3c7}',
    '.gcl-pc{display:inline-block;border:1px solid transparent;border-radius:999px;padding:1px 9px;font:700 10.5px Arial;background:#f3f4f6;color:#555;cursor:default;min-width:34px;text-align:center}button.gcl-pc{cursor:pointer;min-height:26px}button.gcl-pc:hover{border-color:#241968}',
    '.gcl-pc.p-hi{background:#fee2e2;color:#b91c1c}.gcl-pc.p-md{background:#fffbeb;color:#b45309}.gcl-pc.p-no{background:#fff;color:#9ca3af;border-color:#e5e7eb}',
    '.gcl-lc .gcl-tc{width:1%;text-align:right;padding:2px 4px}.gcl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '.gcl-del{border:0;background:none;cursor:pointer;font-size:15px;opacity:.55;padding:4px 6px;border-radius:6px;min-width:34px;min-height:34px}.gcl-del:hover,.gcl-del:focus-visible{opacity:1;background:#fee2e2}',
    '#gcl-lprio-pop{position:absolute;z-index:100200;background:#fff;border:1px solid #d6d3ea;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:250px;font:12px Arial}#gcl-lprio-pop .t{width:100%;color:#555;margin-bottom:2px}',
    '#gcl-delq{position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif}',
    '#gcl-delq .b{background:#fff;color:#111;border-radius:12px;width:min(420px,94vw);padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}#gcl-delq .q{font-size:16px;font-weight:800;margin-bottom:6px}#gcl-delq .n{font-size:14px;margin-bottom:8px;word-break:break-word}#gcl-delq .w{font-size:12px;color:#7f1d1d;margin-bottom:14px}',
    '#gcl-delq .a{display:flex;gap:8px;justify-content:flex-end}#gcl-delq .a button{border-radius:7px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:14px}#gcl-delq [data-a=cancel]{background:#0f2440;color:#fff;border:0}#gcl-delq [data-a=delete]{background:#fff;color:#b91c1c;border:1px solid #fca5a5}',
    '#gcl-deltoast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483500;background:#1f2937;color:#fff;border-radius:999px;padding:8px 10px 8px 16px;display:flex;gap:8px;align-items:center;font:600 14px Arial;box-shadow:0 6px 20px rgba(0,0,0,.25)}#gcl-deltoast button{background:#fff;color:#1f2937;border:0;border-radius:999px;padding:5px 12px;font-weight:700;cursor:pointer}',
    '#gclu-oldbb{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:16px;font:14px Arial,sans-serif;color:#1b1640}#gclu-oldbb .b{background:#fff;border-radius:12px;width:min(860px,96vw);max-height:86vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.3)}',
    '#gclu-oldbb .h{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff}#gclu-oldbb .h button{border:1px solid #ddd;background:#fff;border-radius:7px;padding:6px 11px;cursor:pointer}#gclu-oldbb .c{padding:12px 16px}#gclu-oldbb table{width:100%;border-collapse:collapse}#gclu-oldbb td,#gclu-oldbb th{padding:6px;border-top:1px solid #f0eef8;text-align:left;font-size:13px;vertical-align:top}#gclu-oldbb .n{color:#666;font-size:12px}',
    '#gcl-drawer .gclu-asg{margin:6px 0 2px}#gcl-drawer .gclu-asg .row{margin-top:4px}#gcl-drawer .gclu-notes{white-space:pre-wrap;font-size:13px;background:#faf9ff;border:1px solid #eee;border-radius:8px;padding:8px;margin:0 0 6px;max-height:180px;overflow:auto}',
    '#gcl-drawer .gclu-s-more summary{cursor:pointer;padding:4px 0}#gcl-drawer .gclu-s-more h4{margin:14px 0 6px}#gcl-drawer .gclu-plans{margin-top:6px}',
    '@media (min-width:641px){.gclu-top h2{color:#241968}}',
    '@media (max-width:640px){#gc-leads-hub{background:#f6f5fb;color:#1b1640;border-radius:12px;padding:10px 8px}.gclu-top h2{font-size:19px;color:#241968}.gclu-chips{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}.gclu-chips>*{flex:0 0 auto}.gclu-chip{padding:5px 10px;font-size:12px;min-height:32px}.gclu-within{font-size:12px;min-height:32px}.gclu-q{order:5;flex:1 1 100%;max-width:none}.gclu-views{order:6;width:100%;overflow-x:auto}.gclu-views button{flex:1;padding:8px 6px;font-size:12px}.gclu-counts{grid-template-columns:repeat(3,1fr)}.gclu-cnt b{font-size:18px}.gclu-menu{position:fixed;left:8px;right:8px;top:auto;bottom:8px;min-width:0;max-height:70vh;overflow:auto}',
    '.gcl-lc thead{display:none}.gcl-lc,.gcl-lc tbody{display:block;width:100%}.gcl-lc tr.gcl-lr{display:grid;grid-template-columns:1fr auto auto;grid-template-areas:"n n t" "d p t";gap:4px 8px;padding:9px 10px;border-top:1px solid #f0eef8;align-items:center}',
    '.gcl-lc tr.gcl-lr td{display:none;padding:0!important;border:0;max-width:none;min-height:0!important;height:auto!important}.gcl-lc tr.gcl-lr td.c-name{display:block;grid-area:n;min-width:0}.gclu-np{max-width:none}.gcl-lc tr.gcl-lr td.c-due{display:block;grid-area:d}.gcl-lc tr.gcl-lr td.c-prio{display:block;grid-area:p}.gcl-lc tr.gcl-lr td.gcl-tc{display:block;grid-area:t;width:auto}}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(c);
}
