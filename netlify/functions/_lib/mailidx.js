/* netlify/functions/_lib/mailidx.js — patch MAILALL: the "🌐 All GrayCo e-mail" index (owner 10/23: "open all aliases
   and e-mails that receive and send — I want to see all e-mailing from GrayCo").

   METADATA ONLY — never a message body. One row per e-mail:
     { id, mid (Message-ID), thread, mailbox (or "crm"), at, from, to[], cc[], subject, snippet, labels[], att, dir: in|out,
       src: gmail|crm|sms, kind, status (crm: sent|paused|failed), pid, cust, lead }
   Store: the service-only table gc_lead_inbox_kv (docs/lead-inbox.sql) — gc_kv until that SQL has run (docs/email-all.sql
   puts these keys in the admin-only class there). Never synced to a browser; read only through mail-all.js (admins).
     gc_mail_index__<mailbox>      newest 2000 Gmail rows of that mailbox (mail-all-sync, every 15 min, historyId)
     gc_mail_index__crm__<YYYY-MM> every e-mail / text the CRM itself sent that month (sent, paused or failed), newest 5000
     gc_mail_sync_state            { <mailbox>: { historyId, at, err, n } }
     gc_mail_access_log            who opened which message body, when (newest 5000)
     gc_mail_all_settings          { pmSeesJobMail: false }
     gc_mail_links                 { <mid or id>: pid } — "Link to job" by an admin */
'use strict';
const crypto = require('crypto');
const MAX_BOX = 2000, MAX_CRM = 5000, MAX_LOG = 5000;
const STATE_KEY = 'gc_mail_sync_state', ACCESS_KEY = 'gc_mail_access_log', SET_KEY = 'gc_mail_all_settings', LINKS_KEY = 'gc_mail_links';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function nowIso(){ return new Date().toISOString(); }
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
function emails(v){
  const out = [];
  (Array.isArray(v) ? v : [v]).forEach(x => { if (x && typeof x === 'object') x = x.email || x.address || ''; (s(x).match(EMAIL) || []).forEach(e => out.push(low(e))); });
  return Array.from(new Set(out));
}
function boxKey(mailbox){ return 'gc_mail_index__' + low(mailbox); }
function crmKey(d){ return 'gc_mail_index__crm__' + (d || nowIso()).slice(0, 7); }

/* ── the store (service key, server side only) ───────────────────────────── */
function sbUrl(){ return s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function sbKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function rawFetch(){ return globalThis.fetch; }   /* Supabase writes are never logged as sends, so no loop through the pause guard */
function sb(path, opts){
  opts = opts || {};
  const k = sbKey();
  return rawFetch()(sbUrl() + '/rest/v1/' + path, { method: opts.method || 'GET',
    headers: Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, opts.headers || {}), body: opts.body });
}
let TABLE = null, TABLE_AT = 0;
async function table(){
  if (TABLE && Date.now() - TABLE_AT < 300000) return TABLE;
  const r = await sb('gc_lead_inbox_kv?select=key&limit=1');
  if (r.ok) TABLE = 'gc_lead_inbox_kv';
  else {
    const t = await r.text().catch(() => '');
    if (r.status === 404 || /PGRST20[0-9]|does not exist|schema cache/i.test(t)) TABLE = 'gc_kv';
    else throw new Error('database unavailable (' + r.status + ')');
  }
  TABLE_AT = Date.now(); return TABLE;
}
function parseVal(v){ if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) {} } return v; }
async function read(key){
  const T = await table();
  const r = await sb(T + '?select=value,updated_at&key=eq.' + encodeURIComponent(key));
  if (!r.ok) throw new Error('database read failed (' + r.status + ')');
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return { exists: false, v: null, at: '' };
  return { exists: true, v: parseVal(rows[0].value), at: s(rows[0].updated_at) };
}
async function get(key){ try { return (await read(key)).v; } catch (e) { return null; } }
/* read → change → write only if nobody wrote in between; change() returning undefined = no write */
async function cas(key, change, tries){
  tries = tries || 6;
  const T = await table();
  for (let i = 0; i < tries; i++) {
    const cur = await read(key);
    const next = change(cur.v == null ? null : JSON.parse(JSON.stringify(cur.v)));
    if (next === undefined) return { ok: true, unchanged: true, value: cur.v };
    const at = nowIso();
    let r;
    if (cur.exists) {
      r = await sb(T + '?key=eq.' + encodeURIComponent(key) + '&updated_at=eq.' + encodeURIComponent(cur.at), { method: 'PATCH',
        headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value: next, updated_at: at }) });
      if (r.ok) { const rows = await r.json().catch(() => []); if (Array.isArray(rows) && rows.length) return { ok: true, value: next }; }
      else if (r.status >= 500) throw new Error('database write failed (' + r.status + ')');
    } else {
      r = await sb(T, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key, value: next, updated_at: at }) });
      if (r.ok) return { ok: true, value: next };
      if (r.status >= 500) throw new Error('database write failed (' + r.status + ')');
    }
    await new Promise(res => setTimeout(res, 80 + Math.floor(Math.random() * 300)));
  }
  throw new Error('the e-mail index was busy — try again');
}

