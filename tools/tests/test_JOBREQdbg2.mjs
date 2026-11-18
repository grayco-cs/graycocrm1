import path from 'path';
const BUILD = path.resolve(process.argv[2] || '.');
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, resetCloud } = H;
const now = new Date().toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Manager', active: true }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'PJ', name: 'Demo kitchen job', type: 'Kitchen', client: 'C', address: '1 Demo St', status: 'active', pct: 0, pm: 'Demo PM', createdAt: now, updatedAt: now }]);
for (const em of ['office@grayco-cs.com', 'wjohnson@grayco-cs.com']) {
  const A = await computer(em, { build: BUILD });
  await signIn(A, em, 20000);
  for (let i = 0; i < 6; i++) {
    console.log('DBG', em, i, JSON.stringify(await A.ev(em => ({ meU: window._gcMeUser && window._gcMeUser(), meNow: window._gcMeNow, gu: localStorage.getItem('grayco_user'), us: (window._crm.users || []).filter(u => u && /office|wjohnson/i.test(u.email || '')).map(u => [u.id, u.name, u.email, u.role]), jr: window._gcJobReq && window._gcJobReq.canAdd && null }), em)).slice(0, 900));
    await sleep(4000);
  }
  await A.close();
}
process.exit(0);
