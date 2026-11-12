// test_BIDSCOPE.mjs <build-dir> [shot-dir] — patch BIDSCOPE (owner 11/12: "give us a summary of the bids we have — anything they excluded,
// anything they included — so I can compare bids; and when we accept a bid, point out what they exclude so the PM can ask questions on
// discrepancies, so we are sure to get the entire scope in our bid"; "award bid by email and portal entry"). Made-up data only.
//   A. the server (no browser; bid-hub.js with an in-memory bid site, a fake Resend): 🏆 award → ONE e-mail to the right address (job,
//      trade, amount, PM, "Please confirm these…"), Spanish for a Spanish sub, none while PORTAL_MAIL_OFF / data-entry mode, none on a
//      repeat award unless "Send again"; "not selected" e-mails only when ticked, never a price or a name; an e-mailed bid from a sub
//      with a bid-site profile gets its portal copy (🏆 there), listed once; the sub portal's bid shows the award, the PM, the list.
//   B. the CRM (offline harness, fake bid-hub): included / excluded parsed from the three doors, side by side, differences flagged;
//      🏆 Award → the confirm sheet (exclusions + gaps, note, e-mail boxes) → the line carries the exclusions, the builder shows
//      "⚠ Scope gaps to check", the PM gets a To-Do; "Exclude it in our proposal" → the estimate's own Exclusions; every gap checked →
//      the To-Do is gone; nothing of this on the customer's proposal.
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const req = createRequire(import.meta.url), FN = path.join(BUILD, 'netlify/functions');

/* ════ A. the server ════ */
Object.assign(process.env, { RESEND_API_KEY: 're-test', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test' }); delete process.env.PORTAL_MAIL_OFF;
const PAX = req(FN + '/portal-access.js');   /* loaded before the fake fetch below (each function file wraps fetch when it loads) */
const H = req(FN + '/bid-hub.js')._test, SP = req(FN + '/subportal.js')._hub, L = req(FN + '/bid-inbox.js')._lib, T = req(FN + '/bid-inbox.js')._test, PA = req(FN + '/_lib/pause.js');
const ROWS = new Map(), KV = {}, MAILS = []; let PAUSED = false;
const row = (c, d) => ({ collection: c, id: d.id, job_id: c === 'jobs' ? d.id : d.jobId, user_id: d.userId || (c === 'users' ? d.id : ''), email: d.email || '', data: d });
const put = (c, d) => ROWS.set(c + '/' + d.id, row(c, d));
put('jobs', { id: 'J1', title: 'Maple Street Clinic', address: '100 Maple St', status: 'open', visibility: 'private', log: [] });
put('users', { id: 'u_ed', role: 'sub', approved: true, email: 'ed@example.com', name: 'Ed Sample', company: 'Bright Spark Electric', trades: ['Electrical'] });
put('users', { id: 'u_sol', role: 'sub', approved: true, email: 'sol@example.com', name: 'Sol Ejemplo', company: 'Sol Eléctrico', trades: ['Electrical'], lang: 'es' });
put('bids', { id: 'b-e1', jobId: 'J1', userId: 'u_ed', userEmail: 'ed@example.com', userName: 'Ed Sample', userCompany: 'Bright Spark Electric', trade: 'Electrical', amount: 12400, scope: 'Rough-in and trim', notes: 'Fixtures by owner.', submittedAt: '2026-11-09T10:00:00Z' });
put('bids', { id: 'b-e4', jobId: 'J1', userId: 'u_x', userEmail: 'other@example.com', userName: 'Oz Other', userCompany: 'Other Volt LLC', trade: 'Electrical', amount: 15100, scope: 'All electrical', submittedAt: '2026-11-09T10:00:00Z' });
KV[T.KV_SUBBIDS] = [{ id: 'sbe_1', jobId: 'J1', at: '2026-11-09T09:00:00Z', trade: 'Electrical', amount: 9850, sub: { name: 'Sol Ejemplo', company: 'Sol Eléctrico', email: 'sol@example.com' }, subject: 'Oferta eléctrica', text: 'Incluye permisos. Excludes low voltage.' }];
SP.listRows = async filters => { const f = {}; filters.forEach(x => { const m = /^(\w+)=eq\.(.*)$/.exec(x); if (m) f[m[1]] = decodeURIComponent(m[2]); });
  return [...ROWS.values()].filter(r => (!f.collection || r.collection === f.collection) && (!f.job_id || r.job_id === f.job_id) && (!f.key || f.key === r.collection + '/' + r.id)); };
SP.getRow = async (c, id) => ROWS.get(c + '/' + id) || null;
SP.upsertRows = async rows => { rows.forEach(r => ROWS.set(r.collection + '/' + r.id, Object.assign({}, r, { data: JSON.parse(JSON.stringify(r.data)) }))); return rows; };
SP.crmData = async () => ({}); SP.crmSubList = () => [];
L.kvGet = async k => JSON.parse(JSON.stringify(KV[k] === undefined ? null : KV[k]));
L.kvCas = async (k, f) => { const v = f(JSON.parse(JSON.stringify(KV[k] === undefined ? null : KV[k]))); if (v !== undefined) KV[k] = v; return v; };
PA.isPaused = async () => PAUSED;
globalThis.fetch = async (url, o) => { if (/api\.resend\.com/.test(String(url))) { MAILS.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ id: 'm' + MAILS.length }), text: async () => '{}' }; } return { ok: false, status: 404, json: async () => ({}), text: async () => '' }; };
const WHO = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', admin: true, canPublic: true, canInvite: true };
const PM = { name: 'Pat Planner', phone: '(901) 555-0142', email: 'pat@example.com' };
const data = id => (ROWS.get('bids/' + id) || {}).data || {};
let r = await H.award(WHO, { jobId: 'J1', source: 'portal', id: 'b-e1', on: true, pm: PM, exclusions: ['Fixtures', 'Cleanup — not in your bid'], trade: 'Electrical' });
const m1 = MAILS[0] || {};
ok('A1 award → exactly ONE e-mail, to the bid\'s e-mail', MAILS.length === 1 && JSON.stringify(m1.to) === JSON.stringify(['ed@example.com']) && r.mail.sent === true, { MAILS: MAILS.map(m => m.to), r });
ok('A1 subject "Awarded — <job> — <trade>"; body: congratulations, job, trade, amount, PM name / phone / e-mail, next steps, the portal button', /^Awarded — Maple Street Clinic — Electrical/.test(m1.subject)
  && /Congratulations/.test(m1.html) && /Maple Street Clinic/.test(m1.html) && /\$12,400\.00/.test(m1.html) && /Pat Planner/.test(m1.html) && /\(901\) 555-0142/.test(m1.html) && /pat@example\.com/.test(m1.html)
  && /sub agreement \/ scope to sign in your GrayCo Portal/.test(m1.html) && /portal\.grayco-cs\.com/.test(m1.html), m1.subject);
