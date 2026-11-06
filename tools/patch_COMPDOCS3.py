#!/usr/bin/env python3
"""patch COMPDOCS3 (owner 11/06: "Add health affects to employee training"): Safety folder gets
"Health effects of lead and asbestos — employee training (Toolbox Talks 11 & 12)" with quiz and sign-in (OSHA 1926.62(l), 1926.1101(k)(9))."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if 'GrayCo_Health_Effects_Lead_Asbestos_Training' in src:
    print('already patched'); sys.exit(0)
old = '["safety", "/company-docs/01667c529f454cf1/GrayCo_Lead_Asbestos_Toolbox_Talks_and_Training_Plan.docx"'
assert src.count(old) == 1
new = '["safety", "/company-docs/01667c529f454cf1/GrayCo_Health_Effects_Lead_Asbestos_Training.docx", "Health effects of lead and asbestos — employee training (Toolbox Talks 11 & 12)", "How lead and asbestos get in the body, early signs, long-term disease, family / take-home harm, smoking, OSHA limits, free medical testing and removal rights; quiz + sign-in. Give before the first lead / asbestos job and yearly."], ' + old
src = src.replace(old, new)
open(P, 'w', encoding='utf-8').write(src); print('patched')
