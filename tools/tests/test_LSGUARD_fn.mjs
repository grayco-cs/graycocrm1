// test_LSGUARD_fn.mjs [build-dir] — patch LSGUARD in jsdom (no browser, nothing leaves): the guard script and the PERFREP
// script are taken from the built index.html and run on a fake 5 MB-limited localStorage (5,242,880 characters of names +
// values, the browsers' limit) filled to 5,242,855 like the ACCTGATE run. Checks: the screen save (grayco_view) and a 💵
// payment-match save succeed after the clean-up; only listed copies are removed (biggest / lowest tier first); protected
// keys are byte-for-byte untouched; a write that cannot be made to fit still throws as before; the view is held in memory +
// sessionStorage when nothing can be cleared; the event and the total use are in the performance report; ONE note per tab.
// jsdom: `npm i jsdom` anywhere on the module path, or JSDOM_DIR=<path to node_modules/jsdom>.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '../..'));
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); } };

let JSDOM;
for (const p of [process.env.JSDOM_DIR, 'jsdom', '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/jsdom'].filter(Boolean)) {
  try { ({ JSDOM } = require(p)); break; } catch (e) {}
}
if (!JSDOM) { console.error('jsdom not found (npm i jsdom, or JSDOM_DIR=…)'); process.exit(2); }

const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const grab = id => { const m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(html); return m && m[1]; };
const GUARD = grab('gc-patch-lsguard'), PERF = grab('gc-patch-perfrep');
ok(!!GUARD && GUARD.includes('__GC_PATCH_LSGUARD__'), 'index.html carries the guard script');
ok(html.indexOf('<script') === html.indexOf('<script id="gc-patch-lsguard">'), 'the guard is the FIRST script of the page (before anything writes storage)');
ok(!!PERF && PERF.includes('ls: lsUse()') && PERF.includes("'browser storage full: '"), 'PERFREP reports the events and the storage use');

const LIMIT = 5242880;
/* a page: fake 5 MB localStorage (Chrome's DOMException QuotaExceededError / code 22, or Firefox's NS_ERROR_DOM_QUOTA_REACHED) */
function page(kind = 'chrome', pre) {
  const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head></head><body></body></html>', { url: 'https://crm.grayco-cs.com/', runScripts: 'outside-only', storageQuota: 1e9 });
  const W = dom.window, P = W.Storage.prototype, realSet = P.setItem, nGet = P.getItem, nKey = P.key, LS = W.localStorage;
  const used = () => { let n = 0; for (let i = 0; i < LS.length; i++) { const k = nKey.call(LS, i); n += k.length + (nGet.call(LS, k) || '').length; } return n; };
  const err = (k) => { if (kind === 'firefox') { const e = new Error('Persistent storage maximum size reached'); e.name = 'NS_ERROR_DOM_QUOTA_REACHED'; e.code = 1014; return e; }
    return new W.DOMException("Failed to execute 'setItem' on 'Storage': Setting the value of '" + k + "' exceeded the quota.", 'QuotaExceededError'); };
  const fakeSet = function(k, v){
    if (this === LS) { k = String(k); v = String(v); const old = nGet.call(LS, k); if (used() - (old == null ? 0 : k.length + old.length) + k.length + v.length > LIMIT) throw err(k); }
    return realSet.call(this, k, v);
  };
  P.setItem = fakeSet;
  if (pre) pre(W);
  W.eval(GUARD);
  return { dom, W, LS, SS: W.sessionStorage, nGet: k => nGet.call(LS, k), nKey, fakeSet, used, keys: () => { const a = []; for (let i = 0; i < LS.length; i++) a.push(nKey.call(LS, i)); return a.sort(); } };
}

/* the real key sizes: gc_ests_v2 = the 10/16 data export's estimate list (2,766,264 chars; "2.7 MB" in ACCTGATE);
   the snapshot / backup copies at the sizes their code writes for the same export's lists (projects 78,355, invs 52,266,
   customers 40,030 …; gc_bak_* rolling copies of several versions, capped at 1 M); protected records / sign-in / queues / drafts; then a
   protected filler up to 5,242,855 used. */
