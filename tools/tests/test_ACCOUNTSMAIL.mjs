// test_ACCOUNTSMAIL.mjs <build-dir> — patch ACCOUNTSMAIL: company service sign-ups say accounts@grayco-cs.com,
// replies@ stays the Reply-To. 1) static: the setup wording in index.html + docs, the functions' reply_to untouched;
// 2) browser (offline harness, made-up data): an open "Sign up for Twilio" owner to-do from before gets the new
// wording and a step already ticked stays ticked.
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_ACCOUNTSMAIL.mjs <repo dir>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(!/sign(ed)? up[^.<\n]{0,40}with (<b>)?replies@/i.test(html), 'index.html: no "sign up … with replies@" left');
ok((html.match(/Sign up at twilio\.com with accounts@grayco-cs\.com/g) || []).length === 2 && /twilio\.com → sign up with <b>accounts@grayco-cs\.com<\/b>/.test(html), 'Twilio steps, owner to-do and activation list say accounts@');
ok((html.match(/are signed up with accounts@grayco-cs\.com; replies@ is only the Reply-To/g) || []).length === 3, 'the three e-mail guides name accounts@ for company services and keep replies@ as the Reply-To');
ok(/Twilio, Netlify, Resend, Supabase, Google Cloud, Meta, CompanyCam/.test(html), 'the services are listed');
ok(/replies@ is the Reply-To of automatic e-mails/.test(html), 'replies@ is still described as the Reply-To');
const fnDir = path.join(build, 'netlify/functions'); let acc = 0, rep = 0;
(function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f)) { const t = fs.readFileSync(p, 'utf8'); acc += (t.match(/accounts@grayco-cs\.com/g) || []).length; rep += (t.match(/'replies@grayco-cs\.com'/g) || []).length; } } })(fnDir);
ok(acc === 0 && rep > 10, 'functions: reply_to still replies@ (' + rep + ' places), accounts@ not used as a reply-to', { acc, rep });
for (const f of ['docs/AUTOMATIONS-AUTO6.md', 'docs/EMAIL-CENTER.md']) ok(/accounts@grayco-cs\.com/.test(fs.readFileSync(path.join(build, f), 'utf8')), f + ' says accounts@');

const { computer, sleep, waitFor, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
resetCloud();
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Demo Partner', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true }, { id: 'u3', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Manager', active: true }]);
cset('projects', [{ id: 'P1', name: 'Demo Job', client: 'Sample Homeowner', status: 'Active', pm: 'Demo Owner' }]);
const old = { id: 'adm_seed_twilio_v1', label: 'Sign up for Twilio (texting)', kind: 'admin_seed', seedV: 3, done: false, addedAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z',
  assignees: ['wjohnson@grayco-cs.com'], items: [{ id: 'adm_seed_twilio_v1_0', label: 'Sign up at twilio.com with replies@grayco-cs.com', done: true }, { id: 'adm_seed_twilio_v1_1', label: 'Upgrade the account to paid', done: false }] };
cset('gc_office_tasks', [old]);
const c = await computer('AM', { build });
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 9000);
  const t = await waitFor(c, () => { let l = []; try { l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); } catch (e) {} const x = l.find(y => y && y.id === 'adm_seed_twilio_v1'); return x && x.seedV >= 4 ? x : null; }, null, 60000, 500);
  ok(t && t.items[0].label === 'Sign up at twilio.com with accounts@grayco-cs.com', 'the open owner to-do now says accounts@', t && t.items[0]);
  ok(t && t.items[0].done === true, 'the step that was ticked stays ticked', t && t.items[0]);
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