/* ── rows ──────────────────────────────────────────────────────────────────── */
function clean(r){
  r = r || {};
  return { id: s(r.id).slice(0, 120), mid: s(r.mid).slice(0, 300), thread: s(r.thread).slice(0, 60), mailbox: low(r.mailbox).slice(0, 120),
    at: s(r.at) && !isNaN(Date.parse(r.at)) ? new Date(r.at).toISOString() : nowIso(),
    from: emails(r.from)[0] || '', fromName: s(r.fromName).slice(0, 80), to: emails(r.to).slice(0, 20), cc: emails(r.cc).slice(0, 20),
    subject: s(r.subject).slice(0, 250), snippet: s(r.snippet).slice(0, 220), labels: arr(r.labels).map(s).slice(0, 20), att: !!r.att,
    dir: r.dir === 'out' ? 'out' : 'in', src: /^(gmail|crm|sms)$/.test(s(r.src)) ? s(r.src) : 'gmail', kind: s(r.kind).slice(0, 60), status: s(r.status).slice(0, 20),
    pid: s(r.pid).slice(0, 80), cust: s(r.cust).slice(0, 80), lead: s(r.lead).slice(0, 80) };
}
/* add rows to a list key: newest first by date, unique by id, capped */
function merge(list, rows, max){
  const by = {}; arr(list).concat(rows).forEach(x => { if (x && x.id) by[x.id] = Object.assign({}, by[x.id] || {}, x); });
  return Object.keys(by).map(k => by[k]).sort((a, b) => s(b.at).localeCompare(s(a.at))).slice(0, max || MAX_BOX);
}
async function addRows(key, rows, max){
  rows = arr(rows).map(clean).filter(r => r.id);
  if (!rows.length) return { ok: true, n: 0 };
  await cas(key, v => merge(v, rows, max || MAX_BOX));
  return { ok: true, n: rows.length };
}

/* ── what the CRM itself sends (called by the pause guard for every Resend / Twilio send) ──────────────────────── */
function textAddrs(v){ const out = []; (Array.isArray(v) ? v : [v]).forEach(x => s(x).split(',').forEach(p => { const m = /<([^>]+)>/.exec(p); const a = low(m ? m[1] : p); if (a) out.push(a); })); return out; }
function crmRow(kind, url, body, status, providerId){
  const at = nowIso();
  if (kind === 'sms') {
    const p = body || {}; const to = s(p.To || p.to), from = s(p.From || p.from);
    return clean({ id: 'sms_' + (s(providerId) || crypto.createHash('sha256').update([to, s(p.Body).slice(0, 40), at].join('|')).digest('hex').slice(0, 20)),
      mailbox: 'crm', at, from: '', fromName: from, to: [], subject: 'Text to ' + to, snippet: s(p.Body).slice(0, 160), dir: 'out', src: 'sms', kind: 'text', status });
  }
  const m = body || {};
  const id = s(providerId) || crypto.createHash('sha256').update([s(m.from), textAddrs(m.to).join(','), s(m.subject), at].join('|')).digest('hex').slice(0, 24);
  const tags = {}; arr(m.tags).forEach(t => { if (t && t.name) tags[s(t.name)] = s(t.value); });
  const hdr = m.headers || {};
  return clean({ id: 'crm_' + id, mailbox: 'crm', at, from: s(m.from), fromName: (/^\s*"?([^"<]+?)"?\s*</.exec(s(m.from)) || [])[1] || '',
    to: textAddrs(m.to), cc: textAddrs(m.cc).concat(textAddrs(m.bcc)), subject: s(m.subject), snippet: s(m.text || '').replace(/\s+/g, ' ').slice(0, 160),
    att: arr(m.attachments).length > 0, dir: 'out', src: 'crm', kind: s(tags.kind || tags.category || hdr['X-GC-Kind'] || ''), status,
    pid: s(tags.pid || tags.job || hdr['X-GC-Job'] || ''), mid: s(hdr['Message-ID'] || hdr['Message-Id'] || '') });
}
async function logCrmSend(rows){
  if (!sbKey() || s(process.env.MAIL_LOG_CRM) === '0') return { ok: false, skipped: true };
  try { return await addRows(crmKey(), rows, MAX_CRM); } catch (e) { return { ok: false, error: s(e && e.message) }; }
}

