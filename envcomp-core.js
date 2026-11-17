/* envcomp-core.js — ENVCOMP: the environmental compliance rules and checks, ONE copy for the CRM page (index.html loads
   /envcomp-core.js → window._gcEnvCompCore) and the server (netlify/functions/_lib/envcomp.js requires '../../../envcomp-core.js').
   Owner 11/16: "Has to have compliance program when all lead, asbestos or environmental job is happening — air testing etc."

   Nothing here is legal text. Every default list (certifications by job type, air monitoring, state notices, the daily log, the
   written programs, record keeping, medical surveillance intervals, medical removal) is a STARTING POINT that admins edit
   (gc_kv gc_envcomp_rules) — each is labelled "default — confirm with your state program / physician / attorney".

   evaluate(job, ctx) → { on, kinds, state, status: 'ok' | 'due' | 'block', items: [{ sec, id, label, st, note, who, due }],
                          people: [{ name, email, role, checks: [...] }], closeout: [labels that stop close-out], counts }
   ctx = { rules, certs (gc_certs list), users, schedule, medStatus (gc_medical_status.people), today, company(p), haz(p) }
   medSummary(rec, rules, today) → the next-due dates of one worker's medical surveillance (server / the worker / admins only).
   publicStatus(rec, rules, today) → the ONLY medical facts other staff get: { byKind: {kind: 'ok'|'due'|'over'|'none'}, fit, med, removed } */
