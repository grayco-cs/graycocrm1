"""Idempotent patch DUPJOB4 (on top of DUPJOB3): saving a job never changes its PM unless the person changed the PM field.

  Review 11/02: with DUPJOB's PM lists, a job whose stored PM is not in the eligible list opened as "Unassigned" in the
  job form, and saving the job would have cleared the PM — a real PM whose role text is not recognised would silently lose
  every job the next time anyone saved one. Now:
    • the job form's PM select (and the 🧾 Missing job data "Fix" PM select) always holds the stored PM: a name that is
      not an eligible PM is shown selected as "⚠ <name> (not a PM)" and is kept until someone picks another;
    • Launch Job / New Project: the PM select shows what will really be saved (blank "— no PM yet (an owner assigns) —"
      unless a PM is picked), never a name that would then not be saved;
    • the only automatic move of a non-PM out of pm stays on jobs NEWLY created by code (the job stamp, DUPJOB).
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_DUPJOB4.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_DUPJOB4__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_DUPJOB3__' in src, 'run tools/patch_DUPJOB3.py first'


def once(old, new, label, count=1):
    global src
    n = src.count(old)
    assert n == count, ('anchor count != %d' % count, label, n)
    src = src.replace(old, new)


# the job form: the stored PM is always an option (kept on save)
once('children:[e.jsx("option",{value:"",children:"Unassigned"}),(window._pmList?window._pmList(An):An.filter(j=>j.active)).map(j=>e.jsx("option",{value:j.name,children:j.name},j.id))]})}),e.jsx(re,{l:"Address",s:2,',
     'children:[e.jsx("option",{value:"",children:"Unassigned"}),(window._pmList?window._pmList(An):An.filter(j=>j.active)).map(j=>e.jsx("option",{value:j.name,children:j.name},j.id)),/* __GC_PATCH_DUPJOB4__: the stored PM stays */(y.pm&&!(window._pmList?window._pmList(An):An.filter(j=>j.active)).some(j=>j&&j.name===y.pm)?e.jsx("option",{value:y.pm,children:"\\u26a0 "+((window._gcCleanPerson?window._gcCleanPerson(y.pm):y.pm)||y.pm)+" (not a PM)"},"_kept"):null)]})}),e.jsx(re,{l:"Address",s:2,',
     'job form pm')

# Launch Job / New Project: what is shown is what is saved
once('value:Le.pm||n.name,onChange:y=>dn({...Le,pm:y.target.value}),children:(window._pmList?window._pmList(An):An.filter(y=>y.active)).map(y=>e.jsx("option",{value:y.name,children:y.name},y.id))})',
     'value:Le.pm||(window._gcAutoPmFor?window._gcAutoPmFor(n.name):n.name),onChange:y=>dn({...Le,pm:y.target.value}),children:[e.jsx("option",{value:"",children:"— no PM yet (an owner assigns) —"},"_none")].concat((window._pmList?window._pmList(An):An.filter(y=>y.active)).map(y=>e.jsx("option",{value:y.name,children:y.name},y.id)))})',
     'launch pm select')

# 🧾 Missing job data "Fix": the stored PM stays selectable
once("""    case 'pm': return '<select class="gc-df-in" data-k="' + (lead ? 'pm' : 'pm') + '"><option value="">— choose —</option>' + pmNames().map(function(n){ return opt(n, p.pm); }).join('') + '</select>';""",
     """    case 'pm': return '<select class="gc-df-in" data-k="' + (lead ? 'pm' : 'pm') + '"><option value="">— choose —</option>' + pmNames().map(function(n){ return opt(n, p.pm); }).join('') + (s(p.pm) && pmNames().indexOf(s(p.pm)) < 0 ? opt(s(p.pm), p.pm, '\\u26a0 ' + s(p.pm) + ' (not a PM)') : '') + '</select>';   /* DUPJOB4: the stored PM stays */""",
     'datafull fix pm')

open(path, 'w', encoding='utf-8').write(src)
print('patched DUPJOB4')
