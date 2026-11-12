/* ============================================================================
   GrayCo — 🧹 SALES & SPAM GUARD + 🚫 BLOCK LIST (patch SALESBLOCK).   netlify/functions/_lib/salesguard.js

   Owner 11/01 (a 2:25 AM "🚨 GrayCo EMERGENCY" text that was an AI-agent sales pitch sent through the website form):
   "This is an emergency line that late and I can't have any sales call and can't have just anyone wasting time in my
   phone that late. Don't let calls like this go through and block them."

   · isSales(text, sender) — one detector for every inbound path (website form, leads@ e-mail, texts, call transcripts,
     any new lead before it alerts). The rules block below is copied VERBATIM into index.html (tools/patch_SALESBLOCK.py).
     A sales message is never an emergency, whatever words it has (it overrides _lib/emergency.js, _lib/x10.js EMERG,
     _lib/smsroute.js EMERGENCY and _lib/smsmenu.js menu 5): no lead alert, page, on-call text, emergency call or
     automatic reply. It waits in Leads → 🧹 Sales & spam (admin + office) with "Not spam → make lead" and "🚫 Block".
   · The block list — gc_lead_inbox_kv "gc_sales_block" { phones: [10-digit], emails: [...], domains: [...],
     allowPhones / allowEmails (a "Not spam" sender is never filtered again) }. A blocked sender is dropped silently on
     every path (logged + counted): a text gets no reply / lead / alert, a call is rejected (busy), a website form or
     e-mail is ignored. Edited through netlify/functions/salesblock.js (admins and the office only).
   · The night rule (7 PM – 7 AM Central): a page / text / call to staff needs a REAL emergency — not sales, and emergency
     words in the customer's OWN message (never "24/7" or "urgent" alone, never a form's service drop-down), or the
     after-hours "press 1 for an emergency" choice.
   · Every decision is logged with its reason: gc_lead_inbox_kv "gc_sales_spam" { list (held), log, counts }.
   ========================================================================== */
'use strict';
const crypto = require('crypto');

