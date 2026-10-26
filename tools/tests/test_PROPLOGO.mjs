// test_PROPLOGO.mjs <worktree> — proposal / contract print: colour logo letterhead on white, ONE header; plus a scan of every other print path for a white logo on a light background.
import { boot, markers, sleep, OUT as OUT2, PROJ, EST, shot } from '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wLOGO2/lib.mjs';
import fs from 'fs';
const OUT = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wPROPLOGO';
const build = process.argv[2];
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const A = await boot(build); const m = await markers(A);
const EST_MS = Object.assign({}, EST, { id: 'e2', state: 'MS', address: '55 Pine St, Olive Branch, MS 38654', name: 'Olive Branch roof' });
await A.ev(([p, e, e2]) => { const c = window._crm; c.invoices = [{ id: 'inv_1', pid: 'p1', type: 'client', amt: 12500, status: 'sent', date: '2026-10-20', due: '2026-11-19', desc: 'Progress draw 1', po: 'H393-1' }]; c.estimates = [e, e2]; }, [PROJ, EST, EST_MS]);
const lib = uid => ([u]) => { window._gcDocs3.launch(u, 'p1', true); };
const HTML = [
  ['Contract (job-type template)', lib, 'gen:contract'],
  ['Arkansas pre-construction notice (AR variant)', lib, 'gen:ar_prenotice'],
  ['GrayCo proposal (TN)', (e) => window._gcOpenGrayCoProposal(e), EST],
  ['GrayCo proposal (MS)', (e) => window._gcOpenGrayCoProposal(e), EST_MS],
  ['Estimate (PDF view)', (e) => window._gcOpenEstimatePDF(e), EST],
  ['Invoice (library)', lib, 'gen:invoice'],
  ['Invoice (screen / print view)', () => window._gcViewInvoicePDF('inv_1', 'p1'), null],
  ['Change order', lib, 'gen:change_order'],
  ['Work Authorization (insurance)', lib, 'gen:work_auth'],
  ['Direction to Pay', lib, 'gcb_direction_to_pay'],
  ['Insurance Roof Agreement (OPCLAUSE)', lib, 'gcb_roof_contingency'],
  ['Mitigation / restoration agreement', lib, 'gcb_mitigation'],
  ['Lien waiver (final, GrayCo)', lib, 'gen:lien_cond_final_gc'],
  ['Certificate of Substantial Completion', lib, 'gen:cert_completion'],
  ['Workmanship warranty (5 year)', lib, 'gen:warranty_ins'],
  ['Final demand letter (LEGAL3)', lib, 'gcb_final_demand'],
  ['Employee handbook (LEGAL3)', lib, 'gcb_handbook'],
  ['Sub scope of work agreement', lib, 'gen:sub_scope'],
  ['Subcontractor agreement', lib, 'gen:sub_agreement'],
  ['Material delivery receipt', lib, 'gen:material_receipt'],
  ['Thank-you letter / completion packet', lib, 'fn:thank_you'],
  ['Pay stub', () => { const st = { company: { name: 'GrayCo Construction Services, LLC', address: '4007 Broadway Rd, Bartlett, TN 38135', phone: '(901) 585-0944' }, name: 'Test Person', payDate: '2026-10-23', periodFrom: '2026-10-12', periodTo: '2026-10-18', gross: 1000, net: 800, earnings: [{ label: 'Regular hours', amount: 1000 }], taxes: [], deductions: [] }; window._gcOpenDocHTML(window._gcPayStubHTML(st)); }, null],
  ['Scope sheet by trade (sub scope, no prices)', async (e) => { window._gcOpenScopeByTrade(e, 'p1'); await new Promise(r => setTimeout(r, 400)); const b = document.getElementById('_scPrint'); if (b) b.click(); else return 'no print button'; }, EST],
];

