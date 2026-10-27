/* __GC_PATCH_PRICEBOOK__ ══════════════════════════════════════════════════════════════════════════
   ESTIMATE BUILDER PRICE BOOK (patch PRICEBOOK). Owner 10/26: "reprice the estimate builder all at once
   and let the estimators send the new prices."

   One cloud store, gc_kv gc_price_book:
     { schema: 1, version, updatedAt, updatedBy, updatedByEmail,
       items:    { "<id>": { lab, mat, sub } }     only the prices an admin has set; a missing price = today's built-in one
       settings: { marginPct, comSmallMarginPct, comMarginPct, tax, msContractorTax }   the builder's margins + sales tax
       log:      [ { v, at, by, email, src, note, n, ch: [{ id, item, f, o, n }] } ]   newest last, the last 60 kept }
   Ids: calculator prices ("paint.interior", "frame.metal.wall", "dw.hang.48", …, listed below) and Rate Book rows
   ("rb:" + the row's name). The calculators read it through _gcPB(id, field, today's number) or through the tables
   this file sets (PT_TYPES, DW_SIZES, FLR_TYPES, ACT_LABOR); with no Price Book everything is exactly as before.
   A Rate Book price set here is written into the Rate Book (gc_rates_v3) on every computer, once per change.
   Saved and sent estimates keep their own line costs: only new lines and calculator runs use the new prices.

   Screens: Admin → Estimate Builder → Price Book (W._gcOpenPriceBook) — inline edits, "Upload price sheet"
   (.xlsx: the review workbook's NEW columns, or a CSV; old → new before Apply), Margins & tax, change log,
   price sheet (one page, logo header). Estimators: a banner in the builder "Prices updated by … on … — see changes"
   once per update; the Price Book read-only. "Import supplier prices" asks before it changes a Price Book price.
   Console: _gcPriceBook.state(), .items(), .refresh(), .apply(changes, src), .parse(rows), .preview(rows)
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PRICEBOOK_UI__) return; W.__GC_PRICEBOOK_UI__ = true;
var KEY = 'gc_price_book', LS = 'gc_price_book', SEEN = 'gc_price_book_seen', RBV = 'gc_price_book_rb_v';
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var STO = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
var OWNER_SETTINGS = { marginPct: 30, comSmallMarginPct: 25, comMarginPct: 20, tax: 9.75, msContractorTax: 3.5 };
var FL = { lab: 'Labor', mat: 'Material', sub: 'Sub' };

/* ── helpers ── */
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function r4(n){ return Math.round(n * 10000) / 10000; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : null; var t = s(v).replace(/[$,\s]/g, ''); if (!t || !/^-?\d*\.?\d+$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null; }
function money(v){ if (v == null || !isFinite(v)) return ''; var a = Math.abs(v), d = (Math.round(a * 100) === a * 100) ? 2 : (Math.round(a * 1000) === a * 1000 ? 3 : 4); return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: d }); }
function short(v){ return Number.isInteger(v) ? String(v) : (Math.round(v * 100) === v * 100 ? v.toFixed(2) : String(r4(v))); }
function pct(o, n){ if (o == null || n == null || !o) return ''; var p = Math.round((n / o - 1) * 1000) / 10; return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(1) + '%'; }
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { W.localStorage.setItem(k, v); } catch (e) {} }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function myEmail(){ try { return s(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()).toLowerCase(); } catch (e) { return ''; } }
function myName(){
  var e = myEmail();
  try { var u = arr(W._crm && W._crm.users).filter(function(x){ return x && s(x.email).toLowerCase() === e; })[0]; if (u && u.name) return s(u.name); } catch (x) {}
  return e || 'an admin';
}
function nice(iso){ var d = new Date(iso); if (isNaN(d)) return s(iso); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
function niceT(iso){ var d = new Date(iso); if (isNaN(d)) return s(iso); return nice(iso) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function norm(t){ return s(t).replace(/(\d),(\d{3})\b/g, '$1$2').toLowerCase().replace(/[×]/g, 'x').replace(/[”″]/g, '"').replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim(); }
var STOP = { jobs: 1, job: 1, the: 1, a: 1, of: 1, rate: 1, book: 1, per: 1, and: 1, generic: 1, listed: 1, twice: 1, labor: 1, material: 1, materials: 1, mat: 1, lab: 1 };
var SYN = { avg: 'average', '1car': '1 car', '2car': '2 car' };
function toks(t){ var o = {}; norm(t).replace(/\./g, ' ').split(' ').forEach(function(w){ w = SYN[w] || w; if (w && !STOP[w]) o[w] = 1; }); return o; }

/* ═══ 1. the price list: every calculator price this build reads ═══════════════════════════════════════
   f: { lab | mat | sub: { d: today's price, b: [table, row, key] } } — b = the table the calculator reads
   (set here; a list of paths = several places); no b = read through _gcPB in the calculator. box = a calculator box that
   starts with the price; opt = a pick-list option whose value is the price. aka = the review workbook's item name;
   rbAlso = the Rate Book row a NEW price also moves. flag = an open question (Issues to fix). info = listed, not read by
   a calculator (joist lines at $0, the drywall ×1.6). Owner 10/26: "ALWAYS go from spreadsheet data for prices" — the
   numbers here are only the first-run seed. */
var ITEMS = [];
function C(id, cat, item, unit, f, o){ ITEMS.push(Object.assign({ id: id, cat: cat, item: item, unit: unit, f: f }, o || {})); }
function P(d, b){ return { d: d, b: b || null }; }
var I1 = '#1 Metal framing labor had two bases', I3 = '#3 Paint per SF here, per gallon in the calculator', I4 = '#4 Display only — the estimate is priced with the normal margin',
  I5 = '#5 Hang labor locked at ×1.6 (37.5% margin) — owner to decide', I7 = '#7 Says "per floor SF" but is multiplied by LF of wall', I8 = '#8 Two prices for one item ($1.55 / $2.00 vs $0.69 / $0.89)',
  I10 = '#10 Wood lumber: three different prices for the same sizes', I11 = '#11 4×8 hang $30 here, $35 in the Rate Book; 4×12 listed three times', I13 = '#13 Concrete: $240 vs $210, labels and units',
  I14 = '#14 ACT labor $2.00 here vs Rate Book $3 / $7; grid $0.90 vs $0.88 / $0.78', I15 = '#15 Flooring: differs from the Rate Book; labor charged on waste SF',
  I16 = '#16 Crew $300/day here vs Rate Book "crew day rate" $400; dumpster 30-yd $550 vs $600', I17 = '#17 Gutters booked as taxed material though it is an installed price', I18 = '#18 CMU: material here, labor + material sub in the Rate Book', I21 = '#21 Joist / rafter lines come in at $0',
  I9 = '#9 3-5/8" 20ga stud / track: one price here, another in Products', I12 = '#12 Products: admin edits that look like a unit mix-up (1/2" drywall 4×8 board, 2×6×10)',
  I19 = '#19 Products prices move every month with the national price index', I20 = '#20 The built-in "Import supplier prices" list disagrees with the Rate Book',
  PAINT50 = 'Owner 10/26: paint labor is $50/gal for interior, exterior, primer and custom — does it apply here too? Left as is for the owner to decide';

// Paint (per gallon; coverage stays as is)
[['interior', 'Interior walls / ceilings paint', 75, 25], ['exterior', 'Exterior paint', 75, 30], ['exposed', 'Exposed structure (DTM) — spray', 85, 35], ['primer', 'Primer coat only', 60, 20],
 ['epoxy', 'Epoxy floor coating', 90, 45], ['custom', 'Custom / other paint', 75, 25]].forEach(function(x){
  C('paint.' + x[0], 'Paint', x[1], 'per gallon', { lab: P(x[2], ['PT', x[0], 'laborRate']), mat: P(x[3], ['PT', x[0], 'matRate']) }, { note: 'Paint calculator: labor and paint per gallon.', flag: (x[0] === 'exposed' || x[0] === 'epoxy') ? PAINT50 : '' });
});
[['large', 'Quick build: paint interior 1 coat — over 2,000 SF', 'lab', 0.35], ['small', 'Quick build: paint interior 1 coat — 2,000 SF or less', 'lab', 0.55], ['mat', 'Quick build: paint material 1 coat', 'mat', 0.10]].forEach(function(x){
  var f = {}; f[x[2]] = P(x[3]); C('paint.quick.' + x[0], 'Paint', x[1], 'per SF of wall', f, { flag: I3, note: 'Quick build (the ⚡ button) prices paint per SF.' });
});
C('paint.charge', 'Paint', 'Paint "charge to customer" rate shown in paint calculator', 'per gallon', { sub: P(150) }, { flag: I4 + ' (display only)' });
// Framing
C('frame.metal.wall', 'Framing — metal', 'Metal stud framing labor — per LF of WALL (labor only)', 'per LF of wall', { lab: P(5.00) },
  { aka: ['Metal stud framing labor — by LF of WALL (saved framing zones)'], note: 'Main framing calculator (default choice) and saved zones. A 100 LF room = 100 × this rate. Material is priced separately.' });
C('frame.metal.mat', 'Framing — metal', 'Metal stud framing labor — by LF of MATERIAL (main framing calculator, "Partition / Interior")', 'per LF of studs+track', { lab: P(1.00) }, { flag: I1 + ' — now "(old basis)"; the default is per LF of wall' });
C('frame.metal.mat075', 'Framing — metal', 'Metal stud framing labor — "Partition $0.75/LF of material" option', 'per LF of material', { lab: P(0.75) }, { flag: I1 + ' — now "(old basis)"' });
[['large', 'Framing labor — large job (10,000+ SF)', 4.50], ['medium', 'Framing labor — medium job (5,000–10,000 SF)', 5.00], ['small', 'Framing labor — small job (under 5,000 SF)', 5.50],
 ['addition', 'Framing labor — addition', 8.00], ['reno', 'Framing labor — renovation / repair', 9.00], ['ti', 'Framing labor — TI partition', 2.00]].forEach(function(x){
  C('frame.' + x[0], 'Framing — wood/general', x[1], 'per floor SF (see note)', { lab: P(x[2]) }, { flag: I7 });
});
C('frame.metal.sf', 'Framing — metal', 'Metal stud framing labor — per SF of wall (saved zones, "SF of wall")', 'per SF of wall', { lab: P(0.75) }, { note: 'Starting rate when a saved framing zone is switched to "Charge labor by: SF of wall".' });
C('frame.wood.default', 'Framing — wood/general', 'Wood framing labor — when no labor choice is picked', 'per LF of wall', { lab: P(1.25) }, { note: 'Main framing calculator, wood: the rate it uses until a labor choice is picked.' });
C('frame.screws', 'Framing — metal', 'Metal framing screws (box of 15,000)', 'per box', { mat: P(208.75) }, { note: 'A matching Rate Book price wins.' });
C('frame.nails', 'Framing — wood/general', 'Framing nails (box of 2,500)', 'per box', { mat: P(45.00) }, { note: 'A matching Rate Book price wins.' });
C('frame.defl', 'Framing — metal', 'Deflection track 3-5/8" (top of wall option)', 'per LF', { mat: P(1.55) }, { flag: I8, opt: { mat: ['fr-deflect', '1.55'] } });
C('frame.defl6', 'Framing — metal', 'Deflection track 6"', 'per LF', { mat: P(2.00) }, { flag: I8, opt: { mat: ['fr-deflect', '2.00'] } });
C('frame.defl.x', 'Framing — metal', 'Deflection track 3-5/8" ("Metal framing extras" box)', 'per LF', { mat: P(0.69) }, { flag: I8, opt: { mat: ['fr-defl-size', '0.69'] } });
C('frame.defl6.x', 'Framing — metal', 'Deflection track 6" ("Metal framing extras" box)', 'per LF', { mat: P(0.89) }, { flag: I8, opt: { mat: ['fr-defl-size', '0.89'] } });
C('frame.hat', 'Framing — metal', 'Hat channel 7/8"', 'per LF', { mat: P(2.00) }, { opt: { mat: ['fr-hat-size', '2.00'] } });
C('frame.block2x4', 'Framing — wood/general', '2×4 / 2×6 blocking', 'per LF', { mat: P(0.365) }, { opt: { mat: ['fr-block-size', '0.365'] }, note: '2×4 blocking (framing extras and saved zones).' });
C('frame.block2x6', 'Framing — wood/general', '2×6 blocking', 'per LF', { mat: P(0.573) }, { opt: { mat: ['fr-block-size', '0.573'] } });
C('frame.wood2x4', 'Framing — wood/general', '2×4 stud + top plates (wood framing math fallback)', 'per LF', { mat: P(0.505) }, { flag: I10, note: 'Used when the Rate Book has no "2x4 … per LF" price.' });
C('frame.woodpt', 'Framing — wood/general', 'Treated bottom plate (wood framing math fallback)', 'per LF', { mat: P(0.706) }, { flag: I10 });
C('frame.wood2x8', 'Framing — wood/general', '2×8 headers (wood framing math fallback)', 'per LF', { mat: P(0.834) }, { flag: I10 });
[['358_25', '3-5/8" 25ga metal stud', 0.45], ['358_20', '3-5/8" 20ga metal stud', 0.625], ['358_18', '3-5/8" 18ga metal stud', 0.75], ['6_20', '6" 20ga metal stud', 0.88], ['6_18', '6" 18ga metal stud', 2.11]].forEach(function(x){
  C('frame.stud.' + x[0], 'Framing — metal', x[1], 'per LF', { mat: P(x[2]) }, { note: 'Stud pick list (a matching Rate Book price wins).', flag: x[0] === '358_20' ? I9 : '' });
});
[['358_20', '3-5/8" 20ga metal track', 0.625], ['358_18', '3-5/8" 18ga metal track', 0.75], ['6_20', '6" 20ga metal track', 0.86], ['6_18', '6" 18ga metal track', 1.86]].forEach(function(x){
  C('frame.track.' + x[0], 'Framing — metal', x[1], 'per LF', { mat: P(x[2]) }, { note: 'Track pick list (a matching Rate Book price wins).', flag: x[0] === '358_20' ? I9 : '' });
});
[['2x4', '2×4 rafter / joist (framing calculator, Rafter / Joist)', '0.365'], ['2x6', '2×6 rafter / joist (framing calculator, Rafter / Joist)', '0.573']].forEach(function(x){
  C('frame.rafter.' + x[0], 'Framing — wood/general', x[1], 'per LF', { mat: P(parseFloat(x[2])) }, { opt: { mat: ['fr-rafter-size', x[2]] } });
});
[['2x8', '2×8 rafter / ridge', '0.707'], ['2x10', '2×10 rafter / ridge', '0.624'], ['2x12', '2×12 rafter / ridge', '0.773']].forEach(function(x){
  C('frame.rafter.' + x[0], 'Framing — wood/general', x[1], 'per LF', { mat: P(parseFloat(x[2])) }, { flag: x[0] === '2x10' ? I10 : '', opt: { mat: ['fr-rafter-size', x[2]] }, opt2: { mat: ['fr-ridge', x[2]] } });
});
[['2x4', '2×4 SPF stud', 0.365], ['2x6', '2×6 SPF stud', 0.573], ['2x8', '2×8 SPF stud', 0.624], ['pt2x4', '2×4 treated stud / plate', 0.706], ['pt2x6', '2×6 treated stud / plate', 1.097], ['pt2x8', '2×8 treated plate', 1.222]].forEach(function(x){
  C('frame.lum.' + x[0], 'Framing — wood/general', x[1], 'per LF', { mat: P(x[2]) }, { flag: I10, note: 'Wood stud / plate pick list (a matching Rate Book "per LF" price wins).' });
});
C('frame.joists', 'Framing — wood/general', 'Floor joists / roof rafters / subfloor / sheathing (joist & rafter calculators)', 'each', { mat: P(0) }, { info: true, flag: I21,
  note: 'Those two old calculators have no screen in the builder (code only). Joists, rafters and ridge boards are priced in the framing calculator (Rafter / Joist) from the rafter rows above.' });
// Drywall
[['48', 'Hang labor — 4×12 (48 SF)', 28], ['32', 'Hang labor — 4×8 (32 SF)', 30], ['40', 'Hang labor — 4×10 (40 SF)', 28], ['32_cement', 'Hang labor — 4×8 Durock cement board', 15],
 ['15', 'Hang labor — 3×5 cement board', 35], ['54', 'Hang labor — 4.5×12 (54 SF)', 28], ['40_510', 'Hang labor — 5/8" 4×10 ($20.80 board)', 28]].forEach(function(x){
  C('dw.hang.' + x[0], 'Drywall', x[1], 'per sheet', { lab: P(x[2], ['DW', x[0], 'laborDef']) }, x[0] === '32' ? { flag: I11 } : null);
});
C('dw.hangfinish', 'Drywall', 'Drywall hang + finish labor — per sheet (all sizes but cement board)', 'per sheet', { lab: P(0) },
  { flag: 'Owner 10/26: about $50 per sheet hung and finished, charged at the normal margin — type it here to turn it on', note: 'Above $0: the drywall calculator (and Quick build) shows one "Drywall hang + finish labor" line per zone at this price, priced at the default margin (residential 30% → ÷ 0.70). $0 = off: hang only (the rows above) and finishing not priced.' });
C('dw.hangmult', 'Drywall', 'Drywall hang-only labor markup (drywall calculator)', '× cost (0 = normal margin)', { lab: P(1.6) }, { flag: I5 + ' — used only while "hang + finish" is $0', note: 'The drywall calculator charges hang-only labor at this multiple of cost instead of the default margin. 0 = the default margin.' });
C('dw.quick.sheet', 'Drywall', 'Drywall sheet (Quick build)', 'per sheet', { mat: P(22) }, { note: 'Quick build (the ⚡ button): board price per sheet.' });
C('dw.quick.extras', 'Drywall', 'Drywall accessories (Quick build)', 'per sheet', { mat: P(3) }, { note: 'Quick build: screws, mud, tape per sheet.' });
[['32', '4×8', 35], ['40', '4×10', 28], ['48', '4×12 / 4.5×12', 30]].forEach(function(x){ C('dw.quick.hang.' + x[0], 'Drywall', 'Hang labor — ' + x[1] + ' (Quick build)', 'per sheet', { lab: P(x[2]) }, { flag: I11, note: 'Quick build only (hang + finish replaces it when set).' }); });
var DWL = { regular: '1/2" standard', fire_type_x: '5/8" Type X', mold: '5/8" mold resistant', fire_mold: 'Fire + mold rated', cement: 'Cement board', ultracode: '3/4" Ultracode', lead: 'Lead-lined' };
var DWS = { '32': '4×8', '40': '4×10', '48': '4×12', '54': '4.5×12', '15': '3×5' };
var DWT = { regular: { 32: 13.50, 40: 16.00, 48: 21.60, 54: 25.92 }, fire_type_x: { 32: 17.00, 40: 19.00, 48: 23.04, 54: 25.00 }, mold: { 32: 18.00, 40: 20.00, 48: 22.00, 54: 24.00 },
  fire_mold: { 32: 21.05, 40: 23.00, 48: 25.00, 54: 27.00 }, cement: { 32: 35.00, 15: 25.00, 48: 38.00, 40: 36.00 }, ultracode: { 32: 33.00, 40: 35.00, 48: 37.00 }, lead: { 32: 90.00, 40: 95.00, 48: 100.00 } };
Object.keys(DWT).forEach(function(k){
  Object.keys(DWT[k]).forEach(function(z){
    var aka = k === 'cement' ? ['Board Cement board ' + z + ' (' + DWS[z] + ')'] : ['Board ' + DWL[k] + ' ' + DWS[z]];
    C('dw.board.' + k + '.' + z, 'Drywall', 'Board ' + DWL[k] + ' ' + DWS[z], 'per sheet', { mat: P(DWT[k][z]) }, { aka: aka, note: 'A matching Rate Book "per sheet" price wins.' });
  });
});
[['screws', 'Drywall screws (box of 5,000)', 'per box', 44.98], ['mud', 'Joint compound (mud)', 'per box', 15], ['tape', 'Paper tape (500 ft roll)', 'per roll', 7], ['pads', 'Sanding pads', 'each', 1],
 ['bead', 'Metal corner bead 8 ft stick', 'per stick', 4.41], ['fctube', 'Fire caulk sealant tube', 'per tube', 9.50]].forEach(function(x){
  C('dw.' + x[0], 'Drywall', x[1], x[2], { mat: P(x[3]) }, { note: 'A matching Rate Book price wins.' });
});
C('dw.firestop', 'Drywall', 'Fire caulk / firestop install', 'per LF', { lab: P(1.75) });
C('dw.cementx', 'Drywall', 'Cement board mesh tape + thinset', 'per sheet', { mat: P(4) });
C('dw.finish', 'Drywall', 'Finish labor — tape, mud and sand (per sheet hung)', 'per sheet', { lab: P(0) },
  { note: 'Added to the drywall calculator as its own line when above $0 (follows the normal margin) — only while "Drywall hang + finish labor" is $0 (that line already includes finishing).' });
// ACT
[['regular', 'ACT grid + tile install — regular finish', 2.00], ['grid_only', 'ACT grid only', 1.25], ['tile_only', 'ACT tiles only', 0.75], ['high_end', 'ACT high-end finish', 3.00]].forEach(function(x){
  C('act.' + x[0], 'Ceilings (ACT)', x[1], 'per SF', { lab: P(x[2], ['ACT', null, x[0]]) }, x[0] === 'regular' ? { flag: I14, note: 'ACT zones and the simple ACT calculator.' } : { note: 'ACT zones.' });
});
// Flooring
[['lvp', 'LVP click-lock plank', 1.50], ['lvt', 'LVT glue-down', 1.50], ['laminate', 'Laminate floating', 1.25], ['engineered', 'Engineered hardwood floating', 1.75], ['hardwood_glue', 'Hardwood glue-down', 2.00],
 ['engineered_glue', 'Engineered hardwood glue-down', 1.75], ['hardwood', 'Hardwood nail-down', 2.00], ['tile_l', 'Floor tile large format', 3.00], ['tile_s', 'Floor tile small format', 4.00],
 ['hardwood_sf', 'Hardwood sand & finish', 2.60], ['sand', 'Sand & finish only', 2.50], ['carpet_tile', 'Carpet tile', 0.50], ['carpet', 'Broadloom carpet', 0.50], ['stain', 'Concrete stain / seal', 1.50]].forEach(function(x){
  C('flr.' + x[0], 'Flooring', x[1] + ' — install labor', 'per SF', { lab: P(x[2], ['FLR', x[0], 'laborRate']) }, (x[0] === 'lvt' || x[0] === 'hardwood_sf') ? { flag: I15 } : null);
});
[['rubber_base', 'Rubber base 4"', 0.35, 0.85], ['rubber_base6', 'Rubber base 6"', 0.35, 1.10], ['cove_base', 'Vinyl cove base', 0.35, 0.70], ['wood_base', 'Wood base', 0.45, 1.20]].forEach(function(x){
  C('flr.' + x[0], 'Flooring', x[1], 'per LF', { lab: P(x[2], ['FLR', x[0], 'laborRate']), mat: P(x[3], ['FLR', x[0], 'matDefault']) });
});
C('flr.concrete_seal', 'Flooring', 'Concrete sealing (by the gallon)', 'per gallon', { lab: P(75, ['FLR', 'concrete_seal', 'laborPerGal']), mat: P(35, ['FLR', 'concrete_seal', 'sealerPerGal']) }, { flag: PAINT50 });
// Roofing
C('roof.reroof1', 'Roofing', 'Tear off 1 layer + install', 'per square', { lab: P(75) });
C('roof.extra', 'Roofing', 'Each extra layer torn off', 'per square', { lab: P(5) });
C('roof.newcon', 'Roofing', 'New construction install (no tear-off)', 'per square', { lab: P(50) });
C('roof.shingle', 'Roofing', 'Shingle material (standard)', 'per square', { mat: P(140) });
C('roof.tpo_mat', 'Roofing', 'TPO material (roofing calculator)', 'per square', { mat: P(350) });
C('roof.tpo_adhered', 'Roofing', 'TPO fully adhered — material + labor', 'per square', { sub: P(950) }, { note: 'TPO calculator.' });
C('roof.tpo_adhered_lab', 'Roofing', 'TPO fully adhered — labor only', 'per square', { lab: P(350) }, { note: 'TPO calculator.' });
C('roof.tpo_mech', 'Roofing', 'TPO mechanically fastened — material + labor', 'per square', { sub: P(650) }, { note: 'TPO calculator.' });
C('roof.tpo_mech_lab', 'Roofing', 'TPO mechanically fastened — labor only', 'per square', { lab: P(250) }, { note: 'TPO calculator.' });
// Crew + hauling
C('crew.laborer', 'General labor / crew', 'Laborer', 'per day', { lab: P(300) }, { flag: I16 });
C('crew.foreman', 'General labor / crew', 'Foreman', 'per day', { lab: P(400) });
C('crew.dump', 'Demolition / hauling', 'Dump trailer load (4 yd)', 'per load', { mat: P(175) });
C('crew.dumpster', 'Demolition / hauling', '30-yd dumpster', 'each', { mat: P(550) }, { flag: I16, note: 'The estimator can type over it per estimate.' });
// Gutters
C('gut.5', 'Gutters', '5" seamless gutter', 'per LF', { mat: P(7.50) }, { flag: I17 });
C('gut.6', 'Gutters', '6" seamless gutter', 'per LF', { mat: P(9.00) }, { flag: I17 });
C('gut.ds1', 'Gutters', 'Downspout — 1 story', 'each', { mat: P(85) }, { aka: ['Downspout — 1 story / 2 story'] });
C('gut.ds2', 'Gutters', 'Downspout — 2 story', 'each', { mat: P(125) });
// ACT extras
C('act.wire', 'Ceilings (ACT)', 'Hanger wire 12ga', 'each', { mat: P(0.779) }, { note: 'A matching Rate Book price wins.' });
C('act.screws', 'Ceilings (ACT)', 'Hanger screws (50-pack)', 'per pack', { mat: P(22) }, { note: 'A matching Rate Book price wins.' });
C('act.simple.grid', 'Ceilings (ACT)', 'Grid (simple ACT calculator default)', 'per LF', { mat: P(0.90) }, { flag: I14 });
C('act.grid.std', 'Ceilings (ACT)', 'ACT grid picked for USG-type tiles (ACT zones)', 'per LF', { mat: P(0.78) }, { note: 'Picked by the tile brand; a matching Rate Book grid price wins.' });
C('act.grid.alt', 'Ceilings (ACT)', 'ACT grid picked for Armstrong-type tiles (ACT zones)', 'per LF', { mat: P(0.88) }, { note: 'Picked by the tile brand; a matching Rate Book grid price wins.' });
C('act.simple.tile', 'Ceilings (ACT)', 'Tile (simple ACT calculator default)', 'per SF', { mat: P(1.20) });
[['2x4', '2×4 tile placeholder (until a product is picked)', 1.50], ['2x2', '2×2 tile placeholder', 1.20], ['4x4', '4×4 tile placeholder', 2.00]].forEach(function(x){ C('act.ph.' + x[0], 'Ceilings (ACT)', x[1], 'per SF', { mat: P(x[2]) }); });
// Flooring extras (the flooring calculator adds them by itself)
function FX(id, a, k){ return id.map(function(r){ return ['FLR', r].concat(a, [k]); }); }
[['underlay', 'LVP / laminate / engineered underlayment', 'per SF', 0.22, FX(['lvp', 'laminate', 'engineered'], ['autoExtras', 0], 'sfRate')],
 ['lvtunder', 'LVT underlayment', 'per SF', 0.18, FX(['lvt'], ['autoExtras', 0], 'sfRate')],
 ['gluebarrier', 'Glue-down moisture barrier', 'per SF', 0.15, FX(['hardwood_glue'], ['autoExtras', 1], 'sfRate')],
 ['rosin', 'Rosin paper', 'per SF', 0.05, FX(['hardwood'], ['autoExtras', 1], 'sfRate')],
 ['adhesive', 'Hardwood adhesive (5-gal pail, 70 SF/gal)', 'per pail', 120, FX(['hardwood_glue', 'engineered_glue'], ['autoExtras', 0], 'pailCost')],
 ['cleats', 'Flooring cleats (1 box per 800 SF)', 'per box', 35, FX(['hardwood'], ['autoExtras', 0], 'flatCost')],
 ['pullbar', 'LVP pull bar / tapping kit', 'per job', 18, FX(['lvp'], ['autoExtras', 1], 'flatCost')],
 ['thinset', 'Thinset 50 lb (1 bag per 70 SF)', 'per bag', 14, FX(['tile_l', 'tile_s'], ['autoExtras', 0], 'flatCost')],
 ['grout', 'Grout 25 lb (1 bag per 300 SF)', 'per bag', 18, FX(['tile_l', 'tile_s'], ['autoExtras', 1], 'flatCost')],
 ['sealer', 'Tile/grout sealer qt (per 200 SF)', 'each', 24, FX(['tile_l', 'tile_s'], ['optExtras', 0], 'flatCost')],
 ['backer', 'Cement backer 3×5 (per 15 SF)', 'per sheet', 13, FX(['tile_l', 'tile_s'], ['optExtras', 1], 'flatCost')],
 ['membrane', 'Crack isolation / waterproof membrane', 'per SF', 0.85, FX(['tile_l', 'tile_s'], ['optExtras', 2], 'sfRate')],
 ['leveler', 'Self-leveler 50 lb (per 50 SF)', 'per bag', 42, FX(['tile_l', 'tile_s'], ['optExtras', 3], 'flatCost')],
 ['schluter', 'Schluter edge 8 ft (per 80 SF)', 'each', 22, FX(['tile_l', 'tile_s'], ['optExtras', 4], 'flatCost')],
 ['ctadhesive', 'Carpet tile adhesive 4-gal (250 SF/gal)', 'per pail', 116, FX(['carpet_tile'], ['autoExtras', 0], 'pailCost')],
 ['pad', 'Carpet pad 8 lb', 'per SF', 0.35, FX(['carpet'], ['autoExtras', 0], 'sfRate')],
 ['tack', 'Carpet tack strip', 'per LF', 0.15, FX(['carpet'], ['autoExtras', 1], 'flatCost')],
 ['stain', 'Concrete stain (1 gal per 200 SF)', 'per gal', 45, FX(['stain'], ['autoExtras', 0], 'flatCost')],
 ['csealer', 'Concrete sealer (1 gal per 250 SF)', 'per gal', 38, FX(['stain'], ['autoExtras', 1], 'flatCost')]].forEach(function(x){
  C('flr.x.' + x[0], 'Flooring', x[1], x[2], { mat: P(x[3], x[4]) }, { note: 'Added by the flooring calculator.' });
});
C('flr.quick.lvt', 'Flooring', 'LVT install (Quick build)', 'per SF', { lab: P(1.00) }, { flag: I15, note: 'Quick build only; the flooring calculator uses LVT glue-down above.' });
C('flr.base.labor', 'Flooring', 'Base install labor (base calculator)', 'per LF', { lab: P(0.35) }, { box: { lab: 'flr-base-labor' } });
// Tile, counters, FRP
C('tile.thinset', 'Tile & bath', 'Thinset (tile calculator: 1 bag per 95 SF)', 'per bag', { mat: P(14) }, { note: 'A matching Rate Book price wins.' });
C('tile.grout', 'Tile & bath', 'Grout (tile calculator: 1 bag per 200 SF)', 'per bag', { mat: P(18) }, { note: 'A matching Rate Book price wins.' });
C('tile.screws', 'Tile & bath', 'Backer board screws (per 200 SF)', 'per box', { mat: P(9) }, { note: 'A matching Rate Book price wins.' });
[['cem14_3x5', 'Durock 1/4" 3x5', 13], ['cem12_3x5', 'Durock 1/2" 3x5', 15], ['fib14_3x5', 'HardieBacker 1/4" 3x5', 14], ['cem_4x8', 'Cement board 4x8', 15]].forEach(function(x){
  C('tile.backer.' + x[0], 'Tile & bath', 'Backer board ' + x[1] + ' (tile calculator board list)', 'per sheet', { mat: P(x[2], ['TLB', x[1], 'price']) }, { note: 'The tile calculator\u2019s backer-board list (boards an estimator adds himself keep his price).' });
});
C('gr.counter', 'Tile & bath', 'Granite / stone counter', 'per SF', { lab: P(25), mat: P(26) }, { box: { lab: 'gr-labor', mat: 'gr-mat' } });
C('gr.cutout', 'Tile & bath', 'Counter cutout (sink / cooktop)', 'each', { lab: P(150) }, { box: { lab: 'gr-cut-cost' } });
C('gr.delivery', 'Tile & bath', 'Counter delivery', 'flat', { sub: P(150) }, { box: { sub: 'gr-del' } });
C('frp.panel', 'Tile & bath', 'FRP panel', 'per SF', { mat: P(1.75) }, { note: 'A matching Rate Book price wins.' });
C('frp.install', 'Tile & bath', 'FRP install', 'per 4×8 sheet', { lab: P(20) }, { box: { lab: 'frp-sheetrate' } });
C('frp.glue', 'Tile & bath', 'FRP adhesive (70 SF/gal)', 'per gallon', { mat: P(28) }, { note: 'A matching Rate Book price wins.' });
C('frp.trim', 'Tile & bath', 'FRP trim', 'per LF', { lab: P(2) }, { box: { lab: 'frp-trimrate' } });
// Insulation
C('ins.wall', 'Insulation', 'Wall insulation (labor + material)', 'per SF', { lab: P(1.10) }, { rbAlso: { lab: 'Insulation walls' } });
C('ins.ceiling', 'Insulation', 'Ceiling insulation (labor + material)', 'per SF', { lab: P(1.15) }, { box: { lab: 'ins-clg-rate' }, rbAlso: { lab: 'Insulation ceiling' } });
C('ins.sab', 'Insulation', 'Spray / SAB wall option', 'per SF', { lab: P(1.20) });
// Concrete, masonry
C('con.readymix', 'Concrete', 'Ready-mix concrete', 'per cubic yard', { mat: P(240) }, { flag: I13, box: { mat: 'con-mat' }, note: 'A Rate Book ready-mix price wins when the pour type is changed.' });
C('con.slab', 'Concrete', 'House slab with footer — labor', 'per cubic yard', { lab: P(250) }, { box: { lab: 'con-lab' } });
C('con.flat', 'Concrete', 'Flatwork / driveway / sidewalk — labor', 'per cubic yard', { lab: P(230) });
C('con.laboronly', 'Concrete', 'Labor only (no material)', 'see note', { lab: P(2) }, { flag: I13 + ' — labeled $/SF, multiplied by cubic yards' });
C('con.pump', 'Concrete', 'Pump truck', 'flat', { sub: P(800) }, { opt: { sub: ['con-pump', '800'] } });
C('con.pump.lg', 'Concrete', 'Large pump truck', 'flat', { sub: P(1200) }, { opt: { sub: ['con-pump', '1200'] } });
C('mas.brick', 'Masonry', 'Brick labor + all materials (sand, mortar etc.)', 'per brick', { lab: P(0.45), mat: P(0.90) }, { aka: ['Brick labor', 'Brick all materials (sand, mortar etc.)'], box: { lab: 'mas-labor', mat: 'mas-matcost' }, rbAlso: { lab: 'Brick labor', mat: 'Brick all materials' } });
C('mas.cmu', 'Masonry', 'CMU 8×8×16 block', 'per block', { mat: P(6.50) }, { flag: I18, box: { mat: 'cmu-cost' } });
// Windows & doors
C('win.install', 'Windows & doors', 'Window install', 'per window', { lab: P(150) }, { box: { lab: 'win-lab' }, rbAlso: { lab: 'Window install labor' } });
C('win.mat', 'Windows & doors', 'Window material (windows calculator box)', 'per window', { mat: P(150) }, { box: { mat: 'win-mat' } });
[['closer', 'Door closer', 85], ['stop', 'Door stop', 8], ['kick', 'Kick plate 10"', 22], ['push_pull', 'Push/pull set', 55], ['lever', 'Lever handle set', 45], ['deadbolt', 'Deadbolt', 38], ['panic', 'Panic bar / exit device', 185],
 ['frame', 'HM frame (knock-down)', 95], ['threshold', 'Threshold', 28], ['weatherstrip', 'Weatherstripping set', 18], ['overhead', 'Overhead closer (surface)', 120]].forEach(function(x){
  C('door.' + x[0], 'Windows & doors', 'Door hardware — ' + x[1], 'each', { mat: P(x[2], ['DOOR', x[0], 'cost']) });
});
// Other trades
C('ply.labor', 'General labor / crew', 'Plywood / OSB install', 'per sheet', { lab: P(20) });
[['ply_1_4', '1/4" plywood', 22], ['ply_3_8', '3/8" plywood', 28], ['ply_1_2', '1/2" plywood', 32], ['ply_5_8', '5/8" plywood', 38], ['ply_3_4', '3/4" plywood', 45], ['ply_1', '1" plywood (2-layer)', 58],
 ['ply_osb_7_16', '7/16" OSB', 18], ['ply_osb_1_2', '1/2" OSB', 20], ['ply_osb_3_4', '3/4" OSB', 28]].forEach(function(x){
  C('ply.' + x[0].slice(4), 'General labor / crew', 'Sheet ' + x[1] + ' (plywood calculator)', 'per sheet', { mat: P(x[2], ['PLY', x[0], 'cost']) });
});
C('trim.labor', 'General labor / crew', 'Trim install', 'per LF', { lab: P(1.00) }, { box: { lab: 'trim-labor-lf' } });
C('trim.putty', 'General labor / crew', 'Wood putty / filler (trim calculator, one per job)', 'each', { mat: P(10) });
[['finish_2in', '2" 18ga finish nails — 2,500/box', 27.78], ['finish_2.5in', '2.5" 18ga finish nails — 2,500/box', 24.98], ['brad_1.75in', '1-3/4" brad nails — 2,500/box', 24.98], ['galv_3in', '3" galvanized framing nails — 4,000/box', 88.98]].forEach(function(x){
  C('trim.nail.' + x[0], 'General labor / crew', 'Trim nails: ' + x[1], 'per box', { mat: P(x[2]) }, { dopt: { mat: ['trim-nail-type', x[0]] } });
});
[['alex', 'Fast-dry white caulk', 4.98], ['paintable', 'Paintable latex caulk', 5.98], ['dynaflex', 'Premium elastomeric caulk', 8.78]].forEach(function(x){
  C('trim.caulk.' + x[0], 'General labor / crew', 'Trim caulk: ' + x[1], 'per tube', { mat: P(x[2]) }, { dopt: { mat: ['trim-caulk-type', x[0]] } });
});
C('stucco.sf', 'General labor / crew', 'Stucco labor + materials', 'per SF', { sub: P(18) }, { box: { sub: 'stu-rate' }, rbAlso: { sub: 'Stucco labor + materials' } });
C('metalbldg.sf', 'General labor / crew', 'Metal building install labor', 'per SF', { sub: P(13) }, { box: { sub: 'mb-rate' }, rbAlso: { sub: 'Metal building install labor' } });
C('travel.mile', 'Travel', 'Mileage', 'per mile', { mat: P(0.70) }, { box: { mat: 'tv-mrate' } });

C('check.products', 'Open questions', 'Products to check: admin edits that look like a unit mix-up (1/2" drywall 4×8 board at a hang + finish price; 2×6×10 at a per-LF price)', 'see Products', {}, { info: true, flag: I12, note: 'Shown, not changed: fix them in Products (the materials catalog). The live list is in the orange box above the prices.' });
C('check.index', 'Open questions', 'Products follow the national price index every month', '—', {}, { info: true, flag: I19, note: 'The Price Book is not moved by the index: estimate prices live here, not in Products.' });
C('check.import', 'Open questions', 'The built-in supplier price list ("Import supplier prices")', '—', {}, { info: true, flag: I20, note: 'It no longer overwrites a Price Book price without showing old → new and asking.' });

/* builder prices this list does not hold (each says why) */
var NOT_WIRED = ['Man-hour lines ($44.44 cost / $75 charge) — Settings → man-hours (a rate, not a calculator price)', 'Website instant roof quote — Leads → Website → Roof prices (not the builder)',
  'Insurance price book (Xactimate codes) — its own screen', 'Universal calculator — no built-in prices (the estimator types qty × rate)',
  'Saved framing zones made before this update keep the rate they were saved with (old estimates never change)'];
var BYID = {}; ITEMS.forEach(function(it){ BYID[it.id] = it; });
var BYNAME = {}; ITEMS.forEach(function(it){ [it.item].concat(arr(it.aka)).forEach(function(n){ var k = norm(n); if (k && !BYNAME[k]) BYNAME[k] = it; }); });

/* Rate Book rows that belong to an open question */
var RBFLAG = [[/^(paint interior|paint material|paint exterior|prime drywall)/i, I3], [/^drywall 4x(8|12) hang/i, I11], [/^acoustical ceiling/i, I14], [/^(lvt install|hardwood sand)/i, I15],
  [/^(crew day rate|dumpster)/i, I16], [/^gutters/i, I17], [/^cmu/i, I18], [/^concrete (material|labor)/i, I13], [/^framing labor (large|medium|small)/i, I7]];
function rbFlag(desc){ for (var i = 0; i < RBFLAG.length; i++) if (RBFLAG[i][0].test(desc)) return RBFLAG[i][1]; return ''; }
function rbField(type){ return type === 'labor' ? 'lab' : type === 'material' ? 'mat' : 'sub'; }
function rbId(desc){ return 'rb:' + norm(desc); }

/* ═══ 2. the tables the calculators read ═══ */
function table(n){
  try {
    if (n === 'PT') return typeof PT_TYPES !== 'undefined' ? PT_TYPES : null;
    if (n === 'DW') return typeof DW_SIZES !== 'undefined' ? DW_SIZES : null;
    if (n === 'DWT') return typeof DW_TYPES !== 'undefined' ? DW_TYPES : null;
    if (n === 'FLR') return typeof FLR_TYPES !== 'undefined' ? FLR_TYPES : null;
    if (n === 'ACT') return typeof ACT_LABOR !== 'undefined' ? ACT_LABOR : null;
    if (n === 'DOOR') return typeof DOOR_ACC !== 'undefined' ? DOOR_ACC : null;
    if (n === 'PLY') return typeof PLY_THICKNESSES !== 'undefined' ? PLY_THICKNESSES : null;
    if (n === 'TLB') return typeof tlBoards !== 'undefined' ? tlBoards : null;
  } catch (e) {}
  return null;
}
/* b = [table, row (id, or key, or null = the table), …path…, key]; returns the object that holds the key */
function target(b){
  var t = table(b[0]), o = null; if (!t) return null;
  if (Array.isArray(t)) { for (var i = 0; i < t.length; i++) if (t[i] && (t[i].id === b[1] || (t[i].id == null && t[i].name === b[1]))) { o = t[i]; break; } }
  else o = b[1] == null ? t : (t[b[1]] || null);
  for (var j = 2; o && j < b.length - 1; j++) o = o[b[j]];
  return o && typeof o === 'object' ? o : null;
}
function binds(p){ return !p || !p.b ? [] : (Array.isArray(p.b[0]) ? p.b : [p.b]); }
var DEF = {};   /* what the tables held before this file touched them (= today's numbers) */
function defOf(it, f){
  var k = it.id + '.' + f, p = it.f[f];
  if (k in DEF) return DEF[k];
  var bb = binds(p)[0]; if (bb) { var o = target(bb); if (o && typeof o[bb[bb.length - 1]] === 'number') { DEF[k] = o[bb[bb.length - 1]]; return DEF[k]; } }
  return p ? p.d : null;
}
ITEMS.forEach(function(it){ Object.keys(it.f).forEach(function(f){ defOf(it, f); }); });

/* ═══ 3. the book ═══ */
var BOOK = (function(){ try { var b = JSON.parse(lsGet(LS) || 'null'); return b && typeof b === 'object' ? b : null; } catch (e) { return null; } })();
W.__GC_PB_CACHE__ = BOOK;
function bookVal(id, f){ var it = BOOK && BOOK.items && BOOK.items[id], v = it ? it[f] : null; return (typeof v === 'number' && isFinite(v)) ? v : null; }
function cur(it, f){ var v = it.info ? null : bookVal(it.id, f); return v != null ? v : defOf(it, f); }
var ACT_LBL0 = null;

function overlay(){
  ITEMS.forEach(function(it){
    if (it.info) return;
    Object.keys(it.f).forEach(function(f){
      var p = it.f[f], d = defOf(it, f), v = bookVal(it.id, f);
      binds(p).forEach(function(bb){ var o = target(bb); if (o) o[bb[bb.length - 1]] = v != null ? v : d; });
    });
  });
  try {   /* the ACT labor dropdown shows the price */
    if (typeof ACT_LABOR_LABELS !== 'undefined') {
      if (!ACT_LBL0) ACT_LBL0 = Object.assign({}, ACT_LABOR_LABELS);
      Object.keys(ACT_LBL0).forEach(function(k){
        var it = BYID['act.' + k]; if (!it) return;
        var d = defOf(it, 'lab'), v = cur(it, 'lab');
        ACT_LABOR_LABELS[k] = ACT_LBL0[k].replace('$' + short(d) + '/SF', '$' + short(v) + '/SF');
      });
    }
  } catch (e) {}
  applySettings();
  applyRB();
  relabel();
}

/* the builder's margins + tax: the cloud copy wins on every computer */
var BUILDER_READY = false;
function builderSettings(){ try { return typeof settings !== 'undefined' && settings && typeof settings === 'object' ? settings : null; } catch (e) { return null; } }
function applySettings(){
  var c = BOOK && BOOK.settings, st = builderSettings(); if (!c || !st) return false;
  var ch = false;
  function put(k, v){ v = num(v); if (v == null) return; if (st[k] !== v) { st[k] = v; ch = true; } }
  put('tax', c.tax); put('comMarginPct', c.comMarginPct); put('comSmallMarginPct', c.comSmallMarginPct); put('msContractorTax', c.msContractorTax);
  var mp = num(c.marginPct);
  if (mp != null) {
    put('marginPct', mp);
    var mm = typeof W._gcMarginMult === 'function' ? W._gcMarginMult(mp) : Math.round(1e4 / (1 - mp / 100)) / 1e4;
    ['matMult', 'labMult', 'subMult', 'eqMult'].forEach(function(k){ put(k, mm); });
    st.marginDefaultV = st.marginDefaultV || '30';
  }
  if (ch && BUILDER_READY) {
    try { if (typeof saveSettingsDB === 'function') saveSettingsDB(); } catch (e) {}
    try { if (typeof loadSettingsUI === 'function' && D.getElementById('set-tax')) loadSettingsUI(); } catch (e) {}
    try { if (typeof updSettingsPreview === 'function' && D.getElementById('settings-preview')) updSettingsPreview(); } catch (e) {}
    try { if (typeof updPricingInfo === 'function' && D.getElementById('pricing-info')) updPricingInfo(); } catch (e) {}
    try { if (typeof renderLines === 'function') renderLines(); if (typeof renderSummary === 'function') renderSummary(); } catch (e) {}
  }
  return ch;
}

/* Rate Book prices set in the Price Book reach this computer's Rate Book once per change (a later hand edit in the
   Rate Book stays) */
function rbChangesSince(v0){
  var out = {}, L = arr(BOOK && BOOK.log), oldest = L.length ? L[0].v : 1;
  if (v0 < oldest - 1) {   /* the log was trimmed past this computer: take the Price Book's own Rate Book prices */
    Object.keys((BOOK && BOOK.items) || {}).forEach(function(id){ if (id.indexOf('rb:') === 0) { var it = BOOK.items[id]; ['lab', 'mat', 'sub'].forEach(function(f){ if (typeof it[f] === 'number') out[id] = it[f]; }); } });
    return out;
  }
  L.forEach(function(e){ if (!(e && e.v > v0)) return; arr(e.ch).forEach(function(c){ if (c && s(c.id).indexOf('rb:') === 0 && typeof c.n === 'number') out[c.id] = c.n; }); });
  return out;
}
var rbBusy = false;
function applyRB(){
  if (!BOOK || rbBusy) return;
  var done = parseInt(lsGet(RBV) || '0', 10) || 0, ver = BOOK.version || 0;
  if (done >= ver) return;
  var want = rbChangesSince(done), ids = Object.keys(want);
  if (!ids.length) { lsSet(RBV, String(ver)); return; }
  function fix(list){ var n = 0; arr(list).forEach(function(r){ if (!r || !r.desc) return; var id = rbId(r.desc); if (id in want && r.cost !== want[id]) { r.cost = want[id]; r.date = new Date().toISOString().slice(0, 10); n++; } }); return n; }
  if (BUILDER_READY) {
    try {
      var n = fix(rates);
      if (n) { try { saveRatesDB(); } catch (e) {} try { if (typeof refreshCalcDropdowns === 'function') refreshCalcDropdowns(); } catch (e) {} try { if (typeof renderRB === 'function' && D.getElementById('tab-rates')) renderRB(); } catch (e) {} }
      lsSet(RBV, String(ver));
    } catch (e) {}
    return;
  }
  if (!W.storage || typeof W.storage.get !== 'function') return;
  rbBusy = true;
  W.storage.get('gc_rates_v3', true).then(function(r){
    var list = null; try { list = r && r.value ? JSON.parse(r.value) : null; } catch (e) {}
    if (!Array.isArray(list) || !list.length) { rbBusy = false; return; }   /* not on this computer yet: the builder's own start does it */
    var n = fix(list);
    return (n ? W.storage.set('gc_rates_v3', JSON.stringify(list), true) : Promise.resolve()).then(function(){ lsSet(RBV, String(ver)); rbBusy = false; });
  }).catch(function(){ rbBusy = false; });
}
/* "Import supplier prices": a Rate Book row whose price the Price Book holds is not overwritten without asking */
W._gcPBHeld = function(desc, cost){
  var it = BOOK && BOOK.items && BOOK.items[rbId(desc)]; if (!it) return false;
  var v = typeof it.lab === 'number' ? it.lab : typeof it.mat === 'number' ? it.mat : it.sub;
  return typeof v === 'number' && Math.abs(v - (parseFloat(cost) || 0)) > 1e-6;
};

/* labels in the calculators that print a price */
var LABELS = [
  ['#fr-labor-opt option[value="wall_lf"]', '$5.00', 'frame.metal.wall', 'lab', 2],
  ['#fr-labor-opt option[value="partition"]', '$1.00', 'frame.metal.mat', 'lab', 2], ['#fr-labor-opt option[value="partition_075"]', '$0.75', 'frame.metal.mat075', 'lab', 2],
  ['#fr-labor-opt option[value="4.50"]', '$4.50', 'frame.large', 'lab', 2], ['#fr-labor-opt option[value="5.00"]', '$5.00', 'frame.medium', 'lab', 2], ['#fr-labor-opt option[value="5.50"]', '$5.50', 'frame.small', 'lab', 2],
  ['#fr-labor-opt option[value="8.00"]', '$8.00', 'frame.addition', 'lab', 2], ['#fr-labor-opt option[value="9.00"]', '$9.00', 'frame.reno', 'lab', 2], ['#fr-labor-opt option[value="2.00"]', '$2.00', 'frame.ti', 'lab', 2],
  ['#gut-size option[value="5"]', '$7.50', 'gut.5', 'mat', 2], ['#gut-size option[value="6"]', '$9.00', 'gut.6', 'mat', 2],
  ['#tpo-type option[value="950_mat_lab"]', '$950', 'roof.tpo_adhered', 'sub', 0], ['#tpo-type option[value="350_labor"]', '$350', 'roof.tpo_adhered_lab', 'lab', 0],
  ['#tpo-type option[value="650_mat_lab"]', '$650', 'roof.tpo_mech', 'sub', 0], ['#tpo-type option[value="250_labor"]', '$250', 'roof.tpo_mech_lab', 'lab', 0],
  [function(){ var i = D.getElementById('cr-guys'); return i && i.parentNode && i.parentNode.querySelector('label'); }, '$300', 'crew.laborer', 'lab', 0],
  [function(){ var i = D.getElementById('cr-fore'); return i && i.parentNode && i.parentNode.querySelector('label'); }, '$400', 'crew.foreman', 'lab', 0],
  [function(){ var i = D.getElementById('cr-dump'); return i && i.parentNode && i.parentNode.querySelector('label'); }, '$175', 'crew.dump', 'mat', 0],
  [function(){ var i = D.getElementById('cr-dumpster-rate'); return i && i.parentNode && i.parentNode.querySelector('label'); }, '$550', 'crew.dumpster', 'mat', 0],
  /* Quick build flooring (the LVT label said $1.25 while it charged $1.00: it now always shows the price it charges) */
  ['#qb-flrtype option[value="lvp"]', '$1.50', 'flr.lvp', 'lab', 2], ['#qb-flrtype option[value="lvt"]', '$1.25', 'flr.quick.lvt', 'lab', 2, true],
  ['#qb-flrtype option[value="tile_l"]', '$3', 'flr.tile_l', 'lab', 0], ['#qb-flrtype option[value="tile_s"]', '$4', 'flr.tile_s', 'lab', 0], ['#qb-flrtype option[value="hardwood"]', '$2', 'flr.hardwood', 'lab', 0]
];
function relabel(){
  if (!D.getElementById('gc-est-wrap')) return;
  LABELS.forEach(function(L){
    var el = typeof L[0] === 'function' ? L[0]() : D.querySelector(L[0]); if (!el) return;
    if (el.getAttribute('data-pb0') == null) el.setAttribute('data-pb0', el.innerHTML);
    var it = BYID[L[2]], v = cur(it, L[3]), d = defOf(it, L[3]);
    var txt = el.getAttribute('data-pb0');
    var nw = v === d && !L[5] ? txt : txt.split(L[1]).join('$' + (L[4] ? v.toFixed(2) : short(v)));
    if (el.innerHTML !== nw) el.innerHTML = nw;
  });
  var dr = D.getElementById('cr-dumpster-rate'); if (dr) { var v = cur(BYID['crew.dumpster'], 'mat'); if (dr.placeholder !== short(v)) dr.placeholder = short(v); }
  ITEMS.forEach(function(it){
    if (it.box) Object.keys(it.box).forEach(function(f){ syncBox(it.box[f], cur(it, f)); });
    [it.opt, it.opt2].forEach(function(op){ if (op) Object.keys(op).forEach(function(f){ syncOpt(op[f][0], op[f][1], cur(it, f), defOf(it, f)); }); });
    if (it.dopt) Object.keys(it.dopt).forEach(function(f){ syncDOpt(it.dopt[f][0], it.dopt[f][1], cur(it, f), defOf(it, f)); });
  });
}
/* a calculator box that starts with a price: it shows the Price Book price until the estimator types his own */
function syncBox(id, v){
  var el = D.getElementById(id); if (!el || v == null) return;
  if (el.getAttribute('data-pb0') == null) el.setAttribute('data-pb0', el.value);
  var last = el.getAttribute('data-pbs'), base = last != null ? last : el.getAttribute('data-pb0');
  if (el.value !== base || parseFloat(el.value) === v) return;
  var want = short(v); el.value = want; el.setAttribute('data-pbs', want);
}
/* a pick list whose option value is the price */
function syncOpt(selId, v0, v, d){
  var sel = D.getElementById(selId); if (!sel) return;
  var o = Array.prototype.filter.call(sel.options, function(x){ return x.getAttribute('data-pbv0') === v0; })[0]
    || Array.prototype.filter.call(sel.options, function(x){ return x.getAttribute('data-pbv0') == null && x.value === v0; })[0];
  if (!o) return;
  if (o.getAttribute('data-pbv0') == null) { o.setAttribute('data-pbv0', v0); o.setAttribute('data-pbl0', o.innerHTML); }
  var dec = Math.max(2, (v0.split('.')[1] || '').length), nv = v === d ? v0 : v.toFixed(dec);
  if (o.value !== nv) o.value = nv;
  var l0 = o.getAttribute('data-pbl0'), n0 = Number(v0), lbl = l0.split('$' + v0).join('$' + nv);
  if (v !== d && n0 >= 1000) lbl = lbl.split('$' + n0.toLocaleString('en-US')).join('$' + Number(nv).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  if (o.innerHTML !== lbl) o.innerHTML = lbl;
}
/* a pick list whose option carries the price in data-cost (trim nails, caulk) */
function syncDOpt(selId, val, v, d){
  var sel = D.getElementById(selId); if (!sel) return;
  var o = Array.prototype.filter.call(sel.options, function(x){ return x.value === val; })[0]; if (!o) return;
  if (o.getAttribute('data-pbc0') == null) { o.setAttribute('data-pbc0', o.getAttribute('data-cost') || ''); o.setAttribute('data-pbl0', o.innerHTML); }
  var c0 = o.getAttribute('data-pbc0'), nc = v === d ? c0 : String(v), lbl = v === d ? o.getAttribute('data-pbl0') : o.getAttribute('data-pbl0').split('$' + c0).join('$' + v.toFixed(2));
  if (o.getAttribute('data-cost') !== nc) o.setAttribute('data-cost', nc);
  if (o.innerHTML !== lbl) o.innerHTML = lbl;
}

/* ═══ 4. the cloud ═══ */
function creds(){ return { u: s(lsGet('grayco_sb_url')).replace(/\/$/, ''), k: s(lsGet('grayco_sb_key')) }; }
/* { ok, value } — ok false = the cloud could not be asked (never treated as "no Price Book") */
function cloudRead(){
  var c = creds();
  if (!c.u || !c.k || typeof W.fetch !== 'function') {
    if (typeof W._gcCloudGet === 'function') return W._gcCloudGet(KEY).then(function(v){ return { ok: v != null, value: v }; }, function(){ return { ok: false }; });
    return Promise.resolve({ ok: false });
  }
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(KEY) + '&select=value', { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ if (!r.ok) return { ok: false }; return r.json().then(function(rows){
      if (!Array.isArray(rows)) return { ok: false };
      var v = rows.length ? rows[0].value : null;
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      return { ok: true, value: v && typeof v === 'object' ? v : null };
    }); }).catch(function(){ return { ok: false }; });
}
/* straight to gc_kv (not through the app's save queue, which waits while someone is typing): the Price Book is
   read back before every write and the version checked, so a write must land now or be reported */
function cloudWrite(val){
  var c = creds();
  if (c.u && c.k && typeof W.fetch === 'function') {
    return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, Authorization: 'Bearer ' + c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: KEY, value: val, updated_at: new Date().toISOString() }) })
      .then(function(r){ if (!r.ok) throw new Error('The cloud answered ' + r.status + ' — nothing was changed.'); return true; });
  }
  var f = typeof W._supaUpsertNow === 'function' ? W._supaUpsertNow : W._supaUpsert;
  if (typeof f !== 'function') return Promise.reject(new Error('The cloud is not connected on this computer.'));
  return Promise.resolve(f(KEY, val)).then(function(res){ if (res && typeof res.ok === 'boolean' && !res.ok) throw new Error('The cloud answered ' + res.status + '.'); return true; });
}
function rbRowOf(id){
  var r = arr(RBC).filter(function(x){ return x.id === id; })[0]; if (r) return { desc: r.desc, cost: r.cost };
  try { var q = arr(rates).filter(function(x){ return x && rbId(x.desc) === id; })[0]; if (q) return { desc: s(q.desc), cost: parseFloat(q.cost) || 0 }; } catch (e) {}
  return null;
}
function take(b){
  if (!b || typeof b !== 'object') return false;
  var same = BOOK && BOOK.version === b.version && BOOK.updatedAt === b.updatedAt;
  BOOK = b; W.__GC_PB_CACHE__ = b;
  try { lsSet(LS, JSON.stringify(b)); } catch (e) {}
  overlay();
  if (!same) { paintBanner(); try { if (UI.ov) UI.render(); } catch (e) {} }
  return !same;
}
var refreshing = null, lastRefresh = 0, seeding = false;
function refresh(){
  if (refreshing) return refreshing;
  refreshing = cloudRead().then(function(r){
    refreshing = null; lastRefresh = Date.now();
    if (!r.ok) return false;
    if (r.value) take(r.value);
    if (isAdmin() && !seeding && !(r.value && r.value.settings)) {   /* margins + tax move to the cloud once, with the owner's values */
      seeding = true;
      save({ settings: OWNER_SETTINGS, src: 'settings', note: 'Margins and sales tax moved to the cloud — the same on every computer (residential and insurance 30%, commercial $500,000 or less 25%, large commercial 20%, sales tax 9.75%).', quiet: true })
        .then(function(){ seeding = false; }, function(){ seeding = false; });
    }
    return true;
  }, function(){ refreshing = null; return false; });
  return refreshing;
}
/* changes = { items: [{ id, f, n }] (n null = back to the built-in price), settings: {…}, src, note }
   read the newest copy, apply the changes on top, write it back (two admins at once both keep their changes) */
