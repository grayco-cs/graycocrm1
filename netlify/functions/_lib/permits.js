/* netlify/functions/_lib/permits.js — patch PERMITS (owner 11/12: "Can we go through building permits filed in Arkansas, TN, Mississippi in
   the leads scan … put these in owner setup and do whatever you can to make these active and scan in leads").
   The pure part of 🏗️ Permitted jobs (no network, no database): the settings and their defaults, the two adapters (Nashville's
   public ArcGIS feed, the paid Shovels API) that turn a raw permit into ONE shape, and the filter that says whether a
   permit is a lead for GrayCo, why (reason chips) and for which company (Construction / Mitigation / Environmental).
   netlify/functions/permit-watch.js does the fetching and the storing; tools/tests/test_PERMITS.js tests this file. */
'use strict';
const EW = require('./envwords.js');   /* patch LEADBOTH: the ☢️ asbestos / lead / mold words */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function num(v){ const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : null; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function title(v){ return s(v).toLowerCase().replace(/\b([a-z])/g, function(m){ return m.toUpperCase(); }); }

/* ── the built-in ZIP list by county (picking ZIPs in the CRM never asks Shovels, so it costs no credits).
   [group, label, ZIPs, on by default]. Davidson Co. is free through Metro Nashville's own feed, so it is off for Shovels. ── */
const ZIP_GROUPS = [
  ['Memphis / Shelby Co., TN', ['38103', '38104', '38105', '38106', '38107', '38108', '38109', '38111', '38112', '38114', '38115', '38116', '38117', '38118', '38119', '38120', '38122', '38125', '38126', '38127', '38128', '38131', '38132', '38141'], true],
  ['Bartlett / Cordova / Germantown / Collierville, TN (Shelby Co.)', ['38133', '38134', '38135', '38138', '38139', '38016', '38018', '38017'], true],
  ['Arlington / Lakeland / Millington, TN (Shelby Co.)', ['38002', '38053', '38028'], true],
  ['DeSoto Co., MS (Southaven, Olive Branch, Horn Lake, Hernando)', ['38671', '38672', '38654', '38637', '38632', '38651', '38680', '38641'], true],
  ['Little Rock / North Little Rock, AR (Pulaski Co.)', ['72201', '72202', '72204', '72205', '72206', '72207', '72209', '72210', '72211', '72212', '72223', '72227', '72114', '72116', '72117', '72118', '72120', '72113', '72076'], true],
  ['Jonesboro, AR (Craighead Co.)', ['72401', '72404', '72416', '72417', '72437', '72411', '72419', '72447'], true],
  /* patch PERMITS3 (owner-approved item 5): the rest of the nearby counties — ON by default since 11/19 (owner: "turn those new areas on, Tipton, Marshall etc"); they only add ZIPs to the Shovels list and the free feeds (no cost without a Shovels key); untick them in Owner setup → 🏗️ Permit areas */
  ['Tipton Co., TN (Covington, Atoka, Munford, Brighton)', ['38004', '38011', '38015', '38019', '38023', '38049', '38058', '38071'], true],
  ['Fayette Co., TN (Oakland, Somerville, Rossville, Moscow)', ['38036', '38039', '38042', '38046', '38048', '38057', '38060', '38066', '38068', '38076'], true],
  ['Marshall Co., MS (Holly Springs, Byhalia, Potts Camp)', ['38611', '38635', '38642', '38649', '38659', '38661', '38685'], true],
  ['Crittenden Co., AR (West Memphis, Marion, Earle)', ['72301', '72303', '72327', '72331', '72332', '72339', '72364', '72376', '72384'], true],
  ['Nashville / Davidson Co., TN — free from Metro already', ['37201', '37203', '37204', '37205', '37206', '37207', '37208', '37209', '37210', '37211', '37212', '37213', '37214', '37215', '37216', '37217', '37218', '37219', '37220', '37221', '37013', '37072', '37076', '37080', '37115', '37138', '37189'], false]
];
const DEFAULT_ZIPS = ZIP_GROUPS.reduce(function(a, g){ return g[2] ? a.concat(g[1]) : a; }, []);
/* Shovels' permit tags we know (from its tag list) — picked in the CRM; "-" in front = leave out */
const SHOVELS_TAGS = [['new_construction', 'New construction'], ['addition', 'Addition'], ['adu', 'ADU'], ['kitchen', 'Kitchen'], ['bathroom', 'Bathroom'], ['roofing', 'Roofing'], ['window_door', 'Window / door'],
  ['solar', 'Solar'], ['hvac', 'HVAC'], ['water_heater', 'Water heater'], ['pool_and_hot_tub', 'Pool / hot tub']];
function areaOfZip(zip, custom){
  const z = s(zip).slice(0, 5);
  for (let i = 0; i < ZIP_GROUPS.length; i++) if (ZIP_GROUPS[i][1].indexOf(z) > -1) return ZIP_GROUPS[i][0];
  const cg = arr(custom); for (let i = 0; i < cg.length; i++) if (arr(cg[i][1]).indexOf(z) > -1) return s(cg[i][0]);   /* patch PERMITS3: an admin's own area */
  if (/^37[0-2]/.test(z)) return 'Nashville area, TN';
  if (/^3[78]/.test(z)) return 'Tennessee';
  if (/^38[6-9]|^39/.test(z)) return 'Mississippi';
  if (/^7[12]/.test(z)) return 'Arkansas';
  return z ? 'ZIP ' + z : '';
}

/* ── the settings (gc_permit_settings) ── */
const INCLUDE = [
  /* owner 11/12: "only Nashville permits for large commercial projects — no residential — $1 million+ GC jobs: hotels, hospitals,
     multi-family, senior living etc., large jobs only" → commercial + multifamily on, everything residential / small off */
  ['commercialNew', 'Commercial — new buildings', true],
  ['commercialRehab', 'Commercial — rehab / remodel / tenant finish / addition', true],
  ['multifamily', 'Multifamily — 3+ units (apartments, condos)', true],
  ['residentialRehab', 'Residential — rehab / remodel / addition', false],
  ['residentialNew', 'Residential — new houses', false],
  ['demolition', 'Demolition (asbestos survey → Environmental; any value)', false],
  ['roofing', 'Roofing (any value)', false],
  ['repair', 'Fire / water / storm / mold / asbestos / repair words (any value)', false],
  ['environmental', 'Environmental: asbestos / lead / mold (any value)', true],   /* patch LEADBOTH (owner 11/12: "scan for those words" — abatement permits are often small) */
  /* patch PERMITS3 (owner-approved item 4: more kinds, by company) */
  ['mitigation', 'Mitigation: fire / water / storm damage repairs and storm roofs (any value)', true],
  ['oldBuilding', 'Environmental: renovation / demolition of a building from before 1980 (when the year is known; any value)', true],
  ['planning', 'Construction: planning applications — site plans, planned developments (before the permit; no value listed)', true]
];
/* the kinds of building (a chip on the permit; each can be left out in ⚙ Filters) — the first that fits */
const USES = [
  ['senior', '🧓 Senior living', /\b(?:senior|assisted[- ]living|nursing|memory care|retirement|elderly|independent living|continuing care)\b/],
  ['hospital', '🏥 Hospital / medical', /hospital|medical|clinic|surg(?:ery|ical)|health ?care|dental|outpatient|urgent care|institutional i-2|animal hospital/],
  ['hotel', '🏨 Hotel', /\b(?:hotel|motel|lodging|hospitality)\b/],
  ['school', '🏫 School / college', /school|college|university|educational|academy|day ?care|classroom|lecture|dormitor/],
  ['mixed', '🏙 Mixed-use', /mixed[- ]use/],
  ['multifamily', '🏘 Multifamily', /multi-?family|apartment|\bapts?\b|condo\w*|tri-?plex|four-?plex|fourplex|\bquad\b|\b(?:[3-9]|\d{2,})\s*units?\b|> ?5 unit/],
  ['office', '🏢 Office', /\boffices?\b|professional services|bank|financial institution/],
  ['retail', '🛍 Retail / restaurant', /retail|\bstores?\b|shopping|restaurant|mercantile|grocery|\bbar\b|nightclub|tavern|market/],
  ['industrial', '🏭 Industrial / warehouse', /industrial|warehouse|manufactur|factory|distribution|storage s-1|motor freight|wholesale|hazardous \(h/],
  ['church', '⛪ Church', /church|worship|religious|fellowship hall/],
  ['civic', '🏛 Civic / government', /civic|government|fire (?:&|and) police|police station|fire station|library|museum|cultural|recreation center|arena|airport/]
];
const DEFAULT_EXCLUDE = ['sign', 'fence', 'pool', 'solar', 'deck', 'shed', 'tent', 'carport', 'food truck', 'electrical only', 'hvac only', 'irrigation', 'retaining wall', 'grading'];   /* PERMITS3: + irrigation / retaining wall / grading (Little Rock's file) */
function defaults(){
  const inc = {}; INCLUDE.forEach(function(x){ inc[x[0]] = x[2]; });
  const uses = {}; USES.forEach(function(u){ uses[u[0]] = true; });
  return { v: 1, include: inc, uses: uses, exclude: DEFAULT_EXCLUDE.slice(), minValue: 1000000, maxAgeDays: 14,
    nashville: { on: true },
    memphis: { on: true, windowDays: 45 }, littlerock: { on: true, windowDays: 30 }, collierville: { on: true, windowDays: 120 },   /* patch PERMITS3: the free feeds found */
    customGroups: [],
    shovels: { on: false, auto: false, zips: DEFAULT_ZIPS.slice(), tags: ['-solar', '-pool_and_hot_tub', '-hvac', '-water_heater'], q: '', minJobValue: 1000000, windowDays: 14, perRun: 25, budget: 500 } };
}
function clean(v){
  const d = defaults(); v = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const inc = {}; INCLUDE.forEach(function(x){ const k = x[0]; inc[k] = v.include && typeof v.include[k] === 'boolean' ? v.include[k] : d.include[k]; });
  const ex = Array.isArray(v.exclude) ? v.exclude.map(low).map(function(w){ return w.replace(/[^a-z0-9 &/'-]/g, '').replace(/\s+/g, ' ').trim(); }).filter(function(w, i, a){ return w && w.length <= 40 && a.indexOf(w) === i; }).slice(0, 60) : d.exclude;
  const mv = num(v.minValue), age = num(v.maxAgeDays);
  const sh = v.shovels && typeof v.shovels === 'object' ? v.shovels : {};
  let zips = Array.isArray(sh.zips) ? sh.zips : (typeof sh.zips === 'string' ? sh.zips.split(/[\s,;]+/) : null);
  zips = zips ? zips.map(function(z){ return s(z).slice(0, 5); }).filter(function(z, i, a){ return /^\d{5}$/.test(z) && a.indexOf(z) === i; }).slice(0, 200) : d.shovels.zips;
  const per = num(sh.perRun != null ? sh.perRun : sh.maxPerRun), bud = num(sh.budget), win = num(sh.windowDays), mjv = num(sh.minJobValue);
  let tags = Array.isArray(sh.tags) ? sh.tags : (typeof sh.tags === 'string' ? sh.tags.split(/[\s,;]+/) : null);
  tags = tags ? tags.map(low).filter(function(x, i, a){ return /^-?[a-z0-9_]{2,40}$/.test(x) && a.indexOf(x) === i; }).slice(0, 20) : d.shovels.tags;
  const uses = {}; USES.forEach(function(u){ uses[u[0]] = v.uses && typeof v.uses[u[0]] === 'boolean' ? v.uses[u[0]] : true; });
  const out = { v: 1, include: inc, uses: uses, exclude: ex,
    minValue: mv == null ? d.minValue : Math.max(0, Math.min(1e9, Math.round(mv))),
    maxAgeDays: age == null ? d.maxAgeDays : Math.max(1, Math.min(90, Math.round(age))),
    nashville: { on: !(v.nashville && v.nashville.on === false) },
    memphis: feedClean(v.memphis, d.memphis), littlerock: feedClean(v.littlerock, d.littlerock), collierville: feedClean(v.collierville, d.collierville),
    customGroups: groupsClean(v.customGroups),
    shovels: { on: sh.on === true, auto: sh.auto === true, zips: zips, tags: tags, q: clip(sh.q, 50).replace(/[\u0000-\u001f]/g, ''),
      minJobValue: mjv == null ? d.shovels.minJobValue : Math.max(0, Math.min(1e9, Math.round(mjv))),
      windowDays: win == null ? d.shovels.windowDays : Math.max(1, Math.min(90, Math.round(win))),
      perRun: per == null ? d.shovels.perRun : Math.max(1, Math.min(1000, Math.round(per))),
      budget: bud == null ? d.shovels.budget : Math.max(0, Math.min(1e7, Math.round(bud))) } };
  if (s(v.updatedAt)) out.updatedAt = s(v.updatedAt);
  if (s(v.updatedBy)) out.updatedBy = clip(v.updatedBy, 80);
  return out;
}

/* patch PERMITS3: a free feed's switch and window (how many days back it is read; the Memphis feed is updated about once a week) */
function feedClean(v, d){ v = v && typeof v === 'object' ? v : {}; const w = num(v.windowDays); return { on: v.on === false ? false : d.on !== false, windowDays: w == null ? d.windowDays : Math.max(7, Math.min(365, Math.round(w))) }; }
/* patch PERMITS3: an admin's own areas — [name, [ZIPs], on] (Owner setup → 🏗️ Permit areas) */
function groupsClean(v){
  return arr(v).map(function(g){
    const name = clip(Array.isArray(g) ? g[0] : g && g.name, 80).replace(/[\u0000-\u001f<>]/g, '');
    let z = Array.isArray(g) ? g[1] : g && g.zips; z = Array.isArray(z) ? z : s(z).split(/[\s,;]+/);
    z = z.map(function(x){ return s(x).slice(0, 5); }).filter(function(x, i, a){ return /^\d{5}$/.test(x) && a.indexOf(x) === i; }).slice(0, 200);
    return name && z.length ? [name, z, !!(Array.isArray(g) ? g[2] : g && g.on)] : null;
  }).filter(Boolean).filter(function(g, i, a){ return a.findIndex(function(x){ return low(x[0]) === low(g[0]); }) === i && !ZIP_GROUPS.some(function(b){ return low(b[0]) === low(g[0]); }); }).slice(0, 30);
}
function allGroups(S){ return ZIP_GROUPS.concat(arr(S && S.customGroups).map(function(g){ return [g[0], g[1], g[2], true]; })); }

/* ── the words ── */
const RX = {
  fire: /\bfire[- ]?(?:damaged?|loss|restor\w*|repair\w*)\b|\b(?:burn(?:ed|t)[- ]out|fire[- ]burned|charred)\b|\bsmoke\b(?![\s-]*(?:detectors?|alarms?|evac\w*|dampers?|vents?|control|exhaust|free|shop))|\bfire\b(?![\s-]*(?:alarms?|sprinklers?|suppression|protection|pits?|places?|escapes?|rated|rating|resistan\w*|walls?|separation|lanes?|hydrants?|pumps?|department|dept|marshal\w*|code|stop\w*|block\w*|caulk\w*|proof\w*|extinguish\w*|retardant|barriers?|partitions?|doors?|dampers?|watch|stations?|house|trucks?|safety|life|&|and police|\/|access|apparatus|flow|line|command|panel))/,
  water: /\bwater[- ]?(?:damaged?|loss|intrusion|leak\w*|infiltration|extraction|mitigation)\b|(?<!(?:event|case) of (?:an? )?)\bflood(?:ed|ing|s)?\b(?![\s-]*(?:plain|zone|way|lights?|lighting|vent\w*|elevation|proof\w*))|\bburst (?:pipes?|lines?)|\bpipes? burst|\bsewage\b|\bsewer back-?up|\bleak damage/,
  storm: /\bstorm\b(?![\s-]*(?:water|drain\w*|sewers?|shelters?|doors?|windows?|safe|rooms?|pipes?|inlets?|lines?|system\w*|structures?))|\bhail\b|\bwind\b(?![\s-]*(?:loads?|speeds?|rated|rating|turbines?|zones?|exposure|design|bracing|uplift))|\btree\s*(?:fell|fall\w*|damage\w*|on (?:the )?(?:house|home|roof|structure|building|garage|dwelling)|struck|through|limb)|\bfallen trees?\b|\btornado\w*|\bstraight[- ]line winds?|\b(?:damage[sd]?|caused|broken?|struck|hit)\s+(?:\w+\s+){0,2}by\s+(?:an?\s+|the\s+)?(?:fallen\s+|large\s+)?trees?\b|\btrees?\b[^.;]{0,40}\b(?:fell|fallen|broke|landed|crashed)\b|\btree\s+(?:limbs?|branch\w*)\b/,   /* PERMITS3: "damage caused by tree", "a tree in the yard fell" */
  collapse: /\bcollaps\w*/,
  env: /\bmou?ld\b|\basbestos\b|\blead[- ](?:based|paint|abatement|hazards?|remediation)\b|\babatement\b(?!\s*(?:case|order|notice|district))|\b(?:environmental|hazmat|hazardous|pcb|radon)\s+(?:remediation|removal|abatement|clean-?up)\b/,   /* "abatement case #" = a Metro codes nuisance case */
  repair: /\brepair\w*/,
  demoType: /\bdemoli\w*|\bdemo permit\b|\bwreck\w*/,
  demoText: /\b(?:demolish\w*|raze|razing|total demo\w*|full demo\w*|demolition of (?:an? |the )?(?:existing )?(?:single|sfr|house|home|building|structure|residence|dwelling|commercial|duplex|garage)|demo (?:of )?(?:the )?(?:existing )?(?:house|home|building|structure|residence|sfr|dwelling))\b/,
  roofType: /\broof\w*|\bre-?roof\w*/,
  roofText: /\b(?:re-?roof\w*|roof\w* (?:replace\w*|repair\w*|over|tear[- ]?off|covering)|(?:replace\w*|new|install\w*) (?:the )?(?:existing )?(?:metal |shingle |tpo |flat |membrane )?roof\w*|roofing|shingles?)\b/,
  rtu: /\broof\s*-?\s*top\s+(?:units?|hvac|equipment|a\/?c|mechanical|condens\w*|curbs?)|\brtus?\b/g,
  multi: /multi-?family|apartment|\bapts?\b|condo\w*|townho(?:me|use)s?|tri-?plex|four-?plex|fourplex|\bquad\b|\b(?:[3-9]|\d{2,})\s*units?\b/,   /* a duplex is a two-family house (residential) */
  comm: /\b(?:commercial|industrial|tenant|retail|office|warehouse|restaurant|hotel|motel|church|religious|school|hospital|clinic|medical|bank|stores?|shopping|assembly|mercantile|business|factory|manufactur\w*|institutional|educational)/,
  isNew: /\bnew\b|\bshell\b|\bfoundation\b|ground[- ]up|new construction|construct (?:a )?new/,
  rehab: /rehab\w*|remodel\w*|renovat\w*|alter\w*|tenant finish|finish[- ]?out|build[- ]?out|addition|interior|repair\w*|restor\w*|fire damage|storm damage|change of use|up-?fit|tenant improvement|\bti\b|convert\w*|conversion|replace\w*/,
  admin: /amend(?:ed|ment)? permit|change contractor|use (?:&|and) occupancy|certificate of occupancy|master permit|mobile food|food truck|temporary (?:tent|structure)|special event/,
  /* patch PERMITS3: words that only look like a finding (a trim piece, a "no …", a checklist) */
  envScrub: /\bbrick[\s-]*mou?lds?\b|\bno\s+(?:known\s+)?(?:hazardous\s+materials?|haz[\s-]?mat|asbestos|mou?ld|lead)\b|\b(?:inspection|inspect|check(?:ing)?)\s+for\s+[^.;:]{0,70}/g,
  /* patch PERMITS3: the kinds of work (chips + the score) */
  addition: /\badditions?\b|\badd(?:ing)? (?:an? )?(?:\d+\s*(?:sq\.? ?ft|sf|square feet)|room|bedroom|bathroom|master|second stor(?:y|ies)|garage|sunroom)/,
  buildout: /build[- ]?outs?\b|tenant (?:finish\w*|improvements?|fit[- ]?outs?|build\w*|space|upfit)|\bfit[- ]?outs?\b|finish[- ]?outs?\b|\bti\b|up-?fit|white[- ]box|shell space|interior finish improvements?/,
  remodel: /remodel\w*|renovat\w*|rehab\w*|alteration\w*|gut(?:ted)? to (?:the )?(?:studs|framing)/,
  planningType: /final site plan|preliminary site plan|planned development|conditional use/,
  planningNot: /exterior alteration|\bhdc\b|modification|subdivision plat|rezoning|grading only|land use plan/,
  planningBig: /\b\d{1,3},?\d{3}[- ]?(?:square|sq\.?)[- ]?(?:foot|feet|ft)\b[^.]{0,40}\b(?:addition|building|expansion|facility)|\bnew (?:building|facility)\b|\bbuilding (?:addition|expansion)\b/,
  bigWork: /\b(?:remodel\w*|renovat\w*|rehab\w*|build[- ]?out|tenant|finish[- ]?out|addition|interior|new (?:building|construction|commercial|home|house|residence|sfr|single)|demoli\w*|alteration\w*)\b/,
  tradeType: /^\s*(?:electrical|electric|mechanical|hvac|plumbing|gas|fire alarm|sprinkler|low voltage)\b/,
  tradeOnly: /\b(?:electrical|electric|hvac|mechanical|plumbing) (?:only|work only|permit only)\b/
};
const TRADE_TAGS = { electrical: 1, hvac: 1, plumbing: 1, mechanical: 1, water_heater: 1, solar: 1, battery: 1, ev_charger: 1, generator: 1, low_voltage: 1, gas: 1, heat_pump: 1, fire_sprinkler: 1, fire_alarm: 1 };
function exclRx(words){
  const w = arr(words).map(function(x){ return s(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s_-]+'); }).filter(Boolean);
  return w.length ? new RegExp('\\b(?:' + w.join('|') + ')(?:s|es|ing)?\\b', 'i') : null;
}

/* ── money and dates for the chips ── */
function money(n){
  n = num(n); if (n == null || n <= 0) return '';
  if (n >= 1e6) return '$' + (Math.round(n / 1e5) / 10).toString().replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
  return '$' + Math.round(n);
}
function dayMs(d){ const t = Date.parse(s(d).length === 10 ? s(d) + 'T12:00:00Z' : s(d)); return isFinite(t) ? t : 0; }

/* ── the filter: is this permit a lead for GrayCo? ── */
function classify(p, settings, nowMs){
  const S = settings && settings.include ? settings : clean(settings);
  nowMs = nowMs || Date.now();
  const typ = low(p.type), sub = low(p.subtype), desc = low(p.desc), tags = arr(p.tags).map(low);
  const tagTxt = tags.join(' ').replace(/_/g, ' ');
  const head = [typ, sub, tagTxt].join(' | ');
  const dmgTxt = [typ, desc, tagTxt].join(' | ').replace(RX.envScrub, ' ');       /* not the subtype: "Safety Services, Fire & Police Station" is a building use, not a fire · PERMITS3: "brick mold", "no hazardous materials", "inspection for … mold" are not findings */
  const all = [typ, sub, desc, tagTxt, low(p.propertyType), low(p.propertyDetail)].join(' | ');
  const out = { match: false, why: '', bucket: '', reasons: [], hint: 'construction', flags: {} };
  /* too old */
  const when = dayMs(p.issued) || dayMs(p.filed);
  if (when && nowMs - when > S.maxAgeDays * 864e5) { out.why = 'older than ' + S.maxAgeDays + ' days'; return out; }
  /* the damage words */
  const F = { fire: RX.fire.test(dmgTxt), water: RX.water.test(dmgTxt), storm: RX.storm.test(dmgTxt) && !/tree removal/.test(typ + ' ' + sub), collapse: RX.collapse.test(dmgTxt), env: RX.env.test(dmgTxt) };
  /* patch LEADBOTH: the ☢️ category — asbestos / lead / mold / abatement words (not a Metro codes "abatement case") */
  const envW = EW.hits(dmgTxt.replace(/\babatement\s*(?:case|order|notice|district)\b/g, ' ')), envOn = S.include.environmental === true && (envW.length > 0 || F.env);
  if (envW.length) F.env = true;
  F.envWords = envW;
  const damage = F.fire || F.water || F.storm || F.collapse || F.env;
  const isNew = RX.isNew.test(typ + ' ' + sub) || tags.indexOf('new_construction') > -1 || (/\bnew (?:construction|building|sfr|single[- ]family|home|house|residence|commercial|dwelling|townho\w*|duplex)\b|construct (?:a )?new/.test(desc) && !RX.rehab.test(typ));
  const demo = RX.demoType.test(typ + ' ' + sub) || tags.indexOf('demolition') > -1 || RX.demoText.test(desc);
  const roofTxt = desc.replace(RX.rtu, ' ');
  const roof = !demo && (RX.roofType.test(typ + ' ' + sub) || tags.indexOf('roofing') > -1 || (!isNew && RX.roofText.test(roofTxt)));
  const repairWord = !isNew && RX.repair.test(typ + ' ' + desc.replace(RX.rtu, ' '));
  const units = num(p.units);
  const multi = RX.multi.test(typ + ' ' + sub + ' ' + low(p.propertyDetail)) || (units != null && units >= 3);
  const comm = RX.comm.test(typ + ' ' + sub) || /^(?:commercial|industrial)$/.test(low(p.propertyType));
  const rehab = RX.rehab.test(typ + ' ' + sub + ' ' + tagTxt) || /\b(?:remodel|addition|kitchen|bathroom)\b/.test(tagTxt) || RX.rehab.test(desc);
  F.roof = roof; F.repair = repairWord; F.demo = demo;
  out.flags = F;
  /* excluded kinds of work (the settings list) — damage words still win */
  const ex = exclRx(S.exclude);
  const exHead = ex && ex.test(head), exDesc = ex && ex.test(desc) && !RX.bigWork.test(desc);
  const trade = (tags.length && tags.every(function(t){ return TRADE_TAGS[t]; })) || RX.tradeType.test(typ) || RX.tradeOnly.test(all);
  if (!damage && (exHead || exDesc)) { out.why = 'excluded kind of work'; return out; }
  if (!damage && trade && !roof && !demo) { out.why = 'trade-only permit (electrical / HVAC / plumbing)'; return out; }
  /* the bucket */
  let bucket;
  if (demo) bucket = 'demolition';
  else if (roof) bucket = 'roofing';
  else if (RX.admin.test(typ + ' ' + sub)) bucket = 'admin';
  else if (multi) bucket = 'multifamily';
  else if (comm) bucket = isNew && !RX.rehab.test(typ) ? 'commercialNew' : 'commercialRehab';
  else if (isNew && !RX.rehab.test(typ)) bucket = 'residentialNew';
  else if (rehab) bucket = 'residentialRehab';
  else bucket = 'other';
  out.bucket = bucket;
  const inc = S.include;
  /* patch PERMITS3 (owner-approved item 4): Mitigation's damage repairs / storm roofs, Environmental's older buildings (lead before
     1978, asbestos before 1980 — when the feed or the parcel gives the year), Construction's planning applications (before the permit) */
  const yb0 = num(p.yearBuilt), leadRisk = yb0 != null && yb0 > 1700 && yb0 < 1978, asbRisk = yb0 != null && yb0 > 1700 && yb0 < 1980;
  const mitOn = inc.mitigation === true && (F.fire || F.water || F.storm || F.collapse);
  const oldOn = inc.oldBuilding === true && asbRisk && (demo || rehab) && bucket !== 'roofing' && bucket !== 'admin';
  const planOn = p.devApp === true && inc.planning === true && ((RX.planningType.test(typ) && !RX.planningNot.test(typ)) || (/site plan/.test(typ) && RX.planningBig.test(desc)));
  let wanted = (inc[bucket] === true) || (damage && inc.repair) || (repairWord && inc.repair && bucket !== 'admin') || envOn || mitOn || oldOn;   /* patch LEADBOTH · PERMITS3 */
  if (p.devApp === true) wanted = planOn || envOn;   /* patch PERMITS3: a planning application is only a planning lead */
  if (envOn || mitOn || oldOn || planOn) { /* patch LEADBOTH / PERMITS3: kept whatever the bucket */ }
  else if (bucket === 'roofing' && !inc.roofing && comm && !damage) { bucket = 'commercialRehab'; out.bucket = bucket; wanted = inc.commercialRehab === true; }   /* a big commercial re-roof is a commercial job */
  else if (bucket === 'roofing' && !inc.roofing && !damage) wanted = false;
  if (bucket === 'demolition' && !inc.demolition && !damage && !envOn && !oldOn) wanted = false;
  if (!wanted) { out.why = 'not a kind of permit you picked (' + bucket + ')'; return out; }
  /* the kind of building (⚙ Filters can leave a kind out) */
  const useTxt = [typ, sub, desc, low(p.propertyDetail)].join(' | ');
  let use = null; for (let i = 0; i < USES.length; i++) if (USES[i][2].test(useTxt)) { use = USES[i]; break; }
  if (bucket === 'multifamily') use = USES.filter(function(u){ return u[0] === 'multifamily'; })[0];
  if (/^residential/.test(bucket) && use && use[0] !== 'multifamily') use = null;   /* patch PERMITS3: "an office" in a house is a room, not a kind of building */
  if (use && S.uses && S.uses[use[0]] === false && !damage) { out.why = 'a kind of building you left out (' + use[1] + ')'; return out; }
  out.use = use ? use[0] : '';
  /* the value (repair / damage words, roofs and demolitions are wanted at any value — when those kinds are ticked) */
  const v = num(p.value), bypass = (inc.repair && (damage || repairWord)) || (inc.roofing && roof) || (inc.demolition && demo) || envOn || mitOn || oldOn || planOn;   /* patch LEADBOTH: ☢️ at any value · PERMITS3: damage repairs, old buildings, planning */
  const bigBucket = bucket === 'commercialNew' || bucket === 'commercialRehab' || bucket === 'multifamily';
  if (!bypass) {
    if (v == null || v <= 0) { if (!bigBucket || S.minValue > 25000) { out.why = 'no job value listed'; return out; } }
    else if (v < S.minValue) { out.why = 'under ' + money(S.minValue); return out; }
  }
  /* the reasons */
  const R = [], yb = num(p.yearBuilt), m = money(v);
  if (use && use[0] !== 'multifamily') R.push(use[1]);
  if (F.fire) R.push('🔥 fire/smoke words');
  if (F.water) R.push('💧 water/flood words');
  if (F.storm) R.push('🌪 storm/hail/wind words');
  if (F.collapse) R.push('🏚 collapse');
  if (envOn) R.unshift('☢️ Abatement / mold');   /* patch LEADBOTH: the category chip */
  if (F.env) R.push('☣ mold/asbestos/lead words');
  const lab = { commercialNew: 'Commercial new', commercialRehab: 'Commercial rehab', multifamily: 'Multifamily', residentialRehab: 'Residential remodel', residentialNew: 'Residential new', other: 'Building permit' }[bucket];
  if (bucket === 'demolition') R.push(yb ? (yb < 1980 ? 'Demolition — built ' + yb + ' (Environmental)' : 'Demolition') : 'Demolition — pre-1978? (Environmental)');
  else if (bucket === 'roofing') R.push(m ? 'Roof ' + m : 'Roof');
  else if (lab && (m || !damage) && !planOn) R.push(lab + (m ? ' ' + m : ''));   /* PERMITS3: a planning application has no permit kind yet */
  if (repairWord && !damage && bucket !== 'roofing') R.push('Repair');
  if (yb && yb < 1978 && bucket !== 'demolition') R.push('Built ' + yb + ' (pre-1978: lead / asbestos)');
  else if (yb && yb < 1980 && bucket !== 'demolition') R.push('Built ' + yb + ' (pre-1980: asbestos)');   /* patch PERMITS3 */
  /* patch PERMITS3: the kinds of work, by company (chips; the CRM's 🏗 Permits tab filters on out.kinds) */
  const kTxt = [typ, sub, desc, tagTxt].join(' | '), K = [];
  if (isNew && !demo) K.push('new');
  if (RX.addition.test(kTxt) && !demo) K.push('addition');
  if (RX.buildout.test(kTxt) && !isNew) K.push('buildout');
  if (RX.remodel.test(kTxt) && !isNew && !demo && !(F.fire || F.water || F.storm)) K.push('remodel');
  if (F.fire) K.push('fire'); if (F.water) K.push('water'); if (F.storm) K.push('storm');
  if (roof && (F.storm || /\b(?:hail|storm|wind|tree)\b/.test(desc))) K.push('stormRoof');
  if (demo) K.push('demolition');
  if (envW.length || F.env) K.push('abatement');
  if (asbRisk) K.push('oldBuilding');
  if (planOn) K.push('planning');
  if (K.indexOf('buildout') > -1) R.push('🏬 Build-out / tenant improvement');
  else if (K.indexOf('addition') > -1 && bucket !== 'roofing') R.push('➕ Addition');
  if (K.indexOf('stormRoof') > -1) R.push('🏠 Roof after a storm');
  if (planOn) R.push('📐 Planning application (before the permit)');
  out.reasons = R; out.kinds = K; out.leadRisk = leadRisk; out.asbestosRisk = asbRisk;
  /* which company */
  const mitig = F.fire || F.water || F.storm || F.collapse;
  const env = demo || F.env || asbRisk;   /* patch PERMITS3: asbestos before 1980 */
  out.hint = mitig && !envW.length ? 'mitigation' : env ? 'environmental' : 'construction';
  /* patch LEADBOTH: a ☢️ permit is Environmental's; a commercial / multifamily (GC) one is Construction's and also Environmental's */
  if (envOn) { out.category = 'environmental'; out.envWords = envW; out.cos = (comm || multi || bigBucket) && !mitig ? ['construction', 'environmental'] : [out.hint === 'mitigation' ? 'mitigation' : 'environmental']; if (out.cos.length > 1) out.hint = 'construction'; }
  else out.cos = [out.hint];
  /* patch PERMITS3: a big commercial job in an older building is Construction's and Environmental's; a big damage rebuild is Mitigation's and Construction's */
  if (!envOn && out.hint === 'environmental' && !demo && (comm || multi || bigBucket)) { out.cos = ['construction', 'environmental']; out.hint = 'construction'; }
  if (!envOn && out.hint === 'mitigation' && bigBucket && v != null && v >= 250000) out.cos = ['mitigation', 'construction'];
  out.match = true; out.why = 'match';
  return out;
}
const HINT_LABEL = { construction: 'Construction', mitigation: 'Mitigation', environmental: 'Environmental' };

/* ── the adapters: one shape for every source ── */
function isoDay(ms){ const n = num(ms); if (n == null || n <= 0) return ''; try { return new Date(n).toISOString().slice(0, 10); } catch (e) { return ''; } }
const NASH_URL = 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Building_Permits_Issued_2/FeatureServer/0/query';
const NASH_FIELDS = ['Permit__', 'Permit_Type_Description', 'Permit_Subtype_Description', 'Parcel', 'Date_Entered', 'Date_Issued', 'Const_Cost', 'Address', 'City', 'State', 'ZIP', 'Contact', 'Purpose', 'Lat', 'Lon', 'ObjectId'];
function nashLink(num0){ return NASH_URL + '?where=' + encodeURIComponent("Permit__='" + s(num0).replace(/'/g, "''") + "'") + '&outFields=*&f=html'; }
function fromNashville(a){
  a = a && a.attributes ? a.attributes : (a || {});
  const id = s(a.Permit__) || s(a.ObjectId);
  if (!id) return null;
  return { src: 'nashville', area: 'Nashville', areaLong: 'Nashville / Davidson Co., TN', id: id, number: s(a.Permit__), type: s(a.Permit_Type_Description), subtype: s(a.Permit_Subtype_Description),
    desc: clip(a.Purpose, 900), value: num(a.Const_Cost), issued: isoDay(a.Date_Issued), filed: isoDay(a.Date_Entered), address: title(a.Address), city: title(a.City) || 'Nashville', usState: s(a.State) || 'TN',
    zip: s(a.ZIP).slice(0, 5), contractor: clip(a.Contact, 160), parcel: s(a.Parcel), lat: num(a.Lat), lon: num(a.Lon), link: id ? nashLink(a.Permit__ || id) : '' };
}
function fromShovels(p, zip){
  p = p || {}; const ad = p.address || {};
  const id = s(p.id); if (!id) return null;
  const ll = arr(ad.latlng);
  const city = title(ad.city), st = s(ad.state).toUpperCase();
  const z = s(ad.zip_code).slice(0, 5) || s(zip).slice(0, 5);
  return { src: 'shovels', area: city ? city + (st ? ', ' + st : '') : areaOfZip(z), areaLong: areaOfZip(z) || (city + (st ? ', ' + st : '')), id: id, number: s(p.number), type: s(p.type), subtype: s(p.subtype),
    desc: clip(p.description || p.description_derived, 900), value: p.job_value == null ? null : Math.round(num(p.job_value) / 100), issued: s(p.issue_date), filed: s(p.file_date || p.start_date),
    address: title([s(ad.street_no), s(ad.street)].filter(Boolean).join(' ')), city: city, usState: st, zip: z, contractor: '', contractorId: s(p.contractor_id), pulledBy: s(p.contractor_id) ? 'contractor' : '',   /* patch PERMITS3 */
    owner: clip(p.property_legal_owner, 160), yearBuilt: num(p.property_year_built), propertyType: s(p.property_type), propertyDetail: s(p.property_type_detail), units: num(p.property_unit_count),
    tags: arr(p.tags).map(s).filter(Boolean).slice(0, 20), jurisdiction: s(p.jurisdiction), status: s(p.status), lat: num(ll[0]), lon: num(ll[1]), link: '' };
}
function keyOf(p){ return s(p.src) + ':' + s(p.id); }

/* ── patch PERMITS3 (owner-approved item 2/3): the free public feeds found and checked 11/19 (see tools/tests/fixtures/permits/) ──
   · Memphis / Shelby Co. — Memphis & Shelby County Division of Planning & Development ("Develop 901"), published on the City of
     Memphis Open Data Hub (data.memphistn.gov → "DPD Building Permits"): an ArcGIS FeatureServer, new / alteration / addition /
     accessory building permits and certificates of occupancy since 2021, Memphis + unincorporated Shelby + Germantown, Collierville,
     Arlington, Lakeland, Millington addresses. Fields: Record_ID, Issued_Date, Sub_Type (RES / COM / CER), Construction_Type
     (NEW / ALT / ADD / ACC / OF), Valuation, Address, City, ZIP_Code, State, Description, Latitude, Longitude. No contractor, no
     year built. Updated about once a week (the newest permit can be ~2–3 weeks old), so it is read with its own window (45 days).
   · Little Rock, AR — the city's "Planning and Development Permits – 2019 to 2026" CSV on littlerock.gov (City of LR Data page),
     newest first; the file name carries its date and the city posts a new one now and then. Only the first part of the file is
     read (an HTTP range), and only when the page links a new file.
   · Collierville, TN — the town's "Development Activity" layer (ArcGIS FeatureServer, iWorQ): site plans, planned developments,
     subdivisions — planning applications BEFORE the building permit (no value). */
const MEM_URL = 'https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/DPD_Building_Permits/FeatureServer/0/query';
const MEM_FIELDS = ['Record_ID', 'Issued_Date', 'Sub_Type', 'Construction_Type', 'Valuation', 'Address', 'City', 'Description', 'ZIP_Code', 'State', 'Latitude', 'Longitude', 'ObjectId'];
const DEVELOP901_RECORD = 'https://aca-prod.accela.com/SHELBYCO/Cap/GlobalSearchResults.aspx?QueryText=';   /* opens the record on Develop 901 (contractor, inspections) */
const MEM_SUB = { RES: 'Residential', COM: 'Commercial', CER: 'Certificate of Occupancy' };
const MEM_CON = { NEW: 'New', ALT: 'Alteration', ADD: 'Addition', ACC: 'Accessory', OF: 'Occupancy' };
function fromMemphis(a){
  a = a && a.attributes ? a.attributes : (a || {});
  const id = s(a.Record_ID); if (!id) return null;
  const sub = s(a.Sub_Type).toUpperCase(), con = s(a.Construction_Type).toUpperCase();
  const city = title(a.City), z = s(a.ZIP_Code).slice(0, 5);
  return { src: 'memphis', area: 'Memphis / Shelby Co.', areaLong: 'Memphis / Shelby Co., TN (Develop 901)', id: id, number: id,
    type: (MEM_SUB[sub] || sub || 'Building') + ' - ' + (MEM_CON[con] || con || 'Permit'), subtype: [sub, con].filter(Boolean).join(' '),
    desc: clip(s(a.Description).replace(/^apply credit\s*/i, '').replace(/\s+/g, ' '), 900), value: num(a.Valuation), issued: isoDay(a.Issued_Date), filed: '',
    address: title(a.Address), city: city || 'Memphis', usState: s(a.State).toUpperCase() || 'TN', zip: /^\d{5}$/.test(z) ? z : '', contractor: '', pulledBy: '',
    lat: num(a.Latitude), lon: num(a.Longitude), link: DEVELOP901_RECORD + encodeURIComponent(id) };
}
const LR_PAGE = 'https://littlerock.gov/government/mayors-office/initiatives/city-of-lr-data/';
const LR_FILE_RX = /https:\/\/littlerock\.gov\/wp-content\/uploads\/Planning_and_Development_Permits[^"'<>\s]*?\.csv/gi;
const LR_BYTES = 2500000;   /* ~2.5 MB of the newest rows (the whole file is over 100 MB) */
function lrLatest(html){ const all = (s(html).match(LR_FILE_RX) || []).filter(function(u, i, a){ return a.indexOf(u) === i; }); all.sort(function(x, y){ const dx = (/(\d{8})\.csv$/i.exec(x) || [])[1] || '', dy = (/(\d{8})\.csv$/i.exec(y) || [])[1] || ''; return dx < dy ? 1 : dx > dy ? -1 : 0; }); return all[0] || ''; }
/* a CSV parser (quotes, "" escapes, line breaks inside quotes); a cut-off last row (a range read) is dropped */
function csvRows(text){
  text = s(text).replace(/^﻿/, ''); const rows = []; let row = [], f = '', q = false, i = 0, done = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; done = true; continue; }
    else f += c;
    done = false;
  }
  return { rows: rows, cut: !done && (row.length > 0 || f !== '') };
}
function lrDay(v){   /* "2026 Apr 24 03:43:02 PM" → 2026-04-24 */
  const m = /^(\d{4})\s+([A-Za-z]{3})\w*\s+(\d{1,2})/.exec(s(v)); if (!m) return '';
  const mo = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase()); if (mo < 0) return '';
  return m[1] + '-' + String(mo + 1).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
}
const LR_USE = { 'MULTI FAMILY': 'Multifamily', 'APARTMENT COMPLEX': 'Multifamily (apartment complex)' };
function pulledByOf(contractor, owner){
  const c = low(contractor); if (!c) return '';
  if (/\b(?:home ?owner|owner[- ]?builder|property owner|self|owner)\b/.test(c) || (owner && low(owner) === c)) return 'owner';
  return 'contractor';
}
/* the CSV text → permits (one per permit number: the file has a row per fee) */
function fromLittleRockCsv(text, fileUrl){
  const rows = csvRows(text).rows;   /* a cut-off last row never reaches rows */
  if (!rows.length) return [];
  const H = rows[0].map(function(h){ return s(h); }), ix = function(n){ return H.indexOf(n); };
  const col = function(r, n){ const i = ix(n); return i < 0 ? '' : s(r[i]); };
  const seen = {}, out = [];
  for (let k = 1; k < rows.length; k++) {
    const r = rows[k]; if (r.length < H.length - 2) continue;
    const id = col(r, 'Permit Number'); if (!id || seen[id]) continue; seen[id] = 1;
    const use = col(r, 'Building Use Description').toUpperCase(), contractor = clip(col(r, 'Contractor').replace(/^(?:cl(?:ass)?\s*\d+\s*(?:bl)?\s+|under 50k\s+)/i, ''), 160);
    const units = num(col(r, 'Units'));
    out.push({ src: 'littlerock', area: 'Little Rock', areaLong: 'Little Rock, AR (city permit file)', id: id, number: id,
      type: title(col(r, 'Permit Description')) + (col(r, 'Work Class Mapped') ? ' - ' + title(col(r, 'Work Class Mapped')) : ''), subtype: LR_USE[use] || title(use),
      desc: clip(col(r, 'Project Description'), 900), value: num(col(r, 'Declared Value of Project')), issued: lrDay(col(r, 'Permit Issue Date')), filed: lrDay(col(r, 'Application Date')),
      address: title(col(r, 'Property Address')), city: title(col(r, 'Property City')) || 'Little Rock', usState: col(r, 'Property State').toUpperCase() || 'AR', zip: col(r, 'Property Zip').slice(0, 5),
      contractor: contractor, contractorLicense: clip(col(r, 'License Number'), 60), contractorTrade: clip(col(r, 'Contractor Trade'), 40), pulledBy: pulledByOf(contractor),
      status: clip(col(r, 'Permit Status'), 40), units: units, link: fileUrl ? s(fileUrl) : '' });
  }
  return out;
}
const COLL_URL = 'https://services1.arcgis.com/sRmcNvrTVX9Y0AgX/arcgis/rest/services/DevelopmentActivity_iWorQ/FeatureServer/0/query';
const COLL_FIELDS = ['OBJECTID', 'PermitNum', 'PermitDate', 'ApplicationType', 'ProjectName', 'Description', 'MapStatus', 'Latitude', 'Longitude', 'MainStatus', 'DocURL', 'ShortDescription', 'UpdatedDate'];
function fromCollierville(a){
  a = a && a.attributes ? a.attributes : (a || {});
  const id = s(a.PermitNum) || s(a.OBJECTID); if (!id) return null;
  const doc = s(a.DocURL);
  return { src: 'collierville', area: 'Collierville', areaLong: 'Collierville, TN (development applications)', id: id, number: s(a.PermitNum), devApp: true,
    type: s(a.ApplicationType), subtype: s(a.ShortDescription), desc: clip([s(a.ProjectName), s(a.Description)].filter(Boolean).join(' — '), 900), value: null,
    issued: '', filed: isoDay(a.PermitDate), address: '', city: 'Collierville', usState: 'TN', zip: '', contractor: '', pulledBy: '', status: s(a.MainStatus),
    owner: '', lat: num(a.Latitude), lon: num(a.Longitude), link: /^https:\/\//.test(doc) ? clip(doc, 400) : '' };
}

/* ── patch PERMITS3 (owner-approved item 6): the score, 0–100, and a short "why" — the CRM's 🏗 Permits tab sorts the best first ──
     value        0–25  log scale: $10k ≈ 4 · $100k ≈ 11 · $1M ≈ 18 · $10M+ = 25 (no value listed = 6)
     company fit  0–20  20 = the core of a company (Mitigation: fire / water / storm damage; Environmental: asbestos / lead / mold
                        words; Construction: commercial / multifamily ≥ $250k, a planning application); 14 = a building from before
                        1980, a demolition, a residential addition / remodel ≥ $50k; 8 = any other match; +2 when it fits two companies
     permit type  0–15  damage repair / abatement 15 · storm roof 13 · commercial new / multifamily 13 · build-out / TI 12 ·
                        commercial remodel 11 · addition 9 · demolition 9 · planning 9 · residential remodel 7 · new house 6 · roof 6 · other 3
     who pulled   0–10  residential: owner-pulled 10 · contractor 4 · unknown 6; commercial: owner 8 · contractor 5 · unknown 6
     distance     0–15  from GrayCo (5796 Ferguson Rd, Bartlett — Census geocoder 35.20116, -89.87164): ≤5 mi 10 · ≤15 9 · ≤30 7 ·
                        ≤60 4 · ≤150 2 · farther 1 (no map point: the ZIP's area, marked "~"); plus the nearest active job:
                        ≤1 mi 5 · ≤3 mi 4 · ≤10 mi 2
     recency      0–15  ≤2 days 15 · ≤7 13 · ≤14 10 · ≤30 6 · ≤60 3 · older 1 (no date 5)
   Not a match (kept under "Not matching") → fit and type 0. */
const HQ = [35.20116, -89.87164];
const AREA_MILES = [[/^Memphis \/ Shelby/, 12], [/^Bartlett/, 7], [/^Arlington/, 12], [/^DeSoto/, 24], [/^Tipton/, 28], [/^Fayette/, 30], [/^Marshall Co\., MS/, 40], [/^Crittenden/, 18], [/^Jonesboro/, 70], [/^Little Rock/, 130], [/^Nashville/, 200]];
const SRC_MILES = { memphis: 12, collierville: 14, littlerock: 130, nashville: 200 };
function miles(a, b){
  const R = 3958.8, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function okPt(lat, lon){ lat = num(lat); lon = num(lon); return lat != null && lon != null && lat > 24 && lat < 50 && lon < -66 && lon > -125 ? [lat, lon] : null; }
/* the active jobs' map points (CRM projects with geoLat / geoLng, not closed / lost / done) */
function jobPoints(projects){
  return arr(projects).filter(function(p){ return p && p.deleted !== true && !/complete|closed|lost|cancel|dead|archived|done/i.test(s(p.status)); })
    .map(function(p){ return okPt(p.geoLat, p.geoLng); }).filter(Boolean).slice(0, 2000);
}
function isResidential(p, c){ const b = s(c && c.bucket); return /^residential/.test(b) || (!/^commercial|^multifamily/.test(b) && (/residential|single family|sfr|duplex|\bhouse\b|\bhome\b/.test(low(p.type) + ' ' + low(p.subtype) + ' ' + low(p.propertyType)))); }
function score(p, c, ctx){
  ctx = ctx || {}; c = c || {}; p = p || {};
  const now = ctx.nowMs || Date.now(), match = c.match !== false && !p.nomatch && !p.filtered, K = arr(c.kinds || p.kinds), b = s(c.bucket || p.bucket);
  const has = function(k){ return K.indexOf(k) > -1; }, cos = arr(c.cos || p.cos), parts = {}, why = [];
  /* value */
  const v = num(p.value);
  parts.value = v == null || v <= 0 ? 6 : Math.max(2, Math.min(25, Math.round((Math.log10(v) - 3.5) / 3.5 * 25)));
  if (v > 0) why.push(money(v));
  /* company fit + permit type */
  const dmg = has('fire') || has('water') || has('storm'), env = has('abatement') || (arr(c.envWords || p.envWords).length > 0);
  const big = /^commercial|^multifamily/.test(b);
  let fit = 0, typ = 0, fitWhy = '';
  if (match) {
    if (dmg) { fit = 20; fitWhy = 'Mitigation: ' + (has('fire') ? 'fire' : has('water') ? 'water' : 'storm') + ' damage'; }
    else if (env) { fit = 20; fitWhy = 'Environmental: abatement words'; }
    else if (big && (v == null || v >= 250000)) { fit = 20; fitWhy = 'Construction: ' + (b === 'commercialNew' ? 'commercial new' : b === 'multifamily' ? 'multifamily' : has('buildout') ? 'build-out / TI' : 'commercial remodel'); }
    else if (has('planning')) { fit = 20; fitWhy = 'Construction: planning application'; }
    else if (has('oldBuilding')) { fit = 14; fitWhy = 'Environmental: built ' + num(p.yearBuilt) + (num(p.yearBuilt) < 1978 ? ' (lead, asbestos)' : ' (asbestos)'); }
    else if (b === 'demolition') { fit = 14; fitWhy = 'Environmental: demolition'; }
    else if (/^residential/.test(b) && (has('addition') || has('remodel')) && v >= 50000) { fit = 14; fitWhy = 'Construction: ' + (has('addition') ? 'addition' : 'remodel'); }
    else { fit = 8; fitWhy = (HINT_LABEL[c.hint || p.hint] || 'Construction') + ': other'; }
    if (cos.length > 1) fit = Math.min(20, fit + 2);
    typ = dmg || env ? 15 : has('stormRoof') ? 13 : b === 'commercialNew' || b === 'multifamily' ? 13 : has('buildout') ? 12 : b === 'commercialRehab' ? 11
      : has('addition') ? 9 : b === 'demolition' ? 9 : has('planning') ? 9 : b === 'residentialRehab' ? 7 : b === 'residentialNew' ? 6 : b === 'roofing' ? 6 : 3;
  }
  parts.fit = fit; parts.type = typ; if (fitWhy) why.push(fitWhy);
  /* who pulled it (owner-pulled is better for a house: nobody has the job yet) */
  const res = isResidential(p, c), pb = s(p.pulledBy) || pulledByOf(p.contractor, p.owner) || '';
  const known = !!pb;
  parts.who = res ? (known && pb === 'owner' ? 10 : known ? 4 : 6) : (known && pb === 'owner' ? 8 : known ? 5 : 6);
  if (known) why.push(pb === 'owner' ? 'owner-pulled' : 'contractor-pulled');
  /* distance: from GrayCo and from the nearest active job */
  const pt = okPt(p.lat, p.lon);
  let mi = null, about = false;
  if (pt) mi = miles(HQ, pt);
  else { const ar = s(areaOfZip(p.zip)) || s(p.areaLong) || s(p.area); for (let i = 0; i < AREA_MILES.length; i++) if (AREA_MILES[i][0].test(ar)) { mi = AREA_MILES[i][1]; break; } if (mi == null && SRC_MILES[p.src] != null) mi = SRC_MILES[p.src]; about = mi != null; }
  const dHq = mi == null ? 4 : mi <= 5 ? 10 : mi <= 15 ? 9 : mi <= 30 ? 7 : mi <= 60 ? 4 : mi <= 150 ? 2 : 1;
  let jm = null; if (pt) arr(ctx.jobs).forEach(function(j){ const d = miles(j, pt); if (jm == null || d < jm) jm = d; });
  const dJob = jm == null ? 0 : jm <= 1 ? 5 : jm <= 3 ? 4 : jm <= 10 ? 2 : 0;
  parts.distance = Math.min(15, dHq + dJob);
  if (mi != null) why.push((about ? '~' : '') + (mi < 10 ? Math.round(mi * 10) / 10 : Math.round(mi)) + ' mi from GrayCo');
  if (jm != null && jm <= 3) why.push((Math.round(jm * 10) / 10) + ' mi from an active job');
  /* recency */
  const t = dayMs(p.issued) || dayMs(p.filed) || dayMs(p.firstSeen), age = t ? Math.max(0, Math.floor((now - t) / 864e5)) : null;
  parts.recency = age == null ? 5 : age <= 2 ? 15 : age <= 7 ? 13 : age <= 14 ? 10 : age <= 30 ? 6 : age <= 60 ? 3 : 1;
  if (age != null) why.push(age === 0 ? 'today' : age === 1 ? '1 day old' : age + ' days old');
  const total = Math.max(0, Math.min(100, parts.value + parts.fit + parts.type + parts.who + parts.distance + parts.recency));
  return { score: total, scoreWhy: clip(why.join(' · '), 180), scoreParts: parts, miles: mi == null ? null : Math.round(mi * 10) / 10, milesAbout: about, jobMiles: jm == null ? null : Math.round(jm * 10) / 10, pulledBy: pb };
}
const KIND_LABEL = { new: '🏗 New construction', addition: '➕ Addition', remodel: '🔨 Remodel', buildout: '🏬 Build-out / TI', fire: '🔥 Fire damage', water: '💧 Water damage', storm: '🌪 Storm damage',
  stormRoof: '🏠 Storm roof', demolition: '🧨 Demolition', abatement: '☢️ Abatement words', oldBuilding: '🧱 Pre-1980 building', planning: '📐 Planning application' };

module.exports = { USES, defaults, clean, classify, fromNashville, fromShovels, keyOf, money, areaOfZip, INCLUDE, DEFAULT_ZIPS, ZIP_GROUPS, SHOVELS_TAGS, DEFAULT_EXCLUDE, HINT_LABEL, NASH_URL, NASH_FIELDS, RX,
  /* patch PERMITS3 */ fromMemphis, MEM_URL, MEM_FIELDS, DEVELOP901_RECORD, fromLittleRockCsv, csvRows, lrLatest, lrDay, LR_PAGE, LR_BYTES, fromCollierville, COLL_URL, COLL_FIELDS, score, jobPoints, miles, HQ, KIND_LABEL, allGroups, groupsClean, pulledByOf };