ok('A1 the exclusions to confirm are in it ("Please confirm these before we finalize: …")', /Please confirm these before we finalize/.test(m1.html) && /Fixtures/.test(m1.html) && /Cleanup — not in your bid/.test(m1.html));
ok('A1 the bid row: accepted, awardMailedAt, the PM and the list (the portal reads them); the other Electrical portal bid → Not selected, not e-mailed', data('b-e1').accepted === true && !!data('b-e1').awardMailedAt && data('b-e1').awardPm.name === 'Pat Planner'
  && data('b-e1').awardExclusions.length === 2 && data('b-e4').rejected === true && !MAILS.some(m => /other@example/.test(JSON.stringify(m.to))), data('b-e1'));
const D1 = JSON.parse(JSON.stringify(data('b-e1')));
r = await H.award(WHO, { jobId: 'J1', source: 'portal', id: 'b-e1', on: true, pm: PM, exclusions: [] });
ok('A2 a repeat award sends nothing ("already e-mailed …")', MAILS.length === 1 && r.mail.sent === false && /already e-mailed/.test(r.mail.skipped), r.mail);
r = await H.award(WHO, { jobId: 'J1', source: 'portal', id: 'b-e1', on: true, pm: PM, exclusions: [], mailAgain: true });
ok('A2 "Send again" sends it once more', MAILS.length === 2 && r.mail.sent === true, r.mail);
const pv = PAX._bids ? PAX._bids.myBidOut(D1) : null;
ok('A3 the sub portal\'s bid: status accepted (🏆 Awarded) with the PM and the list to confirm', pv && pv.status === 'accepted' && pv.award && pv.award.pm.name === 'Pat Planner' && pv.award.pm.phone === '(901) 555-0142' && pv.award.confirm.length === 2, pv);
const app = fs.readFileSync(path.join(BUILD, 'portal-app.js'), 'utf8');
ok('A3 the portal app says 🏆 Awarded / 🏆 Adjudicada and shows the PM + next step + the list (data-bidaward)', /bidAccepted: '🏆 Awarded'/.test(app) && /bidAccepted: '🏆 Adjudicada'/.test(app) && /data-bidaward/.test(app) && /bidAwardConfirm/.test(app));
/* Spanish + the e-mailed bid's portal copy */
MAILS.length = 0;
r = await H.award(WHO, { jobId: 'J1', source: 'email', id: 'sbe_1', on: true, pm: PM, exclusions: ['Bajo voltaje'] });
const m2 = MAILS[0] || {};
ok('A4 a Spanish sub (their bid-site language) → the e-mail in Spanish', MAILS.length === 1 && /^Adjudicada — Maple Street Clinic — Electrical/.test(m2.subject) && /Felicidades/.test(m2.html) && /Por favor confirme esto antes de finalizar/.test(m2.html) && /Bajo voltaje/.test(m2.html) && /\$9,850\.00/.test(m2.html) && JSON.stringify(m2.to) === '["sol@example.com"]', m2.subject);
const cp = data('b_em_sbe_1');
ok('A4 an e-mailed bid from a sub with a bid-site profile (same e-mail) → their portal copy, awarded (fromEmailBid), with the PM', cp.accepted === true && cp.fromEmailBid === 'sbe_1' && cp.userId === 'u_sol' && cp.awardPm.name === 'Pat Planner' && KV[T.KV_SUBBIDS][0].awarded === true && !!KV[T.KV_SUBBIDS][0].awardMailedAt, cp);
const list = await H.subBids('J1');
ok('A4 the job\'s bid list shows that bid once (as the e-mail), with included / notes text and the mail stamp', list.filter(x => /sbe_1/.test(x.id)).length === 1 && list.find(x => x.id === 'sbe_1').awardMailedAt && list.find(x => x.id === 'b-e1').notes === 'Fixtures by owner.', list.map(x => x.source + ':' + x.id));
/* not selected: only when ticked, no prices, no names */
await H.award(WHO, { jobId: 'J1', source: 'email', id: 'sbe_1', on: false });   /* Sol's e-mailed bid back to pending: one award per trade */
MAILS.length = 0;
await H.award(WHO, { jobId: 'J1', source: 'portal', id: 'b-e1', on: true, pm: PM, exclusions: [] });
ok('A5 "Tell the other bidders" not ticked → no not-selected e-mail', MAILS.length === 0, MAILS.map(m => m.subject));
r = await H.award(WHO, { jobId: 'J1', source: 'portal', id: 'b-e1', on: true, pm: PM, exclusions: [], notifyOthers: true, trade: 'Electrical' });
const ns = MAILS.filter(m => /Bid update|Actualización/.test(m.subject));
ok('A5 ticked → each other bidder in the trade gets one short e-mail (Spanish for the Spanish sub)', r.others.mailed === 2 && ns.length === 2 && ns.some(m => m.to[0] === 'other@example.com' && /^Bid update — Maple Street Clinic/.test(m.subject)) && ns.some(m => m.to[0] === 'sol@example.com' && /^Actualización/.test(m.subject)), { r: r.others, ns: ns.map(m => [m.to, m.subject]) });
ok('A5 …never a price, never a name (theirs or the winner\'s)', ns.every(m => !/\$\s?\d/.test(m.html) && !/Bright Spark|Ed Sample|Other Volt|Oz Other|Sol Eléctrico/.test(m.html + m.subject)), ns.map(m => m.html.replace(/<[^>]+>/g, ' ').slice(0, 300)));
/* nothing while e-mail is off or data-entry mode is on */
MAILS.length = 0; process.env.PORTAL_MAIL_OFF = '1';
r = await H.award(WHO, { jobId: 'J1', source: 'portal', id: 'b-e1', on: true, pm: PM, mailAgain: true, notifyOthers: true });
ok('A6 PORTAL_MAIL_OFF → no e-mail (award still saved), said why', MAILS.length === 0 && r.mail.sent === false && /PORTAL_MAIL_OFF/.test(r.mail.skipped) && /PORTAL_MAIL_OFF/.test(r.others.skipped) && data('b-e1').accepted === true, r);
delete process.env.PORTAL_MAIL_OFF; PAUSED = true;
r = await H.award(WHO, { jobId: 'J1', source: 'portal', id: 'b-e1', on: true, pm: PM, mailAgain: true, notifyOthers: true });
ok('A6 data-entry mode (pause) → no e-mail, said why', MAILS.length === 0 && r.mail.sent === false && /data-entry/.test(r.mail.skipped), r.mail);
PAUSED = false;
put('jobs', { id: 'J2', title: 'Sent scope job', scope: 'Job scope text', specifications: 'Spec text', tradeScopes: [{ trade: 'Electrical', scope: 'Remove and haul off all debris' }], specDocs: [{ name: 'E-specs.pdf', text: 'Fire alarm devices tie-in' }] });
const ss = await H.sentScope('J2');
ok('A7 the bid list answer carries the scope GrayCo sent: each trade\'s scope, the job scope, the specifications, a spec sheet\'s text', ss && ss.tradeScopes[0].scope === 'Remove and haul off all debris' && ss.scope === 'Job scope text' && ss.specifications === 'Spec text' && ss.docs[0].text === 'Fire alarm devices tie-in', ss);
const mailShot = exclusions => {   /* the award e-mail, rendered (made-up job / sub / PM; the list the CRM's confirm sheet sends) */
  const em = H.awardMail({ job: { title: 'Maple Street Clinic', address: '100 Maple St' }, trade: 'Electrical', amount: 9850, pm: PM, exclusions }, false);
  fs.writeFileSync(SHOTS + '/award_email.html', '<!doctype html><meta charset="utf-8"><title>' + em.subject + '</title><body style="background:#f1f5f9;padding:24px"><div style="font:13px Arial;color:#475569;margin:0 auto 10px;max-width:560px">Subject: <b>' + em.subject + '</b> · To: val@example.com</div>' + em.html + '</body>');
}

