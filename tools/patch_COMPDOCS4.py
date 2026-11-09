#!/usr/bin/env python3
"""patch COMPDOCS4 (owner 11/9: GrayCo_CRM_Documents_Nov2026.zip — "put these in and make them do the right deploy").
Files in company-docs/7c2e9d41b8a05f63/: the owner's six papers + the black logo + the official EPA forms his index (06) lists
(downloaded from epa.gov). Company documents lists them in the right folders; the ☣️ Lead & asbestos card lists the job-file
forms each lead / asbestos / mold job needs (RRP recordkeeping checklist — keep 3 years; EPA test kit form when a kit was used;
the child-occupied notice forms; crew health-effects training) next to the customer papers."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*COMPDOCS4*/' in src: print('already patched'); sys.exit(0)
F = '/company-docs/7c2e9d41b8a05f63/'
rows = [
 ["leadasb", F + "02_RRP_Recordkeeping_Checklist.docx", "RRP renovation recordkeeping checklist (GrayCo)", "EPA 40 CFR 745.86 — one per lead job; keep in the job file 3 years with certs, test results and notices."],
 ["leadasb", F + "EPA_RRP_Recordkeeping_Checklist.pdf", "EPA sample renovation recordkeeping checklist (official PDF)", "EPA form (OMB 2070-0195, exp. 4/30/2029)."],
 ["leadasb", F + "EPA_Pre-Renovation_Disclosure_Form.pdf", "EPA sample pre-renovation form (official PDF)", "The EPA's own version of Lead 01 — the customer signs; Renovate Right pamphlet given first."],
 ["leadasb", "/epa-renovate-right.pdf", "EPA Renovate Right pamphlet (12 pages)", "Give before work starts on pre-1978 homes / child-occupied facilities (rides with Lead 01 when sent from the CRM)."],
 ["leadasb", F + "EPA_Renovation_Notice_and_Child-Occupied_Facility_Forms.pdf", "EPA renovation notice + child-occupied facility forms (official PDF)", "Common areas of multi-family housing; schools, daycares, Head Start — parents / guardians notified."],
 ["leadasb", F + "EPA_Test_Kit_Documentation_Form.pdf", "EPA test kit documentation form (official PDF)", "When an EPA-recognized test kit was used — goes to the owner within 30 days of the work."],
 ["leadasb", F + "EPA_Paint_Chip_Sample_Collection_Guide.pdf", "EPA paint chip sample collection guide", "How the certified renovator collects a paint chip sample for a lab."],
 ["leadasb", F + "06_EPA_and_State_Forms_Index.docx", "EPA and state forms index (TN / AR / MS) — every lead, asbestos or EPA job", "Which federal and state forms each hazard job needs, with the official links."],
 ["safety", F + "03_Health_Effects_Training_Lead_Asbestos_Mold.docx", "Employee training — health effects of lead, asbestos and MOLD", "Before starting work and every year, for employees and sub workers who may disturb paint, materials or mold."],
 ["legal", F + "04_GrayCo_Standard_Contract_Clauses_Hazmat.docx", "Standard contract clauses — hazardous materials (lead, mold, asbestos)", "For every contract and proposal (clause 2 when hazardous waste is hauled). Attorney review once before it becomes standard."],
 ["insurance", F + "01_Pollution_Insurance_App_CDI_Head_Start.docx", "Pollution insurance application — CDI Head Start (5 centers)", "Contractors pollution liability application for the CDI Head Start repairs (Brinkley, Clarendon, De Valls Bluff, Des Arc, Phillips)."],
 ["company", F + "05_Customer_Portal_Questionnaire_Spec.docx", "Customer portal questionnaire — build spec (Your Home + job type questions)", "Year built drives the lead / asbestos flags. Being built into the customer portal."],
 ["company", F + "grayco_logo_black.png", "GrayCo logo — black (PNG)", "For white backgrounds and print."],
]
import json
a = """].forEach(function(x, i){ E.push({ id: 'cd2_' + i, type: 'link', folder: x[0], title: x[2], desc: x[3], url: x[1] }); });"""
assert src.count(a) == 1
b = a + "\n  /*COMPDOCS4*/ " + json.dumps(rows, ensure_ascii=False) + ".forEach(function(x, i){ E.push({ id: 'cd4_' + i, type: 'link', folder: x[0], title: x[2], desc: x[3], url: x[1], access: x[0] === 'insurance' ? 'office' : 'all' }); });"
src = src.replace(a, b)
open(P, 'w', encoding='utf-8').write(src); print('patched')
