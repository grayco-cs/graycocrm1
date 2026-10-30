// RoofScout area scan: the pure parts, shared by the browser (window.Scan) and the
// server function netlify/functions/roofscout-scan.js (require). No network here.
//
//   geometry   geodesic area, point-on-surface, point-in-polygon, distances
//   grid       the fixed tile grid (cache-friendly: the same area is the same tiles)
//   parsing    Overpass JSON → footprints, SPC hail CSV → reports, ArcGIS fields → parcel
//   rules      building type, single-family test, do-not-contact, dedupe, score + reasons
//
// Points are [lat, lng]. ArcGIS / GeoJSON coordinates are [x=lng, y=lat] and are
// converted where they come in.
(function (root) {
  'use strict';

  // ---- Geometry -------------------------------------------------------------

  var R_AUTHALIC = 6371007.181;      // m: sphere with the WGS84 ellipsoid's surface area
  var SQFT_PER_M2 = 10.7639104;
  var MI_PER_M = 1 / 1609.344;
  var K = Math.PI / 180;

  // Area of one ring on the sphere (Chamberlain & Duquette 2007), m², always ≥ 0.
  function ringAreaM2(ring) {
    var n = ring.length;
    if (n < 3) return 0;
    var s = 0;
    for (var i = 0; i < n; i++) {
      var p1 = ring[i], p2 = ring[(i + 1) % n];
      s += (p2[1] - p1[1]) * K * (2 + Math.sin(p1[0] * K) + Math.sin(p2[0] * K));
    }
    return Math.abs(s * R_AUTHALIC * R_AUTHALIC / 2);
  }

  // rings: [outer, hole, hole …] → ft².
  function polygonSqft(rings) {
    if (!rings || !rings.length) return 0;
    var a = ringAreaM2(rings[0]);
    for (var i = 1; i < rings.length; i++) a -= ringAreaM2(rings[i]);
    return Math.max(0, a) * SQFT_PER_M2;
  }

  function haversineM(a, b) {
    var dLat = (b[0] - a[0]) * K, dLng = (b[1] - a[1]) * K;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * K) * Math.cos(b[0] * K) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function distanceMi(a, b) { return haversineM(a, b) * MI_PER_M; }

  // Ray casting; ring may or may not repeat its first point.
  function pointInRing(pt, ring) {
    var y = pt[0], x = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Even-odd over all rings: holes (and Esri's ring order) come out right without orientation.
  function pointInRings(pt, rings) {
    var n = 0;
    (rings || []).forEach(function (r) { if (pointInRing(pt, r)) n++; });
    return n % 2 === 1;
  }

  // Area-weighted centroid of the ring (planar in degrees: fine at building scale).
  function ringCentroid(ring) {
    var a = 0, cy = 0, cx = 0, n = ring.length;
    for (var i = 0; i < n; i++) {
      var p = ring[i], q = ring[(i + 1) % n];
      var f = p[1] * q[0] - q[1] * p[0];
      a += f; cx += (p[1] + q[1]) * f; cy += (p[0] + q[0]) * f;
    }
    if (Math.abs(a) < 1e-14) {
      var s = [0, 0];
      ring.forEach(function (p2) { s[0] += p2[0]; s[1] += p2[1]; });
      return [s[0] / n, s[1] / n];
    }
    return [cy / (3 * a), cx / (3 * a)];
  }

  // A point guaranteed inside the polygon: the centroid when it is inside (most
  // buildings), otherwise the middle of the widest inside stretch along the centroid's latitude.
  function pointOnSurface(rings) {
    var outer = rings[0];
    var c = ringCentroid(outer);
    if (pointInRings(c, rings)) return c;
    var y = c[0], xs = [];
    rings.forEach(function (r) {
      for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        var yi = r[i][0], yj = r[j][0];
        if ((yi > y) !== (yj > y)) xs.push(r[i][1] + (y - yi) * (r[j][1] - r[i][1]) / (yj - yi));
      }
    });
    xs.sort(function (a, b) { return a - b; });
    var best = null, w = -1;
    for (var k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] > w) { w = xs[k + 1] - xs[k]; best = [y, (xs[k] + xs[k + 1]) / 2]; }
    }
    return best || outer[0];
  }

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  // ---- Tile grid ------------------------------------------------------------
  // Fixed grid of 0.02° lat × 0.025° lng (about 2.2 km × 2.3 km around Memphis).
  // One server call = one tile, so each request to the free services stays small,
  // and any later scan that touches the same tile is served from the cache.

  var TILE_LAT = 0.02, TILE_LNG = 0.025, MAX_TILES = 30;

  function tileId(x, y) { return x + '_' + y; }
  function parseTile(id) {
    var m = /^(-?\d{1,5})_(-?\d{1,5})$/.exec(String(id || ''));
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  }
  // bbox = { s, w, n, e } in degrees.
  function tileBbox(id) {
    var t = parseTile(id);
    if (!t) return null;
    return { s: round6(t.y * TILE_LAT), w: round6(t.x * TILE_LNG), n: round6((t.y + 1) * TILE_LAT), e: round6((t.x + 1) * TILE_LNG) };
  }
  function tilesForBbox(b) {
    var x0 = Math.floor(b.w / TILE_LNG), x1 = Math.floor((b.e - 1e-12) / TILE_LNG);
    var y0 = Math.floor(b.s / TILE_LAT), y1 = Math.floor((b.n - 1e-12) / TILE_LAT);
    var out = [];
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) out.push(tileId(x, y));
    return out;
  }
  function bboxAreaMi2(b) {
    var h = distanceMi([b.s, b.w], [b.n, b.w]);
    var w = distanceMi([(b.s + b.n) / 2, b.w], [(b.s + b.n) / 2, b.e]);
    return h * w;
  }
  function inBbox(pt, b) { return pt[0] >= b.s && pt[0] <= b.n && pt[1] >= b.w && pt[1] <= b.e; }
  function bboxesTouch(a, b) { return a.s <= b.n && a.n >= b.s && a.w <= b.e && a.e >= b.w; }
  function validBbox(b) {
    return b && [b.s, b.w, b.n, b.e].every(function (v) { return typeof v === 'number' && isFinite(v); }) &&
      b.s < b.n && b.w < b.e && b.s >= -90 && b.n <= 90 && b.w >= -180 && b.e <= 180;
  }

  // ---- Overpass → footprints --------------------------------------------------

  // Small houses and sheds never make the cut; asking Overpass to skip them keeps replies small.
  var SKIP_BUILDINGS = 'house|detached|semidetached_house|terrace|bungalow|cabin|garage|garages|shed|carport|hut|static_caravan|houseboat|roof|ruins|construction|hangar_small';

  // Public Overpass instances, in the order they are tried. All run the standard Overpass
  // software (CORS: Access-Control-Allow-Origin *), so the browser can ask them directly when the
  // server cannot. Usage policies: overpass-api.de asks for < 10,000 queries / 1 GB a day per
  // user and a User-Agent with a contact; the others are run as free public mirrors.
  var OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];

  // Smallest perimeter (m) a footprint of floorSqft can have (a circle: P = 2·√(π·A)). Any
  // building with a shorter outline is smaller than the floor, so Overpass can drop it before
  // sending its geometry: dense neighbourhoods of building=yes houses then cost almost nothing.
  function minPerimeterM(floorSqft) {
    var a = (Number(floorSqft) || 0) / SQFT_PER_M2;
    return a > 0 ? Math.floor(2 * Math.sqrt(Math.PI * a) * 0.97) : 0;
  }

  // opts: { timeout: s (20), floorSqft: ft² (0 = no size filter) }
  function overpassQuery(b, opts) {
    opts = opts || {};
    var box = [b.s, b.w, b.n, b.e].join(',');
    var f = '["building"]["building"!~"^(' + SKIP_BUILDINGS + ')$"]';
    var p = minPerimeterM(opts.floorSqft);
    var size = p ? '(if:length()>' + p + ')' : '';
    var t = Math.max(5, Math.min(60, Math.round(Number(opts.timeout) || 20)));
    return '[out:json][timeout:' + t + '];(way' + f + size + '(' + box + ');relation' + f + '["type"="multipolygon"](' + box + '););out tags geom qt;';
  }

  // The four quarters of a bbox (a dense map square asked for in smaller pieces).
  function quarterBbox(b) {
    var ms = round6((b.s + b.n) / 2), mw = round6((b.w + b.e) / 2);
    return [{ s: b.s, w: b.w, n: ms, e: mw }, { s: b.s, w: mw, n: ms, e: b.e }, { s: ms, w: b.w, n: b.n, e: mw }, { s: ms, w: mw, n: b.n, e: b.e }];
  }

  // An Overpass answer that is usable: elements present and no runtime error in "remark"
  // (a timed-out query comes back 200 with partial elements; never keep those).
  function overpassOk(j) {
    return !!(j && Array.isArray(j.elements) && !(j.remark && /error|timed out|out of memory|abort/i.test(String(j.remark))));
  }

  // Raw Overpass elements sent by a browser → only what parseOverpass reads, checked and capped.
  // Returns { elements, dropped } or null when the list itself is not acceptable.
  var EL_MAX = 20000, NODES_MAX = 4000, MEMBERS_MAX = 400;
  function cleanElements(list, bbox) {
    if (!Array.isArray(list) || list.length > EL_MAX) return null;
    var margin = 0.01;
    var box = bbox ? { s: bbox.s - margin, w: bbox.w - margin, n: bbox.n + margin, e: bbox.e + margin } : null;
    function pt(q) {
      if (!q || typeof q !== 'object') return null;
      var lat = q.lat, lon = q.lon;
      if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      return { lat: lat, lon: lon };
    }
    function geom(g) {
      if (!Array.isArray(g) || g.length < 3 || g.length > NODES_MAX) return null;
      var out = [];
      for (var i = 0; i < g.length; i++) { var q = pt(g[i]); if (!q) return null; out.push(q); }
      if (box && !out.some(function (q) { return inBbox([q.lat, q.lon], box); })) return null;
      return out;
    }
    function tags(t) {
      var o = {};
      if (!t || typeof t !== 'object' || Array.isArray(t)) return o;
      Object.keys(t).slice(0, 200).forEach(function (k) { if (typeof t[k] === 'string' || typeof t[k] === 'number') o[String(k).slice(0, 60)] = String(t[k]).slice(0, 200); });
      return o;
    }
    var out = [], dropped = 0, seen = {};
    list.forEach(function (el) {
      if (!el || (el.type !== 'way' && el.type !== 'relation')) { dropped++; return; }
      var id = Number(el.id);
      if (!(id > 0 && id < 1e15 && Math.floor(id) === id) || seen[el.type + id]) { dropped++; return; }
      var t = tags(el.tags);
      if (!t.building) { dropped++; return; }
      if (el.type === 'way') {
        var g = geom(el.geometry);
        if (!g) { dropped++; return; }
        out.push({ type: 'way', id: id, tags: t, geometry: g });
      } else {
        if (!Array.isArray(el.members) || el.members.length > MEMBERS_MAX) { dropped++; return; }
        var ms = [];
        el.members.forEach(function (m) {
          if (!m || m.type !== 'way') return;
          var mg = Array.isArray(m.geometry) && m.geometry.length >= 2 && m.geometry.length <= NODES_MAX ? m.geometry.map(pt) : null;
          if (!mg || mg.some(function (q) { return !q; })) return;
          ms.push({ type: 'way', role: m.role === 'inner' ? 'inner' : 'outer', geometry: mg });
        });
        if (!ms.length || (box && !ms.some(function (m) { return m.geometry.some(function (q) { return inBbox([q.lat, q.lon], box); }); }))) { dropped++; return; }
        out.push({ type: 'relation', id: id, tags: t, members: ms });
      }
      seen[el.type + id] = 1;
    });
    return { elements: out, dropped: dropped };
  }

  var KEEP_TAGS = /^(name|building|amenity|shop|office|craft|industrial|healthcare|religion|denomination|landuse|operator|brand|building:levels|building:use|start_date|roof:material|roof:shape|addr:housenumber|addr:street|addr:city|addr:postcode|addr:state)$/;

  function pickTags(t) {
    var o = {};
    Object.keys(t || {}).forEach(function (k) { if (KEEP_TAGS.test(k)) o[k] = String(t[k]).slice(0, 120); });
    return o;
  }

  function geomToRing(g) {
    var r = (g || []).filter(Boolean).map(function (p) { return [round6(p.lat), round6(p.lon)]; });
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    return r;
  }

  // Join a relation's member ways (outer or inner) into closed rings.
  function joinWays(parts) {
    var open = parts.map(function (p) { return p.slice(); }).filter(function (p) { return p.length > 1; });
    var rings = [];
    var same = function (a, b) { return a[0] === b[0] && a[1] === b[1]; };
    while (open.length) {
      var cur = open.shift();
      var guard = 0;
      while (!same(cur[0], cur[cur.length - 1]) && guard++ < 500) {
        var end = cur[cur.length - 1], hit = -1, rev = false;
        for (var i = 0; i < open.length; i++) {
          if (same(open[i][0], end)) { hit = i; break; }
          if (same(open[i][open[i].length - 1], end)) { hit = i; rev = true; break; }
        }
        if (hit < 0) break;
        var nxt = open.splice(hit, 1)[0];
        if (rev) nxt.reverse();
        cur = cur.concat(nxt.slice(1));
      }
      if (same(cur[0], cur[cur.length - 1])) cur.pop();
      if (cur.length >= 3) rings.push(cur);
    }
    return rings;
  }

  // Overpass JSON → [{ id, rings, areaSqft, lat, lng, tags }], biggest first.
  // Keeps footprints of at least floorSqft (the cache keeps more than one scan needs,
  // so a later scan with a smaller minimum still hits the cache).
  function parseOverpass(json, floorSqft) {
    var out = [];
    ((json && json.elements) || []).forEach(function (el) {
      var rings = null, extraM2 = 0;
      if (el.type === 'way' && el.geometry) {
        var r = geomToRing(el.geometry);
        if (r.length >= 3) rings = [r];
      } else if (el.type === 'relation' && el.members) {
        var raw = function (m) { return (m.geometry || []).filter(Boolean).map(function (q) { return [round6(q.lat), round6(q.lon)]; }); };
        var ways = el.members.filter(function (m) { return m.type === 'way' && m.geometry; });
        var outers = joinWays(ways.filter(function (m) { return m.role !== 'inner'; }).map(raw));
        var inners = joinWays(ways.filter(function (m) { return m.role === 'inner'; }).map(raw));
        if (outers.length) {
          outers.sort(function (a, b) { return ringAreaM2(b) - ringAreaM2(a); });
          // Largest outer is the outline; holes inside it subtract; extra outers add.
          var main = outers[0];
          rings = [main].concat(inners.filter(function (h) { return pointInRing(h[0], main); }));
          var extra = outers.slice(1).reduce(function (t, o) { return t + ringAreaM2(o); }, 0);
          extraM2 = extra;
        }
      }
      if (!rings) return;
      var sqft = polygonSqft(rings) + extraM2 * SQFT_PER_M2;
      if (sqft < (floorSqft || 0)) return;
      var p = pointOnSurface(rings);
      out.push({
        id: (el.type === 'way' ? 'w' : 'r') + el.id,
        rings: rings,
        areaSqft: Math.round(sqft),
        lat: round6(p[0]),
        lng: round6(p[1]),
        tags: pickTags(el.tags)
      });
    });
    return out.sort(function (a, b) { return b.areaSqft - a.areaSqft; });
  }

  function osmAddress(tags) {
    tags = tags || {};
    var street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    if (!street) return '';
    return [street, tags['addr:city'], [tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }

  // ---- Building type ------------------------------------------------------------

  var TYPES = [
    { id: 'commercial', label: 'Commercial' },
    { id: 'industrial', label: 'Industrial' },
    { id: 'institutional', label: 'Institutional' },
    { id: 'multifamily', label: 'Multifamily' },
    { id: 'church', label: 'Church' },
    { id: 'school', label: 'School' },
    { id: 'other', label: 'Other / unknown' }
  ];

  function classify(tags, landUse) {
    var t = tags || {};
    var b = String(t.building || '').toLowerCase(), am = String(t.amenity || '').toLowerCase();
    var lu = String(landUse || '').toUpperCase();
    if (/^(church|chapel|cathedral|mosque|temple|synagogue|religious|shrine)$/.test(b) || am === 'place_of_worship') return 'church';
    if (/^(school|university|college|kindergarten)$/.test(b) || /^(school|college|university|kindergarten)$/.test(am)) return 'school';
    if (/^(industrial|warehouse|manufacture|factory|storage_tank|depot)$/.test(b) || t.industrial || t.craft) return 'industrial';
    if (/^(hospital|government|civic|public|fire_station|transportation|train_station|military|courthouse)$/.test(b) ||
      /^(hospital|clinic|townhall|courthouse|library|fire_station|police|community_centre|social_facility|prison)$/.test(am)) return 'institutional';
    if (/^(apartments|dormitory)$/.test(b)) return 'multifamily';
    if (/^(commercial|retail|office|supermarket|hotel|kiosk|service|shop|mall|restaurant)$/.test(b) || t.shop || t.office ||
      /^(restaurant|fast_food|bank|fuel|cinema|car_wash|marketplace|cafe|pharmacy|veterinary|nightclub)$/.test(am)) return 'commercial';
    // Building tag says nothing: fall back to the county's land use.
    if (lu) {
      if (/CHURCH|RELIG|WORSHIP/.test(lu)) return 'church';
      if (/SCHOOL|EDUC|COLLEGE|UNIVERS/.test(lu)) return 'school';
      if (/INDUS|WAREH|MANUF|DISTRIB|FACTOR|STORAGE/.test(lu)) return 'industrial';
      if (/APART|MULTI|DORM/.test(lu)) return 'multifamily';
      if (/GOV|HOSPITAL|INSTITU|PUBLIC|EXEMPT|MEDICAL|UTILIT/.test(lu)) return 'institutional';
      if (/COMM|RETAIL|OFFICE|SHOP|HOTEL|MOTEL|RESTAUR|STORE|BANK|SERVICE/.test(lu)) return 'commercial';
    }
    if (b === 'residential' && lu && /MULTI|APART/.test(lu)) return 'multifamily';
    return 'other';
  }

  var DEFAULT_RESIDENTIAL = '(single[ -]*fam|\\bSFR\\b|\\bSF RES|mobile home|manufactured home|duplex|townh(ouse|ome)|\\bcondo(minium)?\\b|^\\s*res(idential)?\\s*$|residential (improved|vacant|1)|^\\s*R[- ]?1\\b)';

  // Single-family / small residential by the county's land use: these are skipped.
  function isSingleFamily(landUse, pattern) {
    var lu = String(landUse || '').trim();
    if (!lu) return false;
    if (/MULTI|APART|COMMERC|INDUST|CHURCH|SCHOOL|OFFICE|RETAIL/i.test(lu)) return false;
    var re;
    try { re = new RegExp(pattern || DEFAULT_RESIDENTIAL, 'i'); } catch (e) { re = new RegExp(DEFAULT_RESIDENTIAL, 'i'); }
    return re.test(lu);
  }

  // ---- Parcels (ArcGIS attributes → one shape) ------------------------------------

  var FIELD_CANDIDATES = {
    id: ['PARCELID', 'PARCEL_ID', 'PARID', 'PIN', 'APN', 'PARCELNO', 'PARCEL_NO', 'PARCELNUMBER', 'PARCEL'],
    owner: ['OWNER', 'OWNERNAME', 'OWNER_NAME', 'OWNNAME', 'OWN1', 'OWNER1', 'OWNERS', 'OWNER_1'],
    owner2: ['OWNER2', 'OWN2', 'OWNER_2', 'CAREOF', 'CARE_OF'],
    mail: ['OWNADDR', 'OWNERADDRESS', 'OWNER_ADDRESS', 'OWNER_ADDR', 'MAILADDR', 'MAIL_ADDR', 'MAILADDRESS', 'MAILING_ADDRESS', 'MAILINGADDRESS', 'OWNADR', 'MADDR1', 'ADDR1'],
    mailCity: ['OWNCITY', 'OWNER_CITY', 'MAIL_CITY', 'MAILCITY', 'MCITY', 'CITY_OWNER'],
    mailState: ['OWNSTATE', 'OWNER_STATE', 'MAIL_STATE', 'MAILSTATE', 'MSTATE', 'STATE_OWNER'],
    mailZip: ['OWNZIP', 'OWNER_ZIP', 'MAIL_ZIP', 'MAILZIP', 'MZIP', 'ZIP_OWNER'],
    situs: ['PAR_ADR', 'PROPERTYADDRESS', 'PROPERTY_ADDRESS', 'SITUS', 'SITUSADDR', 'SITUS_ADDR', 'SITE_ADDR', 'SITEADDRESS', 'ADRLABEL', 'LOCATION', 'PROP_ADDR', 'ADDRESS', 'FULLADDR'],
    landUse: ['LUC_DESC', 'LANDUSE_DESC', 'LUCDESC', 'LAND_USE_DESC', 'CLASS_DESC', 'USEDESC', 'USE_DESC', 'PROPCLASSDESC', 'LANDUSE', 'LAND_USE', 'LUC', 'LUCODE', 'USECODE', 'PROPCLASS', 'CLASS', 'PARCELTYPE'],
    yearBuilt: ['YRBLT', 'YEARBUILT', 'YEAR_BUILT', 'YR_BUILT', 'YRBUILT', 'BLTYR', 'EFFYR', 'ACTYRBLT'],
    bldgSqft: ['SFLA', 'BLDG_SQFT', 'BLDGSQFT', 'TOTALLIVAREA', 'TOT_SQFT', 'BLDGAREA', 'BLDG_AREA', 'GROSSAREA', 'GROSS_AREA', 'SQFT', 'IMPSQFT', 'TOTAL_SQFT']
  };

  function pickField(attrs, names) {
    var keys = Object.keys(attrs || {});
    var up = {};
    keys.forEach(function (k) { up[k.toUpperCase()] = k; });
    for (var i = 0; i < names.length; i++) {
      var k2 = up[names[i]];
      if (k2 === undefined) continue;
      var v = attrs[k2];
      if (v !== null && v !== undefined && String(v).trim() !== '') return v;
    }
    return null;
  }
  function clean(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }

  function parcelFromAttrs(attrs, source) {
    var f = function (k) { return pickField(attrs, FIELD_CANDIDATES[k]); };
    var mailLine = clean(f('mail'));
    var cityLine = [clean(f('mailCity')), [clean(f('mailState')), clean(f('mailZip'))].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var yb = Number(f('yearBuilt'));
    var sq = Number(String(f('bldgSqft') || '').replace(/,/g, ''));
    return {
      id: clean(f('id')),
      owner: [clean(f('owner')), clean(f('owner2'))].filter(Boolean).join(' / '),
      mail: [mailLine, cityLine].filter(Boolean).join(', '),
      situs: clean(f('situs')),
      landUse: clean(f('landUse')),
      yearBuilt: yb >= 1800 && yb <= 2100 ? yb : null,
      bldgSqft: sq > 0 ? Math.round(sq) : null,
      county: source || ''
    };
  }

  // Esri rings are [x, y] = [lng, lat].
  function esriRings(geom) {
    return ((geom && geom.rings) || []).map(function (r) { return r.map(function (p) { return [round6(p[1]), round6(p[0])]; }); });
  }

  // ---- Counties --------------------------------------------------------------------

  var COUNTIES = {
    shelby: { label: 'Shelby County, TN', bbox: { s: 34.98, w: -90.32, n: 35.43, e: -89.63 }, assessor: 'https://www.assessormelvinburgess.com/', assessorName: 'Shelby County Assessor of Property' },
    desoto: { label: 'DeSoto County, MS', bbox: { s: 34.64, w: -90.31, n: 35.01, e: -89.72 }, assessor: 'https://www.desotocountyms.gov/', assessorName: 'DeSoto County Tax Assessor' },
    crittenden: { label: 'Crittenden County, AR', bbox: { s: 34.92, w: -90.60, n: 35.45, e: -90.03 }, assessor: 'https://www.arcountydata.com/', assessorName: 'Arkansas county assessor records' }
  };

  // Rough county for the "look up" link only (parcels are matched by their real polygons).
  function countyOf(lat, lng) {
    if (lat < 34.995 && lng > -90.32 && lng < -89.72) return 'desoto';
    if (lng < -90.135 && lat > 34.9) return 'crittenden';
    if (inBbox([lat, lng], COUNTIES.shelby.bbox)) return 'shelby';
    return '';
  }

  // ---- Hail: SPC storm report CSV ------------------------------------------------------

  // file day "251010" → reports with UTC timestamps. SPC's day runs 12Z–11:59Z, so a
  // report time before 1200 happened the next calendar day (UTC).
  function parseSpcCsv(text, yymmdd, bbox) {
    var m = /^(\d\d)(\d\d)(\d\d)$/.exec(yymmdd || '');
    if (!m) return [];
    var y = 2000 + Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line || /^\s*Time\s*,/i.test(line)) return;
      var parts = line.split(',');
      if (parts.length < 7) return;
      var hhmm = parts[0].trim(), size = Number(parts[1]), lat = Number(parts[5]), lng = Number(parts[6]);
      if (!/^\d{3,4}$/.test(hhmm) || !(size > 0) || !isFinite(lat) || !isFinite(lng)) return;
      if (lng > 0) lng = -lng;                      // some files drop the minus on west longitudes
      if (bbox && !inBbox([lat, lng], bbox)) return;
      hhmm = ('0' + hhmm).slice(-4);
      var h = Number(hhmm.slice(0, 2)), mi = Number(hhmm.slice(2));
      var ts = Date.UTC(y, mo, d + (h < 12 ? 1 : 0), h, mi);
      out.push({ ts: ts, sizeIn: size / 100, lat: lat, lng: lng, place: (parts[2] || '').trim() + ', ' + (parts[4] || '').trim(), county: (parts[3] || '').trim() });
    });
    return out;
  }

  function yymmdd(ts) {
    var d = new Date(ts);
    return String(d.getUTCFullYear()).slice(2) + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2);
  }

  // SPC file days covering the last `days` days before `now`.
  function spcDays(days, now) {
    var out = [];
    // The file named for day D covers D 12Z → D+1 12Z; include one extra for the overlap.
    for (var i = 0; i <= days; i++) out.push(yymmdd(now - i * 864e5));
    return out;
  }

  // Biggest hail within radiusMi in the last `days` days (ties: most recent).
  function hailNear(pt, reports, days, now, radiusMi) {
    var r = radiusMi || 2, best = null;
    (reports || []).forEach(function (h) {
      if (now - h.ts > days * 864e5 || h.ts > now + 864e5) return;
      var dm = distanceMi(pt, [h.lat, h.lng]);
      if (dm > r) return;
      if (!best || h.sizeIn > best.sizeIn || (h.sizeIn === best.sizeIn && h.ts > best.ts)) best = { sizeIn: h.sizeIn, ts: h.ts, distMi: Math.round(dm * 10) / 10, place: h.place };
    });
    return best;
  }

  // ---- Addresses, dedupe, do-not-contact -------------------------------------------

  var SUFFIX = { STREET: 'ST', ROAD: 'RD', AVENUE: 'AVE', AV: 'AVE', BOULEVARD: 'BLVD', DRIVE: 'DR', LANE: 'LN', PARKWAY: 'PKWY', PKY: 'PKWY', HIGHWAY: 'HWY', COURT: 'CT', CIRCLE: 'CIR', PLACE: 'PL', COVE: 'CV', TERRACE: 'TER', TRAIL: 'TRL', SQUARE: 'SQ', PLAZA: 'PLZ', EXTENDED: 'EXT', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W' };

  // "123 Main Street, Bartlett, TN 38135" → "123 MAIN ST". '' when no house number.
  function normAddress(a) {
    var s = String(a || '').split(',')[0].toUpperCase().replace(/[.#]/g, ' ').replace(/\b(STE|SUITE|UNIT|APT|BLDG)\b.*$/, '');
    var words = s.replace(/[^A-Z0-9 -]/g, ' ').split(/\s+/).filter(Boolean).map(function (w) { return SUFFIX[w] || w; });
    if (!words.length || !/^\d/.test(words[0])) return '';
    return words.join(' ');
  }
  function normId(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function normName(v) { return String(v || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(LLC|INC|CORP|CO|LP|LLP|LTD|THE)\b/g, ' ').replace(/\s+/g, ' ').trim(); }

  // The lead that already covers this site, if any.
  function findExisting(site, leads) {
    var pid = site.parcel && normId(site.parcel.id);
    var addrs = [site.parcel && site.parcel.situs, site.address].map(normAddress).filter(Boolean);
    var rings = site.outline ? [site.outline] : site.rings;
    for (var i = 0; i < (leads || []).length; i++) {
      var l = leads[i];
      if (!l) continue;
      if (l.scanId && l.scanId === site.id) return l;
      if (pid && l.parcel && normId(l.parcel.id) === pid) return l;
      var la = normAddress(l.address);
      if (la && addrs.indexOf(la) > -1) return l;
      if (rings && typeof l.lat === 'number' && typeof l.lng === 'number' && pointInRings([l.lat, l.lng], rings)) return l;
    }
    return null;
  }

  // Do-not-contact list: one owner name or parcel id per line. True when this site matches.
  function dncList(text) {
    return String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && s[0] !== '#'; });
  }
  function isDnc(parcel, list) {
    if (!parcel || !list || !list.length) return false;
    var id = normId(parcel.id), owners = String(parcel.owner || '').split(' / ').map(normName).filter(Boolean);
    return list.some(function (line) {
      var n = normName(line), i2 = normId(line);
      if (id && i2 && i2 === id) return true;
      return !!n && owners.indexOf(n) > -1;
    });
  }

  // ---- Score -------------------------------------------------------------------------

  var DEFAULT_WEIGHTS = { size: 30, age: 30, hail: 20, type: 10, distance: 10 };
  var TYPE_VALUE = { commercial: 1, industrial: 1, institutional: 0.8, church: 0.8, multifamily: 0.7, school: 0.6, other: 0.5 };
  var HOME = { lat: 35.2010, lng: -89.8703, label: 'Bartlett' };   // GrayCo, 5796 Ferguson Rd, Bartlett TN

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function fmtNum(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtIn(v) { return String(Number(v.toFixed(2))) + '"'; }

  // site: { areaSqft, lat, lng, type, parcel: { yearBuilt }, permit: { date } | null,
  //         permitsChecked, hail: { sizeIn, ts } | null }
  // opts: { weights, now, home, permitsSince ('2021-01-01'), hailDays }
  // → { score 0–100, reasons: [...], parts: { size, age, hail, type, distance } }
  function score(site, opts) {
    opts = opts || {};
    var w = Object.assign({}, DEFAULT_WEIGHTS, opts.weights || {});
    var now = opts.now || Date.now();
    var year = new Date(now).getUTCFullYear();
    var home = opts.home || HOME;
    var reasons = [], parts = {}, penalty = 0;

    var area = Number(site.areaSqft) || 0;
    parts.size = clamp01(Math.log(Math.max(area, 1) / 5000) / Math.log(250000 / 5000));
    reasons.push(fmtNum(Math.round(area / 100) * 100) + ' ft²');

    var yb = site.parcel && site.parcel.yearBuilt;
    var built = null;
    if (yb) {
      built = yb < 2005 ? 0.7 + clamp01((2005 - yb) / 25) * 0.3 : clamp01((year - yb) / 20) * 0.6;
      reasons.push('built ' + yb);
    }
    var age = built == null ? 0.4 : built;
    var since = opts.permitsSince || '2021-01-01';
    var sinceYear = Number(String(since).slice(0, 4)) || year;
    if (site.permit && site.permit.date) {
      var pYears = (now - Date.parse(site.permit.date)) / (365.25 * 864e5);
      var py = String(site.permit.date).slice(0, 4);
      if (pYears < 7) {
        age = 0; penalty = 15;
        reasons.push('roof permit ' + py + ' (likely replaced)');
      } else if (pYears >= 20) {
        age = Math.max(age, 1);
        reasons.push('last roof permit ' + py);
      } else {
        age = Math.max(built == null ? 0 : built * 0.5, 0.2 + (pYears - 7) / 13 * 0.6);
        reasons.push('last roof permit ' + py);
      }
    } else if (site.permitsChecked) {
      if (year - sinceYear >= 20) { age = 1; reasons.push('no roof permit since ' + sinceYear); }
      else reasons.push('no roof permit on file since ' + sinceYear);
    }
    parts.age = age;

    var h = site.hail;
    if (h && h.sizeIn) {
      parts.hail = h.sizeIn >= 1.75 ? 1 : h.sizeIn >= 1 ? 0.85 : h.sizeIn >= 0.75 ? 0.6 : 0.35;
      var ago = Math.max(0, Math.round((now - h.ts) / 864e5));
      reasons.push(fmtIn(h.sizeIn) + ' hail ' + (ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago'));
    } else parts.hail = 0;

    parts.type = TYPE_VALUE[site.type] != null ? TYPE_VALUE[site.type] : 0.5;
    if (site.type && site.type !== 'other') reasons.push(site.type);

    var d = distanceMi([home.lat, home.lng], [site.lat, site.lng]);
    parts.distance = clamp01(1 - (d - 5) / 35);
    reasons.push(Math.round(d) + ' mi from ' + (home.label || 'the office'));

    var tw = 0, sum = 0;
    Object.keys(parts).forEach(function (k) { var wk = Math.max(0, Number(w[k]) || 0); tw += wk; sum += wk * parts[k]; });
    var s = tw ? Math.round(100 * sum / tw) - penalty : 0;
    return { score: Math.max(0, Math.min(100, s)), reasons: reasons, parts: parts };
  }

  var api = {
    SQFT_PER_M2: SQFT_PER_M2, TILE_LAT: TILE_LAT, TILE_LNG: TILE_LNG, MAX_TILES: MAX_TILES,
    TYPES: TYPES, COUNTIES: COUNTIES, HOME: HOME, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, DEFAULT_RESIDENTIAL: DEFAULT_RESIDENTIAL,
    FIELD_CANDIDATES: FIELD_CANDIDATES,
    ringAreaM2: ringAreaM2, polygonSqft: polygonSqft, haversineM: haversineM, distanceMi: distanceMi,
    pointInRing: pointInRing, pointInRings: pointInRings, ringCentroid: ringCentroid, pointOnSurface: pointOnSurface,
    tileId: tileId, parseTile: parseTile, tileBbox: tileBbox, tilesForBbox: tilesForBbox, bboxAreaMi2: bboxAreaMi2,
    inBbox: inBbox, bboxesTouch: bboxesTouch, validBbox: validBbox,
    OVERPASS_ENDPOINTS: OVERPASS_ENDPOINTS, EL_MAX: EL_MAX, minPerimeterM: minPerimeterM, quarterBbox: quarterBbox, overpassOk: overpassOk, cleanElements: cleanElements,
    overpassQuery: overpassQuery, parseOverpass: parseOverpass, joinWays: joinWays, osmAddress: osmAddress,
    classify: classify, isSingleFamily: isSingleFamily,
    pickField: pickField, parcelFromAttrs: parcelFromAttrs, esriRings: esriRings, countyOf: countyOf,
    parseSpcCsv: parseSpcCsv, yymmdd: yymmdd, spcDays: spcDays, hailNear: hailNear,
    normAddress: normAddress, normId: normId, normName: normName, findExisting: findExisting, dncList: dncList, isDnc: isDnc,
    score: score
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scan = api;
})(this);
