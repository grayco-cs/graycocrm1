#!/usr/bin/env python3
"""Idempotent patch SIGNUPVERIFY (owner 11/23: "Yes subs should confirm their email").

The CRM side of the sign-up e-mail confirm: Admin -> Sub portal accounts (gc-patch-subacct) shows "e-mail not confirmed yet" on
the list (a filter + a tag) and on the account, with a "Resend confirm link" button (owners and the office; the link only ever
goes to the sign-up's own e-mail). Server: netlify/functions/sub-accounts.js (rowOut.emailUnconfirmed, verify-resend).
Every MARK sits inside a JS comment. Anchors must each occur exactly once.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = 'SIGNUPVERIFY'
if '/* SIGNUPVERIFY: the e-mail confirm */' in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_SUBACCT__' in src and '/* PORTALTEAM: the team section */' in src, 'SIGNUPVERIFY goes on top of SUBACCT + PORTALTEAM'


def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


src = once(src, "['joinreq', '👥 Wants to join']];",
           "['joinreq', '👥 Wants to join'], ['unconfirmed', '✉️ E-mail not confirmed']];   /* SIGNUPVERIFY: + sign-ups that have not confirmed their e-mail */")
src = once(src, "teamTag(r) + '</td>",
           "teamTag(r) + (r.emailUnconfirmed ? '<div class=\"w\" data-sa-unconf>✉️ e-mail not confirmed yet</div>' : '') /* SIGNUPVERIFY */ + '</td>")
src = once(src, "  var orphan = r.status === 'orphan';\n",
           "  var orphan = r.status === 'orphan';\n"
           "  /* SIGNUPVERIFY: the e-mail confirm */\n"
           "  if (r.emailUnconfirmed) h += '<div class=\"note\" data-sa-unconfirmed>✉️ <b>E-mail not confirmed yet.</b> This sign-up gets nothing (no jobs, bids, papers or approval) until they tap the link sent to ' + esc(r.email) + '. It can\\'t be approved before that.'\n"
           "    + ((g.canEdit || g.teamEdit) ? '<div class=\"acts\" style=\"margin-top:6px\"><button type=\"button\" class=\"g\" data-sa-act=\"svresend\"' + (SH.busy ? ' disabled' : '') + '>✉️ Resend confirm link</button></div>' : '') + '</div>';\n")
src = once(src, "  if (a === 'team') {   /* PORTALTEAM",
           "  if (a === 'svresend') return run('Sending the link…', 'verify-resend', {}, function(j){ toast(j.already ? 'Already confirmed' : '✉️ Confirm link sent to ' + (r.email || 'them')); });   /* SIGNUPVERIFY */\n"
           "  if (a === 'team') {   /* PORTALTEAM")
assert src.count(MARK) >= 4
open(path, 'w', encoding='utf-8').write(src)
print('patched SIGNUPVERIFY')