/* ── reading the index ─────────────────────────────────────────────────────── */
async function crmRows(){
  const now = new Date(), prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
  const a = arr(await get(crmKey())), b = arr(await get(crmKey(prev)));
  return a.concat(b);
}
async function allRows(mailboxes, withCrm){
  let rows = [];
  for (const m of arr(mailboxes)) rows = rows.concat(arr(await get(boxKey(m))));
  if (withCrm !== false) rows = rows.concat(await crmRows());
  return rows;
}
/* the same e-mail in several mailboxes (a group, a cc) → one row with every mailbox */
function collapse(rows){
  const by = {}, order = [];
  arr(rows).forEach(r => {
    if (!r || !r.id) return;
    const k = r.mid ? 'm:' + low(r.mid) : 'i:' + r.mailbox + ':' + r.id;
    if (!by[k]) { by[k] = Object.assign({}, r, { mailboxes: [r.mailbox] }); order.push(k); }
    else { const x = by[k]; if (x.mailboxes.indexOf(r.mailbox) < 0) x.mailboxes.push(r.mailbox); if (r.dir === 'out') x.dir = 'out'; ['pid', 'cust', 'lead'].forEach(f => { if (!x[f] && r[f]) x[f] = r[f]; }); }
  });
  return order.map(k => by[k]).sort((a, b) => s(b.at).localeCompare(s(a.at)));
}
function filter(rows, o){
  o = o || {};
  const q = low(o.q), addr = low(o.addr), mb = low(o.mailbox), dir = low(o.dir), from = s(o.from), to = s(o.to), pid = s(o.pid), cust = s(o.cust);
  const em = emails(o.emails || []);
  return arr(rows).filter(r => {
    if (mb && arr(r.mailboxes || [r.mailbox]).indexOf(mb) < 0) return false;
    if (addr && r.from !== addr && arr(r.to).indexOf(addr) < 0 && arr(r.cc).indexOf(addr) < 0) return false;
    if (dir && r.dir !== dir) return false;
    if (o.src && r.src !== o.src) return false;
    if (o.att && !r.att) return false;
    if (from && s(r.at) < from) return false;
    if (to && s(r.at).slice(0, 10) > to) return false;
    if (pid && r.pid !== pid) return false;
    if (cust || em.length) {
      const hitE = em.length > 0 && (em.indexOf(r.from) >= 0 || arr(r.to).some(t => em.indexOf(t) >= 0) || arr(r.cc).some(t => em.indexOf(t) >= 0));
      if (!((cust && r.cust === cust) || hitE)) return false;
    }
    if (q && (low(r.from) + ' ' + low(r.fromName) + ' ' + arr(r.to).join(' ') + ' ' + low(r.subject) + ' ' + low(r.snippet)).indexOf(q) < 0) return false;
    return true;
  });
}

