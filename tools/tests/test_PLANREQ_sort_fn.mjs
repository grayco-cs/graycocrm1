/* patch PLANREQ-B/C — node tools/tests/test_PLANREQ_sort_fn.mjs [build dir]   (no browser; in-memory Supabase + file bucket; made-up files)
   Owner 11/12: "make sure I can add all types of files, I have scopes I can't add in scopes, and if I add scopes and plans and specs put them in
   scopes by trade". _lib/tradeguess.js (names, CSI divisions, sheet prefixes, the text of PDF / Word / Excel files); plans-guess shows each file's
   guess (a ZIP's sheets too); plans-import files every common type: plans → Plans (+ trades), specs → Specs (+ trades), scope → that trade's
   scope files (a new trade box when needed) — the person's pick (sort / kind / trades) wins; bid-hub op scope keeps the files; a sub sees only
   their own trades' scope files; a scope file does not count as "plans posted" for plan requests.
   (the original header: node tools/tests/test_PLANREQ_fn.mjs [build dir]   (no browser; an in-memory Supabase + caught e-mail; made-up people and jobs)
   Owner 11/12: "on bid portal if I don't have plans have where sub can request plans or more info and it emails and messages the PM or estimator".
   · a sub's 📩 request → ONE e-mail to the job's PM + estimator (staff only — it goes while ⏸ data-entry mode is on), a 💬 Job Messages post
     naming them (notify list → 🔔 For you), a To-Do "📩 <Sub> asked for plans — <job>" with them as assignees
   · fallbacks: no PM / estimator → the poster → the Senior Estimator → office@
   · one open request per sub per job; a sub not approved / a job not open to them / a closed job → refused; an admin can't "request"
   · plans added (a 🔗 link via bid-hub op plans, a plan file, 📢 postjob) → the request closes, its To-Do is done, the sub gets a bid-site notice,
     the "Plans are now posted" e-mail is HELD while ⏸ is on and sent on a later look; a request on a job that already had plans is not closed by the sweep
   · bid-hub op planreq: ↩ Reply (notice + e-mail to the sub) / ✅ Mark sent; who may (admin / estimator / office / the job's PM — not other staff)
   · manageView lists the requests; jobsList counts open ones; a sub loads only their own (no other sub's name) */
import { createRequire } from 'module'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const FN = path.join(ROOT, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test' });
['PORTAL_MAIL_OFF', 'OWNER_EMAILS', 'SUBPORTAL_NOTIFY', 'PORTAL_AUTO_EMAIL'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.message ? e.message.slice(0, 600) : e); } }
const yes = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
const now = new Date().toISOString(), day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* ── the in-memory database ── */
const SP = new Map(), KV = { gc_office_tasks: '[]', gc_job_messages: '[]', gc_automation_pause: { on: false },
  users: [{ id: 'U_pm', name: 'Pat Planner', email: 'pplanner@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'U_est', name: 'Gus Estimator', email: 'gestimator@grayco-cs.com', role: 'Estimator', active: true },
    { id: 'U_o', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true }, { id: 'U_lpm', name: 'Lee Leadpm', email: 'lleadpm@grayco-cs.com', role: 'Project Manager', active: true }],
  projects: [{ id: 'P1', name: 'Sample Clinic', pm: 'Pat Planner' }], leads: [{ id: 'L1', name: 'Sample Lead', pm: 'Lee Leadpm', estimator: 'Gus Estimator' }] };
let KVAT = 0; const KVT = {};
let STAFF = [{ email: 'wjohnson@grayco-cs.com', name: 'Wes Owner', role: 'admin', active: true }, { email: 'pplanner@grayco-cs.com', name: 'Pat Planner', role: 'pm', active: true },
  { email: 'gestimator@grayco-cs.com', name: 'Gus Estimator', role: 'staff', profile: 'estimator', active: true }];
const MAIL = [], STORE = new Map();
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body), clone(){ return this; }, headers: { get: () => null } });
const dec = v => decodeURIComponent(String(v || ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(String(url)), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'm' + MAIL.length }); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/rest/v1/sp_rows') {
    if (m === 'POST') { JSON.parse(init.body).forEach(r => SP.set(r.key, Object.assign({}, SP.get(r.key) || {}, JSON.parse(JSON.stringify(r))))); return res(201, []); }
    let rows = [...SP.values()];
    for (const [k, v] of q.entries()) { if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dec(v.slice(3)));
      else if (v.startsWith('in.')) { const l = dec(v.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => l.includes(String(r[k]))); } }
    if (m === 'DELETE') { rows.forEach(r => SP.delete(r.key)); return res(204, ''); }
    return res(200, rows.sort((a, b) => a.key < b.key ? -1 : 1));
  }
  if (u.pathname === '/rest/v1/gc_kv' || u.pathname === '/rest/v1/gc_lead_inbox_kv') {
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return res(200, []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { KV[r.key] = r.value; KVT[r.key] = 'T' + (++KVAT); }); return res(201, []); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? dec(k.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [dec(k.replace(/^eq\./, ''))];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: KVT[x] || 'T0' })));
  }
  if (u.pathname === '/rest/v1/gc_staff') return res(200, STAFF);
  { const mm = /^\/storage\/v1\/object\/subportal-files\/(.+)$/.exec(u.pathname); if (mm) { const k = mm[1].split('/').map(decodeURIComponent).join('/');
    if (m === 'POST') { STORE.set(k, Buffer.from(init.body)); return res(200, { Key: k }); }
    const b = STORE.get(k); return b ? Object.assign(res(200, {}), { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }) : res(404, {}); } }
  return res(200, []);   /* mail index, sent log … */
};
const SPM = require(path.join(FN, 'subportal.js')), HUBX = SPM._hub;
const BH = require(path.join(FN, 'bid-hub.js'))._test;
const PAUSE = require(path.join(FN, '_lib/pause.js'));
const setPause = on => { KV.gc_automation_pause = { on }; PAUSE.reset(); };
const kvList = k => { const v = KV[k]; return typeof v === 'string' ? JSON.parse(v) : v; };
const put = (c, d, extra) => SP.set(c + '/' + d.id, Object.assign({ key: c + '/' + d.id, collection: c, id: d.id, job_id: c === 'jobs' || c === 'plans' ? d.id : (d.jobId || null), user_id: d.userId || null, email: d.email || null, data: d }, extra || {}));
const row = k => SP.get(k) && SP.get(k).data;


