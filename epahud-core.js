/* epahud-core.js — EPAHUD: the EPA / HUD lead & asbestos papers GrayCo was missing, as DATA + the timing rules, ONE copy for the CRM
   page (index.html loads /epahud-core.js → window._gcEpaHudCore, before 📑 JOBDOCS) and node tests (module.exports).
   Owner 11/17: "All asbestos and lead documents, actions etc. that EPA and HUD require that I don't have — let's make them." and
   "All these documents deploy automatically to the PMs for every job type, to then send to portals, emails, texts etc."
   The requirements matrix with the official sources: docs/EPA_HUD_LEAD_ASBESTOS_MATRIX.md.

   Nothing here is legal text. Each paper names the rule it is based on; the timing rules are the published numbers (eCFR, 11/13/2026)
   and every one says "confirm with your state program / attorney". Admins edit the papers in 📑 Paperwork by job type.

   API: items(typeKey) → JOBDOCS table items (ep: 1) · cond(p, c, base) → true / false / null (null = not an EPAHUD condition)
        due(p, x, today) → { date, txt, over, soon, wait, basis } · events · DUE (the timing rules) · TO (recipients) · channels(x)
        certTemplates (📜 Certifications) · drafts (the owner's own certificates to confirm) · labelMap (auto-fill of blank rows)
        workingDaysBefore(d, n) · addDays · today() */
