// The big product library: brands, colors, finishes, wood species, brick and stone, siding,
// roofing colors, countertops, cabinets and landscaping. It is added to the starting catalog.
//
// Every price is a placeholder to replace with your own (📦 Catalog, or a CSV import).
// Colors are screen approximations of the maker's color, for drawing only: always check a real sample.
// Brand and color names are the makers' names, used only to describe the product.
//
// Extra fields on each product (all optional):
//   brand      maker (Sherwin-Williams, GAF, James Hardie …)
//   colorName  the maker's color name / number
//   finish     sheen or surface (Flat, Satin, Matte, Polished, Smooth …)
//   material   species or material (White Oak, Granite, Clay brick …)
//   depth      inches, for products sold by the cubic yard (mulch, gravel, rock)

const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const item = (id, category, kind, name, unit, price, labor, color, extra = {}) =>
  ({ id, category, kind, name, unit, price, labor, color, sku: '', vendor: '', notes: '', ...extra });
const out = [];
const add = (...a) => out.push(item(...a));

// ---------------- Paint: brands × colors, and sheens ----------------
const PAINT_COLORS = [
  ['Sherwin-Williams', 'Agreeable Gray SW 7029', '#d1cbc1'], ['Sherwin-Williams', 'Repose Gray SW 7015', '#ccc9c0'],
  ['Sherwin-Williams', 'Alabaster SW 7008', '#edeae0'], ['Sherwin-Williams', 'Pure White SW 7005', '#edece6'],
  ['Sherwin-Williams', 'Accessible Beige SW 7036', '#d1c7b8'], ['Sherwin-Williams', 'Sea Salt SW 6204', '#cdd2ca'],
  ['Sherwin-Williams', 'Naval SW 6244', '#2f3d4c'], ['Sherwin-Williams', 'Tricorn Black SW 6258', '#2f2f30'],
  ['Sherwin-Williams', 'Mindful Gray SW 7016', '#bcb7ad'], ['Sherwin-Williams', 'Evergreen Fog SW 9130', '#95978a'],
  ['Benjamin Moore', 'White Dove OC-17', '#eeede6'], ['Benjamin Moore', 'Chantilly Lace OC-65', '#f4f4ef'],
  ['Benjamin Moore', 'Revere Pewter HC-172', '#ccc7b9'], ['Benjamin Moore', 'Edgecomb Gray HC-173', '#d9d2c5'],
  ['Benjamin Moore', 'Hale Navy HC-154', '#434c56'], ['Benjamin Moore', 'Pale Oak OC-20', '#ddd6cb'],
  ['Benjamin Moore', 'Simply White OC-117', '#f2f1e6'], ['Benjamin Moore', 'Kendall Charcoal HC-166', '#686661'],
  ['Behr', 'Ultra Pure White', '#f6f6f2'], ['Behr', 'Silver Drop', '#dcdcd4'], ['Behr', 'Polar Bear', '#f0ece0'],
  ['Behr', 'Cracked Pepper', '#4f5152'], ['Behr', 'Blank Canvas', '#f1ece0'], ['Behr', 'Back to Nature', '#bbbf9b'],
  ['PPG', 'Delicate White', '#f2f0ea'], ['PPG', 'Gray Matters', '#bebcb3'], ['Valspar', 'Bistro White', '#ece5d7'],
];
PAINT_COLORS.forEach(([brand, colorName, color]) => {
  add(`pnt-${slug(brand)}-${slug(colorName)}`, 'paint', 'wall', `${brand} ${colorName} – interior, 2 coats`, 'SF', 0.4, 0.95, color, { brand, colorName, finish: 'Eggshell' });
});
[['Flat', 0.36, 0.9], ['Matte', 0.38, 0.92], ['Eggshell', 0.4, 0.95], ['Satin', 0.42, 0.98], ['Semi-gloss', 0.45, 1.05], ['Gloss', 0.48, 1.1]].forEach(([finish, price, labor]) => {
  add(`pnt-sheen-${slug(finish)}`, 'paint', 'wall', `Interior paint – ${finish}, 2 coats (pick color)`, 'SF', price, labor, '#f1efe9', { finish });
});
add('pnt-ext-body', 'paint', 'wall', 'Exterior paint – siding body, 2 coats', 'SF', 0.55, 1.35, '#cfc8b8', { finish: 'Satin' });
add('pnt-ext-trim', 'paint', 'wall', 'Exterior paint – trim, 2 coats', 'LF', 0.35, 1.25, '#f4f4ef', { finish: 'Semi-gloss' });
add('pnt-stain-deck', 'paint', 'floor', 'Deck stain – semi-transparent', 'SF', 0.45, 1.1, '#9a6a3f', { finish: 'Semi-transparent' });
add('pnt-epoxy', 'flooring', 'floor', 'Epoxy floor coating – garage / shop', 'SF', 2.2, 2.8, '#8c9196', { finish: 'Gloss' });

