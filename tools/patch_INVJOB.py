#!/usr/bin/env python3
# INVJOB (owner 11/23: "it read the wrong job — the address on the bill is another job's"):
# a QuickBooks bill / sub invoice whose memo names a full street address ("418 Maplecrest Rd Demoville TN") went on a job whose
# address is a city only ("Demoville TN"). The job finders in the page now agree with netlify/functions/_lib/subinv.js:
#   - a full street address (house # + street + Rd / St / Dr …) on the bill beats a city-only match, a bare PO-looking token or a name;
#   - a bill whose street address is not the job's street (contradicting evidence) is never put on that job by itself (a person picks
#     in 🧾 Match this invoice / 🔗 Bills); a PO typed / labelled "PO" on the bill still wins (patch MONEY);
#   - nothing a person picked is moved (the finders only look at bills with no job).
# Also: "A&amp;Z Demo Supply LLC" (QuickBooks' text, HTML-escaped twice on screen) shows as "A&Z Demo Supply LLC" on ✅ Approvals.
# Every anchor below must occur exactly once.
import re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(p, encoding='utf-8').read()
assert not re.search(r'\bINVJOB\b', s), 'already patched'   # (INVJOBS, 11/20, is another patch)
def rep(a, b):
    global s
    n = s.count(a)
    assert n == 1, (n, a[:120])
    s = s.replace(a, b)

# ── 1. the sub-invoice router (_gcMatchSubInvoice, every 60 s on new sub invoices) ──
rep("""    var spaced=' '+String((inv.desc||'')+' '+(inv.client||'')+' '+(inv.address||'')).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
    var sp=function(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); };""",
"""    var spaced=' '+String((inv.desc||'')+' '+(inv.client||'')+' '+(inv.address||'')).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
    var sp=function(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); };
    /* INVJOB: the bill's own full street address(es) — house # + street + Rd / St / Dr … ("418 Maplecrest rd") */
    var ijKeys=(window._gcInvJobStreets?window._gcInvJobStreets(spaced):[]);""")
rep("""      var conf=0, signals=0;
      // Strong single signals (each near-certain on its own)
      var exactPO = poText && pp && poText===pp;""",
"""      var conf=0, signals=0;
      /* INVJOB: the bill names a street; this job has another street on file ('other') or none at all, a city only ('none') */
      var ijVs=ijKeys.length&&window._gcInvJobVs?window._gcInvJobVs(ijKeys, p.address||p.jobAddress||''):'';
      // Strong single signals (each near-certain on its own)
      var exactPO = poText && pp && poText===pp;""")
rep("""      if(pa && !exactAddr && jobText.indexOf(pa)>-1 && pa.length>6){ conf+=35; signals++; }""",
"""      if(pa && !exactAddr && jobText.indexOf(pa)>-1 && pa.length>6 && ijVs!=='none'){ conf+=35; signals++; }   /* INVJOB: a city alone ("Demoville TN") is no match when the bill names its own street */""")
rep("""      words(p.name).forEach(function(w){ if(w.length>3 && jobText.indexOf(norm(w))>-1) conf+=8; });
      if(conf>bestJobConf){""",
"""      words(p.name).forEach(function(w){ if(w.length>3 && jobText.indexOf(norm(w))>-1) conf+=8; });
      if(ijVs==='other' && !exactPO){ conf=Math.max(0, conf-60); strong=false; }   /* INVJOB: the bill's street is not this job's — contradicting evidence */
      if(conf>bestJobConf){""")

rep("""      var exactAddr = pa && invAddr && (invAddr===pa || (pa.length>10 && invAddr.indexOf(pa)>-1));""",
"""      var exactAddr = pa && invAddr && (invAddr===pa || (pa.length>10 && invAddr.indexOf(pa)>-1));
      if(exactAddr && !/\\d{1,6}\\s+[a-z]/i.test(String(p.address||''))) exactAddr=false;   /* INVJOB: a job address with no house # / street ("Demoville TN") is a city only — never an "exact address" */""")