function save(chg){
  return cloudRead().then(function(r){
    if (!r.ok) throw new Error('Could not reach the cloud — nothing was changed. Check the internet connection and try again.');
    var base = r.value && typeof r.value === 'object' ? JSON.parse(JSON.stringify(r.value)) : { schema: 1, version: 0, items: {}, log: [] };
    base.items = base.items && typeof base.items === 'object' ? base.items : {};
    var ch = [], stored = 0;
    arr(chg.items).forEach(function(c){
      var it = BYID[c.id], rb = s(c.id).indexOf('rb:') === 0;
      if (!it && !rb) return; if (it && it.info) return;
      var rr = rb ? rbRowOf(c.id) : null, row = base.items[c.id] || {}, o = typeof row[c.f] === 'number' ? row[c.f] : (it ? defOf(it, c.f) : (c.o != null ? c.o : rr ? rr.cost : null));
      var n = c.n == null ? null : r4(c.n), before = row[c.f];
      if (n == null) { if (rb) return; delete row[c.f]; } else row[c.f] = n;
      if (row[c.f] !== before) stored++;
      if (Object.keys(row).length) base.items[c.id] = row; else delete base.items[c.id];
      var nn = n == null ? defOf(it, c.f) : n;
      if (o === nn && n != null) return;
      ch.push({ id: c.id, item: it ? it.item : (s(c.item) || (rr ? rr.desc : c.id.slice(3))), f: c.f, o: o, n: nn });
    });
    var sch = [];
    if (chg.settings) {
      var old = base.settings || {};
      base.settings = Object.assign({}, OWNER_SETTINGS, old);
      Object.keys(chg.settings).forEach(function(k){ var v = num(chg.settings[k]); if (v == null || !(k in OWNER_SETTINGS)) return; var o = num(old[k]) != null ? num(old[k]) : OWNER_SETTINGS[k]; base.settings[k] = v; if (o !== v) sch.push({ id: 'set:' + k, item: SETL[k] || k, f: 'pct', o: o, n: v }); });
    }
    var firstSettings = !!chg.settings && !(r.value && r.value.settings);
    if (!ch.length && !sch.length && !firstSettings && !stored) return { book: base, changed: 0, unchanged: true };
    base.schema = 1; base.version = (base.version || 0) + 1; base.updatedAt = new Date().toISOString(); base.updatedBy = myName(); base.updatedByEmail = myEmail();
    var all = ch.concat(sch);
    base.log = arr(base.log).concat([{ v: base.version, at: base.updatedAt, by: base.updatedBy, email: base.updatedByEmail, src: s(chg.src) || 'edit', note: s(chg.note), n: all.length, ch: all.slice(0, 400), quiet: !!chg.quiet }]).slice(-60);
    return cloudWrite(base).then(function(){
      if (ch.some(function(c){ return c.id.indexOf('rb:') === 0; })) { /* this computer's Rate Book now, others on their next sync */ }
      take(base);
      return { book: base, changed: all.length };
    });
  });
}
var SETL = { marginPct: 'Residential and insurance margin (%)', comSmallMarginPct: 'Commercial, $500,000 or less — margin (%)', comMarginPct: 'Large commercial, over $500,000 — margin (%)', tax: 'Sales tax on materials (%)', msContractorTax: 'Mississippi contractor tax (%)' };

