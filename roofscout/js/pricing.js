// RoofScout pricing engine. Pure functions, no DOM, so they can be tested in Node.
//
// Each lead gets ONE approximate estimate:
//   • If the roof type has a price per square (100 ft²), estimate = squares × that price.
//     A TPO re-roof is quoted at $1,000 per square.
//   • Otherwise, estimate = cost ÷ (1 − margin)  (TRUE gross margin, not markup):
//     $190,000 cost at 35% margin = 190,000 ÷ 0.65 = $292,308.
(function (root) {
  'use strict';

  function costPerSqft(roofType) {
    return (Number(roofType.mat) || 0) + (Number(roofType.labor) || 0);
  }

  function jobCost(areaSqft, roofType) {
    return (Number(areaSqft) || 0) * costPerSqft(roofType);
  }

  // marginPct is a whole percent (35 = 35%).
  function priceAtMargin(cost, marginPct) {
    var m = Number(marginPct) / 100;
    if (!(m >= 0) || m >= 1) throw new Error('Margin must be from 0% up to (not including) 100%');
    return cost / (1 - m);
  }

  function estimate(areaSqft, roofType, marginPct) {
    var area = Number(areaSqft) || 0;
    var cost = jobCost(area, roofType);
    var squares = area / 100;
    var perSquare = Number(roofType.perSquare) || 0;
    var price = perSquare > 0 ? squares * perSquare : priceAtMargin(cost, marginPct);
    return {
      cost: cost,
      squares: squares,
      price: price,
      basis: perSquare > 0 ? 'square' : 'margin',
      perSquare: perSquare,
      // What the estimate actually earns, whichever way it was priced.
      margin: price > 0 ? (price - cost) / price * 100 : 0
    };
  }

  // Customer-facing figure: "approximately", rounded to the nearest $100.
  function approx(n) {
    return Math.round((Number(n) || 0) / 100) * 100;
  }

  // Metal roof coating, priced by the square (100 ft²). Material cost is
  // shown separately: gallons needed × price per gallon.
  function coating(areaSqft, c) {
    var squares = (Number(areaSqft) || 0) / 100;
    var gallons = (Number(areaSqft) || 0) / c.galCoverage;
    return {
      squares: squares,
      low: squares * c.low,
      high: squares * c.high,
      gallons: gallons,
      materialCost: gallons * c.galPrice
    };
  }

  // Weighted forecast: each open lead's estimate × its stage's close probability.
  var STAGE_PROB = { New: 0.10, Contacted: 0.30, Quoted: 0.60, Won: 1, Lost: 0 };

  function weighted(value, stage) {
    return (Number(value) || 0) * (STAGE_PROB[stage] || 0);
  }

  var api = {
    costPerSqft: costPerSqft,
    jobCost: jobCost,
    priceAtMargin: priceAtMargin,
    estimate: estimate,
    approx: approx,
    coating: coating,
    weighted: weighted,
    STAGE_PROB: STAGE_PROB
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pricing = api;
})(this);