# ── 2. FINDJOB (_gcJobMatchesForInvoice / _gcJobForInvoice, the 60 s background finder + re-check) ──
rep("""  var invClient=imName(inv.client||inv.customer||'');
  list.forEach(function(p){
    if(!imLive(p)) return;
    var how='', st=0;
    var ak=imAddrKey(p.address||p.addr||p.jobAddress);
    if(ak && text && imAddrIn(text, ak)){ how='the address '+String(p.address||'').split(',')[0]; st=3; }""",
"""  var invClient=imName(inv.client||inv.customer||'');
  var ijKeys=window._gcInvJobStreets?window._gcInvJobStreets(text):[];   /* INVJOB: the bill's own street address(es) */
  list.forEach(function(p){
    if(!imLive(p)) return;
    var how='', st=0;
    var ak=imAddrKey(p.address||p.addr||p.jobAddress);
    if(ak && text && imAddrIn(text, ak)){ how='the address '+String(p.address||'').split(',')[0]; st=3; }
    if(!st && ijKeys.length && window._gcInvJobVs && window._gcInvJobVs(ijKeys, p.address||p.addr||p.jobAddress||'')==='other') return;   /* INVJOB: another street than the bill's — never by its name / customer */""")

# ── 3. INVLINK (the evidence matcher: QuickBooks history import, 🔗 Bills, Assign guesses) ──
rep("""function ctxFor(inv, projects, opts){
  var text = textOf(inv), amap = (opts && opts.amap) || ALIAS;""",
"""/* INVJOB (owner 11/23): the bill's own FULL street address — house # + street + Rd / St / Dr … (not "2 coats", not a ZIP) — and how a job's
   street compares: 'same', 'other' (the job has another street on file), 'none' (the job has no street: a city only, "Demoville TN") */
var IJ_SUF = /^(st|street|rd|road|dr|drive|ln|lane|cv|cove|ave|av|avenue|blvd|boulevard|ct|court|cir|circle|pl|place|pkwy|parkway|way|trl|trail|loop|pike|ter|terrace|hwy|highway)$/;
function streetsStrict(text){
  var w = words(text).trim().split(' '), out = [];
  for (var i = 0; i < w.length - 2; i++) {
    if (!/^\\d{1,6}[a-z]?$/.test(w[i]) || /^(19|20)\\d\\d$/.test(w[i])) continue;
    var st = '';
    for (var j = i + 1; j < w.length && j <= i + 4; j++) { var x = w[j]; if (/^\\d/.test(x)) break; if (IJ_SUF.test(x)) { if (st && j > i + 1) out.push({ n: w[i].replace(/[a-z]$/, ''), st: st }); break; } if (!st && !STREET_SKIP.test(x) && x.length >= 3) st = x; }
  }
  return out;
}
function streetVs(billKeys, jobAddress){
  if (!billKeys || !billKeys.length) return '';
  var jk = addrKeysIn(s(jobAddress).split(',')[0]).slice(0, 1); if (!jk.length) return 'none';
  return addrHit(billKeys, jk) ? 'same' : 'other';
}
function ctxFor(inv, projects, opts){
  var text = textOf(inv), amap = (opts && opts.amap) || ALIAS;""")
