// estbig_repair_live.mjs — patch ESTBIG's estimate line clean-up, run server-side against the live gc_kv.
// DRY RUN BY DEFAULT (GET only). Writes only with --confirm "DEDUPE <n>" (n = estimates it would change).
//
//   node tools/estbig_repair_live.mjs [--only <id>[,<id>]] [--html index.html] [--out <dir>] [--confirm "DEDUPE 1"]
//
// What it does (the same rule and the same code as _gcEstDedupe in the page: plan() is loaded out of index.html):
//   1. GET the "estimates" row (value + updated_at) and plan: one copy of each line, first copy kept, order kept,
//      quantities NOT added. An estimate whose stored total is not one copy's total is "owner to check" and is never
//      changed by this tool.
//   2. (--confirm) saves the row as read to <out>/estimates_before_<stamp>.json (customer data: keep it out of git);
//      writes gc_estbig_backup__<yyyymmdd>__<id> (the whole estimate as read) for each estimate and reads it back
//      (a backup from an earlier attempt is never overwritten: the same state is reused, a different one gets a second key);
//   3. PATCHes "estimates" ONLY IF its updated_at is still the one read in step 1 — a save that landed in between
//      wins, nothing is changed, and the tool says to run it again;
//   4. reads "estimates" back, prints before / after, logs a summary row gc_estbig_v1.
// It changes only the "estimates" row. __est__gc_ests_v2 and the old estimates__chunk* rows are not read or written by
// r16+ pages (STORECUT serves the builder's store from "estimates"; the chunk manifest does not match its chunks, so
// every reader rejects them); retiring those is the job of the existing admin clean-up (_gcEstOneNow / ESTDEDUPE).
// Credentials: SUPABASE_URL / SUPABASE_ANON_KEY, else the defaults in netlify/functions/staff-admin.js (never printed).
import fs from 'fs'; import os from 'os'; import path from 'path'; import vm from 'vm'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const CONFIRM = opt('--confirm'), ONLY = (opt('--only') || '').split(',').map(s => s.trim()).filter(Boolean);
const HTML = opt('--html') || path.join(ROOT, 'index.html'), OUT = opt('--out') || os.tmpdir();

/* credentials */
let URL0 = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY;
if (!URL0 || !KEY) {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-admin.js'), 'utf8');
  URL0 = URL0 || (/GC_SB_DEFAULT_URL\s*=\s*'([^']+)'/.exec(src) || [])[1]; KEY = KEY || (/GC_SB_DEFAULT_ANON\s*=\s*'([^']+)'/.exec(src) || [])[1];
}
if (!URL0 || !KEY) { console.error('no Supabase URL / anon key'); process.exit(2); }
URL0 = URL0.replace(/\/$/, '');

/* HTTP through curl (it honours the environment's proxy settings); bodies go on stdin */
function http(method, q, body, prefer){
  const a = ['-sS', '--max-time', '180', '-X', method, '-w', '\n%{http_code}', URL0 + '/rest/v1/gc_kv?' + q, '-H', 'apikey: ' + KEY, '-H', 'Authorization: Bearer ' + KEY];
  if (prefer) a.push('-H', 'Prefer: ' + prefer);
  if (body !== undefined) a.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
  const out = execFileSync('curl', a, { input: body === undefined ? undefined : JSON.stringify(body), maxBuffer: 1 << 30 }).toString();
  const i = out.lastIndexOf('\n'), code = +out.slice(i + 1), text = out.slice(0, i);
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) {}
  return { code, text, json };
}
function getRow(key){
  const r = http('GET', 'key=eq.' + encodeURIComponent(key) + '&select=key,value,updated_at');
  if (r.code !== 200 || !Array.isArray(r.json)) throw new Error('GET ' + key + ' -> HTTP ' + r.code + ' ' + r.text.slice(0, 200));
  return r.json[0] || null;
}
const parse = v => { if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) {} } return v; };

/* the page's own plan(), with the cleaned arrays */
const html = fs.readFileSync(HTML, 'utf8');
const m = /<script id="gc-patch-estbig">([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.error(HTML + ' has no patch ESTBIG block'); process.exit(2); }
const code = m[1].replace(/\n\}\)\(\);\s*$/, '\nW._gcEstDedupe._planFull = plan;\n})();\n');
if (code === m[1]) { console.error('could not reach plan() in the ESTBIG block'); process.exit(2); }
const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(code, ctx);
const planFull = ctx.window._gcEstDedupe._planFull;

const $ = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const row = getRow('estimates');
if (!row) { console.error('no "estimates" row'); process.exit(2); }
const valueWasString = typeof row.value === 'string', list = parse(row.value);
if (!Array.isArray(list) || !list.length) { console.error('"estimates" is not a list'); process.exit(2); }
const P = planFull(list);
const todo = P.filter(x => !x.ownerToCheck && (!ONLY.length || ONLY.includes(x.id)));
console.log('"estimates" row: ' + list.length + ' estimates, updated_at ' + row.updated_at + ', ' + JSON.stringify(row.value).length + ' chars');
P.forEach(x => console.log('  ' + (todo.includes(x) ? 'WILL CHANGE ' : (x.ownerToCheck ? 'owner to check (left alone) ' : 'not selected ')) + x.name + ' [' + x.id + ']: lines ' + x.lines.join(' -> ') + ', mats ' + x.mats.join(' -> ') + ', labor ' + x.labor.join(' -> ') +
  '; stored ' + $(x.totalStored.charge) + ', one copy of each ' + $(x.totalAfter.charge) + ', all lines ' + $(x.totalAllLines.charge) + (x.totalChanges ? '  TOTAL CHANGES' : '  total unchanged')));
