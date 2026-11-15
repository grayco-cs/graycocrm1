// test_SCOPEFILES2.mjs <build-dir> [shot-dir] — patch SCOPEFILES2 (11/15 list 5.1d). Made-up data only; offline (JSZip served from
// this machine's /opt/node-tools copy for cdnjs; nothing leaves the machine).
//   9 Word scope files + 1 RFI ("prebid questions") in ONE zip → 📎 Add scope files: the trade from each name, the RFI as a job document
//   only, 👁 Preview, 👷 subs (job subs ticked), Save → the 10 job documents + ONE 📋 scope draft per trade (SCOPESEND records, a 💲
//   budget twin each, words only — a "$" line is never copied); the same name + trade again → that trade's draft gets a new version and
//   the old document is marked replaced (never a duplicate); the picked subs are pre-ticked in 📤 Send. No sub sees anything.
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const JSZIP_PATH = process.env.JSZIP_DIR || '/opt/node-tools/node_modules/jszip';
const JSZip = require(JSZIP_PATH);
const TMP = path.join(process.env.TMPDIR || '/tmp', 'gc-sf2-' + Date.now()); fs.mkdirSync(TMP, { recursive: true });
const xmlEsc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function docx(lines){
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + lines.map(l => '<w:p><w:r><w:t xml:space="preserve">' + xmlEsc(l) + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>');
  return z.generateAsync({ type: 'nodebuffer' });
}
const TR = [['1 demolition', 'Demolition'], ['2 concrete', 'Concrete'], ['3 framing', 'Framing'], ['4 hvac', 'HVAC'], ['5 electrical', 'Electrical'], ['6 plumbing', 'Plumbing'], ['7 drywall', 'Drywall'], ['8 painting', 'Painting'], ['9 roofing', 'Roofing']];
const zip = new JSZip();
for (const [n, t] of TR) zip.file('Hamlets scope ' + n + '.docx', await docx(['Scope of work', t + ' — Hamlets Clubhouse', 'Furnish and install all ' + t.toLowerCase() + ' work per plans', 'Coordinate with GrayCo PM daily', 'Allowance: $12,500.00 total price', 'Clean up ' + t.toLowerCase() + ' debris']));
zip.file('Hamlets prebid questions.docx', await docx(['RFI 1: who supplies the doors?', 'RFI 2: working hours?']));
const ZIPF = path.join(TMP, 'Hamlets scopes.zip'); fs.writeFileSync(ZIPF, await zip.generateAsync({ type: 'nodebuffer' }));
const D7 = path.join(TMP, 'Hamlets scope 7 drywall.docx'); fs.writeFileSync(D7, await docx(['Scope of work', 'Drywall — Hamlets Clubhouse', 'Furnish and install all drywall work per plans', 'Level 5 finish in the lobby', 'Clean up drywall debris']));

const { computer, signIn, sleep, cset, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 2 * 864e5).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('vendors', [{ id: 'S1', name: 'Zedd Drywall LLC', trade: 'Drywall', isSub: true, email: 'zed@drywall.test' }, { id: 'S2', name: 'Demo Drywall Two', trade: 'Drywall', isSub: true, email: 'two@drywall.test' }, { id: 'S3', name: 'Dee Electric', trade: 'Electrical', isSub: true, email: 'dee@electric.test' }]);
cset('projects', [{ id: 'P1', name: 'Hamlets Clubhouse', client: 'Hamlets HOA', clientPhone: '9015550111', address: '1 Hamlet Way', status: 'bidding', autoPO: 'T901', pm: 'Wesley Johnson', subs: [{ name: 'Zedd Drywall LLC', subId: 'S1', trade: 'Drywall', status: 'Bidding' }], createdAt: at, updatedAt: at }]);
cset('projectDocs', []);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await A.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\//, rt => rt.fulfill({ path: path.join(JSZIP_PATH, 'dist/jszip.min.js'), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up', !!await wait(() => window._gcScopeFiles && window._gcScopeFiles2 && window._gcScopeSend && window._gcStoreFile && (window._crm.projects || []).length >= 1, null, 60000));
await A.ev(() => window._gcScopeFiles.open('P1'));
await wait(() => document.querySelector('#gcsf #gcsf-in'));
await A.page().setInputFiles('#gcsf #gcsf-in', ZIPF);
const rows = await wait(() => { const r = document.querySelectorAll('#gcsf .r'); return r.length === 10 ? [...r].map(x => ({ n: x.querySelector('.n').textContent, t: (x.querySelector('select') || {}).value || '(questions)' })) : null; }, null, 20000);
ok('1 the zip opens in the browser: 10 files, the trade read from each name, the RFI as bid questions', rows && rows.length === 10 && TR.every(([n, t]) => rows.some(r => r.n.includes('Hamlets scope ' + n + '.docx') && r.t === t)) && rows.some(r => /prebid questions/.test(r.n) && r.t === '(questions)'), rows);
await wait(() => document.querySelectorAll('#gcsf [data-sf2]').length === 9, null, 8000);
const dw = await A.ev(() => { const r = [...document.querySelectorAll('#gcsf .r')].find(x => /7 drywall/.test(x.textContent)); return r ? [...r.querySelectorAll('[data-sf2s]')].map(i => i.value + ':' + i.checked) : null; });
ok('2 👷 drywall offers the job\'s drywall sub (ticked) and the other drywall sub from the Subs list (not ticked); no other trade\'s sub', JSON.stringify(dw) === JSON.stringify(['S1:true', 'S2:false']), dw);
await A.ev(() => { const r = [...document.querySelectorAll('#gcsf .r')].find(x => /7 drywall/.test(x.textContent)); r.querySelector('[data-sf2s][value="S2"]').click(); });
await sleep(1500);
await A.ev(() => { const r = [...document.querySelectorAll('#gcsf .r')].find(x => /4 hvac/.test(x.textContent)); r.querySelector('[data-sf2p]').click(); });
const pv = await wait(() => { const r = [...document.querySelectorAll('#gcsf .r')].find(x => /4 hvac/.test(x.textContent)); const p = r && r.querySelector('[data-sf2v]'); return p && /Furnish/.test(p.textContent) ? p.textContent : null; }, null, 10000);
ok('3 👁 Preview shows the lines read from the Word file (no $ line)', !!pv && /• Furnish and install all hvac work per plans/.test(pv) && !/\$/.test(pv), pv);
await shot(A, 'sf2_review');
await A.ev(() => document.getElementById('gcsf-save').click());
const res = await wait(() => window.__gcSf2Last && window.__gcSf2Last.length === 9 ? window.__gcSf2Last : null, null, 60000);
ok('4 Save → one 📋 scope draft per trade (9), each new', res && res.length === 9 && res.every(x => x.created && x.lines >= 3), res);
const st = await A.ev(() => window.idbGet('scopes').then(L => (L || []).filter(d => d.pid === 'P1').map(d => ({ id: d.id, kind: d.kind, trade: d.trade, lines: (d.lines || []).map(l => l.desc), forSubs: d.forSubs || null, v: d.version, src: d.src && d.src.kind }))));
const subsD = st.filter(d => d.kind === 'sub'), budD = st.filter(d => d.kind === 'budget');
const dwD = subsD.find(d => d.trade === 'Drywall');
ok('4 the drafts are SCOPESEND records (kind sub, src scopefile) with a 💲 budget twin each; words only, no "$" line', subsD.length === 9 && budD.length === 9 && subsD.every(d => d.src === 'scopefile' && !d.lines.some(l => /\$/.test(l))) && dwD && dwD.lines.includes('Furnish and install all drywall work per plans'), st);
ok('4 the picked subs ride on the drywall draft (S1 + S2)', dwD && JSON.stringify(dwD.forSubs) === JSON.stringify(['S1', 'S2']), dwD);
const docs = await wait(() => window.idbGet('projectDocs').then(A0 => { const L = (A0 || []).filter(d => d.pid === 'P1' && !d.deleted); return L.length >= 10 ? L.map(d => ({ n: d.name, cat: d.cat, t: d.trade, hide: d.hideFromSubs })) : null; }), null, 10000);
ok('5 the 10 files are job documents, hidden from subs; the RFI is "Bid questions" with no trade', docs && docs.length === 10 && docs.every(d => d.hide === true) && docs.some(d => /prebid/.test(d.n) && d.cat === 'Bid questions' && !d.t), docs);
/* the same name + trade again */
await A.ev(() => window._gcScopeFiles.open('P1'));
await wait(() => document.querySelector('#gcsf #gcsf-in'));
await A.page().setInputFiles('#gcsf #gcsf-in', D7);
await wait(() => document.querySelectorAll('#gcsf [data-sf2]').length === 1, null, 8000);
await sleep(800);
await A.ev(() => { window.__gcSf2Last = null; document.getElementById('gcsf-save').click(); });
const res2 = await wait(() => window.__gcSf2Last && window.__gcSf2Last.length === 1 ? window.__gcSf2Last : null, null, 60000);
const st2 = await A.ev(() => window.idbGet('scopes').then(L => (L || []).filter(d => d.pid === 'P1' && d.kind === 'sub' && d.trade === 'Drywall').map(d => ({ v: d.version, lines: (d.lines || []).map(l => l.desc) }))));
ok('6 the same name + trade again → the drywall draft gets a new version (still ONE draft, the new lines)', res2 && !res2[0].created && st2.length === 1 && st2[0].v === 2 && st2[0].lines.includes('Level 5 finish in the lobby'), { res2, st2 });
const docs2 = await wait(() => window.idbGet('projectDocs').then(A0 => { const L = (A0 || []).filter(d => d.pid === 'P1' && /7 drywall/.test(d.name)).map(d => ({ del: !!d.deleted, rep: !!d.replacedBy })); return L.length === 2 && L.some(d => d.rep) ? L : null; }), null, 10000) || [];
ok('6 …and the older drywall document is marked replaced (one live copy, not a duplicate)', docs2.length === 2 && docs2.filter(d => !d.del).length === 1 && docs2.filter(d => d.rep).length === 1, docs2);
ok('7 nothing was sent to anyone (no portal / e-mail send)', !A.fn.some(c => c.name === 'send-email' || (c.name === 'portal-access' && c.body && /s-send|s-scope-save/.test(String(c.body.action)))));
ok('8 no page errors', A.errs.length === 0, A.errs);
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
