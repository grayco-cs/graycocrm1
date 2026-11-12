// test_LEADBOTH.mjs <build-dir> — owner 11/12: "On Construction I want asbestos and lead jobs that are public, because there are also GC
// jobs when those are around, but also put those leads in Environmental leads too"; "in the automatic leads I want to see asbestos and
// mold leads"; "scan for those words". A GC / public bid lead about asbestos / lead / mold is Construction's lead AND listed on the
// Environmental Leads page; a residential one is Environmental only; a plain GC bid is Construction only. Made-up data only.
import { createRequire } from 'module';
import { computer, signIn, sleep, cset, resetCloud, waitFor } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const BUILD = process.argv[2];
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };

/* ── the server: the e-mailed invite is kept, tagged ☢️ (the CRM side takes it from there) ── */
const BI = require(BUILD + '/netlify/functions/bid-inbox.js')._test;
const due = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
const mail = { id: 'em-zedd-1', messageId: 'zedd-1', from: { email: 'estimating@zeddbuilders.example', name: 'Zedd Builders', domain: 'zeddbuilders.example' }, subject: 'Invitation to Bid: Asbestos and lead abatement — Midtown school (GC: Zedd Builders)',
  text: 'Zedd Builders invites you to bid the asbestos and lead abatement package at Midtown Demo School. Bids due ' + due + ' 2:00 PM.', date: new Date().toISOString(), files: [], skipped: [], headers: {} };
