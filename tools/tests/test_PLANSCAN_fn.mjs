// test_PLANSCAN_fn.mjs <build-dir> — patch PLANSCAN, node only (owner 11/23: "make sure a2h planroom is on scan, wtplanroom
// centralbidding.com ionwave"). A saved, trimmed copy of the A2H plan room's public list (tools/tests/fixtures/planscan — the
// card layout of www.a2hplanroom.com/projects/public on 11/23; every project name, number, place and text MADE UP) served by a
// fake fetch. Nothing reaches the network.
//   A. the sources: A2H read here (ReproConnect → parseRka, no AI, range-limited, the designer neither owner nor GC);
//      West Tennessee Plan Room, Central Bidding and Ion Wave e-mail alerts to leads@ with the steps
//   B. robots.txt: A2H allows /projects/public; Ion Wave disallows everything
//   C. the A2H card reader: open bids read (name, bid date, place, link), "Bidding Closed" skipped
//   D. the lead record: owner / GC blank, "Designer: A2H, Inc." in the notes, the plan-room link; the badge is PRIME
//   E. their e-mails are bid invitations (bid-inbox boardOf, subbids isBidInvite, bid-role); plan room reader knows A2H
//   F. one watcher run (runAll, only A2H, in-memory database): robots asked first, our user agent, one page, 2 leads stored
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.');
const FX = path.join(BUILD, 'tools/tests/fixtures/planscan');
const fx = n => fs.readFileSync(path.join(FX, n), 'utf8');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', ANTHROPIC_API_KEY: '', PLANS_FETCH: '0', BID_PORTAL_DRAFTS: '0', BID_ALERTS_OFF: '1', LEAD_HOLD: '0', PLANROOM_AUTO: '0', URL: '', DEPLOY_PRIME_URL: '' });
const BW = require(path.join(BUILD, 'netlify/functions/bid-watch.js'));
const BI = require(path.join(BUILD, 'netlify/functions/bid-inbox.js'));
const SB = require(path.join(BUILD, 'netlify/functions/_lib/subbids.js'));
const ROLE = require(path.join(BUILD, 'netlify/functions/_lib/bid-role.js'));
const PR = require(path.join(BUILD, 'netlify/functions/_lib/planroom.js'));
const T = BW._test;
const A2H_URL = 'https://www.a2hplanroom.com/projects/public';

/* ── A. the sources ── */
const byId = id => BW.SOURCES.find(x => x.id === id) || {};
{
  const a = byId('a2h-planroom');
  ok('A1 A2H plan room is read here: auto, the ReproConnect reader (kind rka), its public list', a.auto === true && a.kind === 'rka' && a.url === A2H_URL, a);
  ok('A2 A2H: no AI (Content-Signal ai-input=no), range-limited (radius), public work (type government), the card\'s company is the designer', a.noAi === true && a.radius === true && a.type === 'government' && a.companyIs === 'designer' && a.label === 'A2H plan room', a);
  const mail = ['wt-planroom', 'central-bidding', 'mscs-ionwave'].map(byId);
  ok('A3 West Tennessee Plan Room, Central Bidding, Ion Wave: e-mail alerts (never read here), each with its steps and leads@', mail.every(x => x.id && x.auto === false && /leads@grayco-cs\.com/.test(x.how) && x.how.length > 60), mail.map(x => [x.id, x.auto]));
  ok('A4 the reasons are said: members only / sign-in / robots.txt', /password protected|members only/i.test(byId('wt-planroom').how) && /sign-in/i.test(byId('central-bidding').how) && /robots/i.test(byId('mscs-ionwave').how));
  ok('A5 no source reads a page behind a sign-in: none of the e-mail-alert sites is auto', BW.SOURCES.filter(x => x.auto && /wtplanroom|centralbidding|centralauctionhouse|ionwave/.test(x.url || '')).length === 0);
  ok('A6 the older Central Bidding entries no longer call the account free', ['southaven', 'olive-branch', 'desoto-central'].every(id => byId(id).auto === false && !/free/i.test(byId(id).how)));
  ok('A7 ids are unique', new Set(BW.SOURCES.map(x => x.id)).size === BW.SOURCES.length);
}

/* ── B. robots.txt ── */
{
  ok('B1 A2H robots.txt allows /projects/public for us', T.robotsAllows(fx('robots_a2h.txt'), '/projects/public') === true);
  ok('B2 … and keeps us out of /viewer/', T.robotsAllows(fx('robots_a2h.txt').replace(/User-agent: \*\nContent-Signal[^\n]*\n/, ''), '/viewer/123') === false);
  ok('B3 Ion Wave robots.txt disallows every page (why it is e-mail alerts only)', T.robotsAllows(fx('robots_ionwave.txt'), '/SourcingEvents.aspx?SourceType=1') === false);
}

