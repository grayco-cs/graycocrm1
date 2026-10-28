/* ══ XACTPHOTOS (__GC_PATCH_XACTPHOTOS__): "📦 Photos for Xactimate" — pick a job's photos → one ZIP Xactimate imports as-is ══
   "make sure when i add photos into google photos that they transfer into xactimate easily"
   Where: the project page's photo bar (next to ⬇ Download all) and the insurance claim's 📸 Photos tab (_gcPhotos.xact(jobId, { claim, ids })).
   The ZIP: "001 - <room/area> - <caption> - <date>.jpg" in room-then-time order (Xactimate uses the file name as the photo title),
   each resized to ≤ 2048 px (JPEG q 0.85, turned upright, date taken / GPS written back as EXIF) + photo-list.csv.
   Photos come through the same doors as ⬇ Download (dlTry: the signed-in file store, CompanyCam CDN or the staff proxy) — only what this
   person can see on this job. Photos tagged private / "do not share" are left out. Marketing and subs never see the button.
   Nothing runs until the button is pressed: no timers, no observers. Built here (no ZIP library), one photo at a time per worker, yielding. */
var XPW = { on: 0 };
var XP = { ov: null, jobId: '', rows: [], skipped: [], sel: {}, f: { tag: 'All', room: 'All', from: '', to: '' }, meta: null, run: null, urls: [], io: null, ai: null, kd: null };
var XP_MAX = 2048, XP_Q = 0.85, XP_CONC = 3;
function xpLabels(ph){ return arr(ph && ph.tags).map(function(t){ return s(t && (t.display_value || t.value || t.name) || t); }).filter(Boolean).slice(0, 12); }
function xpAllowed(){
  if (isAdmin()) return true;
  var u = myUser(); if (!u) return true;   /* the job list itself decides what this person can open */
  return !/marketing|sub-?contractor|^subs?\b|\bsub\s*(crew|partner)/i.test([s(u.role), s(u.profile), s(u.title)].join(' | '));
}
function xpAiFn(){
  var m = null; try { m = window._gcX12 && typeof window._gcX12.tags === 'function' ? window._gcX12.tags() : null; } catch (e) {}
  return function(r){ return m ? (m[s(r.id)] || (r.ccId ? m['cc:' + s(r.ccId)] : null) || null) : null; };
}
function xpMeta(it, claim){
  var c = claim; try { if (!c && window._gcClaims && typeof window._gcClaims.forProject === 'function') c = window._gcClaims.forProject(it.id); } catch (e) {}
  var raw = it.raw || {};
  return { claimNo: s(c && c.claimNumber) || s(raw.claimNumber || raw.claimNo), po: s(it.po), insured: s(c && (c.insured || c.homeowner)) || s(it.client), job: s(it.name) };
}
function xpToast(msg, bad){
  var t = document.createElement('div'); t.className = 'xp-toast'; t.setAttribute('role', 'status'); t.textContent = msg; if (bad) t.style.background = '#991b1b';
  (XP.ov || document.body).appendChild(t); later(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
}
function xpCss(){
  if (document.getElementById('xp-css')) return;
  var st = document.createElement('style'); st.id = 'xp-css';
  st.textContent = '#xp-ov{position:fixed;inset:0;z-index:2147483200;background:rgba(17,20,40,.55);display:flex;align-items:center;justify-content:center;padding:12px;font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#171A2B}' +
    '#xp-ov .xp-box{background:#fff;border-radius:14px;max-width:860px;width:100%;max-height:calc(100vh - 24px);display:flex;flex-direction:column;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden}' +
    '#xp-ov .xp-hd{padding:14px 16px 8px;border-bottom:1px solid #E6E7EF}#xp-ov h3{margin:0;font-size:18px;color:#241968}#xp-ov .xp-sub{font-size:13px;color:#5B5F75;margin-top:2px}' +
    '#xp-ov .xp-flt{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}#xp-ov .xp-flt label{font-size:12px;color:#5B5F75;display:flex;flex-direction:column;gap:2px}' +
    '#xp-ov select,#xp-ov input[type=date]{font:inherit;font-size:14px;padding:5px 6px;border:1px solid #C9CBD8;border-radius:8px;background:#fff;color:#171A2B;min-height:34px}' +
    '#xp-ov .xp-chip{border:1px solid #C9CBD8;background:#fff;border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer;min-height:32px}#xp-ov .xp-chip.on{background:#241968;color:#fff;border-color:#241968}' +
    '#xp-ov .xp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;border-bottom:1px solid #E6E7EF;font-size:14px}#xp-ov .xp-bar .xp-sp{flex:1}' +
    '#xp-ov .xp-list{overflow:auto;flex:1;padding:4px 16px 10px;min-height:120px}#xp-ov h4{margin:12px 0 4px;font-size:14px;display:flex;gap:8px;align-items:center}#xp-ov h4 small{color:#5B5F75;font-weight:400}' +
    '#xp-ov .xp-row{display:flex;gap:10px;align-items:center;padding:5px 4px;border-radius:8px;cursor:pointer}#xp-ov .xp-row:hover{background:#F4F4F9}#xp-ov .xp-row.off{opacity:.55}' +
    '#xp-ov .xp-row input{width:20px;height:20px;flex:none;accent-color:#241968}#xp-ov .xp-th{width:56px;height:42px;border-radius:6px;object-fit:cover;background:#E6E7EF;flex:none}' +
    '#xp-ov .xp-tx{min-width:0;flex:1}#xp-ov .xp-nm,#xp-ov .xp-mt{display:block}#xp-ov .xp-nm{font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#171A2B;word-break:break-all}#xp-ov .xp-mt{font-size:12px;color:#5B5F75}' +
    '#xp-ov .xp-ft{padding:10px 16px 14px;border-top:1px solid #E6E7EF;display:flex;flex-direction:column;gap:8px}#xp-ov .xp-acts{display:flex;flex-wrap:wrap;gap:8px}' +
    '#xp-ov .xp-b{font:inherit;font-size:15px;border-radius:10px;padding:9px 14px;border:1px solid #C9CBD8;background:#fff;color:#171A2B;cursor:pointer;min-height:42px}#xp-ov .xp-b.pri{background:#F2A51A;border-color:#F2A51A;color:#171A2B;font-weight:700}#xp-ov .xp-b:disabled{opacity:.5;cursor:default}' +
    '#xp-ov .xp-b.sm{font-size:13px;padding:5px 10px;min-height:32px}#xp-ov .xp-how{font-size:13px;color:#3B3F55;background:#FFF8E6;border:1px solid #F6D58A;border-radius:10px;padding:8px 10px}' +
    '#xp-ov .xp-track{height:10px;background:#E6E7EF;border-radius:6px;overflow:hidden}#xp-ov .xp-track i{display:block;height:100%;width:0;background:#241968;transition:width .2s}' +
    '#xp-ov .xp-fail{font-size:13px;color:#991b1b}#xp-ov .xp-empty{padding:30px 0;text-align:center;color:#5B5F75}' +
    '.xp-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#171A2B;color:#fff;padding:10px 16px;border-radius:10px;z-index:2147483300;font:14px system-ui,sans-serif;max-width:90vw}' +
    '@media (max-width:600px){#xp-ov{padding:0}#xp-ov .xp-box{border-radius:0;max-height:100vh;height:100%}#xp-ov .xp-b{flex:1 1 auto}}' +
    '.dl-b.xp-open{white-space:nowrap}';
  document.head.appendChild(st);
}
function xpClose(){
  if (XP.run) { XP.run.cancelled = true; try { XP.run.ctrl.abort(); } catch (e) {} }
  if (XP.io) { try { XP.io.disconnect(); } catch (e) {} XP.io = null; }
  XP.urls.forEach(function(u){ try { URL.revokeObjectURL(u); } catch (e) {} }); XP.urls = [];
  if (XP.kd) { document.removeEventListener('keydown', XP.kd, true); XP.kd = null; }
  if (XP.ov) XP.ov.remove(); XP.ov = null; XP.run = null;
}
function xpShell(inner){
  xpCss();
  if (!XP.ov) {
    var ov = document.createElement('div'); ov.id = 'xp-ov';
    ov.addEventListener('click', xpClick); ov.addEventListener('change', xpChange);
    XP.kd = function(ev){ if (ev.key === 'Escape' && XP.ov) { ev.stopPropagation(); if (!XP.run) xpClose(); } };
    document.addEventListener('keydown', XP.kd, true);
    document.body.appendChild(ov); XP.ov = ov;
  }
  XP.ov.innerHTML = '<div class="xp-box" role="dialog" aria-modal="true" aria-labelledby="xp-h">' + inner + '</div>';
}
function xpHead(){
  var m = XP.meta || {};
  return '<div class="xp-hd"><h3 id="xp-h">📦 Photos for Xactimate</h3><div class="xp-sub">' + esc([m.claimNo ? 'Claim # ' + m.claimNo : (m.po ? m.po : ''), m.insured || m.job, m.insured && m.job && m.job !== m.insured ? m.job : ''].filter(Boolean).join(' · ')) + '</div>';
}
/* ── open: load the job's photos (CompanyCam too), then the picker ── */
function xpOpen(jobId, opt){
  opt = opt || {};
  if (!xpAllowed()) { xpToast('Photos for Xactimate is for the office, PMs and the insurance team.', true); return Promise.resolve(false); }
  var it = itemById(jobId);
  if (!it) { xpToast('You do not have access to this project.', true); return Promise.resolve(false); }
  xpClose();
  XP.jobId = String(it.id); XP.meta = xpMeta(it, opt.claim); XP.f = { tag: 'All', room: 'All', from: '', to: '' };
  xpShell(xpHead() + '</div><div class="xp-list"><div class="xp-empty" role="status">Loading the photos of this job…</div></div><div class="xp-ft"><div class="xp-acts"><button class="xp-b" data-x="close">Cancel</button></div></div>');
  XPW.on++;
  var p = (it.ccIds && it.ccIds.length) || it.ccId ? Promise.resolve(ccBusy[it.id] || ccLoad(it.id)).catch(function(){ return []; }) : Promise.resolve([]);
  return p.then(function(){ XPW.on = Math.max(0, XPW.on - 1); if (!XP.ov || XP.jobId !== String(it.id)) return false;
    XP.ai = xpAiFn();
    var pl = XPC.plan(jobPhotos(it.id), { ai: XP.ai });
    XP.rows = pl.rows; XP.skipped = pl.skipped; XP.sel = {};
    var want = arr(opt.ids).map(String), have = {}; XP.rows.forEach(function(x){ have[x.r.id] = 1; });
    var pre = want.filter(function(id){ return have[id]; });
    XP.rows.forEach(function(x){ if (!pre.length || pre.indexOf(String(x.r.id)) >= 0) XP.sel[x.r.id] = 1; });
    xpPaint(true); return true;
  }, function(){ XPW.on = Math.max(0, XPW.on - 1); return false; });
}
function xpShown(){
  var f = XP.f;
  return XP.rows.filter(function(x){ var r = x.r, d = XPC.dayOf(r.at);
    return (f.tag === 'All' || (f.tag === 'Untagged' ? !r.tag : r.tag === f.tag)) && (f.room === 'All' || (f.room === '' ? !x.room : low(x.room) === low(f.room))) && (!f.from || d >= f.from) && (!f.to || d <= f.to); });
}
function xpChosen(){ return XP.rows.filter(function(x){ return XP.sel[x.r.id]; }).map(function(x){ return x.r; }); }
function xpPlanSel(){ return XPC.plan(xpChosen(), { ai: XP.ai }); }
function xpRoomKey(x){ return x.room || ''; }
function xpPaint(full){
  if (!XP.ov) return;
  if (full) {
    var tags = TAGS.filter(function(t){ return XP.rows.some(function(x){ return x.r.tag === t; }); }); if (XP.rows.some(function(x){ return !x.r.tag; })) tags.push('Untagged');
    var rooms = [], seenR = {}; XP.rows.forEach(function(x){ var k = low(x.room); if (x.room && !seenR[k]) { seenR[k] = 1; rooms.push(x.room); } });
    var days = XP.rows.map(function(x){ return XPC.dayOf(x.r.at); }).filter(Boolean).sort();
    var flt = '<div class="xp-flt" role="group" aria-label="Show">' + ['All'].concat(tags).map(function(t){ return '<button class="xp-chip' + (XP.f.tag === t ? ' on' : '') + '" data-x="tag" data-v="' + esc(t) + '" aria-pressed="' + (XP.f.tag === t) + '">' + (t === 'All' ? 'All tags' : esc(t)) + '</button>'; }).join('') +
      (rooms.length ? '<label>Room / area<select data-x="room"><option value="All">All rooms</option>' + rooms.map(function(r){ return '<option value="' + esc(r) + '"' + (XP.f.room === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + (XP.rows.some(function(x){ return !x.room; }) ? '<option value=""' + (XP.f.room === '' ? ' selected' : '') + '>No room tag</option>' : '') + '</select></label>' : '') +
      '<label>From<input type="date" data-x="from" value="' + esc(XP.f.from) + '" min="' + esc(days[0] || '') + '" max="' + esc(days[days.length - 1] || '') + '"></label><label>To<input type="date" data-x="to" value="' + esc(XP.f.to) + '" min="' + esc(days[0] || '') + '" max="' + esc(days[days.length - 1] || '') + '"></label></div>';
    xpShell(xpHead() + flt + '</div>' +
      '<div class="xp-bar"><b id="xp-n" role="status"></b><span class="xp-sp"></span><button class="xp-b sm" data-x="all">Select all shown</button><button class="xp-b sm" data-x="none">Clear shown</button></div>' +
      '<div class="xp-list" id="xp-list"></div>' +
      '<div class="xp-ft" id="xp-ft"><div class="xp-acts"><button class="xp-b pri" id="xp-go" data-x="go">📦 Download ZIP</button><button class="xp-b" data-x="copy">📋 Copy captions</button><button class="xp-b" data-x="close">Cancel</button></div>' +
      '<div class="xp-how"><b>Into Xactimate:</b> ' + esc(XPC.HOWTO) + ' The file names become the photo titles, in this order (room by room).</div></div>');
  }
  var list = XP.ov.querySelector('#xp-list'); if (!list) return;
  var shown = xpShown(), names = {}; xpPlanSel().rows.forEach(function(x){ names[x.r.id] = x.name; });
  if (!XP.rows.length) list.innerHTML = '<div class="xp-empty">No photos on this job yet' + (XP.skipped.length ? ' (' + XP.skipped.length + ' marked private / do not share)' : '') + '.</div>';
  else if (!shown.length) list.innerHTML = '<div class="xp-empty">No photos match these filters.</div>';
  else {
    var groups = [], by = {};
    shown.forEach(function(x){ var k = low(xpRoomKey(x)); if (!by[k]) { by[k] = { room: xpRoomKey(x), rows: [] }; groups.push(by[k]); } by[k].rows.push(x); });
    list.innerHTML = groups.map(function(g){
      var all = g.rows.every(function(x){ return XP.sel[x.r.id]; });
      return '<h4>' + esc(g.room || 'No room tag') + ' <small>(' + g.rows.length + ')</small><button class="xp-b sm" data-x="grp" data-v="' + esc(low(g.room)) + '">' + (all ? 'Clear' : 'Select') + ' this room</button></h4>' +
        g.rows.map(function(x){ var r = x.r, on = !!XP.sel[r.id], th = r.source === 'companycam' ? httpsOnly(r.thumbUrl) : '';
          return '<label class="xp-row' + (on ? '' : ' off') + '" data-id="' + esc(r.id) + '"><input type="checkbox" data-x="pick" value="' + esc(r.id) + '"' + (on ? ' checked' : '') + '>' +
            '<img class="xp-th" alt="" loading="lazy"' + (th ? ' src="' + esc(th) + '"' : (r.thumbRef || r.ref ? ' data-ref="' + esc(r.thumbRef || r.ref) + '"' : '')) + '>' +
            '<span class="xp-tx"><span class="xp-nm">' + esc(names[r.id] || '— not included —') + '</span><span class="xp-mt">' + esc([md(r.at) + (r.at ? ' ' + hm(r.at) : ''), r.tag, x.caption !== r.tag ? x.caption : ''].filter(Boolean).join(' · ')) + '</span></span></label>';
        }).join('');
    }).join('');
    xpThumbs(list);
  }
  xpCount();
}
function xpCount(){
  if (!XP.ov) return;
  var n = xpChosen().length, nb = XP.ov.querySelector('#xp-n'), go_ = XP.ov.querySelector('#xp-go');
  if (nb) nb.textContent = n + ' of ' + XP.rows.length + ' photos selected' + (XP.skipped.length ? ' · ' + XP.skipped.length + ' private left out' : '');
  if (go_) { go_.disabled = !n; go_.textContent = '📦 Download ZIP (' + n + ' photo' + (n === 1 ? '' : 's') + ')'; }
}
/* names follow the selection (the numbers stay 001, 002, … with no gaps) */
function xpNames(){
  if (!XP.ov) return; var names = {}; xpPlanSel().rows.forEach(function(x){ names[x.r.id] = x.name; });
  Array.prototype.forEach.call(XP.ov.querySelectorAll('.xp-row[data-id]'), function(row){ var id = row.getAttribute('data-id'), on = !!XP.sel[id], nm = row.querySelector('.xp-nm'), cb = row.querySelector('input');
    row.classList.toggle('off', !on); if (cb) cb.checked = on; if (nm) nm.textContent = names[id] || '— not included —'; });
  Array.prototype.forEach.call(XP.ov.querySelectorAll('button[data-x="grp"]'), function(b){ var k = b.getAttribute('data-v'), rows = xpShown().filter(function(x){ return low(xpRoomKey(x)) === k; });
    b.textContent = (rows.length && rows.every(function(x){ return XP.sel[x.r.id]; }) ? 'Clear' : 'Select') + ' this room'; });
  xpCount();
}
function xpThumbs(scope){
  if (XP.io) { try { XP.io.disconnect(); } catch (e) {} }
  if (typeof IntersectionObserver !== 'function') return;
  XP.io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (!e.isIntersecting) return; var im = e.target; XP.io.unobserve(im); var ref = im.getAttribute('data-ref'); if (!ref) return; im.removeAttribute('data-ref');
    fileBlob(ref).then(function(b){ if (!b || !XP.ov) return; var u = URL.createObjectURL(b); XP.urls.push(u); im.src = u; }, function(){}); }); }, { root: scope, rootMargin: '300px' });
  Array.prototype.forEach.call(scope.querySelectorAll('img[data-ref]'), function(i){ XP.io.observe(i); });
}
function xpClick(ev){
  var b = ev.target.closest('[data-x]'); if (!b) { if (ev.target === XP.ov && !XP.run) xpClose(); return; }
  var x = b.getAttribute('data-x'), v = b.getAttribute('data-v');
  if (x === 'close') return xpClose();
  if (x === 'cancel') { if (XP.run) { XP.run.cancelled = true; try { XP.run.ctrl.abort(); } catch (e) {} } return xpPaint(true); }
  if (x === 'tag') { XP.f.tag = v; Array.prototype.forEach.call(XP.ov.querySelectorAll('.xp-chip'), function(c){ var on = c.getAttribute('data-v') === v; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); }); return xpPaint(false); }
  if (x === 'all' || x === 'none') { xpShown().forEach(function(y){ if (x === 'all') XP.sel[y.r.id] = 1; else delete XP.sel[y.r.id]; }); return xpNames(); }
  if (x === 'grp') { var rows = xpShown().filter(function(y){ return low(xpRoomKey(y)) === v; }), all = rows.every(function(y){ return XP.sel[y.r.id]; }); rows.forEach(function(y){ if (all) delete XP.sel[y.r.id]; else XP.sel[y.r.id] = 1; }); return xpNames(); }
  if (x === 'copy') return xpCopy();
  if (x === 'go') return xpRun();
}
function xpChange(ev){
  var t = ev.target, x = t && t.getAttribute('data-x'); if (!x) return;
  if (x === 'pick') { if (t.checked) XP.sel[t.value] = 1; else delete XP.sel[t.value]; return xpNames(); }
  if (x === 'room') { XP.f.room = t.value; return xpPaint(false); }
  if (x === 'from' || x === 'to') { XP.f[x] = t.value; return xpPaint(false); }
}
function xpCopy(){
  var rows = xpPlanSel().rows; if (!rows.length) return xpToast('Select photos first.', true);
  var t = XPC.captions(rows);
  function fb(){ var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px'; (XP.ov || document.body).appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); xpToast(ok ? 'Captions copied (' + rows.length + ')' : 'Could not copy — your browser blocked it.', !ok); }
  try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function(){ xpToast('Captions copied (' + rows.length + ')'); }, fb); } catch (e) {}
  fb();
}
/* ── one photo: upright, ≤ 2048 px, JPEG 0.85, EXIF date / GPS back in ── */
function xpShrink(blob){
  return decode(blob).then(function(d){
    if (!d || !d.w || !d.h) throw new Error('could not read the image');
    var k = Math.min(1, XP_MAX / Math.max(d.w, d.h)), w = Math.max(1, Math.round(d.w * k)), h = Math.max(1, Math.round(d.h * k));
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.imageSmoothingQuality = 'high'; cx.drawImage(d.img, 0, 0, w, h); d.done();
    return new Promise(function(res, rej){ cv.toBlob(function(b){ cv.width = cv.height = 0; b ? res(b) : rej(new Error('could not make the JPEG')); }, 'image/jpeg', XP_Q); });
  });
}
function xpProgress(done, total, msg){
  if (!XP.ov) return; var f = XP.ov.querySelector('#xp-fill'), pb = XP.ov.querySelector('#xp-pb'), m = XP.ov.querySelector('#xp-msg'), pct = total ? Math.round(done * 100 / total) : 0;
  if (f) f.style.width = pct + '%'; if (pb) pb.setAttribute('aria-valuenow', pct); if (m) m.textContent = msg || ('Preparing ' + done + ' of ' + total + '…');
}
async function xpRun(){
  if (XP.run) return;
  var it = itemById(XP.jobId); if (!it) return xpToast('You do not have access to this project.', true);
  var ok = {}; jobPhotos(it.id).forEach(function(r){ ok[r.id] = 1; });
  var recs = xpChosen().filter(function(r){ return ok[r.id]; }), pl = XPC.plan(recs, { ai: XP.ai }), rows = pl.rows, total = rows.length;
  if (!total) return xpToast('Select photos first.', true);
  var ctrl = new AbortController(), run = XP.run = { ctrl: ctrl, cancelled: false }, out = new Array(total), failed = [], next = 0, done = 0;
  var ft = XP.ov.querySelector('#xp-ft');
  ft.innerHTML = '<div class="xp-track" id="xp-pb" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="xp-fill"></i></div><span id="xp-msg" role="status"></span><div id="xp-fl" class="xp-fail"></div><div class="xp-acts" id="xp-btns"><button class="xp-b" data-x="cancel">Cancel</button></div>';
  Array.prototype.forEach.call(XP.ov.querySelectorAll('.xp-hd button,.xp-hd select,.xp-hd input,.xp-bar button,.xp-list input,.xp-list button'), function(n){ n.disabled = true; });
  xpProgress(0, total);
  async function worker(){
    while (!run.cancelled) {
      var i = next++; if (i >= total) return;
      var x = rows[i];
      try {
        var b = await dlTry(x.r, ctrl.signal, false); if (run.cancelled) return;
        var j = await xpShrink(b); if (run.cancelled) return;
        var u8 = XPC.withExif(new Uint8Array(await j.arrayBuffer()), { at: x.r.at, lat: x.r.lat, lng: x.r.lng });
        await dlWait(0); if (run.cancelled) return;
        out[i] = { r: x.r, blob: new Blob([u8], { type: 'image/jpeg' }), size: u8.length, crc: XPC.crc32(u8) }; u8 = null;
      } catch (e) { if (run.cancelled) return; failed.push({ x: x, why: s(e && e.message) }); }
      done++; xpProgress(done, total);
      await dlWait(0);
    }
  }
  try {
    await Promise.all(Array.apply(null, Array(Math.min(XP_CONC, total))).map(worker));
    if (run.cancelled) return;
    var got = out.filter(Boolean), byId = {}; got.forEach(function(g){ byId[g.r.id] = g; });
    if (!got.length) throw new Error('None of the ' + total + ' photos could be read. Check your connection and try again.');
    var fin = XPC.plan(got.map(function(g){ return g.r; }), { ai: XP.ai }).rows;   /* numbered again: a photo that failed leaves no gap */
    var entries = fin.map(function(x){ var g = byId[x.r.id]; return { name: x.name, size: g.size, crc: g.crc, at: x.r.at, data: g.blob }; });
    var csvB = new TextEncoder().encode(XPC.csv(fin));
    entries.push({ name: 'photo-list.csv', size: csvB.length, crc: XPC.crc32(csvB), at: nowIso(), data: csvB });
    xpProgress(total, total, 'Building the ZIP…'); await dlWait(0);
    var zipBlob = new Blob(XPC.zip(entries), { type: 'application/zip' }), nm = XPC.zipName(XP.meta);
    if (run.cancelled) return;
    dlSave(zipBlob, nm); dlLog(it.id, fin.length, 'xactimate');
    var h = XP.ov && XP.ov.querySelector('#xp-msg');
    if (h) h.innerHTML = '<b>Saved ' + esc(nm) + '</b> — ' + fin.length + ' photo' + (fin.length === 1 ? '' : 's') + ' (' + (zipBlob.size / 1048576).toFixed(1) + ' MB). Unzip it, then: ' + esc(XPC.HOWTO);
    var fl = XP.ov && XP.ov.querySelector('#xp-fl');
    if (fl && failed.length) fl.innerHTML = '<b>' + failed.length + ' photo' + (failed.length === 1 ? '' : 's') + ' could not be read and ' + (failed.length === 1 ? 'is' : 'are') + ' not in the ZIP:</b> ' + esc(failed.slice(0, 12).map(function(f){ return (f.x.caption || 'photo') + ' (' + md(f.x.r.at) + ')'; }).join(', ')) + (failed.length > 12 ? ' …' : '');
    var bt = XP.ov && XP.ov.querySelector('#xp-btns'); if (bt) bt.innerHTML = '<button class="xp-b pri" data-x="close">Done</button><button class="xp-b" data-x="copy">📋 Copy captions</button>';
    XP.lastZip = { name: nm, n: fin.length, failed: failed.length, bytes: zipBlob.size };
  } catch (e) {
    if (run.cancelled) return;
    xpProgress(0, total, 'Stopped: ' + (s(e && e.message) || 'something went wrong.'));
    var bt2 = XP.ov && XP.ov.querySelector('#xp-btns'); if (bt2) bt2.innerHTML = '<button class="xp-b" data-x="cancel">Back</button><button class="xp-b" data-x="close">Close</button>';
  } finally { if (XP.run === run) XP.run = null; out = null; }
}
function xpBtn(){ return xpAllowed() ? '<button class="dl-b xp-open" data-a="xpopen" title="' + esc(XPC.HOWTO) + '">📦 Photos for Xactimate</button>' : ''; }
