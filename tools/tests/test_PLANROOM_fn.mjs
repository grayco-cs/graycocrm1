// test_PLANROOM_fn.mjs <build-dir> — patch PLANROOM, node only (owner 11/19: "All the info from plan rooms … scope of works, pre-bids, any
// required insurances, meetings etc, and make sure it's in the CRM too. I'm on MR Plan Room as a public bid for them for Jackson State.")
// Saved public plan-room pages (tools/tests/fixtures/planroom — fetched 11/19 from mrplanroom.com, rkaplanroom.build, bidding.bargedesign.com and
// cityofbartlett.org; people's names, phones and e-mails replaced with made-up ones; the bid notice PDFs kept as their words and typeset again
// here as real PDFs) served by a fake fetch. Nothing reaches the network.
//   A. the PDF reader (_lib/pdftext.js): a Flate PDF with a ToUnicode map and split TJ runs, a plain WinAnsi one, a non-PDF, a scan (no words)
//   B. which plan room: ReproConnect (MR / RKA / Barge) public; BuildingConnected / PlanHub / iSqFt / ConstructConnect sign-in only (never fetched);
//      private addresses and http:// refused; robots.txt Content-Signal ai-input=no and Disallow
//   C. MR plan room — Jackson State Community College Student Center Updates (the owner's lead): every field, the plain reader only (the site asks
//      for no AI input), the document list, the checklist, the source words, our user agent, no sign-in page asked for
//   D. MR — MHA Central Office (bid date + time, pre-bid place, "not a bidding requirement" → not mandatory, minorities / small businesses, site visits)
//   E. Barge — Sylacauga Airport (5 % bid bond, performance & payment bonds, prevailing wage / Davis-Bacon, licensing, DBE, "Bidding Closed")
//   F. RKA — City of Oxford Pickle Ball (4 addenda listed)
//   G. a public CivicPlus bid page (City of Bartlett): read, the AI reader allowed there (a fake AI answer merged in, "AI read")
//   H. walls: a redirect to a sign-in page, a captcha page, 401/403, a robots Disallow, a document over the size limit — nothing read past them
//   I. pasted invitation text / PDF (staff's own copy): read, AI allowed
//   J. storing: the Lead Inbox item (blanks only; a date a person typed stays; the plan room's own earlier value is updated), the bid job (site
//      walk, questions due, our bid due, requirements; a site walk a person set stays; never a sub notice), the checklist keeps ticked boxes
//   K. bid-inbox.js end to end on an in-memory database: ?planroom=1 read / save / check / GET, the bid job + the BIDPO schedule push, the hourly
//      limits, the automatic read of a new MR plan-room lead (and not of a BuildingConnected one), nothing sent to anyone
import path from 'path'; import fs from 'fs'; import zlib from 'zlib'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.');
const FX = path.join(BUILD, 'tools/tests/fixtures/planroom');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const PR = require(path.join(BUILD, 'netlify/functions/_lib/planroom.js'));
const PDF = require(path.join(BUILD, 'netlify/functions/_lib/pdftext.js'));
const fx = n => fs.readFileSync(path.join(FX, n), 'utf8');

