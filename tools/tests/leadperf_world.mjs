// leadperf_world.mjs — patch LEADPERF: an INVENTED dataset the size of the live CRM (≈200 leads incl. Lead Inbox LEADIN-* bid
// leads, 550 jobs ≈ 550 KB, 130 subs, 300 invoices, customers, estimates …) for the Leads-page performance budget test.
// Deterministic (seeded) so before/after numbers compare. Made-up names, addresses and numbers only.
export function world(seed){
  let s = seed || 1234567;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const DAY = 864e5, NOW = Date.now();
  const iso = d => new Date(NOW + d * DAY).toISOString();
  const day = d => iso(d).slice(0, 10);
  const FIRST = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Jules', 'Kai', 'Logan', 'Morgan', 'Noel', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sage', 'Tatum', 'Umber', 'Vale', 'Wren', 'Yael', 'Zuri'];
  const LAST = ['Zeddson', 'Quillby', 'Marrow', 'Fenwick', 'Larkspur', 'Holloway', 'Pembrook', 'Ashdown', 'Brindle', 'Corwick', 'Dunmore', 'Everly', 'Fairbank', 'Galloway', 'Hartwell', 'Ironside', 'Jessup', 'Kestrel', 'Lowell', 'Merriweather'];
  const CITY = ['Zeddville', 'Demo City', 'Sampleton', 'Mockford', 'Testburg', 'Fauxton', 'Placeholder Hills', 'Example Springs'];
  const STREET = ['Demo Ave', 'Sample Rd', 'Test Cove', 'Mock St', 'Example Pkwy', 'Placeholder Ln', 'Faux Blvd', 'Zedd Dr'];
  const GC = ['Zedd Builders', 'Alpha Demo Construction', 'Beta Sample Contractors', 'Gamma Mock Group', 'Delta Test Builders', 'Epsilon Example GC', 'Omega Faux Construction'];
  const SCOPE = ['Reroof', 'Kitchen remodel', 'Bath remodel', 'Water damage dry-out', 'Asbestos abatement', 'Mold remediation', 'Tenant finish', 'Gym floor', 'Press box improvements', 'Library renovation', 'Fire station renovation', 'Dormitory', 'Clinic addition', 'Siding replacement', 'Deck build', 'Window replacement', 'Storm repair', 'Lead paint abatement', 'Concrete repair', 'HVAC replacement'];
  const PLACE = ['Middle School', 'County Courthouse', 'Public Library', 'Fire Station', 'Community College', 'Clinic', 'Church', 'Office Park', 'Water Plant', 'Senior Center', 'Recreation Center', 'Police Precinct'];
  const COS = ['construction', 'construction', 'construction', 'mitigation', 'environmental'];
  const STAGES = ['New Lead', 'New Lead', 'New Lead', 'Contacted', 'Site Visit', 'Estimate Sent', 'Bid Submitted', 'Negotiating', 'Won', 'Lost'];
  const SOURCES = ['Website (grayco-cs.com)', 'Text message', 'Missed call', 'Referral', 'Yard sign', 'Google', 'Facebook', 'Dodge', 'BuildingConnected', 'Repeat customer', 'Building permit — Demo City', 'Other', ''];
  const person = () => pick(FIRST) + ' ' + pick(LAST);
  const addr = () => int(10, 9999) + ' ' + pick(STREET);
  const phone = () => '555-01' + String(int(0, 99)).padStart(2, '0');
  const users = [
    { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Nick Gray', email: 'ngray@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Estimator', payType: 'revenue_pct', active: true },
    { id: 'u4', name: 'Pat Sample', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
    { id: 'u5', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },
    { id: 'u6', name: 'Riley Mockett', email: 'rmock@grayco-cs.com', role: 'Project Manager', active: true },
    { id: 'u7', name: 'Sam Placeholder', email: 'splace@grayco-cs.com', role: 'Estimator', active: true }];
  const STAFF = ['Demo Estimator', 'Pat Sample', 'Riley Mockett', 'Sam Placeholder', ''];

  /* customers */
  const customers = [];
  for (let i = 0; i < 320; i++) { const n = person(); customers.push({ id: 'C' + i, name: n, email: n.toLowerCase().replace(/\s+/g, '.') + '@example.test', phone: phone(), address: addr(), city: pick(CITY), state: 'TN', zip: '3' + int(8000, 8999), createdAt: iso(-int(30, 900)), notes: 'Made-up customer ' + i }); }

  /* jobs: ≈1 KB each like the live list (notes, items, contacts) */
  const projects = [];
  for (let i = 0; i < 550; i++) {
    const c = pick(customers), co = pick(COS), sc = pick(SCOPE);
    const st = i < 90 ? 'Active' : pick(['Complete', 'Complete', 'Complete', 'Active', 'On Hold', 'Closed']);
    projects.push({ id: 'P' + (1000 + i), name: c.name.split(' ')[1] + ' ' + sc, client: c.name, customerId: c.id, address: c.address + ', ' + c.city + ', TN', city: c.city, status: st, companyId: co,
      pm: pick(STAFF), estimator: pick(STAFF), contract: int(2, 400) * 250, startDate: day(-int(0, 700)), createdAt: iso(-int(5, 800)), updatedAt: iso(-int(0, 60)), autoPO: 'A' + (100 + i),
      gc: rnd() < 0.3 ? pick(GC) : '', type: rnd() < 0.5 ? 'Residential' : 'Commercial',
      description: sc + ' for ' + c.name + '. ' + (rnd() < 0.2 ? 'QB # ' + int(1000, 9999) + '. ' : '') + 'Scope includes demo, haul-off, install and final clean. Customer prefers mornings; gate code on file. ' + 'Notes: ' + 'lorem ipsum '.repeat(int(4, 16)),
      notes: 'Made-up job notes. ' + 'Material on order, crew scheduled. '.repeat(int(1, 6)),
      items: Array.from({ length: int(2, 6) }, (_, k) => ({ id: 'it' + k, desc: pick(SCOPE) + ' line ' + k, qty: int(1, 40), unit: pick(['sf', 'lf', 'ea', 'sq']), cost: int(5, 900), price: int(10, 1500) })),
      contacts: [{ name: c.name, phone: c.phone, email: c.email, role: 'Owner' }] });
  }

  /* leads: CRM leads + Lead Inbox bid leads (LEADIN-*) with look-alike pairs, GC bids, residential web / text leads */
  const leads = [];
  for (let i = 0; i < 205; i++) {
    const inbox = i < 95, kind = inbox ? pick(['Commercial', 'Commercial', 'Government', 'Residential']) : pick(['Residential', 'Residential', 'Commercial', 'Insurance']);
    const place = pick(PLACE), city = pick(CITY), sc = pick(SCOPE);
    const nm = inbox ? (rnd() < 0.3 ? int(60000, 69999) + ' - ' : '') + city + ' ' + place + ' ' + sc + (rnd() < 0.15 ? ' Phase ' + int(1, 3) : '') : person() + ' ' + sc;
    const at = iso(-int(0, 120)), upd = iso(-int(0, 10));
    const L = { id: inbox ? 'LEADIN-' + (7000 + i).toString(36) + i : 'L' + (5000 + i), name: nm, client: inbox ? pick(GC) : nm.split(' ').slice(0, 2).join(' '),
      stage: pick(STAGES), createdAt: at, updatedAt: upd, address: addr(), city, state: 'TN', phone: phone(), email: 'lead' + i + '@example.test',
      leadKind: kind, type: kind === 'Residential' ? 'Residential' : (inbox ? 'Bid' : 'Commercial'), source: inbox ? pick(['BuildingConnected', 'Other', 'Demo County', 'Dodge', 'Website (grayco-cs.com)', 'Text message']) : pick(SOURCES),
      notes: 'Made-up lead notes for testing. ' + 'Called, left message. '.repeat(int(0, 4)), estVal: int(1, 300) * 500, pm: pick(STAFF), estimator: pick(STAFF), contact: person() };
    if (inbox) Object.assign(L, { inboxId: 'LI-' + i, inboxState: pick(['new', 'new', 'assigned', 'reviewed']), origin: pick(['email', 'email', 'watch', 'website']), gc: pick(GC), bidDue: day(int(-20, 30)) + (rnd() < 0.5 ? 'T14:00' : ''),
      bidRole: rnd() < 0.7 ? 'sub' : 'prime', scope: sc + ' at ' + place, inboxAt: at, inboxRev: int(1, 3), tags: rnd() < 0.15 ? ['☢️ Abatement / mold'] : [] });
    if (!inbox && L.source === 'Website (grayco-cs.com)') Object.assign(L, { origin: 'website', websiteLead: true });
    if (rnd() < 0.4) Object.assign(L, { priority: int(1, 10), prioritySetAt: upd, prioritySetBy: 'Wesley Johnson' });
    if (rnd() < 0.15) L.companyId = pick(COS);
    L.activity = Array.from({ length: int(0, 6) }, (_, k) => ({ type: pick(['note', 'call', 'stage', 'priority']), text: 'Made-up activity ' + k, at: iso(-int(0, 60)), by: pick(['Wesley Johnson', 'Demo Estimator']) }));
    leads.push(L);
  }
  /* look-alike pairs (the same bid from two GCs) for the "Same job?" box */
  for (let i = 0; i < 12; i++) { const a = leads[i]; leads.push(Object.assign({}, a, { id: 'LEADIN-dup' + i, inboxId: 'LI-dup' + i, gc: GC[(GC.indexOf(a.gc) + 1) % GC.length], name: a.name.replace(/^\d+ - /, '') + ' (GC: ' + GC[(GC.indexOf(a.gc) + 1) % GC.length] + ')', activity: [] })); }

  const subs = [];
  const TRADES = ['Roofing', 'Drywall', 'Plumbing', 'Electrical', 'HVAC', 'Painting', 'Flooring', 'Abatement', 'Concrete', 'Framing'];
  for (let i = 0; i < 130; i++) { const n = pick(LAST) + ' ' + pick(TRADES) + ' LLC'; subs.push({ id: 'S' + i, name: n, email: 'sub' + i + '@example.test', phone: phone(), trade: pick(TRADES), isSub: true, coiExp: day(int(-30, 300)), w9: rnd() < 0.8, createdAt: iso(-int(10, 600)) }); }
  const vendors = Array.from({ length: 60 }, (_, i) => ({ id: 'V' + i, name: pick(LAST) + ' Supply ' + i, email: 'ar' + i + '@example.test', isSub: false, cat: pick(['Lumber', 'Roofing', 'Paint', 'Rental']) }));
  const invs = [];
  for (let i = 0; i < 300; i++) { const p = pick(projects); invs.push({ id: 'INV' + i, num: String(1000 + i), projectId: p.id, project: p.name, client: p.client, amount: int(2, 400) * 100, date: day(-int(0, 400)), due: day(-int(-30, 370)), status: pick(['Paid', 'Paid', 'Sent', 'Draft', 'Overdue']), items: [{ desc: 'Progress billing', qty: 1, price: int(2, 400) * 100 }], memo: 'Made-up invoice' }); }
  const estimates = Array.from({ length: 180 }, (_, i) => { const l = pick(leads); return { id: 'E' + i, leadId: l.id, name: l.name, client: l.client, total: int(5, 500) * 100, status: pick(['Draft', 'Sent', 'Accepted']), createdAt: iso(-int(0, 200)), items: [{ desc: 'Line', qty: 1, price: 100 }] }; });
  const expenses = Array.from({ length: 400 }, (_, i) => { const v = pick(vendors).name; return { id: 'X' + i, projectId: pick(projects).id, vendor: v, desc: v, amount: int(5, 3000), date: day(-int(0, 300)), cat: pick(['Materials', 'Labor', 'Rental']), memo: 'Made-up expense' }; });
  const schedule = Array.from({ length: 250 }, (_, i) => ({ id: 'SC' + i, projectId: pick(projects).id, title: 'Crew day ' + i, date: day(int(-30, 30)), crew: pick(STAFF) }));
  return { users, customers, projects, leads, subs, vendors, invs, estimates, expenses, schedule };
}
export function load(H, seed){
  const W = world(seed);
  H.resetCloud();
  Object.keys(W).forEach(k => H.cset(k, W[k]));
  return W;
}
/* the world after the CRM has opened it once and finished its own one-time tidying (normalized invoices, merged vendors, the
   register …) — like the live data, which has long been through that. Made once per seed with the given build (≈2½ min) and
   cached as JSON (LEADPERF_CACHE, default the OS temp dir), with that computer's localStorage (snap.__ls) — seed it with lsInit(snap)
   so a measuring computer is not a brand-new one (a new computer catches up on things once, e.g. the commission watcher). */
export const lsInit = snap => `(() => { try { const L = ${JSON.stringify((snap && snap.__ls) || {})}; for (const k in L) if (localStorage.getItem(k) === null) localStorage.setItem(k, L[k]); } catch (e) {} })();`;
export async function settled(H, build, seed, cacheDir){
  const fs = await import('fs'), os = await import('os'), path = await import('path');
  seed = seed || 7;
  const f = path.join(cacheDir || process.env.LEADPERF_CACHE || os.tmpdir(), 'leadperf_world_' + seed + '.json');
  const fl = f.replace(/\.json$/, '_ls.json');   /* this computer's own memory after that first open (what was already done here) */
  if (fs.existsSync(f) && fs.existsSync(fl)) { const snap = JSON.parse(fs.readFileSync(f, 'utf8')); H.resetCloud(); Object.keys(snap).forEach(k => H.cset(k, snap[k])); Object.defineProperty(snap, '__ls', { value: JSON.parse(fs.readFileSync(fl, 'utf8')) }); return snap; }
  const W = load(H, seed);
  const A = await H.computer('settle', { build });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 25000);
  const views = ['leads', 'dashboard', 'projects'];
  let quiet = 0, n0 = H.writes ? H.writes.length : 0;
  for (let i = 0; i < 30 && quiet < 4; i++) {
    await H.sleep(10000);
    const n = H.writes ? H.writes.length : 0; quiet = n === n0 && i > 6 ? quiet + 1 : 0; n0 = n;
    try { await A.ev(v => window._setView(v), views[i % 3]); } catch (e) {}
  }
  const ls = await A.ev(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^gc_auth|speedlog|^sb-/.test(k)) o[k] = localStorage.getItem(k); } return o; });
  await A.close();
  const snap = {}; for (const [k, v] of H.cloud) if (!/^gc_(adm_dev|perfrep)_/.test(k)) snap[k] = v.value;
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(snap)); fs.writeFileSync(fl, JSON.stringify(ls));
  Object.defineProperty(snap, '__ls', { value: ls });
  H.resetCloud(); Object.keys(snap).forEach(k => H.cset(k, snap[k]));
  return snap;
}
