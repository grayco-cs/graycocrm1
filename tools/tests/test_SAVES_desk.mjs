// test_SAVES_desk.mjs <build-dir> — SAVES group "desk": the office's data entry on Desk computers.
//   lead stage + quick note   ◈ Leads → the lead → Stage → New Lead → Contacted; "Quick note" + ↵   (db, other computer, reload)
//   two computers, one lead   computer A changes the stage while computer B (opened before) logs a quick note → both kept
// Usage: node test_SAVES_desk.mjs <dir with index.html> [lead|both ...]
import { H, seed, device, reload, cloudWait, pageWait, R, table, arr, find, sleep, shot, closeAll, counts, navDesk } from './saves_lib.mjs';
const only = process.argv.slice(3); const want = k => !only.length || only.includes(k);
const W = [];
async function openLead(A, name){
  await navDesk(A, 'Leads');
  const pg = A.page();
  await H.waitFor(A, n => document.body.innerText.indexOf(n) >= 0, name, 15000);
  await pg.locator('main').getByText(name).first().click().catch(() => {});
  return !!(await H.waitFor(A, () => !!document.querySelector('[data-gclu-qn-in]'), null, 15000));
}
async function setStage(A, label){
  return A.ev(l => {
    const sel = [...document.querySelectorAll('select')].filter(s => s.offsetParent && [...s.options].some(o => o.text === l || o.value === l) && /stage/i.test((s.previousElementSibling && s.previousElementSibling.textContent || '') + (s.closest('label') && s.closest('label').textContent || '') + (s.getAttribute('aria-label') || '') + (s.name || '') + (s.id || '') + ([...s.attributes].map(a => a.name).join(' '))))[0];
    if (!sel) return false; sel.setAttribute('data-saves-stage', '1'); return true;
  }, label).then(async ok => { if (ok) await A.page().selectOption('[data-saves-stage="1"]', { label }); return ok; });
}
async function quickNote(A, text){
  const pg = A.page(); const inp = pg.locator('[data-gclu-qn-in]:visible').first();
  await inp.fill(text); await inp.press('Enter'); await sleep(1200);
}
const lead = () => find('leads', 'L1');
const hasNote = (l, t) => !!l && JSON.stringify([l.activity, l.notes, l.note]).indexOf(t) >= 0;
async function leadEdit(){
  seed();
  const A = await device('desk'); W.push(A);
  R('lead open', 'desk', 'opens', await openLead(A, 'Robin Sample'));
  const st = await setStage(A, 'Contacted');
  R('lead stage', 'desk', 'stage box found', st);
  const dbS = await cloudWait(() => { const l = lead(); return l && /contact/i.test(String(l.stage || l.status)) ? l : null; }, 30000);
  R('lead stage', 'desk', 'db', !!dbS, { stage: (lead() || {}).stage });
  const T = 'Called, wants a quote ' + Date.now().toString(36).slice(-3);
  await quickNote(A, T);
  R('lead quick note', 'desk', 'db', !!(await cloudWait(() => hasNote(lead(), T), 30000)));
  const B = await device('desk', 'wjohnson@grayco-cs.com'); W.push(B);
  const onB = await pageWait(B, 'leads', 'L1', l => /contact/i.test(String(l.stage || l.status)) && hasNote(l, T), 30000);
  R('lead stage', 'desk', 'other', !!onB); R('lead quick note', 'desk', 'other', !!onB);
  await reload(A);
  const afterR = await pageWait(A, 'leads', 'L1', l => /contact/i.test(String(l.stage || l.status)) && hasNote(l, T), 20000);
  R('lead stage', 'desk', 'reload', !!afterR); R('lead quick note', 'desk', 'reload', !!afterR);
  await closeAll([A, B]); W.length = 0;
}
async function bothEdit(){
  seed();
  const A = await device('desk'), B = await device('desk', 'wjohnson@grayco-cs.com'); W.push(A, B);
  await openLead(A, 'Robin Sample'); await openLead(B, 'Robin Sample');   /* both have the lead open (B's copy goes stale) */
  await setStage(A, 'Contacted');
  await cloudWait(() => /contact/i.test(String((lead() || {}).stage || '')), 30000);
  await sleep(1500);
  const T = 'B note while A changed the stage ' + Date.now().toString(36).slice(-3);
  await quickNote(B, T);
  const both = await cloudWait(() => { const l = lead(); return l && /contact/i.test(String(l.stage || l.status)) && hasNote(l, T) ? l : null; }, 45000);
  R('one lead, two computers', 'desk', 'db: both edits kept', !!both, { stage: (lead() || {}).stage, note: hasNote(lead(), T) });
  await sleep(6000);
  const l2 = lead();
  R('one lead, two computers', 'desk', 'stays kept', !!l2 && /contact/i.test(String(l2.stage || l2.status)) && hasNote(l2, T), { stage: (l2 || {}).stage, note: hasNote(l2, T) });
  await closeAll([A, B]); W.length = 0;
}
try {
  if (want('lead')) await leadEdit();
  if (want('both')) await bothEdit();
} catch (e) { console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await closeAll(W);
table('SAVES desk');
process.exit(counts().fail ? 1 : 0);
