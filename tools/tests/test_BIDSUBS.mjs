// test_BIDSUBS.mjs <build-dir> — owner 11/11: approved bid-site subs not in the CRM land in the CRM's Subs list (once, never a duplicate,
// never one deleted on purpose); + BIGFILES: a job's Files has 🔗 Add a link (a link record that opens in a new tab). Made-up data only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); const at = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('vendors', [{ id: 'V1', name: 'Old Sub LLC', email: 'old@example.com', isSub: true, updatedAt: at }]);
cset('projects', [{ id: 'P1', name: 'Sample Apartment Rebuild', status: 'active', createdAt: at, updatedAt: at, files: [] }]);
const SUBS = [{ email: 'new1@example.com', name: 'Nina New', company: 'New Drywall LLC', trade: 'Drywall', trades: ['Drywall'], onBidSite: true, notInCrm: true, phone: '901-555-0111', portalUserId: 'u_n1', city: 'Memphis', state: 'TN' },
  { email: 'old@example.com', name: 'Ollie', company: 'Old Sub LLC', onBidSite: true, notInCrm: false },
  { email: 'pending@example.com', name: 'Pat Pending', company: 'Pending Co', onBidSite: false, notInCrm: true }];
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
let hubCalls = 0;
await A.ctx.route('**/.netlify/functions/bid-hub*', r => { hubCalls++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, subs: SUBS }) }); });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(4000);
let r = await A.ev(() => window._gcBidSubs.run());
const v = await A.ev(() => window._crm.vendors.map(x => x.id + ':' + x.email + ':' + (x.source || '') + ':' + (x.isSub ? 'sub' : '')));
ok('an approved bid-site sub not in the CRM is added to Subs (Bid portal); a sub already there and an unapproved one are not', r.added === 1 && v.filter(x => /^SBPnew1examplecom:new1@example\.com:Bid portal:sub$/.test(x)).length === 1 && !v.some(x => /pending@example/.test(x)) && v.filter(x => /old@example/.test(x)).length === 1, { r, v: v.filter(x => /example\.com/.test(x)) });
const nina = await A.ev(() => window._crm.vendors.find(x => x.email === 'new1@example.com'));
ok('…with company, contact, phone, trade and city', nina.name === 'New Drywall LLC' && nina.contact === 'Nina New' && nina.phone === '901-555-0111' && nina.trade === 'Drywall' && /Memphis/.test(nina.address), nina);
r = await A.ev(() => window._gcBidSubs.run());
ok('running again adds nothing (no duplicates)', r.added === 0 && (await A.ev(() => window._crm.vendors.filter(x => x.email === 'new1@example.com').length)) === 1, r);
/* BIGFILES: 🔗 Add a link */
await A.ev(() => { window.__p = ['https://drive.google.com/drive/folders/SAMPLE', 'Plans (Google Drive)']; window.prompt = () => window.__p.shift(); window.confirm = () => false; });
const rec = await A.ev(() => window._gcAddFileLink(window._crm.projects.find(p => p.id === 'P1')));
await sleep(1200);
const files = await A.ev(() => (window._crm.projects.find(p => p.id === 'P1').files || []).map(f => ({ n: f.name, l: f.link, d: f.data })));
ok('🔗 Add a link puts a link record on the job (opens the Drive folder)', files.length === 1 && files[0].l === 'https://drive.google.com/drive/folders/SAMPLE' && files[0].d === files[0].l && /Plans \(Google Drive\)/.test(files[0].n), files);
const big = await A.ev(async () => { window._gcDrive._reset(); const f = new File([new Uint8Array(10)], 'Big plans.pdf', { type: 'application/pdf' }); Object.defineProperty(f, 'size', { value: 60 * 1048576 }); let msg = ''; window.alert = m => { msg = m; }; const x = await window._gcBigFile(f, { id: 'P1', name: 'x' }); return { x, msg }; });
ok('a file over 50 MB with Google Drive not connected yet → a clear message (Drive or 🔗 Add a link), nothing saved', big.x === null && /over the CRM's 50 MB/.test(big.msg) && /Add a link/.test(big.msg), big);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('BIDSUBS ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
