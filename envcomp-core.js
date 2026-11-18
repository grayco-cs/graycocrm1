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
    { key: 'mold_tech', label: 'Mold remediation training (e.g. IICRC AMRT)', words: 'amrt, mold remediation, applied microbial' },
    /* ENVDOCS: the GrayCo crew on a job where a licensed sub does the asbestos work */
    { key: 'asb_awareness', label: 'Asbestos awareness training', words: 'asbestos awareness, awareness training', months: 12 }],
  /* 1 · people on the job: who = company | supervisor (at least one on the crew) | worker (each non-supervisor) | each (everyone) */
  people: [
    { id: 'rrp-firm', kinds: 'lead_rrp', who: 'company', cert: 'rrp_firm', block: true, note: CONFIRM },
    { id: 'rrp-renovator', kinds: 'lead_rrp', who: 'supervisor', cert: 'rrp_renovator', block: true, label: 'A certified renovator assigned to the job', note: CONFIRM },
    { id: 'rrp-worker', kinds: 'lead_rrp', who: 'worker', cert: 'rrp_renovator', block: false, label: 'Workers: certified renovator, or trained on the job by one (Lead 04 record)', note: CONFIRM },
    { id: 'la-firm', kinds: 'lead_abate', who: 'company', cert: 'lead_abate_firm', block: true, note: CONFIRM },
    { id: 'la-sup', kinds: 'lead_abate', who: 'supervisor', cert: 'lead_supervisor', block: true, label: 'A certified lead abatement supervisor on site', note: CONFIRM },
    { id: 'la-worker', kinds: 'lead_abate', who: 'each', cert: 'lead_worker', block: true, label: 'Every worker: certified lead abatement worker (or supervisor)', note: CONFIRM },
    { id: 'asb-firm', kinds: 'asbestos', by: 'crew', who: 'company', cert: 'asb_firm', block: true, note: CONFIRM },
    { id: 'asb-sup', kinds: 'asbestos', by: 'crew', who: 'supervisor', cert: 'asb_supervisor', block: true, label: 'A state-licensed asbestos supervisor on site', note: CONFIRM },
    { id: 'asb-worker', kinds: 'asbestos', by: 'crew', who: 'each', cert: 'asb_worker', block: true, label: 'Every worker: state-licensed asbestos worker (or supervisor)', note: CONFIRM },
    { id: 'asb-aware', kinds: 'asbestos', by: 'sub', who: 'each', cert: 'asb_awareness', block: false, label: 'GrayCo crew: asbestos awareness training (the licensed sub does the asbestos work)', note: CONFIRM },
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
    note: 'Default (removal at the blood lead Removal From Work level, back to work below the Back To Work level — both from the lead levels record; pay kept up to 18 months, the average of the last 6 weeks before removal, follow-up blood tests monthly, reduced by workers\' comp wage replacement and by pay for other work in the period) — confirm with your attorney / state program.' },
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
    /* ENVDOCS: the lead decon / hygiene facility, checked every work day (owner: "Set up decon unit for lead.") */
    { key: 'deconOk', section: 'Decon / hygiene', label: 'Decon unit checked — clean, lit, supplies stocked (soap, clean water, towels, bags, suits, booties)', type: 'check', kinds: 'lead_abate', decon: true },
    { key: 'deconWater', section: 'Decon / hygiene', label: 'Wash water handled per the plan (collected / filtered / disposed — never dumped on the ground or down a storm drain)', type: 'check', kinds: 'lead_abate', decon: true },
    { key: 'deconNote', section: 'Decon / hygiene', label: 'Decon notes / repairs / supplies restocked', type: 'text', kinds: 'lead_abate', decon: true },
    { key: 'deconPhotos', section: 'Decon / hygiene', label: 'Photo of the decon unit today', type: 'photos', kinds: 'lead_abate', decon: true },
    { key: 'waste', section: 'Waste', label: 'Waste generated (by waste stream — ENVDOCS: each stream is characterized by TCLP or generator knowledge before disposal)', type: 'rows', cols: 'stream|Waste stream, bags|Bags, drums|Drums, manifest|Manifest #, store|Storage location', sum: 'bags, drums', kinds: '*' },
    { key: 'fallProt', section: 'Safety', label: 'Fall protection in use for any work at {fall.triggerFt} ft or more (OSHA trigger)', type: 'check', kinds: '*' },
    { key: 'ladder', section: 'Safety', label: 'Ladders extend {fall.ladderFt} ft over the landing / platform', type: 'check', kinds: '*' },
    { key: 'signs', section: 'Signage', label: 'Warning signs posted at every entrance', type: 'check', kinds: '*' },
    { key: 'signPhotos', section: 'Signage', label: 'Photo of the posted signs (ENVDOCS: print them from 🛡 Compliance → 🪧 Signs)', type: 'photos', kinds: '*' },
    { key: 'incidents', section: 'Incidents', label: 'Incidents, near-misses, deviations', type: 'textarea', kinds: '*' },
    { key: 'supNotes', section: 'Sign-off', label: 'Supervisor notes', type: 'textarea', kinds: '*' },
    { key: 'photos', section: 'Sign-off', label: 'Photos', type: 'photos', kinds: '*' },
    { key: 'signoff', section: 'Sign-off', label: 'Supervisor sign-off', type: 'signoff', kinds: '*' }],
  dailyBlock: false,
  /* 5 · the company's written programs (company-docs/), with the company review date and the job review */
  programs: [   /* ENVDOCS: the current versions (the earlier files stay in company-docs/, listed as earlier versions);
     adminName / adminPhone / approvedBy / approvedOn are filled into the documents and the per-job plans (adminName blank = the default
     administrator: an admin from the people list — for lead work the admin holding the lead supervisor certification) */
    { id: 'resp', label: 'Respiratory Protection Program', file: '/company-docs/01667c529f454cf1/GrayCo_Respiratory_Protection_Program_v2.docx', kinds: 'lead_abate, asbestos, mold, trauma', reviewEveryMonths: 12, reviewed: '', adminName: '', adminPhone: '', approvedBy: '', approvedOn: '', adminCert: 'lead_supervisor' },
    { id: 'hazcom', label: 'Hazard Communication Program', file: '/company-docs/01667c529f454cf1/GrayCo_Hazard_Communication_Program.docx', kinds: '*', reviewEveryMonths: 12, reviewed: '', adminName: '', adminPhone: '', approvedBy: '', approvedOn: '' },
    { id: 'lead', label: 'Lead Safety Program', file: '/company-docs/01667c529f454cf1/GrayCo_Lead_Safety_Program_v2.docx', kinds: 'lead_rrp, lead_abate', reviewEveryMonths: 12, reviewed: '', adminName: '', adminPhone: '', approvedBy: '', approvedOn: '', adminCert: 'lead_supervisor' },
    { id: 'asb', label: 'Asbestos Awareness and Control Program (a licensed sub does the asbestos work)', file: '/company-docs/01667c529f454cf1/GrayCo_Asbestos_Awareness_and_Control_Program_v2.docx', kinds: 'asbestos', by: 'sub', reviewEveryMonths: 12, reviewed: '', adminName: '', adminPhone: '', approvedBy: '', approvedOn: '' },
    { id: 'asbcrew', label: 'GrayCo Asbestos Program (GrayCo crew does the asbestos work)', file: '/company-docs/01667c529f454cf1/GrayCo_Asbestos_Program.docx', kinds: 'asbestos', by: 'crew', inUse: false, reviewEveryMonths: 12, reviewed: '', adminName: '', adminPhone: '', approvedBy: '', approvedOn: '' },
    { id: 'toolbox', label: 'Toolbox Talks & Training Plan', file: '/company-docs/01667c529f454cf1/GrayCo_Lead_Asbestos_Toolbox_Talks_and_Training_Plan.docx', kinds: 'lead_rrp, lead_abate, asbestos', reviewEveryMonths: 12, reviewed: '' },
    { id: 'health', label: 'Health Effects training — lead & asbestos', file: '/company-docs/01667c529f454cf1/GrayCo_Health_Effects_Lead_Asbestos_Training.docx', kinds: 'lead_rrp, lead_abate, asbestos', reviewEveryMonths: 12, reviewed: '' }],
  /* 6 · records retention (years) — what kind of record keeps how long; kept from deletion until then */
  retention: [   /* the owner's standing rule (11/16): "Always keep records for everything." — kept forever unless an admin sets years */
    { cat: 'rrp', label: 'RRP job records', years: 'forever', note: 'Kept forever (owner\'s rule) — the legal minimum is shorter; confirm with your state program' },
    { cat: 'project', label: 'Abatement / remediation project records (notices, daily logs, clearance, waste manifests)', years: 'forever', note: 'Kept forever (owner\'s rule)' },
    { cat: 'exposure', label: 'Exposure monitoring (air samples)', years: 'forever', note: 'Kept forever (owner\'s rule)' },
    { cat: 'medical', label: 'Medical surveillance & medical removal records', years: 'forever', note: 'Kept forever (owner\'s rule)' },
    { cat: 'training', label: 'Training / certification records', years: 'forever', note: 'Kept forever (owner\'s rule)' }],
  settings: { reminderDays: 5, closeoutOverride: 'admin', expiringDays: 30,
    /* ENVDOCS: asbDefault — who does the asbestos work on a job unless the job says otherwise ('sub' = a licensed abatement
       subcontractor, the owner's 11/17 answer "GrayCo will hire an asbestos contractor for now"; 'crew' = GrayCo's own crew).
       planBlock: the per-job Employee Protection Plan missing / unsigned → ⛔ instead of ⚠. deconBlock: the same for the decon set-up. */
    asbDefault: 'sub', planBlock: false, planOwnerSign: true, deconBlock: false, clinic: '', clinicPhone: '', programReviewDays: 30,
    /* ENVDOCS · TCLP (owner: "TCLP"): the regulatory threshold a TCLP lead result is compared with (mg/L; result ≥ threshold → hazardous)
       — the threshold is in the lead levels record (levels.waste.tclp); wasteShipBlock: a stream shipped / disposed before it is characterized → ⛔ */
    wasteShipBlock: true },
  /* ENVDOCS · the waste streams of a job (TCLP waste characterization): the kinds that characterize their waste, the usual streams */
  waste: { kinds: 'lead_abate, lead_rrp', streams: 'Lead paint chips / debris, Blast media, Sludge / wash water, Demolition debris (painted components), Plastic sheeting / PPE / filters',
    note: 'Each waste stream is characterized (TCLP result, or documented generator knowledge with its basis) before it is disposed of. Hazardous: manifest, hauler, TSD facility, generator status. Non-hazardous: the landfill\'s acceptance letter. Confirm with EPA / your state program.' },
  /* ENVDOCS: the licensed asbestos abatement sub — what GrayCo collects and keeps (field = the job's sub record field) */
  subChecks: [
    { id: 'sub-firm', field: 'license', label: 'Licensed asbestos abatement contractor named — company + state license # (valid)', block: true, note: CONFIRM },
    { id: 'sub-cp', field: 'competent', label: 'The sub\'s competent person / licensed supervisor on site named', block: true, note: CONFIRM },
    { id: 'sub-plan', field: 'workPlan', label: 'The sub\'s written work plan received', block: false, note: CONFIRM },
    { id: 'sub-workers', field: 'workers', label: 'The sub\'s worker license cards / training certificates received', block: false, note: CONFIRM },
    { id: 'sub-ins', field: 'insurance', label: 'The sub\'s insurance certificate (including pollution liability) received', block: false, note: CONFIRM },
    { id: 'sub-notice', field: 'notice', label: 'The sub\'s state notification — copy / confirmation # received', block: false, note: CONFIRM },
    { id: 'sub-release', field: 'release', label: 'Area released to GrayCo in writing (after clearance)', block: false, when: 'clearance', note: CONFIRM }],
  /* ENVDOCS: the lead decon / hygiene facility (owner: "Set up decon unit for lead.") — when, the set-up checklist, the supplies.
     Every item is a default — confirm with your state program. */
  decon: { kinds: 'lead_abate', note: 'Default — a decon / hygiene facility when lead exposure is above the PEL or during interim protection (trigger tasks until the exposure assessment is done). Confirm with your state program.',
    types: 'Portable decon trailer, Built on site (poly / framed), Wash station (hand & face) + change area',
    setup: [
      'Location next to the work area exit — one-way flow: DIRTY / equipment room → WASH (shower or wash station) → CLEAN change room',
      'Dirty room: bag-out for suits, booties and gloves; labeled 6-mil waste bags; HEPA vacuum',
      'Wash: clean water supply, soap, towels (shower where feasible); wash water collected / contained',
      'Clean room: lockers or sealed bags for street clothes, clean towels, mirror, bench',
      'Flap doors / airlocks between the rooms; tack pad at the dirty-side entrance',
      'Lighting in every room; GFCI-protected power',
      'Warning signs at the dirty-side entrance ("DANGER — LEAD WORK AREA"); no eating, drinking or smoking except in the clean area / break area',
      'Wash-water handling set: collected, filtered / tested as the state program requires, disposed — never on the ground or down a storm drain',
      'Daily cleaning and inspection assigned (recorded on the daily log)'],
    supplies: 'HEPA vacuum (+ spare filters / bags), wash station or portable shower with clean water, soap, towels, wash-water collection drum / filter, lockers or bags for street clothes, disposable suits + booties + gloves, 6-mil waste bags + labels + duct tape, mirror, tack pads, warning signs, work lights, GFCI cords, 6-mil poly + framing / zipper doors (built on site)' },
  /* ENVDOCS: the per-job Employee Protection Plan — the default text of each part by job kind (filled below) */
  planText: []
};
/* ENVDOCS: the default text of the per-job Employee Protection Plan — { kinds, by (asbestos: 'crew' | 'sub'), sec, text }.
   Starting points only, admin-editable (⚙ Compliance rules → Plan text); the plan prints "Default — confirm with your state program / attorney". */