/* ── C. the A2H cards ── */
const items = T.parseRka(fx('a2h_public.html'), A2H_URL);
{
  ok('C1 two open bids read, the closed one skipped', items.length === 2 && !items.some(i => /Placeholder Road Bridge/.test(i.title)), items.map(i => i.title));
  const a = items[0], b = items[1];
  ok('C2 card 1: name, bid date, place, link', a.id === 'rka90001' && a.title === '90001 - Town of Sampleton Fire Hall Roof Replacement' && a.due === '2026-12-09' && a.city === 'Sampleton' && a.state === 'TN'
    && a.url === 'https://www.a2hplanroom.com/projects/90001/details/town-of-sampleton-fire-hall-roof-replacement' && /low-slope roof/.test(a.context) && a.gc === 'A2H, Inc.', a);
  ok('C3 card 2: a 2027 date and a Mississippi place', b.due === '2027-01-14' && b.city === 'Mockville' && b.state === 'MS', b);
}

/* ── D. the lead record ── */
const src = byId('a2h-planroom');
const rec = T.toRecord(src, items[0], ['roof']);
{
  ok('D1 owner and GC left blank (A2H is the designer), city / state from the card', rec.owner === '' && rec.gc === '' && rec.city === 'Sampleton' && rec.state === 'TN' && rec.type === 'government', rec);
  ok('D2 "Designer: A2H, Inc." in the notes; the plan-room link; source A2H plan room', rec.notes.some(n => n === 'Designer: A2H, Inc.') && rec.plansLinks[0].url === items[0].url && rec.source === 'A2H plan room' && rec.bidDue === '2026-12-09', rec.notes);
  const r = ROLE.roleOf(rec);
  ok('D3 bid-role: an A2H plan-room lead is a PRIME bid (not "sub" for the words "plan room")', r.role === 'prime' && /A2H/.test(r.why), r);
  ok('D4 MR / Barge / RKA records unchanged: MR\'s company still goes in owner', T.toRecord(byId('mr-planroom'), Object.assign({}, items[0], { gc: 'Memphis Housing Authority' }), ['roof']).owner === 'Memphis Housing Authority'
    && T.toRecord(byId('rka-planroom'), Object.assign({}, items[0], { gc: 'Sample Builders LLC' }), ['roof']).gc === 'Sample Builders LLC');
}

/* ── E. e-mails from these sites ── */
{
  const bo = BI._lib.boardOf;
  ok('E1 boardOf: A2H / WT plan rooms named, Central Bidding\'s list host and Ion Wave are Government', bo('www.a2hplanroom.com') === 'A2H plan room' && bo('wtplanroom.com') === 'WT plan room' && bo('centralauctionhouse.com') === 'Government' && bo('mscsprocurementservices.ionwave.net') === 'Government' && bo('centralbidding.com') === 'Government');
  const m = (dom, subj) => ({ from: { email: 'notices@' + dom, domain: dom }, subject: subj, text: 'Weekly list.' });
  ok('E2 subbids: mail from each of the four is a bid invitation', ['a2hplanroom.com', 'wtplanroom.com', 'centralauctionhouse.com', 'centralbidding.com', 'mscsprocurementservices.ionwave.net'].every(d => SB.isBidInvite(m(d, 'Weekly bulletin'), bo).bid && SB.isBidInvite(m(d, 'Weekly bulletin'), null).bid));
  ok('E3 bid-role by sender: WT plan room = sub (a plan room), Central Bidding = prime (a public agency\'s board)', ROLE.roleOf({ type: 'commercial', emails: [{ from: 'bulletin@wtplanroom.com' }] }).role === 'sub' && ROLE.roleOf({ type: 'commercial', emails: [{ from: 'noreply@centralauctionhouse.com' }] }).role === 'prime');
  ok('E4 bid-role: an A2H plan-room e-mail or link = prime', ROLE.roleOf({ type: 'commercial', emails: [{ from: 'planroom@a2hplanroom.com' }], fromEmail: 'planroom@a2hplanroom.com' }).role === 'prime' && ROLE.roleOf({ type: 'commercial', plansLinks: [{ url: items[0].url }] }).role === 'prime');
  const c = PR.classify(items[0].url);
  ok('E5 the plan room reader treats A2H as a public ReproConnect plan room (A2H plan room)', c.ok && c.kind === 'repro' && c.board === 'A2H plan room', c);
  ok('E6 the page\'s copy of bid-role.js (index.html) has the same PLANSCAN lines (A2H prime rule, WT plan room, Central Bidding\'s list host)', (() => {
    const h = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8'), lib = fs.readFileSync(path.join(BUILD, 'netlify/functions/_lib/bid-role.js'), 'utf8').split('\n');
    const lines = lib.filter(l => /a2hplanroom|wtplanroom|centralauctionhouse/.test(l)); return lines.length === 4 && lines.every(l => h.indexOf(l) >= 0); })());
}

