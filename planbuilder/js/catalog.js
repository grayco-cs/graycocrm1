// Starting product catalog. Every price here is a placeholder to edit in 📦 Catalog
// (or replace with a CSV import of your own price list). Nothing here is a supplier quote.
//
// kind:  'floor'   - priced by room floor area (SF / SY / CY at its depth); also lawns, patios, decks on outdoor areas
//        'wall'    - wall finishes: paint, drywall, siding, trim (SF / GAL / LF / SHEET)
//        'roof'    - roof covering and roof accessories (SQ / LF)
//        'opening' - doors and windows that sit in a wall (EA); w = width, h = height, sill
//        'object'  - anything you place in a room: cabinets, fixtures, appliances (EA / LF); w × d × h feet
//        'labor'   - labor or a fee added to the estimate by hand
// price = material per unit; labor = labor per unit. Line total = qty × (price + labor).

import { LIBRARY } from './library.js';

export const CATEGORIES = [
  ['flooring', 'Flooring'], ['paint', 'Paint & wall coverings'], ['drywall', 'Drywall'], ['siding', 'Siding'], ['masonry', 'Brick & stone'],
  ['trim', 'Trim & molding'], ['roofing', 'Roofing'], ['door', 'Doors'], ['window', 'Windows'],
  ['cabinet', 'Cabinets'], ['countertop', 'Countertops'], ['tile', 'Wall tile & backsplash'], ['plumbing', 'Plumbing fixtures'], ['appliance', 'Appliances'],
  ['electrical', 'Electrical'], ['landscape', 'Landscape'], ['hardscape', 'Patios, walks & drives'], ['outdoor', 'Decks, fences & outdoor'],
  ['furniture', 'Furniture'], ['commercial', 'Commercial'], ['labor', 'Labor & fees'], ['other', 'Other'],
];
export const UNITS = ['EA', 'SF', 'SY', 'LF', 'SQ', 'GAL', 'SHEET', 'CY', 'HR', 'LS'];
// Categories that finish the outside of a wall, and categories that make an area an outdoor one.
export const EXTERIOR_CATS = ['siding', 'masonry'];
export const OUTDOOR_CATS = ['landscape', 'hardscape', 'outdoor'];
export const KINDS = ['floor', 'wall', 'roof', 'opening', 'object', 'labor'];

const P = (id, category, kind, name, unit, price, labor, color, extra = {}) =>
  ({ id, category, kind, name, unit, price, labor, color, sku: '', vendor: '', notes: '', ...extra });

