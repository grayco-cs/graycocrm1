/* ══ PHOTODL (__GC_PATCH_PHOTODL__): download photos — one (viewer), a selection, or the whole project — like CompanyCam ══
   Nothing runs until a download is clicked: no timers, no observers. JSZip is loaded from cdnjs (pinned, SRI) only when a ZIP is built.
   Visibility is unchanged: only photos jobPhotos() returns (projects items() lets this person see) can be downloaded.
   Sources: GrayCo photos -> the CRM's own file helper (_gcFileBlob: signed-in storage read of crm-files, fingerprint-checked);
            CompanyCam photos -> a direct CORS fetch of the image CDN first, then the staff-only proxy companycam-webhook?proxy=img. */
var DL = { zipP: null, run: null, direct: true, share: null };
var DL_ZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var DL_SRI = 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==';
var DL_PART = 300 * 1048576, DL_CONC = 4, DL_SHARE_MAX = 20;
function dlCss(){ return '\n' + __DL_CSS__; }
function dlOn(){ return !!S.dlm && S.dlJob === S.jobId && S.screen === 'job'; }
function dlF(){ if (!S.dlf) S.dlf = { from: '', to: '', tag: 'All' }; return S.dlf; }

/* ── names ── */
function dlSafe(t, max){ return s(t).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^[.\-]+/, '').replace(/[.\-]+$/, '').slice(0, max || 60) || 'project'; }
function dlP2(n){ return ('0' + n).slice(-2); }
function dlStamp(iso){ var d = new Date(iso); if (isNaN(d)) return { day: 'undated', hm: '0000' }; return { day: dkey(iso), hm: dlP2(d.getHours()) + dlP2(d.getMinutes()) }; }
/* n = the photo's number among that project's photos of the same day (oldest first), so a name is the same in a single download and in a ZIP */
function dlSeq(jobId){
  var all = jobPhotos(jobId).slice().sort(function(a, b){ return s(a.at) < s(b.at) ? -1 : s(a.at) > s(b.at) ? 1 : (a.id < b.id ? -1 : 1); }), cnt = {}, m = {};
  all.forEach(function(r){ var st = dlStamp(r.at); cnt[st.day] = (cnt[st.day] || 0) + 1; m[r.id] = { day: st.day, hm: st.hm, n: cnt[st.day] }; });
  return m;
}
function dlInfo(seq, r){ return seq[r.id] || Object.assign(dlStamp(r.at), { n: 1 }); }
function dlExt(b){ var t = low(b && b.type); return /png/.test(t) ? 'png' : /webp/.test(t) ? 'webp' : /hei[cf]/.test(t) ? 'heic' : /gif/.test(t) ? 'gif' : 'jpg'; }
function dlName(it, info, ext){ return dlSafe(it.name) + '_' + info.day + '_' + info.hm + '_' + info.n + '.' + ext; }
function dlWait(ms, sig){ return new Promise(function(res){ later(res, ms); }); }

/* ── reading one photo ── */
function dlOk(b){ return !!b && b.size > 0 && /^image\//.test(b.type || ''); }
async function dlFetchCC(u, sig){
  if (DL.direct) {
    try {
      var rs = await window.fetch(u, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: sig });
      if (rs.ok) { var b = await rs.blob(); if (dlOk(b)) return b; }
    } catch (e) { if (sig && sig.aborted) throw e; if (e && e.name === 'TypeError') DL.direct = false; }   /* blocked by CORS or offline: this session uses the proxy */
  }
  var rp = await window.fetch(FN_CC + '?proxy=img&url=' + encodeURIComponent(u), { headers: { 'x-gc-cc': '1' }, signal: sig });
  if (!rp.ok) throw new Error('CompanyCam photo ' + rp.status);
  var bp = await rp.blob(); if (!dlOk(bp)) throw new Error('not an image');
  return bp;
}
async function dlFetchGC(r, annot){
  var ref = annot ? (r.annotatedRef || r.ref) : (r.ref || r.annotatedRef);
  if (ref) { try { var b = await fileBlob(ref); if (dlOk(b)) return b; } catch (e) {} }
  var q = await iall('queue'), it = q.find(function(x){ return x.recId === r.id && (x.kind || 'shot') === 'shot' && x.blob; });
  if (it && dlOk(it.blob)) return it.blob;
  throw new Error('not on this computer yet');
}
async function dlGet(r, sig, annot){
  if (r.source === 'companycam') {
    var urls = [], seen = {}, last; [r.origUrl, r.fullUrl].forEach(function(u){ if (u && !seen[u]) { seen[u] = 1; urls.push(u); } });
    for (var i = 0; i < urls.length; i++) { try { return await dlFetchCC(urls[i], sig); } catch (e) { if (sig && sig.aborted) throw e; last = e; } }   /* the original, then the web size */
    throw last || new Error('no image link');
  }
  return dlFetchGC(r, annot);
}
async function dlTry(r, sig, annot){
  try { return await dlGet(r, sig, annot); }
  catch (e) { if (sig && sig.aborted) throw e; await dlWait(400); if (sig && sig.aborted) throw e; return dlGet(r, sig, annot); }   /* one more try */
}
function dlSave(blob, name){
  var u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  (root || document.body).appendChild(a); a.click(); a.remove();
  later(function(){ try { URL.revokeObjectURL(u); } catch (e) {} }, 60000);   /* released once the browser has taken the file */
}