/* a Rate Book row an admin saves in the builder's Rate Book tab becomes the Price Book's price (one source) */
W._gcPBRateSaved = function(desc, cost, type){
  if (!isAdmin() || !s(desc)) return;
  var n = parseFloat(cost); if (!isFinite(n) || n < 0) return;
  save({ items: [{ id: rbId(desc), f: rbField(type), n: n, item: s(desc) }], src: 'Rate Book tab', note: 'Saved in the Estimate Builder → Rate Book tab.' }).catch(function(){});
};
/* builder start (after its own settings load) */
W._gcPBInit = function(){ BUILDER_READY = true; overlay(); STO.call(W, function(){ refresh(); }, 50); };
/* an admin changed the builder's Settings tab: send it to every computer (a second later, after the typing) */
var setT = null;
W._gcPBSettingsSaved = function(){
  if (!isAdmin()) return;
  var st = builderSettings(); if (!st) return;
  if (setT) clearTimeout(setT);
  setT = STO.call(W, function(){
    setT = null;
    var want = { marginPct: st.marginPct, comSmallMarginPct: st.comSmallMarginPct, comMarginPct: st.comMarginPct, tax: st.tax, msContractorTax: st.msContractorTax };
    var c = (BOOK && BOOK.settings) || {}, diff = Object.keys(want).some(function(k){ return num(want[k]) != null && num(want[k]) !== num(c[k]); });
    if (diff) save({ settings: want, src: 'builder settings', note: 'Changed in the Estimate Builder → Settings.' }).catch(function(){});
  }, 1500);
};

