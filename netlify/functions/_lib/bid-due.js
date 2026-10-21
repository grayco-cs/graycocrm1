/* ============================================================================
   GrayCo — WHEN IS THE BID DUE?   netlify/functions/_lib/bid-due.js   (patch LA)

   Owner (10/21): "Always mark down when the bid is due on these leads."

   Reads the bid due date (and time, and time zone) out of a bid e-mail, a planroom notice or a public
   bid listing, without the AI: the AI's answer is used first (bid-inbox.js), this fills what it left
   empty (no date, or a date without the time) and is the only reader when the AI is down.

     findDue(text, { ref })        → { due, date, time, tz, label, at } or { due: '' }
     findDueFor(text, title, opt)  → the same, for one project of a digest that lists several
     merge(aiDue, textDue)         → the better of the two
     wallToEpoch / epochToWall / fmtDue / nowWall   America/Chicago (Central) wall times

   "due" is always Central wall time, 'YYYY-MM-DDTHH:MM' (or 'YYYY-MM-DD' when only the day is known):
   a bid due "2:00 PM EST" is stored as 13:00. Labels it understands, with a time and zone or not:
     Bids due · Bid Due Date · Due Date · Bid Date · Bid Opening · Proposals due · Quotes due ·
     Responses due · Submission Deadline · Deadline · Closing Date · Closes · "sealed bids will be
     received until 2:00 p.m. local time on Thursday, November 12, 2026" · "no later than …"
   and the BuildingConnected / PlanHub / ConstructConnect ways of writing them. It never takes a
   pre-bid / walk-through / questions (RFI) deadline for the bid date.
   ========================================================================== */
'use strict';

const TZ = 'America/Chicago';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DOW_RE = '(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?\\.?,?\\s+)?';
function pad(n){ return ('0' + n).slice(-2); }
function s(v){ return (v == null ? '' : String(v)).trim(); }

/* ── Central time, without a library ──────────────────────────────────────── */
const fmts = {};
function partsIn(epoch, tz){
  const f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const p = {}; f.formatToParts(new Date(epoch)).forEach(x => { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, se: +p.second };
}
function offsetMin(epoch, tz){ const p = partsIn(epoch, tz); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.se) - Math.floor(epoch / 1000) * 1000) / 60000); }
/* 'YYYY-MM-DDTHH:MM' in tz (Central by default) → ms since 1970 (a date alone = midnight starting it) */
function wallToEpoch(wall, tz){
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s(wall)); if (!m) return NaN;
  tz = tz || TZ;
  const g = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  let e = g - offsetMin(g, tz) * 60000;
  e = g - offsetMin(e, tz) * 60000;
  return e;
}
function epochToWall(epoch, tz){ const p = partsIn(epoch, tz || TZ); return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + 'T' + pad(p.h) + ':' + pad(p.mi); }
function nowWall(now){ return epochToWall(now == null ? Date.now() : now); }
/* "Tue Oct 28 2:00 PM" (a date alone: "Tue Oct 28") — from the wall time itself, so it is the same everywhere */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDue(due, o){
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s(due)); if (!m) return s(due);
  const wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  let out = DOW[wd] + ' ' + MON[+m[2] - 1] + ' ' + (+m[3]);
  if (o && o.year) out += ' ' + m[1];
  if (m[4] != null) { let h = +m[4], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; out += ' ' + h + ':' + m[5] + ' ' + ap; }
  return out;
}

/* ── time zones written in bid notices ──────────────────────────────────────── */
/* EST/EDT, CST/CDT … are read as "that region's clock" (notices often write CDT in November): only UTC is fixed */
const FIXED = { utc: 0, gmt: 0, z: 0 };
const ZONES = { est: 'America/New_York', edt: 'America/New_York', cst: TZ, cdt: TZ, mst: 'America/Denver', mdt: 'America/Denver', pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles',
  et: 'America/New_York', eastern: 'America/New_York', ct: TZ, central: TZ, mt: 'America/Denver', mountain: 'America/Denver', pt: 'America/Los_Angeles', pacific: 'America/Los_Angeles', local: TZ };
