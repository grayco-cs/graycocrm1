// test_COSWITCH.mjs <build-dir> — owner 11/12: "let office and marketing switch between companies"; "office can have mit and env tab too".
// An office person and a marketing person can open the company switch (the sidebar logo) and pick Mitigation / Environmental; office then
// has the combined 💧 Mitigation tab. A field PM's menu is unchanged. Made-up people only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
const BUILD = process.argv[2];
async function run(role){
  resetCloud(); const at = new Date().toISOString();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Sam Demo', email: 'sbiffle@grayco-cs.com', role, active: true }]);
  cset('projects', [{ id: 'pc', name: 'Conzz Job', companyId: 'construction', status: 'Active', createdAt: at }, { id: 'pm', name: 'Mitzz Job', companyId: 'mitigation', status: 'Active', createdAt: at }]);
  const B = await computer('sbiffle@grayco-cs.com', { build: BUILD });
  const errs = []; B.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await signIn(B, 'sbiffle@grayco-cs.com', 15000); await sleep(5000);
  const sw = await B.ev(() => !!(document.querySelector('[data-gc-co-brand]') || document.getElementById('gc-co-sw')));
  ok(role + ': sees the company switch', sw);
  if (sw) { await B.ev(() => (document.querySelector('[data-gc-co-brand]') || document.querySelector('#gc-co-sw [data-co-menu]') || document.getElementById('gc-co-sw')).click()); await sleep(800); }
  const pop = await B.ev(() => { const p = document.getElementById('gc-co-pop'); return p ? p.innerText : ''; });
  ok(role + ': the switch opens with Mitigation and Environmental', /Mitigation/.test(pop) && /Environmental/.test(pop), pop.slice(0, 200));
  const pick = await B.ev(() => { const b = [...document.querySelectorAll('#gc-co-pop [data-co-f]')].find(x => x.getAttribute('data-co-f') === 'mitigation'); if (b) b.click(); return !!b; });
  await sleep(1500);
  ok(role + ': picks Mitigation', pick && await B.ev(() => window._gcCo.filter()) === 'mitigation', await B.ev(() => window._gcCo.filter()));
  const nav = await B.ev(() => [...document.querySelectorAll('nav a, nav button, aside a, aside button')].map(x => (x.innerText || '').trim()).filter(Boolean).join(' | '));
  ok(role + ': the menu is Mitigation-shaped (Drying jobs tab)', /Drying jobs/.test(nav), nav.slice(0, 400));
  if (/office/i.test(role)) ok(role + ': has the combined 💧 Mitigation tab', /(^|\| |\n)Mitigation( \||$)/.test(nav), nav.slice(0, 400));
  await B.ev(() => window._gcCo.setFilter('environmental')); await sleep(1500);
  const nav2 = await B.ev(() => [...document.querySelectorAll('nav a, nav button, aside a, aside button')].map(x => (x.innerText || '').trim()).filter(Boolean).join(' | '));
  if (/office/i.test(role)) ok(role + ': Environmental picked → the combined ☢️ Environmental tab', /(^|\| |\n)Environmental( \||$)/.test(nav2), nav2.slice(0, 400));
  ok(role + ': no page errors', !errs.length, errs);
  await B.close?.();
}
await run('Office Manager');
await run('Marketing Manager');
const n = R.filter(Boolean).length; console.log('COSWITCH ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
