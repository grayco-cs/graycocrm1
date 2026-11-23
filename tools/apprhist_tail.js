/* __GC_PATCH_APPRHIST__ ═══════════════════════════════════════════════════════════════════════════════════════════
   GrayCo — ✅ Approvals → 🕘 Recently approved + 📜 All approvals history (patch APPRHIST, tools/patch_APPRHIST.py).
   Owner 11/23: "shouldn't we show what I just approved, all the portal sign-ups, COIs etc; also have a button down at bottom I
   can click for all recently approved so when we have a lot I can see who, when and what was approved — history etc. Don't
   overload the screen: just the bottom, these 7–8, have a load more / screen with all approvals dated and sorted by how I want."

   ONE RECORD of every approval decision, from three places, de-duplicated (same item + outcome + person within 10 minutes):
     1. the server's approval audit (gc_appr_audit — appr-away op history: the live list + gc_appr_audit_arch_<year>, which is
        never purged): customer e-mails / texts / portal items (portal.js), everything ✅ Approve / ✕ Deny on the Approvals tab
        does for the CRM-only kinds (patch AWAY), and what this patch adds: sub / supplier sign-ups approved / denied,
        🔗 same sub? merged / kept apart, 📩 plan / info requests answered, 🧱 bid-site material requests, 🛡 COI / 🧾 W-9
        confirmed / denied, 🏖 time off, invoices signed off in the old APPROVE panel;
     2. what the records themselves keep (older than the audit): the approval queue's steps (who approved each step, "don't
        send", not approved), sub invoices decided, time off decided, the field's material requests decided;
     3. this computer's own decisions not yet on the server (shown at once; sent again until the server has them).
   🕘 Recently approved (bottom of ✅ Approvals): the newest 8 items of the last 14 days — who approved each step, and when, with
     a link to the job. Then "📜 All approvals history (N)" → a screen in the page (not a popup): every decision with date / time,
     who, kind, what, outcome; sort (newest / oldest / by person / by kind) and filter (kind, person, outcome, dates, search);
     50 at a time ("Load more"), older pages from the server on demand.
   Who sees it: whoever sees ✅ Approvals (admins, the office, project managers — by role); a PM sees his own decisions and
   his jobs' (as the Recently approved list always did).
   Console: _gcApprHist.all(), .log(rec), .load(true), .open(), .close()
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(W, D){
'use strict';
if (W.__GC_PATCH_APPRHIST__) return; W.__GC_PATCH_APPRHIST__ = true;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return SI.call(W, f, ms); }
var FN = '/.netlify/functions/appr-away', LSK = 'gc_appr_hist_mine_v1', PAGE = 50, RECENT_N = 8, DAY = 864e5;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[GC APPRHIST]', e && e.message || e); } catch (x) {} }
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { W.localStorage.setItem(k, v); } catch (e) {} }
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects); }
var PJ = { at: 0, m: {} };
function proj(pid){ pid = s(pid); if (!pid) return null; if (Date.now() - PJ.at > 3000) { var m = {}; projects().forEach(function(p){ if (p && p.id != null) m[s(p.id)] = p; }); PJ = { at: Date.now(), m: m }; } return PJ.m[pid] || null; }
function myEmail(){ try { var A = W.__GC_AUTH__, e = A && A.email && A.email(); if (e) return low(e); } catch (x) {} return ''; }
function signedIn(){ return !!myEmail(); }
function meUser(){ var e = myEmail(); return arr(crm().users).filter(function(u){ return u && e && low(u.email) === e; })[0] || null; }
function myName(){ var u = meUser(); return s(u && u.name) || s(lsGet('grayco_user')) || myEmail(); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function rp(){ try { return W._gcRP && W._gcRP.status ? W._gcRP.status() : null; } catch (e) { return null; } }
function isOffice(){ if (myEmail() === 'office@grayco-cs.com') return true; var st = rp(); if (st && /^office/i.test(s(st.role))) return true; var u = meUser(); return !!(u && /office/i.test(s(u.role))); }
function myRole(){ return isAdmin() ? 'admin' : isOffice() ? 'office' : /project manager/i.test(s((meUser() || {}).role)) ? 'pm' : 'staff'; }
/* who sees ✅ Approvals (by role, never by name): admins, the office, project managers */
function canSee(){ if (!signedIn()) return false; var r = myRole(); return r === 'admin' || r === 'office' || r === 'pm'; }
function device(){ try { if (typeof W._gcAwayDevice === 'function') return s(W._gcAwayDevice()); } catch (e) {} return /iPhone|Android.+Mobile/i.test(navigator.userAgent || '') ? 'phone' : 'computer'; }
function bare(k){ return s(k).replace(/#\d+$/, ''); }
function tms(v){ if (typeof v === 'number') return v; var t = Date.parse(s(v)); return isFinite(t) ? t : 0; }
function when(t, withYear){
  if (!t) return '';
  try { var d = new Date(t), y = d.getFullYear() !== new Date().getFullYear() || withYear;
    return d.toLocaleString('en-US', y ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
}
function ymdLocal(t){ var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function bump(){ CACHE.at = 0; try { if (W._gcAPX && W._gcAPX.draw) W._gcAPX.draw(); } catch (e) {} if (H.open) paintList(); }

/* ── the outcome words ── */
var OUT = { approved: ['✅', 'Approved'], recorded: ['🔕', 'Approved — not sent'], denied: ['✖', 'Denied'], answered: ['↩', 'Answered'], merged: ['🔗', 'Merged (same sub)'], kept: ['↔', 'Kept apart (different subs)'] };
function outOf(d){ return OUT[d] || OUT.approved; }
function roleL(r){ r = low(r); return r === 'admin' ? 'Admin' : r === 'office' ? 'Office' : (r === 'pm' || /project manager/.test(r)) ? 'PM' : ''; }
function kindL(rec){
  var k = s(rec.kind);
  if (rec.src === 'queue' && k && !/\s/.test(k) && /_/.test(k)) { try { if (W._gcAPX && W._gcAPX.kindLabel) return s(W._gcAPX.kindLabel(k)); } catch (e) {} return k.replace(/_/g, ' ').replace(/^\w/, function(c){ return c.toUpperCase(); }); }
  return k || 'Approval';
}

/* ── 3. this computer's own decisions (until the server has them) ── */
function mine(){ try { var v = JSON.parse(lsGet(LSK) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function saveMine(l){ l = l.filter(function(x){ return x && (!x.sent || Date.now() - tms(x.at) < 3 * DAY); }).slice(-300); lsSet(LSK, JSON.stringify(l)); }
var SENDING = {};
function send(x){
  if (!x || x.sent || x.local || SENDING[x.lid] || !signedIn() || typeof W.fetch !== 'function') return;
  SENDING[x.lid] = 1;
  var rec = { key: x.key, src: x.src, kind: x.kind, title: x.title, job: x.job, pid: x.pid, decision: x.decision, note: x.note, device: x.device, at: x.at };
  W.fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'audit', rec: rec }), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }); }).then(function(j){
      delete SENDING[x.lid];
      if (j && (j.ok || j.dup)) { var l = mine(); l.forEach(function(y){ if (y && y.lid === x.lid) y.sent = Date.now(); }); saveMine(l); SRV.at = 0; }
    }, function(){ delete SENDING[x.lid]; });
}
/* log({ key, src, kind, title, job?, pid?, decision, note? }, { local: true } = already sent by someone else (patch AWAY)) */
function log(rec, o){
  try {
    if (!rec || !s(rec.key)) return null;
    var x = { lid: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), key: bare(rec.key), src: s(rec.src), kind: clip(rec.kind, 40), title: clip(rec.title, 160),
      job: clip(rec.job, 120), pid: s(rec.pid), decision: OUT[s(rec.decision)] ? s(rec.decision) : 'approved', note: clip(rec.note, 200), by: myName(), email: myEmail(), role: myRole(),
      device: device(), at: new Date().toISOString(), sent: 0 };
    if (o && o.local) x.local = 1;
    var l = mine(); l.push(x); saveMine(l);
    send(x); bump();
    return x;
  } catch (e) { warn(e); return null; }
}
function retry(){ if (!signedIn()) return; mine().forEach(function(x){ if (x && !x.sent && !x.local && Date.now() - tms(x.at) < 7 * DAY) send(x); }); }

/* ── 1. the server's record (appr-away op history), a page at a time ── */
var SRV = { items: [], more: false, total: 0, at: 0, busy: null, err: '' };
function fetchPage(before){
  return W.fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'history', before: before || '', limit: 400 }), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }); });
}
function load(force){
  if (!canSee() || typeof W.fetch !== 'function') return Promise.resolve(SRV);
  if (SRV.busy) return SRV.busy;
  if (!force && SRV.at && Date.now() - SRV.at < 60000) return Promise.resolve(SRV);
  SRV.busy = fetchPage('').then(function(j){
    SRV.busy = null; SRV.at = Date.now();
    if (j && j.ok && Array.isArray(j.items)) {
      var keepOlder = SRV.items.length > j.items.length && j.items.length ? SRV.items.filter(function(x){ return s(x.at) < s(j.items[j.items.length - 1].at); }) : [];
      SRV.items = j.items.concat(keepOlder); SRV.more = keepOlder.length ? SRV.more : !!j.more; SRV.total = +j.total || SRV.items.length; SRV.err = '';
    } else SRV.err = s(j && j.error) || 'Could not load the history.';
    bump(); return SRV;
  }, function(){ SRV.busy = null; SRV.at = Date.now(); SRV.err = 'No connection — showing what this computer has.'; bump(); return SRV; });
  return SRV.busy;
}
function loadOlder(){
  if (SRV.busy || !SRV.more || !SRV.items.length) return Promise.resolve(SRV);
  var before = s(SRV.items[SRV.items.length - 1].at);
  SRV.busy = fetchPage(before).then(function(j){
    SRV.busy = null;
    if (j && j.ok && Array.isArray(j.items)) { SRV.items = SRV.items.concat(j.items); SRV.more = !!j.more; }
    bump(); return SRV;
  }, function(){ SRV.busy = null; return SRV; });
  return SRV.busy;
}