/* ── the project's own record of who downloaded what (shown in Activity on this computer) ── */
function dlLog(jobId, n, kind){
  try { var l = arr(jGet('gcu_dl_ev', [])); l.push({ id: 'dl_' + Date.now() + '_' + l.length, jobId: String(jobId), n: n, kind: kind, at: nowIso(), by: myName(), byKey: myKey() }); jSet('gcu_dl_ev', l.slice(-80)); emit('dl'); } catch (e) {}
}

/* ── a single photo, from the viewer ── */
function dlOne(r){
  var it = itemById(r.jobId);
  if (!it) { toast('You do not have access to this project.', '#991b1b'); return; }
  if (DL.run) { toast('A download is already running.', '#92400e'); return; }
  var info = dlInfo(dlSeq(r.jobId), r), ctrl = new AbortController(); DL.run = { ctrl: ctrl, cancelled: false };
  toast('Downloading…');
  dlTry(r, ctrl.signal, !!(r.annotatedRef && !S.showOrig)).then(function(b){
    var nm = dlName(it, info, dlExt(b)); dlSave(b, nm); dlLog(it.id, 1, 'photo'); toast('Saved ' + nm);
  }, function(e){ toast('Could not download this photo (' + s(e && e.message) + '). Check your connection and try again.', '#991b1b'); }).then(function(){ DL.run = null; });
}

