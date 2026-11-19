/* ============================================================================
   GrayCo — 📱 TEXT ALERTS TO STAFF CELL PHONES (patch SMSALERT).   netlify/functions/_lib/smsalert.js

   Owner 10/28: "is there a way for our cell phones to get grayco texts also, if so add that in something i can turn
   on for each person for each type of leads admin etc".

   Admin → ⚙ Admin settings → 📱 Text alerts to cell phones: one row per staff person (their cell, editable), a master
   on/off, quiet hours (default 9 PM–7 AM Central; emergencies ignore them) and one switch per alert type:
     cust      Customer texts to the GrayCo number — 'off' | 'mine' (their own jobs / texts routed to them) | 'all'
     newAll    New leads (all)          newMine   New leads assigned to me      emerg   Emergency leads (water / fire / storm)
     missed    Missed calls (screened callers)       subs      Sub texts
     approvals Approvals waiting for me (one daily summary at most)
     system    Admin / system alerts (backup / health failures) — admins only (checked again at send time)
   Settings: service-only gc_lead_inbox_kv "gc_sms_alerts" (written by texts.js ?alerts=1, admins only).
   State:    gc_lead_inbox_kv "gc_sms_alerts_state" (rate limit, burst counts, the last alert per staff phone, held alerts).

   Sending (from TWILIO_FROM_ALERTS, else TWILIO_FROM — about 1¢ a text):
     · never while data-entry mode is on (_lib/pause), never to a phone that texted STOP (the gc_sms_state opt-out list);
     · quiet hours: nothing (an emergency still goes; a system alert is held until the next morning run);
       owner 10/28 "SMSALERT: quiet hours follow business hours": quiet = outside the 📞 Call order business hours
       (_lib/callorder.js isOpen — default Mon–Fri 7 AM–6 PM Central, weekends / holidays closed) OR inside the
       person's own window (default 9 PM–7 AM; the only rule when the call order can't be read). Held lead / text /
       missed-call alerts are not sent later (the e-mail covers them); only emergencies text after hours;
     · at most 1 text per person per minute per thread — the rest are counted and the next text says "+3 more";
     · ≤ 300 characters: "GrayCo: …" + a deep link. Only a name / short job name + the message excerpt — nothing else.
   Replying from the cell: a staff phone in this table that texts the GrayCo number within 30 minutes of an alert that
   has a reply-to (a customer / sub text, a missed call, a lead that texted or called) → the text goes to that person
   from the GrayCo number, signed with the employee's first name, and is posted on Job Messages as from that employee.
   A staff phone in this table NEVER becomes a lead (missed-call.js asks staffInbound() first).
   ========================================================================== */
'use strict';
const KEY = 'gc_sms_alerts';
const SKEY = 'gc_sms_alerts_state';
const RATE_MS = 60 * 1000;
const REPLY_MS = 30 * 60 * 1000;
const MAX = 300;
const TYPES = [
  { id: 'cust', label: 'Customer texts', choice: true },
  { id: 'newAll', label: 'New leads (all)' },
  { id: 'newMine', label: 'New leads assigned to me' },
  { id: 'emerg', label: 'Emergency leads (water / fire / storm)' },
  { id: 'missed', label: 'Missed calls (screened callers)' },
  { id: 'subs', label: 'Sub texts' },
  { id: 'approvals', label: 'Approvals waiting for me (daily summary)' },
  { id: 'system', label: 'Admin / system alerts (admins only)', adminOnly: true }
];
const BOOL_TYPES = TYPES.filter(t => !t.choice).map(t => t.id);
const START = /^\s*(start|unstop)\s*[.!]*\s*$/i;
/* owner 10/28 defaults (used until an admin saves the card): Owner 1 + Owner 2 (OWNERROLE — by role, _lib/owners.js) get emergencies +
   every new lead (a customer text that makes a lead is a new lead); the mitigation manager role (whoever holds it — none yet → skipped)
   gets emergencies. Phones come from their CRM people records. Everyone else off. */
const ROLE_MIT = 'role:mitigation';
const DEFAULT_PEOPLE = {};   /* OWNERROLE: the owners are added at run time (defaultPeople) — no e-mail here */
DEFAULT_PEOPLE[ROLE_MIT] = { on: true, name: 'Mitigation manager', emerg: true, qOff: true };
function defaultPeople(){ const o = {}; OWN.forEach(x => { o[x.email] = { on: true, name: x.name, emerg: true, newAll: true }; }); o[ROLE_MIT] = DEFAULT_PEOPLE[ROLE_MIT]; return o; }

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function clip(v, n){ v = s(v).replace(/\s+/g, ' '); return v.length > n ? v.slice(0, Math.max(0, n - 1)) + '…' : v; }
function env(k){ return s(process.env[k]); }
function staffEmail(e){ return /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(low(e)); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function hourOf(v, d){ const n = parseInt(v, 10); return isFinite(n) && n >= 0 && n <= 23 ? n : d; }

/* ── dependencies (tests swap these) ── */
function L(){ return require('../bid-inbox.js')._lib; }
function LWc(){ return require('./lead-watch.js'); }   /* LEADWATCH: what a lead is, its clock */
function MC(){ return require('../missed-call.js')._test; }
function core(){ return require('../portal.js')._core; }
const _D = {
  now: () => Date.now(),
  kvGet: k => L().kvGet(k),
  kvCas: (k, f) => L().kvCas(k, f),
  send: (to10, body, from, tag) => require('./custquiet.js').run(tag || 'staff', () => MC().sendSms(to10, body, from)),   /* patch CUSTQUIET: alerts go to staff cells (not held); a reply relayed to a customer is tagged by the caller */
  /* the saved 📞 Call order business hours (defaults when never saved); null when it can't be read → per-person window only */
  hours: async () => { try { const CO = require('./callorder.js'); const raw = await _D.kvGet(CO.KEY); return (raw && typeof raw === 'object' ? CO.clean(raw) : CO.defaults()).hours || null; } catch (e) { return null; } },
  paused: async () => { try { return await require('./pause').isPaused(); } catch (e) { return true; } },
  optouts: async () => { try { const st = await MC().stateGet(); return st && st.optout && typeof st.optout === 'object' ? st.optout : {}; } catch (e) { return {}; } },
  consentNo: async ph => { try { return (await require('./smsconsent.js').live(ph)) === 'no'; } catch (e) { return false; } },
  people: async () => {   /* the CRM's people list + gc_staff (role) */
    let users = [], staff = [];
    try { users = arr((await core().kvRead(['users'])).users); } catch (e) {}
    try { const r = await L().sb('gc_staff?select=email,name,role,active'); if (r && r.ok) staff = arr(await r.json()); } catch (e) {}
    return { users, staff };
  },
  /* the reply from a cell → Job Messages (as from the employee) + the 💬 timeline + "their reply comes back to this employee" */
  /* patch EMERGCALL (claude/callchain): a reply to an emergency alert text acknowledges it — no escalation calls (optional module) */
  ack: async (leadId, why) => { let EC = null; try { EC = require('./emergcall.js'); } catch (e) { return { skipped: 'no emergcall' }; }
    if (!EC || typeof EC.make !== 'function') return { skipped: 'no emergcall' };
    return EC.make({ env: k => s(process.env[k]), now: () => _D.now(), kvGet: k => _D.kvGet(k), kvCas: (k, f) => _D.kvCas(k, f) }).ack(leadId, why); },
  /* LSATEXT: GOOD / BAD texted back → the lead inbox item, gc_kv "gc_lsa_decisions" (the CRM page marks its lead), the office To-Do */
  lsaDecide: async d => {
    const at = new Date(_D.now()).toISOString(), out = { inbox: false, list: false, todo: false };
    try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v); const x = l.find(y => y && s(y.id) === s(d.leadId)); if (!x) return undefined;
      if (s(d.notes)) { const dt = new Date(_D.now()), line = '[' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + s(d.by) + '] ' + s(d.notes);   /* LSANOTES — owner 11/10: just the note (no "good lead" words) */
        if (Array.isArray(x.notes)) x.notes = x.notes.concat([line]); else x.notes = (s(x.notes) ? s(x.notes) + '\n' : '') + line; }
      x.lsaCheck = d.noAnswer ? 'no_answer' : d.good ? 'good' : 'bad'; x.leadExtra = Object.assign({}, obj(x.leadExtra), { lsaCheck: x.lsaCheck }); x.lsaDecidedBy = d.by; x.lsaDecidedAt = at; x.lsaVia = 'text';
      if (!d.noAnswer && !s(x.contactedAt)) { x.contactedAt = at; x.contactedBy = s(d.by) + ' (text)'; } else if (d.noAnswer) x.lastAttemptAt = at;   /* NODUP: they called — no "reach out" reminders */
      if (d.noAnswer) { x.noAnswerAt = at; x.noAnswerCount = (+x.noAnswerCount || 0) + 1; }
      else if (!d.good) { x.lsaReason = d.reason; x.lostReason = (d.isLsa === false ? 'Not a real lead (' : 'LSA — not a real lead (') + d.reason + ')'; }
      if (d.good && d.pm && d.pm.name && !(d.keepPm && s(x.pm) && low(x.pmEmail) === low(d.pm.email))) {   /* LSAPM: the PM texted with GOOD (LSASEND: a PM's own GOOD on his lead changes nothing here) */
        x.pm = d.pm.name; x.pmEmail = low(d.pm.email); x.assignedBy = s(d.by) + ' (text)'; x.assignedAt = at; x.assignConfirmed = true; x.leadRole = x.leadRole || 'insurance';
        if (x.hold) x.hold = Object.assign({}, x.hold, { state: 'approved', name: d.pm.name, email: low(d.pm.email), doneAt: at, doneBy: s(d.by) + ' (text)' });
        if (x.status === 'new') x.status = 'imported';
        x.rev = (x.rev || 1) + 1; x.updatedAt = at; out.assigned = Object.assign({}, x);
      }
      out.inbox = true; return l; }); } catch (e) {}
    if (out.assigned) { try { out.notified = await L().alertsApi().notifyAssigned(Object.assign({}, out.assigned, { id: s(out.assigned.leadId) || ('LEADIN-' + s(out.assigned.id).replace(/^LI-/, '')) }), { by: s(d.byEmail) }); } catch (e) { out.notified = { error: s(e && e.message) }; } out.assigned = true; }
    try { const C = core(), row = { id: s(d.leadId), isLsa: d.isLsa !== false, notes: s(d.notes).slice(0, 600), noAnswer: !!d.noAnswer, good: !!d.good, reason: s(d.reason), by: s(d.by), byEmail: s(d.byEmail), at, code: s(d.code), name: s(d.name), phone: s(d.phone), pm: d.pm ? s(d.pm.name) : '', pmEmail: d.pm ? low(d.pm.email) : '' };
      const has = l => l.some(x => x && s(x.id) === row.id && x.at === at);
      const w = await C.kvListUpdate('gc_lsa_decisions', l => ({ list: l.filter(x => x && s(x.id) !== row.id).concat([row]).slice(-500), check: has })); out.list = !!(w && w.ok); } catch (e) {}
    if (d.noAnswer) { try { out.todo = await core().officeTodo('LSACALLBACK_' + s(d.leadId) + '_' + at.slice(0, 10), '📞 Call back ' + clip(d.name || tidy(d.phone), 40) + (d.phone ? ' ' + tidy(d.phone) : '') + ' (Google LSA — no answer)',
      s(d.by) + ' texted NO ANSWER' + (d.reason ? ' (' + s(d.reason) + ')' : '') + '. Not a bad lead — call again, then mark it 👍 / 👎 on the lead (or text GOOD / BAD ' + s(d.code) + ').'); } catch (e) {} return out; }
    if (d.good) { try { await _D.tasksDone(['LSA25_' + s(d.leadId)], 'marked good by ' + s(d.by)); } catch (e) {} }   /* LSAFLOW2: qualified */
    if (!d.good && d.isLsa !== false && !d.noTodo) { try { const by = new Date(_D.now() + LSA_DISPUTE_WINDOW_H * 3600e3), byS = mdhOf(+by);   /* LEADWATCH: Google's 48 hours */
      out.todo = await core().officeTodo('LSADISPUTE_' + s(d.leadId), '⚖️ Dispute ' + clip(d.name || tidy(d.phone), 40) + ' (Google LSA) in Google Ads by ' + byS,
        s(d.by) + ' texted BAD: ' + s(d.reason) + '. Open ' + (s(d.link) || 'https://ads.google.com/localservices/leads') + ' → find ' + (d.phone ? tidy(d.phone) : d.name) + ' → Dispute lead (pick the reason). Office or marketing can do it.'); } catch (e) {} }
    return out;
  },
  /* LSASEND: the lead is the PM's (not yet good) → inbox + gc_lsa_decisions (the CRM page) + the normal "assigned" notice */
  lsaSend: async d => {
    const at = new Date(_D.now()).toISOString(), out = { inbox: false, list: false };
    let it = null;
    try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v); const x = l.find(y => y && s(y.id) === s(d.leadId)); if (!x) return undefined;
      x.pm = d.pm.name; x.pmEmail = low(d.pm.email); x.assignedBy = s(d.by) + ' (text: send to PM)'; x.assignedAt = at; x.lsaSentTo = d.pm.name; x.lsaSentAt = at;
      if (x.hold) x.hold = Object.assign({}, x.hold, { state: 'approved', name: d.pm.name, email: low(d.pm.email), doneAt: at, doneBy: s(d.by) + ' (text)' });
      if (s(d.notes)) { const dt = new Date(_D.now()), line = '[' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + s(d.by) + '] ' + s(d.notes); if (Array.isArray(x.notes)) x.notes = x.notes.concat([line]); else x.notes = (s(x.notes) ? s(x.notes) + '\n' : '') + line; }
      if (x.status === 'new') x.status = 'imported';
      x.rev = (x.rev || 1) + 1; x.updatedAt = at; it = Object.assign({}, x); out.inbox = true; return l; }); } catch (e) {}
    try { const row = { id: s(d.leadId), sent: true, pm: s(d.pm.name), pmEmail: low(d.pm.email), notes: s(d.notes).slice(0, 600), by: s(d.by), byEmail: s(d.byEmail), at, code: s(d.code), name: s(d.name), phone: s(d.phone) };
      const w = await core().kvListUpdate('gc_lsa_decisions', l => ({ list: l.filter(x => x && !(s(x.id) === row.id && x.sent)).concat([row]).slice(-500), check: l2 => l2.some(x => x && s(x.id) === row.id && x.at === at) })); out.list = !!(w && w.ok); } catch (e) {}
    if (it) { try { out.notified = await L().alertsApi().notifyAssigned(Object.assign({}, it, { id: s(it.leadId) || ('LEADIN-' + s(it.id).replace(/^LI-/, '')) }), { by: s(d.byEmail) }); } catch (e) {} }
    return out;
  },
  /* LSAFLOW2 (owner 11/19): the lead inbox item (read only) */
  inboxLead: async id => { try { return arr(await _D.kvGet('gc_lead_inbox')).find(y => y && s(y.id) === s(id)) || null; } catch (e) { return null; } },
  inboxAll: async () => { try { return arr(await _D.kvGet('gc_lead_inbox')); } catch (e) { return []; } },
  /* LSAFLOW2: "Disputed in Google ✓" on the inbox item (first one wins) + gc_lsa_decisions (the CRM page marks its lead) → { already, item } */
  lsaDisputed: async d => {
    const at = new Date(_D.now()).toISOString(), out = { already: false, inbox: false, list: false }; let it = null;
    try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v); const x = l.find(y => y && s(y.id) === s(d.leadId)); if (!x) return undefined;
      if (s(x.lsaDisputedAt)) { out.already = true; it = Object.assign({}, x); return undefined; }
      x.lsaDisputedAt = at; x.lsaDisputedBy = s(d.by); x.lsaCheck = 'bad'; x.leadExtra = Object.assign({}, obj(x.leadExtra), { lsaCheck: 'bad', lsaDisputedAt: at });
      if (!s(x.lsaReason)) x.lsaReason = 'disputed in Google';
      x.rev = (x.rev || 1) + 1; x.updatedAt = at; it = Object.assign({}, x); out.inbox = true; return l; }); } catch (e) {}
    out.item = it; if (out.already || !it) return out;
    try { const row = { id: s(d.leadId), isLsa: true, good: false, reason: s(it.lsaReason), notes: '', by: s(it.lsaDecidedBy) || s(d.by), byEmail: s(d.byEmail), at, code: s(d.code), name: s(d.name), phone: s(d.phone), disputed: true, disputedAt: at, disputedBy: s(d.by) };
      const w = await core().kvListUpdate('gc_lsa_decisions', l => ({ list: l.filter(x => x && s(x.id) !== row.id).concat([row]).slice(-500), check: l2 => l2.some(x => x && s(x.id) === row.id && x.at === at) })); out.list = !!(w && w.ok); } catch (e) {}
    return out;
  },
  /* LSAFLOW2: an office To-Do (once per id; a closed one with the same id is opened again) */
  officeTask: async o => { const at = new Date(_D.now()).toISOString(); let added = false;
    const w = await core().kvListUpdate('gc_office_tasks', l => { const cur = l.find(x => x && x.id === o.id); if (cur && !cur.done) return null;
      added = true; const item = Object.assign({ assignees: ['office'], prio: 'high', addedBy: 'Google LSA', addedAt: at, updatedAt: at, done: false }, o);
      return { list: cur ? l.map(x => x === cur ? item : x) : l.concat([item]), check: l2 => l2.some(x => x && x.id === o.id && !x.done) }; });
    return { ok: !!(w && w.ok), added }; },
  /* LSAFLOW2: close these office To-Dos (the first one to dispute closes the others') */
  tasksDone: async (ids, why) => { const at = new Date(_D.now()).toISOString(), want = {}; (ids || []).forEach(id => { if (s(id)) want[s(id)] = 1; }); let n = 0;
    const w = await core().kvListUpdate('gc_office_tasks', l => { n = 0; l.forEach(x => { if (x && want[s(x.id)] && !x.done) { x.done = true; x.doneAt = x.updatedAt = at; x.resolution = clip(why, 120); n++; } }); return n ? { list: l, check: l2 => l2.every(y => !(y && want[s(y.id)] && !y.done)) } : null; });
    return { ok: !!(w && w.ok), closed: n }; },
  jobs: () => core().kvRead(['projects', 'gc_deleted_projects']),   /* JOBNOTE */
  /* LEADWATCH: the customer's portal link for the PM (made if the job has none; nothing goes to the customer; the job's access rules decide) */
  portalLink: async pid => { const C = core(); let data = {}; try { data = await C.kvRead(['projects']); } catch (e) {} const job = arr(data.projects).find(p => p && s(p.id) === s(pid)); if (!job) return '';
    try { if (C.jaAllows && !C.jaAllows(data, job, 'portalLink')) return ''; } catch (e) {} const row = await C.activeFor(s(pid)); const tok = row ? row.token : await C.createFor(s(pid), 'LEADWATCH: PM lead text'); return tok ? C.linkFor(null, tok) : ''; },
  /* LEADTXT: which of these leads are closed in the lead inbox already (👍 / 👎 in the CRM, dismissed, merged) → { id: why }; read only */
  closedLeads: async ids => { const want = {}, out = {}; arr((ids || []).map(id => ({ id: s(id) }))).forEach(o => { if (o.id) want[o.id] = 1; });
    try { arr(await _D.kvGet('gc_lead_inbox')).forEach(x => { const id = s(x.id); if (!want[id]) return; const c = low(x.lsaCheck || obj(x.leadExtra).lsaCheck), st = low(x.status);
      if (c === 'good' || c === 'bad') out[id] = c; else if (st === 'dismissed' || st === 'merged') out[id] = st; }); } catch (e) {}
    return out; },
  /* TEXTLOG (owner 11/10: "everything we do in GrayCo text is in the CRM too"): every GrayCo text sent / answered → gc_kv "gc_text_log"
     (newest 1500); the CRM page puts each one on its lead's activity (index.html LSATEXT textLog) */
  textLog: async row => { const w = await core().kvListUpdate('gc_text_log', l => ({ list: l.concat([row]).slice(-1500), check: l2 => l2.some(x => x && x.id === row.id) })); return !!(w && w.ok); },
  /* LSAINTAKE: "📞 Google call — fill in the lead" for the office (To-Do + a phone push); closed by the intake / an assignment */
  intakeTodo: async o => { const id = 'LSAIN_' + o.leadId, at = new Date(_D.now()).toISOString(); let added = false;
    const w = await core().kvListUpdate('gc_office_tasks', l => l.some(x => x && x.id === id) ? null : (added = true, { list: l.concat([{ id, kind: 'lsa_intake', leadId: o.leadId, code: o.code, label: (o.em ? '🚨 ' : '') + '📞 Google call — notes for the owners (optional): ' + o.name + (phone10(o.phone).length === 10 ? ' ' + tidy(o.phone) : ''), note: (o.said ? o.said + '\n' : '') + 'Optional: Leads → 📞 Google calls → 📝 Notes — what they need, the address. The owners already have the text and assign the PM; this holds nothing up.', assignees: ['office'], prio: 'normal', due: at.slice(0, 10), addedBy: 'Google LSA', addedAt: at, updatedAt: at, done: false }]), check: l2 => l2.some(x => x && x.id === id) }));
    let pushed = null; if (added) { try { const pp = await _D.people(); const em = officeEmails(pp); if (em.length) pushed = await require('./staffpush.js').send(em, { title: '📞 Google call — notes (optional)', body: clip(o.name + (phone10(o.phone).length === 10 ? ' ' + tidy(o.phone) : '') + (o.said ? ' — ' + o.said : ''), 170), url: site() + '/#leads&lead=' + encodeURIComponent(o.leadId) + '&intake=1', tag: 'lsa-in-' + o.leadId }); } catch (e) { pushed = { error: s(e && e.message) }; } }
    return { todo: !!(w && w.ok), pushed }; },
  intakeDone: async (leadId, why) => { const id = 'LSAIN_' + leadId, at = new Date(_D.now()).toISOString();
    const w = await core().kvListUpdate('gc_office_tasks', l => { const x = l.find(y => y && y.id === id); if (!x || x.done) return null; x.done = true; x.doneAt = x.updatedAt = at; x.resolution = clip(why, 120); return { list: l, check: l2 => l2.some(y => y && y.id === id && y.done) }; });
    return !!(w && w.ok); },
  vetTodo: async o => { const id = 'LSAVET_' + o.leadId, at = new Date(_D.now()).toISOString();   /* LSAVET: the office checks a Google LSA call */
    const w = await core().kvListUpdate('gc_office_tasks', l => l.some(x => x && x.id === id) ? null : { list: l.concat([{ id, kind: 'lsa_vet', leadId: o.leadId, label: '📞 Google LSA call — real lead? ' + o.name, note: (o.said ? o.said + '\n' : '') + 'Look up the number in the office phone\'s recent calls (585). Leads → 📞 Google LSA calls to check → type the number → ✅ Real lead (the owners get a text to call) or 🚫 Junk (no text).', assignees: ['office'], prio: 'high', due: at.slice(0, 10), addedBy: 'Google LSA', addedAt: at, updatedAt: at, done: false }]), check: l2 => l2.some(x => x && x.id === id) });
    return !!(w && w.ok); },
  textAppt: async row => { const w = await core().kvListUpdate('gc_text_appts', l => ({ list: l.concat([row]).slice(-1000), check: l2 => l2.some(x => x && x.id === row.id) })); return !!(w && w.ok); },   /* APPTTEXT */
  textNote: async row => { const w = await core().kvListUpdate('gc_text_notes', l => ({ list: l.concat([row]).slice(-1000), check: l2 => l2.some(x => x && x.id === row.id) })); return !!(w && w.ok); },
  lsaVerified: async leadId => { let ok = false; try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v); const x = l.find(y => y && s(y.id) === s(leadId)); if (!x) return undefined; x.lsaVerified = new Date(_D.now()).toISOString(); x.leadExtra = Object.assign({}, obj(x.leadExtra), { lsaVerified: x.lsaVerified }); ok = true; return l; }); } catch (e) {} return ok; },   /* LSAFLOW */
  postReply: async m => {
    const msg = { id: m.id, pid: m.pid || '', authorId: low(m.email), authorName: s(m.name || m.email) + ' 📱 (text to ' + tidy(m.to) + ', from cell)', text: m.text, tags: [], at: m.at, source: 'sms', channel: 'sms', dir: 'out', smsTo: m.to, viaCell: true };
    const has = l => l.some(x => x && s(x.id) === msg.id);
    try { await core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has }); } catch (e) {}
    if (m.pid) { try { await require('./comms.js').addMessage(m.pid, { id: 'sms_' + m.id, kind: 'text', dir: 'out', at: m.at, from: low(m.email), fromName: s(m.name), to: [tidy(m.to)], text: m.text }); } catch (e) {} }
    try { await require('./textlead.js').onOutbound({ ph: m.to, text: m.text, who: s(m.name) + ' (from cell)', id: m.id }); } catch (e) {}   /* patch TEXTLEAD */
    try { await MC().stateCas(x => { x.lastOut = x.lastOut && typeof x.lastOut === 'object' ? x.lastOut : {}; x.lastOut[m.to] = { email: low(m.email), name: s(m.name), pid: m.pid || '', at: m.at }; return true; }); } catch (e) {}
    return msg;
  }
};
function now(){ return _D.now(); }

/* ── settings ── */
function cleanPerson(p){
  p = obj(p);
  const out = { on: !!p.on, name: clip(p.name, 60), phone: phone10(p.phone).length === 10 ? phone10(p.phone) : '',
    cust: /^(off|mine|all)$/.test(s(p.cust)) ? s(p.cust) : 'off',
    qOff: !!p.qOff, qFrom: hourOf(p.qFrom, 21), qTo: hourOf(p.qTo, 7) };
  BOOL_TYPES.forEach(t => { out[t] = !!p[t]; });
  return out;
}
function settings(v){
  const o = obj(v), out = { people: {} };
  const saved = !!(s(o.at) || Object.keys(obj(o.people)).length);
  const ppl = saved ? obj(o.people) : defaultPeople();
  if (!saved) out.defaults = true;
  Object.keys(ppl).slice(0, 200).forEach(e => { if (staffEmail(e) || e === ROLE_MIT) out.people[low(e)] = cleanPerson(ppl[e]); });
  if (s(o.by)) out.by = low(o.by).slice(0, 120);
  if (s(o.at)) out.at = s(o.at).slice(0, 40);
  return out;
}
/* staff people (active, @grayco-cs.com) with their phone and whether they are an admin */
/* LSAINTAKE: who "the office" is for a push: active staff whose role / title says office (OWNERROLE: by role — no address in the code) */
function officeEmails(pp){ const out = [], roleOf = {}; arr(pp && pp.staff).forEach(r => { if (r && r.email) roleOf[low(r.email)] = s(r.role); });
  arr(pp && pp.users).forEach(u => { const e = low(u && u.email); if (!staffEmail(e) || !isActiveUser(u)) return; if (/office|admin\s*assist|reception/i.test([u.role, u.title, u.profile, roleOf[e]].map(s).join(' ')) && out.indexOf(e) < 0) out.push(e); });
  arr(pp && pp.staff).forEach(r => { const e = low(r && r.email); if (e && r.active !== false && /office/i.test(s(r.role)) && out.indexOf(e) < 0) out.push(e); });
  return out; }
function isActiveUser(u){ try { return require('./people.js').isActive(u); } catch (e) { return u.active !== false && !u.departed; } }
/* OWNERROLE: Owner 1 / Owner 2 by role (_lib/owners.js; Admin → Team roles), refreshed by loadOwners() at every entry point —
   no names or e-mails in the code. They are admins already; this keeps them so even when gc_staff is slow. */
