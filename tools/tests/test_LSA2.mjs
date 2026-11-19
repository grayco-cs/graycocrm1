// test_LSA2.mjs <build-dir> [shot-dir] — patch LSA2 (owner's 11/15 list, item 4). Made-up data only; fake Supabase; offline harness.
//   A. node: LSADEDUPE (website-intake fileLead) — the same Google LSA lead again (same phone, or the same Google lead id in the link)
//      is folded into the first (🔁 note, lsaRepeats) and is not a second lead; another phone + another id → a new lead; a NON-LSA lead
//      with the same phone is still its own lead; the weekly report leaves pending / bad LSA leads out of "new leads".
//   B. the CRM: LSACOUNT (_gcLsaPend; Leads "New today · N this week" and the TV / Field numbers leave pending / bad LSA out, a good one
//      counts), LSANUDGE retired by LSAFLOW2 (silence = good — no nag), LSADISPUTE2 (2 days before the 30 days; ✓ Disputed in Ads on the lead's bar
//      writes it and closes both To-Dos; a ticked "⚖️ Dispute" To-Do counts too), LSAPANEL (📊 LSA by month numbers).
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

/* ════ A ════ */
{
  const DB = { gc_kv: new Map(), gc_lead_inbox_kv: new Map(), gc_staff: new Map() }; let tk = 0;
  const stamp = () => new Date(Date.now() + (++tk) * 1000).toISOString();
  const resp = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => 'application/json' } });
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc', BID_ALERTS_OFF: '1', LEAD_INTAKE_ALERTS: '0' });
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    init = init || {}; const u = String(url), M = (init.method || 'GET').toUpperCase();
    const m = /\/rest\/v1\/([a-z_]+)(\?(.*))?$/.exec(u); if (!m) return resp(404, {});
    const t = m[1], q = new URLSearchParams(m[3] || ''); const T = DB[t]; if (!T) return resp(200, []);
    const keyEq = (q.get('key') || '').replace(/^eq\./, '');
    if (M === 'GET') return resp(200, keyEq ? (T.has(keyEq) ? [T.get(keyEq)] : []) : [...T.values()].slice(0, 1));
    if (M === 'PATCH') { const at = (q.get('updated_at') || '').replace(/^eq\./, ''), cur = T.get(keyEq); if (!cur || cur.updated_at !== at) return resp(200, []); const b = JSON.parse(init.body); T.set(keyEq, { key: keyEq, value: b.value, updated_at: stamp() }); return resp(200, [T.get(keyEq)]); }
    if (M === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => T.set(r.key, { key: r.key, value: r.value, updated_at: stamp() })); return resp(201, []); }
    return resp(200, []);
  };
  const WI = require(path.join(BUILD, 'netlify/functions/website-intake.js'))._lib;
  const LSA = link => ({ customer: null, source: 'Google LSA', leadExtra: { mkSource: 'Google Ads', leadSource: 'Google LSA', lsaCheck: 'pending', lsaLink: link } });
  const a = await WI.fileLead({ type: 'estimate', name: 'Zedd Demo', phone: '9015550191', message: 'Leak over the kitchen' }, Object.assign({ sid: 'lsa-a' }, LSA('https://ads.google.com/localservices/lead/ZZLEAD001?x=1')));
  const b = await WI.fileLead({ type: 'estimate', name: 'Zedd Demo', phone: '(901) 555-0191', message: 'They also sent a message: please call after 3' }, Object.assign({ sid: 'lsa-b' }, LSA('')));
  const c = await WI.fileLead({ type: 'estimate', name: 'Zedd D.', phone: '9015550999', message: 'call from another phone' }, Object.assign({ sid: 'lsa-c' }, LSA('https://ads.google.com/localservices/lead/ZZLEAD001')));
  const d = await WI.fileLead({ type: 'estimate', name: 'Dee Demo', phone: '9015550192', message: 'Gutters' }, Object.assign({ sid: 'lsa-d' }, LSA('https://ads.google.com/localservices/lead/ZZLEAD002')));
  const e = await WI.fileLead({ type: 'estimate', name: 'Zedd Demo', phone: '9015550191', message: 'website form too' }, { customer: null, sid: 'web-e' });
  const items = DB.gc_lead_inbox_kv.get('gc_lead_inbox').value;
  const first = items.find(x => x.id === a.id);
  ok('A1 the first LSA lead is added', a.action === 'added');
  ok('A1 the same phone again (another e-mail) → folded into the first, not a new lead', b.action === 'merged' && b.id === a.id && !items.some(x => x.id === b.mergedFrom), b);
  ok('A1 another phone but the same Google lead id → folded in too', c.action === 'merged' && c.id === a.id, c);
  ok('A1 the first lead has the 🔁 notes and lsaRepeats 2', first && first.leadExtra.lsaRepeats === 2 && first.notes.filter(n => /🔁 Same Google LSA lead again/.test(n)).length === 2 && first.notes.some(n => /please call after 3/.test(n)), first && { r: first.leadExtra.lsaRepeats, n: first.notes });
  ok('A1 another phone + another id → its own lead', d.action === 'added' && d.id !== a.id);
  ok('A1 a website (not LSA) lead with the same phone is still its own lead', e.action === 'added' && e.id !== a.id);
  ok('A1 3 leads in the inbox (not 5)', items.filter(x => !x.stub).length === 3, items.map(x => x.id));
  global.fetch = realFetch;
  const SR = fs.readFileSync(path.join(BUILD, 'netlify/functions/scheduled-reports.js'), 'utf8');
  ok('A2 the weekly report leaves pending / bad LSA leads out of new leads', /const newLeads = leads\.filter\(function\(l\)\{return \(l\.date\|\|l\.created\|\|''\) >= weekAgoStr && !lsaPend\(l\);\}\);/.test(SR) && /c !== 'good'/.test(SR));
}

