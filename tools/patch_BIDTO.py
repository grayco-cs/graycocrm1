#!/usr/bin/env python3
"""Idempotent patch BIDTO: one bid, every GC that invited us (owner 10/26: "make sure when commercial bids come through they
account for every email and company we need to send it to when we get the invite").

Server (bid-inbox.js) keeps item.bidTo = one row per inviting GC; this patch makes the CRM use it:
  * Lead Inbox import (fromItem): the item's GC rows are merged onto lead.bidTo (window._gcBidToMerge; a GC someone removed
    stays removed: lead.bidToRemoved).
  * BIDSEND "Bidding to" list (listFor): every GC row on the lead that is not on the list yet is added (dedupe by e-mail, else by
    company); removing one remembers it (gc_bid_bidders rec.removed + lead.bidToRemoved). Saving mirrors the list onto
    lead.bidTo (status / sent time per GC) and "due to" = the earliest-due open GC.
  * Lead side panel: "🏢 Bidding to (N GCs)" with company, person, e-mail, phone, due, ✓ sent time, a checkbox per GC (default:
    every GC not sent yet with an e-mail) — 📤 Send bid sends to the checked ones.
  * Send bid dialog: "✓ sent <time>" per GC, and "Open in Gmail instead" as one button per GC (one compose each).
Every find-string must occur exactly once. Usage: python3 tools/patch_BIDTO.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_BIDTO__'
if MARK in src:
    print('already patched'); sys.exit(0)


def rep(a, b):
    global src
    n = src.count(a)
    assert n == 1, ('find-string count != 1', n, a[:120])
    src = src.replace(a, b)


# 1. the Lead Inbox import: the item's GC rows onto the lead
rep("""  ['dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere'].forEach(function(f){ if (!s(l[f]) && s(it[f])) l[f] = s(it[f]); });   /* LA: who it is due to */
""", """  ['dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere'].forEach(function(f){ if (!s(l[f]) && s(it[f])) l[f] = s(it[f]); });   /* LA: who it is due to */
  try { if (typeof window._gcBidToMerge === 'function') { var _bt = window._gcBidToMerge(l, it); if (_bt) l.bidTo = _bt; } } catch (e) {}   /* patch BIDTO: every GC that invited us */
""")

# 2. helpers (after BIDSEND's fromLead)
HELPERS = r"""
/* __GC_PATCH_BIDTO__ — every GC that invited us to this bid (owner 10/26: "account for every email and company we need to send
   it to when we get the invite"). bid-inbox.js keeps one row per inviting GC on the Lead Inbox item (bidTo); the import puts
   them on lead.bidTo; here they join the "Bidding to" list. Same GC = same e-mail, else the same company. A GC someone removed
   stays removed (rec.removed / lead.bidToRemoved). */
