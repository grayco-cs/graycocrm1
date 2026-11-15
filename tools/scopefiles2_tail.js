/* __GC_PATCH_SCOPEFILES2__ — 📎 BULK SCOPE FILES → ONE SCOPE DRAFT PER TRADE (owner's sub portal plan, 11/15 list item 5.1d)
   On top of SCOPEFILES (📎 Add scope files in 👷 Subs & portal: many Word / PDF / zip files, the trade from the file name, the text
   read, pre-bid questions / RFIs → the job's documents only):
   • drag and drop files onto the sheet (as well as ⬆ Choose files); a zip is opened in the browser;
   • the review list shows, per file, the trade (change it), 👁 Preview (the first lines read from the file) and 👷 the subs to get it
     (the job's subs and the Subs list in that trade; ticked ones are pre-ticked when you 📤 Send — nothing is sent by itself);
   • "Save" keeps the files on the job as before AND makes ONE 📋 scope DRAFT per trade in the same records SCOPESEND / the scope
     editor use (_gcScopeSend.make, src scopefile: the 💲 budget twin comes with it, words only — a line with a $ is never copied);
     several files of one trade go into that trade's one draft;
   • the same file name + trade again REPLACES: the job document is replaced (the old one is marked replaced, not doubled) and the
     trade's draft gets a new version (SCOPESEND's srcKey) — never a duplicate.
   API: window._gcScopeFiles2 = { save(pid, items), preview(file), subsFor(pid, trade) } */
