#!/usr/bin/env python3
"""patch MOREDOCS (owner 11/9: "add every document we are missing for all situations"; "10 insurance … i barely want 3 or 4";
"we dont need lien waivers but have option for them … default is no lien waiver").
· 65 more papers (tools/more_templates.js, made by tools/more_templates.py) in the document library.
· Lien waivers are never a default on any job type (they stay in the library to add by hand).
· Insurance defaults trimmed to the basics; the words on a job add ONE main paper per situation (not 5–9)."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*MOREDOCS:' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'more_templates.js'), encoding='utf-8').read().strip()
rep("\nfunction builtins(){ return L; }", "\n/*MOREDOCS: job start, roofing, insurance claim help, contents, schedule, closeout, disputes, commercial pay, subs, safety, HR, vendors */\n" + tpl + "\nfunction builtins(){ return L; }")
rep("""  commercial: ['contract', 'scope', 'change_order', 'sov', 'coi_request', 'lien_cond_progress', 'lien_cond_final', 'payment_terms', 'walkthrough', 'completion', 'warranty'],
  insurance: ['work_auth', 'direction_to_pay', 'mitigation', 'mold', 'drying_log', 'scope', 'change_order', 'payment_terms', 'satisfaction', 'completion', 'warranty']""",
"""  commercial: ['contract', 'scope', 'change_order', 'sov', 'coi_request', 'payment_terms', 'walkthrough', 'completion', 'warranty'],   /* MOREDOCS: no lien waivers by default */
  insurance: ['work_auth', 'direction_to_pay', 'scope', 'change_order', 'completion', 'warranty']   /* MOREDOCS: owner "i barely want 3 or 4" */""")
# a saved default list may still name lien waivers → never a default
rep("""t[k] = Array.isArray(v.types[k]) ? v.types[k].slice() : b.types[k]; }); return { types: t,""",
"""t[k] = (Array.isArray(v.types[k]) ? v.types[k].slice() : b.types[k]).filter(function(id){ return !/lien/i.test(id); }); /*MOREDOCS*/ }); return { types: t,""")
# the words on a job: one main paper per situation
rep("""  if (has(/\\bhazard|hazmat|haz-?mat/)) { add(['lead_01', 'lead_03', 'lead_05', 'asb_testing_auth', 'asb_01', 'asb_02', 'mold', 'mold_assessment_auth', 'mold_contract', 'mold_containment_notice', 'mold_clearance_cert']);""",
"""  if (has(/\\bhazard|hazmat|haz-?mat/)) { add(['lead_01', 'lead_03', 'asb_01', 'mold']);""")
rep("""  if (has(/asbestos|\\bacm\\b|vermiculite|transite/) || la.asbFound) add(['asb_testing_auth', 'asb_01', 'asb_02']);
  if (has(/\\bmold|mould|mildew/)) add(['mold', 'mold_assessment_auth', 'mold_contract', 'mold_containment_notice', 'mold_clearance_cert']);""",
"""  if (has(/asbestos|\\bacm\\b|vermiculite|transite/) || la.asbFound) add(['asb_01']);
  if (has(/\\bmold|mould|mildew/)) add(['mold']);
  if (has(/sewage|sewer|black water|\\bcat(egory)? ?3\\b|toilet overflow/)) add(['sewage_notice']);
  if (has(/\\broof|shingle|re-?roof/)) add(['roof_preinstall']);""")
rep("""  if (has(/\\bwater\\b|flood|\\bleak|burst|mitigation|dry ?out|drying|sewage|\\bcat ?[123]\\b/)) add(['water_emergency_auth', 'mitigation', 'water_category_report', 'water_equipment_resp', 'antimicrobial_consent', 'drying_log', 'water_dry_cert', 'equipment_removal_signoff', 'work_auth']);""",
"""  if (has(/\\bwater\\b|flood|\\bleak|burst|mitigation|dry ?out|drying|sewage|\\bcat ?[123]\\b/)) add(['water_emergency_auth', 'drying_log', 'water_category_report']);""")
rep("""  if (has(/\\bfire\\b|smoke|soot/)) add(['fire_work_auth', 'odor_control_notice', 'packout_auth', 'contents_disposal']);
  if (has(/storm|hail|\\bwind\\b|tornado|hurricane|disaster|\\btarp|board[- ]?up/)) add(['storm_inspection_auth', 'board_up_auth', 'disaster_customer_info']);
  if (has(/\\btrees?\\b|limbs?|debris/)) add(['tree_removal_release']);
  if (has(/hidden|concealed|rotted|rot\\b/)) add(['hidden_damage_notice']);
  if (has(/insurance|\\bclaim\\b|adjuster|adjustor/)) add(['work_auth', 'direction_to_pay', 'photo_consent', 'disaster_customer_info']);""",
"""  if (has(/\\bfire\\b|smoke|soot/)) add(['fire_work_auth']);
  if (has(/\\btarp|board[- ]?up/)) add(['board_up_auth']); else if (has(/storm|hail|\\bwind\\b|tornado|hurricane|disaster/)) add(['storm_inspection_auth']);
  if (has(/insurance|\\bclaim\\b|adjuster|adjustor/)) add(['work_auth', 'direction_to_pay']);""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
