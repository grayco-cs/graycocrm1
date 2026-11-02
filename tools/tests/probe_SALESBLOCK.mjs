// probe_SALESBLOCK.mjs <worktree> — DEMO data only, fully offline (patch SALESBLOCK, the CRM page).
// The admin sees Leads → "🧹 Sales & spam: N held", reviews the list (✅ Not spam → make lead, 🚫 Block, Dismiss), ⚙ Admin
// settings → 🚫 Blocked (block / unblock), 🚫 Block sender + "🧹 Looks like a sales pitch" on a lead, the alert text's
// signed ?sgb= link (asks, then blocks with the signature). A PM sees none of it. The page's detector = the server's.
// The salesblock function is faked (requests recorded). Run under the shared browser lock.
import { createRequire } from 'module';
import path from 'path';
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, cset, sleep, waitFor, resetCloud } = H;
const WT = path.resolve(process.argv[2] || '.'); const require = createRequire(import.meta.url);
const SG = require(path.join(WT, 'netlify/functions/_lib/salesguard.js'));
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); } };
const TED = "Hi team,\nI'm Ted from GrowthVector. I build AI agents for businesses like GrayCo Construction Services. On your website, a visitor who asks for a quote at night waits until the next business day. An AI agent can answer in under a minute, ask the right questions and book the job on your calendar.\nWe also help businesses get more customers from Google search.\nWant me to send details on how it works?";
const HELD = [
  { id: 'SG-ted1', at: '2026-11-01T08:25:28Z', via: 'website', why: 'AI agent / AI receptionist (score 16)', phone: '3473364175', email: 'ted@growthvector.io', name: 'Ted Cadet', company: 'GrowthVector', text: TED, status: 'held', canLead: true },
  { id: 'SG-seo2', at: '2026-11-01T09:00:00Z', via: 'sms', why: 'SEO (score 11)', phone: '9015552000', email: '', name: '', text: 'We can get your website on the first page of Google with our SEO services. Interested?', status: 'held', canLead: true }];
const REQ = [];
const UNS = at => [{ id: 'SMS_u1', pid: '', at, text: 'hello from a number not on a job', authorName: '📱 (901) 555-0300 (text)', authorId: 'sms:9015550300', smsFrom: '9015550300', channel: 'sms', dir: 'in' },
  { id: 'SMSA_u2', pid: '', at, text: 'Thanks for texting GrayCo Construction Services!', authorName: '🤖 GrayCo auto-answer (text)', authorId: 'sms:auto', smsTo: '9015550300', channel: 'sms', dir: 'out' }];
