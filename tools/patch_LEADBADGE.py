#!/usr/bin/env python3
"""Idempotent patch LEADBADGE: the left menu's Leads number means ONE thing — the leads that need action — and it is
the same number as the Leads page's own count boxes.

Owner (11/01, a live screenshot): the menu said "Leads 41" while the Leads page's boxes said "0 Needs assigning ·
5 Due in 7 days · 29 Not contacted", and the Lead Inbox tab said 42: "should left tab be going down when this does".

What was counted before (three painters on the one menu item):
  * patch BW (amber .gc-bw-unas, admins): window._gcUnassignedLeadCount() = the Lead Inbox's assignList(), i.e. inbox
    leads whose inboxState is "new" and that have no PM. A bid lead the Senior Estimator already has (estimator set,
    pm empty) still counted -- so 41 "unassigned" while the page's "Needs assigning" (no PM, estimator or APM) said 0.
    It never dropped when a lead was contacted, and only dropped on assigning a PM.
  * patch LA (red .gc-la-badge, everyone, off the Leads tab): new leads this person has not looked at yet.
  * patch LEADSUX (.gcl-nb): stood down for BW's.
Now (patch LEADBADGE): one badge, .gcl-nb, painted by the Leads page block itself from the same lead list, scope
and tests as its boxes: |Needs assigning ∪ Not contacted| over the open leads the page counts (one lead in both is
counted once), + Lead Inbox items the server has that are not on the lead list yet. Hover: "29 not contacted ·
0 need assigning". It follows the list at once (the Leads block's 1.5 s tick, and gc:leads-changed / a lead save).
BW's and LA's painters stand down (their numbers stay where they belong: LA's NEW tags on the list, the Lead
Inbox's own count on its tab).  window._gcLeadsNeedAction() → { n, un, nc, both, inbox, ids }.

Usage: python3 tools/patch_LEADBADGE.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch LEADBADGE */'
if MARK in src:
    print('LEADBADGE: already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('LEADBADGE anchor count != 1', n, old[:100])
    return s.replace(old, new)

# 1. LEADSUX: the one Leads badge = the page's boxes
OLD = """/* ── the Leads menu badge (admins): the unassigned count ─────────────────── */
var navEls = [];
function navBadge(){
  /* patch BW badges the Leads menu itself (window._gcUnassignedLeadCount): then this one stays out, so there is one number */
  if (!isAdmin() || typeof W._gcUnassignedLeadCount === 'function') { Array.prototype.forEach.call(D.querySelectorAll('.gcl-nb'), function(b){ b.remove(); }); return; }
  if (!navEls.length || navEls.some(function(el){ return !el.isConnected; })) {
    navEls = Array.prototype.filter.call(D.querySelectorAll('aside nav button, nav button, aside button, [role=navigation] button'), function(el){ return /^Leads$/.test(s(el.textContent).replace(/\\s*\\d+\\+?$/, '').replace(/^[^A-Za-z]+/, '').trim()); });
  }
  var n = unassignedCount();
  navEls.forEach(function(el){
    var b = el.querySelector('.gcl-nb');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = D.createElement('span'); b.className = 'gcl-nb'; el.appendChild(b); }
    var v = String(n); if (b.textContent !== v) b.textContent = v;
    b.title = n + ' lead' + (n === 1 ? '' : 's') + ' not assigned yet';
  });
}
"""
NEW = """/* ── the Leads menu badge ─────────────────── */
""" + MARK + """   /* one number on the Leads menu: the leads that need action -- the page's own boxes (Needs assigning ∪ Not
   contacted, a lead in both counted once) over the same open leads in this person's scope, + Lead Inbox items not on
   the lead list yet. Patch BW's and LA's menu numbers stand down for it. */
