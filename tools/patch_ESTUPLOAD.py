r"""Idempotent patch ESTUPLOAD (on top of ESTIN, CUSTPORTAL, AUTO5, FIELDPORTAL, FIELDFILE, SCOPEWORDS): the job's estimate
from an uploaded paper — Field "📄 Upload estimate" (desk: the job's 🧰 Job tools → 📤 Upload estimate, the same upload);
the panel after it (original / template, schedule, send); when the customer signs it the contract is its total.

  Owner 11/03: "I also need to upload estimate on these buttons so I can upload PDF and proposals made from Word doc or
  Google doc, and it work as the job's estimate, and when signed contract it changes to the job's total." + Templates on
  the Field estimate button; the template version made from the entered numbers, side by side with the original, either
  one put in the portal or sent by himself; "Make schedule for job" (start / finish, phases — schedule language found in
  the PDF carried over); the scope built from the estimate, wording only.
  ESTIN (the CRM's one estimate upload, reused):
    • the sheet takes PDF, Word .docx (read) and old Word .doc (kept; the total is typed); a note on Word / Google Docs;
    • review: an "Estimate total $" box (read from the paper, else typed) — the estimate's total (the job's Bid / Estimate);
      Accept needs a total; a changed line price updates it;
    • from a job (Field or desk): after Accept, the estimate WAITS (estinWait — no proposal / approval made by itself) and
      the panel opens (tools/estupload_tail.js, window._gcEstUp);
    • the template version reads the estimate's own template details (scope, payment terms, valid days, warranty,
      exclusions, notes, start / finish, MS tax included or not);
    • W._gcEstin.x: setEst, estById, pdfBlob, builtInLists, tpl (for the panel).
  AUTO5: a "My PDF" estimate asks for the signature with no amount (CUSTPORTAL) — the contract is then that estimate's
  total (only when the job has no contract yet, as before).
  FIELDPORTAL: the "📄 Upload estimate" tile (owners / office / the job's PM) → the panel's menu (📤 Upload · 📘 Templates ·
  this job's estimates).

Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_ESTUPLOAD.py [index.html]   (also updates tools/fieldportal.js)
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_ESTUPLOAD__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
for need in ('__GC_PATCH_ESTIN__', '__GC_PATCH_FIELDPORTAL__', '__GC_PATCH_FIELDFILE__', '__GC_PATCH_SCOPEWORDS__', 'patch CUSTPORTAL'):
    assert need in src, need + ' is not in this page'

# ── FIELDPORTAL: the tile and its action (the same two edits go to tools/fieldportal.js) ──
FP = [
    ("by.docs, by.create]",
     "by.docs, pm.cust && W._gcEstin && typeof W._gcEstin.upload === 'function' && mk('estup', '📄', 'Upload estimate'), by.create]   /* __GC_PATCH_ESTUPLOAD__ */",
     'field tile'),
    ("  if (a === 'fp-log' && pm.photos)",
     "  if (a === 'fp-estup' && pm.cust) { if (W._gcEstUp && W._gcEstUp.menu) W._gcEstUp.menu(p); else if (W._gcEstin && W._gcEstin.upload) W._gcEstin.upload({ pid: s(p.id), stay: true }); else toast('Estimates are not on this phone yet.'); return true; }   /* patch ESTUPLOAD: 📤 Upload · 📘 Templates · this job's estimates */\n  if (a === 'fp-log' && pm.photos)",
     'field run'),
]

EDITS = FP + [
    # ESTIN: the upload sheet
    ("'<div class=\"gces-note\">Word (.docx), PDF, Excel (.xlsx), CSV or text — however it was made. It becomes a CRM estimate and gets the GrayCo proposal (which waits for approval).</div>' +",
     "'<div class=\"gces-note\">PDF, Word (.docx / .doc), Excel (.xlsx), CSV or text — however it was made. It becomes this job\\'s estimate; nothing goes to the customer until the proposal is approved on ✅ Approvals.</div>' +\n"
     "    '<div class=\"gces-note\">A PDF goes to the customer exactly as it is. Made in Word or Google Docs? Save / download it as PDF (Google Docs: File → Download → PDF) so the customer sees your own paper — a Word file is kept with the estimate and the customer gets the GrayCo proposal made from it.</div>' +   /* patch ESTUPLOAD */",
     'upload note'),
    ("'<input type=\"file\" class=\"gces-in\" data-es=\"file\" accept=\".pdf,.docx,.xlsx,.csv,.txt,application/pdf\">' +",
     "'<input type=\"file\" class=\"gces-in\" data-es=\"file\" accept=\".pdf,.docx,.doc,.xlsx,.csv,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document\">' +",
     'upload accept'),
    # ESTIN: an old Word file is kept (the total is typed)
    ("if (/\\.doc$/.test(nm) || /\\.xls$/.test(nm)) return { text: '', error: 'Old Word / Excel files (.doc / .xls) cannot be read — save it as .docx / .xlsx or PDF.' };",
     "if (/\\.doc$/.test(nm)) return { text: '', oldWord: true };   /* patch ESTUPLOAD: kept as the estimate's file; the total is typed */\n"
     "    if (/\\.xls$/.test(nm)) return { text: '', error: 'Old Excel files (.xls) cannot be read — save it as .xlsx or PDF.' };",
     'old word'),
    ("    if (t.scanned || t.photo) rd.fromScan = true;",
     "    if (t.scanned || t.photo) rd.fromScan = true;\n"
     "    if (t.oldWord) { rd.conf = 'low'; rd.why = 'An old Word file (.doc) — the CRM cannot read it; type the total'; }   /* patch ESTUPLOAD */",
     'old word why'),
    # ESTIN review: the total box
    ("'<div class=\"gces-note\">Total ' + esc(money(rd.total)) + (rd.conf === 'low' ? ' — check the lines before accepting.' : '') + '</div>' +",
     "'<label class=\"gces-lbl\">Estimate total $ — the job\\'s estimate; the contract when the customer signs it</label><input class=\"gces-in\" data-es=\"total\" inputmode=\"decimal\" placeholder=\"Type the total\" value=\"' + esc(rd.total > 0 ? String(r2(rd.total)) : '') + '\">' +   /* patch ESTUPLOAD */\n"
     "    '<div class=\"gces-note\">' + (rd.total > 0 ? 'Read from the paper: ' + esc(money(rd.total)) : esc(rd.why || 'No total could be read — type it')) + (rd.conf === 'low' && rd.lines.length ? ' — check the lines before accepting.' : '') + '</div>' +",
     'review total'),
    ("  rd.sum = r2(rd.lines.reduce(function(a, x){ return a + num(x.charge); }, 0)); rd.total = rd.sum || rd.total;",
     "  rd.sum = r2(rd.lines.reduce(function(a, x){ return a + num(x.charge); }, 0)); rd.total = rd.sum || rd.total;\n"
     "  var tt = OV && OV.querySelector('[data-es=\"total\"]'); if (tt && num(tt.value) > 0) rd.total = r2(num(tt.value));   /* patch ESTUPLOAD: the typed / read total is the estimate's total */\n"
     "  if (!toBuilder && !(rd.total > 0)) { toast('Type the estimate total first.', true); if (tt) try { tt.focus(); } catch (x) {} return null; }",
     'save total'),
    ("  var rd = PENDING.res.rd, o = PENDING.o;",
     "  var rd = PENDING.res.rd, o = PENDING.o, txt0 = s(PENDING.res.text);   /* patch ESTUPLOAD: the paper's words, for the panel */",
     'txt0'),
    ("  est.estinReview = !(est.pid || est.leadId); est.estinNow = !toBuilder && !est.estinReview;",
     "  est.estinReview = !(est.pid || est.leadId); est.estinNow = !toBuilder && !est.estinReview;\n"
     "  if (o && o.stay && !toBuilder && !est.estinReview) { est.estinNow = false; est.estinWait = true; }   /* patch ESTUPLOAD: from a job — it waits for 📨 Put in customer portal */",
     'wait'),
    ("  else { toast(est.estinReview ? 'Saved — pick its job on 📨 Proposals' : 'Saved — the GrayCo proposal is being made (it waits for approval)'); later(function(){ process(estById(est.id) || est); }, 400); open('all'); }",
     "  else if (o && o.stay && est.estinWait) { close(); toast('Saved as this job\\'s estimate'); try { if (W._gcEstUp) W._gcEstUp.after(est.id, { text: txt0, est: est }); } catch (x) {} }   /* patch ESTUPLOAD: the panel (original / template, schedule, send) */\n"
     "  else { toast(est.estinReview ? 'Saved — pick its job on 📨 Proposals' : 'Saved — the GrayCo proposal is being made (it waits for approval)'); later(function(){ process(estById(est.id) || est); }, 400); open('all'); }",
     'after'),
    ("    return store.then(function(ref){ return { ok: true, rd: rd, ref: ref, name: file.name, type: file.type, hash: hash, have: have || same, similar: !!same }; });",
     "    return store.then(function(ref){ return { ok: true, rd: rd, ref: ref, name: file.name, type: file.type, hash: hash, have: have || same, similar: !!same, text: s(t.text).slice(0, 40000) }; });   /* patch ESTUPLOAD: + the words */",
     'ingest text'),
    ("  if (e.estinReview === true) return 'needs a look';",
     "  if (e.estinReview === true) return 'needs a look';\n  if (e.estinWait === true) return 'waiting for 📨 Put in customer portal';   /* patch ESTUPLOAD */",
     'eligible wait'),
    ("if (k === 'upload') return uploadUi(o);",
     "if (k === 'upload') return uploadUi(Object.assign(o, { stay: !!o.pid }));   /* patch ESTUPLOAD: from the job → the panel */",
     'desk stay'),
    ("function proposalHtml(e){\n  var t = tpl(), lines = sellLines(e);\n  var est = Object.assign({}, e, { lines: lines, totalCharge: totalOf(e) || lines.reduce(function(a, x){ return a + x.charge; }, 0) });",
     "function proposalHtml(e){\n  var t = tpl(), lines = sellLines(e);\n"
     "  /* patch ESTUPLOAD: the estimate's own template details (the panel's 📘 Template details) */\n"
     "  var dd = e && e.tplDetails && typeof e.tplDetails === 'object' ? e.tplDetails : null;\n"
     "  if (dd) { t = Object.assign({}, t); if (Array.isArray(dd.notes) && dd.notes.length) t.notes = dd.notes.slice(); if (Array.isArray(dd.exclusions) && dd.exclusions.length) t.exclusions = dd.exclusions.slice(); if (num(dd.validDays) > 0) t.validDays = num(dd.validDays); if (s(dd.paymentTerms)) t.paymentTerms = s(dd.paymentTerms);\n"
     "    if (Array.isArray(t.notes) && t.notes.length) { var bl = builtInLists().notes; t.notes = t.notes.concat(bl.filter(function(n){ return /^warranty:|^scheduling is pending/i.test(n) && !t.notes.some(function(m){ return m === n; }); })); }\n"
     "    var sl = s(dd.scope).split(/\\n/).map(function(x){ return s(x).replace(/^(\\d{1,2}[.)]|[-•*·])\\s*/, ''); }).filter(Boolean), tot0 = totalOf(e);\n"
     "    if (sl.length) lines = sl.slice(0, 40).map(function(x, i){ return { cat: x, desc: '', qty: 1, charge: i ? 0 : (tot0 || lines.reduce(function(a, y){ return a + y.charge; }, 0)) }; }); }\n"
     "  var est = Object.assign({}, e, { lines: lines, totalCharge: totalOf(e) || lines.reduce(function(a, x){ return a + x.charge; }, 0) }, dd && dd.msIncluded != null ? { msInLines: !!dd.msIncluded } : {});",
     'proposal details'),
    ("  return applyTpl(html, t, est);\n}",
     "  html = applyTpl(html, t, est);\n"
     "  if (dd) {   /* patch ESTUPLOAD: warranty / schedule from the details */\n"
     "    if (s(dd.warranty)) html = html.replace(/<li>Warranty:[\\s\\S]*?<\\/li>/, '<li>Warranty: ' + esc(dd.warranty) + '</li>');\n"
     "    var fmt = function(v){ var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s(v)); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''; };\n"
     "    if (fmt(dd.start) || fmt(dd.finish)) html = html.replace(/<li>Scheduling is pending proposal acceptance\\.<\\/li>/, '<li>Estimated schedule: ' + esc([fmt(dd.start) ? 'start ' + fmt(dd.start) : '', fmt(dd.finish) ? 'completion ' + fmt(dd.finish) : ''].filter(Boolean).join(', ')) + ' (pending proposal acceptance, weather and material availability).</li>');\n"
     "  }\n  return html;\n}",
     'proposal details 2'),
    ("try { console.log('[GC] Estimates → CRM → GrayCo proposal (waits for approval) armed (patch ESTIN)'); } catch (e) {}",
     "W._gcEstin.x = { setEst: setEst, estById: estById, pdfBlob: pdfBlob, builtInLists: builtInLists, tpl: tpl, close: close };   /* patch ESTUPLOAD: for the panel */\n"
     "try { console.log('[GC] Estimates → CRM → GrayCo proposal (waits for approval) armed (patch ESTIN)'); } catch (e) {}",
     'exports'),
    ("  if (t.hasAttribute('data-es-m')) draftPrev();",
     "  if (t.hasAttribute('data-es-m')) draftPrev();\n"
     "  if (t.getAttribute('data-es-l') === 'c') { var tb3 = OV.querySelector('[data-es=\"total\"]'), sm3 = 0; Array.prototype.forEach.call(OV.querySelectorAll('[data-es-l=\"c\"]'), function(x){ sm3 += num(x.value); }); if (tb3 && sm3 > 0) tb3.value = String(r2(sm3)); }   /* patch ESTUPLOAD: a price changed → the total follows */",
     'line total'),
    # AUTO5: the contract from the signed estimate's total
    ("function applyContract(r){",
     "/* __GC_PATCH_ESTUPLOAD__: an estimate sent as its own PDF (\"Customer sees: My PDF\") asks for the signature with no amount —\n"
     "   the contract is then that estimate's total */\n"
     "function sigAmount(r){ var a = num(r.amount); if (a > 0 || r.kind !== 'estimate') return a; var e = estList().filter(function(x){ return x && String(x.id) === String(r.refId); })[0]; return e ? (num(e.totalCharge) || num(e.quoteTotal) || num(e.total)) : 0; }\n"
     "function applyContract(r){",
     'sigAmount'),
    ("if (!(num(q.contract) > 0) && num(r.amount) > 0) { q.contract = Math.round(num(r.amount) * 100) / 100;",
     "if (!(num(q.contract) > 0) && sigAmount(r) > 0) { q.contract = Math.round(sigAmount(r) * 100) / 100;",
     'contract'),
]

for old, new, label in EDITS:
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
for old, new, label in EDITS:
    src = src.replace(old, new)
ANCH = '<script id="gc-patch-roleapps">'
assert src.count(ANCH) == 1, 'roleapps anchor'
tail = open(os.path.join(HERE, 'estupload_tail.js'), encoding='utf-8').read()
src = src.replace(ANCH, tail.rstrip('\n') + '\n' + ANCH)
open(path, 'w', encoding='utf-8').write(src)
print('patched ESTUPLOAD')

tp = os.path.join(HERE, 'fieldportal.js')
if os.path.exists(tp):
    t = open(tp, encoding='utf-8').read()
    if MARK in t:
        print('tools/fieldportal.js: already patched')
    elif all(t.count(o) == 1 for o, _, _ in FP):
        for o, nw, _ in FP: t = t.replace(o, nw)
        open(tp, 'w', encoding='utf-8').write(t); print('tools/fieldportal.js: patched')
    else:
        print('tools/fieldportal.js: block not found (left as is)')
