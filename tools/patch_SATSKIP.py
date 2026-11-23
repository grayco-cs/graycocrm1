#!/usr/bin/env python3
"""patch SATSKIP — the Schedule "add" form, END DATE (MULTI-DAY) (owner 11/23: "want to be able to delete Saturdays if I
want to on here").

  python3 tools/patch_SATSKIP.py [index.html]

Under "16 work days (Mon-Sat) will be created" a ☐ Skip Saturdays (Mon–Fri only) box. Ticked: the count says
"13 work days (Mon-Fri) will be created", "# Work Days" and its 3 / 5 / 10 / 15 / 20-day buttons count Mon–Fri, the
duplicate check and the days created follow it (Sundays are never created, as before). The choice is remembered per person
on this computer (localStorage gc_sched_skipsat:<e-mail>) — a convenience; the box can be changed every time. Each created
day stays its own schedule entry (removable one by one, as today). Every anchor must occur exactly once.
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
MARK = '/* patch SATSKIP */'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_SATSKIP__' in src:
    print('already patched'); sys.exit(0)
assert 'SATSKIP' not in src, 'the mark is already used'

def once(a, b):
    global src
    n = src.count(a)
    assert n == 1, ('anchor count', n, a[:90])
    src = src.replace(a, b)

def OK(d, form):
    return '(window._gcSatSkip?window._gcSatSkip.ok(' + d + ',' + form + '):' + d + '.getDay()!==0)'
SPAN = '(window._gcSatSkip?window._gcSatSkip.span(y):"Mon-Sat")'

BOX = (',y.endDateSch&&y.endDateSch>=y.date&&' + MARK + 'e.jsxs("label",{"data-gc-satskip-row":"1",style:{display:"flex",alignItems:"center",gap:8,marginTop:6,fontSize:13,fontWeight:600,color:u.tx,cursor:"pointer",minHeight:32},children:['
       'e.jsx("input",{type:"checkbox","data-gc-satskip":"1",checked:window._gcSatSkip?window._gcSatSkip.skip(y):!1,style:{width:18,height:18,margin:0,cursor:"pointer"},'
       'onChange:function(_x){var _v=!!_x.target.checked;try{window._gcSatSkip&&window._gcSatSkip.save(_v)}catch(_e){}T(function(prev){return Object.assign({},prev,{_skipSat:_v})})}}),'
       '"Skip Saturdays (Mon\\u2013Fri only)"]})')
# the count under END DATE + the box
once('if(_d.getDay()!==0)_c++}return _c+" work days (Mon-Sat) will be created"})()})]})',
     'if(' + OK('_d', 'y') + ')_c++}return _c+" work days ("+' + SPAN + '+") will be created"})()})' + BOX + ']})')
# "# Work Days" label, its number and its quick buttons
once('e.jsxs(re,{l:"# Work Days (Mon-Sat)",s:3,', 'e.jsxs(re,{l:"# Work Days ("+' + SPAN + '+")",s:3,')
once('F=0;for(var _d=new Date(_s);_d<=_e;_d.setDate(_d.getDate()+1)){if(_d.getDay()!==0)F++}return F>0?F:""',
     'F=0;for(var _d=new Date(_s);_d<=_e;_d.setDate(_d.getDate()+1)){if(' + OK('_d', 'y') + ')F++}return F>0?F:""')
once('var _wc=0;while(_wc<xe-1){X.setDate(X.getDate()+1);if(X.getDay()!==0)_wc++}',
     'var _wc=0;while(_wc<xe-1){X.setDate(X.getDate()+1);if(' + OK('X', 'prev') + ')_wc++}')
once('var _wc=0;while(_wc<dd-1){_d.setDate(_d.getDate()+1);if(_d.getDay()!==0)_wc++}',
     'var _wc=0;while(_wc<dd-1){_d.setDate(_d.getDate()+1);if(' + OK('_d', 'y') + ')_wc++}')
# the second summary (Every day / Start + End only)
once('if(_d.getDay()!==0)_c++}return _c+" work days (Mon-Sat) · "+y.date+" to "+y.endDateSch',
     'if(' + OK('_d', 'y') + ')_c++}return _c+" work days ("+' + SPAN + '+") · "+y.date+" to "+y.endDateSch')
once('children:"Creates an entry for every Mon-Sat between start and end"', 'children:"Creates an entry for every "+' + SPAN + '+" between start and end"')
# saving: the duplicate check, the days created, the message
once('while(_cc<=_s2){if(_cc.getDay()!==0)_chkDates.push(', 'while(_cc<=_s2){if(' + OK('_cc', 'y') + ')_chkDates.push(')
once('while(_cur<=_d2){if(_cur.getDay()!==0){_allDates.push(', 'while(_cur<=_d2){if(' + MARK + OK('_cur', 'y') + '){_allDates.push(')
once('se(_allDates.length+" work days added Mon-Sat ("', 'se(_allDates.length+" work days added "+' + SPAN + '+" ("')

JS = r'''<script id="gc-patch-satskip">
/* __GC_PATCH_SATSKIP__ — Schedule add form: ☐ Skip Saturdays for a multi-day entry (tools/patch_SATSKIP.py).
   window._gcSatSkip.ok(date, form) — a day that is created (never Sunday; not Saturday when skipped) · .skip(form) — the form's own
   choice, else this person's last choice · .span(form) "Mon-Fri" / "Mon-Sat" · .save(on) remembers it for this person. */
(function(W){
'use strict';
if (W.__GC_PATCH_SATSKIP__) return; W.__GC_PATCH_SATSKIP__ = true;
function key(){ var e = ''; try { e = String((W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()) || localStorage.getItem('grayco_user') || '').toLowerCase().trim(); } catch (x) {} return 'gc_sched_skipsat:' + (e || 'me'); }
function saved(){ try { return localStorage.getItem(key()) === '1'; } catch (e) { return false; } }
function skip(f){ return f && typeof f._skipSat === 'boolean' ? f._skipSat : saved(); }
W._gcSatSkip = {
  skip: skip,
  ok: function(d, f){ var g = d && d.getDay ? d.getDay() : -1; return g !== 0 && !(g === 6 && skip(f)); },
  span: function(f){ return skip(f) ? 'Mon-Fri' : 'Mon-Sat'; },
  save: function(on){ try { localStorage.setItem(key(), on ? '1' : '0'); } catch (e) {} }
};
})(window);
</script>
'''
a = '<script id="gc-patch-apprnosend">'
assert src.count(a) == 1
end = src.index('</script>', src.index(a)) + len('</script>')
assert src[end:end + 1] == '\n'
src = src[:end + 1] + JS + src[end + 1:]
assert src.count('<script id="gc-patch-satskip">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('SATSKIP applied')
