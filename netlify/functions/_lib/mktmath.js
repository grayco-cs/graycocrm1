/* netlify/functions/_lib/mktmath.js — ONE copy: the CRM's 📣 Marketing → 📊 Dashboard (pasted into index.html by
   tools/patch_MKTMATH.py, window.__gcMktMath) and the server's monthly marketing e-mails (_lib/agency.js summary / monthTable,
   used by the owner's report in _lib/mktfeat.js and the agency report) — so the e-mail and the Dashboard agree.
   GrayCo marketing numbers, done right (patch MKTMATH, owner 11/19: "I need all this marketing profile to work. It's not doing
   the right math … I don't feel my data is right."). Pure functions, no network, no DOM: window.__gcMktMath in the CRM,
   module.exports in node (tools/tests/test_MKTMATH.mjs). Every figure says where it comes from (src) and how it is worked out
   (how); a figure that cannot be worked out is null with the reason (why), never 0 or Infinity.
   What counts as a MARKETING LEAD (the Dashboard's leads, close rate, cost per lead):
     · a lead on the Leads list, or a job typed straight into the CRM with no lead in front of it;
     · NOT: deleted · merged into another lead · a test (the name says TEST / "Sample Customer", or a staff member's own phone
       or e-mail) · closed by the clean-up (dismissed / archived "cleanup") · a copy of an imported job (QuickBooks /
       CompanyCam imports: their date is the day of the import, not the day the customer called) · a bid invitation or
       commercial / government bid work (PlanHub, BuildingConnected, plan rooms, public agencies, GCs — the "Bids" card) ·
       a Google LSA lead marked BAD (not a real lead) or still waiting for its good / bad mark.
   Dates are the day the lead ARRIVED (createdAt / receivedAt, in Memphis time) — not the lead's "date" field, which the
   lead inbox stamps again when a bid is revised.
   Close rate = won ÷ decided (won + lost) of the marketing leads that arrived in the period; the clean-up's closes
   (stale / duplicate / spam / test) are not losses. Revenue = the contract value of won jobs (contract + approved change
   orders; the invoiced total when the job has no contract amount), or what was invoiced / paid (basis option).
   Spend = Marketing → Dashboard → Ad spend lines + advertising charges found in Expenses. The Google Ads API is not connected,
   so nothing comes from Google by itself. */
