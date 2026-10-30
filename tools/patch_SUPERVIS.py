#!/usr/bin/env python3
"""Idempotent patch SUPERVIS: a superintendent sees the jobs they run.

  Owner 10/30: "supers see their own jobs". The CRM's per-role rule (window._gcProjVisible / _gcProjMine, patch HOT2)
  gave a superintendent only the jobs where they are the PM. Now a Superintendent (the effective role: Admin → Employees,
  the staff profile, or an admin's "View as Superintendent") also sees every job where they are the job team's
  superintendent (Team roles & Senior PM → job team; job.superintendent, or the older superName / super fields),
  matched like a PM (window._gcSamePM: name or e-mail ignoring case, aka names). Nobody else is widened.
  The Projects table, its counts, the year bar / Find any job (patch PROJLEAK) and GrayCo Photos (patch PHOTOSPM) all
  read _gcProjVisible, so they follow.
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_SUPERVIS.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_SUPERVIS__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

once("W._gcProjVisible = function(j, me){ if (!isEst()) return samePM(j, me); return mode() === 'all' || estimatedBy(j, me); };\n"
     "W._gcProjMine = function(j, me){ return isEst() ? estimatedBy(j, me) : samePM(j, me); };",
     "/* __GC_PATCH_SUPERVIS__ — patch SUPERVIS: a Superintendent also sees the jobs where they are the job team's superintendent */\n"
     "function isSuperRole(){ try { return !!(W._gcRP && typeof W._gcRP.role === 'function' && W._gcRP.role() === 'Superintendent'); } catch (e) { return false; } }\n"
     "function sameSuper(j, me){\n"
     "  if (!j || !me) return false;\n"
     "  var names = [j.superintendent, j.superName, j.super].filter(function(x){ return x && typeof x !== 'object'; });\n"
     "  for (var i = 0; i < names.length; i++) { try { if (W._gcSamePM ? W._gcSamePM(names[i], me, null) : low(names[i]) === low(me.name)) return true; } catch (e) {} }\n"
     "  return false;\n"
     "}\n"
     "function ownJob(j, me){ return samePM(j, me) || (isSuperRole() && sameSuper(j, me)); }\n"
     "W._gcProjVisible = function(j, me){ if (!isEst()) return ownJob(j, me); return mode() === 'all' || estimatedBy(j, me); };\n"
     "W._gcProjMine = function(j, me){ return isEst() ? estimatedBy(j, me) : ownJob(j, me); };", 'rule')
assert src.count(MARK) == 1, src.count(MARK)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
