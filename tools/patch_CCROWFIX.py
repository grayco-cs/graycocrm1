#!/usr/bin/env python3
"""patch CCROWFIX (owner 11/8 screenshot: "📸 Open in GrayCo Photos · CompanyCam · Every photo of this job" under
"Company Dashboard" right after sign-in, then it went away). The job-photos row went under the first <h1> whenever a job
was remembered as open — even on the Dashboard. It now shows only on a real job page (the "← All Projects" button is
there) and is removed anywhere else."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*CCROWFIX*/' in src: print('already patched'); sys.exit(0)
o = "      // sit it just under the job title\n      var h1=document.querySelector('h1');\n      if(!h1) return;"
assert src.count(o) == 1
n = ("      /*CCROWFIX*/ var _onJob=[].some.call(document.querySelectorAll('main button'), function(b){ return /^\\s*←\\s*All Projects\\s*$/.test(b.textContent||''); });\n"
     "      if(!_onJob){ var _o=document.getElementById('_gcCCLinkRow'); if(_o) _o.remove(); return; }\n" + o)
src = src.replace(o, n)
# also: the early "already there" return must not keep a row that sits on another page
o2 = "      if(existing && existing.getAttribute('data-pid')===proj.id && existing.getAttribute('data-cc')===(url?'1':'0')) return;"
assert src.count(o2) == 1
src = src.replace(o2, "      if(existing && existing.getAttribute('data-pid')===proj.id && existing.getAttribute('data-cc')===(url?'1':'0') && [].some.call(document.querySelectorAll('main button'), function(b){ return /^\\s*←\\s*All Projects\\s*$/.test(b.textContent||''); })) return;")
open(P, 'w', encoding='utf-8').write(src); print('patched')