/* ════ B. the CRM ════ */
const { computer, signIn, sleep, cset, cget, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 3 * 864e5).toISOString(), day = at.slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Pat Planner', email: 'pat@example.com', phone: '(901) 555-0142', role: 'Project Manager', active: true }]);
cset('leads', [{ id: 'L1', name: 'Maple Street Clinic', stage: 'Won', source: 'Bid board', createdAt: at, updatedAt: at }]);
cset('projects', [{ id: 'P1', name: 'Maple Street Clinic', client: 'Sample Health LLC', address: '100 Maple St', status: 'estimating', autoPO: 'T101', leadId: 'L1', pm: 'Pat Planner', createdAt: at, updatedAt: at, files: [] }]);
const HAND = [{ id: 'H1', desc: 'Drywall hang + finish labor', cost: 4200, qty: 1, cat: 'Drywall', type: 'labor', mult: 'type' }];
const SET = { tax: 9.75, marginPct: 30, matMult: 1.4286, labMult: 1.4286, subMult: 1.4286, eqMult: 1.4286, mhCharge: 75, mhCost: 44.44, jobState: 'TN', msContractorTax: 3.5 };
cset('estimates', [{ id: 'E1', name: 'Maple Street Clinic — base bid', gc: 'Sample Health LLC', num: '', estimator: 'Wesley Johnson', date: day, status: 'Draft', pid: 'P1', lines: HAND,
  scope: { text: 'Interior build-out per plans.', inc: 'Drywall and finish', exc: 'Asbestos abatement', notes: '' }, settings: SET, jobMult: 'mat', ovrMult: 1.5, useOvr: false, totalCost: 4200, totalCharge: 6000, createdAt: at, firstSavedAt: at, savedAt: at, updatedAt: at, versions: [], versionNo: 1 }]);
