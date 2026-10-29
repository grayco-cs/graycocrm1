#!/usr/bin/env python3
"""Idempotent patch APOFFICE3 (rc-r13): the To-Do shows approvals as ONE line ("N approvals waiting → Open Approvals",
patch TODONOAPPR), so patch APOFFICE2's "👷 PM approvals" link for the office (made for the old To-Do pin) never showed.
Now, for the office, a second line sits right under it: "👷 PM approvals (N) — waiting on PMs, optional for you ›",
opening 📋 Approvals on the 👷 button. N is not part of her approvals count. Needs APOFFICE2 and TODONOAPPR.
Usage: python3 tools/patch_APOFFICE3.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch APOFFICE3'
if MARK in src:
    print('APOFFICE3: already patched'); sys.exit(0)
assert '/* patch APOFFICE2' in src, 'APOFFICE3 needs patch APOFFICE2 first'
OLD = """  return { n: n, h: '<button type="button" class="apx-pin-1" data-apx-go="1">' + (n ? '✅ ' + n + ' approval' + (n === 1 ? '' : 's') + ' waiting → <u>Open Approvals</u>' : '✅ No approvals waiting · <u>Approvals tab</u>') + '</button>' };
}"""
NEW = """  var po = 0; try { var B = build(); if (B.scope.kind === 'office') po = pmOptN(B.rows); } catch (e) { warn(e); }   """ + MARK + """: the office's optional PM approvals, under the line */
  return { n: n, h: '<button type="button" class="apx-pin-1" data-apx-go="1">' + (n ? '✅ ' + n + ' approval' + (n === 1 ? '' : 's') + ' waiting → <u>Open Approvals</u>' : '✅ No approvals waiting · <u>Approvals tab</u>') + '</button>'
    + (po ? '<button type="button" class="apx-pin-1 apx-pin-po" data-apx-pmopt="1" style="display:block;margin-top:4px;font-size:13px;opacity:.9">👷 PM approvals (' + po + ') — waiting on PMs, optional for you ›</button>' : '') };
}"""
assert src.count(OLD) == 1, ('APOFFICE3 find-string count', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('APOFFICE3: patched', path)
