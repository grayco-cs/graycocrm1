/* ============================================================================
   GrayCo — SALES PITCHES NEVER REACH THE CRM (patch SALESSPAM).   netlify/functions/_lib/salesspam.js

   Owner 10/29: "a sales pitch for software from replies — do not show in crm or email at all, just straight spam".

   Every e-mail for leads@ / bids@ / replies@ / claims@ (bid-inbox.js, claim-inbox.js) and every text from an UNKNOWN
   number (missed-call.js inboundSms) is checked here BEFORE it can become a lead, an alert (e-mail / text / push), a
   relay e-mail, an approval or a Job Message. A vendor's sales pitch — software / SaaS / CRM, marketing / SEO / web
   design, lead generation, "book a demo" / "quick call", "partnership", financing / factoring / merchant cash,
   staffing / virtual assistants, AI tools — and cold sequences from sales tools (Apollo, Outreach, HubSpot sequences,
   Lemlist, Instantly, Smartlead, Reply.io, Salesloft …) is FILTERED:
     · nothing is made from it and nobody is told;
     · it is kept only in "🗑 Filtered (sales/spam)" (⚙ Admin → 📥 Leads, bids & portals area, admins only), newest
       500, each one purged after 30 days, with ↩ Restore (= processed normally now) and "Always allow this sender /
       domain";
     · the day's count is the only trace elsewhere: one line in 🩺 CRM health ("7 sales e-mails filtered today").

   NEVER filtered (checked first, in this order): the admin's allow list; GrayCo's own addresses; mail to invoices@ /
   receipts@; plan rooms and bid boards (BuildingConnected, PlanHub, A&B, RKA, ConstructConnect, Procore, iSqFt …) and
   government senders; insurance carriers, adjusting firms and claim platforms; any address — or company domain — of a
   customer, sub, vendor / supplier, adjuster or job contact in the CRM; a reply to something we sent (In-Reply-To /
   References naming one of our Message-IDs, or a sender we have e-mailed); anything that names one of our jobs (its PO
   or its street address). The admin's block list filters a sender outright (the allow list still wins).

   HOW IT DECIDES: plain rules give a score (pitch phrases, sales-tool headers / links / footers, demo-calendar links,
   "Hope this finds you well" + an offer, a cold e-mail to replies@ that answers nothing we sent). With
   ANTHROPIC_API_KEY, anything the rules find even slightly suspicious is read by Claude (strict JSON tool schema); its
   answer decides, and the rules decide when it is not available or does not answer. Mail with no sales signal at all
   is never sent to the AI and never filtered.

   STORE (service key only — the Lead Inbox's private table through bid-inbox.js kvCas / kvGet, never gc_kv in a browser):
     gc_sales_filtered        [{ id, at, channel: email|text, route, from, fromName, to[], subject, text, score, reasons[], by, ai, evt | sms }]
     gc_sales_lists           { allow: [domain | address | phone], block: [...], by, at }
     gc_sales_filtered_count  { days: { 'YYYY-MM-DD': { e, t } } }   (Central days, newest 60)
   ========================================================================== */
'use strict';

const KV_ITEMS = 'gc_sales_filtered', KV_LISTS = 'gc_sales_lists', KV_COUNT = 'gc_sales_filtered_count';
const KEEP_DAYS = 30, MAX_ITEMS = 500, TEXT_MAX = 20000;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function env(k){ return s(process.env[k]); }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function centralDay(ms){ try { return new Date(ms == null ? Date.now() : ms).toLocaleString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 10); } catch (e) { return new Date().toISOString().slice(0, 10); } }

/* ── deps (tests swap these) ── */
function L(){ return require('../bid-inbox.js')._lib; }
const _D = {
  now: () => Date.now(),
  kvGet: k => L().kvGet(k),
  kvCas: (k, f) => L().kvCas(k, f),
  crmData: async () => { try { return await require('../portal.js')._core.kvRead(['customers', 'subs', 'vendors', 'projects', 'gc_claims', 'users', 'gc_deleted_projects']); } catch (e) { return {}; } },
  sentRows: async () => { try { return await require('./mailidx.js').crmRows(); } catch (e) { return []; } },
  ai: () => { try { return require('./ai.js'); } catch (e) { return null; } }
};

