#!/usr/bin/env python3
"""Idempotent patch PORTALTEAM (owner 11/23: "The portal should be for the company that way everyone that signs up the entire
company can check out the portal not just the guy that signs up. So let their sign up be for everyone in their companies").

The CRM side: Admin -> Sub portal accounts (gc-patch-subacct) shows and manages each company's TEAM:
  * the list: a "Wants to join" filter (a free-mail sign-up that named an approved company) and a team count on each company;
  * the profile sheet: a Team section -- the main contact + every member (e-mail / phone, added by whom / when, removed by whom /
    when, invited), with Add (name + e-mail / mobile), Send invite (a person's click), Remove (keeps the record), Restore, and for a
    request to join: Approve / Not this company. Owners AND the office (role, never a name) -- staff may remove the last person.
Server: netlify/functions/sub-accounts.js (get -> team, team-set) on _lib/portalteam.js.
Every MARK sits inside a JS comment. Anchors must each occur exactly once.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = 'PORTALTEAM'
if '/* PORTALTEAM: the team section */' in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_SUBACCT__' in src, 'PORTALTEAM goes on top of SUBACCT'


def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


# 1. the filter
src = once(src, "var FILT = [['all', 'All'], ['pending', '⏳ Pending'], ['approved', '✅ Approved'], ['disabled', '🔒 Off'], ['denied', '⛔ Denied'], ['unlinked', 'Not in CRM'], ['orphan', '⚠ No profile']];\n",
           "var FILT = [['all', 'All'], ['pending', '⏳ Pending'], ['approved', '✅ Approved'], ['disabled', '🔒 Off'], ['denied', '⛔ Denied'], ['unlinked', 'Not in CRM'], ['orphan', '⚠ No profile'], ['joinreq', '👥 Wants to join']];   /* PORTALTEAM: + a free-mail sign-up asking to join a company */\n")

# 2. the list row: the team count under the company
src = once(src, "return '<tr data-sa-row=\"' + esc(r.id) + '\" tabindex=\"0\"><td><b>' + esc(r.company || '—') + '</b>' + (r.mustChange ? '<div class=\"w\">asked to change password</div>' : '') + '</td>",
           "return '<tr data-sa-row=\"' + esc(r.id) + '\" tabindex=\"0\"><td><b>' + esc(r.company || '—') + '</b>' + (r.mustChange ? '<div class=\"w\">asked to change password</div>' : '') + teamTag(r) + '</td>")

# 3. the sheet: the team section (before the owners-only Password section; shown to owners and the office)
TEAM_FN = r"""/* PORTALTEAM: the team section */
function teamTag(r){ var t = r && r.team; if (!t || (!t.active && !t.requested)) return ''; return '<div class="w" data-sa-teamtag>👥 ' + (t.active + 1) + ' on the team' + (t.requested ? ' · <b>' + t.requested + ' wants to join</b>' : '') + '</div>'; }
function teamSection(g){
  var T = g.team || {}, L = arr(T.list), ed = !!g.teamEdit, busy = !!SH.busy;
  var dis = function(){ return (busy || !ed) ? ' disabled' : ''; };
  var who = function(a){ return a ? esc(a.name || a.email) + (a.role === 'staff' ? ' (GrayCo)' : '') : ''; };
  var h = '<h4>👥 Team</h4><div class="box" data-sa-team><div class="w" style="margin-bottom:6px">Everyone here signs in with their own e-mail / phone and sees this company\'s jobs, bids, papers, pay and messages (bid site and GrayCo Portal). Removing keeps the record and ends their sign-in.</div>';
  if (T.error) h += '<div class="err">' + esc(T.error) + '</div>';
  if (T.wantsJoin && T.wantsJoin.company) h += '<div class="note" data-sa-wants>This sign-up asked to join <b>' + esc(T.wantsJoin.company) + '</b> (a free-mail address, so it was not joined by itself). Open that company\'s account to approve it.</div>';
  L.forEach(function(x){
    var st = x.status === 'active' ? '🟢 active' : x.status === 'requested' ? '⏳ wants to join' : x.status === 'denied' ? '⛔ not this company' : x.status === 'verify' ? '✉️ confirming their e-mail (no access yet)' : '⏸ removed';
    var meta = [x.primary ? 'main contact' : (x.via === 'domain' ? 'signed up with the company e-mail' : x.via === 'request' ? 'asked to join' : x.addedBy ? 'added by ' + who(x.addedBy) + ' ' + when(x.addedAt, true) : ''),
      x.status === 'removed' && x.removedBy ? 'removed by ' + who(x.removedBy) + ' ' + when(x.removedAt, true) : '', x.decidedBy ? 'decided by ' + who(x.decidedBy) + ' ' + when(x.decidedAt, true) : '',
      x.invitedAt ? 'invited ' + when(x.invitedAt, true) : '', x.notify ? '🔔 notices on' : ''].filter(Boolean).join(' · ');
    var acts = '';
    if (ed) {
      if (x.status === 'requested') acts += '<button type="button" data-sa-act="team" data-op="approve" data-m="' + esc(x.id) + '"' + dis() + '>✅ Approve join</button><button type="button" class="r" data-sa-act="team" data-op="deny" data-m="' + esc(x.id) + '"' + dis() + '>✕ Not this company</button>';
      if (x.status === 'active' && !x.primary) acts += '<button type="button" class="g" data-sa-act="team" data-op="invite" data-m="' + esc(x.id) + '"' + dis() + '>✉️ Send invite</button>';
      if (x.status === 'active') acts += '<button type="button" class="g" data-sa-act="team" data-op="remove" data-m="' + esc(x.id) + '"' + dis() + '>Remove</button>';
      if (x.status === 'removed') acts += '<button type="button" class="g" data-sa-act="team" data-op="restore" data-m="' + esc(x.id) + '"' + dis() + '>Restore</button>';
    }
    h += '<div data-sa-member="' + esc(x.id) + '" style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between;border-top:1px solid #e2e8f0;padding:7px 0"><div style="min-width:0;flex:1 1 240px;overflow-wrap:anywhere"><b>' + esc(x.name || x.email || x.phone) + '</b> <span class="w">' + esc([x.email, x.phone].filter(Boolean).join(' · ')) + '</span><div class="w">' + st + (meta ? ' · ' + meta : '') + '</div></div>'
      + (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div>';
  });
  if (ed) h += '<div class="grid" style="margin-top:8px"><div><label for="gc-sa-tm-name">Name</label><input type="text" id="gc-sa-tm-name" data-sa-tm="name" maxlength="80"></div><div><label for="gc-sa-tm-email">E-mail</label><input type="text" id="gc-sa-tm-email" data-sa-tm="email" maxlength="200" inputmode="email"></div><div><label for="gc-sa-tm-phone">Mobile</label><input type="text" id="gc-sa-tm-phone" data-sa-tm="phone" maxlength="40" inputmode="tel"></div></div>'
    + '<div class="acts" style="margin-top:6px"><button type="button" data-sa-act="team" data-op="add"' + dis() + '>＋ Add to the team</button></div><div class="w">An invite goes only when someone taps ✉️ Send invite (customer quiet hours and data-entry mode apply).</div>';
  return h + '</div>';
}
"""
src = once(src, "function paintSheet(){\n  var m = sheetEl(); if (!m) return;\n", TEAM_FN + "function paintSheet(){\n  var m = sheetEl(); if (!m) return;\n")
src = once(src, "  if (ed) {\n    h += '<h4>🔑 Password</h4>",
           "  h += teamSection(g);   /* PORTALTEAM: owners and the office */\n  if (ed) {\n    h += '<h4>🔑 Password</h4>")

# 4. the clicks
src = once(src, "  if (a === 'save') {\n    var set = {}; Array.prototype.forEach.call(m.querySelectorAll('[data-sa-f]')",
           "  if (a === 'team') {   /* PORTALTEAM: add / invite / remove / restore / approve / deny */\n"
           "    var op = b.getAttribute('data-op'), mid = b.getAttribute('data-m') || '', body = { op: op, memberId: mid };\n"
           "    if (op === 'add') { body.name = val('[data-sa-tm=name]'); body.email = val('[data-sa-tm=email]'); body.phone = val('[data-sa-tm=phone]'); if (!s(body.name) || (!s(body.email) && !s(body.phone))) { toast('Type a name and an e-mail or mobile number', true); return; } }\n"
           "    return run(op === 'invite' ? 'Sending the invite…' : 'Saving…', 'team-set', body, function(j){ var iv = j.invite; toast(op === 'invite' ? (iv && iv.ok ? (iv.held ? '✉️ Invite will go at 7:00 AM' : '✉️ Invite sent') : 'Invite not sent' + (iv && iv.why ? ' — ' + iv.why : '')) : '✓ Team updated', op === 'invite' && !(iv && iv.ok)); });\n"
           "  }\n"
           "  if (a === 'save') {\n    var set = {}; Array.prototype.forEach.call(m.querySelectorAll('[data-sa-f]')")

assert src.count(MARK) >= 4
open(path, 'w', encoding='utf-8').write(src)
print('patched PORTALTEAM')