const EVICTABLE = { gc_ests_v2: 2766264, gc_speedlog_v1: 9800, gc_ests_backup: 0,
  gc_snap_projects: 78420, gc_snap_invs: 52310, gc_snap_customers: 40080, gc_snap_gcAcctRegister: 35770, gc_snap_projectDocs: 32080, gc_snap_subs: 26700, gc_snap_vendors: 26700, gc_snap_expenses: 22400, gc_snap_leads: 12050,
  gc_bak_projects: 400000, gc_bak_invs: 260000, gc_bak_customers: 200000, gc_bak_subs: 130000, gc_bak_leads: 60000,
  gc_safenet_projects: 78355, gc_safenet_invoices: 52266, gc_safenet_customers: 40030, gc_safenet_subs: 26650, gc_safenet_vendors: 26650, gc_safenet_expenses: 22353,
  gc_projects_backup: 78355, gc_rates_v3: 41000, gc_matlog_v2: 18500 };
delete EVICTABLE.gc_ests_backup;   /* the builder writes its backup only under 2 M (1 M in saveEstDB): with a 2.77 M list it is not there */
const PROTECTED = { gc_auth_v1: 1850, gc_auth_last_active: 24, grayco_sb_url: 40, grayco_sb_key: 208, gc_qb_tokens: 1400, gc_cc_token: 64, gc_cc_token_backup: 64,
  gc_check_queue: 6200, gc_email_queue: 3100, gc_thankyou_queue: 900, gc_ldi_outbox_v1: 1200, grayco_dirty: 60, _voiceLeads: 400,
  gc_builder_slots: 52000, gc_est_recovery: 31000, gc_est_openbackup: 8200, gc_safenet_meta: 900, gc_doc_snap: 21000, gc_ldi_cache_v2: 64000,
  gc_office_tasks: 121000, gc_tombstones: 41000, gc_job_messages: 58000, gc_sub_approvals: 14000, gc_invoice_approvals: 12000, gc_expense_approvals: 9000,
  gc_deleted_estimates: 3000, gc_pending_qbmap: 2600, grayco_projects: 78355, grayco_customers: 40030, grayco_invs: 52266, grayco_subs: 26650 };
const content = (k, n) => { const head = '[{"k":"' + k + '","n":' + n + ',"d":"'; const tail = '"}]'; return n <= head.length + tail.length ? 'x'.repeat(n) : head + 'r'.repeat(n - head.length - tail.length) + tail; };
const valSize = (k, total) => total - k.length;

function fill(T, target, extra = {}) {
  const put = (k, n) => T.fakeSet.call(T.LS, k, content(k, valSize(k, n)));
  for (const [k, n] of Object.entries(EVICTABLE)) put(k, n);
  for (const [k, n] of Object.entries(PROTECTED)) put(k, n);
  for (const [k, v] of Object.entries(extra)) T.fakeSet.call(T.LS, k, v);
  const pad = target - T.used() - 'gc_jobfill_log'.length;
  if (pad > 0) T.fakeSet.call(T.LS, 'gc_jobfill_log', content('gc_jobfill_log', pad));
}
const snapAll = T => { const o = {}; T.keys().forEach(k => { o[k] = T.nGet(k); }); return o; };
const sameExcept = (a, b, skip) => Object.keys(a).filter(k => !skip.includes(k)).every(k => a[k] === b[k]);
const PM0 = [{ id: 'PM-1', invId: 'INVagt1', amt: 2750, status: 'new', at: '2026-11-02T15:00:00Z' }];
const PM1 = { id: 'PM-2', invId: 'INVagt3', amt: 1200, status: 'new', at: '2026-11-03T12:05:00Z', note: 'QuickBooks deposit 11/03' };

/* ══════════ 1. the ACCTGATE state: full, then the screen save and a 💵 save ══════════ */
const T = page('chrome');
T.W.eval(PERF);
T.W.__GC_AUTH__ = { email: () => 'office@grayco-cs.com' };   /* a signed-in office person */
T.LS.setItem('grayco_view', 'projects');
fill(T, 5242855, { gc_pay_matches: JSON.stringify(PM0) });
ok(T.used() === 5242855, 'storage filled to 5,242,855 of 5,242,880 characters', T.used());
const pmList = PM0.concat([PM1]);
let threw = null; try { T.fakeSet.call(T.LS, 'gc_pay_matches', JSON.stringify(pmList)); } catch (e) { threw = e; }
ok(threw && threw.name === 'QuotaExceededError' && threw.code === 22, 'without the guard the 💵 save throws QuotaExceededError (the bug)', threw && threw.name);
const before = snapAll(T);

