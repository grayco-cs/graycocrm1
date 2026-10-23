/* ============================================================================
   GrayCo — 📧 EMAIL CENTER: the addresses and the "📥 All company mail" log (patch MAILC, owner 10/23: "I don't think
   any of this works, but I'd like this to work for all emails and aliases that I have, so I can see all emails in here").
   netlify/functions/_lib/mailcenter.js — used by bid-inbox.js (every e-mail the CRM's receiving domain gets is logged
   here: who, to which address, the subject, what the CRM did with it — NOT the body) and mail-center.js (the page).

   What the log can hold: only mail that reaches the CRM — the addresses whose Google group / alias / routing rule sends
   a copy to an in.grayco-cs.com address (leads@ → leads@in, bids@ → bids@in, office@'s orders → orders@in, the Google
   routing rule → mail@in for job e-mail). Mail that never reaches the CRM is not here; the page says so.
   Store (service-only gc_lead_inbox_kv): "gc_mail_log" (newest 3000, metadata only), "gc_email_center" (the addresses).
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const LOG_KEY = 'gc_mail_log', SET_KEY = 'gc_email_center', MAX = 3000;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
function emails(v){
  const out = [];
  (Array.isArray(v) ? v : [v]).forEach(x => {
    if (x && typeof x === 'object') x = x.email || x.address || '';
    (s(x).match(EMAIL) || []).forEach(e => out.push(low(e)));
  });
  return Array.from(new Set(out));
}

/* the company's addresses: data, edited in the Email Center (admins). mailbox = the Google account that receives it
   ("" = each person's own mailbox — a group they are in); crm = a copy reaches the CRM (in.grayco-cs.com). */
const DEFAULT_ALIASES = [
  { address: 'leads@grayco-cs.com', kind: 'group', mailbox: '', crm: true, note: 'Customer leads and bid invitations — copy to leads@in.grayco-cs.com' },
  { address: 'bids@grayco-cs.com', kind: 'group', mailbox: '', crm: true, note: 'Sub bids and GC replies to our bids — copy to bids@in.grayco-cs.com' },
  { address: 'billing@grayco-cs.com', kind: 'alias', mailbox: 'office@grayco-cs.com', crm: false, note: 'Invoices and payments (alias on office@)' },
  { address: 'news@grayco-cs.com', kind: 'alias', mailbox: 'office@grayco-cs.com', crm: false, note: 'Newsletter (alias on office@)' },
  { address: 'portal@grayco-cs.com', kind: 'alias', mailbox: 'office@grayco-cs.com', crm: false, note: 'Customer portal mail (alias on office@)' },
  { address: 'replies@grayco-cs.com', kind: 'group', mailbox: '', crm: false, note: 'Replies to the CRM\'s automatic e-mails' },
  { address: 'claims@grayco-cs.com', kind: 'group', mailbox: '', crm: true, note: 'Insurance claim mail — copy to claims@in.grayco-cs.com' },
  { address: 'orders@grayco-cs.com', kind: 'alias', mailbox: 'office@grayco-cs.com', crm: true, note: 'Supplier order confirmations — copy to orders@in.grayco-cs.com' }
];
function cleanAlias(a){
  a = a || {};
  const address = emails(a.address)[0] || '';
  if (!address) return null;
  return { address, kind: /^(group|alias|mailbox)$/.test(s(a.kind)) ? s(a.kind) : 'alias', mailbox: emails(a.mailbox)[0] || '', crm: !!a.crm, note: s(a.note).slice(0, 160), name: s(a.name).slice(0, 60) };
}
function settings(v){
  let o = v; if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
  o = o && typeof o === 'object' ? o : {};
  const al = Array.isArray(o.aliases) ? o.aliases.map(cleanAlias).filter(Boolean) : DEFAULT_ALIASES.map(cleanAlias);
  const seen = {}, aliases = al.filter(a => { if (seen[a.address]) return false; seen[a.address] = 1; return true; });
  const mailboxes = Array.from(new Set(emails(o.mailboxes || []))).slice(0, 40);   /* extra mailboxes beyond the staff list */
  const hidden = Array.from(new Set(emails(o.hidden || []))).slice(0, 40);
  const out = { aliases: aliases.slice(0, 60), mailboxes, hidden };
  if (s(o.by)) out.by = low(o.by); if (s(o.at)) out.at = s(o.at);
  return out;
}

