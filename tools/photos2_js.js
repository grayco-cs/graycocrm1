/* ══ PHOTOS2 (__GC_PATCH_PHOTOS2__): CompanyCam-style home — greeting, Jump Back In, Live Photo Feed, All projects ══
   Everything here is derived data, memoized on pvVer (bumped by emit()); no timers, no observers, no polling.
   Visibility is unchanged: only projects that items() returns (the CRM's own list for this person) are used. */
var pvVer = 0, pvMemo = null, pvView = null, pvReady = false, pvLM = { k: '', v: null };
var ccFeed = { at: 0, list: [], map: {}, busy: false };
var PV_PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>';
var PV_IMG = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="1.8"></circle><path d="M21 16l-5-5-8 9"></path></svg>';
function pvBoot(){
  if (pvBoot.done) return; pvBoot.done = true;
  try { PH.load().then(function(){ pvReady = true; pvVer++; emit('any'); }, function(){ pvReady = true; }); } catch (e) { pvReady = true; }
}
function pvCss(){ return '\n' + __PV_CSS__; }
function pvViewKey(){ return 'gcu_viewed:' + (myKey() || 'me'); }
function pvViewed(){ if (!pvView) pvView = jGet(pvViewKey(), {}) || {}; return pvView; }
function pvMarkViewed(id){
  if (!id) return; var m = pvViewed(); m[String(id)] = nowIso();
  var ks = Object.keys(m); if (ks.length > 40) { ks.sort(function(a, b){ return m[a] < m[b] ? 1 : -1; }); ks.slice(40).forEach(function(k){ delete m[k]; }); }
  jSet(pvViewKey(), m); pvVer++;
}
function pvShort(iso){
  var t = Date.parse(iso); if (!t) return '';
  var m = Math.max(0, Math.round((Date.now() - t) / 60000)); if (m < 1) return 'now'; if (m < 60) return m + 'm';
  var h = Math.round(m / 60); if (h < 24) return h + 'h';
  var d = Math.round(h / 24); if (d < 14) return d + 'd'; if (d < 60) return Math.round(d / 7) + 'w'; return Math.round(d / 30) + 'mo';
}
function pvAgo(iso){
  var t = Date.parse(iso); if (!t) return '';
  var m = Math.max(0, Math.round((Date.now() - t) / 60000)); if (m < 2) return 'just now'; if (m < 60) return m + ' min ago';
  var h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  var d = Math.round(h / 24); if (d < 31) return d + (d === 1 ? ' day ago' : ' days ago');
  return md(iso);
}
function pvGreeting(){ var h = new Date().getHours(); return (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (first(myName()) ? ', ' + first(myName()) : ''); }

/* newest photos across all projects (one fetch, cached 5 min); a photo is kept only when its project is one this person can see */
function pvFeedLoad(){
  if (!ccOn() || !online() || ccFeed.busy || Date.now() - ccFeed.at < 5 * 60e3) return;
  ccFeed.busy = true; ccFeed.at = Date.now();
  window.fetch(FN_CC + '?proxy=api&raw=1&per_page=40&endpoint=photos', { headers: { 'x-gc-cc': '1' } }).then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; }).then(function(j){
    if (j && !Array.isArray(j)) j = j.photos || j.data || j.results || j.items || null;
    if (!Array.isArray(j)) return;
    var byCc = {}; items().forEach(function(it){ if (it.ccId) byCc[String(it.ccId)] = it.id; });
    var list = [], map = {};
    j.forEach(function(ph){ var jid = byCc[String(ph.project_id || (ph.project && ph.project.id) || '')]; if (!jid) return; var r = ccMap(jid, ph); if (r) { list.push(r); map[r.id] = r; } });
    ccFeed.list = list; ccFeed.map = map; pvVer++; emit('cc');
  }).catch(function(){}).then(function(){ ccFeed.busy = false; });
}
function pvData(){
  var its = items(), k = pvVer + '|' + its.length;
  if (pvMemo && pvMemo.k === k) return pvMemo;
  var ids = {}; its.forEach(function(it){ ids[it.id] = it; });
  var by = photoIndex(), idx = {}, feed = [], seen = {}, mine = {}, last = {};
  Object.keys(by).forEach(function(j){
    if (!ids[j]) return;
    var l = by[j]; idx[j] = l;
    for (var i = 0; i < l.length && i < 60; i++) if (!seen[l[i].id]) { seen[l[i].id] = 1; feed.push(l[i]); }
    for (var m = 0; m < l.length; m++) { var r = l[m]; if (isMe(r.byKey || r.by)) { var a = s(r.addedAt && r.source !== 'companycam' ? r.addedAt : r.at); if (a > (mine[j] || '')) mine[j] = a; } }
  });
  ccFeed.list.forEach(function(r){ if (ids[r.jobId] && !seen[r.id]) { seen[r.id] = 1; feed.push(r); } });
  feed.sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : s(a.at) > s(b.at) ? -1 : 0; });
  its.forEach(function(it){ last[it.id] = lastOf(it, idx[it.id]); });
  pvMemo = { k: k, ids: ids, items: its, idx: idx, feed: feed.slice(0, 240), mine: mine, last: last };
  return pvMemo;
}
function pvJump(d){
  var v = pvViewed(), sc = {};
  d.items.forEach(function(it){ var a = s(v[it.id]), b = s(d.mine[it.id]); var m = a > b ? a : b; if (m) sc[it.id] = m; });
  var ids = Object.keys(sc).sort(function(a, b){ return sc[a] < sc[b] ? 1 : -1; });
  var out = ids.slice(0, 12).map(function(i){ return d.ids[i]; });
  if (out.length < 8) {
    var have = {}; out.forEach(function(it){ have[it.id] = 1; });
    d.items.filter(function(it){ return !have[it.id] && d.last[it.id] && it.section !== 'Completed'; })
      .sort(function(a, b){ return s(d.last[a.id].at) < s(d.last[b.id].at) ? 1 : -1; }).slice(0, 8 - out.length).forEach(function(it){ out.push(it); });
  }
  return out;
}
function pvImg(r){ var t = imgTag(r); return t.indexOf('loading=') < 0 ? t.replace('<img ', '<img loading="lazy" ') : t; }
function pvCard(it, d, jump){
  var list = d.idx[it.id] || [], cover = list[0], last = d.last[it.id], cnt = list.length || (it.kind === 'cc' && it.raw && it.raw.photo_count) || 0;
  var when = last ? pvAgo(last.at) : '';
  var un = (!jump && it.kind !== 'cc') ? unreadIn(threadJob(it.id)) : 0;
  return '<button class="pv-card" data-a="job" data-id="' + esc(it.id) + '" data-sec="' + esc(it.section) + '">' +
    '<div class="pv-cover"><div class="pv-img">' + (cover ? pvImg(cover) : '<span class="pv-nophoto">' + PV_IMG + '</span>') + '</div>' +
    (jump ? '' : '<span class="pv-chip" style="left:10px;top:10px"><i style="background:' + (SEC_COLOR[it.section] || '#8C90A6') + '"></i>' + esc(it.section) + '</span><span class="pv-chip" style="right:10px;top:10px">' + cnt + ' photo' + (cnt === 1 ? '' : 's') + '</span>') +
    (un ? '<span class="gcu-tagp" data-unread="' + un + '" style="right:10px;bottom:10px;background:' + GOLD + ';color:' + INDIGO + '">' + un + ' new</span>' : '') +
    '<span class="pv-pin">' + PV_PIN + '</span></div>' +
    '<div class="pv-cb"><span class="pv-nm">' + esc(it.name) + '</span>' +
    (jump ? '<span class="pv-sub">' + esc(when || it.address || it.status) + '</span>' : '<span class="pv-sub">' + esc(it.address || it.client || it.status) + '</span><span class="pv-sub">' + (cnt ? cnt + ' photo' + (cnt === 1 ? '' : 's') + (when ? ' · ' + esc(when) : '') : esc(when || 'No photos yet')) + '</span>') +
    '</div></button>';
}
function pvTile(r, mode){
  var cc = r.source === 'companycam', n = mode === 'job' ? commentCount(r.id) : 0, it = mode === 'feed' ? itemById(r.jobId) : null;
  var t = '<button class="gcu-t pv-t" data-a="photo" data-id="' + esc(r.id) + '" data-job="' + esc(r.jobId) + '" data-tag="' + esc(r.tag || '') + '" data-src-kind="' + (cc ? 'cc' : 'gc') + '" aria-label="' + esc((r.tag || 'Photo') + ' by ' + r.by + ', ' + (cc ? 'from CompanyCam' : 'GrayCo Photos')) + '">' +
    pvImg(r) + '<span class="pv-time">' + (mode === 'job' ? esc(hm(r.at).replace(' ', '').replace(/M$/, '').toLowerCase()) : esc(pvShort(r.at))) + '</span>' + av(dispName(r), 26) +
    (n ? '<span class="gcu-cm">' + n + ' 💬</span>' : '') + (cc ? '<span class="gcu-ccb">CC</span>' : r.source === 'sub' ? '<span class="gcu-subb">SUB</span>' : '') +
    (r._local || (!cc && !r.ref) ? '<span class="gcu-wait" title="Waiting to upload">⏳</span>' : '') + (!sharedOf(r) ? '<span class="gcu-lock" title="' + (subsOf(r) ? 'Hidden from the customer' : 'Internal only') + '">🔒</span>' : '') + '</button>';
  if (mode !== 'feed') return t;
  return '<div class="pv-ft">' + t + '<span class="pv-by">' + esc(short(dispName(r))) + '</span>' + (it ? '<span class="pv-pj">' + esc(it.name) + '</span>' : '') + '</div>';
}
function pvSkeleton(){
  var c = '', t = ''; for (var i = 0; i < 4; i++) c += '<div class="pv-skc"><div class="pv-sk"></div><div class="pv-sk"></div><div class="pv-sk" style="width:35%"></div></div>';
  for (var j = 0; j < 7; j++) t += '<div class="pv-sk pv-skt"></div>';
  return '<div class="gcu-pad pv" aria-busy="true"><h1 class="pv-hi">' + esc(pvGreeting()) + '</h1><div class="pv-sec"><div class="pv-h"><h2>Jump Back In</h2></div><div class="pv-rail">' + c + '</div></div>' +
    '<div class="pv-panel"><div class="pv-h"><h2>Live Photo Feed</h2></div><div class="pv-rail pv-feed">' + t + '</div></div></div>';
}
function pvEmpty(title, sub, cta){
  return '<div class="pv-empty"><span class="pv-ic">' + PV_IMG + '</span><b>' + esc(title) + '</b><span>' + esc(sub) + '</span>' + (cta || '') + '</div>';
}
function pvArrows(id){ return '<button class="pv-arr" data-a="rail" data-v="' + id + '" data-d="-1" aria-label="Previous">‹</button><button class="pv-arr" data-a="rail" data-v="' + id + '" data-d="1" aria-label="Next">›</button>'; }
function pvAll(d, q){
  var key = d.k + '|' + S.section + '|' + q + '|' + S.psort, list;
  if (pvLM.k === key) list = pvLM.v;
  else {
    list = d.items.filter(function(it){ return (S.section === 'All' || it.section === S.section) && matches(it, q, d.idx); });
    var at = function(it){ var l = d.last[it.id]; return l ? s(l.at) : ''; };
    list.sort(function(a, b){
      if (S.psort === 'az') return low(a.name) < low(b.name) ? -1 : 1;
      if (S.psort === 'photos') { var x = (d.idx[a.id] || []).length, y = (d.idx[b.id] || []).length; if (x !== y) return y - x; }
      var p = at(a), r = at(b); return p < r ? 1 : p > r ? -1 : (a.name < b.name ? -1 : 1);
    });
    pvLM = { k: key, v: list };
  }
  var cnt = { All: 0, Leads: 0, Bidding: 0, Active: 0, Completed: 0 };
  d.items.forEach(function(it){ cnt.All++; cnt[it.section]++; });
  var shown = list.slice(0, S.pm);
  var h = '<div class="pv-sec"><div class="pv-h"><h2>' + (q ? 'Results' : 'All projects') + '</h2><span class="pv-ct">' + list.length + ' project' + (list.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="pv-bar"><div class="pv-chips" role="tablist">' + SECTIONS.map(function(x){ return '<button class="pv-fc' + (S.section === x ? ' on' : '') + '" data-a="sec" data-v="' + x + '" role="tab" aria-selected="' + (S.section === x) + '"><i style="background:' + (SEC_COLOR[x] || '#cfd2dd') + '"></i>' + x + ' <em>' + cnt[x] + '</em></button>'; }).join('') + '</div>' +
    '<select class="pv-sort" data-psort="1" aria-label="Sort projects"><option value="recent"' + (S.psort === 'recent' ? ' selected' : '') + '>Recently active</option><option value="az"' + (S.psort === 'az' ? ' selected' : '') + '>Name A–Z</option><option value="photos"' + (S.psort === 'photos' ? ' selected' : '') + '>Most photos</option></select></div>';
  if (!list.length) h += pvEmpty(q ? 'Nothing matches “' + S.q + '”' : 'No projects in ' + S.section, q ? 'Try a project name, an address or a person.' : 'Pick another group above, or start a new project.', '');
  else h += '<div class="pv-grid">' + shown.map(function(it){ return pvCard(it, d, false); }).join('') + '</div>' +
    (list.length > shown.length ? '<button class="pv-more" data-a="more">Load more (' + (list.length - shown.length) + ')</button>' : '');
  return h + '</div>';
}
function pvFeedAll(d){
  var shown = d.feed.slice(0, S.fm);
  return '<div class="gcu-pad pv"><div class="pv-sec"><button class="pv-back" data-a="feedback">‹ Back</button><div class="pv-h"><h2>Live Photo Feed</h2><span class="pv-ct">Newest first</span></div>' +
    (shown.length ? '<div class="pv-fgrid">' + shown.map(function(r){ return pvTile(r, 'feed'); }).join('') + '</div>' + (d.feed.length > shown.length ? '<button class="pv-more" data-a="fmore">Load more</button>' : '')
      : pvEmpty('No photos yet', 'Photos from every project show up here as soon as they are taken.', '<button class="pv-cta" data-a="camera">Take a photo</button>')) + '</div></div>';
}
function vProjects(){
  if (!pvReady || !Array.isArray(crm().projects)) return pvSkeleton();
  var d = pvData(), q = low(S.q);
  if (S.feedAll && !q) return pvFeedAll(d);
  var h = '<div class="gcu-pad pv">';
  if (!q) {
    var jump = pvJump(d);
    h += '<h1 class="pv-hi">' + esc(pvGreeting()) + '<small>Here is what is happening across your projects.</small></h1>';
    h += '<div class="pv-sec"><div class="pv-h"><h2>Jump Back In</h2><span class="pv-tools">' + (jump.length > 1 ? pvArrows('pv-jb') : '') + '</span></div>' +
      (jump.length ? '<div class="pv-rail" id="pv-jb">' + jump.map(function(it){ return pvCard(it, d, true); }).join('') + '</div>'
        : pvEmpty('Nothing here yet', 'Open a project or add a photo and it will be waiting for you here.', '<button class="pv-cta" data-a="newproj">New project</button>')) + '</div>';
    var rail = d.feed.slice(0, 24);
    h += '<div class="pv-panel"><div class="pv-h"><h2>Live Photo Feed</h2><span class="pv-tools">' + (d.feed.length ? '<button class="pv-link" data-a="feedall">View All</button>' : '') + (rail.length > 3 ? pvArrows('pv-fd') : '') + '</span></div>' +
      (rail.length ? '<div class="pv-rail pv-feed" id="pv-fd">' + rail.map(function(r){ return pvTile(r, 'feed'); }).join('') + '</div>'
        : pvEmpty('No photos yet', 'Take the first photo and it will show up here for the whole team.', '<button class="pv-cta" data-a="camera">Take a photo</button>')) + '</div>';
  }
  return h + pvAll(d, q) + '</div>';
}
function tileHtml(r){ return pvTile(r, 'job'); }
function headHtml(){
  if (inner()) return headHtmlOld();
  var right = syncPill(false) + meBtn() + '<button class="gcu-ib" data-a="settings" aria-label="GrayCo Photos settings">⚙</button>' + (S.tab ? '' : '<button class="gcu-ib" data-a="close" aria-label="Close GrayCo Photos">✕</button>');
  var h = '<div class="gcu-row">' + (S.tab && tabCanBack() ? '<button class="gcu-ib" data-a="tabback" aria-label="Back">' + BACK_SVG + '</button>' : '') + '<span class="gcu-wm"><img src="' + LOGO_NAVY + '" alt="GrayCo Construction Services"><b>Photos</b></span>' + right + '</div>';
  if (S.screen === 'projects') h += '<div class="gcu-row pv-sr"><input id="gcu-q" class="gcu-search" type="text" inputmode="search" placeholder="Search projects" aria-label="Find a project, address or person" value="' + esc(S.q) + '" autocomplete="off"><button type="button" class="pv-new" data-a="newproj">＋ New<span class="pv-nl"> project</span></button>';
  return h;
}
