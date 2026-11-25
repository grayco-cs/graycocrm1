# OWNERLIST7 (owner 11/25 answers): late bid after a plan download = yes (LATEDL); supplier e-mails only when invited = as today; the
# morning owner-setup list stays; no role switcher (Admin → Employees); "keeps retrying" for the other approvals = yes (Claude, next week);
# Assign-lead cards stay in the admin's Approvals; Schedule opens on the current month = yes (SCHEDMONTH); Drive / Dropbox links are plans
# = yes (DRIVEPLANS); supplier finance charges = overhead (as today); HOA letter saved (HOALETTER); bids@ unsorted → office@ = yes
# (BIDSFWD); 3D plan builder "needs a lot of work" (Claude's list). Answered items come off 🔧 Owner setup; two are re-asked plainer.
import re
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'OWNERLIST7' not in s
gone = ['q_latedl', 'q_supmail', 'q_morninglist', 'q_roleswitch', 'q_apprweak', 'q_assigncount', 'q_schedmonth', 'q_driveplans',
        'q_fincharge', 'q_hoaletter', 'q_bidsfwd', 'q_planbuilder']
for i in gone:
    pat = re.compile(r"^  \{ id: '" + i + r"',[^\n]*\n", re.M)
    assert len(pat.findall(s)) == 1, i
    s = pat.sub('', s)
a = re.search(r"^  \{ id: 'q_cardswipe',[^\n]*\n", s, re.M); assert a
s = s[:a.start()] + r"""  /* OWNERLIST7 (owner 11/25): answered items are off the list; these two asked again, plainer */
  { id: 'q_cardswipe', g: 'soon', t: 'Answer: company card purchases — when one comes in, should the CRM put it on a job only if the receipt shows that job\'s PO, address or customer name? (Otherwise it waits in "Match this" for you.)', how: 'Today it may also guess from the store and the date. Tell Claude: "only PO / address / name", or "keep guessing".' },
  { id: 'q_subsall', g: 'soon', t: 'Answer: subs — see EVERY public job on the bid portal, or only jobs that list their trade (your 11/23 rule)?', how: 'Suppliers already see every job. Subs see public jobs with their trade + jobs they are invited to. Tell Claude: "every job" or "keep trade only".' },
""" + s[a.end():]
b = re.search(r"^  \{ id: 'q_bcapi',[^\n]*\n", s, re.M); assert b
s = s[:b.start()] + r"""  { id: 'q_bcapi', g: 'later', t: 'Decide: connect BuildingConnected (Autodesk) to read password-protected plan rooms', how: 'Autodesk has a BuildingConnected API, but it needs a paid BuildingConnected plan (Bid Board Pro) and an Autodesk developer sign-in. Tell Claude which BuildingConnected plan GrayCo has, and yes / no.' },
""" + s[b.end():]
open(p, 'w', encoding='utf-8').write(s); print('OWNERLIST7 applied')