/* one received e-mail → one log row (metadata only; never the body) */
function rowOf(evt, result){
  const d = (evt && (evt.data || evt)) || {};
  const to = emails([].concat(d.to || [], d.cc || [], d.bcc || [], d.recipients || [], d.envelope_to || d.envelope && d.envelope.to || []));
  const from = emails(d.from)[0] || '', subject = s(d.subject).slice(0, 200);
  const at = s(d.created_at || d.date) && !isNaN(Date.parse(d.created_at || d.date)) ? new Date(d.created_at || d.date).toISOString() : new Date().toISOString();
  const id = s(d.email_id || d.id || d.message_id) || crypto.createHash('sha256').update([from, to.join(','), subject, at].join('|')).digest('hex').slice(0, 24);
  const b = (result && result.body) || {};
  let what = '';
  if (b.ignored) what = 'not kept — ' + s(b.ignored).slice(0, 80);
  else if (b.inbox === 'history') what = b.stored ? 'job e-mail history' : 'not a job e-mail (thrown away)';
  else if (b.inbox) what = { leads: 'lead', 'sub-bids': 'sub bid', orders: 'supplier order', 'bid-replies': 'GC reply to our bid', unsorted: 'bids@ — unsorted' }[b.inbox] || s(b.inbox);
  else if (b.results) what = 'bid results answer';
  else if (b.notice) what = 'Google group notice';
  else if (b.accepted) what = 'received (being processed)';
  else if (result && result.status >= 500) what = 'could not store yet — retried';
  else if (b.ok && (b.id || b.items || b.lead)) what = 'bid invitation → lead';
  else what = 'received';
  return { id, at, from, to: to.slice(0, 12), subject, what: what.slice(0, 100), status: result ? result.status : 0,
    pid: s(b.pid || b.jobId), lead: s(b.leadId || b.lead || (typeof b.id === 'string' && /^bi_|^lead|^web/i.test(b.id) ? b.id : '')) };
}
async function log(evt, result, kv){
  /* the job e-mail history keeps NOTHING about an e-mail that is not a job's (patch X9, owner rule: personal / other
     mail copied by the routing rule is thrown away on arrival — not stored, not logged) */
  const b = (result && result.body) || {};
  if (b.inbox === 'history' && !b.stored) return null;
  const row = rowOf(evt, result);
  await kv.kvCas(LOG_KEY, v => {
    const l = arr(v);
    const i = l.findIndex(x => x && x.id === row.id);
    if (i >= 0) { if (l[i].what === row.what || /being processed/.test(row.what)) return undefined; l[i] = Object.assign({}, l[i], row, { at: l[i].at }); return l; }
    return l.concat([row]).slice(-MAX);
  });
  return row;
}
/* which known address(es) a row was for */
function addrsOf(row, known){
  const to = arr(row.to).map(low);
  const hit = known.filter(a => to.indexOf(low(a)) >= 0 || to.indexOf(low(a).replace('@grayco-cs.com', '@in.grayco-cs.com')) >= 0);
  if (!hit.length && to.some(t => /^mail@in\.grayco-cs\.com$/.test(t))) hit.push('job e-mail history');
  return hit;
}
function query(list, o){
  o = o || {};
  const q = low(o.q), addr = low(o.addr), lim = Math.max(1, Math.min(500, parseInt(o.limit, 10) || 200));
  let rows = arr(list).filter(x => x && x.id).slice().sort((a, b) => s(b.at).localeCompare(s(a.at)));
  if (addr) rows = rows.filter(x => arr(x.to).some(t => low(t) === addr || low(t) === addr.replace('@grayco-cs.com', '@in.grayco-cs.com')) || (addr === 'history' && arr(x.to).some(t => /^mail@in\./.test(t))));
  if (q) rows = rows.filter(x => (low(x.from) + ' ' + low(x.subject) + ' ' + arr(x.to).join(' ') + ' ' + low(x.what)).indexOf(q) >= 0);
  return rows.slice(0, lim);
}

module.exports = { LOG_KEY, SET_KEY, DEFAULT_ALIASES, settings, cleanAlias, rowOf, log, query, addrsOf, emails };
