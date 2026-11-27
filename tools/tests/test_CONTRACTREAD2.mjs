// test_CONTRACTREAD2.mjs <build-dir> — patch CONTRACTREAD2 + DOCSCHED (owner 11/27, every Head Start job at Contract $0.00: "my contracts
// with amounts officially are in the crm and under contracts it should be reading that and entering here and when change orders happen
// it adds them" + "this should be reading my schedule and putting it in here if i put any schedule in for the job in the documents").
// Made-up jobs whose documents were imported BEFORE the readers existed (projectDocs with sb:crm-files refs, nothing read):
//   · the empty job gets the SIGNED contract's "Contract Sum … $123,456.00" (a person edit, contractFrom = the file) — not the
//     subcontract agreement's bigger sum (Sub Docs, or mis-filed under Contracts), not the proposal, not the exhibit;
//   · a job with a contract only gets "📄 … says $X — the job shows $Y · ✅ Use · Keep"; a job with only a proposal: the note, $0 stays;
//   · each file is fetched once — a second run and a second computer read nothing again (gc_zip_import "zi_docread");
//   · the tentative schedule document → 📋 Tentative items + the job page card "📅 Tentative schedule found in <file> (3 items)" →
//     ✅ Post → on the schedule (the person-typed Start stays), the card never comes back; a sub sees posted rows, never tentative;
//   · a non-tentative schedule added through the 📄 Documents uploader is read and posted (admin button "📄 Read … now");
//   · change orders: the Projects list Contract shows contract + approved COs with "incl. $X in change orders", the job tile the
//     same, the job's own contract value never changes; approving one more CO adds it; pending / declined / deleted never count.
// Usage: node test_CONTRACTREAD2.mjs <dir with index.html>  (GC_HARNESS as in test_CONTRACTREAD.mjs)
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import crypto from 'crypto';
import path from 'path';
const require = createRequire(import.meta.url);
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_CONTRACTREAD2.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const NICK = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === 'Nick Gray');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();

function pdfLines(lines){
  const st = 'BT /F1 10 Tf 14 TL 72 740 Td ' + lines.map(l => '(' + l.replace(/[()]/g, m => '\\' + m) + ') Tj 0 -14 Td').join(' ') + ' ET';
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + st.length + '>>\nstream\n' + st + '\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
}
const FILES = {};   // sha → bytes (the file store)
const doc = (id, pid, cat, name, bytes, ext) => { const sha = crypto.createHash('sha256').update(bytes).digest('hex'); FILES[sha] = bytes;
  return { id, pid, projectId: pid, cat, name, ref: 'sb:crm-files/' + sha + '.' + (ext || 'pdf'), type: ext === 'txt' ? 'text/plain' : 'application/pdf', size: bytes.length, hash: sha, source: 'zip-import', portalShare: true, uploaded: '2026-11-26', uploadedAt: '2026-11-26T01:35:00.000Z' }; };
const CONTRACT = n => pdfLines(['CONTRACT BETWEEN OWNER AND CONTRACTOR — ' + n, 'Owner phone (901) 555-1234   Date 11/25/2026',
  'ARTICLE 4 CONTRACT SUM', 'The Owner shall pay the Contractor the Contract Sum of ($123,456.00), subject to additions and deductions.', 'Line item 1 Demolition $12,000.00',
  'Insurance: general liability limit $1,000,000 per occurrence']);
