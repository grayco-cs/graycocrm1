#!/usr/bin/env python3
"""Idempotent patch CCPHOTOS1 — every CompanyCam photo in GrayCo Photos, small, from the server's index.

Owner (10/30): "make sure all company cam photos that come in are very low storage small files and they are all in my
grayco photos by the morning they never actually are only some jobs".

Why only some jobs: nothing was stored. A job's CompanyCam photos were asked from CompanyCam only while THAT job's page was
open in that browser (after the browser's own CompanyCam check said "on"), at most 20 pages; the home's cards, counts, Jump
Back In and the feed only knew the jobs opened in this session plus CompanyCam's newest 40 photos company-wide; a lead's
CompanyCam project was never read at all.

Now the server (netlify/functions/companycam-photos, _lib/cc-photos.js) lists every photo of every linked project in gc_kv
(ccidx:<project>, the summary ccidx) with CompanyCam's own small links — no picture is copied, nothing is stored in the
file bucket. This page:
 1. reads a job's photos from that index (one database read; no CompanyCam call; no "CompanyCam on" check needed) — the grid
    uses CompanyCam's "thumbnail" link, a photo opened full screen its "web" link; a project not indexed yet (or still being
    read) is asked from CompanyCam as before (up to 60 pages now), and both are put together;
 2. the home: every linked job's photo count and cover from the summary, the Live Photo Feed from the index's newest photos
    across every linked project (it was CompanyCam's newest 40);
 3. a lead's CompanyCam project shows its photos too;
 4. a job with thousands of photos draws 120 tiles, then "Show more photos" (+240); tiles load lazily as before;
 5. a CompanyCam link that no longer loads (expired) asks the server once for that photo's fresh links; opening a photo
    full screen fetches its links once (the original for ⬇ Download);
 6. the CRM's "what changed" pull never downloads the index (key=not.like.ccidx*);
 7. 📸 CompanyCam sync status: "CompanyCam photos in GrayCo Photos" (projects indexed / linked, photos, progress) and
    "⟳ Index all photos now" (admins / office) — the background run reads every page of every linked project.
No new timers, no polling: the index is read when GrayCo Photos opens (10 minutes cached) and when a job opens (5 minutes).
Each find-string must occur exactly once."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CCPHOTOS1 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new, label, count=1):
    global src
    assert src.count(old) == count, (label, 'count', src.count(old))
    src = src.replace(old, new)

# ── 6. the "what changed" pull (STORECUT's bulk-read rewrite) never takes the photo index ──
sub("""  S.bulkFiltered++;
  return u + '&key=not.eq.' + V2;
}""", """  S.bulkFiltered++;
  return u + '&key=not.eq.' + V2 + '&key=not.like.ccidx*';   /* patch CCPHOTOS1: the CompanyCam photo index is read by GrayCo Photos only */
}""", 'bulk rewrite')

# ── 1. the index reader, beside the CompanyCam loader ──
IDX_JS = r"""
/* patch CCPHOTOS1 */ /* ── CompanyCam photos from the server's index (gc_kv "ccidx" + "ccidx:<project>", made by companycam-photos):
   every photo of every linked project, CompanyCam's own small links, no CompanyCam call from this page ── */