var NA = { key: '', v: null };
function inboxNotYet(r){
  var it = []; try { var st = W._gcLeadInbox && W._gcLeadInbox._test && W._gcLeadInbox._test.state(); it = arr(st && st.items); } catch (e) {}
  if (!it.length) return 0;
  var have = {}; r.forEach(function(l){ if (l && l.inboxId) have[s(l.inboxId)] = 1; });
  return it.filter(function(x){ return x && x.status === 'new' && !have[s(x.id)] && !(W._gcIsTombstoned && W._gcIsTombstoned('leads', 'LEADIN-' + s(x.id).replace(/^LI-/, ''))); }).length;
}
function needAction(){
  var r = rawLeads(), sc = myScope(), nIt = 0; try { var st0 = W._gcLeadInbox && W._gcLeadInbox._test && W._gcLeadInbox._test.state(); nIt = arr(st0 && st0.items).length; } catch (e) {}
  var key = [refId(r), OVL_V, sc.kind, sc.why, myName(), Object.keys(LC_GONE).length, nIt, s(inboxRaw()).length].join('|');
  if (NA.key === key && NA.v) return NA.v;
  var base = scoped().filter(function(l){ return !importedL(l) && !shut(l) && !LC_GONE[s(l.id)]; });   /* = model()'s base: the boxes */
  var un = 0, nc = 0, both = 0, ids = [];
  base.forEach(function(l){ var a = !assignee(l), c = !contacted(l); if (a) un++; if (c) nc++; if (a && c) both++; if (a || c) ids.push(s(l.id)); });
  var inb = inboxNotYet(r);
  NA = { key: key, v: { n: ids.length + inb, un: un, nc: nc, both: both, inbox: inb, ids: ids } };
  return NA.v;
}
W._gcLeadsNeedAction = function(){ var v = needAction(); return { n: v.n, un: v.un, nc: v.nc, both: v.both, inbox: v.inbox, ids: v.ids.slice() }; };
var navEls = [];
function navBadge(){
  if (!navEls.length || navEls.some(function(el){ return !el.isConnected; })) {
    navEls = Array.prototype.filter.call(D.querySelectorAll('aside nav button, nav button, aside button, [role=navigation] button'), function(el){ return !el.closest('#gc-ldi') && /^Leads$/.test(s(el.textContent).replace(/(\\s*\\d+\\+?)+$/, '').replace(/^[^A-Za-z]+/, '').trim()); });
  }
  var v = null; try { v = needAction(); } catch (e) { warn(e); }
  var n = v ? v.n : 0;
  var tip = v ? v.nc + ' not contacted · ' + v.un + ' need' + (v.un === 1 ? 's' : '') + ' assigning' + (v.inbox ? ' · ' + v.inbox + ' new in the Lead Inbox' : '') + (v.both ? ' (' + v.both + ' in both, counted once)' : '') : '';
  navEls.forEach(function(el){
    Array.prototype.forEach.call(el.querySelectorAll('.gc-bw-unas,.gc-la-badge,.gc-ldi-badge'), function(x){ x.remove(); });   /* the old numbers */
    var b = el.querySelector('.gcl-nb');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = D.createElement('span'); b.className = 'gcl-nb'; el.appendChild(b); }
    var t = String(n); if (b.textContent !== t) b.textContent = t;
    if (b.title !== tip) { b.title = tip; b.setAttribute('aria-label', n + ' lead' + (n === 1 ? '' : 's') + ' need action: ' + tip); }
  });
}
/* a lead assigned / dismissed / imported anywhere: read this computer's copy now (not in up to 4 s) and repaint */
W.addEventListener('gc:leads-changed', function(){ LEADS_AT = 0; try { pullLeads(); } catch (e) {} [80, 500, 1300].forEach(function(ms){ later(function(){ try { navBadge(); } catch (e) {} }, ms); }); });
/* and on the browser's own timer (the Leads block's tick can be held back while the screen is busy): a lead marked
   contacted / assigned on this computer shows in the number within the second; unchanged lists cost a key compare */
