// test_SUBPORTAL5.mjs <build-dir> [shot-dir] — patch SUBPORTAL5: SUBCONFIRM (11/15 list 5.1) + SCOPEVER (5.1b). Made-up data only; offline.
//   A. node: _lib/scopediff.js (added / taken out / qty change / included text; words only); the portal's scope card and scopeOut wiring.
//   B. the CRM: 👷 Confirm subs on jobs — offers a sub invoice / an agreement / a schedule vendor link once, never adds by itself; the
//      ticked ones go on the job as Awarded; "Not on this job" is never offered again; a sub already on the job is never offered; the
//      ✅ To-Do count. 🔄 the next send to a sub carries "Scope updated (v1 → v2) — what changed"; 📝 "Proposal changed — review
//      <sub>'s scope?" To-Do when the estimate is saved after the send; ticking it settles it.
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

/* ════ A ════ */
{
  const SD = require(path.join(BUILD, 'netlify/functions/_lib/scopediff.js'));
  const v1 = { lines: [{ room: 'Kitchen', desc: 'Hang 1/2 in drywall', qty: 40, unit: 'sheets' }, { room: 'Kitchen', desc: 'Tape and finish level 4', qty: 1, unit: 'ls' }, { desc: 'Patch hallway', qty: 2, unit: 'ea' }], included: 'Labor', excluded: '' };
  const v2 = { lines: [{ room: 'Kitchen', desc: 'Hang 1/2 in drywall', qty: 48, unit: 'sheets' }, { room: 'Kitchen', desc: 'Tape and finish level 4', qty: 1, unit: 'ls' }, { room: 'Bath', desc: 'Moisture board in the bath', qty: 6, unit: 'sheets' }], included: 'Labor and screws', excluded: '' };
  const c = SD.diff(v1, v2);
  ok('A1 added / taken out / qty changed / included changed', c.any && c.added[0] === 'Moisture board in the bath — 6 sheets' && c.removed[0] === 'Patch hallway' && /Hang 1\/2 in drywall: qty 40 sheets → 48 sheets/.test(c.changed[0]) && c.other.includes('What is included changed') && c.changed.length === 1, c);
  ok('A1 the same scope twice → nothing changed', SD.diff(v2, v2).any === false);
  const t = SD.text(c, 1, 2);
  ok('A1 the message text: "🔄 Scope updated (v1 → v2) — what changed:" + lines, no $', /^🔄 Scope updated \(v1 → v2\) — what changed:\n\+ Added: Moisture board/.test(t) && /− Taken out: Patch hallway/.test(t) && !/\$/.test(t), t);
  const PA = fs.readFileSync(path.join(BUILD, 'netlify/functions/portal-access.js'), 'utf8'), AP = fs.readFileSync(path.join(BUILD, 'portal-app.js'), 'utf8');
  ok('A2 the portal: scopeOut sends changes (from the version before, cleaned), the scope card shows them (EN + ES)', /changes: scopeChanges\(x\) \};/.test(PA) && /require\('\.\/_lib\/scopediff\.js'\)\.diff\(prev\.data, x\.data \|\| \{\}\)/.test(PA) && /data-scope-upd/.test(AP) && /scopeUpd: '🔄 Scope updated — what changed'/.test(AP) && /scopeUpd: '🔄 Alcance actualizado/.test(AP));
}

/* ════ B ════ */
const { computer, signIn, sleep, cset, cget, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 5 * 864e5).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('vendors', [{ id: 'S1', name: 'Zedd Drywall LLC', trade: 'Drywall', isSub: true, email: 'zedd@drywall.test' }, { id: 'S2', name: 'Demo Paint Co', trade: 'Paint', isSub: true }, { id: 'S3', name: 'Dee Electric', trade: 'Electrical', isSub: true }, { id: 'V9', name: 'Demo Lumber Yard', isSub: false }]);
cset('projects', [
  { id: 'P1', name: 'Zedd Demo Kitchen', client: 'Zedd Demo', clientPhone: '9015550111', address: '1 Demo St', status: 'active', pm: 'Demo PM', autoPO: 'T701', subs: [{ name: 'Dee Electric', subId: 'S3', trade: 'Electrical', status: 'Awarded' }], createdAt: at, updatedAt: at,
    subAgreements: [{ id: 'AG1', sub: 'Demo Paint Co', amount: 2200, status: 'sent' }] },
  { id: 'P2', name: 'Demo Bath', client: 'Dot Demo', clientPhone: '9015550112', address: '2 Demo Ave', status: 'active', pm: 'Demo PM', autoPO: 'T702', subs: [], createdAt: at, updatedAt: at }]);
