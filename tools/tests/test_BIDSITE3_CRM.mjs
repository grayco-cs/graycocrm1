// test_BIDSITE3_CRM.mjs <build-dir> — patch BIDSITE3, the CRM side, in the offline harness (made-up people and data; bid-hub answered
// by an in-memory stand-in that applies the same rules as the server; nothing is written live, nothing is sent).
//   F. 🧱 a sub's "Request more materials" is a ✅ Approvals card for the job's PM (the server sends a PM only their jobs; an admin all):
//      the row (🏗 Bid portal group), the ONE approval set entry, ✅ Approve → op matreq approve, ✕ Decline with a note → op matreq decline.
//   H. 📋 Call script: the owner's answers are the standard script (payment, financing, discounts blank, referral, estimates, insurance,
//      emergencies, photos, licenses with MS / AR blanks, service area, hours, Spanish, cell numbers, anonymous callers, what we do NOT do,
//      "Ask these — by job type", "After the call"); routing by role — water / fire / mold / storm → Owner 1 until someone has the
//      "Insurance Restoration Manager" role (then them), emergency → the Mitigation PM (backup Owner 1), legal → Owner 2, media → Owner 1,
//      adjuster → the job's PM else Owner 2, salespeople / hiring / complaints / "asks for an owner" answers; a saved older script keeps
//      the admin's own edits and takes the new standard text elsewhere; the role is offered in Admin → people.
import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = path.resolve(process.argv[2] || '.');
const H = await import(pathToFileURL(HARNESS).href);
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const OWNER1 = 'wjohnson@grayco-cs.com', OWNER2 = 'ngray@grayco-cs.com', PM = 'pm@grayco-cs.com';
H.resetCloud();
H.cset('users', [
  { id: 'us1', name: 'Demo Owner One', email: OWNER1, role: 'Admin', active: true, createdAt: '2020-01-01T00:00:00Z' },
  { id: 'us2', name: 'Demo Owner Two', email: OWNER2, role: 'Admin', active: true, createdAt: '2021-01-01T00:00:00Z' },
  { id: 'us3', name: 'Demo PM', email: PM, role: 'Project Manager', active: true },
  { id: 'us4', name: 'Demo Mit PM', email: 'mitpm@grayco-cs.com', role: 'Mitigation PM', active: true },
  { id: 'us5', name: 'Demo Office', email: 'office@grayco-cs.com', role: 'Office Manager', active: true }]);
H.cset('projects', [{ id: 'P1', name: 'Demo Clinic Remodel', address: '1 Demo Rd', pm: 'Demo PM', autoPO: 'Q601', status: 'active' }]);
H.cset('leads', [{ id: 'L_PLANS', name: 'Demo Clinic Plans Lead', stage: 'Bidding', type: 'Commercial', address: '9 Demo Rd', city: 'Memphis', state: 'TN', estimator: 'Demo Owner One', bidDue: '2026-12-20', createdAt: '2026-11-18T12:00:00Z' }]);
/* the bid-hub stand-in: the server's rules (a PM sees their jobs' requests, an admin every one) */
const REQS = [
  { id: 'mr_1', jobId: 'J1', jobTitle: 'Demo Clinic Remodel', item: '5/8 Type X board', qty: 30, unit: 'sht', reason: 'Added soffit per RFI 4', userCompany: 'Alpha Drywall', status: 'pending', at: '2026-11-20T15:00:00Z', pmEmail: PM, crmProjectId: 'P1' },
  { id: 'mr_2', jobId: 'J2', jobTitle: 'Other Job', item: 'Studs', qty: 50, unit: 'ea', reason: 'More framing', userCompany: 'Beta Framing', status: 'pending', at: '2026-11-20T15:05:00Z', pmEmail: 'someone@grayco-cs.com', crmProjectId: '' }];
