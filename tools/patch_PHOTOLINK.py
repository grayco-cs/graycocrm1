#!/usr/bin/env python3
"""Idempotent patch PHOTOLINK — GrayCo Photos: the CRM's own 2026 jobs show their photos; the screen opens fast;
photos load ONLY while GrayCo Photos (or a job's photos) is open.

Owner: "grayco photos is being a little slow and all photos from crm in 2026 aren't in here from company cam but
trooper tree is" + rule: photos load only when someone opens GrayCo Photos or a job's photos — never in the
background, never on a timer, never preloaded; leaving the screen stops all of it.

 1. A job carries more than one photo project (ccMoreIds, written by the 15-minute companycam-sync, never replacing
    a link): its photos come from all of them; the look-alike project no longer shows as a separate card.
 2. "Link these photo projects" on GrayCo Photos (admin / office): every project the sync could not tie for sure, with
    the job(s) it could be — one tap "Link" (the photos show at once) or "Not this job".
 3. Speed: job cards show the project's cover + photo count from the project list (no photo read per card); a job's
    photos show after the first page (the rest follow); the project list / lead check / last-activity are built once
    per change (were O(jobs x leads) and O(jobs x messages) per redraw); itemById is a lookup.
 4. Only while open: photo-list pulls, CompanyCam calls (projects, photos, feed, status), the photos realtime channel.
    Leaving the screen aborts the CompanyCam reads in flight, stops the image queue and drops the photo lists.
    A gate (window.__gcPhotoGateOpen) refuses any CompanyCam request from this page while no photo screen is open;
    patch I's background CompanyCam work (status re-asks, 30-minute review pull, inbox loop, "outbound" find/create
    for new CRM jobs) no longer runs — the server links CRM jobs to the PM's own CompanyCam project instead.
    The CompanyCam To-Do lines show the last answer this computer saw (no fetch from the To-Do).
Each find-string must occur exactly once."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch PHOTOLINK */'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new, label, count=1):
    global src
    assert src.count(old) == count, (label, 'count', src.count(old))
    src = src.replace(old, new)

# ── 0. the gate: a script of its own, right before GrayCo Photos (patch I is above it) ────────────────────────────
GATE = r"""<script id="gc-patch-photolink">
/* patch PHOTOLINK — photos and CompanyCam only while a photo screen is open (owner rule 10/27).
   A photo screen: GrayCo Photos (#gcuOv, the tab or full screen), the CompanyCam sync status window or its Admin section,
   the "New in CompanyCam" list. Anything else asking CompanyCam from this page gets the gate's empty answer (no request
   leaves the computer). A new job's "Also create in CompanyCam" (a person pressing Save) still goes through. */
