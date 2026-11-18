import path from 'path';
const BUILD = path.resolve(process.argv[2] || '.');
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, cget, resetCloud, writes } = H;
const now = new Date().toISOString();
resetCloud();
cset('users', [{ id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Manager', active: true }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'PJ', name: 'Demo kitchen job', type: 'Kitchen', client: 'C', address: '1 Demo St', status: 'active', pct: 0, pm: 'Demo PM', createdAt: now, updatedAt: now }]);
const A = await computer('office@grayco-cs.com', { build: BUILD });
await signIn(A, 'office@grayco-cs.com', 20000);
for (let i = 0; i < 60; i++) { if (await A.ev(() => !!(window._gcJobReq && window._crm && (window._crm.projects||[]).length))) break; await sleep(500); }
await sleep(3000);
const w0 = writes.length;
console.log('DBG before', JSON.stringify(cget('projects')).slice(0, 300));
const r = await A.ev(() => window._gcJobReq.add('PJ', { kind: 'fill', label: 'Gate code', party: 'customer', act: 'fill', due: 'start' }));
console.log('DBG add', JSON.stringify(r).slice(0, 200));
for (let i = 0; i < 20; i++) { await sleep(1000); const p = (cget('projects') || []).find(x => x.id === 'PJ'); if (p && p.jobDocs && p.jobDocs.extra) { console.log('DBG cloud has extra after', i + 1, 's'); break; } }
console.log('DBG writes', JSON.stringify(writes.slice(w0).map(w => [w.key, w.len, w.same])).slice(0, 1500));
console.log('DBG local', JSON.stringify(await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'PJ'); return { extra: (p.jobDocs||{}).extra && p.jobDocs.extra.length, items: ((p.jobDocs||{}).items||[]).length, manual: window.__GC_MANUAL_AT__, now: Date.now() }; })));
console.log('DBG cloud', JSON.stringify((cget('projects') || []).map(p => [p.id, !!p.jobDocs, p.updatedAt])));
console.log('DBG errs', JSON.stringify(A.errs.slice(0, 10)).slice(0, 1500));
await A.close(); process.exit(0);