/* ── who is never spam ─────────────────────────────────────────────────────── */
const OURS = /@(in\.)?grayco-cs\.com$/i;
const FREEMAIL = /^(gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|aol|icloud|me|mac|comcast|att|sbcglobal|bellsouth|verizon|charter|spectrum|cox|earthlink|protonmail|proton|gmx|mail|zoho|yandex|frontier|windstream|centurylink|q|juno|netzero|fastmail|hey|tutanota)\.(com|net|me|org)$|^(att|bellsouth|sbcglobal|comcast|charter|cox|centurylink|windstream|frontier)\.net$|^(proton\.me|pm\.me|aim\.com)$/i;
/* plan rooms, bid boards and public-bid senders (the bid inbox's BOARDS, plus their mail domains) */
const PLANROOM = /(^|\.)(buildingconnected\.com|autodesk\.com|planhub\.com|aandbplanroom\.com|rkaplanroom\.com|isqft\.com|constructconnect\.com|bidclerk\.com|cmdgroup\.com|dodge(data)?\.com|construction\.com|procore\.com|procoretech\.com|smartbidnet\.com|pipelinesuite\.com|bidmail\.com|bidplanroom\.com|e-builder\.net|textura\.com|plangrid\.com|bluebeam\.com|ionwave\.net|bidnetdirect\.com|centralbidding\.com|demandstar\.com|bonfirehub\.com|opengov\.com|periscopeholdings\.com|bidsync\.com|questcdn\.com|planetbids\.com|bidexpress\.com|sam\.gov|arcbids\.com|blueprintplanroom\.com|reprographics\.com|plansonline\.com|bxwa\.com|bidcontender\.com|pantera\.?tools?\.com|loadspring\.com|gradebeam\.com)$/i;
const GOV = /(\.gov|\.mil|\.k12\.[a-z]{2}\.us|\.us|\.edu)$|(^|\.)(memphistn|shelbycountytn|shelbycountybids|scsk12|mlgw|flymemphis|desotocountyms|southaven|olivebranchms|cityofsouthaven|hernandoms)\.(gov|org|com)$/i;
/* insurance carriers, adjusting firms, claim platforms */
const INSURANCE = /(^|\.)(statefarm\.com|allstate\.com|usaa\.com|libertymutual\.com|safeco\.com|nationwide\.com|travelers\.com|farmers(insurance)?\.com|progressive\.com|erieinsurance\.com|erie\.com|shelterinsurance\.com|auto-owners\.com|aoins\.com|amfam\.com|americanfamily\.com|chubb\.com|thehartford\.com|hartford\.com|metlife\.com|assurant\.com|homesite\.com|upcic\.com|universalproperty\.com|americanstrategic\.com|asi\.com|progressivehome\.com|tnfarmbureau\.org|fbitn\.com|farmbureau\.com|msfb\.org|sfbcic\.com|southernfarmbureau\.com|kemper\.com|cincinnatiinsurance\.com|cinfin\.com|westfieldinsurance\.com|grangeinsurance\.com|selective\.com|hanover\.com|zurichna\.com|zurich\.com|aig\.com|cna\.com|thezebra\.com|lemonade\.com|hippo\.com|kin\.com|openly\.com|geico\.com|encompassinsurance\.com|mercuryinsurance\.com|foremost\.com|bristolwest\.com|stillwaterinsurance\.com|vault\.insurance|pure(insurance|group)\.com|crawco\.com|crawfordandcompany\.com|sedgwick\.com|eberls\.com|eberl\.com|pilotcat\.com|alacrityservices\.com|alacritysolutions\.com|claimsxchange\.com|xactware\.com|xactanalysis\.com|verisk\.com|symbility\.net|corelogic\.com|cotality\.com|contractorconnection\.com|accuserve\.com|codeblue\.com|hancockclaims\.com|cunninghamlindsey\.com|ics-claims\.com|seibels\.com|engle-martin\.com|englemartin\.com|claimsolution\.com|patriotclaims\.com|lowers\.com|yorkrsg\.com|questclaims\.com|nfip\.com|fema\.gov)$/i;

