// test_CARE.mjs <build-dir> — owner 11/11: empathy on emergency board-up / fire / water jobs — PM Playbook section, the job card rule, the sub portal card.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(8000);
const r = await A.ev(() => ({ pb: /empathy-emergency/.test(window._gcPlaybookHTML || '') && /I'm sorry this happened|I’m sorry this happened|I&#x27;m sorry this happened/.test(window._gcPlaybookHTML || ''),
  fire: window._gcCareJob({ type: 'Fire Damage' }), water: window._gcCareJob({ type: 'Water Damage' }), board: window._gcCareJob({ name: 'Smith board-up' }), mit: window._gcCareJob({ companyId: 'mitigation', type: 'Residential Reno' }), kitchen: window._gcCareJob({ type: 'Kitchen' }) }));
ok('📘 PM Playbook has the "Lead with empathy" section', r.pb, r);
ok('the customer-care card is for fire / water / board-up / Mitigation jobs, not a kitchen remodel', r.fire && r.water && r.board && r.mit && !r.kitchen, r);
const app = fs.readFileSync(new URL('../../portal-app.js', import.meta.url), 'utf8'), pa = fs.readFileSync(new URL('../../netlify/functions/portal-access.js', import.meta.url), 'utf8');
ok('sub portal: the "How we treat this customer" card (English + Spanish) shows on care jobs', /careT: '🤝 How we treat this customer'/.test(app) && /careT: '🤝 Cómo tratamos/.test(app) && /JOB\.care \?/.test(app) && /care: p\.companyId === 'mitigation'/.test(pa));
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('CARE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
