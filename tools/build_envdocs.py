#!/usr/bin/env python3
"""ENVDOCS: GrayCo's written employee protection programs — new versions, built from the originals (same letterhead, styles, footer).

    python3 tools/build_envdocs.py [--address "5796 Ferguson Rd, Bartlett, TN 38134"]

Reads the originals in company-docs/01667c529f454cf1/ and WRITES NEW FILES next to them (the originals are never changed or deleted):
  GrayCo_Lead_Safety_Program_v2.docx                 + engineering controls, housekeeping, protective clothing & equipment,
                                                       decon unit, medical removal protection, the per-job plan; records forever
  GrayCo_Respiratory_Protection_Program_v2.docx      current address; asbestos line by who does the asbestos work
  GrayCo_Asbestos_Awareness_and_Control_Program_v2.docx  current address; when it applies (a licensed sub does the work)
  GrayCo_Asbestos_Program.docx                       NEW full program for GrayCo's own crew — marked NOT IN USE
  GrayCo_Lead_06_Supply_and_Equipment_Checklist_v2.docx  + the decon unit parts
  GrayCo_Lead_Decon_Unit_Setup_Checklist.docx / .pdf one page: the set-up checklist + the layout diagram
  GrayCo_Lead_Decon_Unit_Purchase_List.docx          what to buy for a portable decon unit (no prices — the owner fills them in)
The current address comes from the CRM's company address setting default (index.html, gc-address) unless --address is given.
The program administrator / approval lines stay fill-in blanks: the CRM fills them from ⚙ Written programs when it hands out a copy.
Every requirement default is labelled "confirm with your state program / attorney" — none of this is legal advice.
"""
import copy, json, os, re, subprocess, sys
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'company-docs', '01667c529f454cf1')
SRC = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
m = re.search(r"var DEF = \{ current: '([^']+)'", SRC)
ADDR = sys.argv[sys.argv.index('--address') + 1] if '--address' in sys.argv else (m.group(1) if m else '')
assert ADDR, 'no company address'
REV = 'Revision 2 – November 17, 2026'
CORE = json.loads(subprocess.check_output(['node', '-e', "const C=require(process.argv[1]);console.log(JSON.stringify({decon:C.DEFAULT_RULES.decon,purchase:C.DECON_PURCHASE}))", os.path.join(ROOT, 'envcomp-core.js')]).decode())
RED = RGBColor(0xB9, 0x1C, 0x1C)


def W(p):
    return p._p if hasattr(p, '_p') else p


def text_of(el):
    return ''.join(t.text or '' for t in el.iter(qn('w:t')))


def find(doc, start, nth=0):
    hits = [p for p in doc.paragraphs if p.text.startswith(start)]
    assert len(hits) > nth, ('not found', start)
    return hits[nth]