rep("""  return { text: text, tw: words(text), tkeys: addrKeysIn(text), amap: amap, nums: qbNums(inv), explicitPOs: ex, qbBilled: qbBilled };
}""",
"""  /* INVJOB: a PO the bill LABELS ("PO X901", "PO#: X901") or a person typed is strong; a bare "X901" somewhere in a memo is weak */
  var lab = []; (text.toUpperCase().match(/\\bP\\.?\\s?O\\.?\\s*(?:#|NO\\.?|NUM(?:BER)?)?\\s*[:#-]?\\s*[A-Z]-?\\d{3}\\b/g) || []).forEach(function(x){ lab.push(poN(x.replace(/^P\\.?\\s?O\\.?\\s*(?:#|NO\\.?|NUM(?:BER)?)?\\s*[:#-]?\\s*/, ''))); });
  if (s(inv.po) && !isQB(inv) && !inv.autoLinked && !inv.linkedBy && !inv.autoPO) lab.push(poN(inv.po));
  return { text: text, tw: words(text), tkeys: addrKeysIn(text), amap: amap, nums: qbNums(inv), explicitPOs: ex, labelledPOs: lab, streets: streetsStrict(text), qbBilled: qbBilled };
}""")
rep("""  var ah = addrHit(tkeys, _nk.addr);
  if (ah) { sc += 90; strong = strong || 'address'; why.push('the address ' + ah); }""",
"""  var ah = addrHit(tkeys, _nk.addr);
  if (ah) { sc += 90; strong = strong || 'address'; why.push('the address ' + ah); }
  /* INVJOB: the bill names a full street address that this job does not have — another street (contradicting evidence), or none on
     file (a city only): a bare PO-looking token / the job's name words / the customer are not enough to put it here by itself */
  var ijVs = ah ? 'same' : streetVs(ctx.streets, p.address || p.jobAddress || p.addr);
  if (!ah && (ijVs === 'other' || ijVs === 'none')) {
    var poLab = pos.length && (ctx.labelledPOs || []).some(function(x){ return pos.indexOf(x) >= 0; });
    if (strong === 'po' && !poLab) { strong = ''; sc -= ijVs === 'other' ? 60 : 25; why.push(ijVs === 'other' ? 'but the bill\\'s address (' + ctx.streets[0].n + ' ' + ctx.streets[0].st + ') is another street' : 'but the bill\\'s street address (' + ctx.streets[0].n + ' ' + ctx.streets[0].st + ') is not on this job'); }
    else if (ijVs === 'other' && strong !== 'po' && strong !== 'qbjob') { sc -= 60; why.push('but the bill\\'s address (' + ctx.streets[0].n + ' ' + ctx.streets[0].st + ') is another street'); }
  }""")
rep("""return { OLDER_BEFORE: OLDER_BEFORE, ALIAS: ALIAS, nk: nk,""",
"""return { streetsStrict: streetsStrict, streetVs: streetVs, /* INVJOB */ OLDER_BEFORE: OLDER_BEFORE, ALIAS: ALIAS, nk: nk,""")
# the page-wide helpers the older finders (1, 2) call: the same rule as INVLINK's
rep("""var D = W.document;
if (!D || !D.createElement) { W._gcInvLink = CORE; return; }
if (W.__GC_PATCH_INVLINK__) return; W.__GC_PATCH_INVLINK__ = true;""",
"""var D = W.document;
/* INVJOB: the older finders (the sub-invoice router, FINDJOB) use the same full-street rule */
W._gcInvJobStreets = function(text){ try { return CORE.streetsStrict(text); } catch (e) { return []; } };
W._gcInvJobVs = function(keys, jobAddress){ try { return CORE.streetVs(keys, jobAddress); } catch (e) { return ''; } };
if (!D || !D.createElement) { W._gcInvLink = CORE; return; }
if (W.__GC_PATCH_INVLINK__) return; W.__GC_PATCH_INVLINK__ = true;""")

