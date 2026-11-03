/* __GC_PATCH_JOBUPDATES__ — GrayCo Field: "📝 Updates & notes", its own white page for one job.
   Owner 11/03 (iPhone, Field, job "ROTC Cordova"): "Clicked Post Update, it popped up this dark screen, not just a post
   update page. All updates need to be shown on that button along with add update. I want its own button, and it just
   shows all updates and notes on this job."
   The job page's "Post Update" tile opened the old dark Job Info sheet (window._gcOpenJobProfile) scrolled to its
   "Job Updates" box. Now the tile is "📝 Updates & notes" (same place) and opens this page:
   • a white full-screen page inside the CRM; the top bar has ‹ Back and the job's name (always on screen: a fixed bar
     under the iPhone notch, env(safe-area-inset-top)); the phone's Back returns to the job page (a history entry);
   • on top "Add an update" + a big Post button — the SAME save as the old Job Updates box (project.updates, newest
     first, { text, by: grayco_user, at } through window._setProjects), so the data and who gets told are unchanged.
     (That box takes no photos, so neither does this one.)
   • below, newest first, read-only, everything the CRM already keeps on the job: its posted updates (project.updates),
     its customer-portal posts (project.portalPosts — "shared with customer"), the Site Book daily logs (gc_sitebook,
     window._gcRP.site().rec(pid).logs; a log posted to the portal is "shared with customer"), older daily logs
     (project.dailyLogs, localStorage gc_daily_logs), the job notes and Customer Notes (project.notes /
     project.customerNotes, one entry per line; the ⚠️ AUTO-FLAG lines greyed), the automations' log (project.autoLog,
     greyed), the job's activity notes (project.activity) and the PM checklist's field notes (idb gcPMScope).
     Each shows who, when, the text and photo thumbnails. Filter chips: All · Updates · Notes · Daily log · Customer-visible.
   Nothing is moved or rewritten; the 📋 Job Info tile and its sheet are untouched.
   Console: _gcJobUpdates.open(pid) · _gcJobUpdates.items(pid) → Promise of the merged list */
