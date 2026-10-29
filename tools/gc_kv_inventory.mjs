#!/usr/bin/env node
// tools/gc_kv_inventory.mjs — READ-ONLY size inventory of the gc_kv table (patch STORECUT).
//
//   GC_SB_URL=https://<project>.supabase.co GC_SB_KEY=<a key that may read gc_kv> node tools/gc_kv_inventory.mjs [index.html] [--json out.json]
//   node tools/gc_kv_inventory.mjs index.html --from backup.json      (a saved copy: [{key,value,updated_at}, ...])
//
// Never writes, never prints the key. For every row: size of the value (JSON text), last update, and how the CRM reads it:
//   startup   - in the CRM's synced key list or matched by the start-up pull (everything not held back by STUCKFIX / STORECUT)
//   on-demand - held back at start-up (estimates, gc_folded) or only named by one screen
//   never     - old chunk generations (manifest says "not chunked" / torn), __est__gc_ests_v2 after STORECUT, keys not named in the page
import fs from 'fs';

const args = process.argv.slice(2);
const htmlPath = args.find(a => /\.html$/.test(a)) || 'index.html';
const outJson = args.includes('--json') ? args[args.indexOf('--json') + 1] : '';
const fromFile = args.includes('--from') ? args[args.indexOf('--from') + 1] : '';
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';

async function rows(){
  if (fromFile) return JSON.parse(fs.readFileSync(fromFile, 'utf8'));
  const u = (process.env.GC_SB_URL || '').replace(/\/$/, ''), k = process.env.GC_SB_KEY || '', jwt = process.env.GC_SB_JWT || k;
  if (!u || !k) { console.error('set GC_SB_URL and GC_SB_KEY (read-only use), or pass --from <saved copy>'); process.exit(2); }
  const H = { apikey: k, Authorization: 'Bearer ' + jwt };
  const r = await fetch(u + '/rest/v1/gc_kv?select=key,updated_at&order=key.asc', { headers: H });
  if (!r.ok) { console.error('list keys: HTTP ' + r.status); process.exit(1); }
  const keys = await r.json(); const out = [];
  for (const row of keys) {   /* one value at a time: never the whole table in one answer */
    const rr = await fetch(u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(row.key) + '&select=key,value,updated_at', { headers: H });
    if (!rr.ok) { out.push({ key: row.key, updated_at: row.updated_at, error: rr.status }); continue; }
    const j = await rr.json(); out.push(j[0] || { key: row.key, updated_at: row.updated_at, value: null });
  }
  return out;
}
const SYNC = (() => { const m = /var SYNC_KEYS = \[([^\]]*)\]/.exec(html); return m ? new Set((m[1].match(/['"]([^'"]+)['"]/g) || []).map(s => s.slice(1, -1))) : new Set(); })();
function cls(key, manifests){
  const base = key.replace(/__(chunk\d+|manifest)$/, '');
  if (/^projectDocs__/.test(key) || /^estimates__chunk/.test(key)) return 'never (old 9-22 / 10-21 copies; STUCKFIX: not pulled)';
  if (/__chunk\d+$/.test(key)) { const m = manifests[base]; return (!m || m.chunked !== true) ? 'never (old chunk, manifest not chunked)' : 'startup (chunked list)'; }
  if (key === '__est__gc_ests_v2') return html.includes('__GC_PATCH_STORECUT__') ? 'never (STORECUT: one store, served from estimates)' : 'on-demand (after 95 s / estimates screen)';
  if (key === 'estimates' || key === 'gc_folded') return 'on-demand (after 95 s / estimates screen)';
  if (/^_probe_/.test(key)) return 'never (lockdown probe)';
  if (SYNC.has(key)) return 'startup (synced list)';
  if (html && !html.includes("'" + key + "'") && !html.includes('"' + key + '"') && !html.includes(key)) return 'never (not named in the page)';
  return 'startup (bulk pull) / named read';
}
const list = await rows();
const manifests = {}; list.forEach(r => { if (/__manifest$/.test(r.key)) { let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } manifests[r.key.replace(/__manifest$/, '')] = v || {}; } });
const sz = v => v == null ? 0 : (typeof v === 'string' ? v.length : JSON.stringify(v).length);
const items = list.map(r => ({ key: r.key, bytes: sz(r.value), updated: String(r.updated_at || '').slice(0, 19), reads: cls(r.key, manifests) })).sort((a, b) => b.bytes - a.bytes);
const tot = items.reduce((a, x) => a + x.bytes, 0);
const fam = {}; items.forEach(x => { const f = x.key.replace(/__chunk\d+$/, '__chunk*').replace(/:.*$/, ':*'); (fam[f] = fam[f] || { bytes: 0, rows: 0 }); fam[f].bytes += x.bytes; fam[f].rows++; });
console.log('gc_kv: ' + items.length + ' rows, ' + (tot / 1e6).toFixed(2) + ' MB');
console.log('\nBY FAMILY (>= 50 KB)');
Object.entries(fam).sort((a, b) => b[1].bytes - a[1].bytes).filter(([, v]) => v.bytes >= 50000).forEach(([k, v]) => console.log('  ' + k.padEnd(34) + (v.bytes / 1e6).toFixed(2).padStart(7) + ' MB  ' + v.rows + ' row(s)'));
console.log('\nROWS (>= 100 KB)');
items.filter(x => x.bytes >= 100000).forEach(x => console.log('  ' + x.key.padEnd(34) + (x.bytes / 1e6).toFixed(2).padStart(7) + ' MB  ' + x.updated + '  ' + x.reads));
const byCls = {}; items.forEach(x => { const c = x.reads.split(' ')[0]; byCls[c] = (byCls[c] || 0) + x.bytes; });
console.log('\nBY HOW THE CRM READS IT'); Object.entries(byCls).forEach(([k, v]) => console.log('  ' + k.padEnd(12) + (v / 1e6).toFixed(2) + ' MB'));
if (outJson) fs.writeFileSync(outJson, JSON.stringify({ at: new Date().toISOString(), rows: items.length, bytes: tot, items, families: fam }, null, 1));