// Wall coverings and paneling (room walls)
add('wc-shiplap', 'paint', 'wall', 'Shiplap paneling – painted', 'SF', 2.8, 3.5, '#f3f1ea', { material: 'MDF / pine' });
add('wc-wallpaper', 'paint', 'wall', 'Wallpaper – mid grade', 'SF', 1.6, 2.2, '#d8cbb6', { material: 'Vinyl wallcovering' });
add('wc-beadboard', 'paint', 'wall', 'Beadboard wainscot', 'SF', 3.2, 4.0, '#f5f3ec', { material: 'MDF' });
add('wc-frp', 'commercial', 'wall', 'FRP wall panel', 'SF', 1.4, 1.8, '#f0efe8', { material: 'Fiberglass reinforced plastic' });

// ---------------- Wood: flooring, trim, doors by species ----------------
const WOODS = [
  ['Red Oak', '#b57a4f'], ['White Oak', '#b89a72'], ['Hickory', '#b0855a'], ['Hard Maple', '#d9b98c'], ['Black Walnut', '#5e4130'],
  ['Cherry', '#9c5a3c'], ['Ash', '#c9ad84'], ['Birch', '#d6b98e'], ['Heart Pine', '#c58a4a'], ['Brazilian Cherry (Jatoba)', '#7e3b26'],
  ['Acacia', '#8c5a34'], ['Bamboo (strand)', '#a7774a'], ['Cedar', '#b4683e'], ['Mahogany', '#7a3c27'], ['Teak', '#9b6a3c'],
];
WOODS.forEach(([material, color]) => {
  add(`flr-solid-${slug(material)}`, 'flooring', 'floor', `Solid hardwood 3/4" – ${material}`, 'SF', 6.5, 5.0, color, { material, finish: 'Site-finished satin' });
});
['Red Oak', 'White Oak', 'Hickory', 'Hard Maple', 'Black Walnut', 'Acacia'].forEach(m => {
  const c = WOODS.find(w => w[0] === m)[1];
  add(`flr-eng-${slug(m)}`, 'flooring', 'floor', `Engineered hardwood – ${m}`, 'SF', 5.2, 3.5, c, { material: m, finish: 'Prefinished matte' });
});
[['Natural', '#b98d5b'], ['Gray wash', '#a39d93'], ['Espresso', '#4e3a2e'], ['Honey', '#c4904f'], ['Whitewash', '#d9cfc0']].forEach(([stain, color]) => {
  add(`flr-stain-${slug(stain)}`, 'flooring', 'floor', `Hardwood refinish – sand & ${stain} stain`, 'SF', 1.2, 3.3, color, { finish: stain });
});
[['Oak', '#c9a46e'], ['Poplar', '#d8c9a4'], ['Pine', '#d9b27a'], ['Maple', '#ddc19a'], ['Cherry', '#9c5a3c'], ['Walnut', '#5e4130'], ['MDF primed', '#f2f1ec']].forEach(([m, color]) => {
  add(`trm-base-${slug(m)}`, 'trim', 'wall', `Baseboard 5-1/4" – ${m}`, 'LF', m === 'MDF primed' ? 1.6 : 3.4, 2.4, color, { material: m });
  add(`trm-crown-${slug(m)}`, 'trim', 'wall', `Crown molding 4-5/8" – ${m}`, 'LF', m === 'MDF primed' ? 2.2 : 4.8, 4.2, color, { material: m });
  add(`trm-casing-${slug(m)}`, 'trim', 'wall', `Door / window casing – ${m}`, 'LF', m === 'MDF primed' ? 1.3 : 2.9, 2.2, color, { material: m });
});
add('trm-chair', 'trim', 'wall', 'Chair rail – paint grade', 'LF', 1.8, 2.4, '#f2f1ec');
add('trm-shoe', 'trim', 'wall', 'Shoe molding – paint grade', 'LF', 0.6, 1.1, '#f2f1ec');
[['Knotty Alder', '#a9714a'], ['Oak', '#c9a46e'], ['Walnut', '#5e4130'], ['Mahogany', '#7a3c27']].forEach(([m, color]) => {
  add(`dr-int-${slug(m)}`, 'door', 'opening', `Interior door – solid ${m}, prehung`, 'EA', 520, 160, color, { material: m, w: 2.67, h: 6.67, sill: 0, openingType: 'door' });
});
add('dr-barn', 'door', 'opening', 'Barn door w/ track – rustic pine', 'EA', 480, 220, '#8a6242', { material: 'Pine', w: 3, h: 7, sill: 0, openingType: 'opening' });
add('dr-french-int', 'door', 'opening', 'French doors – interior pair 5/0', 'EA', 780, 320, '#f5f5f0', { w: 5, h: 6.67, sill: 0, openingType: 'slider' });
add('dr-fg-entry', 'door', 'opening', 'Fiberglass entry door w/ sidelites', 'EA', 1900, 550, '#5a3a28', { material: 'Fiberglass, wood grain', w: 5.5, h: 6.67, sill: 0, openingType: 'door' });
add('dr-ext-black', 'door', 'opening', 'Exterior steel door 3/0 – black', 'EA', 450, 260, '#1f1f1f', { w: 3, h: 6.67, sill: 0, openingType: 'door' });

