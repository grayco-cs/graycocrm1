#!/usr/bin/env python3
# patch_ADDEDIT.py <index.html> — owner 11/23: "I need to be able to edit an addendum there too".
# 🏗 Bid portal → 📂 Manage → 📎 Addenda: ✎ Edit on each posted addendum (title, date, what changed, files +/−, the bid due date, an
# optional e-mail that waits on ✅ Approvals) through bid-hub op addendumedit; "✎ Updated <date>", "📅 Now due: <date>" when the job's
# due date moved after the addendum, the edit history (who, when, the old text and files — a file taken off stays there), and an
# acknowledgement made before the edit counts as "not yet" again. Each anchor must match exactly once. Idempotent (marker ADDEDIT-1).
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'index.html')
t = open(P, encoding='utf-8').read()
MARK = '/* patch ADDEDIT-1: '

EDITS = [
 # the acknowledgements line: one made before the addendum's last edit is "before the update" (not yet again)
 ("""function audienceAcks(num){
  var r = M.data, ack = arr(r.acks).filter(function(k){ return Number(k.num) === Number(num); });""",
  """function audienceAcks(num, ad){   """ + MARK + """ad = the addendum; an acknowledgement older than its last edit is "before the update" */
  var r = M.data, upd = s(ad && ad.updatedAt), ack0 = arr(r.acks).filter(function(k){ return Number(k.num) === Number(num); });
  var ack = ack0.filter(function(k){ return !upd || s(k.at) >= upd; }), stale = ack0.filter(function(k){ return upd && s(k.at) < upd; });"""),
 ("""    + (not.length ? ' · <span>not yet: ' + not.slice(0, 12).map(function(x){ return esc(x.company || x.name || x.email); }).join(', ') + (not.length > 12 ? '…' : '') + '</span>' : '') + '</div>';
}""",
  """    + (not.length ? ' · <span>not yet: ' + not.slice(0, 12).map(function(x){ return esc(x.company || x.name || x.email); }).join(', ') + (not.length > 12 ? '…' : '') + '</span>' : '')
    + (stale.length ? ' · <span data-acks-stale="' + num + '">acknowledged before the update (asked again): ' + stale.map(function(k){ return esc(k.userCompany || k.userName); }).join(', ') + '</span>' : '') + '</div>';
}
/* patch ADDEDIT: ✎ Edit a posted addendum */
var AE = null;   /* { num, files } — the addendum being edited */
function addEditHtml(a){
  var n = a.num, j = job();
  return '<div class="card" data-addedit="' + n + '" style="background:#fffbeb"><b>✎ Edit addendum #' + n + '</b>'
    + '<div class="row"><input type="text" data-k="aetitle' + n + '" value="' + esc(a.title || '') + '" placeholder="Title" style="flex:1;min-width:220px"><label>Date <input type="date" data-k="aedate' + n + '" value="' + esc(a.date || '') + '"></label></div>'
    + '<textarea data-k="aetext' + n + '" placeholder="What changed">' + esc(a.text || '') + '</textarea>'
    + '<div class="mut">📎 ' + (AE.files.length ? AE.files.map(function(f, i){ return esc(f.name) + ' <button type="button" class="b" data-a="aerm" data-i="' + i + '" title="Take it off (it stays in the history)">✕</button>'; }).join(' ') : 'no files')
    + ' <button type="button" class="b" data-a="aepick">📎 Add files</button></div>'
    + '<div class="row"><label>Change the bid due date (optional — now ' + esc(s(j.due) ? s(j.due) + (s(j.dueTime) ? ' ' + s(j.dueTime) : '') : 'none') + ') <input type="date" data-k="aedue' + n + '"></label>'
    + '<label><input type="checkbox" data-k="aenotify' + n + '"> E-mail the subs about the update (waits on ✅ Approvals)</label></div>'
    + '<div class="row"><button type="button" class="b pri" data-a="aesave">💾 Save addendum #' + n + '</button><button type="button" class="b" data-a="aecancel">Cancel</button></div></div>';
}
function addHistHtml(a){
  var h = arr(a.history); if (!h.length) return '';
  var now = {}; arr(a.files).forEach(function(f){ now[s(f.fileRef || f.name)] = 1; });
  return '<details data-addhist="' + a.num + '"><summary class="mut">History (' + h.length + ')</summary>' + h.slice().reverse().map(function(x){
    return '<div class="mut" style="border-top:1px solid #e5e7eb;padding-top:4px;margin-top:4px"><b>Before the edit of ' + esc(when(x.replacedAt)) + '</b> · ' + esc(x.replacedByName || x.replacedBy) + ' · ' + esc(arr(x.changed).join(' · '))
      + (x.title ? '<div>' + esc(x.title) + '</div>' : '') + (x.dueTo ? '<div>⏰ ' + esc(x.dueTo) + '</div>' : '') + (x.text ? '<div style="white-space:pre-wrap">' + esc(x.text) + '</div>' : '')
      + (arr(x.files).length ? '<div>📎 ' + arr(x.files).map(function(f){ return esc(f.name) + (now[s(f.fileRef || f.name)] ? '' : ' (taken off)'); }).join(', ') + '</div>' : '') + '</div>'; }).join('') + '</details>';
}"""),
 # the card: ✎ Edit, Updated, Now due, the history, the edit form
 ("""  return ad.map(function(a){ return '<div class="card" data-addendum="' + a.num + '"><div class="row"><b>Addendum #' + a.num + (a.title ? ' — ' + esc(a.title) : '') + '</b><span class="mut">' + esc(a.date) + '</span>' + noticeTag(a.notice)""",
  """  var jd = job(), dd0 = s(jd.due || jd.bidDueDate), dt0 = s(jd.due ? jd.dueTime : jd.bidDueTime), curDue = dd0 ? dd0 + (dt0 ? ' ' + dt0 : '') : '';   /* 📂 Manage's job: due / dueTime */
  return ad.map(function(a){ return '<div class="card" data-addendum="' + a.num + '"><div class="row"><b>Addendum #' + a.num + (a.title ? ' — ' + esc(a.title) : '') + '</b><span class="mut">' + esc(a.date) + '</span>' + noticeTag(a.notice)
      + (a.publishedAt && !(AE && AE.num === a.num) ? '<button type="button" class="b" data-a="aedit" data-n="' + a.num + '">✎ Edit</button>' : '')   /* patch ADDEDIT */"""),
 ("""      + (a.dueTo ? '<div style="color:#b91c1c;font-weight:700">⏰ Bid due changed to ' + esc(a.dueTo) + (a.dueFrom ? ' (was ' + esc(a.dueFrom) + ')' : '') + '</div>' : '')
      + (a.text ? '<div style="white-space:pre-wrap">' + esc(a.text) + '</div>' : '') + (arr(a.files).length ? '<div class="mut">📎 ' + arr(a.files).map(function(f){ return esc(f.name); }).join(', ') + '</div>' : '') + audienceAcks(a.num) + '</div>'; }).join('')""",
  """      + (a.updatedAt ? '<div class="mut" data-addupd="' + a.num + '" style="font-weight:700">✎ Updated ' + esc(when(a.updatedAt)) + (a.updatedBy ? ' · ' + esc(a.updatedBy) : '') + '</div>' : '')
      + (a.dueTo ? '<div style="color:#b91c1c;font-weight:700">⏰ Bid due changed to ' + esc(a.dueTo) + (a.dueFrom ? ' (was ' + esc(a.dueFrom) + ')' : '') + '</div>' : '')
      + (a.dueTo && curDue && s(a.dueTo) !== curDue ? '<div data-nowdue="' + a.num + '" style="color:#15803d;font-weight:700">📅 Now due: ' + esc(curDue) + '</div>' : '')
      + (a.text ? '<div style="white-space:pre-wrap">' + esc(a.text) + '</div>' : '') + (arr(a.files).length ? '<div class="mut">📎 ' + arr(a.files).map(function(f){ return esc(f.name); }).join(', ') + '</div>' : '') + audienceAcks(a.num, a)
      + (AE && AE.num === a.num ? addEditHtml(a) : '') + addHistHtml(a) + '</div>'; }).join('')"""),
 # the clicks
 ("""  if (a === 'post') {
    var tg = val('utarget') || 'all',""",
  """  if (a === 'aedit') { var an = +t.getAttribute('data-n'), ao = arr(job().addenda).find(function(x){ return Number(x.num) === an; }); if (!ao) return; AE = { num: an, files: arr(ao.files).map(function(f){ return { name: f.name, size: f.size, type: f.type, fileRef: f.fileRef }; }) }; return draw(); }   /* patch ADDEDIT */
  if (a === 'aecancel') { AE = null; return draw(); }
  if (a === 'aerm') { if (AE) AE.files.splice(+t.getAttribute('data-i'), 1); return draw(); }
  if (a === 'aepick') return pickFiles(function(fs){ if (!fs.length || !AE) return; var keep = AE; toast('Uploading ' + fs.length + ' file' + (fs.length === 1 ? '' : 's') + '…');
    Promise.all(fs.map(function(f){ return putFile(f).then(function(ref){ return { name: f.name, size: f.size, type: f.type || '', fileRef: ref }; }, function(e){ toast(e.message, true); return null; }); })).then(function(l){ keep.files = keep.files.concat(l.filter(Boolean)); draw(); }); }, ACCEPT_ALL);
  if (a === 'aesave') { if (!AE) return; var en = AE.num, ed = val('aedue' + en);
    if (!W.confirm('Save addendum #' + en + '?' + (ed ? '\\n\\nThe bid due date changes to ' + ed + '.' : '') + '\\n\\nSubs who acknowledged it are asked to acknowledge it again.' + (val('aenotify' + en) ? '\\n\\nThe e-mail to the subs waits on ✅ Approvals.' : ''))) return;
    return post({ op: 'addendumedit', num: en, title: val('aetitle' + en), date: val('aedate' + en), text: val('aetext' + en), files: AE.files, newDue: ed, notify: !!val('aenotify' + en) }, t, function(r){ AE = null; toast(r.unchanged ? 'Nothing changed' : '✎ Addendum #' + en + ' updated' + (r.notice && r.notice.status === 'held' ? ' — e-mail held (data-entry mode)' : r.notice && r.notice.status === 'waiting' ? ' — e-mail waits on Approvals' : '')); }); }
  if (a === 'post') {
    var tg = val('utarget') || 'all',"""),
]

if MARK not in t:
  for a, b in EDITS:
    n = t.count(a)
    if n != 1: sys.exit('ADDEDIT: expected 1 match, found %d: %s' % (n, a[:90]))
    t = t.replace(a, b)
  open(P, 'w', encoding='utf-8').write(t)
  print('ADDEDIT applied: %d edits' % len(EDITS))
else:
  print('ADDEDIT already applied')
