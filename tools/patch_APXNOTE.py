#!/usr/bin/env python3
"""Idempotent patch APXNOTE: ✅ Approvals — "📝 Note" on every card and "✏️ Edit before sending" on every customer message
(owner 10/27: add notes and edit items in Approvals before they are sent).

  * 📝 Note (every card): a short internal note — never sent to the customer — saved with who / when in the shared
    approval notes (gc_approval_notes, the list window._gcRecordApprovalNote already keeps and syncs, decision "note").
    The latest notes show on the card for everyone who sees it (the PM too) and stay in the item's history.
  * ✏️ Edit before sending (every customer e-mail / text / portal post / invoice e-mail / appointment confirmation /
    statement / reminder waiting on the approvals list): opens the exact message (To, CC, subject, body, attachments) in
    the existing editor (window._gcAp2Preview, 💾 Save = the server's "edit"), so Approve sends the edited version.
    Where the card's ✏️ button opened the source record instead (estimate, invoice, change order, document, lead), both
    are offered. Usage: python3 tools/patch_APXNOTE.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch APXNOTE'
if MARK in src:
    print('APXNOTE: already patched'); sys.exit(0)
E = [
("""  if (r.edit) h += b('edit', r.edit.form ? { l: r.edit.l, f: function(){ EDIT = EDIT.key === r.key ? { key: '' } : { key: r.key }; fresh(); paintSoon(); } } : r.edit, 'ed');   /* patch INLINEAPPR: ✏️ the item itself */""",
 """  """ + MARK + """: a customer message waiting here can be edited before it goes (the existing message editor) */
  var sendEdit = r.src === 'queue' && typeof W._gcAp2Preview === 'function' && r.approve && !PEND[r.key];
  if (sendEdit && r.edit && !r.edit.form && /^✏️ Open (e-mail|text|post)$/.test(s(r.edit.l))) h += b('edit', { l: '✏️ Edit before sending', f: r.edit.f }, 'ed');
  else if (r.edit) { h += b('edit', r.edit.form ? { l: r.edit.l, f: function(){ EDIT = EDIT.key === r.key ? { key: '' } : { key: r.key }; fresh(); paintSoon(); } } : r.edit, 'ed');   /* patch INLINEAPPR: ✏️ the item itself */
    if (sendEdit) h += b('sendedit', { l: '✏️ Edit before sending', f: function(){ try { W._gcAp2Preview(r.id); } catch (e) { warn(e); } } }, 'ed'); }"""),
("""  if (r.approve && r.src !== 'pay' && denyTo(r) !== null) h += b('deny',""",
 """  h += b('note', { l: '📝 Note', f: function(){ NOTEBOX[r.key] = 1; fresh(); paintSoon(); later(function(){ var i = D.querySelector('[data-apx-note-in="' + cssq(r.key) + '"]'); if (i) try { i.focus(); } catch (e) {} }, 300); } }, 'op');   """ + MARK + """ */
  if (r.approve && r.src !== 'pay' && denyTo(r) !== null) h += b('deny',"""),
("""  if (r.approve && DENYBOX[r.key]) {""",
 """  if (NOTEBOX[r.key]) {   """ + MARK + """: the note box */
    return '<div class="apx-notebox" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;padding:8px;border:1px solid #c7d2fe;border-radius:9px;background:#f5f7ff">'
      + '<b style="width:100%;font-size:13px;color:#3730a3">📝 Note — for the team only (never sent to the customer)</b>'
      + '<input type="text" data-apx-note-in="' + esc(r.key) + '" value="' + esc(NOTEDRAFT[r.key] || '') + '" placeholder="e.g. Checked the amount with the sub" style="flex:1;min-width:220px;padding:7px 9px;border:1px solid #d1d5db;border-radius:7px;font:14px Arial">'
      + b('notego', { l: '💾 Save note', f: function(){ saveApxNote(r); } }, 'go') + b('notex', { l: 'Cancel', f: function(){ delete NOTEBOX[r.key]; fresh(); paintSoon(); } }, 'op') + '</div>';
  }
  if (r.approve && DENYBOX[r.key]) {"""),
("""    + (r.mine && !DONE[r.key] ? jobPickHtml(r) : '')""",
 """    + apxNotesHtml(r)   """ + MARK + """ */
    + (r.mine && !DONE[r.key] ? jobPickHtml(r) : '')"""),
("""var DENYBOX = {}, DREASON = {}, DENYC = { at: 0, open: {}, done: {} };""",
 """var DENYBOX = {}, DREASON = {}, DENYC = { at: 0, open: {}, done: {} };
""" + MARK + """: internal notes on a card (gc_approval_notes through window._gcRecordApprovalNote; decision "note") */
var NOTEBOX = {}, NOTEDRAFT = {};
function noteKeyOf(r){ return { t: 'apx-' + s(r.src), id: s(r.id) }; }
function apxNotes(r){ var k = noteKeyOf(r), l = []; try { l = typeof W._gcGetApprovalNotes === 'function' ? arr(W._gcGetApprovalNotes(k.t, k.id)) : []; } catch (e) {} return l.filter(function(n){ return n && s(n.note); }); }
function apxNotesHtml(r){ var l = apxNotes(r); if (!l.length) return '';
  return '<div class="apx-notes" style="font-size:12px;color:#3730a3;background:#eef2ff;border-radius:7px;padding:4px 8px;margin:4px 0">' + l.slice(-3).map(function(n){ return '📝 <b>' + esc(s(n.by)) + '</b> ' + esc(when(n.at)) + ': ' + esc(s(n.note).slice(0, 200)); }).join('<br>') + (l.length > 3 ? '<br><span style="color:#64748b">+ ' + (l.length - 3) + ' earlier</span>' : '') + '</div>'; }
function saveApxNote(r){
  var inp = D.querySelector('[data-apx-note-in="' + cssq(r.key) + '"]'), t = s((inp && inp.value) || NOTEDRAFT[r.key]);
  if (!t) { toast('Write the note first.'); return; }
  var k = noteKeyOf(r);
  try { if (typeof W._gcRecordApprovalNote === 'function') W._gcRecordApprovalNote(k.t, k.id, 'note', t.slice(0, 500)); else { toast('Notes are not ready yet — try again.'); return; } } catch (e) { warn(e); toast('Could not save the note.'); return; }
  delete NOTEBOX[r.key]; delete NOTEDRAFT[r.key]; fresh(); paintSoon(); toast('📝 Note saved — the team sees it on this card (never sent to the customer).');
}
D.addEventListener('input', function(ev){ var t = ev.target; if (t && t.getAttribute && t.hasAttribute('data-apx-note-in')) NOTEDRAFT[t.getAttribute('data-apx-note-in')] = t.value; }, true);
D.addEventListener('keydown', function(ev){ var t = ev.target; if (ev.key === 'Enter' && t && t.getAttribute && t.hasAttribute('data-apx-note-in')) { var g = t.parentNode && t.parentNode.querySelector('[data-apx-act$="|notego"]'); if (g) { ev.preventDefault(); g.click(); } } }, true);"""),
]
for a, b in E:
    assert src.count(a) == 1, ('APXNOTE find-string count != 1', src.count(a), a[:80])
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('APXNOTE: patched', path)
