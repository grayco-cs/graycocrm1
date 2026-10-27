/* patch ADDRALL tests: node tools/tests/test_ADDRALL.mjs [build dir, default = the repo]
   The company address is ONE setting. Change it to a made-up address → a new contract, the document library (lien
   notice, riders, portal terms), the cancel notice, an invoice PDF, the e-mail footer, the portal footer, the legal pages
   and the print pack HTML show it; a paper made before keeps the old one; the Print pack page switches to the HTML print
   versions and adds the admin To-Do; the outside To-Dos are added for Wesley + Nick; switching back restores the PDFs.
   Made-up data only. Needs the headless-browser harness (HARNESS=… or the default scratch path). */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.resolve(process.argv[2] || ROOT);
const HARNESS = process.env.HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const OLD = '4007 Broadway Rd, Bartlett, TN 38135';
const NEW = '77 Testing Pkwy Suite 5, Germantown, TN 38138';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && i !== undefined ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };

/* ═══ server side ═══ */
{
  let setting = { current: OLD, next: '4014 Broadway Rd, Bartlett, TN 38135', switchOn: '' };
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  global.fetch = async (u) => ({ ok: true, json: async () => /gc_company_address/.test(String(u)) ? [{ value: setting }] : [] });
  const B = require(path.join(BUILD, 'netlify/functions/_lib/brand.js'));
  await B.refreshAddress();
  ok('server: the built-in address before a change', B.companyAddress() === OLD, B.companyAddress());
  setting = { current: NEW, next: '', switchOn: '', history: [{ address: OLD, until: '2026-10-27T15:00:00.000Z' }] };
  await B.refreshAddress();
  ok('server: companyAddress() follows the setting', B.companyAddress() === NEW && B.BRAND.address === NEW, B.companyAddress());
  ok('server: a paper dated before the change keeps the old address', B.companyAddress('2026-10-20') === OLD && B.companyAddress('2026-11-02') === NEW);
  const mail = B.shell('<p>Hello</p>', {});
  ok('server: e-mail footer shows the new address', mail.indexOf(NEW) >= 0 && mail.indexOf(OLD) < 0);
  const IP = require(path.join(BUILD, 'netlify/functions/_lib/invoice-pdf.js'));
  const doc = { number: 'T-1', date: '2026-11-02', client: 'Test Customer', address: '1 Sample St', lines: [{ desc: 'Work', amt: 100 }], total: 100, paid: 0, balance: 100 };
  const pdf1 = IP.build(doc).toString('latin1');
  ok('server: a new invoice PDF shows the new address', pdf1.indexOf(NEW) >= 0 && pdf1.indexOf(OLD) < 0);
  const pdf2 = IP.build(Object.assign({}, doc, { companyAddress: B.companyAddress('2026-10-20') })).toString('latin1');
  ok('server: an invoice sent before the change keeps the old address', pdf2.indexOf(OLD) >= 0 && pdf2.indexOf(NEW) < 0);
  ok('server: invoice-pdf ADDRESS is today\'s', IP.ADDRESS === NEW);
  ok('server: the privacy filter keeps the company street', B.isCompanyStreet('77 Testing Pkwy Suite 5') && !B.isCompanyStreet('12 Elm St'));
  delete global.fetch;
}

/* the shared legal runtime (portal, bid site, CRM) */
{
  const sb = { window: { _gcCompanyAddress: () => NEW, location: { protocol: 'file:' } } };
  sb.window.document = {}; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(BUILD, 'legal2.js'), 'utf8'), sb);
  const n = sb.window.GCLegal.noticeHtml('TN', { date: '11/02/2026' });
  ok('legal2.js: the notice of cancellation shows the new address', n.indexOf(NEW) >= 0 && n.indexOf(OLD) < 0);
}