/* ── select mode on the project page ── */
function dlShown(jobId){ var f = S.filter; return jobPhotos(jobId).filter(function(r){ return f === 'All' || r.tag === f; }); }
function dlSelected(){ var sel = S.dsel || {}; return jobPhotos(S.jobId).filter(function(r){ return sel[r.id]; }); }
function dlPhone(){
  try { return window.matchMedia('(max-width: 700px)').matches && !!navigator.share && !!navigator.canShare && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] }); } catch (e) { return false; }
}
function dlBar(it, list){
  if (!list.length) return '';
  if (dlOn()) return '<div class="dl-bar dl-selbar" role="group" aria-label="Select photos"><span class="dl-hint"><b>Select photos</b> <span class="dl-tip">Tap photos, or a day.</span></span>' +
    '<button class="dl-b" data-a="dlall">Select all</button><button class="dl-b" data-a="dlclr">Clear</button><button class="dl-b pri" data-a="dlexit">Done</button></div>';
  return '<div class="dl-bar" role="group" aria-label="Download photos"><button class="dl-b pri" data-a="dlopen" aria-label="Download all photos of this project">⬇ Download all <em>' + list.length + '</em></button><button class="dl-b" data-a="dlsel">☑ Select</button></div>';
}
function dlDayBtn(k, l){
  if (!dlOn()) return '';
  var sel = S.dsel || {}, all = l.every(function(r){ return sel[r.id]; });
  return '<button class="dl-day" data-a="dlday" data-v="' + esc(k) + '">' + (all ? 'Deselect this day' : 'Select all on this day') + '</button>';
}
function dlTile(r){
  var t = tileHtml(r); if (!dlOn()) return t;
  var on = !!(S.dsel || {})[r.id];
  return t.replace('class="gcu-t pv-t"', 'class="gcu-t pv-t dl-pk' + (on ? ' sel' : '') + '" aria-pressed="' + on + '"').replace(/<\/button>$/, '<span class="dl-ck" aria-hidden="true">✓</span></button>');
}
function dlActionBar(){
  if (!dlOn()) return '';
  var n = dlSelected().length;
  return '<div class="dl-act" role="region" aria-label="Download selected"><span class="dl-n"><b>' + n + '</b> selected</span>' +
    '<button class="dl-b pri" data-a="dlsegdl"' + (n ? '' : ' disabled') + '>⬇ Download selected (' + n + ')</button>' +
    (n && n <= DL_SHARE_MAX && dlPhone() ? '<button class="dl-b dl-sv" data-a="dlsegshare">Save to Photos</button>' : '') +
    '<button class="dl-b dl-x" data-a="dlexit" aria-label="Cancel selection">✕</button></div>';
}
function dlPaint(){
  if (!mainEl || S.screen !== 'job' || !dlOn()) return;
  var sel = S.dsel || {};
  Array.prototype.forEach.call(mainEl.querySelectorAll('.dl-pk[data-id]'), function(t){ var on = !!sel[t.getAttribute('data-id')]; t.classList.toggle('sel', on); t.setAttribute('aria-pressed', on); });
  var days = {}; dlShown(S.jobId).forEach(function(r){ var k = dkey(r.at); (days[k] = days[k] || []).push(r); });
  Array.prototype.forEach.call(mainEl.querySelectorAll('.dl-day'), function(b){ var l = days[b.getAttribute('data-v')] || []; b.textContent = l.length && l.every(function(r){ return sel[r.id]; }) ? 'Deselect this day' : 'Select all on this day'; });
  var bar = mainEl.querySelector('.dl-act'); if (bar) bar.outerHTML = dlActionBar();
  mainEl.__h = vJob();   /* the screen now matches the state: a later refresh does not redraw (and flash) every thumbnail */
}
function dlPick(id){ if (!S.dsel) S.dsel = {}; S.dsel[id] ? delete S.dsel[id] : (S.dsel[id] = 1); dlPaint(); }
function dlDay(k){
  var l = dlShown(S.jobId).filter(function(r){ return dkey(r.at) === k; }), all = l.every(function(r){ return S.dsel && S.dsel[r.id]; });
  if (!S.dsel) S.dsel = {}; l.forEach(function(r){ all ? delete S.dsel[r.id] : (S.dsel[r.id] = 1); }); dlPaint();
}
function dlSelAll(on){ S.dsel = {}; if (on) dlShown(S.jobId).forEach(function(r){ S.dsel[r.id] = 1; }); dlPaint(); }

