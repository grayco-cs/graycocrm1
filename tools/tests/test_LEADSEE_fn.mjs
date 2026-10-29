// test_LEADSEE_fn.mjs <build-dir> — patch LEADSEE, server side (no browser, fake Supabase, made-up data):
//   ?leads=1 is the small list (open items only, newest first, trimmed); every inbox write leaves the tiny public marker
//   gc_kv "gc_lead_inbox_sig" {at, n, a} (counts + a time, no names / numbers); a text lead and a website lead both reach it.
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const DB = { gc_kv: new Map(), gc_lead_inbox_kv: new Map(), gc_staff: new Map() }; let tk = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 28, 12) + (++tk) * 1000).toISOString();
const resp = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => 'application/json' } });
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.BID_ALERTS_OFF = '1'; process.env.LEAD_INTAKE_ALERTS = '0';
global.fetch = async (url, init) => {
  init = init || {}; const u = String(url), M = (init.method || 'GET').toUpperCase();
  if (/\/auth\/v1\/user/.test(u)) return resp(200, { email: 'wjohnson@grayco-cs.com' });
  const m = /\/rest\/v1\/([a-z_]+)(\?(.*))?$/.exec(u); if (!m) return resp(404, {});
  const t = m[1], q = new URLSearchParams(m[3] || '');
  if (t === 'gc_staff') return resp(200, [{ email: 'wjohnson@grayco-cs.com', role: 'admin', active: true }]);
  const T = DB[t]; if (!T) return resp(200, []);
  const keyEq = (q.get('key') || '').replace(/^eq\./, '');
  if (M === 'GET') return resp(200, keyEq ? (T.has(keyEq) ? [T.get(keyEq)] : []) : [...T.values()].slice(0, 1));
  if (M === 'PATCH') { const at = (q.get('updated_at') || '').replace(/^eq\./, ''), cur = T.get(keyEq); if (!cur || cur.updated_at !== at) return resp(200, []); const b = JSON.parse(init.body); T.set(keyEq, { key: keyEq, value: b.value, updated_at: stamp() }); return resp(200, [T.get(keyEq)]); }
  if (M === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => T.set(r.key, { key: r.key, value: r.value, updated_at: stamp() })); return resp(201, []); }
  return resp(200, []);
};
const BI = require(path.join(build, 'netlify/functions/bid-inbox.js')), L = BI._lib;
ok(typeof L.liteList === 'function' && typeof L.leadSigOf === 'function' && L.KV_SIG === 'gc_lead_inbox_sig', 'bid-inbox exports the small list and the marker');
const WI = require(path.join(build, 'netlify/functions/website-intake.js'))._lib;
const f = { type: 'estimate', name: 'Demo Person', email: 'demo@example.com', phone: '9015550100', address: '12 Demo Ln', city: 'Bartlett', state: 'TN', zip: '38133', message: 'roof estimate please' };
const w = await WI.fileLead(f, { customer: null });
ok(w.action === 'added', 'a website "Free estimate" lead is filed in the Lead Inbox', w.action);
let sig = DB.gc_kv.get('gc_lead_inbox_sig');
ok(!!sig && sig.value.n === 1 && sig.value.a === 1 && !!sig.value.at, 'the marker gc_kv "gc_lead_inbox_sig" is written {at, n:1, a:1}', sig && sig.value);
ok(sig && !/Demo|555|example|Bartlett/.test(JSON.stringify(sig.value)), 'the marker carries no name, number, e-mail or address');
const t1 = await WI.fileLead({ type: 'estimate', name: '', phone: '9015550178', message: 'water pouring through my ceiling' }, { customer: null, sid: 'txt-demo-1', source: 'Text message', formLabel: 'Text message', title: 'Text message — (901) 555-0178', leadExtra: { textMessage: true, smsFrom: '+19015550178' } });
sig = DB.gc_kv.get('gc_lead_inbox_sig');
ok(t1.action === 'added' && sig.value.n === 2, 'a text lead too: the marker now says 2 new', sig && sig.value);
const at1 = sig.updated_at;
await L.kvCas(L.KV, v => v);   /* the same list again */
ok(DB.gc_kv.get('gc_lead_inbox_sig').updated_at === at1, 'an unchanged inbox does not rewrite the marker');
/* a big inbox: 650 open + 2500 dismissed (stubs) */
const items = DB.gc_lead_inbox_kv.get('gc_lead_inbox').value;
for (let i = 0; i < 650; i++) items.push({ id: 'LI-bid' + i, status: i % 3 ? 'imported' : 'new', title: 'Demo bid ' + i, type: 'commercial', source: 'PlanHub', receivedAt: new Date(Date.now() - 3600e3 - (i % 90) * 864e5).toISOString(), rev: 1,
  notes: Array(20).fill('note text '.repeat(10)), emails: Array(30).fill({ id: 'e', subject: 'Invitation to bid', from: 'x@example.com', date: '2026-10-01', text: 'body '.repeat(200) }), files: Array(30).fill({ ref: 'sb:crm-files/x.pdf', name: 'plan.pdf', type: 'application/pdf', size: 1 }), watchKeys: Array(20).fill('k'), emailIds: Array(60).fill('id') });
for (let i = 0; i < 2500; i++) items.push({ id: 'LI-d' + i, status: 'dismissed', stub: true, title: 'old ' + i });
DB.gc_lead_inbox_kv.set('gc_lead_inbox', { key: 'gc_lead_inbox', value: items, updated_at: stamp() });
const ev = q => ({ httpMethod: 'GET', queryStringParameters: q, headers: { authorization: 'Bearer tok', origin: 'https://crm.grayco-cs.com' } });
const full = await BI.handler(ev({ list: '1' })), lite = await BI.handler(ev({ leads: '1' }));
const jl = JSON.parse(lite.body);
ok(lite.statusCode === 200 && jl.lite === true && Array.isArray(jl.items), '?leads=1 answers the small list', lite.statusCode);
ok(jl.items.length <= 400 && jl.items.every(x => x.status === 'new' || x.status === 'imported'), 'open items only, at most 400 (' + jl.items.length + ' of ' + jl.open + ' open)');
ok(jl.items.some(x => /Text message/.test(x.title)) && jl.items.some(x => x.websiteLead && /Demo Person/.test(JSON.stringify(x.contact))), 'the text lead and the website lead are both in it');
ok(jl.items[0] && jl.items.slice(0, 2).some(x => /Text message/.test(x.title)), 'newest first');
ok(lite.body.length < full.body.length / 4, 'much smaller than ?list=1: ' + Math.round(lite.body.length / 1024) + ' KB vs ' + Math.round(full.body.length / 1024) + ' KB');
ok(!/"watchKeys"|"emailIds"|"text":"body/.test(lite.body), 'no watch keys, e-mail ids or e-mail bodies in the small list');
const noAuth = await BI.handler({ httpMethod: 'GET', queryStringParameters: { leads: '1' }, headers: {} });
ok(noAuth.statusCode === 401, '?leads=1 needs a staff sign-in', noAuth.statusCode);
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
