// Run with:  node roofscout/tests/pricing.test.js
'use strict';
var assert = require('assert');
var P = require('../js/pricing.js');

var near = function (a, b) { assert.ok(Math.abs(a - b) < 0.01, a + ' != ' + b); };

// True gross margin, not markup: $190K cost at 35% = $292K (not $256.5K).
near(P.priceAtMargin(190000, 35), 292307.69);
near(P.priceAtMargin(100, 0), 100);
assert.throws(function () { P.priceAtMargin(100, 100); });

// material + labor per ft², times area.
var tpo = { mat: 3.5, labor: 3, perSquare: 1000 };
near(P.costPerSqft(tpo), 6.5);
near(P.jobCost(20000, tpo), 130000);

// TPO re-roof: $1,000 per square. 20,000 ft² = 200 squares = $200,000.
var e = P.estimate(20000, tpo, 35);
assert.strictEqual(e.basis, 'square');
near(e.squares, 200);
near(e.price, 200000);
near(e.cost, 130000);
near(e.margin, 35);

// No per-square price: cost ÷ (1 − margin).
var epdm = { mat: 3, labor: 2.75 };
var e2 = P.estimate(10000, epdm, 35);
assert.strictEqual(e2.basis, 'margin');
near(e2.cost, 57500);
near(e2.price, 57500 / 0.65);
near(e2.margin, 35);

near(P.approx(88461.54), 88500);
near(P.approx(200000), 200000);

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
