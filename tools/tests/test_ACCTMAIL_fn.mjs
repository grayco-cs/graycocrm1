// test_ACCTMAIL_fn.mjs — patch ACCTMAIL (owner 11/23: "I signed up for leads@ email, does that go to office when people send confirmation
// emails etc" — "on a2h planroom"). A plan room / bid site's account e-mail to leads@ (confirm your e-mail, verification code, password
// reset) used to be read as "not a bid" and dropped. Now it is kept under Lead Inbox → Messages and put on the office To-Do with its
// confirm link. A real invitation to bid still takes the bid path. Made-up data only (invmail_world: fetch is mocked, nothing leaves).
// patch ACCTMAIL2 (owner 11/23: "I NEED LEADS@ EMAIL FOR EVERYTHING THAT'S NOT A new lead to go into the office email … I don't want those
// bid invites to clog up the office email"): the missed phrasings ("Activate your Central Bidding account", "Confirm your PlanHub account",
// a generic "Action required" subject with the confirm in the body), the ORIGINAL e-mail forwarded to the office (link intact, Reply-To the
// sender, "[leads@] " subject), 🔔 For you; a bid invite / spam / an auto-reply / our own mail never forwarded; no loop; once per e-mail.
import { W, kv, resend, deliver, put } from './invmail_world.mjs';
let pass = 0, fail = 0;
const ok = (c, m, i) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); } };
const tasks = () => kv('gc_office_tasks') || [];
const notes = () => (kv('gc_lead_inbox_notices', 'gc_lead_inbox_kv') || kv('gc_lead_inbox_notices') || []);
/* the outgoing e-mails (Resend POST /emails) are caught here — nothing leaves */
const SENT = []; const inner = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (/^https:\/\/api\.resend\.com\/emails$/.test(String(u)) && o && /POST/i.test(o.method || '')) { SENT.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ id: 'sent' + SENT.length }), text: async () => '{}', headers: { get: () => null } }; } return inner(u, o); };
const OFFICE = ['office', 'grayco-cs.com'].join('@');
const fwds = () => SENT.filter(m => m.headers && m.headers['X-GrayCo-CRM'] === 'leads-forward');
const L = { envelope: ['leads@in.grayco-cs.com'], toHdr: ['leads@grayco-cs.com'] };

let r = await deliver(resend(Object.assign({ from: 'A2H Plan Room <noreply@a2hplanroom.test>', mid: '<acct1@a2h.test>',
  subject: 'Please confirm your email address', text: 'Thanks for registering with the A2H Plan Room.\nConfirm your account: https://www.a2hplanroom.test/account/confirm?token=abc123\n\nUnsubscribe: https://www.a2hplanroom.test/unsubscribe' }, L)));
const t = tasks().find(x => /^acctmail_/.test(x.id));
ok(r.status === 200 && r.body && r.body.account === true, '1 the confirm e-mail is taken as an account e-mail (not dropped as "not a bid")', r.body);
ok(t && /Account e-mail to leads@/.test(t.label) && /confirm your email address/i.test(t.label) && /finish the sign-up/.test(t.label), '2 it is on the office To-Do with the subject, saying what to do', t);
ok(t && /https:\/\/www\.a2hplanroom\.test\/account\/confirm\?token=abc123/.test(t.note) && /office e-mail/.test(t.note), '3 the To-Do carries the confirm link and says it is in the office e-mail', t && t.note);
ok(notes().some(n => /confirm your email/i.test(n.subject)), '4 kept under Lead Inbox → Messages', notes());
ok(!(kv('gc_lead_inbox', 'gc_lead_inbox_kv') || kv('gc_lead_inbox') || []).length, '5 never a lead');
let f = fwds();
ok(f.length === 1 && f[0].to.length === 1 && f[0].to[0] === OFFICE, '6 the A2H confirmation is forwarded to the office — and to nobody else', SENT.map(m => m.to));
ok(f[0] && f[0].subject === '[leads@] Please confirm your email address' && f[0].reply_to === 'noreply@a2hplanroom.test', '6b "[leads@] " + its own subject, Reply-To the sender', f[0] && [f[0].subject, f[0].reply_to]);
ok(f[0] && /https:\/\/www\.a2hplanroom\.test\/account\/confirm\?token=abc123/.test(f[0].html) && /token=abc123/.test(f[0].text), '6c the forward carries the confirm link (clickable)', f[0] && f[0].html);
const fy = (kv('gc_job_messages') || []).find(m => /^M_ACCT_/.test(m.id));
ok(fy && fy.notify.some(x => x.e === 'wjohnson@grayco-cs.com') && fy.notify.some(x => x.e === OFFICE) && /a2hplanroom\.test\/account\/confirm/.test(fy.text), '6d 🔔 For you: the owners and the office are named, with the link', fy);

r = await deliver(resend(Object.assign({ from: 'Central Bidding <support@centralbidding.test>', mid: '<acct2@cb.test>',
  subject: 'Your verification code', text: 'Your verification code is 482913. It expires in 10 minutes.' }, L)));