const want = 'DEDUPE ' + todo.length;
if (!CONFIRM) { console.log('\nDRY RUN: nothing written. To write: --confirm "' + want + '"' + (ONLY.length ? ' --only ' + ONLY.join(',') : '')); process.exit(0); }
if (CONFIRM !== want) { console.error('\n--confirm must be exactly "' + want + '" — nothing written'); process.exit(3); }
if (!todo.length) { console.log('nothing to change'); process.exit(0); }

/* 1. the row as read, on this computer */
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(OUT, { recursive: true });
const localCopy = path.join(OUT, 'estimates_before_' + stamp + '.json');
fs.writeFileSync(localCopy, JSON.stringify(row), { mode: 0o600 });
console.log('\nthe row as read: ' + localCopy);

/* 2. a backup of each estimate in gc_kv, read back */
const now = new Date().toISOString(), ymd = now.slice(0, 10).replace(/-/g, ''), fixed = {}, backups = [];
for (const x of todo) {
  const orig = list.find(e => e && String(e.id) === x.id);
  let bk = 'gc_estbig_backup__' + ymd + '__' + x.id.replace(/[^A-Za-z0-9_-]/g, '_');
  let have = getRow(bk), hv = have && parse(have.value);
  if (hv && hv.estimate && JSON.stringify(hv.estimate) !== JSON.stringify(orig)) {   /* an earlier attempt backed up a different state: keep it, add this one */
    console.log('an earlier backup ' + bk + ' holds a different state of the estimate: kept; this state goes in a second backup');
    bk += '__' + now.slice(11, 19).replace(/:/g, ''); have = getRow(bk); hv = have && parse(have.value);
  }
  if (!(hv && hv.estimate && JSON.stringify(hv.estimate) === JSON.stringify(orig))) {
    const w = http('POST', '', { key: bk, value: { at: now, by: 'tools/estbig_repair_live.mjs', why: 'estimate before the ESTBIG line clean-up (restore: put "estimate" back in the estimates list)', rowUpdatedAt: row.updated_at, estimate: orig }, updated_at: now }, 'return=minimal');
    if (w.code !== 201 && w.code !== 200 && w.code !== 204) throw new Error('backup ' + bk + ' -> HTTP ' + w.code + ' ' + w.text.slice(0, 200) + ' — nothing changed');
    have = getRow(bk); hv = have && parse(have.value);
    if (!(hv && hv.estimate && JSON.stringify(hv.estimate) === JSON.stringify(orig))) throw new Error('backup ' + bk + ' did not read back — nothing changed');
    console.log('backup written and read back: ' + bk + ' (' + hv.estimate.lines.length + ' lines)');
  } else console.log('backup already there (an earlier attempt, the same estimate as read), kept: ' + bk + ' (' + hv.estimate.lines.length + ' lines)');
  backups.push(bk);
  fixed[x.id] = Object.assign({}, orig, x._new, { savedAt: now, updatedAt: now, _linesDeduped: { at: now, by: 'tools/estbig_repair_live.mjs', lines: x.lines, mats: x.mats, labor: x.labor, backup: bk } });
}

/* 3. the conditional write: only if nobody saved "estimates" since it was read */
const next = list.map(e => (e && fixed[String(e.id)]) || e);
if (next.length !== list.length) throw new Error('safety: the list length changed — nothing changed');
const p = http('PATCH', 'key=eq.estimates&updated_at=eq.' + encodeURIComponent(row.updated_at) + '&select=key,updated_at',
  { value: valueWasString ? JSON.stringify(next) : next, updated_at: now }, 'return=representation');
if (p.code !== 200) { console.error('PATCH estimates -> HTTP ' + p.code + ' ' + p.text.slice(0, 300) + '\nNothing in "estimates" changed (the backup row stays; it is harmless).'); process.exit(4); }
if (!Array.isArray(p.json) || p.json.length !== 1) { console.error('"estimates" changed since it was read (a save landed at ' + ((getRow('estimates') || {}).updated_at) + '): nothing written to it. Run the tool again.'); process.exit(5); }

/* 4. read back */
const back = getRow('estimates'), bl = parse(back.value);
let ok = true;
for (const x of todo) {
  const e = bl.find(r => r && String(r.id) === x.id);
  const orig = list.find(r => r && String(r.id) === x.id);
  const good = e && e.lines.length === x.lines[1] && (e.mats || []).length === x.mats[1] && (e.labor || []).length === x.labor[1] && Number(e.totalCharge) === Number(orig.totalCharge) && Number(e.totalCost) === Number(orig.totalCost);
  ok = ok && !!good;
  console.log((good ? 'OK   ' : 'FAIL ') + x.name + ': lines ' + x.lines[0] + ' -> ' + (e && e.lines.length) + ', mats ' + x.mats[0] + ' -> ' + (e && (e.mats || []).length) + ', labor ' + x.labor[0] + ' -> ' + (e && (e.labor || []).length) + ', total ' + $(e && e.totalCharge));
}
console.log('"estimates": ' + JSON.stringify(row.value).length + ' -> ' + JSON.stringify(back.value).length + ' chars, updated_at ' + row.updated_at + ' -> ' + back.updated_at + ', ' + bl.length + ' estimates');
try { http('POST', 'on_conflict=key', { key: 'gc_estbig_v1', value: { at: now, by: 'tools/estbig_repair_live.mjs', result: ok ? 'cleaned' : 'check', estimates: todo.map(x => ({ id: x.id, name: x.name, lines: x.lines, mats: x.mats, labor: x.labor, total: x.totalStored.charge })), backups }, updated_at: now }, 'resolution=merge-duplicates,return=minimal'); } catch (e) {}
process.exit(ok ? 0 : 6);
