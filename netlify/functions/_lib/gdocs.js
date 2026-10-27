/* netlify/functions/_lib/gdocs.js — patch GDOCS: the team's Google Docs → the CRM (owner 10/23: "when i make documents in
   google docs i want them to be read and entered into my crm … proposals and quotes → matched or entered as a bidding job,
   invoices → the job's documents and a matching CRM invoice … proposals before the job is signed in the customer's portal";
   "read … everyone pm super apm estimator any docs in their google docs").

   READ ONLY. This file never changes, shares or deletes anything in Google Drive. Two ways in, both supported:
     1. Google Workspace domain-wide delegation (the same service account as 🌐 All GrayCo e-mail, docs/EMAIL-ALL.md) with
        ONE more scope, https://www.googleapis.com/auth/drive.readonly. The CRM reads every active staff member's Drive
        (gc_staff) — nobody has to click anything.
     2. A person's own "Connect my Google Drive" (gcal-oauth: server-only gcal_token_<name>, drive.readonly) — used for anyone the
        service account cannot read.
   What is kept: only BUSINESS papers (proposal / quote / estimate, invoice, change order, contract, scope of work). For
   anything else (a personal doc, a letter, notes) only "<file id> ignored" is recorded — never its name or its words.
   A doc shared with several people is read once (by Drive file id). A doc edited later comes in again as a new version.
   The server only READS and CLASSIFIES; the CRM page (an admin / office computer) matches each paper to its job with the
   CRM's own data and records it (tail GDOCS in index.html), so the CRM's sync, duplicate rules and history rules apply.
   State (server-only table gc_lead_inbox_kv, never synced to a browser):
     gc_gdocs_settings  { people: { <email>: { off: true } }, folders: [id…], since, autoBid, autoInv, portal, notify, by, at }
     gc_gdocs_state     { people: { <email>: { lastRead, ok, err, via, seen, kept } }, lastRun, lastOk, running }
     gc_gdoc_inbox      { items: [ … ], ignored: { <fileId>: <modifiedTime> } } */
'use strict';
const crypto = require('crypto');
const G = require('./gmail');
const IDX = require('./mailidx');

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const SET_KEY = 'gc_gdocs_settings', STATE_KEY = 'gc_gdocs_state', INBOX_KEY = 'gc_gdoc_inbox';
const MAX_ITEMS = 600, MAX_IGNORED = 6000, TEXT_CAP = 20000;
const OFFICE_PHONE = '9015850944';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function nowIso(){ return new Date().toISOString(); }
function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function sbUrl(){ return s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function sbKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function svcH(extra){ const k = sbKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k }, extra || {}); }

/* ── settings ──────────────────────────────────────────────────────────────── */
function settings(v){
  v = v && typeof v === 'object' ? v : {};
  return { people: v.people && typeof v.people === 'object' ? v.people : {}, folders: arr(v.folders).map(s).filter(Boolean),
    since: s(v.since), autoBid: v.autoBid !== false, autoInv: v.autoInv !== false, portal: v.portal !== false, notify: v.notify === true,
    off: v.off === true, by: s(v.by), at: s(v.at) };
}

/* ── who: every active staff member (gc_staff), else the CRM people list ─────── */
async function people(){
  const dom = low(process.env.GMAIL_DOMAIN || 'grayco-cs.com'), out = [], seen = {};
  function add(email, name, role){ email = low(email); if (!email || seen[email] || !email.endsWith('@' + dom) || /@in\./.test(email)) return; seen[email] = 1; out.push({ email, name: s(name), role: low(role) }); }
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=email,name,role,active', { headers: svcH() });
    if (r.ok) arr(await r.json()).forEach(x => { if (x && x.active !== false) add(x.email, x.name, x.role); });
  } catch (e) {}
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.users', { headers: svcH() });
    if (r.ok) {
      let v = ((await r.json()) || [])[0]; v = v && v.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v;
      arr(v).forEach(u => { if (!u || u.active === false) return; const hit = out.find(p => p.email === low(u.email)); if (hit) { if (!hit.name) hit.name = s(u.name); hit.crmRole = s(u.role || u.title); } else add(u.email, u.name, u.role); });
    }
  } catch (e) {}
  return out;
}

