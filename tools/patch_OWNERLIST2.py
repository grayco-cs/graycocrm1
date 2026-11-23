# OWNERLIST2 (owner 11/23: "Remember if I ignore something put in my owner checklist"): the open questions and owner-only steps
# from the chat go on 🔧 Owner setup (admins' To-Do). Each is ticked off there like the others.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'OWNERLIST2' not in s
a = "\n];\nvar OS = { done: {}, checks: {}, at: 0, loading: false, sig: '', open: false };"
assert s.count(a) == 1
items = r""",
  /* OWNERLIST2: questions and steps waiting on the owner (11/23) */
  { id: 'q_jobs480', g: 'now', t: 'Decide: clean up the 480 jobs', how: 'The job list holds 208 CompanyCam placeholder "bidding" jobs and 186 QuickBooks imports marked Active with no PM. Tell Claude "do both", or pick one: (1) archive the 208 CompanyCam placeholders (kept, never deleted), (2) move the 186 QuickBooks Active rows to History. Fewer jobs = faster screens for everyone.' },
  { id: 'q_renasant', g: 'now', t: 'Answer: are the Renasant HVAC jobs real?', how: 'Tell Claude yes (keep) or no (archive them).' },
  { id: 'q_qa_sub', g: 'now', t: 'Answer: is Q&A Construction LLC a sub?', how: 'Tell Claude yes (add as a sub) or no.' },
  { id: 'q_errwatch', g: 'soon', t: 'Answer: turn the error-watch check-ins back on?', how: 'They looked at the CRM\'s error reports a few times a day and fixed problems before anyone noticed. Tell Claude yes or no.' },
  { id: 'invmail_rule', g: 'now', t: 'Gmail rule: invoices sent only to Wesley / Nick / office reach the CRM (~5 min)', how: 'admin.google.com → Apps → Google Workspace → Gmail → Routing → Add another rule. Inbound only → Modify message → Also deliver to → Add more recipients → invoicecopy@in.grayco-cs.com → Save. Show options → Account types: Users + Groups → Envelope filter: Only affect specific envelope recipients → Pattern match: ^(wjohnson|nthomas|office)@grayco-cs\.com$ → Save. docs/INVMAIL-SETUP.md' },
  { id: 'a2h_confirm', g: 'now', t: 'Confirm the A2H plan room account (leads@)', how: 'a2hplanroom.com → Register / Login → resend the confirmation. It lands on the office To-Do as "🔑 Account e-mail to leads@" with the link — click it. (The CRM already reads A2H\'s public bids without the account.)' },
  { id: 'wt_planroom', g: 'soon', t: 'West Tennessee Plan Room: weekly bulletin to leads@', how: 'wtplanroom.com → New Account (or call them), $65 a quarter. Ask for the weekly bulletin (Tuesdays) to go to leads@grayco-cs.com. Its bids then come into the Lead Inbox.' },
  { id: 'central_bidding', g: 'soon', t: 'Central Bidding: decide on the paid alerts (Southaven, Olive Branch, DeSoto)', how: 'Bid alerts need their paid plan (about $99–109 a month or $899 a year). If yes: centralbidding.com → Register Now with leads@grayco-cs.com → follow City of Southaven, City of Olive Branch and DeSoto County → construction and roofing categories → notifications to leads@grayco-cs.com.' },
  { id: 'ionwave', g: 'soon', t: 'IonWave (Memphis-Shelby County Schools): free supplier registration', how: 'mscsprocurementservices.ionwave.net → Supplier Registration (free) → contact e-mail leads@grayco-cs.com → commodity codes for construction, roofing, maintenance and repair.' },
  { id: 'squarespace_ai', g: 'soon', t: 'Website: block AI crawlers on Squarespace', how: 'Squarespace → Settings → Crawlers (or Website → SEO) → turn on "Block known AI crawlers" → Save.' },
  { id: 'late_taxes', g: 'now', t: 'Late tax filings: 941, TN SUTA, MS withholding', how: 'With the CPA: file the federal 941, the Tennessee unemployment (SUTA) report and the Mississippi withholding return that are past due, and pay what is owed to stop more penalties.' },
  { id: 'db_alert_phones', g: 'soon', t: 'Database alert texts: set DB_ALERT_PHONES', how: 'Netlify → Site configuration → Environment variables → Add DB_ALERT_PHONES = the cell numbers to text when the database is down (comma-separated, e.g. 9015551234,9015555678) → Deploys → Trigger deploy. Phone numbers only.' },"""
s = s.replace(a, items + a)
open(p, 'w', encoding='utf-8').write(s); print('OWNERLIST2 applied')