let OWN = [];
function ownerEmails(){ return OWN.map(x => x.email); }
async function loadOwners(pp){
  try { if (!pp) pp = await _D.people(); let saved = null; try { saved = await _D.kvGet(require('./owners.js').KEY); } catch (e) { saved = null; }
    OWN = require('./owners.js').resolve(arr(pp && pp.users), arr(pp && pp.staff), saved); } catch (e) {}
  return OWN.slice();
}
function staffList(pp){
  pp = pp || {};
  const by = {}, owners = ownerEmails();
  arr(pp.users).forEach(u => {
    const e = low(u.email); if (!staffEmail(e) || !isActiveUser(u)) return;
    by[e] = { email: e, name: s(u.name) || e, phone: phone10(u.cell || u.mobile || u.phone || u.cellPhone), admin: /^admin$/i.test(s(u.role)) || low(u.payType) === 'owner' };
  });
  arr(pp.staff).forEach(r => {
    const e = low(r.email); if (!staffEmail(e)) return;
    if (r.active === false) { delete by[e]; return; }
    const x = by[e] || (by[e] = { email: e, name: s(r.name) || e, phone: '', admin: false });
    if (low(r.role) === 'admin') x.admin = true;
  });
  owners.forEach(e => { if (by[e]) by[e].admin = true; });
  Object.keys(by).forEach(e => { if (by[e].phone.length !== 10) by[e].phone = ''; });
  return Object.keys(by).map(e => by[e]).sort((a, b) => a.name.localeCompare(b.name));
}
async function load(){ await loadOwners(); try { return settings(await _D.kvGet(KEY)); } catch (e) { return settings(null); } }   /* OWNERROLE: the owners first (the defaults are theirs) */
/* the mitigation manager(s) — whoever holds the role (title / role / profile says mitigation + manager); none → [] */
function mitigationHolders(pp){
  let ems = []; try { ems = require('./emergency.js').mitigationMgrs(arr((pp || {}).users)); } catch (e) {}
  const list = staffList(pp), by = {}; list.forEach(x => { by[x.email] = x; });
  return ems.map(low).filter((e, i, l) => l.indexOf(e) === i && by[e]).map(e => by[e]);
}
/* everyone who can get a text now: [{ key, email, phone, p }] — a person's own cell from the card, else from their CRM record;
   the mitigation-manager row → its holder(s) (merged with their own row: either one's switches count) */
function resolve(set, pp){
  const list = staffList(pp), by = {}, out = {};
  list.forEach(x => { by[x.email] = x; });
  Object.keys(set.people).forEach(k => {
    if (k === ROLE_MIT) return;
    const p = set.people[k], x = by[k]; if (!x) return;
    const phone = p.phone || x.phone; if (!p.on || phone.length !== 10) return;
    out[k] = { key: k, email: k, phone, p: p.name ? p : Object.assign({}, p, { name: x.name }) };   /* TEXTEDPM: the text log names the person */
  });
  const rp = set.people[ROLE_MIT];
  if (rp && rp.on) mitigationHolders(pp).forEach(x => {
    const phone = rp.phone || x.phone; if (phone.length !== 10) return;
    if (out[x.email]) { const m = Object.assign({}, out[x.email].p); BOOL_TYPES.forEach(t2 => { m[t2] = m[t2] || rp[t2]; }); out[x.email].p = m; }
    else out[x.email] = { key: ROLE_MIT, email: x.email, phone, p: rp };
  });
  return Object.keys(out).map(k => out[k]);
}
/* admins only (texts.js checks who): cleaned, an admin-only switch kept only for admins */
async function save(v, by){
  const pp = await _D.people(), list = staffList(pp), admin = {}, known = {};
  list.forEach(x => { known[x.email] = 1; if (x.admin) admin[x.email] = 1; });
  const set = settings(v);
  Object.keys(set.people).forEach(e => {
    if (e === ROLE_MIT) { const r = set.people[e]; BOOL_TYPES.forEach(t2 => { if (t2 !== 'emerg') r[t2] = false; }); r.cust = 'off'; return; }   /* the role row: emergencies only */
    if (!known[e]) { delete set.people[e]; return; } if (!admin[e]) set.people[e].system = false; });
  delete set.defaults;
  set.by = low(by); set.at = new Date(now()).toISOString();
  await _D.kvCas(KEY, () => set);
  return set;
}

/* ── quiet hours (Central) ── */
function centralHour(ms){
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date(ms)), 10) % 24; }
  catch (e) { return new Date(ms - 6 * 3600e3).getUTCHours(); }
}
function centralDay(ms){ try { return new Date(ms).toLocaleString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 10); } catch (e) { return new Date(ms - 6 * 3600e3).toISOString().slice(0, 10); } }
function inQuiet(p, ms){
  if (p.qOff || p.qFrom === p.qTo) return false;
  const h = centralHour(ms);
  return p.qFrom > p.qTo ? (h >= p.qFrom || h < p.qTo) : (h >= p.qFrom && h < p.qTo);
}
/* quiet right now for this person: outside business hours (hours = the call order's, null → unknown) or in their own window */
function quietNow(p, ms, hours){
  if (hours) { try { if (!require('./callorder.js').isOpen(ms, { hours })) return true; } catch (e) {} }   /* after hours: always (owner rule) */
  return !p.qOff && inQuiet(p, ms);   /* + the person's own window (switchable) */
}

