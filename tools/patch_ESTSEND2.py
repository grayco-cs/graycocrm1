"""patch ESTSEND2 (owner 11/9: "estimates sent from the CRM … on the project page a send-estimate button and a pull-up for an
e-mail from the PM / estimator / admin's e-mail, and put the PDF from Files / Claude in there and send it from the CRM"):
 · 📤 Send estimate: a "From" pull-down — the job's PM (default, as before), the estimator, me, the admins. The server
   (send-email.js) only accepts an active @grayco-cs.com staff member who is an admin, estimator or PM, or the sender.
 · PDF design: "📁 <file>" — any PDF already in the job's Files & Docs (e.g. the Claude-made proposal) is sent as it is
   (its exact bytes are stored + fingerprinted like every send).
 · the job's estimates list: a "📤 Send estimate" bar on top (picks among this job's estimates); "📤 Send again" on one
   already sent (a new version)."""
import sys
P = 'index.html'; src = open(P).read()
if '/*ESTSEND2*/' in src: print('already patched'); sys.exit(0)
def rep(a, b, n=1):
    global src
    c = src.count(a); assert c == n, (a[:90], c); src = src.replace(a, b)

# ── page: helpers after fromLine ──
rep("""function fromLine(p){
  var pm = pmOf(p);""", """/*ESTSEND2*/ function staffU(){ return arr(crm().users).filter(function(u){ return u && /^[^@\\s]+@grayco-cs\\.com$/i.test(s(u.email)) && u.active !== false && !/^(office|billing|news|portal)@/i.test(s(u.email)); }); }
function fromChoices(p, e){
  var out = [], seen = {}, add = function(email, name, why){ email = low(email); if (!/^[^@\\s]+@grayco-cs\\.com$/.test(email) || seen[email]) return; seen[email] = 1; out.push({ email: email, name: s(name) || email, why: why }); };
  var U = staffU(), byName = function(n){ n = low(n); return n ? U.filter(function(u){ return low(u.name) === n; })[0] : null; };
  var pm = pmOf(p); if (pm) add(pm.email, pm.name, 'PM');
  var en = s((e && (e.estimator || e.by)) || (p && (p.estimator || p.estimatorName))), eu = byName(en); if (eu) add(eu.email, eu.name, 'estimator');
  add(myEmail(), meName(), 'me');
  U.filter(function(u){ return /admin|owner/i.test(s(u.role) + ' ' + s(u.payType)); }).forEach(function(u){ add(u.email, u.name, 'admin'); });
  U.filter(function(u){ return /estimat/i.test(s(u.role)); }).forEach(function(u){ add(u.email, u.name, 'estimator'); });
  return out;
}
function fromPickHtml(p, e){
  var ch = fromChoices(p, e); if (!ch.length) return fromLine(p);
  return '<label for="gcep-from" style="margin-top:6px">From</label><select id="gcep-from" data-from>' + ch.map(function(c, i){ return '<option value="' + esc(c.email) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(c.name) + ' &lt;' + esc(c.email) + '&gt; — ' + esc(c.why) + '</option>'; }).join('') + '</select><div class="sub" style="margin-top:2px">Replies go to the person it is from; you get a copy.</div>';
}
function jobPdfs(p){
  if (!p) return [];
  return docs().filter(function(d){ return d && (s(d.pid) === s(p.id) || s(d.projectId) === s(p.id)) && !d.superseded && !d.deleted && (s(d.ref) || /^data:application\\/pdf/.test(s(d.dataUrl))) && /pdf/i.test(s(d.type) + ' ' + s(d.name) + ' ' + s(d.ref)); })
    .sort(function(a, b){ return s(b.uploadedAt || b.uploaded).localeCompare(s(a.uploadedAt || a.uploaded)); }).slice(0, 20);
}
function fromLine(p){
  var pm = pmOf(p);""")
# design pull-down: the job's PDFs
rep("""    opt('upload', '📤 Upload the one I sent (text / Google Docs)') + '</select><button type="button" class="gcep-sm" data-dprev>👁 Preview</button>' +""",
    """    (function(){ var L = jobPdfs(p); return L.length ? '<optgroup label="📁 A PDF from the job\\'s Files">' + L.map(function(d){ return opt('file:' + s(d.id), '📁 ' + s(d.name).slice(0, 70)); }).join('') + '</optgroup>' : ''; })() +   /* ESTSEND2 */
    opt('upload', '📤 Upload the one I sent (text / Google Docs)') + '</select><button type="button" class="gcep-sm" data-dprev>👁 Preview</button>' +""")
