/* netlify/functions/_lib/permits.js — patch PERMITS (owner 11/12: "Can we go through building permits filed in Arkansas, TN, Mississippi in
   the leads scan … put these in owner setup and do whatever you can to make these active and scan in leads").
   The pure part of 🏗️ Permitted jobs (no network, no database): the settings and their defaults, the two adapters (Nashville's
   public ArcGIS feed, the paid Shovels API) that turn a raw permit into ONE shape, and the filter that says whether a
   permit is a lead for GrayCo, why (reason chips) and for which company (Construction / Mitigation / Environmental).
   netlify/functions/permit-watch.js does the fetching and the storing; tools/tests/test_PERMITS.js tests this file. */
'use strict';
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
  ['Nashville / Davidson Co., TN — free from Metro already', ['37201', '37203', '37204', '37205', '37206', '37207', '37208', '37209', '37210', '37211', '37212', '37213', '37214', '37215', '37216', '37217', '37218', '37219', '37220', '37221', '37013', '37072', '37076', '37080', '37115', '37138', '37189'], false]
];
const DEFAULT_ZIPS = ZIP_GROUPS.reduce(function(a, g){ return g[2] ? a.concat(g[1]) : a; }, []);
/* Shovels' permit tags we know (from its tag list) — picked in the CRM; "-" in front = leave out */
const SHOVELS_TAGS = [['new_construction', 'New construction'], ['addition', 'Addition'], ['adu', 'ADU'], ['kitchen', 'Kitchen'], ['bathroom', 'Bathroom'], ['roofing', 'Roofing'], ['window_door', 'Window / door'],
  ['solar', 'Solar'], ['hvac', 'HVAC'], ['water_heater', 'Water heater'], ['pool_and_hot_tub', 'Pool / hot tub']];