const ZONE_RE = /^\s*\(?\s*(e[sd]t|c[sd]t|m[sd]t|p[sd]t|et|ct|mt|pt|utc|gmt|z|eastern|central|mountain|pacific|local)\b(?:\s+(?:standard|daylight|prevailing))?(?:\s+time)?\)?/i;
/* a wall time written in zone z → Central wall time */
function toCentral(date, time, z){
  if (!time || !z) return date + (time ? 'T' + time : '');
  z = z.toLowerCase();
  let epoch;
  if (FIXED[z] != null) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date), t = time.split(':'); epoch = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[0], +t[1]) - FIXED[z] * 60000; }
  else if (ZONES[z]) { if (ZONES[z] === TZ) return date + 'T' + time; epoch = wallToEpoch(date + 'T' + time, ZONES[z]); }
  else return date + 'T' + time;
  return epochToWall(epoch, TZ);
}

/* ── dates and times inside a short piece of text ──────────────────────────── */
function yearFor(mo, d, ref){
  const r = ref ? new Date(ref) : new Date(), ry = isNaN(r) ? new Date().getUTCFullYear() : r.getUTCFullYear();
  const refMs = isNaN(r) ? Date.now() : r.getTime();
  /* no year written: this year, or next year when that day is long gone (a notice in December for January) */
  const t = Date.UTC(ry, mo - 1, d);
  return t < refMs - 60 * 86400000 ? ry + 1 : ry;
}
function okDay(y, mo, d){ return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && new Date(Date.UTC(y, mo - 1, d)).getUTCDate() === d; }
const DATE_PATTERNS = [
  /* 2026-11-05 (14:00) */
  { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/i, get: m => [+m[1], +m[2], +m[3]] },
  /* Thursday, November 5th, 2026 · Nov. 5 2026 · November 5 (no year) */
  { re: new RegExp('\\b' + DOW_RE + MON_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4})\\b)?', 'i'), get: (m, ref) => { const mo = MONTHS[m[1].toLowerCase().slice(0, 4)] || MONTHS[m[1].toLowerCase().slice(0, 3)]; const d = +m[2]; return [m[3] ? +m[3] : yearFor(mo, d, ref), mo, d, !m[3]]; } },
  /* 5 November 2026 */
  { re: new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MON_RE + ',?\\s+(\\d{4})\\b', 'i'), get: m => [+m[3], MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1]] },
  /* 11/05/2026 · 11-5-26 · 11.05.2026 · 11/05 (no year) */
  { re: /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}|\d{2}))?\b(?![\/.-]\d)/, get: (m, ref) => { const mo = +m[1], d = +m[2]; if (!m[3]) return [yearFor(mo, d, ref), mo, d, true]; return [m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, d]; } }
];
function dateIn(t, ref){
  let best = null;
  DATE_PATTERNS.forEach(p => {
    const m = p.re.exec(t); if (!m) return;
    const v = p.get(m, ref); if (!v || !okDay(v[0], v[1], v[2])) return;
    /* "11/05" with no year inside a longer number ("2/3 of", "1.5") is not a date: need a 2-digit day or a label right before */
    if (v[3] && p === DATE_PATTERNS[3] && !/^\d{1,2}\/\d{1,2}$/.test(m[0])) return;
    if (!best || m.index < best.at) best = { at: m.index, end: m.index + m[0].length, date: v[0] + '-' + pad(v[1]) + '-' + pad(v[2]), noYear: !!v[3] };
  });
  return best;
}
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?|\b(12:00\s*)?(noon|midnight)\b|\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:hrs|hours|h)\b)?/i;
function timeIn(t){
  const m = TIME_RE.exec(t); if (!m) return null;
  let h, mi;
  if (m[3]) { h = +m[1]; mi = +(m[2] || 0); if (h < 1 || h > 12 || mi > 59) return null; h = h % 12 + (/p/i.test(m[3]) ? 12 : 0); }
  else if (m[5]) { if (/noon/i.test(m[5])) { h = 12; mi = 0; } else { h = 23; mi = 59; } }
  else { h = +m[6]; mi = +m[7]; }
  const after = t.slice(m.index + m[0].length), z = ZONE_RE.exec(after);
  return { at: m.index, end: m.index + m[0].length + (z ? z[0].length : 0), time: pad(h) + ':' + pad(mi), tz: z ? z[1].toLowerCase() : '' };
}

