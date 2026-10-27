// test_QA1027.mjs <build> — patch QA1027 on the page: LEADKIND (lead type = the AUTOCOM rule: public owners / bid sites / GC invites
// are Commercial, program work Insurance; never downgraded) on the Leads screen badge + Type filter, the admin's one-time
// "Fix lead types" (logged), new Estimate Builder leads; and the GrayCo Photos wording on the Leads screen. admin / PM / estimator / office.
import { computer, signIn, sleep, waitFor, shareBrowser, seed, stubInbox, ok, done, toLeads, cget } from '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wLEADSUX/lux_env.mjs';
const build = process.argv[2];
const shared = await shareBrowser();
/* the owner's two leads are in the fixture as the Estimate Builder made them (no type): Fayette County Fire Station, Shelby Farms Park Operation Center */
const FIRE = 'LGN_msp2rnvpnnyn', PARK = 'LGN_mspju508yo4f';
const data = seed({ leads: 60, bids: 10, inbox: 12, extra: [
  { id: 'Q_HOME', name: 'Jim Church', source: 'Referral', leadKind: 'Residential', phone: '901-555-7777', address: '12 County Line Rd, Bartlett' },
  { id: 'Q_INS', name: 'Shelby County water loss', source: 'Referral', leadKind: 'Insurance', phone: '901-555-7778' },
  { id: 'Q_PROG', name: 'Ann Claimant', source: 'Contractor Connection program', phone: '901-555-7779' },
  { id: 'Q_CC', name: 'Pat Roofowner', source: 'companycam', leadKind: 'Residential', pm: 'Steven Biffle', phone: '901-555-7780' },
  { id: 'Q_WON', name: 'Tipton County Library', source: 'Referral', leadKind: 'Residential', stage: 'Won', status: 'won' }] });
const errs = c => c.errs.filter(e => /PAGEERROR/.test(e));
const cloudL = id => (cget('leads') || []).find(l => l && l.id === id) || {};

/* ── admin ── */
let A = await computer('A', { build }); await stubInbox(A, data.inbox);
await signIn(A, 'wjohnson@grayco-cs.com', 12000);
await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^Later$/.test(x.textContent.trim())); if (b) b.click(); });
await toLeads(A, '#gc-lux .lux-card'); await sleep(6000);
const q = (fn, a) => A.ev(fn, a);
const kinds = await q(([FIRE, PARK]) => { const L = window._gcLeadsHub.kit.all(); const k = id => window._gcLeadAutoKind(L.find(l => l.id === id)); return { fire: k(FIRE), park: k(PARK), home: k('Q_HOME'), ins: k('Q_INS'), prog: k('Q_PROG'), cc: k('Q_CC') }; }, [FIRE, PARK]);
ok('page rule: county fire station + park operation center → Commercial; program → Insurance; homeowner / insurance unchanged', kinds.fire === 'Commercial' && kinds.park === 'Commercial' && kinds.prog === 'Insurance' && !kinds.home && !kinds.ins && !kinds.cc, kinds);
const card = id => q(i => { const c = document.querySelector('#gc-lux .lux-card[data-gcl-id="' + i + '"]'); return c ? c.innerText.replace(/\s+/g, ' ') : null; }, id);
await A.page().locator('#gc-lux [data-lux=q]').fill('Fayette County Fire'); await sleep(1200);
let t = await card(FIRE);
ok('badge: the county fire station is no longer "Residential" (a commercial bid)', t && !/Residential/.test(t) && /Bid|Commercial/.test(t), t);
await A.page().locator('#gc-lux [data-lux=q]').fill('Shelby Farms'); await sleep(1200);
t = await card(PARK); ok('badge: Shelby Farms Park Operation Center is not "Residential"', t && !/Residential/.test(t), t);
await A.page().locator('#gc-lux [data-lux=q]').fill(''); await sleep(800);
const pill = async v => { await q(x => { const s = document.querySelector('#gc-lux [data-lux-sel=type]'); s.value = x; s.dispatchEvent(new Event('change', { bubbles: true })); }, v); await sleep(900); return q(() => window._gcLeadsHub.filtered()); };
let ids = await pill('Commercial'); ok('Type filter Commercial includes both', ids.includes(FIRE) && ids.includes(PARK) && !ids.includes('Q_HOME'), ids.filter(x => /^Q_|^LGN_msp/.test(x)));
ids = await pill('Residential'); ok('Type filter Residential excludes them, keeps the homeowner', !ids.includes(FIRE) && !ids.includes(PARK) && ids.includes('Q_HOME'), ids.filter(x => /^Q_|^LGN_msp/.test(x)));
ids = await pill('Insurance'); ok('Type filter Insurance has the program lead', ids.includes('Q_PROG') && ids.includes('Q_INS'), ids.filter(x => /^Q_|^LGN_msp/.test(x)));
await pill('');
/* the one-time fix */
const n0 = await q(() => window._gcLeadKindCount());
ok('the fix counts the open mislabelled leads (fire, park, program; not the won one)', n0 >= 3, n0);
await q(() => document.querySelector('#gc-lux [data-lux-act=menu]').click()); await sleep(400);
const mi = await q(() => { const b = document.querySelector('#gc-lux [data-lux-act=kindfix]'); return b ? b.innerText.replace(/\s+/g, ' ') : null; });
ok('admin ⋯ menu: "Fix lead types (N)"', mi && /Fix lead types/.test(mi), mi);
A.dialogs.length = 0;
await q(() => document.querySelector('#gc-lux [data-lux-act=kindfix]').click());
const fixed = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { if (cloudL(FIRE).leadKind === 'Commercial' && cloudL(PARK).leadKind === 'Commercial') return true; await sleep(250); } return false; })();
ok('it asked first (lists what changes)', A.dialogs.some(d => /^confirm: Fix the type of \d+ open lead/.test(d) && /Fayette County Fire Station/.test(d)), A.dialogs);
ok('…then saved: both are Commercial in the cloud, with kindAuto + a history line', fixed && cloudL(FIRE).kindAuto && cloudL(FIRE).kindAuto.was === '' && (cloudL(FIRE).activity || []).some(a => /Type set to Commercial automatically/.test(a.text)), cloudL(FIRE));
ok('program lead → Insurance in the cloud', cloudL('Q_PROG').leadKind === 'Insurance', cloudL('Q_PROG').leadKind);
ok('never touched: homeowner, insurance, the won lead, the GrayCo Photos lead', cloudL('Q_HOME').leadKind === 'Residential' && cloudL('Q_INS').leadKind === 'Insurance' && cloudL('Q_WON').leadKind === 'Residential' && cloudL('Q_CC').leadKind === 'Residential' && !cloudL('Q_HOME').kindAuto);
const log = await q(() => window._gcLeadKindLog());
ok('the fix is logged (who, what, why)', Array.isArray(log) && log.some(x => x.id === FIRE && x.kind === 'Commercial' && /public owner/.test(x.why) && x.by), log.slice(0, 2));
await sleep(16000);
const left = await q(() => window._gcLeadKindFix({ dry: true })); ok('after the fix nothing is left to fix', left.plan.length === 0, left.plan);
ok('fixed leads are bids now (estimator\'s list)', await q(FIRE => window._gcIsBidLead(window._gcLeadsHub.kit.all().find(l => l.id === FIRE)), FIRE));
/* new leads from the Estimate Builder */
const nl = await q(() => { const p1 = window._gcEstimateToBidding({ id: 'EQ1', name: 'Tipton County Library', client: 'Tipton County', address: '300 W Main St, Covington, TN', type: '', mats: [{ qty: 1, uc: 1000 }], labor: [] });
  const p2 = window._gcEstimateToBidding({ id: 'EQ2', name: 'Maria Lopez kitchen', client: 'Maria Lopez', address: '45 Elm Cv, Bartlett, TN', type: 'Residential Reno', mats: [{ qty: 1, uc: 900 }], labor: [] });
  const L = window._crm.leads; const a = L.find(l => l.estimateId === 'EQ1'), b = L.find(l => l.estimateId === 'EQ2'); return { p1, p2, a: a && { k: a.leadKind, why: a.kindAuto && a.kindAuto.why }, b: b && { k: b.leadKind || '' } }; });
