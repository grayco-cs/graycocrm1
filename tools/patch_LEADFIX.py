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

MARK2 = '/* patch LEADFIX-2 */'
if MARK2 in src:
    print('LEADFIX-2 already patched')
else:
    A2 = "try { window._gcOwnInboxId = lfOwnIb; window._gcLeadByInbox = lfByInbox; } catch (e) {}\n"
    src = rep(src, A2, A2 + MARK2 + r''' /* the repair of leads that got another lead's inbox item (admin console; a dry run unless told otherwise) */
/* LEADFIX-PLAN-BEGIN (pure: leads in, the plan out; tools/leadfix_repair_offline.mjs runs this same code on the mirrors) */
var LFP_BID = ['gc', 'owner', 'city', 'state', 'trades', 'scope', 'plansLinks', 'docs', 'rawEmailRef', 'emails', 'sources', 'alsoOn', 'inboxFlag', 'inboxFlagNew', 'addendumCount', 'matchNotes', 'needsReview', 'origin',
  'inboxId', 'inboxRev', 'inboxAt', 'inboxLinked', 'inboxState', 'source', 'leadKind', 'bidRole', 'bidRoleWhy', 'bidDue', 'bidDueWas', 'preBid', 'bidNumber', 'dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone',
  'submitMethod', 'submitWhere', 'dueSnippet', 'estimator', 'estimatorEmail', 'bidPortalJob', 'hold'];
var LFP_CONTACT = ['phone', 'email', 'address', 'contactName'];
var LFP_ASSIGN = ['pm', 'pmEmail', 'assignedBy', 'assignedAt', 'autoAssignedAt'];
var LFP_SKIP = { updatedAt: 1, savedAt: 1, _v: 1, _rev: 1 };
var LFP_WATCH = { stage: 1, archived: 1, archivedAt: 1, archivedWhy: 1, mergedInto: 1, mergedFrom: 1, dismissed: 1, status: 1, subPortal: 1, bidStatus: 1, lostReason: 1 };
function lfpJ(v){ return v === undefined ? '' : JSON.stringify(v); }
function lfpEmpty(v){ return v == null || v === '' || v === false || v === 0 || (Array.isArray(v) && !v.length); }
var LFP_GENERIC = { inboxId: 1, inboxRev: 1, source: 1, leadKind: 1, inboxState: 1, origin: 1, sources: 1, submitMethod: 1, submitWhere: 1, estimator: 1, estimatorEmail: 1, hold: 1, needsReview: 1, inboxFlag: 1, inboxFlagNew: 1, addendumCount: 1, alsoOn: 1, bidRole: 1, bidRoleWhy: 1 };   /* the same on many bids: not proof it is the other item's */
var LFP_PERSON = { estimator: 1, estimatorEmail: 1, hold: 1, bidDue: 1, bidRole: 1, bidRoleWhy: 1 };   /* on an inbox lead a person may have set these since */
function lfpSame(a, b){ return (lfpEmpty(a) && lfpEmpty(b)) || lfpJ(a) === lfpJ(b); }
function lfpDefSource(id){ id = String(id || ''); return /^LQB_/.test(id) ? 'QuickBooks' : /^(LCC_|LCCR_|LEADmsg|PRJcc_)/.test(id) ? 'CompanyCam' : ''; }
/* opts: { base: { leadId: its last clean copy }, first: { leadId: its oldest clean copy }, baseFrom: { leadId: 'where' }, now: ms } */
function lfPlan(list, opts){
  opts = opts || {}; list = (Array.isArray(list) ? list : []).filter(function(l){ return l && l.id; });
  var base = opts.base || {}, first = opts.first || {}, from = opts.baseFrom || {}, now = typeof opts.now === 'number' ? opts.now : Date.now();
  var byId = {}, holders = {}; list.forEach(function(l){ byId[l.id] = l; if (l.inboxId) (holders[l.inboxId] = holders[l.inboxId] || []).push(l); });
  var rows = [], assigns = [], merges = [], victimIds = {}, shared = {};
  Object.keys(holders).forEach(function(ib){
    var ownId = 'LEADIN-' + String(ib).replace(/^LI-/, ''), own = byId[ownId] || null;
    var bad = holders[ib].filter(function(l){ return l.id !== ownId && (own || lfOwnIb(l) !== ib); });
    if (!bad.length) return;
    shared[ib] = 1;
    bad.forEach(function(v){
      victimIds[v.id] = 1;
      var src = own || {}, b = base[v.id] || null, f0 = first[v.id] || null, kind = /^LEADIN-/.test(v.id) ? 'inbox lead' : (lfForeign(v) ? 'other source' : 'typed in / other'), cust = kind !== 'inbox lead';
      var after = JSON.parse(JSON.stringify(v)), ch = [], unsure = [];
      var set = function(f, val, why){ var was = v[f]; if (lfpSame(was, val)) return; if (val === undefined) delete after[f]; else after[f] = val; ch.push({ f: f, before: was, after: val, why: why || '' }); };
      var srcHas = function(f, val){ return !lfpEmpty(val) && (lfpSame(val, src[f]) || (f === 'phone' && lfpSame(val, src.dueToPhone)) || (f === 'email' && lfpSame(val, src.dueToEmail)) || (f === 'contactName' && lfpSame(val, src.dueToContact))); };
      if (b) {
        LFP_BID.forEach(function(f){
          if (f === 'docs') { var mine = (Array.isArray(v.docs) ? v.docs : []).filter(function(d){ return d && d.addedBy; }), bd = Array.isArray(b.docs) ? b.docs : [];
            var keep = bd.concat(mine.filter(function(d){ return !bd.some(function(x){ return x && x.ref === d.ref; }); })); set('docs', keep.length ? keep : (b.docs === undefined ? undefined : keep), 'clean copy (+ files a person added)'); return; }
          if (!cust && LFP_PERSON[f] && !lfpSame(v[f], b[f]) && !lfpEmpty(v[f]) && !srcHas(f, v[f])) { unsure.push(f + ' changed since the clean copy and is not the other item\'s — kept'); return; }
          set(f, b[f], 'clean copy');
        });
        LFP_CONTACT.forEach(function(f){
          if (lfpSame(v[f], b[f])) return;
          if (lfpEmpty(b[f]) && srcHas(f, v[f])) set(f, b[f], 'was empty; the bid contact\'s was filled in');
          else if (lfpEmpty(b[f]) && !lfpEmpty(v[f])) unsure.push(f + ' filled in after the clean copy (not the bid contact\'s) — kept');
          else if (srcHas(f, v[f])) set(f, b[f], 'clean copy');
          else unsure.push(f + ' changed since the clean copy — kept');
        });
        LFP_ASSIGN.forEach(function(f){
          if (lfpSame(v[f], b[f])) return;
          if (/^(auto|lead inbox)/i.test(String(v.assignedBy || ''))) set(f, b[f], 'set by the inbox / the hold run'); else unsure.push(f + ' changed since the clean copy (' + String(v.assignedBy || 'by a person') + ') — kept');
        });
        if (cust) {
          var st = f0 ? f0.stage : b.stage;
          if (!lfpSame(v.stage, st)) set('stage', st, 'stage in the oldest clean copy');
          if (f0 && !lfpSame(f0.stage, b.stage)) unsure.push('stage was "' + (f0.stage || '') + '" in the oldest clean copy and "' + (b.stage || '') + '" in the last one');
        }
        Object.keys(v).concat(Object.keys(b)).forEach(function(f, i, all){
          if (all.indexOf(f) !== i || LFP_SKIP[f] || LFP_BID.indexOf(f) >= 0 || LFP_CONTACT.indexOf(f) >= 0 || LFP_ASSIGN.indexOf(f) >= 0 || (f === 'stage' && cust)) return;
          if (!lfpSame(v[f], b[f]) && LFP_WATCH[f]) unsure.push(f + ' changed since the clean copy: ' + lfpJ(b[f]).slice(0, 60) + ' → ' + lfpJ(v[f]).slice(0, 60) + ' — kept');
        });
      } else if (!cust) {
        set('inboxId', 'LI-' + v.id.replace(/^LEADIN-/, ''), 'its own inbox item'); set('inboxRev', 0, 'the next pull re-reads its own item');
        LFP_BID.concat(LFP_CONTACT).forEach(function(f){ if (LFP_GENERIC[f]) return; if (srcHas(f, v[f])) set(f, undefined, 'the other item\'s value'); });
        unsure.push('no clean copy in any mirror: its own item refills it on the next pull only if that item is still open on the server');
      } else {
        LFP_BID.forEach(function(f){
          if (f === 'docs') { var mine2 = (Array.isArray(v.docs) ? v.docs : []).filter(function(d){ return d && d.addedBy; }); set('docs', mine2.length ? mine2 : undefined, 'bid files removed'); return; }
          if (f === 'city' || f === 'state') { if (srcHas(f, v[f])) set(f, undefined, 'the bid\'s'); return; }
          if (f === 'source') { if (lfpEmpty(v.source) || srcHas('source', v.source) || /lead inbox/i.test(String(v.source))) { var d = lfpDefSource(v.id); set('source', d || undefined, 'from its id'); if (!d) unsure.push('source unknown'); } return; }
          set(f, undefined, 'bid field');
        });
        LFP_CONTACT.forEach(function(f){ if (srcHas(f, v[f])) set(f, undefined, 'the bid contact\'s'); });
        unsure.push('no clean copy in any mirror: bid fields blanked, its own values unknown');
      }
      if (!own) unsure.push('the inbox item\'s own lead ' + ownId + ' is not on the list');
      if (v.mergedInto && v.mergedInto === v.id) unsure.push('archived as merged into ITSELF (' + String(v.archivedAt || '').slice(0, 10) + ') — hidden from the lists; probably should be un-archived');
      else if (v.mergedInto || v.archived) unsure.push('archived / merged into ' + String(v.mergedInto || '?') + ' — maybe because of the shared inbox id');
      rows.push({ id: v.id, name: String(v.name || ''), kind: kind, inboxId: ib, ownId: ownId, baseFrom: b ? (from[v.id] || 'given') : '', updatedAt: v.updatedAt || '', changes: ch, unsure: unsure, after: after });
    });
  });
  /* who was assigned in the last 24 h on a lead that shares an inbox id (the item's own lead too) */
  list.forEach(function(l){
    if (!l.inboxId || !shared[l.inboxId]) return;
    var t = Date.parse(l.assignedAt || '') || 0; if (!t || now - t > 864e5) return;
    assigns.push({ id: l.id, name: String(l.name || ''), inboxId: l.inboxId, own: l.id === 'LEADIN-' + String(l.inboxId).replace(/^LI-/, ''), pm: l.pm || '', estimator: l.estimator || '', estimatorEmail: l.estimatorEmail || '', assignedBy: l.assignedBy || '', assignedAt: l.assignedAt });
  });
  /* merges that involve a contaminated lead (the duplicates screen groups leads by their inbox id) */
  list.forEach(function(l){
    if (!l.mergedInto && !(Array.isArray(l.mergedFrom) && l.mergedFrom.length)) return;   /* (the QuickBooks / CompanyCam importer's own _mergedFrom is not a duplicates-screen merge) */
    var with_ = [].concat(l.mergedInto ? [l.mergedInto] : [], Array.isArray(l.mergedFrom) ? l.mergedFrom : []).filter(function(x, i, a){ return x && a.indexOf(x) === i; });
    if (!victimIds[l.id] && !with_.some(function(x){ return victimIds[x]; }) && !(l.inboxId && shared[l.inboxId])) return;
    merges.push({ id: l.id, name: String(l.name || ''), mergedInto: l.mergedInto || '', mergedWith: with_.filter(function(x){ return x && x !== l.mergedInto; }), archivedAt: l.archivedAt || '' });
  });
  return { rows: rows, assigns: assigns, merges: merges, leads: list.length };
}
/* LEADFIX-PLAN-END */
window._gcLeadFixRepair = function(o){
  o = o || {}; var dry = o.dryRun !== false;
  var plan = lfPlan(leads(), { base: o.base, first: o.first, baseFrom: o.baseFrom });
  try {
    console.log('[LEADFIX] ' + plan.rows.length + ' lead(s) carry another lead\'s inbox item' + (dry ? ' (dry run — nothing changed)' : ''));
    console.table(plan.rows.map(function(r){ return { lead: r.id, name: r.name.slice(0, 30), kind: r.kind, inbox: r.inboxId, 'its own lead': r.ownId, 'clean copy': r.baseFrom || '(none)', changes: r.changes.map(function(c){ return c.f; }).join(' '), 'owner to check': r.unsure.join(' | ') }; }));
    if (plan.assigns.length) { console.log('[LEADFIX] assigned in the last 24 h on a lead that shares an inbox id (owner to check):'); console.table(plan.assigns); }
    if (plan.merges.length) { console.log('[LEADFIX] merges that involve these leads (owner to check):'); console.table(plan.merges); }
  } catch (e) {}
  if (dry) return Promise.resolve(plan);
  if (!isAdmin()) return Promise.reject(new Error('admins only'));
  var want = 'REPAIR ' + plan.rows.length; if (o.confirm !== want) return Promise.reject(new Error('to change the leads, call _gcLeadFixRepair({ dryRun: false, confirm: "' + want + '" })'));
  var by = myName(), at = nowIso(), done = [];
  return setLeads(function(list){
    var ch = false; done = [];
    var rowOf = {}; plan.rows.forEach(function(r){ rowOf[r.id] = r; });
    list.forEach(function(l, i){
      var r = l && rowOf[l.id]; if (!r) return;
      if (String(l.updatedAt || '') !== String(r.updatedAt || '')) return;   /* changed since the plan: left alone (run the dry run again) */
      var x = JSON.parse(JSON.stringify(r.after)); x.updatedAt = x.savedAt = at;
      x.activity = arr(x.activity).concat([{ type: 'repair', text: '🧹 Repaired: removed the bid details of ' + r.inboxId + ' (they belong to ' + r.ownId + ') — ' + r.changes.map(function(c){ return c.f; }).join(', '), at: at, by: by }]).slice(-200);
      list[i] = x; ch = true; done.push(r.id);
    });
    return ch ? list : null;
  }).then(function(){ plan.repaired = done.slice(); return plan; });
};
''')
    print('LEADFIX-2 patched')

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