/* static files */
{
  for (const f of ['portal-terms.html', 'sub-terms.html', 'sub-privacy.html', 'esign-consent.html']) {
    const t = fs.readFileSync(path.join(BUILD, f), 'utf8');
    ok(f + ': address is a data-gc-addr span + gc-address.js', /\/gc-address\.js/.test(t) && !new RegExp('[^>]' + OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t.replace(/<span data-gc-addr>4007 Broadway Rd, Bartlett, TN 38135<\/span>/g, '')));
  }
  const man = JSON.parse(fs.readFileSync(path.join(BUILD, 'print/manifest.json'), 'utf8'));
  ok('print/manifest.json records the address baked into the PDFs', man.address === OLD && Object.keys(man.pieces).length === 20, man.address);
  const miss = Object.keys(man.pieces).filter(k => { const h = path.join(BUILD, 'print', man.pieces[k].html); return !fs.existsSync(h) || !/data-gc-addr/.test(fs.readFileSync(h, 'utf8')) || !/\.\.\/gc-address\.js/.test(fs.readFileSync(h, 'utf8')); });
  ok('every print piece has an HTML print version with the live address', !miss.length, miss);
  const h = fs.readFileSync(path.join(BUILD, 'print/brochure-general-printshop.html'), 'utf8');
  ok('HTML print version keeps the PDF page box', /@page\{size:11\.25in 8\.75in;margin:0\}/.test(h));
}

/* ═══ the CRM in a browser ═══ */
const H = await import(pathToFileURL(HARNESS).href);
const { chromium } = await import(pathToFileURL(path.join(path.dirname(HARNESS), '..', 'node_modules', 'playwright', 'index.mjs')).href).catch(() => import('playwright'));
const { computer, signIn, sleep, cset, cget, resetCloud, waitFor } = H;
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true },
  { id: 'u3', name: 'Office Gal', email: 'office@grayco-cs.com', role: 'Office Manager', active: true }]);
cset('gc_senior_pm', { none: true, setBy: 'wjohnson@grayco-cs.com', setAt: '2026-10-01T00:00:00Z' });
cset('projects', [{ id: 'PT1', name: 'Sample Plaza TI', address: '500 Sample Ave, Memphis, TN 38117', client: 'Sample Owner LLC', gc: 'Sample Builders Inc', type: 'Commercial', status: 'Active', autoPO: 'T900', contract: 50000 }]);
cset('gc_company_address', { current: OLD, next: '4014 Broadway Rd, Bartlett, TN 38135', switchOn: '' });
const A = await computer('a', { build: BUILD });
await A.ctx.route(/\/\.netlify\/functions\/mkt-public/, r => { const c = cget('gc_company_address') || {}; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, address: c.current, config: c }) }); });
await signIn(A, 'wjohnson@grayco-cs.com', 12000);
const q = (f, a) => A.ev(f, a);
await waitFor(A, () => !!(window._gcADDRALL && window._gcPPAddr && window._gcADDR2 && window._gcPPAddr.manifest), null, 40000);
ok('CRM: starts on the built-in address, print pack on the PDFs', (await q(() => window._gcCompanyAddress() + '|' + window._gcPPAddr.stale())) === OLD + '|false');

/* a paper made (and signed) before the change */
const signedHtml = '<html><body><h1>Signed contract</h1><p>GrayCo Construction Services, LLC, ' + OLD + '</p><p>Signed by Test Owner 10/20/2026</p></body></html>';