(W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval).call(W, function(){ if (!D.hidden) { try { navBadge(); } catch (e) {} } }, 700);
"""
src = once(src, OLD, NEW)

# 2. patch BW's amber number on the Leads menu stands down (one number)
OLD = """    var n = isAdmin() && !(window._gcVAS && window._gcVAS.active()) ? window._gcUnassignedLeadCount() : 0;   /* patch VAS4 */"""
NEW = """    var n = isAdmin() && !(window._gcVAS && window._gcVAS.active()) && typeof window._gcLeadsNeedAction !== 'function' ? window._gcUnassignedLeadCount() : 0;   /* patch VAS4 */   /* patch LEADBADGE: the Leads block paints the one number */"""
src = once(src, OLD, NEW)

# 3. patch LA's red "not seen yet" number on the Leads menu stands down too
OLD = """function badge(){
  var n = onLeadsView() ? 0 : unseen().length;"""
NEW = """function badge(){
  var n = onLeadsView() || typeof W._gcLeadsNeedAction === 'function' ? 0 : unseen().length;   /* patch LEADBADGE: one number on the Leads menu */"""
src = once(src, OLD, NEW)

# 4. LD2 no longer puts the Lead Inbox's count on To-Do (the yellow number): leads are counted on Leads only
OLD = """  var m = isAdmin() ? assignList().length : 0;
  paint(navEls.todo, m, m + ' lead' + (m === 1 ? '' : 's') + ' waiting for a PM (Lead Inbox)');"""
NEW = """  paint(navEls.todo, 0, '');   /* patch LEADBADGE: leads are counted on the Leads menu only, never on To-Do (this was the yellow number) */"""
src = once(src, OLD, NEW)

# 5. TD2: the To-Do number counts only what has no tab of its own (approvals -> Approvals, leads & bids -> Leads,
#    messages -> Messages); the To-Do page says the same number, with the breakdown
OLD = """  c.apprRows = apprRows; c.todos = Math.max(0, c.total - apprRows);   /* patch TODOPERF: the menu badge */"""
NEW = """  c.apprRows = apprRows; c.todos = Math.max(0, c.total - apprRows);   /* patch TODOPERF: the menu badge */
  ownTab(st.items, c);   /* patch LEADBADGE */"""
src = once(src, OLD, NEW)
OLD = """function counts(st){
  var c = { appr: st.ap2, over: 0, today: 0, week: 0, wait: 0, total: 0, mine: 0 }, apprRows = 0;"""
NEW = """/* patch LEADBADGE: what the To-Do menu number counts -- the open to-dos (not waiting on others) that have no tab of their
   own: an approval is counted on Approvals, a lead / bid line on Leads, a message on Messages (they stay on the page) */
function leadItem(g){
  if (!g) return false;
  if (g.src === 'lead' || g.roll === 'lead-miss' || s(g.thing) === 'roll|lead-miss') return true;
  if (/(^|[|:])(lead|leadmiss|leadin|lead-inbox)[|:]/i.test(s(g.thing) + ' ' + s(g.key))) return true;
  var r = g.rec; if (r && (r.leadId || /^lead inbox$/i.test(s(r.source)) || /^lead/i.test(s(r.kind)))) return true;
  return /^(Bid due:|Add the bid due date:)/.test(s(g.title)) || /\bassign this lead\b|\blead first contact\b/i.test(s(g.title));   /* "⏫ Approve: lead first contact", "↩ Fix and resend: 👤 Assign this lead" */
}
function msgItem(g){ return !!g && ((g.rec && g.rec.kind === 'mention') || /^(msg|message|chat|sms)/i.test(s(g.src)) || /(^|[|:])(msg|message|chat|thread|sms)[|:]/i.test(s(g.thing) + ' ' + s(g.key))); }   /* an @mention in a job's messages: 💬 Reply */
function ownTab(items, c){
  var t0 = today(), old = addDays(t0, -30), k = { over: 0, today: 0, week: 0, later: 0, none: 0 };
  c.leadRows = 0; c.msgRows = 0; c.old30 = 0; c.todos = 0; c.others = 0; c.grouped = 0;
  arr(items).forEach(function(g){
    if (!g || g.waiting || g.cat === 'appr') return;
    if (leadItem(g)) { c.leadRows++; return; }
    if (msgItem(g)) { c.msgRows++; return; }
    if (g.vis !== 'company' && g.who && g.who.length && !g.mine) { c.others++; return; }   /* someone else's (the Team view has it) */
    if (g.children && g.children.length) c.grouped += g.children.length - 1;
    c.todos++; k[g.dueCls === 'over' ? 'over' : g.dueCls === 'today' ? 'today' : g.dueCls === 'week' ? 'week' : g.due ? 'later' : 'none']++;
    if (g.due && g.due < old) c.old30++;
  });
  c.byDue = k;
  var parts = [k.over && k.over + ' overdue' + (c.old30 ? ' (' + c.old30 + ' over 30 days)' : ''), k.today && k.today + ' due today', k.week && k.week + ' this week', k.later && k.later + ' later', k.none && k.none + ' no date'].filter(Boolean);
  var off = [c.leadRows && c.leadRows + ' lead & bid line' + (c.leadRows === 1 ? '' : 's') + ' (on Leads)', c.msgRows && c.msgRows + ' message' + (c.msgRows === 1 ? '' : 's') + ' (on Messages)', c.others && c.others + ' given to someone else (Team)'].filter(Boolean);
  c.tip = c.todos + ' to-do' + (c.todos === 1 ? '' : 's') + (parts.length ? ': ' + parts.join(' · ') : '') + (c.grouped ? ' · look-alike lines grouped (' + c.grouped + ' more listed under them)' : '') + (off.length ? ' — not counted here: ' + off.join(', ') + '; approvals are on Approvals' : ' — approvals are on Approvals');
  return c;
}
function counts(st){
  var c = { appr: st.ap2, over: 0, today: 0, week: 0, wait: 0, total: 0, mine: 0 }, apprRows = 0;"""
src = once(src, OLD, NEW)
OLD = """  c.apprRows = 0; c.todos = c.total; c.now = c.over + c.today; v.counts = c;"""
assert src.count(OLD) == 2, 'TD2 view counts'
src = src.replace(OLD, """  c.apprRows = 0; c.todos = c.total; c.now = c.over + c.today; v.counts = c; ownTab(items0(v), c);   /* patch LEADBADGE */""")
OLD = """var NAV = null;
function noAppr(st){"""
NEW = """var NAV = null;
function items0(v){ return v && v.items; }   /* patch LEADBADGE */
function noAppr(st){"""
src = once(src, OLD, NEW)
OLD = """+ '</div><div class="td2-who">' + esc(d) + ' · ' + esc(who) + '</div></div></div>'"""
NEW = """+ '</div><div class="td2-who">' + esc(d) + ' · ' + esc(who) + '</div>' + (st && st.counts && st.counts.tip != null ? '<div class="td2-who td2-cnt" data-td2-count="' + st.counts.todos + '" title="' + esc(st.counts.tip) + '"><b>' + st.counts.todos + ' to-do' + (st.counts.todos === 1 ? '' : 's') + '</b>' + (st.counts.leadRows ? ' · ' + st.counts.leadRows + ' lead &amp; bid line' + (st.counts.leadRows === 1 ? '' : 's') + ' counted on Leads' : '') + (st.counts.msgRows ? ' · ' + st.counts.msgRows + ' on Messages' : '') + '</div>' : '') + '</div></div>'   /* patch LEADBADGE: the menu's number, on the page */"""
src = once(src, OLD, NEW)

# 5b. TD2: look-alike job lines are one line each (counted once, every job still listed under it): finished jobs with no
#     signed contract on file, "Verify all costs on: <job>", finished jobs missing the closeout checklist, maintenance-plan offers
OLD = """    if (g.thing.indexOf('info|') === 0) g.roll = 'info';"""
NEW = """    if (g.thing.indexOf('info|') === 0) g.roll = 'info';
    /* patch LEADBADGE: look-alike lines roll up (3+ → one line, each job still listed under it) */
    if (!g.roll && g.thing.indexOf('contract|') === 0) { var pj0 = proj(g.thing.slice(9)); if (pj0 && /^(completed?|closed|archived|cancell?ed|done|paid|finished)$/i.test(s(pj0.status))) g.roll = 'contract-done'; }
    if (!g.roll && g.src === 'om' && /^Verify all costs on\\b/i.test(g.title)) g.roll = 'verify';
    if (!g.roll && g.src === 'om' && /^Closeout checklist missing\\b/i.test(g.title)) g.roll = 'closeout';
    if (!g.roll && /^(🛠\\s*)?Offer a maintenance plan\\b/i.test(g.title)) g.roll = 'maint';"""
src = once(src, OLD, NEW)
OLD = """'subappr': n + ' sub invoices to approve' })[k]"""
NEW = """'subappr': n + ' sub invoices to approve', 'contract-done': n + ' finished jobs have no signed contract on file', 'verify': 'Verify the costs on ' + n + ' jobs', 'closeout': n + ' finished jobs are missing the closeout checklist', 'maint': 'Offer a maintenance plan to ' + n + ' customers' })[k]   /* patch LEADBADGE: + 4 */"""
src = once(src, OLD, NEW)

# 6. TODOPERF: the menu number's hover = the breakdown
OLD = """  return { n: todos, todos: todos, appr: appr };   /* patch TODONOAPPR: approvals have their own badge */"""
NEW = """  return { n: todos, todos: todos, appr: appr, tip: c.tip || '' };   /* patch TODONOAPPR: approvals have their own badge */   /* patch LEADBADGE: + tip */"""
src = once(src, OLD, NEW)
OLD = """    var tt = k.todos + ' to-do' + (k.todos === 1 ? '' : 's');   /* patch TODONOAPPR */"""
NEW = """    var tt = k.tip || (k.todos + ' to-do' + (k.todos === 1 ? '' : 's'));   /* patch TODONOAPPR */   /* patch LEADBADGE: the breakdown */"""
src = once(src, OLD, NEW)

# 7. Approvals: the hover says what is waiting (the set's own breakdown)
OLD = """    var _tt = n + ' approval' + (n === 1 ? '' : 's') + ' waiting on you'; if (b.title !== _tt) b.title = _tt;   /* patch SWEEP2 */"""
NEW = """    var _tp = ''; try { var _cs = W._gcApprovalCurrent ? W._gcApprovalCurrent() : null; _tp = _cs && _cs.total === n + pendCount() && _cs.tip ? ': ' + _cs.tip : ''; } catch (e) {}   /* patch LEADBADGE: the breakdown */
    var _tt = n + ' approval' + (n === 1 ? '' : 's') + ' waiting on you' + _tp; if (b.title !== _tt) b.title = _tt;   /* patch SWEEP2 */"""
src = once(src, OLD, NEW)

# 8. Accounting: the hover says what is to match / review (computeMatch's own counts)
OLD = """      badgeMemo.n=computeMatch(ccTrans).total;"""
NEW = """      var _bm=computeMatch(ccTrans); badgeMemo.n=_bm.total; badgeMemo.c=_bm.counts;   /* patch LEADBADGE: + the kinds, for the hover */"""
src = once(src, OLD, NEW)
OLD = """      var n=computeMatch(badgeMemo.cc).total; badgeMemo.n=n; badgeMemo.at=EXTRA.loadedAt;
      var b=document.getElementById('gck-navbadge'); if(b) b.setAttribute('data-n', String(n));"""
NEW = """      var _bm=computeMatch(badgeMemo.cc), n=_bm.total; badgeMemo.n=n; badgeMemo.c=_bm.counts; badgeMemo.at=EXTRA.loadedAt;
      var b=document.getElementById('gck-navbadge'); if(b){ b.setAttribute('data-n', String(n)); b.title=acctTip(); }   /* patch LEADBADGE */"""
src = once(src, OLD, NEW)
OLD = """function badgeEl(R){
    ensureCss();"""
NEW = """function acctTip(){   /* patch LEADBADGE: "8 to match / review in Accounting: 5 card transactions · 3 expenses to approve" */
  var c=badgeMemo.c||{}, L={ cc:['card transaction not matched','card transactions not matched'], exp:['expense to approve','expenses to approve'], qb:['QuickBooks invoice to confirm','QuickBooks invoices to confirm'], qbtodo:['QuickBooks import to-do','QuickBooks import to-dos'], dup:['possible duplicate','possible duplicates'] };
  var parts=Object.keys(c).filter(function(k){ return c[k]; }).map(function(k){ var l=L[k]||[k,k]; return c[k]+' '+(c[k]===1?l[0]:l[1]); });
  return badgeMemo.n+' to match / review in Accounting'+(parts.length?': '+parts.join(' · '):'');
}
function badgeEl(R){
    ensureCss();"""
src = once(src, OLD, NEW)
OLD = """title:'To match / review in Accounting',"""
NEW = """title:acctTip(),"""
src = once(src, OLD, NEW)

# 9. the role apps' ✅ Approvals number: the same number as the menu's (in-flight decisions taken off, as apx-nb does),
#    with the same breakdown on hover
OLD = """  var n = apprCount(), tx = n > 0 ? String(n) : '';
  ['gc-fh-badge', 'gc-ra-badge'].forEach(function(id){ var b = D.getElementById(id); if (!b) return; if (b.textContent !== tx) b.textContent = tx;"""
NEW = """  var n = apprCount(), tx, tt = '';
  try { n = Math.max(0, n - (typeof W._gcApprovalPending === 'function' ? +W._gcApprovalPending() || 0 : 0)); var cs = W._gcApprovalCurrent ? W._gcApprovalCurrent() : null; tt = n + ' approval' + (n === 1 ? '' : 's') + ' waiting on you' + (cs && cs.tip ? ': ' + cs.tip : ''); } catch (e) {}   /* patch LEADBADGE: = the menu's number, + its breakdown */
  tx = n > 0 ? String(n) : '';
  ['gc-fh-badge', 'gc-ra-badge'].forEach(function(id){ var b = D.getElementById(id); if (!b) return; if (b.title !== tt) b.title = tt; if (b.textContent !== tx) b.textContent = tx;"""
src = once(src, OLD, NEW)

open(path, 'w', encoding='utf-8').write(src)
print('LEADBADGE: patched')
