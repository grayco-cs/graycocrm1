#!/usr/bin/env python3
"""Idempotent patch JOBMENTION: 💬 Job Messages — @mentions that work on a phone, and who is told (owner 11/03, iPhone, Field,
ROTC Cordova PO T724: "It wouldn't let me @ anyone, and that @ should go to a notification on the employee's CRM Messages").

What was wrong (index.html, the JOB MESSAGES module, "per-job team thread with @tagging + notifications"):
  1. The module read the signed-in person from window.meUser(), which no part of the CRM defines. Every message was saved as
     authorId "me" / authorName "Someone", and every reader's own id was "me" too — so every message counted as the reader's
     OWN: no unread anywhere, no "where you're tagged" alert, nobody was ever told. Now it reads window._gcMeUser().
  2. The "Tag:" chips were <label><input type=checkbox> pills (13 px box, no visible state on the phone, no text in the box)
     and typing "@" did nothing at all. The thread also redrew itself (innerHTML) when the cloud pull came back, wiping the
     typed text and the ticks. Now: a chip is a button — a tap puts "@First Last " at the cursor (or the end) and keeps the
     focus; typing "@" opens a tap-able list (↑ ↓ Enter on a keyboard); the draft, cursor and focus survive a redraw.
  3. Who is told (owner's rule, team messages; texts with customers keep their old behaviour):
       • no @ → the job's PM only (not when the PM wrote it); a job with no PM → the owners (role, patch DUPJOB3's
         _gcOwnerUsers), never the sender;
       • @mentions → each person named (@Office = the office role: office@ / Office Admin people) AND the PM (owners when
         no PM); never the sender; one notification per person per message; nobody else.
     The list is stamped on the message (m.notify / m.mentions) when it is sent; older messages are worked out the same way
     (a message saved as "me" before this fix has no known sender and tells nobody).
  4. Where it shows: 💬 Messages (the desk tab, and the phone's "Messages & texts" job list) get a "🔔 For you" list —
     "<sender> @mentioned you on <job>: <text>" (or "<sender> wrote on your job …" for the PM) — tap → that job's thread
     (opening it marks it read, synced through APPRSYNC's read marks). The count is a badge on the left-menu 💬 Messages,
     the top bar 💬, the Field "Messages & texts" tile, and the per-job badges / Field alerts follow the same rule.
     Each @mentioned person also gets the existing mention To-Do (gc_office_tasks kind "mention", the GrayCo Photos /
     APPRMENTION channel, "💬 Reply" opens the thread); opening the thread closes it. No text, e-mail or push — the
     existing mention path sends none.
Usage: python3 tools/patch_JOBMENTION.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '__GC_PATCH_JOBMENTION__'
if MARK in t:
    print('JOBMENTION: already patched'); sys.exit(0)
R = []

# 1. the signed-in person (window.meUser never existed)
R.append(("""  function me(){ try{ return (window.meUser&&window.meUser())||{}; }catch(e){ return {}; } }
  function myName(){ var u=me(); return u.name||u.email||u.role||'Someone'; }
  function myId(){ var u=me(); return u.id||u.email||u.name||'me'; }

  function getMsgs(){ try{ return JSON.parse(localStorage.getItem(MSG_KEY)||'[]'); }catch(e){ return []; } }""",
"""  function me(){ try{ if(typeof window._gcMeUser==='function'){ var _u=window._gcMeUser(); if(_u&&(_u.name||_u.email)) return _u; } }catch(e){} try{ return (window.meUser&&window.meUser())||{}; }catch(e){ return {}; } }   /* patch JOBMENTION: window.meUser never existed — every message was "Someone" / "me" and everyone's own */
  function myName(){ var u=me(); return u.name||u.email||u.role||'Someone'; }
  function myId(){ var u=me(); return u.id||u.email||u.name||'me'; }

  function getMsgs(){ try{ return JSON.parse(localStorage.getItem(MSG_KEY)||'[]'); }catch(e){ return []; } }"""))

# 2. the message: who is told, stamped when it is sent
R.append(("""    var newMsg={ id:'M'+Date.now()+Math.random().toString(36).slice(2,6), pid:pid, authorId:myId(), authorName:myName(), text:text, tags:tags||[], at:new Date().toISOString() };
    var msgs=getMsgs(); msgs.push(newMsg); setMsgs(msgs);""",
"""    var newMsg={ id:'M'+Date.now()+Math.random().toString(36).slice(2,6), pid:pid, authorId:myId(), authorName:myName(), text:text, tags:tags||[], at:new Date().toISOString() };
    try{ if(window._gcJM) window._gcJM.stamp(newMsg); }catch(e){}   /* patch JOBMENTION: m.mentions + m.notify (who is told) */
    var msgs=getMsgs(); msgs.push(newMsg); setMsgs(msgs);"""))
R.append(("""    pullMsgs(_afterPull);
  }

  window._gcJobMsgAdd = addMsg;   /* patch FIELD */""",
"""    pullMsgs(_afterPull);
    return newMsg;   /* patch JOBMENTION */
  }

  window._gcJobMsgAdd = addMsg;   /* patch FIELD */"""))

# 3. opening a thread closes my mention To-Dos for it
R.append(("""    if(!pid){ alert('Open this from a specific job.'); return; }
    var proj=projects().find(function(p){return p&&p.id===pid;})||{};
    pullMsgs(function(){ render(); });""",
"""    if(!pid){ alert('Open this from a specific job.'); return; }
    try{ if(window._gcJM) window._gcJM.opened(pid); }catch(e){}   /* patch JOBMENTION */
    var proj=projects().find(function(p){return p&&p.id===pid;})||{};
    pullMsgs(function(){ render(); });"""))

# 4. the redraw keeps what was typed
R.append(("""    function render(){
      var msgs=jobMsgs(pid);
      var mid=myId();""",
"""    function render(){
      try{ if(window._gcJM) window._gcJM.keep(ov, pid); }catch(e){}   /* patch JOBMENTION: the draft, the cursor and the focus survive the redraw */
      var msgs=jobMsgs(pid);
      var mid=myId();"""))
R.append(("""          + esc(m.text)
          + (tagged?""", """          + (window._gcJM?window._gcJM.chipText(esc(m.text)):esc(m.text))   /* patch JOBMENTION */
          + (tagged?"""))

# 5. the chips: buttons that put @Name in the box
R.append(("""      var tagOpts = users().filter(function(u){ return u && (u.name||u.email); }).map(function(u){
        var uid=(u.id||u.email||u.name);
        return '<label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;background:#eef2f7;border-radius:10px;padding:2px 8px;cursor:pointer"><input type="checkbox" class="_jmTag" value="'+esc(uid)+'" style="width:13px;height:13px"> @'+esc(u.name||u.role||u.email)+'</label>';
      }).join(' ');""",
"""      var tagOpts = window._gcJM ? window._gcJM.chipsHtml() : '';   /* patch JOBMENTION: a tap puts "@First Last" in the message (was a checkbox) */"""))
R.append(("""        +'<div style="margin:6px 0;display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span style="font-size:11px;color:#64748b;margin-right:2px">Tag:</span>'+tagOpts+'</div>'""",
"""        +'<div id="_jmMn" role="listbox" aria-label="Mention someone on the team" data-gc-keep="1" style="display:none"></div>'
        +'<div id="_jmTags" style="margin:6px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:11px;color:#64748b;margin-right:2px">Tag:</span>'+tagOpts+'</div>'
        +'<div style="font-size:11px;color:#64748b;margin:-2px 0 4px">Tap a name or type @ — they get it in their 💬 Messages. No @: the job\\'s PM is told.</div>'   /* patch JOBMENTION */"""))

# 6. send: the mentions come from the text
R.append(("""      var thr=ov.querySelector('#_jmThread'); if(thr) thr.scrollTop=thr.scrollHeight;
      ov.querySelector('#_jmSend').onclick=function(){
        var t=ov.querySelector('#_jmText').value.trim(); if(!t) return;
        var tags=[]; ov.querySelectorAll('._jmTag:checked').forEach(function(cb){ tags.push(cb.value); });
        addMsg(pid, t, tags);
        markSeen(pid);
        render();
      };""",
"""      var thr=ov.querySelector('#_jmThread'); if(thr) thr.scrollTop=thr.scrollHeight;
      try{ if(window._gcJM) window._gcJM.wire(ov, pid); }catch(e){ try{ console.warn('[GC] job mentions', e); }catch(_e){} }   /* patch JOBMENTION */
      ov.querySelector('#_jmSend').onclick=function(){
        var t=ov.querySelector('#_jmText').value.trim(); if(!t) return;
        var tags=[]; try{ if(window._gcJM) tags=window._gcJM.tagsFor(t); }catch(e){}   /* patch JOBMENTION: "@Name" in the text */
        var nm=addMsg(pid, t, tags);
        try{ if(window._gcJM) window._gcJM.sent(nm, ov); }catch(e){ try{ console.warn('[GC] job mentions', e); }catch(_e){} }   /* patch JOBMENTION: the mention To-Dos, the box emptied, who was told */
        markSeen(pid);
        render();
      };"""))

# 7. the phone's job list ("Messages & texts") and the desk 💬 Messages tab: 🔔 For you
R.append(("""+'<div id="_jpList">'+(rows||""", """+'<div id="_jpForYou">'+(window._gcJobMsgForYouHtml?window._gcJobMsgForYouHtml():'')+'</div>'   /* patch JOBMENTION */
      +'<div id="_jpList">'+(rows||"""))
R.append(("""  if (W._gcMsgUnsortedHtml && !q) html = W._gcMsgUnsortedHtml() + html;""",
"""  if (W._gcMsgUnsortedHtml && !q) html = W._gcMsgUnsortedHtml() + html;
  if (W._gcJobMsgForYouHtml && !q) html = W._gcJobMsgForYouHtml() + html;   /* patch JOBMENTION: 🔔 For you */"""))

# 8. the top bar 💬: my count
R.append(("""  num:function(){ return badgeOf('#_gcJobMsgFabBadge', $('_gcJobMsgFab')); },""",
"""  num:function(){ var n=0; try{ n=window._gcJobMsgForMeCount?window._gcJobMsgForMeCount():0; }catch(e){} return n||badgeOf('#_gcJobMsgFabBadge', $('_gcJobMsgFab')); },   /* patch JOBMENTION */"""))

for old, new in R:
    assert t.count(old) == 1, ('JOBMENTION anchor', t.count(old), old[:100])
for old, new in R:
    t = t.replace(old, new)

JS = open(__file__.replace('patch_JOBMENTION.py', 'jobmention_tail.js'), encoding='utf-8').read()
assert t.rstrip().endswith('</script>'), 'JOBMENTION: the page does not end with a script'
t = t.rstrip('\n') + '\n' + JS.rstrip('\n') + '\n'
open(p, 'w', encoding='utf-8').write(t)
print('JOBMENTION: patched', p)
