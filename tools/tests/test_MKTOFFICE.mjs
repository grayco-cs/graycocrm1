// test_MKTOFFICE.mjs <build-dir> — patch MKTOFFICE in the browser, on the company's REAL data: the read-only snapshot of every
// gc_kv row (tools/qa/qa_lib.mjs) loaded into the offline harness's fake cloud — nothing is ever written live, nothing is sent.
// The people are the snapshot's own users (by role: admin, office, PM, the Marketing Manager); the server (soc.js mmmsg_* /
// mm_call_lead) is the real _lib/mmmsg.js / _lib/calllead.js with an in-memory store (texts / pushes recorded, not sent).
//   A. 🔗 Marketing accounts: an admin's Marketing page has the panel on top — Google (LSA dashboard + leads, Ads, Keyword
//      Planner, Business Profile, Analytics, Search Console, Tag Manager, Merchant Center), Meta (Business Suite, Ads Manager,
//      Events Manager, Instagram, the Facebook Page), Angi / Nextdoor / Yelp / BBB, the website editor and the review link; every
//      link opens a new tab; the admin adds an account-ID label (📋 Copy) in the marketing settings; a password-like label is
//      refused. The Marketing Manager has it (no editing); a PM and the office do not. Field ☰ More: admin yes, PM no.
//   B. 📞 Log a phone call lead (admin): "How did you hear?" is required; a "Google search" call and a "Did not ask" call are
//      saved as leads (source "Phone call", sourceChannel phone, howHeard, mkChannel) and 📣 Marketing → 📊 Dashboard counts them
//      under "Google organic" and "Phone call (source not asked)" this month (+1 each). The lead page shows 🗣 How did you hear
//      and changes it. The office has 📞 Log a phone call + 📋 Call script on Leads; a PM has neither.
//   C. 📋 Call script (office): opens from Leads; greeting, the 8 questions, the 3 companies, who gets the lead (with today's
//      names), common questions, Do NOT promise, the closing; 🖨 Print prints only the script; the answers → "Start a lead from
//      this call" → the form is filled → saved with "Nextdoor". An admin edits a line and it is saved (gc_kv gc_call_script).
//   D. 💬 Message marketing: an admin sends from Marketing → the server stores it and texts the Marketing Manager's cell (a
//      made-up cell in the test's server copy — the snapshot's record has none, reported); 💬 Messages lists "Marketing — <name>";
//      the Marketing Manager's Marketing page shows "💬 Messages with the owners (1)", he reads and replies → the admin gets the
//      push + text (recorded) and sees the reply.
//   E. GrayCo Field (iPhone): admin ☰ More → Office has 🔗 Marketing accounts, 📞 Log a phone call lead, 📋 Call script,
//      💬 Message marketing (the script opens there); a PM has none of them.
//   No page errors.
// Usage: node test_MKTOFFICE.mjs <dir with index.html> [--snap <dir>]   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SCR = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const build = path.resolve(process.argv[2] || '.');
const argv = process.argv.slice(3); const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const H = await import(pathToFileURL(HARNESS).href);
const L = await import(pathToFileURL(path.join(build, 'tools/qa/qa_lib.mjs')).href);
const sleep = H.sleep;
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

/* ── the real-data snapshot in the fake cloud ── */
const snapDir = opt('snap', L.latestSnap(path.join(SCR, 'qa', 'snap')));
if (!snapDir) { console.error('no snapshot under ' + path.join(SCR, 'qa', 'snap')); process.exit(2); }
const snap = L.readSnap(snapDir);
const nRows = L.loadIntoHarness(H, snap);
const { map, users } = L.accountsFromSnap(H, snap);
const em = u => String(u && u.email || '').toLowerCase();
const ADMIN = em(map.admin), OFFICE = em(map.office), PM = em(map.pm), MKT = em(map.marketing);
console.log('snapshot ' + path.basename(snapDir) + ': ' + nRows + ' rows, ' + users.length + ' people; roles found: admin ' + !!ADMIN + ', office ' + !!OFFICE + ', PM ' + !!PM + ', marketing ' + !!MKT);
ok(ADMIN && OFFICE && PM && MKT, 'the snapshot has an admin, the office, a PM and the Marketing Manager (by role)');
const mktRec = users.find(u => em(u) === MKT) || {};
const mktCell = String(mktRec.cell || mktRec.mobile || mktRec.cellPhone || mktRec.phone || '').replace(/\D/g, '');
console.log('    the Marketing Manager\'s CRM people record: ' + (/\d{10}/.test(mktCell) ? 'a cell is on file' : 'NO cell on file (his texts cannot go until one is added)') + '; e-mail outside @grayco-cs.com: ' + !/@grayco-cs\.com$/.test(MKT));