(function(root){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function ymd(v){ var t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(d, n){ var t = Date.parse(ymd(d) + 'T12:00:00Z'); return isNaN(t) ? '' : new Date(t + n * 864e5).toISOString().slice(0, 10); }
function dow(d){ return new Date(ymd(d) + 'T12:00:00Z').getUTCDay(); }
/* n working (business) days before d — Saturdays and Sundays skipped; holidays are not known here (the label says to confirm) */
function workingDaysBefore(d, n){ var x = ymd(d); if (!x) return ''; var k = 0; while (k < n) { x = addDays(x, -1); var w = dow(x); if (w !== 0 && w !== 6) k++; } return x; }
function nice(d){ d = ymd(d); return d ? (+d.slice(5, 7)) + '/' + (+d.slice(8, 10)) : ''; }
function daysBetween(a, b){ var x = Date.parse(ymd(a) + 'T12:00:00Z'), y = Date.parse(ymd(b) + 'T12:00:00Z'); return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 864e5); }

/* ── who a paper goes to (the recipient decides the send channels) ── */
var TO = {
  owner: { label: 'Owner / customer', send: true, sign: true },
  occupant: { label: 'Occupants / tenants', send: true, occupant: true },
  'owner+occupant': { label: 'Owner + adult occupant', send: true, sign: true, occupant: true },
  parents: { label: 'Parents / guardians (posted or handed out)', send: true, post: true },
  agency: { label: 'State / EPA program (a filing, not a send)', filing: true },
  sub: { label: 'Licensed abatement sub (internal)', internal: true },
  file: { label: 'Job file / crew', internal: true },
  /* JOBREQ: a paper someone added to one job — who fills it out or signs it */
  xcust: { label: 'Customer fills it out', send: true },
  xpm: { label: 'The PM fills it out / signs', internal: true },
  xcrew: { label: 'Crew / employee fills it out / signs', internal: true },
  xsub: { label: 'Subcontractor fills it out / signs', internal: true },
  xoffice: { label: 'Office fills it out', internal: true }
};
/* ── the job's dates that start a clock (entered on the job's 📑 Paperwork → 🏛 EPA / HUD facts) ── */
var EVENTS = [
  ['evalReport', 'Lead evaluation / risk assessment report received', 'HUD: the notice of evaluation is due 15 days after this'],
  ['completedOn', 'Lead / asbestos work completed', 'RRP records 30 days · HUD hazard-reduction notice 15 days'],
  ['finalInvoice', 'Final invoice delivered', 'RRP records go with the final invoice when that is sooner than 30 days'],
  ['ebllNotice', 'Health department notice of a child with an elevated blood lead level', 'HUD: environmental investigation within 15 days'],
  ['envReport', 'Environmental investigation report received (EBLL)', 'HUD: hazard reduction within 30 days'],
  ['wasteAccepted', 'Asbestos waste accepted by the transporter (first load)', 'NESHAP: signed WSR back from the landfill — 35 days call, 45 days report'],
  ['paintReport', 'Occupant reported deteriorated paint (HUD maintenance)', 'HUD: stabilize within 30 days']
];
var FACTS = [
  ['commonArea', 'Common areas of multi-unit housing (halls, laundry, stairs)'],
  ['tenantOccupied', 'The owner does not live there (tenants / occupants)'],
  ['hud', 'HUD-assisted housing (Section 8, HOME, CDBG, public housing …)'],
  ['abatement', 'Lead abatement (permanent elimination), not RRP renovation'],
  ['childOccupied', 'Child-occupied facility (school, daycare, Head Start)'],
  ['ebll', 'A child with an elevated blood lead level lives there'],
  ['units5', 'Commercial / 5+ units (asbestos NESHAP facility)'],
  ['demolition', 'Demolition (NESHAP notice even with no asbestos)']
];

/* ── the timing rules (x.due) → the paper's due date on a job ── */
var DUE = {
  start: { txt: 'before work starts', cite: '' },
  'start-7': { txt: 'mailed 7+ days before work starts', cite: '40 CFR 745.84(a)(1)(ii)' },
  'pre-60': { txt: 'no more than 60 days before, and before work starts', cite: '40 CFR 745.84(a)–(c)' },
  'state-abate': { txt: 'state lead abatement notice before the start (TN 5 business days · MS 6 working days · AR confirm with ADH)', cite: 'TN 0400-13-01 · MDEQ LBP regs · ADH rules' },
  wd10: { txt: '10 working days before removal / demolition', cite: '40 CFR 61.145(b)(3)(i)' },
  final30: { txt: 'with the final invoice or within 30 days of completion, whichever is sooner', cite: '40 CFR 745.86(c)' },
  done15: { txt: 'within 15 days after the hazard reduction is complete', cite: '24 CFR 35.125(b)(1)' },
  eval15: { txt: 'within 15 days after the evaluation report is received', cite: '24 CFR 35.125(a)' },
  ebll15: { txt: 'environmental investigation within 15 days of the health department notice', cite: '24 CFR 35.730(a) / 35.1225(a)' },
  ebll30: { txt: 'hazard reduction within 30 days of the investigation report', cite: '24 CFR 35.730(b) / 35.1225(b)' },
  wsr35: { txt: 'signed waste shipment record back from the landfill — follow up at 35 days, report to the state at 45', cite: '40 CFR 61.150(d)(3)–(4)' },
  done: { txt: 'at completion', cite: '' },
  during: { txt: 'during the job', cite: '' },
  /* JOBREQ: the due dates a person picks for a paper added to one job */
  date: { txt: 'by the date set', cite: '' },
  final: { txt: 'before the final invoice', cite: '' },
  atdone: { txt: 'at completion', cite: '' }
};
function events(p){ var E = obj(obj(p && p.epahud).events), a = obj(p && p.leadAsb), out = {}; EVENTS.forEach(function(e){ out[e[0]] = ymd(E[e[0]]); }); out.completedOn = out.completedOn || ymd(p && (p.completionDate || p.completedAt || p.completedDate)) || ''; return out; }
function finished(p){ return /complete|closed|warrant|close.?out/i.test(s(p && p.status)) || (+(p && (p.pct != null ? p.pct : p.progress)) || 0) >= 100; }
function stateOf(p){ var a = [p && p.address, p && p.jobAddress, p && p.siteAddress, p && p.state].map(s).join(' '); var m = a.match(/(^|[\s,])(TN|AR|MS)(?=[\s,.]|\d|$)/) || a.match(/tennessee|arkansas|mississippi/i); if (!m) return ''; var v = (m[2] || m[0]).toUpperCase(); return v.length === 2 ? v : { TENNESSEE: 'TN', ARKANSAS: 'AR', MISSISSIPPI: 'MS' }[v] || ''; }
var STATE_ABATE = { TN: { n: 5, txt: 'TDEC: received 5 business days before the start' }, MS: { n: 6, txt: 'MDEQ: 6 working days before the start' }, AR: { n: 10, txt: 'ADH notice of intent — 10 working days (confirm with ADH)' } };
/* → { date, txt, over, soon, wait (a date the job does not have yet), basis } */
function due(p, x, t){
  t = t || today(); var k = s(x && x.due) || (x && x.when === 'before' ? 'start' : x && x.when === 'after' ? 'done' : 'during'), R = DUE[k] || DUE.during;
  var E = events(p), st = ymd(p && p.startDate), date = '', basis = '', wait = '';
  if (k === 'start' || k === 'pre-60') { date = st; basis = st ? 'start ' + nice(st) : ''; wait = st ? '' : 'the start date'; if (st) date = addDays(st, -1); }
  else if (k === 'start-7') { date = st ? addDays(st, -7) : ''; basis = st ? 'start ' + nice(st) : ''; wait = st ? '' : 'the start date'; }
  else if (k === 'state-abate') { var S = STATE_ABATE[stateOf(p)] || { n: 5, txt: 'EPA-run states: 5 business days (40 CFR 745.227(e)(4))' }; date = st ? workingDaysBefore(st, S.n) : ''; basis = S.txt; wait = st ? '' : 'the start date'; }
  else if (k === 'wd10') { date = st ? workingDaysBefore(st, 10) : ''; basis = st ? '10 working days before ' + nice(st) : ''; wait = st ? '' : 'the start date'; }
  else if (k === 'final30') { var c = E.completedOn, fi = E.finalInvoice; var d30 = c ? addDays(c, 30) : ''; date = fi && (!d30 || fi < d30) ? fi : d30; basis = fi && date === fi ? 'final invoice ' + nice(fi) : c ? 'completed ' + nice(c) : ''; wait = date ? '' : 'the completion date'; }
  else if (k === 'done15') { date = E.completedOn ? addDays(E.completedOn, 15) : ''; basis = date ? 'completed ' + nice(E.completedOn) : ''; wait = date ? '' : 'the completion date'; }
  else if (k === 'eval15') { date = E.evalReport ? addDays(E.evalReport, 15) : ''; basis = date ? 'report received ' + nice(E.evalReport) : ''; wait = date ? '' : 'the date the evaluation report came in'; }
  else if (k === 'ebll15') { date = E.ebllNotice ? addDays(E.ebllNotice, 15) : ''; basis = date ? 'notice ' + nice(E.ebllNotice) : ''; wait = date ? '' : 'the health department notice date'; }
  else if (k === 'ebll30') { date = E.envReport ? addDays(E.envReport, 30) : ''; basis = date ? 'report ' + nice(E.envReport) : ''; wait = date ? '' : 'the investigation report date'; }
  else if (k === 'wsr35') { date = E.wasteAccepted ? addDays(E.wasteAccepted, 35) : ''; basis = date ? 'waste accepted ' + nice(E.wasteAccepted) + ' (report at 45 days: ' + nice(addDays(E.wasteAccepted, 45)) + ')' : ''; wait = date ? '' : 'the date the waste left the site'; }
  else if (k === 'date') { date = ymd(x && x.dueDate); basis = date ? 'set when it was added' : ''; wait = date ? '' : 'a due date'; }
  else if (k === 'final') { date = E.finalInvoice || ymd(x && x.finalOn); basis = date ? 'final invoice ' + nice(date) : ''; wait = date ? '' : 'the final invoice date'; }
  else if (k === 'atdone') { date = E.completedOn || ''; basis = date ? 'completed ' + nice(date) : ''; wait = date ? '' : 'the completion date'; }
  else if (k === 'done') { date = E.completedOn ? addDays(E.completedOn, 30) : ''; basis = date ? 'completed ' + nice(E.completedOn) : ''; wait = date ? '' : 'the completion date'; }
  var n = date ? daysBetween(t, date) : null;
  return { k: k, date: date, txt: R.txt, cite: R.cite, basis: basis, wait: wait, over: n != null && n < 0, soon: n != null && n >= 0 && n <= 3, days: n };
}

/* ── the conditions the EPAHUD papers use (JOBDOCS asks first; null = not ours) ── */
function la(p){ return obj(p && p.leadAsb); }
function fact(p, k){ var E = obj(obj(p && p.epahud).facts); if (k in E) return !!E[k]; return !!la(p)[k]; }
function cond(p, c, base){
  if (c === 'commonArea' || c === 'tenantOccupied' || c === 'ebll' || c === 'demolition') return fact(p, c);
  if (c === 'hud' || c === 'abatement' || c === 'childOccupied' || c === 'units5') return fact(p, c);
  if (c === 'rrp') return !fact(p, 'abatement');
  if (c === 'notifyStmt') return fact(p, 'commonArea') || fact(p, 'childOccupied');
  if (c === 'occupantCopy') return fact(p, 'tenantOccupied') || fact(p, 'commonArea') || fact(p, 'childOccupied');
  if (c === 'hudOrAbatement') return fact(p, 'hud') || fact(p, 'abatement');
  if (c === 'neshap') { var com = false; try { com = typeof base === 'function' ? !!base('commercial') : false; } catch (e) {} return com || fact(p, 'units5') || fact(p, 'demolition'); }
  return null;
}

/* ── the papers (JOBDOCS table items; doc = the 📚 library paper id) ── */
function I(doc, label, when, o){ return Object.assign({ doc: doc, label: label, when: when, ep: 1 }, o || {}); }
var ITEMS = {
  lead: [
    I('gcb_lead_08', 'Lead 08 — Renovate Right delivery: certificate of mailing / attempted delivery', 'before', { who: 'file', to: 'file', due: 'start-7', cite: '40 CFR 745.84(a)(1)(ii), (a)(2)(i), (c)(1)(ii)' }),
    I('gcb_lead_09', 'Lead 09 — Common-area renovation notice to every affected unit (+ revised notice)', 'before', { who: 'customer', to: 'occupant', due: 'pre-60', only: ['commonArea'], cite: '40 CFR 745.84(b)(2), (b)(4)' }),
    I('gcb_lead_10', 'Lead 10 — Signed statement of the notification steps (common areas / child-occupied)', 'before', { who: 'file', to: 'file', due: 'start', only: ['notifyStmt'], cite: '40 CFR 745.84(b)(3), (c)(3)' }),
    I('gcb_lead_15', 'Lead 15 — Lead evaluation request & results (certified inspector / risk assessor)', 'before', { who: 'file', to: 'file', due: 'start', only: ['hudOrAbatement'], cite: '24 CFR 35.110, 35.1320 · 40 CFR 745.227(b)–(d)' }),
    I('gcb_lead_14', 'Lead 14 — State lead abatement notification checklist (TN / AR / MS) + updates', 'before', { who: 'file', to: 'agency', due: 'state-abate', only: ['abatement'], cite: '40 CFR 745.227(e)(4) · TN 0400-13-01 · ADH · MDEQ' }),
    I('gcb_hud_03', 'HUD 03 — Occupant protection & temporary relocation notice', 'before', { who: 'customer', to: 'occupant', due: 'start', only: ['hudOrAbatement'], cite: '24 CFR 35.1345(a) · 40 CFR 745.227(e)(5)' }),
    I('gcb_hud_01', 'HUD 01 — Notice of lead-based paint evaluation or presumption (15 days)', 'before', { who: 'customer', to: 'occupant', due: 'eval15', only: ['hud'], cite: '24 CFR 35.125(a)' }),
    I('gcb_hud_06', 'HUD 06 — Child with an elevated blood lead level: response record (15 / 30 days)', 'before', { who: 'file', to: 'file', due: 'ebll15', only: ['ebll'], cite: '24 CFR 35.730 / 35.1225' }),
    I('gcb_lead_11', 'Lead 11 — Cleaning verification record (wet / dry cloths, the EPA card)', 'during', { who: 'file', to: 'file', due: 'during', only: ['rrp'], cite: '40 CFR 745.85(b), 745.86(b)(6)(viii)' }),
    I('gcb_hud_04', 'HUD 04 — Clearance examination (independent certified clearance examiner)', 'after', { who: 'customer', to: 'owner', due: 'done', only: ['hudOrAbatement'], cite: '24 CFR 35.1340 · 40 CFR 745.227(e)(8)' }),
    I('gcb_lead_13', 'Lead 13 — Lead abatement report (certified supervisor / project designer)', 'after', { who: 'customer', to: 'owner', due: 'done', only: ['abatement'], cite: '40 CFR 745.227(e)(10), (i)' }),
    I('gcb_lead_12', 'Lead 12 — Post-renovation records: adult occupant copy / common-area posting', 'after', { who: 'customer', to: 'occupant', due: 'final30', only: ['occupantCopy', 'rrp'], cite: '40 CFR 745.86(c)–(d)' }),
    I('gcb_hud_05', 'HUD 05 — Ongoing lead-based paint maintenance: notice to report deteriorated paint', 'after', { who: 'customer', to: 'occupant', due: 'done15', only: ['hud'], cite: '24 CFR 35.1355(a)(7)' })
  ],
  asbestos: [
    I('gcb_asb_03', 'Asbestos 03 — Thorough inspection record (accredited / licensed inspector)', 'before', { who: 'file', to: 'file', due: 'start', cite: '40 CFR 61.145(a) · 40 CFR 763 Subpart E' }),
    I('gcb_asb_05', 'Asbestos 05 — Abatement sub pre-job coordination minutes', 'before', { who: 'file', to: 'sub', due: 'start', cite: '29 CFR 1926.1101(d), (k)(2)–(3)' }),
    I('gcb_asb_04', 'Asbestos 04 — NESHAP notification tracking + revisions (the sub files it)', 'before', { who: 'file', to: 'agency', due: 'wd10', only: ['neshap'], cite: '40 CFR 61.145(b)' }),
    I('gcb_asb_06', 'Asbestos 06 — Owner / occupant notice of asbestos work', 'before', { who: 'customer', to: 'occupant', due: 'start', cite: '29 CFR 1926.1101(k)(2)' })
  ]
};
/* the HUD hazard-reduction notice replaces JOBDOCS' "needs a form" line of the same name */
ITEMS.lead.push(I('gcb_hud_02', 'HUD 02 — Notice of lead hazard reduction activity (within 15 days of completion)', 'after', { who: 'customer', to: 'occupant', due: 'done15', only: ['hud'], cite: '24 CFR 35.125(b)' }));
/* timing + recipients for papers JOBDOCS already lists (applied when the item has none) */
var KNOWN = {
  gcb_lead_01: { to: 'owner+occupant', due: 'pre-60', cite: '40 CFR 745.84(a)' },
  gcb_lead_02: { to: 'parents', due: 'pre-60', cite: '40 CFR 745.84(c)(2)' },
  gcb_lead_03: { to: 'owner', due: 'final30', cite: '40 CFR 745.86(c)' },
  gcb_lead_05: { to: 'owner', due: 'final30', cite: '40 CFR 745.86(b)(1)(ii), (c)' },
  gcb_lead_04: { to: 'file', due: 'start', cite: '40 CFR 745.85(c), 745.86(b)(6)' },
  gcb_asb_01: { to: 'owner', due: 'start' }, gcb_asb_02: { to: 'owner', due: 'done' },
  gcb_env_asb_notification: { to: 'agency', due: 'wd10', cite: '40 CFR 61.145(b)' },
  gcb_env_lead_notification: { to: 'agency', due: 'state-abate' },
  gcb_env_waste_log: { to: 'file', due: 'wsr35', cite: '40 CFR 61.150(d)' },
  gcb_env_clearance: { to: 'owner', due: 'done' }
};
function items(type){ return arr(ITEMS[type]).map(function(x){ return JSON.parse(JSON.stringify(x)); }); }
function meta(x){ var k = obj(KNOWN[s(x && x.doc)]); return { to: s(x && x.to) || s(k.to) || (x && x.who === 'file' ? 'file' : 'owner'), due: s(x && x.due) || s(k.due), cite: s(x && x.cite) || s(k.cite) }; }
/* the ways a paper can go out (the recipient decides) */
function channels(x){
  var m = meta(x), T = TO[m.to] || TO.owner;
  if (T.filing) return ['filed'];
  if (T.internal) return ['share'];
  var out = ['portal', 'email', 'text', 'share'];
  return out;
}

/* ── 📜 Certifications: the EPA / HUD / AHERA / OSHA types (added to patch CERTS' templates; warn 60 / 30 / 7 days) ── */
var EPA = 'https://www.epa.gov/lead', TDEC = 'https://www.tn.gov/environment/toxic-substances-program/lead-hazard-program/lead-certification.html', ADH = 'https://healthy.arkansas.gov/programs-services/topics/lead-based-paint-program', MDEQ = 'https://www.mdeq.ms.gov/lead';
function CT(t, holderType, name, issuer, cycleMonths, req, url, o){ return Object.assign({ t: t, warnDays: 60, holderType: holderType, name: name, issuer: issuer, leadDays: 0, cycleMonths: cycleMonths, fee: 0, feeNote: 'Check the agency / training provider', requirements: req + ' (EPAHUD default — confirm with your state program.)', renewUrl: url }, o || {}); }
var certTemplates = [
  CT('lead_sup_ind', 'person', 'Lead abatement supervisor (state certified)', 'State lead program (TDEC / ADH / MDEQ) — EPA-accredited course', 36, 'Initial course 32 hours; refresher 8 hours before it expires; the state certificate, not only the course certificate, lets you supervise. Arkansas ADH accepts the Seagull course for its certification.', TDEC),
  CT('lead_worker_ind', 'person', 'Lead abatement worker (state certified)', 'State lead program — EPA-accredited course', 36, 'Initial 16 hours; refresher 8 hours.', TDEC),
  CT('lead_inspector_ind', 'person', 'Lead-based paint inspector', 'State lead program — EPA-accredited course', 36, 'Initial 24 hours; refresher 8 hours.', TDEC),
  CT('lead_risk_ind', 'person', 'Lead risk assessor', 'State lead program — EPA-accredited course', 36, 'Inspector course + 16-hour risk assessor course; refresher 8 hours.', TDEC),
  CT('lead_designer_ind', 'person', 'Lead abatement project designer', 'State lead program — EPA-accredited course', 36, 'Supervisor course + 8-hour project designer course; refresher 8 hours.', TDEC),
  CT('dust_tech_ind', 'person', 'Lead dust sampling technician', 'EPA / state lead program', 60, 'Initial 8 hours; refresher every 5 years (3 if the refresher has no hands-on part) — confirm with the state program.', EPA),
  CT('asb_worker_ind', 'person', 'Asbestos abatement worker (AHERA + state license)', 'State asbestos program — AHERA-accredited course', 12, 'Initial 32 hours (AHERA); annual 8-hour refresher; state license card.', 'https://www.epa.gov/asbestos'),
  CT('asb_sup_ind', 'person', 'Asbestos abatement contractor / supervisor (AHERA + state license)', 'State asbestos program — AHERA-accredited course', 12, 'Initial 40 hours (AHERA); annual 8-hour refresher; state license card.', 'https://www.epa.gov/asbestos'),
  CT('asb_inspector_ind', 'person', 'Asbestos inspector (AHERA + state license)', 'State asbestos program — AHERA-accredited course', 12, 'Initial 24 hours (3 days); annual 4-hour refresher.', 'https://www.epa.gov/asbestos'),
  CT('asb_planner_ind', 'person', 'Asbestos management planner (AHERA)', 'AHERA-accredited course', 12, 'Inspector course + 16 hours; annual refresher (inspector 4 h + planner 4 h).', 'https://www.epa.gov/asbestos'),
  CT('asb_designer_ind', 'person', 'Asbestos project designer (AHERA)', 'AHERA-accredited course', 12, 'Initial 24 hours (or the 40-hour supervisor course); annual 8-hour refresher.', 'https://www.epa.gov/asbestos'),
  CT('asb_om_ind', 'person', 'Asbestos O&M awareness (2-hour awareness / 16-hour O&M)', 'Training provider', 12, 'OSHA 1926.1101(k)(9): 2-hour awareness for anyone who works where ACM may be disturbed; 16-hour O&M for Class III work; yearly.', 'https://www.osha.gov/asbestos'),
  CT('osha10_ind', 'person', 'OSHA 10 / OSHA 30 construction', 'OSHA Outreach trainer', 0, 'Company standard (OSHA 10 for everyone, OSHA 30 for supervisors). The card does not expire; some owners ask for one within 5 years.', 'https://www.osha.gov/training/outreach'),
  CT('fit_ind', 'person', 'Respirator fit test', 'Fit-test provider', 12, 'OSHA 1910.134(f): before first use, every 12 months and when the respirator changes. (The medical details stay in 🩺 Medical — this is the card.)', 'https://www.osha.gov/respiratory-protection'),
  CT('resp_med_ind', 'person', 'Respirator medical clearance (PLHCP written opinion)', 'Physician / PLHCP', 12, 'OSHA 1910.134(e): before the fit test and first use; again when the physician says. The opinion only — results stay in 🩺 Medical.', 'https://www.osha.gov/respiratory-protection'),
  CT('hazcom_ind', 'person', 'Hazard communication training', 'GrayCo', 12, 'OSHA 1910.1200(h): before the first job with the chemical and when a new hazard comes in (GrayCo: yearly).', 'https://www.osha.gov/hazcom'),
  CT('amrt_ind', 'person', 'IICRC AMRT (mold remediation) — company standard', 'IICRC', 12, 'TN, AR and MS have no state mold license (checked 11/2026); GrayCo standard: AMRT for mold supervisors.', 'https://iicrc.org/'),
  CT('wrt_ind', 'person', 'IICRC WRT (water damage) — company standard', 'IICRC', 12, 'Company standard for mitigation crews.', 'https://iicrc.org/'),
  CT('asb_contractor_co', 'company', 'State asbestos abatement contractor license (TN / AR / MS)', 'TDEC / Arkansas DEQ / MDEQ', 12, 'Only if GrayCo does asbestos work itself — today a licensed abatement sub does it (keep the sub\'s license on the job).', 'https://www.epa.gov/asbestos'),
  CT('neshap_acct_co', 'company', 'State asbestos notification account (TDEC / Arkansas DEQ / MDEQ)', 'State asbestos program', 0, 'The account / login used to file the 10-working-day NESHAP notice (or confirm the sub files it).', 'https://www.epa.gov/asbestos'),
  CT('pollution_co', 'company', 'Contractor\'s pollution liability insurance', 'Insurance (kept in the office — never shown to customers)', 12, 'Pollution / environmental liability coverage for lead, asbestos and mold work.', ''),
  CT('mold_lic_co', 'company', 'State mold license (only where a state requires one)', 'State program', 0, 'TN, AR and MS do not license mold remediation (checked 11/2026). Add one here if GrayCo works in a state that does.', '')
];
/* the owner's own certificates (from his training e-mails) — DRAFTS with no number until he types it from the card */
var drafts = [
  { draftId: 'EPAHUD-WJ-RRP', tpl: 'rrp_renovator', ckind: 'rrp_renovator', holderType: 'person', holder: 'wjohnson@grayco-cs.com', holderName: 'Wesley Johnson', name: 'EPA RRP Certified Renovator (initial)', issuer: 'Seagull Environmental Training', provider: 'Seagull Environmental Training', issued: '2026-11-06', courseDate: '2026-11-06', courseCity: 'Arlington, TN', state: 'TN/AR', stateAccepted: 'TN/AR', cycleMonths: 60, warnDays: 60, leadDays: 60,
    notes: 'Draft from the course e-mail — confirm the certificate number and the expiration printed on the card (5 years with the hands-on initial course). EPAHUD.' },
  { draftId: 'EPAHUD-WJ-LSUP', tpl: 'lead_sup_ind', ckind: 'lead_supervisor', holderType: 'person', holder: 'wjohnson@grayco-cs.com', holderName: 'Wesley Johnson', name: 'Lead Abatement Supervisor (initial course)', issuer: 'Seagull Environmental Training', provider: 'Seagull Environmental Training', issued: '2026-11-16', courseDate: '2026-11-16', courseCity: 'Atlanta, GA', state: 'AR', stateAccepted: 'AR', cycleMonths: 36, warnDays: 60, leadDays: 60,
    notes: 'Draft from the course e-mail — Arkansas Dept. of Health accepts this course: apply for the ADH supervisor certification, then type the ADH number and expiration here. TN / MS need their own state certificate. EPAHUD.' }
];
/* ── auto-fill: a blank row on any paper whose label the CRM knows (only an EMPTY value is filled; nothing typed is replaced) ── */
var labelMap = [
  [/^year built$/i, 'year_built'], [/^(planned )?start date$|^work start date$/i, 'start_date'], [/^(renovation )?completion date$|^date completed$/i, 'completion_date'],
  [/^(gray ?co )?certified renovator( name| \(trainer\))?$|^certified renovator$/i, 'renovator'], [/^(epa )?(renovator )?certification no\.?( \/ expiration)?$|^epa renovator certification no\. \/ expiration$/i, 'renovator_no'],
  [/firm certification (no|#)\.?$/i, 'rrp_firm_no'], [/^certified supervisor( \/ #)?$|^certified lead abatement supervisor$/i, 'supervisor'],
  [/^state$/i, 'state'], [/^occupant(s)?( name)?$|^adult occupant$/i, 'occupant'], [/^job( no\.?| #)$/i, 'po'], [/^property address$|^job address$|^address$/i, 'job_address']
];

var API = { TO: TO, EVENTS: EVENTS, FACTS: FACTS, DUE: DUE, ITEMS: ITEMS, KNOWN: KNOWN, items: items, meta: meta, channels: channels, cond: cond, due: due, events: events, stateOf: stateOf, finished: finished,
  certTemplates: certTemplates, drafts: drafts, labelMap: labelMap, workingDaysBefore: workingDaysBefore, addDays: addDays, daysBetween: daysBetween, today: today, nice: nice, fact: fact };
if (typeof module === 'object' && module.exports) module.exports = API; else root._gcEpaHudCore = API;
})(this);