/* a. the 💵 payment-match save */
threw = null; try { T.LS.setItem('gc_pay_matches', JSON.stringify(pmList)); } catch (e) { threw = e; }
const st1 = T.W._gcLsGuard.state();
const pmBack = JSON.parse(T.nGet('gc_pay_matches') || '[]');
ok(!threw && pmBack.length === 2 && pmBack[1].id === 'PM-2' && pmBack[1].amt === 1200, 'with the guard: the 💵 payment-match save succeeds (2 matches stored in localStorage)', pmBack.map(m => m.id));
ok(st1.count === 1 && JSON.stringify(st1.events[0].evicted) === '["gc_ests_v2"]' && st1.events[0].ok === true, 'exactly one copy removed: the biggest tier-1 mirror gc_ests_v2', st1.events[0]);
ok(st1.events[0].key === 'gc_pay_matches' && st1.events[0].freed === EVICTABLE.gc_ests_v2 && st1.events[0].size === 'gc_pay_matches'.length + JSON.stringify(pmList).length, 'the event has key, size and characters freed', st1.events[0]);
let after = snapAll(T);
ok(Object.keys(PROTECTED).concat(['grayco_view', 'gc_jobfill_log', 'gc_adm_device_id']).every(k => after[k] === before[k]), 'every protected key is byte-for-byte untouched (' + (Object.keys(PROTECTED).length + 3) + ' keys)');
ok(sameExcept(before, after, ['gc_ests_v2', 'gc_pay_matches']), 'nothing else changed (tier 2 / 3 copies still there)');
const toast = T.W.document.getElementById('gc-lsg-toast');
ok(!!toast && toast.textContent === "This computer's storage was full \u2014 cleared old cached copies.", 'the quiet note is shown to the signed-in person', toast && toast.textContent);
ok(T.SS.getItem('gc_lsg_toast') === '1', 'note marked shown for this tab (sessionStorage)');

/* b. the estimate heal writes the mirror back and other writes take the last characters (full to the last one); then the screen save */
const room = LIMIT - T.used() - 'gc_ests_v2'.length;
T.LS.setItem('gc_ests_v2', content('gc_ests_v2', room));
ok(T.nGet('gc_ests_v2') != null && T.used() === LIMIT, 'the estimate heal puts the mirror back (full again: ' + T.used() + ')');
toast.remove();
threw = null; try { T.fakeSet.call(T.LS, 'grayco_view', 'approvals'); } catch (e) { threw = e; }
ok(threw && threw.name === 'QuotaExceededError', 'without the guard the screen save (projects → approvals) throws: Approvals would not open (the bug)');
const b2 = snapAll(T);
threw = null; try { T.LS.setItem('grayco_view', 'approvals'); } catch (e) { threw = e; }
ok(!threw, 'with the guard: the screen save does not throw', threw && threw.message);
ok(T.LS.getItem('grayco_view') === 'approvals' && T.nGet('grayco_view') === 'approvals', 'the page reads "approvals" back, and it IS in localStorage', T.nGet('grayco_view'));
ok(T.nGet('gc_ests_v2') == null && T.W._gcLsGuard.state().events[1].evicted.join() === 'gc_ests_v2' && sameExcept(b2, snapAll(T), ['gc_ests_v2', 'grayco_view']), 'again only gc_ests_v2 was removed');
ok(!T.W.document.getElementById('gc-lsg-toast'), 'ONE note per tab: the second clean-up shows none');

/* the performance report */
const rep = T.W._gcPerfRep.report();
const eV = rep.err['browser storage full: grayco_view'], eP = rep.err['browser storage full: gc_pay_matches'];
ok(eV && eV.n === 1 && eV.key === 'grayco_view' && eV.size === 20 && eV.freed === room + 'gc_ests_v2'.length && eV.evicted === 'gc_ests_v2' && eV.ok === true, 'perf report "err": the screen-save event (key, size, freed, removed)', eV);
ok(eP && eP.ok === true && eP.size === st1.events[0].size && eP.freed === EVICTABLE.gc_ests_v2 && eP.evicted === 'gc_ests_v2', 'perf report "err": the 💵 event', eP);
ok(rep.ls && rep.ls.chars === T.used() && rep.ls.keys === T.keys().length && Array.isArray(rep.ls.top) && rep.ls.top[0][0] === 'gc_bak_projects', 'perf report "ls": total localStorage use in characters (' + (rep.ls && rep.ls.chars) + ') + the biggest names', rep.ls);
ok(!JSON.stringify(rep.err).includes('INVagt') && !JSON.stringify(rep.ls).includes('rrrr'), 'the report carries names and sizes only, no stored data');

