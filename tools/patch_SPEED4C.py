#!/usr/bin/env python3
"""Idempotent patch SPEED4C: faster clicks (applies to origin/main and to the dev branch on its own).
 1. the job-list layer no longer takes every database answer apart (JSON.parse of megabytes) only to check it is a list;
 2. the form-hold look (up to 400 box measurements = a forced layout of the whole page) ran every 300 ms while someone
    worked and 30 ms after every press: it now looks right after the next frame is painted;
 3. the phone-Back guard writes its history entry right after the press, not inside it;
 4. status-word click listeners never read a big clicked area's whole text;
 5. the dashboard to-do builder and the job cards' chips no longer re-read the 5 MB estimates copy / rebuild every
    card each pass;
 6. the no-duplicates money sweep skips a pass when invoices / expenses / register were not written since a clean one;
 7. Admin → Employees screens are kept between redraws (no rebuild of the open form); a new employee's form says "New Employee";
 8. _gcSlowClicks(): the slowest presses on this computer (click to next paint), for a look from the console.
Each find-string must occur exactly once."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch SPEED4C */'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new, label, count=1):
    global src
    assert src.count(old) == count, (label, 'count', src.count(old))
    src = src.replace(old, new)

# ── 1. the job-list layer: no full parse of every answer ────────────────────────────────────────────────────────
sub("""            var j; try{ j = JSON.parse(t); }catch(e){ S.failedReads++; throw busyErr('the cloud\\'s answer could not be read'); }""",
    """            /* patch SPEED4C */ /* patch SPEED4: a list answer ([ … ]) is not taken apart just to see that it is a list — only when the job
               list is in it (its record of what the cloud holds) or the answer is not a list */
            var t0s = t.trim(), isList = t0s.charAt(0) === '[' && t0s.charAt(t0s.length - 1) === ']';
            var ukq = isList ? ((/[?&]key=(?:eq|in|like)\\.([^&]+)/.exec(decodeURIComponent(url)) || [])[1] || '') : '';
            if(isList && !/projects/.test(ukq) && !(!ukq && /"key"\\s*:\\s*"projects/.test(t0s))) return res;
            var j; try{ j = JSON.parse(t); }catch(e){ S.failedReads++; throw busyErr('the cloud\\'s answer could not be read'); }""", 'pjx parse')

# ── 3. click latency ────────────────────────────────────────────────────────────────────────────────────────────────
# 3a. the form-hold look (measures every box on screen, up to 400 getBoundingClientRect) ran every 300 ms while
#     someone worked and 30 ms after every press — each one forcing a layout of the whole page in the middle of the
#     click's own work. It now looks right after the next frame is painted (layout fresh: the measuring is cheap and
#     never delays what the click changed on screen).
sub("""    try{ look(); }catch(e){}
    var busyNow = (Date.now() - lastActivity) < BURST;""",
"""    try{ lookInFrame(); }catch(e){}   /* patch SPEED4 */
    var busyNow = (Date.now() - lastActivity) < BURST;""", 'fh step')
sub("""  document.addEventListener(ev, function(){ setTimeout(look, 30); }, true);""",
"""  document.addEventListener(ev, function(){ setTimeout(lookInFrame, 30); }, true);   /* patch SPEED4 */""", 'fh press')
sub("""window._gcFormOpen = function(){ return !!window.__GC_FORM_OPEN__; };""",
"""/* patch SPEED4: looked at right AFTER the next frame is painted (one at a time): the page's layout is fresh then, so
   measuring the boxes costs next to nothing and never holds up what a click changed on screen */
var _fhRaf = 0, _fhWait = 0;
function lookInFrame(){
  if (_fhRaf || _fhWait) return;
  if (document.hidden || typeof requestAnimationFrame !== 'function') { look(); return; }
  _fhRaf = requestAnimationFrame(function(){ _fhRaf = 0; _fhWait = setTimeout(function(){ _fhWait = 0; look(); }, 0); });
  setTimeout(function(){ if (_fhRaf) { try { cancelAnimationFrame(_fhRaf); } catch (e) {} _fhRaf = 0; look(); } }, 1000);   /* frames held up: look anyway */
}
window._gcFormOpen = function(){ return !!window.__GC_FORM_OPEN__; };""", 'fh lookInFrame')

# 3b. the phone-Back guard wrote a history entry inside every press (pointerdown): now right after it
sub("""D.addEventListener('pointerdown', guard, true);""",
"""D.addEventListener('pointerdown', function(){ RT(guard, 0); }, true);   /* patch SPEED4: after the press, not inside it (still a user gesture) */""", 'nav guard')

# 3c. click listeners that look for a status word read the clicked element's whole text — a click on a page area read
#     the whole page's text (hundreds of ms on a big page, on every click). Only a small element's text is read now.
import re
_G = "if(t===document.documentElement||t===document.body||t.childElementCount>12||t.getElementsByTagName('*').length>40) return;   /* patch SPEED4: never read a page-sized text */"
_pat = re.compile(r"(\n(\s*)var t=e\.target; if\(!t(?:\|\|!t\.textContent)?\) return;\n)(?:\s*if\(t===document\.documentElement\|\|t===document\.body\|\|t\.childElementCount>12\) return;   /\* LEADSUX: never read a page-sized textContent \*/\n)?(\s*var (?:w=t\.textContent\.trim\(\)|txt=\(\(t\.textContent\|\|''\)\+''\)|txt=\(t\.textContent\|\|''\))\.toLowerCase\(\);)")
_n = [0]
def _rep(m):
    _n[0] += 1
    ind = m.group(2)
    body = m.group(3).replace("w=t.textContent.trim()", "w=(t.textContent||'').trim()")
    return "\n" + ind + "var t=e.target; if(!t) return;\n" + ind + _G + "\n" + body
src = _pat.sub(_rep, src)
assert _n[0] == 3, ('status listeners', _n[0])

# 3d. the dashboard to-do builder took apart the whole estimates copy (~5 MB) on every build: the expiring drafts
#     are kept while that copy is the same text
sub("""    var ests = JSON.parse(localStorage.getItem('gc_ests_v2')||'[]');
    var thirtyAgoD = new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
    (Array.isArray(ests)?ests:[]).filter(function(e){
      return (e.status==='draft'||!e.status) && e.date && e.date < thirtyAgoD;
    }).forEach(function(e){""",
"""    var thirtyAgoD = new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
    var _er = localStorage.getItem('gc_ests_v2')||'[]', _em = window.__gcExpEstMemo;   /* patch SPEED4 */
    if(!_em || _em.d!==thirtyAgoD || _em.raw!==_er){
      var ests = JSON.parse(_er);
      _em = window.__gcExpEstMemo = { d:thirtyAgoD, raw:_er, list:(Array.isArray(ests)?ests:[]).filter(function(e){
        return e && (e.status==='draft'||!e.status) && e.date && e.date < thirtyAgoD;
      }).map(function(e){ return { name:e.name, date:e.date }; }) };
    }
    _em.list.forEach(function(e){""", 'ests memo')

# 3e. the job cards' choice chips were rebuilt for every card every 600 ms while someone worked: each card's chip text
#     is kept for 3 s
sub("""    var have = card.querySelector(':scope > .gcch-strip:not(.gcau5-strip)'), html = stripHtml(pid);   /* patch JOBSTILL: not the Signatures strip */""",
"""    var _sm = window.__gcStripMemo || (window.__gcStripMemo = {}), _sn = Date.now(), _se = _sm[pid];   /* patch SPEED4 */
    var html = (_se && _sn - _se.at < 3000) ? _se.h : (_sm[pid] = { h: stripHtml(pid), at: _sn }).h;
    var have = card.querySelector(':scope > .gcch-strip:not(.gcau5-strip)');   /* patch JOBSTILL: not the Signatures strip */""", 'strips memo')

# 3f. the slowest presses on this computer, for a look from the console: _gcSlowClicks()
sub("""  setTimeout(function(){ if (_fhRaf) { try { cancelAnimationFrame(_fhRaf); } catch (e) {} _fhRaf = 0; look(); } }, 1000);   /* frames held up: look anyway */
}
window._gcFormOpen = function(){ return !!window.__GC_FORM_OPEN__; };""",
"""  setTimeout(function(){ if (_fhRaf) { try { cancelAnimationFrame(_fhRaf); } catch (e) {} _fhRaf = 0; look(); } }, 1000);   /* frames held up: look anyway */
}
window._gcFormOpen = function(){ return !!window.__GC_FORM_OPEN__; };
/* patch SPEED4: click to next paint over 150 ms (the last 60), with what was pressed and on which screen */
(function(){
  var L = [];
  try {
    new PerformanceObserver(function(list){
      list.getEntries().forEach(function(e){
        if (!/^(click|pointerup|keydown)$/.test(e.name) || e.duration < 150) return;
        var t = e.target, d = '';
        try { if (t && t.nodeType === 1) { d = t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (t.getElementsByTagName('*').length <= 40 ? ' "' + String(t.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40) + '"' : ''); } } catch (x) {}
        var v = ''; try { v = localStorage.getItem('grayco_view') || ''; } catch (x) {}
        L.push({ at: new Date().toISOString().slice(11, 19), ms: Math.round(e.duration), wait: Math.round(e.processingStart - e.startTime), work: Math.round(e.processingEnd - e.processingStart), what: e.name, on: d, view: v });
        if (L.length > 60) L.shift();
      });
    }).observe({ type: 'event', durationThreshold: 150 });
  } catch (e) {}
  window._gcSlowClicks = function(){ var o = L.slice().sort(function(a, b){ return b.ms - a.ms; }); try { console.table(o); } catch (e) {} return o; };
})();""", 'slow clicks')

# 3g. the no-duplicates money sweep read invoices, expenses and the register from the disk and compared every row
#     every 8 s while anyone was on the CRM (the biggest single cost on the dashboard). It now skips a pass when
#     none of the three lists was written since the last pass that found nothing to merge (and still runs in full at
#     least every 2 minutes).
sub("""async function doSweep(quiet){
  if(running) return {skipped:true};
  running=true;
  var total=0, per={};
  try{
    for(var i=0;i<KEYS.length;i++){""",
"""/* patch SPEED4: which of the three lists was written since the last clean pass */
var _swGen = 0, _swClean = -1, _swFullAt = 0;
(function(){
  try{
    var PR = IDBObjectStore.prototype;
    ['put','add','delete','clear'].forEach(function(n){
      var o = PR[n]; if(!o || o.__gcSW4) return;
      var w = function(a, b){
        try{
          if(this.name === 'kv' && this.transaction && this.transaction.db && this.transaction.db.name === 'grayco_crm'){
            var kk = (n === 'put' || n === 'add') ? b : a;
            if(n === 'clear' || typeof kk !== 'string' || /^(invs|invoices|expenses|gcAcctRegister)$/.test(kk)) _swGen++;
          }
        }catch(e){ _swGen++; }
        return o.apply(this, arguments);
      };
      w.__gcSW4 = true; try{ Object.keys(o).forEach(function(p){ w[p] = o[p]; }); }catch(e){}
      PR[n] = w;
    });
  }catch(e){ _swGen = NaN; }
})();
async function doSweep(quiet){
  if(running) return {skipped:true};
  if(_swClean === _swGen && Date.now() - _swFullAt < 120000) return {removed:0, per:{}, unchanged:true};   /* patch SPEED4: nothing written since a clean pass */
  running=true;
  var total=0, per={}, _g0 = _swGen;
  try{
    for(var i=0;i<KEYS.length;i++){""", 'sweep skip')
sub("""  } finally { running=false; }

  if(total && !quiet){""",
"""  } finally { running=false; }
  if(!total && _g0 === _g0){ _swClean = _g0; _swFullAt = Date.now(); }   /* patch SPEED4: a clean pass (NaN: never) */
  else _swClean = -1;

  if(total && !quiet){""", 'sweep mark')

# 3h. Admin → Employees: the employee screens were function components re-made on every redraw of the app, so React
#     threw the whole screen (and the open form) away and built it again each time; they are kept now (__gcStable,
#     as the P&L / invoices screens already are). A new employee's form says "New Employee", not "Edit Employee: undefined".
sub("""At==="users"&&e.jsx(Ve,{}),At==="hiring"&&e.jsx(N,{}),At==="pmpay2"&&e.jsx(Ee,{})""",
    """At==="users"&&e.jsx(__gcStable("admUsers",Ve),{}),At==="hiring"&&e.jsx(__gcStable("admHiring",N),{}),At==="pmpay2"&&e.jsx(__gcStable("admPmPay2",Ee),{})""", 'admin stable')
sub("""children:["✏️ ",W?"Edit":"Add"," Employee",W?`: ${W.name}`:""]""",
    """children:["✏️ ",(W&&W.id&&W.id!=="NEW")?"Edit":"New"," Employee",(W&&W.id&&W.id!=="NEW"&&W.name)?`: ${W.name}`:""]""", 'new employee heading')

assert MARK in src
open(path, 'w', encoding='utf-8').write(src)
print('patched SPEED4C')
