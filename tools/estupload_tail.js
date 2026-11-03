<script id="gc-patch-estupload">
/* __GC_PATCH_ESTUPLOAD__ — the job's estimate from an uploaded paper (owner 11/03, Field and desk).
   "I also need to upload estimate on these buttons … PDF and proposals made from Word doc or Google doc … it work as
   the job's estimate, and when signed contract it changes to the job's total." + "make sure Templates is on the
   estimate button in Field view. When I enter my estimate it creates a template I can send manually or put into the
   portal, or I can put the original proposal in the portal." + "have a Make schedule for job button … if there is any
   schedule language in the PDF we make, transfer that to the schedule" + "scope can be made from the estimate" +
   "NO prices on any scope, just the wording".
   • Field job screen "📄 Upload estimate" → a sheet: 📤 Upload estimate (PDF / Word — ESTIN's one upload, the same as the
     desk's 🧰 Job tools → 📤 Upload estimate) · 📘 Templates (the estimate Templates view) · this job's estimates.
   • After "Accept and save" (Field or desk, from a job): THIS panel — 📎 Your original / 📘 Template version side by side;
     "Customer sees: ◉ My PDF (original) ○ Template version" (CUSTPORTAL's customerSees); 📅 Schedule (start, finish,
     phases — prefilled from schedule language found in the PDF, each with the phrase it came from) + "📅 Make schedule
     for job" (tentative items on the Schedule tab, only on that tap); Template details only when the template is
     chosen (scope — built from the paper / the estimate's lines, wording only — payment terms, valid until, warranty,
     exclusions, notes; the job's customer / address / PO / PM / state come from the job); and for the chosen version:
     📨 Put in customer portal (ESTIN's ONE approval) · ✉️ Send it myself (share sheet, else a download) · ⬇️ Download.
     Nothing goes to the customer without a tap. The estimate waits (estinWait) until 📨 is pressed.
   API: window._gcEstUp = { menu(p), after(estId, o), parse: { schedFind, scopeFromText, addWorking } } */
