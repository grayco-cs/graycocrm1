// test_SUBDOCDENY.mjs <build-dir> — patch SUBDOCDENY (owner 11/20): ✕ Deny on the ✅ Approvals "Sub COI / W-9 to confirm" cards.
//   Browser (offline harness, made-up data): the card has ✕ Deny; Deny asks why (quick picks + Other text, nothing goes without a
//   reason); on deny the card is gone (and stays gone after a re-scan), the file is kept on the sub marked rejected, what that
//   unconfirmed file alone had set (coi / insExp, w9) is cleared, the server gets act 'reject' with the reason, the bid-site file
//   id and the read id — and nothing goes to a customer (no other send function is called). Same for a W-9 card.
//   Node: the server side (_lib/subdocdeny.js: read closed, bid-site paper marked, e-mail + text to the sub, STOP kept, tag
//   'subdoc' passes data-entry mode), the sub portal's Papers ("Rejected: <reason> — please upload a new one", needs COI) and the
//   bid site's papers (a denied paper is not on file).
// Usage: node test_SUBDOCDENY.mjs <dir with index.html + netlify/>   (GC_HARNESS = the offline harness_N.mjs; NOBROWSER=1: node part only)
import { pathToFileURL } from 'url'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const HEX = c => 'sb:crm-files/' + c.repeat(64) + '.pdf';
const REF_A = HEX('a'), REF_B = HEX('b');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();

