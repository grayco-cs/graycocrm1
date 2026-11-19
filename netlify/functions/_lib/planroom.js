/* ============================================================================
   GrayCo — 📐 PLAN ROOM DETAILS.   netlify/functions/_lib/planroom.js   (patch PLANROOM)

   Owner (11/19): "All the info from plan rooms: if they can open up the page in the CRM and read scope of works, pre-bids,
   any required insurances, meetings etc, and make sure it's in the CRM too. I'm on MR Plan Room as a public bid for them
   for Jackson State."

   read(url) opens a plan room's PUBLIC project page and the public documents it links (the invitation / advertisement /
   notice to bidders — the "Reference" files), and returns what a bidder needs:
     project name, owner, designer, location, bid #, bid due (date + time), delivery method, pre-bid / site walk (date,
     time, place, mandatory?), questions / RFI deadline, scope of work + the trades in it, insurance, bonds, licensing,
     prevailing wage, certified payroll, MBE / DBE / Section 3, addenda, the contact, the plan room's document list
     (names + links), and the words each came from (sourceSnippets).

   What it never does: sign in, use anyone's account, get past a sign-in page or a captcha, or download a file a page
   keeps for registered users. A page that needs a sign-in answers { login: true, why, todo } — forward the invitation
   e-mail to bids@ / leads@, or paste the bid documents (PDF) on the lead (readPasted).

   Which reader:
     • the plain reader (rules, no AI) always runs;
     • the AI reader (the CRM's own server-side key, _lib/ai.js) adds to it ONLY when the site allows it: a site whose
       robots.txt says "Content-Signal: ai-input=no" (Memphis Reprographics / mrplanroom.com, RKA, Barge — the ReproConnect
       plan rooms) is read with the plain reader only, and the answer says so (aiNote). Something staff paste or forward
       themselves is theirs to have read.
   Plan rooms:
     ReproConnect sites (mrplanroom.com, rkaplanroom.build, bidding.bargedesign.com, any …/projects/<n>/details/<slug>):
       public — the details page, the Plans / Specs / Addenda lists (names, sizes) and the public Reference files.
     BuildingConnected, PlanHub, iSqFt / ConstructConnect, Procore, SmartBid, PipelineSuite: sign-in only — never fetched.
     Any other https page: read once; a sign-in page / captcha / 401 / 403 stops it.

   Interface (no database here — bid-inbox.js stores it):
     classify(url)                       → { ok, kind: 'repro'|'login'|'generic', url, host, board, why }
     read(url, deps)                     → planRoom (see shape below)
     readPasted({ text, file }, deps)    → planRoom from pasted words / a PDF (AI allowed)
     applyToItem(item, pr)               → [what changed] (the Lead Inbox item: preBid, bidDue, questionsDue — blanks only)
     applyToJob(job, pr, by)             → { changed, walk } (the bid job: siteWalk, questionsDue, ourDue, requirements — blanks only)
     checklist(fields, old)              → [{ id, kind, label, done }]
     cleanEdit(fields)                   → the fields a person typed, cleaned
     autoUrl(item)                       → the plan-room link the automatic read may open, or ''
   planRoom = { v, fetchedAt, url, host, board, kind, reader: 'plain'|'ai', aiNote, login, why, todo, fields, docs, sourceLinks,
                sourceSnippets: { field: { text, from } }, checklist, warnings }
   ========================================================================== */
'use strict';
const BD = require('./bid-due.js');
const PDF = require('./pdftext.js');