const POSTS = []; const WHO = {};
/* Owner 1 / Owner 2 as the server resolves them (texts.js ?owners — _lib/owners.js, by role) */
H.onFn('texts', async ({ query }) => query.owners ? { ok: true, owners: [{ slot: 1, id: 'us1', email: OWNER1, name: 'Demo Owner One' }, { slot: 2, id: 'us2', email: OWNER2, name: 'Demo Owner Two' }], admins: [{ id: 'us1', email: OWNER1, name: 'Demo Owner One' }, { id: 'us2', email: OWNER2, name: 'Demo Owner Two' }], saved: null } : { ok: true });
H.onFn('bid-hub', async ({ query, body, method, A }) => {
  const me = WHO[A.name] || {};
  if (method === 'GET' && query.matreqs) return { ok: true, requests: REQS.filter(r => r.status === 'pending' && (me.admin || r.pmEmail === me.email)) };
  if (method === 'GET' && query.manage) return { ok: true, job: { id: query.manage, title: 'Demo Clinic Plans Lead', status: 'open', visibility: 'private', trades: ['Drywall'], plans: [], plansLinks: [], addenda: [], log: [] }, planreqs: [], questions: [], bids: [] };
  if (method === 'POST' && body && body.op === 'postjob') { POSTS.push(Object.assign({ by: me.email }, body)); return { ok: true, created: true, jobId: 'BJ1', visibility: body.visibility, files: (body.files || []).length }; }
  if (method === 'POST' && body && body.op === 'plans') { POSTS.push(Object.assign({ by: me.email }, body)); return { ok: true }; }
  if (method === 'POST' && body && body.op === 'matreq') {
    POSTS.push(Object.assign({ by: me.email }, body));
    const r = REQS.find(x => x.id === body.id); if (!r) return { status: 404, body: { error: 'No such material request.' } };
    if (!me.admin && r.pmEmail !== me.email) return { status: 403, body: { error: 'Only the job\'s PM or an admin answers a material request.' } };
    if (body.act === 'decline' && !String(body.note || '').trim()) return { status: 400, body: { error: 'Add a note for the sub (why not).' } };
    r.status = body.act === 'approve' ? 'approved' : 'declined';
    return { ok: true, request: r, po: body.act === 'approve' ? { id: 'PO_mr_P1', poNo: 'Q601-M1' } : undefined };
  }
  return { ok: true, jobs: [], requests: [] };
});
const OPEN = [];
try {
  /* ══ F. the PM ══ */
  console.log('F. 🧱 material requests — the job\'s PM');
  const pm = await H.computer('PM'); OPEN.push(pm); WHO.PM = { email: PM, admin: false };
  ok(await H.signIn(pm, PM, 60000), 'the PM signs in');
  await H.waitFor(pm, () => !!window._gcMatReq, null, 60000);
  await pm.ev(() => window._gcMatReq.load(true));
  const rows = await pm.ev(() => window._gcMatReq.rows().map(r => ({ key: r.key, group: r.group, title: r.title, approve: r.approve && r.approve.l, doc: r.doc && r.doc.l, chain: r.chain })));
  ok(rows.length === 1 && rows[0].key === 'bp:mr:mr_1' && rows[0].group === 'bp' && /Alpha Drywall asks for 30 sht 5\/8 Type X board — Demo Clinic Remodel/.test(rows[0].title) && /Approve → PO draft/.test(rows[0].approve) && /Decline/.test(rows[0].doc) && /RFI 4/.test(rows[0].chain),
    'the PM\'s ✅ Approvals row: "🧱 Alpha Drywall asks for 30 sht 5/8 Type X board — Demo Clinic Remodel", why, ✅ Approve → PO draft / ✕ Decline (not another PM\'s job)', rows);
  const inExtra = await pm.ev(() => (window._gcApxExtra || []).some(f => { try { return f({ kind: 'pm' }, Date.now()).some(r => r.key === 'bp:mr:mr_1'); } catch (e) { return false; } }));
  ok(inExtra, 'the row is in the ✅ Approvals tab\'s rows (window._gcApxExtra)');
  const set = await H.waitFor(pm, () => { try { const r = window._gcApprovalSet && window._gcApprovalSet(); return r && r.groups && (r.groups.other || []).some(x => x.id === 'matreq_mr_1') ? { total: r.total } : null; } catch (e) { return null; } }, null, 15000);
  ok(!!set, 'and in the ONE approval set (the APPROVE badge / Field\'s My Approvals)', set);
  await pm.ev(() => window._gcMatReq.rows()[0].approve.f());
  await H.waitFor(pm, () => window._gcMatReq.list().length === 0, null, 10000);
  ok(POSTS.length === 1 && POSTS[0].op === 'matreq' && POSTS[0].id === 'mr_1' && POSTS[0].act === 'approve' && POSTS[0].by === PM, '✅ Approve → bid-hub op matreq approve (the server puts it on the job\'s draft supplier PO)', POSTS);
  ok(await pm.ev(() => window._gcMatReq.list().length === 0), 'the card is gone once answered');
  ok(!pm.errs.length, 'no page errors (PM)', pm.errs.slice(0, 5));

  /* ══ F. an admin sees every request; decline needs a note ══ */
  console.log('F. admin');
  const ad = await H.computer('Admin'); OPEN.push(ad); WHO.Admin = { email: OWNER1, admin: true };
  ok(await H.signIn(ad, OWNER1, 60000), 'an admin signs in');
  await H.waitFor(ad, () => !!window._gcMatReq && !!window._gcCallScript, null, 60000);
  await ad.ev(() => window._gcMatReq.load(true));
  const arows = await ad.ev(() => window._gcMatReq.rows().map(r => r.id));
  ok(arows.join() === 'mr_2', 'the admin sees the other job\'s request too (the PM\'s is answered)', arows);
  const noNote = await ad.ev(() => window._gcMatReq.decide('mr_2', 'decline', ''));
  ok(noNote && !noNote.ok && /note/i.test(noNote.error || ''), 'decline without a note → refused (the sub needs the reason)', noNote);
  await ad.ev(() => window._gcMatReq.decide('mr_2', 'decline', 'Use the studs already on site (Bay 2).'));
  ok(POSTS.some(p => p.id === 'mr_2' && p.act === 'decline' && /Bay 2/.test(p.note)), '✕ Decline with the note → op matreq decline (the sub sees the note on the bid site)', POSTS.slice(-1));
  ok(await ad.ev(() => { const r = typeof window._gcRoles === 'function' ? window._gcRoles() : []; return r.indexOf('Insurance Restoration Manager') > -1; }), 'the role "Insurance Restoration Manager" is offered in Admin → people');

  /* ══ H. the call script ══ */
  console.log('H. 📋 the call script');
  const d = await ad.ev(() => window._gcCallScript.defaults());
  const txt = JSON.stringify(d);
  ok(/Check, cash, card, or your insurance company pays us directly/.test(txt) && /assignment of benefits is case by case/.test(txt) && /deposit is always required/.test(txt), 'payment: check, cash, card, insurance direct (assignment of benefits case by case — the PM decides); a deposit always');
  ok(/Financing is coming soon — ask your project manager/.test(txt) && d.faq.some(r => /discounts/.test(r[0]) && /^____/.test(r[1])) && /information on our referral program/.test(txt), 'financing coming soon; discounts left as an editable blank; the referral line');
  ok(/estimates are free/.test(txt) && /We do not give prices on the phone/.test(txt) && /within 24 hours/.test(txt) && /within a week/.test(txt) && /TESTING has a fee/.test(txt), 'free estimates, no prices on the phone, PM call-back in 24 h, the written estimate in a week, testing has a fee');
  ok(/we work with all insurance companies/.test(txt) && /The PM will advise you/.test(txt) && /we never say what it will cover/.test(txt) && /billed to the insurance claim/.test(txt), 'insurance: all companies, not filed yet → the PM will advise, never what it covers, after-hours charge → billed to the claim');
  ok(/our on-call team is on the way/.test(txt) && /text photos/.test(d.closing) && /TN #85034 BCB · MS #______ · AR #______/.test(txt), 'emergencies: "on the way" (no time promised); photos by text; licenses TN #85034 BCB with MS / AR blanks');
  ok(/Tipton/.test(txt) && /Crittenden County AR/.test(txt) && /Monday–Friday, 8 AM–5 PM/.test(txt) && /Spanish/.test(txt) && /that PM's own customers/.test(txt) && /general questions only/.test(txt), 'service area, hours, office visits, Spanish, cell numbers only to the PM\'s own customers, anonymous callers → general questions only');
  ok(d.nodo.join('|') === 'Plumbing-only jobs|Handyman / tiny jobs|Jobs under $1,000' && d.intake.length === 5 && d.intake.some(r => /Mold \/ asbestos \/ lead/.test(r[0])) && d.intake.some(r => /Commercial \/ bids/.test(r[0])) && d.after.some(x => /reminds the PM/.test(x)) && d.after.some(x => /calls back twice/.test(x)),
    'what we do NOT do; "Ask these — by job type" (water / fire / storm, mold / asbestos / lead, roofing, remodels, commercial / bids); after the call: the office reminds the PM, voicemail leads called back twice', { nodo: d.nodo, intake: d.intake.map(r => r[0]), after: d.after });
  ok(d.svc.construction.some(x => /container homes/.test(x)) && d.svc.construction.some(x => /Land clearing/.test(x)) && d.svc.mitigation.some(x => /do not plunge toilets/.test(x)) && d.svc.environmental.some(x => /Air quality/.test(x)), 'the services by company (new homes / container homes, land clearing, sewage — no toilet plunging, air quality testing)');
  ok(['emergency', 'mit', 'env', 'res', 'com', 'lsa', 'bid', 'adjuster', 'past', 'legal', 'media', 'owner', 'complaint', 'sales', 'hiring'].every(k => d.routing.some(r => r[0] === k)), 'who gets the call: the old rows + adjuster, past customer, legal, media, asks for an owner, complaint, salesperson, hiring', d.routing.map(r => r[0]));
  ok(!/Wesley|Nick|Johnson|Gray\b/.test(JSON.stringify(d.routing)), 'the routing names roles (Owner 1 / Owner 2 / the PM), never a person');
  /* the people list the page uses: + a Mitigation PM (made up) */
  await ad.ev(() => { const add = l => { if (Array.isArray(l) && !l.some(u => u && u.id === 'us4m')) l.push({ id: 'us4m', name: 'Demo Mit PM', email: 'mitpm@grayco-cs.com', role: 'Mitigation PM', active: true }); };
    add(window._crm.users); try { if (window._gcPeople && window._gcPeople.users) add(window._gcPeople.users()); } catch (e) {} try { window._gcLsaPm.owners(); } catch (e) {} window._gcCallScript.routes(); });
  await H.sleep(1500);
  const R1 = await H.waitFor(ad, () => { const r = window._gcCallScript.routes(); return r.mit && r.mit.who && r.mit.who.name === 'Demo Owner One' ? { mit: r.mit.who.name, em: r.emergency.who && r.emergency.who.name, legal: r.legal.who && r.legal.who.name, media: r.media.who && r.media.who.name, adj: r.adjuster.who && r.adjuster.who.name, sales: r.sales.fixed, hiring: r.hiring.fixed, owner: r.owner.fixed, complaint: r.complaint.fixed } : null; }, null, 15000);
  ok(R1 && R1.mit === 'Demo Owner One' && R1.em === 'Demo Mit PM' && R1.legal === 'Demo Owner Two' && R1.media === 'Demo Owner One' && R1.adj === 'Demo Owner Two' && /decline/.test(R1.sales) && /office@grayco-cs\.com/.test(R1.hiring) && /what it is about/.test(R1.owner) && /office first/.test(R1.complaint),
    'today: water / fire / mold / storm → Owner 1 (no Insurance Restoration Manager yet); emergency → the Mitigation PM; legal → Owner 2; media → Owner 1; adjuster → the job\'s PM else Owner 2; salespeople / hiring / an owner asked for / complaints', R1);
  const R2 = await ad.ev(() => { (window._crm.users || []).push({ id: 'us9', name: 'Demo Restoration Mgr', email: 'irm@grayco-cs.com', role: 'Insurance Restoration Manager', active: true }); try { if (window._gcPeople && window._gcPeople.users) { const l = window._gcPeople.users(); if (Array.isArray(l) && !l.some(u => u.id === 'us9')) l.push({ id: 'us9', name: 'Demo Restoration Mgr', email: 'irm@grayco-cs.com', role: 'Insurance Restoration Manager', active: true }); } } catch (e) {}
    const r = window._gcCallScript.routes(); return { mit: r.mit.who && r.mit.who.name, ins: r.ins.who && r.ins.who.name }; });
  ok(R2.mit === 'Demo Restoration Mgr' && R2.ins === 'Demo Restoration Mgr', 'someone gets the "Insurance Restoration Manager" role → those calls go to them', R2);
  const svcRoute = await ad.ev(() => ['water', 'fire', 'storm', 'mold', 'asbestos'].map(id => window._gcCallLead.route(id, false, '').key));
  ok(svcRoute.join() === 'mit,mit,mit,mit,env', 'the 📞 form\'s pick: water / fire / storm / mold → that route; asbestos → the Environmental lead', svcRoute);
  /* the script on screen */
  await ad.ev(() => window._gcCallScript.open());
  const scr = await H.waitFor(ad, () => { const b = document.querySelector('#gc-cs-ov [data-cs-body]'); return b && b.querySelector('[data-cs-intake]') ? { t: b.innerText, it: b.querySelectorAll('[data-cs-it]').length, nodo: !!b.querySelector('[data-cs-nodo]'), after: b.querySelectorAll('[data-cs-after] li').length, mit: (b.querySelector('[data-cs-rt="mit"] .who') || {}).textContent, hiring: (b.querySelector('[data-cs-rt="hiring"] .who') || {}).textContent } : null; }, null, 15000);
  ok(scr && scr.it === 5 && scr.nodo && scr.after === 4 && /2b\. Ask these — by job type/.test(scr.t) && /We do NOT do/.test(scr.t) && /8\. After the call/.test(scr.t) && scr.mit === 'Demo Restoration Mgr' && /office@grayco-cs\.com/.test(scr.hiring), 'on screen: 2b. Ask these — by job type (5), 🚫 We do NOT do, 8. After the call, today\'s names by role', scr && { it: scr.it, nodo: scr.nodo, after: scr.after, mit: scr.mit, hiring: scr.hiring });
  /* a script saved before (the old standard text, one line edited by an admin) */
  const up = await ad.ev(async () => {
    const S = window._gcCallScript; const cur = S.defaults();
    const legacy = { greeting: 'Thanks for calling GrayCo — this is the office.', closing: 'Thank you, ____. I have everything I need — [the person] will call you back shortly at the number you gave me. If water is coming in and it is safe, shut off the main water valve. Thank you for calling GrayCo!',
      faq: [['How do I pay?', 'For now we take check or cash.']], at: '2026-11-19T12:00:00Z' };
    const k = localStorage.getItem('grayco_sb_key'), u = (localStorage.getItem('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, '');
    await fetch(u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'gc_call_script', value: legacy }) });
    const v = await S.get(true); return { greet: v.greeting, close: v.closing, faq: v.faq.length, cur: cur.faq.length, intake: v.intake.length };
  });
  ok(up.greet === 'Thanks for calling GrayCo — this is the office.' && /text photos/.test(up.close) && up.intake === 5, 'a saved older script: the admin\'s own greeting stays; the old standard closing takes the new one; the new sections appear', up);
  const editable = await ad.ev(async () => { const S = window._gcCallScript; await S.save({}); const v = await S.get(true); v.faq = v.faq.map(r => /discounts/.test(r[0]) ? [r[0], '10% off for seniors and veterans'] : r); const r = await S.save(v); const w = await S.get(true); return { ok: r.ok, d: (w.faq.find(x => /discounts/.test(x[0])) || [])[1] }; });
  ok(editable.ok && editable.d === '10% off for seniors and veterans', 'an admin fills in the discounts blank (the script stays editable)', editable);
  /* ══ J. 📢 Put on bid portal: ＋ Upload plans / files, ＋ Add link ══ */
  console.log('J. 📢 Put on bid portal — upload plans / add a link');
  await ad.ev(() => window._gcBidPost.open({ leadId: 'L_PLANS' }));
  const dlg = await H.waitFor(ad, () => { const m = document.getElementById('gcbp-modal'); return m && m.querySelector('[data-bp="upload"]') && m.querySelector('[data-bp="addlink"]') && m.querySelector('[data-bp-drop]') ? { none: /No files on this lead yet/.test(m.innerText) } : null; }, null, 20000);
  ok(dlg && dlg.none, 'the dialog on a lead with no plans: "＋ Upload plans / files", "＋ Add link" and a drop zone', dlg);
  await ad.page().setInputFiles('#gcbp-modal [data-bp-upfile]', [{ name: 'A-101 Floor Plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% demo plan sheet\n%%EOF') }, { name: 'Specs Div 09.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% demo specs\n%%EOF') }]);
  const upJ = await H.waitFor(ad, () => { const f = window._gcBidPost.filesUI().filter(x => x.fresh && x.ref); return f.length === 2 ? f.map(x => ({ ref: x.ref, cat: x.category, on: x.checked })) : null; }, null, 20000);
  ok(upJ && upJ.every(x => /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(x.ref) && x.on) && upJ.map(x => x.cat).join() === 'Plans,Specs', 'the picker uploads through the CRM file pipeline (crm-files reference, no base64), each ticked to share, sorted Plans / Specs', upJ);
  const ldocs = await H.waitFor(ad, () => { const l = (window._crm.leads || []).find(x => x.id === 'L_PLANS'); return l && (l.files || []).length === 2 ? l.files.map(f => f.ref) : null; }, null, 10000);
  ok(ldocs && ldocs.every(r => /^sb:crm-files\//.test(r)), 'saved on the lead\'s documents in the CRM (lead.files: references only)', ldocs);
  const ticks = await ad.ev(() => Array.from(document.querySelectorAll('#gcbp-modal [data-bp-file]')).map(x => x.checked));
  ok(ticks.length === 2 && ticks.every(Boolean), 'the files list shows them, ticked', ticks);
  ad.prompts.length = 0;
  await ad.ev(() => { window.__p = window.prompt; const a = ['https://drive.example.test/plans', 'Drive — plans']; window.prompt = () => a.shift(); document.querySelector('#gcbp-modal [data-bp="addlink"]').click(); window.prompt = window.__p; });
  ok(await ad.ev(() => window._gcBidPost.filesUI().some(x => x.link === 'https://drive.example.test/plans' && x.checked)), '＋ Add link: the link is on the list, ticked');
  await ad.ev(() => { const t = document.querySelector('#gcbp-modal [data-bp="trade"]'); if (t) t.click(); const ti = document.getElementById('gcbp-title'); if (ti && !ti.value) ti.value = 'Demo Clinic Plans Lead'; document.querySelector('#gcbp-modal [data-bp="post"]').click(); });
  const pj = await H.waitFor(ad, () => true, null, 300) && POSTS.find(p => p.op === 'postjob');
  await H.sleep(800);
  const pj2 = POSTS.find(p => p.op === 'postjob');
  ok(pj2 && pj2.files.length === 2 && pj2.files.every(f => /^sb:crm-files\//.test(f.ref)) && pj2.files.map(f => f.category).join() === 'Plans,Specs' && pj2.links.some(l => l.url === 'https://drive.example.test/plans'), '📢 Put on bid portal: the uploaded files (by reference) and the link go to the bid portal job', pj2 && { files: pj2.files, links: pj2.links });
  /* the same on 🏗 Bid portal → 📂 Manage → 📝 Details */
  const mg = await ad.ev(async () => { try { window._gcSys2.open('BJ1', 'details'); } catch (e) { return 'no open: ' + e.message; } return 'ok'; });
  const dt = await H.waitFor(ad, () => { const x = document.querySelector('#gcsys2 [data-dt-up]'); return x ? { pick: !!x.querySelector('[data-a="pick"]'), link: !!x.querySelector('[data-a="dtlink"]') } : null; }, null, 15000);
  ok(dt && dt.pick && dt.link, '📂 Manage → 📝 Details has "＋ Upload plans / files" (the bid site\'s upload + review) and "＋ Add link"', { mg, dt });
  if (dt) { await ad.ev(() => { const a = ['https://drive.example.test/more', 'More plans']; const p0 = window.prompt; window.prompt = () => a.shift(); document.querySelector('#gcsys2 [data-dt-up] [data-a="dtlink"]').click(); window.prompt = p0; }); await H.sleep(800); }
  ok(POSTS.some(p => p.op === 'plans' && p.addLink && p.addLink.url === 'https://drive.example.test/more'), '…＋ Add link there → bid-hub op plans addLink', POSTS.filter(p => p.op === 'plans'));
  /* ══ G. the customer's own carrier (CRM side) ══ */
  console.log('G. the customer\'s own insurance company');
  const G = await ad.ev(() => {
    const u = window._gcIns4.core.homeownerUpdate({ id: 'CL1', projectId: 'P1', carrier: 'Sample Mutual Insurance', claimNumber: 'CLM-0042', adjuster: { company: 'Sample Adjusting Co' }, policyNumber: 'POL-99887', phases: [] });
    const sc = window._gcEstPdf.scrub('Per the State Farm scope; Allstate denied the neighbor; claim # CLM-0042', Object.assign([], { own: ['State Farm'] }));
    return { text: u.text, sc };
  });
  ok(/Your insurance claim: Sample Mutual Insurance, claim # CLM-0042/.test(G.text) && !/Sample Adjusting Co|POL-99887/.test(G.text), 'INS4 homeowner update: their own carrier + claim # named; the adjusting company and the policy # still hidden', G.text);
  ok(/State Farm scope/.test(G.sc) && /your insurance company denied/.test(G.sc) && /CLM-0042/.test(G.sc), 'ESTPDF customer copy: their own carrier and claim # stay; another carrier\'s name is still replaced', G.sc);
  ok(!ad.errs.length, 'no page errors (admin)', ad.errs.slice(0, 5));
} finally { for (const c of OPEN) await c.close().catch(() => {}); }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
