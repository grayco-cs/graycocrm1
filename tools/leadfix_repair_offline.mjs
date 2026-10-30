// leadfix_repair_offline.mjs — patch LEADFIX: the repair plan (a DRY RUN, nothing is written anywhere but the report)
// computed from read-only mirrors of gc_kv, with the SAME code the CRM's _gcLeadFixRepair() runs (lfPlan, lifted out
// of index.html between LEADFIX-PLAN-BEGIN / -END).
//
//   node tools/leadfix_repair_offline.mjs <build-dir> <report.md> <mirror-oldest.json> ... <mirror-current.json>
//
// The mirrors are customer data: keep them (and the report) OUTSIDE git. Each mirror may be an array of gc_kv rows
// ({ key, v | value, updated_at }) or a CRM backup ({ idb: { leads: [...] } }). The LAST one is the list to repair;
// every lead's clean copy is the newest earlier mirror where it carried no inbox id, or only its own (LEADIN-<hash>);
// its stage comes from the oldest such mirror. Also writes <report>.base.json ({ base, first, baseFrom }) for
// _gcLeadFixRepair({ dryRun: true, base, first, baseFrom }) in the CRM's console.
import fs from 'fs';
import path from 'path';
const [build, out, ...mirrors] = process.argv.slice(2);
if (!build || !out || mirrors.length < 2) { console.error('usage: node leadfix_repair_offline.mjs <build-dir> <report.md> <mirror-oldest.json> ... <mirror-current.json>'); process.exit(2); }
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('not found in index.html: ' + a); return html.slice(i, j); };
const code = [
  "function s(v){ return (v == null ? '' : String(v)).trim(); } function low(v){ return s(v).toLowerCase(); } function arr(v){ return Array.isArray(v) ? v : []; }",
  cut("function leadIdOf(it){", '\n'),
  cut('var LF_FOREIGN_ID', 'function lfNameOk('),
  cut('function lfOwnIb(l){', '\n'),
  cut('/* LEADFIX-PLAN-BEGIN', '/* LEADFIX-PLAN-END */'),
  'return { lfPlan: lfPlan, lfOwnIb: lfOwnIb };'].join('\n');
const { lfPlan, lfOwnIb } = new Function(code)();

function leadsOf(file){
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const val = v => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
  if (Array.isArray(d)) { const r = d.find(x => x && (x.key === 'leads')); return r ? val('v' in r ? r.v : r.value) : null; }
  if (d && d.idb && Array.isArray(d.idb.leads)) return d.idb.leads;
  if (d && Array.isArray(d.leads)) return d.leads;
  return null;
}
const snaps = mirrors.map(f => ({ file: f, name: path.basename(path.dirname(f)) + '/' + path.basename(f), leads: (leadsOf(f) || []).filter(l => l && l.id) }));
snaps.forEach(sn => { sn.at = sn.leads.reduce((m, l) => (String(l.updatedAt || '') > m ? String(l.updatedAt || '') : m), ''); sn.byId = Object.fromEntries(sn.leads.map(l => [l.id, l])); });
const cur = snaps[snaps.length - 1], older = snaps.slice(0, -1);
const clean = l => !l.inboxId || (String(l.id) === 'LEADIN-' + String(l.inboxId).replace(/^LI-/, ''));
const base = {}, first = {}, baseFrom = {};
cur.leads.forEach(l => {
  if (!l.inboxId || clean(l)) return;
  const ok = older.filter(sn => sn.byId[l.id] && clean(sn.byId[l.id]));
  if (!ok.length) return;
  const last = ok[ok.length - 1]; base[l.id] = last.byId[l.id]; first[l.id] = ok[0].byId[l.id]; baseFrom[l.id] = last.name + ' (' + last.at.slice(0, 16) + ')';
});
const now = Date.parse(cur.at) || Date.now();
const plan = lfPlan(cur.leads, { base, first, baseFrom, now });

/* the report */
const short = v => { if (v === undefined) return '∅'; let t = typeof v === 'string' ? v : JSON.stringify(v); t = t.replace(/\s+/g, ' ').replace(/\|/g, '/'); return t.length > 70 ? t.slice(0, 67) + '…' : (t === '' ? '""' : t); };
const L = [];
L.push('# LEADFIX repair plan — DRY RUN (nothing was changed)', '');
L.push('Current list: `' + cur.name + '` (newest change ' + cur.at.slice(0, 19) + 'Z), ' + cur.leads.length + ' leads. Earlier mirrors used for clean copies: ' + older.map(sn => '`' + sn.name + '` (' + sn.leads.length + ' leads, to ' + sn.at.slice(0, 16) + ')').join(', ') + '.', '');
L.push('Rule: a lead whose inboxId is not its own (`LEADIN-<hash>`) gets back its clean copy (newest earlier mirror without a foreign inbox id) for every field the Lead Inbox import writes; ' +
  'phone / e-mail / address only where they were empty before and now hold the bid contact\'s; CompanyCam / QuickBooks / other-source customers also get the stage of their oldest clean copy and lose every bid field (GC, due date, bidRole/SUB, due-to). ' +
  'The item\'s own lead (`LEADIN-<same hash>`) is never touched. **owner to check** = not sure.', '');