/* ═══ node: the server side ═══ */
console.log('A. server: _lib/subdocdeny.js');
{
  const SD = require(path.join(build, 'netlify/functions/_lib/subdocdeny.js'));
  const reads = [{ id: 'sd_1', ref: REF_A, status: 'new' }, { id: 'sd_2', ref: REF_B, status: 'new' }];
  const rows = [{ id: 'prof1', data: { items: [{ id: 'd1', type: 'insurance_general', fileRef: 'u/prof1/gl.pdf', expirationDate: '2027-01-01' }, { id: 'd2', type: 'w9', fileRef: 'u/prof1/w9.pdf' }] } }];
  const sent = { mail: [], sms: [], up: [] };
  const deps = (o = {}) => Object.assign({
    readsUpdate: async fn => { const r = fn(reads); return { ok: !!r && r.check(r.list) }; },
    hub: { eq: (a, b) => a + '=' + b, listRows: async () => rows, upsertRows: async (r) => { sent.up.push(r[0]); rows[0] = { id: r[0].id, data: r[0].data }; } },
    crmSubs: async () => [{ id: 'S1', name: 'Demo Drywall LLC', contact: 'Dana', email: 'dana@example.com', phone: '(901) 555-0101' }, { id: 'S2', name: 'No Contact Co' }],
    sendMail: async (to, subj, html) => { sent.mail.push({ to, subj, html }); return true; }, sendSms: async (ph, t) => { sent.sms.push({ ph, t }); return { ok: true }; },
    optout: async () => ({}), portalLink: async () => 'https://portal.example.com/s/x', bidsUrl: 'https://bids.example.com' }, o);
  const r1 = await SD.reject({ act: 'reject', id: 'sd_1', ref: REF_A, subId: 'S1', kind: 'coi', reason: 'Expired', fileId: 'SBPAP_d1', fileName: 'GL.pdf' }, { email: 'office@example.com', name: 'Office Demo' }, deps());
  ok(r1.ok && r1.read && reads[0].status === 'rejected' && reads[0].reason === 'Expired' && reads[1].status === 'new', 'the server read is closed as rejected, with the reason (the other read untouched)', { r1, reads });
  const d1 = rows[0].data.items.find(d => d.id === 'd1');
  ok(r1.bidSite && d1 && d1.rejected && d1.rejected.reason === 'Expired' && rows[0].data.items.length === 2, 'the bid-site paper (SBPAP_d1) is marked rejected in My Documents — kept, not deleted', rows[0].data.items);
  ok(r1.mailed && sent.mail[0].to === 'dana@example.com' && /Rejected: Expired — please upload a new one/.test(sent.mail[0].html) && /bids\.example\.com/.test(sent.mail[0].html), 'the sub gets an e-mail: "Rejected: Expired — please upload a new one" + where to upload', sent.mail[0]);
  ok(r1.texted && sent.sms[0].ph === '9015550101' && /Rejected: Expired — please upload a new one/.test(sent.sms[0].t), 'and a text to their mobile', sent.sms[0]);
  const r2 = await SD.reject({ act: 'reject', ref: REF_B, subId: 'S1', kind: 'w9', reason: 'Wrong company name' }, { email: 'o@example.com' }, deps({ optout: async () => ({ '9015550101': true }) }));
  ok(r2.ok && r2.mailed && !r2.texted && r2.why.includes('texts: STOP') && reads[1].status === 'rejected', 'W-9 by ref: closed; a STOP\'d number is never texted (e-mail still goes)', r2);
  const r3 = await SD.reject({ act: 'reject', ref: REF_B, subId: 'S2', kind: 'coi', reason: 'Limits too low' }, {}, deps());
  ok(r3.ok && !r3.mailed && !r3.texted, 'a sub with no e-mail / mobile: nothing sent (the portal still shows it)', r3);
  const r4 = await SD.reject({ act: 'reject', ref: REF_B, subId: 'S1', kind: 'coi', reason: '' }, {}, deps());
  ok(!r4.ok && r4.statusCode === 400, 'no reason → refused', r4);
  /* data-entry mode: a 'subdoc' send is let through (mail and text), an untagged one is not */
  const CQ = require(path.join(build, 'netlify/functions/_lib/custquiet.js')), PZ = require(path.join(build, 'netlify/functions/_lib/pause.js'));
  const mailOpts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: ['dana@example.com'], subject: 'x', html: 'x' }) };
  const tw = 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json', twOpts = { method: 'POST', body: 'To=%2B19015550101&Body=x' };
  ok(PZ.PASS_TAGS.subdoc === 1 && (await CQ.run('subdoc', () => PZ.shouldSkip('https://api.resend.com/emails', mailOpts))) === false && (await CQ.run('subdoc', () => PZ.shouldSkip(tw, twOpts))) === false, 'tag "subdoc" passes data-entry mode for the e-mail and the text');
  /* the sub portal's Papers + the bid site's papers */
  const PA = require(path.join(build, 'netlify/functions/portal-access.js'))._papers;
  const sub = { id: 'S1', coi: false, files: [{ id: 'SPF_E1', kind: 'coi', name: 'coi.pdf', date: ago(2).slice(0, 10), rejected: { reason: 'GrayCo is not listed as additional insured', at: ago(1) } }] };
  const pp = PA.subPapersOf(sub, []);
  ok(pp.coi.rejected && pp.coi.rejected.reason === 'GrayCo is not listed as additional insured' && !pp.coi.onFile && !pp.w9.rejected, 'sub portal Papers: the COI shows rejected with the reason, not on file', pp);
  const pp2 = PA.subPapersOf(sub, [{ kind: 'paper', data: { paper: 'coi' }, created_at: new Date().toISOString() }]);
  ok(!pp2.coi.rejected && pp2.coi.sent, 'a new COI sent since → "sent", the rejection no longer shown', pp2.coi);
  const bp = PA.papersOf([{ id: 'x', type: 'insurance_general', expirationDate: '2030-01-01', rejected: { reason: 'Expired' } }, { id: 'y', type: 'w9' }], {}, {});
  ok(!bp.gl && bp.w9 && !bp.ready, 'bid site papers: a denied GL certificate is not on file', bp);
}

