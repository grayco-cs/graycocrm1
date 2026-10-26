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
   is in the admins' alert — one e-mail per new bid, at once (patch LA: bid-inbox.js afterStore →
   _lib/bid-portal.js, _lib/bid-alerts.js); the bid date is read with _lib/bid-due.js; every
   run also creates the drafts that waited for the portal to be set up.
   Every id seen is remembered ("gc_bid_watch_seen"), so nothing is added
   twice. A source that needs a login, or whose terms forbid automated reading,
   has NO adapter here: its e-mail alerts go to leads@ instead (docs/LEAD-INBOX.md).
   Nothing is ever made up: a page that cannot be read, or reads as empty, is
   reported in the CRM ("Shelby County: page changed — 0 bids read"), never filled in.

   BuildingConnected (optional): with BC_CLIENT_ID, BC_CLIENT_SECRET and
   BC_REFRESH_TOKEN set, the opportunities on GrayCo's Bid Board are read
   (read only, Autodesk Platform Services, 3-legged OAuth, scope data:read).
   Until then, BuildingConnected's invitation e-mails to leads@ cover it.
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */

const crypto = require('crypto');
const L = require('./bid-inbox.js')._lib;
const BD = require('./_lib/bid-due.js');
const { env, s, low, arr, nowIso, sha256, sb, kvGet, kvCas, kvPut, upsert, itemId, isoDay, decodeEntities, htmlToText, DEFAULT_SETTINGS, KV, KV_SET } = L;

const UA = 'GrayCoBidWatch/1.0 (+https://crm.grayco-cs.com; leads@grayco-cs.com; GrayCo Construction Services, Bartlett TN)';
const KV_SEEN = 'gc_bid_watch_seen', KV_STATUS = 'gc_bid_watch_status';
const PAUSE_MS = 1500, TIMEOUT_MS = 10000, MAX_PAGE = 3 * 1024 * 1024, CONCURRENCY = 4;   /* patch BW2: 10 s per page; sources on different sites are read 4 at a time, the same site never twice at once */