const fields = new Set(); plan.rows.forEach(r => r.changes.forEach(c => fields.add(c.f)));
L.push('## Summary', '');
L.push('- leads to repair: **' + plan.rows.length + '** (' + Object.entries(plan.rows.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {})).map(([k, n]) => n + ' ' + k).join(', ') + ')');
L.push('- inbox items involved: ' + new Set(plan.rows.map(r => r.inboxId)).size + '; with a clean copy: ' + plan.rows.filter(r => r.baseFrom).length + ', without: ' + plan.rows.filter(r => !r.baseFrom).length);
L.push('- fields changed: ' + [...fields].sort().join(', '));
L.push('- rows with an **owner to check** note: ' + plan.rows.filter(r => r.unsure.length).length);
L.push('- assignments in the last 24 h on a lead that shares an inbox id: ' + plan.assigns.length + '; merges involving these leads: ' + plan.merges.length, '');
L.push('| lead | name | kind | stolen inbox item (its own lead) | clean copy | fields | owner to check |', '|---|---|---|---|---|---|---|');
plan.rows.forEach(r => L.push('| `' + r.id + '` | ' + short(r.name) + ' | ' + r.kind + ' | `' + r.inboxId + '` (`' + r.ownId + '`) | ' + (r.baseFrom || '**none**') + ' | ' + r.changes.length + ' | ' + (r.unsure.length ? '**owner to check**' : '') + ' |'));
L.push('');
L.push('## Per lead: before → after', '');
plan.rows.forEach(r => {
  L.push('### `' + r.id + '` — ' + short(r.name), '');
  L.push('Kind: ' + r.kind + ' · carries `' + r.inboxId + '` (belongs to `' + r.ownId + '`) · clean copy: ' + (r.baseFrom || '**none**') + ' · last change ' + String(r.updatedAt).slice(0, 19), '');
  if (r.unsure.length) { L.push('**owner to check:**'); r.unsure.forEach(u => L.push('- ' + u)); L.push(''); }
  L.push('| field | before (now) | after | why |', '|---|---|---|---|');
  r.changes.forEach(c => L.push('| ' + c.f + ' | ' + short(c.before) + ' | ' + short(c.after) + ' | ' + c.why + ' |'));
  L.push('');
});
L.push('## Assigned in the last 24 h on a lead that shares an inbox id (owner to check)', '');
if (!plan.assigns.length) L.push('None.', '');
else { L.push('| lead | name | inbox id | its own lead? | pm | estimator | by | at |', '|---|---|---|---|---|---|---|---|'); plan.assigns.forEach(a => L.push('| `' + a.id + '` | ' + short(a.name) + ' | `' + a.inboxId + '` | ' + (a.own ? 'yes' : '**NO — owner to check**') + ' | ' + short(a.pm) + ' | ' + short(a.estimator) + ' | ' + short(a.assignedBy) + ' | ' + String(a.assignedAt).slice(0, 19) + ' |')); L.push(''); }
L.push('## Merges involving these leads (owner to check)', '');
if (!plan.merges.length) L.push('None.', '');
else { L.push('| lead | name | merged into | merged with | archived at |', '|---|---|---|---|---|'); plan.merges.forEach(m => L.push('| `' + m.id + '` | ' + short(m.name) + ' | `' + (m.mergedInto || '') + '` | ' + m.mergedWith.map(x => '`' + x + '`').join(' ') + ' | ' + String(m.archivedAt).slice(0, 19) + ' |')); L.push(''); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, L.join('\n'));
const ids = new Set(plan.rows.map(r => r.id)), pick = o => Object.fromEntries(Object.entries(o).filter(([k]) => ids.has(k)));
fs.writeFileSync(out.replace(/\.md$/, '') + '.base.json', JSON.stringify({ base: pick(base), first: pick(first), baseFrom: pick(baseFrom) }));
console.log('leads ' + cur.leads.length + ', to repair ' + plan.rows.length + ' (clean copy ' + plan.rows.filter(r => r.baseFrom).length + '), owner to check ' + plan.rows.filter(r => r.unsure.length).length + ', assigns ' + plan.assigns.length + ', merges ' + plan.merges.length + ' -> ' + out);