(function(){
'use strict';
if (window.__GC_PATCH_JOBUPDATES__) return; window.__GC_PATCH_JOBUPDATES__ = true;
var W = window, D = document;
var _st = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout, _si = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return _st.call(W, f, ms || 0); }
function every(f, ms){ return _si.call(W, f, ms); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function C(){ return W._crm || {}; }
function proj(pid){
  var l = arr(C().projects), hit = null;
  for (var i = 0; i < l.length; i++) if (l[i] && s(l[i].id) === s(pid)) { hit = l[i]; break; }
  if (!hit && W._gcCurrentJob && s(W._gcCurrentJob.id) === s(pid)) hit = W._gcCurrentJob;
  return hit;
}
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function nameOf(by){
  by = s(by); if (!by || by.indexOf('@') < 0) return by;
  var u = arr(C().users).filter(function(x){ return x && low(x.email) === low(by); })[0];
  return u && s(u.name) ? s(u.name) : by;
}

/* ── when: an ISO stamp, "2026-06-11", "10/23/2026" or the PM checklist's "Nov 3, 9:39 AM" ── */
function stamp(v){
  v = s(v); if (!v) return { t: 0, day: false };
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return { t: new Date(+m[1], +m[2] - 1, +m[3], 12).getTime(), day: true };
  var t = Date.parse(v);
  if (isFinite(t) && /\d{4}/.test(v)) return { t: t, day: !/[T ]\d{1,2}:\d{2}/.test(v) };
  m = /^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{1,2}):(\d{2}) ?([AP]M)$/i.exec(v);
  if (m) {
    var y = new Date().getFullYear(), d = new Date(m[1] + ' ' + m[2] + ', ' + y + ' ' + m[3] + ':' + m[4] + ' ' + m[5]);
    if (isFinite(d.getTime()) && d.getTime() > Date.now() + 864e5) d.setFullYear(y - 1);
    return { t: isFinite(d.getTime()) ? d.getTime() : 0, day: false };
  }
  return { t: 0, day: false };
}
function lineDate(line){
  var m = /\[(\d{4}-\d{2}-\d{2})/.exec(line) || /\b(\d{4}-\d{2}-\d{2})\b/.exec(line);
  if (m) return stamp(m[1]);
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(line);
  if (m) return { t: new Date(+m[3], +m[1] - 1, +m[2], 12).getTime(), day: true };
  return { t: 0, day: false };
}
function when(x){
  if (!x.t) return '';
  var d = new Date(x.t), y = d.getFullYear() !== new Date().getFullYear();
  var o = x.day ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (y) o.year = 'numeric';
  try { return d.toLocaleString([], o); } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
}

/* ── photos: { ref | url, name } — an image ref is shown as a thumbnail, anything else as 📎 name ── */
function pics(list){
  return arr(list).map(function(f){
    if (!f) return null; if (typeof f === 'string') f = { ref: f };
    var ref = s(f.thumbRef || f.ref || f.url || f.src || f.data), nm = s(f.name || f.fileName);
    if (!ref) return null;
    var img = /^image\//i.test(s(f.type)) || /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(nm || ref) || /^data:image\//i.test(ref) || (!s(f.type) && !/\.(pdf|docx?|xlsx?|csv|txt)(\?|$)/i.test(nm || ref));
    return { ref: ref, name: nm, img: img };
  }).filter(Boolean);
}

/* ── the sources (read only) ── */
function siteLogs(pid){
  var logs = null;
  try { var SB = W._gcRP && typeof W._gcRP.site === 'function' ? W._gcRP.site() : null; if (SB && typeof SB.rec === 'function') logs = arr((SB.rec(pid) || {}).logs); } catch (e) {}
  if (!logs) { try { var m = JSON.parse(lsGet('gcRP_sitebook_v1') || '{}') || {}; logs = arr((m[pid] || {}).logs); } catch (e) { logs = []; } }
  return logs.filter(function(x){ return x && !x.deleted; });
}
var FIELDS = [['work', ''], ['delays', 'Delays'], ['deliveries', 'Deliveries'], ['equipment', 'Equipment'], ['visitors', 'Visitors / inspections'], ['safety', 'Safety'], ['weather', 'Weather']];
function logText(x){
  var out = [];
  FIELDS.forEach(function(f){ var v = s(x[f[0]]); if (v) out.push(f[1] ? f[1] + ': ' + v : v); });
  var mp = arr(x.manpower).filter(function(m){ return m && s(m.company); }).map(function(m){ return s(m.company) + (m.headcount ? ' ×' + m.headcount : ''); });
  if (mp.length) out.push('Crew: ' + mp.join(', '));
  if (!out.length && s(x.text || x.note || x.notes)) out.push(s(x.text || x.note || x.notes));
  return out.join('\n');
}
function pmScope(){
  return new Promise(function(res){
    try {
      if (!W.indexedDB) return res(null);
      var q = W.indexedDB.open('grayco_crm');
      q.onsuccess = function(e){ try { var db = e.target.result; if (!db.objectStoreNames.contains('kv')) { db.close(); return res(null); } var g = db.transaction('kv', 'readonly').objectStore('kv').get('gcPMScope'); g.onsuccess = function(){ res(g.result || null); db.close(); }; g.onerror = function(){ res(null); db.close(); }; } catch (x) { res(null); } };
      q.onerror = function(){ res(null); }; q.onblocked = function(){ res(null); };
      q.onupgradeneeded = function(e){ try { e.target.transaction.abort(); } catch (x) {} res(null); };
    } catch (e) { res(null); }
    later(function(){ res(null); }, 2500);
  });
}
function items(pid, sync){
  var p = proj(pid); if (!p) return sync ? [] : Promise.resolve([]);
  var out = [], seq = 0;
  function add(o){ var w = o.w || { t: 0, day: false }; o.t = w.t; o.day = w.day; o.n = seq++; out.push(o); }
  arr(p.updates).forEach(function(u){ if (u && s(u.text || u.note)) add({ src: 'updates', kind: 'update', label: 'Job update', by: nameOf(u.by || u.author), text: s(u.text || u.note), w: stamp(u.at || u.date), photos: pics(u.photos || u.files) }); });
  var logIds = {};
  siteLogs(pid).forEach(function(x){
    var t = logText(x); if (!t && !arr(x.photos).length) return;
    logIds['pp_' + s(x.id)] = 1;
    add({ src: 'sitebook', kind: 'log', label: 'Daily log' + (x.date ? ' · ' + s(x.date) : ''), by: nameOf(x.by || x.signedBy), text: t, w: stamp(x.createdAt || x.at || x.date), photos: pics(x.photos), cust: x.portal === 'posted' });
  });
  arr(p.portalPosts).forEach(function(x){
    if (!x || x.hidden || x.deleted) return;
    if (logIds[s(x.id)]) return;   /* a Site Book log posted to the portal: shown once, as the log, "shared with customer" */
    add({ src: 'portalPosts', kind: 'portal', label: 'Customer portal post', by: nameOf(x.by), text: s(x.text), w: stamp(x.at), photos: pics(x.files || x.photos), cust: true });
  });
  arr(p.dailyLogs).concat(arr(lsGet('gc_daily_logs')).filter(function(l){ return l && s(l.pid || l.projectId) === s(pid); })).forEach(function(x){
    if (!x || x.deleted) return; var t = logText(x); if (!t) return;
    add({ src: 'dailyLogs', kind: 'log', label: 'Daily log' + (x.date ? ' · ' + s(x.date).slice(0, 10) : ''), by: nameOf(x.by), text: t, w: stamp(x.at || x.createdAt || x.date), photos: pics(x.photos) });
  });
  function lines(v, src, label){
    if (Array.isArray(v)) { v.forEach(function(n){ if (n && typeof n === 'object' && s(n.text || n.note)) add({ src: src, kind: 'note', label: label, by: nameOf(n.by || n.author), text: s(n.text || n.note), w: stamp(n.at || n.date), auto: /AUTO-FLAG/.test(s(n.text || n.note)) }); else if (typeof n === 'string' && s(n)) add({ src: src, kind: 'note', label: label, text: s(n), w: lineDate(n), auto: /AUTO-FLAG/.test(n) }); }); return; }
    s(v).split(/\r?\n/).forEach(function(l){
      l = s(l); if (!l) return;
      var auto = /AUTO-FLAG/.test(l);
      add({ src: src, kind: 'note', label: label, by: auto ? 'Automatic' : '', text: l, w: lineDate(l), auto: auto });
    });
  }
  lines(p.notes, 'notes', 'Job notes');
  lines(p.customerNotes, 'customerNotes', 'Customer Notes');
  arr(p.autoLog).forEach(function(x){ if (x && s(x.text)) add({ src: 'autoLog', kind: 'note', label: 'Automatic', by: nameOf(x.by) || 'Automations', text: s(x.text), w: stamp(x.at), auto: true }); });
  arr(p.activity).forEach(function(x){ if (x && s(x.text)) add({ src: 'activity', kind: 'note', label: 'Activity', by: nameOf(x.by), text: s(x.text), w: stamp(x.at), auto: /^(repair|auto)/i.test(s(x.type)) }); });
  function done(){
    out.sort(function(a, b){ return (b.t || -1) - (a.t || -1) || a.n - b.n; });   /* newest first; undated at the end, in their own order */
    return out;
  }
  if (sync) return done();
  return pmScope().then(function(all){
    var r = all && all[pid];
    arr(r && r.fieldNotes).forEach(function(n){ if (n && s(n.note || n.text)) add({ src: 'gcPMScope', kind: 'note', label: 'Field note', by: nameOf(n.by), text: s(n.note || n.text), w: stamp(n.date || n.at) }); });
    return done();
  });
}

/* ── the save: exactly the old Job Updates box's (patch: the job profile, "Quick Job Update") ── */
var PENDING = {};
function post(pid, t){
  var p = proj(pid); if (!p) return false;
  if (typeof W._setProjects !== 'function') return false;
  var me = ''; try { me = localStorage.getItem('grayco_user') || ''; } catch (e) {}
  var u = { text: t, by: me, at: new Date().toISOString() };
  var job = p;
  W._setProjects(function(list){ return (list || []).map(function(pp){ if (pp && pp.id === job.id) { var a = (pp.updates || []).slice(); a.unshift(u); return Object.assign({}, pp, { updates: a }); } return pp; }); });
  (PENDING[s(pid)] = PENDING[s(pid)] || []).push(u);
  later(function(){ if (W.__GC_REFRESH_UI__) W.__GC_REFRESH_UI__(); }, 900);
  return u;
}

/* ── the page ── */
var CSS = [
  '#_gcJobUpd{position:fixed;inset:0;z-index:100022;background:#fff;color:#1f2a37;display:flex;flex-direction:column;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light;-webkit-text-size-adjust:100%}',
  '#_gcJobUpd *{box-sizing:border-box}',
  '#_gcJobUpd .gcju-head{flex:0 0 auto;position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 12px 8px;background:#fff;border-bottom:1px solid #e5e7eb;min-height:calc(60px + env(safe-area-inset-top,0px))}',
  '#_gcJobUpd .gcju-back{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;min-height:44px;min-width:76px;padding:0 12px 0 6px;border:none;border-radius:12px;background:transparent;color:#2563eb;font:700 17px Inter,-apple-system,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;visibility:visible!important;opacity:1!important}',
  '#_gcJobUpd .gcju-back .ch{font-size:26px;line-height:1;margin-top:-3px}',
  '#_gcJobUpd .gcju-ttl{min-width:0;flex:1 1 auto}',
  '#_gcJobUpd .gcju-ttl b{display:block;font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '#_gcJobUpd .gcju-ttl small{display:block;font-size:12px;color:#6b7280;font-weight:600}',
  '#_gcJobUpd .gcju-body{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:14px 16px calc(28px + env(safe-area-inset-bottom,0px))}',
  '#_gcJobUpd .gcju-add{border:1px solid #e5e7eb;border-radius:16px;padding:12px;background:#f9fafb;margin-bottom:14px}',
  '#_gcJobUpd .gcju-add label{display:block;font-size:14px;font-weight:800;margin-bottom:8px;color:#111827}',
  '#_gcJobUpd .gcju-add textarea{width:100%;min-height:84px;padding:12px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;color:#111827;font:16px/1.4 Inter,-apple-system,sans-serif;resize:vertical}',
  '#_gcJobUpd .gcju-add textarea:focus{outline:2px solid #2563eb;outline-offset:0;border-color:#2563eb}',
  '#_gcJobUpd .gcju-post{display:block;width:100%;margin-top:10px;min-height:52px;border:none;border-radius:12px;background:#16a34a;color:#fff;font:800 17px Inter,-apple-system,sans-serif;cursor:pointer}',
  '#_gcJobUpd .gcju-post:disabled{opacity:.6}',
  '#_gcJobUpd .gcju-msg{font-size:13px;margin-top:8px;color:#b91c1c;min-height:0}',
  '#_gcJobUpd .gcju-msg.ok{color:#15803d}',
  '#_gcJobUpd .gcju-chips{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 0 10px;margin:0 -2px;scrollbar-width:none}',
  '#_gcJobUpd .gcju-chips::-webkit-scrollbar{display:none}',
  '#_gcJobUpd .gcju-chip{flex:0 0 auto;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid #d1d5db;background:#fff;color:#374151;font:700 14px Inter,-apple-system,sans-serif;cursor:pointer;white-space:nowrap}',
  '#_gcJobUpd .gcju-chip.on{background:#1A3A5F;border-color:#1A3A5F;color:#fff}',
  '#_gcJobUpd .gcju-chip i{font-style:normal;opacity:.7;margin-left:4px;font-weight:600}',
  '#_gcJobUpd .gcju-it{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;margin-bottom:9px;background:#fff}',
  '#_gcJobUpd .gcju-it.auto{background:#f3f4f6;border-color:#e5e7eb;color:#6b7280}',
  '#_gcJobUpd .gcju-it.auto .tx{color:#6b7280}',
  '#_gcJobUpd .gcju-it .mt{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12px;color:#6b7280;margin-bottom:5px}',
  '#_gcJobUpd .gcju-it .mt b{color:#111827;font-weight:700}',
  '#_gcJobUpd .gcju-it.auto .mt b{color:#6b7280}',
  '#_gcJobUpd .gcju-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:#eef2f7;color:#334155}',
  '#_gcJobUpd .gcju-tag.k-update{background:#dcfce7;color:#166534}',
  '#_gcJobUpd .gcju-tag.k-log{background:#fef3c7;color:#92400e}',
  '#_gcJobUpd .gcju-tag.k-portal{background:#dbeafe;color:#1e40af}',
  '#_gcJobUpd .gcju-tag.cust{background:#fff7e0;color:#8a5a00;border:1px solid #f0c451}',
  '#_gcJobUpd .gcju-it .tx{font-size:15px;line-height:1.45;color:#1f2937;white-space:pre-wrap;overflow-wrap:anywhere}',
  '#_gcJobUpd .gcju-ph{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
  '#_gcJobUpd .gcju-ph button{width:72px;height:72px;padding:0;border:1px solid #e5e7eb;border-radius:10px;background:#f3f4f6;overflow:hidden;cursor:pointer}',
  '#_gcJobUpd .gcju-ph button img{width:100%;height:100%;object-fit:cover;display:block}',
  '#_gcJobUpd .gcju-ph .file{width:auto;height:auto;min-height:36px;padding:0 10px;font-size:13px;color:#1e40af}',
  '#_gcJobUpd .gcju-empty{color:#6b7280;text-align:center;padding:28px 10px;font-size:14px}',
  'html._fieldmode._gcNavTabs #_gcJobUpd{bottom:calc(66px + env(safe-area-inset-bottom,0px))!important}'
].join('\n');
function css(){ if (D.getElementById('gcju-css')) return; var st = D.createElement('style'); st.id = 'gcju-css'; st.textContent = CSS; (D.head || D.documentElement).appendChild(st); }

var CHIPS = [['all', 'All'], ['update', 'Updates'], ['note', 'Notes'], ['log', 'Daily log'], ['cust', 'Customer-visible']];
function inChip(it, c){ return c === 'all' || (c === 'update' ? (it.kind === 'update' || it.kind === 'portal') : c === 'cust' ? !!it.cust : it.kind === c); }
var CUR = { pid: '', chip: 'all', list: [], sig: '' };
function pendingMerged(pid, list){
  var p = proj(pid), have = arr(p && p.updates), pend = PENDING[s(pid)] || [];
  pend = pend.filter(function(u){ return !have.some(function(h){ return h && h.at === u.at && h.text === u.text; }); });
  PENDING[s(pid)] = pend;
  if (!pend.length) return list;
  var extra = pend.map(function(u){ var w = stamp(u.at); return { src: 'updates', kind: 'update', label: 'Job update', by: nameOf(u.by), text: u.text, t: w.t, day: false, n: -1, photos: [] }; });
  return extra.concat(list).sort(function(a, b){ return (b.t || -1) - (a.t || -1) || a.n - b.n; });
}
function itemHtml(it){
  var k = it.kind === 'portal' ? 'Portal post' : it.kind === 'log' ? 'Daily log' : it.kind === 'update' ? 'Update' : (it.src === 'customerNotes' ? 'Customer Notes' : it.src === 'gcPMScope' ? 'Field note' : it.src === 'autoLog' ? 'Automatic' : it.src === 'activity' ? 'Activity' : 'Note');
  var lab = it.kind === 'log' ? it.label : k;
  var ph = arr(it.photos);
  return '<div class="gcju-it' + (it.auto ? ' auto' : '') + '" data-kind="' + esc(it.kind) + '" data-src="' + esc(it.src) + '"' + (it.cust ? ' data-cust="1"' : '') + '>' +
    '<div class="mt"><span class="gcju-tag k-' + esc(it.kind) + '">' + esc(lab) + '</span>' + (it.cust ? '<span class="gcju-tag cust">👁 Shared with customer</span>' : '') +
      (it.by ? '<b>' + esc(it.by) + '</b>' : '') + '<span class="dt">' + esc(when(it) || 'no date') + '</span></div>' +
    (it.text ? '<div class="tx">' + esc(it.text) + '</div>' : '') +
    (ph.length ? '<div class="gcju-ph">' + ph.slice(0, 12).map(function(f){ return f.img ? '<button type="button" data-ref="' + esc(f.ref) + '" aria-label="Photo ' + esc(f.name) + '"><img alt="" data-ref="' + esc(f.ref) + '"></button>' : '<button type="button" class="file" data-ref="' + esc(f.ref) + '">📎 ' + esc(f.name || 'File') + '</button>'; }).join('') + '</div>' : '') +
  '</div>';
}
function srcOf(ref){
  if (/^(https?:|data:|blob:)/i.test(ref)) return Promise.resolve(ref);
  if (typeof W._gcFileUrl === 'function') { try { return Promise.resolve(W._gcFileUrl(ref)); } catch (e) { return Promise.reject(e); } }
  return Promise.reject(new Error('no file store'));
}
function paintList(ov){
  var list = pendingMerged(CUR.pid, CUR.list), box = ov.querySelector('.gcju-list'), chips = ov.querySelector('.gcju-chips');
  chips.innerHTML = CHIPS.map(function(c){ var n = list.filter(function(it){ return inChip(it, c[0]); }).length; return '<button type="button" class="gcju-chip' + (CUR.chip === c[0] ? ' on' : '') + '" data-chip="' + c[0] + '" aria-pressed="' + (CUR.chip === c[0]) + '">' + c[1] + '<i>' + n + '</i></button>'; }).join('');
  var vis = list.filter(function(it){ return inChip(it, CUR.chip); });
  box.innerHTML = vis.length ? vis.map(itemHtml).join('') : '<div class="gcju-empty">' + (list.length ? 'Nothing here for this filter.' : 'No updates or notes on this job yet. Post the first one above.') + '</div>';
  Array.prototype.forEach.call(box.querySelectorAll('img[data-ref]'), function(im){ srcOf(im.getAttribute('data-ref')).then(function(u){ if (u) im.src = u; }, function(){}); });
}
function load(ov, pid){
  return items(pid).then(function(l){ if (!ov.isConnected || CUR.pid !== s(pid)) return; CUR.list = l; CUR.sig = sig(pid); paintList(ov); });
}
function sig(pid){
  var p = proj(pid) || {};
  var sl = siteLogs(pid);
  return [arr(p.updates).length, arr(p.updates)[0] && arr(p.updates)[0].at, arr(p.portalPosts).length, s(p.notes).length, s(p.customerNotes).length, arr(p.autoLog).length, arr(p.activity).length, arr(p.dailyLogs).length, sl.length, sl.map(function(x){ return s(x.updatedAt); }).join()].join('|');
}
function close(){
  var ov = D.getElementById('_gcJobUpd'); if (!ov) return false;
  ov.remove(); CUR.pid = '';
  /* the on-screen ‹ Back: our history entry stays as a plain "guard" entry (patch NAV's), so a later phone Back does
     not skip a screen */
  try { var hs = history.state; if (hs && hs.gcJobUpd) history.replaceState(Object.assign({}, hs, { gcJobUpd: null, gcNav: 1 }), '', location.href); } catch (e) {}
  try { if (W._gcNavSync) later(W._gcNavSync, 60); } catch (e) {}
  return true;
}
function open(pid){
  var p = proj(pid); if (!p) return false;
  css();
  var old = D.getElementById('_gcJobUpd'); if (old) old.remove();
  CUR = { pid: s(p.id), chip: 'all', list: items(p.id, true), sig: '' };
  var ov = D.createElement('div'); ov.id = '_gcJobUpd'; ov.className = '_gcSheetOv'; ov.setAttribute('data-pid', s(p.id)); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Updates & notes — ' + s(p.name));
  ov.innerHTML = '<div class="gcju-head"><button type="button" class="gcju-back" data-a="back" aria-label="Back"><span class="ch">‹</span><span>Back</span></button>' +
      '<div class="gcju-ttl"><b>' + esc(p.name || 'Job') + '</b><small>📝 Updates &amp; notes</small></div></div>' +
    '<div class="gcju-body">' +
      '<div class="gcju-add"><label for="gcju-text">Add an update</label><textarea id="gcju-text" placeholder="Type an update for this job…" enterkeyhint="send"></textarea>' +
        '<button type="button" class="gcju-post" data-a="post">💬 Post update</button><div class="gcju-msg" role="status"></div></div>' +
      '<div class="gcju-chips" role="toolbar" aria-label="Filter"></div>' +
      '<div class="gcju-list"></div>' +
    '</div>';
  D.body.appendChild(ov);
  paintList(ov);
  load(ov, p.id);
  try { history.pushState(Object.assign({}, history.state || {}, { gcNav: 1, gcJobUpd: s(p.id) }), '', location.href); } catch (e) {}
  ov.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('button'); if (!b || !ov.contains(b)) return;
    var a = b.getAttribute('data-a');
    if (a === 'back') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (a === 'post') {
      e.preventDefault();
      var ta = ov.querySelector('#gcju-text'), msg = ov.querySelector('.gcju-msg'), t = s(ta.value);
      msg.className = 'gcju-msg';
      if (!t) { msg.textContent = 'Type the update first.'; ta.focus(); return; }
      var u = post(CUR.pid, t);
      if (!u) { msg.textContent = 'The job list is not ready on this phone yet — try again in a moment.'; return; }
      ta.value = ''; msg.className = 'gcju-msg ok'; msg.textContent = '✓ Posted';
      later(function(){ if (msg.textContent === '✓ Posted') msg.textContent = ''; }, 2500);
      CUR.chip = CUR.chip === 'all' || CUR.chip === 'update' ? CUR.chip : 'all';
      paintList(ov);
      later(function(){ if (ov.isConnected) load(ov, CUR.pid); }, 1200);
      try { ov.querySelector('.gcju-body').scrollTop = 0; } catch (x) {}
      return;
    }
    var c = b.getAttribute('data-chip');
    if (c) { CUR.chip = c; paintList(ov); return; }
    var ref = b.getAttribute('data-ref');
    if (ref) { srcOf(ref).then(function(u){ if (u) W.open(u, '_blank', 'noopener'); }, function(){}); }
  });
  return true;
}
/* something new on the job (another phone, the office): the list follows */
every(function(){
  var ov = D.getElementById('_gcJobUpd'); if (!ov || !CUR.pid || D.hidden) return;
  if (sig(CUR.pid) !== CUR.sig) load(ov, CUR.pid);
}, 4000);
/* the phone's Back: patch NAV closes the top screen through its ‹ Back (this page's); if NAV is not there, we do */
W.addEventListener('popstate', function(){
  var ov = D.getElementById('_gcJobUpd'); if (!ov) return;
  var hs = history.state; if (hs && hs.gcJobUpd === CUR.pid) return;
  close();
});

