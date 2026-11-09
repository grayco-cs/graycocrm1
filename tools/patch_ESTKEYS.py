#!/usr/bin/env python3
"""patch ESTKEYS (owner 11/9: "we know jobs are mold / asbestos / lead etc by notes and descriptions, estimates — any key words trigger
those documents"): the words that pick a job's papers (DOCKEYS keyDocs) also come from the job's estimates — the estimate's name,
notes, scope and every line's description / category."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*ESTKEYS*/' in src: print('already patched'); sys.exit(0)
a = """  var t = ' ' + [pj.name, pj.type, pj.jobType, pj.scope, pj.notes, pj.description, pj.internalNotes, pj.scopeNotes, pj.desc, pj.workDescription].filter(Boolean).join(' ').toLowerCase() + ' ';"""
b = """  var t = ' ' + [pj.name, pj.type, pj.jobType, pj.scope, pj.notes, pj.description, pj.internalNotes, pj.scopeNotes, pj.desc, pj.workDescription].filter(Boolean).join(' ').toLowerCase() + ' ';
  /*ESTKEYS*/ try {
    var E = (W._gcEST && W._gcEST.all) ? W._gcEST.all() : (W._gcEstimatesState || (W._crm && W._crm.estimates) || []), codes = [pj.po, pj.autoPO].filter(Boolean).map(function(c){ return String(c).toLowerCase(); }), nm = String(pj.name || '').toLowerCase();
    (Array.isArray(E) ? E : []).forEach(function(e){
      if (!e || !(String(e.pid || e.projectId || '') === String(pj.id) || (e.po && codes.indexOf(String(e.po).toLowerCase()) > -1) || (nm && String(e.name || '').toLowerCase() === nm))) return;
      t += ' ' + [e.name, e.notes, e.scope, e.description, e.scopeOfWork].filter(Boolean).join(' ').toLowerCase() + ' ';
      (e.lines || []).concat(e.labor || []).slice(0, 400).forEach(function(l){ if (l) t += ' ' + String((l.desc || l.name || '') + ' ' + (l.cat || '')).toLowerCase(); });
    });
    t += ' ';
  } catch (e) {}"""
assert src.count(a) == 1
open(P, 'w', encoding='utf-8').write(src.replace(a, b)); print('patched')