/* ── Google access: the service account (as that person), else their own connection ── */
const TOK = {};
function saJwt(acc, sub, scope){
  const iat = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: acc.email, scope: scope || SCOPE, aud: G.TOKEN_URL, sub: low(sub), iat, exp: iat + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(acc.key);
  return head + '.' + body + '.' + b64u(sig);
}
async function saToken(email){
  const acc = G.account(); if (!acc.ok) return { ok: false, why: 'not_configured' };
  const c = TOK['sa:' + email]; if (c && c.exp - 120000 > Date.now()) return { ok: true, t: c.t, via: 'workspace' };
  const r = await fetch(G.TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(saJwt(acc, email)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { ok: false, why: 'denied', detail: s(j.error_description || j.error || r.status) };
  TOK['sa:' + email] = { t: j.access_token, exp: Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000 };
  return { ok: true, t: j.access_token, via: 'workspace' };
}
/* gcal-oauth stores { access_token, refresh_token, expiry }; the older reader looked for access / refresh (never matched) */
const GTOK = require('./gtok');
async function ownToken(person){
  const keys = [person.name, person.email].filter(Boolean).map(k => 'gcal_token_' + k);
  for (const key of keys) {
    let tok = await GTOK.get(key.slice(GTOK.PFX.length));   /* patch GTOK: server-only table (an old gc_kv copy is moved there) */
    if (!tok || typeof tok !== 'object') continue;
    const access = s(tok.access_token || tok.access), refresh = s(tok.refresh_token || tok.refresh), exp = Number(tok.expiry) || 0;
    if (access && exp - 60000 > Date.now()) return { ok: true, t: access, via: 'own' };
    if (!refresh || !process.env.GOOGLE_CLIENT_ID) continue;
    const r = await fetch(G.TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: s(process.env.GOOGLE_CLIENT_ID), client_secret: s(process.env.GOOGLE_CLIENT_SECRET), refresh_token: refresh, grant_type: 'refresh_token' }).toString() });
    const j = await r.json().catch(() => ({}));
    if (j.access_token) return { ok: true, t: j.access_token, via: 'own' };
  }
  return { ok: false, why: 'not_connected' };
}
async function tokenFor(person){
  const a = await saToken(person.email);
  if (a.ok) return a;
  const b = await ownToken(person);
  if (b.ok) return b;
  return { ok: false, why: a.why === 'not_configured' ? 'not_connected' : a.why, detail: a.detail || '' };
}
async function gget(t, url, asText){
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 300 * Math.pow(2, i))); continue; }
    if (!r.ok) { const e = new Error('Google Drive answered ' + r.status); e.status = r.status; throw e; }
    return asText === 'buf' ? Buffer.from(await r.arrayBuffer()) : (asText ? r.text() : r.json());
  }
  const e = new Error('Google Drive is busy'); e.status = 429; throw e;
}
/* Google Docs this person OWNS, changed after `after` (only theirs: a doc shared with them is read from its owner) */
async function listDocs(t, after, folders){
  let q = "mimeType='application/vnd.google-apps.document' and trashed=false and 'me' in owners";
  if (after) q += " and modifiedTime > '" + after.replace(/'/g, '') + "'";
  if (folders && folders.length) q += ' and (' + folders.map(f => "'" + f.replace(/'/g, '') + "' in parents").join(' or ') + ')';
  const out = []; let page = '';
  for (let i = 0; i < 5; i++) {
    const url = DRIVE + '/files?q=' + encodeURIComponent(q) + '&orderBy=modifiedTime&pageSize=100&fields=' + encodeURIComponent('nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,owners(emailAddress,displayName))') + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const j = await gget(t, url);
    arr(j.files).forEach(f => out.push(f));
    page = s(j.nextPageToken); if (!page) break;
  }
  return out;
}
function exportText(t, id){ return gget(t, DRIVE + '/files/' + encodeURIComponent(id) + '/export?mimeType=text/plain', true); }
function exportPdf(t, id){ return gget(t, DRIVE + '/files/' + encodeURIComponent(id) + '/export?mimeType=application/pdf', 'buf'); }
async function storePdf(buf){
  const hash = sha256(buf), path = hash + '.pdf', ref = 'sb:crm-files/' + path;
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: svcH({ 'Content-Type': 'application/pdf', 'x-upsert': 'false', 'cache-control': '3600' }), body: buf });
    if (r.ok || r.status === 409) return ref;
    const tx = await r.text().catch(() => '');
    if (r.status === 400 && /exist|duplicate/i.test(tx)) return ref;
  } catch (e) {}
  return '';
}