/* ── the job page's tile: "📝 Updates & notes", opens this page (not the Job Info sheet) ── */
function retile(){
  var b = D.querySelector('#_gcJobDash ._jdAct[data-fn="update"]'); if (!b) return false;
  if (b.getAttribute('data-gcju') === '1') return true;
  var sp = b.children;
  if (sp.length >= 2) { sp[0].textContent = '📝'; sp[1].textContent = 'Updates & notes'; }
  else b.textContent = '📝 Updates & notes';
  b.setAttribute('data-gcju', '1'); b.setAttribute('aria-label', 'Updates & notes');
  b.onclick = function(e){ if (e) { e.preventDefault(); e.stopPropagation(); } openFromDash(); };
  return true;
}
function curPid(){
  var d = D.getElementById('_gcJobDash');
  var pid = d && (d.getAttribute('data-gcfp') || (W._gcCurrentJob && W._gcCurrentJob.id));
  if (!pid) { try { pid = sessionStorage.getItem('grayco_openpid') || localStorage.getItem('grayco_openpid'); } catch (e) {} }
  return pid;
}
function openFromDash(){ var pid = curPid(); if (pid) open(pid); }
/* the tap is taken before any older handler can open the Job Info sheet */
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#_gcJobDash ._jdAct[data-fn="update"]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  retile(); openFromDash();
}, true);
function wrapDash(){
  var f = W._gcJobDashboard; if (typeof f !== 'function' || f.__gcJU) return;
  var w = function(){ var r = f.apply(this, arguments); try { retile(); later(retile, 0); later(retile, 400); } catch (e) {} return r; };
  try { Object.keys(f).forEach(function(k){ if (!(k in w)) w[k] = f[k]; }); } catch (e) {}
  w.__gcJU = true; W._gcJobDashboard = w;
}
wrapDash(); later(wrapDash, 800); later(wrapDash, 3000);
every(function(){ wrapDash(); if (D.getElementById('_gcJobDash')) retile(); }, 1500);

W._gcJobUpdates = { open: open, close: close, items: function(pid){ return items(pid); }, post: post };
try { console.log('[GC] JOBUPDATES: 📝 Updates & notes — the job\'s own page (updates, notes, daily logs, portal posts)'); } catch (e) {}
})();
