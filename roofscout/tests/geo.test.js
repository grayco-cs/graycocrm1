// Run with:  node roofscout/tests/geo.test.js
'use strict';
var assert = require('assert');
var G = require('../js/geo.js');

function within(a, b, pct, msg) { assert.ok(Math.abs(a - b) / b < pct / 100, msg + ': ' + a + ' vs ' + b); }

// A 100 m × 100 m square in Memphis = 10,000 m² = 107,639 ft².
var lat = 35.15, lng = -90.05;
var dLat = 100 / 111194.9;                                   // meters → degrees latitude
var dLng = 100 / (111194.9 * Math.cos(lat * Math.PI / 180)); // meters → degrees longitude
var sq = [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]];
within(G.footprintSqft(sq), 107639, 0.2, '100 m square');
within(G.footprintSqft(sq.slice().reverse()), 107639, 0.2, 'same square traced the other way');

// An L-shaped warehouse: 200 ft × 100 ft plus 100 ft × 100 ft = 30,000 ft².
var ft = 0.3048;
function pt(xFt, yFt) { return [lat + yFt * ft / 111194.9, lng + xFt * ft / (111194.9 * Math.cos(lat * Math.PI / 180))]; }
var L = [pt(0, 0), pt(200, 0), pt(200, 100), pt(100, 100), pt(100, 200), pt(0, 200)];
within(G.footprintSqft(L), 30000, 0.3, 'L-shaped building');

// Pitch: 6/12 adds about 11.8%; flat adds nothing.
within(G.pitchFactor('6'), 1.118, 0.1, '6/12 factor');
assert.strictEqual(G.pitchFactor('flat'), 1);
within(G.roofSqft(L, '6'), 33540, 0.3, 'L-shaped at 6/12');
assert.strictEqual(G.roofSqft(L, 'flat') % 10, 0, 'rounded to 10');

assert.strictEqual(G.footprintSqft([[lat, lng], [lat, lng + dLng]]), 0, 'two points is not an area');

console.log('geo: all tests passed');