const JOBS = [{ id: 'J1', title: 'Maple Street Clinic', address: '100 Maple St', status: 'open', visibility: 'private', due: day, trades: 'Electrical', invited: 4, bids: 3, leadId: 'crm:L1' }];
const BIDS = { J1: [
  { source: 'email', id: 'b-e2', company: 'Volt Brothers', sub: 'Val Example', email: 'val@example.com', trade: 'Electrical', amount: 9850, files: [], at, awarded: false,
    scope: 'Hi Wes,\nComplete electrical per plans.\nIncludes permits and fixtures install.\nExcludes low voltage, patching and paint touch-up.\nThanks, Val' },
  { source: 'portal', id: 'b-e1', company: 'Bright Spark Electric', sub: 'Ed Sample', email: 'ed@example.com', trade: 'Electrical', amount: 12400, files: [], at, awarded: false,
    scope: 'Rough-in and trim per E-sheets, new panel 200A; includes permits; patching after rough-in; cleanup and haul-off', notes: 'Fixtures by owner. Price good for 30 days.' },
  { source: 'subportal', id: 'b-e3', company: 'Current Co', sub: 'Cy Test', email: 'cy@example.com', trade: 'Electrical', amount: 13900, files: [], at, awarded: false, scope: '',
    notes: 'All electrical per plans, includes cleanup.\nExclusions:\nOvertime\nBonds' }] };
/* the scope GrayCo SENT with the bid job (owner: "if they exclude anything we sent a scope for, flag it") */
const SENT = { scope: 'Interior build-out of a 3,000 sq ft clinic.', specifications: '', docs: [],
  tradeScopes: [{ trade: 'Electrical', scope: 'Furnish and install all devices and fixtures per E-sheets.\nPatch and repair walls after rough-in.\nRemove and haul off all debris daily.' }, { trade: 'Plumbing', scope: 'Insulate all hot water lines.' }] };