/* ── the server, offline: the real libs with an in-memory store ── */
const MSG = require(path.join(build, 'netlify/functions/_lib/mmmsg.js'));
const CL = require(path.join(build, 'netlify/functions/_lib/calllead.js'));
const KV = new Map(), SENT = { sms: [], push: [], text: [] }, INBOX = [];
const FAKE_CELL = '9015550177';   /* made up — the test's server copy only */
Object.assign(MSG._D, {
  kvGet: async k => KV.has(k) ? JSON.parse(JSON.stringify(KV.get(k))) : null,
  kvCas: async (k, f) => { const v = f(KV.has(k) ? JSON.parse(JSON.stringify(KV.get(k))) : null); if (v !== undefined) KV.set(k, v); return v; },
  people: async () => ({ users: users.map(u => em(u) === MKT ? Object.assign({}, u, { cell: FAKE_CELL }) : u), staff: [{ email: MKT, name: mktRec.name, role: 'staff', active: false, profile: 'marketing', mkt_active: true }] }),
  quiet: async () => false, optouts: async () => ({}),
  sms: async (to, body) => { SENT.sms.push({ to, body }); return { ok: true }; },
  push: async (emails, payload) => { SENT.push.push({ emails, payload }); return { to: emails.slice() }; },
  text: async o => { SENT.text.push(o); return { to: o.only.slice() }; }
});
CL._D.kvCas = async (k, f) => { const v = f(INBOX.slice()); if (v !== undefined) { INBOX.length = 0; v.forEach(x => INBOX.push(x)); } return v; };
const WHO = new Map();
H.onFn('soc', async ({ body, A }) => {
  const b = typeof body === 'object' && body ? body : {}; const w = WHO.get(A.name) || {};
  if (/^mmmsg_/.test(b.op)) { const r = await MSG.op(b.op, b, w, w.marketing ? { marketing: true } : { admin: w.role === 'admin' }); return r.out; }
  if (b.op === 'mm_call_lead') return w.marketing ? await CL.add(b, w) : { ok: false, error: 'marketing only' };
  if (b.op === 'mm_boot') return { ok: true, role: 'marketing', name: w.name, stage: 1, mm: { soldValues: true } };
  return { ok: true, configured: false, items: [], rows: [], list: [] };
});

const OPEN = [];
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} }; d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
async function launch(name, email, role, o = {}){
  const c = await H.computer(name, Object.assign({ build }, o)); OPEN.push(c);
  WHO.set(name, { ok: true, email, name: (users.find(u => em(u) === email) || {}).name || email, role, marketing: role === 'marketing' });
  if (role === 'marketing') {
    await c.ctx.route(u => /\/rest\/v1\/gc_staff/.test(u), async r => {
      const u = new URL(r.request().url()), e = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, ''));
      const row = e === MKT ? [{ email: MKT, name: mktRec.name, role: 'staff', active: false, profile: 'marketing', mkt_active: true }] : (H.ACCOUNTS[e] ? [{ email: e, name: H.ACCOUNTS[e].name, role: H.ACCOUNTS[e].role, active: true, profile: '' }] : []);
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(row) });
    });
  }
  ok(await H.signIn(c, email, 60000), name + ' signs in');
  await H.waitFor(c, () => !!window._gcCallLead && !!window._gcGQL, null, 60000);
  return c;
}
const view = (c, v) => c.ev(v => { try { window._setView(v); } catch (e) {} }, v).catch(e => { console.log('    (the page was reloading: ' + String(e && e.message).slice(0, 80) + ')'); });   /* a reload while the page settles (navigation) */
const mktHome = async c => { await view(c, 'marketing'); await H.waitFor(c, () => { const g = document.querySelector('.gmt'); return g && window._gcMktExt && window._gcMktExt.UI && window._gcMktExt.UI.root && window._gcMktExt.UI.root.isConnected ? 1 : 0; }, null, 60000);
  await c.ev(() => { try { if (window._gcMktExt.UI.sec !== 'home') window._gcMkt.go('home'); } catch (e) {} }); return H.waitFor(c, () => window._gcMktExt.UI.sec === 'home' && document.querySelector('.gmt') ? 1 : 0, null, 20000); };