/* ═══ 5. reading a price sheet (.xlsx from the review, or .csv) ═══ */
function parseCSV(text){
  var rows = [], row = [], f = '', q = false, i, c;
  text = String(text || '').replace(/^﻿/, '');
  for (i = 0; i < text.length; i++) {
    c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function sheetJS(){
  if (W.XLSX && W.XLSX.read) return Promise.resolve(W.XLSX);
  if (W.__gcSheetJS && W.__gcSheetJS.read) return Promise.resolve(W.__gcSheetJS);
  return new Promise(function(res, rej){ var sc = D.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = function(){ res(W.XLSX); }; sc.onerror = function(){ rej(new Error('The Excel reader could not load. Save the sheet as CSV and upload that.')); }; D.head.appendChild(sc); });
}
/* file -> [{ name, rows }] */
function readFile(file){
  var nm = s(file && file.name).toLowerCase();
  if (/\.xlsx?$/.test(nm)) {
    return sheetJS().then(function(X){
      return file.arrayBuffer().then(function(buf){
        var wb = X.read(new Uint8Array(buf), { type: 'array' });
        return wb.SheetNames.map(function(n){ return { name: n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }; });
      });
    });
  }
  return file.text().then(function(t){ return [{ name: file.name || 'CSV', rows: parseCSV(t) }]; });
}
/* sheets -> { rows: [{ sheet, r, id, cat, item, src, old:{}, nw:{} }], margins: [{ key, rule, n }], ignored: [{ sheet, n }] } */
function parse(sheets){
  var out = { rows: [], margins: [], ignored: [] };
  arr(sheets).forEach(function(sh){
    var R = arr(sh.rows), hi = -1, H = null;
    for (var i = 0; i < Math.min(8, R.length); i++) { var h = arr(R[i]).map(function(x){ return norm(x); }); if (h.indexOf('item') >= 0 || h.indexOf('id') >= 0 || h.indexOf('rule') >= 0) { hi = i; H = h; break; } }
    if (hi < 0) return;
    function col(re){ for (var j = 0; j < H.length; j++) if (re.test(H[j])) return j; return -1; }
    if (H.indexOf('rule') >= 0) {   /* the Margins sheet */
      var cr = col(/^rule$/), cn = col(/^new value$/), cv = col(/^current value$/);
      if (cn < 0 && cv < 0) return;
      for (var k = hi + 1; k < R.length; k++) {
        var pc = function(j){ var t0 = j >= 0 ? R[k][j] : ''; if (typeof t0 === 'number') return t0 <= 1 && t0 > 0 ? t0 * 100 : t0; var m0 = /(-?\d+(?:\.\d+)?)\s*%/.exec(s(t0)); return m0 ? parseFloat(m0[1]) : null; };
        var rule = s(R[k][cr]), nv = pc(cn), mm = nv != null ? [0, nv] : (pc(cv) != null ? [0, pc(cv)] : null), key = '';
        if (!rule || !mm) continue;
        if (/insurance/i.test(rule)) key = 'insurance';
        else if (/large commercial/i.test(rule)) key = 'comMarginPct';
        else if (/commercial/i.test(rule)) key = 'comSmallMarginPct';
        else if (/residential/i.test(rule)) key = 'marginPct';
        else if (/sales tax/i.test(rule)) key = 'tax';
        else if (/mississippi/i.test(rule)) key = 'msContractorTax';
        if (key) out.margins.push({ key: key, rule: rule, n: parseFloat(mm[1]) });
      }
      return;
    }
    var ci = col(/^id$/), cc = col(/^category$/), cit = col(/^item$/), cu = col(/^unit$/), cs = col(/^source/),
      ol = col(/^labor/), om = col(/^material/), os = col(/^sub/),
      nl = col(/^new labor/), nm = col(/^new material/), ns = col(/^new sub/), nt = col(/^new total/), np = col(/^new price/);
    if (nl < 0 && nm < 0 && ns < 0 && nt < 0) { if (np >= 0) { var cnt = 0; for (var q = hi + 1; q < R.length; q++) if (num(R[q][np]) != null) cnt++; if (cnt) out.ignored.push({ sheet: sh.name, n: cnt }); } return; }
    for (var r = hi + 1; r < R.length; r++) {
      var row = arr(R[r]), g = function(j){ return j >= 0 ? row[j] : ''; };
      var it = { sheet: sh.name, r: r + 1, id: s(g(ci)), cat: s(g(cc)), item: s(g(cit)), unit: s(g(cu)), src: s(g(cs)), old: { lab: num(g(ol)), mat: num(g(om)), sub: num(g(os)) }, nw: { lab: num(g(nl)), mat: num(g(nm)), sub: num(g(ns)) } };
      var tot = num(g(nt));
      if (it.nw.lab == null && it.nw.mat == null && it.nw.sub == null && tot != null && it.old.lab == null && it.old.mat == null && it.old.sub != null) it.nw.sub = tot;   /* a sub price: NEW total */
      if (!it.item && !it.id) continue;
      if (it.nw.lab == null && it.nw.mat == null && it.nw.sub == null && it.old.lab == null && it.old.mat == null && it.old.sub == null) continue;
      out.rows.push(it);
    }
  });
  return out;
}
/* Rate Book rows, as the Price Book lists them: [{ id, desc, f, cost, unit, cat, flag }] (one per name) */
var RBC = null;
function rbList(){
  return loadRates().then(function(list){
    var seen = {}, out = [];
    arr(list).forEach(function(r){ if (!r || !r.desc) return; var id = rbId(r.desc); if (seen[id]) return; seen[id] = 1; out.push({ id: id, desc: s(r.desc), f: rbField(r.type), cost: parseFloat(r.cost) || 0, unit: s(r.unit), cat: s(r.cat) || 'Rate Book', flag: rbFlag(r.desc) }); });
    RBC = out; return out;
  });
}
function loadRates(){
  try { if (BUILDER_READY && Array.isArray(rates) && rates.length) return Promise.resolve(rates); } catch (e) {}
  if (W.storage && typeof W.storage.get === 'function') {
    return W.storage.get('gc_rates_v3', true).then(function(r){ var l = null; try { l = r && r.value ? JSON.parse(r.value) : null; } catch (e) {} if (Array.isArray(l) && l.length) return l; try { return typeof SEED !== 'undefined' ? SEED : []; } catch (e) { return []; } }, function(){ return []; });
  }
  try { return Promise.resolve(typeof SEED !== 'undefined' ? SEED : []); } catch (e) { return Promise.resolve([]); }
}
function rbCur(row){ var v = bookVal(row.id, row.f); return v != null ? v : row.cost; }
/* rows -> preview { ch: [{ id, item, cat, f, o, n, pct, from }], same: n, notApplied: [{ item, why }], unmatched: [...], settings: {…}, sch: [...] } */
function preview(parsed, rb){
  var pv = { ch: [], all: [], same: 0, notApplied: [], unmatched: [], settings: null, sch: [], ignored: arr(parsed.ignored) }, seen = {};
  var rbBy = {}; arr(rb).forEach(function(x){ rbBy[x.id] = x; });
  arr(parsed.rows).forEach(function(r){
    var it = null, rbr = null, rbr0;
    if (r.id) { it = BYID[r.id] || null; rbr = !it && rbBy[r.id] ? rbBy[r.id] : null; }
    if (!it && !rbr) it = BYNAME[norm(r.item)] || null;
    if (!it && !rbr) rbr = rbBy[rbId(r.item)] || null;
    var rbF = {};
    if (!it && !rbr && !(/^built-in calculator/i.test(r.src) && !/rate book/i.test(r.src))) {   /* Rate Book rows named a little differently, one per price kind */
      var W0 = toks(r.item), b = Object.keys(W0);
      ['lab', 'mat', 'sub'].forEach(function(f){
        if (r.nw[f] == null && r.old[f] == null) return;
        var best = null, bs = 0, tie = false;
        arr(rb).forEach(function(x){
          if (x.f !== f) return;
          var X = toks(x.desc), a = Object.keys(X), inter = a.filter(function(k){ return W0[k]; }).length;
          if (!a.length || !b.length || (inter < 2 && !(inter === a.length && inter === b.length))) return;
          var sub = inter === a.length || inter === b.length, sc = inter / (a.length + b.length - inter);
          if (!(sub && sc >= 0.5) && !(inter / a.length >= 0.66)) return;
          if (sc > bs + 1e-9) { best = x; bs = sc; tie = false; } else if (Math.abs(sc - bs) < 1e-9) tie = true;
        });
        if (best && !tie) rbF[f] = best;
      });
    }
    if (!it && !rbr && !Object.keys(rbF).length) { pv.unmatched.push({ item: r.item || r.id, why: 'not in the Price Book (no calculator reads it yet)' }); return; }
    rbr0 = rbr;
    var hasNew = r.nw.lab != null || r.nw.mat != null || r.nw.sub != null;
    if (it && it.info) { if (hasNew) pv.notApplied.push({ item: it.item, why: 'not read by a calculator — ' + s(it.flag) }); return; }
    /* owner 10/26: the spreadsheet is the price list — the NEW price when filled in, else the sheet's current price */
    var add = function(id, item, cat, f, n, o, flag, isNew){
      var key = id + '|' + f; if (seen[key]) return; seen[key] = 1;
      pv.all.push({ id: id, f: f, n: r4(n), o: o, item: item, row: r.item });
      if (Math.abs(o - n) < 1e-6) { pv.same++; return; }
      pv.ch.push({ id: id, item: item, cat: cat, f: f, o: o, n: r4(n), pct: pct(o, n), flag: flag, from: r.sheet + ' row ' + r.r + (isNew ? '' : ' (current price column)') });
    };
    ['lab', 'mat', 'sub'].forEach(function(f){
      var isNew = r.nw[f] != null, n = isNew ? r.nw[f] : r.old[f]; if (n == null) return;
      var rbr = rbr0 || rbF[f]; if (!it && !rbr) return;
      if (it && !it.f[f]) { if (isNew) pv.notApplied.push({ item: it.item, why: 'has no ' + FL[f].toLowerCase() + ' price here' }); return; }
      if (rbr && rbr.f !== f) { if (isNew) pv.notApplied.push({ item: rbr.desc, why: 'the Rate Book row is a ' + FL[rbr.f].toLowerCase() + ' price' }); return; }
      if (n < 0) { pv.notApplied.push({ item: it ? it.item : rbr.desc, why: 'a negative price' }); return; }
      if (it) {
        add(it.id, it.item, it.cat, f, n, cur(it, f), s(it.flag), isNew);
        var also = isNew && it.rbAlso && it.rbAlso[f], ar = also && rbBy[rbId(also)];   /* a NEW price also moves the Rate Book copy */
        if (ar && ar.f === f) add(ar.id, ar.desc, 'Rate Book · ' + ar.cat, f, n, rbCur(ar), ar.flag, isNew);
      } else add(rbr.id, rbr.desc, 'Rate Book · ' + rbr.cat, f, n, rbCur(rbr), rbr.flag, isNew);
    });
  });
  var c = (BOOK && BOOK.settings) || OWNER_SETTINGS;
  arr(parsed.margins).forEach(function(m){
    if (m.key === 'insurance') { var res = parsed.margins.filter(function(x){ return x.key === 'marginPct'; })[0], rv = res ? res.n : num(c.marginPct); if (rv != null && Math.abs(rv - m.n) > 1e-9) pv.notApplied.push({ item: m.rule, why: 'insurance uses the residential margin' }); return; }
    var o = num(c[m.key]); if (o != null && Math.abs(o - m.n) < 1e-9) { pv.same++; return; }
    pv.settings = pv.settings || {}; pv.settings[m.key] = m.n; pv.sch.push({ item: SETL[m.key], o: o, n: m.n });
  });
  return pv;
}

/* ═══ 6. the screen ═══ */
var UI = { ov: null, q: '', cat: '', flagged: false, edits: {}, mode: 'list', pv: null, file: '', msg: '', render: function(){ render(); } };
var CSS = '#gc-pb-ov{position:fixed;inset:0;background:rgba(8,15,26,.62);z-index:1000001;display:flex;align-items:flex-start;justify-content:center;padding:14px;font-family:system-ui,Arial,sans-serif;overflow:auto}'
  + '#gc-pb-box{background:#fff;color:#1b1640;border-radius:12px;max-width:1180px;width:100%;padding:16px 18px;box-shadow:0 18px 60px rgba(0,0,0,.5)}'
  + '#gc-pb-box .pb-b{padding:6px 11px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#1a3a5f;font-size:12px;font-weight:700;cursor:pointer}'
  + '#gc-pb-box .pb-b.pri{background:#1a3a5f;color:#fff;border-color:#1a3a5f}#gc-pb-box .pb-b.go{background:#1f7a3d;color:#fff;border-color:#1f7a3d}'
  + '#gc-pb-box table{width:100%;border-collapse:collapse;font-size:12px}#gc-pb-box th{position:sticky;top:0;background:#f1f5f9;color:#475569;text-align:left;padding:6px 7px;font-size:11px;z-index:1}'
  + '#gc-pb-box td{padding:4px 7px;border-bottom:1px solid #eef2f7;vertical-align:middle}#gc-pb-box td.n{text-align:right;white-space:nowrap}'
  + '#gc-pb-box input.pb-in{width:84px;text-align:right;border:1px solid #cbd5e1;border-radius:6px;padding:3px 6px;font-size:12px}#gc-pb-box input.pb-in.set{background:#ecfdf5;border-color:#34d399}#gc-pb-box input.pb-in.ed{background:#fef9c3;border-color:#eab308}'
  + '#gc-pb-box .pb-flag{display:inline-block;margin-top:2px;font-size:10.5px;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:1px 6px}'
  + '#gc-pb-box .pb-note{font-size:10.5px;color:#64748b}#gc-pb-box .pb-cat td{background:#f8fafc;font-weight:800;color:#1a3a5f;font-size:12px;padding-top:9px}'
  + '#gc-pb-box .pb-card{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:10px 0}#gc-pb-box .pb-scroll{max-height:56vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px}'
  + '@media(max-width:700px){#gc-pb-box{padding:12px}#gc-pb-box .pb-hide{display:none}}';
function open(section){
  if (D.getElementById('gc-pb-ov')) { if (section === 'log') { UI.mode = 'log'; render(); } return; }
  if (!D.getElementById('gc-pb-css')) { var st = D.createElement('style'); st.id = 'gc-pb-css'; st.textContent = CSS; D.head.appendChild(st); }
  var ov = D.createElement('div'); ov.id = 'gc-pb-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div id="gc-pb-box"></div>'; D.body.appendChild(ov); UI.ov = ov;
  UI.mode = section === 'log' ? 'log' : 'list'; UI.edits = {}; UI.pv = null; UI.msg = ''; UI.focus = section || '';
  ov.addEventListener('mousedown', function(e){ if (e.target === ov) close(); });
  ov.addEventListener('click', onClick);
  ov.addEventListener('input', onInput);
  ov.addEventListener('change', onChange);
  render();
  rbList().then(function(){ render(); });
  refresh().then(function(){ render(); });
}
function close(){ try { UI.ov.remove(); } catch (e) {} UI.ov = null; }
function box(){ return UI.ov && UI.ov.querySelector('#gc-pb-box'); }
function cats(){ var o = []; ITEMS.forEach(function(it){ if (o.indexOf(it.cat) < 0) o.push(it.cat); }); o.push('Rate Book'); return o; }
function match(text){ var q = norm(UI.q); return !q || norm(text).indexOf(q) >= 0; }
function inCell(id, f, v, d, ro){
  var key = id + '|' + f, ed = key in UI.edits, val = ed ? UI.edits[key] : v, set = bookVal(id, f) != null;
  if (ro) return '<td class="n">' + (v == null ? '' : money(v)) + '</td>';
  return '<td class="n"><input class="pb-in' + (ed ? ' ed' : set ? ' set' : '') + '" data-id="' + esc(id) + '" data-f="' + f + '" inputmode="decimal" value="' + esc(val == null ? '' : (ed ? val : short(val))) + '" placeholder="' + esc(d == null ? '' : short(d)) + '" title="' + (set ? 'Set in the Price Book' : 'Built-in price') + '"></td>';
}
function head(){
  var b = BOOK, adm = isAdmin();
  var last = b && arr(b.log).filter(function(e){ return e && e.n; }).slice(-1)[0];
  return '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">'
    + '<div><div style="font-size:18px;font-weight:800">📒 Price Book <span style="font-size:12px;color:#64748b;font-weight:600">Estimate Builder</span></div>'
    + '<div style="font-size:12px;color:#475569;margin-top:3px;max-width:760px;line-height:1.45">Every calculator’s starting price and every Rate Book item, the same on every computer. Saved and sent estimates keep their own prices; new prices are used for new lines and calculator runs.'
    + (b && b.version ? ' <b>Version ' + b.version + '</b>' + (last ? ' · last price change ' + esc(nice(last.at)) + ' by ' + esc(last.by) : '') + '.' : ' <b>No price has been changed yet</b> — every calculator uses its built-in price.') + (adm ? '' : ' <i>Only an admin can change prices.</i>') + '</div></div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    + (adm ? '<button class="pb-b pri" data-a="upload">⬆ Upload price sheet</button><input id="gc-pb-file" type="file" accept=".xlsx,.xls,.csv,text/csv" style="display:none">' : '')
    + '<button class="pb-b" data-a="xlsx">⬇ Download as spreadsheet</button><button class="pb-b" data-a="csv">CSV</button><button class="pb-b" data-a="pdf">🖨 Price sheet</button>'
    + '<button class="pb-b" data-a="' + (UI.mode === 'log' ? 'list' : 'log') + '">' + (UI.mode === 'log' ? '📋 Prices' : '🕘 Change log') + '</button><button class="pb-b" data-a="close">Close</button></div></div>';
}
function marginsCard(){
  var c = (BOOK && BOOK.settings) || null, adm = isAdmin(), v = c || OWNER_SETTINGS;
  var f = function(k, w){ return '<label style="font-size:11px;color:#475569;display:inline-flex;flex-direction:column;gap:2px;margin-right:12px">' + esc(SETL[k]) + (adm ? '<input class="pb-in" style="width:' + (w || 84) + 'px" data-set="' + k + '" value="' + esc(short(num(v[k]))) + '">' : '<b style="font-size:13px;color:#1b1640">' + esc(short(num(v[k]))) + '%</b>') + '</label>'; };
  return '<div class="pb-card" id="gc-pb-margins"><div style="font-weight:800;font-size:13px;margin-bottom:6px">Margins &amp; sales tax <span class="pb-note" style="font-weight:400">' + (c ? '— stored in the cloud, the same for every estimator. Insurance uses the residential margin; large commercial = a commercial job over $500,000.' : '— not in the cloud yet; an admin opening this page moves them there (same values).') + '</span></div>'
    + '<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px">' + f('marginPct') + f('comSmallMarginPct') + f('comMarginPct') + f('tax') + f('msContractorTax')
    + (adm ? '<button class="pb-b go" data-a="savemargins">Save for everyone</button>' : '') + '</div></div>';
}
/* owner 10/26: drywall is sold at about $70–80 a sheet hung and finished, costing about $50 */
function dwSheet(){
  var g = function(id, f){ return cur(BYID[id], f); };
  var board = g('dw.board.fire_type_x.48', 'mat'), hf = g('dw.hangfinish', 'lab'), hang = hf > 0 ? hf : g('dw.hang.48', 'lab'), fin = hf > 0 ? 0 : g('dw.finish', 'lab');
  var sup = 35 * g('dw.screws', 'mat') / 5000 + g('dw.mud', 'mat') / 8 + 48 * 0.70 / 500 * g('dw.tape', 'mat') + 48 / 1000 * 10 * g('dw.pads', 'mat');
  var st = (BOOK && BOOK.settings) || OWNER_SETTINGS, tax = num(st.tax) || 0, mp = num(st.marginPct) || 30, mc = num(st.comSmallMarginPct) || 25, ml = num(st.comMarginPct) || 20;
  var mat = (board + sup) * (1 + tax / 100), cost = mat + hang + fin, at = function(c, m){ return Math.round(c / (1 - m / 100) * 100) / 100; };
  /* owner 10/26: the hang + finish line (labor only, about $50) is charged at the job's default margin */
  return { board: board, hang: hang, fin: fin, hf: hf, sup: r4(sup), cost: Math.round(cost * 100) / 100, price: at(cost, mp), mp: mp,
    hfPrice: hf > 0 ? { res: at(hf, mp), com: at(hf, mc), big: at(hf, ml), mp: mp, mc: mc, ml: ml } : null };
}
function dwCard(){
  var d = dwSheet();
  var h = d.hfPrice;
  return '<div class="pb-card" id="gc-pb-dwsheet" style="font-size:12px"><b>Drywall hang + finish, per sheet</b> '
    + (h ? '<b>' + money(d.hf) + ' cost</b> → charged <b>' + money(h.res) + '</b> residential (' + short(h.mp) + '%) · <b>' + money(h.com) + '</b> commercial $500,000 or less (' + short(h.mc) + '%) · <b>' + money(h.big) + '</b> large commercial (' + short(h.ml) + '%). <span class="pb-note">One “Drywall hang + finish labor” line per drywall zone, at the default margin; board and supplies are their own lines.</span>'
      : '<span class="pb-flag">⚑ not set</span> <span class="pb-note">Owner 10/26: about $50 per sheet hung and finished, charged at the margin (residential 30% → $71.43). Type it in “Drywall hang + finish labor” under Drywall to turn it on; until then the calculator charges hang only (×' + short(cur(BYID['dw.hangmult'], 'lab')) + ') and finishing is not priced.</span>')
    + '<br><span class="pb-note">All-in (4×12, 5/8" Type X, as the drywall calculator builds it): board ' + money(d.board) + ' + supplies ' + money(Math.round(d.sup * 100) / 100) + ' (+ tax) + ' + (h ? 'hang + finish ' + money(d.hang) : 'hang ' + money(d.hang) + ' + finish ' + money(d.fin)) + ' = ' + money(d.cost) + ' cost → ' + money(d.price) + ' at ' + short(d.mp) + '%.</span></div>';
}
/* Products (materials catalog) entries that look like a unit mix-up — shown, never changed here */
function productsCard(){
  var P = []; try { P = arr(Array.isArray(W._gcAllProducts) ? W._gcAllProducts : (typeof W._gcGetProducts === 'function' ? W._gcGetProducts() : [])); } catch (e) {}
  var out = [];
  P.forEach(function(p){
    if (!p || !p.name) return; var nm = s(p.name), c = parseFloat(p.cost);
    if (/1\/2/.test(nm) && /4\s*x\s*8/i.test(nm) && /drywall|gyp|sheetrock|regular/i.test(nm + ' ' + s(p.cat)) && c > 40) out.push([nm, c, 'looks like a hang + finish price per sheet entered on the board item, not the board price']);
    if (/2\s*x\s*6\s*x\s*10/i.test(nm) && c > 0 && c < 2) out.push([nm, c, 'looks like a per-LF price on a per-piece item (unit mix-up)']);
  });
  if (!out.length) return '';
  return '<div class="pb-card" style="font-size:12px;background:#fff7ed;border-color:#fed7aa"><b>⚑ Products to check</b> <span class="pb-note">(materials catalog — not changed here; fix in Products)</span><ul style="margin:4px 0 0 18px">'
    + out.slice(0, 6).map(function(x){ return '<li>' + esc(x[0]) + ' — ' + money(x[1]) + ': ' + esc(x[2]) + '</li>'; }).join('') + '</ul></div>';
}
function listView(){
  var adm = isAdmin(), rows = '', nEd = Object.keys(UI.edits).length;
  var bar = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">'
    + '<input id="gc-pb-q" placeholder="Search prices…" value="' + esc(UI.q) + '" style="border:1px solid #cbd5e1;border-radius:8px;padding:6px 9px;font-size:12px;min-width:200px">'
    + '<select id="gc-pb-cat" style="border:1px solid #cbd5e1;border-radius:8px;padding:5px 8px;font-size:12px"><option value="">All categories</option>' + cats().map(function(c){ return '<option' + (UI.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
    + '<label style="font-size:12px;color:#475569"><input type="checkbox" id="gc-pb-flagged"' + (UI.flagged ? ' checked' : '') + '> ⚑ Open questions only</label>'
    + (adm ? '<span class="pb-note">Type a new price; empty = the built-in price. Green = set in the Price Book.</span>' : '') + '</div>';
  var lastCat = '';
  ITEMS.forEach(function(it){
    if (UI.cat && UI.cat !== it.cat) return; if (UI.flagged && !it.flag) return; if (!match(it.cat + ' ' + it.item + ' ' + arr(it.aka).join(' '))) return;
    if (it.cat !== lastCat) { rows += '<tr class="pb-cat"><td colspan="7">' + esc(it.cat) + '</td></tr>'; lastCat = it.cat; }
    var ro = !adm || it.info;
    rows += '<tr data-row="' + esc(it.id) + '"><td>' + esc(it.item) + (it.flag ? '<br><span class="pb-flag">⚑ ' + esc(it.flag) + (it.info ? ' — listed for the owner to decide; not changed here' : '') + '</span>' : '') + (it.note ? '<div class="pb-note">' + esc(it.note) + '</div>' : '') + '</td><td class="pb-hide" style="color:#64748b">' + esc(it.unit) + '</td>'
      + ['lab', 'mat', 'sub'].map(function(f){ return it.f[f] ? inCell(it.id, f, it.info ? defOf(it, f) : cur(it, f), defOf(it, f), ro) : '<td></td>'; }).join('')
      + '<td class="n pb-hide" style="color:#64748b">' + Object.keys(it.f).map(function(f){ return money(defOf(it, f)); }).join(' / ') + '</td><td class="pb-hide pb-note">' + esc(it.info ? 'not read' : (Object.keys(it.f).some(function(f){ return bookVal(it.id, f) != null; }) ? 'Price Book' : 'built-in')) + '</td></tr>';
  });
  if (!UI.cat || UI.cat === 'Rate Book') {
    var R = arr(RBC).filter(function(x){ return (!UI.flagged || x.flag) && match('rate book ' + x.cat + ' ' + x.desc); });
    if (RBC === null) rows += '<tr class="pb-cat"><td colspan="7">Rate Book — loading…</td></tr>';
    else if (R.length) {
      rows += '<tr class="pb-cat"><td colspan="7">Rate Book <span class="pb-note" style="font-weight:400">— the pick list in the builder (Add line, Rate Book tab). A price set here is written into every computer’s Rate Book.</span></td></tr>';
      R.forEach(function(x){
        rows += '<tr data-row="' + esc(x.id) + '"><td>' + esc(x.desc) + ' <span class="pb-note">' + esc(x.cat) + '</span>' + (x.flag ? '<br><span class="pb-flag">⚑ ' + esc(x.flag) + '</span>' : '') + '</td><td class="pb-hide" style="color:#64748b">' + esc(x.unit) + '</td>'
          + ['lab', 'mat', 'sub'].map(function(f){ return f === x.f ? inCell(x.id, f, rbCur(x), x.cost, !adm) : '<td></td>'; }).join('') + '<td class="n pb-hide" style="color:#64748b">' + money(x.cost) + '</td><td class="pb-hide pb-note">' + (bookVal(x.id, x.f) != null ? 'Price Book' : 'Rate Book') + '</td></tr>';
      });
    }
  }
  var foot = adm ? '<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:10px"><span class="pb-note" id="gc-pb-msg">' + esc(UI.msg) + '</span>'
    + (nEd ? '<button class="pb-b" data-a="undo">Undo my edits</button>' : '') + '<button class="pb-b go" data-a="review"' + (nEd ? '' : ' disabled style="opacity:.5"') + '>Review ' + nEd + ' change' + (nEd === 1 ? '' : 's') + '</button></div>' : '';
  return marginsCard() + dwCard() + productsCard() + bar + '<div class="pb-scroll"><table><thead><tr><th>Item</th><th class="pb-hide">Unit</th><th style="text-align:right">Labor $</th><th style="text-align:right">Material $</th><th style="text-align:right">Sub $</th><th class="pb-hide" style="text-align:right">Built-in</th><th class="pb-hide">From</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + foot;
}
function previewView(){
  var pv = UI.pv, n = pv.ch.length + pv.sch.length, rows = '';
  pv.ch.forEach(function(c){ rows += '<tr><td><b>' + esc(c.item) + '</b><div class="pb-note">' + esc(c.cat) + (c.from ? ' · ' + esc(c.from) : '') + '</div>' + (c.flag ? '<span class="pb-flag">⚑ ' + esc(c.flag) + '</span>' : '') + '</td><td>' + FL[c.f] + '</td><td class="n">' + money(c.o) + ' → <b>' + money(c.n) + '</b></td><td class="n" style="color:' + (c.n > c.o ? '#b45309' : '#047857') + '">' + esc(c.pct) + '</td></tr>'; });
  pv.sch.forEach(function(c){ rows += '<tr><td><b>' + esc(c.item) + '</b><div class="pb-note">Margins &amp; tax</div></td><td>%</td><td class="n">' + (c.o == null ? '—' : short(c.o) + '%') + ' → <b>' + short(c.n) + '%</b></td><td></td></tr>'; });
  var extra = '';
  if (pv.notApplied.length) extra += '<div class="pb-card"><b>Not changed (' + pv.notApplied.length + ')</b><ul style="margin:4px 0 0 18px;font-size:12px;color:#7c2d12">' + pv.notApplied.slice(0, 60).map(function(x){ return '<li>' + esc(x.item) + ' — ' + esc(x.why) + '</li>'; }).join('') + '</ul></div>';
  if (pv.unmatched.length) extra += '<div class="pb-card"><b>Not matched (' + pv.unmatched.length + ')</b> <span class="pb-note">— rows with a new price that no calculator or Rate Book row in this list reads; nothing is changed for them.</span><ul style="margin:4px 0 0 18px;font-size:12px;color:#475569">' + pv.unmatched.slice(0, 60).map(function(x){ return '<li>' + esc(x.item) + '</li>'; }).join('') + '</ul></div>';
  if (pv.ignored.length) extra += '<div class="pb-note" style="margin-top:6px">Not read here: ' + pv.ignored.map(function(x){ return esc(x.sheet) + ' (' + x.n + ' new price' + (x.n === 1 ? '' : 's') + ')'; }).join(', ') + ' — product prices go in Products → 📦 Upload price sheet.</div>';
  var tot = arr(pv.all).length || n;
  return '<div class="pb-card" style="background:#f8fafc"><div style="font-weight:800;font-size:14px">' + (UI.file ? 'From ' + esc(UI.file) + ': ' : 'Your edits: ') + n + ' price' + (n === 1 ? '' : 's') + ' would change' + (pv.same ? ' · ' + pv.same + ' already the same' : '') + '</div>'
    + (UI.file && arr(pv.all).length ? '<div class="pb-note">After Apply, ' + pv.all.length + ' prices come from this spreadsheet (the NEW price where filled in, else its current price).</div>' : '')
    + '<div class="pb-note">Nothing is changed until you press Apply. Saved and sent estimates keep their prices.</div></div>'
    + (rows ? '<div class="pb-scroll"><table id="gc-pb-diff"><thead><tr><th>Item</th><th>Price</th><th style="text-align:right">Old → new</th><th style="text-align:right">Change</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div style="padding:10px;font-size:13px;color:#475569">Nothing to change.</div>')
    + extra + '<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:10px"><span class="pb-note" id="gc-pb-msg">' + esc(UI.msg) + '</span><button class="pb-b" data-a="cancel">Cancel</button>'
    + (tot ? '<button class="pb-b go" data-a="apply">Apply ' + (n ? n + ' change' + (n === 1 ? '' : 's') : 'the spreadsheet prices') + '</button>' : '') + '</div>';
}
function logView(){
  var L = arr(BOOK && BOOK.log).slice().reverse();
  if (!L.length) return '<div style="padding:16px;font-size:13px;color:#475569">No changes yet.</div>';
  return '<div style="margin-top:10px">' + L.map(function(e, i){
    var ch = arr(e.ch);
    return '<details class="pb-card"' + (i === 0 ? ' open' : '') + ' data-v="' + e.v + '"><summary style="cursor:pointer;font-size:13px"><b>' + esc(niceT(e.at)) + '</b> · ' + esc(e.by) + ' · ' + esc(e.src === 'edit' ? 'edited in the Price Book' : /^upload:/.test(e.src) ? 'uploaded ' + e.src.slice(7) : e.src) + ' · ' + (e.n || 0) + ' change' + (e.n === 1 ? '' : 's') + ' <span class="pb-note">version ' + e.v + '</span></summary>'
      + (e.note ? '<div class="pb-note" style="margin:4px 0">' + esc(e.note) + '</div>' : '')
      + (ch.length ? '<table style="margin-top:6px"><tbody>' + ch.map(function(c){ var isSet = /^set:/.test(c.id); return '<tr><td>' + esc(c.item) + '</td><td>' + (isSet ? '%' : FL[c.f] || '') + '</td><td class="n">' + (isSet ? (c.o == null ? '—' : short(c.o) + '%') + ' → <b>' + short(c.n) + '%</b>' : money(c.o) + ' → <b>' + money(c.n) + '</b>') + '</td><td class="n">' + (isSet ? '' : esc(pct(c.o, c.n))) + '</td></tr>'; }).join('') + '</tbody></table>' + (e.n > ch.length ? '<div class="pb-note">… and ' + (e.n - ch.length) + ' more</div>' : '') : '')
      + '</details>';
  }).join('') + '</div>';
}
function render(){
  var b = box(); if (!b) return;
  var keep = D.activeElement && D.activeElement.id === 'gc-pb-q', pos = keep ? D.activeElement.selectionStart : 0;
  var sc = b.querySelector('.pb-scroll'), top = sc ? sc.scrollTop : 0;
  var html = head() + (UI.mode === 'log' ? logView() : UI.mode === 'preview' && UI.pv ? previewView() : listView());
  /* the app's "panel you are typing in" guard refuses a rewrite right after a field was used (the file picker, a price box):
     this screen's own redraw is the person's action, so it goes through (the search box keeps its focus and caret) */
  var ms = W.__GC_MANUAL_SAVE__; W.__GC_MANUAL_SAVE__ = true;
  try { b.innerHTML = html; } finally { W.__GC_MANUAL_SAVE__ = ms; }
  var sc2 = b.querySelector('.pb-scroll'); if (sc2 && UI.mode === 'list') sc2.scrollTop = top;
  if (keep) { var q = b.querySelector('#gc-pb-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
  if (UI.focus === 'margins') { UI.focus = ''; var m = b.querySelector('#gc-pb-margins'); if (m) { m.style.outline = '2px solid #f59e0b'; try { m.scrollIntoView({ block: 'center' }); } catch (e) {} } }
}
function onInput(e){
  var t = e.target;
  if (t.id === 'gc-pb-q') { UI.q = t.value; render(); return; }
  if (t.classList && t.classList.contains('pb-in') && t.getAttribute('data-id')) {
    var id = t.getAttribute('data-id'), f = t.getAttribute('data-f'), key = id + '|' + f;
    var it = BYID[id], rbr = !it && arr(RBC).filter(function(x){ return x.id === id; })[0];
    var curV = it ? cur(it, f) : rbCur(rbr), v = s(t.value);
    if ((v === '' && it && bookVal(id, f) == null) || (num(v) != null && Math.abs(num(v) - curV) < 1e-9)) delete UI.edits[key]; else UI.edits[key] = v;
    t.classList.toggle('ed', key in UI.edits);
    var btn = box().querySelector('[data-a="review"]'), n = Object.keys(UI.edits).length;
    if (btn) { btn.textContent = 'Review ' + n + ' change' + (n === 1 ? '' : 's'); btn.disabled = !n; btn.style.opacity = n ? '' : '.5'; }
  }
}
function onChange(e){
  var t = e.target;
  if (t.id === 'gc-pb-cat') { UI.cat = t.value; render(); }
  else if (t.id === 'gc-pb-flagged') { UI.flagged = t.checked; render(); }
  else if (t.id === 'gc-pb-file') {
    var f = t.files && t.files[0]; if (!f) return;
    UI.msg = 'Reading ' + f.name + '…'; render();
    uploadFile(f).catch(function(err){ UI.mode = 'list'; UI.msg = s(err && err.message) || 'Could not read the file.'; render(); });
  }
}
function uploadFile(f){
  return readFile(f).then(function(sheets){
    var parsed = parse(sheets);
    return rbList().then(function(rb){
      if (!parsed.rows.length && !parsed.margins.length) throw new Error('No new prices found in ' + f.name + '. Fill in the NEW labor / NEW material columns (or NEW sub / NEW total), keep the header row, and upload again.');
      UI.pv = preview(parsed, rb); UI.file = f.name; UI.mode = 'preview'; UI.msg = ''; render(); return UI.pv;
    });
  });
}
function editsToPreview(){
  var pv = { ch: [], same: 0, notApplied: [], unmatched: [], settings: null, sch: [], ignored: [] }, bad = [];
  Object.keys(UI.edits).forEach(function(key){
    var p = key.split('|'), id = p[0], f = p[1], v = s(UI.edits[key]), it = BYID[id], rbr = !it && arr(RBC).filter(function(x){ return x.id === id; })[0];
    if (!it && !rbr) return;
    var n = v === '' ? null : num(v);
    if (v !== '' && (n == null || n < 0)) { bad.push((it ? it.item : rbr.desc) + ': "' + v + '"'); return; }
    if (n == null && !it) { bad.push(rbr.desc + ': a Rate Book price cannot be empty'); return; }
    var o = it ? cur(it, f) : rbCur(rbr), nn = n == null ? defOf(it, f) : r4(n);
    pv.ch.push({ id: id, item: it ? it.item : rbr.desc, cat: it ? it.cat : 'Rate Book · ' + rbr.cat, f: f, o: o, n: nn, pct: pct(o, nn), flag: it ? s(it.flag) : rbr.flag, reset: n == null, from: n == null ? 'back to the built-in price' : '' });
  });
  return { pv: pv, bad: bad };
}
function onClick(e){
  var b = e.target.closest && e.target.closest('[data-a]'); if (!b || b.disabled) return;
  var a = b.getAttribute('data-a');
  if (a === 'close') close();
  else if (a === 'log') { UI.mode = 'log'; render(); }
  else if (a === 'list') { UI.mode = 'list'; render(); }
  else if (a === 'upload') { var fi = box().querySelector('#gc-pb-file'); if (fi) { fi.value = ''; fi.click(); } }
  else if (a === 'csv') downloadCSV();
  else if (a === 'xlsx') downloadXLSX().catch(function(err){ UI.msg = s(err && err.message); render(); });
  else if (a === 'pdf') priceSheet();
  else if (a === 'undo') { UI.edits = {}; render(); }
  else if (a === 'cancel') { UI.mode = 'list'; UI.pv = null; UI.file = ''; render(); }
  else if (a === 'review') { var r = editsToPreview(); if (r.bad.length) { UI.msg = 'Not a price: ' + r.bad.join('; '); render(); return; } UI.pv = r.pv; UI.file = ''; UI.mode = 'preview'; UI.msg = ''; render(); }
  else if (a === 'apply') {
    var pv = UI.pv; if (!pv) return;
    b.disabled = true; b.textContent = 'Saving…';
    var src = UI.file ? 'upload:' + UI.file : 'edit';
    apply(pv, src).then(function(res){
      UI.edits = {}; UI.pv = null; UI.file = ''; UI.mode = 'list';
      UI.msg = res.changed ? 'Saved: ' + res.changed + ' price' + (res.changed === 1 ? '' : 's') + ' changed (version ' + res.book.version + '). Every computer gets them on its next sync.' : 'Nothing changed.';
      rbList().then(render);
    }, function(err){ UI.msg = s(err && err.message) || 'Could not save.'; b.disabled = false; b.textContent = 'Apply'; render(); });
  }
  else if (a === 'savemargins') {
    var want = {}; box().querySelectorAll('[data-set]').forEach(function(i){ want[i.getAttribute('data-set')] = i.value; });
    var bad = Object.keys(want).filter(function(k){ var v = num(want[k]); return v == null || v < 0 || v >= 95; });
    if (bad.length) { UI.msg = 'Not a percentage: ' + bad.map(function(k){ return SETL[k]; }).join(', '); render(); return; }
    b.disabled = true;
    save({ settings: want, src: 'margins', note: 'Margins & tax changed in the Price Book.' }).then(function(res){ UI.msg = res.changed ? 'Margins and tax saved for every computer.' : 'Margins and tax are already these values.'; render(); }, function(err){ UI.msg = s(err && err.message); render(); });
  }
}
function apply(pv, src){
  var list = arr(pv.all).length ? pv.all : pv.ch, kept = arr(pv.all).length - pv.ch.length;
  return save({ items: list.map(function(c){ return { id: c.id, f: c.f, n: c.reset ? null : c.n, o: c.o, item: c.item }; }), settings: pv.settings, src: src,
    note: arr(pv.all).length ? arr(pv.all).length + ' prices now come from the spreadsheet (' + pv.ch.length + ' changed, ' + Math.max(0, kept) + ' the same).' : '' });
}

/* ═══ 7. the CSV the owner can fill in and upload again ═══ */
function csvCell(v){ v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function downloadCSV(){
  rbList().then(function(rb){
    var L = [['ID', 'Category', 'Item', 'Unit', 'Labor $', 'Material $', 'Sub $', 'NEW labor', 'NEW material', 'NEW sub', 'Open question']];
    ITEMS.forEach(function(it){ L.push([it.id, it.cat, it.item, it.unit].concat(['lab', 'mat', 'sub'].map(function(f){ return it.f[f] ? (it.info ? defOf(it, f) : cur(it, f)) : ''; }), ['', '', '', s(it.flag) + (it.info ? ' (not read by a calculator)' : '')])); });
    rb.forEach(function(x){ L.push([x.id, 'Rate Book · ' + x.cat, x.desc, x.unit].concat(['lab', 'mat', 'sub'].map(function(f){ return f === x.f ? rbCur(x) : ''; }), ['', '', '', x.flag])); });
    var csv = L.map(function(r){ return r.map(csvCell).join(','); }).join('\r\n');
    var a = D.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'Price-Book-v' + ((BOOK && BOOK.version) || 0) + '.csv';
    D.body.appendChild(a); a.click(); STO.call(W, function(){ try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 2000);
  });
}

/* the Price Book as the review workbook's own layout (Prices + Margins sheets, an ID column at the end): edit the NEW
   columns in Excel and upload it again — a row left blank keeps its price */
var XH = ['Category', 'Item', 'Unit', 'Labor $', 'Material $', 'Sub $', 'Total / unit', 'Source', 'Used by', 'NEW labor', 'NEW material', 'NEW total', 'Notes', 'ID'];
function sheetRows(rb){
  var L = [XH.slice()];
  ITEMS.forEach(function(it){
    var v = ['lab', 'mat', 'sub'].map(function(f){ return it.f[f] ? (it.info ? defOf(it, f) : cur(it, f)) : ''; });
    var tot = v.reduce(function(a, x){ return a + (typeof x === 'number' ? x : 0); }, 0);
    L.push([it.cat, it.item, it.unit, v[0], v[1], v[2], r4(tot), it.info ? 'Listed (no calculator reads it)' : (Object.keys(it.f).some(function(f){ return bookVal(it.id, f) != null; }) ? 'Price Book' : 'Built-in starting price'), s(it.note), '', '', '', s(it.flag), it.id]);
  });
  arr(rb).forEach(function(x){ var v = rbCur(x); L.push(['Rate Book · ' + x.cat, x.desc, x.unit, x.f === 'lab' ? v : '', x.f === 'mat' ? v : '', x.f === 'sub' ? v : '', v, 'Rate Book', 'Rate Book pick list', '', '', '', x.flag, x.id]); });
  return L;
}
function marginRows(){
  var c = (BOOK && BOOK.settings) || OWNER_SETTINGS;
  var M = [['Rule', 'Current value', 'NEW value', 'Notes'],
    ['Default margin — residential (insurance uses it too)', short(num(c.marginPct)) + '%', '', ''], ['Default margin — commercial $500,000 or less', short(num(c.comSmallMarginPct)) + '%', '', ''],
    ['Default margin — large commercial (over $500,000)', short(num(c.comMarginPct)) + '%', '', ''], ['Sales tax on materials', short(num(c.tax)) + '%', '', ''], ['Mississippi contractor tax', short(num(c.msContractorTax)) + '%', '', '']];
  return M;
}
function downloadXLSX(){
  return Promise.all([sheetJS(), rbList()]).then(function(v){
    var X = v[0], wb = X.utils.book_new();
    var ws = X.utils.aoa_to_sheet(sheetRows(v[1])); ws['!cols'] = [18, 46, 14, 10, 10, 10, 10, 18, 30, 11, 11, 11, 40, 22].map(function(w){ return { wch: w }; });
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Price Book — version ' + ((BOOK && BOOK.version) || 0) + ', ' + nice(new Date().toISOString())], [''], ['Fill in the NEW labor / NEW material columns (NEW total for a sub price) and upload the file in Admin → Estimate Builder → Price Book.'], ['A row left blank keeps its price. Keep the header row and the ID column.']]), 'Read me');
    X.utils.book_append_sheet(wb, ws, 'Prices');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(marginRows()), 'Margins');
    var u8 = X.write(wb, { type: 'array', bookType: 'xlsx' });
    var a = D.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = 'Price-Book-v' + ((BOOK && BOOK.version) || 0) + '.xlsx';
    D.body.appendChild(a); a.click(); STO.call(W, function(){ try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 2000);
    return true;
  });
}

/* ═══ 8. the one-page price sheet ═══ */
/* the one page carries the prices estimators type over most; the rest is in the Price Book */
var SHEET_SKIP = /^(dw\.board\.|flr\.x\.|door\.|ply\.(?!labor)|act\.(ph|wire|screws|simple)|frame\.(lum|stud|track|rafter|defl|block|hat|wood|joists|screws|nails|metal\.mat|large|medium|small|addition|reno|ti)|flr\.base|tile\.|frp\.(panel|glue)|dw\.(screws|mud|tape|pads|bead|fctube|cementx|hangmult)|gr\.(cutout|delivery)|win\.mat|con\.laboronly|roof\.(tpo_mat|extra)|paint\.charge|flr\.(rubber_base6|cove_base|wood_base|concrete_seal)|crew\.dump$|gut\.ds2|dw\.(quick|hangfinish)|paint\.quick|flr\.quick|act\.grid|trim\.(putty|nail|caulk)|con\.pump|tile\.backer|frame\.metal\.sf|check\.)/;
function priceSheetHtml(){
  var dws = dwSheet(), b = BOOK, last = b && arr(b.log).filter(function(e){ return e && e.n && !e.quiet; }).slice(-1)[0], changed = {};
  if (last) arr(last.ch).forEach(function(c){ changed[c.id + '|' + c.f] = c; });
  var groups = [], gi = {};
  ITEMS.forEach(function(it){
    if (it.info || SHEET_SKIP.test(it.id)) return;
    if (it.id === 'dw.finish' && (dws.hf > 0 || !cur(it, 'lab'))) return;   /* hang + finish already covers it / not priced */
    if (dws.hf > 0 && /^dw\.hang\.(48|32|40|54|40_510)$/.test(it.id)) return;
    if (!gi[it.cat]) { gi[it.cat] = { cat: it.cat, rows: [] }; groups.push(gi[it.cat]); }
    var parts = Object.keys(it.f).map(function(f){ var c = changed[it.id + '|' + f]; return (Object.keys(it.f).length > 1 ? FL[f].toLowerCase() + ' ' : '') + '<b>' + money(cur(it, f)) + '</b>' + (c ? ' <span class="was">was ' + money(c.o) + '</span>' : ''); });
    gi[it.cat].rows.push('<tr' + (Object.keys(it.f).some(function(f){ return changed[it.id + '|' + f]; }) ? ' class="chg"' : '') + '><td>' + esc(it.item.replace(/ — install labor$/, '')) + ' <span class="u">' + esc(it.unit) + '</span></td><td class="p">' + parts.join(' · ') + '</td></tr>');
  });
  var half = Math.ceil(groups.reduce(function(n, g){ return n + g.rows.length + 1; }, 0) / 2), colA = '', colB = '', n = 0;
  var wa = 0, wb = 0; groups.forEach(function(g){ var h = '<tr class="g"><td colspan="2">' + esc(g.cat) + '</td></tr>' + g.rows.join(''), w = g.rows.length + 1.5; if (wa <= wb) { colA += h; wa += w; } else { colB += h; wb += w; } });
  var st = (b && b.settings) || OWNER_SETTINGS;
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Estimate Price Sheet</title><style>@page{size:letter;margin:.4in}body{font-family:Arial,Helvetica,sans-serif;color:#1b1640;margin:0;font-size:9px;line-height:1.2}'
    + 'h1{text-align:center;font-size:15px;margin:2px 0 2px}.sub{text-align:center;color:#475569;font-size:10px;margin-bottom:6px}.m{text-align:center;font-size:10.5px;margin:0 0 8px;padding:5px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc}'
    + '.cols{display:flex;gap:14px;align-items:flex-start}.cols>table{flex:1;border-collapse:collapse}td{padding:1px 4px;border-bottom:1px solid #eef2f7;vertical-align:top}td.p{text-align:right;white-space:nowrap}.u{color:#64748b;font-size:8.5px}'
    + 'tr.g td{font-weight:800;color:#1a3a5f;background:#f1f5f9;padding-top:4px}tr.chg td{background:#fef9c3}.was{color:#64748b;font-weight:400;font-size:8.5px}.foot{margin-top:6px;text-align:center;color:#64748b;font-size:8.5px}</style></head><body>'
    + '<h1>Estimate Builder Price Sheet</h1><div class="sub">Price Book version ' + ((b && b.version) || 0) + ' · ' + esc(nice(new Date().toISOString())) + (last ? ' · prices updated by ' + esc(last.by) + ' on ' + esc(nice(last.at)) + ' (highlighted)' : '') + '</div>'
    + '<div class="m">Margins: residential &amp; insurance <b>' + short(num(st.marginPct)) + '%</b> · commercial $500,000 or less <b>' + short(num(st.comSmallMarginPct)) + '%</b> · large commercial (over $500,000) <b>' + short(num(st.comMarginPct)) + '%</b> · sales tax on materials <b>' + short(num(st.tax)) + '%</b>'
    + (dws.hfPrice ? '<br>Drywall hang + finish <b>' + money(dws.hf) + '</b> per sheet → charged <b>' + money(dws.hfPrice.res) + '</b> residential · <b>' + money(dws.hfPrice.com) + '</b> commercial ≤ $500k · <b>' + money(dws.hfPrice.big) + '</b> large commercial' : '') + '</div>'
    + '<div class="cols"><table>' + colA + '</table><table>' + colB + '</table></div>'
    + '<div class="foot">Cost prices before margin. The calculators start from these; an estimator can type over a price on one estimate. Saved and sent estimates keep their own prices. Drywall board prices and the Rate Book are in the Price Book.</div></body></html>';
}
function priceSheet(){
  var html = priceSheetHtml();
  try { if (typeof W._gcBrandPrintHtml === 'function') html = W._gcBrandPrintHtml(html); } catch (e) {}
  if (typeof W._gcOpenDocHTML === 'function') return W._gcOpenDocHTML(html);
  var w = W.open('', '_blank'); if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  return !!w;
}

/* ═══ 9. in the builder: the banner, the Price Book button, Settings ═══ */
function lastPriceEntry(){ return arr(BOOK && BOOK.log).filter(function(e){ return e && e.n && !e.quiet; }).slice(-1)[0] || null; }
function paintBanner(){
  var wrap = D.getElementById('gc-est-wrap'), ov = D.getElementById('gc-est-overlay');
  var old = D.getElementById('gc-pb-banner');
  var e = lastPriceEntry(), seen = parseInt(lsGet(SEEN) || '0', 10) || 0;
  var show = !!(wrap && ov && ov.classList.contains('gcv') && e && e.v > seen && s(e.email).toLowerCase() !== myEmail());
  if (!show) { if (old) old.remove(); return; }
  var txt = '📒 Prices updated by ' + esc(e.by) + ' on ' + esc(nice(e.at)) + ' — ' + e.n + ' price' + (e.n === 1 ? '' : 's') + ' changed. ';
  if (old && old.getAttribute('data-v') === String(e.v)) return;
  if (old) old.remove();
  var d = D.createElement('div'); d.id = 'gc-pb-banner'; d.setAttribute('data-v', String(e.v));
  d.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fef3c7;color:#78350f;border-bottom:1px solid #f59e0b;padding:8px 14px;font:600 13px system-ui,Arial,sans-serif';
  d.innerHTML = '<span>' + txt + '</span><button type="button" data-pbb="see" style="background:#1a3a5f;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer">See changes</button>'
    + '<button type="button" data-pbb="sheet" style="background:#fff;color:#1a3a5f;border:1px solid #1a3a5f;border-radius:6px;padding:3px 9px;font-weight:700;cursor:pointer">Price sheet</button>'
    + '<button type="button" data-pbb="x" title="Dismiss" style="margin-left:auto;background:none;border:none;color:#78350f;font-size:16px;cursor:pointer">✕</button>';
  d.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-pbb]'); if (!b) return;
    var k = b.getAttribute('data-pbb');
    lsSet(SEEN, String(e.v));
    if (k === 'see') open('log'); else if (k === 'sheet') priceSheet();
    d.remove();
  });
  wrap.insertBefore(d, wrap.firstChild);
}
function builderBits(){
  var rt = D.getElementById('tab-rates');
  if (rt && !D.getElementById('gc-pb-rbbtn')) {
    var bb = D.createElement('div'); bb.id = 'gc-pb-rbbtn'; bb.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px;font-size:12px;color:#475569';
    bb.innerHTML = '<button type="button" class="btn pri" style="padding:5px 12px">📒 Price Book</button><span>Calculator prices, Rate Book, margins and tax — the same on every computer' + (isAdmin() ? ' (admins change them there).' : '.') + '</span>';
    bb.querySelector('button').onclick = function(){ open(); };
    rt.insertBefore(bb, rt.firstChild);
  }
  var cm = D.getElementById('set-com-margin');
  if (cm && !D.getElementById('set-com-small-margin')) {
    var lb = cm.parentNode.querySelector('label'); if (lb) lb.textContent = 'Large commercial (over $500,000) margin (%) — 20% = price is cost x 1.25';
    var g = D.createElement('div'); g.className = 'f';
    g.innerHTML = '<label>Commercial $500,000 or less — margin (%) — 25% = price is cost x 1.3333</label><input id="set-com-small-margin" type="number" min="1" max="90" step="0.5" value="25" oninput="saveSettings()">';
    cm.parentNode.parentNode.insertBefore(g, cm.parentNode.nextSibling);
    var st = builderSettings(); if (st) D.getElementById('set-com-small-margin').value = num(st.comSmallMarginPct) != null ? st.comSmallMarginPct : 25;
  }
  var sm = D.getElementById('set-com-small-margin'), st2 = builderSettings();
  if (sm && st2 && D.activeElement !== sm) { var want = String(num(st2.comSmallMarginPct) != null ? st2.comSmallMarginPct : 25); if (sm.value !== want) sm.value = want; }
  /* margins + tax are the Price Book's: an estimator sees them, an admin changes them (here or in the Price Book) */
  var lock = !!(BOOK && BOOK.settings) && !isAdmin();
  ['set-tax', 'set-margin-pct', 'set-com-margin', 'set-com-small-margin', 'set-mat-mult', 'set-lab-mult', 'set-sub-mult', 'set-eq-mult'].forEach(function(id){ var i = D.getElementById(id); if (i && i.disabled !== lock) { i.disabled = lock; i.title = lock ? 'Set by an admin in the Price Book — the same on every computer' : ''; } });
  var tx = D.getElementById('set-tax');
  if (tx && !D.getElementById('gc-pb-setnote')) {
    var n = D.createElement('div'); n.id = 'gc-pb-setnote'; n.style.cssText = 'font-size:11px;color:#475569;margin:6px 0';
    n.innerHTML = 'Margins and sales tax are kept in the <a href="#" style="color:#1a3a5f;font-weight:700">📒 Price Book</a> — the same on every computer.';
    n.querySelector('a').onclick = function(ev){ ev.preventDefault(); open('margins'); };
    var host = tx.closest('.card') || tx.parentNode.parentNode; host.insertBefore(n, host.firstChild);
  }
}
/* "Import supplier prices" (Rate Book tab): show old → new for the Price Book prices it would change, and ask */
function wrapImport(){
  var orig = W.importEubanksPrice;
  if (typeof orig !== 'function' || orig.__pb) return;
  var w = function(){
    var list = [];
    try {
      arr(typeof EUBANKS_PRICES !== 'undefined' ? EUBANKS_PRICES : []).forEach(function(p){
        if (!p || !p.desc) return;
        var ex = arr(rates).filter(function(r){ return r && s(r.desc).toLowerCase() === s(p.desc).toLowerCase(); })[0];
        if (ex && W._gcPBHeld(ex.desc, p.cost)) list.push({ desc: ex.desc, o: rbCur({ id: rbId(ex.desc), f: rbField(ex.type), cost: ex.cost }), n: p.cost, f: rbField(ex.type) });
      });
    } catch (e) {}
    if (!list.length) return orig.apply(this, arguments);
    var msg = '"Import supplier prices" would change ' + list.length + ' price' + (list.length === 1 ? '' : 's') + ' set in the Price Book:\n\n'
      + list.slice(0, 15).map(function(x){ return '• ' + x.desc + ': ' + money(x.o) + ' → ' + money(x.n); }).join('\n') + (list.length > 15 ? '\n… and ' + (list.length - 15) + ' more' : '')
      + '\n\n' + (isAdmin() ? 'OK = import them too (the Price Book is updated and logged).\nCancel = import everything else and keep the Price Book prices.' : 'Only an admin can change Price Book prices: these are kept, the rest is imported.');
    var yes = W.confirm(msg) && isAdmin();
    if (!yes) return orig.apply(this, arguments);
    W.__GC_PB_ALLOW_HELD__ = true;
    var self = this, args = arguments;
    return Promise.resolve().then(function(){ return orig.apply(self, args); }).then(function(r){
      W.__GC_PB_ALLOW_HELD__ = false;
      return save({ items: list.map(function(x){ return { id: rbId(x.desc), f: x.f, n: x.n, o: x.o, item: x.desc }; }), src: 'supplier import', note: '"Import supplier prices" in the Rate Book tab, confirmed.' }).then(function(){ return r; }, function(){ return r; });
    }, function(e){ W.__GC_PB_ALLOW_HELD__ = false; throw e; });
  };
  w.__pb = true; W.importEubanksPrice = w;
}

function tick(){
  try {
    var bo = D.getElementById('gc-est-overlay'), on = !!(bo && bo.classList.contains('gcv'));
    if (Date.now() - lastRefresh > (on || UI.ov ? 60000 : 300000) && !D.hidden) refresh();
    if (on) { builderBits(); paintBanner(); relabel(); wrapImport(); }
  } catch (e) {}
}
SI.call(W, tick, 2000);
STO.call(W, function(){ overlay(); refresh(); }, 1500);
D.addEventListener('visibilitychange', function(){ if (!D.hidden && Date.now() - lastRefresh > 20000) refresh(); });

W._gcOpenPriceBook = function(section){ open(section); return true; };
W._gcPriceSheet = priceSheet;
W._gcPriceBook = {
  state: function(){ return BOOK; }, items: function(){ return ITEMS; }, refresh: refresh, open: open, close: close, apply: apply, save: save,
  parse: parse, preview: preview, readFile: readFile, rbList: rbList, cur: function(id, f){ var it = BYID[id]; return it ? cur(it, f) : null; }, def: function(id, f){ var it = BYID[id]; return it ? defOf(it, f) : null; },
  sheetHtml: priceSheetHtml, upload: uploadFile, ui: UI, overlay: overlay, sheetRows: sheetRows, marginRows: marginRows, dwSheet: dwSheet,
  unwired: function(){ return ITEMS.filter(function(it){ return it.info && Object.keys(it.f).length; }).map(function(it){ return it.id + ' — ' + it.item + (it.note ? ' — ' + it.note : ''); }).concat(NOT_WIRED); }
};
overlay();
try { console.log('[GC] Estimate Builder Price Book ready (patch PRICEBOOK, ' + ITEMS.length + ' calculator prices)'); } catch (e) {}
})();