(function(){
'use strict';
if (window.__GC_PHOTOLINK_GATE__) return; window.__GC_PHOTOLINK_GATE__ = true;
var lastPress = 0;
['pointerdown', 'keydown'].forEach(function(t){ document.addEventListener(t, function(e){ if (e.isTrusted !== false) lastPress = Date.now(); }, true); });
function open(){ try { return !!document.querySelector('#gcuOv, #gc-ccsync-ov, #_gcCCRev, [data-gc-cc-screen]'); } catch (e) { return false; } }
window.__gcPhotoGateOpen = open;
function wrap(){
  var a = window.__gcCCAllow;
  if (typeof a === 'function' && !a.__photolink) {
    var w = function(u, init){
      if (open()) return a.apply(this, arguments);
      try { if (/[?&]proxy=create\b/.test(String(u || '')) && String((init && init.method) || '').toUpperCase() === 'POST' && Date.now() - lastPress < 20000) return a.apply(this, arguments); } catch (e) {}
      return false;
    };
    w.__photolink = true; window.__gcCCAllow = w;
  }
  var c = window._gcCCCheckStatus;
  if (typeof c === 'function' && !c.__photolink) {
    var wc = function(){ if (open()) return c.apply(this, arguments); var st = null; try { st = window._gcCCStatus().state; } catch (e) {} return Promise.resolve(st); };
    wc.__photolink = true; window._gcCCCheckStatus = wc;
  }
  var r = window._gcCCReviewCheck;
  if (typeof r === 'function' && !r.__photolink) {
    var wr = function(){ if (open()) return r.apply(this, arguments); return Promise.resolve([]); };
    wr.__photolink = true; window._gcCCReviewCheck = wr;
  }
}
wrap();
window._gcPhotoGateWrap = wrap;
})();
</script>
"""
sub("""<script id="gc-patch-u">""", GATE + """<script id="gc-patch-u">""", 'gate script')

# ── 1. patch I: no CompanyCam project is made from the browser behind anyone's back ─────────────────────────────────
sub("""async function outbound(){
  if (outBusy || !on() || !idle()) return 0;""",
"""async function outbound(){
  /* patch PHOTOLINK: off — it made a second, empty CompanyCam project for a CRM job (and, because the server's create
     answers {ok, id} and this read {created, id}, never saved the link). The 15-minute companycam-sync ties a CRM job
     to the PM's own CompanyCam project by its address instead; a person can tie one by hand on GrayCo Photos. */
  if (!window.__GC_CC_OUTBOUND_ON__) return 0;
  if (outBusy || !on() || !idle()) return 0;""", 'outbound off')
sub("""        if (c.ok && c.data && c.data.created && c.data.id) res = c.data;""",
"""        if (c.ok && c.data && (c.data.created || c.data.ok) && c.data.id) res = c.data;   /* patch PHOTOLINK: the server answers {ok, id} */""", 'outbound created')

# ── 2. GrayCo Photos (patch U) ─────────────────────────────────────────────────────────────────────────────────────
sub("""function ccIdOf(p){ if (!p) return ''; var f = ['ccProjectId', 'companyCamId', 'companycamId', 'ccamId', 'ccId', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'ccProjectUrl', 'id']; for (var i = 0; i < f.length; i++) { var id = ccIdFromAny(p[f[i]]); if (id) return id; } return ''; }""",
"""function ccIdOf(p){ if (!p) return ''; var f = ['ccProjectId', 'companyCamId', 'companycamId', 'ccamId', 'ccId', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'ccProjectUrl', 'id']; for (var i = 0; i < f.length; i++) { var id = ccIdFromAny(p[f[i]]); if (id) return id; } return ''; }
/* patch PHOTOLINK */ /* every photo project of a job: its link + the ones the sync (or a person) put beside it */
function ccIdsOf(p){ var out = [], a = ccIdOf(p); if (a) out.push(a); arr(p && p.ccMoreIds).forEach(function(v){ var x = ccIdFromAny(v); if (x && out.indexOf(x) < 0) out.push(x); }); return out; }
/* everything a photo screen fetched: aborted when the screen closes */
var ccAbort = null;
function ccSignal(){ try { if (!ccAbort && typeof AbortController === 'function') ccAbort = new AbortController(); } catch (e) {} return ccAbort ? ccAbort.signal : undefined; }
function ccStopAll(){ try { if (ccAbort) ccAbort.abort(); } catch (e) {} ccAbort = null; }""", 'ccIdsOf')

# ccLoad: every photo project of the job, the first page on screen at once, aborted on close
sub("""function ccLoad(jobId, force){
  var it = itemById(jobId), id = it ? (it.ccId || ccIdOf(it.raw)) : '';
  if (!id) return Promise.resolve([]);""",
"""function ccLoad(jobId, force){
  var it = itemById(jobId), ids = it ? (it.ccIds && it.ccIds.length ? it.ccIds : [it.ccId || ccIdOf(it.raw)].filter(Boolean)) : [];
  if (!ids.length || !shown()) return Promise.resolve([]);   /* patch PHOTOLINK: only while GrayCo Photos is open */""", 'ccLoad head')
sub("""  var c = ccCache[jobId];
  if (c && !force && Date.now() - c.at < 5 * 60e3) return Promise.resolve(c.list);
  if (ccBusy[jobId]) return ccBusy[jobId];
  /* the CompanyCam proxy (patch CCX): the key stays on the server, never in this browser */
  function page(n, acc){
    return window.fetch(FN_CC + '?proxy=api&raw=1&per_page=100&page=' + n + '&endpoint=' + encodeURIComponent('projects/' + id + '/photos'), { headers: { 'x-gc-cc': '1' } }).then(function(r){""",
"""  var c = ccCache[jobId];
  if (ccBusy[jobId]) return ccBusy[jobId];
  if (c && !c.partial && !force && Date.now() - c.at < 5 * 60e3) return Promise.resolve(c.list);
  var sig = ccSignal(), got = [];
  /* patch PHOTOLINK: what has come in so far is on screen at once (a big job used to wait for every page) */
  function show(l){ got = got.concat(l.map(function(ph){ return ccMap(jobId, ph); }).filter(Boolean)); ccCache[jobId] = { at: Date.now(), partial: true, list: got.slice().sort(function(a, b){ return a.at < b.at ? 1 : -1; }) }; emit('cc'); }
  /* the CompanyCam proxy (patch CCX): the key stays on the server, never in this browser */
  function page(id, n, acc){
    if (sig && sig.aborted) return Promise.resolve(acc);
    return window.fetch(FN_CC + '?proxy=api&raw=1&per_page=50&page=' + n + '&endpoint=' + encodeURIComponent('projects/' + id + '/photos'), { headers: { 'x-gc-cc': '1' }, signal: sig }).then(function(r){""", 'ccLoad page')
sub("""      if (j && !Array.isArray(j)) j = j.photos || j.data || j.results || j.items || null;   /* patch CCSYNC (photos): a wrapped list */
      var l = Array.isArray(j) ? j : []; acc = acc.concat(l);
      return l.length >= 100 && n < 10 ? page(n + 1, acc) : acc;
    });
  }
  ccErr[jobId] = ''; ccBusy[jobId] = page(1, []).then(function(j){
    var list = (Array.isArray(j) ? j : []).map(function(ph){ return ccMap(jobId, ph); }).filter(Boolean)
      .sort(function(a, b){ return a.at < b.at ? 1 : -1; });""",
"""      if (j && !Array.isArray(j)) j = j.photos || j.data || j.results || j.items || null;   /* patch CCSYNC (photos): a wrapped list */
      var l = Array.isArray(j) ? j : []; acc = acc.concat(l); if (l.length) show(l);
      return l.length >= 50 && n < 20 ? page(id, n + 1, acc) : acc;   /* 50 a page: the first ones show quickly */
    }).then(null, function(){ return acc; });
  }
  ccErr[jobId] = ''; ccBusy[jobId] = Promise.all(ids.map(function(id){ return page(id, 1, []); })).then(function(parts){
    var seenP = {}, list = [].concat.apply([], parts).filter(function(ph){ if (!ph || seenP[ph.id]) return false; seenP[ph.id] = 1; return true; }).map(function(ph){ return ccMap(jobId, ph); }).filter(Boolean)
      .sort(function(a, b){ return a.at < b.at ? 1 : -1; });
    if (sig && sig.aborted) { delete ccBusy[jobId]; delete ccCache[jobId]; return list; }""", 'ccLoad pages')

# the project list keeps each project's cover + photo count (one read for every card)
sub("""    jSet('gcu_ccprojects', { at: Date.now(), list: j.projects.slice(0, 400).map(function(p){ return { id: s(p.id), name: s(p.name), address: s(p.address), status: s(p.status), updated: p.updated_at || p.created_at || 0, creator: s(p.creator) }; }) });""",
"""    jSet('gcu_ccprojects', { at: Date.now(), list: j.projects.slice(0, 600).map(function(p){ return { id: s(p.id), name: s(p.name), address: s(p.address), status: s(p.status), updated: p.updated_at || p.created_at || 0, creator: s(p.creator), photos: p.photo_count != null ? +p.photo_count || 0 : null, thumb: httpsOnly(p.thumb) }; }) });   /* patch PHOTOLINK: + cover, count */
    ccProjMap = null;""", 'ccprojects shape')
sub("""function ccProjectsRefresh(force){
  if (!ccOn() || !online()) return;""",
"""var ccProjMap = null;
function ccProj(id){ if (!ccProjMap) { ccProjMap = {}; ccProjects().forEach(function(c){ if (c && c.id) ccProjMap[c.id] = c; }); } return ccProjMap[id] || null; }
/* patch PHOTOLINK: a job card's cover + count before its photos were read: from its photo projects in the project list */
function ccCover(it){
  var ids = (it && it.ccIds) || [], n = 0, th = '', any = false;
  ids.forEach(function(id){ var c = ccProj(id); if (!c) return; if (c.photos != null) { any = true; n += c.photos; } if (!th && c.thumb) th = c.thumb; });
  return { n: any ? n : 0, cover: th ? { id: 'ccc_' + it.id, source: 'companycam', thumbUrl: th, fullUrl: th, at: '', by: '' } : null };
}
function ccProjectsRefresh(force){
  if (!ccOn() || !online() || !shown()) return;   /* patch PHOTOLINK: only while open */""", 'ccProjectsRefresh gate')
sub("""  window.fetch(FN_CC + '?proxy=recent&days=365', { headers: { 'x-gc-cc': '1' } })""",
"""  window.fetch(FN_CC + '?proxy=recent&days=365', { headers: { 'x-gc-cc': '1' }, signal: ccSignal() })""", 'recent signal')

# items(): every photo project of a job; leads checked against a set; a lookup by id
sub("""  var out = [], have = {}, ccHave = {};
  arr(P).forEach(function(p){
    if (excluded(p) || !p.id || !s(p.name)) return;
    have[p.id] = 1;
    var cc = ccIdOf(p); if (cc) ccHave[cc] = 1;
    out.push({ id: String(p.id), kind: 'job', name: s(p.name), address: s(p.address || p.jobAddress), client: s(p.client || p.customer), pm: s(p.pm || p.projectManager),
      po: s(p.po || p.autoPO), section: sectionOf(p), status: s(p.status), ccId: cc, created: s(p.createdAt || p.created), raw: p });
  });""",
"""  var out = [], have = {}, ccHave = {}, fromLead = {};
  arr(P).forEach(function(p){
    if (p && (p.leadId || p.fromLeadId)) fromLead[String(p.leadId || p.fromLeadId)] = 1;   /* patch PHOTOLINK: one pass, not one per lead */
    if (excluded(p) || !p.id || !s(p.name)) return;
    have[p.id] = 1;
    var ccs = ccIdsOf(p), cc = ccs[0] || ''; ccs.forEach(function(x){ ccHave[x] = 1; });
    out.push({ id: String(p.id), kind: 'job', name: s(p.name), address: s(p.address || p.jobAddress), client: s(p.client || p.customer), pm: s(p.pm || p.projectManager),
      po: s(p.po || p.autoPO), section: sectionOf(p), status: s(p.status), ccId: cc, ccIds: ccs, created: s(p.createdAt || p.created), raw: p });
  });""", 'items jobs')
sub("""    if (arr(P).some(function(p){ return p && String(p.leadId || p.fromLeadId || '') === String(l.id); })) return;""",
"""    if (fromLead[String(l.id)]) return;""", 'items leads')
sub("""    out.push({ id: 'cc:' + c.id, kind: 'cc', name: c.name || 'CompanyCam project', address: c.address, client: '', pm: c.creator, ccId: c.id,""",
"""    out.push({ id: 'cc:' + c.id, kind: 'cc', name: c.name || 'CompanyCam project', address: c.address, client: '', pm: c.creator, ccId: c.id, ccIds: [c.id],""", 'items cc')
sub("""  itemsMemo = out; memoKeyP = P; memoKeyL = Lds; memoSig = sig; memoAt = Date.now();
  return out;
}
function itemById(id){ id = String(id); return items().find(function(x){ return x.id === id; }) || null; }""",
"""  itemsMemo = out; memoKeyP = P; memoKeyL = Lds; memoSig = sig; memoAt = Date.now();
  itemsMap = null;
  return out;
}
var itemsMap = null, itemsMapOf = null;
function itemById(id){ id = String(id); var l = items(); if (itemsMapOf !== l || !itemsMap) { itemsMap = {}; l.forEach(function(x){ itemsMap[x.id] = x; }); itemsMapOf = l; } return itemsMap[id] || null; }""", 'itemById')

# the newest-photos feed + openRef: every photo project of a job
sub("""    var byCc = {}; items().forEach(function(it){ if (it.ccId) byCc[String(it.ccId)] = it.id; });""",
"""    var byCc = {}; items().forEach(function(it){ (it.ccIds || (it.ccId ? [it.ccId] : [])).forEach(function(x){ if (!byCc[String(x)] || it.kind === 'job') byCc[String(x)] = it.id; }); });   /* patch PHOTOLINK */""", 'feed byCc')
sub("""  if (!ccOn() || !online() || ccFeed.busy || Date.now() - ccFeed.at < 5 * 60e3) return;
  ccFeed.busy = true; ccFeed.at = Date.now();
  window.fetch(FN_CC + '?proxy=api&raw=1&per_page=40&endpoint=photos', { headers: { 'x-gc-cc': '1' } })""",
"""  if (!ccOn() || !online() || !shown() || ccFeed.busy || Date.now() - ccFeed.at < 5 * 60e3) return;
  ccFeed.busy = true; ccFeed.at = Date.now();
  window.fetch(FN_CC + '?proxy=api&raw=1&per_page=40&endpoint=photos', { headers: { 'x-gc-cc': '1' }, signal: ccSignal() })""", 'feed gate')
sub("""    var job = items().find(function(it){ return it.kind === 'job' && it.ccId === cc; });""",
"""    var job = items().find(function(it){ return it.kind === 'job' && (it.ccId === cc || (it.ccIds || []).indexOf(cc) >= 0); });   /* patch PHOTOLINK */""", 'openRef')

# last activity: one pass over the messages, not one per job
sub("""function lastOf(it, list){
  var r = list && list[0]; var m = msgs(threadJob(it.id)).slice(-1)[0];""",
"""function lastOf(it, list, lm){
  var r = list && list[0]; var m = lm ? lm[threadJob(it.id)] : msgs(threadJob(it.id)).slice(-1)[0];   /* patch PHOTOLINK: lm = the last message per thread */""", 'lastOf')
sub("""  its.forEach(function(it){ last[it.id] = lastOf(it, idx[it.id]); });""",
"""  var lm = {}; CH.all().forEach(function(m){ if (m && m.deleted !== true && m.thread && (!lm[m.thread] || s(m.at) >= s(lm[m.thread].at))) lm[m.thread] = m; });
  its.forEach(function(it){ last[it.id] = lastOf(it, idx[it.id], lm); });""", 'pvData lm')

# cards: cover + count from the project list until the job's photos were read
sub("""  var list = d.idx[it.id] || [], cover = list[0], last = d.last[it.id], cnt = list.length || (it.kind === 'cc' && it.raw && it.raw.photo_count) || 0;""",
"""  var list = d.idx[it.id] || [], cover = list[0], last = d.last[it.id], cnt = list.length || (it.kind === 'cc' && it.raw && it.raw.photo_count) || 0;
  if (!list.length || !(ccCache[it.id] && !ccCache[it.id].partial)) { var cv = ccCover(it); if (!cover && cv.cover) cover = cv.cover; if (cv.n > cnt) cnt = cv.n; }   /* patch PHOTOLINK */""", 'pvCard cover')

# "Link these photo projects" (admin / office) at the top of the projects screen
sub("""function vProjects(){
  if (!pvReady || !Array.isArray(crm().projects)) return pvSkeleton();
  var d = pvData(), q = low(S.q);
  if (S.feedAll && !q) return pvFeedAll(d);
  var h = '<div class="gcu-pad pv">';""",
"""/* patch PHOTOLINK: the photo projects the 15-minute sync could not tie to a job for sure (gc_kv gc_cc_review via ?proxy=sync) */
var LK = { list: null, at: 0, busy: false, done: {}, msg: '' };
function linkAllowed(){ if (isOffice()) return true; try { return !!(window._gcRP && typeof window._gcRP.role === 'function' && /office|admin|owner/i.test(s(window._gcRP.role()))); } catch (e) { return false; } }
function linkLoad(force){
  if (!shown() || !linkAllowed() || LK.busy || (!force && LK.at && Date.now() - LK.at < 5 * 60e3)) return;
  LK.busy = true;
  window.fetch(FN_CC + '?proxy=sync', { headers: { 'x-gc-cc': '1' }, cache: 'no-store', signal: ccSignal() }).then(function(r){ return r.ok && !(window._gcCCGated && window._gcCCGated(r)) ? r.json() : null; }).then(function(j){
    if (j && typeof j === 'object' && !Array.isArray(j)) { LK.list = arr(j.review).filter(function(x){ return x && x.cc && x.kind !== 'pm'; }); LK.at = Date.now(); try { localStorage.setItem('gc_ccsync_last', JSON.stringify({ at: Date.now(), data: j })); } catch (e) {} emit('cc'); }
  }).catch(function(){}).then(function(){ LK.busy = false; });
}
function linkJobsOf(x){
  var out = arr(x.jobs).filter(function(j){ return j && j.id && itemById(j.id); });
  if (!out.length) {   /* an older entry without its jobs: the jobs at the same address, here */
    var a = low(x.address).split(',')[0].replace(/[^a-z0-9]/g, '');
    if (a.length >= 6) items().forEach(function(it){ if (it.kind === 'job' && low(it.address).split(',')[0].replace(/[^a-z0-9]/g, '') === a) out.push({ id: it.id, name: it.name, address: it.address }); });
  }
  return out.slice(0, 5);
}
function linkHtml(){
  if (!linkAllowed() || !LK.list) return '';
  var l = LK.list.filter(function(x){ return !LK.done[x.cc] && !(x.jobs && x.jobs.length === 0 && x.kind === 'link'); });
  if (!l.length) return LK.msg ? '<div class="pv-sec"><div class="pv-sub" role="status">' + esc(LK.msg) + '</div></div>' : '';
  return '<div class="pv-sec" id="pv-link"><div class="pv-h"><h2>Link these photo projects</h2><span class="pv-ct">' + l.length + '</span></div>' +
    '<div class="pv-sub" style="margin:0 0 8px">Photo projects that look like a job here. Link one and its photos show on that job.</div>' +
    (LK.msg ? '<div class="pv-sub" role="status" style="margin:0 0 8px;font-weight:700">' + esc(LK.msg) + '</div>' : '') +
    l.slice(0, 20).map(function(x){
      var js = linkJobsOf(x);
      return '<div class="pv-lk" style="border:1px solid #E3E5EE;border-radius:12px;padding:10px 12px;margin:0 0 8px;background:#fff">' +
        '<div style="font-weight:800">' + esc(x.name || ('Photo project ' + x.cc)) + '</div>' +
        '<div class="pv-sub">' + esc([x.address, x.creator ? 'by ' + x.creator : '', x.created].filter(Boolean).join(' · ')) + '</div>' +
        (js.length ? js.map(function(j){
          return '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px"><span style="flex:1 1 180px;min-width:0">Job: <b>' + esc(j.name || j.id) + '</b>' + (j.address ? ' <span class="pv-sub">' + esc(j.address) + '</span>' : '') + '</span>' +
            '<button class="pv-cta" style="min-height:40px;padding:0 16px" data-a="lklink" data-v="' + esc(x.cc) + '" data-id="' + esc(j.id) + '">Link</button>' +
            '<button class="pv-link" style="min-height:40px;padding:0 12px" data-a="lkno" data-v="' + esc(x.cc) + '" data-id="' + esc(j.id) + '">Not this job</button></div>';
        }).join('') : '<div class="pv-sub" style="margin-top:6px">No job here looks like it.</div>') +
        '</div>';
    }).join('') + '</div>';
}
/* Link: the job gets this photo project at once on this computer (never replacing its link: beside it), the server list drops it */
function linkSave(pid, cc){
  var now = nowIso();
  function put(p){
    var o = Object.assign({}, p), have = ccIdsOf(p);
    if (have.indexOf(cc) >= 0) return p;
    if (!ccIdOf(Object.assign({}, p, { id: '' }))) Object.assign(o, { ccProjectId: cc, ccamId: cc, ccamUrl: 'https://app.companycam.com/projects/' + cc, companyCamUrl: 'https://app.companycam.com/projects/' + cc });
    else o.ccMoreIds = arr(p.ccMoreIds).concat([cc]);
    return Object.assign(o, { ccLinkedBy: myName(), ccLinkedAt: now, savedAt: now, updatedAt: now });
  }
  try { window.__GC_MANUAL_SAVE__ = true; } catch (e) {}
  try { if (window._setProjects) window._setProjects(function(prev){ return Array.isArray(prev) ? prev.map(function(p){ return p && String(p.id) === String(pid) ? put(p) : p; }) : prev; }); } catch (e) {}
  return Promise.resolve(typeof window._gcProjectsRaw === 'function' ? window._gcProjectsRaw() : (window.idbGet ? window.idbGet('projects') : null)).then(function(all){
    if (!Array.isArray(all)) return;
    var next = all.map(function(p){ return p && String(p.id) === String(pid) ? put(p) : p; });
    return Promise.resolve(window.idbSet ? window.idbSet('projects', next) : null).then(function(){ try { if (window._supaUpsert) window._supaUpsert('projects', next); } catch (e) {} });
  }).catch(function(){}).then(function(){ later(function(){ try { window.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500); itemsMemo = null; delete ccCache[pid]; });
}
function linkAct(act, cc, jobId){
  if (!cc || !jobId) return;
  LK.done[cc] = act === 'lklink' ? 1 : LK.done[cc];
  var it = itemById(jobId);
  var w = act === 'lklink' ? linkSave(jobId, cc) : Promise.resolve();
  if (act === 'lkno') { LK.list = arr(LK.list).map(function(x){ return x.cc === cc ? Object.assign({}, x, { jobs: linkJobsOf(x).filter(function(j){ return String(j.id) !== String(jobId); }) }) : x; }); }
  LK.msg = act === 'lklink' ? 'Linked to ' + (it ? it.name : jobId) + ' — its photos show on that job now.' : 'OK — that project will not be suggested for ' + (it ? it.name : jobId) + ' again.';
  renderMain();
  w.then(function(){ return window.fetch(FN_CC + '?proxy=review', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gc-cc': '1' }, body: JSON.stringify({ cc: cc, act: act === 'lklink' ? 'link' : 'notthis', job: String(jobId), kind: '' }) }); })
    .then(function(r){ return r && r.json ? r.json() : null; }).then(function(j){ if (!j || !j.ok) toast(act === 'lklink' ? 'Linked here; the server list updates on the next sync.' : 'Saved here; the server list could not be updated — try again later.'); }, function(){})
    .then(function(){ emit('cc'); });
}
function vProjects(){
  if (!pvReady || !Array.isArray(crm().projects)) return pvSkeleton();
  var d = pvData(), q = low(S.q);
  if (S.feedAll && !q) return pvFeedAll(d);
  var h = '<div class="gcu-pad pv">' + (q ? '' : linkHtml());""", 'vProjects link list')
sub("""    case 'more': S.more += 30; S.pm += 24; return renderMain();""",
"""    case 'more': S.more += 30; S.pm += 24; return renderMain();
    case 'lklink': case 'lkno': return linkAct(a, v, id);   /* patch PHOTOLINK */""", 'onClick link')

# open / tab: CompanyCam asked only now; close: everything stops and the photo lists go
sub("""function teardown(){
  if (stream) { try { stream.getTracks().forEach(function(t){ t.stop(); }); } catch (e) {} stream = null; }
  if (mapObj) { try { mapObj.remove(); } catch (e) {} mapObj = null; mapLayer = null; }
  if (root) { try { root.remove(); } catch (e) {} } root = null; mainEl = null; io = null; imgQ = [];
}""",
"""function teardown(){
  if (stream) { try { stream.getTracks().forEach(function(t){ t.stop(); }); } catch (e) {} stream = null; }
  if (mapObj) { try { mapObj.remove(); } catch (e) {} mapObj = null; mapLayer = null; }
  /* patch PHOTOLINK: leaving stops everything photo: reads in flight, the image queue, the live channel; the lists go */
  ccStopAll();
  if (io) { try { io.disconnect(); } catch (e) {} }
  if (root) { try { Array.prototype.forEach.call(root.querySelectorAll('img'), function(im){ try { im.removeAttribute('src'); im.src = ''; } catch (e) {} }); } catch (e) {} }
  if (root) { try { root.remove(); } catch (e) {} } root = null; mainEl = null; io = null; imgQ = [];
  Object.keys(ccCache).forEach(function(k){ delete ccCache[k]; }); Object.keys(ccBusy).forEach(function(k){ delete ccBusy[k]; });
  ccFeed.list = []; ccFeed.map = {}; ccFeed.at = 0; ccFeed.busy = false; ccProjMap = null; pvMemo = null; pvLM = { k: '', v: null }; itemsMemo = null; itemsMap = null;
  Object.keys(localUrls).forEach(function(k){ try { URL.revokeObjectURL(localUrls[k]); } catch (e) {} delete localUrls[k]; });
  LK.list = null; LK.at = 0; LK.busy = false; LK.msg = '';
  try { if (rt.client && rt.channel) rt.client.removeChannel(rt.channel); } catch (e) {} rt.channel = null; rt.ok = false;
}
/* opened: ask the server about CompanyCam now (never before), then the project list, the feed, the link list */
function ccWake(){
  if (!shown()) return;
  var f = typeof window._gcCCCheckStatus === 'function' ? window._gcCCCheckStatus(false) : null;
  Promise.resolve(f).then(function(){ if (!shown()) return; ccProjectsRefresh(); pvFeedLoad(); linkLoad(); if (S.screen === 'job' && S.jobId) ccLoad(S.jobId); }, function(){});
}""", 'teardown')
sub("""  pvBoot(); render();
  pullSoon(300); ccProjectsRefresh(); pvFeedLoad(); rtConnect();
  return true;
}""",
"""  pvBoot(); render();
  pullSoon(300); ccWake(); rtConnect();   /* patch PHOTOLINK */
  return true;
}""", 'open wake')
sub("""  pvBoot(); render(); pullSoon(300); ccProjectsRefresh(); pvFeedLoad(); rtConnect();
  return true;
}""",
"""  pvBoot(); render(); pullSoon(300); ccWake(); rtConnect();   /* patch PHOTOLINK */
  return true;
}""", 'mountTab wake')
# open() and mountTab() call ccLoad before the screen is built in one path: build() comes first, so shown() is true there.

# timers: the photo list is read only while open
sub("""function pullSoon(ms){ if (pullT) clearTimeout(pullT); pullT = later(function(){ pullT = null; PH.pull(); CH.pull(); }, ms || 0); }""",
"""function pullSoon(ms){ if (pullT) clearTimeout(pullT); pullT = later(function(){ pullT = null; if (shown()) PH.pull(); CH.pull(); }, ms || 0); }   /* patch PHOTOLINK: photos only while open */""", 'pullSoon')
sub("""  if (tick % period === 0) { CH.pull(); if (tick % (period * 2) === 0 || vis) PH.pull(); }""",
"""  if (tick % period === 0) { CH.pull(); if (vis) PH.pull(); }   /* patch PHOTOLINK: the photo list only while open */""", 'tick PH')
sub("""later(function(){ PH.pull(); CH.pull(); stageWatch(); }, 6000);""",
"""later(function(){ CH.pull(); stageWatch(); }, 6000);   /* patch PHOTOLINK: no photo list read at sign-in */""", 'boot PH')
sub("""    rt.channel.on('postgres_changes', { event: '*', schema: 'public', table: 'gc_kv', filter: 'key=in.(' + KEY_PH + ',' + KEY_CH + ')' }, function(ev){
      var k = ev && (ev.new || ev.record || {}).key;
      if (k === KEY_CH) CH.pull(true); else if (k === KEY_PH) PH.pull(true); else { CH.pull(true); PH.pull(true); }""",
"""    rt.channel.on('postgres_changes', { event: '*', schema: 'public', table: 'gc_kv', filter: 'key=in.(' + KEY_PH + ',' + KEY_CH + ')' }, function(ev){
      var k = ev && (ev.new || ev.record || {}).key;
      if (k === KEY_CH) CH.pull(true); else if (k === KEY_PH) { if (shown()) PH.pull(true); } else { CH.pull(true); if (shown()) PH.pull(true); }""", 'rt PH')

# ── 3. the CompanyCam sync status (patch CCSYNC): the To-Do never fetches; it shows the last answer this computer saw ─
sub("""      if (r.ok && j && typeof j === 'object') { S.data = j; S.err = ''; } else S.err = 'The server answered ' + r.status + '.'; });""",
"""      if (W._gcCCGated && W._gcCCGated(r)) return;   /* patch PHOTOLINK: the gate's empty answer is not the server's */
      if (r.ok && j && typeof j === 'object' && !Array.isArray(j)) { S.data = j; S.err = ''; try { localStorage.setItem('gc_ccsync_last', JSON.stringify({ at: Date.now(), data: j })); } catch (e) {} } else S.err = 'The server answered ' + r.status + '.'; });""", 'ccsync load')
sub("""      if (allowed()) {
        load(false);
        var rv = review(), d = S.data, h = d && d.health;""",
"""      if (allowed()) {
        /* patch PHOTOLINK: no CompanyCam fetch from the To-Do — the last answer seen here (status window / GrayCo Photos) */
        if (!S.data) { try { var lc = JSON.parse(localStorage.getItem('gc_ccsync_last') || 'null'); if (lc && lc.data && typeof lc.data === 'object' && !Array.isArray(lc.data)) S.data = lc.data; } catch (e) {} }
        var rv = review(), d = S.data, h = d && d.health;""", 'ccsync todo')
sub("""    render: function(box){ ADM = box; box.onclick = onClick; box.innerHTML = body(); load(true).then(paint); },""",
"""    render: function(box){ ADM = box; box.setAttribute('data-gc-cc-screen', '1'); box.onclick = onClick; box.innerHTML = body(); load(true).then(paint); },   /* patch PHOTOLINK: a photo screen */""", 'ccsync adm')

sub("""var KIND = { match: 'Looks like an existing job', ask: 'Same address as a finished job', pm: 'Given to the Senior PM' };""",
"""var KIND = { match: 'Looks like an existing job', ask: 'Same address as a finished job', pm: 'Given to the Senior PM', link: 'Which job is it? (Link it on 📸 GrayCo Photos)' };   /* patch PHOTOLINK */""", 'ccsync kind')

src = src.replace('<script id="gc-patch-photolink">\n/* patch PHOTOLINK', '<script id="gc-patch-photolink">\n' + MARK + ' /* patch PHOTOLINK', 1)
assert MARK in src
open(path, 'w', encoding='utf-8').write(src)
print('patched PHOTOLINK')