/* who wants this alert. o = { type, mine: [emails], emergency } */
function wants(p, email, o, isAdmin){
  const mine = (o.mine || []).map(low).indexOf(email) >= 0;
  switch (o.type) {
    case 'cust': return p.cust === 'all' || (p.cust === 'mine' && mine) || (!!o.emergency && p.emerg);
    case 'subs': return p.subs || (!!o.emergency && p.emerg);
    case 'lead': return p.newAll || (p.newMine && mine) || (!!o.emergency && p.emerg);
    case 'assigned': return p.newMine && mine;
    case 'missed': return p.missed;
    case 'approvals': return p.approvals && mine;
    case 'system': return p.system && isAdmin;
    default: return false;
  }
}
function compose(more, text, link, head0, bare){
  link = s(link).replace(/^https?:\/\//, '');   /* JOBLINK (owner 11/10: "all alerts for jobs on the other number can have the CRM link"): a small blue link, no preview card */
  const head = s(head0 || 'GrayCo') + (more ? ' (+' + more + ' more)' : '') + ': ';
  const tail = link ? (bare ? ' ' : ' Open: ') + link : '';
  return head + clip(text, Math.max(20, MAX - head.length - tail.length)) + tail;
}
function loadState(v){
  const st = obj(v);
  ['last', 'reply', 'daily', 'held', 'seen', 'hint', 'lsa', 'lsaCust', 'lsaPm', 'firstLead', 'emq', 'lsa25', 'lsaPmTx'].forEach(k => { st[k] = obj(st[k]); });   /* LSAFLOW2: + lsa25 (the day-25 alert, once), lsaPmTx (the PM's lead text, once per PM) */   /* EMQ: + emq */   /* LSATEXT: + lsa; LSAFLOW: + lsaCust, lsaPm */
  const t = now();
  Object.keys(st.last).forEach(k => { if (t - Date.parse(st.last[k].at || 0) > 86400000) delete st.last[k]; });
  Object.keys(st.reply).forEach(k => { if (t - Date.parse(st.reply[k].at || 0) > REPLY_MS) delete st.reply[k]; });
  Object.keys(st.seen).forEach(k => { if (t - Date.parse(st.seen[k] || 0) > 3 * 86400000) delete st.seen[k]; });
  Object.keys(st.hint).forEach(k => { if (t - Date.parse(st.hint[k] || 0) > 86400000) delete st.hint[k]; });
  Object.keys(st.lsa).forEach(k => { st.lsa[k] = arr(st.lsa[k]).filter(x => x && t - Date.parse(x.at || 0) < LSA_MS); if (!st.lsa[k].length) delete st.lsa[k]; });   /* LSATEXT */
  Object.keys(st.lsaCust).forEach(k => { if (t - Date.parse(st.lsaCust[k].at || 0) > 7 * 86400000) delete st.lsaCust[k]; });
  Object.keys(st.daily).forEach(k => { if (s(st.daily[k]) < centralDay(t - 3 * 86400000)) delete st.daily[k]; });
  Object.keys(st.emq).forEach(k => { if (t - Date.parse(st.emq[k].at || 0) > 2 * 86400000) delete st.emq[k]; });   /* EMQ */
  ['lsa25', 'lsaPmTx'].forEach(n => Object.keys(st[n]).forEach(k => { if (t - Date.parse(obj(st[n][k]).at || 0) > 45 * 86400000) delete st[n][k]; }));   /* LSAFLOW2 */
  return st;
}
function fromNum(){ return env('TWILIO_FROM_ALERTS') || env('TWILIO_FROM'); }
/* LEADNUM (owner 11/10: "what stays is the lead text"): the lead texts (new leads, LSA, GOOD / BAD / SEND / NA and their confirmations)
   stay on the main GrayCo number; every other staff alert (customer / sub texts, missed calls, approvals, system) uses
   TWILIO_FROM_ALERTS when it is set */
function leadNum(){ return env('TWILIO_FROM') || fromNum(); }
/* TEXTLOG: every send goes through here — the text is logged for the CRM (never blocks the send) */
let TLN = 0;
async function tlog(row){ try { row.id = row.id || ('T' + now().toString(36) + '_' + (++TLN).toString(36) + Math.random().toString(36).slice(2, 6)); row.at = row.at || new Date(now()).toISOString(); row.text = clip(row.text, 600); if (!row.leadId) { const m = /^GrayCo: ([A-HJ-NP-Z2-9]{4}) /.exec(s(row.text)); if (m) row.code = m[1]; } await _D.textLog(row); } catch (e) {} }
async function sendL(ph, body, from, tag, ctx){
  const r = await _D.send(ph, body, from, tag);
  if (r && r.ok) await tlog(Object.assign({ dir: 'out', phone: phone10(ph), text: body, kind: tag || 'staff' }, ctx || {}));
  return r;
}

/* ── one alert to everyone who wants it ──
   o = { type, text, link, thread, mine, emergency, daily, replyTo: { phone, pid, name } | null, hold } */
async function notify(o){
  o = o || {};
  const out = { sent: 0, to: [], skipped: {} };
  if (env('SMS_ALERTS_OFF') === '1') return Object.assign(out, { off: true });
  const set = await load();
  if (!Object.keys(set.people).some(k => set.people[k].on) && !Array.isArray(o.only)) return out;
  let pp = {}; try { pp = await _D.people(); } catch (e) { pp = {}; }
  const R = {}; resolve(set, pp).forEach(r => { R[r.email] = r; });
  const admins = {}; staffList(pp).forEach(x => { if (x.admin) admins[x.email] = 1; });
  let want = Object.keys(R).filter(e => wants(R[e].p, e, o, !!admins[e]));
  if (Array.isArray(o.only)) {   /* patch SUBALERT: a sub bid goes only to its estimator(s) — by their CRM cell even before they are on the text list */
    const only = o.only.map(low), sl = {}; staffList(pp).forEach(x => { sl[x.email] = x; });
    only.forEach(e => { if (!R[e] && sl[e] && sl[e].phone) { const sp = set.people[e]; if (!sp || sp.on !== false) R[e] = { key: e, email: e, phone: sl[e].phone, p: Object.assign({ on: true, newAll: true, name: sl[e].name }, sp || {}) }; } });
    want = Object.keys(R).filter(e => only.indexOf(e) >= 0);
  }
  /* LEADWATCH: people found by role who are not on the staff list (e.g. the marketing manager on another domain) — their own cell */
  arr(o.direct).forEach(d => { const e = low(d.email) || ('direct:' + phone10(d.phone)), ph = phone10(d.phone); if (ph.length !== 10) return; if (!R[e]) R[e] = { key: e, email: e, phone: ph, p: { on: true, name: s(d.name) } }; if (want.indexOf(e) < 0) want.push(e); });
  /* AWAY: an admin on 🏖 Away gets no text alerts — an alert meant only for them goes to their cover (an "any admin" one: the
     other admin is on it already); an emergency still reaches them (safety) */
  if (!o.emergency) { try { const AW = require('./away.js'), am = await AW.activeNow(now()); if (Object.keys(am).length) {
    const sl = {}; staffList(pp).forEach(x => { sl[x.email] = x; });
    want = AW.redirect(want, am);
    want.forEach(e => { if (!R[e] && sl[e] && sl[e].phone) { const sp = set.people[e]; if (!sp || sp.on !== false) R[e] = { key: e, email: e, phone: sl[e].phone, p: Object.assign({ on: true, name: sl[e].name }, sp || {}) }; } });
    want = want.filter(e => R[e]);
  } } catch (e) {} }
  if (!want.length) return out;
  /* patch AUTOPANEL: staff text alerts are a safety switch (default ON); data-entry mode no longer stops them — they go to
     staff cells, tagged 'staff', which _lib/pause.js lets through */
  if (!(await require('./automations.js').isOn('staff_text_alerts'))) return Object.assign(out, await require('./automations.js').held('staff_text_alerts', want.length, [s(o.type)]));
  const opt = await _D.optouts();
  let hours = null; if (!o.emergency && !o.sqOnly) { try { hours = await _D.hours(); } catch (e) { hours = null; } }   /* patch JOBMSG: sqOnly = only the staff quiet hours (a team message at 6 PM / on a Saturday goes) */
  const t = now(), at = new Date(t).toISOString(), day = centralDay(t), thread = s(o.thread) || o.type;
  /* QUIET (owner 11/16: "From 9 [PM] – 6 [AM] only call-outs and emergency notifications go through; all else wait until 7 AM"):
     inside the staff quiet window (_lib/staffquiet.js, default 9 PM → 7 AM, an admin setting) every non-emergency text is HELD
     (sent by flushHeld once the window is over), not dropped */
  let sqNow = false; if (!o.emergency) { try { const SQ = require('./staffquiet.js'); sqNow = SQ.quiet(t, await SQ.settings()); } catch (e) { sqNow = false; } }
  /* LSAHOLD (owner 11/19: "After hours Google texts should wait until 7am too, only emergencies text after hours"; supersedes LSA247):
     every non-emergency lead text — Google LSA too — outside the 📞 Call order open hours waits and goes out at 7:00 AM Central on the next
     open day (flushHeld, one bundled text when there are several). ⚡ Automations "LSA after-hours: hold to 7 AM" (lsa_hold_7am, ON) OFF →
     a Google LSA text goes at once, day or night, as LSA247 did. Emergencies always go at once. */
  let lsaNow = false; if (!o.emergency && o.lsa && o.lsa.isLsa) { try { lsaNow = !(await require('./automations.js').isOn(HOLD_KEY)); } catch (e) { lsaNow = false; } }
  const morning = !o.emergency && hours ? sevenOk(t, hours) : false;
  const go = [], skip = { optout: [], quiet: [], rate: [], daily: [], held: [] };
  /* claim each person (rate limit / daily / burst count) — recomputed on every kvCas retry */
  await _D.kvCas(SKEY, v => {
    const st = loadState(v); go.length = 0; Object.keys(skip).forEach(k => { skip[k] = []; });
    want.forEach(e => {
      const p = Object.assign({}, R[e].p, { phone: R[e].phone, name: R[e].p.name || e });
      if (opt[p.phone]) { skip.optout.push(e); return; }
      /* OVERNIGHT (owner 11/10: "I don't want texts after hours unless emergency … we get the 7 AM texts the next morning for overnight leads"):
         every lead text (LSA too) waits outside business hours / quiet hours and goes out when the office opens; emergencies go now */
      if (!o.emergency && !lsaNow && (sqNow || (quietNow(p, t, hours) && !(morning && (o.type === 'lead' || o.lsa) && !(!p.qOff && inQuiet(p, t)))))) {
        if (o.hold || o.type === 'lead' || sqNow) { const l = Array.isArray(st.held[e]) ? st.held[e] : []; const body0 = typeof o.body === 'function' ? o.body(0, { newbie: true, email: e }) : o.text;
          if (l.length < 25 && !l.some(x => x.text === o.text)) l.push({ at, text: clip(o.text, 200), body: clip(body0, 600), link: s(o.link), kind: s(o.type), lsa: o.lsa || null, from: (o.type === 'lead' || o.lsa) ? 'lead' : 'alert', sq: o.sqOnly ? true : undefined });   /* patch JOBMSG: sq = sent once the staff quiet hours end (7 AM) */ st.held[e] = l; skip.held.push(e); }
        else skip.quiet.push(e);
        return;
      }
      if (o.daily) { const dk = e + '|' + thread; if (st.daily[dk] === day) { skip.daily.push(e); return; } st.daily[dk] = day; }
      const k = e + '|' + thread, last = st.last[k];
      if (last && t - Date.parse(last.at || 0) < RATE_MS) { last.more = (last.more || 0) + 1; skip.rate.push(e); return; }
      if (o.type === 'lead' && !st.firstLead[e]) st.firstLead[e] = at;   /* HOWTO: when this person got their first lead text */
      go.push({ email: e, phone: p.phone, name: p.name, more: last ? last.more || 0 : 0, newbie: o.type === 'lead' && t - Date.parse(st.firstLead[e] || at) < HOWTO_MS });
      st.last[k] = { at, more: 0 };
    });
    return st;
  });
  Object.keys(skip).forEach(k => { if (skip[k].length) out.skipped[k] = skip[k].slice(); });
  for (const g of go) {
    const body = typeof o.body === 'function' ? o.body(g.more, g) : compose(g.more, o.text, o.link);
    let r = { ok: false }; try { r = await sendL(g.phone, body, (o.type === 'lead' || o.lsa) ? leadNum() : fromNum(), undefined, { who: g.name, leadId: s((o.lsa && o.lsa.leadId) || (o.replyTo && o.replyTo.leadId) || o.leadId), code: s(o.lsa && o.lsa.code), type: s(o.type) }); } catch (e) { r = { ok: false, why: s(e && e.message) }; }
    if (r && r.ok) { out.sent++; out.to.push(g.email); }
    else { out.failed = (out.failed || 0) + 1; }
  }
  if ((out.sent || out.skipped.held) && o.lsa && o.lsa.isLsa && !o.lsa.fu) {   /* LSADIRECT: what the first text already carried (no follow-up for it) */
    const body0 = s(typeof o.body === 'function' ? o.body(0, { newbie: false }) : o.text), lid = s(o.lsa.leadId);
    await _D.kvCas(SKEY, v => { const st = loadState(v); st.lsaFu = obj(st.lsaFu); const mk = obj(st.lsaFu[lid]);
      st.lsaFu[lid] = Object.assign({}, mk, { phone: mk.phone || phone10(o.lsa.phone).length === 10, rec: mk.rec || /▶/.test(body0), sum: mk.sum || /📝/.test(body0), at: mk.at || at }); return st; }).catch(() => {});
  }
  if (out.sent && o.lsa) {   /* LSATEXT: the phones that got this LSA lead can answer GOOD / BAD (72 h) */
    const adm = lsaAdmins(), ph2 = go.filter(g => out.to.indexOf(g.email) >= 0 && (!o.lsa.adminsOnly || adm.indexOf(low(g.email)) >= 0)).map(g => g.phone);   /* LEADTXT: an emergency / NEW LEAD code answers from the admins' cells only */
    await _D.kvCas(SKEY, v => { const st = loadState(v); ph2.forEach(ph => { const l0 = arr(st.lsa[ph]), was = l0.find(x => x.leadId === o.lsa.leadId), l = l0.filter(x => x.leadId !== o.lsa.leadId);
      l.push(Object.assign({ at }, o.lsa, was && was.done && !('done' in o.lsa) ? { done: was.done } : {})); st.lsa[ph] = l.slice(-12); }); return st; }).catch(() => {});   /* LEADTXT: a later text about an answered lead (the customer wrote back) keeps it answered */
  }
  if (out.sent && o.replyTo && (phone10(o.replyTo.phone).length === 10 || s(o.replyTo.leadId))) {
    const rt = { at, to: phone10(o.replyTo.phone).length === 10 ? phone10(o.replyTo.phone) : '', pid: s(o.replyTo.pid), name: clip(o.replyTo.name, 60), kind: o.type,
      leadId: s(o.replyTo.leadId), emergency: !!o.emergency };
    const phones = go.filter(g => out.to.indexOf(g.email) >= 0).map(g => ({ phone: g.phone, email: g.email, name: g.name }));
    await _D.kvCas(SKEY, v => { const st = loadState(v); phones.forEach(x => { st.reply[x.phone] = Object.assign({ email: x.email, staff: x.name }, rt); }); return st; }).catch(() => {});
  }
  return out;
}
/* held (quiet-hours) system alerts: sent on the next daytime run (crm-health daily) */
async function flushHeld(){
  const set = await load(), t = now();
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const R = {}; resolve(set, pp).forEach(r => { R[r.email] = Object.assign({}, r.p, { phone: r.phone }); });
  let held = {};
  let hours = null; try { hours = await _D.hours(); } catch (e) { hours = null; }
  /* OVERNIGHT: held lead texts go when the office opens (business hours) and the person's own quiet window is over */
  let sqNow = false; try { const SQ = require('./staffquiet.js'); sqNow = SQ.quiet(t, await SQ.settings()); } catch (e) { sqNow = false; }   /* QUIET: nothing before 7 AM */
  /* patch JOBMSG: an item marked sq (a team message on a job) waits only for the staff quiet hours (and the person's own window), not
     for business hours; its person may have no 📱 Text alerts row — their CRM cell is used (a row switched off = nobody) */
  const SL = {}; staffList(pp).forEach(x => { SL[x.email] = x; });
  const sqP = e => { if (R[e]) return R[e]; const x = SL[e], sp = set.people[e]; return x && x.phone && (!sp || sp.on !== false) ? { on: true, name: x.name, phone: x.phone } : null; };
  const morning = hours ? sevenOk(t, hours) : false;   /* LSAHOLD: lead texts go at 7:00 AM on an open day */
  await _D.kvCas(SKEY, v => { const st = loadState(v); held = {}; Object.keys(st.held).forEach(e => { if (sqNow) return;
    const p = R[e], ps = sqP(e), l = arr(st.held[e]);
    const open = p ? !quietNow(p, t, hours) : false, leadOk = p ? (open || (morning && !(!p.qOff && inQuiet(p, t)))) : false, sqOk = !!ps && !(!ps.qOff && inQuiet(ps, t));
    const go = l.filter(x => x.sq ? sqOk : (x.from === 'lead' ? leadOk : open)), keep = l.filter(x => go.indexOf(x) < 0);
    if (go.length) { held[e] = go; if (keep.length) st.held[e] = keep; else delete st.held[e]; if (!R[e] && ps) R[e] = ps; } });
    return Object.keys(held).length ? st : undefined; });
  const out = { sent: 0 };
  if (!Object.keys(held).length) return out;
  if (!(await require('./automations.js').isOn('staff_text_alerts'))) return Object.assign(out, { held: 'staff_text_alerts' });   /* patch AUTOPANEL (staff texts go in data-entry mode) */
  const opt = await _D.optouts();
  for (const e of Object.keys(held)) {
    const p = R[e]; if (opt[p.phone]) continue;
    const all = arr(held[e]), leadsH = all.filter(x => x.from === 'lead'), sys = all.filter(x => x.from !== 'lead');
    /* OVERNIGHT: each overnight lead as its own text (the same text it would have been, with its reply code), oldest first
       LSAHOLD (owner 11/19): several → ONE bundled text (a line per lead with its code; one reply answers them all: "BAD K7Q2, GOOD ABCD Pat") */
    const bundles = leadsH.length > 1 ? bundleTexts(leadsH) : null;
    if (bundles) {
      let ok1 = false;
      for (const b of bundles) { let r = null; try { r = await sendL(p.phone, b, leadNum(), undefined, { who: p.name, type: 'lead', overnight: true, bundle: leadsH.length }); } catch (e2) {} if (r && r.ok) { out.sent++; ok1 = true; } }
      if (ok1) { const ph = p.phone; const mine = leadsH.filter(x => x.lsa && (!x.lsa.adminsOnly || lsaAdmins().indexOf(low(e)) >= 0)); if (mine.length) await _D.kvCas(SKEY, v => { const st = loadState(v); let l = arr(st.lsa[ph]);
        mine.forEach(x => { const was = l.find(y => y.leadId === x.lsa.leadId); l = l.filter(y => y.leadId !== x.lsa.leadId); l.push(Object.assign({}, x.lsa, { at: new Date(now()).toISOString() }, was && was.done && !('done' in x.lsa) ? { done: was.done } : {})); }); st.lsa[ph] = l.slice(-12); return st; }).catch(() => {}); }
    }
    for (const x of (bundles ? [] : leadsH)) {
      let r = null; try { r = await sendL(p.phone, s(x.body || x.text).slice(0, 600), leadNum(), undefined, { who: p.name, leadId: s(x.lsa && x.lsa.leadId), code: s(x.lsa && x.lsa.code), type: 'lead', overnight: true }); } catch (e2) {}
      if (r && r.ok) { out.sent++; if (x.lsa && (!x.lsa.adminsOnly || lsaAdmins().indexOf(low(e)) >= 0)) { const ph = p.phone; await _D.kvCas(SKEY, v => { const st = loadState(v); const l0 = arr(st.lsa[ph]), was = l0.find(y => y.leadId === x.lsa.leadId), l = l0.filter(y => y.leadId !== x.lsa.leadId); l.push(Object.assign({}, x.lsa, { at: new Date(now()).toISOString() }, was && was.done && !('done' in x.lsa) ? { done: was.done } : {})); st.lsa[ph] = l.slice(-12); return st; }).catch(() => {}); } }
    }
    const sysOk = sys.filter(x => x.kind !== 'system' || p.system);   /* QUIET: every held alert (a system one only for whoever wants those) */
    if (sysOk.length) { const sys2 = sysOk; const text = sys2.length === 1 ? sys2[0].text : sys2.length + ' overnight alerts: ' + sys2.map(x => x.text).join(' · ');
      try { const r = await sendL(p.phone, compose(0, text, sys2[0] && sys2[0].link), fromNum()); if (r && r.ok) out.sent++; } catch (e2) {} }
  }
  return out;
}

/* ── a text from a phone in the alerts table (missed-call.js, before anything else; STOP is already handled there) ──
   null → not a staff phone in the table (the normal path goes on). Otherwise handled here — never a lead. */
async function staffInbound(ph, body, sid){   /* TEXTLOG: a staff text in (that the CRM handled) is logged too */
  const r = await staffInbound0(ph, body, sid);
  if (r && r.multi && Array.isArray(r.results) && r.results.length) {   /* LEADTXT: a several-lead answer is on each lead's activity */
    for (const x of r.results) await tlog({ dir: 'in', phone: phone10(ph), who: s(r.staffName || ''), email: s(r.staff), text: s(body), leadId: s(x.lsa || ''), code: s(x.code), kind: 'staff', result: x.noAnswer ? 'NO ANSWER' : x.good === true ? 'GOOD' : x.good === false ? 'BAD' : '' });
  } else if (r && r.handled !== false && r.skipped !== 'already handled') await tlog({ dir: 'in', phone: phone10(ph), who: s(r.staffName || ''), email: s(r.staff), text: s(body), leadId: s(r.lsa || ''), pid: s(r.pid || ''), po: s(r.po || ''), kind: 'staff', result: r.lsa ? (r.good === true ? 'GOOD' : r.good === false ? 'BAD' : '') : r.jobNote ? 'job note ' + r.jobNote : r.replied ? 'sent to customer' : '' });
  return r;
}
async function staffInbound0(ph, body, sid){
  ph = phone10(ph); if (ph.length !== 10) return null;
  const set = await load();
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  /* a phone in the table: on or off (an "off" staff phone still never becomes a lead) */
  const list = staffList(pp), byPhone = {};
  list.forEach(x => { const sp = set.people[x.email]; const ph2 = (sp && sp.phone) || (sp ? x.phone : ''); if (ph2) byPhone[ph2] = { email: x.email, name: (sp && sp.name) || x.name }; });
  resolve(set, pp).forEach(r => { byPhone[r.phone] = byPhone[r.phone] || { email: r.email, name: r.p.name }; });
  if (!byPhone[ph]) {   /*LSASEND: a PM who was sent an LSA lead answers from his cell even when he is not on the alerts list */
    let held0 = []; await _D.kvCas(SKEY, v => { held0 = arr(loadState(v).lsa[ph]).filter(x => x && x.staffEmail); return undefined; }).catch(() => {});
    if (!held0.length) {   /* JOBNOTE: any active staff cell may text "S251 note…" */
      const sx = (/^\s*#?\s*[A-Za-z]\d{3,5}\b/.test(s(body)) || require('./apptparse.js').KIND.test(s(body))) ? list.find(x => phone10(x.phone) === ph) : null;   /* + APPTTEXT: any staff cell */
      if (!sx) return null;
      byPhone[ph] = { email: sx.email, name: sx.name || '' };
    } else byPhone[ph] = { email: held0[held0.length - 1].staffEmail, name: held0[held0.length - 1].staffName || '' };
  }
  const email = byPhone[ph].email, p = { name: (list.find(x => x.email === email) || {}).name || byPhone[ph].name }, t = now(), at = new Date(t).toISOString();
  const opt = await _D.optouts();
  if (opt[ph] && START.test(body)) return null;   /* START from an opted-out staff phone: the normal START path undoes it */
  let rep = null, fresh = false;
  await _D.kvCas(SKEY, v => { const st = loadState(v); fresh = false; rep = st.reply[ph] || null; if (sid && st.seen[sid]) return undefined; if (sid) st.seen[sid] = at; fresh = true; return st; });
  if (!fresh) return { handled: true, staff: email, skipped: 'already handled' };
  try { const jn = await jobNote(ph, body, { email, name: p.name }); if (jn) return jn; } catch (e) {}   /* JOBNOTE: "S251 note…" → that job's notes */
  try { const ap = await apptText(ph, body, { email, name: p.name }); if (ap) return ap; } catch (e) {}   /* APPTTEXT: "appt John Smith thu 2pm" → my schedule */
  try { const lr = await lsaReply(ph, body, { email, name: p.name, rep: !!(rep && rep.to && t - Date.parse(rep.at || 0) <= REPLY_MS) }); if (lr) return lr; } catch (e) {}   /* LSATEXT: GOOD / BAD for an LSA lead (LEADTXT: rep = a reply window to a customer is open) */
  if (!rep || t - Date.parse(rep.at || 0) > REPLY_MS) {
    /* a short "not sent" note, at most once a day per phone */
    let hint = false;
    await _D.kvCas(SKEY, v => { const st = loadState(v); hint = false; if (st.hint[ph]) return undefined; st.hint[ph] = at; hint = true; return st; }).catch(() => {});
    const out = { handled: true, staff: email, ignored: 'no alert in the last 30 minutes' };
    if (hint && !opt[ph]) {   /* patch AUTOPANEL: a staff-only hint, tagged 'staff' (goes in data-entry mode) */ try { out.hint = await sendL(ph, 'GrayCo: your text was not sent to anyone. Reply within 30 min of an alert to answer that person, or answer in the CRM. ' + site(), fromNum()); } catch (e) {} }
    return out;
  }
  const to = rep.to, text = s(body).slice(0, 560);
  let acked = null;   /* a reply to an emergency alert = "I have it": the escalation calls stop (patch EMERGCALL) */
  if (rep.emergency && rep.leadId) { try { acked = await _D.ack(rep.leadId, 'replied to the alert text (' + (p.name || email) + ')'); } catch (e) { acked = { error: s(e && e.message) }; } }
  if (!to) return { handled: true, staff: email, acked, ignored: 'no number to answer (the emergency is marked as taken)' };
  if (!text) return { handled: true, staff: email, acked, ignored: 'empty' };
  if (await _D.paused()) return { handled: true, staff: email, notSent: 'data-entry mode is on' };
  if (opt[to]) return { handled: true, staff: email, notSent: 'that number texted STOP' };
  if (await _D.consentNo(to)) return { handled: true, staff: email, notSent: 'that customer declined texts' };
  let signed = text; try { signed = require('./smsroute.js').sign(text, p.name); } catch (e) {}
  signed = signed.slice(0, 600);
  /* patch CUSTQUIET: a staff reply relayed to a customer is a customer text — 7 PM–7 AM Central it waits for 7 AM, except the
     answer to an EMERGENCY the customer started (rep.emergency), which goes now */
  const r = await sendL(to, signed, env('TWILIO_FROM'), rep.emergency ? 'emergency' : 'customer');
  if (!r || !r.ok) return { handled: true, staff: email, notSent: 'Twilio did not send it' };
  const id = 'SMSC_' + (sid || t.toString(36));
  if (rep.emergency) { try { await emqArm(to, { pid: rep.pid, leadId: rep.leadId, staff: p.name || email }); } catch (e) {} }   /* EMQ: we answered — the questions come next */
  const msg = await _D.postReply({ id, pid: rep.pid, email, name: p.name, to, text: signed, at });
  /* the 30-minute window stays open for a back-and-forth */
  await _D.kvCas(SKEY, v => { const st = loadState(v); if (st.reply[ph]) st.reply[ph].at = at; return st; }).catch(() => {});
  return { handled: true, staff: email, replied: true, to, pid: rep.pid, msg: msg && msg.id, acked };
}
/* is this phone a staff phone in the table (any state)? */
async function isStaffPhone(ph){ ph = phone10(ph); if (ph.length !== 10) return false; const set = await load(); let pp = {}; try { pp = await _D.people(); } catch (e) {} return resolve(set, pp).some(r => r.phone === ph); }

/* ── the hooks (one call each from missed-call.js, bid-alerts.js, auto-digest.js, gc-backup.js, crm-health.js) ── */
function quote(b){ return '"' + clip(b, 120) + '"'; }
/* a text in from a customer / sub (missed-call.js inboundSms) */
/* ONELEAD: the lead a phone was auto-texted from (Google LSA / website), or null */
async function lsaCustOf(ph){ let lc = null; try { await _D.kvCas(SKEY, v => { lc = loadState(v).lsaCust[phone10(ph)] || null; return undefined; }); } catch (e) {} return lc; }
async function inboundText(o){
  await loadOwners();   /* OWNERROLE */
  const who = o.who || {}, kind = who.kind === 'sub' ? 'subs' : 'cust';
  if (who.kind === 'staff') return { skipped: 'staff' };
  /* LSAMSG (owner 11/10: "we can also answer these lead messages from CRM under Messages; they also go to the admins' phones for now"):
     a text from a Google LSA lead we texted → the owners' cells (any time), reply from the cell within 30 min */
  let lc = null; try { await _D.kvCas(SKEY, v => { lc = loadState(v).lsaCust[phone10(o.ph)] || null; return undefined; }); } catch (e) {}
  if (lc) {
    const shown = clip(s(who.name) || s(lc.name) || tidy(o.ph), 40) + ' ' + tidy(o.ph);
    const lcode = s(lc.code) || lsaCode(lc.leadId);   /* ONELEAD: a website lead has no code saved yet */
    return notify({ type: 'cust', lsa: { leadId: lc.leadId, code: lcode, name: lc.name, phone: phone10(o.ph) }, text: (lc.stage === 'web' ? 'Website lead ' : 'LSA lead ') + lcode + ' ' + shown + ' texted: ' + quote(o.body) + ' Reply here within 30 min to answer them (or in CRM Messages).',
      link: site() + '/?jobmsg=' + encodeURIComponent(o.pid || 'unsorted'), thread: 'p:' + phone10(o.ph), only: lsaAdmins(), replyTo: { phone: o.ph, pid: o.pid || '', name: who.name || lc.name || '' } });
  }
  const shown = clip(s(who.name) || tidy(o.ph), 40) + (who.name ? ' ' + tidy(o.ph) : '');
  const text = (o.urgent ? '🚨 ' : '') + 'text from ' + shown + (o.label ? ' — ' + clip(o.label, 40) : '') + ': ' + quote(o.body) + ' Reply here within 30 min to answer.';
  return notify({ type: kind, text, link: site() + '/?jobmsg=' + encodeURIComponent(o.pid || 'unsorted'), thread: 'p:' + phone10(o.ph), mine: o.mine || [], emergency: !!o.urgent,
    replyTo: { phone: o.ph, pid: o.pid || '', name: who.name || '' } });
}
/* a missed call (missed-call.js missed) */
async function missedCall(o){
  const shown = clip(s(o.name) || 'a caller', 40) + ' ' + tidy(o.ph);
  return notify({ type: 'missed', text: 'missed call from ' + shown + (o.job ? ' — ' + clip(o.job, 40) : '') + (s(o.said) ? ': ' + quote(o.said) : '') + '. They got the auto-text. Reply here within 30 min to text them.',
    link: site() + (o.pid ? '/?jobmsg=' + encodeURIComponent(o.pid) : '/#leads'), thread: 'p:' + phone10(o.ph), replyTo: { phone: o.ph, pid: o.pid || '', name: o.name || '' } });
}
/* patch SUBALERT (owner 10/29: "I don't want to see any sub leads in the GrayCo text for [the owners] — his prime leads and
   website leads, ads, Facebook etc., but no sub for a big GC commercial lead; all that goes directly to Glenn"):
   a bid where GrayCo would be a SUB to a GC (the server's prime / sub call, or a GC named on a bid-board invite with no
   call made) texts only the estimator(s): the lead's assignee if that is an estimator, else every active estimator. */
const BID_BOARDS = /buildingconnected|planhub|isqft|smartbid|bidclerk|constructconnect|procore|pantera|bluebook|dodge|bid ?board/i;
function isSubBid(r, x){
  const role = low(r.bidRole || x.bidRole || obj(r.leadExtra).bidRole);
  if (role === 'sub') return true;
  if (role === 'prime') return false;
  const src = [r.source, x.source].concat(arr(r.sources).map(y => s(y && y.name || y))).join(' ');
  return !!(s(r.gc || x.gc || r.dueToCompany) && BID_BOARDS.test(src));
}
async function estimatorsFor(r, x){
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const est = arr(pp.users).filter(u => staffEmail(low(u.email)) && isActiveUser(u) && /estimat/i.test(s(u.role) + ' ' + s(u.title) + ' ' + s(u.profile))).map(u => low(u.email));
  const mine = [x.assigneeEmail, r.estimatorEmail, x.estimatorEmail].map(low).filter(Boolean);
  const hit = mine.filter(e => est.indexOf(e) >= 0);
  return hit.length ? hit : est;
}
/* new leads (bid-alerts.js notifyNew): mine = entries, raw = the raw items by id, isEm(x) */
function leadPhone(raw, x){ const r = raw || {}, le = obj(r.leadExtra), c = obj(r.contact || x.contact); return phone10(le.smsFrom || r.smsFrom || (le.missedCall || le.textMessage || r.missedCall || r.textMessage ? (r.phone || c.phone) : '')); }
async function leads(list, raw, isEm){
  const out = []; await loadOwners();   /* OWNERROLE */
  for (const x of arr(list)) {
    const r = obj((raw || {})[x.id]), em = !!(isEm && isEm(x)), ph = leadPhone(r, x);
    const c = obj(x.contact || r.contact), name = s(c.name || r.name || obj(r.leadExtra).contactName) || 'Unknown';
    const callPh = phone10(c.phone || r.phone || ph);
    let msg = ''; try { msg = require('./leadmsg.js').collect(Object.assign({}, r, x)).message; } catch (e) {}
    /* owner 10/28: "GrayCo NEW LEAD: <name> (901) 555-0100 — "<their message…>" <link>"; emergency "🚨 GrayCo EMERGENCY: …" */
    /* LEADLINK (owner 11/10: "I also want the CRM link in here with all leads, it can just be a blue link to click, doesn't have to be big"):
       the lead's own link without "https://" — the phone still makes it a blue link, but no big preview card */
    const head = em ? '🚨 GrayCo EMERGENCY' : 'GrayCo NEW LEAD', link = site().replace(/^https?:\/\//, '') + '/#leads&lead=' + encodeURIComponent(s(x.key || x.id));
    /* LEADWATCH (owner 11/19: the City of Bartlett bid postings reached the owners as "GrayCo NEW LEAD: Unknown"): how the lead came in
       decides (_lib/lead-watch.js) — a customer lead (LSA, website, phone, referral, a lead source, any other lead) is never a bid even when its
       type says commercial; a bid invite (plan rooms, bid boards, city / county / school postings, a GC's invitation — prime or sub) goes to the
       Estimator role only, as "GrayCo BID INVITE: <project> …", never to the owners */
    const lwL = Object.assign({}, x, r, { leadExtra: Object.assign({}, obj(x.leadExtra), obj(r.leadExtra)) }), lwK = LWc().kindOf(lwL), cust = LWc().isCustomer(lwL);
    const bidInv = !em && lwK === 'bid' && !isLsaLead(r, x);
    /* LEADWATCH (owner decision 11/19): a bid where GrayCo is the PRIME (a city / county / school's sealed bid) → Owner 1 / Owner 2 as a lead
       ("GrayCo PRIME BID <code>: <project> for <owner> …", GOOD / BAD by code); a bid where GrayCo would be a SUB (a GC's invitation on
       BuildingConnected / PlanHub …) or not marked → the CRM only, no texts. The existing Prime / Sub mark decides (bid-role.js). */
    const bidRole = bidInv ? (/^(prime|sub)$/.test(low(r.bidRole || x.bidRole || obj(r.leadExtra).bidRole)) ? low(r.bidRole || x.bidRole || obj(r.leadExtra).bidRole) : (() => { try { return require('./bid-role.js').role(lwL); } catch (e) { return ''; } })()) : '';
    const only = !em && (bidInv || (!cust && isSubBid(r, x))) ? (bidRole === 'prime' ? lsaAdmins() : []) : null;   /* patch SUBALERT → LEADWATCH: sub bids: no text */
    /* LEADTEXT (owner 11/10: "website leads say GrayCo website lead and do the same structure … all leads do this structure" · "all leads for
       the entire company should go through this GrayCo text"): every customer lead (not a bid invite — those stay with the estimator — and not an
       emergency that is not LSA — that still pages on call) goes to the owners' cells in the LSA shape with the same replies */
    const lsaL = isLsaLead(r, x), label = leadLabel(r, x);
    /* LSADIRECT (owner 11/19, replaces LSAVET / LSA247: "I want Google leads to go directly to my phone GrayCo text once the call is over
       or the voicemail is over, with all of that, so I can call"): no office "real lead?" gate any more — every Google LSA call / lead texts
       the owners at once (the number, call time + length, job type, the recording, the transcript summary, the lead link, the code).
       LSAINTAKE (owner 11/19: "As soon as office answers this call they get a notification in their CRM to rate the lead, describe the lead,
       send to admin to assign PM, or send to PM directly"): the office gets "📞 Google call — fill in the lead" (an office To-Do + a phone
       push) at the same moment; nothing waits on it. After hours the text waits for 7:00 AM (notify: LSAHOLD). */
    if (lsaL) { try { out.push({ intake: await _D.intakeTodo({ leadId: s(x.id), code: lsaCode(x.id), name: clip(name, 60), phone: callPh, said: clip(s(msg).replace(/\s+/g, ' '), 200), em: !!em }) }); } catch (e) { out.push({ intakeError: s(e && e.message) }); } }
    if (lsaL || (!em && !only && (cust || !bidLike(r, x)))) {   /* LSATEXT: owner 11/10 — Google LSA leads to the owners' cells; they text back GOOD or BAD */
      const code = lsaCode(x.id), who = clip(name, 40) + (callPh.length === 10 ? ' ' + tidy(callPh) : '');
      /* LSAWORD (owner 11/10: "google lsa lead from 9016927255 wesley says blah blah blah, reply with if the lead is good and who is the PM") */
      const det = lsaL ? lsaDetails(r, x) : '';   /* LSAREC: Google's call length + job type (Google Ads API), when known */
      const cb = lsaL ? lsaCallBits(r, x) : { at: '', rec: '', sum: '' };   /* LSADIRECT: the call time, ▶ recording, transcript summary */
      const lt = (more, g) => { const head = (em ? '🚨 ' : '') + 'GrayCo: ' + label + ' ' + code + (more ? ' (+' + more + ' more)' : '') + ' from ' + (callPh.length === 10 ? tidy(callPh) + ' ' : '') + clip(name, 40) + det,
          tail = lsaHint(code) + ((!g || g.newbie !== false) ? lsaHowto(code) : ''),   /* HOWTO (owner 11/10): the how-to only in a person's first month · LEADTXT: the short GOOD / BAD + code hint always */ said = s(msg).replace(/\s+/g, ' '), room = MAX - head.length - tail.length - link.length - 10;
        const callNote = /call to the office/.test(label) ? (callPh.length === 10 ? ' Missed it? Call them back from your cell.' : ' Google did not send the number: open the LSA app → Leads to call back.') : '';   /* LSACALL (owner 11/10) */   /* LSACALL2 */
        const more2 = (cb.at ? ' Called ' + cb.at + '.' : '') + (cb.sum ? ' 📝 ' + clip(cb.sum, 120) : '') + (cb.rec ? ' ▶ ' + cb.rec : '');   /* LSADIRECT */
        const room2 = room - more2.length;
        return head + (said && !callNote && !cb.sum && room2 > 12 ? ' says "' + clip(said, room2) + '".' : '.') + callNote + more2 + ' ' + link + tail; };   /* LEADLINK */
      try { out.push(await notify({ type: 'lead', lsa: { leadId: s(x.id), code, name: clip(name, 60), phone: callPh, link: s(obj(r.leadExtra).lsaLink || r.lsaLink), said: clip(s(msg).replace(/\s+/g, ' '), 140), em: !!em, isLsa: lsaL, label }, text: lt(0), body: lt, link, only: lsaAdmins(), thread: ph ? 'p:' + ph : 'lsa:' + s(x.id), emergency: em }));   /* a texter's lead and their first text collapse into one alert */ } catch (e) { out.push({ error: s(e && e.message) }); }
      const custTxt = await require('./automations.js').isOn('lead_qualify_text').catch(() => false);   /* CUSTTEXT2 (owner 11/19): the qualify ask is ON again ("they'll vet our calls better") — its own switch */
      if (custTxt && lsaL && !obj(r.leadExtra).lsaCall) try { out.push({ lsaAsk: await lsaAsk(callPh, { leadId: s(x.id), code, name, em, svc: s(obj(r.leadExtra).service || r.service || x.title) }) }); } catch (e) { out.push({ lsaAskError: s(e && e.message) }); }   /* LSAFLOW */
      else if (custTxt && !lsaL && /website lead/i.test(label) && callPh.length === 10) try { out.push({ webAsk: await webAsk(callPh, { leadId: s(x.id), name, em, svc: s(obj(r.leadExtra).service || r.service || '') }) }); } catch (e) { out.push({ webAskError: s(e && e.message) }); }   /* WEBTEXT */
      continue;
    }
    let tail = link; if (em && callPh.length === 10) { try { tail = link + ' Not real? Block: ' + require('./salesguard.js').blockLink(site(), callPh); } catch (e) {} }   /* patch SALESBLOCK: one tap to block (signed; admins / office, asked first) */
    /* LEADTXT (owner 11/19: "How do I say good or bad if I get 2-3 or more texts"): the 🚨 EMERGENCY / NEW LEAD texts that reach the
       owners carry the lead's code + "Reply GOOD <code> / BAD <code>" too (not a sub bid — those go to the estimator only). Their answer needs
       the code (codeOnly): a plain "Good, on our way" in the 30 minutes still goes to the customer as before. Nobody else gets the hint. */
    if (bidInv) {   /* LEADWATCH: the estimator's bid text — the project, who it is for, when it is due; no customer name ("Unknown") */
      const due = s(x.bidDue || r.bidDue), to = s(x.dueToCompany || r.dueToCompany || r.gc || x.gc || r.owner), where = [s(r.city || x.city), s(r.state || x.state)].filter(Boolean).join(', ');
      let dueS = ''; try { dueS = due ? require('./bid-due.js').fmtDue(due) : ''; } catch (e) { dueS = due; }
      if (bidRole !== 'prime') { out.push({ bid: true, role: bidRole || 'unmarked', crmOnly: true }); continue; }
      const bcode = lsaCode(x.id);
      const bt = 'GrayCo PRIME BID ' + bcode + ': ' + clip(s(x.title || r.title || r.name) || 'new bid', 70) + (to ? ' for ' + clip(to, 40) : '') + (where ? ' · ' + clip(where, 30) : '') + (dueS ? ' · due ' + dueS : ' · due date not found — add it') + ' (' + clip(s(r.source || x.source) || 'Lead Inbox', 30) + ') ' + link + lsaHint(bcode);
      try { out.push(Object.assign(await notify({ type: 'lead', text: bt, body: () => bt, link, only: only || [], thread: 'bid:' + s(x.key || x.id), leadId: s(x.key || x.id),
        lsa: { leadId: s(x.id), code: bcode, name: clip(s(x.title || r.title), 60), phone: '', link: '', said: '', em: false, isLsa: false, label: 'prime bid', codeOnly: true, adminsOnly: true } }), { bid: true, role: 'prime' })); } catch (e) { out.push({ error: s(e && e.message) }); }
      continue;
    }
    const code = only ? '' : lsaCode(x.id), adm = lsaAdmins();
    const hintFor = g => (code && (!g || !g.email || adm.indexOf(low(g.email)) >= 0)) ? lsaHint(code) : '';
    const body = (more, g) => leadText(head, more, clip(name, 40) + (callPh.length === 10 ? ' ' + tidy(callPh) : ''), msg, tail + hintFor(g));
    const text = body(0);
    const lsaO = code ? { leadId: s(x.id), code, name: clip(name, 60), phone: callPh, link: '', said: clip(s(msg).replace(/\s+/g, ' '), 140), em: !!em, isLsa: false, label: em ? 'emergency lead' : label, codeOnly: true, adminsOnly: true } : undefined;
    try { out.push(await notify({ type: 'lead', text, body, link, only, lsa: lsaO, thread: ph ? 'p:' + ph : 'lead:' + s(x.key || x.id), mine: [x.assigneeEmail].concat(x.coEmails || []).filter(Boolean), emergency: em,
      replyTo: ph || em ? { phone: ph, pid: '', name, leadId: s(x.id) } : null })); } catch (e) { out.push({ error: s(e && e.message) }); }
  }
  return out;
}
/* ── LSATEXT (owner 11/10): "I need Google LSA leads to go to [the owners'] phones so we can send a text good or bad lead and
   then it works in my CRM as that type of lead, then alerts office or marketing … can I enter not good lead automatically
   through the text". The admins (Owner 1 and Owner 2, by role) get "GrayCo GOOGLE LSA LEAD K7Q2: …"; a reply from
   that phone within 72 h — "GOOD", "BAD spam", "GOOD K7Q2", "BAD K7Q2 wrong service" (no code = the newest LSA lead sent
   to that phone) — marks the lead: good → kept; bad → closed as "LSA — not a real lead (why)" + an office To-Do
   "⚖️ Dispute … in Google Ads by <date>" (Google gives about 30 days; the CRM cannot file the dispute itself — Google's
   API has no dispute call). The CRM page applies the same mark to the lead (gc_kv "gc_lsa_decisions"). */
const LSA_MS = 72 * 3600 * 1000;
const HOWTO_MS = 30 * 864e5;   /* HOWTO: the reply how-to shows for a person's first 30 days of lead texts */
const LSA_LEADS_URL = 'https://ads.google.com/localservices/leads';   /* LSALINK: Google's LSA leads page (dispute a lead there) */
/* LSAREC: " (2m 14s call, Roofer — roof repair)" from the Google LSA details on the lead; '' when none */
function lsaDetails(r, x){ const ex = Object.assign({}, obj(obj(x).leadExtra), obj(obj(r).leadExtra)), sec = Math.round(+ex.lsaDurSec || 0), job = clip(s(ex.lsaJob), 34);
  const d = sec ? (sec < 60 ? sec + 's' : Math.floor(sec / 60) + 'm ' + String(sec % 60).padStart(2, '0') + 's') + ' call' : ''; const p = [d, job].filter(Boolean); return p.length ? ' (' + p.join(', ') + ')' : ''; }
/* LSADIRECT: what the text can say about the call: Google's call time (Central, "8:21 AM"), the recording (the CRM lead with its 🎧 ▶ for
   an office-line recording — staff sign-in; else Google's own recording link) and the transcript summary */
function lsaCallBits(r, x){
  const ex = Object.assign({}, obj(obj(x).leadExtra), obj(obj(r).leadExtra)), t = Date.parse(s(ex.lsaCallAt));
  let at = ''; if (isFinite(t)) { try { at = new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).replace(/\u202f/g, ' '); } catch (e) {} }
  const id = s(obj(r).id || obj(x).id), recs = arr(ex.callRecs).filter(z => /^RE[0-9a-f]{32}$/.test(s(z.rsid)));
  const rec = recs.length ? site().replace(/^https?:\/\//, '') + '/#leads&lead=' + encodeURIComponent(id) + '&rec=1' : (/^https:\/\//.test(s(ex.lsaRecUrl)) ? s(ex.lsaRecUrl) : '');
  const sum = ex.callTranscript && s(ex.callTranscript.summary) ? s(ex.callTranscript.summary) : '';
  return { at, rec, sum, vm: recs.some(z => z.kind === 'voicemail') };
}
function isLsaLead(r, x){ const it = Object.assign({}, r || {}, x || {}), ex = obj(it.leadExtra); return it.lsaCheck === 'pending' || ex.lsaCheck === 'pending' || /google\s*lsa|local\s*services/i.test([it.source, it.leadSource, ex.leadSource].map(s).join(' ')); }
function lsaCode(id){ const h = require('crypto').createHash('sha256').update(s(id)).digest('hex'), A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 4; i++) c += A[parseInt(h.slice(i * 2, i * 2 + 2), 16) % A.length]; return c; }
function lsaAdmins(){ return ownerEmails(); }   /* OWNERROLE: Owner 1 and Owner 2 (by role) */
const LSA_REPLY = /^\s*(no[\s-]*answer|noanswer|n\/a|na|vm|voice\s*mail|good|bad|g|b|👍|👎|yes|no)\b[\s:.,!-]*([A-Z0-9]{4})?\b[\s:.,!-]*([\s\S]*)$/i;
/* ── LEADTXT (owner 11/19: "How do I say good or bad if I get 2-3 or more texts … just say bad bad bad good bad, or is there a better way"):
   every lead text carries its 4-letter code and "Reply GOOD <code> / BAD <code>". One reply may answer several leads:
     "BAD RVV7 K7Q2, GOOD ABCD Steven" · "bad RVV7 bad K7Q2 good ABCD" · "RVV7 bad, K7Q2 good" — by code (a code from any lead texted to
     this phone in the last 72 h, answered or not: a code always says which lead);
     "bad bad good" (no codes) — in order to the OPEN leads texted to this phone, oldest first, ONLY when there are exactly that many open
     leads (an emergency / NEW LEAD text answers with its code only); otherwise nothing is saved and the reply lists the open leads.
   "Open" = not answered by text on any phone and not closed in the lead inbox (👍 / 👎 in the CRM, dismissed, merged).
   A plain GOOD / BAD with no code: one or more open leads → the newest open one, as before (the confirmation names the other open ones);
   none open → never re-marks a lead that is already answered — the reply asks which lead.
   The confirmation of a several-lead reply is ONE text, one line per lead. ── */
function lsaHint(code){ return code ? ' Reply GOOD ' + code + ' / BAD ' + code + '.' : ''; }
function lsaHowto(code){ return ' GOOD ' + code + ' Pat = PM Pat. SEND ' + code + ' Pat = Pat calls first. BAD + why. NA = no answer.'; }
async function lsaStateList(ph){ let list = []; await _D.kvCas(SKEY, v => { list = arr(loadState(v).lsa[ph]); return undefined; }).catch(() => {}); return list; }
async function lsaOpen(list){
  let closed = {}; if (list.length) { try { closed = obj(await _D.closedLeads(list.map(x => s(x.leadId)))); } catch (e) { closed = {}; } }
  const open = list.filter(x => !x.done && !closed[s(x.leadId)]);
  return { open, pick: open.filter(x => !x.codeOnly) };
}
function lsaShort(x){ return s(x.code) + ' ' + clip(s(x.name) || tidy(x.phone) || 'lead', 22); }
function lsaOpenLine(open){ const l = open.slice(-6); return l.map(lsaShort).join(', ') + (open.length > l.length ? ' (+' + (open.length - l.length) + ' more)' : ''); }
function lsaAskText(open, list, kind){
  const c = open.map(x => x.code), ex = c.length ? c : arr(list).slice(-2).map(x => x.code);
  const eg = kind === 'send' ? 'SEND ' + (ex[ex.length - 1] || 'K7Q2') + ' Pat' : ex.length >= 2 ? 'BAD ' + ex[0] + ', GOOD ' + ex[1] + ' Pat' : 'GOOD ' + (ex[0] || 'K7Q2') + ' Pat or BAD ' + (ex[0] || 'K7Q2') + ' + why';
  if (!open.length) return 'GrayCo: which lead? No open lead on this phone (the last ones are answered). Reply with the 4-letter code from the lead text, e.g. ' + eg + '. Nothing saved.';
  return 'GrayCo: which lead' + (open.length > 1 ? 's' : '') + '? Open: ' + lsaOpenLine(open) + '. Reply with the code' + (open.length > 1 ? 's' : '') + ', e.g. ' + eg + '. Nothing saved.';
}
/* mark a lead answered on every phone it was texted to (the other admin's bare GOOD / BAD then goes to a lead still open) */
function lsaMarkDone(st, leadId, val){ Object.keys(st.lsa).forEach(k => arr(st.lsa[k]).forEach(x => { if (x.leadId === leadId) x.done = val; })); }
/* the reply parser: null = not a several-lead answer (the single-answer path reads it as before) */
const MV_CODE = /^[A-Za-z0-9]{4}$/;
function mvVerbOf(w){ const x = low(w); if (/^(good|g|yes|👍)$/.test(x)) return 'good'; if (/^(bad|b|no|👎)$/.test(x)) return 'bad'; if (/^(na|n\/a|noanswer|no-answer|vm|voicemail)$/.test(x)) return 'na'; return ''; }
function mvStrong(w){ return /^(good|bad|na|n\/a|noanswer|no-answer|vm|voicemail|👍|👎)$/i.test(w); }
function lsaParseMulti(body, codes){
  const known = {}; (Array.isArray(codes) ? codes : []).forEach(c => { if (s(c)) known[s(c).toUpperCase()] = 1; });
  const raw = s(body).replace(/(👍|👎)/g, ' $1 ').replace(/[,;\n\r]+/g, ' | ').split(/\s+/).filter(Boolean);
  const tk = [], cut = w => w.replace(/^[.:!?()"'*]+|[.:!?()"'*]+$/g, '');
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '|') { if (tk.length) tk[tk.length - 1].sep = true; continue; }
    const w = cut(raw[i]); if (!w) continue;
    const nx = cut(s(raw[i + 1]));
    if ((/^no$/i.test(w) && /^answer$/i.test(nx)) || (/^voice$/i.test(w) && /^mail$/i.test(nx))) { tk.push({ t: raw[i] + ' ' + raw[i + 1], v: 'na', strong: true, code: '' }); i++; continue; }
    const code = MV_CODE.test(w) && known[w.toUpperCase()] ? w.toUpperCase() : '';
    tk.push({ t: raw[i], v: code ? '' : mvVerbOf(w), strong: !code && mvStrong(w), code });
  }
  if (tk.length < 2 || !(tk[0].v || tk[0].code)) return null;
  const nC = Object.keys(tk.reduce((m, x) => { if (x.code) m[x.code] = 1; return m; }, {})).length;
  const groups = [], unclear = [];
  if (tk[0].code) {   /* "RVV7 bad, K7Q2 good spam" — the answer after the code(s) */
    const segs = []; let cur = []; tk.forEach(x => { cur.push(x); if (x.sep) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
    if (!(nC >= 2 || (segs.length >= 2 && segs.every(sg => sg[0].code && sg[1] && sg[1].v)))) return null;
    let pend = [], g = null;
    tk.forEach((x, i) => {
      if (x.code) { pend.push({ code: x.code, rest: [] }); g = null; return; }
      if (x.v && pend.length && i > 0 && tk[i - 1].code) { g = { verb: x.v, items: pend, pre: [] }; groups.push(g); pend = []; return; }
      if (g) g.items[g.items.length - 1].rest.push(x.t + (x.sep ? ',' : ''));
    });
    pend.forEach(it => unclear.push(it.code));
  } else {   /* "BAD RVV7 K7Q2, GOOD ABCD Steven" · "bad bad good" · "bad spam, good Steven" */
    const head = i => { const x = tk[i]; if (!x.v) return false; if (i === 0) return true; const nextCode = !!(tk[i + 1] && tk[i + 1].code);
      if (!x.strong) return nextCode; return nextCode || !!tk[i - 1].code || !!tk[i - 1].sep || !!tk[i - 1].v; };
    let heads = 0; tk.forEach((x, i) => { if (head(i)) heads++; });
    if (!(nC >= 2 || heads >= 2)) return null;
    let g = null;
    tk.forEach((x, i) => {
      if (head(i)) { g = { verb: x.v, items: [], pre: [] }; groups.push(g); return; }
      if (x.code) { g.items.push({ code: x.code, rest: [] }); return; }
      (g.items.length ? g.items[g.items.length - 1].rest : g.pre).push(x.t + (x.sep ? ',' : ''));
    });
  }
  const tidyRest = l => l.join(' ').replace(/[\s,]+$/, '').replace(/^[\s,:-]+/, '').trim();
  const answers = [];
  groups.forEach(g => {
    if (!g.items.length) { answers.push({ verb: g.verb, code: '', rest: tidyRest(g.pre) }); return; }
    const last = g.items[g.items.length - 1], shared = g.items.length > 1 && g.items.slice(0, -1).every(it => !it.rest.length) ? last.rest : null;   /* "BAD RVV7 K7Q2 spam" → both spam */
    g.items.forEach((it, k) => answers.push({ verb: g.verb, code: it.code, rest: tidyRest((k === 0 ? g.pre : []).concat(shared || it.rest)) }));
  });
  if (answers.length < 2 && !unclear.length) return null;
  return { answers, unclear };
}
/* one lead's answer (the single-answer texts unchanged; quiet = no confirmation text, a several-lead reply sends one summary) */
async function lsaApply(ph, who, isAdm, verb, rec, reason, o){
  o = o || {}; const good = verb === 'good', more = o.more ? String(o.more) : '';
  try { await _D.ack(rec.leadId, 'answered the LSA text (' + (who.name || who.email) + ')'); } catch (e) {}   /* any GOOD / BAD / NA answer acknowledges an emergency LSA lead: no escalation calls */
  /* LSANA (owner 11/10: "also put in leads as not answered — not necessarily a bad lead but no answer once we got the lead, will revisit") */
  if (verb === 'na') {
    const r0 = await _D.lsaDecide({ leadId: rec.leadId, name: rec.name, phone: rec.phone, code: rec.code, noAnswer: true, good: false, reason: reason, notes: reason, by: who.name || who.email, byEmail: who.email });
    let c0 = null; if (!o.quiet) { try { c0 = await sendL(ph, 'GrayCo: ' + rec.code + ' ' + clip(rec.name, 40) + ' marked NO ANSWER — kept open, a call-back is on the office To-Do.' + (reason ? ' Notes saved.' : '') + ' Reply GOOD or BAD ' + rec.code + ' when you reach them.' + more, leadNum()); } catch (e) {} }
    return { res: { handled: true, staff: who.email, lsa: rec.leadId, noAnswer: true, saved: r0, confirmed: !!(c0 && c0.ok) }, line: lsaShort(rec) + ' — NO ANSWER, kept open (call-back on the To-Do)' };
  }
  const asPm = !!s(rec.staffEmail) && low(rec.staffEmail) === low(who.email);   /* LSAFLOW2: the text was his PM lead text (an owner can be the PM too) */
  if (asPm) { try { await pmReplied(rec.leadId); } catch (e) {} }   /* LEADWATCH: the PM answered — the reply ladder stops */
  if (!isAdm || asPm) {   /*LSASEND: the PM's own answer */
    const meAsPm = { name: s(who.name) || s(rec.staffName) || who.email, email: low(who.email) };
    if (good) {
      const rg = await _D.lsaDecide({ leadId: rec.leadId, name: rec.name, phone: rec.phone, code: rec.code, good: true, reason: '', notes: reason, by: meAsPm.name, byEmail: meAsPm.email, pm: meAsPm, keepPm: true });
      await _D.kvCas(SKEY, v => { const st = loadState(v); lsaMarkDone(st, rec.leadId, 'good'); return st; }).catch(() => {});
      try { await goodLadder(rec.leadId); } catch (e) {}   /* LEADWATCH: mark it qualified in Google */
      if (!o.quiet) { try { await sendL(ph, 'GrayCo: ' + rec.code + ' ' + clip(rec.name, 40) + ' marked GOOD — it\'s yours.' + (reason ? ' Notes saved.' : '') + more, leadNum()); } catch (e) {} }
      try { await notify({ type: 'lead', text: '✅ ' + meAsPm.name + ' says GOOD for ' + rec.code + ' ' + clip(rec.name, 40) + (reason ? ' — "' + clip(reason, 80) + '"' : '') + '.', link: site() + '/#leads', only: lsaAdmins(), thread: 'lsa:' + rec.leadId + ':pmgood' }); } catch (e) {}
      return { res: { handled: true, staff: who.email, lsa: rec.leadId, good: true, byPm: true, notes: reason, saved: rg }, line: lsaShort(rec) + ' — GOOD, it\'s yours' + (reason ? ' (notes saved)' : '') };
    }
    /* LSAFLOW2 (owner 11/19, replaces "a PM's BAD goes to the admins to approve"): the PM's BAD → the lead is BAD at once; the PM gets the
       Google dispute link, the owners get "<PM> says BAD … Dispute in Google: <link>", the office a To-Do to confirm and dispute */
    const why = reason || 'no reason given';
    const rb = await lsaBad({ leadId: rec.leadId, code: rec.code, name: rec.name, phone: rec.phone, link: rec.link, isLsa: rec.isLsa, reason: why, by: meAsPm, role: 'pm', via: 'text', ph, quiet: !!o.quiet, more });
    return { res: { handled: true, staff: who.email, lsa: rec.leadId, good: false, byPm: true, pmBad: why, saved: rb.saved, link: rb.link, admins: rb.admins, todo: rb.todo, confirmed: !!(rb.pmText && rb.pmText.ok) }, line: lsaShort(rec) + ' — BAD (' + clip(why, 40) + ')' + (rb.link ? '. Dispute it in Google: ' + rb.link : ', closed') };
  }
  /*LSAPM (owner 11/10: "can we reply with good, PM is and name the PM … or we can put good, PM's name"): "GOOD Pat",
    "GOOD, PM is Pat Miller", "GOOD K7Q2 pm pat" → the lead is assigned to that PM now (no approval wait) */
  let pm = null, pmAsked = '', notes = '';
  if (good && reason) {
    pmAsked = reason.replace(/^[\s,.:;-]*(the\s+)?(pm|project\s*manager)?[\s,.:;-]*(is|will\s+be|=)?[\s,.:;-]*/i, '').trim();
    /* LSANOTES (owner 11/10: "if I add any notes on the good lead also enter those in that job's project notes"): "GOOD Pat roof is 20 years old"
       → PM Pat + the note "roof is 20 years old" (the first 1–3 words that are one person's name; the rest is the note) */
    const w = pmAsked.split(/\s+/);
    for (let k = Math.min(3, w.length); k >= 1 && !pm; k--) { const cand = w.slice(0, k).join(' ').replace(/[,.;:!-]+$/, ''); const hit = await pmByName(cand); if (hit) { pm = hit; notes = w.slice(k).join(' ').replace(/^[\s,.;:-]+/, '').replace(/^(?:is|as|will\s+be)?\s*(?:the\s+)?(?:pm|project\s*manager)\b[\s,.;:!-]*/i, '').trim(); } }   /* "GOOD Pat is pm" → no "is pm" note */
    if (!pm) notes = pmAsked.replace(/[.!]+$/, '');
  }
  if (!good) notes = reason;
  /* LEADWATCH (owner 11/19): "the suggested PM is THAT owner" — an owner's GOOD with no PM named → the owner who answered (role-based: the
     sender is Owner 1 / Owner 2 by role); GOOD <code> <PM> or SEND <code> <PM> gives it to someone else */
  let selfPm = false; if (good && !pm && isAdm && lsaAdmins().indexOf(low(who.email)) >= 0) { let it0 = null; try { it0 = await _D.inboxLead(rec.leadId); } catch (e) {} if (!s(obj(it0).pm) && !s(obj(it0).estimator)) { const me = await pmByEmail(who.email); if (me) { pm = me; selfPm = true; } } }
  const r = await _D.lsaDecide({ leadId: rec.leadId, name: rec.name, phone: rec.phone, code: rec.code, good, reason: good ? '' : (reason || 'no reason given'), by: who.name || who.email, byEmail: who.email, pm, notes, link: s(rec.link) || LSA_LEADS_URL, isLsa: rec.isLsa !== false });
  await _D.kvCas(SKEY, v => { const st = loadState(v); lsaMarkDone(st, rec.leadId, good ? 'good' : 'bad'); return st; }).catch(() => {});
  let gc = null; if (good) { try { gc = await goodCust(rec.leadId, pm); } catch (e) {} }
  if (good && selfPm) { try { await pmReplied(rec.leadId); await goodLadder(rec.leadId); } catch (e) {} }   /* LEADWATCH: an owner who takes it himself has answered as its PM; an owner's GOOD <code> <PM> waits for that PM's reply */   /* CUSTTEXT2: "a PM will reach out shortly" · LEADWATCH: the GOOD ladder */
  let pmTx = null; if (good && pm && rec.isLsa !== false && low(pm.email) !== low(who.email)) { try { pmTx = await pmAssignText(pm, { leadId: rec.leadId, code: rec.code, name: rec.name, phone: rec.phone, notes, by: who.name || who.email, em: !!rec.em }); } catch (e) {} }   /* LSAFLOW2: the PM's GrayCo text */
  const gTxt = selfPm ? 'GOOD — it\'s yours (you answered it). To give it to someone else reply GOOD ' + rec.code + ' <PM>.' + (gc && gc.sent ? ' The customer is told a PM will reach out shortly.' : '') : (pm ? 'GOOD — PM ' + pm.name + ' assigned; ' + pm.name.split(' ')[0] + ' is told' + (gc && (gc.sent || gc.skipped === 'already sent') ? ' and the customer is told a PM will reach out shortly.' : ' (nothing goes to the customer).') : 'GOOD — no PM set: pick the PM in CRM Approvals (or reply GOOD ' + rec.code + ' <PM name>).') + (notes ? ' Notes saved on the lead.' : '');
  let conf = null; if (!o.quiet) { try { conf = await sendL(ph, 'GrayCo: ' + rec.code + ' ' + clip(rec.name, 40) + ' marked ' + (good ? gTxt : 'BAD (' + clip(reason || 'no reason given', 50) + ') — closed, no PM.' + (rec.isLsa !== false ? ' Dispute it in Google: ' + (s(rec.link) || LSA_LEADS_URL) : '')) + more, leadNum()); } catch (e) {} }
  const line = lsaShort(rec) + ' — ' + (good ? (pm ? 'GOOD, PM ' + pm.name + ' assigned' : 'GOOD, no PM yet (GOOD ' + rec.code + ' <PM>)') + (notes ? ', notes saved' : '') : 'BAD (' + clip(reason || 'no reason given', 40) + '), closed');
  return { res: { handled: true, staff: who.email, lsa: rec.leadId, good, reason: good ? '' : reason, pm: pm ? pm.name : '', pmAsked, notes, saved: r, pmText: pmTx, confirmed: !!(conf && conf.ok) }, line };
}
/* several leads in one reply (lsaParseMulti) → each applied, ONE confirmation with a line per lead */
async function lsaMulti(ph, who, isAdm, list, mp){
  const op = await lsaOpen(list), named = {}, todo = [], dup = [];
  mp.answers.forEach((a, i) => { if (!a.code) return; const rec = list.find(x => x.code === a.code); if (!rec) return;
    if (named[rec.leadId]) { dup.push(a.code); return; } named[rec.leadId] = 1; todo.push({ i, a, rec }); });
  const bare = mp.answers.map((a, i) => ({ i, a })).filter(x => !x.a.code);
  const pool = op.pick.filter(x => !named[x.leadId]);   /* oldest → newest as texted to this phone */
  let askMore = '';
  if (bare.length) {
    /* only the bare words ("bad bad good") go by position; "Bad lead, good luck to them" is not guessed — with details, the code is needed */
    const words = bare.every(b => !b.a.rest);
    if (words && bare.length === pool.length) bare.forEach((b, k) => todo.push({ i: b.i, a: b.a, rec: pool[k], mapped: true }));
    else if (!todo.length) {
      if (who.rep && !words) return null;   /* "Good morning, bad traffic" in a reply window: a text for the customer */
      const txt = !words ? lsaAskText(op.open, list).replace(/\. Nothing saved\.$/, '. With more than one answer, put the code before each. Nothing saved.')
        : pool.length || op.open.length
        ? 'GrayCo: you sent ' + bare.length + ' answer' + (bare.length === 1 ? '' : 's') + ' but ' + pool.length + ' lead' + (pool.length === 1 ? ' is' : 's are') + ' open — nothing saved. ' + lsaAskText(op.open, list).replace(/^GrayCo: /, '').replace(/ Nothing saved\.$/, '')
        : lsaAskText([], list);
      let c = null; try { c = await sendL(ph, txt, leadNum()); } catch (e) {}
      return { handled: true, staff: who.email, multi: true, lsaAsk: 'count', words: bare.length, open: pool.length, asked: !!(c && c.ok) };
    } else askMore = bare.length + ' answer' + (bare.length === 1 ? '' : 's') + ' had no code and ' + (words ? '' : 'details, ') + pool.length + ' other lead' + (pool.length === 1 ? ' is' : 's are') + ' open — not saved' + (pool.length ? '. Open: ' + lsaOpenLine(pool) : '') + '.';
  }
  todo.sort((x, y) => x.i - y.i);
  const results = [], lines = [];
  for (const t of todo) { let r = null; try { r = await lsaApply(ph, who, isAdm, t.a.verb, t.rec, t.a.rest, { quiet: true }); } catch (e) { r = { res: { lsa: t.rec.leadId, error: s(e && e.message) }, line: lsaShort(t.rec) + ' — not saved (error), try again' }; }
    results.push(Object.assign({ code: t.rec.code, verb: t.a.verb, mapped: !!t.mapped }, r.res)); lines.push(r.line); }
  const disp = todo.filter(t => t.a.verb === 'bad' && isAdm && t.rec.isLsa !== false);
  let txt = 'GrayCo: ' + (todo.length ? todo.length + ' lead' + (todo.length === 1 ? '' : 's') + ' updated:\n' + lines.join('\n') : 'nothing saved.');
  /* LSALINKS: every BAD Google LSA lead gets its own dispute link, right under the list (owner 11/19) */
  let dispTxt = '';
  if (disp.length === 1) dispTxt = '\nDispute ' + disp[0].rec.code + ' in Google: ' + (s(disp[0].rec.link) || LSA_LEADS_URL);
  else if (disp.length) disp.forEach(t => { dispTxt += '\nDispute ' + t.rec.code + ' ' + clip(t.rec.name, 24) + ': ' + (s(t.rec.link) || LSA_LEADS_URL); });
  if (dup.length) txt += '\n' + dup.join(', ') + ' answered twice — the first answer counts.';
  if (mp.unclear.length) txt += '\n' + mp.unclear.join(', ') + ': no GOOD / BAD after the code — not saved.';
  if (askMore) txt += '\n' + askMore;
  let c = null, dispSep = false;
  if (dispTxt && (txt + dispTxt).length > 900) dispSep = true; else txt += dispTxt;   /* never cut a dispute link off: too long → its own text right after */
  try { c = await sendL(ph, txt.slice(0, 900), leadNum()); } catch (e) {}
  if (dispSep) { try { await sendL(ph, ('GrayCo: dispute ' + (disp.length === 1 ? 'this lead' : 'these leads') + ' in Google:' + dispTxt).slice(0, 900), leadNum()); } catch (e) {} }
  return { handled: true, staff: who.email, multi: true, lsa: results.length ? results[0].lsa : '', results, summary: todo.map(t => t.a.verb.toUpperCase() + ' ' + t.rec.code).join(', '), confirmed: !!(c && c.ok), notSaved: bare.length && !todo.some(t => t.mapped) ? bare.length : 0, unclear: mp.unclear };
}
const BADP = /^\s*(not\s+a\s+(good|real)\s+lead|no\s+good|not\s+good|bad\s+lead|not\s+a\s+(real\s+)?lead|junk|spam|wrong\s+number)\b/i;
async function pmReplied(leadId){
  leadId = s(leadId); const at = new Date(now()).toISOString();
  if (/^LI-/.test(leadId)) { try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v), x = l.find(y => y && s(y.id) === leadId); if (!x || s(x.pmReplyAt)) return undefined; x.pmReplyAt = at; x.rev = (x.rev || 1) + 1; x.updatedAt = at; return l; }); } catch (e) {} }
  await escClose(leadId, 'reply');
}
/* the customer's portal link for the PM (made if missing; nothing is sent to the customer) */
async function pmPortal(pid){ try { return s(await _D.portalLink(s(pid))); } catch (e) { return ''; } }
/* LEADWATCH (owner 11/19): the assigned PM's reply to his lead text that is not BAD = a GOOD lead: the text goes on the lead / the job's notes, the lead
   is GOOD (the CRM makes it a job, status bidding), an appointment in it goes on the schedule (asked back when it is not clear), and the PM gets the
   job link + the customer's portal link (for him only) */
