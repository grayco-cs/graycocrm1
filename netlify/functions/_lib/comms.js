/* ============================================================================
   GrayCo — E-MAIL AND CHAT HISTORY ON EVERY JOB (patch X9).   netlify/functions/_lib/comms.js

   Owner 10/21: "E-mail history and chat history so office, PM and anyone else in the company can see what we told
   them … I don't want any extra stuff for this to happen. Where it says PM adds CRM address as BCC, I want that to
   happen for them."

   HOW THE MAIL GETS HERE, with nothing for the staff to do: ONE Google Workspace routing rule (docs/EMAIL-HISTORY.md)
   gives every e-mail between a GrayCo person and someone outside GrayCo a second delivery to
   mail@in.grayco-cs.com (Resend's receiving domain → the same webhook as bids@ → bid-inbox.js → fromJournal here).
   The CRM's ✉️ / Gmail buttons also add that address as BCC until an admin says the rule is on.

   WHAT IS KEPT: only mail that belongs to a job —
     · the PO in the subject (every GrayCo job e-mail carries "PO · name · address"), or
     · the outside person is on a job: the customer, a contact on the job, the claim's adjuster, a sub or GC on it
       (the most recent active job wins).
   EVERYTHING ELSE IS THROWN AWAY on arrival: not stored, not logged — only a count per day ("gc_comms_status").
   Newsletters and automatic replies are skipped unless they carry a PO. Same e-mail seen twice (both directions,
   several staff, the routing copy and the BCC) = one entry (Message-ID).
   STORE: the lead inbox's private table (gc_lead_inbox_kv: service key only, never synced to a browser), one row per
   job: "gc_comms__<job id>" → newest 500 entries. Read by staff through comms.js only; never by the customer or sub
   portal.
   Other code adds a text / portal message with add(pid, entry) (Twilio texts, portal messages).
   ========================================================================== */
'use strict';
const crypto = require('crypto');

const PREFIX = 'gc_comms__', STATUS = 'gc_comms_status', MAX = 500, BODY_MAX = 8000, FILE_MAX = 2 * 1024 * 1024;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function env(k){ return s(process.env[k]); }
function L(){ return require('../bid-inbox.js')._lib; }
function core(){ return require('../portal.js')._core; }
function nowIso(){ return new Date().toISOString(); }
const OURS = /@grayco-cs\.com$|@in\.grayco-cs\.com$/i;
function journalAddrs(){ return (env('COMMS_INBOX_TO') || 'mail@in.grayco-cs.com').split(',').map(low).filter(Boolean); }
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/* ── is this e-mail a copy for the history? ── */
function isJournal(mail, data, recipients){
  const want = journalAddrs(), H = mail.headers || {};
  /* patch MAILFIX: Google's routing rule adds X-GrayCo-Journal: 1 to the MESSAGE, so the copy a Google Group (invoices@,
     receipts@, leads@, bids@ …) hands its in.grayco-cs.com member carries it too. Resend's envelope recipient (the
     webhook's to / cc) decides: delivered to one of our own inboxes = that inbox's mail, never a history copy. */
  if (envInbox(data)) return false;
  if (recipients.some(function(x){ return want.indexOf(low(x)) >= 0; })) return true;
  if (low(H['x-grayco-journal'])) return true;
  return false;
}

/* the webhook's own recipient that is one of our inboxes (not the history address), or '' */
function envInbox(data){
  const d = data || {}, want = journalAddrs();
  const to = [].concat(d.to || [], d.cc || []).map(function(x){ return low(x && typeof x === 'object' ? (x.email || x.address) : x); })
    .map(function(x){ const m = /<([^>]+)>/.exec(x); return m ? m[1] : x; });
  return to.filter(function(e){ return /@in\.grayco-cs\.com$/.test(e) && want.indexOf(e) < 0; })[0] || '';   /* with mail@in on the same delivery too: the inbox wins (the history copy is the lesser loss) */
}

/* the CRM's ✉️ / Gmail buttons BCC mail@in.grayco-cs.com (until the routing rule is on): a BCC is in no header, so a
   message that reached the receiving domain and is for none of its inboxes (bids@, leads@, claims@, bills@, orders@, …)
   is that copy. Safe either way: anything that is not a job's e-mail is thrown away. */