/* ── the sources ──────────────────────────────────────────────────────────────
   auto:true  → read here (public page / feed, no login).
   auto:false → e-mail alerts to leads@ (login needed, or automated reading not allowed);
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
  /* patch BW2: more public buyers on CivicPlus "Bid Postings" pages (Bids.aspx?bidID=n). These addresses follow the CivicPlus pattern
     DeSoto County uses but could NOT be fetched from the build container (outbound network blocked), so they are marked unverified:
     the Bids screen shows the first real result for each (bids read, or "unreachable" / "no solicitations found"). */
  { id: 'gmsd', name: 'Germantown Municipal School District — bids', label: 'Germantown Schools', owner: 'Germantown Municipal School District', city: 'Germantown', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.gmsdk12.org/Bids.aspx', unverified: true },
  { id: 'collierville-schools', name: 'Collierville Schools — bids', label: 'Collierville Schools', owner: 'Collierville Schools', city: 'Collierville', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.colliervilleschools.org/Bids.aspx', unverified: true },
  { id: 'bartlett-schools', name: 'Bartlett City Schools — bids', label: 'Bartlett City Schools', owner: 'Bartlett City Schools', city: 'Bartlett', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.bartlettschools.org/Bids.aspx', unverified: true },
  { id: 'arlington-schools', name: 'Arlington Community Schools — bids', label: 'Arlington Schools', owner: 'Arlington Community Schools', city: 'Arlington', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.acsk12.org/Bids.aspx', unverified: true },
  { id: 'millington-schools', name: 'Millington Municipal Schools — bids', label: 'Millington Schools', owner: 'Millington Municipal Schools', city: 'Millington', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.millingtonmunicipalschools.org/Bids.aspx', unverified: true },
  { id: 'lakeland-schools', name: 'Lakeland School System — bids', label: 'Lakeland Schools', owner: 'Lakeland School System', city: 'Lakeland', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.lakelandschools.org/Bids.aspx', unverified: true },
  { id: 'desoto-schools', name: 'DeSoto County Schools — bids', label: 'DeSoto County Schools', owner: 'DeSoto County Schools', city: 'Hernando', state: 'MS',
    auto: true, kind: 'civic', url: 'https://www.desotocountyschools.org/Bids.aspx', unverified: true },
  { id: 'bartlett', name: 'City of Bartlett — bids', label: 'City of Bartlett', owner: 'City of Bartlett', city: 'Bartlett', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.cityofbartlett.org/Bids.aspx', unverified: true },
  { id: 'germantown', name: 'City of Germantown — bids', label: 'City of Germantown', owner: 'City of Germantown', city: 'Germantown', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.germantown-tn.gov/Bids.aspx', unverified: true },
  { id: 'collierville', name: 'Town of Collierville — bids', label: 'Town of Collierville', owner: 'Town of Collierville', city: 'Collierville', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.colliervilletn.gov/Bids.aspx', unverified: true },
  { id: 'arlington', name: 'Town of Arlington — bids', label: 'Town of Arlington', owner: 'Town of Arlington', city: 'Arlington', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.arlingtontn.gov/Bids.aspx', unverified: true },
  { id: 'lakeland', name: 'City of Lakeland — bids', label: 'City of Lakeland', owner: 'City of Lakeland', city: 'Lakeland', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.lakelandtn.gov/Bids.aspx', unverified: true },
  { id: 'millington', name: 'City of Millington — bids', label: 'City of Millington', owner: 'City of Millington', city: 'Millington', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.millingtontn.gov/Bids.aspx', unverified: true },
  { id: 'olive-branch-bids', name: 'City of Olive Branch — bids', label: 'Olive Branch', owner: 'City of Olive Branch', city: 'Olive Branch', state: 'MS',
    auto: true, kind: 'civic', url: 'https://www.obms.us/Bids.aspx', unverified: true },
  { id: 'horn-lake', name: 'City of Horn Lake — bids', label: 'Horn Lake', owner: 'City of Horn Lake', city: 'Horn Lake', state: 'MS',
    auto: true, kind: 'civic', url: 'https://www.hornlake.org/Bids.aspx', unverified: true },
  { id: 'hernando', name: 'City of Hernando — bids', label: 'Hernando', owner: 'City of Hernando', city: 'Hernando', state: 'MS',
    auto: true, kind: 'civic', url: 'https://www.hernandoms.org/Bids.aspx', unverified: true },
  { id: 'tipton-county', name: 'Tipton County — bids', label: 'Tipton County', owner: 'Tipton County Government', city: 'Covington', state: 'TN',
    auto: true, kind: 'civic', url: 'https://www.tiptonco.com/Bids.aspx', unverified: true },
  /* e-mail alerts only */
  { id: 'mlgw', name: 'MLGW — Bid Notification System / iSupplier', label: 'MLGW', auto: false, how: 'Register in MLGW\'s Bid Notification System (contracted services) and iSupplier Portal (materials); use leads@grayco-cs.com as the contact e-mail.' },
  { id: 'southaven', name: 'City of Southaven — Central Bidding', label: 'Southaven', auto: false, how: 'Free vendor account on Central Bidding (centralbidding.com), follow City of Southaven, notification e-mail leads@grayco-cs.com.' },
  { id: 'olive-branch', name: 'City of Olive Branch — bid notices', label: 'Olive Branch', auto: false, how: 'Follow the City of Olive Branch on Central Bidding (or its legal notices); notification e-mail leads@grayco-cs.com.' },
  { id: 'desoto-central', name: 'DeSoto County — Central Bidding documents', label: 'DeSoto County', auto: false, how: 'Follow DeSoto County on Central Bidding for bid packages; notification e-mail leads@grayco-cs.com.' },
  { id: 'arbuy', name: 'Arkansas — ARBuy / state eProcurement', label: 'State of AR', auto: false, how: 'Register (free) in ARBuy with your NIGP codes for roofing / building construction / repair; notification e-mail leads@grayco-cs.com.' },
  { id: 'ms-magic', name: 'Mississippi — MAGIC procurement', label: 'State of MS', auto: false, how: 'Register (free) as a MAGIC supplier with the construction / roofing product codes; notification e-mail leads@grayco-cs.com.' },
  { id: 'tn-edison', name: 'Tennessee — Edison supplier alerts', label: 'State of TN (CPO)', auto: false, how: 'Register in Edison and choose the UNSPSC codes for roofing / building repair; alerts go to leads@grayco-cs.com.' },
  { id: 'mscs-ionwave', name: 'MSCS — Ion Wave e-bid alerts', label: 'MSCS', auto: false, how: 'Register (free) at mscsprocurementservices.ionwave.net with the construction / roofing categories; e-mail leads@grayco-cs.com.' },
  { id: 'memphis-oracle', name: 'City of Memphis — supplier portal alerts', label: 'City of Memphis', auto: false, how: 'Register as a City of Memphis supplier (Become a Supplier) with the construction / roofing commodity codes; e-mail leads@grayco-cs.com.' },
  { id: 'shelby-notify', name: 'Shelby County — vendor registration', label: 'Shelby County', auto: false, how: 'Keep the county vendor registration (BRN + vendor number) current with the NIGP codes for roofing / building repair; e-mail leads@grayco-cs.com.' },
  { id: 'mscaa-opengov', name: 'MSCAA — OpenGov procurement portal', label: 'Memphis Airport (MSCAA)', auto: false, how: 'Follow the Memphis-Shelby County Airport Authority on OpenGov Procurement; notification e-mail leads@grayco-cs.com.' },
  /* patch BW: more local public buyers. Their listing pages were not verified from here, so they start as
     e-mail-alert sources; an admin adds a verified public page with "＋ Add a bid board". */
  { id: 'loc-bartlett', name: 'City of Bartlett — bids (find the vendor page)', label: 'City of Bartlett', auto: false, local: true, how: 'Find City of Bartlett\'s bid / purchasing page (search “City of Bartlett bids” or “City of Bartlett purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-germantown', name: 'City of Germantown — bids (find the vendor page)', label: 'City of Germantown', auto: false, local: true, how: 'Find City of Germantown\'s bid / purchasing page (search “City of Germantown bids” or “City of Germantown purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-collierville', name: 'Town of Collierville — bids (find the vendor page)', label: 'Town of Collierville', auto: false, local: true, how: 'Find Town of Collierville\'s bid / purchasing page (search “Town of Collierville bids” or “Town of Collierville purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-arlington', name: 'Town of Arlington — bids (find the vendor page)', label: 'Town of Arlington', auto: false, local: true, how: 'Find Town of Arlington\'s bid / purchasing page (search “Town of Arlington bids” or “Town of Arlington purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-lakeland', name: 'City of Lakeland — bids (find the vendor page)', label: 'City of Lakeland', auto: false, local: true, how: 'Find City of Lakeland\'s bid / purchasing page (search “City of Lakeland bids” or “City of Lakeland purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-millington', name: 'City of Millington — bids (find the vendor page)', label: 'City of Millington', auto: false, local: true, how: 'Find City of Millington\'s bid / purchasing page (search “City of Millington bids” or “City of Millington purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-bartlett-schools', name: 'Bartlett City Schools — bids (find the vendor page)', label: 'Bartlett City Schools', auto: false, local: true, how: 'Find Bartlett City Schools\'s bid / purchasing page (search “Bartlett City Schools bids” or “Bartlett City Schools purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-germantown-schools', name: 'Germantown Municipal School District — bids (find the vendor page)', label: 'Germantown Schools', auto: false, local: true, how: 'Find Germantown Municipal School District\'s bid / purchasing page (search “Germantown Municipal School District bids” or “Germantown Municipal School District purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-collierville-schools', name: 'Collierville Schools — bids (find the vendor page)', label: 'Collierville Schools', auto: false, local: true, how: 'Find Collierville Schools\'s bid / purchasing page (search “Collierville Schools bids” or “Collierville Schools purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-arlington-schools', name: 'Arlington Community Schools — bids (find the vendor page)', label: 'Arlington Schools', auto: false, local: true, how: 'Find Arlington Community Schools\'s bid / purchasing page (search “Arlington Community Schools bids” or “Arlington Community Schools purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-lakeland-schools', name: 'Lakeland School System — bids (find the vendor page)', label: 'Lakeland Schools', auto: false, local: true, how: 'Find Lakeland School System\'s bid / purchasing page (search “Lakeland School System bids” or “Lakeland School System purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-millington-schools', name: 'Millington Municipal Schools — bids (find the vendor page)', label: 'Millington Schools', auto: false, local: true, how: 'Find Millington Municipal Schools\'s bid / purchasing page (search “Millington Municipal Schools bids” or “Millington Municipal Schools purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-uofm', name: 'University of Memphis — bids (find the vendor page)', label: 'University of Memphis', auto: false, local: true, how: 'Find University of Memphis\'s bid / purchasing page (search “University of Memphis bids” or “University of Memphis purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-southwest-tn', name: 'Southwest Tennessee Community College — bids (find the vendor page)', label: 'Southwest TN CC', auto: false, local: true, how: 'Find Southwest Tennessee Community College\'s bid / purchasing page (search “Southwest Tennessee Community College bids” or “Southwest Tennessee Community College purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-uthsc', name: 'UT Health Science Center — bids (find the vendor page)', label: 'UTHSC', auto: false, local: true, how: 'Find UT Health Science Center\'s bid / purchasing page (search “UT Health Science Center bids” or “UT Health Science Center purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-tbr', name: 'Tennessee Board of Regents — bids (find the vendor page)', label: 'TN Board of Regents', auto: false, local: true, how: 'Find Tennessee Board of Regents\'s bid / purchasing page (search “Tennessee Board of Regents bids” or “Tennessee Board of Regents purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-mha', name: 'Memphis Housing Authority — bids (find the vendor page)', label: 'Memphis Housing Authority', auto: false, local: true, how: 'Find Memphis Housing Authority\'s bid / purchasing page (search “Memphis Housing Authority bids” or “Memphis Housing Authority purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-mata', name: 'MATA (Memphis Area Transit Authority) — bids (find the vendor page)', label: 'MATA', auto: false, local: true, how: 'Find MATA (Memphis Area Transit Authority)\'s bid / purchasing page (search “MATA (Memphis Area Transit Authority) bids” or “MATA (Memphis Area Transit Authority) purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-desoto-schools', name: 'DeSoto County Schools — bids (find the vendor page)', label: 'DeSoto County Schools', auto: false, local: true, how: 'Find DeSoto County Schools\'s bid / purchasing page (search “DeSoto County Schools bids” or “DeSoto County Schools purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-tipton-county', name: 'Tipton County — bids (find the vendor page)', label: 'Tipton County', auto: false, local: true, how: 'Find Tipton County\'s bid / purchasing page (search “Tipton County bids” or “Tipton County purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' },
  { id: 'loc-fayette-county', name: 'Fayette County — bids (find the vendor page)', label: 'Fayette County', auto: false, local: true, how: 'Find Fayette County\'s bid / purchasing page (search “Fayette County bids” or “Fayette County purchasing”) and register as a vendor with leads@grayco-cs.com for construction / roofing / repair. If its bid list is a public page, add it with “＋ Add a bid board” so the CRM reads it every few hours.' }
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
  /* LA: a labelled bid date ("Bid Opening: …", "Closes …", "Proposals due …"), with its time and time zone */
  const bd = BD.findDue(t); if (bd.due) return bd.due;
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
  if (st.allBids) return { ok: !bad.length, hits: hits.length ? hits : ['all public bids'], bad };   /* patch BW: "All public bids (no keyword filter)" */
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

/* ── patch BW: bid boards an admin adds in the CRM (Leads → Lead Inbox ⚙ → 🔎 Bid boards) ───────────
   Kept in the lead-inbox settings (the service-only store) as settings.custom = [{ id, name, label, url, kind,
   pattern, anyRow, city, state, how, on }]. Only the generic adapters read them (a "links" page or an RSS feed) — never code. */
function urlOk(u){
  let x; try { x = new URL(s(u)); } catch (e) { return false; }
  if (x.protocol !== 'https:' || x.username || x.password || (x.port && x.port !== '443')) return false;
  const h = low(x.hostname);
  if (!h || h === 'localhost' || /\.(local|internal|localhost|lan|home|corp)$/.test(h) || !/\./.test(h)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.indexOf(':') >= 0 || /^\[/.test(h)) return false;   /* no bare IP addresses */
  if (/(^|\.)netlify\.(app|com)$|(^|\.)supabase\.co$|(^|\.)grayco-cs\.com$/.test(h)) return false;   /* never our own services */
  return true;
}
function safeRe(p){
  p = s(p); if (!p) return null;
  if (p.length > 120 || /\([^)]*[+*][^)]*\)\s*[+*{]/.test(p)) return null;   /* no nested repeats */
  try { return new RegExp(p.replace(/^\/|\/[a-z]*$/g, ''), 'i'); } catch (e) { return null; }
}
function cleanCustom(x, old){
  x = x || {}; old = old || {};
  const kind = /^(links|rss|email)$/.test(s(x.kind)) ? s(x.kind) : 'links';
  const name = s(x.name).replace(/\s+/g, ' ').slice(0, 100);
  if (!name) return { err: 'Give the bid board a name (the agency).' };
  const url = s(x.url).slice(0, 400);
  if (kind !== 'email' && !urlOk(url)) return { err: 'The address must be a public https:// web page (not a log-in page, an IP address or one of our own sites).' };
  if (kind === 'email' && url && !urlOk(url)) return { err: 'The sign-up page must be an https:// address.' };
  if (kind === 'links' && s(x.pattern) && !safeRe(x.pattern)) return { err: 'The link pattern is not a simple pattern — leave it empty or use plain words like /bid/ or Bids.aspx.' };
  const st = s(x.state).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const id = /^c-[a-f0-9]{8}$/.test(s(old.id)) ? s(old.id) : 'c-' + crypto.randomBytes(4).toString('hex');
  return { src: { id, name, label: s(x.label).slice(0, 40) || name.slice(0, 40), url, kind, pattern: kind === 'links' ? s(x.pattern).slice(0, 120) : '', anyRow: kind === 'links' && !!x.anyRow,
    city: s(x.city).slice(0, 60), state: st, how: s(x.how).slice(0, 400), on: x.on !== false, addedBy: s(old.addedBy || x.addedBy).slice(0, 120), addedAt: s(old.addedAt) || nowIso(), updatedAt: nowIso() } };
}
function customSources(settings){
  return arr(settings && settings.custom).filter(c => c && c.id && c.name).map(c => ({
    id: c.id, name: c.name, label: c.label || c.name, owner: c.name, city: c.city || '', state: c.state || '', url: c.url, custom: true, on: c.on !== false,
    auto: c.kind === 'links' || c.kind === 'rss', kind: c.kind === 'rss' ? 'rss' : (c.kind === 'email' ? 'email' : 'links'),
    hrefRe: c.kind === 'links' ? safeRe(c.pattern) : null, anyRow: !!c.anyRow,
    how: c.how || (c.kind === 'email' ? 'Register with ' + c.name + (c.url ? ' (' + c.url + ')' : '') + ' for bid notices; notification e-mail leads@grayco-cs.com.' : '') }));
}
/* "Test read": one look now, nothing stored — what the watcher WOULD find on that page */
async function testRead(b, opts){
  opts = opts || {}; const f = opts.fetchImpl;
  const c = cleanCustom(Object.assign({}, b, { name: s(b && b.name) || 'Test' }));
  if (c.err) return { ok: false, why: c.err };
  const src = customSources({ custom: [c.src] })[0];
  if (!src.auto) return { ok: false, why: 'E-mail-alert boards are not read — nothing to test.' };
  const u = new URL(src.url);
  const rb = await get(u.origin + '/robots.txt', {}, f);
  if (!robotsAllows(rb.status === 200 ? rb.text : '', u.pathname + u.search)) return { ok: false, robots: false, why: 'This site\'s robots.txt asks robots not to read that page. Choose "E-mail alerts only" and sign up there instead.' };
  const page = await get(src.url, {}, f);
  if (page.status !== 200) return { ok: false, robots: true, http: page.status, why: page.why || ('The site answered ' + page.status + (page.status === 401 || page.status === 403 ? ' — it needs a log-in. Choose "E-mail alerts only".' : '.')) };
  if (/<input[^>]+type=["']?password/i.test(page.text) && (page.text.match(/<a\b/gi) || []).length < 15) return { ok: false, robots: true, http: 200, why: 'That page is a log-in page. Choose "E-mail alerts only".' };
  const items = src.kind === 'rss' ? parseRss(page.text) : parseLinks(page.text, src.url, { hrefRe: src.hrefRe, anyRow: src.anyRow });
  const settings = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
  const out = items.slice(0, 40).map(it => { const mw = matchWords(it.title + ' ' + (it.context || ''), settings); return { title: it.title, number: it.number, due: it.due, url: it.url, closed: it.status === 'closed' || expired(it.due), matched: mw.ok, words: mw.hits.slice(0, 4) }; });
  return { ok: true, http: 200, robots: true, parsed: items.length, matched: out.filter(x => x.matched && !x.closed).length, items: out,
    why: items.length ? '' : 'The page was read but no bids were recognised on it. Try the page that lists the bids itself, a link pattern, or "every row with a PDF and a date".' };
}

/* ── patch BW: SAM.gov (federal) — the official public API with a free api.data.gov key (env SAM_API_KEY) ─────
   Once a day (Central): solicitations / presolicitations posted since the last look whose place of performance is in
   the chosen states and whose NAICS is one of ours. One call per state (a key with no SAM.gov role gets about 10 calls
   a day). The key is never stored, logged or shown. */
/* the key: entered in the CRM (🔎 Bid boards, admins) and kept sealed in the service-only gc_admin_kv, else env SAM_API_KEY */
function samSealKey(){ return crypto.createHash('sha256').update('gc-sam:' + (env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY'))).digest(); }
function samSeal(txt){ const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', samSealKey(), iv); const enc = Buffer.concat([c.update(txt, 'utf8'), c.final()]); return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.'); }
function samUnseal(v){ try { const [iv, tag, enc] = s(v).split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', samSealKey(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); } catch (e) { return ''; } }
async function samKey(){
  const st = await adminKv('srv_sam_key');
  const k = st && st.sealed ? samUnseal(st.sealed) : '';
  if (k) return { key: k, from: 'crm', last4: k.slice(-4), at: s(st.at), by: s(st.by) };
  if (env('SAM_API_KEY')) return { key: env('SAM_API_KEY'), from: 'env', last4: env('SAM_API_KEY').slice(-4) };
  return { key: '', from: '', last4: '' };
}
async function samKeySet(key, by){
  key = s(key);
  if (!key) return adminKv('srv_sam_key', { sealed: '', last4: '', at: nowIso(), by: s(by) });
  if (!/^[A-Za-z0-9_\-]{20,80}$/.test(key)) return false;
  return adminKv('srv_sam_key', { sealed: samSeal(key), last4: key.slice(-4), at: nowIso(), by: s(by) });
}
/* "Test": one small call with the key, nothing kept */
async function samTest(key, opts){
  opts = opts || {}; const f = opts.fetchImpl || fetch;
  key = s(key) || (await samKey()).key; if (!key) return { ok: false, why: 'No SAM.gov key yet.' };
  const q = 'https://api.sam.gov/opportunities/v2/search?limit=1&postedFrom=' + encodeURIComponent(mdy(chiDay((opts.now || Date.now()) - 7 * 86400000))) + '&postedTo=' + encodeURIComponent(mdy(chiDay(opts.now))) + '&state=TN';
  try {
    const r = await f(q + '&api_key=' + encodeURIComponent(key), { headers: { Accept: 'application/json', 'User-Agent': UA } }); const j = await r.json().catch(() => null);
    if (r.ok) return { ok: true, total: (j && j.totalRecords) || 0 };
    return { ok: false, why: r.status === 401 || r.status === 403 ? 'SAM.gov refused this key.' : r.status === 429 ? 'SAM.gov says today\'s limit is used up (the key itself may be fine).' : 'SAM.gov answered ' + r.status + '.' };
  } catch (e) { return { ok: false, why: 'SAM.gov could not be reached.' }; }
}
const SAM_DEFAULT = { on: true, states: ['TN', 'MS', 'AR'], naics: ['236', '237', '238', '562910'] };   /* patch BW2: all construction NAICS 236xxx-238xxx */
function samSettings(settings){
  const x = Object.assign({}, SAM_DEFAULT, (settings && settings.sam) || {});
  x.states = arr(x.states).map(v => s(v).toUpperCase()).filter(v => /^[A-Z]{2}$/.test(v)).slice(0, 6);
  x.naics = arr(x.naics).map(v => s(v).replace(/\D/g, '')).filter(v => /^\d{2,6}$/.test(v)).slice(0, 20);
  if (!x.states.length) x.states = SAM_DEFAULT.states.slice(); if (!x.naics.length) x.naics = SAM_DEFAULT.naics.slice();
  return x;
}
function chiDay(t){ return new Date(t || Date.now()).toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).slice(0, 10); }
function mdy(day){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return m ? m[2] + '/' + m[3] + '/' + m[1] : ''; }
function samDue(v){ v = s(v); if (!v) return ''; const t = Date.parse(v); if (!isFinite(t)) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ''; return new Date(t).toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).slice(0, 16).replace(' ', 'T'); }
const SAM_TYPES = /^(solicitation|combined synopsis\/solicitation|presolicitation)$/i;
function samRecord(o){
  const pop = o.placeOfPerformance || {}, city = s(pop.city && pop.city.name), st = s(pop.state && pop.state.code).toUpperCase().slice(0, 2);
  const id = s(o.noticeId), agency = s(o.fullParentPathName).split('.').map(x => s(x)).filter(Boolean);
  const link = /^https:\/\/sam\.gov\//.test(s(o.uiLink)) ? s(o.uiLink) : (id ? 'https://sam.gov/opp/' + encodeURIComponent(id) + '/view' : '');
  const what = [s(o.type), o.naicsCode ? 'NAICS ' + s(o.naicsCode) : '', s(o.typeOfSetAsideDescription) ? 'Set-aside: ' + s(o.typeOfSetAsideDescription) : ''].filter(Boolean);
  return {
    id: itemId('sam|' + id), title: s(o.title).slice(0, 200) || 'Federal opportunity', source: 'SAM.gov (federal)', sourceKind: 'public_bid', sourceRef: 'SAM.gov — federal contract opportunities', type: 'government',
    owner: agency.slice(-1)[0] || 'U.S. government', gc: '', address: '', city, state: st, zip: s(pop.zip).slice(0, 10), bidDue: samDue(o.responseDeadLine), preBid: '', trades: [],
    scope: what.concat(agency.length ? [agency.join(' › ')] : []).join(' · ').slice(0, 300),
    bidNumber: s(o.solicitationNumber), contact: { name: '', email: '', phone: '' }, estValue: null,
    plansLinks: link ? [{ url: link, label: 'Notice & documents (SAM.gov)', board: 'Government', host: 'sam.gov' }] : [],
    files: [], emails: [], emailIds: [], watchKeys: ['w:sam-gov:' + id], notes: ['Found on SAM.gov (federal). ' + what.join(' · ') + '.'],
    matchWords: o.naicsCode ? ['NAICS ' + s(o.naicsCode)] : [], origin: 'watch', addendum: 0, samId: id
  };
}
async function samRun(settings, prev, opts){
  opts = opts || {}; const f = opts.fetchImpl || fetch, key = opts.key || env('SAM_API_KEY');
  const cfg = samSettings(settings), today = chiDay(opts.now), out = { ok: true, records: [], parsed: 0, why: '', day: today, calls: 0 };
  const from = /^\d{4}-\d{2}-\d{2}$/.test(s(prev && prev.lastDay)) ? s(prev.lastDay) : chiDay((opts.now || Date.now()) - 14 * 86400000);
  const st = Object.assign({}, DEFAULT_SETTINGS, settings || {}), seenId = {};
  for (const state of cfg.states) {
    const q = 'https://api.sam.gov/opportunities/v2/search?limit=1000&postedFrom=' + encodeURIComponent(mdy(from)) + '&postedTo=' + encodeURIComponent(mdy(today)) + '&state=' + state;
    let r, j = null;
    try { out.calls++; r = await f(q + '&api_key=' + encodeURIComponent(key), { headers: { Accept: 'application/json', 'User-Agent': UA } }); j = await r.json().catch(() => null); }
    catch (e) { out.ok = false; out.why = 'SAM.gov could not be reached'; break; }
    if (!r.ok) { out.ok = false; out.why = r.status === 401 || r.status === 403 ? 'SAM.gov refused the key — check SAM_API_KEY on Netlify' : r.status === 429 ? 'SAM.gov daily limit reached — it tries again tomorrow' : 'SAM.gov answered ' + r.status; break; }
    arr(j && j.opportunitiesData).forEach(o => {
      out.parsed++;
      if (!o || !s(o.noticeId) || seenId[o.noticeId] || low(o.active) === 'no' || !SAM_TYPES.test(s(o.type))) return;
      const n = s(o.naicsCode).replace(/\D/g, ''); if (!cfg.naics.some(w => n.indexOf(w) === 0)) return;
      if (arr(st.exclude).some(w => w && wordRe(low(w)).test(s(o.title)))) return;
      const rec = samRecord(o); if (expired(rec.bidDue)) return;
      seenId[o.noticeId] = 1; out.records.push(rec);
    });
  }
  return out;
}

/* ── one run ───────────────────────────────────────────────────────────────── */
async function runAll(opts){
  opts = opts || {};
  const t0 = Date.now(), budget = opts.budgetMs || 8 * 60000, f = opts.fetchImpl;
  const settings = Object.assign({}, DEFAULT_SETTINGS, (await kvGet(KV_SET)) || {});
  const seen = (await kvGet(KV_SEEN)) || {}, status = (await kvGet(KV_STATUS)) || {};
  status.sources = status.sources || {};
  const robots = {}, records = [], summary = [];
  const list = SOURCES.filter(x => x.auto).concat(customSources(settings).filter(x => x.auto)).filter(x => !opts.only || x.id === opts.only);   /* patch BW: + the admins' own boards */
  const hostChain = {};   /* one request at a time per site, with a pause */
  const one = async (src0) => {
    if (Date.now() - t0 > budget) { summary.push({ id: src0.id, skipped: 'out of time this run' }); return; }
    const cfg = (settings.sources || {})[src0.id] || {};
    const prev = status.sources[src0.id] || {};
    if (cfg.on === false || src0.on === false) { status.sources[src0.id] = Object.assign({}, prev, { off: true }); return; }
    const src = Object.assign({}, src0, cfg.url && !src0.custom ? { url: cfg.url } : {});
    if (src.custom && !urlOk(src.url)) { status.sources[src.id] = { at: nowIso(), url: src.url, http: 0, parsed: 0, matched: 0, added: 0, why: 'not a public https address — edit it in 🔎 Bid boards' }; return; }
    const st = { at: nowIso(), url: src.url, http: 0, parsed: 0, matched: 0, added: 0, why: '', ok: false, unverified: !!src.unverified };
    let host = ''; try { host = new URL(src.url).host; } catch (e) {}
    const prevLink = hostChain[host] || Promise.resolve();
    let release; hostChain[host] = new Promise(r => { release = r; });
    await prevLink;
    try {
      const u = new URL(src.url);
      if (robots[u.host] === undefined) { const rb = await get(u.origin + '/robots.txt', {}, f); robots[u.host] = rb.status === 200 ? rb.text : ''; }
      if (!robotsAllows(robots[u.host], u.pathname + u.search)) { st.why = 'robots.txt asks robots not to read this page — use its e-mail alerts'; return; }
      const cond = {}; if (prev.etag && prev.url === src.url) cond['If-None-Match'] = prev.etag; if (prev.lastModified && prev.url === src.url) cond['If-Modified-Since'] = prev.lastModified;
      const page = await get(src.url, cond, f);
      let items = [];
      st.http = page.status;
      if (page.status === 304) { st.why = 'no change since the last look'; st.parsed = prev.parsed || 0; st.etag = prev.etag; st.lastModified = prev.lastModified; st.ok = true; }
      else if (page.status === 200) {
        items = src.kind === 'rss' ? parseRss(page.text) : src.kind === 'civic' ? parseCivicBids(page.text, src.url) : parseLinks(page.text, src.url, { hrefRe: src.hrefRe, anyRow: src.anyRow });
        if (src.kind === 'civic' && !items.length) items = parseLinks(page.text, src.url, {});   /* a CivicPlus page laid out differently */
        if (!items.length && src.kind === 'rss' && src.html) {   /* feed empty or switched off: the listing page */
          await new Promise(r => setTimeout(r, opts.pauseMs != null ? opts.pauseMs : PAUSE_MS));
          const p2 = await get(src.html, {}, f); if (p2.status === 200) items = parseCivicBids(p2.text, src.html);
        }
        st.etag = page.etag; st.lastModified = page.lastModified;
        st.parsed = items.length; st.ok = true;
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
    finally {
      status.sources[src.id] = st; summary.push({ id: src.id, http: st.http, parsed: st.parsed, matched: st.matched, why: st.why });
      setTimeout(release, opts.pauseMs != null ? opts.pauseMs : PAUSE_MS);
    }
  };
  /* limited concurrency: one failing source never stops the others (each has its own try/catch) */
  let nextIdx = 0;
  await Promise.all(Array.from({ length: Math.min(opts.concurrency || CONCURRENCY, list.length) }, async () => {
    while (nextIdx < list.length) { const src0 = list[nextIdx++]; try { await one(src0); } catch (e) { summary.push({ id: src0.id, why: 'error: ' + s(e && e.message) }); } }
  }));
  /* patch BW: SAM.gov once a day (Central), or now when asked for by name; the key from the CRM, else env SAM_API_KEY */
  const samK = (!opts.only || opts.only === 'sam-gov') ? await samKey().catch(() => ({ key: '' })) : { key: '' };
  if (samK.key && samSettings(settings).on !== false) {
    const ps = status.sources['sam-gov'] || {};
    if (opts.only === 'sam-gov' || ps.day !== chiDay(opts.now)) {
      const out = await samRun(settings, ps, { fetchImpl: f, now: opts.now, key: samK.key }).catch(e => ({ ok: false, why: s(e && e.message).replace(/api_key=[^&\s]+/g, 'api_key=…'), records: [], parsed: 0 }));
      const m = seen['sam-gov'] = seen['sam-gov'] || {};
      const fresh = out.records.filter(r => { const n = !m[r.samId]; m[r.samId] = m[r.samId] || nowIso().slice(0, 10); return n; });
      records.push.apply(records, fresh);
      status.sources['sam-gov'] = { at: nowIso(), http: out.ok ? 200 : 0, parsed: out.parsed, matched: fresh.length, added: 0, why: out.ok ? '' : out.why, day: out.ok ? out.day : ps.day, lastDay: out.ok ? out.day : ps.lastDay, calls: out.calls };
      summary.push({ id: 'sam-gov', parsed: out.parsed, matched: fresh.length, why: out.ok ? '' : out.why });
    }
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
/* patch BW */
exports.testRead = testRead; exports.samKey = samKey; exports.samKeySet = samKeySet; exports.samTest = samTest; exports.cleanCustom = cleanCustom; exports.customSources = customSources; exports.samSettings = samSettings; exports.SAM_DEFAULT = SAM_DEFAULT; exports.urlOk = urlOk;
exports._test = { samRun, samRecord, safeRe, urlOk, testRead, cleanCustom, customSources, chiDay, parseLinks, parseRss, parseCivicBids, robotsAllows, matchWords, toRecord, firstDue, numberOf, bcRecord, bcRun, seal, unseal, expired, UA };
