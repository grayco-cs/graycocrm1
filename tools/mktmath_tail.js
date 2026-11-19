/* __GC_PATCH_MKTMATH__ — 📣 Marketing → 📊 Dashboard, the numbers done right (owner 11/19: "I need all this marketing profile to
   work. It's not doing the right math etc. I don't feel my data is right.").
   The Dashboard now counts with window.__gcMktMath (the block above): MARKETING leads only (no bid invitations, tests, merged /
   deleted / cleaned-up leads, copies of imported jobs, Google LSA leads marked bad or not marked yet), the day each lead arrived
   (Memphis time), close rate = won ÷ decided, revenue = contract value of won jobs (switch: invoiced / paid), and spend from the
   Ad spend lines + advertising charges in Expenses. Every number has a "?" with where it comes from and how it is worked out;
   with no spend the money-per-lead cells say "no spend data" (never $0 or ∞).
   Also here: 🏗 Bid invitations (PlanHub, BuildingConnected, plan rooms, agencies …) as their own card, 📍 Google LSA (good / bad /
   waiting, why it is near zero), 🧹 what was left out and why, money that did not come through a marketing lead, and
   ⭐ Review tracker "asked → received" shows "—" when nothing was asked yet.
   The Marketing Manager's own Dashboard (patch MM: 📈 My leads) is left as it is. API: window._gcMktMathUI = { data(), result(), html() } */
