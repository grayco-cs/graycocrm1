# TABSEDIT (owner 11/23: "I want that settings button top left to have where we can edit our tabs in there too like it used to be"):
# the logo became the company switch (COSWITCH) and its old ⚙ Settings (Show / Hide Tabs …) could no longer be reached. The switch
# menu now ends with 🗂 Edit my tabs (show / hide / order — gcNavSettings) and ⚙ Settings (the old logo panel — gcSettings).
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'TABSEDIT' not in s
a = """  if (admin()) h += '<button type="button" data-co-set style="width:100%;text-align:left;border:0;border-top:1px solid #e2e8f0;background:#fff;padding:9px 12px;margin-top:4px;cursor:pointer;font:700 13px Inter,Arial,sans-serif;color:#0f172a">⚙ Company settings — names, EINs, licenses</button>';
  return h;"""
assert s.count(a) == 1
s = s.replace(a, a.replace("  return h;", """  /* TABSEDIT: the tabs editor and the old ⚙ Settings panel, for everyone (each person's own tabs) */
  if (W.gcNavSettings && typeof W.gcNavSettings.open === 'function') h += '<button type="button" data-co-tabs style="width:100%;text-align:left;border:0;border-top:1px solid #e2e8f0;background:#fff;padding:9px 12px;margin-top:4px;cursor:pointer;font:700 13px Inter,Arial,sans-serif;color:#0f172a">🗂 Edit my tabs — show, hide, order</button>';
  if (W.gcSettings && typeof W.gcSettings.open === 'function') h += '<button type="button" data-co-gear style="width:100%;text-align:left;border:0;background:#fff;padding:9px 12px;cursor:pointer;font:700 13px Inter,Arial,sans-serif;color:#0f172a">⚙ Settings</button>';
  return h;"""))
b = "  if (t.hasAttribute('data-co-set')) { e.preventDefault(); e.stopPropagation(); closePop(); openSettings(); return; }"
assert s.count(b) == 1
s = s.replace(b, b + """
  if (t.hasAttribute('data-co-tabs')) { e.preventDefault(); e.stopPropagation(); closePop(); try { W.gcNavSettings.open(); } catch (x) {} return; }   /* TABSEDIT */
  if (t.hasAttribute('data-co-gear')) { e.preventDefault(); e.stopPropagation(); closePop(); try { W.gcSettings.open(); } catch (x) {} return; }   /* TABSEDIT */""")
c = "  var t = e.target && e.target.closest ? e.target.closest('[data-co-menu],[data-gc-co-brand],[data-co-f],[data-co-set],[data-co-x],[data-co-save]') : null;"
assert s.count(c) == 1
s = s.replace(c, c.replace("[data-co-set],", "[data-co-set],[data-co-tabs],[data-co-gear],"))
open(p, 'w', encoding='utf-8').write(s); print('TABSEDIT applied')
