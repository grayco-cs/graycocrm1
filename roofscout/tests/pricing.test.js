// Run with:  node roofscout/tests/pricing.test.js
'use strict';
var assert = require('assert');
var P = require('../js/pricing.js');

var near = function (a, b) { assert.ok(Math.abs(a - b) < 0.01, a + ' != ' + b); };

// The example confirmed with the client: $190K cost at 35% margin = $292K (not $256.5K markup).
near(P.priceAtMargin(190000, 35), 292307.69);
near(P.priceAtMargin(100, 0), 100);
assert.throws(function () { P.priceAtMargin(100, 100); });

// material + labor per ft², times area.
var tpo = { mat: 3.5, labor: 3 };
near(P.costPerSqft(tpo), 6.5);
near(P.jobCost(20000, tpo), 130000);

var q = P.quote(20000, tpo, { low: 25, mid: 35, high: 45 });
near(q.cost, 130000);
near(q.low, 130000 / 0.75);
near(q.mid, 130000 / 0.65);
near(q.high, 130000 / 0.55);
assert.ok(q.low < q.mid && q.mid < q.high);

// Coating: 32,000 ft² = 320 squares; $165–$250/square; 100 gallons @ $197.
var c = P.coating(32000, { low: 165, high: 250, galPrice: 197, galCoverage: 320 });
near(c.squares, 320);
near(c.low, 52800);
near(c.high, 80000);
near(c.gallons, 100);
near(c.materialCost, 19700);

near(P.weighted(100000, 'New'), 10000);
near(P.weighted(100000, 'Contacted'), 30000);
near(P.weighted(100000, 'Quoted'), 60000);
near(P.weighted(100000, 'Won'), 100000);
near(P.weighted(100000, 'Lost'), 0);

console.log('pricing: all tests passed');
