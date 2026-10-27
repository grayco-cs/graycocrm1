# set TrimBox/BleedBox on *-printshop.pdf (bleed = 9pt each side); report every PDF
import sys, glob, os
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.pdf'))):
    r = PdfReader(f)
    if f.endswith('-printshop.pdf'):
        w = PdfWriter(clone_from=r)
        for p in w.pages:
            W, H = float(p.mediabox.width), float(p.mediabox.height)
            p.trimbox = RectangleObject([9, 9, W - 9, H - 9]); p.bleedbox = RectangleObject([0, 0, W, H])
        w.write(f); r = PdfReader(f)
    sz = [(round(float(p.mediabox.width) / 72, 3), round(float(p.mediabox.height) / 72, 3)) for p in r.pages]
    tb = [(round(float(p.trimbox.width) / 72, 3), round(float(p.trimbox.height) / 72, 3)) for p in r.pages]
    print(os.path.basename(f), 'pages=%d' % len(sz), 'size=%sx%s in' % sz[0], 'same=%s' % (len(set(sz)) == 1),
          'orient=%s' % ('landscape' if sz[0][0] > sz[0][1] else 'portrait'), 'trim=%sx%s' % tb[0], 'rot=%s' % [p.get('/Rotate', 0) for p in r.pages], '%dKB' % (os.path.getsize(f) // 1024))