# ── 4. QBCSV (_gcQbMatch: the QuickBooks CSV import + 🔗 QuickBooks ↔ CRM) ──
rep("""function matchJob(input, ctx){
  input = input || {}; ctx = ctx || {};""",
"""/* INVJOB: the full street addresses in a text (house # + street + Rd / St / Dr …): a job with ANOTHER street on file is contradicted */
function streetsIn(t){
  var w = nk(t).split(' '), out = [];
  for (var i = 0; i < w.length - 2; i++) {
    if (!/^\\d{1,6}[a-z]?$/.test(w[i]) || /^(19|20)\\d\\d$/.test(w[i])) continue;
    var st = [];
    for (var j = i + 1; j < w.length && j <= i + 4; j++) { if (/^\\d/.test(w[j])) break; if (/^(st|street|rd|road|dr|drive|ln|lane|cv|cove|ave|av|avenue|blvd|boulevard|ct|court|cir|circle|pl|place|pkwy|parkway|way|trl|trail|loop|pike|hwy|highway)$/.test(w[j])) { if (st.length) out.push({ n: w[i].replace(/[a-z]$/, ''), w: st }); break; } if (!SUFX.test(w[j])) st.push(w[j]); }
  }
  return out;
}
function matchJob(input, ctx){
  input = input || {}; ctx = ctx || {};""")
rep("""  var num0 = poNorm(input.num);
  var sc = jobs.map(function(J){
    var best = { score: 0, how: '', why: '' }, n = 0;
    if (num0 && input.side === 'income' && J.qbn.indexOf(num0) >= 0) best = { score: 98, how: 'qbnum', why: 'QuickBooks invoice #' + input.num + ' is on this job' };
    srcs.forEach(function(x){ var r = scoreText(x.t, J, x.src); if (r.score) { n++; var v = r.score * x.w; if (v > best.score) best = { score: v, how: r.how, why: r.why }; } });
    if (!best.score) return null;""",
"""  var num0 = poNorm(input.num);
  var ijSt = []; srcs.forEach(function(x){ if (x.src !== 'Name column') ijSt = ijSt.concat(streetsIn(x.t)); });   /* INVJOB */
  var sc = jobs.map(function(J){
    var best = { score: 0, how: '', why: '' }, n = 0;
    if (num0 && input.side === 'income' && J.qbn.indexOf(num0) >= 0) best = { score: 98, how: 'qbnum', why: 'QuickBooks invoice #' + input.num + ' is on this job' };
    srcs.forEach(function(x){ var r = scoreText(x.t, J, x.src); if (r.score) { n++; var v = r.score * x.w; if (v > best.score) best = { score: v, how: r.how, why: r.why }; } });
    if (!best.score) return null;
    /* INVJOB: the memo names a street that is not this job's street (contradicting evidence) → only a suggestion, a person picks */
    if (ijSt.length && J.addr && best.how !== 'address' && best.how !== 'qbnum' && !ijSt.some(function(a){ return a.n === J.addr.n && (!J.addr.w.length || J.addr.w.some(function(w){ return a.w.some(function(x){ return near(x, w); }); })); })) { best.score -= 40; best.why += ' — but the memo\\'s address (' + ijSt[0].n + ' ' + ijSt[0].w.join(' ') + ') is another street'; }""")

# ── 5. ✅ Approvals: "A&amp;Z Demo Supply LLC" (QuickBooks' own HTML entity) shows as "A&Z Demo Supply LLC" ──
rep("""function rowSub(a, mine, now){
  var p = proj(a.pid), id = s(a.invId || a.id);""",
"""/* INVJOB: QuickBooks hands names / memos over HTML-escaped ("A&amp;Z Demo Supply LLC"); the card escapes them again → "R&amp;D" on screen */
function unEnt(v){ return s(v).replace(/&(amp|lt|gt|quot|#39|#x27|apos);/g, function(m, k){ return { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", apos: "'" }[k]; }); }
function rowSub(a, mine, now){
  var p = proj(a.pid), id = s(a.invId || a.id);""")
rep("""title: 'Sub invoice — ' + (s(a.sub || a.subName || a.vendor) || 'Sub') + (a.desc ? ' · ' + s(a.desc).slice(0, 60) : ''),""",
"""title: 'Sub invoice — ' + (unEnt(a.sub || a.subName || a.vendor) || 'Sub') + (a.desc ? ' · ' + unEnt(a.desc).slice(0, 60) : ''),   /* INVJOB: unEnt */""")
open(p, 'w', encoding='utf-8').write(s); print('INVJOB applied')
