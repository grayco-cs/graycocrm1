// estbig_repair_offline.mjs <mirror.json> [--html index.html] [--md report.md] [--json plan.json]
// DRY RUN ONLY (reads a local mirror of gc_kv, writes nothing anywhere but the optional report files).
// Plans patch ESTBIG's estimate line clean-up with the SAME code the page runs: the plan() of the
// <script id="gc-patch-estbig"> block is loaded out of index.html, so this report and _gcEstDedupe({ dryRun: true })
// in the browser cannot disagree. For each estimate whose lines repeat: lines / mats / labor before -> after (one copy
// of each line, in order, the first copy kept, quantities NOT added up), size, the stored total, what every line adds
// up to, what one copy of each line adds up to, and whether the total changes ("owner to check" when it does).
// The mirror is customer data: keep it and the reports outside git.
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { fileURLToPath } from 'url';
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const MIRROR = args[0];
if (!MIRROR || MIRROR.startsWith('--')) { console.error('usage: node estbig_repair_offline.mjs <mirror.json> [--html index.html] [--md out.md] [--json out.json]'); process.exit(2); }
const HTML = opt('--html') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');

/* the page's own plan() */
const html = fs.readFileSync(HTML, 'utf8');
const m = /<script id="gc-patch-estbig">([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.error('index.html has no patch ESTBIG block (run tools/patch_ESTBIG.py first)'); process.exit(2); }
const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(m[1], ctx);
const plan = ctx.window._gcEstDedupe && ctx.window._gcEstDedupe.plan;
if (typeof plan !== 'function') { console.error('patch ESTBIG block has no plan()'); process.exit(2); }

const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const val = r => { let v = r.value !== undefined ? r.value : r.v; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} } return v; };
const kv = new Map(rows.map(r => [r.key, { v: val(r), at: r.updated_at }]));
const live = kv.get('estimates'); if (!live || !Array.isArray(live.v)) { console.error('the mirror has no "estimates" row'); process.exit(2); }
const P = plan(live.v);
const $ = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kb = n => (n / 1e6 >= 1 ? (n / 1e6).toFixed(2) + ' MB' : Math.round(n / 1e3) + ' KB');

/* other places the same estimates sit (not changed by the clean-up; ESTDEDUPE / STORECUT retire them) */
const other = [];
for (const [k, r] of kv) {
  if (k === 'estimates' || !(k === '__est__gc_ests_v2' || /^estimates__chunk\d+$/.test(k)) || !Array.isArray(r.v)) continue;
  plan(r.v).forEach(x => other.push(Object.assign({ key: k, at: r.at }, x)));
}

const todo = P.filter(x => !x.ownerToCheck);
const out = [];
out.push('# Estimate line clean-up (patch ESTBIG) — repair plan, DRY RUN', '');
out.push('Made ' + new Date().toISOString() + ' from the read-only mirror `' + path.basename(MIRROR) + '` ("estimates" row of ' + live.at + ', ' + live.v.length + ' estimates). Nothing was written.', '');
out.push('**Rule:** one copy of each line, in the original order, the first copy kept. Two lines are the same line when the description, quantity, unit cost, type, category and margin are the same (the id a copy was given and the calc note are ignored; a note only a later copy has is carried onto the kept line). Quantities are **not** added up: the repeats are copies, not extra quantity. `mats` (name, qty, unit cost, category, unit) and `labor` (description, hours, rate, category) get the same rule.', '');
out.push('**Check:** the estimate\'s stored total is compared with what one copy of each line adds up to (the builder\'s own sums, with that estimate\'s settings). Equal: the repeats were copies and the clean-up does not change the price. Different: **owner to check** — the real run leaves that estimate alone unless it is named with `include`.', '');
out.push('## Estimates the clean-up finds (' + P.length + ')', '');
out.push('| Estimate | id | Lines before → after | Mats | Labor | Size before → after | Stored total | All lines add up to | One copy of each adds up to | Total changes? |');
out.push('|---|---|---|---|---|---|---|---|---|---|');
P.forEach(x => out.push('| ' + x.name + ' | `' + x.id + '` | ' + x.lines[0] + ' → ' + x.lines[1] + ' | ' + x.mats[0] + ' → ' + x.mats[1] + ' | ' + x.labor[0] + ' → ' + x.labor[1] + ' | ' + kb(x.bytes[0]) + ' → ' + kb(x.bytes[1]) +
  ' | ' + $(x.totalStored.charge) + ' (cost ' + $(x.totalStored.cost) + ') | ' + $(x.totalAllLines.charge) + ' | ' + $(x.totalAfter.charge) + ' (cost ' + $(x.totalAfter.cost) + ') | ' + (x.totalChanges ? '**YES — owner to check**' : 'no') + ' |'));
out.push('');
P.forEach(x => out.push('- **' + x.name + '**: ' + x.why + '.'));
out.push('');
out.push('## What the real run would change', '');
out.push(todo.length ? ('`_gcEstDedupe({ confirm: "DEDUPE ' + todo.length + '" })` changes ' + todo.length + ' estimate(s): ' + todo.map(x => x.name + ' (' + x.lines[0] + ' → ' + x.lines[1] + ' lines)').join(', ') + '. Owner-to-check estimates are left alone; add them with `include: ["<id>"]` (the confirm count goes up by one each).') : 'Nothing (every estimate found changes its total — owner to check).', '');
if (other.length) {
  out.push('## Old copies elsewhere (not live; not changed)', '');
  out.push('The builder\'s old store and the old "estimates" pieces still hold copies (the page reads "estimates"; ESTDEDUPE / STORECUT empty the old pieces). Listed so nobody mistakes them for live data:', '');
  out.push('| Row | Estimate | id | Lines before → after | Size |'); out.push('|---|---|---|---|---|');
  other.forEach(x => out.push('| `' + x.key + '` | ' + x.name + ' | `' + x.id + '` | ' + x.lines[0] + ' → ' + x.lines[1] + ' | ' + kb(x.bytes[0]) + ' |'));
  out.push('');
}
const md = out.join('\n') + '\n';
console.log(md);
if (opt('--md')) { fs.mkdirSync(path.dirname(opt('--md')), { recursive: true }); fs.writeFileSync(opt('--md'), md); console.log('wrote ' + opt('--md')); }
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ at: new Date().toISOString(), estimates: P, other: other.map(x => ({ key: x.key, id: x.id, name: x.name, lines: x.lines, bytes: x.bytes })) }, null, 1));