// ---------------- Other flooring ----------------
[['Natural oak', '#b98d5b'], ['Weathered gray', '#9a958c'], ['Coastal white', '#d8d2c6'], ['Smoked walnut', '#5f4636'], ['Hickory brown', '#8d6544'], ['Greige', '#b2a998']].forEach(([cn, color]) => {
  add(`flr-lam-${slug(cn)}`, 'flooring', 'floor', `Laminate 12 mm – ${cn}`, 'SF', 2.4, 2.0, color, { colorName: cn, material: 'Laminate' });
});
[['Marble – Carrara', '#e8e6e2', 12, 9], ['Travertine – ivory', '#e2d4b8', 7, 8], ['Slate – charcoal', '#4c4f52', 6.5, 8], ['Ceramic 12×12 – beige', '#d8cbb3', 2.2, 5.5],
 ['Porcelain wood-look – oak', '#a98057', 4.2, 6.5], ['Porcelain 24×24 – concrete gray', '#a7a6a2', 4.8, 6.5], ['Saltillo terracotta', '#b0643f', 4.5, 7.5], ['Hexagon mosaic – white', '#f1f1ee', 9, 11]].forEach(([n, color, price, labor]) => {
  add(`flr-tile-${slug(n)}`, 'flooring', 'floor', `Tile – ${n}`, 'SF', price, labor, color, { material: n.split(' – ')[0] });
});
[['Frieze – taupe', '#a69886'], ['Berber – oatmeal', '#cfc3ad'], ['Plush – gray', '#9b9b98'], ['Commercial carpet tile – charcoal', '#4a4c50']].forEach(([n, color]) => {
  add(`flr-carpet-${slug(n)}`, 'flooring', 'floor', `Carpet – ${n}`, n.includes('tile') ? 'SF' : 'SY', n.includes('tile') ? 3.4 : 32, n.includes('tile') ? 1.4 : 9, color, { material: 'Carpet' });
});
add('flr-polished-conc', 'flooring', 'floor', 'Polished concrete', 'SF', 1.5, 3.5, '#a9a7a2', { finish: 'Polished' });
add('flr-rubber', 'commercial', 'floor', 'Rubber flooring – gym', 'SF', 4.2, 1.8, '#2d2f31');

// ---------------- Wall tile and backsplash (place as a panel: width × height) ----------------
[['Subway 3×6 – white gloss', '#f4f4f1'], ['Subway 3×6 – sage', '#a9b39a'], ['Zellige – white', '#ecebe4'], ['Marble mosaic – Carrara', '#e5e3df'], ['Glass mosaic – blue', '#6e94ad'], ['Stacked stone – gray', '#8d8b86']].forEach(([n, color]) => {
  add(`tile-bs-${slug(n)}`, 'tile', 'object', `Backsplash tile – ${n}`, 'SF', 9, 12, color, { w: 8, d: 0.05, h: 1.5, elev: 3, objType: 'panel' });
});
add('tile-shower-wall', 'tile', 'object', 'Shower wall tile – porcelain 12×24', 'SF', 5.5, 11, '#d9d7d1', { w: 5, d: 0.05, h: 7, elev: 0, objType: 'panel' });