async function pmInfoNote(ph, who, rec, txt, o){
  o = o || {}; const leadId = s(rec.leadId), crm = /^LI-/.test(leadId) ? 'LEADIN-' + leadId.slice(3) : leadId, at = new Date(now()).toISOString(), by = s(who.name) || low(who.email);
  if (!s(txt)) return { handled: true, staff: who.email, note: 'empty' };
  try { await pmReplied(leadId); } catch (e) {}
  const job = await jobOfLead(leadId);
  let ok = false, saved = null;
  if (/^LI-/.test(leadId)) {
    try { saved = await _D.lsaDecide({ leadId, name: s(rec.name), phone: s(rec.phone), code: s(rec.code), good: true, reason: '', notes: clip(txt, 1000), by, byEmail: low(who.email), pm: { name: by, email: low(who.email) }, keepPm: true, isLsa: rec.isLsa !== false }); ok = !!(saved && saved.inbox); } catch (e) {}
    try { await _D.kvCas(SKEY, v => { const st = loadState(v); lsaMarkDone(st, leadId, 'good'); return st; }); } catch (e) {}
    try { await goodLadder(leadId); } catch (e) {}
  }
  if (job || !/^LI-/.test(leadId)) { const row = { id: 'TN_L_' + crm.replace(/[^A-Za-z0-9]/g, '').slice(-16) + '_' + at.replace(/\D/g, '').slice(0, 14), pid: job ? s(job.id) : '', leadId: crm, text: clip(txt, 1000), by, byEmail: low(who.email), at, via: 'pm-lead-text' };
    try { ok = (await _D.textNote(row)) || ok; } catch (e) {} }
  /* an appointment in the reply → the job's schedule (the PM's), or asked back */
  let appt = null; try { appt = await pmAppt(ph, who, rec, txt, job); } catch (e) { appt = null; }
  const name = clip(job ? s(job.name) : s(rec.name) || 'the lead', 40), link = job ? site().replace(/^https?:\/\//, '') + '/#job=' + encodeURIComponent(s(job.id)) : lwLink(crm);
  const plink = job ? await pmPortal(job.id) : '';
  const msg = ok ? 'GrayCo: Saved to ' + name + ' notes — GOOD lead' + (job ? '. Job: ' + link + (plink ? ' · Customer portal (for you — nothing was sent to the customer): ' + plink : '') : ' (the job is being made — its link and the customer portal link come next). Lead: ' + link)
    + (appt && appt.added ? ' · Added to schedule: ' + appt.nice : '') + (appt && appt.ask ? ' · Did you mean ' + appt.nice + '? Reply YES to add it to the schedule.' : '')
    : 'GrayCo: could not save that note — try again or add it in the CRM: ' + link;
  try { await sendL(ph, msg, leadNum(), undefined, { who: by, leadId: crm, code: s(rec.code), type: 'lead' }); } catch (e) {}
  return { handled: true, staff: who.email, lsa: leadId, note: ok ? 'saved' : 'failed', good: ok, pid: job ? s(job.id) : '', leadId: crm, appt, portal: !!plink };
}
/* "going out tue 2pm", "appt 11/21 at 10" … (America/Chicago) → a site visit / estimate on the job's schedule for the PM; not clear (no am / pm, no
   time) → "Did you mean …? Reply YES" and nothing is added until he says YES */
const APPT_HINT = /\b(today|tonight|tomorrow|tmrw|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|rsday|urday|sday)?\b|\b\d{1,2}\/\d{1,2}\b/i;
async function pmAppt(ph, who, rec, txt, job){
  if (!APPT_HINT.test(txt)) return null;
  const AP = require('./apptparse.js'), r = AP.parse('appt ' + txt, now()); if (!r || !r.ok) return null;
  const clear = r.timeSet && /\d\s*(a|p)\.?m\b|\d\s*(a|p)\b|\bnoon\b|\b\d{1,2}:\d{2}\b/i.test(txt);
  const leadId = s(rec.leadId), crm = /^LI-/.test(leadId) ? 'LEADIN-' + leadId.slice(3) : leadId;
  const kind = /\bestimate|\best\b|quote|measure/i.test(txt) ? 'estimate' : 'sitevisit';
  const row = { id: 'TA_L' + now().toString(36) + Math.random().toString(36).slice(2, 6), lw: true, kind, date: r.date, time: r.time, endTime: r.endTime, pid: job ? s(job.id) : '', leadId: crm, job: job ? clip(s(job.name), 80) : '',
    title: (kind === 'estimate' ? 'Estimate' : 'Site visit') + ' — ' + clip(s(rec.name) || 'lead', 60), customer: clip(s(rec.name), 60), phone: phone10(rec.phone), address: r.address || (job ? s(job.address) : ''),
    code: s(rec.code), by: s(who.name) || low(who.email), byEmail: low(who.email), text: clip(txt, 400), at: new Date(now()).toISOString() };
  const nice = AP.nice(row);
  if (!clear) { await _D.kvCas(SKEY, v => { const st = loadState(v); st.apptAsk = obj(st.apptAsk); st.apptAsk[phone10(ph)] = { row, at: row.at }; return st; }).catch(() => {}); return { ask: true, nice }; }
  let ok = false; try { ok = await _D.textAppt(row); } catch (e) {}
  return { added: ok, nice, row };
}
/* his YES to "Did you mean …?" (30 minutes) */
async function pmApptYes(ph, body, who){
  if (!/^\s*(y|yes|yep|yeah|correct|ok)\b/i.test(s(body))) return null;
  let p0 = null; await _D.kvCas(SKEY, v => { const st = loadState(v); st.apptAsk = obj(st.apptAsk); p0 = st.apptAsk[phone10(ph)] || null; if (!p0) return undefined; delete st.apptAsk[phone10(ph)]; return st; }).catch(() => {});
  if (!p0 || now() - Date.parse(p0.at || 0) > 30 * 60e3 || low(p0.row.byEmail) !== low(who.email)) return null;
  let ok = false; try { ok = await _D.textAppt(p0.row); } catch (e) {}
  const job = await jobOfLead(p0.row.leadId), plink = job ? await pmPortal(job.id) : '';
  try { await sendL(ph, ok ? 'GrayCo: Added to schedule: ' + require('./apptparse.js').nice(p0.row) + ' — ' + p0.row.title + (plink ? ' · Customer portal (for you): ' + plink : '') : 'GrayCo: could not add it — add it in the CRM.', leadNum()); } catch (e) {}
  return { handled: true, staff: who.email, appt: ok ? 'added' : 'failed', date: p0.row.date, time: p0.row.time };
}
/* the CRM made the job from a GOOD lead (texts.js ?lwjob, the admin's page) → the PM gets the job link + the customer's portal link, once */
async function jobReady(leadId, pid){
  leadId = s(leadId); pid = s(pid); const iid = /^LEADIN-/.test(leadId) ? 'LI-' + leadId.slice(7) : leadId;
  let x = null; try { x = await _D.inboxLead(iid); } catch (e) {}
  const job = (await jobOfLead(leadId)) || { id: pid, name: '' };
  const em = low(obj(x).pmEmail || job.pmEmail), pmName = s(obj(x).pm || job.pm); let pm = em ? { email: em, name: pmName } : (pmName ? await pmByName(pmName) : null);
  if (!pm || !pm.email) return { skipped: 'no PM' };
  let claim = false; await _D.kvCas(SKEY, v => { const st = loadState(v); st.lwJob = obj(st.lwJob); if (st.lwJob[leadId]) return undefined; st.lwJob[leadId] = { pid, at: new Date(now()).toISOString() }; claim = true; return st; }).catch(() => {});
  if (!claim) return { already: true };
  const plink = await pmPortal(pid), name = clip(s(job.name) || s(obj(obj(x).contact).name) || 'the lead', 50);
  const text = 'GrayCo: ' + name + ' is a job now (bidding). Job: ' + site().replace(/^https?:\/\//, '') + '/#job=' + encodeURIComponent(pid) + (plink ? ' · Customer portal (for you — nothing was sent to the customer): ' + plink : '');
  return notify({ type: 'assigned', text, body: () => text, link: site() + '/#projects', only: [low(pm.email)], thread: 'lwjob:' + leadId, leadId, hold: true, sqOnly: true });
}
async function lsaReply(ph, body, who){
  const isAdm = lsaAdmins().indexOf(low(who.email)) >= 0;
  const list = await lsaStateList(ph);
  if (!list.length) return null;
  /* LEADWATCH: "QUALIFIED K7Q2" → marked qualified in Google (the GOOD ladder stops) */
  const qm = /^\s*qualified\b[\s:.,!-]*([A-Za-z0-9]{4})?\b/i.exec(s(body));
  if (qm) { const c2 = s(qm[1]).toUpperCase(), r2 = c2 ? list.find(x => x.code === c2) : list.slice(-1)[0];
    if (!r2) { try { await sendL(ph, 'GrayCo: which lead? Reply QUALIFIED <code>. Nothing saved.', leadNum()); } catch (e) {} return { handled: true, staff: who.email, qualified: 'which' }; }
    const rq = await lsaQualifiedG({ leadId: r2.leadId, by: s(who.name) || who.email });
    try { await sendL(ph, 'GrayCo: ' + r2.code + ' ' + clip(r2.name, 40) + (rq.already ? ' was already marked qualified in Google (' + rq.by + ').' : ' marked ✓ qualified in Google — closed for everyone.'), leadNum()); } catch (e) {}
    return { handled: true, staff: who.email, lsa: r2.leadId, qualified: true, already: rq.already }; }
  /* LSAFLOW2: "DISPUTED K7Q2" (or "disputed" = the newest BAD lead texted to this phone) → disputed in Google, closed for everyone */
  const dm = /^\s*disputed?\b[\s:.,!-]*([A-Za-z0-9]{4})?\b[\s\S]*$/i.exec(s(body));
  if (dm) {
    const c1 = s(dm[1]).toUpperCase(); let rec1 = c1 ? list.find(x => x.code === c1) : null;
    if (!rec1 && !c1) rec1 = list.filter(x => x.done === 'bad').slice(-1)[0] || null;
    if (!rec1) { try { await sendL(ph, 'GrayCo: which lead was disputed? Reply DISPUTED <code> (the 4-letter code from the lead text). Nothing saved.', leadNum()); } catch (e) {} return { handled: true, staff: who.email, disputed: 'which lead' }; }
    const rd = await lsaDisputed({ leadId: rec1.leadId, code: rec1.code, name: rec1.name, phone: rec1.phone, by: { name: who.name || who.email, email: who.email }, via: 'text', ph });
    return { handled: true, staff: who.email, lsa: rec1.leadId, disputed: true, already: !!rd.already, closed: rd.closed };
  }
  /* LSASEND (owner 11/10: "send this lead automatically to a PM by saying send lead to PM, so they get assigned and call the lead, then they
     update the GrayCo text … they have to say good or bad and why; if it's bad that goes to admin or office for reasoning and approval"):
     an admin texts "SEND Pat" / "send lead to Pat" / "SEND K7Q2 Pat call after 3" → the lead is Pat's (not yet good), Pat gets the GrayCo text */
  const sm = isAdm ? /^\s*send\b[\s,:-]*(?:the\s+)?(?:lead\s+)?(?:it\s+)?(?:to\s+)?(?:pm\s+)?(?:([A-Z0-9]{4})\b[\s,:-]*)?(?:to\s+)?(.*)$/i.exec(s(body)) : null;
  if (sm) {
    const list0 = list;
    const c0 = s(sm[1]).toUpperCase(), byCode = c0 ? list0.find(x => x.code === c0) : null;
    let rec0 = byCode;
    if (!rec0) { const op0 = await lsaOpen(list0); rec0 = op0.pick.slice(-1)[0] || null;   /* LEADTXT: no code → the newest OPEN lead; none open → ask (never an answered one) */
      if (!rec0) { try { await sendL(ph, lsaAskText(op0.open, list0, 'send'), leadNum()); } catch (e) {} return { handled: true, staff: who.email, send: 'which lead', open: op0.open.length }; } }
    const w0 = (c0 && !byCode ? sm[1] + ' ' : '') + s(sm[2]); const ws = w0.trim().split(/\s+/).filter(Boolean);
    let pm0 = null, nt0 = '';
    for (let k = Math.min(3, ws.length); k >= 1 && !pm0; k--) { const hit = await pmByName(ws.slice(0, k).join(' ').replace(/[,.;:!-]+$/, '')); if (hit) { pm0 = hit; nt0 = ws.slice(k).join(' ').replace(/^[\s,.;:-]+/, '').trim(); } }
    try { await _D.ack(rec0.leadId, 'sent to a PM by text (' + (who.name || who.email) + ')'); } catch (e) {}
    if (!pm0) { try { await sendL(ph, 'GrayCo: who should get ' + rec0.code + ' ' + clip(rec0.name, 40) + '? Reply SEND ' + rec0.code + ' <PM name>.', leadNum()); } catch (e) {} return { handled: true, staff: who.email, lsa: rec0.leadId, send: 'no PM found', asked: w0 }; }
    const r0 = await _D.lsaSend({ leadId: rec0.leadId, name: rec0.name, phone: rec0.phone, code: rec0.code, pm: pm0, notes: nt0, by: who.name || who.email, byEmail: who.email });
    const pmHead = 'GrayCo: ' + (rec0.label || 'Google LSA lead') + ' ' + rec0.code + ' sent to you by ' + s(who.name || 'the office').split(' ')[0] + ': ' + (rec0.phone ? tidy(rec0.phone) + ' ' : '') + clip(rec0.name, 40) + (rec0.said ? ' says "' + clip(rec0.said, 110) + '"' : '') + (nt0 ? ' Note: ' + clip(nt0, 60) + '.' : '');
    /* LEADTXT: the code in the reply hint every time; the longer how-to in a person's first month */
    const pmBody = (more, g) => pmHead + ((!g || g.newbie !== false) ? ' Call them, then reply GOOD ' + rec0.code + ', BAD ' + rec0.code + ' + why, or NA if no answer.' : lsaHint(rec0.code));
    const pmTxt = pmBody(0);
    let toPm = null; try { toPm = await notify({ type: 'lead', lsa: Object.assign({}, rec0, { staffEmail: pm0.email, staffName: pm0.name, sentBy: who.email, codeOnly: false, adminsOnly: false, done: '' }), text: pmTxt, body: pmBody, link: site() + '/#leads', only: [pm0.email], thread: 'lsa:' + rec0.leadId + ':pm', emergency: !!rec0.em }); } catch (e) {}
    await _D.kvCas(SKEY, v => { const st = loadState(v); arr(st.lsa[ph]).forEach(x => { if (x.leadId === rec0.leadId) x.sentTo = pm0.name; }); return st; }).catch(() => {});
    try { await sendL(ph, 'GrayCo: ' + rec0.code + ' ' + clip(rec0.name, 40) + ' sent to ' + pm0.name + (toPm && toPm.sent ? ' (texted)' : ' (no cell on file — they see it in the CRM)') + '. They call; a BAD comes back to you with the Google dispute link.', leadNum()); } catch (e) {}
    return { handled: true, staff: who.email, lsa: rec0.leadId, sent: pm0.name, saved: r0, pmTexted: !!(toPm && toPm.sent) };
  }
  /* LEADWATCH (owner 11/19): the assigned PM's reply to his GrayCo lead text — "BAD <code> why" / "not a good lead" / "no good" → the bad path;
     anything else ("talked to her, wants a new roof, State Farm claim, meet Tue 2pm") → that lead's notes (and the job's once it is a job), dated
     and signed; the PM gets "Saved to <name> notes. Open: <link to the job, else the lead>" */
  const pmRecs = list.filter(x => s(x.staffEmail) && low(x.staffEmail) === low(who.email));
  if (pmRecs.length) { const ay = await pmApptYes(ph, body, who); if (ay) return ay; }   /* his YES to "Did you mean …?" */
  if (pmRecs.length && /^\s*(qualified|disputed?)\b/i.test(s(body))) { /* handled below / above */ }
  else if (pmRecs.length && !LSA_REPLY.test(s(body)) && !lsaParseMulti(body, list.map(x => x.code))) {
    const cm = /\b([A-HJ-NP-Z2-9]{4})\b/.exec(s(body)), byC = cm ? pmRecs.find(x => x.code === cm[1]) : null, rec = byC || pmRecs.slice(-1)[0];
    const txt = byC ? s(body).replace(new RegExp('\\b' + byC.code + '\\b[\\s:.,-]*'), '').trim() : s(body).trim();
    if (BADP.test(txt)) return (await lsaApply(ph, who, false, 'bad', Object.assign({}, rec, { staffEmail: who.email }), txt, {})).res;
    return pmInfoNote(ph, who, rec, txt);
  }
  /* LEADTXT: several leads in one reply */
  const mp = lsaParseMulti(body, list.map(x => x.code));
  if (mp) { const mr = await lsaMulti(ph, who, isAdm, list, mp); if (mr) return mr; return null; }
  let m = LSA_REPLY.exec(s(body));
  if (!m) {   /* LSANAME (owner 11/10: "if I reply with the PM name that means good lead"): just a PM's name (≤ 3 words, one active person) = GOOD + that PM */
    let words = s(body).replace(/[.!,]+$/, '').trim();
    const pmSaid = /^(.+?)\s+(?:is|as|will\s+be)\s+(?:the\s+)?(?:pm|project\s*manager)$/i.exec(words) || /^(?:the\s+)?(?:pm|project\s*manager)\s+(?:is|=|will\s+be)\s+(.+)$/i.exec(words);   /* PMSAID (owner 11/10): "Pat is pm" */
    if (pmSaid) words = s(pmSaid[1]);
    if (!words || words.split(/\s+/).length > 3) return null;
    const open0 = (await lsaOpen(list)).pick;
    if (!open0.length || !(await pmByName(words))) return null;
    m = ['', 'good', '', words];
  }
  let code = s(m[2]).toUpperCase(), rec = code ? list.find(x => x.code === code) : null, reason = s(m[3]);
  if (/^(g|b|yes|no|na|n\/a|vm|👍|👎)$/i.test(m[1]) && reason) return null;   /* "No problem, see you then" is a reply to the customer, not BAD */
  if (code && !rec) { reason = (m[2] + ' ' + reason).trim(); code = ''; }
  let more = '';
  if (!rec) {   /* LEADTXT: no code → the newest OPEN lead (as before); none open → ask, never re-mark an answered lead */
    const op = await lsaOpen(list);
    rec = op.pick.slice(-1)[0] || null;
    if (!rec) {
      if (who.rep) return null;   /* a reply window is open: "Good morning …" goes on to that person as before */
      let c = null; try { c = await sendL(ph, lsaAskText(op.open, list), leadNum()); } catch (e) {}
      return { handled: true, staff: who.email, lsaAsk: 'which lead', open: op.open.length, asked: !!(c && c.ok) };
    }
    const others = op.open.filter(x => x.leadId !== rec.leadId);
    if (others.length) more = ' Also open: ' + lsaOpenLine(others) + ' — add the code to answer those.';
  }
  const verb = /^(no[\s-]*answer|noanswer|n\/a|na|vm|voice\s*mail)$/i.test(m[1]) ? 'na' : /^(good|g|👍|yes)$/i.test(m[1]) ? 'good' : 'bad';
  return (await lsaApply(ph, who, isAdm || !!rec.officeAssign, verb, rec, reason, { more })).res;   /* LEADWATCH: the office answers the "please assign" text like an owner */
}
/* LEADTEXT: what kind of lead the text names, and what is a bid (not texted this way) */
function leadLabel(r, x){
  const it = Object.assign({}, r || {}, x || {}), ex = obj(it.leadExtra), src = [it.source, it.leadSource, ex.leadSource, ex.websiteForm, it.websiteForm, it.origin].map(s).join(' ');
  if (isLsaLead(r, x)) return (ex.lsaCall || it.lsaCall) ? 'Google LSA call to the office' : 'Google LSA lead';   /* LSACALL */
  if (ex.textMessage || it.textMessage || /text message/i.test(src)) return 'text lead';
  if (ex.missedCall || it.missedCall || /missed call/i.test(src)) return 'missed-call lead';
  if (/website|web ?form|instant roof|roof ?price|grayco-cs\.com/i.test(src) || it.websiteLead) return 'GrayCo website lead';
  const nm = s(it.source || ex.leadSource).replace(/\s+lead$/i, '');
  return nm ? clip(nm, 24) + ' lead' : 'new lead';
}
function bidLike(r, x){
  const it = Object.assign({}, r || {}, x || {}), ty = low(it.type || it.leadKind);
  return /bid|commercial|gov/.test(ty) || !!s(it.bidDue) || !!s(it.gc || it.dueToCompany) || BID_BOARDS.test([it.source].concat(arr(it.sources).map(y => s(y && y.name || y))).join(' ')) || isSubBid(obj(r), obj(x));
}
/* JOBNOTE (owner 11/10: "I want the other number to be where I can update any job — if I put a PO and then notes, it goes in that job's notes"):
   a staff text that starts with a job's PO ("S251 dumpster pulled, final walk Friday", "#S251: …") → the note on that job (gc_kv
   "gc_text_notes"; the CRM page adds it to the job's notes, dated and signed). Admins: any job; anyone else: a job they are the PM /
   APM / estimator / superintendent on. The sender gets "Added to S251 <job>" back. Nothing goes to a customer. */
/* JOBFIND (owner 11/10: "for appointments by text use address, customer name, PO, job name as the indicator of which job the update goes to"):
   the one live job the words point to — a PO (S251), a house number + street, the customer's full name, or the job name; two or more
   candidates → none (the text says so). */
function normA(v){ return low(v).replace(/[.,#]/g, ' ').replace(/\b(street|st)\b/g, 'st').replace(/\b(road|rd)\b/g, 'rd').replace(/\b(avenue|ave)\b/g, 'ave').replace(/\b(drive|dr)\b/g, 'dr').replace(/\b(lane|ln)\b/g, 'ln').replace(/\b(cove|cv)\b/g, 'cv').replace(/\s+/g, ' ').trim(); }
function findJob(text, data){
  const del = arr(data.gc_deleted_projects).map(x => s(x && (x.id || x))).concat(Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects.map(String) : []);
  const jobs = (Array.isArray(data.projects) ? data.projects : []).filter(j => j && j.id && !j.deleted && del.indexOf(s(j.id)) < 0 && !/^(closed|cancel)/i.test(s(j.status)));
  const tx = ' ' + normA(text) + ' ', one = l => l.length === 1 ? l[0] : null;
  const pos = (s(text).match(/\b[A-Za-z]\d{3,5}\b/g) || []).map(x => x.toUpperCase());
  let m = one(jobs.filter(j => [j.autoPO, j.po, j.poNumber].some(x => s(x) && pos.indexOf(s(x).toUpperCase()) >= 0))); if (m) return { job: m, by: 'PO' };
  const am = /\b(\d{2,6})\s+([a-z][a-z.']+)/.exec(normA(text));
  if (am) { m = one(jobs.filter(j => { const a = normA(j.address || j.jobAddress); return a && new RegExp('^\\s*' + am[1] + '\\s+' + am[2].replace(/[.']/g, '') + '\\b').test(a.replace(/[.']/g, '')); })); if (m) return { job: m, by: 'address' }; }
  const nameHit = v => { v = normA(v); return v.length >= 4 && tx.indexOf(' ' + v + ' ') >= 0; };
  m = one(jobs.filter(j => nameHit(j.name))); if (m) return { job: m, by: 'job name' };
  m = one(jobs.filter(j => nameHit(j.client || j.customer || j.clientName))); if (m) return { job: m, by: 'customer' };
  const many = jobs.filter(j => nameHit(j.client) || nameHit(j.name)).length;
  return many > 1 ? { many } : null;
}
async function jobNote(ph, body, who){
  /* JOBFIND: "note <PO / address / customer / job name>: the note" also works */
  const nmx = /^\s*note\s+(.{3,80}?)\s*[:\-–—]\s+([\s\S]{2,})$/i.exec(s(body));
  if (nmx) { let data0 = {}; try { data0 = await _D.jobs(); } catch (e) { return null; } const f = findJob(nmx[1], data0);
    if (!f || !f.job) { try { await sendL(ph, f && f.many ? 'GrayCo: "' + clip(nmx[1], 40) + '" matches ' + f.many + ' jobs — use the PO (e.g. S251) or the street address. Note not added.' : 'GrayCo: no job found for "' + clip(nmx[1], 40) + '" — use the PO, the street address, the customer or the job name. Note not added.', fromNum()); } catch (e) {} return { handled: true, staff: who.email, jobNote: 'no job' }; }
    const po0 = s(f.job.autoPO || f.job.po || f.job.poNumber) || s(f.job.id);
    body = po0 + ' ' + nmx[2];
  }
  const m = /^\s*#?\s*([A-Za-z]\d{3,5})\b[\s:,.;-]*([\s\S]+)$/.exec(s(body)); if (!m || s(m[2]).length < 2) return null;
  const po = m[1].toUpperCase(), note = s(m[2]).slice(0, 1000);
  let data = {}; try { data = await _D.jobs(); } catch (e) { return null; }
  const del = arr(data.gc_deleted_projects).map(x => s(x && (x.id || x))).concat(Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects.map(String) : []);
  const jobs = (Array.isArray(data.projects) ? data.projects : []).filter(j => j && j.id && !j.deleted && del.indexOf(s(j.id)) < 0 && [j.autoPO, j.po, j.poNumber].some(x => s(x).toUpperCase() === po));
  if (!jobs.length) return null;   /* not a job PO: the normal path goes on */
  const j = jobs[0], email = low(who.email), nm = low(who.name);
  const mine = [j.pm, j.apm, j.estimator, j.superintendent, j.super, j.pmName].map(low).filter(Boolean).some(x => x === nm || x === email) || [j.pmEmail, j.estimatorEmail].map(low).indexOf(email) >= 0;
  if (lsaAdmins().indexOf(email) < 0 && !mine) { try { await sendL(ph, 'GrayCo: ' + po + ' is not one of your jobs — note not added.', fromNum()); } catch (e) {} return { handled: true, staff: email, jobNote: 'not yours', po }; }
  const at = new Date(now()).toISOString(), row = { id: 'TN_' + po + '_' + at.replace(/\D/g, '').slice(0, 14), pid: s(j.id), po, text: note, by: s(who.name) || email, byEmail: email, at };
  let ok = false; try { ok = await _D.textNote(row); } catch (e) {}
  try { await sendL(ph, ok ? 'GrayCo: added to ' + po + ' ' + clip(j.name, 40) + ' notes. ' + site().replace(/^https?:\/\//, '') + '/?jobmsg=' + encodeURIComponent(s(j.id)) : 'GrayCo: could not save the note on ' + po + ' — try again or add it in the CRM.', fromNum()); } catch (e) {}
  return { handled: true, staff: email, jobNote: ok ? 'added' : 'failed', po, pid: s(j.id) };
}
/* LSAPM: a PM by what was texted — full name, first name, last name or e-mail name (one active staff person, else nobody) */
async function pmByName(q){
  q = low(q).replace(/[^a-z0-9@.\s'-]/g, ' ').replace(/\s+/g, ' ').trim(); if (!q) return null;
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const users = arr(pp.users).filter(u => u && s(u.name) && isActiveUser(u) && staffEmail(low(u.email)));
  const tries = [u => low(u.name) === q, u => low(u.email).split('@')[0] === q || low(u.email) === q, u => low(u.name).split(' ')[0] === q, u => low(u.name).split(' ').slice(-1)[0] === q, u => low(u.name).indexOf(q) === 0];
  for (const f of tries) { const hit = users.filter(f); if (hit.length === 1) return { name: s(hit[0].name), email: low(hit[0].email) }; if (hit.length > 1) return null; }
  return null;
}
/* ── LSAFLOW (owner 11/10: "send immediate texts from our text number to these leads to qualify them as real, and after we verify
   it will say here is your project manager's number and they will be calling you shortly" · "once the lead is good send it to
   admin for approval and who to be PM, then the lead needs to be contacted by that PM"):
   1. a new Google LSA lead with a cell → at once, from the GrayCo number: "Hi Pat, this is GrayCo … reply YES to confirm" (a
      customer text: 7 PM–7 AM it waits for 7 AM unless it is an emergency; never to a number that texted STOP or declined texts;
      LSA_QUALIFY_OFF=1 turns it off).
   2. their YES → "Thank you — confirmed …" back, the owners get "✅ <code> <name> confirmed by text", the lead is marked
      lsaVerified (the text also lands on the lead as usual).
   3. the owners mark it GOOD (text or CRM) → it waits in ✅ Approvals for an admin to approve / pick the PM (an LSA lead never
      auto-assigns at 5 PM — lead-hold.js lsaWait).
   4. the PM is assigned → the customer gets "Your GrayCo project manager is <PM> — <phone>. They will be calling you shortly."
      (once per lead; not for a lead marked BAD) and the PM gets the normal assigned alert + the 4 h / 24 h reach-out reminders. */
const YES = /^\s*(y|yes|yeah|yep|yup|confirm(ed)?|correct|real|si|sí|👍|ok(ay)?)\b/i;
function firstOf(n){ const f = s(n).split(/\s+/)[0]; return /^(unknown|customer|lead|google)$/i.test(f) ? '' : f; }
/* WEBTEXT (owner 11/10: "website leads can have the auto text too"): a website lead with a cell gets one text from the GrayCo number right
   away — daytime: we got it, someone calls shortly, reply with details / photos; 7 PM – 7 AM: the office is closed, we call in the morning
   (Monday after Fri / Sat), what do you need + the address, EMERGENCY. Once per phone + lead; STOP / declined numbers are never texted. */
async function webAsk(ph, o){
  if (env('WEB_TEXT_OFF') === '1' || phone10(ph).length !== 10) return { skipped: 'no cell / off' };
  ph = phone10(ph);
  if (await _D.paused()) return { skipped: 'data-entry mode' };
  const opt = await _D.optouts(); if (opt[ph]) return { skipped: 'texted STOP' };
  if (await _D.consentNo(ph)) return { skipped: 'declined texts' };
  let claim = false; const at = new Date(now()).toISOString();
  await _D.kvCas(SKEY, v => { const st = loadState(v); claim = false; if (st.lsaCust[ph] && st.lsaCust[ph].leadId === o.leadId) return undefined; st.lsaCust[ph] = { leadId: o.leadId, name: clip(o.name, 60), at, stage: 'web' }; claim = true; return st; });
  if (!claim) return { skipped: 'already texted' };
  const f = firstOf(o.name), svc = clip(s(o.svc).replace(/[_-]+/g, ' '), 50), about = svc && !/^(general|other|contact|estimate)$/i.test(svc) ? ' about ' + svc.toLowerCase() : '';
  const night = false;   /* CUSTTEXT2 (owner 11/19: customer texts obey the customer quiet hours): no night wording — a text asked for at night is held and goes at 7 AM with the day wording */
  let body;
  if (night) { const wd = new Date(now() + 6 * 3600e3).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short' });
    body = 'Hi' + (f ? ' ' + f : '') + ', this is GrayCo Construction Services. We got your request from our website' + about + '. Our office is closed now — we\'ll call you ' + (/^(Sat|Sun)/.test(wd) ? 'on Monday morning' : 'in the morning') + '. To help us get ready, reply with what you need help with (roof, water damage, remodel…) and the property address. If water is coming in or it\'s an emergency, reply EMERGENCY. Reply STOP to opt out.'; }
  else body = 'Hi' + (f ? ' ' + f : '') + ', this is GrayCo Construction Services. We got your request from our website' + about + ' — someone from our team will call you shortly. Reply here with any details or photos that help. Reply STOP to opt out.';
  const r = await sendL(ph, body.slice(0, 480), env('TWILIO_FROM'), o.em ? 'emergency' : 'customer', { kind: 'customer', leadId: s(o.leadId) });   /* CUSTTEXT2: the customer quiet hours hold it */
  return { sent: !!(r && r.ok), night };
}
async function lsaAsk(ph, o){
  if (env('LSA_QUALIFY_OFF') === '1' || phone10(ph).length !== 10) return { skipped: 'no cell / off' };
  ph = phone10(ph);
  if (await _D.paused()) return { skipped: 'data-entry mode' };
  const opt = await _D.optouts(); if (opt[ph]) return { skipped: 'texted STOP' };
  if (await _D.consentNo(ph)) return { skipped: 'declined texts' };
  let claim = false; const at = new Date(now()).toISOString();
  await _D.kvCas(SKEY, v => { const st = loadState(v); claim = false; if (st.lsaCust[ph] && st.lsaCust[ph].leadId === o.leadId) return undefined; st.lsaCust[ph] = { leadId: o.leadId, code: o.code, name: clip(o.name, 60), at, stage: 'asked' }; claim = true; return st; });
  if (!claim) return { skipped: 'already asked' };
  const f = firstOf(o.name), svc = clip(s(o.svc).replace(/^(google\s*lsa|local services)[:\s-]*/i, ''), 50);
  /* NIGHTREPLY (owner 11/10: "the overnight texts from LSA with customers — are we doing general texts back to them, making sure we know what
     type of job they have, what help they need, and that we will call tomorrow"): 7 PM – 7 AM the customer gets an answer right away (a reply to
     the request they just made — tagged 'reply', so the customer quiet hours let it through): we got it, we'll call in the morning, what do you
     need, the address; EMERGENCY gets the on-call path (their reply is read like any customer text). */
  const night = false;   /* CUSTTEXT2 (owner 11/19: customer texts obey the customer quiet hours): no night wording — a text asked for at night is held and goes at 7 AM with the day wording */
  if (night) {
    const wd = new Date(now() + 6 * 3600e3).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short' });   /* the day after the night's 6 AM side */
    const when = /^(Sat|Sun)/.test(wd) ? 'on Monday morning' : 'in the morning';
    const nb = 'Hi' + (f ? ' ' + f : '') + ', this is GrayCo Construction Services. We got your request through Google' + (svc ? ' about ' + svc.toLowerCase() : '') + '. Our office is closed now — we\'ll call you ' + when + '. To help us get ready, reply with what you need help with (roof, water damage, remodel…) and the property address. If water is coming in or it\'s an emergency, reply EMERGENCY. Reply STOP to opt out.';
    const rn = await sendL(ph, nb.slice(0, 480), env('TWILIO_FROM'), 'customer', { kind: 'customer', leadId: s(o.leadId) });   /* CUSTTEXT2: the customer quiet hours hold it (was 'reply') */
    await _D.kvCas(SKEY, v => { const st = loadState(v); if (st.lsaCust[ph]) st.lsaCust[ph].stage = 'night'; return st; }).catch(() => {});
    return { sent: !!(rn && rn.ok), night: true };
  }
  const body = 'Hi' + (f ? ' ' + f : '') + ', this is GrayCo Construction Services. We received your request through Google' + (svc ? ' about ' + svc.toLowerCase() : '') + '. Reply YES to confirm you\'d like a call and a GrayCo project manager will reach out to you shortly. Reply STOP to opt out.';   /* CUSTTEXT2: no PM name / number promised */
  const r = await sendL(ph, body.slice(0, 320), env('TWILIO_FROM'), o.em ? 'emergency' : 'customer');
  return { sent: !!(r && r.ok), held: !!(r && r.held) };
}
/* a text from a customer (missed-call.js, before the normal path): their YES to the qualify text. Never stops the normal path. */
async function lsaCustomer(ph, body){
  ph = phone10(ph); if (ph.length !== 10) return null;
  let rec = null; await _D.kvCas(SKEY, v => { rec = loadState(v).lsaCust[ph] || null; return undefined; }).catch(() => {});
  if (!rec || rec.stage !== 'asked' || !YES.test(s(body))) return null;
  const at = new Date(now()).toISOString();
  await _D.kvCas(SKEY, v => { const st = loadState(v); if (st.lsaCust[ph]) { st.lsaCust[ph].stage = 'yes'; st.lsaCust[ph].yesAt = at; } return st; }).catch(() => {});
  let saved = null; try { saved = await _D.lsaVerified(rec.leadId); } catch (e) {}
  let ack = null; try { ack = await sendL(ph, 'Thank you' + (firstOf(rec.name) ? ', ' + firstOf(rec.name) : '') + ' — you\'re confirmed. A GrayCo project manager will reach out to you shortly.', env('TWILIO_FROM'), 'customer'); } catch (e) {}
  let told = null; try { told = await notify({ type: 'lead', lsa: { leadId: rec.leadId, code: rec.code, name: rec.name, phone: ph }, text: '✅ ' + rec.code + ' ' + clip(rec.name, 40) + ' ' + tidy(ph) + ' confirmed by text (YES). Reply GOOD ' + rec.code + ' or BAD ' + rec.code + ' + why.', link: site() + '/#leads', only: lsaAdmins(), thread: 'lsa:' + rec.leadId + ':yes' }); } catch (e) {}
  return { lsaVerified: rec.leadId, saved, acked: !!(ack && ack.ok), told: told && told.sent };
}
/* the PM is set on an LSA lead (bid-alerts.js notifyAssigned) → the customer gets the PM's name and number, once */
/* CUSTTEXT2 (owner 11/19): "if the lead is good, a PM will reach out shortly" — on GOOD / when a PM is given the lead (Google LSA or website
   lead), once per lead: no PM name or number unless ⚡ "Lead: name the PM …" (lead_good_text_pm) is on; then a new PM later is told once more.
   ⚡ "Lead: PM will reach out shortly" (lead_good_text) OFF → nothing. Data-entry mode → nothing; the customer quiet hours hold it ('customer'). */
async function goodCust(leadId, pm){
  if (!(await require('./automations.js').isOn('lead_good_text').catch(() => false))) return { skipped: 'switch off' };
  let x = null; try { x = await _D.inboxLead(s(leadId)); } catch (e) { x = null; } if (!x) return { skipped: 'not in the inbox' };
  pm = pm || {}; return lsaPmText(x, { assignee: s(pm.name) || s(x.pm), assigneeEmail: low(pm.email || x.pmEmail) });
}
async function lsaPmText(lead, x){
  lead = obj(lead); if (!isLsaLead(lead, {}) && !LWc().kindOf(Object.assign({}, obj(lead.leadExtra), lead)).match(/^website$/)) return null;
  if (!(await require('./automations.js').isOn('lead_good_text').catch(() => false))) return { skipped: 'switch off' };
  const named = await require('./automations.js').isOn('lead_good_text_pm').catch(() => false);
  const ex = obj(lead.leadExtra), chk = s(lead.lsaCheck || ex.lsaCheck);
  if (/bad/.test(chk) || /lost|dismiss/i.test(s(lead.status))) return { skipped: 'marked bad' };
  const c = obj(lead.contact), ph = phone10(c.phone || lead.phone || ex.smsFrom); if (ph.length !== 10) return { skipped: 'no cell' };
  const email = low(x && x.assigneeEmail), pmName = s(x && x.assignee) || (named ? '' : 'pm'); if (!pmName) return { skipped: 'no PM' };
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const u = arr(pp.users).find(y => y && (low(y.email) === email || low(y.name) === low(pmName))) || {};
  const pmPh = phone10(u.cell || u.mobile || u.phone);
  if (await _D.paused()) return { skipped: 'data-entry mode' };
  const opt = await _D.optouts(); if (opt[ph]) return { skipped: 'texted STOP' };
  if (await _D.consentNo(ph)) return { skipped: 'declined texts' };
  const id = s(lead.inboxId) || s(lead.id).replace(/^LEADIN-/, 'LI-'); let claim = false;   /* LEADWATCH: one key for the inbox item and its CRM lead */
  let again = false;   /* PMCHANGE (owner 11/10): a new PM later → "your GrayCo project manager is now …" (once per PM) */
  await _D.kvCas(SKEY, v => { const st = loadState(v); claim = false; again = false; const was = st.lsaPm[id]; const seen = was && typeof was === 'object' ? (Array.isArray(was.pms) ? was.pms.filter(Boolean) : []) : (was ? ['?'] : []);
    if (seen.indexOf(email || low(pmName)) >= 0 || (typeof was === 'string' && !email) || (!named && seen.length)) return undefined;   /* CUSTTEXT2: unnamed → once per lead */
    if (typeof was === 'string' && seen.length) { st.lsaPm[id] = { at: was, pms: [email || low(pmName)], legacy: true }; claim = false; return st; }
    again = seen.length > 0; st.lsaPm[id] = { at: new Date(now()).toISOString(), pms: seen.filter(x => x !== '?').concat([email || low(pmName)]) }; claim = true; return st; });
  if (!claim) return { skipped: 'already sent' };
  const f = firstOf(c.name || lead.name);
  const body = named && s(x && x.assignee) ? 'Hi' + (f ? ' ' + f : '') + ', your GrayCo project manager is ' + (again ? 'now ' : '') + pmName + (pmPh.length === 10 ? ' — ' + tidy(pmPh) : '') + '. They will be calling you shortly. — GrayCo Construction Services'
    : 'Hi' + (f ? ' ' + f : '') + ', thanks for reaching out to GrayCo Construction Services. A project manager will reach out to you shortly.';   /* CUSTTEXT2: no name / number by default */
  const r = await sendL(ph, body.slice(0, 320), env('TWILIO_FROM'), 'customer');
  return { sent: !!(r && r.ok), to: ph, pm: pmName };
}
/* "<head>: <who> — "<message…>" <link>" in ≤ 300 characters; the message is what gets trimmed */
function leadText(head, more, who, msg, link){
  const h = head + (more ? ' (+' + more + ' more)' : '') + ': ' + who, tail = ' ' + link;
  msg = s(msg).replace(/\s+/g, ' ');
  if (!msg) return clip(h, MAX - tail.length) + tail;
  const room = MAX - h.length - tail.length - 5;   /* ' — "' + '"' */
  if (room < 12) return clip(h, MAX - tail.length) + tail;
  return h + ' — "' + clip(msg, room) + '"' + tail;
}
/* APPTTEXT (owner 11/10): a staff text "appt / meeting / estimate / new job … <day> <time> [address]" → that person's 👤 My schedule in the CRM
   (gc_kv "gc_text_appts"; the CRM page adds it to the schedule as a personal item, and "new job" also makes a lead for them).
   A lead code from a GrayCo lead text ("appt K7Q2 thu 2pm") uses that lead's name and number. */
async function apptText(ph, body, who){
  const AP = require('./apptparse.js'), r = AP.parse(body, now()); if (!r) return null;
  if (!r.ok) { try { await sendL(ph, 'GrayCo: what day and time? e.g. "appt John Smith thu 2pm 123 Main St". Nothing saved.', leadNum()); } catch (e) {} return { handled: true, staff: who.email, appt: 'no day' }; }
  let lead = null;
  if (r.code) { await _D.kvCas(SKEY, v => { const st = loadState(v); lead = arr(st.lsa[phone10(ph)]).filter(x => x.code === r.code).slice(-1)[0] || null; return undefined; }).catch(() => {}); }
  let fj = null; if (!lead) { try { fj = findJob(body.replace(/^\s*\S+(\s+job)?/i, ' '), await _D.jobs()); } catch (e) { fj = null; } }   /* JOBFIND */
  const J = fj && fj.job, jpo = J ? s(J.autoPO || J.po || J.poNumber) : '';
  const at = new Date(now()).toISOString(), row = { id: 'TA_' + now().toString(36) + Math.random().toString(36).slice(2, 6), kind: r.kind, date: r.date, time: r.time, endTime: r.endTime,
    pid: J ? s(J.id) : '', job: J ? clip(s(J.name), 80) : '', po: jpo,
    title: lead ? (r.title.split(' — ')[0] + ' — ' + clip(lead.name, 60)) : J ? (r.title.split(' — ')[0] + ' — ' + (jpo ? jpo + ' ' : '') + clip(s(J.name || J.client), 60)) : r.title, customer: lead ? clip(lead.name, 60) : J ? clip(s(J.client), 60) || r.customer : r.customer, phone: lead ? phone10(lead.phone) : r.phone || (J ? phone10(J.clientPhone || J.phone) : ''), address: r.address || (J ? s(J.address) : ''),
    leadId: lead ? s(lead.leadId) : '', code: r.code || '', by: s(who.name) || who.email, byEmail: low(who.email), text: clip(body, 400), at };
  let ok = false; try { ok = await _D.textAppt(row); } catch (e) {}
  try { await sendL(ph, ok ? 'GrayCo: on your schedule — ' + row.title + ' · ' + AP.nice(row) + (row.address ? ' · ' + clip(row.address, 50) : '') + (row.pid ? ' · on job ' + (row.po ? row.po + ' ' : '') + clip(row.job, 30) : '') + (r.kind === 'newjob' && !row.leadId && !row.pid ? ' · a lead is made for you' : '') + '. ' + site().replace(/^https?:\/\//, '') + '/#schedule' : 'GrayCo: could not save it — try again or add it in the CRM.', leadNum()); } catch (e) {}
  return { handled: true, staff: who.email, appt: ok ? 'added' : 'failed', date: row.date, time: row.time };
}
/* LSAVET: the office says a Google LSA call is real → the owners' cells, in the lead shape with the number to tap
   o = { leadId, phone, name, note, by } */
async function lsaVetted(o){
  o = o || {}; await loadOwners();   /* OWNERROLE */ const id = s(o.leadId), ph = phone10(o.phone); if (!id || ph.length !== 10) return { sent: 0, why: 'need the lead and a 10-digit number' };
  const code = lsaCode(id), name = clip(s(o.name).replace(/^Google LSA caller.*$/i, '') || 'Google LSA caller', 40), label = 'Google LSA call to the office';
  const link = site().replace(/^https?:\/\//, '') + '/#leads&lead=' + encodeURIComponent(id);
  const lt = (more, g) => { const head = 'GrayCo: ' + label + ' ' + code + (more ? ' (+' + more + ' more)' : '') + ' from ' + tidy(ph) + ' ' + name + '. ✅ ' + clip(s(o.by) || 'Office', 24) + ' says it\'s real' + (s(o.note) ? ': "' + clip(o.note, 90) + '"' : '') + '.',
      tail = lsaHint(code) + ((!g || g.newbie !== false) ? lsaHowto(code) : '');   /* LEADTXT */
    return head + ' ' + link + tail; };
  return notify({ type: 'lead', lsa: { leadId: id, code, name, phone: ph, link: '', said: clip(s(o.note), 140), em: false, isLsa: true, label }, text: lt(0), body: lt, link: site() + '/#leads', only: lsaAdmins(), thread: 'p:' + ph });
}
/* a lead assigned later (bid-alerts.js notifyAssigned) */
async function assigned(x, raw){
  /* LSAFLOW2 (owner 11/19: "when we assign it, it's sent to the PM"): a Google LSA lead given to a PM — any way (GOOD <code> <PM> by text,
     the CRM, the office) — → the PM's GrayCo text (pmAssignText: name, number, job type, recording, notes, the CRM link, "Reply BAD …"),
     once per lead and PM */
  let y = null; try { const key = s(x.key || x.id), iid = /^LEADIN-/.test(key) ? 'LI-' + key.slice(7) : key;
    y = arr(await _D.kvGet('gc_lead_inbox')).find(z => z && (s(z.id) === iid || s(z.id) === key)) || null; } catch (e) {}
  if (y && isLsaLead(y, y) && low(x.assigneeEmail)) {
    const r = await pmAssignText({ name: s(x.assignee), email: low(x.assigneeEmail) }, { leadId: s(y.id), by: s(x.assignedBy).replace(/\s*\(text[^)]*\)\s*$/, ''), item: y });
    return r && r.already ? { sent: 0, already: true, to: [low(x.assigneeEmail)] } : r;
  }
  /* LEADWATCH (owner 11/19: "get sent to PM"): every customer lead given to a PM — any way — → the PM's GrayCo lead text by their CRM cell
     (name, number, what they asked, the CRM link), once per lead and PM, whether or not they are on the 📱 Text alerts list */
  const lw = Object.assign({}, obj(y), obj(raw)); if (!s(lw.id)) lw.id = s(x.key || x.id); if (y && !s(lw.inboxId)) lw.inboxId = s(y.id);
  if (low(x.assigneeEmail) && LWc().isCustomer(lw)) { const r2 = await pmLeadText({ name: s(x.assignee), email: low(x.assigneeEmail) }, lw, { by: s(x.assignedBy) }); return r2 && r2.already ? { sent: 0, already: true, to: [low(x.assigneeEmail)] } : r2; }
  return notify({ type: 'assigned', text: 'lead assigned to you: ' + clip(x.title, 60) + (x.assignedBy ? ' (by ' + clip(x.assignedBy, 24) + ')' : ''), link: site() + '/#leads', thread: 'lead:' + s(x.key || x.id), mine: [x.assigneeEmail], leadId: s(x.key || x.id) });   /* TEXTEDPM: on the lead's timeline */
}
/* ── LEADWATCH (owner 11/19: "I need to make sure all my leads don't get ignored, get sent to PM etc.") ──
   pmLeadText  — a customer lead (not Google LSA: pmAssignText) given to a PM → "GrayCo: website lead K7Q2 for you: <name> 📞 <number> …
                 CRM: <link>", by the PM's CRM cell, once per lead and PM (staff quiet hours: held to 7 AM; an emergency goes at once)
   speedText   — the speed-to-lead clock (bid-alerts.js speedToLead): no PM 4 h / 24 h → the owners "👤 Assign …"; the PM has not marked
                 it contacted 24 h after it was assigned → the PM "⏰ Reach out …"; 48 h → the owners "⚠️ <PM> has not contacted …"
   bidDueText  — a bid invite's own due reminders (1 hour / today / tomorrow) → the Estimator role only
   Staff only (the owners by role, the lead's PM, the estimators). Nothing here ever texts a customer. */
function lwLink(id){ id = s(id); return site().replace(/^https?:\/\//, '') + '/#leads&lead=' + encodeURIComponent(/^LI-/.test(id) ? 'LEADIN-' + id.slice(3) : id); }
/* LEADWATCH (owner 11/19): "the link in the PM's texts should point to the job once it exists, else the lead" — #job=<id> opens the job (phone
   and desk), #leads&lead=<id> the lead */
async function jobOfLead(id){ id = s(id); const crm = /^LI-/.test(id) ? 'LEADIN-' + id.slice(3) : id; let data = {}; try { data = await _D.jobs(); } catch (e) { return null; }
  return arr(data.projects).find(p => p && p.id && !p.deleted && (s(p.leadId) === crm || s(p.leadId) === id)) || null; }
async function lwLinkFor(id){ const j = await jobOfLead(id); return j ? site().replace(/^https?:\/\//, '') + '/#job=' + encodeURIComponent(s(j.id)) : lwLink(id); }
function lwWho(l){ l = obj(l); const c = obj(l.contact), ex = obj(l.leadExtra); const nm = clip(s(c.name) || s(l.contactName) || s(ex.contactName) || s(l.name || l.title) || 'New lead', 40), ph = phone10(c.phone || l.phone || ex.phone);
  return { nm, ph, line: nm + (ph.length === 10 ? ' 📞 ' + tidy(ph) : '') }; }
async function pmLeadText(pm, lead, o){
  pm = pm || {}; o = o || {}; const em = low(pm.email), l = obj(lead), leadId = s(l.id); if (!em || !leadId) return { skipped: 'no PM' };
  const ex = obj(l.leadExtra), w = lwWho(l), code = lsaCode(s(l.inboxId) || leadId), label = leadLabel(l, l);
  let msg = ''; try { msg = require('./leadmsg.js').collect(Object.assign({}, l, { leadExtra: Object.assign({ said: obj(l.said) }, ex) })).message; } catch (e) {}   /* a CRM lead keeps "said" on itself */
  const job = clip(s(ex.service || l.service || l.websiteForm || ex.websiteForm), 34), addr = clip(s(l.address), 50), emg = !!(l.emergency || ex.emergency);
  let byN = s(o.by).replace(/\s*\((by )?text[^)]*\)\s*$/i, ''); if (/@|^auto|lead inbox|system/i.test(byN)) byN = '';
  let claim = false;
  await _D.kvCas(SKEY, v => { const st = loadState(v); claim = false; if (low(obj(st.lsaPmTx[leadId]).pm) === em) return undefined; st.lsaPmTx[leadId] = { pm: em, at: new Date(now()).toISOString() }; claim = true; return st; }).catch(() => { claim = true; });
  if (!claim) return { already: true };
  const said = s(msg).replace(/\s+/g, ' '), head = 'GrayCo: ' + label + ' ' + code + ' for you' + (byN ? ' from ' + clip(byN.split(/\s+/)[0], 20) : '') + ': ' + w.line + (job ? ' · ' + job : '') + (addr ? ' · ' + addr : '');
  const tail = ' CRM: ' + (await lwLinkFor(leadId)) + ' Call them, then tap ✅ Contacted on the lead (or reply here with what they said — it goes on the lead).', room = MAX - head.length - tail.length - 4;
  const text = head + (said && room > 16 ? ' "' + clip(said, room) + '"' : '') + tail;
  const res = await notify({ type: 'assigned', text, body: () => text, link: site() + '/#leads', only: [em], mine: [em], thread: 'lead:' + leadId + ':pm:' + em, leadId, hold: true, sqOnly: true, emergency: emg,
    lsa: { leadId: s(l.inboxId) || leadId, code, name: w.nm, phone: w.ph, link: '', said: '', em: emg, isLsa: false, fu: true, label, staffEmail: em, staffName: s(pm.name), codeOnly: false, adminsOnly: false, done: '' } });   /* the PM's replies: BAD / info notes */
  if (s(l.inboxId)) { try { await escStart(s(l.inboxId), 'reply', { code, name: w.nm, phone: w.ph, link: '', pmName: s(pm.name), item: { pm: s(pm.name), pmEmail: em } }, { sent0: true, again: true }); } catch (e) {} }   /* LEADWATCH: the PM must reply */
  return res;
}
async function speedText(kind, x){
  x = obj(x); const owners = await loadOwners(), l = obj(x.raw), w = lwWho(Object.assign({}, l, { name: s(l.name || x.title) })), label = leadLabel(l, l), id = s(x.key || l.id);
  const link = lwLink(id), code = s(l.inboxId) ? lsaCode(s(l.inboxId)) : '', ago = LWc().ago(Math.max(0, (now() - (/^pm/.test(kind) ? (isFinite(x.asgAt) ? x.asgAt : x.born) : x.born)) / 3600000));
  let text, only;
  if (kind === 'unasg24') {   /* LEADWATCH (owner 11/19): the owners have not assigned it in 24 h → the OFFICE role assigns (a text + an office To-Do) */
    let pp = {}; try { pp = await _D.people(); } catch (e) {}
    only = officeEmails(pp);
    text = 'GrayCo: 👤 please assign ' + label + (code ? ' ' + code : '') + ' — ' + w.line + ' came in ' + ago + ' ago and the owners have not given it to a PM.' + (code ? ' Reply GOOD ' + code + ' <PM> to assign, or' : '') + ' pick the PM on the lead: ' + link;
    let todo = null; try { todo = await _D.officeTask({ id: 'LWASG_' + id, kind: 'lead_assign', leadId: id, pid: '', label: '👤 Assign a PM: ' + w.nm + ' (' + label + ') — no PM 24 h after it came in', note: 'The owners have not assigned this lead. Pick the PM on the lead (Leads → the lead → PM); the PM gets the GrayCo lead text.', addedBy: 'Leads at risk' }); } catch (e) { todo = { error: s(e && e.message) }; }
    if (!only.length) return { skipped: 'no office', todo };
    const r0 = await notify({ type: 'lead', text, body: () => text, link: site() + '/#leads', only, thread: 'stl:' + kind + ':' + id, leadId: id, hold: true, sqOnly: true,
      lsa: code ? { leadId: s(l.inboxId), code, name: w.nm, phone: w.ph, link: '', said: '', em: false, isLsa: false, fu: true, label, codeOnly: true, adminsOnly: false, officeAssign: true } : undefined });
    return Object.assign(r0 || {}, { todo });
  }
  if (kind === 'unasg') {
    let sug = s(obj(l.hold).state === 'held' && obj(l.hold).name) || s(x.suggest);
    if (!sug && s(l.inboxId)) { try { if (await require('./automations.js').isOn('lead_auto_assign')) { const d = await lsaDefaultPm(); if (d) sug = s(d.name); } } catch (e) {} }   /* the 5 PM default assign (bid-inbox.js) */
    text = 'GrayCo: 👤 assign ' + label + (code ? ' ' + code : '') + ' — ' + w.line + ' came in ' + ago + ' ago and has no PM.' + (sug ? ' It goes to ' + clip(sug, 24) + ' at 5 PM unless you pick someone.' : '') + (code ? ' Reply GOOD ' + code + ' <PM> to assign.' : '') + ' ' + link;
    only = owners.map(o => o.email);
  } else if (kind === 'pm24') {
    text = 'GrayCo: ⏰ reach out — ' + label + (code ? ' ' + code : '') + ' ' + w.line + ' was given to you ' + ago + ' ago and is not marked contacted. Call them, then tap ✅ Contacted' + (LWc().isLsa(l) && code ? ' (or reply BAD ' + code + ' <why> if it is not a real lead)' : '') + ': ' + link;
    only = [low(x.assigneeEmail)];
  } else if (kind === 'pm48') {
    text = 'GrayCo: ⚠️ ' + clip(s(x.assignee) || 'The PM', 24) + ' has not contacted ' + label + (code ? ' ' + code : '') + ' ' + w.line + ' — given to them ' + ago + ' ago. ' + link;
    only = owners.map(o => o.email).filter(e => e !== low(x.assigneeEmail));
  } else return { skipped: 'kind' };
  only = only.filter(Boolean); if (!only.length) return { skipped: 'nobody' };
  return notify({ type: 'lead', text, body: () => text, link: site() + '/#leads', only, thread: 'stl:' + kind + ':' + id, leadId: id, hold: true, sqOnly: true,
    lsa: code && /^unasg/.test(kind) ? { leadId: s(l.inboxId), code, name: w.nm, phone: w.ph, link: '', said: '', em: false, isLsa: false, fu: true, label, codeOnly: true, adminsOnly: true } : undefined });
}
async function bidDueText(kind, x){
  x = obj(x); if (low(x.bidRole) !== 'prime') return { skipped: 'not a prime bid (sub / unmarked bids: the CRM only)' };   /* LEADWATCH owner decision */
  const est = await estimatorsFor({}, x); if (!est.length) return { skipped: 'no estimator' };
  let due = s(x.bidDue); try { due = require('./bid-due.js').fmtDue(due); } catch (e) {}
  const when = kind === '1h' ? 'IN 1 HOUR' : kind === 'today' ? 'TODAY' : 'TOMORROW', to = s(x.dueToCompany || x.gc);
  const text = 'GrayCo ⏰ BID DUE ' + when + ': ' + clip(s(x.title) || 'bid', 70) + ' — ' + due + (to ? ' to ' + clip(to, 40) : '') + (x.submitMethod ? ' (' + clip(s(x.submitMethod) + (x.submitWhere ? ': ' + s(x.submitWhere) : ''), 40) + ')' : '') + ' ' + lwLink(s(x.key || x.id));
  return notify({ type: 'lead', text, body: () => text, link: site() + '/#leads', only: est, thread: 'biddue:' + kind + ':' + s(x.key || x.id), leadId: s(x.key || x.id), hold: kind !== '1h', sqOnly: true });
}
/* the morning approvals digest (auto-digest.js) — at most one text a day per person */
async function approvals(email, n){
  return notify({ type: 'approvals', text: n + ' approval' + (n === 1 ? '' : 's') + ' waiting on you.', link: site() + '/#todo', thread: 'appr', mine: [email], daily: true });
}
/* admin / system (gc-backup, crm-health) — once a day per kind; held through quiet hours */
async function system(kind, text){
  return notify({ type: 'system', text: 'CRM alert — ' + text, link: site(), thread: 'sys:' + s(kind), daily: true, hold: true });
}

/* ── EMQ (owner 11/11: "for emergency response text ask questions like their carrier, adjuster info, if the building is accessible —
   AFTER we say we are dispatching … don't ask right away, let them tell the basics and let us reply back … let the PM that gets the
   emergency state they are on the way, then after the customer replies or 15 minutes later ask those questions"):
   the first staff reply relayed to an EMERGENCY customer arms the questions for that number; they go once — when the customer
   texts back, or about 15 minutes later (the 10-minute alerts run), whichever comes first. Never before we answered. ── */
const EMQ_MS = 15 * 60 * 1000;
function emqText(){
  return 'GrayCo: so the crew is ready, please reply with:\n' +
    '1) Your insurance company + claim # (if any)\n' +
    '2) Adjuster name & phone, if assigned\n' +
    '3) Can we get in? Who will be there, or a gate code / key / lockbox\n' +
    '4) Is the water or power shut off?\n' +
    'OK if you don\'t have the insurance info yet.';
}
async function emqArm(ph, o){
  ph = phone10(ph); if (ph.length !== 10) return null;
  let armed = false;
  await _D.kvCas(SKEY, v => { const st = loadState(v); if (st.emq[ph]) return undefined; st.emq[ph] = { at: new Date(now()).toISOString(), pid: s(o.pid), leadId: s(o.leadId), staff: s(o.staff), sent: '' }; armed = true; return st; }).catch(() => {});
  return armed;
}
async function emqSend(ph, why){
  ph = phone10(ph); let rec = null;
  await _D.kvCas(SKEY, v => { const st = loadState(v); const e = st.emq[ph]; if (!e || e.sent) { rec = null; return undefined; } e.sent = new Date(now()).toISOString(); e.why = why; rec = Object.assign({}, e); return st; }).catch(() => {});
  if (!rec) return null;
  if (await _D.paused()) return { ph, notSent: 'data-entry mode is on' };
  const opt = await _D.optouts(); if (opt[ph]) return { ph, notSent: 'that number texted STOP' };
  if (await _D.consentNo(ph)) return { ph, notSent: 'that customer declined texts' };
  const r = await sendL(ph, emqText(), env('TWILIO_FROM'), 'emergency', { kind: 'customer', leadId: s(rec.leadId), pid: s(rec.pid) });
  return { ph, sent: !!(r && r.ok), why };
}
/* the customer texted back after we answered */
async function emqOnCustomer(ph){
  ph = phone10(ph); let armed = false;
  try { const v = await _D.kvGet(SKEY); const st = loadState(v); armed = !!(st.emq[ph] && !st.emq[ph].sent); } catch (e) { return null; }
  return armed ? emqSend(ph, 'customer replied') : null;
}
/* the alerts run: anyone armed 15+ minutes ago who has not been asked yet */
async function emqDue(){
  let due = []; const t = now();
  try { const v = await _D.kvGet(SKEY); const st = loadState(v); due = Object.keys(st.emq).filter(k => !st.emq[k].sent && t - Date.parse(st.emq[k].at || 0) >= EMQ_MS); } catch (e) { return { error: s(e && e.message) }; }
  const out = []; for (const ph of due) out.push(await emqSend(ph, '15 minutes after we answered'));
  return { due: due.length, out };
}
/* ── LSAHOLD helpers ── */
const HOLD_KEY = 'lsa_hold_7am', HOLD_AT = '07:00';
/* 7:00 AM Central or later on an open day (not a holiday), before that day's closing time */
function sevenOk(t, hours){
  try { const CO = require('./callorder.js'), h = CO.cleanHours(hours), w = CO.wall(t, h.tz); if (h.holidays.indexOf(w.date) >= 0) return false; const d = h.days[w.day]; return !!(d && d.open && w.hm >= HOLD_AT && w.hm < d.end); } catch (e) { return false; }
}
/* the overnight lead texts of one person → 1+ texts (≤ 1400 characters each), a line per lead */
function bundleTexts(items){
  const lines = items.map(x => { const L0 = x.lsa || {}; let b = s(x.body || x.text).replace(/^🚨\s*/, '').replace(/^GrayCo( \(\+\d+ more\))?:\s*/, '');
    b = b.replace(/\s*Reply GOOD [A-Z0-9]{4} \/ BAD [A-Z0-9]{4}\..*$/, '').replace(/\s*GOOD [A-Z0-9]{4} Pat = PM Pat\..*$/, '');
    return (x.lsa && x.lsa.em ? '🚨 ' : '') + clip(b, 260); });
  const codes = items.map(x => s(x.lsa && x.lsa.code)).filter(Boolean);
  const tail = codes.length ? ' Reply with the codes, e.g. ' + (codes.length >= 2 ? 'BAD ' + codes[0] + ', GOOD ' + codes[1] + ' Pat' : 'GOOD ' + codes[0] + ' Pat') + '.' : '';
  const out = []; let cur = 'GrayCo: ' + items.length + ' leads came in after hours —';
  lines.forEach((l, i) => { const add = '\n' + (i + 1) + ') ' + l; if (cur.length + add.length > 1400) { out.push(cur); cur = 'GrayCo (cont.):'; } cur += add; });
  out.push(cur + tail); return out;
}
/* ── LSADIRECT follow-up (owner 11/19: "If the number or recording arrives later, send ONE short follow-up text"): the Google Ads sync,
   the office call log or Twilio's recording callback put the number / a recording / the transcript on an LSA lead that was already
   texted → one short text "📞 (901) 555-0211 / ▶ recording for K7Q2"; each piece at most once per lead; a text still held for 7 AM is
   updated instead (nothing extra goes out at night). ── */
async function lsaFollowUp(leadId){
  leadId = s(leadId); if (!leadId) return { skipped: 'no lead' }; await loadOwners();   /* OWNERROLE */
  let x = null; try { x = arr(await _D.kvGet('gc_lead_inbox')).find(y => y && s(y.id) === leadId) || null; } catch (e) { x = null; }
  if (!x || !isLsaLead(x, x)) return { skipped: 'not an LSA lead' };
  const code = lsaCode(leadId), ph = phone10(obj(x.contact).phone), cb = lsaCallBits(x, x);
  const have = { phone: ph.length === 10, rec: !!cb.rec, sum: !!cb.sum };
  let sentTo = [], heldFix = 0, plan = null;
  await _D.kvCas(SKEY, v => {
    const st = loadState(v); st.lsaFu = obj(st.lsaFu); sentTo = []; heldFix = 0; plan = null;
    const mark = obj(st.lsaFu[leadId]);
    Object.keys(st.lsa).forEach(k => { if (arr(st.lsa[k]).some(y => y && y.leadId === leadId && !y.codeOnly)) sentTo.push(k); });
    /* held for 7 AM: put the news in the held text itself */
    Object.keys(st.held).forEach(e => arr(st.held[e]).forEach(h => { if (!h || !h.lsa || h.lsa.leadId !== leadId) return;
      const add = (have.phone && !/\(\d{3}\) \d{3}-\d{4}/.test(s(h.body)) ? ' 📞 ' + tidy(ph) : '') + (have.rec && !/▶/.test(s(h.body)) ? ' ▶ ' + cb.rec : '') + (have.sum && !/📝/.test(s(h.body)) ? ' 📝 ' + clip(cb.sum, 120) : '');
      if (add) { h.body = clip(s(h.body) + add, 700); h.text = clip(s(h.text) + add, 200); if (have.phone) h.lsa.phone = ph; heldFix++; } }));
    if (heldFix) { st.lsaFu[leadId] = Object.assign({}, mark, { phone: mark.phone || have.phone, rec: mark.rec || have.rec, sum: mark.sum || have.sum }); return st; }   /* the 7 AM text carries it */
    const want = { phone: have.phone && !mark.phone, rec: have.rec && !mark.rec, sum: have.sum && !mark.sum && !mark.rec };
    if (sentTo.length && (want.phone || want.rec || want.sum)) { plan = want; st.lsaFu[leadId] = Object.assign({}, mark, { phone: mark.phone || want.phone, rec: mark.rec || want.rec, sum: mark.sum || want.sum || want.rec, at: new Date(now()).toISOString() });
      const ks = Object.keys(st.lsaFu); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(k => { delete st.lsaFu[k]; }); }
    if (!plan && !heldFix) return undefined;
    if (plan && have.phone) Object.keys(st.lsa).forEach(k => arr(st.lsa[k]).forEach(y => { if (y && y.leadId === leadId && !s(y.phone)) y.phone = ph; }));
    return st;
  }).catch(() => {});
  if (!plan) return { held: heldFix, skipped: sentTo.length ? 'nothing new' : 'not texted yet' };
  const bits = [plan.phone ? '📞 ' + tidy(ph) : '', plan.rec ? '▶ ' + (cb.vm ? 'voicemail' : 'recording') + ' ' + cb.rec : '', plan.sum || (plan.rec && cb.sum) ? '📝 ' + clip(cb.sum, 140) : ''].filter(Boolean);
  const name = clip(s(obj(x.contact).name).replace(/^Google LSA caller.*$/i, '') || 'Google LSA caller', 30);
  const text = 'GrayCo: ' + code + ' ' + name + ' — ' + bits.join(' · ') + lsaHint(code);
  const r = await notify({ type: 'lead', text, body: () => text, link: site() + '/#leads', only: lsaAdmins(), thread: 'lsa:' + leadId + ':fu:' + Object.keys(plan).filter(k => plan[k]).join(''), lsa: { leadId, code, name, phone: ph, link: s(obj(x.leadExtra).lsaLink), said: '', em: false, isLsa: true, fu: true, label: 'Google LSA call to the office' } });
  return { sent: r.sent || 0, held: heldFix, plan };
}

/* ── LSAINTAKE (owner 11/19): the office's quick intake on a Google call — 👍 Good / 👎 Bad / ❓ Not sure, a short description, the
   customer's name / number / address, then "➡ Send to PM <picker>" (the main button; preselected: the ⚙ "Default PM for Google LSA
   leads") or "Send to admin to assign". It never gates the admins' first text.
     Send to PM (admins only — LSAFLOW2: the office's form is optional notes, assigning is the owners' job) → assigned exactly like an
                  admin's "GOOD <code> <PM>" (lsaDecide: the inbox, gc_lsa_decisions, the PM's text) + the admins get "Office sent …".
     Send to admin (Good / Not sure) → the admins get "Office: GOOD — <description> — sent to you to assign" (reply GOOD <code> <PM>).
     👎 Bad (either button) → LSAFLOW2 lsaBad: BAD now, the owners get the Google dispute link, the office's To-Do to confirm and
                  dispute. ── */
async function lsaIntake(d, who){
  d = d || {}; who = Object.assign({}, who || {}); who.name = await whoName(who);   /* LSAFLOW2 */
  const leadId = s(d.leadId); if (!leadId) return { ok: false, error: 'Which lead?' };
  let x = null; try { x = arr(await _D.kvGet('gc_lead_inbox')).find(y => y && s(y.id) === leadId) || null; } catch (e) { x = null; }
  if (!x) return { ok: false, error: 'Lead not found.' };
  const code = lsaCode(leadId), rating = /^(good|bad|unsure)$/.test(s(d.rating)) ? s(d.rating) : 'unsure', desc = clip(d.desc, 400), byName = s(who.name) || s(who.email) || 'Office', byEmail = low(who.email);
  const ph = phone10(d.phone).length === 10 ? phone10(d.phone) : phone10(obj(x.contact).phone), name = clip(s(d.name) || s(obj(x.contact).name), 60), addr = clip(d.address, 160);
  await loadOwners();
  /* LSAFLOW2 (owner 11/19: "we assign to a PM"): assigning is the admins' job — the office's form is optional notes for the owners */
  let pm = null; if (s(d.action) === 'pm' && rating !== 'bad' && (who.admin || who.office)) {   /* LEADWATCH: the office may assign */ pm = await pmByEmail(d.pmEmail); if (!pm) return { ok: false, error: 'Pick the PM first.' }; }
  const at = new Date(now()).toISOString(), intake = { rating, desc, by: byName, byEmail, at, action: s(d.action) === 'pm' && pm ? 'pm' : 'admin', pm: pm ? pm.name : '' };
  try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v), y = l.find(z => z && s(z.id) === leadId); if (!y) return undefined;
    const c = Object.assign({}, obj(y.contact)); if (name && (!s(c.name) || /^Google LSA caller/i.test(s(c.name)))) c.name = name; if (ph.length === 10 && phone10(c.phone).length !== 10) c.phone = tidy(ph); y.contact = c;
    if (addr && !s(y.address)) y.address = addr;
    y.leadExtra = Object.assign({}, obj(y.leadExtra), { intake }); const dt = new Date(now());
    const line = '[' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + byName + '] 📞 Office intake: ' + (rating === 'good' ? '👍 Good' : rating === 'bad' ? '👎 Bad' : '❓ Not sure') + (desc ? ' — ' + desc : '') + (addr ? ' (' + addr + ')' : '');
    if (Array.isArray(y.notes)) y.notes = y.notes.concat([line]).slice(-60); else y.notes = (s(y.notes) ? s(y.notes) + '\n' : '') + line;
    y.rev = (y.rev || 1) + 1; y.updatedAt = at; return l; }); } catch (e) {}
  const out = { ok: true, code, rating, action: intake.action };
  try { out.todo = await _D.intakeDone(leadId, byName + ': ' + (rating === 'bad' ? 'bad' : intake.action === 'pm' ? 'sent to ' + pm.name : 'sent to the admins')); } catch (e) {}
  const nm = clip(name.replace(/^Google LSA caller.*$/i, '') || (ph.length === 10 ? tidy(ph) : 'Google caller'), 30), link = site().replace(/^https?:\/\//, '') + '/#leads&lead=' + encodeURIComponent(leadId);
  if (rating === 'bad') {
    /* LSAFLOW2: the office's BAD = the same as a PM's: BAD now, the owners get the dispute link, the office's To-Do to confirm and dispute */
    const rb = await lsaBad({ leadId, code, name: nm, phone: ph, reason: desc || 'not a real lead', by: { name: byName, email: byEmail }, role: who.admin ? 'admin' : 'office', via: 'app' });
    out.saved = rb.saved; out.text = rb.admins; out.todo2 = rb.todo; out.link = rb.link;
    return out;
  }
  if (intake.action === 'pm') {
    out.saved = await _D.lsaDecide({ leadId, name: nm, phone: ph, code, good: true, reason: '', notes: desc ? 'Office: ' + desc : '', by: byName, byEmail, pm, link: s(obj(x.leadExtra).lsaLink) || LSA_LEADS_URL, isLsa: true });
    out.pmText = low(pm.email) !== byEmail ? await pmAssignText(pm, { leadId, code, name: nm, phone: ph, notes: desc, by: byName, item: x }) : null;   /* LSAFLOW2 */
    await _D.kvCas(SKEY, v => { const st = loadState(v); lsaMarkDone(st, leadId, 'good'); return st; }).catch(() => {});
    try { await goodCust(leadId, pm); } catch (e) {}   /* CUSTTEXT2 */
    try { out.text = await notify({ type: 'lead', text: 'Office (' + clip(byName, 20) + ') sent ' + code + ' ' + nm + ' to PM ' + pm.name + (desc ? ' — "' + clip(desc, 90) + '"' : '') + '. ' + link, link: site() + '/#leads', only: lsaAdmins(), thread: 'lsa:' + leadId + ':officepm' }); } catch (e) {}
    out.pm = pm.name; return out;
  }
  try { out.text = await notify({ type: 'lead', text: 'Office: ' + (rating === 'good' ? 'GOOD' : 'not sure') + ' — ' + code + ' ' + nm + (ph.length === 10 ? ' ' + tidy(ph) : '') + (desc ? ' — "' + clip(desc, 100) + '"' : '') + ' — sent to you to assign. Reply GOOD ' + code + ' <PM>. ' + link, link: site() + '/#leads', only: lsaAdmins(), thread: 'lsa:' + leadId + ':officeadm',
    lsa: { leadId, code, name: nm, phone: ph, link: s(obj(x.leadExtra).lsaLink), said: desc, em: false, isLsa: true, label: 'Google LSA call to the office' } }); } catch (e) {}
  return out;
}
/* LSAINTAKE: the PM's own lead text (owner 11/19: "that PM gets the lead text (number, description, link)") — when the assignment notice
   did not already text him (a PM who is not on the 📱 Text alerts list) */
/* LSAINTAKE: an admin assigns a PM from the CRM (the Leads page) — exactly an admin's "GOOD <code> <PM>" */
async function lsaAssign(d, who){
  d = d || {}; who = Object.assign({}, who || {}); who.name = await whoName(who);   /* LSAFLOW2 */
  const leadId = s(d.leadId); if (!leadId) return { ok: false, error: 'Which lead?' };
  let x = null; try { x = arr(await _D.kvGet('gc_lead_inbox')).find(y => y && s(y.id) === leadId) || null; } catch (e) { x = null; }
  if (!x) return { ok: false, error: 'Lead not found.' };
  const code = lsaCode(leadId), ph = phone10(obj(x.contact).phone), nm = clip(s(obj(x.contact).name) || 'Google LSA caller', 40), byName = s(who.name) || s(who.email);
  await loadOwners();
  if (s(d.verdict) === 'bad') {   /* LSAFLOW2: an admin's 👎 in the CRM — the dispute link to the other owner, the office's To-Do */
    const rb = await lsaBad({ leadId, code, name: nm, phone: ph, reason: clip(d.reason, 200) || 'no reason given', by: { name: byName, email: low(who.email) }, role: 'admin', via: 'app', isLsa: isLsaLead(x, x) });
    return { ok: true, code, good: false, saved: rb.saved, link: rb.link };
  }
  const pm = await pmByEmail(d.pmEmail); if (!pm) return { ok: false, error: 'Pick the PM first.' };
  const r = await _D.lsaDecide({ leadId, name: nm, phone: ph, code, good: true, reason: '', notes: clip(d.notes, 300), by: byName, byEmail: low(who.email), pm, link: s(obj(x.leadExtra).lsaLink) || LSA_LEADS_URL, isLsa: isLsaLead(x, x) });
  const it = obj(obj(x.leadExtra).intake), sum = obj(obj(x.leadExtra).callTranscript).summary;
  let pmTx = null; if (low(pm.email) !== low(who.email)) { try { pmTx = await pmAssignText(pm, { leadId, code, name: nm, phone: ph, notes: s(d.notes) || s(it.desc), by: byName, item: x }); } catch (e) {} }   /* LSAFLOW2 */
  await _D.kvCas(SKEY, v => { const st = loadState(v); lsaMarkDone(st, leadId, 'good'); return st; }).catch(() => {});
  try { await goodCust(leadId, pm); } catch (e) {}   /* CUSTTEXT2 */
  try { await _D.intakeDone(leadId, 'assigned to ' + pm.name + ' by ' + byName); } catch (e) {}
  return { ok: true, code, good: true, pm: pm.name, saved: r, pmTexted: !!(pmTx && (pmTx.sent || pmTx.already || (pmTx.skipped && pmTx.skipped.held))) };
}
/* the PMs a Google lead can go to: active staff with a PM role — admins count (owner 11/19: an owner can be the PM) */
async function lsaPms(){
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  const roleOf = {}; arr(pp.staff).forEach(r => { if (r && r.email) roleOf[low(r.email)] = s(r.role); });
  return arr(pp.users).filter(u => u && s(u.name) && isActiveUser(u) && staffEmail(low(u.email)) && /project\s*manager|\bpm\b|admin|owner|superintendent/i.test([u.role, u.title, u.profile, roleOf[low(u.email)]].map(s).join(' ')))
    .map(u => ({ id: s(u.id) || low(u.email), name: s(u.name), email: low(u.email) })).sort((a, b) => a.name.localeCompare(b.name));
}
async function pmByEmail(e){ e = low(e); if (!e) return null; const l = await lsaPms(); const u = l.find(x => x.email === e || low(x.id) === e); return u ? { name: u.name, email: u.email } : null; }
/* LSAINTAKE: ⚙ "Default PM for Google LSA leads" (gc_lead_inbox_settings.lsaDefaultPm = a user id, Lead settings). OWNERROLE: never set →
   Owner 2 (by role, _lib/owners.js — resolved at run time, not stored); set to someone no longer an active PM → none. */
async function lsaDefaultPm(){
  let set = {}; try { set = obj(await _D.kvGet('gc_lead_inbox_settings')); } catch (e) { set = {}; }
  const pms = await lsaPms();
  if (set.lsaDefaultPm == null || s(set.lsaDefaultPm) === '@owner2') {
    const o2 = (await loadOwners()).find(x => x.slot === 2), u = o2 ? pms.find(x => x.email === o2.email) : null;
    return u ? Object.assign({ auto: true }, u) : null;
  }
  return pms.find(x => x.id === s(set.lsaDefaultPm)) || null;
}
async function lsaSetDefaultPm(id, by){
  id = s(id); const pms = await lsaPms(); if (id && id !== '@owner2' && !pms.some(x => x.id === id))   /* OWNERROLE: '@owner2' = Owner 2 by role */ return { ok: false, error: 'That person is not an active PM.' };
  await _D.kvCas('gc_lead_inbox_settings', v => { const o = obj(v); o.lsaDefaultPm = id; o.lsaDefaultPmBy = low(by); o.lsaDefaultPmAt = new Date(now()).toISOString(); return o; });
  return { ok: true, id };
}
/* LSAINTAKE: the Google LSA calls / leads for the Leads page (admins + office): every LSA item in the inbox (30 days by default) with its
   code, GOOD / BAD state, the call details, the office intake and whether it is on the Leads list */
async function lsaList(days){
  const since = now() - (Math.max(1, Math.min(120, +days || 30))) * 864e5;
  let list = []; try { list = arr(await _D.kvGet('gc_lead_inbox')); } catch (e) { list = []; }
  let R = null; try { R = require('./lsarec.js'); } catch (e) { R = null; }
  return list.filter(x => x && !x.stub && isLsaLead(x, x)).map(x => {
    const ex = obj(x.leadExtra), t = Date.parse(s(ex.receivedAt || x.receivedAt || x.created || ''));
    if (isFinite(t) && t < since) return null;
    const info = R ? R.cardInfo(x) : {};
    const chk = low(x.lsaCheck || ex.lsaCheck) || 'pending';
    return { id: s(x.id), code: lsaCode(x.id), title: s(x.title), name: s(obj(x.contact).name), phone: phone10(obj(x.contact).phone), at: isFinite(t) ? new Date(t).toISOString() : '', status: s(x.status), check: chk,
      reason: s(x.lsaReason), decidedBy: s(x.lsaDecidedBy), disputed: s(x.lsaDisputedAt || ex.lsaDisputedAt), disputedBy: s(x.lsaDisputedBy), pm: s(x.pm), pmEmail: low(x.pmEmail), call: !!(ex.lsaCall || x.lsaCall), emergency: !!(x.emergency || ex.emergency), link: s(ex.lsaLink),
      info, intake: ex.intake || null, repeats: +ex.lsaRepeats || 0, merged: s(x.mergedInto), dismissed: x.status === 'dismissed' };
  }).filter(Boolean).sort((a, b) => s(b.at).localeCompare(s(a.at)));
}

/* ── LSAFLOW2 (owner 11/19): "Google Ads: when we get that lead it goes to [the office] to answer immediately, then it goes into our CRM with
   the recording of the call, then we get a notification to assign the lead. Then we assign to a PM and they call the lead. They will then,
   in the Leads section of the app, say if the lead is good or not. We also want to assign the lead by GrayCo text, so when we assign it,
   it's sent to the PM. The PM can also reply bad lead on there and then he'll get a bad-lead LSA link. If he doesn't reply anything, then
   it's a good lead. Then if he says bad lead, we the admins get a text from GrayCo text also, with the Ads link, to say it's a bad lead,
   and we click it if the PM already hasn't. The lead also goes to the office if it's a bad lead, so she can qualify it too. Any lead that
   isn't qualified by 25 days, notify admin and office so we can do it before day 30." (LEADWATCH, later: Google gives 48 hours — LSA_DISPUTE_WINDOW_H)
     pmAssignText — the PM's GrayCo text when a lead is assigned (any way), once per lead and PM; staff quiet hours (held to 7 AM)
     lsaBad       — a BAD (the PM by text or in the app, an admin, the office): BAD now; the PM gets the dispute link, the owners get
                    "<PM> says BAD for <code> <name>: <reason>. Dispute in Google: <link>", the office a To-Do "Bad lead per <PM> —
                    confirm and dispute by <date>" (Google's 30 days from when the lead came in)
     lsaDisputed  — "Disputed in Google ✓" (the lead's button for the PM / an admin / the office, or "DISPUTED <code>" by text): the
                    first one closes it for everyone (the office To-Dos close, no more texts)
     lsaMark      — the app's 👍 Good / 👎 Bad / ✓ Disputed (the lead's PM, an admin, the office)
     lsaAgeCheck  — every 10 minutes (bid-alerts remind): an LSA lead 25 days old and not qualified → the owners' text + the office's
                    To-Do, once. Qualified = good (marked, or a PM assigned with no BAD), bad and disputed, or closed.
   Nothing here ever texts a customer. ── */
/* the person's name from the people list (a sign-in may only carry the address) */
async function whoName(who){ who = obj(who); const n = s(who.name); if (n && !/@/.test(n)) return n; try { const u = arr((await _D.people()).users).find(z => low(z.email) === low(who.email)); if (u && s(u.name)) return s(u.name); } catch (e) {} return n || s(who.email); }
function lsaLinkOf(x){ const u = s(obj(obj(x).leadExtra).lsaLink || obj(x).lsaLink); return /^https:\/\//.test(u) ? u : LSA_LEADS_URL; }
function arrivedOf(x){ x = obj(x); const ex = obj(x.leadExtra); for (const v of [ex.receivedAt, x.receivedAt, ex.lsaCallAt, x.createdAt, x.created]) { const t = Date.parse(s(v)); if (isFinite(t)) return t; } return 0; }
function mdhOf(ms){ try { return new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return mdOf(ms); } }
function mdOf(ms){ try { return new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric' }); } catch (e) { const d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate(); } }
function crmLink(leadId){ return site().replace(/^https?:\/\//, '') + '/#leads&lead=' + encodeURIComponent('LEADIN-' + s(leadId).replace(/^LI-/, '')); }
function lastNote(x){ const n = obj(x).notes, l = Array.isArray(n) ? n : s(n).split('\n'); const v = s(l.filter(Boolean).slice(-1)[0]); return v.replace(/^\[[^\]]*\]\s*/, '').replace(/^📞 Office intake:\s*/, ''); }
async function pmAssignText(pm, o){
  pm = pm || {}; o = o || {}; const em = low(pm.email), leadId = s(o.leadId); if (!em || !leadId) return { skipped: 'no PM' };
  let x = o.item || null; if (!x) { try { x = await _D.inboxLead(leadId); } catch (e) { x = null; } }
  x = obj(x); const ex = obj(x.leadExtra), c = obj(x.contact);
  const code = s(o.code) || lsaCode(leadId), ph = phone10(o.phone).length === 10 ? phone10(o.phone) : phone10(c.phone);
  const nm = clip(s(o.name).replace(/^Google LSA caller.*$/i, '') || s(c.name).replace(/^Google LSA caller.*$/i, '') || 'Google caller', 40);
  const cb = lsaCallBits(x, x), job = clip(s(ex.lsaJob) || s(ex.service) || s(x.service), 40);
  const notes = clip(s(o.notes) || s(obj(ex.intake).desc) || lastNote(x) || cb.sum, 160);
  const emg = !!o.em || !!x.emergency || !!ex.emergency;   /* an emergency goes at once, day or night */
  let byN = s(o.by); if (/@/.test(byN)) { try { const u = arr((await _D.people()).users).find(z => low(z.email) === low(byN)); byN = u && s(u.name) ? s(u.name) : ''; } catch (e) { byN = ''; } }
  let claim = false;
  await _D.kvCas(SKEY, v => { const st = loadState(v); claim = false; if (low(obj(st.lsaPmTx[leadId]).pm) === em) return undefined; st.lsaPmTx[leadId] = { pm: em, at: new Date(now()).toISOString() }; claim = true; return st; }).catch(() => { claim = true; });
  if (!claim) return { already: true };
  const text = 'GrayCo: Google LSA lead ' + code + ' for you' + (byN ? ' from ' + clip(byN.split(/\s+/)[0], 20) : '') + ': ' + nm + (ph.length === 10 ? ' 📞 ' + tidy(ph) : '') + (job ? ' · ' + job : '')
    + (cb.rec ? ' ▶ ' + cb.rec : '') + (notes ? ' Notes: ' + notes : '') + ' CRM: ' + (await lwLinkFor(leadId)) + ' Reply BAD ' + code + ' <reason> if it\'s not a real lead.';
  const res = await notify({ type: 'assigned', text, body: () => text, link: site() + '/#leads', only: [em], mine: [em], thread: 'lsa:' + leadId + ':pm:' + em, leadId, hold: true, sqOnly: true, emergency: emg,
    lsa: { leadId, code, name: nm, phone: ph, link: lsaLinkOf(x), said: '', em: emg, isLsa: true, fu: true, label: 'Google LSA lead', staffEmail: em, staffName: s(pm.name), codeOnly: false, adminsOnly: false, done: '' } });
  /* LEADWATCH (owner 11/19): "the PM must reply" — no reply is not good any more: the reply ladder (this text = the PM's step; 1 hour apart the office,
     marketing, the owners) until he texts back anything (= good) or BAD */
  try { await escStart(leadId, 'reply', { code, name: nm, phone: ph, link: lsaLinkOf(x), pmName: s(pm.name), item: { pm: s(pm.name), pmEmail: em } }, { sent0: true, again: true }); } catch (e) {}
  return res;
}
/* LEADWATCH (owner decisions 11/19): Google gives 48 hours to dispute a lead (configurable); a lead not qualified (good, or bad and disputed)
   with less than LSA_WARN_LEFT_H left → the owners (at once, even after hours — the urgent exception to the 7 AM hold) + an office To-Do.
   A BAD lead's dispute goes up a ladder, 1 hour apart: the PM (assigned) → the office role → the marketing role → the owners; each gets the
   GrayCo text with the Google dispute link; the first "Disputed" closes it for everyone. A step with nobody (no cell on file) is skipped. */
const LSA_DISPUTE_WINDOW_H = 48, LSA_WARN_LEFT_H = 8, LSA_ESC_STEP_MS = 3600e3;
const ESC_STEPS = ['pm', 'office', 'marketing', 'owners'];
function roleDirect(pp, rx){ return arr(pp.users).filter(u => u && isActiveUser(u) && rx.test([u.role, u.title, u.profile].map(s).join(' ')) && phone10(u.cell || u.mobile || u.phone || u.cellPhone).length === 10)
  .map(u => ({ email: low(u.email), phone: phone10(u.cell || u.mobile || u.phone || u.cellPhone), name: s(u.name) })); }
async function escTargets(step, x){
  let pp = {}; try { pp = await _D.people(); } catch (e) {}
  if (step === 'pm') { const e = low(obj(x).pmEmail); return e ? { only: [e], direct: [] } : { only: [], direct: [] }; }
  if (step === 'office') { const o = officeEmails(pp); const d = roleDirect(pp, /office|admin\s*assist|reception/i).filter(u => o.indexOf(u.email) < 0 && lsaAdmins().indexOf(u.email) < 0); return { only: o, direct: d }; }
  if (step === 'marketing') return { only: [], direct: roleDirect(pp, /marketing/i) };
  return { only: lsaAdmins(), direct: [] };
}
async function escSend(leadId, step, e){
  const tg = await escTargets(step, e.item || {});
  { let pp = {}; try { pp = await _D.people(); } catch (er) {} let set = { people: {} }; try { set = await load(); } catch (er) {} const cell = {};   /* a step with nobody who has a cell on file is skipped */
    staffList(pp).forEach(x => { if (x.phone) cell[x.email] = 1; }); Object.keys(set.people || {}).forEach(k => { if (set.people[k] && set.people[k].phone) cell[k] = 1; });
    tg.only = tg.only.filter(x => cell[low(x)]); } if (!tg.only.length && !tg.direct.length) return { nobody: true, why: 'nobody in ' + step };
  const kind = e.kind || 'bad', pmN = clip(s(obj(e.item).pm) || s(e.pmName) || 'the PM', 24), who = e.name + (phone10(e.phone).length === 10 ? ' ' + tidy(e.phone) : '');
  const txt = kind === 'good' ? 'GrayCo: ✅ GOOD lead: ' + who + ' (' + e.code + ') — mark it qualified in Google: ' + e.link + ' Then tap ' + gqLink(leadId) + ' or reply QUALIFIED ' + e.code + ' (the first one closes it for everyone).'
    : kind === 'reply' ? (step === 'pm' ? 'GrayCo: ⏰ please text back about ' + e.code + ' ' + who + ' — what happened (anything you write = a good lead, it goes on the job), or BAD ' + e.code + ' <why>.'
      : 'GrayCo: ⏰ ' + pmN + ' has not answered the lead text for ' + e.code + ' ' + who + ' (sent ' + mdhOf(Date.parse(e.at || 0) || now()) + '). Call him, or reply GOOD ' + e.code + ' <PM> / BAD ' + e.code + ' <why>: ' + lwLink(leadId))
    : 'GrayCo: ⚖️ BAD lead ' + e.code + ' ' + e.name + ' (' + clip(e.why, 60) + ', per ' + clip(e.by, 24) + ') still needs disputing in Google — pick the reason: ' + e.link + ' Then reply DISPUTED ' + e.code + ' (the first one closes it for everyone). Dispute by ' + e.dueS + '.';
  return notify({ type: 'lead', text: txt, body: () => txt, link: site() + '/#leads', only: tg.only, direct: tg.direct, thread: 'lsa:' + leadId + ':esc' + (kind === 'bad' ? '' : ':' + kind) + ':' + step, leadId, hold: true, sqOnly: true,
    lsa: Object.assign({ leadId, code: e.code, name: e.name, phone: e.phone, link: e.link, said: '', em: false, isLsa: kind !== 'reply', fu: true, label: 'Google LSA lead', codeOnly: true, adminsOnly: false, done: kind === 'bad' ? 'bad' : '' },
      step === 'pm' && low(obj(e.item).pmEmail) ? { staffEmail: low(obj(e.item).pmEmail), staffName: s(obj(e.item).pm), codeOnly: false } : {}) });   /* the PM's own step keeps his replies his (notes / BAD) */
}
/* every 10 minutes (bid-alerts remind): the next step of each BAD lead's ladder, 1 hour after the last; stops once it is disputed */
function escClosed(kind, x){
  x = obj(x); const ex = obj(x.leadExtra), c = low(x.lsaCheck || ex.lsaCheck), st = low(x.status);
  if (x.stub || s(x.mergedInto) || /dismiss|merged/.test(st)) return true;
  if (kind === 'good') return !!s(x.lsaGoogleOkAt || ex.lsaGoogleOkAt) || c === 'bad';
  if (kind === 'reply') return !!s(x.pmReplyAt) || c === 'bad' || c === 'pm_bad';
  return !!s(x.lsaDisputedAt || ex.lsaDisputedAt);
}
function escKey(leadId, kind){ return !kind || kind === 'bad' ? s(leadId) : s(leadId) + '|' + kind; }
/* start a ladder (once per lead and kind): step 0 is sent now (unless `sent0`: the text that started it went already) */
async function escStart(leadId, kind, e, o){
  o = o || {}; let fresh = false; const at = new Date(now()).toISOString(), key = escKey(leadId, kind);
  await _D.kvCas(SKEY, v => { const st = loadState(v); st.lsaEsc = obj(st.lsaEsc); if (st.lsaEsc[key] && !o.again) return undefined; fresh = true; st.lsaEsc[key] = Object.assign({}, e, { leadId: s(leadId), kind, step: 0, last: at, at }); return st; }).catch(() => {});
  if (!fresh || o.sent0) return { started: fresh };
  let step = 0, res = null; while (step < ESC_STEPS.length) { res = await escSend(leadId, ESC_STEPS[step], Object.assign({ kind }, e)); if (!(res && res.nobody)) break; step++; }
  if (o.owners && ESC_STEPS[step] !== 'owners') { try { await escSend(leadId, 'owners', Object.assign({ kind }, e)); } catch (er) {} }   /* GOOD: the owners are told at once too */
  await _D.kvCas(SKEY, v => { const st = loadState(v); st.lsaEsc = obj(st.lsaEsc); if (st.lsaEsc[key]) st.lsaEsc[key].step = Math.min(step, ESC_STEPS.length - 1); return st; }).catch(() => {});
  return { started: true, step: ESC_STEPS[Math.min(step, ESC_STEPS.length - 1)], res };
}
async function escClose(leadId, kind){ const key = escKey(leadId, kind); await _D.kvCas(SKEY, v => { const st = loadState(v); st.lsaEsc = obj(st.lsaEsc); if (!st.lsaEsc[key] || st.lsaEsc[key].closed) return undefined; st.lsaEsc[key].closed = true; return st; }).catch(() => {}); }
async function lsaEscTick(){
  const t = now(), out = { sent: [] }; let due = [];
  await _D.kvCas(SKEY, v => { const st = loadState(v); st.lsaEsc = obj(st.lsaEsc); due = Object.keys(st.lsaEsc).map(k => Object.assign({ leadId: k.split('|')[0], key: k, kind: k.split('|')[1] || 'bad' }, st.lsaEsc[k], { key: k })).filter(e => !e.closed && e.step < ESC_STEPS.length - 1 && t - Date.parse(e.last || 0) >= LSA_ESC_STEP_MS); return undefined; }).catch(() => { due = []; });
  for (const e of due) {
    let x = null; try { x = await _D.inboxLead(e.leadId); } catch (er) {}
    const done = escClosed(e.kind, x);
    let step = e.step, res = null;
    if (!done) { while (++step < ESC_STEPS.length) { res = await escSend(e.leadId, ESC_STEPS[step], Object.assign({}, e, { item: x || {} })); if (!(res && res.nobody)) break; } }
    await _D.kvCas(SKEY, v => { const st = loadState(v); st.lsaEsc = obj(st.lsaEsc); const c = st.lsaEsc[e.key]; if (!c) return undefined; if (done) c.closed = true; else { c.step = Math.min(step, ESC_STEPS.length - 1); c.last = new Date(t).toISOString(); } return st; }).catch(() => {});
    out.sent.push({ leadId: e.leadId, kind: e.kind, step: done ? 'closed' : ESC_STEPS[Math.min(step, ESC_STEPS.length - 1)] });
  }
  return out;
}
/* the tap link in the GOOD-lead texts: opens the lead in the CRM and records "qualified in Google" (the page asks texts.js ?lsamark verdict qualified) */
function gqLink(leadId){ const id = s(leadId); return site().replace(/^https?:\/\//, '') + '/#leads&lead=' + encodeURIComponent(/^LI-/.test(id) ? 'LEADIN-' + id.slice(3) : id) + '&gq=1'; }
/* LEADWATCH (owner 11/19): a lead went GOOD → the GOOD ladder (Google LSA leads): "mark it qualified in Google" with the lead's Google link — the
   PM, the owners at once, then 1 hour apart the office, marketing, the owners again — until someone marks it qualified */
async function goodLadder(leadId, x){
  x = obj(x); if (!x.id) { try { x = obj(await _D.inboxLead(leadId)); } catch (e) {} } if (!isLsaLead(x, x) || escClosed('good', x)) return { skipped: 'not a Google lead / done' };
  const c = obj(x.contact);
  return escStart(leadId, 'good', { code: lsaCode(leadId), name: clip(s(c.name) || 'Google LSA caller', 40), phone: phone10(c.phone), link: lsaLinkOf(x), pmName: s(x.pm), item: x }, { owners: true });
}
async function lsaQualifiedG(o){
  o = o || {}; const leadId = s(o.leadId).replace(/^LEADIN-/, 'LI-'), by = s(o.by) || 'Staff', at = new Date(now()).toISOString(); let already = '';
  try { await _D.kvCas('gc_lead_inbox', v => { const l = arr(v), x = l.find(y => y && s(y.id) === leadId); if (!x) return undefined; if (s(x.lsaGoogleOkAt)) { already = s(x.lsaGoogleOkBy); return undefined; } x.lsaGoogleOkAt = at; x.lsaGoogleOkBy = by; x.rev = (x.rev || 1) + 1; x.updatedAt = at; return l; }); } catch (e) {}
  await escClose(leadId, 'good'); try { await _D.tasksDone(['LSA25_' + leadId], 'qualified in Google by ' + by); } catch (e) {}
  return { ok: true, leadId, already: !!already, by: already || by };
}
async function lsaBad(o){
  o = o || {}; const by = obj(o.by), byName = s(by.name) || s(by.email) || 'Staff', byEmail = low(by.email), leadId = s(o.leadId);
  let x = null; try { x = await _D.inboxLead(leadId); } catch (e) { x = null; }
  const c = obj(obj(x).contact), code = s(o.code) || lsaCode(leadId), why = clip(o.reason, 200) || 'no reason given';
  const ph = phone10(o.phone).length === 10 ? phone10(o.phone) : phone10(c.phone), nm = clip(s(o.name) || s(c.name) || 'Google LSA caller', 40);
  const isLsa = o.isLsa !== false && (!x || isLsaLead(x, x)), link = x ? lsaLinkOf(x) : (/^https:\/\//.test(s(o.link)) ? s(o.link) : LSA_LEADS_URL);
  const due = (arrivedOf(x) || now()) + LSA_DISPUTE_WINDOW_H * 3600e3, dueS = mdhOf(due);   /* LEADWATCH: Google's 48 hours */
  const out = { ok: true, code, leadId, good: false, link: isLsa ? link : '' };
  await escClose(leadId, 'reply'); await escClose(leadId, 'good');   /* LEADWATCH: a BAD is a reply; it is not a good lead */
  out.saved = await _D.lsaDecide({ leadId, name: nm, phone: ph, code, good: false, reason: why, notes: why, by: byName, byEmail, link, isLsa, noTodo: true });
  await _D.kvCas(SKEY, v => { const st = loadState(v); lsaMarkDone(st, leadId, 'bad'); return st; }).catch(() => {});
  try { await _D.tasksDone(['LSAIN_' + leadId, 'LSACHECK_' + leadId], 'BAD per ' + byName); } catch (e) {}
  if (!isLsa) {   /* not a Google lead (website …): no dispute — the owners are told */
    const adm0 = lsaAdmins().filter(e => e !== byEmail), at0 = 'GrayCo: ' + byName + ' says BAD for ' + code + ' ' + nm + ': ' + clip(why, 90) + '. Closed as not a real lead.';
    if (adm0.length) { try { out.admins = await notify({ type: 'lead', text: at0, body: () => at0, link: site() + '/#leads', only: adm0, thread: 'lsa:' + leadId + ':bad' }); } catch (e) {} }
    return out;
  }
  /* (a) the PM: the dispute link */
  const pmTxt = 'GrayCo: ' + code + ' ' + nm + ' marked BAD (' + clip(why, 60) + '). Dispute it in Google, pick the reason: ' + link + ' Then reply DISPUTED ' + code + ' (or tap ✓ Disputed in Google on the lead).' + s(o.more);
  if (o.role === 'pm' && !o.quiet) {
    if (o.via === 'text' && phone10(o.ph).length === 10) { try { out.pmText = await sendL(o.ph, pmTxt, leadNum(), undefined, { who: byName, leadId, code, type: 'lead' }); } catch (e) {} }
    else if (byEmail) { try { const r = await notify({ type: 'assigned', text: pmTxt, body: () => pmTxt, link: site() + '/#leads', only: [byEmail], thread: 'lsa:' + leadId + ':badlink', leadId, hold: true, sqOnly: true,
      lsa: { leadId, code, name: nm, phone: ph, link, said: '', em: false, isLsa: true, fu: true, label: 'Google LSA lead', staffEmail: byEmail, staffName: byName, codeOnly: false, adminsOnly: false, done: 'bad' } }); out.pmText = { ok: !!(r && (r.sent || (r.skipped && r.skipped.held))), r }; } catch (e) {} }
  }
  /* (b) LEADWATCH: the dispute ladder — the PM first (now, unless he said BAD himself and just got the link above), then 1 hour apart the office,
     marketing, the owners (lsaEscTick); stops at the first "Disputed" */
  { const e = { code, name: nm, phone: ph, link, why, by: byName, dueS, at: new Date(now()).toISOString() };
    let step = 0, res = null;
    if (o.role === 'pm') res = { pmSaid: true };
    else { while (step < ESC_STEPS.length) { res = await escSend(leadId, ESC_STEPS[step], Object.assign({}, e, { item: obj(x) })); if (!(res && res.nobody)) break; step++; } }
    out.admins = res; out.escStep = ESC_STEPS[Math.min(step, ESC_STEPS.length - 1)];
    await _D.kvCas(SKEY, v => { const st = loadState(v); st.lsaEsc = obj(st.lsaEsc); st.lsaEsc[leadId] = Object.assign({}, e, { step: Math.min(step, ESC_STEPS.length - 1), last: e.at }); return st; }).catch(() => {}); }
  /* (c) the office: confirm and dispute */
  try { out.todo = await _D.officeTask({ id: 'LSADISPUTE_' + leadId, kind: 'lsa_dispute', leadId, code, due: new Date(due).toISOString().slice(0, 10),
    label: '⚖️ Bad lead per ' + clip(byName, 30) + ' — confirm and dispute by ' + dueS + ': ' + nm + (ph.length === 10 ? ' ' + tidy(ph) : '') + ' (Google LSA ' + code + ')',
    note: byName + ' says: "' + why + '". Confirm it is not a real lead, then dispute it in Google: ' + link + ' → find ' + (ph.length === 10 ? tidy(ph) : nm) + ' → Dispute lead (pick the reason). Then tap ✓ Disputed in Google on the lead (or text DISPUTED ' + code + ') — that closes it for everyone.' }); } catch (e) { out.todo = { error: s(e && e.message) }; }
  return out;
}
async function lsaDisputed(o){
  o = o || {}; const by = obj(o.by), byName = s(by.name) || s(by.email) || 'Staff', leadId = s(o.leadId), code = s(o.code) || lsaCode(leadId);
  const r = await _D.lsaDisputed({ leadId, code, name: s(o.name), phone: phone10(o.phone), by: byName, byEmail: low(by.email) });
  const x = obj(r.item), nm = clip(s(o.name) || s(obj(x.contact).name) || 'Google LSA caller', 40);
  const out = { ok: true, code, leadId, already: !!r.already, saved: r };
  if (!r.item) return Object.assign(out, { ok: false, error: 'Lead not found.' });
  if (!r.already) {
    const crm = 'LEADIN-' + leadId.replace(/^LI-/, '');
    try { out.closed = await _D.tasksDone(['LSADISPUTE_' + leadId, 'LSA25_' + leadId, 'LSAIN_' + leadId, 'LSACHECK_' + leadId, 'LSADISPUTE_' + crm, 'LSADISPUTE2_' + crm], 'disputed in Google by ' + byName); } catch (e) {}
    await _D.kvCas(SKEY, v => { const st = loadState(v); lsaMarkDone(st, leadId, 'disputed'); st.lsaEsc = obj(st.lsaEsc); if (st.lsaEsc[leadId]) st.lsaEsc[leadId].closed = true; return st; }).catch(() => {});   /* LEADWATCH: the ladder stops */
  }
  if (o.via === 'text' && phone10(o.ph).length === 10) { try { out.conf = await sendL(o.ph, 'GrayCo: ' + code + ' ' + nm + (r.already ? ' was already marked disputed in Google (' + s(x.lsaDisputedBy) + ').' : ' marked ✓ disputed in Google — closed for everyone.'), leadNum(), undefined, { who: byName, leadId, code, type: 'lead' }); } catch (e) {} }
  return out;
}
/* the app's buttons (texts.js ?lsamark): who = { name, email, admin, office } */
async function lsaMark(d, who){
  d = d || {}; who = who || {}; await loadOwners();
  const leadId = s(d.leadId).replace(/^LEADIN-/, 'LI-'); if (!leadId) return { ok: false, code: 400, error: 'Which lead?' };
  const x = await _D.inboxLead(leadId); if (!x) return { ok: false, code: 404, error: 'Lead not found.' };
  const me = low(who.email), isPm = !!me && (low(x.pmEmail) === me || (!!s(x.pm) && low(x.pm) === low(who.name)));
  if (!(who.admin || who.office || isPm)) return { ok: false, code: 403, error: 'Only the lead\'s PM, an admin or the office can mark it.' };
  const c = obj(x.contact), code = lsaCode(leadId), nm = clip(s(c.name) || 'Google LSA caller', 40), ph = phone10(c.phone), byName = await whoName(who);
  const v = s(d.verdict);
  if (v === 'good') {
    const r = await _D.lsaDecide({ leadId, name: nm, phone: ph, code, good: true, reason: '', notes: clip(d.notes, 300), by: byName, byEmail: me, pm: s(x.pm) ? { name: s(x.pm), email: low(x.pmEmail) } : null, keepPm: true, isLsa: isLsaLead(x, x) });
    await _D.kvCas(SKEY, v2 => { const st = loadState(v2); lsaMarkDone(st, leadId, 'good'); return st; }).catch(() => {});
    try { await goodCust(leadId, s(x.pm) ? { name: s(x.pm), email: low(x.pmEmail) } : null); } catch (e) {}   /* CUSTTEXT2 */
    if (isPm) { try { await pmReplied(leadId); await goodLadder(leadId); } catch (e) {} }   /* LEADWATCH: the PM's 👍 is his reply; then "mark it qualified in Google" */
    return { ok: true, code, verdict: 'good', saved: r };
  }
  if (v === 'bad') { const r = await lsaBad({ leadId, code, name: nm, phone: ph, reason: d.reason, by: { name: byName, email: me }, role: isPm ? 'pm' : who.admin ? 'admin' : 'office', via: 'app', isLsa: isLsaLead(x, x) }); return Object.assign({ verdict: 'bad' }, r); }
  if (v === 'qualified') { const r = await lsaQualifiedG({ leadId, by: byName }); return Object.assign({ verdict: 'qualified', code }, r); }   /* LEADWATCH: "mark it qualified in Google" (the tap link) */
  if (v === 'disputed') { const r = await lsaDisputed({ leadId, code, name: nm, phone: ph, by: { name: byName, email: me }, via: 'app' }); return Object.assign({ verdict: 'disputed' }, r); }
  return { ok: false, code: 400, error: 'good, bad or disputed?' };
}
/* the PM's own Google LSA leads (texts.js ?lsamine — any signed-in staff member; only theirs) */
async function lsaMine(email, name){ email = low(email); const l = await lsaList(45); return l.filter(x => (email && x.pmEmail === email) || (!x.pmEmail && s(name) && low(x.pm) === low(name))); }
function lsaQualified(x){
  const ex = obj(x.leadExtra), c = low(x.lsaCheck || ex.lsaCheck), st = low(x.status);
  if (x.stub || s(x.mergedInto) || /dismiss|merged|won|convert|job/.test(st)) return true;
  if (c === 'bad') return !!s(x.lsaDisputedAt || ex.lsaDisputedAt);
  if (c === 'good' || c === 'pm_good') return !!s(x.lsaGoogleOkAt || ex.lsaGoogleOkAt);   /* LEADWATCH (owner 11/19): GOOD = marked qualified in Google too */
  return false;   /* LEADWATCH: silence is no longer good — the PM must reply (was: a PM assigned and no BAD = good) */
}
/* LEADWATCH (owner 11/19: "Google gives 48 hours"; replaces LSAFLOW2's day-25 check): every 10 minutes (bid-alerts remind) — a Google LSA lead
   not qualified (good, or bad and disputed) with less than LSA_WARN_LEFT_H of Google's LSA_DISPUTE_WINDOW_H left → the owners' text at once
   (after hours too: the urgent exception to the 7 AM hold) + the office To-Do, once per lead */
async function lsaAgeCheck(){
  const t = now(), out = { checked: 0, alerted: [] };
  if (env('SMS_ALERTS_OFF') === '1') return Object.assign(out, { off: true });
  await loadOwners();
  const W = LSA_DISPUTE_WINDOW_H * 3600e3, warn = (LSA_DISPUTE_WINDOW_H - LSA_WARN_LEFT_H) * 3600e3;
  const items = (await _D.inboxAll()).filter(x => x && !x.stub && isLsaLead(x, x));
  const due = items.filter(x => { const a = arrivedOf(x); if (!a) return false; const age = t - a; return age >= warn && age < W && !lsaQualified(x); });
  out.checked = items.length; if (!due.length) return out;
  let mine = [];
  await _D.kvCas(SKEY, v => { const st = loadState(v); mine = due.filter(x => !st.lsa25[s(x.id)]); mine.forEach(x => { st.lsa25[s(x.id)] = { at: new Date(t).toISOString() }; }); return mine.length ? st : undefined; }).catch(() => { mine = []; });
  for (const x of mine) {
    const id = s(x.id), code = lsaCode(id), c = obj(x.contact), ph = phone10(c.phone), nm = clip(s(c.name) || 'Google LSA caller', 40), link = lsaLinkOf(x), endMs = arrivedOf(x) + W, last = mdhOf(endMs);
    const left = Math.max(1, Math.round((endMs - t) / 3600e3));
    const chk = low(x.lsaCheck || obj(x.leadExtra).lsaCheck), state = chk === 'bad' ? 'BAD, not disputed yet' : chk === 'no_answer' ? 'no answer yet' : s(x.pm) ? 'not marked' : 'no PM yet';
    const text = 'GrayCo: ⏰ URGENT — Google LSA lead ' + code + ' ' + nm + (ph.length === 10 ? ' ' + tidy(ph) : '') + ' is not qualified (' + state + ') and Google\'s ' + LSA_DISPUTE_WINDOW_H + '-hour window ends in about ' + left + ' h (' + last + '). '
      + (chk === 'bad' ? 'Dispute it: ' + link + ' then reply DISPUTED ' + code + '.' : 'Reply GOOD ' + code + ' <PM>, or BAD ' + code + ' + why and dispute it: ' + link);
    const r = { id, code };
    try { r.text = await notify({ type: 'lead', text, body: () => text, link: site() + '/#leads', only: lsaAdmins(), thread: 'lsa:' + id + ':w48', emergency: true, lsa: { leadId: id, code, name: nm, phone: ph, link, said: '', em: false, isLsa: true, fu: true, label: 'Google LSA lead', codeOnly: true, adminsOnly: true } }); } catch (e) { r.text = { error: s(e && e.message) }; }   /* emergency: goes now, day or night */
    try { r.todo = await _D.officeTask({ id: 'LSA25_' + id, kind: 'lsa_25', leadId: id, code, due: new Date(endMs).toISOString().slice(0, 10),
      label: '⏰ Google LSA lead — qualify by ' + last + ' (' + LSA_DISPUTE_WINDOW_H + ' h): ' + nm + (ph.length === 10 ? ' ' + tidy(ph) : '') + ' (' + code + ', ' + state + ')',
      note: 'Google allows ' + LSA_DISPUTE_WINDOW_H + ' hours. Good → assign a PM (GOOD ' + code + ' <PM>). Not a real lead → dispute it in Google: ' + link + ', then tap ✓ Disputed in Google on the lead.' }); } catch (e) { r.todo = { error: s(e && e.message) }; }
    out.alerted.push(r);
  }
  return out;
}

module.exports = { jobReady, lsaQualifiedG, goodLadder, escStart, pmAppt, LSA_DISPUTE_WINDOW_H, LSA_WARN_LEFT_H, lsaEscTick, goodCust, pmLeadText, speedText, bidDueText, pmAssignText, lsaBad, lsaDisputed, lsaMark, lsaMine, lsaAgeCheck, _lsaQualified: lsaQualified, loadOwners, lsaAdmins, lsaFollowUp, lsaIntake, lsaAssign, lsaPms, lsaDefaultPm, lsaSetDefaultPm, lsaList, sevenOk, bundleTexts, lsaCallBits, HOLD_KEY, emqArm, emqSend, emqOnCustomer, emqDue, _emqText: emqText, lsaCustOf, webAsk, _findJob: findJob, apptText, lsaVetted, jobNote, lsaAsk, lsaCustomer, lsaPmText, _lsaCode: lsaCode, _lsaParseMulti: lsaParseMulti, _isLsaLead: isLsaLead, _lsaReply: lsaReply, _D: _D, _isSubBid: isSubBid, ROLE_MIT, DEFAULT_PEOPLE, resolve, mitigationHolders, leadText, KEY, SKEY, TYPES, RATE_MS, REPLY_MS, settings, cleanPerson, staffList, load, save, notify, flushHeld, staffInbound, isStaffPhone, inboundText, missedCall, leads, assigned, approvals, system,
  inQuiet, quietNow, centralHour, compose, wants, _D };
