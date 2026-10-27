/* ── GrayCo lead or the PM's own lead? (patch SRC) ─────────────────────────────────────────────
   Owner (10/22): "Every job that comes in our CRM and is divvied out is a GrayCo lead. If the job comes in
   from GrayCo Photos (CompanyCam) without being in the CRM first, then it is that PM's lead (a different pay
   scale). All RoofScout leads: if they have the same address as a lead made in GrayCo Photos or CompanyCam,
   then they would be qualified as a GrayCo lead."

   ONE rule, used by the server (companycam-sync, lead-source.js) and mirrored in the CRM page
   (window._gcLeadSource, same code inlined):
     • A job that came in through the company (website, leads@, bids / bid boards, partner API, missed call,
       referral program, marketing events, the Lead Inbox, a lead the office or an admin typed, a converted
       lead) → GrayCo lead.
     • A job that FIRST appeared as a GrayCo Photos / CompanyCam project made by a PM (or a job the PM typed in
       himself) → that PM's own lead — unless an earlier record exists at the same street address:
         – a RoofScout lead made before it, or
         – a CRM lead / Lead Inbox item / job / customer made before it (not the PM's own CompanyCam job)
       → then it is a GrayCo lead. Earliest record wins.
     • No PM (an unmapped CompanyCam creator, the Senior PM standing in) → GrayCo lead.
   It never changes pay on its own: the callers apply it to NEW jobs only; jobs that already exist are listed
   for an admin to review (Admin → warnings → "Lead source to review").
   Values: commissionSource 'company' (GrayCo) | 'self' (the PM's own) — what the commission engine reads. */
'use strict';