(function(){
  var L = 'lead_rrp, lead_abate', P = [];
  function t(kinds, sec, text, by){ P.push(by ? { kinds: kinds, by: by, sec: sec, text: text } : { kinds: kinds, sec: sec, text: text }); }
  /* lead (RRP and abatement) — GrayCo's own crew */
  t(L, 'exposure', 'Trigger tasks (manual scraping, heat gun below 1,100°F, power tools with dust collection, manual demolition, lead soil work) are presumed above the PEL until personal air monitoring or objective data from the last 12 months shows otherwise; interim protection applies until then (Lead Safety Program §4). Action level {air.al} {air.unit}, PEL {air.pel} {air.unit} (8-hour TWA).');
  t(L, 'engineering', 'Containment: 6-mil plastic floor layers, two-layer entry, critical barriers; HVAC off and returns sealed; HEPA-filtered negative air where set up; power tools only with HEPA dust collection; wet methods (mist and wet-scrape). Lead Safety Program §6.');
  t(L, 'practices', 'No sanding of any kind, no dry scraping, no open flame, no heat gun at 1,100°F or more, no methylene-chloride strippers; mist and wet-scrape only; clean up before leaving every day; gooseneck-sealed, labeled bags; no eating, drinking, smoking or vaping in the work area; shoe covers off at every exit (Lead Safety Program §5).');
  t(L, 'respirator', 'Trigger tasks: N100 filtering facepiece or half-face respirator with N100/P100 filters until the exposure assessment shows exposure below the PEL; a higher protection factor when the measured exposure ÷ the respirator\'s protection factor is not under the PEL ({air.pel} {air.unit}) — see the minimum-respirator math below. Every wearer medically cleared and fit tested within 12 months (Respiratory Protection Program).');
  t(L, 'clothing', 'Provided by GrayCo at no cost: disposable coveralls, hoods, shoe covers, gloves, eye protection. Changed at every exit; disposables bagged as lead waste; reusable work clothes cleaned by GrayCo\'s arrangement in labeled bags — never taken home (Lead Safety Program §9).');
  t(L, 'hygiene', 'Clean change area apart from street clothes; hand and face wash at the work area exit (showers where feasible); break area outside the work area; wash before eating, drinking or smoking and at the end of the shift (Lead Safety Program §10).');
  t(L, 'housekeeping', 'HEPA vacuum and wet wipe / wet mop only — no dry sweeping, no compressed air, no shop vacs; clean the work area before every break off site and at the end of the day; waste sealed, labeled and secured (Lead Safety Program §7).');
  t(L, 'inspection', 'Competent person / certified renovator: start of every shift (containment, critical barriers, signs, HEPA equipment, decon / wash station), during the work (work practices, respirators, protective clothing), end of shift (clean-up, waste secured). Recorded on the daily log with photos.');
  t(L, 'signs', 'DANGER — LEAD WORK AREA signs (English / Spanish) at every entrance, caution tape around the area, labels on every waste bag; signs stay up until cleaning verification / clearance passes.');
  /* asbestos — a licensed abatement subcontractor does the work (the default) */
  t('asbestos', 'exposure', 'GrayCo crew: no asbestos exposure is expected — GrayCo does not disturb asbestos-containing material on this job. The licensed abatement subcontractor makes its own exposure assessment under its own program.', 'sub');
  t('asbestos', 'engineering', 'By the licensed abatement subcontractor: regulated area, critical barriers, HEPA negative air exhausted outside, airlock / decontamination unit, wet methods. GrayCo checks every day that the barriers and signs are intact and keeps other trades out on the sub\'s schedule.', 'sub');
  t('asbestos', 'practices', 'GrayCo crew (awareness level): never drill, cut, sand, scrape, break or remove asbestos-containing or suspect material; stay out of the regulated area; if suspect material is found — STOP WORK in that area, keep people out, do not clean it up, call the supervisor (Stop Work Form F8); resume only after written release.', 'sub');
  t('asbestos', 'respirator', 'GrayCo crew: no respirator is required outside the regulated area. The abatement subcontractor provides respirators to its workers under its own respiratory protection program.', 'sub');
  t('asbestos', 'clothing', 'GrayCo crew: normal work clothing outside the regulated area. The subcontractor provides protective clothing to its own workers.', 'sub');
  t('asbestos', 'hygiene', 'By the subcontractor: decontamination unit for its workers. GrayCo crew: no eating, drinking or smoking near the regulated area; wash before breaks.', 'sub');
  t('asbestos', 'housekeeping', 'By the subcontractor inside the regulated area (HEPA, wet methods). GrayCo crew never cleans up suspect debris — report it.', 'sub');
  t('asbestos', 'inspection', 'GrayCo supervisor: daily check that the regulated area, barriers, negative air and signs are intact and that GrayCo workers stay out; the sub\'s competent person inspects the regulated area under its own program.', 'sub');
  t('asbestos', 'signs', 'By the subcontractor: DANGER signs at the regulated area and labels on waste. GrayCo shows its crew where ACM is at the start-up meeting and tags ACM left in place "Do not disturb".', 'sub');
  /* asbestos — GrayCo's own crew (the GrayCo Asbestos Program; not in use at this time) */
  t('asbestos', 'exposure', 'Initial exposure assessment by the competent person before the work, by work class (I–IV), with personal air monitoring for each class of work until negative exposure data is on file (GrayCo Asbestos Program §5).', 'crew');
  t('asbestos', 'engineering', 'Regulated area with critical barriers; HEPA-filtered negative pressure enclosure exhausted outside (Class I / II as the program requires); airlock and decontamination unit; HEPA vacuums; wet methods (GrayCo Asbestos Program §6).', 'crew');
  t('asbestos', 'practices', 'Methods by work class per the GrayCo Asbestos Program §6: wet methods, removal in small sections, no dry sweeping / compressed air / high-speed abrasive tools, waste bagged wet and sealed, glovebag / mini-enclosure where it applies.', 'crew');
  t('asbestos', 'respirator', 'As set by the work class and exposure assessment (GrayCo Asbestos Program §7): at least a half-face respirator with P100 filters for Class I–III work; full-face / PAPR where required. Medically cleared and fit tested within 12 months.', 'crew');
  t('asbestos', 'clothing', 'Provided by GrayCo at no cost: disposable full-body coveralls with hoods, foot coverings, gloves; removed in the equipment room; bagged as asbestos waste — never taken home (GrayCo Asbestos Program §8).', 'crew');
  t('asbestos', 'hygiene', 'Decontamination area: equipment room → shower → clean room, entered and left only through the decon; no eating, drinking or smoking in the regulated area (GrayCo Asbestos Program §9).', 'crew');
  t('asbestos', 'housekeeping', 'HEPA vacuum and wet clean; no dry sweeping, shoveling or compressed air; waste wetted, double-bagged, labeled and kept in a secured area until disposal (GrayCo Asbestos Program §6).', 'crew');
  t('asbestos', 'inspection', 'Competent person: at the start of every shift, during the work and at least once per shift — enclosure integrity, negative pressure (manometer log), work practices, PPE, decon (GrayCo Asbestos Program §3).', 'crew');
  t('asbestos', 'signs', 'DANGER — ASBESTOS signs at every regulated area entrance; labels on every waste container and on ACM left in place (GrayCo Asbestos Program §12).', 'crew');
  /* mold remediation */
  t('mold', 'exposure', 'Mold remediation: exposure depends on the size of the affected area and the disturbance; the pre-remediation assessment sets the containment level.');
  t('mold', 'engineering', 'Containment sized to the job, HEPA air scrubbers / negative air, dehumidification, critical barriers; HVAC isolated.');
  t('mold', 'practices', 'Remove and bag porous materials, HEPA vacuum, damp wipe, no dry sweeping; bag waste inside containment.');
  t('mold', 'respirator', 'At least an N95; half-face or full-face with P100 for larger areas or heavy growth, per the Respiratory Protection Program.');
  t('mold', 'clothing', 'Disposable coveralls with hoods, gloves, goggles, shoe covers — provided at no cost.');
  t('mold', 'hygiene', 'Change and wash at the containment exit; no eating or drinking in the work area.');
  t('mold', 'housekeeping', 'HEPA vacuum and damp wipe daily; no dry sweeping or compressed air.');
  t('mold', 'inspection', 'Supervisor: containment, pressure differential, equipment and PPE at the start of every shift; recorded on the daily log.');
  t('mold', 'signs', 'Warning signs at the containment entrance; waste bags labeled.');
  /* trauma / biohazard */
  t('trauma', 'exposure', 'Bloodborne pathogens and other potentially infectious materials (Exposure Control Plan).');
  t('trauma', 'engineering', 'Controlled work zones (dirty / decon / clean), sharps containers, sealed biohazard containers.');
  t('trauma', 'practices', 'Universal precautions; no recapping sharps; disinfect with an EPA-registered disinfectant per label dwell time; biohazard waste in labeled red bags / containers.');
  t('trauma', 'respirator', 'N95 or half-face with P100 / organic vapor cartridges as the task requires (Respiratory Protection Program).');
  t('trauma', 'clothing', 'Fluid-resistant coveralls, double gloves, face shield / goggles, boot covers — provided at no cost.');
  t('trauma', 'hygiene', 'Hand-washing / decon station at the exit; Hepatitis B vaccination offered.');
  t('trauma', 'housekeeping', 'Clean and disinfect equipment before it leaves the site.');
  t('trauma', 'inspection', 'Supervisor: zones, PPE and waste containers at the start of every shift.');
  t('trauma', 'signs', 'BIOHAZARD labels on containers and the work zone entrance.');
  t('general', 'exposure', 'Set the job kind on the 🛡 Compliance panel to fill this plan with the right controls.');
  DEFAULT_RULES.planText = P;
})();
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
var SECTIONS = ['kinds', 'certTypes', 'people', 'medical', 'visitTypes', 'air', 'notices', 'daily', 'programs', 'retention', 'subChecks', 'planText'];
/* the rules in use: the admin's table, each section falling back to the default when missing */
function rules(r){
  var R = clone(DEFAULT_RULES); r = obj(r);
  SECTIONS.forEach(function(k){ if (Array.isArray(r[k]) && r[k].length) R[k] = clone(r[k]); });
  ['removal', 'settings', 'decon', 'waste'].forEach(function(k){ if (obj(r[k]) && Object.keys(obj(r[k])).length) R[k] = Object.assign({}, R[k], clone(r[k])); });
  if (typeof r.dailyBlock === 'boolean') R.dailyBlock = r.dailyBlock;
  if (r.at) R.at = r.at; if (r.by) R.by = r.by;
  R.levels = levels(r.levels);   /* ENVDOCS: the ONE lead levels record (gc_lead_levels) — the page passes it in */
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
  /* ENVDOCS: who does the asbestos work ('sub' = a licensed abatement subcontractor, the default; 'crew' = GrayCo's crew) — the GrayCo
     crew is held to the asbestos licenses, medical surveillance and the crew program only when the crew does the asbestos work */
  var asbW = asbBy(p, R), ck = crewKinds(kinds, asbW); if (kinds.indexOf('asbestos') >= 0) out.asbBy = asbW;
  var item = function(o){ out.items.push(o); if (o.st === 'block' || o.st === 'due' || o.st === 'ok') out.counts[o.st]++; return o; };
  var bad = function(rule, k){ return blocks(rule, kinds) ? 'block' : 'due'; };
  /* 1 · people */
  var crew = crewOf(p, ctx), med = obj(ctx.medStatus);
  var reqs = arr(R.people).filter(function(r){ return hasKind(r, kinds) && byOk(r, kinds, asbW) && (!listOf(r.states).length || !st || listOf(r.states).indexOf(st) >= 0); });   /* ENVDOCS: by who does the asbestos work; EPAHUD: a rule for some states only (states: 'MS') */
  var mreq = arr(R.medical).filter(function(m){ return hasKind(m, ck); });
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
      ck.forEach(function(k){ if (!medReq.some(function(m){ return hasKind(m, [k]); })) return; var v = s(obj(ms.byKind)[k]) || 'none'; w = worst(w, v); if ((v === 'over' || v === 'none') && medReq.some(function(m){ return hasKind(m, [k]) && blocks(m, kinds); })) blk = true; });
      c.medical = w;
      item({ sec: 'people', id: 'med:' + low(c.name), label: 'Medical surveillance — ' + c.name, who: c.name, st: w === 'ok' ? 'ok' : w === 'due' ? 'due' : blk ? 'block' : 'due', note: w === 'ok' ? 'medical current ✅' : w === 'due' ? 'medical due ⚠' : w === 'none' ? 'not in the medical program yet ⚠' : 'medical overdue ⚠' });
    }
    if (ms.removed && ck.some(function(k){ return listOf(ms.removedKinds).indexOf(k) >= 0; })) {
      c.removed = true;
      item({ sec: 'people', id: 'removed:' + low(c.name), label: c.name + ' — not cleared for exposure work (medical)', who: c.name, st: 'block', note: 'Medically removed from exposure work — schedule them on non-exposure work only until the physician clears them.' });
    }
  });
  /* 2 · air testing / monitoring */
  var A = airRecs(p);
  arr(R.air).filter(function(r){ return hasKind(r, kinds); }).forEach(function(r){
    var mine = A.filter(function(x){ return s(x.rule) === r.id || (!s(x.rule) && airType(x) === r.type); }).sort(function(a, b){ return ymd(a.date) < ymd(b.date) ? 1 : -1; });
    var last = mine[0], o = { sec: 'air', id: r.id, label: r.label + (asbW === 'sub' && hasKind(r, ['asbestos']) && !hasKind(r, ck) ? ' — by the abatement sub (log the results here)' : ''), type: r.type, records: mine.length, gate: !!r.gate };
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
    if (asbW === 'sub' && hasKind(r, ['asbestos']) && !hasKind(r, ck)) o.label += ' — filed by the abatement sub (record its confirmation)';   /* ENVDOCS */
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
  var dItems = dailyFields(p, kinds, R);   /* ENVDOCS: the decon fields only where the decon applies */
  if (dItems.length) {
    var tot = dailyTotals(p, R), signed = todayLog && obj(todayLog.signoff).name;
    item({ sec: 'daily', id: 'daily', label: 'Daily log', totals: tot, st: !go || done ? (dl.length || !go ? 'ok' : 'due') : signed ? 'ok' : (dow(t) === 0 || dow(t) === 6) && !todayLog ? 'ok' : R.dailyBlock ? 'block' : 'due',
      note: (todayLog ? 'Today: ' + (signed ? 'signed off by ' + s(todayLog.signoff.name) : 'started by ' + s(todayLog.by) + ' — supervisor sign-off needed') : go && !done ? 'Not done today yet' : '') + (tot.days ? (todayLog || (go && !done) ? ' · ' : '') + tot.days + ' day(s) logged, ' + tot.signed + ' signed' : '') });
  }
  /* 5 · written programs */
  jobPrograms(R, kinds, asbW).forEach(function(r){   /* ENVDOCS: the asbestos program by who does the asbestos work; the administrator + approval */
    var rv = ymd(r.reviewed), jr = obj(obj(E.programs)[r.id]), stale = !rv || addMonths(rv, +r.reviewEveryMonths || 12) < t, PI = programInfo(R, r.id, ctx), off = r.inUse === false;
    item({ sec: 'program', id: r.id, label: r.label, file: s(r.file), st: stale || off ? 'due' : 'ok', reviewed: rv, jobReviewed: ymd(jr.on), jobBy: s(jr.by), admin: PI.admin, approvedBy: PI.approvedBy, note: (off ? 'Marked NOT IN USE in ⚙ Written programs — put it in use (or have a licensed sub do the asbestos work) · ' : '') + (rv ? 'Program reviewed ' + rv : 'Program review date not set') + (stale && rv ? ' — review due' : '') + (PI.admin ? ' · administrator ' + PI.admin : '') + (PI.approvedBy ? ' · approved by ' + PI.approvedBy : '') + ' · ' + (ymd(jr.on) ? 'gone over for this job ' + ymd(jr.on) + (jr.by ? ' (' + s(jr.by) + ')' : '') : 'not yet gone over for this job') });
  });
  /* ENVDOCS · the licensed asbestos sub: its license, competent person, work plan, notices, release — collected and kept */
  if (kinds.indexOf('asbestos') >= 0 && asbW === 'sub') subItems(p, R, st, t, near).forEach(function(x){ item(x); });
  /* ENVDOCS · the lead decon / hygiene facility: ⚠ until the set-up checklist is complete and photographed */
  if (deconApplies(p, kinds, R)) {
    var DS = deconState(p, R), dbl = !!obj(R.settings).deconBlock;
    item({ sec: 'decon', id: 'decon', label: 'Decon / hygiene facility set up (checklist + photo)', st: DS.st === 'ok' ? 'ok' : !go && DS.st === 'none' ? 'due' : dbl ? 'block' : 'due', deconSt: DS.st,
      note: (DS.rec ? s(DS.rec.type) + (DS.rec.location ? ' at ' + s(DS.rec.location) : '') + ' · set up ' + (ymd(DS.rec.setOn) || ymd(DS.rec.date)) + (DS.rec.setBy ? ' by ' + s(DS.rec.setBy) : '') + ' · checklist ' + DS.done + '/' + DS.total + ' · ' + DS.photos + ' photo(s)' + (DS.st === 'ok' ? '' : ' — finish the checklist and add a photo') : 'Not set up yet — 🧼 Decon set-up checklist') + ' · ' + s(obj(R.decon).note) });
  }
  /* ENVDOCS · TCLP: every waste stream characterized before disposal (⛔ when shipped without it — configurable) */
  if (wasteOn(p, kinds, R)) wasteItems(p, kinds, R).forEach(function(x){ item(x); });
  /* ENVDOCS · lead levels: every test result compared with the record (a red flag → its action); the crew acknowledges the levels card */
  var LVe = LV(R);
  arr(p.envLog).filter(function(r){ return live(r) && r.kind === 'leadtest'; }).forEach(function(r){ var c = compareLevel(r.ttype, r.value, { surface: r.surface, area: r.area, residential: r.residential }, LVe); if (c.flag === 'red' && !r.resolved) item({ sec: 'levels', id: 'lt:' + r.id, label: '🔴 ' + s(r.ttype).toUpperCase() + ' ' + (r.location ? s(r.location) + ' — ' : '') + c.text, st: 'due', note: c.action + ' · ' + levelsStamp(LVe) }); });
  if (kinds.some(function(k){ return /^lead/.test(k); }) && ctx.levelsAck) out.people.forEach(function(c){ if (!c.email) return; var a = ackOf(ctx.levelsAck, LVe, c.email); item({ sec: 'people', id: 'lvack:' + low(c.name), label: '📏 Lead levels card (' + s(LVe.v) + ') acknowledged — ' + c.name, who: c.name, st: a ? 'ok' : 'due', note: a ? 'acknowledged ' + ymd(a.at) : 'not yet acknowledged — 📏 Lead levels → "I have read the current levels"' }); });
  /* ENVDOCS · the per-job written Employee Protection Plan: ⚠ (or ⛔ when the rules say so) until generated and signed */
  var PS = planState(p, out, R);
  out.plan = PS;
  item({ sec: 'plan', id: 'epp', label: 'Employee Protection Plan (written, signed)', st: PS.st === 'ok' ? 'ok' : obj(R.settings).planBlock ? 'block' : 'due', note: PS.note });
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
function recCat(r, kinds){ if (!r) return 'project'; if (/^(tclp|wgk|wship|epp|decon|asbsub|leadtest)$/.test(s(r.kind))) return 'project';   /* ENVDOCS */ if (r.kind === 'air') return airType(r) === 'personal' ? 'exposure' : (kinds.indexOf('lead_rrp') >= 0 && kinds.length === 1 ? 'rrp' : 'project'); if (r.kind === 'compday' || r.kind === 'contain' || r.kind === 'waste' || r.kind === 'notice' || r.kind === 'ppe') return kinds.indexOf('lead_rrp') >= 0 && kinds.length === 1 ? 'rrp' : 'project'; return 'project'; }

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

/* ═════ ENVDOCS: who does the asbestos work, the licensed sub, the lead decon unit, the written programs' administrators,
   the per-job Employee Protection Plan (owner 11/17: "Employee protection plan: good controls, work practices, medical monitoring
   and removal provisions, protective clothing & equipment, exposure monitoring, record keeping, hygiene facilities, proper training."
   "Make sure we have a respirator program." "Always keep records for everything." "Set up decon unit for lead.") ═════ */
/* who does the asbestos work on a job: 'sub' (a licensed abatement subcontractor — the default for now) | 'crew' (GrayCo's own crew) */
function asbBy(p, R){ R = R || rules(); var v = low(ec(p).asbBy); if (v === 'crew' || v === 'sub') return v; return low(obj(R.settings).asbDefault) === 'crew' ? 'crew' : 'sub'; }
var ASB_CREW_CERTS = ['asb_firm', 'asb_supervisor', 'asb_worker'];
/* a rule's asbestos performer ('crew' | 'sub' | '' = either); the licensed-abatement certifications are the crew's even in an older saved table */
function ruleBy(r){ var b = low(r && r.by); return b === 'crew' || b === 'sub' ? b : (r && ASB_CREW_CERTS.indexOf(s(r.cert)) >= 0 && listOf(r.kinds).join() === 'asbestos' ? 'crew' : ''); }
function byOk(r, kinds, by){ var b = ruleBy(r); return !b || kinds.indexOf('asbestos') < 0 || b === by; }
/* the kinds the GrayCo crew is exposed to (a licensed sub's asbestos work is not theirs) */
function crewKinds(kinds, by){ return by === 'sub' ? kinds.filter(function(k){ return k !== 'asbestos'; }) : kinds.slice(); }

/* ── the lead decon / hygiene facility ── */
function deconApplies(p, kinds, R){ R = R || rules(); var D = obj(ec(p).decon); if (D.required === false) return false; if (D.required === true) return true; return hasKind(obj(R.decon), kinds || []); }
function deconRec(p){ return arr(p && p.envLog).filter(function(r){ return live(r) && r.kind === 'decon'; }).sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; })[0] || null; }
function deconState(p, R){
  R = R || rules(); var r = deconRec(p), S = arr(obj(R.decon).setup);
  if (!r) return { st: 'none', rec: null, done: 0, total: S.length, photos: 0 };
  var c = obj(r.checks), done = S.filter(function(x, i){ return !!c[i]; }).length, ph = arr(r.photos).length;
  return { st: done === S.length && ph ? 'ok' : 'part', rec: r, done: done, total: S.length, photos: ph };
}
/* the daily-log fields of a job (the decon fields only where the decon applies) */
function dailyFields(p, kinds, R){ R = R || rules(); var dc = deconApplies(p, kinds, R), L = LV(R); return arr(R.daily).filter(function(d){ return d && (d.decon ? dc : hasKind(d, kinds)); }).map(function(d){ return /\{/.test(s(d.label)) ? Object.assign({}, d, { label: fillTokens(d.label, L) }) : d; }); }

/* ── the licensed asbestos sub (what GrayCo collects and keeps) ── */
function subOf(p){ return obj(ec(p).asbSub); }
function subItems(p, R, st, t, near){
  var S = subOf(p), out = [];
  arr(R.subChecks).forEach(function(c){
    var f = s(c.field), v = obj(S[f]), res = 'miss', note = '';
    if (f === 'license') {
      var co = s(S.company), lic = s(S.license), exp = ymd(S.licenseExp);
      if (!co || !lic) note = 'Add the sub: company, state license #, expiry';
      else if (exp && exp < t) note = co + ' · license #' + lic + ' EXPIRED ' + exp;
      else { res = exp ? 'ok' : 'due'; note = co + ' · license #' + lic + (s(S.state) ? ' (' + s(S.state) + ')' : '') + (exp ? ' · valid to ' + exp : ' · add the license expiry date'); }
      if (s(S.state) && st && s(S.state).toUpperCase().split(/[\/,\s]+/).indexOf(st) < 0) { note += ' · license state ' + s(S.state) + ' — the job is in ' + st + ': confirm the license is good there'; if (res === 'ok') res = 'due'; }
    } else if (f === 'competent') {
      if (s(S.competent)) { res = 'ok'; note = s(S.competent) + (s(S.competentLic) ? ' · license #' + s(S.competentLic) : '') + (s(S.competentPhone) ? ' · ' + s(S.competentPhone) : ''); }
      else note = 'Name the sub\'s competent person / licensed supervisor';
    } else if (v.on) { res = 'ok'; note = 'Received ' + ymd(v.on) + (s(v.conf) ? ' · confirmation # ' + s(v.conf) : '') + (v.file ? ' · copy kept' : ''); }
    else note = 'Not received yet';
    var stt = res === 'ok' ? 'ok' : res === 'due' ? 'due' : (c.when === 'clearance' && !near) ? 'wait' : blocks(c, ['asbestos']) ? 'block' : 'due';
    out.push({ sec: 'sub', id: s(c.id), label: s(c.label), st: stt, note: note + ' · ' + s(c.note || CONFIRM), field: f });
  });
  return out;
}

/* ── the written programs: who runs each one, who approved it, the yearly review ── */
function isAdminUser(u){ return !!u && u.active !== false && (/admin|owner/i.test(s(u.role)) || /owner/i.test(s(u.payType))); }
/* the default administrator: an admin from the people list (for lead work the admin holding the lead supervisor certification) —
   never a name written in the code */
function defaultAdmin(ctx, R, certKey){
  ctx = ctx || {}; R = R || rules(); var U = arr(ctx.users).filter(isAdminUser); if (!U.length) return null;
  var pick = null;
  if (certKey) pick = U.filter(function(u){ var x = certFor(R, Object.assign({}, ctx, { today: ctx.today || todayLocal() }), { name: s(u.name), email: low(u.email) }, certKey, ''); return x.st === 'ok' || x.st === 'soon' || x.st === 'nodate'; })[0] || null;
  var u = pick || U[0];
  return { name: s(u.name), phone: s(u.phone || u.cell || u.mobile), email: low(u.email), why: pick ? 'the admin holding the ' + certType(R, certKey).label + ' certification' : 'an admin on the people list' };
}
function programInfo(R, id, ctx){
  R = R || rules(); var r = arr(R.programs).find(function(x){ return x && x.id === id; }) || {}, t = (ctx && ctx.today) || todayLocal();
  var d = s(r.adminName) ? null : defaultAdmin(ctx, R, s(r.adminCert)), rv = ymd(r.reviewed), every = +r.reviewEveryMonths || 12, next = rv ? addMonths(rv, every) : '';
  return { id: s(r.id), label: s(r.label), file: s(r.file), admin: s(r.adminName) || (d ? d.name : ''), phone: s(r.adminPhone) || (!s(r.adminName) && d ? d.phone : ''),
    adminDefault: !s(r.adminName) && !!d, why: d ? d.why : '', approvedBy: s(r.approvedBy), approvedOn: ymd(r.approvedOn), reviewed: rv, nextReview: next,
    reviewDue: !rv || next <= addDays(t, +obj(R.settings).programReviewDays || 30), overdue: !rv || next < t, inUse: r.inUse !== false, by: ruleBy(r), kinds: listOf(r.kinds) };
}
/* the programs that apply to a job (the asbestos program by who does the asbestos work) */
function jobPrograms(R, kinds, by){ var ck = crewKinds(kinds, by); return arr(R.programs).filter(function(r){ if (!r || !hasKind(r, kinds) || !byOk(r, kinds, by)) return false; if (ruleBy(r) || listOf(r.kinds).indexOf("*") >= 0) return true; return hasKind(r, ck); }); }   /* a licensed sub's asbestos work brings no crew program (respirators, lead training) with it */

/* ── the per-job Employee Protection Plan ── */
function hash(t){ var h = 5381; t = String(t); for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function plans(p){ return arr(p && p.envLog).filter(function(r){ return live(r) && r.kind === 'epp'; }).sort(function(a, b){ return (+a.v || 0) - (+b.v || 0); }); }
/* what the plan was written for: a new version is needed when it changes (the kinds, who does the asbestos work, the supervisors, the
   sub, the decon set-up, the plan details typed in) — never the day-to-day statuses */
function planFp(p, E, R){
  R = R || rules(); var asb = E.kinds.indexOf('asbestos') >= 0, by = asbBy(p, R), S = subOf(p), D = deconRec(p);
  return hash(JSON.stringify({ k: E.kinds.slice().sort(), by: asb ? by : '', st: E.state || '', sup: E.people.filter(function(c){ return c.role === 'supervisor'; }).map(function(c){ return low(c.name); }).sort(),
    sub: asb && by === 'sub' ? [s(S.company), s(S.license), s(S.competent)] : 0, inp: obj(ec(p).planInput), dc: D ? [s(D.type), s(D.location)] : 0 }));
}
function planState(p, E, R){
  R = R || rules(); var L = plans(p), last = L[L.length - 1] || null, fp = planFp(p, E, R), needOwner = obj(R.settings).planOwnerSign !== false;
  if (!last) return { st: 'none', fp: fp, last: null, n: 0, note: 'Not generated yet — 📝 Generate the plan from this panel' };
  var sg = obj(last.signed), cp = s(obj(sg.cp).name), ow = s(obj(sg.owner).name), base = { fp: fp, last: last, n: L.length };
  if (s(last.fp) !== fp) return Object.assign(base, { st: 'stale', note: 'Version ' + last.v + ' (' + ymd(last.date) + ') is out of date — the job changed (kinds, who does the asbestos work, supervisors, the sub, the decon or the plan details): generate a new version (every version is kept)' });
  if (!cp || (needOwner && !ow)) return Object.assign(base, { st: 'unsigned', note: 'Version ' + last.v + ' (' + ymd(last.date) + ') needs ' + [!cp ? 'the competent person\'s' : '', needOwner && !ow ? 'the owner\'s' : ''].filter(Boolean).join(' and ') + ' signature' });
  return Object.assign(base, { st: 'ok', note: 'Version ' + last.v + ' (' + ymd(last.date) + ') · signed by ' + cp + ' (competent person)' + (ow ? ' and ' + ow + ' (owner)' : '') });
}
function planTexts(R, kinds, by, sec){
  var out = [];
  arr(R.planText).forEach(function(e){ if (!e || s(e.sec) !== sec || !hasKind(e, kinds)) return; var b = low(e.by); if (b && (kinds.indexOf('asbestos') < 0 || b !== by)) return; var tx = fillTokens(s(e.text), LV(R)); if (!tx || out.some(function(x){ return x.text === tx; })) return; out.push({ kinds: listOf(e.kinds), text: tx }); });
  return out.map(function(x){ var k = x.kinds.filter(function(q){ return kinds.indexOf(q) >= 0; }); return (kinds.length > 1 && k.length && k.length < kinds.length ? '[' + k.map(function(q){ var r = arr(R.kinds).find(function(z){ return z.key === q; }); return r ? s(r.label).replace(/^\W+\s*/, '') : q; }).join(', ') + '] ' : '') + x.text; });
}
/* the plan's content (structured: the CRM prints it, keeps it with each version, and the record package lists it)
   opt = { v, by, at, company: { name, address, phone } } */
function buildPlan(p, ctx, opt){
  ctx = ctx || {}; opt = opt || {}; var R = ctx.rules || rules(), t = ctx.today || todayLocal(), E = ctx.E || evaluate(p, Object.assign({}, ctx, { rules: R, today: t }));
  var kinds = E.kinds, by = asbBy(p, R), asb = kinds.indexOf('asbestos') >= 0, ck = crewKinds(kinds, by), EC = ec(p), I = obj(EC.planInput), S = subOf(p), co = obj(opt.company);
  var KL = function(k){ var r = arr(R.kinds).find(function(z){ return z.key === k; }); return r ? s(r.label) : k; };
  var SEC = [], sec = function(h, rows, text){ SEC.push({ h: h, rows: arr(rows).filter(function(r){ return r && s(r[1]); }), text: arr(text).map(s).filter(Boolean) }); };
  var stTxt = function(x){ return x === 'ok' ? 'current' : x === 'due' ? 'due soon' : x === 'over' ? 'OVERDUE' : x === 'block' ? 'MISSING' : 'not on file'; };
  var sups = E.people.filter(function(c){ return c.role === 'supervisor'; });
  var item = function(id){ return E.items.find(function(x){ return x.id === id; }); };
  /* 1 job */
  sec('1. Job', [['Job', s(p.name)], ['Customer', s(p.client || p.customer)], ['Location', s(p.address || p.jobAddress || p.siteAddress)], ['State', E.state || 'not set'],
    ['Work', kinds.map(KL).join(' + ')], asb ? ['Asbestos work done by', by === 'sub' ? 'a licensed asbestos abatement subcontractor (GrayCo crew: awareness level only)' : 'GrayCo\'s own crew (GrayCo Asbestos Program)'] : null,
    ['Start / finish', [ymd(p.startDate), ymd(p.endDate || p.finishDate || p.completionDate)].filter(Boolean).join(' → ') || 'not set'], ['Project manager', s(p.pm)],
    ['Plan', 'Version ' + (opt.v || 1) + ' · ' + t + (opt.by ? ' · prepared by ' + s(opt.by) : '')], ['Company', [s(co.name) || 'GrayCo', s(co.address), s(co.phone)].filter(Boolean).join(' · ')]]);
  /* 2 scope */
  sec('2. Scope of work and tasks', [['Scope', s(I.scope) || s(p.scope || p.scopeOfWork || p.workDescription || p.description) || 'Describe the scope (✏️ Plan details)'], ['Tasks that cause exposure', s(I.tasks)]]);
  /* 3 who does the work */
  if (asb && by === 'sub') {
    var ntc = obj(S.notice), airN = arr(p.envLog).filter(function(r){ return live(r) && r.kind === 'air'; }).length;
    sec('3. Asbestos work — licensed abatement subcontractor', [['Company', s(S.company) || 'NOT NAMED YET'], ['State license #', [s(S.license), s(S.state), ymd(S.licenseExp) ? 'expires ' + ymd(S.licenseExp) : ''].filter(Boolean).join(' · ') || 'not on file'],
      ['Sub\'s competent person / supervisor', [s(S.competent), s(S.competentLic) ? 'license #' + s(S.competentLic) : '', s(S.competentPhone)].filter(Boolean).join(' · ') || 'not named'],
      ['State notification', ntc.on ? 'filed — received ' + ymd(ntc.on) + (s(ntc.conf) ? ' · confirmation # ' + s(ntc.conf) : '') : 'copy / confirmation not received yet'],
      ['Work plan', obj(S.workPlan).on ? 'received ' + ymd(S.workPlan.on) : 'not received yet'], ['Insurance', obj(S.insurance).on ? 'received ' + ymd(S.insurance.on) : 'not received yet'],
      ['Air monitoring', 'by the subcontractor (personal, area, final clearance) — GrayCo collects and keeps every result (' + airN + ' on file)'], ['Contact', s(S.phone || S.email)]],
      ['GrayCo crew duties (awareness level): ' + planTexts(R, kinds, by, 'practices').filter(function(x){ return /awareness|STOP WORK/i.test(x); }).join(' ')]);
  } else sec('3. Who does the work', [['Crew', E.people.map(function(c){ return c.name + (c.role === 'supervisor' ? ' (supervisor)' : ''); }).join(', ') || 'nobody scheduled yet'], ['Employer', 'GrayCo — every worker on this plan is a GrayCo employee']]);
  /* 4 exposure */
  var LVL = LV(R), apMax = arr(p.envLog).filter(function(r){ return live(r) && r.kind === 'air' && /lead air|µg\/m/i.test(s(r.method) + ' ' + s(r.result)) && isFinite(numOf(r.result)); }).map(function(r){ return numOf(r.result); }).concat(isFinite(numOf(I.exposure)) ? [numOf(I.exposure)] : []).sort(function(a, b){ return b - a; })[0];
  var RESP = minRespirator(apMax, LVL);
  sec('4. Expected exposure and basis', [['Lead levels used', levelsStamp(LVL) + ' — air: action level ' + LVL.air.al + ' / PEL ' + LVL.air.pel + ' ' + LVL.air.unit + ' · blood: action ' + LVL.blood.action + ', removal ' + LVL.blood.removal + ', back to work <' + LVL.blood.back + ' ' + LVL.blood.unit],
    ['Highest measured lead exposure', isFinite(apMax) ? apMax + ' ' + LVL.air.unit : 'none yet'], ['Children (CDC blood lead reference value)', LVL.blood.childEbll + ' ' + LVL.blood.unit + ' — used in occupant / parent notices'], ['Basis on file', s(I.basis) || 'Add the test results / survey this is based on (✏️ Plan details)'], ['Air samples on file', String(arr(p.envLog).filter(function(r){ return live(r) && r.kind === 'air'; }).length)]], planTexts(R, kinds, by, 'exposure'));
  sec('5. Engineering controls', [], planTexts(R, kinds, by, 'engineering'));
  sec('6. Work-practice controls', [], planTexts(R, kinds, by, 'practices'));
  /* 7 respirators — the crew's fit test / clearance status only (never a result) */
  sec('7. Respiratory protection', [['Minimum respirator from the measured exposure', RESP.text + (RESP.math ? ' · ' + RESP.math.join(' | ') : '')], ['Protection factors (' + levelsStamp(LVL) + ')', arr(LVL.apf).map(function(a){ return a.label + ' ' + a.apf; }).join(' · ')], ['Program', 'GrayCo Respiratory Protection Program — administrator ' + (programInfo(R, 'resp', Object.assign({}, ctx, { rules: R })).admin || '(set in ⚙ Written programs)')], ['Respirators for this job', s(I.respirators)]].concat(E.people.filter(function(c){ return c.fit; }).map(function(c){ return [c.name, 'fit test ' + stTxt(c.fit)]; })), planTexts(R, kinds, by, 'respirator'));
  sec('8. Protective clothing and equipment', [['Provided', 'at no cost to the employee']], planTexts(R, kinds, by, 'clothing'));
  /* 9 hygiene + the decon unit */
  var dc = deconApplies(p, kinds, R), DS = deconState(p, R), DR = DS.rec || {};
  sec('9. Hygiene facilities' + (dc ? ' and decon unit' : ''), dc ? [['Decon unit', DR.type ? s(DR.type) : 'NOT SET UP YET'], ['Location', s(DR.location)], ['Set up by / on', [s(DR.setBy), ymd(DR.setOn)].filter(Boolean).join(' · ')],
    ['Set-up checklist', DS.rec ? DS.done + ' of ' + DS.total + ' items · ' + DS.photos + ' photo(s)' : 'not done yet'], ['Wash water', s(DR.water)], ['When required', s(obj(R.decon).note)]] : [], planTexts(R, kinds, by, 'hygiene'));
  sec('10. Housekeeping', [], planTexts(R, kinds, by, 'housekeeping'));
  /* 11 monitoring */
  var air = arr(R.air).filter(function(r){ return hasKind(r, kinds); });
  sec('11. Exposure monitoring schedule', air.map(function(r){ var x = item(r.id); return [s(r.label), (r.when === 'clearance' ? 'after the work — close-out waits for a pass' : r.when === 'before' ? 'before the work starts' : 'during the work' + (r.everyDays ? ' (every ' + (+r.everyDays === 1 ? 'work day' : r.everyDays + ' days') + ')' : '')) + (asb && by === 'sub' && hasKind(r, ['asbestos']) && !hasKind(r, ck) ? ' · by the abatement sub — GrayCo keeps the results' : '') + (x ? ' · now: ' + s(x.note) : '')]; }),
    ['Personal results go to each worker\'s own records; the worker is told within the time the program sets (default: 5 working days — confirm with your state program).']);
  /* 12 medical surveillance + removal */
  var med = arr(R.medical).filter(function(m){ return hasKind(m, ck); }), RM = obj(R.removal);
  sec('12. Medical surveillance and medical removal', med.map(function(m){ return [s(m.label), m.once ? 'once (baseline)' : 'every ' + (+m.everyMonths || 12) + ' months' + (arr(m.phases).length ? ' (more often at first)' : '')]; })
    .concat(med.length ? [['Medical removal protection', 'Removal From Work at a blood lead of ' + LVL.blood.removal + ' ' + LVL.blood.unit + ' or more (or per the physician\'s written opinion) · Back to work at <' + LVL.blood.back + ' · OSHA additional action at ' + LVL.blood.action + ' · earnings, seniority and benefits kept up to ' + (+RM.maxMonths || 18) + ' months; follow-up tests every ' + (+RM.followEveryMonths || 1) + ' month(s) until cleared (' + levelsStamp(LVL) + ')']] : [])
    .concat(E.people.filter(function(c){ return c.medical; }).map(function(c){ return [c.name, 'medical ' + stTxt(c.medical) + (c.removed ? ' · NOT CLEARED for exposure work' : '')]; })),
    med.length ? [s(RM.note)] : ['No medical surveillance applies to the GrayCo crew on this job' + (asb && by === 'sub' ? ' (the abatement sub keeps its own workers\' medical surveillance).' : '.')]);
  /* 13 training */
  var reqs = arr(R.people).filter(function(r){ return hasKind(r, kinds) && byOk(r, kinds, by) && r.who !== 'company'; });
  /* the training and certification each ROLE needs (the certificates themselves live in 📜 Certifications — the CRM's certification
     tracking: company licenses, each person's cards and refreshers, expiry alerts; this plan reads it and never stores a certificate) */
  var ROLE = { company: 'Company (GrayCo)', supervisor: 'Supervisor / competent person', worker: 'Each worker', each: 'Everyone on the job' };
  sec('13. Training and certifications (by role)', arr(R.people).filter(function(r){ return hasKind(r, kinds) && byOk(r, kinds, by); }).map(function(r){ return [(ROLE[r.who] || r.who) + ' — ' + (s(r.label) || certType(R, r.cert).label), r.who === 'company' ? (function(x){ return x ? (x.st === 'ok' ? '✓ ' : '(due) ') + s(x.note) : ''; })(E.items.find(function(x){ return x.id === r.id; })) : E.items.filter(function(x){ return x.sec === 'people' && (x.id === r.id || x.id.indexOf(r.id + ':') === 0); }).map(function(x){ return x.who ? x.who + ' ' + (x.st === 'ok' ? '✓' : x.st === 'due' ? '(due)' : '(MISSING)') : (x.st === 'ok' ? '✓ ' : x.st === 'due' ? '(due) ' : '(MISSING) ') + s(x.note); }).join(', ') || 'checked when the crew is on the job']; }),
    ['Certificates, cards and refreshers are kept in 📜 Certifications (company licenses, each person\'s cards, expiry alerts, scheduling blocks) — this plan lists what each role needs and reads the status from there; it does not store certificates.']);
  sec('14. Signs and labels', jobSigns(p, kinds, R).map(function(g){ return ['Sign', s(g.title) + (g.required ? ' (required legend — printed exactly as written)' : '')]; }).concat([['Print', 'Job → 🛡 Compliance → 🪧 Signs (letter, 11 × 17, 18 × 24; English / Spanish) — posted signs photographed on the daily log']]), planTexts(R, kinds, by, 'signs'));
  /* 15 competent person */
  sec('15. Competent person / supervisor on site', [['GrayCo competent person', s(I.competent) || sups.map(function(c){ return c.name + ' (' + c.checks.filter(function(k){ return k.st === 'ok' || k.st === 'soon'; }).map(function(k){ return k.label; }).join(', ') + ')'; }).join('; ') || 'NOT NAMED — mark the supervisor on the panel'],
    asb && by === 'sub' ? ['Asbestos competent person (sub)', s(S.competent) || 'not named'] : null]);
  sec('16. Inspection schedule', [['Added for this job', s(I.inspection)]], planTexts(R, kinds, by, 'inspection'));
  sec('17. Notices and permits', E.items.filter(function(x){ return x.sec === 'notice'; }).map(function(x){ return [s(x.label), s(x.note)]; }));
  /* waste characterization (TCLP) and disposal */
  if (wasteOn(p, kinds, R)) { var th0 = tclpThreshold(R);
    sec('17a. Waste characterization (TCLP) and disposal', wasteStreams(p, R).map(function(x){ return [x.stream, (x.cls ? x.cls.toUpperCase() + ' — ' + (x.basis === 'tclp' ? 'TCLP ' + s(x.rec.result) + ' mg/L lead (threshold ' + s(x.rec.threshold || th0) + ')' : 'generator knowledge: ' + s(x.rec.basis)) + ' → ' + (x.cls === 'hazardous' ? 'manifest, hauler, TSD facility, generator status' : 'landfill with its acceptance letter') : 'NOT YET CHARACTERIZED — no disposal until it is') + (x.ships.length ? ' · ' + x.ships.length + ' shipment(s)' : '')]; }),
      [s(obj(R.waste).note), 'TCLP threshold used: ' + th0 + ' ppm (mg/L) lead — ' + tclpNote(R)]); }
  sec('18. Record keeping', arr(R.retention).map(function(r){ var y = retainYears(R, r.cat); return [s(r.label), y === Infinity ? 'kept forever (owner\'s rule)' : y + ' years']; }),
    ['Every record is kept in the CRM (job → 🛡 Compliance; each worker\'s own health & exposure records) and in the end-of-job record package. Every version of this plan is kept.']);
  /* 19 emergency */
  var progs = jobPrograms(R, kinds, by).map(function(r){ return programInfo(R, r.id, Object.assign({}, ctx, { rules: R })); });
  var admins = []; progs.forEach(function(x){ if (x.admin && !admins.some(function(a){ return a[1].indexOf(x.admin) === 0; })) admins.push(['Program administrator', x.admin + (x.phone ? ' · ' + x.phone : '')]); });
  sec('19. Emergency contacts', [['Emergency', '911'], ['Nearest hospital', s(I.hospital) || 'add it (✏️ Plan details)'], ['Occupational clinic', [s(obj(R.settings).clinic), s(obj(R.settings).clinicPhone)].filter(Boolean).join(' · ')], ['Project manager', s(p.pm)], ['On-site supervisor', s(I.competent) || sups.map(function(c){ return c.name; }).join(', ')], asb && by === 'sub' ? ['Abatement sub', [s(S.company), s(S.phone)].filter(Boolean).join(' · ')] : null].concat(admins).concat([['Other', s(I.emergency)]]));
  sec('20. Written programs this plan follows', progs.map(function(x){ return [x.label, 'administrator ' + (x.admin || 'NOT SET') + (x.approvedBy ? ' · approved by ' + x.approvedBy + (x.approvedOn ? ' ' + x.approvedOn : '') : ' · approval not recorded') + (x.reviewed ? ' · reviewed ' + x.reviewed : ' · review date not set') + (x.inUse ? '' : ' · marked NOT IN USE')]; }));
  return { v: opt.v || 1, fp: planFp(p, E, R), date: t, levels: { v: s(LVL.v), name: s(LVL.name), at: s(LVL.at) }, stamp: levelsStamp(LVL), job: s(p.name), pid: s(p.id), kinds: kinds.slice(), by: asb ? by : '', title: 'Employee Protection Plan — ' + s(p.name), sections: SEC,
    note: 'Written compliance plan for this job. The lists are GrayCo\'s defaults — confirm with your state program / attorney.', signs: ['Competent person', 'Owner'] };
}
/* the plan as lines for a PDF / a printable page */
function planLines(P){ var L = [{ h: s(P.title) }, { t: s(P.note) + (P.stamp ? ' · ' + P.stamp : '') }]; arr(P.sections).forEach(function(x){ L.push({ h2: x.h }); arr(x.rows).forEach(function(r){ L.push({ t: s(r[0]) + ': ' + s(r[1]) }); }); arr(x.text).forEach(function(tx){ L.push({ t: '• ' + tx }); }); }); return L; }

/* ── ENVDOCS · TCLP waste characterization (owner: "TCLP") — per job and per waste stream ──
   records (envLog, kept forever): tclp { stream, date, sampler, containers, lab, coc, analyte, result (mg/L), threshold, cls, file }
   wgk (generator knowledge) { stream, date, basis, cls, by, file }; wship { stream, date, containers, qty, cls, manifest, hauler, tsd,
   generatorStatus, landfill, acceptance (file / date), disposedOn } */
function wasteOn(p, kinds, R){ R = R || rules(); return hasKind(obj(R.waste), kinds) || arr(obj(ec(p)).wasteStreams).length > 0 || arr(p && p.envLog).some(function(r){ return live(r) && /^(tclp|wgk|wship)$/.test(s(r.kind)); }); }
function tclpThreshold(R){ var v = parseFloat(LV(R || rules()).waste.tclp); return isFinite(v) && v > 0 ? v : 5; }
function tclpNote(R){ var L = LV(R || rules()); return 'TCLP ' + L.waste.tclp + ' ppm (mg/L) lead = hazardous; waste from a residence is non-toxic (household exemption, still logged) — ' + levelsStamp(L) + ' · confirm with EPA / your state program'; }
/* a TCLP lead result against the threshold: ≥ threshold → hazardous; blank / "waiting" → pending */
function tclpClass(result, threshold, residential){ if (residential) return 'non-hazardous'; var t = s(result); if (!t || /wait|pend/i.test(t)) return 'pending'; var lt = /^\s*(<|nd\b|non.?detect)/i.test(t), v = parseFloat(t.replace(/^[<>≤≥\s]+/, '')); if (lt && !isFinite(v)) return 'non-hazardous'; if (!isFinite(v)) return 'pending'; return !lt && v >= +threshold ? 'hazardous' : 'non-hazardous'; }
function streamKey(n){ return low(n).replace(/\s+/g, ' '); }
function wasteStreams(p, R){
  R = R || rules(); var E = obj(ec(p)), M = {}, order = [];
  var add = function(n){ var k = streamKey(n); if (!k) return null; if (!M[k]) { M[k] = { stream: s(n), key: k, tclp: [], gk: [], ships: [], logged: 0 }; order.push(k); } return M[k]; };
  arr(E.wasteStreams).forEach(function(x){ var a0 = add(x && typeof x === 'object' ? x.name : x); if (a0 && x && typeof x === 'object') { if (x.residential) a0.residential = true; if (x.far) a0.far = true; if (x.start) a0.start = x.start; } });
  arr(p && p.envLog).forEach(function(r){
    if (!live(r)) return;
    if (r.kind === 'tclp') { var a = add(r.stream); if (a) a.tclp.push(r); }
    else if (r.kind === 'wgk') { var b = add(r.stream); if (b) b.gk.push(r); }
    else if (r.kind === 'wship') { var c = add(r.stream); if (c) c.ships.push(r); }
    else if (r.kind === 'compday') arr(obj(r.rows).waste).forEach(function(w){ var d = add(w && w.stream); if (d) { d.logged++; if (!d.first || s(r.date) < d.first) d.first = s(r.date); if (s(w.manifest)) d.manifested = (d.manifested || 0) + 1; } });
  });
  return order.map(function(k){
    var x = M[k], by = function(a, b){ return s(a.date) + s(a.at) < s(b.date) + s(b.at) ? 1 : -1; };
    x.tclp.sort(by); x.gk.sort(by); x.ships.sort(by);
    var t = x.tclp.find(function(r){ return r.cls === 'hazardous' || r.cls === 'non-hazardous'; }) || null, g = x.gk[0] || null;
    var cls = '', basis = '', rec = null;
    if (t && (!g || s(t.date) >= s(g.date))) { cls = t.cls; basis = 'tclp'; rec = t; } else if (g && s(g.basis)) { cls = g.cls; basis = 'gk'; rec = g; }
    if (t && t.cls === 'hazardous') { cls = 'hazardous'; basis = 'tclp'; rec = t; }   /* a hazardous TCLP result is never overridden by generator knowledge */
    if (!t && (x.residential || ec(p).residential === true || x.tclp.some(function(r){ return r.residential; })) && LV(R).waste.residentialNonToxic !== false) { cls = 'non-hazardous'; basis = 'household'; rec = x.tclp.find(function(r){ return r.residential; }) || { date: '', basis: 'waste from a residence' }; x.household = true; }
    /* the storage clock of a hazardous stream: from the first day it was generated (daily log / sample / the date set on the stream) */
    if (cls === 'hazardous') { var st0 = [x.start, x.first].concat(x.tclp.map(function(r){ return r.date; })).map(ymd).filter(Boolean).sort()[0], far = !!x.far || x.ships.some(function(r){ return r.far; }) || x.tclp.some(function(r){ return r.far; }); x.clock = x.ships.some(function(r){ return ymd(r.disposedOn) || ymd(r.date); }) ? null : storageClock(st0, far, LV(R)); }
    x.cls = cls; x.basis = basis; x.rec = rec; x.pending = !cls && x.tclp.some(function(r){ return r.cls === 'pending'; });
    x.disposed = x.ships.some(function(r){ return !!ymd(r.disposedOn) || !!ymd(r.date); });
    return x;
  });
}
function canDispose(p, stream, R){ var x = wasteStreams(p, R).find(function(w){ return w.key === streamKey(stream); }); return !!(x && x.cls); }
function shipGaps(r, cls, household){ var miss = []; if (household) return s(r.landfill) ? [] : ['landfill / transfer station']; if (cls === 'hazardous') { if (!s(r.manifest)) miss.push('manifest #'); if (!s(r.hauler)) miss.push('hauler'); if (!s(r.tsd)) miss.push('TSD facility'); if (!s(r.generatorStatus)) miss.push('generator status'); } else if (cls === 'non-hazardous') { if (!s(r.landfill)) miss.push('landfill'); if (!r.acceptance && !ymd(r.acceptanceOn)) miss.push('landfill acceptance letter'); } return miss; }
function wasteItems(p, kinds, R){
  R = R || rules(); var out = [], W0 = wasteStreams(p, R), th = tclpThreshold(R), blk = obj(R.settings).wasteShipBlock !== false, note = tclpNote(R);
  if (!W0.length && hasKind({ kinds: 'lead_abate' }, kinds)) out.push({ sec: 'waste', id: 'waste-none', label: 'Waste streams — add each one and characterize it (TCLP or generator knowledge)', st: 'due', note: 'No waste stream on this job yet · ' + s(obj(R.waste).note) });
  W0.forEach(function(x){
    var id = 'waste:' + x.key, base = { sec: 'waste', id: id, stream: x.stream, cls: x.cls, basis: x.basis };
    if (!x.cls) {
      var gone = x.ships.length || x.manifested;   /* a shipment, or a daily-log row with a manifest # */
      out.push(Object.assign(base, { label: 'Waste stream "' + x.stream + '" — not yet characterized', st: gone ? (blk ? 'block' : 'due') : 'due',
        note: (gone ? 'SHIPPED / DISPOSED WITHOUT CHARACTERIZATION — ' : '') + (x.pending ? 'TCLP sample sent — waiting on the lab' : 'Log a TCLP sample (or document generator knowledge with its basis)') + ' · threshold ' + th + ' mg/L lead · ' + note }));
      return;
    }
    var r = x.rec, how = x.basis === 'household' ? 'waste from a residence — NON-TOXIC (household exemption; still logged)' : x.basis === 'tclp' ? 'TCLP ' + s(r.result) + ' mg/L lead vs ' + s(r.threshold || th) + ' mg/L (' + ymd(r.date) + (r.lab ? ', ' + s(r.lab) : '') + (r.coc ? ', COC ' + s(r.coc) : '') + ')' : 'generator knowledge: ' + s(r.basis);
    var gaps = []; x.ships.forEach(function(sh){ var m = shipGaps(sh, x.cls, x.household); if (m.length) gaps.push((ymd(sh.date) || 'shipment') + ': ' + m.join(', ')); });
    var path = x.household ? 'NON-TOXIC — household waste' : x.cls === 'hazardous' ? 'HAZARDOUS — manifest, hauler, TSD facility, generator status' : 'NON-HAZARDOUS — landfill acceptance letter';
    var ck = x.clock, cst = ck ? (ck.st === 'over' ? 'block' : ck.st === 'alert' ? 'due' : '') : '';
    out.push(Object.assign(base, { clock: ck, label: 'Waste stream "' + x.stream + '" — ' + (x.household ? 'NON-TOXIC (household)' : x.cls.toUpperCase()), st: cst === 'block' ? 'block' : gaps.length || cst === 'due' ? 'due' : 'ok', note: how + ' · ' + path + (x.ships.length ? ' · ' + x.ships.length + ' shipment(s)' : ' · not shipped yet') + (ck ? ' · ' + ck.text + (ck.st === 'over' ? ' — OVER THE STORAGE LIMIT' : ck.st === 'alert' ? ' — ship it soon' : '') : '') + (gaps.length ? ' · missing: ' + gaps.join('; ') : '') }));
  });
  return out;
}

/* ── fill a program's Word file (word/document.xml): the administrator, the approval, the current address ── */
function xmlEsc(t){ return s(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fillDocxXml(xml, v){
  v = obj(v); var out = String(xml || '');
  var para = function(label, fn){ var i = out.indexOf('>' + label + '</w:t>'); if (i < 0) return; var a = out.lastIndexOf('<w:p>', i), a2 = out.lastIndexOf('<w:p ', i); a = Math.max(a, a2); var b = out.indexOf('</w:p>', i); if (a < 0 || b < 0) return; out = out.slice(0, a) + fn(out.slice(a, b)) + out.slice(b); };
  var add = function(seg, label, val){ return s(val) ? seg.replace('>' + label + '</w:t>', '>' + label + xmlEsc(val) + ' </w:t>') : seg; };
  para('Program administrator: ', function(seg){ return add(add(seg, 'Program administrator: ', v.admin), '\t\tPhone: ', v.phone); });
  para('Approved by (owner): ', function(seg){ return add(add(seg, 'Approved by (owner): ', v.approvedBy), '\t\tDate: ', v.approvedOn); });
  if (s(v.address)) out = out.replace(/(<w:t[^>]*>)[^<]*?(\s+\|\s+\(\d{3}\) \d{3}-\d{4}<\/w:t>)/, function(m, a, b){ return a + xmlEsc(v.address) + b; });
  /* the job's company on the letterhead (owner: every document carries the right company): its name, phone, license line, logo size */
  if (s(v.companyPhone)) out = out.replace(/(<w:t[^>]*>[^<]*?\s+\|\s+)\(\d{3}\) \d{3}-\d{4}(<\/w:t>)/, function(m, a, b){ return a + xmlEsc(v.companyPhone) + b; });
  if (s(v.company)) out = out.replace(/(<w:t[^>]*>)GrayCo Construction Services, LLC(<\/w:t>)/, function(m, a, b){ return a + xmlEsc(v.company) + b; });
  if (v.licenseLine != null) out = out.replace(/(<w:t[^>]*>)TN License #[^<]*(<\/w:t>)/, function(m, a, b){ return a + xmlEsc(v.licenseLine) + b; });
  if (+v.logoW > 0 && +v.logoH > 0) { var cy = 800100, cx = Math.round(cy * (+v.logoW) / (+v.logoH)); if (cx > 2400000) { cx = 2400000; cy = Math.round(cx * (+v.logoH) / (+v.logoW)); }
    out = out.replace(/<wp:extent cx="\d+" cy="\d+"\/>/, '<wp:extent cx="' + cx + '" cy="' + cy + '"/>').replace(/<a:ext cx="\d+" cy="\d+"\/>/, '<a:ext cx="' + cx + '" cy="' + cy + '"/>'); }
  return out;
}
/* the footer of a program's Word file: the job's company name */
function fillFooterXml(xml, v){ v = obj(v); return s(v.company) ? String(xml || '').replace(/>GrayCo Construction Services, LLC \|/, '>' + xmlEsc(v.company) + ' |') : String(xml || ''); }
/* the fill-in lines of a label / sign, filled from the job when the CRM knows the value ("Generator: ____" → "Generator: …") */
function fillLine(t, vals){ vals = obj(vals); return s(t).replace(/(Generator|Location|Abatement contractor|Date sealed|Bagged by|Material|Date): _{3,}/g, function(m, k){ var key = { 'Generator': 'generator', 'Location': 'location', 'Abatement contractor': 'contractor', 'Date sealed': 'sealed', 'Bagged by': 'bagger', 'Material': 'material', 'Date': 'date' }[k]; return s(vals[key]) ? k + ': ' + s(vals[key]) : m; }); }

/* ── ENVDOCS: a portable lead decon unit — the purchase list (quantities are starting points; no prices — the owner fills them in) ── */
var DECON_PURCHASE = [
  { group: 'The unit', item: 'Portable decon unit / trailer (3-stage: dirty · wash · clean) — or framing kit + zipper doors to build one', qty: 1 },
  { group: 'The unit', item: '6-mil poly sheeting roll (20 × 100 ft)', qty: 2, note: 'built on site / repairs' },
  { group: 'The unit', item: 'Self-adhesive zipper doors', qty: 4 },
  { group: 'The unit', item: 'Tack pads (sticky mats), 30-sheet', qty: 4 },
  { group: 'Wash', item: 'Portable hand-and-face wash station or portable shower (with water heater if showering)', qty: 1 },
  { group: 'Wash', item: 'Fresh-water tank / hose + fittings', qty: 1 },
  { group: 'Wash', item: 'Wash-water collection drum (55 gal) + lid', qty: 2 },
  { group: 'Wash', item: 'Wash-water filter (e.g. 5 micron) + spare cartridges', qty: 1, note: 'confirm the filtering / disposal rule with your state program and the local utility' },
  { group: 'Wash', item: 'Soap (pump), towels (paper or cloth), trash can', qty: 1 },
  { group: 'Dirty room', item: 'HEPA vacuum (dedicated to the decon) + spare HEPA filters / bags', qty: 1 },
  { group: 'Dirty room', item: 'Labeled 6-mil waste bags (box) + duct tape + waste labels', qty: 2 },
  { group: 'Dirty room', item: 'Disposable coveralls with hoods (case) — every size', qty: 2 },
  { group: 'Dirty room', item: 'Disposable booties / shoe covers (case)', qty: 2 },
  { group: 'Dirty room', item: 'Nitrile gloves (case)', qty: 2 },
  { group: 'Clean room', item: 'Lockers or sealable bags for street clothes', qty: 6 },
  { group: 'Clean room', item: 'Bench + mirror', qty: 1 },
  { group: 'Power & light', item: 'LED work lights', qty: 3 },
  { group: 'Power & light', item: 'GFCI cords / portable GFCI', qty: 2 },
  { group: 'Signs', item: 'Decon signs: DIRTY ROOM · WASH · CLEAN ROOM, HAND WASH STATION, NO EATING, DRINKING OR SMOKING (print from the CRM — 🖨 Environmental signs)', qty: 1 }];

/* ── ENVDOCS: the environmental SIGN SET (owner: "Make sure all signs for env work are designed for GrayCo.")
   The legend words come from the GrayCo Lead & Asbestos Warning Signs (company-docs) and are printed EXACTLY as written — the
   company branding goes in its own band at the bottom and never replaces or shrinks the legend. Verify each legend with the current
   OSHA / state rules before use. head = the signal word band (danger red / warning orange / caution yellow / notice blue / bio).
   required = the legend is regulatory wording (printed unchanged); kinds = the jobs it is linked to. ── */
var SIGN_NOTE = 'Verify the legend with the current OSHA / state rules before use — the legend is printed exactly as written; GrayCo\'s name, logo and phone are in their own band.';
var SIGNS = [
  { id: 'lead_danger', title: 'Lead work area — DANGER (OSHA)', head: 'DANGER', tone: 'danger', required: true, kinds: 'lead_abate, lead_rrp',
    lines: ['LEAD WORK AREA', 'MAY DAMAGE FERTILITY OR THE UNBORN CHILD', 'CAUSES DAMAGE TO THE CENTRAL NERVOUS SYSTEM', 'DO NOT EAT, DRINK, SMOKE OR VAPE IN THIS AREA'],
    es: ['PELIGRO – ÁREA DE TRABAJO CON PLOMO', 'PUEDE DAÑAR LA FERTILIDAD O AL FETO • CAUSA DAÑOS AL SISTEMA NERVIOSO CENTRAL • NO COMA, BEBA, FUME NI VAPEE EN ESTA ÁREA'] },
  { id: 'lead_warning', title: 'Lead work area — WARNING (poison / no eating or smoking)', head: 'WARNING', tone: 'warning', required: true, kinds: 'lead_abate, lead_rrp',
    lines: ['LEAD WORK AREA', 'POISON', 'NO EATING, DRINKING, SMOKING OR VAPING', 'DO NOT ENTER – AUTHORIZED WORKERS ONLY'],
    es: ['ADVERTENCIA – ÁREA DE TRABAJO CON PLOMO – VENENO', 'NO COMER, BEBER, FUMAR NI VAPEAR • NO ENTRAR – SOLO TRABAJADORES AUTORIZADOS'] },
  { id: 'rrp', title: 'RRP — renovation work area, do not enter', head: 'DO NOT ENTER', tone: 'danger', required: true, kinds: 'lead_rrp, lead_abate',
    lines: ['RENOVATION WORK AREA', 'Children, staff and visitors keep out.', 'This area will reopen after cleaning is complete', 'and GrayCo removes this sign.', 'NO EATING, DRINKING, SMOKING OR VAPING'],
    es: ['NO ENTRAR – ÁREA DE RENOVACIÓN', 'Niños, personal y visitantes no deben entrar. No comer, beber, fumar ni vapear.'] },
  { id: 'asb_danger', title: 'Asbestos — DANGER (perimeter / awareness; the licensed sub posts its own regulated-area signs)', head: 'DANGER', tone: 'danger', required: true, kinds: 'asbestos',
    lines: ['ASBESTOS', 'MAY CAUSE CANCER', 'CAUSES DAMAGE TO LUNGS', 'AUTHORIZED PERSONNEL ONLY', 'WEAR RESPIRATORY PROTECTION AND PROTECTIVE CLOTHING IN THIS AREA', 'NO EATING, DRINKING, SMOKING OR VAPING'],
    es: ['PELIGRO – ASBESTO', 'PUEDE CAUSAR CÁNCER • CAUSA DAÑOS A LOS PULMONES • SOLO PERSONAL AUTORIZADO • USE PROTECCIÓN RESPIRATORIA Y ROPA PROTECTORA • NO COMER, BEBER, FUMAR NI VAPEAR'] },
  { id: 'acm', title: 'Asbestos-containing material left in place — do not disturb', head: 'CAUTION', tone: 'caution', required: true, kinds: 'asbestos',
    lines: ['ASBESTOS-CONTAINING MATERIAL', 'DO NOT DISTURB – DO NOT DRILL, CUT, SAND OR REMOVE', 'Material: ______________________________________'],
    es: ['PRECAUCIÓN – MATERIAL CON ASBESTO – NO TOCAR, NO TALADRAR, NO CORTAR, NO LIJAR'], call: true },
  { id: 'mold', title: 'Mold remediation work area', head: 'CAUTION', tone: 'caution', required: false, kinds: 'mold',
    lines: ['MOLD REMEDIATION WORK AREA', 'AUTHORIZED PERSONNEL ONLY', 'RESPIRATORS AND PROTECTIVE CLOTHING REQUIRED', 'NO EATING, DRINKING, SMOKING OR VAPING'],
    es: ['PRECAUCIÓN – ÁREA DE REMEDIACIÓN DE MOHO', 'SOLO PERSONAL AUTORIZADO • SE REQUIERE RESPIRADOR Y ROPA PROTECTORA • NO COMER, BEBER, FUMAR NI VAPEAR'] },
  { id: 'bio', title: 'Biohazard / trauma — authorized personnel only', head: 'BIOHAZARD', tone: 'bio', required: true, kinds: 'trauma', symbol: '☣',
    lines: ['AUTHORIZED PERSONNEL ONLY'], es: ['RIESGO BIOLÓGICO – SOLO PERSONAL AUTORIZADO'] },
  { id: 'resp', title: 'Respirators required beyond this point', head: 'WARNING', tone: 'warning', required: false, kinds: 'lead_abate, asbestos, mold, trauma',
    lines: ['RESPIRATORS REQUIRED', 'BEYOND THIS POINT'], es: ['SE REQUIERE RESPIRADOR MÁS ALLÁ DE ESTE PUNTO'] },
  { id: 'negair', title: 'Do not enter — negative air in operation', head: 'DO NOT ENTER', tone: 'danger', required: false, kinds: 'lead_abate, asbestos, mold',
    lines: ['NEGATIVE AIR IN OPERATION', 'DO NOT OPEN, UNPLUG OR TURN OFF'], es: ['NO ENTRAR – AIRE NEGATIVO EN OPERACIÓN – NO ABRIR, DESCONECTAR NI APAGAR'] },
  { id: 'decon_dirty', title: 'Decon — DIRTY ROOM (→ wash)', head: 'DIRTY ROOM', tone: 'danger', required: false, kinds: 'lead_abate, asbestos', decon: true,
    lines: ['EQUIPMENT ROOM', 'TAKE OFF SUITS, BOOTIES AND GLOVES HERE', 'BAG THEM AS WASTE', '→  TO WASH  →'], es: ['CUARTO SUCIO – QUÍTESE EL TRAJE, LAS CUBIERTAS DE ZAPATOS Y LOS GUANTES AQUÍ  →  AL LAVADO'] },
  { id: 'decon_wash', title: 'Decon — WASH (→ clean room)', head: 'WASH', tone: 'notice', required: false, kinds: 'lead_abate, asbestos', decon: true,
    lines: ['WASH HANDS AND FACE / SHOWER', 'BEFORE ENTERING THE CLEAN ROOM', '→  TO CLEAN ROOM  →'], es: ['LAVADO – LÁVESE LAS MANOS Y LA CARA ANTES DE ENTRAR AL CUARTO LIMPIO  →'] },
  { id: 'decon_clean', title: 'Decon — CLEAN ROOM (→ exit)', head: 'CLEAN ROOM', tone: 'safe', required: false, kinds: 'lead_abate, asbestos', decon: true,
    lines: ['STREET CLOTHES ONLY', 'NO WORK CLOTHES, TOOLS OR EQUIPMENT', '→  EXIT  →'], es: ['CUARTO LIMPIO – SOLO ROPA DE CALLE – SIN ROPA DE TRABAJO NI EQUIPO  →  SALIDA'] },
  { id: 'handwash', title: 'Hand wash station', head: 'HAND WASH STATION', tone: 'safe', required: false, kinds: 'lead_rrp, lead_abate, asbestos, mold, trauma', decon: true,
    lines: ['WASH HANDS AND FACE', 'BEFORE EATING, DRINKING OR SMOKING', 'AND BEFORE LEAVING THE SITE'], es: ['ESTACIÓN DE LAVADO DE MANOS – LÁVESE LAS MANOS Y LA CARA ANTES DE COMER, BEBER O FUMAR'] },
  { id: 'noeat', title: 'No eating, drinking or smoking', head: 'NOTICE', tone: 'notice', required: false, kinds: 'lead_rrp, lead_abate, asbestos, mold, trauma',
    lines: ['NO EATING, DRINKING', 'OR SMOKING'], es: ['NO COMER, BEBER NI FUMAR'] },
  { id: 'lead_waste', title: 'Lead waste bag label', head: 'CAUTION', tone: 'caution', required: true, label: true, kinds: 'lead_abate, lead_rrp',
    lines: ['LEAD-CONTAMINATED WASTE', 'DO NOT OPEN – DO NOT REUSE'], es: ['PRECAUCIÓN – DESECHOS CONTAMINADOS CON PLOMO – NO ABRIR – NO REUTILIZAR'],
    fill: ['Paint chips, dust, debris and plastic sheeting', 'Generator: ______________________  Location: ______________________', 'Date sealed: ____________  Bagged by: ______________________'] },
  { id: 'asb_waste', title: 'Asbestos waste bag / container label', head: 'DANGER', tone: 'danger', required: true, label: true, kinds: 'asbestos',
    lines: ['CONTAINS ASBESTOS FIBERS', 'MAY CAUSE CANCER', 'CAUSES DAMAGE TO LUNGS', 'DO NOT BREATHE DUST', 'AVOID CREATING DUST'], es: ['PELIGRO – CONTIENE FIBRAS DE ASBESTO – PUEDE CAUSAR CÁNCER – NO RESPIRE EL POLVO'],
    fill: ['Generator: ______________________________', 'Location: ________________________________  Date: ____________', 'Abatement contractor: ______________________________'] }];
var SIGN_SIZES = [{ key: 'letter', label: 'Letter (8.5 × 11 in)', w: 8.5, h: 11 }, { key: 'tabloid', label: '11 × 17 in', w: 11, h: 17 }, { key: 'shop', label: '18 × 24 in (print shop)', w: 18, h: 24 }];
var TONES = { danger: { band: '#C8102E', ink: '#FFFFFF' }, warning: { band: '#F47B20', ink: '#000000' }, caution: { band: '#FFD100', ink: '#000000' }, notice: { band: '#0057A8', ink: '#FFFFFF' }, safe: { band: '#00843D', ink: '#FFFFFF' }, bio: { band: '#F47B20', ink: '#000000' } };
/* the signs for a job (by kind; the decon signs where the decon applies) */
function jobSigns(p, kinds, R){ R = R || rules(); var dc = p ? deconApplies(p, kinds, R) : true; return SIGNS.filter(function(g){ return hasKind(g, kinds) && (!g.decon || dc || g.id === 'handwash'); }); }
/* the company band on a sign: the job's company (GrayCo Environmental for environmental work), GrayCo Construction as the fallback */
function signBrand(co, fallback){ co = obj(co); fallback = obj(fallback); return { name: s(co.legal || co.name) || s(fallback.legal || fallback.name) || 'GrayCo Construction Services, LLC', phone: s(co.phone) || s(fallback.phone) || '(901) 585-0944', logo: s(co.logo) || s(fallback.logo) || '' }; }
/* one sign as blocks a renderer draws top to bottom (sizes in points for the chosen paper):
   the signal-word band, the legend (unchanged), the Spanish lines (bilingual), the fill-in lines, then the GrayCo band */
function signBlocks(sign, opt){
  opt = opt || {}; var Z = SIGN_SIZES.find(function(z){ return z.key === opt.size; }) || SIGN_SIZES[0], k = Z.w / 8.5, T = TONES[sign.tone] || TONES.notice, B = signBrand(opt.brand, opt.fallback);
  var L = [{ kind: 'head', text: s(sign.head), size: Math.round((sign.head.length > 10 ? 64 : 92) * k), band: T.band, ink: T.ink }];
  if (sign.symbol) L.push({ kind: 'symbol', text: sign.symbol, size: Math.round(110 * k) });
  arr(sign.lines).forEach(function(t, i){ L.push({ kind: 'legend', text: t, size: Math.round((i === 0 ? 44 : t.length > 40 ? 22 : 30) * k), bold: true }); });
  if (opt.es !== false && opt.bilingual) arr(sign.es).forEach(function(t, i){ L.push({ kind: 'es', text: t, size: Math.round((i === 0 ? 22 : 15) * k), bold: i === 0 }); });
  arr(sign.fill).forEach(function(t){ L.push({ kind: 'fill', text: fillLine(t, opt.fill), size: Math.round(14 * k) }); });
  arr(sign.lines).forEach(function(t, i){ if (/_{3,}/.test(t) && opt.fill) { var f = fillLine(t, opt.fill); if (f !== t) L.push({ kind: 'fill', text: f, size: Math.round(14 * k) }); } });   /* a fill-in in the legend (ACM "Material: ___") is printed again filled, the legend itself unchanged */
  if (sign.call) L.push({ kind: 'fill', text: 'Call ' + B.name + ' before any work here: ' + B.phone, size: Math.round(14 * k) });
  L.push({ kind: 'brand', text: B.name + '  |  ' + B.phone, logo: B.logo, size: Math.round(16 * k), band: '#0F2440', ink: '#FFFFFF' });
  return { id: sign.id, size: Z, w: Z.w, h: Z.h, blocks: L, brand: B };
}

/* ═════ ENVDOCS · LEAD LEVELS — ONE settings record "Lead levels 2026 v.3" (the owner's training reference sheet "IMPORTANT LEVELS -
   2026 v.3", 11/17/2026). Admins edit it (gc_kv gc_lead_levels, every version kept in gc_lead_levels_history); every compliance check
   (ENVCOMP, the written programs, the per-job plan, TCLP, the EPA/HUD tracking) reads it — nothing is written twice. ═════ */
var DEFAULT_LEVELS = {
  name: 'Lead levels 2026 v.3', v: '2026 v.3', source: 'GrayCo training reference sheet "IMPORTANT LEVELS - 2026 v.3" (owner, 11/17/2026) — confirm with EPA / HUD / OSHA / your state program',
  air: { al: 30, pel: 50, unit: 'µg/m³', cassette: '37 mm' },                       /* OSHA personal air */
  blood: { action: 30, removal: 50, back: 40, childEbll: 3.5, unit: 'µg/dL' },     /* OSHA additional action / removal from work / back to work; CDC child EBLL */
  apf: [{ key: 'halfApr', label: 'Half-face air-purifying respirator', apf: 10 }, { key: 'fullApr', label: 'Full-face air-purifying respirator', apf: 50 },
    { key: 'halfPapr', label: 'Half-face PAPR', apf: 50 }, { key: 'fullPapr', label: 'Full-face PAPR', apf: 1000 }],
  dlal: { floors: 5, sills: 40, troughs: 100, unit: 'µg/ft²', from: '2026-01-01' },  /* abatement clearance (dust-lead action level) */
  dlrl: { floorsConcern: 'detectable', floors: 5, sills: 40, troughs: 100, unit: 'µg/ft²', from: '2026-01-01' },   /* risk assessment (dust-lead reporting level) */
  waste: { tclp: 5, unit: 'ppm (mg/L)', residentialNonToxic: true, storageDays: 180, storageDaysFar: 270, farMiles: 200, alertDays: 150, alertDaysFar: 240 },
  paint: { chipPct: 0.5, xrf: 1.0, canPct: 0.06 },
  water: { epa: 10, hud: 15, unit: 'ppb' },
  soil: { play: 400, nonPlay: 1200, abatement: 5000, replacement: 200, driplineFt: 3, unit: 'µg/g' },
  fall: { triggerFt: 6, ladderFt: 3 } };
/* the record in use: the admin's, each group falling back to the sheet's numbers */
function levels(v){
  var D = clone(DEFAULT_LEVELS), x = obj(v);
  Object.keys(D).forEach(function(k){ if (Array.isArray(D[k])) { if (Array.isArray(x[k]) && x[k].length) D[k] = clone(x[k]); } else if (D[k] && typeof D[k] === 'object') D[k] = Object.assign(D[k], obj(x[k])); else if (x[k] != null && s(x[k])) D[k] = x[k]; });
  ['at', 'by'].forEach(function(k){ if (x[k]) D[k] = x[k]; });
  /* the same numbers under the names the EPA/HUD papers read (patch EPAHUD): dlal.floor / sill / trough, dlrl.floor, paint.pct / mgcm2,
     blood.cdcChild / backToWork, osha.al / pel, stamp / year / version — always derived here, never edited separately */
  D.dlal.floor = D.dlal.floors; D.dlal.sill = D.dlal.sills; D.dlal.trough = D.dlal.troughs; D.dlrl.floor = D.dlrl.floors; D.dlrl.sill = D.dlrl.sills; D.dlrl.trough = D.dlrl.troughs;
  D.paint.pct = D.paint.chipPct; D.paint.mgcm2 = D.paint.xrf; D.blood.cdcChild = D.blood.childEbll; D.blood.backToWork = D.blood.back; D.osha = { al: D.air.al, pel: D.air.pel };
  var vm = s(D.v).match(/^(\d{4})\s+(.*)$/); D.year = vm ? +vm[1] : ''; D.version = vm ? vm[2] : s(D.v); D.label = s(D.v); D.stamp = 'Levels: ' + s(D.v);
  return D;
}
function LV(R){ return obj(R).levels && obj(R.levels).air ? R.levels : levels(obj(R).levels); }
function numOf(v){ var t = s(v).replace(/,/g, ''); if (/^\s*(nd|non.?detect|bdl|<\s*(rl|mdl))/i.test(t)) return 0; var m = t.match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
function surfaceOf(t){ t = low(t); return /trough|well/.test(t) ? 'troughs' : /sill|stool/.test(t) ? 'sills' : /floor/.test(t) ? 'floors' : ''; }
/* compare a result with the levels → { flag: 'green' | 'red' | '', level, text, action, act }
   kind: air | blood | wipe (clearance, DLAL) | riskwipe (risk assessment, DLRL) | tclp | xrf | chip | can | water | soil */
function compareLevel(kind, value, opt, L){
  opt = obj(opt); L = L && L.air ? L : levels(L); var v = numOf(value), out = { flag: '', level: '', text: '', action: '', act: '' };
  if (!isFinite(v) && !/detect/i.test(s(value))) return out;
  var G = function(text, level){ out.flag = 'green'; out.text = text; out.level = level; return out; }, Rd = function(text, level, action, act){ out.flag = 'red'; out.text = text; out.level = level; out.action = action || ''; out.act = act || ''; return out; };
  if (kind === 'air') { var A = L.air; return v >= A.pel ? Rd(v + ' ' + A.unit + ' ≥ PEL ' + A.pel, 'PEL ' + A.pel + ' ' + A.unit, 'Above the PEL: respirators (pick by the protection factor), the full written program, monitoring every 3 months', 'pel')
    : v >= A.al ? Rd(v + ' ' + A.unit + ' ≥ action level ' + A.al, 'AL ' + A.al + ' ' + A.unit, 'At / above the action level: medical surveillance, monitoring every 6 months, training', 'al') : G(v + ' ' + A.unit + ' < action level ' + A.al, 'AL ' + A.al + ' · PEL ' + A.pel + ' ' + A.unit); }
  if (kind === 'blood') { var B = L.blood;
    if (opt.removed) return v < B.back ? G(v + ' ' + B.unit + ' < ' + B.back + ' — Back to work at <' + B.back + ': cleared to return (with the physician\'s written opinion)', 'Back to work <' + B.back) : Rd(v + ' ' + B.unit + ' — still not below ' + B.back + ' (Back to work at <' + B.back + ')', 'Back to work <' + B.back, 'Stay on medical removal with pay protection; follow-up test', 'stay');
    return v >= B.removal ? Rd(v + ' ' + B.unit + ' ≥ ' + B.removal + ' — Removal From Work', 'Removal ' + B.removal + ' ' + B.unit, 'Medical removal with pay protection (Back to work at <' + B.back + ')', 'remove')
      : v >= B.action ? Rd(v + ' ' + B.unit + ' ≥ ' + B.action + ' — OSHA additional action level', 'Action ' + B.action + ' ' + B.unit, 'More frequent blood tests (default monthly), review controls and hygiene', 'action') : G(v + ' ' + B.unit + ' < ' + B.action, 'Action ' + B.action + ' · removal ' + B.removal + ' ' + B.unit); }
  if (kind === 'wipe' || kind === 'riskwipe') { var W0 = kind === 'wipe' ? L.dlal : L.dlrl, sf = surfaceOf(opt.surface) || 'floors', lim = +W0[sf], nm = kind === 'wipe' ? 'DLAL clearance' : 'DLRL risk assessment', lab = { floors: 'floors', sills: 'interior window sills', troughs: 'window troughs' }[sf];
    if (kind === 'riskwipe' && sf === 'floors' && v > 0 && v < lim) return Rd(v + ' ' + W0.unit + ' on floors — detectable: express concern', nm + ' floors: concern at detectable, action ' + lim, 'Express concern; recommend cleaning / interim controls', 'concern');
    return v >= lim ? Rd(v + ' ' + W0.unit + ' ≥ ' + lim + ' (' + lab + ')' + (kind === 'wipe' ? ' — clearance FAILS' : ' — recommend action'), nm + ' ' + lab + ' ' + lim + ' ' + W0.unit, kind === 'wipe' ? 'Clean again and re-test the area' : 'Recommend hazard control / abatement', kind === 'wipe' ? 'fail' : 'recommend')
      : G(v + ' ' + W0.unit + ' < ' + lim + ' (' + lab + ')' + (kind === 'wipe' ? ' — clearance passes' : ''), nm + ' ' + lab + ' ' + lim + ' ' + W0.unit); }
  if (kind === 'tclp') { var T = L.waste; if (opt.residential && T.residentialNonToxic !== false) return G('Waste from a residence — NON-TOXIC (household exemption; still logged)', 'household exemption');
    return v >= T.tclp ? Rd(v + ' ppm ≥ ' + T.tclp + ' — HAZARDOUS waste', 'TCLP ' + T.tclp + ' ppm', 'Hazardous: manifest, hauler, TSD facility, generator status; storage limit ' + T.storageDays + ' days (' + T.storageDaysFar + ' if the destination is over ' + T.farMiles + ' miles)', 'hazardous') : G(v + ' ppm < ' + T.tclp + ' — non-hazardous', 'TCLP ' + T.tclp + ' ppm'); }
  if (kind === 'xrf') return v >= L.paint.xrf ? Rd(v + ' mg/cm² ≥ ' + L.paint.xrf + ' — LEAD-BASED PAINT', 'XRF ' + L.paint.xrf + ' mg/cm²', 'Lead-safe work practices (RRP / abatement) on this component', 'lbp') : G(v + ' mg/cm² < ' + L.paint.xrf, 'XRF ' + L.paint.xrf + ' mg/cm²');
  if (kind === 'chip') return v >= L.paint.chipPct ? Rd(v + '% ≥ ' + L.paint.chipPct + '% by weight — LEAD-BASED PAINT', 'chip ' + L.paint.chipPct + '%', 'Lead-safe work practices (RRP / abatement) on this component', 'lbp') : G(v + '% < ' + L.paint.chipPct + '%', 'chip ' + L.paint.chipPct + '%');
  if (kind === 'can') return v >= L.paint.canPct ? Rd(v + '% ≥ ' + L.paint.canPct + '% — lead paint (in the can)', 'in can ' + L.paint.canPct + '%', 'Do not use this paint', 'can') : G(v + '% < ' + L.paint.canPct + '%', 'in can ' + L.paint.canPct + '%');
  if (kind === 'water') { var Wt = L.water; return v >= Wt.hud ? Rd(v + ' ppb ≥ HUD hazard level ' + Wt.hud, 'HUD ' + Wt.hud + ' ppb', 'Lead hazard in water: notify the owner / occupants, use bottled water, find the source', 'hud') : v >= Wt.epa ? Rd(v + ' ppb ≥ EPA action level ' + Wt.epa, 'EPA ' + Wt.epa + ' ppb', 'Above the EPA action level: notify, flush / filter, re-test', 'epa') : G(v + ' ppb < ' + Wt.epa, 'EPA ' + Wt.epa + ' · HUD ' + Wt.hud + ' ppb'); }
  if (kind === 'soil') { var So = L.soil, area = low(opt.area), lim2 = /abate/.test(area) ? So.abatement : (/non.?play|bare|yard|drip/.test(area) || (/non/.test(area) && !/play/.test(area))) ? So.nonPlay : So.play, an = lim2 === So.abatement ? 'abatement' : lim2 === So.nonPlay ? 'non-play areas' : 'children\'s play areas';
    return v >= lim2 ? Rd(v + ' µg/g ≥ ' + lim2 + ' (' + an + ')', 'soil ' + an + ' ' + lim2 + ' µg/g', lim2 === So.abatement ? 'Soil abatement (remove / replace — replacement soil ≤ ' + So.replacement + ' µg/g)' : 'Soil hazard: interim controls (cover / restrict) — dripline zone ' + So.driplineFt + ' ft', 'soil') : G(v + ' µg/g < ' + lim2 + ' (' + an + ')', 'soil ' + an + ' ' + lim2 + ' µg/g'); }
  return out;
}
/* blood lead → the medical removal step: remove (≥ removal), return (removed and < back to work), stay, action, ok */
function bloodAction(value, removed, L){ var c = compareLevel('blood', value, { removed: !!removed }, L); return { act: c.act || (removed ? 'return' : 'ok'), flag: c.flag, text: c.text, action: c.action }; }
/* the minimum respirator for a measured exposure: exposure ÷ APF must be under the PEL — with the math */
function minRespirator(exposure, L){
  L = L && L.air ? L : levels(L); var e = numOf(exposure), pel = +L.air.pel, A = arr(L.apf).slice().sort(function(a, b){ return a.apf - b.apf; });
  if (!isFinite(e)) return { ok: false, text: 'No measured exposure yet' };
  if (e < pel) return { ok: true, need: false, text: e + ' µg/m³ is below the PEL ' + pel + ' — a respirator is not required by the exposure (the program may still require one for trigger tasks)' };
  var math = A.map(function(r){ var inside = Math.round(e / r.apf * 100) / 100; return { r: r, inside: inside, ok: inside < pel, line: e + ' ÷ ' + r.apf + ' (' + r.label + ') = ' + inside + ' µg/m³ ' + (inside < pel ? '< ' : '≥ ') + 'PEL ' + pel }; });
  var pick = math.find(function(m){ return m.ok; });
  return { ok: !!pick, need: true, pick: pick ? pick.r : null, math: math.map(function(m){ return m.line; }), text: pick ? 'Minimum: ' + pick.r.label + ' (APF ' + pick.r.apf + '): ' + pick.line : 'No air-purifying respirator on the list is enough — ' + e + ' µg/m³ needs supplied air (consult the program administrator)' };
}
/* the hazardous waste storage clock: 180 days (270 if the destination is over 200 miles), alert at 150 / 240 */
function storageClock(start, far, L, t){
  L = L && L.air ? L : levels(L); var Wl = L.waste, lim = far ? +Wl.storageDaysFar : +Wl.storageDays, al = far ? +Wl.alertDaysFar : +Wl.alertDays, st0 = ymd(start); t = t || todayLocal();
  if (!st0) return null; var d = daysBetween(st0, t);
  return { start: st0, days: d, limit: lim, alert: al, due: addDays(st0, lim), alertOn: addDays(st0, al), far: !!far, st: d >= lim ? 'over' : d >= al ? 'alert' : 'ok', text: 'Hazardous waste storage: day ' + d + ' of ' + lim + (far ? ' (destination over ' + Wl.farMiles + ' miles)' : '') + ' — ship by ' + addDays(st0, lim) + ' (alert at ' + al + ' days)' };
}

/* the levels as printed lines (the Word programs carry them; a filled copy refreshes them from the record) — each starts with a fixed
   "Lead levels – <group>:" so the copy can find it */
function levelsLines(L){
  L = L && L.air ? L : levels(L); var A = L.air, B = L.blood, W1 = L.waste;
  return [['air', 'Lead levels – OSHA personal air: action level ' + A.al + ' ' + A.unit + '; PEL ' + A.pel + ' ' + A.unit + '; sampling cassette ' + A.cassette + '.'],
    ['blood', 'Lead levels – blood: OSHA additional action level ' + B.action + ' ' + B.unit + '; Removal From Work ' + B.removal + ' ' + B.unit + '; Back To Work below ' + B.back + ' ' + B.unit + '; CDC elevated blood lead for a child ' + B.childEbll + ' ' + B.unit + '.'],
    ['apf', 'Lead levels – respirator protection factors (exposure inside the mask = exposure ÷ factor, must be under the PEL): ' + arr(L.apf).map(function(a){ return a.label + ' ' + a.apf; }).join('; ') + '.'],
    ['dlal', 'Lead levels – abatement clearance (DLAL, from ' + s(L.dlal.from).slice(0, 4) + '): floors ' + L.dlal.floors + ', interior window sills ' + L.dlal.sills + ', window troughs ' + L.dlal.troughs + ' ' + L.dlal.unit + '.'],
    ['dlrl', 'Lead levels – risk assessment (DLRL, from ' + s(L.dlrl.from).slice(0, 4) + '): floors – express concern at ' + L.dlrl.floorsConcern + ', recommend action at ' + L.dlrl.floors + '; window sills ' + L.dlrl.sills + '; window troughs ' + L.dlrl.troughs + ' ' + L.dlrl.unit + '.'],
    ['waste', 'Lead levels – waste: TCLP ' + W1.tclp + ' ppm = hazardous; waste from a residence = non-toxic (household exemption, still logged); hazardous waste storage ' + W1.storageDays + ' days (' + W1.storageDaysFar + ' days if the destination is over ' + W1.farMiles + ' miles).'],
    ['paint', 'Lead levels – lead paint: ' + L.paint.chipPct + '% by weight (chip); ' + L.paint.xrf + ' mg/cm² (XRF); ' + L.paint.canPct + '% (paint in the can).'],
    ['water', 'Lead levels – water: EPA action level ' + L.water.epa + ' ' + L.water.unit + '; HUD hazard level ' + L.water.hud + ' ' + L.water.unit + '.'],
    ['soil', 'Lead levels – soil: children\'s play areas ' + L.soil.play + ', non-play areas ' + L.soil.nonPlay + ', abatement ' + L.soil.abatement + ', replacement soil ' + L.soil.replacement + ' max ' + L.soil.unit + '; dripline zone ' + L.soil.driplineFt + ' ft.'],
    ['fall', 'Lead levels – fall protection: OSHA trigger ' + L.fall.triggerFt + ' ft; ladder extends ' + L.fall.ladderFt + ' ft over the platform.']];
}
/* a program's Word file with the CURRENT levels: the "Lead levels –" lines, the key-limit phrases, the "Levels: …" stamp */
function levelsDocxXml(xml, L){
  L = L && L.air ? L : levels(L); var out = String(xml || ''), A = L.air;
  levelsLines(L).forEach(function(x){ var pre = x[1].split(':')[0] + ':'; out = out.replace(new RegExp('(<w:t[^>]*>)' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^<]*(</w:t>)'), function(m, a, b){ return a + xmlEsc(x[1]) + b; }); });
  var half = (arr(L.apf).find(function(a){ return a.key === 'halfApr'; }) || { apf: 10 }).apf;
  out = out.replace(/(Action level \(AL\): )[\d.]+( µg\/m³)/, '$1' + A.al + '$2').replace(/(Permissible exposure limit \(PEL\): )[\d.]+( µg\/m³)/, '$1' + A.pel + '$2')
    .replace(/(below the action level of )[\d.]+( µg\/m³)/, '$1' + A.al + '$2').replace(/(Soil: )[\d.]+( ppm in play areas)/, '$1' + L.soil.play + '$2')
    .replace(/(assigned protection factor )[\d.]+(; adequate up to )[\d.]+( µg\/m³)/, '$1' + half + '$2' + (half * A.pel) + '$3').replace(/(Higher exposures \(over )[\d.]+( µg\/m³ lead\))/, '$1' + (half * A.pel) + '$2')
    .replace(/(both show )[\d.]+( µg\/dL or more)/, '$1' + L.blood.removal + '$2').replace(/(two consecutive blood lead tests below )[\d.]+( µg\/dL)/, '$1' + L.blood.back + '$2');
  out = out.replace(/(<w:t[^>]*>[^<]*)Levels: [^<|]*?(\s*(?:\||<))/, function(m, a, b){ return a + levelsStamp(L) + b; });
  return out;
}
function levelsStamp(L){ L = L && L.air ? L : levels(L); return 'Levels: ' + s(L.v || L.name); }
/* {air.al} {air.pel} {air.unit} {blood.removal} {blood.back} {waste.tclp} {fall.triggerFt} … in a text → the record's value */
function fillTokens(t, L){ L = L && L.air ? L : levels(L); return s(t).replace(/\{([a-z]+)\.([A-Za-z]+)\}/g, function(m, g, k){ var v = obj(L[g])[k]; return v == null ? m : String(v); }); }
/* the lead levels card acknowledgments: { '<version>': { '<email>': { name, at } } } */
function ackOf(acks, L, email){ L = L && L.air ? L : levels(L); return obj(obj(acks)[s(L.v)])[low(email)] || null; }
var API = { DEFAULT_RULES: DEFAULT_RULES, SECTIONS: SECTIONS, CONFIRM: CONFIRM, rules: rules, detectKinds: detectKinds, isOn: isOn, stateOf: stateOf, started: started, finished: finished, nearDone: nearDone,
  crewOf: crewOf, crewOnDay: crewOnDay, certFor: certFor, certType: certType, certIs: certIs, medSummary: medSummary, medNext: medNext, publicStatus: publicStatus, activeRemoval: activeRemoval,
  evaluate: evaluate, closeoutBlockers: closeoutBlockers, noticeDue: noticeDue, workingDaysBefore: workingDaysBefore, retainUntil: retainUntil, retainYears: retainYears, recCat: recCat, live: live, dailyTotals: dailyTotals,
  airType: airType, mrpPay: mrpPay, hasKind: hasKind, listOf: listOf, addDays: addDays, addMonths: addMonths, daysBetween: daysBetween, today: todayLocal, typeText: typeText,
  /* ENVDOCS */ DEFAULT_LEVELS: DEFAULT_LEVELS, levels: levels, LV: LV, levelsStamp: levelsStamp, levelsLines: levelsLines, levelsDocxXml: levelsDocxXml, fillTokens: fillTokens, compareLevel: compareLevel, bloodAction: bloodAction, minRespirator: minRespirator, storageClock: storageClock, numOf: numOf, ackOf: ackOf, surfaceOf: surfaceOf, tclpNote: tclpNote,
  wasteOn: wasteOn, tclpThreshold: tclpThreshold, tclpClass: tclpClass, wasteStreams: wasteStreams, canDispose: canDispose, shipGaps: shipGaps, wasteItems: wasteItems, streamKey: streamKey,
  asbBy: asbBy, crewKinds: crewKinds, ruleBy: ruleBy, deconApplies: deconApplies, deconRec: deconRec, deconState: deconState, dailyFields: dailyFields, subOf: subOf, subItems: subItems,
  defaultAdmin: defaultAdmin, programInfo: programInfo, jobPrograms: jobPrograms, plans: plans, planFp: planFp, planState: planState, buildPlan: buildPlan, planLines: planLines, planTexts: planTexts, fillDocxXml: fillDocxXml, fillFooterXml: fillFooterXml, fillLine: fillLine, hash: hash,
  DECON_PURCHASE: DECON_PURCHASE, SIGNS: SIGNS, SIGN_SIZES: SIGN_SIZES, SIGN_NOTE: SIGN_NOTE, TONES: TONES, jobSigns: jobSigns, signBrand: signBrand, signBlocks: signBlocks };
if (typeof module === 'object' && module.exports) module.exports = API; else root._gcEnvCompCore = API;
})(this);
