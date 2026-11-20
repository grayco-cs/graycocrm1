#!/usr/bin/env python3
"""patch SUBDOCDENY (owner 11/20): "✕ Deny" on the ✅ Approvals card "🛡 Sub COI / W-9 to confirm" (and 🧾 W-9) next to 📄 Read &
confirm / 📝 Note / 📄 The file. Deny asks why (Expired · Wrong company name · GrayCo not additional insured · Limits too low ·
Not a COI / wrong file · Other + text). On deny the file is marked rejected on the sub's record ({ rejected: { reason, by, at } },
kept, never deleted) and the approval closes; what that file alone had set on the record (coi / insExp / wcExp / w9 from a
sub-portal or bid-site upload nobody confirmed) is cleared, so compliance stays "needs COI" (pay-block rules unchanged); the
server closes its read and tells the sub (netlify/functions/_lib/subdocdeny.js via sub-doc-read act 'reject'): the sub portal's
Papers and the bid site's My Documents show "Rejected: <reason> — please upload a new one", plus an e-mail / text.
Edits patch COIAPPR (rows + the deny sheet), patch APX (the button), patch AUTAI (a rejected file is never offered again) in
place. Idempotent. Usage: python3 tools/patch_SUBDOCDENY.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
src = open(P, encoding='utf-8').read()

def rep(o, n, tag):
    global src
    if n in src: return
    assert src.count(o) == 1, ('SUBDOCDENY anchor', tag, src.count(o))
    src = src.replace(o, n)

# AUTAI: a rejected file is never offered again (this computer's scan of the sub records, and a slow server list)
rep("    if (f.aiRead || !/^sb:crm-files\\/[0-9a-f]{64}\\.(pdf|jpe?g|png|webp)$/i.test(s(f.ref)) || SEENDOC[f.ref]) return;\n    if (!/\\bcoi\\b|certificate",
    "    if (f.aiRead || f.rejected || !/^sb:crm-files\\/[0-9a-f]{64}\\.(pdf|jpe?g|png|webp)$/i.test(s(f.ref)) || SEENDOC[f.ref]) return;   /* patch SUBDOCDENY: f.rejected */\n    if (!/\\bcoi\\b|certificate",
    'AUTAI queue')
rep("    var waiting = arr(j.items).filter(function(w){ return !SEENDOC[w.ref]; });",
    "    var rjx = {}; subs().forEach(function(sb){ arr(sb.files).forEach(function(f){ if (f && f.rejected && f.ref) rjx[f.ref] = 1; }); });   /* patch SUBDOCDENY */\n"
    "    var waiting = arr(j.items).filter(function(w){ return !SEENDOC[w.ref] && !rjx[w.ref]; });",
    'AUTAI server list')

# APX: the button on the card
rep("denies on the click (reason optional, 10-s undo) */\n",
    "denies on the click (reason optional, 10-s undo) */\n  h += b('coideny', r.coiDeny, 'dn');   /* patch SUBDOCDENY: ✕ Deny on a sub COI / W-9 to confirm */\n",
    'APX button')

# COIAPPR: the read id + file id on each item, the button, the sheet
rep("      at: Date.parse(x.at || file.at || file.uploadedAt || 0) || 0, portal:",
    "      readId: /^sd_/.test(s(x.id)) ? s(x.id) : '', fileId: s(file.id),   /* patch SUBDOCDENY */\n      at: Date.parse(x.at || file.at || file.uploadedAt || 0) || 0, portal:",
    'COIAPPR item')
rep("      approve: { l: '📄 Read & confirm', f: function(){ open(it.ref); } }, open: null, doc: { l: '📄 The file', f: function(){ viewFile(it.ref); } }, edit: null, drop: 'td:' + it.id };",
    "      approve: { l: '📄 Read & confirm', f: function(){ open(it.ref); } }, open: null, doc: { l: '📄 The file', f: function(){ viewFile(it.ref); } }, edit: null, drop: 'td:' + it.id,\n"
    "      coiDeny: { l: '✕ Deny', f: function(){ denySheet(it); } } };   /* patch SUBDOCDENY */",
    'COIAPPR row')
DENY = r"""/* ── patch SUBDOCDENY: ✕ Deny — why, then the file is marked rejected (kept), the item closes, the sub is told (server) ── */
var DENY_WHY = [['expired', 'Expired'], ['name', 'Wrong company name'], ['addl', 'GrayCo is not listed as additional insured'], ['limits', 'Limits too low'], ['wrong', 'Not a COI / wrong file'], ['other', 'Other']];
function escH(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function myName(){ try { var e = myEmail(), u = users().filter(function(x){ return x && low(x.email) === e; })[0]; return s(u && u.name) || e; } catch (x) { return ''; } }
function dtoast(m){ try { var t = D.createElement('div'); t.textContent = m; t.setAttribute('data-gc-keep', '1'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fff;color:#1f2937;border:1px solid #d6dbe3;box-shadow:0 8px 24px rgba(15,23,42,.16);padding:10px 18px;border-radius:10px;z-index:100200;font:600 14px Inter,Arial'; D.body.appendChild(t); later(function(){ t.remove(); }, 3500); } catch (e) {} }
function denySheet(it){
  var old = D.getElementById('gc-coi-deny'); if (old) old.remove();
  var w9 = it.kind === 'w9', why = DENY_WHY.filter(function(r){ return !(w9 && (r[0] === 'addl' || r[0] === 'limits')); }).map(function(r){ return r[0] === 'wrong' && w9 ? ['wrong', 'Not a W-9 / wrong file'] : r; });
  var ov = D.createElement('div'); ov.id = 'gc-coi-deny'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gc-noac', '1'); ov.setAttribute('data-gcnav-ignore', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100050;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,Arial,sans-serif';
  ov.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Deny" style="background:#fff;color:#1f2937;border-radius:12px;max-width:460px;width:100%;padding:16px;box-shadow:0 12px 40px rgba(15,23,42,.25)">'
    + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:16px;color:#991b1b">✕ Deny — ' + escH((w9 ? 'W-9' : 'COI') + ' from ' + it.sub) + '</b><button type="button" data-dn="x" style="border:0;background:none;font-size:18px;cursor:pointer">✕</button></div>'
    + '<div style="font-size:12px;color:#6b7280;margin:4px 0 10px">' + escH(it.file) + '</div><div style="font-size:13px;font-weight:600;margin-bottom:6px">Why?</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px">' + why.map(function(r){ return '<button type="button" data-why="' + r[0] + '" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:999px;background:#fff;cursor:pointer;font:13px Inter,Arial">' + escH(r[1]) + '</button>'; }).join('') + '</div>'
    + '<input type="text" data-dn-txt maxlength="160" placeholder="More detail (needed for Other)" style="width:100%;box-sizing:border-box;margin-top:10px;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font:14px Inter,Arial">'
    + '<div style="font-size:12px;color:#6b7280;margin-top:8px">The sub sees “Rejected: <i>reason</i> — please upload a new one” in their portal, by e-mail and text. The file is kept on their record; their papers stay “needs ' + (w9 ? 'W-9' : 'COI') + '”.</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" data-dn="go" style="flex:1;padding:10px;border:0;border-radius:8px;background:#dc2626;color:#fff;font:700 14px Inter,Arial;cursor:pointer">✕ Deny</button><button type="button" data-dn="x" style="padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font:14px Inter,Arial">Cancel</button></div></div>';
  D.body.appendChild(ov);
  var pick = '';
  ov.addEventListener('click', function(e){
    var t = e.target; if (t === ov) { ov.remove(); return; }
    var c = t.closest && t.closest('[data-why],[data-dn]'); if (!c) return;
    if (c.hasAttribute('data-why')) { pick = c.getAttribute('data-why'); [].forEach.call(ov.querySelectorAll('[data-why]'), function(b){ var on = b === c; b.style.background = on ? '#fee2e2' : '#fff'; b.style.borderColor = on ? '#dc2626' : '#d1d5db'; b.style.fontWeight = on ? '700' : '400'; }); if (pick === 'other') try { ov.querySelector('[data-dn-txt]').focus(); } catch (x) {} return; }
    if (c.getAttribute('data-dn') === 'x') { ov.remove(); return; }
    var more = s(ov.querySelector('[data-dn-txt]').value), lab = (why.filter(function(r){ return r[0] === pick; })[0] || [])[1];
    var reason = pick === 'other' ? more : lab ? lab + (more ? ' — ' + more : '') : more;
    if (!reason) { dtoast(pick === 'other' ? 'Type what is wrong first.' : 'Pick why first.'); return; }
    ov.remove(); doDeny(it, reason);
  });
}
/* the record: the file marked rejected (kept); what only that unconfirmed file had set is cleared */
function rejectOn(x, it, rec){
  var y = Object.assign({}, x), hit = null, cleared = [];
  y.files = arr(x.files).map(function(f){ if (!f || s(f.ref) !== it.ref || hit) return f; hit = Object.assign({}, f, { rejected: rec }); return hit; });
  if (!hit) { hit = { id: 'RJ_' + it.id, ref: it.ref, name: it.file, kind: it.kind, cat: it.kind === 'w9' ? 'W-9' : 'COI', at: rec.at, by: rec.by, source: 'denied in Approvals', rejected: rec }; y.files = y.files.concat([hit]); }
  var exp = s(hit.exp), wc = /wc|workers/i.test(s(hit.sub) + ' ' + s(hit.label)), other = y.files.filter(function(f){ return f && f !== hit && !f.rejected && f.aiRead; });
  if (!hit.aiRead) {
    if (it.kind === 'w9') { if (y.w9 === true && !y.w9ReadAt && !s(y.taxId || y.ein) && !other.some(function(f){ return /w-?9/i.test(s(f.kind) + s(f.cat)); })) { y.w9 = false; cleared.push('w9'); } }
    else if (wc) { if (exp && s(y.wcExp) === exp) { delete y.wcExp; cleared.push('wcExp'); } if (y.wc === true && !s(y.wcExp)) { y.wc = false; cleared.push('wc'); } }
    else {
      ['insExp', 'coiExp', 'glExp'].forEach(function(k){ if (exp && s(y[k]) === exp && !y.coiReadAt) { delete y[k]; cleared.push(k); } });
      if (y.coi === true && !y.coiReadAt && !s(y.insExp) && !other.some(function(f){ return /coi|insurance/i.test(s(f.kind) + s(f.cat)); })) { y.coi = false; cleared.push('coi'); }
    }
  }
  if (cleared.length) hit.rejected = Object.assign({}, rec, { cleared: cleared });
  return { y: y, file: hit };
}
function doDeny(it, reason){
  var rec = { reason: reason, by: myName(), at: new Date().toISOString() }, file = null;
  if (typeof W._setSubs !== 'function') { dtoast('The sub list is not ready on this screen — open Subs and try again.'); return false; }
  W._setSubs(function(list){ return (list || []).map(function(x){ if (!x || String(x.id) !== String(it.subId)) return x; var r = rejectOn(x, it, rec); file = r.file; return r.y; }); });
  try { var a = A(); if (a && a.dropSubDoc) a.dropSubDoc(it.ref, true); } catch (e) { warn(e); }
  try { W._gcPushAll && later(W._gcPushAll, 800); } catch (e) {}
  fresh();
  var body = { act: 'reject', id: it.readId, ref: it.ref, subId: it.subId, kind: it.kind, reason: reason, fileId: s(file && file.id) || it.fileId, fileName: it.file };
  W.fetch('/.netlify/functions/sub-doc-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(r){ return r.json(); }).then(function(j){
    var told = j && (j.mailed || j.texted) ? ' — ' + it.sub + ' was told' + (j.mailed && j.texted ? ' by e-mail and text' : j.mailed ? ' by e-mail' : ' by text') : ' — ' + it.sub + ' sees it in their portal';
    dtoast('✕ Denied' + told + '.');
  }, function(e){ warn(e); dtoast('✕ Denied here — the sub could not be told yet (no connection).'); });
  dtoast('✕ Denied — ' + reason);
  return true;
}
"""
rep("var sig = '';\nfunction fresh(){", DENY + "var sig = '';\nfunction fresh(){", 'COIAPPR deny sheet')
rep("W._gcCoiAppr = { items: items, rows: function(){ return rows({ kind: 'admin' }); }, open: open, canSee: canSee };",
    "W._gcCoiAppr = { items: items, rows: function(){ return rows({ kind: 'admin' }); }, open: open, canSee: canSee, deny: doDeny, denySheet: denySheet, rejectOn: rejectOn };   /* patch SUBDOCDENY */",
    'COIAPPR api')
# COIAPPR's merge guard: a rejected mark survives every sync merge too (like the read mark)
rep("    arr(r.files).forEach(function(f){ var k = fileKey(f); if (k && f.aiRead) { var id = s(r.id); (m[id] = m[id] || {})[k] = f; } });",
    "    arr(r.files).forEach(function(f){ var k = fileKey(f); if (k && (f.aiRead || f.rejected)) { var id = s(r.id), o = (m[id] = m[id] || {}); o[k] = Object.assign({}, o[k] || {}, f); } });   /* patch SUBDOCDENY: + rejected */",
    'merge marks')
rep("    var ch = false, files = r.files.map(function(f){ var k = fileKey(f), g = k && mk[k]; if (!g || !f || f.aiRead) return f; ch = true; return Object.assign({}, f, { aiRead: g.aiRead, readBy: g.readBy, readAt: g.readAt }); });",
    "    var ch = false, files = r.files.map(function(f){ var k = fileKey(f), g = k && mk[k]; if (!g || !f || ((f.aiRead || !g.aiRead) && (f.rejected || !g.rejected))) return f; ch = true; var o = Object.assign({}, f); if (g.aiRead && !f.aiRead) { o.aiRead = g.aiRead; o.readBy = g.readBy; o.readAt = g.readAt; } if (g.rejected && !f.rejected) o.rejected = g.rejected; return o; });   /* patch SUBDOCDENY: + rejected */",
    'merge keep')
open(P, 'w', encoding='utf-8').write(src); print('SUBDOCDENY applied')