def set_text(el, *texts):
    """the paragraph keeps its formatting; its runs get the texts (extra runs removed, missing runs cloned from the last)"""
    el = W(el)
    runs = el.findall(qn('w:r'))
    while len(runs) < len(texts):
        n = copy.deepcopy(runs[-1]); runs[-1].addnext(n); runs.append(n)
    for r in runs[len(texts):]:
        el.remove(r)
    for r, t in zip(runs, texts):
        ts = r.findall(qn('w:t'))
        for x in ts[1:]:
            r.remove(x)
        if not ts:
            x = OxmlElement('w:t'); r.append(x); ts = [x]
        ts[0].text = t
        ts[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    return el


def clone(proto, *texts):
    return set_text(copy.deepcopy(W(proto)), *texts)


class Ins:
    """insert paragraphs one after another, after an anchor"""
    def __init__(self, anchor):
        self.at = W(anchor)

    def add(self, el):
        self.at.addnext(el); self.at = el; return el


def replace_in(doc, old, new, count=1):
    n = 0
    for p in doc.paragraphs:
        for r in p.runs:
            if old in r.text:
                r.text = r.text.replace(old, new); n += 1
    for s in doc.sections:
        for p in s.footer.paragraphs:
            for r in p.runs:
                if old in r.text:
                    r.text = r.text.replace(old, new); n += 1
    assert n >= count, ('replace', old, n)
    return n


def address(doc):
    p = find(doc, '4007 Broadway Rd')
    set_text(p, ADDR + '  |  (901) 585-0944')


def revision(doc):
    p = find(doc, 'Effective November 2026')
    set_text(p, 'Effective November 2026  |  ' + REV)


def bold_red(el):
    for r in W(el).findall(qn('w:r')):
        rpr = r.find(qn('w:rPr'))
        if rpr is None:
            rpr = OxmlElement('w:rPr'); r.insert(0, rpr)
        if rpr.find(qn('w:b')) is None:
            rpr.append(OxmlElement('w:b'))
        c = OxmlElement('w:color'); c.set(qn('w:val'), 'B91C1C'); rpr.append(c)
    return el


def save(doc, name):
    out = os.path.join(DIR, name)
    assert not name.startswith('GrayCo_') or name not in ORIGINALS, ('never overwrite an original', name)
    doc.core_properties.revision = 2
    doc.save(out)
    print('wrote', name)


ORIGINALS = set(os.listdir(DIR)) - {'GrayCo_Lead_Safety_Program_v2.docx', 'GrayCo_Respiratory_Protection_Program_v2.docx', 'GrayCo_Asbestos_Awareness_and_Control_Program_v2.docx',
                                    'GrayCo_Asbestos_Program.docx', 'GrayCo_Lead_06_Supply_and_Equipment_Checklist_v2.docx', 'GrayCo_Lead_Decon_Unit_Setup_Checklist.docx',
                                    'GrayCo_Lead_Decon_Unit_Setup_Checklist.pdf', 'GrayCo_Lead_Decon_Unit_Purchase_List.docx'}
CRM_PLAN = ('Every lead and asbestos job (and every mold and trauma job) also gets a written Employee Protection Plan, generated by the GrayCo CRM from the job\'s '
            '🛡 Compliance panel: the job, scope and tasks, expected exposure and its basis, engineering and work-practice controls, respirators, protective clothing, '
            'hygiene facilities and the decon unit, housekeeping, the exposure monitoring schedule, medical surveillance and removal, training, signs, the competent person, '
            'the inspection schedule, record keeping and emergency contacts. It is signed by the competent person and the owner, every version is kept, and the job shows ⚠ until it is.')

# ═════════════════ 1 · Lead Safety Program v2 ═════════════════
d = Document(os.path.join(DIR, 'GrayCo_Lead_Safety_Program.docx'))
address(d); revision(d)
H = find(d, '6. RESPIRATORY PROTECTION'); B = find(d, 'Clean change area'); T = find(d, 'Respirators are selected')
x = Ins(find(d, 'Review this program at least once a year'))
x.add(clone(T, 'The program administrator and the owner\'s approval are filled in by the GrayCo CRM (⚙ Written programs) on every copy it prints; the CRM reminds the administrator when the yearly review is due.'))
x.add(clone(T, CRM_PLAN))
set_text(find(d, 'Records: the certified renovator is designated in writing'), 'Records: the certified renovator is designated in writing (Form F13). Keep at the job site: firm and renovator certificates, worker certifications, on-the-job training records for non-certified workers (Form F14), lead test results (Terracon and any GrayCo testing), the owner\'s signed Renovate Right receipt, parent notices, and photos of posted signs. GrayCo keeps all lead records permanently (owner\'s rule: "Always keep records for everything") – never less than 3 years after completion (Form F15).')
# renumber the later sections
for old, new in [('6. RESPIRATORY PROTECTION', '8. RESPIRATORY PROTECTION'), ('7. HYGIENE FACILITIES', '10. HYGIENE FACILITIES'), ('8. MEDICAL SURVEILLANCE', '11. MEDICAL SURVEILLANCE'),
                 ('9. TRAINING', '13. TRAINING'), ('10. SIGNS, NOTICES AND RECORDS', '14. SIGNS, NOTICES AND RECORDS')]:
    p = find(d, old); set_text(p, p.text.replace(old, new))
# 6 engineering controls + 7 housekeeping, before Respiratory protection
last5 = W(H).getprevious()
x = Ins(last5)
x.add(clone(H, '6. ENGINEERING CONTROLS'))
for t in ['Engineering and work-practice controls come first. Respirators are added to them – never used instead of them – wherever the controls alone do not keep exposure below the PEL.',
          'Isolation: the work area is closed off with containment (Section 5) – plastic floor layers, two-layer entry, critical barriers – and only authorized, trained workers enter.',
          'Ventilation: the HVAC serving the work area is shut down and its returns sealed (Section 5). HEPA-filtered negative air machines are used on abatement jobs and wherever the competent person sets them up; exhaust away from occupied areas and air intakes; pressure checked and logged on the daily log.',
          'Local exhaust: power tools are used on lead surfaces only with HEPA dust-collection shrouds (and never for sanding – Section 5).',
          'Wet methods: mist surfaces before and during scraping and during clean-up; keep debris damp until bagged.',
          'Equipment is inspected at the start of every shift (HEPA vacuums, negative air machines, filters, shrouds) and repaired or replaced before work continues.',
          'When exposure is above the PEL, the job\'s Employee Protection Plan lists the engineering and work-practice controls for each task (the written compliance program) – default; confirm with your state program.']:
    x.add(clone(B, t))
x.add(clone(H, '7. HOUSEKEEPING'))
for t in ['All surfaces are kept as free as practicable of lead dust and debris.',
          'Clean up only with HEPA vacuums and wet methods (wet wipe, wet mop). NO dry sweeping, NO brooms, NO compressed air to remove lead dust from any surface, clothing or equipment, and NO shop vacs or ordinary vacuums.',
          'HEPA vacuums are emptied and their filters changed inside containment, in a way that does not release dust; the bags and filters go out as lead waste.',
          'Clean up at least daily and before every break off site: debris picked up and bagged, surfaces HEPA vacuumed and wet wiped, bags gooseneck sealed, labeled and secured (Section 5).',
          'Dirty plastic is misted, folded inward and bagged; waste is kept in a closed, labeled, secured area until it is removed from the site.',
          'Tools and equipment are HEPA vacuumed and wet wiped before they leave the work area.']:
    x.add(clone(B, t))
# 9 protective clothing and equipment, after Respiratory protection
x = Ins(T)
x.add(clone(H, '9. PROTECTIVE CLOTHING AND EQUIPMENT'))
for t in ['GrayCo provides, at no cost to the employee, protective clothing and equipment for every employee exposed above the PEL, during interim protection, or where lead may irritate the skin or eyes: coveralls (disposable) or dedicated work clothing, hoods or painter\'s hats, shoe covers, gloves, and face shields or safety glasses.',
          'Clean protective clothing is provided at least weekly, and daily when exposure is above 200 µg/m³ (8-hour TWA) – default; confirm with your state program. Torn or damaged clothing is replaced right away.',
          'Laundering and disposal: disposable clothing is bagged as lead waste at every exit. Reusable clothing is taken off in the change area, put in closed, labeled containers (lead-contaminated clothing – do not remove dust by blowing or shaking) and cleaned by GrayCo\'s arrangement; whoever launders it is told in writing about the lead hazard.',
          'Change areas: protective clothing is put on and taken off only in the change area or the decon unit (Section 10); street clothes are kept separate and clean.',
          'No take-home: no employee takes contaminated clothing, shoes or equipment home. No one removes lead from clothing or equipment by blowing, shaking or brushing.',
          'The competent person checks at the start of every shift that enough clothing and equipment is on site for every exit and re-entry (Lead 06 checklist).']:
    x.add(clone(B, t))
# 10 hygiene: the decon unit
dec = CORE['decon']
x = Ins(find(d, 'Eating and break areas outside the work area'))
x.add(clone(H, '10.1 DECON UNIT (LEAD)'))
for t in ['When: ' + dec['note'],
          'Types: a portable decon trailer, a decon built on site (framed or poly, with flap doors), or – for small jobs where the program allows it – a hand-and-face wash station with a separate change area.',
          'Layout – one-way flow: work area → DIRTY / equipment room (take off suits, booties and gloves; bag-out) → WASH (shower, or hand-and-face wash station) → CLEAN change room (street clothes). No one enters the clean room in work clothes, and nothing from the work area goes into the clean room. See the Decon Unit Set-up Checklist and layout diagram.',
          'Supplies: ' + dec['supplies'] + '.',
          'Daily cleaning and inspection: the decon unit is cleaned (HEPA vacuum and wet wipe the dirty room; clean the wash and clean rooms), restocked and inspected every work day; recorded on the daily log with a photo.',
          'Wash water: collected and contained, filtered and/or tested as the state program and the local utility require, and disposed of accordingly – never dumped on the ground, into a storm drain or onto plants. Default – confirm with your state program and the local utility.',
          'No eating, drinking, smoking, vaping, chewing gum or tobacco, or applying cosmetics anywhere except the clean area / break area, and only after washing hands and face.',
          'In the CRM: the job\'s 🛡 Compliance panel shows ⚠ until the decon set-up checklist is completed and photographed; the daily log records the daily decon check, supplies and wash-water handling.']:
    x.add(clone(B, t))
# 11 medical surveillance: removal moves to 12, records forever
set_text(find(d, 'Medical removal at 50'), 'Medical removal and medical removal protection: see Section 12.')
set_text(find(d, 'Medical records kept for the duration'), 'Medical records are confidential (only the employee, the admins and the Office Manager see them – the CRM\'s private medical records) and kept permanently (owner\'s rule) – never less than the duration of employment plus 30 years.')
x = Ins(find(d, 'Medical records are confidential'))
x.add(clone(H, '12. MEDICAL REMOVAL PROTECTION'))
for t in ['Default – follows the medical removal provisions of the federal lead-in-construction standard (29 CFR 1926.62). Confirm every number and step with your attorney / state program.',
          'Removal criteria: an employee is removed from work with lead exposure at or above the action level (a) when a periodic blood lead test and the follow-up test both show 50 µg/dL or more, or (b) whenever the physician\'s written medical opinion finds a medical condition that puts the employee at increased risk from lead exposure. The physician\'s written opinion controls, including any limits it recommends.',
          'Return to work: blood lead removal ends after two consecutive blood lead tests at or below 40 µg/dL; medical-condition removal ends when the physician\'s final written opinion says the employee no longer has the condition. GrayCo follows the physician\'s written opinion on any limits after return.',
          'Follow-up testing: while removed, the employee\'s blood lead is tested at least monthly (the CRM schedules the follow-up tests) until the return criteria are met.',
          'Protection benefits: for up to 18 months for each removal, GrayCo keeps the employee\'s earnings, seniority and all other employment rights and benefits as if the employee had not been removed. The CRM\'s payroll adds the "Medical removal protection" line (default: the average of the last 6 weeks before removal). The amount is reduced by workers\' compensation wage replacement and by pay for other work during the removal period.',
          'Other work: the employee may be assigned work without lead exposure; removal never reduces pay. A removed employee is never scheduled on lead exposure work (the CRM warns the scheduler).',
          'Physician review: the employee may have the determination reviewed by a second physician – confirm the review procedure with your attorney / state program.',
          'Records: every removal (dates, the written opinion, follow-up results, return and the pay kept) is kept in the employee\'s private medical record – permanently.']:
    x.add(clone(B, t))
# 13 training: the plan + the equipment
x = Ins(find(d, 'Record training on the Lead Training Record'))
x.add(clone(B, 'Before each job: the crew goes over the job\'s Employee Protection Plan, the respirators, protective clothing and decon unit for that job, and where the signs are posted. Training records are kept permanently.'))
set_text(find(d, 'Keep RRP records 3 years'), 'GrayCo keeps every record permanently (owner\'s rule: "Always keep records for everything") – longer than the minimums (RRP 3 years; exposure monitoring 30 years; medical records the duration of employment plus 30 years; training 1 year beyond employment – confirm with your state program).')
# 15 the per-job plan
x = Ins(find(d, 'GrayCo keeps every record permanently'))
x.add(clone(H, '15. PER-JOB EMPLOYEE PROTECTION PLAN'))
for t in [CRM_PLAN,
          'The plan names the competent person / supervisor on site and is signed by the competent person and the owner before the work starts. When the job changes (kinds of work, supervisors, the decon set-up, the plan details) the CRM asks for a new version; every version is kept.',
          'A printed copy goes in the job\'s field binder with this program.']:
    x.add(clone(B, t))
replace_in(d, 'Lead Safety Program | Page', 'Lead Safety Program (Rev. 2) | Page')
save(d, 'GrayCo_Lead_Safety_Program_v2.docx')

# ═════════════════ 2 · Respiratory Protection Program v2 ═════════════════
d = Document(os.path.join(DIR, 'GrayCo_Respiratory_Protection_Program.docx'))
address(d); revision(d)
T = find(d, 'GrayCo identifies respiratory hazards')
set_text(find(d, 'Asbestos – GrayCo employees do not perform asbestos work'), 'Asbestos – depends on who does the asbestos work on the job (the CRM records it on each job\'s 🛡 Compliance panel). Licensed abatement subcontractor (GrayCo\'s practice at this time): the subcontractor provides respirators to its workers under its own program, and GrayCo employees stay out of the regulated area. GrayCo crew (only once the owner puts the GrayCo Asbestos Program in use): respirators are selected under the GrayCo Asbestos Program (Section 7) and this program – at least a half-face respirator with P100 filters for Class I–III work, more where the exposure assessment requires (confirm with your state program).')
set_text(find(d, 'Records kept: written program'), 'Records kept: written program (current, with every earlier version), fit test records, training records, and medical recommendations (kept confidential under 29 CFR 1910.1020). GrayCo keeps all of them permanently (owner\'s rule: "Always keep records for everything").')
x = Ins(find(d, 'Review this program at least once a year'))
x.add(clone(T, 'The program administrator and the owner\'s approval are filled in by the GrayCo CRM (⚙ Written programs) on every copy it prints; the CRM reminds the administrator when the yearly review is due. Each job\'s Employee Protection Plan names the respirators for that job and shows each wearer\'s fit test and medical clearance status (status only – never a result).'))
replace_in(d, 'Respiratory Protection Program | Page', 'Respiratory Protection Program (Rev. 2) | Page')
save(d, 'GrayCo_Respiratory_Protection_Program_v2.docx')

# ═════════════════ 3 · Asbestos Awareness and Control Program v2 ═════════════════
d = Document(os.path.join(DIR, 'GrayCo_Asbestos_Awareness_and_Control_Program.docx'))
address(d); revision(d)
T = find(d, 'GrayCo employees do not disturb asbestos-containing material')
x = Ins(T)
x.add(clone(T, 'When this program applies: on every job where a licensed asbestos abatement subcontractor does the asbestos work – the CRM\'s setting for every asbestos job ("Asbestos work by: licensed sub"). If GrayCo\'s own crew is ever to perform asbestos work, the GrayCo Asbestos Program applies instead, once the owner puts it in use.'))
set_text(find(d, 'Training records – at least 1 year beyond employment'), 'Training records – kept permanently (owner\'s rule: "Always keep records for everything"; the minimum is 1 year beyond employment).')
B = find(d, 'Stop-work forms and releases')
x = Ins(B)
x.add(clone(B, 'The subcontractor\'s license, competent person, work plan, insurance, state notification, air monitoring and clearance results and the written release are entered on the job\'s 🛡 Compliance panel (Licensed asbestos sub) – the CRM keeps every copy permanently and shows ⚠ / ⛔ until they are in.'))
C = find(d, '☐  Area released to GrayCo in writing')
x = Ins(find(d, '☐  Work plan received'))
x.add(clone(C, '☐  Subcontractor\'s competent person / licensed supervisor named: ____________________  Phone: ______________'))
x = Ins(C)
x.add(clone(C, '☐  Every item above entered in the CRM (job → 🛡 Compliance → Licensed asbestos sub) – date: ______'))
replace_in(d, 'Asbestos Program | Page', 'Asbestos Awareness and Control Program (Rev. 2) | Page')
save(d, 'GrayCo_Asbestos_Awareness_and_Control_Program_v2.docx')

# ═════════════════ 4 · NEW GrayCo Asbestos Program (GrayCo crew) — NOT IN USE ═════════════════
d = Document(os.path.join(DIR, 'GrayCo_Asbestos_Awareness_and_Control_Program.docx'))
address(d)
P_HEAD = copy.deepcopy(W(find(d, '1. GRAYCO POLICY'))); P_TEXT = copy.deepcopy(W(find(d, 'GrayCo employees do not disturb')))
P_BUL = copy.deepcopy(W(find(d, 'Never drill, cut, sand'))); P_FILL = copy.deepcopy(W(find(d, 'Program administrator:')))
P_FILL2 = copy.deepcopy(W(find(d, 'Approved by (owner):'))); P_BOX = copy.deepcopy(W(find(d, '☐  Work plan received')))
P_FORM = copy.deepcopy(W(find(d, 'ABATEMENT CONTRACTOR COORDINATION'))); P_SUB = copy.deepcopy(W(find(d, 'Attendees (by signing')))
P_BREAK = copy.deepcopy(W(find(d, 'ABATEMENT CONTRACTOR COORDINATION')).getprevious())
P_SIGN = copy.deepcopy(W(find(d, 'Printed name:')))
set_text(find(d, 'ASBESTOS AWARENESS AND CONTROL PROGRAM'), 'GRAYCO ASBESTOS PROGRAM (GRAYCO CREW)')
set_text(find(d, 'OSHA 29 CFR 1926.1101'), 'OSHA 29 CFR 1926.1101 (construction asbestos standard) – EPA NESHAP 40 CFR 61 Subpart M – state asbestos programs (TN · AR · MS)')
eff = find(d, 'Effective November 2026'); set_text(eff, 'Prepared November 17, 2026')
body = W(eff).getparent()
started = False
for el in list(body):
    if el is W(eff):
        started = True; continue
    if started and el.tag != qn('w:sectPr'):
        body.remove(el)
x = Ins(eff)
def h(t): x.add(clone(P_HEAD, t))
def p(t): x.add(clone(P_TEXT, t))
def b(*ts):
    for t in ts: x.add(clone(P_BUL, t))
def box(*ts):
    for t in ts: x.add(clone(P_BOX, '☐  ' + t))
x.add(bold_red(clone(P_TEXT, 'STATUS: NOT IN USE – GrayCo\'s crew does not perform asbestos work at this time. GrayCo hires a licensed asbestos abatement contractor (owner, 11/17/2026: "GrayCo will hire an asbestos contractor for now"), and the Asbestos Awareness and Control Program applies. This program is kept ready: the owner puts it in use (CRM: ⚙ Written programs → In use) and sets a job to "Asbestos work by: GrayCo crew" only after the licenses, training, medical surveillance and equipment below are in place.')))
h('1. PURPOSE AND SCOPE')
p('This program protects GrayCo employees who perform asbestos work themselves under the OSHA construction asbestos standard (29 CFR 1926.1101): removal, repair, encapsulation, enclosure, and maintenance or clean-up that disturbs asbestos-containing material (ACM) or presumed ACM (PACM). It is GrayCo\'s written program for that work and is used together with the Respiratory Protection Program, the Hazard Communication Program and each job\'s Employee Protection Plan.')
x.add(clone(P_FILL, 'Program administrator: ', '\t\tPhone: ', '\t'))
x.add(clone(P_FILL2, 'Approved by (owner): ', '\t\tDate: ', '\t'))
p('Review this program at least once a year and whenever work, materials or regulations change. Every requirement below is GrayCo\'s default reading – confirm with your state program and your attorney before relying on it.')
h('2. KEY LIMITS AND WORK CLASSES')
b('Permissible exposure limit (PEL): 0.1 fiber per cubic centimeter of air (f/cc), 8-hour time-weighted average.',
  'Excursion limit: 1.0 f/cc averaged over a sampling period of 30 minutes.',
  'Class I – removal of thermal system insulation (TSI) and surfacing ACM / PACM.',
  'Class II – removal of other ACM that is not TSI or surfacing material (for example resilient flooring, roofing, siding, transite, mastics).',
  'Class III – repair and maintenance where ACM / PACM is likely to be disturbed.',
  'Class IV – maintenance and custodial work where employees contact but do not disturb ACM / PACM, and clean-up of waste and debris from Class I–III work.')
h('3. COMPETENT PERSON')
b('A competent person is named for every asbestos job, in writing, on the job\'s Employee Protection Plan – trained to the level the work class requires (state-licensed asbestos supervisor; confirm the license and accreditation with your state program).',
  'The competent person sets up the regulated area and the enclosure, makes the exposure assessment, selects the methods for the work class, checks the negative pressure, supervises the decontamination procedures, and stops the work when conditions are not safe.',
  'Inspections: at the start of every shift, during the work, and at least once per shift (more often for Class I work) – enclosure and barrier integrity, negative pressure (manometer readings logged), work practices, respirators and protective clothing, decontamination. Recorded on the daily log (Competent Person Daily Inspection form below).')
h('4. REGULATED AREAS')
b('Every Class I, II and III job, and every area where exposure may exceed the PEL, is a regulated area – marked off with barriers or critical barriers and posted with DANGER signs at every entrance (Section 12).',
  'Only authorized, trained employees wearing the required respirator and protective clothing enter. No eating, drinking, smoking, chewing tobacco or gum, or applying cosmetics in the regulated area.',
  'The regulated area is supervised by the competent person while work goes on.')
h('5. EXPOSURE ASSESSMENT AND MONITORING')
b('Initial exposure assessment by the competent person before or at the start of each job and each work class – based on the material, the methods, past monitoring and objective data.',
  'Negative exposure assessment: GrayCo may show that exposure will stay below the PEL and excursion limit only with objective data, prior monitoring of the same work by equally trained employees under the same conditions, or initial monitoring of this job – documented on the Negative Exposure Assessment form below.',
  'Personal breathing-zone monitoring (accredited lab, PCM) representative of each employee\'s 8-hour TWA and 30-minute excursion exposure for each work class. Class I and II: daily monitoring unless a negative exposure assessment is on file for the job – default; confirm with your state program.',
  'Employees are told their results in writing as soon as possible (the CRM puts each personal result in the worker\'s own records) and may observe the monitoring.',
  'Clearance: final visual inspection and clearance air sampling by an independent, accredited party before the regulated area is released (the CRM blocks close-out until clearance passes).')
h('6. METHODS OF COMPLIANCE BY WORK CLASS')
b('All classes: HEPA vacuums; wet methods (amended water) during handling, removal, cutting and clean-up; prompt clean-up and disposal in leak-tight containers. Prohibited: high-speed abrasive disc saws without point-of-cut HEPA ventilation, compressed air to remove ACM (unless used with an enclosed HEPA ventilation system), dry sweeping, shoveling or other dry clean-up, and employee rotation to reduce exposure.',
  'Class I: negative pressure enclosure (or another control method the standard allows), critical barriers over all openings, HVAC isolated, impermeable drop cloths, glove bags for small TSI work; the competent person verifies the enclosure before work starts. Confirm the methods and the supervisor / worker accreditation with your state program.',
  'Class II: critical barriers or isolation, impermeable drop cloths, and the specific methods for the material (for example: flooring removed wet without sanding, roofing removed intact where possible, transite removed whole).',
  'Class III: wet methods, local HEPA exhaust or isolation (mini-enclosure / glove bag) where practicable; impermeable drop cloths and barriers around the work.',
  'Class IV: wet methods and HEPA vacuums for clean-up; employees trained to awareness level and wearing the respirator required for the area they work in.')
h('7. RESPIRATORY PROTECTION')
b('Respirators are selected and used under the GrayCo Respiratory Protection Program (medical evaluation, fit test, training, maintenance).',
  'Required for: Class I work; Class II and III work without a negative exposure assessment or where wet methods are not used; work in a regulated area; exposure above the PEL or excursion limit; and emergencies.',
  'At least a half-face respirator with P100 (HEPA) filters for Class I–III work; full-face, PAPR or supplied air where the exposure assessment requires a higher protection factor; a PAPR is provided when an employee chooses one and it gives adequate protection – confirm with your state program.')
h('8. PROTECTIVE CLOTHING')
b('Provided at no cost: disposable full-body coveralls with hoods, foot coverings and gloves (and face shields / goggles where needed) for every employee in a regulated area or exposed above the PEL.',
  'Removed only in the equipment room of the decon; disposable clothing bagged as asbestos waste; reusable clothing and equipment cleaned or laundered by GrayCo\'s arrangement in labeled, impermeable bags – never taken home.',
  'The competent person checks clothing for tears every shift; torn clothing is repaired or replaced at once.')
h('9. HYGIENE AND DECONTAMINATION')
b('Decontamination area next to the regulated area: equipment room → shower room → clean room, entered and left only through it (Class I work and wherever the standard requires; confirm with your state program).',
  'Employees shower before leaving the decon; no one leaves the regulated area in contaminated clothing.',
  'Lunch / break areas are outside the regulated area; employees wash before eating, drinking or smoking.')
h('10. MEDICAL SURVEILLANCE')
b('Medical surveillance for every employee who for a combined 30 or more days per year does Class I, II or III work, or is exposed at or above the PEL or excursion limit, and for every employee required to wear a negative-pressure respirator – default; confirm with your physician / state program.',
  'Before assignment, every year, and at the end of employment: medical and work history, physical examination with emphasis on the lungs, pulmonary function test, the standard\'s respiratory disease questionnaire, and any other test the physician recommends.',
  'GrayCo gives the physician the job information and receives a written opinion, given to the employee within 30 days; results are confidential (the CRM\'s private medical records) and kept permanently.')
h('11. TRAINING')
b('Before the first asbestos job and every year: training at the level of the work class (Class I / II: the EPA Model Accreditation Plan worker / supervisor course or its state equivalent; Class III: the 16-hour O&M course level; Class IV: at least 2 hours awareness) – confirm the courses, hours and state accreditation with your state program.',
  'Content includes: health effects (asbestosis, lung cancer, mesothelioma; smoking raises the risk), where ACM is found, the work practices and controls for each class, respirators and protective clothing, decontamination, medical surveillance, the signs and labels, and this program.',
  'Training records (course, hours, date, trainer, certificates) are kept permanently.')
h('12. SIGNS AND LABELS')
b('DANGER signs at every regulated area entrance (legend from the GrayCo Lead & Asbestos Warning Signs, in English and Spanish – verify the legend against the current OSHA / state rules).',
  'Labels on every bag, drum and container of asbestos waste and on ACM / PACM left in place; GrayCo tells other employers and building occupants where ACM is.')
h('13. HOUSEKEEPING AND WASTE')
b('HEPA vacuum and wet clean; no dry sweeping, shoveling or compressed air.',
  'Waste is kept wet, sealed in leak-tight, labeled containers (6-mil bags, double-bagged), kept in a secured area and transported and disposed of at an approved landfill with a waste shipment record – confirm the state and NESHAP requirements.')
h('14. MULTI-EMPLOYER COORDINATION')
b('Before the work: GrayCo tells the building owner, the general contractor and every other employer on site where the regulated area is, the schedule and the protective measures; other trades stay out of the regulated area.',
  'GrayCo makes sure its work does not expose other employers\' workers, and checks daily that barriers and signs are intact.')
h('15. RECORD KEEPING')
b('Exposure monitoring and objective data, medical surveillance, training, the competent person\'s inspections, notifications, clearance results and waste shipment records are kept permanently (owner\'s rule: "Always keep records for everything") – longer than the minimums (exposure monitoring 30 years; medical the duration of employment plus 30 years; training 1 year beyond employment – confirm with your state program).',
  'Records are kept in the CRM (job → 🛡 Compliance; each worker\'s own health & exposure records) and the end-of-job record package; employees and their representatives may see their own records.')
h('16. STATE LICENSING AND NOTIFICATION CHECKLIST (TN · AR · MS)')
p('A checklist – NOT statute text. Confirm every form, fee, threshold and number of days with the state program before each job.')
b('Tennessee (TDEC): asbestos contractor / firm license or accreditation as required; supervisor and worker accreditation; notification before regulated renovation or demolition (the CRM default is 10 working days) – confirm.',
  'Arkansas (Division of Environmental Quality): asbestos abatement contractor license; licensed supervisor / workers; notification before abatement or demolition (CRM default 10 working days) – confirm.',
  'Mississippi (MDEQ): asbestos contractor certification / license; supervisor and worker accreditation; notification before abatement or demolition (CRM default 10 working days) – confirm.',
  'Local building / demolition permits where the city or county requires them.')
h('17. PER-JOB EMPLOYEE PROTECTION PLAN')
p(CRM_PLAN)
x.add(copy.deepcopy(P_BREAK))
x.add(clone(P_FORM, 'COMPETENT PERSON DAILY INSPECTION'))
x.add(clone(P_FILL, 'Job: ', '\t\tDate: ', '\t'))
x.add(clone(P_FILL, 'Competent person: ', '\t\tWork class: ', '\t'))
box('Regulated area marked; DANGER signs at every entrance', 'Critical barriers / enclosure intact', 'Negative pressure verified – manometer reading: ______ (time ______)',
    'Decon unit clean and working; showers / water supply OK', 'Every worker: respirator (fit tested), protective clothing, training current', 'Wet methods in use; no prohibited practices',
    'Waste wet, sealed, labeled and secured', 'Personal / area samples taken today: ______', 'Problems found and corrected: ____________________________')
x.add(clone(P_FILL, 'Signature: ', '\t\tTime: ', '\t'))
x.add(copy.deepcopy(P_BREAK))
x.add(clone(P_FORM, 'NEGATIVE EXPOSURE ASSESSMENT – ASBESTOS'))
x.add(clone(P_FILL, 'Job / location: ', '\t\tDate: ', '\t'))
x.add(clone(P_FILL, 'Work class / task: ', '\t\tMaterial: ', '\t'))
box('Objective data – source: ____________________', 'Prior monitoring (same work, equally trained employees, same conditions, within 12 months) – result: ______ f/cc', 'Initial monitoring of this job – lab: ______ result: ______ f/cc (8-hr TWA) / ______ f/cc (30 min)')
p('Determination: exposure for this task under these conditions is below the PEL and the excursion limit. Valid only while the task, material and controls stay the same.')
x.add(clone(P_FILL, 'Competent person: ', '\t\tSignature: ', '\t'))
x.add(copy.deepcopy(P_BREAK))
x.add(clone(P_FORM, 'ASBESTOS TRAINING RECORD'))
x.add(clone(P_FILL, 'Trainer: ', '\t\tDate: ', '\t'))
x.add(clone(P_FILL, 'Course / work class: ', '\t\tLength (hours): ', '\t'))
x.add(clone(P_SUB, 'Attendees (by signing, each confirms the training was received and understood)'))
for i in range(12):
    x.add(copy.deepcopy(P_SIGN))
replace_in(d, 'Asbestos Program | Page', 'GrayCo Asbestos Program (GrayCo crew – NOT IN USE) | Page')
save(d, 'GrayCo_Asbestos_Program.docx')

# ═════════════════ 5 · Lead 06 checklist v2 — the decon unit parts ═════════════════
d = Document(os.path.join(DIR, 'GrayCo_Lead_06_Supply_and_Equipment_Checklist.docx'))
address(d)
SH = find(d, 'TESTING AND RECORDS'); BX = find(d, '☐  Cones')
x = Ins(W(SH).getprevious())
x.add(clone(SH, 'DECON UNIT (LEAD ABATEMENT / ABOVE THE PEL – CONFIRM WITH YOUR STATE PROGRAM)'))
for t in ['Decon unit: portable decon trailer, or framing + 6-mil poly + zipper / flap doors to build one on site',
          'Wash station or portable shower, clean water supply (tank / hose), soap, paper or cloth towels',
          'Wash-water collection drum, filter (e.g. 5 micron) and labels – never dump wash water on the ground or down a storm drain',
          'Lockers or sealed bags for street clothes; bench; mirror',
          'Extra disposable suits, booties and gloves; bag-out bags + labels + duct tape for the dirty room',
          'HEPA vacuum for the dirty room (+ spare filters / bags)',
          'Tack pad for the dirty-side entrance',
          'Work lights for each room; GFCI-protected cords',
          'Decon signs: DIRTY ROOM · WASH · CLEAN ROOM (one-way arrows), HAND WASH STATION, NO EATING, DRINKING OR SMOKING',
          'Decon Unit Set-up Checklist (one page) + a phone / camera for the set-up photo']:
    x.add(clone(BX, '☐  ' + t))
replace_in(d, 'Lead Job Supply Checklist | Page', 'Lead Job Supply Checklist (Rev. 2) | Page')
save(d, 'GrayCo_Lead_06_Supply_and_Equipment_Checklist_v2.docx')

# ═════════════════ 6 · the decon set-up checklist (one page, with the layout diagram) ═════════════════
d = Document(os.path.join(DIR, 'GrayCo_Lead_06_Supply_and_Equipment_Checklist.docx'))
address(d)
TT = find(d, 'LEAD JOB SUPPLY AND EQUIPMENT CHECKLIST'); set_text(TT, 'LEAD DECON UNIT SET-UP CHECKLIST')
set_text(find(d, 'Load Before Every Lead Job'), 'Before lead work above the PEL / during interim protection – confirm with your state program')
F1 = find(d, 'Job: '); F2 = find(d, 'Certified renovator: ')
SH = copy.deepcopy(W(find(d, 'SET IT UP SAFELY'))); BX = copy.deepcopy(W(find(d, '☐  Cones'))); SG = copy.deepcopy(W(find(d, 'Certified renovator signature')))
body = W(F2).getparent(); started = False
for el in list(body):
    if el is W(F2):
        started = True; continue
    if started and el.tag != qn('w:sectPr'):
        body.remove(el)
set_text(F1, 'Job: ', '\t\tDate set up: ', '\t'); set_text(F2, 'Set up by: ', '\t\tType: ', '\t')
x = Ins(F2)
x.add(clone(F2, 'Location: ', '\t\t', '\t'))
x.add(clone(SH, 'LAYOUT – ONE-WAY FLOW'))
tbl = d.add_table(rows=1, cols=7)
tbl.style = d.styles['Table Grid'] if 'Table Grid' in [s.name for s in d.styles] else tbl.style
cells = ['WORK AREA', '→', 'DIRTY / EQUIPMENT ROOM\nsuits, booties, gloves off · bag-out · HEPA vac', '→', 'WASH\nshower or hand & face wash · soap · towels · wash water collected', '→', 'CLEAN ROOM\nstreet clothes · lockers / bags · mirror  → EXIT']
fills = ['FEE2E2', None, 'FECACA', None, 'DBEAFE', None, 'DCFCE7']
for c, t, f in zip(tbl.rows[0].cells, cells, fills):
    c.text = ''
    lines = t.split('\n')
    run = c.paragraphs[0].add_run(lines[0]); run.bold = True; run.font.size = Pt(9 if t != '→' else 16)
    for ln in lines[1:]:
        r2 = c.paragraphs[0].add_run('\n' + ln); r2.font.size = Pt(7.5)
    if f:
        tcPr = c._tc.get_or_add_tcPr(); sh = OxmlElement('w:shd'); sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), f); tcPr.append(sh)
