/* GrayCo marketing math (from patch MK, used by patch MKT) — ONE copy used by the CRM's 📣 Marketing tab (pasted into
   tail_MKT.js by build_MKT.sh) and by the server (_lib/mkt.js): lead sources, cost per lead / job, close rate, storms.
   Pure functions, no network, no DOM. Nothing here invents a number: every figure is counted from the records
   it is given, and anything it cannot count is reported as missing. */
(function(root, factory){
  var M = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = M;
  if (root && typeof root === 'object' && typeof root.document !== 'undefined') root.__gcMkCalc = M;
})(typeof self !== 'undefined' ? self : this, function(){
'use strict';

var CHANNELS = ['Google Ads', 'Facebook/Instagram Ads', 'TikTok', 'Google organic', 'Google Business Profile', 'Nextdoor', 'Referral', 'Yard sign', 'Repeat customer', 'Other'];
/* channels the numbers can also show (not in the "how did you hear" list: they come from lead services / imports) */
var EXTRA_CHANNELS = ['Angi/HomeAdvisor'];
var LEAD_SERVICES = ['Roof Ignite', 'Contractor Connection', 'Alacrity', 'Sedgwick', 'Thumbtack', 'Porch', 'Networx', 'Modernize', 'Bark'];

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var x = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function r2(x){ return Math.round(x * 100) / 100; }

/* ── 1. a clean source from whatever was typed / sent ─────────────────────────────────────── */
var SYSTEM = /^(quickbooks|qb|companycam|cc|estimate builder|estimate import|grayco|gray co|project|db|lead source|manual|crm|import|imported|none|n\/a|na|unknown|-|—|self|company|website form)$/;
function normSource(v){
  var t = low(v); if (!t) return '';
  if (SYSTEM.test(t)) return '';
  for (var i = 0; i < CHANNELS.length; i++) if (t === low(CHANNELS[i])) return CHANNELS[i];
  if (t === 'angi/homeadvisor') return 'Angi/HomeAdvisor';
  for (var j = 0; j < LEAD_SERVICES.length; j++) if (t === low(LEAD_SERVICES[j])) return LEAD_SERVICES[j];
  if (/roof ?ignite/.test(t)) return 'Roof Ignite';
  if (/contractor connection/.test(t)) return 'Contractor Connection';
  if (/\bangi\b|angie|home ?advisor/.test(t)) return 'Angi/HomeAdvisor';
  if (/tik ?tok|ttclid/.test(t)) return 'TikTok';
  if (/google ?ads|adwords|gclid|\bppc\b|\bcpc\b|google (paid|ad)\b|local services|\blsa\b/.test(t)) return 'Google Ads';
  if (/facebook|instagram|\bfb\b|\binsta\b|\big\b|\bmeta\b|fbclid/.test(t)) return 'Facebook/Instagram Ads';
  if (/business profile|\bgbp\b|\bgmb\b|google maps|my business|maps listing/.test(t)) return 'Google Business Profile';
  if (/next ?door/.test(t)) return 'Nextdoor';
  if (/repeat|past customer|existing customer|returning|previous customer|former customer|used (you|grayco|y'?all) before|worked with (you|grayco) before|again\b/.test(t)) return 'Repeat customer';
  if (/referr|friend|neighbou?r|word of mouth|family|realtor|agent referral/.test(t)) return 'Referral';
  if (/yard sign|\bsign\b|signs|truck|vehicle|wrap|door hanger|flyer|postcard|mailer/.test(t)) return /door hanger|flyer|postcard|mailer/.test(t) ? 'Other' : 'Yard sign';
  if (/google|organic|\bseo\b|bing|yahoo|duckduckgo|search/.test(t)) return 'Google organic';
  return 'Other';
}

/* website / form attribution: utm_*, click ids and the referrer → one clean source */
function attribution(b){
  b = b && typeof b === 'object' ? b : {};
  function pick(names){
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (b[n] != null && s(b[n]) !== '') return s(b[n]);
      var k = Object.keys(b).find(function(x){ return low(x).replace(/[_\s-]/g, '') === n.replace(/[_\s-]/g, ''); });
      if (k && s(b[k]) !== '') return s(b[k]);
    }
    return '';
  }
  var a = {
    utm_source: pick(['utm_source', 'utmsource']), utm_medium: pick(['utm_medium', 'utmmedium']), utm_campaign: pick(['utm_campaign', 'utmcampaign']),
    utm_term: pick(['utm_term']), utm_content: pick(['utm_content']),
    gclid: pick(['gclid', 'gbraid', 'wbraid']), fbclid: pick(['fbclid']), ttclid: pick(['ttclid']), msclkid: pick(['msclkid']),
    referrer: pick(['referrer', 'referer', 'http_referer', 'page_referrer', 'document_referrer']),
    landing: pick(['landing_page', 'page_url', 'landing', 'url']),
    howHeard: pick(['how_did_you_hear', 'how_did_you_hear_about_us', 'heard_about', 'hear_about_us', 'how_heard', 'referral_source', 'lead_source', 'source'])
  };
  var src = low(a.utm_source), med = low(a.utm_medium), ref = low(a.referrer);
  var paid = /cpc|ppc|paid|ads?\b|display|retarget|remarket|cpm|sponsored/.test(med);
  var ch = '', why = '';
  if (a.gclid) { ch = 'Google Ads'; why = 'gclid'; }
  else if (a.ttclid) { ch = 'TikTok'; why = 'ttclid'; }
  else if (a.fbclid && (paid || /facebook|instagram|fb|ig|meta/.test(src))) { ch = 'Facebook/Instagram Ads'; why = 'fbclid'; }
  else if (src) {
    if (/gbp|gmb|business[_ ]?profile|google[_ ]?maps|google[_ ]?business/.test(src + ' ' + med)) { ch = 'Google Business Profile'; why = 'utm'; }
    else if (/google|adwords/.test(src)) { ch = paid ? 'Google Ads' : 'Google organic'; why = 'utm'; }
    else if (/facebook|instagram|\bfb\b|\big\b|meta/.test(src)) { ch = paid || a.fbclid ? 'Facebook/Instagram Ads' : 'Other'; why = paid || a.fbclid ? 'utm' : 'utm (social, not an ad)'; }
    else if (/tiktok/.test(src)) { ch = 'TikTok'; why = 'utm'; }
    else if (/nextdoor/.test(src)) { ch = 'Nextdoor'; why = 'utm'; }
    else if (/yard|sign|qr/.test(src)) { ch = 'Yard sign'; why = 'utm'; }
    else if (/referr|friend/.test(src)) { ch = 'Referral'; why = 'utm'; }
    else if (/bing|yahoo|duckduckgo/.test(src)) { ch = paid ? 'Other' : 'Google organic'; why = 'utm'; }
    else { ch = normSource(src) || 'Other'; why = 'utm'; }
  } else if (a.fbclid) { ch = 'Other'; why = 'fbclid (social, not an ad)'; }
  else if (ref) {
    if (/business\.google|maps\.google|google\.[a-z.]+\/maps|g\.page|maps\.app\.goo/.test(ref)) { ch = 'Google Business Profile'; why = 'referrer'; }
    else if (/googleadservices|doubleclick/.test(ref)) { ch = 'Google Ads'; why = 'referrer'; }
    else if (/(^|\/\/|\.)google\.[a-z.]+/.test(ref) || /bing\.com|duckduckgo|yahoo\./.test(ref)) { ch = 'Google organic'; why = 'referrer'; }
    else if (/nextdoor\./.test(ref)) { ch = 'Nextdoor'; why = 'referrer'; }
    else if (/tiktok\./.test(ref)) { ch = 'TikTok'; why = 'referrer'; }
    else if (/facebook\.|instagram\.|fb\.me|l\.facebook/.test(ref)) { ch = 'Other'; why = 'referrer (social, not an ad)'; }
    else if (/angi\.com|homeadvisor/.test(ref)) { ch = 'Angi/HomeAdvisor'; why = 'referrer'; }
  }
  if (!ch && a.howHeard) { ch = normSource(a.howHeard); why = ch ? 'how did you hear' : ''; }
  var any = Object.keys(a).some(function(k){ return a[k]; });
  return { channel: ch, why: why, any: any, fields: a };
}

/* ── 2. places and job kinds ──────────────────────────────────────────────────────────────── */
var ZIPS = {   /* approximate ZIP centers — for the storm and ZIP tables only */
  '38002': ['Arlington / Lakeland', 35.29, -89.71], '38004': ['Atoka', 35.44, -89.78], '38016': ['Cordova', 35.18, -89.77], '38017': ['Collierville', 35.05, -89.67],
  '38018': ['Cordova', 35.14, -89.78], '38028': ['Eads', 35.20, -89.63], '38053': ['Millington', 35.34, -89.90], '38058': ['Munford', 35.45, -89.82], '38060': ['Oakland', 35.23, -89.51],
  '38103': ['Memphis (Downtown)', 35.15, -90.05], '38104': ['Memphis (Midtown)', 35.13, -90.00], '38105': ['Memphis', 35.15, -90.03], '38106': ['Memphis', 35.10, -90.03],
  '38107': ['Memphis', 35.17, -90.02], '38108': ['Memphis', 35.18, -89.97], '38109': ['Memphis (Whitehaven W)', 35.04, -90.15], '38111': ['Memphis', 35.11, -89.94],
  '38112': ['Memphis', 35.15, -89.97], '38114': ['Memphis', 35.10, -89.98], '38115': ['Memphis (Hickory Hill)', 35.05, -89.86], '38116': ['Memphis (Whitehaven)', 35.03, -90.01],
  '38117': ['Memphis (East)', 35.11, -89.91], '38118': ['Memphis', 35.05, -89.93], '38119': ['Memphis (East)', 35.08, -89.85], '38120': ['Memphis (East)', 35.12, -89.85],
  '38122': ['Memphis', 35.16, -89.92], '38125': ['Memphis (Southwind)', 35.03, -89.80], '38126': ['Memphis', 35.12, -90.04], '38127': ['Memphis (Frayser)', 35.24, -90.03],
  '38128': ['Memphis (Raleigh)', 35.22, -89.93], '38133': ['Bartlett', 35.21, -89.80], '38134': ['Bartlett', 35.18, -89.85], '38135': ['Bartlett', 35.24, -89.85],
  '38138': ['Germantown', 35.09, -89.80], '38139': ['Germantown', 35.08, -89.73], '38141': ['Memphis', 35.02, -89.86],
  '38654': ['Olive Branch, MS', 34.95, -89.83], '38671': ['Southaven, MS', 34.97, -89.99], '38672': ['Southaven, MS', 34.92, -89.95], '38637': ['Horn Lake, MS', 34.95, -90.05],
  '38632': ['Hernando, MS', 34.82, -90.00], '38680': ['Walls, MS', 34.96, -90.15], '72301': ['West Memphis, AR', 35.15, -90.18], '72364': ['Marion, AR', 35.21, -90.20]
};
var CITIES = [
  ['Bartlett', 35.205, -89.874], ['Germantown', 35.087, -89.810], ['Collierville', 35.042, -89.664], ['Cordova', 35.156, -89.776], ['Arlington', 35.296, -89.661],
  ['Lakeland', 35.231, -89.740], ['Millington', 35.341, -89.897], ['Southaven', 34.989, -90.012], ['Olive Branch', 34.962, -89.829], ['Horn Lake', 34.955, -90.035],
  ['Hernando', 34.824, -89.994], ['West Memphis', 35.146, -90.185], ['Marion', 35.214, -90.196], ['Somerville', 35.244, -89.350], ['Oakland', 35.229, -89.515],
  ['Atoka', 35.441, -89.778], ['Munford', 35.449, -89.815], ['Eads', 35.20, -89.63], ['Memphis', 35.149, -90.049]
];
var HOME = [35.2045, -89.8740];   /* Bartlett office */
function zipOf(addr){ var m = s(addr).match(/\b(3[78]\d{3}|72\d{3})(?:-\d{4})?\b(?![\s\S]*\b(3[78]\d{3}|72\d{3})\b)/); return m ? m[1] : ''; }
function cityOf(addr){
  var t = low(addr); if (!t) return '';
  for (var i = 0; i < CITIES.length; i++) if (t.indexOf(low(CITIES[i][0])) >= 0) return CITIES[i][0];
  var z = zipOf(addr); if (z && ZIPS[z]) return ZIPS[z][0].replace(/ \(.*\)$/, '').replace(/, (MS|AR)$/, '');
  return '';
}
function streetOf(addr){ var a = s(addr).split(',')[0]; return a.replace(/^\s*\d+[A-Za-z]?\s+/, '').trim(); }
function milesBetween(a, b){
  var R = 3958.8, toR = Math.PI / 180, dLa = (b[0] - a[0]) * toR, dLo = (b[1] - a[1]) * toR;
  var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function jobKind(p){
  p = p || {}; var t = low(p.type || p.jobType || p.projectType || p.leadType);
  if (/roof/.test(t)) return 'Roofing';
  if (p.isInsurance === true || /insur|claim|fire|water|storm|mitigat|restor|program/.test(t)) return 'Insurance';
  if (/commercial|\bti\b|tenant/.test(t)) return 'Commercial';
  return 'Residential';
}
var KINDS = ['Roofing', 'Insurance', 'Residential', 'Commercial'];

/* ── 3. leads → jobs → money ──────────────────────────────────────────────────────────────── */
var WON = /^(approved|active|in[ _-]?progress|completed?|closed|won|on[ _-]?hold|punch|scheduled|sold|signed)/i;
var LOST = /^(lost|cancel|declin|dead|no[ _-]?go|rejected)/i;
var LEAD_STAGE_RANK = { 'new lead': 0, contacted: 0, 'site visit': 1, 'estimate sent': 2, negotiating: 2, won: 3, lost: -1 };
function dateOf(){ for (var i = 0; i < arguments.length; i++) { var v = s(arguments[i]); if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); } return ''; }
function monthOf(d){ return d ? d.slice(0, 7) : ''; }
function digits(v){ return s(v).replace(/\D/g, '').slice(-10); }
function nkey(v){ return low(v).replace(/[^a-z0-9]/g, ''); }
function trackedCampaign(notes){ var m = /Ad tracking —[^\n]*?utm_campaign=([^\s·]+)/.exec(s(notes)); return m ? m[1] : ''; }
function isClientInvoice(iv){
  var t = low(iv.type);
  if (/sub|supplier|bill|vendor|expense|purchase/.test(t)) return false;
  if (iv.sub || iv.subId || iv.supplier) return false;
  return true;
}
function invAmt(iv){ return num(iv.amt != null ? iv.amt : (iv.amount != null ? iv.amount : iv.total)); }
function deleted(x){ return !x || x.deleted === true || x._deleted === true || x.__deleted === true; }

/* D = { leads, projects, invs, expenses, estimates, spend:[{channel, month|date, amount, campaign, impressions, clicks, conversions}],
         srcfix: { 'l:<id>' | 'p:<id>': channel }, now: 'YYYY-MM-DD', monthsBack } */
function build(D){
  D = D || {};
  var now = s(D.now) || new Date().toISOString().slice(0, 10);
  var leads = arr(D.leads).filter(function(x){ return !deleted(x) && x.id; });
  var projects = arr(D.projects).filter(function(x){ return !deleted(x) && x.id; });
  var fix = D.srcfix || {};
  var leadById = {}, projById = {}, byPhone = {}, byEmail = {}, byName = {};
  leads.forEach(function(l){
    leadById[l.id] = l;
    var ph = digits(l.phone), em = low(l.email), nm = nkey(l.name || l.client);
    if (ph.length === 10) byPhone[ph] = byPhone[ph] || l;
    if (em) byEmail[em] = byEmail[em] || l;
    if (nm.length > 4) byName[nm] = byName[nm] || l;
  });
  projects.forEach(function(p){ projById[p.id] = p; });
  var estByPid = {}; arr(D.estimates).forEach(function(e){ if (e && !deleted(e)) { var k = e.pid || e.projectId || e.leadId; if (k) estByPid[k] = (estByPid[k] || 0) + 1; } });
  var rev = {}, revPaid = {}, invCount = {}, cost = {}, costCount = {};
  arr(D.invs).forEach(function(iv){
    if (deleted(iv) || !iv.pid) return; var a = invAmt(iv); if (!a) return;
    if (isClientInvoice(iv)) { if (/void|cancel|draft|declin/.test(low(iv.status))) return; rev[iv.pid] = (rev[iv.pid] || 0) + a; invCount[iv.pid] = (invCount[iv.pid] || 0) + 1; if (/paid/.test(low(iv.status)) || iv.paid === true) revPaid[iv.pid] = (revPaid[iv.pid] || 0) + a; }
    else { cost[iv.pid] = (cost[iv.pid] || 0) + a; costCount[iv.pid] = (costCount[iv.pid] || 0) + 1; }
  });
  arr(D.expenses).forEach(function(x){ if (deleted(x) || !x.pid || x.overhead) return; if (/payment|refund|transfer/.test(low(x.type))) return; var a = num(x.amt); if (!a) return; cost[x.pid] = (cost[x.pid] || 0) + a; costCount[x.pid] = (costCount[x.pid] || 0) + 1; });

  var linkedLead = {}, opps = [];
  function leadFor(p){
    var l = leadById[p.fromLeadId] || leadById[p.leadId] || leadById[p.lead];
    if (!l) { var ph = digits(p.clientPhone || p.phone); if (ph.length === 10 && byPhone[ph]) l = byPhone[ph]; }
    if (!l && low(p.clientEmail) && byEmail[low(p.clientEmail)]) l = byEmail[low(p.clientEmail)];
    if (!l) { var nm = nkey(p.client); if (nm.length > 4 && byName[nm]) l = byName[nm]; }
    return l && !linkedLead[l.id] ? l : (l && linkedLead[l.id] === p.id ? l : null);
  }
  function sourceOf(l, p){
    if (p && fix['p:' + p.id]) return { ch: fix['p:' + p.id], why: 'set in Marketing' };
    if (l && fix['l:' + l.id]) return { ch: fix['l:' + l.id], why: 'set in Marketing' };
    var c;
    if (l) { c = normSource(l.mkSource) || normSource(l.howHeard) || normSource(l.source) || normSource(l.leadSource) || normSource(l.channel); if (c) return { ch: c, why: 'lead' }; }
    if (p) {
      c = normSource(p.mkSource) || normSource(p.howHeard) || normSource(p.channel);
      if (!c && p.riLeadId) c = normSource(p.leadSource);
      if (!c && p.leadSource && !/^grayco$/i.test(s(p.leadSource))) { var c2 = normSource(p.leadSource); if (c2 && c2 !== 'Other') c = c2; }
      if (!c) c = normSource(p.source);
      if (c) return { ch: c, why: 'job' };
    }
    return { ch: '', why: '' };
  }
  projects.forEach(function(p){ var l = leadFor(p); if (l) linkedLead[l.id] = p.id; p.__mkLead = l || null; });
  leads.forEach(function(l){
    var pid = l.pid || l.projectId || l.fromProjectId || l.jobId;
    if (pid && projById[pid] && !projById[pid].__mkLead) { projById[pid].__mkLead = l; linkedLead[l.id] = pid; }
  });
  function stageOf(l, p){
    var st = p ? s(p.status) : '', ls = low(l && l.stage), lst = low(l && l.status);
    var won = (p && (WON.test(st) || p.paidInFull === true)) || ls === 'won' || /^won/.test(lst);
    var lost = !won && ((p && LOST.test(st)) || ls === 'lost' || LOST.test(lst));
    var rank = 0;
    if (l && LEAD_STAGE_RANK[ls] != null) rank = Math.max(rank, LEAD_STAGE_RANK[ls]);
    if (p) {
      if (typeof p.apStage === 'number') rank = Math.max(rank, p.apStage >= 3 ? 2 : (p.apStage >= 2 ? 1 : 0));
      if (estByPid[p.id] || p.estimateId || p._lastEstId || /estimat|proposal|bid sent|submitted/i.test(st)) rank = Math.max(rank, 2);
    }
    if (l && (l.estimateId || estByPid[l.id])) rank = Math.max(rank, 2);
    if (won) rank = 3;
    return { rank: rank, won: won, lost: lost };
  }
  function addOpp(l, p){
    var src = sourceOf(l, p), sg = stageOf(l, p);
    var created = dateOf(l && l.date, l && l.createdAt, l && l.created, p && p.riReceivedAt, p && p.created, p && p.createdAt, l && l.savedAt, p && p.savedAt);
    var wonDate = sg.won && p ? dateOf(p.contractSignedAt, p.signedAt, p.approvedAt, p.soldAt, p.startDate, p.created, p.createdAt) : (sg.won ? dateOf(l && l.wonAt, l && l.updatedAt) : '');
    var addr = s((p && (p.address || p.jobAddress)) || (l && l.address));
    var r = p ? (rev[p.id] || 0) : 0, basis = r ? 'invoices' : '';
    if (!r && sg.won && p && num(p.contract) > 0) { r = num(p.contract); basis = 'contract'; }
    var c = p ? (cost[p.id] || 0) : 0;
    var days = null;
    if (sg.won && created && wonDate) { var dd = (Date.parse(wonDate) - Date.parse(created)) / 864e5; if (dd >= 0 && dd < 1500) days = Math.round(dd); }
    opps.push({
      id: (l ? 'l:' + l.id : 'p:' + p.id), leadId: l ? l.id : '', projectId: p ? p.id : '', fixKey: p ? 'p:' + p.id : 'l:' + l.id,
      label: s((p && p.name) || (l && (l.name || l.client))) || '(no name)',
      created: created, month: monthOf(created), source: src.ch, sourceWhy: src.why,
      rawSource: s((l && (l.source || l.leadSource)) || (p && (p.leadSource || p.source))),
      campaign: s((l && (l.utmCampaign || l.mkCampaign || (l.attribution && l.attribution.fields && l.attribution.fields.utm_campaign))) || (p && (p.utmCampaign || p.mkCampaign)) || trackedCampaign(p && p.notes) || trackedCampaign(l && l.notes)),
      rank: sg.rank, appt: sg.rank >= 1, estimate: sg.rank >= 2, won: sg.won, lost: sg.lost, wonDate: wonDate, days: days,
      revenue: r2(r), revenueBasis: basis, paid: r2(p ? (revPaid[p.id] || 0) : 0), cost: r2(c), costKnown: !!(p && costCount[p.id]), gp: r2(r - c),
      kind: jobKind(p || l || {}), type: s((p && p.type) || (l && (l.type || l.projectType))), status: s(p ? p.status : (l && (l.stage || l.status))),
      zip: zipOf(addr), city: cityOf(addr), street: streetOf(addr), hasAddress: !!addr,
      completed: !!(p && /^(completed?|closed)/i.test(s(p.status))), active: !!(p && /^(active|in[ _-]?progress|approved|scheduled)/i.test(s(p.status))),
      reviewAsked: !!(p && (p.mkReviewAskedAt || p.reviewRequestedAt || arr(p.apChecklist).some(function(x){ return x && x.k === 'review' && x.s === 'sent'; }))),
      completedDate: p ? dateOf(p.completedAt, p.completionDate, p.endDate) : ''
    });
  }
  projects.forEach(function(p){ addOpp(p.__mkLead, p); delete p.__mkLead; });
  leads.forEach(function(l){ if (!linkedLead[l.id]) addOpp(l, null); });

  /* spend */
  var spend = arr(D.spend).filter(function(x){ return x && !x.del && num(x.amount) > 0; }).map(function(x){
    var d = dateOf(x.date) || (/^\d{4}-\d{2}$/.test(s(x.month)) ? s(x.month) + '-01' : '');
    return { channel: normSource(x.channel) || s(x.channel) || 'Other', month: monthOf(d), date: d, amount: num(x.amount), campaign: s(x.campaign),
      impressions: num(x.impressions), clicks: num(x.clicks), conversions: num(x.conversions), origin: s(x.origin) || 'manual' };
  });
  return summarize(opps, spend, now, D.monthsBack || 12);
}

function summarize(opps, spend, now, monthsBack){
  var months = []; var d = new Date(now + 'T12:00:00Z');
  for (var i = monthsBack - 1; i >= 0; i--) { var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); months.push(x.toISOString().slice(0, 7)); }
  var first = months[0];
  var inWin = function(o){ return o.month && o.month >= first; };
  var channelsSeen = {};
  opps.forEach(function(o){ if (o.source) channelsSeen[o.source] = 1; });
  spend.forEach(function(x){ channelsSeen[x.channel] = 1; });
  var chList = Object.keys(channelsSeen).sort(function(a, b){ var ia = CHANNELS.indexOf(a), ib = CHANNELS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); });

  var bySourceMonth = {}; months.forEach(function(m){ bySourceMonth[m] = {}; });
  opps.forEach(function(o){ if (bySourceMonth[o.month]) { var k = o.source || '(not set)'; bySourceMonth[o.month][k] = (bySourceMonth[o.month][k] || 0) + 1; } });

  function blank(ch){ return { channel: ch, leads: 0, appts: 0, estimates: 0, won: 0, lost: 0, revenue: 0, cost: 0, gp: 0, costKnownJobs: 0, contractBasisJobs: 0, days: [], spend: 0, impressions: 0, clicks: 0, platformConversions: 0 }; }
  var by = {};
  function row(ch){ return by[ch] || (by[ch] = blank(ch)); }
  opps.forEach(function(o){
    var r = row(o.source || '(not set)');
    if (inWin(o) || !o.month) r.leads++;
    if (!(inWin(o) || !o.month)) return;
    if (o.appt) r.appts++; if (o.estimate) r.estimates++; if (o.lost) r.lost++;
    if (o.won) { r.won++; r.revenue += o.revenue; r.cost += o.cost; r.gp += o.gp; if (o.costKnown) r.costKnownJobs++; if (o.revenueBasis === 'contract') r.contractBasisJobs++; if (o.days != null) r.days.push(o.days); }
  });
  spend.forEach(function(x){ if (x.month && x.month < first) return; var r = row(x.channel); r.spend += x.amount; r.impressions += x.impressions; r.clicks += x.clicks; r.platformConversions += x.conversions; });
  var channels = Object.keys(by).map(function(k){
    var r = by[k], ds = r.days.slice().sort(function(a, b){ return a - b; });
    r.revenue = r2(r.revenue); r.cost = r2(r.cost); r.gp = r2(r.gp); r.spend = r2(r.spend);
    r.closeRate = r.leads ? r2(r.won / r.leads * 100) : null;
    r.avgJob = r.won ? r2(r.revenue / r.won) : null;
    r.medianDaysToClose = ds.length ? ds[Math.floor(ds.length / 2)] : null;
    r.avgDaysToClose = ds.length ? Math.round(ds.reduce(function(a, b){ return a + b; }, 0) / ds.length) : null;
    r.closedWithDates = ds.length; delete r.days;
    r.cpl = r.spend && r.leads ? r2(r.spend / r.leads) : null;
    r.costPerWon = r.spend && r.won ? r2(r.spend / r.won) : null;
    r.roas = r.spend ? r2(r.revenue / r.spend) : null;
    r.roi = r.spend ? r2((r.gp - r.spend) / r.spend * 100) : null;
    r.cpc = r.spend && r.clicks ? r2(r.spend / r.clicks) : null;
    return r;
  }).sort(function(a, b){ return b.gp - a.gp || b.leads - a.leads; });

  /* campaigns (spend side; CRM leads matched when the lead carries utm_campaign) */
  var camp = {};
  spend.forEach(function(x){ if (!x.campaign || (x.month && x.month < first)) return; var k = x.channel + '|' + x.campaign; var c = camp[k] || (camp[k] = { channel: x.channel, campaign: x.campaign, spend: 0, impressions: 0, clicks: 0, platformConversions: 0, crmLeads: 0, crmWon: 0, crmRevenue: 0, crmGp: 0 }); c.spend += x.amount; c.impressions += x.impressions; c.clicks += x.clicks; c.platformConversions += x.conversions; });
  opps.forEach(function(o){ if (!o.campaign || !inWin(o)) return; Object.keys(camp).forEach(function(k){ var c = camp[k]; if (low(c.campaign) === low(o.campaign)) { c.crmLeads++; if (o.won) { c.crmWon++; c.crmRevenue += o.revenue; c.crmGp += o.gp; } } }); });
  var campaigns = Object.keys(camp).map(function(k){ var c = camp[k]; c.spend = r2(c.spend); c.cpc = c.clicks ? r2(c.spend / c.clicks) : null; c.ctr = c.impressions ? r2(c.clicks / c.impressions * 100) : null;
    c.costPerPlatformConversion = c.platformConversions ? r2(c.spend / c.platformConversions) : null; c.crmCpl = c.crmLeads ? r2(c.spend / c.crmLeads) : null; c.roas = c.spend && c.crmRevenue ? r2(c.crmRevenue / c.spend) : null; return c; })
    .sort(function(a, b){ return b.spend - a.spend; });

  /* job value by source × kind */
  var avgByKind = {};
  opps.forEach(function(o){ if (!o.won || !inWin(o)) return; var k = (o.source || '(not set)') + '|' + o.kind; var a = avgByKind[k] || (avgByKind[k] = { channel: o.source || '(not set)', kind: o.kind, jobs: 0, revenue: 0, gp: 0 }); a.jobs++; a.revenue += o.revenue; a.gp += o.gp; });
  var jobValue = Object.keys(avgByKind).map(function(k){ var a = avgByKind[k]; return { channel: a.channel, kind: a.kind, jobs: a.jobs, avgJob: r2(a.revenue / a.jobs), avgGp: r2(a.gp / a.jobs), revenue: r2(a.revenue) }; }).sort(function(a, b){ return b.revenue - a.revenue; });

  /* won jobs by ZIP (all time — places do not expire) */
  var zp = {};
  opps.forEach(function(o){ if (!o.won) return; var k = o.zip || (o.city ? o.city + ' (no ZIP)' : '(no address)'); var z = zp[k] || (zp[k] = { zip: o.zip, area: o.zip && ZIPS[o.zip] ? ZIPS[o.zip][0] : o.city, jobs: 0, revenue: 0, gp: 0, kinds: {} }); z.jobs++; z.revenue += o.revenue; z.gp += o.gp; z.kinds[o.kind] = (z.kinds[o.kind] || 0) + 1; });
  var zips = Object.keys(zp).map(function(k){ var z = zp[k]; z.key = k; z.revenue = r2(z.revenue); z.gp = r2(z.gp); z.avgGp = r2(z.gp / z.jobs); var c = z.zip && ZIPS[z.zip]; z.lat = c ? c[1] : null; z.lon = c ? c[2] : null; z.miles = c ? r2(milesBetween(HOME, [c[1], c[2]])) : null; return z; })
    .sort(function(a, b){ return b.gp - a.gp; });

  var mix = {}; KINDS.forEach(function(k){ mix[k] = { kind: k, leads: 0, won: 0, revenue: 0, gp: 0 }; });
  opps.forEach(function(o){ if (!inWin(o) && o.month) return; var m = mix[o.kind]; m.leads++; if (o.won) { m.won++; m.revenue += o.revenue; m.gp += o.gp; } });
  var kindMix = KINDS.map(function(k){ var m = mix[k]; m.revenue = r2(m.revenue); m.gp = r2(m.gp); return m; });

  var winOpps = opps.filter(function(o){ return inWin(o) || !o.month; });
  var missing = winOpps.filter(function(o){ return !o.source; });
  var wonAll = winOpps.filter(function(o){ return o.won; });
  var tot = { leads: winOpps.length, withSource: winOpps.length - missing.length, missingSource: missing.length, won: wonAll.length,
    revenue: r2(wonAll.reduce(function(a, o){ return a + o.revenue; }, 0)), gp: r2(wonAll.reduce(function(a, o){ return a + o.gp; }, 0)),
    wonWithCosts: wonAll.filter(function(o){ return o.costKnown; }).length, wonOnContract: wonAll.filter(function(o){ return o.revenueBasis === 'contract'; }).length,
    spend: r2(spend.filter(function(x){ return !x.month || x.month >= first; }).reduce(function(a, x){ return a + x.amount; }, 0)), months: months.length, from: first, to: months[months.length - 1] };
  tot.cpl = tot.spend && tot.withSource ? r2(tot.spend / tot.withSource) : null;

  var warnings = [];
  if (tot.withSource < 30) warnings.push('Only ' + tot.withSource + ' lead' + (tot.withSource === 1 ? '' : 's') + ' with a source — set sources to get better advice.');
  if (tot.missingSource) warnings.push(tot.missingSource + ' of ' + tot.leads + ' leads/jobs have no source.');
  if (tot.won && tot.wonWithCosts < tot.won) warnings.push((tot.won - tot.wonWithCosts) + ' of ' + tot.won + ' won jobs have no costs recorded, so their profit is overstated.');
  if (tot.wonOnContract) warnings.push(tot.wonOnContract + ' won job' + (tot.wonOnContract === 1 ? ' uses its' : 's use their') + ' contract amount (no invoices yet).');
  if (!tot.spend) warnings.push('No ad spend entered — cost per lead and ROI cannot be worked out yet.');

  /* this month */
  var tm = now.slice(0, 7), tmOpps = opps.filter(function(o){ return o.month === tm; }), tmSpend = spend.filter(function(x){ return x.month === tm; }).reduce(function(a, x){ return a + x.amount; }, 0);
  var bestCh = channels.filter(function(c){ return c.channel !== '(not set)' && c.won; }).sort(function(a, b){ return b.gp - a.gp; })[0];
  var thisMonth = { month: tm, leads: tmOpps.length, withSource: tmOpps.filter(function(o){ return o.source; }).length, spend: r2(tmSpend),
    cpl: tmSpend && tmOpps.length ? r2(tmSpend / tmOpps.length) : null, bestChannel: bestCh ? bestCh.channel : '', bestChannelGp: bestCh ? bestCh.gp : null };

  return { now: now, months: months, channels: channels, channelNames: chList, bySourceMonth: bySourceMonth, campaigns: campaigns, jobValue: jobValue, zips: zips, kindMix: kindMix,
    totals: tot, warnings: warnings, thisMonth: thisMonth, opps: opps };
}

/* the part of a summary that leaves the CRM for the assistant: counts and money only, no names, no house numbers */
function forAssistant(sum){
  var o = JSON.parse(JSON.stringify(sum));
  var opps = o.opps || []; delete o.opps;
  o.jobsForNeighborMarketing = opps.filter(function(x){ return (x.completed || x.active) && (x.street || x.zip); }).slice(0, 60)
    .map(function(x){ return { street: x.street, zip: x.zip, city: x.city, kind: x.kind, status: x.completed ? 'completed' : 'active', completedDate: x.completedDate }; });
  return o;
}

/* ── 4. CSV: Google Ads and Meta Ads Manager exports ──────────────────────────────────────── */
function parseCSV(text){
  text = String(text == null ? '' : text).replace(/^﻿/, '');
  var delim = ',';
  var firstLines = text.split(/\r?\n/).slice(0, 6).join('\n');
  if ((firstLines.match(/\t/g) || []).length > (firstLines.match(/,/g) || []).length) delim = '\t';
  else if ((firstLines.match(/;/g) || []).length > (firstLines.match(/,/g) || []).length) delim = ';';
  var rows = [], row = [], f = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') { q = true; continue; }
    if (c === delim) { row.push(f); f = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; continue; }
    f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(x){ return s(x) !== ''; }); });
}
var COLS = {
  campaign: ['campaign', 'campaign name', 'campaign_name', 'ad set name', 'ad group', 'campaign (name)'],
  date: ['day', 'date', 'reporting starts', 'reporting start', 'date_start', 'week', 'month', 'start date', 'day (date)'],
  dateEnd: ['reporting ends', 'reporting end', 'date_stop', 'end date'],
  spend: ['cost', 'amount spent (usd)', 'amount spent', 'spend', 'cost (usd)', 'amount spent (us$)', 'total spent', 'spend (usd)', 'cost (converted currency)'],
  impressions: ['impressions', 'impr.', 'impr', 'impression'],
  clicks: ['clicks', 'link clicks', 'clicks (all)', 'interactions'],
  conversions: ['conversions', 'conv.', 'all conv.', 'results', 'leads', 'on-facebook leads', 'website leads', 'conversion', 'purchases'],
  resultType: ['result indicator', 'result type'],
  currency: ['currency', 'currency code']
};
function findCol(head, names){
  var h = head.map(function(x){ return low(x).replace(/\s+/g, ' '); });
  for (var i = 0; i < names.length; i++) { var j = h.indexOf(names[i]); if (j >= 0) return j; }
  for (var k = 0; k < names.length; k++) { for (var m = 0; m < h.length; m++) if (h[m].indexOf(names[k]) === 0) return m; }
  return -1;
}
function cleanNum(v){ var t = s(v); if (!t || t === '--' || t === '—' || /^n\/?a$/i.test(t)) return 0; var neg = /^\(.*\)$/.test(t); t = t.replace(/[()$€£%\s]/g, ''); if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, ''); var x = parseFloat(t); return isFinite(x) ? (neg ? -x : x) : 0; }
var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function cleanDate(v){
  var t = s(v); if (!t) return '';
  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  m = t.match(/^(?:[A-Za-z]{3},?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/); if (m && MON[low(m[1]).slice(0, 4)] || (m && MON[low(m[1]).slice(0, 3)])) { var mo = MON[low(m[1]).slice(0, 4)] || MON[low(m[1]).slice(0, 3)]; return m[3] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  m = t.match(/^([A-Za-z]{3,9})\s+(\d{4})$/); if (m && MON[low(m[1]).slice(0, 3)]) return m[2] + '-' + ('0' + MON[low(m[1]).slice(0, 3)]).slice(-2) + '-01';
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}
function importAdsCSV(text, opts){
  opts = opts || {};
  var rows = parseCSV(text), warnings = [];
  var hi = -1;
  for (var i = 0; i < Math.min(rows.length, 15); i++) { var r = rows[i]; if (findCol(r, COLS.spend) >= 0 && (findCol(r, COLS.campaign) >= 0 || findCol(r, COLS.date) >= 0)) { hi = i; break; } }
  if (hi < 0) return { ok: false, platform: '', rows: [], warnings: ['Could not find the column headers (need at least Campaign or Day, and Cost / Amount spent).'] };
  var head = rows[hi], hl = head.map(low).join('|');
  var platform = opts.platform || (/amount spent|reporting starts|ad set|results|link clicks|reach/.test(hl) ? 'meta' : (/impr\.|conv\.|cost|day|interactions|campaign type/.test(hl) ? 'google' : ''));
  var ix = {}; Object.keys(COLS).forEach(function(k){ ix[k] = findCol(head, COLS[k]); });
  var out = [], skipped = 0;
  rows.slice(hi + 1).forEach(function(r){
    var camp = ix.campaign >= 0 ? s(r[ix.campaign]) : '';
    var first = s(r[0]);
    if (/^total|^grand total|^--$/i.test(first) || /^total/i.test(camp) || (ix.campaign >= 0 && /^total/i.test(s(r[ix.campaign])))) { skipped++; return; }
    var sp = ix.spend >= 0 ? cleanNum(r[ix.spend]) : 0;
    var d = ix.date >= 0 ? cleanDate(r[ix.date]) : '';
    if (!d && ix.dateEnd >= 0) d = cleanDate(r[ix.dateEnd]);
    if (!d && opts.defaultDate) d = opts.defaultDate;
    if (!camp && !d) { skipped++; return; }
    var conv = ix.conversions >= 0 ? cleanNum(r[ix.conversions]) : 0;
    if (!sp && !(ix.impressions >= 0 && cleanNum(r[ix.impressions])) && !(ix.clicks >= 0 && cleanNum(r[ix.clicks]))) { skipped++; return; }
    out.push({ campaign: camp || '(no campaign name)', date: d, amount: Math.round(sp * 100) / 100, impressions: ix.impressions >= 0 ? cleanNum(r[ix.impressions]) : 0,
      clicks: ix.clicks >= 0 ? cleanNum(r[ix.clicks]) : 0, conversions: conv, resultType: ix.resultType >= 0 ? s(r[ix.resultType]) : '', currency: ix.currency >= 0 ? s(r[ix.currency]) : '' });
  });
  var noDate = out.filter(function(x){ return !x.date; }).length;
  if (noDate) warnings.push(noDate + ' row' + (noDate === 1 ? ' has' : 's have') + ' no date — pick the month they belong to.');
  if (ix.date < 0) warnings.push('No Day / Date column: export with "Day" (Google) or "Reporting starts" + Breakdown by day (Meta) to see spend per day.');
  var cur = out.map(function(x){ return x.currency; }).filter(Boolean); if (cur.some(function(c){ return c.toUpperCase() !== 'USD'; })) warnings.push('Some rows are not in USD.');
  return { ok: true, platform: platform, channel: platform === 'meta' ? 'Facebook/Instagram Ads' : (platform === 'google' ? 'Google Ads' : (platform === 'tiktok' ? 'TikTok' : '')), rows: out, skipped: skipped, warnings: warnings, header: head };
}

/* ── 5. storms: NOAA / NWS Storm Prediction Center daily reports ─────────────────────────── */
/* hail CSV: Time,Size,Location,County,State,Lat,Lon,Comments  (Size in hundredths of an inch: 175 = 1.75")
   wind CSV: Time,Speed,Location,County,State,Lat,Lon,Comments  (Speed in mph or UNK) */
function parseSpc(csv, kind, day){
  var rows = parseCSV(csv), out = [];
  if (!rows.length) return out;
  var head = rows[0].map(low), iT = head.indexOf('time'), iS = head.indexOf(kind === 'wind' ? 'speed' : 'size'), iL = head.indexOf('location'), iC = head.indexOf('county'), iSt = head.indexOf('state'), iLa = head.indexOf('lat'), iLo = head.indexOf('lon'), iCm = head.indexOf('comments');
  rows.slice(1).forEach(function(r){
    if (low(r[0]) === 'time') return;   /* the combined file repeats headers */
    var lat = parseFloat(r[iLa]), lon = parseFloat(r[iLo]); if (!isFinite(lat) || !isFinite(lon)) return;
    var v = s(r[iS]), rec = { kind: kind, day: day || '', time: s(r[iT]), location: s(r[iL]), county: s(r[iC]), state: s(r[iSt]).toUpperCase(), lat: lat, lon: lon, comments: s(r[iCm]).slice(0, 200) };
    if (kind === 'wind') rec.mph = /^\d+$/.test(v) ? +v : null; else rec.inches = /^\d+$/.test(v) ? +v / 100 : null;
    out.push(rec);
  });
  return out;
}
function inServiceArea(r, miles){ return milesBetween(HOME, [r.lat, r.lon]) <= (miles || 45); }
function stormZips(reports, opts){
  opts = opts || {}; var minHail = opts.minHail || 1, radius = opts.radius || 5, out = {};
  arr(reports).forEach(function(r){
    if (!inServiceArea(r, opts.areaMiles)) return;
    var big = r.kind === 'hail' ? (r.inches != null && r.inches >= minHail) : (r.mph != null && r.mph >= (opts.minWind || 58));
    if (!big) return;
    Object.keys(ZIPS).forEach(function(z){
      var c = ZIPS[z], d = milesBetween([c[1], c[2]], [r.lat, r.lon]);
      if (d > radius) return;
      var o = out[z] || (out[z] = { zip: z, area: c[0], maxHail: 0, maxWind: 0, reports: 0, lastDay: '', hailOpportunity: false });
      o.reports++; if (r.day > o.lastDay) o.lastDay = r.day;
      if (r.kind === 'hail') { o.maxHail = Math.max(o.maxHail, r.inches); if (r.inches >= minHail) o.hailOpportunity = true; } else o.maxWind = Math.max(o.maxWind, r.mph);
    });
  });
  return Object.keys(out).map(function(k){ return out[k]; }).sort(function(a, b){ return (b.hailOpportunity - a.hailOpportunity) || b.maxHail - a.maxHail || b.maxWind - a.maxWind; });
}
function spcUrls(dayIso){ var d = dayIso.replace(/-/g, '').slice(2); var b = 'https://www.spc.noaa.gov/climo/reports/' + d + '_rpts_'; return { hail: b + 'hail.csv', wind: b + 'wind.csv' }; }

/* ── 6. seasonal timing (Mid-South) ───────────────────────────────────────────────────────── */
var SEASONS = [
  { months: [3, 4, 5, 6], l: 'Spring storm season', tip: 'Hail and wind peak March–June. Be ready to run storm-area roofing and insurance ads within 48 hours of a hail report.' },
  { months: [7, 8], l: 'Summer', tip: 'Heat and pop-up storms; good months for commercial roofing, gutters and interior renovation planning.' },
  { months: [9, 10, 11], l: 'Fall', tip: 'Roof-before-winter and fall storm season (a second peak in November). Push inspections and replacements before the holidays.' },
  { months: [12, 1, 2], l: 'Winter', tip: 'Ice, freeze and water damage: insurance restoration and mitigation. Plan spring budgets with commercial customers.' }
];
function seasonFor(dateIso){ var m = +s(dateIso).slice(5, 7) || (new Date().getMonth() + 1); return SEASONS.find(function(x){ return x.months.indexOf(m) >= 0; }); }

/* ── 7. compliance: Meta Special Ad Category (Housing) and protected traits ───────────────── */
var PROTECTED = /\b(race|racial|ethnic\w*|religio\w*|christians?|muslims?|jewish|catholics?|hispanics?|latin[oax]s?|african[- ]americans?|black (families|homeowners|people)|white (families|homeowners|people)|asians?|national origin|immigrants?|nationality|gender|women only|men only|females?|males?|pregnan\w*|familial|families with (kids|children)|parents of|single moms?|disab\w*|handicap\w*|wheelchair|seniors?|elderly|retirees?|over \d\d|under \d\d|ages? \d\d|age range|millennials?|boomers?|gen ?z|sexual orientation|lgbt\w*|veterans? only)\b/i;
var META_TARGETING = /\b(age|gender|zip ?codes?|zips?|lookalikes?|look-alike|demographic|income|household income|interests? (in|like))\b/i;
function scrubTargeting(text){
  var t = s(text); if (!t) return { text: '', removed: false };
  if (PROTECTED.test(t)) return { text: '[Removed: this suggestion targeted people by a protected trait (race, religion, national origin, sex, familial status, disability or age). GrayCo never targets that way.]', removed: true };
  return { text: t, removed: false };
}
var HOUSING_NOTE = 'Meta Special Ad Category — Housing: home-improvement ads on Facebook/Instagram must run in this category. Targeting is limited to a location radius of at least 15 miles (no ZIP-level targeting), no age or gender targeting and no lookalike audiences.';
var CUSTOM_AUDIENCE_NOTE = 'Customer-list (custom) audiences: only customers who agreed to marketing, e-mails/phones hashed (SHA-256) by the platform upload tool, and someone at GrayCo uploads it by hand — never automatic.';
function complianceFor(platform, text){
  var p = low(platform), t = s(text), flags = [];
  if (/facebook|instagram|meta|fb|ig/.test(p)) {
    flags.push({ k: 'housing', l: HOUSING_NOTE });
    if (META_TARGETING.test(t)) flags.push({ k: 'meta-targeting', l: 'This mentions age, gender, ZIP or lookalike targeting — not allowed in the Housing category on Meta. Use a 15+ mile radius around Bartlett instead; keep ZIP lists for Google Ads, mail and door hangers.' });
  }
  if (/custom audience|customer list|upload (our|the) (customer|email)|customer match/i.test(t)) flags.push({ k: 'custom-audience', l: CUSTOM_AUDIENCE_NOTE });
  if (PROTECTED.test(t)) flags.push({ k: 'protected', l: 'Mentions a protected trait — reword so it describes the work (roofs, storms, homes), not the people.' });
  return flags;
}

return {
  CHANNELS: CHANNELS, EXTRA_CHANNELS: EXTRA_CHANNELS, LEAD_SERVICES: LEAD_SERVICES, KINDS: KINDS, ZIPS: ZIPS, CITIES: CITIES, HOME: HOME, SEASONS: SEASONS,
  HOUSING_NOTE: HOUSING_NOTE, CUSTOM_AUDIENCE_NOTE: CUSTOM_AUDIENCE_NOTE, PROTECTED: PROTECTED,
  normSource: normSource, attribution: attribution, zipOf: zipOf, cityOf: cityOf, streetOf: streetOf, milesBetween: milesBetween, jobKind: jobKind,
  build: build, summarize: summarize, forAssistant: forAssistant,
  parseCSV: parseCSV, importAdsCSV: importAdsCSV, cleanNum: cleanNum, cleanDate: cleanDate,
  parseSpc: parseSpc, stormZips: stormZips, spcUrls: spcUrls, inServiceArea: inServiceArea, seasonFor: seasonFor,
  scrubTargeting: scrubTargeting, complianceFor: complianceFor, num: num
};
});
