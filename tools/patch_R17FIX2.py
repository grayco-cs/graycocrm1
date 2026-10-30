#!/usr/bin/env python3
"""Idempotent patch R17FIX2: every reader off the Leads screen sees the real lead list again, and the Leads screen keeps
the leads that are on the list (only a lead whose OWN id is deleted is hidden).

A) LEADFLAP stopped every writer that handed window._crm.leads an old copy, so on r17 window._crm.leads was never set:
   off the Leads screen the hub kit, the Office tab, Estimating counts, the Estimate Builder's "make a lead" and others
   read 0 leads (and a few wrote the lead list from that empty read).  Now window._crm.leads is a READ-ONLY mirror of
   the app's own lead list (React's, set from its own effect whenever it changes, before and after any rebuild of
   window._crm); an assignment to it is ignored, so nothing can set the list from a copy through it.  The data safety
   net keeps skipping leads (as on r17 before this patch), and the Estimate Builder's new lead is added to the live list
   it saves instead of being assigned to window._crm.leads.
B) LEADBULK's hub dead() asked _gcLDEL.blocked, which is the "brought in again under another id" check meant for a lead
   being imported (LEADFLAP-2): it hid 38 of the 152 leads on the live data, among them leads people assigned after the
   matching delete.  dead() (and R17FIX1's Office filter) now ask _gcLDEL.blockedOwn: the lead's own id deleted (the
   CRM's delete list, or its rs-lead id).  Re-imports under a new id stay stopped by LEADFLAP-1's importer, and the delete guard's setter still runs
   the "brought in again" check on a lead ADDED to the list (one not on it before); leads already on it keep the own-id check.
Usage: python3 tools/patch_R17FIX2.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = 'patch R17FIX2'
if MARK in src:
    print('R17FIX2: already patched'); sys.exit(0)
EDITS = [
    # B1: the delete guard's own-id check, for a lead already on the list
    ("blocked: function(l){ return blocked(l, true); },   /* patch LEADFLAP-2 */",
     "blocked: function(l){ return blocked(l, true); },   /* patch LEADFLAP-2 */ blockedOwn: function(l){ return blocked(l); }, blockedOnList: function(l){ return blockedOnList(l); },   /* patch R17FIX2: a lead on the list: its own id deleted only; a lead new to the list: the full check */"),
    # B2: the Leads screen hides only a lead whose own id is deleted
    ("(!!W._gcLDEL && typeof W._gcLDEL.blocked === 'function' && (function(){ try { return !!W._gcLDEL.blocked(l); } catch (e) { return false; } })()); }   /* patch LEADBULK: + the delete guard's \"brought in again\" */",
     "(!!W._gcLDEL && typeof W._gcLDEL.blockedOnList === 'function' && (function(){ try { return !!W._gcLDEL.blockedOnList(l); } catch (e) { return false; } })()); }   /* patch LEADBULK: + the delete guard; patch R17FIX2: its own-id check for a lead on the list since this computer loaded it (LEADFLAP-2), the full check for one new to it */"),
    # B3: R17FIX1's Office filter, the same rule
    (" try { if (W._gcLDEL && typeof W._gcLDEL.blocked === 'function' && W._gcLDEL.blocked(l)) return true; } catch (e) {} return false; }",
     " try { if (W._gcLDEL && typeof W._gcLDEL.blockedOnList === 'function' && W._gcLDEL.blockedOnList(l)) return true; } catch (e) {} return false; }   /* patch R17FIX2: as the Leads screen */"),
    # A1: the data safety net leaves leads alone (it did on r17: window._crm.leads was never a list)
    ("if(k==='leads' && !Array.isArray(crm()[k])) return;   /* patch LEADFLAP-4b",
     "if(k==='leads') return;   /* patch R17FIX2: window._crm.leads is now a read-only mirror of the live list; the net still leaves leads alone. patch LEADFLAP-4b"),
    # A2: the Estimate Builder's new lead: added to the live list it saves (never through window._crm.leads)
    ("          if(window._crm) window._crm.leads=[lead].concat(leads());\n          if(window._gcApplySync) window._gcApplySync('leads', leads());\n          if(window._supaUpsert) window._supaUpsert('leads', leads());",
     "          var _gcAllL = leads().length ? [lead].concat(leads().filter(function(x){ return x && x.id !== lead.id; })) : null;   /* patch R17FIX2: the live list + the new lead (window._crm.leads is read-only); nothing saved from an empty read */\n          if(_gcAllL && window._gcApplySync) window._gcApplySync('leads', _gcAllL);\n          if(_gcAllL && window._supaUpsert) window._supaUpsert('leads', _gcAllL);"),
    # A3: window._crm.leads = the app's own list, read-only
    ("window.__gcCrmBox = function(o){\n  try{\n    var v = o.projects;",
     "window.__gcCrmBox = function(o){\n"
     "  try{   /* patch R17FIX2: window._crm.leads is a READ-ONLY mirror of the app's own lead list (React's, set by its effect); a write is ignored */\n"
     "    Object.defineProperty(o, 'leads', { configurable:true, enumerable:true, get: function(){ return Array.isArray(window.__gcLeadsLive) ? window.__gcLeadsLive : undefined; }, set: function(){ window.__gcLeadsMirrorWrites = (window.__gcLeadsMirrorWrites || 0) + 1; } });\n"
     "  }catch(e){}\n  try{\n    var v = o.projects;"),
    # A4: React's lead list, handed to the mirror whenever it changes
    ("ce.useEffect(()=>{ia.current&&ma(\"leads\",rr);try{window._gcLA&&window._gcLA.onLeads(rr)}catch(_la){}},[rr])",
     "ce.useEffect(()=>{try{if(Array.isArray(rr)&&(ia.current||rr.length))window.__gcLeadsLive=rr;}catch(_lv){}/* patch R17FIX2 */ia.current&&ma(\"leads\",rr);try{window._gcLA&&window._gcLA.onLeads(rr)}catch(_la){}},[rr])"),
    # B4: the delete guard's setter: a lead NEW to this computer's list (not on it since it loaded) still gets the
    #     "brought in again under another id" check (LEADBULK's protection); a lead already on it keeps the own-id check
    ("function guardList(arr){\n  if (!Array.isArray(arr)) return arr;\n  var any = false, out = arr.filter(function(l){ var b = blocked(l); if (b) any = true; return !b; });\n  return any ? out : arr;",
     "var KNOWN = null;   /* patch R17FIX2: the leads on this computer's list since it loaded; only a lead new to it gets the \"brought in again\" check */\n"
     "function guardList(arr, prev){\n  if (!Array.isArray(arr)) return arr;\n"
     "  if (!KNOWN) { var seed = Array.isArray(prev) && prev.length ? prev : (Array.isArray(W.__gcLeadsLive) && W.__gcLeadsLive.length ? W.__gcLeadsLive : null); if (seed) { KNOWN = {}; seed.forEach(function(l){ if (l && l.id != null) KNOWN[s(l.id)] = 1; }); } }\n"
     "  var any = false, out = arr.filter(function(l){ var b = blocked(l, !!(KNOWN && l && l.id != null && !KNOWN[s(l.id)])); if (b) any = true; return !b; });\n"
     "  if (KNOWN) out.forEach(function(l){ if (l && l.id != null) KNOWN[s(l.id)] = 1; });\n  return any ? out : arr;\n}\n"
     "function blockedOnList(l){   /* patch R17FIX2: for the Leads screen: a lead new to this computer's list since it loaded gets the full check */\n"
     "  if (!KNOWN && Array.isArray(W.__gcLeadsLive) && W.__gcLeadsLive.length) { KNOWN = {}; W.__gcLeadsLive.forEach(function(x){ if (x && x.id != null) KNOWN[s(x.id)] = 1; }); }\n"
     "  var b = blocked(l, !!(KNOWN && l && l.id != null && !KNOWN[s(l.id)]));\n  if (!b && KNOWN && l && l.id != null) KNOWN[s(l.id)] = 1;\n  return b;"),
    ("var fn = arg, g = function(prev){ var r = fn(prev); return Array.isArray(r) && r !== prev ? guardList(r) : r; };",
     "var fn = arg, g = function(prev){ var r = fn(prev); return Array.isArray(r) && r !== prev ? guardList(r, prev) : r; };   /* patch R17FIX2: prev = what was on the list */"),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('R17FIX2 anchor count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
assert src.count(MARK) == 10, src.count(MARK)
open(path, 'w', encoding='utf-8').write(src)
print('R17FIX2: patched', path)