/* ── a small PDF writer: the saved notice words typeset again as a real PDF ── */
function mkPdf(text, mode){
  const lines = text.replace(/\f/g, '').split('\n'), pages = []; for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  const objs = []; const add = s => { objs.push(s); return objs.length; };
  const codes = {}; let next = 0x0101; const code = ch => codes[ch] || (codes[ch] = next++);
  const hex = str => Array.from(str).map(ch => code(ch).toString(16).padStart(4, '0')).join('');
  const lit = str => '(' + str.replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, c => c === '’' ? '\\222' : c === '–' ? '\\226' : c === '—' ? '\\227' : c === '“' ? '\\223' : c === '”' ? '\\224' : '?') + ')';
  const contents = pages.map(pl => {
    let c = 'BT\n/F1 10 Tf\n';
    if (mode === 'ansi') { c += '12 TL\n50 760 Td\n'; pl.forEach(l => { c += lit(l) + " '\n"; }); }
    else pl.forEach((l, i) => { const y = 760 - i * 14, k = Math.max(1, Math.floor(l.length / 2)); c += '1 0 0 1 50 ' + y + ' Tm\n[<' + hex(l.slice(0, k)) + '> -12 <' + hex(l.slice(k)) + '>] TJ\n'; });
    return c + 'ET\n';
  });
  const cat = add(''), pagesObj = add(''), font = add(''), tu = mode === 'ansi' ? 0 : add('');
  const pageIds = contents.map(c => { const z = zlib.deflateSync(Buffer.from(c, 'latin1')); const cid = add({ stream: z, dict: '<< /Length ' + z.length + ' /Filter /FlateDecode >>' }); return add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ' + font + ' 0 R >> >> /Contents ' + cid + ' 0 R >>'); });
  objs[cat - 1] = '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R >>';
  objs[pagesObj - 1] = '<< /Type /Pages /Kids [' + pageIds.map(p => p + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>';
  if (mode === 'ansi') objs[font - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  else {
    const cm = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n' + Object.keys(codes).length + ' beginbfchar\n'
      + Object.keys(codes).map(ch => '<' + codes[ch].toString(16).padStart(4, '0') + '> <' + ch.charCodeAt(0).toString(16).padStart(4, '0') + '>').join('\n') + '\nendbfchar\nendcmap end end\n';
    const z = zlib.deflateSync(Buffer.from(cm, 'latin1'));
    objs[tu - 1] = { stream: z, dict: '<< /Length ' + z.length + ' /Filter /FlateDecode >>' };
    objs[font - 1] = '<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Arial /Encoding /Identity-H /ToUnicode ' + tu + ' 0 R >>';
  }
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  objs.forEach((o, i) => { if (typeof o === 'string') parts.push(Buffer.from((i + 1) + ' 0 obj\n' + o + '\nendobj\n', 'latin1')); else { parts.push(Buffer.from((i + 1) + ' 0 obj\n' + o.dict + '\nstream\n', 'latin1'), o.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')); } });
  parts.push(Buffer.from('trailer\n<< /Root ' + cat + ' 0 R /Size ' + (objs.length + 1) + ' >>\n%%EOF\n', 'latin1'));
  return Buffer.concat(parts);
}
const norm = t => String(t).replace(/\s+/g, ' ').trim();

/* ── A. the PDF reader ── */
{
  const words = fx('mr_11447_invitation_to_bid.txt');
  const a = PDF.text(mkPdf(words, 'cmap')), b = PDF.text(mkPdf(words, 'ansi'));
  ok('A1 a Flate PDF with a ToUnicode map and split TJ runs reads back word for word', norm(a) === norm(words), [norm(a).slice(0, 300), norm(words).slice(0, 300)]);
  ok('A2 a plain WinAnsi PDF (Tj, \' and T*) reads back word for word (cashier’s, the dashes)', norm(b) === norm(words), [norm(b).slice(0, 300)]);
  ok('A3 not a PDF, an empty buffer, garbage → \'\' (never throws)', PDF.text(Buffer.from('<html>hi</html>')) === '' && PDF.text(Buffer.alloc(0)) === '' && PDF.text(Buffer.from('%PDF-1.4 garbage \u0000\u0001')) === '');
  const scan = mkPdf('', 'ansi');
  ok('A4 a PDF with no words (a scan) → \'\'', PDF.text(scan) === '', PDF.text(scan));
  const two = PDF.text(mkPdf(Array.from({ length: 70 }, (x, i) => 'Line ' + (i + 1) + ' of the notice').join('\n'), 'cmap'));
  ok('A5 two pages, in page order', /Line 1 of the notice[\s\S]*Line 48 of[\s\S]*Line 49 of[\s\S]*Line 70 of/.test(two), two.slice(0, 200));
}

/* ── B. which plan room ── */
{
  const c = PR.classify('https://www.mrplanroom.com/projects/11447/plans/jackson-state-community-college-student-center-updates?x=1');
  ok('B1 an MR plan room tab link → the public project details page (ReproConnect)', c.ok && c.kind === 'repro' && c.url === 'https://www.mrplanroom.com/projects/11447/details/jackson-state-community-college-student-center-updates' && /MR plan room/.test(c.board), c);
  ok('B2 RKA and Barge are ReproConnect too', PR.classify('https://www.rkaplanroom.build/projects/11289/details/x').kind === 'repro' && PR.classify('https://bidding.bargedesign.com/projects/11146/addenda/y').kind === 'repro');
  const sign = ['https://app.buildingconnected.com/projects/abc/bid-packages', 'https://app.planhub.com/project/123', 'https://app.isqft.com/x', 'https://www.constructconnect.com/project/1', 'https://app.procore.com/1/bid'].map(PR.classify);
  ok('B3 BuildingConnected / PlanHub / iSqFt / ConstructConnect / Procore → sign-in only, with what to do instead (forward the e-mail, paste the PDF)', sign.every(x => !x.ok && x.kind === 'login' && x.login && /forward/i.test(x.todo) && /drop them on the lead|paste/i.test(x.todo)), sign.map(x => x.kind + ':' + x.board));
  ok('B4 http://, private addresses and junk are refused', ['http://example.com/bid', 'https://192.168.1.4/projects/1/details/a', 'https://localhost/x', 'not a url', ''].every(u => !PR.classify(u).ok));
  ok('B5 any other https page → read as a public page', PR.classify('https://www.cityofbartlett.org/bids.aspx?bidID=520').kind === 'generic');
  const rb = PR.robots(fx('robots_reproconnect.txt'));
  ok('B6 the ReproConnect robots.txt: allowed to read (search=yes) but ai-input=no', rb.allows('/projects/11447/details/x') && rb.aiInput === 'no');
  const rb2 = PR.robots(fx('robots_bartlett.txt'));
  ok('B7 Bartlett robots.txt: the bid page allowed, /admin not; no AI signal', rb2.allows('/bids.aspx?bidID=520') && !rb2.allows('/admin/x') && rb2.aiInput === '');
}

/* ── the fake network ── */
function net(map, opt){
  opt = opt || {};
  const calls = [];
  const f = async (u, o) => {
    u = String(u); calls.push({ u, ua: o && o.headers && o.headers['User-Agent'] });
    const host = new URL(u).hostname;
    if (/robots\.txt$/.test(u)) { const r = opt.robots ? opt.robots(host) : /bartlett/.test(host) ? fx('robots_bartlett.txt') : fx('robots_reproconnect.txt'); return resp(200, Buffer.from(r), 'text/plain', u); }
    const k = Object.keys(map).find(x => u.indexOf(x) >= 0);
    if (!k) return resp(404, Buffer.from('not found'), 'text/html', u);
    const v = typeof map[k] === 'function' ? map[k](u) : map[k];
    if (v && v.status) return resp(v.status, Buffer.from(v.body || ''), v.type || 'text/html', v.url || u, v.len);
    const buf = Buffer.isBuffer(v) ? v : Buffer.from(fx(v)); return resp(200, buf, Buffer.isBuffer(v) ? 'application/pdf' : 'text/html; charset=utf-8', u);
  };
  return { f, calls };
}
function resp(status, buf, type, url, len){ return { ok: status >= 200 && status < 300, status, url, headers: { get: k => low(k) === 'content-type' ? type : low(k) === 'content-length' ? String(len || buf.length) : '' }, arrayBuffer: async () => buf, text: async () => buf.toString('utf8'), json: async () => JSON.parse(buf.toString('utf8')) }; }
function low(v){ return String(v || '').toLowerCase(); }
function fakeAi(out){ const calls = []; return { calls, ready: () => true, ask: async o => { calls.push(o); return { ok: true, out: typeof out === 'function' ? out(o) : out }; } }; }
const ITB = mkPdf(fx('mr_11447_invitation_to_bid.txt'), 'cmap'), MHA = mkPdf(fx('mr_11380_legal_notice.txt'), 'cmap'), BARGE = mkPdf(fx('barge_11146_advertisement.txt'), 'ansi');
const JSU_URL = 'https://www.mrplanroom.com/projects/11447/details/jackson-state-community-college-student-center-updates';
const JSU = { '/details/jackson': 'mr_11447_details.html', '/addenda/jackson': 'mr_11447_addenda.html', '/specs/jackson': 'mr_11447_specs.html', '/plans/jackson': 'mr_11447_plans.html', '/preview/document/11447/568508': ITB };
const REF = () => Date.parse('2026-11-19T19:00:00Z');

/* ── C. Jackson State on MR plan room ── */
let JPR = null;
{
  const N = net(JSU), A = fakeAi({ project_name: 'SHOULD NOT BE USED' });
  const r = await PR.read(JSU_URL, { fetch: N.f, ai: A, pauseMs: 0, now: REF }); JPR = r; const F = r.fields;
  ok('C1 read, nothing missing: public, not a sign-in', !r.why && !r.login && r.kind === 'repro', r.why);
  ok('C2 project, bid # (SBC), owner (the State of Tennessee, bids at Jackson State Community College), designer, location', F.projectName === 'Jackson State Community College - Student Center Updates' && F.bidNumber === 'SBC Number 166/019-02-2025' && /State of Tennessee/.test(F.owner) && /Jackson State Community College/.test(F.owner) && /UrbanARCH/.test(F.designer) && F.location === '33 Presidents Way, Jackson, TN 38301', F);
  ok('C3 bid due Wed Dec 16, 2026 — the time is TBD (said so, nothing made up)', F.bidDue === '2026-12-16' && /TBD/.test(F.bidDueText), [F.bidDue, F.bidDueText]);
  ok('C4 pre-bid conference Mon Nov 30, 2026 10:30 AM, Conference Room 113, F.E. Wright Administration Building, 2046 North Parkway; mandatory not stated (null)', F.preBid && F.preBid.date === '2026-11-30' && F.preBid.time === '10:30' && /Conference Room 113/.test(F.preBid.place) && /2046 North Parkway/.test(F.preBid.place) && F.preBid.mandatory === null, F.preBid);
  ok('C5 delivery: sealed bids to General Contractors, delivered to Jackson State Community College, opened publicly', /Sealed bid/.test(F.delivery) && /General Contractors/.test(F.delivery) && /2046 North Parkway/.test(F.delivery), F.delivery);
  ok('C6 scope of work (the page\'s "Scope of Work:" — demolition, masonry, metal panel, storefront, TPO roof, utilities) and its trades', /TPO roof membrane/.test(F.scope) && /tap fees/.test(F.scope) && ['Demolition', 'Masonry', 'Metal panels', 'Roofing', 'Storefront / glazing', 'Drywall / partitions', 'Electrical / lighting', 'Fire protection'].every(t => F.trades.includes(t)), [F.scope.slice(0, 120), F.trades]);
  ok('C7 bonds: 5 % bid security (bid bond or certified / cashier\'s check); licensing: licensed and qualified per state law', F.bidBond === '5%' && /Bid Bond/.test(F.bonds[0]) && /licensed and qualified/.test(F.licensing[0]), [F.bidBond, F.bonds, F.licensing]);
  ok('C8 no insurance limits, prevailing wage or MBE on the public pages → empty (they are in the project manual), never made up', !F.insurance.length && !F.prevailingWage.length && !F.mbeDbe.length && !F.certifiedPayroll.length);
  ok('C9 the contact (the designer\'s, from the plan room) and the plan room status', F.contact.company === 'UrbanARCH' && F.contact.name === 'Pat Sample' && F.status === 'Pending', F.contact);
  ok('C10 the plain reader only: mrplanroom.com asks for no AI input (robots Content-Signal) → the AI is never called, and the card says why', r.reader === 'plain' && A.calls.length === 0 && /ai-input=no/.test(r.aiNote), [r.reader, A.calls.length, r.aiNote]);
  const plans = r.docs.filter(d => d.section === 'Plans'), specs = r.docs.filter(d => d.section === 'Specs'), ref = r.docs.find(d => d.section === 'Reference');
  ok('C11 the documents: the public Invitation to Bid (read), the Project Manual (66.8 MB, listed — download needs the sign-in), the plan sheets with links to the plan room', ref && ref.name === 'Invitation to Bid.pdf' && ref.read === true && specs.length === 1 && specs[0].name === 'Project Manual' && /66\.8/.test(specs[0].size) && plans.length >= 30 && plans.every(d => /\/plans\/jackson-state.*\?wv=\d+$/.test(d.url)), [ref, specs, plans.length]);
  ok('C12 no addenda yet (the Addenda tab is empty)', Array.isArray(F.addenda) && F.addenda.length === 0, F.addenda);
  ok('C13 the checklist: bid bond 5 % (bond or certified / cashier\'s check), state licence', r.checklist[0].kind === 'bond' && /5%/.test(r.checklist[0].label) && r.checklist[1].kind === 'license' && r.checklist.slice(2).every(x => /^(prebid|sealed|prequal|questions|biddue)$/.test(x.kind)) && /* BIDSITE3 I: + the reminder boxes */ r.checklist.every(x => x.done === false), r.checklist);
  ok('C14 where each came from: the page or "Invitation to Bid.pdf"', r.sourceSnippets.preBid && /PRE-BID CONFERENCE/.test(r.sourceSnippets.preBid.text) && r.sourceSnippets.owner && r.sourceSnippets.owner.from === 'Invitation to Bid.pdf' && r.sourceSnippets.bonds, r.sourceSnippets);
  ok('C15 polite: robots.txt first, our user agent on every request, no sign-in page or download link asked for, at most 6 requests', /robots\.txt$/.test(N.calls[0].u) && N.calls.every(c => /^GrayCoBidWatch\//.test(c.ua)) && !N.calls.some(c => /auth\/login|\/download|\/cart/.test(c.u)) && N.calls.length <= 6, N.calls.map(c => c.u));
  ok('C16 the source links (project page, Addenda, Specs, Plans, Plan holders)', ['Project page', 'Addenda', 'Specs', 'Plans', 'Plan holders'].every(l => r.sourceLinks.some(x => x.label === l)), r.sourceLinks);
}

/* ── D. MHA (MR plan room) ── */
{
  const N = net({ '/details/mha': 'mr_11380_details.html', '/addenda/mha': 'mr_11380_addenda.html', '/preview/document/11380/565204': MHA });
  const r = await PR.read('https://www.mrplanroom.com/projects/11380/details/mha-central-office-phase-ii-roof-and-elevator-replacement-package', { fetch: N.f, pauseMs: 0, now: REF }), F = r.fields;
  ok('D1 bid due Thu Dec 3, 2026 2:00 PM (the plan room\'s Bid Date), solicitation #, owner Memphis Housing Authority', F.bidDue === '2026-12-03T14:00' && /OR 26 B 00772/.test(F.bidNumber) && F.owner === 'Memphis Housing Authority', [F.bidDue, F.bidNumber, F.owner]);
  ok('D2 pre-bid Tue Nov 10 10:00 at the Memphis Housing Authority, 700 Adams Avenue, Boardroom — "neither … is a bidding requirement" → not mandatory', F.preBid.date === '2026-11-10' && F.preBid.time === '10:00' && /700 Adams Avenue/.test(F.preBid.place) && F.preBid.mandatory === false, F.preBid);
  ok('D3 site visits by appointment, the MBE line (minorities and small businesses), online submission', /Site visits can be scheduled/.test(F.siteVisit) && /minorities and small businesses/.test(F.mbeDbe[0]) && /online/.test(F.delivery), [F.siteVisit, F.mbeDbe, F.delivery]);
  ok('D4 the contact block (redacted fixture names) and the trades in the scope (roof, elevator, concrete …)', /Kim Sample/.test(F.contact.name) && F.trades.includes('Roofing') && F.trades.includes('Elevator'), [F.contact, F.trades]);
}

/* ── E. Barge ── */
{
  const N = net({ '/details/syl': 'barge_11146_details.html', '/preview/document/11146/556791': BARGE });
  const r = await PR.read('https://bidding.bargedesign.com/projects/11146/details/sylacauga-airport-t-hangar', { fetch: N.f, pauseMs: 0, now: REF }), F = r.fields;
  ok('E1 5 % bid bond, performance & payment bonds, prevailing wages / Davis-Bacon, Alabama licensing, DBE', F.bidBond === '5%' && F.bonds.some(b => /performance and payment bonds/.test(b)) && F.prevailingWage.some(x => /prevailing wages/.test(x)) && F.prevailingWage.some(x => /Davis Bacon/.test(x)) && F.licensing.some(x => /licensed under the provisions/.test(x)) && F.mbeDbe.some(x => /DBE/.test(x)), F);
  ok('E2 owner City Of Sylacauga; pre-bid Aug 26 2:00 PM in the airport conference room', /Sylacauga/.test(F.owner) && F.preBid.date === '2026-08-26' && F.preBid.time === '14:00' && /airport conference room/.test(F.preBid.place), [F.owner, F.preBid]);
  ok('E3 "Bidding Closed" is said on the card', r.warnings.some(w => /Bidding Closed/.test(w)) && F.status === 'Bidding Closed', r.warnings);
  ok('E4 the checklist has the bonds, licensing and the wage lines', ['bond', 'license', 'wage', 'mbe'].every(k => r.checklist.some(x => x.kind === k)), r.checklist.map(x => x.kind));
}

/* ── F. RKA ── */
{
  const N = net({ '/details/city': 'rka_11289_details.html', '/addenda/city': 'rka_11289_addenda.html' });
  const r = await PR.read('https://www.rkaplanroom.build/projects/11289/details/city-of-oxford-stone-center-pickle-ball', { fetch: N.f, pauseMs: 0, now: REF });
  ok('F1 RKA plan room: four addenda listed by name, bid date 11/4 2:00 PM, pre-bid 10/13 10:00', r.fields.addenda.length === 4 && /Addendum No\. 1/.test(r.fields.addenda[0]) && r.fields.bidDue === '2026-11-04T14:00' && r.fields.preBid.date === '2026-10-13' && r.docs.filter(d => /Addenda/.test(d.section)).length === 4, [r.fields.addenda, r.fields.bidDue]);
}

/* ── G. a public bid page that allows AI input ── */
{
  const N = net({ 'bids.aspx?bidID=520': 'generic_bartlett_bid_520.html' });
  const A = fakeAi({ project_name: 'Coffee Supplies-Citywide', owner: 'City of Bartlett', scope_summary: 'Coffee supplies and equipment for City departments.', insurance: ['General liability $1,000,000 per occurrence'], quotes: [{ field: 'insurance', quote: 'General liability $1,000,000' }] });
  const r = await PR.read('https://www.cityofbartlett.org/bids.aspx?bidID=520', { fetch: N.f, ai: A, pauseMs: 0, now: REF }), F = r.fields;
  ok('G1 the plain reader: bid due Thu Dec 3, 2026 2:00 PM, owner City of Bartlett', F.bidDue === '2026-12-03T14:00' && /City of Bartlett/.test(F.owner), [F.bidDue, F.owner]);
  ok('G2 the site allows it → the AI reader is asked once (with the page words, a tool, no model named here) and its answer is merged ("AI read")', A.calls.length === 1 && A.calls[0].tool && A.calls[0].tool.name === 'record_plan_room_details' && !A.calls[0].model && r.reader === 'ai' && F.insurance[0] === 'General liability $1,000,000 per occurrence' && r.sourceSnippets.insurance.from === 'AI read' && F.bidDue === '2026-12-03T14:00', [A.calls.length, r.reader, F.insurance]);
}

/* ── H. walls ── */
{
  const login = net({ '/project/77': { status: 200, body: '<form><input type="password" name="pw"></form>', url: 'https://bids.example.com/login?next=/project/77' } });
  const r1 = await PR.read('https://bids.example.com/project/77', { fetch: login.f, pauseMs: 0, robots: () => '' });
  ok('H1 a page that sends us to a sign-in → login: true, nothing read, what to do instead', r1.login && /sign-in/.test(r1.why) && /Forward the invitation/.test(r1.todo) && !Object.keys(r1.fields).length, r1);
  const cap = net({ '/p/1': '<html><body>Please verify you are human — captcha</body></html>' });
  const cap2 = { f: async (u) => /robots/.test(u) ? resp(404, Buffer.from(''), 'text/plain', u) : resp(200, Buffer.from('<html><title>Attention Required</title><div class="cf-challenge">captcha</div></html>'), 'text/html', u) };
  const r2 = await PR.read('https://bids.example.com/p/1', { fetch: cap2.f, pauseMs: 0 });
  ok('H2 a captcha page → not read (the CRM does not get past it)', /human/.test(r2.why) && !Object.keys(r2.fields).length, r2.why);
  const f403 = { f: async (u) => /robots/.test(u) ? resp(404, Buffer.from(''), 'text/plain', u) : resp(403, Buffer.from('no'), 'text/html', u) };
  const r3 = await PR.read('https://bids.example.com/p/2', { fetch: f403.f, pauseMs: 0 });
  ok('H3 a 403 → "needs a sign-in or does not allow automated reading"', /403/.test(r3.why), r3.why);
  const dis = net({ '/details/jackson': 'mr_11447_details.html' }, { robots: () => 'User-agent: *\nDisallow: /projects/' });
  const r4 = await PR.read(JSU_URL, { fetch: dis.f, pauseMs: 0 });
  ok('H4 robots.txt Disallow → the page is not fetched at all', /robots\.txt/.test(r4.why) && dis.calls.length === 1, dis.calls.map(c => c.u));
  const big = net(Object.assign({}, JSU, { '/preview/document/11447/568508': { status: 200, body: '%PDF', type: 'application/pdf', len: 30 * 1024 * 1024 } }));
  const r5 = await PR.read(JSU_URL, { fetch: big.f, pauseMs: 0, now: REF });
  ok('H5 a reference file over 8 MB → listed with "open it from the link", not downloaded', r5.docs[0].read === false && /over 8 MB/.test(r5.docs[0].why), r5.docs[0]);
  const bc = net({});
  const r6 = await PR.read('https://app.buildingconnected.com/projects/123abc/bid-packages', { fetch: bc.f, pauseMs: 0 });
  ok('H6 a BuildingConnected link → not fetched at all (0 requests), sign-in, forward the invitation / paste the PDF', bc.calls.length === 0 && r6.login && /BuildingConnected/.test(r6.why) && /bids@grayco-cs\.com/.test(r6.todo), [bc.calls.length, r6.why]);
}

/* ── I. pasted ── */
{
  const A = fakeAi({ insurance: ['Commercial general liability $1M / $2M aggregate'], quotes: [] });
  const r = await PR.readPasted({ file: { name: 'Invitation to Bid.pdf', data: ITB.toString('base64') }, url: JSU_URL }, { ai: A, now: REF });
  ok('I1 a pasted invitation PDF: read (plain), and the AI read is allowed for staff\'s own copy', r.fields.preBid.date === '2026-11-30' && r.fields.bidDue === '2026-12-16' && A.calls.length === 1 && r.reader === 'ai' && /general liability/i.test(r.fields.insurance[0]) && r.docs[0].read, [r.fields.preBid, A.calls.length, r.reader]);
  const r2 = await PR.readPasted({ text: 'Pre-bid meeting (MANDATORY): Tuesday, December 1, 2026 at 9:00 a.m. at the job site. Questions must be submitted in writing no later than December 4, 2026 at 5:00 p.m. Certified payroll required. Bids due December 10, 2026 at 2:00 PM.' }, { noAi: true, now: REF });
  ok('I2 pasted text: mandatory pre-bid, questions due Dec 4 5:00 PM, certified payroll, bid due Dec 10 2:00 PM', r2.fields.preBid.mandatory === true && r2.fields.preBid.date === '2026-12-01' && r2.fields.questionsDue === '2026-12-04T17:00' && r2.fields.certifiedPayroll.length === 1 && r2.fields.bidDue === '2026-12-10T14:00' && r2.checklist.some(x => x.kind === 'prebid') && r2.checklist.some(x => x.kind === 'payroll'), r2.fields);
}

/* ── J. storing ── */
{
  const it = { id: 'LI-1', title: 'Jackson State', bidDue: '', preBid: '', trades: [] };
  const ch = PR.applyToItem(it, JPR);
  ok('J1 the item: pre-bid 2026-11-30T10:30 + place, bid due 2026-12-16, owner, trades (blanks only)', it.preBid === '2026-11-30T10:30' && /Conference Room 113/.test(it.preBidLocation) && it.bidDue === '2026-12-16' && /State of Tennessee/.test(it.owner) && it.trades.length > 5 && ch.includes('preBid') && ch.includes('bidDue'), [it, ch]);
  const typed = { id: 'LI-2', bidDue: '2026-12-15T11:00', preBid: '2026-11-29T09:00', bidDueManual: true };
  PR.applyToItem(typed, JPR);
  ok('J2 a date a person typed stays (bid due, pre-bid)', typed.bidDue === '2026-12-15T11:00' && typed.preBid === '2026-11-29T09:00', typed);
  const later = JSON.parse(JSON.stringify(JPR)); later.fields.preBid = Object.assign({}, later.fields.preBid, { date: '2026-12-01', time: '09:00' });
  PR.applyToItem(it, later);
  ok('J3 the plan room\'s own earlier date moves when the plan room changes it', it.preBid === '2026-12-01T09:00', it.preBid);
  it.planRoom.checklist[0].done = true; it.planRoom.checklist[0].doneBy = 'Glenn Sample';
  PR.applyToItem(it, JPR);
  ok('J4 a re-read keeps the ticked box', it.planRoom.checklist[0].done === true && it.planRoom.checklist[0].doneBy === 'Glenn Sample', it.planRoom.checklist);
  const job = { id: 'J1', title: 'Jackson State', status: 'open', visibility: 'private', requirements: {} };
  const r = PR.applyToJob(job, JPR, 'Glenn Sample');
  ok('J5 the bid job: site walk Nov 30 10:30 at the conference room, our bid due Dec 16, requirements bond + licenses, a log line', job.siteWalk.date === '2026-11-30' && job.siteWalk.time === '10:30' && /Conference Room 113/.test(job.siteWalk.location) && job.siteWalk.mandatory === false && job.ourDue === '2026-12-16' && job.requirements.bond && job.requirements.licenses && /licensed/.test(job.requirements.licensesText) && r.walk && /Plan room read/.test(job.log[0].what) && job.planRoom.fields.projectName, [job, r]);
  ok('J6 never a sub notice: the job has no posts / messages from it', !job.posts && !job.notice);
  const job2 = { id: 'J2', siteWalk: { date: '2026-11-28', time: '08:00', location: 'Gate 3', mandatory: true }, questionsDue: '2026-12-02' };
  const r2 = PR.applyToJob(job2, JPR, 'x');
  ok('J7 a site walk / questions deadline a person set on the bid job stays', job2.siteWalk.date === '2026-11-28' && job2.questionsDue === '2026-12-02' && !r2.walk, job2);
  const e = PR.cleanEdit({ projectName: ' X ', bidDue: 'bad', preBid: { date: '2026-12-01', time: '25:99', mandatory: true }, insurance: 'GL $1M\n\nWC statutory', junk: 'nope' });
  ok('J8 a person\'s edit is cleaned (bad dates dropped, lists split, unknown fields ignored)', e.projectName === 'X' && e.bidDue === '' && e.preBid.date === '2026-12-01' && e.preBid.time === '' && e.preBid.mandatory === true && e.insurance.length === 2 && !('junk' in e), e);
  ok('J9 the automatic read only opens public plan rooms', PR.autoUrl({ plansLinks: [{ url: JSU_URL }] }) === JSU_URL && PR.autoUrl({ plansLinks: [{ url: 'https://app.buildingconnected.com/x' }] }) === '' && PR.autoUrl({ plansLinks: [{ url: 'https://www.cityofbartlett.org/bids.aspx?bidID=520' }] }) === '');
}

/* ── K. bid-inbox.js end to end ── */
{
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', ANTHROPIC_API_KEY: '', PLANS_FETCH: '0', BID_PORTAL_DRAFTS: '0', BID_ALERTS_OFF: '1', LEAD_HOLD: '0', URL: '', DEPLOY_PRIME_URL: '' });
  const BI = require(path.join(BUILD, 'netlify/functions/bid-inbox.js'));
  const T = { gc_lead_inbox_kv: {}, gc_kv: {} }, sent = [];
  const put = (tb, k, v) => { T[tb][k] = { key: k, value: v, updated_at: new Date(Date.now() + Math.random() * 1000).toISOString() }; };
  const N = net(JSU);
  globalThis.fetch = async (u, o) => {
    o = o || {}; const m = (o.method || 'GET').toUpperCase(); u = String(u);
    if (/api\.resend\.com|api\.twilio\.com|api\.anthropic\.com/.test(u)) { sent.push(u); return resp(500, Buffer.from('{}'), 'application/json', u); }
    const mm = /^https:\/\/sb\.test\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/.exec(u);
    if (mm) {
      const tb = mm[1], q = new URLSearchParams(mm[2] || ''); const js = v => resp(200, Buffer.from(JSON.stringify(v)), 'application/json', u);
      if (!T[tb]) return js([]);
      if (m === 'GET') { const k = q.get('key') || ''; if (/^eq\./.test(k)) { const r = T[tb][k.slice(3)]; return js(r ? [r] : []); } return js([]); }
      if (m === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => put(tb, x.key, x.value)); return resp(201, Buffer.from(''), 'application/json', u); }
      if (m === 'PATCH') { const k = (q.get('key') || '').slice(3), at = (q.get('updated_at') || '').slice(3); const r = T[tb][k]; if (!r || r.updated_at !== at) return js([]); const b = JSON.parse(o.body); put(tb, k, b.value); return js([T[tb][k]]); }
    }
    return N.f(u, o);
  };
  const kv = k => { const r = T.gc_lead_inbox_kv[k]; return r ? r.value : null; };
  BI._test.resetKvTable();
  /* the bid portal (sp_rows) — subportal.js's helpers, faked: getRow / upsertRows / rowFor / crmSiteWalkPush */
  const JOBS = { j_jsu: { id: 'j_jsu', title: 'Jackson State Community College - Student Center Updates', status: 'open', visibility: 'private', draft: false, crmProjectId: 'P_JSU', requirements: {} } }, pushes = [];
  BI._sp = { getRow: async (c, id) => JOBS[id] ? { data: JSON.parse(JSON.stringify(JOBS[id])) } : null, rowFor: (c, job) => ({ c, job }), upsertRows: async rows => { rows.forEach(r => { JOBS[r.job.id] = r.job; }); }, crmSiteWalkPush: async (jobId, by) => { pushes.push({ jobId, by, walk: JOBS[jobId].siteWalk }); return { ok: true }; } };
  BI._fetch = N.f; BI._ai = { ready: () => false, ask: async () => ({ ok: false }) };
  put('gc_lead_inbox_kv', 'gc_lead_inbox', [{ id: 'LI-jsu', status: 'new', rev: 1, title: 'Jackson State Community College - Student Center Updates', source: 'MR plan room', origin: 'watch', bidDue: '', plansLinks: [{ url: JSU_URL, label: 'Solicitation & documents (MR plan room)' }], portal: { jobId: 'j_jsu', state: 'private' } }]);
  BI._test.staffAuth = async () => ({ ok: true, email: 'gsample@grayco-cs.com', name: 'Glenn Sample', admin: false, role: 'staff' });
  const call = async (method, q, body) => { const r = await BI.handler({ httpMethod: method, queryStringParameters: Object.assign({ planroom: '1' }, q || {}), headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer x' }, body: body ? JSON.stringify(body) : '' }); return { code: r.statusCode, j: JSON.parse(r.body || '{}') }; };
  const a = await call('POST', {}, { op: 'read', id: 'LI-jsu' });
  const it = (kv('gc_lead_inbox') || [])[0];
  ok('K1 POST ?planroom=1 read (no background function here → inline): 200, the plan room details back', a.code === 200 && a.j.ok && a.j.planRoom && a.j.planRoom.fields.projectName === 'Jackson State Community College - Student Center Updates', [a.code, a.j.error]);
  ok('K2 the Lead Inbox item: planRoom stored, pre-bid 2026-11-30T10:30 + place, bid due 2026-12-16 (the CRM lead follows on its next import)', it.planRoom && it.preBid === '2026-11-30T10:30' && /Conference Room 113/.test(it.preBidLocation) && it.bidDue === '2026-12-16' && it.rev === 2, it);
  ok('K3 the bid job: planRoom, site walk, our bid due, requirements — and the BIDPO site-walk push to the CRM schedule (linked to P_JSU)', JOBS.j_jsu.planRoom && JOBS.j_jsu.siteWalk.date === '2026-11-30' && JOBS.j_jsu.ourDue === '2026-12-16' && JOBS.j_jsu.requirements.bond && pushes.length === 1 && pushes[0].jobId === 'j_jsu', [JOBS.j_jsu.siteWalk, pushes]);
  ok('K4 nothing went to anyone: no e-mail, text or AI call', sent.length === 0, sent);
  const g = await call('GET', { key: 'item:LI-jsu' });
  ok('K5 GET ?planroom=1&key=item:… → the last read (for the CRM to pick up a background read)', g.code === 200 && g.j.read && g.j.read.state === 'done' && g.j.read.planRoom.fields.bidDue === '2026-12-16', g.j);
  const s1 = await call('POST', {}, { op: 'save', id: 'LI-jsu', jobIds: ['j_jsu'], fields: { preBid: { date: '2026-12-01', time: '09:00', place: 'Student Center lobby', mandatory: true } }, checklist: [{ id: 'bond:x', kind: 'bond', label: 'Bid bond 5%', done: true, doneBy: 'Glenn Sample' }] });
  const it2 = (kv('gc_lead_inbox') || [])[0];
  ok('K6 ✏️ a person\'s edit: saved on the item (edited, by whom) and its pre-bid follows; the bid job\'s site walk the plan room set follows too; the ticked box is kept', s1.code === 200 && it2.planRoom.edited.preBid && it2.planRoom.editedBy === 'Glenn Sample' && it2.preBid === '2026-12-01T09:00' && it2.preBidMandatory === true && JOBS.j_jsu.siteWalk.date === '2026-12-01' && JOBS.j_jsu.siteWalk.mandatory === true && it2.planRoom.checklist[0].done && pushes.length === 2, [it2.preBid, JOBS.j_jsu.siteWalk, s1.j.error]);
  const a2 = await call('POST', {}, { op: 'read', id: 'LI-jsu' });
  const it3 = (kv('gc_lead_inbox') || [])[0];
  ok('K7 a re-read keeps what the person typed in the card (the pre-bid) and the ticked box', a2.code === 200 && it3.planRoom.fields.preBid.date === '2026-12-01' && it3.planRoom.checklist.some(x => x.done), [it3.planRoom.fields.preBid, it3.planRoom.checklist]);
  const ck = await call('POST', {}, { op: 'check', url: 'https://app.planhub.com/project/9' });
  ok('K8 op check: a PlanHub link → sign-in only, with what to do (nothing fetched)', ck.j.kind === 'login' && !ck.j.public && /PlanHub/.test(ck.j.why), ck.j);
  const nolink = await call('POST', {}, { op: 'read', leadId: 'L_none' });
  ok('K9 a lead with no link → 400 "paste the project page link"', nolink.code === 400 && /link/.test(nolink.j.error), nolink);
  /* the automatic read: a new MR plan-room lead (yes), a BuildingConnected one (no), the hourly limit */
  process.env.PLANROOM_AUTO_HOURLY = '1';
  T.gc_lead_inbox_kv.gc_planroom_reads = undefined; delete T.gc_lead_inbox_kv.gc_planroom_reads;
  put('gc_lead_inbox_kv', 'gc_lead_inbox', [{ id: 'LI-a', status: 'new', rev: 1, title: 'A', plansLinks: [{ url: JSU_URL }] }, { id: 'LI-b', status: 'new', rev: 1, title: 'B', plansLinks: [{ url: 'https://app.buildingconnected.com/projects/1' }] }, { id: 'LI-c', status: 'new', rev: 1, title: 'C', plansLinks: [{ url: 'https://www.rkaplanroom.build/projects/11289/details/city-of-oxford-stone-center-pickle-ball' }] }]);
  const before = N.calls.length;
  const au = await BI._test.planRoomAuto((kv('gc_lead_inbox') || []));
  const L = kv('gc_lead_inbox');
  ok('K10 automatic: the MR lead is read; the BuildingConnected one is never opened; the hourly limit (1 here) holds the third', au.read === 1 && au.skipped === 1 && L[0].planRoom && !L[1].planRoom && !L[2].planRoom && !N.calls.slice(before).some(c => /buildingconnected|rkaplanroom/.test(c.u)), [au, N.calls.slice(before).map(c => c.u)]);
  delete process.env.PLANROOM_AUTO_HOURLY; process.env.PLANROOM_AUTO = '0';
  ok('K11 PLANROOM_AUTO=0 turns the automatic read off', (await BI._test.planRoomAuto(L)).off === true);
  delete process.env.PLANROOM_AUTO;
  let n = 0; for (let i = 0; i < 61; i++) if (await BI._test.prBudget('hand')) n++;
  ok('K12 by hand: at most 60 reads an hour (then "try again in a while")', n <= 60 && n >= 55, n);
  const lite = BI._lib.liteList(kv('gc_lead_inbox')).items[0];
  ok('K13 the CRM\'s small list carries planRoom and questionsDue', lite.planRoom && lite.planRoom.fields, Object.keys(lite));
  /* with the background function: the CRM's read answers 202 at once and the read runs there; the automatic read is handed over too */
  delete T.gc_lead_inbox_kv.gc_planroom_reads;
  Object.assign(process.env, { URL: 'https://crm.test', BID_INBOUND_SECRET: 'whsec_test' }); const handed = [];
  const gf = globalThis.fetch; globalThis.fetch = async (u, o) => { if (/bid-inbox-background/.test(String(u))) { handed.push(JSON.parse(o.body)); return resp(202, Buffer.from(''), 'text/plain', String(u)); } return gf(u, o); };
  const h1 = await call('POST', {}, { op: 'read', id: 'LI-a' });
  const h2 = await BI._test.planRoomAuto([{ id: 'LI-z', status: 'new', plansLinks: [{ url: JSU_URL }] }]);
  ok('K14 with the background function: POST read → 202 started (the CRM polls ?key=item:…), the automatic read handed over (planroom.read / planroom.auto)', h1.code === 202 && h1.j.started && h1.j.key === 'item:LI-a' && h2.handedOff === 1 && handed.some(x => x.type === 'planroom.read' && x.b.id === 'LI-a') && handed.some(x => x.type === 'planroom.auto' && x.ids[0] === 'LI-z'), [h1, h2, handed.map(x => x.type)]);
  const bg = await BI.backgroundHandler((() => { const raw = JSON.stringify({ type: 'planroom.read', b: { id: 'LI-a' }, by: 'Glenn Sample' }), ts = String(Date.now()); return { headers: { 'x-bid-ts': ts, 'x-bid-handoff': BI._test.handoffSig(ts, raw) }, body: raw }; })());
  const g2 = await call('GET', { key: 'item:LI-a' });
  ok('K15 … the background function does the read and the CRM\'s poll gets it', bg.statusCode === 200 && g2.j.read && g2.j.read.state === 'done' && g2.j.read.planRoom.fields.preBid.date === '2026-11-30', [bg.statusCode, g2.j.read && g2.j.read.state]);
  globalThis.fetch = gf; Object.assign(process.env, { URL: '', BID_INBOUND_SECRET: '' });
}

const pass = R.filter(Boolean).length; console.log('\n' + pass + ' / ' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
