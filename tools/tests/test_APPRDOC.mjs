// test_APPRDOC.mjs <build-dir> [mirror.json] — patch APPRDOC on the live mirror (read-only copy, never committed), as Wesley:
//   1. a sub-invoice card shaped like the owner's ("Sub invoice — … Uploaded: invoice-22902.pdf · $20,000.00 · Rapid Air",
//      the file in invoices[].fileData): a "📄 invoice-22902.pdf" chip; "📄 Open sub invoice" opens the PDF in the viewer
//      beside the card (iframe), Approve / Deny there; "✏ Edit" is the form; "📄 Our sub-invoice form" is our paper.
//   2. an expense card with no receipt: amber "No document attached" + "📎 Attach receipt / PDF" → a PDF → stored
//      (_gcStoreFile), on the expense (attachments[]), in the job's Files & Docs (projectDocs, apxFor), on the card.
//   3. Admin setting ON → an expense with no document cannot be approved (button + in-place approve held); OFF again.
//   4. the job page: Expenses tab → 📎 on a line → attached → 👁 opens it.
//   5. no page errors.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud, mclick } = H;
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const email = 'wjohnson@grayco-cs.com';
const pdf = name => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<<>>>>endobj 4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 100 Td (${name}) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
resetCloud(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const V = k => (cloud.get(k) || {}).value, put = (k, v) => cloud.set(k, { key: k, value: v, updated_at: new Date().toISOString() });
const exps = V('expenses') || [], projs = (V('projects') || []).filter(p => p && p.id && /active/i.test(String(p.status || '')) && !/^QB_/.test(p.id));
const job = projs.find(p => exps.some(e => e && e.pid === p.id)) || projs[0];
const today = new Date().toISOString().slice(0, 10), ent = new Date(Date.now() - 864e5).toISOString();
const SUBINV = [{ id: 'INVADTEST1', type: 'sub', pid: job.id, sub: 'Rapid Air', po: job.autoPO || '', amt: '20000', desc: 'Uploaded: invoice-22902.pdf', recvDate: today, status: 'received', source: 'upload', fileName: 'invoice-22902.pdf', fileData: 'data:application/pdf;base64,' + pdf('invoice-22902').toString('base64'), by: 'Wesley Johnson', updatedAt: ent }];
put('invoices', (V('invoices') || []).concat(SUBINV)); put('invs', (V('invs') || []).concat(SUBINV));
put('gc_sub_approvals', (V('gc_sub_approvals') || []).concat([{ id: 'invId:INVADTEST1', invId: 'INVADTEST1', pid: job.id, sub: 'Rapid Air', desc: 'Uploaded: invoice-22902.pdf', amt: 20000, status: 'pending_pm', pmName: 'Wesley Johnson', createdAt: Date.now() - 3600e3 }]));
put('expenses', exps.concat([{ id: 'EXPADTEST1', type: 'expense', vendor: 'ADTest Lumber', desc: 'ADTest boards', amt: 123.45, pid: job.id, category: 'Materials', status: 'pending', date: today, by: 'Wesley Johnson', source: 'expenses-sync', enteredAt: ent, updatedAt: ent },
  { id: 'EXPADTEST2', type: 'expense', vendor: 'ADTest Paint', desc: 'ADTest paint', amt: 55, pid: job.id, category: 'Materials', status: 'approved', date: today, by: 'Wesley Johnson', updatedAt: ent }]));
put('gc_expense_approvals', (V('gc_expense_approvals') || []).concat([{ id: 'expId:EXPADTEST1', expId: 'EXPADTEST1', jobId: job.id, pm: 'Wesley Johnson', amount: 123.45, payee: 'ADTest Lumber', desc: 'ADTest boards', matched: true, status: 'pending_pm', enteredAt: ent, source: 'expenses-sync' }]));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
console.log('  job', job.id, job.name);
const c = await computer('AD', { build }); const p = c.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
await waitFor(c, () => (window._crm.invoices || []).some(i => i && i.id === 'INVADTEST1'), null, 30000, 500);
if (!(await p.evaluate(() => (localStorage.getItem('gc_sub_approvals') || '').indexOf('INVADTEST1') >= 0))) await p.evaluate(q => localStorage.setItem('gc_sub_approvals', JSON.stringify(JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]').concat(q))), (V('gc_sub_approvals') || []).filter(x => x.invId === 'INVADTEST1'));
if (!(await p.evaluate(() => (localStorage.getItem('gc_expense_approvals') || '').indexOf('EXPADTEST1') >= 0))) await p.evaluate(q => localStorage.setItem('gc_expense_approvals', JSON.stringify(JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]').concat(q))), (V('gc_expense_approvals') || []).filter(x => x.expId === 'EXPADTEST1'));
await sleep(15000);
await p.evaluate(() => window._setView('approvals')); await sleep(4000);
const SUB = 'sub:INVADTEST1';
console.log('   diag', JSON.stringify(await p.evaluate(() => ({ lsSub: (localStorage.getItem('gc_sub_approvals') || '').indexOf('INVADTEST1') >= 0, lsExp: (localStorage.getItem('gc_expense_approvals') || '').indexOf('EXPADTEST1') >= 0,
  inv: (window._crm.invoices || []).some(i => i && i.id === 'INVADTEST1'), exp: (window._crm.expenses || []).some(i => i && i.id === 'EXPADTEST1'),
  set: (() => { const s = window._gcApprovalSet(); const o = []; Object.keys(s.groups).forEach(g => s.groups[g].forEach(x => o.push(g + ':' + x.id))); return [s.total].concat(o.filter(x => /ADTEST|sub:|exp:/.test(x)).slice(0, 12)); })(), view: localStorage.getItem('grayco_view'), user: localStorage.getItem('grayco_user'),
  dom: [...document.querySelectorAll('.apx-row')].map(e => e.getAttribute('data-k')).filter(k => /sub:|exp:/.test(k)).slice(0, 10),
  subQ: JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]').filter(a => a && /ADTEST/.test(JSON.stringify(a))).map(a => a.status + '/' + a.pmName), expQ: (window._gcExpenseApprovalsFor ? window._gcExpenseApprovalsFor() : []).filter(a => /ADTEST/.test(JSON.stringify(a))).length }))));
const card = k => p.evaluate(k => { const e = document.querySelector('.apx-list [data-k="' + k + '"]'); return e ? { text: e.textContent.replace(/\s+/g, ' ').slice(0, 400), btns: [...e.querySelectorAll('.apx-bs button')].map(b => b.textContent.trim()), chips: [...e.querySelectorAll('.apxd-chip')].map(b => b.textContent.trim()), warn: !!e.querySelector('.apxd-warn'), add: !!e.querySelector('[data-apxd-add]') } : null; }, k);
const show = async k => { for (let i = 0; i < 4 && !(await p.locator(`.apx-list [data-k="${k}"]`).count()); i++) { await p.evaluate(() => { const m = document.querySelector('[data-apx-more]'); if (m) m.click(); }); await sleep(700); } };
await show(SUB); let s1 = await card(SUB); console.log('   sub card', JSON.stringify(s1));
ok(s1 && s1.chips.some(x => /invoice-22902\.pdf/.test(x)), 'the sub-invoice card shows its file: 📄 invoice-22902.pdf');
ok(s1 && s1.btns.includes('📄 Open sub invoice') && s1.btns.includes('✏ Edit') && s1.btns.includes('📄 Our sub-invoice form') && !s1.btns.some(b => /^✏️ Open/.test(b)), 'buttons: 📄 Open sub invoice · ✏ Edit · 📄 Our sub-invoice form (' + (s1 && s1.btns.join(' | ')) + ')');
await mclick(p, `[data-apx-act$="|${SUB}|view"]`);
const vw = await waitFor(c, () => { const v = document.getElementById('apxd-view'); const f = v && v.querySelector('iframe.apxd-frame'); return f ? { src: f.getAttribute('src').slice(0, 5), shown: v.querySelector('.apxd-body').getAttribute('data-apxd-shown'), acts: [...v.querySelectorAll('[data-apxd-act]')].map(b => b.textContent.trim()), cardVisible: (() => { const e = document.querySelector('.apx-list [data-k="sub:INVADTEST1"]'); if (!e) return false; const r = e.getBoundingClientRect(), vr = v.getBoundingClientRect(); return r.right <= vr.left + 2 && r.width > 100; })() } : null; }, null, 15000, 300);
console.log('   viewer', JSON.stringify(vw));
ok(vw && vw.src === 'blob:' && vw.shown === 'invoice-22902.pdf', '"📄 Open sub invoice" opens the PDF in the viewer');
ok(vw && vw.acts.some(a => /Approve/.test(a)) && vw.acts.some(a => /Deny/.test(a)) && vw.cardVisible, 'beside the card (still visible), with Approve and Deny (' + (vw && vw.acts.join(' | ')) + ')');
await p.keyboard.press('Escape'); await sleep(300);
ok(!(await p.locator('#apxd-view').count()), 'Esc closes the viewer');
// 2. attach on a card with none
await waitFor(c, () => { const s = window._gcApprovalSet(); const hit = Object.keys(s.groups).some(g => s.groups[g].some(x => /EXPADTEST1/.test(x.id))); if (!hit && window._gcApprovalSetFresh) window._gcApprovalSetFresh(); return hit; }, null, 45000, 1500);
await p.evaluate(() => window._setView('approvals')); await sleep(1500);
const EXP = await p.evaluate(() => { const e = [...document.querySelectorAll('.apx-list .apx-row')].find(x => /^exp:.*EXPADTEST1/.test(x.getAttribute('data-k'))); return e ? e.getAttribute('data-k') : null; }) || 'exp:expId:EXPADTEST1';
await show(EXP); let e1 = await card(EXP); console.log('   expense card', EXP, JSON.stringify(e1));
ok(e1 && e1.warn && e1.add && !e1.chips.length, 'an expense with no receipt: amber "No document attached" + 📎 Attach receipt / PDF');
// 3. the setting: ON → cannot approve
await p.evaluate(() => { const d = document.createElement('div'); d.id = 'adtest-admin'; d.innerHTML = window._gcApprDocAdminHtml(); document.body.appendChild(d); });
await p.locator('#adtest-admin [data-apxd-req]').check(); await sleep(1500);
await p.evaluate(() => window._setView('approvals')); await sleep(1500); await show(EXP);
let e2 = await card(EXP); const inplace = await p.evaluate(k => window._gcApproveInPlace(k), EXP);
ok(e2 && e2.btns.some(b => /attach the document first/.test(b)) && inplace === false, 'Admin "approvals need a document" ON: Approve is held (button + in-place approve)');
// attach
const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 10000 }), mclick(p, `.apx-list [data-k="${EXP}"] [data-apxd-add]`)]).catch(e => [null]);
if (fc) await fc.setFiles({ name: 'receipt-adtest.pdf', mimeType: 'application/pdf', buffer: pdf('receipt-adtest') });
const att = await waitFor(c, () => { const e = (window._crm.expenses || []).find(x => x && x.id === 'EXPADTEST1'); return e && (e.attachments || []).length ? e.attachments : null; }, null, 20000, 400);
console.log('   attached', JSON.stringify(att));
ok(att && /^sb:/.test(att[0].ref) && att[0].name === 'receipt-adtest.pdf', 'attached: stored in the CRM file store and linked to the expense');
const pd = await waitFor(c, () => window.idbGet('projectDocs').then(l => (l || []).filter(d => d && d.apxFor && /EXPADTEST1/.test(d.apxFor)).map(d => ({ pid: d.pid, name: d.name, ref: String(d.ref).slice(0, 3) }))).then(l => l.length ? l : null), null, 20000, 600);
ok(pd && pd[0].pid && pd[0].name === 'receipt-adtest.pdf', 'and in the job\'s Files & Docs (' + JSON.stringify(pd) + ')');
await sleep(800); await p.keyboard.press('Escape');
await p.evaluate(() => window._setView('approvals')); await sleep(1500); await show(EXP);
let e3 = await card(EXP); console.log('   expense card after', JSON.stringify(e3));
ok(e3 && e3.chips.some(x => /receipt-adtest\.pdf/.test(x)) && !e3.warn && !e3.btns.some(b => /first/.test(b)) && e3.btns.length > 2, 'the card shows the receipt and can be approved (' + (e3 && e3.btns[0]) + ')');
await p.locator('#adtest-admin [data-apxd-req]').uncheck(); await sleep(800);
ok(await p.evaluate(() => !JSON.parse(localStorage.getItem('gc_apprdoc_settings') || '{}').require), 'the setting back OFF (warn only)');
// 4. the job page: Expenses → 📎 on a line → 👁
await p.evaluate(pid => { if (typeof window._gcGoToTaskJob === 'function') window._gcGoToTaskJob(pid, ''); else { try { localStorage.setItem('grayco_openpid', pid); } catch (e) {} window._setView('projects'); } }, job.id); await sleep(5000);
console.log('   job page', JSON.stringify(await p.evaluate(() => ({ view: localStorage.getItem('grayco_view'), tabs: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /^(Expenses|COs|Invoices|💰)/.test(t)).slice(0, 6) }))));
const tab = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Expenses \(\d+\)$/.test(x.textContent.trim())); if (b) { b.click(); return b.textContent.trim(); } return null; });
await sleep(2500);
const line = await waitFor(c, () => { const e = document.querySelector('[data-apxd-line="exp|EXPADTEST2"]'); return e && e.querySelector('[data-apxd-ladd]') ? e.innerHTML.length : null; }, null, 15000, 400);
ok(tab && line, `the job's ${tab} tab: each line has 📎 (and 👁 when a file is there)`);
if (line) {
  const [fc2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 10000 }), mclick(p, '[data-apxd-line="exp|EXPADTEST2"] [data-apxd-ladd]')]);
  await fc2.setFiles({ name: 'paint-receipt.pdf', mimeType: 'application/pdf', buffer: pdf('paint-receipt') });
  const a2 = await waitFor(c, () => { const e = (window._crm.expenses || []).find(x => x && x.id === 'EXPADTEST2'); return e && (e.attachments || []).length ? e.attachments.map(a => a.name) : null; }, null, 20000, 400);
  const eye = await waitFor(c, () => !!document.querySelector('[data-apxd-line="exp|EXPADTEST2"] [data-apxd-lview]'), null, 10000, 400);
  ok(a2 && a2.includes('paint-receipt.pdf') && eye, 'job page 📎: attached to the expense, 👁 appears on its line');
  await mclick(p, '[data-apxd-line="exp|EXPADTEST2"] [data-apxd-lview]');
  const v2 = await waitFor(c, () => { const v = document.getElementById('apxd-view'); return v && v.querySelector('iframe.apxd-frame') ? v.querySelector('.apxd-body').getAttribute('data-apxd-shown') : null; }, null, 15000, 300);
  ok(v2 === 'paint-receipt.pdf', '👁 opens it in the viewer (' + v2 + ')');
}
ok(!c.errs.length, 'no page errors (' + c.errs.slice(0, 3).join(' | ') + ')');
console.log(`APPRDOC ${pass}/${pass + fail}`); try { await c.b.close(); } catch (e) {} process.exit(fail ? 1 : 0);
