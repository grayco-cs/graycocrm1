// test_LEADKEEP_backup_fn.mjs — gc-backup.js {action:'leadkeep'}: admins only; the newest nightly gc_kv snapshot taken BEFORE the
// given time; the leads' identity + person-set fields only (no contact data). Node only (fetch mocked), made-up data.
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = process.argv[2] || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 400))); };
process.env.SUPABASE_SERVICE_KEY = 'svc-test'; process.env.SUPABASE_URL = 'https://sb.example';
const SNAPS = [
  { id: 3, taken_at: '2026-11-13T07:00:00Z', snapshot: [{ key: 'leads', value: [{ id: 'LEADIN-a', priority: null }] }] },
  { id: 2, taken_at: '2026-11-12T07:00:00Z', snapshot: [{ key: 'leads', value: JSON.stringify([
    { id: 'LEADIN-a', inboxId: 'LI-a', name: 'Demo Press Box Phase 2', city: 'Zeddville', gc: 'Zedd Builders', priority: 8, prioritySetAt: '2026-11-10T15:00:00Z', stage: 'Bid Submitted', stageChangedAt: '2026-11-11T15:00:00Z', estimator: 'Demo Estimator', assignedAt: '2026-11-10T15:00:00Z', assignedBy: 'Wesley Johnson', phone: '555-0100', email: 'zedd@example.com', address: '1 Demo St', activity: [{ type: 'call', text: 'called' }, { type: 'priority', text: 'Priority 8', at: '2026-11-10T15:00:00Z' }] }]) }, { key: 'projects', value: [] }] },
  { id: 1, taken_at: '2026-11-11T07:00:00Z', snapshot: [{ key: 'leads', value: [] }] }];
let role = 'admin', asked = [];
globalThis.fetch = async (url, o) => {
  url = String(url); asked.push(url);
  const J = (v, st) => ({ ok: (st || 200) < 400, status: st || 200, json: async () => v });
  if (/\/auth\/v1\/user/.test(url)) return J({ id: 'u1', email: 'wjohnson@grayco-cs.com' });
  if (/\/rest\/v1\/gc_staff/.test(url)) return J([{ email: 'wjohnson@grayco-cs.com', role, active: true }]);
  if (/gc_backups\?select=id,taken_at/.test(url)) { const m = /taken_at=lt\.([^&]+)/.exec(url), lt = m ? Date.parse(decodeURIComponent(m[1])) : Infinity; return J(SNAPS.filter(s => Date.parse(s.taken_at) < lt).sort((a, b) => Date.parse(b.taken_at) - Date.parse(a.taken_at)).slice(0, 1).map(s => ({ id: s.id, taken_at: s.taken_at }))); }
  if (/gc_backups\?select=snapshot&id=eq\.(\d+)/.test(url)) { const id = +/id=eq\.(\d+)/.exec(url)[1]; return J(SNAPS.filter(s => s.id === id).map(s => ({ snapshot: s.snapshot }))); }
  return J(null, 404);
};
const G = require(ROOT + '/netlify/functions/gc-backup.js');
const call = body => G.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer tok', origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(body) });
let r = await call({ action: 'leadkeep' }), j = JSON.parse(r.body);
ok('admin: the newest backup BEFORE 11/12 17:00 UTC (not the later one)', r.statusCode === 200 && j.ok && j.at === '2026-11-12T07:00:00Z' && j.leads.length === 1, j);
const L = j.leads[0] || {};
ok('…with priority 8 + its time, stage, estimator, inbox id, name', L.priority === 8 && L.prioritySetAt && L.stage === 'Bid Submitted' && L.estimator === 'Demo Estimator' && L.inboxId === 'LI-a' && L.name, L);
ok('…no customer contact data (phone, e-mail, address); history only its priority lines', !('phone' in L) && !('email' in L) && !('address' in L) && L.activity.length === 1 && L.activity[0].type === 'priority', L);
r = await call({ action: 'leadkeep', before: '2026-11-11T08:00:00Z' }); j = JSON.parse(r.body);
ok('"before" picks an older night', j.ok && j.at === '2026-11-11T07:00:00Z' && j.leads.length === 0, j);
role = 'estimator'; r = await call({ action: 'leadkeep' });
ok('not an admin → 403', r.statusCode === 403, r.statusCode);
ok('nothing was written (read-only: no POST / DELETE to gc_backups)', !asked.some(u => /gc_backups\?id=in/.test(u)));
const n = R.filter(Boolean).length; console.log('LEADKEEP_backup ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
