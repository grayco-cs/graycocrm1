// snapshot.mjs — read-only copy of every gc_kv row (live database) into a local folder, for the QA gate.
// Usage: node tools/qa/snapshot.mjs <out-root>            (writes <out-root>/<timestamp>/rows.ndjson + meta.json)
//   QA_RD = path of the read-only reader script (rd.sh '<postgrest query>' <outfile>) — it holds the key, this file never does.
// Only GET requests go out (the reader is GET-only). Chunked keys (<key>__chunkN, <key>__manifest) are copied as they are.
// The snapshot holds live company data: keep it in the scratchpad, never in the repo.
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const RD = process.env.QA_RD || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/acct/rd.sh';
const outRoot = process.argv[2];
if (!outRoot) { console.error('usage: node snapshot.mjs <out-root>'); process.exit(2); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(outRoot, stamp); fs.mkdirSync(dir, { recursive: true });
const tmp = path.join(dir, '.page.json');
function get(q){
  for (let a = 0; a < 4; a++) {
    try { execFileSync('bash', [RD, q, tmp], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 }); const t = fs.readFileSync(tmp, 'utf8'); const j = JSON.parse(t); if (Array.isArray(j)) return j; throw new Error(String(t).slice(0, 200)); }
    catch (e) { if (a === 3) throw e; }
  }
}
// 1. every key (the API returns at most 1000 rows per request: page by key)
const keys = []; let last = null;
for (;;) {
  const q = 'select=key,updated_at&order=key.asc&limit=1000' + (last ? '&key=gt.' + encodeURIComponent(JSON.stringify(last)) : '');
  const rows = get(q); if (!rows.length) break;
  keys.push(...rows); last = rows[rows.length - 1].key;
  if (rows.length < 1000) break;
}
console.log('keys: ' + keys.length);
// 2. values, in batches (by key list); a batch that fails is split
const out = fs.createWriteStream(path.join(dir, 'rows.ndjson'));
let n = 0, bytes = 0;
function batch(list){
  const inq = 'in.(' + list.map(k => '"' + k.key.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + ')';
  let rows;
  try { rows = get('select=key,value,updated_at&key=' + encodeURIComponent(inq)); }
  catch (e) { if (list.length === 1) { console.error('could not read ' + list[0].key + ': ' + String(e.message).slice(0, 120)); return; } const h = list.length >> 1; batch(list.slice(0, h)); batch(list.slice(h)); return; }
  for (const r of rows) { const s = JSON.stringify(r); out.write(s + '\n'); n++; bytes += s.length; }
}
for (let i = 0; i < keys.length; i += 40) batch(keys.slice(i, i + 40));
await new Promise(r => out.end(r));
try { fs.unlinkSync(tmp); } catch (e) {}
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ at: new Date().toISOString(), keys: keys.length, rows: n, bytes }, null, 1));
console.log('rows: ' + n + ', ' + (bytes / 1e6).toFixed(1) + ' MB → ' + dir);
if (n < keys.length) { console.error('MISSING ' + (keys.length - n) + ' rows'); process.exit(1); }
