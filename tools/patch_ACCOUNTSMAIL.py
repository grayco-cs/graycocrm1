#!/usr/bin/env python3
"""Idempotent patch ACCOUNTSMAIL: company service sign-ups use accounts@grayco-cs.com (owner 10/27).
The CRM's setup wording said to sign up for Twilio with replies@grayco-cs.com. Company accounts (Twilio, Netlify,
Resend, Supabase, Google Cloud, Meta, CompanyCam) are signed up with accounts@grayco-cs.com; replies@ stays the
Reply-To of the CRM's automatic e-mails. Wording only — no reply_to address in netlify/functions changes.
  index.html: the Twilio setup steps (Admin), the owners' "Sign up for Twilio" to-do (SEEDV 3 → 4 so an open to-do
  gets the new wording; a step already ticked stays ticked), the 🔌 activation list, and the e-mail address guides
  (playbook, handbook, the built-in guide) get one line about accounts@.
  docs/*.md: the same wording.
usage: python3 tools/patch_ACCOUNTSMAIL.py [repo root]"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
MARK = 'ACCOUNTSMAIL'

def once(src, a, b, what, n=1):
    c = src.count(a)
    assert c == n, 'ACCOUNTSMAIL %s: expected %d of %r, found %d' % (what, n, a[:90], c)
    return src.replace(a, b)
def rd(p): return open(os.path.join(root, p), encoding='utf-8').read()
def wr(p, s): open(os.path.join(root, p), 'w', encoding='utf-8').write(s)

LINE = ('Never sign up for bid sites with bids@ or your personal e-mail. Use leads@grayco-cs.com.',
        'Never sign up for bid sites with bids@ or your personal e-mail. Use leads@grayco-cs.com. '
        'Company service accounts (Twilio, Netlify, Resend, Supabase, Google Cloud, Meta, CompanyCam) are signed up with accounts@grayco-cs.com; '
        'replies@ is only the Reply-To of the CRM\'s e-mails.')
LINE_JS = (LINE[0], LINE[1].replace("CRM's", 'CRM’s'))   # inside JS strings: no straight quote

done = []
s = rd('index.html')
if 'accounts@grayco-cs.com' not in s:
    s = once(s, "    + '<li>twilio.com → sign up with <b>replies@grayco-cs.com</b> → upgrade the account (texts to customers need a paid account).</li>'",
                "    + '<li>twilio.com → sign up with <b>accounts@grayco-cs.com</b> (company service accounts use accounts@) → upgrade the account (texts to customers need a paid account).</li>'", 'twilio steps')
    s = once(s, "items: ['Sign up at twilio.com with replies@grayco-cs.com', ", "items: ['Sign up at twilio.com with accounts@grayco-cs.com', ", 'owner to-do')
    s = once(s, "var SEEDV = 3; /* LEADSDOC-rule */", "var SEEDV = 4; /* LEADSDOC-rule; 4 = " + MARK + " */", 'SEEDV')
    s = once(s, "had[low(l).replace(/to leads@.*\\)$/, 'to bids@)')]) }; });",
                "had[low(l).replace(/to leads@.*\\)$/, 'to bids@)')] || had[low(l).replace('accounts@grayco-cs.com', 'replies@grayco-cs.com')]) }; });", 'seed ticks')
    s = once(s, "how: 'Sign up at twilio.com with replies@grayco-cs.com, upgrade to paid,", "how: 'Sign up at twilio.com with accounts@grayco-cs.com, upgrade to paid,", 'activation list')
    s = once(s, LINE_JS[0], LINE_JS[1], 'e-mail guides', 3)
    wr('index.html', s); done.append('index.html')

for p in ('docs/ACTIVATE-EVERYTHING.md', 'docs/EMAIL-CENTER.md', 'docs/LEAD-INBOX-SETUP.md', 'docs/RECEIPTS-INVOICES-EMAIL.md', 'docs/AUTOMATIONS-AUTO6.md'):
    d = rd(p)
    if 'accounts@grayco-cs.com' in d: continue
    if p.endswith('AUTO6.md'):
        d = once(d, '1. Sign up at twilio.com with replies@grayco-cs.com and upgrade the account.', '1. Sign up at twilio.com with accounts@grayco-cs.com (company service accounts use accounts@) and upgrade the account.', p)
    else:
        d = once(d, LINE[0], LINE[1], p)
    wr(p, d); done.append(p)
print('ACCOUNTSMAIL: ' + ('patched ' + ', '.join(done) if done else 'already patched'))