/* ── 2. what the records keep ── */
function queue(){ try { var c = W._gcCustApprovals ? W._gcCustApprovals() : null; return arr(c && c.all); } catch (e) { return []; } }
function lsList(k){ try { var v = JSON.parse(lsGet(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function jobOf(pid, fb){ var p = proj(pid); if (!p) return s(fb); try { if (W._gcJobLabel) return s(W._gcJobLabel(p)); } catch (e) {} return [s(p.autoPO || p.po) ? 'PO ' + s(p.autoPO || p.po) : '', s(p.name)].filter(Boolean).join(' · '); }
function derived(){
  var out = [];
  queue().forEach(function(x){
    if (!x || !x.id) return;
    var aps = arr(x.approvals), pid = s(x.jobId || x.pid), base = { key: 'ap2:' + s(x.id), src: 'queue', kind: s(x.kind), title: s(x.title) || s(x.subject), job: jobOf(pid, x.jobName), pid: pid, pm: s(x.pm), d: 1 };
    aps.forEach(function(a, i){
      if (!a || !a.at) return;
      var last = i === aps.length - 1;
      out.push(Object.assign({}, base, { decision: last && x.status === 'recorded' ? 'recorded' : 'approved', by: s(a.by), email: low(a.email), role: a.role || (a.step === 'pm' ? 'pm' : ''), at: tms(a.at), device: s(a.device) }));
    });
    if (x.status === 'rejected' && x.rejectedAt) out.push(Object.assign({}, base, { decision: 'denied', by: s(x.rejectedBy), at: tms(x.rejectedAt), note: s(x.reason) }));
  });
  lsList('gc_sub_approvals').forEach(function(a){
    if (!a || !a.pmDecidedAt || a.status === 'pending_pm') return;
    var ok = /approved/.test(s(a.status));
    out.push({ key: 'sub:' + s(a.invId || a.id), src: 'sub', kind: 'Sub invoice', title: 'Sub invoice — ' + (s(a.sub || a.subName || a.vendor) || 'Sub') + (a.amt || a.amount ? ' $' + Number(a.amt || a.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''),
      job: jobOf(a.pid, ''), pid: s(a.pid), pm: s(a.pmName), decision: ok ? 'approved' : 'denied', by: s(a.decidedBy || a.pmDecidedBy), at: tms(a.pmDecidedAt), note: s(ok ? a.approveNote : a.denyNote), d: 1 });
  });
  try {
    if (W._gcTimeOff && W._gcTimeOff.list) arr(W._gcTimeOff.list()).forEach(function(r){
      if (!r || !r.decidedAt || (r.status !== 'approved' && r.status !== 'denied')) return;
      out.push({ key: 'td:to:' + s(r.id), src: 'other', kind: 'Time off', title: '🏖 Time off: ' + s(r.name) + ' · ' + s(r.from) + (r.to && r.to !== r.from ? ' → ' + s(r.to) : ''), job: '', pid: '',
        decision: r.status === 'approved' ? 'approved' : 'denied', by: s(r.decidedBy), email: low(r.decidedByEmail), at: tms(r.decidedAt), note: s(r.decisionNote), d: 1 });
    });
  } catch (e) {}
  projects().forEach(function(p){
    if (!p) return;
    arr(p.materialRequests).forEach(function(m){
      if (!m || !m.decidedAt || m.status === 'pending_pm') return;
      out.push({ key: 'mat:' + s(m.id), src: 'mat', kind: 'Materials', title: 'Materials: ' + s(m.item) + (m.qty ? ' × ' + s(m.qty) : ''), job: jobOf(p.id, p.name), pid: s(p.id), pm: s(p.pm),
        decision: /approv/i.test(s(m.status)) ? 'approved' : 'denied', by: s(m.decidedBy), at: tms(m.decidedAt), d: 1 });
    });
  });
  return out;
}

/* ── the one record: merged, de-duplicated, newest first ── */
var CACHE = { at: 0, v: [] };
function norm(x, src){
  var r = { id: s(x.id || x.lid), key: bare(x.key), src: s(x.src), kind: s(x.kind), title: s(x.title), job: s(x.job), pid: s(x.pid), pm: s(x.pm), decision: OUT[s(x.decision)] ? s(x.decision) : 'approved',
    by: s(x.by), email: low(x.email), role: s(x.role), device: s(x.device), at: tms(x.at), note: s(x.note), from: src };
  r.kindL = kindL(r);
  if (!r.job && r.pid) r.job = jobOf(r.pid, '');
  return r;
}
function samePerson(a, b){
  if (a.email && b.email) return a.email === b.email;
  var x = low(a.by), y = low(b.by);
  if (!x || !y) return true;
  return x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0];
}
function all(){
  if (CACHE.at && Date.now() - CACHE.at < 1500) return CACHE.v;
  var list = [];
  try { derived().forEach(function(x){ list.push(norm(x, 'rec')); }); } catch (e) { warn(e); }
  SRV.items.forEach(function(x){ list.push(norm(x, 'srv')); });
  mine().forEach(function(x){ list.push(norm(x, 'me')); });
  list = list.filter(function(r){ return r.key && r.at; });
  list.sort(function(a, b){ return a.at - b.at; });
  var byKey = {}, out = [];
  list.forEach(function(r){
    var g = byKey[r.key] = byKey[r.key] || [], hit = null;
    for (var i = 0; i < g.length; i++) { var o = g[i]; if (o.decision === r.decision && Math.abs(o.at - r.at) < 10 * 60e3 && samePerson(o, r)) { hit = o; break; } }
    if (!hit) { g.push(r); out.push(r); return; }
    ['pid', 'job', 'email', 'device', 'note', 'pm', 'title', 'by'].forEach(function(f){ if (!hit[f] && r[f]) hit[f] = r[f]; });
    if (!roleL(hit.role) && roleL(r.role)) hit.role = r.role;
    if (r.from === 'srv' && hit.from !== 'rec') hit.id = r.id;
  });
  out.sort(function(a, b){ return b.at - a.at; });
  CACHE = { at: Date.now(), v: out };
  return out;
}
/* what this person may see: admins and the office everything; a PM his own decisions and his jobs' */
function visible(sc){
  var l = all(); sc = sc || {};
  if (sc.kind !== 'pm') return l;
  var me = low(sc.preview ? sc.pm : myName()), em = sc.preview ? '' : myEmail();
  return l.filter(function(r){
    if (em && r.email === em) return true;
    if (me && low(r.by) === me) return true;
    var p = proj(r.pid); if (p && low(p.pm || p.projectManager) === me) return true;
    return !!(me && low(r.pm) === me);
  });
}

/* ── 🕘 Recently approved: the newest 8 items (14 days), then the history button ── */
function chainOf(g){
  return g.slice().sort(function(a, b){ return a.at - b.at; }).map(function(r){ var o = outOf(r.decision), rl = roleL(r.role);
    return o[0] + ' ' + (r.decision === 'approved' ? '' : o[1].toLowerCase() + ' · ') + (rl ? rl + ' · ' : '') + (r.by || 'someone') + ' ' + when(r.at) + (r.note && r.decision !== 'approved' ? ' — “' + clip(r.note, 80) + '”' : ''); }).join(' → ');
}
function recentHtml(sc, now, apxRec){
  if (!canSee()) return '';
  if (!SRV.at && !SRV.busy) later(function(){ load(false); }, 50);
  else if (SRV.at && Date.now() - SRV.at > 60000 && !SRV.busy) later(function(){ load(false); }, 50);
  now = now || Date.now();
  var cut = now - 14 * DAY, vis = visible(sc), groups = {}, order = [];
  vis.forEach(function(r){ if (r.at < cut) return; if (!groups[r.key]) { groups[r.key] = []; order.push(r.key); } groups[r.key].push(r); });
  var apx = {}; arr(apxRec).forEach(function(x){ if (x && x.key) apx[bare(x.key)] = x; });
  arr(apxRec).forEach(function(x){ if (x && x.key && !groups[bare(x.key)] && x.t >= cut) { groups[bare(x.key)] = []; order.push(bare(x.key)); } });
  var rows = order.map(function(k){
    var g = groups[k], a = apx[k], top = g[0];
    var t = Math.max(top ? top.at : 0, a ? a.t : 0);
    return { k: k, t: t, icon: a ? a.icon : outOf(top.decision)[0], title: a ? a.title : (top.title || top.kindL), kind: top ? top.kindL : '', job: (a && a.job) || (top && top.job) || '', pid: (a && a.pid) || (top && top.pid) || '', chain: a && a.chain ? a.chain : chainOf(g) };
  }).sort(function(a, b){ return b.t - a.t; });
  var n = vis.length;
  var h = '<div class="apx-rh">🕘 Recently approved <span>(14 days — who approved each step, and when)</span></div>';
  h += rows.length ? '<div class="apx-rec" data-apxh-recent="1">' + rows.slice(0, RECENT_N).map(function(x){
      return '<div class="apx-rr" data-apxh-k="' + esc(x.k) + '"><div><b>' + x.icon + ' ' + esc(x.title) + '</b>' + (x.kind && x.kind !== 'Approval' ? ' <span class="apxh-kind">' + esc(x.kind) + '</span>' : '')
        + (x.job ? ' <span class="apx-j2">· ' + (x.pid ? '<button type="button" class="apxh-job" data-apxh-job="' + esc(x.pid) + '">' + esc(x.job) + '</button>' : esc(x.job)) + '</span>' : '') + '</div><div class="apx-ch">' + esc(x.chain) + '</div></div>';
    }).join('') + '</div>' : '<div class="apx-empty sm">Nothing approved in the last 14 days.</div>';
  h += '<button type="button" class="apxh-all" data-apxh-open="1">📜 All approvals history (' + n + (SRV.more ? '+' : '') + ')</button>';
  return h;
}

/* ── 📜 the history screen (in the page, in place of the Approvals list; ← Back returns) ── */
var H = { open: false, sort: 'new', kind: '', who: '', out: '', from: '', to: '', q: '', lim: PAGE };
function scopeNow(){ try { return W._gcAPX && W._gcAPX.state ? W._gcAPX.state().scope : null; } catch (e) { return null; } }
function filtered(){
  var l = visible(scopeNow()), q = low(H.q);
  l = l.filter(function(r){
    if (H.kind && r.kindL !== H.kind) return false;
    if (H.who && low(r.by) !== low(H.who)) return false;
    if (H.out && r.decision !== H.out) return false;
    if (H.from && ymdLocal(r.at) < H.from) return false;
    if (H.to && ymdLocal(r.at) > H.to) return false;
    if (q && low([r.title, r.job, r.by, r.kindL, r.note, outOf(r.decision)[1]].join(' ')).indexOf(q) < 0) return false;
    return true;
  });
  var cmp = H.sort === 'old' ? function(a, b){ return a.at - b.at; }
    : H.sort === 'who' ? function(a, b){ return low(a.by) < low(b.by) ? -1 : low(a.by) > low(b.by) ? 1 : b.at - a.at; }
    : H.sort === 'kind' ? function(a, b){ return low(a.kindL) < low(b.kindL) ? -1 : low(a.kindL) > low(b.kindL) ? 1 : b.at - a.at; }
    : function(a, b){ return b.at - a.at; };
  return l.slice().sort(cmp);
}
function opt(v, l, cur){ return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; }
function shellHtml(){
  var l = visible(scopeNow()), kinds = {}, people = {};
  l.forEach(function(r){ if (r.kindL) kinds[r.kindL] = 1; if (r.by) people[r.by] = 1; });
  return '<div class="apxh" data-apxh="1">'
    + '<div class="apxh-top"><button type="button" class="apxh-back" data-apxh-back="1">← Back to Approvals</button><h2>📜 All approvals history</h2></div>'
    + '<div class="apxh-sub">Every approval decision — who, what, when and the outcome. Kept for good: older ones are archived, never deleted.</div>'
    + '<div class="apxh-fl">'
    + '<input type="search" data-apxh-f="q" placeholder="Search what, job, person…" value="' + esc(H.q) + '" autocomplete="off">'
    + '<select data-apxh-f="sort" aria-label="Sort">' + opt('new', 'Newest first', H.sort) + opt('old', 'Oldest first', H.sort) + opt('who', 'By person', H.sort) + opt('kind', 'By kind', H.sort) + '</select>'
    + '<select data-apxh-f="kind" aria-label="Kind">' + opt('', 'Every kind', H.kind) + Object.keys(kinds).sort().map(function(k){ return opt(k, k, H.kind); }).join('') + '</select>'
    + '<select data-apxh-f="who" aria-label="Person">' + opt('', 'Everyone', H.who) + Object.keys(people).sort().map(function(k){ return opt(k, k, H.who); }).join('') + '</select>'
    + '<select data-apxh-f="out" aria-label="Outcome">' + opt('', 'Any outcome', H.out) + Object.keys(OUT).map(function(k){ return opt(k, OUT[k][1], H.out); }).join('') + '</select>'
    + '<label>From <input type="date" data-apxh-f="from" value="' + esc(H.from) + '"></label><label>To <input type="date" data-apxh-f="to" value="' + esc(H.to) + '"></label>'
    + '<button type="button" class="apxh-clear" data-apxh-clear="1">Clear</button></div>'
    + '<div data-apxh-list="1"></div></div>';
}
function rowHtml(r){
  var o = outOf(r.decision), rl = roleL(r.role);
  return '<div class="apxh-row" data-apxh-row="' + esc(r.id || r.key) + '">'
    + '<div class="apxh-when">' + esc(when(r.at, true)) + '</div>'
    + '<div class="apxh-who">' + esc(r.by || '—') + (rl ? ' <span class="apxh-role">' + rl + '</span>' : '') + '</div>'
    + '<div class="apxh-what"><span class="apxh-kind">' + esc(r.kindL) + '</span> ' + esc(r.title || '') + (r.job ? '<div class="apxh-jl">🏗 ' + (r.pid ? '<button type="button" class="apxh-job" data-apxh-job="' + esc(r.pid) + '">' + esc(r.job) + '</button>' : esc(r.job)) + '</div>' : '')
    + (r.note ? '<div class="apxh-note">“' + esc(clip(r.note, 200)) + '”</div>' : '') + '</div>'
    + '<div class="apxh-out ' + esc(r.decision) + '">' + o[0] + ' ' + esc(o[1]) + (r.device && r.device !== 'unknown' ? '<span class="apxh-dev">' + esc(r.device) + '</span>' : '') + '</div></div>';
}
function listHtml(){
  var l = filtered(), shown = l.slice(0, H.lim);
  var h = '<div class="apxh-n">' + (l.length ? 'Showing ' + shown.length + ' of ' + l.length + ' decision' + (l.length === 1 ? '' : 's') : 'No decisions match.') + (SRV.busy ? ' · loading…' : '') + (SRV.err ? ' · ⚠ ' + esc(SRV.err) : '') + '</div>';
  h += '<div class="apxh-head"><div>When</div><div>Who</div><div>What</div><div>Outcome</div></div>';
  h += shown.map(rowHtml).join('');
  if (l.length > shown.length) h += '<button type="button" class="apxh-more" data-apxh-more="1">Load more (' + (l.length - shown.length) + ' more)</button>';
  else if (SRV.more) h += '<button type="button" class="apxh-more" data-apxh-older="1">Load older decisions</button>';
  return h;
}
var PSIG = '';
function paintList(){
  var box = D.querySelector('#gc-apxh [data-apxh-list]'); if (!box) return;
  var h = listHtml(); if (h === PSIG && box.firstChild) return; PSIG = h; box.innerHTML = h;
}
function mount(){ var m = D.getElementById('gc-apx-mount'); return m && m.isConnected ? m : null; }
function view(){ try { return localStorage.getItem('grayco_view') || ''; } catch (e) { return ''; } }
function openHist(){
  if (!canSee()) return false;
  var m = mount();
  if (!m) { try { if (W._gcAPX && W._gcAPX.open) W._gcAPX.open(''); } catch (e) {} later(function(){ if (mount()) openHist(); }, 600); return false; }
  close(true);
  H.open = true; H.lim = PAGE; PSIG = '';
  var p = D.createElement('div'); p.id = 'gc-apxh'; p.setAttribute('data-gc-keep', '1'); p.innerHTML = shellHtml();
  m.parentNode.insertBefore(p, m.nextSibling); m.style.display = 'none';
  paintList(); load(true).then(function(){ if (H.open) { var w = D.querySelector('#gc-apxh .apxh-fl'); if (w && !w.contains(D.activeElement)) { var fresh = D.createElement('div'); fresh.innerHTML = shellHtml(); var nf = fresh.querySelector('.apxh-fl'); if (nf) w.parentNode.replaceChild(nf, w); } paintList(); } });
  try { W.scrollTo(0, 0); } catch (e) {}
  return true;
}
function close(quiet){
  var p = D.getElementById('gc-apxh'); if (p) p.remove();
  var m = D.getElementById('gc-apx-mount'); if (m) m.style.display = '';
  H.open = false;
  if (!quiet) { try { if (W._gcAPX && W._gcAPX.draw) W._gcAPX.draw(); } catch (e) {} }
}
every(function(){ if (!H.open) return; var p = D.getElementById('gc-apxh'), m = mount(); if (!p || !m || view() !== 'approvals' || p.previousSibling !== m) close(true); }, 1000);

var QT = 0;
D.addEventListener('click', function(ev){
  var t = ev.target; if (!t || !t.closest) return;
  var j = t.closest('[data-apxh-job]');
  if (j) { ev.preventDefault(); ev.stopPropagation(); var pid = j.getAttribute('data-apxh-job'); close(true); try { if (typeof W._gcGoToTaskJob === 'function') W._gcGoToTaskJob(pid, ''); else { lsSet('grayco_openpid', pid); if (W._setView) W._setView('projects'); } } catch (e) { warn(e); } return; }
  if (t.closest('[data-apxh-open]')) { ev.preventDefault(); ev.stopPropagation(); openHist(); return; }
  if (!t.closest('#gc-apxh')) return;
  if (t.closest('[data-apxh-back]')) { ev.preventDefault(); close(); return; }
  if (t.closest('[data-apxh-more]')) { ev.preventDefault(); H.lim += PAGE; paintList(); return; }
  if (t.closest('[data-apxh-older]')) { ev.preventDefault(); loadOlder(); paintList(); return; }
  if (t.closest('[data-apxh-clear]')) { ev.preventDefault(); H.kind = H.who = H.out = H.from = H.to = H.q = ''; H.sort = 'new'; H.lim = PAGE; var p = D.getElementById('gc-apxh'); if (p) { p.innerHTML = shellHtml(); PSIG = ''; paintList(); } return; }
}, true);
function onField(ev){
  var t = ev.target; if (!t || !t.getAttribute || !t.closest || !t.closest('#gc-apxh')) return;
  var f = t.getAttribute('data-apxh-f'); if (!f) return;
  H[f] = s(t.value); H.lim = PAGE;
  if (f === 'q') { clearTimeout(QT); QT = later(paintList, 150); } else paintList();
}
D.addEventListener('input', onField, true);
D.addEventListener('change', onField, true);

/* ── the decisions the Approvals tab offers that nothing recorded before ── */
function wrapFn(o, name, mk){ if (!o || typeof o[name] !== 'function' || o[name].__gcApprHist) return; var f = o[name], w = mk(f); w.__gcApprHist = true; o[name] = w; }
function hooks(){
  /* patch AWAY's audit (Approvals tab ✅ / ✕ on the CRM-only kinds): shown here at once; AWAY sends it to the server */
  wrapFn(W, '_gcAwayAudit', function(f){ return function(r, decision){ var out = f.apply(this, arguments); try { if (r && r.src !== 'queue' && !/^ap2:/.test(s(r.key))) log({ key: r.key, src: r.src, kind: r.kindL || r.kind, title: r.title, job: r.job, pid: r.pid, decision: decision === 'denied' ? 'denied' : 'approved' }, { local: true }); } catch (e) { warn(e); } return out; }; });
  /* sub / supplier sign-ups (🏗 Bid portal): approve / deny */
  wrapFn(W._gcSubsBids, 'decide', function(f){ return function(id, ok){
    var b = null; try { b = arr(W._gcSubsBids.list()).filter(function(x){ return x && s(x.id) === s(id); })[0]; } catch (e) {}
    var p = f.apply(this, arguments);
    Promise.resolve(p).then(function(r){ if (r && r.ok) log({ key: 'bp:su:' + s(id), src: 'bp', kind: /supplier|vendor/i.test(s(b && (b.kind || b.type || b.role))) ? 'Supplier sign-up' : 'Sub sign-up',
      title: (ok ? 'Sign-up approved: ' : 'Sign-up denied: ') + (s(b && (b.company || b.name || b.email)) || 'a sub'), decision: ok ? 'approved' : 'denied' }); }, function(){});
    return p; }; });
  /* 🔗 Same sub? — merged / kept apart */
  wrapFn(W._gcBidSubs, 'decideSame', function(f){ return function(key, d){
    var it = null; try { it = arr(W._gcBidSubs.same()).filter(function(x){ return x && x.key === key; })[0]; } catch (e) {}
    var r = f.apply(this, arguments);
    try { if (r && !r.error) { var x = (it && it.x) || {}; log({ key: 'bp:same:' + s(key), src: 'bp', kind: 'Same sub?', title: '🔗 ' + (s(x.company || x.name || x.email) || 'Bid-portal sub') + (it && arr(it.cands).length ? ' ↔ ' + arr(it.cands).map(function(c){ return s(c.name); }).join(' / ') : ''), decision: d === 'same' ? 'merged' : 'kept' }); } } catch (e) { warn(e); }
    return r; }; });
  /* 📩 plan / info request answered (PRQUICK calls _gcBpAppr.answered) */
  wrapFn(W._gcBpAppr, 'answered', function(f){ return function(jid){
    var j = null; try { j = arr(W._gcBpAppr.jobs()).filter(function(x){ return x && s(x.id) === s(jid); })[0]; } catch (e) {}
    try { log({ key: 'bp:pr:' + s(jid), src: 'bp', kind: 'Plan / info request', title: '📩 Plan / info request answered — ' + (s(j && j.title) || 'bid job'), pid: s(j && j.crmProjectId), job: s(j && j.title), decision: 'answered' }); } catch (e) { warn(e); }
    return f.apply(this, arguments); }; });
  /* invoices signed off in the old APPROVE panel */
  wrapFn(W, '_gcApproveInvoice', function(f){ return function(invId){
    var r = f.apply(this, arguments);
    try { var iv = arr(crm().invoices || crm().invs).filter(function(x){ return x && s(x.id) === s(invId); })[0]; log({ key: 'inv:' + s(invId), src: 'inv', kind: 'Invoice to sign off', title: 'Invoice signed off — ' + (s(iv && (iv.invNum || iv.desc || iv.drawType)) || s(invId)), pid: s(iv && iv.pid), decision: 'approved' }); } catch (e) { warn(e); }
    return r; }; });
}
hooks(); (function(){ var n = 0, iv = every(function(){ hooks(); if (++n > 60) { clearInterval(iv); every(hooks, 30000); } }, 2000); })();
later(retry, 8000); every(retry, 60000);

/* ── the look (no navy; desk and phone) ── */
try {
  var css = D.createElement('style'); css.id = 'gc-apprhist-css';
  css.textContent = '.apxh-all{display:block;width:100%;margin:8px 0 4px;padding:10px 12px;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;font:700 14px Inter,Arial,sans-serif;cursor:pointer;text-align:center}.apxh-all:hover{background:#f1f5f9}'
    + '.apxh-job{border:0;background:none;padding:0;margin:0;font:inherit;color:#7c3aed;cursor:pointer;text-decoration:underline;text-decoration-color:#c4b5fd;text-align:left}.apxh-job:hover{color:#6d28d9}'
    + '.apxh-kind{display:inline-block;font-size:11px;font-weight:700;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:1px 7px;margin-right:4px;vertical-align:1px}'
    + '.apxh{max-width:1100px;margin:0 auto;padding:16px;font-family:Inter,-apple-system,Arial,sans-serif;color:#0f172a}.apxh-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.apxh-top h2{margin:0;font-size:20px}'
    + '.apxh-back{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 12px;min-height:40px;font:700 13px Inter,Arial;cursor:pointer;color:#0f172a}.apxh-sub{color:#475569;font-size:13px;margin:6px 0 10px}'
    + '.apxh-fl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px}.apxh-fl input,.apxh-fl select{padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;font:14px Inter,Arial;min-height:38px;background:#fff;color:#0f172a;box-sizing:border-box}.apxh-fl input[type=search]{flex:1 1 220px;min-width:0}.apxh-fl label{font-size:12px;color:#475569;display:flex;align-items:center;gap:4px}'
    + '.apxh-clear{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 12px;min-height:38px;cursor:pointer;font:600 13px Inter,Arial}.apxh-n{font-size:12.5px;color:#475569;margin:4px 0 6px}'
    + '.apxh-head,.apxh-row{display:grid;grid-template-columns:150px 170px 1fr 190px;gap:10px;align-items:start}.apxh-head{font-size:11.5px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.03em;padding:4px 10px;border-bottom:1px solid #e2e8f0}'
    + '.apxh-row{padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;background:#fff}.apxh-row:nth-child(even){background:#f8fafc}.apxh-when{color:#334155;white-space:nowrap}.apxh-who{font-weight:700}.apxh-role{font-size:11px;font-weight:700;color:#475569;background:#e2e8f0;border-radius:999px;padding:0 6px;margin-left:2px}'
    + '.apxh-jl{margin-top:3px;font-size:12.5px}.apxh-note{margin-top:3px;color:#475569;font-size:12.5px;font-style:italic}.apxh-out{font-weight:700}.apxh-out.denied{color:#b91c1c}.apxh-out.approved{color:#15803d}.apxh-out.recorded{color:#a16207}.apxh-out.answered,.apxh-out.merged,.apxh-out.kept{color:#334155}'
    + '.apxh-dev{display:block;font-weight:400;font-size:11px;color:#64748b}.apxh-more{display:block;width:100%;margin:10px 0;padding:10px;min-height:44px;border:1px dashed #94a3b8;border-radius:10px;background:#fff;color:#0f172a;font:700 14px Inter,Arial;cursor:pointer}'
    + '@media (max-width:760px){.apxh{padding:12px 16px}.apxh-head{display:none}.apxh-row{grid-template-columns:1fr auto;gap:2px 10px}.apxh-when{grid-column:1;font-size:12px;color:#64748b}.apxh-out{grid-column:2;grid-row:1 / span 2;text-align:right;font-size:12.5px}.apxh-who{grid-column:1}.apxh-what{grid-column:1 / -1}.apxh-fl select,.apxh-fl label{flex:1 1 45%}.apxh-fl label input{flex:1;min-width:0}}';
  (D.head || D.documentElement).appendChild(css);
} catch (e) {}

W._gcApprHist = { log: log, all: all, visible: visible, load: load, loadOlder: loadOlder, recentHtml: recentHtml, open: openHist, close: close, state: function(){ return { open: H.open, srv: { n: SRV.items.length, more: SRV.more, total: SRV.total, err: SRV.err }, mine: mine().length, ui: Object.assign({}, H) }; }, _t: { derived: derived, filtered: filtered } };
try { console.log('[GC] 📜 Approvals history (patch APPRHIST) — _gcApprHist.all()'); } catch (e) {}
})(window, document);