const dashCount = async (c, ch) => c.ev(ch => { const tr = document.querySelector('[data-gmm="sources"] tr[data-gmm-ch="' + ch + '"]'); return tr ? +tr.children[1].textContent.trim() : 0; }, ch);
async function dash(c){ await c.ev(() => window._gcMkt.go('dashboard')); return H.waitFor(c, () => !!document.querySelector('[data-gmm="sources"]'), null, 60000); }
/* fill and save the 📞 form that is open */
async function fillForm(c, f){
  return c.ev(f => {
    const ov = document.getElementById('gc-cl-ov'); const q = k => ov.querySelector('[data-cl="' + k + '"]');
    const set = (k, v) => { const e = q(k); if (!e || v == null) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
    Object.keys(f).forEach(k => set(k, f[k]));
    ov.querySelector('[data-cl-save]').click(); return true;
  }, f);
}

try {
  /* ══ A + B + D(send). admin, desk ══ */
  console.log('A. 🔗 Marketing accounts — admin (desk)');
  const ad = await launch('Admin', ADMIN, 'admin');
  await mktHome(ad);
  await H.waitFor(ad, () => !!document.querySelector('.gmt .gql') && !!document.querySelector('.mko-card'), null, 30000);
  const P = await H.waitFor(ad, () => { const g = document.querySelector('.gmt .gql'); if (!g) return null; const body = document.querySelector('.gmt-body');
    return { title: (g.querySelector('.gql-h b') || {}).textContent, groups: [...g.querySelectorAll('[data-gql-g]')].map(x => x.getAttribute('data-gql-g')), links: [...g.querySelectorAll('a.gql-a')].map(a => ({ k: a.getAttribute('data-gql-k'), href: a.getAttribute('href'), t: a.getAttribute('target'), rel: a.getAttribute('rel') })),
      top: !!body && body.firstElementChild === g, card: !!document.querySelector('.mko-card[data-mko="admin"] [data-mko-act="msg"]'), edit: !!g.querySelector('[data-gql-edit]'), cid: (g.querySelector('[data-gql-cid]') || {}).textContent }; }, null, 60000);
  ok(!!P && P.title === '🔗 Marketing accounts' && P.top, 'the "🔗 Marketing accounts" panel is first on the admin\'s Marketing page', P && { title: P.title, top: P.top });
  const LK = P ? Object.fromEntries(P.links.map(x => [x.k, x])) : {};
  ok(P && ['google', 'meta', 'list', 'web'].every(g => P.groups.includes(g)), 'grouped: Google · Meta · Listings · Website & reviews', P && P.groups);
  ok(['lsa', 'lsaleads', 'gads', 'kwp', 'gbp', 'ga', 'gsc', 'gtm', 'gmc'].every(k => LK[k] && /^https:\/\//.test(LK[k].href)), 'Google: LSA dashboard + leads, Google Ads, Keyword Planner, Business Profile, Analytics, Search Console, Tag Manager, Merchant Center', Object.keys(LK));
  ok(LK.metabs && LK.metabs.href === 'https://business.facebook.com/' && LK.metaads && LK.metaads.href === 'https://adsmanager.facebook.com/' && LK.metaev && LK.metaev.href === 'https://business.facebook.com/events_manager2' && LK.ig && LK.ig.href === 'https://www.instagram.com/' && LK.fbpage && /^https:\/\/www\.facebook\.com\//.test(LK.fbpage.href),
    'Meta: Business Suite, Ads Manager, Events Manager, Instagram, the Facebook Page (the exact links)', ['metabs', 'metaads', 'metaev', 'ig', 'fbpage'].map(k => LK[k] && LK[k].href));
  ok(['angi', 'nextdoor', 'yelp', 'bbb', 'site', 'review'].every(k => LK[k] && /^https:\/\//.test(LK[k].href)), 'Angi / Nextdoor / Yelp / BBB, the website editor and the review link', ['angi', 'nextdoor', 'yelp', 'bbb', 'site', 'review'].map(k => LK[k] && LK[k].href));
  ok(P && P.links.every(x => x.t === '_blank' && /noopener/.test(x.rel)), 'every link opens a new tab (noopener)');
  ok(P && P.edit && P.cid === '555-434-6278', 'admin: ✏ Edit, the LSA customer ID label');
  ok(P && P.card, 'admin: "💬 Message marketing" on the Marketing home');
  /* an account-ID label */
  await ad.ev(() => document.querySelector('.gql [data-gql-edit]').click()); await sleep(700);
  const idr = await ad.ev(() => new Promise(r => { const g = document.querySelector('.gql'); g.querySelector('[data-gql-idv="metaads"]').value = 'act_1234567890'; g.querySelector('[data-gql-save]').click();
    setTimeout(() => { const c = document.querySelector('.gql [data-gql-idk="metaads"]'); r({ chip: c ? c.textContent : null, copy: c ? c.querySelector('[data-gql-copy]').getAttribute('data-gql-copy') : null, cfg: (window._gcMktExt.cfg().quickLinks || {}).ids }); }, 900); }));
  ok(idr.chip && /act_1234567890/.test(idr.chip) && idr.copy === 'act_1234567890' && idr.cfg && idr.cfg.metaads === 'act_1234567890', 'admin sets an account-ID label: shown beside the link with 📋 Copy, kept in the marketing settings', idr);
  const badId = await ad.ev(() => new Promise(r => { document.querySelector('.gql [data-gql-edit]').click(); setTimeout(() => { const g = document.querySelector('.gql'); g.querySelector('[data-gql-idv="gads"]').value = 'password: hunter2'; g.querySelector('[data-gql-save]').click(); setTimeout(() => r({ saved: ((window._gcMktExt.cfg().quickLinks || {}).ids || {}).gads || '', form: !!document.querySelector('.gql [data-gql-form]') }), 600); }, 600); }));
  ok(!badId.saved && badId.form, 'a password-like label is refused (no passwords in the CRM)', badId);
  await ad.ev(() => { const b = document.querySelector('.gql [data-gql-form] [data-gql-edit]'); if (b) b.click(); window._gcMktExt.setCfg({ quickLinks: { urls: {}, extra: [], cid: '555-434-6278', ids: {} } }); });

  console.log('B. 📞 Log a phone call lead — admin, and the Dashboard');
  await dash(ad); await sleep(2500);
  const before = { org: await dashCount(ad, 'Google organic'), na: await dashCount(ad, 'Phone call (source not asked)') };
  console.log('    Dashboard before: ' + JSON.stringify(before));
  await ad.ev(() => window._gcCallLead.open({}));
  await H.waitFor(ad, () => !!document.getElementById('gc-cl-ov'), null, 5000);
  await fillForm(ad, { name: 'Jordan Mkotest', phone: '9015550142', need: 'Water stain on the kitchen ceiling', service: 'water' });
  const req = await ad.ev(() => (document.querySelector('#gc-cl-ov [data-cl-msg]') || {}).textContent);
  ok(/How did you hear/.test(req), '"How did you hear about us?" is required (not saved without it)', req);
  await fillForm(ad, { heard: 'Google search' });
  const L1 = await H.waitFor(ad, () => { const l = window.__gcCallLeadLast; return !document.getElementById('gc-cl-ov') && l && l.name === 'Jordan Mkotest' ? l : null; }, null, 8000);
  ok(L1 && L1.source === 'Phone call' && L1.sourceChannel === 'phone' && L1.howHeard === 'Google search' && L1.mkChannel === 'Google organic' && L1.companyId === 'mitigation', 'saved: source "Phone call", sourceChannel phone, howHeard "Google search", counts under Google organic, filed under Mitigation (water)', L1 && { source: L1.source, ch: L1.sourceChannel, h: L1.howHeard, mk: L1.mkChannel, co: L1.companyId, pm: L1.pm });
  await ad.ev(() => window._gcCallLead.open({}));
  await fillForm(ad, { name: 'Riley Mkotest', phone: '9015550143', need: 'Bathroom remodel', service: 'remodel', heard: '__none__' });
  const L2 = await H.waitFor(ad, () => { const l = window.__gcCallLeadLast; return l && l.name === 'Riley Mkotest' ? l : null; }, null, 8000);
  ok(L2 && L2.howHeard === '' && L2.mkChannel === 'Phone call (source not asked)', '"Did not ask" → Phone call (source not asked)', L2 && { h: L2.howHeard, mk: L2.mkChannel });
  const inList = await H.waitFor(ad, ids => { const l = (window._crm.leads || []).filter(x => ids.includes(x.id)); return l.length === 2 ? l.length : 0; }, [L1 && L1.id, L2 && L2.id], 20000);
  ok(inList === 2, 'both calls are on the Leads list', inList);
  let after = null;
  for (let i = 0; i < 12; i++) { await dash(ad); await sleep(2000); after = { org: await dashCount(ad, 'Google organic'), na: await dashCount(ad, 'Phone call (source not asked)') }; if (after.org === before.org + 1 && after.na === before.na + 1) break; await sleep(2500); }
  console.log('    Dashboard after: ' + JSON.stringify(after));
  ok(after && after.org === before.org + 1 && after.na === before.na + 1, '📊 Dashboard: Google organic +1 and "Phone call (source not asked)" +1 this month', { before, after });
  const why = await ad.ev(() => { const d = document.querySelector('[data-gmm-list="Google organic"]'); return d ? d.textContent : ''; });
  ok(/Jordan Mkotest/.test(why) && /howHeard "Google search"/.test(why), 'the lead behind the number says why: lead: howHeard "Google search"', why.slice(0, 200));
  /* the lead page */
  await view(ad, 'leads'); await sleep(2500);
  await ad.ev(id => window._gcOpenLead(id), L2.id);
  const dr = await H.waitFor(ad, () => { const r = document.querySelector('#gcl-drawer [data-mko-heard]'); return r ? r.innerText : null; }, null, 20000);
  ok(!!dr && /How did you hear/.test(dr) && /Phone call \(source not asked\)/.test(dr), 'the lead page: 🗣 How did you hear (not asked yet) · counts under Phone call (source not asked)', dr);
  await ad.ev(() => { const sel = document.querySelector('#gcl-drawer [data-mko-heard-sel]'); sel.value = 'Yard sign / truck'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  const ch2 = await H.waitFor(ad, id => { const l = (window._crm.leads || []).find(x => x.id === id); return l && l.howHeard === 'Yard sign / truck' ? l.mkChannel : null; }, L2.id, 8000);
  ok(ch2 === 'Yard sign', 'changed on the lead page → howHeard "Yard sign / truck", counts under Yard sign', ch2);
  ok(await ad.ev(() => !!document.querySelector('#gc-leads-hub #gc-cl-btn') && !!document.querySelector('#gc-leads-hub #gc-cs-btn')), 'admin: Leads has 📞 Log a phone call and 📋 Call script');

  console.log('D. 💬 Message marketing — admin');
  await mktHome(ad); await H.waitFor(ad, () => !!document.querySelector('.mko-card [data-mko-act="msg"]'), null, 20000);
  await ad.ev(() => document.querySelector('.mko-card [data-mko-act="msg"]').click());
  const to = await H.waitFor(ad, () => { const o = document.getElementById('gc-mmmsg-ov'); const p = o && o.querySelector('[data-mm-pick]'); return p && /To:/.test(p.textContent) ? p.textContent : null; }, null, 15000);
  ok(!!to && to.indexOf(mktRec.name) >= 0, 'the sheet is addressed to the Marketing Manager (found by the marketing profile)', to);
  await ad.ev(() => { const o = document.getElementById('gc-mmmsg-ov'); o.querySelector('[data-mm-text]').value = 'Please check the Nextdoor post before Friday.'; o.querySelector('[data-mm-send]').click(); });
  const out = await H.waitFor(ad, () => { const o = document.getElementById('gc-mmmsg-ov'); const t = o && o.querySelector('[data-mm-out]').textContent; return t && /🔔/.test(t) ? t : null; }, null, 15000);
  ok(!!out && /text to the cell/.test(out), 'sent: "🔔 <name>: text to the cell"', out);
  const stored = (KV.get(MSG.KEY) || { msgs: [] }).msgs;
  ok(stored.length === 1 && stored[0].thread === MKT && stored[0].fromRole === 'admin', 'the server stored it in his thread', stored.map(m => ({ th: m.thread === MKT, r: m.fromRole })));
  ok(SENT.sms.length === 1 && SENT.sms[0].to === FAKE_CELL && /^GrayCo: .+ \(admin\): Please check the Nextdoor post/.test(SENT.sms[0].body), 'the notify call: a GrayCo text to his CRM cell', SENT.sms);
  await ad.ev(() => document.getElementById('gc-mmmsg-ov').remove());
  await view(ad, 'messages');
  const row = await H.waitFor(ad, () => { const b = document.querySelector('#gc-rp-msg [data-mmmsg-open]'); return b ? b.textContent : null; }, null, 20000);
  ok(!!row && /Marketing —/.test(row), '💬 Messages: "💬 Marketing — <name>" on top', row);
  ok(!ad.errs.length, 'no page errors (admin desk)', ad.errs.slice(0, 5));

  /* ══ D. the Marketing Manager ══ */
  console.log('D. the Marketing Manager (desk)');
  const mm = await launch('Marketing', MKT, 'marketing');
  const mc = await H.waitFor(mm, () => { const g = document.querySelector('.gmt .gql'), c = document.querySelector('.mko-card[data-mko="mm"]'); const n = c && c.querySelector('[data-mko-n]'); return g && c && n && n.textContent === '1' ? { gql: g.querySelectorAll('a.gql-a').length, edit: !!g.querySelector('[data-gql-edit]'), n: n.textContent } : null; }, null, 120000);
  ok(!!mc && mc.gql >= 20 && !mc.edit, 'his Marketing page: the accounts panel (no editing) and "💬 Messages with the owners (1)"', mc);
  await mm.ev(() => document.querySelector('.mko-card [data-mko-act="msg"]').click());
  const th = await H.waitFor(mm, () => { const o = document.getElementById('gc-mmmsg-ov'); const m = o && o.querySelector('.mko-m'); return m ? o.querySelector('[data-mm-th]').innerText : null; }, null, 15000);
  ok(!!th && /Nextdoor post before Friday/.test(th), 'he reads the admin\'s message', th);
  await mm.ev(() => { const o = document.getElementById('gc-mmmsg-ov'); o.querySelector('[data-mm-text]').value = 'Done — posted it this morning.'; o.querySelector('[data-mm-send]').click(); });
  const mout = await H.waitFor(mm, () => { const t = (document.querySelector('#gc-mmmsg-ov [data-mm-out]') || {}).textContent; return t && /🔔/.test(t) ? t : null; }, null, 15000);
  ok(!!mout, 'he replies', mout);
  const lastText = SENT.text[SENT.text.length - 1], lastPush = SENT.push[SENT.push.length - 1];
  ok(lastText && lastText.only.includes(ADMIN) && lastPush && lastPush.emails.includes(ADMIN), 'the admin who wrote him gets the push + the staff text', { text: lastText && lastText.only, push: lastPush && lastPush.emails });
  const read = (KV.get(MSG.KEY).msgs[0].readBy || {})[MKT];
  ok(!!read, 'the admin\'s message is marked read by him');
  ok(await mm.ev(() => !!document.querySelector('.mko-card [data-mko-act="call"]')), 'his page has 📞 Log a phone call lead');
  await mm.ev(() => { document.getElementById('gc-mmmsg-ov').remove(); window._gcCallLead.open({}); });
  await fillForm(mm, { name: 'Casey Mkotest', phone: '9015550144', need: 'Mold in the crawl space', service: 'mold', heard: 'Facebook / Instagram' });
  const inb = await (async () => { for (let i = 0; i < 30; i++) { if (INBOX.length) return INBOX[INBOX.length - 1]; await sleep(300); } return null; })();
  ok(inb && inb.source === 'Phone call' && inb.leadExtra.howHeard === 'Facebook / Instagram' && inb.leadExtra.mkChannel === 'Facebook/Instagram Ads' && inb.companyId === 'environmental', 'his call goes to the Lead Inbox (he cannot write the Leads list): source, howHeard, channel, Environmental', inb && { s: inb.source, h: inb.leadExtra.howHeard, ch: inb.leadExtra.mkChannel, co: inb.companyId });
  ok(!mm.errs.length, 'no page errors (Marketing Manager)', mm.errs.slice(0, 5));
  await mm.close();
  /* the admin sees the reply */
  await mktHome(ad); await sleep(1000);
  await ad.ev(() => window._gcMMMsg.list());
  await ad.ev(() => window._gcMMMsg.open());
  const rep = await H.waitFor(ad, () => { const o = document.getElementById('gc-mmmsg-ov'); return o && /posted it this morning/.test(o.innerText) ? 1 : 0; }, null, 15000);
  ok(rep === 1, 'the admin sees his reply in the thread');
  await ad.close();

  /* ══ C. the office ══ */
  console.log('C. 📋 Call script — the office (desk)');
  const of = await launch('Office', OFFICE, 'office');
  let ob = 0;
  for (let i = 0; i < 9 && ob !== 1; i++) { await view(of, 'leads'); ob = await H.waitFor(of, () => !!document.querySelector('#gc-leads-hub #gc-cl-btn') && !!document.querySelector('#gc-leads-hub #gc-cs-btn') ? 1 : 0, null, 10000); }
  ok(ob === 1, 'office: Leads has 📞 Log a phone call and 📋 Call script', await of.ev(() => ({ hub: !!document.getElementById('gc-leads-hub'), views: !!document.querySelector('#gc-leads-hub .gclu-views'), can: window._gcCallLead.can(), v: localStorage.getItem('grayco_view') })));
  await of.ev(() => document.getElementById('gc-cs-btn').click());
  const cs = await H.waitFor(of, () => { const o = document.getElementById('gc-cs-ov'); if (!o || !o.querySelector('.mko-cs')) return null;
    return { greet: (o.querySelector('[data-cs-greet]') || {}).textContent, qs: o.querySelectorAll('[data-cs-q]').length, cos: [...o.querySelectorAll('[data-cs-co]')].map(x => x.getAttribute('data-cs-co')), rt: [...o.querySelectorAll('[data-cs-rt]')].map(x => [x.getAttribute('data-cs-rt'), x.querySelector('.who').textContent]),
      faq: o.querySelectorAll('[data-cs-faq]').length, dont: o.querySelectorAll('.dont li').length, close: (o.querySelector('[data-cs-close]') || {}).textContent, edit: !!o.querySelector('[data-cs-edit]'), txt: o.textContent }; }, null, 20000);
  ok(cs && /Thank you for calling GrayCo/.test(cs.greet) && cs.qs === 8 && cs.cos.join() === 'construction,mitigation,environmental' && cs.faq >= 6 && cs.dont >= 3 && /Thank you for calling GrayCo/.test(cs.close), 'the script: greeting, 8 questions, the 3 companies, common questions, Do NOT promise, the closing', cs && { q: cs.qs, cos: cs.cos, faq: cs.faq, dont: cs.dont });
  ok(cs && ['emergency', 'mit', 'env', 'res', 'com', 'lsa', 'bid'].every(k => cs.rt.some(r => r[0] === k)), 'who gets the lead: emergency (on call), mitigation, environmental, residential, commercial, Google LSA, bids', cs && cs.rt);
  console.log('    routing today: ' + JSON.stringify(cs && cs.rt.map(r => r[0] + '=' + (/nobody/.test(r[1]) ? '(not set)' : 'a person'))));
  ok(cs && /check or cash/.test(cs.txt) && /Bartlett/.test(cs.txt) && /DeSoto/.test(cs.txt) && /free/.test(cs.txt) && /licensed/i.test(cs.txt), 'the answers: free estimates, insurance, how soon, licensed / insured, check or cash, Memphis / Bartlett / DeSoto …');
  ok(cs && !cs.edit, 'the office cannot edit the script (admins do)');
  const pr = await of.ev(() => new Promise(r => { let n = 0, cls = false; window.print = () => { n++; cls = document.body.classList.contains('mko-printing'); }; document.querySelector('#gc-cs-ov [data-cs-print]').click();
    setTimeout(() => { const css = [...document.styleSheets].some(s => { try { return [...s.cssRules].some(x => /mko-printing/.test(x.cssText)); } catch (e) { return false; } }); r({ n, cls, css }); }, 600); }));
  ok(pr.n === 1 && pr.cls && pr.css, '🖨 Print: the browser print, with only the script on the page', pr);
  await of.ev(() => { const o = document.getElementById('gc-cs-ov'); const set = (k, v) => { const e = o.querySelector('[data-cs-a="' + k + '"]'); e.value = v; };
    set('name', 'Morgan Mkotest'); set('phone', '9015550145'); set('address', '12 Demo Ln, Bartlett'); set('need', 'Roof leak after the storm'); set('service', 'roofing'); set('emergency', 'no'); set('insurance', 'yes'); set('carrier', 'Demo Mutual'); set('claim', 'CLM-0001'); set('timeline', 'This week'); set('heard', 'site'); set('heardDetail', 'Nextdoor');
    o.querySelector('[data-cs-lead]').click(); });
  const pf = await H.waitFor(of, () => { const o = document.getElementById('gc-cl-ov'); if (!o) return null; const q = k => (o.querySelector('[data-cl="' + k + '"]') || {}).value; return { name: q('name'), phone: q('phone'), addr: q('address'), need: q('need'), svc: q('service'), heard: q('heard'), site: q('site'), ins: q('ins'), carrier: q('carrier'), claim: q('claim'), tl: q('timeline'), route: (o.querySelector('[data-cl-route]') || {}).textContent }; }, null, 8000);
  ok(pf && pf.name === 'Morgan Mkotest' && pf.phone === '(901) 555-0145' && pf.svc === 'roofing' && pf.heard === 'site' && pf.site === 'Nextdoor' && pf.ins === 'yes' && pf.carrier === 'Demo Mutual' && pf.claim === 'CLM-0001' && pf.tl === 'This week', '"Start a lead from this call": every answer is in the form', pf);
  ok(pf && /Roofing PM|Senior PM/.test(pf.route), 'the form says who gets it (the script\'s routing)', pf && pf.route);
  await of.ev(() => document.querySelector('#gc-cl-ov [data-cl-save]').click());
  const L3 = await H.waitFor(of, () => { const l = window.__gcCallLeadLast; return l && l.name === 'Morgan Mkotest' && !document.getElementById('gc-cl-ov') ? l : null; }, null, 8000);
  ok(L3 && L3.howHeard === 'Nextdoor' && L3.mkChannel === 'Nextdoor' && L3.claimNumber === 'CLM-0001' && L3.isInsurance === true && L3.type === 'Roofing', 'saved from the script: Nextdoor (counts under Nextdoor), the claim # on the lead (internal), Roofing', L3 && { h: L3.howHeard, ch: L3.mkChannel, c: L3.claimNumber, t: L3.type });
  await mktHome(of); await sleep(2500);
  const og = await of.ev(() => ({ gql: !!document.querySelector('.gql'), card: !!document.querySelector('.mko-card[data-mko="office"]'), msg: !!document.querySelector('.mko-card [data-mko-act="msg"]') }));
  ok(!og.gql && og.card && !og.msg, 'office: no Marketing accounts panel, no "Message marketing"; the 📞 / 📋 card is there', og);
  ok(!of.errs.length, 'no page errors (office)', of.errs.slice(0, 5));
  await of.close();

  /* admin edits the script */
  console.log('C. an admin edits the call script');
  const ad2 = await launch('Admin2', ADMIN, 'admin');
  await ad2.ev(() => window._gcCallScript.open());
  await H.waitFor(ad2, () => !!document.querySelector('#gc-cs-ov [data-cs-edit]') && !!document.querySelector('#gc-cs-ov .mko-cs'), null, 20000);
  await ad2.ev(() => document.querySelector('#gc-cs-ov [data-cs-edit]').click());
  await H.waitFor(ad2, () => !!document.querySelector('#gc-cs-ov [data-cse="greeting"]'), null, 5000);
  await ad2.ev(() => { const o = document.getElementById('gc-cs-ov'); o.querySelector('[data-cse="greeting"]').value = 'Thank you for calling GrayCo — this is the office. How can I help?'; const f = o.querySelector('[data-cse="faq"]'); f.value += '\nDo you work weekends? | Emergencies, yes — 24/7.'; o.querySelector('[data-cs-save]').click(); });
  const sv = await H.waitFor(ad2, () => { const g = document.querySelector('#gc-cs-ov [data-cs-greet]'); return g && /this is the office/.test(g.textContent) ? document.querySelectorAll('#gc-cs-ov [data-cs-faq]').length : 0; }, null, 10000);
  const cloud = H.cget('gc_call_script');
  ok(sv >= 8 && cloud && /this is the office/.test(cloud.greeting) && cloud.faq.some(r => /weekends/.test(r[0])), 'saved: the new greeting and the new question show, and the script is in gc_kv gc_call_script', { sv, cloud: cloud && cloud.greeting });
  ok(!ad2.errs.length, 'no page errors (admin, script)', ad2.errs.slice(0, 5));
  await ad2.close();

  /* ══ A. a PM ══ */
  console.log('A/B. a PM (desk)');
  const pm = await launch('PM', PM, 'pm');
  await mktHome(pm); await sleep(3000);
  const pmM = await pm.ev(() => ({ gql: !!document.querySelector('.gql'), card: !!document.querySelector('.mko-card'), can: window._gcGQL.can(), log: window._gcCallLead.can(), msg: window._gcMMMsg.can() }));
  ok(!pmM.gql && !pmM.card && !pmM.can && !pmM.log && !pmM.msg, 'PM: no Marketing accounts panel, no 📞 / 💬', pmM);
  await view(pm, 'leads'); await sleep(4000);
  ok(await pm.ev(() => !document.getElementById('gc-cl-btn') && !document.getElementById('gc-cs-btn')), 'PM: Leads has no 📞 Log a phone call / 📋 Call script');
  ok(!pm.errs.length, 'no page errors (PM desk)', pm.errs.slice(0, 5));
  await pm.close();

  /* ══ E. GrayCo Field ══ */
  console.log('E. GrayCo Field (iPhone)');
  const tapMore = async c => { const Lc = c.page().locator('#gc-fh-tabs [data-t="more"]').first(); const bb = await Lc.boundingBox().catch(() => null);
    if (bb) await c.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await c.ev(() => { const b = document.querySelector('#gc-fh-tabs [data-t="more"]'); if (b) b.click(); }); };
  const moreRows = async c => { for (let i = 0; i < 4; i++) { await c.ev(() => { document.querySelectorAll('.gc-fh-sheet').forEach(o => o.remove()); }); if (i % 2) await c.ev(() => { try { window._gcRA.more(); } catch (e) { const b = document.querySelector('#gc-fh-tabs [data-t="more"]'); if (b) b.click(); } }); else await tapMore(c);   /* the tap, else ☰ More's own opener (_gcRA.more) */
    const r = await H.waitFor(c, () => { const o = [...document.querySelectorAll('.gc-fh-sheet[data-ra-more]')].pop(); return o ? [...o.querySelectorAll('[data-ra-a]')].map(b => b.getAttribute('data-ra-a') + '=' + b.textContent.replace(/\s+/g, ' ').trim()) : null; }, null, 6000); if (r) return r; await sleep(2000); } return null; };
  const fa = await launch('AdminPhone', ADMIN, 'admin', { mobile: true, init: INIT });
  await H.waitFor(fa, () => !!document.querySelector('#gc-fh-tabs [data-t="more"]') && !!document.querySelector('#_gcJobPick'), null, 60000); await sleep(3000);
  const ar = await moreRows(fa);
  const has = (rows, k, rx) => !!rows && rows.some(r => r.startsWith(k + '=') && rx.test(r));
  ok(has(ar, 'gql', /Marketing accounts/) && has(ar, 'calllead', /Log a phone call lead/) && has(ar, 'callscript', /Call script/) && has(ar, 'mmmsg', /Message marketing/), 'admin ☰ More → Office: 🔗 Marketing accounts, 📞 Log a phone call lead, 📋 Call script, 💬 Message marketing', ar && ar.filter(r => /^(gql|calllead|callscript|mmmsg)=/.test(r)));
  await fa.ev(() => [...document.querySelectorAll('.gc-fh-sheet[data-ra-more] [data-ra-a="callscript"]')].pop().click());
  const fcs = await H.waitFor(fa, () => { const o = document.getElementById('gc-cs-ov'); return o && o.querySelector('.mko-cs') ? Math.round(o.querySelector('.mko-box').getBoundingClientRect().width) : 0; }, null, 15000);
  ok(fcs > 0 && fcs <= 390, 'tap → the call script, fitting the phone', fcs);
  await fa.ev(() => document.getElementById('gc-cs-ov').remove());
  const fr = await moreRows(fa);
  await fa.ev(() => [...document.querySelectorAll('.gc-fh-sheet[data-ra-more] [data-ra-a="gql"]')].pop().click());
  const fg = await H.waitFor(fa, () => { const o = document.getElementById('gc-gql-ov'); return o ? { n: o.querySelectorAll('a.gql-a').length, w: o.querySelector('.gql').getBoundingClientRect().width, meta: !!o.querySelector('a[data-gql-k="metaads"]') } : null; }, null, 8000);
  ok(fg && fg.n >= 20 && fg.meta && fg.w <= 390, 'tap 🔗 Marketing accounts → the panel as a sheet (Google + Meta + listings), fits the phone', fg);
  ok(!fa.errs.length, 'no page errors (admin phone)', fa.errs.slice(0, 5));
  await fa.close();
  const fp = await launch('PMPhone', PM, 'pm', { mobile: true, init: INIT });
  await H.waitFor(fp, () => !!document.querySelector('#gc-fh-tabs [data-t="more"]') && !!document.querySelector('#_gcJobPick'), null, 60000); await sleep(3000);
  const pr2 = await moreRows(fp);
  if (!pr2) console.log('    PM More: ' + JSON.stringify(await fp.ev(() => ({ tabs: [...document.querySelectorAll('#gc-fh-tabs [data-t]')].map(b => b.getAttribute('data-t')), sheets: [...document.querySelectorAll('.gc-fh-sheet')].map(o => [...o.attributes].map(a => a.name).join(' ')) }))));
  const pmCan = await fp.ev(() => ({ gql: window._gcGQL.canField(), call: window._gcCallLead.can(), script: window._gcCallScript.can(), msg: window._gcMMMsg.can() }));
  const fmPm = /var FM_OFF = \{[^}]*\bpm: \[([^\]]*)\]/.exec(fs.readFileSync(path.join(build, 'index.html'), 'utf8'));
  ok((pr2 ? !pr2.some(r => /^(gql|calllead|callscript|mmmsg)=/.test(r)) : true) && !pmCan.gql && !pmCan.call && !pmCan.script && !pmCan.msg && fmPm && !/gql|calllead|callscript|mmmsg/.test(fmPm[1]),
    'PM ☰ More: none of them (' + (pr2 ? 'the sheet\'s rows' : 'the PM\'s ☰ More did not open in this harness run — checked by role: every show() is false and the PM list has none') + ')', { rows: pr2 && pr2.filter(r => /^(gql|calllead|callscript|mmmsg)=/.test(r)), pmCan, fm: fmPm && fmPm[1] });
  ok(!fp.errs.length, 'no page errors (PM phone)', fp.errs.slice(0, 5));
  await fp.close();
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
finally { for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