cset('invs', [{ id: 'I1', type: 'sub', sub: 'Zedd Drywall LLC', subId: 'S1', pid: 'P1', invNum: '1001', amt: 1800, status: 'received', date: at.slice(0, 10) },
  { id: 'I2', type: 'sub', sub: 'Dee Electric', subId: 'S3', pid: 'P1', invNum: '77', amt: 900, status: 'received', date: at.slice(0, 10) },
  { id: 'I3', type: 'client', pid: 'P2', amt: 5000, status: 'sent', date: at.slice(0, 10) }]);
cset('schedule', [{ id: 'SC1', pid: 'P2', title: 'Drywall hang', vendor: 'Zedd Drywall LLC', date: '2026-11-20', scope: 'company' }, { id: 'SC2', pid: 'P2', title: 'Lumber drop', vendor: 'Demo Lumber Yard', date: '2026-11-18', scope: 'company' }]);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up', !!await wait(() => window._gcSubConfirm && window._gcScopeDiff && window._gcScopeVer && (window._crm.projects || []).length >= 2 && (window._crm.invoices || []).length >= 3 && (window._crm.schedule || []).length >= 2, null, 60000));
let L = await A.ev(() => window._gcSubConfirm.list().map(x => x.pid + ':' + x.subId + ':' + x.why.join('+')).sort());
ok('B1 offered: Zedd Drywall on P1 (its invoice), Demo Paint on P1 (agreement), Zedd Drywall on P2 (schedule); not Dee Electric (already on P1), not the lumber yard (not a sub)',
  JSON.stringify(L) === JSON.stringify(['P1:S1:🧾 sub invoice #1001', 'P1:S2:📝 sub agreement', 'P2:S1:📅 on the schedule 11/20']), L);