/* the probe: every visible logo image — loads, is it a WHITE logo, what is behind it (luminance), centred? plus the header count */
const probe = (m) => {
  const isLogo = i => { const s = i.getAttribute('src') || ''; return (m.p && s.indexOf(m.p) >= 0) || (m.b && s.indexOf(m.b) >= 0) || (m.w && s.indexOf(m.w) >= 0) || /grayco-logo|portal-logo|logo-white/.test(s.slice(0, 300)); };
  const pix = i => { try { const c = document.createElement('canvas'); c.width = 40; c.height = 40; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 40, 40); const d = x.getImageData(0, 0, 40, 40).data; let s = 0, n = 0, tr = 0; for (let k = 0; k < d.length; k += 4) { if (d[k + 3] > 200) { s += (d[k] + d[k + 1] + d[k + 2]) / 3; n++; } else if (d[k + 3] < 50) tr++; } return n > 20 && tr > 160 ? s / n / 255 : null; } catch (e) { return null; } };
  const isWhiteLogo = i => { const s = i.getAttribute('src') || ''; if ((m.w && s.indexOf(m.w.slice(0, 96)) === 0) || /logo-white|portal-logo/.test(s.slice(0, 300))) return true; const v = pix(i); return v != null && v > 0.88; };
  const lum = c => { const x = (c.match(/[\d.]+/g) || []).map(Number); if (x.length < 3) return null; if (x.length > 3 && x[3] === 0) return null; const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(x[0]) + .7152 * f(x[1]) + .0722 * f(x[2]); };
  /* the luminance of what sits behind the image: first ancestor with a colour; a gradient/image background is sampled from its first colour stop */
  const behind = el => { for (let e = el.parentElement; e; e = e.parentElement) { const cs = getComputedStyle(e); const bi = cs.backgroundImage; if (bi && bi !== 'none') { const cols = bi.match(/rgba?\([^)]*\)/g); if (cols && cols.length) { const ls = cols.map(lum).filter(v => v != null); if (ls.length) return Math.min(...ls); } } const l = lum(cs.backgroundColor); if (l != null) return l; } return 1; };
  const vis = i => { const r = i.getBoundingClientRect(); if (!(r.width > 4 && r.height > 4)) return false; for (let e = i; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const imgs = [...document.images].filter(isLogo).filter(vis);
  const rows = imgs.map(i => { const r = i.getBoundingClientRect(); return { white: isWhiteLogo(i), loaded: i.complete && i.naturalWidth > 0, bg: +behind(i).toFixed(3), cx: Math.round(r.left + r.width / 2), h: Math.round(r.height), top: Math.round(r.top + scrollY), hdr: !!i.closest('[data-gc-logo]') }; });
  const idc = { addr: 0, lic: 0 }; const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let tn;
  while ((tn = wk.nextNode())) { const t = tn.nodeValue; const isA = /4007 Broadway Rd/.test(t), isL = /TN (License )?#85034/.test(t); if (!isA && !isL) continue;
    const rg = document.createRange(); rg.selectNodeContents(tn); const bb = rg.getBoundingClientRect(); if (!(bb.width || bb.height) || bb.top + scrollY >= 1056) continue;
    const el = tn.parentElement && tn.parentElement.closest('p,div,td,th,li,h1,h2,h3'); if (!el || /^(TD|TH)$/.test(el.tagName)) continue; const tx = el.innerText || ''; if (tx.length >= 200 || /LLC/.test(tx)) continue; if (isA) idc.addr++; if (isL) idc.lic++; }
  const page = document.querySelector('.page'); const pr = page ? page.getBoundingClientRect() : null;
  return { rows, idc, nHdr: [...document.querySelectorAll('[data-gc-logo]')].filter(e => e.getBoundingClientRect().height > 4 && getComputedStyle(e).display !== 'none').length, vw: pr ? Math.round(pr.left + pr.width / 2) : document.documentElement.clientWidth / 2, len: document.body ? document.body.innerText.length : 0, title: document.title };
};
async function open(trigger, arg, wait = 9000){
  const pp = A.ctx.waitForEvent('page', { timeout: wait }).catch(() => null);
  const res = await A.page().evaluate(trigger, arg).catch(e => ({ err: String(e).slice(0, 200) }));
  const pop = await pp; if (!pop) return { popup: false, res };
  await pop.waitForLoadState('domcontentloaded').catch(() => {});
  let r = null; for (let i = 0; i < 40; i++) { await sleep(200); r = await pop.evaluate(probe, m).catch(() => null); if (r && r.len > 60 && !/Preparing/.test(r.title) && r.rows.length && r.rows.every(x => x.loaded)) break; }
  return { popup: true, pop, res, r };
}
async function both(pop){ /* probe under screen and under print media */
  const out = {};
  for (const med of ['screen', 'print']) { await pop.emulateMedia({ media: med }); await sleep(250); out[med] = await pop.evaluate(probe, m).catch(() => null); }
  await pop.emulateMedia({ media: 'screen' }); return out;
}
const whiteOnLight = q => q && q.rows.filter(x => x.white && x.bg > 0.4);

console.log('--- A. proposal builder (hl): 3 job types x TN / MS / AR');
const ADDR = { TN: '123 Main St, Somerville, TN 38068', MS: '55 Pine St, Olive Branch, MS 38654', AR: '9 Oak Rd, West Memphis, AR 72301' };
const TYPES = [['Residential Reno', 'Residential'], ['Commercial Reno', 'Commercial'], ['Insurance Restoration', 'Insurance Roof']];

const idx = fs.readFileSync(build + '/index.html', 'utf8');
const i0 = idx.indexOf(',hl=g=>') + 1, i1 = idx.indexOf('},xu=g=>', i0) + 1;
const hlSrc = idx.slice(i0 + 3, i1);   /* "g=>{...}" */
const shots = [];
for (const [type, label] of TYPES) for (const st of ['TN', 'MS', 'AR']) {
  const name = 'Proposal ' + label + ' ' + st;
  const r = await open(([src, t, s, ADDRS]) => {
    const hl = new Function('Ut', 'return (' + src + ')')(x => x);
    const g = { userName: 'Wesley Johnson', userEmail: 'wjohnson@grayco-cs.com', projectName: 'Test ' + t + ' ' + s, client: 'Jane Customer', clientPhone: '(901) 555-0101', clientEmail: 'jane@example.com', address: ADDRS[s], po: 'H500', pm: 'Nick Thomas', pmPhone: '(901) 634-4354', pmEmail: 'nthomas@grayco-cs.com',
      jobType: t, jobTypeLabel: t, contractAmt: 18500, startDate: '2026-11-02', endDate: '2026-11-13', weeks: 2, scopeDescription: 'Tear off and replace roof.', inclusions: ['Tear-off'], exclusions: ['Decking repair'], customerNotes: '', lineItems: [{ desc: 'Roof', amount: 18500 }],
      draws: [{ n: 1, desc: 'Deposit', pct: 50 }, { n: 2, desc: 'Final', pct: 50 }], payNotes: ['Net 10'], tentativeSchedule: [{ week: 1, title: 'Tear off', desc: '' }], schedNotes: ['Weather permitting'], checklist: [{ text: 'Permit', done: false }],
      warranties: [['Workmanship', '1 Year', 'Labor']], commPromise: ['Weekly updates'], contractText: 'CONSTRUCTION AGREEMENT\n1. SCOPE: Contractor shall perform the work described.\n2. PAYMENT: Owner shall pay per the schedule.', companyPhone: '(901) 585-0944', nickCell: '(901) 634-4354', wesleyCell: '(901) 692-7255', companyEmail: 'office@grayco-cs.com', companyWebsite: 'grayco-cs.com', companyFacebook: 'https://www.facebook.com/x', companyAddress: window._gcCompanyAddress ? window._gcCompanyAddress() : '' };
    const w = window.open('', '_blank'); w.document.write(hl(g)); w.document.close();
  }, [hlSrc, type, st, ADDR]);
  if (!r.popup) { ok(name + ' opens', false, r.res); continue; }
  const b = await both(r.pop);
  for (const med of ['screen', 'print']) {
    const q = b[med];
    ok(name + ' [' + med + '] — colour logo loads, visible, not a white logo on a light background', q && q.rows.length >= 1 && q.rows.every(x => x.loaded) && whiteOnLight(q).length === 0, q);
    ok(name + ' [' + med + '] — at least one NON-white (colour) logo is visible', q && q.rows.some(x => !x.white && x.loaded), q);
    ok(name + ' [' + med + '] — header logo centered (' + (q && q.rows[0] && q.rows[0].cx) + ' vs ' + (q && q.vw) + ')', q && q.rows.length && q.rows.filter(x => x.hdr).every(x => Math.abs(x.cx - q.vw) <= 20) && q.rows.some(x => x.hdr), q);
    ok(name + ' [' + med + '] — exactly ONE header (one [data-gc-logo], one address line, one license line, one logo in print)', q && q.nHdr === 1 && q.idc.addr === 1 && q.idc.lic === 1 && (med === 'screen' || q.rows.filter(x => x.h >= 50).length === 1), q);
  }
  if ((label === 'Residential' && st === 'TN') || (label === 'Insurance Roof' && st === 'AR')) { const f = OUT + '/prop_' + label.replace(/ /g, '_') + '_' + st + '.png'; await r.pop.emulateMedia({ media: 'print' }); await sleep(400); await shot(A, r.pop, f); shots.push(f); await r.pop.emulateMedia({ media: 'screen' }); }
  await r.pop.close().catch(() => {});
}
{ /* the GrayCo-format proposal (estimate) */
  const r = await open((e) => window._gcOpenGrayCoProposal(e), EST);
  if (!r.popup) ok('GrayCo-format proposal opens', false, r.res); else { const b = await both(r.pop);
    for (const med of ['screen', 'print']) { const q = b[med];
      ok('GrayCo-format proposal [' + med + '] — colour logo visible, no white logo on a light background, centered, one header', q && q.rows.some(x => !x.white && x.loaded) && whiteOnLight(q).length === 0 && q.rows.filter(x => x.hdr).every(x => Math.abs(x.cx - q.vw) <= 20) && q.idc.addr <= 1 && q.idc.lic <= 1 && q.nHdr <= 1, q); }
    await r.pop.close().catch(() => {}); } }

console.log('--- B. scan of every other print path for a WHITE logo on a LIGHT background (screen + print media)');
const bad = [];
for (const [name, mk2, arg] of HTML) {
  const trigger = typeof arg === 'string' ? mk2(arg) : mk2; const targ = typeof arg === 'string' ? [arg] : arg;
  const r = await open(trigger, targ, 9000); if (!r.popup) { console.log('INFO no popup: ' + name); continue; }
  const b = await both(r.pop);
  for (const med of ['screen', 'print']) { const w = whiteOnLight(b[med]); if (w && w.length) bad.push([name, med, w]); }
  await r.pop.close().catch(() => {});
}
ok('no print path shows a white logo (grayco-logo-white / portal-logo) on a light background (' + HTML.length + ' paths x screen/print)', bad.length === 0, bad);
const pe = (A.errs || []).filter(e => !/cdnjs|fonts\./.test(String(e)) && /PAGEERROR/.test(e));
ok('no page errors', pe.length === 0, pe.slice(0, 3));
console.log('SHOTS ' + JSON.stringify(shots));
console.log('RESULT ' + R.filter(Boolean).length + '/' + R.length);
await A.shared.close(); process.exit(R.every(Boolean) ? 0 : 1);