const BASE_CATALOG = [
  // Flooring
  P('flr-lvp-oak', 'flooring', 'floor', 'LVP plank – natural oak', 'SF', 3.25, 2.25, '#b98d5b'),
  P('flr-lvp-gray', 'flooring', 'floor', 'LVP plank – weathered gray', 'SF', 3.25, 2.25, '#9a958c'),
  P('flr-carpet', 'flooring', 'floor', 'Carpet w/ pad – mid grade', 'SY', 28, 9, '#c9bfae'),
  P('flr-tile-porc', 'flooring', 'floor', 'Porcelain tile 12×24', 'SF', 4.5, 6.5, '#e5e1d8'),
  P('flr-hardwood', 'flooring', 'floor', 'Site-finished oak hardwood', 'SF', 6.5, 5, '#a8733f'),
  P('flr-vct', 'flooring', 'floor', 'VCT commercial tile', 'SF', 1.6, 1.9, '#d8d4c8'),
  P('flr-sealed-conc', 'flooring', 'floor', 'Sealed concrete', 'SF', 0.6, 1.4, '#b4b4ae'),
  // Paint & drywall (walls)
  P('pnt-int-white', 'paint', 'wall', 'Interior paint – 2 coats, white', 'SF', 0.35, 0.95, '#f3f1ea'),
  P('pnt-int-greige', 'paint', 'wall', 'Interior paint – 2 coats, greige', 'SF', 0.35, 0.95, '#d6cfc2'),
  P('pnt-int-blue', 'paint', 'wall', 'Interior paint – 2 coats, harbor blue', 'SF', 0.35, 0.95, '#8ea5b8'),
  P('pnt-ceiling', 'paint', 'wall', 'Ceiling paint – flat white', 'SF', 0.3, 0.85, '#fbfbf8'),
  P('dw-half', 'drywall', 'wall', 'Drywall 1/2" – hang, tape, finish', 'SF', 0.65, 1.85, '#eeeeee'),
  P('dw-5-8x', 'drywall', 'wall', 'Drywall 5/8" Type X – hang, tape, finish', 'SF', 0.8, 1.95, '#e8e8e8'),
  // Exterior
  P('sid-vinyl', 'siding', 'wall', 'Vinyl siding – Dutch lap', 'SF', 2.4, 2.6, '#d9d4c5'),
  P('sid-hardie', 'siding', 'wall', 'Fiber cement lap siding – painted', 'SF', 4.2, 4.8, '#6f7f86'),
  P('sid-brick', 'siding', 'wall', 'Brick veneer', 'SF', 9, 12, '#9c4a36'),
  P('sid-stucco', 'siding', 'wall', 'Stucco – 3 coat', 'SF', 4, 6.5, '#e2d6bf'),
  P('sid-metal-panel', 'siding', 'wall', 'Metal wall panel', 'SF', 4.5, 3.5, '#8d969b'),
  // Trim
  P('trm-base', 'trim', 'wall', 'Baseboard 3-1/4" – paint grade', 'LF', 1.4, 2.1, '#ffffff'),
  // Roofing
  P('rf-arch-shingle', 'roofing', 'roof', 'Architectural shingle (incl. felt)', 'SQ', 165, 135, '#4a4a4a'),
  P('rf-arch-brown', 'roofing', 'roof', 'Architectural shingle – weathered wood', 'SQ', 165, 135, '#6b5444'),
  P('rf-metal-ss', 'roofing', 'roof', 'Standing seam metal 24 ga', 'SQ', 520, 380, '#4f5e6a'),
  P('rf-tpo', 'roofing', 'roof', 'TPO 60 mil, mechanically attached', 'SQ', 380, 340, '#eceff1'),
  P('rf-tearoff', 'roofing', 'roof', 'Remove roofing – per layer, haul off', 'SQ', 0, 68, '#777777', { roofPart: 'tearoff' }),
  P('rf-ridge', 'roofing', 'roof', 'Ridge / hip cap', 'LF', 3.2, 2.4, '#3c3c3c', { roofPart: 'ridgecap' }),
  P('rf-drip', 'roofing', 'roof', 'Drip edge', 'LF', 1.1, 0.9, '#d0d0d0', { roofPart: 'drip' }),
  P('rf-starter', 'roofing', 'roof', 'Starter strip', 'LF', 0.9, 0.6, '#3c3c3c', { roofPart: 'starter' }),
  P('rf-ice', 'roofing', 'roof', 'Ice & water shield (eaves, valleys)', 'LF', 2.1, 1.0, '#2a2a2a', { roofPart: 'ice' }),
  P('rf-gutter', 'roofing', 'roof', 'Seamless aluminum gutter 5"', 'LF', 4.5, 4.0, '#f0f0f0', { roofPart: 'gutter' }),
  // Doors & windows
  P('dr-int-6p', 'door', 'opening', 'Interior door 6-panel, prehung', 'EA', 165, 120, '#f5f5f0', { w: 2.67, h: 6.67, sill: 0, openingType: 'door' }),
  P('dr-int-2-4', 'door', 'opening', 'Interior door 2/4 (closet/bath), prehung', 'EA', 150, 120, '#f5f5f0', { w: 2.33, h: 6.67, sill: 0, openingType: 'door' }),
  P('dr-ext-steel', 'door', 'opening', 'Exterior steel door 3/0 w/ lockset', 'EA', 420, 260, '#2f3e4e', { w: 3, h: 6.67, sill: 0, openingType: 'door' }),
  P('dr-patio', 'door', 'opening', 'Sliding patio door 6/0', 'EA', 980, 380, '#ffffff', { w: 6, h: 6.67, sill: 0, openingType: 'slider' }),
  P('dr-garage-16', 'door', 'opening', 'Garage door 16×7 insulated w/ opener', 'EA', 1650, 650, '#e8e6e0', { w: 16, h: 7, sill: 0, openingType: 'garage' }),
  P('dr-sf-storefront', 'commercial', 'opening', 'Aluminum storefront door 3/0 × 7/0', 'EA', 2400, 900, '#3a3f44', { w: 3, h: 7, sill: 0, openingType: 'door' }),
  P('op-cased', 'door', 'opening', 'Cased opening (no door)', 'EA', 60, 140, '#ffffff', { w: 4, h: 6.67, sill: 0, openingType: 'opening' }),
  P('wn-sh-3050', 'window', 'opening', 'Vinyl single-hung 3050', 'EA', 310, 165, '#ffffff', { w: 3, h: 5, sill: 2.5, openingType: 'window' }),
  P('wn-sh-2440', 'window', 'opening', 'Vinyl single-hung 2440 (bath)', 'EA', 245, 150, '#ffffff', { w: 2, h: 4, sill: 3.5, openingType: 'window' }),
  P('wn-pic-6050', 'window', 'opening', 'Vinyl picture window 6050', 'EA', 520, 210, '#ffffff', { w: 6, h: 5, sill: 2, openingType: 'window' }),
  P('wn-storefront', 'commercial', 'opening', 'Storefront glazing 8×9', 'EA', 3800, 1200, '#3a3f44', { w: 8, h: 9, sill: 0.5, openingType: 'window' }),
  // Cabinets & counters
  P('cab-base', 'cabinet', 'object', 'Base cabinet 24" deep (per LF)', 'LF', 210, 45, '#e9e4da', { w: 3, d: 2, h: 3, objType: 'base' }),
  P('cab-wall', 'cabinet', 'object', 'Wall cabinet 12" deep (per LF)', 'LF', 165, 40, '#e9e4da', { w: 3, d: 1, h: 2.5, elev: 4.5, objType: 'upper' }),
  P('cab-tall', 'cabinet', 'object', 'Pantry cabinet 84"', 'EA', 820, 120, '#e9e4da', { w: 2, d: 2, h: 7, objType: 'box' }),
  P('cab-island', 'cabinet', 'object', 'Kitchen island 6×3 w/ top', 'EA', 2600, 450, '#556070', { w: 6, d: 3, h: 3, objType: 'base' }),
  P('cab-vanity', 'cabinet', 'object', 'Bath vanity 36" w/ top & sink', 'EA', 640, 220, '#ffffff', { w: 3, d: 1.75, h: 2.83, objType: 'base' }),
  P('ctr-quartz', 'cabinet', 'object', 'Quartz countertop (per LF, 25")', 'LF', 85, 25, '#ece9e4', { w: 3, d: 2.08, h: 0.1, elev: 3, objType: 'box' }),
  // Plumbing
  P('pl-toilet', 'plumbing', 'object', 'Toilet – elongated', 'EA', 285, 185, '#ffffff', { w: 1.6, d: 2.4, h: 2.5, objType: 'toilet' }),
  P('pl-tub', 'plumbing', 'object', 'Bathtub 60" w/ surround', 'EA', 720, 650, '#ffffff', { w: 5, d: 2.5, h: 1.6, objType: 'tub' }),
  P('pl-shower', 'plumbing', 'object', 'Shower 48×36 w/ tile & glass', 'EA', 1900, 2200, '#dfe8ec', { w: 4, d: 3, h: 7, objType: 'shower' }),
  P('pl-ksink', 'plumbing', 'object', 'Kitchen sink & faucet', 'EA', 380, 260, '#c9cdd1', { w: 2.75, d: 1.75, h: 0.6, elev: 2.6, objType: 'box' }),
  P('pl-wh', 'plumbing', 'object', 'Water heater 50 gal', 'EA', 1150, 550, '#d8dadc', { w: 2, d: 2, h: 5, objType: 'cyl' }),
  // Appliances
  P('ap-fridge', 'appliance', 'object', 'Refrigerator 36" French door', 'EA', 2100, 75, '#c8ccd0', { w: 3, d: 2.5, h: 5.9, objType: 'box' }),
  P('ap-range', 'appliance', 'object', 'Range 30" electric', 'EA', 950, 90, '#2d2f31', { w: 2.5, d: 2.2, h: 3, objType: 'box' }),
  P('ap-dw', 'appliance', 'object', 'Dishwasher 24"', 'EA', 720, 160, '#c8ccd0', { w: 2, d: 2, h: 2.85, objType: 'box' }),
  P('ap-micro', 'appliance', 'object', 'Over-range microwave', 'EA', 420, 110, '#2d2f31', { w: 2.5, d: 1.3, h: 1.4, elev: 4.8, objType: 'box' }),
  P('ap-wd', 'appliance', 'object', 'Washer + dryer pair', 'EA', 1800, 120, '#f2f2f2', { w: 5.5, d: 2.5, h: 3.2, objType: 'box' }),
  P('ap-hvac', 'appliance', 'object', 'HVAC condenser 3 ton', 'EA', 3800, 1900, '#bfc4c8', { w: 3, d: 3, h: 3, objType: 'box' }),
  // Electrical
  P('el-recessed', 'electrical', 'object', 'Recessed LED light', 'EA', 28, 85, '#ffffff', { w: 0.5, d: 0.5, h: 0.1, elev: 8.9, objType: 'cyl' }),
  P('el-fan', 'electrical', 'object', 'Ceiling fan w/ light', 'EA', 220, 160, '#7a6a58', { w: 4.3, d: 4.3, h: 0.6, elev: 8, objType: 'cyl' }),
  P('el-panel', 'electrical', 'object', 'Electrical panel 200A', 'EA', 1400, 2200, '#9aa0a6', { w: 1.2, d: 0.4, h: 3, elev: 3, objType: 'box' }),
  // Furniture (for presentation only; zero price by default)
  P('fn-sofa', 'furniture', 'object', 'Sofa (display only)', 'EA', 0, 0, '#5b6b7d', { w: 7, d: 3, h: 2.8, objType: 'box' }),
  P('fn-bed-q', 'furniture', 'object', 'Queen bed (display only)', 'EA', 0, 0, '#e0d6c8', { w: 5, d: 6.7, h: 2, objType: 'box' }),
  P('fn-table', 'furniture', 'object', 'Dining table (display only)', 'EA', 0, 0, '#8a6a4a', { w: 6, d: 3.5, h: 2.5, objType: 'box' }),
  P('fn-desk', 'furniture', 'object', 'Office desk (display only)', 'EA', 0, 0, '#7d6b58', { w: 5, d: 2.5, h: 2.5, objType: 'box' }),
  // Commercial
  P('cm-act', 'commercial', 'floor', 'Acoustic ceiling tile 2×2 grid', 'SF', 2.1, 2.4, '#f4f4f0', { ceiling: true }),
  P('cm-ada-wc', 'commercial', 'object', 'ADA toilet w/ grab bars', 'EA', 680, 420, '#ffffff', { w: 1.6, d: 2.5, h: 2.5, objType: 'toilet' }),
  P('cm-partition', 'commercial', 'object', 'Toilet partition (per stall)', 'EA', 950, 350, '#8b97a1', { w: 3, d: 5, h: 6, objType: 'box' }),
  P('cm-reception', 'commercial', 'object', 'Reception counter 8 LF', 'EA', 4200, 900, '#4a5560', { w: 8, d: 2.5, h: 3.5, objType: 'base' }),
  // Labor & fees (added on the estimate)
  P('lb-demo', 'labor', 'labor', 'Demolition / tear-out', 'SF', 0, 1.75, '#999999'),
  P('lb-dumpster', 'labor', 'labor', 'Dumpster 30 yd', 'EA', 650, 0, '#999999'),
  P('lb-permit', 'labor', 'labor', 'Permit & inspections', 'LS', 850, 0, '#999999'),
  P('lb-super', 'labor', 'labor', 'Supervision', 'HR', 0, 65, '#999999'),
];

