/* ============================================================================
   GrayCo — THE PUBLIC BID WATCHER.   netlify/functions/bid-watch.js  (patch LD, re-anchored as LD2)

   "I want to get leads when Shelby County puts new jobs out to bid, when
    Memphis city does, etc."

   A Netlify SCHEDULED function (netlify.toml: weekdays every 3 hours). For each
   public bid listing in docs/LEAD-INBOX.md that may be read without signing in
   (an RSS feed or a public web page), it:
     · asks robots.txt first and stays away from anything it disallows;
     · fetches ONE page per source, with its own user agent, one source at a
       time, a pause between them, and "has it changed?" headers (ETag /
       Last-Modified) so an unchanged page costs the agency almost nothing;
     · reads the solicitations off it (a small adapter per kind of page);
     · keeps the ones whose title matches the keywords (roof, renovation,
       drywall, …; editable in the CRM) and not the excluded words;
     · puts NEW ones in the lead inbox (gc_kv "gc_lead_inbox") with the bid
       number, the due date and the link to the documents. The same project
       arriving later by e-mail joins the same lead.
   LD2: each NEW one also becomes a draft bid job in the bid portal (never published by itself) and
   is in the admins' alert (bid-inbox.js afterStore → _lib/bid-portal.js, _lib/bid-alerts.js); every
   run also creates the drafts that waited for the portal to be set up.
   Every id seen is remembered ("gc_bid_watch_seen"), so nothing is added
   twice. A source that needs a login, or whose terms forbid automated reading,
   has NO adapter here: its e-mail alerts go to bids@ instead (docs/LEAD-INBOX.md).
   Nothing is ever made up: a page that cannot be read, or reads as empty, is
   reported in the CRM ("Shelby County: page changed — 0 bids read"), never filled in.

   BuildingConnected (optional): with BC_CLIENT_ID, BC_CLIENT_SECRET and
   BC_REFRESH_TOKEN set, the opportunities on GrayCo's Bid Board are read
   (read only, Autodesk Platform Services, 3-legged OAuth, scope data:read).
   Until then, BuildingConnected's invitation e-mails to bids@ cover it.
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const L = require('./bid-inbox.js')._lib;
const { env, s, low, arr, nowIso, sha256, sb, kvGet, kvCas, kvPut, upsert, itemId, isoDay, decodeEntities, htmlToText, DEFAULT_SETTINGS, KV, KV_SET } = L;

const UA = 'GrayCoBidWatch/1.0 (+https://crm.grayco-cs.com; bids@grayco-cs.com; GrayCo Construction Services, Bartlett TN)';
const KV_SEEN = 'gc_bid_watch_seen', KV_STATUS = 'gc_bid_watch_status';
const PAUSE_MS = 1500, TIMEOUT_MS = 20000, MAX_PAGE = 3 * 1024 * 1024;

/* ── the sources ──────────────────────────────────────────────────────────────
   auto:true  → read here (public page / feed, no login).
   auto:false → e-mail alerts to bids@ (login needed, or automated reading not allowed);
                listed so the CRM can show how to sign up.                         */
