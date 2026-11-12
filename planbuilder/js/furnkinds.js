// What kind of 3D piece a product is, and which Show ▾ group it belongs to (no 3D code here, so tests can load it).

// What to draw for a product: the product's own objType, refined by its name.
export function refine(p) {
  if (!p) return 'box';
  const n = (p.name || '').toLowerCase(), t = p.objType || 'box';
  const R = [
    [/refrigerator|fridge/, 'fridge'], [/microwave/, 'microwave'], [/dishwasher/, 'dishwasher'], [/\brange\b|cooktop|oven|stove/, 'range'],
    [/washer|dryer/, 'laundry'], [/condenser|heat pump/, 'condenser'], [/water heater/, 'waterheater'], [/electrical panel/, 'epanel'],
    [/ceiling fan/, 'fan'], [/recessed/, 'recessed'], [/sconce/, 'sconce'], [/chandelier/, 'chandelier'],
    [/tv console|media console/, 'console'], [/nightstand/, 'nightstand'], [/dresser/, 'dresser'], [/bench/, 'bench'], [/lounge/, 'lounge'],
    [/pantry/, 'pantry'], [/vanity/, 'vanity'], [/office chair/, 'officechair'], [/dining chair/, 'diningchair'],
    [/coffee table/, 'coffeetable'], [/side table|end table/, 'sidetable'], [/desk/, 'desk'], [/patio table/, 'patioset'], [/table lamp/, 'tablelamp'],
  ];
  if (t === 'box' && /sink/.test(n)) return 'sink';
  if (t === 'box' && p.category === 'furniture') {   // older "display only" pieces saved as plain boxes
    if (/sofa|couch|loveseat|sectional/.test(n)) return 'sofa';
    if (/\bbed\b/.test(n)) return 'bed';
    if (/dining table/.test(n)) return 'table';
  }
  for (const [re, k] of R) if (re.test(n)) return k;
  if (t === 'chair') return 'armchair';
  if (t === 'table') return p.round ? 'roundtable' : 'table';
  if (t === 'lamp') return 'floorlamp';
  return t;
}

// Which "Show" group a piece belongs to (3D toolbar → Show ▾).
export const SHOW_GROUPS = [
  ['furniture', 'Furniture'], ['art', 'Wall art & mirrors'], ['rugs', 'Rugs'], ['plants', 'Plants'], ['lights', 'Lights & fans'],
  ['kitchen', 'Kitchen & bath (cabinets, fixtures, appliances)'], ['yard', 'Yard & outdoor'],
];
export function showGroup(p) {
  if (!p) return 'other';
  const k = refine(p), c = p.category;
  if (k === 'art' || k === 'mirror' || (k === 'tv' && c === 'furniture')) return k === 'tv' ? 'furniture' : 'art';
  if (k === 'rug') return 'rugs';
  if (k === 'plant') return 'plants';
  if (['floorlamp', 'tablelamp', 'pendant', 'chandelier', 'sconce', 'fan', 'recessed', 'lamp'].includes(k)) return 'lights';
  if (['landscape', 'hardscape', 'outdoor'].includes(c) || ['patioset', 'lounge'].includes(k)) return 'yard';
  if (['cabinet', 'countertop', 'plumbing', 'appliance', 'tile'].includes(c)) return 'kitchen';
  if (c === 'furniture') return 'furniture';
  return 'other';
}

