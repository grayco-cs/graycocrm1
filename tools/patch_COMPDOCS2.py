#!/usr/bin/env python3
"""patch COMPDOCS2 (owner 11/06: "All documents for lead asbestos osha etc made in head start chat I need to make sure
all of those are in our company documents in the crm"). The 17 files he sent (GrayCo_Company_Documents.zip) ship with
the CRM under company-docs/<random>/ (like the blank W-9) and are listed in 📁 Company documents:
  • new folder ☣️ Lead & asbestos — the 6 lead + 2 asbestos customer forms and the CRM setup guide
  • 🦺 Safety — Lead Safety Program, Asbestos Awareness & Control, Hazard Communication, Respiratory Protection,
    Lead/Asbestos toolbox talks + training plan, warning signs (Word + PDF)
  • ⚖️ Legal & contracts — Davis-Bacon Subcontract Rider (CDI Head Start projects)"""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
H = '01667c529f454cf1'
src = open(P, encoding='utf-8').read()
if '/*COMPDOCS2*/' in src:
    print('already patched'); sys.exit(0)
def rep(old, new):
    global src
    assert src.count(old) == 1, (src.count(old), old[:80])
    src = src.replace(old, new)
rep("['company', '🏢', 'Company info']];", "['company', '🏢', 'Company info'], ['leadasb', '☣️', 'Lead & asbestos']];/*COMPDOCS2*/")
D = [
 ('leadasb','GrayCo_Lead_Asbestos_CRM_Setup_Guide.docx','Lead & asbestos — when to send each form (start here)','Job tags (year built, pre-1978, child-occupied, disturbs paint, asbestos, commercial / 5+ units, HUD-assisted), what to send before work and after, and the 30-day deadlines.'),
 ('leadasb','GrayCo_Lead_01_PreRenovation_Pamphlet_Acknowledgment.docx','Lead 01 — Pre-renovation notice: Renovate Right pamphlet acknowledgment','Pre-1978 + disturbs paint: give with the EPA Renovate Right pamphlet no more than 60 days before start; signature back before day 1 (or mailed 7+ days before, keep the receipt).'),
 ('leadasb','GrayCo_Lead_02_Child_Occupied_Facility_Notice.docx','Lead 02 — Child-occupied facility notice (parents / guardians)','Schools, daycares, Head Start: post it or give a copy to each family before work starts.'),
 ('leadasb','GrayCo_Lead_03_Completion_Records_and_Delivery.docx','Lead 03 — Lead-safe renovation completion record','Signed by the certified renovator; deliver to the owner within 30 days of completion.'),
 ('leadasb','GrayCo_Lead_04_Non_Certified_Worker_Training_Record.docx','Lead 04 — On-the-job training record (non-certified workers)','EPA 40 CFR 745.90(b)(2) / 745.86(b)(6)(ii) — keep in the job file.'),
 ('leadasb','GrayCo_Lead_05_Test_Kit_Results_Report.docx','Lead 05 — Test kit results report','EPA 40 CFR 745.86(c): kit maker + model, each component tested with location, each result — to the person who contracted the work within 30 days.'),
 ('leadasb','GrayCo_Lead_06_Supply_and_Equipment_Checklist.docx','Lead 06 — Lead job supply and equipment checklist','Load before every lead job (EPA RRP list plus GrayCo standard).'),
 ('leadasb','GrayCo_Asbestos_01_Customer_Disclosure_Acknowledgment.docx','Asbestos 01 — Customer disclosure and acknowledgment','Before work starts on any building where asbestos-containing material was found or is suspected; signature before day 1.'),
 ('leadasb','GrayCo_Asbestos_02_Completion_Records_Transmittal.docx','Asbestos 02 — Asbestos records transmittal','Send with the abatement records at the end of any job that included asbestos abatement.'),
 ('safety','GrayCo_Lead_Safety_Program.docx','Lead Safety and Compliance Program','OSHA 29 CFR 1926.62 · EPA 40 CFR 745 (RRP) · HUD guidelines · Arkansas ADH. Effective November 2026.'),
 ('safety','GrayCo_Asbestos_Awareness_and_Control_Program.docx','Asbestos Awareness and Control Program','OSHA 29 CFR 1926.1101 · EPA NESHAP 40 CFR 61 Subpart M · Arkansas DEQ. Effective November 2026.'),
 ('safety','GrayCo_Hazard_Communication_Program.docx','Hazard Communication Program (HazCom)','OSHA 29 CFR 1910.1200 / 1926.59 — labels, SDS, training.'),
 ('safety','GrayCo_Respiratory_Protection_Program.docx','Respiratory Protection Program','OSHA 29 CFR 1910.134 / 1926.103 — selection, medical evaluation, fit testing, training.'),
 ('safety','GrayCo_Lead_Asbestos_Toolbox_Talks_and_Training_Plan.docx','Lead & asbestos toolbox talks + crew training plan','Kickoff training and 10 toolbox meetings.'),
 ('safety','GrayCo_Lead_Asbestos_Warning_Signs.pdf','Lead & asbestos warning signs (PDF, ready to print)','DANGER signs in English and Spanish.'),
 ('safety','GrayCo_Lead_Asbestos_Warning_Signs.docx','Lead & asbestos warning signs (Word, to edit)','Same signs, editable.'),
 ('legal','GrayCo_Davis_Bacon_Subcontract_Rider.docx','Davis-Bacon Subcontract Rider (CDI Head Start projects)','Federal labor standards rider for subcontracts on federally funded jobs.'),
]
import json
js = '\n  /* patch COMPDOCS2: the lead / asbestos / OSHA papers the owner sent 11/06 (files in company-docs/) */\n  ' + json.dumps([[a, '/company-docs/' + H + '/' + f, t, d] for a, f, t, d in D], ensure_ascii=False) + '.forEach(function(x, i){ E.push({ id: \'cd2_\' + i, type: \'link\', folder: x[0], title: x[2], desc: x[3], url: x[1] }); });\n'
rep("  slot({ id: 'osha300', folder: '", js + "  slot({ id: 'osha300', folder: '")
open(P, 'w', encoding='utf-8').write(src)
print('patched')
