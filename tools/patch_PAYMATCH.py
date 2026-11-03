#!/usr/bin/env python3
"""Idempotent patch PAYMATCH: a 💵 Payment match is never lost when this browser's localStorage is full.
The bank import found the certain deposit → invoice match and wrote it to the cloud (gc_kv gc_pay_matches), but the
office's list on screen was then re-read from localStorage only (PM.list = arr(lsGet(PMK))). With a full localStorage
(the CRM keeps big copies there: estimates, rates, backups) the local write fails silently, the list came back without the
match, so no 💵 button and "Nothing to match right now" until the next 90 s cloud scan (and a ✅ Confirm / Not this one
could come back as new the same way). Now the list keeps what was just written: on screen = what it had + localStorage
+ the records just saved (those win). Nothing else changes. Usage: python3 tools/patch_PAYMATCH.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch PAYMATCH'
if MARK in t: print('PAYMATCH: already patched'); sys.exit(0)
R = [
("""function scanPayments(){
  if (!myEmail() || !isOffice()) return;""",
 """/* patch PAYMATCH: the list on screen keeps what was just saved, even when this browser's localStorage is full */
function pmKeep(saved){
  var by = {}, order = [];
  PM.list.concat(arr(lsGet(PMK)), arr(saved)).forEach(function(m){ if (!m || m.id == null) return; var k = String(m.id); if (!(k in by)) order.push(k); by[k] = m; });
  PM.list = order.map(function(k){ return by[k]; });
}
function scanPayments(){
  if (!myEmail() || !isOffice()) return;"""),
("""    if (fresh.length) return kvAdd(PMK, fresh).then(function(){ PM.list = arr(lsGet(PMK)); });""",
 """    if (fresh.length) return kvAdd(PMK, fresh).then(function(){ pmKeep(fresh); });"""),
("""  return kvAdd(PMK, [rec]).then(function(){
    PM.list = arr(lsGet(PMK));""",
 """  return kvAdd(PMK, [rec]).then(function(){
    pmKeep([rec]);"""),
("""function dismissMatch(m){ return kvAdd(PMK, [Object.assign({}, m, { status: 'dismissed', dismissedBy: myName(), updatedAt: nowIso() })]).then(function(){ PM.list = arr(lsGet(PMK)); paintPills(); }); }""",
 """function dismissMatch(m){ var rec = Object.assign({}, m, { status: 'dismissed', dismissedBy: myName(), updatedAt: nowIso() }); return kvAdd(PMK, [rec]).then(function(){ pmKeep([rec]); paintPills(); }); }"""),
("""if (!fresh.length) return Promise.resolve(0); return kvAdd(PMK, fresh).then(function(){ PM.list = arr(lsGet(PMK));""",
 """if (!fresh.length) return Promise.resolve(0); return kvAdd(PMK, fresh).then(function(){ pmKeep(fresh);"""),
]
for old, new in R:
    assert t.count(old) == 1, ('PAYMATCH anchor', t.count(old), old[:90])
for old, new in R:
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('PAYMATCH: patched', p)
