// test_LSADISPUTE.mjs <build-dir> — LSADISPUTE (owner 11/10): opening a Google LSA lead shows "⚖️ Open in Google LSA" (the lead's own Google
// link when we have it, else Google's LSA leads list); a BAD one says "Dispute in Google LSA"; other leads show nothing. Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud();
const now = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('leads', [{ id: 'LA', name: 'Google LSA caller (2:31 PM)', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'pending', leadExtra: { leadSource: 'Google LSA', lsaLink: 'https://c.gle/DEMO123' }, stage: 'New Lead', createdAt: now },
  { id: 'LB', name: 'Demo Bad', source: 'Google LSA', lsaCheck: 'bad', stage: 'Lost', lostReason: 'LSA — not a real lead (spam)', createdAt: now },
  { id: 'LC', name: 'Demo Website', source: 'Website', stage: 'New Lead', createdAt: now }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(9000);
await A.ev(() => window._setView('leads')); await sleep(4000);
const bar = async id => { await A.ev(id => window._gcLeadsHub.open(id), id); await sleep(1800); return A.ev(() => { const b = document.getElementById('gc-lsa-dispute'); const a = b && b.querySelector('a'); return b ? { t: b.innerText, href: a && a.getAttribute('href'), target: a && a.getAttribute('target') } : null; }); };
let b = await bar('LA');
ok('an LSA lead: "Open in Google LSA" with its own Google link, new tab', b && /Open in Google LSA/.test(b.t) && b.href === 'https://c.gle/DEMO123' && b.target === '_blank', b);
b = await bar('LB');
ok('a BAD LSA lead: "Dispute in Google LSA" (the LSA leads list when no own link)', b && /Dispute in Google LSA/.test(b.t) && b.href === 'https://ads.google.com/localservices/leads' && /30 days/.test(b.t), b);
b = await bar('LC');
ok('a website lead: no LSA bar', !b, b);
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'LSADISPUTE ' + R.length + '/' + R.length); process.exit(f ? 1 : 0);
