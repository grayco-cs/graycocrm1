// test_STORECUT.mjs [index.html] — the STORECUT fetch layer on its own (no browser): one estimates store, shared reads,
// a hidden tab that does not repeat itself; plus the patch is in the page exactly once and is idempotent.
//   node tools/tests/test_STORECUT.mjs index.html
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { execFileSync } from 'child_process'; import os from 'os';
const here = path.dirname(new URL(import.meta.url).pathname);
const html = process.argv[2] || path.join(here, '..', '..', 'index.html');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? ' ' + JSON.stringify(i) : '')); } };
const src = fs.readFileSync(html, 'utf8');
ok(src.split('__GC_PATCH_STORECUT__').length - 1 >= 2 && (src.match(/<script id="gc-patch-storecut">/g) || []).length === 1, 'early script in the page once');
ok((src.match(/<script id="gc-patch-storecut-tools">/g) || []).length === 1, 'tools script in the page once');
ok(src.indexOf('<script id="gc-patch-stuckfix">') < src.indexOf('<script id="gc-patch-storecut">'), 'right after STUCKFIX (STUCKFIX stays the innermost fetch)');
{ const tmp = path.join(os.tmpdir(), 'storecut_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, src);
  const out = execFileSync('python3', [path.join(here, '..', 'patch_STORECUT.py'), tmp]).toString(); ok(/already patched/.test(out) && fs.readFileSync(tmp, 'utf8') === src, 'patch is idempotent'); fs.unlinkSync(tmp); }
const code = fs.readFileSync(path.join(here, '..', 'storecut_early.js'), 'utf8');
ok(src.includes(code.trim().split('\n').slice(4, 12).join('\n')), 'page carries tools/storecut_early.js');

const SB = 'https://x.supabase.co';
function mk(){
  const calls = []; const rows = { estimates: [{ id: 'E1', name: 'one' }, { id: 'E2', name: 'two' }], big: [{ id: 'B', pad: 'x'.repeat(80000) }] }; const stamps = { estimates: 't', big: 't1' };
  let delay = 0;
  const native = async (input, init) => {
    const u = typeof input === 'string' ? input : input.url; const m = ((init && init.method) || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    calls.push({ u, m, body: init && init.body });
    if (delay) await new Promise(r => setTimeout(r, delay));
    if (m !== 'GET') return new Response('[]', { status: 201 });
    const k = /key=eq\.([^&]+)/.exec(u);
    if (k) { const kk = decodeURIComponent(k[1]); const st = /select=key,updated_at/.test(u); const sv = /select=value(&|$)/.test(u);
      const row = rows[kk] ? (st ? { key: kk, updated_at: stamps[kk] } : sv ? { value: rows[kk] } : { key: kk, value: rows[kk], updated_at: stamps[kk] }) : null;
      return new Response(JSON.stringify(row ? [row] : []), { status: 200, headers: { 'content-type': 'application/json' } }); }
    return new Response(JSON.stringify([{ key: 'a', updated_at: 't' }]), { status: 200, headers: { 'content-type': 'application/json', 'content-length': '30' } });
  };
  const doc = { visibilityState: 'visible', ls: [], addEventListener(ev, fn){ this.ls.push(fn); } };
  const store = {};
  const W = { fetch: native, setTimeout, console: { log(){}, warn(){} }, document: doc, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, Response, Request, Headers, Date, JSON, Promise, Map, Object, String, Array, Math };
  W.window = W; vm.createContext(W); vm.runInContext(code, W);
  const hide = (on, ago) => { doc.visibilityState = on ? 'hidden' : 'visible'; doc.ls.forEach(f => f()); if (on && ago) { /* pretend it has been hidden a while */ const st = W._gcStoreCut.state(); } };
  return { W, calls, rows, stamps, doc, hide, setDelay: d => { delay = d; } };
}
const H = { headers: { apikey: 'k', Authorization: 'Bearer t' } };
// 1. writes of the builder copy never go out
{ const t = mk();
  const r1 = await t.W.fetch(SB + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: '__est__gc_ests_v2', value: '[]' }) });
  ok(r1.status === 201 && t.calls.length === 0, 'a builder-copy upload is answered "done" and not sent', t.calls);
  await t.W.fetch(SB + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify([{ key: 'estimates', value: [1] }, { key: '__est__gc_ests_v2', value: '[1]' }]) });
  const b = JSON.parse(t.calls[0].body); ok(t.calls.length === 1 && b.length === 1 && b[0].key === 'estimates', 'a mixed upload goes out without the builder copy', b);
  await t.W.fetch(SB + '/rest/v1/gc_kv?key=eq.__est__gc_ests_v2', { method: 'PATCH', body: '{}' }); ok(t.calls.length === 1, 'a PATCH of the builder copy is not sent');
  t.W._gcStoreCut.allow('__est__gc_ests_v2', true); await t.W.fetch(SB + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: '__est__gc_ests_v2', value: '[]' }) }); t.W._gcStoreCut.allow('__est__gc_ests_v2', false);
  ok(t.calls.length === 2, 'the admin clean-up can empty it (allow)');
  await t.W.fetch(SB + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'projects', value: [] }) }); ok(t.calls.length === 3, 'other uploads untouched');
}
// 2. reads
{ const t = mk();
  const r = await t.W.fetch(SB + '/rest/v1/gc_kv?key=eq.__est__gc_ests_v2&select=value,updated_at', H); const j = await r.json();
  ok(/key=eq\.estimates/.test(t.calls[0].u) && j[0].key === '__est__gc_ests_v2' && typeof j[0].value === 'string' && JSON.parse(j[0].value).length === 2, 'a named read of the builder copy is answered from "estimates" as JSON text', j);
  await t.W.fetch(SB + '/rest/v1/gc_kv?select=key,value,updated_at', H); ok(/key=not\.eq\.__est__gc_ests_v2/.test(t.calls[1].u), 'a bulk read leaves the builder copy out', t.calls[1].u);
  await t.W.fetch(SB + '/rest/v1/gc_kv?key=in.(%22projects%22,%22__est__gc_ests_v2%22)&select=key,updated_at', H); ok(/key=not\.eq\.__est__gc_ests_v2/.test(t.calls[2].u), 'a key list naming it leaves it out');
  await t.W.fetch(SB + '/rest/v1/gc_kv?key=in.(%22projects%22)&select=key,updated_at', H); ok(!/not\.eq/.test(t.calls[3].u), 'a key list without it is unchanged');
  await t.W.fetch(SB + '/rest/v1/gc_kv?key=eq.projects&select=value', H); ok(!/not\.eq/.test(t.calls[4].u), 'a named read of another key is unchanged');
}
// 3. identical reads in flight share one download
{ const t = mk(); t.setDelay(50);
  const u = SB + '/rest/v1/gc_kv?key=in.(%22a%22)&select=key,updated_at';
  const rs = await Promise.all([t.W.fetch(u, H), t.W.fetch(u, H), t.W.fetch(u, H)]); const bodies = await Promise.all(rs.map(r => r.json()));
  ok(t.calls.length === 1 && bodies.every(b => b[0].key === 'a'), 'three identical reads at once: one download, three answers', t.calls.length);
  await t.W.fetch(u, { headers: { apikey: 'k', Authorization: 'Bearer OTHER' } }); ok(t.calls.length === 2, 'a read with another sign-in is not shared');
  await t.W.fetch(u, H); ok(t.calls.length === 3, 'visible tab: a later repeat goes out');
}
// 4. hidden tab
{ const t = mk(); const u = SB + '/rest/v1/gc_kv?key=in.(%22a%22)&select=key,updated_at';
  t.hide(true); const realNow = Date.now; t.W.Date = { now: () => realNow() + 60e3 }; vm.runInContext('Date = window.Date', t.W);
  await t.W.fetch(u, H); await t.W.fetch(u, H); await t.W.fetch(u, H);
  ok(t.calls.length === 1 && t.W._gcStoreCut.state().hiddenServed === 2, 'hidden > 30 s: the same change check within 5 min is answered from memory', t.W._gcStoreCut.state());
  await t.W.fetch(SB + '/rest/v1/gc_kv?updated_at=gt.2026&select=key,value,updated_at', H); await t.W.fetch(SB + '/rest/v1/gc_kv?updated_at=gt.2026&select=key,value,updated_at', H);
  ok(t.calls.length === 3, 'a "changed since" read is never answered from memory');
  await t.W.fetch(SB + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'projects', value: [] }) });
  await t.W.fetch(u, H); ok(t.calls.length === 5, 'after a write the next read goes out');
  t.hide(false); await t.W.fetch(u, H); ok(t.calls.length === 6, 'visible again: fresh');
  await t.W.fetch(SB + '/auth/v1/user', H); await t.W.fetch(SB + '/auth/v1/user', H); ok(t.calls.length === 8, 'auth reads are never shared or remembered');
}
// 5. a big row downloads again only when its time stamp moved
{ const t = mk(); const u = SB + '/rest/v1/gc_kv?key=eq.big&select=key,value,updated_at';
  const a = await (await t.W.fetch(u, H)).json(); ok(a[0].value[0].pad.length === 80000 && t.calls.length === 1, 'first big read downloads');
  const b = await (await t.W.fetch(u, H)).json(); ok(b[0].value[0].pad.length === 80000 && t.calls.length === 2 && /select=key,updated_at/.test(t.calls[1].u), 'repeat: only the stamps go out, same answer', t.calls.map(c => c.u.slice(-40)));
  t.stamps.big = 't2'; t.rows.big = [{ id: 'B', pad: 'y'.repeat(80000) }];
  const c = await (await t.W.fetch(u, H)).json(); ok(c[0].value[0].pad[0] === 'y' && t.calls.length === 4, 'stamp moved: downloads the new value');
  await t.W.fetch(SB + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'big', value: [] }) });
  await t.W.fetch(u, H); ok(t.calls.length === 6 && !/select=key,updated_at/.test(t.calls[5].u), 'after this page writes the key: full download', t.calls.slice(4).map(c => c.u.slice(-40)));
  const sv = SB + '/rest/v1/gc_kv?key=eq.big&select=value';
  await t.W.fetch(sv, H); const n0 = t.calls.length; const d = await (await t.W.fetch(sv, H)).json(); const n1 = t.calls.length; const e = await (await t.W.fetch(sv, H)).json();
  ok(d[0].value[0].pad.length === 80000 && e[0].value[0].pad.length === 80000 && t.calls.length - n1 === 1 && /select=key,updated_at/.test(t.calls[t.calls.length - 1].u), 'select=value only: stamps asked before the download, then repeats are stamps only', t.calls.slice(n0 - 1).map(c => c.u.slice(-40)));
  await t.W.fetch(SB + '/rest/v1/gc_kv?key=eq.estimates&select=key,value,updated_at', H); await t.W.fetch(SB + '/rest/v1/gc_kv?key=eq.estimates&select=key,value,updated_at', H);
  ok(!/select=key,updated_at/.test(t.calls[t.calls.length - 1].u), 'a small row is not kept (no extra request)');
  ok(t.W._gcStoreCut.state().bigReadsUnchanged >= 2, 'state counts the reads that stayed home', t.W._gcStoreCut.state()); }
// 6. kill switch
{ const W = { fetch: async () => new Response('[]', { status: 201 }), setTimeout, console: { log(){} }, document: { visibilityState: 'visible', addEventListener(){} }, localStorage: { getItem: k => k === 'gc_storecut_off' ? '1' : null }, Response, Request, Headers };
  W.window = W; const f0 = W.fetch; vm.createContext(W); vm.runInContext(code, W); ok(W.fetch === f0 && !W._gcStoreCut, 'kill switch gc_storecut_off = 1 leaves fetch alone'); }
console.log('RESULT ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
