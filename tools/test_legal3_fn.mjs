// test_legal3_fn.mjs — patch LEGAL3 on the server (offline, no network, no secrets):
//   · the ONE legal footer in the e-mail shell (brand.js) shows on a real rendered invoice e-mail, not on GrayCo News (legal:false), and in the plain-text part
//   · the one late-fee wording in the invoice PDF and the past-due reminder e-mails
//   · sub schedule texts end "Reply STOP to opt out."
//   · coupons: expiry stamped at claim (default 90 days, setting), shown in the response + e-mail, refused after it; pre-expiry coupons stay valid
//   · giveaway: newsletter is opt-in, TN / MS / AR ZIP check, owner-editable dates / prize value come back from giveawayCurrent
// Usage: node tools/test_legal3_fn.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../netlify/functions'));
Object.assign(process.env, { RESEND_API_KEY: 're_test', SITE_ORIGIN: 'https://crm.grayco-cs.com' });
delete process.env.SUPABASE_SERVICE_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); } }
const CORE = '1.5% per month (18% annual percentage rate)', MAXL = 'or the maximum rate allowed by law, whichever is less';

/* ───────── 1. the e-mail legal footer ───────── */
const B = require(path.join(SRC, '_lib/brand.js'));
const FOOT = 'This email and any attachments are intended only for the named recipient';
const LIC = 'GrayCo Construction Services · licensed GC TN #85034 BCB · AR #0486990627 · MS #27769';
{
  const portal = require(path.join(SRC, 'portal.js'));
  const inv = portal._core.invoiceMailHtml({ job: 'Smith Roof', client: 'Pat Smith', number: '1001', total: 1000, balance: 1000, due: 'Nov 30', pm: 'Sam' }, '');
  const out = await B.shellFor(inv, { email: 'billing@grayco-cs.com', name: 'GrayCo Billing' });
  ok(out.includes('data-gc-legal="1"') && out.includes(FOOT), 'a rendered invoice e-mail carries the legal footer');
  ok(out.includes(LIC), 'the footer names the three licenses: ' + LIC);
  ok((out.match(/data-gc-legal/g) || []).length === 1, 'the footer is there exactly once');
  ok(B.shell(out, {}).split('data-gc-legal').length === 2, 'a second pass through the shell does not add a second footer');
  ok(!B.shell('<p>News</p>', { sender: false, legal: false }).includes('data-gc-legal'), 'shell(..., { legal: false }) leaves it off (GrayCo News has its own footer)');
  ok(B.shell('<p>x</p>', { sender: false, portalUrl: 'https://crm.grayco-cs.com/portal.html?t=1' }).includes(FOOT), 'portal-link e-mails carry it');
  ok(B.legalText().length < 600, 'the footer is short (' + B.legalText().length + ' characters)');
  // installResend: customer mail gets the footer in html and in the plain-text part; internal mail does not
  const sent = [];
  global.fetch = async function(url, init){ sent.push({ url: String(url), body: init && init.body }); return new Response('{}', { status: 200 }); };
  B.installResend();
  await fetch('https://api.resend.com/emails', { method: 'POST', body: JSON.stringify({ to: ['pat@example.com'], subject: 'x', html: '<p>Your signed paper</p>', text: 'Your signed paper' }) });
  await fetch('https://api.resend.com/emails', { method: 'POST', body: JSON.stringify({ to: ['office@grayco-cs.com'], subject: 'x', html: '<p>internal</p>' }) });
  const c = JSON.parse(sent[0].body), i2 = JSON.parse(sent[1].body);
  ok(c.html.includes(FOOT) && c.text.includes(FOOT) && c.text.includes('licensed GC TN #85034 BCB'), 'installResend: a customer e-mail gets the footer in the html and the plain-text part');
  ok(!i2.html.includes(FOOT), 'installResend: an internal @grayco-cs.com alert is left alone');
}

