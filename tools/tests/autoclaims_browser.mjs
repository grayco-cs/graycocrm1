// autoclaims_browser.mjs <build dir> [shots dir] — patch AUTOCLAIMS in the real page (fake cloud, made-up data):
// Site Book permit status + Rescheduled + the open list, the schedule row of a Site Book inspection, the To-Do items
// (drying Day N + missed day, inspection tomorrow + "Passed / Failed / Rescheduled?"), answering Failed (fix To-Do +
// re-inspection), the claim's 🧾 Field supplements tab (+ CSV), the drying banner, the adjuster-nudge approval wording,
// no page errors; desktop + phone screenshots. Run with the harness: node tools/tests/autoclaims_browser.mjs <dir>
import { computer, signIn, sleep, waitFor, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const build = process.argv[2], OUT = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/shots/autoB/';
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); } };
const DAYMS = 864e5, iso = n => new Date(Date.now() + n * DAYMS).toISOString();
const ld = n => { const d = new Date(Date.now() + n * DAYMS); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function seed(){
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
  cset('projects', [
    { id: 'PA1', name: 'Demo Reroof — 11 Test Ln', client: 'Dana Demo', clientEmail: 'dana.demo@example.com', address: '11 Test Ln, Bartlett, TN', status: 'active', pm: 'Wesley Johnson', type: 'Insurance Claim', isInsurance: true, autoPO: 'GC-A1' },
    { id: 'PA2', name: 'Demo Water — 22 Sample St', client: 'Sam Sample', address: '22 Sample St, Memphis, TN', status: 'active', pm: 'Wesley Johnson', type: 'Water mitigation', isInsurance: true, autoPO: 'GC-A2' }]);
  cset('gc_sitebook', [{ id: 'PA1', updatedAt: iso(-1), permit: { number: 'BLD-555-77', jurisdiction: 'Memphis / Shelby County, TN', updatedAt: iso(-3) },
    inspections: [{ id: 'IA', type: 'Final', date: ld(1), result: 'Scheduled', at: iso(-2), updatedAt: iso(-2) }, { id: 'IB', type: 'Framing', date: ld(-2), result: 'Scheduled', at: iso(-5), updatedAt: iso(-5) }] }]);
  cset('gc_claims', [
    { id: 'CA1', projectId: 'PA1', claimNumber: 'CLM-555-01', carrier: 'Demo Mutual', insured: 'Dana Demo', address: '11 Test Ln, Bartlett, TN', phase: 'Submitted to carrier', createdAt: iso(-20), updatedAt: iso(-1),
      adjuster: { name: 'Alex Adjuster', email: 'alex.adjuster@example.com' }, phaseHistory: [{ id: 'h1', phase: 'Submitted to carrier', at: iso(-8) }], payments: [], docs: [], supplements: [], sync: {},
      estimates: [{ id: 'E1', version: 1, side: 'carrier', source: 'pdf', importedAt: iso(-10), lines: [{ id: 'L1', desc: 'Laminated comp shingle roofing', qty: 28, unit: 'SQ', unitPrice: 300, rcv: 8400 }, { id: 'L2', desc: 'Drip edge', qty: 220, unit: 'LF', unitPrice: 3, rcv: 660 }], totals: { rcv: 9060 } }],
      notes: [{ id: 'N1', text: '#supplement Rotted decking at the ridge, 64 SF', at: iso(-3), by: 'Wesley Johnson', internal: true }, { id: 'N2', text: 'Drip edge #supplement', at: iso(-2), internal: true }],
      fieldSupp: { items: [{ id: 'F1', item: 'Ice & water shield in valleys', reason: 'Code requirement', qty: 2, unit: 'SQ', at: iso(-2), by: 'Wesley Johnson' }] } },
    { id: 'CA2', projectId: 'PA2', claimNumber: 'CLM-555-02', carrier: 'Demo Mutual', insured: 'Sam Sample', phase: 'Inspection', jobType: 'water', scope: 'mitigation', createdAt: iso(-6), updatedAt: iso(-1), notes: [], estimates: [], payments: [], docs: [], supplements: [], sync: {},
      equipment: [{ id: 'q1', kind: 'airmover', room: 'Kitchen', qty: 3, placedAt: ld(-4) }, { id: 'q2', kind: 'dehu', room: 'Kitchen', qty: 1, placedAt: ld(-4) }],
      moisture: [{ id: 'm1', room: 'Kitchen', material: 'Drywall', reading: 35, goal: 12, date: ld(-4) }, { id: 'm2', room: 'Kitchen', material: 'Drywall', reading: 28, goal: 12, date: ld(-3) }, { id: 'm3', room: 'Kitchen', material: 'Drywall', reading: 20, goal: 12, date: ld(-1) }] }]);
  cset('cos', [{ id: 'CO1', pid: 'PA1', desc: 'Replace 3 rotted rafter tails', amt: 450, status: 'Approved', reason: 'Found at tear-off' }]);
  cset('changeOrders', [{ id: 'CO1', pid: 'PA1', desc: 'Replace 3 rotted rafter tails', amt: 450, status: 'Approved', reason: 'Found at tear-off' }]);
  cset('gc_approval_queue', [{ id: 'appr_cnudge_CA1_x', kind: 'claim_nudge', title: '🛡 Adjuster follow-up — Demo Reroof', jobId: 'PA1', jobName: 'Demo Reroof — 11 Test Ln', pm: 'Wesley Johnson', pmEmail: 'wjohnson@grayco-cs.com', to: 'alex.adjuster@example.com', channel: 'email',
    subject: 'Following up — claim #CLM-555-01 — Dana Demo', html: '<p>Hi Alex,</p><p>I wanted to follow up on your review of our estimate.</p>', text: 'Hi Alex', steps: ['pm'], step: 'pm', approvals: [], status: 'waiting', createdAt: iso(-0.1), updatedAt: iso(-0.1), meta: { claimId: 'CA1', days: 8 } }]);
}
seed();
for (const mobile of [false, true]) {
  const tag = mobile ? 'phone' : 'desk';
  const A = await computer('AC' + tag, { build, mobile });
  await signIn(A, 'wjohnson@grayco-cs.com', 12000);
  const p = A.page();
  ok(await waitFor(A, () => !!(window._gcAutoClaims && window.GCAC), null, 60000, 500), tag + ': the patch is loaded (_gcAutoClaims, GCAC)');
  await waitFor(A, () => window._gcClaims && window._gcClaims.list().length === 2, null, 60000, 500);
  await waitFor(A, () => { try { return !!window._gcRP.site().all().PA1; } catch (e) { return false; } }, null, 60000, 500);
  if (!mobile) {
    const st = await A.ev(() => window._gcAutoClaims.status());
    ok(st.hooked && st.inspectionsOpen === 2 && st.toAnswer === 1 && st.drying === 1 && st.permitsOpen === 1, 'status: 2 inspections open, 1 to answer, 1 drying job, 1 permit', st);
    /* the To-Do items */
    const td = await A.ev(() => window._gcAutoClaims.todoItems().map(x => x.title));
    ok(td.some(t => /Take moisture readings \+ photos \(Day 5\)/.test(t)), 'To-Do: drying Day 5', td);
    ok(td.some(t => /Missed drying readings/.test(t)), 'To-Do: the missed drying day is flagged', td);
    ok(td.some(t => /Tomorrow: Final inspection/.test(t)), 'To-Do: inspection tomorrow (PM reminder)', td);
    ok(td.some(t => /Passed \/ Failed \/ Rescheduled\? Framing/.test(t)), 'To-Do: the after-date question', td);
    ok(!td.some(t => /Demo Mutual/.test(t)), 'no carrier name in the To-Do');
    /* the schedule */
    await A.ev(() => window._gcAutoClaims.schedTick()); await sleep(2500);
    const sr = await A.ev(() => (window._crm.schedule || []).filter(r => /^SB_INS_/.test(r.id)).map(r => ({ id: r.id, date: r.date, internal: r.internal })));
    ok(sr.some(r => r.id === 'SB_INS_PA1_IA' && r.internal === true), 'the dated Site Book inspection is on the schedule (internal)', sr);
    /* the corner prompt */
    await A.ev(() => window._gcAutoClaims.corner()); await sleep(300);
    ok(await A.ev(() => !!document.getElementById('gcac-corner') && /Framing/.test(document.getElementById('gcac-corner').textContent)), 'the corner card asks about the Framing inspection');
    await p.screenshot({ path: OUT + 'autoB_1_corner_prompt.png' });
    /* the Site Book: permit status, Rescheduled option, the open list button */
    await A.ev(() => window._gcRP.site().open('PA1', 'codes')); await sleep(2500);
    const sb = await A.ev(() => ({ status: !!document.querySelector('select[name="status"]'), resched: [...document.querySelectorAll('select[data-sb-insp] option')].some(o => o.textContent === 'Rescheduled'), btn: [...document.querySelectorAll('button')].some(b => /All open permits/.test(b.textContent)) }));
    ok(sb.status && sb.resched && sb.btn, 'Site Book: permit status, Rescheduled, "All open permits & inspections"', sb);
    await p.screenshot({ path: OUT + 'autoB_2_sitebook_codes.png' });
    await A.ev(() => window._gcAutoClaims.openList()); await sleep(800);
    ok(await A.ev(() => /Open permits & inspections/.test(document.querySelector('.gcac-box').textContent) && document.querySelectorAll('.gcac-box tbody tr').length === 3), 'the open list: 2 inspections + 1 permit');
    await p.screenshot({ path: OUT + 'autoB_3_open_list.png' });
    /* answer Failed with a re-inspection date */
    await A.ev(() => { document.querySelector('.gcac-box [data-ask]').click(); }); await sleep(600);
    await A.ev(() => [...document.querySelectorAll('.gcac-box [data-r]')].find(b => b.getAttribute('data-r') === 'failed').click()); await sleep(300);
    await p.screenshot({ path: OUT + 'autoB_4_answer_failed.png' });
    await A.ev(d => { const i = document.querySelector('.gcac-box [data-date]'); i.value = d; document.querySelector('.gcac-box [data-notes]').value = 'Missing hurricane straps'; document.querySelector('.gcac-box [data-save]').click(); }, (() => { const d = new Date(Date.now() + 3 * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()); await sleep(1500);
    const af = await A.ev(() => { const r = window._gcRP.site().rec('PA1'); const t = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return { res: (r.inspections || []).map(x => x.type + ':' + x.result), fix: t.filter(x => x.kind === 'insp_fix').map(x => x.label + '|' + (x.assignees || []).join(',')) }; });
    ok(af.res.includes('Framing:Failed') && af.res.some(x => /^Re-inspection: Framing:Scheduled$/.test(x)), 'Failed is saved and the re-inspection booked', af.res);
    ok(af.fix.length === 1 && /wjohnson@grayco-cs\.com/.test(af.fix[0]), 'a fix + reschedule To-Do for the PM', af.fix);
    /* the claim's Field supplements tab */
    await A.ev(() => { const A2 = window._gcClaims.open({ claimId: 'CA1' }); if (A2 && A2.S) { A2.S.easy = false; A2.S.tab = 'fsupp'; A2.render(true); } }); await sleep(2000);
    const fs1 = await A.ev(() => { const b = document.querySelector('[data-gcac-supp]'); return b ? { rows: b.querySelectorAll('tbody tr').length, txt: b.textContent, tab: [...document.querySelectorAll('[data-a="tab"]')].some(x => /Field supplements/.test(x.textContent)) } : null; });
    ok(fs1 && fs1.tab && fs1.rows === 4 && /Rotted decking/.test(fs1.txt) && /rafter tails/.test(fs1.txt) && /Ice & water/.test(fs1.txt), 'the claim tab lists the field items, change order and tagged notes', fs1 && { rows: fs1.rows, tab: fs1.tab });
    ok(fs1 && /looks like it is on the estimate/.test(fs1.txt), 'the item already on the Xactimate estimate (drip edge) is spotted');
    await p.screenshot({ path: OUT + 'autoB_5_field_supplements.png' });
    const csv = await A.ev(() => window._gcAutoClaims.csv('CA1'));
    ok(/^# Supplement request — claim CLM-555-01/.test(csv) && /Rotted decking/.test(csv) && !/Drip edge/.test(csv), 'CSV for the adjuster: included items only', csv.slice(0, 200));
    /* the drying banner */
    await A.ev(() => { window._gcAutoClaims.rules; const A3 = window._gcClaims.open({ claimId: 'CA2' }); if (A3 && A3.S) { A3.S.easy = false; A3.S.tab = 'drying'; A3.render(true); } }); await sleep(2000);
    ok(await A.ev(() => !!document.querySelector('[data-gcac-drymiss]') && /Day 5 of drying/.test(document.body.textContent)), 'the Drying tab flags the missed day and says Day 5');
    await p.screenshot({ path: OUT + 'autoB_6_drying_flag.png' });
    /* the adjuster nudge approval wording */
    const say = await A.ev(() => window._gcApprSay ? window._gcApprSay({ kind: 'claim_nudge', to: 'alex.adjuster@example.com', subject: 'Following up — claim #CLM-555-01', jobId: 'PA1' }, true) : '');
    ok(/ADJUSTER \(alex\.adjuster@example\.com\)/.test(say) && /never to the homeowner/.test(say) && !/Dana/.test(say), 'the approval card says the nudge goes to the adjuster', say);
  } else {
    await A.ev(() => window._gcAutoClaims.openList()); await sleep(800);
    const wide = await A.ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(wide, 'phone: the open list fits the screen (no sideways scroll)');
    await p.screenshot({ path: OUT + 'autoB_7_phone_open_list.png' });
    await A.ev(() => { document.querySelector('.gcac-ov').click(); const A2 = window._gcClaims.open({ claimId: 'CA1' }); if (A2 && A2.S) { A2.S.easy = false; A2.S.tab = 'fsupp'; A2.render(true); } }); await sleep(2000);
    await p.screenshot({ path: OUT + 'autoB_8_phone_field_supplements.png' });
  }
  const pe = A.errs.filter(e => /PAGEERROR/.test(e));
  ok(pe.length === 0, tag + ': no page errors', pe.slice(0, 3));
  await A.b.close();
}
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
