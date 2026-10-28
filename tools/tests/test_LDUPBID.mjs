// node tools/tests/test_LDUPBID.mjs <repo dir> — Leads 🧹 Clean up: bids from one plan-room sender are not duplicates
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const dir = process.argv[2] || '.'; const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const i = html.indexOf('if (window.__GC_PATCH_LCLEAN__) return;'); const a = html.lastIndexOf('<script', i), b = html.indexOf('</script>', i);
const code = html.slice(html.indexOf('>', a) + 1, b);
const noop = () => {}; const el = () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const doc = { addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, head: el(), body: el(), documentElement: el() };
const win = { document: doc, setTimeout: () => 0, setInterval: () => 0, clearTimeout: noop, clearInterval: noop, addEventListener: noop, localStorage: { getItem: () => null, setItem: noop }, console: { log: noop, warn: noop }, fetch: () => Promise.reject(new Error('offline')) };
win.window = win; const ctx = vm.createContext(Object.assign(win, { navigator: {}, location: { href: '' } }));
vm.runInContext(code, ctx);
const LC = ctx._gcLeadClean; let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : ' ' + JSON.stringify(x))); };
const now = '2026-10-27T12:00:00Z';
const rep = [
  { id: 'B1', name: 'City of Bolivar – Hatchie River Park Development', email: 'info@memphisreprographics.com', source: 'E-mail', leadKind: 'Government', createdAt: now },
  { id: 'B2', name: 'REBID NWCC Agricultural Technology Facility', email: 'info@memphisreprographics.com', source: 'E-mail', leadKind: 'Commercial', createdAt: now },
  { id: 'B3', name: 'Maintenance Shop Construction at Kefauver Terrace', email: 'info@memphisreprographics.com', source: 'E-mail', leadKind: 'Commercial', createdAt: now }];
const g1 = LC.analyze(rep, []).dups || LC.analyze(rep, []).duplicates || [];
ok('three memphisreprographics bids → no duplicate group', g1.length === 0, g1);
const asRes = rep.map(l => Object.assign({}, l, { leadKind: 'Residential' }));
const g1b = LC.analyze(asRes, []).dups || [];
ok('even unflagged: a reprographics sender e-mail is not a duplicate key', g1b.length === 0, g1b);
const ph = [{ id: 'P1', name: 'Warehouse reroof', email: 'projectnotification@planhubprojects.com', source: 'PlanHub', createdAt: now }, { id: 'P2', name: 'School gym roof', email: 'projectnotification@planhubprojects.com', source: 'PlanHub', createdAt: now }];
ok('PlanHub notification sender → no group', (LC.analyze(ph, []).dups || []).length === 0);
const bc = [{ id: 'C1', name: 'Clinic addition', email: 'noreply@buildingconnected.com', phone: '901-555-0100', source: 'BuildingConnected', createdAt: now }, { id: 'C2', name: 'Bank remodel', email: 'noreply@buildingconnected.com', phone: '901-555-0100', source: 'BuildingConnected', createdAt: now }];
ok('BuildingConnected no-reply + same phone → no group', (LC.analyze(bc, []).dups || []).length === 0);
const same = [{ id: 'S1', name: 'Aloft Nashville Hotel Renovation', leadKind: 'Commercial', email: 'a@gc.example.com', createdAt: now }, { id: 'S2', name: 'Aloft Nashville Hotel Renovation', leadKind: 'Commercial', email: 'b@gc2.example.com', createdAt: now }];
ok('same bid project name → still a group', (LC.analyze(same, []).dups || []).length === 1);
const home = [{ id: 'H1', name: 'Roof leak', email: 'jane.homeowner@example.com', createdAt: now }, { id: 'H2', name: 'Gutter quote', email: 'jane.homeowner@example.com', createdAt: now }];
ok('residential: same personal e-mail → still a group', (LC.analyze(home, []).dups || []).length === 1);
console.log(fail ? 'FAILED ' + pass + '/' + (pass + fail) : 'OK ' + pass + '/' + pass); process.exit(fail ? 1 : 0);
