// test_emailmap_fn.mjs — patch EMAILMAP on the server (offline, no secrets):
//   · the lien waiver request e-mail tells the sub where invoices go
//   · the sub portal e-mails (link, scope) say invoices@ in English and Spanish
//   · the Email Center default list has invoices@ and receipts@ and the owner's rules
//   · the welcome e-mail text in index.html carries the "How to reach us" block
// Usage: node tools/test_emailmap_fn.mjs [repoRoot]
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs'; import vm from 'vm';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
const SRC = path.join(ROOT, 'netlify/functions');
Object.assign(process.env, { RESEND_API_KEY: 're_test', SITE_ORIGIN: 'https://crm.grayco-cs.com' });
delete process.env.SUPABASE_SERVICE_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); } }
const lien = require(path.join(SRC, '_lib/lien.js'));
const html = lien.requestHtml({ sub: 'ABC Roofing', kind: 'progress', jobName: 'Smith Roof', jobAddress: '1 Main', amount: 1000, invNum: '7' }, 'https://crm.grayco-cs.com/lien?t=x');
ok(html.includes('invoices@grayco-cs.com') && html.includes('job name/PO'), 'lien waiver request e-mail says: send invoices to invoices@ (with job name/PO)');
ok(html.includes('Review and sign') && html.includes('901-585-0944'), 'the request still has its button and office line');
const src = fs.readFileSync(path.join(SRC, 'portal-access.js'), 'utf8');
const m = /const MAIL = (\{[\s\S]*?\n\});\nfunction mailHtml/.exec(src);
const MAIL = vm.runInNewContext('(' + m[1] + ')', { OFFICE_PHONE: '(901) 585-0944' });
ok(/invoices@grayco-cs\.com/.test(MAIL.en.linkBody) && /invoices@grayco-cs\.com/.test(MAIL.en.scopeBody), 'sub portal link and scope e-mails (EN) name invoices@');
ok(/invoices@grayco-cs\.com/.test(MAIL.es.linkBody) && /invoices@grayco-cs\.com/.test(MAIL.es.scopeBody), 'sub portal link and scope e-mails (ES) name invoices@');
const MC = require(path.join(SRC, '_lib/mailcenter.js'));
const by = {}; MC.DEFAULT_ALIASES.forEach(a => { by[a.address] = a; });
ok(by['invoices@grayco-cs.com'] && by['invoices@grayco-cs.com'].crm === true && by['receipts@grayco-cs.com'] && by['receipts@grayco-cs.com'].crm === true, 'Email Center lists invoices@ and receipts@ (copied to the CRM)');
ok(/bid invitation/.test(by['leads@grayco-cs.com'].note) && /own bids/.test(by['bids@grayco-cs.com'].note) && /Customer invoices/.test(by['billing@grayco-cs.com'].note), 'leads@ / bids@ / billing@ notes follow the owner rules');
const settings = MC.settings(null); ok(settings.aliases.some(a => a.address === 'invoices@grayco-cs.com'), 'settings() default includes invoices@');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const w = idx.slice(idx.indexOf('function welcomeHtml(p){'), idx.indexOf('function nextStepsHtml'));
ok(['How to reach us', '(901) 585-0944', '(901) 582-8255', 'billing@grayco-cs.com', 'claims@grayco-cs.com'].every(x => w.includes(x)), 'welcome e-mail carries the How to reach us block');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
