#!/usr/bin/env python3
"""Idempotent patch CCPHOTOS2 — a GrayCo copy of every CompanyCam photo, and customer visibility is a click.

Owner (10/30): "you will delete company cam one day I need all pictures to stay", "make sure we have supabase pro",
"Company cam photos / Grayco are clicked for customer to see or not".

Server (netlify/functions/_lib/cc-photos.js, _lib/cc-vis.js, companycam-webhook ?proxy=photocopy, portal.js, gc-portal.js,
sub-photos.js): when the owner turns it on, every indexed CompanyCam photo is copied into the CRM's own bucket (crm-files,
named by its SHA-256 like every GrayCo Photos upload): CompanyCam's "web" size + its thumbnail. The index rows say where
(ccidx:<project>.g). A CompanyCam photo put in after this release (gc_kv ccvis) is not on the customer portal until someone
clicks "Customer can see" (the portal checks it on the server).

This page:
 1. GrayCo Photos shows the GrayCo copy when there is one (grid: its thumbnail; full screen: its web copy) and falls back to
    CompanyCam's link when the copy cannot be read; cards and the Live Photo Feed too; ⬇ Download falls back to the copy
    when CompanyCam's links are gone. A photo removed in CompanyCam shows "Removed in CompanyCam · GrayCo copy kept".
 2. Who sees a CompanyCam photo = the server's rule (_lib/cc-vis.js): its own "Customer sees it" click, else the job's
    "Show all" / "Hide all" (covers the photos it had then), else: put in before this release → shown (as before), after →
    hidden (🔒 on the tile, "Customer can see? (not shown yet)" in the viewer). The newest click wins.
 3. Quick toggles: per photo (the viewer's button), many photos (☑ Select → "👁 Customer can see (n)" / "🔒 Hide (n)"),
    a whole job ("👁 Show all to customer" / "🔒 Hide all" next to ⬇ Download all). A sub's photo still needs an admin or
    the office to be shown (patch SUBPHOTOS).
 4. 📸 CompanyCam sync status: "Keep a GrayCo copy of every photo: On / Off" — photos copied / total, GB used, the
    estimate for all of them, the safety cap (default 80 GB; red when copying paused there). The switch and the cap:
    owner / admin only. Default OFF until Supabase Pro is confirmed.
No new timers, no polling: the "new photo" moment is read with the index summary GrayCo Photos already reads.
Each find-string must occur exactly once."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CCPHOTOS2 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new, label, count=1):
    global src
    assert src.count(old) == count, (label, 'count', src.count(old))
    src = src.replace(old, new)

# ── 2. the visibility rule (the same as _lib/cc-vis.js) + the "new photo" moment ──
sub("""var CIX = { sum: null, at: 0, busy: null, rows: {}, rowsAt: {}, fresh: {}, same: 0, errs: 0 };""",
"""var CIX = { sum: null, at: 0, busy: null, rows: {}, rowsAt: {}, fresh: {}, same: 0, errs: 0 };
/* patch CCPHOTOS2 */ /* ── who sees a CompanyCam photo (the server's rule, netlify/functions/_lib/cc-vis.js) ──
   newest choice wins: its own flag ccf_<id> (shared, visAt) | the job's ccj_<job> (mode show / hide, covers photos put in up to
   "upto") | put into CompanyCam before this release (gc_kv ccvis.since) → shown as before, after → hidden until a click */