// ---------------- Siding ----------------
const SIDING_COLORS = [['White', '#f2f1ec'], ['Almond', '#e5dbc6'], ['Clay', '#c3b49a'], ['Pewter', '#9a9d9b'], ['Slate blue', '#6b7c8c'], ['Sage', '#8f9a83'], ['Charcoal', '#4a4d50'], ['Barn red', '#8c3a2f']];
[['Vinyl siding – Dutch lap', 2.4, 2.6], ['Vinyl siding – clapboard', 2.3, 2.6], ['Vinyl board & batten', 3.1, 3.0], ['Vinyl shake / shingle', 4.2, 3.4]].forEach(([n, price, labor]) => {
  SIDING_COLORS.forEach(([cn, color]) => add(`sid-${slug(n)}-${slug(cn)}`, 'siding', 'wall', `${n} – ${cn}`, 'SF', price, labor, color, { colorName: cn, material: 'Vinyl' }));
});
const HARDIE = [['Arctic White', '#f1f1ed'], ['Cobble Stone', '#c2b49e'], ['Iron Gray', '#5b5f60'], ['Evening Blue', '#3f4c5d'], ['Monterey Taupe', '#9f927f'], ['Aged Pewter', '#7f8079'], ['Night Gray', '#4a4d51'], ['Mountain Sage', '#8b9179']];
[['HardiePlank lap siding', 4.4, 4.8], ['HardiePanel board & batten', 4.8, 5.2], ['HardieShingle', 5.6, 5.8]].forEach(([n, price, labor]) => {
  HARDIE.forEach(([cn, color]) => add(`sid-hardie-${slug(n)}-${slug(cn)}`, 'siding', 'wall', `James Hardie ${n} – ${cn}`, 'SF', price, labor, color, { brand: 'James Hardie', colorName: cn, material: 'Fiber cement', finish: 'ColorPlus' }));
});
[['LP SmartSide lap – primed', 3.6, 4.2, '#d9d3c4', 'LP Building Solutions', 'Engineered wood'], ['Cedar bevel siding – natural', 6.8, 5.5, '#b4683e', '', 'Western red cedar'],
 ['Cedar shingles – natural', 7.5, 6.5, '#a8673f', '', 'Western red cedar'], ['Stucco – 3 coat, sand finish', 4.0, 6.5, '#e2d6bf', '', 'Portland cement'],
 ['EIFS – synthetic stucco', 5.5, 6.0, '#ddd2bd', '', 'EIFS'], ['Metal wall panel – galvalume', 4.2, 3.4, '#b6bcc0', '', 'Steel'],
 ['Metal wall panel – charcoal', 4.5, 3.5, '#43474b', '', 'Steel'], ['Aluminum siding – white', 3.0, 3.0, '#f0f0eb', '', 'Aluminum']].forEach(([n, price, labor, color, brand, material]) => {
  add(`sid-${slug(n)}`, 'siding', 'wall', n, 'SF', price, labor, color, { brand, material });
});

// ---------------- Brick and stone (masonry) ----------------
[['Red – smooth', '#9c3f2e'], ['Red – wire cut', '#8f3a2b'], ['Used / antique', '#8a5544'], ['Tan / buff', '#c9a87c'], ['Gray / charcoal', '#5c5a59'],
 ['White-washed', '#d8cfc4'], ['Painted white', '#efede6'], ['Brown – tumbled', '#6e4a3a'], ['Pink blend', '#b77a6a'], ['Black – ironspot', '#3a3433']].forEach(([cn, color]) => {
  add(`brk-${slug(cn)}`, 'masonry', 'wall', `Brick veneer – ${cn} (modular)`, 'SF', 9, 12, color, { colorName: cn, material: 'Clay brick' });
});
add('brk-thin', 'masonry', 'wall', 'Thin brick veneer – red blend', 'SF', 11, 9, '#9a4a38', { material: 'Thin brick' });
add('brk-king', 'masonry', 'wall', 'Brick veneer – king size, earth blend', 'SF', 8.5, 11, '#8d5a44', { material: 'Clay brick' });
add('brk-queen', 'masonry', 'wall', 'Brick veneer – queen size, rose', 'SF', 8.8, 11.5, '#a35e4d', { material: 'Clay brick' });
[['Ledgestone – gray', '#8b8a86'], ['Ledgestone – tan', '#b39c7c'], ['Fieldstone', '#9d9183'], ['Stacked stone – charcoal', '#4f4f4f'], ['River rock', '#9b9286'],
 ['Limestone – cut', '#d8ceb8'], ['Castle rock', '#a5998a'], ['Cultured stone – country rubble', '#a3927c']].forEach(([cn, color]) => {
  add(`stn-${slug(cn)}`, 'masonry', 'wall', `Stone veneer – ${cn}`, 'SF', 12, 16, color, { colorName: cn, material: 'Stone veneer' });
});
add('msn-cmu', 'masonry', 'wall', 'CMU block wall 8" – painted', 'SF', 4.5, 7.5, '#bdbbb5', { material: 'Concrete block' });
add('msn-split-face', 'masonry', 'wall', 'Split-face block – tan', 'SF', 6, 8.5, '#c2ab88', { material: 'Concrete block' });
add('msn-fireplace', 'masonry', 'object', 'Fireplace surround – stacked stone', 'SF', 14, 18, '#77746f', { w: 6, d: 0.3, h: 9, objType: 'panel' });

