# OWNERLIST5 (owner 11/24): the supplier-statement answers are in (PO / address / customer name; the office does the bookkeeper work),
# finance charges are a "don't know" (today's rule stays) — and the questions he has not answered yet go on 🔧 Owner setup.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'OWNERLIST5' not in s
a = "  { id: 'q_supstmt', g: 'soon', t: 'Answer: supplier statements — put ABC bills on jobs from the statement\\'s PO / address? Finance charges as overhead?', how: 'Tell Claude yes / no for each (🧾 Supplier statement on Accounting).' },\n"
assert s.count(a) == 1, s.count(a)
s = s.replace(a, r"""  /* OWNERLIST5: answered 11/24 — ABC bills go on jobs by PO / address / customer name; the office uses the bookkeeper tools. Still open: */
  { id: 'q_fincharge', g: 'later', t: 'Answer: supplier finance charges — leave unpaid unless ticked, and book them as overhead when paid?', how: 'That is how 🧾 Supplier statement works today. Ask the CPA, then tell Claude yes or how to book them.' },
  { id: 'q_hoaletter', g: 'soon', t: 'Answer: save the HOA intro letter (our portal keeps their properties\' jobs in one place) as a CRM outreach template?', how: 'Tell Claude yes, or what to change. Then it is one tap from Leads → 🏘 HOAs.' },
  { id: 'q_bidsfwd', g: 'later', t: 'Answer: bids@ e-mail the CRM cannot sort — forward it to office@ too?', how: 'Today leads@ mail that is not a lead goes to office@; bids@ mail that is not a bid stays in the CRM only. Tell Claude yes or no.' },
  { id: 'q_planbuilder', g: 'soon', t: 'Answer: which plans did the 3D plan builder get wrong?', how: 'Tell Claude the job or plan set name so it can test the reader on those exact plans.' },
  { id: 'q_bcapi', g: 'later', t: 'Decide: BuildingConnected API for password-protected plan rooms', how: 'Without it those plan rooms are read from their e-mail alerts only. Tell Claude yes to set up the connection (needs an Autodesk account sign-in once).' },
""")
open(p, 'w', encoding='utf-8').write(s); print('OWNERLIST5 applied')