var CCV = { since: 0 };
function ccSec(v){ if (v == null || v === '') return 0; if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v); var n = Number(v); if (isFinite(n) && s(v) !== '') return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n); var d = Date.parse(v); return isNaN(d) ? 0 : Math.floor(d / 1000); }
function ccUp(r){ return +r.up || ccSec(r.at); }
function ccJobRule(r){ var j = PH.map['ccj_' + r.jobId]; if (!j || j.deleted === true || (j.mode !== 'show' && j.mode !== 'hide')) return null; return ccUp(r) <= (+j.upto || 0) ? j : null; }
function ccVisStamp(f){ return s(f && (f.visAt || f.updatedAt || f.at)); }
function ccShared(r){
  var f = ccFlag(r), j = ccJobRule(r), fa = f && f.deleted !== true && f.shared != null ? ccVisStamp(f) : '';
  if (fa && (!j || fa > s(j.at))) return f.shared === true;
  if (j) return j.mode === 'show';
  return !(CCV.since > 0 && ccUp(r) >= CCV.since);
}
function ccDecided(r){ var f = ccFlag(r); return !!((f && f.deleted !== true && f.shared != null) || ccJobRule(r)); }
/* the GrayCo copy of a CompanyCam photo (index row .g: [web file, thumb file | 0, bytes, removedAt?]) */
function cixG(g, id, k){ var c = g && g[s(id)]; var f = Array.isArray(c) ? s(c[k]) : ''; return /^[0-9a-f]{64}\\.(jpe?g|png|webp)$/.test(f) ? 'sb:crm-files/' + f : ''; }
function cixGone(g, id){ var c = g && g[s(id)]; return Array.isArray(c) && +c[3] ? +c[3] : 0; }""", 'rule')
sub("""function sharedOf(r){ var f = ccFlag(r); if (f && f.deleted !== true && f.shared != null) return f.shared === true;""",
    """function sharedOf(r){ if (r && r.source === 'companycam') return ccShared(r);   /* patch CCPHOTOS2: a click decides */
  var f = ccFlag(r); if (f && f.deleted !== true && f.shared != null) return f.shared === true;""", 'sharedOf')
sub("""  CIX.busy = cixGet(['ccidx']).then(function(o){""", """  CIX.busy = cixGet(['ccidx', 'ccvis']).then(function(o){   /* patch CCPHOTOS2: + the "new photo" moment */""", 'sum read')
sub("""    CIX.at = Date.now(); var v = o.ccidx;""", """    CIX.at = Date.now(); var v = o.ccidx;
    var cvs = o.ccvis && Date.parse(s(o.ccvis.since)); if (cvs && Math.floor(cvs / 1000) !== CCV.since) { CCV.since = Math.floor(cvs / 1000); pvVer++; emit('cc'); }""", 'sum since')

# ── 1. the GrayCo copy on each CompanyCam photo (index rows, the feed, live photos get their upload time) ──
sub("""function cixPhoto(jobId, x, people, geo){""", """function cixPhoto(jobId, x, people, geo, g){""", 'cixPhoto sig')
sub("""    lat: geo ? +geo[0] : null, lng: geo ? +geo[1] : null, shared: true, idx: true };""",
    """    lat: geo ? +geo[0] : null, lng: geo ? +geo[1] : null, idx: true,
    up: Math.max(c, +x[7] || 0), gRef: cixG(g, x[0], 0), gThumb: cixG(g, x[0], 1) || cixG(g, x[0], 0), removed: cixGone(g, x[0]) };   /* patch CCPHOTOS2 */""", 'cixPhoto copy')
sub("""      arr(r.ph).forEach(function(x){ var ph = cixPhoto(jobId, x, ppl, first ? r.geo : null); if (ph) { list.push(ph); first = false; } });""",
    """      arr(r.ph).forEach(function(x){ var ph = cixPhoto(jobId, x, ppl, first ? r.geo : null, r.g); if (ph) { list.push(ph); first = false; } });""", 'ccLoad g')
sub("""  f.forEach(function(x){ var jid = byCc[s(x[0])]; if (!jid) return; var r = cixPhoto(jid, [x[1], x[2], x[3], x[4], -1, x[6]], [], null); if (!r) return; r.by = s(x[5]) || 'CompanyCam'; list.push(r); map[r.id] = r; });""",
    """  f.forEach(function(x){ var jid = byCc[s(x[0])]; if (!jid) return; var gg = null; if (x[7]) { gg = {}; gg[s(x[1])] = [x[7], x[8] || 0, 0, +x[10] || 0]; }   /* patch CCPHOTOS2: the copy, when it went in */
    var r = cixPhoto(jid, [x[1], x[2], x[3], x[4], -1, x[6], '', +x[9] || 0], [], null, gg); if (!r) return; r.by = s(x[5]) || 'CompanyCam'; list.push(r); map[r.id] = r; });""", 'feed g')
sub("""    lat: co.lat != null ? +co.lat : null, lng: co.lon != null ? +co.lon : (co.lng != null ? +co.lng : null), shared: true };""",
    """    lat: co.lat != null ? +co.lat : null, lng: co.lon != null ? +co.lon : (co.lng != null ? +co.lng : null), up: Math.max(ccSec(ph.captured_at), ccSec(ph.created_at)) };   /* patch CCPHOTOS2 */""", 'ccMap up')
# the picture: the GrayCo copy first, CompanyCam's link when the copy cannot be read
sub("""  if (r.source === 'companycam') return '<img alt="" loading="lazy" decoding="async" data-src="' + esc(full ? r.fullUrl : r.thumbUrl) + '">';""",
    """  if (r.source === 'companycam' && r.gRef) return '<img alt="" decoding="async" data-ref="' + esc(full ? r.gRef : (r.gThumb || r.gRef)) + '" data-fb="' + esc(full ? r.fullUrl : r.thumbUrl) + '">';   /* patch CCPHOTOS2: GrayCo's copy */
  if (r.source === 'companycam') return '<img alt="" loading="lazy" decoding="async" data-src="' + esc(full ? r.fullUrl : r.thumbUrl) + '">';""", 'imgTag')
sub("""      p.then(function(u){ if (u) im.src = u; else im.style.visibility = 'hidden'; }, function(){ im.style.visibility = 'hidden'; im.parentNode && im.parentNode.setAttribute('title', 'Available when online'); })""",
    """      var fb = im.getAttribute('data-fb');   /* patch CCPHOTOS2: a GrayCo copy that cannot be read → CompanyCam's link */
      p.then(function(u){ if (u) im.src = u; else if (fb) im.src = fb; else im.style.visibility = 'hidden'; }, function(){ if (fb) { im.src = fb; return; } im.style.visibility = 'hidden'; im.parentNode && im.parentNode.setAttribute('title', 'Available when online'); })""", 'pumpImg')
sub("""  ids.forEach(function(id){ var x = sp && sp[id]; if (Array.isArray(x)) { any = true; n += +x[0] || 0; if (!th && httpsOnly(x[2])) th = httpsOnly(x[2]); return; }""",
    """  var gth = '';   /* patch CCPHOTOS2: the cover's GrayCo copy */
  ids.forEach(function(id){ var x = sp && sp[id]; if (Array.isArray(x)) { any = true; n += +x[0] || 0; if (!th && httpsOnly(x[2])) th = httpsOnly(x[2]); if (!gth && x[4]) gth = cixG({ c: [x[4]] }, 'c', 0); return; }""", 'cover copy')
sub("""  return { n: any ? n : 0, cover: th ? { id: 'ccc_' + it.id, source: 'companycam', thumbUrl: th, fullUrl: th, at: '', by: '' } : null };""",
    """  return { n: any ? n : 0, cover: th || gth ? { id: 'ccc_' + it.id, source: 'companycam', thumbUrl: th, fullUrl: th, gRef: gth, gThumb: gth, at: '', by: '' } : null };""", 'cover obj')
sub("""    throw last || new Error('no image link');""",
    """    if (r.gRef) { try { var gb = await fileBlob(r.gRef); if (dlOk(gb)) return gb; } catch (e) {} }   /* patch CCPHOTOS2: CompanyCam gone → GrayCo's copy */
    throw last || new Error('no image link');""", 'download copy')

# ── 2./3. the viewer: the copy chip, "Customer can see?", the click stamps its time ──
sub("""  h += '<div class="gcu-pchips">' + (cc ? '<span class="gcu-pc" style="background:' + CCBLUE + ';display:flex;align-items:center">CompanyCam</span>' : '') +""",
    """  h += '<div class="gcu-pchips">' + (cc ? '<span class="gcu-pc" style="background:' + CCBLUE + ';display:flex;align-items:center">CompanyCam</span>' : '') +
    (cc && r.removed ? '<span class="gcu-pc gcu-ccgone" style="background:#7C2D12;color:#fff;display:flex;align-items:center">Removed in CompanyCam · GrayCo copy kept</span>' : cc && r.gRef ? '<span class="gcu-pc gcu-gcopy" style="background:#1D5E2C;color:#fff;display:flex;align-items:center">GrayCo copy</span>' : '') +   /* patch CCPHOTOS2 */""", 'chips')
sub("""    '<button class="gcu-pc ' + (sharedOf(r) ? 'yes' : 'no') + '" data-a="share" aria-pressed="' + sharedOf(r) + '">' + (sharedOf(r) ? 'Customer sees it' : (subsOf(r) ? 'Hidden from customer' : 'Internal only')) + '</button>' +""",
    """    '<button class="gcu-pc ' + (sharedOf(r) ? 'yes' : 'no') + '" data-a="share" aria-pressed="' + sharedOf(r) + '">' + (sharedOf(r) ? 'Customer sees it' : (cc && !ccDecided(r) ? '👁 Customer can see? (not shown yet)' : (subsOf(r) ? 'Hidden from customer' : 'Internal only'))) + '</button>' +   /* patch CCPHOTOS2 */""", 'share label')
sub("""    var w1 = r.source === 'companycam' ? setCCFlag(r, { shared: on1 }) : update(r.id, function(n){ n.shared = on1; n.shareSet = true;""",
    """    var w1 = r.source === 'companycam' ? setCCFlag(r, { shared: on1, visAt: nowIso() }) : update(r.id, function(n){ n.shared = on1; n.shareSet = true;""", 'share stamp')

# ── 3. many photos / a whole job ──
sub("""/* J rule: the same picture twice on a job is ONE photo""", """/* patch CCPHOTOS2: "Customer can see" for many photos at once (☑ Select) and for a whole job (one record ccj_<job>) */
function visOne(r, on, at){
  if (!r) return 0;
  if (r.source === 'companycam') {
    if (!r.ccId) return 0; var id = 'ccf_' + r.ccId, o = PH.map[id];
    var f = Object.assign({ id: id, jobId: String(r.jobId), ccId: String(r.ccId), source: 'ccflag', at: at, by: myName(), byKey: myKey() }, o || {}, { shared: on, visAt: at });
    delete f._local; PH.save(f, true); return 1;
  }
  if (r.source === 'sub' && on && !isOffice()) return -1;   /* patch SUBPHOTOS: an admin / the office shows a sub's photo */
  var x = PH.map[r.id]; if (!x || x.source === 'ccflag') return 0;
  var m = Object.assign({}, x); m.shared = on; m.shareSet = true;
  if (m.source === 'sub') { if (on) { m.custOkBy = myName(); m.custOkAt = at; } else { delete m.custOkBy; delete m.custOkAt; } }
  delete m._local; PH.save(m, true); return 1;
}
function visNote(on, n, skip){
  toast((on ? 'The customer sees ' : 'Hidden from the customer: ') + n + ' photo' + (n === 1 ? '' : 's') + (skip ? ' · ' + skip + ' sub photo' + (skip === 1 ? '' : 's') + ' left as before (an admin or the office shows those)' : '') + '.');
}
function visSet(list, on){
  var at = nowIso(), n = 0, skip = 0;
  arr(list).forEach(function(r){ var k = visOne(r, on, at); if (k > 0) n++; else if (k < 0) skip++; });
  emit(KEY_PH); visNote(on, n, skip);
  return n;
}
function visJob(jobId, mode){
  if (!itemById(jobId)) return 0;
  var list = jobPhotos(jobId), on = mode === 'show';
  if (!window.confirm(on ? 'Show all ' + list.length + ' photos of this job to the customer?\\n\\nPhotos added later still wait for their own "Customer can see".' : 'Hide all ' + list.length + ' photos of this job from the customer?')) return 0;
  var at = nowIso(), id = 'ccj_' + jobId, o = PH.map[id];
  var rec = Object.assign({ id: id, jobId: String(jobId), source: 'ccflag', kind: 'job' }, o || {}, { mode: mode, at: at, visAt: at, upto: Math.floor(Date.now() / 1000), by: myName(), byKey: myKey(), deleted: false });
  delete rec._local; PH.save(rec, true);   /* every CompanyCam photo of the job up to now — one small record, not one a photo */
  var n = 0, skip = 0;
  list.forEach(function(r){ if (r.source === 'companycam') { n++; return; } var k = visOne(r, on, at); if (k > 0) n++; else if (k < 0) skip++; });
  emit(KEY_PH); visNote(on, n, skip);
  return n;
}
/* J rule: the same picture twice on a job is ONE photo""", 'vis functions')
sub("""<button class="dl-b" data-a="dlsel">☑ Select</button></div>';""",
    """<button class="dl-b" data-a="dlsel">☑ Select</button>' +
    '<button class="dl-b" data-a="visjob" data-v="show" title="Show all of this job\\'s photos to the customer">👁 Show all to customer</button><button class="dl-b" data-a="visjob" data-v="hide" title="Hide all of this job\\'s photos from the customer">🔒 Hide all</button></div>';   /* patch CCPHOTOS2 */""", 'job buttons')
sub("""    '<button class="dl-b dl-x" data-a="dlexit" aria-label="Cancel selection">✕</button></div>';""",
    """    (n ? '<button class="dl-b" data-a="vissel" data-v="1">👁 Customer can see (' + n + ')</button><button class="dl-b" data-a="vissel" data-v="0">🔒 Hide from customer (' + n + ')</button>' : '') +   /* patch CCPHOTOS2 */
    '<button class="dl-b dl-x" data-a="dlexit" aria-label="Cancel selection">✕</button></div>';""", 'select buttons')
sub("""    case 'dlsel': S.dlm = true; S.dlJob = S.jobId; S.dsel = {}; return render();""",
    """    case 'dlsel': S.dlm = true; S.dlJob = S.jobId; S.dsel = {}; return render();
    case 'vissel': visSet(dlSelected(), v === '1'); return render();   /* patch CCPHOTOS2 */
    case 'visjob': visJob(S.jobId, v === 'hide' ? 'hide' : 'show'); return render();""", 'vis cases')
sub("""Damage photos start internal. Notes, names and chat never leave GrayCo.""",
    """Damage photos start internal. CompanyCam photos added after 10/30 start hidden until someone taps <b>Customer sees it</b> (or <b>👁 Show all to customer</b> on the job). Notes, names and chat never leave GrayCo.""", 'settings text')
sub("""  ccIndex: function(){ return { summary: !!CIX.sum,""", """  ccIndex: function(){ return { since: CCV.since, summary: !!CIX.sum,""", 'console')

# ── 4. 📸 CompanyCam sync status: the switch + the storage meter ──
sub("""  rows.push(['CompanyCam photos in GrayCo Photos', pixLine(d.photoIndex)]);   /* patch CCPHOTOS1 */""",
    """  rows.push(['CompanyCam photos in GrayCo Photos', pixLine(d.photoIndex)]);   /* patch CCPHOTOS1 */
  rows.push(['GrayCo copies of the photos', copyLine(d)]);   /* patch CCPHOTOS2 */""", 'copy row')
sub("""    + (S.msg ? '<div style="color:#166534;font-weight:600;margin:4px 0">' + esc(S.msg) + '</div>' : '')""",
    """    + copyBox(d)   /* patch CCPHOTOS2 */
    + (S.msg ? '<div style="color:#166534;font-weight:600;margin:4px 0">' + esc(S.msg) + '</div>' : '')""", 'copy box')
sub("""— no picture is copied)">⟳ Index all photos now""", """— the pictures are copied only when &quot;Keep a GrayCo copy&quot; is on)">⟳ Index all photos now""", 'pidx title')
sub("""  if (t.closest('[data-ccs-pidx]')) {""",
    """  var cpb = t.closest('[data-ccs-copy]');   /* patch CCPHOTOS2: the switch (owner / admin; the server checks too) */
  if (cpb) {
    var cOn = cpb.getAttribute('data-ccs-copy') === 'on', cc0 = copyOf(S.data) || {};
    if (cOn && !W.confirm('Keep a GrayCo copy of every CompanyCam photo?\\n\\nTurn this on only once Supabase Pro is confirmed. All ' + (+cc0.total || 0).toLocaleString() + ' photos ≈ ' + gbTxt(cc0.estimateBytes) + '. Copying pauses at ' + (cc0.capGB || 80) + ' GB.')) return;
    S.msg = 'Saving…'; paint();
    post('photocopy', { on: cOn }).then(function(r){ S.msg = r.ok ? (r.message || 'Saved.') : ('Could not save: ' + s(r.error)); return load(true); }).then(paint); return;
  }
  if (t.closest('[data-ccs-capsave]')) {
    var box = t.closest('[data-ccs-copybox]'), inp = box && box.querySelector('[data-ccs-cap]'), cap = inp ? Number(inp.value) : NaN;
    if (!(cap >= 1)) { S.msg = 'The cap is a number of GB (1 or more).'; paint(); return; }
    S.msg = 'Saving…'; paint();
    post('photocopy', { capGB: cap }).then(function(r){ S.msg = r.ok ? 'Safety cap: ' + r.capGB + ' GB.' : ('Could not save: ' + s(r.error)); return load(true); }).then(paint); return;
  }
  if (t.closest('[data-ccs-pidx]')) {""", 'copy clicks')
sub("""function plainLine(){
  var d = S.data, h = d && d.health;""", """/* patch CCPHOTOS2: "Keep a GrayCo copy of every photo" — the storage meter */
function copyOf(d){ return (d && d.photoIndex && d.photoIndex.copy) || (d && d.photoCopy) || null; }
function gbTxt(b){ b = +b || 0; return b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB'; }
function copyLine(d){
  var c = copyOf(d); if (!c) return 'Off — not set up yet (needs the photo index first).';
  var total = +c.total || 0, copied = +c.copied || 0, pct = total ? Math.floor(copied * 100 / total) : 0;
  var est = 'all ' + total.toLocaleString() + ' photos ≈ ' + gbTxt(c.estimateBytes) + ' (' + ((+c.avgBytes || 0) / 1e6).toFixed(2) + ' MB a photo, ' + (c.measured ? 'measured' : 'estimated') + ')';
  if (!c.on) return 'Off · ' + copied.toLocaleString() + ' of ' + total.toLocaleString() + ' copied · ' + gbTxt(c.bytes) + ' used · ' + est + '. Turn it on once Supabase Pro is confirmed.';
  var t = 'On · ' + copied.toLocaleString() + ' of ' + total.toLocaleString() + ' photos copied (' + pct + '%) · ' + gbTxt(c.bytes) + ' used' + (c.bucketBytes != null ? ' (all GrayCo files: ' + gbTxt(c.bucketBytes) + ')' : '') + ' · ' + est + ' · pauses at ' + c.capGB + ' GB';
  if (c.removed) t += ' · ' + c.removed + ' removed in CompanyCam, kept';
  if (c.stop === 'cap') return '⛔ Copying PAUSED at the safety cap since ' + when(c.stopAt) + '. ' + t + '. Check the Supabase plan, then raise the cap — or leave it paused.';
  if (c.wait) t += ' · CompanyCam asked to wait until ' + when(c.wait);
  else if (c.stop && c.stop !== 'off') t += ' · stopped: ' + c.stop + (c.lastError ? ' (' + c.lastError + ')' : '');
  if (c.last && c.last.at) t += ' · last run ' + when(c.last.at) + ': ' + (+c.last.photos || 0) + ' copied';
  return t;
}
function copyBox(d){
  var c = copyOf(d) || { on: false, capGB: 80 }, red = c.stop === 'cap', total = +c.total || 0, pct = total ? Math.min(100, Math.floor((+c.copied || 0) * 100 / total)) : 0;
  var h = '<div data-ccs-copybox style="margin:10px 0;padding:10px 12px;border-radius:10px;border:1px solid ' + (red ? '#fca5a5;background:#fef2f2' : '#e2e8f0;background:#f8fafc') + '">'
    + '<div style="font-weight:800">Keep a GrayCo copy of every photo: ' + (c.on ? '<span style="color:#166534">On</span>' : '<span style="color:#991b1b">Off</span>') + '</div>'
    + '<div style="font-size:12px;color:#475569;margin:3px 0 6px">So every picture stays when CompanyCam is cancelled. Needs Supabase Pro (100 GB of file storage) — docs/COMPANYCAM.md.</div>'
    + '<div style="height:8px;border-radius:4px;background:#e2e8f0;overflow:hidden" role="progressbar" aria-label="Photos copied" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><div style="height:100%;width:' + pct + '%;background:' + (red ? '#dc2626' : '#16a34a') + '"></div></div>'
    + '<div data-ccs-meter style="font-size:13px;margin-top:6px;' + (red ? 'color:#991b1b;font-weight:700' : '') + '">' + esc(copyLine(d)) + '</div>';
  if (isAdmin()) h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">'
    + '<button type="button" data-ccs-copy="' + (c.on ? 'off' : 'on') + '" style="padding:7px 12px;border-radius:8px;border:0;background:' + (c.on ? '#64748b' : '#16a34a') + ';color:#fff;font-weight:700;cursor:pointer">' + (c.on ? 'Turn off' : 'Turn on') + '</button>'
    + '<label style="font-size:13px">Safety cap <input data-ccs-cap type="number" min="1" step="1" value="' + esc(String(c.capGB || 80)) + '" style="width:80px;padding:5px;border:1px solid #cbd5e1;border-radius:6px"> GB</label>'
    + '<button type="button" data-ccs-capsave style="padding:7px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-weight:600;cursor:pointer">Save cap</button></div>';
  else h += '<div style="font-size:12px;color:#64748b;margin-top:6px">Only the owner or an admin can turn this on or off.</div>';
  return h + '</div>';
}
function plainLine(){
  var d = S.data, h = d && d.health;""", 'copy meter')

open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
