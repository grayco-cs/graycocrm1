<script id="gc-patch-jobsteps">
/* __GC_PATCH_JOBSTEPS__ — 🧭 STEPS & PAPERS ON EVERY JOB (owner 11/9: "all of the steps you have to take, what document to send
   to who etc, all of that needs to be in the crm when you get documents for mold, insurance, lead, asbestos etc").
   • Job page (desk, Job tools): "🧭 Steps & papers" — for the kinds of work the job's words call for (the same words as
     📋 Documents for this Job: water, fire, mold, storm, insurance, lead, asbestos), the steps in order: WHEN · WHAT ·
     the PAPER (opens filled in with the job) · WHO it goes to (customer, adjuster, sub, state office, file) · ✓ Done
     (who / when; saved on the job, project.steps). Lead + asbestos follow the owner's "CRM Setup – When to Send Each
     Form" guide; water / fire / mold / storm follow standard restoration practice (IICRC S500 / S520).
   API: window._gcJobSteps = { forJob(p), done(pid, id, on) } */
(function(W){
'use strict';
if (W.__GC_PATCH_JOBSTEPS__) return; W.__GC_PATCH_JOBSTEPS__ = true;
var D = W.document, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nice(iso){ var d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate(); }
/* [id, when, what, paper (doc library id or ''), who] */
var PLAY = {
 water: ['💧 Water damage', [
  ['w1', 'First visit', 'Stop or confirm the water source is off; photos of every room; moisture readings', '', 'File (job photos)'],
  ['w2', 'Before work starts', 'Emergency services authorization signed', 'gcb_water_emergency_auth', 'Customer signs'],
  ['w3', 'First visit', 'Category & class of the loss recorded', 'gcb_water_category_report', 'File · adjuster on request'],
  ['w4', 'When equipment is set', 'Equipment responsibility sheet left with the customer', 'gcb_water_equipment_resp', 'Customer'],
  ['w5', 'Cat 2 / 3 or mold risk', 'Antimicrobial consent before applying', 'gcb_antimicrobial_consent', 'Customer signs'],
  ['w6', 'Every visit', 'Moisture / drying log readings', 'gcb_drying_log', 'File · adjuster'],
  ['w7', 'Items cannot be saved', 'Non-salvageable contents list + disposal OK', 'gcb_contents_disposal', 'Customer signs · adjuster copy'],
  ['w8', 'Dry standard reached', 'Certificate of drying', 'gcb_water_dry_cert', 'Customer · adjuster'],
  ['w9', 'Equipment pulled', 'Equipment removal & walk-through sign-off', 'gcb_equipment_removal_signoff', 'Customer signs'],
  ['w10', 'Within 48 hours of drying', 'Mitigation invoice + photos + drying log to the carrier', '', 'Adjuster / carrier']]],
 fire: ['🔥 Fire & smoke', [
  ['f1', 'First visit', 'Board-up / tarp authorization for emergency protection', 'gcb_board_up_auth', 'Customer signs'],
  ['f2', 'Before work starts', 'Fire & smoke work authorization', 'gcb_fire_work_auth', 'Customer signs'],
  ['f3', 'Contents leave the home', 'Pack-out authorization + inventory', 'gcb_packout_auth', 'Customer signs · adjuster copy'],
  ['f4', 'Before ozone / fogging', 'Odor-control safety notice (building empty for ozone)', 'gcb_odor_control_notice', 'Customer'],
  ['f5', 'Items cannot be saved', 'Non-salvageable contents disposal', 'gcb_contents_disposal', 'Customer signs · adjuster copy'],
  ['f6', 'Cleaning done', 'Photos + scope to the adjuster for the rebuild estimate', '', 'Adjuster / carrier']]],
 mold: ['🍄 Mold', [
  ['m1', 'Before any removal', 'Mold disclosure', 'gcb_mold', 'Customer signs'],
  ['m2', 'Before any removal', 'Assessment / testing authorization (independent assessor)', 'gcb_mold_assessment_auth', 'Customer signs · assessor'],
  ['m3', 'After the protocol', 'Mold remediation agreement', 'gcb_mold_contract', 'Customer signs'],
  ['m4', 'Containment goes up', 'Containment & work-area notice', 'gcb_mold_containment_notice', 'Customer · occupants'],
  ['m5', 'Work done', 'Post-remediation verification (+ clearance report)', 'gcb_mold_clearance_cert', 'Customer · adjuster']]],
 storm: ['🌪 Storm & disaster', [
  ['s1', 'First visit', 'Storm inspection authorization', 'gcb_storm_inspection_auth', 'Customer signs'],
  ['s2', 'Emergency protection', 'Board-up / tarp authorization', 'gcb_board_up_auth', 'Customer signs'],
  ['s3', 'Tree on the structure', 'Tree / debris removal authorization', 'gcb_tree_removal_release', 'Customer signs'],
  ['s4', 'First visit', '"After the loss" information sheet', 'gcb_disaster_customer_info', 'Customer']]],
 insurance: ['🛡 Insurance claim', [
  ['i1', 'Before work starts', 'Work authorization', 'gcb_work_auth', 'Customer signs'],
  ['i2', 'Before work starts', 'Direction to pay (carrier pays GrayCo)', 'gcb_direction_to_pay', 'Customer signs · carrier copy'],
  ['i3', 'First visit', 'Photo & documentation consent', 'gcb_photo_consent', 'Customer signs'],
  ['i4', 'Something hidden is found', 'Hidden-damage notice (then a change order / supplement)', 'gcb_hidden_damage_notice', 'Customer · adjuster'],
  ['i5', 'Customer declines recommended work', 'Declined-services release', 'gcb_declined_services_release', 'Customer signs'],
  ['i6', 'Job finished', 'Certificate of satisfaction', 'gcb_satisfaction', 'Customer signs · carrier (final payment)']]],
 lead: ['🧪 Lead (pre-1978, disturbs paint)', [
  ['l1', 'No more than 60 days before start', 'Lead 01 + the EPA "Renovate Right" pamphlet — signature before day 1 (or mail 7+ days before and keep the receipt)', 'gcb_lead_01', 'Owner (+ adult occupant)'],
  ['l2', 'Child-occupied (school, daycare, Head Start)', 'Lead 02 notice — post it or give one to each family before work starts', 'gcb_lead_02', 'Facility · parents'],
  ['l3', 'Before the crew starts', 'Certified renovator named for this job (Form F13); untrained workers trained on the job (Lead 04)', 'gcb_lead_04', 'File (job binder)'],
  ['l4', 'Before the crew starts', 'Supply & equipment checklist loaded', 'gcb_lead_06', 'File'],
  ['l5', 'Within 30 days of completion', 'Lead 03 completion record, signed by the certified renovator (alert at day 20)', 'gcb_lead_03', 'Owner / person who contracted'],
  ['l6', 'Test kits used — within 30 days', 'Lead 05 test-kit results (kit maker + model, components + locations, results)', 'gcb_lead_05', 'Person who contracted'],
  ['l7', 'HUD-assisted home', 'HUD notice to the occupant within 15 days of completion + clearance testing', '', 'Occupant · certified inspector'],
  ['l8', 'Always', 'Keep every signed form 3 years', '', 'File']]],
 asbestos: ['☣️ Asbestos', [
  ['a1', 'Before materials are disturbed', 'Asbestos testing / survey authorization', 'gcb_asb_testing_auth', 'Customer signs · inspector'],
  ['a2', 'Before day 1', 'Asbestos 01 disclosure & acknowledgment — signed', 'gcb_asb_01', 'Customer signs'],
  ['a3', 'Commercial / 5+ units', 'Survey on file + the abatement sub files the state notice 10 working days before demo (TDEC / MDEQ / ADEQ)', '', 'Licensed abatement sub · state office'],
  ['a4', 'Suspect material found mid-job', 'Stop-work notice; test; abatement by change order', 'gcb_asb_stop_work', 'Customer'],
  ['a5', 'At completion', 'Asbestos 02 records transmittal with the abatement records', 'gcb_asb_02', 'Customer']]]
};
function kinds(p){
  var have = (typeof W._gcDocKeys === 'function') ? W._gcDocKeys(p) : [], k = [];
  var hit = function(re){ return have.some(function(id){ return re.test(id); }); };
  var t = (s(p.type) + ' ' + s(p.jobType)).toLowerCase();
  if (hit(/water|drying|mitigation/)) k.push('water');
  if (hit(/fire_work|odor|packout/)) k.push('fire');
  if (hit(/mold/)) k.push('mold');
  if (hit(/storm|board_up|tree_removal/)) k.push('storm');
  if (hit(/direction_to_pay|photo_consent/) || /insurance|claim/.test(t)) k.push('insurance');
  if (hit(/lead_0/)) k.push('lead');
  if (hit(/asb_/)) k.push('asbestos');
  return k;
}
function proj(pid){ return ((W._crm && W._crm.projects) || []).find(function(x){ return x && x.id === pid; }) || null; }
function me(){ try { return s(JSON.parse(localStorage.getItem('grayco_user') || '{}').name) || 'someone'; } catch (e) { return 'someone'; } }
function done(pid, id, on){
  var now = new Date().toISOString();
  var f = function(list){ var out = (list || []).map(function(p){ if (!p || p.id !== pid) return p; var n = Object.assign({}, p), st = Object.assign({}, p.steps || {}); if (on) st[id] = { by: me(), at: now }; else delete st[id]; n.steps = st; n.updatedAt = now; return n; }); try { if (W._gcApplySync) W._gcApplySync('projects', out); } catch (e) {} return out; };
  if (W._setProjects) W._setProjects(f); else if (W._crm) W._crm.projects = f(W._crm.projects);
}
function css(){
  if (D.getElementById('gc-js-css')) return;
  var st = D.createElement('style'); st.id = 'gc-js-css';
  st.textContent = '.gc-js{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #0f766e;border-radius:12px;padding:12px 14px;margin:0 0 10px;font:14px Inter,Arial,sans-serif;color:#0f172a}'
    + '.gc-js h4{margin:0 0 4px;font-size:15px}.gc-js details{border-top:1px solid #e2e8f0;padding:6px 0}.gc-js summary{cursor:pointer;font-weight:700}'
    + '.gc-js .st{display:grid;grid-template-columns:26px 1fr;gap:6px;padding:6px 0;border-top:1px solid #f1f5f9}.gc-js .st input{width:20px;height:20px;margin-top:2px}'
    + '.gc-js .w{color:#0f766e;font-size:12px;font-weight:700}.gc-js .m{color:#64748b;font-size:12.5px}.gc-js .done .x{text-decoration:line-through;color:#64748b}'
    + '.gc-js button{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:3px 9px;font:600 12px Inter,Arial,sans-serif;cursor:pointer;margin-top:3px}';
  D.head.appendChild(st);
}
function html(p){
  var K = kinds(p), st = p.steps || {}, h = '<h4>🧭 Steps & papers</h4><div class="m">What to do, which paper, and who it goes to — in order. Papers open filled in with this job.</div>';
  K.forEach(function(k){
    var g = PLAY[k], n = g[1].length, d = g[1].filter(function(x){ return st[x[0]]; }).length;
    h += '<details' + (d < n ? ' open' : '') + '><summary>' + esc(g[0]) + ' · ' + d + '/' + n + '</summary>';
    g[1].forEach(function(x){ var ok = st[x[0]];
      h += '<div class="st' + (ok ? ' done' : '') + '" data-step="' + esc(x[0]) + '"><input type="checkbox" data-js-done' + (ok ? ' checked' : '') + ' aria-label="Done"><div><div class="w">' + esc(x[1]) + '</div><div class="x">' + esc(x[2]) + '</div><div class="m">→ ' + esc(x[4]) + (ok ? ' · ✓ ' + esc(ok.by) + ' ' + esc(nice(ok.at)) : '') + '</div>'
        + (x[3] ? '<button type="button" data-js-doc="' + esc(x[3]) + '">📄 Open the paper</button>' : '') + (x[3] === 'gcb_lead_01' ? ' <a href="/epa-renovate-right.pdf" target="_blank" rel="noopener" style="display:inline-block;border:1px solid #cbd5e1;border-radius:7px;padding:3px 9px;font:600 12px Inter,Arial,sans-serif;color:#0f172a;text-decoration:none;margin-top:3px">📘 EPA pamphlet (print / give)</a>' : '')   /* EPAPAM */ + '</div></div>'; });
    h += '</details>';
  });
  return h;
}
function findBack(){ var m = D.querySelector('main'); if (!m) return null; var bs = m.getElementsByTagName('button'); for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) return bs[i]; return null; }
function paint(){
  try {
    if (D.hidden || D.documentElement.classList.contains('_fieldmode')) return;
    var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, cur = D.getElementById('gc-js');
    if (!p || !kinds(p).length) { if (cur) cur.remove(); return; }
    var back = findBack(); if (!back || typeof W._gcJobBox !== 'function') return;
    var box = W._gcJobBox(back); if (!box) return; css();
    var sig = JSON.stringify([p.id, kinds(p), p.steps || {}]);
    if (cur && cur.parentElement === box && cur.getAttribute('data-sig') === sig) return;
    var open = cur ? [].map.call(cur.querySelectorAll('details'), function(d){ return d.open; }) : null;
    if (!cur) { cur = D.createElement('div'); cur.id = 'gc-js'; cur.className = 'gc-js'; cur.setAttribute('data-gc-keep', '1'); }
    cur.setAttribute('data-pid', p.id); cur.setAttribute('data-sig', sig); cur.innerHTML = html(p);
    if (open) [].forEach.call(cur.querySelectorAll('details'), function(d, i){ if (open[i] != null) d.open = open[i]; });
    if (cur.parentElement !== box) box.insertBefore(cur, box.firstChild);
  } catch (e) {}
}
D.addEventListener('change', function(e){ var t = e.target; if (!t.hasAttribute || !t.hasAttribute('data-js-done')) return; var c = D.getElementById('gc-js'); if (!c || !c.contains(t)) return; done(c.getAttribute('data-pid'), t.closest('[data-step]').getAttribute('data-step'), t.checked); }, true);
D.addEventListener('click', function(e){ var b = e.target && e.target.closest ? e.target.closest('#gc-js [data-js-doc]') : null; if (!b) return; var c = D.getElementById('gc-js'); try { W._gcDocLib.open(b.getAttribute('data-js-doc'), c.getAttribute('data-pid')); } catch (x) {} }, true);
SI.call(W, paint, 1400);
W._gcJobSteps = { forJob: function(p){ return kinds(p).map(function(k){ return { kind: k, title: PLAY[k][0], steps: PLAY[k][1] }; }); }, done: done, PLAY: PLAY };
})(window);
</script>
