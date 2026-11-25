# WIDEDESK (owner 11/25, the Projects list on a big monitor: "is there a reason it can't be full desktop page … I think it's too jammed
# together"): every CRM screen sat in one 1100 px column (.gc-main-in, inline maxWidth:1100). On a wide screen (1300 px and up) it now uses
# the width (up to 1800 px); laptops, tablets and phones are unchanged.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'WIDEDESK' not in s
a = '<script>\n/* ============================================================================\n   GrayCo — WHERE THE REVENUE NUMBER COMES FROM.'
assert s.count(a) == 1
s = s.replace(a, '<style id="gc-widedesk">/* patch WIDEDESK */@media (min-width:1300px){.gc-main-in{max-width:min(1800px,100%)!important}}</style>\n' + a)
open(p, 'w', encoding='utf-8').write(s); print('WIDEDESK applied')
