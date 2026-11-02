#!/usr/bin/env python3
"""Idempotent patch APPRMENTION: @someone on the team in an approval card's note.

Owner: "be able to @someone on the team" in the card's "📝 Note — for the team only (never sent to the customer)" box.

 * Typing @ in the note box opens a small list of the active team (Admin -> Employees: the CRM's people list). It
   narrows as you type (first or last name), ↑/↓ + Enter (or Tab) pick, Esc closes, a tap picks on a phone. It puts
   "@First Last" in the note. Never a customer or a sub: a person whose role says sub / customer / vendor, or whose
   e-mail is on the Customers or Subs list, is left out, and so is anyone switched off.
 * Save note: each person named gets ONE To-Do (the same channel the GrayCo Photos chat @mentions use: gc_office_tasks,
   kind 'mention', for that person only; it syncs to every device) -- "💬 Wesley mentioned you on: Sub invoice —
   Farrell Calhoun · $129.94", with the note under it and a "📋 Open the card" button that opens Approvals at that card
   (or says it was already decided). Not the author. Staff only; nothing goes to a customer (CUSTQUIET does not apply:
   notes are team-only). No phone push / e-mail: staff @mentions elsewhere in the CRM (job chat) are To-Do only, and
   the server's staff push is not callable from a page.
 * The card's notes show each "@Name" of the team as a chip.
 * Only the approval note box: the job Messages composer is a different component (it already turns "@Jane" typed by
   hand into a mention).
Console: _gcApprMention.staff(), _gcApprMention.parse(text), _gcApprOpenCard(key)
Usage: python3 tools/patch_APPRMENTION.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch APPRMENTION'
if MARK in t:
    print('APPRMENTION: already patched'); sys.exit(0)

def rep(name, old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, 'APPRMENTION %s: expected %d, found %d' % (name, count, n)
    t = t.replace(old, new)

JS = r'''
/* patch APPRMENTION — @someone on the team in a card's note: the @ list, the mention To-Do, opening the card */
var MN = { key: '', at: -1, q: '', i: 0, list: [] }, MNHL = { k: '', until: 0 };
function mnFirst(n){ return s(n).split(/\s+/)[0] || s(n); }
function mnOut(){ var o = {}; [crm().customers, crm().subs, crm().vendors].forEach(function(l){ arr(l).forEach(function(c){ if (!c) return; [c.email, c.email2, c.contactEmail, c.billingEmail].forEach(function(e){ e = low(e); if (e) o[e] = 1; }); }); }); return o; }
/* the team: active people on the CRM's people list -- never a customer, a sub or a vendor */
function mnStaff(){
  var out = [], seen = {}, ext = mnOut();
  users().forEach(function(u){
    if (!u || u.active === false || u.disabled === true || u.terminated || u.letGo || /^(inactive|terminated|disabled|former|let go)$/i.test(s(u.status))) return;
    var nm = s(u.name), em = low(u.email), rl = s(u.role) + ' ' + s(u.type) + ' ' + s(u.profile);
    if (!nm || /\b(sub|subcontractor|customer|client|vendor|supplier|homeowner)\b/i.test(rl) || u.isCustomer || u.isSub || (em && ext[em])) return;
    var k = low(nm); if (seen[k]) return; seen[k] = 1;
    out.push({ n: nm, e: em, r: s(u.role) });
  });
  return out.sort(function(a, b){ return a.n.localeCompare(b.n); });
}
function mnMatch(q){
  q = low(q).replace(/\s+/g, ' ');
  return mnStaff().filter(function(x){ var n = low(x.n); if (!q) return true; if (n.indexOf(q) === 0) return true; return n.split(/\s+/).some(function(w){ return w.indexOf(q) === 0; }); }).slice(0, 8);
}
/* who a note names: "@First Last" (what the list puts in), or "@First" when only one person has that first name */
function mnParse(text){
  var t = ' ' + low(text) + ' ', st = mnStaff(), out = [], seen = {};
  st.forEach(function(x){
    var full = '@' + low(x.n), f = '@' + low(mnFirst(x.n)), hit = false, i = t.indexOf(full);
    if (i >= 0 && !/[a-z0-9]/.test(t.charAt(i + full.length))) hit = true;
    if (!hit) { var j = t.indexOf(f); if (j >= 0 && !/[a-z0-9]/.test(t.charAt(j + f.length)) && st.filter(function(y){ return low(mnFirst(y.n)) === low(mnFirst(x.n)); }).length === 1) hit = true; }
    if (hit && !seen[low(x.n)]) { seen[low(x.n)] = 1; out.push(x); }
  });
  return out;
}
function mnBox(){ return D.getElementById('apx-mn'); }
function mnClose(){ var b = mnBox(); if (b) b.remove(); MN.key = ''; MN.at = -1; MN.list = []; }
function mnInput(){ return MN.key ? D.querySelector('[data-apx-note-in="' + cssq(MN.key) + '"]') : null; }
function mnDraw(el){
  var b = mnBox();
  if (!MN.list.length) { if (b) b.remove(); return; }
  if (!b) { b = D.createElement('div'); b.id = 'apx-mn'; b.setAttribute('data-gc-keep', '1'); b.setAttribute('role', 'listbox'); b.setAttribute('aria-label', 'Mention someone on the team');
    b.style.cssText = 'position:fixed;z-index:2147483000;background:#fff;border:1px solid #c7d2fe;border-radius:9px;box-shadow:0 10px 28px rgba(15,23,42,.22);min-width:220px;max-width:92vw;max-height:260px;overflow:auto;font:14px Arial,sans-serif;color:#1e1b4b';
    b.addEventListener('mousedown', function(ev){ ev.preventDefault(); });   /* the note box keeps the focus */
    b.addEventListener('click', function(ev){ var o = ev.target.closest && ev.target.closest('[data-apx-mn-i]'); if (!o) return; ev.preventDefault(); ev.stopPropagation(); mnPick(+o.getAttribute('data-apx-mn-i')); });
    D.body.appendChild(b); }
  b.innerHTML = '<div style="padding:6px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #eef2ff">Mention someone on the team</div>' + MN.list.map(function(x, i){
    return '<button type="button" role="option" data-apx-mn-i="' + i + '" aria-selected="' + (i === MN.i) + '" style="display:flex;justify-content:space-between;gap:10px;width:100%;border:0;background:' + (i === MN.i ? '#eef2ff' : '#fff') + ';padding:9px 10px;text-align:left;cursor:pointer;font:14px Arial;min-height:40px;color:#1e1b4b"><b>@' + esc(x.n) + '</b><span style="color:#64748b;font-size:12px">' + esc(x.r) + '</span></button>'; }).join('');
  var r = el.getBoundingClientRect(), h = Math.min(260, b.offsetHeight || 200);
  b.style.left = Math.max(8, Math.min(r.left, W.innerWidth - b.offsetWidth - 8)) + 'px';
  b.style.top = (r.bottom + 4 + h > W.innerHeight && r.top > h + 8 ? r.top - h - 4 : r.bottom + 4) + 'px';
}
function mnScan(el){
  var key = el.getAttribute('data-apx-note-in'), v = el.value || '', c = typeof el.selectionStart === 'number' ? el.selectionStart : v.length;
  var m = /(^|[\s(])@([A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*)?)?$/.exec(v.slice(0, c));
  if (!m) { mnClose(); return; }
  var q = m[2] || '', list = mnMatch(q);
  if (!list.length && / /.test(q)) { mnClose(); return; }
  if (MN.key !== key || MN.q !== q) MN.i = 0;
  MN.key = key; MN.at = c - q.length - 1; MN.q = q; MN.list = list; if (MN.i >= list.length) MN.i = 0;
  mnDraw(el);
}
function mnPick(i){
  var el = mnInput(), x = MN.list[i]; if (!el || !x || MN.at < 0) { mnClose(); return; }
  var v = el.value || '', c = typeof el.selectionStart === 'number' ? el.selectionStart : v.length, ins = '@' + x.n + ' ';
  var nv = v.slice(0, MN.at) + ins + v.slice(c).replace(/^\s+/, ''), pos = MN.at + ins.length;
  mnClose();
  el.value = nv; NOTEDRAFT[el.getAttribute('data-apx-note-in')] = nv;
  try { el.focus(); el.setSelectionRange(pos, pos); } catch (e) {}
}
D.addEventListener('input', function(ev){ var t = ev.target; if (t && t.getAttribute && t.hasAttribute('data-apx-note-in')) mnScan(t); }, true);
D.addEventListener('click', function(ev){ var t = ev.target; if (!mnBox()) return; if (t && t.closest && (t.closest('#apx-mn') || (t.hasAttribute && t.hasAttribute('data-apx-note-in')))) { if (t.hasAttribute && t.hasAttribute('data-apx-note-in')) mnScan(t); return; } mnClose(); }, true);
/* the window sees the key before the note box's own Enter (= Save note) */
W.addEventListener('keydown', function(ev){
  var t = ev.target; if (!mnBox() || !MN.list.length || !t || !t.getAttribute || !t.hasAttribute('data-apx-note-in')) return;
  var k = ev.key;
  if (k === 'ArrowDown' || k === 'ArrowUp') { MN.i = (MN.i + (k === 'ArrowDown' ? 1 : -1) + MN.list.length) % MN.list.length; mnDraw(t); }
  else if (k === 'Enter' || k === 'Tab') mnPick(MN.i);
  else if (k === 'Escape') mnClose();
  else return;
  ev.preventDefault(); ev.stopImmediatePropagation();
}, true);
/* Save note: one To-Do per person named (not me) -- the GrayCo Photos chat's @mention channel */
function mnTitle(r){ var t = s(r.title), k = s(r.kindL); return (k && low(t).indexOf(low(k)) !== 0 ? k + ' — ' : '') + t + (r.amount ? ' · ' + money(r.amount) : ''); }
function mnNotify(r, text){
  var who = mnParse(text), me = low(myName()), em = myEmail();
  who = who.filter(function(x){ return low(x.n) !== me && (!x.e || x.e !== em); });
  if (!who.length) return [];
  var list = lsList('gc_office_tasks'), at = new Date().toISOString(), base = 'apxmn_' + Date.now().toString(36), by = myName() || 'Someone', added = [];
  who.forEach(function(x){
    var id = base + '_' + low(x.e || x.n).replace(/[^a-z0-9]/g, '');
    if (list.some(function(t){ return t && t.id === id; })) return;
    list.push({ id: id, kind: 'mention', label: '💬 ' + mnFirst(by) + ' mentioned you on: ' + mnTitle(r), note: s(text).slice(0, 300), addedBy: by, addedAt: at, updatedAt: at, done: false,
      assignee: x.n, forUser: x.e || x.n, apxKey: s(r.key), pid: s(r.pid), source: 'Approvals' });
    added.push(x.n);
  });
  if (!added.length) return [];
  try { localStorage.setItem('gc_office_tasks', JSON.stringify(list)); } catch (e) { warn(e); return []; }
  try { if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (W._gcSyncQ && W._gcSyncQ.add) W._gcSyncQ.add('gc_office_tasks', list); } catch (e) { warn(e); }
  return added;
}
/* the card's notes: each "@Name" of the team as a chip */
function mnChips(h){
  try { mnStaff().forEach(function(x){ var e = esc('@' + x.n); h = h.split(e).join('<span class="apx-mnc" style="background:#c7d2fe;color:#1e1b4b;border-radius:9px;padding:0 6px;font-weight:700">' + e + '</span>'); }); } catch (e) {}
  return h;
}
/* the To-Do's "📋 Open the card": Approvals, at that card (the list that holds it), outlined for a moment */
W._gcApprOpenCard = function(key){
  key = s(key); var r = null; try { fresh(); r = rowByKey(key); } catch (e) {}
  if (!r) { open(''); later(function(){ toast('That card is not waiting any more — it was approved, denied or sent.'); }, 400); return false; }
  UI.job = UI.kind = UI.pm = '';
  var f = r.mine ? '' : r.pmOpt ? 'pmopt' : 'all'; UI.f = f;
  var i = -1; try { i = filtered(scope(), build().rows).map(function(x){ return x.key; }).indexOf(key); } catch (e) {}
  UI.lim = Math.max(UI.lim || 25, i + 1);
  open(f);
  MNHL = { k: key, until: Date.now() + 6000 };   /* the card is drawn outlined (every repaint) for 6 s */
  var n = 0; (function find(){ var el = D.querySelector('.apx-list [data-k="' + cssq(key) + '"]'); if (el) { try { el.scrollIntoView({ block: 'center' }); } catch (e) {} return; } if (++n < 24) later(find, 250); })();
  return true;
};
W._gcApprMention = { staff: mnStaff, parse: mnParse, match: mnMatch };
'''

# 1. the @ list + the To-Do + open the card (in the Approvals module, next to the note box's own listeners)
rep('apx-note-input',
    "D.addEventListener('input', function(ev){ var t = ev.target; if (t && t.getAttribute && t.hasAttribute('data-apx-note-in')) NOTEDRAFT[t.getAttribute('data-apx-note-in')] = t.value; }, true);",
    "D.addEventListener('input', function(ev){ var t = ev.target; if (t && t.getAttribute && t.hasAttribute('data-apx-note-in')) NOTEDRAFT[t.getAttribute('data-apx-note-in')] = t.value; }, true);"
    + JS.replace('/* patch APPRMENTION', MARK, 1))
# 2. Save note tells the people named
rep('apx-note-save',
    "  delete NOTEBOX[r.key]; delete NOTEDRAFT[r.key]; fresh(); paintSoon(); toast('📝 Note saved — the team sees it on this card (never sent to the customer).');",
    "  var mnd = []; try { mnd = mnNotify(r, t.slice(0, 500)); } catch (e) { warn(e); }   " + MARK + ": each person named gets one To-Do */ mnClose();\n"
    "  delete NOTEBOX[r.key]; delete NOTEDRAFT[r.key]; fresh(); paintSoon(); toast('📝 Note saved — the team sees it on this card (never sent to the customer).' + (mnd.length ? ' ' + mnd.join(', ') + (mnd.length === 1 ? ' was' : ' were') + ' told.' : ''));")
# 3. the card's notes: @Name chips
rep('apx-note-chips',
    "l.slice(-3).map(function(n){ return '📝 <b>' + esc(s(n.by)) + '</b> ' + esc(when(n.at)) + ': ' + esc(s(n.note).slice(0, 200)); })",
    "l.slice(-3).map(function(n){ return '📝 <b>' + esc(s(n.by)) + '</b> ' + esc(when(n.at)) + ': ' + mnChips(esc(s(n.note).slice(0, 200))); })   " + MARK + ": @Name chips */")
# 4. the card opened from a mention is drawn outlined for a few seconds
rep('apx-row-hl',
    "return '<div class=\"apx-row' + (r.escalated ? ' esc' : '') + (r.mine ? ' mine' : '') + (PEND[r.key] || DONE[r.key] ? ' done' : '') + '\" data-k=\"' + esc(r.key) + '\">'",
    "return '<div class=\"apx-row' + (r.escalated ? ' esc' : '') + (r.mine ? ' mine' : '') + (PEND[r.key] || DONE[r.key] ? ' done' : '') + '\" data-k=\"' + esc(r.key) + '\"' + (MNHL.k === r.key && Date.now() < MNHL.until ? ' data-apx-hl=\"1\" style=\"outline:3px solid #6366f1;outline-offset:2px\"' : '') + '>'   " + MARK + ": the card a mention opened */")
# 5. the To-Do: a mention from a card opens the card
rep('todo-act',
    "      else if (t.kind === 'mention') o.act = { l: '💬 Reply', f: function(){",
    "      else if (t.kind === 'mention' && t.apxKey) o.act = { l: '📋 Open the card', f: function(){ if (!call('_gcApprOpenCard', t.apxKey)) go('approvals'); } };   " + MARK + ": a mention on an approval card */\n"
    "      else if (t.kind === 'mention') o.act = { l: '💬 Reply', f: function(){")

open(p, 'w', encoding='utf-8').write(t)
print('APPRMENTION: patched')
