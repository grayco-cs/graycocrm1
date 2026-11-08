#!/usr/bin/env python3
"""patch CCCONTACT (owner 11/5: "to enter the job in the crm at all a phone number or email has to be in the crm /
company cam / grayco photos"). The CompanyCam sync still files every new CompanyCam project as a LEAD, but it only adds
the "bidding" JOB when the project has a phone or e-mail; without one the lead is marked "📷 Needs contact info" and
the job is made once someone adds a phone / e-mail and converts it (the JOBCONTACT rule)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*CCCONTACT*/' in src: print('already patched'); sys.exit(0)
o = "        existingLeads.unshift(_ccProj);\n        // Add to the projects pipeline as a BIDDING job.\n        try{\n"
assert src.count(o) == 1
n = ("        /*CCCONTACT*/ var _ccHas = /\\d{10}/.test(String(ccPhone||'').replace(/\\D/g,'').slice(-10)) || /^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(String(ccEmail||'').trim());\n"
     "        if(!_ccHas){ _ccProj.needsContact = true; _ccProj.notes = 'Synced from CompanyCam. 📷 Needs contact info — add the customer\\u2019s phone or e-mail, then convert it to a job.'; }\n"
     "        existingLeads.unshift(_ccProj);\n        // Add to the projects pipeline as a BIDDING job.\n        if(_ccHas) try{\n")
src = src.replace(o, n)
open(P, 'w', encoding='utf-8').write(src); print('patched')