function gcNormCo(c){ return low(c).replace(/&/g, ' and ').replace(/\b(inc|llc|l l c|co|corp|corporation|company|ltd|lp|llp|pllc|group|the)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function gcKey(b){ var e = low(b && b.email); if (EMAIL_RE.test(e)) return 'e:' + e; var c = gcNormCo(b && b.company); return c ? 'c:' + c : ''; }
function sameGc(a, b){ if (!a || !b) return false; var x = low(a.email), y = low(b.email); if (EMAIL_RE.test(x) && EMAIL_RE.test(y)) return x === y; var p = gcNormCo(a.company), q = gcNormCo(b.company); return !!p && p === q; }
function findGc(list, g){ return list.filter(function(x){ return sameGc(x, g); })[0] || (EMAIL_RE.test(low(g.email)) && list.filter(function(x){ return !EMAIL_RE.test(low(x.email)) && gcNormCo(x.company) && gcNormCo(x.company) === gcNormCo(g.company); })[0]) || null; }
function removedKeys(l, rec){ return arr(rec && rec.removed).concat(arr(l && l.bidToRemoved)); }
var GC_FILL = ['company', 'contact', 'email', 'phone', 'due', 'source', 'inviteLink', 'receivedAt'];
/* the lead's GC rows on the "Bidding to" list */
function withInvites(list, l, rec){
  var rm = removedKeys(l, rec);
  arr(l && l.bidTo).forEach(function(g){
    if (!g || !(s(g.company) || s(g.email)) || rm.indexOf(gcKey(g)) >= 0) return;
    var b = findGc(list, g);
    if (b) { GC_FILL.forEach(function(f){ if (!s(b[f]) && s(g[f])) b[f] = f === 'email' ? low(g[f]) : s(g[f]); }); return; }
    list.push({ id: bidId(list), company: s(g.company), contact: s(g.contact), email: low(g.email), phone: s(g.phone), due: s(g.due) || s(l.bidDue), method: s(g.method) || s(l.submitMethod) || 'email',
      status: STATUSES.indexOf(s(g.status)) >= 0 ? s(g.status) : 'not sent', sentAt: s(g.sentAt) || undefined, sentBy: s(g.sentBy) || undefined, notes: '', price: '', log: [],
      source: s(g.source), inviteLink: s(g.inviteLink), receivedAt: s(g.receivedAt), fromInvite: true });
  });
  return list;
}
/* what the lead keeps of each row (lead.bidTo): who, when it is due, and whether / when it was sent — never a price */
function leadRow(b){ var o = {}; ['company', 'contact', 'email', 'phone', 'due', 'method', 'status', 'sentAt', 'sentBy', 'source', 'inviteLink', 'receivedAt', 'emailId'].forEach(function(f){ if (s(b[f])) o[f] = f === 'email' ? low(b[f]) : s(b[f]); }); return o; }
function dueKey(d){ d = s(d); return d.length > 10 ? d.slice(0, 16) : d ? d + 'T23:59' : '9999'; }
function earliestRow(list){ return arr(list).filter(function(b){ return s(b.due) && !/^(won|lost)$/.test(b.status) && (s(b.company) || s(b.email)); }).sort(function(a, b){ return dueKey(a.due) < dueKey(b.due) ? -1 : dueKey(a.due) > dueKey(b.due) ? 1 : 0; })[0] || null; }
/* the Lead Inbox import: lead l (already has the item's fields) + the item's GC rows → the lead's rows */
W._gcBidToMerge = function(l, it){
  var cur = arr(l.bidTo).map(function(g){ return Object.assign({}, g); });
  if (!cur.length && (s(l.dueToCompany) || s(l.dueToEmail))) cur.push(leadRow({ company: l.dueToCompany, contact: l.dueToContact, email: l.dueToEmail, phone: l.dueToPhone, due: l.bidDue, source: l.source }));
  var rm = arr(l.bidToRemoved);
  arr(it && it.bidTo).forEach(function(g){
    if (!g || !(s(g.company) || s(g.email)) || rm.indexOf(gcKey(g)) >= 0) return;
    var b = findGc(cur, g);
    if (b) { GC_FILL.concat(['board', 'emailId']).forEach(function(f){ if (!s(b[f]) && s(g[f])) b[f] = s(g[f]); }); return; }
    cur.push(leadRow(g));
  });
  return cur.length ? cur.slice(0, 40) : null;
};
"""
rep("""function listFor(key){
  var c = ctxOf(key); var k = c ? c.key : key;""", HELPERS.lstrip('\n') + """function listFor(key){
  var c = ctxOf(key); var k = c ? c.key : key;""")

# 3. listFor: the lead's GC rows join the list
rep("""  if (!list.length && c && c.lead) list = fromLead(c.lead);
""", """  if (c && c.lead) list = withInvites(list.length ? JSON.parse(JSON.stringify(list)) : fromLead(c.lead), c.lead, rec);   /* patch BIDTO */
""")

# 4. setList: remember removed GCs; mirror the list onto the lead
rep("""  list = arr(list).map(function(b){ var o = Object.assign({}, b); delete o.fromLead; o.email = low(o.email); o.status = STATUSES.indexOf(o.status) >= 0 ? o.status : 'not sent'; return o; });
  return putMap('bidders', k, { list: list }).then(function(){ return c && c.lead ? mirrorToLead(c.lead.id, list) : true; });""",
"""  /* patch BIDTO: a GC taken off the list stays off (an invite e-mail does not bring it back); one put back is welcome again */
  var prev = listFor(key), rm = arr((S.bidders[k] || {}).removed).slice();
  list = arr(list).map(function(b){ var o = Object.assign({}, b); delete o.fromLead; delete o.fromInvite; o.email = low(o.email); o.status = STATUSES.indexOf(o.status) >= 0 ? o.status : 'not sent'; return o; });
  prev.forEach(function(b){ if (!list.some(function(x){ return x.id === b.id || sameGc(x, b); })) { var kk = gcKey(b); if (kk && rm.indexOf(kk) < 0) rm.push(kk); } });
  list.forEach(function(b){ var i = rm.indexOf(gcKey(b)); if (i >= 0) rm.splice(i, 1); });
  rm = rm.slice(-100);
  return putMap('bidders', k, { list: list, removed: rm }).then(function(){ return c && c.lead ? mirrorToLead(c.lead.id, list, rm) : true; });""")

# 5. mirrorToLead: "due to" = the earliest-due open GC; the rows (status / sent time) on the lead
rep("""function mirrorToLead(id, list){
  var first = list[0]; if (!first) return Promise.resolve(true);
  var open = list.filter(function(b){ return s(b.due) && !/^(won|lost)$/.test(b.status); }).map(function(b){ return s(b.due); }).sort();
  return patchLead(id, function(l){
    var ch = false;
    [['dueToCompany', first.company], ['dueToContact', first.contact], ['dueToEmail', first.email], ['dueToPhone', first.phone], ['submitMethod', first.method]].forEach(function(p){ if (s(p[1]) && s(l[p[0]]) !== s(p[1])) { l[p[0]] = p[1]; ch = true; } });
    if (open[0] && s(l.bidDue) !== open[0]) { l.bidDue = open[0]; ch = true; }
    return ch ? undefined : false;
  });
}""", """function mirrorToLead(id, list, rm){
  var first = earliestRow(list) || list[0];   /* patch BIDTO: the earliest-due GC (was: the first row) */
  var open = list.filter(function(b){ return s(b.due) && !/^(won|lost)$/.test(b.status); }).map(function(b){ return s(b.due); }).sort(function(a, b){ return dueKey(a) < dueKey(b) ? -1 : dueKey(a) > dueKey(b) ? 1 : 0; });
  var rows = list.map(leadRow);
  return patchLead(id, function(l){
    var ch = false;
    if (first) [['dueToCompany', first.company], ['dueToContact', first.contact], ['dueToEmail', first.email], ['dueToPhone', first.phone], ['submitMethod', first.method]].forEach(function(p){ if (s(p[1]) && s(l[p[0]]) !== s(p[1])) { l[p[0]] = p[1]; ch = true; } });
    if (open[0] && s(l.bidDue) !== open[0]) { l.bidDue = open[0]; ch = true; }
    if (JSON.stringify(arr(l.bidTo)) !== JSON.stringify(rows)) { l.bidTo = rows; ch = true; }   /* patch BIDTO: each GC, its status and when it was sent */
    if (rm && JSON.stringify(arr(l.bidToRemoved)) !== JSON.stringify(rm)) { l.bidToRemoved = rm; ch = true; }
    return ch ? undefined : false;
  });
}""")

# 6. the lead side panel: every GC with its details, a checkbox each, sent time
rep("""function sectionHtml(l){
  var key = 'lead:' + l.id, list = listFor(key), chg = changesFor(l.id);
  return '<h4>🏢 Bidding to (' + list.length + ')' + (chg.length ? ' <span class="gcbs-chg">Bid change</span>' : '') + '</h4>'
    + (list.length ? list.map(function(b){ var n = repliesFor(l.id, b.id).filter(openChange).length; return '<div class="kv">' + stChip(b.status) + ' <b>' + esc(s(b.company) || '—') + '</b>' + (s(b.contact) ? ' · ' + esc(b.contact) : '') + (s(b.due) ? ' · due ' + esc(fmtDue(b.due)) : '') + (n ? ' <span class="gcbs-chg">Bid change</span>' : '') + '</div>'; }).join('') : '<div class="note">No GC yet.</div>')""",
"""/* patch BIDTO: which GCs 📤 Send bid goes to (the side panel's checkboxes; default: every GC not sent yet that has an e-mail) */
var PICK = {};
function pickedOn(lid, b){ var p = PICK[lid] || {}; return EMAIL_RE.test(s(b.email)) && (p[b.id] != null ? !!p[b.id] : b.status === 'not sent'); }
function picked(lid){ return listFor('lead:' + lid).filter(function(b){ return pickedOn(lid, b); }).map(function(b){ return b.id; }); }
function whenTxt(v){ v = s(v); if (!v) return ''; var d = new Date(v); return isFinite(d) ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : v.slice(0, 16).replace('T', ' '); }
function btCss(){ if (D.getElementById('gcbt-css')) return; var st = D.createElement('style'); st.id = 'gcbt-css'; st.textContent = '.gcbt-row{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;padding:6px 0;border-bottom:1px solid #eee;font-size:13px}.gcbt-row label{display:flex;align-items:center;gap:6px;cursor:pointer;min-height:32px}.gcbt-row input[type=checkbox]{width:18px;height:18px}.gcbt-row .d{color:#555;font-size:12px;overflow-wrap:anywhere}.gcbt-row .ok{color:#166534;font-weight:700;font-size:12px}.gcbt-row .no{color:#b45309;font-size:12px}'; D.head.appendChild(st); }
function sectionHtml(l){
  try { css(); btCss(); } catch (e) {}
  var key = 'lead:' + l.id, list = listFor(key), chg = changesFor(l.id), nSent = list.filter(function(b){ return b.status !== 'not sent'; }).length, nPick = list.filter(function(b){ return pickedOn(l.id, b); }).length;
  return '<h4>🏢 Bidding to (' + list.length + ' GC' + (list.length === 1 ? '' : 's') + ')' + (nSent ? ' · ' + nSent + ' sent' : '') + (chg.length ? ' <span class="gcbs-chg">Bid change</span>' : '') + '</h4>'
    + (list.length ? list.map(function(b){ var n = repliesFor(l.id, b.id).filter(openChange).length, ok = EMAIL_RE.test(s(b.email));
      return '<div class="kv gcbt-row" data-gcbt="' + esc(b.id) + '"><label><input type="checkbox" data-gcbt-pick="' + esc(b.id) + '"' + (pickedOn(l.id, b) ? ' checked' : '') + (ok ? '' : ' disabled') + ' aria-label="Send the bid to ' + esc(s(b.company) || 'this GC') + '"> ' + stChip(b.status) + ' <b>' + esc(s(b.company) || '—') + '</b></label>'
        + '<span class="d">' + esc([s(b.contact), s(b.email), s(b.phone)].filter(Boolean).join(' · ')) + (s(b.due) ? ' · due ' + esc(fmtDue(b.due)) : '') + (s(b.source) && s(b.source) !== s(l.source) ? ' · via ' + esc(b.source) : '') + '</span>'
        + (b.sentAt ? '<span class="ok">✓ sent to ' + esc(s(b.company) || s(b.email)) + ' ' + esc(whenTxt(b.sentAt)) + (b.sentBy ? ' by ' + esc(b.sentBy) : '') + '</span>' : '')
        + (ok ? '' : '<span class="no">no e-mail yet — ✏️ add it</span>') + (n ? ' <span class="gcbs-chg">Bid change</span>' : '') + '</div>'; }).join('') : '<div class="note">No GC yet.</div>')""")
rep("""    + '<div class="row"><button type="button" class="b" data-gcbs-list>✏️ Bidding to</button><button type="button" class="b gold" data-gcbs-send>📤 Send bid</button>' + (chg.length ? '<button type="button" class="b red" data-gcbs-list>Review bid change</button>' : '') + '</div>';""",
"""    + '<div class="row"><button type="button" class="b" data-gcbs-list>✏️ Edit / ＋ add GC</button><button type="button" class="b gold" data-gcbs-send>📤 Send bid' + (list.length > 1 ? ' to ' + nPick + ' checked' : '') + '</button>' + (chg.length ? '<button type="button" class="b red" data-gcbs-list>Review bid change</button>' : '') + '</div>';""")
rep("""if (t.hasAttribute('data-gcbs-send')) openSend('lead:' + lid);""",
"""if (t.hasAttribute('data-gcbs-send')) { var ids = picked(lid); openSend('lead:' + lid, ids.length ? { ids: ids } : {}); }""")
rep("""function paintDrawer(){
  var dr = D.getElementById('gcl-drawer'); if (!dr) return;""",
"""D.addEventListener('change', function(ev){   /* patch BIDTO: the side panel's checkboxes */
  var t = ev.target; if (!t || !t.getAttribute || !t.hasAttribute('data-gcbt-pick')) return;
  var sec = t.closest && t.closest('section[data-gcbs]'); var lid = sec && sec.getAttribute('data-lead'); if (!lid) return;
  (PICK[lid] = PICK[lid] || {})[t.getAttribute('data-gcbt-pick')] = !!t.checked; sec.__h = ''; try { paintDrawer(); } catch (e) { warn(e); }
}, true);
function paintDrawer(){
  var dr = D.getElementById('gcl-drawer'); if (!dr) return;""")

# 7. the Send bid dialog: sent time per GC; Gmail instead = one compose per GC
rep("""'> <b>' + esc(s(b.company) || 'GC') + '</b></label> ' + stChip(b.status)""",
"""'> <b>' + esc(s(b.company) || 'GC') + '</b></label> ' + stChip(b.status) + (b.sentAt ? '<span class="note" style="color:#166534;font-weight:700">✓ sent ' + esc(whenTxt(b.sentAt)) + (b.sentBy ? ' by ' + esc(b.sentBy) : '') + '</span>' : '')""")
rep("""      + '<div class="row"><span style="flex:1"></span>' + (needAppr ?""",
"""      + (list.filter(function(b){ return EMAIL_RE.test(s(b.email)); }).length > 1 ? '<div class="row" data-gcbt-gm><span class="note">Or open in Gmail instead — one compose per GC (never one e-mail to all):</span>' + list.filter(function(b){ return EMAIL_RE.test(s(b.email)); }).map(function(b){ return '<button type="button" class="b" data-gm="' + esc(b.id) + '">✉️ ' + esc(s(b.company) || b.email) + '</button>'; }).join('') + '</div>' : '')   /* patch BIDTO */
      + '<div class="row"><span style="flex:1"></span>' + (needAppr ?""")

# 8. tests
rep("""  replies: function(leadId){ return repliesFor(leadId); }, people: bidsPeople,""",
"""  replies: function(leadId){ return repliesFor(leadId); }, people: bidsPeople, picked: picked, pick: function(lid, id, on){ (PICK[lid] = PICK[lid] || {})[id] = !!on; }, sameGc: sameGc, gcKey: gcKey,   /* patch BIDTO */""")

open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
