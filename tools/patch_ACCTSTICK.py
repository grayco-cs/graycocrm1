#!/usr/bin/env python3
"""patch ACCTSTICK (owner 11/20, upset: "There are things in accounting that keep coming back and messing up … it needs to work
flawlessly" · "When I click approve or any button physically, remember it's forever, so nothing from another computer can overwrite
data. If anything is manually entered, if I click approve it should work and stay approved").

Adds tools/acctstick_tail.js as <script id="gc-patch-acctstick"> (before DONEPCT, the last patch): a DECISIONS LEDGER (gc_kv
gc_decisions) — every person action on a record (approve, deny, mark paid, check #, void, match, assign, move to a job, unlink,
it's right, undo …) is kept per record + field, the one-time automatic accounting fixes the same way (src 'fix'); wherever two
copies meet (the union merge, the queues' pull merge, every write to IndexedDB / the queues in localStorage) the decided fields are
put back, so an older copy, a re-stamped stale copy, a background recompute, an automatic fix or an import cannot undo a decision.
See the block's header for the live evidence, the rule and the protected lists.

Edits patch ACCTAUTO in place:
  · run(): the fixes are recorded as 'fix' decisions; while it runs no write is taken for a person's.
  · undo / ✓ Use this job: recorded as the person's decisions (before the lists are written); pickInv returns its log id.
  · ⚠ Needs a look: ✓ Done is kept on this computer until the cloud has it and is MERGED into the cloud's copy (never lost to
    another computer's write); a small "↩ Undo" bar after ✓ Done / ✓ Use this job; an item settled another way leaves the list.
The sync merge itself (claude/fastopen2 also works there) is not edited: the block wraps window._gcUnionMerge / _gcPullMerge.
Idempotent (MARK only inside JS comments; every replaced snippet asserted once).
Usage: python3 tools/patch_ACCTSTICK.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
src = open(P, encoding='utf-8').read()
MARK = '__GC_PATCH_ACCTSTICK__'
if MARK in src:
    print('already patched'); sys.exit(0)
JS = open(os.path.join(here, 'acctstick_tail.js'), encoding='utf-8').read()
assert JS.startswith('/*' + MARK)

def rep(o, n, tag):
    global src
    assert src.count(o) == 1, ('ACCTSTICK anchor', tag, src.count(o))
    src = src.replace(o, n)

# ── ACCTAUTO: run() — no write while it runs is a person's; the fixes are 'fix' decisions ──
rep("  RUNNING = true;\n",
    "  RUNNING = true; W.__gcNotPersonUntil = Date.now() + 180000;   /* patch ACCTSTICK: the automatic run is no person */\n",
    'run flag on')
rep("  } finally { RUNNING = false; }\n",
    "  } finally { RUNNING = false; W.__gcNotPersonUntil = 0; }\n",
    'run flag off')
rep("    if (touched[FOLDK]) { var nf = {}; P.folds.forEach(",
    "    /* patch ACCTSTICK: what the run fixes is kept as an automatic decision — an older copy cannot put it back (a person can) */\n"
    "    try { if (W._gcDecide) P.items.forEach(function(it){ arr(it.changes).forEach(function(ch){ W._gcDecide(ch.list, ch.id, ch.after, { src: 'fix', at: at, by: CORE.BY, what: it.title }); }); }); } catch (e) {}\n"
    "    if (touched[FOLDK]) { var nf = {}; P.folds.forEach(",
    'run decisions')

# ── ACCTAUTO: ↩ Undo is the person's decision (kept before the lists are written, so the guard keeps it) ──
rep("  var res = CORE.undo(base, its, at), need = {};\n",
    "  var res = CORE.undo(base, its, at), need = {};\n"
    "  /* patch ACCTSTICK: ↩ Undo is a person's decision: each field the undo put back is kept as decided */\n"
    "  try { if (W._gcDecide) its.forEach(function(it){ arr(it.changes).forEach(function(ch){ var Lr = res[ch.list]; if (!Array.isArray(Lr)) return; var rec = Lr.filter(function(x){ return x && (ch.list === REG ? s(x._id || x.id) : s(x.id)) === s(ch.id); })[0]; if (!rec) return;\n"
    "    var f2 = {}; Object.keys(ch.before || {}).forEach(function(f){ var b = ch.before[f]; if (JSON.stringify(rec[f] === undefined ? null : rec[f]) === JSON.stringify(b === undefined ? null : b)) f2[f] = b; }); W._gcDecide(ch.list, ch.id, f2, { src: 'person', at: at, what: '↩ Undo: ' + it.title }); }); }); } catch (e) {}\n",
    'undo decisions')

# ── ACCTAUTO: a job picked by a person is the person's decision; the log id comes back for ↩ Undo ──
rep("  if (!r.item) return r;\n",
    "  if (!r.item) return r;\n"
    "  try { if (W._gcDecide) arr(r.item.changes).forEach(function(ch){ W._gcDecide(ch.list, ch.id, ch.after, { src: 'person', at: at, what: r.item.title }); }); } catch (e) {}   /* patch ACCTSTICK */\n",
    'pick decisions')
rep("  return { done: true, item: r.item };\n",
    "  return { done: true, item: r.item, logId: entry.id };   /* patch ACCTSTICK: for ↩ Undo */\n",
    'pick logId')

# ── ⚠ Needs a look: ✓ Done merged into the cloud's copy, kept here until it is there; settled items leave the list ──
rep("async function lookLoad(){ var v = await kvGet(LOOKK); LOOK = v && typeof v === 'object' ? v : (LOOK || { list: [], done: {} }); if (!LOOK.done) LOOK.done = {}; return LOOK; }",
    "async function lookLoad(){ var v = await kvGet(LOOKK), S = W._gcStick;\n"
    "  /* patch ACCTSTICK: the cloud's copy + what this computer marked (✓ Done here is never lost to another computer's write; a lost write is sent again) */\n"
    "  if (S && S.lookMerge && v && typeof v === 'object') { var m = S.lookMerge(v, LOOK), ah = m.__ahead; delete m.__ahead; LOOK = m; if (ah) kvPut(LOOKK, m); }\n"
    "  else LOOK = v && typeof v === 'object' ? v : (LOOK || { list: [], done: {} });\n"
    "  if (!LOOK.done) LOOK.done = {}; return LOOK; }",
    'lookLoad')
rep("async function lookDone(id, how){ var LK = await lookLoad(); LK.done[id] = { at: nowIso(), by: meName(), how: how || 'done' }; LOOK = LK; await kvPut(LOOKK, LK); paint(true); }",
    "async function lookDone(id, how, undone){ var e = { at: nowIso(), by: meName(), how: how || (undone ? 'put back on the list' : 'done') }; if (undone) e.undone = true;\n"
    "  try { if (W._gcStick) W._gcStick.lookPending(id, e); } catch (x) {}   /* patch ACCTSTICK: kept here until the cloud has it */\n"
    "  var LK = await lookLoad(); LK.done[id] = e; LOOK = LK; await kvPut(LOOKK, LK); paint(true); }\n"
    "async function lookUndone(id){ return lookDone(id, '', true); }   /* patch ACCTSTICK: ↩ Undo of ✓ Done */",
    'lookDone')
rep("function openLook(){ var L = LOOK || { list: [], done: {} }; return arr(L.list).filter(function(x){ return !L.done[x.id]; }); }",
    "/* patch ACCTSTICK: off the list when ✓ Done (not undone) — or when its bill / invoice was settled another way (moved to a job, archived, the\n"
    "   copy archived, the total / balance changed, the sub added): the count goes down and stays down */\n"
    "function openLook(){ var L = LOOK || { list: [], done: {} }, S = W._gcStick, I = {}; if (S) invList().forEach(function(r){ if (r && r.id != null) I[s(r.id)] = r; });\n"
    "  return arr(L.list).filter(function(x){ var d = L.done && L.done[x.id]; if (d && !d.undone) return false; try { return !(S && S.lookSettled(x, I)); } catch (e) { return true; } }); }",
    'openLook')
rep("  if (a === 'done') { t.disabled = true; lookDone(t.getAttribute('data-id')).then(function(){ open('look'); }); return; }",
    "  if (a === 'done') { t.disabled = true; var did = t.getAttribute('data-id'), dx = arr((LOOK || {}).list).filter(function(x){ return x.id === did; })[0];\n"
    "    lookDone(did).then(function(){ open('look'); try { W._gcStick.toast('✓ Done: ' + s(dx && dx.title).slice(0, 90), function(){ lookUndone(did).then(function(){ if (D.getElementById('af-ov')) open('look'); }); }); } catch (e) {} }); return; }   /* patch ACCTSTICK: ↩ Undo */",
    'done click')
rep("  if (a === 'usejob') { var sel = t.parentElement && t.parentElement.querySelector('[data-af-job]'), v = sel ? s(sel.value) : ''; if (!v) return; t.disabled = true; useJob(t.getAttribute('data-id'), v === '__none__' ? '' : v).then(function(){ open('look'); }, function(){ open('look'); }); return; }",
    "  if (a === 'usejob') { var sel = t.parentElement && t.parentElement.querySelector('[data-af-job]'), v = sel ? s(sel.value) : ''; if (!v) return; t.disabled = true; var uid = t.getAttribute('data-id');\n"
    "    useJob(uid, v === '__none__' ? '' : v).then(function(r){ open('look'); try { if (r && r.done && r.logId) W._gcStick.toast('✓ ' + s(r.item && r.item.title).slice(0, 90), function(){ undoItems(r.logId, [r.item.id]).then(function(){ return lookUndone(uid); }).then(function(){ if (D.getElementById('af-ov')) open('look'); }); }); } catch (e) {} }, function(){ open('look'); }); return; }   /* patch ACCTSTICK: ↩ Undo */",
    'usejob click')

rep("  lookDone: lookDone, useJob: useJob, pick: pickInv,",
    "  lookDone: lookDone, lookUndone: lookUndone, lookLoad: lookLoad, useJob: useJob, pick: pickInv,   /* patch ACCTSTICK: + lookUndone, lookLoad */",
    'api')

# ── ⚠ Needs a look: one primary button per row (a job to pick: "✓ Use this job"; "Leave as is" next to it is the light one) ──
rep("""'<button type="button" class="af-b" data-af="done" data-id="' + esc(x.id) + '">✓ Done</button></td></tr>'""",
    """'<button type="button" class="af-b' + (x.kind === 'jobpick' ? ' l' : '') + '" data-af="done" data-id="' + esc(x.id) + '">' + (x.kind === 'jobpick' ? 'Leave as is' : '✓ Done') + '</button></td></tr>'""",
    'one primary button')

# ── the disk floor's "blanks never win" (its repair() melds this computer's last copy into every write): a field a person CLEARED
#    (the decisions ledger says so) is a decision, not a blank — the repaired list goes through the ledger before it is written ──
rep("               : (melded+' record(s) took the newer of the two copies'));\n  return out;\n}\n",
    "               : (melded+' record(s) took the newer of the two copies'));\n"
    "  try{ if(window._gcDecisions && window._gcDecisions.guard) out = window._gcDecisions.guard(key, out); }catch(e){}   /* patch ACCTSTICK: a cleared field stays cleared */\n"
    "  return out;\n}\n",
    'floor repair honors decisions')

# ── the pull merge (COMPANY SYNC mergeRecords; claude/fastopen2 also works in this file — ONE line, marked): a copy that carries a
#    save time beats one that has none (an approval-queue entry decided elsewhere and stamped lost to this computer's un-stamped
#    waiting copy: "on a conflict ... with no timestamps this computer's copy is kept" read one stamp as none) ──
rep("    if(a && b && a > b) out[at[id]] = r;                       /* strictly newer elsewhere */\n",
    "    if(a && b && a > b) out[at[id]] = r;                       /* strictly newer elsewhere */\n"
    "    else if(a && !b && ALT_ID[key]) out[at[id]] = r;           /* patch ACCTSTICK: a queue entry saved (stamped) elsewhere beats an un-stamped one here */\n",
    'mergeRecords stamp')

# ── the block itself, before the last patch (DONEPCT) ──
rep('<script id="gc-patch-donepct">',
    '<script id="gc-patch-acctstick">' + JS.rstrip('\n') + '\n</script>\n<script id="gc-patch-donepct">',
    'insert block')

open(P, 'w', encoding='utf-8').write(src)
print('patch ACCTSTICK applied to', P)
