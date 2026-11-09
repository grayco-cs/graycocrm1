#!/usr/bin/env python3
"""patch RESTODOCS (owner 11/9: "i want to build this crm to have every document for every situation in water, fire, mold,
disaster services, all asbestos, lead etc"). Adds 21 restoration papers to the document library (tools/resto_templates.py →
resto_templates.js): Water Damage (emergency authorization, category & class report, equipment responsibility,
antimicrobial consent, certificate of drying) · Fire & Smoke (work authorization, odor-control safety notice, non-salvageable
contents disposal) · Mold (assessment / testing authorization, containment notice, post-remediation verification) · Storm &
Disaster (board-up / tarp, tree & debris removal, storm inspection, after-the-loss customer sheet) · Asbestos (testing /
survey authorization, stop-work notice) · Restoration — General (declined-services release, hidden-damage notice, photo
consent, mitigation equipment-removal sign-off). The words on a job (DOCKEYS) now add them too."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*RESTODOCS:' in src: print('already patched'); sys.exit(0)
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resto_templates.js'), encoding='utf-8').read().strip()
o = "\nfunction builtins(){ return L; }"
assert src.count(o) == 1
src = src.replace(o, "\n/*RESTODOCS: water, fire, mold, storm, asbestos, general restoration papers */\n" + tpl + o)
def rep(a, b):
    global src
    assert src.count(a) == 1, a[:60]; src = src.replace(a, b)
rep("  if (has(/asbestos|\\bacm\\b|vermiculite|transite/) || la.asbFound) add(['asb_01', 'asb_02']);",
    "  if (has(/asbestos|\\bacm\\b|vermiculite|transite/) || la.asbFound) add(['asb_testing_auth', 'asb_01', 'asb_02']);")
rep("  if (has(/\\bmold|mould|mildew/)) add(['mold', 'mold_contract']);",
    "  if (has(/\\bmold|mould|mildew/)) add(['mold', 'mold_assessment_auth', 'mold_contract', 'mold_containment_notice', 'mold_clearance_cert']);")
rep("  if (has(/\\bwater\\b|flood|\\bleak|burst|mitigation|dry ?out|drying|sewage|\\bcat ?[123]\\b/)) add(['mitigation', 'drying_log', 'work_auth']);",
    "  if (has(/\\bwater\\b|flood|\\bleak|burst|mitigation|dry ?out|drying|sewage|\\bcat ?[123]\\b/)) add(['water_emergency_auth', 'mitigation', 'water_category_report', 'water_equipment_resp', 'antimicrobial_consent', 'drying_log', 'water_dry_cert', 'equipment_removal_signoff', 'work_auth']);")
rep("  if (has(/\\bfire\\b|smoke|soot/)) add(['work_auth', 'packout_auth']);",
    "  if (has(/\\bfire\\b|smoke|soot/)) add(['fire_work_auth', 'odor_control_notice', 'packout_auth', 'contents_disposal']);\n"
    "  if (has(/storm|hail|\\bwind\\b|tornado|hurricane|disaster|\\btarp|board[- ]?up/)) add(['storm_inspection_auth', 'board_up_auth', 'disaster_customer_info']);\n"
    "  if (has(/\\btrees?\\b|limbs?|debris/)) add(['tree_removal_release']);\n"
    "  if (has(/hidden|concealed|rotted|rot\\b/)) add(['hidden_damage_notice']);")
rep("  if (has(/insurance|\\bclaim\\b|adjuster|adjustor/)) add(['work_auth', 'direction_to_pay']);",
    "  if (has(/insurance|\\bclaim\\b|adjuster|adjustor/)) add(['work_auth', 'direction_to_pay', 'photo_consent', 'disaster_customer_info']);")
open(P, 'w', encoding='utf-8').write(src); print('patched')
