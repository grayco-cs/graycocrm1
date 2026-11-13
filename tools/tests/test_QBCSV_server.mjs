// part E of test_QBCSV.mjs — netlify/functions/qb-files.js (read-only QuickBooks attachments / memos) with QuickBooks + storage stubbed.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export async function run({ ok, BUILD, M, PROJ }){
  const F = path.join(BUILD, 'netlify/functions/qb-files.js');
  if (!fs.existsSync(F)) { console.log('SKIP E (qb-files.js not in this build)'); return; }
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test' });
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 60 >>\nstream\nBT /F1 12 Tf 72 700 Td (Invoice for 1234 Oak Ridge Dr) Tj ET\nendstream\nendobj\n%%EOF\n', 'latin1');
  const STORE = new Map(), CALLS = [];
  let QB401 = false;
  const res = (status, body, raw) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => raw ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length) : new ArrayBuffer(0) });
  const BILLS = [{ Id: '311', DocNumber: '85378', TxnDate: '2026-11-01', TotalAmt: 1800, PrivateNote: 'ROUGH IN', VendorRef: { name: 'Demo Electric Co' },
    Line: [{ Amount: 1800, Description: 'rough in', DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: { CustomerRef: { value: '9', name: 'Smith, John:Smith Garage' }, AccountRef: { name: 'Subcontractors' } } }] }];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    init = init || {}; const u = new URL(url), m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
    CALLS.push([m, u.host, u.pathname + u.search]);
    if (u.host === 'sb.test') {
      if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || '').replace(/^Bearer\s+/, ''); const mm = /^staff:(.+)$/.exec(a); return mm ? res(200, { id: 'u', email: mm[1] }) : res(401, {}); }
      if (u.pathname === '/rest/v1/gc_staff') { const e = decodeURIComponent(u.searchParams.get('email') || '').replace(/^eq\./, ''); const rows = { 'office@grayco-cs.com': { email: 'office@grayco-cs.com', role: 'office', active: true }, 'crew@grayco-cs.com': { email: 'crew@grayco-cs.com', role: 'staff', active: true }, 'owner@grayco-cs.com': { email: 'owner@grayco-cs.com', role: 'admin', active: true } }; return res(200, rows[e] ? [rows[e]] : []); }
      if (u.pathname === '/rest/v1/gc_kv') return res(200, [{ value: [{ email: 'office@grayco-cs.com', role: 'Office' }, { email: 'crew@grayco-cs.com', role: 'Crew' }] }]);
      const sm = /^\/storage\/v1\/object\/crm-files\/(.+)$/.exec(u.pathname);
      if (sm && m === 'POST') { if (STORE.has(sm[1])) return res(409, { error: 'Duplicate' }); STORE.set(sm[1], Buffer.from(init.body)); return res(200, {}); }
      return res(404, {});
    }
    if (u.host === 'quickbooks.api.intuit.com') {
      if (QB401) return res(401, { fault: 'AuthenticationFailed' });
      const q = u.searchParams.get('query') || '';
      if (/\/companyinfo\//.test(u.pathname)) return res(200, { CompanyInfo: { CompanyName: 'Demo Builders LLC' } });
      if (/from Bill where DocNumber = '85378'/.test(q)) return res(200, { QueryResponse: { Bill: BILLS } });
      if (/from Bill where/.test(q)) return res(200, { QueryResponse: {} });
      if (/from Attachable/.test(q) && /Value = '311'/.test(q)) return res(200, { QueryResponse: { Attachable: [{ Id: 'A1', FileName: 'bill-85378.pdf', ContentType: 'application/pdf', Size: PDF.length, TempDownloadUri: 'https://files.test/a1?sig=x' }, { Id: 'A2', FileName: 'note.exe', ContentType: 'application/x-msdownload', TempDownloadUri: 'https://files.test/a2' }] } });
      return res(200, { QueryResponse: {} });
    }
    if (u.host === 'files.test') return res(200, {}, PDF);
    return res(404, {});
  };
  const fn = require(F);
  const call = (who, body, qb) => fn.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:' + who }, qb === false ? {} : { 'x-qb-token': 'tok', 'x-qb-realm': '123456' }), body: JSON.stringify(body) }).then(r => ({ code: r.statusCode, j: JSON.parse(r.body) }));
  const st = await call('office@grayco-cs.com', { op: 'status' });
  ok('E1 the office may use it; status reads the QuickBooks company (read-only)', st.code === 200 && st.j.connected === true && st.j.company === 'Demo Builders LLC', st);
  const crew = await call('crew@grayco-cs.com', { op: 'status' });
  ok('E2 the crew is refused (403)', crew.code === 403, crew);
  const nc = await call('owner@grayco-cs.com', { op: 'status' }, false);
  ok('E3 no QuickBooks sign-in on this computer → "not connected" in plain words', nc.j.notConnected === true && /not connected/.test(nc.j.error), nc.j);
  const lk = await call('owner@grayco-cs.com', { op: 'lookup', items: [{ key: 'k1', kind: 'bill', num: '85378', amount: 1800, name: 'Demo Electric Co', files: true, text: true }, { key: 'k2', kind: 'bill', num: 'NOPE' }] });
  const r1 = lk.j.results[0], f1 = (r1.files || [])[0] || {};
  const h = crypto.createHash('sha256').update(PDF).digest('hex');
  ok('E4 a bill found by its QuickBooks number: memo (PrivateNote), the line\'s Customer (the job) and description', r1.ok && r1.id === '311' && r1.memo === 'ROUGH IN' && r1.lines[0].customer === 'Smith, John:Smith Garage' && r1.lines[0].desc === 'rough in', r1);
  ok('E5 its PDF is downloaded and kept in crm-files under its SHA-256 (sb:crm-files/<sha256>.pdf); a .exe is not kept', f1.ref === 'sb:crm-files/' + h + '.pdf' && STORE.has(h + '.pdf') && r1.files[1].skipped, r1.files);
  ok('E6 the PDF\'s text comes back (for matching a job by its address)', /1234 Oak Ridge Dr/.test(r1.text || ''), r1.text);
  ok('E7 a number QuickBooks does not have → "not found", the rest still answered', lk.j.results[1].ok === false && /not found/.test(lk.j.results[1].error));
  const again = await call('owner@grayco-cs.com', { op: 'lookup', items: [{ key: 'k1', kind: 'bill', num: '85378', files: true }] });
  ok('E8 the same attachment twice → the same file (stored once, "already there" counts as stored)', again.j.results[0].files[0].ref === f1.ref && [...STORE.keys()].length === 1);
  ok('E9 NOTHING but GETs ever went to QuickBooks (no write possible)', CALLS.filter(c => /intuit\.com$/.test(c[1])).every(c => c[0] === 'GET') && CALLS.some(c => /intuit\.com$/.test(c[1])));
  QB401 = true;
  const ex = await call('owner@grayco-cs.com', { op: 'lookup', items: [{ key: 'k1', kind: 'bill', num: '85378' }] });
  ok('E10 an expired QuickBooks sign-in → { notConnected, reason: expired } with plain words', ex.j.notConnected === true && ex.j.reason === 'expired' && /expired/.test(ex.j.error), ex.j);
  QB401 = false;
  if (M) {
    const mt = M.matchJob({ memo: 'ROUGH IN', text: r1.text, side: 'cost' }, { projects: PROJ });
    ok('E11 a row whose memo says nothing → the text of its QuickBooks PDF finds the job (1234 Oak Ridge Dr → Smith Roof)', mt.pid === 'PJ1' && /attached PDF/.test(mt.why), mt);
    const mt2 = M.matchJob({ memo: 'ROUGH IN', lines: r1.lines.map(l => ({ memo: l.desc, cust: l.customer })), side: 'cost' }, { projects: PROJ });
    ok('E12 … or the QuickBooks line\'s Customer (Customer:Job "Smith Garage") does', mt2.pid === 'PJ4', mt2);
  }
  global.fetch = realFetch;
}