// ---------------- Roofing: brands × colors ----------------
const GAF = [['Charcoal', '#3b3b3c'], ['Pewter Gray', '#77787a'], ['Weathered Wood', '#6e6455'], ['Hickory', '#6a4f3b'], ['Barkwood', '#5b4535'], ['Shakewood', '#8a6c4f'], ['Slate', '#55616b'], ['Mission Brown', '#4c3a30'], ['Hunter Green', '#3c4a3d']];
GAF.forEach(([cn, color]) => add(`rf-gaf-hdz-${slug(cn)}`, 'roofing', 'roof', `GAF Timberline HDZ – ${cn}`, 'SQ', 170, 135, color, { brand: 'GAF', colorName: cn, material: 'Architectural shingle' }));
const OC = [['Onyx Black', '#2c2c2d'], ['Driftwood', '#7a6c5c'], ['Estate Gray', '#6c6d6e'], ['Teak', '#6c5240'], ['Brownwood', '#5c4636'], ['Desert Tan', '#a08c70'], ['Sierra Gray', '#8a8b89'], ['Quarry Gray', '#5d6063']];
OC.forEach(([cn, color]) => add(`rf-oc-duration-${slug(cn)}`, 'roofing', 'roof', `Owens Corning Duration – ${cn}`, 'SQ', 168, 135, color, { brand: 'Owens Corning', colorName: cn, material: 'Architectural shingle' }));
const CT = [['Moire Black', '#2e2e30'], ['Weathered Wood', '#6f6658'], ['Colonial Slate', '#5c5f63'], ['Heather Blend', '#6e5a52'], ['Georgetown Gray', '#7b7c7c'], ['Burnt Sienna', '#6b4a3a']];
CT.forEach(([cn, color]) => add(`rf-ct-landmark-${slug(cn)}`, 'roofing', 'roof', `CertainTeed Landmark – ${cn}`, 'SQ', 166, 135, color, { brand: 'CertainTeed', colorName: cn, material: 'Architectural shingle' }));
add('rf-3tab', 'roofing', 'roof', '3-tab shingle (incl. felt)', 'SQ', 120, 115, '#4d4d4d', { material: '3-tab shingle' });
add('rf-designer', 'roofing', 'roof', 'Designer shingle – slate look', 'SQ', 310, 180, '#4b4f55', { material: 'Luxury shingle' });
[['Galvalume', '#b9bec2'], ['Charcoal', '#43474b'], ['Burnished Slate', '#5b5146'], ['Ocean Blue', '#3c5a74'], ['Forest Green', '#3b5242'], ['Barn Red', '#8c2f28'], ['Matte Black', '#262728'], ['Copper Penny', '#a8633a'], ['Polar White', '#eef0ee']].forEach(([cn, color]) => {
  add(`rf-metal-ss-${slug(cn)}`, 'roofing', 'roof', `Standing seam metal 24 ga – ${cn}`, 'SQ', 520, 380, color, { colorName: cn, material: 'Steel', finish: 'Kynar 500' });
  add(`rf-metal-r-${slug(cn)}`, 'roofing', 'roof', `R-panel / 5V metal 29 ga – ${cn}`, 'SQ', 260, 190, color, { colorName: cn, material: 'Steel' });
});
add('rf-clay-tile', 'roofing', 'roof', 'Clay tile – Spanish S, terracotta', 'SQ', 650, 520, '#b4593a', { material: 'Clay tile' });
add('rf-conc-tile', 'roofing', 'roof', 'Concrete tile – flat, charcoal', 'SQ', 380, 420, '#4f5154', { material: 'Concrete tile' });
add('rf-slate', 'roofing', 'roof', 'Natural slate – gray', 'SQ', 1200, 900, '#555b61', { material: 'Slate' });
add('rf-cedar-shake', 'roofing', 'roof', 'Cedar shake – medium', 'SQ', 650, 480, '#8b6243', { material: 'Western red cedar' });
add('rf-epdm', 'roofing', 'roof', 'EPDM 60 mil, fully adhered', 'SQ', 330, 310, '#2b2b2c', { material: 'EPDM' });
add('rf-modbit', 'roofing', 'roof', 'Modified bitumen 2-ply', 'SQ', 300, 320, '#3a3a3a', { material: 'Mod bit' });
add('rf-tpo-tan', 'roofing', 'roof', 'TPO 60 mil – tan', 'SQ', 385, 340, '#cfc3ab', { material: 'TPO' });
add('rf-coating', 'roofing', 'roof', 'Silicone roof coating', 'SQ', 140, 110, '#f2f2f0', { material: 'Silicone' });
[['White', '#f3f3f0'], ['Black', '#262626'], ['Bronze', '#5a4632'], ['Clay', '#b6a58a'], ['Musket Brown', '#5b4a3a']].forEach(([cn, color]) => {
  add(`rf-gutter-6-${slug(cn)}`, 'roofing', 'roof', `Seamless gutter 6" – ${cn}`, 'LF', 6, 4.5, color, { colorName: cn, material: 'Aluminum', roofPart: 'gutter' });
});
add('rf-ridge-vent', 'roofing', 'roof', 'Ridge vent', 'LF', 3.5, 2.5, '#2f2f2f', { roofPart: 'ridgecap' });
add('rf-drip-black', 'roofing', 'roof', 'Drip edge – black', 'LF', 1.3, 0.9, '#262626', { roofPart: 'drip' });
add('rf-synthetic', 'roofing', 'roof', 'Synthetic underlayment (whole roof, by eave)', 'LF', 2.4, 1.2, '#5b6770', { roofPart: 'ice' });