/* ── matching an e-mail to a job / customer / lead (the CRM's records, read with the service key) ──────────────── */
async function crmData(keys){
  const want = []; keys.forEach(k => want.push(k, k + '__manifest'));
  const r = await sb('gc_kv?select=key,value,updated_at&key=in.(' + want.map(k => '"' + k + '"').join(',') + ')');
  if (!r.ok) return {};
  const rows = await r.json(), by = {}; (Array.isArray(rows) ? rows : []).forEach(x => { by[x.key] = x; });
  const out = {};
  for (const k of keys) {
    let val = by[k] ? by[k].value : null, man = by[k + '__manifest'], mv = man && parseVal(man.value);
    if (mv && mv.chunked && mv.count > 0 && (!by[k] || s(man.updated_at) >= s(by[k].updated_at))) {
      const names = []; for (let i = 0; i < Math.min(mv.count, 60); i++) names.push('"' + k + '__chunk' + i + '"');
      const rr = await sb('gc_kv?select=key,value&key=in.(' + names.join(',') + ')');
      if (rr.ok) { const parts = await rr.json(), b = {}; (parts || []).forEach(x => { b[x.key] = parseVal(x.value); }); let all = []; for (let i = 0; i < mv.count; i++) all = all.concat(arr(b[k + '__chunk' + i])); if (all.length) val = all; }
    }
    out[k] = arr(parseVal(val));
  }
  return out;
}
function norm(v){ return low(v).replace(/[^a-z0-9]+/g, ' ').trim(); }
/* email → { pid, cust, lead }; PO → pid */
function matcher(data){
  data = data || {};
  const byEmail = {}, byPo = {};
  const custs = arr(data.customers).filter(c => c && c.id && c.deleted !== true);
  const custEm = {};
  custs.forEach(c => { const em = emails([c.email].concat(arr(c.emails), arr(c.contacts).map(x => x && x.email))); custEm[c.id] = em; em.forEach(e => { byEmail[e] = byEmail[e] || {}; byEmail[e].cust = byEmail[e].cust || s(c.id); }); });
  const projects = arr(data.projects).filter(p => p && p.id && p.deleted !== true);
  /* open jobs first, then newest: an address belongs to the most recent open job of that customer */
  projects.slice().sort((a, b) => (/complete|closed|done|paid/i.test(s(a.status)) ? 1 : 0) - (/complete|closed|done|paid/i.test(s(b.status)) ? 1 : 0) || s(b.startDate || b.createdAt).localeCompare(s(a.startDate || a.createdAt))).forEach(p => {
    const c = custs.find(x => s(x.id) === s(p.customerId || p.clientId)) || custs.find(x => norm(x.name) && norm(x.name) === norm(p.customer || p.client || p.clientName));
    const em = emails([p.email, p.customerEmail, p.clientEmail, p.gcEmail, p.contactEmail, p.adjusterEmail].concat(c ? custEm[c.id] : []));
    em.forEach(e => { byEmail[e] = byEmail[e] || {}; if (!byEmail[e].pid) byEmail[e].pid = s(p.id); if (!byEmail[e].cust && c) byEmail[e].cust = s(c.id); });
    const po = s(p.po || p.poNumber || p.PO); if (/^[A-Z]\d{3,4}$/i.test(po)) byPo[po.toUpperCase()] = s(p.id);
  });
  arr(data.leads).forEach(l => { if (!l || !l.id) return; emails([l.email, l.contactEmail]).forEach(e => { byEmail[e] = byEmail[e] || {}; if (!byEmail[e].lead) byEmail[e].lead = s(l.id); }); });
  return function(row){
    const hit = {};
    const others = [row.from].concat(arr(row.to), arr(row.cc)).filter(e => e && !/@(in\.)?grayco-cs\.com$/.test(e));
    others.forEach(e => { const m = byEmail[e]; if (m) ['pid', 'cust', 'lead'].forEach(f => { if (!hit[f] && m[f]) hit[f] = m[f]; }); });
    const po = (s(row.subject).toUpperCase().match(/\b[A-Z]\d{3,4}\b/g) || []).find(x => byPo[x]);
    if (po) hit.pid = byPo[po];   /* a PO in the subject wins: GCs with several jobs */
    return hit;
  };
}

/* ── the access log (who opened which body) ────────────────────────────────── */
async function logAccess(who, row){
  const e = { at: nowIso(), by: low(who), mailbox: low(row && row.mailbox), id: s(row && row.id).slice(0, 120), subject: s(row && row.subject).slice(0, 160), from: s(row && row.from).slice(0, 120) };
  try { await cas(ACCESS_KEY, v => arr(v).concat([e]).slice(-MAX_LOG)); return true; } catch (err) { return false; }
}

module.exports = { MAX_BOX, MAX_CRM, STATE_KEY, ACCESS_KEY, SET_KEY, LINKS_KEY, boxKey, crmKey, emails, clean, merge, addRows, crmRow, logCrmSend,
  crmRows, allRows, collapse, filter, matcher, crmData, logAccess, get, cas, read, table, _t: { reset: () => { TABLE = null; TABLE_AT = 0; }, textAddrs } };
