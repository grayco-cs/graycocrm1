// test_SENTPDF.mjs — patch SENTPDF: PDFs GrayCo staff e-mail out are kept in the CRM (offline fakes only; made-up mail)
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const SP = require('../../netlify/functions/_lib/sent-pdf.js');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); } };
const KV = {};
const C = { kvListRead: async k => ({ list: (KV[k] || []).slice() }), kvListUpdate: async (k, f) => { const r = f((KV[k] || []).slice()); if (r) KV[k] = r.list; return { ok: true }; } };
const now = new Date().toISOString();
const rows = [
  { id: 'm1', dir: 'out', att: true, from: 'gmiller@grayco-cs.com', to: ['bids@stoagroup.example'], cc: [], subject: 'Proposal - Waters Jackson', at: now, labels: ['SENT'], pid: 'P1' },
  { id: 'm2', dir: 'out', att: true, from: 'gmiller@grayco-cs.com', to: ['nthomas@grayco-cs.com'], subject: 'internal', at: now, labels: ['SENT'] },
  { id: 'm3', dir: 'in', att: true, from: 'x@ext.example', to: ['gmiller@grayco-cs.com'], subject: 'plans', at: now },
  { id: 'm4', dir: 'out', att: false, from: 'gmiller@grayco-cs.com', to: ['a@ext.example'], subject: 'no file', at: now },
  { id: 'm5', dir: 'out', att: true, from: 'gmiller@grayco-cs.com', to: ['a@ext.example'], subject: 'draft', at: now, labels: ['DRAFT'] }];
const n = await SP.queue('gmiller@grayco-cs.com', rows, { core: C });
ok(n === 1 && KV[SP.QKEY][0].id === 'm1', 'only a SENT e-mail with an attachment to someone outside GrayCo is queued (not internal, incoming, no file, draft)', KV[SP.QKEY]);
ok(await SP.queue('gmiller@grayco-cs.com', rows, { core: C }) === 0, 'the same e-mail is never queued twice');
const pdf = Buffer.from('%PDF-1.4 demo'), stored = [];
const G = { configured: () => true };
const MB = { mailOf: async (g, box, id) => ({ subject: 'Proposal - Waters Jackson', date: now, messageId: '<x@y>', files: [{ name: 'GrayCo_Proposal_Framing.pdf', type: 'application/pdf', size: pdf.length, buf: pdf }, { name: 'logo.png', type: 'image/png', size: 3, buf: Buffer.from('png') }] }) };
const storeFile = async (buf, type, name) => { stored.push(name); return { ref: 'sb:crm-files/' + 'a'.repeat(64) + '.pdf', hash: 'a'.repeat(64), stored: true }; };
const out = await SP.drain({ gmail: G, core: C, moneyBox: MB, storeFile });
const L = KV[SP.LKEY] || [];
ok(out.saved === 1 && stored.length === 1 && stored[0] === 'GrayCo_Proposal_Framing.pdf', 'the PDF is stored (the picture is not)', { out, stored });
ok(L.length === 1 && L[0].pid === 'P1' && L[0].kind === 'proposal' && L[0].to[0] === 'bids@stoagroup.example' && L[0].by === 'gmiller@grayco-cs.com', 'recorded: who, to whom, the job it matched, a proposal', L[0]);
ok(KV[SP.QKEY][0].done === true, 'the queue item is done');
const out2 = await SP.drain({ gmail: G, core: C, moneyBox: MB, storeFile });
ok(out2.read === 0 && (KV[SP.LKEY] || []).length === 1, 'nothing read or kept twice');
console.log('SENTPDF: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