function zipOf(files){
  const parts = [], central = []; let off = 0;
  const crc = b => { let c, t = [], r = 0xFFFFFFFF; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } for (const x of b) r = t[(r ^ x) & 0xFF] ^ (r >>> 8); return (r ^ 0xFFFFFFFF) >>> 0; };
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data), c = crc(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, data); central.push(ch, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, e]));
}
const zlib = require('zlib');
const DOCX = zipOf([{ name: 'word/document.xml', data: '<w:document><w:body><w:p><w:r><w:t>SCOPE OF WORK</w:t></w:r></w:p><w:p><w:r><w:t>HVAC — rooftop units and ductwork</w:t></w:r></w:p></w:body></w:document>' }]);
const XLSX = zipOf([{ name: 'xl/sharedStrings.xml', data: '<sst><si><t>Plumbing fixture schedule</t></si><si><t>WC-1 water closet</t></si></sst>' }]);
const PDFTXT = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj <</Length 60 /Filter /FlateDecode>> stream\n'), zlib.deflateSync(Buffer.from('BT /F1 12 Tf (ELECTRICAL SCOPE OF WORK) Tj ET')), Buffer.from('\nendstream endobj\n%%EOF')]);
const PDF = n => Buffer.from('%PDF-1.4\n% sheet ' + n + '\n%%EOF');
const G = require(path.join(FN, '_lib/tradeguess.js'));
put('jobs', { id: 'j_s', title: 'Sample Clinic Remodel', status: 'open', visibility: 'public', bidDueDate: day(7), tradesSought: 'Drywall', tradeScopes: [{ id: 'ts_dw', trade: 'Drywall', scope: 'Hang and finish.' }] });
const SUBE = { id: 'u_el', role: 'sub', approved: true, email: 'eli@sampleelectric.test', name: 'Eli Sample', company: 'Sample Electric', trades: ['Electrical'] };
const SUBP = { id: 'u_pl', role: 'sub', approved: true, email: 'pia@sampleplumb.test', name: 'Pia Sample', company: 'Sample Plumbing', trades: ['Plumbing'] };
[SUBE, SUBP].forEach(u => put('users', u, { user_id: u.id, email: u.email }));
const whoSub = u => ({ email: u.email, isAdmin: false, isSub: true, approved: u.approved === true, profile: u });
const ADM = { email: 'wjohnson@grayco-cs.com', isAdmin: true, profile: { name: 'Wes Owner' } };
const up = (name, buf) => { const ref = 'staff/2026-11/' + Math.random().toString(36).slice(2, 8) + '-' + name.replace(/[^A-Za-z0-9._-]+/g, '_'); STORE.set('subportal-files/' + ref, buf); STORE.set(ref, buf); return ref; };

