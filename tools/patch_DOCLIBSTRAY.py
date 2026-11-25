# DOCLIBSTRAY (owner 11/25, screenshot of the Projects list with the dark "GrayCo Document Library · Documents / Training" stacked under
# it: "why is it like this"): the Document Library lives on 📄 Forms & Docs; opened from anywhere else it fell back to an "overlay" that
# has no position any more — it was tacked onto the bottom of whatever page was open, in its old navy colours, and stayed there.
# Now: opened off the Forms & Docs page and not claimed by the phone sheet within a moment → you are taken to 📄 Forms & Docs (the same
# job picked); and a library left loose on another page is put away (never stacked under another screen).
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'DOCLIBSTRAY' not in s
def sub(a, b):
    global s
    assert s.count(a) == 1, (a[:60], s.count(a)); s = s.replace(a, b)
sub("if(!navMount){ if(!overlay.isConnected) document.body.appendChild(overlay); overlay.classList.add('visible');",
    "if(!navMount){ if(!overlay.isConnected) document.body.appendChild(overlay); overlay.classList.add('visible');"
    " setTimeout(function(){ try{ var _b=document.getElementById('gc-doclib-box'); if(overlay.classList.contains('visible') && _b && _b.parentNode===overlay && !document.getElementById('gc-forms-nav-mount') && typeof window._setView==='function'){ overlay.classList.remove('visible'); window._setView('forms'); } }catch(_e){} }, 80);   /* patch DOCLIBSTRAY: not claimed → the Forms & Docs page, never stacked under another screen */")
sub("""    // navigated away — remove the back bar so it doesn't linger on other views
    var _oldBar=document.getElementById('_gcFormsBackBar'); if(_oldBar) _oldBar.remove();
""", """    // navigated away — remove the back bar so it doesn't linger on other views
    var _oldBar=document.getElementById('_gcFormsBackBar'); if(_oldBar) _oldBar.remove();
    /* patch DOCLIBSTRAY: a library left loose on another page (no Forms & Docs, nobody holding it) is put away */
    try{ var _ov=document.getElementById('gc-doclib-overlay'), _bx=document.getElementById('gc-doclib-box'); if(_ov && _ov.classList.contains('visible') && (!_bx || _bx.parentNode===_ov) && Date.now()-(window.__gcDocLibOpenAt||0)>3000) _ov.classList.remove('visible'); }catch(_e){}
""")
sub("  open: function(projId){\n   try{\n    _selProjId = projId || '';", "  open: function(projId){\n   try{\n    window.__gcDocLibOpenAt = Date.now();   /* patch DOCLIBSTRAY */\n    _selProjId = projId || '';")
open(p, 'w', encoding='utf-8').write(s); print('DOCLIBSTRAY applied')
