#!/usr/bin/env python3
"""Idempotent patch MARGIN12: a 1.20x margin everywhere the estimate offers 1.25x (owner) -- the Job default
margin buttons, the Override ALL lines buttons, each line's margin menu and the drywall / ceiling / flooring /
paint zone menus. A line set to 1.20x or 1.25x no longer also reads as "Custom". Usage: python3 tools/patch_MARGIN12.py [index.html]"""
import sys, re, base64
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
if "'1.25','1.2','1.2821'" in t:
    print('MARGIN12: already patched'); sys.exit(0)

# 1. the estimate screen's HTML (base64) -- job default + override buttons
A = "_estHTML=decodeURIComponent(escape(atob('"
assert t.count(A) == 1, ('MARGIN12 _estHTML', t.count(A))
i = t.index(A) + len(A); j = t.index("'", i)
h = base64.b64decode(t[i:j]).decode('utf-8')
for old, new in [('<button class="mb" onclick="setJM(1.25,this)">1.25×</button>', 'setJM(1.2,this)'),
                 ('<button class="mb" onclick="setOM(1.25,this)">1.25×</button>', 'setOM(1.2,this)')]:
    assert h.count(old) == 1, ('MARGIN12 button', h.count(old), old)
    ind = h[h.rindex('\n', 0, h.index(old)) + 1:h.index(old)]
    h = h.replace(old, old + '\n' + ind + '<button class="mb" onclick="' + new + '">1.20×</button>')
t = t[:i] + base64.b64encode(h.encode('utf-8')).decode('ascii') + t[j:]

# 2. template-literal menus: <option value="1.25" ${X==='1.25'?'selected':''}>1.25x</option>
rx = re.compile(r"""(\n?[ \t]*)<option value="1\.25" \$\{([\w.]+)==='1\.25'\?'selected':''\}>1\.25(x|×)</option>""")
n1 = len(rx.findall(t)); assert n1 == 4, ('MARGIN12 template options', n1)
t = rx.sub(lambda m: m.group(0) + m.group(1) + '<option value="1.2" ${' + m.group(2) + "==='1.2'?'selected':''}>1.20" + m.group(3) + '</option>', t)

# 3. paint zones build the menu by string concat
old = """      +'<option value="1.25" '+(z.mult==='1.25'?'selected':'')+'>1.25x</option>'\n"""
assert t.count(old) == 1, ('MARGIN12 paint', t.count(old))
t = t.replace(old, old + """      +'<option value="1.2" '+(z.mult==='1.2'?'selected':'')+'>1.20x</option>'\n""")

# 4. a line on 1.25 / 1.20 is not "Custom"
old = "'1.3','1.2821','1.0'].indexOf(String(l.mult))<0"
n = t.count(old); assert n == 3, ('MARGIN12 custom list', n)
t = t.replace(old, "'1.3','1.25','1.2','1.2821','1.0'].indexOf(String(l.mult))<0")

open(p, 'w', encoding='utf-8').write(t)
print('MARGIN12: patched', p)
