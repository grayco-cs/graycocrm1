// Roof measuring from a traced outline. Pure functions, testable in Node.
// Points are [lat, lng]. A roof is small enough that a flat local projection
// around its middle is accurate to well under 1%.
(function (root) {
  'use strict';

  var R = 6371008.8;          // mean Earth radius, meters
  var SQFT_PER_M2 = 10.7639104;

  function centroid(points) {
    var lat = 0, lng = 0;
    points.forEach(function (p) { lat += p[0]; lng += p[1]; });
    return [lat / points.length, lng / points.length];
  }

  // Footprint area in ft² (what you see from above).
  function footprintSqft(points) {
    if (!points || points.length < 3) return 0;
    var c = centroid(points);
    var k = Math.PI / 180, cos = Math.cos(c[0] * k);
    var xy = points.map(function (p) { return [R * (p[1] - c[1]) * k * cos, R * (p[0] - c[0]) * k]; });
    var a = 0;
    for (var i = 0; i < xy.length; i++) {
      var j = (i + 1) % xy.length;
      a += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1];
    }
    return Math.abs(a) / 2 * SQFT_PER_M2;
  }

  // A sloped roof has more surface than its footprint: × √(1 + (rise/12)²).
  var PITCHES = [
    { id: 'flat', label: 'Flat / low-slope', rise: 0 },
    { id: '4', label: '4/12 pitch', rise: 4 },
    { id: '6', label: '6/12 pitch', rise: 6 },
    { id: '8', label: '8/12 pitch', rise: 8 },
    { id: '10', label: '10/12 pitch', rise: 10 },
    { id: '12', label: '12/12 pitch', rise: 12 }
  ];

  function pitchFactor(id) {
    var p = PITCHES.filter(function (x) { return x.id === id; })[0] || PITCHES[0];
    return Math.sqrt(1 + Math.pow(p.rise / 12, 2));
  }

  // Roof surface in ft², rounded to the nearest 10.
  function roofSqft(points, pitchId) {
    return Math.round(footprintSqft(points) * pitchFactor(pitchId) / 10) * 10;
  }

  var api = { centroid: centroid, footprintSqft: footprintSqft, pitchFactor: pitchFactor, roofSqft: roofSqft, PITCHES: PITCHES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geo = api;
})(this);