x.add(tbl._tbl)
x.add(clone(SH, 'SET-UP CHECKLIST (each item: default – confirm with your state program)'))
for t in dec['setup']:
    x.add(clone(BX, '☐  ' + t))
x.add(clone(BX, '☐  Photo of the set-up taken and added in the CRM (job → 🛡 Compliance → 🧼 Decon set-up)'))
x.add(clone(SG, 'Competent person signature: ', '\t\tDate: ', '\t'))
replace_in(d, 'Lead Job Supply Checklist | Page', 'Lead Decon Unit Set-up Checklist | Page')
save(d, 'GrayCo_Lead_Decon_Unit_Setup_Checklist.docx')

# the same page as a PDF with the drawn layout diagram
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
pdfp = os.path.join(DIR, 'GrayCo_Lead_Decon_Unit_Setup_Checklist.pdf')
c = canvas.Canvas(pdfp, pagesize=letter); Wd, Ht = letter
c.setTitle('GrayCo Lead Decon Unit Set-up Checklist'); c.setAuthor('GrayCo Construction Services, LLC')
c.setFont('Helvetica-Bold', 13); c.drawCentredString(Wd / 2, Ht - 46, 'GrayCo Construction Services, LLC')
c.setFont('Helvetica', 8.5); c.drawCentredString(Wd / 2, Ht - 58, ADDR + '  |  (901) 585-0944')
c.setFont('Helvetica-Bold', 15); c.drawCentredString(Wd / 2, Ht - 84, 'LEAD DECON UNIT SET-UP CHECKLIST')
c.setFont('Helvetica', 8.5); c.drawCentredString(Wd / 2, Ht - 97, 'Before lead work above the PEL / during interim protection — every item is a default: confirm with your state program')
y = Ht - 122; c.setFont('Helvetica', 9.5)
for a, b2 in [('Job:', 'Date set up:'), ('Set up by:', 'Type (trailer / built on site / wash station):'), ('Location:', '')]:
    c.drawString(48, y, a); c.line(48 + c.stringWidth(a) + 4, y - 2, 300, y - 2)
    if b2:
        c.drawString(312, y, b2); c.line(312 + c.stringWidth(b2) + 4, y - 2, Wd - 48, y - 2)
    y -= 18