ok('B1 nothing was added by itself', await A.ev(() => window._crm.projects.find(p => p.id === 'P1').subs.length === 1 && window._crm.projects.find(p => p.id === 'P2').subs.length === 0));
await A.ev(() => window._gcSubConfirm.sweep()); await sleep(300);
const td = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').find(t => t.id === 'SUBCONFIRM'));
ok('B2 ✅ one To-Do "👷 3 subs to confirm on their jobs" (kind sub_confirm)', td && td.label === '👷 3 subs to confirm on their jobs' && td.kind === 'sub_confirm' && !td.done, td);
await A.ev(() => window._gcSubConfirmSheet());
await wait(() => document.querySelectorAll('#gc-sc-ov [data-sc-row]').length === 3);
await shot(A, 'b2_sheet');
/* P2 / Zedd: "Not on this job"; P1 / Paint: untick; confirm the rest (P1 / Zedd) */
await A.ev(() => { document.querySelector('#gc-sc-ov [data-sc-row][data-pid="P2"][data-sub="S1"] [data-sc="no"]').click(); document.querySelector('#gc-sc-ov [data-sc-row][data-pid="P1"][data-sub="S2"] [data-sc-tick]').checked = false; });
await A.ev(() => document.querySelector('#gc-sc-ov [data-sc="ok"]').click());
const on = await wait(() => { const p = window._crm.projects.find(x => x.id === 'P1'); return p.subs.length === 2 ? p.subs : null; });
ok('B3 the ticked one is on its job as Awarded (subId, via "confirmed — sub invoice #1001")', on && on.some(r => r.subId === 'S1' && r.status === 'Awarded' && /confirmed — sub invoice #1001/.test(r.via) && r.name === 'Zedd Drywall LLC'), on);
L = await A.ev(() => window._gcSubConfirm.list().map(x => x.pid + ':' + x.subId));
ok('B3 left: only the unticked Paint agreement (the "Not on this job" one is never offered again)', JSON.stringify(L) === JSON.stringify(['P1:S2']), L);
ok('B3 "Not on this job" is remembered (gc_kv gc_subconfirm_no)', await A.ev(() => !!JSON.parse(localStorage.getItem('gc_subconfirm_no') || '{}')['P2|S1']));
/* 🔄 the next send carries what changed */
const fs1 = await A.ev(() => { const d = { id: 'SCS_1', kind: 'sub', pid: 'P1', title: 'Drywall', version: 2, lines: [{ sec: 'Kitchen', desc: 'Hang 1/2 in drywall', qty: 48, unit: 'sheets' }, { sec: 'Bath', desc: 'Moisture board in the bath', qty: 6, unit: 'sheets' }], included: 'Labor', excluded: '', notes: '',
  sends: [{ ok: true, subId: 'S1', subName: 'Zedd Drywall LLC', version: 1, at: new Date(Date.now() - 3 * 864e5).toISOString(), ls: { lines: [{ sec: 'Kitchen', desc: 'Hang 1/2 in drywall', qty: 40, unit: 'sheets' }, { sec: 'Kitchen', desc: 'Patch hallway', qty: 2, unit: 'ea' }], included: 'Labor', excluded: '', notes: '' } }] };
  return { s1: window._gcScopeDiff.forSub(d, 'S1'), s3: window._gcScopeDiff.forSub(d, 'S3'), same: window._gcScopeDiff.forSub(Object.assign({}, d, { version: 1 }), 'S1') }; });
ok('B4 the next send to Zedd: "🔄 Scope updated (v1 → v2) — what changed" + added / taken out / qty', /^🔄 Scope updated \(v1 → v2\) — what changed:/.test(fs1.s1) && /\+ Added: Moisture board in the bath — 6 sheets/.test(fs1.s1) && /− Taken out: Patch hallway/.test(fs1.s1) && /qty 40 sheets → 48 sheets/.test(fs1.s1), fs1);
ok('B4 a sub who never got it → no change text; the same version again → none', fs1.s3 === '' && fs1.same === '', fs1);
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
ok('B4 SCOPESEND puts it on top of the portal message and the e-mail, and keeps a copy of what was sent on each send', html.includes("var chg = (W._gcScopeDiff && W._gcScopeDiff.forSub ? W._gcScopeDiff.forSub(d, c.id) : ''); return fn('portal-access', { action: 's-send'") && html.includes("html: (chg ? '<div") && html.includes('{ ls: W._gcScopeDiff.compact(d) }'));
/* 📝 Proposal changed */
const sentAt = new Date(Date.now() - 2 * 864e5).toISOString(), estAt = new Date(Date.now() - 864e5).toISOString();
await A.ev(([sentAt]) => window.idbSet('scopes', [{ id: 'SCS_9', kind: 'sub', pid: 'P1', title: 'Drywall', version: 1, lines: [], sends: [{ ok: true, subId: 'S1', subName: 'Zedd Drywall LLC', version: 1, at: sentAt }] }]), [sentAt]);
await A.ev(([estAt]) => { const E = { id: 'E1', name: 'Zedd Demo Kitchen — estimate', pid: 'P1', status: 'Draft', lines: [], savedAt: estAt, updatedAt: estAt }; if (window._gcEST && window._gcEST.all) { try { window._gcEstimatesState = (window._gcEST.all() || []).concat([E]); } catch (e) {} } window.__zzE = E; }, [estAt]);
const flags = await A.ev(() => { const orig = window._gcEST && window._gcEST.all; if (window._gcEST) window._gcEST.all = () => (orig ? (orig() || []) : []).concat([window.__zzE]); else window._gcEST = { all: () => [window.__zzE] }; return window._gcScopeVer.sweep(); });
let T = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^SCOPEREVIEW_/.test(t.id)));
ok('B5 the estimate saved after the scope went to Zedd → "📝 Proposal changed — review Zedd Drywall LLC\'s scope?" for the PM (kind scope_review)', T.length === 1 && /📝 Proposal changed — review Zedd Drywall LLC's scope\? \(Drywall — Zedd Demo Kitchen\)/.test(T[0].label) && T[0].assignee === 'Demo PM' && T[0].kind === 'scope_review' && !T[0].done, { flags, T });
ok('B5 nothing was sent by itself (no portal send / scope save / e-mail)', !A.fn.some(c => c.name === 'send-email' || (c.name === 'portal-access' && c.body && /s-send|s-scope-save/.test(String(c.body.action)))), A.fn.filter(c => /portal-access|send-email/.test(c.name)).map(c => c.name + ':' + (c.body && c.body.action)));
await A.ev(() => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); l.forEach(t => { if (/^SCOPEREVIEW_/.test(t.id)) { t.done = true; t.doneAt = new Date().toISOString(); } }); localStorage.setItem('gc_office_tasks', JSON.stringify(l)); });
await A.ev(() => window._gcScopeVer.sweep()); await sleep(200);
T = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /^SCOPEREVIEW_/.test(t.id)).map(t => t.done));
ok('B5 ticked → settled (stays done until the estimate changes again)', JSON.stringify(T) === '[true]', T);
/* BIDMULTI: 🏆 Award on the bid portal (with the job picked) puts that sub on the job */
const ab = await A.ev(() => Promise.all([window._gcSubConfirm.addBid('P2', { company: 'Demo Paint Co', email: '', trade: 'Paint' }), window._gcSubConfirm.addBid('P2', { company: 'Nobody Bidder LLC', email: 'nobody@bidder.test' })]).then(r => ({ r, subs: window._crm.projects.find(p => p.id === 'P2').subs })));
ok('B7 an awarded bid puts the sub on the job (Awarded, "bid awarded"); a bidder who is not a CRM sub is not made one', ab.r[0] === 1 && ab.r[1] === 0 && ab.subs.length === 1 && ab.subs[0].subId === 'S2' && ab.subs[0].status === 'Awarded' && /bid awarded/.test(ab.subs[0].via), ab);
ok('B6 no page errors', A.errs.length === 0, A.errs);
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