/* ── the labels ─────────────────────────────────────────────────────────────── */
const LABELS = [
  /* strong: says it is the bid / proposal deadline */
  [3, /\b(?:sealed\s+)?(?:bids?|proposals?|quotes?|quotations?|responses?|submittals?|offers?|pricing|submissions?|sois?|soqs?|statements? of qualifications?)\s+(?:are\s+|is\s+|will\s+be\s+|must\s+be\s+|shall\s+be\s+|to\s+be\s+)?(?:due|received|accepted|submitted|opened|delivered)(?:\s+(?:date|time|date\s*(?:&|and|\/)\s*time|on|by|until|before|no\s+later\s+than|not\s+later\s+than|at))*\b/gi],
  [3, /\bbids?\s+(?:due\s+)?(?:date|time|deadline|opening|open\s+date|closing|close)(?:\s*(?:&|and|\/)\s*time)?\b/gi],
  [3, /\b(?:proposal|quote|response|submission|submittal)s?\s+(?:due\s+)?(?:date|deadline|closing)(?:\s*(?:&|and|\/)\s*time)?\b/gi],
  [3, /\bdue\s+(?:date|by|on)(?:\s*(?:&|and|\/)\s*time)?\b/gi],
  [3, /\b(?:closing|close|deadline|opening)\s+(?:date|time)(?:\s*(?:&|and|\/)\s*time)?\b|\bcloses?\s+on\b|\bcloses\b/gi],
  [2, /\b(?:deadline|no\s+later\s+than|not\s+later\s+than|until)\b/gi],
  [1, /\bdue\b/gi]
];
/* never the bid date: a pre-bid meeting, a walk-through, the questions / RFI deadline, a registration */
const NOT_BID = /(pre-?\s*bid|pre-?\s*proposal|walk-?\s*through|walkthrough|site\s+visit|job\s+walk|questions?|rfis?\b|inquir|clarification|registration|pre-?qual|substitution|addend\w*\s+(?:will|issued)|invoice|payment|balance|amount)[^\n.;]{0,40}$/i;
function candidates(text, ref){
  const out = [];
  LABELS.forEach(([pri, re]) => {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const before = text.slice(Math.max(lineStart, m.index - 60), m.index) + m[0];
      if (NOT_BID.test(before.replace(/\b(?:bids?|proposals?)\s+(?:due|date)\b.*$/i, ''))) continue;
      if (pri === 1 && /\b(?:amount|balance|payment|invoice|past)\s+due/i.test(text.slice(Math.max(0, m.index - 20), m.index + 3))) continue;
      /* what follows the label: the rest of this line, and the next line when the label ends its line (a table) */
      let end = text.indexOf('\n', m.index + m[0].length); if (end < 0) end = text.length;
      if (!/\d/.test(text.slice(m.index + m[0].length, end))) { const e2 = text.indexOf('\n', end + 1); end = e2 < 0 ? text.length : e2; }
      const win = text.slice(m.index + m[0].length, Math.min(end, m.index + m[0].length + 160));
      /* "received until 2:00 p.m. local time on Thursday, …": the time may come first */
      const d = dateIn(win, ref); if (!d || d.at > 70) continue;
      let t = timeIn(win.slice(d.end, d.end + 45));
      if (t) { t.at += d.end; t.end += d.end; }
      else { const tb = timeIn(win.slice(0, d.at)); if (tb && !/\d{1,2}[\/.-]\d/.test(win.slice(tb.at, tb.end))) t = tb; }
      out.push({ pri, at: m.index, label: m[0].replace(/\s+/g, ' ').trim(), date: d.date, time: t ? t.time : '', tz: t ? t.tz : '', noYear: d.noYear });
    }
  });
  return out;
}
function clean(text){
  return String(text || '').replace(/\r/g, '').replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/[–—]/g, ' - ').replace(/[ \t]+/g, ' ');
}
function pick(c){
  if (!c.length) return { due: '' };
  /* the strongest label; among equals, a date with a time, then the first in the text */
  c.sort((a, b) => (b.pri - a.pri) || ((b.time ? 1 : 0) - (a.time ? 1 : 0)) || (a.at - b.at));
  const x = c[0];
  const due = toCentral(x.date, x.time, x.tz);
  return { due, date: due.slice(0, 10), time: due.length > 10 ? due.slice(11) : '', tz: x.tz, label: x.label, at: x.at, written: x.date + (x.time ? ' ' + x.time + (x.tz ? ' ' + x.tz.toUpperCase() : '') : '') };
}
function findDue(text, opt){
  opt = opt || {};
  const t = clean(text); if (!t) return { due: '' };
  return pick(candidates(t, opt.ref));
}
/* one project in a notice that lists several: the text from its name to the next project's */
function findDueFor(text, title, opt){
  const t = clean(text), words = s(title).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 4);
  if (!words.length) return { due: '' };
  const low = t.toLowerCase();
  let i = low.indexOf(s(title).toLowerCase());
  if (i < 0) { const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\n]{0,40}?'), 'i'); const m = re.exec(t); i = m ? m.index : -1; }
  if (i < 0) return { due: '' };
  const lineEnd = t.indexOf('\n', i + title.length + 1);
  const seg = t.slice(i, Math.min(t.length, lineEnd < 0 ? i + 400 : Math.max(lineEnd, i + 80), i + 400));
  const r = findDue(seg, opt); if (r.due) return r;
  return { due: '' };
}
/* the AI's date vs the text's: fill what the AI left out; a time zone the AI ignored wins
   (tx: findDue's answer, or a due string) */