const HUB = { awards: [] };
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await A.ctx.route('**/.netlify/functions/bid-hub*', async rt => {
  const u = new URL(rt.request().url()), q = u.searchParams, J = b => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (rt.request().method() === 'POST') { const b = JSON.parse(rt.request().postData() || '{}');
    if (b.op === 'award') { HUB.awards.push(b); const x = BIDS.J1.find(y => y.id === b.id); x.awarded = b.on !== false; if (x.awarded && b.mail) x.awardMailedAt = new Date().toISOString();
      return J({ ok: true, awarded: x.awarded, notSelected: 0, mail: b.mail ? { sent: true, to: x.email, mailedAt: new Date().toISOString() } : { sent: false, skipped: 'not asked' }, others: b.notifyOthers ? { mailed: 2, skipped: '' } : undefined }); }
    return J({ ok: true }); }
  if (q.get('jobs')) return J({ ok: true, jobs: JOBS, me: { admin: true, canInvite: true, canPublic: true } });
  if (q.get('subbids')) return J({ ok: true, jobId: 'J1', bids: JSON.parse(JSON.stringify(BIDS.J1)), sent: SENT });
  return J({ ok: true, subs: [] });
});
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(7000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
await wait(() => window._gcEST3 && window._gcEST3.list().some(e => e.id === 'E1') && (window._crm.projects || []).length >= 1 && window._gcBidEst && window._gcBidEst.parse, null, 60000);
/* B1 the parsing (three doors) */
const ps = await A.ev(B => B.map(b => { const P = window._gcBidEst.parse(b); return { inc: P.inc.map(x => x.text), exc: P.exc.map(x => x.text), notes: P.notes.map(x => x.text) }; }), BIDS.J1);
ok('B1 e-mailed text: ✅ "Complete electrical per plans", "permits and fixtures install"; ⛔ "low voltage, patching and paint touch-up"; greetings dropped', JSON.stringify(ps[0].inc) === JSON.stringify(['Complete electrical per plans', 'permits and fixtures install']) && JSON.stringify(ps[0].exc) === JSON.stringify(['low voltage, patching and paint touch-up']), ps[0]);
ok('B1 bid portal: "Scope Included in Bid" → ✅ (split on ;), "Bid Notes / Exclusions" → ⛔ "Fixtures by owner", 📝 "Price good for 30 days"', ps[1].inc.length === 4 && /cleanup and haul-off/.test(ps[1].inc.join('|')) && JSON.stringify(ps[1].exc) === '["Fixtures by owner"]' && JSON.stringify(ps[1].notes) === '["Price good for 30 days"]', ps[1]);
ok('B1 sub-portal notes: free text ✅ + an "Exclusions:" heading starts a ⛔ list (Overtime, Bonds)', /cleanup/.test(ps[2].inc.join('|')) && JSON.stringify(ps[2].exc) === '["Overtime","Bonds"]', ps[2]);
const pt = await A.ev(() => window._gcBidEst.parseText('Includes demo and dumpster. Fire caulk N.I.C.; Permits by GC; Owner to provide fixtures; Allowance for patching $500; F&I all devices; Tax not included', 'free').map(x => x.kind + ':' + x.keys.join('+')));
ok('B1 the keywords: N.I.C. / by GC / owner to provide / allowance / not included → ⛔; includes / F&I → ✅; common items line up (demo, dumpster, fire caulk, permits, taxes)', JSON.stringify(pt) === JSON.stringify(['inc:dumpster+demo', 'exc:firecaulk', 'exc:permits', 'exc:fixtures', 'exc:patching', 'inc:t:devices', 'exc:taxes']), pt);
const oh = await A.ev(S => { const f = (t, tr) => window._gcBidEst.ourHit(S, tr || 'Electrical', t).map(h => h.label + ' ← ' + h.ours);
  const S2 = Object.assign({}, S, { docs: [{ name: 'E-specs.pdf', text: 'Fire alarm devices tie-in to the existing panel' }] });
  return { haul: f('Haul off by others'), haul2: f('HAUL-OFF BY OTHERS'), debris: f('Excludes debris removal'), unrelated: f('Excludes asbestos abatement'), lv: f('Excludes low voltage'), plumb: f('Excludes insulation', 'Plumbing'), plumbE: f('Excludes insulation'),
    fa: window._gcBidEst.ourHit(S2, 'Electrical', 'Fire alarm tie-in by others').map(h => h.ours) }; }, SENT);
ok('B1 our scope: "Haul off by others" / "HAUL-OFF BY OTHERS" / "debris removal" hit our "Remove and haul off all debris daily"', oh.haul.length === 1 && /Remove and haul off all debris daily/.test(oh.haul[0]) && oh.haul2.length === 1 && oh.debris.length === 1, oh);
ok('B1 an unrelated exclusion (asbestos, low voltage) is not flagged; another trade\'s scope only counts for that trade', !oh.unrelated.length && !oh.lv.length && oh.plumb.length === 1 && !oh.plumbE.length, oh);
ok('B1 a distinctive word in a spec sheet\'s text counts ("Fire alarm tie-in by others" ← "Fire alarm devices tie-in …")', oh.fa.length === 1 && /Fire alarm devices tie-in/.test(oh.fa[0]), oh.fa);
/* B2 the comparison */
await A.ev(() => window._gcBidEst.open('J1'));
await wait(() => document.querySelector('#gcsys-modal [data-be-scope]'));
const mx = await A.ev(() => { const t = document.querySelector('#gcsys-modal [data-be-scope]'); return { heads: [...t.querySelectorAll('thead th')].map(x => x.firstChild.textContent), rows: [...t.querySelectorAll('tr[data-be-item]')].map(r => ({ k: r.getAttribute('data-be-item'), hot: r.classList.contains('hot'), cells: [...r.querySelectorAll('[data-be-cell]')].map(c => c.getAttribute('data-be-cell')).join(','), red: r.classList.contains('red'), flag: r.querySelector('[data-be-flag]').textContent })),
  notes: (t.querySelector('.bnotes') || {}).textContent || '', red: ['email:b-e2', 'portal:b-e1', 'subportal:b-e3'].map(k => (document.querySelector('#gcsys-modal tr[data-be-bid="' + k + '"] [data-be-red]') || { getAttribute: () => '' }).getAttribute('data-be-red')), counts: [...document.querySelectorAll('#gcsys-modal [data-be-scn]')].map(x => x.getAttribute('data-be-scn')) }; });
const rowOf = k => mx.rows.find(x => x.k === k) || {};   /* red: the row class */
ok('B2 side by side: our scope, then one column per bid (lowest first), one row per item', mx.heads.join('|') === 'Item|Our scope|Volt Brothers|Bright Spark Electric|Current Co|Difference' && mx.rows.length >= 10, mx.heads);
ok('B2 Fixtures (in our scope): Volt ✅, Bright Spark ⛔ → "🚩 Bright Spark Electric excludes part of our scope" (red, on top)', rowOf('fixtures').cells === 'inc,exc,' && rowOf('fixtures').red && rowOf('fixtures').flag === '🚩 Bright Spark Electric excludes part of our scope' && mx.rows.slice(0, 2).every(x => x.red), rowOf('fixtures'));
ok('B2 Patching (in our scope) excluded by Volt → 🚩; Low voltage (not ours) → no 🚩', rowOf('patching').flag === '🚩 Volt Brothers excludes part of our scope' && rowOf('lowvoltage').flag === '⛔ Volt Brothers excludes it' && !rowOf('lowvoltage').red, [rowOf('patching'), rowOf('lowvoltage')]);
ok('B2 each bid row: "🚩 Excludes part of our scope: …" (Volt: Patching; Bright Spark: Fixtures; Current Co: none)', JSON.stringify(mx.red) === JSON.stringify(['Patching', 'Fixtures', '']), mx.red);
ok('B2 Dumpster / haul-off only in Bright Spark → "⚠ Only in Bright Spark Electric’s bid"; Cleanup: Bright Spark + Current Co include, Volt silent', rowOf('dumpster').flag === '⚠ Only in Bright Spark Electric’s bid' && rowOf('dumpster').hot && rowOf('cleanup').cells === ',inc,inc' && /Only in Bright Spark Electric & Current Co/.test(rowOf('cleanup').flag), [rowOf('dumpster'), rowOf('cleanup')]);
ok('B2 Patching: Volt ⛔, Bright Spark ✅; Overtime / Bonds only excluded (Current Co); differences listed first; notes shown', rowOf('patching').cells === 'exc,inc,' && rowOf('overtime').cells === ',,exc' && /⛔ Current Co excludes it/.test(rowOf('bonds').flag) && mx.rows.slice(0, 4).every(x => x.hot) && /Bright Spark Electric: Price good for 30 days/.test(mx.notes), mx.rows.map(x => x.k + (x.hot ? '*' : '')));
ok('B2 each bid row counts what it includes / excludes', mx.counts.join(' ') === '2/1 4/1 1/2', mx.counts);
await A.ev(() => document.querySelector('#gcsys-modal [data-be-scope]').scrollIntoView({ block: 'start' })); await sleep(400);
await shot(A, '01_scope_side_by_side');
/* B3 the award confirm sheet */
await A.ev(() => document.querySelector('#gcsys-modal tr[data-be-bid="email:b-e2"] [data-be="award"]').click());
await wait(() => document.querySelector('#gcsys-modal [data-be-confirm]'));
const cf = await A.ev(() => { const q = s => [...document.querySelectorAll('#gcsys-modal [data-be-cf="' + s + '"] li')].map(x => x.textContent);
  return { ours: q('ours'), exc: q('exc'), gaps: q('gaps'), txt: document.querySelector('#gcsys-modal [data-be-confirm]').innerText, mail: document.querySelector('#gcsys-modal [data-be-mail]').checked, others: document.querySelector('#gcsys-modal [data-be-others]').checked }; });
ok('B3 🏆 Award → a confirm sheet first, on top: "🚩 Excludes part of our scope" — Patching (our "Patch and repair walls after rough-in")', JSON.stringify(cf.ours) === JSON.stringify(['Patching — our scope: “Patch and repair walls after rough-in”']), cf.ours);
ok('B3 …Volt\'s ⛔ exclusions one by one (🚩 Patching — Bright Spark includes it, Paint touch-up, Low voltage)', JSON.stringify(cf.exc) === JSON.stringify(['🚩 Patching — Bright Spark Electric includes it', 'Paint touch-up', 'Low voltage / data']), cf.exc);
ok('B3 …and the gaps: in our scope / other bids, not in Volt\'s (📄 Dumpster / haul-off — ours too, Cleanup)', JSON.stringify(cf.gaps) === JSON.stringify(['📄 Dumpster / haul-off — Bright Spark Electric includes it', 'Cleanup — Bright Spark Electric & Current Co include it']), cf.gaps);
ok('B3 the PM, a note box, ✉️ e-mail the award (on), tell the others (off)', /PM: Pat Planner · \(901\) 555-0142/.test(cf.txt) && cf.mail === true && cf.others === false && /Note for the PM/.test(cf.txt), cf.txt.slice(0, 500));
await A.ev(() => { document.querySelector('#gcsys-modal [data-be-note]').value = 'Confirm the 200A panel is in their number'; document.querySelector('#gcsys-modal [data-be-others]').checked = true; });
await shot(A, '02_award_confirm_sheet');
await A.ev(() => document.querySelector('#gcsys-modal [data-be="cfgo"]').click());
await wait(() => { const r = document.querySelector('#gcsys-modal tr[data-be-bid="email:b-e2"] [data-be-status]'); return r && r.getAttribute('data-be-status') === 'awarded'; });
await sleep(800);
const aw = HUB.awards[HUB.awards.length - 1] || {};
ok('B3 the award op carries: e-mail on, tell the others on, the PM, the list to confirm (our-scope exclusions marked, "— not in your bid" gaps) → the e-mail\'s "Please confirm these"', aw.on === true && aw.mail === true && aw.notifyOthers === true && aw.pm && aw.pm.name === 'Pat Planner' && aw.pm.email === 'pat@example.com'
  && JSON.stringify(aw.exclusions) === JSON.stringify(['Patching — part of the scope we sent you', 'Paint touch-up', 'Low voltage / data', 'Dumpster / haul-off — in the scope we sent you, not in your bid', 'Cleanup — not in your bid']), aw);
const recOf = id => A.ev(id => { const l = (window._gcEstimatesState && window._gcEstimatesState.length ? window._gcEstimatesState : window._crm.estimates) || []; const e = l.find(x => x && x.id === id); return e ? JSON.parse(JSON.stringify(e)) : null; }, id);
let e1 = await recOf('E1'), bl = (e1.lines || []).find(l => l.bidRef);
ok('B4 the estimate line carries the exclusions, the 5 gaps (open; Patching + Dumpster marked as our scope), the note, the PM', bl && JSON.stringify(bl.bidRef.exclusions) === JSON.stringify(['Patching', 'Paint touch-up', 'Low voltage / data']) && bl.bidRef.gaps.length === 5 && bl.bidRef.gaps.filter(g => g.ours).map(g => g.label).join() === 'Patching,Dumpster / haul-off' && bl.bidRef.gaps.every(g => !g.done) && bl.bidRef.awardNote === 'Confirm the 200A panel is in their number' && bl.bidRef.pm.name === 'Pat Planner', bl && bl.bidRef);
ok('B4 the line text the customer can see stays clean ("Electrical — subcontractor bid")', bl && bl.desc === 'Electrical — subcontractor bid', bl && bl.desc);
let td = await A.ev(() => window._gcBidEst.todo().map(x => ({ key: x.key, title: x.title, who: x.who, vis: x.vis, sub: x.sub })));
ok('B4 the PM\'s To-Do: "❓ Ask Volt Brothers about: 🚩 Patching; Paint touch-up; Low voltage / data; Dumpster / haul-off (+1 more)" for Pat Planner', td.length === 1 && td[0].title === '❓ Ask Volt Brothers about: 🚩 Patching; Paint touch-up; Low voltage / data; Dumpster / haul-off (+1 more)' && JSON.stringify(td[0].who) === '["Pat Planner"]' && /Maple Street Clinic/.test(td[0].sub), td);
/* the To-Do screen */
await A.ev(() => { window._gcBidEst.close(); window._setView('todo'); });
const tdOn = await wait(() => [...document.querySelectorAll('main *')].some(x => x.children.length === 0 && /Ask Volt Brothers about/.test(x.textContent || '')), null, 25000);
ok('B4 the To-Do screen lists it', !!tdOn);
await A.ev(() => { const x = [...document.querySelectorAll('main *')].filter(x => x.children.length === 0 && /Ask Volt Brothers about/.test(x.textContent || ''))[0]; if (x) x.scrollIntoView({ block: 'center' }); }); await sleep(500);
await shot(A, '04_pm_todo');
/* B5 the builder */
for (let i = 0; i < 5; i++) {
  await A.ev(() => window._gcEST3.open('E1'));
  if (!await wait(() => document.querySelector('#gc-bidest-panel [data-bp-gap]'), null, 8000)) continue;
  await sleep(6000); if (await A.ev(() => !!document.querySelector('#gc-bidest-panel [data-bp-gap]'))) break;
}
const bd = await A.ev(() => ({ head: (document.querySelector('#gc-bidest-panel h4') || {}).textContent, gaps: [...document.querySelectorAll('#gc-bidest-panel [data-bp-gap]')].map(x => x.querySelector('label').textContent.trim()),
  exc: (document.querySelector('#est-lines [data-bidest-exc]') || {}).textContent, tag: (document.querySelector('#est-lines [data-bidest-tag]') || {}).textContent, bidsBtn: !!document.querySelector('#gc-bidest-panel [data-bp-act="bids"][data-job="J1"]') }));
ok('B5 the builder: "⛔ Sub excludes: Patching; Paint touch-up; Low voltage / data" under the 🏆 line', bd.exc === '⛔ Sub excludes: Patching; Paint touch-up; Low voltage / data' && bd.tag === '🏆 Awarded bid', bd);
ok('B5 the builder: "⚠ Scope gaps to check — 5 open of 5", 🚩 first, each gap + 📊 Sub bids', bd.head === '⚠ Scope gaps to check — 5 open of 5' && bd.gaps.length === 5 && /^🚩 Excludes part of our scope: Patching \(our scope: “Patch and repair walls after rough-in”\) \(Bright Spark Electric includes it\)/.test(bd.gaps[0])
  && /⚠ In our scope, not in Volt Brothers’ bid: Dumpster \/ haul-off/.test(bd.gaps[3]) && /Not in Volt Brothers’ bid: Cleanup/.test(bd.gaps[4]) && bd.bidsBtn, bd);
await A.ev(() => { const p = document.getElementById('gc-bidest-panel'); if (p) p.scrollIntoView({ block: 'start' }); }); await sleep(500);
await shot(A, '03_estimate_gaps_and_exclusions');
/* choose: Low voltage → Exclude it in our proposal; Patching → asked; Cleanup → cover it */
const gidOf = lbl => A.ev(lbl => { const g = [...document.querySelectorAll('#gc-bidest-panel [data-bp-gap]')].find(x => x.textContent.includes(lbl)); return g && g.getAttribute('data-bp-gap'); }, lbl);
const act = async (lbl, a) => { const g = await gidOf(lbl); await A.ev(([g, a]) => document.querySelector('#gc-bidest-panel [data-bp-gap="' + g + '"] [data-bp-act="' + a + '"]').click(), [g, a]); await sleep(1200); };
await act('Low voltage / data', 'exclude');
const exTxt = await A.ev(() => ({ ta: document.getElementById('scope-exc').value, sc: scope.exc }));
ok('B6 "🚫 Exclude it in our proposal" → appended to this estimate\'s own Exclusions (kept what was there)', exTxt.ta === 'Asbestos abatement\nLow voltage / data' && exTxt.sc === exTxt.ta, exTxt);
await act('Patching', 'asked');
await act('Cleanup', 'cover');
ok('B6 "➕ Cover it elsewhere" puts the item into the add-line row', await A.ev(() => document.getElementById('nl-desc').value) === 'Cleanup');
td = await A.ev(() => window._gcBidEst.todo().map(x => x.title));
ok('B6 the To-Do follows: 2 left ("Ask Volt Brothers about: Paint touch-up; Dumpster / haul-off")', td.length === 1 && td[0] === '❓ Ask Volt Brothers about: Paint touch-up; Dumpster / haul-off', td);
for (const l of ['Paint touch-up', 'Dumpster / haul-off']) { const g = await gidOf(l); await A.ev(g => document.querySelector('#gc-bidest-panel [data-bp-gap="' + g + '"] input[type=checkbox]').click(), g); await sleep(1200); }
const after = await A.ev(() => ({ head: document.querySelector('#gc-bidest-panel h4').textContent, done: [...document.querySelectorAll('#gc-bidest-panel [data-bp-gap]')].map(x => x.getAttribute('data-done')).join(''), todo: window._gcBidEst.todo().length }));
ok('B6 every gap checked → "0 open of 5", the To-Do is gone', after.head === '⚠ Scope gaps to check — 0 open of 5' && after.done === '11111' && after.todo === 0, after);
await sleep(3000);
e1 = await recOf('E1'); bl = (e1.lines || []).find(l => l.bidRef);
ok('B6 saved with the estimate: the choices (exclude / asked / cover / checked) and the Exclusions text', bl && bl.bidRef.gaps.map(g => g.choice).join(',') === 'asked,,exclude,,cover' && bl.bidRef.gaps.every(g => g.done && g.doneBy) && e1.scope && e1.scope.exc === 'Asbestos abatement\nLow voltage / data', { g: bl && bl.bidRef.gaps.map(g => [g.label, g.choice, g.done]), exc: e1.scope && e1.scope.exc });
/* B7 nothing of this on the customer's proposal */
const pr = await A.ev(est => { const a = window._gcBuildGrayCoProposal(est), b = window._gcEstimateProposalHTML ? window._gcEstimateProposalHTML(est) : ''; return { a, b }; }, e1);
const strip = h => h.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pa1 = strip(pr.a), pb1 = strip(pr.b);
const BAD = /Volt|Bright Spark|Current Co|Sub excludes|Scope gaps|200A panel|Ask Volt|Paint touch-up|Dumpster \/ haul-off|our scope|not in your bid/g;   /* (the proposal's own standard terms mention a dumpster) */
ok('B7 the GrayCo proposal: no sub name, no "Sub excludes", no gaps, no PM note — only the estimate\'s own Exclusions (incl. the one we chose)', !BAD.test(pa1 + ' ' + pb1) && /Exclusions/i.test(pa1) && /Low voltage \/ data/.test(pa1) && /Asbestos abatement/.test(pa1) && /Electrical — subcontractor bid/.test(pa1),
  { bad: (pa1 + ' ' + pb1).match(BAD), exc: /Exclusions/i.test(pa1), lv: /Low voltage \/ data/.test(pa1), asb: /Asbestos abatement/.test(pa1), line: /Electrical — subcontractor bid/.test(pa1) });
ok('no page errors', !errs.length, errs);
if (SHOTS) {
  mailShot(aw.exclusions);
  const P2 = await A.ctx.newPage(); await P2.setContent(fs.readFileSync(SHOTS + '/award_email.html', 'utf8')); await sleep(500);
  await P2.screenshot({ path: SHOTS + '/05_award_email.png', fullPage: true }); await P2.close();
  fs.writeFileSync(SHOTS + '/index.txt', ['BIDSCOPE screenshots — made-up data only (offline harness; fake bid-hub; invented subs, project, PM, estimate)',
    '01_scope_side_by_side.png            📊 Bids → 📋 Scope: our scope (📄) + every item × every bid (✅ included / ⛔ excluded / — not mentioned), 🚩 "excludes part of our scope" and the other differences on top with "⚠ X excludes it" / "⚠ Only in X’s bid", notes',
    '02_award_confirm_sheet.png           🏆 Award → the confirm sheet: the sub\'s exclusions, the gaps other bidders cover, the PM, a note, ✉️ e-mail the award, tell the others',
    '03_estimate_gaps_and_exclusions.png  the project\'s estimate in the builder: "⚠ Scope gaps to check" (🚩 first; cover / exclude in our proposal / asked) + "⛔ Sub excludes: …" under the line',
    '04_pm_todo.png                       the To-Do: "❓ Ask Volt Brothers about: …" for the PM (gone when every gap is checked)',
    '05_award_email.png                   the award e-mail the sub gets (rendered from bid-hub.js awardMail): job, trade, amount, PM, next steps, "Please confirm these…"',
    '06_portal_awarded_bid.png            the sub portal\'s bid sheet for an awarded bid: 🏆 Awarded, the PM, the next step, what to confirm (from test_SUBBIDS.mjs)', ''].join('\n'));
}
const n = R.filter(Boolean).length; console.log('BIDSCOPE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