/* ══════════ 2. tiers: a mirror cannot push out a backup; a backup can push out a mirror; protected never ══════════ */
const refill = () => T.LS.setItem('gc_ests_v2', content('gc_ests_v2', LIMIT - T.used() - 'gc_ests_v2'.length));
refill();
let s0 = snapAll(T);
threw = null; try { T.LS.setItem('gc_ests_v2', T.nGet('gc_ests_v2') + 'x'.repeat(5000)); } catch (e) { threw = e; }
ok(threw && threw.name === 'QuotaExceededError' && sameExcept(s0, snapAll(T), []), 'a bigger tier-1 mirror that does not fit: nothing removed, it throws as before', threw && threw.name);
threw = null; try { T.LS.setItem('gc_snap_projects', content('gc_snap_projects', valSize('gc_snap_projects', EVICTABLE.gc_snap_projects + 3000))); } catch (e) { threw = e; }
let ev = T.W._gcLsGuard.state().events.slice(-1)[0];
ok(!threw && ev.evicted.join() === 'gc_ests_v2' && sameExcept(s0, snapAll(T), ['gc_ests_v2', 'gc_snap_projects']), 'a tier-2 snapshot write removes only the tier-1 mirror', ev);

/* removal order when tier 1 is not enough: tier 1, then tier 2 biggest first — and never more than needed */
refill();
s0 = snapAll(T);
threw = null; try { T.LS.setItem('gc_import_tmp', 'i'.repeat(3100000)); } catch (e) { threw = e; }
ev = T.W._gcLsGuard.state().events.slice(-1)[0];
ok(!threw && ev.evicted.join() === 'gc_ests_v2,gc_speedlog_v1,gc_bak_projects' && ev.ok, 'a 3.1 M protected write: tier 1 (both, biggest first), then the biggest tier-2 copy — stops as soon as it fits', ev.evicted);
ok(Object.keys(PROTECTED).every(k => T.nGet(k) === s0[k]), 'protected keys still untouched');
T.LS.removeItem('gc_import_tmp');

/* a write that cannot fit even with every listed copy gone: nothing removed, throws as before */
s0 = snapAll(T);
threw = null; try { T.LS.setItem('gc_import_tmp', 'i'.repeat(5000000)); } catch (e) { threw = e; }
ok(threw && threw.name === 'QuotaExceededError' && sameExcept(s0, snapAll(T), []), 'too big to ever fit: nothing removed, QuotaExceededError thrown as before');
ok(T.W._gcPerfRep.report().err['browser storage full: gc_import_tmp (not saved)'], 'the refused write is in the report too');

/* ══════════ 3. nothing left to clear: the screen is held in memory + sessionStorage ══════════ */
Object.keys(EVICTABLE).concat(['gc_bak_projects']).forEach(k => T.W.Storage.prototype.removeItem.call(T.LS, k));
const pad2 = LIMIT - 1 - T.used() - 'gc_note_big'.length; T.fakeSet.call(T.LS, 'gc_note_big', 'n'.repeat(pad2));
ok(T.keys().every(k => T.W._gcLsGuard.tierOf(k) === 0), 'now only protected keys are left, storage full (' + T.used() + ')');
threw = null; try { T.LS.setItem('grayco_view', 'maintenance'); } catch (e) { threw = e; }
ok(!threw && T.LS.getItem('grayco_view') === 'maintenance' && T.nGet('grayco_view') === 'approvals', 'the screen save does not throw; the page reads "maintenance" from memory (localStorage still has the old one)');
const ssv = JSON.parse(T.SS.getItem('gc_lsg_view') || '{}');
ok(ssv.v === 'maintenance' && ssv.ok === false && T.W._gcLsGuard.state().viewHeld === 1, 'and keeps it in sessionStorage for this tab', ssv);
threw = null; try { T.LS.setItem('gc_office_tasks', content('gc_office_tasks', PROTECTED.gc_office_tasks + 100)); } catch (e) { threw = e; }
ok(threw && threw.name === 'QuotaExceededError' && T.nGet('gc_office_tasks') === before.gc_office_tasks, 'any other refused write still throws as before (unchanged behaviour)');
T.SS.setItem('x_ss', 'fine'); ok(T.SS.getItem('x_ss') === 'fine', 'sessionStorage is not touched by the guard');

