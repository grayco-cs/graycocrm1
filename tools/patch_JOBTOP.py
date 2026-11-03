#!/usr/bin/env python3
"""Idempotent patch JOBTOP (owner 11/02, a screenshot of a job page): "all this stuff needs to be at top of page. All
other widgets can be under it, but this is the overview, I need to see it up top." — the job's summary strip
(Contract · Bid / Estimate · Spent · Profit · Margin · Estimates · Change orders) and the tab bar (Overview · Schedule ·
Scope · Files & Docs · …) come right under the job's header; every other card / bar goes BELOW the tab content.
Same request: "a share button so I can send a link of photos to subs etc".

What was above the strip (desk job page, the React root = the "← All Projects" button's parent), each inserted by a
timer right after the header, so they kept pushing the strip down as they arrived:
  patch Q          .gcq-card        🏠 Customer portal card (+ its followers: CLAIMHELP .gcch-bar, INS .gcinsp-panel,
                                    SUBCONTACT .gcsubc-panel, APPRORDER .gcao-wait, the 🎨 / ✍️ strips inside it)
  patch SUB        .gcsub-row       👷 Subs & portal messages row
  patch JA         .gcja-bar        ⚙ Automations bar
  patch AUTO8      .gc-a8-bar       pay apps / equipment / crew arrived / safety sign-in bar (+ MKT2 🗞 / 🎬 inside)
  patch X9         .gcx9-bars       X9 job bars
  patch X10        .gcx10-jobbar    X10 job bar
  patch GCP        .gcgp-bar        GC / commercial job bar
  patch AUTO11     .gca11-jobbar    AUTO11 job bar
  patch X12        .gcx12-bar       X12 job bar
  patch SRC        .gcsrc-line      job source chip line ("who sourced this job")
  patch SCHEDPICK  .gcsp-bar        📋 Suggested schedule / templates bar

The change:
  1. window._gcJobBox(back): ONE fixed container #gc-job-widgets, the LAST child of the job page (after the tab
     content). A native MutationObserver keeps it last when React adds a node after it (a tab switch) — before the
     browser paints — and removes it when the job page is left. Empty, it takes no room.
  2. Every injector above puts its block into that container (same relative order as before) instead of right after
     the header. The followers anchored on the portal card follow it into the container on their own.
  3. Field (phone) job screen: a summary strip on top (Contract / Bid · Spent · Profit · Margin for those who may see
     it · Estimates · Change orders; tap = the 💰 money sheet), then the tiles, then the rest (FIELDPORTAL's order).
  4. 🔗 Share photos: on the desk job page's Photos tab header and as a tile on the Field job screen. It opens GrayCo
     Photos' existing Photo report for this job (window._gcPhotos.report(jobId): pick → Copy share link (customer, sub,
     adjuster) / Text or email it / PDF; served by netlify/functions/photo-report.js). No new sharing logic.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '__GC_PATCH_JOBTOP__'
if MARK in t:
    print('JOBTOP: already patched'); sys.exit(0)


def rep(t, old, new, n=1):
    c = t.count(old)
    assert c == n, ('JOBTOP anchor found %d times (want %d): %r' % (c, n, old[:120]))
    return t.replace(old, new)


BOX = "window._gcJobBox(back)"   # the container (patch JOBTOP)

# ── 1. the desk injectors: into #gc-job-widgets ─────────────────────────────────────────────────────────────────
# patch Q: the 🏠 Customer portal card
t = rep(t, """  var root = hit.root, back = hit.back;
  var have = root.querySelector(':scope > .gcq-card');""", """  var back = hit.back, root = window._gcJobBox(back);   /* patch JOBTOP: under the tabs, not above the summary */
  var have = root.querySelector(':scope > .gcq-card');""")
t = rep(t, """  var card = buildCard(p, false);
  var after = back.nextElementSibling || back;
  root.insertBefore(card, after.nextSibling);""", """  var card = buildCard(p, false);
  root.insertBefore(card, root.firstChild);   /* patch JOBTOP */""")
# patch SUB: 👷 Subs & portal messages
t = rep(t, """  if (have && have.getAttribute('data-pid') === String(op.id) && have.parentNode === hit.root) return;""",
        """  var box = window._gcJobBox(hit.back);   /* patch JOBTOP */
  if (have && have.getAttribute('data-pid') === String(op.id) && have.parentNode === box) return;""")
t = rep(t, """  var after = hit.root.querySelector(':scope > .gcq-card') || hit.back.nextElementSibling || hit.back;
  hit.root.insertBefore(row, after.nextSibling);""", """  var after = box.querySelector(':scope > .gcq-card');
  box.insertBefore(row, after ? after.nextSibling : box.firstChild);   /* patch JOBTOP */""")
# patch JA: ⚙ Automations
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gcja-bar');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gcja-bar');   /* patch JOBTOP */""")
t = rep(t, """  var card = root.querySelector(':scope > .gcq-card'), head = back.nextElementSibling;
  var after = card || (head && !head.classList.contains('gcja-bar') ? head : back);
  root.insertBefore(makeBar(p, false), after.nextSibling);""", """  var after = root.querySelector(':scope > .gcq-card');
  root.insertBefore(makeBar(p, false), after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch AUTO8
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gc-a8-bar');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gc-a8-bar');   /* patch JOBTOP */""")
t = rep(t, """  var after = ja || card || (head && !head.classList.contains('gc-a8-bar') ? head : back);
  css(); root.insertBefore(makeBar(p, false), after.nextSibling);""", """  var after = ja || card || null;
  css(); root.insertBefore(makeBar(p, false), after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch X9
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gcx9-bars');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gcx9-bars');   /* patch JOBTOP */""")
t = rep(t, """  var after = ja || card || (head && !/gcja-bar|gcx9-bars/.test(head.className) ? head : back);
  root.insertBefore(makeBars(p, false), after.nextSibling);""", """  var after = ja || card || null;
  root.insertBefore(makeBars(p, false), after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch X10
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gcx10-jobbar');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gcx10-jobbar');   /* patch JOBTOP */""")
t = rep(t, """  var x9 = root.querySelector(':scope > .gcx9-bars'), after = x9 || back;
  root.insertBefore(makeBar(p, false), after.nextSibling);""", """  var after = root.querySelector(':scope > .gcx9-bars');
  root.insertBefore(makeBar(p, false), after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch GCP
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gcgp-bar');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gcgp-bar');   /* patch JOBTOP */""")
t = rep(t, """  var after = root.querySelector(':scope > .gcja-bar') || root.querySelector(':scope > .gcq-card') || back;
  root.insertBefore(b, after.nextSibling);""", """  var after = root.querySelector(':scope > .gcja-bar') || root.querySelector(':scope > .gcq-card');
  root.insertBefore(b, after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch AUTO11
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gca11-jobbar');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gca11-jobbar');   /* patch JOBTOP */""")
t = rep(t, """  var after = root.querySelector(':scope > .gcx10-jobbar') || root.querySelector(':scope > .gcx9-bars') || back;
  root.insertBefore(makeBar(p), after.nextSibling);""", """  var after = root.querySelector(':scope > .gcx10-jobbar') || root.querySelector(':scope > .gcx9-bars');
  root.insertBefore(makeBar(p), after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch X12
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gcx12-bar');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gcx12-bar');   /* patch JOBTOP */""")
t = rep(t, """  var after = root.querySelector(':scope > .gcx9-bars') || root.querySelector(':scope > .gcja-bar') || back;
  root.insertBefore(makeBar(p, false), after.nextSibling);""", """  var after = root.querySelector(':scope > .gcx9-bars') || root.querySelector(':scope > .gcja-bar');
  root.insertBefore(makeBar(p, false), after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch SRC
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gcsrc-line[data-desk]');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gcsrc-line[data-desk]');   /* patch JOBTOP */""")
t = rep(t, """  var after = root.querySelector(':scope > .gcx12-bar') || root.querySelector(':scope > .gcx9-bars') || root.querySelector(':scope > .gcja-bar') || back;
  root.insertBefore(line, after.nextSibling);""", """  var after = root.querySelector(':scope > .gcx12-bar') || root.querySelector(':scope > .gcx9-bars') || root.querySelector(':scope > .gcja-bar');
  root.insertBefore(line, after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")
# patch SCHEDPICK
t = rep(t, """  var root = back.parentElement, have = root.querySelector(':scope > .gcsp-bar');""",
        """  var root = """ + BOX + """, have = root.querySelector(':scope > .gcsp-bar');   /* patch JOBTOP */""")
t = rep(t, """  var after = ja || card || (head && !head.classList.contains('gcsp-bar') ? head : back);
  var b = makeBar(p.id); fill(b, p.id); root.insertBefore(b, after.nextSibling);""", """  var after = ja || card || null;
  var b = makeBar(p.id); fill(b, p.id); root.insertBefore(b, after ? after.nextSibling : root.firstChild);   /* patch JOBTOP */""")

# ── 2. GrayCo Photos: open the Photo report of one job directly (the existing screen) ─────────────────────────────
t = rep(t, "window._gcPhotos = {\n", """/* patch JOBTOP: 🔗 Share photos — the job's Photo report straight away (pick → share link / text or e-mail / PDF);
   ‹ on it goes back to where it was opened from */
function openReport(jobId){
  jobId = s(jobId); if (!jobId) return false;
  open(jobId);
  if (!itemById(jobId)) return true;
  S.sel = null; S.repTitle = 'Photo report'; lastPdf = null;
  S.entry = { jobId: jobId, screen: 'report' };
  go('report');
  return true;
}
window._gcPhotosDeskBtn = function(){ try { deskJobBtn(); } catch (e) {} };   /* patch JOBTOP: the header's 📸 next to 💬 */
window._gcPhotos = {
""")
t = rep(t, "  open: open, close: close, openRef: openRef, mountTab: mountTab,",
        "  open: open, close: close, report: openReport, openRef: openRef, mountTab: mountTab,")
t = rep(t, "(S.screen === 'camera' && en.screen === 'camera'))) return close();",
        "(S.screen === 'camera' && en.screen === 'camera') || (S.screen === 'report' && en.screen === 'report'))) return close();   /* patch JOBTOP */")

# desk: the Photos tab header (React)
t = rep(t, '"data-gcu-cam":"1",children:"📷 Camera"}),',
        '"data-gcu-cam":"1",children:"📷 Camera"}),e.jsx("button",{type:"button","data-gc-sharephotos":j.id,title:"Pick photos and send a link (customer, sub, adjuster)",style:{...ht,padding:"5px 14px",background:"#0f766e",color:"#fff"},onClick:function(){try{if(window._gcPhotos&&window._gcPhotos.report)window._gcPhotos.report(j.id);else if(window._gcPhotos)window._gcPhotos.open(j.id);}catch(_e){}},children:"🔗 Share photos"}),/* patch JOBTOP */')

# ── 2b. the job header's own late buttons (📸 Open in GrayCo Photos row, ✉️ E-mail, 💬 Job Messages, the list's Year
#        bar above the page): their painters, so JOBTOP can paint them in the frame the header first appears (they ran
#        on 1.5–4 s timers and grew the header after it was drawn: the strip moved down 50–110 px) ─────────────────
t = rep(t, "  setInterval(showOnJob, 2000);", "  window._gcCCLinkPaint = showOnJob;   /* patch JOBTOP */\n  setInterval(showOnJob, 2000);")
t = rep(t, "  setInterval(bar, 4000);", "  window._gcYearBarPaint = bar;   /* patch JOBTOP */\n  setInterval(bar, 4000);")
t = rep(t, "window._gcAp3Scan = scan;", "window._gcAp3Scan = scan; window._gcAp3DeskJob = deskJob;   /* patch JOBTOP */")
t = rep(t, "  setTimeout(inject, 700);\n  console.log('[GC] Job Messages button (light) ready.');",
        "  setTimeout(inject, 700);\n  window._gcJobMsgInject = inject;   /* patch JOBTOP */\n  console.log('[GC] Job Messages button (light) ready.');")

# ── 3. Field: the FIELDPORTAL job screen ─────────────────────────────────────────────────────────────────────────
t = rep(t, "function canProfit(p){ try { if (typeof W._gcCanSeeMoney === 'function' && W._gcCanSeeMoney()) return true; } catch (e) {} return own(p) && pmRole(); }",
        "function canProfit(p){ try { if (typeof W._gcCanSeeMoney === 'function' && W._gcCanSeeMoney()) return true; } catch (e) {} return own(p) && pmRole(); }\n"
        "W._gcFpMoney = { of: function(p){ return moneyOf(p); }, canProfit: canProfit, perms: function(p){ return perms(p); }, sheet: function(p){ return moneySheet(p); } };   /* patch JOBTOP: the field summary strip */")
t = rep(t, "by.update, pm.msg && mk('msg', '💬', 'Message'), by.photo, ",
        "by.update, pm.msg && mk('msg', '💬', 'Message'), by.photo, pm.photos && mk('share', '🔗', 'Share photos'), ")
t = rep(t, "  if (a === 'fp-add' && pm.photos) { addPhotoFile(p); return true; }",
        "  if (a === 'fp-share' && pm.photos) { try { if (W._gcPhotos && W._gcPhotos.report) { W._gcPhotos.report(p.id); return true; } } catch (e) {} openPhotos(p.id); return true; }   /* patch JOBTOP */\n"
        "  if (a === 'fp-add' && pm.photos) { addPhotoFile(p); return true; }")

# ── 4. the container + the field summary (before patch Q, the first injector) ────────────────────────────────────
JS = r"""<script id="gc-patch-jobtop">
/* __GC_PATCH_JOBTOP__ — patch JOBTOP (owner 11/02: "all this stuff needs to be at top of page. All other widgets can be
   under it, but this is the overview, I need to see it up top"). The job page reads: header → summary strip → tab bar →
   tab content → #gc-job-widgets (every card / bar the patches add). window._gcJobBox(back) gives the injectors that one
   container; it is always the job page's last child (a native MutationObserver moves it back to the end before paint
   when React adds a node after it) and it goes when the job page goes. Field: the summary strip first. */
(function(){
'use strict';
if (window.__GC_PATCH_JOBTOP__) return; window.__GC_PATCH_JOBTOP__ = true;
var W = window, D = document;
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v); }
function num(v){ var n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[GC JOBTOP]', e && e.message || e); } catch (x) {} }
function css(){
  if (D.getElementById('gc-jobtop-css')) return;
  var st = D.createElement('style'); st.id = 'gc-jobtop-css';
  st.textContent = '#gc-job-widgets{display:block;clear:both;margin:18px 0 0;padding:12px 0 0;border-top:1px solid #e2e8f0}'
    + '#gc-job-widgets:empty{display:none}'
    + '#gc-job-widgets::before{content:"Job tools";display:block;margin:0 0 6px;font:700 11px Inter,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#64748b}'
    + '.gcjt-fsum{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;cursor:default}.gcjt-fsum[data-tap]{cursor:pointer}'
    + '.gcjt-fc{flex:1 1 28%;min-width:0;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:10px;padding:6px 8px;box-sizing:border-box;text-align:center}'
    + '.gcjt-fc span{display:block;font:700 9.5px Inter,Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.gcjt-fc b{display:block;font:800 14px Inter,Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.gcjt-fc.ok b{color:#15803d}.gcjt-fc.bad b{color:#b91c1c}.gcjt-fc.mut b{color:#94a3b8;font-size:12.5px}'
    + '.gcfp-shell>.gcfp-body>.gcjt-fsum{order:-3}';
  (D.head || D.documentElement).appendChild(st);
}

/* ── desk: the one container under the tab content ── */
var Native = null;   /* the app's governed observer waits while the person is clicking: use the browser's own */
try { var probe = new W.MutationObserver(function(){}); Native = probe && probe._n && probe._n.constructor; if (Native === W.MutationObserver) Native = null; } catch (e) {}
var MO = Native || W.MutationObserver;
var WATCH = { root: null, back: null, obs: null, wait: false };
function isBack(b){ return !!b && b.tagName === 'BUTTON' && /^\s*←\s*All Projects\s*$/.test(b.textContent || ''); }
function typingIn(box){ var a = D.activeElement; return !!(a && box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
function settle(){
  var r = WATCH.root, box = D.getElementById('gc-job-widgets');
  if (!box) return;
  if (!r || !WATCH.back || WATCH.back.parentElement !== r || !r.isConnected || !isBack(WATCH.back)) {   /* the job page is gone */
    box.remove(); if (WATCH.obs) { try { WATCH.obs.disconnect(); } catch (e) {} } WATCH.root = WATCH.back = WATCH.obs = null; return;
  }
  if (box.parentElement !== r) return;
  if (r.lastElementChild === box) return;
  if (typingIn(box)) {   /* never pull a box out from under someone typing: once they leave it */
    if (!WATCH.wait) { WATCH.wait = true; box.addEventListener('focusout', function f(){ box.removeEventListener('focusout', f); WATCH.wait = false; ST.call(W, settle, 0); }); }
    return;
  }
  r.appendChild(box);
}
function watch(root, back){
  if (WATCH.root === root && WATCH.back === back && WATCH.obs) return;
  if (WATCH.obs) { try { WATCH.obs.disconnect(); } catch (e) {} }
  WATCH.root = root; WATCH.back = back; WATCH.obs = null;
  try { WATCH.obs = new MO(function(){ try { settle(); } catch (e) { warn(e); } }); WATCH.obs.observe(root, { childList: true }); } catch (e) { warn(e); }
}
W._gcJobBox = function(back){
  var root = back && back.parentElement; if (!root) return null;
  css();
  var box = D.getElementById('gc-job-widgets');
  if (box && box.parentElement !== root) { box.remove(); box = null; }
  if (!box) {
    box = D.createElement('div'); box.id = 'gc-job-widgets'; box.className = 'gc-job-widgets';
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Job tools');
    root.appendChild(box);
  }
  watch(root, back);
  if (root.lastElementChild !== box && !typingIn(box)) root.appendChild(box);
  return box;
};
SI.call(W, function(){ try { if (!D.hidden && D.getElementById('gc-job-widgets')) settle(); } catch (e) {} }, 1000);

/* ── field: the summary strip on top of the job screen ── */
function proj(pid){ var l = (W._crm && W._crm.projects) || []; for (var i = 0; i < l.length; i++) if (l[i] && s(l[i].id) === s(pid)) return l[i]; return null; }
function usd(n){ return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function estCount(pid){
  var l = null; try { l = (W._gcEST && W._gcEST.all) ? W._gcEST.all() : null; } catch (e) {}
  if (!Array.isArray(l) || !l.length) l = W._gcEstimatesState;
  if (!Array.isArray(l)) return 0;
  var seen = {}, n = 0;
  l.forEach(function(e){ if (!e || e._isDraft === true || e.deleted || s(e.pid) !== s(pid) || seen[e.id]) return; seen[e.id] = 1; n++; });
  return n;
}
function sumHtml(p){
  var M = W._gcFpMoney, m = null, show = false;
  try { m = M && M.of ? M.of(p) : null; show = !!(M && M.canProfit && M.canProfit(p)); } catch (e) { m = null; }
  if (!m) m = { contract: num(p.contract || p.contractAmount), co: 0, coN: 0, costs: 0, profit: 0, margin: null };
  var pipe = false, bid = null;
  try { pipe = !!(W._gcIsPipelineJob && W._gcIsPipelineJob(p)); bid = W._gcJobBid ? W._gcJobBid(p) : null; } catch (e) {}
  var cell = function(l, v, c){ return '<div class="gcjt-fc' + (c ? ' ' + c : '') + '"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; };
  var h = '';
  if (pipe && !m.contract) h += cell('Contract', 'No contract yet', 'mut');
  else h += cell(m.co ? 'Contract + COs' : 'Contract', usd(m.contract + (m.co || 0)));
  if (pipe || (bid && !m.contract)) h += cell('Bid / Estimate', bid ? usd(bid.amount) : '—');
  h += cell('Spent', usd(m.costs || 0));
  if (show) {
    if (!m.contract) h += cell('Profit', '—') + cell('Margin', '—');
    else h += cell('Profit', usd(m.profit), m.profit >= 0 ? 'ok' : 'bad') + cell('Margin', m.margin == null ? '—' : m.margin + '%');
  }
  h += cell('Estimates', String(estCount(p.id))) + cell('Change orders', String(m.coN || 0));
  return h;
}
function fieldSum(){
  var ov = D.getElementById('_gcJobDash'); if (!ov || ov.children.length < 2) return;
  var body = ov.children[1];
  var pid = ov.getAttribute('data-gcfp') || (W._gcCurrentJob && W._gcCurrentJob.id), p = pid ? proj(pid) : null;
  var cur = body.querySelector(':scope > .gcjt-fsum');
  var M = W._gcFpMoney, ok = false;
  try { ok = !!(p && M && M.perms && M.perms(p).photos); } catch (e) { ok = false; }   /* the same people the 💰 tile is for */
  if (!ok) { if (cur) cur.remove(); return; }
  css();
  var C = W._crm || {}, L = function(k){ var v = C[k]; return Array.isArray(v) ? v.length : 0; };
  var key = [p.id, p.updatedAt, p.contract, p.status, L('invoices'), L('invs'), L('expenses'), L('changeOrders'), L('cos'), L('estimates'), Math.floor(Date.now() / 15000)].join('|');
  var h = cur && cur.__k === key && cur.getAttribute('data-pid') === s(p.id) ? cur.__h : sumHtml(p);   /* recomputed when the job's data changed (or every 15 s) */
  if (!cur || cur.getAttribute('data-pid') !== s(p.id)) {
    if (cur) cur.remove();
    cur = D.createElement('div'); cur.className = 'gcjt-fsum'; cur.setAttribute('data-pid', s(p.id)); cur.setAttribute('role', 'group'); cur.setAttribute('aria-label', 'Job summary');
    cur.addEventListener('click', function(ev){ var q = proj(cur.getAttribute('data-pid')); if (!q || !W._gcFpMoney || !W._gcFpMoney.sheet) return; ev.stopPropagation(); try { W._gcFpMoney.sheet(q); } catch (e) { warn(e); } });
    if (M.sheet) cur.setAttribute('data-tap', '1');
  }
  cur.__k = key; if (cur.__h !== h) { cur.innerHTML = h; cur.__h = h; }
  if (body.firstElementChild !== cur) body.insertBefore(cur, body.firstChild);   /* first in the DOM too (and order:-3 in the app shell) */
}
function wrapDash(){
  var f = W._gcJobDashboard; if (typeof f !== 'function' || f.__gcJT) return;
  var w = function(){ var r = f.apply(this, arguments); try { fieldSum(); } catch (e) { warn(e); } ST.call(W, function(){ try { fieldSum(); } catch (e) {} }, 300); return r; };
  try { Object.keys(f).forEach(function(k){ if (!(k in w)) w[k] = f[k]; }); } catch (e) {}
  w.__gcJT = true; W._gcJobDashboard = w;
}
SI.call(W, function(){ try { wrapDash(); if (!D.hidden && D.getElementById('_gcJobDash')) fieldSum(); } catch (e) { warn(e); } }, 1200);
ST.call(W, wrapDash, 400);
/* ── desk: the header is complete in the frame it first appears ──
   The job header gets buttons from older patches on timers (📸 Open in GrayCo Photos row every 2 s, ✉️ E-mail every
   1.5 s, 💬 Job Messages, the list's Year bar every 4 s): each one arriving made the header taller and moved the strip
   down. A native observer notices the job header the moment React draws it and runs those same painters at once
   (before the browser paints), so the strip is drawn where it stays. */
var DRESSED = '', DNAME = '', DH = null, DRESS_AT = 0, DQ = false, MISS = 0, MISS_T = null;
function jobHeader(){
  var main = D.querySelector('main'); if (!main) return null;
  var bs = main.getElementsByTagName('button');
  for (var i = 0; i < bs.length && i < 80; i++) if (isBack(bs[i])) { var head = bs[i].nextElementSibling, h1 = head && head.querySelector('h1'); return h1 ? { back: bs[i], head: head, h1: h1 } : null; }
  return null;
}
function byName(n){
  var best = null, tie = false;
  ((W._crm && W._crm.projects) || []).forEach(function(p){ if (!p || !p.id || s(p.name).trim() !== n) return; if (best) tie = true; else best = p; });
  return best && !tie ? best : null;
}
function dress(urgent){
  if (D.hidden || D.documentElement.classList.contains('_fieldmode')) return;
  var now = Date.now();
  /* already dressed: this header (same element, same job) has its 📸 row */
  if (DH && DH.isConnected && s(DH.textContent).trim() === DNAME) { var cc = D.getElementById('_gcCCLinkRow'); if (cc && cc.parentElement === DH.parentElement && cc.getAttribute('data-pid') === DRESSED) return; }
  if (!urgent && now - MISS < 120) { if (!MISS_T) MISS_T = ST.call(W, function(){ MISS_T = null; MISS = 0; dressSoon(); }, 130); return; }
  var H = jobHeader();
  if (!H) { MISS = now; return; }
  var name = s(H.h1.textContent).trim();
  if (H.h1 === DH && name === DNAME && now - DRESS_AT < 1500) return;
  /* the job on the screen: React draws the header BEFORE its effect records the open job (_gcOpenProject and the
     session's grayco_openpid still name the job opened before, or none) — read it from the header */
  var op = W._gcOpenProject, id = op && op.id ? s(op.id) : '', p = id ? proj(id) : null;
  if (!p || s(p.name).trim() !== name) { p = byName(name); if (!p) { MISS = now; return; } id = s(p.id); }
  try { if (!op || s(op.id) !== id) W._gcOpenProject = p; } catch (e) {}
  try { if (sessionStorage.getItem('grayco_openpid') !== id) sessionStorage.setItem('grayco_openpid', id); } catch (e) {}   /* what the app writes a moment later */
  if (D.querySelector('h1') !== H.h1) { MISS = now; return; }   /* the 📸 row goes under the page's first h1: only when that is this job's */
  DRESSED = id; DNAME = name; DH = H.h1; DRESS_AT = now;
  ['_gcYearBarPaint', '_gcCCLinkPaint', '_gcAp3DeskJob', '_gcJobMsgInject', '_gcPhotosDeskBtn'].forEach(function(k){ try { if (typeof W[k] === 'function') W[k](); } catch (e) {} });
}
/* ── desk: ROLEAPPS' Desk dock on a short screen (the owner's laptop at 125 %: about 1093 × 480) ──
   The floating dock (Home · Jobs · Approvals · Photos · More, ~87 px tall, centered at the bottom) covered the job
   page's tab bar there. Under 600 px of window height it becomes a compact icon row at the bottom of the left menu
   (each button keeps its name as a tooltip); taller again, it floats as before. Its buttons are the same ones
   (ROLEAPPS handles their clicks by #gc-ra-dock [data-t], wherever the dock is). */
var SHORT = 600;
function dockPlace(){
  var d = D.getElementById('gc-ra-dock'); if (!d) return;
  var short = (W.innerHeight || 999) < SHORT, aside = D.querySelector('#root aside') || D.querySelector('aside');
  if (short && aside && !D.documentElement.classList.contains('_fieldmode')) {
    if (!d.classList.contains('gcjt-dock-side')) d.classList.add('gcjt-dock-side');
    if (d.parentElement !== aside || aside.lastElementChild !== d) aside.appendChild(d);
    var lab = {}; try { (W._gcRA && W._gcRA.bar ? W._gcRA.bar() : []).forEach(function(x){ lab[x.k] = x.label; }); } catch (e) {}
    Array.prototype.forEach.call(d.querySelectorAll('[data-t]'), function(b){ var l = lab[b.getAttribute('data-t')] || s(b.textContent).replace(/[^A-Za-z /]+/g, ' ').trim(); if (l && b.title !== l) b.title = l; if (l && !b.getAttribute('aria-label')) b.setAttribute('aria-label', l); });
  } else if (d.classList.contains('gcjt-dock-side')) {
    d.classList.remove('gcjt-dock-side');
    if (d.parentElement !== D.body) D.body.appendChild(d);
  }
}
function dockCss(){
  if (D.getElementById('gc-jobtop-dock-css')) return;
  var st = D.createElement('style'); st.id = 'gc-jobtop-dock-css';
  st.textContent = '#gc-ra-dock.gcjt-dock-side{position:static!important;transform:none!important;left:auto!important;right:auto!important;bottom:auto!important;flex:0 0 auto;display:flex;flex-wrap:wrap;justify-content:space-around;gap:2px;margin:4px 6px 6px;padding:3px 4px;border-radius:12px;box-shadow:none;z-index:auto}'
    + '#gc-ra-dock.gcjt-dock-side button{min-width:34px!important;min-height:0!important;padding:4px 5px!important;font-size:0!important;gap:0;border-radius:9px}'
    + '#gc-ra-dock.gcjt-dock-side button .e,#gc-ra-dock.gcjt-dock-side button .c{font-size:17px!important;line-height:1.1}'
    + '#gc-ra-dock.gcjt-dock-side .gc-fh-badge{font-size:10px!important;top:-3px;right:-6px;padding:0 4px}';
  (D.head || D.documentElement).appendChild(st);
}
dockCss();
W.addEventListener('resize', function(){ try { dockPlace(); } catch (e) {} });
SI.call(W, function(){ try { dockPlace(); } catch (e) {} }, 700);
try { new MO(function(ms){ for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) if (ms[i].addedNodes[j].id === 'gc-ra-dock') { dockPlace(); return; } }).observe(D.body || D.documentElement, { childList: true }); } catch (e) {}
/* a burst that draws or changes an h1 (a job header appearing, or the next job's name in it) is looked at at once — the
   120 ms rest after a miss (a list page redrawing) must never let a new header paint without its buttons */
var URG = false;
function urgentRecs(ms){
  for (var i = 0; i < (ms ? ms.length : 0); i++) {
    var r = ms[i], tg = r.target; if (tg && tg.nodeType === 3) tg = tg.parentNode;
    if (tg && tg.tagName === 'H1') return true;
    var ad = r.addedNodes;
    for (var j = 0; j < ad.length; j++) { var n = ad[j]; if (n.nodeType === 1 && (n.tagName === 'H1' || (n.firstElementChild && n.querySelector('h1')))) return true; }
  }
  return false;
}
function dressSoon(urgent){ if (urgent) URG = true; if (DQ) return; DQ = true; Promise.resolve().then(function(){ DQ = false; var u = URG; URG = false; try { dress(u); } catch (e) { warn(e); } }); }
try { var dmo = new MO(function(ms){ dressSoon(urgentRecs(ms)); }); dmo.observe(D.documentElement, { childList: true, subtree: true, characterData: true }); } catch (e) { warn(e); }
SI.call(W, function(){ dressSoon(false); }, 1000);
W._gcJobTop = { box: function(){ return D.getElementById('gc-job-widgets'); }, settle: settle, fieldSum: fieldSum, dress: dress, dock: dockPlace };
try { console.log('[GC] Job page: header → summary → tabs → tab content → job tools (patch JOBTOP) — _gcJobBox'); } catch (e) {}
})();
</script>
"""
anchor = "<script>\n/* ============================================================================\n   GrayCo — THE CUSTOMER PORTAL, CRM SIDE.   Build 33.144 (patch Q)"
t = rep(t, anchor, JS + anchor)

open(p, 'w', encoding='utf-8').write(t)
print('JOBTOP: patched')
