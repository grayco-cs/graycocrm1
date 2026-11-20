#!/usr/bin/env python3
"""patch COICONF (owner 11/20, phone, GrayCo Field → My Approvals: "I've already clicked these to confirm"). Sub COI / W-9 "to
confirm" cards came back after 📄 Read & confirm. The list is the server's open reads (sub-doc-read ?list=1) + the sub files not
marked read. A confirm marks the file read on the sub (shared, synced) but closed the server read with ONE fire-and-forget call;
when that call was lost (a busy key — several confirms in a row —, a weak signal, the page closed) the read stayed "new" and only
this computer's memory (SEENDOC) hid it: on the phone, and here after a reload, every such card came back. Now:
  · patch AUTAI scanSubDocs: a server read whose file is marked read (or rejected) on a sub record is not listed — the sub record
    is the one shared answer — and its server read is closed again (once a session per read; this also clears the reads already
    stuck in live data the first time an office / admin computer scans).
  · patch AUTAI applySubRead: the close is checked and tried again (3 tries).
  · patch COIAPPR rejectOn (✕ Deny): the record is re-stamped (updatedAt) and the fields it clears are set empty instead of
    deleted — an un-stamped record tied with the cloud's older copy in the sync merge and a deleted field was filled back from
    it (test_SUBDOCDENY's flaky "insExp not cleared" / "w9 still true").
  · Field My Approvals ("Other approvals"): a second action per card (✕ Deny on the COI / W-9 cards); the card wraps at phone
    width so both buttons stay on screen.
  · phone app pages (patch PHONEUI): the sticky ‹ Back header gets its own layer above the content (z-index 30, translateZ) and
    the page card is isolated, so nothing in it can paint over the header / status bar (iOS).
Edits patch AUTAI, COIAPPR, the APPROVE panel decorator and PHONEUI in place. Idempotent.
Usage: python3 tools/patch_COICONF.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
src = open(P, encoding='utf-8').read()

def rep(o, n, tag):
    global src
    if n in src: return
    assert src.count(o) == 1, ('COICONF anchor', tag, src.count(o))
    src = src.replace(o, n)

# AUTAI: the sub record decides — a server read of a file marked read / rejected on a sub is not listed, and is closed again
rep("    var rjx = {}; subs().forEach(function(sb){ arr(sb.files).forEach(function(f){ if (f && f.rejected && f.ref) rjx[f.ref] = 1; }); });   /* patch SUBDOCDENY */\n"
    "    var waiting = arr(j.items).filter(function(w){ return !SEENDOC[w.ref] && !rjx[w.ref]; });",
    "    var rjx = {}, rdx = {}; subs().forEach(function(sb){ arr(sb.files).forEach(function(f){ if (f && f.rejected && f.ref) rjx[f.ref] = 1; if (f && f.aiRead && f.ref) rdx[f.ref] = 1; }); });   /* patch SUBDOCDENY; patch COICONF: + read on the sub */\n"
    "    var waiting = arr(j.items).filter(function(w){ if (w && (rdx[w.ref] || rjx[w.ref])) { closeRead(w); return false; } return !SEENDOC[w.ref] && !rjx[w.ref]; });   /* patch COICONF: a confirmed file is confirmed on every computer */",
    'AUTAI server list')
rep("var SDQ = [];\nfunction scanSubDocs(){",
    "var SDQ = [];\n"
    "/* patch COICONF: close a server read again (a confirm's close that was lost): once a session per read */\n"
    "var CLOSED = {};\n"
    "function closeRead(w){ var id = s(w && w.id); if (!/^sd_/.test(id) || CLOSED[id]) return; CLOSED[id] = 1; fn('sub-doc-read', { act: 'done', id: id, subId: s(w.subId) }).then(function(j){ if (!j || !j.ok) delete CLOSED[id]; }); }\n"
    "function scanSubDocs(){",
    'AUTAI closeRead')
rep("  fn('sub-doc-read', { act: 'done', id: rd.id, subId: sid });\n",
    "  (function done(n){ fn('sub-doc-read', { act: 'done', id: rd.id, subId: sid }).then(function(j){ if ((!j || !j.ok) && n < 3) ST(function(){ done(n + 1); }, 4000 * n); }); })(1);   /* patch COICONF: checked, tried again */\n",
    'AUTAI applySubRead done')

# COIAPPR rejectOn: re-stamped, cleared fields set empty (not deleted)
rep("  var y = Object.assign({}, x), hit = null, cleared = [];\n  y.files = arr(x.files).map(",
    "  var y = Object.assign({}, x, { updatedAt: rec.at }), hit = null, cleared = [];   /* patch COICONF: re-stamped, so the sync merge keeps it */\n  y.files = arr(x.files).map(",
    'COIAPPR stamp')
rep("    else if (wc) { if (exp && s(y.wcExp) === exp) { delete y.wcExp; cleared.push('wcExp'); }",
    "    else if (wc) { if (exp && s(y.wcExp) === exp) { y.wcExp = ''; cleared.push('wcExp'); }   /* patch COICONF: empty, not deleted (a merge filled a deleted field back) */",
    'COIAPPR wcExp')
rep("      ['insExp', 'coiExp', 'glExp'].forEach(function(k){ if (exp && s(y[k]) === exp && !y.coiReadAt) { delete y[k]; cleared.push(k); } });",
    "      ['insExp', 'coiExp', 'glExp'].forEach(function(k){ if (exp && s(y[k]) === exp && !y.coiReadAt) { y[k] = ''; cleared.push(k); } });   /* patch COICONF: empty, not deleted */",
    'COIAPPR insExp')

# COIAPPR: the ONE approval set entry carries ✕ Deny too (Field My Approvals)
rep("      g.push({ id: it.id, title: title(it), sub: note(it), coi: true, act: { l: '📄 Read & confirm', f: function(){ open(it.ref); } } }); });",
    "      g.push({ id: it.id, title: title(it), sub: note(it), coi: true, act: { l: '📄 Read & confirm', f: function(){ open(it.ref); } }, act2: { l: '✕ Deny', f: function(){ denySheet(it); } } }); });   /* patch COICONF: + ✕ Deny (Field) */",
    'COIAPPR set act2')

# the APPROVE panel's "Other approvals" cards: a second action, wrapping at phone width
OLD_CARD = """'<div data-gc-appr-other="' + esc(x.id) + '" style="background:#0a1628;border:1px solid #1e3a5f;border-radius:12px;padding:12px;margin-bottom:9px;display:flex;gap:10px;align-items:center;"><div style="flex:1;min-width:0">"""
NEW_CARD = """'<div data-gc-appr-other="' + esc(x.id) + '" style="background:#0a1628;border:1px solid #1e3a5f;border-radius:12px;padding:12px;margin-bottom:9px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;"><div style="flex:1 1 180px;min-width:0">"""
rep(OLD_CARD, NEW_CARD, 'other card wrap')
rep("""font-size:12.5px;cursor:pointer;">' + esc(x.act.l || 'Open') + '</button>' : '') + '</div>'; }).join('');""",
    """font-size:12.5px;cursor:pointer;">' + esc(x.act.l || 'Open') + '</button>' : '') + (x.act2 && x.act2.f ? '<button type="button" data-i2="' + i + '" style="padding:9px 13px;border-radius:8px;border:1px solid #dc2626;background:#fff;color:#b91c1c;font-weight:800;font-size:12.5px;cursor:pointer;">' + esc(x.act2.l) + '</button>' : '') + '</div>'; }).join('');   /* patch COICONF: + a second action (✕ Deny) */""",
    'other card act2')
