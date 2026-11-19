#!/usr/bin/env python3
"""Idempotent patch JOBMSG: 💬 Job Messages (owner 11/19, on his iPhone, PO C846 · Outdoor Entertainment Area).

1. "The phone should auto-enter if they have a number": the 📱 Text them phone is filled with the job's customer phone each time
   a thread opens or the Switch job… search moves to another job (the number that texted in, the job's phone fields, the linked
   customer, the lead it came from, a customer / lead at the same address); editable; several numbers → a small picker.
2. "Make sure if I message the team down there they get a notification": every team message asks
   netlify/functions/job-notify.js (_lib/jobmsgnotify.js) to push + text each @tagged person (or the PM; never the sender),
   with the staff quiet hours, Away and a 5-minute throttle per person per job.
tools/jobmsg_block.html becomes a script right after JOBMENTION; three small hooks in TXT's bar and in addMsg.
Kill switch: localStorage gc_jobmsg_off = '1'.
Usage: python3 tools/patch_JOBMSG.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_JOBMSG__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jobmsg_block.html'), encoding='utf-8').read().rstrip('\n')
a = src.index('<script id="gc-patch-jobmention">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]

# the job thread: every new team message → job-notify (a real notification)
src = once(src, "    return newMsg;   /* patch JOBMENTION */",
  "    try{ if(window._gcJobMsgNotify) window._gcJobMsgNotify(newMsg); }catch(e){}   /* patch JOBMSG: a push + a text for the people told */\n"
  "    return newMsg;   /* patch JOBMENTION */")
src = once(src, "Tap a name or type @ — they get it in their 💬 Messages. No @: the job\\'s PM is told.",
  "Tap a name or type @ — they get a text / phone notification and it is in their 💬 Messages. No @: the job\\'s PM is told.")

# TXT's 📱 Text them bar: the job's phone (customer / lead / job fields), and the picker
src = once(src, "  var ph = phoneFor(pid);\n  if (DRAFT.pid !== pid) DRAFT = { pid: pid, to: ph ? tidy(ph) : '', text: '' };",
  "  var ph = phoneFor(pid);\n"
  "  try { if (W._gcJobPhones) { var jph = W._gcJobPhones(pid); if (jph.length) ph = jph[0].d; } } catch (e) {}   /* patch JOBMSG: + the customer record, the lead, the address */\n"
  "  if (DRAFT.pid !== pid) DRAFT = { pid: pid, to: ph ? tidy(ph) : '', text: '' };\n"
  "  else if (!s(DRAFT.to) && !DRAFT.typed && ph) DRAFT.to = tidy(ph);   /* patch JOBMSG */")
src = once(src, "  b.addEventListener('input', function(){ DRAFT.to = b.querySelector('.gctx-to').value; DRAFT.text = b.querySelector('.gctx-msg').value; });",
  "  b.addEventListener('input', function(ev){ DRAFT.to = b.querySelector('.gctx-to').value; DRAFT.text = b.querySelector('.gctx-msg').value; if (ev && ev.target && ev.target.classList && ev.target.classList.contains('gctx-to')) DRAFT.typed = true; });   /* patch JOBMSG: typed = keep it */")
src = once(src, "  if (thr && thr.parentNode === card) card.insertBefore(b, thr); else card.insertBefore(b, card.children[1] || null);",
  "  if (thr && thr.parentNode === card) card.insertBefore(b, thr); else card.insertBefore(b, card.children[1] || null);\n"
  "  try { if (W._gcJobPhonePick) W._gcJobPhonePick(b, pid, DRAFT); } catch (e) {}   /* patch JOBMSG: several numbers → a picker */")
open(path, 'w', encoding='utf-8').write(src)
print('patched')