(function(W){
'use strict';
if (W.__GC_PATCH_SCOPEFILES2__) return; W.__GC_PATCH_SCOPEFILES2__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function SF(){ return W._gcScopeFiles; }
function proj(pid){ return arr(crm().projects).find(function(p){ return s(p.id) === s(pid); }) || null; }
function subsFor(pid, trade){
  var p = proj(pid) || {}, out = [], seen = {}, F = SF(), same = function(a, b){ return F && F.sameTrade ? F.sameTrade(a, b) : low(a) === low(b); };
  var all = arr(crm().subs).concat(arr(crm().vendors)).filter(function(r){ return r.id && (r.isSub === true || (r.isSub === undefined && (r.trade || r.cat === 'Sub'))); });
  arr(p.subs).forEach(function(r){ var m = all.find(function(x){ return (s(r.subId) && s(x.id) === s(r.subId)) || low(x.name) === low(r.name); }); if (m && !seen[m.id] && (!trade || !s(r.trade || m.trade) || same(r.trade || m.trade, trade))) { seen[m.id] = 1; out.push({ id: s(m.id), name: s(m.company || m.name), trade: s(r.trade || m.trade), on: true }); } });
  if (trade) all.forEach(function(m){ if (!seen[m.id] && s(m.trade) && same(m.trade, trade)) { seen[m.id] = 1; out.push({ id: s(m.id), name: s(m.company || m.name), trade: s(m.trade), on: false }); } });
  return out.slice(0, 30);
}
/* the job document: the same name + trade replaces the one before (marked replaced; the newest is the one used) */
function replaceOld(pid, recs){
  return Promise.resolve(W.idbGet ? W.idbGet('projectDocs') : null).then(function(all){
    all = Array.isArray(all) ? all : arr(crm().projectDocs);
    var at = new Date().toISOString(), ch = 0, newIds = {}; recs.forEach(function(r){ newIds[r.id] = 1; });
    var out = all.map(function(d){ if (!d || newIds[d.id] || s(d.pid) !== s(pid) || d.scopeFile !== true || d.replacedBy || d.deleted) return d;
      var n = recs.find(function(r){ return low(r.name) === low(d.name) && low(r.trade) === low(d.trade); }); if (!n) return d; ch++; return Object.assign({}, d, { deleted: true, replacedBy: n.id, replacedAt: at, updatedAt: at }); });
    if (!ch) return 0;
    try { if (W.idbSet) W.idbSet('projectDocs', out); } catch (e) {}
    try { if (W._setProjectDocs) W._setProjectDocs(out.slice()); } catch (e) {}
    try { if (W._crm) W._crm.projectDocs = out; } catch (e) {}
    try { if (W._supaUpsert) W._supaUpsert('projectDocs', out); } catch (e) {}
    return ch;
  });
}
/* items: [{ name, trade, text, q (questions), subs: [subId] }] → one draft per trade */
function save(pid, items){
  var S = W._gcScopeSend, F = SF(); if (!S || !S.make || !F) return Promise.resolve([]);
  var by = {}; arr(items).forEach(function(x){ if (x.q || !s(x.trade)) return; var k = low(x.trade); var g = by[k] || (by[k] = { trade: s(x.trade), names: [], lines: [], subs: [] }); g.names.push(s(x.name)); F.toLines(x.text).forEach(function(l){ if (!g.lines.some(function(y){ return low(y.desc) === low(l.desc); })) g.lines.push(l); }); arr(x.subs).concat(Array.isArray(x.subs) ? x.subs : []).forEach(function(id){ if (typeof id === 'string' && g.subs.indexOf(id) < 0) g.subs.push(id); }); });
  var p = proj(pid) || {}, out = [];
  return Object.keys(by).reduce(function(chain, k){ return chain.then(function(){
    var g = by[k];
    var lines = g.lines.slice(0, 150).map(function(l){ return { sec: s(l.room), desc: s(l.desc), qty: '', unit: '', note: '' }; });
    return Promise.resolve(S.make({ pid: pid, title: 'Scope of work — ' + g.trade + (p.name ? ' — ' + s(p.name) : ''), trade: g.trade, lines: lines, src: { kind: 'scopefile', trade: g.trade }, notes: 'From the scope file' + (g.names.length === 1 ? ' ' : 's ') + g.names.join(', ') + '.', blank: true }))
      .then(function(r){
        if (r && r.sub && g.subs.length && S.list) { /* the picked subs ride on the draft (pre-ticked in 📤 Send) */
          return Promise.resolve(W.idbGet ? W.idbGet('scopes') : null).then(function(L){ L = Array.isArray(L) ? L : []; var hit = false; L = L.map(function(d){ if (d && d.id === r.sub.id) { hit = true; return Object.assign({}, d, { forSubs: g.subs.slice(0, 20) }); } return d; }); if (hit && W.idbSet) return W.idbSet('scopes', L).then(function(){ try { if (W._gcApplySync) W._gcApplySync('scopes', L); } catch (e) {} try { if (W._supaUpsert) W._supaUpsert('scopes', L); } catch (e) {} r.sub.forSubs = g.subs.slice(0, 20); return r; }); return r; });
        }
        return r;
      }).then(function(r){ out.push({ trade: g.trade, id: r && r.sub ? r.sub.id : '', created: !!(r && r.created), version: r && r.sub ? r.sub.version : 0, lines: lines.length, subs: g.subs.slice() }); });
  }); }, Promise.resolve()).then(function(){ return out; });
}
function preview(text){ var L = SF() ? SF().toLines(text) : []; return L.slice(0, 8).map(function(l){ return '• ' + l.desc; }).join('\n') + (L.length > 8 ? '\n… ' + (L.length - 8) + ' more lines' : '') || '(no text could be read — the file is still saved)'; }

/* the sheet: drag & drop, 👁 Preview, 👷 subs, and the drafts after Save */
var TEXT = {};   /* file name → text read (for preview + the drafts) */
var SUBS = {};   /* row index → [subId] */
function loadJSZip(){ if (W.JSZip) return Promise.resolve(); return new Promise(function(res, rej){ var x = D.createElement('script'); x.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; x.onload = res; x.onerror = rej; D.head.appendChild(x); }); }
/* a Word file's words: JSZip → word/document.xml, one line per paragraph (no mammoth needed) */
function docxText(f){
  return loadJSZip().then(function(){ return f.arrayBuffer(); }).then(function(b){ return W.JSZip.loadAsync(b); }).then(function(z){ var e = z.file('word/document.xml'); return e ? e.async('string') : ''; }).then(function(xml){
    return s(xml).split(/<\/w:p>/).map(function(par){ var t = []; par.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, function(m, x){ t.push(x); return m; }); if (/<w:tab\/>/.test(par) && !t.length) return ''; return t.join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }).filter(function(x){ return s(x); }).join('\n');
  }, function(){ return ''; });
}
function readText(f){
  if (!f) return Promise.resolve('');
  if (/\.docx$/i.test(f.name)) return docxText(f);
  if (/\.txt$/i.test(f.name)) return f.text().catch(function(){ return ''; });
  return Promise.resolve('');   /* a PDF's words come from SCOPEFILES' own PDF reader when it saves (scopeText) */
}
function decorate(){
  var ov = D.getElementById('gcsf'); if (!ov) return;
  var bx = ov.querySelector('.bx'); if (!bx) return;
  if (!bx.__dd) { bx.__dd = 1;
    bx.addEventListener('dragover', function(e){ e.preventDefault(); bx.style.outline = '3px dashed #0F1D2F'; });
    bx.addEventListener('dragleave', function(){ bx.style.outline = ''; });
    bx.addEventListener('drop', function(e){ e.preventDefault(); bx.style.outline = ''; var inp = ov.querySelector('#gcsf-in'); if (!inp || !e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      try { var dt = new DataTransfer(); [].forEach.call(e.dataTransfer.files, function(f){ dt.items.add(f); }); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (x) {} });
    var h = bx.querySelector('.m'); if (h && !bx.querySelector('[data-sf2-dd]')) { var t = D.createElement('div'); t.className = 'm'; t.setAttribute('data-sf2-dd', '1'); t.textContent = 'Or drag the files (or the zip) onto this box. Save makes one 📋 scope draft per trade (with its 💲 budget) — the same name + trade again updates that draft.'; h.after(t); }
  }
  var pid = ov.__pid;
  [].forEach.call(ov.querySelectorAll('.r'), function(r){
    if (r.querySelector('[data-sf2]')) return; var sel = r.querySelector('select[data-i]'); if (!sel) return;
    var i = +sel.getAttribute('data-i'), nm = s((r.querySelector('.n') || {}).textContent).replace(/^\S+\s/, '');
    var w = D.createElement('div'); w.setAttribute('data-sf2', String(i)); w.style.cssText = 'flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;align-items:center';
    var subs = subsFor(pid, sel.value), picked = SUBS[i] || subs.filter(function(x){ return x.on; }).map(function(x){ return x.id; }); SUBS[i] = picked;
    w.innerHTML = '<button type="button" class="b" data-sf2p="' + i + '" style="min-height:34px;padding:4px 10px">👁 Preview</button>'
      + (subs.length ? '<span class="m">👷 For:</span>' + subs.map(function(x){ return '<label class="m" style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-sf2s="' + i + '" value="' + esc(x.id) + '"' + (picked.indexOf(x.id) >= 0 ? ' checked' : '') + '>' + esc(x.name) + (x.on ? '' : ' (Subs list)') + '</label>'; }).join('') : '<span class="m">No sub in this trade yet — pick one when you 📤 Send.</span>')
      + '<pre data-sf2v="' + i + '" style="display:none;flex-basis:100%;white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px;margin:4px 0;font:12px/1.4 Inter,Arial,sans-serif;max-height:160px;overflow:auto"></pre>';
    r.appendChild(w); r.setAttribute('data-sf2name', nm);
  });
}
D.addEventListener('click', function(e){
  var t = e.target; if (!t || !t.closest) return;
  var pv = t.closest('[data-sf2p]'); if (pv) { e.preventDefault(); var i = pv.getAttribute('data-sf2p'), box = D.querySelector('#gcsf [data-sf2v="' + i + '"]'), r = pv.closest('.r'), nm = r ? r.getAttribute('data-sf2name') : ''; if (!box) return; if (box.style.display === 'block') { box.style.display = 'none'; return; } box.style.display = 'block'; box.textContent = TEXT[nm] != null ? preview(TEXT[nm]) : 'Reading…'; if (TEXT[nm] == null) { var F = (W.__gcSf2Files || {})[nm]; if (F) readText(F).then(function(tx){ TEXT[nm] = tx; box.textContent = preview(tx); }); else box.textContent = '(the text is read when you save)'; } return; }
}, true);
D.addEventListener('change', function(e){
  var t = e.target; if (!t || !t.closest || !t.closest('#gcsf')) return;
  if (t.hasAttribute('data-sf2s')) { var i = t.getAttribute('data-sf2s'), L = [].map.call(D.querySelectorAll('#gcsf [data-sf2s="' + i + '"]:checked'), function(x){ return x.value; }); SUBS[i] = L; return; }
  if (t.matches && t.matches('select[data-i]')) { var r = t.closest('.r'), w = r && r.querySelector('[data-sf2]'); if (w) w.remove(); delete SUBS[t.getAttribute('data-i')]; ST.call(W, decorate, 50); return; }
  if (t.id === 'gcsf-in') { W.__gcSf2Files = W.__gcSf2Files || {}; SUBS = {};
    [].forEach.call(t.files || [], function(f){ W.__gcSf2Files[f.name] = f;
      if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) loadJSZip().then(function(){ return f.arrayBuffer(); }).then(function(b){ return W.JSZip.loadAsync(b); }).then(function(z){   /* the files inside, by name (for 👁 Preview and the drafts) */
        Object.keys(z.files).filter(function(n){ return !z.files[n].dir && !/(^|\/)(__MACOSX|\.)/.test(n) && /\.(docx|txt)$/i.test(n); }).slice(0, 40).forEach(function(n){ z.files[n].async('blob').then(function(bl){ var nm = n.split('/').pop(); W.__gcSf2Files[nm] = new File([bl], nm); }); }); }).catch(function(){}); }); }
}, true);
/* SCOPEFILES' Save: the rows it is about to save (name, trade, question?) and our picked subs, read BEFORE it clears the list */
D.addEventListener('click', function(e){
  var t = e.target; if (!t || t.id !== 'gcsf-save') return;
  var ov = D.getElementById('gcsf'); if (!ov) return; var pid = ov.__pid;
  var rows = [].map.call(ov.querySelectorAll('.r'), function(r){ var sel = r.querySelector('select[data-i]'), nm = s((r.querySelector('.n') || {}).textContent).replace(/^\S+\s/, ''); return { name: nm, trade: sel ? sel.value : '', q: !sel, subs: sel ? (SUBS[sel.getAttribute('data-i')] || []).slice() : [] }; });
  W.__gcSf2Pending = { pid: pid, rows: rows, at: Date.now() };
}, true);
/* after SCOPEFILES saved the documents (they carry scopeText): replace older same name + trade, make the drafts */
function afterSave(){
  var P = W.__gcSf2Pending; if (!P || Date.now() - P.at > 10 * 60e3) return;
  var docs = arr(crm().projectDocs).concat(arr(W._gcProjectDocs)), mine = [];
  P.rows.forEach(function(r){ if (r.q) return; var d = docs.filter(function(x){ return s(x.pid) === s(P.pid) && x.scopeFile === true && !x.deleted && low(x.name) === low(r.name) && low(x.trade) === low(r.trade); }).sort(function(a, b){ return s(a.uploadedAt) < s(b.uploadedAt) ? 1 : -1; })[0]; if (d) mine.push({ d: d, r: r }); });
  if (mine.length < P.rows.filter(function(r){ return !r.q && r.trade; }).length) return;   /* not all saved yet */
  W.__gcSf2Pending = null;
  replaceOld(P.pid, mine.map(function(x){ return x.d; })).then(function(){
    return Promise.all(mine.map(function(x){ return s(x.d.scopeText) ? s(x.d.scopeText) : readText((W.__gcSf2Files || {})[x.r.name]); }));
  }).then(function(texts){
    return save(P.pid, mine.map(function(x, i){ return { name: x.r.name, trade: x.r.trade, text: texts[i], subs: x.r.subs }; }));
  }).then(function(res){
    W.__gcSf2Last = res;
    var m = D.querySelector('#gcsf #gcsf-msg'); if (m && res.length) m.textContent += ' 📋 ' + res.map(function(x){ return x.trade + (x.created ? ' — new draft' : ' — draft v' + x.version); }).join(' · ') + '. Open 📋 Scopes & 💲 budgets to edit and 📤 Send.';
  });
}
/* the sheet's pid (SCOPEFILES opens it with open(pid, back)) */
(function hook(n){ var F = SF(); if (F && F.open && !F.open.__sf2) { var o = F.open; var f = function(pid){ var r = o.apply(this, arguments); var ov = D.getElementById('gcsf'); if (ov) ov.__pid = s(pid); SUBS = {}; ST.call(W, decorate, 50); return r; }; f.__sf2 = true; F.open = f; return; } if (n < 120) ST.call(W, function(){ hook(n + 1); }, 1000); })(0);
SI.call(W, function(){ if (D.getElementById('gcsf')) decorate(); if (W.__gcSf2Pending) afterSave(); }, 700);
W._gcScopeFiles2 = { save: save, preview: preview, subsFor: subsFor, replaceOld: replaceOld };
})(window);