const UA = 'GrayCoBidWatch/1.0 (+https://crm.grayco-cs.com; leads@grayco-cs.com; GrayCo Construction Services, Bartlett TN)';
const LIM = { page: 3 * 1024 * 1024, doc: 8 * 1024 * 1024, docs: 3, text: 60000, timeout: 12000 };
const REPRO_HOST = /(^|\.)(mrplanroom\.com|memphisreprographics\.com|rkaplanroom\.build|bargedesign\.com|reproconnect\.com)$/i;
const REPRO_PATH = /^\/projects\/(\d+)\/(details|plans|specs|addenda|plan-holders|bidding)\/?([^\/?#]*)/i;
const LOGIN_BOARDS = [
  [/(^|\.)buildingconnected\.com$/i, 'BuildingConnected'], [/(^|\.)planhub\.com$/i, 'PlanHub'],
  [/(^|\.)(isqft|constructconnect|bidclerk|cmdgroup)\.com$/i, 'ConstructConnect / iSqFt'], [/(^|\.)procore\.com$/i, 'Procore'],
  [/(^|\.)smartbidnet\.com$/i, 'SmartBid'], [/(^|\.)pipelinesuite\.com$/i, 'PipelineSuite'], [/(^|\.)dodge(data|construction)?\.com$/i, 'Dodge']
];
const BOARD_NAMES = [[/mrplanroom|memphisreprographics/i, 'MR plan room (Memphis Reprographics)'], [/rkaplanroom/i, 'RKA plan room'], [/bargedesign/i, 'Barge Design plan room']];

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function pad(n){ return ('0' + n).slice(-2); }
function decode(t){ return String(t || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;|&rsquo;/g, '\u2019').replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)); }
function textOf(h){ return decode(String(h || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td|th|section)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim(); }
function one(t){ return s(t).replace(/\s+/g, ' '); }
function clip(t, n){ t = one(t); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }
function uniq(list){ const seen = {}; return list.filter(x => { const k = low(x).replace(/[^a-z0-9]+/g, ''); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }
function absUrl(href, base){ try { return new URL(decode(href), base).href; } catch (e) { return ''; } }
function hostOf(u){ try { return low(new URL(u).hostname); } catch (e) { return ''; } }

/* ── which kind of plan room ─────────────────────────────────────────────── */
function boardName(host){ for (const b of BOARD_NAMES) if (b[0].test(host)) return b[1]; return host.replace(/^www\./, ''); }
function classify(url){
  url = s(url);
  if (!/^https?:\/\/[^\s"'<>]{4,1000}$/i.test(url)) return { ok: false, kind: 'bad', why: 'That web address does not look right (it must start with https://).' };
  let u; try { u = new URL(url); } catch (e) { return { ok: false, kind: 'bad', why: 'That web address does not look right.' }; }
  const host = low(u.hostname);
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)|\.local$|\.internal$/.test(host) || /^\[/.test(host)) return { ok: false, kind: 'bad', why: 'Only public plan-room pages can be read.' };
  for (const b of LOGIN_BOARDS) if (b[0].test(host)) return { ok: false, kind: 'login', url, host, board: b[1], login: true,
    why: b[1] + ' project pages open only for a signed-in account; the CRM never signs in for you.',
    todo: 'Forward ' + b[1] + '\u2019s invitation e-mail to bids@grayco-cs.com (it is read with its attachments), or open the project in ' + b[1] + ', download the bid documents (invitation / instructions PDF) and drop them on the lead — 📐 Plan room details → “Read a pasted PDF / text”.' };
  const m = REPRO_PATH.exec(u.pathname);
  if (m && (REPRO_HOST.test(host) || m[3])) {
    const slug = m[3] || '';
    return { ok: true, kind: 'repro', host, board: boardName(host), id: m[1], slug, url: u.origin + '/projects/' + m[1] + '/details/' + slug, origin: u.origin };
  }
  if (u.protocol !== 'https:') return { ok: false, kind: 'bad', why: 'Only https:// pages are read.' };
  return { ok: true, kind: 'generic', host, board: boardName(host), url: u.href, origin: u.origin };
}

/* ── robots.txt: the rules for us (or *), and the site's Content-Signal for AI input ── */
function robots(txt){
  const lines = String(txt || '').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const groups = []; let g = null, lastAgent = false;
  lines.forEach(l => {
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(l); if (!m) return;
    const k = low(m[1]), v = m[2].trim();
    if (k === 'user-agent') { if (!g || !lastAgent) { g = { agents: [], rules: [], signal: '' }; groups.push(g); } g.agents.push(low(v)); lastAgent = true; return; }
    lastAgent = false; if (!g) return;
    if (k === 'allow' || k === 'disallow') g.rules.push({ allow: k === 'allow', path: v });
    if (k === 'content-signal') g.signal += ' ' + low(v);
  });
  const mine = groups.find(x => x.agents.some(a => /^graycobidwatch(\/|$)/.test(a))) || groups.find(x => x.agents.indexOf('*') >= 0);
  const sig = mine ? mine.signal : '';
  return {
    aiInput: /ai-input\s*=\s*no/.test(sig) ? 'no' : /ai-input\s*=\s*yes/.test(sig) ? 'yes' : '',
    allows(path){
      if (!mine) return true; let best = null;
      mine.rules.forEach(r => { if (!r.path) return;
        const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
        if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r; });
      return !best || best.allow;
    }
  };
}

/* ── fetching, politely: our user agent, a time limit, a size limit, one request at a time with a pause ── */
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function get(url, deps, opt){
  opt = opt || {};
  const f = deps.fetch || fetch, ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), opt.timeout || LIM.timeout);
  if (deps._last && deps.pauseMs !== 0) { const wait = (deps.pauseMs || 700) - (Date.now() - deps._last); if (wait > 0) await sleep(wait); }
  deps._last = Date.now(); deps._n = (deps._n || 0) + 1;
  try {
    const r = await f(url, { headers: { 'User-Agent': UA, Accept: opt.accept || 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: ctl.signal });
    const h = k => { try { return s(r.headers && r.headers.get && r.headers.get(k)); } catch (e) { return ''; } };
    const type = low(h('content-type')).split(';')[0], len = +(h('content-length') || 0), max = opt.max || LIM.page;
    const out = { status: r.status, ok: !!r.ok, type, finalUrl: s(r.url) || url };
    if (!r.ok) return out;
    if (len && len > max) return Object.assign(out, { tooBig: true, size: len });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) return Object.assign(out, { tooBig: true, size: buf.length });
    out.buf = buf; out.size = buf.length;
    if (!opt.binary) out.text = buf.toString('utf8');
    return out;
  } catch (e) { return { status: 0, ok: false, why: e && e.name === 'AbortError' ? 'timed out' : 'unreachable' }; }
  finally { clearTimeout(tm); }
}
const LOGIN_PATH = /\/(log-?in|sign-?in|signon|auth\/|sso|account\/login|users\/sign_in|session)/i;
const CAPTCHA = /captcha|cf-challenge|challenge-platform|cf_chl_|are you a (human|robot)|verify you are human|access denied|attention required/i;
function wallOf(res, kind){
  if (res.status === 401 || res.status === 403) return 'The page answered ' + res.status + ' — it needs a sign-in or does not allow automated reading.';
  if (res.status === 429) return 'The plan room asked us to slow down (429). Try again later.';
  if (!res.ok) return res.why ? 'The page could not be reached (' + res.why + ').' : 'The page answered ' + res.status + '.';
  if (res.tooBig) return 'The page is too large to read.';
  const t = String(res.text || '');
  if (CAPTCHA.test(t.slice(0, 20000)) && !/project-name/.test(t)) return 'The page shows a “are you human?” check. The CRM does not get past those.';
  let path = ''; try { path = new URL(res.finalUrl).pathname; } catch (e) {}
  if (kind !== 'repro' && LOGIN_PATH.test(path)) return 'The page sent us to a sign-in page — it is not public.';
  if (/<input[^>]+type=["']?password/i.test(t) && textOf(t).length < 2500) return 'The page is a sign-in form — it is not public.';
  if (kind === 'repro' && !/project-name|project-description|project-details/.test(t)) return 'The plan room did not show a public project page there (it may be a private project).';
  return '';
}

/* ── ReproConnect pages (MR plan room, RKA, Barge) ─────────────────────────── */
function cls(html, name){
  const re = new RegExp('<(div|h1|h3|p|span)[^>]*class=["\'][^"\']*\\b' + name + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/\\1>', 'i');
  const m = re.exec(html); return m ? textOf(m[2]) : '';
}
function itemBlock(html, name){
  const i = html.search(new RegExp('class=["\'][^"\']*\\bitem\\s+' + name + '\\b', 'i')); if (i < 0) return '';
  const rest = html.slice(i), j = rest.slice(20).search(/class=["'][^"']*\bitem\s+[a-z-]+\b|class=["'][^"']*\bnotes\b/i);
  return j < 0 ? rest.slice(0, 4000) : rest.slice(0, j + 20);
}
function parseRepro(html, base){
  const H = String(html || ''), out = { title: '', description: '', status: '', table: {}, company: '', contact: '', phone: '', email: '', location: '', refs: [], notes: '', tabs: {} };
  out.title = one(cls(H, 'project-name')) || one(textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(H) || [])[1]));
  out.description = cls(H, 'project-description');
  const st = itemBlock(H, 'status');
  out.status = one(textOf((/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(st) || [])[1]));
  st.replace(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi, (m, k, v) => { out.table[low(one(textOf(k)))] = one(textOf(v)); return m; });
  const cc = itemBlock(H, 'company-contacts');
  out.company = one(cls(cc, 'company')); out.contact = one(cls(cc, 'contact')); out.phone = one(cls(cc, 'phone'));
  out.email = uniq((cc.match(/mailto:([^"'?\s>]+)/gi) || []).map(x => x.replace(/^mailto:/i, ''))).join(' · ');
  const lc = itemBlock(H, 'location'); out.location = one(textOf((/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i.exec(lc.replace(/<svg[\s\S]*?<\/svg>/gi, '')) || [])[1]));
  const dc = itemBlock(H, 'documents');
  dc.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, name) => { const u = absUrl(href, base); if (u) out.refs.push({ name: one(textOf(name)) || 'Document', url: u, section: 'Reference' }); return m; });
  const ni = H.search(/class=["'][^"']*\bnotes\b/i);
  if (ni >= 0) { const nh = H.slice(ni); const e = nh.search(/<footer\b|class=["'][^"']*\bmodal\b|x-data=/i); out.notes = textOf(e > 0 ? nh.slice(0, e) : nh.slice(0, 40000)).replace(/^[^>]*>/, '').trim(); }
  H.replace(/<a\b[^>]*href=["']([^"']*\/projects\/\d+\/(plans|specs|addenda|plan-holders)\/[^"']*)["']/gi, (m, href, tab) => { out.tabs[low(tab)] = absUrl(href, base); return m; });
  return out;
}
/* a Plans / Specs / Addenda tab → the files listed (names and sizes; the files themselves are for registered users) */
function parseFiles(html, tabUrl, section){
  const out = [], H = String(html || '');
  H.replace(/<tr[^>]*class=["'][^"']*\bfile-(\d+)\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi, (m, id, row) => {
    const cells = []; row.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (m2, c) => { cells.push(one(textOf(c))); return m2; });
    const name = cells.filter(Boolean)[0] || ''; if (!name) return m;
    const size = cells.filter(c => /\d\s*(KB|MB|GB|bytes)$/i.test(c))[0] || '';
    const sec = (() => { const i = H.indexOf('file-' + id); const before = H.slice(Math.max(0, i - 6000), i); const all = before.match(/sectionHeader[^>]*>\s*([^<]+)/gi); return all ? one(all[all.length - 1].replace(/^[^>]*>/, '')) : ''; })();
    out.push({ name: name.slice(0, 160), size, section: section + (sec && low(sec) !== low(section) ? ' — ' + sec : ''), url: tabUrl + (tabUrl.indexOf('?') < 0 ? '?wv=' : '&wv=') + id, id });
    return m;
  });
  return out;
}

/* ── the plain reader: words → fields ─────────────────────────────────────── */
const DAY_RE = BD._t.dateIn, TIME_RE = BD._t.timeIn;
function dt(t, ref){ const d = DAY_RE(t, ref), tm = TIME_RE(t); return { date: d ? d.date : '', time: tm ? tm.time : '', tz: tm ? tm.tz : '', at: d ? d.at : -1 }; }
function central(d){ return d.date ? BD.toCentral(d.date, d.time, d.tz) : ''; }
/* "11/30/26 10:30am" (the plan room's status table) */
function tableDt(v){
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([ap])m)?/i.exec(s(v)); if (!m) return { date: '', time: '' };
  const y = m[3].length === 2 ? '20' + m[3] : m[3], date = y + '-' + pad(m[1]) + '-' + pad(m[2]);
  let time = ''; if (m[4]) { let h = +m[4] % 12; if (/p/i.test(m[6])) h += 12; time = pad(h) + ':' + m[5]; }
  return { date, time };
}
const HEAD_RE = /^(?:[A-Z][A-Z0-9 '&\/().,-]{2,60}:|(?:bid|pre-?bid|project|scope of work|owner|designer|architect|engineer|contact|plan rooms?|invitation|location|description|bids received at|questions|insurance|bonds?|addend\w*)[^\n:]{0,40}:)\s*$/i;
/* the lines under a heading like "PRE-BID CONFERENCE AT:" until the next heading */
function block(text, headRe, maxLines){
  const lines = s(text).split('\n'); let out = null;
  for (let i = 0; i < lines.length; i++) {
    const hm = headRe.exec(lines[i]); if (!hm) continue;
    const after = s(lines[i].slice(hm.index + hm[0].length)); const got = after ? [after] : [];
    for (let k = i + 1; k < lines.length && got.length < (maxLines || 12); k++) { if (HEAD_RE.test(s(lines[k])) && got.length) break; if (s(lines[k])) got.push(s(lines[k])); }
    out = { lines: got, text: got.join('\n'), head: one(lines[i]) }; break;
  }
  return out;
}
/* sentences, with a PDF's wrapped lines joined back (a line break ends a sentence only after . : ; ! ? or before a heading / a blank line) */
const ABBR_END = /(?:\b[ap]\.m|\bNo|\bSt|\bInc|\bCo|\bMr|\bMs|\bDr|\bU\.S|\be\.g|\bi\.e|\bAve|\bRd|\bSte|\bF\.E|\b[A-Z])\.$/;
function sentences(text){
  const lines = s(text).split('\n'), out = []; let cur = '';
  lines.forEach(l => { l = one(l);
    if (!l) { if (cur) out.push(cur); cur = ''; return; }
    if (cur && (/[.:;!?]$/.test(cur) && !ABBR_END.test(cur) || HEAD_RE.test(l) || /^(\(?[a-z0-9]{1,3}\)|[•\-–*]\s)/i.test(l))) { out.push(cur); cur = ''; }
    cur = cur ? cur + ' ' + l : l; });
  if (cur) out.push(cur);
  const res = [];
  out.forEach(p => p.split(/(?<!\b(?:[ap]\.m|No|St|Inc|Co|Mr|Ms|Dr|U\.S|e\.g|i\.e|Ave|Rd|Ste|F\.E|[A-Z])\.)(?<=[.;!?])\s+(?=[A-Z(])/).forEach(x => { x = one(x); if (x.length > 3) res.push(x); }));
  return res;
}
function findSent(text, re, max){ return uniq(sentences(text).filter(x => re.test(x)).map(x => clip(x, 320))).slice(0, max || 6); }

const TRADES = [
  ['Demolition', /\bdemoli/i], ['Abatement', /\b(abatement|asbestos|lead[- ]based paint|hazardous materials?)\b/i], ['Concrete', /\bconcrete\b/i], ['Masonry', /\b(masonry|brick|cmu|block veneer)\b/i],
  ['Metal panels', /\bmetal panel/i], ['Steel / framing', /\b(structural steel|steel framing|metal framing|framing)\b/i], ['Roofing', /\b(roof|roofing|tpo|epdm|membrane|re-?roof)\b/i],
  ['Storefront / glazing', /\b(storefront|glazing|curtain ?wall|windows?)\b/i], ['Doors & hardware', /\bdoors?\b.*\bhardware\b|\bhardware\b/i], ['Drywall / partitions', /\b(drywall|gypsum|partitions?)\b/i],
  ['Ceilings', /\bceilings?\b/i], ['Flooring', /\bflooring|carpet|resilient|tile\b/i], ['Millwork / casework', /\b(millwork|casework|cabinet)/i], ['Painting / finishes', /\b(paint|painting|finishes)\b/i],
  ['HVAC / mechanical', /\b(mechanical|hvac)\b/i], ['Plumbing', /\bplumbing\b/i], ['Electrical / lighting', /\b(electrical|lighting|light fixtures?)\b/i], ['Fire protection', /\bfire (protection|sprinkler|alarm)/i],
  ['Elevator', /\belevator/i], ['Sitework / utilities', /\b(site ?work|utilit(y|ies)|paving|grading|drainage|water main|taxilane|apron)\b/i]
];
function tradesIn(t){ return TRADES.filter(x => x[1].test(t)).map(x => x[0]); }

function fieldsFromText(parts, page, ref){
  /* parts: [{ from, text }]; page: parseRepro() or null */
  const all = parts.map(p => p.text).join('\n\n'), F = {}, SN = {};
  const snip = (k, text, from) => { if (text) SN[k] = { text: clip(text, 360), from: from || 'page' }; };
  const fromOf = re => { const p = parts.find(x => re.test(x.text)); return p ? p.from : 'page'; };
  const pg = page || { table: {} };
  /* the project */
  F.projectName = s(pg.title) || one((block(all, /^PROJECT:/im, 2) || { lines: [] }).lines[0]);
  const num = /\b(SBC\s*(?:Number|No\.?|#)\s*[\d\/-]{6,})|\bSolicitation\s*#?\s*:?\s*([A-Z0-9][A-Z0-9 -]{3,28}[0-9])|\b(?:Bid|Project|Contract|RFP|ITB|IFB|RFQ)\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9][A-Z0-9\/.-]{2,30})/i.exec(all);
  if (num) { F.bidNumber = one(num[1] || ('Solicitation # ' + s(num[2])) || '').replace(/^Solicitation # $/, '') || one(num[3]); if (num[3] && !num[1] && !num[2]) F.bidNumber = one(num[0]); snip('bidNumber', num[0], fromOf(/SBC|Solicitation|No\.|Number|#/)); }
  /* owner: "The State of Tennessee is inviting…", "received by the City Of X, … hereinafter referred to as the OWNER", "Owner: …" */
  let ow = /(?:^|\n)\s*OWNER\s*:\s*([^\n]{3,120})/i.exec(all), owTxt = ow ? ow[0] : '';
  let owner = ow ? one(ow[1]) : '';
  if (!owner) { const m = /\b(?:The\s+)?([A-Z][\w.&'’-]+(?:\s+(?:of\s+|the\s+|and\s+|for\s+|&\s+)*[A-Z][\w.&'’-]+){0,7})\s+(?:is inviting|invites|will receive|is accepting|is soliciting|requests)\b/.exec(all); if (m) { owner = one(m[1]).replace(/^The\s+/i, ''); owTxt = m[0]; } }
  if (!owner) { const m = /received by (?:the )?([^,\n]{3,80})(?:,[^,\n]{2,30})?,?\s+hereinafter referred to as the\s+OWNER/i.exec(all); if (m) { owner = one(m[1]); owTxt = m[0]; } }
  const recv = block(all, /^BIDS? (?:WILL BE )?RECEIVED (?:AT|BY)\s*:?/im, 8);
  const recvAt = recv && recv.lines.length && !/^(until|on|at)\b/i.test(recv.lines[0]) ? one(recv.lines[0]) : '';
  if (owner && recvAt && low(recvAt).indexOf(low(owner)) < 0 && /college|university|school|authority|county|city|hospital|district/i.test(recvAt)) owner = owner + ' — ' + recvAt;
  if (!owner && /offices of the ([A-Z][^,\n]{3,60})/.test(all)) { const m = /offices of the ([A-Z][^,\n]{3,60})/.exec(all); owner = one(m[1]); owTxt = m[0]; }
  F.owner = owner; snip('owner', owTxt + (recvAt && owner.indexOf(recvAt) > 0 ? ' … BIDS RECEIVED AT: ' + recvAt : ''), fromOf(/inviting|OWNER|offices of|received by/i));
  const des = block(all, /(?:^|\s)(?:DESIGNER|ARCHITECT|ENGINEER(?: OF RECORD)?)\s*:/m, 6);
  F.designer = des && des.lines.length ? one(des.lines[0]) : '';
  if (des) snip('designer', des.head.replace(/^.*?((?:DESIGNER|ARCHITECT|ENGINEER)\b)/, '$1') + ' ' + des.lines.slice(0, 3).join(', '), fromOf(/DESIGNER|ARCHITECT|ENGINEER/));
  const proj = block(all, /^PROJECT:/im, 6);
  F.location = s(pg.location) || (recv && recv.lines.length >= 3 ? recv.lines.slice(1, 3).join(', ') : '') || (proj ? one(proj.lines.filter(l => /,\s*[A-Z]{2}\b|county/i.test(l))[0]) : '');
  if (pg.location) snip('location', 'Location: ' + pg.location, 'page'); else if (proj) snip('location', proj.text, fromOf(/^PROJECT:/m));
  /* bid due: the plan room's own "Bid Date" first, else the words */
  const tb = tableDt(pg.table['bid date'] || '');
  const fd = BD.findDue(all, { ref: ref });
  if (tb.date) { F.bidDue = tb.date + (tb.time ? 'T' + tb.time : ''); F.bidDueText = 'Bid Date ' + pg.table['bid date']; snip('bidDue', 'Bid Date: ' + pg.table['bid date'], 'page'); }
  else if (fd.due) { F.bidDue = fd.due; snip('bidDue', all.slice(Math.max(0, fd.at - 20), fd.at + 160), fromOf(new RegExp(fd.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))); }
  if (F.bidDue && !/T\d/.test(F.bidDue)) { const tbd = /\buntil\s+TBD\b|\btime\s*:?\s*TBD\b/i.exec(all); F.bidDueText = (F.bidDueText || F.bidDue) + (tbd ? ' — time TBD' : ' — time not given'); }
  /* delivery: how bids go in */
  const del = [];
  const meth = /\b(design[- ]bid[- ]build|design[- ]build|construction manager at risk|cm\s*(?:at|@)\s*risk|cmar|cm\/gc|job order contract(?:ing)?|idiq|best value|lump[- ]sum|stipulated sum|unit[- ]price)\b/i.exec(all);
  if (meth) del.push(meth[1].replace(/\b\w/g, c => c.toUpperCase()));
  if (/\bsealed\s+(bids?|proposals?)\b|\bbids? received at\b|\bpublicly opened\b|\bbid opening\b/i.test(all)) del.push('Sealed bid' + (/publicly opened|opened and read aloud|bid opening to follow/i.test(all) ? ', opened publicly' : ''));
  if (/\b(submit(ted)?|deliver(ed)?|receiv(ed)?|accept(ed)?)\b[^.]{0,80}\b(online|electronic(ally)?|e-?bid)\b|\bsubmit bid tab\b|\b(online|electronic(ally)?)\b[^.]{0,40}\b(submi\w*|bids? (will|may) be)/i.test(all)) del.push('online submission accepted');
  if (/General Contract(or)? bids/i.test(all)) del.push('to General Contractors (prime)');
  if (recvAt || (recv && recv.lines.length)) del.push('delivered to ' + (recv.lines.filter(l => !/^(until|on|at)\b/i.test(l)).slice(0, 3).join(', ')));
  F.delivery = uniq(del).join('; ');
  if (F.delivery) snip('delivery', recv ? recv.head + ' ' + recv.lines.join(' / ') : (findSent(all, /sealed|online|submit/i, 1)[0] || ''), fromOf(/RECEIVED|sealed|submit/i));
  /* pre-bid / site walk */
  const pb = { date: '', time: '', place: '', mandatory: null, text: '' };
  const pt = tableDt(pg.table['prebid date'] || pg.table['pre-bid date'] || '');
  const placeFrom = x0 => { const pm = /\b(?:at|in)\s+((?:the\s+)?[A-Za-z0-9][^.;]{4,160}?)(?:\.(?:\s|$)|;|$)/.exec(x0.replace(/^.*?\b(?:will be held|is scheduled|scheduled)\b/i, ' ').replace(/\b(?:on\s+)?(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*(?:\d{4})?,?/gi, ' ').replace(/\bat\s+\d{1,2}(:\d{2})?\s*[ap]\.?m\.?\s*(c[sd]t|central|local time)?,?/i, '')); return pm ? one(pm[1]).replace(/^(\d{1,2}:\d{2}.*?,\s*)/, '').replace(/^the\s+(?=[A-Z])/, '').replace(/\s*,\s*$/, '').slice(0, 240) : ''; };
  const pbBlock = block(all, /^(?:PRE-?BID (?:CONFERENCE|MEETING)(?: AT)?|PRE-?BID INFORMATION|SITE (?:WALK|VISIT)(?: AT)?|JOB WALK|WALK-?THROUGH)\s*:/im, 8);
  let pbSent = findSent(all, /\b(pre-?\s*bid|pre-?\s*proposal|site (walk|visit)|job walk|walk-?\s*through)\b/i, 4).filter(x => DAY_RE(x) || TIME_RE(x) || /mandatory/i.test(x));
  pbSent = pbSent.filter(x => !/^(?:accepting bids|bidding closed|pending)?\s*pre-?bid date\s*:/i.test(x)).sort((a, b) => (/\b(held|conference|meeting|will be)\b/i.test(b) ? 1 : 0) - (/\b(held|conference|meeting|will be)\b/i.test(a) ? 1 : 0));
  if (pbBlock) {
    const di = pbBlock.lines.findIndex(l => DAY_RE(l)); if (di >= 0) pbBlock.lines = pbBlock.lines.slice(0, di + 1); pbBlock.text = pbBlock.lines.join('\n');
    const d = dt(pbBlock.text, ref); pb.date = d.date; pb.time = d.time;
    pb.place = pbBlock.lines.filter(l => !/^(at\s+\d|on\s+[A-Z]|\d{1,2}:\d{2})/i.test(l) && !DAY_RE(l) && !TIME_RE(l)).join(', ').replace(/,\s*Bui?ding\b/, ' Building').slice(0, 240);
    pb.text = pbBlock.head + ' ' + pbBlock.lines.join(' / ');
    if (!pb.place) pb.place = placeFrom(pbBlock.lines.join(' '));
  } else if (pbSent.length) {
    const x = pbSent[0], d = dt(x, ref); pb.date = d.date; pb.time = d.time; pb.text = x;
    pb.place = placeFrom(x);
  }
  if (pt.date) { pb.date = pt.date; pb.time = pt.time || pb.time; if (!pb.text) pb.text = 'Prebid Date: ' + pg.table['prebid date']; }
  const pbAll = [pb.text].concat(pbSent).concat(findSent(all, /\b(pre-?\s*bid|site (walk|visit)|walk-?\s*through)\b[^.]{0,120}\b(mandatory|requirement|required|encouraged|optional)\b|\b(mandatory|requirement|required|encouraged|optional)\b[^.]{0,120}\b(pre-?\s*bid|site (walk|visit)|walk-?\s*through)\b/i, 3)).join(' ');
  if (/\bnon-?\s*mandatory\b|\bnot mandatory\b|\bnot a (bidding )?requirement\b|\boptional\b|\bneither the pre-?bid[^.]{0,80}is a bidding requirement/i.test(pbAll)) pb.mandatory = false;
  else if (/\bmandatory\b|\battendance (is )?required\b|\bmust attend\b/i.test(pbAll)) pb.mandatory = true;
  if (pb.date || pb.text) { F.preBid = pb; snip('preBid', pb.text, fromOf(/pre-?bid|site (walk|visit)/i)); }
  const sv = findSent(all, /\bsite visits?\b[^.]{0,80}\b(scheduled|available|by appointment|contact)/i, 1)[0];
  if (sv) { F.siteVisit = clip(sv, 300); snip('siteVisit', sv); }
  /* questions / RFI deadline */
  const qs = findSent(all, /\b(questions?|inquir(y|ies)|requests? for (information|interpretation)|rfis?|clarifications?)\b[^.]{0,200}\b(due|deadline|no later than|not later than|received (by|no later than|until)|submitted (by|no later than|in writing)|until|prior to|before)\b/i, 3);
  const qx = qs.find(x => DAY_RE(x)) || qs[0];
  if (qx) { const d = dt(qx, ref); F.questionsDue = d.date ? d.date + (d.time ? 'T' + d.time : '') : ''; F.questionsDueText = clip(qx, 300); snip('questionsDue', qx, fromOf(/questions?|rfi|inquir/i)); }
  /* scope of work */
  let scope = '';
  for (const p of parts) { const sm = /scope of work\s*:?\s*\n?([\s\S]{40,6000}?)(?=\n\s*(?:[A-Z][A-Z \/&-]{3,40}:|Bid Information:|Pre-?Bid Information:|PLAN ROOMS?:|DESIGNER:|END OF SECTION)|$)/i.exec(p.text); if (sm) { scope = sm[1].replace(/\n+/g, ' '); break; } }
  if (!scope) { const m = /\b(?:the\s+)?(?:project|work)\s+(?:consists of|includes|will consist of|generally consists of)\b[\s\S]{20,2000}?(?:\.\s|\n\s*\n|$)/i.exec(all); if (m) scope = m[0]; }
  if (!scope && pg.description) scope = pg.description;
  F.scope = clip(scope, 3000);
  if (F.scope) snip('scope', F.scope.slice(0, 340), fromOf(/scope of work|consists of/i));
  F.trades = tradesIn(F.scope + ' ' + s(pg.description));
  if (pg.description && F.scope !== clip(pg.description, 3000)) F.summary = clip(pg.description, 600);
  /* requirements */
  F.insurance = findSent(all, /\b(insurance|general liability|cgl|workers'? ?comp(ensation)?|auto(mobile)? liability|umbrella|excess liability|builder'?s risk|professional liability|pollution liability|additional insured|certificate of insurance)\b/i, 8)
    .filter(x => !/plan rooms?|reprographic/i.test(x));
  F.bonds = findSent(all, /\b(bid (bond|security|guarant\w*)|performance (and|&) payment bonds?|performance bonds?|payment bonds?|surety|certified or cashier'?s check)\b/i, 5);
  const bb = /(\d+(?:\.\d+)?)\s*(?:%|\)?\s*percent)\)?\s*(?:of the (?:total )?bid\s*)?(?:bid security|bid bond)|(?:bid security|bid bond)[^.]{0,160}?(\d+(?:\.\d+)?)\s*\)?\s*(?:%|percent)/i.exec(all);
  F.bidBond = bb ? (bb[1] || bb[2]) + '%' : '';
  F.licensing = findSent(all, /\blicens(ed|e|ing|ure)\b/i, 3).filter(x => !/software|plate/i.test(x));
  F.prevailingWage = findSent(all, /\b(prevailing wages?|davis[- ]bacon|wage (rates?|determinations?|decisions?))\b/i, 3);
  F.certifiedPayroll = findSent(all, /\bcertified payrolls?\b/i, 2);
  F.mbeDbe = findSent(all, /\b(m\/?wbe|mbe|wbe|dbe|sbe|edge|hub ?zone|minorit(y|ies)|women[- ]owned|disadvantaged business(es)?|small business(es)?|section 3)\b/i, 4);
  ['insurance', 'bonds', 'licensing', 'prevailingWage', 'certifiedPayroll', 'mbeDbe'].forEach(k => { if (F[k].length) snip(k, F[k][0], fromOf(new RegExp(F[k][0].slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))); });
  /* addenda named in the words */
  F.addendaText = uniq((all.match(/\baddend(?:um|a)\s*(?:no\.?|number|#)?\s*\d+[^\n.]{0,80}/gi) || []).map(x => clip(x, 120))).slice(0, 12);
  /* the contact */
  const c = { name: s(pg.contact), company: s(pg.company), phone: s(pg.phone), email: s(pg.email) };
  const cl = /\bContact\s*:\s*([^\n]{3,80})/i.exec(all), ph = /\bPhone\s*:\s*([\d().\s-]{10,20})/i.exec(all), em = all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!c.name && cl) c.name = one(cl[1]); if (!c.phone && ph) c.phone = one(ph[1]); if (!c.email && em) c.email = em[0];
  if (!c.company && F.designer && cl) c.company = F.designer;
  F.contact = c;
  if (c.name || c.company) snip('contact', [c.company, c.name, c.phone, c.email].filter(Boolean).join(' · '), pg.contact ? 'page' : fromOf(/Contact:/i));
  F.status = s(pg.status);
  return { fields: F, snippets: SN };
}

/* ── the AI reader (only where the site allows it) ─────────────────────────── */
const PR_TOOL = {
  name: 'record_plan_room_details',
  description: 'Record what a construction bid project page / bid document says, for a contractor deciding to bid.',
  input_schema: { type: 'object', properties: {
    project_name: { type: 'string' }, owner: { type: 'string' }, designer: { type: 'string' }, location: { type: 'string' }, bid_number: { type: 'string' },
    bid_due_date: { type: 'string', description: 'YYYY-MM-DD or empty' }, bid_due_time: { type: 'string', description: 'HH:MM 24-hour local or empty' },
    delivery_method: { type: 'string', description: 'how bids are delivered / the contract method' },
    prebid_date: { type: 'string' }, prebid_time: { type: 'string' }, prebid_place: { type: 'string' }, prebid_mandatory: { type: ['boolean', 'null'] },
    questions_due_date: { type: 'string' }, questions_due_time: { type: 'string' },
    scope_summary: { type: 'string', description: 'the scope of work in 2-6 sentences' }, trades: { type: 'array', items: { type: 'string' } },
    insurance: { type: 'array', items: { type: 'string' }, description: 'each insurance requirement with its limits, as written' },
    bonds: { type: 'array', items: { type: 'string' } }, licensing: { type: 'array', items: { type: 'string' } },
    prevailing_wage: { type: 'array', items: { type: 'string' } }, certified_payroll: { type: 'array', items: { type: 'string' } }, mbe_dbe: { type: 'array', items: { type: 'string' } },
    addenda: { type: 'array', items: { type: 'string' } },
    contact_name: { type: 'string' }, contact_company: { type: 'string' }, contact_phone: { type: 'string' }, contact_email: { type: 'string' },
    quotes: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, quote: { type: 'string' } } }, description: 'for each field filled, the exact words it came from' }
  } }
};
function aiFields(o, F, SN){
  if (!o || typeof o !== 'object') return false;
  const set = (k, v) => { if (v != null && (Array.isArray(v) ? v.length : s(v))) F[k] = v; };
  set('projectName', s(o.project_name)); set('owner', s(o.owner)); set('designer', s(o.designer)); set('location', s(o.location)); set('bidNumber', s(o.bid_number));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s(o.bid_due_date))) F.bidDue = s(o.bid_due_date) + (/^\d{2}:\d{2}$/.test(s(o.bid_due_time)) ? 'T' + s(o.bid_due_time) : '');
  set('delivery', s(o.delivery_method));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s(o.prebid_date)) || s(o.prebid_place)) F.preBid = Object.assign({}, F.preBid || {}, { date: /^\d{4}-\d{2}-\d{2}$/.test(s(o.prebid_date)) ? s(o.prebid_date) : (F.preBid || {}).date || '', time: /^\d{2}:\d{2}$/.test(s(o.prebid_time)) ? s(o.prebid_time) : (F.preBid || {}).time || '', place: s(o.prebid_place) || (F.preBid || {}).place || '', mandatory: typeof o.prebid_mandatory === 'boolean' ? o.prebid_mandatory : (F.preBid || {}).mandatory == null ? null : F.preBid.mandatory });
  if (/^\d{4}-\d{2}-\d{2}$/.test(s(o.questions_due_date))) F.questionsDue = s(o.questions_due_date) + (/^\d{2}:\d{2}$/.test(s(o.questions_due_time)) ? 'T' + s(o.questions_due_time) : '');
  set('scope', clip(s(o.scope_summary), 3000)); set('trades', arr(o.trades).map(s).filter(Boolean).slice(0, 25));
  ['insurance', 'bonds', 'licensing'].forEach(k => set(k, arr(o[k]).map(x => clip(x, 320)).filter(Boolean).slice(0, 10)));
  set('prevailingWage', arr(o.prevailing_wage).map(x => clip(x, 320)).filter(Boolean)); set('certifiedPayroll', arr(o.certified_payroll).map(x => clip(x, 320)).filter(Boolean)); set('mbeDbe', arr(o.mbe_dbe).map(x => clip(x, 320)).filter(Boolean));
  set('addendaText', arr(o.addenda).map(x => clip(x, 160)).filter(Boolean).slice(0, 12));
  const c = Object.assign({}, F.contact || {}); ['name', 'company', 'phone', 'email'].forEach(k => { if (s(o['contact_' + k])) c[k] = s(o['contact_' + k]); }); F.contact = c;
  const map = { project_name: 'projectName', bid_due_date: 'bidDue', prebid_date: 'preBid', questions_due_date: 'questionsDue', scope_summary: 'scope', delivery_method: 'delivery', mbe_dbe: 'mbeDbe', prevailing_wage: 'prevailingWage', certified_payroll: 'certifiedPayroll', contact_name: 'contact' };
  arr(o.quotes).forEach(q => { if (!q || !s(q.quote)) return; const k = map[s(q.field)] || s(q.field).replace(/_(\w)/g, (m, c2) => c2.toUpperCase()); SN[k] = { text: clip(q.quote, 360), from: 'AI read' }; });
  return true;
}
async function aiRead(parts, pdfs, deps){
  const A = deps.ai; if (!A || !A.ask || (A.ready && !A.ready())) return { ok: false, why: 'the AI reader is not set up' };
  const content = [];
  arr(pdfs).slice(0, 2).forEach(p => { if (p && p.buf && p.buf.length < 6 * 1024 * 1024) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.buf.toString('base64') } }); });
  content.push({ type: 'text', text: 'Below is a construction bid project from a public plan room or bid documents, for GrayCo Construction Services (a contractor in Bartlett, TN). '
    + 'Call the record_plan_room_details tool once with what is written. Use only what is written; leave a field empty rather than guess. Dates YYYY-MM-DD, times HH:MM 24-hour local. '
    + 'Give each requirement (insurance limits, bonds, licensing, prevailing wage, certified payroll, MBE/DBE/Section 3 goals) as its own short line, as written. Add quotes for what you filled.\n\n'
    + parts.map(p => '=== ' + p.from + ' ===\n' + s(p.text).slice(0, 20000)).join('\n\n').slice(0, 50000) });
  const r = await A.ask({ content, tool: PR_TOOL, maxTokens: 4000, timeoutMs: deps.aiTimeoutMs || 40000 });
  return r && r.ok && r.out ? { ok: true, out: r.out } : { ok: false, why: s(r && r.why) || 'no answer' };
}

/* ── the checklist (insurance / bonds / licensing / wage / MBE): kept per lead, ticked by staff ── */
function ckId(kind, label){ return kind + ':' + low(label).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 8).join('-'); }
function checklist(F, old){
  const items = [], done = {}; arr(old).forEach(x => { if (x && x.id) done[x.id] = x; });
  const add = (kind, label) => { label = clip(label, 220); if (!label) return; const id = ckId(kind, label); if (items.some(x => x.id === id)) return; const o = done[id] || {}; items.push({ id, kind, label, done: !!o.done, doneBy: s(o.doneBy), doneAt: s(o.doneAt) }); };
  if (F.bidBond) add('bond', 'Bid bond / bid security ' + F.bidBond + (/certified|cashier/i.test(arr(F.bonds).join(' ')) ? ' (bond or certified / cashier\u2019s check)' : ''));
  arr(F.bonds).forEach(b => { if (!F.bidBond || !/bid (bond|security)/i.test(b)) add('bond', b); });
  arr(F.insurance).forEach(b => add('insurance', b));
  arr(F.licensing).forEach(b => add('license', b));
  arr(F.prevailingWage).forEach(b => add('wage', b));
  arr(F.certifiedPayroll).forEach(b => add('payroll', b));
  arr(F.mbeDbe).forEach(b => add('mbe', b));
  if (F.preBid && F.preBid.mandatory === true) add('prebid', 'Attend the MANDATORY pre-bid' + (F.preBid.date ? ' ' + F.preBid.date + (F.preBid.time ? ' ' + F.preBid.time : '') : ''));
  /* a box a person ticked or added by hand stays */
  arr(old).forEach(x => { if (x && x.id && (x.manual || x.done) && !items.some(y => y.id === x.id)) items.push(x); });
  return items.slice(0, 40);
}

/* ── the full read of one page ─────────────────────────────────────────────── */
async function read(url, deps){
  deps = Object.assign({ pauseMs: 700 }, deps || {});
  const now = deps.now ? deps.now() : Date.now(), ref = new Date(now).toISOString();
  const c = classify(url);
  const base = { v: 1, fetchedAt: ref, url: s(c.url || url), host: s(c.host), board: s(c.board), kind: c.kind, reader: 'plain', aiNote: '', login: false, why: '', todo: '', fields: {}, docs: [], sourceLinks: [], sourceSnippets: {}, checklist: [], warnings: [] };
  if (!c.ok) return Object.assign(base, { login: !!c.login, why: c.why, todo: c.todo || '' });
  const t0 = Date.now(), budget = deps.budgetMs || 25000, late = () => Date.now() - t0 > budget;
  /* robots.txt first */
  const rb = await get(c.origin + '/robots.txt', deps, { max: 200000, timeout: 8000 });
  const R = robots(rb.ok ? rb.text : '');
  let path = '/'; try { const u = new URL(c.url); path = u.pathname + u.search; } catch (e) {}
  if (!R.allows(path)) return Object.assign(base, { why: 'The plan room\u2019s robots.txt asks automated readers to stay away from this page, so the CRM does not read it.', todo: 'Forward the invitation e-mail to bids@grayco-cs.com, or paste the bid documents (PDF) here.' });
  const aiOk = R.aiInput !== 'no' && !deps.noAi;
  if (R.aiInput === 'no') base.aiNote = c.host + ' asks that its pages not be fed to AI tools (robots.txt Content-Signal ai-input=no), so it was read with the plain reader only. A forwarded invitation e-mail or a pasted PDF can be AI read.';
  const page = await get(c.url, deps);
  const wall = wallOf(page, c.kind);
  if (wall) return Object.assign(base, { login: /sign-in|sign in|not public|private/i.test(wall), why: wall, todo: 'Forward the invitation e-mail to bids@grayco-cs.com, or download the bid documents and paste the PDF / text here.' });
  const parts = [], pdfs = [];
  let P = null;
  base.sourceLinks.push({ label: 'Project page', url: c.url });
  if (c.kind === 'repro') {
    P = parseRepro(page.text, c.url);
    parts.push({ from: 'plan room page', text: [P.title, P.description, P.status, Object.keys(P.table).map(k => k.replace(/\b\w/g, c2 => c2.toUpperCase()) + ': ' + P.table[k]).join('\n'), P.location, P.notes].filter(Boolean).join('\n') });
    if (/bidding closed|awarded|cancel/i.test(P.status)) base.warnings.push('The plan room says: ' + P.status + '.');
    /* the file lists (names only) */
    for (const tab of ['addenda', 'specs', 'plans']) {
      const tu = P.tabs[tab]; if (!tu || late()) continue;
      let tp = '/'; try { tp = new URL(tu).pathname; } catch (e) {}
      if (!R.allows(tp)) continue;
      const r = await get(tu, deps);
      if (r.ok && r.text) parseFiles(r.text, tu, tab === 'addenda' ? 'Addenda' : tab === 'specs' ? 'Specs' : 'Plans').forEach(f => base.docs.push(f));
      base.sourceLinks.push({ label: tab === 'addenda' ? 'Addenda' : tab === 'specs' ? 'Specs' : 'Plans', url: tu });
    }
    if (P.tabs['plan-holders']) base.sourceLinks.push({ label: 'Plan holders', url: P.tabs['plan-holders'] });
    /* the public Reference files (invitation / advertisement / notice to bidders) */
    for (const d of P.refs.slice(0, LIM.docs)) {
      const doc = { name: d.name, url: d.url, section: 'Reference', read: false };
      base.docs.unshift(doc);
      if (late()) { doc.why = 'not read (time)'; continue; }
      const r = await get(d.url, deps, { binary: true, max: LIM.doc, timeout: 20000 });
      if (!r.ok) { doc.why = r.status === 401 || r.status === 403 ? 'needs a sign-in' : 'could not be opened (' + (r.status || r.why) + ')'; continue; }
      if (r.tooBig) { doc.why = 'over ' + Math.round(LIM.doc / 1048576) + ' MB — open it from the link'; continue; }
      if (/html/.test(r.type) || LOGIN_PATH.test(s(r.finalUrl))) { doc.why = 'opens as a web page (sign-in) — not read'; continue; }
      const tx = /pdf/.test(r.type) || /\.pdf$/i.test(d.name) ? PDF.text(r.buf, { maxChars: LIM.text }) : /text\/plain/.test(r.type) ? r.buf.toString('utf8').slice(0, LIM.text) : '';
      doc.size = r.size; doc.read = !!tx;
      if (tx) parts.push({ from: d.name, text: tx }); else doc.why = 'no words in it (a scan?)';
      if (aiOk && /pdf/.test(r.type) && !tx) pdfs.push({ name: d.name, buf: r.buf });
    }
    if (arr(base.docs).filter(d => /^Addenda/.test(d.section)).length) base.fields.addenda = base.docs.filter(d => /^Addenda/.test(d.section)).map(d => d.name);
  } else {
    const txt = textOf(page.text).slice(0, LIM.text);
    parts.push({ from: 'web page', text: txt });
    /* linked public bid documents on the same site: the notice / invitation / instructions / spec cover (a few, small) */
    const links = []; String(page.text).replace(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, name) => { const u = absUrl(href, c.url), nm = one(textOf(name)); if (u && /\.pdf(\?|$)/i.test(u) && /(invitation|advertis|notice|instruction|itb|ifb|rfp|rfq|bid (form|doc)|solicitation|spec|project manual|addend)/i.test(nm + ' ' + u)) links.push({ name: nm || decodeURIComponent(u.split('/').pop().split('?')[0]), url: u }); return m; });
    for (const d of uniqBy(links, x => x.url).slice(0, LIM.docs)) {
      const doc = { name: d.name.slice(0, 160), url: d.url, section: 'Linked document', read: false }; base.docs.push(doc);
      if (hostOf(d.url) !== c.host) { doc.why = 'on another site — open it from the link'; continue; }
      let dp = '/'; try { dp = new URL(d.url).pathname; } catch (e) {}
      if (!R.allows(dp) || late()) { doc.why = 'not read'; continue; }
      const r = await get(d.url, deps, { binary: true, max: LIM.doc, timeout: 20000 });
      if (!r.ok || r.tooBig || /html/.test(r.type)) { doc.why = r.tooBig ? 'too large — open it from the link' : 'could not be opened'; continue; }
      const tx = PDF.text(r.buf, { maxChars: LIM.text }); doc.size = r.size; doc.read = !!tx;
      if (tx) parts.push({ from: doc.name, text: tx }); else if (aiOk) pdfs.push({ name: doc.name, buf: r.buf });
    }
  }
  const got = fieldsFromText(parts, P, ref);
  Object.assign(base.fields, got.fields); base.sourceSnippets = got.snippets;
  if (base.fields.addenda && base.fields.addendaText) base.fields.addenda = uniq(base.fields.addenda.concat(base.fields.addendaText)); else if (!base.fields.addenda) base.fields.addenda = arr(base.fields.addendaText);
  delete base.fields.addendaText;
  if (aiOk) {
    try { const a = await aiRead(parts, pdfs, deps); if (a.ok && aiFields(a.out, base.fields, base.sourceSnippets)) base.reader = 'ai'; else if (!a.ok) base.warnings.push('AI read not used: ' + a.why); } catch (e) { base.warnings.push('AI read not used'); }
  }
  base.checklist = checklist(base.fields, deps.oldChecklist);
  base.pages = (deps._n || 0);
  return base;
}
function uniqBy(list, key){ const seen = {}; return list.filter(x => { const k = key(x); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }

/* staff pasted the invitation text, or dropped its PDF: always theirs to have read (AI when set up, else the plain reader) */
async function readPasted(input, deps){
  deps = deps || {}; input = input || {};
  const now = deps.now ? deps.now() : Date.now(), ref = new Date(now).toISOString();
  const base = { v: 1, fetchedAt: ref, url: s(input.url), host: hostOf(input.url), board: s(input.board) || 'Pasted', kind: 'pasted', reader: 'plain', aiNote: '', login: false, why: '', todo: '', fields: {}, docs: [], sourceLinks: input.url ? [{ label: 'Project page', url: s(input.url) }] : [], sourceSnippets: {}, checklist: [], warnings: [] };
  const parts = [], pdfs = [];
  if (s(input.text)) parts.push({ from: 'pasted text', text: s(input.text).slice(0, LIM.text) });
  if (input.file && input.file.data) {
    const buf = Buffer.from(String(input.file.data), 'base64');
    if (buf.length > LIM.doc) return Object.assign(base, { why: 'That file is over ' + Math.round(LIM.doc / 1048576) + ' MB — paste the invitation pages only.' });
    const tx = PDF.text(buf, { maxChars: LIM.text }), nm = s(input.file.name).slice(0, 120) || 'pasted.pdf';
    base.docs.push({ name: nm, section: 'Pasted', read: !!tx, size: buf.length });
    if (tx) parts.push({ from: nm, text: tx });
    pdfs.push({ name: nm, buf });
  }
  if (!parts.length && !pdfs.length) return Object.assign(base, { why: 'Nothing to read — paste the invitation text or drop its PDF.' });
  const got = fieldsFromText(parts.length ? parts : [{ from: 'pasted', text: '' }], null, ref);
  Object.assign(base.fields, got.fields); base.sourceSnippets = got.snippets;
  base.fields.addenda = arr(base.fields.addendaText); delete base.fields.addendaText;
  if (!deps.noAi) { try { const a = await aiRead(parts, pdfs.filter(p => !parts.some(x => x.from === p.name)).concat(parts.length ? [] : pdfs), deps); if (a.ok && aiFields(a.out, base.fields, base.sourceSnippets)) base.reader = 'ai'; else if (!a.ok) base.warnings.push('AI read not used: ' + a.why); } catch (e) {} }
  base.checklist = checklist(base.fields, deps.oldChecklist);
  return base;
}

/* ── storing it ─────────────────────────────────────────────────────────────── */
function preBidOf(F){ const p = F && F.preBid; return p && /^\d{4}-\d{2}-\d{2}$/.test(s(p.date)) ? p.date + (/^\d{2}:\d{2}$/.test(s(p.time)) ? 'T' + p.time : '') : ''; }
/* What the plan room read may set: a blank, or a value it set itself before (kept in <rec>.planRoomSet) — a value a person
   typed is never touched. A person's own edit in the 📐 card (byPerson) sets the value like typing it on the lead would. */
function mine(rec, k, cur){ const set = rec.planRoomSet || {}; return !s(cur) || (set[k] !== undefined && JSON.stringify(set[k]) === JSON.stringify(cur)); }
function setOwned(rec, k, v, ch, label, byPerson){
  const cur = rec[k];
  if (JSON.stringify(cur === undefined ? '' : cur) === JSON.stringify(v)) return;
  if (!byPerson && !mine(rec, k, typeof cur === 'object' && cur ? JSON.stringify(cur) : cur)) return;
  rec[k] = v; rec.planRoomSet = Object.assign({}, rec.planRoomSet || {}, { [k]: v }); ch.push(label || k);
}
function mergeFields(pr, old){
  /* a re-read keeps what a person typed in the card (old.edited lists those fields) and the boxes they ticked */
  const out = Object.assign({}, pr, { fields: Object.assign({}, pr.fields || {}) });
  if (old && old.edited) { Object.keys(old.edited).forEach(k => { if (old.fields && old.fields[k] !== undefined) out.fields[k] = old.fields[k]; }); out.edited = old.edited; out.editedBy = old.editedBy; out.editedAt = old.editedAt; }
  out.checklist = checklist(out.fields, arr(pr.checklist).concat(arr(old && old.checklist)));   /* the old list last: its ticks win */
  return out;
}
/* the Lead Inbox item → [what changed] */
function applyToItem(it, pr, opt){
  opt = opt || {}; const ch = [];
  it.planRoom = opt.byPerson ? pr : mergeFields(pr, it.planRoom);
  const F = it.planRoom.fields || {}, by = !!opt.byPerson;
  const pb = preBidOf(F);
  if (pb) { setOwned(it, 'preBid', pb, ch, 'preBid', by); if (s(F.preBid.place)) setOwned(it, 'preBidLocation', s(F.preBid.place).slice(0, 240), ch, 'preBidLocation', by); if (typeof F.preBid.mandatory === 'boolean') { if (it.preBidMandatory == null || by || (it.planRoomSet && it.planRoomSet.preBidMandatory === it.preBidMandatory)) { if (it.preBidMandatory !== F.preBid.mandatory) { it.preBidMandatory = F.preBid.mandatory; it.planRoomSet = Object.assign({}, it.planRoomSet || {}, { preBidMandatory: F.preBid.mandatory }); ch.push('preBidMandatory'); } } } }
  const bd = s(F.bidDue);
  if (/^\d{4}-\d{2}-\d{2}/.test(bd) && !it.bidDueManual) {
    if (s(it.bidDue).length === 10 && bd.slice(0, 10) === s(it.bidDue) && bd.length > 10) { it.bidDue = bd; it.planRoomSet = Object.assign({}, it.planRoomSet || {}, { bidDue: bd }); ch.push('bidDue time'); }
    else setOwned(it, 'bidDue', bd, ch, 'bidDue', by);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s(F.questionsDue))) setOwned(it, 'questionsDue', s(F.questionsDue), ch, 'questionsDue', by);
  if (!s(it.bidNumber) && s(F.bidNumber)) { it.bidNumber = s(F.bidNumber).slice(0, 80); ch.push('bidNumber'); }
  if (!s(it.owner) && s(F.owner)) { it.owner = s(F.owner).slice(0, 160); ch.push('owner'); }
  if (!arr(it.trades).length && arr(F.trades).length) { it.trades = F.trades.slice(0, 20); ch.push('trades'); }
  return ch;
}
/* the bid job (sp_rows jobs/<id>): the site walk, questions deadline, our due date and the requirements — never a sub notice */
function money(t){ const m = /\$\s?[\d,.]+\s*(?:million|m\b|k\b)?(?:\s*\/\s*\$\s?[\d,.]+\s*(?:million|m\b)?)?/i.exec(s(t)); return m ? one(m[0]) : ''; }
function applyToJob(job, pr, by, opt){
  opt = opt || {}; const ch = []; let walk = false; const person = !!opt.byPerson;
  const keep = mergeFields(pr, job.planRoom);
  job.planRoom = { fetchedAt: s(pr.fetchedAt), url: s(pr.url), board: s(pr.board), kind: s(pr.kind), reader: s(pr.reader), aiNote: s(pr.aiNote), login: !!pr.login, why: s(pr.why), todo: s(pr.todo), fields: person ? (pr.fields || {}) : keep.fields, docs: arr(pr.docs).slice(0, 80), sourceLinks: arr(pr.sourceLinks), sourceSnippets: pr.sourceSnippets || {}, checklist: person ? arr(pr.checklist) : keep.checklist, edited: (person ? pr.edited : keep.edited) || null, editedBy: s(person ? pr.editedBy : keep.editedBy), editedAt: s(person ? pr.editedAt : keep.editedAt), warnings: arr(pr.warnings) };
  const F = job.planRoom.fields || {}, pb = F.preBid || {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(s(pb.date))) {
    const w = { date: pb.date, time: /^\d{2}:\d{2}$/.test(s(pb.time)) ? pb.time : '', location: s(pb.place).slice(0, 240), mandatory: pb.mandatory === true };
    const cur = job.siteWalk || {}, sig = x => JSON.stringify([s(x.date), s(x.time), s(x.location), x.mandatory === true]);
    const owned = !/^\d{4}-\d{2}-\d{2}$/.test(s(cur.date)) || (job.planRoomSet && job.planRoomSet.siteWalk === sig(cur));
    if ((owned || person) && sig(cur) !== sig(w)) { job.siteWalk = Object.assign({}, cur, w); if (!arr(job.siteWalk.rsvp).length) delete job.siteWalk.rsvp; job.planRoomSet = Object.assign({}, job.planRoomSet || {}, { siteWalk: sig(w) }); ch.push('site walk ' + w.date + (w.time ? ' ' + w.time : '') + (w.mandatory ? ' (mandatory)' : '')); walk = true; }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s(F.questionsDue))) setOwned(job, 'questionsDue', s(F.questionsDue).slice(0, 10), ch, 'questions due ' + s(F.questionsDue).slice(0, 10), person);
  if (/^\d{4}-\d{2}-\d{2}/.test(s(F.bidDue))) { const n0 = ch.length; setOwned(job, 'ourDue', s(F.bidDue).slice(0, 10), ch, 'our bid due ' + s(F.bidDue).slice(0, 10), person); if (ch.length > n0 || (job.planRoomSet && job.planRoomSet.ourDue === job.ourDue)) job.ourDueTime = s(F.bidDue).length > 10 ? s(F.bidDue).slice(11, 16) : ''; }
  const rq = Object.assign({}, job.requirements || {}), was = JSON.stringify(rq);
  if (arr(F.bonds).length || F.bidBond) rq.bond = true;
  if (arr(F.prevailingWage).length) rq.prevailingWage = true;
  if (arr(F.certifiedPayroll).length) rq.certifiedPayroll = true;
  if (arr(F.mbeDbe).length) { rq.mbeWbe = true; if (!s(rq.mbeWbeText)) rq.mbeWbeText = clip(F.mbeDbe[0], 120); }
  if (arr(F.licensing).length) { rq.licenses = true; if (!s(rq.licensesText)) rq.licensesText = clip(F.licensing[0], 120); }
  if (arr(F.insurance).length) { rq.coi = true;
    const gl = F.insurance.find(x => /general liability|cgl/i.test(x)), wc = F.insurance.find(x => /workers/i.test(x)), au = F.insurance.find(x => /auto/i.test(x));
    if (gl && !s(rq.coiGl) && money(gl)) rq.coiGl = money(gl).slice(0, 120); if (wc && !s(rq.coiWc)) rq.coiWc = (money(wc) || (/statutory/i.test(wc) ? 'statutory' : '')).slice(0, 120); if (au && !s(rq.coiAuto) && money(au)) rq.coiAuto = money(au).slice(0, 120); }
  if (JSON.stringify(rq) !== was) { job.requirements = rq; ch.push('requirements'); }
  job.log = arr(job.log).concat([{ at: new Date().toISOString(), by: s(by) || 'Plan room', what: ('📐 Plan room ' + (person ? 'details edited' : 'read (' + (pr.reader === 'ai' ? 'AI read' : 'plain reader') + ')') + (ch.length ? ': ' + ch.join(' · ') : '')).slice(0, 300) }]).slice(-300);
  return { changed: ch, walk };
}

/* a person's edits: only the known fields, cleaned */
function cleanEdit(f){
  f = f || {}; const o = {}, str = (k, n) => { if (f[k] !== undefined) o[k] = s(f[k]).slice(0, n || 300); }, list = k => { if (f[k] !== undefined) o[k] = arr([]).concat(Array.isArray(f[k]) ? f[k] : s(f[k]).split(/\n/)).map(x => s(x).slice(0, 320)).filter(Boolean).slice(0, 15); };
  ['projectName', 'owner', 'designer', 'location', 'bidNumber', 'delivery', 'bidDueText', 'questionsDueText', 'siteVisit', 'status'].forEach(k => str(k, 300));
  str('scope', 4000); str('summary', 800);
  if (f.bidDue !== undefined) { const v = s(f.bidDue); o.bidDue = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/.test(v) ? v : ''; }
  if (f.questionsDue !== undefined) { const v = s(f.questionsDue); o.questionsDue = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/.test(v) ? v : ''; }
  if (f.preBid !== undefined) { const p = f.preBid || {}; o.preBid = { date: /^\d{4}-\d{2}-\d{2}$/.test(s(p.date)) ? s(p.date) : '', time: /^([01]\d|2[0-3]):[0-5]\d$/.test(s(p.time)) ? s(p.time) : '', place: s(p.place).slice(0, 240), mandatory: p.mandatory === true ? true : p.mandatory === false ? false : null, text: s(p.text).slice(0, 400) }; }
  ['trades', 'insurance', 'bonds', 'licensing', 'prevailingWage', 'certifiedPayroll', 'mbeDbe', 'addenda'].forEach(list);
  if (f.bidBond !== undefined) o.bidBond = s(f.bidBond).slice(0, 20);
  if (f.contact !== undefined) { const c = f.contact || {}; o.contact = {}; ['name', 'company', 'phone', 'email'].forEach(k => { o.contact[k] = s(c[k]).slice(0, 160); }); }
  return o;
}
/* the link the automatic read may open: a public plan room page (ReproConnect) on the item */
function autoUrl(it){
  const links = arr(it && it.plansLinks).map(l => s(l && l.url)).concat(arr(it && it.gcs).map(g => s(g && g.link)));
  for (const u of links) { const c = classify(u); if (c.ok && c.kind === 'repro') return c.url; }
  return '';
}
/* any plan-room link on the item a person may ask to read (the public kinds first) */
function bestUrl(it){
  const links = arr(it && it.plansLinks).map(l => s(l && l.url)).concat(arr(it && it.gcs).map(g => s(g && g.link))).filter(Boolean);
  const order = links.map(u => ({ u, c: classify(u) })).filter(x => x.c.kind !== 'bad');
  order.sort((a, b) => (a.c.kind === 'repro' ? 0 : a.c.kind === 'generic' ? 1 : 2) - (b.c.kind === 'repro' ? 0 : b.c.kind === 'generic' ? 1 : 2));
  return order.length ? (order[0].c.url || order[0].u) : '';
}
module.exports = { classify, robots, read, readPasted, parseRepro, parseFiles, fieldsFromText, checklist, applyToItem, applyToJob, cleanEdit, autoUrl, bestUrl, preBidOf, PR_TOOL, UA, LIM, _t: { wallOf, tableDt, block, textOf, aiFields } };