/* ───────── 2. one late-fee wording: invoice PDF, past-due reminders, short contract text ───────── */
{
  const P = require(path.join(SRC, '_lib/invoice-pdf.js'));
  const pdf = P.build({ number: '1001', date: '2026-10-01', due: '2026-10-31', terms: 'Net 30', status: 'Open', client: 'Pat', address: '1 Main', email: 'a@b.co', job: 'X', pm: 'PM', lines: [{ desc: 'Roof', qty: 1, rate: 1000, amount: 1000 }], total: 1000, paid: 0, balance: 1000 }).toString('latin1');
  const pdfText = [...pdf.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map(m => m[1]).join(' ').replace(/\\([()\\])/g, '$1').replace(/\s+/g, ' ');
  ok(pdfText.includes('1.5% per month (18% annual percentage rate)') && pdfText.includes('maximum rate allowed by law, whichever is less'), 'invoice PDF shows the one late-fee wording');
  ok(!/10% per|47-14-103|\(18% annually\)/.test(pdfText), 'invoice PDF has none of the old wording');
  const ar = require(path.join(SRC, '_lib/auto-ar.js'));
  const lines = ar.letter ? [7, 15, 30].map(st => ar.letter(st, { number: '1', job: 'X', due: 'Oct 1', days: st, client: 'Pat Smith', balance: 100, paid: 0, pm: 'Sam' })) : null;
  ok(lines && lines.every(h => h.includes(CORE) && h.includes(MAXL)), 'past-due reminder e-mails (7 / 15 / 30 days) carry the one late-fee wording', lines ? lines.length : 'letter() not exported');
  ok(lines && lines.every(h => !/interest|10% per/i.test(h.replace(/data-gc-latefee/g, ''))), 'and no "interest" / "10% per annum" wording');
}

/* ───────── 3. sub schedule texts: Reply STOP to opt out ───────── */
{
  const U = require(path.join(SRC, '_lib/subtxt.js'));
  const c = U.central(Date.parse('2026-10-27T23:30:00Z')); // 6:30 PM Central the evening before 2026-10-28
  const set = { subs: { s1: { on: true, phone: '9015550123' } }, phone: {} };
  const data = { subs: [{ id: 's1', name: 'Roofer Bob', phone: '9015550123' }], projects: [{ id: 'p1', name: 'Smith Roof', address: '12 Oak St, Bartlett', status: 'Active', contractSigned: true }],
    schedule: [{ id: 'r1', pid: 'p1', subId: 's1', sub: 'Roofer Bob', date: '2026-10-28', time: '8:00 AM', title: 'Tear-off' }], gc_deleted_projects: [] };
  const ev = U.due(data, { subs: { s1: { on: true } }, phones: {} }, { rows: {} }, Date.parse('2026-10-27T23:30:00Z'));
  const mo = U.due(data, { subs: { s1: { on: true } }, phones: {} }, { rows: {} }, Date.parse('2026-10-28T12:30:00Z'));
  const texts = ev.concat(mo).map(x => x.text).filter(Boolean);
  ok(texts.length >= 2, 'the evening and the morning schedule texts are produced', { ev: ev.length, mo: mo.length, c });
  ok(texts.length >= 2 && texts.every(t => /Reply STOP to opt out\.$/.test(t)), 'every sub schedule text ends "Reply STOP to opt out."', texts);
}

/* ───────── 4. coupons + giveaway (in-memory stand-ins for the CRM store) ───────── */
const KV = {}; let DOC = { cfg: { main: { coupons: {} } }, sponsors: { truck1: { id: 'truck1', name: 'Truck 1', kind: 'truck' } }, giveaways: {} };
const FILED = [], ADDED = [], EMAILS = [];
function seed(p, exp){ require.cache[require.resolve(p)] = { id: p, filename: p, loaded: true, exports: exp }; }
seed(path.join(SRC, 'bid-inbox.js'), { _lib: { kvCas: async (k, fn) => { const v = fn(KV[k] === undefined ? undefined : JSON.parse(JSON.stringify(KV[k]))); if (v !== undefined) KV[k] = v; return v; }, kvGet: async k => KV[k] } });
seed(path.join(SRC, '_lib/mkt.js'), { readDoc: async () => DOC, update: async fn => { const r = fn(DOC); return { ok: true, r }; } });
seed(path.join(SRC, 'website-intake.js'), { _lib: { phone10: v => String(v || '').replace(/\D/g, '').slice(-10), fileLead: async (f, e) => { FILED.push({ f, e }); return { id: 'L1', action: 'added', rec: {} }; }, alertLead: async () => {} } });
const X = require(path.join(SRC, '_lib/mkt2.js'));
global.fetch = async function(url, init){ EMAILS.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200 }); };
X._setNow(() => Date.parse('2026-10-26T15:00:00Z'));
{
  const r = await X.couponClaim('truck1', { name: 'Pat Smith', email: 'pat@example.com', phone: '901-555-0100', address: '12 Oak St' });
  ok(r.ok && /^GC100-/.test(r.code), 'a coupon is claimed', r);
  ok(r.expires === '2027-01-24' && r.expiresText === 'January 24, 2027', 'default expiration = 90 days after issue (Oct 26 -> Jan 24)', r.expires);
  ok(/Expires January 24, 2027/.test(r.message), 'the claim message says when it expires');
  const mail = EMAILS.find(e => /resend/.test(e.url));
  ok(mail && mail.body.html.includes('Expires January 24, 2027') && /one coupon per household/.test(mail.body.html) && /no cash value/.test(mail.body.html) && /void where prohibited/.test(mail.body.html) && /not combined/.test(mail.body.html), 'the coupon e-mail shows the expiration and the terms');
  const again = await X.couponClaim('truck1', { name: 'Pat Smith', email: 'pat@example.com' });
  ok(again.already && /expires January 24, 2027/.test(again.message), 'one per household: the second claim is refused and says the expiry');
  const chk = await X.couponCheck(r.code); ok(chk.ok && chk.expires === '2027-01-24' && chk.expired === false, 'check shows expires + not expired', chk);
  const r2 = await X.couponClaim('truck1', { name: 'Lee Jones', email: 'lee@example.com', phone: '901-555-0111', address: '14 Elm St' });
  X._setNow(() => Date.parse('2027-01-24T20:00:00Z'));
  const last = await X.couponRedeem(r.code, { amount: 2000 }, {});
  ok(last.ok, 'redeemable on the expiration date itself (Jan 24)', last);
  X._setNow(() => Date.parse('2027-01-26T20:00:00Z'));
  const late = await X.couponRedeem(r2.code, { amount: 2000 }, {});
  ok(!late.ok && late.expired && /expired on January/.test(late.error), 'redeeming after the expiration is refused', late);
  ok((await X.couponCheck(r2.code)).expired === true, 'check says expired');
  // a coupon claimed before this change (no expires) stays valid
  const h = X.couponHash('GC100-OLD0-OLD0'); KV.gc_coupons.list[h] = { last4: 'OLD0', source: 'x', name: 'Old', email: 'old@example.com', phone10: '', addr: '', at: '2026-01-01T00:00:00.000Z' };
  ok((await X.couponRedeem('GC100-OLD0-OLD0', { amount: 2000 }, {})).ok, 'a coupon claimed before expirations (no date) still redeems');
  // the Admin setting
  X._setNow(() => Date.parse('2026-10-26T15:00:00Z')); DOC.cfg.main.coupons = { days: 30 };
  const r3 = await X.couponClaim('truck1', { name: 'Kim Roe', email: 'kim@example.com', phone: '901-555-0122', address: '16 Pine St' });
  ok(r3.expires === '2026-11-25', 'the "expires after N days" setting is used (30 days -> Nov 25)', r3.expires);
  ok(X.couponDays({ days: 0 }) === 90 && X.couponDays({ days: 9999 }) === 90 && X.couponDays({ days: '45' }) === 45, 'days is clamped: bad values fall back to 90');
}
{
  X._setNow(() => Date.parse('2026-10-26T15:00:00Z'));
  const cur = await X.giveawayCurrent();
  ok(cur.startDate === '2026-10-01' && cur.endDate === '2026-10-31' && cur.prizeValue === '', 'giveawayCurrent: entry period defaults to the month; prize value blank', cur);
  DOC.giveaways.gw_202610 = { id: 'gw_202610', status: 'open', prize: 'a free gutter cleaning', startDate: '2026-10-05', endDate: '2026-10-25', prizeValue: '150' };
  const cur2 = await X.giveawayCurrent();
  ok(cur2.startDate === '2026-10-05' && cur2.endDate === '2026-10-25' && cur2.prizeValue === '150' && cur2.prize === 'a free gutter cleaning', 'the owner-set dates, prize and prize value come back', cur2);
  const base = { name: 'Ann Lee', email: 'ann@example.com', zip: '38135', agree: true };
  const a = await X.giveawayEnter(Object.assign({}, base, { newsletter: false }));
  ok(a.ok && !/GrayCo News/.test(a.message), 'entry with the newsletter box unticked does not join GrayCo News', a.message);
  ok(!KV.gc_news_signups, 'no newsletter signup was written');
  const b = await X.giveawayEnter(Object.assign({}, base, { email: 'bob@example.com', name: 'Bob', newsletter: true }));
  ok(b.ok && /GrayCo News/.test(b.message) && KV.gc_news_signups, 'ticking the box joins GrayCo News');
  const c = await X.giveawayEnter({ name: 'Cy', email: 'cy@example.com', zip: '38135', agree: true });
  ok(c.ok && !/GrayCo News/.test(c.message), 'a request that omits the newsletter field does NOT join (opt-in, not opt-out)');
  const d = await X.giveawayEnter({ name: 'Di', email: 'di@example.com', zip: '10001', agree: true });
  ok(!d.ok && d.field === 'zip' && /Tennessee, Mississippi and Arkansas/.test(d.error), 'a New York ZIP is not eligible (TN / MS / AR only)', d);
  for (const z of ['38135', '39201', '72201', '37203']) ok(X.giveawayEnter && (await X.giveawayEnter({ name: 'Z' + z, email: z + '@example.com', zip: z, agree: true })).ok, 'ZIP ' + z + ' (TN / MS / AR) is eligible');
  const e = await X.giveawayEnter({ name: 'Ed', email: 'ed@example.com', zip: '38135', agree: false });
  ok(!e.ok && e.field === 'agree' && /18 or older/.test(e.error), 'the agree box must be ticked (18+, TN / MS / AR, rules)', e);
  const leadNote = FILED.filter(x => /Giveaway entry/.test(x.e.title || '')).map(x => (x.e.notes || [])[0]);
  ok(leadNote.some(n => /did not join GrayCo News/.test(n)) && leadNote.some(n => /ticked the optional box/.test(n)), 'the lead note says whether they joined GrayCo News', leadNote.slice(0, 2));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