/* ── "Download all" sheet: optional date range + tag ── */
function dlFiltered(){
  var f = dlF();
  return jobPhotos(S.jobId).filter(function(r){ var d = dkey(r.at); return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (f.tag === 'All' || (f.tag === 'Untagged' ? !r.tag : r.tag === f.tag)); });
}
function dlOpenSheet(){
  var it = itemById(S.jobId); if (!it) return;
  var all = jobPhotos(it.id), f = dlF(); f.from = ''; f.to = ''; f.tag = 'All';
  var days = all.map(function(r){ return dkey(r.at); }).filter(Boolean).sort(), tags = TAGS.filter(function(t){ return all.some(function(r){ return r.tag === t; }); });
  if (all.some(function(r){ return !r.tag; })) tags.push('Untagged');
  var err = window._gcCCPhotoErr && window._gcCCPhotoErr(it.id);
  layer('<div class="gcu-shb dl-dlg" role="dialog" aria-modal="true"><h3>Download photos</h3><span class="gcu-sm">' + esc(it.name) + (it.address ? ' · ' + esc(it.address) : '') + '</span>' +
    '<div class="dl-rng"><label>From<input type="date" id="gcu-dlf" class="gcu-in" min="' + esc(days[0] || '') + '" max="' + esc(days[days.length - 1] || '') + '"></label><label>To<input type="date" id="gcu-dlt" class="gcu-in" min="' + esc(days[0] || '') + '" max="' + esc(days[days.length - 1] || '') + '"></label></div>' +
    (tags.length ? '<div class="gcu-chips" id="gcu-dlchips" role="group" aria-label="Tag">' + ['All'].concat(tags).map(function(t){ return '<button class="gcu-chip' + (t === 'All' ? ' on' : '') + '" data-a="dlftag" data-v="' + esc(t) + '" aria-pressed="' + (t === 'All') + '">' + (t === 'All' ? 'All tags' : esc(t)) + '</button>'; }).join('') + '</div>' : '') +
    '<span id="gcu-dlsum" class="gcu-sm" role="status"></span>' +
    (err ? '<span class="gcu-sm" style="color:#92400e">CompanyCam photos could not be loaded just now, so only the photos shown here are included.</span>' : '') +
    '<button class="gcu-btn" id="gcu-dlgo" data-a="dlgo">Download ZIP</button><button class="gcu-btn out" id="gcu-dlshare" data-a="dlshare" style="display:none">Share / Save to Photos</button><button class="gcu-btn ghost" data-a="closelayer">Cancel</button></div>', 'gcu-layer dl-lay');
  dlSheetPaint();
}
function dlSheetPaint(){
  var n = dlFiltered().length, sm = el('gcu-dlsum'), go_ = el('gcu-dlgo'), sh = el('gcu-dlshare'), f = dlF();
  if (sm) sm.textContent = n + ' photo' + (n === 1 ? '' : 's') + ' will be downloaded' + (f.from || f.to ? ' (' + (f.from || 'start') + ' to ' + (f.to || 'today') + ')' : '') + '.';
  if (go_) { go_.disabled = !n; go_.textContent = n === 1 ? 'Download photo' : 'Download ZIP (' + n + ' photos)'; }
  if (sh) sh.style.display = n && n <= DL_SHARE_MAX && dlPhone() ? '' : 'none';
  Array.prototype.forEach.call(root.querySelectorAll('#gcu-dlchips .gcu-chip'), function(b){ var on = b.getAttribute('data-v') === f.tag; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}
function dlSheetGo(how){
  var jid = S.jobId, p = ccBusy[jid] || Promise.resolve();   /* CompanyCam photos still loading: wait for them */
  Promise.resolve(p).catch(function(){}).then(function(){ dlStart(dlFiltered(), how); });
}

/* ── the run: fetch 4 at a time (one retry each) → ZIP / share ── */
function dlLoadZip(){
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (DL.zipP) return DL.zipP;
  DL.zipP = new Promise(function(res, rej){
    var sc = document.createElement('script'); sc.src = DL_ZIP; sc.integrity = DL_SRI; sc.crossOrigin = 'anonymous'; sc.async = true;
    sc.onload = function(){ window.JSZip ? res(window.JSZip) : (DL.zipP = null, rej(new Error('ZIP tool missing'))); };
    sc.onerror = function(){ DL.zipP = null; try { sc.remove(); } catch (e) {} rej(new Error('Could not load the ZIP tool (are you online?)')); };
    document.head.appendChild(sc);
  });
  return DL.zipP;
}
function dlAlive(){ return !!(root && root.querySelector('#gcu-dl')); }
function dlSet(id, text){ var n = root && root.querySelector('#' + id); if (n) n.textContent = text; }
function dlBtns(html){ var n = root && root.querySelector('#gcu-dlbtns'); if (n) n.innerHTML = html; }
function dlDialog(title){
  layer('<div class="gcu-shb dl-dlg" id="gcu-dl" role="dialog" aria-modal="true"><h3 id="gcu-dlh">' + esc(title) + '</h3>' +
    '<div class="dl-track" id="gcu-dlpb" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="gcu-dlfill"></i></div>' +
    '<span id="gcu-dlmsg" class="gcu-sm" role="status"></span><div id="gcu-dlfail"></div><div id="gcu-dlbtns"><button class="gcu-btn ghost" data-a="dlcancel">Cancel</button></div></div>', 'gcu-layer dl-lay');
}
function dlProgress(done, total){
  var pct = total ? Math.round(done * 100 / total) : 0, f = root && root.querySelector('#gcu-dlfill'), pb = root && root.querySelector('#gcu-dlpb');
  if (f) f.style.width = pct + '%'; if (pb) pb.setAttribute('aria-valuenow', pct);
  dlSet('gcu-dlmsg', 'Downloading ' + done + ' of ' + total + '…');
}
function dlCancel(){
  var run = DL.run; if (run) { run.cancelled = true; try { run.ctrl.abort(); } catch (e) {} }
  if (dlAlive()) { dlSet('gcu-dlh', 'Cancelled'); dlSet('gcu-dlmsg', 'Nothing was saved.'); dlBtns('<button class="gcu-btn" data-a="closelayer">Close</button>'); var f = root.querySelector('#gcu-dlfill'); if (f) f.style.opacity = '.35'; }
}
function dlFailList(failed){
  var n = root && root.querySelector('#gcu-dlfail'); if (!n || !failed.length) return;
  n.innerHTML = '<div class="dl-fail"><b>' + failed.length + ' photo' + (failed.length === 1 ? '' : 's') + ' could not be downloaded</b><ul>' +
    failed.slice(0, 30).map(function(x){ return '<li>' + esc(x.name) + '</li>'; }).join('') + (failed.length > 30 ? '<li>… and ' + (failed.length - 30) + ' more</li>' : '') + '</ul></div>';
}
/* ── photos.csv: one line per photo ── */
function dlCell(v){ var t = s(v).replace(/\r?\n/g, ' '); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[",]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
function dlCsv(rows){
  var head = ['File', 'Date', 'Time', 'Photographer', 'Tags', 'Caption', 'Latitude', 'Longitude', 'Source'];
  return '﻿' + [head].concat(rows.map(function(x){
    var r = x.r, d = new Date(r.at), ok = !isNaN(d);
    return [x.path, ok ? dkey(r.at) : '', ok ? dlP2(d.getHours()) + ':' + dlP2(d.getMinutes()) : '', dispName(r), r.tag || '', r.note || '', r.lat != null && isFinite(r.lat) ? r.lat : '', r.lng != null && isFinite(r.lng) ? r.lng : '', r.source === 'companycam' ? 'CompanyCam' : 'GrayCo Photos'];
  })).map(function(l){ return l.map(dlCell).join(','); }).join('\r\n') + '\r\n';
}
async function dlBuildZips(it, files, run){
  var Z = await dlLoadZip(), parts = [], cur = [], sz = 0, stamp = dkey(nowIso());
  files.forEach(function(f){ if (cur.length && sz + f.blob.size > DL_PART) { parts.push(cur); cur = []; sz = 0; } cur.push(f); sz += f.blob.size; });
  if (cur.length) parts.push(cur);
  var base = dlSafe(it.name) + '_photos_' + stamp, names = [];
  for (var p = 0; p < parts.length; p++) {
    var z = new Z(), rows = [];
    parts[p].forEach(function(f){ z.file(f.path, f.blob, { binary: true, date: Date.parse(f.r.at) ? new Date(f.r.at) : new Date() }); rows.push(f); });
    z.file('photos.csv', dlCsv(rows));
    var nm = base + (parts.length > 1 ? '_part' + (p + 1) + 'of' + parts.length : '') + '.zip';
    if (run.cancelled) return null;
    dlSet('gcu-dlmsg', 'Building ' + nm + '…');
    var blob = await z.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, function(m){ if (!run.cancelled) dlSet('gcu-dlmsg', 'Building ' + nm + '… ' + Math.round(m.percent) + '%'); });
    z = null;
    if (run.cancelled) return null;
    dlSave(blob, nm); names.push(nm);
    if (p < parts.length - 1) await dlWait(600);   /* browsers ask before saving several files at once: give each its turn */
  }
  return names;
}
async function dlStart(list, how){
  var it = itemById(S.jobId);
  if (!it) { toast('You do not have access to this project.', '#991b1b'); return; }
  var ok = {}; jobPhotos(it.id).forEach(function(r){ ok[r.id] = r; });
  list = list.filter(function(r){ return ok[r.id]; }).sort(function(a, b){ return s(a.at) < s(b.at) ? -1 : s(a.at) > s(b.at) ? 1 : 0; });   /* only what this person can see on this project */
  if (!list.length) { toast('No photos to download.', '#92400e'); return; }
  if (DL.run) { toast('A download is already running.', '#92400e'); return; }
  var ctrl = new AbortController(), run = DL.run = { ctrl: ctrl, cancelled: false }, total = list.length, done = 0, failed = [], files = [], seq = dlSeq(it.id), nextI = 0;
  dlDialog(how === 'share' ? 'Getting your photos' : 'Downloading photos'); dlProgress(0, total);
  async function worker(){
    while (!run.cancelled) {
      if (!dlAlive()) { dlCancel(); return; }   /* the window was closed: stop */
      var i = nextI++; if (i >= list.length) return;
      var r = list[i], info = dlInfo(seq, r);
      try { var b = await dlTry(r, ctrl.signal, false); files.push({ r: r, blob: b, info: info, path: info.day + '/' + dlName(it, info, dlExt(b)), name: dlName(it, info, dlExt(b)) }); }
      catch (e) { if (run.cancelled) return; failed.push({ r: r, name: dlName(it, info, 'jpg') + (e && e.message ? ' (' + e.message + ')' : '') }); }
      done++; if (!run.cancelled) dlProgress(done, total);
    }
  }
  try {
    var warm = how === 'zip' && total > 1 ? dlLoadZip().catch(function(e){ return e; }) : null;   /* the ZIP tool loads while the first photos come in */
    await Promise.all(Array.apply(null, Array(Math.min(DL_CONC, total))).map(worker));
    if (run.cancelled) return;
    files.sort(function(a, b){ return a.path < b.path ? -1 : 1; });
    if (!files.length) { dlSet('gcu-dlh', 'Nothing was downloaded'); dlSet('gcu-dlmsg', 'None of the ' + total + ' photos could be read. Check your connection and try again.'); dlFailList(failed); dlBtns('<button class="gcu-btn" data-a="closelayer">Close</button>'); return; }
    if (how === 'share') {
      var fl = files.map(function(f){ return new File([f.blob], f.name, { type: f.blob.type || 'image/jpeg' }); });
      if (navigator.canShare && navigator.canShare({ files: fl })) {
        DL.share = { files: fl, it: it, failed: failed, fall: files }; dlSet('gcu-dlh', 'Ready'); dlSet('gcu-dlmsg', files.length + ' photo' + (files.length === 1 ? '' : 's') + ' ready. Tap below, then choose “Save Image” (or Save to Photos).'); dlFailList(failed);
        dlBtns('<button class="gcu-btn" data-a="dlshgo">Save / Share ' + files.length + ' photo' + (files.length === 1 ? '' : 's') + '</button><button class="gcu-btn ghost" data-a="closelayer">Cancel</button>'); return;
      }
      how = 'zip';   /* this phone cannot share files: a ZIP instead */
    }
    var names;
    if (files.length === 1) { dlSave(files[0].blob, files[0].name); names = [files[0].name]; }
    else { if (warm) { var w = await warm; if (w instanceof Error) throw w; } names = await dlBuildZips(it, files, run); }
    if (!names) return;
    dlLog(it.id, files.length, files.length === 1 ? 'photo' : 'zip');
    dlSet('gcu-dlh', failed.length ? 'Saved with ' + failed.length + ' missing' : 'Saved'); var f = root && root.querySelector('#gcu-dlfill'); if (f) f.style.width = '100%';
    dlSet('gcu-dlmsg', files.length + ' photo' + (files.length === 1 ? '' : 's') + ' saved as ' + names.join(', ') + '.'); dlFailList(failed);
    dlBtns('<button class="gcu-btn" data-a="closelayer">Close</button>');
  } catch (e) {
    if (run.cancelled) return;
    dlSet('gcu-dlh', 'Download stopped'); dlSet('gcu-dlmsg', s(e && e.message) || 'Something went wrong.'); dlBtns('<button class="gcu-btn" data-a="closelayer">Close</button>');
  } finally { if (DL.run === run) DL.run = null; files = null; }
}
function dlShareNow(){
  var sh = DL.share; if (!sh) return;
  var p; try { p = navigator.share({ files: sh.files, title: sh.it.name }); } catch (e) { p = Promise.reject(e); }
  Promise.resolve(p).then(function(){ dlLog(sh.it.id, sh.files.length, 'share'); DL.share = null; closeLayer(); toast('Done.'); }, function(e){
    if (e && e.name === 'AbortError') return;   /* the person closed the share sheet: the button stays */
    toast('This phone could not share them — making a ZIP instead.', '#92400e');
    var fall = sh.fall; DL.share = null; DL.run = { ctrl: new AbortController(), cancelled: false };
    var run = DL.run; dlBuildZips(sh.it, fall, run).then(function(names){ if (names) { dlLog(sh.it.id, fall.length, 'zip'); dlSet('gcu-dlh', 'Saved'); dlSet('gcu-dlmsg', names.join(', ')); dlBtns('<button class="gcu-btn" data-a="closelayer">Close</button>'); } },
      function(x){ dlSet('gcu-dlh', 'Download stopped'); dlSet('gcu-dlmsg', s(x && x.message)); dlBtns('<button class="gcu-btn" data-a="closelayer">Close</button>'); }).then(function(){ DL.run = null; });
  });
}