# the diagram
c.setFont('Helvetica-Bold', 10); c.drawString(48, y - 4, 'LAYOUT — ONE-WAY FLOW'); y -= 16
boxes = [('WORK AREA', ['containment'], colors.HexColor('#FEE2E2')), ('DIRTY ROOM', ['equipment room', 'suits, booties, gloves off', 'bag-out · HEPA vac'], colors.HexColor('#FECACA')),
         ('WASH', ['shower or hand &', 'face wash station', 'soap · towels', 'wash water collected'], colors.HexColor('#DBEAFE')), ('CLEAN ROOM', ['street clothes', 'lockers / bags', 'mirror · bench'], colors.HexColor('#DCFCE7'))]
bw, gap, bh = 100, 34, 92; x0 = (Wd - (4 * bw + 3 * gap + 40)) / 2; by = y - bh
for i, (t, lines, col) in enumerate(boxes):
    bx = x0 + i * (bw + gap)
    c.setFillColor(col); c.setStrokeColor(colors.black); c.rect(bx, by, bw, bh, fill=1, stroke=1); c.setFillColor(colors.black)
    c.setFont('Helvetica-Bold', 10); c.drawCentredString(bx + bw / 2, by + bh - 16, t); c.setFont('Helvetica', 7.5)
    for j, ln in enumerate(lines):
        c.drawCentredString(bx + bw / 2, by + bh - 30 - j * 10, ln)
    if i < 3:   # the flap door + the arrow
        ax = bx + bw; c.setLineWidth(2); c.line(ax + 4, by + bh / 2, ax + gap - 6, by + bh / 2)
        c.line(ax + gap - 12, by + bh / 2 + 5, ax + gap - 6, by + bh / 2); c.line(ax + gap - 12, by + bh / 2 - 5, ax + gap - 6, by + bh / 2); c.setLineWidth(1)
        c.setFont('Helvetica', 6); c.drawCentredString(ax + gap / 2, by + bh / 2 - 14, 'flap door')
