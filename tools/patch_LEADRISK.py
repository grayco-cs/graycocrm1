#!/usr/bin/env python3
"""patch LEADRISK — 🚨 Leads at risk: ✓ Contacted / ✕ Clear on each row, "Clear all" with an inline confirm (owner 11/23:
   "be able to clear this").
   1. index.html: the inlined copy of netlify/functions/_lib/lead-watch.js (between the LEADWATCH core markers) is replaced with the
      file as it is now (clearSig / cleared: an owner's ✕ Clear, until something new happens on the lead).
   2. index.html (the LEADWATCH script): the row buttons, the card's "Clear all", the header line (no "owners are texted at 48 h":
      that text is off for good), the clicks, the API.
   3. index.html (the Leads hub): markContacted / patchLead are on window._gcLeadsHub, so the card reuses the lead's own ✅ Contacted.
   tools/leadwatch_block.html gets the same edits where its text is the same (its core is a placeholder).
   Every anchor must occur exactly once. Run once; a second run stops at the first anchor."""
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html')
BLK = os.path.join(ROOT, 'tools/leadwatch_block.html')
t = io.open(IDX, encoding='utf-8').read()
b = io.open(BLK, encoding='utf-8').read()

def once(src, a, name):
    n = src.count(a)
    if n != 1: sys.exit('LEADRISK: anchor %r found %d times in %s' % (a[:80], n, name))

def rep(a, new, block=True):
    global t, b
    once(t, a, 'index.html'); t = t.replace(a, new)
    if block:
        once(b, a, 'leadwatch_block.html'); b = b.replace(a, new)

# 1. the core, word for word
core = io.open(os.path.join(ROOT, 'netlify/functions/_lib/lead-watch.js'), encoding='utf-8').read().rstrip('\n')
if '</script' in core: sys.exit('lead-watch.js must not contain </script')
B0 = '/* __LEADWATCH_CORE_BEGIN__ netlify/functions/_lib/lead-watch.js, inlined word for word: */\n'
E0 = '/* __LEADWATCH_CORE_END__ */'
once(t, B0, 'index.html'); once(t, E0, 'index.html')
i = t.index(B0) + len(B0); j = t.index(E0, i)
t = t[:i] + core + '\n' + t[j:]

# 2. the card
rep("""function rowHtml(z){""", """/* patch LEADRISK (owner 11/23, "be able to clear this"): ✓ Contacted (the lead's own ✅ Contacted: contactedAt / contactedBy, stage →
   Contacted) and ✕ Clear (off the card for good — lwClear { at, by, byEmail, sig } on the lead, every clear kept in lwClearLog; it comes back
   only when something new happens on the lead: core clearSig). Saved on the lead, so every computer and every owner sees it; the lead is
   never deleted. "Clear all" asks inline (no pop-up). Owners / admins only (the card is theirs). */
var LR = { done: {}, clr: {}, ask: 0, last: null };
var LRB = 'min-height:36px;padding:0 12px;border-radius:9px;font:700 13px Inter,Arial,sans-serif;cursor:pointer;';
function actsHtml(l){ var id = esc(l.id);
  return '<button type="button" data-lw-done="' + id + '" title="I reached out to them: marks the lead contacted (the same as ✅ Contacted on the lead)" style="' + LRB + 'border:1px solid #16a34a;background:#f0fdf4;color:#166534">✓ Contacted</button>'
    + '<button type="button" data-lw-clear="' + id + '" title="Take it off this card for good. It comes back only if something new happens on the lead. The lead itself is kept." style="' + LRB + 'border:1px solid #cbd5e1;background:#fff;color:#475569">✕ Clear</button>'; }
function clearAllHtml(L){
  if (LR.ask > Date.now()) return '<span data-lw-confirm="1" style="margin-left:auto;display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;font:600 12.5px Inter,Arial,sans-serif;color:#7f1d1d">Clear all ' + L.length + '?'
    + '<button type="button" data-lw-clearall="yes" style="' + LRB + 'min-height:32px;border:1px solid #b91c1c;background:#dc2626;color:#fff">Yes, clear all</button>'
    + '<button type="button" data-lw-clearall="no" style="' + LRB + 'min-height:32px;border:1px solid #cbd5e1;background:#fff;color:#334155">Cancel</button></span>';
  return '<button type="button" data-lw-clearall="ask" title="Take every lead on this card off it (each comes back only if something new happens on it)" style="' + LRB + 'margin-left:auto;min-height:32px;border:1px solid #fca5a5;background:#fff;color:#991b1b;font-size:12.5px">Clear all</button>';
}
function rowHtml(z){""")
rep("""cursor:pointer">Open</button></div>';""", """cursor:pointer">Open</button>' + actsHtml(l) + '</div>';""")
rep("""+ L.length + '</span></div>'""", """+ L.length + '</span>' + clearAllHtml(L) + '</div>'""")
rep("""h after it was assigned (the owners are texted at ' + C.OWNER_H + ' h). Every company\\'s leads.</div>'""",
    """h after it was assigned. Every company\\'s leads. ✕ Clear takes one off for good (it comes back if something new happens on it).</div>'""")