/* ═══ browser: the card ═══ */
if (process.env.NOBROWSER !== '1') {
  console.log('B. ✅ Approvals card (browser, made-up data)');
  const H = await import(pathToFileURL(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs').href);
  const ADMIN = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-wesley');
  H.resetCloud();
  H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true }]);
  H.cset('projects', [{ id: 'P1', name: 'Demo Job', client: 'Sample Customer', clientEmail: 'customer@example.com', clientPhone: '9015550199', pm: 'Demo PM', status: 'Active' }]);
  H.cset('subs', [
    { id: 'S1', name: 'Demo Drywall LLC', trade: 'Drywall', isSub: true, coi: true, insExp: '2027-01-31', email: 'dana@example.com', phone: '9015550101', updatedAt: ago(5),
      files: [{ id: 'SPF_E1', ref: REF_A, name: 'Drywall COI.pdf', kind: 'coi', exp: '2027-01-31', date: ago(1).slice(0, 10), source: 'sub-portal' }] },
    { id: 'S2', name: 'Demo Paint Co', trade: 'Paint', isSub: true, w9: true, updatedAt: ago(5),
      files: [{ id: 'SBPAP_d2', ref: REF_B, name: 'Paint W-9.pdf', kind: 'w9', date: ago(1).slice(0, 10), source: 'bid portal sign-up' }] }]);
  ['vendors', 'invs', 'leads', 'customers', 'projectDocs', 'punch', 'expenses'].forEach(k => H.cset(k, []));
  const SRV = { reads: [{ id: 'sd_aaa', at: ago(1), subId: 'S1', name: 'Drywall COI.pdf', ref: REF_A, kind: 'coi', fields: { insExp: '2027-01-31' }, status: 'new', source: 'subportal' }], posts: [] };
  H.onFn('sub-doc-read', ({ method, query, body }) => {
    if (method === 'GET' && query.list) return { ok: true, items: SRV.reads.filter(r => r.status === 'new') };
    const b = body || {}; SRV.posts.push(b);
    if (b.act === 'reject') { SRV.reads.forEach(r => { if (r.id === b.id || r.ref === b.ref) r.status = 'rejected'; }); return { ok: true, mailed: true, texted: true }; }
    return { ok: true };
  });
  const c = await H.computer('Admin', { build });
  try {
    ok(await H.signIn(c, ADMIN, 25000), 'admin signs in');
    await H.waitFor(c, () => !!window._gcAUTAI && !!window._gcCoiAppr && !!window._gcAPX, null, 30000);
    await c.ev(() => window._gcAUTAI.scanSubDocs());
    ok(await H.waitFor(c, () => window._gcAUTAI.subDocs().length === 2, null, 30000), 'two items waiting (a sub-portal COI read by the server, a bid-site W-9)');
    await c.ev(() => { try { window._setView('approvals'); } catch (e) {} });
    const btns = await H.waitFor(c, () => { const b = [...document.querySelectorAll('[data-apx-act*="coi:subdoc_"]')].map(x => x.textContent.trim()); return b.filter(t => t === '✕ Deny').length === 2 ? b : null; }, null, 20000);
    ok(btns && btns.some(t => /Read & confirm/.test(t)) && btns.some(t => /Note/.test(t)) && btns.some(t => /The file/.test(t)), 'each card: 📄 Read & confirm, 📝 Note, 📄 The file and ✕ Deny', btns);
    const fnBefore = c.fn.length;
    const keyA = await c.ev(() => window._gcAPX.rows().find(r => r.src === 'coi' && /Drywall/.test(r.title)).key);
    await c.ev(k => [...document.querySelectorAll('[data-apx-act]')].find(b => b.getAttribute('data-apx-act').indexOf(k + '|coideny') >= 0).click(), keyA);
    await H.sleep(400);
    const sh = await c.ev(() => { const d = document.getElementById('gc-coi-deny'); return d ? { why: [...d.querySelectorAll('[data-why]')].map(b => b.textContent), bg: getComputedStyle(d.querySelector('[role=dialog]')).backgroundColor } : null; });
    ok(sh && sh.why.join('|') === 'Expired|Wrong company name|GrayCo is not listed as additional insured|Limits too low|Not a COI / wrong file|Other' && sh.bg === 'rgb(255, 255, 255)', 'Deny asks why: the quick picks + Other (a white sheet)', sh);
    await c.ev(() => document.querySelector('#gc-coi-deny [data-dn="go"]').click()); await H.sleep(300);
    ok(await c.ev(() => !!document.getElementById('gc-coi-deny')) && !SRV.posts.some(p => p.act === 'reject'), 'nothing goes without a reason');
    await c.ev(() => { document.querySelector('#gc-coi-deny [data-why="other"]').click(); document.querySelector('#gc-coi-deny [data-dn="go"]').click(); }); await H.sleep(300);
    ok(await c.ev(() => !!document.getElementById('gc-coi-deny')), '"Other" needs its text');
    await c.page().click('#gc-coi-deny [data-why="expired"]'); await c.page().click('#gc-coi-deny [data-dn="go"]');   /* real clicks: a save follows a person's input */
    await H.sleep(2500);
    const after = await c.ev(() => { const s1 = window._crm.subs.find(x => x.id === 'S1'); return { rows: window._gcAPX.rows().filter(r => r.src === 'coi').map(r => r.title), q: window._gcAUTAI.subDocs().map(x => x.ref.slice(13, 14)), file: s1.files, coi: s1.coi, insExp: s1.insExp, sheet: !!document.getElementById('gc-coi-deny') }; });
    ok(after.rows.length === 1 && !after.rows.some(t => /Drywall/.test(t)) && !after.q.includes('a') && !after.sheet, 'the Drywall COI card is gone (the W-9 card stays)', after);
    const f = after.file.find(x => x.id === 'SPF_E1');
    ok(after.file.length === 1 && f && f.rejected && f.rejected.reason === 'Expired' && f.rejected.by === 'Wesley Johnson', 'the file is kept on the sub, marked rejected (reason, who)', after.file);
    ok(after.coi === false && !after.insExp, 'compliance back to "needs COI": the coi flag / expiry that this unconfirmed upload had set are cleared', { coi: after.coi, insExp: after.insExp });
    const post = SRV.posts.find(p => p.act === 'reject');
    ok(post && post.reason === 'Expired' && post.id === 'sd_aaa' && post.ref === REF_A && post.subId === 'S1' && post.kind === 'coi' && post.fileId === 'SPF_E1', 'the server is told: act reject, the reason, the read id, the file', post);
    const other = c.fn.slice(fnBefore).map(x => x.name).filter(n => n !== 'sub-doc-read');
    ok(!other.some(n => /portal|sms|mail|text|send|cust|notify/i.test(n)), 'no customer send (no other send function called)', other);
    let cloud = null; for (let i = 0; i < 60 && !cloud; i++) { const v = H.cget('vendors');   /* the CRM saves subs in the vendors list */ const l = typeof v === 'string' ? JSON.parse(v) : v; const s1 = (l || []).find(x => x.id === 'S1'); if (s1 && s1.files && s1.files[0] && s1.files[0].rejected) cloud = s1; else await H.sleep(500); }
    ok(!!cloud, 'the rejected mark is saved to the cloud (vendors)');
    await c.ev(() => window._gcAUTAI.scanSubDocs()); await H.sleep(1500);
    ok(!(await c.ev(() => window._gcAUTAI.subDocs().some(x => x.subId === 'S1'))), 'a re-scan does not bring it back');
    /* the W-9 card: no "additional insured" / "limits" picks; the bid-site file id goes to the server */
    const keyB = await c.ev(() => window._gcAPX.rows().find(r => r.src === 'coi' && /Paint/.test(r.title)).key);
    await H.waitFor(c, k => !!document.querySelector('[data-apx-act*="' + k + '|coideny"]'), keyB, 10000);
    await c.ev(k => [...document.querySelectorAll('[data-apx-act]')].find(b => b.getAttribute('data-apx-act').indexOf(k + '|coideny') >= 0).click(), keyB); await H.sleep(300);
    const w9why = await c.ev(() => [...document.querySelectorAll('#gc-coi-deny [data-why]')].map(b => b.textContent));
    ok(w9why.join('|') === 'Expired|Wrong company name|Not a W-9 / wrong file|Other', 'W-9: its own picks', w9why);
    await c.ev(() => { document.querySelector('#gc-coi-deny [data-why="name"]').click(); document.querySelector('#gc-coi-deny [data-dn-txt]').value = 'says Paint Pros'; document.querySelector('#gc-coi-deny [data-dn="go"]').click(); });
    await H.sleep(2000);
    const w = await c.ev(() => { const s2 = window._crm.subs.find(x => x.id === 'S2'); return { rows: window._gcAPX.rows().filter(r => r.src === 'coi').length, w9: s2.w9, f: s2.files[0] }; });
    const pb = SRV.posts.filter(p => p.act === 'reject').pop();
    ok(w.rows === 0 && w.w9 === false && w.f.rejected && w.f.rejected.reason === 'Wrong company name — says Paint Pros' && pb.fileId === 'SBPAP_d2' && pb.kind === 'w9', 'W-9 denied: card gone, w9 back to needed, reason with the detail, the bid-site id sent', { w, pb });
    const errs = c.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/i.test(e));
    ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
  } finally { await c.b.close().catch(() => {}); }
}
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
