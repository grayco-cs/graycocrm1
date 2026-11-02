#!/usr/bin/env python3
"""Idempotent patch INBOXLIST: Leads -> 📥 Lead Inbox becomes a compact list + a detail panel.

Owner (11/01): "don't like lead inbox being like this, I want to click and then it show that info from a list,
make it simpler."

* One ~44 px row per lead: type chip (SUB / PRIME / emergency / kind), project, GC / source, city, due (a colour dot,
  "Tue Nov 3 · 12 PM", red within 2 days), status (new / draft / on bid portal / bid job / assigned), assigned.
  Soonest due first, then newest (LD2's own sort); rows not opened yet on this device are bold.
  Phone: two lines per row (name + due; GC · city · type).
* A slim header (📥 Lead Inbox · N new · Checked … · ↻ Check now · ⚙ · fold); one search box + "Filters" that opens
  the five filters (same data-f selects, same saved choices).
* A row opens the lead's panel (right side on a desk, full screen under 900 px; ✕ / Esc / ‹ Back / the phone Back
  through patch NAV close it, ↑ / ↓ move between leads): chips, title, GC, address, due + ✏️ Fix; one row of the
  card's actions (Create bid job / Open bid job, Assign, Publish to bid portal, Not interested, ✉ E-mail, Merge);
  details (trades, bid #, scope, contact, due to, source, assigned); links de-duplicated (one per board; tracking,
  unsubscribe, homepages and the other RFP links under "More links"); "Why this due date" (the e-mail's words);
  the plans note; the drop zone. The panel element is a ".card[data-id]" so every block that works on inbox cards
  (LA's due editor, the sub portal's Upload plans, drag-and-drop) works on it unchanged.
* Rows are plain HTML built from the list (no per-lead work beyond a few string joins); the panel is built only for
  the open lead; parts of the inbox are only rewritten when their HTML changed.
* Kill switch: localStorage gc_ldi_cards = '1' -> the old card grid (renderCards, LD2's render as it was).

No server function changes. Usage: python3 tools/patch_INBOXLIST.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch INBOXLIST */'
if MARK in src:
    print('INBOXLIST: already patched'); sys.exit(0)
TAIL = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'inboxlist_tail.js'), encoding='utf-8').read()
assert '</script' not in TAIL

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('INBOXLIST anchor count != 1', n, old[:100])
    return s.replace(old, new)

# 1. LD2's render() stays as renderCards() (the kill switch); the list render goes in front of it
OLD = """var LDI_DIRTY = true, LDI_DRAWN = false, LDI_FORCE = false, LDI_LIM = 40;   /* patch LEADFREEZE-2: 40 cards at a time; nothing drawn while another Leads tab is showing */
function render(){
  var root = document.getElementById('gc-ldi'); if (!root || !root.isConnected) return;"""
NEW = """var LDI_DIRTY = true, LDI_DRAWN = false, LDI_FORCE = false, LDI_LIM = 40;   /* patch LEADFREEZE-2: 40 cards at a time; nothing drawn while another Leads tab is showing */
""" + MARK + """
""" + TAIL + """
function renderCards(){   /* patch INBOXLIST: LD2's card grid, kept for the kill switch */
  var root = document.getElementById('gc-ldi'); if (!root || !root.isConnected) return;"""
src = once(src, OLD, NEW)

# 2. the list's CSS joins LD2's
OLD = """function ensureCss(){ if (document.getElementById('gc-ldi-css')) return; var st = document.createElement('style'); st.id = 'gc-ldi-css'; st.textContent = CSS; document.head.appendChild(st); }"""
NEW = """function ensureCss(){ if (document.getElementById('gc-ldi-css')) return; var st = document.createElement('style'); st.id = 'gc-ldi-css'; st.textContent = CSS + (lxOff() ? '' : LX_CSS); document.head.appendChild(st); }   /* patch INBOXLIST: + LX_CSS */"""
src = once(src, OLD, NEW)

# 3. the click handler: a row / the panel's own controls; a row's id is on the row itself
OLD = """  var a = b.getAttribute('data-a'), cardEl = b.closest('.card'), id = cardEl && cardEl.getAttribute('data-id');
  e.preventDefault(); e.stopPropagation(); LDI_FORCE = true;   /* patch LEADFREEZE-2: a person's own action always draws */
  if (a === 'refresh') return pull(true);"""
NEW = """  var a = b.getAttribute('data-a'), cardEl = b.closest('.card'), id = cardEl ? cardEl.getAttribute('data-id') : b.getAttribute('data-id');   /* patch INBOXLIST: a row carries its id */
  e.preventDefault(); e.stopPropagation(); LDI_FORCE = true;   /* patch LEADFREEZE-2: a person's own action always draws */
  if (lxAct(a, id, b)) return;   /* patch INBOXLIST: open / close / ↑ ↓ / Filters / more rows */
  if (a === 'refresh') return pull(true);"""
src = once(src, OLD, NEW)

# 4. a filter change starts the list from the top again
OLD = """function onChange(e){ var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (!f) return; UI[f] = e.target.value; lsSet(K_UI, UI); LDI_LIM = 40; LDI_FORCE = true; render(); }"""
NEW = """function onChange(e){ var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (!f) return; UI[f] = e.target.value; lsSet(K_UI, UI); LDI_LIM = 40; LX.lim = 200; LDI_FORCE = true; render(); }   /* patch INBOXLIST: LX.lim */"""
src = once(src, OLD, NEW)

# 5. the search box (input) and the rows' keys
OLD = """    cur.addEventListener('click', onClick); cur.addEventListener('change', onChange);"""
NEW = """    cur.addEventListener('click', onClick); cur.addEventListener('change', onChange);
    cur.addEventListener('input', lxOnInput); cur.addEventListener('keydown', lxRowKey);   /* patch INBOXLIST */"""
src = once(src, OLD, NEW)

# 6. tests: the list's state and timings
OLD = """filtered: filtered, alertNew: alertNew }"""
NEW = """filtered: filtered, alertNew: alertNew, lx: function(){ return { open: LX.open, ids: LX.ids.slice(), q: LX.q, lim: LX.lim, t: Object.assign({}, LX.t), links: function(id){ var l = findLead(id); return l ? lxLinks(l) : null; } }; }, lxOpen: lxOpen, lxClose: lxClose }   /* patch INBOXLIST */"""
src = once(src, OLD, NEW)

open(path, 'w', encoding='utf-8').write(src)
print('INBOXLIST: patched')
