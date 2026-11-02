#!/usr/bin/env python3
"""Idempotent patch ESTMATH3: two places where the screen could lag the numbers (release run of test_ESTMATH.mjs, 37/39).

1. The "Line margin" pulldown is updated in place with the rest of the line. ul() redraws the Base, the Charge, the chip
   and the text of the line it changes, but not the pulldown: a line margin set any way other than picking it in that
   pulldown (or a change of the Override / job margin under it) left the pulldown on its old choice — "Override (1.5x)"
   beside a line charged at its own 1.35x. Now the pulldown shows the margin used: the line's own (1.35x, or
   "Custom 1.45x") or the first choice, whose label is the job margin / override / type default in force.
2. Save redraws the lines when the estimate has a takeoff: Save marks an estimate figured at the old screws rule as
   reviewed (ESTMATH), but the lines were not redrawn, so the "Math updated — review" banner and the old-rule row stayed
   on screen until something else redrew them.
"""
import sys

p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ESTMATH3 */'
if MARK in t:
    print('ESTMATH3: already patched'); sys.exit(0)


def once(src, a, b):
    c = src.count(a)
    assert c == 1, 'ESTMATH3: expected 1 of %r, found %d' % (a[:90], c)
    return src.replace(a, b)


A = "        const mathEl=row.querySelector('[data-math]'); if(mathEl) mathEl.outerHTML=_gcLineMathHTML(l);   /* patch ESTMATH */\n"
t = once(t, A, A +
         "        try{ const selEl=row.querySelector('.elb select'); if(selEl&&selEl.options.length){   " + MARK + " // the pulldown shows the margin used\n"
         "          selEl.options[0].text=_gcTypeOptLabel(l);\n"
         "          const mv=(!l.mult||l.mult==='type')?'type':String(l.mult), has=[...selEl.options].some(o=>o.value===mv&&o.value!=='custom');\n"
         "          const cu=[...selEl.options].find(o=>o.value==='custom'); if(cu) cu.text=has?'Custom\\u2026':('Custom '+l.mult+'x');\n"
         "          selEl.value=has?mv:'custom';\n"
         "        } }catch(_se){}\n")
B = "    var s = openSlots[activeSlot]; if(s) s.lines = [...lines];\n  }catch(e){ console.warn('ESTMATH save', e); }"
t = once(t, B,
         "    var s = openSlots[activeSlot]; if(s) s.lines = [...lines];\n"
         "    if(lines.some(function(l){ return l && l.takeoff; })) setTimeout(function(){ try{ renderLines(); renderSummary(); }catch(x){} }, 0);   " + MARK + " // show it reviewed\n"
         "  }catch(e){ console.warn('ESTMATH save', e); }")
open(p, 'w', encoding='utf-8').write(t)
print('ESTMATH3: patched')
