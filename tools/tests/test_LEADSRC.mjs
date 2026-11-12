// test_LEADSRC.mjs <build-dir> — owner 11/12: "do all my website and text leads have a spot in leads, are they just mixed in? I'd like to
// sort by how we got the lead, where it's from". 📡 Source filter (counts, remembered per person), sortable Source column, a badge on each
// row and on the lead page, office / admin can change it; old leads are read (never re-written in bulk). Made-up data only.
import { computer, signIn, sleep, cset, cget, resetCloud, waitFor } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); const at = new Date().toISOString(), due = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const L = (id, o) => Object.assign({ id, stage: 'New Lead', createdAt: at, updatedAt: at }, o);
const LEADS = [
  L('LEADIN-web1', { name: 'Zedd Web Kitchen', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, inboxId: 'LI-web1', leadKind: 'Residential' }),
  L('LEADIN-txt1', { name: 'Zedd Text Roof', source: 'Text message', origin: 'website', websiteLead: true, textMessage: true, inboxId: 'LI-txt1', leadKind: 'Residential' }),
  L('LEADIN-call1', { name: 'Zedd Missed Call', source: 'Missed call', origin: 'website', websiteLead: true, inboxId: 'LI-call1', leadKind: 'Residential' }),
  L('LEADIN-em1', { name: 'Zedd Office Reroof (GC: Demo Builders)', source: 'Other', origin: 'email', inboxId: 'LI-em1', gc: 'Demo Builders', bidDue: due, leadKind: 'Commercial', bidRole: 'sub' }),
  L('LEADIN-bc1', { name: 'Zedd Clinic Tenant Finish', source: 'BuildingConnected', origin: 'email', inboxId: 'LI-bc1', gc: 'Demo Builders', bidDue: due, leadKind: 'Commercial', bidRole: 'sub' }),
  L('LEADIN-w1', { name: 'Zedd County Courthouse Roof', source: 'Demo County', origin: 'watch', inboxId: 'LI-w1', bidDue: due, leadKind: 'Government', bidRole: 'prime' }),
  L('LPMT_zz1', { name: 'Commercial rehab — 1 Demo Ave', source: 'Building permit — Nashville', permitKey: 'nashville:1' }),
  L('LREF1', { name: 'Zedd Referral Deck', source: 'Referral', addedBy: 'Wesley Johnson' }),
  L('LMAN1', { name: 'Zedd Walk-in Bath', source: 'Yard sign', addedBy: 'Wesley Johnson' }),
  L('LDODGE1', { name: 'Zedd Dodge Hospital', source: 'Dodge', bidDue: due }),
  L('LEADIN-old1', { name: 'Zedd Old Inbox Lead', inboxId: 'LI-old1' }),
  L('LOLD2', { name: 'Zedd No Source At All' })];
