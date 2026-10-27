"""Build all GrayCo print-pack HTML: python3 -I tools/printpack/build.py <outdir>
Then render the PDFs (OFFICE + PRINTSHOP) and set the PDF trim/bleed boxes:
  PLAYWRIGHT_MJS=/path/to/node_modules/playwright/index.mjs node tools/printpack/pp.mjs <outdir> <outdir>/pdf
  python3 tools/printpack/boxes.py <outdir>/pdf      (then copy the PDFs to /print/ and run tools/patch_PRINTPACK.py)
Facts (address, phone, licenses, review link) live in brand.py."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brochures
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'out'))
os.makedirs(OUT, exist_ok=True)
files = []
def w(name, html):
    p = os.path.join(OUT, name + '.html')
    open(p, 'w', encoding='utf-8').write(html); files.append(p)
for k in brochures.ALL:
    w(k['slug'], brochures.brochure(k))
try:
    import forms
    for name, html in forms.ALL():
        w(name, html)
except ImportError as e:
    print('forms not built:', e)
import web, general
for name, html in general.ALL():
    w(name, html)
w('web-09-general', general.web_general())
for name, html in web.ALL():
    w(name, html)
print('\n'.join(files))