// ---------------- Windows: types × frame colors ----------------
[['White', '#ffffff'], ['Black', '#1f1f1f'], ['Bronze', '#5a4632'], ['Tan', '#d2c3a6']].forEach(([cn, color]) => {
  add(`wn-dh-3060-${slug(cn)}`, 'window', 'opening', `Vinyl double-hung 3060 – ${cn}`, 'EA', 360, 175, color, { colorName: cn, w: 3, h: 6, sill: 2, openingType: 'window' });
  add(`wn-cas-2448-${slug(cn)}`, 'window', 'opening', `Casement 2448 – ${cn}`, 'EA', 420, 180, color, { colorName: cn, w: 2, h: 4, sill: 3, openingType: 'window' });
  add(`wn-slide-5030-${slug(cn)}`, 'window', 'opening', `Sliding window 5030 – ${cn}`, 'EA', 330, 170, color, { colorName: cn, w: 5, h: 3, sill: 3.5, openingType: 'window' });
});
add('wn-bay', 'window', 'opening', 'Bay window 8×5', 'EA', 2400, 900, '#ffffff', { w: 8, h: 5, sill: 2, openingType: 'window' });
add('wn-wood-dh', 'window', 'opening', 'Wood double-hung 3060 – clad exterior', 'EA', 780, 220, '#f2f0ea', { material: 'Pine, aluminum clad', w: 3, h: 6, sill: 2, openingType: 'window' });
add('wn-egress', 'window', 'opening', 'Egress casement 3048', 'EA', 520, 220, '#ffffff', { w: 3, h: 4, sill: 2, openingType: 'window' });
add('wn-transom', 'window', 'opening', 'Transom window 3012', 'EA', 210, 140, '#ffffff', { w: 3, h: 1, sill: 7, openingType: 'window' });

// ---------------- Cabinets: door styles × colors ----------------
const CAB_COLORS = [['White', '#f1efe9'], ['Dove gray', '#c7c5bf'], ['Navy', '#2f3c50'], ['Sage green', '#93a08a'], ['Natural oak', '#c39a6b'], ['Walnut', '#5e4130'], ['Espresso', '#3c2c24'], ['Black', '#232323']];
['Shaker', 'Flat slab', 'Raised panel'].forEach(style => {
  CAB_COLORS.forEach(([cn, color]) => {
    add(`cab-${slug(style)}-${slug(cn)}-base`, 'cabinet', 'object', `${style} base cabinet – ${cn} (per LF)`, 'LF', style === 'Flat slab' ? 240 : 220, 45, color, { colorName: cn, finish: style, w: 3, d: 2, h: 3, objType: 'base' });
    add(`cab-${slug(style)}-${slug(cn)}-wall`, 'cabinet', 'object', `${style} wall cabinet – ${cn} (per LF)`, 'LF', style === 'Flat slab' ? 185 : 170, 40, color, { colorName: cn, finish: style, w: 3, d: 1, h: 2.5, elev: 4.5, objType: 'upper' });
  });
});

// ---------------- Countertops (place with width × depth; priced per SF) ----------------
[['Quartz – Calacatta white', '#efede8', 75], ['Quartz – concrete gray', '#a9a8a4', 70], ['Quartz – pure white', '#f5f5f2', 68], ['Granite – Uba Tuba', '#2c3229', 55], ['Granite – Santa Cecilia', '#b49c6e', 55],
 ['Granite – Absolute Black', '#1e1e1f', 62], ['Granite – Colonial White', '#d9d4cb', 58], ['Marble – Carrara', '#e6e4df', 85], ['Quartzite – Taj Mahal', '#e2d7c4', 95], ['Butcher block – maple', '#d7b182', 45],
 ['Butcher block – walnut', '#5e4130', 70], ['Solid surface – white', '#f0efea', 45], ['Laminate – stone look', '#bdb7ab', 22], ['Concrete – sealed', '#9d9c97', 75]].forEach(([n, color, price]) => {
  add(`ctr-${slug(n)}`, 'countertop', 'object', `Countertop – ${n}`, 'SF', price, 20, color, { material: n.split(' – ')[0], w: 8, d: 2.08, h: 0.125, elev: 2.95, objType: 'box' });
});

