<script>/*__GC_PATCH_SCOPEFILES__ (owner 11/9 "keep going build the sub portal next")
  📎 Add scope files — in 👷 Subs & portal on a job: pick many Word / PDF / zip files at once ("Hamlets scope 4 hvac.docx",
  "Hamlets prebid questions.pdf"…). The trade is read from the file name (you can change it), the text is read from Word / PDF,
  and each file is saved on the job's documents tagged with that trade. Scope files are hidden from every sub (hideFromSubs) —
  a sub only gets the file of THEIR trade, and only when the PM attaches it in that sub's scope (🧾 scope → "Use the … scope file").
  Lines that carry a $ amount are never copied into a scope (subs only ever see their own price).
  Pre-bid questions / RFI / addendum files go to the job's documents only (cat "Bid questions"). */
(function(){
'use strict';
var W = window, D = document;
var TRADES = [
  ['HVAC', /\bhvac\b|mechanical|heating|\bac\b|air.?cond|duct/i], ['Electrical', /electric|\belec\b|lighting|low.?volt/i], ['Plumbing', /plumb|\bwater heater|sewer/i],
  ['Fire sprinkler', /sprinkler|fire.?protect|fire.?alarm/i], ['Roofing', /roof/i], ['Drywall', /drywall|sheetrock|gyp|\bacoustic|ceiling/i], ['Painting', /paint|coating/i],
  ['Flooring', /floor|carpet|\btile\b|\blvp\b|\bvct\b/i], ['Framing', /fram|carpent|rough.?in carp/i], ['Concrete', /concrete|flatwork|foundation|slab/i], ['Masonry', /mason|brick|block|stucco/i],
  ['Siding', /siding|exterior.?trim|soffit|fascia/i], ['Windows & doors', /window|door|glaz|storefront|hardware/i], ['Insulation', /insulat/i], ['Cabinets & tops', /cabinet|counter|millwork|casework/i],
  ['Demolition', /\bdemo/i], ['Mitigation', /mitigat|dry.?out|water.?extract/i], ['Abatement', /asbestos|abate|\blead\b|\bhazard|mold.?remed/i], ['Gutters', /gutter/i],
  ['Fencing', /fenc/i], ['Landscaping', /landscap|irrigat|sod\b/i], ['Site work', /site.?work|grading|excavat|paving|asphalt/i], ['Steel', /\bsteel|weld|metal stud|railing/i]
];
var QRE = /pre-?bid|question|\brfi\b|addend|clarif/i;
function s(v){ return v == null ? '' : String(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function tradeOf(name){ var n = s(name).replace(/[_\-.]+/g, ' '); if (QRE.test(n)) return ''; for (var i = 0; i < TRADES.length; i++) if (TRADES[i][1].test(n)) return TRADES[i][0]; return ''; }
function sameTrade(a, b){
  a = s(a).toLowerCase(); b = s(b).toLowerCase(); if (!a || !b) return false;
  if (a === b) return true; var ta = tradeOf(a), tb = tradeOf(b); if (ta && ta === tb) return true;
  return a.split(/[^a-z]+/).some(function(w){ return w.length > 3 && b.indexOf(w) > -1; });
}
function me(){ try { var u = (W._gcMe && W._gcMe()) || W._gcUser || {}; return s(u.name || u.email || ''); } catch (e) { return ''; } }
function loadScript(url, test){ if (test()) return Promise.resolve(); return new Promise(function(res, rej){ var x = D.createElement('script'); x.src = url; x.onload = res; x.onerror = rej; D.head.appendChild(x); }); }
async function textOf(file){
  try {
    if (/\.docx$/i.test(file.name) || /wordprocessingml/.test(file.type)) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', function(){ return !!W.mammoth; });
      var r = await W.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); return s(r && r.value);
    }
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', function(){ return !!W.pdfjsLib; });
      if (W.pdfjsLib.GlobalWorkerOptions && !W.pdfjsLib.GlobalWorkerOptions.workerSrc) W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      var pdf = await W.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
      for (var pg = 1; pg <= Math.min(pdf.numPages, 30); pg++) {
        var c = await (await pdf.getPage(pg)).getTextContent(), line = [], lastY = null;
        c.items.forEach(function(it){ var y = it.transform ? Math.round(it.transform[5]) : 0; if (lastY !== null && Math.abs(y - lastY) > 3) { out.push(line.join(' ')); line = []; } line.push(it.str); lastY = y; });
        if (line.length) out.push(line.join(' '));
      }
      return out.join('\n');
    }
  } catch (e) {}
  return '';
}
/* text → scope lines (no prices: a line with a $ amount is dropped) */
function toLines(text){
  var seen = {}, out = [];
  s(text).split(/\r?\n/).forEach(function(raw){
    var t = raw.replace(/^[\s•\-–*·▪●○◦\d.)(]+(?=\S)/, '').replace(/\s+/g, ' ').trim();
    if (t.length < 4 || /\$\s?\d|\d[\d,]*\.\d\d\b.*(total|price|cost)/i.test(t)) return;
    if (/^(page \d+|scope of work|scope|exhibit [a-z0-9]+)$/i.test(t)) return;
    var k = t.toLowerCase(); if (seen[k]) return; seen[k] = 1;
    out.push({ room: '', desc: t.slice(0, 300), meas: '', qty: '', unit: '' });
  });
  return out.slice(0, 120);
}
async function allDocs(){ var a = null; try { a = await W.idbGet('projectDocs'); } catch (e) {} return Array.isArray(a) ? a : (crm().projectDocs || W._gcProjectDocs || []).slice(); }
async function addDocs(recs){
  if (!recs.length) return;
  var all = await allDocs(), ids = {}; all.forEach(function(d){ if (d && d.id) ids[d.id] = 1; });
  recs = recs.filter(function(r){ return !ids[r.id]; }); var next = all.concat(recs);
  try { await W.idbSet('projectDocs', next); } catch (e) {}
  try { if (W._setProjectDocs) W._setProjectDocs(function(prev){ if (!Array.isArray(prev)) return next; var h = {}; prev.forEach(function(d){ if (d && d.id) h[d.id] = 1; }); return prev.concat(recs.filter(function(r){ return !h[r.id]; })); }); } catch (e) {}
  try { if (W._crm) W._crm.projectDocs = next; } catch (e) {}
  try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {}
}
function scopeDocs(pid){ return (crm().projectDocs || W._gcProjectDocs || []).filter(function(d){ return d && s(d.pid) === s(pid) && d.scopeFile === true && d.deleted !== true; }); }
function forTrade(pid, trade){ return scopeDocs(pid).filter(function(d){ return d.trade && sameTrade(d.trade, trade); }); }
async function expandZip(f){
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', function(){ return !!W.JSZip; });
  var z = await W.JSZip.loadAsync(await f.arrayBuffer()), out = [];
  var names = Object.keys(z.files).filter(function(n){ return !z.files[n].dir && !/(^|\/)(__MACOSX|\.)/.test(n) && /\.(pdf|docx?)$/i.test(n); }).slice(0, 40);
  for (var i = 0; i < names.length; i++) { var b = await z.files[names[i]].async('blob'), nm = names[i].split('/').pop(); out.push(new File([b], nm, { type: /\.pdf$/i.test(nm) ? 'application/pdf' : /\.docx$/i.test(nm) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword' })); }
  return out;
}
var CSS = '#gcsf{position:fixed;inset:0;z-index:100010;background:rgba(15,29,47,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px}' +
  '#gcsf .bx{background:#fff;color:#1b2430;border-radius:14px;max-width:640px;width:100%;padding:16px;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif}' +
  '#gcsf h3{margin:0 0 6px;font-size:17px;color:#0F1D2F}#gcsf .m{color:#55626F;font-size:12.5px}#gcsf .r{display:flex;gap:8px;align-items:center;border-top:1px solid #e3e8ee;padding:8px 0;flex-wrap:wrap}' +
  '#gcsf .r .n{flex:1;min-width:180px;word-break:break-word}#gcsf select,#gcsf input[type=text]{border:1px solid #cdd5df;border-radius:8px;padding:7px;font:inherit;min-height:40px}' +
  '#gcsf .b{border:1px solid #cdd5df;background:#fff;border-radius:9px;padding:9px 14px;font-weight:700;min-height:44px;cursor:pointer;font:inherit;font-weight:700}#gcsf .b.g{background:#0F1D2F;color:#fff;border-color:#0F1D2F}' +
  '#gcsf .ft{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}';
function open(pid, back){
  var p = (crm().projects || []).find(function(x){ return x && s(x.id) === s(pid); }) || {};
  if (!D.getElementById('gcsf-css')) { var st = D.createElement('style'); st.id = 'gcsf-css'; st.textContent = CSS; D.head.appendChild(st); }
  var old = D.getElementById('gcsf'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gcsf'; D.body.appendChild(ov);
  var picked = [], busy = false;
  var subs = (Array.isArray(p.subs) ? p.subs : []).map(function(r){ return s(r.trade); }).filter(Boolean);
  var opts = TRADES.map(function(t){ return t[0]; }).concat(subs).filter(function(v, i, a){ return a.indexOf(v) === i; });
  function close(){ ov.remove(); if (typeof back === 'function') try { back(); } catch (e) {} }
  function paint(){
    var have = scopeDocs(pid);
    ov.innerHTML = '<div class="bx"><h3>📎 Scope files — ' + esc(p.name || '') + '</h3>' +
      '<div class="m">Pick many at once: Word, PDF or a zip. The trade comes from the file name — change it if it\'s wrong. Each sub only gets their own trade\'s file, when you attach it in their 🧾 scope. Pre-bid questions go to the job\'s documents only.</div>' +
      '<label class="b" style="display:inline-block;margin:10px 0">⬆ Choose files<input type="file" id="gcsf-in" multiple accept=".pdf,.doc,.docx,.zip,application/pdf,application/zip" hidden></label>' +
      picked.map(function(x, i){ return '<div class="r"><span class="n">' + (x.q ? '❓ ' : '📄 ') + esc(x.f.name) + '</span>' + (x.q ? '<span class="m">Bid questions — job documents only</span>' :
        '<select data-i="' + i + '"><option value="">Trade…</option>' + opts.map(function(o){ return '<option' + (o === x.trade ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>') +
        '<button class="b" data-x="' + i + '" title="Remove">✕</button></div>'; }).join('') +
      (have.length ? '<div class="m" style="margin-top:10px"><b>Already on this job:</b> ' + have.map(function(d){ return esc((d.trade ? d.trade + ': ' : '') + d.name); }).join(' · ') + '</div>' : '') +
      '<div id="gcsf-msg" class="m" style="margin-top:8px"></div>' +
      '<div class="ft"><button class="b" id="gcsf-close">Close</button><button class="b g" id="gcsf-save"' + (picked.length && !busy ? '' : ' disabled') + '>Save ' + picked.length + ' file' + (picked.length === 1 ? '' : 's') + ' to the job</button></div></div>';
  }
  function msg(t){ var m = ov.querySelector('#gcsf-msg'); if (m) m.textContent = t; }
  paint();
  ov.addEventListener('click', async function(e){
    var t = e.target;
    if (t === ov || t.id === 'gcsf-close') { if (!busy) close(); return; }
    if (t.hasAttribute('data-x')) { picked.splice(+t.getAttribute('data-x'), 1); paint(); return; }
    if (t.id === 'gcsf-save' && !busy) {
      if (typeof W._gcStoreFile !== 'function') { msg('File storage is not ready — try again in a moment.'); return; }
      busy = true; t.disabled = true; var recs = [], bad = 0;
      for (var i = 0; i < picked.length; i++) {
        var x = picked[i]; msg('Saving “' + x.f.name + '” (' + (i + 1) + ' of ' + picked.length + ')…');
        try {
          var meta = await W._gcStoreFile(x.f, { kind: 'doc', pid: pid, name: x.f.name }); if (!meta || !meta.ref) throw new Error('no ref');
          var txt = x.q ? '' : await textOf(x.f), now = new Date().toISOString();
          recs.push({ id: 'pdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pid: pid, name: x.f.name, cat: x.q ? 'Bid questions' : 'Sub scope', trade: x.q ? '' : x.trade,
            scopeFile: !x.q, hideFromSubs: true, type: meta.type || x.f.type || '', size: meta.size || x.f.size, ref: meta.ref, hash: meta.hash || '', uploaded: now.slice(0, 10), uploadedAt: now, by: me(),
            scopeText: txt ? txt.slice(0, 15000) : '', savedAt: now, updatedAt: now });
        } catch (er) { bad++; }
      }
      await addDocs(recs); busy = false; picked = []; paint();
      msg(recs.length + ' saved to the job' + (bad ? ' · ' + bad + ' could not be saved' : '') + '. Open a sub\'s 🧾 scope to use their file.');
    }
  });
  ov.addEventListener('change', async function(e){
    var t = e.target;
    if (t.hasAttribute('data-i')) { picked[+t.getAttribute('data-i')].trade = t.value; return; }
    if (t.id !== 'gcsf-in') return;
    var fs = Array.prototype.slice.call(t.files || []), add = [];
    for (var i = 0; i < fs.length; i++) {
      if (/\.zip$/i.test(fs[i].name) || /zip/.test(fs[i].type)) { msg('Opening ' + fs[i].name + '…'); try { add = add.concat(await expandZip(fs[i])); } catch (er) { msg('Could not open ' + fs[i].name); } }
      else if (/\.(pdf|docx?)$/i.test(fs[i].name)) add.push(fs[i]);
    }
    add.forEach(function(f){ if (f.size > 25 * 1048576) return; var q = QRE.test(f.name); picked.push({ f: f, q: q, trade: q ? '' : tradeOf(f.name) }); });
    paint();
  });
}
W._gcScopeFiles = { open: open, tradeOf: tradeOf, forTrade: forTrade, toLines: toLines, docs: scopeDocs, sameTrade: sameTrade };
})();
</script>