rep("""  var L = C.atRisk(leads(), [], t); LAST = """, """  var L = C.atRisk(leads(), [], t).filter(function(z){ var id = s(z.l.id); return !LR.done[id] && !(LR.clr[id] && LR.clr[id] === C.clearSig(z.l)); });   /* patch LEADRISK: what was just ✓ / ✕ here, before the synced copy has it */
  LAST = """)
rep("""/* ── the company filter never hides a lead at risk ── */""", """/* patch LEADRISK: the clicks (owners / admins only) */
function lrRepaint(){ LAST.at = 0; paint(); ST.call(W, function(){ LAST.at = 0; paint(); }, 450); }   /* again once the Leads page has redrawn */
function lrSave(id, rec){
  var f = function(x){ x.lwClear = rec; x.lwClearLog = arr(x.lwClearLog).concat([rec]).slice(-30); };
  try { if (W._gcLeadsHub && typeof W._gcLeadsHub.patchLead === 'function') return Promise.resolve(W._gcLeadsHub.patchLead(id, f)); } catch (e) {}
  return new Promise(function(res){ try { if (typeof W._setLeads !== 'function') return res(false);
    W._setLeads(function(list){ return arr(list).map(function(l){ if (!l || s(l.id) !== s(id)) return l; var y = Object.assign({}, l); f(y); y.updatedAt = new Date().toISOString(); return y; }); }); res(true); } catch (e) { res(false); } });
}
function lrClear(ids, all){
  if (!admin()) return Promise.resolve({ cleared: [] });
  var byId = {}; leads().forEach(function(l){ byId[s(l.id)] = l; });
  var todo = arr(ids).map(function(id){ return byId[s(id)]; }).filter(Boolean), at = new Date().toISOString(), out = [];
  todo.forEach(function(l){ LR.clr[s(l.id)] = C.clearSig(l); });
  lrRepaint();
  return todo.reduce(function(p, l){ return p.then(function(){
    var r = riskOf(l), rec = { at: at, by: myName() || myEmail() || 'owner', byEmail: myEmail(), sig: C.clearSig(l), k: r ? r.k : '', all: !!all };
    return lrSave(l.id, rec).then(function(ok){ if (ok === false) delete LR.clr[s(l.id)]; else out.push(s(l.id)); }, function(){ delete LR.clr[s(l.id)]; });
  }); }, Promise.resolve()).then(function(){ LR.last = { at: at, all: !!all, cleared: out }; lrRepaint(); return LR.last; });
}
function lrDone(id, b){
  if (!admin()) return Promise.resolve(false);
  id = s(id); if (b) { b.disabled = true; b.textContent = 'Saving…'; }
  var H = W._gcLeadsHub, p;
  try { p = H && typeof H.markContacted === 'function' ? H.markContacted(id) : W._gcSTL && typeof W._gcSTL.mark === 'function' ? W._gcSTL.mark(id) : false; } catch (e) { p = false; }
  return Promise.resolve(p).then(function(ok){
    var l = leads().filter(function(x){ return s(x.id) === id; })[0];
    if (ok || (l && C.contacted(l))) LR.done[id] = 1; else if (b) { b.disabled = false; b.textContent = '✓ Contacted'; }
    lrRepaint(); return !!ok;
  }, function(){ if (b) { b.disabled = false; b.textContent = '✓ Contacted'; } return false; });
}
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('[data-lw-done],[data-lw-clear],[data-lw-clearall]') : null; if (!t) return;
  e.preventDefault(); e.stopPropagation();
  if (!admin()) return;
  if (t.hasAttribute('data-lw-done')) { lrDone(t.getAttribute('data-lw-done'), t); return; }
  if (t.hasAttribute('data-lw-clear')) { lrClear([t.getAttribute('data-lw-clear')], false); return; }
  var v = t.getAttribute('data-lw-clearall');
  if (v === 'ask') { LR.ask = Date.now() + 15000; lrRepaint(); ST.call(W, lrRepaint, 15100); return; }
  LR.ask = 0;
  if (v === 'yes') { lrClear(list().map(function(z){ return z.l.id; }), true); return; }
  lrRepaint();
}, true);

/* ── the company filter never hides a lead at risk ── */""")
rep("""W._gcLeadWatch = { core: C, list: list,""", """W._gcLeadWatch = { core: C, list: list, clear: lrClear, contacted: lrDone, clearState: function(){ return { ask: LR.ask > Date.now(), local: Object.keys(LR.clr), done: Object.keys(LR.done), last: LR.last }; },   /* patch LEADRISK */""")

# 3. the Leads hub: its own ✅ Contacted and its saver, for the card
rep("""moveStage: moveStage, unassigned: unassignedCount,""", """moveStage: moveStage, markContacted: markContacted, patchLead: patchLead, unassigned: unassignedCount,""", block=False)

io.open(IDX, 'w', encoding='utf-8').write(t)
io.open(BLK, 'w', encoding='utf-8').write(b)
print('LEADRISK patched')