/* RULES-BEGIN — patch SALESBLOCK: the same text runs in the CRM page (index.html); keep it ES5 */
var SG_STRONG = [
  ['vendor intro: "we are a … firm / agency"', /\b(we\s+are|we\x27re|i\s+am|i\x27m)\s+(a|an)\s+[^.!?\n]{0,40}\b(firm|agency|consultancy|consulting\s+(firm|company)|outsourcing\s+company|service\s+provider)\b/i],
  ['bookkeeping / accounting services', /\b(bookkeeping|book\s*keeping|accounting\s+(firm|services|team)|tax\s+(preparation|services)|payroll\s+services|fractional\s+cfo|virtual\s+cfo)\b/i],
  ['pitch: "we build / help businesses like…"', /\b(i|we)\s+(build|create|design|develop|make|do|help|provide|offer|specialize\s+in|work\s+with|serve)\b[^.!?\n]{0,80}\b(businesses|companies|contractors|roofers|business\s+owners|brands|agencies|home\s*service)/i],
  ['pitch: "businesses like yours / GrayCo"', /\b(businesses|companies|contractors|roofers|brands|owners)\s+like\s+(yours|you|grayco|your\s+(company|business))\b/i],
  ['AI agent / AI receptionist', /\bai[\s-]*(agents?|receptionists?|assistants?|chat\s*bots?|voice\s*(agents?|assistants?)|phone\s*(agents?|answering)|employees?|sales\s*reps?|powered)\b/i],
  ['chatbot', /\bchat\s*-?\s*bots?\b/i],
  ['SEO', /\bseo\b|search\s+engine\s+optimi[sz]/i],
  ['Google ranking / first page', /\b(google|search)\s+(rankings?|rank|placement|first\s+page|page\s+(one|1))\b|\bfirst\s+page\s+(of|on)\s+google\b|\brank\s+(higher|#?\s*1|first|on\s+google)\b|\btop\s+of\s+google\b/i],
  ['leads for your business', /\b(leads?|appointments|customers|clients|calls|jobs)\s+(for|to)\s+your\s+(business|company)\b|\blead[\s-]*gen(eration)?\b|\b(generate|deliver|send\s+you|get\s+you|drive|bring\s+you)\s+(more\s+)?(\w+\s+){0,2}(leads|appointments)\b|\b(get|generate|drive|win)\s+more\s+(customers|clients|leads|calls|reviews|jobs)\b/i],
  ['marketing agency', /\b(marketing|advertising|digital|growth|social\s+media|seo|web)\s+(agency|agencies|company|firm|services|partner|consultant|expert)s?\b|\bdigital\s+marketing\b|\bpay[\s-]per[\s-](click|lead)\b|\bppc\b/i],
  ['web design', /\bweb\s*(site)?\s*(design|designer|development|developer|redesign|makeover|audit)\b/i],
  ['partnership', /\bpartner(ship)?\s+(with\s+(you|grayco|your)|opportunit)|\bstrategic\s+partnership\b|\b(white[\s-]label|affiliate)\s+(program|partner)/i],
  ['funding / working capital', /\bworking\s+capital\b|\bbusiness\s+(funding|loans?|line\s+of\s+credit|financing)\b|\bmerchant\s+cash\b|\bpre[\s-]?approved\s+for\b|\bfunding\s+(offer|for\s+your)\b|\bsba\s+loan\b/i],
  ['merchant / card processing', /\b(credit\s+card|card|merchant|payment)\s+processing\b|\bprocessing\s+fees\b|\bmerchant\s+services\b/i],
  ['virtual assistant / outsourcing', /\bvirtual\s+(assistants?|receptionists?|staff)\b|\boutsourc/i],
  ['book a call / demo', /\b(book|schedule|set\s+up|hop\s+on|jump\s+on|grab)\s+(a\s+|an\s+)?(quick\s+|short\s+|brief\s+|free\s+)?(\d+[\s-]*min(ute)?s?\s+)?(call|demo|meeting|chat|zoom)\b|\b\d{1,2}[\s-]*min(ute)?s?\s+(call|chat|meeting|demo|zoom|of\s+your\s+time)\b|\bfree\s+(demo|trial|audit|analysis)\b/i],
  ['unsubscribe / reply STOP', /\bunsubscribe\b|\breply\s+["'“]?stop\b|\btext\s+["'“]?stop\b|\bstop\s+to\s+(opt|unsub|end|cancel)/i],
  ['reviews / listing', /\breview\s+(management|generation)\b|\b(google|business)\s+(listing|profile)\b[^.]{0,60}\b(suspend|verif|update|optimi|claim)/i]
];
var SG_WEAK = [
  ['"can we connect"', /\b(can|could|may)\s+we\s+connect\b|\blet\x27?s\s+connect\b|\bhappy\s+to\s+connect\b/i],
  ['project far outside TN / MS / AR', /\b(los\s+angeles|san\s+diego|san\s+francisco|new\s+york|chicago|houston|dallas|phoenix|las\s+vegas|seattle|miami|denver|boston|atlanta|california|florida|new\s+jersey|ontario|london|india|pakistan|philippines)\b/i],
  ['mentions "your website / business"', /\byour\s+(website|site|online\s+presence|google\s+(listing|profile)|business|company|brand)\b/i],
  ['introduces a company ("I\'m X from Y")', /\b(I'?m|I\s+am|[Tt]his\s+is|[Mm]y\s+name\s+is)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\s*,?\s*(from|with|at|of|here\s+from)\s+[A-Z][\w&.'-]*/],
  ['demo / quick call', /\bdemo\b|\bquick\s+(call|chat|question\s+for\s+the\s+owner)\b|\bowner\s+or\s+manager\b|\bdecision\s+maker\b/i],
  ['offer / pricing', /\bper\s+month\b|\/mo\b|\bmonthly\s+fee\b|\bno\s+contract\b|\blimited\s+time\b|\bspecial\s+offer\b|\brisk[\s-]free\b|\bguaranteed?\s+results\b/i],
  ['"send details / interested?"', /\bwant\s+me\s+to\s+send\b|\bcan\s+i\s+send\b|\bwould\s+you\s+be\s+(open|interested)\b|\binterested\s*\?|\bworth\s+a\s+(chat|call|look)\b|\bopen\s+to\s+(a|learning)\b/i],
  ['software / automation', /\b(software|platform|automat(e|ion|ed)|saas)\b/i],
  ['uses the business name', /\bgrayco\s+construction(\s+services)?\b/i]
];
/* a customer's own need (water, a leak, the roof, a claim, an estimate, my house …): a pitch must be much clearer then */
var SG_NEED = /\b(water|leak(s|ing|ed)?|roof(s|ing)?|storm|hail|wind\s+damage|tree|fire|smoke|flood(ed|ing)?|pipe|burst|mou?ld|insurance|claim|adjuster|estimate|inspection|repair|damage|ceiling|gutters?|siding|shingles?|project|bids?|renovat\w*|remodel\w*|building|sq\s*ft|square\s+feet)\b|\bmy\s+(house|home|roof|property|ceiling|basement|kitchen|bathroom|attic|garage)\b/i;
/* an adjuster / a carrier / a claim: never a pitch on its own */
var SG_TRUST = /\b(adjuster|adjustor|claim\s*(#|no\.?|number)|policy\s*(#|holder|number)|insured|state\s*farm|allstate|usaa|farmers|nationwide|liberty\s+mutual|progressive|travelers|geico|erie|auto[\s-]?owners|shelter\s+insurance|homesite|safeco)\b/i;
/* patch LEADBOTH (owner 11/12: "in the automatic leads I want to see asbestos and mold leads"): a message about asbestos / lead paint /
   mold / abatement work is never held as a sales pitch (the same words as _lib/envwords.js; mosquito / tax / weed abatement and
   injection molds do not count) */
var SG_ENV = /\basbestos\b|\bACMs?\b|\blead[\s-]*(based\s+)?paint\b|\bLBP\b|\blead\s+(abatement|hazard|remediation|inspection|testing|removal)\b|\bRRP\b|\bmou?ld\b|\bmicrobial\b|\bhaz[\s-]?mat\b|\bhazardous\s+materials?\b|\benvironmental\s+remediation\b|\babatement\b/i;
var SG_ENV_NOT = /\b(mosquito|pest|weed|noise|tax|nuisance|odou?r|dust|rodent|vector|graffiti)\s+abatement\b|\b(injection|plastic|blow|die|casting|concrete|silicone|rubber)\s+mou?lds?\b|\bmou?lds?\s+(injection|making|maker|press)\b/ig;
var SG_DOMAIN = /(seo|market|leads?|digital|media|growth|agency|funding|capital|ventures|outreach|automation)[\w-]*\.[a-z]{2,}$/i;
function sgStr(v){ return v == null ? '' : String(v); }
/* → '' (not sales) or the reasons, e.g. "AI agent / AI receptionist; SEO (score 9)" */
function sgWhy(text, sender){
  var t = sgStr(text), snd = sender && typeof sender === 'object' ? sender : { email: sgStr(sender) };
  if (!t.replace(/\s+/g, '')) return '';
  if (SG_ENV.test(t.replace(SG_ENV_NOT, ' '))) return '';   /* patch LEADBOTH: abatement / mold work is kept */
  var why = [], score = 0, strong = 0, i;
  for (i = 0; i < SG_STRONG.length; i++) if (SG_STRONG[i][1].test(t)) { why.push(SG_STRONG[i][0]); score += 3; strong++; }
  for (i = 0; i < SG_WEAK.length; i++) if (SG_WEAK[i][1].test(t)) { why.push(SG_WEAK[i][0]); score += 1; }
  var em = sgStr(snd.email).toLowerCase(), dom = em.indexOf('@') > 0 ? em.slice(em.indexOf('@') + 1) : '';
  if (dom && SG_DOMAIN.test(dom)) { why.push('sales-sounding e-mail domain'); score += 1; }
  if (sgStr(snd.company) && SG_WEAK[1][1].test(t)) score += 1;   /* a company typed on a homeowner form + "I'm X from Y" */
  if (SG_TRUST.test(t)) score -= 3;
  var need = SG_NEED.test(t.replace(/grayco\s+construction(\s+services)?/ig, ' '));
  var hit = need ? (strong >= 1 && score >= 6) : (score >= 4 && (strong >= 1 || score >= 5));
  return hit ? why.join('; ') + ' (score ' + score + ')' : '';
}
function sgIsSales(text, sender){ return !!sgWhy(text, sender); }
/* patch SPAMGIB — a bot's random-letter form (owner 11/02, a 10:45 AM "NEW LEAD: IOwirBRUMGvsiaemuM … aElwvnTekCEguDEsBXoSmdl
   Project location: Peuhzbszn": "Seems like a lead that should've never reached me"). Each field (name, message, location,
   company) is cut into letter words (links, e-mails and anything with a digit are left out):
   · "mixed-up case" — a word of 6+ letters whose upper / lower case flips 5+ times (4+ in 10+ letters) and is no normal
     shape (McDonald, DeShawn, iPhone, HVACRepair, GrayCo, LLCs) — or flips 8+ times in under 2 letters a run (MkLoPnBhUy);
   · "random letters" — a word of 6+ letters with no vowel, 6+ consonants in a row, or (8+ letters) under 15% vowels (a field counts
     only when EVERY word in it is like that, so "Jon Hirschfeld" or "123 Knightsbridge Dr" never count);
   · a Gmail address cut up by 4+ dots (y.ic.e.sax.i.t.o.v.6.4@gmail.com) counts as one more random field.
   A bot: a mixed-up-case word and no real word anywhere, or 2+ random fields with no real word (or under 3 real words
   with a mixed-up-case word). Real words (SG_BOT_WORDS) are everyday English and the trade's words; a customer who writes
   any sentence is never a bot. → '' or SG_BOT_WHY. */
var SG_BOT_WHY = 'looks like a bot (random text)';
var SG_BOT_WORDS = /^(a|an|the|i|im|ive|id|me|my|we|us|our|you|your|he|she|his|her|it|its|they|them|their|is|am|are|was|were|be|been|being|have|has|had|do|does|did|dont|can|cant|could|would|will|wont|should|need|needs|needed|want|wants|wanted|looking|look|like|please|pls|thanks|thank|thx|hi|hello|hey|good|morning|afternoon|yes|yeah|no|not|ok|okay|and|or|but|so|if|for|to|of|in|on|at|by|with|from|about|into|over|after|before|this|that|these|those|there|here|what|when|where|how|who|why|which|get|got|getting|out|up|down|new|old|some|any|all|just|also|very|more|much|many|one|two|three|few|soon|today|tomorrow|week|next|last|time|day|call|calling|text|email|mail|reach|contact|asap|quote|quotes|estimate|estimates|bid|bids|bidding|price|pricing|cost|costs|free|roof|roofs|roofing|roofer|shingle|shingles|metal|leak|leaks|leaking|leaked|water|damage|damaged|repair|repairs|fix|replace|replaced|replacement|storm|hail|wind|tree|fell|fire|smoke|flood|mold|insurance|claim|adjuster|house|home|property|building|commercial|residential|project|projects|job|jobs|work|remodel|renovation|kitchen|bath|bathroom|basement|attic|garage|floor|floors|flooring|siding|gutter|gutters|window|windows|door|doors|paint|painting|drywall|ceiling|wall|walls|deck|fence|addition|construction|contractor|general|sub|plans|drawings|scope|office|store|church|school|unit|apartment|apartments|tenant|owner|street|st|road|rd|drive|dr|lane|ln|avenue|ave|cove|cv|court|ct|circle|cir|place|pl|way|blvd|parkway|pkwy|hwy|highway|north|south|east|west|memphis|bartlett|cordova|germantown|collierville|arlington|lakeland|millington|olive|branch|southaven|horn|lake|tennessee|mississippi|arkansas)$/;
var SG_BOT_SHAPE = /^(?:[a-z]+|[A-Z]+s?|(?:[A-Z]{1,5}|[a-z]{1,3})?(?:[A-Z][a-z]+)+(?:[A-Z]{1,3}s?)?)$/;
function sgBotCaseRuns(w){ var n = 1, i; for (i = 1; i < w.length; i++) if ((w.charAt(i) < 'a') !== (w.charAt(i - 1) < 'a')) n++; return n; }
function sgBotMixed(w){ var r; if (w.length < 6) return false; r = sgBotCaseRuns(w); if (r >= 8 && w.length < 2 * r) return true; if (SG_BOT_SHAPE.test(w)) return false; return r >= 5 || (r >= 4 && w.length >= 10); }
function sgBotRandom(w){
  var t = w.toLowerCase(), v = (t.match(/[aeiouy]/g) || []).length;
  if (t.length < 6) return false;
  return v === 0 || /[^aeiouy]{6,}/.test(t) || (t.length >= 8 && v / t.length < 0.15);
}
function sgBotWords(v){
  v = sgStr(v).replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, ' ').replace(/\S*\d\S*/g, ' ');
  return v.match(/[A-Za-z]+/g) || [];
}
function sgBotWhy(f){
  f = f && typeof f === 'object' ? f : {};
  var msg = sgStr(f.message).replace(/\b(SUBCONTRACTOR INQUIRY|DIVISION 9 \/ EIFS BID)\.\s*/g, ' ').replace(/(^|\n)[ \t]*(project\s+location|location|company)[ \t]*:/gi, '$1 ');
  var fields = [f.name, msg, f.location, f.company], real = 0, mixed = 0, rnd = 0, i, j, w, all, any;
  for (i = 0; i < fields.length; i++) {
    w = sgBotWords(fields[i]); if (!w.length) continue;
    all = true; any = false;
    for (j = 0; j < w.length; j++) {
      if (SG_BOT_WORDS.test(w[j].toLowerCase())) real++;
      if (sgBotMixed(w[j])) any = true;
      else if (!sgBotRandom(w[j])) all = false;
    }
    if (any) mixed++; else if (all) rnd++;
  }
  var em = sgStr(f.email).toLowerCase(), at = em.lastIndexOf('@');
  if (at > 0 && /^(gmail|googlemail)\.com$/.test(em.slice(at + 1)) && (em.slice(0, at).match(/\./g) || []).length >= 4) rnd++;
  var hit = (mixed >= 1 && real === 0) || (mixed + rnd >= 2 && (real === 0 || (mixed >= 1 && real < 3)));
  return hit ? SG_BOT_WHY : '';
}
/* RULES-END */

const BKEY = 'gc_sales_block', SKEY = 'gc_sales_spam', TZ = 'America/Chicago';
const MAX_HELD = 500, MAX_LOG = 1000, MAX_LIST = 2000;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function okEmail(e){ return /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function domainOf(e){ e = low(e); const i = e.lastIndexOf('@'); return i >= 0 ? e.slice(i + 1) : /^[a-z0-9.-]+\.[a-z]{2,}$/.test(e) ? e : ''; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }

/* ── the clock (tests set exports._now) and the night (7 PM – 7 AM Central) ── */
function nowMs(){ return typeof module.exports._now === 'function' ? module.exports._now() : Date.now(); }
function centralHour(ms){
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(ms)), 10) % 24; }
  catch (e) { return (new Date(ms).getUTCHours() + 18) % 24; }
}
function isNight(ms){ const h = centralHour(ms == null ? nowMs() : ms); return h >= 19 || h < 7; }

/* ── what the customer wrote themselves (never our titles, the form's service drop-down or our notes) ── */
function ownText(it){
  if (!it || typeof it !== 'object') return s(it);
  const le = obj(it.leadExtra), c = obj(it.contact), said = obj(it.said), lsaid = obj(le.said);
  const own = [said.message, lsaid.message, it.textBody, le.textBody, it.callerSaid, le.callerSaid, it.spokenReason, le.spokenReason, it.scope, it.message, c.message, it.body]
    .map(s).filter(Boolean);
  if (own.length) return Array.from(new Set(own)).join('\n');
  return [it.title, it.detail].map(s).filter(Boolean).join('\n');   /* a bare { title } (a text body / what a caller said) */
}
function senderOf(it){
  if (!it || typeof it !== 'object') return {};
  const le = obj(it.leadExtra), c = obj(it.contact), said = obj(it.said), lsaid = obj(le.said);
  return { phone: phone10(le.smsFrom || it.smsFrom || c.phone || it.phone), email: low(c.email || it.email), company: s(said.company || lsaid.company || it.company), name: s(c.name || it.name || le.contactName) };
}
function pressed1(it){ const le = obj(it && it.leadExtra); return !!(it && (it.pressed1 === true || le.pressed1 === true)); }
/* the night rule's "emergency words": the customer's own words, without "24/7" / "24 hours" / "urgent" */
function realWords(t){
  t = s(t).replace(/\b24\s*\/\s*7\b|\b24\s*(hours?|hrs?)\b|\baround\s+the\s+clock\b|\burgent(ly)?\b/ig, ' ');
  if (!t.trim()) return false;
  try { return require('./emergency.js').wordsOnly(t); } catch (e) { return false; }
}
/* the gate every emergency path asks before a page / 🚨 text / call: { ok, why } */
function emergencyGate(it, o){
  o = o || {};
  const why = sgWhy(ownText(it), senderOf(it));   /* even after "not spam": it becomes a lead, never an emergency */
  if (why) return { ok: false, why: 'sales: ' + why };
  const night = o.night != null ? !!o.night : isNight(o.now);
  if (night && !pressed1(it) && !realWords(ownText(it))) return { ok: false, why: 'night (7 PM–7 AM): no emergency words in the customer\'s own message and no "press 1"' };
  return { ok: true, why: '' };
}

/* ── the signed block link in an emergency alert text (admins / the office open it in the CRM, which asks first) ── */
function secret(){ return s(process.env.SALESBLOCK_SECRET) || crypto.createHash('sha256').update('gc-salesblock|' + (s(process.env.SUPABASE_SERVICE_KEY) || s(process.env.SUPABASE_SERVICE_ROLE_KEY) || 'x')).digest('hex'); }
function sig(phone){ return crypto.createHmac('sha256', secret()).update('block|' + phone10(phone)).digest('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 10); }
function sigOk(phone, sg){ const a = Buffer.from(sig(phone)), b = Buffer.from(s(sg)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function blockLink(site, phone){ const d = phone10(phone); return d.length === 10 ? s(site).replace(/\/$/, '') + '/?sgb=' + d + '.' + sig(d) : ''; }

/* ── the block list ── */
function cleanBlock(v){
  v = obj(v);
  const ph = l => { const out = []; (Array.isArray(l) ? l : s(l).split(/[\s,;]+/)).forEach(x => { const d = phone10(x); if (d.length === 10 && out.indexOf(d) < 0 && out.length < MAX_LIST) out.push(d); }); return out; };
  const em = l => { const out = []; (Array.isArray(l) ? l : s(l).split(/[\s,;]+/)).forEach(x => { x = low(x); if (okEmail(x) && out.indexOf(x) < 0 && out.length < MAX_LIST) out.push(x); }); return out; };
  const dm = l => { const out = []; (Array.isArray(l) ? l : s(l).split(/[\s,;]+/)).forEach(x => { x = low(x).replace(/^@/, ''); if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(x) && !/(^|\.)grayco-cs\.com$/.test(x) && out.indexOf(x) < 0 && out.length < MAX_LIST) out.push(x); }); return out; };
  return { phones: ph(v.phones), emails: em(v.emails), domains: dm(v.domains), allowPhones: ph(v.allowPhones), allowEmails: em(v.allowEmails), by: low(v.by), at: s(v.at) };
}
/* 'phone' | 'email' | 'domain' | '' */
function blockedBy(cfg, who){
  cfg = cleanBlock(cfg); who = obj(who);
  const ph = phone10(who.phone), em = low(who.email), dom = domainOf(em);
  if (ph.length === 10 && cfg.allowPhones.indexOf(ph) < 0 && cfg.phones.indexOf(ph) >= 0) return 'phone';
  if (em && cfg.allowEmails.indexOf(em) < 0) {
    if (cfg.emails.indexOf(em) >= 0) return 'email';
    if (dom && cfg.domains.some(d => dom === d || dom.slice(-(d.length + 1)) === '.' + d)) return 'domain';
  }
  return '';
}
function allowed(cfg, who){ cfg = cleanBlock(cfg); who = obj(who); const ph = phone10(who.phone), em = low(who.email); return (ph.length === 10 && cfg.allowPhones.indexOf(ph) >= 0) || (!!em && cfg.allowEmails.indexOf(em) >= 0); }

function cleanStore(v){
  v = obj(v);
  const c = obj(v.counts);
  return { list: arr(v.list).filter(x => x && x.id).slice(-MAX_HELD), log: arr(v.log).slice(-MAX_LOG), counts: { sales: +c.sales || 0, blocked: +c.blocked || 0, night: +c.night || 0, days: obj(c.days) } };
}
const BID_KIND = /commercial|government|bid/i;

/* the storage side: d = { kvGet, kvCas, now } (defaults: the lead inbox table through bid-inbox.js) */
function make(d){
  d = d || {};
  const L = () => require('../bid-inbox.js')._lib;
  const kvGet = d.kvGet || (k => L().kvGet(k));
  const kvCas = d.kvCas || ((k, f) => L().kvCas(k, f));
  const now = () => (typeof d.now === 'function' ? d.now() : nowMs());
  const iso = () => new Date(now()).toISOString();
  let cache = null, cacheAt = 0;
  async function blockList(fresh){
    if (!fresh && cache && now() - cacheAt < 30000) return cache;
    let v = null; try { v = await kvGet(BKEY); } catch (e) { v = null; }
    cache = cleanBlock(v); cacheAt = now(); return cache;
  }
  /* one decision → the log (+ the counts); never throws */
  async function record(entry, held){
    const at = iso(), day = at.slice(0, 10);
    const e = Object.assign({ at }, entry); ['text', 'why'].forEach(k => { if (e[k]) e[k] = clip(e[k], k === 'text' ? 160 : 300); });
    try { console.log('[salesblock] ' + e.decision + ' · ' + (e.via || '') + ' · ' + (e.phone ? tidy(e.phone) : e.email || '') + ' · ' + (e.why || '')); } catch (x) {}
    try {
      await kvCas(SKEY, v => {
        const st = cleanStore(v);
        if (held) { if (st.list.some(x => x.id === held.id)) { if (!entry.force) return undefined; } else st.list = st.list.concat([held]).slice(-MAX_HELD); }
        st.log = st.log.concat([e]).slice(-MAX_LOG);
        const k = e.decision === 'blocked' ? 'blocked' : e.decision === 'sales' ? 'sales' : e.decision === 'night' ? 'night' : '';
        if (k) { st.counts[k]++; const dd = obj(st.counts.days[day]); dd[k] = (+dd[k] || 0) + 1; st.counts.days[day] = dd; const keys = Object.keys(st.counts.days).sort(); while (keys.length > 31) delete st.counts.days[keys.shift()]; }
        return st;
      });
    } catch (x) {}
    return e;
  }
  /* a blocked sender: '' or the reason (logged + counted unless o.log === false) */
  async function blocked(who, o){
    o = o || {};
    const by = blockedBy(await blockList(), who); if (!by) return '';
    if (o.log !== false) await record({ decision: 'blocked', via: s(o.via), phone: phone10(who && who.phone), email: low(who && who.email), why: 'blocked ' + by, text: s(o.text) });
    return 'blocked ' + by;
  }
  /* a sales pitch → held in 🧹 Sales & spam: '' (not sales) or the reason */
  async function hold(x){
    x = obj(x);
    const who = { phone: phone10(x.phone), email: low(x.email) };
    if (allowed(await blockList(), who)) return '';
    const why = s(x.why) || (x.bot === false ? '' : sgBotWhy({ name: x.name, message: x.text, email: who.email })) || sgWhy(x.text, { email: who.email, company: x.company });   /* patch SPAMGIB: a bot's random letters */
    if (!why) return '';
    const id = 'SG-' + crypto.createHash('sha256').update([x.via, who.phone, who.email, s(x.id), s(x.text).slice(0, 400)].join('|')).digest('hex').slice(0, 16);
    const item = { id, at: iso(), via: s(x.via) || 'lead', why: clip(why, 300), phone: who.phone, email: who.email, name: clip(x.name, 80), company: clip(x.company, 80), text: clip(x.text, 3000),
      page: clip(x.page, 200), leadId: s(x.leadId), refile: x.refile || null, status: 'held' };
    await record({ decision: 'sales', via: item.via, phone: item.phone, email: item.email, why, id, text: x.text }, item);
    return why;
  }
  /* ── the inbound paths ── */
  /* website form / leads@ e-mail (f = website-intake readForm). → '' (go on) or why it was dropped / held */
  async function screenForm(f, o){
    f = obj(f); o = obj(o);
    const who = { phone: f.phone, email: f.email || o.from };
    const b = await blocked(who, { via: o.via, text: f.message }); if (b) return b;
    if (/^(careers|referral|partner|magnet)$/.test(s(f.type))) return '';   /* applications / sign-ups are not leads */
    const text = [f.message, f.company && f.type !== 'commercial' ? 'Company: ' + f.company : ''].filter(Boolean).join('\n');
    /* patch SPAMGIB: random letters in the name / message / location / company → held as a bot, never a lead */
    const bot = sgBotWhy({ name: f.name, message: f.message, location: [f.address, f.city, f.state].filter(Boolean).join(', '), company: f.company, email: f.email || o.from });
    return hold({ via: o.via, phone: f.phone, email: f.email || o.from, name: f.name, company: f.company, text, page: f.page, refile: o.refile || null, why: bot, bot: false });
  }
  /* a text, or what a caller said: → '' or the reason */
  async function screenText(x){
    x = obj(x);
    const b = await blocked({ phone: x.phone, email: x.email }, { via: x.via, text: x.text, log: x.logBlocked }); if (b) return b;
    return hold(x);
  }
  /* bid-alerts notifyNew: the new leads → { drop: [ids], why: { id: reason } } (a sales lead is also taken off the Lead Inbox) */
  async function screenLeads(items, o){
    o = obj(o);
    const drop = [], why = {};
    for (const it of arr(items)) {
      if (!it || !it.id) continue;
      const le = obj(it.leadExtra);
      if (le.notSpam === true || it.notSpam === true) continue;
      const who = senderOf(it);
      const b = await blocked(who, { via: 'lead', text: ownText(it) });
      if (b) { drop.push(s(it.id)); why[s(it.id)] = b; continue; }
      if (allowed(await blockList(), who)) continue;
      /* patch SPAMGIB: a bot's random letters (any kind of lead, a "Commercial bid inquiry" too) */
      const bot = sgBotWhy({ name: who.name, message: ownText(it), location: [it.address, it.city, it.state].map(s).filter(Boolean).join(', '), company: who.company, email: who.email });
      if (!bot && (BID_KIND.test(s(it.type || it.leadKind)) || /bids@|bid\s*board|planhub|buildingconnected|isqft/i.test(s(it.source)))) continue;   /* a bid invitation is never a pitch */
      const w = bot || sgWhy(ownText(it), who);
      if (!w) continue;
      const tag = bot ? bot : 'sales: ' + w;
      await hold({ via: 'lead', phone: who.phone, email: who.email, name: who.name, company: who.company, text: ownText(it), leadId: s(it.id), why: w });
      drop.push(s(it.id)); why[s(it.id)] = tag;
      if (o.inboxKey) { try { await kvCas(o.inboxKey, v => { const l = arr(v), x = l.find(y => y && s(y.id) === s(it.id)); if (!x || x.status === 'dismissed') return undefined; x.status = 'dismissed'; x.dismissedBy = 'Sales & spam filter'; x.dismissReason = clip(tag, 200); x.updatedAt = iso(); return l; }); } catch (e) {} }
    }
    return { drop, why };
  }
  /* ── the admin side (salesblock.js) ── */
  async function store(){ let v = null; try { v = await kvGet(SKEY); } catch (e) {} return cleanStore(v); }
  async function editBlock(fn, by){
    let out = null;
    await kvCas(BKEY, v => { const c = cleanBlock(v); fn(c); c.by = low(by); c.at = iso(); out = cleanBlock(c); return out; });
    cache = out; cacheAt = now(); return out;
  }
  async function block(who, by){
    who = obj(who); const ph = phone10(who.phone), em = low(who.email), dm = low(who.domain).replace(/^@/, '');
    const c = await editBlock(c => {
      if (ph.length === 10) { if (c.phones.indexOf(ph) < 0) c.phones.push(ph); c.allowPhones = c.allowPhones.filter(x => x !== ph); }
      if (okEmail(em)) { if (c.emails.indexOf(em) < 0) c.emails.push(em); c.allowEmails = c.allowEmails.filter(x => x !== em); }
      if (dm) c.domains.push(dm);
    }, by);
    await record({ decision: 'block', via: 'crm', phone: ph, email: em || dm, why: 'blocked by ' + low(by) });
    return c;
  }
  async function unblock(who, by){
    who = obj(who); const ph = phone10(who.phone), em = low(who.email), dm = low(who.domain).replace(/^@/, '');
    const c = await editBlock(c => { c.phones = c.phones.filter(x => x !== ph); c.emails = c.emails.filter(x => x !== em); c.domains = c.domains.filter(x => x !== dm); }, by);
    await record({ decision: 'unblock', via: 'crm', phone: ph, email: em || dm, why: 'unblocked by ' + low(by) });
    return c;
  }
  async function allow(who, by){
    who = obj(who); const ph = phone10(who.phone), em = low(who.email);
    return editBlock(c => { if (ph.length === 10 && c.allowPhones.indexOf(ph) < 0) c.allowPhones.push(ph); if (okEmail(em) && c.allowEmails.indexOf(em) < 0) c.allowEmails.push(em); }, by);
  }
  async function setStatus(id, status, by, extra){
    let item = null;
    await kvCas(SKEY, v => { const st = cleanStore(v), x = st.list.find(y => y.id === s(id)); if (!x) return undefined; x.status = status; x.by = low(by); x.doneAt = iso(); Object.assign(x, obj(extra)); item = x; return st; });
    if (item) await record({ decision: status === 'lead' ? 'not-spam' : status, via: 'crm', phone: item.phone, email: item.email, id: item.id, why: status + ' by ' + low(by) });
    return item;
  }
  return { blockList, blocked, hold, record, screenForm, screenText, screenLeads, store, block, unblock, allow, setStatus };
}
let DEF = null;
function def(){ return DEF || (DEF = make()); }
function _reset(){ DEF = null; }   /* tests: a fresh block-list cache */

module.exports = {
  isSales: sgIsSales, why: sgWhy, ownText, senderOf, realWords, emergencyGate, isNight, centralHour, pressed1,
  cleanBlock, blockedBy, allowed, cleanStore, blockLink, sig, sigOk, make, def, BKEY, SKEY, _reset,
  RULES: { SG_STRONG, SG_WEAK, SG_NEED, SG_TRUST, SG_DOMAIN },
  botWhy: sgBotWhy, BOT_WHY: SG_BOT_WHY   /* patch SPAMGIB */
};