ok(r.body && r.body.account === true && tasks().filter(x => /^acctmail_/.test(x.id)).length === 2 && tasks().some(x => /482913/.test(x.note)), '7 a code e-mail: on the To-Do with the code', tasks());

let before = tasks().length, sent0 = fwds().length;
r = await deliver(resend(Object.assign({ from: 'Ridge GC <estimating@ridgegc.test>', mid: '<bid1@ridge.test>',
  subject: 'Invitation to Bid: Oakview Elementary Reroof', text: 'You are invited to bid the Oakview Elementary Reroof. Bids due 12/01/2026 2:00 PM. Plans: https://plans.ridgegc.test/project/77' }, L)));
ok(!(r.body && r.body.account) && tasks().length === before, '8 a real invitation to bid is not taken as an account e-mail', r.body);
ok(fwds().length === sent0, '8b a bid invite is NOT forwarded to the office (CRM only)', fwds().slice(sent0).map(m => m.subject));

r = await deliver(resend(Object.assign({ from: 'Ridge GC <estimating@ridgegc.test>', mid: '<bid2@ridge.test>',
  subject: 'Please confirm your attendance — pre-bid meeting Oakview', text: 'Pre-bid meeting Tuesday 9 AM at the site.' }, L)));
ok(!(r.body && r.body.account), '9 "confirm your attendance" at a pre-bid is not an account e-mail', r.body);

/* ACCTMAIL2: the phrasings ACCT_NOT ("bid" in the subject) used to drop, and a generic subject read in the body */
const missed = [
  ['Central Bidding <noreply@centralbidding.test>', 'Activate your Central Bidding account', 'Click to activate: https://www.centralbidding.test/activate?k=9'],
  ['PlanHub <hello@planhub.test>', 'Confirm your PlanHub account', 'Confirm here https://app.planhub.test/confirm/77'],
  ['BidNet Direct <support@bidnetdirect.test>', 'Welcome to BidNet Direct — confirm your registration', 'Finish: https://www.bidnetdirect.test/register/confirm?x=1'],
  ['iSqFt <no-reply@isqft.test>', 'Action required', 'Please verify your email address to finish setting up your account: https://isqft.test/verify/abc'],
  ['Bid Clerk <team@bidclerk.test>', 'Welcome', 'Complete your registration: https://bidclerk.test/complete?t=5'],
  ['Dodge <noreply@dodge.test>', 'Your one-time code', 'Your one-time code is 771202.'],
  ['QuestCDN <noreply@questcdn.test>', 'Complete registration for QuestCDN', 'Complete registration https://questcdn.test/r/1']
];
for (let i = 0; i < missed.length; i++) {
  const [from, subject, text] = missed[i]; const n0 = fwds().length;
  r = await deliver(resend(Object.assign({ from, mid: '<miss' + i + '@test>', subject, text }, L)));
  ok(r.body && r.body.account === true && fwds().length === n0 + 1 && fwds()[n0].subject === '[leads@] ' + subject, '10.' + (i + 1) + ' "' + subject + '" → an account e-mail, forwarded to the office', r.body);
}
for (const [subject, text] of [['Bid Invite: Hwy 64 Fire Station', 'You are invited to bid. Bids due 12/4.'], ['Addendum 2 — Oakview', 'Addendum 2 is posted.'], ['Action required', 'You have been invited to bid on Oakview Elementary. Bids are due 12/1. Confirm your account to view plans.']]) {
  r = await deliver(resend(Object.assign({ from: 'Ridge GC <estimating@ridgegc.test>', mid: '<n-' + subject.length + text.length + '@ridge.test>', subject, text }, L)));
  ok(!(r.body && r.body.account), '11 "' + subject + '" (an invitation / addendum) is not an account e-mail', r.body);
}