/* ⚙ Admin → 🏢 Company address: save the made-up address */
await q(() => window._gcAdm.open('address'));
await waitFor(A, () => !!document.querySelector('#gca-cur'), null, 20000);
await A.page().fill('#gca-cur', NEW);
await A.page().fill('#gca-next', '');
await A.page().fill('#gca-day', '');
await A.page().click('#gca-save');
const box = await waitFor(A, () => { const b = document.querySelector('[data-gc-addrall-confirm]'); return b ? b.innerText : null; }, null, 10000);
ok('save shows the confirmation: what changes, what keeps the old address, the To-Dos', !!box && /Changes by itself/.test(box) && /contracts/i.test(box) && /invoices/i.test(box) && /portal/i.test(box) && /e-mail footer/i.test(box) && /print pack/i.test(box) && /website footer/i.test(box) && /Keeps the old address/.test(box) && /Google Business Profile/.test(box) && /printed stock/i.test(box), box);
await A.page().click('[data-gc-addrall-confirm] [data-a="yes"]');
await waitFor(A, a => window._gcCompanyAddress() === a, NEW, 10000);
await sleep(2500);
const saved = cget('gc_company_address') || {};
ok('saved for everyone, with the old address in the history', saved.current === NEW && Array.isArray(saved.history) && saved.history.some(h => h.address === OLD), saved);
const todos = await q(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^adm_(addr|pp)_/.test(t.id)).map(t => ({ id: t.id, label: t.label, to: t.assignees, items: (t.items || []).length, done: !!t.done })));
const need = ['web', 'gbp', 'print', 'money', 'ins', 'lic', 'gov', 'veh', 'bond', 'bids', 'listings'];
const have = need.filter(k => todos.some(t => t.id.indexOf('adm_addr_' + k + '_') === 0 && t.to.indexOf('wjohnson@grayco-cs.com') >= 0 && t.to.indexOf('nthomas@grayco-cs.com') >= 0 && t.items > 0));
ok('outside To-Dos for Wesley + Nick (website, Google, printed stock, bank/suppliers, insurance, licenses, SOS/IRS, vehicles, bonding, bids, listings)', have.length === need.length, { have, todos });
ok('the insurance To-Do lists the GCs that may hold a COI', (await q(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^adm_addr_ins_/.test(t.id)).map(t => JSON.stringify(t.items)).join(''))).indexOf('Sample Builders Inc') >= 0);

const oldKept = await q(h => { const w = window.open('', '_blank'); w.document.open(); w.document.write(h); w.document.close(); const t = w.document.body.innerText; w.close(); return t; }, signedHtml);
await sleep(800);
ok('a paper made before keeps its address when it is opened again', oldKept.indexOf(OLD) >= 0 && oldKept.indexOf(NEW) < 0, oldKept);
/* new papers */
const ct = await q(() => window._gcUnifiedContractText ? String(window._gcUnifiedContractText({ state: 'TN' })) : '');
ok('a new contract shows the new address', ct.indexOf(NEW) >= 0 && ct.indexOf('(Bartlett, TN 38135)') < 0, ct.slice(0, 200));
const lib = await q(async () => { const out = {}; for (const id of ['gcb_rider_tn', 'gcb_portal_tou', 'gcb_lien_notice_ms', 'gcb_msa', 'gcb_cancel_notice_tn', 'gcb_giveaway_rules']) { try { const r = await window._gcDocLib.render(id, 'PT1'); out[id] = r ? r.page : ''; } catch (e) { out[id] = 'ERR ' + e.message; } } return out; });
const libBad = Object.keys(lib).filter(k => lib[k].indexOf('77 Testing Pkwy Suite 5') < 0 || lib[k].indexOf('4007 Broadway') >= 0);
ok('document library (riders, portal terms, lien notice, MSA, cancel notice, giveaway rules) shows the new address', !libBad.length, libBad.map(k => k + ': ' + lib[k].slice(0, 80)));
const notice = await q(() => window.GCLegal ? window.GCLegal.noticeHtml('TN', {}) : '');
ok('the contract\'s notice of cancellation shows the new address', notice.indexOf(NEW) >= 0 && notice.indexOf(OLD) < 0);
const shellHtml = await q(() => window._gcBrandShell ? window._gcBrandShell('<p>Hi</p>', {}) : '');
ok('CRM e-mail footer shows the new address', shellHtml.indexOf(NEW) >= 0 && shellHtml.indexOf(OLD) < 0);
ok('GC_BRAND / GC_ADDR follow', (await q(() => window.GC_BRAND.address)) === NEW);
ok('page helper: a date before the change answers the old address', (await q(() => window._gcCompanyAddress('2026-10-20'))) === OLD);