const SOURCES = [
  { id: 'shelby-county', name: 'Shelby County Government — bid postings', label: 'Shelby County', owner: 'Shelby County Government', city: 'Memphis', state: 'TN',
    auto: true, kind: 'links', url: 'https://bids.shelbycountytn.gov/', hrefRe: /\/node\/\d+/, listing: 'https://www.shelbycountytn.gov/3243/Bids-Listing' },
  { id: 'city-of-memphis', name: 'City of Memphis — RFPs & RFQs', label: 'City of Memphis', owner: 'City of Memphis', city: 'Memphis', state: 'TN',
    auto: true, kind: 'links', url: 'https://www.memphistn.gov/business/rfps-rfqs/' },
  { id: 'mscs', name: 'Memphis-Shelby County Schools — bids', label: 'MSCS', owner: 'Memphis-Shelby County Schools', city: 'Memphis', state: 'TN',
    auto: true, kind: 'links', url: 'https://www.scsk12.org/procurement/bids' },
  { id: 'mscaa', name: 'Memphis-Shelby County Airport Authority — RFPs/RFQs', label: 'Memphis Airport (MSCAA)', owner: 'Memphis-Shelby County Airport Authority', city: 'Memphis', state: 'TN',
    auto: true, kind: 'links', url: 'https://flymemphis.com/rfps-rfqs/' },
  { id: 'desoto-county', name: 'DeSoto County MS — bid postings', label: 'DeSoto County', owner: 'DeSoto County Board of Supervisors', city: 'Hernando', state: 'MS',
    auto: true, kind: 'rss', url: 'https://www.desotocountyms.gov/RSSFeed.aspx?ModID=76&CID=All-bids.xml', html: 'https://www.desotocountyms.gov/Bids.aspx' },
  { id: 'tn-stream', name: 'State of Tennessee — STREAM construction bid list', label: 'State of TN (STREAM)', owner: 'State of Tennessee (STREAM)', city: '', state: 'TN',
    auto: true, kind: 'links', url: 'https://www.tn.gov/generalservices/real-estate-/redirect-stream/contractors/construction-bid-list.html', anyRow: true },
  { id: 'tn-cpo', name: 'State of Tennessee — Central Procurement Office invitations to bid', label: 'State of TN (CPO)', owner: 'State of Tennessee (Central Procurement Office)', city: '', state: 'TN',
    auto: true, kind: 'links', url: 'https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/invitations-to-bid--itb-.html' },
  { id: 'arkansas-osp', name: 'State of Arkansas — current solicitations', label: 'State of AR', owner: 'State of Arkansas (Office of State Procurement)', city: '', state: 'AR',
    auto: true, kind: 'links', url: 'https://www.arkansas.gov/dfa/procurement/bids/index.php' },
  /* e-mail alerts only */
  { id: 'mlgw', name: 'MLGW — Bid Notification System / iSupplier', label: 'MLGW', auto: false, how: 'Register in MLGW\'s Bid Notification System (contracted services) and iSupplier Portal (materials); use bids@grayco-cs.com as the contact e-mail.' },
  { id: 'southaven', name: 'City of Southaven — Central Bidding', label: 'Southaven', auto: false, how: 'Free vendor account on Central Bidding (centralbidding.com), follow City of Southaven, notification e-mail bids@grayco-cs.com.' },
  { id: 'olive-branch', name: 'City of Olive Branch — bid notices', label: 'Olive Branch', auto: false, how: 'Follow the City of Olive Branch on Central Bidding (or its legal notices); notification e-mail bids@grayco-cs.com.' },
  { id: 'desoto-central', name: 'DeSoto County — Central Bidding documents', label: 'DeSoto County', auto: false, how: 'Follow DeSoto County on Central Bidding for bid packages; notification e-mail bids@grayco-cs.com.' },
  { id: 'arbuy', name: 'Arkansas — ARBuy / state eProcurement', label: 'State of AR', auto: false, how: 'Register (free) in ARBuy with your NIGP codes for roofing / building construction / repair; notification e-mail bids@grayco-cs.com.' },
  { id: 'ms-magic', name: 'Mississippi — MAGIC procurement', label: 'State of MS', auto: false, how: 'Register (free) as a MAGIC supplier with the construction / roofing product codes; notification e-mail bids@grayco-cs.com.' },
  { id: 'tn-edison', name: 'Tennessee — Edison supplier alerts', label: 'State of TN (CPO)', auto: false, how: 'Register in Edison and choose the UNSPSC codes for roofing / building repair; alerts go to bids@grayco-cs.com.' },
  { id: 'mscs-ionwave', name: 'MSCS — Ion Wave e-bid alerts', label: 'MSCS', auto: false, how: 'Register (free) at mscsprocurementservices.ionwave.net with the construction / roofing categories; e-mail bids@grayco-cs.com.' },
  { id: 'memphis-oracle', name: 'City of Memphis — supplier portal alerts', label: 'City of Memphis', auto: false, how: 'Register as a City of Memphis supplier (Become a Supplier) with the construction / roofing commodity codes; e-mail bids@grayco-cs.com.' },
  { id: 'shelby-notify', name: 'Shelby County — vendor registration', label: 'Shelby County', auto: false, how: 'Keep the county vendor registration (BRN + vendor number) current with the NIGP codes for roofing / building repair; e-mail bids@grayco-cs.com.' },
  { id: 'mscaa-opengov', name: 'MSCAA — OpenGov procurement portal', label: 'Memphis Airport (MSCAA)', auto: false, how: 'Follow the Memphis-Shelby County Airport Authority on OpenGov Procurement; notification e-mail bids@grayco-cs.com.' }
];

