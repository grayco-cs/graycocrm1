/* patch SDS — the customer's "Chemical & product use consent" in the portal: one paper, Approve / Do not use on EACH product.
   node tools/tests/test_SDS_fn.mjs   (offline: custportal_world.mjs fakes Supabase / Resend; the REAL portal-sign.js) */
import assert from 'assert';
import * as W from './custportal_world.mjs';
let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const S = W.S, L = () => ({ 'x-portal-token': S.link }), pm = { authorization: 'Bearer good-pm' }, call = W.handlerCall;
W.setDay(); W.seedSample({ crmDocs: false }); W.resetCaches(); W.RESEND.length = 0;
const CH = [
  { id: 'quat_disinfectant', n: 'Quaternary ammonium disinfectant (EPA-registered)', u: 'Disinfecting surfaces after sewage water', c: 'Children and pets out until dry. ' + S.carrier + ' approved list' },
  { id: 'ozone_generator', n: 'Ozone generator (equipment)', u: 'Odor treatment in an empty building', c: 'Everyone — people, pets, plants — out while it runs' },
  { id: 'bad id!', n: 'Dropped', u: '' }];
let id;
await t('request: a doc paper with products (choices) is made; bad choice ids are dropped', async () => {
  const q = await call('portal-sign', { action: 'request', projectId: S.pid, kind: 'doc', refId: 'sds_' + S.pid, title: 'Chemical & product use consent', choices: CH, lines: CH.map(c => ({ l: c.n })), note: 'Please mark each product' }, pm);
  assert.ok(q.data.ok && q.data.id, JSON.stringify(q.data)); id = q.data.id;
  const r = (W.get('gc_sign_requests') || []).find(x => x.id === id);
  assert.deepStrictEqual(r.choices.map(c => c.id), ['quat_disinfectant', 'ozone_generator']);
});
await t('the customer sees each product with what it is for and its cautions — never the insurance company\'s name', async () => {
  const v = (await call('portal-sign', { action: 'view' }, L())).data, it = v.items.find(x => x.id === id);
  assert.ok(it && it.status === 'pending' && it.choices.length === 2 && it.choices[0].u && it.choices[1].c, JSON.stringify(it));
  assert.ok(!JSON.stringify(it).toLowerCase().includes(String(S.carrier).toLowerCase()), 'carrier leaked');
});
await t('re-sending with a changed product list updates the same pending paper (no second one)', async () => {
  const q = await call('portal-sign', { action: 'request', projectId: S.pid, kind: 'doc', refId: 'sds_' + S.pid, title: 'Chemical & product use consent', choices: CH.slice(0, 1).concat([{ id: 'bleach_solution', n: 'Sodium hypochlorite (bleach) solution', u: 'Hard surfaces', c: 'Strong odor' }, CH[1]]) }, pm);
  assert.ok(q.data.ok && q.data.id === id, JSON.stringify(q.data));
  const r = (W.get('gc_sign_requests') || []).filter(x => String(x.id).startsWith(id));
  assert.strictEqual(r.length, 1); assert.deepStrictEqual(r[0].choices.map(c => c.id), ['quat_disinfectant', 'bleach_solution', 'ozone_generator']);
});
const SIGN = extra => Object.assign({ action: 'sign', id, name: 'Sample Customer', agree: true, esignConsent: { agree: true, version: 'v1', at: new Date().toISOString() }, strokes: [[[10, 10], [60, 40]]] }, extra);
await t('signing without an answer for every product is refused', async () => {
  const r = await call('portal-sign', SIGN({ picks: { quat_disinfectant: 'yes', bleach_solution: 'yes' } }), L());
  assert.strictEqual(r.status, 400); assert.ok(/every product/.test(r.data.error), r.data.error);
  const r2 = await call('portal-sign', SIGN({ picks: { quat_disinfectant: 'yes', bleach_solution: 'maybe', ozone_generator: 'no' } }), L());
  assert.strictEqual(r2.status, 400);
});
await t('signed with Approve / Do not use per product + the sensitivities note: stored, signed copy made, the office / PM told which are DO NOT USE', async () => {
  W.RESEND.length = 0;
  const r = await call('portal-sign', SIGN({ picks: { quat_disinfectant: 'yes', bleach_solution: 'yes', ozone_generator: 'no' }, sens: 'Daughter has asthma <b>' }), L());
  assert.ok(r.data.ok && r.data.copy, JSON.stringify(r.data));
  const rec = (W.get('gc_sign_requests') || []).find(x => x.id === id);
  assert.strictEqual(rec.status, 'signed');
  assert.deepStrictEqual(rec.signed.picks, { quat_disinfectant: 'yes', bleach_solution: 'yes', ozone_generator: 'no' });
  assert.ok(/asthma/.test(rec.signed.sens) && !/</.test(rec.signed.sens), rec.signed.sens);
  const all = JSON.stringify(W.KV) + JSON.stringify(W.RESEND);
  assert.ok(/DO NOT USE — Ozone generator/.test(all), 'the office to-do / PM e-mail names the refused product');
});
await t('the signed paper in the portal shows each answer', async () => {
  const v = (await call('portal-sign', { action: 'view' }, L())).data, it = v.items.find(x => x.id === id);
  assert.strictEqual(it.status, 'signed');
  assert.deepStrictEqual(it.choices.map(c => c.pick), ['yes', 'yes', 'no']);
});
await t('a paper without products signs exactly as before (no picks needed)', async () => {
  const q = await call('portal-sign', { action: 'request', projectId: S.pid, kind: 'doc', refId: 'plain_doc_1', title: 'Plain paper' }, pm);
  const r = await call('portal-sign', SIGN({ id: q.data.id }), L());
  assert.ok(r.data.ok, JSON.stringify(r.data));
});
console.log('SDS_fn: ' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
