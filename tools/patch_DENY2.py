#!/usr/bin/env python3
"""Idempotent patch DENY2: ✕ Deny never fails as a whole because sending the To-Do list to the cloud hiccupped.

Release check (rc-live): now and then "Could not save that — try again." and nothing was sent back — the To-Do list was
saved on the computer but the cloud push (window._gcOfficeTasksPush) threw, and the whole deny was dropped. Now the
To-Do is saved on this computer first (its own try), the cloud push is separate (a failure there is retried by the
save queue and never undoes the deny), and a failure to save locally says why. Usage: python3 tools/patch_DENY2.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch DENY2'
if MARK in src:
    print('DENY2: already patched'); sys.exit(0)
OLD1 = """    localStorage.setItem('gc_office_tasks', JSON.stringify(ot));
    if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (typeof W._supaUpsert === 'function') W._supaUpsert('gc_office_tasks', ot);
  } catch (e) { warn(e); toast('Could not save that — try again.'); return; }"""
NEW1 = """    localStorage.setItem('gc_office_tasks', JSON.stringify(ot));
  } catch (e) { warn(e); toast('Could not save that on this computer (' + s(e && e.message).slice(0, 80) + ') — try again.'); return; }
  """ + MARK + """: the cloud push is separate — a hiccup there never drops the deny (the save queue sends it) */
  try { if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (typeof W._supaUpsert === 'function') W._supaUpsert('gc_office_tasks', JSON.parse(localStorage.getItem('gc_office_tasks') || '[]')); } catch (e) { warn(e); try { if (W._gcSyncQ && W._gcSyncQ.add) W._gcSyncQ.add('gc_office_tasks', JSON.parse(localStorage.getItem('gc_office_tasks') || '[]')); } catch (e2) {} }"""
assert src.count(OLD1) == 1, ('DENY2 find-string count != 1', src.count(OLD1))
src = src.replace(OLD1, NEW1)
open(path, 'w', encoding='utf-8').write(src)
print('DENY2: patched', path)
