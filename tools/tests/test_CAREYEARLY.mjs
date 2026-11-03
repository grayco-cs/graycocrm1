/* patch CAREYEARLY — the GrayCo Care tier cards follow the Monthly / Yearly switch (owner 11/03: "Yearly selected, the cards
   still show the monthly prices"). node tools/tests/test_CAREYEARLY.mjs — made-up numbers only, nothing leaves this computer.
   · the page's tierPrice(): Monthly → "from $39/mo"; Yearly → the yearly price the owner set, else 12 × monthly less the yearly discount (10%) "/yr · save 10%"
   · the switch repaints the cards (they read tierPrice, not t.monthly)
   · the server sends tiers[].yearly only when a yearly price is set (_lib/maint.js settingsOf keeps settings.yearly) */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };
const page = fs.readFileSync(path.join(ROOT, 'portal-plus.js'), 'utf8');
const src = page.slice(page.indexOf('function tierPrice(t){'), page.indexOf('function priceOf(k){'));
ok(src.length > 50, 'portal-plus.js has tierPrice()');
const ctx = { ui: { billing: 'monthly' } }; vm.createContext(ctx); vm.runInContext(src, ctx);
const tp = t => vm.runInContext('tierPrice(' + JSON.stringify(t) + ')', ctx);
ok(tp({ monthly: 39 }) === 'from $39/mo', 'Monthly: from $39/mo', tp({ monthly: 39 }));
ctx.ui.billing = 'yearly';
ok(tp({ monthly: 39 }) === 'from $421.20/yr · paid once a year: save 10%' && tp({ monthly: 59 }).startsWith('from $637.20/yr') && tp({ monthly: 89 }).startsWith('from $961.20/yr'), 'Yearly default: 12 × monthly less 10% ($421.20 / $637.20 / $961.20), "save 10%"', [tp({ monthly: 39 }), tp({ monthly: 59 }), tp({ monthly: 89 })]);
ok(tp({ monthly: 39, yearlyDiscount: 15 }) === 'from $397.80/yr · paid once a year: save 15%' && tp({ monthly: 39, yearlyDiscount: 0 }) === 'from $468/yr', 'the discount comes from the settings (15% → $397.80; 0 → $468, no "save")', [tp({ monthly: 39, yearlyDiscount: 15 }), tp({ monthly: 39, yearlyDiscount: 0 })]);
ok(tp({ monthly: 39, yearly: 420 }) === 'from $420/yr', 'an explicit yearly price set by the owner wins', tp({ monthly: 39, yearly: 420 }));
ok(tp({ monthly: 199, yearly: 2149.5 }) === 'from $2,149.50/yr', 'cents and thousands', tp({ monthly: 199, yearly: 2149.5 }));
ok(/'data-tier-price': t\.id, text: tierPrice\(t\)/.test(page) && !/'from \$' \+ t\.monthly \+ '\/mo'/.test(page), 'the tier cards use tierPrice (the switch repaints them: ui.billing → paint())');
ok(/ui\.billing = o\[0\]; paint\(\);/.test(page), 'the Monthly / Yearly buttons repaint');
const M = require(path.join(ROOT, 'netlify/functions/_lib/maint.js'));
const st = M.settingsOf({ yearly: { residential: { bronze: 420, silver: '', gold: -5 }, commercial: { gold: 6500 } } });
ok(st.yearly && st.yearly.residential.bronze === 420 && st.yearly.residential.silver === undefined && st.yearly.residential.gold === undefined && st.yearly.commercial.gold === 6500, 'settingsOf keeps a yearly tier price (positive numbers only)', st.yearly);
ok(M.settingsOf({}).monthly.residential.bronze === 39, 'the monthly prices unchanged');
ok(M.settingsOf({}).yearlyDiscount === 10 && M.settingsOf({ yearlyDiscount: 15 }).yearlyDiscount === 15 && M.settingsOf({ yearlyDiscount: 90 }).yearlyDiscount === 50, 'settingsOf: yearlyDiscount (default 10, at most 50)');
const fn = fs.readFileSync(path.join(ROOT, 'netlify/functions/portal-plus.js'), 'utf8');
ok(/yearly: \(function\(\)\{ const y = st\.yearly && st\.yearly\[/.test(fn), 'the server sends tiers[].yearly (null when not set)');
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