const unsortedIds = () => window._gcMsgUnsorted().map(m => m.id);
const renderUns = () => { let d = document.getElementById('probe-uns'); if (!d) { d = document.createElement('div'); d.id = 'probe-uns'; document.body.appendChild(d); } d.innerHTML = window._gcMsgUnsortedHtml(); return d.querySelectorAll('.gc-qa-urow').length; };
async function fake(c){
  let block = { phones: [], emails: [], domains: [], allowPhones: [], allowEmails: [] };
  await c.ctx.route('**/.netlify/functions/salesblock**', async r => {
    const u = new URL(r.request().url()), m = r.request().method(), body = m === 'POST' ? JSON.parse(r.request().postData() || '{}') : null;
    REQ.push({ q: u.search, m, body, auth: !!(r.request().headers().authorization) });
    let out = { ok: true };
    if (u.searchParams.get('count')) out = { ok: true, held: HELD.length };
    else if (u.searchParams.get('list')) out = { ok: true, held: HELD, done: [], block, counts: { sales: 7, blocked: 3, night: 1 }, log: [{ at: '2026-11-01T08:25:28Z', decision: 'sales', via: 'website', phone: '3473364175', why: 'AI agent' }] };
    else if (u.searchParams.get('act') === 'block') { if (body.phone) block.phones.push(body.phone); if (body.email) block.emails.push(body.email); if (body.domain) block.domains.push(body.domain); out = { ok: true, block }; }
    else if (u.searchParams.get('act') === 'unblock') { block.phones = block.phones.filter(x => x !== body.phone); out = { ok: true, block }; }
    else if (u.searchParams.get('act') === 'notspam') out = { ok: true, leadId: 'LI-x' };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
}
function world(){
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
  const now = new Date().toISOString();
  cset('projects', [{ id: 'P1', name: 'Oak St roof', client: 'Ann Oak', status: 'Active' }]);
  cset('gc_job_messages', JSON.stringify(UNS(now)));
  cset('leads', [{ id: 'LEADIN-ted', name: 'Storm / insurance damage — Ted Cadet — New York', stage: 'New Lead', status: 'new', phone: '(347) 336-4175', email: 'ted@growthvector.io', source: 'Website (grayco-cs.com)', said: { message: TED, company: 'GrowthVector' }, scope: TED, createdAt: now, updatedAt: now },
    { id: 'LEADIN-real', name: 'Text message — (901) 494-1754', stage: 'New Lead', status: 'new', phone: '(901) 494-1754', smsFrom: '9014941754', textBody: 'I need help I have water everywhere !?', source: 'Text message', createdAt: now, updatedAt: now }]);
}

/* ── the admin ── */
world();
let c = await computer('SB-admin', { build: WT }); await fake(c);
await signIn(c, 'wjohnson@grayco-cs.com');
await waitFor(c, () => (window._crm && window._crm.leads || []).length >= 2 && !!window._gcSalesBlock, null, 90000, 300);
ok(await c.ev(() => !!window._gcSalesBlock), 'the patch loaded (_gcSalesBlock)');
const same = await c.ev(([t, a, b]) => [window._gcSalesBlock.isSales(t, { email: 'ted@growthvector.io' }), window._gcSalesBlock.isSales(a), window._gcSalesBlock.isSales(b), window._gcSalesBlock.why(t)], [TED, 'I need help I have water everywhere !?', 'this is State Farm adjuster about claim']);
ok(same[0] === SG.isSales(TED, { email: 'ted@growthvector.io' }) && same[0] && !same[1] && !same[2] && same[3] === SG.why(TED), 'the page\'s detector answers exactly like the server\'s', same);
await c.ev(() => window._setView('leads'));
const strip = await waitFor(c, () => { const e = document.getElementById('gcsb-strip'); return e && e.offsetParent && e.textContent; }, null, 30000, 300);
ok(/🧹 2 to review/.test(strip || '') && await c.ev(() => !!document.querySelector('#gc-leads-hub .gclu-top #gcsb-strip')), 'Leads: the small "🧹 2 to review" chip in the Leads header (patch BARSTILL2)', strip);
await c.ev(() => document.querySelector('#gcsb-strip [data-gcsb="open"]').click());
const items = await waitFor(c, () => document.querySelectorAll('#gcsb-ov .gcsb-it').length === 2 && [...document.querySelectorAll('#gcsb-ov .gcsb-it')].map(x => x.textContent), null, 15000, 200);
ok(items && /Ted Cadet/.test(items[0]) && /AI agent/.test(items[0]) && /Website form/.test(items[0]), 'the list: who, how, why, what they wrote', items);
ok(await c.ev(() => document.querySelectorAll('#gcsb-ov [data-a="notspam"]').length === 2 && document.querySelectorAll('#gcsb-ov [data-a="block"]').length === 2 && document.querySelectorAll('#gcsb-ov [data-a="dismiss"]').length === 2), 'each has ✅ Not spam → make lead, 🚫 Block, Dismiss');
REQ.length = 0;
await c.ev(() => document.querySelector('#gcsb-ov [data-id="SG-ted1"] [data-a="block"]').click()); await sleep(1500);
let post = REQ.find(x => x.m === 'POST' && /act=block/.test(x.q));
ok(post && post.body.phone === '3473364175' && post.body.email === 'ted@growthvector.io' && post.body.id === 'SG-ted1' && post.auth, '🚫 Block (after the confirm) sends the number + e-mail + the item, signed in', post);
ok(c.dialogs.some(d => /^confirm: 🚫 Block \(347\) 336-4175/.test(d)), 'it asks first', c.dialogs);
REQ.length = 0;
await c.ev(() => document.querySelector('#gcsb-ov [data-id="SG-seo2"] [data-a="notspam"]').click()); await sleep(1200);
post = REQ.find(x => x.m === 'POST' && /act=notspam/.test(x.q));
ok(post && post.body.id === 'SG-seo2', '✅ Not spam → make lead', post);
await c.ev(() => document.getElementById('gcsb-ov').remove());
/* ⚙ Admin settings → 🚫 Blocked */
await c.ev(() => { const d = document.createElement('div'); d.id = 'probe-bl'; document.body.appendChild(d); window._gcSalesBlock.render(d); });
const bl = await waitFor(c, () => { const d = document.getElementById('probe-bl'); return d && /Unblock/.test(d.textContent) && d.textContent; }, null, 10000, 200);
ok(bl && /\(347\) 336-4175/.test(bl) && /3<\/b>|3 dropped|dropped/.test(bl), '🚫 Blocked: the list with Unblock and the totals', bl && bl.slice(0, 300));
REQ.length = 0;
await c.ev(() => { const d = document.getElementById('probe-bl'); d.querySelector('[data-sb="add"]').value = '@spamco.io'; d.querySelector('[data-sb="go"]').click(); }); await sleep(1200);
post = REQ.find(x => x.m === 'POST' && /act=block/.test(x.q));
ok(post && post.body.domain === 'spamco.io', 'block a domain from the box', post && post.body);
REQ.length = 0;
await c.ev(() => document.querySelector('#probe-bl [data-ub="phone"]').click()); await sleep(1200);
post = REQ.find(x => x.m === 'POST' && /act=unblock/.test(x.q));
ok(post && post.body.phone === '3473364175', 'Unblock', post && post.body);
await c.ev(() => document.getElementById('probe-bl').remove());
ok(await c.ev(() => { try { return typeof window._gcAdmAddSection === 'function' && !window._gcAdmAddSection({ id: 'salesblock' }); } catch (e) { return false; } }), 'the 🚫 Blocked section is registered in ⚙ Admin settings');
/* the lead drawer */
await c.ev(() => window._gcOpenLead('LEADIN-ted'));
const lb = await waitFor(c, () => { const e = document.getElementById('gcsb-lead'); return e && e.textContent; }, null, 20000, 300);
ok(lb && /Looks like a sales pitch/.test(lb) && /Block sender/.test(lb) && /\(347\) 336-4175/.test(lb), 'a lead: "🧹 Looks like a sales pitch" + 🚫 Block sender', lb);
REQ.length = 0;
await c.ev(() => document.querySelector('#gcsb-lead [data-gcsb-lead]').click()); await sleep(1200);
post = REQ.find(x => x.m === 'POST' && /act=block/.test(x.q));
ok(post && post.body.phone === '3473364175', '🚫 Block sender blocks the lead\'s number', post && post.body);
await c.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} });
await c.ev(() => window._gcOpenLead('LEADIN-real'));
const lr = await waitFor(c, () => { const e = document.getElementById('gcsb-lead'); return e && document.getElementById('gcl-drawer') && window._gcLeadsHub.ui().open === 'LEADIN-real' && e.textContent; }, null, 20000, 300);
ok(lr && !/sales pitch/.test(lr) && /Block sender/.test(lr), 'a real customer\'s lead: no sales chip (Block still there)', lr);
await c.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} });
/* Messages → 📥 Unsorted: the small ✕ (soft, Undo 5 s, admins / office) */
await c.ev(at => { const have = JSON.parse(localStorage.getItem('gc_job_messages') || '[]'); if (!have.some(m => m && m.id === 'SMS_u1')) localStorage.setItem('gc_job_messages', JSON.stringify(have.concat(at))); }, UNS(new Date().toISOString()));
await waitFor(c, () => (window._crm && window._crm.projects || []).length >= 1 && typeof window._gcMsgUnsorted === 'function', null, 30000, 300);
ok((await c.ev(renderUns)) === 2, 'Unsorted shows the text and the auto-answer');
const xs = await waitFor(c, () => document.querySelectorAll('#probe-uns .gcsbx-x').length, null, 10000, 200);
const xpos = await c.ev(() => { const r = document.querySelector('#probe-uns .gc-qa-urow'), b = r.querySelector('.gcsbx-x'), rb = r.getBoundingClientRect(), bb = b.getBoundingClientRect(); return { top: bb.top - rb.top, right: rb.right - bb.right, w: bb.width }; });
ok(xs === 2 && xpos.top < 12 && xpos.right < 6 && xpos.w <= 24, 'every row has a small ✕ at its top right', { xs, xpos });
const msgCount0 = await c.ev(() => JSON.parse(localStorage.getItem('gc_job_messages') || '[]').length);
const nd = c.dialogs.length;
await c.ev(() => document.querySelector('#probe-uns [data-qa-pick="SMS_u1"]').closest('.gc-qa-urow').querySelector('.gcsbx-x').click()); await sleep(800);
let st;
st = await c.ev(() => ({ hidden: document.querySelector('#probe-uns [data-qa-pick="SMS_u1"]').closest('.gc-qa-urow').style.display === 'none', toast: !!document.querySelector('.gcsbx-toast'), ids: window._gcMsgUnsorted().map(m => m.id), n: JSON.parse(localStorage.getItem('gc_job_messages') || '[]').length }));
ok(st.hidden && st.toast && st.ids.indexOf('SMS_u1') < 0 && st.ids.indexOf('SMSA_u2') >= 0 && c.dialogs.length === nd, '✕ hides the row at once (no confirm), with an Undo toast', st);
ok(st.n === msgCount0, 'the message itself is kept (only flagged off Unsorted)', st);
await c.ev(() => document.querySelector('.gcsbx-toast button').click()); await sleep(800);
st = await c.ev(() => ({ shown: document.querySelector('#probe-uns [data-qa-pick="SMS_u1"]').closest('.gc-qa-urow').style.display !== 'none', ids: window._gcMsgUnsorted().map(m => m.id) }));
ok(st.shown && st.ids.indexOf('SMS_u1') >= 0, 'Undo brings it back', st);
await c.ev(() => document.querySelector('#probe-uns [data-qa-pick="SMS_u1"]').closest('.gc-qa-urow').querySelector('.gcsbx-x').click()); await sleep(6500);
ok(await c.ev(() => !document.querySelector('.gcsbx-toast')), 'the Undo toast goes after 5 seconds');
const cloudMsg = () => { let v = H.cget('gc_job_messages'); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return (Array.isArray(v) ? v : []).find(m => m && m.id === 'SMS_u1'); };
ok(cloudMsg() && cloudMsg().unsortedHidden === true, 'saved to the cloud (gc_job_messages), the message still there', cloudMsg());
ok(await c.ev(() => !(window._crm.leads || []).some(l => l && /deleted/i.test(String(l.status || '')))), 'no lead was touched');
await c.ev(() => document.getElementById('probe-uns').remove());
/* the alert text's link */
REQ.length = 0;
const sig = SG.sig('3473364175');
await c.page().goto('https://app.local/index.html?sgb=3473364175.' + sig); await sleep(9000);
await waitFor(c, () => !!window._gcSalesBlock, null, 60000, 300); await sleep(4000);
post = REQ.find(x => x.m === 'POST' && /act=block/.test(x.q));
ok(post && post.body.phone === '3473364175' && post.body.sig === sig, 'the alert text\'s block link: asks, then blocks with the signature', { post, d: c.dialogs.slice(-2) });
ok(!(await c.ev(() => location.search)).includes('sgb'), 'the link is taken off the address bar');
await waitFor(c, () => (window._crm && window._crm.projects || []).length >= 1 && typeof window._gcMsgUnsorted === 'function', null, 30000, 300);
const after = await c.ev(unsortedIds);
ok(after.indexOf('SMS_u1') < 0 && after.indexOf('SMSA_u2') >= 0, 'after a reload the ✕-ed message stays off Unsorted', after);
const errs = c.errs.filter(e => /salesblock|gcsb|_gcSalesBlock|sgWhy/i.test(e));
ok(!errs.length, 'no page errors from the patch', errs);
await c.b.close();

/* ── a PM ── */
world();
c = await computer('SB-pm', { build: WT }); await fake(c); REQ.length = 0;
await signIn(c, 'sbiffle@grayco-cs.com');
await waitFor(c, () => !!window._gcSalesBlock, null, 90000, 300);
await c.ev(() => { try { window._setView('leads'); } catch (e) {} }); await sleep(5000);
ok(await c.ev(() => !document.getElementById('gcsb-strip')) && !REQ.length, 'a PM: no Sales & spam line, no calls to it', REQ);
await c.ev(at => { localStorage.setItem('gc_job_messages', JSON.stringify(at)); }, UNS(new Date().toISOString()));
await waitFor(c, () => (window._crm && window._crm.projects || []).length >= 1 && typeof window._gcMsgUnsortedHtml === 'function', null, 30000, 300);
await c.ev(renderUns); await sleep(3000);
ok(await c.ev(() => document.querySelectorAll('#probe-uns .gc-qa-urow').length >= 1 && !document.querySelector('#probe-uns .gcsbx-x')), 'a PM: no ✕ on Unsorted');
await c.b.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