H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true }, { id: 'u7', name: 'Sample Sub Co', role: 'Sub', active: true }]);
const P = (id, name, contract, extra) => Object.assign({ id, name, client: 'Sample Center ' + id, address: id + ' Demo Rd, Sample, AR', po: 'Q' + id, autoPO: 'Q' + id, contract, pm: 'Nick Gray', status: 'active', updatedAt: ago(1) }, extra || {});
H.cset('projects', [P('P1', 'Brinkley - Sample', ''), P('P2', 'Phillips - Sample', 100000), P('P3', 'Clarendon - Sample', 0), P('P4', 'CO Job - Sample', 50000), P('P5', 'Deck - Sample', 20000), P('P6', 'Des Arc - Sample', 30000)]);
H.cset('projectDocs', [
  doc('d1', 'P1', 'Contracts', 'CDI Contract - Brinkley - SIGNED BY GRAYCO - Nov 25.pdf', CONTRACT('Brinkley')),
  doc('d2', 'P1', 'Sub Docs', 'GrayCo_Subcontract_Agreement_Sample_Drywall.pdf', pdfLines(['SUBCONTRACT AGREEMENT', 'Contract Sum: $9,999,999.00'])),
  doc('d2b', 'P1', 'Contracts', 'GrayCo_Subcontract_Agreement_Brinkley.pdf', pdfLines(['SUBCONTRACT AGREEMENT', 'Contract Sum: $8,888,888.00'])),
  doc('d3', 'P1', 'Contracts', 'GrayCo_Original_Proposal_Oct_30_Brinkley.pdf', pdfLines(['PROPOSAL', 'Total Bid: $130,000.00'])),
  doc('d4', 'P1', 'Contracts', 'GrayCo_CDI_HeadStart_Contract_Exhibit_Brinkley.pdf', pdfLines(['EXHIBIT A', 'Contract Sum: $777,777.00'])),
  doc('d5', 'P1', 'Contracts', 'README - upload CDI-signed documents here.txt', Buffer.from('Contract Sum: $5,555,555.00 upload here'), 'txt'),
  doc('d6', 'P1', 'Other', 'GrayCo_Tentative_Schedule_Brinkley.pdf', pdfLines(['TENTATIVE SCHEDULE — BRINKLEY', 'Mobilize and layout 12/01/2026 12/03/2026', 'Demolition of classrooms 12/04/2026 12/10/2026', 'Framing and drywall 12/11/2026 12/20/2026'])),
  doc('d7', 'P2', 'Contracts', 'CDI Contract - Phillips - SIGNED BY GRAYCO - Nov 25.pdf', CONTRACT('Phillips')),
  doc('d9', 'P6', 'Other', 'GrayCo_Tentative_Schedule_DesArc.pdf', pdfLines(['TENTATIVE SCHEDULE — DES ARC', 'Mobilize 01/05/2027 01/06/2027', 'Roof tear-off 01/07/2027 01/12/2027'])),
  doc('d8', 'P3', 'Contracts', 'GrayCo_Revised_Proposal_CDI_HeadStart_Clarendon.pdf', pdfLines(['REVISED PROPOSAL', 'Total Bid: $88,000.00']))]);
H.cset('schedule', [{ id: 'S_typed', pid: 'P1', title: 'Start — Brinkley - Sample', date: '2026-12-01', time: '08:00', type: 'work', scope: 'company', by: 'Nick Gray', createdBy: 'Nick Gray' }]);
H.cset('cos', [
  { id: 'CO1', pid: 'P4', desc: 'Extra outlets', amt: 5000, status: 'approved', date: '2026-11-20' },
  { id: 'CO2', pid: 'P4', desc: 'Upgrade tile', amt: 2000, status: 'pending', date: '2026-11-21' },
  { id: 'CO3', pid: 'P4', desc: 'Skylight', amt: 1000, status: 'declined', date: '2026-11-22' },
  { id: 'CO4', pid: 'P4', desc: 'Old one', amt: 700, status: 'approved', deleted: true, date: '2026-11-19' }]);
H.cset('leads', []); H.cset('punch', []);

