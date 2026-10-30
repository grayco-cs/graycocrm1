#!/usr/bin/env python3
"""patch LEADFIX -- a Lead Inbox item updates only its own lead.

Root cause (r14d and earlier): importItems() built an index map (lead id / 'in:'+inboxId -> list position) and a
by-name map, then called list.unshift(newLead) INSIDE the same loop.  Every unshift moved every lead one slot down,
the maps were not updated, so each later item in that pass resolved to the lead one slot above its own lead and
fromItem() wrote that item's bid fields (gc, owner, city, trades, scope, plans, docs, e-mails, due-to, inboxId ...)
onto a CompanyCam / QuickBooks / other inbox lead (its id and name stayed).  Once two leads shared an inboxId the
'in:' map kept feeding the wrong one.

Part 1 (LEADFIX-1, the minimal fix):
  * new leads are collected and put on top AFTER the loop (no index moves mid-loop);
  * an item resolves to the lead whose id is leadIdOf(it); otherwise to the ONE lead holding its inboxId, and only
    when that lead is not another item's LEADIN-* lead and not from another source (CompanyCam, QuickBooks, website,
    text, RoofScout, merged); two or more holders (or a foreign one) -> nothing is updated and it is flagged
    (window._gcLeadInboxClash, console, one admin toast);
  * the by-name link only re-attaches an older Lead Inbox import that lost its link -- never a lead from another
    source or one typed by hand;
  * fromItem() itself refuses to write an item onto a lead that is not that item's lead (belt and braces).

Idempotent: run again -> 'already patched'.  Every anchor must be found exactly once.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
orig = src
MARK1 = '/* patch LEADFIX-1 */'


def rep(s, old, new, n=1):
    c = s.count(old)
    assert c == n, ('anchor count %d != %d' % (c, n), old[:90])
    return s.replace(old, new)


if MARK1 in src:
    print('LEADFIX-1 already patched')
else:
    # the Lead Inbox import module: everything below is between its leadIdOf() and its normName()
    A0 = "function leadIdOf(it){ return 'LEADIN-' + s(it.id).replace(/^LI-/, ''); }\n"
    A1 = "/* ── what the inbox shows ──────────────────────────────────────────────────── */\nfunction normName(t){"
    assert src.count(A0) == 1 and src.count(A1) == 1, 'module anchors'
    a, b = src.index(A0), src.index(A1)
    assert a < b
    seg = src[a:b]

    # 1. helpers, before importItems()
    seg = rep(seg, "function importItems(healing){\n", MARK1 + r''' /* an inbox item updates only its own lead */
var LF_FOREIGN_ID = /^(LQB_|LCC_|LCCR_|LGN_|LEADmsg|PRJcc_|LEAD_RS_)/;
function lfForeign(l){   /* a lead that came from somewhere else: never gets bid fields from an inbox item */
  if (!l) return true;
  if (LF_FOREIGN_ID.test(s(l.id))) return true;
  if (l.ccamId || l.ccProjectId || l._ccAuto || l._ccServer || l._ccImported || l.qbId || l.qbCustomerId || l.rsLeadId || l.websiteLead || l.textMessage || l._mergedFrom) return true;
  return /companycam|quickbooks|roofscout|grayco photos|website|text message/i.test(s(l.source));
}
function lfNameOk(l){ return !!l && !lfForeign(l) && (/^LEADIN-/.test(s(l.id)) || /^lead inbox/i.test(s(l.createdBy))); }   /* by name: only an older inbox import that lost its link */
function lfHolderOk(l, it){ return !!l && s(l.inboxId) === s(it.id) && (s(l.inboxLinked) === s(it.id) || (!/^LEADIN-/.test(s(l.id)) && !lfForeign(l))); }
function lfMine(l, it){ return !!l && (s(l.id) === leadIdOf(it) || lfHolderOk(l, it)); }
/* the list position of the item's own lead: its LEADIN id first; else the ONE acceptable lead holding its inbox id;
   null = none (a new lead); false = held by a lead that is not its own, or by two or more -> update nothing, flag it */
function lfWho(it, lid, at, holders, list, clash){
  var o = at[lid], h = (holders[it.id] || []).filter(function(k){ return k !== o; });
  var ids = function(){ return h.map(function(k){ return s(list[k] && list[k].id); }); };
  if (o != null) { if (h.length) clash.push({ id: it.id, owner: lid, also: ids() }); return o; }
  if (!h.length) return null;
  if (h.length === 1 && lfHolderOk(list[h[0]], it)) return h[0];
  clash.push({ id: it.id, owner: '', also: ids() }); return false;
}
var LF_CLASH = [], LF_TOLD = '';
function lfReport(){
  try { window._gcLeadInboxClash = LF_CLASH.slice(); } catch (e) {}
  if (!LF_CLASH.length) return;
  var sig = LF_CLASH.map(function(c){ return c.id + '>' + c.also.join(','); }).join('|'); if (sig === LF_TOLD) return; LF_TOLD = sig;
  try { console.warn('[LEADFIX] ' + LF_CLASH.length + ' Lead Inbox item(s) sit on a lead that is not theirs - those leads were NOT updated:', LF_CLASH); } catch (e) {}
  if (isAdmin()) toast('⚠ ' + LF_CLASH.length + ' Lead Inbox item' + (LF_CLASH.length === 1 ? ' is' : 's are') + ' on a lead that is not theirs — left alone. Admin: _gcLeadFixRepair({dryRun:true}) in the console', true);
}
function importItems(healing){
''')
    # 2. who holds each inbox id (a list, not one slot), a list for the new leads
    seg = rep(seg, "    var at = {}; list.forEach(function(l, i){ if (l && l.id) at[l.id] = i; if (l && l.inboxId) at['in:' + l.inboxId] = i; });\n",
              "    var at = {}, holders = {}, fresh = [], clash = [];   /* patch LEADFIX-1: every holder of an inbox id; new leads go on top after the loop */\n"
              "    list.forEach(function(l, i){ if (l && l.id) at[l.id] = i; if (l && l.inboxId) (holders[l.inboxId] = holders[l.inboxId] || []).push(i); });\n")
    # 3. by name: only an older inbox import that lost its link
    seg = rep(seg, "if (l && !l.inboxId && !isRs(l) && l.name) { var k = normName(l.name);",
              "if (l && !l.inboxId && !isRs(l) && l.name && lfNameOk(l)) { var k = normName(l.name);")
    # 4. which lead is the item's own
    seg = rep(seg, "      var lid = leadIdOf(it), i = at[lid] != null ? at[lid] : at['in:' + it.id];\n",
              "      var lid = leadIdOf(it), i = lfWho(it, lid, at, holders, list, clash); if (i === false) return;   /* patch LEADFIX-1 */\n")
    seg = rep(seg, "list[j].inboxState = ex.pm ? 'assigned' : 'new'; at['in:' + it.id] = j;",
              "list[j].inboxState = ex.pm ? 'assigned' : 'new'; list[j].inboxLinked = it.id; holders[it.id] = [j];")
    # 5. never unshift inside the loop
    seg = rep(seg, "        list.unshift(l); changed = true; at[lid] = -1; return;\n",
              "        fresh.push(l); changed = true; at[lid] = -1; return;   /* patch LEADFIX-1: no list.unshift() here -- it moved every lead one slot and the positions above then named the wrong lead */\n")
    seg = rep(seg, "      var cur = list[i];\n      if ((it.rev || 1) > (cur.inboxRev || 0)) {",
              "      var cur = list[i]; if (!lfMine(cur, it)) return;   /* patch LEADFIX-1 */\n      if ((it.rev || 1) > (cur.inboxRev || 0)) {")
    seg = rep(seg, "    return changed ? list : null;\n  }).then(function(){\n",
              "    LF_CLASH = clash; return changed ? fresh.reverse().concat(list) : null;   /* patch LEADFIX-1: the new leads on top, newest first (as before) */\n  }).then(function(){\n    lfReport();\n")
    # 6. fromItem refuses a lead that is not the item's own
    seg = rep(seg, "function fromItem(it, prev){\n  var l = Object.assign({}, prev || {});\n",
              "function fromItem(it, prev){\n  if (prev && !lfMine(prev, it) && !(!prev.inboxId && lfNameOk(prev))) return prev;   /* patch LEADFIX-1 */\n  var l = Object.assign({}, prev || {});\n")
    src = src[:a] + seg + src[b:]
    print('LEADFIX-1 patched')

MARK1B = '/* patch LEADFIX-1b */'
if MARK1B in src:
    print('LEADFIX-1b already patched')
else:
    # every lookup by inbox id prefers the item's own lead (LEADIN-<hash>); a lead whose inboxId is not its own never
    # speaks for that inbox item (assign / dismiss / merge / job / publish / due date / on-call / auto-lost)
    src = rep(src, "function lfMine(l, it){ return !!l && (s(l.id) === leadIdOf(it) || lfHolderOk(l, it)); }\n",
              "function lfMine(l, it){ return !!l && (s(l.id) === leadIdOf(it) || lfHolderOk(l, it)); }\n" + MARK1B + r''' /* the inbox id a lead may speak for: its own (LEADIN-<hash>), or a re-linked older import's; '' for any other */
function lfOwnIb(l){ var ib = s(l && l.inboxId); if (!ib) return ''; if (s(l.id) === 'LEADIN-' + ib.replace(/^LI-/, '')) return ib; return (/^LEADIN-/.test(s(l.id)) || lfForeign(l)) ? '' : ib; }
/* the lead for a key (a lead id or an inbox id): that id; else the item's own LEADIN lead; else the ONE lead that may speak for it */
function lfByInbox(list, key){
  key = s(key); if (!key) return null; list = arr(list);
  var own = /^LI-/.test(key) ? 'LEADIN-' + key.replace(/^LI-/, '') : '', hit = null, n = 0;
  for (var i = 0; i < list.length; i++) { var l = list[i]; if (l && (l.id === key || (own && l.id === own))) return l; }
  list.forEach(function(l){ if (l && s(l.inboxId) === key && lfOwnIb(l) === key) { hit = l; n++; } });
  return n === 1 ? hit : null;
}
try { window._gcOwnInboxId = lfOwnIb; window._gcLeadByInbox = lfByInbox; } catch (e) {}
''')
    # the Lead Inbox module's own actions
    src = rep(src, "  return leads().find(function(l){ return l && (l.id === id || l.inboxId === id || (l.rsLeadId && 'RS:' + l.rsLeadId === id)); }) || null;\n",
              "  return lfByInbox(leads(), id) || leads().find(function(l){ return l && l.rsLeadId && 'RS:' + l.rsLeadId === id; }) || null;   /* patch LEADFIX-1b */\n")
    src = rep(src, "    if (lead.inboxId) act({ id: lead.inboxId, op: 'assigned',", "    if (lfOwnIb(lead)) act({ id: lead.inboxId, op: 'assigned',")
    src = rep(src, "    if (l.inboxId) act({ id: l.inboxId, op: 'dismissed', reason: reason });", "    if (lfOwnIb(l)) act({ id: l.inboxId, op: 'dismissed', reason: reason });")
    src = rep(src, "    S.items.forEach(function(x){ if (x && x.id === l.inboxId) x.status = 'dismissed'; });", "    S.items.forEach(function(x){ if (x && lfOwnIb(l) && x.id === l.inboxId) x.status = 'dismissed'; });")
    src = rep(src, "    if (a.inboxId && b.inboxId) act({ id: a.inboxId, op: 'merged', into: b.inboxId });\n    else if (a.inboxId) act(",
              "    if (lfOwnIb(a) && lfOwnIb(b)) act({ id: a.inboxId, op: 'merged', into: b.inboxId });\n    else if (lfOwnIb(a)) act(")
    src = rep(src, ".then(function(n){ if (lead.inboxId) act({ id: lead.inboxId, op: 'job', pid: pid });", ".then(function(n){ if (lfOwnIb(lead)) act({ id: lead.inboxId, op: 'job', pid: pid });")
    src = rep(src, "  var l = findLead(id); if (!l || !l.inboxId) return Promise.reject(new Error('Only a lead from the Lead Inbox can go to the bid portal.'));",
              "  var l = findLead(id); if (!l || !lfOwnIb(l)) return Promise.reject(new Error('Only a lead from the Lead Inbox can go to the bid portal.'));")
    src = rep(src, "            if (!l || !l.inboxId || !ids[l.inboxId] || ", "            if (!l || !l.inboxId || !ids[l.inboxId] || lfOwnIb(l) !== l.inboxId || ")
    # other modules (they reach the helpers through window)
    OWN = "(typeof W._gcOwnInboxId === 'function' ? W._gcOwnInboxId(l) : s(l.inboxId))"
    src = rep(src, "was = s(l.bidDue); inboxId = s(l.inboxId);", "was = s(l.bidDue); inboxId = s(" + OWN + ");   /* patch LEADFIX-1b */")
    src = rep(src, "if (l && (l.id === p.leadKey || l.inboxId === p.leadKey) && ",
              "if (l && (l.id === p.leadKey || (l.inboxId === p.leadKey && (typeof W._gcLeadByInbox === 'function' ? W._gcLeadByInbox(prev, p.leadKey) === l : true))) && ")
    src = rep(src, "  if (l && l.inboxId) body.id = l.inboxId;", "  if (l && " + OWN + ") body.id = l.inboxId;   /* patch LEADFIX-1b */")
    src = rep(src, "    if (l.inboxId) body.id = l.inboxId; else body.lead", "    if (" + OWN + ") body.id = l.inboxId; else body.lead")
    src = rep(src, "  fn('bid-inbox?act=1', { op: 'assigned', id: l.inboxId,", "  if (" + OWN + ") fn('bid-inbox?act=1', { op: 'assigned', id: l.inboxId,")
    PICK = ("(function(L, k){ var B = W._gcLeadByInbox; var hit = typeof B === 'function' ? B(L, k) : null; if (hit) return [hit]; "
            "return L.filter(function(x){ return x && ('crm:' + x.id === k || x.id === k || x.id === 'LEADIN-' + String(k || '').replace(/^LI-/, '')); }); })")   # patch LEADFIX-1b
    src = rep(src, "var l = arr((W._crm || {}).leads).filter(function(x){ return x && (x.inboxId === lid || 'crm:' + x.id === lid); })[0];",
              "var l = " + PICK + "(arr((W._crm || {}).leads), lid)[0];   /* patch LEADFIX-1b: the item's own lead, never another lead holding its inbox id */")
    src = rep(src, "var l = arr((W._crm || {}).leads).filter(function(x){ return x && (x.inboxId === id || 'crm:' + x.id === id || x.id === id); })[0];",
              "var l = " + PICK + "(arr((W._crm || {}).leads), /^crm:/.test(id) ? id.slice(4) : id)[0];   /* patch LEADFIX-1b */")
    # the hold rule (index.html copy of _lib/lead-hold.js, word for word: the same line in both)
    HOLD_OLD = "  arr(crmLeads).forEach(function(l){ if (l && l.inboxId) byInbox[l.inboxId] = l; });\n"
    HOLD_NEW = "  arr(crmLeads).forEach(function(l){ if (l && l.inboxId && (!byInbox[l.inboxId] || s(l.id) === 'LEADIN-' + s(l.inboxId).replace(/^LI-/, ''))) byInbox[l.inboxId] = l; });   /* patch LEADFIX-1b: the item's own lead wins */\n"
    src = rep(src, HOLD_OLD, HOLD_NEW)
    print('LEADFIX-1b patched')

if src != orig:
    open(path, 'w', encoding='utf-8').write(src)

# the server copy of the hold rule (netlify/functions/_lib/lead-hold.js) -- the same line as in index.html
import os
lh = os.path.join(os.path.dirname(os.path.abspath(path)), 'netlify', 'functions', '_lib', 'lead-hold.js')
if os.path.exists(lh):
    t = open(lh, encoding='utf-8').read()
    if 'patch LEADFIX-1b' in t:
        print('lead-hold.js already patched')
    else:
        t = rep(t, "  arr(crmLeads).forEach(function(l){ if (l && l.inboxId) byInbox[l.inboxId] = l; });\n",
                "  arr(crmLeads).forEach(function(l){ if (l && l.inboxId && (!byInbox[l.inboxId] || s(l.id) === 'LEADIN-' + s(l.inboxId).replace(/^LI-/, ''))) byInbox[l.inboxId] = l; });   /* patch LEADFIX-1b: the item's own lead wins */\n")
        open(lh, 'w', encoding='utf-8').write(t)
        print('lead-hold.js patched')
