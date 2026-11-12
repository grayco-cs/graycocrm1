// test_LEADKEEP.mjs <build-dir> — owner 11/12: Priority "SET" again on bid leads ("I've set these before"). What a person set on a lead
// (priority, stage, PM / estimator …) survives a Lead Inbox re-import with a new id, a stale copy written over it, a BIDMERGE merge,
// and reaches another computer through gc_kv 'gc_lead_keep'. Made-up data only.
import { computer, signIn, sleep, cset, cget, resetCloud, waitFor } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud();
const at = new Date(Date.now() - 3 * 3600e3).toISOString(), T1 = new Date(Date.now() - 2 * 3600e3).toISOString(), due = new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true }]);
const base = { client: 'Zedd Builders', name: 'Zeddville Fire Station 9 Renovation', city: 'Zeddville', gc: 'Zedd Builders', bidDue: due, leadKind: 'Commercial', createdAt: at, inboxAt: at };
cset('leads', [
  Object.assign({ id: 'LEADIN-kp1', inboxId: 'LI-kp1', inboxRev: 1, stage: 'Bid Submitted', stageChangedAt: T1, priority: 8, prioritySetAt: T1, prioritySetBy: 'Wesley Johnson', estimator: 'Demo Estimator', assignedAt: T1, assignedBy: 'Wesley Johnson', inboxState: 'assigned', updatedAt: T1,
    activity: [{ type: 'priority', text: 'Priority 8', at: T1, by: 'Wesley Johnson' }] }, base),
  Object.assign({}, base, { id: 'LEADIN-kp2', inboxId: 'LI-kp2', name: 'Zeddville Library Reroof', inboxRev: 1, stage: 'New Lead', inboxState: 'new', updatedAt: at })]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
const kv = await waitFor(A, () => true, null, 1000) && await (async () => { for (let i = 0; i < 20; i++) { const v = cget('gc_lead_keep'); if (v && (v.recs || []).length) return v; await sleep(500); } return cget('gc_lead_keep'); })();
const rec = kv && (kv.recs || []).find(r => (r.k || []).includes('ib:LI-kp1'));
ok('the person-set values are kept apart, shared (gc_kv gc_lead_keep): priority 8, stage, estimator — by id, inbox item and name', !!rec && rec.f.prio.v === 8 && rec.f.stage.v === 'Bid Submitted' && rec.f.asg.v.estimator === 'Demo Estimator' && rec.k.some(k => /^n:/.test(k)), rec);
ok('…a lead nobody touched has no values recorded', !(kv.recs || []).some(r => (r.k || []).includes('ib:LI-kp2') && r.f && (r.f.prio || r.f.stage || r.f.asg)));
const get = id => A.ev(i => { const l = (window._crm.leads || []).find(x => x.id === i); return l ? { p: l.priority, st: l.stage, est: l.estimator, keptBy: l.keptBy } : null; }, id);
/* 1) a stale copy (no priority, New Lead, nobody) written over it with a NEWER time — what the Lead Inbox import did */
await A.ev(T => window._setLeads(p => p.map(l => l.id !== 'LEADIN-kp1' ? l : Object.assign({}, l, { priority: undefined, prioritySetAt: undefined, stage: 'New Lead', stageChangedAt: undefined, estimator: '', assignedAt: undefined, assignedBy: undefined, activity: [], updatedAt: new Date().toISOString() }))), T1);
let g = await waitFor(A, () => { const l = window._crm.leads.find(x => x.id === 'LEADIN-kp1'); return l && l.priority === 8 ? l : null; }, null, 15000);
g = await get('LEADIN-kp1');
ok('a newer copy without them → priority 8, stage Bid Submitted, estimator back', g && g.p === 8 && g.st === 'Bid Submitted' && g.est === 'Demo Estimator', g);
/* 2) re-imported with a NEW id (same inbox item), the incoming copy without them */
await A.ev(B => window._setLeads(p => p.filter(l => l.id !== 'LEADIN-kp1').concat([Object.assign({}, B, { id: 'LEADIN-kp1-new', inboxId: 'LI-kp1', inboxRev: 2, stage: 'New Lead', inboxState: 'new', updatedAt: new Date().toISOString() })])), base);
await waitFor(A, () => { const l = window._crm.leads.find(x => x.id === 'LEADIN-kp1-new'); return l && l.priority === 8 ? 1 : null; }, null, 15000);
g = await get('LEADIN-kp1-new');
ok('re-imported with a new id → still priority 8, its stage and estimator', g && g.p === 8 && g.st === 'Bid Submitted' && g.est === 'Demo Estimator', g);
/* 3) the import path itself: fromItem(item, a stale copy) keeps them */
const fi = await A.ev(B => { const it = { id: 'LI-kp1', rev: 3, title: B.name, city: B.city, gc: B.gc, bidDue: B.bidDue, type: 'commercial', status: 'assigned', estimator: 'Someone Else' }; const l = window._gcLeadInbox._test.fromItem(it, Object.assign({}, B, { id: 'LEADIN-kp1', inboxId: 'LI-kp1', stage: 'New Lead' })); return { p: l.priority, st: l.stage, est: l.estimator }; }, base);
ok('the Lead Inbox import (fromItem) on a stale copy keeps priority / stage / estimator (the incoming estimator does not win)', fi.p === 8 && fi.st === 'Bid Submitted' && fi.est === 'Demo Estimator', fi);
/* 4) a person's newer change still wins */
await A.ev(() => window._gcLeadPriority.set('LEADIN-kp1-new', 5)); await sleep(4500);
g = await get('LEADIN-kp1-new');
ok('a person sets 5 later → 5 stays (newest time wins)', g && g.p === 5, g);
/* 5) BIDMERGE: the copy that carried the priority is merged away → the keeper takes it */
const mg = await A.ev(() => { const C = window._gcBidMergeCore; const a = { id: 'K1', name: 'Demo Gym', receivedAt: '2026-11-01T00:00:00Z' }, b = { id: 'K2', name: 'Demo Gym', priority: 9, prioritySetAt: '2026-11-10T00:00:00Z', notSameAs: ['X1'], alsoCos: ['environmental'], alsoCosAt: '2026-11-10T00:00:00Z' }; const k = C.mergeLeads(a, [b]); return { p: k.priority, n: k.notSameAs, a: k.alsoCos }; });
ok('BIDMERGE merge keeps the merged copy\'s priority, Different-jobs and Also-on', mg.p === 9 && mg.n.join() === 'X1' && mg.a.join() === 'environmental', mg);
/* 6) another computer, empty storage, an old copy of the list: it puts them back from the shared record */
await sleep(3000);
const B = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
await signIn(B, 'wjohnson@grayco-cs.com', 15000); await sleep(4000);
await B.ev(Bs => window._setLeads(p => p.map(l => l.id !== 'LEADIN-kp1-new' ? l : Object.assign({}, l, { priority: undefined, prioritySetAt: undefined, stage: 'New Lead', stageChangedAt: undefined, estimator: '', assignedAt: undefined, updatedAt: new Date().toISOString() }))), base);
await waitFor(B, () => { const l = window._crm.leads.find(x => x.id === 'LEADIN-kp1-new'); return l && l.priority === 5 ? 1 : null; }, null, 20000);
g = await B.ev(() => { const l = window._crm.leads.find(x => x.id === 'LEADIN-kp1-new'); return l ? { p: l.priority, st: l.stage, est: l.estimator } : null; });
ok('another computer with a copy that lost them → back from the shared record (5, Bid Submitted, Demo Estimator)', g && g.p === 5 && g.st === 'Bid Submitted' && g.est === 'Demo Estimator', g);
/* 7) seed from an older copy (a backup): only stamped / logged values, nothing invented */
const sd = await A.ev(() => { const n = window._gcLeadKeep.seed([{ id: 'LEADIN-old9', inboxId: 'LI-old9', name: 'Demo Old Bid', activity: [{ type: 'priority', text: 'Priority 6 → 7', at: '2026-11-11T10:00:00Z' }] }, { id: 'LEADIN-old10', inboxId: 'LI-old10', name: 'Demo Unset Bid', priority: 'Medium' }]); const r = window._gcLeadKeep.data().recs; const a = r.find(x => x.k.includes('ib:LI-old9')), b = r.find(x => x.k.includes('ib:LI-old10')); return { n, a: a && a.f.prio && a.f.prio.v, b: b ? Object.keys(b.f) : null }; });
ok('seed(old copy): a logged "Priority 6 → 7" is kept (7); a "Medium" with no record is not turned into a number', sd.a === 7 && (!sd.b || !sd.b.includes('prio')), sd);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('LEADKEEP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
