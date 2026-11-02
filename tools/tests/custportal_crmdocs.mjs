/* custportal_crmdocs.mjs — the SAMPLE job's papers made by the CRM ITSELF (patch CUSTPORTAL), for the portal preview.
   node tools/tests/custportal_crmdocs.mjs [out-dir] [shots-dir]
   Runs the real CRM page (index.html of this checkout) in the offline harness (GC_HARNESS, default <scratch>/wN/harness_N.mjs)
   with the made-up SAMPLE job of custportal_world.mjs, signs in as the owner and asks the CRM's own generators for:
     est_simple.pdf   — _gcEstPdf.makePdf(estimate, 'simple'): the GrayCo proposal from ⚙ Proposal template (what "📤 Send estimate" stores)
     est_p5.pdf       — _gcEstPdf.makePdf(estimate, 'p5'): the 5-page GrayCo Customer Proposal
     crm_invoice.html — _gcViewInvoicePDF(invoice): the CRM's animated invoice ("the blue animated screen")
     proposal.html    — the proposal template's HTML
   and screenshots of them as the CRM shows them: 99_crm_*.png in the shots dir. Needs the browser lock (the caller takes it).
   Made-up data only; nothing leaves this computer. */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import * as W from './custportal_world.mjs';
const OUT = path.resolve(process.argv[2] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/cp/crmdocs');
const SHOTS = path.resolve(process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/preview/customer');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const HARNESS = process.env.GC_HARNESS || W.SP + '/wN/harness_N.mjs';
const H2P = process.env.GC_HTML2PDF || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/vendor/html2pdf.bundle.min.js';
const JSPDF = process.env.GC_JSPDF || W.SP + '/wOPC/package/dist/jspdf.umd.min.js';
const H = await import(pathToFileURL(HARNESS).href);
const { computer, sleep, waitFor, cset, signIn, cloud } = H;
cloud.clear();
W.seedSample();
for (const k of Object.keys(W.KV)) { let v = W.KV[k].value; try { v = JSON.parse(v); } catch (e) {} cset(k, v); }
const users = (W.get('users') || []).concat([{ id: 'UW', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, phone: '901-555-0199' }]);
cset('users', users);
const old = new Date(Date.now() - 3600e3).toISOString(); for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: old }));
const C = await computer('owner', { build: W.ROOT });
await C.ctx.route(u => /html2pdf/.test(u), r => fs.existsSync(H2P) ? r.fulfill({ path: H2P, contentType: 'text/javascript' }) : r.abort('blockedbyclient'));
await C.ctx.route(u => /jspdf\.umd\.min\.js/.test(u), r => r.fulfill({ path: JSPDF, contentType: 'text/javascript' }));
const p = C.page(); await p.setViewportSize({ width: 1366, height: 768 });
await signIn(C, 'wjohnson@grayco-cs.com', 9000);
const ready = await waitFor(C, () => !!(window._gcEstPdf && window._crm && (window._crm.projects || []).some(x => x.id === 'PSAMPLE1') && (window._gcEstimatesState || []).some(e => e.id === 'ESAMPLE1') && (window._crm.invoices || []).some(i => i.id === 'INVS2')), null, 120000);
console.log('CRM ready: ' + !!ready);
const got = await p.evaluate(async () => {
  const P = window._gcEstPdf, e = (window._gcEstimatesState || []).find(x => x.id === 'ESAMPLE1'), job = (window._crm.projects || []).find(x => x.id === 'PSAMPLE1');
  const b64 = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  const out = { design: '', errs: [] };
  try { out.design = P.designDefault(job, e); } catch (x) { out.errs.push('design ' + x.message); }
  try { out.proposal = P.proposalHtml(e) || ''; } catch (x) { out.errs.push('proposalHtml ' + x.message); }
  try { out.p5html = P.proposal5Html(e) || ''; } catch (x) { out.errs.push('p5html ' + x.message); }
  try { const a = await P.makePdf(e, 'simple'); out.simple = a && a.blob ? await b64(a.blob) : null; out.simpleHow = a && a.how; } catch (x) { out.errs.push('simple ' + x.message); }
  try { const b = await P.makePdf(e, 'p5'); out.p5 = b && b.blob ? await b64(b.blob) : null; out.p5How = b && b.how; } catch (x) { out.errs.push('p5 ' + x.message); }
  try { window.__gcInvoiceReturnHTML = true; out.inv = window._gcViewInvoicePDF('INVS2', 'PSAMPLE1') || window.__gcInvoiceLastHTML || ''; } catch (x) { out.errs.push('inv ' + x.message); } finally { window.__gcInvoiceReturnHTML = false; }
  return out;
});
console.log('design: ' + got.design + ' · simple: ' + (got.simple ? got.simpleHow : 'none') + ' · p5: ' + (got.p5 ? got.p5How : 'none') + ' · invoice html: ' + (got.inv || '').length + (got.errs.length ? ' · ' + got.errs.join(' | ') : ''));
if (got.simple) fs.writeFileSync(path.join(OUT, 'est_simple.pdf'), Buffer.from(got.simple, 'base64'));
if (got.p5) fs.writeFileSync(path.join(OUT, 'est_p5.pdf'), Buffer.from(got.p5, 'base64'));
if (got.inv) fs.writeFileSync(path.join(OUT, 'crm_invoice.html'), got.inv);
if (got.proposal) fs.writeFileSync(path.join(OUT, 'proposal.html'), got.proposal);
/* the choice on the job's estimate card: "Customer sees: ◉ My PDF ○ Template version" (patch CUSTPORTAL) */
try {
  const cs = await p.evaluate(async () => {
    const el = document.createElement('div'); el.id = 'cp-cs-demo'; el.style.cssText = 'position:fixed;left:20px;top:20px;z-index:2147483600;background:#fff;padding:16px;border:2px solid #0f2440;border-radius:12px;width:760px;font:14px Arial';
    el.innerHTML = '<div style="font-weight:800;margin-bottom:8px">Job → 📝 Estimates → Estimate #2060 — Deck rebuild (not sent yet)</div><div id="cp-cs-slot"></div>'; document.body.appendChild(el);
    window._gcEstPdf.paintSlot(document.getElementById('cp-cs-slot'), 'ESAMPLE3', 'PSAMPLE1');
    return document.getElementById('cp-cs-slot').textContent;
  });
  console.log('choice card: ' + cs.replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: path.join(SHOTS, '99_crm_customer_sees_pdf.png'), clip: { x: 0, y: 0, width: 820, height: 260 } });
  await p.click('#cp-cs-slot [data-ep="cs"][data-v="template"]'); await sleep(600);
  const st = await p.evaluate(() => { const e = (window._gcEstimatesState || []).find(x => x.id === 'ESAMPLE3'); return e && e.customerSees; });
  console.log('after clicking Template version: customerSees=' + st);
  await p.screenshot({ path: path.join(SHOTS, '99_crm_customer_sees_template.png'), clip: { x: 0, y: 0, width: 820, height: 260 } });
} catch (e) { console.log('choice card: ' + e.message); }
/* the CRM's own screens, for comparison */
const shotHtml = async (html, name, kind) => {
  const ctx = await C.b.newContext(kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } });
  await ctx.route('**/*', r => { const u = r.request().url(); if (/grayco-logo-white\.png/.test(u)) return r.fulfill({ path: path.join(W.ROOT, 'img/grayco-logo-white.png'), contentType: 'image/png' }); if (/^data:|^about:/.test(u)) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  const pg = await ctx.newPage(); await pg.setContent(html, { waitUntil: 'load' }).catch(() => {}); await sleep(2200);
  await pg.screenshot({ path: path.join(SHOTS, name) }); await ctx.close();
};
const pdfPng = (file, name) => { try { execFileSync('pdftoppm', ['-png', '-r', '80', '-f', '1', '-l', '1', '-singlefile', file, path.join(SHOTS, name.replace(/\.png$/, ''))]); return true; } catch (e) { return false; } };
const idx = [];
if (got.inv) { await shotHtml(got.inv, '99_crm_invoice_desktop.png', 'desktop'); await shotHtml(got.inv, '99_crm_invoice_phone.png', 'phone'); idx.push('99_crm_invoice_desktop.png / 99_crm_invoice_phone.png — the CRM\'s own invoice screen (_gcViewInvoicePDF, "the blue animated screen"), invoice 1002 of the sample job'); }
if (got.proposal) { await shotHtml(got.proposal, '99_crm_proposal_desktop.png', 'desktop'); idx.push('99_crm_proposal_desktop.png — the CRM\'s proposal template (⚙ Proposal template) for estimate #1042, as the CRM renders it'); }
if (got.simple && pdfPng(path.join(OUT, 'est_simple.pdf'), '99_crm_estimate_pdf_page1.png')) idx.push('99_crm_estimate_pdf_page1.png — page 1 of the estimate PDF the CRM makes on "📤 Send estimate" (the file the portal shows)');
if (got.p5 && pdfPng(path.join(OUT, 'est_p5.pdf'), '99_crm_proposal5_pdf_page1.png')) idx.push('99_crm_proposal5_pdf_page1.png — page 1 of the CRM\'s 5-page GrayCo Customer Proposal PDF');
idx.push('99_crm_customer_sees_pdf.png / 99_crm_customer_sees_template.png — the job\'s estimate card in the CRM: "Customer sees: ◉ My PDF ○ Template version" (default My PDF; after a click on Template version)');
fs.writeFileSync(path.join(OUT, 'index_crm.txt'), idx.join('\n') + '\n');
const errs = C.errs.filter(e => !/ResizeObserver/.test(e));
console.log(idx.length + ' CRM shots; page errors: ' + errs.length + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''));
await C.b.close();