/* anything the CRM drops as "not a lead" / "not a bid" goes to the office too — a newsletter, a vendor */
sent0 = fwds().length;
r = await deliver(resend(Object.assign({ from: 'Supply Weekly <news@supplyweekly.test>', mid: '<nl1@sw.test>', subject: 'November lumber price update', text: 'Lumber prices fell 4% this month. Read more: https://supplyweekly.test/nov' }, L)));
ok(fwds().length === sent0 + 1 && fwds()[sent0].subject === '[leads@] November lumber price update' && /supplyweekly\.test\/nov/.test(fwds()[sent0].html), '12 a "not a lead" newsletter is forwarded to the office', [r.body, fwds().slice(sent0).map(m => m.subject)]);
r = await deliver(resend(Object.assign({ from: 'County Purchasing <notifications@county.test>', mid: '<vend1@county.test>', subject: 'Vendor registration renewal reminder', text: 'Your vendor registration renews on 12/31. Log in to update your W-9.' }, L)));
ok(fwds().length === sent0 + 2 && fwds()[sent0 + 1].subject === '[leads@] Vendor registration renewal reminder', '13 a vendor-registration mail to leads@ is forwarded', [r.body, fwds().slice(sent0).map(m => m.subject)]);
r = await deliver(resend({ from: 'Some Sub <est@somesub.test>', envelope: ['bids@in.grayco-cs.com'], toHdr: ['bids@grayco-cs.com'], mid: '<uns1@sub.test>', subject: 'Following up', text: 'Did you get our numbers for the clinic job?' }));
ok(r.body && r.body.unsorted && fwds().length === sent0 + 3 && fwds()[sent0 + 2].subject === '[bids@] Following up', '13b BIDSFWD (owner 11/25): bids@ mail the CRM cannot sort stays as 📥 unsorted AND goes to the office', [r.body, fwds().slice(sent0).map(m => m.subject)]);
r = await deliver(resend({ from: 'Some Sub <est@somesub.test>', envelope: ['bids@in.grayco-cs.com'], toHdr: ['bids@grayco-cs.com'], mid: '<uns1@sub.test>', subject: 'Following up', text: 'Did you get our numbers for the clinic job?' }));
ok(fwds().length === sent0 + 3, '13c … the same e-mail again is not forwarded twice', fwds().slice(sent0).map(m => m.subject));
r = await deliver(resend({ from: 'County Purchasing <vendors@county.test>', envelope: ['bids@in.grayco-cs.com'], toHdr: ['bids@grayco-cs.com'], mid: '<acct10@county.test>', subject: 'Verify your email for the County vendor portal', text: 'Verify: https://county.test/verify?v=2' }));
ok(r.body && r.body.account && fwds().length === sent0 + 4 && fwds()[sent0 + 3].subject === '[bids@] Verify your email for the County vendor portal', '13d an account e-mail to bids@ is forwarded ("[bids@] ")', [r.body, fwds().slice(sent0).map(m => m.subject)]);

/* never: spam / a pitch, an auto-reply, a bounce, our own mail; once per e-mail; no loop */
sent0 = fwds().length;
r = await deliver(resend(Object.assign({ from: 'Growth Agency <sales@seoboost.test>', mid: '<spam1@seo.test>', subject: 'Get more roofing leads — SEO and Google ranking for contractors', text: 'We can get you to page one of Google. Book a quick call to grow your business with our marketing services. Limited time offer!' }, L)));
ok(fwds().length === sent0, '14 a sales pitch / spam goes nowhere', [r.body, fwds().slice(sent0).map(m => m.subject)]);
r = await deliver(resend(Object.assign({ from: 'Jo Vendor <jo@vendor.test>', mid: '<ooo1@v.test>', subject: 'Automatic reply: Lumber quote', text: 'I am out of the office.' }, L)));
ok(fwds().length === sent0, '15 an auto-reply is not forwarded', r.body);
r = await deliver(resend(Object.assign({ from: 'Mail Delivery <mailer-daemon@mx.test>', mid: '<bounce1@mx.test>', subject: 'Delivery Status Notification (Failure)', text: 'Your message could not be delivered.' }, L)));
ok(fwds().length === sent0, '16 a bounce is not forwarded', r.body);
r = await deliver(resend(Object.assign({ from: 'GrayCo leads@ <leads@grayco-cs.com>', mid: '<loop1@gc.test>', subject: '[leads@] Please confirm your email address', text: 'Confirm: https://www.a2hplanroom.test/account/confirm?token=abc123', headers: { 'X-GrayCo-CRM': 'leads-forward' } }, L)));
ok(fwds().length === sent0, '17 no loop: our own forward coming back is ignored', r.body);
r = await deliver(resend(Object.assign({ from: 'Brittany Demo <' + OFFICE + '>', mid: '<loop2@gc.test>', subject: 'Welcome to the team portal — confirm your account', text: 'confirm: https://x.test/confirm' }, L)));
ok(fwds().length === sent0, '18 no loop: mail from the office / our own domain is never forwarded', r.body);
r = await deliver(resend(Object.assign({ from: 'A2H Plan Room <noreply@a2hplanroom.test>', mid: '<acct1@a2h.test>',
  subject: 'Please confirm your email address', text: 'Thanks for registering with the A2H Plan Room.\nConfirm your account: https://www.a2hplanroom.test/account/confirm?token=abc123' }, L)));
ok(fwds().length === sent0, '19 the same e-mail again (a webhook retry) is forwarded once', r.body);

/* data-entry mode (⏸) does not hold it: a staff-only e-mail */
put('gc_kv', 'gc_automation_pause', JSON.stringify({ on: true, by: 'test', at: new Date().toISOString() }));
try { (await import('module')).createRequire(import.meta.url)('../../netlify/functions/_lib/pause.js').reset(); } catch (e) {}
r = await deliver(resend(Object.assign({ from: 'ConstructConnect <noreply@constructconnect.test>', mid: '<acct9@cc.test>', subject: 'Reset your password', text: 'Reset it here: https://constructconnect.test/reset?t=1' }, L)));
ok(fwds().length === sent0 + 1 && fwds()[sent0].to[0] === OFFICE, '20 data-entry mode on: the account e-mail still reaches the office (staff mail)', [r.body, fwds().slice(sent0).map(m => m.subject)]);
ok(SENT.every(m => (Array.isArray(m.to) ? m.to : [m.to]).every(a => /@grayco-cs\.com$/.test(a))), '21 every e-mail sent went to GrayCo only', SENT.map(m => m.to));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
