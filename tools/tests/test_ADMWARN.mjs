// test_ADMWARN.mjs <build-dir> — patch ADMWARN on the real-data mirror, in the offline harness (run under browser_lock.sh):
//  • ✕ on "… both use office@…" stays after a reload; "✓ That's right — leave it" stays after a reload (gc_kv gc_adm_accept);
//  • "Steven Biffle " (the cloud's copy, and again from a sync as another computer would send it): the name is "Steven Biffle"
//    on the screen, after an edit, a reload and a sync; no "extra spaces" card; what is saved is trimmed.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const build = path.resolve(process.argv[2] || '.');
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const EMAIL = 'wjohnson@grayco-cs.com', SID = 'Ub5608wjnv2t', OFFICE = 'office@grayco-cs.com';
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const H = await import(pathToFileURL(HARNESS).href);
const val = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
H.resetCloud(); rows.forEach(r => { if (!/^gc_cc_token/.test(r.key)) H.cset(r.key, r.v); });
const users0 = val(rows.find(r => r.key === 'users').v);
ok(users0.find(u => u.id === SID).name === 'Steven Biffle ', 'mirror: the cloud has “Steven Biffle ” (trailing space)');

const A = await H.computer('A', { build });
await A.ctx.route(u => /\/\.netlify\/functions\//.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
async function ready(){
  await H.waitFor(A, () => (window._crm && (window._crm.users || []).length > 3 && (window._crm.projects || []).length > 20 && window._gcAdmDismiss && window._gcAdmAccept && typeof window._gcAdmPaintTop === 'function') || null, null, 120000, 500);
  await A.ev(() => { try { window._gcRA && window._gcRA.hide(); } catch (e) {} window._setView('admin'); });
  await H.waitFor(A, () => { const t = document.getElementById('gc-adm-top'); return t && t.querySelector('.gc-adm-roles') && window._gcAdmDismiss.state().pulledAt > 0 && window._gcAdmAccept.state().pulledAt > 0 ? true : null; }, null, 60000, 400);
  await H.sleep(2000); await A.ev(() => window._gcAdmPaintTop()); await H.sleep(400);
}
async function reload(){ await A.page().reload(); await H.sleep(3000); if (await A.page().locator('#gc-auth-email').count() && await A.page().locator('#gc-auth-email').isVisible()) await H.signIn(A, EMAIL, 9000); await ready(); }
const cards = () => A.ev(() => [...document.querySelectorAll('#gc-adm-warns .gc-adm-warn')].map(el => ({ id: el.getAttribute('data-adm-warn'), text: el.textContent, btns: [...el.querySelectorAll('button')].map(b => b.textContent.trim()) })));
const clickIn = (id, label) => A.ev(([id, label]) => { const el = document.querySelector('#gc-adm-warns [data-adm-warn="' + id + '"]'); const b = el && [...el.querySelectorAll('button')].find(x => x.textContent.trim().indexOf(label) === 0); if (b) b.click(); return !!b; }, [id, label]);
const steven = () => A.ev(sid => { const u = (window._crm.users || []).find(x => x.id === sid); return u ? u.name : null; }, SID);
const noSpaces = c => !c.some(x => x.id === 'name-spaces');
try {
  console.log('== sign in → ⚙ Admin'); await H.signIn(A, EMAIL, 9000); await ready();
  let c = await cards(); const dup = c.find(x => x.id === 'dup-email');
  ok(dup && /Brittany Pucket and Office both use office@grayco-cs\.com|Office and Brittany Pucket both use office@grayco-cs\.com/.test(dup.text), 'the red card: Brittany Pucket and Office both use office@', dup && dup.text.slice(0, 90));
  ok(dup && dup.btns.indexOf('Edit Brittany') >= 0 && dup.btns.indexOf('✓ That’s right — leave it') >= 0 && dup.btns.indexOf('✕') >= 0, 'its buttons keep “Edit Brittany” and add “✓ That’s right — leave it”', dup && dup.btns);
  ok(await steven() === 'Steven Biffle' && noSpaces(c), 'loaded: “Steven Biffle” (trimmed on load), no “extra spaces” card', { name: await steven(), cards: c.map(x => x.id) });

  console.log('== ✕ persists after a reload');
  ok(await clickIn('dup-email', '✕'), '✕ on the red card'); await H.sleep(5000);
  await reload(); await H.sleep(50000); await A.ev(() => window._gcAdmPaintTop()); c = await cards();
  ok(!c.some(x => x.id === 'dup-email'), 'after a reload (+50 s): still gone', c.map(x => x.id));
  await A.ev(o => window._gcAdmDismiss.restore('dup-email:' + o), OFFICE); await H.sleep(800); c = await cards();
  ok(c.some(x => x.id === 'dup-email'), '“Show again” brings it back (for the accept test)');

  console.log('== ✓ That’s right — leave it');
  ok(await clickIn('dup-email', '✓ That’s right'), 'click “✓ That’s right — leave it”'); await H.sleep(600);
  ok(!(await cards()).some(x => x.id === 'dup-email'), 'gone at once');
  let acc = null; for (let i = 0; i < 30 && !acc; i++) { await H.sleep(500); const v = val(H.cget('gc_adm_accept')); acc = v && v.pairs && v.pairs[OFFICE]; }
  ok(acc && acc.k === 'brittany pucket|office' && acc.by === EMAIL, 'saved in the cloud: gc_kv gc_adm_accept {email, names}', acc);
  await A.ev(() => { localStorage.removeItem('gc_adm_accept_local'); localStorage.removeItem('gc_adm_dismiss_local'); });   /* the cloud alone (another computer) */
  await reload(); c = await cards();
  ok(!c.some(x => x.id === 'dup-email'), 'after a reload (from the cloud): still gone', c.map(x => x.id));
  ok(await A.ev(() => window._gcAdmAccept.has('office@grayco-cs.com', ['Office', 'Brittany Pucket']) && !window._gcAdmAccept.has('office@grayco-cs.com', ['Office', 'Brittany Pucket', 'Nick Thomas'])), 'the same pair stays accepted; a different pair would warn again');

  console.log('== the name: edit, reload, sync');
  await A.ev(sid => { const old = window._crm.users.find(x => x.id === sid), ne = { name: 'Steven Biffle' }; window._gcOnUserRenamed(old, ne);
    const next = window._crm.users.map(u => u.id === sid ? Object.assign({}, u, ne) : u); window._crm.users = next; window._gcUsersRaw(next); window._supaUpsert('users', next); }, SID);
  await H.sleep(6000);
  const cl = () => (val(H.cget('users')) || []).find(u => u.id === SID);
  ok(cl() && cl().name === 'Steven Biffle', 'the edit is saved trimmed to the cloud', cl() && cl().name);
  await reload(); c = await cards();
  ok(await steven() === 'Steven Biffle' && noSpaces(c), 'after a reload: “Steven Biffle”, no card', { name: await steven(), cards: c.map(x => x.id) });
  /* a sync: another computer still holding “Steven Biffle ” writes the list, stamped newer */
  await A.ev(sid => { const st = new Date(Date.now() + 60000).toISOString(); const stale = window._crm.users.map(u => u.id === sid ? Object.assign({}, u, { name: 'Steven Biffle ', updatedAt: st }) : u);
    const u = (localStorage.getItem('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k = localStorage.getItem('grayco_sb_key');
    return fetch(u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'users', value: stale, updated_at: new Date().toISOString() }) }).then(r => r.status); }, SID);
  H.cset('users', val(H.cget('users')).map(u => u.id === SID ? Object.assign({}, u, { name: 'Steven Biffle ' }) : u));
  await A.ev(() => { try { if (window._gcPullChanged) window._gcPullChanged(); else if (window._gcPullNow) window._gcPullNow(true); } catch (e) {} });
  await H.sleep(15000); await A.ev(() => window._gcAdmPaintTop()); c = await cards();
  ok(await steven() === 'Steven Biffle' && noSpaces(c), 'after a sync bringing “Steven Biffle ” back: still “Steven Biffle”, no card', { name: await steven(), cards: c.map(x => x.id) });
  await reload(); c = await cards();
  ok(await steven() === 'Steven Biffle' && noSpaces(c), 'and after another reload', { name: await steven(), cards: c.map(x => x.id) });
  const saved = await A.ev(() => window._gcCleanList('users', [{ name: ' Steven  Biffle ' }])[0].name);
  ok(saved === 'Steven Biffle', 'the save path trims (“ Steven  Biffle ” → “Steven Biffle”)', saved);
  const errs = A.errs.filter(e => /ADMWARN|gcAdmAccept|_gcCleanList/.test(e));
  ok(!errs.length, 'no page errors from the patch', errs);
} finally { try { await A.b.close(); } catch (e) {} }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
