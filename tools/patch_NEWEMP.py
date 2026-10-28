#!/usr/bin/env python3
"""Idempotent patch NEWEMP: Admin → Employees → "+ Add Employee" says "New Employee", not "Edit Employee: undefined"
(release sweep 10/28 on the live line; the heading part of patch SPEED4C on the r13 line — not its click guards).
Usage: python3 tools/patch_NEWEMP.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
OLD = 'children:["✏️ ",W?"Edit":"Add"," Employee",W?`: ${W.name}`:""]'
NEW = 'children:["✏️ ",(W&&W.id&&W.id!=="NEW")?"Edit":"New"," Employee",(W&&W.id&&W.id!=="NEW"&&W.name)?`: ${W.name}`:""]'
if NEW in src:
    print('NEWEMP: already patched'); sys.exit(0)
assert src.count(OLD) == 1, ('NEWEMP find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('NEWEMP: patched', path)
