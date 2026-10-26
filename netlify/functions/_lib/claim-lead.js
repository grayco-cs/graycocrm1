/* ============================================================================
   GrayCo — A NEW CLAIM IS ALSO A LEAD.   netlify/functions/_lib/claim-lead.js     (patch CLAIMLEAD)

   Owner: "claims are also leads, so when we start to get claims in I want the leads to go in our lead inbox too
   so we can assign; assign default the senior insurance PM."

   claim-inbox.js calls newClaimLead() for a claims@ e-mail that matched NO existing claim or job. When the e-mail
   looks like a new assignment / first notice of loss / request for service, the same lead path leads@ uses
   (website-intake.js fileLead + alertLead: dedupe by id, the admins' new-lead alert, the speed-to-lead reminders)
   files a Lead Inbox item: type Insurance, source "Claims e-mail (claims@)".

   Never: mail that matched a claim (any identifier we hold: claim #, DASH / XA id, policy #, address, or a
   claim # in our projects) makes a lead; an auto-reply never gets here; nothing is sent to the sender.

   Who gets it (assigneeFor): 1) Leads ⚙ "Insurance claims go to:" (gc_lead_inbox_settings.claimsTo);
   2) the Senior Insurance PM of the lead roles (gc_team_settings.leadRoles.insurancePm);
   3) the one active person whose role / title says senior insurance PM; 4) nobody — the lead waits for an admin
   and says "Set the senior insurance PM in Lead settings".
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function alnum(v){ return low(v).replace(/[^a-z0-9]/g, ''); }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n) : v; }
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const NO_CLAIM_SET = 'Set the senior insurance PM in Lead settings';

/* ── 1. is this a NEW claim / assignment / loss notice? ── */
const NEW_RE = /\b(new\s+(claim\s+)?assignment|assignment\s+(notice|received|request|of\s+claim)|new\s+(loss|claim|work\s*order|referral)\b|first\s+notice\s+of\s+loss|fnol|notice\s+of\s+loss|loss\s+notice|please\s+(contact|call|reach\s+out\s+to)\s+(the\s+)?(insured|policyholder|homeowner|claimant)|(refer(ral|ring)|assign(ing|ed)?)\s+(of\s+)?(a\s+)?(claim|loss|job)\s+to\s+you|(request(ing)?|need(s)?|looking\s+for)\s+(a\s+)?(roof(er|ing)?|mitigation|water\s+(damage|extraction)|contractor|an?\s+estimate|an?\s+inspection|service))\b/i;
const NETWORK_RE = /contractor\s*connection|sedgwick|accuserve|alacrity|altimeter|westhill|crawford|frontline|claimsolution|xactanalysis|xactware|davies|pilot|state\s*farm|allstate|usaa|farmers|travelers|liberty\s+mutual|nationwide|erie|progressive|hartford/i;
const KINDS = ['new_assignment', 'first_notice_of_loss', 'service_request', 'existing_claim_update', 'other'];
function looksNew(mail, facts){
  facts = facts || {};
  const subj = s(mail && mail.subject), body = s(mail && mail.text).slice(0, 4000);
  const k = s(facts.mail_kind);
  if (facts.ai && KINDS.indexOf(k) >= 0) {
    if (/^(new_assignment|first_notice_of_loss|service_request)$/.test(k)) return { yes: true, kind: k, why: 'the AI read it as a ' + k.replace(/_/g, ' ') };
    return { yes: false, kind: k, why: 'the AI read it as ' + k.replace(/_/g, ' ') };
  }
  if (NEW_RE.test(subj + '\n' + body)) return { yes: true, kind: 'new_assignment', why: 'the wording is a new assignment / notice of loss' };
  return { yes: false, kind: '', why: 'nothing says this is a new claim' };
}