/* ══════════ 4. a reload in the same tab, and Firefox ══════════ */
const R = page('chrome', W => { W.localStorage.setItem('grayco_view', 'approvals'); W.sessionStorage.setItem('gc_lsg_view', JSON.stringify({ v: 'projects', ok: false, at: 1 })); });
ok(R.LS.getItem('grayco_view') === 'projects', 'reload: the screen localStorage refused comes back from sessionStorage');
R.LS.setItem('grayco_view', 'jobs');
ok(R.LS.getItem('grayco_view') === 'jobs' && R.nGet('grayco_view') === 'jobs' && JSON.parse(R.SS.getItem('gc_lsg_view')).ok === true, 'a later save that fits goes to localStorage as usual');
R.LS.removeItem('grayco_view'); ok(R.LS.getItem('grayco_view') === null, 'removeItem clears the remembered screen');
const R2 = page('chrome', W => { W.localStorage.setItem('grayco_view', 'approvals'); W.sessionStorage.setItem('gc_lsg_view', JSON.stringify({ v: 'projects', ok: true, at: 1 })); });
ok(R2.LS.getItem('grayco_view') === 'approvals', 'reload after a save that worked: localStorage is used (no change)');

const F = page('firefox');
F.LS.setItem('grayco_view', 'dashboard'); fill(F, 5242855, { gc_pay_matches: JSON.stringify(PM0) });
threw = null; try { F.fakeSet.call(F.LS, 'gc_pay_matches', JSON.stringify(PM0.concat([PM1]))); } catch (e) { threw = e; }
ok(threw && threw.name === 'NS_ERROR_DOM_QUOTA_REACHED', 'Firefox-style error without the guard', threw && threw.name);
threw = null; try { F.LS.setItem('gc_pay_matches', JSON.stringify(PM0.concat([PM1]))); } catch (e) { threw = e; }
ok(!threw && JSON.parse(F.nGet('gc_pay_matches')).length === 2 && F.nGet('gc_ests_v2') == null, 'Firefox (NS_ERROR_DOM_QUOTA_REACHED / 1014): the 💵 save succeeds after the clean-up');
ok(!F.W.document.getElementById('gc-lsg-toast') && F.W._gcLsGuard.state().count === 1, 'not signed in: no note (it waits for a sign-in)');

/* ══════════ 5. the allow-list ══════════ */
const tierOf = T.W._gcLsGuard.tierOf;
const expect = { gc_ests_v2: 1, gc_speedlog_v1: 1, gc_ests_backup: 2, gc_snap_estimates: 2, gc_bak_projects: 2, gc_safenet_projects: 2, gc_projects_backup: 2, gc_sched_backup: 2, gc_rates_v3: 3, gc_matlog_v2: 3,
  gc_safenet_meta: 0, gc_auth_v1: 0, grayco_sb_key: 0, gc_qb_tokens: 0, gc_cc_token_backup: 0, gc_pay_matches: 0, gc_check_queue: 0, gc_email_queue: 0, gc_ldi_outbox_v1: 0, grayco_dirty: 0,
  gc_builder_slots: 0, gc_est_recovery: 0, gc_est_openbackup: 0, gc_draft_x: 0, gc_office_tasks: 0, gc_tombstones: 0, gc_doc_snap: 0, grayco_view: 0, grayco_projects: 0,
  __est__gc_rates_v3: 0, __est__gc_ests_v2: 0, gc_snap_: 0, gc_bak_x_1: 0, gc_ests_v2_old: 0, gc_perfrep_off: 0, gc_ldi_cache_v2: 0 };
const wrong = Object.entries(expect).filter(([k, t]) => tierOf(k) !== t).map(([k, t]) => k + ' ' + tierOf(k) + '≠' + t);
ok(!wrong.length, 'allow-list: ' + Object.values(expect).filter(Boolean).length + ' kinds removable, everything else protected', wrong);

/* ══════════ 6. the patch is idempotent ══════════ */
const out = execFileSync('python3', [path.join(BUILD, 'tools/patch_LSGUARD.py'), path.join(BUILD, 'index.html')]).toString().trim();
ok(out === 'already patched', 'patch_LSGUARD.py on the patched page: "already patched"', out);

console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
