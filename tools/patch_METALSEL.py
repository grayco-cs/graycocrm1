#!/usr/bin/env python3
"""patch METALSEL (owner 11/9, photos of the Watson Metals color card and panel / trim sheet: "metal roof colors and panel types —
make sure in customer selection portal area").
· 🎨 Product library: Watson Metals — Panel type (Tuff Rib, R-Panel/PBR, Wave, 5V Crimp, Nailer Strip Standing Seam), Gauge,
  WeatherXL SMP colors 29 ga (all 23), 26 ga (the colors marked 26), Crinkle finish 29 ga (8), Trim color (custom trim, all
  stocked colors) — every color with its swatch color (hex) and Premium marked.
· The customer portal shows a color chip for an option with a swatch (selections.js passes hex through, checked).
· A metal-roof job (its words: metal roof, standing seam, R-panel, PBR, Tuff Rib, 5V, metal panels) that has not started gets three
  choices for the customer by itself: Panel type, Roof color (29 ga WeatherXL), Trim color — once; a PM can change or remove them."""
import sys, json
P = 'index.html'
src = open(P, encoding='utf-8').read()
DONE = '/*METALSEL' in src
if DONE: print('already patched')
if not DONE:
    def rep(a, b, f=None):
        global src
        assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
    HEX = {"Polar White": "#E9ECEB", "Bright White": "#F2F4F4", "Bone White": "#E3E5E0", "Stone": "#E8DFC6", "Ivory": "#EFE2BF", "Sierra Tan": "#C3A47C", "Clay": "#918B82",
      "Brown": "#5B4442", "Bronze": "#7C7A78", "Barn Red": "#8A2A2C", "Light Gray": "#9EA3A8", "Slate Gray": "#3A3F48", "Charcoal": "#575859", "Black": "#2D3033", "Bright Red": "#B0202A",
      "Hawaiian Blue": "#3D6C96", "Burgundy": "#4A1F28", "Fern Green": "#4E5E57", "Forest Green": "#2D4B3F", "Galvalume": "#C8CBCD", "Dark Red (Premium)": "#7A1A20", "Gallery Blue (Premium)": "#2B4469",
      "Painted Copper (Premium)": "#C68E69", "Pure White Crinkle": "#ECEEEF", "Stone Crinkle": "#D3CBB2", "Green Crinkle": "#1E4A2E", "Charcoal Crinkle": "#4E4F51", "Clay Crinkle": "#A39D95",
      "Bronze Crinkle": "#4A4440", "Red Crinkle": "#7B222A", "Black Crinkle": "#1E1F21"}
    ALL = ["Polar White", "Bright White", "Bone White", "Stone", "Ivory", "Sierra Tan", "Clay", "Brown", "Bronze", "Barn Red", "Light Gray", "Slate Gray", "Charcoal", "Black", "Bright Red",
      "Hawaiian Blue", "Burgundy", "Fern Green", "Forest Green", "Galvalume", "Dark Red (Premium)", "Gallery Blue (Premium)", "Painted Copper (Premium)"]
    G26 = ["Polar White", "Stone", "Sierra Tan", "Clay", "Brown", "Bronze", "Barn Red", "Light Gray", "Slate Gray", "Charcoal", "Black", "Bright Red", "Hawaiian Blue", "Fern Green", "Forest Green", "Galvalume", "Gallery Blue (Premium)"]
    CR = ["Pure White Crinkle", "Stone Crinkle", "Green Crinkle", "Charcoal Crinkle", "Clay Crinkle", "Bronze Crinkle", "Red Crinkle", "Black Crinkle"]
    PANELS = ['Tuff Rib — 36" coverage, 3/4" rib', 'R-Panel / PBR — 36" coverage, 1-1/4" rib', 'Wave Panel — 36" coverage, 3/4"', '5V Crimp — 24" coverage, 7/16"', 'Nailer Strip Standing Seam — 29 ga']
    rows = [["Metal roofing", "Watson Metals", "Panel type", PANELS], ["Metal roofing", "Watson Metals", "Gauge", ['29 gauge — every color', '26 gauge — Tuff Rib, Wave, PBR (colors marked 26)']],
      ["Metal roofing", "Watson Metals", "WeatherXL SMP colors — 29 ga", ALL], ["Metal roofing", "Watson Metals", "WeatherXL SMP colors — 26 ga", G26],
      ["Metal roofing", "Watson Metals", "Crinkle finish colors — 29 ga", CR], ["Metal roofing", "Watson Metals", "Trim color (custom trim, all stocked colors)", ALL]]
    seedrows = ''.join('\n  ' + json.dumps(r, ensure_ascii=False) + ',' for r in rows)
    rep("""  ['Metal roofing', 'Corrugated', '29 gauge', METAL],""", """  ['Metal roofing', 'Corrugated', '29 gauge', METAL],
      /*METALSEL: Watson Metals (Sherwin-Williams WeatherXL SMP + crinkle; owner's color card 11/9) */""" + seedrows)
    rep("""var METAL = ['Galvalume (unpainted)',""", """var MHEX = """ + json.dumps(HEX) + """;   /*METALSEL swatches*/
    var METAL = ['Galvalume (unpainted)',""")
    rep("""    var add = function(color){ SEEDS.push({ id: libId(x[0], x[1], x[2], color), cat: x[0], brand: x[1], line: x[2], color: color, seed: true, note: SEED_NOTE, by: 'GrayCo', at: SEED_AT, updatedAt: SEED_AT }); };""",
    """    var add = function(color){ var r = { id: libId(x[0], x[1], x[2], color), cat: x[0], brand: x[1], line: x[2], color: color, seed: true, note: SEED_NOTE, by: 'GrayCo', at: SEED_AT, updatedAt: SEED_AT }; if (x[1] === 'Watson Metals' && MHEX[color]) { r.hex = MHEX[color]; r.note = 'Watson Metals color card (Sherwin-Williams WeatherXL) — verify with supplier'; } SEEDS.push(r); };""")
    open(P, 'w', encoding='utf-8').write(src)
    # selections.js: pass hex through
    S = 'netlify/functions/selections.js'; s2 = open(S, encoding='utf-8').read()
    a = """      out.push({ id: 'lib_' + s(r.id).slice(0, 60), productId: r.id, color: r.color, price: r.price, unit: r.unit, photo: r.photo });"""
    assert s2.count(a) == 1
    s2 = s2.replace(a, """      out.push({ id: 'lib_' + s(r.id).slice(0, 60), productId: r.id, color: r.color, price: r.price, unit: r.unit, photo: r.photo, hex: r.hex });   /*METALSEL*/""")
    a2 = """priceDiff: num(o.priceDiff) ? money(o.priceDiff) : 0, photo: signed[o.ph"""
    assert s2.count(a2) == 1
    s2 = s2.replace(a2, """priceDiff: num(o.priceDiff) ? money(o.priceDiff) : 0, hex: /^#[0-9a-f]{6}$/i.test(s(o.hex)) ? s(o.hex) : '', photo: signed[o.ph""")
    open(S, 'w', encoding='utf-8').write(s2)
    # portal: the chip
    Q = 'portal.html'; s3 = open(Q, encoding='utf-8').read()
    a3 = """          o.photo ? h('img', { src: o.photo, alt: '', loading: 'lazy' }) : h('span', { class: 'sel-ph', 'aria-hidden': 'true', text: '🎨' }),"""
    assert s3.count(a3) == 1
    s3 = s3.replace(a3, """          o.photo ? h('img', { src: o.photo, alt: '', loading: 'lazy' }) : (o.hex && /^#[0-9a-f]{6}$/i.test(o.hex)) ? h('span', { class: 'sel-ph', 'aria-hidden': 'true', style: 'background:' + o.hex + ';border:1px solid rgba(0,0,0,.15)' }) : h('span', { class: 'sel-ph', 'aria-hidden': 'true', text: '🎨' }),   /*METALSEL*/""")
    open(Q, 'w', encoding='utf-8').write(s3)
    print('patched')

# + the auto choices on metal-roof jobs (tools/metalsel_tail.js)
import os
s4 = open('index.html', encoding='utf-8').read()
if '__GC_PATCH_METALSEL__' not in s4:
    t = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'metalsel_tail.js'), encoding='utf-8').read()
    open('index.html', 'w', encoding='utf-8').write(s4.rstrip('\n') + '\n' + t); print('tail added')
