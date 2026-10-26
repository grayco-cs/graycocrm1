#!/usr/bin/env python3
"""Idempotent patch HEALTHAUTH: the CRM health card sends the sign-in token and shows the server's own error."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = "function chAuth(){"
if MARK in src:
    print('already patched'); sys.exit(0)
def sub(old, new, label):
    global src
    assert src.count(old) == 1, (label, 'count', src.count(old))
    src = src.replace(old, new)
# 7. CRM health card: the fetches carry the sign-in token, and say what the server said
sub("""    W.fetch('/.netlify/functions/crm-health', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){
      if (!j || !j.ok) { el.textContent = (j && j.error) || 'Could not check.'; return; }""",
"""    W.fetch('/.netlify/functions/crm-health', { cache: 'no-store', headers: chAuth() }).then(function(r){ return r.text().then(function(t){ var j = null; try { j = JSON.parse(t); } catch (e) {} if (!r.ok && !(j && j.error)) j = { ok: false, error: 'The server answered ' + r.status + (t ? ': ' + t.slice(0, 160) : '.') }; return j; }); }).then(function(j){   /* patch SPEED2 */
      if (!j || !j.ok) { el.textContent = (j && j.error) || 'Could not check.'; return; }""", 'ch1')
sub("""  function load(){
    var el = box.querySelector('[data-h]'); el.textContent = 'Checking…';""",
"""  function chAuth(){ var h = {}; try { var s = JSON.parse(W.localStorage.getItem('gc_auth_v1') || 'null'); if (s && s.access_token) h.Authorization = 'Bearer ' + s.access_token; } catch (e) {} return h; }   /* patch SPEED2 */
  function load(){
    var el = box.querySelector('[data-h]'); el.textContent = 'Checking…';""", 'ch2')
sub("""W.fetch('/.netlify/functions/crm-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'send' }) }).then(function(r){ return r.json(); }).then(""",
"""W.fetch('/.netlify/functions/crm-health', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, chAuth()), body: JSON.stringify({ act: 'send' }) }).then(function(r){ return r.text().then(function(t){ var j = null; try { j = JSON.parse(t); } catch (e) {} if (!r.ok && !(j && j.error)) j = { ok: false, error: 'The server answered ' + r.status + (t ? ': ' + t.slice(0, 160) : '.') }; return j; }); }).then(""", 'ch3')

open(path, 'w', encoding='utf-8').write(src)
print('patched')
