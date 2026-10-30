#!/usr/bin/env python3
"""Idempotent patch FIELDFIX3: a job message sent with no signal still reaches the office after the phone reloads.

Found by the field-view audit (10/30): a crew member sends a job message (💬 on the job card) with no signal; the
phone drops the page (iOS) before the signal is back. The message stayed on the phone forever: Job Messages pushes
only right after Send (and does not look at the answer), and its 45-second pull only brings other people's messages
DOWN. The office never saw it, while the phone showed it as sent.

Fix: when the existing pull reads the cloud's list and this person's own messages are missing from it, it sends the
union back (merged by id, the same safe push Send uses). No new timers: it rides the pull that already runs.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX3 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

OLD = """        .then(function(r){ return r.json(); })
        .then(function(rows){
          if(Array.isArray(rows)&&rows.length&&rows[0].value){
            var remote=[]; try{ remote=JSON.parse(rows[0].value); }catch(e){}
            // merge by id (union) so no message is lost
            var local=getMsgs(); var byId={};
            local.concat(remote).forEach(function(m){ if(m&&m.id) byId[m.id]=m; });
            var merged=Object.keys(byId).map(function(k){ return byId[k]; }).sort(function(a,b){ return (a.at||'').localeCompare(b.at||''); });
            setMsgs(merged);
          }
          if(cb)cb();
        }).catch(function(){ if(cb)cb(); });"""
NEW = """        .then(function(r){ if(!r.ok) throw new Error('read '+r.status); return r.json(); })
        .then(function(rows){
          var _unsent=false;   """ + MARK + """
          if(Array.isArray(rows)&&rows.length&&rows[0].value){
            var remote=[]; try{ remote=typeof rows[0].value==='string'?JSON.parse(rows[0].value):(Array.isArray(rows[0].value)?rows[0].value:[]); }catch(e){}
            // merge by id (union) so no message is lost
            var local=getMsgs(); var byId={};
            local.concat(remote).forEach(function(m){ if(m&&m.id) byId[m.id]=m; });
            var merged=Object.keys(byId).map(function(k){ return byId[k]; }).sort(function(a,b){ return (a.at||'').localeCompare(b.at||''); });
            setMsgs(merged);
            /* FIELDFIX3: my own messages the cloud does not have (sent with no signal, page reloaded since) go up now */
            try{ var _rid={}; remote.forEach(function(m){ if(m&&m.id) _rid[m.id]=1; }); var _me=myId(); _unsent=local.some(function(m){ return m&&m.id&&!_rid[m.id]&&m.authorId===_me; }); }catch(e){}
          } else if(Array.isArray(rows)&&!rows.length){
            try{ var _me2=myId(); _unsent=getMsgs().some(function(m){ return m&&m.id&&m.authorId===_me2; }); }catch(e){}
          }
          if(_unsent && !(cb && cb.__pushes)) pushMsgs();
          if(cb)cb();
        }).catch(function(){ if(cb)cb(); });"""
src = once(src, OLD, NEW)

OLD2 = """    pullMsgs(function(){
      var merged=getMsgs();
      if(!merged.some(function(m){return m&&m.id===newMsg.id;})) merged.push(newMsg);
      setMsgs(merged); pushMsgs();
    });"""
NEW2 = """    var _afterPull=function(){
      var merged=getMsgs();
      if(!merged.some(function(m){return m&&m.id===newMsg.id;})) merged.push(newMsg);
      setMsgs(merged); pushMsgs();
    }; _afterPull.__pushes=true;   /* FIELDFIX3: this pull is followed by its own push */
    pullMsgs(_afterPull);"""
src = once(src, OLD2, NEW2)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX3')