/* ── 2. the insured's facts: the AI's, else plain labels in the e-mail ── */
function labelled(t, re){ const m = re.exec(t); return m ? s(m[1]).replace(/[.,;]+$/, '') : ''; }
function insuredFacts(mail, facts){
  facts = facts || {}; const t = s(mail.subject) + '\n' + s(mail.text);
  const f = {
    name: s(facts.insured_name) || labelled(t, /\b(?:insured|policy\s*holder|policyholder|homeowner|claimant|customer)(?:'s)?(?:\s+name)?\s*[:\-]\s*([A-Z][A-Za-z.'\- ]{2,50}?)(?=\s*(?:\n|,|\||phone|tel|cell|e-?mail|address|$))/i),
    phone: s(facts.insured_phone) || (function(){ const m = /\b(?:insured|policy\s*holder|policyholder|homeowner|claimant|customer)[^\n]{0,60}?\b(?:phone|tel|cell|mobile|contact)[^\d\n]{0,12}(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/i.exec(t) || /\b(?:insured|policyholder|homeowner)\s*(?:phone|tel|cell|mobile)\s*(?:#|number)?\s*[:\-]?\s*(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/i.exec(t); return m ? s(m[1]) : ''; })(),
    address: s(facts.loss_address) || labelled(t, /\b(?:loss\s+(?:location|address)|property\s+address|risk\s+(?:location|address)|address\s+of\s+loss|insured\s+address|service\s+address|job\s+address)\s*[:\-]\s*([^\n]{6,120})/i),
    email: low(facts.insured_email),
    claimNumber: s(facts.claim_number), carrier: s(facts.carrier), tpa: s(facts.tpa),
    lossType: s(facts.loss_type), dateOfLoss: s(facts.date_of_loss)
  };
  if (!EMAIL.test(f.email)) f.email = '';
  return f;
}
/* "123 Main St, Memphis, TN 38104" → address / city / state / zip */
function splitAddress(a){
  a = s(a); const out = { address: a, city: '', state: '', zip: '' };
  const m = /^(.*?),\s*([A-Za-z .'-]+?),?\s+([A-Z]{2})\b\.?,?\s*(\d{5})?(?:-\d{4})?\s*$/.exec(a);
  if (m) { out.address = s(m[1]); out.city = s(m[2]); out.state = m[3]; out.zip = s(m[4]); }
  return out;
}
function street(a){ return alnum(s(a).split(',')[0]); }

/* ── 3. is it about a claim or job we already have? (then no lead) ── */
function existingJob(mail, facts, match, claims, projects){
  if (match && match.claimId) return 'matched to a claim';
  const hay = alnum(s(mail.subject) + ' ' + s(mail.text)), words = low(s(mail.subject) + ' ' + s(mail.text));
  const ids = (match && match.candidates || []).filter(c => /claim #|DASH|XactAnalysis|policy #|address|insured \+ address/.test(s(c.why)));
  if (ids.length) return 'carries ' + ids[0].why.split(' · ')[0] + ' of ' + (ids[0].title || 'a claim');
  const cn = alnum(facts && facts.claim_number);
  if (cn.length >= 5) {
    const c = arr(claims).find(x => x && x.deleted !== true && alnum(x.claimNumber) === cn);
    if (c) return 'claim # ' + s(c.claimNumber) + ' is already a claim';
  }
  const proj = arr(projects).find(p => {
    if (!p || p.deleted === true || p.id == null) return false;
    const pc = alnum(p.claimNumber || p.claimNo);
    if (pc.length >= 5 && hay.indexOf(pc) >= 0) return true;
    const ad = low(p.address).split(',')[0];
    return ad.length >= 8 && words.indexOf(ad) >= 0 && /\d/.test(ad);
  });
  return proj ? 'matches the job ' + s(proj.name || proj.id) : '';
}

/* ── 4. who gets it ── */
function isActive(u){ return !!u && u.active !== false && u.departed !== true && u.fired !== true && u.deleted !== true && !/^(terminated|inactive|former|departed|fired|deactivated|disabled)$/i.test(s(u.status)); }
function people(users, staff){
  const by = {};
  arr(users).concat(arr(staff)).forEach(u => {
    const e = low(u && u.email); if (!EMAIL.test(e)) return;
    const cur = by[e] || { email: e, name: '', role: '', profile: '', title: '', active: true };
    if (!isActive(u)) cur.active = false;
    ['name', 'role', 'profile', 'title'].forEach(k => { if (!cur[k] && s(u[k])) cur[k] = s(u[k]); });
    if (!cur.title && s(u.jobTitle)) cur.title = s(u.jobTitle);
    by[e] = cur;
  });
  return Object.keys(by).map(k => by[k]);
}
function titleCandidates(list){
  const t = p => [p.role, p.profile, p.title].map(s).join(' ');
  const ins = list.filter(p => p.active && /insur/i.test(t(p)) && /(\bpm\b|project\s*manager|manager|lead)/i.test(t(p)));
  if (ins.length <= 1) return ins;
  const sr = ins.filter(p => /\b(senior|sr\.?)\b/i.test(t(p)));
  return sr.length ? sr : ins;
}
/* → { name, email, source: 'setting' | 'lead-roles' | 'title' | '', why } */
function assigneeFor(settings, team, users, staff){
  const list = people(users, staff), by = {}; list.forEach(p => { by[p.email] = p; });
  const set = settings && settings.claimsTo, em = low(set && set.email);
  if (em && EMAIL.test(em)) {
    const p = by[em];
    if (!p || p.active) return { name: (p && p.name) || s(set.name) || em, email: em, source: 'setting', why: 'Lead settings: Insurance claims go to' };
  }
  try {
    const LR = require('./lead-roles.js'), h = LR.holder('insurance', team, list);
    if (h && h.email) return { name: h.name, email: h.email, source: 'lead-roles', why: 'the Senior Insurance PM (lead roles)' };
  } catch (e) {}
  const t = titleCandidates(list);
  if (t.length === 1) return { name: t[0].name || t[0].email, email: t[0].email, source: 'title', why: 'their role / title is senior insurance PM' };
  return { name: '', email: '', source: '', why: NO_CLAIM_SET };
}

/* ── 5. the same claim never makes two leads (claim #, phone, address) ── */
function findDup(items, c){
  const cn = alnum(c.claimNumber), ph = phone10(c.phone), st = street(c.address);
  for (const it of arr(items)) {
    if (!it || it.stub) continue;
    const x = it.leadExtra || {};
    const icn = alnum(it.claimNumber || x.claimNumber);
    if (cn.length >= 5 && icn === cn) return { id: it.id, by: 'claim #' };
    const ip = phone10(it.contact && it.contact.phone);
    if (ph.length === 10 && ip === ph) return { id: it.id, by: 'phone' };
    const ia = street(it.address);
    if (st.length >= 8 && /\d/.test(st) && ia === st) return { id: it.id, by: 'address' };
  }
  return null;
}

/* ── 6. the whole thing ── */
/* env: { kv(key) → value from gc_kv, WI: website-intake _lib, L: bid-inbox _lib, staff() }
   in: { mail, facts, match, files (stored refs), claims, projects, inboxId } */
async function newClaimLead(env, inp){
  const { mail, facts, match } = inp;
  const H = mail.headers || {};
  if (H['list-unsubscribe'] || /^(bulk|list|junk)$/i.test(s(H.precedence))) return { made: false, why: 'bulk / list mail' };
  const why = existingJob(mail, facts, match, inp.claims, inp.projects);
  if (why) return { made: false, why: 'existing claim — ' + why };
  const nw = looksNew(mail, facts);
  if (!nw.yes) return { made: false, why: nw.why };
  const c = insuredFacts(mail, facts), loc = splitAddress(c.address);
  if (!c.name && !c.phone && !c.address && !c.email) return { made: false, why: 'new claim, but no insured name, phone or address could be read' };
  const L = env.L, WI = env.WI;
  const items = arr(await L.kvGet(L.KV));
  const dup = findDup(items, { claimNumber: c.claimNumber, phone: c.phone, address: loc.address });
  const at = new Date().toISOString();
  const emailRow = { id: s(mail.id), from: mail.from.email, fromName: mail.from.name, subject: mail.subject, date: mail.date || at, snippet: s(mail.text).slice(0, 1200), claimInboxId: inp.inboxId };
  if (dup) {
    /* put this e-mail on the lead we already have (only a lead made from claims@ e-mail) */
    try { await L.kvCas(L.KV, v => { const list = arr(v); const x = list.find(y => y && y.id === dup.id); if (!x || /^claims/.test(s(x.origin)) === false || arr(x.emails).some(e => e && e.id && e.id === emailRow.id)) return undefined; x.emails = arr(x.emails).concat([emailRow]).slice(-40); x.emailIds = arr(x.emailIds).concat(emailRow.id ? [emailRow.id] : []).slice(-60); return list; }); } catch (e) {}
    return { made: false, duplicate: true, id: dup.id, why: 'already a lead (same ' + dup.by + ')' };
  }
  const settings = await L.kvGet(L.KV_SET), team = await env.kv('gc_team_settings'), users = await env.kv('users'), staff = env.staff ? await env.staff() : [];
  const who = assigneeFor(settings, team, users, staff);
  const files = arr(inp.files).filter(f => f && f.ref).map(f => ({ ref: f.ref, name: f.name, type: f.type, size: f.size, hash: s(f.ref).replace(/^.*\//, '').replace(/\.[^.]+$/, ''), kind: f.kind || 'claim-doc', at }));
  const sid = 'claims@|' + (alnum(c.claimNumber).length >= 5 ? 'cn:' + alnum(c.claimNumber) : phone10(c.phone).length === 10 ? 'ph:' + phone10(c.phone) : street(loc.address).length >= 8 ? 'ad:' + street(loc.address) : 'mail:' + s(mail.id || mail.subject + mail.date));
  const notes = ['Insurance claim — new ' + (nw.kind || 'assignment').replace(/_/g, ' ') + ' from claims@grayco-cs.com, ' + at.slice(0, 16).replace('T', ' ') + ' UTC (' + nw.why + ').'];
  if (c.claimNumber) notes.push('Claim #: ' + c.claimNumber);
  if (c.carrier) notes.push('Carrier: ' + c.carrier);
  if (c.tpa) notes.push('TPA / network: ' + c.tpa);
  if (c.lossType) notes.push('Loss type: ' + c.lossType);
  if (c.dateOfLoss) notes.push('Date of loss: ' + c.dateOfLoss);
  if (s(facts.adjuster_name) || s(facts.adjuster_phone) || s(facts.adjuster_email)) notes.push('Adjuster: ' + [facts.adjuster_name, facts.adjuster_phone, facts.adjuster_email].map(s).filter(Boolean).join(' · '));
  notes.push('From: ' + (mail.from.name ? mail.from.name + ' ' : '') + '<' + mail.from.email + '> — "' + clip(mail.subject, 120) + '"');
  if (files.length) notes.push(files.length + ' attachment' + (files.length > 1 ? 's' : '') + ' kept on the lead.');
  notes.push(who.email ? 'Assigned to ' + who.name + ' (' + who.why + ').' : NO_CLAIM_SET + ' — until then an admin assigns this lead.');
  const f = { type: 'storm', name: c.name, email: c.email, phone: c.phone, address: loc.address, city: loc.city, state: loc.state, zip: loc.zip,
    message: clip(s(facts.summary) || s(mail.text), 600), service: c.lossType, carrier: c.carrier || c.tpa, claimNumber: c.claimNumber, damageDate: c.dateOfLoss, claimFiled: 'Yes', company: '' };
  const where = s(loc.address).split(',')[0] || loc.city;
  const patch = { origin: 'claims', sourceKind: 'claims-email', websiteLead: false, websiteForm: '', type: 'insurance', isInsurance: true,
    claimNumber: c.claimNumber, carrier: c.carrier, tpa: c.tpa, lossType: c.lossType, dateOfLoss: c.dateOfLoss,
    files, emails: [emailRow], emailIds: s(mail.id) ? [mail.id] : [], claimInboxId: inp.inboxId };
  if (who.email) Object.assign(patch, { pm: who.name, pmEmail: who.email, assignedBy: 'Auto · Insurance claims', assignedAt: at, autoAssignedAt: at, leadRole: 'insurance' });
  const r = await WI.fileLead(f, { sid, source: 'Claims e-mail (claims@)', how: 'from an e-mail to claims@grayco-cs.com', formLabel: 'Insurance claim', notes: notes.slice(1).concat([]),
    title: ['Insurance claim', c.name, where, c.claimNumber ? '#' + c.claimNumber : ''].filter(Boolean).join(' — '), patch,
    leadExtra: { unassigned: !who.email, claimNumber: c.claimNumber, carrier: c.carrier, tpa: c.tpa, lossType: c.lossType, dateOfLoss: c.dateOfLoss, insurance: 'yes', claimInboxId: inp.inboxId, claimsAssignee: who.source, needsPm: !who.email ? NO_CLAIM_SET : '' }, customer: null });
  let alerts = null;
  if (r.action === 'added' && s(process.env.CLAIM_LEAD_ALERTS) !== '0') { try { alerts = await WI.alertLead(r.rec); } catch (e) { alerts = { error: s(e && e.message) }; } }
  return { made: r.action === 'added', id: r.id, action: r.action, assignedTo: who.email ? { name: who.name, email: who.email, source: who.source } : null, warning: who.email ? '' : NO_CLAIM_SET, alerts };
}
module.exports = { looksNew, insuredFacts, splitAddress, existingJob, assigneeFor, findDup, newClaimLead, people, titleCandidates, NO_CLAIM_SET, KINDS };
