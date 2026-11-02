/* patch ESTMATH — honest line math in the Estimate Builder (inserted right after lineCharge()).
   1. Every line shows every factor, in order, with the numbers the builder really uses:
        qty × unit = subtotal · + sales tax % (materials) · + MS contractor tax 3.5% (Mississippi jobs, every line but
        man-hours) · × margin (the one effMult() really applies, named) = charge.
      "Base" and "Charge" on the line are the same numbers the text shows (one computation, lineBaseCost / lineCharge).
   2. The margin is named the same way on the chip, in the "Line margin" pulldown and in the text. THE RULE (effMult):
        a margin set on the line wins; else the "Override" margin when it is on; else the estimate's JOB margin (the
        margin bar at the top: a commercial default, a margin chosen by hand, or the margin the estimate was saved at);
        the type default from Settings applies only when the job margin is "By type".
      The pulldown's first choice used to say "Type default (1.4286x)" even when the job margin (e.g. 1.25x) was the one
      charged, and the chip said "(material dflt)". Both now say "Job margin".
   3. Drywall screws are a takeoff from the board count: sheets × screws per board (48, editable per estimate) ÷ screws
      per box (the price-book item's pack size; asked once and saved on the item) = boxes, rounded up, at the item's
      price per box. Change the sheets and the screws follow; type a different qty and the line says "overridden".
      Estimates saved with the old rule (35 per board) are not changed: they show "Math updated — review" and the new
      count beside the old one until the estimate is saved again.
   Nothing here changes how a total is computed; only the screws takeoff (new lines, or "Use" on an old one) does. */
var GC_SCREWS_PER_BOARD = 48, GC_SCREWS_PER_BOX = 5000;
function _gcMf(m){ m = parseFloat(m); if(!isFinite(m)) return '1'; return String(Math.round(m * 1e4) / 1e4); }
function _gcQf(q){ q = parseFloat(q) || 0; return q.toLocaleString('en-US', { maximumFractionDigits: 4 }); }
function _gcEsc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _gcMultInfo(l){
  var t = (l && l.type) || 'labor', m = effMult(l) || 1;
  if(t === 'mh') return { m: 1, src: 'mh', label: 'man-hour rate' };
  if(l.mult && l.mult !== 'type' && !isNaN(parseFloat(l.mult)) && parseFloat(l.mult) > 0) return { m: m, src: 'line', label: 'this line' };
  if(useOvr) return { m: m, src: 'ovr', label: 'override' };
  if(jobMult === 'mat') return { m: m, src: 'type', label: t + ' default' };
  var s = (typeof openSlots !== 'undefined' && openSlots[activeSlot]) || {};
  return { m: m, src: 'job', label: 'job margin ' + (Math.round((1 - 1 / m) * 1000) / 10) + '%' + (s._pinned ? ', as saved' : '') };
}
window._gcMultInfo = _gcMultInfo;
function _gcMultChip(l){ var i = _gcMultInfo(l); return i.src === 'mh' ? 'MH rate' : _gcMf(i.m) + 'x (' + i.label + ')'; }
function _gcTypeOptLabel(l){
  var t = (l && l.type) || 'labor';
  if(t === 'mh') return 'Man-hour rate (no margin)';
  if(useOvr) return 'Override (' + _gcMf(ovrMult) + 'x)';
  if(jobMult === 'mat') return 'Type default (' + _gcMf(typeMultiplier(t)) + 'x)';
  return 'Job margin (' + _gcMf(parseFloat(jobMult)) + 'x)';
}
function _gcMsPct(){ return settings.jobState === 'MS' ? (parseFloat(settings.msContractorTax) || 3.5) : 0; }
/* the steps, as text; the last two numbers are exactly lineBaseCost(l) and lineCharge(l) */
function _gcLineMathText(l){
  var t = l.type || 'labor', q = parseFloat(l.qty) || 0, c = parseFloat(l.cost) || 0, base = lineBaseCost(l), charge = lineCharge(l), ms = _gcMsPct();
  if(t === 'mh') return _gcQf(q) + ' MH × $' + (settings.mhCost || 44.44) + '/hr cost = ' + fmt(base) + ' · charged ' + _gcQf(q) + ' MH × $' + (settings.mhCharge || 75) + '/hr = ' + fmt(charge) + ' (man-hours: hourly rate, no margin' + (ms ? ', no MS tax' : '') + ')';
  var raw = c * q, out = [_gcQf(q) + ' × ' + fmt(c) + ' = ' + fmt(raw)];
  if(t === 'material') out.push('+ ' + settings.tax + '% sales tax = ' + fmt(ms ? taxed(raw) : base));
  if(ms) out.push('+ ' + ms + '% MS contractor tax = ' + fmt(base));
  var mi = _gcMultInfo(l);
  out.push('× ' + _gcMf(mi.m) + ' (' + mi.label + ') = ' + fmt(charge));
  return out.join(' · ');
}
window._gcLineMathText = _gcLineMathText;
function _gcLineMathHTML(l){
  var t = l.type || 'labor';
  return '<span data-math style="color:' + (t === 'material' ? 'var(--amber)' : t === 'mh' ? 'var(--teal)' : 'var(--text2)') + ';font-size:10px">' + _gcEsc(_gcLineMathText(l)) + '</span>';
}
/* MS contractor tax actually in the lines (lineBaseCost adds it to every line but man-hours) */
window._gcMsTaxTotal = function(){
  var ms = _gcMsPct(); if(!ms) return 0;
  return lines.reduce(function(s, l){ if((l.type || 'labor') === 'mh') return s; var b = lineBaseCost(l); return s + (b - b / (1 + ms / 100)); }, 0);
};

