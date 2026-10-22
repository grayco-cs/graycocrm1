// RoofScout data: defaults, demo-mode saving in this browser, and the DEMO scan.
// (The real "Scan an area" is js/scan.js + the roofscout-scan server function; the demo
// scan below runs only in local demo mode, which the website never offers.)
//
// Everything the demo scan produces is synthetic and labeled DEMO. Demo phone
// numbers use the reserved fictional range (555-0100 to 555-0199) and demo
// emails use example.com, so no demo contact can ever reach a real person.
// Real leads come only from what a teammate types in (or, later, the real
// data pipeline). Never invent or guess a real owner's contact info.
(function (root) {
  'use strict';

  var KEY = 'roofscout.v1';           // demo mode: everything in this browser
  var SESSION_KEY = 'roofscout.session';
  var MODE_KEY = 'roofscout.mode';      // 'demo' while practicing in demo mode
  var PREFS_KEY = 'roofscout.prefs';    // per-computer view settings (scan center, radius, type)

  var STAGES = ['New', 'Contacted', 'Quoted', 'Won', 'Lost'];

  var PLACES = [
    { id: 'memphis', label: 'Memphis, TN', lat: 35.1495, lng: -90.0490 },
    { id: 'bartlett', label: 'Bartlett, TN', lat: 35.2045, lng: -89.8740 },
    { id: 'cordova', label: 'Cordova, TN', lat: 35.1556, lng: -89.7762 },
    { id: 'germantown', label: 'Germantown, TN', lat: 35.0868, lng: -89.8101 },
    { id: 'collierville', label: 'Collierville, TN', lat: 35.0420, lng: -89.6645 },
    { id: 'millington', label: 'Millington, TN', lat: 35.3415, lng: -89.8973 },
    { id: 'southaven', label: 'Southaven, MS', lat: 34.9889, lng: -90.0126 },
    { id: 'olivebranch', label: 'Olive Branch, MS', lat: 34.9618, lng: -89.8295 },
    { id: 'westmemphis', label: 'West Memphis, AR', lat: 35.1465, lng: -90.1845 }
  ];

  function defaultSettings() {
    return {
      company: {
        name: 'GrayCo Construction Services',
        phone: '(901) 585-0944',
        email: 'wjohnson@grayco-cs.com',
        website: 'www.grayco-cs.com',
        address: (typeof window !== 'undefined' && window._gcCompanyAddress ? window._gcCompanyAddress() : (new Date() >= new Date('2026-10-29T05:00:00Z') ? '4014' : '4007') + ' Broadway Rd, Bartlett, TN 38135'),   // patch ADDR2: the scheduled move
        licTN: '',
        licAR: '',
        licMS: '',
        insurance: 'Licensed · Bonded · Fully Insured'
      },
      // $/ft² cost placeholders: admin sets the real numbers in Settings.
      // perSquare = the customer estimate per square (100 ft²); 0 = use the margin instead.
      roofTypes: [
        { id: 'tpo', name: 'TPO (single-ply)', mat: 3.50, labor: 3.00, perSquare: 1000, lowSlope: true },
        { id: 'roll', name: 'Roll roofing / Mod-bit', mat: 2.25, labor: 2.25, perSquare: 0, lowSlope: true },
        { id: 'metal', name: 'Metal', mat: 5.00, labor: 3.50, perSquare: 1400, lowSlope: true },
        { id: 'epdm', name: 'EPDM (rubber)', mat: 3.00, labor: 2.75, perSquare: 0, lowSlope: true },
        { id: 'bur', name: 'Built-up (BUR)', mat: 3.50, labor: 3.50, perSquare: 0, lowSlope: true },
        { id: 'shingle', name: 'Asphalt shingle', mat: 2.25, labor: 2.25, perSquare: 375, lowSlope: false }
      ],
      margin: 35,
      coating: { low: 165, high: 250, galPrice: 197, galCoverage: 320 },
      commission: '15 / 60 / 40',
      // Esri API key for the satellite map (business use). Empty = Esri's public tiles.
      map: { esriKey: '' },
      // Google Solar "measure from address": most lookups allowed per month (Google: ~1¢ each after 10,000 free).
      solar: { monthlyLimit: 500 },
      // Google satellite on the map (Map Tiles API, 2D tiles): most tiles allowed per month (Google: 100,000 free, then ~$0.60 per 1,000).
      mapTiles: { monthlyLimit: 90000 },
      // Tracerfy "📞 Find owner contact" (paid skip tracing): most lookups allowed per month.
      skiptrace: { monthlyLimit: 200 },
      // Map → Scan an area (public data: OpenStreetMap buildings, county parcels, Memphis permits, NOAA hail).
      // Source URLs left empty use the built-in ones (see netlify/functions/roofscout-scan.js).
      areaScan: {
        minSqft: 10000,
        defaultArea: 'bartlett',
        hailDays: 0,
        weights: { size: 30, age: 30, hail: 20, type: 10, distance: 10 },
        doNotContact: '',
        residentialPattern: '',
        sources: {
          shelby: { on: false, url: '' },        // Shelby County ReGIS: turn on once ReGIS agrees to the use
          desoto: { on: false, url: '' },        // DeSoto County: paste the parcel layer URL from county GIS
          crittenden: { on: true, url: '' },     // Arkansas GIS Office statewide parcels (open data)
          permits: { on: false, url: '', since: '2021-01-01' }   // Memphis DPD Building Permits layer URL
        }
      },
      // Proposal terms, one per line. Placeholders: admin should confirm these.
      terms: 'Pricing is an approximate estimate, valid for 30 days from the proposal date. Final price is confirmed after an on-site inspection.\n' +
        'Payment terms: to be confirmed at signing.\n' +
        'Hidden deck damage found during tear-off is repaired at a unit price agreed in writing before work proceeds.\n' +
        'Warranty terms as stated in the final contract; manufacturer warranties per manufacturer terms.'
    };
  }

  // Stored settings over the defaults, so anything added in a later version shows up.
  function mergeSettings(saved) {
    var d = defaultSettings();
    var s = saved && typeof saved === 'object' ? JSON.parse(JSON.stringify(saved)) : {};
    // Older versions had Low / Middle / High margins; the middle one is the margin now.
    if (s.margin === undefined && s.margins && s.margins.mid !== undefined) s.margin = s.margins.mid;
    delete s.margins;
    delete s.scan;
    Object.keys(d).forEach(function (k) {
      if (s[k] === undefined) s[k] = d[k];
      else if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) {
        Object.keys(d[k]).forEach(function (kk) { if (s[k][kk] === undefined) s[k][kk] = d[k][kk]; });
      }
    });
    s.roofTypes.forEach(function (t) {
      if (t.perSquare === undefined) {
        var def = d.roofTypes.filter(function (x) { return x.id === t.id; })[0];
        t.perSquare = def ? def.perSquare : 0;
      }
    });
    return s;
  }

  function defaults() {
    return {
      v: 1,
      settings: defaultSettings(),
      // Demo mode only. Real teammates come from the CRM's staff list.
      users: [
        { id: 'u_wjohnson', name: 'W. Johnson', title: 'Owner', phone: '(901) 585-0944', email: 'wjohnson@grayco-cs.com', role: 'admin' },
        { id: 'u_mreed', name: 'M. Reed (demo)', title: 'Project Manager', phone: '', email: 'mreed@example.com', role: 'pm' },
        { id: 'u_dcole', name: 'D. Cole (demo)', title: 'Sales', phone: '', email: 'dcole@example.com', role: 'sales' }
      ],
      leads: [],
      activity: []
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) return normalize(s);
      }
    } catch (e) { /* private window or blocked storage: run in memory */ }
    return defaults();
  }

  function normalize(s) {
    var d = defaults();
    s.settings = mergeSettings(s.settings);
    ['users', 'leads', 'activity'].forEach(function (k) { if (!Array.isArray(s[k])) s[k] = d[k]; });
    s.users.forEach(function (u) { delete u.password; });
    delete s.seq;
    return s;
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function put(key, v) {
    try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch (e) { /* ignore */ }
  }

  function prefs() {
    var p = {};
    try { p = JSON.parse(get(PREFS_KEY) || '{}') || {}; } catch (e) { /* ignore */ }
    return { place: p.place || 'memphis', radius: Number(p.radius) || 10, scope: p.scope || 'commercial' };
  }
  function savePrefs(p) { put(PREFS_KEY, JSON.stringify(p)); }

  // Unique across everyone's computers (time + randomness), safe as a database key.
  function newId(prefix) {
    var rnd = '';
    try {
      var a = new Uint8Array(5);
      crypto.getRandomValues(a);
      rnd = Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join('');
    } catch (e) { rnd = Math.random().toString(36).slice(2, 7); }
    return (prefix || 'L') + Date.now().toString(36) + rnd;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    a[6] = (a[6] & 0x0f) | 0x40;
    a[8] = (a[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(a, function (b) { return (b + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ---- Demo scan --------------------------------------------------------

  // Small seeded random generator so a scan of the same area looks the same.
  function rng(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  var COMMERCIAL_KINDS = ['Warehouse', 'Strip center', 'Office building', 'Church', 'Light industrial', 'Self-storage', 'Medical office', 'Restaurant', 'School', 'Auto service'];
  var RESIDENTIAL_KINDS = ['Single-family home', 'Duplex', 'Townhome row'];
  var ISSUES_LOW = ['Ponding water', 'Membrane seams lifting', 'Patched areas', 'Discoloration / UV wear', 'Debris buildup at drains', 'Rust at fasteners', 'Blistering', 'Failed flashing at curbs'];
  var ISSUES_STEEP = ['Missing shingles', 'Granule loss', 'Moss / staining', 'Sagging ridge', 'Tree overhang'];

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  // Build `count` synthetic sites inside `radiusMi` of the center.
  function demoScan(state, center, radiusMi, scope, seed) {
    var r = rng(seed);
    var count = Math.max(8, Math.min(60, Math.round(8 + radiusMi * 1.6)));
    var types = state.settings.roofTypes;
    var lowSlope = types.filter(function (t) { return t.lowSlope; });
    var steep = types.filter(function (t) { return !t.lowSlope; });
    var out = [];

    for (var i = 0; i < count; i++) {
      // Commercial-first: when scanning "all", 3 of 4 sites are commercial.
      var kind = scope === 'all' ? (r() < 0.75 ? 'commercial' : 'residential') : scope;
      // Even spread over the circle's area, not bunched in the middle.
      var dist = radiusMi * Math.sqrt(r());
      var ang = r() * Math.PI * 2;
      var lat = center.lat + (dist / 69) * Math.cos(ang);
      var lng = center.lng + (dist / (69 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(ang);

      var isCom = kind === 'commercial';
      var roofType = isCom
        ? pick(r, lowSlope.length ? lowSlope : types)
        : (r() < 0.85 && steep.length ? pick(r, steep) : pick(r, types));
      var area = isCom
        ? Math.round((6000 + Math.pow(r(), 2) * 110000) / 100) * 100
        : Math.round((1400 + r() * 3200) / 50) * 50;
      // Skewed toward fair/poor so the demo has something to work.
      var condition = Math.round(15 + Math.pow(r(), 0.8) * 80);
      // Residential is harder to grade from satellite (small roofs, trees, pitch).
      var confidence = isCom ? Math.round(70 + r() * 25) : Math.round(40 + r() * 25);
      var issuePool = roofType.lowSlope ? ISSUES_LOW : ISSUES_STEEP;
      var nIssues = condition < 40 ? 3 : condition < 70 ? 2 : r() < 0.5 ? 1 : 0;
      var issues = [];
      while (issues.length < nIssues) {
        var iss = pick(r, issuePool);
        if (issues.indexOf(iss) < 0) issues.push(iss);
      }
      var n = String(i + 1).padStart(3, '0');
      var hasContact = r() < 0.7;

      out.push({
        name: 'DEMO ' + pick(r, isCom ? COMMERCIAL_KINDS : RESIDENTIAL_KINDS) + ' #' + n,
        address: 'Demo site ' + n + ' (' + dist.toFixed(1) + ' mi from center)',
        lat: lat,
        lng: lng,
        kind: kind,
        roofType: roofType.id,
        areaSqft: area,
        condition: condition,
        confidence: confidence,
        issues: issues,
        owner: hasContact ? {
          name: 'Demo Contact ' + n,
          company: 'Sample Holdings ' + n + ' LLC',
          phone: '(901) 555-01' + String(Math.floor(r() * 100)).padStart(2, '0'),
          email: 'demo' + n + '@example.com'
        } : { name: '', company: '', phone: '', email: '' },
        source: 'scan',
        demo: true
      });
    }
    return out;
  }

  root.Store = {
    STAGES: STAGES,
    PLACES: PLACES,
    defaults: defaults,
    defaultSettings: defaultSettings,
    mergeSettings: mergeSettings,
    load: load,
    normalize: normalize,
    save: save,
    getSession: function () { return get(SESSION_KEY); },
    setSession: function (id) { put(SESSION_KEY, id); },
    getMode: function () { return get(MODE_KEY); },
    setMode: function (m) { put(MODE_KEY, m); },
    prefs: prefs,
    savePrefs: savePrefs,
    newId: newId,
    uuid: uuid,
    demoScan: demoScan
  };
})(this);