// ---------------- Landscape: lawn, beds, plants (draw an outside area and pick these) ----------------
[['Sod – Bermuda', '#5f8f3e', 0.55, 0.45], ['Sod – Zoysia', '#557f3b', 0.85, 0.5], ['Sod – St. Augustine', '#4c7a36', 0.75, 0.5], ['Sod – Tall Fescue', '#5d8a46', 0.6, 0.45],
 ['Grass seed + straw', '#7ea05a', 0.12, 0.18], ['Artificial turf', '#4f9a3f', 4.5, 3.5]].forEach(([n, color, price, labor]) => {
  add(`ls-${slug(n)}`, 'landscape', 'floor', n, 'SF', price, labor, color, { material: 'Lawn' });
});
[['Mulch – black', '#2b2522'], ['Mulch – brown', '#5c3d2a'], ['Mulch – red', '#7a3324'], ['Mulch – cypress', '#8a6a48']].forEach(([n, color]) => {
  add(`ls-${slug(n)}`, 'landscape', 'floor', `${n} (3" deep)`, 'CY', 38, 45, color, { material: 'Mulch', depth: 3 });
});
add('ls-pine-straw', 'landscape', 'floor', 'Pine straw', 'SF', 0.25, 0.2, '#a0703e', { material: 'Pine straw' });
[['River rock 1–3"', '#9b9286', 85], ['Pea gravel', '#b9ab95', 55], ['Crushed granite', '#c7a67f', 60], ['Lava rock – red', '#7a3a2c', 120], ['White marble chips', '#ecebe6', 150], ['#57 limestone gravel', '#a9a59c', 45]].forEach(([n, color, price]) => {
  add(`ls-${slug(n)}`, 'landscape', 'floor', `${n} (3" deep)`, 'CY', price, 55, color, { material: 'Rock', depth: 3 });
});
add('ls-fabric', 'landscape', 'floor', 'Landscape fabric', 'SF', 0.15, 0.15, '#2a2a2a');
add('ls-topsoil', 'landscape', 'floor', 'Topsoil – spread & grade (4")', 'CY', 32, 40, '#4a3628', { depth: 4 });
[['Boxwood 3 gal', '#3e6b35', 2.2, 2.2, 2, 'shrub', 28, 18], ['Holly 7 gal', '#2f5a2c', 3.5, 3.5, 4, 'shrub', 65, 30], ['Azalea 3 gal', '#4c7a3a', 2.5, 2.5, 2.5, 'shrub', 30, 18],
 ['Hydrangea 3 gal', '#6f8fc1', 3, 3, 3, 'shrub', 38, 18], ['Knockout rose 3 gal', '#c4455a', 2.5, 2.5, 2.5, 'shrub', 35, 18], ['Ornamental grass 3 gal', '#a9a467', 2.5, 2.5, 3, 'shrub', 25, 15],
 ['Arborvitae 6\'', '#2f5634', 3, 3, 6, 'tree', 95, 45], ['Crape myrtle 15 gal', '#b9567a', 6, 6, 12, 'tree', 180, 75], ['Red maple 2" cal', '#9c3b2b', 10, 10, 16, 'tree', 320, 140],
 ['Live oak 3" cal', '#3d5a33', 14, 14, 18, 'tree', 450, 180], ['Japanese maple 7 gal', '#8e2f2a', 5, 5, 7, 'tree', 160, 60], ['Leyland cypress 6\'', '#335c3a', 4, 4, 7, 'tree', 85, 45],
 ['Flowering annuals (flat)', '#d98a3a', 2, 2, 1, 'shrub', 25, 15]].forEach(([n, color, w, d, hgt, objType, price, labor]) => {
  add(`ls-plant-${slug(n)}`, 'landscape', 'object', n, 'EA', price, labor, color, { w, d, h: hgt, objType });
});
add('ls-edging-steel', 'landscape', 'object', 'Steel landscape edging', 'LF', 3.5, 3, '#3a3a3a', { w: 10, d: 0.1, h: 0.33, objType: 'fence' });
add('ls-edging-stone', 'landscape', 'object', 'Stone border edging', 'LF', 8, 7, '#9d9183', { w: 10, d: 0.6, h: 0.5, objType: 'fence' });
add('ls-irrigation', 'landscape', 'labor', 'Irrigation zone (heads, pipe, valve)', 'EA', 450, 550, '#4a90c2');
add('ls-light', 'landscape', 'object', 'Landscape path light – LED', 'EA', 85, 65, '#2b2b2b', { w: 0.4, d: 0.4, h: 1.8, objType: 'cyl' });
add('ls-drain', 'landscape', 'object', 'French drain', 'LF', 9, 14, '#6c6c6c', { w: 20, d: 1, h: 0.05, objType: 'box' });