ok('Estimate Builder: a county library lead is created Commercial (stamped)', nl.a && nl.a.k === 'Commercial' && /public owner/.test(nl.a.why || ''), nl);
ok('Estimate Builder: a homeowner kitchen lead gets no automatic type', nl.b && nl.b.k === '', nl);
/* GrayCo Photos wording on the Leads screen */
const srcs = await q(() => window._gcLeadSources.list());
ok('lead sources say "GrayCo Photos (PM\'s own)", never CompanyCam', srcs.includes('GrayCo Photos (PM\'s own)') && !srcs.some(x => /CompanyCam/.test(x)), srcs.filter(x => /Photos|Cam/.test(x)));
ok('a companycam lead\'s source reads GrayCo Photos', (await q(() => window._gcLeadSources.canon(window._gcLeadsHub.kit.all().find(l => l.id === 'Q_CC')))) === 'GrayCo Photos (PM\'s own)');
ok('the old saved label still reads as the new one', (await q(() => window._gcLeadSources.label("CompanyCam (PM's own)"))) === 'GrayCo Photos (PM\'s own)');
const vis = await q(() => document.body.innerText);
ok('no "CompanyCam" on the Leads screen', !/CompanyCam/.test(vis), (vis.match(/.{0,40}CompanyCam.{0,40}/) || [])[0]);
ok('admin: no page errors', errs(A).length === 0, errs(A).slice(0, 3));
/* ── PM, estimator, office ── */
for (const [who, email] of [['PM', 'sbiffle@grayco-cs.com'], ['estimator', 'gmiller@grayco-cs.com'], ['office', 'office@grayco-cs.com']]) {
  const C = await computer(who, { build }); await stubInbox(C, data.inbox);
  await signIn(C, email, 12000);
  await C.ev(() => window._setView('leads')); await sleep(6000);
  const r = await C.ev(() => ({ menu: (document.querySelector('#gc-lux [data-lux-act=menu]') && (document.querySelector('#gc-lux [data-lux-act=menu]').click(), !!document.querySelector('#gc-lux [data-lux-act=kindfix]'))), fix: window._gcLeadKindFix ? 1 : 0, txt: document.body.innerText }));
  const res = await C.ev(() => window._gcLeadKindFix({}));
  ok(who + ': no "Fix lead types" and the fix refuses (not an admin)', !r.menu && res && res.skipped === 'not admin', [r.menu, res]);
  ok(who + ': no "CompanyCam" on the Leads screen', !/CompanyCam/.test(r.txt), (r.txt.match(/.{0,40}CompanyCam.{0,40}/) || [])[0]);
  if (who === 'estimator') ok('estimator: the county fire station is in the Bids list', await C.ev(FIRE => window._gcLeadsHub.kit.all().some(l => l.id === FIRE && window._gcIsBidLead(l)), FIRE));
  ok(who + ': no page errors', errs(C).length === 0, errs(C).slice(0, 3));
  try { await C.ctx.close(); } catch (e) {}
}
done(shared);