/* 🖨 Print pack */
await q(() => window._gcPPAddr.check());
await q(() => window._gcOpenPrintPack());
await waitFor(A, () => !!document.querySelector('[data-pp]'), null, 20000);
await sleep(800);
const pp = await q(() => ({ banner: (document.querySelector('[data-gc-pp-stale]') || {}).innerText || '', files: [...document.querySelectorAll('[data-pp] [data-a="pp-print"]')].map(b => b.getAttribute('data-f')) }));
ok('Print pack: "PDFs being rebuilt with the new address"', /PDFs being rebuilt with the new address/.test(pp.banner), pp.banner);
ok('Print pack: Print / Copy / E-mail / Text use the HTML print versions', pp.files.length >= 20 && pp.files.every(f => /\.html$/.test(f)), pp.files.slice(0, 4));
const copyLink = await q(() => { const b = document.querySelector('[data-pp] [data-a="pp-copy"]'); return b.getAttribute('data-f'); });
ok('Copy link points at the HTML version', /\.html$/.test(copyLink));
const rb = await q(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^adm_pp_rebuild_/.test(t.id) && !t.done).map(t => t.label));
ok('admin To-Do "Rebuild print PDFs (address changed)"', rb.indexOf('Rebuild print PDFs (address changed)') >= 0, rb);

/* the HTML print version and the portal footer, opened as a customer / print shop would */
const P2 = await A.ctx.newPage();
await P2.goto('https://app.local/print/brochure-general.html');
await sleep(2500);
const ph = await P2.evaluate(() => [...document.querySelectorAll('.sheet [data-gc-addr]')].map(e => e.textContent));
ok('print pack HTML shows the new address at load', ph.length > 0 && ph.every(x => x === NEW), ph);
const pages = await P2.evaluate(() => document.querySelectorAll('.sheet').length);
await P2.emulateMedia({ media: 'print' });
const pdfBuf = await P2.pdf({ preferCSSPageSize: true, printBackground: true });
const nPages = (pdfBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
ok('print pack HTML prints the same page count as the PDF (2, Letter landscape)', pages === 2 && nPages === 2 && /\/MediaBox\s*\[\s*0 0 792 612/.test(pdfBuf.toString('latin1')), { pages, nPages });
await P2.goto('https://app.local/portal.html');
await sleep(4000);
const foot = await P2.evaluate(() => [...document.querySelectorAll('footer [data-gc-addr], [data-gc-addr]')].map(e => e.textContent));
ok('portal footer shows the new address', foot.length > 0 && foot.indexOf(NEW) >= 0, foot);
await P2.goto('https://app.local/portal-terms.html');
await sleep(2000);
const terms = await P2.evaluate(() => document.body.innerText);
ok('portal terms page shows the new address', terms.indexOf(NEW) >= 0 && terms.indexOf(OLD) < 0);
await P2.close();

/* switch back */
await q(() => window._gcAdm.open('address'));
await waitFor(A, () => !!document.querySelector('#gca-cur'), null, 20000);
await q(a => { const i = document.querySelector('#gca-cur'); i.value = a; document.querySelector('#gca-save').click(); }, OLD);   /* the Marketing overlay is still open on top */
await waitFor(A, () => !!document.querySelector('[data-gc-addrall-confirm]'), null, 10000);
await q(() => document.querySelector('[data-gc-addrall-confirm] [data-a="yes"]').click());
await waitFor(A, a => window._gcCompanyAddress() === a, OLD, 10000);
await sleep(1500);
await q(() => window._gcPPAddr.check());
await q(() => window._gcOpenPrintPack());
await sleep(1500);
const back = await q(() => ({ banner: !!document.querySelector('[data-gc-pp-stale]'), files: [...document.querySelectorAll('[data-pp] [data-a="pp-print"]')].map(b => b.getAttribute('data-f')), rb: JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^adm_pp_rebuild_/.test(t.id)).map(t => !!t.done) }));
ok('switching back: the PDFs again, no banner, the rebuild To-Do closed itself', !back.banner && back.files.length >= 20 && back.files.every(f => /\.pdf$/.test(f)) && back.rb.length > 0 && back.rb.every(Boolean), back);
const ct2 = await q(() => String(window._gcUnifiedContractText({ state: 'TN' })));
ok('switching back: a new contract shows the old address again', ct2.indexOf('Bartlett, TN 38135') >= 0 && ct2.indexOf('77 Testing') < 0);
ok('no page errors', !A.errs.length, A.errs.slice(0, 4));
console.log(R.filter(Boolean).length + '/' + R.length + ' passed');
await shared.close();
process.exit(R.every(Boolean) ? 0 : 1);
