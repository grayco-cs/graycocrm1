// test_ACCTMAIL_fn.mjs — patch ACCTMAIL (owner 11/23: "I signed up for leads@ email, does that go to office when people send confirmation
// emails etc" — "on a2h planroom"). A plan room / bid site's account e-mail to leads@ (confirm your e-mail, verification code, password
// reset) used to be read as "not a bid" and dropped. Now it is kept under Lead Inbox → Messages and put on the office To-Do with its
// confirm link. A real invitation to bid still takes the bid path. Made-up data only (invmail_world: fetch is mocked, nothing leaves).
import { W, kv, resend, deliver } from './invmail_world.mjs';
let pass = 0, fail = 0;
const ok = (c, m, i) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); } };
const tasks = () => kv('gc_office_tasks') || [];
const notes = () => (kv('gc_lead_inbox_notices', 'gc_lead_inbox_kv') || kv('gc_lead_inbox_notices') || []);

let r = await deliver(resend({ from: 'A2H Plan Room <noreply@a2hplanroom.test>', envelope: ['leads@in.grayco-cs.com'], toHdr: ['leads@grayco-cs.com'], mid: '<acct1@a2h.test>',
  subject: 'Please confirm your email address', text: 'Thanks for registering with the A2H Plan Room.\nConfirm your account: https://www.a2hplanroom.test/account/confirm?token=abc123\n\nUnsubscribe: https://www.a2hplanroom.test/unsubscribe' }));
const t = tasks().find(x => /^acctmail_/.test(x.id));
ok(r.status === 200 && r.body && r.body.account === true, '1 the confirm e-mail is taken as an account e-mail (not dropped as "not a bid")', r.body);
ok(t && /Account e-mail to leads@/.test(t.label) && /confirm your email address/i.test(t.label), '2 it is on the office To-Do with the subject', t);
ok(t && /https:\/\/www\.a2hplanroom\.test\/account\/confirm\?token=abc123/.test(t.note) && !/unsubscribe/.test(t.note.split('\n\n')[0]), '3 the To-Do carries the confirm link (not the unsubscribe link)', t && t.note);
ok(notes().some(n => /confirm your email/i.test(n.subject)), '4 kept under Lead Inbox → Messages', notes());
ok(!(kv('gc_lead_inbox', 'gc_lead_inbox_kv') || kv('gc_lead_inbox') || []).length, '5 never a lead');
ok(!W.calls.some(c => /api\.resend\.com\/emails$/.test(c) && /^POST/.test(c)), '6 nothing is sent to anyone');

r = await deliver(resend({ from: 'Central Bidding <support@centralbidding.test>', envelope: ['leads@in.grayco-cs.com'], toHdr: ['leads@grayco-cs.com'], mid: '<acct2@cb.test>',
  subject: 'Your verification code', text: 'Your verification code is 482913. It expires in 10 minutes.' }));
ok(r.body && r.body.account === true && tasks().filter(x => /^acctmail_/.test(x.id)).length === 2 && tasks().some(x => /482913/.test(x.note)), '7 a code e-mail: on the To-Do with the code', tasks());

const before = tasks().length;
r = await deliver(resend({ from: 'Ridge GC <estimating@ridgegc.test>', envelope: ['leads@in.grayco-cs.com'], toHdr: ['leads@grayco-cs.com'], mid: '<bid1@ridge.test>',
  subject: 'Invitation to Bid: Oakview Elementary Reroof', text: 'You are invited to bid the Oakview Elementary Reroof. Bids due 12/01/2026 2:00 PM. Plans: https://plans.ridgegc.test/project/77' }));
ok(!(r.body && r.body.account) && tasks().length === before, '8 a real invitation to bid is not taken as an account e-mail', r.body);

r = await deliver(resend({ from: 'Ridge GC <estimating@ridgegc.test>', envelope: ['leads@in.grayco-cs.com'], toHdr: ['leads@grayco-cs.com'], mid: '<bid2@ridge.test>',
  subject: 'Please confirm your attendance — pre-bid meeting Oakview', text: 'Pre-bid meeting Tuesday 9 AM at the site.' }));
ok(!(r.body && r.body.account), '9 "confirm your attendance" at a pre-bid is not an account e-mail', r.body);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
