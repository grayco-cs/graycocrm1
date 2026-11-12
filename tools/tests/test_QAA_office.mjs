// test_QAA_office.mjs <build-dir> — patch QAA: the office (office@ = the master office account, Office Manager) with Construction and
// All picked: the menu has 💧 Mitigation AND ☢️ Environmental (owner 11/12: "office can have mit and env tab too"), each opens; 💬 Messages
// lists the jobs. Offline harness, made-up data.
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const BUILD = process.argv[2];
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const now = new Date().toISOString();
H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Office Desk', email: 'office@grayco-cs.com', role: 'Office Manager', active: true }]);
H.cset('projects', [{ id: 'P1', name: 'Demo Kitchen Remodel', client: 'Zedd Homeowner', status: 'Active', pm: 'Wesley Johnson', updatedAt: now },
  { id: 'E1', name: 'Demo Kline trim', client: 'Demo Kline', status: 'active', type: 'Environmental', companyId: 'environmental', pm: 'Wesley Johnson', updatedAt: now }]);
const c = await H.computer('o', { build: BUILD }); c.acceptConfirm = false;
await c.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
await H.signIn(c, 'office@grayco-cs.com', 12000); await H.sleep(5000);
await c.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); }); await H.sleep(1200);
const navOf = () => c.ev(() => [...document.querySelectorAll('aside nav button, aside button')].filter(b => b.offsetParent && !b.closest('#gc-ra-dock,#gc-fh-tabs')).map(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim()));
const nav = async l => { await c.ev(l => { const b = [...document.querySelectorAll('aside nav button, aside button')].find(b => b.offsetParent && b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim() === l); if (b) b.click(); }, l); await H.sleep(2500); };
const mainText = () => c.ev(() => ((document.querySelector('#root main') || document.querySelector('main') || {}).innerText || '').replace(/\s+/g, ' '));
for (const co of ['construction', 'all']) {
  await c.ev(co => window._gcCo.setFilter(co), co); await H.sleep(2000);
  const n = await navOf();
  ok(co + ': the office menu has 💧 Mitigation and ☢️ Environmental', n.includes('💧 Mitigation') && n.includes('☢️ Environmental'), n);
  await nav('☢️ Environmental');
  const t = await mainText();
  ok(co + ': ☢️ Environmental opens (not blank)', t.length > 80 && /Environmental/i.test(t), t.slice(0, 200));
}
await nav('✅ To-Do'); await nav('💬 Messages'); await H.sleep(2500);
const m = await mainText();
ok('💬 Messages (office): the job list ("💬 Messages … Demo Kitchen Remodel")', /Messages/.test(m) && /Demo Kitchen Remodel/.test(m), m.slice(0, 300));
ok('no page errors', !c.errs.length, c.errs);
await c.b.close();
const k = R.filter(Boolean).length; console.log('QAA_OFFICE ' + k + '/' + R.length); process.exit(k === R.length ? 0 : 1);