const INBOXES = /^(bids|leads|claims|bills|billing|orders|receipts|invoices|news|portal|replies|noreply|office)@(in\.)?grayco-cs\.com$/i;   /* + receipts@ / invoices@ (patch OWNERTODO) */
function isBccCopy(recipients, forAnInbox){
  if (forAnInbox) return false;
  const r = arr(recipients).map(low).filter(Boolean);
  if (r.some(function(e){ return INBOXES.test(e) || (/@in\.grayco-cs\.com$/.test(e) && journalAddrs().indexOf(e) < 0); })) return false;
  return true;
}

/* ── the quoted history ("On … wrote:", "-----Original Message-----", "> …") comes off ── */
function stripQuoted(t){
  t = String(t || '').replace(/\r\n/g, '\n');
  const cut = [/\n\s*On [^\n]{4,200}wrote:\s*\n/i, /\n\s*-{2,}\s*Original Message\s*-{2,}/i, /\n\s*From:\s[^\n]+\n\s*(Sent|Date):\s/i, /\n_{8,}\n/, /\n\s*Sent from my (iPhone|iPad|Android|Galaxy)[^\n]*/i];
  let end = t.length; cut.forEach(function(re){ const m = re.exec(t); if (m && m.index < end && m.index > 0) end = m.index; });
  t = t.slice(0, end).split('\n').filter(function(l){ return !/^\s*>/.test(l); }).join('\n');
  return t.replace(/\n{3,}/g, '\n\n').trim().slice(0, BODY_MAX);
}

