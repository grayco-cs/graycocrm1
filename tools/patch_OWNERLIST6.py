# OWNERLIST6 (owner 11/25: "anything the last 3 days I ignored … questions etc so I can answer them instead of reading all of the chats"):
# every question / to-do from 11/22–11/25 still waiting on the owner goes on 🔧 Owner setup.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'OWNERLIST6' not in s
import re
m = re.search(r"^  \{ id: 'q_bcapi',[^\n]*\n", s, re.M)
assert m and s.count("{ id: 'q_bcapi'") == 1
add = r"""  /* OWNERLIST6 (owner 11/25): what waited on the owner from 11/22–11/25 */
  { id: 'ch_bills', g: 'now', t: 'Move 2 CH Plumbing bills to the right jobs: #1250 (3161 Hwy 64 — now on New Office) and #1302 (2681 Mount Moriah — now on Lexington Enterprise)', how: '✅ Approvals or the bill → ✎ Edit → pick the job at that address → Save. (They were placed before the PO / address / customer-name rule.)' },
  { id: 'q_archived9', g: 'soon', t: 'Check the 9 CRM invoices archived 11/20 as "not in QuickBooks" — were any really billed?', how: 'Biggest: Zoo Boardwalk final $59,522, EAN Holdings draws ($44,180 + $44,180), S.W. Eavenson $20,861 (twice). If one was really sent to the customer, enter it in QuickBooks — the CRM then counts it again. Nothing was deleted (archived).' },
  { id: 'q_cardswipe', g: 'soon', t: 'Answer: card swipes — suggest a job only by PO, address or customer name (the same rule as bills)?', how: 'Tell Claude yes or no.' },
  { id: 'q_latedl', g: 'soon', t: 'Answer: a sub who only DOWNLOADED the plans before the due date — may they still send a late bid?', how: 'Today: no (only saved / started a bid, asked a question, messaged, or did a takeoff). Tell Claude yes or no.' },
  { id: 'q_supmail', g: 'soon', t: 'Answer: suppliers now SEE every job on the bid portal — e-mail them about every new job too?', how: 'Today they get the new-job e-mail only for a job with 🧱 Suppliers can quote ticked or one they are invited to. Tell Claude yes or no.' },
  { id: 'q_morninglist', g: 'soon', t: 'Answer: pause this morning owner-setup list until next week too?', how: 'The CRM / screen watch stops after 11/25 4 PM. Tell Claude yes to pause the morning list as well.' },
  { id: 'q_roleswitch', g: 'later', t: 'Answer: the new hybrid hire (super / PM / estimator) — a role switcher on his screen?', how: 'Today you change his Role in Admin → Employees → Edit and his tabs change. With a switcher he flips between the roles you allow, himself. Tell Claude yes or no.' },
  { id: 'q_apprweak', g: 'later', t: 'Answer: the "keeps retrying on one bar" for material requests, time off, invoice sign-offs and payroll approvals too?', how: 'Sub invoices and expenses already keep retrying until the office has them. Tell Claude yes to do the rest.' },
  { id: 'q_assigncount', g: 'later', t: 'Answer: count "👤 Assign this lead" cards in the ✅ Approvals number?', how: 'They make the approvals number jump. Tell Claude: keep them in, or show them only under Leads.' },
  { id: 'q_schedmonth', g: 'later', t: 'Answer: Schedule — always open on the current month?', how: 'On 11/24 it opened on December (0 items). Tell Claude yes if you did not pick December yourself.' },
  { id: 'q_driveplans', g: 'later', t: 'Answer: any Google Drive / Dropbox link GrayCo posts on a bid job — always show it to subs as plans?', how: 'Today a link reaches subs only when its label says Plans / Drawings / Specs (plan rooms and solicitations never do). Tell Claude yes or no.' },
"""
s = s[:m.end()] + add + s[m.end():]
open(p, 'w', encoding='utf-8').write(s); print('OWNERLIST6 applied')
