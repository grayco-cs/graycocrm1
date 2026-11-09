/* patch DOCAUTO — the job's library papers straight into the customer's portal to e-sign, no approval, one e-mail.
   node tools/tests/test_DOCAUTO.mjs   (offline: custportal_world.mjs fakes Supabase / Resend; the REAL portal-sign.js) */
import assert from 'assert';
import * as W from './custportal_world.mjs';
let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const S = W.S, L = () => ({ 'x-portal-token': S.link }), pm = { authorization: 'Bearer good-pm' }, call = W.handlerCall;
W.setDay(); W.seedSample({ crmDocs: false }); W.resetCaches(); W.RESEND.length = 0;
const AQ = () => JSON.stringify(W.get('gc_approval_queue') || W.get('gc_approvals') || []);
const aq0 = AQ();
const r1 = W.storeFile(W.pdfOf('Mold information', ['About mold']), 'pdf', 'application/pdf');
const r2 = W.storeFile(W.pdfOf('Drying log', ['Daily readings']), 'pdf', 'application/pdf');
let q;
await t('request-many: 2 papers made, ONE e-mail to the customer, nothing on Approvals', async () => {
  q = await call('portal-sign', { action: 'request-many', projectId: S.pid, items: [{ refId: 'dl_gcb_mold_info', title: 'Mold information', docRef: r1, docName: 'Mold information.pdf' }, { refId: 'dl_gcb_drying', title: 'Drying log', docRef: r2, docName: 'Drying log.pdf' }] }, pm);
  assert.ok(q.data.ok && q.data.made === 2, JSON.stringify(q.data));
  const mails = W.RESEND.filter(m => JSON.stringify(m).includes('review and sign'));
  assert.strictEqual(mails.length, 1, 'one e-mail: ' + W.RESEND.length);
  assert.ok(/Mold information/.test(JSON.stringify(mails[0])) && /Drying log/.test(JSON.stringify(mails[0])));
  assert.strictEqual(AQ(), aq0, 'approvals unchanged');
});
await t('the customer sees both in ✍️ Papers to sign at once, with the PDF', async () => {
  const v = (await call('portal-sign', { action: 'view' }, L())).data;
  const mine = v.items.filter(x => /Mold information|Drying log/.test(x.title));
  assert.strictEqual(mine.length, 2, JSON.stringify(v.items.map(x => x.title)));
  assert.ok(mine.every(x => x.status === 'pending' && /^https:/.test(x.doc)));
});
await t('the customer e-signs one (consent required) → signed copy', async () => {
  const v = (await call('portal-sign', { action: 'view' }, L())).data, it = v.items.find(x => x.title === 'Mold information');
  const no = await call('portal-sign', { action: 'sign', id: it.id, name: 'Sample Customer', agree: true }, L()); assert.strictEqual(no.status, 400);
  const r = await call('portal-sign', { action: 'sign', id: it.id, name: 'Sample Customer', agree: true, esignConsent: { agree: true, version: 'v1', at: new Date().toISOString() }, strokes: [[[10, 10], [60, 40]]] }, L());
  assert.ok(r.data.ok && r.data.copy, JSON.stringify(r.data));
});
await t('sending again (another computer) makes nothing new and sends no e-mail', async () => {
  const n = W.RESEND.length;
  const again = await call('portal-sign', { action: 'request-many', projectId: S.pid, items: [{ refId: 'dl_gcb_mold_info', title: 'Mold information', docRef: r1 }, { refId: 'dl_gcb_drying', title: 'Drying log', docRef: r2 }] }, pm);
  assert.ok(again.data.ok && again.data.made === 0, JSON.stringify(again.data)); assert.strictEqual(W.RESEND.length, n);
});
await t('not staff → refused; a customer link cannot ask', async () => {
  const x = await call('portal-sign', { action: 'request-many', projectId: S.pid, items: [] }, L()); assert.ok(x.status >= 400);
});
await t('no carrier name in the e-mail or the portal view', async () => {
  const j = JSON.stringify(W.RESEND) + JSON.stringify((await call('portal-sign', { action: 'view' }, L())).data);
  assert.ok(!j.toLowerCase().includes(String(S.carrier).toLowerCase()), 'carrier leaked');
});
console.log('DOCAUTO: ' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
