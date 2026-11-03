#!/usr/bin/env python3
r"""Idempotent patch ADMDISMISS (owner 11/02, ⚙ Admin: "I deleted this stuff and it's back").
1. A ✕ on a card at the top of ⚙ Admin STAYS dismissed: saved per person in the cloud (gc_kv "gc_adm_dismiss__<e-mail>",
   a card key + the card's content), so it survives reloads, other computers and sync. It comes back only when the card's
   CONTENT changes (a new failing invoice, something new in the data check, a different pair on one e-mail…). "🔕 7 days"
   next to ✕; "🔕 N hidden" under the cards brings one back. ONE helper (tools/admdismiss.js, window._gcAdmDismiss) for
   every card there: patch ADM's warnings + every window._gcAdmExtraWarnings generator. (Before: patch ADM kept the ✕
   in memory only — "Hide until the page is reloaded".) DATAFULL's 🧾 Missing job data banner is left alone (patch
   TOPBAR moves it to the To-Do).
2. No duplicate data-check cards: with the 🧾 Missing job data board (DATAFULL) on, the old nightly card ("🧹 Last night's
   data check found 150 things to fix") is not shown — only possible duplicate customers stay as a card — and its
   "Open list" (also the Office To-Do item's) opens the board.
3. The sub pay check reads the invoice's SUB FIELD (subId → the Subs list, then the typed sub name), never the file name:
   an uploaded sub invoice starts with sub = its file name ("invoice-22902" from invoice-22902.pdf). No sub set →
   "Pick the sub". A name not on the Subs list gets "＋ Add to Subs list" / "Mark as supplier" (SUPPLIERPAY's rule) on its
   card — each only on a person's click, after a confirm.
4. ⚙ Admin rows that were still navy with gold buttons (🗓 Schedule templates, 🗄 Year-end archive, 📬 Mail received, any
   other navy patch row there) get the white card style; the Schedule templates row says "picked by a person" (SCHEDPICK).
Nothing else is changed. Usage: python3 tools/patch_ADMDISMISS.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch ADMDISMISS */'

EDITS = []
def edit(tag, old, new):
    assert MARK in new, ('ADMDISMISS: edit without the marker', tag)
    EDITS.append((tag, old, new))

# ── patch ADM: the dismissal helper in paintTop, 🔕 7 days, the hidden list, the click handler ──
edit('ADM: which cards show',
"""  var ws = warnings().filter(function(w){ return !UI.dismissed[w.id + ':' + w.key]; });""",
"""  """ + MARK + """ var AD = W._gcAdmDismiss;   /* a ✕ is kept per person in the cloud; the card comes back only when its content changes */
  var wall = warnings().map(function(w){ return Object.assign({ level: 'amber' }, w, { fixes: Array.isArray(w.fixes) ? w.fixes : [], text: w.text == null ? '' : String(w.text) }); }).filter(function(w){ return !UI.dismissed[w.id + ':' + w.key]; });
  var whid = AD ? wall.filter(function(w){ try { return AD.hidden(w); } catch (e) { return false; } }) : [];
  var ws = wall.filter(function(w){ return whid.indexOf(w) < 0; });
  var hidList = whid.map(function(w){ return { key: AD.keyOf(w), title: s(String(w.title || '').replace(/<[^>]*>/g, '')), until: AD.until(w) }; });""")
edit('ADM: repaint when the hidden list changes',
"""  var sig = JSON.stringify([ws.map(function(w){ return [w.id, w.key, w.title]; }), counts, roles]);""",
"""  var sig = JSON.stringify([ws.map(function(w){ return [w.id, w.key, w.title, w.text]; }), counts, roles, hidList.map(function(x){ return x.key; }), !!UI.showHid]);   """ + MARK)
edit('ADM: ✕ and 🔕 7 days on each card',
"""      + '<button type="button" class="gc-adm-x" title="Hide until the page is reloaded" data-adm-dis="' + i + '">✕</button></div></div>';""",
"""      + (AD ? '<button type="button" class="gc-adm-btn ghost gc-adm-snz" title="Hide for 7 days (it comes back sooner if something new shows up)" data-adm-snz="' + i + '">🔕 7 days</button>' : '')   """ + MARK + """
      + '<button type="button" class="gc-adm-x" title="' + (AD ? 'Hide — it comes back only when something new shows up on it' : 'Hide until the page is reloaded') + '" data-adm-dis="' + i + '">✕</button></div></div>';""")
edit('ADM: the hidden cards, under the cards',
"""  h += '<div class="gc-adm-roles"><b>Roles:</b> '""",
"""  if (hidList.length) h += '<div class="gc-adm-hidden"><button type="button" class="gc-adm-x" data-adm-showhid="1">🔕 ' + hidList.length + ' hidden card' + (hidList.length === 1 ? '' : 's') + ' ' + (UI.showHid ? '▾' : '▸') + '</button>'   """ + MARK + """
    + (UI.showHid ? hidList.map(function(x, k){ return '<div class="gc-adm-hrow2"><span>' + esc(x.title) + (x.until ? ' <i style="color:#94a3b8">· hidden until ' + esc(new Date(x.until).toLocaleDateString()) + '</i>' : '') + '</span><button type="button" class="gc-adm-btn ghost" data-adm-unhide="' + k + '">Show again</button></div>'; }).join('') : '') + '</div>';
  h += '<div class="gc-adm-roles"><b>Roles:</b> '""")
edit('ADM: keep the hidden list for the clicks',
"""  m.__ws = ws;""",
"""  m.__ws = ws; m.__hid = hidList;   """ + MARK)
edit('ADM: paintTop for the helper',
"""function sectionCount(sec){""",
"""W._gcAdmPaintTop = function(){ try { paintTop(); } catch (e) {} };   """ + MARK + """
function sectionCount(sec){""")
edit('ADM: the clicks',
"""  if ((b = t.closest('[data-adm-dis]'))) { var w2 = (D.getElementById('gc-adm-top').__ws || [])[+b.getAttribute('data-adm-dis')]; if (w2) { UI.dismissed[w2.id + ':' + w2.key] = 1; paintTop(); } return; }""",
"""  if ((b = t.closest('[data-adm-dis]'))) { var w2 = (D.getElementById('gc-adm-top').__ws || [])[+b.getAttribute('data-adm-dis')]; if (w2) { if (W._gcAdmDismiss) { W._gcAdmDismiss.dismiss(w2, 0); toast('Hidden — it comes back only when something new shows up on it.'); } else UI.dismissed[w2.id + ':' + w2.key] = 1; paintTop(); } return; }
  """ + MARK + """
  if ((b = t.closest('[data-adm-snz]'))) { var w3 = (D.getElementById('gc-adm-top').__ws || [])[+b.getAttribute('data-adm-snz')]; if (w3 && W._gcAdmDismiss) { W._gcAdmDismiss.dismiss(w3, 7); toast('Hidden for 7 days — it comes back sooner if something new shows up.'); paintTop(); } return; }
  if ((b = t.closest('[data-adm-showhid]'))) { UI.showHid = !UI.showHid; paintTop(); return; }
  if ((b = t.closest('[data-adm-unhide]'))) { var hx = (D.getElementById('gc-adm-top').__hid || [])[+b.getAttribute('data-adm-unhide')]; if (hx && W._gcAdmDismiss) { W._gcAdmDismiss.restore(hx.key); paintTop(); } return; }""")

# ── patch AUTO6: the sub is the invoice's sub field, never its file name ──
edit('AUTO6: the sub of the invoice',
"""  var sub = s(row.sub || row.subName || row.vendor || iv.sub || iv.vendor);""",
"""  """ + MARK + """ var who = subOf(row, iv), sub = who.name;   /* the SUB FIELD (subId → the Subs list, the typed sub), never the file name */""")
edit('AUTO6: the record by its id',
"""  var r = subRec(sub);
  /* patch SUPPLIERPAY""",
"""  var r = who.rec || subRec(sub); out.subId = r ? s(r.id) : ''; out.file = who.file;   """ + MARK + """
  /* patch SUPPLIERPAY""")
edit('AUTO6: no sub set → Pick the sub',
"""  if (!r) out.problems.push('“' + (sub || 'This sub') + '” is not on the Subs list — no COI or W-9 on file.');""",
"""  if (!r && !sub) { out.noSub = true; out.problems.push('Pick the sub — this invoice has no sub set' + (who.file ? ' (only its file name, “' + who.file + '”)' : '') + '.'); }   """ + MARK + """
  else if (!r) { out.notListed = true; out.problems.push('“' + sub + '” is not on the Subs list — no COI or W-9 on file.'); }""")
edit('AUTO6: the sub\'s other invoices by its id too',
"""      if (s(x.pid || x.jobId) !== pid || norm(x.sub || x.vendor) !== n) return;""",
"""      if (s(x.pid || x.jobId) !== pid || !(norm(x.sub || x.vendor) === n || (out.subId && s(x.subId) === out.subId))) return;   """ + MARK)
edit('AUTO6: helpers',
"""W._gcSubPayCheck = check;""",
r"""W._gcSubPayCheck = check;
/* patch ADMDISMISS */ /* the sub of a sub invoice. An uploaded one starts with sub = its file name ("invoice-22902" from
   invoice-22902.pdf, the Invoices upload); picking the sub sets subId (+ the name). Read: the invoice's subId (then the
   approvals row's) on the Subs list, else the first typed name that is not the file name. */
function fileOf(row, iv){
  var f = s(row.fileName || iv.fileName || (iv._files && iv._files.fileData && iv._files.fileData.name));
  if (!f) { var m = /uploaded:\s*(.+)$/i.exec(s(iv.desc || row.desc)); if (m) f = s(m[1]); }
  return f;
}
function fileish(n, f){
  var a = low(n); if (!a) return false;
  var b = low(f), bb = b.replace(/\.[a-z0-9]{1,5}$/, '');
  if (b && (a === b || a === bb)) return true;
  return /\.(pdf|jpe?g|png|heic|gif|tiff?|webp|docx?|xlsx?|csv|txt|eml)$/.test(a) || /^(invoice|inv|scan|scanned|img|image|document|doc|file|receipt|bill|statement|photo)[\s_#-]*\d/.test(a);
}
function subById(id){ id = s(id); if (!id) return null; return arr(crm().subs).concat(arr(crm().vendors)).filter(function(x){ return s(x.id) === id; })[0] || null; }
function subOf(row, iv){
  row = row || {}; iv = iv || {};
  var f = fileOf(row, iv), rec = subById(iv.subId) || subById(row.subId);
  var typed = [iv.sub, iv.subName, iv.vendor, row.sub, row.subName, row.vendor].map(s).filter(function(n){ return n && !fileish(n, f); })[0] || '';
  return { rec: rec, name: rec ? s(rec.name || rec.company) || typed : typed, file: f };
}
W._gcSubOfInvoice = function(invId){ var w = subOf(rowOf(invId), invOf(invId)); return { name: w.name, subId: w.rec ? s(w.rec.id) : '', file: w.file }; };
/* the waiting sub invoices that fail the check, worked out live (cached 30 s) */
var LC = { at: 0, m: {} };
function liveCheck(id){ if (Date.now() - LC.at > 30000) LC = { at: Date.now(), m: {} }; if (!(id in LC.m)) { try { LC.m[id] = check(id); } catch (e) { LC.m[id] = null; } } return LC.m[id]; }
function payFails(){
  var out = [];
  queue().forEach(function(a){
    if (!a || a.status !== 'pending_pm' || a.payOverride) return;
    var id = s(a.invId || a.id); if (!id || settled(id)) return;
    var r = liveCheck(id); if (r && !r.ok && !r.overridden) out.push({ id: id, a: a, r: r });
  });
  return out;
}
function subLabel(x){ return x.r.noSub ? '<b>Sub not picked</b>' + (x.r.file ? ' (' + esc(x.r.file) + ')' : '') : esc(x.r.sub || 'Sub'); }
/* "＋ Add to Subs list" / "Mark as supplier" — only on a person's click, after a confirm (SUPPLIERPAY: isSub false skips the sub rules) */
function addPayee(name, supplier){
  var nm = s(name); if (!nm) return false;
  if (subRec(nm)) { toast('“' + nm + '” is already on the Subs list.'); return false; }
  if (typeof W._setSubs !== 'function') { toast('The Subs list is not ready yet — try again in a moment.'); return false; }
  if (!confirm(supplier ? 'Mark “' + nm + '” as a SUPPLIER?\n\nIt goes on the Subs / Vendors list as “not a sub”: its invoices skip the COI, W-9 and sub-agreement rules.'
    : 'Add “' + nm + '” to the Subs list?\n\nThen add their COI and W-9 on the Subs screen — the pay check still needs both before paying.')) return false;
  var rec = { id: 'SUB' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: nm, cat: supplier ? 'Supplier' : 'Sub', isSub: !supplier,
    phone: '', email: '', web: '', insExp: '', wcExp: '', w9: false, createdBy: me() + ' (Admin → pay check)', created: nowIso(), updatedAt: nowIso() };
  if (supplier) rec.type = 'supplier';
  try { W._setSubs(function(prev){ return (prev || []).concat([rec]); }); } catch (e) { toast('Could not add it: ' + s(e && e.message)); return false; }
  try { var C = W._crm; if (C && Array.isArray(C.subs) && !C.subs.some(function(x){ return x && x.id === rec.id; })) C.subs = C.subs.concat([rec]); } catch (e) {}
  LC = { at: 0, m: {} }; PB = { at: 0, m: {} };
  later(function(){ try { scan(); } catch (e) {} try { if (W._gcAdmPaintTop) W._gcAdmPaintTop(); } catch (e) {} }, 800);
  toast(supplier ? '“' + nm + '” is marked as a supplier — its invoices skip the sub rules.' : '“' + nm + '” is on the Subs list — add the COI and W-9 there.');
  return true;
}
W._gcAddPayee = addPayee;
/* the lists the pay check reads are still loading (the approvals queue is rebuilt from the invoices ~14 s after load):
   the Admin card says so, and the ✕ helper does not take what it shows for new content */
function payLoading(){ try { if (W.performance && performance.now() < 20000) return true; } catch (e) {} return !invoices().length || !arr(crm().subs).length || !lsGet(QK); }
W._gcSubPayFails = function(){ return payFails().map(function(x){ return { id: x.id, sub: x.r.sub, noSub: !!x.r.noSub, notListed: !!x.r.notListed, problems: x.r.problems.slice() }; }); };
W._gcSubPayLoading = payLoading;
/* the 🧾 Missing job data board (patch DATAFULL) is on for this person */
function dfOn(){ try { var F = W._gcDataFull; return !!(F && typeof F.state === 'function' && F.state().canSee); } catch (e) { return false; } }""")
edit('AUTO6: the data check list → the board',
"""  var it = dcItem(), refs = it && !it.done ? arr(it.refs) : [];""",
"""  var it = dcItem(), refs = it && !it.done ? arr(it.refs) : [];
  """ + MARK + """ var dfb = dfOn();   /* the 🧾 Missing job data board has the jobs and leads (by each job's stage): this list keeps the duplicate customers */
  if (dfb) { refs = refs.filter(function(r){ return r.kind === 'dup-customer'; }); if (!refs.length) { try { W._gcDataFull.open(); } catch (e) {} return null; } }""")
edit('AUTO6: the board button on the list',
"""    + body + '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="gc-a6-btn alt" id="gc-a6-x">Close</button></div>');""",
"""    + (dfb ? '<p class="gc-a6-sub">🏗 Jobs and 🎯 leads missing info are on the board: <button class="gc-a6-btn" id="gc-a6-df">🧾 Open the Missing job data board</button></p>' : '')   """ + MARK + """
    + body + '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="gc-a6-btn alt" id="gc-a6-x">Close</button></div>');
  var dfx = ov.querySelector('#gc-a6-df'); if (dfx) dfx.onclick = function(){ ov.remove(); try { W._gcDataFull.open(); } catch (e) {} };""")
edit('AUTO6: the pay check cards',
"""    var fl = W._gcSubPayFlags();
    if (fl.length) out.push({ id: 'sub-pay-check', level: 'red', key: 'subpay', title: fl.length + ' sub invoice' + (fl.length === 1 ? '' : 's') + ' fail the pay check',
      text: fl.slice(0, 4).map(function(a){ return esc(s(a.sub || a.vendor) || 'Sub') + ' ' + money(a.amt || a.amount) + ': ' + esc(strs(a.payCheck && a.payCheck.problems).join('; ')); }).join('<br>') + (fl.length > 4 ? '<br>…' : '') + '<br>COI / W-9 / over the sub agreement. They cannot be approved or paid until fixed or overridden by an admin.',
      fixes: [{ label: 'Open approvals', run: function(){ call('_gcOpenPmApprovals'); } }] });
    var wl = W._gcSubPayWarns();
    if (wl.length) out.push({ id: 'sub-pay-warn', level: 'amber', key: 'subpaywarn', title: wl.length + ' sub invoice' + (wl.length === 1 ? '' : 's') + ' waiting without a signed sub agreement',
      text: wl.slice(0, 4).map(function(a){ return esc(s(a.sub || a.vendor) || 'Sub') + ' ' + money(a.amt || a.amount) + ': ' + esc(strs(a.payWarn && a.payWarn.warnings).join('; ')); }).join('<br>') + '<br>These do not block payment. Send the sub agreement to the sub to sign in their portal so the amount can be checked.',""",
"""    """ + MARK + """ var fl = payFails();   /* live, with the sub read from the invoice's sub field; one content item per invoice (for the ✕) */
    if (fl.length) {
      var unl = []; fl.forEach(function(x){ if (x.r.notListed && x.r.sub && unl.indexOf(x.r.sub) < 0) unl.push(x.r.sub); });
      var short = function(n){ return n.length > 26 ? n.slice(0, 25) + '…' : n; };
      var pfx = fl.some(function(x){ return x.r.noSub; }) ? [{ label: 'Pick the sub', run: function(){ call('_gcOpenPmApprovals'); } }] : [{ label: 'Open approvals', run: function(){ call('_gcOpenPmApprovals'); } }];
      unl.slice(0, 2).forEach(function(n){ pfx.push({ label: '＋ Add “' + short(n) + '” to Subs list', run: function(){ addPayee(n, false); } }); pfx.push({ label: 'Mark “' + short(n) + '” as supplier', run: function(){ addPayee(n, true); } }); });
      out.push({ id: 'sub-pay-check', level: 'red', key: 'subpay', title: fl.length + ' sub invoice' + (fl.length === 1 ? '' : 's') + ' fail the pay check',
        text: fl.slice(0, 4).map(function(x){ return subLabel(x) + ' ' + money(x.r.amount) + ': ' + esc(x.r.problems.join('; ')); }).join('<br>') + (fl.length > 4 ? '<br>…' : '') + '<br>COI / W-9 / over the sub agreement. They cannot be approved or paid until fixed or overridden by an admin.',
        items: fl.map(function(x){ return 'inv:' + x.id; }), loading: payLoading(), fixes: pfx });   /* the invoice ids only: the reasons' wording can change while the lists load */
    }
    var wl = W._gcSubPayWarns();
    if (wl.length) out.push({ id: 'sub-pay-warn', level: 'amber', key: 'subpaywarn', title: wl.length + ' sub invoice' + (wl.length === 1 ? '' : 's') + ' waiting without a signed sub agreement',
      items: wl.map(function(a){ return 'inv:' + s(a.invId || a.id); }), loading: payLoading(),
      text: wl.slice(0, 4).map(function(a){ var r = liveCheck(s(a.invId || a.id)) || {}; return (r.noSub ? '<b>Sub not picked</b>' : esc(s(r.sub || a.sub || a.vendor) || 'Sub')) + ' ' + money(a.amt || a.amount) + ': ' + esc(strs(a.payWarn && a.payWarn.warnings).join('; ')); }).join('<br>') + '<br>These do not block payment. Send the sub agreement to the sub to sign in their portal so the amount can be checked.',""")
edit('AUTO6: the old nightly card',
"""    var it = dcItem(); var n = it && !it.done ? arr(it.refs).length : 0;
    if (n) out.push({ id: 'data-check', level: 'amber', key: 'datacheck', title: '🧹 Last night’s data check found ' + n + ' thing' + (n === 1 ? '' : 's') + ' to fix',
      text: esc(s(it.note)), fixes: [{ label: 'Open list', run: function(){ W._gcOpenDataCheck(); } }] });""",
"""    var it = dcItem(), drefs = it && !it.done ? arr(it.refs) : [], n = drefs.length;
    """ + MARK + """ /* the 🧾 Missing job data banner (DATAFULL) has the jobs and leads, counted by each job's stage: the old card would
       say the same with other numbers. Only possible duplicate customers (not on the board) stay here. */
    if (n && dfOn()) {
      var dups = drefs.filter(function(r){ return r.kind === 'dup-customer'; });
      if (dups.length) out.push({ id: 'data-check', level: 'amber', key: 'datacheck', title: '👥 Last night’s data check: ' + dups.length + ' possible duplicate customer' + (dups.length === 1 ? '' : 's'),
        text: dups.slice(0, 4).map(function(r){ return esc(s(r.label)); }).join('<br>') + (dups.length > 4 ? '<br>…' : '') + '<br>Jobs and leads missing info are on the 🧾 Missing job data board.',
        items: dups.map(function(r){ return s(r.key); }), fixes: [{ label: 'Open list', run: function(){ W._gcOpenDataCheck(); } }, { label: 'Open board', run: function(){ try { W._gcDataFull.open(); } catch (e) {} } }] });
    } else if (n) out.push({ id: 'data-check', level: 'amber', key: 'datacheck', title: '🧹 Last night’s data check found ' + n + ' thing' + (n === 1 ? '' : 's') + ' to fix',
      items: drefs.map(function(r){ return s(r.key); }),
      text: esc(s(it.note)), fixes: [{ label: 'Open list', run: function(){ W._gcOpenDataCheck(); } }] });""")

# ── the Schedule templates row (SCHEDPICK: templates are suggestions a person picks) ──
edit('AUT3: the Schedule templates row',
"""<b>🗓 Schedule templates</b> · the draft schedule each job type gets when it is signed (tasks, days, who, what waits on what, what the customer sees)</span><button type="button">Open</button>';""",
"""<b>🗓 Schedule templates</b> · picked by a person when making a job’s schedule</span><button type="button">Open</button>';   """ + MARK)

TAG = '<script id="gc-patch-admdismiss">'
js = open(os.path.join(here, 'admdismiss.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower() and '(patch ADMDISMISS)' in js
body = MARK + '\n' + js

done = [tag for tag, old, new in EDITS if new in t]
if done and len(done) != len(EDITS):
    sys.exit('ADMDISMISS: half patched? ' + ', '.join(tag for tag, o, n in EDITS if n not in t))
changed = False
if not done:
    for tag, old, new in EDITS:
        c = t.count(old)
        assert c == 1, ('ADMDISMISS anchor', tag, c, old[:100])
    for tag, old, new in EDITS:
        t = t.replace(old, new); changed = True
if TAG in t:
    assert t.count(TAG) == 1, 'ADMDISMISS: script tag twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != body:
        t = t[:i] + body + t[j:]; changed = True; print('ADMDISMISS: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'ADMDISMISS: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + body + '</script>\n'; changed = True
if not changed:
    print('ADMDISMISS: already patched'); sys.exit(0)
open(p, 'w', encoding='utf-8').write(t)
print('ADMDISMISS: patched', p, '(' + str(len(EDITS)) + ' edits + the helper script)')