cset('leads', LEADS);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
A.page().on('dialog', d => d.accept('Demo Realtor').catch(() => {}));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
const ch = await A.ev(() => Object.fromEntries(window._crm.leads.filter(l => /Zedd|Demo Ave/.test(l.name)).map(l => [l.id, window._gcLeadSource.of(l)])));
ok('each lead has a spot: Website, Text, Phone, E-mail, Bid sites, Permits, Referral, Manual, Dodge, Lead Inbox, Unknown', ch['LEADIN-web1'] === 'website' && ch['LEADIN-txt1'] === 'text' && ch['LEADIN-call1'] === 'phone' && ch['LEADIN-em1'] === 'email' && ch['LEADIN-bc1'] === 'bids' && ch['LEADIN-w1'] === 'bids' && ch.LPMT_zz1 === 'permit' && ch.LREF1 === 'referral' && ch.LMAN1 === 'manual' && ch.LDODGE1 === 'dodge' && ch['LEADIN-old1'] === 'inbox' && ch.LOLD2 === 'unknown', ch);
await A.ev(() => window._setView('leads')); await sleep(3000);
const ids = () => A.ev(() => [...document.querySelectorAll('#gc-leads-hub tr.gcl-lr')].map(r => r.getAttribute('data-gcl-id')));
const all = await ids();
ok('all twelve show in the Leads list (nothing hidden for its source)', LEADS.every(l => all.includes(l.id)), all);
const sel = await A.ev(() => { const s = document.querySelector('#gc-leads-hub select[data-gcl-f="ch"]'); return s ? [...s.options].map(o => o.textContent) : null; });
ok('📡 Source filter with counts (🌐 Website (1), 💬 Text (1), 🏗 Bid sites / plan rooms (2) …)', sel && sel.includes('🌐 Website (1)') && sel.includes('💬 Text (1)') && sel.includes('🏗 Bid sites / plan rooms (2)') && sel.includes('❔ Unknown (1)'), sel);
const badge = await A.ev(() => { const c = document.querySelector('#gc-leads-hub tr[data-gcl-id="LEADIN-bc1"] td.c-src .gcl-src'); return c ? { t: c.textContent, tip: c.title } : null; });
ok('a source badge on each row; the raw source on hover', badge && /Bid sites/.test(badge.t) && /BuildingConnected/.test(badge.tip), badge);
const pick = async v => { await A.ev(v => { const s = document.querySelector('#gc-leads-hub select[data-gcl-f="ch"]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v); await sleep(1500); };
await pick('text'); let r = await ids();
ok('💬 Text → the text lead only', r.join() === 'LEADIN-txt1', r);
await pick('bids'); await A.ev(() => document.querySelector('[data-gclu-chip="rprime"]').click()); await sleep(1500); r = await ids();
ok('combined with 🏗 Prime → the county bid only', r.join() === 'LEADIN-w1', r);
await A.ev(() => document.querySelector('[data-gclu-chip="rprime"]').click()); await sleep(800);
const mem = await A.ev(() => localStorage.getItem('gc_leads_ch:wjohnson@grayco-cs.com'));
ok('the pick is remembered for this person', mem === 'bids', mem);
await A.page().reload(); await sleep(9000); await A.ev(() => window._setView('leads')); await sleep(3500);
r = await ids(); const sv = await A.ev(() => (document.querySelector('#gc-leads-hub select[data-gcl-f="ch"]') || {}).value);
ok('…after a reload it opens on 🏗 Bid sites again', sv === 'bids' && r.length === 2 && r.every(x => /bc1|w1/.test(x)), { sv, r });
await pick('');
await A.ev(() => { const t = document.querySelector('#gc-leads-hub th[data-gcl-lsort="src"]'); t.click(); }); await sleep(1500);
const order = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub tr.gcl-lr td.c-src .gcl-src')].map(b => b.getAttribute('data-gcl-src')));
const firstIdx = k => order.indexOf(k);
ok('the Source column sorts by source (A→Z, Unknown last)', order.length >= 12 && firstIdx('bids') < firstIdx('email') && firstIdx('email') < firstIdx('website') && order[order.length - 1] === 'unknown', order);
/* the lead page: shown, and office / admin can change it */
await A.ev(() => window._gcLeadsHub.open('LOLD2')); await sleep(1200);
const dk = await A.ev(() => { const d = document.getElementById('gcl-drawer'); return d ? { came: /Came in:/.test(d.innerText), sel: !!d.querySelector('select[data-d="srcch"]') } : null; });
ok('lead page: 📡 Came in + ✎ change (admin)', dk && dk.came && dk.sel, dk);
await A.ev(() => { const s = document.querySelector('#gcl-drawer select[data-d="srcch"]'); s.value = 'referral'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(2500);
const ed = await A.ev(() => { const l = window._crm.leads.find(x => x.id === 'LOLD2'); return { c: l.sourceChannel, s: l.source, by: l.sourceSetBy, of: window._gcLeadSource.of(l) }; });
ok('…changed to 🤝 Referral ("Demo Realtor"), with who / when', ed.c === 'referral' && ed.s === 'Demo Realtor' && ed.by && ed.of === 'referral', ed);
const un = await A.ev(() => window._crm.leads.filter(l => /^LEADIN-old1$|^LMAN1$/.test(l.id)).map(l => [l.id, l.source || '', l.sourceChannel || '']));
ok('old leads are read, never re-written (no source added to the old inbox lead; the manual one keeps "Yard sign")', JSON.stringify(un.sort()) === JSON.stringify([['LEADIN-old1', '', ''], ['LMAN1', 'Yard sign', '']]), un);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('LEADSRC ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