/* ── drywall screws takeoff ─────────────────────────────────────────────────────────────────────────────────── */
var GC_OLD_SCREW_NOTE = /^([\d,]+) sheets × (\d+(?:\.\d+)?) = ([\d,]+) screws ÷ ([\d,]+)\/box$/;
function _gcNum(v){ return parseFloat(String(v == null ? '' : v).replace(/,/g, '')) || 0; }
function _gcIsScrewLine(l){ return !!l && /^Drywall screws\b/.test(String(l.desc || '')); }
function _gcLegacyScrew(l){
  if(!_gcIsScrewLine(l) || l.takeoff) return null;
  var m = String(l.calcNote || '').match(GC_OLD_SCREW_NOTE); if(!m) return null;
  return { sheets: _gcNum(m[1]), perBoard: +m[2], perBox: _gcNum(m[4]) };
}
function _gcScrewsPerBoard(){
  var s = (typeof openSlots !== 'undefined' && openSlots[activeSlot]) || {}, v = parseFloat(s.screwsPerBoard);
  if(v > 0) return v;
  for(var i = 0; i < lines.length; i++){ var tk = lines[i] && lines[i].takeoff; if(tk && tk.rule === 'dwScrews' && parseFloat(tk.perBoard) > 0) return parseFloat(tk.perBoard); }
  return GC_SCREWS_PER_BOARD;
}
window._gcScrewsPerBoard = _gcScrewsPerBoard;
function _gcAreaTag(d){ d = String(d || ''); var i = d.lastIndexOf(' — '); return i >= 0 ? d.slice(i) : ''; }
function _gcIsBoardLine(x){ return !!x && (x.type || 'labor') === 'material' && /^Drywall\b/.test(String(x.desc || '')) && !/screws|hang labor|tape|corner|compound|sanding/i.test(String(x.desc || '')) && (x.unit === 'sheet' || /\d+×\d+/.test(String(x.desc || ''))); }
function _gcTkSheetLines(l){
  var tk = l.takeoff;
  if(tk && Array.isArray(tk.srcIds) && tk.srcIds.length) return lines.filter(function(x){ return x && tk.srcIds.indexOf(x.id) >= 0; });
  if(tk) return [];
  var tag = _gcAreaTag(l.desc);
  return lines.filter(function(x){ return x !== l && _gcIsBoardLine(x) && _gcAreaTag(x.desc) === tag; });
}
function _gcTkCompute(l){
  var tk = l.takeoff, leg = tk ? null : _gcLegacyScrew(l);
  if(!(tk && tk.rule === 'dwScrews') && !leg) return null;
  var src = _gcTkSheetLines(l), sheets = src.length ? src.reduce(function(s, x){ return s + (parseFloat(x.qty) || 0); }, 0) : (tk ? (parseFloat(tk.sheets) || 0) : leg.sheets);
  var perBoard = _gcScrewsPerBoard(), perBox = (tk ? parseFloat(tk.perBox) : leg.perBox) || GC_SCREWS_PER_BOX, screws = sheets * perBoard;
  return { sheets: sheets, perBoard: perBoard, perBox: perBox, screws: screws, boxes: sheets > 0 ? Math.max(1, Math.ceil(screws / perBox - 1e-9)) : 0, srcIds: src.map(function(x){ return x.id; }), legacy: leg };
}
window._gcTkCompute = _gcTkCompute;
function _gcTkNote(c){ return fmtN(c.sheets) + ' sheets × ' + _gcQf(c.perBoard) + ' = ' + fmtN(c.screws) + ' screws ÷ ' + fmtN(c.perBox) + '/box = ' + fmtN(c.boxes) + ' box' + (c.boxes === 1 ? '' : 'es'); }
window._gcTkNote = _gcTkNote;
/* bring a takeoff line up to date (its qty only when it is not overridden); true when something changed */
function _gcTkRefresh(l){
  var c = _gcTkCompute(l); if(!c || !l.takeoff) return false;
  var before = JSON.stringify([l.qty, l.calcNote, l.takeoff]);
  l.takeoff.sheets = c.sheets; l.takeoff.perBoard = c.perBoard;
  if(!l.qtyOverride) l.qty = c.boxes;
  else if(parseFloat(l.qty) === c.boxes) l.qtyOverride = false;
  l.calcNote = _gcTkNote(c) + (l.qtyOverride ? ' · qty overridden to ' + _gcQf(l.qty) : '');
  return JSON.stringify([l.qty, l.calcNote, l.takeoff]) !== before;
}
/* called from ul() after a field changes; true = redraw the lines */
window._gcTkOnEdit = function(l, f){
  try{
    if(f !== 'qty' && f !== 'type' && f !== 'cost') return false;
    var redraw = false;
    if(f === 'qty' && l.takeoff && l.takeoff.rule === 'dwScrews'){
      var c = _gcTkCompute(l); l.qtyOverride = !!c && parseFloat(l.qty) !== c.boxes; _gcTkRefresh(l); redraw = true;
    } else if(f === 'qty' && _gcLegacyScrew(l)) redraw = true;
    if(f === 'qty' || f === 'type'){
      lines.forEach(function(x){ if(x && x !== l && x.takeoff && x.takeoff.rule === 'dwScrews' && (x.takeoff.srcIds || []).indexOf(l.id) >= 0){ if(_gcTkRefresh(x)) redraw = true; } });
      if(lines.some(function(x){ return _gcLegacyScrew(x) && _gcTkSheetLines(x).indexOf(l) >= 0; })) redraw = true;
    }
    return redraw;
  }catch(e){ return false; }
};
function _gcTkPersist(){
  try{ var s = openSlots[activeSlot]; if(s) s.lines = [...lines]; }catch(e){}
  try{ renderLines(); renderSummary(); }catch(e){}
  try{ if(typeof _gcPersistLineEdit === 'function') _gcPersistLineEdit(); }catch(e){}
}
/* "Use N": the line takes the rule's count (an old line becomes a takeoff line) */
window._gcTkUse = function(id){
  var l = lines.find(function(x){ return x && x.id === id; }); if(!l) return false;
  var c = _gcTkCompute(l); if(!c) return false;
  if(!l.takeoff) l.takeoff = { rule: 'dwScrews', srcIds: c.srcIds, perBoard: c.perBoard, perBox: c.perBox, packFrom: 'note', sheets: c.sheets, was: l.calcNote || '' };
  l.qtyOverride = false; _gcTkRefresh(l); _gcTkPersist(); return true;
};
/* screws per board, for this estimate */
window._gcTkSetPerBoard = function(v){
  var n = parseFloat(v); if(!(n > 0)){ try{ renderLines(); }catch(e){} return false; }
  var s = openSlots[activeSlot]; if(s) s.screwsPerBoard = n;
  lines.forEach(function(x){ if(x && x.takeoff && x.takeoff.rule === 'dwScrews'){ x.takeoff.perBoard = n; _gcTkRefresh(x); } });
  _gcTkPersist(); return true;
};
function _gcRateOf(tk){ try{ return (tk && (tk.itemId || tk.itemDesc)) ? rates.find(function(r){ return r && ((tk.itemId && r.id === tk.itemId) || (!tk.itemId && r.desc === tk.itemDesc)); }) || null : null; }catch(e){ return null; } }
/* ask (once) how many screws come in one box of the item, and keep it on the item */
function _gcAskPack(tk, desc){
  var r = _gcRateOf(tk), name = (r && r.desc) || tk.itemDesc || desc || 'drywall screws';
  var a = window.prompt('How many screws come in one box of "' + name + '"?\n(Saved on the item, so you are asked once.)', String(tk.perBox || GC_SCREWS_PER_BOX));
  var n = parseInt(String(a == null ? '' : a).replace(/[^\d]/g, ''), 10);
  if(!(n > 0)) return false;
  tk.perBox = n; tk.packFrom = 'item';
  if(r){ r.packSize = n; try{ saveRatesDB(); }catch(e){} }
  return true;
}
window._gcTkSetPack = function(id){
  var l = lines.find(function(x){ return x && x.id === id; }); if(!l || !l.takeoff) return false;
  if(!_gcAskPack(l.takeoff, l.desc)) return false;
  _gcTkRefresh(l); _gcTkPersist(); return true;
};
/* new calculator lines: link each screws line to its board line(s); ask the pack size once per item */
window._gcTkLink = function(newLines){
  try{
    var asked = {};
    newLines.forEach(function(l){
      if(!l || !l.takeoff || !l.takeoff.src) return;
      var src = l.takeoff.src;
      l.takeoff.srcIds = newLines.filter(function(x){ return x && x.tkSrc === src; }).map(function(x){ return x.id; });
      delete l.takeoff.src;
    });
    newLines.forEach(function(l){ if(l && l.tkSrc) delete l.tkSrc; });
    newLines.forEach(function(l){
      var tk = l && l.takeoff; if(!tk || tk.packFrom !== 'assumed' || !(tk.itemId || tk.itemDesc)) return;
      var k = tk.itemId || tk.itemDesc;
      if(asked[k] === undefined){ asked[k] = _gcAskPack(tk, l.desc) ? tk.perBox : 0; }
      else if(asked[k] > 0){ tk.perBox = asked[k]; tk.packFrom = 'item'; }
    });
    newLines.forEach(function(l){
      var tk = l && l.takeoff; if(!tk || tk.rule !== 'dwScrews') return;
      var sheets = 0; newLines.forEach(function(x){ if(x && (tk.srcIds || []).indexOf(x.id) >= 0) sheets += parseFloat(x.qty) || 0; });
      var c = { sheets: sheets, perBoard: parseFloat(tk.perBoard) || GC_SCREWS_PER_BOARD, perBox: parseFloat(tk.perBox) || GC_SCREWS_PER_BOX };
      c.screws = c.sheets * c.perBoard; c.boxes = c.sheets > 0 ? Math.max(1, Math.ceil(c.screws / c.perBox - 1e-9)) : 0;
      tk.sheets = c.sheets; l.qty = c.boxes; l.qtyOverride = false; l.calcNote = _gcTkNote(c);
    });
  }catch(e){ console.warn('ESTMATH link', e); }
  return newLines;
};
/* the takeoff row under a screws line */
function _gcTkLineHTML(l){
  try{
    var c = _gcTkCompute(l); if(!c) return '';
    var id = _gcEsc(l.id), b = 'margin-left:6px;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer;border:.5px solid var(--bdr2);background:var(--bg);color:var(--text)';
    var pb = '<input type="number" data-tk-perboard min="1" step="1" value="' + _gcQf(c.perBoard) + '" title="Screws per board, this estimate" style="width:46px;font-size:10px;padding:1px 3px" onchange="_gcTkSetPerBoard(this.value)">';
    var rule = fmtN(c.sheets) + ' sheets × ' + pb + ' screws/board = ' + fmtN(c.screws) + ' screws ÷ ' + fmtN(c.perBox) + '/box = <b>' + fmtN(c.boxes) + ' box' + (c.boxes === 1 ? '' : 'es') + '</b>';
    var h = '<div data-tk style="flex-basis:100%;font-size:10px;color:var(--text2);margin-top:3px">';
    if(c.legacy){
      var lg = c.legacy, oldN = Math.max(1, Math.ceil(lg.sheets * lg.perBoard / lg.perBox - 1e-9));
      h += '<span style="color:var(--amber);font-weight:700">Math updated — review:</span> figured at ' + _gcQf(lg.perBoard) + ' screws/board (' + fmtN(lg.sheets) + ' sheets × ' + _gcQf(lg.perBoard) + ' ÷ ' + fmtN(lg.perBox) + '/box = ' + fmtN(oldN) + ' boxes; this line has ' + _gcQf(l.qty) + '). Now: ' + rule
        + (parseFloat(l.qty) !== c.boxes ? '<button type="button" data-tk-use style="' + b + '" onclick="_gcTkUse(\'' + id + '\')">Use ' + fmtN(c.boxes) + '</button>' : '');
    } else {
      h += 'Takeoff: ' + rule;
      if(l.qtyOverride) h += ' · <b style="color:var(--amber)">qty overridden</b> (' + _gcQf(l.qty) + ')<button type="button" data-tk-use style="' + b + '" onclick="_gcTkUse(\'' + id + '\')">Use ' + fmtN(c.boxes) + '</button>';
      if(l.takeoff.packFrom === 'assumed') h += ' · box size assumed<button type="button" data-tk-pack style="' + b + '" onclick="_gcTkSetPack(\'' + id + '\')">Set box size</button>';
    }
    return h + '</div>';
  }catch(e){ return ''; }
}
/* the estimate-level notice: an estimate figured with the old screws rule */
window._gcMathBannerHTML = function(){
  try{
    var old = lines.filter(_gcLegacyScrew); if(!old.length) return '';
    var diff = old.filter(function(l){ var c = _gcTkCompute(l); return c && parseFloat(l.qty) !== c.boxes; }).length;
    return '<div id="gc-estmath-banner" style="background:rgba(186,117,23,0.10);border:.5px solid var(--amber);border-radius:var(--r);padding:.45rem .7rem;margin-bottom:.5rem;font-size:11px">'
      + '<b style="color:var(--amber)">Math updated — review.</b> Drywall screws are now figured from the board count at ' + _gcQf(_gcScrewsPerBoard()) + ' screws per board; this estimate was figured at ' + _gcQf(_gcLegacyScrew(old[0]).perBoard) + '. '
      + 'Nothing on it was changed — its lines and saved total are as saved. ' + (diff ? diff + ' screws line' + (diff === 1 ? '' : 's') + ' would change (see below: “Use” takes the new count). ' : '')
      + 'Saving marks it reviewed; a line you leave keeps its count and shows as overridden.</div>';
  }catch(e){ return ''; }
};
/* explicit Save = reviewed: old screws lines become takeoff lines, keeping their qty (overridden when it differs) */
window._gcMathOnSave = function(){
  try{
    lines.forEach(function(l){
      var c = _gcLegacyScrew(l) && _gcTkCompute(l); if(!c) return;
      l.takeoff = { rule: 'dwScrews', srcIds: c.srcIds, perBoard: c.perBoard, perBox: c.perBox, packFrom: 'note', sheets: c.sheets, was: l.calcNote || '' };
      l.qtyOverride = parseFloat(l.qty) !== c.boxes;
      l.calcNote = _gcTkNote(c) + (l.qtyOverride ? ' · qty overridden to ' + _gcQf(l.qty) : '');
    });
    var s = openSlots[activeSlot]; if(s) s.lines = [...lines];
  }catch(e){ console.warn('ESTMATH save', e); }
};