/* ── which job (null: not a job's e-mail → discarded) ── */
function poOf(subject){ const m = /\bPO[\s#:.-]*([A-Za-z0-9][A-Za-z0-9-]{1,24})\b/i.exec(s(subject)); return m ? low(m[1]) : ''; }
const CLOSED = /^(lost|dead|deleted|cancell?ed|archived)$/i, DONE = /^(completed?|closed|paid|paid in full|finished|warranty)$/i;
function active(p){ return p && p.deleted !== true && !CLOSED.test(s(p.status)); }
function stampOf(p){ return s(p.updatedAt || p.savedAt || p.created || p.createdAt); }
function emailsIn(obj, out){
  if (obj == null) return out;
  if (typeof obj === 'string') { const m = obj.match(EMAIL_RE); if (m) m.forEach(function(e){ e = low(e); if (!OURS.test(e)) out[e] = 1; }); return out; }
  if (Array.isArray(obj)) { obj.forEach(function(x){ emailsIn(x, out); }); return out; }
  if (typeof obj === 'object') Object.keys(obj).forEach(function(k){ if (!/^(notes|photos|docs|files|history|log|timeline|messages|portalChoices|checklist)$/i.test(k)) emailsIn(obj[k], out); });
  return out;
}
/* the index: outside e-mail → job ids; PO → job id */
function buildIndex(d){
  const dead = {}; arr(d.gc_deleted_projects).forEach(function(x){ dead[s(x)] = 1; });
  const projects = arr(d.projects).filter(function(p){ return p && p.id && !dead[s(p.id)] && p.deleted !== true; });
  const byPo = {}, byEmail = {}, byId = {};
  function add(e, pid){ e = low(e); if (!e || OURS.test(e)) return; (byEmail[e] = byEmail[e] || {})[pid] = 1; }
  projects.forEach(function(p){
    byId[s(p.id)] = p;
    [p.autoPO, p.po].forEach(function(x){ if (s(x)) byPo[low(x)] = s(p.id); });
    Object.keys(emailsIn(p, {})).forEach(function(e){ add(e, s(p.id)); });
  });
  /* customers: by name / id → their jobs */
  arr(d.customers).forEach(function(c){
    const es = Object.keys(emailsIn([c.email, c.email2, c.billingEmail, c.contacts, c.contactEmail], {})); if (!es.length) return;
    const nm = low(c.name || c.company);
    projects.forEach(function(p){ if ((c.id && (s(p.customerId) === s(c.id) || s(p.clientId) === s(c.id))) || (nm && low(p.client || p.customer || p.clientName) === nm)) es.forEach(function(e){ add(e, s(p.id)); }); });
  });
  /* claims: the adjusters, the insured */
  arr(d.gc_claims).forEach(function(c){ if (!c || c.deleted === true || !byId[s(c.projectId)]) return; Object.keys(emailsIn([c.adjuster, c.deskAdjuster, c.insured, c.insuredEmail, c.contacts, c.programContact], {})).forEach(function(e){ add(e, s(c.projectId)); }); });
  /* subs / vendors: their jobs (the job names them by id or by name) */
  arr(d.subs).concat(arr(d.vendors)).forEach(function(x){
    if (!x || typeof x !== 'object') return;
    const es = Object.keys(emailsIn([x.email, x.email2, x.contactEmail, x.contacts], {})); if (!es.length) return;
    const id = s(x.id), nm = low(x.name || x.company);
    projects.forEach(function(p){
      const t = low(JSON.stringify([p.subs, p.assignedSubs, p.subIds, p.trades, p.subcontractors, p.vendors, p.gc, p.gcName]));
      if ((id && t.indexOf(low(id)) >= 0) || (nm && nm.length > 3 && t.indexOf(nm) >= 0)) es.forEach(function(e){ add(e, s(p.id)); });
    });
  });
  return { byPo: byPo, byEmail: byEmail, byId: byId };
}
function pickJob(I, ids){
  const ps = Object.keys(ids || {}).map(function(id){ return I.byId[id]; }).filter(Boolean);
  if (!ps.length) return null;
  ps.sort(function(a, b){ const aa = active(a) && !DONE.test(s(a.status)) ? 1 : 0, bb = active(b) && !DONE.test(s(b.status)) ? 1 : 0; return bb - aa || stampOf(b).localeCompare(stampOf(a)); });
  return ps[0];
}
function match(I, mail){
  const po = poOf(mail.subject);
  if (po && I.byPo[po]) return { pid: I.byPo[po], how: 'PO' };
  const ext = parties(mail).ext;
  const ids = {}; ext.forEach(function(e){ Object.keys(I.byEmail[e] || {}).forEach(function(id){ ids[id] = 1; }); });
  const p = pickJob(I, ids);
  return p ? { pid: s(p.id), how: 'contact' } : null;
}
function parties(mail){
  const from = low(mail.from && mail.from.email);
  const rcpt = arr(mail.to).concat(arr(mail.cc)).map(function(x){ return low(x && x.email); }).filter(Boolean);
  const out = OURS.test(from);
  const ext = (out ? rcpt : [from]).filter(function(e){ return e && !OURS.test(e); });
  return { dir: out ? 'out' : 'in', ext: Array.from(new Set(ext)) };
}
function skip(mail){
  const H = mail.headers || {};
  const a = low(H['auto-submitted']); if (a && a !== 'no') return 'automatic';
  if (/^(out of office|automatic reply|auto(matic)?[- ]?reply|undeliverable|delivery status notification|mail delivery|read:|accepted:|declined:|tentative:)/i.test(s(mail.subject))) return 'automatic';
  if (/^(mailer-daemon|postmaster|no-?reply|donotreply|do-not-reply)@/i.test(low(mail.from && mail.from.email))) return 'automatic';
  if (H['x-grayco-crm'] || H['x-grayco-item']) return 'sent by the CRM';
  if (/^(noreply|portal|billing|news|bids|leads|claims|orders)@grayco-cs\.com$/i.test(low(mail.from && mail.from.email))) return 'sent by the CRM';
  if ((low(H.precedence) === 'bulk' || low(H.precedence) === 'list' || H['list-unsubscribe']) && !poOf(mail.subject)) return 'newsletter';
  return '';
}
function idOf(mail){ return 'em_' + crypto.createHash('sha256').update(s(mail.messageId) || [low(mail.from && mail.from.email), s(mail.date), s(mail.subject)].join('|')).digest('hex').slice(0, 24); }

/* ── the private store ── */
async function status(change){ try { await L().kvCas(STATUS, function(v){ const st = Object.assign({ days: {}, matched: 0, discarded: 0 }, v || {}); change(st); const keys = Object.keys(st.days).sort(); while (keys.length > 60) delete st.days[keys.shift()]; return st; }); } catch (e) {} }
async function add(pid, entry){
  pid = s(pid); if (!pid || !entry || !entry.id) return { ok: false };
  let added = false;
  await L().kvCas(PREFIX + pid, function(v){
    const list = arr(v);
    const i = list.findIndex(function(x){ return x && x.id === entry.id; });
    if (i >= 0) { const x = list[i]; const seen = Array.from(new Set(arr(x.seenBy).concat(arr(entry.seenBy)))); if (seen.length === arr(x.seenBy).length) return undefined; x.seenBy = seen.slice(0, 20); return list; }
    added = true;
    return list.concat([entry]).sort(function(a, b){ return s(a.at) < s(b.at) ? -1 : 1; }).slice(-MAX);
  });
  return { ok: true, added: added };
}
async function read(pid){ try { return arr(await L().kvGet(PREFIX + s(pid))); } catch (e) { return []; } }

/* ── one routing copy ── */
async function fromJournal(mail, opts){
  opts = opts || {};
  const day = nowIso().slice(0, 10);
  const sk = skip(mail);
  if (sk) { await status(function(st){ st.discarded++; const d = st.days[day] = st.days[day] || { m: 0, d: 0 }; d.d++; }); return { ok: true, stored: false, why: sk }; }
  let data = opts.data;
  if (!data) data = await core().kvRead(['projects', 'customers', 'gc_claims', 'gc_deleted_projects', 'subs', 'vendors']);
  const I = buildIndex(data), hit = match(I, mail);
  if (!hit) {   /* not a job's e-mail: nothing about it is kept, only the count */
    await status(function(st){ st.discarded++; const d = st.days[day] = st.days[day] || { m: 0, d: 0 }; d.d++; });
    return { ok: true, stored: false, why: 'not a job e-mail' };
  }
  const pt = parties(mail), H = mail.headers || {};
  const files = [];
  for (const f of arr(mail.files)) {
    const meta = { name: s(f.name).slice(0, 120), type: s(f.type), size: f.size || 0 };
    if (f.buf && f.size <= FILE_MAX && /^(application\/pdf|image\/(jpeg|png|gif|webp))$/.test(meta.type)) { try { const st = await L().storeFile(f.buf, meta.type, meta.name); if (st.ref) meta.ref = st.ref; } catch (e) {} }
    files.push(meta);
  }
  arr(mail.skipped).forEach(function(x){ files.push({ name: s(x.name).slice(0, 120), notKept: s(x.why) }); });
  const staff = low(pt.dir === 'out' ? mail.from.email : (arr(mail.to).concat(arr(mail.cc)).map(function(x){ return low(x.email); }).find(function(e){ return OURS.test(e) && !/@in\./.test(e); }) || ''));
  const entry = { id: idOf(mail), kind: 'email', dir: pt.dir, at: s(mail.date) ? new Date(mail.date).toISOString() : nowIso(),
    from: { name: s(mail.from.name).slice(0, 80), email: low(mail.from.email) }, to: arr(mail.to).map(function(x){ return low(x.email); }).slice(0, 20), cc: arr(mail.cc).map(function(x){ return low(x.email); }).slice(0, 20),
    subject: s(mail.subject).slice(0, 250), text: stripQuoted(mail.text), files: files, how: hit.how, seenBy: staff ? [staff] : [], mid: s(mail.messageId).slice(0, 200) };
  if (isNaN(Date.parse(entry.at))) entry.at = nowIso();
  const r = await add(hit.pid, entry);
  await status(function(st){ st.matched++; const d = st.days[day] = st.days[day] || { m: 0, d: 0 }; d.m++; st.lastAt = nowIso(); st.lastJob = hit.pid; st.lastHow = hit.how; });
  return { ok: true, stored: true, added: r.added, pid: hit.pid, how: hit.how };
}
/* a text message / portal message onto the job's history (Twilio and the portal call this) */
async function addMessage(pid, o){
  o = o || {};
  const kind = /^(text|portal|call|note)$/.test(s(o.kind)) ? s(o.kind) : 'text';
  const entry = { id: s(o.id) || (kind + '_' + crypto.createHash('sha256').update([pid, o.at, o.from, o.text].map(s).join('|')).digest('hex').slice(0, 20)), kind: kind, dir: o.dir === 'out' ? 'out' : 'in',
    at: s(o.at) || nowIso(), from: { name: s(o.fromName).slice(0, 80), email: s(o.from).slice(0, 120) }, to: arr(o.to).map(s).slice(0, 10), subject: s(o.subject).slice(0, 200), text: s(o.text).slice(0, BODY_MAX), files: arr(o.files).slice(0, 10), seenBy: [] };
  return add(pid, entry);
}

module.exports = { isJournal, envInbox, isBccCopy, fromJournal, addMessage, add, read, stripQuoted, buildIndex, match, parties, skip, poOf, journalAddrs, PREFIX, STATUS };
