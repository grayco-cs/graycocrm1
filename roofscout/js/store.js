// RoofScout data: defaults, saving to this browser, and the DEMO scan.
//
// Everything the demo scan produces is synthetic and labeled DEMO. Demo phone
// numbers use the reserved fictional range (555-0100 to 555-0199) and demo
// emails use example.com, so no demo contact can ever reach a real person.
// Real leads come only from what a teammate types in (or, later, the real
// data pipeline). Never invent or guess a real owner's contact info.
(function (root) {
  'use strict';

  var KEY = 'roofscout.v1';
  var SESSION_KEY = 'roofscout.session';

  var STAGES = ['New', 'Contacted', 'Quoted', 'Won', 'Lost'];

  var PLACES = [
    { id: 'memphis', label: 'Memphis, TN', lat: 35.1495, lng: -90.0490 },
    { id: 'bartlett', label: 'Bartlett, TN', lat: 35.2045, lng: -89.8740 },
    { id: 'cordova', label: 'Cordova, TN', lat: 35.1556, lng: -89.7762 },
    { id: 'germantown', label: 'Germantown, TN', lat: 35.0868, lng: -89.8101 },
    { id: 'collierville', label: 'Collierville, TN', lat: 35.0420, lng: -89.6645 },
    { id: 'millington', label: 'Millington, TN', lat: 35.3415, lng: -89.8973 },
    { id: 'southaven', label: 'Southaven, MS', lat: 34.9889, lng: -90.0126 },
    { id: 'westmemphis', label: 'West Memphis, AR', lat: 35.1465, lng: -90.1845 }
  ];

  function defaults() {
    return {
      v: 1,
      settings: {
        company: {
          name: 'GrayCo Construction Services',
          phone: '(901) 585-0944',
          email: 'wjohnson@grayco-cs.com',
          website: 'www.grayco-cs.com',
          address: '4014 Broadway Road, Bartlett, TN 38135',
          licTN: '',
          licAR: '',
          insurance: 'Licensed · Bonded · Fully Insured'
        },
        // $/ft² placeholders: admin sets the real numbers in Settings.
        roofTypes: [
          { id: 'tpo', name: 'TPO (single-ply)', mat: 3.50, labor: 3.00, lowSlope: true },
          { id: 'roll', name: 'Roll roofing / Mod-bit', mat: 2.25, labor: 2.25, lowSlope: true },
          { id: 'metal', name: 'Metal', mat: 5.00, labor: 3.50, lowSlope: true },
          { id: 'epdm', name: 'EPDM (rubber)', mat: 3.00, labor: 2.75, lowSlope: true },
          { id: 'bur', name: 'Built-up (BUR)', mat: 3.50, labor: 3.50, lowSlope: true },
          { id: 'shingle', name: 'Asphalt shingle', mat: 2.25, labor: 2.25, lowSlope: false }
        ],
        margins: { low: 25, mid: 35, high: 45 },
        coating: { low: 165, high: 250, galPrice: 197, galCoverage: 320 },
        commission: '15 / 60 / 40',
        // Proposal terms, one per line. Placeholders: admin should confirm these.
        terms: 'Pricing valid for 30 days from the proposal date.\n' +
          'Payment terms: to be confirmed at signing.\n' +
          'Hidden deck damage found during tear-off is repaired at a unit price agreed in writing before work proceeds.\n' +
          'Warranty terms per the option selected; manufacturer warranties per manufacturer terms.',
        scan: { place: 'memphis', radius: 10, scope: 'commercial' }
      },
      users: [
        { id: 'u_wjohnson', name: 'W. Johnson', title: 'Owner', phone: '(901) 585-0944', email: 'wjohnson@grayco-cs.com', password: 'admin', role: 'admin' },
        { id: 'u_mreed', name: 'M. Reed', title: 'Project Manager', phone: '', email: 'mreed@grayco-cs.com', password: 'pm', role: 'pm' },
        { id: 'u_dcole', name: 'D. Cole', title: 'Sales', phone: '', email: 'dcole@grayco-cs.com', password: 'sales', role: 'sales' }
      ],
      leads: [],
      activity: [],
      seq: 1
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) return mergeDefaults(s);
      }
    } catch (e) { /* private window or blocked storage: run in memory */ }
    return defaults();
  }

  // Fill in any settings added after this browser's data was first saved.
  function mergeDefaults(s) {
    var d = defaults();
    s.settings = s.settings || {};
    Object.keys(d.settings).forEach(function (k) {
      if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
      else if (d.settings[k] && typeof d.settings[k] === 'object' && !Array.isArray(d.settings[k])) {
        Object.keys(d.settings[k]).forEach(function (kk) {
          if (s.settings[k][kk] === undefined) s.settings[k][kk] = d.settings[k][kk];
        });
      }
    });
    ['users', 'leads', 'activity'].forEach(function (k) { if (!Array.isArray(s[k])) s[k] = d[k]; });
    if (!s.seq) s.seq = 1;
    return s;
  }

  var saveFailed = false;
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); saveFailed = false; return true; }
    catch (e) { saveFailed = true; return false; }
  }

  function getSession() { try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; } }
  function setSession(id) {
    try { if (id) localStorage.setItem(SESSION_KEY, id); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function nextId(state, prefix) {
    var n = state.seq++;
    return prefix + String(n).padStart(4, '0');
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
    KEY: KEY,
    STAGES: STAGES,
    PLACES: PLACES,
    defaults: defaults,
    load: load,
    normalize: mergeDefaults,
    save: save,
    saveFailed: function () { return saveFailed; },
    getSession: getSession,
    setSession: setSession,
    nextId: nextId,
    demoScan: demoScan
  };
})(this);