function merge(ai, tx){
  ai = s(ai); const r = tx && typeof tx === 'object' ? tx : { due: s(tx) }, t = s(r.due);
  if (!t) return ai; if (!ai) return t;
  if (ai.length === 10 && t.slice(0, 10) === ai) return t;                                   /* the AI had the day, the text the time */
  if (ai.length > 10 && r.tz && ZONES[r.tz] !== TZ && t !== ai && toCentral(ai.slice(0, 10), ai.slice(11), r.tz) === t) return t;   /* the AI kept the sender's clock */
  return ai;
}

/* ── who the bid goes to, and how (owner 10/21: "when it's due AND who it's due to") ──────────────
   { method: 'email' | 'portal' | 'sealed' | 'in_person' | '', email, where } from the e-mail text:
   "submit bids via BuildingConnected", "e-mail your proposal to estimating@acme.test", "sealed bids …
   delivered to City Hall, 1930 S Germantown Rd", "hand deliver to …", "upload to the Ion Wave portal". */
const PORTAL_RE = /\b(?:submit(?:ted)?|upload(?:ed)?|bid|enter|respond|responses?)\b[^\n.]{0,60}?\b(?:via|through|on|in|to|using)\s+(?:the\s+)?(buildingconnected|planhub|procore|smartbid(?:net)?|pipeline ?suite|ion ?wave|bonfire|bidnet(?: direct)?|demandstar|opengov|central bidding|questcdn|e-?builder|bid ?express|(?:[a-z]+ )?(?:online )?(?:bid |procurement |supplier |vendor |e-?bid(?:ding)? )?portal)\b/i;
const EMAIL_RE = /\b(?:e-?mail(?:ed)?|send|submit(?:ted)?|forward)\b[^\n]{0,60}?\b(?:bids?|proposals?|quotes?|pricing|numbers|responses?)?[^\n]{0,30}?\bto\s*:?\s*(?:[A-Z][a-z]+ [A-Z][a-z]+ at |me at |us at )?<?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>?/i;
const EMAIL_RE2 = /\b(?:bids?|proposals?|quotes?|pricing)\b[^\n]{0,40}?\b(?:due|submitted|sent)\b[^\n]{0,40}?\bto\s+(?:me\s+)?(?:at\s+)?<?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>?/i;
const SEALED_RE = /\bsealed\s+(?:bids?|proposals?|envelopes?)\b|\bhand[- ]deliver|\bdeliver(?:ed)?\s+(?:in\s+person\s+)?to\b[^\n]{0,60}\b(?:office|hall|building|department|room|suite|st\b|street|rd\b|road|ave)/i;
function findSubmit(text){
  const t = clean(text); if (!t) return { method: '', email: '', where: '' };
  let m = EMAIL_RE.exec(t) || EMAIL_RE2.exec(t);
  if (m) return { method: 'email', email: m[1].toLowerCase(), where: m[1].toLowerCase() };
  m = PORTAL_RE.exec(t);
  if (m) return { method: 'portal', email: '', where: m[1].replace(/\s+/g, ' ').trim() };
  m = SEALED_RE.exec(t);
  if (m) { const line = t.slice(m.index, (t.indexOf('\n', m.index) + 1 || t.length + 1) - 1); const at = /\b(?:at|to)\s+([^.;\n]{6,120})/i.exec(line); return { method: 'sealed', email: '', where: at ? at[1].trim() : '' }; }
  return { method: '', email: '', where: '' };
}

module.exports = { findDue, findDueFor, findSubmit, merge, wallToEpoch, epochToWall, nowWall, fmtDue, toCentral, TZ, _t: { dateIn, timeIn, candidates, clean } };
