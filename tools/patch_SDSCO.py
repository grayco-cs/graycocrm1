#!/usr/bin/env python3
"""Idempotent patch SDSCO (owner 11/19, on "🧪 Materials & SDS · Construction": "this stuff is for mit and env").
🧪 Materials & SDS (menu entry, page, the job page's 🧪 Materials card / button, the dilution calculator in the page header, and the
customer's materials sign-off sent to the portal) belongs to GrayCo Mitigation and GrayCo Environmental only.
  1. tools/sdsco_block.html becomes a script right after patch SDS: window._gcSdsCo — a job is Mitigation / Environmental by the CRM's
     own company rule (window._gcCo.ofJob = project.companyId, + project.sharedWith, as window._gcCo.passJob does).
  2. patch RP's menu: no 🧪 Materials & SDS while Construction is the picked company (admins too).
  3. patch SDS: window._gcSdsCanSee is false on Construction; the page on Construction says it is Mitigation & Environmental's
     (🏢 Show All companies); on All companies the title says "· Mitigation & Environmental" and the job picker lists only
     Mitigation / Environmental jobs; the job page's card, the 🧪 Materials window and ✍️ Send for signature are for Mitigation /
     Environmental jobs (a job that already has picks / a consent keeps them and still shows them outside the Construction pick).
Nothing stored is changed (job.materials, job.materialsConsent, gc_sds_materials, sign requests stay as they are).
Usage: python3 tools/patch_SDSCO.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html')
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_SDSCO__' in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_SDS__' in src, 'patch SDS must be applied first'


def once(s, old, new, label=''):
    assert s.count(old) == 1, ('anchor count != 1', label or old[:90], s.count(old))
    return s.replace(old, new)


BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sdsco_block.html'), encoding='utf-8').read().rstrip('\n')

# 1. the block, right after patch SDS's script
a = src.index('<script id="gc-patch-sds">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]

# 2. patch RP's menu: Construction picked → no 🧪 Materials & SDS
src = once(src, "    var sOk = !!(W._gcSdsCanSee && W._gcSdsCanSee()) || arr(r).some(function(g){ return g && (g.id === 'mitigation' || g.id === 'enviro'); });",
           "    var sOk = (function(){ try { return !W._gcCo || W._gcCo.filter() !== 'construction'; } catch (e2) { return true; } })()   /* patch SDSCO: Mitigation & Environmental's — never on Construction */\n"
           "      && (!!(W._gcSdsCanSee && W._gcSdsCanSee()) || arr(r).some(function(g){ return g && (g.id === 'mitigation' || g.id === 'enviro'); }));", 'rp menu')

# 3. patch SDS
src = once(src, "W._gcSdsCanSee = function(){ if (admin()) return true;",
           "W._gcSdsCanSee = function(){ if (W._gcSdsCo && !W._gcSdsCo.ctxOk()) return false;   /* patch SDSCO: not on Construction (admins too) */\n  if (admin()) return true;", 'canSee')
src = once(src, "  if (!canSee()) { el.innerHTML = '<div class=\"gcsds\"><h2>🧪 Materials &amp; SDS</h2><p class=\"sub\">For admins, the Mitigation and Environmental teams.</p></div>'; return; }\n",
           "  if (!canSee()) { el.innerHTML = '<div class=\"gcsds\"><h2>🧪 Materials &amp; SDS</h2><p class=\"sub\">For admins, the Mitigation and Environmental teams.</p></div>'; return; }\n"
           "  if (W._gcSdsCo && !W._gcSdsCo.ctxOk()) { el.innerHTML = W._gcSdsCo.offHtml(); return; }   /* patch SDSCO: Construction picked */\n", 'draw off')
src = once(src, ".filter(function(p){ return !/complete|closed|cancel|lost/i.test(s(p.status)); }).slice(0, 400);",
           ".filter(function(p){ return !/complete|closed|cancel|lost/i.test(s(p.status)); }).filter(function(p){ return !W._gcSdsCo || W._gcSdsCo.isJob(p); }).slice(0, 400);   /* patch SDSCO: Mitigation / Environmental jobs only */", 'picker')
src = once(src, "  var coName = co === 'all' ? '' : (function(){ try { return W._gcCo.get(co).short; } catch (e) { return ''; } })();",
           "  var coName = W._gcSdsCo ? W._gcSdsCo.title(co) : co === 'all' ? '' : (function(){ try { return W._gcCo.get(co).short; } catch (e) { return ''; } })();   /* patch SDSCO: All companies → \"· Mitigation & Environmental\" */", 'title')
src = once(src, "function relevant(p){ if (mats(p).length) return true;",
           "function relevant(p){ if (W._gcSdsCo) return W._gcSdsCo.jobOk(p);   /* patch SDSCO: Mitigation / Environmental jobs (+ a job's own earlier picks, outside the Construction pick) */\n  if (mats(p).length) return true;", 'relevant')
src = once(src, "  var p = job(pid); if (!p) { toast('That job was not found.', true); return; }\n  PICK.pid = s(pid); wireDocLib();",
           "  var p = job(pid); if (!p) { toast('That job was not found.', true); return; }\n"
           "  if (W._gcSdsCo && !W._gcSdsCo.jobOk(p)) { toast('🧪 Materials & SDS is for Mitigation and Environmental jobs — this is a Construction job.', true); return; }   /* patch SDSCO */\n"
           "  PICK.pid = s(pid); wireDocLib();", 'jobModal')
src = once(src, "  var p = job(pid); if (!p) return Promise.resolve({ ok: false, error: 'Open a job first.' });",
           "  var p = job(pid); if (!p) return Promise.resolve({ ok: false, error: 'Open a job first.' });\n"
           "  if (W._gcSdsCo && !W._gcSdsCo.jobOk(p)) { toast('🧪 The materials consent is for Mitigation and Environmental jobs.', true); return Promise.resolve({ ok: false, error: 'Not a Mitigation / Environmental job.' }); }   /* patch SDSCO */", 'send')
src = once(src, "  if (a === 'add') { editForm(''); return; }",
           "  if (a === 'coall' || a === 'co') { try { W._gcCo.setFilter(a === 'coall' ? 'all' : t.getAttribute('data-sds-co')); } catch (e2) {} ST.call(W, draw, 60); return; }   /* patch SDSCO */\n"
           "  if (a === 'add') { editForm(''); return; }", 'click')
open(path, 'w', encoding='utf-8').write(src)
print('patched')
