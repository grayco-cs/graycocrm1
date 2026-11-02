#!/usr/bin/env python3
"""patch PORTALAPP — the CRM side of the customer portal app: the job's portal card gets
"Sign out all devices" (every phone / installed GrayCo app signed in to this customer's portal must sign in again;
the link itself keeps working). Server: portal.js action 'devices'. Idempotent: run it again and nothing changes."""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'index.html')
t = open(path, encoding='utf-8').read()
MARK = 'patch PORTALAPP'
if MARK in t:
    print('PORTALAPP: already applied'); sys.exit(0)
A = """    '<div style="color:#55626F;font-size:12px">Turning it off stops the old link at once. A new link replaces it (send the new one).</div>' +\n"""
A2 = A + """    (url ? '<button type="button" data-q="devsout" style="' + BTN + '">Sign out all devices</button><div style="color:#55626F;font-size:12px">Signs the customer out on every phone, computer and installed GrayCo app (they sign in again; the link keeps working).</div>' : '') +   /* patch PORTALAPP */\n"""
B = """    if (q === 'make') { ensureLink(pid, 'by hand'); return; }\n"""
B2 = B + """    if (q === 'devsout') {   /* patch PORTALAPP: end every customer session of this job (browsers + installed apps) */
      var sure2 = true; try { sure2 = confirm('Sign this customer out on every device, including the GrayCo app on their phone? They will need to sign in again (their link keeps working).'); } catch (e) {}
      if (!sure2) return;
      api({ action: 'devices', projectId: String(pid) }).then(function(r){ toast(r.ok ? 'Signed out on ' + ((r.data && r.data.signedOut) || 0) + ' device(s).' : 'Could not do that: ' + ((r.data && r.data.error) || r.status), r.ok ? null : '#991b1b'); });
      return;
    }
"""
for old, new in ((A, A2), (B, B2)):
    if t.count(old) != 1:
        print('PORTALAPP: anchor not found exactly once:', old[:70]); sys.exit(1)
    t = t.replace(old, new)
open(path, 'w', encoding='utf-8').write(t)
print('PORTALAPP: applied')