/* ── fetching, politely ─────────────────────────────────────────────────────── */
async function get(url, extra, fetchImpl){
  const f = fetchImpl || fetch;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await f(url, { headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.5' }, extra || {}), signal: ctl.signal, redirect: 'follow' });
    let text = '';
    if (r.status === 200) { text = await r.text(); if (text.length > MAX_PAGE) text = text.slice(0, MAX_PAGE); }
    const h = k => { try { return s(r.headers && r.headers.get && r.headers.get(k)); } catch (e) { return ''; } };
    return { status: r.status, text, etag: h('etag'), lastModified: h('last-modified') };
  } catch (e) { return { status: 0, text: '', why: e && e.name === 'AbortError' ? 'timed out' : 'unreachable' }; }
  finally { clearTimeout(timer); }
}
/* robots.txt: the group for our agent, else "*"; longest matching rule wins; Allow beats an equal Disallow */
function robotsAllows(txt, path){
  const lines = String(txt || '').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const groups = []; let g = null, lastWasAgent = false;
  lines.forEach(l => {
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(l); if (!m) return;
    const k = low(m[1]), v = m[2].trim();
    if (k === 'user-agent') { if (!g || !lastWasAgent) { g = { agents: [], rules: [] }; groups.push(g); } g.agents.push(low(v)); lastWasAgent = true; return; }
    lastWasAgent = false; if (!g) return;
    if (k === 'allow' || k === 'disallow') g.rules.push({ allow: k === 'allow', path: v });
  });
  const mine = groups.find(x => x.agents.some(a => /^graycobidwatch(\/|$)/.test(a))) || groups.find(x => x.agents.indexOf('*') >= 0);
  if (!mine) return true;
  let best = null;
  mine.rules.forEach(r => {
    if (!r.path) return;   /* "Disallow:" (empty) allows everything */
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  });
  return !best || best.allow;
}

/* ── adapters: page → [{ id, title, number, due, url, context, status }] ───── */
const DATE_RE = /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/ig;
const NUM_RE = /\b(RFP|RFQ|RFB|IFB|ITB|RFI|RFS|SOQ|NTB|SBC|SB-?I?|Bid|Solicitation|Contract|Project|Event)\s*(?:No\.?|Number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,30})/i;
const SOLICIT_RE = /\b(RFP|RFQ|RFB|IFB|ITB|RFI|RFS|SOQ|NTB|invitation (?:to|for) bid|request for (?:proposals?|qualifications?|quotes?|bids?)|notice to (?:bidders|contractors)|sealed bids?|solicitation|bid (?:no|number|#)|advertisement for bids?|bid opportunit)/i;
const NAV_RE = /^(home|contact|login|log in|sign in|register|faq|help|search|back|next|previous|more|menu|bid results|bid tabulations?|awards?|archive|closed bids|vendor registration|how to do business.*|doing business.*|become a (supplier|vendor)|supplier (portal|registration)|subscribe|notify me|rss)$/i;
const GENERIC = /^(click here|here|download|view|view (bid|details|document|more)|pdf|details|more info|read more|documents?|link|open)$/i;
const CLOSED_RE = /\b(closed|awarded|cancel+ed|rescinded|bid results?|tabulation|intent to award)\b/i;
function absUrl(href, base){ try { return new URL(decodeEntities(href), base).href; } catch (e) { return ''; } }
function firstDue(ctx){
  const t = s(ctx); if (!t) return '';
  const m = /(due|clos\w*|deadline|opening|open date|submi\w*|receiv\w*|response)[^0-9a-z]{0,30}/i.exec(t);
  const at = (txt, d) => { const iso = isoDay(d); const k = txt.indexOf(d) + d.length; const tm = L.hhmm(txt.slice(k, k + 20)); return iso ? (tm ? iso + 'T' + tm : iso) : ''; };
  if (m) { const rest = t.slice(m.index); const d = rest.match(DATE_RE); DATE_RE.lastIndex = 0; if (d) { const v = at(rest, d[0]); if (v) return v; } }
  /* a table row with no words by the dates (Pre-bid | Bid opening columns): the last date is the bid date */
  const all = t.match(DATE_RE) || []; DATE_RE.lastIndex = 0;
  if (all.length) { const last = all[all.length - 1]; const k = t.lastIndexOf(last); return at(t.slice(k), last); }
  return '';
}
function numberOf(t){ const m = NUM_RE.exec(t); if (!m || !/\d/.test(m[2])) return ''; return (m[1].toUpperCase() === 'BID' || m[1].toUpperCase() === 'PROJECT' || m[1].toUpperCase() === 'CONTRACT' || m[1].toUpperCase() === 'EVENT' ? '' : m[1].toUpperCase() + ' ') + m[2].replace(/[.\/-]+$/, ''); }
function blockAround(html, i, j){
  const lo = Math.max(0, i - 2500), before = html.slice(lo, i).toLowerCase();
  let start = lo, tag = '';
  ['<tr', '<li', '<p', '<h2', '<h3', '<h4', '<article', '<dt'].forEach(tg => { const k = before.lastIndexOf(tg); if (k >= 0 && lo + k > start) { start = lo + k; tag = tg.slice(1); } });
  if (!tag) start = Math.max(0, i - 300);
  const after = html.slice(j, j + 2500).toLowerCase();
  let end = tag ? after.indexOf('</' + tag) : -1; end = end < 0 ? Math.min(html.length, j + 300) : j + end;
  return html.slice(start, end);
}
function parseLinks(html, base, opt){
  opt = opt || {};
  const out = [], seen = {}, H = String(html || '');
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(H))) {
    const href = absUrl(m[1], base); if (!href || /^(mailto|tel|javascript):/i.test(m[1])) continue;
    const text = htmlToText(m[2]).replace(/\s+/g, ' ').trim();
    if (!text || NAV_RE.test(text)) continue;
    const ctx = htmlToText(blockAround(H, m.index, re.lastIndex)).replace(/\s+/g, ' ').trim().slice(0, 1200);
    /* the link itself names a solicitation, or it opens a document in a row that does */
    const isDoc = /\.(pdf|docx?)(\?|$)/i.test(href);
    const isSol = opt.hrefRe ? opt.hrefRe.test(href) : (SOLICIT_RE.test(text) || (isDoc && SOLICIT_RE.test(ctx)) || (opt.anyRow && isDoc && DATE_RE.test(ctx)));
    DATE_RE.lastIndex = 0;
    if (!isSol) continue;
    let title = GENERIC.test(text) || text.length < 6 ? ctx.replace(text, '').trim().slice(0, 180) : text.slice(0, 180);
    title = title.replace(/\.pdf$/i, '').replace(/\s*[-–|]\s*$/, '').trim();
    if (!title) continue;
    const number = numberOf(text) || numberOf(ctx);
    const id = number ? low(number).replace(/[^a-z0-9]+/g, '') : sha256(href.replace(/[#?].*$/, '')).slice(0, 16);
    if (seen[id]) continue; seen[id] = 1;
    out.push({ id, title, number, due: firstDue(ctx) || firstDue(text), url: href, context: ctx.slice(0, 600), status: CLOSED_RE.test(ctx.replace(/closing/ig, '')) ? 'closed' : '' });
  }
  return out;
}
function rssTag(x, tag){ const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(x); return m ? decodeEntities(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')).trim() : ''; }
function parseRss(xml){
  const out = []; const re = /<item\b[\s\S]*?<\/item>/gi; let m;
  while ((m = re.exec(String(xml || '')))) {
    const x = m[0], title = htmlToText(rssTag(x, 'title')), link = rssTag(x, 'link'), guid = rssTag(x, 'guid'), desc = htmlToText(rssTag(x, 'description'));
    if (!title) continue;
    const ctx = (title + ' ' + desc).replace(/\s+/g, ' ');
    const idm = /bidID=(\d+)/i.exec(link || guid);
    const number = numberOf(ctx);
    out.push({ id: idm ? 'bid' + idm[1] : (number ? low(number).replace(/[^a-z0-9]+/g, '') : sha256(guid || link || title).slice(0, 16)), title: title.slice(0, 180), number,
      due: firstDue(desc) || firstDue(ctx), url: link || guid, context: desc.slice(0, 600), status: /\bstatus\s*:?\s*(closed|awarded|cancel+ed)/i.test(desc) ? 'closed' : '' });
  }
  return out;
}
/* CivicPlus "Bid Postings" page (Bids.aspx): each bid is a link to bids.aspx?bidID=n with Bid No., Status, Closes */
function parseCivicBids(html, base){
  const H = String(html || ''), out = [], seen = {};
  const re = /<a\b[^>]*href\s*=\s*["']([^"']*bids\.aspx\?bidID=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi; let m; const hits = [];
  while ((m = re.exec(H))) hits.push({ href: m[1], id: m[2], text: htmlToText(m[3]).replace(/\s+/g, ' ').trim(), at: m.index, end: re.lastIndex });
  hits.forEach((h, i) => {
    if (seen[h.id] || !h.text || GENERIC.test(h.text)) return; seen[h.id] = 1;
    const next = hits.slice(i + 1).find(x => x.id !== h.id);
    const ctx = htmlToText(H.slice(h.end, next ? next.at : h.end + 2000)).replace(/\s+/g, ' ').trim().slice(0, 800);
    const num = (/bid\s*(?:no\.?|number|#)\s*:?\s*([A-Z0-9][A-Z0-9\-\/.]{2,30})/i.exec(ctx) || [])[1] || '';
    out.push({ id: 'bid' + h.id, title: h.text.slice(0, 180), number: num, due: firstDue(ctx), url: absUrl(h.href, base), context: ctx.slice(0, 600),
      status: /status\s*:?\s*(closed|awarded|cancel+ed)/i.test(ctx) ? 'closed' : '' });
  });
  return out;
}

/* ── the keyword filter ─────────────────────────────────────────────────────── */
function wordRe(w){ return w.indexOf(' ') >= 0 || /[^a-z0-9]/.test(w) ? new RegExp(w.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i') : new RegExp('\\b' + w, 'i'); }
function matchWords(text, settings){
  const st = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const hits = arr(st.keywords).filter(w => w && wordRe(low(w)).test(text));
  const bad = arr(st.exclude).filter(w => w && wordRe(low(w)).test(text));
  return { ok: hits.length > 0 && !bad.length, hits, bad };
}
function expired(due){ if (!due) return false; const d = Date.parse(s(due).slice(0, 10) + 'T23:59:59'); return isFinite(d) && d < Date.now() - 86400000; }

/* a listing → a lead-inbox record (only what the page says) */
function toRecord(src, it, hits){
  let host = ''; try { host = new URL(it.url).hostname; } catch (e) {}
  return {
    id: itemId('watch|' + src.id + '|' + it.id), title: it.title, source: src.label, sourceKind: 'public_bid', sourceRef: src.name, type: 'government',
    owner: src.owner || '', gc: '', address: '', city: src.city || '', state: src.state || '', zip: '', bidDue: it.due || '', preBid: '', trades: [], scope: it.context ? it.context.slice(0, 300) : '',
    bidNumber: it.number || '', contact: { name: '', email: '', phone: '' }, estValue: null,
    plansLinks: it.url ? [{ url: it.url, label: 'Solicitation & documents (' + src.label + ')', board: 'Government', host }] : [],
    files: [], emails: [], emailIds: [], watchKeys: ['w:' + src.id + ':' + it.id], notes: ['Found on ' + src.name + '. Matched: ' + hits.join(', ') + '.'],
    matchWords: hits, origin: 'watch', addendum: 0
  };
}

/* ── BuildingConnected (optional; read only) ────────────────────────────────── */
function bcReady(){ return !!(env('BC_CLIENT_ID') && env('BC_CLIENT_SECRET') && env('BC_REFRESH_TOKEN')); }
function bcKey(){ return crypto.createHash('sha256').update('gc-bc:' + env('BC_CLIENT_SECRET')).digest(); }
function seal(txt){ const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', bcKey(), iv); const enc = Buffer.concat([c.update(txt, 'utf8'), c.final()]); return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.'); }
function unseal(v){ try { const [iv, tag, enc] = s(v).split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', bcKey(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); } catch (e) { return ''; } }
async function adminKv(key, value){
  try {
    if (value === undefined) { const r = await sb('gc_admin_kv?select=value&key=eq.' + encodeURIComponent(key)); if (!r.ok) return null; const rows = await r.json(); return rows && rows[0] ? rows[0].value : null; }
    const r = await sb('gc_admin_kv?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_at: nowIso() }) });
    return r.ok;
  } catch (e) { return null; }
}
async function bcToken(fetchImpl){
  const f = fetchImpl || fetch;
  const saved = await adminKv('srv_bc_oauth');
  const refresh = (saved && saved.sealed && unseal(saved.sealed)) || env('BC_REFRESH_TOKEN');
  const basic = Buffer.from(env('BC_CLIENT_ID') + ':' + env('BC_CLIENT_SECRET')).toString('base64');
  const r = await f('https://developer.api.autodesk.com/authentication/v2/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + basic, Accept: 'application/json' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refresh) + '&scope=data%3Aread' });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) return { ok: false, why: 'Autodesk sign-in refused (' + r.status + ') — make a new BC_REFRESH_TOKEN (docs/LEAD-INBOX.md)' };
  /* Autodesk hands out a new refresh token each time: keep it, sealed with the client secret */
  if (j.refresh_token) await adminKv('srv_bc_oauth', { sealed: seal(j.refresh_token), at: nowIso() });
  return { ok: true, token: j.access_token };
}
function bcRecord(o){
  const loc = o.location || o.address || {}, client = o.client || {}, comp = client.company || {}, lead = client.lead || client.contact || {};
  const due = s(o.dueAt || o.bidDueAt || o.bidsDueAt || o.dueDate);
  const id = s(o.id);
  return {
    id: itemId('bc|' + id), title: s(o.name || o.projectName || o.title) || 'BuildingConnected opportunity', source: 'BuildingConnected', sourceKind: 'invitation', sourceRef: 'BuildingConnected API',
    type: /insurance|claim/i.test(s(o.name) + ' ' + s(o.description)) ? 'insurance' : 'commercial',
    owner: s(o.ownerName), gc: s(comp.name || client.companyName), address: s(loc.streetName || loc.street || loc.address1 || loc.complete), city: s(loc.city), state: s(loc.state || loc.stateCode).slice(0, 2).toUpperCase(), zip: s(loc.zip || loc.zipCode || loc.postalCode),
    bidDue: due ? (due.length > 10 ? new Date(due).toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).slice(0, 16).replace(' ', 'T') : due) : '',
    preBid: '', trades: [s(o.tradeName || o.trade)].filter(Boolean), scope: s(o.description).slice(0, 600), bidNumber: s(o.number || o.projectNumber),
    contact: { name: s(lead.name || [lead.firstName, lead.lastName].filter(Boolean).join(' ')), email: low(lead.email), phone: s(lead.phoneNumber || lead.phone) }, estValue: o.projectSize != null && isFinite(o.projectSize) ? +o.projectSize : null,
    plansLinks: id ? [{ url: 'https://app.buildingconnected.com/opportunities/' + encodeURIComponent(id) + '/info', label: 'Open on BuildingConnected', board: 'BuildingConnected', host: 'app.buildingconnected.com' }] : [],
    files: [], emails: [], emailIds: [], watchKeys: ['bc:' + id], notes: ['From the BuildingConnected Bid Board (API).'], origin: 'api', addendum: 0, bcId: id
  };
}
async function bcRun(state, fetchImpl){
  const f = fetchImpl || fetch;
  const tok = await bcToken(f); if (!tok.ok) return { ok: false, why: tok.why, records: [] };
  const since = s(state && state.since) || new Date(Date.now() - 30 * 86400000).toISOString();
  let url = 'https://developer.api.autodesk.com/construction/buildingconnected/v2/opportunities?limit=100&filter%5BupdatedAt%5D=' + encodeURIComponent(since + '..');
  const records = []; let pages = 0;
  while (url && pages++ < 10) {
    const r = await f(url, { headers: { Authorization: 'Bearer ' + tok.token, Accept: 'application/json', 'User-Agent': UA } });
    if (!r.ok) return { ok: false, why: 'BuildingConnected answered ' + r.status + (r.status === 403 ? ' (needs a Bid Board Pro subscription and API access for the account)' : ''), records };
    const j = await r.json().catch(() => null);
    arr(j && (j.results || j.data)).forEach(o => { if (!o || o.isArchived || /declined|lost|won/i.test(s(o.outcome && (o.outcome.state || o.outcome)))) return; records.push(bcRecord(o)); });
    url = s(j && j.pagination && j.pagination.nextUrl);
    if (url && !/^https:/.test(url)) url = 'https://developer.api.autodesk.com' + url;
  }
  return { ok: true, records, since: nowIso() };
}

/* ── one run ───────────────────────────────────────────────────────────────── */
async function runAll(opts){
  opts = opts || {};
  const t0 = Date.now(), budget = opts.budgetMs || 8 * 60000, f = opts.fetchImpl;
  const settings = Object.assign({}, DEFAULT_SETTINGS, (await kvGet(KV_SET)) || {});
  const seen = (await kvGet(KV_SEEN)) || {}, status = (await kvGet(KV_STATUS)) || {};
  status.sources = status.sources || {};
  const robots = {}, records = [], summary = [];
  const list = SOURCES.filter(x => x.auto && (!opts.only || x.id === opts.only));
  for (const src0 of list) {
    if (Date.now() - t0 > budget) { summary.push({ id: src0.id, skipped: 'out of time this run' }); continue; }
    const cfg = (settings.sources || {})[src0.id] || {};
    const prev = status.sources[src0.id] || {};
    if (cfg.on === false) { status.sources[src0.id] = Object.assign({}, prev, { off: true }); continue; }
    const src = Object.assign({}, src0, cfg.url ? { url: cfg.url } : {});
    const st = { at: nowIso(), url: src.url, http: 0, parsed: 0, matched: 0, added: 0, why: '' };
    try {
      const u = new URL(src.url);
      if (robots[u.host] === undefined) { const rb = await get(u.origin + '/robots.txt', {}, f); robots[u.host] = rb.status === 200 ? rb.text : ''; }
      if (!robotsAllows(robots[u.host], u.pathname + u.search)) { st.why = 'robots.txt asks robots not to read this page — use its e-mail alerts'; status.sources[src.id] = st; summary.push({ id: src.id, why: st.why }); continue; }
      const cond = {}; if (prev.etag && prev.url === src.url) cond['If-None-Match'] = prev.etag; if (prev.lastModified && prev.url === src.url) cond['If-Modified-Since'] = prev.lastModified;
      let page = await get(src.url, cond, f);
      let items = [];
      st.http = page.status;
      if (page.status === 304) { st.why = 'no change since the last look'; st.parsed = prev.parsed || 0; st.etag = prev.etag; st.lastModified = prev.lastModified; }
      else if (page.status === 200) {
        items = src.kind === 'rss' ? parseRss(page.text) : parseLinks(page.text, src.url, { hrefRe: src.hrefRe, anyRow: src.anyRow });
        if (!items.length && src.kind === 'rss' && src.html) {   /* feed empty or switched off: the listing page */
          await new Promise(r => setTimeout(r, opts.pauseMs != null ? opts.pauseMs : PAUSE_MS));
          const p2 = await get(src.html, {}, f); if (p2.status === 200) items = parseCivicBids(p2.text, src.html);
        }
        st.etag = page.etag; st.lastModified = page.lastModified;
        st.parsed = items.length;
        if (!items.length) st.why = 'the page was read but no solicitations were found on it — it may have changed (check the link)';
      } else st.why = page.why || ('the site answered ' + page.status);
      const mine = seen[src.id] = seen[src.id] || {};
      items.forEach(it => {
        const isNew = !mine[it.id];
        mine[it.id] = mine[it.id] || nowIso().slice(0, 10);
        if (!isNew || it.status === 'closed' || expired(it.due)) return;
        const mw = matchWords(it.title + ' ' + (it.context || ''), settings);
        if (!mw.ok) return;
        st.matched++;
        records.push(toRecord(src, it, mw.hits));
      });
    } catch (e) { st.why = 'could not read: ' + s(e && e.message); }
    status.sources[src.id] = st; summary.push({ id: src.id, http: st.http, parsed: st.parsed, matched: st.matched, why: st.why });
    await new Promise(r => setTimeout(r, opts.pauseMs != null ? opts.pauseMs : PAUSE_MS));
  }
  /* BuildingConnected's Bid Board, when the owner has given the API keys */
  if (bcReady() && (!opts.only || opts.only === 'buildingconnected')) {
    const bs = status.sources.buildingconnected || {};
    const out = await bcRun(bs, f).catch(e => ({ ok: false, why: s(e && e.message), records: [] }));
    const fresh = out.records.filter(r => { const k = r.bcId + '|' + r.bidDue; const m = seen.buildingconnected = seen.buildingconnected || {}; const n = !m[k]; m[k] = m[k] || nowIso().slice(0, 10); return n; });
    records.push.apply(records, fresh);
    status.sources.buildingconnected = { at: nowIso(), http: out.ok ? 200 : 0, parsed: out.records.length, matched: fresh.length, why: out.ok ? '' : out.why, since: out.ok ? out.since : bs.since };
    summary.push({ id: 'buildingconnected', parsed: out.records.length, why: out.ok ? '' : out.why });
  }
  /* into the lead inbox, all at once */
  let added = 0, after = null;
  if (records.length) {
    const results = []; let stored = [];
    await kvCas(KV, v => { let items = arr(v); results.length = 0; records.forEach(r => { const o = upsert(items, r); items = o.items; results.push(o); }); stored = items; return items; });
    after = await L.afterStore(results, stored);
    added = results.filter(x => x.action === 'added').length;
    records.forEach((r, i) => { const res = results[i]; const sid = (r.watchKeys[0] || '').split(':')[1] || (r.bcId ? 'buildingconnected' : ''); if (res && res.action === 'added' && status.sources[sid]) status.sources[sid].added = (status.sources[sid].added || 0) + 1; });
  }
  /* forget ids not seen for 400 days */
  const cutoff = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  Object.keys(seen).forEach(k => { Object.keys(seen[k] || {}).forEach(id => { if (seen[k][id] < cutoff) delete seen[k][id]; }); });
  status.lastRun = { at: nowIso(), by: opts.by || 'schedule', ms: Date.now() - t0, found: records.length, added };
  await kvPut(KV_SEEN, seen); await kvPut(KV_STATUS, status);
  const portalQueue = opts.noFlush ? null : await L.flushPortal();
  return { ok: true, found: records.length, added, sources: summary, portal: after && after.portal, alerts: after && after.alerts, portalQueue };
}

exports.handler = async function(){
  if (!L.dbReady()) return { statusCode: 500, body: JSON.stringify({ error: 'Supabase is not configured on Netlify.' }) };
  try { const out = await runAll({}); console.log('[bid-watch] ' + JSON.stringify({ found: out.found, added: out.added })); return { statusCode: 200, body: JSON.stringify(out) }; }
  catch (e) { console.error('[bid-watch] ' + (e && e.message)); return { statusCode: 500, body: JSON.stringify({ error: s(e && e.message) }) }; }
};
exports.runAll = runAll;
exports.SOURCES = SOURCES;
exports._test = { parseLinks, parseRss, parseCivicBids, robotsAllows, matchWords, toRecord, firstDue, numberOf, bcRecord, bcRun, seal, unseal, expired, UA };