/* ── the pitch ─────────────────────────────────────────────────────────────── */
/* [regex, weight, reason] — strong offers 2, softer cues 1 */
const PITCH = [
  [/\b(book|schedule|grab|set up|arrange)\s+(a\s+|some\s+)?(quick\s+|free\s+|short\s+|personalized\s+)?(demo|walkthrough|walk-through|discovery call|strategy (call|session)|consultation call)\b/i, 2, 'demo / discovery call'],
  [/\b(quick|short|brief|15[- ]?min(ute)?s?|10[- ]?min(ute)?s?|20[- ]?min(ute)?s?)\s+(call|chat|zoom|meeting|conversation)\b|\bhop on a (quick )?call\b|\bworth a (quick )?(chat|call|conversation)\b/i, 2, 'asks for a quick call'],
  [/\b(would|are) you (be )?open to (a |an )?(quick |short |brief )?(call|chat|conversation|demo|meeting|learning more)\b|\bopen to exploring\b|\b(interested in|keen to) (learning|hearing) more\b/i, 2, 'open to a call?'],
  [/\b(are you|is this) the (right|best) (person|contact)\b|\bwho (handles|is in charge of|manages|oversees) (your |the )?(marketing|software|technology|it|operations|purchasing|hiring|finance)\b/i, 2, 'right person?'],
  [/\bpartnership (opportunity|proposal)\b|\b(explore|discuss) (a )?(potential )?partnership\b|\bstrategic partner(ship)?\b/i, 1, 'partnership'],
  [/\bwe (help|work with|partner with|specialize in helping)\s+(roofing|roofers|contractors|construction|restoration|home ?service|remodel(ing|ers)?|general contractors|businesses|companies|teams)\b/i, 2, '"we help contractors…"'],
  [/\b(software|saas|platform|app|crm|erp|field service management|estimating software|takeoff software|scheduling software|project management software|ai[- ]powered|ai (receptionist|agent|assistant|tool|voice|chatbot)|chatbot|automation (platform|tool))\b/i, 1, 'software / AI'],
  [/\b(seo|search engine optimi[sz]ation|google (ranking|maps ranking|business profile optimi[sz]ation)|rank (higher|#?1|first) on google|first page (of|on) google|backlinks?|ppc|pay[- ]per[- ]click|google ads management|facebook ads|social media (management|marketing)|digital marketing( agency)?|marketing agency|web ?design|website (re)?design|new website|reputation management|review generation)\b/i, 2, 'marketing / SEO / web design'],
  [/\b(lead[- ]gen(eration)?|exclusive (roofing |storm |insurance |restoration )?leads|(qualified|pre-qualified|booked) (leads|appointments)|appointment setting|more (leads|jobs|customers|appointments) (every|each|per) (month|week)|\d+\+? (new )?(leads|appointments|jobs) (a|per|every|each) (month|week))\b/i, 2, 'lead generation'],
  [/\b(merchant cash advance|working capital|business (loan|funding|line of credit)|line of credit|factoring|invoice factoring|equipment financing|customer financing (program|options)|offer financing to your (customers|clients|homeowners)|pre-?approved for \$)\b/i, 2, 'financing / factoring'],
  [/\b(staffing (agency|solutions|firm)|virtual assistants?|offshore (team|staff)|dedicated (va|virtual)|recruiting (services|agency)|outsourc(e|ed|ing) (your )?(bookkeeping|estimating|admin|calls|marketing))\b/i, 2, 'staffing / outsourcing'],
  [/\b(free (trial|audit|consultation|analysis|report|estimate of your (site|website))|case study|roi\b|increase (your )?(revenue|sales|close rate|bookings)|grow (your )?(business|revenue|company)|scale your (business|company)|save (you )?\d+\s*(hours|%))/i, 1, 'growth offer'],
  [/\bhope (this|the|my) (e-?mail|message|note)? ?(finds|reaches) you well\b|\bhope you('re| are) (doing )?well\b|\bi('ll| will) keep (this|it) (short|brief)\b/i, 1, '"Hope this finds you well"'],
  [/\b(circling|circle) back\b|\bbump(ing)? (this|my (last|previous))\b|\bfollowing up on my (last|previous|earlier) (e-?mail|note|message)\b|\bdid you (get|have) a chance to (see|read|review|look)\b|\bjust (wanted to )?(check(ing)? in|follow(ing)? up)\b.*\b(last|previous) (e-?mail|note|message)\b|\bfloat(ing)? this (back )?to the top\b/i, 1, 'cold follow-up'],
  [/\bi (came across|found|noticed|was looking at) (your|grayco)('s)? (website|company|profile|business|listing|reviews|google)\b/i, 1, '"I came across your website"']
];
const TOOLS = /\b(apollo\.io|apollomail|outreach\.io|outreach-mail|hubspot(email|links|-sales)?|hs-sales|hubspotemail\.net|hs-?analytics|lemlist|lempire|instantly\.ai|instantlymail|smartlead|reply\.io|salesloft|mailshake|woodpecker\.co|yesware|mixmax|klenty|saleshandy|quickmail\.io|gmass|mailmeteor|lusha|seamless\.ai|zoominfo|clay\.com|amplemarket|snov\.io|hunter\.io|close\.com|pipedrive|groove\.co|vocus\.io)\b/i;
const CALENDAR = /\b(calendly\.com|chilipiper\.com|meetings\.hubspot\.com|hubspot\.com\/meetings|savvycal\.com|cal\.com\/|tidycal\.com|zcal\.co|youcanbook\.me|acuityscheduling\.com|oncehub\.com|calendar\.app\.google|vyte\.in|doodle\.com\/bp)\b/i;
const OPTOUT = /\b(unsubscribe|opt[- ]?out|reply (with )?["']?(stop|no|remove|unsubscribe)["']?|if (you'?d|you would) (rather|prefer) not (to )?hear from me|not (the right person|interested)\? (just )?(let me know|reply)|don'?t want (to hear|these|more) (from me|emails))\b/i;
/* what a customer, a GC or a sub writes — pulls the score down */
const NEED = [
  /\b(my|our) (roof|house|home|property|building|basement|kitchen|bath(room)?|ceiling|attic|garage|deck|siding|gutters?|church|store|office building)\b/i,
  /\b(need|want|looking for|requesting|request) (a |an |some )?(quote|estimate|bid|price|roofer|contractor|repair|inspection|someone to)\b/i,
  /\b(water damage|roof leak|leaking|storm damage|hail damage|fire damage|flood(ed|ing)?|mold)\b/i,
  /\b(invitation to bid|invited to bid|bids? (are |is )?due|bid date|pre-?bid (meeting|conference|walk)|plans (and|&) spec(ification)?s|addend(um|a) (no\.?|#)?\s*\d|\bITB\b|request for (proposal|quote|qualifications))\b/i,
  /\b(claim (number|#|no\.?)|policy (number|#|no\.?)|date of loss|adjuster|insured)\b/i,
  /\b(invoice|statement|remittance|payment (received|due)|pay app|lien waiver|purchase order)\b/i
];

function domainOf(e){ e = low(e); const i = e.lastIndexOf('@'); return i >= 0 ? e.slice(i + 1) : ''; }
/* the registrable part, roughly: mail.abcroofing.com → abcroofing.com */
function baseDomain(d){ d = low(d).replace(/\.$/, ''); const p = d.split('.'); if (p.length <= 2) return d; const two = p.slice(-2).join('.'); return /^(co|com|net|org|gov|ac)\.[a-z]{2}$/.test(two) ? p.slice(-3).join('.') : two; }
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
function emailsIn(obj, out, depth){
  out = out || {}; depth = depth || 0; if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') { (obj.match(EMAIL_RE) || []).forEach(e => { e = low(e); if (!OURS.test(e)) out[e] = 1; }); return out; }
  if (Array.isArray(obj)) { obj.slice(0, 400).forEach(x => emailsIn(x, out, depth + 1)); return out; }
  if (typeof obj === 'object') Object.keys(obj).forEach(k => { if (!/^(notes|photos|docs|files|history|log|timeline|messages|textLog|portalChoices|checklist|activity)$/i.test(k)) emailsIn(obj[k], out, depth + 1); });
  return out;
}
const DIR = /^(n|s|e|w|ne|nw|se|sw|north|south|east|west)$/;
function normText(t){ return low(t).replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim(); }
/* "600 West Church Street, Collierville" → ['600', 'church'] */
function addrKey(a){
  const w = normText(s(a).split(',')[0]).split(' ').filter(Boolean);
  if (w.length < 2 || !/^\d{2,6}$/.test(w[0])) return null;
  const st = w.slice(1).find(x => !DIR.test(x) && x.length >= 3);
  return st ? [w[0], st] : null;
}

/* the CRM's people and jobs → { addrs, domains, pos[], streets[] } */
function knownIndex(d){
  d = d || {};
  const dead = {}; arr(d.gc_deleted_projects).forEach(x => { dead[s(x)] = 1; });
  const addrs = {}, domains = {}, pos = {}, streets = [];
  const add = e => { e = low(e); if (!e || OURS.test(e)) return; addrs[e] = 1; const dm = domainOf(e); if (dm && !FREEMAIL.test(dm)) domains[baseDomain(dm)] = 1; };
  ['customers', 'subs', 'vendors', 'gc_claims', 'users'].forEach(k => Object.keys(emailsIn(arr(d[k]), {})).forEach(add));
  arr(d.projects).forEach(p => {
    if (!p || !p.id || dead[s(p.id)] || p.deleted === true) return;
    Object.keys(emailsIn(p, {})).forEach(add);
    [p.autoPO, p.po, p.poNumber].forEach(x => { x = low(x).replace(/\s+/g, ''); if (x.length >= 2) pos[x] = 1; });
    [p.address, p.jobAddress, p.street, p.siteAddress].forEach(a => { const k = addrKey(a); if (k) streets.push(k); });
  });
  return { addrs, domains, pos: Object.keys(pos), streets };
}
function mentionsJob(text, I){
  if (!I) return '';
  const raw = s(text);
  const po = /\bP\.?O\.?\s*(?:#|no\.?|number)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9-]{1,24})\b/gi; let m;
  while ((m = po.exec(raw))) { const v = low(m[1]).replace(/\s+/g, ''); if (I.pos.indexOf(v) >= 0) return 'names our PO ' + m[1]; }
  if (!I.streets.length) return '';
  const w = normText(raw).split(' ');
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^\d{2,6}$/.test(w[i])) continue;
    const next = w.slice(i + 1, i + 4).filter(x => !DIR.test(x));
    const hit = I.streets.find(k => k[0] === w[i] && next[0] === k[1]);
    if (hit) return 'names our job at ' + hit[0] + ' ' + hit[1];
  }
  return '';
}

/* ── lists ── */
function cleanEntry(v){
  v = low(v).replace(/^mailto:/, '').replace(/^\*?@/, '').replace(/^\*\./, '');
  if (!v) return '';
  const ph = phone10(v); if (/^[\d\s().+-]+$/.test(v) && ph.length === 10) return ph;
  if (/^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return v;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return v;
  return '';
}
function cleanLists(o){
  o = o && typeof o === 'object' ? o : {};
  const one = (l, block) => Array.from(new Set(arr(typeof l === 'string' ? s(l).split(/[\s,;]+/) : l).map(cleanEntry).filter(Boolean)))
    .filter(x => !(block && (FREEMAIL.test(x) || /grayco-cs\.com$/.test(x)))).slice(0, 500);   /* never block all of gmail.com, or ourselves */
  const out = { allow: one(o.allow, false), block: one(o.block, true) };
  if (s(o.by)) out.by = low(o.by); if (s(o.at)) out.at = s(o.at);
  return out;
}
function listHit(list, email, phone){
  const e = low(email), dm = domainOf(e), ph = phone10(phone);
  for (const x of arr(list)) {
    if (ph && x === ph) return x;
    if (!e) continue;
    if (x === e) return x;
    if (x.indexOf('@') < 0 && dm && (dm === x || dm.endsWith('.' + x))) return x;
  }
  return '';
}

/* ── one e-mail ── */
function refsOf(H){ return (s(H['in-reply-to']) + ' ' + s(H['references'])).match(/<[^<>\s]+>/g) || []; }
function sentIndex(rows){
  const mids = {}, to = {};
  arr(rows).forEach(r => { if (!r || r.dir === 'in') return; if (s(r.mid)) mids[low(r.mid)] = 1; arr(r.to).concat(arr(r.cc)).forEach(e => { e = low(e); if (e && !OURS.test(e)) to[e] = 1; }); });
  return { mids, to };
}
function replyToUs(mail, sent){
  const H = mail.headers || {};
  const refs = refsOf(H).map(low);
  if (refs.some(r => /@(in\.)?grayco-cs\.com>$/.test(r) || /@(resend\.(dev|com)|[a-z0-9.-]*amazonses\.com)>$/.test(r))) return 'answers one of our e-mails';
  if (sent && refs.some(r => sent.mids[r])) return 'answers one of our e-mails';
  if (sent && sent.to[low(mail.from && mail.from.email)]) return 'we have e-mailed this address';
  return '';
}
function mailText(mail){ return (s(mail.subject) + '\n' + s(mail.text)).slice(0, 20000); }
function linkBlob(mail){ return s(mail.html).slice(0, 200000) + '\n' + s(mail.text).slice(0, 40000); }

/* every reason it is NOT spam (the first one wins) — '' when none */
function safeReason(mail, ctx){
  ctx = ctx || {};
  const from = low(mail.from && mail.from.email), dm = domainOf(from), H = mail.headers || {};
  if (!from) return 'no sender';
  if (OURS.test(from)) return 'GrayCo address';
  if ((ctx.rcpt || []).some(x => /^(invoices|receipts|estimates|orders)@(in\.)?grayco-cs\.com$/.test(low(x)))) return 'invoices@ / receipts@ mail';
  /* a plan room's own invite / notice (its no-reply or notice sender, or bid words) — a plan-room salesperson selling a
     subscription is read like anyone else */
  if ((PLANROOM.test(dm) || /buildingconnected|planhub|aandbplanroom|isqft|constructconnect|procore|smartbidnet/i.test(s(H['x-mailer']) + ' ' + s(H['list-id'])))
    && (/^(no-?reply|do-?not-?reply|notifications?|notice|invites?|invitations?|bids?|bidding|alerts?|support|planroom|projects?|team)([._+-]|@)/i.test(from) || NEED[3].test(mailText(mail)))) return 'plan room / bid board';
  if (GOV.test(dm)) return 'government sender';
  if (INSURANCE.test(dm)) return 'insurance carrier / adjuster';
  const I = ctx.known;
  if (I && I.addrs[from]) return 'in the CRM (' + from + ')';
  if (I && dm && !FREEMAIL.test(dm) && I.domains[baseDomain(dm)]) return 'company in the CRM (' + baseDomain(dm) + ')';
  const rp = replyToUs(mail, ctx.sent); if (rp) return rp;
  const job = mentionsJob(mailText(mail), I); if (job) return job;
  /* a plan-room invite forwarded or sent "via" a board (the GC's own address, the board's links) */
  if (/\b(buildingconnected|planhub|a&b planroom|aandbplanroom|isqft|constructconnect|smartbidnet|pipelinesuite|procore)\b/i.test(linkBlob(mail)) && NEED[3].test(mailText(mail))) return 'bid invitation (plan room)';
  return '';
}
function score(text, opts){
  opts = opts || {};
  const reasons = []; let n = 0, offer = 0;
  PITCH.forEach(p => { if (p[0].test(text)) { n += p[1]; reasons.push(p[2]); if (p[1] >= 2) offer++; } });
  const blob = s(opts.blob) + '\n' + s(opts.headersText);
  if (TOOLS.test(blob)) { n += 2; reasons.push('sent with a sales tool (' + (TOOLS.exec(blob) || [''])[0] + ')'); }
  if (CALENDAR.test(blob) || CALENDAR.test(text)) { n += 2; reasons.push('demo calendar link'); offer++; }
  if (OPTOUT.test(text) && (n > 0 || opts.text)) { n += 1; reasons.push('opt-out footer'); }
  if (opts.cold) { n += 2; reasons.push('cold e-mail to replies@ (answers nothing we sent)'); }
  if (opts.fakeRe) { n += 1; reasons.push('"Re:" without a thread'); }
  let need = 0; NEED.forEach(r => { if (r.test(text)) need++; });
  if (need) { n -= Math.min(6, need * 2); reasons.push('customer / bid / claim words (−' + Math.min(6, need * 2) + ')'); }
  return { score: n, offer, reasons };
}
/* the rules' verdict: a score of 3+ with at least one real offer (or a sales tool / block) */
function rulesSay(sc){ return sc.score >= 3 && sc.offer >= 1; }

const AI_TOOL = {
  name: 'classify_inbound', strict: true,
  description: 'Say whether this message is an unsolicited vendor sales pitch to GrayCo.',
  input_schema: { type: 'object', additionalProperties: false, required: ['verdict', 'category', 'confidence', 'reason'], properties: {
    verdict: { type: 'string', enum: ['vendor_solicitation', 'legitimate', 'unsure'] },
    category: { type: 'string', enum: ['software_saas', 'marketing_seo_web', 'lead_generation', 'financing_factoring', 'staffing_outsourcing', 'ai_tools', 'partnership', 'other_sales', 'customer_or_lead', 'bid_invitation', 'subcontractor_or_supplier', 'insurance_or_claim', 'invoice_or_billing', 'job_related', 'other_legitimate'] },
    confidence: { type: 'number', description: '0 to 1' },
    reason: { type: 'string', description: 'one short sentence' } } }
};
function aiPrompt(kind, m){
  return 'GrayCo Construction Services is a roofing, insurance restoration, residential and commercial contractor in Bartlett, TN (Memphis metro). '
    + 'Decide if this inbound ' + kind + ' is an UNSOLICITED VENDOR SALES PITCH to GrayCo: someone selling GrayCo software / SaaS / CRM / apps, marketing, SEO, '
    + 'web design, lead generation, "book a demo" / "quick call" requests, partnerships, financing / factoring / business loans, staffing / virtual assistants, '
    + 'AI tools, or a cold sales sequence follow-up. These are vendor_solicitation.\n'
    + 'They are LEGITIMATE (never vendor_solicitation): a homeowner or business asking for work, a quote or an estimate; a GC, owner or plan room inviting '
    + 'GrayCo to bid; a subcontractor or material supplier offering construction labor, materials or prices for jobs; an insurance carrier, adjuster or '
    + 'claim platform; an invoice, statement or order confirmation; anything about an existing job; a job seeker. If in doubt, say unsure.\n'
    + 'Call the classify_inbound tool once.\n\n' + m;
}
async function aiVerdict(kind, m){
  const ai = _D.ai(); if (!ai || !ai.ready || !ai.ready()) return null;
  try {
    const r = await ai.ask({ model: env('SALESSPAM_AI_MODEL') || 'claude-haiku-5-5', maxTokens: 300, effort: false, timeoutMs: parseInt(env('SALESSPAM_AI_TIMEOUT_MS') || '9000', 10),
      tool: AI_TOOL, content: [{ type: 'text', text: aiPrompt(kind, m) }] });
    const o = r && r.ok && r.out;
    if (!o || ['vendor_solicitation', 'legitimate', 'unsure'].indexOf(o.verdict) < 0) return null;
    const c = Number(o.confidence);
    return { verdict: o.verdict, category: s(o.category).slice(0, 40), confidence: isFinite(c) ? Math.max(0, Math.min(1, c)) : 0, reason: s(o.reason).slice(0, 200) };
  } catch (e) { return null; }
}
function decide(sc, ai){
  if (ai && ai.verdict === 'vendor_solicitation' && ai.confidence >= 0.7) return { spam: true, by: 'ai' };
  if (ai && ai.verdict === 'legitimate' && ai.confidence >= 0.6) return { spam: false, by: 'ai' };
  return { spam: rulesSay(sc), by: 'rules' };
}

/* ctx: { route: 'leads'|'bids'|'replies'|'claims', rcpt: [], known, sent, lists } — the store parts are loaded when missing */
async function context(ctx){
  ctx = Object.assign({}, ctx || {});
  if (!ctx.lists) { try { ctx.lists = cleanLists(await _D.kvGet(KV_LISTS)); } catch (e) { ctx.lists = cleanLists(null); } }
  if (!ctx.known) ctx.known = knownIndex(await _D.crmData());
  if (!ctx.sent) ctx.sent = sentIndex(await _D.sentRows());
  return ctx;
}
async function classifyMail(mail, ctx){
  if (env('SALESSPAM_OFF') === '1') return { spam: false, why: 'off' };
  ctx = await context(ctx);
  const from = low(mail.from && mail.from.email);
  const allow = listHit(ctx.lists.allow, from); if (allow) return { spam: false, safe: 'allow list (' + allow + ')' };
  const block = listHit(ctx.lists.block, from); if (block) return { spam: true, by: 'block', score: 99, reasons: ['block list (' + block + ')'] };
  const safe = safeReason(mail, ctx); if (safe) return { spam: false, safe };
  const H = mail.headers || {}, text = mailText(mail);
  const toReplies = (ctx.rcpt || []).some(x => /^replies@(in\.)?grayco-cs\.com$/.test(low(x)));
  const hasThread = refsOf(H).length > 0;
  const headersText = Object.keys(H).filter(k => /^(x-|list-|feedback-id|message-id|return-path|received)/.test(k)).map(k => k + ': ' + H[k]).join('\n');
  const sc = score(text, { blob: linkBlob(mail), headersText, cold: toReplies && !hasThread, fakeRe: /^\s*re:/i.test(s(mail.subject)) && !hasThread });
  if (sc.score < 1) return { spam: false, score: sc.score, reasons: sc.reasons };
  const ai = await aiVerdict('e-mail', 'To: ' + (ctx.route || '') + '@ (' + (ctx.rcpt || []).slice(0, 4).join(', ') + ')\nFrom: ' + s(mail.from && mail.from.name) + ' <' + from + '>\nSubject: ' + s(mail.subject)
    + '\nIn-Reply-To: ' + (hasThread ? 'yes' : 'none') + '\n\n' + s(mail.text).slice(0, 6000));
  const d = decide(sc, ai);
  return { spam: d.spam, by: d.by, score: sc.score, reasons: sc.reasons, ai };
}
/* a text from a number the CRM does not know (missed-call.js checks who it is first) */
async function classifyText(body, ph, ctx){
  if (env('SALESSPAM_OFF') === '1') return { spam: false, why: 'off' };
  ctx = Object.assign({}, ctx || {});
  if (!ctx.lists) { try { ctx.lists = cleanLists(await _D.kvGet(KV_LISTS)); } catch (e) { ctx.lists = cleanLists(null); } }
  const allow = listHit(ctx.lists.allow, '', ph); if (allow) return { spam: false, safe: 'allow list (' + allow + ')' };
  const block = listHit(ctx.lists.block, '', ph); if (block) return { spam: true, by: 'block', score: 99, reasons: ['block list (' + block + ')'] };
  const text = s(body).slice(0, 4000);
  if (ctx.known) { const j = mentionsJob(text, ctx.known); if (j) return { spam: false, safe: j }; }
  const sc = score(text, { blob: text, text: true });
  if (sc.score < 1) return { spam: false, score: sc.score, reasons: sc.reasons };
  const ai = await aiVerdict('text message', 'From: ' + ph + '\n\n' + text);
  const d = decide(sc, ai);
  return { spam: d.spam, by: d.by, score: sc.score, reasons: sc.reasons, ai };
}

/* ── the 🗑 Filtered list ── */
function fresh(list, nowMs){ const cut = nowMs - KEEP_DAYS * 86400000; return arr(list).filter(x => x && Date.parse(s(x.at)) >= cut); }
async function bump(channel){
  const day = centralDay(_D.now());
  try { await _D.kvCas(KV_COUNT, v => { const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; const days = o.days && typeof o.days === 'object' ? o.days : {};
    const d = days[day] = days[day] || { e: 0, t: 0 }; if (channel === 'text') d.t = (d.t || 0) + 1; else d.e = (d.e || 0) + 1;
    const keys = Object.keys(days).sort(); while (keys.length > 60) delete days[keys.shift()]; o.days = days; o.last = new Date(_D.now()).toISOString(); return o; }); } catch (e) {}
}
/* keep one filtered message (the same Resend e-mail / Twilio text once) */
async function keep(rec){
  const at = new Date(_D.now()).toISOString();
  const item = Object.assign({ at }, rec, { text: s(rec.text).slice(0, TEXT_MAX), subject: s(rec.subject).slice(0, 300) });
  let added = false;
  await _D.kvCas(KV_ITEMS, v => {
    const l = fresh(v, _D.now());
    if (l.some(x => x.id === item.id)) return arr(v).length === l.length ? undefined : l;
    added = true; return l.concat([item]).slice(-MAX_ITEMS);
  });
  if (added) await bump(item.channel);
  return { ok: true, id: item.id, added };
}
function idFor(parts){ return 'ss_' + require('crypto').createHash('sha256').update(parts.map(s).join('|')).digest('hex').slice(0, 20); }
/* the e-mail as the CRM will need it to run it again (Resend's id; the text too, should Resend have let it go) */
function mailRecord(mail, data, route, verdict){
  const d = data || {};
  return { id: idFor(['email', mail.messageId || mail.id || (low(mail.from && mail.from.email) + s(mail.subject) + s(mail.date))]), channel: 'email', route,
    from: low(mail.from && mail.from.email), fromName: s(mail.from && mail.from.name).slice(0, 80), to: arr(mail.to).map(x => low(x && x.email)).filter(Boolean).slice(0, 8),
    subject: s(mail.subject), text: s(mail.text), date: s(mail.date), files: arr(mail.files).map(f => s(f && f.name)).slice(0, 10),
    score: verdict.score, reasons: arr(verdict.reasons).slice(0, 8), by: verdict.by || 'rules', ai: verdict.ai || null,
    evt: { type: 'email.received', data: { email_id: s(mail.id), to: arr(d.to).length ? d.to : arr(mail.to).map(x => x.email), cc: arr(d.cc), from: s(mail.from && mail.from.name) ? mail.from.name + ' <' + mail.from.email + '>' : low(mail.from && mail.from.email),
      subject: s(mail.subject), created_at: s(mail.date), message_id: s(mail.messageId), headers: mail.headers || {} } } };
}
function textRecord(p, verdict){
  const ph = phone10(p.From);
  return { id: idFor(['text', s(p.MessageSid || p.SmsSid) || (ph + s(p.Body))]), channel: 'text', route: 'text', from: ph, fromName: '', to: [phone10(p.To)], subject: 'Text from ' + ph,
    text: s(p.Body), score: verdict.score, reasons: arr(verdict.reasons).slice(0, 8), by: verdict.by || 'rules', ai: verdict.ai || null,
    sms: { From: s(p.From), To: s(p.To), Body: s(p.Body), MessageSid: s(p.MessageSid || p.SmsSid) } };
}
async function list(){ return fresh(await _D.kvGet(KV_ITEMS), _D.now()).slice().sort((a, b) => s(b.at).localeCompare(s(a.at))); }
async function take(id){
  let got = null;
  await _D.kvCas(KV_ITEMS, v => { const l = arr(v), i = l.findIndex(x => x && x.id === id); if (i < 0) return undefined; got = l[i]; l.splice(i, 1); return l; });
  return got;
}
async function peek(id){ return arr(await _D.kvGet(KV_ITEMS)).find(x => x && x.id === id) || null; }
async function lists(){ return cleanLists(await _D.kvGet(KV_LISTS)); }
async function saveLists(o, by){
  const out = cleanLists(Object.assign({}, o, { by, at: new Date(_D.now()).toISOString() }));
  await _D.kvCas(KV_LISTS, () => out);
  return out;
}
async function allow(entry, by){
  const e = cleanEntry(entry); if (!e) return null;
  let out = null;
  await _D.kvCas(KV_LISTS, v => { const c = cleanLists(v); c.allow = Array.from(new Set(c.allow.concat([e]))); c.block = c.block.filter(x => x !== e); c.by = low(by); c.at = new Date(_D.now()).toISOString(); out = cleanLists(c); return out; });
  return out;
}
async function counts(){
  const v = (await _D.kvGet(KV_COUNT)) || {}, days = v.days || {}, today = centralDay(_D.now());
  let week = { e: 0, t: 0 };
  for (let i = 0; i < 7; i++) { const d = days[centralDay(_D.now() - i * 86400000)]; if (d) { week.e += d.e || 0; week.t += d.t || 0; } }
  const t = days[today] || { e: 0, t: 0 };
  return { today: { e: t.e || 0, t: t.t || 0 }, week, last: s(v.last) };
}
/* the 🩺 CRM health line */
function healthText(c){
  const t = c.today || {}, w = c.week || {};
  const n = (k, one, many) => k === 1 ? '1 ' + one : k + ' ' + many;
  return n(t.e || 0, 'sales e-mail', 'sales e-mails') + ' filtered today' + (t.t ? ' · ' + n(t.t, 'sales text', 'sales texts') : '') + ' (' + ((w.e || 0) + (w.t || 0)) + ' in the last 7 days) — ⚙ Admin → 🗑 Filtered (sales/spam).';
}

module.exports = { KV_ITEMS, KV_LISTS, KV_COUNT, KEEP_DAYS, classifyMail, classifyText, context, knownIndex, sentIndex, safeReason, score, rulesSay, mentionsJob, replyToUs,
  cleanLists, cleanEntry, listHit, keep, mailRecord, textRecord, list, take, peek, lists, saveLists, allow, counts, healthText, domainOf, baseDomain, AI_TOOL, _D };
