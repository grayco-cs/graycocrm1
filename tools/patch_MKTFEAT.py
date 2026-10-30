#!/usr/bin/env python3
"""Idempotent patch MKTFEAT: the marketing features' screens inside 📣 Marketing (index.html).

   ⭐ Review tracker   every finished job: review asked (date, how) / received (★, date, source), per-PM counts, the job's
                      before / after draft; the Marketing Manager sees city + service + PM only (the server sends nothing more).
   🔎 Google rankings  the weekly Search Console average position per search, a small trend, the list (him + admins edit),
                      the "Connect Search Console" card with the exact steps.
   📬 Monthly report   (admins) the recipients, preview, "Send me this month's report now"; the recipients also on ⚙️ Focus & approvals.
   The data comes from netlify/functions/soc.js (op mf_*, _lib/mktfeat.js) when a screen opens — no timers, no polling.
   Inserted as its own <script> after the MMTABS patch (+ the two section ids on the Marketing Manager's keep-list in patch MM);
   run again → "already patched"."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '<script id="gc-patch-mktfeat">'
if MARK in src:
    print('already patched'); sys.exit(0)
ANCHOR = '</script><!-- /MMTABS -->\n'
assert src.count(ANCHOR) == 1, ('anchor count != 1', src.count(ANCHOR))

JS = r'''<script id="gc-patch-mktfeat">
/* ==========================================================================
   GrayCo CRM — patch MKTFEAT __GC_PATCH_MKTFEAT__ : marketing features (owner 30 Oct 2026, approved)
   ⭐ Review tracker · 🔎 Google rankings · 📬 Monthly report (admins) inside 📣 Marketing; before / after drafts land in
   📱 Social posts as drafts (made on the server, netlify/functions/mkt-feat.js); the 30–90 day win-back drafts are on ✅ Approvals.
   Everything is read from soc.js (op mf_*) when a screen opens; the Marketing Manager's answers are redacted on the server.
   Console: _gcMktFeat.state()
   ========================================================================== */
(function(){
'use strict';
if (window.__GC_PATCH_MKTFEAT__) return; window.__GC_PATCH_MKTFEAT__ = true;
var W = window, D = document;
var nST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout.bind(W);
var X = null, tries = 0;
function boot(){ X = W._gcMktExt; if (!X || !X.VIEWS || !X.SECS || ((!X.VIEWS.socweek || !W._gcMM) && tries < 60)) { if (tries++ < 160) nST(boot, 500); return; } install(); }   /* a bounded wait at start-up only: the Marketing screen, then the SOC / MM sections (their ⚙️ settings view is wrapped) */
nST(boot, 0);
function isMM(){ try { return typeof W._gcIsMM === 'function' && W._gcIsMM(); } catch (e) { return false; } }

function install(){
var SECS = X.SECS, VIEWS = X.VIEWS, ACT = X.ACT, UI = X.UI, esc = X.esc, s = X.s, arr = X.arr, toast = X.toast, api = X.api;
function role(){ try { return X.role(); } catch (e) { return ''; } }
function admin(){ return role() === 'admin'; }
function office(){ var r = role(); return r === 'admin' || r === 'office'; }
function mm(){ return role() === 'marketing' || isMM(); }
var NEW = [
  { id: 'revtrack', ic: '⭐', l: 'Review tracker', d: 'Every finished job: review asked / received, per PM ("asked 8, received 5"), the before / after draft' },
  { id: 'rankings', ic: '🔎', l: 'Google rankings', d: 'Where grayco-cs.com shows on Google for the main searches — weekly, from Search Console' },
  { id: 'mfreport', ic: '📬', l: 'Monthly report', d: 'The owner\'s marketing report on the 1st — who gets it, preview, send it now', admin: true }
];
function ensure(){
  NEW.forEach(function(x){
    var i = SECS.map(function(y){ return y.id; }).indexOf(x.id), want = x.admin ? admin() : true;   /* the tracker / rankings: whoever has the full Marketing menu (Marketing's own allowed() keeps PMs out) */
    if (want && i < 0) { var at = SECS.map(function(y){ return y.id; }).indexOf(x.id === 'revtrack' ? 'refprog' : 'approvals'); SECS.splice(at >= 0 ? at + (x.id === 'revtrack' ? 1 : 0) : SECS.length, 0, { id: x.id, ic: x.ic, l: x.l, d: x.d }); }
    else if (!want && i >= 0) SECS.splice(i, 1);
  });
}
ensure();
var homeV = VIEWS.home; VIEWS.home = function(){ ensure(); return homeV.apply(this, arguments); };   /* the role can arrive after start-up */
/* the Marketing Manager's own tabs (patch MMTABS): the tracker with ⭐ Reviews, the rankings with 📈 My leads */
arr(W._gcMMTabs).forEach(function(t){ t.also = arr(t.also); if (t.id === 'mmt_reviews' && t.also.indexOf('revtrack') < 0) t.also.push('revtrack'); if (t.id === 'mmt_leads' && t.also.indexOf('rankings') < 0) t.also.push('rankings'); });

/* ── data: one call when the screen opens (kept a minute), never on a timer ── */
var ST = { rev: null, rank: null, rep: null, prev: null, pm: '', termsDraft: null, busy: '' };
function load(k, op, sec, body, force){
  var c = ST[k]; if (c && c.loading) return; if (c && !force && Date.now() - c.at < 60000) return;
  ST[k] = Object.assign({}, c || {}, { loading: true });
  api('soc', Object.assign({ op: op }, body || {})).then(function(j){ ST[k] = { at: Date.now(), j: j || {} }; if (UI.sec === sec) X.draw(); });
}
function waitCard(){ return '<div class="gmt-card"><div class="gmt-muted">Loading…</div></div>'; }
function errCard(j){ return '<div class="gmt-warn">Not loaded: ' + esc((j && j.error) || 'the server did not answer') + '</div>'; }
function day(v){ v = s(v); if (!/^\d{4}-\d\d-\d\d/.test(v)) return v || '—'; var d = new Date(v.slice(0, 10) + 'T12:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); }
function stars(n){ n = Math.max(0, Math.min(5, Math.round(+n || 0))); return n ? '★★★★★'.slice(0, n) + '<span style="color:#cbd5e1">' + '★★★★★'.slice(n) + '</span>' : ''; }

/* ══════════════ ⭐ REVIEW TRACKER ══════════════ */
var BA_L = { ready: 'Drafted on the next daily run', 'no-ok': 'Needs the customer\'s OK for marketing', photos: 'Needs 2 photos shared with the customer' };
VIEWS.revtrack = function(){
  load('rev', 'mf_reviews', 'revtrack');
  var c = ST.rev; if (!c || !c.j) return waitCard(); var j = c.j; if (!j.ok) return errCard(j);
  var rows = arr(j.rows), pms = arr(j.perPm), t = j.totals || {}, h = '';
  var fr = ST.pm ? rows.filter(function(r){ return r.pm === ST.pm; }) : rows;
  h += '<div class="gmt-kpis" data-mf-kpis><div class="gmt-kpi"><b>' + (t.jobs || 0) + '</b><span>finished jobs (12 months)</span></div><div class="gmt-kpi"><b>' + (t.asked || 0) + '</b><span>review asked</span></div>' +
    '<div class="gmt-kpi"><b>' + (t.received || 0) + '</b><span>review received</span></div><div class="gmt-kpi"><b>' + (t.asked ? Math.round((t.received || 0) / t.asked * 100) : 0) + '%</b><span>asked → received</span></div></div>';
  h += '<div class="gmt-card" data-mf-perpm><h2>By PM</h2>' + (pms.length ? '<table><tr><th>PM</th><th>Finished</th><th>Asked</th><th>Received</th><th>Average</th><th></th></tr>' + pms.map(function(p){
    return '<tr><td><b>' + esc(p.pm) + '</b></td><td>' + p.jobs + '</td><td>' + p.asked + '</td><td>' + p.received + '</td><td>' + (p.avg ? p.avg + ' ★' : '—') + '</td><td class="gmt-muted">asked ' + p.asked + ', received ' + p.received + '</td></tr>'; }).join('') + '</table>' : '<div class="gmt-muted">No finished jobs in the last 12 months.</div>') + '</div>';
  h += '<div class="gmt-card"><h2>Every finished job</h2><div class="gmt-row" style="margin:0 0 8px"><label style="margin:0">PM</label><select data-ch="mf-pm"><option value="">Everyone</option>' + pms.map(function(p){ return '<option' + (ST.pm === p.pm ? ' selected' : '') + '>' + esc(p.pm) + '</option>'; }).join('') + '</select>' +
    '<button class="gmt-btn o" data-a="mf-rev-refresh">↻ Refresh</button>' + (office() ? '<button class="gmt-btn o" data-a="mf-ba-run">🖼 Make before / after drafts now</button>' : '') + '</div>' +
    '<div class="gmt-muted">' + (j.full ? '' : 'City, service and PM only — no customer names or addresses. ') + 'Asked = the thank-you e-mail with the review link (sent through ✅ Approvals), Marketing → ⭐ Ask, or recorded here. Received = a review linked to the job, or the Google review in the customer\'s name. Before / after = the draft post made from the photos shared with the customer.</div>' +
    '<div style="overflow-x:auto"><table data-mf-rows><tr><th>Finished</th><th>Job</th><th>PM</th><th>Asked</th><th>Review</th><th>Before / after</th><th></th></tr>' +
    fr.slice(0, 300).map(function(r){
      var job = j.full ? '<b>' + esc(r.job || r.serviceLabel) + '</b><div class="gmt-muted">' + esc(r.serviceLabel) + ' · ' + esc(r.city) + '</div>' : '<b>' + esc(r.serviceLabel) + '</b><div class="gmt-muted">' + esc(r.city) + '</div>';
      var ask = r.asked ? (r.asked.sent ? '✓ ' : '⏳ ') + esc(day(r.asked.at)) + '<div class="gmt-muted">' + esc(r.asked.how) + '</div>' : '<span class="gmt-muted">not yet</span>';
      var rv = r.received ? stars(r.received.rating) + ' <span class="gmt-muted">' + esc(day(r.received.at)) + '</span><div class="gmt-muted">' + esc(r.received.source) + (r.received.matched === 'by name' ? ' · matched by name' : '') + '</div>' : '<span class="gmt-muted">—</span>';
      var ba = r.ba === 'drafted' ? (r.baPost ? X.chip(r.baPost.status) + ' <button class="gmt-btn o" data-a="post-edit" data-id="' + esc(r.baPost.id) + '" style="padding:4px 8px">Open</button>' : '<span class="gmt-muted">made</span>') : '<span class="gmt-muted">' + esc(BA_L[r.ba] || '—') + '</span>';
      var mark = !r.asked || !r.asked.sent ? '<select data-ch="mf-mark" data-key="' + esc(r.key) + '" aria-label="Record that the review was asked"><option value="">✓ Asked…</option><option>text</option><option>in person</option><option>phone call</option><option>e-mail</option></select>' : '';
      return '<tr data-mf-key="' + esc(r.key) + '"><td>' + esc(day(r.finished)) + '</td><td>' + job + '</td><td>' + esc(r.pm) + '</td><td>' + ask + '</td><td>' + rv + '</td><td>' + ba + '</td><td>' + mark + '</td></tr>'; }).join('') + '</table></div>' +
    (fr.length > 300 ? '<div class="gmt-muted">The newest 300 shown.</div>' : '') + '</div>';
  return h;
};
ACT['mf-pm'] = function(t){ ST.pm = t.value; X.draw(); };
ACT['mf-rev-refresh'] = function(){ load('rev', 'mf_reviews', 'revtrack', null, true); X.draw(); };
ACT['mf-mark'] = function(t){ var how = t.value, key = t.getAttribute('data-key'); if (!how) return; t.disabled = true;
  api('soc', { op: 'mf_review_mark', key: key, how: how }).then(function(j){ toast(j && j.ok ? 'Recorded: review asked (' + how + ').' : 'Not recorded: ' + ((j && j.error) || 'try again'), !(j && j.ok)); load('rev', 'mf_reviews', 'revtrack', null, true); }); };
ACT['mf-ba-run'] = function(b){ b.disabled = true; api('soc', { op: 'mf_ba_run' }).then(function(j){
  toast(j && j.ok ? (j.dataEntryMode ? '⏸ Data-entry mode is on — no drafts made.' : (arr(j.made).length ? arr(j.made).length + ' before / after draft(s) made — they are in 📱 Social posts.' : 'Nothing new to draft.')) : 'Not made: ' + ((j && j.error) || 'try again'), !(j && j.ok));
  if (X.MK && X.MK.pull) X.MK.pull(true); load('rev', 'mf_reviews', 'revtrack', null, true); }); };

/* ══════════════ 🔎 GOOGLE RANKINGS ══════════════ */
function spark(weeks){
  var pts = weeks.map(function(w, i){ return { i: i, p: w.position }; }).filter(function(x){ return x.p != null; });
  if (!pts.length) return '<span class="gmt-muted">—</span>';
  var W0 = 120, H0 = 28, n = Math.max(2, weeks.length), lo = Math.min.apply(null, pts.map(function(x){ return x.p; })), hi = Math.max.apply(null, pts.map(function(x){ return x.p; })), span = Math.max(1, hi - lo);
  var xy = function(x){ return [Math.round(4 + x.i * (W0 - 8) / (n - 1)), Math.round(4 + (x.p - lo) / span * (H0 - 8))]; };   /* a better (lower) position is higher up */
  var d = pts.map(function(x, k){ var q = xy(x); return (k ? 'L' : 'M') + q[0] + ' ' + q[1]; }).join(' '), last = xy(pts[pts.length - 1]);
  return '<svg width="' + W0 + '" height="' + H0 + '" viewBox="0 0 ' + W0 + ' ' + H0 + '" role="img" aria-label="trend"><path d="' + d + '" fill="none" stroke="#1E2060" stroke-width="2"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="#D4A017"/></svg>';
}
function setupCard(j){
  var p = j.problem || '', sa = j.saEmail || '';
  var why = !j.configured ? 'The service account is not set up on Netlify yet.' : p === 'no_access' ? 'Google answered, but the service account is not a user of the grayco-cs.com property yet.' : p === 'api_off' ? 'The Search Console API is not turned on for the service account\'s Google Cloud project.' : p === 'denied' ? 'Google did not accept the service account\'s key.' : p ? 'Last try: ' + (j.problemText || p) : 'Not checked yet.';
  return '<div class="gmt-card" data-mf-connect style="border-color:#D4A017"><h2>🔌 Connect Search Console</h2><div class="gmt-warn">' + esc(why) + '</div>' +
    (admin() ? '<ol style="margin:8px 0 0 18px;padding:0;line-height:1.6">' +
      (!j.configured ? '<li>Netlify → Site configuration → Environment variables: <b>GOOGLE_SA_EMAIL</b> and <b>GOOGLE_SA_KEY</b> — the same Google service account the e-mail reading uses (docs/EMAIL-ALL.md). Redeploy.</li>' : '') +
      '<li>Google Cloud console → the service account\'s project → APIs &amp; Services → Library → <b>Google Search Console API</b> → Enable.</li>' +
      '<li><a href="https://search.google.com/search-console/users" target="_blank" rel="noopener" class="gmt-link">Search Console</a> → the <b>grayco-cs.com</b> property → ⚙ Settings → <b>Users and permissions</b> → <b>Add user</b>: ' + (sa ? '<b>' + esc(sa) + '</b> <button class="gmt-btn o" data-a="copy" data-t="' + esc(sa) + '" style="padding:3px 8px">📋 Copy</button>' : 'the service account\'s e-mail (…@….iam.gserviceaccount.com)') + ', permission <b>Restricted</b> (read-only is enough).</li>' +
      '<li>Back here → <b>Check now</b>. After that it runs every Monday morning by itself.</li></ol>' +
      '<div class="gmt-muted" style="margin-top:6px">Free. The CRM only reads Google\'s own numbers (average position, clicks, impressions per search); it changes nothing in Search Console.</div>'
      : '<div class="gmt-muted">An admin connects it (the steps are on this page for them). Until then there are no numbers here — the CRM never estimates a ranking.</div>') + '</div>';
}
VIEWS.rankings = function(){
  load('rank', 'mf_rank', 'rankings');
  var c = ST.rank; if (!c || !c.j) return waitCard(); var j = c.j; if (!j.ok && !j.terms) return errCard(j);
  var h = '', series = arr(j.series), weeks = series.length ? series[0].weeks.length : 0;
  if (!j.connected) h += setupCard(j);
  else if (j.problem) h += '<div class="gmt-warn">Last check had a problem: ' + esc(j.problemText || j.problem) + '</div>';
  h += '<div class="gmt-card" data-mf-ranks><h2>Average position on Google</h2><div class="gmt-muted">Google Search Console, grayco-cs.com' + (j.site ? ' (' + esc(j.site) + ')' : '') + ', one week at a time (the week ending 3 days before the check). Lower is better: #1–3 is the top of page 1, #11+ is page 2. “Not seen” = we did not show for that search that week. Never estimated.' + (j.ranAt ? ' Last check ' + esc(day(j.ranAt)) + '.' : '') + '</div>' +
    '<div class="gmt-row" style="margin:8px 0"><button class="gmt-btn" data-a="mf-rank-run">🔎 Check now</button></div>' +
    '<table><tr><th>Search</th><th>This week</th><th>Change</th><th>Trend (' + (weeks || 0) + ' wk)</th><th>Clicks / impressions</th></tr>' + series.map(function(x){
      var w = arr(x.weeks), last = w[w.length - 1], prev = w.length > 1 ? w[w.length - 2] : null;
      var cur = !last ? '<span class="gmt-muted">not checked yet</span>' : last.position != null ? '<b>#' + last.position + '</b>' : '<span class="gmt-muted">not seen</span>';
      var ch = last && prev && last.position != null && prev.position != null ? (function(d){ d = Math.round((prev.position - last.position) * 10) / 10; return d > 0 ? '<span style="color:#166534">▲ ' + d + '</span>' : d < 0 ? '<span style="color:#b91c1c">▼ ' + (-d) + '</span>' : '='; })() : '—';
      return '<tr><td>' + esc(x.term) + '</td><td>' + cur + '</td><td>' + ch + '</td><td>' + spark(w) + '</td><td>' + (last && last.position != null ? last.clicks + ' / ' + last.impressions : '—') + '</td></tr>'; }).join('') + '</table></div>';
  var draft = ST.termsDraft != null ? ST.termsDraft : arr(j.terms).join('\n');
  h += '<div class="gmt-card"><h2>The searches we watch</h2><div class="gmt-muted">One per line (up to 25), the way people type them. The Marketing Manager and admins can change the list.</div>' +
    '<textarea id="mf-terms" rows="6" style="margin-top:6px">' + esc(draft) + '</textarea><div class="gmt-row" style="margin-top:6px"><button class="gmt-btn g" data-a="mf-terms-save">Save the list</button><button class="gmt-btn o" data-a="mf-terms-default">Back to the four main searches</button></div></div>';
  return h;
};
D.addEventListener('input', function(ev){ if (ev.target && ev.target.id === 'mf-terms') ST.termsDraft = ev.target.value; }, true);
ACT['mf-rank-run'] = function(b){ b.disabled = true; b.textContent = 'Checking…'; api('soc', { op: 'mf_rank_run' }).then(function(j){
  if (j && j.terms) ST.rank = { at: Date.now(), j: j };
  toast(j && j.ok ? 'Rankings checked.' : 'Not checked: ' + ((j && (j.error || j.problemText)) || 'see the card'), !(j && j.ok)); if (UI.sec === 'rankings') X.draw(); }); };
ACT['mf-terms-save'] = function(b){ var el = D.getElementById('mf-terms'); b.disabled = true; api('soc', { op: 'mf_rank_terms', terms: el ? el.value : '' }).then(function(j){
  if (j && j.ok) { ST.termsDraft = null; ST.rank = { at: Date.now(), j: j }; toast('Saved — ' + arr(j.terms).length + ' searches.'); } else toast('Not saved: ' + ((j && j.error) || 'try again'), true);
  if (UI.sec === 'rankings') X.draw(); }); };
ACT['mf-terms-default'] = function(){ var j = ST.rank && ST.rank.j; ST.termsDraft = arr(j && j.defaults).join('\n'); X.draw(); };

/* ══════════════ 📬 MONTHLY REPORT (admins) ══════════════ */
function monthOf(back){ var d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - (back || 0)); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
function recipientsCard(){
  load('rep', 'mf_report_cfg', UI.sec);
  var c = ST.rep; if (!c || !c.j) return waitCard(); var j = c.j; if (!j.ok) return errCard(j);
  var to = arr(j.to), last = j.last;
  return '<div class="gmt-card" data-mf-recipients><h2>📬 Monthly marketing report — who gets it</h2><div class="gmt-muted">On the 1st at 8 AM: last month\'s leads by source, cost per lead (marketing spend + ad charges), jobs won and sold value by source, reviews gained, posts published, the top and the worst campaign, and the Google rankings. Staff addresses only.</div>' +
    arr(j.admins).map(function(e){ return '<label class="gmt-check" style="font-weight:400"><input type="checkbox" data-mf-to="' + esc(e) + '"' + (to.indexOf(e) >= 0 ? ' checked' : '') + '><div>' + esc(e) + '</div></label>'; }).join('') +
    '<div class="gmt-row" style="margin-top:8px"><button class="gmt-btn g" data-a="mf-to-save">Save who gets it</button></div>' +
    (last ? '<div class="gmt-muted" style="margin-top:6px">Last: ' + esc(last.month) + ' — ' + (last.ok ? '✓ sent ' + esc(day(last.at)) + ' to ' + esc(arr(last.to).join(', ')) : 'not sent' + (last.error ? ' (' + esc(last.error) + ')' : '')) + '</div>' : '') +
    (j.mailOn ? '' : '<div class="gmt-warn">E-mail is not set up on Netlify (RESEND_API_KEY).</div>') + '</div>';
}
VIEWS.mfreport = function(){
  if (!admin()) return '<div class="gmt-warn">Admins only.</div>';
  var h = recipientsCard();
  h += '<div class="gmt-card"><h2>The report</h2><div class="gmt-row"><button class="gmt-btn gold" data-a="mf-rep-send">📨 Send me this month\'s report now</button><button class="gmt-btn o" data-a="mf-rep-prev" data-m="' + monthOf(0) + '">👁 Preview this month (so far)</button><button class="gmt-btn o" data-a="mf-rep-prev" data-m="' + monthOf(1) + '">👁 Preview last month</button></div>' +
    '<div class="gmt-muted">“Send me” goes to you only. The same numbers as 📊 Dashboard.</div>' +
    (ST.prev && ST.prev.html ? '<iframe title="Report preview" sandbox="" data-mf-preview style="width:100%;height:760px;border:1px solid #dce3ee;border-radius:10px;margin-top:10px;background:#fff" srcdoc="' + esc(ST.prev.html) + '"></iframe>' : ST.prev && ST.prev.loading ? '<div class="gmt-muted" style="margin-top:8px">Building the preview…</div>' : '') + '</div>';
  return h;
};
ACT['mf-to-save'] = function(b){ var to = Array.prototype.map.call(UI.root.querySelectorAll('[data-mf-to]'), function(x){ return x.checked ? x.getAttribute('data-mf-to') : ''; }).filter(Boolean); b.disabled = true;
  api('soc', { op: 'mf_report_cfg', set: { to: to } }).then(function(j){ if (j && j.ok) { ST.rep = { at: Date.now(), j: j }; toast(to.length ? 'Saved — the report goes to ' + to.join(', ') + '.' : 'Saved — nobody gets the report now.'); } else toast('Not saved: ' + ((j && j.error) || 'try again'), true); X.draw(); }); };
ACT['mf-rep-prev'] = function(b){ ST.prev = { loading: true }; X.draw(); api('soc', { op: 'mf_report_preview', month: b.getAttribute('data-m') }).then(function(j){ ST.prev = j && j.ok ? { html: j.html, month: j.month } : null; if (!(j && j.ok)) toast('No preview: ' + ((j && j.error) || 'try again'), true); if (UI.sec === 'mfreport') X.draw(); }); };
ACT['mf-rep-send'] = function(b){ b.disabled = true; api('soc', { op: 'mf_report_send' }).then(function(j){ toast(j && j.ok ? 'Sent to ' + arr(j.to).join(', ') + '.' : 'Not sent: ' + ((j && j.error) || 'try again'), !(j && j.ok)); b.disabled = false; }); };

/* the recipients on ⚙️ Focus & approvals too (owner: "set in Marketing settings") */
var setV = VIEWS.mktsettings;
if (typeof setV === 'function') VIEWS.mktsettings = function(){ var h = setV.apply(this, arguments); return admin() ? h + recipientsCard() + '<div class="gmt-row" style="margin:-6px 0 14px"><button class="gmt-btn o" data-a="go" data-sec="mfreport">📬 Preview / send the report</button></div>' : h; };

W._gcMktFeat = { state: function(){ return { secs: NEW.map(function(x){ return x.id; }).filter(function(id){ return SECS.some(function(y){ return y.id === id; }); }), rev: !!(ST.rev && ST.rev.j), rank: !!(ST.rank && ST.rank.j), role: role() }; }, _ST: ST };
}
})();
</script><!-- /MKTFEAT -->
'''

# the Marketing Manager's menu keeps only the sections there when his profile loaded (patch MM prunes the rest every 1.5 s):
# the review tracker and the rankings are his too (owner: "Malcolm sees it")
KEEP_A = "  var KEEP = { logins: 1 }; SECS.forEach(function(x){ KEEP[x.id] = 1; });"
assert src.count(KEEP_A) == 1, ('KEEP anchor count != 1', src.count(KEEP_A))
src = src.replace(KEEP_A, "  var KEEP = { logins: 1, revtrack: 1, rankings: 1 }; SECS.forEach(function(x){ KEEP[x.id] = 1; });   /* patch MKTFEAT: + ⭐ Review tracker, 🔎 Google rankings */", 1)
src = src.replace(ANCHOR, ANCHOR + JS, 1)
open(path, 'w', encoding='utf-8').write(src)
print('patched')
