// test_SCOPEWORDS.mjs [build-dir] — patch SCOPEWORDS (node, no browser): every scope the CRM writes is wording only.
//   1. window._gcScopeWords (taken from the page) on priced lines → the wording, no amounts; money lines dropped.
//   2. The builders that put prices in a scope now go through it (static checks on the page), and the customer portal's
//      estimate card (netlify/functions/portal.js) lists the sections with no amounts.
// Usage: node test_SCOPEWORDS.mjs [dir with index.html]   (default: this checkout)
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { fileURLToPath } from 'url';
const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const i0 = html.indexOf('<script id="gc-patch-scopewords">'), i1 = html.indexOf('</script>', i0);
ok(i0 > 0 && html.indexOf('__GC_PATCH_SCOPEWORDS__') > 0, 'SCOPEWORDS is in the page');
const win = {}; vm.runInNewContext(html.slice(i0 + '<script id="gc-patch-scopewords">'.length, i1), { window: win });
const W = win._gcScopeWords, L = win._gcScopeWordsLine;
ok(typeof W === 'function' && typeof L === 'function', 'window._gcScopeWords / _gcScopeWordsLine');

const CASES = [
  ['Install 12 sheets drywall — $1,240.00', 'Install 12 sheets drywall'],
  ['Labor 8 hrs @ $65 = $520', 'Labor 8 hrs'],
  ['Subtotal $4,300', ''],
  ['Sales tax (9.75%) $412.50', ''],
  ['Total: $12,500.00', ''],
  ['The total amount of this Proposal is: $12,500.00', ''],
  ['Ms contractors tax (3.5%) = $437.50', ''],
  ['Deposit 50% $6,250', ''],
  ['Roof replacement = $11,500.00', 'Roof replacement'],
  ['Permit 1 350.00 350.00', 'Permit 1'],
  ['Paint walls and ceilings, 2 coats ($2,400)', 'Paint walls and ceilings, 2 coats'],
  ['Outlets 3 x $45.00 = $135.00', 'Outlets 3'],
  ['Tear off shingles @ $85/sq', 'Tear off shingles'],
  ['Drywall - Hang, tape and finish garage - $3,940.53', 'Drywall - Hang, tape and finish garage'],
  ['Kitchen: remove cabinets, haul away debris', 'Kitchen: remove cabinets, haul away debris'],
  ['Unit price: 4.25 — LVP flooring, 450 SF', 'LVP flooring, 450 SF'],
];
for (const [a, want] of CASES) { const got = L(a); ok(got === want, JSON.stringify(a) + ' → ' + JSON.stringify(want), got); }
const block = 'SCOPE OF WORK\n1. Demo - remove old roof = $2,000.00\n2. Install 30 sq shingles — $9,500.00\n3. Gutters 120 LF @ $8.50/LF = $1,020\nSubtotal $12,520\nTax $0\nTotal $12,520';
const out = W(block);
ok(out === 'SCOPE OF WORK\n1. Demo - remove old roof\n2. Install 30 sq shingles\n3. Gutters 120 LF', 'a priced block → numbered wording only, the money lines gone', out);
ok(!/\$|\d+\.\d{2}/.test(out), 'no amount is left anywhere');
ok(JSON.stringify(W([{ desc: 'Frame wall — $800' }, 'Trim 40 LF @ $3', { desc: 'Total $803' }], { lines: true })) === JSON.stringify(['Frame wall', 'Trim 40 LF']), 'estimate lines (objects or text) → cleaned lines');

/* the builders */
ok(html.includes("window._gcScopeWords(items, { lines: true })") && !html.includes("(sub?(' = '+money(sub)):'')"), 'estimate detail → "Generate from estimate" scope: no " = $" per trade');
ok(html.includes('window._gcScopeFromEstimate = scopeFromEstimate;'), 'that builder is shared as window._gcScopeFromEstimate');
ok(!html.includes("(l.total? (' - <b>$'+money(l.total)+'</b>') : '')") && html.includes('patch SCOPEWORDS: no price on a scope line'), 'the GrayCo proposal (Save & Create Proposal / template): no price on a SCOPE OF WORK line; the total line stays', null);
ok(html.includes('The total amount of this Proposal is: $'), '… the proposal\'s total is still printed');
ok(!html.includes("esc(c.cat)+' = '+money(c.total)"), 'the Word proposal: no price on a scope row');
ok((html.match(/patch SCOPEWORDS \*\/\n/g) || []).length >= 0 && (html.match(/W\._gcScopeWords\(t\)/g) || []).length === 2, 'ESTIN\'s "Scope: …" line goes through the helper');
ok(html.includes("labor total at RAW COST (no GrayCo markup) so subs see their price"), 'the sub Scope of Work keeps its labor price (on purpose)');

/* the customer portal's estimate card (server) */
const pj = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'portal.js'), 'utf8');
ok(pj.includes('__GC_PATCH_SCOPEWORDS__') && pj.includes("amount: null }; });"), 'portal.js: the estimate card\'s short scope has no amounts');
const m = /  const scopeWords = (function[\s\S]*?\}\)\.filter\(Boolean\)\.join\('\\n'\); \});/.exec(pj);
let sw = null; try { sw = m ? vm.runInNewContext('(function(){ var s = function(v){ return v == null ? "" : String(v).trim(); }; return ' + m[1].replace(/;$/, '') + '; })()') : null; } catch (e) { sw = null; }
ok(typeof sw === 'function' && sw('Install 12 sheets drywall — $1,240.00\nSubtotal $4,300\nLabor 8 hrs @ $65 = $520') === 'Install 12 sheets drywall\nLabor 8 hrs', 'portal.js scopeWords: the same rule', sw && sw('Install 12 sheets drywall — $1,240.00\nSubtotal $4,300\nLabor 8 hrs @ $65 = $520'));

console.log(`SCOPEWORDS ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