(function(){
'use strict';
var W = window, D = W.document;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var x = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dOf(t){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(t)); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }

/* ══ 1. the paper's words (pure — node-tested) ═══════════════════════════════════════════════════════════════════ */
var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
var DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b|\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
var NOT_SCHED = /good for|valid|net\s*\d|payment|invoice|late charge|past.?due|warrant|price|notice|cancel|rescind|receipt|after (?:signing|acceptance)|insurance|license|permit fee|deposit|interest|per month/i;
var START_CUE = /\b(start(?:s|ing|ed)?|begin(?:s|ning)?|commenc(?:e|es|ing|ement)|mobiliz(?:e|ation)|kick.?off)\b/i;
var END_CUE = /\b(complet(?:e|ed|ion)|finish(?:ed|es)?|substantial(?:ly)? complet\w*|wrap(?:ped)? up|done by|end(?:s|ing)? (?:on|by))\b/i;
var DUR_RE = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)\s*(?:\(\d{1,3}\)\s*)?(?:(?:-|–|—|to)\s*(\d{1,3})\s*)?(working|business|work|calendar)?\s*(days?|weeks?)\b/i;
function wnum(v){ v = low(v); return NUMW[v] || +v || 0; }
function parseDate(m, today){
  var t = today || new Date(), y, mo, d;
  if (m[1]) { mo = +m[1] - 1; d = +m[2]; y = m[3] ? +m[3] : 0; if (y && y < 100) y += 2000; }
  else { mo = MON[low(m[4]).slice(0, 3)]; d = +m[5]; y = m[6] ? +m[6] : 0; }
  if (!(mo >= 0 && mo < 12 && d >= 1 && d <= 31)) return '';
  if (!y) { y = t.getFullYear(); var c = new Date(y, mo, d, 12); if (c - t < -60 * 864e5) y++; }
  var x = new Date(y, mo, d, 12); return x.getMonth() === mo ? ymd(x) : '';
}
/* working days (Mon–Fri): the date of the n-th working day, the start being day 1 (a weekend start moves to Monday) */
function addWorking(start, n, cal){
  var d = dOf(start); if (!d || !(n > 0)) return '';
  if (cal) { d.setDate(d.getDate() + n - 1); return ymd(d); }
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  var left = n - 1; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
  return ymd(d);
}
function nextWorking(day){ var d = dOf(day); if (!d) return ''; d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return ymd(d); }
function firstWorking(day){ var d = dOf(day); if (!d) return ''; while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return ymd(d); }
function durOf(m){ var a = wnum(m[1]), b = m[2] ? wnum(m[2]) : 0, n = Math.max(a, b), wk = /^week/i.test(m[4]), cal = /calendar/i.test(m[3] || ''); return { days: wk ? n * (cal ? 7 : 5) : n, cal: cal }; }
var PHASE_RE = /^\s*(?:(phase|stage|step|part)\s*(\d{1,2})\s*[:.)\-–—]\s*)?([A-Za-z][^$\n]{1,70}?)\s*(?:[,:(\-–—]|\bfor\b)\s*(?:approx\.?\s*|approximately\s*|about\s*|est\.?\s*)?(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:(?:-|–|to)\s*(\d{1,3})\s*)?(working |business |work |calendar )?(days?|weeks?)\)?\.?\s*$/i;
var WEEKLINE_RE = /^\s*(week|day)s?\s*(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*[:.)\-–—]\s*([A-Za-z][^$\n]{1,80}?)\s*\.?\s*$/i;
/* schedule language in a paper: start / finish dates, a duration, phases — each with the phrase it came from */
function schedFind(text, opt){
  opt = opt || {}; var today = opt.today ? dOf(opt.today) || new Date() : new Date();
  var out = { start: '', finish: '', startQ: '', finishQ: '', days: 0, cal: false, durQ: '', phases: [] };
  var lines = s(text).split(/\r?\n/).map(function(l){ return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  lines.forEach(function(line){
    if (NOT_SCHED.test(line) && !START_CUE.test(line) && !END_CUE.test(line)) return;
    /* phases ("Phase 1: Demo, 2 days" · "Install shingles – 3 days" · "Week 2: framing" · "Days 1-2: demo") */
    var ph = PHASE_RE.exec(line);
    if (ph && !NOT_SCHED.test(line) && !START_CUE.test(ph[3]) && !END_CUE.test(ph[3]) && !/\d$/.test(s(ph[3])) && !/\b(take|takes|will|should|expect|need)\b/i.test(ph[3]) && (ph[1] || line.length <= 70) && !/\b(approximately|project|job|total|entire|whole|overall)\b/i.test(ph[3])) {
      var dd = durOf([0, ph[4], ph[5], ph[6], ph[7]]);
      out.phases.push({ name: s(ph[3]).replace(/[\s,:\-–—]+$/, ''), days: dd.days, cal: dd.cal, q: line }); return;
    }
    var wl = WEEKLINE_RE.exec(line);
    if (wl && !NOT_SCHED.test(line)) { var isWeek = /week/i.test(wl[1]), n0 = wl[3] ? (+wl[3] - +wl[2] + 1) : 1; out.phases.push({ name: s(wl[4]), days: isWeek ? 5 * n0 : n0, cal: false, q: line }); return; }
    /* each sentence: a start / finish date, a duration */
    line.split(/(?<=[.;])\s+/).forEach(function(sen){
      var sc = START_CUE.exec(sen), ec = END_CUE.exec(sen);
      [[sc, 'start'], [ec, 'finish']].forEach(function(c){
        if (!c[0] || out[c[1]]) return;
        var rest = sen.slice(c[0].index), m = DATE_RE.exec(rest);
        if (m && m.index <= 60) { var dt = parseDate(m, today); if (dt) { out[c[1]] = dt; out[c[1] + 'Q'] = sen; } }
      });
      if (!out.days && !NOT_SCHED.test(sen)) {
        var dm = DUR_RE.exec(sen);
        if (dm && /(approx|about|around|estimat|take|takes|duration|within|complete|completion|finish|project|job|work|schedul|crew|install|weather permitting)/i.test(sen) && !(sc && DATE_RE.test(sen.slice(sc.index)) && !/\bfor\b|\btake/i.test(sen))) {
          var du = durOf(dm); if (du.days > 0 && du.days <= 400) { out.days = du.days; out.cal = du.cal; out.durQ = sen; }
        }
      }
    });
  });
  return out;
}
/* the plan: start + (the phases, else the duration) → the finish and each phase's dates; an explicit finish stays */
function plan(start, f, finishTyped){
  var r = { finish: finishTyped || '', phases: [] }; start = firstWorking(start); if (!start) return r;
  var at = start;
  (f.phases || []).forEach(function(p){ var n = Math.max(1, Math.round(num(p.days)) || 1), end = addWorking(at, n, p.cal); r.phases.push({ name: p.name, days: n, cal: !!p.cal, start: at, end: end, q: p.q }); at = p.cal ? ymd(new Date(dOf(end).getTime() + 864e5)) : nextWorking(end); });
  if (!r.finish) { if (r.phases.length) r.finish = r.phases[r.phases.length - 1].end; else if (f.days > 0) r.finish = addWorking(start, f.days, f.cal); }
  return r;
}
/* the scope from a paper's text: the "Scope of work" part when it has one, else its priced lines — wording only */
var STOP = /^(notes?|exclusions?|terms|payment|warranty|acceptance|signature|customer signature|total|sub ?total|tax|this proposal|thank you|respectfully|sincerely)\b/i;
var BOILER = /[\w.+-]+@[\w-]+\.\w|www\.|\.com\b|\b(tel|phone|fax|license|lic\.? ?#|tin#?|page \d|proposal|estimate|invoice|date|customer|client|prepared for|bill to|project|job ?#|po ?#|location|address)\s*[:#]|^\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}$/i;
function wordsLine(l){ try { if (W._gcScopeWordsLine) return W._gcScopeWordsLine(l); } catch (e) {} return s(l).replace(/[$][\d,.]+/g, '').replace(/[\s=\-–—:]+$/, '').trim(); }
function scopeFromText(text){
  var lines = s(text).split(/\r?\n/).map(function(l){ return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean), pick = [], i0 = -1;
  lines.some(function(l, i){ if (/^(proposed )?scope(?: of work)?\s*[:\-–]?\s*$|^scope of work\b/i.test(l)) { i0 = i; return true; } return false; });
  if (i0 >= 0) { for (var i = i0 + 1; i < lines.length && pick.length < 40; i++) { if (STOP.test(lines[i])) break; pick.push(lines[i]); } }
  else pick = lines.filter(function(l){ return /[$]\s?\d|\d[\d,]*\.\d{2}\s*$/.test(l) && !STOP.test(l); });
  var seen = {}, out = [];
  pick.forEach(function(l){
    if (BOILER.test(l) || PHASE_RE.test(l) || START_CUE.test(l) && DATE_RE.test(l)) return;
    var w = wordsLine(s(l).replace(/^\s*(?:\d{1,2}[.)]|[-•*·])\s*/, ''));
    if (!w || w.length < 3 || seen[low(w)]) return; seen[low(w)] = 1; out.push(w);
  });
  return out.join('\n');
}
/* the scope from a CRM estimate's lines: the builder's own "Generate from estimate" (wording only), else the lines' words */
function scopeFromEst(e){
  var ls = Array.isArray(e && e.lines) ? e.lines.filter(function(l){ return l && !/^tax$/i.test(s(l.type)) && !/sales tax/i.test(s(l.desc)); }) : [];
  if (!ls.length) return '';
  try { if (W._gcScopeFromEstimate && W._gcEstimateInfo && !/^upload/.test(s(e.source))) { var t = s(W._gcScopeFromEstimate(Object.assign({}, e, { lines: ls }))); var nl = t.split('\n').filter(function(x){ return /^\d+\.\s/.test(x); }).map(function(x){ return wordsLine(x.replace(/^\d+\.\s*/, '')); }).filter(Boolean); if (nl.length) return nl.join('\n'); } } catch (x) {}
  var seen = {}; return ls.map(function(l){ return wordsLine(l.desc || l.description || l.name); }).filter(function(w){ if (!w || seen[low(w)]) return false; seen[low(w)] = 1; return true; }).join('\n');
}
W._gcEstUpParse = { schedFind: schedFind, scopeFromText: scopeFromText, addWorking: addWorking, plan: plan };
if (!D || !D.createElement) return;

/* ══ 2. the screens ═════════════════════════════════════════════════════════════════════════════════════════════ */
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function E(){ return W._gcEstin || {}; }
function X(){ return (W._gcEstin && W._gcEstin.x) || {}; }
function crm(){ return W._crm || {}; }
function proj(pid){ return (crm().projects || []).filter(function(p){ return p && s(p.id) === s(pid); })[0] || null; }
function est(id){ try { return X().estById ? X().estById(id) : null; } catch (e) { return null; } }
function today(){ return ymd(new Date()); }
function me(){ try { return s((W._gcMeNow || {}).name) || s(localStorage.getItem('grayco_user')); } catch (e) { return ''; } }
function money(n){ return '$' + (Math.round(num(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function toast(t, bad){
  var el = D.getElementById('gceu-toast'); if (!el) { el = D.createElement('div'); el.id = 'gceu-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); D.body.appendChild(el); }
  el.textContent = t; el.className = bad ? 'bad' : ''; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 4200);
}
function css(){
  if (D.getElementById('gceu-css')) return;
  var st = D.createElement('style'); st.id = 'gceu-css';
  st.textContent = '.gceu-ov{position:fixed;inset:0;z-index:2147483310;background:rgba(15,29,47,.5);display:flex;justify-content:center;align-items:flex-start;overflow:auto;-webkit-overflow-scrolling:touch;padding:calc(12px + env(safe-area-inset-top,0px)) 10px calc(24px + env(safe-area-inset-bottom,0px));font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif}' +
    '.gceu-box{background:#fff;color:#14202e;border-radius:14px;width:100%;max-width:900px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;box-sizing:border-box}' +
    '.gceu-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e6ebf1;background:#f7f9fc}.gceu-hd b{font-size:16px;flex:1;min-width:0;overflow-wrap:anywhere}' +
    '.gceu-bd{padding:10px 14px 16px}.gceu-k{font-weight:800;font-size:13px;color:#8a5a00;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.02em}' +
    '.gceu-b{border:1px solid #cfd8e3;background:#fff;color:#14202e;border-radius:10px;padding:10px 12px;font-weight:700;font-size:14px;cursor:pointer;min-height:44px;font-family:inherit}.gceu-b.pri{background:#0f1d2f;color:#fff;border-color:#0f1d2f}.gceu-b:disabled{opacity:.5}' +
    '.gceu-big{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;margin:8px 0}.gceu-big small{font-weight:500;color:#55626f;font-size:12.5px}' +
    '.gceu-two{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:640px){.gceu-two{grid-template-columns:1fr 1fr}}' +
    '.gceu-card{border:1px solid #e6ebf1;border-radius:12px;padding:10px;min-width:0}.gceu-card h4{margin:0 0 6px;font-size:14px}.gceu-card iframe{width:100%;height:300px;border:1px solid #e6ebf1;border-radius:8px;background:#fff}' +
    '.gceu-in{width:100%;box-sizing:border-box;border:1px solid #cfd8e3;border-radius:8px;padding:9px;font:inherit;font-size:16px;min-height:44px;background:#fff;color:#14202e}textarea.gceu-in{min-height:90px}' +
    '.gceu-lbl{display:block;font-size:12.5px;font-weight:700;color:#55626f;margin:10px 0 4px}.gceu-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.gceu-row>*{flex:1 1 140px}' +
    '.gceu-q{font-size:12px;color:#6b4f00;background:#fff8e1;border-radius:6px;padding:4px 7px;margin:4px 0;overflow-wrap:anywhere}.gceu-mut{font-size:12.5px;color:#55626f;margin:4px 0}' +
    '.gceu-cs{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:14px;margin:6px 0}.gceu-cs label{display:flex;gap:6px;align-items:center;min-height:44px}' +
    '.gceu-ph{display:grid;grid-template-columns:1fr 70px;gap:6px;margin:4px 0}.gceu-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.gceu-acts>*{flex:1 1 160px}' +
    '.gceu-est{display:flex;justify-content:space-between;gap:8px;width:100%;margin:6px 0;text-align:left}' +
    '#gceu-toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483600;background:#14202e;color:#fff;padding:12px 16px;border-radius:12px;font:700 14px Inter,Arial,sans-serif;max-width:92vw;display:none;text-align:center}#gceu-toast.bad{background:#991b1b}';
  D.head.appendChild(st);
}
function overlay(id, title, body){
  css(); var old = D.getElementById(id); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = id; ov.className = 'gceu-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1');
  ov.innerHTML = '<div class="gceu-box" role="dialog" aria-label="' + esc(title) + '"><div class="gceu-hd"><b>' + esc(title) + '</b><button type="button" class="gceu-b" data-eu="x" aria-label="Close">✕</button></div><div class="gceu-bd">' + body + '</div></div>';
  ov.addEventListener('click', function(e){ if (e.target === ov || (e.target.closest && e.target.closest('[data-eu="x"]'))) ov.remove(); });
  D.body.appendChild(ov); return ov;
}

/* the Field tile: 📤 Upload · 📘 Templates · this job's estimates */
function jobEsts(pid){ var l = []; try { l = W._gcEstimatesState || crm().estimates || []; } catch (e) {} var seen = {}; return (Array.isArray(l) ? l : []).filter(function(e){ if (!e || e.deleted || e._isDraft === true || s(e.pid) !== s(pid) || seen[e.id]) return false; seen[e.id] = 1; return true; }).sort(function(a, b){ return s(b.savedAt || b.createdAt).localeCompare(s(a.savedAt || a.createdAt)); }); }
function openTemplates(){
  try { if (D.documentElement.classList.contains('_fieldmode') && typeof W._gcChooseView === 'function') W._gcChooseView('desk'); } catch (e) {}
  later(function(){ try { if (W.gcEstSubtabs && W.gcEstSubtabs.show) W.gcEstSubtabs.show('templates'); else if (W._setView) W._setView('templates'); } catch (e) {} }, 350);
}
function menu(p){
  if (!p) return null;
  var es = jobEsts(p.id);
  var ov = overlay('gceu-menu', '📄 Estimate — ' + s(p.name),
    '<button type="button" class="gceu-b pri gceu-big" data-eu="up">📤 Upload estimate<small>PDF or Word (a Google Doc: File → Download → PDF). It becomes this job\'s estimate — nothing is sent.</small></button>' +
    '<button type="button" class="gceu-b gceu-big" data-eu="tpl">📘 Templates<small>The estimate templates (the same Templates screen as the desk)</small></button>' +
    (es.length ? '<div class="gceu-k">This job\'s estimates</div>' + es.slice(0, 12).map(function(e){ return '<button type="button" class="gceu-b gceu-est" data-eu="est" data-id="' + esc(e.id) + '"><span>' + esc(e.name || 'Estimate') + '</span><b>' + esc(money(num(e.totalCharge) || num(e.quoteTotal))) + '</b></button>'; }).join('') : ''));
  ov.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-eu]'); if (!b) return; var a = b.getAttribute('data-eu');
    if (a === 'up') { ov.remove(); if (E().upload) E().upload({ pid: s(p.id), stay: true }); }
    else if (a === 'tpl') { ov.remove(); openTemplates(); }
    else if (a === 'est') { ov.remove(); after(b.getAttribute('data-id'), {}); }
  });
  return ov;
}

/* ── the panel after an upload ── */
var STATE = {};
function isPdfRef(r){ return /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(s(r)); }
function tplDefaults(){
  var t = {}; try { t = X().tpl ? X().tpl() : {}; } catch (e) {}
  var bi = { notes: [], exclusions: [] }; try { bi = X().builtInLists ? X().builtInLists() : bi; } catch (e) {}
  var notes = Array.isArray(t.notes) && t.notes.length ? t.notes : bi.notes, exc = Array.isArray(t.exclusions) && t.exclusions.length ? t.exclusions : bi.exclusions;
  var war = (notes.filter(function(n){ return /^warranty:/i.test(n); })[0] || '').replace(/^warranty:\s*/i, '');
  return { notes: notes.filter(function(n){ return !/^warranty:/i.test(n) && !/^scheduling is pending/i.test(n); }), exclusions: exc, validDays: num(t.validDays) || 30, paymentTerms: s(t.paymentTerms), warranty: war };
}
var TERMS = [['', 'Template default (net 30)'], ['If Project is accepted, 50% is due as a deposit and 50% at completion.', '50% deposit · 50% at completion'],
  ['If Project is accepted, 30% is due as a deposit, 40% at the midpoint of the work and 30% at completion.', '30% deposit · 40% midpoint · 30% completion'],
  ['If Project is accepted, one third is due as a deposit, one third at rough-in and one third at completion.', '⅓ deposit · ⅓ rough-in · ⅓ completion'], ['custom', 'Custom…']];
function after(estId, o){
  o = o || {}; var e = est(estId) || (o.est && String(o.est.id) === String(estId) ? o.est : null); if (!e) { toast('Estimate not found.', true); return null; }   /* a just-saved estimate: the screen's list may not have it yet */
  var p = proj(e.pid) || {}, d = e.tplDetails && typeof e.tplDetails === 'object' ? e.tplDetails : {}, def = tplDefaults();
  var found = o.text ? schedFind(o.text) : (e.estupFound && e.estupFound.sched) || { phases: [] };
  var scope0 = s(d.scope) || (o.text ? scopeFromText(o.text) : s(e.estupFound && e.estupFound.scope)) || scopeFromEst(e);
  if (o.text) { try { X().setEst(e.id, { estupFound: { sched: found, scope: scope0, at: new Date().toISOString() } }); } catch (x) {} }
  var origPdf = isPdfRef(e.sourceRef), cs = s(e.customerSees) === 'template' || !origPdf ? 'template' : 'pdf';
  var st = STATE[e.id] = { cs: cs, prep: null };
  var start = s(d.start) || found.start || '', pl = plan(start, found, s(d.finish) || found.finish);
  var phases = Array.isArray(d.phases) && d.phases.length ? d.phases : pl.phases.length ? pl.phases : found.phases;
  var ms = /\bMS\b|mississippi/i.test(s(p.address || e.address)) || s(e.jobState) === 'MS';
  var termsSel = s(d.paymentTerms) ? (TERMS.some(function(t){ return t[0] === d.paymentTerms; }) ? d.paymentTerms : 'custom') : '';
  var q = function(t, k){ return t ? '<div class="gceu-q" data-eu-q="' + k + '">found in your PDF: “' + esc(t.slice(0, 200)) + '”</div>' : ''; };
  var phRow = function(x){ return '<div class="gceu-ph" data-eu-ph><input class="gceu-in" data-k="name" value="' + esc(x.name) + '" placeholder="Phase"><input class="gceu-in" data-k="days" inputmode="numeric" value="' + esc(String(x.days || '')) + '" placeholder="days"' + (x.cal ? ' data-cal="1"' : '') + '></div>' + (x.q ? q(x.q, 'ph') : ''); };
  var body =
    '<div class="gceu-mut">' + esc(money(num(e.totalCharge) || num(e.quoteTotal))) + ' · Job ' + esc(p.autoPO || p.po || '') + ' — ' + esc(p.name || '') + ' · saved as this job\'s estimate (the Bid / Estimate on the job). Nothing has gone to the customer.</div>' +
    '<div class="gceu-two">' +
      '<div class="gceu-card" data-eu-card="pdf"><h4>📎 Your original ' + (origPdf ? 'PDF' : 'file') + '</h4><div class="gceu-mut">' + esc(e.sourceName || 'the uploaded file') + '</div>' + (origPdf ? '' : '<div class="gceu-mut">A Word file: the customer can only get the template version — save it as PDF to send your own paper.</div>') + '<button type="button" class="gceu-b" data-eu="openorig">Open</button></div>' +
      '<div class="gceu-card" data-eu-card="template"><h4>📘 Template version</h4><iframe data-eu-prev title="Template version preview"></iframe><button type="button" class="gceu-b" data-eu="opentpl" style="margin-top:6px">Open full size</button></div>' +
    '</div>' +
    '<div class="gceu-cs" role="radiogroup" aria-label="Customer sees"><b>Customer sees:</b><label><input type="radio" name="gceu-cs" data-eu-cs value="pdf"' + (cs === 'pdf' ? ' checked' : '') + (origPdf ? '' : ' disabled') + '> My PDF (original)</label><label><input type="radio" name="gceu-cs" data-eu-cs value="template"' + (cs === 'template' ? ' checked' : '') + '> Template version</label></div>' +
    '<div class="gceu-k">📅 Schedule <span style="text-transform:none;font-weight:500;color:#55626f">(optional — feeds the template)</span></div>' +
    '<div class="gceu-row"><label><span class="gceu-lbl">Start date</span><input type="date" class="gceu-in" data-eu-f="start" value="' + esc(start) + '"></label><label><span class="gceu-lbl">Finish date</span><input type="date" class="gceu-in" data-eu-f="finish" value="' + esc(pl.finish) + '"' + (s(d.finish) || found.finish ? ' data-typed="1"' : '') + '></label></div>' +
    q(found.startQ, 'start') + q(found.finishQ, 'finish') + q(found.durQ, 'dur') +
    '<span class="gceu-lbl">Phases (working days, Mon–Fri)</span><div data-eu-phs>' + (phases.length ? phases : [{ name: '', days: '' }]).map(phRow).join('') + '</div><button type="button" class="gceu-b" data-eu="addph">＋ Phase</button> ' +
    '<button type="button" class="gceu-b pri" data-eu="sched" style="margin-top:8px">📅 Make schedule for job</button><div class="gceu-mut" data-eu-schedmsg>Tentative items on the job\'s Schedule tab — made only when you tap. Nothing is sent to anyone.</div>' +
    '<div data-eu-details' + (cs === 'template' ? '' : ' hidden') + '>' +
      '<div class="gceu-k">📘 Template details</div>' +
      '<div class="gceu-mut">From the job: ' + esc([p.client || e.client, p.address || e.address, p.autoPO ? 'PO ' + p.autoPO : '', p.pm ? 'PM ' + p.pm : '', e.estimator ? 'Estimator ' + e.estimator : '', ms ? 'Mississippi (3.5% contractor\'s tax)' : 'Tennessee'].filter(Boolean).join(' · ')) + '. Required for the template: only the estimate name and total (already in). The rest is optional.</div>' +
      '<label class="gceu-lbl">Scope of work — wording only (built from your estimate; add more if you need)</label><textarea class="gceu-in" data-eu-f="scope" rows="6" placeholder="One item per line">' + esc(scope0) + '</textarea>' +
      (ms ? '<label class="gceu-lbl"><input type="checkbox" data-eu-f="msin"' + (d.msIncluded === false ? '' : ' checked') + '> The total already includes the MS contractor\'s tax (charged once)</label>' : '') +
      '<label class="gceu-lbl">Payment terms</label><select class="gceu-in" data-eu-f="terms">' + TERMS.map(function(t){ return '<option value="' + esc(t[0]) + '"' + (t[0] === termsSel ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') + '</select>' +
      '<input class="gceu-in" data-eu-f="termsx" placeholder="Your payment terms" value="' + esc(termsSel === 'custom' ? d.paymentTerms : '') + '"' + (termsSel === 'custom' ? '' : ' hidden') + ' style="margin-top:6px">' +
      '<div class="gceu-row"><label><span class="gceu-lbl">Valid until</span><input type="date" class="gceu-in" data-eu-f="valid" value="' + esc(s(d.validUntil) || ymd(new Date(Date.now() + def.validDays * 864e5))) + '"></label>' +
      '<label><span class="gceu-lbl">Warranty</span><input class="gceu-in" data-eu-f="warranty" value="' + esc(s(d.warranty) || def.warranty) + '"></label></div>' +
      '<label class="gceu-lbl">Exclusions (one per line)</label><textarea class="gceu-in" data-eu-f="exc" rows="4">' + esc((Array.isArray(d.exclusions) && d.exclusions.length ? d.exclusions : def.exclusions).join('\n')) + '</textarea>' +
      '<label class="gceu-lbl">Notes (one per line)</label><textarea class="gceu-in" data-eu-f="notes" rows="4">' + esc((Array.isArray(d.notes) && d.notes.length ? d.notes : def.notes).join('\n')) + '</textarea>' +
      '<button type="button" class="gceu-b pri" data-eu="savetpl" style="margin-top:8px">💾 Save template details</button>' +
    '</div>' +
    '<div data-eu-scopemsg class="gceu-mut"></div>' +
    '<div class="gceu-k">Send — <span data-eu-which>' + (cs === 'pdf' ? 'My PDF (original)' : 'Template version') + '</span></div>' +
    '<div class="gceu-acts"><button type="button" class="gceu-b pri" data-eu="portal">📨 Put in customer portal</button><button type="button" class="gceu-b" data-eu="share">✉️ Send it myself</button><button type="button" class="gceu-b" data-eu="dl">⬇️ Download</button></div>' +
    '<div class="gceu-mut">📨 waits on ✅ Approvals before the customer sees it. ✉️ opens your phone\'s share sheet (e-mail, text) — or downloads it.</div>';
  var ov = overlay('gceu-after', '📄 ' + s(e.name || 'Estimate'), body); ov.setAttribute('data-id', e.id);
  var F = function(k){ return ov.querySelector('[data-eu-f="' + k + '"]'); };
  function details(){
    var terms = F('terms') ? F('terms').value : ''; if (terms === 'custom') terms = s(F('termsx').value);
    var vu = F('valid') ? dOf(F('valid').value) : null, vd = vu ? Math.max(1, Math.round((vu - dOf(today())) / 864e5)) : 0;
    var lines = function(k){ return F(k) ? F(k).value.split('\n').map(s).filter(Boolean) : []; };
    var sc = F('scope') ? (W._gcScopeWords ? W._gcScopeWords(F('scope').value) : F('scope').value) : '';
    return { scope: s(sc), paymentTerms: terms, validUntil: F('valid') ? F('valid').value : '', validDays: vd, warranty: F('warranty') ? s(F('warranty').value) : '', exclusions: lines('exc'), notes: lines('notes'),
      msIncluded: F('msin') ? !!F('msin').checked : undefined, start: F('start').value, finish: F('finish').value, phases: readPhases(), savedAt: new Date().toISOString(), by: me() };
  }
  function readPhases(){ return Array.prototype.map.call(ov.querySelectorAll('[data-eu-ph]'), function(r){ var dd = r.querySelector('[data-k="days"]'); return { name: s(r.querySelector('[data-k="name"]').value), days: Math.round(num(dd.value)), cal: dd.getAttribute('data-cal') === '1' }; }).filter(function(x){ return x.name && x.days > 0; }); }
  function replan(){
    var f = { phases: readPhases(), days: found.days, cal: found.cal }, fin = F('finish');
    if (fin.getAttribute('data-typed') === '1') return;
    var r = plan(F('start').value, f, ''); if (r.finish) fin.value = r.finish;
  }
  function preview(){
    var cur = est(e.id) || e, html = '';
    try { html = E().proposalHtml ? E().proposalHtml(Object.assign({}, cur, { tplDetails: Object.assign({}, cur.tplDetails || {}, details()) })) : ''; } catch (x) { html = ''; }
    var fr = ov.querySelector('[data-eu-prev]'); if (fr) fr.srcdoc = html || '<p style="font-family:Arial;padding:12px">The template could not be made on this phone.</p>';
    st.html = html; st.prep = null; st.file = null; clearTimeout(st.pt); st.pt = later(function(){ if (D.body.contains(ov)) prep(); }, 700); return html;
  }
  preview();
  ov.addEventListener('change', function(ev){
    var t = ev.target;
    if (t.hasAttribute('data-eu-cs')) { st.cs = t.value; ov.querySelector('[data-eu-details]').hidden = st.cs !== 'template'; ov.querySelector('[data-eu-which]').textContent = st.cs === 'pdf' ? 'My PDF (original)' : 'Template version'; try { X().setEst(e.id, { customerSees: st.cs, customerSeesBy: me(), customerSeesAt: new Date().toISOString() }); } catch (x) {} st.prep = null; st.file = null; prep(); }
    else if (t === F('terms')) { F('termsx').hidden = t.value !== 'custom'; preview(); }
    else if (t === F('finish')) t.setAttribute('data-typed', t.value ? '1' : '');
    else if (t === F('start') || (t.closest && t.closest('[data-eu-ph]'))) replan();
    if (t !== F('terms') && t.closest && t.closest('[data-eu-details]')) preview();
  });
  ov.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-eu]'); if (!b) return; var a = b.getAttribute('data-eu');
    if (a === 'addph') { ov.querySelector('[data-eu-phs]').insertAdjacentHTML('beforeend', phRow({ name: '', days: '' })); return; }
    if (a === 'openorig') { if (!e.sourceRef) return; if (W._gcViewer) W._gcViewer.open({ ref: e.sourceRef, name: e.sourceName }); else if (W._gcOpenRef) W._gcOpenRef(e.sourceRef, e.sourceName); return; }
    if (a === 'opentpl') { var h = st.html || preview(); try { if (W._gcOpenDocHTML) W._gcOpenDocHTML(h); else { var w = W.open('', '_blank'); if (w) { w.document.write(h); w.document.close(); } } } catch (x) {} return; }
    if (a === 'savetpl') { saveDetails(); toast('📘 Template details saved'); offerScope(); return; }
    if (a === 'sched') { saveDetails(); makeSchedule(); offerScope(); return; }
    if (a === 'portal') { return toPortal(b); }
    if (a === 'share' || a === 'dl') { return sendOut(a, b); }
  });
  function saveDetails(){ var dt = details(); try { X().setEst(e.id, { tplDetails: dt, scopeSummary: '' }); } catch (x) {} preview(); return dt; }
  /* the job's Scope of Work (Field Job Info + desk Scope): written when empty, never overwritten */
  function offerScope(){
    var sc = s(F('scope') ? (W._gcScopeWords ? W._gcScopeWords(F('scope').value) : F('scope').value) : scope0), box = ov.querySelector('[data-eu-scopemsg]'), job = proj(e.pid);
    if (!sc || !job) return;
    if (!s(job.scopeOfWork) && !s(job.scope)) { saveJob(job.id, { scopeOfWork: sc, scope: sc, scopeFrom: { estId: e.id, at: new Date().toISOString(), by: me() } }); box.innerHTML = '📝 The scope is now the job\'s Scope of Work.'; return; }
    if ((s(job.scopeOfWork) + '\n' + s(job.scope)).indexOf(sc) >= 0) { box.textContent = ''; return; }
    box.innerHTML = 'The job already has a Scope of Work (left as it is). <button type="button" class="gceu-b" data-eu-add>＋ Add to job scope</button>';
    box.querySelector('[data-eu-add]').onclick = function(){ var j = proj(e.pid) || job; saveJob(j.id, { scopeOfWork: (s(j.scopeOfWork) ? s(j.scopeOfWork) + '\n\n' : '') + sc, scope: (s(j.scope) ? s(j.scope) + '\n\n' : '') + sc }); box.textContent = '📝 Added to the job\'s Scope of Work.'; };
  }
  function makeSchedule(){
    var start = F('start').value, phs = readPhases(), msg = ov.querySelector('[data-eu-schedmsg]');
    if (!start) { toast('Pick a start date first.', true); F('start').focus(); return; }
    var r = plan(start, { phases: phs, days: found.days, cal: found.cal }, F('finish').getAttribute('data-typed') === '1' ? F('finish').value : '');
    var fin = s(F('finish').value) || r.finish, job = proj(e.pid) || {}, by = me(), stamp = Date.now().toString(36);
    var base = { pid: s(e.pid), time: '', endTime: '', assignee: s(job.pm), vendor: '', type: 'work', address: s(job.address), scope: 'tentative', tentative: true, source: 'estimate', estId: e.id, by: by,
      notes: 'From the estimate "' + s(e.name) + '" (📅 Make schedule) — tentative until the customer signs.' };
    var items = r.phases.length ? r.phases.map(function(x, i){ return Object.assign({}, base, { id: 'SCH' + stamp + '_' + i, title: x.name, date: x.start, endDateSch: x.end }); })
      : [Object.assign({}, base, { id: 'SCH' + stamp + '_0', title: s(e.name) || 'Work', date: firstWorking(start), endDateSch: fin && fin > start ? fin : '' })];
    saveSchedule(items).then(function(n){ msg.textContent = n ? '📅 ' + n + ' item' + (n === 1 ? '' : 's') + ' on the job\'s Schedule (tentative)' + (fin ? ', ' + start + ' → ' + fin : '') + '.' : 'Already on the Schedule.'; toast(msg.textContent); });
  }
  function toPortal(b){
    saveDetails();
    try { X().setEst(e.id, { customerSees: st.cs, estinWait: false, estinNow: true, customerSeesBy: me(), customerSeesAt: new Date().toISOString() }); } catch (x) {}
    b.disabled = true; b.textContent = 'Making the approval…';
    var cur = Object.assign({}, est(e.id) || e, { customerSees: st.cs, estinWait: false, estinNow: true });
    return Promise.resolve(E().process ? E().process(cur, true) : { ok: false, error: 'not ready' }).then(function(r){
      b.disabled = false; b.textContent = '📨 Put in customer portal';
      if (r && r.ok) toast('📨 On ✅ Approvals — the customer sees it in the portal after it is approved.'); else toast('Not done: ' + s(r && (r.error || r.skip) || 'try again'), true);
      return r;
    });
  }
  /* the chosen version as a PDF file, made before the tap (a phone's share sheet needs the file at the tap) */
  function prep(){
    if (st.prep) return st.prep;
    var nm = s(e.name || 'Estimate').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
    st.prep = (st.cs === 'pdf' ? Promise.resolve(W._gcFileBlob ? W._gcFileBlob(e.sourceRef) : null).then(function(bl){ return bl ? new File([bl], (s(e.sourceName) || nm + '.pdf').replace(/(\.pdf)?$/i, '.pdf'), { type: 'application/pdf' }) : null; })
      : Promise.resolve(X().pdfBlob ? X().pdfBlob(st.html || preview()) : null).then(function(bl){ return bl ? new File([bl], 'Proposal - ' + nm + '.pdf', { type: 'application/pdf' }) : null; }))
      .then(function(f){ if (st.prep === pr) st.file = f; return f; }, function(){ return null; });
    var pr = st.prep; return pr;
  }
  prep();
  function download(f){ var u = URL.createObjectURL(f), a = D.createElement('a'); a.href = u; a.download = f.name; a.rel = 'noopener'; D.body.appendChild(a); a.click(); later(function(){ URL.revokeObjectURL(u); a.remove(); }, 4000); }
  function sendOut(a, b){
    var f = st.file;
    if (!f) {
      toast('Making the PDF…');
      return prep().then(function(f2){
        if (!f2) { if (st.cs === 'template') { toast('The PDF could not be made here — the template opens: use Save as PDF / Print.', true); try { if (W._gcOpenDocHTML) W._gcOpenDocHTML(st.html || preview()); } catch (x) {} } else toast('The file cannot be read right now.', true); return; }
        download(f2); toast('⬇️ Downloaded — attach it to your e-mail or text.');
      });
    }
    if (a === 'share' && W.navigator && typeof W.navigator.share === 'function' && (!W.navigator.canShare || W.navigator.canShare({ files: [f] }))) {
      W.navigator.share({ files: [f], title: s(e.name || 'Estimate'), text: 'Estimate from GrayCo Construction — ' + s(e.name) }).then(function(){ toast('✉️ Shared.'); }, function(err){ if (err && err.name === 'AbortError') return; download(f); });
      return;
    }
    download(f); toast(a === 'share' ? '⬇️ Downloaded — attach it to your e-mail or text.' : '⬇️ Downloaded.');
  }
  return ov;
}
/* the job record and the schedule — the CRM's own lists (the screen, this device, the cloud) */
function saveJob(pid, ch){
  var now = new Date().toISOString(), list = (crm().projects || []).map(function(p){ return p && s(p.id) === s(pid) ? Object.assign({}, p, ch, { updatedAt: now, savedAt: now }) : p; });
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('estimate scope'); } catch (e) {}
  try { if (W._crm) W._crm.projects = list; } catch (e) {}
  try { if (W._setProjects) W._setProjects(function(prev){ return Array.isArray(prev) ? prev.map(function(p){ return p && s(p.id) === s(pid) ? Object.assign({}, p, ch, { updatedAt: now, savedAt: now }) : p; }) : list; }); } catch (e) {}
  try { if (W.idbSet) W.idbSet('projects', list); } catch (e) {}
  try { if (W._supaUpsert) W._supaUpsert('projects', list); } catch (e) {}
  later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
}
function saveSchedule(items){
  return Promise.resolve(W.idbGet ? W.idbGet('schedule') : null).then(null, function(){ return null; }).then(function(dev){
    var cur = Array.isArray(crm().schedule) && crm().schedule.length ? crm().schedule : (Array.isArray(dev) ? dev : []);
    var add = items.filter(function(m){ return !cur.some(function(x){ return x && s(x.pid) === s(m.pid) && s(x.title) === s(m.title) && s(x.date) === s(m.date); }); });
    if (!add.length) return 0;
    var next = cur.concat(add);
    try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('estimate schedule'); } catch (e) {}
    try { if (W._setSchedule) W._setSchedule(function(prev){ var live = Array.isArray(prev) ? prev : cur; return live.concat(add.filter(function(m){ return !live.some(function(x){ return x && x.id === m.id; }); })); }); } catch (e) {}
    try { if (W._crm) W._crm.schedule = next; } catch (e) {}
    try { if (W.idbSet) W.idbSet('schedule', next); } catch (e) {}
    try { if (W._supaUpsert) W._supaUpsert('schedule', next); } catch (e) {}
    later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
    return add.length;
  });
}
W._gcEstUp = { menu: menu, after: after, templates: openTemplates, parse: W._gcEstUpParse };
try { console.log('[GC] 📄 Upload estimate: the panel (original / template, schedule, send) — patch ESTUPLOAD (_gcEstUp)'); } catch (e) {}
})();
</script>