rep("      Array.prototype.forEach.call(box.querySelectorAll('button[data-i]'), function(bt){ bt.onclick = function(){ var x = other[+bt.getAttribute('data-i')]; try { ov.remove(); } catch (e) {} try { x.act.f(); } catch (e) {} }; });\n",
    "      Array.prototype.forEach.call(box.querySelectorAll('button[data-i]'), function(bt){ bt.onclick = function(){ var x = other[+bt.getAttribute('data-i')]; try { ov.remove(); } catch (e) {} try { x.act.f(); } catch (e) {} }; });\n"
    "      Array.prototype.forEach.call(box.querySelectorAll('button[data-i2]'), function(bt){ bt.onclick = function(){ var x = other[+bt.getAttribute('data-i2')]; try { x.act2.f(); } catch (e) {} }; });   /* patch COICONF: the panel stays (Deny asks why on top) */\n",
    'other card act2 click')

# PHONEUI: the sticky app header above the page content
rep("""    'html.gc-pu-app .gc-pu-page > .gc-pu-bar{order:-1;flex:0 0 auto}' +""",
    """    'html.gc-pu-app .gc-pu-page > .gc-pu-bar{order:-1;flex:0 0 auto;z-index:30;-webkit-transform:translateZ(0);transform:translateZ(0)}' +   /* patch COICONF: its own layer above the content (iOS painted the cards over it) */
    'html.gc-pu-app .gc-pu-page > .gc-pu-card{isolation:isolate}' +""",
    'PHONEUI bar')

# ONELIST (the sub / vendor list): the `subs` key no longer keeps a sub's OLD copy for good, and the screen never takes an older
# copy of a sub over a newer one (or loses a COI / W-9 read / rejected mark) from a sync
rep("""  var next = have.filter(function(r){ return !buried(r); }).concat(add);
  if(next.length === have.length && !add.length) return null;""",
    """  /* patch COICONF: a sub already under `subs` takes this list's newer copy. Only ADDED to, that key kept each sub's first copy
     for good; a sync of it put that old copy back on the screen (a confirmed COI / W-9 came back, a deny was undone). */
  var newer = {}, upd = 0; subsOf(full).forEach(function(r){ var k=idOf(r); if(k) newer[k]=r; });
  var next = have.filter(function(r){ return !buried(r); }).map(function(r){ var n = newer[idOf(r)]; if(n && n !== r && stampOf(n) > stampOf(r)){ upd++; return n; } return r; }).concat(add);
  if(next.length === have.length && !add.length && !upd) return null;""",
    'ONELIST writeSubsKey')
rep("""async function writeSubsKey(full){""",
    """function stampOf(r){ return s(r && (r.updatedAt || r.updated_at || r.savedAt)); }   /* patch COICONF */
async function writeSubsKey(full){""",
    'ONELIST stampOf')
rep("""  if(!Array.isArray(next)) return;
  var have = {};
  next.forEach(function(r){ have[idOf(r)] = 1; });""",
    """  if(!Array.isArray(next)) return;
  /* patch COICONF: a sync never puts an older copy of a sub over the newer one on the screen, and a COI / W-9 marked read or
     rejected here stays marked (patch COIAPPR's keepRead) */
  try{
    var curBy = {}; cur.forEach(function(r){ var k=idOf(r); if(k) curBy[k] = r; });
    next = next.map(function(r){ var c = curBy[idOf(r)]; return (c && c !== r && stampOf(r) && stampOf(c) > stampOf(r)) ? c : r; });
    if(typeof window._gcCoiKeepRead === 'function') next = window._gcCoiKeepRead(next, [cur]);
  }catch(e){}
  var have = {};
  next.forEach(function(r){ have[idOf(r)] = 1; });""",
    'ONELIST applyList')

open(P, 'w', encoding='utf-8').write(src)
print('patch COICONF applied to', P)
