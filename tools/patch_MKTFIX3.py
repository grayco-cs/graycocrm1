#!/usr/bin/env python3
"""Idempotent patch MKTFIX3 (Marketing audit, owner 10/30: "make sure marketing … pages are easy to use and every button
works"): the buttons the Marketing Manager saw that could only fail for him, and two small dead ends.

    python3 tools/patch_MKTFIX3.py [index.html]

  1. 🗳 Approvals (his): "Not now" said "Sent back as a draft." even when the server said no — it says what happened
     now. At stage 1 (an admin approves everything, the start setting) the page says so and where an admin changes it.
  2. ✅ My To-Do: "Add" with an empty box did nothing — it asks for the to-do.
  3. ⭐ Reviews & referrals (his view):
       • a reply he may not approve (1–3★, stage 1, or the admin setting off) shows "💾 Save the draft — an admin
         approves it" instead of "✅ Approve reply" (which could only answer "This reply needs an admin");
       • "Ask (e-mail)" is not shown: a review request is a customer e-mail the office sends (his request could never be
         sent and was retried every 5 seconds);
       • the referral log and leaderboard (customer names) are not shown; a card points to 🎁 Referral program.
  4. 🎁 Referral program (his read-only view): no "Use credit / gift code" form, no member link copy, no gift-code
     look-up, no "Add a member" / "Add a referral" forms (each answered "read-only"), no refused "pending" call; a line
     says the office adds them.
  5. 🗞 Neighborhood flyers: "⬇ Delivery list (CSV)" tells him the list is made by the office (it needs the house
     number, which he never gets) instead of "Could not read a house number from the job address."
Every find-string must match exactly once; a file that already carries the marker is left alone.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MKTFIX3'
if MARK in t:
    print('MKTFIX3: already patched'); sys.exit(0)
R = []
# 1. his approvals
R.append(("""W._gcMMData.approve(id, 'reject', { reason: r }).then(function(){ toast('Sent back as a draft.'); MK.pull(true); loadAppr(); }); };""",
"""W._gcMMData.approve(id, 'reject', { reason: r }).then(function(j){ toast(j && j.ok ? 'Sent back as a draft.' : 'Not sent back: ' + ((j && j.error) || 'try again'), !(j && j.ok)); b.disabled = false; MK.pull(true); loadAppr(); }); };   /* patch MKTFIX3: says what happened */"""))
R.append(("""  h += '<div class="gmt-card"><div class="gmt-muted">Stage ' + ((ST.mm && ST.mm.stage) || '') + ': what I may approve is marked.""",
"""  h += '<div class="gmt-card"><div class="gmt-muted">' + (ST.mm && +ST.mm.stage === 1 ? '<b>Stage 1 right now: an admin approves every marketing draft.</b> When an admin moves Marketing to stage 2 (⚙️ Focus & approvals), the drafts I may approve get a ✓ Approve button here. ' : ST.mm && ST.mm.approvesStage2 === false ? '<b>An admin has turned off "Marketing Manager approves at stage 2".</b> ' : '') + 'Stage ' + ((ST.mm && ST.mm.stage) || '') + ': what I may approve is marked."""))
# 2. My To-Do: Add with an empty box
R.append(("""ACT['mm-task-add'] = function(){ var l = s((D.getElementById('mm-task') || {}).value), due = s((D.getElementById('mm-task-due') || {}).value); if (!l) return;""",
"""ACT['mm-task-add'] = function(){ var l = s((D.getElementById('mm-task') || {}).value), due = s((D.getElementById('mm-task-due') || {}).value); if (!l) { toast('Type the to-do first.', true); try { D.getElementById('mm-task').focus(); } catch (e) {} return; }   /* patch MKTFIX3 */"""))
# 3. reviews & referrals, his view
R.append(("""W._gcMM = { state: function(){""",
"""/* patch MKTFIX3: may he approve this review reply himself? (the server's rule: stage 2+, the admin setting on, 4–5★) */
W._gcMMReplyOk = function(r){ var m = ST.mm || {}; return +m.stage >= 2 && m.approvesStage2 !== false && (+(r && r.rating) || 5) >= 4; };
W._gcMM = { state: function(){"""))
R.append(("""'<button class="gmt-btn o" data-a="rv-ask" data-id="' + esc(p.id) + '">Ask (e-mail)</button>'""",
"""(W._gcMMData ? '<span class="gmt-muted">the office sends it</span>' : '<button class="gmt-btn o" data-a="rv-ask" data-id="' + esc(p.id) + '">Ask (e-mail)</button>')   /* patch MKTFIX3 */"""))
R.append(("""    revs.map(function(r){ var canOk = full(); return""",
"""    revs.map(function(r){ var canOk = full(), mmHold = !!W._gcMMData && !(W._gcMMReplyOk && W._gcMMReplyOk(r)); return"""))
R.append(("""(canOk ? '<div class="gmt-row"><button class="gmt-btn g" data-a="rv-reply" data-id="' + esc(r.id) + '">✅ Approve reply</button>'""",
"""(canOk ? '<div class="gmt-row">' + (mmHold ? '<button class="gmt-btn" data-a="rv-draft" data-id="' + esc(r.id) + '">💾 Save the draft — an admin approves it</button>' : '<button class="gmt-btn g" data-a="rv-reply" data-id="' + esc(r.id) + '">✅ Approve reply</button>')"""))
R.append(("""  var refs = MK.all('referrals').sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; }), board = referrerBoard();""",
"""  if (W._gcMMData) return h + '<div class="gmt-card"><h2>🤝 Referrals</h2><div class="gmt-muted">Who referred whom is customer data: the office logs referrals and sends the thank-yous. The totals and the ready-made referral ads are in <a href="#" data-a="go" data-sec="refprog">🎁 Referral program</a>.</div></div>';   /* patch MKTFIX3 */
  var refs = MK.all('referrals').sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; }), board = referrerBoard();"""))