/* ── F. one watcher run ── */
{
  const resp = (status, body, type, url, hdr) => ({ status, ok: status >= 200 && status < 300, url, headers: { get: k => (hdr || {})[k.toLowerCase()] || (k.toLowerCase() === 'content-type' ? type : null) }, text: async () => body, json: async () => JSON.parse(body) });
  const DB = { gc_lead_inbox_kv: {}, gc_kv: {} }, calls = [], sent = [];
  const put = (tb, k, v) => { DB[tb][k] = { key: k, value: v, updated_at: new Date(Date.now() + Math.random() * 1000).toISOString() }; };
  globalThis.fetch = async (u, o) => {
    o = o || {}; const m = (o.method || 'GET').toUpperCase(); u = String(u);
    const mm = /^https:\/\/sb\.test\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/.exec(u);
    if (mm) {
      const tb = mm[1], q = new URLSearchParams(mm[2] || ''); const js = v => resp(200, JSON.stringify(v), 'application/json', u);
      if (!DB[tb]) return js([]);
      if (m === 'GET') { const k = q.get('key') || ''; if (/^eq\./.test(k)) { const r = DB[tb][k.slice(3)]; return js(r ? [r] : []); } return js([]); }
      if (m === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => put(tb, x.key, x.value)); return resp(201, '', 'application/json', u); }
      if (m === 'PATCH') { const k = (q.get('key') || '').slice(3), at = (q.get('updated_at') || '').slice(3); const r = DB[tb][k]; if (!r || r.updated_at !== at) return js([]); put(tb, k, JSON.parse(o.body).value); return js([DB[tb][k]]); }
      return js([]);
    }
    calls.push({ u, ua: (o.headers || {})['User-Agent'] || '' });
    if (/resend|twilio|anthropic/.test(u)) { sent.push(u); return resp(500, '{}', 'application/json', u); }
    if (u === 'https://www.a2hplanroom.com/robots.txt') return resp(200, fx('robots_a2h.txt'), 'text/plain', u);
    if (u === A2H_URL) return resp(200, fx('a2h_public.html'), 'text/html', u, { etag: '"fx-1"' });
    return resp(404, '', 'text/plain', u);
  };
  if (BI._test && BI._test.resetKvTable) BI._test.resetKvTable();
  put('gc_lead_inbox_kv', 'gc_lead_inbox_settings', { allBids: true });
  const out = await BW.runAll({ only: 'a2h-planroom', pauseMs: 0, noFlush: true, by: 'test', now: Date.parse('2026-11-23T12:00:00Z') });
  const site = calls.filter(c => /a2hplanroom/.test(c.u));
  ok('F1 robots.txt asked first, then ONE page, both with our own user agent', site.length === 2 && /robots\.txt$/.test(site[0].u) && site[1].u === A2H_URL && site.every(c => /^GrayCoBidWatch\//.test(c.ua)), site);
  const sum = (out.sources || []).find(x => x.id === 'a2h-planroom') || {};
  ok('F2 the run read 2 open bids from A2H', out.ok && sum.parsed === 2 && sum.http === 200, out);
  const inbox = (() => { for (const tb of ['gc_lead_inbox_kv', 'gc_kv']) { const r = DB[tb].gc_lead_inbox; if (r) return r.value; } return []; })();
  const mine = (inbox || []).filter(x => x.source === 'A2H plan room');
  ok('F3 both are in the lead inbox as A2H plan-room leads (owner / GC blank)', mine.length === 2 && mine.every(x => !x.owner && !x.gc), (inbox || []).map(x => [x.title, x.source]));
  ok('F4 nothing was sent to anyone (no e-mail, text or AI call)', sent.length === 0, sent);
  ok('F5 only A2H was fetched (no other site touched)', calls.every(c => /a2hplanroom\.com/.test(c.u) || /nominatim|census|geocod/.test(c.u)), calls.map(c => c.u));
}

const passed = R.filter(Boolean).length;
console.log('\n' + passed + ' / ' + R.length + ' passed');
process.exit(passed === R.length ? 0 : 1);