/* ════ B ════ */
const { computer, signIn, sleep, cset, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
const base = { source: 'Google LSA', leadSource: 'Google LSA', stage: 'New Lead', status: 'new' };
cset('leads', [
  Object.assign({ id: 'G1', name: 'Zedd Pending', phone: '9015550181', lsaCheck: 'pending', pm: 'Demo PM', assignedTo: 'Demo PM', assignedAt: ago(26), createdAt: ago(27), updatedAt: ago(26) }, base),
  Object.assign({ id: 'G2', name: 'Demo Good', phone: '9015550182', lsaCheck: 'good', pm: 'Demo PM', assignedAt: ago(30), createdAt: ago(30), updatedAt: ago(20) }, base),
  Object.assign({ id: 'G3', name: 'Demo Bad', phone: '9015550183', lsaCheck: 'bad', lsaReason: 'Spam / robocall', lsaDecidedAt: ago(29 * 24), stage: 'Lost', status: 'lost', lostReason: 'LSA — not a real lead (Spam)', createdAt: ago(29 * 24 + 2), updatedAt: ago(29 * 24) }, Object.assign({}, base, { stage: 'Lost', status: 'lost' })),
  Object.assign({ id: 'G4', name: 'Demo Fresh', phone: '9015550184', lsaCheck: 'pending', pm: 'Demo PM', assignedTo: 'Demo PM', assignedAt: ago(3), createdAt: ago(3), updatedAt: ago(3) }, base),
  { id: 'W1', name: 'Demo Website', phone: '9015550185', source: 'Website', stage: 'New Lead', status: 'new', createdAt: ago(5), updatedAt: ago(5) }]);
cset('gc_office_tasks', [{ id: 'LSADISPUTE_G3', kind: 'lsa_dispute', leadId: 'G3', label: '⚖️ Dispute Demo Bad in Google Ads by 12/1', done: false, addedAt: ago(29 * 24), updatedAt: ago(29 * 24) }]);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up', !!await wait(() => window._gcLsa2 && window._gcLsaPend && (window._crm.leads || []).length >= 5, null, 60000));
const P = await A.ev(() => window._crm.leads.map(l => l.id + ':' + window._gcLsaPend(l)).join(','));
ok('B1 counted: the good LSA lead and the website lead; NOT the pending (old or fresh) or the bad one', P === 'G1:true,G2:false,G3:true,G4:true,W1:false', P);
const tvw = await A.ev(() => { try { return window._gcA8.tvNumbers({ adm: true }).newWeek; } catch (e) { return 'err ' + e.message; } });
ok('B1 the TV / Field "New leads" (last 7 days): 2 — the good LSA lead + the website lead', tvw === 2, tvw);
await A.ev(() => { if (window._setView) window._setView('leads'); }); await sleep(3500);
const kpi = await wait(() => { const k = document.querySelector('[data-gcl-kpi="today"]'); return k ? k.textContent : null; }, null, 8000);
if (kpi) ok('B1 Leads "New today · N this week": 2 this week (G2, W1), 1 today (W1)', /^\s*1\s*New today · 2 this week/.test(kpi.replace(/\s+/g, ' ').trim()), kpi);
else ok('B1 Leads "New today · this week" (the KPI row is not drawn on this screen — its code leaves pending / bad LSA out) [source]', fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8').includes("week = all.filter(function(l){ return born(l) >= wk && !(window._gcLsaPend && window._gcLsaPend(l)); }).length;"));
/* LSANUDGE + LSADISPUTE2 */
await A.ev(() => window._gcLsa2.sweep());
let T = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').map(t => ({ id: t.id, l: t.label, a: t.assignee, d: t.done })));
const g = id => T.find(t => t.id === id);
ok('B2 LSAFLOW2 (silence = good): no 24-hour nudge for the PM, not even on the lead given 26 h ago', !T.some(t => /^LSANUDGE_/.test(t.id)), T);
ok('B3 ⏰ 2 days left to dispute the bad lead decided 29 days ago', g('LSADISPUTE2_G3') && /2 days left to dispute Demo Bad in Google Ads/.test(g('LSADISPUTE2_G3').l), T);
await A.ev(() => window._setLeads(prev => prev.map(l => l.id === 'G1' ? Object.assign({}, l, { lsaCheck: 'pm_good', lsaPmBy: 'Demo PM' }) : l))); await sleep(600);
await A.ev(() => window._gcLsa2.sweep());
T = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').map(t => ({ id: t.id, d: t.done })));
ok('B2 still no nudge after the PM marks it', !T.some(t => /^LSANUDGE_/.test(t.id)), T);
/* ✓ Disputed in Ads on the lead's bar */
await A.ev(() => window._gcLeadsHub.open('G3'));
const btn = await wait(() => !!document.querySelector('#gc-lsa-dispute [data-lsa2="btn"]'), null, 8000);
ok('B4 the bad lead\'s 📍 Google LSA bar has "✓ Disputed in Ads"', btn === true);
await shot(A, 'b4_bar');
await A.ev(() => document.querySelector('#gc-lsa-dispute [data-lsa2="btn"]').click()); await sleep(1200);
const st = await A.ev(() => ({ l: window._crm.leads.find(x => x.id === 'G3').lsaDisputedAt, t: JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => /G3$/.test(t.id)).map(t => t.id + ':' + t.done).join(','), bar: (document.querySelector('#gc-lsa-dispute [data-lsa2]') || {}).textContent }));
ok('B4 pressed → written on the lead, both dispute To-Dos closed, the bar says ✓ Disputed in Ads <date>', !!st.l && st.t === 'LSADISPUTE_G3:true,LSADISPUTE2_G3:true' && /✓ Disputed in Ads \d+\/\d+/.test(st.bar || ''), st);
/* 📊 LSA by month */
const M = await A.ev(() => window._gcLsa2.months(2));
const cur = M[0];
ok('B5 📊 this month: 3 LSA leads (G1, G2, G4), 1 good, 2 pending; last month: 1 bad, 1 disputed', (cur.n === 3 && cur.good === 1 && cur.pending === 2 && M[1].bad === 1 && M[1].disputed === 1) || (M.reduce((n, m) => n + m.n, 0) === 4 && M.reduce((n, m) => n + m.disputed, 0) === 1), M.map(m => [m.key, m.n, m.good, m.bad, m.pending, m.disputed]));
await A.ev(() => window._gcLeadsHub.close && window._gcLeadsHub.close()); await sleep(500);
const pb = await wait(() => !!document.getElementById('gc-lsa2-btn'), null, 6000);
ok('B5 the 📊 LSA by month button is on the Leads views row', pb === true);
await A.ev(() => document.getElementById('gc-lsa2-btn').click());
const ptxt = await wait(() => { const o = document.getElementById('gc-lsa2-ov'); return o && o.textContent; }, null, 5000);
ok('B5 the panel shows the months table and "Still to dispute (0)"', /Google LSA leads by month/.test(ptxt || '') && /Still to dispute \(0\)/.test(ptxt || ''), ptxt && ptxt.slice(0, 300));
await shot(A, 'b5_panel');
ok('B6 no page errors', A.errs.length === 0, A.errs);
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