export const DEFAULT_CATALOG = BASE_CATALOG.concat(LIBRARY.filter(p => !BASE_CATALOG.some(b => b.id === p.id)));

export function findProduct(catalog, id) { return catalog.find(p => p.id === id) || null; }
export function categoryName(id) { const c = CATEGORIES.find(c => c[0] === id); return c ? c[1] : id; }

// CSV columns, in order. Same columns are written by export and read by import.
export const CSV_COLUMNS = ['id', 'category', 'kind', 'name', 'brand', 'colorName', 'finish', 'material', 'unit', 'price', 'labor', 'color', 'sku', 'vendor', 'w', 'd', 'h', 'sill', 'elev', 'depth', 'openingType', 'objType', 'roofPart', 'xmCode', 'notes'];

export function toCSV(rows, cols) {
  const q = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n');
}
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}
// Products from a CSV price list. Unknown columns are ignored; missing ids get one made from the name.
export function catalogFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { products: [], errors: ['The file has no rows under the header.'] };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const at = c => head.indexOf(c.toLowerCase());
  const errors = [], products = [];
  const num = ['price', 'labor', 'w', 'd', 'h', 'sill', 'elev', 'depth'];
  rows.slice(1).forEach((r, i) => {
    const p = {};
    CSV_COLUMNS.forEach(c => { const k = at(c); if (k >= 0) p[c] = (r[k] || '').trim(); });
    if (!p.name) { errors.push(`Row ${i + 2}: no name, skipped.`); return; }
    num.forEach(c => { if (p[c] === '' || p[c] == null) delete p[c]; else { const v = parseFloat(String(p[c]).replace(/[$,]/g, '')); if (isFinite(v)) p[c] = v; else { errors.push(`Row ${i + 2}: ${c} "${p[c]}" is not a number.`); delete p[c]; } } });
    if (!p.id) p.id = 'csv-' + p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!p.kind) p.kind = 'object';
    if (!p.unit) p.unit = 'EA';
    if (!p.category) p.category = 'other';
    if (!/^#[0-9a-f]{6}$/i.test(p.color || '')) p.color = '#b0b0b0';
    if (p.price == null) p.price = 0;
    if (p.labor == null) p.labor = 0;
    ['openingType', 'objType', 'roofPart', 'sku', 'vendor', 'notes', 'brand', 'colorName', 'finish', 'material', 'xmCode'].forEach(c => { if (p[c] === '') delete p[c]; });
    products.push(p);
  });
  return { products, errors };
}
