// RoofScout satellite imagery: the pure parts of the imagery switcher, shared by the page
// (window.Imagery) and the tests (require). No Leaflet and no network of its own: every
// function that needs the network is handed a fetch function.
//
//   sources    Esri World Imagery, Esri World Imagery Clarity (beta), Google satellite
//              (Map Tiles API, through the roofscout-tiles function) and Esri World Imagery
//              Wayback ("Older / leaf-off": every past release since 2014)
//   zoom       native zoom per source, Leaflet layer options (retina), "max detail" test
//   wayback    the release list (waybackconfig.json), releases with new imagery at a spot
//              (tilemap), the capture date of a release at a spot (metadata layer)
//   google     the viewport answer → attribution text and the deepest zoom at a spot
//   choice     the imagery each person picked, remembered per user on this computer
(function (root) {
  'use strict';

  var MAP_MAX = 22;   // the map itself zooms this far; past a source's native zoom tiles are enlarged

  var ESRI_PUBLIC = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var ESRI_KEYED = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/';
  var CLARITY = 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer';
  var WAYBACK = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer';
  var WAYBACK_CONFIG = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
  var TILES_FN = '/.netlify/functions/roofscout-tiles';

  // native: the deepest zoom the source is assumed to have before it is checked at the spot.
  // most:   the deepest zoom worth checking for (Esri metro imagery is z20, sometimes z21;
  //         Google has z21–22 over most US cities).
  var SOURCES = {
    esri:    { id: 'esri', label: 'Esri (standard)', native: 19, most: 21, retina: true, free: true },
    clarity: { id: 'clarity', label: 'Esri Clarity (beta, often sharper)', native: 19, most: 21, retina: true, free: true },
    google:  { id: 'google', label: 'Google satellite', native: 20, most: 22, retina: false, free: false, cloudOnly: true },
    wayback: { id: 'wayback', label: 'Older / leaf-off (Esri Wayback)', native: 19, most: 21, retina: true, free: true }
  };
  var ORDER = ['esri', 'clarity', 'google', 'wayback'];

  function source(id) { return SOURCES[id] || SOURCES.esri; }

  // ---- tiles ----------------------------------------------------------------

  // Leaflet URL template for a source. opts: { esriKey, release (wayback item), ticket (google) }
  function tileUrl(id, opts) {
    opts = opts || {};
    if (id === 'clarity') return CLARITY + '/tile/{z}/{y}/{x}';
    if (id === 'wayback') {
      var it = opts.release;
      if (!it || !it.url) return '';
      return it.url;
    }
    if (id === 'google') return opts.ticket ? TILES_FN + '?z={z}&x={x}&y={y}&t=' + encodeURIComponent(opts.ticket) : '';
    var key = opts.esriKey || '';
    return (key ? ESRI_KEYED : ESRI_PUBLIC) + 'World_Imagery/MapServer/tile/{z}/{y}/{x}' + (key ? '?token=' + encodeURIComponent(key) : '');
  }

  function attribution(id, extra) {
    if (id === 'google') return extra && extra.copyright ? escText(extra.copyright) : 'Imagery © Google';   // Google's own text, as given
    if (id === 'clarity') return 'Powered by Esri · World Imagery Clarity (beta) © Esri, Maxar, Earthstar Geographics, and the GIS User Community';
    if (id === 'wayback') return 'Powered by Esri · World Imagery Wayback' + (extra && extra.date ? ' (release ' + escText(extra.date) + ')' : '') + ' © Esri, Maxar, Earthstar Geographics';
    return 'Powered by Esri · Imagery © Esri, Maxar, Earthstar Geographics';
  }
  function escText(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Leaflet options for a source. With detectRetina Leaflet asks for one zoom level deeper
  // (half-size tiles) on high-density screens, so a level of native zoom is used up by it:
  // maxNativeZoom is lowered by one and maxZoom raised by one (Leaflet lowers it again).
  // Google is never "retina": four times the tiles would be four times the bill.
  function layerOptions(id, native, retinaScreen) {
    var s = source(id);
    var n = Math.max(1, Math.min(MAP_MAX, Number(native) || s.native));
    var r = !!(s.retina && retinaScreen);
    return { maxZoom: MAP_MAX + (r ? 1 : 0), maxNativeZoom: r ? n - 1 : n, detectRetina: r };
  }

  // Past the native zoom the picture is only enlarged.
  function overZoom(mapZoom, native) { return Math.round(Number(mapZoom)) > Number(native); }

  // Slippy-map tile (x = column, y = row) holding a point.
  function tileXY(lat, lng, z) {
    var n = Math.pow(2, z);
    var x = Math.floor((lng + 180) / 360 * n);
    var r = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z: z };
  }

  // ArcGIS tile map ("is there a tile here at this level?"), one tile wide.
  function tilemapUrl(id, z, t, opts) {
    opts = opts || {};
    if (id === 'clarity') return CLARITY + '/tilemap/' + z + '/' + t.y + '/' + t.x + '/1/1';
    if (id === 'wayback') return opts.release ? WAYBACK + '/tilemap/' + opts.release.release + '/' + z + '/' + t.y + '/' + t.x : '';
    if (id === 'esri') {
      var key = opts.esriKey || '';
      return (key ? ESRI_KEYED : ESRI_PUBLIC) + 'World_Imagery/MapServer/tilemap/' + z + '/' + t.y + '/' + t.x + '/1/1' + (key ? '?token=' + encodeURIComponent(key) : '');
    }
    return '';
  }
  function hasTile(j) { return !!(j && Array.isArray(j.data) && j.data[0]); }

  // The deepest zoom an Esri source really has at a point: asks the tile map one level at a
  // time above the assumed native zoom. Any failure keeps what is known (never worse than now).
  function detectNative(fetchFn, id, lat, lng, opts) {
    var s = source(id);
    var best = s.native;
    function step(z) {
      if (z > s.most) return Promise.resolve(best);
      var u = tilemapUrl(id, z, tileXY(lat, lng, z), opts);
      if (!u) return Promise.resolve(best);
      return fetchFn(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!hasTile(j)) return best;
        best = z;
        return step(z + 1);
      }, function () { return best; });
    }
    return step(s.native + 1);
  }

  // ---- Wayback (older imagery) --------------------------------------------------

  // waybackconfig.json: { "<release>": { itemTitle: "World Imagery (Wayback 2026-09-24)", itemURL, metadataLayerUrl, ... } }
  // → newest first: [{ release, date, url (Leaflet template), metadataUrl }]
  function parseWaybackConfig(j) {
    if (!j || typeof j !== 'object') return [];
    return Object.keys(j).map(function (k) {
      var it = j[k] || {};
      var m = /(\d{4}-\d{2}-\d{2})/.exec(it.itemTitle || '');
      if (!m || !/^https:\/\//.test(it.itemURL || '')) return null;
      return {
        release: Number(k),
        date: m[1],
        url: String(it.itemURL).replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}'),
        metadataUrl: it.metadataLayerUrl || ''
      };
    }).filter(function (x) { return x && x.release > 0; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.release - a.release; });
  }

  function previousRelease(items, release) {
    for (var i = 0; i < items.length; i++) if (items[i].release === release) return items[i + 1] ? items[i + 1].release : null;
    return null;
  }
  function byRelease(items, release) { return items.filter(function (x) { return x.release === Number(release); })[0] || null; }

  // Releases with new imagery at a point (the method Esri's Wayback app uses): ask the tile
  // map of the newest release; "select" names the release the picture there really comes from;
  // continue from the release before that one. One request per distinct picture, at most maxSteps.
  function localChanges(fetchFn, items, lat, lng, zoom, maxSteps) {
    var z = Math.max(10, Math.min(19, Math.round(zoom)));
    var t = tileXY(lat, lng, z);
    var out = [];
    var left = maxSteps || 20;
    function ask(rel) {
      if (!rel || left-- <= 0) return Promise.resolve(out);
      return fetchFn(WAYBACK + '/tilemap/' + rel + '/' + z + '/' + t.y + '/' + t.x).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!hasTile(j)) return out;
        var used = j.select && j.select[0] ? Number(j.select[0]) : rel;
        if (out.indexOf(used) < 0 && byRelease(items, used)) out.push(used);
        return ask(previousRelease(items, used));
      }, function () { return out; });
    }
    return ask(items[0] && items[0].release);
  }

  // Each release has a metadata layer with 14 sub-layers: 0 = zoom 23 … 13 = zoom 10.
  function metadataQueryUrl(item, lat, lng, zoom) {
    if (!item || !item.metadataUrl) return '';
    var layer = Math.min(13, Math.max(0, 23 - Math.round(zoom)));
    var p = 'f=json&where=1%3D1&outFields=SRC_DATE2,NICE_DESC,SAMP_RES&returnGeometry=false' +
      '&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects' +
      '&geometry=' + encodeURIComponent(JSON.stringify({ spatialReference: { wkid: 4326 }, x: lng, y: lat }));
    return item.metadataUrl + '/' + layer + '/query?' + p;
  }

  // SRC_DATE2 is an ArcGIS date (ms since 1970); older layers may hold yyyymmdd.
  function dateOf(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    if (n > 19000000 && n < 21001231) { var s = String(Math.round(n)); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
    if (n > 1e11) return new Date(n).toISOString().slice(0, 10);
    var m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(v));
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }

  function parseMetadata(j) {
    var f = j && Array.isArray(j.features) && j.features[0];
    if (!f || !f.attributes) return null;
    var a = f.attributes;
    return { date: dateOf(a.SRC_DATE2), provider: a.NICE_DESC || '', resolution: a.SAMP_RES == null ? null : Number(a.SAMP_RES) };
  }

  // Leaf-off: deciduous trees are bare roughly November–March north of the equator
  // (May–September south of it).
  function isLeafOff(date, lat) {
    var m = date ? Number(String(date).slice(5, 7)) : 0;
    if (!m) return false;
    return (lat == null || lat >= 0) ? (m >= 11 || m <= 3) : (m >= 5 && m <= 9);
  }

  // ---- Google (viewport answer from the roofscout-tiles function) ---------------

  // { copyright: "Imagery ©2026 …", maxZoomRects: [{ maxZoom, north, south, east, west }] }
  // → { copyright, maxZoom } where maxZoom is the deepest zoom over the point (or null).
  function parseViewport(j, lat, lng) {
    if (!j || typeof j !== 'object') return { copyright: '', maxZoom: null };
    var best = null;
    (j.maxZoomRects || []).forEach(function (r) {
      var inLat = lat <= r.north && lat >= r.south;
      var inLng = r.west <= r.east ? (lng >= r.west && lng <= r.east) : (lng >= r.west || lng <= r.east);
      if (inLat && inLng && (best == null || r.maxZoom > best)) best = Number(r.maxZoom);
    });
    return { copyright: String(j.copyright || ''), maxZoom: best };
  }

  // ---- each person's choice -----------------------------------------------------

  var PICK_KEY = 'roofscout.imagery.';
  function pickKey(user) { return PICK_KEY + String(user || 'local').toLowerCase(); }
  function loadPick(storage, user) {
    var p = null;
    try { p = JSON.parse(storage.getItem(pickKey(user)) || 'null'); } catch (e) { /* storage blocked */ }
    p = p && typeof p === 'object' ? p : {};
    return { source: SOURCES[p.source] ? p.source : 'esri', release: Number(p.release) || null };
  }
  function savePick(storage, user, pick) {
    try { storage.setItem(pickKey(user), JSON.stringify({ source: pick.source, release: pick.release || null })); } catch (e) { /* ignore */ }
  }

  var api = {
    MAP_MAX: MAP_MAX, SOURCES: SOURCES, ORDER: ORDER, WAYBACK_CONFIG: WAYBACK_CONFIG, TILES_FN: TILES_FN,
    source: source, tileUrl: tileUrl, attribution: attribution, layerOptions: layerOptions, overZoom: overZoom,
    tileXY: tileXY, tilemapUrl: tilemapUrl, detectNative: detectNative,
    parseWaybackConfig: parseWaybackConfig, previousRelease: previousRelease, byRelease: byRelease, localChanges: localChanges,
    metadataQueryUrl: metadataQueryUrl, parseMetadata: parseMetadata, dateOf: dateOf, isLeafOff: isLeafOff,
    parseViewport: parseViewport, loadPick: loadPick, savePick: savePick, pickKey: pickKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Imagery = api;
})(this);
