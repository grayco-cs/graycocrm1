// test_SAVES.mjs <build-dir> [group ...] — SAVES: every data entry point, phone (GrayCo Field, iPhone) and Desk, end to end
// against an in-memory database (harness_SAVES.mjs): the edit made through the screen reaches the database with the right
// fields, a second fresh device shows it, a reload keeps it; failed / unanswered writes, a nearly full localStorage and two
// devices editing one record. Runs each group in its own process (unattended, overnight) and prints one table:
// entry point × device → PASS / FAIL (and which step failed).
//   groups: merge (no browser) · est · field · mitenv · fail · desk     default: all
//   one browser run per group — wrap the whole call in the shared browser lock (flock …/browser.lock node test_SAVES.mjs …).
import { spawnSync } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(process.argv[2] || '.');
const ALL = { merge: ['test_SAVES_merge.mjs'], est: ['test_SAVES_est.mjs', 'full'], field: ['test_SAVES_field.mjs'], mitenv: ['test_SAVES_mitenv.mjs'], fail: ['test_SAVES_fail.mjs'], desk: ['test_SAVES_desk.mjs'] };
const groups = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(ALL);
const OUT = path.join(os.tmpdir(), 'saves_results_' + process.pid + '.json'); try { fs.unlinkSync(OUT); } catch (e) {}
const summary = [];
for (const g of groups) {
  const spec = ALL[g]; if (!spec) { console.log('unknown group ' + g); continue; }
  const t0 = Date.now();
  console.log('\n######## ' + g);
  const r = spawnSync(process.execPath, [path.join(HERE, spec[0]), BUILD].concat(spec.slice(1)), { env: Object.assign({}, process.env, { GC_SAVES_OUT: OUT }), encoding: 'utf8', timeout: +(process.env.SAVES_GROUP_TIMEOUT || 1500000), maxBuffer: 64 << 20 });
  const txt = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(txt.split('\n').filter(l => /✓|✗|passed,|crashed|diagnosis|send box|after send/.test(l)).join('\n') + '\n');
  const m = /(\d+) passed, (\d+) failed/.exec(txt);
  summary.push({ g, pass: m ? +m[1] : 0, fail: m ? +m[2] : (r.status === 0 ? 0 : 1), secs: Math.round((Date.now() - t0) / 1000), timedOut: !!(r.error && /ETIMEDOUT/.test(String(r.error.code || r.error))) });
}
let rows = []; try { rows = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
const w = Math.max(24, ...rows.map(r => r.entry.length)) + 2;
console.log('\n================ SAVES — entry point × device ================');
console.log('  ' + 'entry point'.padEnd(w) + 'device'.padEnd(8) + 'result  failed steps');
for (const r of rows) { const bad = Object.entries(r.steps).filter(([, v]) => !v).map(([k]) => k); console.log('  ' + r.entry.padEnd(w) + String(r.dev).padEnd(8) + (bad.length ? 'FAIL    ' + bad.join(', ') : 'PASS')); }
console.log('\n  group   pass fail  secs');
for (const s of summary) console.log('  ' + s.g.padEnd(8) + String(s.pass).padStart(4) + String(s.fail).padStart(5) + String(s.secs).padStart(6) + (s.timedOut ? '  (timed out)' : ''));
const tf = summary.reduce((a, s) => a + s.fail, 0), tp = summary.reduce((a, s) => a + s.pass, 0);
console.log('\n' + tp + ' passed, ' + tf + ' failed');
try { fs.unlinkSync(OUT); } catch (e) {}
process.exit(tf ? 1 : 0);
