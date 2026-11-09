#!/usr/bin/env python3
"""patch DOCKEYS (owner 11/9: "just put the paperwork in my documents and if notes ever say lead then it gets lead documents,
if notes say asbestos, mold etc they get assigned that paperwork by words in notes, descriptions etc" · "all jobs have their
own special documents that go in portal and available for pm to put on jobs").
1. The owner's 8 lead / asbestos forms are now fill-in templates in the CRM's document library (category "Lead & Asbestos",
   tools/leadasb_templates.js, made from his Word files): customer, job, address and PO fill in by themselves; 👁 Fill &
   preview · 🖨 Print / PDF · 💾 Save to job · 📧 Send (client-facing ones through ✅ Approvals) as every other paper.
2. A job's "📋 Documents for this Job" set adds papers by the words in its name, type, scope, notes and description:
   lead → Lead 01, 03, 05 (+ Lead 02 for a school / daycare / Head Start / child-occupied job) · asbestos → Asbestos 01, 02 ·
   mold → Mold disclosure + Mold remediation agreement · water / flood / leak / mitigation → Mitigation agreement, Drying log,
   Work authorization · fire / smoke → Work authorization, Pack-out authorization · insurance / claim / adjuster → Work
   authorization, Direction to pay. Shown as "from the notes"; the PM can untick any (a ticked-off one stays off)."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*DOCKEYS*/' in src: print('already patched'); sys.exit(0)
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'leadasb_templates.js'), encoding='utf-8').read().strip()
o = "\nfunction builtins(){ return L; }"
assert src.count(o) == 1
src = src.replace(o, "\n/*DOCKEYS: the owner's lead / asbestos forms */\n" + tpl + o)
o2 = "    return { ids: ids, src: src, saved: !!saved, required: req.slice(), waived: waived.slice(), type: typeOf(pj) };"
assert src.count(o2) == 1
src = src.replace(o2, "    /* DOCKEYS: papers by the words on the job (a PM's untick is kept in docSet.off) */\n"
 "    try { var off = saved ? arr(pj.docSet.off) : []; keyDocs(pj).forEach(function(id){ if (off.indexOf(id) < 0 && ids.indexOf(id) < 0) add(id, 'notes'); }); } catch (e) {}\n" + o2)
o3 = "function save(pid, ids){\n  var pj = job(pid); if (!pj) return Promise.resolve({ ok: false, error: 'job not found' });"
assert src.count(o3) == 1
src = src.replace(o3, "/* DOCKEYS: which papers the words on a job call for */\n"
 "function keyDocs(pj){\n  if (!pj) return [];\n  var la = pj.leadAsb || {};\n  var t = ' ' + [pj.name, pj.type, pj.jobType, pj.scope, pj.notes, pj.description, pj.internalNotes, pj.scopeNotes, pj.desc, pj.workDescription].filter(Boolean).join(' ').toLowerCase() + ' ';\n"
 "  var out = [], add = function(a){ a.forEach(function(x){ if (out.indexOf(x) < 0) out.push('gcb_' + x); }); }, has = function(re){ return re.test(t); };\n"
 "  if (has(/\\blead\\b(?![ -]?(time|gen|source|in\\b|s?\\s+(to|from|for)))|lead[- ]based|lead paint|\\brrp\\b/) || la.leadFound || (la.disturbsPaint && parseInt(la.yearBuilt, 10) < 1978)) { add(['lead_01', 'lead_03', 'lead_05']); if (has(/school|daycare|day care|head start|child[- ]occupied|preschool|pre-k/)) add(['lead_02']); }\n"
 "  if (has(/asbestos|\\bacm\\b|vermiculite|transite/) || la.asbFound) add(['asb_01', 'asb_02']);\n"
 "  if (has(/\\bmold|mould|mildew/)) add(['mold', 'mold_contract']);\n"
 "  if (has(/\\bwater\\b|flood|\\bleak|burst|mitigation|dry ?out|drying|sewage|\\bcat ?[123]\\b/)) add(['mitigation', 'drying_log', 'work_auth']);\n"
 "  if (has(/\\bfire\\b|smoke|soot/)) add(['work_auth', 'packout_auth']);\n"
 "  if (has(/insurance|\\bclaim\\b|adjuster|adjustor/)) add(['work_auth', 'direction_to_pay']);\n"
 "  var have = {}; try { arr(W._gcDocLib && W._gcDocLib.builtins && W._gcDocLib.builtins()).forEach(function(x){ if (x && x.id) have[x.id] = 1; }); } catch (e) { return out; }\n"
 "  return out.filter(function(id){ return have[id]; });\n}\nW._gcDocKeys = keyDocs;   /*DOCKEYS*/\n" + o3)
# a PM's untick of a "notes" paper is remembered
o4 = "    var docSet = { ids: out, src: src, waived: waived, at: new Date().toISOString(), by: s(me().name || me().email) };"
assert src.count(o4) == 1
src = src.replace(o4, "    var docSet = { ids: out, src: src, waived: waived, off: cur.ids.filter(function(id){ return cur.src[id] === 'notes' && out.indexOf(id) < 0; }).concat(arr(pj.docSet && pj.docSet.off).filter(function(id){ return out.indexOf(id) < 0; })).filter(function(id, i, a){ return a.indexOf(id) === i; }), at: new Date().toISOString(), by: s(me().name || me().email) };")
open(P, 'w', encoding='utf-8').write(src); print('patched')

# + the 'from the notes' badge (BADGE and the job panel's lab map) added by hand on 11/9, see git