ex = x0 + 4 * bw + 3 * gap; c.setLineWidth(2); c.line(ex + 4, by + bh / 2, ex + 34, by + bh / 2); c.line(ex + 28, by + bh / 2 + 5, ex + 34, by + bh / 2); c.line(ex + 28, by + bh / 2 - 5, ex + 34, by + bh / 2); c.setLineWidth(1)
c.setFont('Helvetica-Bold', 8); c.drawString(ex + 6, by + bh / 2 + 8, 'EXIT')
c.setFont('Helvetica', 7); c.drawCentredString(Wd / 2, by - 12, 'Tack pad at the dirty-side entrance · signs on each door · light + GFCI power in every room · never walk back from CLEAN to DIRTY in work clothes')
y = by - 32
c.setFont('Helvetica-Bold', 10); c.drawString(48, y, 'SET-UP CHECKLIST'); y -= 15
from reportlab.lib.utils import simpleSplit
for t in dec['setup'] + ['Photo of the set-up taken and added in the CRM (job → Compliance → Decon set-up)']:
    lines = simpleSplit(t, 'Helvetica', 9, Wd - 120)
    c.rect(50, y - 2, 8, 8)
    c.setFont('Helvetica', 9)
    for j, ln in enumerate(lines):
        c.drawString(66, y - j * 11, ln)
    y -= 11 * len(lines) + 5