const ai = { ok: true, kind: 'invitation', leads: [{ project_name: 'Asbestos and lead abatement — Midtown school', gc_name: 'Zedd Builders', bid_due_date: due, bid_due_time: '14:00', scope_summary: 'ACM flooring and lead-based paint abatement', trades: ['abatement'], city: 'Memphis', state: 'TN' }] };
const recs = BI.recordsFrom(mail, ai, [], '', [], 'raw-1');
ok('server: the e-mailed invite becomes a record tagged ☢️ (envScope, words, tag)', recs.length === 1 && recs[0].envScope === true && recs[0].envWords.includes('asbestos') && recs[0].tags.includes('☢️ Abatement / mold'), recs[0] && { e: recs[0].envScope, w: recs[0].envWords, t: recs[0].tags });
const ng = BI.noticeGate({ kind: 'public_bid', leads: [{ project_name: 'Hazardous materials survey and testing services — Demo County jail', scope_summary: '' }, { project_name: 'Purchase of two dump trucks' }] }, null);
ok('server: a public notice for a hazardous materials survey passes the construction gate (trucks still skipped)', ng.leads.length === 1 && /Hazardous/.test(ng.leads[0].project_name), ng);
const SG = require(BUILD + '/netlify/functions/_lib/salesguard.js');
ok('server: the Sales & spam guard never holds an abatement / mold message', !SG.isSales('We are a leading environmental firm — we help contractors like yours with asbestos abatement and mold remediation. Book a quick 15 minute call', { email: 'x@growthleads.example' }) && SG.isSales('We are a digital marketing agency — we help contractors like yours get more leads. Book a quick 15 minute call', { email: 'x@growthleads.example' }));
ok('server: mosquito / tax abatement and injection molds are not our words', !require(BUILD + '/netlify/functions/_lib/envwords.js').test('Mosquito abatement program; tax abatement; injection mold purchase'));
const P = require(BUILD + '/netlify/functions/_lib/permits.js');
const D0 = P.clean({}), iso = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
const small = P.classify({ src: 'nashville', id: 'pm1', type: 'Building Residential - Rehab', desc: 'Mold remediation in crawl space and bathroom', value: 18000, issued: iso }, D0);
ok('permits: "Environmental: asbestos / lead / mold (any value)" is on by default', D0.include.environmental === true && P.INCLUDE.some(x => x[0] === 'environmental' && /Environmental: asbestos \/ lead \/ mold \(any value\)/.test(x[1])));
ok('permits: a small Nashville "Mold remediation – $18,000" is kept under ☢️ (Environmental)', small.match && small.reasons[0] === '☢️ Abatement / mold' && small.hint === 'environmental' && small.cos.join() === 'environmental', small);
const off = P.classify({ src: 'nashville', id: 'pm1', type: 'Building Residential - Rehab', desc: 'Mold remediation in crawl space', value: 18000, issued: iso }, P.clean({ include: { environmental: false } }));
ok('permits: …and out when the ☢️ box is unticked', !off.match, off.why);
const gcp = P.classify({ src: 'nashville', id: 'pm2', type: 'Building Commercial - Rehab', subtype: 'Office', desc: 'Interior demo with asbestos abatement, 3rd floor', value: 240000, issued: iso }, D0);
ok('permits: a commercial (GC) abatement permit under $1M → Construction AND Environmental', gcp.match && gcp.cos.join() === 'construction,environmental' && gcp.hint === 'construction', gcp);
const PW = require(BUILD + '/netlify/functions/permit-watch.js')._test;
ok('permits: the Nashville query asks for $1M+ commercial OR the ☢️ words', /^Date_Issued >= TIMESTAMP '2026-11-01 00:00:00' AND \(\(Const_Cost >= 1000000 AND \(Permit_Type_Description LIKE '%Commercial%'.*\) OR \(UPPER\(Purpose\) LIKE '%ASBESTOS%'.*MOLD.*\)\)$/.test(PW.nashWhere(D0, '2026-11-01')), PW.nashWhere(D0, '2026-11-01'));

/* ── the CRM ── */
resetCloud(); const at = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const L = (id, o) => Object.assign({ id, client: id, stage: 'New Lead', createdAt: at, updatedAt: at }, o);
cset('leads', [
  L('LBzz Asb Bid', { name: 'Asbestos abatement – Midtown Office (GC: Zedd Builders), bid due ' + due, gc: 'Zedd Builders', bidDue: due, leadKind: 'Commercial', inboxId: 'ibz1', inboxState: 'new' }),
  L('LBzz Res Lead', { name: 'lead paint abatement at my house', scope: 'lead paint abatement at my house', websiteLead: true, leadKind: 'Residential', origin: 'website' }),
  L('LBzz Plain Bid', { name: 'Zedd Office Tenant Finish (GC: Zedd Builders)', gc: 'Zedd Builders', bidDue: due, leadKind: 'Commercial', inboxId: 'ibz2', inboxState: 'new' }),
  L('LBzz Mold Web', { name: 'black mold in my bathroom', scope: 'black mold in my bathroom', websiteLead: true, leadKind: 'Residential', origin: 'website' }),
  L('LBzz Env Picked', { name: 'Asbestos survey — Demo Plaza (GC: Zedd Builders)', gc: 'Zedd Builders', bidDue: due, companyId: 'environmental' })]);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
/* the e-mailed invite above, as the Lead Inbox brings it in (the inbox item → its lead) */
const item = Object.assign({}, recs[0], { id: 'LI-zeddmold1', status: 'new', rev: 1, receivedAt: at, title: 'Mold remediation – Demo Apartments (GC: Zedd Builders)', scope: 'Mold remediation and microbial cleaning, units 1-40' });
item.envScope = true; item.envWords = ['mold', 'microbial'];
await A.ev(it => { const l = window._gcLeadInbox._test.fromItem(it, null); l.client = 'LBzz Mold Bid'; window._setLeads(p => (p || []).concat([l])); }, item); await sleep(2500);
const cos = await A.ev(() => window._crm.leads.filter(l => /^LBzz/.test(l.client)).map(l => l.client + '=' + window._gcCo.ofLead(l) + ':' + window._gcCo.leadCos(l).join('+')).sort());
ok('leadCos: GC bids with asbestos / mold → Construction + Environmental; residential → Environmental; plain bid → Construction; explicit Environmental kept',
  JSON.stringify(cos) === JSON.stringify(['LBzz Asb Bid=construction:construction+environmental', 'LBzz Env Picked=environmental:environmental', 'LBzz Mold Bid=construction:construction+environmental', 'LBzz Mold Web=environmental:environmental', 'LBzz Plain Bid=construction:construction', 'LBzz Res Lead=environmental:environmental']), cos);
const NAMES = ['LBzz Asb Bid', 'LBzz Res Lead', 'LBzz Plain Bid', 'LBzz Mold Web', 'LBzz Env Picked', 'LBzz Mold Bid'];
const shown = async () => { await A.ev(() => window._setView('leads')); await sleep(2500); return A.ev(N => { const ids = window._gcLeadScope.visible(); const ls = window._crm.leads.filter(l => ids.indexOf(l.id) > -1).map(l => l.client); return N.filter(n => ls.includes(n)).sort(); }, NAMES); };
const chips = () => A.ev(() => Array.from(document.querySelectorAll('#gc-leads-hub tr.gcl-lr')).map(tr => { const c = tr.querySelector('.gc-lb-chip'); return c ? (tr.querySelector('.c-name b') || tr).textContent.trim().slice(0, 30) + '|' + c.textContent : ''; }).filter(Boolean));
await A.ev(() => window._gcCo.setFilter('construction')); await sleep(1000);
let s = await shown();
ok('Construction Leads: the GC bids (asbestos, mold, plain) — no residential / Environmental-only leads', s.join() === 'LBzz Asb Bid,LBzz Mold Bid,LBzz Plain Bid', s);
let ch = await chips();
ok('…the abatement bids wear "☢️ abatement scope" (the plain bid none)', ch.length === 2 && ch.every(x => /☢️ abatement scope$/.test(x)) && !ch.some(x => /Tenant Finish/.test(x)), ch);
const cntC = await A.ev(() => window._gcLeadInbox.count());
await A.ev(() => window._gcCo.setFilter('environmental')); await sleep(1500);
s = await shown();
ok('Environmental Leads: the abatement / mold GC bids too, plus the residential and Environmental leads — no plain bid', s.join() === 'LBzz Asb Bid,LBzz Env Picked,LBzz Mold Bid,LBzz Mold Web,LBzz Res Lead', s);
ch = await chips();
ok('…the shared bids wear "☢️ also Environmental"', ch.length === 2 && ch.every(x => /☢️ also Environmental$/.test(x)), ch);
const cntE = await A.ev(() => window._gcLeadInbox.count());
ok('inbox counts match the pages (Construction 3 new inbox leads, Environmental 2)', cntC === 3 && cntE === 2, { cntC, cntE });
const pc = await A.ev(() => [window._gcCo.pass(window._crm.leads.find(l => l.client === 'LBzz Asb Bid'), 'lead'), window._gcCo.passLead(window._crm.leads.find(l => l.client === 'LBzz Plain Bid'), 'environmental')]);
ok('_gcCo.pass(lead) and passLead agree with leadCos', pc[0] === true && pc[1] === false, pc);
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(1200); s = await shown();
ok('Mitigation Leads: none of these', s.length === 0, s);
/* All companies → Construction's page */
await A.ev(() => window._gcCo.setFilter('all')); await sleep(1200); s = await shown();
ok('All companies (Construction view): the GC bids', s.join() === 'LBzz Asb Bid,LBzz Mold Bid,LBzz Plain Bid', s);
/* the admin's tick: "Also show on Environmental" on the plain bid */
await A.ev(() => window._gcCo.setFilter('construction')); await sleep(800); await shown();
const pid = await A.ev(() => window._crm.leads.find(l => l.client === 'LBzz Plain Bid').id);
await A.ev(id => window._gcLeadsHub.open(id), pid); await sleep(1200);
const box = await A.ev(() => { const b = document.querySelector('#gcl-drawer [data-d="alsoenv"]'); return b ? { on: b.checked } : null; });
ok('lead panel: an admin sees "Also show on Environmental" (off on a plain bid)', box && box.on === false, box);
await A.ev(() => { const b = document.querySelector('#gcl-drawer [data-d="alsoenv"]'); b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(2000);
const ac = await A.ev(id => { const l = window._crm.leads.find(x => x.id === id); return { a: l.alsoCos, cos: window._gcCo.leadCos(l) }; }, pid);
ok('…ticking it stores alsoCos ["environmental"] on that lead only → it shows on Environmental', JSON.stringify(ac.a) === '["environmental"]' && ac.cos.join() === 'construction,environmental', ac);
const other = await A.ev(() => window._crm.leads.filter(l => /^LBzz/.test(l.client) && l.client !== 'LBzz Plain Bid' && l.alsoCos).length);
ok('…no other lead changed', other === 0, other);
await A.ev(() => window._gcLeadsHub.close && window._gcLeadsHub.close());
await A.ev(() => window._gcCo.setFilter('environmental')); await sleep(1200); s = await shown();
ok('Environmental Leads now lists the ticked plain bid too', s.includes('LBzz Plain Bid'), s);
/* converting a shared lead: the job stays Construction; "🔗 Share with Environmental" is offered */
const aid = await A.ev(() => window._crm.leads.find(l => l.client === 'LBzz Asb Bid').id);
await A.page().mouse.click(5, 300); await sleep(100);   /* a real click while Environmental is picked (the stamp files new work under the picked company) */
await A.ev(id => window._setProjects(p => (p || []).concat([{ id: 'PLBZZ1', name: 'Midtown Office Abatement', client: 'Zedd Builders', leadId: id, fromLeadId: id, status: 'active', createdAt: new Date().toISOString() }])), aid);
const offer = await waitFor(A, () => { const b = document.getElementById('gc-lb-offer'); return b ? b.innerText : null; }, null, 15000);
const jc = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'PLBZZ1'); return p ? window._gcCo.ofJob(p) + '|' + (p.companyId || '') : ''; });
ok('the job made from it stays Construction (never filed under the picked Environmental)', /^construction\|(construction)?$/.test(jc), jc);
ok('…and an admin is offered "🔗 Share with Environmental"', offer && /Share with Environmental/.test(offer), offer);
await A.ev(() => document.querySelector('#gc-lb-offer [data-lb-share]').click()); await sleep(2000);
const sw = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'PLBZZ1'); return { sw: p.sharedWith, env: window._gcCo.filter() === 'environmental' && window._gcCo.passJob(p) }; });
ok('…Share → job.sharedWith ["environmental"]: it shows on Environmental\'s lists', JSON.stringify(sw.sw) === '["environmental"]' && sw.env === true, sw);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('LEADBOTH ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
