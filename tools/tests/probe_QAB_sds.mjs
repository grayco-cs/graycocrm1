// probe: after a click in 🧪 Materials & SDS, does the left menu still open other tabs?
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, resetCloud } = H;
resetCloud(); cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'M1', name: 'Mitzz Ross', companyId: 'mitigation', status: 'active' }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
await A.ctx.addInitScript(() => { try { if (!sessionStorage.getItem('q')) { localStorage.setItem('gc_co_filter', 'mitigation'); sessionStorage.setItem('q', 1); } } catch (e) {} });
await signIn(A, 'wjohnson@grayco-cs.com', 14000); await sleep(5000);
await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); b && b.click(); }); await sleep(800);
const nav = l => A.ev(l => { const b = [...document.querySelectorAll('aside nav button, aside button, nav button')].find(x => x.offsetParent && x.innerText.replace(/\s+/g, ' ').trim() === l); if (b) b.click(); return !!b; }, l);
await nav('🧪 Materials & SDS'); await sleep(1500);
console.log('view', await A.ev(() => localStorage.getItem('grayco_view') + ' ' + location.hash));
await A.ev(() => { const b = [...document.querySelectorAll('#root main button')].find(x => /Fire & Smoke/.test(x.innerText)); b && b.click(); }); await sleep(1200);
console.log('after S700 click', await A.ev(() => localStorage.getItem('grayco_view') + ' ' + location.hash + ' dialogs:' + document.querySelectorAll('[role=dialog]').length));
await A.page().screenshot({ path: '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qab_shots/probe_sds_after_click.png' });
console.log('nav found', await nav('◫ Projects')); await sleep(1500);
console.log('after Projects nav (js click)', await A.ev(() => localStorage.getItem('grayco_view') + ' ' + location.hash));
const bb = await A.page().locator('aside button:has-text("Projects")').first().boundingBox().catch(() => null);
if (bb) { await A.page().mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(1500); }
console.log('after Projects nav (mouse)', await A.ev(() => localStorage.getItem('grayco_view') + ' ' + location.hash));
await A.page().screenshot({ path: '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qab_shots/probe_sds_after_nav.png' });
console.log('errs', A.errs);
await A.b.close(); process.exit(0);
