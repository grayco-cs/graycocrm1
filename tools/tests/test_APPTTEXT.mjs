// test_APPTTEXT.mjs <build-dir> — APPTTEXT (owner 11/10): appointments texted to the GrayCo number (gc_kv gc_text_appts) land on the
// texter's 👤 My schedule as personal items (only on their CRM), and "new job" also makes a lead assigned to them. Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
resetCloud();
const at = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('gc_text_appts', [
  { id: 'TA_a1', kind: 'estimate', date: '2026-11-14', time: '09:30', endTime: '10:30', title: 'Estimate — Jane Doe', customer: 'Jane Doe', phone: '9015551234', address: '55 Oak Ave', leadId: '', by: 'Wesley Johnson', byEmail: 'wjohnson@grayco-cs.com', text: 'estimate Jane Doe 901-555-1234 11/14 9:30am 55 Oak Ave', at },
  { id: 'TA_a2', kind: 'newjob', date: '2026-11-12', time: '15:00', endTime: '16:00', title: 'New job — Bob Lee', customer: 'Bob Lee', phone: '', address: '88 Elm St', leadId: '', by: 'Wesley Johnson', byEmail: 'wjohnson@grayco-cs.com', text: 'new job Bob Lee thu 3pm 88 Elm St', at },
  { id: 'TA_a3', kind: 'meeting', date: '2026-11-13', time: '10:00', endTime: '11:00', title: 'Meeting — Nick', customer: 'Nick', phone: '', address: 'the office', leadId: '', by: 'Pat PM', byEmail: 'pat@grayco-cs.com', text: 'meeting with Nick fri 10am', at }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(9000);
await A.ev(() => window._gcLsaCheck && window._gcLsaCheck.textAppts()); await sleep(4000);
const st = await A.ev(() => ({ sch: ((() => { let L = null; try { window._setSchedule(pr => { L = pr; return pr; }); } catch (e) {} return L || window._crm.schedule || []; })()).filter(x => x && x.textId).map(x => ({ id: x.textId, t: x.title, d: x.date, tm: x.time, a: x.assignee, sc: x.scope, p: x.private, addr: x.address })),
  leads: (window._crm.leads || []).filter(l => /^LTXT_/.test(l.id)).map(l => ({ id: l.id, n: l.name, pm: l.pm, st: l.stage, ad: l.address })) }));
ok('my two texted appointments are on my schedule as personal items', st.sch.length === 2 && st.sch.every(x => x.sc === 'personal' && x.p === true && x.a === 'Wesley Johnson') && st.sch.some(x => x.id === 'TA_a1' && x.d === '2026-11-14' && x.tm === '09:30' && x.addr === '55 Oak Ave'), st.sch);
ok("Pat's appointment is not added on my computer", !st.sch.some(x => x.id === 'TA_a3'), st.sch);
ok('"new job" made a lead assigned to me (Appointment booked)', st.leads.length === 1 && st.leads[0].n === 'Bob Lee' && st.leads[0].pm === 'Wesley Johnson' && /Appointment/.test(st.leads[0].st) && st.leads[0].ad === '88 Elm St', st.leads);
await A.ev(() => window._gcLsaCheck.textAppts()); await sleep(3000);
const n2 = await A.ev(() => ({ s: ((() => { let L = null; try { window._setSchedule(pr => { L = pr; return pr; }); } catch (e) {} return L || window._crm.schedule || []; })()).filter(x => x && x.textId).length, l: (window._crm.leads || []).filter(l => /^LTXT_/.test(l.id)).length }));
ok('running again adds nothing twice', n2.s === 2 && n2.l === 1, n2);
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'APPTTEXT ' + R.length + '/' + R.length); process.exit(f ? 1 : 0);
