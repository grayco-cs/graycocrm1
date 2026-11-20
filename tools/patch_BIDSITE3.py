#!/usr/bin/env python3
"""Idempotent patch BIDSITE3 (owner 11/20): the CRM side of the bid site's subs / suppliers, the customer's own carrier, the call script.

1. tools/bidsite3_block.html becomes a script right after BPAPPR: 🧱 material requests (a sub's "Request more materials" on the bid
   site) as ✅ Approvals cards for the job's PM (approve → the job's draft supplier PO; decline with a note → the sub sees it), and the
   role "Insurance Restoration Manager".
2. MKTOFFICE's 📋 Call script: the owner's answers as the standard script (services, what we do NOT do, payment / deposit / financing /
   discounts / referral, estimates, insurance, emergencies, photos, warranty, licenses, service area, hours, Spanish, trust, cell
   numbers, anonymous callers), "Ask these — by job type" and "After the call" sections (all admin-editable); routing by ROLE:
   water / fire / mold / storm → the Insurance Restoration Manager (role), else Owner 1; emergency → on call = the Mitigation PM
   (backup Owner 1); legal / collections / disputes → Owner 2 then Owner 1; media → Owner 1; adjusters → the job's PM, else Owner 2;
   past customers → their job's PM; "asks for an owner" → ask what it is about; complaints → the office first; salespeople → decline;
   hiring → a resume to office@. Owner 1 / Owner 2 are the Admin settings → 👥 Team roles picks (texts.js ?owners, _lib/owners.js),
   never names. A script an admin saved keeps its edits; every part still equal to the old standard text takes the new one.
3. The customer's OWN insurance company may be named where the customer sees their own claim: INS4's homeowner update (the carrier and
   claim # in a line; the adjusting company / policy / program still hidden), ESTPDF's customer-copy PDF (carrier + claim # shown;
   another carrier's name, a TPA, internal notes and costs still out), the SDS consent copy (own carrier kept; prices out).
Usage: python3 tools/patch_BIDSITE3.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_BIDSITE3__' in src:
    print('already patched'); sys.exit(0)
HERE = os.path.dirname(os.path.abspath(__file__))
BLOCK = open(os.path.join(HERE, 'bidsite3_block.html'), encoding='utf-8').read().rstrip('\n')

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:100], s.count(old))
    return s.replace(old, new)

# ── 1. the block, right after BPAPPR ──
a = src.index('<script id="gc-patch-bpappr">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]

# ── 2. MKTOFFICE: services, routing, the standard script ──
src = once(src, """  { id: 'mold', co: 'environmental', l: 'Mold', type: 'Environmental', k: 'env' },""",
"""  { id: 'mold', co: 'environmental', l: 'Mold', type: 'Environmental', k: 'mit' },   /* patch BIDSITE3: mold calls route with water / fire / storm */""")
src = once(src, """  { id: 'other', co: 'construction', l: 'Not sure / other', type: '', k: '' }
];""", """  { id: 'newbuild', co: 'construction', l: 'New construction — new home / container home', type: 'New construction', k: 'res' },   /* patch BIDSITE3: the owner's services */
  { id: 'exterior', co: 'construction', l: 'Siding, windows, doors', type: 'Exterior', k: 'res' },
  { id: 'interior', co: 'construction', l: 'Flooring, drywall, painting', type: 'Interior', k: 'res' },
  { id: 'decks', co: 'construction', l: 'Decks and porches', type: 'Decks / porches', k: 'res' },
  { id: 'land', co: 'construction', l: 'Land clearing / tree work', type: 'Land clearing', k: 'res' },
  { id: 'sewage', co: 'mitigation', l: 'Sewage clean-up (with damage)', type: 'Mitigation', k: 'mit' },
  { id: 'airq', co: 'environmental', l: 'Air quality testing', type: 'Environmental', k: 'env' },
  { id: 'other', co: 'construction', l: 'Not sure / other', type: '', k: '' }
];""")
src = once(src, """function envLead(){ var u = byRole(/environment/i)[0]; return u ? { name: nm(u), email: low(u.email) } : null; }
/* key → [the rule, the person now] */
function routes(){
  return {
    emergency: { rule: 'the on-call person (📟 On call rotation)', who: onCall() },
    mit: { rule: 'the Mitigation PM (the mitigation role)', who: mitPm() },
    env: { rule: 'the Environmental lead (the environmental role)', who: envLead() },
    res: { rule: 'the PM by the default rules (Senior PM)', who: seniorPm() },
    ins: { rule: 'the Senior Insurance PM (lead roles), else the Senior PM', who: holder('insurance') || seniorPm() },""",
"""function envLead(){ var u = byRole(/environment/i)[0]; return u ? { name: nm(u), email: low(u.email) } : null; }
/* patch BIDSITE3: by ROLE, never by name — the Insurance Restoration Manager role, and Owner 1 / Owner 2 (Admin settings → 👥 Team roles,
   the server's _lib/owners.js; not picked → the earliest-created admin is Owner 1, the next Owner 2) */
function irm(){ var u = byRole(/insurance\\s+restoration\\s+manager/i)[0]; return u ? { name: nm(u), email: low(u.email) } : null; }
var OWNC = { list: null, at: 0 };
function owner(n){
  if (!OWNC.at || Date.now() - OWNC.at > 60000) { OWNC.at = Date.now(); try { if (W._gcLsaPm && W._gcLsaPm.owners) W._gcLsaPm.owners().then(function(o){ if (o && arr(o.owners).length) OWNC.list = arr(o.owners); }, function(){}); } catch (e) {} }
  var o = arr(OWNC.list).filter(function(x){ return x && x.slot === n; })[0]; if (o) return { name: s(o.name) || s(o.email), email: low(o.email) };
  var born = function(u){ var k = ['createdAt', 'created', 'addedAt', 'startDate', 'hireDate']; for (var i = 0; i < k.length; i++) { var t = Date.parse(s(u[k[i]])); if (isFinite(t)) return t; } return Infinity; };
  var ad = users().map(function(u, i){ return { u: u, i: i, t: born(u) }; }).filter(function(x){ return /@(in\\.)?grayco-cs\\.com$/.test(low(x.u.email)) && (/^admin$/i.test(s(x.u.role)) || low(x.u.payType) === 'owner'); })
    .sort(function(a, b){ return (a.t - b.t) || (a.i - b.i); });
  var x = ad[n - 1]; return x ? { name: nm(x.u), email: low(x.u.email) } : null;
}
/* key → [the rule, the person now] */
function routes(){
  var o1 = owner(1), o2 = owner(2), ir = irm();
  return {
    emergency: { rule: 'on call = the Mitigation PM (after hours the main line forwards to them); backup Owner 1', who: mitPm() || o1 },
    mit: { rule: 'the Insurance Restoration Manager (role); nobody has it yet → Owner 1', who: ir || o1 },
    env: { rule: 'the Environmental lead (the environmental role), else Owner 1', who: envLead() || o1 },
    res: { rule: 'the PM by the default rules (Senior PM)', who: seniorPm() },
    ins: { rule: 'the Insurance Restoration Manager (role), else the Senior Insurance PM, else Owner 1', who: ir || holder('insurance') || o1 },
    legal: { rule: 'Owner 2, then Owner 1', who: o2 || o1 },
    media: { rule: 'Owner 1', who: o1 },
    adjuster: { rule: 'the job\\'s PM; no job or no PM → Owner 2', who: o2, pre: 'the job\\'s PM, else ' },
    past: { rule: 'their job\\'s PM', fixed: 'their job\\'s PM (look the job up)' },
    owner: { rule: 'ask what it is about, then use this table', fixed: 'ask what it is about first' },
    complaint: { rule: 'the office handles it first, then escalates', fixed: 'the office first, then the job\\'s PM / an owner' },
    sales: { rule: 'decline politely', fixed: 'decline politely' },
    hiring: { rule: 'a resume to office@grayco-cs.com', fixed: 'resume → office@grayco-cs.com' },""")
src = once(src, """function whoTxt(key){ var r = routes()[key]; if (!r) return ''; return r.who ? r.who.name : 'nobody set yet — ' + r.rule; }""",
"""function whoTxt(key){ var r = routes()[key]; if (!r) return ''; if (r.fixed) return r.fixed; return (r.pre || '') + (r.who ? r.who.name : 'nobody set yet — ' + r.rule); }   /* patch BIDSITE3: + the fixed answers */""")

# the standard script: the old one kept as V1 (a saved part equal to it takes the new text)
a = src.index("var DEF_SCRIPT = {\n  greeting: 'Thank you for calling GrayCo, this is ____. How can I help you today?',")
b = src.index("var SCRIPT = { v: null, at: 0, p: null };", a)
old_def = src[a:b]
assert "dont: ['Do not give prices or ballpark numbers" in old_def
NEW_DEF = r"""/* patch BIDSITE3 (owner 11/20): the owner's answers — every line stays admin-editable (✏ Edit) */
var DEF_SCRIPT = {
  ver: 2,
  greeting: 'Thank you for calling GrayCo, this is ____. How can I help you today?',
  q: (function(){ var o = {}; QS.forEach(function(x){ o[x.k] = x.q; });
    o.insurance = 'Is this an insurance claim? Have you filed it yet? If yes: which insurance company, and the claim number? (internal only — never say what insurance will cover; not filed yet → "the PM will advise")';
    o.need = 'What happened, or what do you need done? (please text photos to the GrayCo number)'; return o; })(),
  svc: {
    construction: ['Kitchens and baths', 'Additions and whole-home renovations', 'All new construction — new homes and container homes', 'Roofing — repair and replacement', 'Siding, windows and doors', 'Flooring and drywall', 'Painting', 'Decks and porches', 'Insurance repairs — rebuilding after water, fire or storm damage', 'Commercial and tenant build-outs — all sizes', 'Land clearing and tree work', 'Bids from plans for GCs and owners (goes to the estimator)'],
    mitigation: ['Water removal and drying — 24/7', 'Fire and smoke clean-up', 'Storm damage — board-up, tarping, tree on the house', 'Sewage clean-up when there is damage (we do not plunge toilets)', 'Emergency line answers 24/7: (901) 582-8255'],
    environmental: ['Mold — testing and removal', 'Asbestos — testing and abatement', 'Lead paint — testing and abatement', 'Air quality testing', 'Testing has a fee (the PM explains it)']
  },
  nodo: ['Plumbing-only jobs', 'Handyman / tiny jobs', 'Jobs under $1,000'],
  intake: [
    ['💧 Water / fire / storm', 'When did it happen? Is water still coming in — is the water shut off? Which rooms, how big an area? Is the power on — is it safe to be inside? Is there a tree on the house or a hole in the roof? Have you called your insurance company / filed a claim?'],
    ['🦠 Mold / asbestos / lead', 'What are you seeing or smelling, and where? How big is the area? Is anyone in the home sick, pregnant, a small child or elderly? Is it for a sale, an inspection or a renovation? When was the house built (before 1978: lead; before 1980: asbestos)? (testing has a fee)'],
    ['🏠 Roofing', 'Is it leaking now? Repair or replacement? Storm / hail / wind damage — is there an insurance claim? How old is the roof and what kind (shingle, metal, flat)? One or two stories?'],
    ['🛠 Remodels / additions / new construction', 'Which rooms, or what are you building? Do you have plans or drawings? When do you want it done? Do you own the property? (no prices on the phone — the PM gives a free estimate)'],
    ['🏢 Commercial / bids', 'The company and your role (owner, GC, property manager)? The address and the size? Plans / bid documents and the bid due date? Tenant build-out, repair or new building?']
  ],
  routing: [
    ['emergency', '🚨 Emergency now (water coming in, fire / smoke, tree on the house, sewage)', 'On call = the Mitigation PM — call them now (after hours the main line forwards to them); no answer: Owner 1. Then log the lead as Emergency'],
    ['mit', '💧 Water, fire, smoke, storm or mold damage', 'The Insurance Restoration Manager — until someone has that role: Owner 1'],
    ['env', '☢️ Asbestos, lead paint, air quality testing', 'The Environmental lead'],
    ['res', '🏠 Construction — residential (kitchens, baths, additions, whole-home, new homes)', 'The PM by the default rules'],
    ['ins', '🛡 Insurance repair (rebuild after a claim)', 'The Insurance Restoration Manager (else the Senior Insurance PM)'],
    ['roof', '🏠 Roofing', 'The Senior Roofing PM'],
    ['com', '🏢 Commercial / tenant build-outs (all sizes)', 'The PM by the default rules'],
    ['lsa', '📍 Called from the Google LSA ad', 'The Default PM for Google LSA leads (Owner 2 by default)'],
    ['bid', '📐 Bids / plans to price', 'The estimator'],
    ['adjuster', '🧾 An adjuster or a public adjuster', 'The job\'s PM; no job or no PM: Owner 2'],
    ['past', '🔁 A past customer', 'Their job\'s PM'],
    ['legal', '⚖️ Legal, collections or a dispute', 'Owner 2, then Owner 1'],
    ['media', '📰 Media / a reporter', 'Owner 1'],
    ['owner', '👔 Asks for an owner', 'Ask what it is about, then use this table'],
    ['complaint', '😟 A complaint', 'The office handles it first, then escalates (the job\'s PM, then an owner)'],
    ['sales', '📦 A salesperson', 'Decline politely'],
    ['hiring', '🧰 Looking for a job', 'Ask them to e-mail a resume to office@grayco-cs.com']
  ],
  faq: [
    ['Do you do free estimates?', 'Yes — estimates are free (mold, asbestos, lead and air quality TESTING has a fee). We do not give prices on the phone: the project manager gives you a free estimate. The PM calls you back within 24 hours, and you get the written estimate within a week.'],
    ['How do I pay?', 'Check, cash, card, or your insurance company pays us directly (an assignment of benefits is case by case — the PM decides). A deposit is always required; the PM explains the amount.'],
    ['Do you offer financing?', 'Financing is coming soon — ask your project manager.'],
    ['Do you have any discounts?', '____ (none set yet — an admin fills this in)'],
    ['Do you have a referral program?', 'We can send you information on our referral program.'],
    ['Do you work with insurance?', 'Yes — we work with all insurance companies. Have not filed a claim yet? The PM will advise you. Your insurance company decides what is covered — we never say what it will cover.'],
    ['Is there an after-hours emergency charge?', 'It is billed to the insurance claim.'],
    ['How soon can you come out?', 'For an emergency: our on-call team is on the way (never promise an exact time). Everything else: your project manager calls you back within 24 hours.'],
    ['Can I send photos?', 'Yes, please — text photos of the damage or the project to the GrayCo number, (901) 585-0944.'],
    ['Are you licensed and insured?', 'Yes — licensed and insured in Tennessee, Mississippi and Arkansas: TN #85034 BCB · MS #______ · AR #______. Local and family owned — see our Google reviews.'],
    ['What areas do you serve?', 'Memphis, Bartlett, Germantown, Collierville, Cordova, Arlington, Lakeland, DeSoto County MS (Southaven, Olive Branch), Tipton and Fayette counties, Marshall County MS and Crittenden County AR. Farther for big jobs — the PM decides.'],
    ['What are your hours? Can I come by?', 'Monday–Friday, 8 AM–5 PM. Yes — customers are welcome at the office.'],
    ['¿Hablan español?', 'Yes — the office and our crews can help in Spanish.'],
    ['What is the warranty?', 'It depends on the job — your project manager explains it.'],
    ['Can I have my PM\'s cell number?', 'Only for that PM\'s own customers. Anyone else: take a message and the PM calls back.'],
    ['Do you do small repairs or plumbing?', 'We do not do plumbing-only jobs, handyman / tiny jobs, or jobs under $1,000.'],
    ['The caller will not give a name or number', 'Answer general questions only — no job details, no staff names or numbers.']
  ],
  dont: ['Do not give prices or ballpark numbers — the PM gives a free estimate.', 'Do not say what insurance will or will not cover — the insurance company decides coverage.', 'Do not promise an arrival time — for an emergency say "our on-call team is on the way".', 'Do not give out the claim number, the caller\'s information or an employee\'s cell number (a PM\'s cell only to that PM\'s own customers).', 'Do not give job details to a caller who will not give a name and number.'],
  after: ['The PM calls the customer back within 24 hours.', 'The PM has not called by the end of the day → the office reminds the PM.', 'A lead from a voicemail: the office calls back twice.', 'The written estimate goes out within a week.'],
  closing: 'Thank you, ____. [the person] will call you back within 24 hours at the number you gave me. Please text photos to the GrayCo number, (901) 585-0944. If water is coming in and it is safe, shut off the main water valve. Thank you for calling GrayCo!'
};
/* a saved script: every part still equal to the old standard text (V1) takes the new standard text; the admin's own edits stay */
function upgradeV1(v){
  if (!v || typeof v !== 'object' || Number(v.ver) >= 2) return v;
  var o = JSON.parse(JSON.stringify(v)), J = function(x){ return JSON.stringify(x == null ? null : x); }, V = DEF_SCRIPT_V1;
  ['greeting', 'closing'].forEach(function(k){ if (s(o[k]) === V[k]) delete o[k]; });
  if (o.q && typeof o.q === 'object') Object.keys(o.q).forEach(function(k){ if (s(o.q[k]) === s(V.q[k])) delete o.q[k]; });
  if (o.svc && typeof o.svc === 'object') Object.keys(o.svc).forEach(function(c){ if (J(o.svc[c]) === J(V.svc[c])) delete o.svc[c]; });
  ['routing', 'faq', 'dont'].forEach(function(k){ if (J(o[k]) === J(V[k])) delete o[k]; });
  return o;
}
"""
src = src[:a] + old_def.replace('var DEF_SCRIPT = {', '/* the standard script before 11/20 (V1) — only to recognise a saved copy of it */\nvar DEF_SCRIPT_V1 = {', 1) + NEW_DEF + src[b:]
src = once(src, """  v = v && typeof v === 'object' ? v : {}; var D0 = DEF_SCRIPT, o = {};""",
"""  v = upgradeV1(v && typeof v === 'object' ? v : {}); var D0 = DEF_SCRIPT, o = {};   /* patch BIDSITE3 */""")
src = once(src, """  var dn = arr(v.dont).map(s).filter(Boolean); o.dont = dn.length ? dn : D0.dont.slice();""",
"""  var dn = arr(v.dont).map(s).filter(Boolean); o.dont = dn.length ? dn : D0.dont.slice();
  /* patch BIDSITE3: what we do NOT do, "Ask these — by job type", "After the call" */
  var nd = arr(v.nodo).map(s).filter(Boolean); o.nodo = nd.length ? nd : D0.nodo.slice();
  var it = arr(v.intake).filter(function(r){ return Array.isArray(r) && s(r[0]); }); o.intake = it.length ? it.map(function(r){ return [s(r[0]), s(r[1])]; }) : D0.intake.map(function(r){ return r.slice(); });
  var af = arr(v.after).map(s).filter(Boolean); o.after = af.length ? af : D0.after.slice();""")
src = once(src, """  var c = cleanScript(v); c.at = nowIso(); c.by = myName();""", """  var c = cleanScript(v); c.at = nowIso(); c.by = myName(); c.ver = 2;   /* patch BIDSITE3 */""")
src = once(src, """    + '<h3>3. What we do — by company</h3>' + cos""",
"""    + '<h3>2b. Ask these — by job type</h3><div data-cs-intake>' + v.intake.map(function(r){ return '<details data-cs-it><summary>' + esc(r[0]) + '</summary><div class="say">' + esc(r[1]) + '</div></details>'; }).join('') + '</div>'   /* patch BIDSITE3 */
    + '<h3>3. What we do — by company</h3>' + cos + '<div class="co" data-cs-nodo><b>🚫 We do NOT do</b><ul>' + v.nodo.map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>'""")
src = once(src, """    + '<h3>7. Closing</h3><div class="say" data-cs-close>' + esc(v.closing) + '</div>'""",
"""    + '<h3>7. Closing</h3><div class="say" data-cs-close>' + esc(v.closing) + '</div>'
    + '<h3>8. After the call</h3><ul data-cs-after>' + v.after.map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'""")
src = once(src, """    + '<label>Who gets the lead (For | Send to)' + ta('routing',""",
"""    + '<label>🚫 We do NOT do' + ta('nodo', v.nodo.join('\\n'), 3) + '</label>'
    + '<label>Ask these — by job type (Type | Questions)' + ta('intake', v.intake.map(function(r){ return r[0] + ' | ' + r[1]; }).join('\\n'), 6) + '</label>'
    + '<label>After the call' + ta('after', v.after.join('\\n'), 4) + '</label>'
    + '<label>Who gets the lead (For | Send to)' + ta('routing',""")
src = once(src, """  v.faq = pairs('faq'); v.dont = lines('dont');""", """  v.faq = pairs('faq'); v.dont = lines('dont'); v.nodo = lines('nodo'); v.intake = pairs('intake'); v.after = lines('after');   /* patch BIDSITE3 */""")

# ── 3a. INS4: the homeowner update names the customer's own carrier ──
src = once(src, """  var text = 'Hi ' + name + ',\\n\\nHere is where your project' + (addr ? ' at ' + addr : '') + ' stands: ' + HO_TEXT[k] + '\\n\\nIf you have any questions, call our office at ' + officePhone() + (pm ? ' and ask for ' + pm : '') + '.\\n\\nThank you,\\nGrayCo Construction Services';
  /* the carrier's name, adjuster company and policy number are never in it (owner rule) */
  [s(c.carrier), s((c.adjuster || {}).company),""",
"""  /* patch BIDSITE3 G (owner 11/20): the customer's OWN insurance company and claim # may be named in their update */
  var carrier = s(c.carrier) || s(p.insCarrier || p.carrier || p.insuranceCompany), claimNo = s(c.claimNumber || c.claimNo || p.claimNumber);
  var text = 'Hi ' + name + ',\\n\\nHere is where your project' + (addr ? ' at ' + addr : '') + ' stands: ' + HO_TEXT[k] + (carrier ? '\\n\\nYour insurance claim: ' + carrier + (claimNo ? ', claim # ' + claimNo : '') + '.' : '') + '\\n\\nIf you have any questions, call our office at ' + officePhone() + (pm ? ' and ask for ' + pm : '') + '.\\n\\nThank you,\\nGrayCo Construction Services';
  /* the adjusting company, the policy number and a program / TPA are never in it (the carrier is the customer's own — BIDSITE3) */
  [s((c.adjuster || {}).company),""")

# ── 3b. ESTPDF: the customer copy shows the customer's own carrier + claim # ──
src = once(src, """function wordsFor(e, p){
  var w = [];
  var c = claimOf(p) || {};
  [p && p.carrier, p && p.insuranceCo, p && p.insuranceCompany, p && p.insurer, c.carrier, c.tpa, c.program, p && p.adjusterCompany, p && p.tpa, e && e.carrier, e && e.insuranceCo]
    .forEach(function(v){ v = s(v); if (v.length >= 3 && !/^none/i.test(v)) w.push(v); });
  [p && p.claimNumber, p && p.claimNo, c.claimNumber, c.claimNo, e && e.claimNumber].forEach(function(v){ v = s(v); if (v.length >= 4) w.push({ claim: v }); });
  return w;
}
function scrub(t, words){
  t = String(t == null ? '' : t).replace(CARRIERS, 'your insurance company');
  arr([]).concat(words || []).forEach(function(w){
    if (w && typeof w === 'object' && w.claim) { t = t.split(w.claim).join('(on file)'); return; }
    var x = s(w); if (x.length < 3) return;
    t = t.replace(new RegExp(x.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'gi'), 'your insurance company');
  });
  return t.replace(/\\bclaim\\s*(#|no\\.?|number)\\s*[:#]?\\s*[A-Z0-9-]{4,}/gi, 'claim (on file)');
}""",
"""/* patch BIDSITE3 G (owner 11/20): the customer's OWN carrier and claim # are shown on their copy; another carrier's name (the common
   list), a TPA / program and the adjusting company still read "your insurance company" */
function ownIns(e, p){
  var c = claimOf(p) || {}, own = [];
  [p && p.insCarrier, p && p.carrier, p && p.insuranceCo, p && p.insuranceCompany, p && p.insurer, c.carrier, e && e.carrier, e && e.insuranceCo].forEach(function(v){ v = s(v); if (v.length >= 3 && !/^none/i.test(v) && own.indexOf(v) < 0) own.push(v); });
  var claim = ''; [c.claimNumber, c.claimNo, p && p.claimNumber, p && p.claimNo, e && e.claimNumber].forEach(function(v){ v = s(v); if (!claim && v.length >= 4) claim = v; });
  return { carriers: own, claim: claim };
}
function exceptOwnRe(re, own){
  var alts = (Array.isArray(own) ? own : []).map(s).filter(function(x){ return x.length >= 3; }).map(function(x){ return x.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\s+/g, '\\\\s*'); });
  if (!alts.length) return new RegExp(re.source, 'gi');
  return new RegExp(re.source.indexOf('\\\\b') === 0 ? '\\\\b(?!(?:' + alts.join('|') + ')\\\\b)' + re.source.slice(2) : '(?!(?:' + alts.join('|') + ')\\\\b)' + re.source, 'gi');
}
function wordsFor(e, p){
  var w = [], c = claimOf(p) || {}, oi = ownIns(e, p), own = oi.carriers.map(function(x){ return x.toLowerCase(); });
  [c.tpa, c.program, p && p.adjusterCompany, p && p.adjustingCompany, p && p.tpa, c.adjuster && c.adjuster.company]
    .forEach(function(v){ v = s(v); if (v.length >= 3 && !/^none/i.test(v) && own.indexOf(v.toLowerCase()) < 0) w.push(v); });
  w.own = oi.carriers; w.claim = oi.claim;
  return w;
}
function scrub(t, words){
  t = String(t == null ? '' : t).replace(exceptOwnRe(CARRIERS, words && words.own), 'your insurance company');
  arr([]).concat(words || []).forEach(function(w){
    var x = s(w); if (x.length < 3) return;
    t = t.replace(new RegExp(x.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'gi'), 'your insurance company');
  });
  return t;
}""")
src = once(src, """  out.lines = arr(e && e.lines).map(function(l){ var c = {}; Object.keys(l).forEach(function(k){ if (!/note|internal|memo|vendor|supplier/i.test(k)) c[k] = l[k]; }); if (typeof c.desc === 'string') c.desc = scrub(c.desc, words); if (typeof c.cat === 'string') c.cat = scrub(c.cat, words); return c; });
  return { est: out, words: words };
}
function proposalHtml(e){
  var cc = customerCopy(e), html = '';
  try { if (W._gcEstin && typeof W._gcEstin.proposalHtml === 'function') html = W._gcEstin.proposalHtml(cc.est); } catch (x) { warn(x); }
  if (!html) { try { if (typeof W._gcBuildGrayCoProposal === 'function') html = W._gcBuildGrayCoProposal(cc.est); } catch (x) { warn(x); } }
  return html ? scrub(html, cc.words) : '';
}""",
"""  out.lines = arr(e && e.lines).map(function(l){ var c = {}; Object.keys(l).forEach(function(k){ if (!/note|internal|memo|vendor|supplier/i.test(k)) c[k] = l[k]; }); if (typeof c.desc === 'string') c.desc = scrub(c.desc, words); if (typeof c.cat === 'string') c.cat = scrub(c.cat, words); return c; });
  return { est: out, words: words };
}
function proposalHtml(e){
  var cc = customerCopy(e), html = '';
  try { if (W._gcEstin && typeof W._gcEstin.proposalHtml === 'function') html = W._gcEstin.proposalHtml(cc.est); } catch (x) { warn(x); }
  if (!html) { try { if (typeof W._gcBuildGrayCoProposal === 'function') html = W._gcBuildGrayCoProposal(cc.est); } catch (x) { warn(x); } }
  if (!html) return '';
  html = scrub(html, cc.words);
  /* patch BIDSITE3 G: "Insurance: <their carrier> · Claim # <n>" on the customer copy of an insurance job */
  var own = Array.isArray(cc.words.own) ? cc.words.own : [], line = isIns(jobOf(e)) && (own.length || cc.words.claim) ? '<div data-gc-ins-line="1" style="font:13px Arial,sans-serif;margin:6px 0 10px;color:#0f172a"><b>Insurance:</b> ' + esc(own[0] || 'your insurance company') + (cc.words.claim ? ' &middot; <b>Claim #</b> ' + esc(cc.words.claim) : '') + '</div>' : '';
  if (line) { var m = /<body[^>]*>/i.exec(html); html = m ? html.slice(0, m.index + m[0].length) + line + html.slice(m.index + m[0].length) : line + html; }
  return html;
}""")

# ── 3c. SDS: the consent copy keeps the customer's own carrier ──
src = once(src, """function cust(v){ return s(v).replace(CARRIERS, 'your insurance company').replace(/\\$\\s?\\d[\\d,]*(\\.\\d+)?/g, ''); }""",
"""/* patch BIDSITE3 G: the customer's OWN carrier may stay (SDS_OWN: the job being written); another carrier's name and every price go */
var SDS_OWN = [];
function sdsOwn(p){ var c = []; try { c = arr(W._crm && W._crm.gc_claims).filter(function(x){ return x && x.deleted !== true && String(x.projectId) === String(p && p.id); }); } catch (e) {}
  SDS_OWN = [p && p.insCarrier, p && p.carrier, p && p.insuranceCompany, p && p.insuranceCo, p && p.insurer].concat(c.map(function(x){ return x.carrier; })).map(s).filter(function(x){ return x.length >= 3; }); }
function sdsCarriers(){ if (!SDS_OWN.length) return CARRIERS; var alts = SDS_OWN.map(function(x){ return x.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\s+/g, '\\\\s*'); });
  return new RegExp(CARRIERS.source.indexOf('\\\\b') === 0 ? '\\\\b(?!(?:' + alts.join('|') + ')\\\\b)' + CARRIERS.source.slice(2) : CARRIERS.source, 'gi'); }
function cust(v){ return s(v).replace(sdsCarriers(), 'your insurance company').replace(/\\$\\s?\\d[\\d,]*(\\.\\d+)?/g, ''); }""")
src = once(src, """function consentTable(p){
  var l = mats(p);""", """function consentTable(p){
  sdsOwn(p);   /* patch BIDSITE3 G */
  var l = mats(p);""")
src = once(src, """function choicesOf(p){ return mats(p)""", """function choicesOf(p){ sdsOwn(p); return mats(p)""")


# ── 4. item J: "＋ Upload plans / files" and "＋ Add link" in the CRM's 📢 Put on bid portal dialog (BIDPOST) ──
a = src.index("    + '<label class=\"f\">Plans / files to share</label>' + (UI.files.length ?")
b = src.index("    + '<label class=\"f\" for=\"gcbp-link\">Plan room / Drive link (optional)</label>", a)
src = src[:a] + """    + '<label class="f">Plans / files to share</label><div data-bp-fbox>' + filesBox() + '</div>'   /* patch BIDSITE3 J */
    + '<div class="upz" data-bp-drop style="border:2px dashed #d6d1e6;border-radius:10px;padding:10px;margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="b" data-bp="upload">＋ Upload plans / files</button><button type="button" class="b" data-bp="addlink">＋ Add link</button>'
    + '<input type="file" data-bp-upfile multiple accept=".pdf,.png,.jpg,.jpeg,.heic,.heif,.webp,.tif,.tiff,.dwg,.dxf,.zip,.doc,.docx,.xls,.xlsx,application/pdf,image/*" style="display:none">'
    + '<span class="mut" data-bp-upmsg>or drop files here — PDF, pictures (phone camera too), DWG, ZIP. They are saved on the ' + (p ? 'job' : 'lead') + '\\'s documents and shared to the bid portal (plans / specs / addenda / scopes visible to subs; an invitation / bid form stays hidden).</span></div>'
""" + src[b:]
src = once(src, """function draw(pj, jl){
  var m = D.getElementById('gcbp-modal'); if (!m) return; var c = UI.c, box = m.querySelector('.box');""", """/* patch BIDSITE3 J (owner 11/20: "if there's no plans in leads I need to be able to add them here for the CRM and bid portal") —
   the files list (redrawn after an upload without losing what was typed), the upload (the CRM's one file pipeline window._gcStoreFile:
   private crm-files storage, a reference only — never base64 in a record), saved on the lead's / job's documents, ticked to share */
function filesBox(){
  var J = UI.job, refs = {}, links = {}; arr(J && J.crmFileRefs).forEach(function(r){ refs[r] = 1; }); arr(J && J.links).forEach(function(x){ links[s(x.url)] = 1; });
  if (!UI.files.length) return '<div class="mut">No files on this ' + (UI.c && UI.c.p ? 'job' : 'lead') + ' yet — ＋ Upload plans / files or ＋ Add link below.</div>';
  return '<div class="files" data-bp-files>' + UI.files.map(function(f, i){ var was = (f.ref && refs[f.ref]) || (f.link && links[f.link]), on = f.checked != null ? f.checked : (was || (!J && f.pick) || f.fresh);
    return '<label><input type="checkbox" data-bp-file="' + i + '"' + (on ? ' checked' : '') + (f.ref && refs[f.ref] ? ' disabled' : '') + '> <span>' + (f.link ? '🔗 ' : '📄 ') + esc(f.name) + (f.fresh ? ' <span class="mut">(just added' + (f.category ? ' · ' + esc(f.category) : '') + ')</span>' : '') + (f.ref && refs[f.ref] ? ' <span class="mut">(shared)</span>' : '') + '</span></label>'; }).join('') + '</div>';
}
function keepTicks(){ var m = D.getElementById('gcbp-modal'); if (!m) return; m.querySelectorAll('[data-bp-file]').forEach(function(x){ var f = UI.files[+x.getAttribute('data-bp-file')]; if (f) f.checked = !!x.checked; }); }
function redrawFiles(){ var m = D.getElementById('gcbp-modal'), b = m && m.querySelector('[data-bp-fbox]'); if (b) b.innerHTML = filesBox(); }
function catOf(n){ n = low(n); return /addend/.test(n) ? 'Addenda' : /\\bspec/.test(n) ? 'Specs' : /scope/.test(n) ? 'Scope' : 'Plans'; }
function upMsg(t){ var m = D.getElementById('gcbp-modal'), x = m && m.querySelector('[data-bp-upmsg]'); if (x) x.textContent = t; }
/* the file on the lead (lead.files) or the job (projectDocs) — the same documents the lead / job shows */
function saveDoc(c, meta, name, type, size){
  var at = new Date().toISOString(), cat = catOf(name);
  if (c.pid) {
    var rec = { id: 'doc_bp_' + s(meta.hash || meta.ref).replace(/[^A-Za-z0-9]/g, '').slice(-16) + '_' + Date.now().toString(36), pid: c.pid, name: name, cat: cat === 'Plans' ? 'Plans' : cat, type: type, size: size, ref: meta.ref, data: meta.ref, uploadedAt: at, by: myEmail(), source: 'bid portal dialog' };
    try { if (W._setProjectDocs) W._setProjectDocs(function(prev){ return Array.isArray(prev) ? (prev.some(function(d){ return d && d.ref === rec.ref && d.pid === rec.pid; }) ? prev : prev.concat([rec])) : [rec]; }); } catch (e) { warn(e); }
    try { var all = arr(crm().projectDocs); if (!all.some(function(d){ return d && d.ref === rec.ref && d.pid === rec.pid; })) { all = all.concat([rec]); if (W._crm) W._crm.projectDocs = all; if (W.idbSet) W.idbSet('projectDocs', all); if (W._supaUpsert) W._supaUpsert('projectDocs', all); } } catch (e) { warn(e); }
  } else if (c.leadId && typeof W._setLeads === 'function') {
    var f = { ref: meta.ref, name: name, type: type, size: size, cat: cat, uploadedAt: at, by: myEmail(), source: 'bid portal dialog' };
    W._setLeads(function(list){ return arr(list).map(function(l){ return l && s(l.id) === c.leadId ? Object.assign({}, l, { files: arr(l.files).some(function(x){ return x && x.ref === f.ref; }) ? arr(l.files) : arr(l.files).concat([f]), updatedAt: at }) : l; }); });
    later(function(){ try { if (W._supaUpsertNow && Array.isArray(crm().leads)) W._supaUpsertNow('leads', crm().leads); } catch (e) {} }, 700);
  }
}
var UP_RE = /\\.(pdf|png|jpe?g|heic|heif|webp|tiff?|dwg|dxf|zip|docx?|xlsx?)$/i;
function upload(list){
  var c = UI.c, files = Array.prototype.slice.call(list || []); if (!files.length) return Promise.resolve(0);
  if (typeof W._gcStoreFile !== 'function') { upMsg('File storage is not ready on this computer — paste a 🔗 link instead.'); return Promise.resolve(0); }
  keepTicks(); var n = 0, left = [];
  upMsg('⏳ Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
  return files.reduce(function(p, f){ return p.then(function(){
    if (!UP_RE.test(s(f.name)) && !/^image\\//.test(s(f.type))) { left.push(f.name + ' (not a plan / file type)'); return; }
    if (f.size > 50 * 1048576) { left.push(f.name + ' (over 50 MB — add a 🔗 link)'); return; }
    return W._gcStoreFile(f, { kind: 'doc', pid: c.pid || c.leadId, name: f.name }).then(function(meta){
      if (!meta || !/^sb:crm-files\\//.test(s(meta.ref))) { left.push(f.name); return; }
      saveDoc(c, meta, s(f.name) || 'File', s(f.type), Number(f.size) || 0);
      if (!UI.files.some(function(x){ return x.ref === meta.ref; })) UI.files.push({ ref: meta.ref, link: '', name: s(f.name) || 'File', type: s(f.type), size: Number(f.size) || 0, category: catOf(f.name), pick: true, fresh: true, checked: true });
      n++;
    }, function(e){ left.push(f.name + ' (' + s(e && e.message) + ')'); });
  }); }, Promise.resolve()).then(function(){ redrawFiles(); upMsg((n ? '✓ ' + n + ' file' + (n === 1 ? '' : 's') + ' added to the ' + (c.p ? 'job' : 'lead') + '\\'s documents — ticked to share' : '') + (left.length ? (n ? ' · ' : '') + 'left out: ' + left.slice(0, 3).join(', ') : '')); return n; });
}
function addLink(){
  var u = s(W.prompt('Paste the plan room / Drive link (https://…):', '')); if (!u) return;
  if (!/^https?:\\/\\/\\S+$/i.test(u)) { upMsg('Paste a full link (https://…).'); return; }
  var lb = s(W.prompt('A name for it (e.g. "MR plan room", "Drive — plans"):', 'Plans')) || 'Plans';
  keepTicks(); if (!UI.files.some(function(x){ return x.link === u; })) UI.files.push({ link: u, name: lb, pick: true, fresh: true, checked: true });
  try { var c = UI.c; if (c.leadId && !c.pid && typeof W._setLeads === 'function') W._setLeads(function(list){ return arr(list).map(function(l){ return l && s(l.id) === c.leadId ? Object.assign({}, l, { plansLinks: arr(l.plansLinks).some(function(x){ return x && x.url === u; }) ? arr(l.plansLinks) : arr(l.plansLinks).concat([{ url: u, label: lb }]), updatedAt: new Date().toISOString() }) : l; }); }); } catch (e) { warn(e); }
  redrawFiles(); upMsg('🔗 ' + lb + ' added — ticked to share');
}
function draw(pj, jl){
  var m = D.getElementById('gcbp-modal'); if (!m) return; var c = UI.c, box = m.querySelector('.box');""")
src = once(src, """  box.querySelectorAll('input[name="gcbp-vis"]').forEach(function(r){ r.addEventListener('change', function(){ UI.vis = r.value; box.querySelectorAll('[data-bp-vis] label').forEach(function(x){ x.classList.toggle('on', x.contains(r) ? r.checked : false); }); }); });
}""", """  box.querySelectorAll('input[name="gcbp-vis"]').forEach(function(r){ r.addEventListener('change', function(){ UI.vis = r.value; box.querySelectorAll('[data-bp-vis] label').forEach(function(x){ x.classList.toggle('on', x.contains(r) ? r.checked : false); }); }); });
  /* patch BIDSITE3 J: the picker and drag-and-drop */
  var fi = box.querySelector('[data-bp-upfile]'); if (fi) fi.addEventListener('change', function(){ var l = fi.files; upload(l).then(function(){ try { fi.value = ''; } catch (e) {} }); });
  var dz = box.querySelector('[data-bp-drop]'); if (dz) { dz.addEventListener('dragover', function(ev){ ev.preventDefault(); dz.style.background = '#fffbeb'; }); dz.addEventListener('dragleave', function(){ dz.style.background = ''; });
    dz.addEventListener('drop', function(ev){ ev.preventDefault(); dz.style.background = ''; upload(ev.dataTransfer && ev.dataTransfer.files); }); }
}""")
src = once(src, """  if (a === 'close') return close();
  if (a === 'trade') { var k = t.getAttribute('data-t'); UI.trades[k] = !UI.trades[k];""", """  if (a === 'close') return close();
  if (a === 'upload') { var fi = D.querySelector('#gcbp-modal [data-bp-upfile]'); if (fi) fi.click(); return; }   /* patch BIDSITE3 J */
  if (a === 'addlink') return addLink();
  if (a === 'trade') { var k = t.getAttribute('data-t'); UI.trades[k] = !UI.trades[k];""")
src = once(src, """W._gcBidPost = { bulk: bulkPost,""", """W._gcBidPost = { upload: upload, filesUI: function(){ return UI.files.slice(); }, bulk: bulkPost,""")

# ── 5. item J: the same on the CRM's 🏗 Bid portal → 📂 Manage → 📝 Details (the bid site's upload: 📐 Plans & specs review / save) ──
src = once(src, """  if (M.tab === 'details') return detailsHtml();""", """  if (M.tab === 'details') return '<div data-dt-up style="border:2px dashed #d6d1e6;border-radius:10px;padding:8px 10px;margin:0 0 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>📐 Plans / files</b><button type="button" class="b" data-a="pick">＋ Upload plans / files</button><button type="button" class="b" data-a="dtlink">＋ Add link</button><span style="color:#6b6787;font-size:12px">Saved on this bid job (📐 Plans &amp; specs); plans / specs / addenda / scopes are visible to subs, an invitation / bid form stays hidden.</span></div>' + detailsHtml();   /* patch BIDSITE3 J */""")
src = once(src, """  if (a === 'pick') return pickFiles(function(fs){ uploadPlans(fs); });""", """  if (a === 'pick') return pickFiles(function(fs){ uploadPlans(fs); });
  if (a === 'dtlink') { var u0 = s(W.prompt('Paste the plan room / Drive link (https://…):', '')); if (!u0) return; return post({ op: 'plans', addLink: { url: u0, label: s(W.prompt('A name for it:', 'Plan room')) || 'Plan room' } }, t, function(){ toast('🔗 Link added'); }); }   /* patch BIDSITE3 J */""")

open(path, 'w', encoding='utf-8').write(src)
print('patched')