function areaOfZip(zip){
  const z = s(zip).slice(0, 5);
  for (let i = 0; i < ZIP_GROUPS.length; i++) if (ZIP_GROUPS[i][1].indexOf(z) > -1) return ZIP_GROUPS[i][0];
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
  ['repair', 'Fire / water / storm / mold / asbestos / repair words (any value)', false]
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
const DEFAULT_EXCLUDE = ['sign', 'fence', 'pool', 'solar', 'deck', 'shed', 'tent', 'carport', 'food truck', 'electrical only', 'hvac only'];
function defaults(){
  const inc = {}; INCLUDE.forEach(function(x){ inc[x[0]] = x[2]; });
  const uses = {}; USES.forEach(function(u){ uses[u[0]] = true; });
  return { v: 1, include: inc, uses: uses, exclude: DEFAULT_EXCLUDE.slice(), minValue: 1000000, maxAgeDays: 14,
    nashville: { on: true },
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
    shovels: { on: sh.on === true, auto: sh.auto === true, zips: zips, tags: tags, q: clip(sh.q, 50).replace(/[\u0000-\u001f]/g, ''),
      minJobValue: mjv == null ? d.shovels.minJobValue : Math.max(0, Math.min(1e9, Math.round(mjv))),
      windowDays: win == null ? d.shovels.windowDays : Math.max(1, Math.min(90, Math.round(win))),
      perRun: per == null ? d.shovels.perRun : Math.max(1, Math.min(1000, Math.round(per))),
      budget: bud == null ? d.shovels.budget : Math.max(0, Math.min(1e7, Math.round(bud))) } };
  if (s(v.updatedAt)) out.updatedAt = s(v.updatedAt);
  if (s(v.updatedBy)) out.updatedBy = clip(v.updatedBy, 80);
  return out;
}

/* ── the words ── */
const RX = {
  fire: /\bfire[- ]?(?:damaged?|loss|restor\w*|repair\w*)\b|\b(?:burn(?:ed|t)[- ]out|fire[- ]burned|charred)\b|\bsmoke\b(?![\s-]*(?:detectors?|alarms?|evac\w*|dampers?|vents?|control|exhaust|free|shop))|\bfire\b(?![\s-]*(?:alarms?|sprinklers?|suppression|protection|pits?|places?|escapes?|rated|rating|resistan\w*|walls?|separation|lanes?|hydrants?|pumps?|department|dept|marshal\w*|code|stop\w*|proof\w*|extinguish\w*|retardant|barriers?|partitions?|doors?|dampers?|watch|stations?|house|trucks?|safety|life|&|and police|\/|access|apparatus|flow|line|command|panel))/,
  water: /\bwater[- ]?(?:damaged?|loss|intrusion|leak\w*|infiltration|extraction|mitigation)\b|(?<!(?:event|case) of (?:an? )?)\bflood(?:ed|ing|s)?\b(?![\s-]*(?:plain|zone|way|lights?|lighting|vent\w*|elevation|proof\w*))|\bburst (?:pipes?|lines?)|\bpipes? burst|\bsewage\b|\bsewer back-?up|\bleak damage/,
  storm: /\bstorm\b(?![\s-]*(?:water|drain\w*|sewers?|shelters?|doors?|windows?|safe|rooms?|pipes?|inlets?|lines?|system\w*|structures?))|\bhail\b|\bwind\b(?![\s-]*(?:loads?|speeds?|rated|rating|turbines?|zones?|exposure|design|bracing|uplift))|\btree\s*(?:fell|fall\w*|damage\w*|on (?:the )?(?:house|home|roof|structure|building|garage|dwelling)|struck|through|limb)|\bfallen trees?\b|\btornado\w*|\bstraight[- ]line winds?/,
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
  admin: /amend(?:ed|ment)? permit|change contractor|use (?:&|and) occupancy|master permit|mobile food|food truck|temporary (?:tent|structure)|special event/,
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
  const dmgTxt = [typ, desc, tagTxt].join(' | ');       /* not the subtype: "Safety Services, Fire & Police Station" is a building use, not a fire */
  const all = [typ, sub, desc, tagTxt, low(p.propertyType), low(p.propertyDetail)].join(' | ');
  const out = { match: false, why: '', bucket: '', reasons: [], hint: 'construction', flags: {} };
  /* too old */
  const when = dayMs(p.issued) || dayMs(p.filed);
  if (when && nowMs - when > S.maxAgeDays * 864e5) { out.why = 'older than ' + S.maxAgeDays + ' days'; return out; }
  /* the damage words */
  const F = { fire: RX.fire.test(dmgTxt), water: RX.water.test(dmgTxt), storm: RX.storm.test(dmgTxt) && !/tree removal/.test(typ + ' ' + sub), collapse: RX.collapse.test(dmgTxt), env: RX.env.test(dmgTxt) };
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
  let wanted = (inc[bucket] === true) || (damage && inc.repair) || (repairWord && inc.repair && bucket !== 'admin');
  if (bucket === 'roofing' && !inc.roofing && comm && !damage) { bucket = 'commercialRehab'; out.bucket = bucket; wanted = inc.commercialRehab === true; }   /* a big commercial re-roof is a commercial job */
  else if (bucket === 'roofing' && !inc.roofing && !damage) wanted = false;
  if (bucket === 'demolition' && !inc.demolition && !damage) wanted = false;
  if (!wanted) { out.why = 'not a kind of permit you picked (' + bucket + ')'; return out; }
  /* the kind of building (⚙ Filters can leave a kind out) */
  const useTxt = [typ, sub, desc, low(p.propertyDetail)].join(' | ');
  let use = null; for (let i = 0; i < USES.length; i++) if (USES[i][2].test(useTxt)) { use = USES[i]; break; }
  if (bucket === 'multifamily') use = USES.filter(function(u){ return u[0] === 'multifamily'; })[0];
  if (use && S.uses && S.uses[use[0]] === false && !damage) { out.why = 'a kind of building you left out (' + use[1] + ')'; return out; }
  out.use = use ? use[0] : '';
  /* the value (repair / damage words, roofs and demolitions are wanted at any value — when those kinds are ticked) */
  const v = num(p.value), bypass = (inc.repair && (damage || repairWord)) || (inc.roofing && roof) || (inc.demolition && demo);
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
  if (F.env) R.push('☣ mold/asbestos/lead words');
  const lab = { commercialNew: 'Commercial new', commercialRehab: 'Commercial rehab', multifamily: 'Multifamily', residentialRehab: 'Residential remodel', residentialNew: 'Residential new', other: 'Building permit' }[bucket];
  if (bucket === 'demolition') R.push(yb ? (yb < 1978 ? 'Demolition — built ' + yb + ' (Environmental)' : 'Demolition') : 'Demolition — pre-1978? (Environmental)');
  else if (bucket === 'roofing') R.push(m ? 'Roof ' + m : 'Roof');
  else if (lab && (m || !damage)) R.push(lab + (m ? ' ' + m : ''));
  if (repairWord && !damage && bucket !== 'roofing') R.push('Repair');
  if (yb && yb < 1978 && bucket !== 'demolition') R.push('Built ' + yb + ' (pre-1978: lead / asbestos)');
  out.reasons = R;
  /* which company */
  const mitig = F.fire || F.water || F.storm || F.collapse;
  const env = demo || F.env || (yb != null && yb > 1700 && yb < 1978);
  out.hint = mitig ? 'mitigation' : env ? 'environmental' : 'construction';
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
    address: title([s(ad.street_no), s(ad.street)].filter(Boolean).join(' ')), city: city, usState: st, zip: z, contractor: '', contractorId: s(p.contractor_id),
    owner: clip(p.property_legal_owner, 160), yearBuilt: num(p.property_year_built), propertyType: s(p.property_type), propertyDetail: s(p.property_type_detail), units: num(p.property_unit_count),
    tags: arr(p.tags).map(s).filter(Boolean).slice(0, 20), jurisdiction: s(p.jurisdiction), status: s(p.status), lat: num(ll[0]), lon: num(ll[1]), link: '' };
}
function keyOf(p){ return s(p.src) + ':' + s(p.id); }

module.exports = { USES, defaults, clean, classify, fromNashville, fromShovels, keyOf, money, areaOfZip, INCLUDE, DEFAULT_ZIPS, ZIP_GROUPS, SHOVELS_TAGS, DEFAULT_EXCLUDE, HINT_LABEL, NASH_URL, NASH_FIELDS, RX };