(function(root, factory){
  var M = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = M;
  if (root && typeof root === 'object' && typeof root.document !== 'undefined') root.__gcMktMath = M;
})(typeof self !== 'undefined' ? self : this, function(){
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var x = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function r2(x){ return Math.round(x * 100) / 100; }
function digits(v){ return s(v).replace(/\D/g, '').slice(-10); }
function nkey(v){ return low(v).replace(/[^a-z0-9]/g, ''); }

/* ── dates: the day in Memphis ── */
function ctDay(v){
  if (v == null || v === '') return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  var t = typeof v === 'number' ? v : Date.parse(s(v)); if (!isFinite(t)) { var m = /^(\d{4}-\d{2}-\d{2})/.exec(s(v)); return m ? m[1] : ''; }
  try { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p; } catch (e) {}
  return new Date(t - 6 * 3600e3).toISOString().slice(0, 10);
}
function firstDay(){ for (var i = 0; i < arguments.length; i++) { var d = ctDay(arguments[i]); if (d) return d; } return ''; }
function monthAdd(m, k){ var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + '-' + ('0' + (mo + 1)).slice(-2); }

/* ── sources ── */
var LSA_RE = /google\s*lsa|local\s*services|\blsa\b|google guaranteed/i;
var WEB_RE = /^website\b|grayco-cs\.com|web ?form|website form|contact form/i;
var PHONE_RE = /^(phone( call)?|call(ed)?( in)?|call-?in|walk-?in|office call)$/i;
var SELF_RE = /self-?generated|\(direct\)|own lead|pm sourced/i;
var IMPORT_SRC = /^(quickbooks|qb|companycam|cc|estimate import|estimate builder|import(ed)?)$/i;
/* the CRM's own "how did you hear" channels; the base normalizer (patch MK's normSource) is used for the rest when given */
function baseNorm(v){
  var t = low(v); if (!t || /^(grayco|gray co|none|n\/a|na|unknown|-|—|other)$/.test(t) || IMPORT_SRC.test(t)) return t === 'other' ? 'Other' : '';
  if (/referr|friend|neighbou?r|word of mouth|family|realtor/.test(t)) return 'Referral';
  if (/repeat|past customer|existing customer|returning/.test(t)) return 'Repeat customer';
  if (/google ?ads|adwords|gclid|\bppc\b/.test(t)) return 'Google Ads';
  if (/facebook|instagram|\bfb\b|\bmeta\b/.test(t)) return 'Facebook/Instagram Ads';
  if (/business profile|\bgbp\b|\bgmb\b|google maps/.test(t)) return 'Google Business Profile';
  if (/next ?door/.test(t)) return 'Nextdoor';
  if (/yard sign|truck|wrap/.test(t)) return 'Yard sign';
  if (/google|organic|\bseo\b|bing|search/.test(t)) return 'Google organic';
  return 'Other';
}
function channelOf(v, norm){
  var t = s(v); if (!t) return '';
  if (LSA_RE.test(t)) return 'Google LSA';
  if (WEB_RE.test(t)) return 'Website';
  if (PHONE_RE.test(t)) return 'Phone call (source not asked)';
  if (SELF_RE.test(t)) return 'PM self-generated';
  if (IMPORT_SRC.test(t) || /^(grayco|gray co)$/i.test(t)) return '';
  var c = ''; try { c = norm ? s(norm(t)) : ''; } catch (e) { c = ''; }
  return c || baseNorm(t);
}
var CHANNEL_ORDER = ['Google LSA', 'Google Ads', 'Google Business Profile', 'Google organic', 'Website', 'Facebook/Instagram Ads', 'Nextdoor', 'TikTok', 'Angi/HomeAdvisor', 'Referral', 'Repeat customer', 'Yard sign', 'PM self-generated', 'Phone call (source not asked)', 'Other', '(not set)'];

/* ── what a record is ── */
var BID_SRC = /\bbids?\b|bidding|\bitb\b|\brfp\b|\brfq\b|solicit|invitation to bid|county|city of|state of|schools?\b|\bmscs\b|mscaa|airport|mlgw|bid ?board|buildingconnected|building connected|planhub|plan hub|plan ?room|sam\.gov|isqft|dodge|construct ?connect|procurement|bidnet|bonfire|general contractor|\bgc\b|gc direct/i;
var NOT_BID_SRC = /website|web form|homeowner|referr|missed call|roofscout|roof ?ignite|giveaway|coupon|roof check|facebook|instagram|google ?(ads|lsa|local)|\blsa\b|nextdoor|angi|homeadvisor|thumbtack|walk-?in|warranty|maintenance|contractor connection|alacrity|sedgwick/i;
function isBidDefault(l){
  if (!l) return false;
  var t = low(l.leadKind || l.type || l.projectType);
  if (l.websiteLead || l.origin === 'website') return /commerc|industr|gov/.test(t);
  if (/commerc|industr|gov|public|municipal|federal/.test(t)) return true;
  if (/resid|home|house|insur|storm|claim|mitig|water|fire|roof/.test(t)) return false;
  if (/^(email|watch|api|partner-bid)$/.test(s(l.origin))) return true;
  var src = [l.source, l.leadSource, l.subSource, l.origin].map(s).join(' ');
  if (NOT_BID_SRC.test(src) && !BID_SRC.test(src)) return false;
  if (BID_SRC.test(src)) return true;
  return !!(s(l.bidStatus) || s(l.bidDue) || s(l.dueToCompany) || s(l.gc) || s(l.bidNumber));
}
function bidPlatform(l){
  var t = [l.source, l.leadSource, l.subSource].map(s).join(' ');
  if (/buildingconnected|building connected/i.test(t)) return 'BuildingConnected';
  if (/planhub|plan hub/i.test(t)) return 'PlanHub';
  if (/plan ?room/i.test(t)) return 'Plan rooms';
  if (/county|city of|state of|schools?\b|airport|mscaa|mlgw|sam\.gov|bureau/i.test(t)) return 'Public agencies';
  if (/gc direct|general contractor|\bgc\b/i.test(t)) return 'GCs direct';
  if (/bid ?board/i.test(t)) return 'Bid board';
  if (WEB_RE.test(t)) return 'Website (commercial inquiry)';
  if (/companycam|quickbooks/i.test(t) || !s(t.replace(/\bgray ?co\b/ig, ''))) return 'Commercial jobs (no bid source)';
  return 'Other bid sources';
}
var TEST_RE = /\btest\b|sample customer|\bdo not use\b|\bdummy\b/i;
function testWhy(x, staff){
  var n = [x.name, x.client, x.contactName, x.customerName].map(s).join(' ');
  if (TEST_RE.test(n)) return 'a test (the name says so)';
  if (x.test === true || x.isTest === true) return 'a test (marked)';
  if (staff) { var ph = digits(x.phone || x.clientPhone || (x.contact && x.contact.phone)), em = low(x.email || x.clientEmail || (x.contact && x.contact.email));
    if ((ph.length === 10 && staff.phones[ph]) || (em && staff.emails[em])) return 'a test (a staff member\'s own phone / e-mail)'; }
  return '';
}
function deleted(x){ return !x || x.deleted === true || x._deleted === true || x.__deleted === true; }
var CLEANUP_LOST = /stale|\bold\b|duplicate|dupe|spam|junk|\btest\b|merged|clean-?up/i;
function isImportJob(p){ return /^QB_/.test(s(p.id)) || p._ccImported === true || !!p.dataEntry || !!s(p.dataEnteredAt) || (IMPORT_SRC.test(s(p.source)) && !s(p.createdVia) && !p.fromLeadId && !p.leadId); }   /* imported, or keyed in from old records in data-entry mode */
function isImportLead(l){ return /^L(QB|CC)_/.test(s(l.id)) || (!!s(l.fromProjectId) && IMPORT_SRC.test(s(l.source))) || (IMPORT_SRC.test(s(l.source)) && !s(l.createdAt) && !s(l.receivedAt)); }
var WON_JOB = /^(approved|active|in[ _-]?progress|completed?|closed|won|on[ _-]?hold|punch|scheduled|sold|signed)/i;
var LOST_JOB = /^(lost|cancel|declin|dead|no[ _-]?go|rejected)/i;
function lsaMark(l){ var c = low(l.lsaCheck || (l.leadExtra && l.leadExtra.lsaCheck)); if (c === 'good' || c === 'bad' || c === 'no_answer') return c; if (c === 'pm_good' || c === 'pm_bad' || c === 'pending') return 'pending'; if (/not a real lead/i.test(s(l.lostReason))) return 'bad'; return c ? 'pending' : ''; }
function isLsaLead(l){ var ex = l.leadExtra || {}; return !!(l.lsaCheck || ex.lsaCheck || l.lsaCall || LSA_RE.test([l.source, l.leadSource, l.mkSource, ex.leadSource].map(s).join(' '))); }

/* ── money on a job ── */
function isClientInv(iv){ var t = low(iv.type); if (/sub|supplier|bill|vendor|expense|purchase/.test(t)) return false; return !(iv.sub || iv.subId || iv.supplier); }
function invAmt(iv){ return num(iv.amt != null ? iv.amt : (iv.amount != null ? iv.amount : iv.total)); }
function invPaid(iv){ var got = num(iv.paidAmt || iv.amountPaid); arr(iv.payments).forEach(function(p){ got += num(p.amt || p.amount); }); if (!got && (iv.paid === true || /^paid$/i.test(s(iv.status)) || s(iv.paidDate))) got = invAmt(iv); return Math.min(got || 0, invAmt(iv) || got || 0); }

/* D = { leads, projects, invs, expenses, spend:[{channel, month|date, amount, origin}], srcfix:{'l:<id>'|'p:<id>': channel}, users,
         now:'YYYY-MM-DD' (Memphis), basis:'contract'|'invoiced'|'paid', months:12, normSource(fn), isBid(fn), contractOf(fn(p)) } */
function compute(D){
  D = D || {};
  var now = s(D.now) || ctDay(Date.now()), tm = now.slice(0, 7), lm = monthAdd(tm, -1), nMonths = D.months || 12;
  var months = []; for (var i = nMonths - 1; i >= 0; i--) months.push(monthAdd(tm, -i));
  var from = months[0], inWin = function(d){ return !!d && d.slice(0, 7) >= from && d <= now; };
  var basis = /^(invoiced|paid)$/.test(s(D.basis)) ? s(D.basis) : 'contract';
  var norm = typeof D.normSource === 'function' ? D.normSource : null;
  var isBid = typeof D.isBid === 'function' ? function(x){ try { return !!D.isBid(x); } catch (e) { return isBidDefault(x); } } : isBidDefault;
  var fix = D.srcfix || {};
  var staff = { phones: {}, emails: {}, names: {} };
  arr(D.users).forEach(function(u){ var nm = low(u.name).replace(/\s+/g, ' '); if (nm) staff.names[nm] = 1; var ph = digits(u.phone || u.cell); if (ph.length === 10) staff.phones[ph] = 1; var em = low(u.email); if (em) staff.emails[em] = 1; });

  /* invoices by job */
  var inv = {};
  arr(D.invs).forEach(function(iv){ if (deleted(iv) || !iv.pid || !isClientInv(iv) || /void|cancel|draft|declin/.test(low(iv.status))) return; var a = invAmt(iv); if (!a) return;
    var x = inv[iv.pid] || (inv[iv.pid] = { invoiced: 0, paid: 0, first: '' }); x.invoiced += a; x.paid += invPaid(iv); var d = firstDay(iv.date, iv.sentDate, iv.issueDate, iv.created); if (d && (!x.first || d < x.first)) x.first = d; });

  var excluded = [], exN = {};
  function exclude(kind, why, x, what){ excluded.push({ kind: kind, why: why, id: s(x.id), label: s(x.name || x.client) || '(no name)', what: what }); exN[kind] = (exN[kind] || 0) + 1; }

  /* the jobs */
  var jobs = [], jobById = {};
  arr(D.projects).forEach(function(p){
    if (!p.id) return;
    if (deleted(p)) return exclude('deleted', 'deleted', p, 'job');
    if (p.overhead === true || /overhead/i.test(s(p.archivedWhy))) return exclude('overhead', 'GrayCo overhead, not a customer job', p, 'job');
    var tw = testWhy(p, null); if (tw) return exclude('test', tw, p, 'job');
    var st = s(p.status), imp = isImportJob(p), m = inv[p.id] || { invoiced: 0, paid: 0, first: '' };
    var contract = 0; try { contract = typeof D.contractOf === 'function' ? num(D.contractOf(p)) : num(p.contract); } catch (e) { contract = num(p.contract); }
    var money = contract > 0 || m.invoiced > 0;
    var won = (WON_JOB.test(st) || p.paidInFull === true) && !LOST_JOB.test(st);
    if (won && imp && !money) won = false;   /* an imported customer record with no contract and no invoice is not a won job */
    var lost = !won && LOST_JOB.test(st);
    var j = { id: s(p.id), p: p, imported: imp, created: imp ? '' : firstDay(p.createdAt, p.created), won: won, lost: lost, bid: isBid(p), contract: r2(contract), invoiced: r2(m.invoiced), paid: r2(m.paid),
      wonDate: won ? firstDay(p.contractSignedAt, p.signedAt, p.approvedAt, p.soldAt, p.wonAt, p.startDate, m.first, p.completedAt, p.completionDate, imp ? '' : p.createdAt, imp ? '' : p.created) : '',
      noValue: imp && !money };
    j.value = basis === 'invoiced' ? j.invoiced : basis === 'paid' ? j.paid : (j.contract || j.invoiced);
    j.valueWhy = basis !== 'contract' ? basis : (j.contract ? 'contract' : (j.invoiced ? 'invoiced (no contract amount)' : 'no amount'));
    jobs.push(j); jobById[j.id] = j;
  });
  /* the same imported job brought in more than once: keep one */
  var seenJob = {};
  jobs.forEach(function(j){ if (!j.imported || !j.won) return; var k = nkey(j.p.name) + '|' + j.contract + '|' + j.invoiced; if (seenJob[k]) { j.won = false; j.dupOf = seenJob[k]; exclude('duplicate', 'the same imported job twice', j.p, 'job'); } else seenJob[k] = j.id; });

  /* the leads */
  var leadsOut = [], linked = {};
  function chOf(v){ var n = low(v).replace(/\s+/g, ' '); if (n && staff.names[n]) return 'PM self-generated'; return channelOf(v, norm); }   /* a PM's own name as the source = his own lead */
  function sourceOf(l, j){
    var c = '';
    if (j && fix['p:' + j.id]) return { ch: channelOf(fix['p:' + j.id], norm) || fix['p:' + j.id], why: 'set in Marketing (Lead source tagging)' };
    if (l && fix['l:' + l.id]) return { ch: channelOf(fix['l:' + l.id], norm) || fix['l:' + l.id], why: 'set in Marketing (Lead source tagging)' };
    if (l) {
      if (isLsaLead(l) && !(l.websiteLead && !LSA_RE.test(s(l.source) + ' ' + s(l.leadSource)))) return { ch: 'Google LSA', why: 'Google LSA lead' };
      var a = l.attrib || l.attribution || null;
      if (a && typeof a === 'object' && (a.gclid || (a.fields && a.fields.gclid))) return { ch: 'Google Ads', why: 'Google click id on the website form' };
      var fs = ['howHeard', 'mkSource', 'source', 'leadSource', 'channel'];
      for (var i = 0; i < fs.length; i++) { c = chOf(l[fs[i]]); if (c) return { ch: c, why: 'lead: ' + fs[i] + ' "' + s(l[fs[i]]) + '"' }; }
    }
    if (j) { var p = j.p, ps = ['howHeard', 'mkSource', 'channel', 'leadSource', 'source'];
      for (var k = 0; k < ps.length; k++) { c = chOf(p[ps[k]]); if (c) return { ch: c, why: 'job: ' + ps[k] + ' "' + s(p[ps[k]]) + '"' }; } }
    return { ch: '(not set)', why: 'no source on the lead or the job' };
  }
  arr(D.leads).forEach(function(l){
    if (!l.id) return;
    if (deleted(l)) return exclude('deleted', 'deleted', l, 'lead');
    if (s(l.mergedInto) && s(l.mergedInto) !== s(l.id)) return exclude('merged', 'merged into another lead', l, 'lead');
    var tw = testWhy(l, staff); if (tw) return exclude('test', tw, l, 'lead');
    if (isImportLead(l)) return exclude('imported', 'a copy of an imported job (QuickBooks / CompanyCam) — no real lead date', l, 'lead');
    if (l.dismissed === true || /clean-?up/i.test(s(l.archivedWhy)) || s(l.mergedInto)) return exclude('cleanup', 'closed by the clean-up (dismissed / archived)', l, 'lead');
    var d = firstDay(l.createdAt, l.receivedAt, l.inboxAt, l.leadExtra && l.leadExtra.receivedAt, l.created, l.date);
    /* the job it became: only by the ids the CRM writes when a lead becomes a job */
    var j = null; ['pid', 'projectId', 'jobId', 'convertedTo'].some(function(k){ var id = s(l[k]); if (id && jobById[id]) { j = jobById[id]; return true; } return false; });
    if (!j) jobs.some(function(x){ if (x.p.fromLeadId === l.id || x.p.leadId === l.id || x.p.lead === l.id) { j = x; return true; } return false; });
    if (j) linked[j.id] = l.id;
    var bid = isBid(l);
    var mark = isLsaLead(l) ? lsaMark(l) : '';
    var stage = low(l.stage), status = low(l.status), bst = low(l.bidStatus);
    var won = !!(j && j.won) || /^(won|sold)\b/.test(stage) || /^(won|converted)$/.test(status) || bst === 'won' || l.converted === true || !!s(l.convertedAt);
    var lostRaw = !won && (stage === 'lost' || status === 'lost' || bst === 'lost' || /^(dead|no bid)/.test(bst));
    var cleanupLoss = lostRaw && CLEANUP_LOST.test(s(l.lostReason || l.lostWhy));
    var src = sourceOf(l, j);
    leadsOut.push({ id: s(l.id), kind: 'lead', label: s(l.name || l.client) || '(no name)', date: d, month: d.slice(0, 7), channel: src.ch, why: src.why,
      raw: s(l.source || l.leadSource), bid: bid, platform: bid ? bidPlatform(l) : '', lsa: mark, isLsa: isLsaLead(l), won: won, lost: lostRaw && !cleanupLoss, cleanupLoss: cleanupLoss,
      jobId: j ? j.id : '', value: j && j.won ? j.value : 0, valueWhy: j && j.won ? j.valueWhy : '', wonDate: j && j.won ? j.wonDate : (won ? firstDay(l.wonAt, l.convertedAt) : '') });
  });
  /* a job typed straight into the CRM (not imported) with no lead in front of it: a lead that was won at once */
  jobs.forEach(function(j){
    if (linked[j.id] || j.imported || j.dupOf) return;
    var src = sourceOf(null, j);
    leadsOut.push({ id: 'p:' + j.id, kind: 'job', label: s(j.p.name || j.p.client) || '(no name)', date: j.created, month: j.created.slice(0, 7), channel: src.ch, why: src.why, raw: s(j.p.leadSource || j.p.source),
      bid: j.bid, platform: j.bid ? bidPlatform(j.p) : '', lsa: '', isLsa: false, won: j.won, lost: j.lost, cleanupLoss: false, jobId: j.id, value: j.won ? j.value : 0, valueWhy: j.won ? j.valueWhy : '', wonDate: j.wonDate });
  });

  /* LSA leads that are not counted (bad / waiting) */
  var counted = [], lsa = { leads: 0, good: 0, bad: 0, pending: 0, noAnswer: 0, won: 0, thisMonth: 0, list: [] };
  leadsOut.forEach(function(o){
    if (o.bid) { counted.push(o); return; }
    if (o.isLsa && inWin(o.date)) { lsa.leads++; if (o.month === tm) lsa.thisMonth++; if (o.lsa === 'good') lsa.good++; else if (o.lsa === 'bad') lsa.bad++; else if (o.lsa === 'no_answer') lsa.noAnswer++; else lsa.pending++; if (o.won) lsa.won++; lsa.list.push(o); }
    if (o.isLsa && !o.won && o.lsa !== 'good') { if (o.lsa === 'bad') exclude('lsaBad', 'Google LSA lead marked BAD (not a real lead)', { id: o.id, name: o.label }, 'lead'); else exclude('lsaWait', 'Google LSA lead still waiting for its good / bad mark', { id: o.id, name: o.label }, 'lead'); return; }
    counted.push(o);
  });

  /* spend */
  var spend = arr(D.spend).filter(function(x){ return !x.del && num(x.amount) > 0; }).map(function(x){
    var d = ctDay(x.date) || (/^\d{4}-\d{2}$/.test(s(x.month)) ? s(x.month) + '-01' : '');
    var ch = LSA_RE.test(s(x.channel) + ' ' + s(x.campaign) + ' ' + s(x.note)) ? 'Google LSA' : (channelOf(x.channel, norm) || s(x.channel) || 'Other');
    return { channel: ch, month: d.slice(0, 7), amount: num(x.amount), origin: s(x.origin) || 'manual' };
  });
  var anySpend = spend.some(function(x){ return x.month >= from; });

  /* the table */
  var by = {};
  function row(ch){ return by[ch] || (by[ch] = { channel: ch, thisMonth: 0, lastMonth: 0, leads: 0, won: 0, lost: 0, decided: 0, wonJobs: 0, revenue: 0, spend: 0, spendThisMonth: 0, spendLastMonth: 0, list: [] }); }
  var mk = counted.filter(function(o){ return !o.bid; });
  mk.forEach(function(o){ var r = row(o.channel);
    if (o.month === tm) r.thisMonth++; if (o.month === lm) r.lastMonth++;
    if (inWin(o.date)) { r.leads++; r.list.push(o); if (o.won) r.won++; else if (o.lost) r.lost++; }
    if (o.won && inWin(o.wonDate || o.date)) { r.wonJobs++; r.revenue += o.value; } });
  spend.forEach(function(x){ if (x.month < from) return; var r = row(x.channel); r.spend += x.amount; if (x.month === tm) r.spendThisMonth += x.amount; if (x.month === lm) r.spendLastMonth += x.amount; });
  function per(sp, n, what){ if (!sp) return { v: null, why: 'no spend data' }; if (!n) return { v: null, why: 'spend but no ' + what }; return { v: r2(sp / n), why: '' }; }
  var channels = Object.keys(by).map(function(k){ var r = by[k];
    r.revenue = r2(r.revenue); r.spend = r2(r.spend); r.decided = r.won + r.lost;
    r.closeRate = r.decided ? r2(r.won / r.decided * 100) : null; r.closeRateWhy = r.decided ? '' : 'no won or lost leads yet';
    r.winRate = r.leads ? r2(r.won / r.leads * 100) : null;
    var a = per(r.spendThisMonth, r.thisMonth, 'leads this month'), b = per(r.spend, r.leads, 'leads'), c = per(r.spend, r.wonJobs, 'won jobs');
    r.cplThisMonth = a.v; r.cplThisMonthWhy = a.why; r.cpl = b.v; r.cplWhy = b.why; r.costPerJob = c.v; r.costPerJobWhy = c.why;
    r.roas = r.spend ? r2(r.revenue / r.spend) : null; r.roasWhy = r.spend ? '' : 'no spend data';
    r.roi = r.spend ? r2((r.revenue - r.spend) / r.spend * 100) : null;
    return r; }).sort(function(x, y){ var ix = CHANNEL_ORDER.indexOf(x.channel), iy = CHANNEL_ORDER.indexOf(y.channel); return (ix < 0 ? 90 : ix) - (iy < 0 ? 90 : iy) || (x.channel < y.channel ? -1 : 1); });

  var tot = { thisMonth: 0, lastMonth: 0, leads: 0, won: 0, lost: 0, wonJobs: 0, revenue: 0, spend: 0, spendThisMonth: 0, notSet: 0 };
  channels.forEach(function(r){ tot.thisMonth += r.thisMonth; tot.lastMonth += r.lastMonth; tot.leads += r.leads; tot.won += r.won; tot.lost += r.lost; tot.wonJobs += r.wonJobs; tot.revenue += r.revenue; tot.spend += r.spend; tot.spendThisMonth += r.spendThisMonth; if (r.channel === '(not set)') tot.notSet = r.leads; });
  tot.revenue = r2(tot.revenue); tot.spend = r2(tot.spend); tot.decided = tot.won + tot.lost;
  tot.closeRate = tot.decided ? r2(tot.won / tot.decided * 100) : null; tot.winRate = tot.leads ? r2(tot.won / tot.leads * 100) : null;
  var t1 = per(tot.spendThisMonth, tot.thisMonth, 'leads this month'), t2 = per(tot.spend, tot.leads, 'leads'), t3 = per(tot.spend, tot.wonJobs, 'won jobs');
  tot.cplThisMonth = t1.v; tot.cplThisMonthWhy = t1.why; tot.cpl = t2.v; tot.cplWhy = t2.why; tot.costPerJob = t3.v; tot.costPerJobWhy = t3.why;

  /* won jobs that did not come through a marketing lead (imported history / bids) still made money: shown apart */
  var other = { importedWon: 0, importedRevenue: 0, bidWon: 0, bidRevenue: 0 };
  jobs.forEach(function(j){ if (!j.won || !inWin(j.wonDate)) return; if (j.bid) { other.bidWon++; other.bidRevenue += j.value; } else if (j.imported && !linked[j.id]) { other.importedWon++; other.importedRevenue += j.value; } });
  other.bidRevenue = r2(other.bidRevenue); other.importedRevenue = r2(other.importedRevenue);
  /* imported jobs the owner tagged with a source (Lead source tagging): their money by source, for the record */
  var tagged = {};
  jobs.forEach(function(j){ if (!j.imported || !j.won || j.bid || !inWin(j.wonDate)) return; var l = null; arr(D.leads).some(function(x){ if (s(x.fromProjectId) === j.id && fix['l:' + x.id]) { l = x; return true; } return false; });
    var ch = fix['p:' + j.id] || (l ? fix['l:' + l.id] : ''); if (!ch) return; ch = channelOf(ch, norm) || ch; var t = tagged[ch] || (tagged[ch] = { channel: ch, jobs: 0, revenue: 0 }); t.jobs++; t.revenue = r2(t.revenue + j.value); });

  /* bids */
  var bids = { thisMonth: 0, lastMonth: 0, n: 0, won: 0, lost: 0, byPlatform: {} };
  counted.concat([]).forEach(function(o){ if (!o.bid) return; var b = bids.byPlatform[o.platform] || (bids.byPlatform[o.platform] = { platform: o.platform, thisMonth: 0, lastMonth: 0, n: 0, won: 0, lost: 0 });
    if (o.month === tm) { bids.thisMonth++; b.thisMonth++; } if (o.month === lm) { bids.lastMonth++; b.lastMonth++; }
    if (inWin(o.date)) { bids.n++; b.n++; if (o.won) { bids.won++; b.won++; } else if (o.lost) { bids.lost++; b.lost++; } } });
  bids.platforms = Object.keys(bids.byPlatform).map(function(k){ return bids.byPlatform[k]; }).sort(function(a, b){ return b.n - a.n; }); delete bids.byPlatform;

  lsa.spend = r2(spend.filter(function(x){ return x.channel === 'Google LSA' && x.month >= from; }).reduce(function(a, x){ return a + x.amount; }, 0));
  var lp = per(lsa.spend, lsa.good, 'good LSA leads'); lsa.costPerGood = lp.v; lsa.costPerGoodWhy = lp.why;
  lsa.list = lsa.list.map(function(o){ return { id: o.id, label: o.label, date: o.date, mark: o.lsa || 'pending', won: o.won }; });

  var exByKind = {}; excluded.forEach(function(x){ (exByKind[x.kind] = exByKind[x.kind] || []).push(x); });
  return { now: now, thisMonth: tm, lastMonth: lm, months: months, from: from, basis: basis, channels: channels, totals: tot, bids: bids, lsa: lsa, other: other, tagged: Object.keys(tagged).map(function(k){ return tagged[k]; }),
    spend: { any: anySpend, rows: spend }, excluded: exN, excludedList: exByKind, leads: leadsOut, marketing: mk };
}

/* advertising charges in Expenses → spend lines (the Dashboard's rule, patch MONEY's mkSpend): one line per channel per month,
   skipped where a hand-entered Ad spend line already covers that channel and month */
var AD_RE = /facebk|facebook|meta ?ads|instagram|google ?ads|adwords|google \*ads|angi|homeadvisor|thumbtack|nextdoor|yelp|roof ?ignite|porch|modernize|networx|bark\.com|tiktok|linkedin ads|bing ads|microsoft ads|valpak|mailchimp|constant contact/;
var AD_CH = [[/local services|\blsa\b/i, 'Google LSA'], [/facebk|facebook|\bmeta\b|instagram|\bfb\b/i, 'Facebook/Instagram Ads'], [/google ?\*? ?ads|adwords|google ads/i, 'Google Ads'], [/angi|homeadvisor/i, 'Angi/HomeAdvisor'],
  [/thumbtack/i, 'Thumbtack'], [/nextdoor/i, 'Nextdoor'], [/roof ?ignite/i, 'Roof Ignite'], [/tiktok/i, 'TikTok'], [/porch/i, 'Porch'], [/modernize/i, 'Modernize'], [/networx/i, 'Networx'], [/bark\.com/i, 'Bark']];
function withExpenseSpend(spend, expenses, norm){
  var base = arr(spend).filter(function(x){ return !x.del; }), have = {};
  base.forEach(function(x){ var ch = channelOf(x.channel, norm) || s(x.channel); have[ch + '|' + s(x.month || x.date).slice(0, 7)] = 1; });
  var add = {};
  arr(expenses).forEach(function(e){
    if (deleted(e) || /reject|void/i.test(s(e.status))) return;
    var vendor = s(e.vendor || e.payee || e.desc), isAd = /advertis|marketing|lead\s*gen|leads?\b/i.test(s(e.category)) || AD_RE.test(low(vendor));
    if (!isAd) return;
    var amt = num(e.amt != null ? e.amt : e.amount); if (!(amt > 0)) return;
    var t = vendor + ' ' + s(e.desc), ch = ''; for (var i = 0; i < AD_CH.length; i++) if (AD_CH[i][0].test(t)) { ch = AD_CH[i][1]; break; }
    ch = ch || channelOf(vendor, norm) || 'Other';
    var mo = s(e.date).slice(0, 7); if (!/^\d{4}-\d{2}$/.test(mo) || have[ch + '|' + mo]) return;
    var k = ch + '|' + mo; add[k] = add[k] || { channel: ch, month: mo, amount: 0, origin: 'expenses', note: 'from Expenses / card charges' }; add[k].amount = r2(add[k].amount + amt);
  });
  return base.concat(Object.keys(add).map(function(k){ return add[k]; }));
}

/* one month of a compute() result, for the monthly e-mails: the marketing leads that ARRIVED that month by source, how many
   are won so far and their value, that month's spend, cost per lead / per job won (null + why without spend), and the bids */
function monthTable(r, m){
  var by = {};
  function row(ch){ return by[ch] || (by[ch] = { channel: ch, leads: 0, won: 0, lost: 0, revenue: 0, spend: 0 }); }
  arr(r && r.marketing).forEach(function(o){ if (o.month !== m) return; var x = row(o.channel); x.leads++; if (o.won) { x.won++; x.revenue += o.value; } else if (o.lost) x.lost++; });
  arr(r && r.spend && r.spend.rows).forEach(function(x){ if (x.month === m) row(x.channel).spend += x.amount; });
  function fin(x){ x.revenue = r2(x.revenue); x.spend = r2(x.spend);
    x.cpl = x.spend && x.leads ? r2(x.spend / x.leads) : null; x.cplWhy = x.cpl != null ? '' : (x.spend ? 'spend but no leads' : 'no spend data');
    x.costPerWon = x.spend && x.won ? r2(x.spend / x.won) : null; x.costPerWonWhy = x.costPerWon != null ? '' : (x.spend ? 'spend but no won jobs' : 'no spend data');
    x.roas = x.spend && x.revenue ? r2(x.revenue / x.spend) : null; return x; }
  var rows = Object.keys(by).map(function(k){ return fin(by[k]); }).sort(function(a, b){ var ia = CHANNEL_ORDER.indexOf(a.channel), ib = CHANNEL_ORDER.indexOf(b.channel); return (ia < 0 ? 90 : ia) - (ib < 0 ? 90 : ib) || (a.channel < b.channel ? -1 : 1); });
  var t = fin(rows.reduce(function(a, x){ a.leads += x.leads; a.won += x.won; a.lost += x.lost; a.spend += x.spend; a.revenue += x.revenue; return a; }, { channel: 'Total', leads: 0, won: 0, lost: 0, spend: 0, revenue: 0 }));
  var bids = arr(r && r.leads).filter(function(o){ return o.bid && o.month === m; }).length;
  return { month: m, rows: rows, totals: t, bids: bids, basis: r ? r.basis : 'contract' };
}

/* reviews / referrers / newsletter — the same "no data yet" rules */
function reviews(list){
  var R = arr(list).filter(function(r){ return !r.del; }), g = R.filter(function(r){ return /google/i.test(s(r.source)); });
  var rated = R.filter(function(r){ return num(r.rating) > 0; });
  return { n: R.length, google: g.length, byHand: R.length - g.length, avg: rated.length ? Math.round(rated.reduce(function(a, r){ return a + num(r.rating); }, 0) / rated.length * 10) / 10 : null, avgWhy: rated.length ? '' : 'no reviews in the CRM yet' };
}
function pctOrNull(a, b){ return b ? Math.round(a / b * 100) : null; }

return { compute: compute, monthTable: monthTable, withExpenseSpend: withExpenseSpend, reviews: reviews, pctOrNull: pctOrNull, channelOf: channelOf, isBidDefault: isBidDefault, bidPlatform: bidPlatform, testWhy: testWhy, isImportJob: isImportJob, isImportLead: isImportLead, ctDay: ctDay, monthAdd: monthAdd, CHANNEL_ORDER: CHANNEL_ORDER };
});
