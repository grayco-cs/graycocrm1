#!/usr/bin/env python3
"""patch STATUSFIX (owner 11/04, URGENT data integrity): completed / lost jobs came back as active / approved / bidding
("nobody changed these"). Root cause: a computer opening with an old copy of the jobs (iPhone 16:54Z, Office PC 18:12Z /
18:14Z, each right after signing in) — the "manual save always wins" writers stamped EVERY job of a list with
updatedAt = now on any save made while someone was clicking or typing, so the old copy looked newest, and the SYNC_A
person-edit ledger took the old values as that person's edits (7 / 8 jobs in one save) and spread them.
 1. tools/statusfix_core.js (before the build comment): stampChanged / holdTerminal / jobYearOf.
 2. the three whole-list stampers (_gcRecIDBput, SAVE-FOR-GOOD stampAll, writeKV) stamp only the records that changed.
 3. SYNC_A: a completed / lost / cancelled / closed job keeps that status on every disk write unless a person changed a
    status (status picker, status/reopen/mark button, board drag, the CRM's job-status writer); such a change is never
    stamped as a person edit without that; one save of more than 2 jobs is a sweep, not a person; a person's
    completed / lost wins over a copy without a newer person status edit.
 4. job year: a job dated by its schedule / its own dates belongs to the year it STARTS (was: the latest date).
 5. tools/statusfix_tail.js after the last </script>: the admin "Put back" card on Projects.
usage: python3 tools/patch_STATUSFIX.py [index.html]   (in place; idempotent)"""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
INDEX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'index.html')
MARK = '/* patch STATUSFIX */'
EDITS = [
 # 2a. _gcRecIDBput
 ("""    if(_CORE[key] && Array.isArray(val) && (window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__)){
      var _now=new Date().toISOString();
      val.forEach(function(r){ if(r && typeof r==='object'){ r.updatedAt=_now; if(!r.savedAt) r.savedAt=_now; } });
    }""",
  """    if(_CORE[key] && Array.isArray(val) && window.__GC_STATUSFIX__){   """ + MARK + """ // only the records that changed get the new stamp
      var _act=!!(window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__);
      window.__GC_STATUSFIX__.stampChanged(key, val, null, !_act);
    }"""),
 # 2b. SAVE-FOR-GOOD stampAll
 ("""  function stampAll(list){
    if(!Array.isArray(list)) return list;
    var now=new Date().toISOString();
    list.forEach(function(r){ if(r && typeof r==='object'){ r.updatedAt=now; if(!r.savedAt) r.savedAt=now; } });
    return list;
  }""",
  """  function stampAll(list, key, seedOnly){   """ + MARK + """ // only the records that changed since the last write of this list
    if(!Array.isArray(list)) return list;
    if(window.__GC_STATUSFIX__) window.__GC_STATUSFIX__.stampChanged(key, list, null, !!seedOnly);
    return list;
  }"""),
 ("""          if(CORE[key] && Array.isArray(value) && (window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__)){
            stampAll(value);
          }""",
  """          if(CORE[key] && Array.isArray(value)){
            stampAll(value, key, !(window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__));   """ + MARK + """
          }"""),
 ("""      stampAll(list);
      if(window.idbSet) await window.idbSet(key, list);""",
  """      stampAll(list, key);   """ + MARK + """
      if(window.idbSet) await window.idbSet(key, list);"""),
 # 2c. writeKV
 ("""    if(CORE[key] && Array.isArray(value) && (window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__)){
      var now=new Date().toISOString();
      var big = value.length > 2000 && typeof WeakSet === 'function', had = big ? _wkLast[key] : null;
      value.forEach(function(r){ if(r && typeof r==='object'){ if(had && had.has(r)) return; r.updatedAt=now; if(!r.savedAt) r.savedAt=now; } });
    }""",
  """    if(CORE[key] && Array.isArray(value)){
      var _act = !!(window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__);   """ + MARK + """
      var now=new Date().toISOString();
      var big = value.length > 2000 && typeof WeakSet === 'function', had = big ? _wkLast[key] : null;
      if(big){ if(_act) value.forEach(function(r){ if(r && typeof r==='object'){ if(had && had.has(r)) return; r.updatedAt=now; if(!r.savedAt) r.savedAt=now; } }); }
      else if(window.__GC_STATUSFIX__) window.__GC_STATUSFIX__.stampChanged(key, value, now, !_act);
    }"""),
 # 3. SYNC_A
 ("function okE(e){ return e && typeof e === 'object' && e.at && ('v' in e); }",
  """function okE(e){ return e && typeof e === 'object' && e.at && ('v' in e); }
""" + MARK + """ // a person's explicit status change: a status picker, a status / reopen / mark button, a drag on the board
var SF = window.__GC_STATUSFIX__ || null, stGest = [];
function statusGesture(){ var n = Date.now(); while(stGest.length && n - stGest[0] > 30000) stGest.shift(); return stGest.length > 0; }
window._gcStatusIntent = function(){ stGest.push(Date.now()); };
document.addEventListener('change', function(e){
  try{ if(!e.isTrusted) return; var t = e.target; if(!t || t.tagName !== 'SELECT' || !t.options) return;
    for(var i = 0; i < t.options.length; i++){ var v = norm(t.options[i].value || t.options[i].text); if(v === 'completed' || v === 'lost'){ stGest.push(Date.now()); return; } } }catch(x){}
}, true);
document.addEventListener('click', function(e){
  try{ if(!e.isTrusted) return; var t = e.target;
    for(var d = 0; t && d < 4; d++, t = t.parentElement){
      var a = t.getAttribute ? ((t.getAttribute('data-status') || '') + ' ' + (t.getAttribute('title') || '')) : '';
      var x = a + ' ' + (d < 2 ? String(t.textContent || '').slice(0, 60) : '');
      if(/\\b(re-?open|status|mark (as )?(active|approved|bidding|on.?hold|lost|completed?|won)|put back)\\b/i.test(x)){ stGest.push(Date.now()); return; }
      if(d < 2 && /^\\s*[^a-z]{0,3}\\s*(active|approved|bidding|on.?hold|in progress|completed?|lost|won|cancell?ed)\\s*$/i.test(String(t.textContent || '').slice(0, 40))){ stGest.push(Date.now()); return; }
    } }catch(x){}
}, true);
document.addEventListener('drop', function(e){ if(e.isTrusted) stGest.push(Date.now()); }, true);"""),
 ("if(!(was || olderEdit || cur === undefined || cur === null || cur === '')) return;",
  "var termHold = f === 'status' && E.by && SF && SF.isTerm(E.v);   " + MARK + " // a person's completed / lost wins over a copy without a newer person status edit\n"
  "    if(!(was || olderEdit || termHold || cur === undefined || cur === null || cur === '')) return;"),
 ("if(!cand.length || (!fw && cand.length > 40)) return;",
  "if(!cand.length || (!fw && cand.length > 2)) return;                  " + MARK + " // one save of 3+ jobs is a sweep (the 11/04 old copies were 7 and 8)"),
 ("      if(own && okE(own) && same(own.v, r[f]) && n - ts(own.at) < 120000) return;",
  "      if(f === 'status' && !fw && SF && SF.isTerm(c.p[f]) && !statusGesture()) return;   " + MARK + "\n"
  "      if(own && okE(own) && same(own.v, r[f]) && n - ts(own.at) < 120000) return;"),
 ("        if(own && okE(own) && same(own.v, v)) return;",
  "        if(f === 'status' && SF && SF.isTerm(c.p[f]) && !statusGesture()) return;   " + MARK + "\n"
  "        if(own && okE(own) && same(own.v, v)) return;"),
 ("        stampEdits(value);",
  """        if(SF && lastRows){ try{   """ + MARK + """ // a completed / lost job keeps it unless a person changed a status
          var _fw = forced && forced.until > Date.now() ? forced.ids : null;
          var _held = SF.holdTerminal(lastRows, value, { gesture:statusGesture(), forced:_fw, fe:FE });
          if(_held.length){
            stats.held = (stats.held || 0) + _held.length;
            var _hm = {}; _held.forEach(function(h){ _hm[h.id] = h.from; });
            try{ console.log('%c[GC] status kept (no person changed it): ' + _held.map(function(h){ return (h.name || h.id) + ' ' + h.from + ' (not ' + h.to + ')'; }).join('; '), 'background:#7c2d12;color:#fff;padding:2px 6px'); }catch(e){}
            ST.call(window, function(){ try{ if(window._setProjects) window._setProjects(function(prev){ return Array.isArray(prev) ? prev.map(function(p){ return p && _hm[p.id] && !same(p.status, _hm[p.id]) ? Object.assign({}, p, { status:_hm[p.id] }) : p; }) : prev; }); }catch(e){} }, 0);
          }
        }catch(e){} }
        stampEdits(value);"""),
 # 4. job year
 ("    var y=best(dates);",
  "    var y=(window.__GC_STATUSFIX__ && window.__GC_STATUSFIX__.jobYearOf) ? window.__GC_STATUSFIX__.jobYearOf(dates, src) : best(dates);   " + MARK),
]
src = open(INDEX, encoding='utf-8').read()
if '__GC_PATCH_STATUSFIX__' in src:
    print('already patched'); sys.exit(0)
for a, b in EDITS:
    n = src.count(a); assert n == 1, ('anchor count', n, a[:90]); src = src.replace(a, b)
core = open(os.path.join(H, 'statusfix_core.js'), encoding='utf-8').read().rstrip('\n')
A = '<!-- GrayCo CRM Build: '
assert src.count(A) == 1, 'build comment'
src = src.replace(A, core + '\n' + A)
tail = open(os.path.join(H, 'statusfix_tail.js'), encoding='utf-8').read().rstrip('\n')
i = src.rfind('</script>'); assert i > 0; i += len('</script>')
src = src[:i] + '\n' + tail + src[i:]
open(INDEX, 'w', encoding='utf-8').write(src)
print('patched STATUSFIX')