const GETS = {};   // sha → storage reads
const OPEN = [];
async function computer(who){
  const a = await H.computer(who, { build, init: ['window.__GC_DOCREAD_FIRST__ = 4000; window.__GC_DOCREAD_EVERY__ = 3000;'] }); OPEN.push(a);
  await a.ctx.route(/\/storage\/v1\/object\/authenticated\/crm-files\/([0-9a-f]{64})\.[a-z]+/, r => {
    const sha = /crm-files\/([0-9a-f]{64})/.exec(r.request().url())[1]; GETS[sha] = (GETS[sha] || 0) + 1;
    if (!FILES[sha]) return r.fulfill({ status: 404, body: '{}', headers: { 'access-control-allow-origin': '*' } });
    return r.fulfill({ status: 200, body: FILES[sha], contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' } });
  });
  await H.signIn(a, NICK, 9000);
  await H.waitFor(a, () => (window._crm && window._crm.projects || []).length >= 5 && !!window._gcDocRead && typeof window._gcxPatchJob === 'function' && !!window._gcTentPost, null, 45000);
  return a;
}
const shaOf = id => { const d = H.cget('projectDocs').find(x => x.id === id); return d.ref.slice(13, 77); };
try {
  const a = await computer('nick');
  const job = id => a.ev(id => { const p = (window._crm.projects || []).find(x => x.id === id) || {}; return { contract: p.contract, from: p.contractFrom, fe: p._fe && p._fe.contract }; }, id);
  const u = await a.ev(() => { const T = window._gcDocRead.tier, S = window._gcDocRead.isSched;
    return { signed: T({ name: 'CDI Contract - Brinkley - SIGNED BY GRAYCO - Nov 25.pdf', cat: 'Contracts' }), sub: T({ name: 'GrayCo_Subcontract_Agreement_X.pdf', cat: 'Contracts' }), subcat: T({ name: 'Agreement.pdf', cat: 'Sub Docs' }),
      exhibit: T({ name: 'GrayCo_CDI_HeadStart_Contract_Exhibit_X.pdf', cat: 'Contracts' }), prop: T({ name: 'GrayCo_Original_Proposal_Oct_30_X.pdf', cat: 'Contracts' }), ack: T({ name: 'Acknowledgment form.pdf', cat: 'Contracts' }),
      sched: S({ name: 'GrayCo_Tentative_Schedule_X.pdf' }), sov: S({ name: 'Schedule of Values.xlsx' }), look: S({ name: '3 week look ahead.xlsx' }) }; });
  ok(u.signed === 1 && u.sub === 0 && u.subcat === 0 && u.exhibit === 3 && u.prop === 4 && u.ack === 0, 'the contract file order: signed 1 · exhibit 3 · proposal 4 · subcontract / Sub Docs / a form never', u);
  ok(u.sched && !u.sov && u.look, 'a schedule document (not a schedule of values)', u);

  /* the idle reader, by itself */
  const j1 = await H.waitFor(a, () => { const p = (window._crm.projects || []).find(x => x.id === 'P1'); return p && +p.contract === 123456 ? { contract: p.contract, from: p.contractFrom, fe: p._fe && p._fe.contract } : null; }, null, 90000);
  ok(j1 && j1.from && /SIGNED BY GRAYCO/.test(j1.from.file) && j1.fe && +j1.fe.v === 123456, 'P1 (empty): read by itself in idle time — $123,456 from the SIGNED contract (a person edit, contractFrom = the file)', j1);
  await H.waitFor(a, () => { const r = (window._gcDocRead.record().docReads || []); return r.some(x => x.pid === 'P2') && r.some(x => x.pid === 'P3') && r.some(x => x.id === 'sc|d6') && r.some(x => x.id === 'sc|d9') ? 1 : 0; }, null, 60000);
  await sleep(2500);
  const j2 = await job('P2'), j3 = await job('P3');
  ok(+j2.contract === 100000 && !j2.from, 'P2 ($100,000): never overwritten', j2);
  ok(+j3.contract === 0 && !j3.from, 'P3 (only a proposal): the price is not set', j3);
  const R = await a.ev(() => window._gcDocRead.record());
  const st = id => ((R.docReads || []).find(x => x.id === id) || {}).state || '';
  ok(!st('ct|d2') && !st('ct|d2b') && !st('ct|d5'), 'the subcontract agreements (Sub Docs or under Contracts) and the README are never read', R.docReads.map(x => [x.id, x.state]));
  ok(st('ct|d1') === 'applied' && st('ct|d3') === 'skipped' && st('ct|d4') === 'skipped', 'the signed contract applied; the proposal and the exhibit skipped (a better file was read)', R.docReads.map(x => [x.id, x.state]));
  ok(!GETS[shaOf('d2')] && !GETS[shaOf('d2b')] && !GETS[shaOf('d3')] && !GETS[shaOf('d4')], 'files that are not read are not even downloaded', GETS);
  const g0 = JSON.stringify(GETS);
  ok(GETS[shaOf('d1')] === 1 && GETS[shaOf('d6')] === 1 && GETS[shaOf('d7')] === 1 && GETS[shaOf('d8')] === 1 && GETS[shaOf('d9')] === 1, 'each read file was downloaded once', GETS);
  const again = await a.ev(() => window._gcDocRead.run({ all: true }));
  ok(Array.isArray(again) && again.length === 0 && JSON.stringify(GETS) === g0, 'a second run reads nothing again', { again, GETS });
  ok(await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { const l = H.cget('gc_zip_import') || []; const r = l.find(x => x.id === 'zi_docread'); if (r && (r.docReads || []).length >= 6) return true; await sleep(500); } return false; })(), 'the record reached the cloud (gc_zip_import zi_docread)');
  ok(await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 40000) { const p = (H.cget('projects') || []).find(x => x.id === 'P1'); if (p && +p.contract === 123456) return true; await sleep(500); } return false; })(), 'the contract reached the cloud job list');

  /* the tentative schedule */
  const sc = await H.waitFor(a, () => { const l = (window._crm.schedule || []).filter(x => x && x.pid === 'P1').map(x => ({ t: x.title, d: x.date, tent: x.tentative === true || x.scope === 'tentative', f: x.fromFile || '' })); return l.length >= 4 ? l : null; }, null, 15000) || [];
  ok(sc.filter(x => x.tent && /Tentative_Schedule/.test(x.f)).length === 3 && sc.some(x => x.t === 'Start — Brinkley - Sample' && !x.tent), 'P1: 3 tentative items from the document, the person-typed Start stays', sc);
  const go = async id => { for (let k = 0; k < 5; k++) { await a.ev(id => { window._gcOpenProject = { id }; window._setView('projects'); window._navToJob(id); }, id); if (await H.waitFor(a, id => window._gcOpenProject && window._gcOpenProject.id === id && /← All Projects/.test((document.querySelector('main') || {}).innerText || ''), id, 4000)) return; } };
  await go('P1');
  const card = await H.waitFor(a, () => { const c = [...document.querySelectorAll('.gc-tp-card')].find(x => x.getClientRects().length); return c ? c.innerText.replace(/\s+/g, ' ') : null; }, null, 20000);
  ok(card && /Tentative schedule found in GrayCo_Tentative_Schedule_Brinkley\.pdf \(3 items\)/.test(card) && /Post as the schedule/.test(card) && /Edit first/.test(card) && /Later/.test(card), 'P1 page: "📅 Tentative schedule found in GrayCo_Tentative_Schedule_Brinkley.pdf (3 items) — ✅ Post · ✏️ Edit first · Later"', card);
  const line = await H.waitFor(a, () => { const e = document.getElementById('gc-docsched'); return e ? e.innerText : null; }, null, 8000);
  ok(line && /3 schedule items read from GrayCo_Tentative_Schedule_Brinkley\.pdf/.test(line), 'the job page says where its schedule came from', line);
  const ct1 = await a.ev(() => (document.getElementById('gc-zipct') || {}).innerText || '');
  ok(/Contract \$123,456\.00 read from CDI Contract - Brinkley/.test(ct1) && /read from the job's documents/.test(ct1), 'P1 page: "📄 Contract $123,456.00 read from CDI Contract … (read from the job\'s documents)"', ct1);
  await a.ev(() => document.querySelector('.gc-tp-card [data-tp="post"]').click());
  const posted = await H.waitFor(a, () => { const l = (window._crm.schedule || []).filter(x => x && x.pid === 'P1' && /Tentative_Schedule/.test(x.fromFile || '')); return l.length === 3 && l.every(x => x.tentative === false && x.scope === 'company') ? l.length : 0; }, null, 10000);
  ok(posted === 3, '✅ Post: the 3 items are on the schedule (not tentative)', posted);
  await H.waitFor(a, () => (window._gcDocRead.record().docReads || []).some(x => x.id === 'sc|d6' && x.state === 'tent-post'), null, 8000);
  ok(await a.ev(() => (window._gcDocRead.record().docReads || []).some(x => x.id === 'sc|d6' && x.state === 'tent-post' && x.decidedBy)), 'the answer is kept (tent-post, who)');
  await go('P2'); await sleep(1500); await go('P1'); await sleep(4000);
  ok(!(await a.ev(() => [...document.querySelectorAll('.gc-tp-card')].some(x => x.getClientRects().length))), 'back on P1: the card does not come back');
  const sAll = await a.ev(() => (window._crm.schedule || []).filter(x => x && x.pid === 'P1').length);
  ok(sAll === 4, 'nothing duplicated or removed on P1\'s schedule (1 typed + 3 read)', sAll);

  /* a job whose contract did not change: the card still comes (the page's copy of the schedule has the new rows) */
  await go('P6');
  const card6 = await H.waitFor(a, () => { const c = [...document.querySelectorAll('.gc-tp-card')].find(x => x.getClientRects().length); return c ? c.innerText.replace(/\s+/g, ' ') : null; }, null, 20000);
  ok(card6 && /Tentative schedule found in GrayCo_Tentative_Schedule_DesArc\.pdf \(2 items\)/.test(card6), 'P6 (contract already $30,000): the card "… DesArc.pdf (2 items)"', card6);
  await a.ev(() => document.querySelector('.gc-tp-card [data-tp="later"]').click());
  await H.waitFor(a, () => (window._gcDocRead.record().docReads || []).some(x => x.id === 'sc|d9' && x.state === 'tent-later'), null, 8000);
  ok(await a.ev(() => (window._crm.schedule || []).filter(x => x && x.pid === 'P6' && x.tentative === true).length === 2 && (window._gcDocRead.record().docReads || []).some(x => x.id === 'sc|d9' && x.state === 'tent-later')), 'Later: still tentative (never posted silently), the answer kept');

  /* the notes */
  await go('P2');
  const n2 = await H.waitFor(a, () => { const e = document.getElementById('gc-zipct'); return e && e.querySelector('[data-ct-use]') ? e.innerText : null; }, null, 15000);
  ok(n2 && /CDI Contract - Phillips - SIGNED BY GRAYCO - Nov 25\.pdf says \$123,456\.00 — the job shows \$100,000\.00/.test(n2) && /✅ Use \$123,456\.00/.test(n2) && /Keep/.test(n2), 'P2 page: "📄 … says $123,456.00 — the job shows $100,000.00 · ✅ Use · Keep"', n2);
  await go('P3');
  const n3 = await H.waitFor(a, () => { const e = document.getElementById('gc-zipct'); return e && e.querySelector('[data-ct-use]') && /Revised_Proposal/.test(e.innerText) ? e.innerText : null; }, null, 15000);
  ok(n3 && /Revised_Proposal.*says \$88,000\.00 — the job shows \$0\.00/.test(n3), 'P3 page: the proposal only as a note ("says $88,000.00 — the job shows $0.00")', n3);
  await a.ev(() => document.querySelector('#gc-zipct [data-ct-keep]').click());
  await H.waitFor(a, () => !document.querySelector('#gc-zipct [data-ct-keep]'), null, 8000);
  ok(+(await job('P3')).contract === 0, 'Keep: P3 stays $0');

  /* change orders */
  await a.ev(() => { const bt = [...document.querySelectorAll('main button, #root button')].find(x => /← All Projects/.test(x.textContent || '')); if (bt) bt.click(); });
  const row = await H.waitFor(a, () => { const tr = [...document.querySelectorAll('#root table tbody tr')].find(r => /CO Job - Sample/.test(r.innerText)); return tr ? tr.innerText.replace(/\s+/g, ' ') : null; }, null, 15000);
  ok(row && /\$55,000\.00/.test(row) && /incl\. \$5,000\.00 in change orders/.test(row), 'Projects list: CO Job $55,000.00 "incl. $5,000.00 in change orders" (pending / declined / deleted not counted)', row);
  const row1 = await a.ev(() => { const tr = [...document.querySelectorAll('#root table tbody tr')].find(r => /Brinkley - Sample/.test(r.innerText)); return tr ? tr.innerText.replace(/\s+/g, ' ') : ''; });
  ok(/\$123,456\.00/.test(row1) && !/in change orders/.test(row1), 'Projects list: Brinkley $123,456.00 (no change orders, no hint)', row1);
  await go('P4');
  const tile = await H.waitFor(a, () => { const h = document.querySelector('[data-gc-tile-hint]'); return h ? h.parentElement.innerText.replace(/\s+/g, ' ') : null; }, null, 10000);
  ok(tile && /\$55,000\.00/.test(tile) && /incl\. \$5,000\.00 in change orders/.test(tile), 'P4 job tile: $55,000.00 "incl. $5,000.00 in change orders"', tile);
  await a.ev(() => window._gcSetCOs(l => l.map(c => c.id === 'CO2' ? Object.assign({}, c, { status: 'approved' }) : c)));
  const tile2 = await H.waitFor(a, () => { const h = document.querySelector('[data-gc-tile-hint]'); const t = h ? h.parentElement.innerText.replace(/\s+/g, ' ') : ''; return /\$57,000\.00/.test(t) && /incl\. \$7,000\.00/.test(t) ? t : null; }, null, 10000);
  const base = await a.ev(() => ({ c: ((window._crm.projects || []).find(x => x.id === 'P4') || {}).contract, w: window._gcContractWithCOs('P4'), a: window._gcApprovedCOs('P4') }));
  ok(tile2 && +base.c === 50000 && base.w === 57000 && base.a === 7000, 'approving CO2: $57,000.00 incl. $7,000.00 — the job\'s own contract stays $50,000', { tile2, base });
  const fs = await a.ev(() => { const m = window._gcFpMoney && window._gcFpMoney.of((window._crm.projects || []).find(x => x.id === 'P4')); return m ? { contract: m.contract, co: m.co } : null; });
  ok(fs && fs.contract === 50000 && fs.co === 7000, 'the field strip counts the same change orders (base 50,000 + 7,000)', fs);

  /* a non-tentative schedule added through the 📄 Documents uploader → the admin button reads it */
  await a.ev(() => { window.__GC_IS_TYPING__ = true; });   /* the idle reader waits: the button does it */
  const e0 = a.dialogs.length;
  await a.ev(() => window._gcOpenDocUploader('P5'));
  await a.page().setInputFiles('#_duInput', { name: 'Deck Construction Schedule.pdf', mimeType: 'application/pdf', buffer: pdfLines(['CONSTRUCTION SCHEDULE — DECK', 'Footings 12/02/2026 12/03/2026', 'Framing the deck 12/04/2026 12/08/2026', 'Railings and stairs 12/09/2026 12/11/2026']) });
  await a.ev(() => document.querySelector('#_duSave').click());
  await H.waitFor(a, () => ((window._crm.projectDocs || window._gcProjectDocs || []).some(d => d && d.pid === 'P5' && /Deck Construction Schedule/.test(d.name))) ? 1 : 0, null, 10000);
  const upDialogs = a.dialogs.length - e0;
  await sleep(800);
  await a.ev(() => window._gcDocRead.open());
  await a.ev(() => document.querySelector('#gcdr-ov [data-dr="go"]').click());
  const res = await H.waitFor(a, () => { const m = document.querySelector('#gcdr-ov [data-dr="msg"]'); return m && /Done|Nothing new/.test(m.textContent) ? { m: m.textContent, l: (document.querySelector('#gcdr-ov [data-dr="list"]') || {}).innerText || '' } : null; }, null, 30000);
  ok(res && /Deck - Sample: 3 schedule items read from Deck Construction Schedule\.pdf/.test(res.l) && /on the job's Schedule/.test(res.l), 'the admin button: "📅 Deck - Sample: 3 schedule items read from Deck Construction Schedule.pdf — on the job\'s Schedule"', res);
  await a.ev(() => { window.__GC_IS_TYPING__ = false; });
  const s5 = await H.waitFor(a, () => { const l = (window._crm.schedule || []).filter(x => x && x.pid === 'P5').map(x => ({ t: x.title, tent: x.tentative === true || x.scope === 'tentative', src: x.source })); return l.length >= 3 ? l : null; }, null, 15000) || [];
  const dbg5 = s5.length ? null : await a.ev(async () => ({ idb: ((await window.idbGet('schedule')) || []).filter(x => x && x.pid === 'P5').length, crm: (window._crm.schedule || []).length, rd: (window._gcDocRead.record().docReads || []).filter(x => x.pid === 'P5') }));
  ok(s5.length === 3 && s5.every(x => !x.tent && x.src === 'job-doc'), 'P5: the uploaded (not tentative) schedule is posted — 3 items', s5.length ? s5 : dbg5);
  await a.ev(() => document.querySelector('#gcdr-ov [data-dr="go"]').click());
  const res2 = await H.waitFor(a, () => { const m = document.querySelector('#gcdr-ov [data-dr="msg"]'); return m && /Nothing new/.test(m.textContent) ? m.textContent : null; }, null, 20000);
  ok(!!res2, 'the button again: "Nothing new to read"', res2);

  /* the sub portal: posted rows, never tentative ones */
  try {
    const PA = require(path.resolve(build, 'netlify/functions/portal-access.js'));
    const sub = { id: 'SUB1', name: 'Sample Sub Co' };
    const rows = PA._sched.schedFor({ schedule: [{ id: 'a', pid: 'P9', title: 'Posted day', date: '2026-12-02', vendor: 'Sample Sub Co', scope: 'company', tentative: false }, { id: 'b', pid: 'P9', title: 'Tentative day', date: '2026-12-03', vendor: 'Sample Sub Co', scope: 'tentative', tentative: true }] }, [{ id: 'P9', name: 'Job' }], sub);
    ok(rows.length === 1 && rows[0].title === 'Posted day', 'sub portal: a posted row shows, a tentative one does not', rows);
  } catch (e) { ok(false, 'sub portal check ran', String(e && e.message || e)); }
  ok(a.errs.length === 0, 'no page errors', a.errs.slice(0, 3));
  ok(e0 === 0, 'no alert / confirm / prompt from the readers (the old 📄 uploader\'s own "uploaded" alert: ' + upDialogs + ')', a.dialogs);
  await a.close().catch(() => {}); OPEN.splice(OPEN.indexOf(a), 1);   /* one browser page at a time */
  /* a second computer: nothing is read again */
  const b = await computer('nick-2');
  await H.waitFor(b, () => window._gcDocRead.state().runs >= 2 ? 1 : 0, null, 40000);
  ok(JSON.stringify(GETS) === g0, 'a second computer (a new load) downloads none of the files again', GETS);
  ok(!(await b.ev(() => (window._gcDocRead.record().docReads || []).some(x => x.state === 'tent-ask'))), 'and the answered card stays answered there');

} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of OPEN) await x.close().catch(() => {});
console.log(`CONTRACTREAD2 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