y -= 6; c.setFont('Helvetica-Bold', 9); c.drawString(48, y, 'SUPPLIES'); y -= 12; c.setFont('Helvetica', 8.5)
for ln in simpleSplit(dec['supplies'], 'Helvetica', 8.5, Wd - 96):
    c.drawString(48, y, ln); y -= 11
y -= 14; c.setFont('Helvetica', 9.5); c.drawString(48, y, 'Competent person signature:'); c.line(186, y - 2, 380, y - 2); c.drawString(392, y, 'Date:'); c.line(420, y - 2, Wd - 48, y - 2)
c.setFont('Helvetica', 7); c.drawCentredString(Wd / 2, 30, 'GrayCo Construction Services, LLC | Lead Decon Unit Set-up Checklist | kept with the job records permanently')
c.showPage(); c.save(); print('wrote', os.path.basename(pdfp))

# ═════════════════ 7 · the decon purchase list (no prices — the owner fills them in) ═════════════════
d = Document(os.path.join(DIR, 'GrayCo_Lead_06_Supply_and_Equipment_Checklist.docx'))
address(d)
set_text(find(d, 'LEAD JOB SUPPLY AND EQUIPMENT CHECKLIST'), 'PORTABLE LEAD DECON UNIT – PURCHASE LIST')
set_text(find(d, 'Load Before Every Lead Job'), 'What to buy to set up one portable decon unit – quantities are starting points; prices and vendors to fill in')
F1 = find(d, 'Job: '); F2 = find(d, 'Certified renovator: ')
SH = copy.deepcopy(W(find(d, 'SET IT UP SAFELY'))); BX = copy.deepcopy(W(find(d, '☐  Cones'))); SG = copy.deepcopy(W(find(d, 'Certified renovator signature')))
body = W(F2).getparent(); started = False
for el in list(body):
    if el is W(F2):
        started = True; continue
    if started and el.tag != qn('w:sectPr'):
        body.remove(el)
set_text(F1, 'Prepared by: ', '\t\tDate: ', '\t'); set_text(F2, 'Approved by (owner): ', '\t\tBudget: ', '\t')
x = Ins(F2)
grp = None
for it in CORE['purchase']:
    if it['group'] != grp:
        grp = it['group']; x.add(clone(SH, grp.upper()))
    x.add(clone(BX, '☐  ' + it['item'] + '  – qty ' + str(it['qty']) + ('  (' + it['note'] + ')' if it.get('note') else '') + '   Vendor: ________  Price: ______'))
x.add(clone(SG, 'Total: ', '\t\tOrdered on: ', '\t'))
replace_in(d, 'Lead Job Supply Checklist | Page', 'Lead Decon Unit Purchase List | Page')
save(d, 'GrayCo_Lead_Decon_Unit_Purchase_List.docx')
