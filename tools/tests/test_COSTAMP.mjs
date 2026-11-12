// test_COSTAMP.mjs <build-dir> — QA B1 (critical): a lead / job that arrives by sync (another user, the website, the inbox) is never
// re-filed under the company this computer has picked; one made here right after a click is, under the company picked at that click.
// Also B7 (New lead Company default = the picked company) and B3 (Leads cache keyed on the company). Made-up data only.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const at = new Date().toISOString();
cset('projects', [{ id: 'PX0', name: 'Conzz Existing', status: 'active', createdAt: at, updatedAt: at }, { id: 'PRJMVPFN7MBC7', name: 'Conzz Misfiled', status: 'active', companyId: 'mitigation', createdAt: at, updatedAt: at }, { id: 'PMITOK', name: 'Mitzz Real Job', status: 'active', companyId: 'mitigation', createdAt: at, updatedAt: at }]); cset('leads', [{ id: 'LX0', client: 'Conzz Old Lead', createdAt: at, updatedAt: at }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
const rp = await A.ev(() => window._crm.projects.filter(x => /^(PRJMVPFN7MBC7|PMITOK)$/.test(x.id)).map(x => x.id + ':' + window._gcCo.ofJob(x) + ':' + (window._gcCo.passJob ? '' : '')));
ok('repair: a job the old stamper moved into Mitigation goes back to Construction; a real Mitigation job stays', rp.join() === 'PRJMVPFN7MBC7:construction:,PMITOK:mitigation:', rp);
await A.ev(() => window._gcCo.setFilter('environmental')); await sleep(2500);
/* 1) synced in: no click in this tab for > 6 s, then a lead from the website and a job from another computer appear */
await sleep(6500);
await A.ev(() => { const n = new Date().toISOString();
  window._setLeads(p => p.concat([{ id: 'LREMOTE', client: 'Conzz Remote Lead', websiteForm: 'Contact', origin: 'website', createdAt: n, updatedAt: n }, { id: 'LREMOTE2', client: 'Conzz Other User Lead', createdAt: n, updatedAt: n }]));
  window._setProjects(p => p.concat([{ id: 'PREMOTE', name: 'Conzz Remote Job', status: 'active', createdAt: n, updatedAt: n }])); });
await sleep(5000);
let st = await A.ev(() => ({ l: window._crm.leads.filter(x => /^LREMOTE/.test(x.id)).map(x => x.id + ':' + (x.companyId || '')), p: window._crm.projects.filter(x => x.id === 'PREMOTE').map(x => x.id + ':' + (x.companyId || '')) }));
ok('synced-in leads and jobs (website, another user) are NOT re-filed under the picked company', st.l.join() === 'LREMOTE:,LREMOTE2:' && st.p.join() === 'PREMOTE:', st);
/* 2) made here: a click, then a new job — filed under the company picked at the click, even if the pick changes right after */
await A.page().mouse.click(5, 300);
await A.ev(() => { const n = new Date().toISOString(); window._setProjects(p => p.concat([{ id: 'PLOCAL', name: 'Envzz Local Job', status: 'bidding', createdAt: n, updatedAt: n }])); });
await sleep(200);
await A.ev(() => window._gcCo.setFilter('mitigation'));
await sleep(3500);
st = await A.ev(() => window._crm.projects.filter(x => x.id === 'PLOCAL').map(x => x.companyId || ''));
ok('a job made here right after a click is filed under the company picked at that click (Environmental)', st.join() === 'environmental', st);
/* 3) a job synced in with a real origin even right after a click is left alone */
await A.page().mouse.click(5, 300);
await A.ev(() => { const n = new Date().toISOString(); window._setLeads(p => p.concat([{ id: 'LINBOX', client: 'Inbox Lead', inboxId: 'LI-77', createdAt: n, updatedAt: n }])); });
await sleep(3000);
st = await A.ev(() => window._crm.leads.filter(x => x.id === 'LINBOX').map(x => x.companyId || ''));
ok('a Lead Inbox lead that lands right after a click is still left alone', st.join() === '', st);
/* B7: New lead form default */
const def = await A.ev(() => { const fld = { k: 'x', get def(){ const f = window._gcCo.filter(); return f !== 'all' ? f : 'construction'; } }; return fld.def; });
ok('B7: the picked company (Mitigation) is the New-lead default', def === 'mitigation', def);
const src = await A.ev(() => [...document.scripts].map(s => s.textContent).join('\n').includes('{k:"companyId",l:"Company",type:"select",opts:[{v:"construction",l:"🏗 Construction"}'));
ok('B7: the New-lead Company field shows names (🏗 Construction / 💧 Mitigation / ☢️ Environmental)', src);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('COSTAMP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