(function(root){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function ymd(v){ var t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function todayLocal(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(d, n){ var t = Date.parse(ymd(d) + 'T12:00:00Z'); return isNaN(t) ? '' : new Date(t + n * 864e5).toISOString().slice(0, 10); }
function addMonths(d, m){ var t = ymd(d); if (!t) return ''; var y = +t.slice(0, 4), mo = +t.slice(5, 7) - 1 + (+m || 0), da = +t.slice(8, 10); var x = new Date(Date.UTC(y + Math.floor(mo / 12), ((mo % 12) + 12) % 12, 1)); var last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(da, last)); return x.toISOString().slice(0, 10); }
function daysBetween(a, b){ var x = Date.parse(ymd(a) + 'T12:00:00Z'), y = Date.parse(ymd(b) + 'T12:00:00Z'); return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 864e5); }
function dow(d){ return new Date(ymd(d) + 'T12:00:00Z').getUTCDay(); }
/* n working days before d (Saturdays and Sundays skipped; holidays are not known here — the label says to confirm) */
function workingDaysBefore(d, n){ var x = ymd(d); if (!x) return ''; var k = 0; while (k < n) { x = addDays(x, -1); var w = dow(x); if (w !== 0 && w !== 6) k++; } return x; }
function listOf(v){ return Array.isArray(v) ? v.map(s).filter(Boolean) : s(v) ? s(v).split(/\s*,\s*/).filter(Boolean) : []; }
function hasKind(rule, kinds){ var k = listOf(rule.kinds || rule.kind); if (!k.length || k.indexOf('*') >= 0) return kinds.length > 0; return k.some(function(x){ return kinds.indexOf(x) >= 0; }); }
function blocks(rule, kinds){ var b = rule.block; if (b === true || b === 'yes' || b === 'true') return true; if (!b || b === 'no' || b === 'false') return false; var l = listOf(b); return l.some(function(x){ return kinds.indexOf(x) >= 0; }); }

var CONFIRM = 'Default — confirm with your state program';
var DEFAULT_RULES = {
  v: 1,
  note: 'These lists are starting points, not legal advice. Confirm each item with the state program (TN · AR · MS), your physician and your attorney, and edit them here.',
  kinds: [
    { key: 'lead_rrp', label: '🧪 Lead — RRP renovation' }, { key: 'lead_abate', label: '🧪 Lead abatement' },
    { key: 'asbestos', label: '☣️ Asbestos' }, { key: 'mold', label: '🍄 Mold remediation' }, { key: 'trauma', label: '🩸 Trauma / biohazard' },
    { key: 'general', label: '☢️ Environmental (kind not set)' }],
  /* certification types: what a gc_certs record is (its ckind, else its name / template matched by the words) */
  certTypes: [
    { key: 'rrp_firm', label: 'EPA RRP Lead-Safe Certified Firm', company: true, tpl: 'epa_rrp_firm', words: 'rrp firm, lead-safe certified firm, lead safe certified firm' },
    { key: 'lead_abate_firm', label: 'State lead abatement firm certification / license', company: true, tpl: 'tdec_firm, adh_firm, mdeq_firm, epa_abate_firm', words: 'lead abatement firm, lead-based paint contractor, lead based paint contractor, lead-based paint firm, lead based paint firm', stateMatch: true },
    { key: 'asb_firm', label: 'State asbestos abatement contractor license', company: true, words: 'asbestos contractor, asbestos abatement contractor, asbestos firm', stateMatch: true },
    { key: 'rrp_renovator', label: 'EPA RRP Certified Renovator', tpl: 'rrp_renovator', words: 'certified renovator, rrp renovator, lead renovator', months: 60 },
    { key: 'lead_supervisor', label: 'Lead abatement supervisor', words: 'lead abatement supervisor, lead supervisor, abatement supervisor', stateMatch: true },
    { key: 'lead_worker', label: 'Lead abatement worker', words: 'lead abatement worker, lead worker', stateMatch: true, alsoOk: 'lead_supervisor' },
    { key: 'asb_supervisor', label: 'Asbestos abatement supervisor (state licensed)', words: 'asbestos supervisor, asbestos contractor/supervisor, asbestos abatement supervisor', stateMatch: true },
    { key: 'asb_worker', label: 'Asbestos abatement worker (state licensed)', words: 'asbestos worker, asbestos abatement worker', stateMatch: true, alsoOk: 'asb_supervisor' },
    { key: 'fit_test', label: 'Respirator fit test', words: 'fit test, fit-test, fit testing', months: 12 },
    { key: 'hazcom', label: 'Hazard communication (HazCom) training', words: 'hazcom, hazard communication', months: 12 },
    { key: 'health_effects', label: 'Health-effects training (lead / asbestos / mold)', words: 'health effects, health-effects', months: 12 },
    { key: 'bbp', label: 'Bloodborne pathogens training', words: 'bloodborne, bbp', months: 12 },
    { key: 'hepb', label: 'Hepatitis B vaccination (or signed declination)', words: 'hepatitis b, hep b' },
    { key: 'mold_tech', label: 'Mold remediation training (e.g. IICRC AMRT)', words: 'amrt, mold remediation, applied microbial' }],
  /* 1 · people on the job: who = company | supervisor (at least one on the crew) | worker (each non-supervisor) | each (everyone) */
  people: [
    { id: 'rrp-firm', kinds: 'lead_rrp', who: 'company', cert: 'rrp_firm', block: true, note: CONFIRM },
    { id: 'rrp-renovator', kinds: 'lead_rrp', who: 'supervisor', cert: 'rrp_renovator', block: true, label: 'A certified renovator assigned to the job', note: CONFIRM },
    { id: 'rrp-worker', kinds: 'lead_rrp', who: 'worker', cert: 'rrp_renovator', block: false, label: 'Workers: certified renovator, or trained on the job by one (Lead 04 record)', note: CONFIRM },
    { id: 'la-firm', kinds: 'lead_abate', who: 'company', cert: 'lead_abate_firm', block: true, note: CONFIRM },
    { id: 'la-sup', kinds: 'lead_abate', who: 'supervisor', cert: 'lead_supervisor', block: true, label: 'A certified lead abatement supervisor on site', note: CONFIRM },
    { id: 'la-worker', kinds: 'lead_abate', who: 'each', cert: 'lead_worker', block: true, label: 'Every worker: certified lead abatement worker (or supervisor)', note: CONFIRM },
    { id: 'asb-firm', kinds: 'asbestos', who: 'company', cert: 'asb_firm', block: true, note: CONFIRM },
    { id: 'asb-sup', kinds: 'asbestos', who: 'supervisor', cert: 'asb_supervisor', block: true, label: 'A state-licensed asbestos supervisor on site', note: CONFIRM },
    { id: 'asb-worker', kinds: 'asbestos', who: 'each', cert: 'asb_worker', block: true, label: 'Every worker: state-licensed asbestos worker (or supervisor)', note: CONFIRM },
    { id: 'mold-train', kinds: 'mold', who: 'supervisor', cert: 'mold_tech', block: false, note: CONFIRM },
    { id: 'tr-bbp', kinds: 'trauma', who: 'each', cert: 'bbp', block: true, note: CONFIRM },
    { id: 'tr-hepb', kinds: 'trauma', who: 'each', cert: 'hepb', block: false, note: CONFIRM },
    { id: 'all-hazcom', kinds: '*', who: 'each', cert: 'hazcom', block: false, note: CONFIRM },
    { id: 'all-health', kinds: 'lead_rrp, lead_abate, asbestos, mold', who: 'each', cert: 'health_effects', block: false, note: CONFIRM }],
  /* medical surveillance (per worker, private: only the worker, admins and the Office Manager see dates and results).
     everyMonths after the last visit of that type; phases: the first months at a shorter interval; once = a one-time visit. */
  medical: [
    { key: 'fit', label: 'Respirator fit test', group: 'fit', visits: 'fit', kinds: 'lead_abate, asbestos, mold, trauma', everyMonths: 12, block: 'lead_abate, asbestos', note: 'Default — confirm with your respiratory protection program' },
    { key: 'respClear', label: 'Respirator medical clearance', visits: 'respClear', kinds: 'lead_abate, asbestos, mold, trauma', everyMonths: 12, block: false, note: 'Default — confirm with your physician / PLHCP' },
    { key: 'baseline', label: 'Baseline physical', visits: 'baseline', kinds: 'lead_abate, asbestos', once: true, block: false, note: 'Default — confirm with your physician / state program' },
    { key: 'bloodLead', label: 'Blood lead + ZPP test', visits: 'bloodLead', kinds: 'lead_abate', phases: [{ months: 6, everyMonths: 2 }], everyMonths: 6, block: false, note: 'Default (every 2 months for the first 6 months, then every 6 months) — confirm with your physician / state program' },
    { key: 'leadExam', label: 'Lead medical exam', visits: 'leadExam', kinds: 'lead_abate', everyMonths: 12, block: false, note: 'Default — confirm with your physician / state program' },
    { key: 'asbExam', label: 'Asbestos medical exam', visits: 'asbExam', kinds: 'asbestos', everyMonths: 12, block: false, note: 'Default (yearly) — confirm with your physician / state program' },
    { key: 'pft', label: 'Pulmonary function test', visits: 'pft, asbExam', kinds: 'asbestos', everyMonths: 12, block: false, note: 'Default — confirm with your physician' }],
  visitTypes: [
    { key: 'baseline', label: 'Baseline physical' }, { key: 'bloodLead', label: 'Blood lead + ZPP test' }, { key: 'leadExam', label: 'Lead medical exam' },
    { key: 'asbExam', label: 'Asbestos medical exam' }, { key: 'pft', label: 'Pulmonary function test' }, { key: 'respClear', label: 'Respirator medical clearance' },
    { key: 'fit', label: 'Respirator fit test' }, { key: 'followup', label: 'Follow-up visit' }, { key: 'opinion', label: 'Written medical opinion' }, { key: 'other', label: 'Other' }],
  /* medical removal protection (pay protection) — defaults to confirm with your attorney / state program */
  removal: { maxMonths: 18, basis: 'average', avgWeeks: 6, followEveryMonths: 1, followVisit: 'bloodLead', kinds: 'lead_abate, lead_rrp, asbestos', warnDays: 30, topUp: true,
    note: 'Default (pay kept up to 18 months, the average of the last 6 weeks before removal, follow-up blood tests monthly, reduced by workers\' comp wage replacement and by pay for other work in the period) — confirm with your attorney / state program.' },
  /* 2 · air testing / monitoring; type = personal | area | clearance | baseline; when = before | during | clearance;
     gate = the job cannot be closed until a passing record of this type */
  air: [
    { id: 'la-personal', kinds: 'lead_abate', type: 'personal', when: 'during', label: 'Personal air monitoring — exposure assessment of each task', block: false, note: CONFIRM },
    { id: 'la-clear', kinds: 'lead_abate', type: 'clearance', when: 'clearance', gate: true, label: 'Clearance — lead dust wipe clearance (certified inspector / risk assessor)', note: CONFIRM },
    { id: 'rrp-verify', kinds: 'lead_rrp', type: 'clearance', when: 'clearance', gate: true, label: 'Cleaning verification (card) or dust-wipe clearance', note: CONFIRM },
    { id: 'asb-personal', kinds: 'asbestos', type: 'personal', when: 'during', everyDays: 1, label: 'Personal air monitoring (exposure assessment)', block: false, note: CONFIRM },
    { id: 'asb-area', kinds: 'asbestos', type: 'area', when: 'during', everyDays: 1, label: 'Area air samples (inside / outside containment)', block: false, note: CONFIRM },
    { id: 'asb-clear', kinds: 'asbestos', type: 'clearance', when: 'clearance', gate: true, label: 'Final air clearance', note: CONFIRM },
    { id: 'mold-pre', kinds: 'mold', type: 'baseline', when: 'before', label: 'Pre-remediation assessment / baseline samples', block: false, note: CONFIRM },
    { id: 'mold-prv', kinds: 'mold', type: 'clearance', when: 'clearance', gate: true, label: 'Post-remediation verification (PRV)', note: CONFIRM },
    { id: 'tr-verify', kinds: 'trauma', type: 'clearance', when: 'clearance', gate: true, label: 'Post-cleaning verification (ATP / visual)', note: CONFIRM }],
  /* 3 · notifications & permits — checklist items, NOT statute text: confirm each with the state program */
  notices: [
    { id: 'asb-notice-tn', kinds: 'asbestos', states: 'TN', agency: 'TDEC', label: 'Asbestos abatement / demolition notification', daysBefore: 10, workingDays: true, block: true, note: 'Checklist item — confirm the form, the threshold and the days with the state program' },
    { id: 'asb-notice-ar', kinds: 'asbestos', states: 'AR', agency: 'Arkansas DEQ', label: 'Asbestos abatement / demolition notification', daysBefore: 10, workingDays: true, block: true, note: 'Checklist item — confirm the form, the threshold and the days with the state program' },
    { id: 'asb-notice-ms', kinds: 'asbestos', states: 'MS', agency: 'MDEQ', label: 'Asbestos abatement / demolition notification', daysBefore: 10, workingDays: true, block: true, note: 'Checklist item — confirm the form, the threshold and the days with the state program' },
    { id: 'la-notice-tn', kinds: 'lead_abate', states: 'TN', agency: 'TDEC lead program', label: 'Lead abatement project notification', daysBefore: '', block: true, note: 'Checklist item — confirm the form and when it is due with the state program' },
    { id: 'la-notice-ar', kinds: 'lead_abate', states: 'AR', agency: 'Arkansas Dept. of Health', label: 'Lead abatement project notification', daysBefore: '', block: true, note: 'Checklist item — confirm the form and when it is due with the state program' },
    { id: 'la-notice-ms', kinds: 'lead_abate', states: 'MS', agency: 'MDEQ', label: 'Lead abatement project notification', daysBefore: '', block: true, note: 'Checklist item — confirm the form and when it is due with the state program' },
    { id: 'local-permit', kinds: 'asbestos, lead_abate', states: '', agency: 'City / county', label: 'Local permit (demolition / building), if the job needs one', daysBefore: '', block: false, note: 'Checklist item — confirm with the city / county' }],
  /* 4 · the daily log — ONE per job per day (Field + Desk), every field admin-editable per job kind.
     type: text | number | textarea | check | rows (cols "key|Label, key|Label") | crew (auto: the people on the job + times) | airlink
     (the day's air sample records + pump data rows) | photos | signoff (supervisor name + time). sum: a rows column totalled on the panel. */
  daily: [
    { key: 'weather', section: 'Conditions', label: 'Weather', type: 'text', kinds: '*' },
    { key: 'outTemp', section: 'Conditions', label: 'Outdoor temperature (°F)', type: 'number', kinds: '*' },
    { key: 'outRH', section: 'Conditions', label: 'Outdoor relative humidity (%)', type: 'number', kinds: '*' },
    { key: 'areas', section: 'Conditions', label: 'Indoor conditions by work area', type: 'rows', cols: 'area|Work area, temp|Temp °F, rh|RH %, dew|Dew point °F', kinds: '*' },
    { key: 'crew', section: 'Crew', label: 'Crew on site (times in / out, role — certifications checked automatically)', type: 'crew', kinds: '*' },
    { key: 'visitors', section: 'Crew', label: 'Visitors / inspectors', type: 'rows', cols: 'name|Name, org|Company / agency, in|Time in, out|Time out, why|Purpose', kinds: '*' },
    { key: 'tasks', section: 'Work', label: 'Work area(s) and tasks done', type: 'textarea', kinds: '*' },
    { key: 'containSet', section: 'Containment', label: 'Containment set up / inspected — barrier integrity OK', type: 'check', kinds: 'lead_abate, asbestos, mold, lead_rrp' },
    { key: 'critical', section: 'Containment', label: 'Critical barriers in place (vents, doors, windows, openings)', type: 'check', kinds: 'lead_abate, asbestos, mold' },
    { key: 'containNote', section: 'Containment', label: 'Containment notes / repairs', type: 'text', kinds: 'lead_abate, asbestos, mold, lead_rrp' },
    { key: 'negair', section: 'Negative air', label: 'Negative air machines', type: 'rows', cols: 'unit|Unit ID, on|On, off|Off, filter|Filter changed', kinds: 'lead_abate, asbestos, mold' },
    { key: 'mano', section: 'Negative air', label: 'Manometer / pressure differential readings', type: 'rows', cols: 'time|Time, reading|Reading (in. w.c. / Pa), where|Location', kinds: 'lead_abate, asbestos, mold' },
    { key: 'equip', section: 'Equipment', label: 'HEPA vacuums, air scrubbers, dehumidifiers, other equipment', type: 'rows', cols: 'type|Equipment, unit|Unit ID, act|Placed / removed, meter|Hours / meter', kinds: '*' },
    { key: 'air', section: 'Air monitoring', label: 'Air samples taken today (pump data)', type: 'airlink', cols: 'sample|Sample / location / person, pump|Pump ID, pre|Flow pre (L/min), post|Flow post (L/min), start|Start, stop|Stop, vol|Volume (L)', kinds: 'lead_abate, asbestos, mold, trauma' },
    { key: 'ppe', section: 'PPE & decon', label: 'PPE used', type: 'rows', cols: 'resp|Respirator type, suit|Suits / gloves / boots, who|Who', kinds: '*' },
    { key: 'decon', section: 'PPE & decon', label: 'Decon procedures followed', type: 'textarea', kinds: 'lead_abate, asbestos, mold, trauma' },
    { key: 'waste', section: 'Waste', label: 'Waste generated', type: 'rows', cols: 'bags|Bags, drums|Drums, manifest|Manifest #, store|Storage location', sum: 'bags, drums', kinds: '*' },
    { key: 'signs', section: 'Signage', label: 'Warning signs posted at every entrance', type: 'check', kinds: '*' },
    { key: 'incidents', section: 'Incidents', label: 'Incidents, near-misses, deviations', type: 'textarea', kinds: '*' },
    { key: 'supNotes', section: 'Sign-off', label: 'Supervisor notes', type: 'textarea', kinds: '*' },
    { key: 'photos', section: 'Sign-off', label: 'Photos', type: 'photos', kinds: '*' },
    { key: 'signoff', section: 'Sign-off', label: 'Supervisor sign-off', type: 'signoff', kinds: '*' }],
  dailyBlock: false,
  /* 5 · the company's written programs (company-docs/), with the company review date and the job review */
  programs: [
    { id: 'resp', label: 'Respiratory Protection Program', file: '/company-docs/01667c529f454cf1/GrayCo_Respiratory_Protection_Program.docx', kinds: 'lead_abate, asbestos, mold, trauma', reviewEveryMonths: 12, reviewed: '' },
    { id: 'hazcom', label: 'Hazard Communication Program', file: '/company-docs/01667c529f454cf1/GrayCo_Hazard_Communication_Program.docx', kinds: '*', reviewEveryMonths: 12, reviewed: '' },
    { id: 'lead', label: 'Lead Safety Program', file: '/company-docs/01667c529f454cf1/GrayCo_Lead_Safety_Program.docx', kinds: 'lead_rrp, lead_abate', reviewEveryMonths: 12, reviewed: '' },
    { id: 'asb', label: 'Asbestos Awareness and Control Program', file: '/company-docs/01667c529f454cf1/GrayCo_Asbestos_Awareness_and_Control_Program.docx', kinds: 'asbestos', reviewEveryMonths: 12, reviewed: '' },
    { id: 'toolbox', label: 'Toolbox Talks & Training Plan', file: '/company-docs/01667c529f454cf1/GrayCo_Lead_Asbestos_Toolbox_Talks_and_Training_Plan.docx', kinds: 'lead_rrp, lead_abate, asbestos', reviewEveryMonths: 12, reviewed: '' },
    { id: 'health', label: 'Health Effects training — lead & asbestos', file: '/company-docs/01667c529f454cf1/GrayCo_Health_Effects_Lead_Asbestos_Training.docx', kinds: 'lead_rrp, lead_abate, asbestos', reviewEveryMonths: 12, reviewed: '' }],
  /* 6 · records retention (years) — what kind of record keeps how long; kept from deletion until then */
  retention: [   /* the owner's standing rule (11/16): "Always keep records for everything." — kept forever unless an admin sets years */
    { cat: 'rrp', label: 'RRP job records', years: 'forever', note: 'Kept forever (owner\'s rule) — the legal minimum is shorter; confirm with your state program' },
    { cat: 'project', label: 'Abatement / remediation project records (notices, daily logs, clearance, waste manifests)', years: 'forever', note: 'Kept forever (owner\'s rule)' },
    { cat: 'exposure', label: 'Exposure monitoring (air samples)', years: 'forever', note: 'Kept forever (owner\'s rule)' },
    { cat: 'medical', label: 'Medical surveillance & medical removal records', years: 'forever', note: 'Kept forever (owner\'s rule)' },
    { cat: 'training', label: 'Training / certification records', years: 'forever', note: 'Kept forever (owner\'s rule)' }],
  settings: { reminderDays: 5, closeoutOverride: 'admin', expiringDays: 30 }
};
/* EPAHUD: the EPA / HUD requirements for people, the company and the state notices, added as DATA to the defaults (owner 11/17:
   "Make sure all requirements for employees, workers and company for EPA and HUD are also in here for lead, asbestos, mold etc.").
   Sources (docs/EPA_HUD_LEAD_ASBESTOS_MATRIX.md): 40 CFR 745 Subparts E and L, 24 CFR 35, 40 CFR 61 Subpart M, 40 CFR 763 Subpart E
   (AHERA model accreditation plan), 29 CFR 1926.62 / .1101 / 1910.134 / 1910.1200; TN 0400-13-01, AR ADH Rules Pertaining to Lead-Based
   Paint Activities, MS MDEQ lead-based paint regulations. Every item is a default — confirm with your state program. Nothing here is
   added twice: an id / key already in the list is left as it is (ENVDOCS and the admin's own edits win). */
(function epahud(R){
  var C = 'Default — confirm with your state program (EPAHUD)';
  var add = function(list, x, k){ k = k || 'id'; if (!list.some(function(y){ return y && y[k] === x[k]; })) list.push(x); };
  [ { key: 'dust_tech', label: 'Lead dust sampling technician', words: 'dust sampling technician, dust sampling tech', stateMatch: true, months: 36 },
    { key: 'lead_inspector', label: 'Lead-based paint inspector', words: 'lead inspector, lead-based paint inspector, lead based paint inspector, lbp inspector', stateMatch: true, months: 36, alsoOk: 'lead_risk' },
    { key: 'lead_risk', label: 'Lead risk assessor', words: 'risk assessor', stateMatch: true, months: 36 },
    { key: 'lead_designer', label: 'Lead abatement project designer', words: 'lead project designer, lead abatement project designer', stateMatch: true, months: 36 },
    { key: 'asb_inspector', label: 'Asbestos inspector (AHERA-accredited, state licensed)', words: 'asbestos inspector, building inspector (asbestos)', stateMatch: true, months: 12 },
    { key: 'asb_planner', label: 'Asbestos management planner (AHERA)', words: 'management planner', stateMatch: true, months: 12 },
    { key: 'asb_designer', label: 'Asbestos project designer (AHERA)', words: 'asbestos project designer', stateMatch: true, months: 12 },
    { key: 'asb_om', label: 'Asbestos O&M awareness (2-hour awareness / 16-hour O&M)', words: '2-hour awareness, 2 hour awareness, 16-hour o&m, 16 hour o&m, asbestos awareness, operations and maintenance' },
    { key: 'osha10', label: 'OSHA 10 / OSHA 30 construction', words: 'osha 10, osha-10, osha 30, osha-30, osha 10-hour, osha 30-hour' },
    { key: 'resp_med', label: 'Respirator medical clearance', words: 'respirator medical, medical clearance, medical evaluation (respirator)', months: 12 },
    { key: 'iicrc_wrt', label: 'IICRC WRT (water damage restoration) — company standard', words: 'wrt, water damage restoration technician' },
    { key: 'pollution_ins', label: 'Insurance with pollution / contractor\'s environmental liability', company: true, words: 'pollution, contractor\'s pollution, environmental liability, cpl' },
    { key: 'neshap_acct', label: 'State asbestos notification account (TDEC / Arkansas DEQ / MDEQ)', company: true, words: 'notification account, asbestos notification account, neshap account' }
  ].forEach(function(t){ add(R.certTypes, t, 'key'); });
  [ /* lead RRP: Mississippi runs its own RRP program — the firm and the renovator certified by MDEQ (the EPA ones do not cover MS) */
    { id: 'rrp-firm-ms', kinds: 'lead_rrp', states: 'MS', who: 'company', cert: 'lead_abate_firm', block: true, label: 'MDEQ lead-based paint firm certification (Mississippi runs its own RRP program)', note: C },
    /* lead abatement: the clearance after it is by a certified inspector / risk assessor (not the abatement crew) — tracked on 🌫 air; the plan by a supervisor / project designer */
    { id: 'la-designer', kinds: 'lead_abate', who: 'supervisor', cert: 'lead_supervisor', block: false, label: 'Occupant protection plan + abatement report by a certified supervisor or project designer', note: C },
    /* asbestos: the survey before any renovation / demolition by an accredited inspector (GrayCo hires one) */
    { id: 'asb-om-aware', kinds: 'asbestos', who: 'each', cert: 'asb_om', block: false, label: 'GrayCo crew near asbestos: 2-hour awareness (16-hour O&M for Class III / IV work)', note: C },
    /* everyone on exposure work */
    { id: 'all-osha10', kinds: 'lead_rrp, lead_abate, asbestos, mold, trauma', who: 'each', cert: 'osha10', block: false, label: 'OSHA 10 (supervisors OSHA 30) — company standard', note: C },
    { id: 'mold-wrt', kinds: 'mold', who: 'supervisor', cert: 'iicrc_wrt', block: false, label: 'IICRC WRT — company standard (TN / AR / MS have no state mold license)', note: C },
    { id: 'co-pollution', kinds: 'lead_rrp, lead_abate, asbestos, mold', who: 'company', cert: 'pollution_ins', block: false, label: 'Insurance with pollution coverage on file', note: C }
  ].forEach(function(r){ add(R.people, r); });
  /* the state notices: the days the state programs publish (the blank ones in ENVCOMP's list), + the ones it did not have */
  var N = function(id, o){ var x = R.notices.find(function(y){ return y && y.id === id; }); if (x) Object.keys(o).forEach(function(k){ if (x[k] === '' || x[k] == null) x[k] = o[k]; }); };
  N('la-notice-tn', { daysBefore: 5, workingDays: true, note: 'TN Rule 0400-13-01: received 5 business days before the start (+ the project fee); updated notice for a new start date, location or cancellation — confirm with TDEC' });
  N('la-notice-ar', { daysBefore: 10, workingDays: true, note: 'ADH Lead-Based Paint Notice of Intent (+ revision form) — the 10 working days are GrayCo\'s 11/2026 index; confirm the days and fee with ADH' });
  N('la-notice-ms', { daysBefore: 6, workingDays: true, note: 'MDEQ LBP Project Notification (rev. 7/2025): 6 working days before; abatement fee per unit — confirm with MDEQ' });
  add(R.notices, { id: 'rrp-notice-ms', kinds: 'lead_rrp', states: 'MS', agency: 'MDEQ', label: 'Lead-based paint project notification (renovation)', daysBefore: 6, workingDays: true, block: false, note: 'MDEQ asks for the LBP Project Notification for regulated renovation too (no fee) — confirm with MDEQ' });
  add(R.notices, { id: 'asb-notice-revise', kinds: 'asbestos', states: '', agency: 'State asbestos program', label: 'NESHAP revised notice — amount changes 20% or more, or a new start date (earlier: 10 working days; later: by the original start date)', daysBefore: '', block: false, note: '40 CFR 61.145(b)(2), (b)(3)(iv) — checklist item; the abatement sub files it' });
})(DEFAULT_RULES);
var SECTIONS = ['kinds', 'certTypes', 'people', 'medical', 'visitTypes', 'air', 'notices', 'daily', 'programs', 'retention'];
/* the rules in use: the admin's table, each section falling back to the default when missing */
function rules(r){
  var R = clone(DEFAULT_RULES); r = obj(r);
  SECTIONS.forEach(function(k){ if (Array.isArray(r[k]) && r[k].length) R[k] = clone(r[k]); });
  ['removal', 'settings'].forEach(function(k){ if (obj(r[k]) && Object.keys(obj(r[k])).length) R[k] = Object.assign({}, R[k], clone(r[k])); });
  if (typeof r.dailyBlock === 'boolean') R.dailyBlock = r.dailyBlock;
  if (r.at) R.at = r.at; if (r.by) R.by = r.by;
  return R;
}

/* ── what kind of job ── */
function typeText(p){ return [p.type, p.jobType, p.lossType, p.damageType, p.workType, p.service, p.category, p.division, p.trade].concat(arr(p.tags).map(function(t){ return t && typeof t === 'object' ? (t.name || t.label || t.tag) : t; })).map(s).filter(Boolean).join(' | '); }
function noteText(p){ var n = p.notes; if (Array.isArray(n)) n = n.map(function(x){ return x && typeof x === 'object' ? (x.text || x.note || '') : x; }).join(' '); return [p.name, p.title, p.description, p.desc, p.scope, p.scopeOfWork, p.workDescription, n].map(s).join(' '); }
var RX = { lead_abate: /lead[\s_-]*(based[\s_-]*paint[\s_-]*)?(abatement|hazard[\s_-]*reduction)|abatement[^|]{0,20}\blead\b/i,
  lead: /\blead[\s_-]*(based|paint|safe|abatement|hazard|dust|test|rrp)|\brrp\b|renovate[\s_-]*right|pre[\s_-]*1978|^\s*lead\s*$|\|\s*lead\s*(\||$)/i,
  asbestos: /asbestos|\bacm\b|vermiculite/i, mold: /\bmold\b|\bmould\b|microbial/i, trauma: /trauma|biohazard|crime[\s_-]*scene|unattended[\s_-]*death|blood[\s_-]*clean/i };
function hazWords(p){ var t = noteText(p) + ' ' + typeText(p); return { lead: RX.lead.test(t) || RX.lead_abate.test(t), leadAbate: RX.lead_abate.test(t), asbestos: RX.asbestos.test(t), mold: RX.mold.test(t), trauma: RX.trauma.test(t) }; }
function companyOf(p, ctx){ try { if (ctx && typeof ctx.company === 'function') return s(ctx.company(p)); } catch (e) {} return s(p.companyId) || 'construction'; }
function ec(p){ return obj(p && p.envComp); }
function detectKinds(p, ctx){
  if (!p) return [];
  var E = ec(p); if (E.mode === 'off') return [];
  if (Array.isArray(E.kinds) && E.kinds.length) return E.kinds.slice();
  var out = [], add = function(k){ if (out.indexOf(k) < 0) out.push(k); };
  var T = typeText(p), a = obj(p.leadAsb), co = companyOf(p, ctx), env = co === 'environmental';
  var h = {}; try { h = ctx && typeof ctx.haz === 'function' ? obj(ctx.haz(p)) : {}; } catch (e) {}
  var w = hazWords(p);
  /* the job type / tags */
  if (RX.lead_abate.test(T)) add('lead_abate'); else if (RX.lead.test(T)) add('lead_rrp');
  if (RX.asbestos.test(T)) add('asbestos'); if (RX.mold.test(T)) add('mold'); if (RX.trauma.test(T)) add('trauma');
  /* the ☣️ Lead & asbestos card's answers */
  var y = parseInt(a.yearBuilt || p.yearBuilt, 10);
  if (a.abatement) add('lead_abate');
  else if (a.leadFound || (y && y < 1978 && a.disturbsPaint)) { if (out.indexOf('lead_abate') < 0) add('lead_rrp'); }
  if (a.asbFound) add('asbestos');
  /* the job's words (notes / description): lead and asbestos for every company (as the ☣️ card does); mold and trauma only on an
     Environmental job (a Construction job that mentions "mold" is not a remediation job) */
  if ((h.lead || w.lead) && out.indexOf('lead_abate') < 0 && out.indexOf('lead_rrp') < 0) add(w.leadAbate && env ? 'lead_abate' : 'lead_rrp');
  if (h.asbestos || w.asbestos) add('asbestos');
  if (env || E.mode === 'on') { if (h.mold || w.mold) add('mold'); if (h.trauma || w.trauma) add('trauma'); }
  if (!out.length && (env || E.mode === 'on')) add('general');
  return out;
}
function isOn(p, ctx){ return detectKinds(p, ctx).length > 0; }
function stateOf(p){
  var E = ec(p); if (/^[A-Z]{2}$/.test(s(E.state))) return s(E.state);
  if (/^[A-Za-z]{2}$/.test(s(p.state))) return s(p.state).toUpperCase();
  var a = [p.address, p.jobAddress, p.siteAddress, p.city].map(s).join(' ');
  var m = a.match(/(?:^|[\s,])(TN|AR|MS|AL|GA|KY|MO|LA|TX|OK)(?=[\s,.]*\d{5}|[\s,.]*$)/) || a.match(/tennessee|arkansas|mississippi/i);
  if (!m) return '';
  var v = (m[1] || m[0]).toUpperCase(); return v.length === 2 ? v : { TENNESSEE: 'TN', ARKANSAS: 'AR', MISSISSIPPI: 'MS' }[v] || '';
}
function pctOf(p){ var v = parseFloat(p && (p.pct != null ? p.pct : p.progress)); return isNaN(v) ? 0 : v; }
function finished(p){ return /complete|closed|warrant|close.?out/i.test(s(p.status)) || pctOf(p) >= 100; }
function started(p, t){ return pctOf(p) > 0 || /in.?progress|started|underway/i.test(s(p.status)) || finished(p) || (!!ymd(p.startDate) && ymd(p.startDate) <= t && /active|approved|sold|scheduled/i.test(s(p.status))); }
function nearDone(p){ return finished(p) || pctOf(p) >= 90 || /final|clearance|punch/i.test(s(p.status)); }

/* ── the people on the job (crew fields + the schedule + the panel's own list) ── */
var CREW_F = ['abatementSupervisor', 'supervisor', 'superintendent', 'foreman', 'crewLead', 'envTech', 'mitTech', 'tech', 'cleanTech', 'crew', 'crewNames', 'team', 'techs', 'assigned'];
var SUP_F = ['abatementSupervisor', 'supervisor', 'superintendent', 'foreman', 'crewLead'];
function namesIn(v){ var out = []; (Array.isArray(v) ? v : [v]).forEach(function(x){ var n = s(x && typeof x === 'object' ? (x.name || x.email) : x); if (n) n.split(/\s*[,;&\/]\s*|\s+and\s+/i).forEach(function(q){ q = s(q); if (q && out.indexOf(q) < 0) out.push(q); }); }); return out; }
function userBy(users, n){ var k = low(n); if (!k) return null; return arr(users).find(function(u){ return u && u.active !== false && (low(u.name) === k || low(u.email) === k); }) || null; }
function crewOf(p, ctx){
  var t = ctx.today || todayLocal(), E = ec(p), roles = obj(E.roles), out = [], seen = {};
  var put = function(n, role){
    var u = userBy(ctx.users, n), name = u ? s(u.name) : s(n), key = low(u ? (u.email || u.name) : n); if (!name || seen[key]) return;
    var r = roles[low(name)] || role || 'worker'; if (r === 'off') { seen[key] = 1; return; }
    seen[key] = 1; out.push({ name: name, email: u ? low(u.email) : '', role: r, user: u });
  };
  arr(E.crew).forEach(function(c){ put(c && c.name, c && c.role); });
  SUP_F.forEach(function(f){ namesIn(p[f]).forEach(function(n){ put(n, 'supervisor'); }); });
  CREW_F.forEach(function(f){ if (SUP_F.indexOf(f) < 0) namesIn(p[f]).forEach(function(n){ put(n, 'worker'); }); });
  arr(ctx.schedule).forEach(function(x){
    if (!x || x.deleted || s(x.pid || x.projectId || x.jobId) !== s(p.id)) return;
    var end = ymd(x.endDateSch || x.end || x.endDate) || ymd(x.date || x.start || x.startDate); if (end && end < t) return;
    namesIn([x.assignee, x.who, x.crew, x.people, x.lead].concat(arr(x.assignees))).forEach(function(n){ put(n, 'worker'); });
  });
  return out;
}
/* who was on the job on a day (the schedule for that day + the crew) — for area results that apply to everyone there */
function crewOnDay(p, ctx, day){
  var c = Object.assign({}, ctx, { today: day, schedule: arr(ctx.schedule).filter(function(x){ var a = ymd(x && (x.date || x.start || x.startDate)), b = ymd(x && (x.endDateSch || x.end || x.endDate)) || a; return !a || (a <= day && b >= day); }) });
  return crewOf(p, c);
}

/* ── certifications ── */
function certType(R, key){ return arr(R.certTypes).find(function(t){ return t && t.key === key; }) || { key: key, label: key }; }
function certIs(c, T){
  if (!c || c.archived) return false;
  if (s(c.ckind)) return s(c.ckind) === T.key;
  if (listOf(T.tpl).indexOf(s(c.tpl)) >= 0) return true;
  var txt = low(s(c.name) + ' ' + s(c.tpl)); return listOf(T.words).some(function(w){ return txt.indexOf(low(w)) >= 0; });
}
function certValidTo(c, T){ var e = ymd(c.expires); if (e) return e; var i = ymd(c.issued); if (i && +T.months) return addMonths(i, +T.months); return ''; }
function stateOk(c, st){ var cs = s(c.state || c.stateAccepted); if (!st || !cs) return null; return cs.toUpperCase().split(/[\/,\s]+/).indexOf(st) >= 0; }
/* the best record of a type for a holder → { st: 'ok' | 'soon' | 'missing' | 'expired', c, exp, note } */
function certFor(R, ctx, holder, key, st){
  var T = certType(R, key), keys = [key].concat(listOf(T.alsoOk)), list = arr(ctx.certs), t = ctx.today || todayLocal(), soonD = +(R.settings || {}).expiringDays || 30;
  var mine = list.filter(function(c){
    if (!c || c.archived) return false;
    if (holder === 'company') { if (c.holderType !== 'company') return false; }
    else { if (c.holderType === 'company') return false; var e = low(holder.email), n = low(holder.name); if (!((e && low(c.holder) === e) || (n && low(c.holderName) === n) || (n && low(c.holder) === n))) return false; }
    return keys.some(function(k){ return certIs(c, certType(R, k)); });
  });
  if (!mine.length) return { st: 'missing', note: 'No ' + T.label + ' on file' };
  var best = null;
  mine.forEach(function(c){
    var exp = certValidTo(c, T), so = T.stateMatch ? stateOk(c, st) : null;
    var r = { c: c, exp: exp, so: so };
    r.st = so === false ? 'wrongstate' : !exp ? 'nodate' : exp < t ? 'expired' : daysBetween(t, exp) <= soonD ? 'soon' : 'ok';
    var rank = { ok: 5, soon: 4, nodate: 3, expired: 1, wrongstate: 0 };
    if (!best || rank[r.st] > rank[best.st] || (rank[r.st] === rank[best.st] && exp > best.exp)) best = r;
  });
  var n = best.st === 'ok' ? (best.exp ? 'valid to ' + best.exp : 'on file') : best.st === 'soon' ? 'expires ' + best.exp : best.st === 'expired' ? 'EXPIRED ' + best.exp : best.st === 'nodate' ? 'on file — expiration date needed' : 'not accepted in ' + st + ' (' + s(best.c.state) + ')';
  if (T.stateMatch && best.so === null && st && best.st !== 'expired') n += ' · state accepted not recorded — confirm it is good in ' + st;
  return { st: best.st === 'wrongstate' ? 'missing' : best.st, c: best.c, exp: best.exp, note: n, provider: s(best.c.issuer || best.c.provider) };
}

/* ── medical surveillance (private) ── */
function visitsOf(rec, types){ var L = listOf(types); return arr(obj(rec).visits).filter(function(v){ return v && !v.deleted && !v.archived && ymd(v.date) && (!L.length || L.indexOf(s(v.type)) >= 0); }).sort(function(a, b){ return ymd(a.date) < ymd(b.date) ? -1 : 1; }); }
function activeRemoval(rec, t, R){
  var mx = +((R && R.removal) || {}).maxMonths || 18;
  return arr(obj(rec).removals).filter(function(r){ return r && !r.deleted && !r.archived && ymd(r.start) && ymd(r.start) <= t && (!ymd(r.end) || ymd(r.end) > t); }).map(function(r){ return Object.assign({}, r, { protectEnd: addMonths(r.start, +r.maxMonths || mx) }); })[0] || null;
}
function medNext(rec, item, t, R){
  var V = visitsOf(rec, item.visits || item.key), last = V.length ? ymd(V[V.length - 1].date) : '', first = V.length ? ymd(V[0].date) : '';
  var over = ymd(obj(obj(rec).due)[item.key]), next = '';
  if (item.once) next = last ? '' : over;
  else if (last) {
    var every = +item.everyMonths || 12, acc = 0, since = daysBetween(first, last) / 30.44;
    arr(item.phases).some(function(ph){ acc += +ph.months || 0; if (since < acc) { every = +ph.everyMonths || every; return true; } return false; });
    next = addMonths(last, every);
  }
  /* during a medical removal the follow-up blood tests come at the removal interval (default monthly) */
  var rm = R && activeRemoval(rec, t, R);
  if (rm && R.removal && listOf(R.removal.followVisit).indexOf(item.key) >= 0) {
    var after = V.filter(function(v){ return ymd(v.date) >= ymd(rm.start); }), base = after.length ? ymd(after[after.length - 1].date) : ymd(rm.start);
    var f = addMonths(base, +R.removal.followEveryMonths || 1); if (!next || f < next) next = f;
  }
  if (over && (!next || over < next || !last)) next = over;
  var st = item.once ? (last ? 'ok' : next ? (next < t ? 'over' : daysBetween(t, next) <= 30 ? 'due' : 'ok') : 'none')
    : !last && !next ? 'none' : next < t ? 'over' : daysBetween(t, next) <= 30 ? 'due' : 'ok';
  return { key: item.key, label: item.label, last: last, next: next, st: st, group: item.group || 'medical' };
}
function medSummary(rec, R, t){ R = R || rules(); t = t || todayLocal(); return arr(R.medical).map(function(it){ return Object.assign(medNext(rec, it, t, R), { kinds: listOf(it.kinds), block: it.block, note: it.note }); }); }
var ORDER = { none: 0, over: 1, due: 2, ok: 3 };
function worst(a, b){ return ORDER[a] <= ORDER[b] ? a : b; }
/* what other staff may know: by job kind and the fit test, current / due / over / none — never a date, a test name or a result */
function publicStatus(rec, R, t){
  R = R || rules(); t = t || todayLocal();
  var S = medSummary(rec, R, t), byKind = {}, fit = 'none', med = 'ok', any = false;
  S.forEach(function(x){
    if (x.group === 'fit') { fit = x.st === 'none' ? fit : (fit === 'none' ? x.st : worst(fit, x.st)); return; }
    if (x.st !== 'none') any = true;
    x.kinds.forEach(function(k){ byKind[k] = byKind[k] ? worst(byKind[k], x.st) : x.st; });
    if (x.st !== 'none') med = worst(med, x.st);
  });
  var rm = activeRemoval(rec, t, R);
  return { byKind: byKind, fit: fit, med: any ? med : 'none', removed: !!rm, removedKinds: rm ? listOf(R.removal.kinds) : [] };
}

/* ── the checks for one job ── */
function live(r){ return !!r && !r.deleted && !r.archived; }   /* archived = kept, hidden from the active lists */
function airRecs(p){ return arr(p.envLog).filter(function(r){ return live(r) && r.kind === 'air'; }); }
function airType(r){ var t = low(r.atype || r.type); return /personal|worker/.test(t) ? 'personal' : /clearance|clear/.test(t) ? 'clearance' : /background|baseline|before/.test(t) ? 'baseline' : /area/.test(t) ? 'area' : t; }
function pass(r){ return /^pass/i.test(s(r.pass)); }
function dailyRecs(p){ return arr(p.envLog).filter(function(r){ return live(r) && (r.kind === 'compday' || r.kind === 'contain'); }); }
function noticeLogged(p, rule){ var L = low(rule.label), words = L.indexOf('asbestos') >= 0 ? /asbestos|demolition/i : L.indexOf('lead') >= 0 ? /lead/i : null; return arr(p.envLog).filter(function(r){ return live(r) && r.kind === 'notice' && (s(r.rule) ? s(r.rule) === s(rule.id) : !!words && words.test(s(r.ntype))); }).sort(function(a, b){ return ymd(a.date) < ymd(b.date) ? 1 : -1; })[0] || null; }
function noticeDue(rule, p){ var st = ymd(p.startDate); if (!st) return ''; var n = parseInt(rule.daysBefore, 10); if (!n) return addDays(st, -1); return rule.workingDays ? workingDaysBefore(st, n) : addDays(st, -n); }
function evaluate(p, ctx){
  ctx = ctx || {}; var R = ctx.rules || rules(), t = ctx.today || todayLocal();
  var kinds = detectKinds(p, ctx), out = { on: kinds.length > 0, kinds: kinds, state: '', items: [], people: [], closeout: [], status: 'ok', counts: { block: 0, due: 0, ok: 0 } };
  if (!out.on) return out;
  var st = stateOf(p), E = ec(p), go = started(p, t), done = finished(p), near = nearDone(p), soonN = +(R.settings || {}).reminderDays || 5;
  out.state = st;
  var item = function(o){ out.items.push(o); if (o.st === 'block' || o.st === 'due' || o.st === 'ok') out.counts[o.st]++; return o; };
  var bad = function(rule, k){ return blocks(rule, kinds) ? 'block' : 'due'; };
  /* 1 · people */
  var crew = crewOf(p, ctx), med = obj(ctx.medStatus);
  var reqs = arr(R.people).filter(function(r){ return hasKind(r, kinds) && (!listOf(r.states).length || !st || listOf(r.states).indexOf(st) >= 0); });   /* EPAHUD: a rule for some states only (states: 'MS') */
  var mreq = arr(R.medical).filter(function(m){ return hasKind(m, kinds); });
  out.people = crew.map(function(c){ return Object.assign({}, c, { checks: [], medical: null }); });
  if (!crew.length && (reqs.some(function(r){ return r.who !== 'company'; }) || mreq.length)) item({ sec: 'people', id: 'crew', label: 'Nobody is on this job yet', st: 'due', note: 'Schedule the crew (or add people here) to check their certifications and medical status.' });
  reqs.forEach(function(r){
    var T = certType(R, r.cert), lab = s(r.label) || T.label;
    if (r.who === 'company') { var x = certFor(R, ctx, 'company', r.cert, st); item({ sec: 'people', id: r.id, label: lab, who: 'GrayCo (firm)', st: x.st === 'ok' ? 'ok' : x.st === 'soon' || x.st === 'nodate' ? 'due' : bad(r), note: x.note, exp: x.exp }); return; }
    if (!crew.length) return;
    if (r.who === 'supervisor') {
      var sups = out.people.filter(function(c){ return c.role === 'supervisor'; }), pool = sups.length ? sups : out.people, hit = null, soon = null;
      pool.forEach(function(c){ var x = certFor(R, ctx, c, r.cert, st); c.checks.push(Object.assign({ id: r.id, label: T.label }, x)); if (x.st === 'ok' && !hit) hit = { c: c, x: x }; if ((x.st === 'soon' || x.st === 'nodate') && !soon) soon = { c: c, x: x }; });
      var w = hit || soon; item({ sec: 'people', id: r.id, label: lab, who: w ? w.c.name : '', st: hit ? 'ok' : soon ? 'due' : bad(r), note: w ? w.c.name + ' — ' + w.x.note : (sups.length ? 'No supervisor on this job holds a current ' + T.label : 'Nobody on this job holds a current ' + T.label + ' — mark the supervisor') + (st ? ' (' + st + ')' : '') });
      return;
    }
    var who = out.people.filter(function(c){ return r.who === 'each' || c.role !== 'supervisor'; });
    who.forEach(function(c){
      var x = certFor(R, ctx, c, r.cert, st); c.checks.push(Object.assign({ id: r.id, label: T.label }, x));
      item({ sec: 'people', id: r.id + ':' + low(c.name), label: T.label + ' — ' + c.name, who: c.name, st: x.st === 'ok' ? 'ok' : x.st === 'soon' || x.st === 'nodate' ? 'due' : bad(r), note: x.note, exp: x.exp });
    });
  });
  /* medical: status only (current / due / overdue) — the worker's tests and results are never on a job */
  if (mreq.length) out.people.forEach(function(c){
    var ms = c.email ? obj(med[c.email]) : {}, fitReq = mreq.filter(function(m){ return (m.group || '') === 'fit'; }), medReq = mreq.filter(function(m){ return (m.group || '') !== 'fit'; });
    if (fitReq.length) {
      var f = s(ms.fit) || 'none', cf = certFor(R, ctx, c, 'fit_test', st);
      var ok = f === 'ok' || cf.st === 'ok', soon = !ok && (f === 'due' || cf.st === 'soon');
      var bl = fitReq.some(function(m){ return blocks(m, kinds); });
      c.fit = ok ? 'ok' : soon ? 'due' : 'over';
      item({ sec: 'people', id: 'fit:' + low(c.name), label: 'Respirator fit test (12 months) — ' + c.name, who: c.name, st: ok ? 'ok' : soon ? 'due' : bl ? 'block' : 'due', note: ok ? 'current' : soon ? 'due soon' : 'none on file or out of date' });
    }
    if (medReq.length) {
      var w = 'ok', blk = false;
      kinds.forEach(function(k){ if (!medReq.some(function(m){ return hasKind(m, [k]); })) return; var v = s(obj(ms.byKind)[k]) || 'none'; w = worst(w, v); if ((v === 'over' || v === 'none') && medReq.some(function(m){ return hasKind(m, [k]) && blocks(m, kinds); })) blk = true; });
      c.medical = w;
      item({ sec: 'people', id: 'med:' + low(c.name), label: 'Medical surveillance — ' + c.name, who: c.name, st: w === 'ok' ? 'ok' : w === 'due' ? 'due' : blk ? 'block' : 'due', note: w === 'ok' ? 'medical current ✅' : w === 'due' ? 'medical due ⚠' : w === 'none' ? 'not in the medical program yet ⚠' : 'medical overdue ⚠' });
    }
    if (ms.removed && kinds.some(function(k){ return listOf(ms.removedKinds).indexOf(k) >= 0; })) {
      c.removed = true;
      item({ sec: 'people', id: 'removed:' + low(c.name), label: c.name + ' — not cleared for exposure work (medical)', who: c.name, st: 'block', note: 'Medically removed from exposure work — schedule them on non-exposure work only until the physician clears them.' });
    }
  });
  /* 2 · air testing / monitoring */
  var A = airRecs(p);
  arr(R.air).filter(function(r){ return hasKind(r, kinds); }).forEach(function(r){
    var mine = A.filter(function(x){ return s(x.rule) === r.id || (!s(x.rule) && airType(x) === r.type); }).sort(function(a, b){ return ymd(a.date) < ymd(b.date) ? 1 : -1; });
    var last = mine[0], o = { sec: 'air', id: r.id, label: r.label, type: r.type, records: mine.length, gate: !!r.gate };
    if (r.when === 'clearance') {
      var ok = last && pass(last);
      o.st = ok ? 'ok' : (near ? 'block' : 'wait');
      o.note = ok ? 'Passed ' + ymd(last.date) + (last.lab ? ' · ' + s(last.lab) : '') : last ? (/fail/i.test(s(last.pass)) ? 'FAILED ' + ymd(last.date) + ' — clean again and re-test' : 'Waiting on the result (' + ymd(last.date) + ')') : near ? 'Clearance is needed before the job can be closed' : 'After the work — the job cannot be closed until it passes';
      if (!ok && r.gate) out.closeout.push(r.label);
      if (o.st === 'block' && !r.gate) o.st = 'due';
    } else if (r.when === 'before') {
      o.st = last ? 'ok' : go ? bad(r) : 'due'; o.note = last ? 'Taken ' + ymd(last.date) : 'Before the work starts';
    } else {
      if (!go) { o.st = 'wait'; o.note = 'During the work' + (r.everyDays ? ' (every ' + (+r.everyDays === 1 ? 'work day' : r.everyDays + ' days') + ')' : ''); }
      else if (done) { o.st = mine.length ? 'ok' : bad(r); o.note = mine.length ? mine.length + ' sample(s) logged' : 'No sample was logged during the work'; }
      else {
        var age = last ? daysBetween(ymd(last.date), t) : null, every = +r.everyDays || 0;
        o.st = !last ? bad(r) : every && age > every && dow(t) !== 0 && dow(t) !== 6 ? 'due' : 'ok';
        o.note = !last ? 'No sample yet — due now' : (o.st === 'due' ? 'Last sample ' + ymd(last.date) + ' — due again' : 'Last sample ' + ymd(last.date)) + (/waiting/i.test(s(last.pass)) ? ' (waiting on the lab)' : '');
        if (last && /fail/i.test(s(last.pass)) && r.type !== 'personal') { o.st = 'due'; o.note += ' — above the limit: check the containment'; }
      }
    }
    item(o);
  });
  /* 3 · notices & permits */
  arr(R.notices).filter(function(r){ var L = listOf(r.states); return hasKind(r, kinds) && (!L.length || !st || L.indexOf(st) >= 0); }).forEach(function(r){
    var rec = obj(obj(E.notices)[r.id]), lg = noticeLogged(p, r), due = noticeDue(r, p), o = { sec: 'notice', id: r.id, label: r.label + (r.agency ? ' — ' + r.agency : ''), due: due, agency: s(r.agency), note: '' };
    if (!st && listOf(r.states).length) o.label += ' (set the job\'s state)';
    if (rec.na) { o.st = 'na'; o.note = 'N/A — ' + s(rec.na.why) + ' (' + s(rec.na.by) + ')'; }
    else if (rec.filedOn || lg) { o.st = 'ok'; o.note = 'Filed ' + ymd(rec.filedOn || (lg && lg.date)) + ((rec.conf || (lg && lg.conf)) ? ' · conf # ' + s(rec.conf || lg.conf) : ''); o.filed = rec.filedOn ? rec : { filedOn: lg.date, conf: lg.conf }; }
    else if (!due) { o.st = 'due'; o.note = 'Add the start date to see when it is due'; }
    else if (due < t || go) { o.st = blocks(r, kinds) ? 'block' : 'due'; o.note = 'OVERDUE — was due ' + due; o.over = true; }
    else if (daysBetween(t, due) <= soonN) { o.st = 'due'; o.note = 'Due ' + due + ' (' + daysBetween(t, due) + ' day' + (daysBetween(t, due) === 1 ? '' : 's') + ')'; }
    else { o.st = 'wait'; o.note = 'Due ' + due; }
    o.note += ' · ' + s(r.note || CONFIRM);
    item(o);
  });
  /* 4 · daily compliance log */
  var dl = dailyRecs(p), todayLog = dl.filter(function(r){ return ymd(r.date) === t && r.kind === 'compday'; })[0];
  var dItems = arr(R.daily).filter(function(d){ return hasKind(d, kinds); });
  if (dItems.length) {
    var tot = dailyTotals(p, R), signed = todayLog && obj(todayLog.signoff).name;
    item({ sec: 'daily', id: 'daily', label: 'Daily log', totals: tot, st: !go || done ? (dl.length || !go ? 'ok' : 'due') : signed ? 'ok' : (dow(t) === 0 || dow(t) === 6) && !todayLog ? 'ok' : R.dailyBlock ? 'block' : 'due',
      note: (todayLog ? 'Today: ' + (signed ? 'signed off by ' + s(todayLog.signoff.name) : 'started by ' + s(todayLog.by) + ' — supervisor sign-off needed') : go && !done ? 'Not done today yet' : '') + (tot.days ? (todayLog || (go && !done) ? ' · ' : '') + tot.days + ' day(s) logged, ' + tot.signed + ' signed' : '') });
  }
  /* 5 · written programs */
  arr(R.programs).filter(function(r){ return hasKind(r, kinds); }).forEach(function(r){
    var rv = ymd(r.reviewed), jr = obj(obj(E.programs)[r.id]), stale = !rv || addMonths(rv, +r.reviewEveryMonths || 12) < t;
    item({ sec: 'program', id: r.id, label: r.label, file: s(r.file), st: stale ? 'due' : 'ok', reviewed: rv, jobReviewed: ymd(jr.on), jobBy: s(jr.by), note: (rv ? 'Program reviewed ' + rv : 'Program review date not set') + (stale && rv ? ' — review due' : '') + ' · ' + (ymd(jr.on) ? 'gone over for this job ' + ymd(jr.on) + (jr.by ? ' (' + s(jr.by) + ')' : '') : 'not yet gone over for this job') });
  });
  out.status = out.counts.block ? 'block' : out.counts.due ? 'due' : 'ok';
  return out;
}
function closeoutBlockers(p, ctx){ var e = evaluate(p, ctx); return e.on ? e.closeout : []; }
/* records retention: the keep-until date of a record of a category on a job */
/* years: 'forever' (the default) or a number an admin set; anything unreadable = forever (never shorter by accident) */
function retainYears(R, cat){ var r = arr(R.retention).find(function(x){ return x && x.cat === cat; }); if (!r) return Infinity; var y = parseFloat(r.years); return isFinite(y) && y > 0 ? y : Infinity; }
function retainUntil(R, cat, base){ var y = retainYears(R, cat); return y !== Infinity && ymd(base) ? addMonths(ymd(base), Math.round(y * 12)) : ''; }
/* the daily logs rolled up for the panel and the record package */
function num(v){ var n = parseFloat(s(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function dailyTotals(p, R){
  R = R || rules(); var L = arr(p.envLog).filter(function(r){ return live(r) && r.kind === 'compday'; }), out = { days: L.length, signed: 0, incidents: 0, readings: 0, visitors: 0, samples: 0, manifests: [], sums: {} };
  var sumCols = {}; arr(R.daily).forEach(function(f){ if (f.type === 'rows' && f.sum) sumCols[f.key] = listOf(f.sum); });
  L.forEach(function(r){
    if (obj(r.signoff).name) out.signed++;
    var V = obj(r.values), RW = obj(r.rows);
    if (s(V.incidents)) out.incidents++;
    out.readings += arr(RW.mano).length; out.visitors += arr(RW.visitors).length; out.samples += arr(RW.air).length;
    arr(RW.waste).forEach(function(w){ if (s(w.manifest) && out.manifests.indexOf(s(w.manifest)) < 0) out.manifests.push(s(w.manifest)); });
    Object.keys(sumCols).forEach(function(k){ arr(RW[k]).forEach(function(row){ sumCols[k].forEach(function(c){ out.sums[k + '.' + c] = (out.sums[k + '.' + c] || 0) + num(row[c]); }); }); });
  });
  return out;
}
function recCat(r, kinds){ if (!r) return 'project'; if (r.kind === 'air') return airType(r) === 'personal' ? 'exposure' : (kinds.indexOf('lead_rrp') >= 0 && kinds.length === 1 ? 'rrp' : 'project'); if (r.kind === 'compday' || r.kind === 'contain' || r.kind === 'waste' || r.kind === 'notice' || r.kind === 'ppe') return kinds.indexOf('lead_rrp') >= 0 && kinds.length === 1 ? 'rrp' : 'project'; return 'project'; }

/* medical removal protection pay for a pay period → { amount, weekly, weeks, detail, protectEnd } | null
   removal = { start, end, basis, avgWeeks, weekly, wcWeekly, maxMonths }; ctx = { runs, empKey, empKeys, hourlyRate, weeklyHours, annualSalary, earned } */
function mrpPay(removal, from, to, ctx, R){
  R = R || rules(); var RM = R.removal || {}, rm = removal || {}; ctx = ctx || {};
  var st = ymd(rm.start); if (!st) return null;
  var protectEnd = addMonths(st, +rm.maxMonths || +RM.maxMonths || 18), back = ymd(rm.end);
  var lastDay = back ? addDays(back, -1) : addDays(protectEnd, -1); if (back && back > protectEnd) lastDay = addDays(protectEnd, -1);
  if (addDays(protectEnd, -1) < lastDay) lastDay = addDays(protectEnd, -1);
  var a = st > ymd(from) ? st : ymd(from), b = lastDay < ymd(to) ? lastDay : ymd(to);
  if (!a || !b || b < a) return null;
  var days = daysBetween(a, b) + 1, weeks = Math.round(days / 7 * 1000) / 1000;
  var basis = s(rm.basis || RM.basis || 'average'), weekly = +rm.weekly || 0, how = '';
  if (!weekly && basis === 'average') {
    var N = +rm.avgWeeks || +RM.avgWeeks || 6, lo = addDays(st, -7 * N), tot = 0, wk = 0, keys = [s(ctx.empKey)].concat(arr(ctx.empKeys)).map(low).filter(Boolean);
    arr(ctx.runs).forEach(function(run){
      if (!run || ['approved', 'paid'].indexOf(s(run.status)) < 0) return;
      var f = ymd(run.from || run.periodFrom), e = ymd(run.to || run.periodTo); if (!f || !e || e >= st || e < lo) return;
      arr(run.lines).forEach(function(L){ if (!L || L.status === 'denied') return; if (keys.indexOf(low(L.empId)) < 0 && keys.indexOf(low(L.name)) < 0) return; tot += +L.gross || 0; wk += (daysBetween(f, e) + 1) / 7; });
    });
    if (wk > 0) { weekly = tot / wk; how = 'average of $' + tot.toFixed(2) + ' over ' + Math.round(wk * 10) / 10 + ' week(s) before ' + st; }
    else basis = 'normal';
  }
  if (!weekly) {
    if (+ctx.annualSalary) { weekly = +ctx.annualSalary / 52; how = 'salary ÷ 52'; }
    else { var h = +rm.weeklyHours || +ctx.weeklyHours || 40, r = +ctx.hourlyRate || 0; weekly = h * r; how = 'normal ' + h + ' h/week × $' + r.toFixed(2); }
  }
  if (+rm.weekly) how = 'set weekly amount';
  var wExact = days / 7, protectedAmt = weekly * wExact, wc = (+rm.wcWeekly || 0) * wExact, earned = RM.topUp === false ? 0 : Math.max(0, +ctx.earned || 0);
  var amt = Math.max(0, protectedAmt - wc - earned);
  amt = Math.round(amt * 100) / 100;
  return { amount: amt, weekly: Math.round(weekly * 100) / 100, weeks: weeks, from: a, to: b, protectEnd: protectEnd,
    detail: '$' + weekly.toFixed(2) + '/week (' + how + ') × ' + weeks + ' week(s) ' + a + ' → ' + b + (wc ? ' − workers\' comp $' + wc.toFixed(2) : '') + (earned ? ' − pay for other work this period $' + earned.toFixed(2) : '') + ' · protected to ' + protectEnd + ' · ' + s(RM.note || 'confirm with your attorney') };
}

var API = { DEFAULT_RULES: DEFAULT_RULES, SECTIONS: SECTIONS, CONFIRM: CONFIRM, rules: rules, detectKinds: detectKinds, isOn: isOn, stateOf: stateOf, started: started, finished: finished, nearDone: nearDone,
  crewOf: crewOf, crewOnDay: crewOnDay, certFor: certFor, certType: certType, certIs: certIs, medSummary: medSummary, medNext: medNext, publicStatus: publicStatus, activeRemoval: activeRemoval,
  evaluate: evaluate, closeoutBlockers: closeoutBlockers, noticeDue: noticeDue, workingDaysBefore: workingDaysBefore, retainUntil: retainUntil, retainYears: retainYears, recCat: recCat, live: live, dailyTotals: dailyTotals,
  airType: airType, mrpPay: mrpPay, hasKind: hasKind, listOf: listOf, addDays: addDays, addMonths: addMonths, daysBetween: daysBetween, today: todayLocal, typeText: typeText };
if (typeof module === 'object' && module.exports) module.exports = API; else root._gcEnvCompCore = API;
})(this);
