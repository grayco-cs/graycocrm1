<script>/*__GC_PATCH_METALSEL__ (owner 11/9: "metal roof colors and panel types — make sure in customer selection portal area").
  A metal-roof job that has not started (bidding / estimating / approved) gets three choices in the customer's portal by itself, once:
  Watson Metals panel type · roof color (WeatherXL SMP, 29 ga — every color, with swatches) · trim color. The PM can change or remove
  them (🎨 Customer choices on the job); the customer picks in the portal (their pick = their signature). */
(function(W){
'use strict';
var RE = /metal\s*roof|standing\s*seam|r-?\s?panel|\bpbr\b|tuff\s*rib|\b5\s?v\b|metal\s*panels?|exposed\s*fastener/i;
var PRE = /^(bidding|estimating|approved|)$/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function words(p){
  var t = [p.name, p.type, p.jobType, p.scope, p.notes, p.description, p.scopeNotes, p.workDescription].filter(Boolean).join(' ');
  try { var E = (W._gcEST && W._gcEST.all) ? W._gcEST.all() : ((W._crm && W._crm.estimates) || []), po = [p.po, p.autoPO].filter(Boolean).map(function(c){ return String(c).toLowerCase(); });
    (Array.isArray(E) ? E : []).forEach(function(e){ if (e && (String(e.pid || e.projectId || '') === String(p.id) || (e.po && po.indexOf(String(e.po).toLowerCase()) > -1))) { t += ' ' + s(e.name) + ' ' + s(e.notes); (e.lines || []).slice(0, 300).forEach(function(l){ t += ' ' + s(l && (l.desc || l.name)) + ' ' + s(l && l.cat); }); } }); } catch (e) {}
  return t;
}
var LINES = [['Panel type', 'Which metal panel do you want? (Watson Metals)'], ['WeatherXL SMP colors — 29 ga', 'Roof color (Sherwin-Williams WeatherXL). Premium colors cost a little more.'], ['Trim color (custom trim, all stocked colors)', 'Trim color — ridge cap, gable, eave and corner trim.']];
var BUSY = false, LAST = 0;
async function run(){
  if (BUSY || Date.now() - LAST < 60000) return; LAST = Date.now();
  var I = W._gcCH && W._gcCH._i; if (!I || !I.putChoice || !I.jobChoices) return;
  try { if (!(W.__GC_AUTH__ && W.__GC_AUTH__.email())) return; var st = W._gcPause && W._gcPause.state(); if (st && st.paused) return; } catch (e) { return; }
  BUSY = true;
  try {
    var P = ((W._crm && W._crm.projects) || []).filter(function(p){ return p && p.id && !p.deleted && !p.metalSelAuto && PRE.test(s(p.status)) && RE.test(words(p)); });
    for (var i = 0; i < P.length && i < 10; i++) {
      var p = P[i], have = (I.jobChoices(p.id) || []).some(function(c){ return c && s(c.brand) === 'Watson Metals'; });
      if (!have) {
        var now = new Date().toISOString();
        for (var k = 0; k < LINES.length; k++) {
          await I.putChoice(p.id, { id: 'ch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cat: 'Metal roofing', brand: 'Watson Metals', line: LINES[k][0], anyInLine: true, options: [],
            dueBy: '', note: LINES[k][1], at: now, by: 'CRM (metal roof job)', offerAt: now, portal: true, auto: 'metalsel' });
        }
      }
      var at = new Date().toISOString(), id = p.id;
      var f = function(list){ return (list || []).map(function(q){ return q && q.id === id ? Object.assign({}, q, { metalSelAuto: at, updatedAt: at }) : q; }); };
      if (W._setProjects) W._setProjects(f); else if (W._crm) W._crm.projects = f(W._crm.projects);
    }
    try { if (P.length && W._gcApplySync && W._crm) W._gcApplySync('projects', W._crm.projects); } catch (e) {}
  } catch (e) {} finally { BUSY = false; }
}
setTimeout(function(){ run(); setInterval(run, 60000); }, 30000);
W._gcMetalSel = { run: function(){ LAST = 0; return run(); }, words: words, RE: RE };
})(window);
</script>