(function(W){
'use strict';
if (W.__GC_PATCH_MKTMATH__) return; W.__GC_PATCH_MKTMATH__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var X = null, MM = null, tries = 0, LAST = null;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ if (n == null || !isFinite(n)) return '—'; return '$' + Math.round(n).toLocaleString('en-US'); }
function money2(n){ if (n == null || !isFinite(n)) return '—'; return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(n){ return n == null || !isFinite(n) ? '—' : (Math.round(n * 10) / 10) + '%'; }
function lsGet(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function crm(){ return W._crm || {}; }
function mon(m){ if (!m) return ''; var d = new Date(m + '-15T12:00:00'); return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }

/* "?" — where the number comes from and how it is worked out */
function q(text){ return '<details class="gmm-q"><summary aria-label="Where this number comes from">?</summary><div>' + text + '</div></details>'; }
function nodata(t){ return '<span class="gmm-nd">' + esc(t) + '</span>'; }

function basis(){ var b = lsGet('gc_mktmath_basis'); return /^(invoiced|paid)$/.test(b) ? b : 'contract'; }
var BASIS_L = { contract: 'contract value', invoiced: 'invoiced', paid: 'paid' };
function leadsList(){
  var a = X && X.DATA ? arr(X.DATA.leads) : [];
  if (!a.length) a = arr(crm().leads); if (!a.length) a = arr(W.__gcLeadsLive);
  return a;
}
function invsList(){ var c = crm(); var a = arr(c.invoices); return a.length ? a : arr(c.invs); }
function data(){
  var MK = X.MK, sp = MM.withExpenseSpend(MK.all('spend'), crm().expenses, X.M && X.M.normSource);   /* the same rule as the monthly e-mails */
  var fix = {}; MK.all('srcfix').forEach(function(r){ if (r.key && r.channel) fix[r.key] = r.channel; });
  return { leads: leadsList(), projects: arr(crm().projects), invs: invsList(), expenses: arr(crm().expenses), spend: sp, srcfix: fix, users: arr(crm().users),
    now: MM.ctDay(Date.now()), basis: basis(), normSource: X.M && X.M.normSource,
    isBid: typeof W._gcIsBidLead === 'function' ? W._gcIsBidLead : null,
    contractOf: typeof W._gcContractWithCOs === 'function' ? function(p){ return W._gcContractWithCOs(p.id); } : null };
}
function result(){ LAST = MM.compute(data()); return LAST; }

var EX_L = { deleted: 'deleted', merged: 'merged into another lead (a duplicate)', test: 'tests (TEST in the name, "Sample Customer", a staff member\'s own phone / e-mail)',
  imported: 'copies of imported jobs (QuickBooks / CompanyCam): the date is the import day, not the day the customer called', cleanup: 'closed by the clean-up (dismissed / archived)',
  duplicate: 'the same imported job brought in more than once', overhead: 'GrayCo overhead, not a customer job', lsaBad: 'Google LSA leads marked BAD (not a real lead)', lsaWait: 'Google LSA leads still waiting for their good / bad mark' };

function leadRows(list){
  if (!list.length) return '<div class="gmt-muted">None.</div>';
  return '<div class="gmm-scroll"><table><tr><th>Arrived</th><th>Lead / job</th><th>Source — why</th><th>Result</th></tr>' + list.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; }).slice(0, 80).map(function(o){
    return '<tr><td>' + esc(o.date || '—') + '</td><td>' + esc(o.label) + (o.kind === 'job' ? ' <span class="gmt-muted">(job typed in, no lead)</span>' : '') + '</td><td><span class="gmt-muted">' + esc(o.why) + '</span></td><td>' +
      (o.won ? 'won' + (o.value ? ' · ' + money(o.value) : '') : o.lost ? 'lost' : o.cleanupLoss ? 'closed by clean-up (not a loss)' : 'open') + '</td></tr>'; }).join('') + '</table></div>' + (list.length > 80 ? '<div class="gmt-muted">The newest 80 shown.</div>' : '');
}

function html(){
  var r = result(), t = r.totals, B = r.basis, h = '';
  var HOW_LEAD = 'Counted from the CRM\'s Leads list, plus jobs typed straight into the CRM with no lead in front of them. Left out: bid invitations, tests, merged / deleted / cleaned-up leads, copies of imported jobs, and Google LSA leads marked bad or not marked yet (🧹 below lists them). Dated by the day the lead arrived (Memphis time).';
  var HOW_CLOSE = 'Close rate = won ÷ decided (won + lost) for the marketing leads that arrived in the last 12 months (' + esc(mon(r.from)) + ' – ' + esc(mon(r.thisMonth)) + '). Won = the lead became a job that is approved / active / completed (or the lead is marked won). Lost = marked lost; the clean-up\'s closes (stale, duplicate, spam, test) are not losses. Still-open leads are not in it.';
  var HOW_REV = 'Revenue = the ' + BASIS_L[B] + ' of the jobs won from marketing leads, won in the last 12 months. ' + (B === 'contract' ? 'Contract = the job\'s contract amount + approved change orders; a job with no contract amount uses what was invoiced.' : B === 'invoiced' ? 'Invoiced = client invoices on the job (not void / draft; sub bills left out).' : 'Paid = the paid part of the job\'s client invoices.');
  var HOW_SPEND = 'Spend = the lines in 💵 Ad spend below + advertising charges found in Expenses (Google Ads, Facebook, Angi …). The Google Ads / LSA account is not connected, so nothing comes in from Google by itself.';
  var HOW_CPL = 'Cost per lead = spend in the month ÷ marketing leads that arrived that month (same source). Shown only when there is spend. ' + HOW_SPEND;
  var noSpend = !r.spend.any;

  h += '<div class="gmt-card gmm-basis" data-gmm="basis"><b>Revenue counts:</b> ' + ['contract', 'invoiced', 'paid'].map(function(b){ return '<button class="gmt-btn ' + (b === B ? '' : 'o') + '" data-a="gmm-basis" data-b="' + b + '"' + (b === B ? ' aria-pressed="true"' : '') + '>' + (b === 'contract' ? 'Contract value' : b === 'invoiced' ? 'Invoiced' : 'Paid') + '</button>'; }).join(' ') +
    ' <span class="gmt-muted">Numbers below are marketing leads only — bids, tests, duplicates and imported history are counted apart.</span></div>';

  var revs = MM.reviews(X.MK.all('reviews'));
  h += '<div class="gmt-kpis" data-gmm="kpis">' +
    '<div class="gmt-kpi" data-gmm-k="tm"><b>' + t.thisMonth + '</b><span>marketing leads this month ' + q(HOW_LEAD) + '</span></div>' +
    '<div class="gmt-kpi" data-gmm-k="lm"><b>' + t.lastMonth + '</b><span>marketing leads last month ' + q(HOW_LEAD) + '</span></div>' +
    '<div class="gmt-kpi" data-gmm-k="close"><b>' + (t.closeRate == null ? '—' : pct(t.closeRate)) + '</b><span>close rate, 12 mo (' + t.won + ' won ÷ ' + t.decided + ' decided) ' + q(HOW_CLOSE + ' Won ÷ all ' + t.leads + ' leads: ' + pct(t.winRate) + '.') + '</span></div>' +
    '<div class="gmt-kpi" data-gmm-k="rev"><b>' + money(t.revenue) + '</b><span>revenue won, 12 mo (' + BASIS_L[B] + ') ' + q(HOW_REV) + '</span></div>' +
    '<div class="gmt-kpi" data-gmm-k="cpl"><b>' + (t.cplThisMonth != null ? money2(t.cplThisMonth) : nodata(t.cplThisMonthWhy)) + '</b><span>cost per lead this month ' + q(HOW_CPL) + '</span></div>' +
    '<div class="gmt-kpi" data-gmm-k="reviews"><b>' + (revs.n ? revs.n + (revs.avg ? ' · ' + revs.avg + '★' : '') : nodata('none in the CRM')) + '</b><span>reviews in the CRM ' + q('Counted from ⭐ Reviews & referrals: ' + revs.google + ' from Google, ' + revs.byHand + ' added by hand. Google reviews come in by themselves only once the Google Business Profile is connected (📣 Marketing → Connect); until then your real Google rating is on Google, not here.') + '</span></div>' +
    '<div class="gmt-kpi" data-a="subs" style="cursor:pointer"><b data-gmt="subs">' + (X.UI.subs == null ? 'tap' : X.UI.subs) + '</b><span>GrayCo News subscribers</span></div></div>';
  if (noSpend) h += '<div class="gmt-warn" data-gmm="nospend">No ad spend in the CRM yet — cost per lead, cost per job and return on spend say “no spend data” until it is entered in 💵 Ad spend below (one line per source per month), or the Google Ads account is connected.</div>';

  h += '<div class="gmt-card" data-gmm="sources"><h2>📈 Marketing leads by source ' + q(HOW_LEAD + ' Source = the source set in Google → Lead source tagging, else Google LSA for LSA leads, else the lead\'s "how did you hear" / source, else the job\'s. "(not set)" = no source — tag it in Google → Lead source tagging.') + '</h2><div class="gmm-scroll"><table><tr><th>Source</th><th>' + esc(mon(r.thisMonth)) + '</th><th>' + esc(mon(r.lastMonth)) + '</th><th>12 mo leads</th><th>Won</th><th>Lost</th><th>Close rate ' + q(HOW_CLOSE) + '</th><th>Revenue won ' + q(HOW_REV) + '</th><th>Spend 12 mo ' + q(HOW_SPEND) + '</th><th>Cost / lead ' + q('12-month spend ÷ 12-month leads of the source. ' + HOW_SPEND) + '</th><th>Cost / job won ' + q('12-month spend ÷ jobs won from the source in 12 months.') + '</th><th>Revenue ÷ spend ' + q('Revenue won ÷ spend (12 months). 3 = $3 of work for every $1 spent.') + '</th></tr>' +
    (r.channels.length ? r.channels.map(function(c){
      return '<tr data-gmm-ch="' + esc(c.channel) + '"><td><b>' + esc(c.channel) + '</b></td><td>' + c.thisMonth + '</td><td>' + c.lastMonth + '</td><td>' + c.leads + '</td><td>' + c.won + '</td><td>' + c.lost + '</td><td>' + (c.closeRate == null ? nodata(c.closeRateWhy) : pct(c.closeRate) + ' <span class="gmt-muted">(' + c.won + '/' + c.decided + ')</span>') + '</td><td>' + money(c.revenue) + '</td><td>' + (c.spend ? money(c.spend) : nodata('no spend data')) + '</td><td>' + (c.cpl != null ? money2(c.cpl) : nodata(c.cplWhy)) + '</td><td>' + (c.costPerJob != null ? money(c.costPerJob) : nodata(c.costPerJobWhy)) + '</td><td>' + (c.roas != null ? c.roas + '×' : nodata(c.roasWhy)) + '</td></tr>'; }).join('') : '<tr><td colspan="12">' + nodata('No marketing leads in the last 12 months yet.') + '</td></tr>') +
    '<tr class="gmm-tot"><td><b>All marketing</b></td><td><b>' + t.thisMonth + '</b></td><td><b>' + t.lastMonth + '</b></td><td><b>' + t.leads + '</b></td><td><b>' + t.won + '</b></td><td><b>' + t.lost + '</b></td><td><b>' + (t.closeRate == null ? '—' : pct(t.closeRate)) + '</b></td><td><b>' + money(t.revenue) + '</b></td><td><b>' + (t.spend ? money(t.spend) : nodata('no spend data')) + '</b></td><td><b>' + (t.cpl != null ? money2(t.cpl) : nodata(t.cplWhy)) + '</b></td><td><b>' + (t.costPerJob != null ? money(t.costPerJob) : nodata(t.costPerJobWhy)) + '</b></td><td></td></tr></table></div>' +
    r.channels.map(function(c){ return '<details class="gmm-list" data-gmm-list="' + esc(c.channel) + '"><summary>' + esc(c.channel) + ': the ' + c.leads + ' lead' + (c.leads === 1 ? '' : 's') + ' behind the numbers</summary>' + leadRows(c.list) + '</details>'; }).join('') + '</div>';

  /* bids */
  var b = r.bids;
  h += '<div class="gmt-card" data-gmm="bids"><h2>🏗 Bid invitations — not marketing leads ' + q('Commercial / government bid invitations and bid work (PlanHub, BuildingConnected, plan rooms, public agencies, GCs, the website\'s commercial bid form) — the CRM\'s own bid rule (Leads → Bids). They are counted here and not in the marketing numbers above. Dated by the day they arrived (a revised bid keeps its first day).') + '</h2>' +
    (b.platforms.length ? '<div class="gmm-scroll"><table><tr><th>Where from</th><th>' + esc(mon(r.thisMonth)) + '</th><th>' + esc(mon(r.lastMonth)) + '</th><th>12 mo</th><th>Won</th><th>Lost</th></tr>' + b.platforms.map(function(p){ return '<tr><td>' + esc(p.platform) + '</td><td>' + p.thisMonth + '</td><td>' + p.lastMonth + '</td><td>' + p.n + '</td><td>' + p.won + '</td><td>' + p.lost + '</td></tr>'; }).join('') +
      '<tr class="gmm-tot"><td><b>All bids</b></td><td><b>' + b.thisMonth + '</b></td><td><b>' + b.lastMonth + '</b></td><td><b>' + b.n + '</b></td><td><b>' + b.won + '</b></td><td><b>' + b.lost + '</b></td></tr></table></div>' : '<div class="gmt-muted">No bid invitations in the last 12 months.</div>') + '</div>';

  /* LSA */
  var L = r.lsa;
  h += '<div class="gmt-card" data-gmm="lsa"><h2>📍 Google LSA (Local Services Ads) ' + q('LSA leads = leads whose source is Google LSA / Local Services, or that carry an LSA good / bad mark. Good / bad = the PM\'s or the owner\'s mark (Leads → the lead → 👍 / 👎, or the GOOD / BAD text). Only good (or won) LSA leads count as marketing leads. Spend = Ad spend lines with the channel "Google LSA".') + '</h2>' +
    '<div class="gmt-kpis"><div class="gmt-kpi"><b>' + L.leads + '</b><span>LSA leads, 12 mo</span></div><div class="gmt-kpi"><b>' + L.good + '</b><span>👍 good</span></div><div class="gmt-kpi"><b>' + L.bad + '</b><span>👎 bad</span></div><div class="gmt-kpi"><b>' + (L.pending + L.noAnswer) + '</b><span>⏳ not marked yet / no answer</span></div><div class="gmt-kpi"><b>' + (L.spend ? money(L.spend) : nodata('no spend data')) + '</b><span>LSA spend, 12 mo</span></div><div class="gmt-kpi"><b>' + (L.costPerGood != null ? money2(L.costPerGood) : nodata(L.costPerGoodWhy)) + '</b><span>cost per good LSA lead</span></div></div>' +
    '<div class="gmt-muted">Why it is near zero: until 11/19 Google LSA phone calls did not reach the CRM (the call details are only now brought in), so most LSA leads were never on the Leads list. The real LSA count and charges are in Google: <a href="#" class="gmt-link" data-a="open" data-url="https://ads.google.com/localservices/leads">ads.google.com/localservices → Leads</a>. Enter each month\'s LSA charge in 💵 Ad spend (channel “Google LSA”) to get cost per good lead.</div>' +
    (L.list.length ? '<details class="gmm-list"><summary>The ' + L.list.length + ' LSA lead' + (L.list.length === 1 ? '' : 's') + '</summary><table><tr><th>Arrived</th><th>Lead</th><th>Mark</th></tr>' + L.list.map(function(o){ return '<tr><td>' + esc(o.date) + '</td><td>' + esc(o.label) + '</td><td>' + esc(o.mark) + (o.won ? ' · won' : '') + '</td></tr>'; }).join('') + '</table></details>' : '') + '</div>';

  /* money not from marketing leads */
  var o = r.other;
  h += '<div class="gmt-card" data-gmm="other"><h2>💼 Won work that did not come through a marketing lead ' + q('Jobs won in the last 12 months (' + BASIS_L[B] + ') that are not in the marketing table: bid / commercial work, and imported history (QuickBooks / CompanyCam / data-entry records with no lead in the CRM). Imported customer records with no contract and no invoice are not counted as won jobs.') + '</h2>' +
    '<table><tr><td>🏗 Bid / commercial work won</td><td><b>' + o.bidWon + '</b> jobs · <b>' + money(o.bidRevenue) + '</b></td></tr><tr><td>📥 Imported history won (no lead in the CRM)</td><td><b>' + o.importedWon + '</b> jobs · <b>' + money(o.importedRevenue) + '</b></td></tr>' +
    r.tagged.map(function(x){ return '<tr><td class="gmt-muted">… of which you tagged “' + esc(x.channel) + '”</td><td>' + x.jobs + ' · ' + money(x.revenue) + '</td></tr>'; }).join('') + '</table></div>';

  /* left out */
  var ex = Object.keys(r.excluded), exT = ex.reduce(function(a, k){ return a + r.excluded[k]; }, 0);
  h += '<div class="gmt-card" data-gmm="excluded"><h2>🧹 Left out of the numbers (' + exT + ') ' + q('Records the marketing numbers do not count, and why. Nothing is changed or deleted — fix a record on its own screen and it counts again.') + '</h2>' +
    (ex.length ? ex.map(function(k){ var L2 = r.excludedList[k] || []; return '<details class="gmm-list" data-gmm-ex="' + esc(k) + '"><summary><b>' + r.excluded[k] + '</b> ' + esc(EX_L[k] || k) + '</summary><div class="gmt-muted">' + L2.slice(0, 60).map(function(x){ return esc(x.label) + ' <i>(' + esc(x.what) + (k === 'test' ? ': ' + esc(x.why) : '') + ')</i>'; }).join(' · ') + (L2.length > 60 ? ' …' : '') + '</div></details>'; }).join('') : '<div class="gmt-muted">Nothing left out.</div>') + '</div>';

  /* spend entry + referrers + newsletter (as before; "Google LSA" is a channel now) */
  var MK = X.MK, M = X.M, tm = r.thisMonth;
  var chans = ['Google LSA'].concat((M && M.CHANNELS) || [], (M && M.EXTRA_CHANNELS) || []);
  h += '<div class="gmt-two"><div class="gmt-card" data-gmm="spend"><h2>💵 Ad spend ' + q(HOW_SPEND + ' Lines from Expenses show “from Expenses”.') + '</h2><div class="gmt-row"><input type="month" id="gmt-sp-m" value="' + esc(tm) + '"><select id="gmt-sp-c">' + chans.map(function(c){ return '<option>' + esc(c) + '</option>'; }).join('') + '</select><input id="gmt-sp-a" type="number" min="0" step="1" placeholder="$ amount" style="width:120px"><button class="gmt-btn" data-a="spend-add">Add</button></div>' +
    (r.spend.rows.length ? '<table style="margin-top:8px"><tr><th>Month</th><th>Channel</th><th>Amount</th><th></th></tr>' + arr(MK.all('spend')).sort(function(a, c){ return a.month < c.month ? 1 : -1; }).slice(0, 12).map(function(x){ return '<tr><td>' + esc(x.month) + '</td><td>' + esc(x.channel) + '</td><td>' + money(+x.amount) + '</td><td><button class="gmt-btn r" data-a="spend-del" data-id="' + esc(x.id) + '">✕</button></td></tr>'; }).join('') +
      r.spend.rows.filter(function(x){ return x.origin === 'expenses'; }).map(function(x){ return '<tr><td>' + esc(x.month) + '</td><td>' + esc(x.channel) + '</td><td>' + money(x.amount) + '</td><td class="gmt-muted">from Expenses</td></tr>'; }).join('') + '</table>' : '<div class="gmt-muted" style="margin-top:8px">' + nodata('No spend entered and no advertising charges in Expenses.') + '</div>') + '</div>';
  var refs = referrers();
  h += '<div class="gmt-card" data-gmm="refs"><h2>🤝 Top referrers ' + q('Referrals logged in ⭐ Reviews & referrals, plus leads with "referred by" filled in. Hired = the referral\'s status is Hired / Credit paid. The referral program\'s credits and gift codes are in <a href="#" class="gmt-link" data-a="go" data-sec="refprog">🎁 Referral program</a>.') + '</h2>' + (refs.length ? '<table><tr><th>Referrer</th><th>Referred</th><th>Hired</th><th>Credit</th></tr>' + refs.slice(0, 6).map(function(x){ return '<tr><td>' + esc(x.name) + '</td><td>' + x.n + '</td><td>' + x.hired + '</td><td>' + money(x.credit) + '</td></tr>'; }).join('') + '</table>' : '<div class="gmt-muted">' + nodata('No referrals logged yet') + ' — Reviews & referrals → Log a referral (or 🎁 Referral program).</div>') + '</div></div>';
  var camps = MK.all('campaigns').filter(function(c){ return c.stats; }).sort(function(a, c){ return s(a.sentAt) < s(c.sentAt) ? 1 : -1; }).slice(0, 6);
  h += '<div class="gmt-card" data-gmm="news"><h2>📰 Newsletter ' + q('From the send log of each campaign (E-mail campaigns): delivered = sent without an error; unsubscribed people are skipped. Opens and clicks are not tracked yet.') + '</h2>' + (camps.length ? '<table><tr><th>Campaign</th><th>Sent</th><th>Delivered to</th><th>Unsubscribed (skipped)</th><th>Failed</th></tr>' + camps.map(function(c){ return '<tr><td>' + esc(c.title || c.subject) + '</td><td>' + esc(s(c.sentAt).slice(0, 10)) + '</td><td>' + (c.stats.sent || 0) + '</td><td>' + (c.stats.skipped || 0) + '</td><td>' + (c.stats.failed || 0) + '</td></tr>'; }).join('') + '</table>' : '<div class="gmt-muted">' + nodata('No campaign sent yet') + ' (' + MK.all('campaigns').length + ' drafted / waiting).</div>') + '</div>';
  return h;
}
function referrers(){
  var by = {}, MK = X.MK, refs = MK.all('referrals');
  refs.forEach(function(r){ var k = s(r.referrer).toLowerCase(); if (!k) return; var x = by[k] || (by[k] = { name: r.referrer, n: 0, hired: 0, credit: 0 }); x.n++; if (/hired|credit/i.test(r.status)) x.hired++; x.credit += +r.credit || 0; });
  leadsList().forEach(function(l){ if (l.deleted || l.mergedInto) return; var rb = s(l.referredBy || l.referrer); if (!rb) return; var k = rb.toLowerCase(); var x = by[k] || (by[k] = { name: rb, n: 0, hired: 0, credit: 0 }); if (!refs.some(function(r){ return s(r.referred).toLowerCase() === s(l.name).toLowerCase(); })) x.n++; });
  return Object.keys(by).map(function(k){ return by[k]; }).sort(function(a, b){ return b.hired - a.hired || b.n - a.n; });
}

function css(){
  if (D.getElementById('gc-mktmath-css')) return;
  var st = D.createElement('style'); st.id = 'gc-mktmath-css';
  st.textContent = '.gmm-q{display:inline-block;position:relative;vertical-align:middle;font-weight:400}.gmm-q>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e2e8f0;color:#1E2060;font:700 11px Inter,Arial,sans-serif}' +
    '.gmm-q>summary::-webkit-details-marker{display:none}.gmm-q[open]>div{position:absolute;z-index:30;left:0;top:22px;width:min(320px,80vw);background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;box-shadow:0 8px 24px rgba(15,23,42,.18);font:400 12.5px/1.45 Inter,Arial,sans-serif;color:#1e293b;text-align:left;white-space:normal}' +
    '.gmm-nd{font-size:12px;color:#64748b;font-weight:600}.gmm-scroll{overflow-x:auto;max-width:100%}.gmm-tot td{border-top:2px solid #cbd5e1}.gmm-list{margin-top:6px}.gmm-list>summary{cursor:pointer;font-size:13px;color:#1E2060}.gmm-basis .gmt-btn{padding:5px 10px}';
  (D.head || D.documentElement).appendChild(st);
}

function install(){
  var V = X.VIEWS, A = X.ACT;
  if (V.dashboard && !V.dashboard.__gmm) {
    var orig = V.dashboard;
    var w = function(){
      try { if (W._gcMMData || (X.role && X.role() === 'marketing')) return orig.apply(this, arguments); } catch (e) {}   /* the Marketing Manager keeps his own view */
      css();
      try { return html(); } catch (e) { try { console.error('[MKTMATH]', e); } catch (e2) {} return '<div class="gmt-warn">The marketing numbers hit a problem: ' + esc(e && e.message) + '</div>' + orig.apply(this, arguments); }
    };
    w.__gmm = true; w.__orig = orig; V.dashboard = w;
  }
  A['gmm-basis'] = function(b){ lsSet('gc_mktmath_basis', b.getAttribute('data-b')); X.draw(); };
  if (V.revtrack && !V.revtrack.__gmm) {   /* ⭐ Review tracker: 0 asked → "—", not "0%" */
    var rt = V.revtrack, w2 = function(){ var h = rt.apply(this, arguments);
      if (/<b>0<\/b><span>review asked<\/span>/.test(h)) h = h.replace(/<b>0%<\/b><span>asked → received<\/span>/, '<b>—</b><span>asked → received (nothing asked yet)</span>');
      return h.replace('<span>finished jobs (12 months)</span>', '<span>finished jobs (12 months) ' + q('Jobs marked completed. The finish day is the completion date, else the end date, else the day the job was last changed — fill in the completion date on the job for a true date.') + '</span>'); };
    w2.__gmm = true; V.revtrack = w2;
  }
  try { console.log('[GC] patch MKTMATH: 📊 marketing numbers — marketing leads only, close rate won ÷ decided, revenue basis, "no spend data", bids / LSA / left-out cards'); } catch (e) {}
}
function boot(){
  X = W._gcMktExt; MM = W.__gcMktMath;
  if (!X || !MM || !X.VIEWS || !X.VIEWS.dashboard || !X.MK) { if (tries++ < 240) ST.call(W, boot, 500); return; }
  install();
  ST.call(W, function(){ try { install(); } catch (e) {} }, 8000);   /* a later patch may have replaced the views */
}
W._gcMktMathUI = { data: function(){ return X && MM ? data() : null; }, result: function(){ return X && MM ? result() : null; }, html: function(){ return X && MM ? html() : ''; }, last: function(){ return LAST; } };
boot();
})(window);