/* ── reading a paper ───────────────────────────────────────────────────────── */
const GRAYCO = /gray\s*co\b|grayco|grayco-cs\.com|85034|585[\s.-]?0944|4007 broadway|4014 broadway/i;
function money(v){ const n = parseFloat(s(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function ymdOf(v){
  const t = s(v); let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/.exec(t); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  const d = Date.parse(t.replace(/(\d)(st|nd|rd|th)\b/g, '$1')); if (isFinite(d) && /[a-z]{3}/i.test(t) && /\d{4}/.test(t)) return new Date(d).toISOString().slice(0, 10);
  return '';
}
function labelled(lines, re){
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]); if (!m) continue;
    const rest = s(lines[i].slice(m.index + m[0].length)).replace(/^[\s:#\-–—]+/, '');
    if (rest) return rest;
    for (let k = i + 1; k < Math.min(lines.length, i + 3); k++) if (s(lines[k])) return s(lines[k]);
  }
  return '';
}
function phoneDigits(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
/* the paper's kind, from its title and its first lines (the heading), never from a word deep in the text */
function classify(name, text){
  const head = s(text).split(/\r?\n/).map(s).filter(Boolean).slice(0, 25).join('\n'), title = s(name), all = title + '\n' + head;
  const letterhead = GRAYCO.test(s(text).slice(0, 4000)) || GRAYCO.test(title);
  const dollars = (s(text).match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || []).length;
  let kind = 'other', conf = 0;
  if (/\binvoice\b/i.test(all) && !/\bproposal\b/i.test(title)) { kind = 'invoice'; conf = 0.55 + (/(invoice\s*(#|no\.?|number))|amount due|balance due|total due|due date/i.test(text) ? 0.25 : 0); }
  else if (/change\s*order/i.test(all)) { kind = 'co'; conf = 0.7; }
  else if (/\b(proposal|quote|quotation|estimate|bid)\b/i.test(all)) { kind = 'proposal'; conf = 0.55 + (/\b(total|grand total|contract (price|amount|sum)|investment|price)\b/i.test(text) ? 0.2 : 0); }
  else if (/\b(contract|agreement)\b/i.test(all) && /sign/i.test(text)) { kind = 'contract'; conf = 0.65; }
  else if (/scope of work/i.test(all)) { kind = 'scope'; conf = 0.6; }
  if (kind !== 'other') {
    if (letterhead) conf += 0.15; else conf -= 0.2;
    if (!dollars && (kind === 'invoice' || kind === 'proposal')) conf -= 0.3;
  }
  conf = Math.max(0, Math.min(1, Math.round(conf * 100) / 100));
  if (kind !== 'other' && conf < 0.35) kind = 'other';   /* a personal paper that only uses the word */
  return { kind, conf, letterhead, dollars };
}
function parse(name, text){
  const lines = s(text).split(/\r?\n/).map(x => x.replace(/ /g, ' ').trim());
  const f = {};
  const cust = labelled(lines, /\b(prepared for|proposal for|quote for|estimate for|bill to|billed to|sold to|customer( name)?|client( name)?|owner|attn|attention)\b\s*[:\-]?/i);
  f.customer = s(cust.split(/\s{2,}|\t|,\s*\d/)[0]).replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').slice(0, 80);
  if (GRAYCO.test(f.customer)) f.customer = '';
  const emails = (s(text).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map(low).filter(e => !/grayco-cs\.com$/.test(e));
  f.email = emails[0] || '';
  const phones = (s(text).match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || []).map(phoneDigits).filter(d => d.length === 10 && d !== OFFICE_PHONE);
  f.phone = phones[0] || '';
  const addr = labelled(lines, /\b(job (site|address|location)|project (address|location)|property( address)?|site address|service address|location|address)\b\s*[:\-]?/i);
  const street = /\b\d{2,6}\s+[A-Za-z0-9.' ]{2,40}\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|blvd|cv|cove|ct|court|pkwy|parkway|hwy|highway|way|pl|place|cir|circle|trl|trail|loop|pike)\b\.?[^\n]{0,60}/i;
  let a = street.exec(addr) || null;
  if (!a) { for (const ln of lines) { if (/4007 broadway|4014 broadway/i.test(ln)) continue; const m = street.exec(ln); if (m) { a = m; break; } } }
  f.address = a ? s(a[0]).replace(/\s+/g, ' ').slice(0, 140) : '';
  const totalLine = labelled(lines, /\b(grand total|total (amount )?due|amount due|balance due|total contract( price| amount)?|contract (price|amount|sum)|total investment|total price|proposal total|estimate total|total)\b\s*[:\-]?/i);
  const tm = /\$?\s?(\d[\d,]*(?:\.\d{2})?)/.exec(totalLine);
  let total = tm ? money(tm[1]) : 0;
  if (!total) { const all = (s(text).match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || []).map(money); if (all.length) total = Math.max.apply(null, all); }
  f.total = total;
  f.number = s(labelled(lines, /\b(invoice|proposal|quote|estimate)\s*(#|no\.?|number)\s*[:\-]?/i).split(/\s/)[0]).replace(/^#/, '').slice(0, 30);
  f.jobNo = s(labelled(lines, /\b(job|project|po|p\.o\.)\s*(#|no\.?|number)\s*[:\-]?/i).split(/\s/)[0]).replace(/^#/, '').slice(0, 30);
  f.date = ymdOf(labelled(lines, /\b(invoice date|proposal date|quote date|estimate date|date)\b\s*[:\-]?/i));
  f.dueDate = ymdOf(labelled(lines, /\b(due date|payment due|due)\b\s*[:\-]?/i));
  f.paid = /\b(paid in full|status\s*:\s*paid)\b/i.test(text) || /balance due\s*[:\-]?\s*\$?\s*0(\.00)?\b/i.test(text);
  const items = [];
  lines.forEach(ln => {
    if (items.length >= 60 || !ln || /\b(total|subtotal|tax|balance|amount due|deposit|paid)\b/i.test(ln)) return;
    const m = /^(.{3,140}?)\s*[\t ]+\$?\s?(\d[\d,]*\.\d{2})\s*$/.exec(ln);
    if (m && /[a-z]/i.test(m[1])) items.push({ desc: s(m[1]).replace(/[\t ]+/g, ' '), amt: money(m[2]) });
  });
  f.lines = items;
  f.title = s(name).slice(0, 140);
  return f;
}
function readPaper(name, text){
  const c = classify(name, text), f = c.kind === 'other' ? null : parse(name, text);
  return { kind: c.kind, conf: c.conf, letterhead: c.letterhead, f };
}

/* ── the run ───────────────────────────────────────────────────────────────── */
async function getSettings(){ return settings(await IDX.get(SET_KEY)); }
function itemId(fileId, modified){ return 'gd_' + fileId + '_' + sha256(s(modified)).slice(0, 8); }
/* one person's Drive since their last read; returns what is new */
async function readPerson(person, set, st, deadline, opts){
  const tok = await tokenFor(person);
  if (!tok.ok) return { ok: false, err: tok.why, detail: tok.detail };
  const since = opts.backfill ? '' : (s(st.lastRead) || set.since || nowIso());   /* a backfill looks at every doc again */
  const files = await listDocs(tok.t, since, set.folders);
  return { ok: true, via: tok.via, files, token: tok.t };
}
async function run(opts){
  opts = opts || {};
  const deadline = Date.now() + (opts.budgetMs || 22000);
  const set = await getSettings();
  if (set.off && !opts.force) return { ok: true, off: true };
  if (!set.since) { set.since = nowIso(); await IDX.cas(SET_KEY, v => Object.assign({}, v || {}, { since: set.since })); }
  const team = await people();
  const stAll = (await IDX.get(STATE_KEY)) || {}; stAll.people = stAll.people || {};
  const inbox0 = (await IDX.get(INBOX_KEY)) || {};
  const have = {}; arr(inbox0.items).forEach(x => { have[x.id] = 1; });
  const ignored = Object.assign({}, inbox0.ignored || {});
  const fresh = [], seenFile = {}, report = [];
  for (const person of team) {
    if (Date.now() > deadline) { report.push({ email: person.email, skipped: 'time' }); continue; }
    if (set.people[person.email] && set.people[person.email].off) { report.push({ email: person.email, off: true }); continue; }
    if (opts.only && opts.only !== person.email) continue;
    const st = Object.assign({}, stAll.people[person.email] || {});
    let got;
    try { got = await readPerson(person, set, st, deadline, opts); } catch (e) { got = { ok: false, err: 'error', detail: s(e.message) }; }
    if (!got.ok) { st.ok = false; st.err = got.err; st.detail = got.detail || ''; st.at = nowIso(); stAll.people[person.email] = st; report.push({ email: person.email, err: got.err }); continue; }
    let kept = 0, newest = s(st.lastRead), done = true;
    for (const fl of got.files) {
      if (Date.now() > deadline) { done = false; break; }
      const mod = s(fl.modifiedTime); if (mod > newest) newest = mod;
      const ownerEmail = low((arr(fl.owners)[0] || {}).emailAddress);
      if (ownerEmail && ownerEmail !== person.email && team.some(p => p.email === ownerEmail)) continue;   /* a teammate's doc shared with this person: read (and credited) from its owner */
      if (seenFile[fl.id]) continue; seenFile[fl.id] = 1;
      const id = itemId(fl.id, mod);
      if (have[id] || ignored[fl.id] === mod || (!opts.backfill && ignored[fl.id] === 'old:' + mod)) continue;
      if (!opts.backfill && set.since && s(fl.createdTime) && s(fl.createdTime) < set.since) { ignored[fl.id] = 'old:' + mod; continue; }   /* made before the connect date: only with a backfill */
      let text = '';
      try { text = await exportText(got.token, fl.id); } catch (e) { continue; }
      const rd = readPaper(fl.name, text);
      if (rd.kind === 'other') { ignored[fl.id] = mod; continue; }   /* nothing about it is kept */
      let ref = '';
      try { ref = await storePdf(await exportPdf(got.token, fl.id)); } catch (e) {}
      const owner = arr(fl.owners)[0] || {};
      fresh.push({ id, fileId: fl.id, rev: mod, name: s(fl.name).slice(0, 160), url: s(fl.webViewLink) || ('https://docs.google.com/document/d/' + fl.id + '/edit'),
        owner: low(owner.emailAddress) || person.email, ownerName: s(person.name || owner.displayName), ownerRole: s(person.crmRole || person.role),
        created: s(fl.createdTime), modified: mod, kind: rd.kind, conf: rd.conf, letterhead: rd.letterhead, f: rd.f, ref,
        text: text.slice(0, TEXT_CAP), state: 'new', at: nowIso(), via: got.via, backfill: !!opts.backfill });
      kept++;
    }
    if (done && newest) st.lastRead = newest;
    st.ok = true; st.err = ''; st.detail = ''; st.via = got.via; st.at = nowIso(); st.seen = (st.seen || 0) + got.files.length; st.kept = (st.kept || 0) + kept;
    stAll.people[person.email] = st;
    report.push({ email: person.email, files: got.files.length, kept, via: got.via });
  }
  if (fresh.length || Object.keys(ignored).length !== Object.keys(inbox0.ignored || {}).length) {
    await IDX.cas(INBOX_KEY, v => {
      v = v && typeof v === 'object' ? v : {}; const items = arr(v.items), ids = {}; items.forEach(x => { ids[x.id] = 1; });
      fresh.forEach(x => { if (!ids[x.id]) items.push(x); });
      const ig = Object.assign({}, v.ignored || {}, ignored), keys = Object.keys(ig);
      if (keys.length > MAX_IGNORED) keys.slice(0, keys.length - MAX_IGNORED).forEach(k => { delete ig[k]; });
      return { items: trim(items), ignored: ig };
    });
  }
  stAll.lastRun = nowIso(); stAll.lastOk = report.some(r => r.files != null) ? nowIso() : s(stAll.lastOk);
  await IDX.cas(STATE_KEY, () => stAll);
  return { ok: true, added: fresh.length, people: report };
}
/* keep every paper still waiting; of the finished ones, the newest */
function trim(items){
  const open = items.filter(x => x.state === 'new' || x.state === 'review'), rest = items.filter(x => !(x.state === 'new' || x.state === 'review'));
  rest.sort((a, b) => s(a.at) < s(b.at) ? 1 : -1);
  return open.concat(rest.slice(0, Math.max(0, MAX_ITEMS - open.length))).map(x => (x.state === 'new' || x.state === 'review') ? x : Object.assign({}, x, { text: '' }));
}
async function inbox(){ const v = (await IDX.get(INBOX_KEY)) || {}; return arr(v.items); }
/* the CRM page reports what it did with a paper */
async function mark(id, patch){
  const allowed = ['state', 'result', 'by', 'doneAt', 'reason', 'undoneAt', 'undoneBy'];
  const r = await IDX.cas(INBOX_KEY, v => {
    v = v && typeof v === 'object' ? v : {}; const items = arr(v.items); const x = items.find(i => i.id === id); if (!x) return undefined;
    allowed.forEach(k => { if (patch[k] !== undefined) x[k] = patch[k]; });
    return { items: trim(items), ignored: v.ignored || {} };
  });
  return { ok: !!(r && r.ok) };
}
async function saveSettings(patch, who){
  const r = await IDX.cas(SET_KEY, v => {
    const cur = settings(v), next = Object.assign({}, v || {});
    ['autoBid', 'autoInv', 'portal', 'notify', 'off'].forEach(k => { if (typeof patch[k] === 'boolean') next[k] = patch[k]; });
    if (Array.isArray(patch.folders)) next.folders = patch.folders.map(s).filter(Boolean).slice(0, 20);
    if (patch.person && patch.person.email) { const p = Object.assign({}, cur.people); p[low(patch.person.email)] = { off: patch.person.off === true }; next.people = p; }
    next.since = cur.since || nowIso(); next.by = s(who); next.at = nowIso();
    return next;
  });
  return { ok: !!(r && r.ok), settings: settings(r && r.value) };
}
async function status(){
  const set = await getSettings(), st = (await IDX.get(STATE_KEY)) || {}, team = await people(), items = await inbox();
  const tokens = await GTOK.status().catch(() => null);   /* patch GTOK: the admin sees if google-tokens.sql still has to run */
  return { ok: true, tokens: tokens, workspace: G.account().ok, scope: SCOPE, clientId: s(process.env.GOOGLE_CLIENT_ID),   /* the OAuth client id is public (it is in every Google sign-in link) */
    settings: set, state: st,
    people: team.map(p => Object.assign({ email: p.email, name: p.name, role: p.crmRole || p.role, off: !!(set.people[p.email] && set.people[p.email].off) }, (st.people || {})[p.email] || {})),
    counts: { waiting: items.filter(x => x.state === 'new').length, review: items.filter(x => x.state === 'review').length, done: items.filter(x => x.state === 'applied').length } };
}

/* patch ESTIN: a new Google Doc (the GrayCo estimate template) in this person's Drive. drive.file lets the CRM touch only
   the files it makes itself. The Workspace account (domain-wide delegation, + the drive.file scope), else their own
   Connect Google (gcal-oauth asks for drive.file now). Google Docs → CRM (above) reads it back like any other Doc. */
const SCOPE_FILE = 'https://www.googleapis.com/auth/drive.file';
async function createDoc(person, title, html){
  let t = '';
  const acc = G.account();
  if (acc.ok) {
    try { const r = await fetch(G.TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(saJwt(acc, person.email, SCOPE_FILE)) });
      const j = await r.json().catch(() => ({})); if (r.ok && j.access_token) t = j.access_token; } catch (e) {}
  }
  if (!t) { const o = await ownToken(person); if (o.ok) t = o.t; }
  if (!t) return { ok: false, needsSetup: true, error: 'Google is not connected for ' + (person.email || 'you') + ' with permission to make Docs.' };
  const b = 'gcestin' + Date.now().toString(36);
  const meta = JSON.stringify({ name: s(title).slice(0, 180) || 'GrayCo Estimate', mimeType: 'application/vnd.google-apps.document' });
  const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n' + String(html || '').slice(0, 400000) + '\r\n--' + b + '--';
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + b }, body: body });
  if (r.status === 401 || r.status === 403) return { ok: false, needsSetup: true, error: 'Google did not let the CRM make a Doc (' + r.status + ') — the drive.file permission is missing.' };
  if (!r.ok) return { ok: false, error: 'Google Drive answered ' + r.status };
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.id, id: s(j.id), url: s(j.webViewLink) || ('https://docs.google.com/document/d/' + s(j.id) + '/edit') };
}
module.exports = { SCOPE, SET_KEY, STATE_KEY, INBOX_KEY, settings, people, classify, parse, readPaper, run, inbox, mark, saveSettings, status, tokenFor, itemId, trim,
  createDoc, SCOPE_FILE,   /* patch ESTIN */
  _t: { reset: () => { Object.keys(TOK).forEach(k => delete TOK[k]); } } };