const SUFFIX = { street: 'st', st: 'st', road: 'rd', rd: 'rd', avenue: 'ave', ave: 'ave', av: 'ave', drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct',
  boulevard: 'blvd', blvd: 'blvd', highway: 'hwy', hwy: 'hwy', place: 'pl', pl: 'pl', circle: 'cir', cir: 'cir', parkway: 'pkwy', pkwy: 'pkwy', cove: 'cv', cv: 'cv',
  terrace: 'ter', ter: 'ter', trail: 'trl', trl: 'trl', way: 'way', north: 'n', n: 'n', south: 's', s: 's', east: 'e', e: 'e', west: 'w', w: 'w' };
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
/* "123 N. Main Street, Bartlett TN" → "123nmainst" (same as companycam-sync) */
function normAddr(a){
  const line = low(a).split(',')[0].replace(/[.#]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!line || !/\d/.test(line)) return '';
  return line.split(' ').map(function(w){ return SUFFIX[w] || w; }).join('');
}
function ms(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const n = Number(v); if (isFinite(n) && s(v) !== '') return n < 1e12 ? n * 1000 : n;
  const d = Date.parse(v); return isNaN(d) ? 0 : d;
}
function bornAt(r){
  if (!r) return 0;
  const cand = [r.createdAt, r.created_at, r.receivedAt, r.created, r.dateAdded, r.ccCreatedAt, r.leadExtra && r.leadExtra.receivedAt].map(ms).filter(function(x){ return x > 0; });
  return cand.length ? Math.min.apply(null, cand) : 0;
}
function ymd(t){ try { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear(); } catch (e) { return ''; } }
function addrOf(r){ return s(r && (r.address || r.jobAddress || r.siteAddress || r.street || r.propertyAddress || (r.leadExtra && r.leadExtra.address) || (r.data && r.data.address))); }

/* how the job came in: 'cc' (GrayCo Photos / CompanyCam, made there first), 'pm' (a PM typed it in himself),
   'company' (any company intake, a converted lead, the office/admin) */
const INTAKE = /website|lead inbox|leads@|inbox|partner|referr|missed call|roof ?ignite|contractor connection|alacrity|sedgwick|homeadvisor|angi|thumbtack|google|facebook|bid|board|planhub|buildingconnected|sam\.gov|giveaway|roof ?check|event|coupon|news|marketing|roofscout|grayco/i;
function isCcJob(j){ return !!j && (/^PRJcc_\d+$/.test(s(j.id)) || j._ccAuto === true || j._ccImported === true || low(j.source) === 'companycam'); }
function originOf(j){
  if (!j) return 'company';
  if (j.leadId || j.fromLead || j.fromLeadId || j.inboxId || j.leadInboxId || j.convertedFrom || j.partnerId) return 'company';
  if (isCcJob(j)) return 'cc';
  const by = low(j.enteredBy || j.createdBy), pm = low(j.pm);
  if (pm && by && by === pm) return 'pm';
  if (j.selfGenerated === true && !INTAKE.test(s(j.source) + ' ' + s(j.origin))) return 'pm';
  return 'company';
}
function pmOf(j){ return s(j && (j.broughtInBy || j.pm || j.owner)); }
/* real sign of a company intake on the job (a lead / inbox / partner link, or a named intake as its source);
   a bare "grayco" source is the CRM's default and says nothing */
function hasIntake(j){
  if (!j) return false;
  if (j.leadId || j.fromLead || j.fromLeadId || j.inboxId || j.leadInboxId || j.convertedFrom || j.partnerId) return true;
  const t = (s(j.source) + ' ' + s(j.origin) + ' ' + s(j.leadSource)).replace(/\bgrayco\b/ig, ' ');
  return INTAKE.test(t);
}
/* the owners, admins and office (a job they type in is the company's, as in the pay resolver) */
function adminsFrom(users){
  return arr(users).filter(function(u){ return u && u.name && (low(u.payType) === 'owner' || /admin|office/i.test(s(u.role))); }).map(function(u){ return low(u.name); });
}

/* ctx: { records: [{ kind, id, name, address, at, cc, pm }], roofscout: [{ id, address, at }] }
   (records = CRM leads, Lead Inbox items, jobs, customers; cc = it is itself a PM's CompanyCam job)
   → { source: 'company'|'self', pm, reason, origin, evidence } */
function classify(job, ctx){
  ctx = ctx || {};
  const j = job || {};
  if (j.leadSourceOverride && /^(company|self)$/.test(s(j.leadSourceOverride.source))) {
    const o = j.leadSourceOverride;
    return { source: o.source, pm: o.source === 'self' ? (s(o.pm) || pmOf(j)) : '', origin: 'override', reason: 'Set by ' + (s(o.by) || 'an admin') + (o.at ? ' ' + ymd(ms(o.at)) : '') + (o.note ? ': ' + s(o.note) : ''), evidence: null };
  }
  const origin = originOf(j);
  if (origin === 'company') {
    const via = s(j.leadSource || j.source || j.origin);
    return { source: 'company', pm: '', origin, reason: hasIntake(j) ? 'GrayCo lead — came in through ' + (via && !/^self/i.test(via) && !/^grayco$/i.test(via) ? via : 'the company (a lead / the Lead Inbox)') : 'GrayCo lead — entered in the CRM (not first a PM’s GrayCo Photos project)', evidence: null };
  }
  const pm = pmOf(j);
  if (!pm || j.pmBy === 'senior-pm') return { source: 'company', pm: '', origin, reason: 'GrayCo lead — no PM of its own (the Senior PM runs it)', evidence: null };
  if (origin === 'pm' && arr(ctx.admins).indexOf(low(pm)) >= 0) return { source: 'company', pm: '', origin, reason: 'GrayCo lead — entered by the office (' + pm + ')', evidence: null };
  const at = bornAt(j) || Date.now();
  const a = normAddr(addrOf(j));
  const SLACK = 60 * 1000;   /* a record made in the same minute is the same event, not "earlier" */
  let best = null;
  if (a.length >= 6) {
    arr(ctx.roofscout).forEach(function(r){
      const t = ms(r.at || r.created_at); if (!t || t >= at - SLACK) return;
      if (normAddr(r.address) !== a) return;
      if (!best || t < best.at) best = { kind: 'roofscout', id: s(r.id), at: t, label: 'RoofScout lead ' + ymd(t) + ' at the same address' };
    });
    arr(ctx.records).forEach(function(r){
      if (!r || s(r.id) === s(j.id)) return;
      const t = ms(r.at); if (!t || t >= at - SLACK) return;
      if (normAddr(r.address) !== a) return;
      if (r.cc && low(r.pm) === low(pm)) return;      /* his own earlier CompanyCam job is not a company record */
      if (r.own && low(r.pm) === low(pm)) return;     /* nor a job he typed in himself */
      if (!best || t < best.at) best = { kind: s(r.kind) || 'record', id: s(r.id), at: t, label: (s(r.kind) || 'record') + ' "' + (s(r.name) || s(r.id)) + '" in the CRM since ' + ymd(t) + ' at the same address' };
    });
  }
  if (best) return { source: 'company', pm: '', origin, reason: 'GrayCo lead — ' + best.label, evidence: best };
  return { source: 'self', pm: pm, origin, reason: pm + '’s own lead — ' + (origin === 'cc' ? 'created in GrayCo Photos' : 'entered in the CRM') + ' by ' + pm + ' ' + ymd(at) + ', no earlier record at that address', evidence: null };
}
/* the fields a classification writes on a job (what the pay engines read: commissionSource for the commission
   reports, graycoOrigin / leadIsMine for the pay-structure resolver) */
function fieldsFor(c, at){
  const stamp = at || new Date().toISOString();
  if (c.source === 'self') return { commissionSource: 'self', pmSourced: true, selfGenerated: true, broughtInBy: c.pm, leadSource: 'Self-generated (' + c.pm + ')', graycoOrigin: false, leadIsMine: true, leadSourceWhy: c.reason, leadSourceAt: stamp, leadSourceV: 1 };
  return { commissionSource: 'company', pmSourced: false, selfGenerated: false, broughtInBy: '', leadSource: 'GrayCo', graycoOrigin: true, leadIsMine: false, leadSourceWhy: c.reason, leadSourceAt: stamp, leadSourceV: 1 };
}
/* what the job says now: 'company' | 'self' | '' (nothing on it — the engines then read it as GrayCo).
   ov = the admins' per-job choice map (gc_kv gc_job_source: { jobId: 'self'|'company' }) */
function storedOf(j, ov){
  if (!j) return '';
  const o = ov && ov[j.id];
  if (o === 'self') return 'self';
  if (o === 'company' || o === 'gray') return 'company';
  const cs = low(j.commissionSource);
  if (cs === 'self') return 'self';
  if (cs === 'company' || cs === 'grayco') return 'company';
  if (j.graycoOrigin === true || j.assignedByAdmin === true) return 'company';
  if (j.pmSourced === true || j.leadIsMine === true || j.ownLead === true || j.leadType === 'pm') return 'self';
  if (/\b(own|self|my lead|pm companycam|pm lead)\b/i.test(s(j.leadSource))) return 'self';
  return '';
}
/* build the "records" list from the CRM's lists */
function recordsFrom(lists){
  lists = lists || {};
  const out = [];
  arr(lists.projects).forEach(function(r){ if (r && r.id && r.deleted !== true) out.push({ kind: 'job', id: s(r.id), name: s(r.name), address: addrOf(r), at: bornAt(r), cc: isCcJob(r) && storedOf(r) === 'self', own: originOf(r) === 'pm', pm: pmOf(r) }); });
  arr(lists.leads).forEach(function(r){ if (r && r.id && r.deleted !== true) out.push({ kind: 'lead', id: s(r.id), name: s(r.name || r.title), address: addrOf(r), at: bornAt(r), own: originOf(r) === 'pm', pm: pmOf(r) }); });
  arr(lists.inbox).forEach(function(r){ if (r && r.id && !r.stub) out.push({ kind: 'Lead Inbox item', id: s(r.id), name: s(r.title || r.name), address: addrOf(r), at: bornAt(r) }); });
  arr(lists.customers).forEach(function(r){ if (r && (r.id || r.name)) out.push({ kind: 'customer', id: s(r.id || r.name), name: s(r.name || r.company), address: addrOf(r), at: bornAt(r) }); });
  return out;
}
/* RoofScout rows (rs_leads: { id, data, created_at }) → [{ id, address, at }]; demo and do-not-contact rows left out */
function roofscoutFrom(rows){
  return arr(rows).filter(function(x){ const d = (x && x.data) || {}; return x && !(d.demo === true || /^DEMO\s/.test(s(d.name)) || d.doNotContact === true || d.dnc === true); })
    .map(function(x){ const d = x.data || {}; return { id: s(x.id), address: s(d.address), at: x.created_at || d.createdAt }; });
}
const CLOSED = /^(completed?|closed|lost|cancell?ed|done|archived|dead|declined|paid)$/i;
/* open jobs whose stored source differs from the rule (read-only; for the admin's review list) */
function reviewList(lists, rs, opts){
  opts = opts || {};
  const ov = opts.jobSource || {};
  const recs = recordsFrom(lists), out = [];
  arr(lists.projects).forEach(function(j){
    if (!j || !j.id || j.deleted === true || CLOSED.test(s(j.status))) return;
    if (j.leadSourceOverride || ov[j.id]) return;   /* an admin already set this one by hand */
    const c = classify(j, { records: recs, roofscout: rs, admins: opts.admins });
    const st = storedOf(j);
    if (st === c.source || (!st && c.source === 'company')) return;   /* no source yet reads as GrayCo in the engine */
    if (c.origin === 'company' && !hasIntake(j)) return;   /* nothing on the job says where it came from: a person's choice stands */
    const kept = j.leadSourceReview;
    if (kept && kept.kept === st && kept.computed === c.source) return;   /* an admin already chose "Keep" for this */
    out.push({ id: s(j.id), name: s(j.name), address: addrOf(j), po: s(j.autoPO || j.po), pm: s(j.pm), stored: st || '(none)', computed: c.source, computedPm: c.pm, reason: c.reason, evidence: c.evidence });
  });
  return out;
}

module.exports = { classify, fieldsFor, storedOf, recordsFrom, roofscoutFrom, reviewList, adminsFrom, hasIntake, normAddr, originOf, isCcJob, bornAt, ms };