R.append(("""ACT['rv-post'] = function(b){""",
"""ACT['rv-draft'] = function(b){ var id = b.getAttribute('data-id'), t = s((D.getElementById('gmt-rr-' + id) || {}).value); if (!t) { toast('Write the reply first.', true); return; } MK.put('reviews', { id: id, replyDraft: t }); MK.push(); toast('Draft saved — an admin approves it in ⭐ Reviews & referrals.'); };   /* patch MKTFIX3 */
ACT['rv-post'] = function(b){"""))
# 4. referral program, read-only
R.append(("""  h += useCard();
  if (S.denied)""",
"""  if (!(d && d.readOnly)) h += useCard();   /* patch MKTFIX3: read-only (the Marketing Manager): no forms that can only say no */
  if (S.denied)"""))
R.append(("""    .then(function(){ return api('?pending=1').then(function(j){ S.pending = arr(j.cards); }, function(){}); })
    .then(function(){ S.loading = false; paintMkt(); });""",
"""    .then(function(){ if (S.data && S.data.readOnly) return; return api('?pending=1').then(function(j){ S.pending = arr(j.cards); }, function(){}); })
    .then(function(){ S.loading = false; paintMkt(); });"""))
R.append(("""<button class="gmt-btn o" data-gref="link" data-link="' + esc(m.link) + '">Copy link</button>'""",
"""' + (d.readOnly ? '' : '<button class="gmt-btn o" data-gref="link" data-link="' + esc(m.link) + '">Copy link</button>')"""))
R.append(("""+ '<button class="gmt-btn o" data-gref="use-member" data-id="' + esc(m.id) + '">Use credit…</button>'""",
"""+ (d.readOnly ? '' : '<button class="gmt-btn o" data-gref="use-member" data-id="' + esc(m.id) + '">Use credit…</button>')"""))
R.append(("""'<input class="gref-in" style="width:110px" data-gref-last4="1" placeholder="Last 4" value="' + esc(S.last4) + '"><button class="gmt-btn o" data-gref="lookup">Look up</button>'""",
"""(d.readOnly ? '<span class="gmt-muted">(the office looks codes up)</span>' : '<input class="gref-in" style="width:110px" data-gref-last4="1" placeholder="Last 4" value="' + esc(S.last4) + '"><button class="gmt-btn o" data-gref="lookup">Look up</button>')"""))
R.append(("""  h += '<div class="gmt-two"><div class="gmt-card"><h2>➕ Add a member</h2>""",
"""  if (d.readOnly) h += '<div class="gmt-card"><div class="gmt-muted">👀 Read-only: the office adds members, referrals and credit — customer names and contact details stay with the office. The totals above and the ready-made referral ads below are yours to use.</div></div>';
  else h += '<div class="gmt-two"><div class="gmt-card"><h2>➕ Add a member</h2>"""))
# 5. flyers: the delivery list
R.append(("""if (!l.length) { toast('Could not read a house number from the job address.', true); return; }""",
"""if (!l.length) { toast(W._gcMMData ? 'The delivery list needs the job\\'s house number, which stays with the office — ask the office for the list (the flyer itself prints from here).' : 'Could not read a house number from the job address.', true); return; }   /* patch MKTFIX3 */"""))
for old, new in R:
    n = t.count(old)
    assert n == 1, (n, old[:90])
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('MKTFIX3: patched')