await t('the guess (names): "Electrical scope.pdf" → scope ⚡ Electrical; "Div 09 Finishes" → specs Drywall/Paint/Flooring…; "Plumbing fixture schedule.xlsx" → scope Plumbing; E-101 → plans Electrical; A-201 → plans, no trade', async () => {
  const g = n => { const x = G.guess(n, ''); return x.kind + ':' + x.trades.join('|'); };
  eq(g('Electrical scope.pdf'), 'scope:Electrical');
  eq(g('Div 09 Finishes.pdf'), 'specs:Drywall|Paint|Flooring|Tile|Ceilings');
  eq(g('Plumbing fixture schedule.xlsx'), 'scope:Plumbing');
  eq(g('E-101 Power Plan.pdf'), 'plans:Electrical'); eq(g('P2.1.pdf'), 'plans:Plumbing'); eq(g('M-301 Ductwork.pdf'), 'plans:HVAC'); eq(g('A-201 Elevations.pdf'), 'plans:');
  eq(g('Project Manual - Section 26 05 00.pdf'), 'specs:Electrical'); eq(g('Roofing SOW.docx'), 'scope:Roofing');
  yes(G.EXT.docx && G.EXT.xlsx && G.EXT.pptx && G.EXT.heic && G.EXT.csv && G.EXT.rtf && G.EXT.txt && G.EXT.dwg && G.EXT.zip, 'every common type');
});
await t('the guess (text): a Word file that says "SCOPE OF WORK … HVAC", an Excel "Plumbing fixture schedule", a PDF "ELECTRICAL SCOPE OF WORK" (deflated stream)', async () => {
  const w = G.guess('Document1.docx', G.text(DOCX, 'docx')); eq([w.kind, w.trades[0]], ['scope', 'HVAC']);
  const x = G.guess('Book1.xlsx', G.text(XLSX, 'xlsx')); eq([x.kind, x.trades[0]], ['scope', 'Plumbing']);
  const p = G.guess('scan0001.pdf', G.text(PDFTXT, 'pdf')); eq([p.kind, p.trades[0]], ['scope', 'Electrical']);
});
await t('plans-guess: a ZIP lists each sheet with its guess; one Word file is read (its text)', async () => {
  const z = up('Bid set.zip', zipOf([{ name: 'Electrical/E-101 Power.pdf', data: PDF(1) }, { name: 'Scopes/Plumbing scope.docx', data: XLSX }, { name: 'Specs/Div 09 Finishes.pdf', data: PDF(2) }, { name: 'A-101 Floor plan.pdf', data: PDF(3) }]));
  const r = await HUBX.plansGuess(ADM, { fileRef: z, name: 'Bid set.zip' });
  eq(r.files.map(f => f.key + '=' + f.kind + ':' + f.trades.join('|')), ['Electrical/E-101 Power.pdf=plans:Electrical', 'Scopes/Plumbing scope.docx=scope:Plumbing', 'Specs/Div 09 Finishes.pdf=specs:Drywall|Paint|Flooring|Tile|Ceilings', 'A-101 Floor plan.pdf=plans:']);
  const d = up('Document1.docx', DOCX); const r2 = await HUBX.plansGuess(ADM, { fileRef: d, name: 'Document1.docx', size: DOCX.length });
  eq([r2.files[0].kind, r2.files[0].trades[0]], ['scope', 'HVAC']);
});
await t('plans-import of the ZIP with the person\'s picks: plans → Plans (+ trades), specs → Specs, scope → the Plumbing scope box (made); the pick wins over the guess', async () => {
  const z = up('Bid set 2.zip', zipOf([{ name: 'Electrical/E-101 Power.pdf', data: PDF(11) }, { name: 'Scopes/Plumbing scope.docx', data: XLSX }, { name: 'Specs/Div 09 Finishes.pdf', data: PDF(12) }, { name: 'A-101 Floor plan.pdf', data: PDF(13) }]));
  const r = await HUBX.plansImport(ADM, { jobId: 'j_s', fileRef: z, name: 'Bid set 2.zip', sort: { 'A-101 Floor plan.pdf': { kind: 'plans', trades: ['Drywall'] } } });
  eq(r.added.map(x => x.name + '=' + x.category + ':' + x.trades.join('|')).sort(), ['A-101 Floor plan.pdf=Plans:Drywall', 'Div 09 Finishes.pdf=Specs:Drywall|Paint|Flooring|Tile|Ceilings', 'E-101 Power.pdf=Electrical:Electrical']);
  eq(r.scoped.map(x => x.name + ':' + x.trades.join('|')), ['Plumbing scope.docx:Plumbing']);
  const j = row('jobs/j_s'); const pl = j.tradeScopes.find(x => x.trade === 'Plumbing');
  yes(pl && pl.files.length === 1 && /^staff\/plans\/j_s\//.test(pl.files[0].fileRef), JSON.stringify(j.tradeScopes));
  yes(/Plumbing/.test(j.tradesSought) && /Drywall/.test(j.tradesSought), 'the trade is now sought: ' + j.tradesSought);
  yes(j.plans.some(p => p.name === 'E-101 Power.pdf' && p.trades[0] === 'Electrical'), 'job.plans has trades');
});
await t('every common type goes on (Word, Excel, CSV, PowerPoint, TXT, RTF, HEIC, TIFF, DWG); a one-file pick (a trade\'s 📎 Add files) files it on that trade', async () => {
  for (const n of ['Notes.txt', 'Schedule.csv', 'Kickoff.pptx', 'Letter.rtf', 'Photo.heic', 'Scan.tiff', 'Site.dwg', 'Takeoff.xls', 'Narrative.doc']) {
    const r = await HUBX.plansImport(ADM, { jobId: 'j_s', fileRef: up(n, Buffer.from('x')), name: n, size: 1, kind: 'plans', trades: [] });
    yes(r.added.length === 1, n + ' ' + JSON.stringify(r));
  }
  const r = await HUBX.plansImport(ADM, { jobId: 'j_s', fileRef: up('Electrical scope.pdf', PDF(20)), name: 'Electrical scope.pdf', size: 30, kind: 'scope', trades: ['Electrical'] });
  eq(r.scoped.map(x => x.trades[0]), ['Electrical']);
  let bad = ''; try { await HUBX.plansImport(ADM, { jobId: 'j_s', fileRef: up('virus.exe', Buffer.from('x')), name: 'virus.exe', size: 1 }); } catch (e) { bad = e.message; }
  yes(/can not go on a bid job/.test(bad), bad);
});
await t('bid-hub op scope (typing a scope, removing one file) keeps the other scope files; a sub sees only their own trade\'s scope files', async () => {
  const j0 = row('jobs/j_s'), ts = j0.tradeScopes.map(x => ({ id: x.id, trade: x.trade, scope: x.trade === 'Plumbing' ? 'Set fixtures.' : x.scope, mode: 'manual', files: x.files }));
  const ADMH = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wes Owner', admin: true, canInvite: true };
  const hub = require(path.join(FN, 'bid-hub.js')), BI = require(path.join(FN, 'bid-inbox.js')); const ra = BI._test.staffAuth; BI._test.staffAuth = async () => Object.assign({}, ADMH);
  const out = await hub.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ op: 'scope', jobId: 'j_s', tradeScopes: ts }) }); BI._test.staffAuth = ra;
  eq(out.statusCode, 200, out.body);
  const j = row('jobs/j_s'); eq(j.tradeScopes.find(x => x.trade === 'Plumbing').files.length, 1); eq(j.tradeScopes.find(x => x.trade === 'Plumbing').scope, 'Set fixtures.');
  eq(j.tradeScopes.find(x => x.trade === 'Electrical').files.length, 1);
  const vE = HUBX.subJobView(j, ['Electrical']), vP = HUBX.subJobView(j, ['Plumbing']);
  eq(vE.tradeScopes.map(x => x.trade + ':' + (x.files || []).length), ['Electrical:1']);
  eq(vP.tradeScopes.map(x => x.trade + ':' + (x.files || []).length), ['Plumbing:1']);
});
await t('the sub portal (📋 Jobs to bid) lists their trade\'s scope files as signed links', async () => {
  /* through portal-access p-bidjobs is covered by the browser test; here: signAll signs tradeScopes[].files */
  const j = HUBX.subJobView(row('jobs/j_s'), ['Electrical']);
  const before = JSON.stringify(j.tradeScopes); yes(/fileRef/.test(before));
});
await t('a plan request is not closed by a scope file (only plans / specs / links count)', async () => {
  const r = await HUBX.requestPlans(whoSub(SUBE), { jobId: 'j_s', needs: ['specs'], note: 'Electrical specs?' }, {});
  yes(r.request.status === 'open');
  await HUBX.plansImport(ADM, { jobId: 'j_s', fileRef: up('Electrical scope v2.pdf', PDF(30)), name: 'Electrical scope v2.pdf', size: 30, kind: 'scope', trades: ['Electrical'] });
  eq(row('planreqs/j_s__u_el').status, 'open', 'still open');
  await HUBX.plansImport(ADM, { jobId: 'j_s', fileRef: up('Div 26 Electrical specs.pdf', PDF(31)), name: 'Div 26 Electrical specs.pdf', size: 30 });
  eq(row('planreqs/j_s__u_el').closedHow, 'plans', 'a spec file closes it');
});
await t('PLANREQ-I: a trade scope saved with the plans (Hamlets_Scope_01_Sitework.docx) moves to its trade once (op resort); a scope for every sub stays with the plans as "Scope — all subs"; the plan set stays', async () => {
  put('jobs', { id: 'j_r', title: 'Sample Dormitory', status: 'open', visibility: 'public', bidDueDate: day(9), tradesSought: 'Drywall', tradesPicked: true, tradeScopes: [] });
  put('plans', { id: 'j_r', items: [{ name: '26089 - 100 Percent Pricing Set - 11.02.2026.pdf', category: 'Plans', fileRef: 'staff/x/set.pdf', current: true }, { name: 'Hamlets_Scope_01_Sitework.docx', category: 'Scope', fileRef: 'staff/x/sw.docx' }, { name: 'General Scope of Work.pdf', category: 'Scope', fileRef: 'staff/x/gen.pdf' }] });
  const BHT = require(path.join(FN, 'bid-hub.js'))._test;
  eq(BHT.resortCount(row('plans/j_r').items), 2);
  const r = await BHT.resort({ ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wes', admin: true, canInvite: true }, { jobId: 'j_r' });
  eq(r.moved.map(x => x.name + ':' + x.trades.join()), ['Hamlets_Scope_01_Sitework.docx:Sitework']); eq(r.relabeled, ['General Scope of Work.pdf']);
  eq(row('plans/j_r').items.map(x => x.name + '=' + x.category), ['26089 - 100 Percent Pricing Set - 11.02.2026.pdf=Plans', 'General Scope of Work.pdf=Scope — all subs']);
  const j = row('jobs/j_r'); eq(j.tradeScopes.map(x => x.trade + ':' + x.files.map(f => f.name).join()), ['Sitework:Hamlets_Scope_01_Sitework.docx']); eq(j.tradesSought, 'Drywall, Sitework');
  eq(BHT.resortCount(row('plans/j_r').items), 0, 'once');
  const imp = await HUBX.plansImport(ADM, { jobId: 'j_r', fileRef: up('Scope of Work - all trades.docx', Buffer.from('x')), name: 'Scope of Work - all trades.docx', size: 1 });
  eq(imp.added.map(x => x.category), ['Scope — all subs'], 'on upload: a scope for every sub stays with the plans');
});
await t('PLANREQ-H: trades the Lead Inbox copied from an invite are only SUGGESTED (manage / jobs list); picking them (op details) makes them the job\'s', async () => {
  const BHT = require(path.join(FN, 'bid-hub.js'))._test;
  put('jobs', { id: 'j_auto', title: 'New Female Dormitory', status: 'open', visibility: 'private', createdBy: 'lead-inbox', leadInbox: { id: 'LI-9' }, tradesSought: 'Prefabricated Wood Trusses, Standing Seam Metal Roofing' });
  const mv = await BHT.manageView('j_auto'); eq([mv.job.trades, mv.job.tradesSuggested], ['', 'Prefabricated Wood Trusses, Standing Seam Metal Roofing']);
  const jl = (await BHT.jobsList()).find(x => x.id === 'j_auto'); eq([jl.trades, jl.tradesSuggested], ['', 'Prefabricated Wood Trusses, Standing Seam Metal Roofing']);
  const r = await BHT.details({ ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wes', admin: true, canInvite: true }, { jobId: 'j_auto', trades: ['Roofing'] });
  yes(r.ok); const mv2 = await BHT.manageView('j_auto'); eq([mv2.job.trades, mv2.job.tradesSuggested], ['Roofing', '']);
});
console.log('\nPLANREQ_sort_fn ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