var CIX = { sum: null, at: 0, busy: null, rows: {}, rowsAt: {}, fresh: {}, same: 0, errs: 0 };
function cixGet(keys){
  var c = creds(); if (!c.u || !c.k || !keys.length || !online()) return Promise.resolve(null);
  return window.fetch(c.u + '/rest/v1/gc_kv?select=key,value&key=in.(' + keys.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, signal: ccSignal() })
    .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; })
    .then(function(rows){
      if (!Array.isArray(rows)) return null;
      var o = {}; rows.forEach(function(x){ var v = x && x.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } if (x && x.key) o[x.key] = v; });
      return o;
    }, function(){ return null; });
}
/* the summary: { p: { project: [count, newest, cover, job] }, feed: [[project, id, captured, web, thumb, by, tag]] } */
function cixSum(force){
  if (CIX.busy) return CIX.busy;
  if (!force && CIX.at && Date.now() - CIX.at < 10 * 60e3) return Promise.resolve(CIX.sum);
  CIX.busy = cixGet(['ccidx']).then(function(o){
    CIX.busy = null; if (!o) return CIX.sum;
    CIX.at = Date.now(); var v = o.ccidx;
    if (v && typeof v === 'object' && v.p && typeof v.p === 'object') { CIX.sum = v; pvVer++; emit('cc'); }
    return CIX.sum;
  }, function(){ CIX.busy = null; return CIX.sum; });
  return CIX.busy;
}
function cixThumb(x, w){ if (!x) return w; if (typeof x === 'string') return x; if (Array.isArray(x) && x.length === 3) return w.slice(0, x[0]) + x[2] + w.slice(w.length - x[1]); return w; }
function cixPhoto(jobId, x, people, geo){
  if (!Array.isArray(x)) return null;
  var w = httpsOnly(x[2]), t = httpsOnly(cixThumb(x[3], s(x[2]))) || w; if (!w) return null;
  var c = +x[1] || 0;
  return { id: 'cc_' + x[0], ccId: String(x[0]), jobId: String(jobId), source: 'companycam', thumbUrl: t, fullUrl: w, origUrl: '', at: c ? new Date(c * 1000).toISOString() : '',
    by: s(x[4] != null && x[4] >= 0 ? arr(people)[x[4]] : '') || 'CompanyCam', tag: TAGS.indexOf(s(x[5])) >= 0 ? s(x[5]) : '', note: s(x[6]).slice(0, 500),
    lat: geo ? +geo[0] : null, lng: geo ? +geo[1] : null, shared: true, idx: true };
}
/* the stored projects (5 minutes cached); a project not indexed yet is null */
function cixRows(ids, force){
  var need = ids.filter(function(id){ return force || !(id in CIX.rows) || Date.now() - (CIX.rowsAt[id] || 0) > 5 * 60e3; });
  function pick(){ var o = {}; ids.forEach(function(id){ o[id] = CIX.rows[id] || null; }); return o; }
  if (!need.length) return Promise.resolve(pick());
  return cixGet(need.map(function(id){ return 'ccidx:' + id; })).then(function(o){
    if (o) need.forEach(function(id){ var v = o['ccidx:' + id]; CIX.rows[id] = v && typeof v === 'object' && Array.isArray(v.ph) ? v : null; CIX.rowsAt[id] = Date.now(); });
    return pick();
  });
}
function cixMerge(a, b){
  var seen = {}, out = [];
  arr(a).concat(arr(b)).forEach(function(r){ if (!r) return; var k = r.ccId || r.id; if (seen[k]) return; seen[k] = 1; out.push(r); });
  return out.sort(function(x, y){ return s(x.at) < s(y.at) ? 1 : s(x.at) > s(y.at) ? -1 : 0; });
}
/* a job's CompanyCam photos: the index first; what it does not have yet (a new link, a project still being read) from CompanyCam */
function ccLoad(jobId, force){
  var it = itemById(jobId), ids = it ? (it.ccIds && it.ccIds.length ? it.ccIds : [it.ccId || ccIdOf(it.raw)].filter(Boolean)) : [];
  if (!ids.length || !shown()) return Promise.resolve([]);
  if (ccBusy[jobId]) return ccBusy[jobId];
  var c = ccCache[jobId];
  if (c && !c.partial && !force && Date.now() - c.at < 5 * 60e3) return Promise.resolve(c.list);
  var p = cixRows(ids, !!force).then(function(rows){
    var list = [], miss = [];
    ids.forEach(function(id){
      var r = rows[id]; if (!r) { miss.push(id); return; }
      var ppl = arr(r.u), first = true;
      arr(r.ph).forEach(function(x){ var ph = cixPhoto(jobId, x, ppl, first ? r.geo : null); if (ph) { list.push(ph); first = false; } });
      if (r.done !== true) miss.push(id);
    });
    list = cixMerge(list, []);
    delete ccBusy[jobId];
    if (list.length || !miss.length) { ccCache[jobId] = { at: Date.now(), list: list, idx: true, partial: !!miss.length }; emit('cc'); }
    if (!miss.length) return list;
    return ccLoadLive(jobId, force, miss, list).then(function(l2){ return cixMerge(list, l2); }, function(){ return list; });
  }, function(){ delete ccBusy[jobId]; return ccLoadLive(jobId, force); });
  ccBusy[jobId] = p;
  return p;
}
/* one CompanyCam photo's fresh links (its original for ⬇ Download; a link that stopped loading) — once a photo, while open */
function cixFresh(id){
  var r = photoById(id); if (!r || r.source !== 'companycam' || !r.ccId || !shown() || !online()) return Promise.resolve(null);
  if (CIX.fresh[r.ccId]) return CIX.fresh[r.ccId];
  CIX.fresh[r.ccId] = window.fetch(FN_CC + '?proxy=api&raw=1&endpoint=' + encodeURIComponent('photos/' + r.ccId), { headers: { 'x-gc-cc': '1' }, signal: ccSignal() })
    .then(function(x){ return x.ok && !(window._gcCCGated && window._gcCCGated(x)) ? x.json() : null; }, function(){ return null; }).then(function(ph){
      var n = ph && ph.id != null ? ccMap(r.jobId, ph) : null; if (!n) return null;
      var moved = n.fullUrl !== r.fullUrl || n.thumbUrl !== r.thumbUrl; if (!moved) CIX.same++;
      r.thumbUrl = n.thumbUrl; r.fullUrl = n.fullUrl; r.origUrl = n.origUrl || r.origUrl;
      if (moved) emit('cc');
      return r;
    }, function(){ return null; });
  return CIX.fresh[r.ccId];
}
function cixImgErr(e){
  var im = e && e.target; if (!im || im.tagName !== 'IMG' || im.__cixTried || !/^https:/i.test(s(im.getAttribute('src')))) return;
  if (CIX.same >= 2 || CIX.errs >= 30) return;   /* the links are fine (CompanyCam or the network is down): no more asking */
  var b = im.closest && im.closest('[data-id]'), id = b && b.getAttribute('data-id'); if (!id || !/^cc_/.test(id)) return;
  im.__cixTried = 1; CIX.errs++; var was = s(im.getAttribute('src')), r0 = photoById(id), thumb = r0 && was === r0.thumbUrl;
  cixFresh(id).then(function(r){ if (r && im.isConnected) { var u = thumb ? r.thumbUrl : r.fullUrl; if (u && u !== was) im.src = u; } });
}
/* the Live Photo Feed from the index: the newest photos of every linked project this person sees */
function cixFeed(){
  var f = CIX.sum && arr(CIX.sum.feed); if (!f || !f.length) return false;
  var byCc = {}; items().forEach(function(it){ arr(it.ccIds).forEach(function(x){ if (!byCc[x]) byCc[x] = it.id; }); });
  var list = [], map = {};
  f.forEach(function(x){ var jid = byCc[s(x[0])]; if (!jid) return; var r = cixPhoto(jid, [x[1], x[2], x[3], x[4], -1, x[6]], [], null); if (!r) return; r.by = s(x[5]) || 'CompanyCam'; list.push(r); map[r.id] = r; });
  ccFeed.list = list; ccFeed.map = map; ccFeed.at = Date.now(); ccFeed.fromIdx = true; pvVer++;
  return true;
}
function cixWake(){
  cixSum().then(function(){ if (!shown()) return; if (cixFeed()) emit('cc'); if (S.screen === 'job' && S.jobId) ccLoad(S.jobId); });
}
"""
sub("""/* CompanyCam projects that are not a CRM job yet (patch I files 2026+ ones as PRJcc_<id>) */
var ccExtra = {};""", IDX_JS + """/* CompanyCam projects that are not a CRM job yet (patch I files 2026+ ones as PRJcc_<id>) */
var ccExtra = {};""", 'index reader')

# the live CompanyCam loader: only the projects the index lacks, put together with what the index had
sub("""function ccLoad(jobId, force){
  var it = itemById(jobId), ids = it ? (it.ccIds && it.ccIds.length ? it.ccIds : [it.ccId || ccIdOf(it.raw)].filter(Boolean)) : [];
  if (!ids.length || !shown()) return Promise.resolve([]);   /* patch PHOTOLINK: only while GrayCo Photos is open */""",
"""function ccLoadLive(jobId, force, only, base){   /* patch CCPHOTOS1: the CompanyCam read for what the index does not have */
  var it = itemById(jobId), ids = it ? (it.ccIds && it.ccIds.length ? it.ccIds : [it.ccId || ccIdOf(it.raw)].filter(Boolean)) : [];
  if (only && only.length) ids = only; base = arr(base);
  if (!ids.length || !shown()) return Promise.resolve(base);   /* patch PHOTOLINK: only while GrayCo Photos is open */""", 'live head')
sub("""    if (ccAsked[jobId] || typeof window._gcCCCheckStatus !== 'function') return Promise.resolve([]);""",
    """    if (ccAsked[jobId] || typeof window._gcCCCheckStatus !== 'function') return Promise.resolve(base);""", 'live ask')
sub("""    return Promise.resolve(window._gcCCCheckStatus(fresh)).then(function(){ return ccOn() ? ccLoad(jobId, force) : []; }, function(){ return []; });""",
    """    return Promise.resolve(window._gcCCCheckStatus(fresh)).then(function(){ return ccOn() ? ccLoadLive(jobId, force, only, base) : base; }, function(){ return base; });""", 'live recheck')
sub("""  var c = ccCache[jobId];
  if (ccBusy[jobId]) return ccBusy[jobId];
  if (c && !c.partial && !force && Date.now() - c.at < 5 * 60e3) return Promise.resolve(c.list);
  var sig = ccSignal(), got = [];""",
"""  var c = ccCache[jobId];
  if (ccBusy[jobId]) return ccBusy[jobId];
  if (c && !c.partial && !c.idx && !force && Date.now() - c.at < 5 * 60e3) return Promise.resolve(c.list);
  var sig = ccSignal(), got = [];""", 'live cache')
sub("""  function show(l){ got = got.concat(l.map(function(ph){ return ccMap(jobId, ph); }).filter(Boolean)); ccCache[jobId] = { at: Date.now(), partial: true, list: got.slice().sort(function(a, b){ return a.at < b.at ? 1 : -1; }) }; emit('cc'); }""",
    """  function show(l){ got = got.concat(l.map(function(ph){ return ccMap(jobId, ph); }).filter(Boolean)); ccCache[jobId] = { at: Date.now(), partial: true, list: cixMerge(base, got) }; emit('cc'); }""", 'live show')
sub("""      return l.length >= 50 && n < 20 ? page(id, n + 1, acc) : acc;   /* 50 a page: the first ones show quickly */""",
    """      return l.length >= 50 && n < 60 ? page(id, n + 1, acc) : acc;   /* 50 a page: the first ones show quickly (patch CCPHOTOS1: up to 3,000) */""", 'live pages')
sub("""      .sort(function(a, b){ return a.at < b.at ? 1 : -1; });
    if (sig && sig.aborted) { delete ccBusy[jobId]; delete ccCache[jobId]; return list; }""",
    """      .sort(function(a, b){ return a.at < b.at ? 1 : -1; });
    list = cixMerge(base, list);   /* patch CCPHOTOS1 */
    if (sig && sig.aborted) { delete ccBusy[jobId]; delete ccCache[jobId]; return list; }""", 'live merge')

# ── 2. cards: count + cover from the summary (every linked project), then the old project list ──
sub("""  ids.forEach(function(id){ var c = ccProj(id); if (!c) return; if (c.photos != null) { any = true; n += c.photos; } if (!th && c.thumb) th = c.thumb; });""",
    """  var sp = CIX.sum && CIX.sum.p;   /* patch CCPHOTOS1: the index's count + cover first */
  ids.forEach(function(id){ var x = sp && sp[id]; if (Array.isArray(x)) { any = true; n += +x[0] || 0; if (!th && httpsOnly(x[2])) th = httpsOnly(x[2]); return; }
    var c = ccProj(id); if (!c) return; if (c.photos != null) { any = true; n += c.photos; } if (!th && c.thumb) th = c.thumb; });""", 'cover')

# ── 3. a lead's CompanyCam project ──
sub("""    out.push({ id: String(l.id), kind: 'lead', name: s(l.name || l.client || l.company || 'Lead'), address: s(l.address), client: s(l.name), pm: s(l.assignedTo || l.owner || l.pm),
      section: 'Leads', status: s(l.stage || l.status || 'New lead'), created: s(l.receivedAt || l.createdAt || l.date), raw: l });""",
    """    var lcc = ccIdsOf(Object.assign({}, l, { id: '' }));   /* patch CCPHOTOS1: a lead's CompanyCam project shows its photos too */
    lcc.forEach(function(x){ ccHave[x] = 1; });
    out.push({ id: String(l.id), kind: 'lead', name: s(l.name || l.client || l.company || 'Lead'), address: s(l.address), client: s(l.name), pm: s(l.assignedTo || l.owner || l.pm),
      ccId: lcc[0] || '', ccIds: lcc, section: 'Leads', status: s(l.stage || l.status || 'New lead'), created: s(l.receivedAt || l.createdAt || l.date), raw: l });""", 'lead cc')

# ── 4. thousands of photos: 120 tiles, then "Show more photos" ──
sub("""  order.slice(0, 60).forEach(function(k){
    var l = days[k], who = {};""",
"""  if (S.jmJob !== it.id) { S.jmJob = it.id; S.jm = 120; }   /* patch CCPHOTOS1: 120 tiles, then "Show more photos" */
  var jmLeft = S.jm || 120, jmMore = 0;
  order.forEach(function(k){
    if (jmLeft <= 0) { jmMore += days[k].length; return; }
    var l = days[k].length > jmLeft ? days[k].slice(0, jmLeft) : days[k], who = {}; jmMore += days[k].length - l.length; jmLeft -= l.length;""", 'grid cap')
sub("""  return h + '</div>' + dlActionBar() + '</div>';""",
    """  if (jmMore) h += '<button class="gcu-btn ghost" data-a="jmore" style="align-self:center">Show more photos (' + jmMore + ' more)</button>';   /* patch CCPHOTOS1 */
  return h + '</div>' + dlActionBar() + '</div>';""", 'grid more')
sub("""    case 'photo': if (dlOn()) return dlPick(id);""",
    """    case 'jmore': S.jm = (S.jm || 120) + 240; return renderMain();   /* patch CCPHOTOS1 */
    case 'photo': if (!dlOn() && /^cc_/.test(id || '')) cixFresh(id);   /* patch CCPHOTOS1: its fresh links (the original for Download) */
      if (dlOn()) return dlPick(id);""", 'photo open')

# console: _gcPhotos.ccIndex() — what this page has from the index
sub("""  work: function(){ kick(0); }, render: function(){ renderMain(); },""",
    """  ccIndex: function(){ return { summary: !!CIX.sum, at: CIX.at, projects: CIX.sum ? Object.keys(CIX.sum.p || {}).length : 0, photos: CIX.sum ? CIX.sum.n : 0, feed: ccFeed.list.length, feedIndex: CIX.sum ? arr(CIX.sum.feed).length : 0, rows: Object.keys(CIX.rows).length }; },   /* patch CCPHOTOS1 */
  work: function(){ kick(0); }, render: function(){ renderMain(); },""", 'console')

# ── 5. a CompanyCam link that stopped loading asks once for a fresh one ──
sub("""  root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput); root.addEventListener('focusout', onBlur, true);""",
    """  root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput); root.addEventListener('focusout', onBlur, true);
  root.addEventListener('error', cixImgErr, true);   /* patch CCPHOTOS1 */""", 'img error')

# ── opened: the index summary (no CompanyCam check needed); the feed from it; the existing tick reads it again after 10 min ──
sub("""function ccWake(){
  if (!shown()) return;""", """function ccWake(){
  if (!shown()) return;
  cixWake();   /* patch CCPHOTOS1 */""", 'wake')
sub("""  if (vis && tick % 6 === 0) { ccProjectsRefresh(); if (S.screen === 'job' && S.jobId) ccLoad(S.jobId); }""",
    """  if (vis && tick % 6 === 0) { ccProjectsRefresh(); cixWake(); if (S.screen === 'job' && S.jobId) ccLoad(S.jobId); }   /* patch CCPHOTOS1: + the index (cached 10 min) */""", 'tick')
sub("""  LK.list = null; LK.at = 0; LK.busy = false; LK.msg = '';""",
    """  LK.list = null; LK.at = 0; LK.busy = false; LK.msg = '';
  CIX.rows = {}; CIX.rowsAt = {}; CIX.fresh = {}; CIX.busy = null; CIX.same = 0; CIX.errs = 0; ccFeed.fromIdx = false;   /* patch CCPHOTOS1: the summary stays (small); a job's rows go */""", 'teardown')
sub("""function pvFeedLoad(){
  if (!ccOn() || !online() || !shown() || ccFeed.busy || Date.now() - ccFeed.at < 5 * 60e3) return;""",
    """function pvFeedLoad(){
  if (cixFeed()) return;   /* patch CCPHOTOS1: the index's newest photos across every linked project */
  if (!ccOn() || !online() || !shown() || ccFeed.busy || Date.now() - ccFeed.at < 5 * 60e3) return;""", 'feed')

# ── 7. 📸 CompanyCam sync status: the photo index + "⟳ Index all photos now" ──
sub("""  var h1 = '<div style="font-weight:800;font-size:18px;margin-bottom:6px">📸 CompanyCam sync status</div>'""",
    """  rows.push(['CompanyCam photos in GrayCo Photos', pixLine(d.photoIndex)]);   /* patch CCPHOTOS1 */
  var h1 = '<div style="font-weight:800;font-size:18px;margin-bottom:6px">📸 CompanyCam sync status</div>'""", 'status row')
sub("""    + '<button type="button" data-ccs-full style="padding:8px 14px;border-radius:8px;border:0;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">⟳ Sync all now</button>'""",
    """    + '<button type="button" data-ccs-full style="padding:8px 14px;border-radius:8px;border:0;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">⟳ Sync all now</button>'
    + '<button type="button" data-ccs-pidx style="padding:8px 14px;border-radius:8px;border:0;background:#0f766e;color:#fff;font-weight:700;cursor:pointer" title="Every photo of every CompanyCam project a job or lead is linked to, listed for GrayCo Photos (CompanyCam\\'s small links — no picture is copied)">⟳ Index all photos now</button>'""", 'status button')
sub("""  if (t.closest('[data-ccs-full]')) {""",
    """  if (t.closest('[data-ccs-pidx]')) { S.msg = 'Starting…'; paint(); post('photoindex').then(function(r){ S.msg = r.ok ? (r.message || 'Indexing every CompanyCam photo now.') : ('Could not start: ' + s(r.error)); return load(true); }).then(paint); return; }   /* patch CCPHOTOS1 */
  if (t.closest('[data-ccs-full]')) {""", 'status click')
sub("""function plainLine(){
  var d = S.data, h = d && d.health;""", """/* patch CCPHOTOS1: the server's photo index (companycam-photos) in one line */
function pixLine(pi){
  if (!pi) return 'Not run yet — the first run after this release lists every photo of every linked project (within 15 minutes). ⟳ Index all photos now starts it at once.';
  var pr = pi.prog, t = (+pi.indexed || 0) + ' of ' + (+pi.linked || 0) + ' linked projects · ' + (+pi.photos || 0).toLocaleString() + ' photos';
  if (pr && !pr.doneAt) t += ' — indexing now: ' + pr.done + ' / ' + pr.total + ' projects, ' + (+pr.photos || 0).toLocaleString() + ' photos so far';
  else if (pr && pr.doneAt) t += ' · ' + (pr.kind === 'request' ? 'full re-index' : pr.kind || 'backfill') + ' finished ' + when(pr.doneAt);
  if (pi.queue && !(pr && !pr.doneAt)) t += ' · ' + pi.queue + ' waiting';
  if (pi.wait) t += ' · CompanyCam asked to wait until ' + when(pi.wait);
  if (pi.last && pi.last.error) t += ' · last problem: ' + s(pi.last.error);
  if (pi.last && pi.last.at) t += ' · last run ' + when(pi.last.at);
  return t;
}
function plainLine(){
  var d = S.data, h = d && d.health;""", 'pixLine')

# the old newest-40 read, when it was asked before the index arrived, never replaces the index's feed
sub("""    ccFeed.list = list; ccFeed.map = map; pvVer++; emit('cc');""",
    """    if (ccFeed.fromIdx) return;   /* patch CCPHOTOS1 */
    ccFeed.list = list; ccFeed.map = map; pvVer++; emit('cc');""", 'feed live')

open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
