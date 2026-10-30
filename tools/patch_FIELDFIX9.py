#!/usr/bin/env python3
"""Idempotent patch FIELDFIX9: the Site Book's job name is readable in GrayCo Field.

Found by the field-view audit (10/30, phone): opening a job's Site Book / daily log from the field app showed the job
name as dark navy text on the field app's dark navy page (nearly invisible). In field mode it is now light. And the
daily log's Manpower row (company · headcount · hours) ran off the right edge of a 390 px phone: the hours box could
not be reached. The three boxes now shrink to fit their columns. CSS only; the desk look is unchanged.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX9 */'
if MARK in src:
    print('already patched'); sys.exit(0)
OLD = "#gc-rp-sb h2{margin:0;font-size:20px}"
NEW = "#gc-rp-sb h2{margin:0;font-size:20px}" + MARK + "html._fieldmode #gc-rp-sb .sb-hd h2{color:#f8fafc}#gc-rp-sb .sb-mprow>input{min-width:0;width:100%;box-sizing:border-box}"
assert src.count(OLD) == 1, src.count(OLD)
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX9')
