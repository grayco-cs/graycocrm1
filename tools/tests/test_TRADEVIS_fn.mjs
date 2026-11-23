// test_TRADEVIS_fn.mjs <build-dir> — patch TRADEVIS (owner 11/23: "On the sub and bid portal only show jobs that have their trade requested
// or their trade in it … If there is no electrical for a GC job then don't show to electrical companies etc. Anything they do on their
// profile show to them"). The REAL bid-site function on qaa_world's in-memory Supabase; made-up data only; nothing leaves the machine.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, TOK, ACC, putRow } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
W.install(); process.env.PORTAL_MAIL_OFF = '1';
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('gc_automation_pause', { on: false });
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
const sub = (id, email, company, trades) => { putRow('users', id, { id, role: 'sub', approved: true, email, name: company + ' Contact', company, trades, authUserId: 'auth-' + id }, { user_id: id, email }); TOK['tk-' + id] = email; ACC[email] = { pw: 'x', id: 'auth-' + id }; };
sub('u_el', 'el@sub.test', 'Volt Electric LLC', ['Electrical']);
sub('u_dw', 'dw@sub.test', 'Alpha Drywall', ['Drywall', 'Painting']);
sub('u_hv', 'hv@sub.test', 'Cool Air Co', ['HVAC']);
sub('u_none', 'none@sub.test', 'New Sub No Trades', []);
TOK['tk-owner'] = 'owner@grayco-cs.com'; ACC['owner@grayco-cs.com'] = { pw: 'x', id: 'auth-owner' };
const job = (id, x) => putRow('jobs', id, Object.assign({ id, title: id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), grayCoRole: 'gc', createdAt: now }, x), { job_id: id });
job('J_GC_ALL', { tradesSought: 'Electrical, Drywall, Painting, Plumbing, Mechanical' });
job('J_GC_NOEL', { tradesSought: 'Drywall, Painting, Plumbing' });          /* a GC job with no electrical */
job('J_SCOPES', { tradesSought: '', tradeScopes: [{ trade: 'Electrical', scope: 'Panels and lighting' }] });
job('J_NOTRADES', { tradesSought: '' });                                    /* trades not listed yet */
job('J_ARRAY', { tradesSought: [{ trade: 'Sheetrock / Gypsum board' }] });  /* the portal's array form */
job('J_INV_EL', { tradesSought: 'Roofing' });                               /* no electrical, but the electrician is invited */
job('J_BID_EL', { tradesSought: 'Roofing' });                               /* no electrical, but the electrician already bid */
job('J_PRIV', { tradesSought: 'Electrical', visibility: 'private' });       /* private, not invited */
putRow('invites', 'i1', { id: 'i1', jobId: 'J_INV_EL', email: 'el@sub.test', token: 't1', createdAt: now }, { job_id: 'J_INV_EL', email: 'el@sub.test' });
putRow('bids', 'b1', { id: 'b1', jobId: 'J_BID_EL', userId: 'u_el', userEmail: 'el@sub.test', amount: 1000 }, { job_id: 'J_BID_EL', user_id: 'u_el' });
const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer ' + tok, 'x-nf-client-connection-ip': '10.9.' + Math.floor(Math.random() * 200) + '.1' }, body: JSON.stringify(body) }); return { code: r.statusCode, b: JSON.parse(r.body) }; };
const seen = async tok => { const r = await call(tok, { action: 'load', keys: ['jobs'] }); return ((r.b.data || {}).jobs || []).map(j => j.id).sort(); };

const el = await seen('tk-u_el'), dw = await seen('tk-u_dw'), hv = await seen('tk-u_hv'), none = await seen('tk-u_none'), own = await seen('tk-owner');
ok('1 electrician sees the GC job that has electrical', el.includes('J_GC_ALL'), el);
ok('2 electrician does NOT see the GC job with no electrical', !el.includes('J_GC_NOEL'), el);
ok('3 a trade only in the trade scopes counts (electrician sees J_SCOPES)', el.includes('J_SCOPES'), el);
ok('4 a job with no trades listed yet shows to everyone', el.includes('J_NOTRADES') && dw.includes('J_NOTRADES') && hv.includes('J_NOTRADES'), { el, dw, hv });
ok('5 invited → shown even when the trade is not on the job', el.includes('J_INV_EL'), el);
ok('6 already bid → still shown', el.includes('J_BID_EL'), el);
ok('7 a private job they were not invited to stays hidden', !el.includes('J_PRIV'), el);
ok('8 drywall sub: sees drywall jobs, not the electrical-only one, not the roofing ones', dw.includes('J_GC_ALL') && dw.includes('J_GC_NOEL') && !dw.includes('J_SCOPES') && !dw.includes('J_INV_EL'), dw);
ok('9 loose names: "Drywall" matches "Sheetrock / Gypsum board"', dw.includes('J_ARRAY'), dw);
ok('10 "HVAC" matches "Mechanical"', hv.includes('J_GC_ALL') && !hv.includes('J_GC_NOEL'), hv);
ok('11 a sub with no trades on their profile still sees every public job', ['J_GC_ALL', 'J_GC_NOEL', 'J_SCOPES', 'J_NOTRADES', 'J_ARRAY', 'J_INV_EL', 'J_BID_EL'].every(x => none.includes(x)), none);
ok('12 GrayCo staff still see every job', own.includes('J_GC_NOEL') && own.includes('J_PRIV'), own);
/* the profile decides: the electrician adds Drywall → the no-electrical GC job shows */
putRow('users', 'u_el', { id: 'u_el', role: 'sub', approved: true, email: 'el@sub.test', name: 'Volt', company: 'Volt Electric LLC', trades: ['Electrical', 'Drywall'], authUserId: 'auth-u_el' }, { user_id: 'u_el', email: 'el@sub.test' });
const el2 = await seen('tk-u_el');
ok('13 a trade added on their profile shows its jobs at once', el2.includes('J_GC_NOEL'), el2);
const H = require(path.join(BUILD, 'netlify/functions/subportal.js'))._hub;
ok('14 _hub.tradeFit is shared with the sub portal\'s Jobs to bid', typeof H.tradeFit === 'function' && H.tradeFit({ tradesSought: 'Plumbing' }, { trades: ['Electrical'] }) === false && H.tradeFit({ tradesSought: 'Electrical Service' }, { trades: ['electrician'] }) === true);
const n = R.filter(Boolean).length; console.log('TRADEVIS ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