// ---------------- Patios, walks and drives (hardscape) ----------------
[['Concrete – broom finish 4"', '#bdbab3', 4, 4.5], ['Concrete – stamped & colored', '#a68d74', 7, 8], ['Concrete – exposed aggregate', '#a39a8e', 6, 6.5], ['Asphalt driveway 3"', '#2f3031', 2.6, 2.4],
 ['Gravel driveway 4"', '#a9a59c', 1.4, 1.1], ['Pavers – Holland red', '#9a4a38', 6.5, 8], ['Pavers – tumbled tan/charcoal', '#a99a83', 7, 8.5], ['Pavers – permeable gray', '#8f8e8a', 8, 9],
 ['Flagstone – Pennsylvania blue', '#6c7a85', 12, 14], ['Flagstone – Arizona buff', '#cfae84', 12, 14], ['Travertine pavers – ivory', '#e2d4b8', 11, 9], ['Brick pavers – red', '#8f3a2b', 9, 10]].forEach(([n, color, price, labor]) => {
  add(`hs-${slug(n)}`, 'hardscape', 'floor', n, 'SF', price, labor, color, { material: n.split(' –')[0].split(' ')[0] });
});
[['Retaining wall block – gray', '#8f8e8a'], ['Retaining wall block – tan', '#b39c7c'], ['Retaining wall – natural stone', '#9d9183']].forEach(([n, color]) => {
  add(`hs-${slug(n)}`, 'hardscape', 'object', `${n} (per LF, 3' tall)`, 'LF', 45, 55, color, { w: 10, d: 1, h: 3, objType: 'fence' });
});
add('hs-fire-pit', 'hardscape', 'object', 'Fire pit – stone, 4\'', 'EA', 1200, 900, '#7a746c', { w: 4, d: 4, h: 1.5, objType: 'cyl' });
add('hs-steps', 'hardscape', 'object', 'Block steps (per step, 6\' wide)', 'EA', 280, 260, '#a39a8e', { w: 6, d: 1.2, h: 0.6, objType: 'box' });

// ---------------- Decks and fences (outdoor) ----------------
[['Pressure-treated pine', '#a88a5e', 9, 12], ['Cedar', '#b4683e', 15, 13], ['Trex composite – Saddle', '#8a6a4f', 16, 13], ['Trex composite – Island Mist', '#a7a59b', 16, 13],
 ['TimberTech PVC – Coastline', '#9d978c', 19, 13], ['Ipe hardwood', '#6b4430', 24, 16]].forEach(([n, color, price, labor]) => {
  add(`od-deck-${slug(n)}`, 'outdoor', 'floor', `Deck – ${n} (framing + boards)`, 'SF', price, labor, color, { material: n.split(' –')[0] });
});
[['Wood privacy fence 6\' – pine', '#a88a5e', 18, 14, 6], ['Wood privacy fence 6\' – cedar', '#b4683e', 26, 14, 6], ['Vinyl privacy fence 6\' – white', '#f2f2ee', 32, 12, 6], ['Vinyl privacy fence 6\' – tan', '#d3c4a6', 33, 12, 6],
 ['Chain link 4\' – galvanized', '#a8adb1', 12, 9, 4], ['Chain link 6\' – black vinyl', '#2a2a2a', 18, 11, 6], ['Aluminum ornamental 4\' – black', '#1f1f1f', 30, 12, 4], ['Split rail – 3 rail', '#8a6a48', 11, 8, 4],
 ['Horizontal slat fence 6\' – cedar', '#b4683e', 38, 18, 6], ['Deck railing – composite', '#4a4a4a', 45, 25, 3]].forEach(([n, color, price, labor, hgt]) => {
  add(`od-fence-${slug(n)}`, 'outdoor', 'object', n, 'LF', price, labor, color, { w: 10, d: 0.3, h: hgt, objType: 'fence' });
});
add('od-gate', 'outdoor', 'object', 'Fence gate 4\' w/ hardware', 'EA', 280, 120, '#a88a5e', { w: 4, d: 0.3, h: 6, objType: 'fence' });
add('od-pergola', 'outdoor', 'object', 'Pergola 12×12 – cedar', 'EA', 6500, 3200, '#b4683e', { w: 12, d: 12, h: 9, objType: 'pergola' });
add('od-shed', 'outdoor', 'object', 'Storage shed 10×12', 'EA', 4200, 1500, '#c7b9a0', { w: 12, d: 10, h: 9, objType: 'box' });
add('od-pool', 'outdoor', 'object', 'In-ground pool 16×32 (allowance)', 'EA', 32000, 18000, '#4fa3c9', { w: 32, d: 16, h: 0.1, objType: 'box' });

export const LIBRARY = out;