rep("""function makePdf(e, design){
  design = design || (isUploadPdf(e) ? 'uploaded' : 'simple');""", """function makePdf(e, design){
  design = design || (isUploadPdf(e) ? 'uploaded' : 'simple');
  if (/^file:/.test(design)) {   /* ESTSEND2: a PDF already in the job's Files, as it is */
    var fd = docs().filter(function(d){ return d && s(d.id) === design.slice(5); })[0];
    if (!fd) return Promise.resolve(null);
    var got = s(fd.ref) && typeof W._gcFileBlob === 'function' ? Promise.resolve(W._gcFileBlob(fd.ref)) : (s(fd.dataUrl) ? fetch(fd.dataUrl).then(function(r){ return r.blob(); }) : Promise.reject(new Error('no file')));
    return got.then(function(b){ return b ? { blob: b, how: 'job file: ' + s(fd.name) } : null; }, function(){ return null; });
  }""")
rep("""var csNew = o.design === 'uploaded' ? 'pdf' : 'template';""", """var csNew = (o.design === 'uploaded' || /^file:/.test(o.design)) ? 'pdf' : 'template';""")
# the From line → the pull-down; send it
rep("""'<br>' + fromLine(p) +
    (quietNow()""", """(quietNow()""")
rep("""    '<label for="gcep-to">To</label><input id="gcep-to" type="email" inputmode="email" data-to value="' + esc(to) + '">' +""",
    """    fromPickHtml(p, e) +   /* ESTSEND2 */
    '<label for="gcep-to">To</label><input id="gcep-to" type="email" inputmode="email" data-to value="' + esc(to) + '">' +""")
rep("""portal: true, features: readFeatures(ov), design: s(q('[data-design]').value) || 'simple' };""", """portal: true, features: readFeatures(ov), design: s(q('[data-design]').value) || 'simple', fromEmail: q('[data-from]') ? s(q('[data-from]').value) : '' };""")
rep("""fromName: meName(), customer: s(p && p.client),
      pdf: { ref: f.ref, sha256: f.sha256, name: f.name } });""", """fromName: meName(), customer: s(p && p.client), fromEmail: s(o.fromEmail), estimator: s(e.estimator || e.by),
      pdf: { ref: f.ref, sha256: f.sha256, name: f.name } });""")
rep("""    msg('Sending from ' + myEmail() + '…');""", """    msg('Sending from ' + (s(o.fromEmail) || myEmail()) + '…');""")
# pick: this job's estimates only
rep("""function pickEstimate(then){
  var me = low(meName()), list = estAll().filter(function(e){ return e && !e._isDraft""", """function pickEstimate(then, onlyPid){
  var me = low(meName()), list = estAll().filter(function(e){ if (onlyPid && !(s(e && (e.pid || e.projectId || e.jobId)) === s(onlyPid) || s((jobOf(e) || {}).id) === s(onlyPid))) return false; return e && !e._isDraft""")
rep("""  if (!estId) { pickEstimate(function(id){ openSend(id, opts); }); return; }""", """  if (!estId) { pickEstimate(function(id){ openSend(id, opts); }, opts.pid); return; }""")
# the card: Send again + a job bar
rep("""      if (v.length > 1) h += '<button type="button" class="gcep-sm" data-ep="all">All versions (' + v.length + ')</button>';""",
    """      if (v.length > 1) h += '<button type="button" class="gcep-sm" data-ep="all">All versions (' + v.length + ')</button>';
      h += '<button type="button" class="gcep-sm" data-ep="send">📤 Send again</button>';   /* ESTSEND2 */""")
rep("""function paintSlot(el, estId, pid){
  try {""", """function paintSlot(el, estId, pid){
  try {   /* ESTSEND2: one "📤 Send estimate" bar on top of the job's estimates */
    var card = el.parentElement, list = card && card.parentElement;
    if (list && pid && !list.querySelector(':scope > .gcep-jobsend')) {
      var bar = D.createElement('div'); bar.className = 'gcep-jobsend'; bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px';
      bar.innerHTML = '<button type="button" class="gcep-sm" style="font-weight:700">📤 Send estimate</button><span style="font-size:12px;opacity:.75">PDF from the estimate or the job\\'s Files · from the PM, estimator or an admin</span>';
      bar.querySelector('button').onclick = function(ev){ ev.stopPropagation(); openSend(null, { pid: pid }); };
      list.insertBefore(bar, list.firstChild);
    }
  } catch (x) {}
  try {""")
open(P, 'w').write(src); print('ok')
